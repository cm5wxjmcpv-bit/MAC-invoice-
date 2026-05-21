const state = {
  customers: [],
  services: [],
  invoices: [],
  currentInvoice: null,
  generatedPdf: null,
  homeStatusFilter: "unpaid",
  logoDataUrl: null,
  logoLoadPromise: null
};

const INVOICE_LOGO_URL = "mac-industries-logo-transparent.png";

const $ = (id) => document.getElementById(id);
const money = (value) => `$${(Number(value) || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function invoiceSentText(invoice) {
  return invoice?.emailSentAt ? `Sent ${formatDateTime(invoice.emailSentAt)}` : "Not sent";
}

function invoiceSentClass(invoice) {
  return invoice?.emailSentAt ? "sent-badge sent" : "sent-badge not-sent";
}

function isInvoiceArchived(invoice) {
  return Boolean(invoice?.archivedAt);
}

function invoiceStatusClass(invoice) {
  return `status-badge ${(invoice?.status === "paid") ? "paid" : "unpaid"}`;
}

function invoiceStatusText(invoice) {
  return (invoice?.status === "paid") ? "Paid" : "Unpaid";
}

function sortedInvoices(invoices) {
  return [...invoices].sort((a, b) => String(b.updatedAt || b.date || "").localeCompare(String(a.updatedAt || a.date || "")));
}

function loadInvoiceLogoDataUrl() {
  if (state.logoDataUrl) return Promise.resolve(state.logoDataUrl);
  if (state.logoLoadPromise) return state.logoLoadPromise;

  state.logoLoadPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);

      state.logoDataUrl = canvas.toDataURL("image/png");
      resolve(state.logoDataUrl);
    };
    image.onerror = () => resolve(null);
    image.src = INVOICE_LOGO_URL;
  });

  return state.logoLoadPromise;
}

function showMessage(message, isError = false) {
  const box = $("messageBox");
  box.textContent = message;
  box.className = `message-box show${isError ? " error" : ""}`;
  setTimeout(() => box.className = "message-box", 3600);
}

function setButtonLoading(button, isLoading, loadingText = "Loading...") {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }

    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = loadingText;
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");

  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

async function withButtonLoading(button, loadingText, action) {
  if (button?.disabled) return;

  setButtonLoading(button, true, loadingText);

  try {
    return await Promise.resolve(action());
  } finally {
    setButtonLoading(button, false);
  }
}

function setStorageStatus() {
  $("storageStatus").textContent = apiUsesBackend() ? "Google Sheets backend" : "Local storage mode";

  if (!apiUsesBackend()) {
    showMessage("Backend not configured, using local storage");
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach((tab) => {
    tab.classList.toggle("active", tab.id === tabId);
  });

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  if (tabId === "sendTab") renderSendTab();
}

async function loadAll() {
  const allData = await apiGetAllData();

  if (allData.ok) {
    state.customers = Array.isArray(allData.data.customers) ? allData.data.customers : [];
    state.services = Array.isArray(allData.data.services) ? allData.data.services : [];
    state.invoices = Array.isArray(allData.data.invoices) ? allData.data.invoices : [];
    renderAll();
    return;
  }

  showMessage(allData.error || "Full data load failed, retrying with individual calls", true);

  const [customers, services, invoices] = await Promise.all([
    apiGetCustomers(),
    apiGetServices(),
    apiGetInvoices()
  ]);

  if (!customers.ok) showMessage(customers.error, true);
  if (!services.ok) showMessage(services.error, true);
  if (!invoices.ok) showMessage(invoices.error, true);

  state.customers = customers.ok ? customers.data : [];
  state.services = services.ok ? services.data : [];
  state.invoices = invoices.ok ? invoices.data : [];

  renderAll();
}

function upsertById(array, item) {
  if (!item?.id || !Array.isArray(array)) return false;

  const index = array.findIndex((entry) => entry.id === item.id);

  if (index >= 0) {
    array[index] = item;
  } else {
    array.push(item);
  }

  return true;
}

function removeById(array, id) {
  if (!id || !Array.isArray(array)) return false;

  const before = array.length;
  const filtered = array.filter((entry) => entry.id !== id);

  array.length = 0;
  array.push(...filtered);

  return filtered.length !== before;
}

function renderAll() {
  renderCustomers();
  renderServices();
  renderCustomerSelect();
  renderInvoices();
  renderArchive();
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
    status: "unpaid",
    emailSentAt: "",
    archivedAt: ""
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
  const numbers = state.invoices
    .map((invoice) => parseInt(invoice.invoiceNumber, 10))
    .filter(Boolean);

  return String(numbers.length ? Math.max(...numbers) + 1 : 1001);
}

function renderHome() {
  const activeInvoices = state.invoices.filter((invoice) => !isInvoiceArchived(invoice));
  const paidInvoices = activeInvoices.filter((invoice) => invoice.status === "paid");
  const unpaidInvoices = activeInvoices.filter((invoice) => invoice.status !== "paid");

  const paid = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const unpaid = unpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);

  $("paidTotal").textContent = `${money(paid)} (${paidInvoices.length})`;
  $("unpaidTotal").textContent = `${money(unpaid)} (${unpaidInvoices.length})`;

  document.querySelectorAll("[data-home-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.homeFilter === state.homeStatusFilter);
  });

  const selectedInvoices = state.homeStatusFilter === "paid" ? paidInvoices : unpaidInvoices;
  const title = state.homeStatusFilter === "paid" ? "Paid invoices" : "Unpaid invoices";

  $("homeInvoiceListTitle").textContent = title;
  $("homeInvoiceCount").textContent = `${selectedInvoices.length} invoice${selectedInvoices.length === 1 ? "" : "s"}`;
  $("recentInvoicesList").innerHTML = selectedInvoices.length
    ? sortedInvoices(selectedInvoices).map(invoiceCard).join("")
    : `No ${state.homeStatusFilter} invoices.`;
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

async function saveCustomer(button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Saving...", async () => {
    const customer = customerFromForm();

    if (!customer.name) {
      return showMessage("Customer name required", true);
    }

    const result = await apiSaveCustomer(customer);
    showMessage(result.ok ? "Saved" : result.error, !result.ok);

    if (result.ok && upsertById(state.customers, result.data)) {
      clearCustomerForm();
      renderCustomers();
      renderCustomerSelect();
      renderInvoiceBuilder();
    } else if (result.ok) {
      await loadAll();
    }
  });
}

function clearCustomerForm() {
  ["customerId", "customerName", "customerPhone", "customerEmail", "customerAddress", "customerNotes"].forEach((id) => {
    $(id).value = "";
  });
}

function editCustomer(id, button = null) {
  if (button?.disabled) return;

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

async function deleteCustomer(id, button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Deleting...", async () => {
    if (!confirm("Delete this customer?")) return;

    const result = await apiDeleteCustomer(id);
    showMessage(result.ok ? "Deleted" : result.error, !result.ok);

    if (result.ok) {
      removeById(state.customers, id);

      if (state.currentInvoice?.customerId === id) {
        state.currentInvoice.customerId = "";
        state.currentInvoice.customerName = "";
        state.currentInvoice.customerPhone = "";
        state.currentInvoice.customerEmail = "";
        state.currentInvoice.customerAddress = "";
      }

      renderCustomers();
      renderCustomerSelect();
      renderInvoiceBuilder();
      renderSendTab();
    } else {
      await loadAll();
    }
  });
}

function selectCustomerForInvoice(id, button = null) {
  if (button?.disabled) return;

  const action = () => {
    if (!state.currentInvoice) startNewInvoice();

    applyCustomerToInvoice(id);
    renderInvoiceBuilder();
    switchTab("invoicesTab");
    showMessage("Customer selected for invoice");
  };

  if (!button) return action();

  return withButtonLoading(button, "Loading...", action);
}

function renderCustomers() {
  const term = $("customerSearch").value.toLowerCase();

  const filtered = state.customers.filter((customer) => {
    return [customer.name, customer.phone, customer.email, customer.address]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  $("customersList").innerHTML = filtered.length ? filtered.map((customer) => `
    <div class="list-item">
      <h4>${escapeHtml(customer.name)}</h4>
      <p>${escapeHtml(customer.phone || "No phone")} • ${escapeHtml(customer.email || "No email")}</p>
      <p>${escapeHtml(customer.address || "No address")}</p>
      <div class="item-actions three">
        <button class="primary-btn" onclick="selectCustomerForInvoice('${customer.id}', this)">Use</button>
        <button class="secondary-btn" onclick="editCustomer('${customer.id}', this)">Edit</button>
        <button class="danger-btn" onclick="deleteCustomer('${customer.id}', this)">Delete</button>
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

