"""Unit tests for ``backend.services.group_schema_service``.

This is the Phase 1 deliverable of the group-fill migration. The service is
the foundation that Phases 2/3/4 build on, so the tests exercise:

* canonical key derivation and merging across templates
* type conflict handling (strict vs soft modes)
* required-field strictest-wins semantics
* checkbox-group option union
* synthetic respondent-identifier filtering
* JSON schema generation strictness
* snapshot freeze / load round trip
* per-template projection from arbitrary record key conventions
* ``apply_group_record`` happy path, partial failures, and error modes
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

import pytest

from backend.services import group_schema_service as g
from backend.services.group_schema_types import (
    GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION,
    GroupSchemaInvalidSnapshotError,
    GroupSchemaTypeConflictError,
)


# ---------------------------------------------------------------------------
# Test helpers / fixtures
# ---------------------------------------------------------------------------


def _text_field(name: str, *, page: int = 1, y: int = 10) -> Dict[str, Any]:
    return {
        "id": f"field-{name}",
        "name": name,
        "type": "text",
        "page": page,
        "rect": {"x": 10, "y": y, "width": 100, "height": 14},
    }


def _date_field(name: str, *, page: int = 1, y: int = 10) -> Dict[str, Any]:
    return {
        "id": f"field-{name}",
        "name": name,
        "type": "date",
        "page": page,
        "rect": {"x": 10, "y": y, "width": 100, "height": 14},
    }


def _checkbox_field(
    *,
    group_key: str,
    option_key: str,
    option_label: str | None = None,
    page: int = 1,
    x: int = 10,
    y: int = 10,
) -> Dict[str, Any]:
    return {
        "id": f"checkbox-{group_key}-{option_key}",
        "name": f"i_{group_key}_{option_key}",
        "type": "checkbox",
        "page": page,
        "rect": {"x": x, "y": y, "width": 14, "height": 14},
        "groupKey": group_key,
        "groupLabel": group_key.replace("_", " ").title(),
        "optionKey": option_key,
        "optionLabel": option_label or option_key.title(),
    }


def _radio_field(
    *,
    group_key: str,
    option_key: str,
    option_label: str | None = None,
    page: int = 1,
    x: int = 10,
    y: int = 10,
) -> Dict[str, Any]:
    return {
        "id": f"radio-{group_key}-{option_key}",
        "name": f"{group_key}_{option_key}",
        "type": "radio",
        "page": page,
        "rect": {"x": x, "y": y, "width": 14, "height": 14},
        "radioGroupId": group_key,
        "radioGroupKey": group_key,
        "radioGroupLabel": group_key.replace("_", " ").title(),
        "radioOptionKey": option_key,
        "radioOptionLabel": option_label or option_key.title(),
    }


def _source(template_id: str, template_name: str, fields: List[Dict[str, Any]], rules: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    return {
        "templateId": template_id,
        "templateName": template_name,
        "fields": fields,
        "checkboxRules": rules or [],
    }


def _success_callback() -> tuple[List[tuple[str, Mapping[str, Any]]], Any]:
    """Return a (calls list, callback) pair that records every invocation."""

    calls: List[tuple[str, Mapping[str, Any]]] = []

    def cb(template_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        calls.append((template_id, dict(payload)))
        return {
            "status": "filled",
            "pdfRef": f"pdf://{template_id}",
            "fieldsApplied": len(payload),
            "error": None,
        }

    return calls, cb


# ---------------------------------------------------------------------------
# Canonical key derivation and basic merge
# ---------------------------------------------------------------------------


def test_canonical_key_simple_merge() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    assert [field["canonicalKey"] for field in schema["fields"]] == ["patient_name"]
    bindings = schema["fields"][0]["perTemplateBindings"]
    assert sorted(b["templateId"] for b in bindings) == ["tpl-1", "tpl-2"]


def test_canonical_key_normalization_collapses_variants() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("Patient Name")]),
        _source("tpl-2", "B", [_text_field("patientName")]),
        _source("tpl-3", "C", [_text_field("patient-name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    canonical_keys = [field["canonicalKey"] for field in schema["fields"]]
    assert canonical_keys == ["patient_name"]
    assert len(schema["fields"][0]["perTemplateBindings"]) == 3


def test_canonical_key_no_false_merge_for_distinct_names() -> None:
    sources = [
        _source(
            "tpl-1",
            "A",
            [
                _text_field("patient_name", y=10),
                _text_field("patient_full_name", y=30),
            ],
        ),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    canonical_keys = sorted(field["canonicalKey"] for field in schema["fields"])
    assert canonical_keys == ["patient_full_name", "patient_name"]


def test_canonical_field_carries_per_template_binding_metadata() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)

    bindings = schema["fields"][0]["perTemplateBindings"]
    assert bindings[0]["templateId"] == "tpl-1"
    assert bindings[0]["fieldName"] == "patient_name"
    assert bindings[0]["sourceType"] == "pdf_field"


# ---------------------------------------------------------------------------
# Checkbox / radio group merging
# ---------------------------------------------------------------------------


def test_checkbox_group_options_union_across_templates() -> None:
    sources = [
        _source(
            "tpl-A",
            "A",
            [
                _checkbox_field(group_key="marital_status", option_key="single", option_label="Single"),
                _checkbox_field(group_key="marital_status", option_key="married", option_label="Married", x=30),
            ],
        ),
        _source(
            "tpl-B",
            "B",
            [
                _checkbox_field(group_key="marital_status", option_key="married", option_label="Married"),
                _checkbox_field(group_key="marital_status", option_key="divorced", option_label="Divorced", x=30),
                _checkbox_field(group_key="marital_status", option_key="widowed", option_label="Widowed", x=50),
            ],
        ),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    marital = next(field for field in schema["fields"] if field["canonicalKey"] == "marital_status")
    assert marital["type"] == "radio_group"
    assert marital["allowedValues"] == ["single", "married", "divorced", "widowed"]
    assert sorted(b["templateId"] for b in marital["perTemplateBindings"]) == ["tpl-A", "tpl-B"]


def test_radio_group_merges_across_templates() -> None:
    sources = [
        _source(
            "tpl-A",
            "A",
            [
                _radio_field(group_key="preferred_contact", option_key="email"),
                _radio_field(group_key="preferred_contact", option_key="sms", x=30),
            ],
        ),
        _source(
            "tpl-B",
            "B",
            [
                _radio_field(group_key="preferred_contact", option_key="phone"),
            ],
        ),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    contact = next(field for field in schema["fields"] if field["canonicalKey"] == "preferred_contact")
    assert contact["type"] == "radio_group"
    assert sorted(contact["allowedValues"] or []) == ["email", "phone", "sms"]


# ---------------------------------------------------------------------------
# Required-field semantics (D2)
# ---------------------------------------------------------------------------


def test_required_strictest_wins_via_merge(monkeypatch: pytest.MonkeyPatch) -> None:
    """When one contributing question is required, the canonical field is required."""

    from backend.services import fill_links_service

    real = fill_links_service.build_fill_link_questions

    call_index = {"value": 0}

    def fake(fields: list, checkbox_rules=None) -> list:
        call_index["value"] += 1
        result = real(fields, checkbox_rules)
        # First call comes from tpl-1 — mark patient_name as required.
        if call_index["value"] == 1:
            for question in result:
                if question.get("key") == "patient_name":
                    question["required"] = True
        return result

    monkeypatch.setattr(g, "build_fill_link_questions", fake)

    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    field = next(f for f in schema["fields"] if f["canonicalKey"] == "patient_name")
    assert field["required"] is True


def test_required_all_optional_stays_optional() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    assert schema["fields"][0]["required"] is False


# ---------------------------------------------------------------------------
# Type conflict handling (D1)
# ---------------------------------------------------------------------------


def test_type_conflict_strict_raises() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("dob")]),
        _source("tpl-2", "B", [_date_field("dob")]),
    ]
    with pytest.raises(GroupSchemaTypeConflictError) as exc_info:
        g.build_group_canonical_schema_from_sources(sources, strict=True)
    assert exc_info.value.canonical_key == "dob"
    assert "text" in exc_info.value.conflicting_types
    assert "date" in exc_info.value.conflicting_types


def test_type_conflict_soft_warns_and_picks_more_constrained() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("dob")]),
        _source("tpl-2", "B", [_date_field("dob")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources, strict=False)

    warning_codes = [w["code"] for w in schema["warnings"]]
    assert "type_conflict_soft" in warning_codes
    dob = next(f for f in schema["fields"] if f["canonicalKey"] == "dob")
    assert dob["type"] == "date", "soft mode should keep the more-constrained 'date' type"


def test_type_conflict_no_conflict_for_compatible_types() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("notes")]),
        _source("tpl-2", "B", [_text_field("notes")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources, strict=True)
    assert schema["warnings"] == []


# ---------------------------------------------------------------------------
# Synthetic respondent identifier filtering
# ---------------------------------------------------------------------------


def test_synthetic_identifier_excluded_by_default() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("address")]),
        _source("tpl-2", "B", [_text_field("city")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    canonical_keys = [field["canonicalKey"] for field in schema["fields"]]
    assert "respondent_identifier" not in canonical_keys


def test_synthetic_identifier_included_when_opted_in() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("address")]),
        _source("tpl-2", "B", [_text_field("city")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(
        sources, include_synthetic_identifier=True
    )
    canonical_keys = [field["canonicalKey"] for field in schema["fields"]]
    assert "respondent_identifier" in canonical_keys


def test_real_identifier_field_is_not_filtered() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_id"), _text_field("address")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    canonical_keys = [field["canonicalKey"] for field in schema["fields"]]
    assert "patient_id" in canonical_keys
    assert "address" in canonical_keys
    assert "respondent_identifier" not in canonical_keys


# ---------------------------------------------------------------------------
# JSON Schema generation
# ---------------------------------------------------------------------------


def test_json_schema_strict_additional_properties_false() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    js = g.build_group_canonical_json_schema(schema)
    assert js["additionalProperties"] is False


def test_json_schema_text_field_emits_string_type() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    js = g.build_group_canonical_json_schema(
        g.build_group_canonical_schema_from_sources(sources)
    )
    assert js["properties"]["patient_name"]["type"] == "string"


def test_json_schema_date_field_emits_date_format() -> None:
    sources = [_source("tpl-1", "A", [_date_field("dob")])]
    js = g.build_group_canonical_json_schema(
        g.build_group_canonical_schema_from_sources(sources)
    )
    assert js["properties"]["dob"]["type"] == "string"
    assert js["properties"]["dob"]["format"] == "date"


def test_json_schema_radio_group_emits_enum() -> None:
    sources = [
        _source(
            "tpl-1",
            "A",
            [
                _radio_field(group_key="contact", option_key="email"),
                _radio_field(group_key="contact", option_key="sms", x=30),
            ],
        )
    ]
    js = g.build_group_canonical_json_schema(
        g.build_group_canonical_schema_from_sources(sources)
    )
    contact_prop = js["properties"]["contact"]
    assert contact_prop["type"] == "string"
    assert sorted(contact_prop["enum"]) == ["email", "sms"]


def test_json_schema_checkbox_field_emits_boolean() -> None:
    sources = [
        _source(
            "tpl-1",
            "A",
            [
                _checkbox_field(group_key="agree_terms", option_key="yes"),
            ],
        )
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    js = g.build_group_canonical_json_schema(schema)
    agree_prop = js["properties"]["agree_terms"]
    assert agree_prop["type"] == "boolean"


def test_json_schema_required_array_omitted_when_no_required_fields() -> None:
    sources = [_source("tpl-1", "A", [_text_field("notes")])]
    js = g.build_group_canonical_json_schema(
        g.build_group_canonical_schema_from_sources(sources)
    )
    assert "required" not in js


def test_json_schema_required_array_lists_strictest_required(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.services import fill_links_service

    real = fill_links_service.build_fill_link_questions

    def fake(fields, checkbox_rules=None):
        result = real(fields, checkbox_rules)
        for question in result:
            if question.get("key") == "patient_name":
                question["required"] = True
        return result

    monkeypatch.setattr(g, "build_fill_link_questions", fake)

    sources = [_source("tpl-1", "A", [_text_field("patient_name"), _text_field("notes")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    js = g.build_group_canonical_json_schema(schema)
    assert "required" in js
    assert "patient_name" in js["required"]
    assert "notes" not in js["required"]


def test_json_schema_property_carries_template_hint() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    js = g.build_group_canonical_json_schema(schema)
    template_ids = js["properties"]["patient_name"]["x-dullypdf-templates"]
    assert template_ids == ["tpl-1", "tpl-2"]


def test_json_schema_validates_with_official_validator() -> None:
    pytest.importorskip("jsonschema")
    import jsonschema

    sources = [
        _source(
            "tpl-1",
            "A",
            [
                _text_field("patient_name"),
                _date_field("dob", y=30),
                _radio_field(group_key="contact", option_key="email", y=50),
                _radio_field(group_key="contact", option_key="sms", x=30, y=50),
            ],
        )
    ]
    js = g.build_group_canonical_json_schema(
        g.build_group_canonical_schema_from_sources(sources)
    )
    # The generated document should itself be a valid JSON Schema.
    jsonschema.Draft202012Validator.check_schema(js)

    validator = jsonschema.Draft202012Validator(js)
    # Known-good payload validates.
    validator.validate({"patient_name": "Aria", "dob": "1992-04-11", "contact": "email"})

    # Unknown field is rejected because additionalProperties is False.
    with pytest.raises(jsonschema.ValidationError):
        validator.validate({"patient_name": "Aria", "rogue_field": "x"})

    # Out-of-enum value is rejected.
    with pytest.raises(jsonschema.ValidationError):
        validator.validate({"patient_name": "Aria", "dob": "1992-04-11", "contact": "fax"})


# ---------------------------------------------------------------------------
# Snapshot freeze / load round trip
# ---------------------------------------------------------------------------


def test_snapshot_freeze_includes_format_version() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    snap = g.freeze_group_schema_snapshot(schema)
    assert snap["snapshotFormatVersion"] == GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION
    assert snap["schema"]["fields"][0]["canonicalKey"] == "patient_name"


def test_snapshot_round_trip_preserves_fields() -> None:
    sources = [
        _source(
            "tpl-1",
            "A",
            [
                _text_field("patient_name"),
                _date_field("dob", y=30),
                _checkbox_field(group_key="agree_terms", option_key="yes", y=50),
            ],
        )
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    snap = g.freeze_group_schema_snapshot(schema)
    loaded = g.load_group_canonical_schema_from_snapshot(snap)
    assert loaded["fields"] == schema["fields"]
    assert loaded["templateIds"] == schema["templateIds"]
    assert loaded["snapshotVersion"] == schema["snapshotVersion"]


def test_snapshot_is_independent_of_subsequent_mutation() -> None:
    """Mutating the source schema after freezing must not leak into the snapshot."""

    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    snap = g.freeze_group_schema_snapshot(schema)

    schema["fields"][0]["label"] = "MUTATED"
    schema["fields"][0]["perTemplateBindings"].append(
        {"templateId": "rogue", "fieldName": "rogue", "sourceField": None, "sourceType": "pdf_field"}
    )

    loaded = g.load_group_canonical_schema_from_snapshot(snap)
    assert loaded["fields"][0]["label"] != "MUTATED"
    assert all(b["templateId"] != "rogue" for b in loaded["fields"][0]["perTemplateBindings"])


def test_snapshot_load_rejects_wrong_format_version() -> None:
    snap = {
        "snapshotFormatVersion": GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION + 99,
        "schema": {"fields": [], "templateIds": [], "warnings": [], "groupId": None, "snapshotVersion": 0, "builtAt": ""},
        "frozenAt": "2026-04-13T00:00:00Z",
    }
    with pytest.raises(GroupSchemaInvalidSnapshotError):
        g.load_group_canonical_schema_from_snapshot(snap)


def test_snapshot_load_rejects_non_mapping_input() -> None:
    with pytest.raises(GroupSchemaInvalidSnapshotError):
        g.load_group_canonical_schema_from_snapshot([1, 2, 3])  # type: ignore[arg-type]


def test_snapshot_load_rejects_missing_schema() -> None:
    snap = {"snapshotFormatVersion": GROUP_SCHEMA_SNAPSHOT_FORMAT_VERSION, "frozenAt": ""}
    with pytest.raises(GroupSchemaInvalidSnapshotError):
        g.load_group_canonical_schema_from_snapshot(snap)


# ---------------------------------------------------------------------------
# Snapshot version stability
# ---------------------------------------------------------------------------


def test_snapshot_version_is_stable_for_same_input() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name"), _date_field("dob", y=30)]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    a = g.build_group_canonical_schema_from_sources(sources)
    b = g.build_group_canonical_schema_from_sources(sources)
    assert a["snapshotVersion"] == b["snapshotVersion"]


def test_snapshot_version_changes_when_field_set_changes() -> None:
    sources_a = [_source("tpl-1", "A", [_text_field("patient_name")])]
    sources_b = [
        _source("tpl-1", "A", [_text_field("patient_name"), _text_field("address", y=30)])
    ]
    schema_a = g.build_group_canonical_schema_from_sources(sources_a)
    schema_b = g.build_group_canonical_schema_from_sources(sources_b)
    assert schema_a["snapshotVersion"] != schema_b["snapshotVersion"]


# ---------------------------------------------------------------------------
# project_record_to_template
# ---------------------------------------------------------------------------


def test_project_record_uses_canonical_keys() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    payload = g.project_record_to_template({"patient_name": "Aria"}, schema, "tpl-1")
    assert payload == {"patient_name": "Aria"}


def test_project_record_normalizes_record_keys() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    payload = g.project_record_to_template(
        {"Patient Name": "Aria"}, schema, "tpl-1"
    )
    assert payload == {"patient_name": "Aria"}

    payload_camel = g.project_record_to_template(
        {"patientName": "Aria"}, schema, "tpl-1"
    )
    assert payload_camel == {"patient_name": "Aria"}


def test_project_record_returns_only_template_specific_fields() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name"), _text_field("address", y=30)]),
        _source("tpl-2", "B", [_text_field("patient_name"), _text_field("ssn", y=30)]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    record = {"patient_name": "Aria", "address": "123 Main", "ssn": "111-22-3333"}
    payload_a = g.project_record_to_template(record, schema, "tpl-1")
    payload_b = g.project_record_to_template(record, schema, "tpl-2")
    assert payload_a == {"patient_name": "Aria", "address": "123 Main"}
    assert payload_b == {"patient_name": "Aria", "ssn": "111-22-3333"}


def test_project_record_skips_missing_fields() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name"), _text_field("ssn", y=30)])
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    payload = g.project_record_to_template({"patient_name": "Aria"}, schema, "tpl-1")
    assert payload == {"patient_name": "Aria"}


def test_project_record_does_not_mutate_input() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    record = {"patient_name": "Aria"}
    g.project_record_to_template(record, schema, "tpl-1")
    assert record == {"patient_name": "Aria"}


# ---------------------------------------------------------------------------
# apply_group_record - happy path
# ---------------------------------------------------------------------------


def test_apply_group_record_happy_path() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name"), _text_field("dob", y=30)]),
        _source("tpl-2", "B", [_text_field("patient_name"), _text_field("address", y=30)]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    calls, cb = _success_callback()

    record = {"patient_name": "Aria", "dob": "1992-04-11", "address": "123 Main"}
    result = g.apply_group_record(schema, record, fill_template_callback=cb)

    assert result["summary"] == {"filled": 2, "errored": 0, "skipped": 0}
    assert [outcome["status"] for outcome in result["perTemplate"]] == ["filled", "filled"]
    assert result["perTemplate"][0]["pdfRef"] == "pdf://tpl-1"
    assert result["perTemplate"][1]["pdfRef"] == "pdf://tpl-2"
    assert len(calls) == 2


def test_apply_group_record_skips_template_with_no_matching_fields() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("ssn")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    calls, cb = _success_callback()

    result = g.apply_group_record(
        schema, {"patient_name": "Aria"}, fill_template_callback=cb
    )

    assert result["summary"] == {"filled": 1, "errored": 0, "skipped": 1}
    statuses = {outcome["templateId"]: outcome["status"] for outcome in result["perTemplate"]}
    assert statuses == {"tpl-1": "filled", "tpl-2": "skipped"}
    skipped_outcome = next(o for o in result["perTemplate"] if o["templateId"] == "tpl-2")
    assert "ssn" in skipped_outcome["fieldsSkipped"]


def test_apply_group_record_continues_on_callback_exception() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
        _source("tpl-3", "C", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    def cb(template_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        if template_id == "tpl-2":
            raise RuntimeError("boom")
        return {"status": "filled", "pdfRef": f"pdf://{template_id}", "fieldsApplied": 1, "error": None}

    result = g.apply_group_record(
        schema, {"patient_name": "Aria"}, fill_template_callback=cb
    )

    assert result["summary"] == {"filled": 2, "errored": 1, "skipped": 0}
    failed = next(o for o in result["perTemplate"] if o["templateId"] == "tpl-2")
    assert failed["status"] == "errored"
    assert failed["error"] == "boom"


def test_apply_group_record_continues_on_callback_errored_status() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)

    def cb(template_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        if template_id == "tpl-1":
            return {"status": "errored", "fieldsApplied": 0, "error": "blocked", "pdfRef": None}
        return {"status": "filled", "pdfRef": f"pdf://{template_id}", "fieldsApplied": 1, "error": None}

    result = g.apply_group_record(
        schema, {"patient_name": "Aria"}, fill_template_callback=cb
    )
    assert result["summary"]["errored"] == 1
    assert result["summary"]["filled"] == 1


def test_apply_group_record_aborts_on_first_error_when_configured() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
        _source("tpl-3", "C", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    calls = []

    def cb(template_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        calls.append(template_id)
        if template_id == "tpl-2":
            raise RuntimeError("boom")
        return {"status": "filled", "pdfRef": f"pdf://{template_id}", "fieldsApplied": 1, "error": None}

    with pytest.raises(RuntimeError) as exc_info:
        g.apply_group_record(
            schema,
            {"patient_name": "Aria"},
            fill_template_callback=cb,
            on_template_error="abort",
        )
    # The partial result vector is carried on the exception.
    partial = exc_info.value.args[0]
    assert isinstance(partial, dict)
    assert partial["summary"]["errored"] == 1
    assert partial["summary"]["filled"] == 1
    # tpl-3 should NOT have been called because of the abort.
    assert "tpl-3" not in calls


def test_apply_group_record_missing_field_error_mode() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name"), _text_field("ssn", y=30)]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    _, cb = _success_callback()

    result = g.apply_group_record(
        schema,
        {"patient_name": "Aria"},
        fill_template_callback=cb,
        on_missing_field="error",
    )
    outcome = result["perTemplate"][0]
    assert outcome["status"] == "errored"
    assert "ssn" in outcome["fieldsSkipped"]


def test_apply_group_record_invalid_on_missing_field_arg() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    _, cb = _success_callback()
    with pytest.raises(ValueError):
        g.apply_group_record(
            schema, {"patient_name": "Aria"}, fill_template_callback=cb, on_missing_field="garbage"
        )


def test_apply_group_record_invalid_on_template_error_arg() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    _, cb = _success_callback()
    with pytest.raises(ValueError):
        g.apply_group_record(
            schema, {"patient_name": "Aria"}, fill_template_callback=cb, on_template_error="garbage"
        )


def test_apply_group_record_marks_callback_returning_invalid_status_as_errored() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)

    def cb(template_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        return {"status": "weird", "fieldsApplied": 0}  # type: ignore[typeddict-item]

    result = g.apply_group_record(
        schema, {"patient_name": "Aria"}, fill_template_callback=cb
    )
    assert result["perTemplate"][0]["status"] == "errored"
    assert result["perTemplate"][0]["error"] is not None


def test_apply_group_record_uses_snapshot_loaded_schema() -> None:
    """A loaded snapshot should drive ``apply_group_record`` identically."""

    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    snap = g.freeze_group_schema_snapshot(schema)
    loaded = g.load_group_canonical_schema_from_snapshot(snap)
    _, cb = _success_callback()

    result = g.apply_group_record(loaded, {"patient_name": "Aria"}, fill_template_callback=cb)
    assert result["summary"] == {"filled": 1, "errored": 0, "skipped": 0}


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_template_source_with_empty_template_id_is_skipped_with_warning() -> None:
    sources = [
        {"templateId": "", "templateName": "no id", "fields": [_text_field("x")]},
        _source("tpl-1", "A", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    assert schema["templateIds"] == ["tpl-1"]
    warning_codes = [w["code"] for w in schema["warnings"]]
    assert "missing_field_name" in warning_codes


def test_duplicate_template_id_is_deduped() -> None:
    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-1", "A again", [_text_field("address")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    assert schema["templateIds"] == ["tpl-1"]
    canonical_keys = {field["canonicalKey"] for field in schema["fields"]}
    # The second source is fully ignored.
    assert "patient_name" in canonical_keys
    assert "address" not in canonical_keys


def test_non_mapping_source_is_ignored() -> None:
    sources = [
        "garbage",  # type: ignore[list-item]
        None,  # type: ignore[list-item]
        _source("tpl-1", "A", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)  # type: ignore[arg-type]
    assert schema["templateIds"] == ["tpl-1"]


def test_canonical_field_label_falls_back_to_canonical_key_when_label_missing() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    assert schema["fields"][0]["label"]  # non-empty


# ---------------------------------------------------------------------------
# Label divergence warning
# ---------------------------------------------------------------------------


def test_label_divergence_warning(monkeypatch: pytest.MonkeyPatch) -> None:
    """When two contributing questions for the same canonical key have different labels."""

    from backend.services import fill_links_service

    real = fill_links_service.build_fill_link_questions
    call_index = {"value": 0}

    def fake(fields, checkbox_rules=None):
        call_index["value"] += 1
        result = real(fields, checkbox_rules)
        for question in result:
            if question.get("key") == "patient_name":
                if call_index["value"] == 1:
                    question["label"] = "Patient Name"
                else:
                    question["label"] = "Client Full Name"
        return result

    monkeypatch.setattr(g, "build_fill_link_questions", fake)

    sources = [
        _source("tpl-1", "A", [_text_field("patient_name")]),
        _source("tpl-2", "B", [_text_field("patient_name")]),
    ]
    schema = g.build_group_canonical_schema_from_sources(sources)
    warning_codes = [w["code"] for w in schema["warnings"]]
    assert "label_divergence" in warning_codes
    # First label wins.
    assert schema["fields"][0]["label"] == "Patient Name"


def test_missing_canonical_key_emits_warning(monkeypatch: pytest.MonkeyPatch) -> None:
    """A contributed question with an unresolvable key produces a warning, not a crash."""

    def fake(fields, checkbox_rules=None):
        return [
            {
                "id": "x",
                "key": "  ",  # normalizes to empty
                "label": "",
                "type": "text",
                "sourceType": "pdf_field",
                "visible": True,
                "required": False,
                "order": 0,
            }
        ]

    monkeypatch.setattr(g, "build_fill_link_questions", fake)
    sources = [_source("tpl-1", "A", [_text_field("ignored")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    warning_codes = [w["code"] for w in schema["warnings"]]
    assert "missing_field_name" in warning_codes
    assert schema["fields"] == []


# ---------------------------------------------------------------------------
# JSON Schema: signature / number / email / phone format coverage
# ---------------------------------------------------------------------------


def test_json_schema_email_field_emits_format_email() -> None:
    sources = [_source("tpl-1", "A", [_text_field("contact_email")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    js = g.build_group_canonical_json_schema(schema)
    contact = js["properties"]["contact_email"]
    assert contact["type"] == "string"
    assert contact.get("format") == "email"


def test_json_schema_phone_field_emits_format_phone() -> None:
    sources = [_source("tpl-1", "A", [_text_field("mobile_phone")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    js = g.build_group_canonical_json_schema(schema)
    phone = js["properties"]["mobile_phone"]
    assert phone["type"] == "string"
    assert phone.get("format") == "phone"


def test_json_schema_signature_field_emits_signature_extension() -> None:
    """The signature canonical type is reachable via a hand-crafted schema.

    `build_fill_link_questions` strips signature questions today, so we
    construct the canonical schema directly here to exercise the JSON Schema
    generator's signature branch.
    """

    schema: g.GroupCanonicalSchema = {
        "groupId": "grp",
        "snapshotVersion": 1,
        "templateIds": ["tpl-1"],
        "fields": [
            {
                "canonicalKey": "applicant_signature",
                "label": "Applicant Signature",
                "type": "signature",
                "required": False,
                "allowedValues": None,
                "perTemplateBindings": [
                    {
                        "templateId": "tpl-1",
                        "fieldName": "applicant_signature",
                        "sourceField": "applicant_signature",
                        "sourceType": "pdf_field",
                    }
                ],
                "sourceFillLinkType": "signature",
            }
        ],
        "warnings": [],
        "builtAt": "2026-04-13T00:00:00Z",
    }
    js = g.build_group_canonical_json_schema(schema)
    sig = js["properties"]["applicant_signature"]
    assert sig["type"] == "string"
    assert sig["x-dullypdf-signature"] is True


def test_json_schema_number_field_emits_number_type() -> None:
    """Number canonical type, also constructed directly since fill_links does not produce it."""

    schema: g.GroupCanonicalSchema = {
        "groupId": "grp",
        "snapshotVersion": 1,
        "templateIds": ["tpl-1"],
        "fields": [
            {
                "canonicalKey": "annual_income",
                "label": "Annual Income",
                "type": "number",
                "required": False,
                "allowedValues": None,
                "perTemplateBindings": [
                    {
                        "templateId": "tpl-1",
                        "fieldName": "annual_income",
                        "sourceField": "annual_income",
                        "sourceType": "pdf_field",
                    }
                ],
                "sourceFillLinkType": "number",
            }
        ],
        "warnings": [],
        "builtAt": "2026-04-13T00:00:00Z",
    }
    js = g.build_group_canonical_json_schema(schema)
    income = js["properties"]["annual_income"]
    assert income["type"] == "number"


# ---------------------------------------------------------------------------
# project_record_to_template defensive paths
# ---------------------------------------------------------------------------


def test_project_record_skips_empty_normalized_record_key() -> None:
    sources = [_source("tpl-1", "A", [_text_field("patient_name")])]
    schema = g.build_group_canonical_schema_from_sources(sources)
    payload = g.project_record_to_template(
        {"   ": "ignored", "patient_name": "Aria"}, schema, "tpl-1"
    )
    assert payload == {"patient_name": "Aria"}


def test_project_record_skips_binding_with_empty_field_name() -> None:
    """A binding whose ``fieldName`` is empty is skipped instead of writing an empty key."""

    schema: g.GroupCanonicalSchema = {
        "groupId": None,
        "snapshotVersion": 1,
        "templateIds": ["tpl-1"],
        "fields": [
            {
                "canonicalKey": "patient_name",
                "label": "Patient Name",
                "type": "text",
                "required": False,
                "allowedValues": None,
                "perTemplateBindings": [
                    {
                        "templateId": "tpl-1",
                        "fieldName": "",  # malformed binding
                        "sourceField": None,
                        "sourceType": "pdf_field",
                    }
                ],
                "sourceFillLinkType": "text",
            }
        ],
        "warnings": [],
        "builtAt": "2026-04-13T00:00:00Z",
    }
    payload = g.project_record_to_template({"patient_name": "Aria"}, schema, "tpl-1")
    assert payload == {}
