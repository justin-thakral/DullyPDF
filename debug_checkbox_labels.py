#!/usr/bin/env python3
"""
Diagnostic overlay for checkbox-label matching.

Renders each PDF page with:
  - All OCR labels (grey boxes with text)
  - All detected checkboxes (orange boxes with IDs)
  - Arrows from each checkbox to its matched label (color-coded):
      GREEN  = exclusive match, no ambiguity
      YELLOW = label is also closest to another checkbox (shared/ambiguous)
      RED    = label is closer to a DIFFERENT checkbox (likely swapped)
  - Matched label text printed next to each checkbox

Usage:
    python debug_checkbox_labels.py <pdf_path> [--page N] [--dpi 300] [--out-dir ./debug_out]
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add backend to path so we can reuse the pipeline modules.
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

import cv2
import numpy as np

from fieldDetecting.rename_pipeline.combinedSrc.render_pdf import render_pdf_to_images
from fieldDetecting.rename_pipeline.combinedSrc.extract_labels import extract_labels
from fieldDetecting.rename_pipeline.combinedSrc.checkbox_label_hints import (
    pick_best_checkbox_label,
    _rect_distance_pts,
)
from fieldDetecting.rename_pipeline.combinedSrc.coords import PageBox, pts_bbox_to_px_bbox

# Try importing commonforms detection (optional -- may not be installed locally).
try:
    from fieldDetecting.commonforms.commonForm import detect_commonforms_fields
    HAS_COMMONFORMS = True
except Exception:
    HAS_COMMONFORMS = False

_FONT = cv2.FONT_HERSHEY_SIMPLEX

# ── Color palette (BGR) ────────────────────────────────────────────────────────
COLOR_LABEL_BOX = (200, 200, 200)       # grey – OCR label boxes
COLOR_LABEL_TEXT = (180, 180, 180)       # lighter grey – label text
COLOR_CB_BOX = (0, 165, 255)            # orange – checkbox boxes
COLOR_CB_ID = (255, 255, 255)           # white – checkbox ID text
COLOR_ARROW_OK = (0, 200, 0)            # green – exclusive match
COLOR_ARROW_SHARED = (0, 220, 220)      # yellow – shared/ambiguous match
COLOR_ARROW_SWAPPED = (0, 0, 255)       # red – likely swapped
COLOR_HINT_TEXT_OK = (0, 200, 0)
COLOR_HINT_TEXT_WARN = (0, 0, 255)


def _clamp(v: float, lo: int, hi: int) -> int:
    return int(max(lo, min(hi, round(v))))


def _pts_to_px(bbox_pts: List[float], img_w: int, img_h: int, page_box: PageBox) -> Tuple[int, int, int, int]:
    px = pts_bbox_to_px_bbox(bbox_pts, img_w, img_h, page_box)
    x1 = _clamp(px[0], 0, img_w - 1)
    y1 = _clamp(px[1], 0, img_h - 1)
    x2 = _clamp(px[2], 0, img_w - 1)
    y2 = _clamp(px[3], 0, img_h - 1)
    if x2 < x1:
        x1, x2 = x2, x1
    if y2 < y1:
        y1, y2 = y2, y1
    return x1, y1, x2, y2


def _center(rect: Tuple[int, int, int, int]) -> Tuple[int, int]:
    return ((rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2)


def _draw_text_outline(canvas, text, org, scale, color, thick=1, outline=(0, 0, 0), outline_thick=3):
    cv2.putText(canvas, text, org, _FONT, scale, outline, outline_thick, cv2.LINE_AA)
    cv2.putText(canvas, text, org, _FONT, scale, color, thick, cv2.LINE_AA)


def _build_checkbox_fields_from_candidates(
    checkbox_candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Build minimal field dicts from raw checkboxCandidates for label matching."""
    fields = []
    for idx, cb in enumerate(checkbox_candidates):
        bbox = cb.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4:
            continue
        fields.append({
            "name": cb.get("id") or f"cb_{idx}",
            "type": "checkbox",
            "rect": [float(v) for v in bbox],
            "page": int(cb.get("page") or 1),
        })
    return fields


def _detect_checkboxes_from_fields(fields: List[Dict], page_num: int) -> List[Dict]:
    """Extract checkbox fields for a specific page."""
    return [
        f for f in fields
        if str(f.get("type") or "").lower() == "checkbox"
        and int(f.get("page") or 1) == page_num
    ]


