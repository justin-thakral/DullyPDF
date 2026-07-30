"""Live HTTP verification for a sampled immutable catalog release."""

from __future__ import annotations

import hashlib
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable

from pypdf import PdfReader


LIVE_REPORT_SCHEMA_VERSION = 1
MAX_HTML_BYTES = 2 * 1024 * 1024
MAX_ASSET_BYTES = 32 * 1024 * 1024
MAX_AGE_PATTERN = re.compile(r"(?:^|,)\s*max-age=(\d+)", re.IGNORECASE)
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class LiveValidationError(RuntimeError):
    """The live sample plan or HTTP configuration is invalid."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_plan(path: str | Path) -> dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LiveValidationError(f"Could not read sample plan: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise LiveValidationError("Sample plan has an unsupported schema version")
    samples = payload.get("samples")
    if not isinstance(samples, list) or not samples:
        raise LiveValidationError("Sample plan must contain at least one sample")
    if not isinstance(payload.get("releaseId"), str) or not payload["releaseId"]:
        raise LiveValidationError("Sample plan has no releaseId")
    if (
        not isinstance(payload.get("sourceCommit"), str)
        or not re.fullmatch(
            r"[0-9a-f]{40}(?:[0-9a-f]{24})?",
            payload["sourceCommit"],
        )
    ):
        raise LiveValidationError("Sample plan has an invalid sourceCommit")
    if (
        not isinstance(payload.get("manifestSha256"), str)
        or not SHA256_PATTERN.fullmatch(payload["manifestSha256"])
    ):
        raise LiveValidationError("Sample plan has an invalid manifestSha256")
    browser_ids = payload.get("browserCatalogIds")
    if (
        not isinstance(browser_ids, list)
        or not 1 <= len(browser_ids) <= 3
        or len(set(browser_ids)) != len(browser_ids)
    ):
        raise LiveValidationError(
            "Sample plan must contain 1 to 3 distinct browserCatalogIds"
        )
    catalog_ids: set[str] = set()
    slugs: set[str] = set()
    release_prefix = f"releases/{payload['releaseId']}/assets/"
    for index, sample in enumerate(samples):
        location = f"samples[{index}]"
        if not isinstance(sample, dict):
            raise LiveValidationError(f"{location} must be an object")
        catalog_id = sample.get("catalogId")
        slug = sample.get("slug")
        source_section = sample.get("sourceSection")
        filename = sample.get("filename")
        if (
            not isinstance(catalog_id, str)
            or not catalog_id
            or not isinstance(slug, str)
            or not slug
            or not isinstance(source_section, str)
            or not source_section
            or not isinstance(filename, str)
            or not filename.lower().endswith(".pdf")
        ):
            raise LiveValidationError(f"{location} has incomplete catalog identity")
        if catalog_id != f"{source_section}/{filename[:-4]}":
            raise LiveValidationError(f"{location}.catalogId does not match source identity")
        if catalog_id in catalog_ids or slug in slugs:
            raise LiveValidationError("Sample plan contains duplicate catalog IDs or slugs")
        catalog_ids.add(catalog_id)
        slugs.add(slug)
        for key, suffix in (("pdfPath", ".pdf"), ("thumbnailPath", ".webp")):
            asset_path = sample.get(key)
            if (
                not isinstance(asset_path, str)
                or not asset_path.startswith(release_prefix)
                or not asset_path.lower().endswith(suffix)
            ):
                raise LiveValidationError(
                    f"{location}.{key} must use the sampled immutable release"
                )
    if any(catalog_id not in catalog_ids for catalog_id in browser_ids):
        raise LiveValidationError(
            "Sample plan browserCatalogIds must be present in samples"
        )
    return payload


def _normalize_bases(values: Iterable[str], label: str) -> list[str]:
    normalized: list[str] = []
    for value in values:
        base = str(value or "").strip().rstrip("/")
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise LiveValidationError(f"{label} must be an HTTP(S) origin: {value!r}")
        if parsed.query or parsed.fragment:
            raise LiveValidationError(f"{label} must not contain a query or fragment")
        if base not in normalized:
            normalized.append(base)
    if not normalized:
        raise LiveValidationError(f"At least one {label} is required")
    return normalized


class _CatalogIdentityParser(HTMLParser):
    """Collect explicit server-rendered catalog identity markers."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.markers: list[dict[str, str]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        del tag
        attributes = {key: value or "" for key, value in attrs}
        if "data-form-catalog-pdf-url" in attributes:
            self.markers.append(attributes)


