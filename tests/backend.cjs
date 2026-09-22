const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
function createBackend(source = fs.readFileSync('apps-script-backend.gs', 'utf8')) {
  const sheets = new Map(), emails = [];
  let failMail = false, failItem = false;
  class Sheet {
    constructor() { this.rows = []; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
    getRange(row, col, n = 1, m = 1) {
      return {
        getValues: () => Array.from({length:n}, (_,i) => Array.from({length:m}, (_,j) => this.rows[row-1+i]?.[col-1+j] ?? '')),
        getValue: () => this.rows[row-1]?.[col-1] ?? '',
        setValues: values => values.forEach((r,i) => r.forEach((v,j) => { this.rows[row-1+i] ||= []; this.rows[row-1+i][col-1+j] = v; }))
      };
    }
    getDataRange() { return this.getRange(1,1,this.getLastRow(),this.getLastColumn()); }
    appendRow(row) { if (failItem && this === sheets.get('QuoteItems')) { failItem=false; throw Error('Simulated sheet failure'); } this.rows.push([...row]); }
    deleteRow(row) { this.rows.splice(row-1,1); }
  }
  const spreadsheet = { getSheetByName: n => sheets.get(n), insertSheet: n => { const s = new Sheet(); sheets.set(n,s); return s; }, getSpreadsheetTimeZone: () => 'UTC' };
  const cache = new Map();
  const ctx = vm.createContext({ console, SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet},
    LockService: {getScriptLock: () => ({waitLock(){},releaseLock(){}})},
    CacheService: {getScriptCache: () => ({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    ContentService: {MimeType:{JSON:'json'},createTextOutput: s=>({setMimeType:()=>JSON.parse(s)})},
    Utilities: {base64Decode:b=>Buffer.from(b,'base64'),newBlob:(b,type,name)=>({bytes:b,type,name}),formatDate:d=>d.toISOString().slice(0,10)},
    MailApp: {sendEmail: e=> { if(failMail) throw Error('Simulated mail failure'); emails.push(e); }}
  });
  vm.runInContext(source, ctx);
  const call = (action,payload={}) => ctx.doPost({postData:{contents:JSON.stringify({action,...payload})}});
  return {ctx,call,sheets,emails,failMail: v=>failMail=v,failItem:()=>failItem=true};
}
function runTests() {
  const b = createBackend();
  assert(b.call('getQuotes').ok);
  const customer = b.call('saveCustomer',{customer:{name:'Test Customer',email:'qa@example.invalid'}}).data;
  const invoice = b.call('saveInvoice',{invoice:{customerId:customer.id,invoiceNumber:'1001',status:'unpaid',total:25,items:[{serviceName:'Wash',quantity:1,unitPrice:25}],customerEmail:customer.email}}).data;
  const snapshot = () => JSON.stringify(['Customers','Services','Invoices','InvoiceItems','EmailLog','Settings'].map(n=>b.sheets.get(n).rows));
  const before = snapshot();
  let q = {id:'quote_test',date:'2026-09-22',customerId:customer.id,customerName:customer.name,customerEmail:customer.email,notes:'Notes',items:[{serviceName:'Wash',quantity:2,unitPrice:12.35,lineTotal:999,lineNote:'Truck 5'}]};
  const save = () => { const r=b.call('saveQuote',{quote:q}); assert(r.ok,r.error); q=r.data; };
  save(); assert.equal(q.total,24.7); assert(!('status' in q));
  save(); assert.equal(b.call('getQuotes').data.length,1); assert.equal(b.sheets.get('QuoteItems').rows.length,2);
  b.failItem(); assert(!b.call('saveQuote',{quote:{...q,notes:'failed'}}).ok); assert.equal(b.call('getQuotes').data[0].notes,'Notes');
  assert(!b.call('deleteQuote',{id:q.id}).ok);
  q.archivedAt='2026-09-22T12:00:00Z'; save(); q.notes='Archived edit'; save(); assert(q.archivedAt);
  q.archivedAt=''; save(); assert.equal(q.archivedAt,'');
  const sent=b.call('sendQuoteEmail',{quote:q,pdfBase64:Buffer.from('%PDF test').toString('base64'),requestId:'send1'});
  assert(sent.ok,sent.error); assert(sent.data.quote.emailSentAt); assert.equal(b.emails.length,1);
  assert.equal(b.emails[0].subject,'Quote from MAC Industries'); assert(!/invoice/i.test(b.emails[0].body)); assert.equal(b.emails[0].attachments[0].type,'application/pdf');
  assert(b.call('sendQuoteEmail',{quote:q,pdfBase64:'ignored',requestId:'send1'}).ok); assert.equal(b.emails.length,1);
  save(); assert(q.emailSentAt); // stale edit cannot clear sent metadata
  b.failMail(true); assert(!b.call('sendQuoteEmail',{quote:q,pdfBase64:'JVBERg==',requestId:'fail1'}).ok); b.failMail(false);
  assert(b.sheets.get('QuoteEmailLog').rows.some(r=>r.includes('failed')));
  q.archivedAt='2026-09-22T12:00:00Z';save();assert(b.call('deleteQuote',{id:q.id}).ok);assert.equal(b.call('getQuotes').data.length,0);assert.equal(b.sheets.get('QuoteItems').rows.length,1);
  assert.equal(snapshot(),before,'quote operations must preserve all existing sheet rows');
  const zero=b.call('saveQuote',{quote:{date:'2026-09-22',customerId:customer.id,customerName:'No contact',items:[{serviceName:'Free service',quantity:0,unitPrice:0}]}});
  assert(zero.ok);assert.equal(zero.data.total,0);assert(!b.call('sendQuoteEmail',{quote:zero.data,pdfBase64:'JVBERg==',requestId:'no-email'}).ok);
  assert.equal(b.emails.length,1);
  for(const bad of [{...q,customerId:''},{...q,items:[]},{...q,items:[{quantity:-1,unitPrice:4}]}]) assert(!b.call('saveQuote',{quote:bad}).ok);
  assert(b.call('updateInvoiceStatus',{invoiceId:invoice.id,status:'paid'}).ok);
  const inv=b.call('getInvoices').data[0];inv.archivedAt='test';assert(b.call('saveInvoice',{invoice:inv}).ok);inv.archivedAt='';assert(b.call('saveInvoice',{invoice:inv}).ok);
  assert(b.call('sendInvoiceEmail',{invoice:inv,pdfBase64:'JVBERg==',filename:'invoice.pdf'}).ok);
  assert.equal(b.emails.at(-1).subject,'Invoice #1001 from MAC Industries');assert(b.call('getInvoices').data[0].emailSentAt);
  console.log('PASS backend: isolated storage, totals, edit, rollback, archive/restore/delete, email/log/idempotency, invoice regressions');
}
if(require.main===module)runTests();
module.exports={createBackend};
