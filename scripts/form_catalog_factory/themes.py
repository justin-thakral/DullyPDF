"""Versioned semantic color themes for deterministic catalog-form rendering."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from typing import Any, Mapping


HEX_COLOR_RE = re.compile(r"^#[0-9A-F]{6}$")
DEFAULT_THEME_ID = "legacy-navy-orange-v1"


class ThemeError(ValueError):
    """Raised when a renderer theme is unknown or internally invalid."""


@dataclass(frozen=True)
class FormTheme:
    """Map semantic renderer roles to stable six-digit RGB colors."""

    theme_id: str
    title_text: str
    body_text: str
    muted_text: str
    header_background: str
    header_text: str
    header_subtitle: str
    accent: str
    section_background: str
    section_badge: str
    section_text: str
    label_text: str
    field_border: str
    field_background: str
    field_text: str
    checkbox_border: str
    grid_line: str
    table_header: str
    table_header_text: str
    notice_background: str
    notice_text: str

    def __post_init__(self) -> None:
        if not self.theme_id or self.theme_id != self.theme_id.strip():
            raise ThemeError("theme_id must be a non-empty trimmed string")
        for role, value in asdict(self).items():
            if role == "theme_id":
                continue
            if not isinstance(value, str) or not HEX_COLOR_RE.fullmatch(value):
                raise ThemeError(
                    f"{self.theme_id}.{role} must be an uppercase six-digit hex color"
                )

    def palette(self) -> dict[str, str]:
        """Return the semantic palette without the registry identity."""

        return {
            role: value
            for role, value in asdict(self).items()
            if role != "theme_id"
        }

    def palette_sha256(self) -> str:
        """Hash the canonical semantic palette for release provenance."""

        encoded = json.dumps(
            self.palette(),
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def provenance(self) -> dict[str, Any]:
        """Return reviewable, canonical release metadata for this theme."""

        return {
            "schemaVersion": 1,
            "id": self.theme_id,
            "paletteSha256": self.palette_sha256(),
            "palette": self.palette(),
        }


LEGACY_NAVY_ORANGE = FormTheme(
    theme_id=DEFAULT_THEME_ID,
    title_text="#0F172A",
    body_text="#334155",
    muted_text="#64748B",
    header_background="#102A43",
    header_text="#FFFFFF",
    header_subtitle="#E2E8F0",
    accent="#F97316",
    section_background="#E6F1F8",
    section_badge="#1683C4",
    section_text="#102A43",
    label_text="#1F2937",
    field_border="#94A3B8",
    field_background="#F8FAFC",
    field_text="#000000",
    checkbox_border="#64748B",
    grid_line="#CBD5E1",
    table_header="#102A43",
    table_header_text="#FFFFFF",
    notice_background="#FEF3C7",
    notice_text="#92400E",
)

CHARCOAL_DEEP_GREEN_GOLD = FormTheme(
    theme_id="charcoal-deep-green-gold-v1",
    title_text="#202824",
    body_text="#33463F",
    muted_text="#65756D",
    header_background="#173C32",
    header_text="#FFFFFF",
    header_subtitle="#E8F0EB",
    accent="#C49A3A",
    section_background="#E8F0EB",
    section_badge="#2F6B57",
    section_text="#173C32",
    label_text="#202824",
    field_border="#9AAEA5",
    field_background="#F7FAF8",
    field_text="#202824",
    checkbox_border="#2F6B57",
    grid_line="#C4D0CA",
    table_header="#173C32",
    table_header_text="#FFFFFF",
    notice_background="#FBF3DC",
    notice_text="#6B5218",
)

THEMES = {
    theme.theme_id: theme
    for theme in (
        LEGACY_NAVY_ORANGE,
        CHARCOAL_DEEP_GREEN_GOLD,
    )
}


def get_theme(theme_id: str = DEFAULT_THEME_ID) -> FormTheme:
    """Resolve one exact versioned theme identity."""

    try:
        return THEMES[theme_id]
    except KeyError as exc:
        raise ThemeError(
            f"unknown form theme {theme_id!r}; expected one of {sorted(THEMES)}"
        ) from exc


def validate_theme_provenance(
    value: Any,
    *,
    location: str = "renderTheme",
) -> dict[str, Any]:
    """Validate one serialized provenance object against the exact registry."""

    if not isinstance(value, dict):
        raise ThemeError(f"{location} must be an object")
    theme_id = value.get("id")
    if not isinstance(theme_id, str) or not theme_id:
        raise ThemeError(f"{location}.id must be a non-empty string")
    expected = get_theme(theme_id).provenance()
    if value != expected:
        raise ThemeError(
            f"{location} does not exactly match the registered theme provenance"
        )
    return expected


def resolve_theme_provenance(
    *sources: tuple[str, Mapping[str, Any]],
) -> dict[str, Any] | None:
    """Resolve all-absent legacy evidence or one exact shared theme."""

    present = [
        (label, payload["renderTheme"])
        for label, payload in sources
        if "renderTheme" in payload
    ]
    if not present:
        return None
    if len(present) != len(sources):
        missing = ", ".join(
            label for label, payload in sources if "renderTheme" not in payload
        )
        raise ThemeError(
            "renderTheme must be supplied by every bound artifact once any "
            f"artifact supplies it; missing from {missing}"
        )
    expected = validate_theme_provenance(
        present[0][1],
        location=f"{present[0][0]}.renderTheme",
    )
    for label, value in present[1:]:
        actual = validate_theme_provenance(
            value,
            location=f"{label}.renderTheme",
        )
        if actual != expected:
            raise ThemeError(
                f"{label}.renderTheme does not match "
                f"{present[0][0]}.renderTheme"
            )
    return expected
