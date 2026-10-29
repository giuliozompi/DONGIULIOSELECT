"""Validate the printed PDF, not just its source HTML. Render pages into /tmp."""
import json
import re
import sys
from pathlib import Path

import pymupdf as fitz
import numpy as np
import zxingcpp


def normalized(text):
    return re.sub(r"\s+", "", text)


pdf_path, manifest_path = map(Path, sys.argv[1:])
manifest = json.loads(manifest_path.read_text())
doc = fitz.open(pdf_path)
pages = [normalized(page.get_text()) for page in doc]
margin = 14 * 72 / 25.4

# Check extracted glyph bounds as well as text presence: text outside the paper
# or printable area must not count as successfully printed.
for page in doc:
    assert abs(page.rect.width - 210 * 72 / 25.4) < 1, "not A4 width"
    assert abs(page.rect.height - 297 * 72 / 25.4) < 1, "not A4 height"
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                x0, y0, x1, y1 = span["bbox"]
                assert x0 >= margin - 1 and x1 <= page.rect.width - margin + 1, (
                    "horizontal clipping", page.number, span
                )
                assert y0 >= margin - 1 and y1 <= page.rect.height - margin + 1, (
                    "vertical clipping", page.number, span
                )

row_pages = set()
for i, item in enumerate(manifest["items"], 1):
    start, end = f"ROW{i:03}", f"END{i:03}"
    matches = [p for p, text in enumerate(pages) if start in text]
    assert len(matches) == 1, ("missing/duplicated row", start, matches)
    p = matches[0]
    row_pages.add(p)
    # The complete name (not merely its marker) must stay on one page.
    assert normalized(item["productName"]) in pages[p], ("split/truncated name", start)
    assert sum(text.count(start) for text in pages) == 1, ("duplicate row", start)
    assert sum(text.count(end) for text in pages) == 1, ("missing end", end)
    # Check weight and both saved monetary columns within this row's PDF band.
    words = doc[p].get_text("words")
    first = next(w for w in words if w[4] == start)
    last = next(w for w in words if w[4] == end)
    band = normalized(" ".join(w[4] for w in words if first[1] - 1 <= w[1] <= last[3]))
    for expected in (["0,735кг", "1200,00₽/кг", "882,00₽"] if item["unit"] == "кг"
                     else ["2шт", "200,00₽/шт", "400,00₽"]):
        assert expected in band, ("lost row value", start, expected, band)

for p in row_pages:
    for heading in ["Наименование", "Количество / вес", "Цена за единицу", "Сумма"]:
        assert normalized(heading) in pages[p], ("missing repeated header", p, heading)

total_pages = []
for total in manifest["totals"]:
    matches = [p for p, text in enumerate(pages) if normalized(total) in text]
    assert len(matches) == 1, ("missing/duplicated total", total, matches)
    total_pages.extend(matches)
assert len(set(total_pages)) == 1, ("totals split across pages", total_pages)
assert total_pages[0] == len(doc) - 1, "unexpected trailing/blank page"
assert "Документзаказа.Неявляетсякассовымчеком." in pages[-1], "document note lost"
assert all(p in row_pages or p == total_pages[0] for p in range(1, len(doc))), "empty page"

# Decode the rasterized, actually printed QR rather than the source SVG.
codes = []
for p, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pix.save(str(pdf_path.with_suffix(f".page-{p + 1}.png")))
    image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    for code in zxingcpp.read_barcodes(image):
        assert code.valid and code.text == manifest["id"], "incorrect printed QR"
        for corner in [code.position.top_left, code.position.top_right,
                       code.position.bottom_left, code.position.bottom_right]:
            assert margin * 2 <= corner.x <= pix.width - margin * 2, "clipped QR"
            assert margin * 2 <= corner.y <= pix.height - margin * 2, "clipped QR"
        codes.append(p)
assert codes == [0], ("QR missing, split or duplicated", codes)
assert normalized(manifest["id"]) in pages[0], "human-readable order ID lost"
assert "Заказ№123456" in pages[0], "short reference lost"
print(json.dumps({"pages": len(doc), "rows": len(manifest["items"]),
                  "tablePages": sorted(p + 1 for p in row_pages),
                  "totalsPage": total_pages[0] + 1, "qrPage": 1}))