async function saveService(button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Saving...", async () => {
    const service = serviceFromForm();

    if (!service.serviceName) {
      return showMessage("Service name required", true);
    }

    if (Number.isNaN(service.defaultPrice)) {
      return showMessage("Service price must be a number", true);
    }

    const result = await apiSaveService(service);
    showMessage(result.ok ? "Saved" : result.error, !result.ok);

    if (result.ok && upsertById(state.services, result.data)) {
      clearServiceForm();
      renderServices();
      renderServicePicker();
    } else if (result.ok) {
      await loadAll();
    }
  });
}

function clearServiceForm() {
  ["serviceId", "serviceName", "servicePrice", "serviceDescription"].forEach((id) => {
    $(id).value = "";
  });
}

function editService(id, button = null) {
  if (button?.disabled) return;

  const service = state.services.find((item) => item.id === id);
  if (!service) return;

  $("serviceId").value = service.id;
  $("serviceName").value = service.serviceName || "";
  $("servicePrice").value = service.defaultPrice || 0;
  $("serviceDescription").value = service.description || "";

  switchTab("servicesTab");
}

async function deleteService(id, button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Deleting...", async () => {
    if (!confirm("Delete this service template?")) return;

    const result = await apiDeleteService(id);
    showMessage(result.ok ? "Deleted" : result.error, !result.ok);

    if (result.ok) {
      removeById(state.services, id);
      renderServices();
      renderServicePicker();
    } else {
      await loadAll();
    }
  });
}

