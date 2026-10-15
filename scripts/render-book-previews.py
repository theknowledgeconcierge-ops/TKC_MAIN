"""Render only approved sample pages. Full manuscripts must stay outside public/.

Usage: python scripts/render-book-previews.py SOURCE_DIRECTORY --pdftoppm PATH
Requires Pillow and Poppler; no runtime website dependency.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

SAMPLES = {
    "the-first-table": ("The First Table .pdf", [5, 15, 41]),
    "the-full-table": ("The Full Table.pdf", [5, 27, 48]),
    "behind-the-kitchen-door": ("Behind The Kitchen Door.pdf", [5, 17, 45]),
    "the-math-behind-the-menu": ("The Math Behind The Menu.pdf", [5, 9, 46]),
    "empty-tables-to-full-house": ("Empty Tables To Full House .pdf", [5, 25, 39]),
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--pdftoppm", default="pdftoppm")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "public" / "previews"
    with tempfile.TemporaryDirectory() as scratch:
        for slug, (filename, pages) in SAMPLES.items():
            target = root / slug
            target.mkdir(parents=True, exist_ok=True)
            for page in pages:
                prefix = Path(scratch) / f"{slug}-{page}"
                subprocess.run([args.pdftoppm, "-f", str(page), "-l", str(page),
                                "-scale-to", "1600", "-singlefile", "-png",
                                str(args.source / filename), str(prefix)], check=True)
                with Image.open(prefix.with_suffix(".png")) as image:
                    output = target / f"page-{page:02}.webp"
                    image.convert("RGB").save(output, "WEBP", quality=88, method=6)
                    print(f"{slug}: PDF page {page}, {image.size}, {output.stat().st_size} bytes")
