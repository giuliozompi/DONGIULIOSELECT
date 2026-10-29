# A4 order print regression check

Run `uv sync`, then `npm run test:order-print-pagination`.
The check needs Chromium (`CHROMIUM_PATH` can override its location), Python 3.11+
and the Python dependencies locked in `uv.lock`. `PYTHON` can select a different
Python executable with those packages installed.

The test imports the production renderer and uses `tests/helpers/browser.mjs`
to print its HTML with Chromium CDP `Page.printToPDF`, respecting the renderer's
CSS A4 size and margins. It never contacts the app, authenticates, or reads orders
from a database.

Twelve synthetic orders cover 65 products, 90 products with long Cyrillic names,
and consecutive counts from 18 through 27 around page-break boundaries. Products
alternate three-decimal kilogram weights and piece quantities. PDF checks cover:

- A4 dimensions and all text within the printable margins;
- each complete product name exactly once and on one page, with its quantity,
  saved unit price and line amount;
- table headings on every page containing product rows;
- independent expected subtotal, discount, total, shipping, combined total,
  refund and delivery note, all together on one page;
- complete human-readable identifiers and successful decoding of the printed QR;
- no unexpected blank/trailing page and preservation of the document disclaimer.

PyMuPDF extracts text/positions and renders every page; ZXing decodes the resulting
QR image. Temporary PDFs, manifests and rendered PNGs go to a unique `/tmp`
directory and are deleted even on failure. Use `KEEP_PRINT_PDFS=1` to retain them
for visual inspection; the test prints that temporary directory's location.

This checks Chromium's generated PDF, not a physical printer or other browsers.