function renderServices() {
  $("servicesList").innerHTML = state.services.length ? state.services.map((service) => `
    <div class="list-item">
      <h4>${escapeHtml(service.serviceName)} — ${money(service.defaultPrice)}</h4>
      <p>${escapeHtml(service.description || "No description")}</p>
      <div class="item-actions three">
        <button class="primary-btn" onclick="addServiceToInvoice('${service.id}', this)">Add to Invoice</button>
        <button class="secondary-btn" onclick="editService('${service.id}', this)">Edit</button>
        <button class="danger-btn" onclick="deleteService('${service.id}', this)">Delete</button>
      </div>
    </div>`).join("") : "No services yet.";

  renderServicePicker();
}

function renderCustomerSelect() {
  const selected = state.currentInvoice?.customerId || "";

  $("invoiceCustomerSelect").innerHTML = `<option value="">Choose customer...</option>` + state.customers.map((customer) => {
    return `<option value="${customer.id}" ${customer.id === selected ? "selected" : ""}>${escapeHtml(customer.name)}</option>`;
  }).join("");
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
    <button class="service-pick-btn" onclick="addServiceToInvoice('${service.id}', this)">
      <strong>${escapeHtml(service.serviceName)}</strong><br>${money(service.defaultPrice)} — ${escapeHtml(service.description || "Tap to add")}
    </button>`).join("") : "No services saved yet.";
}

function addServiceToInvoice(serviceId, button = null) {
  if (button?.disabled) return;

  const action = () => {
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
  };

  if (!button) return action();

  return withButtonLoading(button, "Loading...", action);
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

  state.currentInvoice.items = state.currentInvoice.items.map((item) => {
    return typeof normalizeInvoiceItem === "function"
      ? normalizeInvoiceItem(item)
      : { ...item, lineNote: item.lineNote || "" };
  });

  state.currentInvoice.items.forEach((item) => {
    item.lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  });

  state.currentInvoice.subtotal = state.currentInvoice.items.reduce((sum, item) => {
    return sum + Number(item.lineTotal || 0);
  }, 0);

  state.currentInvoice.total = state.currentInvoice.subtotal;
}

async function saveInvoice(button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Saving...", async () => {
    updateCurrentInvoiceFromFields();

    const invoice = state.currentInvoice;

    if (!invoice.customerId) {
      return showMessage("Invoice must have a customer before saving", true);
    }

    if (!invoice.items.length) {
      return showMessage("Invoice must have at least one line item before saving", true);
    }

    if (!invoice.invoiceNumber) {
      invoice.invoiceNumber = nextInvoiceNumber();
    }

    const result = await apiSaveInvoice(invoice);
    showMessage(result.ok ? "Invoice saved" : result.error, !result.ok);

    if (result.ok) {
      state.currentInvoice = result.data;

      if (!upsertById(state.invoices, result.data)) {
        await loadAll();
        return;
      }

      renderInvoices();
      renderHome();
      renderInvoiceBuilder();
      renderSendTab();
    }
  });
}

function invoiceCard(invoice, options = {}) {
  const archived = isInvoiceArchived(invoice);
  const statusAction = invoice.status === "paid"
    ? `<button class="secondary-btn" onclick="updateInvoiceStatusById('${invoice.id}', 'unpaid', this)">Mark Unpaid</button>`
    : `<button class="primary-btn" onclick="updateInvoiceStatusById('${invoice.id}', 'paid', this)">Mark Paid</button>`;
  const archiveAction = archived
    ? `<button class="secondary-btn" onclick="setInvoiceArchivedById('${invoice.id}', false, this)">Restore</button>`
    : `<button class="secondary-btn" onclick="setInvoiceArchivedById('${invoice.id}', true, this)">Archive</button>`;
  const archiveText = archived ? `<p class="archive-note">Archived ${escapeHtml(formatDateTime(invoice.archivedAt))}</p>` : "";

  return `<div class="list-item">
    <div class="invoice-card-heading">
      <h4>Invoice #${escapeHtml(invoice.invoiceNumber)} — ${money(invoice.total)}</h4>
      <span class="${invoiceSentClass(invoice)}">${escapeHtml(invoiceSentText(invoice))}</span>
    </div>
    <p>${escapeHtml(invoice.customerName || "No customer")} • ${escapeHtml(invoice.date || "No date")} • <span class="${invoiceStatusClass(invoice)}">${invoiceStatusText(invoice)}</span></p>
    ${archiveText}
    <div class="item-actions invoice-actions">
      <button class="primary-btn" onclick="loadInvoice('${invoice.id}', this)">Open</button>
      <button class="secondary-btn" onclick="loadInvoiceSend('${invoice.id}', this)">Send</button>
      ${statusAction}
      ${archiveAction}
    </div>
  </div>`;
}

function renderInvoices() {
  const activeInvoices = state.invoices.filter((invoice) => !isInvoiceArchived(invoice));
  $("invoicesList").innerHTML = activeInvoices.length
    ? sortedInvoices(activeInvoices).map(invoiceCard).join("")
    : "No active invoices saved yet.";
}

function renderArchive() {
  const archivedInvoices = sortedInvoices(state.invoices.filter(isInvoiceArchived));
  const count = archivedInvoices.length;

  if ($("archiveInvoiceCount")) {
    $("archiveInvoiceCount").textContent = `${count} invoice${count === 1 ? "" : "s"}`;
  }

  if ($("archiveInvoicesList")) {
    $("archiveInvoicesList").innerHTML = count
      ? archivedInvoices.map((invoice) => invoiceCard(invoice, { archivedView: true })).join("")
      : "No archived invoices yet.";
  }
}

function loadInvoice(id, button = null) {
  if (button?.disabled) return;

  const action = () => {
    const invoice = state.invoices.find((item) => item.id === id);
    if (!invoice) return;

    state.currentInvoice = typeof normalizeInvoice === "function"
      ? normalizeInvoice(JSON.parse(JSON.stringify(invoice)))
      : JSON.parse(JSON.stringify(invoice));

    state.generatedPdf = null;

    renderInvoiceBuilder();
    switchTab("invoicesTab");
  };

  if (!button) return action();

  return withButtonLoading(button, "Loading...", action);
}

function loadInvoiceSend(id, button = null) {
  if (button?.disabled) return;

  const action = () => {
    loadInvoice(id);
    switchTab("sendTab");
  };

  if (!button) return action();

  return withButtonLoading(button, "Loading...", action);
}

async function makePdf(button = null) {
  if (button?.disabled) return null;

  const action = async () => {
    updateCurrentInvoiceFromFields();

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showMessage("PDF library did not load. Check your internet connection.", true);
      return null;
    }

    const invoice = state.currentInvoice;
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const rightEdge = pageWidth - margin;
    const green = [12, 125, 28];
    const black = [14, 18, 19];
    const lightBorder = [215, 215, 215];
    const textColor = [20, 20, 20];

    const safeText = (value) => String(value || "").trim();
    const drawTextLines = (lines, x, startY, lineHeight = 5.6) => {
      let nextY = startY;
      lines.filter(Boolean).forEach((line) => {
        doc.text(String(line), x, nextY);
        nextY += lineHeight;
      });
      return nextY;
    };

    const ensurePdfSpace = (needed = 10) => {
      if (y + needed > pageHeight - 18) {
        doc.addPage();
        y = 18;
      }
    };

    const drawFooter = () => {
      const pageCount = doc.internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Page ${page} of ${pageCount}`, rightEdge, pageHeight - 9, { align: "right" });
      }
      doc.setTextColor(...textColor);
    };

    let y = 24;
    const logoDataUrl = await loadInvoiceLogoDataUrl();

    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(25);
    doc.text(APP_CONFIG.COMPANY_NAME || "MAC Industries", margin, y);

    if (logoDataUrl) {
      try {
        const logoWidth = 62;
        const logoHeight = 62;
        doc.addImage(logoDataUrl, "PNG", rightEdge - logoWidth, 10, logoWidth, logoHeight, undefined, "FAST");
      } catch (error) {
        console.warn("Invoice logo could not be added to PDF", error);
      }
    }

    y += 17;
    doc.setFontSize(12);

    const labelX = margin;
    const valueX = 48;
    const rowGap = 8;

    doc.setFont("helvetica", "bold");
    doc.text("Invoice #:", labelX, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice # ${invoice.invoiceNumber || "Draft"}`, valueX, y);

    y += rowGap;
    doc.setFont("helvetica", "bold");
    doc.text("Date:", labelX, y);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.date || today(), valueX, y);

    y += rowGap;
    doc.setFont("helvetica", "bold");
    doc.text("Status:", labelX, y);
    doc.setFont("helvetica", "bold");
    doc.text((invoice.status || "unpaid").toUpperCase(), valueX, y);

    y = 73;
    doc.setDrawColor(...lightBorder);
    doc.setLineWidth(0.35);
    doc.line(margin, y, rightEdge, y);

    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Bill To:", margin, y);

    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    const customerLines = [
      invoice.customerName,
      invoice.customerPhone,
      invoice.customerEmail,
      invoice.customerAddress
    ].map(safeText).filter(Boolean);

    y = drawTextLines(customerLines.length ? customerLines : ["No customer selected."], margin, y, 7);

    y += 8;
    const tableLeft = margin;
    const tableRight = rightEdge;
    const serviceX = tableLeft + 4;
    const qtyX = tableLeft + 97;
    const unitX = tableLeft + 128;
    const totalX = tableRight - 8;
    const headerHeight = 15;
    const rowHeight = 18;

    const drawTableHeader = () => {
      doc.setFillColor(...black);
      doc.rect(tableLeft, y, tableRight - tableLeft, headerHeight, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Service", serviceX, y + 10);
      doc.text("Qty", qtyX, y + 10, { align: "center" });
      doc.text("Unit", unitX, y + 10, { align: "center" });
      doc.text("Total", totalX, y + 10, { align: "right" });
      doc.setTextColor(...textColor);
      y += headerHeight;
    };

    drawTableHeader();

    const items = Array.isArray(invoice.items) ? invoice.items : [];

    if (!items.length) {
      doc.setDrawColor(...lightBorder);
      doc.rect(tableLeft, y, tableRight - tableLeft, rowHeight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("No line items added.", serviceX, y + 11);
      y += rowHeight;
    }

    items.forEach((item) => {
      const lineNote = safeText(item.lineNote);
      const noteLines = lineNote ? doc.splitTextToSize(`Note: ${lineNote}`, 92) : [];
      const needed = rowHeight + (noteLines.length ? noteLines.length * 5 + 2 : 0);

      if (y + needed > pageHeight - 38) {
        doc.addPage();
        y = 18;
        drawTableHeader();
      }

      const currentRowHeight = rowHeight + (noteLines.length ? noteLines.length * 5 + 1 : 0);
      doc.setDrawColor(...lightBorder);
      doc.rect(tableLeft, y, tableRight - tableLeft, currentRowHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...textColor);
      doc.text(safeText(item.serviceName).slice(0, 46), serviceX, y + 10);
      doc.text(String(item.quantity || 0), qtyX, y + 10, { align: "center" });
      doc.text(money(item.unitPrice), unitX, y + 10, { align: "center" });
      doc.text(money(item.lineTotal), totalX, y + 10, { align: "right" });

      if (noteLines.length) {
        doc.setFontSize(9);
        doc.setTextColor(95, 95, 95);
        doc.text(noteLines, serviceX, y + 16);
        doc.setTextColor(...textColor);
      }

      y += currentRowHeight;
    });

    ensurePdfSpace(27);
    y += 8;
    const totalBlockLeft = pageWidth - 106;
    doc.setDrawColor(...green);
    doc.setLineWidth(0.45);
    doc.line(totalBlockLeft, y, rightEdge, y);

    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...textColor);
    doc.text("Invoice Total:", pageWidth - 58, y, { align: "right" });
    doc.setTextColor(...green);
    doc.setFontSize(22);
    doc.text(money(invoice.total), rightEdge, y, { align: "right" });
    doc.setTextColor(...textColor);

    if (invoice.notes) {
      const invoiceNoteLines = doc.splitTextToSize(invoice.notes, tableRight - tableLeft);
      ensurePdfSpace(20 + invoiceNoteLines.length * 5);

      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Notes:", margin, y);

      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(invoiceNoteLines, margin, y);
    }

    drawFooter();
    state.generatedPdf = doc;
    showMessage("PDF generated");

    return doc;
  };

  if (!button) return action();

  return withButtonLoading(button, "Generating...", action);
}

