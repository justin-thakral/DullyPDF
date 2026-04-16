"""Respondent PDF download helpers for Fill By Link.

The public download path materializes a PDF from the publish-time snapshot that
was frozen when the owner published the link. This keeps output stable even if
the underlying saved forms change later and avoids trusting client-supplied
field payloads. Runtime is linear in the number of snapshot fields plus
checkbox options because each field and checkbox group is walked a bounded
number of times per materialization request.

For group fill links (Phase 3) the publish snapshot is a *bundle* containing
one per-template snapshot for every saved form in the group plus the canonical
schema produced by ``backend.services.group_schema_service``. At download time
the bundle materializes one PDF per template and zips them together so the
respondent (or owner) gets the entire packet from a single submission.
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

from backend.fieldDetecting.rename_pipeline.combinedSrc.form_filler import inject_fields
from backend.firebaseDB.storage_service import download_pdf_bytes, is_gcs_path
from backend.logging_config import get_logger
from backend.services.mapping_service import normalize_data_key
from backend.services.pdf_export_service import flatten_pdf_form_widgets
from backend.services.pdf_service import coerce_field_payloads, safe_pdf_download_filename, sanitize_basename_segment


logger = get_logger(__name__)

RESPONDENT_PDF_SNAPSHOT_VERSION = 1
GROUP_FILL_LINK_PUBLISH_SNAPSHOT_FORMAT_VERSION = 1
_BOOLEAN_TRUE = {"1", "true", "yes", "y", "on", "checked", "x"}
_BOOLEAN_FALSE = {"0", "false", "no", "n", "off", "unchecked"}


def _normalize_download_mode(value: Any) -> str:
    normalized = str(value or "flat").strip().lower()
    return "editable" if normalized == "editable" else "flat"


def _coerce_dict_list(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(entry) for entry in value if isinstance(entry, dict)]


def _resolve_saved_form_fill_rules(template_metadata: Optional[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    metadata = template_metadata if isinstance(template_metadata, dict) else {}
    fill_rules = metadata.get("fillRules") if isinstance(metadata.get("fillRules"), dict) else {}
    checkbox_rules = fill_rules.get("checkboxRules") if isinstance(fill_rules.get("checkboxRules"), list) else metadata.get("checkboxRules")
    radio_groups = fill_rules.get("radioGroups") if isinstance(fill_rules.get("radioGroups"), list) else metadata.get("radioGroups")
    text_transform_rules = (
        fill_rules.get("textTransformRules")
        if isinstance(fill_rules.get("textTransformRules"), list)
        else metadata.get("textTransformRules")
    )
    if not isinstance(text_transform_rules, list) and isinstance(metadata.get("templateRules"), list):
        text_transform_rules = metadata.get("templateRules")
    return {
        "checkboxRules": _coerce_dict_list(checkbox_rules),
        "radioGroups": _coerce_dict_list(radio_groups),
        "textTransformRules": _coerce_dict_list(text_transform_rules),
    }


def _resolve_template_page_count(template, override: Optional[int] = None) -> int:
    """Return the page count for a saved-form template record.

    Precedence:
      1. Explicit ``override`` from the caller. This wins because the caller
         may have just loaded the full editor snapshot (authoritative), while
         the manifest on the template record can lag behind.
      2. ``template.metadata['editorSnapshot']['pageCount']`` — the small
         manifest stored directly on the template record. No storage fetch
         needed.
      3. 0.

    Phase 4/5 use this so group API Fill bundles carry a real per-template page
    count; without it the bundle's ``total_pages`` computation is always 0,
    and the per-request page limit check on group endpoints never fires.
    """

    try:
        if override is not None:
            coerced = int(override)
            if coerced >= 0:
                return coerced
    except (TypeError, ValueError):
        pass
    metadata = getattr(template, "metadata", None) if template is not None else None
    if isinstance(metadata, dict):
        editor_manifest = metadata.get("editorSnapshot")
        if isinstance(editor_manifest, dict):
            raw_page_count = editor_manifest.get("pageCount")
            try:
                if raw_page_count is not None:
                    return max(0, int(raw_page_count))
            except (TypeError, ValueError):
                pass
    return 0


def build_template_fill_link_download_snapshot(
    *,
    template,
    fields: List[Dict[str, Any]],
    export_mode: str = "flat",
    page_count: Optional[int] = None,
) -> Dict[str, Any]:
    if not template or not getattr(template, "pdf_bucket_path", None):
        raise ValueError("Saved form PDF is required for respondent download.")
    if not is_gcs_path(template.pdf_bucket_path):
        raise ValueError("Saved form PDF storage path is invalid for respondent download.")
    normalized_fields = coerce_field_payloads(fields)
    if not normalized_fields:
        raise ValueError("No usable template fields were provided for respondent download.")
    fill_rules = _resolve_saved_form_fill_rules(template.metadata if hasattr(template, "metadata") else None)
    base_name = template.name or "fill-link-response"
    resolved_page_count = _resolve_template_page_count(template, override=page_count)
    return {
        "version": RESPONDENT_PDF_SNAPSHOT_VERSION,
        "scopeType": "template",
        "templateId": template.id,
        "templateName": template.name,
        "sourcePdfPath": template.pdf_bucket_path,
        "filename": safe_pdf_download_filename(f"{base_name}-response", "fill-link-response"),
        "downloadMode": _normalize_download_mode(export_mode),
        "pageCount": resolved_page_count,
        "fields": normalized_fields,
        "checkboxRules": fill_rules["checkboxRules"],
        "radioGroups": fill_rules["radioGroups"],
        "textTransformRules": fill_rules["textTransformRules"],
    }


def _fill_link_bundle(record) -> Optional[Dict[str, Any]]:
    """Return the persisted publish bundle for either template or group scope.

    Templates store the per-template materialization snapshot in
    ``respondent_pdf_snapshot``; groups store the canonical-schema bundle in
    ``canonical_schema_snapshot``. This helper normalizes both paths so
    accessors don't have to branch on scope.
    """
    scope_type = str(getattr(record, "scope_type", None) or "template").strip() or "template"
    if scope_type == "group":
        bundle = getattr(record, "canonical_schema_snapshot", None)
    else:
        bundle = getattr(record, "respondent_pdf_snapshot", None)
    return bundle if isinstance(bundle, dict) else None


def respondent_pdf_download_enabled(record) -> bool:
    return bool(getattr(record, "respondent_pdf_download_enabled", False)) and (
        _fill_link_bundle(record) is not None
    )


def respondent_pdf_download_mode(record) -> str:
    scope_type = str(getattr(record, "scope_type", None) or "template").strip() or "template"
    if scope_type == "group":
        return "flat"
    snapshot = getattr(record, "respondent_pdf_snapshot", None)
    if not isinstance(snapshot, dict):
        return "flat"
    return _normalize_download_mode(snapshot.get("downloadMode"))


def respondent_pdf_editable_enabled(record) -> bool:
    return respondent_pdf_download_mode(record) == "editable"


def build_fill_link_download_payload(
    record,
    *,
    token: str,
    response_id: str,
    snapshot: Optional[Dict[str, Any]] = None,
    enabled: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    scope_type = str(getattr(record, "scope_type", None) or "template").strip() or "template"
    is_group = scope_type == "group"

    if is_group:
        # Group links don't have a response-level respondent_pdf_snapshot; the
        # download endpoint materializes a zip on demand from the publish-time
        # canonical_schema_snapshot stored on the record. We only need to know
        # the bundle exists and the flag is set.
        bundle = getattr(record, "canonical_schema_snapshot", None)
        has_bundle = isinstance(bundle, dict)
        resolved_snapshot: Optional[Dict[str, Any]] = bundle if has_bundle else None
    else:
        resolved_snapshot = (
            dict(snapshot)
            if isinstance(snapshot, dict)
            else record.respondent_pdf_snapshot if isinstance(record.respondent_pdf_snapshot, dict) else None
        )
        has_bundle = resolved_snapshot is not None

    download_enabled = (
        bool(enabled)
        if enabled is not None
        else has_bundle and respondent_pdf_download_enabled(record)
    )
    if not download_enabled or not has_bundle:
        return None

    normalized_token = str(token or "").strip()
    normalized_response_id = str(response_id or "").strip()
    if not normalized_token or not normalized_response_id:
        return None

    if is_group:
        base_name = str(
            getattr(record, "group_name", None)
            or getattr(record, "title", None)
            or "fill-link-response"
        )
        filename = f"{sanitize_basename_segment(base_name, 'fill-link-response')}.zip"
        mode = "flat"
    else:
        assert resolved_snapshot is not None
        filename = safe_pdf_download_filename(
            str(resolved_snapshot.get("filename") or record.template_name or record.title or "fill-link-response"),
            "fill-link-response",
        )
        mode = _normalize_download_mode(resolved_snapshot.get("downloadMode"))

    return {
        "enabled": True,
        "responseId": normalized_response_id,
        "downloadPath": f"/api/fill-links/public/{normalized_token}/responses/{normalized_response_id}/download",
        "filename": filename,
        "mode": mode,
    }


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return str(value).strip()


def _coerce_checkbox_presence(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, list):
        return True if value else False
    text = _coerce_text(value).lower()
    if not text:
        return None
    if text in _BOOLEAN_TRUE:
        return True
    if text in _BOOLEAN_FALSE:
        return False
    return True


def _coerce_checkbox_boolean(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = _coerce_text(value).lower()
    if not text:
        return None
    if text in _BOOLEAN_TRUE:
        return True
    if text in _BOOLEAN_FALSE:
        return False
    return None


def _split_multi_value(value: Any) -> List[str]:
    if isinstance(value, list):
        return [entry for entry in (_coerce_text(item) for item in value) if entry]
    text = _coerce_text(value)
    if not text:
        return []
    normalized = text.replace("\n", ",").replace(";", ",")
    return [entry.strip() for entry in normalized.split(",") if entry.strip()]


def _parse_date_value(value: Any) -> Optional[str]:
    text = _coerce_text(value)
    if not text:
        return None
    digits = text.replace("/", "-")
    if len(digits) >= 10 and digits[4] == "-" and digits[7] == "-":
        return digits[:10]
    return None


def _normalized_answers(answers: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    for key, value in (answers or {}).items():
        normalized_key = normalize_data_key(str(key or ""))
        if normalized_key:
            normalized[normalized_key] = value
    return normalized


def _build_checkbox_groups(fields: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    groups: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for field in fields:
        if str(field.get("type") or "text").strip().lower() != "checkbox":
            continue
        raw_group_key = str(field.get("groupKey") or field.get("name") or "").strip()
        group_key = normalize_data_key(raw_group_key)
        if not group_key:
            continue
        raw_option_key = str(field.get("optionKey") or field.get("name") or "").strip()
        option_key = normalize_data_key(raw_option_key)
        if not option_key:
            continue
        group = groups.setdefault(group_key, {})
        group.setdefault(option_key, []).append(field)
    return groups


def _build_radio_groups(
    fields: Iterable[Dict[str, Any]],
    radio_group_payloads: Iterable[Dict[str, Any]],
) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    declared_group_keys = {
        normalize_data_key(str(entry.get("groupKey") or entry.get("key") or ""))
        for entry in radio_group_payloads
        if isinstance(entry, dict)
    }
    declared_group_keys.discard("")
    groups: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for field in fields:
        field_type = str(field.get("type") or "text").strip().lower()
        raw_group_key = str(field.get("radioGroupKey") or field.get("groupKey") or field.get("group") or field.get("name") or "").strip()
        group_key = normalize_data_key(raw_group_key)
        raw_option_key = str(field.get("radioOptionKey") or field.get("optionKey") or field.get("exportValue") or field.get("name") or "").strip()
        option_key = normalize_data_key(raw_option_key)
        if not group_key or not option_key:
            continue
        if field_type != "radio" and group_key not in declared_group_keys:
            continue
        group = groups.setdefault(group_key, {})
        group.setdefault(option_key, []).append(field)
    return groups


def _build_direct_checkbox_fields(fields: Iterable[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    direct_fields: Dict[str, List[Dict[str, Any]]] = {}
    for field in fields:
        if str(field.get("type") or "text").strip().lower() != "checkbox":
            continue
        group_key = normalize_data_key(str(field.get("groupKey") or ""))
        option_key = normalize_data_key(str(field.get("optionKey") or ""))
        if group_key and option_key:
            continue
        field_key = normalize_data_key(str(field.get("name") or ""))
        if not field_key:
            continue
        direct_fields.setdefault(field_key, []).append(field)
    return direct_fields


def _resolve_option_aliases(group_options: Dict[str, List[Dict[str, Any]]]) -> Dict[str, str]:
    aliases: Dict[str, str] = {}
    for option_key, entries in group_options.items():
        aliases[option_key] = option_key
        for entry in entries:
            option_label = normalize_data_key(
                str(entry.get("optionLabel") or entry.get("radioOptionLabel") or "")
            )
            if option_label:
                aliases[option_label] = option_key
            option_name = normalize_data_key(str(entry.get("name") or ""))
            if option_name:
                aliases[option_name] = option_key
            export_value = normalize_data_key(str(entry.get("exportValue") or ""))
            if export_value:
                aliases[export_value] = option_key
    return aliases


def _set_checkbox_group_values(
    group_options: Dict[str, List[Dict[str, Any]]],
    selected_option_keys: Iterable[str],
) -> None:
    selected = {normalize_data_key(option_key) for option_key in selected_option_keys if normalize_data_key(option_key)}
    for option_key, entries in group_options.items():
        next_value = option_key in selected
        for entry in entries:
            entry["value"] = next_value


def _apply_radio_group_value(
    *,
    group_options: Dict[str, List[Dict[str, Any]]],
    aliases: Dict[str, str],
    raw_value: Any,
) -> bool:
    resolved_option = _resolve_mapped_option(aliases, raw_value)
    if not resolved_option:
        return False
    _set_checkbox_group_values(group_options, [resolved_option])
    return True


def _resolve_mapped_option(
    aliases: Dict[str, str],
    value: Any,
    *,
    value_map: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    normalized_value = normalize_data_key(_coerce_text(value))
    if not normalized_value:
        return None
    if isinstance(value_map, dict):
        mapped = value_map.get(normalized_value)
        if mapped is None:
            mapped = value_map.get(_coerce_text(value))
        mapped_key = normalize_data_key(_coerce_text(mapped))
        if mapped_key and mapped_key in aliases:
            return aliases[mapped_key]
    return aliases.get(normalized_value)


def _apply_checkbox_rule_to_group(
    *,
    group_options: Dict[str, List[Dict[str, Any]]],
    aliases: Dict[str, str],
    raw_value: Any,
    rule: Optional[Dict[str, Any]] = None,
) -> bool:
    operation = normalize_data_key(str((rule or {}).get("operation") or "yes_no")) or "yes_no"
    value_map = (rule or {}).get("valueMap") if isinstance((rule or {}).get("valueMap"), dict) else None
    if operation in {"list", "enum"} or rule is None:
        matches: List[str] = []
        for entry in _split_multi_value(raw_value):
            resolved = _resolve_mapped_option(aliases, entry, value_map=value_map)
            if not resolved:
                if rule is not None and operation in {"list", "enum"}:
                    continue
                matches = []
                break
            matches.append(resolved)
            if operation == "enum":
                break
        if not matches:
            if rule is not None and operation in {"list", "enum"}:
                return False
        else:
            _set_checkbox_group_values(group_options, matches)
            return True

    presence = _coerce_checkbox_boolean(raw_value)
    if presence is None:
        return False
    if isinstance(rule, dict):
        true_option = _resolve_mapped_option(aliases, rule.get("trueOption"), value_map=value_map)
        false_option = _resolve_mapped_option(aliases, rule.get("falseOption"), value_map=value_map)
        if presence and true_option:
            _set_checkbox_group_values(group_options, [true_option])
            return True
        if not presence and false_option:
            _set_checkbox_group_values(group_options, [false_option])
            return True
    if "yes" in aliases and "no" in aliases:
        _set_checkbox_group_values(group_options, ["yes"] if presence else ["no"])
        return True
    if presence:
        fallback = next(iter(group_options.keys()), None)
        if fallback:
            _set_checkbox_group_values(group_options, [fallback])
            return True
    _set_checkbox_group_values(group_options, [])
    return True


def _resolve_transform_value(rule: Dict[str, Any], answers: Dict[str, Any]) -> Any:
    operation = normalize_data_key(str(rule.get("operation") or "copy")) or "copy"
    sources = [normalize_data_key(str(source or "")) for source in rule.get("sources") or []]
    sources = [source for source in sources if source]
    if not sources:
        return None
    values = [answers.get(source) for source in sources]
    texts = [_coerce_text(value) for value in values]

    if operation == "copy":
        return values[0]
    if operation == "concat":
        separator = str(rule.get("separator") or " ")
        parts = [entry for entry in texts if entry]
        return separator.join(parts) if parts else None
    if operation == "split_name_first_rest":
        tokens = [entry for entry in texts[0].split() if entry]
        if not tokens:
            return None
        return tokens[0] if normalize_data_key(str(rule.get("part") or "")) == "first" else " ".join(tokens[1:]) or tokens[0]
    if operation == "split_delimiter":
        delimiter = str(rule.get("delimiter") or rule.get("separator") or "")
        if not delimiter:
            return None
        parts = [entry.strip() for entry in texts[0].split(delimiter)]
        if not parts:
            return None
        if isinstance(rule.get("index"), int):
            index = int(rule["index"])
            return parts[index] if 0 <= index < len(parts) else None
        part = normalize_data_key(str(rule.get("part") or ""))
        if part == "last":
            return parts[-1]
        if part == "rest":
            return " ".join(entry for entry in parts[1:] if entry).strip() or parts[0]
        return parts[0]
    return None


def apply_fill_link_answers_to_fields(snapshot: Dict[str, Any], answers: Dict[str, Any]) -> List[Dict[str, Any]]:
    fields = [dict(entry) for entry in coerce_field_payloads(list(snapshot.get("fields") or []))]
    normalized_answers = _normalized_answers(answers)
    checkbox_groups = _build_checkbox_groups(fields)
    radio_groups = _build_radio_groups(fields, _coerce_dict_list(snapshot.get("radioGroups")))
    direct_checkbox_fields = _build_direct_checkbox_fields(fields)
    handled_groups: set[str] = set()
    rules = _coerce_dict_list(snapshot.get("checkboxRules"))

    for answer_key, raw_value in normalized_answers.items():
        radio_options = radio_groups.get(answer_key)
        if not radio_options:
            continue
        aliases = _resolve_option_aliases(radio_options)
        if _apply_radio_group_value(
            group_options=radio_options,
            aliases=aliases,
            raw_value=raw_value,
        ):
            handled_groups.add(answer_key)

    for rule in rules:
        group_key = normalize_data_key(str(rule.get("groupKey") or ""))
        answer_key = normalize_data_key(str(rule.get("databaseField") or rule.get("key") or ""))
        if not group_key or not answer_key or answer_key not in normalized_answers:
            continue
        group_options = checkbox_groups.get(group_key)
        if not group_options:
            continue
        aliases = _resolve_option_aliases(group_options)
        if _apply_checkbox_rule_to_group(
            group_options=group_options,
            aliases=aliases,
            raw_value=normalized_answers[answer_key],
            rule=rule,
        ):
            handled_groups.add(group_key)

    for answer_key, raw_value in normalized_answers.items():
        if answer_key in handled_groups:
            continue
        group_options = checkbox_groups.get(answer_key)
        if not group_options:
            continue
        aliases = _resolve_option_aliases(group_options)
        if _apply_checkbox_rule_to_group(
            group_options=group_options,
            aliases=aliases,
            raw_value=raw_value,
            rule=None,
        ):
            handled_groups.add(answer_key)

    for answer_key, raw_value in normalized_answers.items():
        checkbox_fields = direct_checkbox_fields.get(answer_key)
        if not checkbox_fields:
            continue
        next_value = _coerce_checkbox_presence(raw_value)
        if next_value is None:
            continue
        for field in checkbox_fields:
            field["value"] = next_value

    rules_by_target: Dict[str, List[Dict[str, Any]]] = {}
    for rule in _coerce_dict_list(snapshot.get("textTransformRules")):
        target = normalize_data_key(str(rule.get("targetField") or ""))
        if not target:
            continue
        rules_by_target.setdefault(target, []).append(rule)

    for field in fields:
        field_type = str(field.get("type") or "text").strip().lower()
        if field_type in {"checkbox", "radio"}:
            continue
        field_name = normalize_data_key(str(field.get("name") or ""))
        if not field_name:
            continue
        value = normalized_answers.get(field_name)
        if value is None:
            for rule in rules_by_target.get(field_name, []):
                transformed = _resolve_transform_value(rule, normalized_answers)
                if transformed is None:
                    continue
                if isinstance(transformed, str) and not transformed.strip():
                    continue
                value = transformed
                break
        if value is None:
            continue
        if field_type == "date":
            date_value = _parse_date_value(value)
            if date_value:
                field["value"] = date_value
                continue
        field["value"] = value

    return fields


def materialize_fill_link_response_download(
    snapshot: Dict[str, Any],
    *,
    answers: Dict[str, Any],
    export_mode: str | None = None,
) -> tuple[Path, List[Path], str]:
    source_pdf_path = str(snapshot.get("sourcePdfPath") or "").strip()
    if not source_pdf_path or not is_gcs_path(source_pdf_path):
        raise FileNotFoundError("Saved form PDF is unavailable for respondent download.")
    source_pdf_bytes = download_pdf_bytes(source_pdf_path)
    filled_fields = apply_fill_link_answers_to_fields(snapshot, answers)

    source_fd, source_name = tempfile.mkstemp(suffix=".pdf")
    template_fd, template_name = tempfile.mkstemp(suffix=".json")
    output_fd, output_name = tempfile.mkstemp(suffix=".pdf")
    for handle in (source_fd, template_fd, output_fd):
        os.close(handle)
    Path(source_name).write_bytes(source_pdf_bytes)
    Path(template_name).write_text(
        json.dumps(
            {
                "coordinateSystem": "originTop",
                "fields": filled_fields,
            }
        ),
        encoding="utf-8",
    )
    cleanup_targets = [Path(source_name), Path(template_name), Path(output_name)]
    try:
        inject_fields(Path(source_name), Path(template_name), Path(output_name))
        resolved_export_mode = _normalize_download_mode(
            export_mode if export_mode is not None else snapshot.get("downloadMode")
        )
        if resolved_export_mode == "flat":
            Path(output_name).write_bytes(flatten_pdf_form_widgets(Path(output_name).read_bytes()))
    except Exception:
        for path in cleanup_targets:
            path.unlink(missing_ok=True)
        raise
    filename = safe_pdf_download_filename(
        str(snapshot.get("filename") or snapshot.get("templateName") or "fill-link-response"),
        "fill-link-response",
    )
    return Path(output_name), cleanup_targets, filename


# ---------------------------------------------------------------------------
# Group Fill By Link publish + materialization (Phase 3)
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def build_group_fill_link_publish_snapshot(
    *,
    canonical_schema: Mapping[str, Any],
    template_records: Iterable[Any],
    template_sources: Iterable[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Bundle a Phase 1 canonical schema with per-template materialization snapshots.

    The publish handler calls this once after building the canonical schema so
    the resulting dict can be embedded on the fill_link Firestore record. At
    download time, ``materialize_group_fill_link_response_packet`` walks the
    embedded ``templateSnapshots`` list and reuses the existing
    ``materialize_fill_link_response_download`` per template.

    Args:
        canonical_schema: A Phase 1 ``GroupCanonicalSchema`` (dict-shaped).
        template_records: TemplateRecord-like objects with ``id``,
            ``pdf_bucket_path``, ``name``, and ``metadata`` attributes.
        template_sources: The raw source dicts from the publish payload —
            same shape as ``_normalize_group_template_sources`` produces:
            ``{"templateId", "templateName", "fields", "checkboxRules"}``.
            Each source's ``fields`` are the post-rename field metadata as
            displayed in the workspace.

    Raises:
        ValueError: if any source's template is missing from ``template_records``
            or the per-template snapshot build fails (e.g. invalid bucket path).
    """

    template_record_lookup = {
        getattr(record, "id", None): record for record in template_records
    }
    per_template_snapshots: List[Dict[str, Any]] = []
    for source in template_sources:
        if not isinstance(source, Mapping):
            continue
        template_id = str(source.get("templateId") or "").strip()
        if not template_id:
            continue
        template_record = template_record_lookup.get(template_id)
        if template_record is None:
            raise ValueError(
                f"Template {template_id!r} is missing from the publish payload."
            )
        raw_fields = source.get("fields") if isinstance(source.get("fields"), list) else []
        # The caller may already know the page count (e.g. because it just
        # loaded the editor snapshot). Pass it through so the per-template
        # snapshot carries a real value even when the template record's
        # editorSnapshot manifest is stale or missing pageCount.
        source_page_count: Optional[int]
        try:
            source_page_count = int(source.get("pageCount")) if source.get("pageCount") is not None else None
        except (TypeError, ValueError):
            source_page_count = None
        try:
            template_snapshot = build_template_fill_link_download_snapshot(
                template=template_record,
                fields=raw_fields,
                export_mode="flat",
                page_count=source_page_count,
            )
        except ValueError as exc:
            raise ValueError(
                f"Failed to build per-template snapshot for {template_id!r}: {exc}"
            ) from exc
        per_template_snapshots.append(
            {
                "templateId": template_id,
                "templateName": template_snapshot.get("templateName") or template_id,
                "snapshot": template_snapshot,
            }
        )

    return {
        "snapshotFormatVersion": GROUP_FILL_LINK_PUBLISH_SNAPSHOT_FORMAT_VERSION,
        "frozenAt": _now_iso(),
        "schema": dict(canonical_schema),
        "templateSnapshots": per_template_snapshots,
    }


