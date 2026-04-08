"""Tests verifying SQL and TXT schema sources flow correctly through the
OpenAI schema mapping pipeline.

The backend is source-agnostic: ``build_allowlist_payload`` receives field
dicts with ``name`` and ``type`` regardless of whether they originated from
CSV, SQL, TXT, or any other parser.  These tests confirm that contract holds
for the new SQL source and the existing TXT source with representative field
sets taken from the ``new_patient_forms_mock.sql`` test fixture.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from backend.ai import schema_mapping


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# A realistic subset of fields as they arrive from the SQL parser.
SQL_SCHEMA_FIELDS = [
    {"name": "patient_name", "type": "string"},
    {"name": "patient_birthdate", "type": "date"},
    {"name": "patient_city", "type": "string"},
    {"name": "patient_state", "type": "string"},
    {"name": "patient_zip", "type": "string"},
    {"name": "i_sex_f", "type": "bool"},
    {"name": "i_sex_m", "type": "bool"},
    {"name": "dental_insurance_deductible_amount", "type": "int"},
    {"name": "i_medical_history_diabetes", "type": "bool"},
    {"name": "medication_1", "type": "string"},
    {"name": "allergy_1", "type": "string"},
    {"name": "patient_or_guardian_signature_date", "type": "date"},
]

# Same fields but as they would arrive from a TXT schema (identical structure).
TXT_SCHEMA_FIELDS = [
    {"name": "patient_name", "type": "string"},
    {"name": "patient_birthdate", "type": "date"},
    {"name": "i_sex_f", "type": "bool"},
    {"name": "i_sex_m", "type": "bool"},
    {"name": "employer_name", "type": "string"},
    {"name": "medication_1", "type": "string"},
]

TEMPLATE_FIELDS = [
    {"name": "patient_name", "type": "text", "page": 1, "rect": {"x": 10, "y": 20, "width": 200, "height": 14}},
    {"name": "patient_birthdate", "type": "date", "page": 1, "rect": {"x": 10, "y": 40, "width": 100, "height": 14}},
    {"name": "i_sex_f", "type": "checkbox", "page": 1, "rect": {"x": 300, "y": 20, "width": 12, "height": 12},
     "groupKey": "sex", "optionKey": "f"},
    {"name": "i_sex_m", "type": "checkbox", "page": 1, "rect": {"x": 320, "y": 20, "width": 12, "height": 12},
     "groupKey": "sex", "optionKey": "m"},
    {"name": "medication_1", "type": "text", "page": 2, "rect": {"x": 10, "y": 60, "width": 200, "height": 14}},
]


def _response_with_content(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class _FakeCompletions:
    def __init__(self, effects):
        self._effects = list(effects)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        effect = self._effects.pop(0)
        if isinstance(effect, Exception):
            raise effect
        return effect


class _FakeOpenAIClient:
    def __init__(self, effects):
        self.chat = SimpleNamespace(completions=_FakeCompletions(effects))


# ---------------------------------------------------------------------------
# build_allowlist_payload: SQL and TXT fields produce valid OpenAI payloads
# ---------------------------------------------------------------------------

class TestBuildAllowlistPayloadSqlSource:
    """SQL-parsed fields (with explicit types) flow through the allowlist builder."""

    def test_sql_fields_produce_valid_schema_entries(self) -> None:
        payload = schema_mapping.build_allowlist_payload(SQL_SCHEMA_FIELDS, [])
        schema_entries = payload["schemaFields"]

        assert len(schema_entries) == len(SQL_SCHEMA_FIELDS)
        by_name = {e["name"]: e["type"] for e in schema_entries}

        assert by_name["patient_name"] == "string"
        assert by_name["patient_birthdate"] == "date"
        assert by_name["i_sex_f"] == "bool"
        assert by_name["dental_insurance_deductible_amount"] == "int"
        assert by_name["medication_1"] == "string"
        assert by_name["patient_or_guardian_signature_date"] == "date"

    def test_sql_fields_combined_with_template_produces_complete_payload(self) -> None:
        payload = schema_mapping.build_allowlist_payload(SQL_SCHEMA_FIELDS, TEMPLATE_FIELDS)

        assert payload["totalSchemaFields"] == len(SQL_SCHEMA_FIELDS)
        assert payload["totalTemplateTags"] == len(TEMPLATE_FIELDS)

        # Template tags preserve checkbox grouping metadata
        checkbox_tags = [t for t in payload["templateTags"] if t["type"] == "checkbox"]
        assert len(checkbox_tags) == 2
        assert checkbox_tags[0]["groupKey"] == "sex"
        assert checkbox_tags[0]["optionKey"] == "f"
        assert checkbox_tags[1]["optionKey"] == "m"

    def test_sql_payload_is_valid_json_within_size_limit(self) -> None:
        payload = schema_mapping.build_allowlist_payload(SQL_SCHEMA_FIELDS, TEMPLATE_FIELDS)
        raw = json.dumps(payload, ensure_ascii=True)
        assert len(raw) < schema_mapping.MAX_PAYLOAD_BYTES

    def test_sql_source_field_is_not_leaked_to_openai(self) -> None:
        """The source origin should never appear in the OpenAI payload."""
        fields_with_source = [
            {**f, "source": "sql"} for f in SQL_SCHEMA_FIELDS
        ]
        payload = schema_mapping.build_allowlist_payload(fields_with_source, [])
        # No schemaField entry should have a "source" key
        for entry in payload["schemaFields"]:
            assert "source" not in entry


class TestBuildAllowlistPayloadTxtSource:
    """TXT-parsed fields flow identically through the allowlist builder."""

    def test_txt_fields_produce_valid_schema_entries(self) -> None:
        payload = schema_mapping.build_allowlist_payload(TXT_SCHEMA_FIELDS, [])
        schema_entries = payload["schemaFields"]

        assert len(schema_entries) == len(TXT_SCHEMA_FIELDS)
        by_name = {e["name"]: e["type"] for e in schema_entries}

        assert by_name["patient_name"] == "string"
        assert by_name["patient_birthdate"] == "date"
        assert by_name["i_sex_f"] == "bool"
        assert by_name["employer_name"] == "string"

    def test_txt_fields_combined_with_template_produces_complete_payload(self) -> None:
        payload = schema_mapping.build_allowlist_payload(TXT_SCHEMA_FIELDS, TEMPLATE_FIELDS)

        assert payload["totalSchemaFields"] == len(TXT_SCHEMA_FIELDS)
        assert payload["totalTemplateTags"] == len(TEMPLATE_FIELDS)


# ---------------------------------------------------------------------------
# Full round-trip: SQL schema → build payload → mock OpenAI → merged response
# ---------------------------------------------------------------------------

class TestSqlSchemaOpenAiRoundTrip:
    """Simulate the full mapping pipeline with SQL-sourced schema fields."""

    def test_sql_schema_mapping_produces_field_mappings(
        self, monkeypatch: pytest.MonkeyPatch, mocker
    ) -> None:
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")

        ai_response = json.dumps({
            "mappings": [
                {"schemaField": "patient_name", "templateTag": "patient_name", "confidence": 0.95},
                {"schemaField": "patient_birthdate", "templateTag": "patient_birthdate", "confidence": 0.90},
                {"schemaField": "medication_1", "templateTag": "medication_1", "confidence": 0.85},
            ],
            "checkboxRules": [
                {"databaseField": "i_sex_f", "groupKey": "sex", "operation": "yes_no",
                 "trueOption": "f", "falseOption": "m"},
            ],
            "notes": "SQL schema mapped successfully",
        })

        client = _FakeOpenAIClient([_response_with_content(ai_response)])
        mocker.patch("backend.ai.schema_mapping.create_openai_client", return_value=client)

        payload = schema_mapping.build_allowlist_payload(SQL_SCHEMA_FIELDS, TEMPLATE_FIELDS)
        result = schema_mapping.call_openai_schema_mapping(payload)

        assert len(result["mappings"]) == 3
        assert result["mappings"][0]["schemaField"] == "patient_name"
        assert result["mappings"][2]["schemaField"] == "medication_1"
        assert len(result["checkboxRules"]) == 1
        assert result["checkboxRules"][0]["groupKey"] == "sex"

        # Verify the OpenAI call received the correct payload structure
        call_kwargs = client.chat.completions.calls[0]
        user_message = call_kwargs["messages"][1]["content"]
        assert "patient_name" in user_message
        assert "patient_birthdate" in user_message
        assert "medication_1" in user_message

    def test_txt_schema_mapping_produces_field_mappings(
        self, monkeypatch: pytest.MonkeyPatch, mocker
    ) -> None:
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")

        ai_response = json.dumps({
            "mappings": [
                {"schemaField": "patient_name", "templateTag": "patient_name", "confidence": 0.95},
                {"schemaField": "employer_name", "templateTag": "employer_name", "confidence": 0.80},
            ],
            "notes": "TXT schema mapped",
        })

        client = _FakeOpenAIClient([_response_with_content(ai_response)])
        mocker.patch("backend.ai.schema_mapping.create_openai_client", return_value=client)

        payload = schema_mapping.build_allowlist_payload(TXT_SCHEMA_FIELDS, TEMPLATE_FIELDS)
        result = schema_mapping.call_openai_schema_mapping(payload)

        assert len(result["mappings"]) == 2
        assert result["mappings"][0]["schemaField"] == "patient_name"
        assert result["mappings"][1]["schemaField"] == "employer_name"

    def test_schema_mapping_chunks_by_template_tag_count_even_when_payload_fits(
        self, monkeypatch: pytest.MonkeyPatch, mocker
    ) -> None:
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        monkeypatch.setattr(schema_mapping, "MAX_PAYLOAD_BYTES", 10**9)
        monkeypatch.setattr(schema_mapping, "MAX_TEMPLATE_TAGS_PER_CHUNK", 2)

        effects = [
            _response_with_content(json.dumps({"mappings": [{"schemaField": "patient_name", "templateTag": "patient_name"}]})),
            _response_with_content(json.dumps({"mappings": [{"schemaField": "patient_birthdate", "templateTag": "patient_birthdate"}]})),
            _response_with_content(json.dumps({"mappings": [{"schemaField": "medication_1", "templateTag": "medication_1"}]})),
        ]
        client = _FakeOpenAIClient(effects)
        mocker.patch("backend.ai.schema_mapping.create_openai_client", return_value=client)

        payload = schema_mapping.build_allowlist_payload(SQL_SCHEMA_FIELDS, TEMPLATE_FIELDS)
        usage_events = []
        result = schema_mapping.call_openai_schema_mapping_chunked(payload, usage_collector=usage_events)

        assert len(client.chat.completions.calls) == 3
        assert len(result["mappings"]) == 3
        assert [event["chunk"] for event in usage_events] == [1, 2, 3]


# ---------------------------------------------------------------------------
# Schema creation: SQL and TXT source values are accepted
# ---------------------------------------------------------------------------

class TestSchemaCreationSourceValues:
    """Verify the Firestore schema layer accepts 'sql' and 'txt' source values."""

    def test_create_schema_with_sql_source(self, mocker) -> None:
        from backend.firebaseDB import schema_database as sdb
        from backend.test.unit.firebase._fakes import FakeFirestoreClient

        client = FakeFirestoreClient()
        mocker.patch("backend.firebaseDB.schema_database.get_firestore_client", return_value=client)
        mocker.patch("backend.firebaseDB.schema_database.now_iso", return_value="ts")
        mocker.patch("backend.firebaseDB.schema_database._schema_expires_at", return_value=None)

        record = sdb.create_schema(
            user_id="user-sql",
            fields=SQL_SCHEMA_FIELDS,
            name="new_patient_forms_mock.sql",
            source="sql",
            sample_count=1,
        )

        assert record.source == "sql"
        assert record.fields == SQL_SCHEMA_FIELDS
        stored = client.collection(sdb.SCHEMAS_COLLECTION).document(record.id).get().to_dict()
        assert stored["source"] == "sql"
        assert stored["sample_count"] == 1

    def test_create_schema_with_txt_source(self, mocker) -> None:
        from backend.firebaseDB import schema_database as sdb
        from backend.test.unit.firebase._fakes import FakeFirestoreClient

        client = FakeFirestoreClient()
        mocker.patch("backend.firebaseDB.schema_database.get_firestore_client", return_value=client)
        mocker.patch("backend.firebaseDB.schema_database.now_iso", return_value="ts")
        mocker.patch("backend.firebaseDB.schema_database._schema_expires_at", return_value=None)

        record = sdb.create_schema(
            user_id="user-txt",
            fields=TXT_SCHEMA_FIELDS,
            name="schema.txt",
            source="txt",
            sample_count=0,
        )

        assert record.source == "txt"
        assert record.fields == TXT_SCHEMA_FIELDS
        stored = client.collection(sdb.SCHEMAS_COLLECTION).document(record.id).get().to_dict()
        assert stored["source"] == "txt"
        assert stored["sample_count"] == 0