def _catalog_identity_marker(
    body: bytes,
    sample: dict[str, Any],
) -> tuple[dict[str, str] | None, list[str]]:
    errors: list[str] = []
    parser = _CatalogIdentityParser()
    try:
        parser.feed(body.decode("utf-8", errors="replace"))
    except Exception as exc:
        return None, [f"could not parse catalog identity marker: {exc}"]
    if len(parser.markers) != 1:
        return None, [
            "expected exactly one server-rendered catalog identity marker, "
            f"found {len(parser.markers)}"
        ]
    marker = parser.markers[0]
    expected = {
        "data-form-catalog-source-section": str(sample.get("sourceSection") or ""),
        "data-form-catalog-filename": str(sample.get("filename") or ""),
        "data-form-catalog-sha256": str(sample.get("sha256") or ""),
    }
    for key, value in expected.items():
        if marker.get(key) != value:
            errors.append(f"{key} does not match the sampled release identity")

    expected_pdf_path = str(sample.get("pdfPath") or "").lstrip("/")
    marker_pdf_url = marker.get("data-form-catalog-pdf-url", "")
    parsed_pdf_url = urllib.parse.urlsplit(marker_pdf_url)
    marker_pdf_path = urllib.parse.unquote(parsed_pdf_url.path).lstrip("/")
    if not expected_pdf_path or not (
        marker_pdf_path == expected_pdf_path
        or marker_pdf_path.endswith(f"/{expected_pdf_path}")
    ):
        errors.append(
            "data-form-catalog-pdf-url does not reference the sampled immutable PDF path"
        )
    return marker, errors


def _asset_url(base: str, object_path: str) -> str:
    normalized_path = str(object_path or "").lstrip("/")
    if not normalized_path or ".." in normalized_path.split("/"):
        raise LiveValidationError(f"Invalid sampled asset path: {object_path!r}")
    return f"{base}/{urllib.parse.quote(normalized_path, safe='/')}"


def _fetch(url: str, *, timeout_seconds: float, max_bytes: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "User-Agent": "DullyPDF-Catalog-Release-Smoke/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise LiveValidationError(
                    f"Response exceeded the {max_bytes}-byte safety limit"
                )
            return {
                "status": int(response.status),
                "url": response.geturl(),
                "headers": {
                    key.lower(): value
                    for key, value in response.headers.items()
                },
                "body": body,
            }
    except urllib.error.HTTPError as exc:
        body = exc.read(min(max_bytes, 4096))
        return {
            "status": int(exc.code),
            "url": exc.geturl(),
            "headers": {
                key.lower(): value
                for key, value in exc.headers.items()
            },
            "body": body,
        }
    except (OSError, urllib.error.URLError, LiveValidationError) as exc:
        return {
            "status": None,
            "url": url,
            "headers": {},
            "body": b"",
            "transportError": str(exc),
        }


def _cache_errors(headers: dict[str, str]) -> list[str]:
    cache_control = headers.get("cache-control", "")
    errors: list[str] = []
    if "immutable" not in cache_control.lower():
        errors.append("cache-control is missing immutable")
    match = MAX_AGE_PATTERN.search(cache_control)
    if match is None or int(match.group(1)) < 31_536_000:
        errors.append("cache-control max-age is below one year")
    return errors


