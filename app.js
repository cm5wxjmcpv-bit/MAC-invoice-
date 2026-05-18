const state = {
  customers: [],
  services: [],
  invoices: [],
  currentInvoice: null,
  generatedPdf: null
};

const $ = (id) => document.getElementById(id);
const money = (value) => `$${(Number(value) || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

function showMessage(message, isError = false) {
  const box = $("messageBox");
  box.textContent = message;
  box.className = `message-box show${isError ? " error" : ""}`;
  setTimeout(() => box.className = "message-box", 3600);
}

function setStorageStatus() {
  $("storageStatus").textContent = apiUsesBackend() ? "Google Sheets backend" : "Local storage mode";
  if (!apiUsesBackend()) showMessage("Backend not configured, using local storage");
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach((tab) => tab.classList.toggle("active", tab.id === tabId));
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  if (tabId === "sendTab") renderSendTab();
}

async function loadAll() {
  const [customers, services, invoices] = await Promise.all([apiGetCustomers(), apiGetServices(), apiGetInvoices()]);
  if (!customers.ok) showMessage(customers.error, true);
  if (!services.ok) showMessage(services.error, true);
  if (!invoices.ok) showMessage(invoices.error, true);
  state.customers = customers.ok ? customers.data : [];
  state.services = services.ok ? services.data : [];
  state.invoices = invoices.ok ? invoices.data : [];
  renderAll();
}

function renderAll() {
  renderCustomers();
  renderServices();
  renderCustomerSelect();
  renderInvoices();
  renderHome();
  renderInvoiceBuilder();
  renderSendTab();
}

function blankInvoice() {
  return {
    id: "",
    invoiceNumber: nextInvoiceNumber(),
    date: today(),
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    items: [],
    subtotal: 0,
    total: 0,
    notes: "",
    status: "unpaid"
  };
}

function startNewInvoice() {
  state.currentInvoice = blankInvoice();
  state.generatedPdf = null;
  renderInvoiceBuilder();
  renderSendTab();
  switchTab("invoicesTab");
}

function nextInvoiceNumber() {
  const numbers = state.invoices.map((invoice) => parseInt(invoice.invoiceNumber, 10)).filter(Boolean);
  return String(numbers.length ? Math.max(...numbers) + 1 : 1001);
}

function renderHome() {
  const paid = state.invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const unpaid = state.invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  $("paidTotal").textContent = money(paid);
  $("unpaidTotal").textContent = money(unpaid);
  const recent = [...state.invoices].sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date))).slice(0, 5);
  $("recentInvoicesList").innerHTML = recent.length ? recent.map(invoiceCard).join("") : "No invoices yet.";
}

function customerFromForm() {
  return {
    id: $("customerId").value,
    name: $("customerName").value.trim(),
    phone: $("customerPhone").value.trim(),
    email: $("customerEmail").value.trim(),
    address: $("customerAddress").value.trim(),
    notes: $("customerNotes").value.trim()
  };
}

async function saveCustomer() {
  const customer = customerFromForm();
  if (!customer.name) return showMessage("Customer name required", true);
  const result = await apiSaveCustomer(customer);
  showMessage(result.ok ? "Saved" : result.error, !result.ok);
  if (result.ok) clearCustomerForm();
  await loadAll();
}

function clearCustomerForm() {
  ["customerId", "customerName", "customerPhone", "customerEmail", "customerAddress", "customerNotes"].forEach((id) => $(id).value = "");
}

function editCustomer(id) {
  const customer = state.customers.find((item) => item.id === id);
  if (!customer) return;
  $("customerId").value = customer.id;
  $("customerName").value = customer.name || "";
  $("customerPhone").value = customer.phone || "";
  $("customerEmail").value = customer.email || "";
  $("customerAddress").value = customer.address || "";
  $("customerNotes").value = customer.notes || "";
  switchTab("customersTab");
}

async function deleteCustomer(id) {
  if (!confirm("Delete this customer?")) return;
  const result = await apiDeleteCustomer(id);
  showMessage(result.ok ? "Deleted" : result.error, !result.ok);
  await loadAll();
}

function selectCustomerForInvoice(id) {
  if (!state.currentInvoice) startNewInvoice();
  applyCustomerToInvoice(id);
  renderInvoiceBuilder();
  switchTab("invoicesTab");
  showMessage("Customer selected for invoice");
}

function renderCustomers() {
  const term = $("customerSearch").value.toLowerCase();
  const filtered = state.customers.filter((customer) => [customer.name, customer.phone, customer.email, customer.address].join(" ").toLowerCase().includes(term));
  $("customersList").innerHTML = filtered.length ? filtered.map((customer) => `
    <div class="list-item">
      <h4>${escapeHtml(customer.name)}</h4>
      <p>${escapeHtml(customer.phone || "No phone")} • ${escapeHtml(customer.email || "No email")}</p>
      <p>${escapeHtml(customer.address || "No address")}</p>
      <div class="item-actions three">
        <button class="primary-btn" onclick="selectCustomerForInvoice('${customer.id}')">Use</button>
        <button class="secondary-btn" onclick="editCustomer('${customer.id}')">Edit</button>
        <button class="danger-btn" onclick="deleteCustomer('${customer.id}')">Delete</button>
      </div>
    </div>`).join("") : "No customers found.";
}

function serviceFromForm() {
  return {
    id: $("serviceId").value,
    serviceName: $("serviceName").value.trim(),
    defaultPrice: Number($("servicePrice").value),
    description: $("serviceDescription").value.trim()
  };
}

async function saveService() {
  const service = serviceFromForm();
  if (!service.serviceName) return showMessage("Service name required", true);
  if (Number.isNaN(service.defaultPrice)) return showMessage("Service price must be a number", true);
  const result = await apiSaveService(service);
  showMessage(result.ok ? "Saved" : result.error, !result.ok);
  if (result.ok) clearServiceForm();
  await loadAll();
}

function clearServiceForm() {
  ["serviceId", "serviceName", "servicePrice", "serviceDescription"].forEach((id) => $(id).value = "");
}

function editService(id) {
  const service = state.services.find((item) => item.id === id);
  if (!service) return;
  $("serviceId").value = service.id;
  $("serviceName").value = service.serviceName || "";
  $("servicePrice").value = service.defaultPrice || 0;
  $("serviceDescription").value = service.description || "";
  switchTab("servicesTab");
}

async function deleteService(id) {
  if (!confirm("Delete this service template?")) return;
  const result = await apiDeleteService(id);
  showMessage(result.ok ? "Deleted" : result.error, !result.ok);
  await loadAll();
}

function renderServices() {
  $("servicesList").innerHTML = state.services.length ? state.services.map((service) => `
    <div class="list-item">
      <h4>${escapeHtml(service.serviceName)} — ${money(service.defaultPrice)}</h4>
      <p>${escapeHtml(service.description || "No description")}</p>
      <div class="item-actions three">
        <button class="primary-btn" onclick="addServiceToInvoice('${service.id}')">Add to Invoice</button>
        <button class="secondary-btn" onclick="editService('${service.id}')">Edit</button>
        <button class="danger-btn" onclick="deleteService('${service.id}')">Delete</button>
      </div>
    </div>`).join("") : "No services yet.";
  renderServicePicker();
}

function renderCustomerSelect() {
  const selected = state.currentInvoice?.customerId || "";
  $("invoiceCustomerSelect").innerHTML = `<option value="">Choose customer...</option>` + state.customers.map((customer) => `<option value="${customer.id}" ${customer.id === selected ? "selected" : ""}>${escapeHtml(customer.name)}</option>`).join("");
}

function applyCustomerToInvoice(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!state.currentInvoice || !customer) return;
  Object.assign(state.currentInvoice, {
    customerId: customer.id,
    customerName: customer.name || "",
    customerPhone: customer.phone || "",
    customerEmail: customer.email || "",
    customerAddress: customer.address || ""
  });
}

function updateCurrentInvoiceFromFields() {
  if (!state.currentInvoice) startNewInvoice();
  Object.assign(state.currentInvoice, {
    invoiceNumber: $("invoiceNumber").value.trim(),
    date: $("invoiceDate").value,
    notes: $("invoiceNotes").value.trim(),
    status: $("invoiceStatus").value
  });
  calculateInvoiceTotals();
}

function renderInvoiceBuilder() {
  if (!state.currentInvoice) state.currentInvoice = blankInvoice();
  const invoice = state.currentInvoice;
  $("invoiceNumber").value = invoice.invoiceNumber || nextInvoiceNumber();
  $("invoiceDate").value = invoice.date || today();
  $("invoiceNotes").value = invoice.notes || "";
  $("invoiceStatus").value = invoice.status || "unpaid";
  renderCustomerSelect();
  $("selectedCustomerCard").innerHTML = invoice.customerId ? `
    <strong>${escapeHtml(invoice.customerName)}</strong>
    <p>${escapeHtml(invoice.customerPhone || "No phone")}</p>
    <p>${escapeHtml(invoice.customerEmail || "No email")}</p>
    <p>${escapeHtml(invoice.customerAddress || "No address")}</p>` : "No customer selected.";
  renderLineItems();
  renderServicePicker();
}

function renderServicePicker() {
  const picker = $("servicePicker");
  if (!picker) return;
  picker.innerHTML = state.services.length ? state.services.map((service) => `
    <button class="service-pick-btn" onclick="addServiceToInvoice('${service.id}')">
      <strong>${escapeHtml(service.serviceName)}</strong><br>${money(service.defaultPrice)} — ${escapeHtml(service.description || "Tap to add")}
    </button>`).join("") : "No services saved yet.";
}

function addServiceToInvoice(serviceId) {
  if (!state.currentInvoice) startNewInvoice();
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) return;
  const item = {
    id: `item_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    invoiceId: state.currentInvoice.id || "",
    serviceId: service.id,
    serviceName: service.serviceName,
    quantity: 1,
    unitPrice: Number(service.defaultPrice) || 0,
    lineTotal: Number(service.defaultPrice) || 0,
    lineNote: ""
  };
  state.currentInvoice.items.push(item);
  state.generatedPdf = null;
  calculateInvoiceTotals();
  renderLineItems();
  showMessage(`${service.serviceName} added`);
}

