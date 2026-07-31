"""Deterministic ReportLab renderer for declarative catalog form specs."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from .models import BlockSpec, FieldSpec, FormSpec
from .themes import DEFAULT_THEME_ID, FormTheme, get_theme


PAGE_WIDTH, PAGE_HEIGHT = letter
CHOICE_PROMPT = "Select"
NEUTRAL_CHOICE_PROMPT_TARGETS = frozenset(
    {
        "an option",
        "category",
        "condition",
        "configuration",
        "decision",
        "disposition",
        "level",
        "lifecycle status",
        "one",
        "option",
        "priority",
        "result",
        "state",
        "status",
        "system",
        "type",
    }
)
MAX_KEEP_TOGETHER_SECTION_HEIGHT = 320
MIN_SUBSTANTIVE_PAGE_CONTENT_HEIGHT = 180


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


class FormRenderer:
    """Render one validated form spec with deterministic pagination and widgets."""

    def __init__(
        self,
        pdf_canvas: canvas.Canvas,
        spec: FormSpec,
        *,
        theme: FormTheme | str = DEFAULT_THEME_ID,
    ):
        self.canvas = pdf_canvas
        self.spec = spec
        self.theme = get_theme(theme) if isinstance(theme, str) else theme
        self.margin_x = 0.56 * inch
        self.top_y = PAGE_HEIGHT - 0.52 * inch
        self.bottom_y = 0.58 * inch
        self.content_width = PAGE_WIDTH - 2 * self.margin_x
        self.page_number = 0
        self.section_number = 0
        self.current_section_title = ""
        self.current_section_guidance = ""
        self.y = self.top_y
        self.content_top_y = self.top_y
        self.field_names: set[str] = set()
        self.styles = self._styles()
        self.new_page()

    def _styles(self) -> dict[str, ParagraphStyle]:
        base = getSampleStyleSheet()
        return {
            "title": ParagraphStyle(
                "FactoryTitle",
                parent=base["Heading1"],
                fontName="Helvetica-Bold",
                fontSize=16,
                leading=18,
                textColor=colors.HexColor(self.theme.title_text),
            ),
            "subtitle": ParagraphStyle(
                "FactorySubtitle",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=8.2,
                leading=10.2,
                textColor=colors.HexColor(self.theme.body_text),
            ),
            "body": ParagraphStyle(
                "FactoryBody",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=7.6,
                leading=9.4,
                textColor=colors.HexColor(self.theme.body_text),
            ),
            "small": ParagraphStyle(
                "FactorySmall",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=6.7,
                leading=8,
                textColor=colors.HexColor(self.theme.muted_text),
            ),
            "checklist": ParagraphStyle(
                "FactoryChecklist",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=7.1,
                leading=8.2,
                textColor=colors.HexColor(self.theme.body_text),
            ),
        }

    def _paragraph(
        self,
        text: str,
        style_name: str,
        x: float,
        top_y: float,
        width: float,
    ) -> float:
        paragraph = Paragraph(escape(text), self.styles[style_name])
        _, height = paragraph.wrap(width, PAGE_HEIGHT)
        paragraph.drawOn(self.canvas, x, top_y - height)
        return height

    def _paragraph_height(self, text: str, style_name: str, width: float) -> float:
        paragraph = Paragraph(escape(text), self.styles[style_name])
        _, height = paragraph.wrap(width, PAGE_HEIGHT)
        return height

    def _checklist_row_heights(self, block: BlockSpec) -> list[float]:
        columns = 2 if len(block.items) > 4 else 1
        column_width = self.content_width / columns
        item_heights = [
            self._paragraph_height(item, "checklist", column_width - 17)
            for item in block.items
        ]
        rows = (len(block.items) + columns - 1) // columns
        return [
            max(
                11,
                *item_heights[row * columns : min((row + 1) * columns, len(item_heights))],
            )
            + 5
            for row in range(rows)
        ]

    def _block_required_height(self, block: BlockSpec) -> float:
        """Estimate the complete block footprint before pagination decisions."""

        guidance_height = (
            self._paragraph_height(block.guidance, "small", self.content_width) + 4
            if block.guidance
            else 0
        )
        if block.type in {"fields", "signatures"}:
            return 58 + guidance_height
        if block.type == "textarea":
            return block.height + 23 + guidance_height
        if block.type == "checklist":
            return 23 + sum(self._checklist_row_heights(block)) + guidance_height
        if block.type == "table":
            return 44 + block.rows * 17 + guidance_height
        if block.type == "notice":
            text_height = self._paragraph_height(
                block.guidance,
                "body",
                self.content_width - 16,
            )
            return text_height + 26
        raise ValueError(f"unsupported block type: {block.type}")

    @staticmethod
    def _block_widget_count(block: BlockSpec) -> int:
        return (
            len(block.fields)
            + len(block.items)
            + block.rows * len(block.columns)
        )

    def _closeout_tail(self, blocks: tuple[BlockSpec, ...]) -> tuple[int, float]:
        """Choose a substantive final-page suffix that still fits one page."""

        tail_start = len(blocks) - 1
        tail_height = 0.0
        widget_count = 0
        for index in range(len(blocks) - 1, -1, -1):
            block_height = self._block_required_height(blocks[index])
            if tail_height and tail_height + block_height > 560:
                break
            tail_start = index
            tail_height += block_height
            widget_count += self._block_widget_count(blocks[index])
            if tail_height >= 280 and widget_count >= 10:
                break
        return tail_start, tail_height

    def _start_balanced_section(self, blocks: tuple[BlockSpec, ...]) -> None:
        """Move a complete section to a fresh page when that avoids a sparse tail."""

        section_height = 34 + sum(
            self._block_required_height(block) for block in blocks
        )
        if section_height > MAX_KEEP_TOGETHER_SECTION_HEIGHT:
            return
        page_floor = self.bottom_y + 0.2 * inch
        available_height = self.y - page_floor
        used_height = self.content_top_y - self.y
        if (
            section_height > available_height
            and used_height >= MIN_SUBSTANTIVE_PAGE_CONTENT_HEIGHT
        ):
            self.new_page()

    @staticmethod
    def _rendered_choice_options(field: FieldSpec) -> tuple[str, ...]:
        """Return one canonical prompt without dropping substantive outcomes."""

        def is_neutral_prompt(value: str) -> bool:
            normalized = " ".join(re.findall(r"[a-z0-9]+", value.casefold()))
            words = normalized.split(maxsplit=1)
            if not words or words[0] not in {"choose", "select"}:
                return False
            return len(words) == 1 or words[1] in NEUTRAL_CHOICE_PROMPT_TARGETS

        authored = tuple(
            option for option in field.options if not is_neutral_prompt(option)
        )
        return (CHOICE_PROMPT, *authored)

    def _draw_fitted_line(
        self,
        text: str,
        *,
        x: float,
        y: float,
        width: float,
        font_name: str,
        maximum_size: float,
        minimum_size: float,
    ) -> None:
        """Draw one complete label when possible and ellipsize only at words."""

        normalized = " ".join(text.split())
        size = maximum_size
        while size > minimum_size and stringWidth(normalized, font_name, size) > width:
            size = max(minimum_size, size - 0.2)
        rendered = normalized
        if stringWidth(rendered, font_name, size) > width:
            if self.theme.theme_id != DEFAULT_THEME_ID:
                raise ValueError(
                    "customer-visible line does not fit the available width at "
                    f"the minimum font size: {normalized!r}"
                )
            words = normalized.split()
            kept: list[str] = []
            for word in words:
                candidate = " ".join((*kept, word))
                if stringWidth(f"{candidate}…", font_name, size) > width:
                    break
                kept.append(word)
            rendered = f"{' '.join(kept)}…" if kept else "…"
        self.canvas.setFont(font_name, size)
        self.canvas.drawString(x, y, rendered)

    def _field_name(self, semantic_path: str) -> str:
        prefix = _slugify(self.spec.catalog_id)[:42]
        readable = _slugify(semantic_path)
        digest = hashlib.sha256(semantic_path.encode("utf-8")).hexdigest()[:8]
        name = f"{prefix}_{readable[:70]}_{digest}"
        if name in self.field_names:
            raise ValueError(f"duplicate rendered field name: {name}")
        self.field_names.add(name)
        return name

    def _footer(self) -> None:
        self.canvas.setStrokeColor(colors.HexColor(self.theme.grid_line))
        self.canvas.line(
            self.margin_x,
            self.bottom_y + 0.13 * inch,
            PAGE_WIDTH - self.margin_x,
            self.bottom_y + 0.13 * inch,
        )
        footer = (
            (
                "DullyPDF original fillable template. Confirm applicable legal, "
                "safety, privacy, insurance, tax, and retention requirements "
                "before use."
            )
            if self.theme.theme_id == DEFAULT_THEME_ID
            else (
                "DullyPDF original fillable template. Adapt this form to your "
                "organization's policies, roles, and recordkeeping needs."
            )
        )
        self._paragraph(
            footer,
            "small",
            self.margin_x,
            self.bottom_y + 0.06 * inch,
            self.content_width - 0.5 * inch,
        )
        self.canvas.setFillColor(colors.HexColor(self.theme.muted_text))
        self.canvas.setFont("Helvetica", 6.8)
        self.canvas.drawRightString(
            PAGE_WIDTH - self.margin_x,
            self.bottom_y + 0.04 * inch,
            f"Page {self.page_number}",
        )

    def new_page(self) -> None:
        if self.page_number:
            self._footer()
            self.canvas.showPage()
        self.page_number += 1
        title = (
            self.spec.title
            if self.page_number == 1
            else f"{self.spec.title} - Continued"
        )
        title_style = ParagraphStyle(
            "FactoryHeaderTitle",
            parent=self.styles["title"],
            textColor=colors.HexColor(self.theme.header_text),
        )
        subtitle_style = ParagraphStyle(
            "FactoryHeaderSubtitle",
            parent=self.styles["subtitle"],
            textColor=colors.HexColor(self.theme.header_subtitle),
        )
        title_width = self.content_width - 1.48 * inch
        title_paragraph = Paragraph(escape(title), title_style)
        _, title_height = title_paragraph.wrap(title_width, PAGE_HEIGHT)
        subtitle_paragraph = Paragraph(escape(self.spec.subtitle), subtitle_style)
        _, subtitle_height = subtitle_paragraph.wrap(
            self.content_width - 0.25 * inch,
            PAGE_HEIGHT,
        )
        header_height = max(
            0.9 * inch,
            title_height + subtitle_height + 0.36 * inch,
        )
        header_bottom = PAGE_HEIGHT - header_height
        self.canvas.setFillColor(colors.HexColor(self.theme.header_background))
        self.canvas.rect(0, header_bottom, PAGE_WIDTH, header_height, stroke=0, fill=1)
        title_paragraph.drawOn(
            self.canvas,
            self.margin_x,
            PAGE_HEIGHT - 0.22 * inch - title_height,
        )
        subtitle_paragraph.drawOn(
            self.canvas,
            self.margin_x,
            PAGE_HEIGHT - 0.25 * inch - title_height - subtitle_height - 5,
        )
        self.canvas.setFillColor(colors.HexColor(self.theme.header_text))
        self.canvas.setFont("Helvetica-Bold", 6.8)
        header_label = (
            self.spec.catalog_id[-22:]
            if self.theme.theme_id == DEFAULT_THEME_ID
            else "DullyPDF Fillable Form"
        )
        self.canvas.drawRightString(
            PAGE_WIDTH - self.margin_x,
            PAGE_HEIGHT - 0.27 * inch,
            header_label,
        )
        self.canvas.setStrokeColor(colors.HexColor(self.theme.accent))
        self.canvas.setLineWidth(2.2)
        self.canvas.line(
            0,
            header_bottom,
            PAGE_WIDTH,
            header_bottom,
        )
        self.y = header_bottom - 0.23 * inch
        self.content_top_y = self.y

    def ensure_space(self, height: float, *, repeat_section: bool = True) -> None:
        if self.y - height < self.bottom_y + 0.2 * inch:
            self.new_page()
            if repeat_section and self.current_section_title:
                self._draw_section_band(
                    f"{self.current_section_title} - continued",
                    self.current_section_guidance,
                    self.section_number,
                )

    def render_section_heading(
        self,
        title: str,
        guidance: str,
        *,
        first_block_height: float,
    ) -> None:
        # Reserve the first block with the section band so a late-page heading
        # never becomes an empty promise followed by the content on a new page.
        self.ensure_space(34 + first_block_height, repeat_section=False)
        self.section_number += 1
        self.current_section_title = title
        self.current_section_guidance = guidance
        self._draw_section_band(title, guidance, self.section_number)

    def _draw_section_band(
        self,
        title: str,
        guidance: str,
        number: int,
    ) -> None:
        heading_height = 24
        self.canvas.setFillColor(colors.HexColor(self.theme.section_background))
        self.canvas.roundRect(
            self.margin_x,
            self.y - heading_height,
            self.content_width,
            heading_height,
            6,
            stroke=0,
            fill=1,
        )
        number_width = 35
        self.canvas.setFillColor(colors.HexColor(self.theme.section_badge))
        self.canvas.roundRect(
            self.margin_x,
            self.y - heading_height,
            number_width,
            heading_height,
            6,
            stroke=0,
            fill=1,
        )
        self.canvas.setFillColor(colors.HexColor(self.theme.header_text))
        self.canvas.setFont("Helvetica-Bold", 8.2)
        self.canvas.drawCentredString(
            self.margin_x + number_width / 2,
            self.y - 15.5,
            f"{number:02d}",
        )
        self.canvas.setFillColor(colors.HexColor(self.theme.section_text))
        guidance_width = self.content_width * 0.39 if guidance else 0
        title_x = self.margin_x + number_width + 10
        title_width = self.content_width - number_width - 20 - guidance_width
        self._draw_fitted_line(
            title,
            x=title_x,
            y=self.y - 15.5,
            width=title_width,
            font_name="Helvetica-Bold",
            maximum_size=9.2,
            minimum_size=6.4,
        )
        if guidance:
            guidance_style = ParagraphStyle(
                "FactorySectionGuidance",
                parent=self.styles["small"],
                alignment=2,
            )
            guidance_paragraph = Paragraph(escape(guidance), guidance_style)
            _, guidance_height = guidance_paragraph.wrap(
                guidance_width,
                heading_height - 4,
            )
            guidance_paragraph.drawOn(
                self.canvas,
                PAGE_WIDTH - self.margin_x - guidance_width - 7,
                self.y - (heading_height + guidance_height) / 2 + 1,
            )
        self.y -= heading_height + 10

    def _draw_field(
        self,
        field: FieldSpec,
        semantic_path: str,
        x: float,
        width: float,
        height: float,
    ) -> None:
        self.canvas.setFillColor(colors.HexColor(self.theme.label_text))
        self._draw_fitted_line(
            field.label,
            x=x,
            y=self.y,
            width=width,
            font_name="Helvetica",
            maximum_size=7.4,
            minimum_size=5.2,
        )
        name = self._field_name(semantic_path)
        if field.field_type == "choice":
            options = self._rendered_choice_options(field)
            self.canvas.acroForm.choice(
                name=name,
                tooltip=field.label,
                value=options[0],
                options=list(options),
                x=x,
                y=self.y - height - 4,
                width=width,
                height=height,
                borderStyle="solid",
                borderColor=colors.HexColor(self.theme.field_border),
                fillColor=colors.HexColor(self.theme.field_background),
                textColor=colors.HexColor(self.theme.field_text),
                fontName="Helvetica",
                fontSize=7.5,
                fieldFlags="combo",
            )
            return
        kwargs = {"fieldFlags": "multiline"} if field.multiline else {}
        self.canvas.acroForm.textfield(
            name=name,
            tooltip=field.label,
            x=x,
            y=self.y - height - 4,
            width=width,
            height=height,
            borderStyle="solid",
            borderColor=colors.HexColor(self.theme.field_border),
            fillColor=colors.HexColor(self.theme.field_background),
            textColor=colors.HexColor(self.theme.field_text),
            fontName="Helvetica",
            fontSize=7.8,
            **kwargs,
        )

    def render_fields(self, section_key: str, block: BlockSpec) -> None:
        height = 20
        self.ensure_space(self._block_required_height(block))
        if block.label:
            self.canvas.setFillColor(colors.HexColor(self.theme.section_text))
            self._draw_fitted_line(
                block.label,
                x=self.margin_x,
                y=self.y,
                width=self.content_width,
                font_name="Helvetica-Bold",
                maximum_size=7.5,
                minimum_size=6,
            )
            self.y -= 17
        total_units = sum(field.units for field in block.fields)
        gap = 7
        available = self.content_width - gap * (len(block.fields) - 1)
        x = self.margin_x
        for field in block.fields:
            width = available * field.units / total_units
            self._draw_field(
                field,
                f"{section_key}.{block.key}.{field.key}",
                x,
                width,
                height,
            )
            x += width + gap
        self.y -= height + 21
        if block.guidance:
            used = self._paragraph(
                block.guidance,
                "small",
                self.margin_x,
                self.y + 4,
                self.content_width,
            )
            self.y -= used + 4

    def render_textarea(self, section_key: str, block: BlockSpec) -> None:
        field = block.fields[0]
        self.ensure_space(self._block_required_height(block))
        self.canvas.setFillColor(colors.HexColor(self.theme.section_text))
        self._draw_fitted_line(
            block.label,
            x=self.margin_x,
            y=self.y,
            width=self.content_width,
            font_name="Helvetica-Bold",
            maximum_size=7.5,
            minimum_size=6,
        )
        self.canvas.acroForm.textfield(
            name=self._field_name(f"{section_key}.{block.key}.{field.key}"),
            tooltip=field.label,
            x=self.margin_x,
            y=self.y - block.height - 7,
            width=self.content_width,
            height=block.height,
            borderStyle="solid",
            borderColor=colors.HexColor(self.theme.field_border),
            fillColor=colors.HexColor(self.theme.field_background),
            textColor=colors.HexColor(self.theme.field_text),
            fontName="Helvetica",
            fontSize=7.8,
            fieldFlags="multiline",
        )
        self.y -= block.height + 23
        if block.guidance:
            used = self._paragraph(
                block.guidance,
                "small",
                self.margin_x,
                self.y + 4,
                self.content_width,
            )
            self.y -= used + 4

    def render_checklist(self, section_key: str, block: BlockSpec) -> None:
        columns = 2 if len(block.items) > 4 else 1
        rows = (len(block.items) + columns - 1) // columns
        column_width = self.content_width / columns
        paragraphs: list[tuple[Paragraph, float]] = []
        for item in block.items:
            paragraph = Paragraph(escape(item), self.styles["checklist"])
            _, height = paragraph.wrap(column_width - 17, PAGE_HEIGHT)
            paragraphs.append((paragraph, height))
        row_heights = self._checklist_row_heights(block)
        self.ensure_space(self._block_required_height(block))
        self.canvas.setFillColor(colors.HexColor(self.theme.section_text))
        self._draw_fitted_line(
            block.label,
            x=self.margin_x,
            y=self.y,
            width=self.content_width,
            font_name="Helvetica-Bold",
            maximum_size=7.5,
            minimum_size=6,
        )
        self.y -= 16
        row_top = self.y + 4
        for index, item in enumerate(block.items):
            row = index // columns
            column = index % columns
            x = self.margin_x + column * column_width
            y = row_top - sum(row_heights[:row]) - 9
            self.canvas.acroForm.checkbox(
                name=self._field_name(
                    f"{section_key}.{block.key}.item_{index + 1}"
                ),
                tooltip=item,
                x=x,
                y=y,
                size=9,
                borderWidth=0.7,
                borderColor=colors.HexColor(self.theme.checkbox_border),
                fillColor=colors.white,
                textColor=colors.HexColor(self.theme.field_text),
                buttonStyle="check",
            )
            paragraph, paragraph_height = paragraphs[index]
            paragraph.drawOn(
                self.canvas,
                x + 13,
                y + 9 - paragraph_height,
            )
        self.y -= sum(row_heights) + 7
        if block.guidance:
            used = self._paragraph(
                block.guidance,
                "small",
                self.margin_x,
                self.y + 3,
                self.content_width,
            )
            self.y -= used + 4

    def render_table(self, section_key: str, block: BlockSpec) -> None:
        header_height = 20
        row_height = 17
        self.ensure_space(self._block_required_height(block))
        self.canvas.setFillColor(colors.HexColor(self.theme.section_text))
        self._draw_fitted_line(
            block.label,
            x=self.margin_x,
            y=self.y,
            width=self.content_width,
            font_name="Helvetica-Bold",
            maximum_size=7.5,
            minimum_size=6,
        )
        self.y -= 16
        total_units = sum(column.units for column in block.columns)
        widths = [self.content_width * column.units / total_units for column in block.columns]
        x_positions = [self.margin_x]
        for width in widths[:-1]:
            x_positions.append(x_positions[-1] + width)
        table_top = self.y
        self.canvas.setFillColor(colors.HexColor(self.theme.table_header))
        self.canvas.rect(
            self.margin_x,
            table_top - header_height,
            self.content_width,
            header_height,
            stroke=0,
            fill=1,
        )
        self.canvas.setStrokeColor(colors.HexColor(self.theme.grid_line))
        self.canvas.setLineWidth(0.6)
        self.canvas.rect(
            self.margin_x,
            table_top - header_height - block.rows * row_height,
            self.content_width,
            header_height + block.rows * row_height,
            stroke=1,
            fill=0,
        )
        for index, column in enumerate(block.columns):
            x = x_positions[index]
            if index:
                self.canvas.line(
                    x,
                    table_top,
                    x,
                    table_top - header_height - block.rows * row_height,
                )
            header_style = ParagraphStyle(
                "FactoryTableHeader",
                parent=self.styles["small"],
                textColor=colors.HexColor(self.theme.table_header_text),
                fontName="Helvetica-Bold",
            )
            header_paragraph = Paragraph(escape(column.label), header_style)
            _, header_text_height = header_paragraph.wrap(
                widths[index] - 6,
                header_height - 3,
            )
            header_paragraph.drawOn(
                self.canvas,
                x + 3,
                table_top - header_text_height - 4,
            )
        self.canvas.line(
            self.margin_x,
            table_top - header_height,
            self.margin_x + self.content_width,
            table_top - header_height,
        )
        for row in range(block.rows):
            row_bottom = table_top - header_height - (row + 1) * row_height
            if row < block.rows - 1:
                self.canvas.line(
                    self.margin_x,
                    row_bottom,
                    self.margin_x + self.content_width,
                    row_bottom,
                )
            for index, column in enumerate(block.columns):
                self.canvas.acroForm.textfield(
                    name=self._field_name(
                        f"{section_key}.{block.key}.row_{row + 1}.{column.key}"
                    ),
                    tooltip=f"{block.label} row {row + 1}: {column.label}",
                    x=x_positions[index] + 2,
                    y=row_bottom + 2,
                    width=widths[index] - 4,
                    height=row_height - 4,
                    borderWidth=0,
                    fillColor=colors.white,
                    textColor=colors.HexColor(self.theme.field_text),
                    fontName="Helvetica",
                    fontSize=6.8,
                )
        self.y = table_top - header_height - block.rows * row_height - 8
        if block.guidance:
            used = self._paragraph(
                block.guidance,
                "small",
                self.margin_x,
                self.y + 3,
                self.content_width,
            )
            self.y -= used + 4

    def render_notice(self, block: BlockSpec) -> None:
        para = Paragraph(escape(block.guidance), self.styles["body"])
        _, text_height = para.wrap(self.content_width - 16, PAGE_HEIGHT)
        required = text_height + 19
        self.ensure_space(self._block_required_height(block))
        self.canvas.setFillColor(colors.HexColor(self.theme.notice_background))
        self.canvas.roundRect(
            self.margin_x,
            self.y - required + 2,
            self.content_width,
            required,
            4,
            stroke=0,
            fill=1,
        )
        self.canvas.setFillColor(colors.HexColor(self.theme.notice_text))
        self._draw_fitted_line(
            block.label,
            x=self.margin_x + 8,
            y=self.y - 10,
            width=self.content_width - 16,
            font_name="Helvetica-Bold",
            maximum_size=7.5,
            minimum_size=6,
        )
        self._paragraph(
            block.guidance,
            "body",
            self.margin_x + 8,
            self.y - 14,
            self.content_width - 16,
        )
        self.y -= required + 7

    def render_block(self, section_key: str, block: BlockSpec) -> None:
        if block.type in {"fields", "signatures"}:
            self.render_fields(section_key, block)
        elif block.type == "textarea":
            self.render_textarea(section_key, block)
        elif block.type == "checklist":
            self.render_checklist(section_key, block)
        elif block.type == "table":
            self.render_table(section_key, block)
        elif block.type == "notice":
            self.render_notice(block)
        else:
            raise ValueError(f"unsupported block type: {block.type}")

    def render(self) -> None:
        for index, section in enumerate(self.spec.sections):
            self._start_balanced_section(section.blocks)
            is_final_section = index == len(self.spec.sections) - 1
            tail_start, tail_height = (
                self._closeout_tail(section.blocks)
                if is_final_section
                else (len(section.blocks), 0)
            )
            if is_final_section and tail_start == 0:
                self.ensure_space(34 + tail_height, repeat_section=False)
            self.render_section_heading(
                section.title,
                section.guidance,
                first_block_height=self._block_required_height(section.blocks[0]),
            )
            for block_index, block in enumerate(section.blocks):
                if (
                    is_final_section
                    and tail_start > 0
                    and block_index == tail_start
                ):
                    # Keep enough closeout controls together that a signature or
                    # handoff row cannot become the only content on the last page.
                    self.ensure_space(tail_height)
                self.render_block(section.key, block)
        self._footer()
        self.canvas.save()


def render_form(
    spec: FormSpec,
    output_path: str | Path,
    *,
    theme_id: str = DEFAULT_THEME_ID,
) -> Path:
    """Render one form to a deterministic compressed PDF."""

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pdf_canvas = canvas.Canvas(
        str(destination),
        pagesize=letter,
        invariant=1,
        pageCompression=1,
    )
    FormRenderer(pdf_canvas, spec, theme=theme_id).render()
    return destination
