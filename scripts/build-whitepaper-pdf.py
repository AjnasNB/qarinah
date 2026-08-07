#!/usr/bin/env python3
"""Build the Qarinah technical white paper PDF from docs/WHITEPAPER.md."""

from __future__ import annotations

import html
import hashlib
import re
import sys
from pathlib import Path

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "WHITEPAPER.md"
OUTPUT = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.2.pdf"
OUTPUT_DIGEST = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.2.source.sha256"
REPOSITORY_BLOB = "https://github.com/AjnasNB/qarinah/blob/main/"

PAGE_WIDTH, PAGE_HEIGHT = A4
BODY_LEFT = 25 * mm
BODY_RIGHT = 20 * mm
BODY_TOP = 23 * mm
BODY_BOTTOM = 20 * mm
BODY_WIDTH = PAGE_WIDTH - BODY_LEFT - BODY_RIGHT

INK = colors.HexColor("#10201C")
MUTED = colors.HexColor("#52645E")
GREEN = colors.HexColor("#13C98B")
DARK_GREEN = colors.HexColor("#07563F")
PALE_GREEN = colors.HexColor("#E7F8F1")
LIGHT = colors.HexColor("#F4F7F5")
RULE = colors.HexColor("#CBD8D2")
WHITE = colors.white
CODE_BG = colors.HexColor("#0E1A17")
CODE_FG = colors.HexColor("#E8F8F1")

rl_config.invariant = 1


def register_fonts() -> tuple[str, str, str, str]:
    candidates = [
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/ariali.ttf"),
            Path("C:/Windows/Fonts/consola.ttf"),
        ),
        (
            Path("C:/Windows/Fonts/calibri.ttf"),
            Path("C:/Windows/Fonts/calibrib.ttf"),
            Path("C:/Windows/Fonts/calibrii.ttf"),
            Path("C:/Windows/Fonts/consola.ttf"),
        ),
    ]
    for regular, bold, italic, mono in candidates:
        if all(path.exists() for path in (regular, bold, italic, mono)):
            pdfmetrics.registerFont(TTFont("QBody", str(regular)))
            pdfmetrics.registerFont(TTFont("QBody-Bold", str(bold)))
            pdfmetrics.registerFont(TTFont("QBody-Italic", str(italic)))
            pdfmetrics.registerFont(TTFont("QMono", str(mono)))
            pdfmetrics.registerFontFamily(
                "QBody",
                normal="QBody",
                bold="QBody-Bold",
                italic="QBody-Italic",
                boldItalic="QBody-Bold",
            )
            return "QBody", "QBody-Bold", "QBody-Italic", "QMono"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Courier"


BODY_FONT, BOLD_FONT, ITALIC_FONT, MONO_FONT = register_fonts()


class QarinahMark(Flowable):
    def __init__(self, size: float = 34 * mm):
        super().__init__()
        self.width = size
        self.height = size

    def draw(self):
        canvas = self.canv
        radius = self.width * 0.33
        cx = self.width * 0.48
        cy = self.height * 0.54
        canvas.setStrokeColor(GREEN)
        canvas.setLineWidth(self.width * 0.065)
        canvas.circle(cx, cy, radius, stroke=1, fill=0)
        canvas.setFillColor(GREEN)
        canvas.circle(cx, cy, self.width * 0.045, stroke=0, fill=1)
        canvas.setLineCap(1)
        canvas.line(
            cx + radius * 0.62,
            cy - radius * 0.72,
            self.width * 0.83,
            self.height * 0.16,
        )


