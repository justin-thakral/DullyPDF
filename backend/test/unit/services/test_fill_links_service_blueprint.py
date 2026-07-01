"""Security-focused regression tests for `backend.services.fill_links_service`."""

from __future__ import annotations

import pytest

from backend.services import fill_links_service as fls


ONE_BY_ONE_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAA7EAAAOxAGVKw4b"
    "AAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII="
)


def test_dev_fill_link_secret_fallback_is_ephemeral_and_not_the_old_shared_literal(mocker, monkeypatch) -> None:
    monkeypatch.delenv("FILL_LINK_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    mocker.patch.object(fls, "_DEV_FILL_LINK_TOKEN_SECRET", "dev-ephemeral-secret")
    mocker.patch.object(fls, "_WARNED_DEV_FILL_LINK_TOKEN_SECRET", False)

    first = fls._resolve_fill_link_token_secret()
    second = fls._resolve_fill_link_token_secret()

    assert first == "dev-ephemeral-secret"
    assert second == "dev-ephemeral-secret"
    assert first != "dullypdf-fill-link-dev-secret"


def test_prod_fill_link_secret_rejects_missing_or_weak_values(monkeypatch) -> None:
    monkeypatch.setenv("ENV", "production")

    monkeypatch.delenv("FILL_LINK_TOKEN_SECRET", raising=False)
    try:
        fls._resolve_fill_link_token_secret()
    except RuntimeError as exc:
        assert "must be unique and at least 32 characters" in str(exc)
    else:  # pragma: no cover - defensive branch
        raise AssertionError("Expected production fill link secret validation to fail when unset.")

    monkeypatch.setenv("FILL_LINK_TOKEN_SECRET", "change_me_prod_fill_link_token_secret")
    try:
        fls._resolve_fill_link_token_secret()
    except RuntimeError as exc:
        assert "must be unique and at least 32 characters" in str(exc)
    else:  # pragma: no cover - defensive branch
        raise AssertionError("Expected production fill link secret validation to fail for weak placeholder values.")


def test_build_fill_link_web_form_schema_does_not_duplicate_defaults_on_fresh_publish() -> None:
    """Regression: a fresh publish (no incoming web_form_config) previously went
    through an else branch that populated stored_questions with every default,
    then a follow-up loop *also* appended every default because
    ``seen_default_keys`` was never populated in that branch. Result: every
    question was duplicated, producing React duplicate-key errors on the public
    respondent page for group fill links.
    """

    default_questions = [
        {
            "id": "pdf_field:patient_name",
            "key": "patient_name",
            "label": "Patient Name",
            "type": "text",
            "sourceType": "pdf_field",
            "visible": True,
            "required": False,
            "order": 0,
        },
        {
            "id": "pdf_field:patient_dob",
            "key": "patient_dob",
            "label": "Patient DOB",
            "type": "text",
            "sourceType": "pdf_field",
            "visible": True,
            "required": False,
            "order": 1,
        },
    ]

    stored_config, published_questions = fls.build_fill_link_web_form_schema(
        default_questions,
    )

    stored_keys = [q["key"] for q in stored_config["questions"]]
    assert stored_keys.count("patient_name") == 1, "stored questions must not duplicate defaults on fresh publish"
    assert stored_keys.count("patient_dob") == 1

    published_keys = [q["key"] for q in published_questions]
    assert published_keys.count("patient_name") == 1
    assert published_keys.count("patient_dob") == 1


def test_build_fill_link_web_form_schema_excludes_signature_questions_for_post_submit_signing() -> None:
    default_questions = [
        {
            "id": "pdf_field:full_name",
            "key": "full_name",
            "label": "Full Name",
            "type": "text",
            "sourceType": "pdf_field",
            "visible": True,
            "required": False,
            "order": 0,
        },
        {
            "id": "pdf_field:signature",
            "key": "signature",
            "label": "Signature",
            "type": "text",
            "sourceType": "pdf_field",
            "visible": True,
            "required": False,
            "order": 1,
        },
    ]

    stored_config, published_questions = fls.build_fill_link_web_form_schema(
        default_questions,
        exclude_signing_questions=True,
    )

    assert "signature" in [question["key"] for question in stored_config["questions"]]
    assert "signature" not in [question["key"] for question in published_questions]
    assert "full_name" in [question["key"] for question in published_questions]


def test_build_fill_link_questions_omits_calculated_outputs_and_keeps_number_inputs() -> None:
    questions = fls.build_fill_link_questions(
        [
            {
                "id": "base",
                "name": "base_amount",
                "type": "text",
                "page": 1,
                "rect": {"x": 10, "y": 10, "width": 80, "height": 20},
                "calculation": {"role": "number_input", "valueType": "integer"},
            },
            {
                "id": "subtotal",
                "name": "subtotal",
                "type": "text",
                "page": 1,
                "rect": {"x": 10, "y": 40, "width": 80, "height": 20},
                "calculation": {
                    "role": "calculated_intermediate",
                    "valueType": "integer",
                    "formula": {"kind": "field", "fieldId": "base"},
                },
            },
            {
                "id": "total",
                "name": "total",
                "type": "text",
                "page": 1,
                "rect": {"x": 10, "y": 70, "width": 80, "height": 20},
                "calculation": {
                    "role": "calculated_output",
                    "valueType": "integer",
                    "formula": {"kind": "field", "fieldId": "subtotal"},
                },
            },
        ],
    )

    keys = [question["key"] for question in questions]
    assert "base_amount" in keys
    assert "subtotal" not in keys
    assert "total" not in keys
    base_question = next(question for question in questions if question["key"] == "base_amount")
    assert base_question["calculationRole"] == "number_input"
    assert base_question["valueType"] == "integer"


def test_build_fill_link_web_form_schema_drops_stale_calculated_output_questions() -> None:
    default_questions = [
        {
            "id": "pdf_field:base_amount",
            "key": "base_amount",
            "label": "Base Amount",
            "type": "text",
            "sourceType": "pdf_field",
            "sourceField": "base_amount",
            "visible": True,
            "required": False,
            "order": 0,
        }
    ]
    web_form_config = {
        "questions": [
            {
                "id": "pdf_field:base_amount",
                "key": "base_amount",
                "label": "Base Amount",
                "type": "text",
                "sourceType": "pdf_field",
                "sourceField": "base_amount",
                "visible": True,
                "required": False,
                "order": 0,
            },
            {
                "id": "pdf_field:total",
                "key": "total",
                "label": "Total",
                "type": "text",
                "sourceType": "pdf_field",
                "sourceField": "total",
                "visible": True,
                "required": False,
                "order": 1,
            },
        ]
    }

    stored_config, published_questions = fls.build_fill_link_web_form_schema(
        default_questions,
        web_form_config=web_form_config,
    )

    stored_keys = [question["key"] for question in stored_config["questions"]]
    published_keys = [question["key"] for question in published_questions]
    assert "base_amount" in stored_keys
    assert "total" not in stored_keys
    assert "base_amount" in published_keys
    assert "total" not in published_keys


def test_build_fill_link_questions_uses_image_uploads_and_omits_generated_helpers() -> None:
    questions = fls.build_fill_link_questions(
        [
            {
                "id": "photo",
                "name": "profile_photo",
                "type": "image",
                "page": 1,
                "rect": {"x": 10, "y": 10, "width": 80, "height": 60},
            },
            {
                "id": "barcode",
                "name": "member_barcode",
                "type": "barcode",
                "page": 1,
                "rect": {"x": 10, "y": 80, "width": 120, "height": 40},
            },
            {
                "id": "qr",
                "name": "verification_qr",
                "type": "qr",
                "page": 1,
                "rect": {"x": 10, "y": 130, "width": 80, "height": 80},
            },
            {
                "id": "pdf417",
                "name": "license_pdf417",
                "type": "pdf417",
                "page": 1,
                "rect": {"x": 10, "y": 220, "width": 140, "height": 70},
            },
        ],
    )

    by_key = {question["key"]: question for question in questions}
    assert by_key["profile_photo"]["type"] == "image"
    assert "member_barcode" not in by_key
    assert "verification_qr" not in by_key
    assert "license_pdf417" not in by_key


def test_coerce_fill_link_answers_accepts_image_upload_payload() -> None:
    answers = fls.coerce_fill_link_answers(
        {"profile_photo": {"imageDataUrl": ONE_BY_ONE_PNG_DATA_URL, "imageName": "profile.png"}},
        [{"key": "profile_photo", "label": "Profile Photo", "type": "image"}],
    )

    assert answers["profile_photo"]["imageDataUrl"] == ONE_BY_ONE_PNG_DATA_URL
    assert answers["profile_photo"]["imageMimeType"] == "image/png"
    assert answers["profile_photo"]["imageName"] == "profile.png"


def test_coerce_fill_link_answers_rejects_decimal_calculation_number_input() -> None:
    questions = [
        {"key": "full_name", "label": "Full Name", "type": "text"},
        {
            "key": "base_premium",
            "label": "Base Premium",
            "type": "text",
            "calculationRole": "number_input",
            "valueType": "integer",
        },
    ]

    with pytest.raises(ValueError, match="Base Premium must be an integer"):
        fls.coerce_fill_link_answers(
            {"full_name": "Ada Lovelace", "base_premium": "10.5"},
            questions,
        )

    answers = fls.coerce_fill_link_answers(
        {"full_name": "Ada Lovelace", "base_premium": "0010.0"},
        questions,
    )

    assert answers["base_premium"] == "10"


def test_enrich_fill_link_questions_with_calculation_metadata_from_snapshot() -> None:
    questions = [
        {"key": "full_name", "label": "Full Name", "type": "text"},
        {"key": "base_premium", "label": "Base Premium", "type": "text"},
    ]

    enriched = fls.enrich_fill_link_questions_with_calculation_metadata(
        questions,
        respondent_pdf_snapshot={
            "fields": [
                {
                    "id": "base",
                    "name": "base_premium",
                    "type": "text",
                    "calculation": {"role": "number_input", "valueType": "integer"},
                },
            ]
        },
    )

    by_key = {question["key"]: question for question in enriched}
    assert by_key["base_premium"]["calculationRole"] == "number_input"
    assert by_key["base_premium"]["valueType"] == "integer"


def test_build_fill_link_questions_keeps_checkbox_groups_as_multi_select_until_converted() -> None:
    questions = fls.build_fill_link_questions(
        [
            {
                "id": "field-1",
                "name": "i_marital_status_single",
                "type": "checkbox",
                "page": 1,
                "rect": {"x": 10, "y": 10, "width": 14, "height": 14},
                "groupKey": "marital_status",
                "groupLabel": "Marital Status",
                "optionKey": "single",
                "optionLabel": "Single",
            },
            {
                "id": "field-2",
                "name": "i_marital_status_married",
                "type": "checkbox",
                "page": 1,
                "rect": {"x": 30, "y": 10, "width": 14, "height": 14},
                "groupKey": "marital_status",
                "groupLabel": "Marital Status",
                "optionKey": "married",
                "optionLabel": "Married",
            },
        ],
        [
            {
                "databaseField": "marital_status",
                "groupKey": "marital_status",
                "operation": "enum",
            }
        ],
    )

    marital_status = next(question for question in questions if question.get("key") == "marital_status")

    assert marital_status["sourceType"] == "checkbox_group"
    assert marital_status["type"] == "multi_select"
    assert marital_status["options"] == [
        {"key": "single", "label": "Single"},
        {"key": "married", "label": "Married"},
    ]


def test_build_fill_link_questions_preserves_explicit_radio_groups() -> None:
    questions = fls.build_fill_link_questions(
        [
            {
                "id": "field-1",
                "name": "preferred_contact_email",
                "type": "radio",
                "page": 1,
                "rect": {"x": 10, "y": 10, "width": 14, "height": 14},
                "radioGroupId": "preferred_contact",
                "radioGroupKey": "preferred_contact",
                "radioGroupLabel": "Preferred Contact",
                "radioOptionKey": "email",
                "radioOptionLabel": "Email",
            },
            {
                "id": "field-2",
                "name": "preferred_contact_sms",
                "type": "radio",
                "page": 1,
                "rect": {"x": 30, "y": 10, "width": 14, "height": 14},
                "radioGroupId": "preferred_contact",
                "radioGroupKey": "preferred_contact",
                "radioGroupLabel": "Preferred Contact",
                "radioOptionKey": "sms",
                "radioOptionLabel": "SMS",
            },
        ]
    )

    preferred_contact = next(question for question in questions if question.get("key") == "preferred_contact")

    assert preferred_contact["sourceType"] == "radio_group"
    assert preferred_contact["type"] == "radio"
    assert preferred_contact["options"] == [
        {"key": "email", "label": "Email"},
        {"key": "sms", "label": "SMS"},
    ]


def test_build_fill_link_questions_groups_radio_fields_by_group_id_when_key_is_missing() -> None:
    questions = fls.build_fill_link_questions(
        [
            {
                "id": "field-1",
                "name": "preferred_contact_email",
                "type": "radio",
                "page": 1,
                "rect": {"x": 10, "y": 10, "width": 14, "height": 14},
                "radioGroupId": "preferred_contact",
                "radioOptionKey": "email",
                "radioOptionLabel": "Email",
            },
            {
                "id": "field-2",
                "name": "preferred_contact_sms",
                "type": "radio",
                "page": 1,
                "rect": {"x": 30, "y": 10, "width": 14, "height": 14},
                "radioGroupId": "preferred_contact",
                "radioOptionKey": "sms",
                "radioOptionLabel": "SMS",
            },
        ]
    )

    preferred_contact = next(question for question in questions if question.get("key") == "preferred_contact")

    assert preferred_contact["sourceType"] == "radio_group"
    assert preferred_contact["type"] == "radio"
    assert preferred_contact["options"] == [
        {"key": "email", "label": "Email"},
        {"key": "sms", "label": "SMS"},
    ]


def test_build_fill_link_questions_prefers_radio_option_key_when_label_matches_collapsed_field_text() -> None:
    questions = fls.build_fill_link_questions(
        [
            {
                "id": "field-1",
                "name": "Marital Status: Single Married Divorced Separat…",
                "type": "radio",
                "page": 1,
                "rect": {"x": 10, "y": 10, "width": 14, "height": 14},
                "radioGroupId": "marital_status",
                "radioGroupKey": "marital_status",
                "radioGroupLabel": "Marital Status",
                "radioOptionKey": "single",
                "radioOptionLabel": "Marital Status: Single Married Divorced Separat…",
            },
            {
                "id": "field-2",
                "name": "Marital Status: Single Married Divorced Separat…",
                "type": "radio",
                "page": 1,
                "rect": {"x": 30, "y": 10, "width": 14, "height": 14},
                "radioGroupId": "marital_status",
                "radioGroupKey": "marital_status",
                "radioGroupLabel": "Marital Status",
                "radioOptionKey": "married",
                "radioOptionLabel": "Marital Status: Single Married Divorced Separat…",
            },
        ]
    )

    marital_status = next(question for question in questions if question.get("key") == "marital_status")

    assert marital_status["options"] == [
        {"key": "single", "label": "Single"},
        {"key": "married", "label": "Married"},
    ]


def test_derive_fill_link_respondent_label_uses_question_label_and_selected_option_for_radio_fallback() -> None:
    label, secondary = fls.derive_fill_link_respondent_label(
        {"marital_status": "single"},
        [
            {
                "key": "marital_status",
                "label": "Marital Status",
                "type": "radio",
                "options": [
                    {"key": "single", "label": "Single"},
                    {"key": "married", "label": "Married"},
                ],
            }
        ],
    )

    assert label == "Marital Status"
    assert secondary == "Single"


def test_derive_fill_link_respondent_label_keeps_text_preview_behavior_for_plain_text_fallback() -> None:
    label, secondary = fls.derive_fill_link_respondent_label(
        {"notes": "Call after 5pm"},
        [
            {
                "key": "notes",
                "label": "Notes",
                "type": "text",
            }
        ],
    )

    assert label == "Call after 5pm"
    assert secondary is None
