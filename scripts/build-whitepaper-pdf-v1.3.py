#!/usr/bin/env python3
"""Build the separately versioned Qarinah v1.3 white-paper PDF."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import platform
import sys
from pathlib import Path

import reportlab


ROOT = Path(__file__).resolve().parents[1]
LEGACY_BUILDER = ROOT / "scripts" / "build-whitepaper-pdf.py"
SOURCE = ROOT / "docs" / "WHITEPAPER.md"
OUTPUT = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.3.pdf"
SOURCE_DIGEST = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.3.source.sha256"
PDF_DIGEST = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.3.pdf.sha256"
BUILD_METADATA = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.3.build.json"
SOURCE_INPUTS = (
    ("docs/WHITEPAPER.md", SOURCE),
    ("scripts/build-whitepaper-pdf.py", LEGACY_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.3.py", Path(__file__).resolve()),
)
SOURCE_LABEL = "+".join(label for label, _path in SOURCE_INPUTS)


def load_legacy_builder():
    spec = importlib.util.spec_from_file_location("qarinah_whitepaper_v12_layout", LEGACY_BUILDER)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the reviewed v1.2 layout engine.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


legacy = load_legacy_builder()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def source_set_digest() -> str:
    digest = hashlib.sha256()
    for index, (_label, source_path) in enumerate(SOURCE_INPUTS):
        if index:
            digest.update(b"\0")
        digest.update(source_path.read_bytes())
    return digest.hexdigest()


def font_metadata() -> list[dict[str, str | None]]:
    fonts = []
    for role, registered_name in (
        ("body", legacy.BODY_FONT),
        ("bold", legacy.BOLD_FONT),
        ("italic", legacy.ITALIC_FONT),
        ("monospace", legacy.MONO_FONT),
    ):
        font = legacy.pdfmetrics.getFont(registered_name)
        filename = getattr(font.face, "filename", None)
        font_path = Path(filename) if filename else None
        fonts.append(
            {
                "role": role,
                "registeredName": registered_name,
                "fileName": font_path.name if font_path else None,
                "sha256": sha256_bytes(font_path.read_bytes()) if font_path and font_path.is_file() else None,
            }
        )
    return fonts


def validate_list_markers() -> None:
    fixture = legacy.parse_markdown("- unordered one\n- unordered two\n\n1. ordered one\n2. ordered two")
    lists = [flowable for flowable in fixture if isinstance(flowable, legacy.ListFlowable)]
    if len(lists) != 2:
        raise RuntimeError("White-paper list-marker regression fixture did not produce two lists.")
    unordered, ordered = lists
    if unordered._bulletType != "bullet" or unordered._start != "-":
        raise RuntimeError("Unordered Markdown lists must render with an ASCII dash marker.")
    if ordered._bulletType != "1" or ordered._start != "1":
        raise RuntimeError("Ordered Markdown lists must retain numeric markers.")


class WhitePaperV13DocTemplate(legacy.WhitePaperDocTemplate):
    @staticmethod
    def draw_cover_page(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(legacy.LIGHT)
        canvas.rect(0, 0, legacy.PAGE_WIDTH, legacy.PAGE_HEIGHT, stroke=0, fill=1)
        canvas.setFillColor(legacy.GREEN)
        canvas.rect(0, legacy.PAGE_HEIGHT - 8 * legacy.mm, legacy.PAGE_WIDTH, 8 * legacy.mm, stroke=0, fill=1)
        canvas.setStrokeColor(legacy.RULE)
        canvas.line(legacy.BODY_LEFT, 16 * legacy.mm, legacy.PAGE_WIDTH - legacy.BODY_RIGHT, 16 * legacy.mm)
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.5)
        canvas.drawString(legacy.BODY_LEFT, 10 * legacy.mm, "QARINAH TECHNICAL WHITE PAPER")
        canvas.drawRightString(legacy.PAGE_WIDTH - legacy.BODY_RIGHT, 10 * legacy.mm, "AUGUST 2026")
        canvas.restoreState()

    @staticmethod
    def draw_body_page(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(legacy.RULE)
        canvas.setLineWidth(0.5)
        canvas.line(
            legacy.BODY_LEFT,
            legacy.PAGE_HEIGHT - 14 * legacy.mm,
            legacy.PAGE_WIDTH - legacy.BODY_RIGHT,
            legacy.PAGE_HEIGHT - 14 * legacy.mm,
        )
        canvas.setFillColor(legacy.DARK_GREEN)
        canvas.setFont(legacy.BOLD_FONT, 7.2)
        canvas.drawString(legacy.BODY_LEFT, legacy.PAGE_HEIGHT - 10 * legacy.mm, "QARINAH")
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.2)
        canvas.drawRightString(
            legacy.PAGE_WIDTH - legacy.BODY_RIGHT,
            legacy.PAGE_HEIGHT - 10 * legacy.mm,
            "LESS CONTEXT. MORE PROOF.",
        )
        canvas.setStrokeColor(legacy.RULE)
        canvas.line(legacy.BODY_LEFT, 13 * legacy.mm, legacy.PAGE_WIDTH - legacy.BODY_RIGHT, 13 * legacy.mm)
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.2)
        canvas.drawString(legacy.BODY_LEFT, 8 * legacy.mm, "Ajnas NB - Technical white paper v1.3")
        canvas.drawRightString(legacy.PAGE_WIDTH - legacy.BODY_RIGHT, 8 * legacy.mm, str(doc.page - 1))
        canvas.restoreState()


def cover_story():
    mark_table = legacy.Table([[legacy.QarinahMark(28 * legacy.mm)]], colWidths=[28 * legacy.mm], hAlign="LEFT")
    mark_table.setStyle(
        legacy.TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [
        legacy.Spacer(1, 20 * legacy.mm),
        mark_table,
        legacy.Spacer(1, 10 * legacy.mm),
        legacy.Paragraph("TECHNICAL WHITE PAPER", legacy.STYLES["cover-kicker"]),
        legacy.Paragraph("Qarinah:<br/>Less Context.<br/>More Proof.", legacy.STYLES["cover-title"]),
        legacy.Paragraph(
            "An evidence-linked project-memory compiler for coding agents",
            legacy.STYLES["cover-subtitle"],
        ),
        legacy.ArchitectureFlow(legacy.BODY_WIDTH),
        legacy.Spacer(1, 10 * legacy.mm),
        legacy.HRFlowable(width="100%", thickness=1.1, color=legacy.GREEN, spaceAfter=5 * legacy.mm),
        legacy.Paragraph(
            "<b>Ajnas NB</b><br/>Paper version 1.3 - August 2026<br/>"
            "Qarinah 0.1.6<br/>Apache License 2.0",
            legacy.STYLES["cover-meta"],
        ),
        legacy.Spacer(1, 6 * legacy.mm),
        legacy.Paragraph(
            "<b>Status:</b> Implementation-backed technical white paper. "
            "All measured claims identify their benchmark, denominator, estimator, and limits. "
            "Version DOI: 10.5281/zenodo.21843240. Concept DOI: 10.5281/zenodo.21547684.",
            legacy.STYLES["cover-meta"],
        ),
        legacy.NextPageTemplate("Body"),
        legacy.PageBreak(),
    ]


def build():
    validate_list_markers()
    text = SOURCE.read_text(encoding="utf-8")
    start = text.find("## Abstract")
    if start < 0:
        raise ValueError("docs/WHITEPAPER.md does not contain the Abstract section.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    story = cover_story() + legacy.toc_story() + legacy.parse_markdown(text[start:])
    doc = WhitePaperV13DocTemplate(str(OUTPUT))
    doc.multiBuild(story)
    source_digest = source_set_digest()
    SOURCE_DIGEST.write_text(
        f"{source_digest}  {SOURCE_LABEL}\n",
        encoding="ascii",
    )
    build_metadata = {
        "schemaVersion": "qarinah.white-paper-build.v1",
        "paperVersion": "1.3",
        "sourceDigestAlgorithm": "sha256(file-bytes + NUL + file-bytes + NUL + file-bytes; listed order)",
        "combinedSourceSha256": f"sha256:{source_digest}",
        "sources": [
            {
                "path": label,
                "sha256": f"sha256:{sha256_bytes(source_path.read_bytes())}",
            }
            for label, source_path in SOURCE_INPUTS
        ],
        "generator": {
            "command": "python scripts/build-whitepaper-pdf-v1.3.py",
            "pythonImplementation": platform.python_implementation(),
            "pythonVersion": platform.python_version(),
            "reportlabVersion": reportlab.Version,
            "platform": sys.platform,
            "fonts": font_metadata(),
        },
    }
    BUILD_METADATA.write_text(
        json.dumps(build_metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    pdf_digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    PDF_DIGEST.write_text(
        f"{pdf_digest}  output/pdf/Qarinah-Technical-White-Paper-v1.3.pdf\n",
        encoding="ascii",
    )
    print(OUTPUT)


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(f"White-paper PDF build failed: {error}", file=sys.stderr)
        raise
