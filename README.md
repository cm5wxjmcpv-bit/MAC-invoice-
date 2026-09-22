# MAC Industries Invoice App

A simple GitHub Pages invoice prototype for MAC Industries. It uses plain HTML, CSS, and JavaScript with no build step, no framework, and no login. The app works immediately in the browser with `localStorage`, then can be connected to Google Apps Script and Google Sheets for shared storage and email sending.

## What the app does

- Saves customers with phone, email, address, and notes.
- Saves reusable service templates.
- Seeds common MAC Industries services:
  - Pressure Washing — $250
  - Gutter Cleaning — $125
  - Driveway Cleaning — $100
  - Soft Washing — $200
  - Window Cleaning — $75
  - General Labor — $100
- Creates invoices quickly from saved customers and services.
- Lets the user tap preset services to add line items.
- Adds optional notes to individual invoice line items without changing saved service templates.
- Recalculates line totals and invoice totals when quantity or price changes.
- Generates and downloads PDF invoices in the browser with jsPDF.
- Sends invoice PDFs by email through a Google Apps Script backend when configured.
- Marks invoices paid/unpaid directly from invoice cards.
- Archives paid invoices into a separate Archive tab.
- Stores customers, services, invoices, invoice items, and email logs in Google Sheets when configured.

## Files included

- `index.html` — static page structure, tab panels, and script loading order.
- `styles.css` — mobile-first dark contractor-style UI.
- `config.js` — app name, company name, Apps Script URL, and local fallback setting.
- `api.js` — API wrapper that uses Apps Script when configured and `localStorage` otherwise.
- `app.js` — UI rendering, forms, invoice builder, PDF generation, and email workflow.
- `apps-script-backend.gs` — starter Google Apps Script backend.
- `README.md` — setup and testing instructions.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any simple static server. The app should work right away in local storage mode.

> Note: jsPDF loads from a CDN, so PDF generation needs internet access.

## Publish on GitHub Pages

1. Push these files to your GitHub repository.
2. Open the repository on GitHub.
3. Go to **Settings** → **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the branch, usually `main`, and the root folder `/`.
6. Click **Save**.
7. Open the GitHub Pages URL after deployment finishes.

## Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/).
2. Create a blank spreadsheet named something like `MAC Industries Invoice Database`.
3. You do not need to manually create tabs. The Apps Script backend creates these tabs and headers automatically:
   - `Customers`
   - `Services`
   - `Invoices`
   - `InvoiceItems`
   - `EmailLog`
   - `Settings`

## Add the Apps Script backend

1. In the Google Sheet, click **Extensions** → **Apps Script**.
2. Delete any starter code in `Code.gs`.
3. Copy everything from `apps-script-backend.gs` in this repo.
4. Paste it into the Apps Script editor.
5. Save the project.
6. Run the `ensureSetup` function once from the Apps Script editor.
7. Approve the requested permissions. Permissions are needed for spreadsheet access and email sending.

## Deploy Apps Script as a Web App

1. In Apps Script, click **Deploy** → **New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to the access level you want for this prototype. For easy testing, use **Anyone** or **Anyone with the link** if available on your Google account.
5. Click **Deploy**.
6. Copy the Web App URL.

## Connect the website to Apps Script

Open `config.js` and paste the Web App URL into `APPS_SCRIPT_URL`:

```js
const APP_CONFIG = {
  APP_NAME: "MAC Industries Invoice App",
  COMPANY_NAME: "MAC Industries",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
  USE_LOCAL_FALLBACK: true
};
```

Commit and push the updated `config.js` so GitHub Pages uses the backend.

If `APPS_SCRIPT_URL` is blank, the app shows `Local storage mode` and keeps working with browser `localStorage`.

## Google Sheet tabs used

### Customers
Stores customer records:

- `id`
- `name`
- `phone`
- `email`
- `address`
- `notes`
- `createdAt`
- `updatedAt`

### Services
Stores reusable service templates:

- `id`
- `serviceName`
- `defaultPrice`
- `description`
- `createdAt`
- `updatedAt`

### Invoices
Stores invoice header data:

- `id`
- `invoiceNumber`
- `date`
- `customerId`
- `customerName`
- `customerPhone`
- `customerEmail`
- `customerAddress`
- `subtotal`
- `total`
- `notes`
- `status`
- `createdAt`
- `updatedAt`
- `emailSentAt`
- `archivedAt`

### InvoiceItems
Stores invoice line items:

- `id`
- `invoiceId`
- `serviceId`
- `serviceName`
- `quantity`
- `unitPrice`
- `lineTotal`
- `lineNote`

### EmailLog
Stores send attempts:

- `id`
- `invoiceId`
- `invoiceNumber`
- `customerEmail`
- `filename`
- `status`
- `message`
- `createdAt`

### Settings
Reserved for future app settings.

## How email sending works

1. The user opens or creates an invoice.
2. The user clicks **Send Email**.
3. The browser generates the invoice PDF with jsPDF.
4. The PDF is converted to base64.
5. The frontend sends JSON to the Apps Script Web App using the `sendInvoiceEmail` action.
6. Apps Script decodes the base64 PDF, attaches it to an email, and sends it with `MailApp.sendEmail`.
7. Apps Script logs the send status in the `EmailLog` sheet.
8. The frontend shows either `Email sent` or `Email failed`.

