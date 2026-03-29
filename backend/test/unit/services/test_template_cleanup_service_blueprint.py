"""Regression checks for saved-form cleanup ordering."""

from __future__ import annotations

from types import SimpleNamespace

from backend.firebaseDB.template_database import TemplateRecord
from backend.services import template_cleanup_service


def _template_record() -> TemplateRecord:
    return TemplateRecord(
        id="tpl-1",
        pdf_bucket_path="gs://forms/template.pdf",
        template_bucket_path="gs://templates/template.pdf",
        metadata={
            "name": "Template One",
            "editorSnapshot": {
                "version": 1,
                "path": "gs://sessions/template-snapshot.json",
            },
        },
        created_at="2024-01-01T00:00:00+00:00",
        updated_at="2024-01-01T00:00:00+00:00",
        name="Template One",
    )


def test_delete_saved_form_assets_closes_fill_links_before_deleting_template(mocker) -> None:
    mocker.patch.object(template_cleanup_service, "get_template", return_value=_template_record())
    delete_pdf_mock = mocker.patch.object(template_cleanup_service, "delete_pdf", return_value=None)
    call_order: list[str] = []

    def _close_fill_links(*args, **kwargs):
        call_order.append("close_template_links")
        return 1

    def _close_group_links(*args, **kwargs):
        call_order.append("close_group_links")
        return 1

    def _delete_template(*args, **kwargs):
        call_order.append("delete_template")
        return True

    remove_from_groups_mock = mocker.patch.object(
        template_cleanup_service,
        "remove_template_from_all_groups",
        side_effect=lambda *args, **kwargs: call_order.append("remove_from_groups"),
    )
    mocker.patch.object(
        template_cleanup_service,
        "close_fill_links_for_template",
        side_effect=_close_fill_links,
    )
    mocker.patch.object(
        template_cleanup_service,
        "close_group_fill_links_for_template",
        side_effect=_close_group_links,
    )
    mocker.patch.object(template_cleanup_service, "delete_template", side_effect=_delete_template)

    deleted = template_cleanup_service.delete_saved_form_assets("tpl-1", "user-1")

    assert deleted is True
    assert call_order == [
        "close_template_links",
        "close_group_links",
        "delete_template",
        "remove_from_groups",
    ]
    remove_from_groups_mock.assert_called_once_with("tpl-1", "user-1")
    assert [call.args[0] for call in delete_pdf_mock.call_args_list] == [
        "gs://forms/template.pdf",
        "gs://templates/template.pdf",
        "gs://sessions/template-snapshot.json",
    ]


def test_delete_saved_form_assets_hard_delete_removes_link_records_before_template_delete(mocker) -> None:
    mocker.patch.object(template_cleanup_service, "get_template", return_value=_template_record())
    mocker.patch.object(template_cleanup_service, "delete_pdf", return_value=None)
    call_order: list[str] = []

    mocker.patch.object(
        template_cleanup_service,
        "delete_fill_links_for_template",
        side_effect=lambda *args, **kwargs: call_order.append("delete_template_links"),
    )
    mocker.patch.object(
        template_cleanup_service,
        "delete_group_fill_links_for_template",
        side_effect=lambda *args, **kwargs: call_order.append("delete_group_links"),
    )
    mocker.patch.object(
        template_cleanup_service,
        "delete_template",
        side_effect=lambda *args, **kwargs: call_order.append("delete_template") or True,
    )
    mocker.patch.object(template_cleanup_service, "remove_template_from_all_groups", return_value=None)

    deleted = template_cleanup_service.delete_saved_form_assets(
        "tpl-1",
        "user-1",
        hard_delete_link_records=True,
    )

    assert deleted is True
    assert call_order == [
        "delete_template_links",
        "delete_group_links",
        "delete_template",
    ]


def test_delete_saved_form_assets_invalidates_draft_signing_requests_after_template_delete(mocker) -> None:
    mocker.patch.object(template_cleanup_service, "get_template", return_value=_template_record())
    mocker.patch.object(template_cleanup_service, "delete_pdf", return_value=None)
    call_order: list[str] = []

    mocker.patch.object(
        template_cleanup_service,
        "close_fill_links_for_template",
        side_effect=lambda *args, **kwargs: call_order.append("close_template_links"),
    )
    mocker.patch.object(
        template_cleanup_service,
        "close_group_fill_links_for_template",
        side_effect=lambda *args, **kwargs: call_order.append("close_group_links"),
    )
    mocker.patch.object(
        template_cleanup_service,
        "delete_template",
        side_effect=lambda *args, **kwargs: call_order.append("delete_template") or True,
    )
    mocker.patch.object(
        template_cleanup_service,
        "list_signing_requests",
        return_value=[
            SimpleNamespace(id="sign-draft", status="draft", source_template_id="tpl-1"),
            SimpleNamespace(id="sign-sent", status="sent", source_template_id="tpl-1"),
            SimpleNamespace(id="sign-other", status="draft", source_template_id="tpl-9"),
        ],
    )
    invalidate_mock = mocker.patch.object(
        template_cleanup_service,
        "invalidate_signing_request",
        side_effect=lambda *args, **kwargs: call_order.append("invalidate_draft") or SimpleNamespace(id="sign-draft"),
    )
    mocker.patch.object(
        template_cleanup_service,
        "remove_template_from_all_groups",
        side_effect=lambda *args, **kwargs: call_order.append("remove_from_groups"),
    )

    deleted = template_cleanup_service.delete_saved_form_assets("tpl-1", "user-1")

    assert deleted is True
    assert call_order == [
        "close_template_links",
        "close_group_links",
        "delete_template",
        "invalidate_draft",
        "remove_from_groups",
    ]
    invalidate_mock.assert_called_once_with(
        "sign-draft",
        "user-1",
        reason="This signing draft can no longer be sent because its saved form was deleted.",
    )