function pdfFilename() {
  return `MAC-Invoice-${state.currentInvoice?.invoiceNumber || "Draft"}.pdf`;
}

async function downloadPdf(button = null) {
  if (button?.disabled) return;

  const action = async () => {
    const doc = state.generatedPdf || await makePdf();
    if (doc) doc.save(pdfFilename());
  };

  if (!button) return action();

  return withButtonLoading(button, "Preparing...", action);
}

function pdfToBase64(doc) {
  return doc.output("datauristring").split(",")[1];
}

async function sendEmail(button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Sending...", async () => {
    updateCurrentInvoiceFromFields();

    if (!state.currentInvoice.customerEmail) {
      return showMessage("Email required before sending email", true);
    }

    const doc = await makePdf();
    if (!doc) return;

    const result = await apiSendInvoiceEmail(state.currentInvoice, pdfToBase64(doc), pdfFilename());
    showMessage(result.ok ? "Email sent" : `Email failed: ${result.error}`, !result.ok);

    if (result.ok) {
      const sentInvoice = result.data?.invoice || result.data;

      if (sentInvoice?.id) {
        state.currentInvoice = typeof normalizeInvoice === "function"
          ? normalizeInvoice(sentInvoice)
          : sentInvoice;

        if (!upsertById(state.invoices, state.currentInvoice)) {
          await loadAll();
          return;
        }

        renderInvoices();
        renderHome();
        renderInvoiceBuilder();
        renderSendTab();
        return;
      }

      state.currentInvoice.emailSentAt = result.data?.emailSentAt || new Date().toISOString();

      const saveResult = await apiSaveInvoice(state.currentInvoice);

      if (saveResult.ok) {
        state.currentInvoice = saveResult.data;

        if (!upsertById(state.invoices, saveResult.data)) {
          await loadAll();
          return;
        }

        renderInvoices();
        renderHome();
        renderInvoiceBuilder();
        renderSendTab();
      } else {
        showMessage(saveResult.error, true);
        await loadAll();
      }
    }
  });
}

