const SHEET_NAMES = {
  CUSTOMERS: 'Customers',
  SERVICES: 'Services',
  INVOICES: 'Invoices',
  INVOICE_ITEMS: 'InvoiceItems',
  EMAIL_LOG: 'EmailLog',
  SETTINGS: 'Settings'
};

const HEADERS = {
  Customers: ['id', 'name', 'phone', 'email', 'address', 'notes', 'createdAt', 'updatedAt'],
  Services: ['id', 'serviceName', 'defaultPrice', 'description', 'createdAt', 'updatedAt'],
  Invoices: ['id', 'invoiceNumber', 'date', 'customerId', 'customerName', 'customerPhone', 'customerEmail', 'customerAddress', 'subtotal', 'total', 'notes', 'status', 'createdAt', 'updatedAt', 'emailSentAt', 'archivedAt'],
  InvoiceItems: ['id', 'invoiceId', 'serviceId', 'serviceName', 'quantity', 'unitPrice', 'lineTotal', 'lineNote'],
  EmailLog: ['id', 'invoiceId', 'invoiceNumber', 'customerEmail', 'filename', 'status', 'message', 'createdAt'],
  Quotes: ['id', 'date', 'customerId', 'customerName', 'customerPhone', 'customerEmail', 'customerAddress', 'subtotal', 'total', 'notes', 'createdAt', 'updatedAt', 'emailSentAt', 'archivedAt'],
  QuoteItems: ['id', 'quoteId', 'serviceId', 'serviceName', 'quantity', 'unitPrice', 'lineTotal', 'lineNote'],
  QuoteEmailLog: ['id', 'quoteId', 'customerEmail', 'filename', 'status', 'message', 'createdAt'],
  Settings: ['key', 'value']
};

const DEFAULT_SERVICES = [
  ['Pressure Washing', 250, 'Exterior pressure washing service'],
  ['Gutter Cleaning', 125, 'Clean gutters and remove debris'],
  ['Driveway Cleaning', 100, 'Driveway surface cleaning'],
  ['Soft Washing', 200, 'Low-pressure soft wash service'],
  ['Window Cleaning', 75, 'Window cleaning service'],
  ['General Labor', 100, 'General labor service']
];
const CACHE_KEY_ALL_DATA = 'mac_all_data_v1';
const CACHE_TTL_SECONDS = 45;

function doPost(e) {
  try {
    ensureSetup();
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const action = body.action;
    let data;
    if (action === 'getAllData') data = getAllData();
    else if (action === 'getCustomers') data = getRows(SHEET_NAMES.CUSTOMERS);
    else if (action === 'saveCustomer') { data = saveRow(SHEET_NAMES.CUSTOMERS, body.customer || {}, 'customer'); clearDataCache(); }
    else if (action === 'deleteCustomer') { data = deleteRow(SHEET_NAMES.CUSTOMERS, body.id); clearDataCache(); }
    else if (action === 'getServices') data = getRows(SHEET_NAMES.SERVICES);
    else if (action === 'saveService') { data = saveRow(SHEET_NAMES.SERVICES, body.service || {}, 'service'); clearDataCache(); }
    else if (action === 'deleteService') { data = deleteRow(SHEET_NAMES.SERVICES, body.id); clearDataCache(); }
    else if (action === 'getInvoices') data = getInvoices();
    else if (action === 'saveInvoice') { data = saveInvoice(body.invoice || {}); clearDataCache(); }
    else if (action === 'updateInvoiceStatus') { data = updateInvoiceStatus(body.invoiceId, body.status); clearDataCache(); }
    else if (action === 'sendInvoiceEmail') { data = sendInvoiceEmail(body.invoice || {}, body.pdfBase64, body.filename); clearDataCache(); }
    else if (['getQuotes', 'saveQuote', 'deleteQuote', 'sendQuoteEmail'].indexOf(action) >= 0) data = handleQuoteAction(action, body);
    else throw new Error('Unknown action: ' + action);
    return jsonResponse({ ok: true, data: data, message: 'Success' });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function doGet() {
  ensureSetup();
  return jsonResponse({ ok: true, data: { app: 'MAC Industries Invoice Backend' }, message: 'Success' });
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSetup() {
  Object.keys(HEADERS).forEach(function(name) {
    const sheet = ss().getSheetByName(name) || ss().insertSheet(name);
    ensureHeaders(sheet, HEADERS[name]);
  });
  seedServices();
}

function ensureHeaders(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const firstRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const currentHeaders = firstRow.filter(function(header) { return header !== ''; });
  if (!currentHeaders.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const missingHeaders = headers.filter(function(header) { return currentHeaders.indexOf(header) === -1; });
  if (missingHeaders.length) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
}

function getSheetHeaders(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].filter(function(header) { return header !== ''; });
}

function seedServices() {
  const services = getRows(SHEET_NAMES.SERVICES);
  if (services.length) return;
  DEFAULT_SERVICES.forEach(function(service) {
    saveRow(SHEET_NAMES.SERVICES, { serviceName: service[0], defaultPrice: service[1], description: service[2] }, 'service');
  });
}

function getAllData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_ALL_DATA);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      cache.remove(CACHE_KEY_ALL_DATA);
    }
  }
  const data = {
    customers: getRows(SHEET_NAMES.CUSTOMERS),
    services: getRows(SHEET_NAMES.SERVICES),
    invoices: getInvoices()
  };
  cache.put(CACHE_KEY_ALL_DATA, JSON.stringify(data), CACHE_TTL_SECONDS);
  return data;
}