function updateLineItem(id, field, value) {
  const item = state.currentInvoice.items.find((line) => line.id === id);
  if (!item) return;
  if (field === "lineNote" || field === "serviceName") {
    item[field] = value;
    state.generatedPdf = null;
    return;
  }
  item[field] = Number(value) || 0;
  item.lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  calculateInvoiceTotals();
  state.generatedPdf = null;
  renderLineItems();
}

function removeLineItem(id) {
  state.currentInvoice.items = state.currentInvoice.items.filter((line) => line.id !== id);
  state.generatedPdf = null;
  calculateInvoiceTotals();
  renderLineItems();
}

function renderLineItems() {
  calculateInvoiceTotals();
  const list = $("lineItemsList");
  if (!state.currentInvoice.items.length) {
    list.className = "line-items empty-state";
    list.innerHTML = "No line items yet. Tap Add Services.";
  } else {
    list.className = "line-items";
    list.innerHTML = state.currentInvoice.items.map((item) => `
      <div class="line-item">
        <div class="line-item-grid">
          <label>Service <input value="${escapeAttribute(item.serviceName)}" onchange="updateLineItem('${item.id}', 'serviceName', this.value)"></label>
          <label>Qty <input type="number" min="0" step="1" value="${item.quantity}" onchange="updateLineItem('${item.id}', 'quantity', this.value)"></label>
          <label>Price <input type="number" min="0" step="0.01" value="${item.unitPrice}" onchange="updateLineItem('${item.id}', 'unitPrice', this.value)"></label>
        </div>
        <label class="line-note-label">Line Note
          <textarea rows="2" placeholder="Optional note for this service, such as truck numbers or details" oninput="updateLineItem('${item.id}', 'lineNote', this.value)">${escapeHtml(item.lineNote || "")}</textarea>
        </label>
        <div class="line-total">Line total: ${money(item.lineTotal)}</div>
        <button class="danger-btn" onclick="removeLineItem('${item.id}')">Remove Line Item</button>
      </div>`).join("");
  }
  $("invoiceTotal").textContent = money(state.currentInvoice.total);
}

