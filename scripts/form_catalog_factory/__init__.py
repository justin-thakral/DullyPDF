"""Deterministic production tooling for DullyPDF-authored catalog forms.

The package facade uses lazy exports because several commands only need the
JSON release validators. Eagerly importing the PDF renderer and live checker
would make those lightweight commands depend on ReportLab, Pillow, and pypdf.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any


_EXPORTS = {
    "CatalogFactoryLedger": (".ledger", "CatalogFactoryLedger"),
    "FormSpec": (".models", "FormSpec"),
    "SpecValidationError": (".models", "SpecValidationError"),
    "Stage": (".ledger", "Stage"),
    "WorkLease": (".ledger", "WorkLease"),
    "build_active_contract": (".activation", "build_active_contract"),
    "build_batch_plan": (".batch_plan", "build_batch_plan"),
    "build_release": (".release_builder", "build_release"),
    "build_sample_plan": (".sampling", "build_sample_plan"),
    "claim_spec": (".worker_control", "claim_spec"),
    "complete_spec_claim": (".worker_control", "complete_spec_claim"),
    "heartbeat_claim": (".worker_control", "heartbeat_claim"),
    "load_form_spec": (".models", "load_form_spec"),
    "open_batch_from_plan": (".batch_control", "open_batch_from_plan"),
    "register_existing_specs": (".worker_control", "register_existing_specs"),
    "render_form": (".renderer", "render_form"),
    "select_candidates": (".batch_plan", "select_candidates"),
    "validate_batch": (".pdf_qa", "validate_batch"),
    "validate_live_samples": (".live_validation", "validate_live_samples"),
    "validate_manifest": (".pdf_qa", "validate_manifest"),
    "validate_pdf": (".pdf_qa", "validate_pdf"),
    "validate_spec_batch": (".spec_qa", "validate_spec_batch"),
    "validate_spec_content": (".spec_qa", "validate_spec_content"),
}

__all__ = [
    "CatalogFactoryLedger",
    "FormSpec",
    "SpecValidationError",
    "Stage",
    "WorkLease",
    "build_active_contract",
    "build_release",
    "build_batch_plan",
    "build_sample_plan",
    "claim_spec",
    "complete_spec_claim",
    "heartbeat_claim",
    "register_existing_specs",
    "load_form_spec",
    "open_batch_from_plan",
    "render_form",
    "select_candidates",
    "validate_batch",
    "validate_manifest",
    "validate_live_samples",
    "validate_pdf",
    "validate_spec_batch",
    "validate_spec_content",
]


def __getattr__(name: str) -> Any:
    """Load a public facade symbol only when a caller requests it."""

    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = target
    value = getattr(import_module(module_name, __name__), attribute_name)
    globals()[name] = value
    return value


def __dir__() -> list[str]:
    """Expose lazy public symbols to interactive callers and documentation."""

    return sorted(set(globals()) | set(__all__))
