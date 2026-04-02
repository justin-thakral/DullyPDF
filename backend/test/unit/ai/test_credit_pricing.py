from __future__ import annotations

import pytest

from backend.ai.credit_pricing import (
    OPENAI_CREDIT_OPERATION_REMAP,
    OPENAI_CREDIT_OPERATION_RENAME,
    OPENAI_CREDIT_OPERATION_RENAME_REMAP,
    compute_credit_pricing,
    compute_image_fill_credits,
)


@pytest.mark.parametrize(
    ("operation", "page_count", "expected_credits"),
    [
        (OPENAI_CREDIT_OPERATION_RENAME, 1, 1),
        (OPENAI_CREDIT_OPERATION_RENAME, 5, 1),
        (OPENAI_CREDIT_OPERATION_RENAME, 6, 2),
        (OPENAI_CREDIT_OPERATION_RENAME, 12, 3),
        (OPENAI_CREDIT_OPERATION_REMAP, 10, 2),
        (OPENAI_CREDIT_OPERATION_REMAP, 12, 3),
        (OPENAI_CREDIT_OPERATION_RENAME_REMAP, 10, 4),
        (OPENAI_CREDIT_OPERATION_RENAME_REMAP, 11, 6),
        (OPENAI_CREDIT_OPERATION_RENAME_REMAP, 12, 6),
    ],
)
def test_compute_credit_pricing_uses_page_buckets(operation: str, page_count: int, expected_credits: int) -> None:
    pricing = compute_credit_pricing(operation, page_count=page_count)
    assert pricing.total_credits == expected_credits


@pytest.mark.parametrize("bad_page_count", [0, -1, "bad", None])
def test_compute_credit_pricing_rejects_invalid_page_count(bad_page_count) -> None:
    with pytest.raises(ValueError):
        compute_credit_pricing(OPENAI_CREDIT_OPERATION_RENAME, page_count=bad_page_count)


def test_compute_credit_pricing_respects_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_CREDITS_PAGE_BUCKET_SIZE", "4")
    monkeypatch.setenv("OPENAI_CREDITS_RENAME_REMAP_BASE_COST", "3")
    pricing = compute_credit_pricing(OPENAI_CREDIT_OPERATION_RENAME_REMAP, page_count=10)
    assert pricing.bucket_size == 4
    assert pricing.bucket_count == 3
    assert pricing.base_cost == 3
    assert pricing.total_credits == 9


def test_compute_credit_pricing_to_dict_contains_expected_fields() -> None:
    pricing = compute_credit_pricing(OPENAI_CREDIT_OPERATION_REMAP, page_count=12)
    assert pricing.to_dict() == {
        "operation": OPENAI_CREDIT_OPERATION_REMAP,
        "pageCount": 12,
        "bucketSize": 5,
        "bucketCount": 3,
        "baseCost": 1,
        "totalCredits": 3,
    }


# ── Image fill credit pricing ───────────────────────────────────

class TestComputeImageFillCredits:
    """Tests for the image fill credit formula:
    - Image = 1 credit
    - PDF document = 1 credit per 5 pages (bucketed, ceil)
    """

    def test_single_image(self) -> None:
        pricing = compute_image_fill_credits(image_count=1, doc_page_counts=[])
        assert pricing.image_count == 1
        assert pricing.image_credits == 1
        assert pricing.doc_count == 0
        assert pricing.doc_credits == 0
        assert pricing.total_credits == 1

    def test_multiple_images(self) -> None:
        pricing = compute_image_fill_credits(image_count=3, doc_page_counts=[])
        assert pricing.image_credits == 3
        assert pricing.total_credits == 3

    def test_single_doc_one_page(self) -> None:
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[1])
        assert pricing.doc_count == 1
        assert pricing.doc_total_pages == 1
        assert pricing.doc_bucket_count == 1
        assert pricing.doc_credits == 1
        assert pricing.total_credits == 1

    def test_single_doc_five_pages(self) -> None:
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[5])
        assert pricing.doc_bucket_count == 1
        assert pricing.doc_credits == 1
        assert pricing.total_credits == 1

    def test_single_doc_six_pages(self) -> None:
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[6])
        assert pricing.doc_bucket_count == 2
        assert pricing.doc_credits == 2
        assert pricing.total_credits == 2

    def test_single_doc_ten_pages(self) -> None:
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[10])
        assert pricing.doc_bucket_count == 2
        assert pricing.doc_credits == 2
        assert pricing.total_credits == 2

    def test_single_doc_eleven_pages(self) -> None:
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[11])
        assert pricing.doc_bucket_count == 3
        assert pricing.doc_credits == 3
        assert pricing.total_credits == 3

    def test_multiple_docs_pages_bucketed_separately(self) -> None:
        """Each doc is bucketed independently: 3-page doc = 1 bucket, 7-page doc = 2 buckets."""
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[3, 7])
        assert pricing.doc_count == 2
        assert pricing.doc_total_pages == 10
        assert pricing.doc_bucket_count == 3  # ceil(3/5) + ceil(7/5) = 1 + 2
        assert pricing.doc_credits == 3
        assert pricing.total_credits == 3

    def test_mixed_images_and_docs(self) -> None:
        pricing = compute_image_fill_credits(image_count=2, doc_page_counts=[1, 6])
        assert pricing.image_credits == 2
        assert pricing.doc_bucket_count == 3  # ceil(1/5)=1 + ceil(6/5)=2
        assert pricing.doc_credits == 3
        assert pricing.total_credits == 5

    def test_no_files(self) -> None:
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[])
        assert pricing.total_credits == 0

    def test_zero_page_doc_treated_as_one(self) -> None:
        """A doc with 0 pages should be treated as 1 page minimum."""
        pricing = compute_image_fill_credits(image_count=0, doc_page_counts=[0])
        assert pricing.doc_total_pages == 1
        assert pricing.doc_bucket_count == 1
        assert pricing.doc_credits == 1

    def test_to_dict_structure(self) -> None:
        pricing = compute_image_fill_credits(image_count=1, doc_page_counts=[3])
        d = pricing.to_dict()
        assert d["operation"] == "image_fill"
        assert d["imageCount"] == 1
        assert d["imageCostEach"] == 1
        assert d["docCount"] == 1
        assert d["docTotalPages"] == 3
        assert d["docBucketSize"] == 5
        assert d["docBucketCount"] == 1
        assert d["docBaseCost"] == 1
        assert d["imageCredits"] == 1
        assert d["docCredits"] == 1
        assert d["totalCredits"] == 2

    def test_env_overrides(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("OPENAI_CREDITS_IMAGE_FILL_IMAGE_COST", "2")
        monkeypatch.setenv("OPENAI_CREDITS_IMAGE_FILL_DOC_BUCKET_SIZE", "3")
        monkeypatch.setenv("OPENAI_CREDITS_IMAGE_FILL_DOC_BASE_COST", "2")
        pricing = compute_image_fill_credits(image_count=1, doc_page_counts=[4])
        assert pricing.image_cost_each == 2
        assert pricing.image_credits == 2
        assert pricing.doc_bucket_size == 3
        assert pricing.doc_bucket_count == 2  # ceil(4/3) = 2
        assert pricing.doc_base_cost == 2
        assert pricing.doc_credits == 4  # 2 buckets * 2 base cost
        assert pricing.total_credits == 6
