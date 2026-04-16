"""Canonical group schema service.

This module is the foundation of the group-fill migration. It owns:

1. **Canonical schema construction** - merging the fields of every template in
   a template group into one deduped union schema, keyed by canonical field
   key. The merge logic uses the same :func:`normalize_fill_link_key` that
   :func:`backend.services.fill_links_service.merge_fill_link_questions` uses
   today, so two templates whose fields normalize to the same key collapse into
   one canonical entry.

2. **JSON Schema generation** - converting the canonical schema into a strict
   JSON Schema document for API Fill (Phase 4). ``additionalProperties`` is
   ``False`` (D6) and ``required`` is the strictest-wins union (D2).

3. **Snapshot freezing / loading** - serializing the canonical schema as a
   self-contained envelope that can be embedded on a published Fill By Link
   record or API endpoint, and loading it back at fill time so the fill is
   stable against later template edits (D5).

4. **Per-template projection** - mapping a flat input record (keyed by
   canonical key, label, or any synonym) into a per-template fill payload
   (keyed by the post-rename field name on that specific template).

5. **apply_group_record** - a dependency-injected orchestration that calls a
   per-template fill callback for each template in the group, captures the
   result vector, and returns a continue-on-error :class:`GroupFillResult`.

The actual PDF materialization is intentionally NOT in this module. Surfaces
(Search & Fill, Fill By Link, API Fill) supply their own fill callback wrapping
``backend.fieldDetecting.rename_pipeline.combinedSrc.form_filler.inject_fields``
or the appropriate persistence layer. Keeping this module callback-driven makes
it 100% unit-testable without a real PDF render path.

Phase 1 deliberately ships only the ``_from_sources`` constructor. The
database-loading variant (``build_group_canonical_schema(group_id, user_id)``)
is deferred to Phase 2, when there will be an immediate consumer endpoint
``GET /api/groups/{group_id}/canonical-schema`` that needs it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

from backend.logging_config import get_logger
from backend.services.fill_links_service import (
    build_fill_link_questions,
    normalize_fill_link_key,
)
from backend.services.group_schema_types import (
    GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION,
    CanonicalFieldType,
    GroupCanonicalField,
    GroupCanonicalSchema,
    GroupCanonicalSchemaSnapshot,
    GroupFillResult,
    GroupFillSummary,
    GroupFillTemplateOutcome,
    GroupSchemaInvalidSnapshotError,
    GroupSchemaTypeConflictError,
    GroupSchemaWarning,
    PerTemplateBinding,
    TemplateFillCallback,
    TemplateFillCallbackResult,
)


logger = get_logger(__name__)


_FILL_LINK_TYPE_TO_CANONICAL: Dict[str, CanonicalFieldType] = {
    "text": "text",
    "textarea": "text",
    "email": "text",
    "phone": "text",
    "date": "date",
    "boolean": "checkbox",
    "checkbox": "checkbox",
    "radio": "radio_group",
    "select": "radio_group",
    "multi_select": "radio_group",
    "signature": "signature",
    "number": "number",
}


_CANONICAL_TYPE_PRECEDENCE: Dict[CanonicalFieldType, int] = {
    "signature": 0,
    "radio_group": 1,
    "date": 2,
    "number": 3,
    "checkbox": 4,
    "text": 5,
}
"""Soft-mode tiebreaker order. Lower index wins.

