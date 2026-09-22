// Quote UI and PDF generation are isolated from the invoice workflow.
let quotesReady = false;
let quoteBusy = false;
let quoteEmailRequest = null;
function blankQuote() { return normalizeQuote({ date: today(), items: [] }); }
function quoteChanged() { state.generatedQuotePdf = null; quoteEmailRequest = null; }
function startNewQuote() {
  if (quoteBusy) return;
  state.currentQuote = blankQuote(); quoteChanged(); renderQuoteBuilder(); switchTab("quotesTab");
}
async function loadQuotes() {
  quotesReady = false;
  $("quoteFields").disabled = true;
  $("quoteAvailability").textContent = "Loading quotes...";
  const result = await apiGetQuotes();
  quotesReady = result.ok;
  $("quoteFields").disabled = !quotesReady;
  $("retryQuotesBtn").classList.toggle("hidden", quotesReady);
  $("quoteAvailability").textContent = result.ok ? "" : `Quotes unavailable: ${result.error}. If the backend has not been updated, deploy the new Apps Script version, then retry.`;
  if (result.ok) state.quotes = result.data;
  renderQuotes(); renderQuoteBuilder();
}
function renderQuoteBuilder() {
  if (!state.currentQuote) state.currentQuote = blankQuote();
  const q = state.currentQuote;
  $("quoteDate").value = String(q.date || today()).slice(0, 10);
  $("quoteNotes").value = q.notes;
  $("quoteCustomerSelect").innerHTML = '<option value="">Choose customer...</option>' + state.customers.map(c => `<option value="${escapeAttribute(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  if (q.customerId && !state.customers.some(c => c.id === q.customerId)) $("quoteCustomerSelect").add(new Option(q.customerName + " (saved customer)", q.customerId));
  $("quoteCustomerSelect").value = q.customerId;
  $("quoteCustomerCard").innerHTML = q.customerId ? `<strong>${escapeHtml(q.customerName)}</strong><p>${escapeHtml(q.customerPhone || "No phone")}</p><p>${escapeHtml(q.customerEmail || "No email")}</p><p>${escapeHtml(q.customerAddress || "No address")}</p>` : "No customer selected.";
  $("quoteServicePicker").innerHTML = state.services.map(s => `<button class="service-pick-btn" data-service="${escapeAttribute(s.id)}"><strong>${escapeHtml(s.serviceName)}</strong><br>${money(s.defaultPrice)} — ${escapeHtml(s.description)}</button>`).join("") || "No services saved yet.";
  renderQuoteItems();
}
function renderQuoteItems() {
  const q = state.currentQuote;
  $("quoteLineItems").innerHTML = q.items.map((item, index) => `
    <div class="line-item" data-line="${index}"><div class="line-item-grid">
      <label>Service <input data-field="serviceName" value="${escapeAttribute(item.serviceName)}"></label>
      <label>Qty <input data-field="quantity" type="number" min="0" step="1" value="${item.quantity}"></label>
      <label>Price <input data-field="unitPrice" type="number" min="0" step="0.01" value="${item.unitPrice}"></label>
    </div><label>Line Note <textarea data-field="lineNote" rows="2">${escapeHtml(item.lineNote)}</textarea></label>
    <div class="line-total">Line total: ${money(item.lineTotal)}</div><button class="danger-btn" data-remove="${index}">Remove Line Item</button></div>`).join("") || "No line items yet. Tap Add Services.";
  $("quoteTotal").textContent = money(q.total);
}
function renderQuotes() {
  const card = q => `<div class="list-item"><div class="invoice-card-heading"><h4>${escapeHtml(q.customerName)} — ${money(q.total)}</h4>
    <span class="sent-badge ${q.emailSentAt ? "sent" : "not-sent"}">${q.emailSentAt ? escapeHtml("Sent " + formatDateTime(q.emailSentAt)) : "Not sent"}</span></div>
    <p>${escapeHtml(String(q.date).slice(0, 10))}</p>${q.archivedAt ? `<p>Archived ${escapeHtml(formatDateTime(q.archivedAt))}</p>` : ""}
    <div class="item-actions"><button class="primary-btn" data-quote="${escapeAttribute(q.id)}" data-action="open">${q.archivedAt ? "Open" : "Open/Edit"}</button>
    <button class="secondary-btn" data-quote="${escapeAttribute(q.id)}" data-action="${q.archivedAt ? "restore" : "archive"}">${q.archivedAt ? "Restore" : "Archive"}</button>
    ${q.archivedAt ? `<button class="danger-btn" data-quote="${escapeAttribute(q.id)}" data-action="delete">Delete Permanently</button>` : ""}</div></div>`;
  const sorted = [...state.quotes].sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  $("quotesList").innerHTML = quotesReady ? sorted.filter(q => !q.archivedAt).map(card).join("") || "No active quotes saved yet." : "Quotes have not loaded.";
  $("quoteArchiveList").innerHTML = quotesReady ? sorted.filter(q => q.archivedAt).map(card).join("") || "No archived quotes." : "Quotes have not loaded. Open Quotes to retry.";
}
function loadQuote(id) {
  if (quoteBusy) return;
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;
  state.currentQuote = normalizeQuote(JSON.parse(JSON.stringify(q)));
  quoteChanged(); renderQuoteBuilder(); switchTab("quotesTab");
}
async function withQuoteBusy(button, label, action) {
  if (quoteBusy || !quotesReady) return;
  quoteBusy = true;
  $("quoteFields").disabled = true; $("newQuoteBtn").disabled = true;
  try { return await withButtonLoading(button, label, action); }
  catch (error) { console.error("Quote operation failed", error); showMessage(error.message, true); }
  finally { quoteBusy = false; $("quoteFields").disabled = !quotesReady; $("newQuoteBtn").disabled = false; }
}
function acceptSavedQuote(q) {
  state.currentQuote = normalizeQuote(q);
  upsertById(state.quotes, JSON.parse(JSON.stringify(state.currentQuote)));
  renderQuotes(); renderQuoteBuilder();
}
async function persistCurrentQuote() {
  state.currentQuote = normalizeQuote(state.currentQuote);
  validateQuote(state.currentQuote);
  // Stable ID makes retry after a lost response an update, not a second record.
  if (!state.currentQuote.id) state.currentQuote.id = apiId("quote");
  const result = await apiSaveQuote(state.currentQuote);
  if (!result.ok) throw new Error(result.error);
  acceptSavedQuote(result.data);
  return state.currentQuote;
}
async function saveQuote(button) {
  return withQuoteBusy(button, "Saving...", async () => { await persistCurrentQuote(); showMessage("Quote saved"); });
}
async function setQuoteArchived(id, archived, button) {
  return withQuoteBusy(button, archived ? "Archiving..." : "Restoring...", async () => {
    const quote = state.quotes.find(q => q.id === id);
    const result = await apiSaveQuote({ ...quote, archivedAt: archived ? apiNow() : "" });
    if (!result.ok) throw new Error(result.error);
    upsertById(state.quotes, result.data);
    if (state.currentQuote.id === id) acceptSavedQuote(result.data);
    renderQuotes(); showMessage(archived ? "Quote archived" : "Quote restored");
  });
}
async function deleteQuote(id, button) {
  return withQuoteBusy(button, "Deleting...", async () => {
    if (!confirm("Permanently delete this quote? This cannot be undone.")) return;
    const result = await apiDeleteQuote(id);
    if (!result.ok) throw new Error(result.error);
    removeById(state.quotes, id);
    if (state.currentQuote.id === id) { state.currentQuote = blankQuote(); quoteChanged(); renderQuoteBuilder(); }
    renderQuotes(); showMessage("Quote permanently deleted");
  });
}
function quotePdfFilename(quote = state.currentQuote) {
  const name = String(quote.customerName || "").normalize("NFKD").replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-").slice(0, 70);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(quote.date) ? quote.date : today();
  return `MAC-Quote-${date}${name ? "-" + name : ""}.pdf`;
}
async function sendQuoteEmail(button) {
  return withQuoteBusy(button, "Sending...", async () => {
    if (!state.currentQuote.customerEmail.trim()) throw new Error("Customer email is required before sending a quote. Update the customer and select them again.");
    if (!apiUsesBackend()) throw new Error("Email requires the Google Apps Script backend. Save or download your quote locally.");
    await persistCurrentQuote();
    const doc = await makeQuotePdf();
    if (!doc) return;
    quoteEmailRequest = quoteEmailRequest || apiId("quoteemail");
    const result = await apiSendQuoteEmail(state.currentQuote, pdfToBase64(doc), quotePdfFilename(), quoteEmailRequest);
    if (!result.ok) throw new Error(result.error);
    acceptSavedQuote(result.data.quote);
    quoteEmailRequest = null;
    console.info("Quote email sent"); showMessage("Quote email sent");
  });
}
document.addEventListener("DOMContentLoaded", () => {
  $("newQuoteBtn").addEventListener("click", startNewQuote);
  $("retryQuotesBtn").addEventListener("click", loadQuotes);
  document.querySelectorAll('[data-tab="quotesTab"]').forEach(btn => btn.addEventListener("click", renderQuoteBuilder));
  $("quoteDate").addEventListener("input", e => { state.currentQuote.date = e.target.value; quoteChanged(); });
  $("quoteNotes").addEventListener("input", e => { state.currentQuote.notes = e.target.value; quoteChanged(); });
  $("quoteCustomerSelect").addEventListener("change", e => {
    const c = state.customers.find(c => c.id === e.target.value) || {};
    Object.assign(state.currentQuote, { customerId: c.id || "", customerName: c.name || "", customerPhone: c.phone || "", customerEmail: c.email || "", customerAddress: c.address || "" });
    quoteChanged(); renderQuoteBuilder();
  });
  $("quoteAddServicesBtn").addEventListener("click", () => { renderQuoteBuilder(); $("quoteServicePicker").classList.toggle("hidden"); });
  $("quoteServicePicker").addEventListener("click", e => {
    const s = state.services.find(s => s.id === e.target.closest("[data-service]")?.dataset.service);
    if (!s || quoteBusy) return;
    state.currentQuote.items.push({ serviceId: s.id, serviceName: s.serviceName, quantity: 1, unitPrice: s.defaultPrice, lineNote: "" });
    state.currentQuote = normalizeQuote(state.currentQuote);
    quoteChanged(); renderQuoteItems();
  });
  $("quoteLineItems").addEventListener("input", e => {
    const field = e.target.dataset.field;
    if (!field || quoteBusy) return;
    const item = state.currentQuote.items[Number(e.target.closest("[data-line]").dataset.line)];
    item[field] = ["quantity", "unitPrice"].includes(field) ? Number(e.target.value) : e.target.value;
    item.lineTotal = Number(item.quantity) * Number(item.unitPrice);
    state.currentQuote.total = state.currentQuote.subtotal = state.currentQuote.items.reduce((sum, i) => sum + i.lineTotal, 0);
    e.target.closest("[data-line]").querySelector(".line-total").textContent = `Line total: ${money(item.lineTotal)}`;
    $("quoteTotal").textContent = money(state.currentQuote.total);
    quoteChanged();
  });
  $("quoteLineItems").addEventListener("click", e => {
    const button = e.target.closest("[data-remove]");
    if (!button || quoteBusy) return;
    state.currentQuote.items.splice(Number(button.dataset.remove), 1);
    state.currentQuote = normalizeQuote(state.currentQuote);
    quoteChanged(); renderQuoteItems();
  });
  ["quotesList", "quoteArchiveList"].forEach(id => $(id).addEventListener("click", e => {
    const b = e.target.closest("[data-action]");
    if (!b || quoteBusy) return;
    const id = b.dataset.quote;
    if (b.dataset.action === "open") loadQuote(id);
    else if (b.dataset.action === "delete") deleteQuote(id, b);
    else setQuoteArchived(id, b.dataset.action === "archive", b);
  }));
  $("saveQuoteBtn").addEventListener("click", e => saveQuote(e.currentTarget));
  $("quoteEmailBtn").addEventListener("click", e => sendQuoteEmail(e.currentTarget));
  $("quotePdfBtn").addEventListener("click", e => withQuoteBusy(e.currentTarget, "Generating...", async () => {
    validateQuote(state.currentQuote);
    const doc = await makeQuotePdf();
    if (doc) doc.save(quotePdfFilename());
  }));
  renderQuoteBuilder(); loadQuotes();
});

// Independent renderer based on the unchanged invoice PDF design.
async function makeQuotePdf(button = null) {
  if (button?.disabled) return null;

  const action = async () => {
    state.currentQuote = normalizeQuote(state.currentQuote);
    validateQuote(state.currentQuote);

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showMessage("PDF library did not load. Check your internet connection.", true);
      return null;
    }

    const quote = state.currentQuote;
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
        if (nextY > pageHeight - 23) { doc.addPage(); nextY = 18; }
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
        console.warn("Quote logo could not be added to PDF", error);
      }
    }

    y += 17;
    doc.setFontSize(12);

    const labelX = margin;
    const valueX = 48;
    const rowGap = 8;

    doc.setFont("helvetica", "bold");
    doc.text("Quote", labelX, y);

    y += rowGap;
    doc.setFont("helvetica", "bold");
    doc.text("Date:", labelX, y);
    doc.setFont("helvetica", "normal");
    doc.text(quote.date || today(), valueX, y);

    y = 73;
    doc.setDrawColor(...lightBorder);
    doc.setLineWidth(0.35);
    doc.line(margin, y, rightEdge, y);

    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    const customerLines = [
      quote.customerName,
      quote.customerPhone,
      quote.customerEmail,
      quote.customerAddress
    ].map(safeText).filter(Boolean).flatMap(line => doc.splitTextToSize(line, rightEdge - margin));

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

    ensurePdfSpace(headerHeight + rowHeight);
    drawTableHeader();

    const items = Array.isArray(quote.items) ? quote.items : [];

    if (!items.length) {
      doc.setDrawColor(...lightBorder);
      doc.rect(tableLeft, y, tableRight - tableLeft, rowHeight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("No line items added.", serviceX, y + 11);
      y += rowHeight;
    }

    items.forEach((item) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const serviceLines = doc.splitTextToSize(safeText(item.serviceName), 84);
      doc.setFontSize(9);
      const noteLines = item.lineNote ? doc.splitTextToSize(`Note: ${safeText(item.lineNote)}`, 84) : [];
      const lines = serviceLines.map(text => ({text, note: false})).concat(noteLines.map(text => ({text, note: true})));
      if (!lines.length) lines.push({text: "", note: false});
      let first = true;
      while (lines.length) {
        if (y + rowHeight > pageHeight - 38) { doc.addPage(); y = 18; drawTableHeader(); }
        const capacity = Math.max(1, Math.floor((pageHeight - 38 - y - 12) / 5));
        const chunk = lines.splice(0, capacity);
        const height = Math.max(rowHeight, 12 + chunk.length * 5);
        doc.setDrawColor(...lightBorder);
        doc.rect(tableLeft, y, tableRight - tableLeft, height);
        chunk.forEach((line, index) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(line.note ? 9 : 11);
          doc.setTextColor(...(line.note ? [95,95,95] : textColor));
          doc.text(line.text, serviceX, y + 10 + index * 5);
        });
        if (first) {
          doc.setTextColor(...textColor);
          const number = (text, x, width, align) => {
            doc.setFontSize(11);
            const size = Math.min(11, 11 * width / Math.max(doc.getTextWidth(text), width));
            doc.setFontSize(size);
            doc.text(text, x, y + 10, {align});
          };
          number(String(item.quantity), qtyX, 20, "center");
          number(money(item.unitPrice), unitX, 31, "center");
          number(money(item.lineTotal), totalX, 31, "right");
        }
        first = false;
        y += height;
      }
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
    doc.text("Quote Total:", pageWidth - 58, y, { align: "right" });
    doc.setTextColor(...green);
    doc.setFontSize(22);
    doc.setFontSize(Math.min(22, 22 * 39 / Math.max(39, doc.getTextWidth(money(quote.total)))));
    doc.text(money(quote.total), rightEdge, y, { align: "right" });
    doc.setTextColor(...textColor);

    if (quote.notes) {
      ensurePdfSpace(30);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Notes:", margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(quote.notes, tableRight - tableLeft);
      lines.forEach(line => { ensurePdfSpace(6); doc.text(line, margin, y); y += 5; });
    }

    drawFooter();
    state.generatedQuotePdf = doc;
    showMessage("PDF generated");

    return doc;
  };

  if (!button) return action();

  return withButtonLoading(button, "Generating...", action);
}

