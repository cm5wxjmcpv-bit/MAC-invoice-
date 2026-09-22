"""Check generated browser-test PDFs. Requires pdfplumber."""
import os
from pathlib import Path
import pdfplumber
root = Path(os.environ.get('TEST_OUTPUT', '/tmp/mac-test-output'))
with pdfplumber.open(root / 'quote-normal.pdf') as doc:
    text = '\n'.join(page.extract_text() or '' for page in doc.pages)
    for label in ['MAC Industries', 'Quote', 'Date:', 'Service', 'Qty', 'Unit', 'Total', 'Quote Total:', 'Notes:']:
        assert label in text, label
    for label in ['Invoice', 'Status:', 'Bill To:', 'quote_']:
        assert label not in text, label
with pdfplumber.open(root / 'quote-long.pdf') as doc:
    assert len(doc.pages) > 1
    for i, page in enumerate(doc.pages):
        assert f'Page {i + 1} of {len(doc.pages)}' in page.extract_text()
        assert all(char['bottom'] <= page.height - 18 for char in page.chars), f'Overflow on page {i + 1}'
with pdfplumber.open(root / 'quote-email.pdf') as doc:
    text = '\n'.join(page.extract_text() or '' for page in doc.pages)
    assert 'Quote Total:' in text and 'Invoice' not in text
print('PASS PDF content, email attachment content, multipage footers and page bounds')