Rationale: more constrained types should win over freer types, because
narrowing a value (text -> date) is safer than widening (date -> text) at
respondent fill time.
"""


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _fill_link_type_to_canonical(question_type: Any) -> CanonicalFieldType:
    normalized = (normalize_fill_link_key(question_type) or "text").lower()
    return _FILL_LINK_TYPE_TO_CANONICAL.get(normalized, "text")


def _question_canonical_key(question: Mapping[str, Any]) -> str:
    return normalize_fill_link_key(question.get("key"))


def _binding_from_question(template_id: str, question: Mapping[str, Any]) -> PerTemplateBinding:
    field_name = _coerce_text(question.get("key")) or _coerce_text(question.get("sourceField"))
    return {
        "templateId": template_id,
        "fieldName": field_name,
        "sourceField": _coerce_text(question.get("sourceField")) or None,
        "sourceType": _coerce_text(question.get("sourceType")) or "pdf_field",
    }


def _allowed_values_from_question(question: Mapping[str, Any]) -> Optional[List[str]]:
    options = question.get("options")
    if not isinstance(options, list):
        return None
    keys: List[str] = []
    seen: set[str] = set()
    for option in options:
        if not isinstance(option, dict):
            continue
        key = _coerce_text(option.get("key"))
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys or None


def _merge_allowed_values(
    existing: Optional[List[str]],
    incoming: Optional[List[str]],
) -> Optional[List[str]]:
    if not existing and not incoming:
        return None
    merged: List[str] = []
    seen: set[str] = set()
    for value in list(existing or []) + list(incoming or []):
        if value in seen:
            continue
        seen.add(value)
        merged.append(value)
    return merged or None


def _resolve_soft_type_winner(
    left: CanonicalFieldType,
    right: CanonicalFieldType,
) -> CanonicalFieldType:
    return left if _CANONICAL_TYPE_PRECEDENCE[left] <= _CANONICAL_TYPE_PRECEDENCE[right] else right


def _build_template_question_set(
    source: Mapping[str, Any],
    *,
    include_synthetic_identifier: bool,
) -> Tuple[str, str, List[Dict[str, Any]]]:
    """Return ``(template_id, template_name, questions)`` for a single source.

    Returns ``("", "", [])`` for inputs that do not contain usable field data.

    ``build_fill_link_questions`` injects a synthetic ``respondent_identifier``
    question when no detected field looks like an identifier. That is a Fill By
    Link UX affordance, not something Search & Fill (Phase 2) or API Fill
    (Phase 4) want bleeding into their canonical contracts. When
    ``include_synthetic_identifier`` is False (the default for the canonical
    schema service), those synthetic entries are stripped.
    """

    if not isinstance(source, Mapping):
        return ("", "", [])
    template_id = _coerce_text(source.get("templateId"))
    template_name = _coerce_text(source.get("templateName")) or template_id
    fields = source.get("fields") if isinstance(source.get("fields"), list) else []
    checkbox_rules = (
        source.get("checkboxRules")
        if isinstance(source.get("checkboxRules"), list)
        else None
    )
    questions = build_fill_link_questions(fields, checkbox_rules)
    if not include_synthetic_identifier:
        questions = [
            question
            for question in questions
            if not _question_is_synthetic(question)
        ]
    return (template_id, template_name, questions)


def _question_is_synthetic(question: Mapping[str, Any]) -> bool:
    if not isinstance(question, Mapping):
        return False
    if bool(question.get("synthetic")):
        return True
    return _coerce_text(question.get("sourceType")) == "synthetic"


def build_group_canonical_schema_from_sources(
    template_sources: Iterable[Mapping[str, Any]],
    *,
    group_id: Optional[str] = None,
    strict: bool = True,
    include_synthetic_identifier: bool = False,
) -> GroupCanonicalSchema:
    """Build a canonical group schema from a list of template field sources.

    Each ``template_source`` is a dict with the same shape that
    :func:`backend.api.routes.fill_links._normalize_group_template_sources`
    already produces for the existing group Fill By Link path::

        {
            "templateId": "tpl-1",
            "templateName": "Template One",
            "fields": [...],          # raw field metadata
            "checkboxRules": [...],   # optional rename-pipeline rules
        }

    ``strict=True`` raises :class:`GroupSchemaTypeConflictError` on canonical
    type collisions (used by Fill By Link / API Fill publish handlers).

    ``strict=False`` resolves collisions via the precedence map and emits a
    :class:`GroupSchemaWarning` of code ``type_conflict_soft`` instead (used by
    the Search & Fill workspace surface, which favors keeping the user
    productive over forcing a publish-time fix).

    ``include_synthetic_identifier`` controls whether the synthetic
    ``respondent_identifier`` question that ``build_fill_link_questions``
    injects when no real identifier field is detected leaks into the canonical
    schema. Default False — Search & Fill and API Fill do not want it. Phase 3
    (Fill By Link) opts in explicitly when building the unified web form.
    """

    template_ids: List[str] = []
    canonical_index: Dict[str, GroupCanonicalField] = {}
    canonical_order: List[str] = []
    warnings: List[GroupSchemaWarning] = []

    for source in template_sources:
        template_id, _template_name, questions = _build_template_question_set(
            source, include_synthetic_identifier=include_synthetic_identifier
        )
        if not template_id:
            warnings.append(
                {
                    "code": "missing_field_name",
                    "canonicalKey": "",
                    "detail": "Skipped template source with empty templateId.",
                }
            )
            continue
        if template_id in template_ids:
            # Duplicates can leak in from frontend payloads; keep the first.
            continue
        template_ids.append(template_id)

        for question in questions:
            canonical_key = _question_canonical_key(question)
            if not canonical_key:
                warnings.append(
                    {
                        "code": "missing_field_name",
                        "canonicalKey": "",
                        "detail": (
                            f"Template {template_id!r} contributed a question "
                            "without a usable key."
                        ),
                    }
                )
                continue

            incoming_label = _coerce_text(question.get("label")) or canonical_key
            incoming_canonical_type = _fill_link_type_to_canonical(question.get("type"))
            incoming_required = bool(question.get("required"))
            incoming_allowed = _allowed_values_from_question(question)
            binding = _binding_from_question(template_id, question)

            existing = canonical_index.get(canonical_key)
            if existing is None:
                canonical_order.append(canonical_key)
                canonical_index[canonical_key] = {
                    "canonicalKey": canonical_key,
                    "label": incoming_label,
                    "type": incoming_canonical_type,
                    "required": incoming_required,
                    "allowedValues": incoming_allowed,
                    "perTemplateBindings": [binding],
                    "sourceFillLinkType": _coerce_text(question.get("type")) or "text",
                }
                continue

            if existing["type"] != incoming_canonical_type:
                conflicting_types = [existing["type"], incoming_canonical_type]
                if strict:
                    raise GroupSchemaTypeConflictError(
                        canonical_key=canonical_key,
                        conflicting_types=conflicting_types,
                        bindings=[*existing["perTemplateBindings"], binding],
                    )
                warnings.append(
                    {
                        "code": "type_conflict_soft",
                        "canonicalKey": canonical_key,
                        "detail": (
                            f"Field {canonical_key!r} resolves to incompatible "
                            f"types across templates ({sorted(set(conflicting_types))!r}); "
                            "kept the more-constrained type and continued."
                        ),
                    }
                )
                existing["type"] = _resolve_soft_type_winner(
                    existing["type"], incoming_canonical_type
                )

            if (
                existing["label"]
                and incoming_label
                and existing["label"] != incoming_label
            ):
                warnings.append(
                    {
                        "code": "label_divergence",
                        "canonicalKey": canonical_key,
                        "detail": (
                            f"Field {canonical_key!r} has divergent labels "
                            f"({existing['label']!r} vs {incoming_label!r}); "
                            "kept the first."
                        ),
                    }
                )

            existing["required"] = existing["required"] or incoming_required
            existing["allowedValues"] = _merge_allowed_values(
                existing["allowedValues"], incoming_allowed
            )
            existing["perTemplateBindings"].append(binding)

    canonical_fields: List[GroupCanonicalField] = [
        canonical_index[key] for key in canonical_order
    ]

    snapshot_version = _compute_snapshot_version(template_ids, canonical_fields)

    return {
        "groupId": group_id,
        "snapshotVersion": snapshot_version,
        "templateIds": template_ids,
        "fields": canonical_fields,
        "warnings": warnings,
        "builtAt": _now_iso(),
    }


def _compute_snapshot_version(
    template_ids: List[str],
    canonical_fields: List[GroupCanonicalField],
) -> int:
    """Stable, content-addressed version integer for caching.

    The version is derived from a deterministic hash of the sorted template ID
    list and the sorted canonical key list. Two builds over the same input
    produce the same version; two builds over different inputs produce
    different versions with overwhelming probability.

    Returned as a positive 31-bit integer so it fits Firestore numeric fields
    without surprise.
    """

    import hashlib

    payload_parts: List[str] = ["v1"]
    for template_id in sorted(template_ids):
        payload_parts.append(f"t:{template_id}")
    for field in sorted(canonical_fields, key=lambda entry: entry["canonicalKey"]):
        payload_parts.append(f"f:{field['canonicalKey']}:{field['type']}")
    digest = hashlib.sha256("|".join(payload_parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


def build_group_canonical_json_schema(
    canonical_schema: GroupCanonicalSchema,
    *,
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert a canonical schema into a draft-2020-12 JSON Schema document.

    Strict by design (D6): ``additionalProperties`` is ``False`` so API
    consumers get a clear contract error on unknown keys. ``required`` is the
    strictest-wins union (D2).

    Each property carries an ``x-dullypdf-templates`` extension array listing
    the template IDs that consume it, as a debugging aid for API consumers. The
    extension is informational; the JSON Schema validator does not act on it.
    """

    properties: Dict[str, Dict[str, Any]] = {}
    required: List[str] = []
    for field in canonical_schema["fields"]:
        properties[field["canonicalKey"]] = _canonical_field_to_property(field)
        if field["required"]:
            required.append(field["canonicalKey"])

    document: Dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": title or _default_schema_title(canonical_schema),
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
    }
    if required:
        document["required"] = required
    return document