class ArchitectureFlow(Flowable):
    def __init__(self, width: float):
        super().__init__()
        self.width = width
        self.height = 48 * mm

    def draw(self):
        canvas = self.canv
        labels = [
            ("HOSTS", "Codex / Claude / CLI"),
            ("AUTHORITY", "Hash-chained event ledger"),
            ("PROJECTIONS", "Graph / index / Markdown / OKF"),
            ("OUTPUT", "Small cited context pack"),
        ]
        gap = 4 * mm
        box_width = (self.width - gap * 3) / 4
        box_height = 27 * mm
        y = 10 * mm
        for index, (eyebrow, label) in enumerate(labels):
            x = index * (box_width + gap)
            canvas.setFillColor(WHITE if index in (0, 3) else PALE_GREEN)
            canvas.setStrokeColor(GREEN if index in (1, 3) else RULE)
            canvas.setLineWidth(1.1)
            canvas.roundRect(x, y, box_width, box_height, 2.5 * mm, stroke=1, fill=1)
            canvas.setFillColor(DARK_GREEN)
            canvas.setFont(BOLD_FONT, 6.8)
            canvas.drawString(x + 3 * mm, y + box_height - 6 * mm, eyebrow)
            canvas.setFillColor(INK)
            canvas.setFont(BOLD_FONT, 8.3)
            words = label.split(" ")
            rows: list[str] = []
            current = ""
            for word in words:
                candidate = f"{current} {word}".strip()
                if canvas.stringWidth(candidate, BOLD_FONT, 8.3) > box_width - 6 * mm:
                    rows.append(current)
                    current = word
                else:
                    current = candidate
            if current:
                rows.append(current)
            text_y = y + box_height - 12 * mm
            for row in rows[:3]:
                canvas.drawString(x + 3 * mm, text_y, row)
                text_y -= 4.2 * mm
            if index < len(labels) - 1:
                arrow_x = x + box_width + 0.8 * mm
                arrow_y = y + box_height / 2
                canvas.setStrokeColor(GREEN)
                canvas.setFillColor(GREEN)
                canvas.setLineWidth(1.2)
                canvas.line(arrow_x, arrow_y, arrow_x + gap - 1.6 * mm, arrow_y)
                canvas.line(
                    arrow_x + gap - 1.6 * mm,
                    arrow_y,
                    arrow_x + gap - 3 * mm,
                    arrow_y + 1.5 * mm,
                )
                canvas.line(
                    arrow_x + gap - 1.6 * mm,
                    arrow_y,
                    arrow_x + gap - 3 * mm,
                    arrow_y - 1.5 * mm,
                )


class WhitePaperDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=BODY_LEFT,
            rightMargin=BODY_RIGHT,
            topMargin=BODY_TOP,
            bottomMargin=BODY_BOTTOM,
            title="Qarinah: Less Context. More Proof.",
            author="Ajnas NB",
            subject="Evidence-linked project memory for coding agents",
            creator="Qarinah white-paper build",
            pageCompression=1,
        )
        cover_frame = Frame(
            BODY_LEFT,
            BODY_BOTTOM,
            BODY_WIDTH,
            PAGE_HEIGHT - BODY_BOTTOM - 18 * mm,
            id="cover",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        body_frame = Frame(
            BODY_LEFT,
            BODY_BOTTOM,
            BODY_WIDTH,
            PAGE_HEIGHT - BODY_TOP - BODY_BOTTOM,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="Cover", frames=[cover_frame], onPage=self.draw_cover_page),
                PageTemplate(id="Body", frames=[body_frame], onPage=self.draw_body_page),
            ]
        )

    @staticmethod
    def draw_cover_page(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(LIGHT)
        canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
        canvas.setFillColor(GREEN)
        canvas.rect(0, PAGE_HEIGHT - 8 * mm, PAGE_WIDTH, 8 * mm, stroke=0, fill=1)
        canvas.setStrokeColor(RULE)
        canvas.line(BODY_LEFT, 16 * mm, PAGE_WIDTH - BODY_RIGHT, 16 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(BODY_FONT, 7.5)
        canvas.drawString(BODY_LEFT, 10 * mm, "QARINAH TECHNICAL WHITE PAPER")
        canvas.drawRightString(PAGE_WIDTH - BODY_RIGHT, 10 * mm, "JULY 2026")
        canvas.restoreState()

    @staticmethod
    def draw_body_page(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(BODY_LEFT, PAGE_HEIGHT - 14 * mm, PAGE_WIDTH - BODY_RIGHT, PAGE_HEIGHT - 14 * mm)
        canvas.setFillColor(DARK_GREEN)
        canvas.setFont(BOLD_FONT, 7.2)
        canvas.drawString(BODY_LEFT, PAGE_HEIGHT - 10 * mm, "QARINAH")
        canvas.setFillColor(MUTED)
        canvas.setFont(BODY_FONT, 7.2)
        canvas.drawRightString(
            PAGE_WIDTH - BODY_RIGHT,
            PAGE_HEIGHT - 10 * mm,
            "LESS CONTEXT. MORE PROOF.",
        )
        canvas.setStrokeColor(RULE)
        canvas.line(BODY_LEFT, 13 * mm, PAGE_WIDTH - BODY_RIGHT, 13 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(BODY_FONT, 7.2)
        canvas.drawString(BODY_LEFT, 8 * mm, "Ajnas NB - Technical white paper v1.2")
        canvas.drawRightString(PAGE_WIDTH - BODY_RIGHT, 8 * mm, str(doc.page - 1))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            level = getattr(flowable, "_toc_level", None)
            if level is None:
                return
            text = flowable.getPlainText()
            key = f"section-{self.seq.nextf('heading')}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page, key))


def styles():
    base = getSampleStyleSheet()
    return {
        "cover-kicker": ParagraphStyle(
            "CoverKicker",
            parent=base["Normal"],
            fontName=BOLD_FONT,
            fontSize=9,
            leading=12,
            textColor=DARK_GREEN,
            spaceAfter=7 * mm,
            uppercase=True,
        ),
        "cover-title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName=BOLD_FONT,
            fontSize=31,
            leading=34,
            textColor=INK,
            spaceAfter=5 * mm,
        ),
        "cover-subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["Normal"],
            fontName=BODY_FONT,
            fontSize=14,
            leading=20,
            textColor=MUTED,
            spaceAfter=11 * mm,
        ),
        "cover-meta": ParagraphStyle(
            "CoverMeta",
            parent=base["Normal"],
            fontName=BODY_FONT,
            fontSize=9,
            leading=14,
            textColor=MUTED,
        ),
        "h1": ParagraphStyle(
            "PaperH1",
            parent=base["Heading1"],
            fontName=BOLD_FONT,
            fontSize=20,
            leading=24,
            textColor=INK,
            spaceBefore=8 * mm,
            spaceAfter=3.5 * mm,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "PaperH2",
            parent=base["Heading2"],
            fontName=BOLD_FONT,
            fontSize=13.5,
            leading=17,
            textColor=DARK_GREEN,
            spaceBefore=5.5 * mm,
            spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "PaperH3",
            parent=base["Heading3"],
            fontName=BOLD_FONT,
            fontSize=10.5,
            leading=13,
            textColor=INK,
            spaceBefore=4 * mm,
            spaceAfter=1.8 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "PaperBody",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=9.4,
            leading=14,
            textColor=INK,
            spaceAfter=2.8 * mm,
            splitLongWords=False,
            allowWidows=0,
            allowOrphans=0,
        ),
        "small": ParagraphStyle(
            "PaperSmall",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.5,
            leading=10.5,
            textColor=MUTED,
        ),
        "quote": ParagraphStyle(
            "PaperQuote",
            parent=base["BodyText"],
            fontName=ITALIC_FONT,
            fontSize=10.3,
            leading=15,
            textColor=DARK_GREEN,
            leftIndent=7 * mm,
            rightIndent=5 * mm,
            borderColor=GREEN,
            borderWidth=0,
            borderPadding=(3 * mm, 4 * mm, 3 * mm, 5 * mm),
            backColor=PALE_GREEN,
            spaceBefore=2 * mm,
            spaceAfter=4 * mm,
        ),
        "code": ParagraphStyle(
            "PaperCode",
            parent=base["Code"],
            fontName=MONO_FONT,
            fontSize=7.4,
            leading=10.2,
            textColor=CODE_FG,
            backColor=CODE_BG,
            borderPadding=4 * mm,
            spaceBefore=2 * mm,
            spaceAfter=3.5 * mm,
            splitLongWords=True,
        ),
        "toc-title": ParagraphStyle(
            "TocTitle",
            parent=base["Heading1"],
            fontName=BOLD_FONT,
            fontSize=22,
            leading=26,
            textColor=INK,
            spaceAfter=7 * mm,
        ),
        "table": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.1,
            leading=9.4,
            textColor=INK,
        ),
        "table-header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName=BOLD_FONT,
            fontSize=7.2,
            leading=9.4,
            textColor=WHITE,
        ),
    }


STYLES = styles()


def inline_markup(value: str) -> str:
    placeholders: dict[str, str] = {}

    def reserve(fragment: str) -> str:
        token = f"QPLACEHOLDER{len(placeholders)}TOKEN"
        placeholders[token] = fragment
        return token

    value = re.sub(
        r"`([^`]+)`",
        lambda match: reserve(
            f'<font name="{MONO_FONT}" color="#07563F">{html.escape(match.group(1))}</font>'
        ),
        value,
    )
    value = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: reserve(
            f'<link href="{html.escape(resolve_link(match.group(2)), quote=True)}" '
            f'color="#07563F"><u>{html.escape(match.group(1))}</u></link>'
        ),
        value,
    )
    escaped = html.escape(value)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", escaped)
    for token, fragment in reversed(list(placeholders.items())):
        escaped = escaped.replace(token, fragment)
    return escaped


def resolve_link(target: str) -> str:
    if target.startswith(("https://", "http://", "mailto:", "#")):
        return target
    local_target = target.split("#", 1)[0]
    resolved = (SOURCE.parent / local_target).resolve()
    try:
        relative = resolved.relative_to(ROOT).as_posix()
    except ValueError:
        relative = local_target.lstrip("./")
    fragment = f"#{target.split('#', 1)[1]}" if "#" in target else ""
    return f"{REPOSITORY_BLOB}{relative}{fragment}"


