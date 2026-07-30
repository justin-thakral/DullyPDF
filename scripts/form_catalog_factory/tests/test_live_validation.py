from __future__ import annotations

import hashlib
import io
import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from reportlab.pdfgen import canvas

from scripts.form_catalog_factory.live_validation import validate_live_samples


def _pdf_bytes() -> bytes:
    output = io.BytesIO()
    document = canvas.Canvas(output, invariant=1)
    document.drawString(72, 720, "Live validation fixture")
    document.acroForm.textfield(
        name="fixture_name",
        tooltip="Fixture name",
        x=72,
        y=680,
        width=200,
        height=20,
    )
    document.save()
    return output.getvalue()


def _webp_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (12, 12), color=(15, 42, 67)).save(output, format="WEBP")
    return output.getvalue()


@contextmanager
def _live_server(
    pdf: bytes,
    thumbnail: bytes,
    *,
    include_identity: bool = True,
):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
            if self.path == "/forms/test-slug":
                marker = ""
                if include_identity:
                    marker = (
                        '<main data-form-catalog-source-section="section" '
                        'data-form-catalog-filename="sample.pdf" '
                        f'data-form-catalog-sha256="{hashlib.sha256(pdf).hexdigest()}" '
                        'data-form-catalog-pdf-url="'
                        'https://storage.googleapis.com/catalog-test/'
                        'releases/catalog-test/assets/section/sample.pdf">'
                        "</main>"
                    )
                body = (
                    f"<!doctype html><html><body>DullyPDF{marker}</body></html>"
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
            elif self.path.endswith("/sample.pdf"):
                body = pdf
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header(
                    "Cache-Control",
                    "public, max-age=31536000, immutable",
                )
            elif self.path.endswith("/sample.webp"):
                body = thumbnail
                self.send_response(200)
                self.send_header("Content-Type", "image/webp")
                self.send_header(
                    "Cache-Control",
                    "public, max-age=31536000, immutable",
                )
            else:
                body = b"not found"
                self.send_response(404)
                self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args) -> None:
            del format, args

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def _sample_plan(path: Path, pdf: bytes, thumbnail: bytes) -> Path:
    payload = {
        "schemaVersion": 1,
        "releaseId": "catalog-test",
        "sourceCommit": "a" * 40,
        "manifestSha256": "b" * 64,
        "browserCatalogIds": ["section/sample"],
        "samples": [
            {
                "catalogId": "section/sample",
                "slug": "test-slug",
                "sourceSection": "section",
                "filename": "sample.pdf",
                "pdfPath": "releases/catalog-test/assets/section/sample.pdf",
                "thumbnailPath": "releases/catalog-test/assets/section/sample.webp",
                "sha256": hashlib.sha256(pdf).hexdigest(),
                "bytes": len(pdf),
                "thumbnailSha256": hashlib.sha256(thumbnail).hexdigest(),
                "thumbnailBytes": len(thumbnail),
                "pageCount": 1,
                "fieldCount": 1,
                "random": True,
                "canaryRoles": ["largest_field_count"],
                "browserCanary": True,
            }
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_live_validation_checks_pages_exact_bytes_and_pdf_shape(tmp_path: Path) -> None:
    pdf = _pdf_bytes()
    thumbnail = _webp_bytes()
    plan = _sample_plan(tmp_path / "samples.json", pdf, thumbnail)

    with _live_server(pdf, thumbnail) as origin:
        report = validate_live_samples(
            sample_plan_path=plan,
            site_origins=[origin],
            asset_base_urls=[f"{origin}/form-catalog-assets"],
            hosting_version="sites/dullypdf/versions/catalog-test",
        )

    assert report["ok"] is True
    assert report["reportType"] == "form-catalog-live-http"
    assert report["sourceCommit"] == "a" * 40
    assert report["manifestSha256"] == "b" * 64
    assert report["samplePlanSha256"] == hashlib.sha256(
        plan.read_bytes()
    ).hexdigest()
    assert report["hostingVersion"] == "sites/dullypdf/versions/catalog-test"
    sample = report["results"][0]
    assert sample["catalogPages"][0]["ok"] is True
    assert sample["pdfAssets"][0]["pageCount"] == 1
    assert sample["pdfAssets"][0]["fieldCount"] == 1
    assert sample["thumbnailAssets"][0]["ok"] is True


def test_live_validation_fails_closed_on_hash_drift(tmp_path: Path) -> None:
    pdf = _pdf_bytes()
    thumbnail = _webp_bytes()
    plan = _sample_plan(tmp_path / "samples.json", pdf, thumbnail)
    payload = json.loads(plan.read_text(encoding="utf-8"))
    payload["samples"][0]["sha256"] = "0" * 64
    plan.write_text(json.dumps(payload), encoding="utf-8")

    with _live_server(pdf, thumbnail) as origin:
        report = validate_live_samples(
            sample_plan_path=plan,
            site_origins=[origin],
            asset_base_urls=[f"{origin}/form-catalog-assets"],
            hosting_version="sites/dullypdf/versions/catalog-test",
        )

    assert report["ok"] is False
    assert "SHA-256 does not match" in " ".join(
        report["results"][0]["pdfAssets"][0]["errors"]
    )


def test_live_validation_rejects_generic_catalog_html(tmp_path: Path) -> None:
    pdf = _pdf_bytes()
    thumbnail = _webp_bytes()
    plan = _sample_plan(tmp_path / "samples.json", pdf, thumbnail)

    with _live_server(pdf, thumbnail, include_identity=False) as origin:
        report = validate_live_samples(
            sample_plan_path=plan,
            site_origins=[origin],
            asset_base_urls=[f"{origin}/form-catalog-assets"],
            hosting_version="sites/dullypdf/versions/catalog-test",
        )

    page = report["results"][0]["catalogPages"][0]
    assert report["ok"] is False
    assert page["ok"] is False
    assert "server-rendered catalog identity marker" in " ".join(page["errors"])