def _canonical_field_to_property(field: GroupCanonicalField) -> Dict[str, Any]:
    template_ids = sorted(
        {binding["templateId"] for binding in field["perTemplateBindings"]}
    )
    base: Dict[str, Any] = {
        "title": field["label"],
        "x-dullypdf-templates": template_ids,
    }
    field_type: CanonicalFieldType = field["type"]
    if field_type == "text":
        base["type"] = "string"
        if field["sourceFillLinkType"] == "email":
            base["format"] = "email"
        elif field["sourceFillLinkType"] == "phone":
            base["format"] = "phone"
    elif field_type == "date":
        base["type"] = "string"
        base["format"] = "date"
    elif field_type == "checkbox":
        base["type"] = "boolean"
    elif field_type == "radio_group":
        base["type"] = "string"
        if field.get("allowedValues"):
            base["enum"] = list(field["allowedValues"] or [])
    elif field_type == "signature":
        base["type"] = "string"
        base["x-dullypdf-signature"] = True
    elif field_type == "number":
        base["type"] = "number"
    return base


def _default_schema_title(canonical_schema: GroupCanonicalSchema) -> str:
    group_id = canonical_schema.get("groupId") or "untitled"
    return f"DullyPDF group {group_id} canonical schema"


def freeze_group_schema_snapshot(
    canonical_schema: GroupCanonicalSchema,
) -> GroupCanonicalSchemaSnapshot:
    """Wrap a canonical schema in a self-contained snapshot envelope.

    The envelope includes a format version so future canonical schema layout
    changes can be migrated cleanly. The schema itself is deep-copied through
    ``dict``/``list`` reconstruction to ensure the envelope is independent of
    any subsequent mutation of ``canonical_schema``.
    """

    return {
        "snapshotFormatVersion": GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION,
        "schema": _deepcopy_canonical_schema(canonical_schema),
        "frozenAt": _now_iso(),
    }