function clearDataCache() {
  CacheService.getScriptCache().remove(CACHE_KEY_ALL_DATA);
}

function getRows(sheetName) {
  const sheet = ss().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).filter(function(row) { return row[0]; }).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) { object[header] = row[index]; });
    return object;
  });
}

function saveRow(sheetName, object, prefix) {
  const sheet = ss().getSheetByName(sheetName);
  const headers = getSheetHeaders(sheet);
  const now = new Date().toISOString();
  const saved = Object.assign({}, object);
  saved.id = saved.id || makeId(prefix);
  saved.createdAt = saved.createdAt || now;
  saved.updatedAt = now;
  const row = headers.map(function(header) { return saved[header] !== undefined ? saved[header] : ''; });
  const existingRow = findRowById(sheet, saved.id);
  if (existingRow > 0) sheet.getRange(existingRow, 1, 1, headers.length).setValues([row]);
  else sheet.appendRow(row);
  return saved;
}

function deleteRow(sheetName, id) {
  const sheet = ss().getSheetByName(sheetName);
  const row = findRowById(sheet, id);
  if (row > 1) sheet.deleteRow(row);
  return { id: id };
}

function findRowById(sheet, id) {
  if (!id) return -1;
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function getInvoices() {
  const invoices = getRows(SHEET_NAMES.INVOICES);
  const items = getRows(SHEET_NAMES.INVOICE_ITEMS);
  return invoices.map(function(invoice) {
    invoice.items = items.filter(function(item) { return String(item.invoiceId) === String(invoice.id); }).map(normalizeInvoiceItem);
    return invoice;
  });
}

function normalizeInvoiceItem(item) {
  const quantity = item.quantity === undefined || item.quantity === '' ? 1 : Number(item.quantity) || 0;
  const unitPrice = item.unitPrice === undefined || item.unitPrice === '' ? 0 : Number(item.unitPrice) || 0;
  const lineTotal = item.lineTotal === undefined || item.lineTotal === '' ? quantity * unitPrice : Number(item.lineTotal) || 0;
  return Object.assign({}, item, {
    quantity: quantity,
    unitPrice: unitPrice,
    lineTotal: lineTotal,
    lineNote: item.lineNote || ''
  });
}

function saveInvoice(invoice) {
  if (!invoice.customerId) throw new Error('Invoice customer is required');
  if (!invoice.items || !invoice.items.length) throw new Error('Invoice items are required');
  invoice.id = invoice.id || makeId('invoice');
  invoice.subtotal = Number(invoice.subtotal || invoice.total || 0);
  invoice.total = Number(invoice.total || invoice.subtotal || 0);
  const saved = saveRow(SHEET_NAMES.INVOICES, invoice, 'invoice');
  deleteInvoiceItems(saved.id);
  const savedItems = invoice.items.map(function(item) {
    const normalizedItem = normalizeInvoiceItem(item);
    const savedItem = Object.assign({}, normalizedItem, { invoiceId: saved.id, id: normalizedItem.id || makeId('item') });
    saveInvoiceItem(savedItem);
    return savedItem;
  });
  saved.items = savedItems;
  return saved;
}

function saveInvoiceItem(item) {
  const sheet = ss().getSheetByName(SHEET_NAMES.INVOICE_ITEMS);
  const headers = getSheetHeaders(sheet);
  const normalized = normalizeInvoiceItem(item);
  const row = headers.map(function(header) { return normalized[header] !== undefined ? normalized[header] : ''; });
  sheet.appendRow(row);
}

function deleteInvoiceItems(invoiceId) {
  const sheet = ss().getSheetByName(SHEET_NAMES.INVOICE_ITEMS);
  const headers = getSheetHeaders(sheet);
  const invoiceIdColumn = headers.indexOf('invoiceId') + 1;
  if (!invoiceIdColumn) return;
  for (let row = sheet.getLastRow(); row >= 2; row--) {
    if (String(sheet.getRange(row, invoiceIdColumn).getValue()) === String(invoiceId)) sheet.deleteRow(row);
  }
}

function updateInvoiceStatus(invoiceId, status) {
  const invoices = getInvoices();
  const invoice = invoices.find(function(item) { return String(item.id) === String(invoiceId); });
  if (!invoice) throw new Error('Invoice not found');
  invoice.status = status;
  return saveInvoice(invoice);
}

function sendInvoiceEmail(invoice, pdfBase64, filename) {
  if (!invoice.customerEmail) throw new Error('Customer email is required');
  if (!pdfBase64) throw new Error('PDF attachment is required');
  const safeFilename = filename || ('MAC-Invoice-' + invoice.invoiceNumber + '.pdf');
  const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), 'application/pdf', safeFilename);
  try {
    MailApp.sendEmail({
      to: invoice.customerEmail,
      subject: 'Invoice #' + invoice.invoiceNumber + ' from MAC Industries',
      body: 'Hello ' + (invoice.customerName || '') + ',\n\nPlease find your MAC Industries invoice attached.\n\nThank you,\nMAC Industries',
      attachments: [blob]
    });
    logEmail(invoice, safeFilename, 'sent', 'Email sent');
    invoice.emailSentAt = new Date().toISOString();
    const savedInvoice = saveInvoice(invoice);
    return { sent: true, emailSentAt: invoice.emailSentAt, invoice: savedInvoice };
  } catch (error) {
    logEmail(invoice, safeFilename, 'failed', error.message || String(error));
    throw error;
  }
}