function hasInvoiceContent(invoice) {
  return Boolean(invoice && (invoice.id || invoice.customerId || (invoice.items && invoice.items.length) || invoice.notes));
}

function renderSendTab() {
  const invoice = state.currentInvoice;

  $("sendInvoiceSummary").innerHTML = hasInvoiceContent(invoice) ? `
    <strong>Invoice #${escapeHtml(invoice.invoiceNumber || "Draft")}</strong>
    <span class="${invoiceSentClass(invoice)}">${escapeHtml(invoiceSentText(invoice))}</span>
    <p>${escapeHtml(invoice.customerName || "No customer")} • ${money(invoice.total || 0)}</p>
    <p>${escapeHtml(invoice.customerEmail || "No email")} • ${escapeHtml(invoice.status || "unpaid")}</p>` : "No current invoice selected.";
}

async function updateInvoiceStatus(status, button = null) {
  if (!state.currentInvoice?.id) {
    return showMessage("Save or open an invoice before changing status", true);
  }

  return updateInvoiceStatusById(state.currentInvoice.id, status, button);
}

async function updateInvoiceStatusById(invoiceId, status, button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, "Updating...", async () => {
    const result = await apiUpdateInvoiceStatus(invoiceId, status);
    showMessage(result.ok ? `Marked ${status}` : result.error, !result.ok);

    if (result.ok) {
      const savedInvoice = result.data;

      if (state.currentInvoice?.id === savedInvoice.id) {
        state.currentInvoice = savedInvoice;
      }

      if (!upsertById(state.invoices, savedInvoice)) {
        await loadAll();
        return;
      }

      renderAll();
    } else {
      await loadAll();
    }
  });
}