def _deepcopy_canonical_schema(schema: GroupCanonicalSchema) -> GroupCanonicalSchema:
    return {
        "groupId": schema.get("groupId"),
        "snapshotVersion": int(schema.get("snapshotVersion") or 0),
        "templateIds": list(schema.get("templateIds") or []),
        "fields": [
            {
                "canonicalKey": field["canonicalKey"],
                "label": field["label"],
                "type": field["type"],
                "required": bool(field.get("required")),
                "allowedValues": (
                    list(field.get("allowedValues") or [])
                    if field.get("allowedValues") is not None
                    else None
                ),
                "perTemplateBindings": [
                    {
                        "templateId": binding["templateId"],
                        "fieldName": binding["fieldName"],
                        "sourceField": binding.get("sourceField"),
                        "sourceType": binding.get("sourceType") or "pdf_field",
                    }
                    for binding in field.get("perTemplateBindings", [])
                ],
                "sourceFillLinkType": field.get("sourceFillLinkType") or "text",
            }
            for field in schema.get("fields", [])
        ],
        "warnings": [
            {
                "code": warning["code"],
                "canonicalKey": warning.get("canonicalKey", ""),
                "detail": warning.get("detail", ""),
            }
            for warning in schema.get("warnings", [])
        ],
        "builtAt": schema.get("builtAt") or _now_iso(),
    }


def load_group_canonical_schema_from_snapshot(
    snapshot: Mapping[str, Any],
) -> GroupCanonicalSchema:
    """Inverse of :func:`freeze_group_schema_snapshot`.

    Validates the envelope shape and format version. Raises
    :class:`GroupSchemaInvalidSnapshotError` on bad input rather than returning
    a half-built schema.
    """

    if not isinstance(snapshot, Mapping):
        raise GroupSchemaInvalidSnapshotError("snapshot must be a mapping")
    format_version = snapshot.get("snapshotFormatVersion")
    if format_version != GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION:
        raise GroupSchemaInvalidSnapshotError(
            f"Unsupported snapshot format version: {format_version!r}"
        )
    schema = snapshot.get("schema")
    if not isinstance(schema, Mapping):
        raise GroupSchemaInvalidSnapshotError("snapshot.schema must be a mapping")
    return _deepcopy_canonical_schema(schema)  # type: ignore[arg-type]