function calculateInvoiceTotals() {
  if (!state.currentInvoice) return;
  state.currentInvoice.items = state.currentInvoice.items.map((item) => typeof normalizeInvoiceItem === "function" ? normalizeInvoiceItem(item) : { ...item, lineNote: item.lineNote || "" });
  state.currentInvoice.items.forEach((item) => item.lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
  state.currentInvoice.subtotal = state.currentInvoice.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  state.currentInvoice.total = state.currentInvoice.subtotal;
}

async function saveInvoice() {
  updateCurrentInvoiceFromFields();
  const invoice = state.currentInvoice;
  if (!invoice.customerId) return showMessage("Invoice must have a customer before saving", true);
  if (!invoice.items.length) return showMessage("Invoice must have at least one line item before saving", true);
  if (!invoice.invoiceNumber) invoice.invoiceNumber = nextInvoiceNumber();
  const result = await apiSaveInvoice(invoice);
  showMessage(result.ok ? "Invoice saved" : result.error, !result.ok);
  if (result.ok) state.currentInvoice = result.data;
  await loadAll();
}

function invoiceCard(invoice) {
  return `<div class="list-item">
    <h4>Invoice #${escapeHtml(invoice.invoiceNumber)} — ${money(invoice.total)}</h4>
    <p>${escapeHtml(invoice.customerName || "No customer")} • ${escapeHtml(invoice.date || "No date")} • ${escapeHtml(invoice.status || "unpaid")}</p>
    <div class="item-actions"><button class="primary-btn" onclick="loadInvoice('${invoice.id}')">Open</button><button class="secondary-btn" onclick="loadInvoiceSend('${invoice.id}')">Send</button></div>
  </div>`;
}

function renderInvoices() {
  $("invoicesList").innerHTML = state.invoices.length ? [...state.invoices].reverse().map(invoiceCard).join("") : "No invoices saved yet.";
}

function loadInvoice(id) {
  const invoice = state.invoices.find((item) => item.id === id);
  if (!invoice) return;
  state.currentInvoice = typeof normalizeInvoice === "function" ? normalizeInvoice(JSON.parse(JSON.stringify(invoice))) : JSON.parse(JSON.stringify(invoice));
  state.generatedPdf = null;
  renderInvoiceBuilder();
  switchTab("invoicesTab");
}

function loadInvoiceSend(id) {
  loadInvoice(id);
  switchTab("sendTab");
}

function makePdf() {
  updateCurrentInvoiceFromFields();
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showMessage("PDF library did not load. Check your internet connection.", true);
    return null;
  }
  const invoice = state.currentInvoice;
  const doc = new window.jspdf.jsPDF();
  let y = 18;
  doc.setFontSize(20); doc.text(APP_CONFIG.COMPANY_NAME, 14, y);
  y += 10; doc.setFontSize(12); doc.text(`Invoice #${invoice.invoiceNumber || "Draft"}`, 14, y);
  y += 7; doc.text(`Date: ${invoice.date || today()}`, 14, y);
  y += 7; doc.text(`Status: ${(invoice.status || "unpaid").toUpperCase()}`, 14, y);
  y += 12; doc.setFontSize(14); doc.text("Bill To", 14, y);
  doc.setFontSize(11);
  [invoice.customerName, invoice.customerPhone, invoice.customerEmail, invoice.customerAddress].filter(Boolean).forEach((line) => { y += 6; doc.text(String(line), 14, y); });
  y += 12; doc.setFontSize(14); doc.text("Services", 14, y);
  y += 7; doc.setFontSize(10); doc.text("Service", 14, y); doc.text("Qty", 112, y); doc.text("Unit", 135, y); doc.text("Total", 165, y);
  y += 2; doc.line(14, y, 196, y);
  const ensurePdfSpace = (needed = 8) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 18;
    }
  };
  invoice.items.forEach((item) => {
    const lineNote = String(item.lineNote || "").trim();
    const noteLines = lineNote ? doc.splitTextToSize(`Note: ${lineNote}`, 92) : [];
    ensurePdfSpace(10 + (noteLines.length * 5));
    y += 8;
    doc.text(String(item.serviceName || "").slice(0, 45), 14, y);
    doc.text(String(item.quantity), 114, y);
    doc.text(money(item.unitPrice), 135, y);
    doc.text(money(item.lineTotal), 165, y);
    if (noteLines.length) {
      y += 5;
      doc.setTextColor(90);
      doc.text(noteLines, 14, y);
      doc.setTextColor(0);
      y += (noteLines.length - 1) * 5;
    }
  });
  ensurePdfSpace(18);
  y += 10; doc.line(120, y, 196, y);
  y += 8; doc.setFontSize(14); doc.text(`Invoice Total: ${money(invoice.total)}`, 120, y);
  if (invoice.notes) {
    const invoiceNoteLines = doc.splitTextToSize(invoice.notes, 180);
    ensurePdfSpace(20 + (invoiceNoteLines.length * 5));
    y += 14; doc.setFontSize(12); doc.text("Notes", 14, y);
    y += 6; doc.setFontSize(10); doc.text(invoiceNoteLines, 14, y);
  }
  state.generatedPdf = doc;
  showMessage("PDF generated");
  return doc;
}

