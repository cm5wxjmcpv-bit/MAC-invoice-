# Quote implementation verification

Tested against invoice baseline `3acf363bca982004cdaf0fa2def82f2602958f88`.

## Passed

- Actual Apps Script functions exercised through an in-memory SpreadsheetApp,
  CacheService, LockService, Utilities, and MailApp test adapter.
- Existing sheet records remain identical throughout quote create/edit/archive/
  restore/delete/email operations. Quotes use separate sheets.
- Quote totals are recalculated; zero values, missing contact details, invalid
  quantities, missing customers/items, edits, failed item writes, and sent timestamp
  preservation are covered.
- Email subjects, bodies, PDF attachment type/content, timestamps, failure logging,
  and duplicate request suppression are covered with a simulated mail service.
- Browser tests cover new quote, customer selection, service, quantity/price edits,
  line notes/general notes, save, reload, edit without duplicates, download,
  archive, editing an archived quote, restore, delete cancellation and confirmation.
- Browser integration uses the actual Apps Script code behind an intercepted test
  endpoint. Repeated save/send clicks, slow requests, backend errors, missing email,
  and an old backend without quote actions are covered.
- Invoice creation, numbering, open/edit/save, paid status, archive/restore, PDF,
  email attachment, and sent timestamp regressions pass.
- Original and updated invoice PDFs are **byte-identical** for the same fixture
  after fixing only PDF creation date and file ID for deterministic comparison.
  The original invoice renderer and backend email functions are unchanged.
- 375px mobile, 768px tablet, and 1280px desktop quote layouts have no document
  horizontal overflow. Navigation remains horizontally scrollable on mobile.
- Normal quote PDF and invoice PDF inspected visually. A 13-page stress quote
  covers long names, addresses, services, line notes, general notes, and large
  amounts. Its pages have correct footers and no text below the footer boundary.
- Quote PDF text has the required branding, date, table columns, total, and notes;
  no Invoice, Bill To, Status, or internal quote ID appears.
- No uncaught browser JavaScript errors. Syntax and whitespace checks pass.

## Issues found and fixed

- Keep the edited quote separate from the saved-list snapshot so unsaved edits
  cannot silently alter the saved quote shown in the list.
- Wrap and paginate quote-only long text; shrink unusually large numeric values
  to keep them inside the table/total columns. Invoice rendering stays untouched.
- Disable quote controls when the existing backend lacks quote support; show a
  retry and deployment notice rather than losing records through local fallback.

## Deployment and live checks outstanding

This branch is staged for backend-first deployment. No production records were
changed and no customer test emails were sent. The new production Sheets tabs
will be created by running the updated `ensureSetup`; they were created only in
the test adapter during this run.

Follow README's **Update the existing Apps Script deployment** instructions, then
merge the frontend changes and verify GitHub Pages. Actual Apps Script permissions,
quotas, Google Sheets persistence, and inbox delivery cannot be proved by mocked
services. Finish with a quote addressed to your own email and an invoice smoke
check after deploying. GitHub Pages deployment of this branch has not been run.

Commands: `node tests/backend.cjs`, `node tests/browser.cjs`, and
`python3 tests/pdf-check.py`. See README for browser test prerequisites.
