#!/usr/bin/env python3
"""Generate incremental WebP thumbnails for PDFs under form_catalog/."""

from __future__ import annotations

import argparse
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable, Tuple

import fitz
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render first-page WebP thumbnails for form catalog PDFs.",
    )
    parser.add_argument(
        "--catalog-root",
        default="form_catalog",
        help="Root directory containing section subdirectories of PDFs.",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=320,
        help="Target thumbnail width in CSS pixels before WebP encoding.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=82,
        help="WebP quality from 0-100.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=max(1, min(8, (os.cpu_count() or 4))),
        help="Concurrent render workers. Keep modest to avoid PDF decode spikes.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild thumbnails even when the existing .webp is newer than the PDF.",
    )
    return parser.parse_args()


def iter_pdf_files(catalog_root: Path) -> Iterable[Path]:
    return sorted(path for path in catalog_root.rglob("*.pdf") if path.is_file())


def render_thumbnail(pdf_path: Path, width: int, quality: int, force: bool) -> Tuple[str, Path, str]:
    thumbnail_path = pdf_path.with_suffix(".webp")
    if not force and thumbnail_path.exists() and thumbnail_path.stat().st_mtime >= pdf_path.stat().st_mtime:
        return ("skipped", thumbnail_path, "")

    temp_path = thumbnail_path.with_suffix(".webp.tmp")
    try:
        with fitz.open(pdf_path) as document:
            if document.page_count == 0:
                return ("failed", pdf_path, "PDF has no pages")

            page = document.load_page(0)
            page_rect = page.rect
            scale = max(0.1, width / max(page_rect.width, 1))
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)

        image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        image.save(temp_path, format="WEBP", quality=quality, method=6)
        os.replace(temp_path, thumbnail_path)
        return ("updated", thumbnail_path, "")
    except Exception as exc:  # pragma: no cover - exercised in script runtime
        temp_path.unlink(missing_ok=True)
        return ("failed", pdf_path, str(exc))


def main() -> int:
    args = parse_args()
    catalog_root = Path(args.catalog_root).resolve()
    if not catalog_root.exists():
        raise SystemExit(f"Catalog root does not exist: {catalog_root}")

    pdf_files = list(iter_pdf_files(catalog_root))
    if not pdf_files:
        print(f"[generate-form-catalog-thumbnails] no PDFs found under {catalog_root}")
        return 0

    updated = 0
    skipped = 0
    failures: list[Tuple[Path, str]] = []

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        future_map = {
            executor.submit(render_thumbnail, pdf_path, args.width, args.quality, args.force): pdf_path
            for pdf_path in pdf_files
        }
        for future in as_completed(future_map):
            status, path, message = future.result()
            if status == "updated":
                updated += 1
            elif status == "skipped":
                skipped += 1
            else:
                failures.append((path, message))

    print(
        f"[generate-form-catalog-thumbnails] scanned={len(pdf_files)} updated={updated} skipped={skipped} failed={len(failures)}"
    )
    for path, message in failures[:20]:
        print(f"  failed: {path} :: {message}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
