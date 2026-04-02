"""Credit pricing helpers for OpenAI rename/remap endpoints."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Literal


OPENAI_CREDIT_OPERATION_RENAME = "rename"
OPENAI_CREDIT_OPERATION_REMAP = "remap"
OPENAI_CREDIT_OPERATION_RENAME_REMAP = "rename_remap"
OPENAI_CREDIT_OPERATION_IMAGE_FILL = "image_fill"

CreditOperation = Literal[
    OPENAI_CREDIT_OPERATION_RENAME,
    OPENAI_CREDIT_OPERATION_REMAP,
    OPENAI_CREDIT_OPERATION_RENAME_REMAP,
    OPENAI_CREDIT_OPERATION_IMAGE_FILL,
]

_DEFAULT_PAGE_BUCKET_SIZE = 5
_DEFAULT_RENAME_BASE_COST = 1
_DEFAULT_REMAP_BASE_COST = 1
_DEFAULT_RENAME_REMAP_BASE_COST = 2


def _safe_positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _coerce_positive_int(value: Any) -> int:
    try:
        resolved = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("page_count must be a positive integer") from exc
    if resolved <= 0:
        raise ValueError("page_count must be a positive integer")
    return resolved


_DEFAULT_IMAGE_FILL_IMAGE_COST = 1
_DEFAULT_IMAGE_FILL_DOC_BUCKET_SIZE = 5
_DEFAULT_IMAGE_FILL_DOC_BASE_COST = 1


def _resolve_base_cost(operation: CreditOperation) -> int:
    if operation == OPENAI_CREDIT_OPERATION_RENAME:
        return _safe_positive_int_env(
            "OPENAI_CREDITS_RENAME_BASE_COST",
            _DEFAULT_RENAME_BASE_COST,
        )
    if operation == OPENAI_CREDIT_OPERATION_REMAP:
        return _safe_positive_int_env(
            "OPENAI_CREDITS_REMAP_BASE_COST",
            _DEFAULT_REMAP_BASE_COST,
        )
    if operation == OPENAI_CREDIT_OPERATION_RENAME_REMAP:
        return _safe_positive_int_env(
            "OPENAI_CREDITS_RENAME_REMAP_BASE_COST",
            _DEFAULT_RENAME_REMAP_BASE_COST,
        )
    if operation == OPENAI_CREDIT_OPERATION_IMAGE_FILL:
        return _safe_positive_int_env(
            "OPENAI_CREDITS_IMAGE_FILL_IMAGE_COST",
            _DEFAULT_IMAGE_FILL_IMAGE_COST,
        )
    raise ValueError(f"Unsupported credit pricing operation: {operation}")


def resolve_credit_pricing_config() -> Dict[str, int]:
    """Expose server-side credit pricing settings for client-side UX checks."""
    return {
        "pageBucketSize": _safe_positive_int_env(
            "OPENAI_CREDITS_PAGE_BUCKET_SIZE",
            _DEFAULT_PAGE_BUCKET_SIZE,
        ),
        "renameBaseCost": _resolve_base_cost(OPENAI_CREDIT_OPERATION_RENAME),
        "remapBaseCost": _resolve_base_cost(OPENAI_CREDIT_OPERATION_REMAP),
        "renameRemapBaseCost": _resolve_base_cost(OPENAI_CREDIT_OPERATION_RENAME_REMAP),
    }


@dataclass(frozen=True)
class CreditPricing:
    operation: CreditOperation
    page_count: int
    bucket_size: int
    bucket_count: int
    base_cost: int
    total_credits: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "operation": self.operation,
            "pageCount": self.page_count,
            "bucketSize": self.bucket_size,
            "bucketCount": self.bucket_count,
            "baseCost": self.base_cost,
            "totalCredits": self.total_credits,
        }


@dataclass(frozen=True)
class ImageFillCreditPricing:
    """Per-file credit breakdown for image fill operations."""

    image_count: int
    image_cost_each: int
    doc_count: int
    doc_total_pages: int
    doc_bucket_size: int
    doc_bucket_count: int
    doc_base_cost: int
    image_credits: int
    doc_credits: int
    total_credits: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "operation": OPENAI_CREDIT_OPERATION_IMAGE_FILL,
            "imageCount": self.image_count,
            "imageCostEach": self.image_cost_each,
            "docCount": self.doc_count,
            "docTotalPages": self.doc_total_pages,
            "docBucketSize": self.doc_bucket_size,
            "docBucketCount": self.doc_bucket_count,
            "docBaseCost": self.doc_base_cost,
            "imageCredits": self.image_credits,
            "docCredits": self.doc_credits,
            "totalCredits": self.total_credits,
        }


def compute_image_fill_credits(
    *,
    image_count: int,
    doc_page_counts: list[int],
) -> ImageFillCreditPricing:
    """Compute credits for an image fill operation.

    Formula:
    - Each image costs 1 credit.
    - Each PDF document costs 1 credit per 5 pages (bucketed, ceil).
    """
    image_cost_each = _safe_positive_int_env(
        "OPENAI_CREDITS_IMAGE_FILL_IMAGE_COST",
        _DEFAULT_IMAGE_FILL_IMAGE_COST,
    )
    doc_bucket_size = _safe_positive_int_env(
        "OPENAI_CREDITS_IMAGE_FILL_DOC_BUCKET_SIZE",
        _DEFAULT_IMAGE_FILL_DOC_BUCKET_SIZE,
    )
    doc_base_cost = _safe_positive_int_env(
        "OPENAI_CREDITS_IMAGE_FILL_DOC_BASE_COST",
        _DEFAULT_IMAGE_FILL_DOC_BASE_COST,
    )

    image_credits = max(0, image_count) * image_cost_each

    doc_count = len(doc_page_counts)
    doc_total_pages = 0
    doc_bucket_count = 0
    for pages in doc_page_counts:
        clamped = max(1, pages)
        doc_total_pages += clamped
        doc_bucket_count += (clamped + doc_bucket_size - 1) // doc_bucket_size

    doc_credits = doc_bucket_count * doc_base_cost
    total = image_credits + doc_credits

    return ImageFillCreditPricing(
        image_count=max(0, image_count),
        image_cost_each=image_cost_each,
        doc_count=doc_count,
        doc_total_pages=doc_total_pages,
        doc_bucket_size=doc_bucket_size,
        doc_bucket_count=doc_bucket_count,
        doc_base_cost=doc_base_cost,
        image_credits=image_credits,
        doc_credits=doc_credits,
        total_credits=total,
    )


def compute_credit_pricing(operation: CreditOperation, *, page_count: Any) -> CreditPricing:
    """Return credit pricing using bucketed pages and operation base cost."""
    normalized_page_count = _coerce_positive_int(page_count)
    bucket_size = _safe_positive_int_env(
        "OPENAI_CREDITS_PAGE_BUCKET_SIZE",
        _DEFAULT_PAGE_BUCKET_SIZE,
    )
    base_cost = _resolve_base_cost(operation)
    bucket_count = (normalized_page_count + bucket_size - 1) // bucket_size
    total_credits = base_cost * bucket_count
    return CreditPricing(
        operation=operation,
        page_count=normalized_page_count,
        bucket_size=bucket_size,
        bucket_count=bucket_count,
        base_cost=base_cost,
        total_credits=total_credits,
    )
