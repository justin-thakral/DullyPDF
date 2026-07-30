"""Content-oriented QA for high-value declarative form specifications."""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .models import FormSpec, load_form_spec


MIN_SECTIONS = 4
MIN_WIDGETS = 45
REVIEW_WIDGETS = 350
MIN_BLOCK_TYPES = 3
GENERIC_SECTION_LABELS = frozenset(
    {
        "approval and sign off",
        "checklist and review items",
        "contact and form context",
        "details",
        "line items log or follow up",
    }
)
TITLE_STOPWORDS = frozenset(
    {
        "and",
        "authorization",
        "checklist",
        "form",
        "intake",
        "log",
        "notes",
        "of",
        "order",
        "report",
        "request",
        "sheet",
        "the",
        "tracking",
        "worksheet",
    }
)
LIFECYCLE_CONCEPTS: Mapping[str, frozenset[str]] = {
    "identity_and_routing": frozenset(
        {
            "account",
            "assigned",
            "contact",
            "customer",
            "date",
            "identifier",
            "location",
            "number",
            "owner",
            "reference",
            "requester",
            "route",
            "routing",
            "site",
        }
    ),
    "observations_and_evidence": frozenset(
        {
            "condition",
            "document",
            "evidence",
            "finding",
            "history",
            "inspection",
            "measurement",
            "observation",
            "photo",
            "reading",
            "record",
            "result",
        }
    ),
    "decision_and_authorization": frozenset(
        {
            "acceptance",
            "approval",
            "approve",
            "authorization",
            "authorized",
            "decision",
            "reviewed",
            "signature",
            "signoff",
        }
    ),
    "exception_and_escalation": frozenset(
        {
            "corrective",
            "escalation",
            "exception",
            "hazard",
            "incident",
            "issue",
            "rejected",
            "risk",
            "unresolved",
            "variance",
        }
    ),
    "closeout_and_handoff": frozenset(
        {
            "closeout",
            "completion",
            "disposition",
            "final",
            "followup",
            "handoff",
            "outcome",
            "verification",
            "verified",
        }
    ),
}


@dataclass(frozen=True)
class SpecQaResult:
    catalog_id: str
    passed: bool
    errors: tuple[dict[str, str], ...]
    warnings: tuple[dict[str, str], ...]
    metrics: dict[str, Any]
    content_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "catalog_id": self.catalog_id,
            "passed": self.passed,
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "metrics": self.metrics,
            "content_hash": self.content_hash,
        }


def _issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _normalize_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _spec_text(spec: FormSpec) -> str:
    parts = [
        spec.title,
        spec.subtitle,
        spec.description,
        spec.use_case,
    ]
    for section in spec.sections:
        parts.extend((section.title, section.guidance))
        for block in section.blocks:
            parts.extend((block.label, block.guidance))
            parts.extend(field.label for field in block.fields)
            for field in block.fields:
                parts.extend(field.options)
            parts.extend(block.items)
            parts.extend(column.label for column in block.columns)
    return "\n".join(part for part in parts if part)


def _widget_count(spec: FormSpec) -> int:
    total = 0
    for section in spec.sections:
        for block in section.blocks:
            total += len(block.fields)
            total += len(block.items)
            total += block.rows * len(block.columns)
    return total


def _meaningful_title_terms(spec: FormSpec) -> set[str]:
    return {
        word
        for word in _normalize_words(spec.title)
        if len(word) >= 4 and word not in TITLE_STOPWORDS
    }


def _lifecycle_coverage(words: Sequence[str]) -> dict[str, list[str]]:
    word_set = set(words)
    coverage: dict[str, list[str]] = {}
    for concept, keywords in LIFECYCLE_CONCEPTS.items():
        coverage[concept] = sorted(word_set & keywords)
    return coverage