async function setInvoiceArchivedById(invoiceId, archived, button = null) {
  if (button?.disabled) return;

  return withButtonLoading(button, archived ? "Archiving..." : "Restoring...", async () => {
    const invoice = state.invoices.find((item) => item.id === invoiceId);

    if (!invoice) {
      return showMessage("Invoice not found", true);
    }

    const updatedInvoice = {
      ...invoice,
      archivedAt: archived ? new Date().toISOString() : ""
    };

    const result = await apiSaveInvoice(updatedInvoice);
    showMessage(result.ok ? (archived ? "Invoice archived" : "Invoice restored") : result.error, !result.ok);

    if (result.ok) {
      const savedInvoice = result.data;

      if (state.currentInvoice?.id === savedInvoice.id) {
        state.currentInvoice = savedInvoice;
      }

      if (!upsertById(state.invoices, savedInvoice)) {
        await loadAll();
        return;
      }

      renderAll();
    } else {
      await loadAll();
    }
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("homeCreateInvoiceBtn").addEventListener("click", startNewInvoice);
  document.querySelectorAll("[data-home-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.homeStatusFilter = button.dataset.homeFilter || "unpaid";
      renderHome();
    });
  });
  $("newInvoiceBtn").addEventListener("click", startNewInvoice);
  $("saveCustomerBtn").addEventListener("click", (event) => saveCustomer(event.currentTarget));
  $("clearCustomerBtn").addEventListener("click", clearCustomerForm);
  $("customerSearch").addEventListener("input", renderCustomers);
  $("saveServiceBtn").addEventListener("click", (event) => saveService(event.currentTarget));
  $("clearServiceBtn").addEventListener("click", clearServiceForm);
  $("invoiceCustomerSelect").addEventListener("change", (event) => {
    applyCustomerToInvoice(event.target.value);
    renderInvoiceBuilder();
  });
  $("toggleServicePickerBtn").addEventListener("click", () => $("servicePicker").classList.toggle("hidden"));
  $("saveInvoiceBtn").addEventListener("click", (event) => saveInvoice(event.currentTarget));
  $("invoiceGeneratePdfBtn").addEventListener("click", (event) => makePdf(event.currentTarget));
  $("invoiceSendEmailBtn").addEventListener("click", (event) => sendEmail(event.currentTarget));
  $("sendGeneratePdfBtn").addEventListener("click", (event) => makePdf(event.currentTarget));
  $("downloadPdfBtn").addEventListener("click", (event) => downloadPdf(event.currentTarget));
  $("sendEmailBtn").addEventListener("click", (event) => sendEmail(event.currentTarget));
  $("markPaidBtn").addEventListener("click", (event) => updateInvoiceStatus("paid", event.currentTarget));
  $("markUnpaidBtn").addEventListener("click", (event) => updateInvoiceStatus("unpaid", event.currentTarget));

  ["invoiceNumber", "invoiceDate", "invoiceNotes", "invoiceStatus"].forEach((id) => {
    $(id).addEventListener("input", updateCurrentInvoiceFromFields);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setStorageStatus();
  bindEvents();
  await loadAll();
});