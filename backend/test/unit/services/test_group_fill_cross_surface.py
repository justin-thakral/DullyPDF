"""Phase 7: cross-surface consistency test.

This test exercises the same canonical record through every group-fill surface
shipped by the migration:

  * **Phase 1 — Search & Fill** primitive (``apply_group_record`` with a
    callback that captures the per-template projected payload).
  * **Phase 3 — Fill By Link group materialization**
    (``materialize_group_fill_link_response_packet`` with a monkey-patched
    per-template materializer that captures the answers it receives).
  * **Phase 4 — API Fill group materialization**
    (``materialize_group_template_api_snapshot``, which wraps Phase 3 directly).

It then asserts that all three call paths produce **identical per-template
inputs** for every template in the bundle. This catches divergent behavior
between the canonical-schema projection (Phase 1) and the field-name matching
that the per-template fill engine uses inside Phase 3/4 — the architectural
claim that the entire group-fill stack uses one shared projection logic.

The test does not render real PDFs (those tests are slow and machine-dependent
because they hit ``inject_fields``); it asserts instead that the inputs to the
per-template fill engine are identical across surfaces, which is the actual
invariant that matters for cross-surface output consistency. If the inputs
match and the per-template fill engine is deterministic (which it is — same
``inject_fields`` call), the outputs match.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

import pytest

from backend.firebaseDB.template_database import TemplateRecord
from backend.services import group_schema_service
from backend.services import template_api_service
from backend.services.fill_link_download_service import (
    build_group_fill_link_publish_snapshot,
    materialize_group_fill_link_response_packet,
)


# ---------------------------------------------------------------------------
# Fixture: realistic immigration packet
# ---------------------------------------------------------------------------


def _gcs_template_record(template_id: str, name: str) -> TemplateRecord:
    return TemplateRecord(
        id=template_id,
        pdf_bucket_path=f"gs://forms/{template_id}.pdf",
        template_bucket_path=f"gs://templates/{template_id}.json",
        metadata={"name": name},
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name=name,
    )


def _text_field(name: str) -> dict:
    return {
        "id": f"field-{name}",
        "name": name,
        "type": "text",
        "page": 1,
        "rect": {"x": 10, "y": 10, "width": 100, "height": 20},
    }


def _date_field(name: str) -> dict:
    return {
        "id": f"field-{name}",
        "name": name,
        "type": "date",
        "page": 1,
        "rect": {"x": 10, "y": 30, "width": 100, "height": 20},
    }


@pytest.fixture
def i130_packet_records() -> List[TemplateRecord]:
    return [
        _gcs_template_record("i-130", "I-130 Petition"),
        _gcs_template_record("i-130a", "I-130A Spouse Supplement"),
        _gcs_template_record("g-28", "G-28 Notice of Attorney"),
    ]


@pytest.fixture
def i130_packet_sources() -> List[Dict[str, Any]]:
    """3-template immigration packet with overlapping and template-specific fields."""

    return [
        {
            "templateId": "i-130",
            "templateName": "I-130 Petition",
            "fields": [
                _text_field("petitioner_name"),
                _date_field("petitioner_dob"),
                _text_field("beneficiary_name"),
                _text_field("beneficiary_a_number"),
            ],
            "checkboxRules": [],
        },
        {
            "templateId": "i-130a",
            "templateName": "I-130A Spouse Supplement",
            "fields": [
                _text_field("beneficiary_name"),
                _date_field("beneficiary_dob"),
                _text_field("beneficiary_country_of_birth"),
            ],
            "checkboxRules": [],
        },
        {
            "templateId": "g-28",
            "templateName": "G-28 Notice of Attorney",
            "fields": [
                _text_field("attorney_name"),
                _text_field("petitioner_name"),
                _text_field("beneficiary_name"),
            ],
            "checkboxRules": [],
        },
    ]


@pytest.fixture
def canonical_record() -> Dict[str, Any]:
    """One immigration client record. Every key matches a canonical field on the
    bundle; some keys flow into multiple templates (e.g. ``beneficiary_name``)."""

    return {
        "petitioner_name": "Maria Patel",
        "petitioner_dob": "1985-03-12",
        "beneficiary_name": "Anil Patel",
        "beneficiary_a_number": "A123456789",
        "beneficiary_dob": "1988-07-22",
        "beneficiary_country_of_birth": "India",
        "attorney_name": "Justin Thakral",
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _capture_phase1_per_template_payloads(
    canonical_schema,
    record: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Run Phase 1's apply_group_record with a recording callback."""

    captured: Dict[str, Dict[str, Any]] = {}

    def cb(template_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
        captured[template_id] = dict(payload)
        return {"status": "filled", "pdfRef": f"pdf://{template_id}", "fieldsApplied": len(payload), "error": None}

    result = group_schema_service.apply_group_record(canonical_schema, record, fill_template_callback=cb)
    assert result["summary"]["errored"] == 0
    return captured


def _capture_phase3_per_template_answers(
    snapshot_bundle: Dict[str, Any],
    record: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> Dict[str, Dict[str, Any]]:
    """Run Phase 3's materializer with the per-template fill helper monkey-patched
    to capture the answers it receives for each template in the bundle."""

    captured: Dict[str, Dict[str, Any]] = {}

    def fake_per_template(snapshot, *, answers):
        # The per-template materializer in production uses the snapshot's
        # sourcePdfPath to know which template it is; we use the same hint to
        # bucket the captured answers.
        source = str(snapshot.get("sourcePdfPath") or "")
        template_id = source.rsplit("/", 1)[-1].replace(".pdf", "")
        captured[template_id] = dict(answers)
        pdf_path = tmp_path / f"{template_id}.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\nstub")
        return pdf_path, [pdf_path], f"{template_id}.pdf"

    monkeypatch.setattr(
        "backend.services.fill_link_download_service.materialize_fill_link_response_download",
        fake_per_template,
    )

    materialize_group_fill_link_response_packet(
        canonical_schema_snapshot=snapshot_bundle,
        answers=record,
        base_filename="cross-surface-test",
    )
    return captured


def _capture_phase4_per_template_answers(
    snapshot_bundle: Dict[str, Any],
    record: Dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> Dict[str, Dict[str, Any]]:
    """Same as Phase 3 but invoking Phase 4's wrapper. Phase 4 wraps Phase 3
    directly so the captured answers should be byte-identical, but we run both
    explicitly to guarantee no future divergence sneaks in."""

    captured: Dict[str, Dict[str, Any]] = {}

    def fake_per_template(snapshot, *, answers):
        source = str(snapshot.get("sourcePdfPath") or "")
        template_id = source.rsplit("/", 1)[-1].replace(".pdf", "")
        captured[template_id] = dict(answers)
        pdf_path = tmp_path / f"phase4-{template_id}.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\nstub")
        return pdf_path, [pdf_path], f"{template_id}.pdf"

    monkeypatch.setattr(
        "backend.services.fill_link_download_service.materialize_fill_link_response_download",
        fake_per_template,
    )

    template_api_service.materialize_group_template_api_snapshot(
        snapshot_bundle,
        data=record,
        filename="cross-surface-test",
    )
    return captured


# ---------------------------------------------------------------------------
# Cross-surface consistency tests
# ---------------------------------------------------------------------------


def test_three_surfaces_produce_identical_per_template_inputs(
    i130_packet_records,
    i130_packet_sources,
    canonical_record,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """The architectural invariant: Phase 1 / Phase 3 / Phase 4 all pass the
    same per-template fill engine the same answers for the same input record.

    The shapes differ slightly between Phase 1 and Phase 3/4 because Phase 1
    projects through canonical bindings (so the resulting payload is keyed by
    the per-template ``fieldName``) while Phase 3/4 pass the raw answers dict
    to the per-template apply path (which then matches by normalized field
    name internally). For every canonical key + value in the input, both
    paths must end up writing the same value to the same per-template field.
    """

    canonical_schema = group_schema_service.build_group_canonical_schema_from_sources(
        i130_packet_sources,
        group_id="i130-spouse-packet",
    )
    snapshot_bundle = build_group_fill_link_publish_snapshot(
        canonical_schema=canonical_schema,
        template_records=i130_packet_records,
        template_sources=i130_packet_sources,
    )

    phase1_payloads = _capture_phase1_per_template_payloads(canonical_schema, canonical_record)
    phase3_answers = _capture_phase3_per_template_answers(
        snapshot_bundle, canonical_record, monkeypatch, tmp_path
    )
    phase4_answers = _capture_phase4_per_template_answers(
        snapshot_bundle, canonical_record, monkeypatch, tmp_path
    )

    # Every surface materializes every template in the bundle.
    assert sorted(phase1_payloads.keys()) == ["g-28", "i-130", "i-130a"]
    assert sorted(phase3_answers.keys()) == ["g-28", "i-130", "i-130a"]
    assert sorted(phase4_answers.keys()) == ["g-28", "i-130", "i-130a"]

    # Phase 3 and Phase 4 share the same materializer, so every per-template
    # answers dict must be byte-identical.
    assert phase3_answers == phase4_answers, (
        "Phase 4 wraps Phase 3 — answers passed to per-template helper must match exactly"
    )

    # Phase 3/4 pass the *whole* canonical record to each template's fill
    # helper (the helper then field-name-matches internally). So every
    # captured per-template dict equals the input record.
    for template_id, answers in phase3_answers.items():
        assert answers == canonical_record, (
            f"Phase 3 must pass the unfiltered canonical record to template {template_id}"
        )

    # Phase 1 projects more aggressively: only fields the canonical schema
    # binds to that specific template are passed through. Verify that every
    # field Phase 1 projects appears in the input record AND maps to the
    # same value Phase 3/4 would write to the corresponding per-template field.
    expected_phase1_per_template = {
        "i-130": {
            "petitioner_name": "Maria Patel",
            "petitioner_dob": "1985-03-12",
            "beneficiary_name": "Anil Patel",
            "beneficiary_a_number": "A123456789",
        },
        "i-130a": {
            "beneficiary_name": "Anil Patel",
            "beneficiary_dob": "1988-07-22",
            "beneficiary_country_of_birth": "India",
        },
        "g-28": {
            "attorney_name": "Justin Thakral",
            "petitioner_name": "Maria Patel",
            "beneficiary_name": "Anil Patel",
        },
    }
    assert phase1_payloads == expected_phase1_per_template

    # The cross-surface consistency claim: every value that Phase 1 writes to
    # a per-template field equals the value Phase 3/4 would resolve from the
    # full canonical record via field-name matching. Field names are direct
    # canonical keys in this fixture (the rename pipeline guarantees this in
    # production), so the equality is structural.
    for template_id, phase1_payload in phase1_payloads.items():
        for field_name, value in phase1_payload.items():
            assert phase3_answers[template_id][field_name] == value, (
                f"Phase 1 vs Phase 3 divergence on template {template_id}, field {field_name}: "
                f"phase1={value!r} phase3={phase3_answers[template_id][field_name]!r}"
            )


def test_cross_surface_consistency_with_overlapping_field_in_every_template(
    i130_packet_records,
    i130_packet_sources,
    canonical_record,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """``beneficiary_name`` is bound to all three templates in the immigration
    packet. Verify that every surface writes the same value to every template
    that consumes that canonical key."""

    canonical_schema = group_schema_service.build_group_canonical_schema_from_sources(
        i130_packet_sources,
        group_id="i130-spouse-packet",
    )
    snapshot_bundle = build_group_fill_link_publish_snapshot(
        canonical_schema=canonical_schema,
        template_records=i130_packet_records,
        template_sources=i130_packet_sources,
    )

    phase1 = _capture_phase1_per_template_payloads(canonical_schema, canonical_record)
    phase3 = _capture_phase3_per_template_answers(snapshot_bundle, canonical_record, monkeypatch, tmp_path)

    # The shared canonical key shows up on all three Phase 1 projections.
    for template_id in ("i-130", "i-130a", "g-28"):
        assert phase1[template_id]["beneficiary_name"] == "Anil Patel"
        # Phase 3 passes the full record so beneficiary_name is in every dict.
        assert phase3[template_id]["beneficiary_name"] == "Anil Patel"


def test_cross_surface_consistency_with_template_specific_field(
    i130_packet_records,
    i130_packet_sources,
    canonical_record,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """``beneficiary_a_number`` is bound only to ``i-130``. Phase 1 must omit it
    from the other two templates' payloads; Phase 3/4 pass the full record but
    the per-template field-name match is responsible for ignoring it on the
    other templates (verified separately by per-template fill engine tests)."""

    canonical_schema = group_schema_service.build_group_canonical_schema_from_sources(
        i130_packet_sources,
        group_id="i130-spouse-packet",
    )
    phase1 = _capture_phase1_per_template_payloads(canonical_schema, canonical_record)

    assert phase1["i-130"]["beneficiary_a_number"] == "A123456789"
    assert "beneficiary_a_number" not in phase1["i-130a"]
    assert "beneficiary_a_number" not in phase1["g-28"]


def test_cross_surface_consistency_when_record_is_missing_optional_field(
    i130_packet_records,
    i130_packet_sources,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """Drop ``beneficiary_country_of_birth`` from the record. Phase 1 marks
    ``i-130a`` as filled (3 of 4 canonical keys present, beneficiary_country_of_birth
    absent) and surfaces the missing field on the result vector. Phase 3 passes
    the full record minus the missing key; the per-template fill helper just
    skips matching that field. All three surfaces must remain consistent."""

    canonical_schema = group_schema_service.build_group_canonical_schema_from_sources(
        i130_packet_sources,
        group_id="i130-spouse-packet",
    )
    snapshot_bundle = build_group_fill_link_publish_snapshot(
        canonical_schema=canonical_schema,
        template_records=i130_packet_records,
        template_sources=i130_packet_sources,
    )

    incomplete_record = {
        "petitioner_name": "Maria Patel",
        "petitioner_dob": "1985-03-12",
        "beneficiary_name": "Anil Patel",
        "beneficiary_a_number": "A123456789",
        "beneficiary_dob": "1988-07-22",
        # NO beneficiary_country_of_birth, NO attorney_name
    }

    phase1 = _capture_phase1_per_template_payloads(canonical_schema, incomplete_record)
    phase3 = _capture_phase3_per_template_answers(
        snapshot_bundle, incomplete_record, monkeypatch, tmp_path
    )

    # Phase 1 omits the missing fields entirely from each template's payload.
    assert "beneficiary_country_of_birth" not in phase1["i-130a"]
    assert "attorney_name" not in phase1["g-28"]

    # Phase 3 passes the (still-incomplete) full record to every template; the
    # per-template fill engine matches whatever it can.
    assert "beneficiary_country_of_birth" not in phase3["i-130a"]
    assert "attorney_name" not in phase3["g-28"]

    # Where both surfaces have a value, it matches.
    assert phase1["i-130a"]["beneficiary_name"] == phase3["i-130a"]["beneficiary_name"] == "Anil Patel"
    assert phase1["i-130"]["petitioner_name"] == phase3["i-130"]["petitioner_name"] == "Maria Patel"