def project_record_to_template(
    record: Mapping[str, Any],
    canonical_schema: GroupCanonicalSchema,
    template_id: str,
) -> Dict[str, Any]:
    """Project a flat input record into a per-template fill payload.

    The input record is normalized through :func:`normalize_fill_link_key` so
    that callers can pass keys in any case / spacing convention (display label,
    canonical key, snake_case, camelCase). The result is a dict keyed by the
    post-rename ``fieldName`` that the per-template fill engine expects.

    Fields whose canonical key is not present in the record are simply omitted
    from the payload. The caller is responsible for deciding whether that
    counts as ``skipped`` or as an error (controlled by ``on_missing_field``
    on :func:`apply_group_record`).
    """

    normalized_record: Dict[str, Any] = {}
    for raw_key, value in record.items():
        canonical_key = normalize_fill_link_key(raw_key)
        if not canonical_key:
            continue
        # First-write-wins so an explicit canonical key takes precedence over a
        # noisy synonym alias. Callers that need different semantics can
        # pre-normalize the record themselves.
        normalized_record.setdefault(canonical_key, value)

    payload: Dict[str, Any] = {}
    for field in canonical_schema["fields"]:
        canonical_key = field["canonicalKey"]
        if canonical_key not in normalized_record:
            continue
        value = normalized_record[canonical_key]
        for binding in field["perTemplateBindings"]:
            if binding["templateId"] != template_id:
                continue
            field_name = binding["fieldName"]
            if not field_name:
                continue
            payload[field_name] = value
            break
    return payload


def collect_canonical_keys_for_template(
    canonical_schema: GroupCanonicalSchema,
    template_id: str,
) -> List[str]:
    """Return every canonical key bound to a given template.

    Used by :func:`apply_group_record` to compute the ``fieldsSkipped`` list
    when an input record is missing a value for a field that the template
    actually consumes.
    """

    keys: List[str] = []
    for field in canonical_schema["fields"]:
        for binding in field["perTemplateBindings"]:
            if binding["templateId"] == template_id:
                keys.append(field["canonicalKey"])
                break
    return keys


def apply_group_record(
    canonical_schema: GroupCanonicalSchema,
    record: Mapping[str, Any],
    *,
    fill_template_callback: TemplateFillCallback,
    on_missing_field: str = "skip",
    on_template_error: str = "continue",
) -> GroupFillResult:
    """Fill every template in the group from one input record.

    For each template in the canonical schema's ``templateIds`` list:

    1. Compute the canonical keys that this template consumes.
    2. Identify the ones missing from the input record.
    3. Project the record into a per-template fill payload via
       :func:`project_record_to_template`.
    4. Honor ``on_missing_field``:

       - ``"skip"`` (default): missing fields go on the outcome's
         ``fieldsSkipped`` list and the fill proceeds with whatever data is
         available. If the projected payload ends up empty, the outcome is
         ``"skipped"`` rather than ``"filled"``.
       - ``"error"``: any missing field produces an ``"errored"`` outcome with
         a descriptive message. The fill callback is not invoked for that
         template.

    5. Invoke ``fill_template_callback(template_id, payload)`` and translate
       its result into a :class:`GroupFillTemplateOutcome`.

    6. Honor ``on_template_error``:

       - ``"continue"`` (default): keep going through remaining templates.
       - ``"abort"``: raise :class:`RuntimeError` with the partial result
         vector available on ``exc.args[0]``.

    The callback is dependency-injected so this function can be unit-tested
    without a real PDF render path; surfaces wrap their actual fill primitives
    around a small adapter at call time.
    """

    if on_missing_field not in {"skip", "error"}:
        raise ValueError(f"on_missing_field must be 'skip' or 'error', got {on_missing_field!r}")
    if on_template_error not in {"continue", "abort"}:
        raise ValueError(
            f"on_template_error must be 'continue' or 'abort', got {on_template_error!r}"
        )

    outcomes: List[GroupFillTemplateOutcome] = []
    summary: GroupFillSummary = {"filled": 0, "errored": 0, "skipped": 0}

    for template_id in canonical_schema["templateIds"]:
        outcome = _apply_one_template(
            canonical_schema=canonical_schema,
            template_id=template_id,
            record=record,
            fill_template_callback=fill_template_callback,
            on_missing_field=on_missing_field,
        )
        outcomes.append(outcome)
        summary[outcome["status"]] += 1
        if outcome["status"] == "errored" and on_template_error == "abort":
            partial: GroupFillResult = {
                "groupId": canonical_schema.get("groupId"),
                "snapshotVersion": int(canonical_schema.get("snapshotVersion") or 0),
                "perTemplate": outcomes,
                "summary": summary,
            }
            raise RuntimeError(partial)

    return {
        "groupId": canonical_schema.get("groupId"),
        "snapshotVersion": int(canonical_schema.get("snapshotVersion") or 0),
        "perTemplate": outcomes,
        "summary": summary,
    }


