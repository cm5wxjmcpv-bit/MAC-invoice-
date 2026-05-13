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

const backendState = {
  configured: false,
  connected: false,
  error: "",
  mode: "localStorage"
};

function backendUrl() {
  return APP_CONFIG.APPS_SCRIPT_URL ? APP_CONFIG.APPS_SCRIPT_URL.trim() : "";
}

function apiUsesBackend() {
  return Boolean(backendUrl());
}

function apiBackendStatus() {
  return { ...backendState, configured: apiUsesBackend(), url: backendUrl() };
}

function setBackendState(update) {
  Object.assign(backendState, update, { configured: apiUsesBackend() });
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

async function parseBackendResponse(response) {
  const text = await response.text();
  console.debug("Apps Script raw response", text.slice(0, 500));
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Apps Script response was not JSON", { status: response.status, text, error });
    throw new Error(`Backend returned non-JSON response (${response.status})`);
  }
}

async function callBackend(action, payload = {}) {
  const url = backendUrl();
  console.info("Calling Apps Script backend", { url, action });
  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action, ...payload })
    });
    const result = await parseBackendResponse(response);
    console.debug("Apps Script parsed response", { action, result });
    if (!response.ok) {
      throw new Error(result.error || `Backend HTTP ${response.status}`);
    }
    if (!result.ok) {
      throw new Error(result.error || "Backend request failed");
    }
    setBackendState({ connected: true, error: "", mode: "backend" });
    return result;
  } catch (error) {
    console.error("Apps Script fetch failed", { action, error });
    setBackendState({ connected: false, error: error.message || String(error), mode: "localStorage" });
    throw error;
  }
}