function logEmail(invoice, filename, status, message) {
  const sheet = ss().getSheetByName(SHEET_NAMES.EMAIL_LOG);
  sheet.appendRow([makeId('email'), invoice.id || '', invoice.invoiceNumber || '', invoice.customerEmail || '', filename || '', status, message || '', new Date().toISOString()]);
}

function makeId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

// Quote actions use their own sheets and never write invoice/customer/service rows.
function handleQuoteAction(action, body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (action === 'getQuotes') return getQuotes();
    if (action === 'saveQuote') return saveQuote(body.quote || {});
    if (action === 'deleteQuote') return deleteQuote(body.id);
    return sendQuoteEmail(body.quote || {}, body.pdfBase64, body.filename, body.requestId);
  } finally { lock.releaseLock(); }
}
function getQuotes() {
  const items = getRows('QuoteItems');
  return getRows('Quotes').map(function(quote) {
    quote.date = quote.date instanceof Date ? Utilities.formatDate(quote.date, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : String(quote.date || '').slice(0, 10);
    quote.items = items.filter(function(item) { return String(item.quoteId) === String(quote.id); });
    return quote;
  });
}
function normalizeQuoteForSave(quote) {
  if (!quote.customerId) throw new Error('Quote customer is required');
  if (!Array.isArray(quote.items) || !quote.items.length) throw new Error('Quote items are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) throw new Error('Quote date is required');
  const saved = {};
  HEADERS.Quotes.forEach(function(key) { saved[key] = quote[key] || ''; });
  saved.id = saved.id || makeId('quote');
  saved.items = quote.items.map(function(item) {
    const quantity = Number(item.quantity), price = Number(item.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity < 0 || price < 0 || !Number.isFinite(quantity * price)) throw new Error('Quote quantity and price must be finite, nonnegative numbers');
    return { id: makeId('quoteitem'), quoteId: saved.id, serviceId: item.serviceId || '', serviceName: String(item.serviceName || ''), quantity: quantity, unitPrice: price, lineTotal: quantity * price, lineNote: String(item.lineNote || '') };
  });
  saved.total = saved.subtotal = saved.items.reduce(function(sum, item) { return sum + item.lineTotal; }, 0);
  if (!Number.isFinite(saved.total)) throw new Error('Quote total is too large');
  return saved;
}
function saveQuote(quote) {
  const saved = normalizeQuoteForSave(quote);
  const previous = getQuotes().find(function(item) { return String(item.id) === String(saved.id); });
  saved.createdAt = previous ? previous.createdAt : new Date().toISOString();
  saved.emailSentAt = previous ? previous.emailSentAt : '';
  if (quote.archivedAt === undefined && previous) saved.archivedAt = previous.archivedAt;
  // Keep the old items until all replacement items have been written successfully.
  const oldItems = previous ? previous.items : [];
  const writtenIds = [];
  try {
    saved.items.forEach(function(item) { saveQuoteItem(item); writtenIds.push(item.id); });
    const header = saveRow('Quotes', saved, 'quote');
    saved.updatedAt = header.updatedAt;
  } catch (error) {
    writtenIds.forEach(function(id) { deleteRow('QuoteItems', id); });
    throw error;
  }
  oldItems.forEach(function(item) { deleteRow('QuoteItems', item.id); });
  return saved;
}
function saveQuoteItem(item) {
  const sheet = ss().getSheetByName('QuoteItems');
  sheet.appendRow(getSheetHeaders(sheet).map(function(header) { return item[header] !== undefined ? item[header] : ''; }));
}
function deleteQuoteItems(id) {
  const sheet = ss().getSheetByName('QuoteItems');
  const column = getSheetHeaders(sheet).indexOf('quoteId') + 1;
  for (let row = sheet.getLastRow(); row >= 2; row--) {
    if (String(sheet.getRange(row, column).getValue()) === String(id)) sheet.deleteRow(row);
  }
}
function deleteQuote(id) {
  const quote = getRows('Quotes').find(function(item) { return String(item.id) === String(id); });
  if (!quote) return { id: id };
  if (!quote.archivedAt) throw new Error('Archive a quote before deleting it');
  deleteQuoteItems(id);
  return deleteRow('Quotes', id);
}
function logQuoteEmail(quote, filename, status, message, requestId) {
  return saveRow('QuoteEmailLog', { id: requestId || makeId('quoteemail'), quoteId: quote.id || '', customerEmail: quote.customerEmail || '', filename: filename || '', status: status, message: message || '' }, 'quoteemail');
}
function sendQuoteEmail(input, pdfBase64, filename, requestId) {
  const quote = getQuotes().find(function(item) { return String(item.id) === String(input.id); });
  if (!quote) throw new Error('Save the quote before sending');
  const prior = requestId && getRows('QuoteEmailLog').find(function(item) { return item.id === requestId; });
  if (prior) {
    if (prior.quoteId !== quote.id) throw new Error('Email request does not match this quote');
    if (prior.status === 'sent') {
      if (!quote.emailSentAt) {
        quote.emailSentAt = prior.createdAt;
        saveRow('Quotes', quote, 'quote');
      }
      return { sent: true, emailSentAt: quote.emailSentAt, quote: quote };
    }
    throw new Error('This email attempt has already been processed. Check QuoteEmailLog before starting another send.');
  }
  let safeFilename = 'MAC-Quote-' + quote.date;
  const name = String(quote.customerName || '').normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-').slice(0, 70);
  safeFilename += (name ? '-' + name : '') + '.pdf';
  try {
    if (!quote.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quote.customerEmail)) throw new Error('Valid customer email is required');
    if (!pdfBase64) throw new Error('PDF attachment is required');
    const blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), 'application/pdf', safeFilename);
    logQuoteEmail(quote, safeFilename, 'sending', 'Send started', requestId);
    MailApp.sendEmail({ to: quote.customerEmail, subject: 'Quote from MAC Industries', body: 'Hello ' + (quote.customerName || '') + ',\n\nPlease find your MAC Industries quote attached.\n\nThank you,\nMAC Industries', attachments: [blob] });
  } catch (error) {
    logQuoteEmail(quote, safeFilename, 'failed', error.message || String(error), requestId);
    throw error;
  }
  // Log delivery before updating metadata; a retry must never send a second email.
  logQuoteEmail(quote, safeFilename, 'sent', 'Email sent', requestId);
  quote.emailSentAt = new Date().toISOString();
  const saved = saveRow('Quotes', quote, 'quote');
  saved.items = quote.items;
  return { sent: true, emailSentAt: saved.emailSentAt, quote: saved };
}
