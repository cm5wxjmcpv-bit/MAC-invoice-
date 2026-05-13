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
  Invoices: ['id', 'invoiceNumber', 'date', 'customerId', 'customerName', 'customerPhone', 'customerEmail', 'customerAddress', 'subtotal', 'total', 'notes', 'status', 'createdAt', 'updatedAt', 'emailSentAt'],
  InvoiceItems: ['id', 'invoiceId', 'serviceId', 'serviceName', 'quantity', 'unitPrice', 'lineTotal', 'lineNote'],
  EmailLog: ['id', 'invoiceId', 'invoiceNumber', 'customerEmail', 'filename', 'status', 'message', 'createdAt'],
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

function doPost(e) {
  try {
    ensureSetup();
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const action = body.action;
    let data;
    if (action === 'test') data = backendTestData();
    else if (action === 'getCustomers') data = getRows(SHEET_NAMES.CUSTOMERS);
    else if (action === 'saveCustomer') data = saveRow(SHEET_NAMES.CUSTOMERS, body.customer || {}, 'customer');
    else if (action === 'deleteCustomer') data = deleteRow(SHEET_NAMES.CUSTOMERS, body.id);
    else if (action === 'getServices') data = getRows(SHEET_NAMES.SERVICES);
    else if (action === 'saveService') data = saveRow(SHEET_NAMES.SERVICES, body.service || {}, 'service');
    else if (action === 'deleteService') data = deleteRow(SHEET_NAMES.SERVICES, body.id);
    else if (action === 'getInvoices') data = getInvoices();
    else if (action === 'saveInvoice') data = saveInvoice(body.invoice || {});
    else if (action === 'updateInvoiceStatus') data = updateInvoiceStatus(body.invoiceId, body.status);
    else if (action === 'sendInvoiceEmail') data = sendInvoiceEmail(body.invoice || {}, body.pdfBase64, body.filename);
    else throw new Error('Unknown action: ' + action);
    return jsonResponse({ ok: true, data: data, message: action === 'test' ? 'Backend connected' : 'Success' });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function doGet() {
  ensureSetup();
  return jsonResponse({ ok: true, data: backendTestData(), message: 'Backend connected' });
}

function backendTestData() {
  return { app: 'MAC Industries Invoice Backend', timestamp: new Date().toISOString() };
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
    saveInvoice(invoice);
    return { sent: true, emailSentAt: invoice.emailSentAt };
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