def _validate_catalog_page(
    *,
    origin: str,
    sample: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    slug = str(sample.get("slug") or "")
    url = f"{origin}/forms/{urllib.parse.quote(slug, safe='')}"
    response = _fetch(url, timeout_seconds=timeout_seconds, max_bytes=MAX_HTML_BYTES)
    errors: list[str] = []
    if response.get("transportError"):
        errors.append(f"transport error: {response['transportError']}")
    if response["status"] != 200:
        errors.append(f"expected HTTP 200, received {response['status']}")
    content_type = response["headers"].get("content-type", "").lower()
    if "text/html" not in content_type:
        errors.append(f"expected HTML content type, received {content_type or '<missing>'}")
    body_text = response["body"].decode("utf-8", errors="replace").lower()
    if "<html" not in body_text or "</html>" not in body_text:
        errors.append("response does not contain a complete HTML document")
    identity_marker, identity_errors = _catalog_identity_marker(
        response["body"],
        sample,
    )
    errors.extend(identity_errors)
    return {
        "origin": origin,
        "url": url,
        "finalUrl": response["url"],
        "status": response["status"],
        "bytes": len(response["body"]),
        "contentType": response["headers"].get("content-type"),
        "identityMarker": identity_marker,
        "ok": not errors,
        "errors": errors,
    }


def _validate_pdf_asset(
    *,
    asset_base: str,
    sample: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    url = _asset_url(asset_base, str(sample.get("pdfPath") or ""))
    response = _fetch(url, timeout_seconds=timeout_seconds, max_bytes=MAX_ASSET_BYTES)
    body = response["body"]
    errors: list[str] = []
    if response.get("transportError"):
        errors.append(f"transport error: {response['transportError']}")
    if response["status"] != 200:
        errors.append(f"expected HTTP 200, received {response['status']}")
    content_type = response["headers"].get("content-type", "").lower()
    if "application/pdf" not in content_type:
        errors.append(f"expected application/pdf, received {content_type or '<missing>'}")
    if not body.startswith(b"%PDF-"):
        errors.append("response does not begin with PDF magic bytes")
    expected_bytes = int(sample.get("bytes") or 0)
    if len(body) != expected_bytes:
        errors.append(f"expected {expected_bytes} bytes, received {len(body)}")
    actual_sha256 = hashlib.sha256(body).hexdigest()
    if actual_sha256 != str(sample.get("sha256") or ""):
        errors.append("SHA-256 does not match the frozen manifest")
    errors.extend(_cache_errors(response["headers"]))

    actual_pages: int | None = None
    actual_fields: int | None = None
    if body.startswith(b"%PDF-"):
        try:
            reader = PdfReader(io.BytesIO(body), strict=False)
            actual_pages = len(reader.pages)
            actual_fields = len(reader.get_fields() or {})
            if actual_pages != int(sample.get("pageCount") or 0):
                errors.append(
                    f"expected {sample.get('pageCount')} pages, found {actual_pages}"
                )
            if actual_fields != int(sample.get("fieldCount") or 0):
                errors.append(
                    f"expected {sample.get('fieldCount')} fields, found {actual_fields}"
                )
        except Exception as exc:
            errors.append(f"pypdf could not parse the live asset: {exc}")
    return {
        "assetBase": asset_base,
        "url": url,
        "finalUrl": response["url"],
        "status": response["status"],
        "bytes": len(body),
        "sha256": actual_sha256,
        "pageCount": actual_pages,
        "fieldCount": actual_fields,
        "contentType": response["headers"].get("content-type"),
        "cacheControl": response["headers"].get("cache-control"),
        "ok": not errors,
        "errors": errors,
    }


def _validate_thumbnail_asset(
    *,
    asset_base: str,
    sample: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    url = _asset_url(asset_base, str(sample.get("thumbnailPath") or ""))
    response = _fetch(url, timeout_seconds=timeout_seconds, max_bytes=MAX_ASSET_BYTES)
    body = response["body"]
    errors: list[str] = []
    if response.get("transportError"):
        errors.append(f"transport error: {response['transportError']}")
    if response["status"] != 200:
        errors.append(f"expected HTTP 200, received {response['status']}")
    content_type = response["headers"].get("content-type", "").lower()
    if "image/webp" not in content_type:
        errors.append(f"expected image/webp, received {content_type or '<missing>'}")
    if not (len(body) >= 12 and body[:4] == b"RIFF" and body[8:12] == b"WEBP"):
        errors.append("response does not contain WebP magic bytes")
    expected_bytes = int(sample.get("thumbnailBytes") or 0)
    if len(body) != expected_bytes:
        errors.append(f"expected {expected_bytes} bytes, received {len(body)}")
    actual_sha256 = hashlib.sha256(body).hexdigest()
    if actual_sha256 != str(sample.get("thumbnailSha256") or ""):
        errors.append("SHA-256 does not match the frozen thumbnail")
    errors.extend(_cache_errors(response["headers"]))
    return {
        "assetBase": asset_base,
        "url": url,
        "finalUrl": response["url"],
        "status": response["status"],
        "bytes": len(body),
        "sha256": actual_sha256,
        "contentType": response["headers"].get("content-type"),
        "cacheControl": response["headers"].get("cache-control"),
        "ok": not errors,
        "errors": errors,
    }


def validate_live_samples(
    *,
    sample_plan_path: str | Path,
    site_origins: Iterable[str],
    asset_base_urls: Iterable[str],
    hosting_version: str,
    timeout_seconds: float = 30,
) -> dict[str, Any]:
    """Verify sampled pages and exact immutable bytes from every live origin."""

    if timeout_seconds <= 0:
        raise LiveValidationError("timeout_seconds must be positive")
    if (
        not isinstance(hosting_version, str)
        or not hosting_version.strip()
        or hosting_version != hosting_version.strip()
    ):
        raise LiveValidationError("hosting_version must be a non-empty trimmed string")
    plan = _load_plan(sample_plan_path)
    sample_plan_sha256 = _sha256_file(sample_plan_path)
    normalized_sites = _normalize_bases(site_origins, "site origin")
    normalized_assets = _normalize_bases(asset_base_urls, "asset base URL")
    results: list[dict[str, Any]] = []
    for raw_sample in plan["samples"]:
        if not isinstance(raw_sample, dict):
            raise LiveValidationError("Every sampled entry must be an object")
        page_results = [
            _validate_catalog_page(
                origin=origin,
                sample=raw_sample,
                timeout_seconds=timeout_seconds,
            )
            for origin in normalized_sites
        ]
        pdf_results = [
            _validate_pdf_asset(
                asset_base=asset_base,
                sample=raw_sample,
                timeout_seconds=timeout_seconds,
            )
            for asset_base in normalized_assets
        ]
        thumbnail_results = [
            _validate_thumbnail_asset(
                asset_base=asset_base,
                sample=raw_sample,
                timeout_seconds=timeout_seconds,
            )
            for asset_base in normalized_assets
        ]
        checks = page_results + pdf_results + thumbnail_results
        results.append(
            {
                "catalogId": raw_sample.get("catalogId"),
                "slug": raw_sample.get("slug"),
                "random": bool(raw_sample.get("random")),
                "canaryRoles": raw_sample.get("canaryRoles") or [],
                "browserCanary": bool(raw_sample.get("browserCanary")),
                "ok": all(check["ok"] for check in checks),
                "catalogPages": page_results,
                "pdfAssets": pdf_results,
                "thumbnailAssets": thumbnail_results,
            }
        )
    return {
        "schemaVersion": LIVE_REPORT_SCHEMA_VERSION,
        "reportType": "form-catalog-live-http",
        "releaseId": plan.get("releaseId"),
        "sourceCommit": plan.get("sourceCommit"),
        "manifestSha256": plan.get("manifestSha256"),
        "samplePlanSha256": sample_plan_sha256,
        "hostingVersion": hosting_version,
        "checkedAt": _utc_now(),
        "siteOrigins": normalized_sites,
        "assetBaseUrls": normalized_assets,
        "sampleCount": len(results),
        "browserCatalogIds": plan.get("browserCatalogIds") or [],
        "ok": all(result["ok"] for result in results),
        "results": results,
    }


def write_live_report(path: str | Path, payload: dict[str, Any]) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