function pdfFilename() {
  return `MAC-Invoice-${state.currentInvoice?.invoiceNumber || "Draft"}.pdf`;
}

function downloadPdf() {
  const doc = state.generatedPdf || makePdf();
  if (doc) doc.save(pdfFilename());
}

function pdfToBase64(doc) {
  return doc.output("datauristring").split(",")[1];
}

async function sendEmail() {
  updateCurrentInvoiceFromFields();
  if (!state.currentInvoice.customerEmail) return showMessage("Email required before sending email", true);
  const doc = makePdf();
  if (!doc) return;
  const result = await apiSendInvoiceEmail(state.currentInvoice, pdfToBase64(doc), pdfFilename());
  showMessage(result.ok ? "Email sent" : `Email failed: ${result.error}`, !result.ok);
  if (result.ok) {
    state.currentInvoice.emailSentAt = new Date().toISOString();
    await apiSaveInvoice(state.currentInvoice);
    await loadAll();
  }
}

function hasInvoiceContent(invoice) {
  return Boolean(invoice && (invoice.id || invoice.customerId || (invoice.items && invoice.items.length) || invoice.notes));
}

function renderSendTab() {
  const invoice = state.currentInvoice;
  $("sendInvoiceSummary").innerHTML = hasInvoiceContent(invoice) ? `
    <strong>Invoice #${escapeHtml(invoice.invoiceNumber || "Draft")}</strong>
    <p>${escapeHtml(invoice.customerName || "No customer")} • ${money(invoice.total || 0)}</p>
    <p>${escapeHtml(invoice.customerEmail || "No email")} • ${escapeHtml(invoice.status || "unpaid")}</p>` : "No current invoice selected.";
}

