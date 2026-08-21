#!/usr/bin/env python3
"""Build the separately versioned Qarinah v1.7 white-paper PDF."""

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
SOURCE = ROOT / "docs" / "WHITEPAPER.md"
OUTPUT = ROOT / "output" / "pdf" / "Qarinah-Technical-White-Paper-v1.7.pdf"
SOURCE_DIGEST = OUTPUT.with_suffix(".source.sha256")
PDF_DIGEST = OUTPUT.with_suffix(".pdf.sha256")
BUILD_METADATA = OUTPUT.with_suffix(".build.json")
SOURCE_INPUTS = (
    ("docs/WHITEPAPER.md", SOURCE),
    ("scripts/build-whitepaper-pdf.py", BASE_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.4.py", V14_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.5.py", V15_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.6.py", V16_BUILDER),
    ("scripts/build-whitepaper-pdf-v1.7.py", Path(__file__).resolve()),
)
SOURCE_LABEL = "+".join(label for label, _path in SOURCE_INPUTS)


def load_v14_builder():
    spec = importlib.util.spec_from_file_location("qarinah_whitepaper_v14_layout", V14_BUILDER)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the reviewed v1.4 layout engine.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v14 = load_v14_builder()
legacy = v14.legacy


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


class WhitePaperV17DocTemplate(v14.WhitePaperV14DocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename)
        self.title = "Qarinah: Proof-Carrying Project Memory"
        self.author = "Ajnas N B"
        self.subject = "Multi-language developer memory with inspectable context receipts"

    @staticmethod
    def draw_body_page(canvas, doc):
        v14.WhitePaperV14DocTemplate.draw_body_page(canvas, doc)
        canvas.saveState()
        canvas.setFillColor(legacy.LIGHT)
        canvas.rect(legacy.PAGE_WIDTH - legacy.BODY_RIGHT - 82 * legacy.mm, legacy.PAGE_HEIGHT - 13 * legacy.mm, 82 * legacy.mm, 6 * legacy.mm, stroke=0, fill=1)
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.2)
        canvas.drawRightString(legacy.PAGE_WIDTH - legacy.BODY_RIGHT, legacy.PAGE_HEIGHT - 10 * legacy.mm, "PROOF-CARRYING PROJECT MEMORY")
        canvas.setFillColor(legacy.LIGHT)
        canvas.rect(legacy.BODY_LEFT, 5.5 * legacy.mm, 72 * legacy.mm, 5 * legacy.mm, stroke=0, fill=1)
        canvas.setFillColor(legacy.MUTED)
        canvas.setFont(legacy.BODY_FONT, 7.2)
        canvas.drawString(legacy.BODY_LEFT, 8 * legacy.mm, "Ajnas N B - Technical white paper v1.7")
        canvas.restoreState()


def cover_story():
    story = v14.cover_story()
    replacements = {
        "Qarinah:<br/>Less Context.<br/>More Proof.": "Qarinah:<br/>Proof-Carrying<br/>Project Memory.",
        "An evidence-linked project-memory compiler for coding agents": (
            "Multi-language developer memory with inspectable context receipts"
        ),
        "Paper version 1.4 - August 2026": "Paper version 1.7 - August 2026",
        "Qarinah 0.1.6": "Qarinah 0.5.0-rc.1",
        "The v1.4 version DOI is assigned at deposit. Concept DOI: 10.5281/zenodo.21547684.": (
            "Version 1.7 has no version DOI until a separate deposit is completed. "
            "Paper-series concept DOI: 10.5281/zenodo.21547684."
        ),
    }
    for flowable in story:
        if isinstance(flowable, legacy.Paragraph):
            text = flowable.text
            for before, after in replacements.items():
                text = text.replace(before, after)
            if text != flowable.text:
                flowable.__init__(text, flowable.style)
    return story


def build():
    v14.validate_list_markers()
    text = SOURCE.read_text(encoding="utf-8")
    start = text.find("## Abstract")
    if start < 0:
        raise ValueError("docs/WHITEPAPER.md does not contain the Abstract section.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    story = cover_story() + v14.compact_toc_story() + legacy.parse_markdown(text[start:])
    doc = WhitePaperV17DocTemplate(str(OUTPUT))
    doc.multiBuild(story)

    source_digest = source_set_digest()
    SOURCE_DIGEST.write_bytes(f"{source_digest}  {SOURCE_LABEL}\n".encode("ascii"))
    BUILD_METADATA.write_bytes(
        (
            json.dumps(
                {
                    "schemaVersion": "qarinah.white-paper-build.v1",
                    "paperVersion": "1.7",
                    "sourceDigestAlgorithm": "sha256(file-bytes + NUL separators; listed order)",
                    "combinedSourceSha256": f"sha256:{source_digest}",
                    "sources": [
                        {"path": label, "sha256": f"sha256:{sha256_bytes(source_path.read_bytes())}"}
                        for label, source_path in SOURCE_INPUTS
                    ],
                    "generator": {
                        "command": "python scripts/build-whitepaper-pdf-v1.7.py",
                        "pythonImplementation": platform.python_implementation(),
                        "pythonVersion": platform.python_version(),
                        "reportlabVersion": reportlab.Version,
                        "platform": sys.platform,
                        "fonts": font_metadata(),
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
        f"{pdf_digest}  output/pdf/Qarinah-Technical-White-Paper-v1.7.pdf\n".encode("ascii")
    )
    print(OUTPUT)


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(f"White-paper PDF build failed: {error}", file=sys.stderr)
        raise
