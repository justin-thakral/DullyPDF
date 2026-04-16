"""Type definitions for the canonical group schema service.

The canonical group schema is the deduped union of fields across every template
in a template group. It powers Phase 2 / 3 / 4 of the group-fill migration:
Search & Fill from files, Fill By Link group mode, and API Fill group endpoints.

These types are kept in their own module so they can be imported from both the
service implementation and the unit tests without pulling in the heavier
fill-link service surface.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, TypedDict


CanonicalFieldType = Literal[
    "text",
    "date",
    "checkbox",
    "radio_group",
    "signature",
    "number",
]
"""Canonical type vocabulary used by the group schema.

Mapping from the existing fill-link question types:

- ``text`` covers ``text``, ``textarea``, ``email``, ``phone`` (subtype info is
  preserved on the JSON Schema property as ``format`` when relevant).
- ``date`` is the ``date`` fill-link question type.
- ``checkbox`` is the boolean form (``boolean``/``checkbox`` fill-link types).
- ``radio_group`` covers ``radio``, ``select``, ``multi_select`` — anything with
  an enumerated option list.
- ``signature`` is reserved for explicit signature widgets (these are stripped
  from the fill-link respondent form today, so they only appear in the canonical
  schema when callers feed signature fields directly).
- ``number`` is reserved for numeric fields and currently unused by the
  fill-link pipeline; it lets the API Fill JSON schema be type-precise.
"""


GroupSchemaWarningCode = Literal[
    "type_conflict_soft",
    "label_divergence",
    "low_confidence_merge",
    "orphan_field",
    "missing_field_name",
]


GroupSchemaErrorCode = Literal[
    "type_conflict_strict",
    "invalid_snapshot",
]


class PerTemplateBinding(TypedDict):
    """How a canonical field maps onto a single physical template.

    Every binding is identified by ``(templateId, fieldName)``. ``fieldName`` is
    the post-rename name carried on the source template's field — it is what
    the per-template fill engine expects in its payload dict.

    ``sourceField`` records the value of the question's ``sourceField`` (the raw
    PDF widget name) so that downstream code can reconstruct the original PDF
    field if needed for debugging.
    """

    templateId: str
    fieldName: str
    sourceField: Optional[str]
    sourceType: str


class GroupCanonicalField(TypedDict):
    """A single deduped field on the canonical group schema.

    ``canonicalKey`` is the result of :func:`normalize_fill_link_key` on the
    question key, identical to the merge key used by the existing
    :func:`merge_fill_link_questions` function. Two source fields whose keys
    normalize to the same canonical key collapse into one canonical field.

    ``required`` follows the strictest-wins rule (D2): if any contributing
    binding's source question is required, the canonical field is required.
    """

    canonicalKey: str
    label: str
    type: CanonicalFieldType
    required: bool
    allowedValues: Optional[List[str]]
    perTemplateBindings: List[PerTemplateBinding]
    sourceFillLinkType: str  # the underlying fill-link question type, e.g. "multi_select"


class GroupSchemaWarning(TypedDict):
    """A non-fatal anomaly detected while building a canonical schema.

    Used in soft mode (``strict=False``). In strict mode, the equivalent
    conditions raise :class:`GroupSchemaTypeConflictError` instead.
    """

    code: GroupSchemaWarningCode
    canonicalKey: str
    detail: str


class GroupCanonicalSchema(TypedDict):
    """The full canonical schema for a template group.

    A schema is intentionally pure JSON-serializable so it can be frozen as a
    snapshot on a published Fill By Link record or API endpoint.
    """

    groupId: Optional[str]
    snapshotVersion: int
    templateIds: List[str]
    fields: List[GroupCanonicalField]
    warnings: List[GroupSchemaWarning]
    builtAt: str  # ISO-8601 timestamp


class GroupCanonicalSchemaSnapshot(TypedDict):
    """A frozen schema embedded inside a published artifact.

    Identical to :class:`GroupCanonicalSchema` plus the format version of the
    snapshot envelope itself. Loading is the inverse: read the envelope,
    validate the format version, return the schema.
    """

    snapshotFormatVersion: int
    schema: GroupCanonicalSchema
    frozenAt: str


GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION = 1


class TemplateFillCallbackResult(TypedDict, total=False):
    """The shape that a per-template fill callback must return.

    Required keys:
        ``status``   - "filled" or "errored"
        ``fieldsApplied`` - integer count of fields written

    Optional keys:
        ``pdfRef``   - a storage reference (e.g. GCS path) when a PDF was
                       successfully materialized
        ``error``    - error message when status is "errored"
    """

    status: Literal["filled", "errored"]
    fieldsApplied: int
    pdfRef: Optional[str]
    error: Optional[str]


TemplateFillCallback = Callable[[str, Mapping[str, Any]], TemplateFillCallbackResult]
"""``(template_id, projected_payload) -> TemplateFillCallbackResult``"""


class GroupFillTemplateOutcome(TypedDict):
    """Per-template outcome inside a :class:`GroupFillResult`.

    ``fieldsSkipped`` carries the canonical keys that were present on the
    template's bindings but absent from the input record. Useful for the UI to
    surface "this template wanted X but the row had no value for X".
    """

    templateId: str
    status: Literal["filled", "errored", "skipped"]
    pdfRef: Optional[str]
    fieldsApplied: int
    fieldsSkipped: List[str]
    error: Optional[str]


class GroupFillSummary(TypedDict):
    filled: int
    errored: int
    skipped: int


class GroupFillResult(TypedDict):
    """The full result vector returned by :func:`apply_group_record`."""

    groupId: Optional[str]
    snapshotVersion: int
    perTemplate: List[GroupFillTemplateOutcome]
    summary: GroupFillSummary


class GroupSchemaError(Exception):
    """Base class for canonical schema build errors."""

    code: GroupSchemaErrorCode

    def __init__(self, code: GroupSchemaErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


class GroupSchemaTypeConflictError(GroupSchemaError):
    """Two source fields collapse to the same canonical key with incompatible types.

    Raised by :func:`build_group_canonical_schema_from_sources` in strict mode.
    The publish handlers (Phase 3 and Phase 4) catch this and return a 422 to
    the user with the canonical key and conflicting type list.
    """

    def __init__(
        self,
        canonical_key: str,
        conflicting_types: List[str],
        bindings: List[PerTemplateBinding],
    ) -> None:
        super().__init__(
            "type_conflict_strict",
            (
                f"Canonical field {canonical_key!r} has incompatible types "
                f"across templates: {sorted(set(conflicting_types))!r}. "
                "Fix the field type on one of the templates and republish."
            ),
        )
        self.canonical_key = canonical_key
        self.conflicting_types = list(conflicting_types)
        self.bindings = list(bindings)


class GroupSchemaInvalidSnapshotError(GroupSchemaError):
    """The snapshot envelope is missing required fields or has the wrong format version."""

    def __init__(self, message: str) -> None:
        super().__init__("invalid_snapshot", message)
