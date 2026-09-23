const STORAGE_KEYS = {
  customers: "mac_customers_v1",
  services: "mac_services_v1",
  invoices: "mac_invoices_v1"
};

const DEFAULT_SERVICES = [
  { serviceName: "Pressure Washing", defaultPrice: 250, description: "Exterior pressure washing service" },
  { serviceName: "Gutter Cleaning", defaultPrice: 125, description: "Clean gutters and remove debris" },
  { serviceName: "Driveway Cleaning", defaultPrice: 100, description: "Driveway surface cleaning" },
  { serviceName: "Soft Washing", defaultPrice: 200, description: "Low-pressure soft wash service" },
  { serviceName: "Window Cleaning", defaultPrice: 75, description: "Window cleaning service" },
  { serviceName: "General Labor", defaultPrice: 100, description: "General labor service" }
];

function apiUsesBackend() {
  return Boolean(APP_CONFIG.APPS_SCRIPT_URL && APP_CONFIG.APPS_SCRIPT_URL.trim());
}

function apiNow() {
  return new Date().toISOString();
}

function apiId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (error) {
    console.error("Local storage read failed", error);
    return [];
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedDefaultServices() {
  const services = readStore(STORAGE_KEYS.services);
  if (services.length === 0) {
    const seeded = DEFAULT_SERVICES.map((service) => ({
      id: apiId("service"),
      ...service,
      createdAt: apiNow(),
      updatedAt: apiNow()
    }));
    writeStore(STORAGE_KEYS.services, seeded);
  }
}

seedDefaultServices();

async function callBackend(action, payload = {}) {
  const readOnly = ["getAllData", "getCustomers", "getServices", "getInvoices", "getQuotes"].includes(action);
  for (let attempt = 0; attempt <= (readOnly ? 1 : 0); attempt++) {
    let response;
    try {
      response = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload })
      });
    } catch (error) {
      if (attempt || !readOnly) throw error;
      continue;
    }
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (error) {
      if (readOnly && !attempt) continue;
      throw new Error(`Backend returned a non-JSON response (${response.status}). Check the Apps Script deployment URL and permissions.`);
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Backend request failed (${response.status})`);
    }
    return result;
  }
}

function ok(data = {}, message = "Success") {
  return { ok: true, data, message };
}

function fail(error) {
  return { ok: false, error: error.message || String(error) };
}

function normalizeInvoiceItem(item = {}) {
  const quantity = item.quantity === undefined || item.quantity === "" ? 1 : Number(item.quantity) || 0;
  const unitPrice = item.unitPrice === undefined || item.unitPrice === "" ? 0 : Number(item.unitPrice) || 0;
  const lineTotal = item.lineTotal === undefined || item.lineTotal === "" ? quantity * unitPrice : Number(item.lineTotal) || 0;
  return {
    ...item,
    quantity,
    unitPrice,
    lineTotal,
    lineNote: item.lineNote || ""
  };
}

function normalizeInvoice(invoice = {}) {
  const items = Array.isArray(invoice.items) ? invoice.items.map(normalizeInvoiceItem) : [];
  const subtotal = Number(invoice.subtotal || items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  return {
    ...invoice,
    items,
    subtotal,
    total: Number(invoice.total || subtotal || 0),
    archivedAt: invoice.archivedAt || ""
  };
}

async function apiGetCustomers() {
  try {
    if (apiUsesBackend()) return await callBackend("getCustomers");
    return ok(readStore(STORAGE_KEYS.customers));
  } catch (error) { return fail(error); }
}

async function apiGetAllData() {
  try {
    if (apiUsesBackend()) {
      const result = await callBackend("getAllData");
      if (!["customers", "services", "invoices"].every(key => Array.isArray(result.data?.[key]))) {
        throw new Error("Unexpected response while loading app data. Please reload and try again");
      }
      return ok({
        customers: Array.isArray(result.data?.customers) ? result.data.customers : [],
        services: Array.isArray(result.data?.services) ? result.data.services : [],
        invoices: Array.isArray(result.data?.invoices) ? result.data.invoices.map(normalizeInvoice) : []
      }, result.message);
    }
    seedDefaultServices();
    return ok({
      customers: readStore(STORAGE_KEYS.customers),
      services: readStore(STORAGE_KEYS.services),
      invoices: readStore(STORAGE_KEYS.invoices).map(normalizeInvoice)
    });
  } catch (error) { return fail(error); }
}

async function apiSaveCustomer(customer) {
  try {
    if (apiUsesBackend()) return await callBackend("saveCustomer", { customer });
    const customers = readStore(STORAGE_KEYS.customers);
    const now = apiNow();
    const saved = { ...customer, id: customer.id || apiId("customer"), createdAt: customer.createdAt || now, updatedAt: now };
    const index = customers.findIndex((item) => item.id === saved.id);
    if (index >= 0) customers[index] = saved; else customers.push(saved);
    writeStore(STORAGE_KEYS.customers, customers);
    return ok(saved, "Saved");
  } catch (error) { return fail(error); }
}

async function apiDeleteCustomer(id) {
  try {
    if (apiUsesBackend()) return await callBackend("deleteCustomer", { id });
    writeStore(STORAGE_KEYS.customers, readStore(STORAGE_KEYS.customers).filter((item) => item.id !== id));
    return ok({ id }, "Deleted");
  } catch (error) { return fail(error); }
}

async function apiGetServices() {
  try {
    if (apiUsesBackend()) return await callBackend("getServices");
    seedDefaultServices();
    return ok(readStore(STORAGE_KEYS.services));
  } catch (error) { return fail(error); }
}

async function apiSaveService(service) {
  try {
    if (apiUsesBackend()) return await callBackend("saveService", { service });
    const services = readStore(STORAGE_KEYS.services);
    const now = apiNow();
    const saved = { ...service, id: service.id || apiId("service"), createdAt: service.createdAt || now, updatedAt: now };
    const index = services.findIndex((item) => item.id === saved.id);
    if (index >= 0) services[index] = saved; else services.push(saved);
    writeStore(STORAGE_KEYS.services, services);
    return ok(saved, "Saved");
  } catch (error) { return fail(error); }
}

async function apiDeleteService(id) {
  try {
    if (apiUsesBackend()) return await callBackend("deleteService", { id });
    writeStore(STORAGE_KEYS.services, readStore(STORAGE_KEYS.services).filter((item) => item.id !== id));
    return ok({ id }, "Deleted");
  } catch (error) { return fail(error); }
}

async function apiGetInvoices() {
  try {
    if (apiUsesBackend()) {
      const result = await callBackend("getInvoices");
      return ok((result.data || []).map(normalizeInvoice), result.message);
    }
    return ok(readStore(STORAGE_KEYS.invoices).map(normalizeInvoice));
  } catch (error) { return fail(error); }
}

async function apiSaveInvoice(invoice) {
  try {
    const normalized = normalizeInvoice(invoice);
    if (apiUsesBackend()) {
      const result = await callBackend("saveInvoice", { invoice: normalized });
      return ok(normalizeInvoice(result.data), result.message);
    }
    const invoices = readStore(STORAGE_KEYS.invoices).map(normalizeInvoice);
    const now = apiNow();
    const saved = { ...normalized, id: normalized.id || apiId("invoice"), createdAt: normalized.createdAt || now, updatedAt: now };
    const index = invoices.findIndex((item) => item.id === saved.id);
    if (index >= 0) invoices[index] = saved; else invoices.push(saved);
    writeStore(STORAGE_KEYS.invoices, invoices);
    return ok(saved, "Invoice saved");
  } catch (error) { return fail(error); }
}

async function apiUpdateInvoiceStatus(invoiceId, status) {
  try {
    if (apiUsesBackend()) {
      const result = await callBackend("updateInvoiceStatus", { invoiceId, status });
      return ok(normalizeInvoice(result.data), result.message);
    }
    const invoices = readStore(STORAGE_KEYS.invoices).map(normalizeInvoice);
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    invoice.status = status;
    invoice.updatedAt = apiNow();
    writeStore(STORAGE_KEYS.invoices, invoices);
    return ok(normalizeInvoice(invoice), "Status updated");
  } catch (error) { return fail(error); }
}

async function apiSendInvoiceEmail(invoice, pdfBase64, filename) {
  try {
    if (!apiUsesBackend()) {
      throw new Error("Backend not configured. Add your Google Apps Script URL in config.js before sending email.");
    }
    return await callBackend("sendInvoiceEmail", { invoice, pdfBase64, filename });
  } catch (error) { return fail(error); }
}

// Separate quote storage and actions: never fall back locally after a backend error.
const QUOTE_STORAGE_KEY = "mac_quotes_v1";
function normalizeQuote(quote = {}) {
  const items = (Array.isArray(quote.items) ? quote.items : []).map(item => {
    const quantity = Number(item.quantity ?? 1), unitPrice = Number(item.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity < 0 || unitPrice < 0 || !Number.isFinite(quantity * unitPrice)) throw new Error("Quote quantity and price must be finite, nonnegative numbers");
    return { id: item.id || apiId("quoteitem"), quoteId: quote.id || "", serviceId: item.serviceId || "", serviceName: String(item.serviceName || ""), quantity, unitPrice, lineTotal: quantity * unitPrice, lineNote: String(item.lineNote || "") };
  });
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (!Number.isFinite(total)) throw new Error("Quote total is too large");
  const saved = { items, subtotal: total, total };
  ["id", "date", "customerId", "customerName", "customerPhone", "customerEmail", "customerAddress", "notes", "createdAt", "updatedAt", "emailSentAt", "archivedAt"].forEach(key => saved[key] = quote[key] || "");
  return saved;
}
function validateQuote(quote) {
  if (!quote.customerId) throw new Error("Quote requires a customer");
  if (!quote.items.length) throw new Error("Quote requires at least one line item");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) throw new Error("Quote date is required");
}
function readQuotesStore() {
  const records = JSON.parse(localStorage.getItem(QUOTE_STORAGE_KEY) || "[]");
  if (!Array.isArray(records)) throw new Error("Saved quotes could not be read");
  return records.map(normalizeQuote);
}
async function apiGetQuotes() {
  try {
    const result = apiUsesBackend() ? await callBackend("getQuotes") : ok(readQuotesStore());
    if (!Array.isArray(result.data)) throw new Error("Unexpected response while loading quotes. Please retry");
    return ok(result.data.map(normalizeQuote));
  } catch (error) { return fail(error); }
}
async function apiSaveQuote(quote) {
  try {
    const normalized = normalizeQuote(quote);
    validateQuote(normalized);
    if (apiUsesBackend()) return await callBackend("saveQuote", { quote: normalized });
    const records = readQuotesStore(), previous = records.find(item => item.id === normalized.id), now = apiNow();
    const saved = normalizeQuote({ ...normalized, id: normalized.id || apiId("quote"), createdAt: previous?.createdAt || now, updatedAt: now, emailSentAt: previous?.emailSentAt || "" });
    const index = records.findIndex(item => item.id === saved.id);
    if (index < 0) records.push(saved); else records[index] = saved;
    writeStore(QUOTE_STORAGE_KEY, records);
    return ok(saved);
  } catch (error) { return fail(error); }
}
async function apiDeleteQuote(id) {
  try {
    if (apiUsesBackend()) return await callBackend("deleteQuote", { id });
    const records = readQuotesStore();
    if (!records.find(item => item.id === id)?.archivedAt) throw new Error("Archive a quote before deleting it");
    writeStore(QUOTE_STORAGE_KEY, records.filter(item => item.id !== id));
    return ok({ id });
  } catch (error) { return fail(error); }
}
async function apiSendQuoteEmail(quote, pdfBase64, filename, requestId) {
  try {
    if (!apiUsesBackend()) throw new Error("Email requires the Google Apps Script backend. Your quote can still be saved and downloaded locally.");
    return await callBackend("sendQuoteEmail", { quote, pdfBase64, filename, requestId });
  } catch (error) { return fail(error); }
}
