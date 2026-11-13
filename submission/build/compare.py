"""Checks that the PDF and the HTML deck look the same, and builds the review contact sheet.

Renders every PDF page at 1920x1080 (PyMuPDF), compares it with the browser screenshot of the same slide
(out/html-N.png, from export-pdf.mjs), ignoring the screen-only slide counter in the bottom-right corner.
Writes out/pdf-N.png, out/diff-N.png (only when pages differ) and ../contact-sheet.png.
    python compare.py
"""
from pathlib import Path

import pymupdf as fitz  # PyMuPDF
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = Path(__file__).parent
OUT = HERE / "out"
PDF = HERE.parent / "HashWitness-DigiHacks.pdf"
COUNTER = (1920 - 110, 1080 - 70, 1920, 1080)  # screen-only chrome, not part of the slide

doc = fitz.open(PDF)
print(f"pdf pages: {doc.page_count}, page size: {doc[0].rect.width:.0f}x{doc[0].rect.height:.0f} pt")
fonts = sorted({f[3] for p in doc for f in p.get_fonts()})
print(f"embedded fonts: {', '.join(fonts)}")

pages = []
worst = 0.0
for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(matrix=fitz.Matrix(1920 / page.rect.width, 1080 / page.rect.height), alpha=False)
    pdf_img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    pdf_img.save(OUT / f"pdf-{i}.png")
    html_img = Image.open(OUT / f"html-{i}.png").convert("RGB")
    a, b = pdf_img.copy(), html_img  # mask copies only: the contact sheet must show the real page
    for im in (a, b):
        ImageDraw.Draw(im).rectangle(COUNTER, fill=(0, 0, 0))
    diff = ImageChops.difference(a, b).convert("L")
    hist = diff.histogram()
    total = pdf_img.width * pdf_img.height
    mean = sum(v * n for v, n in enumerate(hist)) / total / 255 * 100
    changed = sum(n for v, n in enumerate(hist) if v > 40) / total * 100
    worst = max(worst, changed)
    print(f"slide {i}: {pdf_img.size[0]}x{pdf_img.size[1]}  mean diff {mean:.2f}%  pixels differing >15%: {changed:.2f}%")
    if changed > 0.5:
        diff.point(lambda v: 255 if v > 40 else 0).save(OUT / f"diff-{i}.png")
    pages.append(pdf_img)

# contact sheet: all slides, 2 columns, labelled
tw, th, gap = 900, 506, 40
cols = 2
rows = (len(pages) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw + (cols + 1) * gap, rows * (th + 56) + gap), (232, 228, 236))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype(str(HERE / "assets" / "HankenGrotesk-wght.ttf"), 26)
except OSError:
    font = ImageFont.load_default()
for k, im in enumerate(pages):
    r, c = divmod(k, cols)
    x, y = gap + c * (tw + gap), gap + r * (th + 56)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 40))
    draw.text((x, y + 4), f"{k + 1}", fill=(26, 15, 46), font=font)
sheet.save(HERE.parent / "contact-sheet.png", optimize=True)
print(f"contact sheet: submission/contact-sheet.png ({sheet.size[0]}x{sheet.size[1]})")
# Below ~1.5% the differences are glyph anti-aliasing edges (two rasterizers drawing the same text), checked by eye
# on out/diff-N.png; a layout change (moved or missing element) shows up as solid areas and far more pixels.
print(f"PDF matches HTML (max {worst:.2f}% edge pixels)" if worst < 1.5 else f"WARNING: up to {worst:.2f}% of pixels differ, see out/diff-N.png")
