"""Strict declarative schema for high-value catalog forms.

The model-written portion of the factory stops at this schema. Rendering,
field naming, pagination, and PDF geometry remain deterministic so a retry
cannot silently move widgets or publish a structurally different document.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


IDENTIFIER_RE = re.compile(r"^[a-z][a-z0-9_]{1,79}$")
RISK_TIERS = frozenset({"A", "B", "C"})
BLOCK_TYPES = frozenset(
    {
        "checklist",
        "fields",
        "notice",
        "signatures",
        "table",
        "textarea",
    }
)
FIELD_TYPES = frozenset({"choice", "text"})


class SpecValidationError(ValueError):
    """Raised when a form specification cannot be rendered safely."""


def _required_string(payload: dict[str, Any], key: str, *, minimum: int = 1) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or len(value.strip()) < minimum:
        raise SpecValidationError(f"{key} must be a string of at least {minimum} characters")
    return value.strip()


def _identifier(payload: dict[str, Any], key: str) -> str:
    value = _required_string(payload, key)
    if not IDENTIFIER_RE.fullmatch(value):
        raise SpecValidationError(
            f"{key} must match {IDENTIFIER_RE.pattern}; received {value!r}"
        )
    return value


def _string_list(
    payload: dict[str, Any],
    key: str,
    *,
    minimum: int,
    maximum: int,
) -> tuple[str, ...]:
    values = payload.get(key)
    if not isinstance(values, list) or not minimum <= len(values) <= maximum:
        raise SpecValidationError(
            f"{key} must contain between {minimum} and {maximum} items"
        )
    normalized: list[str] = []
    for index, value in enumerate(values):
        if not isinstance(value, str) or not value.strip():
            raise SpecValidationError(f"{key}[{index}] must be a non-empty string")
        normalized.append(value.strip())
    if len(set(normalized)) != len(normalized):
        raise SpecValidationError(f"{key} must not contain duplicate items")
    return tuple(normalized)


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    units: float = 1.0
    field_type: str = "text"
    options: tuple[str, ...] = ()
    multiline: bool = False

    @classmethod
    def from_dict(cls, payload: dict[str, Any], path: str) -> "FieldSpec":
        if not isinstance(payload, dict):
            raise SpecValidationError(f"{path} must be an object")
        key = _identifier(payload, "key")
        label = _required_string(payload, "label", minimum=2)
        units = payload.get("units", 1.0)
        if not isinstance(units, (int, float)) or not 0.25 <= float(units) <= 5:
            raise SpecValidationError(f"{path}.units must be between 0.25 and 5")
        field_type = payload.get("field_type", "text")
        if field_type not in FIELD_TYPES:
            raise SpecValidationError(
                f"{path}.field_type must be one of {sorted(FIELD_TYPES)}"
            )
        options: tuple[str, ...] = ()
        if field_type == "choice":
            options = _string_list(payload, "options", minimum=2, maximum=12)
        elif payload.get("options"):
            raise SpecValidationError(f"{path}.options is only valid for choice fields")
        multiline = bool(payload.get("multiline", False))
        if multiline and field_type != "text":
            raise SpecValidationError(f"{path}.multiline is only valid for text fields")
        return cls(
            key=key,
            label=label,
            units=float(units),
            field_type=field_type,
            options=options,
            multiline=multiline,
        )


@dataclass(frozen=True)
class ColumnSpec:
    key: str
    label: str
    units: float = 1.0

    @classmethod
    def from_dict(cls, payload: dict[str, Any], path: str) -> "ColumnSpec":
        if not isinstance(payload, dict):
            raise SpecValidationError(f"{path} must be an object")
        key = _identifier(payload, "key")
        label = _required_string(payload, "label", minimum=2)
        units = payload.get("units", 1.0)
        if not isinstance(units, (int, float)) or not 0.25 <= float(units) <= 5:
            raise SpecValidationError(f"{path}.units must be between 0.25 and 5")
        return cls(key=key, label=label, units=float(units))


@dataclass(frozen=True)
class BlockSpec:
    key: str
    type: str
    label: str
    guidance: str
    fields: tuple[FieldSpec, ...] = ()
    items: tuple[str, ...] = ()
    columns: tuple[ColumnSpec, ...] = ()
    rows: int = 0
    height: int = 0

    @classmethod
    def from_dict(cls, payload: dict[str, Any], path: str) -> "BlockSpec":
        if not isinstance(payload, dict):
            raise SpecValidationError(f"{path} must be an object")
        key = _identifier(payload, "key")
        block_type = _required_string(payload, "type")
        if block_type not in BLOCK_TYPES:
            raise SpecValidationError(
                f"{path}.type must be one of {sorted(BLOCK_TYPES)}"
            )
        label = _required_string(payload, "label", minimum=2)
        guidance = str(payload.get("guidance", "")).strip()

        fields: tuple[FieldSpec, ...] = ()
        items: tuple[str, ...] = ()
        columns: tuple[ColumnSpec, ...] = ()
        rows = 0
        height = 0

        if block_type in {"fields", "signatures"}:
            raw_fields = payload.get("fields")
            if not isinstance(raw_fields, list) or not 1 <= len(raw_fields) <= 6:
                raise SpecValidationError(f"{path}.fields must contain 1 to 6 fields")
            fields = tuple(
                FieldSpec.from_dict(field, f"{path}.fields[{index}]")
                for index, field in enumerate(raw_fields)
            )
        elif block_type == "textarea":
            raw_fields = payload.get("fields")
            if not isinstance(raw_fields, list) or len(raw_fields) != 1:
                raise SpecValidationError(f"{path}.fields must contain exactly one field")
            fields = (
                FieldSpec.from_dict(raw_fields[0], f"{path}.fields[0]"),
            )
            height = payload.get("height", 56)
            if not isinstance(height, int) or not 34 <= height <= 160:
                raise SpecValidationError(f"{path}.height must be an integer from 34 to 160")
        elif block_type == "checklist":
            items = _string_list(payload, "items", minimum=2, maximum=20)
        elif block_type == "table":
            raw_columns = payload.get("columns")
            if not isinstance(raw_columns, list) or not 2 <= len(raw_columns) <= 6:
                raise SpecValidationError(f"{path}.columns must contain 2 to 6 columns")
            columns = tuple(
                ColumnSpec.from_dict(column, f"{path}.columns[{index}]")
                for index, column in enumerate(raw_columns)
            )
            rows = payload.get("rows", 5)
            if not isinstance(rows, int) or not 2 <= rows <= 12:
                raise SpecValidationError(f"{path}.rows must be an integer from 2 to 12")
        elif block_type == "notice":
            if len(guidance) < 15:
                raise SpecValidationError(
                    f"{path}.guidance must contain the notice text"
                )

        owned_keys = [field.key for field in fields] + [column.key for column in columns]
        if len(owned_keys) != len(set(owned_keys)):
            raise SpecValidationError(f"{path} contains duplicate field or column keys")

        return cls(
            key=key,
            type=block_type,
            label=label,
            guidance=guidance,
            fields=fields,
            items=items,
            columns=columns,
            rows=rows,
            height=height,
        )


@dataclass(frozen=True)
class SectionSpec:
    key: str
    title: str
    guidance: str
    blocks: tuple[BlockSpec, ...]

    @classmethod
    def from_dict(cls, payload: dict[str, Any], path: str) -> "SectionSpec":
        if not isinstance(payload, dict):
            raise SpecValidationError(f"{path} must be an object")
        key = _identifier(payload, "key")
        title = _required_string(payload, "title", minimum=3)
        guidance = str(payload.get("guidance", "")).strip()
        raw_blocks = payload.get("blocks")
        if not isinstance(raw_blocks, list) or not 1 <= len(raw_blocks) <= 12:
            raise SpecValidationError(f"{path}.blocks must contain 1 to 12 blocks")
        blocks = tuple(
            BlockSpec.from_dict(block, f"{path}.blocks[{index}]")
            for index, block in enumerate(raw_blocks)
        )
        block_keys = [block.key for block in blocks]
        if len(block_keys) != len(set(block_keys)):
            raise SpecValidationError(f"{path} contains duplicate block keys")
        return cls(key=key, title=title, guidance=guidance, blocks=blocks)


@dataclass(frozen=True)
class FormSpec:
    schema_version: int
    catalog_id: str
    source_section: str
    source_filename: str
    slug: str
    title: str
    subtitle: str
    description: str
    use_case: str
    risk_tier: str
    sections: tuple[SectionSpec, ...]

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "FormSpec":
        if not isinstance(payload, dict):
            raise SpecValidationError("form spec must be a JSON object")
        schema_version = payload.get("schema_version")
        if schema_version != 1:
            raise SpecValidationError("schema_version must be 1")
        catalog_id = _required_string(payload, "catalog_id", minimum=3)
        source_section = _identifier(payload, "source_section")
        source_filename = _required_string(payload, "source_filename", minimum=5)
        if Path(source_filename).name != source_filename or not source_filename.endswith(".pdf"):
            raise SpecValidationError("source_filename must be a basename ending in .pdf")
        expected_catalog_id = f"{source_section}/{source_filename[:-4]}"
        if catalog_id != expected_catalog_id:
            raise SpecValidationError(
                "catalog_id must preserve the stable source identity "
                f"{expected_catalog_id!r}"
            )
        slug = _required_string(payload, "slug", minimum=3)
        if slug.strip("-") != slug or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise SpecValidationError("slug must be a lowercase hyphenated public route slug")
        title = _required_string(payload, "title", minimum=8)
        subtitle = _required_string(payload, "subtitle", minimum=20)
        description = _required_string(payload, "description", minimum=40)
        use_case = _required_string(payload, "use_case", minimum=40)
        risk_tier = _required_string(payload, "risk_tier")
        if risk_tier not in RISK_TIERS:
            raise SpecValidationError(
                f"risk_tier must be one of {sorted(RISK_TIERS)}"
            )
        raw_sections = payload.get("sections")
        if not isinstance(raw_sections, list) or not 2 <= len(raw_sections) <= 14:
            raise SpecValidationError("sections must contain 2 to 14 workflow sections")
        sections = tuple(
            SectionSpec.from_dict(section, f"sections[{index}]")
            for index, section in enumerate(raw_sections)
        )
        section_keys = [section.key for section in sections]
        if len(section_keys) != len(set(section_keys)):
            raise SpecValidationError("sections contain duplicate keys")

        semantic_keys: list[str] = []
        for section in sections:
            for block in section.blocks:
                semantic_keys.extend(
                    f"{section.key}.{block.key}.{field.key}" for field in block.fields
                )
                for row in range(block.rows):
                    semantic_keys.extend(
                        f"{section.key}.{block.key}.row_{row + 1}.{column.key}"
                        for column in block.columns
                    )
                semantic_keys.extend(
                    f"{section.key}.{block.key}.item_{index + 1}"
                    for index in range(len(block.items))
                )
        if len(semantic_keys) != len(set(semantic_keys)):
            raise SpecValidationError("form contains duplicate semantic field paths")

        return cls(
            schema_version=schema_version,
            catalog_id=catalog_id,
            source_section=source_section,
            source_filename=source_filename,
            slug=slug,
            title=title,
            subtitle=subtitle,
            description=description,
            use_case=use_case,
            risk_tier=risk_tier,
            sections=sections,
        )


def load_form_spec(path: str | Path) -> FormSpec:
    """Load and validate one UTF-8 JSON form specification."""

    spec_path = Path(path)
    try:
        payload = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpecValidationError(f"could not load {spec_path}: {exc}") from exc
    try:
        return FormSpec.from_dict(payload)
    except SpecValidationError as exc:
        raise SpecValidationError(f"{spec_path}: {exc}") from exc