def make_heading(text: str, level: int) -> Paragraph:
    style_name = "h1" if level == 2 else "h2" if level == 3 else "h3"
    paragraph = Paragraph(inline_markup(text), STYLES[style_name])
    if level < 4:
        paragraph._toc_level = min(max(level - 2, 0), 1)
    return paragraph


def make_code_block(value: str) -> Table:
    inner_style = ParagraphStyle(
        "PaperCodeInner",
        parent=STYLES["code"],
        backColor=None,
        borderPadding=0,
        spaceBefore=0,
        spaceAfter=0,
    )
    code = Preformatted(value, inner_style, maxLineLength=96)
    block = Table([[code]], colWidths=[BODY_WIDTH], hAlign="LEFT")
    block.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, DARK_GREEN),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
            ]
        )
    )
    return block


def make_table(rows: list[list[str]]) -> Table:
    column_count = max(len(row) for row in rows)
    normalized = [row + [""] * (column_count - len(row)) for row in rows]
    data = []
    for row_index, row in enumerate(normalized):
        style = STYLES["table-header"] if row_index == 0 else STYLES["table"]
        data.append([Paragraph(inline_markup(cell.strip()), style) for cell in row])

    if column_count == 2:
        widths = [BODY_WIDTH * 0.34, BODY_WIDTH * 0.66]
    elif column_count == 3:
        widths = [BODY_WIDTH * 0.28, BODY_WIDTH * 0.28, BODY_WIDTH * 0.44]
    elif column_count == 4:
        widths = [BODY_WIDTH * 0.28, BODY_WIDTH * 0.24, BODY_WIDTH * 0.24, BODY_WIDTH * 0.24]
    else:
        widths = [BODY_WIDTH / column_count] * column_count

    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), DARK_GREEN),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
                ("GRID", (0, 0), (-1, -1), 0.35, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2.2 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2.2 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 1.8 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8 * mm),
            ]
        )
    )
    return table


def parse_table(lines: list[str], start: int) -> tuple[Table, int]:
    rows: list[list[str]] = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        row = [cell for cell in lines[index].strip().strip("|").split("|")]
        if not all(re.fullmatch(r"\s*:?-{3,}:?\s*", cell) for cell in row):
            rows.append(row)
        index += 1
    return make_table(rows), index


def parse_markdown(source: str):
    lines = source.splitlines()
    story: list[Flowable] = []
    paragraph_lines: list[str] = []
    in_code = False
    code_lines: list[str] = []
    quote_lines: list[str] = []

    def flush_paragraph():
        if paragraph_lines:
            text = " ".join(line.strip() for line in paragraph_lines).strip()
            if text:
                story.append(Paragraph(inline_markup(text), STYLES["body"]))
            paragraph_lines.clear()

    def flush_quote():
        if quote_lines:
            text = " ".join(line.strip().lstrip(">").strip() for line in quote_lines)
            story.append(Paragraph(inline_markup(text), STYLES["quote"]))
            quote_lines.clear()

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            flush_quote()
            if in_code:
                story.append(make_code_block("\n".join(code_lines)))
                story.append(Spacer(1, 3.5 * mm))
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            index += 1
            continue

        if in_code:
            code_lines.append(line.rstrip())
            index += 1
            continue

        if stripped.startswith("# "):
            index += 1
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            flush_quote()
            story.append(make_heading(stripped[3:], 2))
            index += 1
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            flush_quote()
            story.append(make_heading(stripped[4:], 3))
            index += 1
            continue

        if stripped.startswith("#### "):
            flush_paragraph()
            flush_quote()
            story.append(make_heading(stripped[5:], 4))
            index += 1
            continue

        if stripped.startswith("<p ") or stripped == "</p>" or stripped.startswith("<img "):
            index += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            quote_lines.append(stripped)
            index += 1
            if index >= len(lines) or not lines[index].strip().startswith(">"):
                flush_quote()
            continue

        if stripped.startswith("|"):
            flush_paragraph()
            flush_quote()
            table, index = parse_table(lines, index)
            story.extend([table, Spacer(1, 3.5 * mm)])
            continue

        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        ordered_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if bullet_match or ordered_match:
            flush_paragraph()
            flush_quote()
            ordered = bool(ordered_match)
            items = []
            while index < len(lines):
                current = lines[index].strip()
                match = re.match(r"^\d+\.\s+(.+)$", current) if ordered else re.match(r"^[-*]\s+(.+)$", current)
                if not match:
                    break
                items.append(
                    ListItem(
                        Paragraph(inline_markup(match.group(1)), STYLES["body"]),
                        leftIndent=4 * mm,
                    )
                )
                index += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="1" if ordered else "bullet",
                    start="1",
                    leftIndent=7 * mm,
                    bulletFontName=BODY_FONT,
                    bulletFontSize=8.5,
                    bulletColor=DARK_GREEN,
                    spaceAfter=2.5 * mm,
                )
            )
            continue

        if stripped == "---":
            flush_paragraph()
            flush_quote()
            story.append(HRFlowable(width="100%", thickness=0.7, color=RULE, spaceBefore=2 * mm, spaceAfter=3 * mm))
            index += 1
            continue

        if not stripped:
            flush_paragraph()
            flush_quote()
            index += 1
            continue

        if (
            stripped.startswith("**Author:**")
            or stripped.startswith("**Paper version:**")
            or stripped.startswith("**Implementation:**")
            or stripped.startswith("**Date:**")
            or stripped.startswith("**License:**")
            or stripped.startswith("**Status:**")
        ):
            index += 1
            continue

        paragraph_lines.append(line)
        index += 1

    flush_paragraph()
    flush_quote()
    if code_lines:
        story.append(make_code_block("\n".join(code_lines)))
    return story