async function apiTestBackend() {
  if (!apiUsesBackend()) {
    const result = { ok: false, mode: "localStorage", error: "Backend not configured, using local storage" };
    setBackendState({ connected: false, error: result.error, mode: result.mode });
    console.info("Backend test skipped", result);
    return result;
  }
  const url = backendUrl();
  console.info("Testing Apps Script backend", { url });
  try {
    const response = await fetch(url, { method: "GET" });
    const result = await parseBackendResponse(response);
    console.debug("Backend test response", result);
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Backend HTTP ${response.status}`);
    }
    setBackendState({ connected: true, error: "", mode: "backend" });
    return { ok: true, mode: "backend", message: "Connected to Apps Script", data: result.data };
  } catch (error) {
    console.error("Backend test failed", error);
    setBackendState({ connected: false, error: error.message || String(error), mode: "localStorage" });
    return { ok: false, mode: "localStorage", error: error.message || String(error) };
  }
}

function ok(data = {}, message = "Success", extra = {}) {
  return { ok: true, data, message, ...extra };
}

function fail(error) {
  return { ok: false, error: error.message || String(error) };
}

function localFallback(action, error, callback) {
  const errorMessage = error.message || String(error);
  console.warn(`${action} failed against backend; using localStorage fallback`, error);
  const result = callback();
  return ok(result.data, `Backend error, using local storage: ${errorMessage}`, {
    mode: "localStorage",
    warning: true,
    backendError: errorMessage
  });
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
    total: Number(invoice.total || subtotal || 0)
  };
}

function localGetCustomers() {
  return ok(readStore(STORAGE_KEYS.customers));
}

function localSaveCustomer(customer) {
  const customers = readStore(STORAGE_KEYS.customers);
  const now = apiNow();
  const saved = { ...customer, id: customer.id || apiId("customer"), createdAt: customer.createdAt || now, updatedAt: now };
  const index = customers.findIndex((item) => item.id === saved.id);
  if (index >= 0) customers[index] = saved; else customers.push(saved);
  writeStore(STORAGE_KEYS.customers, customers);
  return ok(saved, "Saved");
}

function localDeleteCustomer(id) {
  writeStore(STORAGE_KEYS.customers, readStore(STORAGE_KEYS.customers).filter((item) => item.id !== id));
  return ok({ id }, "Deleted");
}

function localGetServices() {
  seedDefaultServices();
  return ok(readStore(STORAGE_KEYS.services));
}

function localSaveService(service) {
  const services = readStore(STORAGE_KEYS.services);
  const now = apiNow();
  const saved = { ...service, id: service.id || apiId("service"), createdAt: service.createdAt || now, updatedAt: now };
  const index = services.findIndex((item) => item.id === saved.id);
  if (index >= 0) services[index] = saved; else services.push(saved);
  writeStore(STORAGE_KEYS.services, services);
  return ok(saved, "Saved");
}

function localDeleteService(id) {
  writeStore(STORAGE_KEYS.services, readStore(STORAGE_KEYS.services).filter((item) => item.id !== id));
  return ok({ id }, "Deleted");
}

function localGetInvoices() {
  return ok(readStore(STORAGE_KEYS.invoices).map(normalizeInvoice));
}

function localSaveInvoice(invoice) {
  const normalized = normalizeInvoice(invoice);
  const invoices = readStore(STORAGE_KEYS.invoices).map(normalizeInvoice);
  const now = apiNow();
  const saved = { ...normalized, id: normalized.id || apiId("invoice"), createdAt: normalized.createdAt || now, updatedAt: now };
  const index = invoices.findIndex((item) => item.id === saved.id);
  if (index >= 0) invoices[index] = saved; else invoices.push(saved);
  writeStore(STORAGE_KEYS.invoices, invoices);
  return ok(saved, "Invoice saved");
}

function localUpdateInvoiceStatus(invoiceId, status) {
  const invoices = readStore(STORAGE_KEYS.invoices).map(normalizeInvoice);
  const invoice = invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  invoice.status = status;
  invoice.updatedAt = apiNow();
  writeStore(STORAGE_KEYS.invoices, invoices);
  return ok(normalizeInvoice(invoice), "Status updated");
}

async function apiGetCustomers() {
  try {
    if (apiUsesBackend()) return await callBackend("getCustomers");
    return localGetCustomers();
  } catch (error) { return localFallback("getCustomers", error, localGetCustomers); }
}

async function apiSaveCustomer(customer) {
  try {
    if (apiUsesBackend()) return await callBackend("saveCustomer", { customer });
    return localSaveCustomer(customer);
  } catch (error) { return localFallback("saveCustomer", error, () => localSaveCustomer(customer)); }
}

async function apiDeleteCustomer(id) {
  try {
    if (apiUsesBackend()) return await callBackend("deleteCustomer", { id });
    return localDeleteCustomer(id);
  } catch (error) { return localFallback("deleteCustomer", error, () => localDeleteCustomer(id)); }
}

async function apiGetServices() {
  try {
    if (apiUsesBackend()) return await callBackend("getServices");
    return localGetServices();
  } catch (error) { return localFallback("getServices", error, localGetServices); }
}

async function apiSaveService(service) {
  try {
    if (apiUsesBackend()) return await callBackend("saveService", { service });
    return localSaveService(service);
  } catch (error) { return localFallback("saveService", error, () => localSaveService(service)); }
}

async function apiDeleteService(id) {
  try {
    if (apiUsesBackend()) return await callBackend("deleteService", { id });
    return localDeleteService(id);
  } catch (error) { return localFallback("deleteService", error, () => localDeleteService(id)); }
}

async function apiGetInvoices() {
  try {
    if (apiUsesBackend()) {
      const result = await callBackend("getInvoices");
      return ok((result.data || []).map(normalizeInvoice), result.message);
    }
    return localGetInvoices();
  } catch (error) { return localFallback("getInvoices", error, localGetInvoices); }
}

async function apiSaveInvoice(invoice) {
  try {
    const normalized = normalizeInvoice(invoice);
    if (apiUsesBackend()) {
      const result = await callBackend("saveInvoice", { invoice: normalized });
      return ok(normalizeInvoice(result.data), result.message);
    }
    return localSaveInvoice(normalized);
  } catch (error) { return localFallback("saveInvoice", error, () => localSaveInvoice(invoice)); }
}

async function apiUpdateInvoiceStatus(invoiceId, status) {
  try {
    if (apiUsesBackend()) return await callBackend("updateInvoiceStatus", { invoiceId, status });
    return localUpdateInvoiceStatus(invoiceId, status);
  } catch (error) {
    try {
      return localFallback("updateInvoiceStatus", error, () => localUpdateInvoiceStatus(invoiceId, status));
    } catch (localError) {
      return fail(localError);
    }
  }
}

async function apiSendInvoiceEmail(invoice, pdfBase64, filename) {
  try {
    if (!apiUsesBackend()) {
      throw new Error("Backend not configured. Add your Google Apps Script URL in config.js before sending email.");
    }
    return await callBackend("sendInvoiceEmail", { invoice, pdfBase64, filename });
  } catch (error) { return fail(error); }
}