async function updateInvoiceStatus(status) {
  if (!state.currentInvoice?.id) return showMessage("Save or open an invoice before changing status", true);
  const result = await apiUpdateInvoiceStatus(state.currentInvoice.id, status);
  showMessage(result.ok ? `Marked ${status}` : result.error, !result.ok);
  if (result.ok) state.currentInvoice = result.data;
  await loadAll();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $("homeCreateInvoiceBtn").addEventListener("click", startNewInvoice);
  $("newInvoiceBtn").addEventListener("click", startNewInvoice);
  $("saveCustomerBtn").addEventListener("click", saveCustomer);
  $("clearCustomerBtn").addEventListener("click", clearCustomerForm);
  $("customerSearch").addEventListener("input", renderCustomers);
  $("saveServiceBtn").addEventListener("click", saveService);
  $("clearServiceBtn").addEventListener("click", clearServiceForm);
  $("invoiceCustomerSelect").addEventListener("change", (event) => { applyCustomerToInvoice(event.target.value); renderInvoiceBuilder(); });
  $("toggleServicePickerBtn").addEventListener("click", () => $("servicePicker").classList.toggle("hidden"));
  $("saveInvoiceBtn").addEventListener("click", saveInvoice);
  $("invoiceGeneratePdfBtn").addEventListener("click", makePdf);
  $("invoiceSendEmailBtn").addEventListener("click", sendEmail);
  $("sendGeneratePdfBtn").addEventListener("click", makePdf);
  $("downloadPdfBtn").addEventListener("click", downloadPdf);
  $("sendEmailBtn").addEventListener("click", sendEmail);
  $("markPaidBtn").addEventListener("click", () => updateInvoiceStatus("paid"));
  $("markUnpaidBtn").addEventListener("click", () => updateInvoiceStatus("unpaid"));
  ["invoiceNumber", "invoiceDate", "invoiceNotes", "invoiceStatus"].forEach((id) => $(id).addEventListener("input", updateCurrentInvoiceFromFields));
}

document.addEventListener("DOMContentLoaded", async () => {
  setStorageStatus();
  bindEvents();
  await loadAll();
});