If the backend URL is blank, the email button fails gracefully with a clear message instead of crashing.

## Current limitations

- No user accounts or authentication in the frontend.
- No tax, discounts, deposits, or partial payments yet.
- No company logo upload yet.
- No invoice deletion UI yet.
- No offline sync between local storage and Google Sheets.
- Apps Script Web App access should be reviewed before real production use.
- PDF layout is intentionally simple for prototype version 1.

## Future upgrade ideas

- Add tax, discounts, and deposits.
- Add company logo and business contact settings.
- Add invoice delete/archive controls.
- Add payment links.
- Add better invoice numbering settings.
- Add customer job history.
- Add printable estimates/quotes.
- Add stronger backend validation and access controls.
- Add import/export tools for backup.

## Testing checklist

Manually verify these items before considering the prototype ready:

- [ ] Site loads with no console errors.
- [ ] Bottom navigation works.
- [ ] Default services appear.
- [ ] Customer can be added.
- [ ] Customer can be edited.
- [ ] Customer can be deleted.
- [ ] Service can be added.
- [ ] Service can be edited.
- [ ] Service can be deleted.
- [ ] Invoice can be created.
- [ ] Customer can be selected.
- [ ] Add Services works.
- [ ] Multiple services can be added.
- [ ] Line item notes can be entered, saved, reopened, and shown on PDFs without changing totals.
- [ ] Quantity changes total.
- [ ] Price changes total.
- [ ] Line item can be removed.
- [ ] Invoice saves.
- [ ] Invoice appears in recent invoices.
- [ ] PDF downloads.
- [ ] Email button fails gracefully if backend URL is blank.
- [ ] App works on a narrow mobile screen.
- [ ] No broken file paths.
- [ ] No missing functions.
- [ ] No duplicate function names that break the app.

## Script loading order

`index.html` loads scripts in this order:

1. jsPDF CDN
2. `config.js`
3. `api.js`
4. `app.js`

Do not change this order unless you also update the code dependencies.

## Quotes (separate from invoices)

Quotes and Quote Archive share the existing customer and service lists, but use separate
records, browser storage (`mac_quotes_v1`), API actions, PDF rendering, and email logs.
Quotes can be saved, edited, downloaded, emailed, archived, restored, and permanently
deleted after confirmation. Quote PDFs have no number, status, or Bill To label.

### Update the existing Apps Script deployment

1. Open the **existing invoice database spreadsheet**, then **Extensions → Apps Script**.
2. Replace the contents of the existing backend code file with this repository's
   `apps-script-backend.gs`. Do not add a second copy of the same functions.
3. Save, select `ensureSetup`, and click **Run**. This creates missing `Quotes`,
   `QuoteItems`, and `QuoteEmailLog` sheets/headers; it does not clear existing records.
4. Choose **Deploy → Manage deployments**, select the existing web app, click the
   edit/pencil icon, choose **New version**, and click **Deploy**. Keep the existing
   execution/access settings. Updating the existing deployment preserves its URL;
   **leave `config.js` unchanged**.
5. Reload the website. If a backend-update notice is visible in Quotes, click
   **Retry Quotes**. The form only becomes available after `getQuotes` succeeds.
6. Save a test quote for your own customer record, download it, and send it to your
   own email address. Check the attachment and the sent timestamp. Live delivery
   requires this manual check; automated tests use a simulated mail service.

No invoice migration is required. The new actions are `getQuotes`, `saveQuote`,
`deleteQuote`, and `sendQuoteEmail`. `getAllData` retains its existing response and
cache behavior; quotes load independently. Backend failures do not silently switch
quote saves to local storage. Local mode is selected by a blank backend URL and
supports all quote operations except email.

Quote saves recalculate totals server-side and preserve sent metadata. A script lock
serializes quote actions. Stable draft IDs prevent duplicate records on retries.
Email request IDs prevent automatic retries from sending the same message twice.
If a send is recorded as `sending` or `failed`, inspect `QuoteEmailLog` before reopening
the quote and deliberately trying again. As with the invoice system, Google Sheets
is not a transactional database; service outages during a multi-step write require
checking the saved record before retrying.

### Automated regression tests

- `node tests/backend.cjs` runs the actual Apps Script against in-memory Sheets and
  Mail adapters. It checks storage isolation, calculations, editing, archive/restore,
  deletion, send logs, send retry deduplication, a failed item write, and invoice actions.
- `tests/browser.cjs` uses Playwright and actual jsPDF. Set `BASELINE_DIR` to an export
  of commit `3acf363bca982004cdaf0fa2def82f2602958f88`, and `JSPDF_PATH` to the jsPDF
  2.5.1 UMD script. Install Playwright and its Chromium runtime first.
  Optional `CHROMIUM_PATH` selects an installed browser and `TEST_OUTPUT` selects a
  temporary output directory. Run `node tests/browser.cjs`.
- Browser tests compare the original/current invoice PDF bytes after normalizing
  PDF metadata; exercise quote and invoice workflows; check 375/768/1280px layouts;
  and use the actual Apps Script via a mocked network endpoint for email tests.
  No live customer records or messages are used.