def cover_story():
    mark_table = Table([[QarinahMark(28 * mm)]], colWidths=[28 * mm], hAlign="LEFT")
    mark_table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return [
        Spacer(1, 20 * mm),
        mark_table,
        Spacer(1, 10 * mm),
        Paragraph("TECHNICAL WHITE PAPER", STYLES["cover-kicker"]),
        Paragraph("Qarinah:<br/>Less Context.<br/>More Proof.", STYLES["cover-title"]),
        Paragraph(
            "An evidence-linked project-memory compiler for coding agents",
            STYLES["cover-subtitle"],
        ),
        ArchitectureFlow(BODY_WIDTH),
        Spacer(1, 10 * mm),
        HRFlowable(width="100%", thickness=1.1, color=GREEN, spaceAfter=5 * mm),
        Paragraph(
            "<b>Ajnas NB</b><br/>Paper version 1.2 - August 2026<br/>"
            "Qarinah 0.1.5 stable open-source release<br/>Apache License 2.0",
            STYLES["cover-meta"],
        ),
        Spacer(1, 6 * mm),
        Paragraph(
            "<b>Status:</b> Implementation-backed technical white paper. "
            "All measured claims identify their benchmark, denominator, estimator, and limits; "
            "independent validation is not claimed.",
            STYLES["cover-meta"],
        ),
        NextPageTemplate("Body"),
        PageBreak(),
    ]


def toc_story():
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOC0",
            fontName=BOLD_FONT,
            fontSize=8.2,
            leading=10,
            leftIndent=0,
            firstLineIndent=0,
            textColor=INK,
            spaceBefore=0.6 * mm,
        ),
        ParagraphStyle(
            "TOC1",
            fontName=BODY_FONT,
            fontSize=7.1,
            leading=8.5,
            leftIndent=6 * mm,
            firstLineIndent=0,
            textColor=MUTED,
        ),
        ParagraphStyle(
            "TOC2",
            fontName=BODY_FONT,
            fontSize=7.3,
            leading=10,
            leftIndent=12 * mm,
            firstLineIndent=0,
            textColor=MUTED,
        ),
    ]
    return [
        Paragraph("Contents", STYLES["toc-title"]),
        Paragraph(
            "This paper describes the implemented architecture, evidence model, "
            "security boundary, evaluation, and release status of Qarinah.",
            STYLES["body"],
        ),
        Spacer(1, 3 * mm),
        toc,
        PageBreak(),
    ]


def build():
    text = SOURCE.read_text(encoding="utf-8")
    start = text.find("## Abstract")
    if start < 0:
        raise ValueError("docs/WHITEPAPER.md does not contain the Abstract section.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    story = cover_story() + toc_story() + parse_markdown(text[start:])
    doc = WhitePaperDocTemplate(str(OUTPUT))
    doc.multiBuild(story)
    source_digest = hashlib.sha256(
        SOURCE.read_bytes() + b"\0" + Path(__file__).read_bytes()
    ).hexdigest()
    OUTPUT_DIGEST.write_text(
        f"{source_digest}  docs/WHITEPAPER.md+scripts/build-whitepaper-pdf.py\n",
        encoding="ascii",
    )
    print(OUTPUT)


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(f"White-paper PDF build failed: {error}", file=sys.stderr)
        raise
