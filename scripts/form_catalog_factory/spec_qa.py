"""Content-oriented QA for high-value declarative form specifications."""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .models import FormSpec, load_form_spec


MIN_SECTIONS = 2
MIN_WIDGETS = 12
REVIEW_WIDGETS = 350
MIN_BLOCK_TYPES = 2
MAX_IDENTICAL_STRUCTURE_COUNT = 25
MAX_SEMANTIC_SKELETON_COUNT = 40
MAX_REUSED_METADATA_PHRASE_COUNT = 40
MAX_REUSED_INSTRUCTION_PHRASE_COUNT = 40
METADATA_NGRAM_SIZE = 8
INSTRUCTION_NGRAM_SIZE = 8
MIN_REPEATED_GUIDANCE_WORDS = 6
MIN_CONTROL_LABEL_WORDS = 4
MIN_REUSED_CONTROL_LABEL_COUNT = 40
MAX_REUSED_CONTROL_LABEL_SHARE = 0.25
MACHINE_CONTROL_CODE_RE = re.compile(r"\[[A-Z][A-Z0-9_-]{3,}\]")
INTERNAL_AUTHORING_PHRASES = (
    "actual operating task",
    "direct domain inputs",
    "follows the real workflow",
    "title-swapped",
    "generic shell",
    "internal authoring",
    "machine-generated",
    "model-generated",
    "this original",
)
GENERIC_SECTION_LABELS = frozenset(
    {
        "approval and sign off",
        "checklist and review items",
        "closeout and handoff",
        "contact and form context",
        "decision and authorization",
        "details",
        "exception and escalation",
        "exceptions and escalation",
        "identity and routing",
        "line items log or follow up",
        "observations and evidence",
        "task details",
        "working details",
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
SECTION_ROLE_KEYWORDS: Mapping[str, frozenset[str]] = {
    "identity_and_routing": frozenset(
        {
            "contact",
            "identity",
            "people",
            "reference",
            "routing",
        }
    ),
    "observations_and_evidence": frozenset(
        {
            "evidence",
            "finding",
            "inspection",
            "observation",
            "review",
        }
    ),
    "decision_and_authorization": frozenset(
        {
            "approval",
            "authorization",
            "consent",
            "decision",
        }
    ),
    "exception_and_escalation": frozenset(
        {
            "escalation",
            "exception",
            "issue",
            "risk",
            "variance",
        }
    ),
    "closeout_and_handoff": frozenset(
        {
            "closeout",
            "completion",
            "final",
            "handoff",
            "outcome",
        }
    ),
}
SECTION_ROLE_PRIORITY = (
    "exception_and_escalation",
    "decision_and_authorization",
    "closeout_and_handoff",
    "observations_and_evidence",
    "identity_and_routing",
)
OBSERVATION_FORM_TERMS = frozenset(
    {
        "assessment",
        "audit",
        "checklist",
        "estimate",
        "inspection",
        "log",
        "receipt",
        "report",
        "service",
        "tracking",
        "worksheet",
    }
)
DECISION_FORM_TERMS = frozenset(
    {
        "approval",
        "authorization",
        "consent",
        "decision",
        "permission",
        "release",
        "waiver",
    }
)
DIRECT_DECISION_FORM_TERMS = frozenset(
    {
        "authorization",
        "consent",
        "permission",
        "release",
        "waiver",
    }
)
DECISION_DERIVATIVE_TERMS = frozenset(
    {
        "checklist",
        "information",
        "intake",
        "log",
        "notes",
        "report",
        "tracking",
        "worksheet",
    }
)
DECISION_CONTROL_TERMS = frozenset(
    {
        "accept",
        "accepted",
        "approval",
        "approve",
        "approved",
        "authorize",
        "authorized",
        "choice",
        "choices",
        "consent",
        "decision",
        "decline",
        "declined",
        "deny",
        "denied",
        "release",
        "released",
        "revoke",
        "revoked",
    }
)
SIGNER_CONTROL_TERMS = frozenset(
    {
        "authorizing",
        "authority",
        "authorized",
        "client",
        "customer",
        "guardian",
        "parent",
        "participant",
        "patient",
        "person",
        "representative",
        "signature",
        "signed",
        "signer",
        "witness",
    }
)
CLOSEOUT_FORM_TERMS = frozenset(
    {
        "closeout",
        "completion",
        "receipt",
        "service",
        "signoff",
        "work",
    }
)
COMPACT_TITLE_PHRASES = (
    "absence note",
    "acknowledgment",
    "reservation",
)
COMPLEX_TITLE_PHRASES = (
    "application",
    "assessment",
    "audit",
    "comprehensive",
    "estate planning",
    "incident investigation",
    "medical history",
    "packet",
    "plan",
    "service call intake",
)


@dataclass(frozen=True)
class UsabilityProfile:
    """Task-proportional limits used before and after deterministic rendering."""

    name: str
    max_sections: int
    max_widgets: int
    max_pages: int


COMPACT_PROFILE = UsabilityProfile(
    name="compact",
    max_sections=3,
    max_widgets=110,
    max_pages=2,
)
SENSITIVE_COMPACT_PROFILE = UsabilityProfile(
    name="sensitive_compact",
    max_sections=4,
    max_widgets=180,
    max_pages=3,
)
STANDARD_PROFILE = UsabilityProfile(
    name="standard",
    max_sections=8,
    max_widgets=400,
    max_pages=6,
)
COMPLEX_PROFILE = UsabilityProfile(
    name="complex",
    max_sections=10,
    max_widgets=500,
    max_pages=8,
)


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


def _metadata_ngrams(spec: FormSpec) -> set[tuple[str, ...]]:
    """Return long customer-facing metadata phrases for batch reuse analysis."""

    return _ngrams_from_strings(
        (spec.subtitle, spec.description, spec.use_case),
        size=METADATA_NGRAM_SIZE,
    )


def _instruction_ngrams(spec: FormSpec) -> set[tuple[str, ...]]:
    """Return section and block guidance phrases without crossing copy boundaries."""

    return _ngrams_from_strings(
        (
            guidance
            for section in spec.sections
            for guidance in (
                section.guidance,
                *(block.guidance for block in section.blocks),
            )
        ),
        size=INSTRUCTION_NGRAM_SIZE,
    )


def _discrete_customer_copy(spec: FormSpec) -> tuple[str, ...]:
    """Return labels and selectable values that must read as finished UI copy."""

    values: list[str] = [spec.title]
    for section in spec.sections:
        values.append(section.title)
        for block in section.blocks:
            values.append(block.label)
            values.extend(field.label for field in block.fields)
            values.extend(
                option
                for field in block.fields
                for option in field.options
            )
            values.extend(block.items)
            values.extend(column.label for column in block.columns)
    return tuple(values)


def _starts_with_unpolished_lowercase(value: str) -> bool:
    match = re.search(r"[A-Za-z]+", value)
    if match is None:
        return False
    first_word = match.group(0)
    return first_word[0].islower() and not any(
        character.isupper()
        for character in first_word[1:]
    )


def _ngrams_from_strings(
    values: Iterable[str],
    *,
    size: int,
) -> set[tuple[str, ...]]:
    ngrams: set[tuple[str, ...]] = set()
    for value in values:
        words = _normalize_words(value)
        ngrams.update(
            tuple(words[index : index + size])
            for index in range(max(0, len(words) - size + 1))
        )
    return ngrams


def _widget_count(spec: FormSpec) -> int:
    total = 0
    for section in spec.sections:
        for block in section.blocks:
            total += len(block.fields)
            total += len(block.items)
            total += block.rows * len(block.columns)
    return total


def _structure_signature(spec: FormSpec) -> tuple[Any, ...]:
    """Describe layout shape without treating customer-facing copy as structure."""

    return tuple(
        tuple(
            (
                block.type,
                len(block.fields),
                len(block.items),
                len(block.columns),
                block.rows,
                block.height,
            )
            for block in section.blocks
        )
        for section in spec.sections
    )


def usability_profile_for_spec(spec: FormSpec) -> UsabilityProfile:
    """Choose a conservative size budget from the customer-visible task name."""

    title_words = tuple(_normalize_words(spec.title))

    def contains_phrase(phrase: str) -> bool:
        phrase_words = tuple(_normalize_words(phrase))
        width = len(phrase_words)
        return any(
            title_words[index : index + width] == phrase_words
            for index in range(len(title_words) - width + 1)
        )

    if any(contains_phrase(phrase) for phrase in COMPLEX_TITLE_PHRASES):
        return COMPLEX_PROFILE
    if any(contains_phrase(phrase) for phrase in COMPACT_TITLE_PHRASES):
        # A high-risk compact task may need one additional page for required
        # authorization or review language, but it must not become a packet.
        return (
            SENSITIVE_COMPACT_PROFILE
            if spec.risk_tier == "C"
            else COMPACT_PROFILE
        )
    return STANDARD_PROFILE


def _required_lifecycle_concepts(spec: FormSpec) -> frozenset[str]:
    """Require workflow stages that serve this task instead of a universal shell."""

    title_words = set(_normalize_words(spec.title))
    required = {"identity_and_routing"}
    if title_words & OBSERVATION_FORM_TERMS:
        required.add("observations_and_evidence")
    if title_words & DECISION_FORM_TERMS:
        required.add("decision_and_authorization")
    if title_words & CLOSEOUT_FORM_TERMS:
        required.add("closeout_and_handoff")
    if spec.risk_tier == "C":
        required.add("exception_and_escalation")
    return frozenset(required)


def _requires_direct_decision_receipt(spec: FormSpec) -> bool:
    """Identify documents that themselves grant or withhold named authority."""

    title_words = set(_normalize_words(spec.title))
    return bool(title_words & DIRECT_DECISION_FORM_TERMS) and not bool(
        title_words & DECISION_DERIVATIVE_TERMS
    )


def _decision_receipt_evidence(spec: FormSpec) -> tuple[bool, bool]:
    """Return whether direct controls express a decision and record its signer."""

    decision_control = False
    signer_control = False
    for section in spec.sections:
        for block in section.blocks:
            control_values = (
                *(field.label for field in block.fields),
                *(
                    option
                    for field in block.fields
                    for option in field.options
                ),
                *block.items,
                *(column.label for column in block.columns),
            )
            control_words = {
                word
                for value in control_values
                for word in _normalize_words(value)
            }
            decision_control = decision_control or bool(
                control_words & DECISION_CONTROL_TERMS
            )
            signer_control = signer_control or (
                block.type == "signatures"
                and bool(control_words & SIGNER_CONTROL_TERMS)
            )
    return decision_control, signer_control


def _section_role(title: str) -> str:
    words = set(_normalize_words(title))
    matches = {
        role
        for role, keywords in SECTION_ROLE_KEYWORDS.items()
        if words & keywords
    }
    for role in SECTION_ROLE_PRIORITY:
        if role in matches:
            return role
    return "task_details"


def _semantic_skeleton_signature(spec: FormSpec) -> tuple[Any, ...]:
    """Capture customer workflow order while ignoring cosmetic count jitter."""

    return (
        usability_profile_for_spec(spec).name,
        tuple(_section_role(section.title) for section in spec.sections),
    )


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
    required_lifecycle = _required_lifecycle_concepts(spec)
    requires_direct_decision_receipt = _requires_direct_decision_receipt(spec)
    decision_control, signer_control = _decision_receipt_evidence(spec)
    usability_profile = usability_profile_for_spec(spec)
    title_terms = _meaningful_title_terms(spec)
    represented_title_terms = sorted(
        term for term in title_terms if word_counts[term] >= 3
    )
    generic_sections = {
        " ".join(_normalize_words(section.title))
        for section in spec.sections
    } & GENERIC_SECTION_LABELS
    normalized_section_guidance = [
        tuple(_normalize_words(section.guidance))
        for section in spec.sections
        if len(_normalize_words(section.guidance)) >= MIN_REPEATED_GUIDANCE_WORDS
    ]
    repeated_section_guidance = [
        guidance
        for guidance, count in Counter(normalized_section_guidance).items()
        if count > 1
    ]
    internal_copy_matches = sorted(
        {
            match.group(0)
            for match in MACHINE_CONTROL_CODE_RE.finditer(text)
        }
        | {
            phrase
            for phrase in INTERNAL_AUTHORING_PHRASES
            if phrase in text.lower()
        }
    )
    discrete_copy = _discrete_customer_copy(spec)
    repeated_label_words = sorted(
        {
            value
            for value in discrete_copy
            if any(
                left == right
                for left, right in zip(
                    _normalize_words(value),
                    _normalize_words(value)[1:],
                )
            )
        }
    )
    lowercase_copy = sorted(
        {
            value
            for value in discrete_copy
            if _starts_with_unpolished_lowercase(value)
        }
    )

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
    if len(spec.sections) > usability_profile.max_sections:
        errors.append(
            _issue(
                "task_scope_too_many_sections",
                (
                    f"The {usability_profile.name} task profile permits at most "
                    f"{usability_profile.max_sections} sections; found "
                    f"{len(spec.sections)}. Remove governance stages that do not "
                    "serve the form's actual job."
                ),
            )
        )
    if widget_count > usability_profile.max_widgets:
        errors.append(
            _issue(
                "task_scope_too_many_controls",
                (
                    f"The {usability_profile.name} task profile permits at most "
                    f"{usability_profile.max_widgets} fillable controls; found "
                    f"{widget_count}. Reduce repeated or nonessential inputs."
                ),
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
    missing_lifecycle = sorted(
        concept
        for concept in required_lifecycle
        if not lifecycle.get(concept)
    )
    if missing_lifecycle:
        errors.append(
            _issue(
                "missing_lifecycle_coverage",
                "Missing workflow coverage for: " + ", ".join(missing_lifecycle) + ".",
            )
        )
    if requires_direct_decision_receipt and not decision_control:
        errors.append(
            _issue(
                "missing_direct_decision_control",
                (
                    "A permission, consent, release, waiver, or authorization "
                    "document must include a direct control that records the "
                    "grant, refusal, limit, or revocation decision."
                ),
            )
        )
    if requires_direct_decision_receipt and not signer_control:
        errors.append(
            _issue(
                "missing_decision_signer_receipt",
                (
                    "A permission, consent, release, waiver, or authorization "
                    "document must include a signatures block that identifies "
                    "the signer or responsible witness."
                ),
            )
        )
    if title_terms and not represented_title_terms:
        errors.append(
            _issue(
                "weak_intent_specificity",
                "No meaningful title term is carried through the form content.",
            )
        )
    if len(generic_sections) >= 2:
        errors.append(
            _issue(
                "legacy_generic_shell",
                (
                    "The specification uses two or more generic workflow section "
                    "labels instead of task-specific stages: "
                    + ", ".join(sorted(generic_sections))
                    + "."
                ),
            )
        )
    if repeated_section_guidance:
        examples = [
            " ".join(guidance)
            for guidance in repeated_section_guidance[:3]
        ]
        errors.append(
            _issue(
                "repeated_section_guidance",
                (
                    "Multiple sections repeat the same customer-facing guidance "
                    "instead of explaining their distinct jobs. Examples: "
                    + "; ".join(examples)
                    + "."
                ),
            )
        )
    if internal_copy_matches:
        errors.append(
            _issue(
                "user_visible_internal_copy",
                (
                    "Customer-visible copy contains internal authoring language or "
                    "machine control codes: "
                    + ", ".join(internal_copy_matches[:12])
                    + "."
                ),
            )
        )
    if repeated_label_words:
        errors.append(
            _issue(
                "repeated_customer_copy_word",
                (
                    "Customer-visible labels contain an adjacent repeated word: "
                    + "; ".join(repeated_label_words[:8])
                    + "."
                ),
            )
        )
    if lowercase_copy:
        errors.append(
            _issue(
                "customer_copy_not_sentence_case",
                (
                    "Customer-visible labels, checklist items, and choices must "
                    "start with polished sentence case. Examples: "
                    + "; ".join(lowercase_copy[:8])
                    + "."
                ),
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
            "required_lifecycle_concepts": sorted(required_lifecycle),
            "direct_decision_receipt": {
                "required": requires_direct_decision_receipt,
                "decision_control": decision_control,
                "signer_control": signer_control,
            },
            "usability_profile": {
                "name": usability_profile.name,
                "max_sections": usability_profile.max_sections,
                "max_widgets": usability_profile.max_widgets,
                "max_pages": usability_profile.max_pages,
            },
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
    structure_groups: dict[tuple[Any, ...], list[int]] = {}
    semantic_skeleton_groups: dict[tuple[Any, ...], list[int]] = {}
    metadata_phrase_groups: dict[tuple[str, ...], list[int]] = {}
    instruction_phrase_groups: dict[tuple[str, ...], list[int]] = {}
    control_label_groups: dict[tuple[str, ...], list[int]] = {}
    for index, spec in enumerate(specs):
        structure_groups.setdefault(_structure_signature(spec), []).append(index)
        semantic_skeleton_groups.setdefault(
            _semantic_skeleton_signature(spec),
            [],
        ).append(index)
        for phrase in _metadata_ngrams(spec):
            metadata_phrase_groups.setdefault(phrase, []).append(index)
        for phrase in _instruction_ngrams(spec):
            instruction_phrase_groups.setdefault(phrase, []).append(index)
        normalized_control_labels = {
            words
            for section in spec.sections
            for block in section.blocks
            for label in (
                *(field.label for field in block.fields),
                *(column.label for column in block.columns),
            )
            if len(words := tuple(_normalize_words(label))) >= MIN_CONTROL_LABEL_WORDS
        }
        for label in normalized_control_labels:
            control_label_groups.setdefault(label, []).append(index)
    structure_group_sizes = Counter(
        len(indices) for indices in structure_groups.values()
    )
    semantic_skeleton_group_sizes = Counter(
        len(indices) for indices in semantic_skeleton_groups.values()
    )
    over_reused_structures: list[dict[str, Any]] = []
    for indices in structure_groups.values():
        if len(indices) <= MAX_IDENTICAL_STRUCTURE_COUNT:
            continue
        catalog_ids = sorted(specs[index].catalog_id for index in indices)
        digest = hashlib.sha256(
            "\n".join(catalog_ids).encode("utf-8")
        ).hexdigest()
        over_reused_structures.append(
            {
                "count": len(indices),
                "catalog_ids_sha256": digest,
                "examples": catalog_ids[:10],
            }
        )
        for index in indices:
            duplicate_errors[specs[index].catalog_id].append(
                _issue(
                    "over_reused_structure",
                    (
                        f"The same full block/control structure is reused by "
                        f"{len(indices)} forms; redesign workflow-specific inputs "
                        "and let form shape follow the actual task."
                    ),
                )
            )
    over_reused_semantic_skeletons: list[dict[str, Any]] = []
    for signature, indices in semantic_skeleton_groups.items():
        if len(indices) <= MAX_SEMANTIC_SKELETON_COUNT:
            continue
        catalog_ids = sorted(specs[index].catalog_id for index in indices)
        digest = hashlib.sha256(
            "\n".join(catalog_ids).encode("utf-8")
        ).hexdigest()
        over_reused_semantic_skeletons.append(
            {
                "count": len(indices),
                "profile": signature[0],
                "section_roles": list(signature[1]),
                "catalog_ids_sha256": digest,
                "examples": catalog_ids[:10],
            }
        )
        for index in indices:
            duplicate_errors[specs[index].catalog_id].append(
                _issue(
                    "over_reused_semantic_skeleton",
                    (
                        f"The same task profile and section-role sequence is "
                        f"reused by {len(indices)} forms. Redesign the workflow "
                        "around what the user must actually record or decide."
                    ),
                )
            )
    reused_metadata_by_spec: dict[int, list[tuple[str, ...]]] = {
        index: [] for index in range(len(specs))
    }
    over_reused_metadata_phrases: list[dict[str, Any]] = []
    for phrase, indices in sorted(metadata_phrase_groups.items()):
        if len(indices) <= MAX_REUSED_METADATA_PHRASE_COUNT:
            continue
        catalog_ids = sorted(specs[index].catalog_id for index in indices)
        over_reused_metadata_phrases.append(
            {
                "count": len(indices),
                "phrase": " ".join(phrase),
                "catalog_ids_sha256": hashlib.sha256(
                    "\n".join(catalog_ids).encode("utf-8")
                ).hexdigest(),
                "examples": catalog_ids[:10],
            }
        )
        for index in indices:
            reused_metadata_by_spec[index].append(phrase)
    for index, phrases in reused_metadata_by_spec.items():
        if not phrases:
            continue
        examples = [
            " ".join(phrase)
            for phrase in sorted(phrases)[:3]
        ]
        duplicate_errors[specs[index].catalog_id].append(
            _issue(
                "over_reused_customer_copy",
                (
                    f"Metadata contains {len(phrases)} long phrase(s) reused "
                    f"across more than {MAX_REUSED_METADATA_PHRASE_COUNT} forms; "
                    "rewrite the subtitle, description, and use case around "
                    "this task. Examples: "
                    + "; ".join(examples)
                    + "."
                ),
            )
        )
    reused_instruction_by_spec: dict[int, list[tuple[str, ...]]] = {
        index: [] for index in range(len(specs))
    }
    over_reused_instruction_phrases: list[dict[str, Any]] = []
    for phrase, indices in sorted(instruction_phrase_groups.items()):
        if len(indices) <= MAX_REUSED_INSTRUCTION_PHRASE_COUNT:
            continue
        catalog_ids = sorted(specs[index].catalog_id for index in indices)
        over_reused_instruction_phrases.append(
            {
                "count": len(indices),
                "phrase": " ".join(phrase),
                "catalog_ids_sha256": hashlib.sha256(
                    "\n".join(catalog_ids).encode("utf-8")
                ).hexdigest(),
                "examples": catalog_ids[:10],
            }
        )
        for index in indices:
            reused_instruction_by_spec[index].append(phrase)
    for index, phrases in reused_instruction_by_spec.items():
        if not phrases:
            continue
        examples = [
            " ".join(phrase)
            for phrase in sorted(phrases)[:3]
        ]
        duplicate_errors[specs[index].catalog_id].append(
            _issue(
                "over_reused_instruction_copy",
                (
                    f"Section or block guidance contains {len(phrases)} long "
                    "phrase(s) reused across more than "
                    f"{MAX_REUSED_INSTRUCTION_PHRASE_COUNT} forms; rewrite the "
                    "instructions around this task. Examples: "
                    + "; ".join(examples)
                    + "."
                ),
            )
        )
    reused_control_label_limit = max(
        MIN_REUSED_CONTROL_LABEL_COUNT,
        int(len(specs) * MAX_REUSED_CONTROL_LABEL_SHARE),
    )
    reused_control_labels_by_spec: dict[int, list[tuple[str, ...]]] = {
        index: [] for index in range(len(specs))
    }
    over_reused_control_labels: list[dict[str, Any]] = []
    for label, indices in sorted(control_label_groups.items()):
        if len(indices) <= reused_control_label_limit:
            continue
        catalog_ids = sorted(specs[index].catalog_id for index in indices)
        over_reused_control_labels.append(
            {
                "count": len(indices),
                "label": " ".join(label),
                "catalog_ids_sha256": hashlib.sha256(
                    "\n".join(catalog_ids).encode("utf-8")
                ).hexdigest(),
                "examples": catalog_ids[:10],
            }
        )
        for index in indices:
            reused_control_labels_by_spec[index].append(label)
    for index, labels in reused_control_labels_by_spec.items():
        if not labels:
            continue
        examples = [
            " ".join(label)
            for label in sorted(labels)[:3]
        ]
        duplicate_errors[specs[index].catalog_id].append(
            _issue(
                "over_reused_control_label",
                (
                    f"Control copy contains {len(labels)} label(s) reused by "
                    f"more than {reused_control_label_limit} forms in this "
                    "batch; replace the shared workflow shell with inputs "
                    "specific to the named task. Examples: "
                    + "; ".join(examples)
                    + "."
                ),
            )
        )
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
        "over_reused_structures": over_reused_structures,
        "over_reused_semantic_skeletons": over_reused_semantic_skeletons,
        "over_reused_metadata_phrases": over_reused_metadata_phrases,
        "over_reused_instruction_phrases": over_reused_instruction_phrases,
        "over_reused_control_labels": over_reused_control_labels,
        "structure_distribution": {
            "unique_signatures": len(structure_groups),
            "largest_group": max(
                (len(indices) for indices in structure_groups.values()),
                default=0,
            ),
            "group_size_histogram": {
                str(size): count
                for size, count in sorted(structure_group_sizes.items())
            },
        },
        "semantic_skeleton_distribution": {
            "unique_signatures": len(semantic_skeleton_groups),
            "largest_group": max(
                (len(indices) for indices in semantic_skeleton_groups.values()),
                default=0,
            ),
            "group_size_histogram": {
                str(size): count
                for size, count in sorted(semantic_skeleton_group_sizes.items())
            },
        },
        "metadata_phrase_distribution": {
            "ngram_size": METADATA_NGRAM_SIZE,
            "unique_phrases": len(metadata_phrase_groups),
            "largest_group": max(
                (len(indices) for indices in metadata_phrase_groups.values()),
                default=0,
            ),
        },
        "instruction_phrase_distribution": {
            "ngram_size": INSTRUCTION_NGRAM_SIZE,
            "unique_phrases": len(instruction_phrase_groups),
            "largest_group": max(
                (len(indices) for indices in instruction_phrase_groups.values()),
                default=0,
            ),
        },
        "control_label_distribution": {
            "minimum_words": MIN_CONTROL_LABEL_WORDS,
            "max_allowed_count": reused_control_label_limit,
            "unique_labels": len(control_label_groups),
            "largest_group": max(
                (len(indices) for indices in control_label_groups.values()),
                default=0,
            ),
        },
    }
