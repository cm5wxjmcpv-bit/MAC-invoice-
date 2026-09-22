// Run: JSPDF_PATH=/path/to/jspdf.umd.min.js BASELINE_DIR=/path/to/baseline node tests/browser.cjs
const {chromium} = require('playwright');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const {createBackend} = require('./backend.cjs');
const baseline = process.env.BASELINE_DIR || '/tmp/mac-baseline';
const jspdf = process.env.JSPDF_PATH || '/tmp/mac-jspdf.js';
const output = process.env.TEST_OUTPUT || '/tmp/mac-test-output';fs.mkdirSync(output,{recursive:true});
const customer = {id:'c1',name:'Test Customer',phone:'555-0100',email:'qa@example.invalid',address:'123 Test Lane'};
const service = {id:'s1',serviceName:'Pressure Washing',defaultPrice:125};
const fixture = {id:'invoice_fixture',invoiceNumber:'1001',date:'2026-09-22',customerId:'c1',customerName:customer.name,customerPhone:customer.phone,customerEmail:customer.email,customerAddress:customer.address,items:[{id:'i1',serviceId:'s1',serviceName:service.serviceName,quantity:2,unitPrice:125,lineTotal:250,lineNote:'Rear patio'}],subtotal:250,total:250,status:'unpaid',notes:'Thank you.',archivedAt:''};
const server = http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'); const base=url.pathname.startsWith('/baseline/') ? baseline : process.cwd();
  let file=url.pathname.replace(/^\/(baseline|current)\//,'') || 'index.html';
  if(file==='config.js'){res.setHeader('Content-Type','text/javascript');res.end(`const APP_CONFIG={COMPANY_NAME:'MAC Industries',APPS_SCRIPT_URL:'',USE_LOCAL_FALLBACK:true};`);return;}
  const target=path.join(base,file);if(!fs.existsSync(target)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(target));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    await context.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(jspdf)}));
    await context.addInitScript(({customer,service,fixture})=>{
      if(!localStorage.getItem('testSeeded')) {
        localStorage.setItem('mac_customers_v1',JSON.stringify([customer]));localStorage.setItem('mac_services_v1',JSON.stringify([service]));localStorage.setItem('mac_invoices_v1',JSON.stringify([fixture]));localStorage.setItem('testSeeded','yes');
      }
    },{customer,service,fixture});
    const page=await context.newPage(), errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    async function pdf(name,quote=false){
      const base64=await page.evaluate(async quote=>{const d=await (quote?makeQuotePdf():makePdf());d.setCreationDate(new Date('2026-09-22T00:00:00Z'));d.setFileId('11111111111111111111111111111111');return pdfToBase64(d);},quote);
      fs.writeFileSync(path.join(output,name+'.pdf'),Buffer.from(base64,'base64'));
    }
    await page.goto(root+'/baseline/index.html');await page.waitForFunction(()=>state.invoices.length===1);await page.evaluate(()=>loadInvoice('invoice_fixture'));await pdf('invoice-before');
    await page.goto(root+'/current/index.html');await page.waitForFunction(()=>quotesReady && state.customers.length===1);await page.evaluate(()=>loadInvoice('invoice_fixture'));await pdf('invoice-after');
    assert.deepEqual(fs.readFileSync(path.join(output,'invoice-before.pdf')),fs.readFileSync(path.join(output,'invoice-after.pdf')),'invoice PDF must be byte-identical after fixed metadata');
    const originalStorage=await page.evaluate(()=>['mac_customers_v1','mac_services_v1','mac_invoices_v1'].map(k=>localStorage.getItem(k)));
    await page.click('[data-tab="quotesTab"]');await page.selectOption('#quoteCustomerSelect','c1');assert((await page.textContent('#quoteCustomerCard')).includes(customer.address));
    await page.click('#quoteAddServicesBtn');await page.click('[data-service="s1"]');await page.fill('[data-field="quantity"]','3');await page.fill('[data-field="unitPrice"]','12.35');await page.fill('[data-field="lineNote"]','Truck 12');await page.fill('#quoteNotes','Quote test notes');
    assert.equal(await page.textContent('#quoteTotal'),'$37.05');
    await page.click('#saveQuoteBtn');await page.waitForFunction(()=>state.quotes.length===1 && !quoteBusy);
    const id=await page.evaluate(()=>state.currentQuote.id);
    await page.fill('#quoteNotes','Unsaved edit');assert.equal(await page.evaluate(()=>state.quotes[0].notes),'Quote test notes');await page.click('#saveQuoteBtn');await page.waitForFunction(()=>!quoteBusy);assert.equal(await page.evaluate(()=>state.quotes.length),1);
    await page.reload();await page.waitForFunction(()=>quotesReady);await page.click('[data-tab="quotesTab"]');await page.click('[data-action="open"]');assert.equal(await page.inputValue('#quoteNotes'),'Unsaved edit');
    await pdf('quote-normal',true);
    const dl=page.waitForEvent('download');await page.click('#quotePdfBtn');assert.match((await dl).suggestedFilename(),/^MAC-Quote-.*Test-Customer.pdf$/);
    for(const width of [1280,768,375]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(output,`quote-${width}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
    await page.click('[data-action="archive"]');await page.waitForFunction(()=>!quoteBusy);assert.equal(await page.locator('#quotesList [data-action="open"]').count(),0);
    await page.click('[data-tab="quoteArchiveTab"]');await page.click('[data-action="open"]');await page.fill('#quoteNotes','Archived edit');await page.click('#saveQuoteBtn');await page.waitForFunction(()=>!quoteBusy);assert(await page.evaluate(()=>Boolean(state.currentQuote.archivedAt)));
    await page.click('[data-tab="quoteArchiveTab"]');await page.click('[data-action="restore"]');await page.waitForFunction(()=>!quoteBusy);await page.click('[data-tab="quotesTab"]');await page.click('[data-action="archive"]');await page.waitForFunction(()=>!quoteBusy);await page.click('[data-tab="quoteArchiveTab"]');
    page.once('dialog',d=>d.dismiss());await page.click('[data-action="delete"]');await page.waitForFunction(()=>!quoteBusy);assert.equal(await page.evaluate(()=>state.quotes.length),1);
    page.once('dialog',d=>d.accept());await page.click('[data-action="delete"]');await page.waitForFunction(()=>!quoteBusy);assert.equal(await page.evaluate(()=>state.quotes.length),0);
    assert.deepEqual(await page.evaluate(()=>['mac_customers_v1','mac_services_v1','mac_invoices_v1'].map(k=>localStorage.getItem(k))),originalStorage);
    await page.evaluate(()=>{startNewQuote();state.currentQuote=normalizeQuote({date:'2026-09-22',customerId:'c1',customerName:'Long Customer '.repeat(20),customerAddress:'Long Address '.repeat(40),items:Array.from({length:25},(_,i)=>({serviceName:'Long service name '.repeat(12),quantity:i?2:1000000,unitPrice:12345.67,lineNote:i?'Line note':'Very long note '.repeat(500)})),notes:'General notes '.repeat(900)});renderQuoteBuilder();});await pdf('quote-long',true);
    // Existing invoice UI regressions.
    await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>startNewInvoice());assert.equal(await page.inputValue('#invoiceNumber'),'1002');await page.selectOption('#invoiceCustomerSelect','c1');await page.click('#toggleServicePickerBtn');await page.locator('#servicePicker button').first().click();await page.click('#saveInvoiceBtn');await page.waitForFunction(()=>state.invoices.length===2);await page.fill('#invoiceNotes','Edited invoice');await page.click('#saveInvoiceBtn');await page.waitForFunction(()=>state.currentInvoice.notes==='Edited invoice');await page.evaluate(async()=>{await updateInvoiceStatusById(state.currentInvoice.id,'paid');await setInvoiceArchivedById(state.currentInvoice.id,true);await setInvoiceArchivedById(state.currentInvoice.id,false);});assert.equal(await page.evaluate(()=>state.currentInvoice.status),'paid');assert.equal(await page.evaluate(()=>state.currentInvoice.archivedAt),'');
    // Backend route executes the actual Apps Script in a fake Sheets/Mail environment.
    const backend=createBackend();backend.call('saveCustomer',{customer});backend.call('saveService',{service});backend.call('saveInvoice',{invoice:fixture});
    let slow=false, fail=false, missing=false;
    await page.route('https://backend.test/**',async r=>{const body=r.request().postDataJSON();if(slow)await new Promise(resolve=>setTimeout(resolve,150));const result=missing&&body.action==='getQuotes'?{ok:false,error:'Unknown action: getQuotes'}:fail?{ok:false,error:'Simulated backend failure'}:backend.call(body.action,body);await r.fulfill({contentType:'application/json',body:JSON.stringify(result)});});
    await page.evaluate(async()=>{APP_CONFIG.APPS_SCRIPT_URL='https://backend.test/exec';await loadAll();await loadQuotes();startNewQuote();applyCustomerToInvoice('c1');state.currentQuote=normalizeQuote({date:'2026-09-22',customerId:'c1',customerName:'Test Customer',customerEmail:'qa@example.invalid',items:[{serviceName:'Wash',quantity:1,unitPrice:12.35}]});renderQuoteBuilder();});
    slow=true;await page.evaluate(()=>Promise.all([saveQuote(),saveQuote()]));assert.equal(backend.call('getQuotes').data.length,1);await page.evaluate(()=>Promise.all([sendQuoteEmail(),sendQuoteEmail()]));slow=false;assert.equal(backend.emails.length,1);assert(await page.evaluate(()=>Boolean(state.currentQuote.emailSentAt)));assert((await page.textContent('#quotesList')).includes('Sent'));
    fs.writeFileSync(path.join(output,'quote-email.pdf'),backend.emails[0].attachments[0].bytes);
    await page.evaluate(async()=>{loadInvoice('invoice_fixture');await sendEmail();});assert.equal(backend.emails.length,2);assert.match(backend.emails[1].subject,/Invoice #1001/);assert(await page.evaluate(()=>Boolean(state.currentInvoice.emailSentAt)));
    fail=true;await page.evaluate(()=>saveQuote());assert((await page.textContent('#messageBox')).includes('Simulated backend failure'));assert(!await page.isDisabled('#saveQuoteBtn'));fail=false;
    await page.evaluate(async()=>{state.currentQuote.customerEmail='';await sendQuoteEmail();});assert((await page.textContent('#messageBox')).includes('email is required'));assert.equal(backend.emails.length,2);
    missing=true;await page.evaluate(()=>loadQuotes());assert(await page.isDisabled('#saveQuoteBtn'));assert((await page.textContent('#quoteAvailability')).includes('deploy'));assert.equal(await page.evaluate(()=>state.invoices.length),1);
    assert.deepEqual(errors,[]);
    console.log('PASS browser: local quote lifecycle, downloads, desktop/tablet/mobile, identical invoice PDF, invoice lifecycle, backend integration, email attachments/timestamps, repeated clicks, failures and old-backend gate');
    await context.close();
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