def render_diagnostic_page(
    image_bgr: np.ndarray,
    labels: List[Dict[str, Any]],
    checkbox_fields: List[Dict[str, Any]],
    page_box: PageBox,
    img_w: int,
    img_h: int,
) -> np.ndarray:
    """Render the diagnostic overlay for one page."""
    canvas = image_bgr.copy()

    # ── 1. Draw all OCR labels ──────────────────────────────────────────────
    for label in labels:
        bbox = label.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4:
            continue
        lx1, ly1, lx2, ly2 = _pts_to_px(bbox, img_w, img_h, page_box)
        cv2.rectangle(canvas, (lx1, ly1), (lx2, ly2), COLOR_LABEL_BOX, 1)
        text = (label.get("text") or "")[:40]
        _draw_text_outline(canvas, text, (lx1, max(10, ly1 - 3)), 0.32, COLOR_LABEL_TEXT)

    # ── 2. Draw checkbox boxes ──────────────────────────────────────────────
    for cb in checkbox_fields:
        rect = cb.get("rect")
        if not isinstance(rect, list) or len(rect) != 4:
            continue
        cx1, cy1, cx2, cy2 = _pts_to_px(rect, img_w, img_h, page_box)
        cv2.rectangle(canvas, (cx1, cy1), (cx2, cy2), COLOR_CB_BOX, 2)
        name = cb.get("name") or "?"
        _draw_text_outline(canvas, name[:8], (cx1, max(10, cy1 - 4)), 0.35, COLOR_CB_ID)

    # ── 3. Match labels and classify each arrow ─────────────────────────────
    # For each checkbox, find its best label.
    matches: List[Tuple[Dict, Optional[Dict]]] = []
    for cb in checkbox_fields:
        rect = cb.get("rect")
        if not isinstance(rect, list) or len(rect) != 4:
            matches.append((cb, None))
            continue
        best = pick_best_checkbox_label([float(v) for v in rect], labels)
        matches.append((cb, best))

    # Build reverse map: label -> list of checkboxes that matched it.
    label_to_cbs: Dict[int, List[int]] = {}
    for cb_idx, (cb, matched_label) in enumerate(matches):
        if matched_label is None:
            continue
        label_id = id(matched_label)
        label_to_cbs.setdefault(label_id, []).append(cb_idx)

    # For each checkbox, find which checkbox is actually *closest* to that label.
    # If the matched label is closer to another checkbox, that's a swap signal.
    def _closest_cb_to_label(label: Dict) -> Optional[int]:
        lbbox = label.get("bbox")
        if not isinstance(lbbox, list) or len(lbbox) != 4:
            return None
        best_dist = None
        best_idx = None
        for idx, cb in enumerate(checkbox_fields):
            rect = cb.get("rect")
            if not isinstance(rect, list) or len(rect) != 4:
                continue
            dist = _rect_distance_pts([float(v) for v in rect], [float(v) for v in lbbox])
            if best_dist is None or dist < best_dist:
                best_dist = dist
                best_idx = idx
        return best_idx

    # ── 4. Draw arrows + hint text ──────────────────────────────────────────
    swap_count = 0
    shared_count = 0

    for cb_idx, (cb, matched_label) in enumerate(matches):
        rect = cb.get("rect")
        if not isinstance(rect, list) or len(rect) != 4:
            continue
        cx1, cy1, cx2, cy2 = _pts_to_px(rect, img_w, img_h, page_box)
        cb_center = _center((cx1, cy1, cx2, cy2))

        if matched_label is None:
            # No label matched -- draw a red X on the checkbox.
            _draw_text_outline(canvas, "NO LABEL", (cx2 + 4, cy1 + 12), 0.35, (0, 0, 255))
            continue

        lbbox = matched_label.get("bbox")
        if not isinstance(lbbox, list) or len(lbbox) != 4:
            continue
        lx1, ly1, lx2, ly2 = _pts_to_px(lbbox, img_w, img_h, page_box)
        label_center = _center((lx1, ly1, lx2, ly2))

        # Classify the match.
        label_id = id(matched_label)
        is_shared = len(label_to_cbs.get(label_id, [])) > 1
        closest_cb_idx = _closest_cb_to_label(matched_label)
        is_swapped = closest_cb_idx is not None and closest_cb_idx != cb_idx

        if is_swapped:
            arrow_color = COLOR_ARROW_SWAPPED
            text_color = COLOR_HINT_TEXT_WARN
            status = "SWAP?"
            swap_count += 1
        elif is_shared:
            arrow_color = COLOR_ARROW_SHARED
            text_color = COLOR_HINT_TEXT_WARN
            status = "SHARED"
            shared_count += 1
        else:
            arrow_color = COLOR_ARROW_OK
            text_color = COLOR_HINT_TEXT_OK
            status = ""

        # Draw arrow from checkbox center to label center.
        cv2.arrowedLine(canvas, cb_center, label_center, arrow_color, 2, tipLength=0.15)

        # Highlight the matched label box.
        cv2.rectangle(canvas, (lx1, ly1), (lx2, ly2), arrow_color, 2)

        # Print matched hint text + status next to checkbox.
        hint = (matched_label.get("text") or "")[:30]
        dist = _rect_distance_pts(
            [float(v) for v in rect],
            [float(v) for v in lbbox],
        )
        tag = f'{hint} (d={dist:.0f})'
        if status:
            tag = f'[{status}] {tag}'
        _draw_text_outline(canvas, tag, (cx2 + 4, (cy1 + cy2) // 2 + 4), 0.33, text_color)

    # ── 5. Summary legend ───────────────────────────────────────────────────
    legend_y = 20
    total = len(checkbox_fields)
    _draw_text_outline(canvas, f"Checkboxes: {total}  |  Swaps: {swap_count}  |  Shared: {shared_count}",
                       (10, legend_y), 0.5, (255, 255, 255), thick=1)
    legend_y += 22
    cv2.line(canvas, (10, legend_y), (50, legend_y), COLOR_ARROW_OK, 2)
    _draw_text_outline(canvas, "= exclusive (OK)", (55, legend_y + 4), 0.38, COLOR_ARROW_OK)
    legend_y += 18
    cv2.line(canvas, (10, legend_y), (50, legend_y), COLOR_ARROW_SHARED, 2)
    _draw_text_outline(canvas, "= shared label (ambiguous)", (55, legend_y + 4), 0.38, COLOR_ARROW_SHARED)
    legend_y += 18
    cv2.line(canvas, (10, legend_y), (50, legend_y), COLOR_ARROW_SWAPPED, 2)
    _draw_text_outline(canvas, "= label closer to other checkbox (SWAP)", (55, legend_y + 4), 0.38, COLOR_ARROW_SWAPPED)

    return canvas


def main():
    parser = argparse.ArgumentParser(description="Debug checkbox-label matching overlay")
    parser.add_argument("pdf", help="Path to PDF file")
    parser.add_argument("--page", type=int, default=0, help="Page number (1-based, 0=all)")
    parser.add_argument("--dpi", type=int, default=300, help="Render DPI")
    parser.add_argument("--out-dir", default="./debug_checkbox_out", help="Output directory")
    parser.add_argument("--fields-json", default=None,
                        help="Optional JSON file with pre-detected fields (list of field dicts)")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"ERROR: {pdf_path} not found", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_bytes = pdf_path.read_bytes()
    print(f"Rendering {pdf_path.name} at {args.dpi} DPI...")
    rendered_pages = render_pdf_to_images(pdf_bytes, dpi=args.dpi, max_workers=1)
    print(f"Extracting labels...")
    labels_by_page = extract_labels(pdf_bytes, rendered_pages, max_workers=1)

    # If a fields JSON is provided, load it. Otherwise try commonforms detection.
    fields: List[Dict[str, Any]] = []
    if args.fields_json:
        import json
        fields = json.loads(Path(args.fields_json).read_text())
        print(f"Loaded {len(fields)} fields from {args.fields_json}")
    elif HAS_COMMONFORMS:
        print("Running CommonForms detection...")
        try:
            result = detect_commonforms_fields(pdf_path)
            fields = result.get("fields") or []
            print(f"Detected {len(fields)} fields ({sum(1 for f in fields if f.get('type') == 'checkbox')} checkboxes)")
        except Exception as e:
            print(f"CommonForms detection failed: {e}")
            print("Falling back to labels-only overlay (no checkbox boxes).")
    else:
        print("CommonForms not available. Pass --fields-json with detected fields or install commonforms.")
        print("Rendering labels-only overlay.")

    pages_to_render = []
    if args.page > 0:
        pages_to_render = [p for p in rendered_pages if p["page_index"] == args.page]
        if not pages_to_render:
            print(f"ERROR: page {args.page} not found (have {len(rendered_pages)} pages)", file=sys.stderr)
            sys.exit(1)
    else:
        pages_to_render = rendered_pages

    for page in pages_to_render:
        page_num = page["page_index"]
        img_w = page["image_width_px"]
        img_h = page["image_height_px"]
        image = page["image"]
        page_box = PageBox(
            page_width=page["width_points"],
            page_height=page["height_points"],
            rotation=page.get("rotation", 0),
        )

        page_labels = labels_by_page.get(page_num, [])
        page_checkboxes = _detect_checkboxes_from_fields(fields, page_num)

        print(f"Page {page_num}: {len(page_labels)} labels, {len(page_checkboxes)} checkboxes")

        overlay = render_diagnostic_page(
            image, page_labels, page_checkboxes, page_box, img_w, img_h,
        )

        out_file = out_dir / f"{pdf_path.stem}_page{page_num}_checkbox_debug.png"
        cv2.imwrite(str(out_file), overlay)
        print(f"  -> {out_file}")

    print(f"\nDone. Overlays saved to {out_dir}/")


if __name__ == "__main__":
    main()