def _apply_one_template(
    *,
    canonical_schema: GroupCanonicalSchema,
    template_id: str,
    record: Mapping[str, Any],
    fill_template_callback: TemplateFillCallback,
    on_missing_field: str,
) -> GroupFillTemplateOutcome:
    template_keys = collect_canonical_keys_for_template(canonical_schema, template_id)
    payload = project_record_to_template(record, canonical_schema, template_id)
    skipped_keys = sorted(
        key for key in template_keys if key not in payload_keys_for_template(payload, canonical_schema, template_id)
    )

    if on_missing_field == "error" and skipped_keys:
        return {
            "templateId": template_id,
            "status": "errored",
            "pdfRef": None,
            "fieldsApplied": 0,
            "fieldsSkipped": skipped_keys,
            "error": (
                f"Template {template_id!r} is missing required canonical fields: {skipped_keys!r}"
            ),
        }

    if not payload:
        return {
            "templateId": template_id,
            "status": "skipped",
            "pdfRef": None,
            "fieldsApplied": 0,
            "fieldsSkipped": skipped_keys,
            "error": None,
        }

    try:
        result: TemplateFillCallbackResult = fill_template_callback(template_id, payload)
    except Exception as exc:  # noqa: BLE001 - intentional broad catch for callback isolation
        logger.warning(
            "Group fill callback raised for template=%s: %s", template_id, exc
        )
        return {
            "templateId": template_id,
            "status": "errored",
            "pdfRef": None,
            "fieldsApplied": 0,
            "fieldsSkipped": skipped_keys,
            "error": str(exc),
        }

    status = result.get("status") if isinstance(result, Mapping) else None
    if status not in {"filled", "errored"}:
        return {
            "templateId": template_id,
            "status": "errored",
            "pdfRef": None,
            "fieldsApplied": 0,
            "fieldsSkipped": skipped_keys,
            "error": (
                f"Fill callback returned an invalid result for template {template_id!r}: {result!r}"
            ),
        }

    if status == "errored":
        return {
            "templateId": template_id,
            "status": "errored",
            "pdfRef": result.get("pdfRef"),
            "fieldsApplied": int(result.get("fieldsApplied") or 0),
            "fieldsSkipped": skipped_keys,
            "error": _coerce_text(result.get("error")) or "fill callback reported error",
        }

    return {
        "templateId": template_id,
        "status": "filled",
        "pdfRef": result.get("pdfRef"),
        "fieldsApplied": int(result.get("fieldsApplied") or 0),
        "fieldsSkipped": skipped_keys,
        "error": None,
    }


def payload_keys_for_template(
    payload: Mapping[str, Any],
    canonical_schema: GroupCanonicalSchema,
    template_id: str,
) -> set[str]:
    """Return the set of *canonical keys* whose binding produced an entry in ``payload``.

    Helper used by :func:`_apply_one_template` to decide which canonical keys
    actually made it into the per-template payload (vs which were absent on
    the input record). We iterate the canonical schema, walk each binding for
    the template, and check whether the binding's ``fieldName`` is present in
    the payload dict.
    """

    if not payload:
        return set()
    present_field_names = set(payload.keys())
    matched: set[str] = set()
    for field in canonical_schema["fields"]:
        for binding in field["perTemplateBindings"]:
            if binding["templateId"] != template_id:
                continue
            if binding["fieldName"] in present_field_names:
                matched.add(field["canonicalKey"])
            break
    return matched