def group_fill_link_publish_snapshot_template_count(
    canonical_schema_snapshot: Optional[Mapping[str, Any]],
) -> int:
    if not isinstance(canonical_schema_snapshot, Mapping):
        return 0
    template_snapshots = canonical_schema_snapshot.get("templateSnapshots")
    if not isinstance(template_snapshots, list):
        return 0
    return sum(1 for entry in template_snapshots if isinstance(entry, dict))


def materialize_group_fill_link_response_packet(
    *,
    canonical_schema_snapshot: Mapping[str, Any],
    answers: Mapping[str, Any],
    base_filename: str,
) -> tuple[Path, List[Path], str]:
    """Produce a zip of per-template PDFs from a single group fill link response.

    The function:
      1. Walks the bundle's ``templateSnapshots`` list.
      2. Calls ``materialize_fill_link_response_download`` for each per-template
         snapshot, passing the same ``answers`` dict — the existing per-template
         apply path already handles canonical-key projection because the
         workspace rename pipeline ensures field names match the merged
         canonical question keys.
      3. Collects the resulting PDF byte streams.
      4. Zips them into a single archive named ``{base_filename}.zip``.

    Returns ``(zip_path, cleanup_paths, zip_filename)`` mirroring the per-template
    helper's contract so the route can plug it into ``BackgroundTasks`` without
    a parallel cleanup story.
    """

    if not isinstance(canonical_schema_snapshot, Mapping):
        raise ValueError("Group fill link is missing its canonical schema snapshot.")
    template_snapshots = canonical_schema_snapshot.get("templateSnapshots")
    if not isinstance(template_snapshots, list) or not template_snapshots:
        raise ValueError("Group fill link snapshot has no template entries to materialize.")

    cleanup_paths: List[Path] = []
    pdf_payloads: List[tuple[str, bytes]] = []
    used_archive_names: set[str] = set()

    try:
        for entry in template_snapshots:
            if not isinstance(entry, dict):
                continue
            template_snapshot = entry.get("snapshot")
            if not isinstance(template_snapshot, dict):
                continue
            template_id = str(entry.get("templateId") or "").strip() or "template"
            template_name = (
                str(entry.get("templateName") or template_snapshot.get("templateName") or template_id).strip()
                or template_id
            )
            try:
                pdf_path, per_template_cleanup, _ = materialize_fill_link_response_download(
                    template_snapshot,
                    answers=dict(answers),
                )
            except Exception as exc:
                logger.warning(
                    "Group fill link materialization failed for template=%s: %s",
                    template_id,
                    exc,
                )
                raise
            cleanup_paths.extend(per_template_cleanup)
            pdf_bytes = pdf_path.read_bytes()
            archive_name = _resolve_unique_archive_name(template_name, used_archive_names)
            used_archive_names.add(archive_name)
            pdf_payloads.append((archive_name, pdf_bytes))

        if not pdf_payloads:
            raise ValueError("Group fill link snapshot produced no PDFs.")

        zip_fd, zip_name = tempfile.mkstemp(suffix=".zip")
        os.close(zip_fd)
        zip_path = Path(zip_name)
        cleanup_paths.append(zip_path)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for archive_name, pdf_bytes in pdf_payloads:
                archive.writestr(archive_name, pdf_bytes)
        zip_path.write_bytes(buffer.getvalue())
    except Exception:
        for path in cleanup_paths:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass
        raise

    zip_filename = safe_pdf_download_filename(base_filename, "fill-link-response").rsplit(".", 1)[0] + ".zip"
    return zip_path, cleanup_paths, zip_filename


def _resolve_unique_archive_name(template_name: str, used: set[str]) -> str:
    base = safe_pdf_download_filename(template_name, "fill-link-response")
    if not base.lower().endswith(".pdf"):
        base = f"{base}.pdf"
    candidate = base
    counter = 2
    stem = base[:-4] if base.lower().endswith(".pdf") else base
    while candidate in used:
        candidate = f"{stem}-{counter}.pdf"
        counter += 1
    return candidate
