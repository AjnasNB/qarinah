#!/usr/bin/env python3
"""Build the separately versioned Qarinah v1.9 white-paper PDF."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import platform
import sys
from pathlib import Path

import reportlab


ROOT = Path(__file__).resolve().parents[1]
BASE_BUILDER = ROOT / "scripts" / "build-whitepaper-pdf.py"
V14_BUILDER = ROOT / "scripts" / "build-whitepaper-pdf-v1.4.py"
V15_BUILDER = ROOT / "scripts" / "build-whitepaper-pdf-v1.5.py"
V16_BUILDER = ROOT / "scripts" / "build-whitepaper-pdf-v1.6.py"
V17_BUILDER = ROOT / "scripts" / "build-whitepaper-pdf-v1.7.py"
SOURCE = ROOT / "docs" / "WHITEPAPER.md"
OUTPUT = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.9.pdf"
SOURCE_DIGEST = OUTPUT.with_suffix(".source.sha256")
PDF_DIGEST = OUTPUT.with_suffix(".pdf.sha256")
BUILD_METADATA = OUTPUT.with_suffix(".build.json")
SOURCE_INPUTS = (
    ("docs/WHITEPAPER.md", SOURCE),
    ("scripts/build-whitepaper-pdf.py", BASE_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.4.py", V14_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.5.py", V15_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.6.py", V16_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.7.py", V17_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.8.py", ROOT / "scripts" / "build-whitepaper-pdf-v1.8.py"),
    ("scripts/build-whitepaper-pdf-v1.9.py", Path(__file__).resolve()),
)
SOURCE_LABEL = "+".join(label for label, _path in SOURCE_INPUTS)


def load_v17_builder():
    spec = importlib.util.spec_from_file_location("qarinah_whitepaper_v17_layout", V17_BUILDER)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the reviewed v1.7 layout engine.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v17 = load_v17_builder()
v14 = v17.v14
legacy = v17.legacy


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def source_set_digest() -> str:
    digest = hashlib.sha256()
    for index, (_label, source_path) in enumerate(SOURCE_INPUTS):
        if index:
            digest.update(b"\0")
        digest.update(source_path.read_bytes())
    return digest.hexdigest()


class WhitePaperV19DocTemplate(v17.WhitePaperV17DocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename)
        self.title = "Qarinah: Proof-Carrying Project Memory"
        self.author = "Ajnas N B"
        self.subject = "Multi-language developer memory with verifiable task packets"

    @staticmethod
    def draw_cover_page(canvas, doc):
        v17.WhitePaperV17DocTemplate.draw_cover_page(canvas, doc)
        canvas.saveState()
        canvas.setFillColor(legacy.LIGHT)
        canvas.rect(legacy.PAGE_WIDTH - 60 * legacy.mm, 7 * legacy.mm, 40 * legacy.mm, 7 * legacy.mm, stroke=0, fill=1)
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.5)
        canvas.drawRightString(legacy.PAGE_WIDTH - legacy.BODY_RIGHT, 10 * legacy.mm, "OCTOBER 2026")
        canvas.restoreState()

    @staticmethod
    def draw_body_page(canvas, doc):
        v17.WhitePaperV17DocTemplate.draw_body_page(canvas, doc)
        canvas.saveState()
        canvas.setFillColor(legacy.LIGHT)
        canvas.rect(legacy.BODY_LEFT, 5.5 * legacy.mm, 78 * legacy.mm, 5 * legacy.mm, stroke=0, fill=1)
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.2)
        canvas.drawString(legacy.BODY_LEFT, 8 * legacy.mm, "Ajnas N B - Technical white paper v1.9")
        canvas.restoreState()


def cover_story():
    story = v17.cover_story()
    replacements = {
        "Multi-language developer memory with inspectable context receipts": (
            "Multi-language developer memory with verifiable task packets"
        ),
        "Paper version 1.7 - August 2026": "Paper version 1.9 - October 2026",
        "Qarinah 0.5.0-rc.1": "Qarinah 0.7.0",
        "Version 1.7 has no version DOI until a separate deposit is completed.": (
            "Version 1.9 has no version DOI until a separate deposit is completed."
        ),
    }
    for index, flowable in enumerate(story):
        if isinstance(flowable, legacy.ArchitectureFlow):
            story[index] = PipelineV19(flowable.width)
        if isinstance(flowable, legacy.Paragraph):
            text = flowable.text
            for before, after in replacements.items():
                text = text.replace(before, after)
            if text != flowable.text:
                flowable.__init__(text, flowable.style)
    return story


class PipelineV19(legacy.Flowable):
    def __init__(self, width):
        super().__init__()
        self.width = width
        self.height = 48 * legacy.mm

    def draw(self):
        labels = [
            ("WORK", "Coding agents", "Visible messages"),
            ("ADMIT", "Saved opt-in", "Exact project root"),
            ("RETAIN", "SHA-256 ledger", "Cited source IDs"),
            ("REBUILD", "Graph / Markdown", "Index / OKF"),
            ("RECALL", "Summary first", "Bounded sources"),
        ]
        gap = 3 * legacy.mm
        width = (self.width - gap * 4) / 5
        canvas = self.canv
        canvas.saveState()
        for index, (title, first, second) in enumerate(labels):
            x = index * (width + gap)
            canvas.setFillColor(legacy.PALE_GREEN if index % 2 else legacy.WHITE)
            canvas.setStrokeColor(legacy.GREEN)
            canvas.roundRect(x, 10 * legacy.mm, width, 27 * legacy.mm, 2 * legacy.mm, stroke=1, fill=1)
            canvas.setFillColor(legacy.DARK_GREEN)
            canvas.setFont(legacy.BOLD_FONT, 6.8)
            canvas.drawString(x + 2 * legacy.mm, 31 * legacy.mm, title)
            canvas.setFillColor(legacy.INK)
            canvas.setFont(legacy.BODY_FONT, 7.2)
            canvas.drawString(x + 2 * legacy.mm, 25 * legacy.mm, first)
            canvas.drawString(x + 2 * legacy.mm, 20 * legacy.mm, second)
            if index < 4:
                canvas.setFillColor(legacy.GREEN)
                canvas.drawString(x + width + 0.6 * legacy.mm, 22 * legacy.mm, ">")
        canvas.restoreState()


def build():
    v14.validate_list_markers()
    text = SOURCE.read_text(encoding="utf-8")
    start = text.find("## Abstract")
    if start < 0:
        raise ValueError("docs/WHITEPAPER.md does not contain the Abstract section.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    story = cover_story() + v14.compact_toc_story() + legacy.parse_markdown(text[start:])
    doc = WhitePaperV19DocTemplate(str(OUTPUT))
    doc.multiBuild(story)

    source_digest = source_set_digest()
    SOURCE_DIGEST.write_bytes(f"{source_digest}  {SOURCE_LABEL}\n".encode("ascii"))
    BUILD_METADATA.write_bytes(
        (
            json.dumps(
                {
                    "schemaVersion": "qarinah.white-paper-build.v1",
                    "paperVersion": "1.9",
                    "sourceDigestAlgorithm": "sha256(file-bytes + NUL separators; listed order)",
                    "combinedSourceSha256": f"sha256:{source_digest}",
                    "sources": [
                        {"path": label, "sha256": f"sha256:{sha256_bytes(source_path.read_bytes())}"}
                        for label, source_path in SOURCE_INPUTS
                    ],
                    "generator": {
                        "command": "python scripts/build-whitepaper-pdf-v1.9.py",
                        "pythonImplementation": platform.python_implementation(),
                        "pythonVersion": platform.python_version(),
                        "reportlabVersion": reportlab.Version,
                        "platform": sys.platform,
                        "fonts": v17.font_metadata(),
                    },
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")
    )
    pdf_digest = sha256_bytes(OUTPUT.read_bytes())
    PDF_DIGEST.write_bytes(
        f"{pdf_digest}  output/pdf/Qarinah-Technical-White-Paper-v1.9.pdf\n".encode("ascii")
    )
    print(OUTPUT)


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(f"White-paper PDF build failed: {error}", file=sys.stderr)
        raise