def validate_spec_content(spec_or_path: FormSpec | str | Path) -> SpecQaResult:
    """Assess whether one form has enough workflow depth to enter PDF QA."""

    spec = (
        spec_or_path
        if isinstance(spec_or_path, FormSpec)
        else load_form_spec(spec_or_path)
    )
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    text = _spec_text(spec)
    words = _normalize_words(text)
    word_counts = Counter(words)
    widget_count = _widget_count(spec)
    block_types = {
        block.type
        for section in spec.sections
        for block in section.blocks
    }
    lifecycle = _lifecycle_coverage(words)
    title_terms = _meaningful_title_terms(spec)
    represented_title_terms = sorted(
        term for term in title_terms if word_counts[term] >= 3
    )
    generic_sections = {
        " ".join(_normalize_words(section.title))
        for section in spec.sections
    } & GENERIC_SECTION_LABELS

    if len(spec.sections) < MIN_SECTIONS:
        errors.append(
            _issue(
                "insufficient_workflow_sections",
                f"Expected at least {MIN_SECTIONS} workflow sections; found {len(spec.sections)}.",
            )
        )
    if widget_count < MIN_WIDGETS:
        errors.append(
            _issue(
                "insufficient_fillable_depth",
                f"Expected at least {MIN_WIDGETS} fillable controls; found {widget_count}.",
            )
        )
    if widget_count > REVIEW_WIDGETS:
        warnings.append(
            _issue(
                "high_control_density",
                (
                    f"The form has {widget_count} fillable controls; review whether "
                    "tables or repeated rows can be reduced without losing workflow value."
                ),
            )
        )
    if len(block_types) < MIN_BLOCK_TYPES:
        errors.append(
            _issue(
                "insufficient_block_variety",
                f"Expected at least {MIN_BLOCK_TYPES} block types; found {len(block_types)}.",
            )
        )
    missing_lifecycle = [
        concept for concept, matches in lifecycle.items() if not matches
    ]
    if missing_lifecycle:
        errors.append(
            _issue(
                "missing_lifecycle_coverage",
                "Missing workflow coverage for: " + ", ".join(missing_lifecycle) + ".",
            )
        )
    if title_terms and not represented_title_terms:
        errors.append(
            _issue(
                "weak_intent_specificity",
                "No meaningful title term is carried through the form content.",
            )
        )
    if len(generic_sections) >= 3:
        errors.append(
            _issue(
                "legacy_generic_shell",
                "The specification reuses three or more legacy generic section labels.",
            )
        )
    sparse_sections = [
        section.title
        for section in spec.sections
        if len(section.blocks) == 1
    ]
    if sparse_sections:
        warnings.append(
            _issue(
                "sparse_sections",
                "Single-block sections should be reviewed: " + ", ".join(sparse_sections) + ".",
            )
        )
    if spec.risk_tier in {"B", "C"}:
        review_terms = {
            "applicable",
            "policy",
            "privacy",
            "professional",
            "requirements",
            "review",
        }
        if not set(words) & review_terms:
            errors.append(
                _issue(
                    "missing_risk_review_prompt",
                    f"Risk tier {spec.risk_tier} requires an applicable-requirements or professional-review prompt.",
                )
            )

    content_hash = hashlib.sha256(
        " ".join(words).encode("utf-8")
    ).hexdigest()
    return SpecQaResult(
        catalog_id=spec.catalog_id,
        passed=not errors,
        errors=tuple(errors),
        warnings=tuple(warnings),
        metrics={
            "sections": len(spec.sections),
            "blocks": sum(len(section.blocks) for section in spec.sections),
            "widgets": widget_count,
            "block_types": sorted(block_types),
            "word_count": len(words),
            "title_terms": sorted(title_terms),
            "represented_title_terms": represented_title_terms,
            "lifecycle_coverage": lifecycle,
        },
        content_hash=content_hash,
    )


def validate_spec_batch(
    specs_or_paths: Iterable[FormSpec | str | Path],
) -> dict[str, Any]:
    """Validate a batch and reject exact or near-duplicate content shells.

    Pairwise comparison uses token-set Jaccard similarity. For 1,000 forms this
    performs roughly one million bounded set operations, which is acceptable
    for release QA and avoids an external similarity service.
    """

    specs = [
        item if isinstance(item, FormSpec) else load_form_spec(item)
        for item in specs_or_paths
    ]
    results = [validate_spec_content(spec) for spec in specs]
    corpora = [set(_normalize_words(_spec_text(spec))) for spec in specs]
    duplicate_errors: dict[str, list[dict[str, str]]] = {
        spec.catalog_id: [] for spec in specs
    }
    hashes: dict[str, str] = {}
    for result in results:
        other = hashes.get(result.content_hash)
        if other:
            duplicate_errors[result.catalog_id].append(
                _issue(
                    "exact_duplicate_content",
                    f"Content duplicates {other}.",
                )
            )
            duplicate_errors[other].append(
                _issue(
                    "exact_duplicate_content",
                    f"Content duplicates {result.catalog_id}.",
                )
            )
        else:
            hashes[result.content_hash] = result.catalog_id

    near_duplicate_pairs: list[dict[str, Any]] = []
    for left in range(len(specs)):
        for right in range(left + 1, len(specs)):
            union = corpora[left] | corpora[right]
            if not union:
                continue
            similarity = len(corpora[left] & corpora[right]) / len(union)
            if similarity >= 0.92:
                pair = {
                    "left": specs[left].catalog_id,
                    "right": specs[right].catalog_id,
                    "jaccard": round(similarity, 4),
                }
                near_duplicate_pairs.append(pair)
                for index, other_index in ((left, right), (right, left)):
                    duplicate_errors[specs[index].catalog_id].append(
                        _issue(
                            "near_duplicate_content",
                            (
                                f"Content is {similarity:.1%} similar to "
                                f"{specs[other_index].catalog_id}."
                            ),
                        )
                    )

    merged_results: list[dict[str, Any]] = []
    for result in results:
        payload = result.to_dict()
        payload["errors"].extend(duplicate_errors[result.catalog_id])
        payload["passed"] = not payload["errors"]
        merged_results.append(payload)
    return {
        "passed": all(result["passed"] for result in merged_results),
        "count": len(merged_results),
        "results": merged_results,
        "near_duplicate_pairs": near_duplicate_pairs,
    }
