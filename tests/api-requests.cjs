const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calls = [], cache = new Map();
let override;
const context = vm.createContext({
  URL, console, APP_CONFIG: { APPS_SCRIPT_URL: 'https://example.com/exec?existing=yes' },
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: async (url, options) => {
    calls.push({url, options});
    const body = JSON.parse(options.body);
    const data = body.action === 'getQuotes' ? [{id:'quote-test', items:[]}] : {customers:[{id:'customer-test'}],services:[],invoices:[]};
    // Model a redirect cache that keys responses on URL instead of POST body.
    if (!cache.has(url)) cache.set(url, {ok:true,data});
    const result = override || cache.get(url);
    return {ok:true,status:200,text:async () => JSON.stringify(result)};
  }
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../api.js'),'utf8'),context);
(async () => {
  const [all, quotes] = await vm.runInContext('Promise.all([apiGetAllData(),apiGetQuotes()])',context);
  assert.equal(all.data.customers[0].id,'customer-test');
  assert.equal(quotes.data[0].id,'quote-test');
  await vm.runInContext('apiGetQuotes()',context);
  assert.equal(new Set(calls.map(c=>c.url)).size,3);
  for(const {url,options} of calls) {
    assert.equal(new URL(url).searchParams.get('existing'),'yes');
    assert.equal(new URL(url).searchParams.get('action'),JSON.parse(options.body).action);
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers['Content-Type'],'text/plain;charset=utf-8');
  }
  override = {ok:true,data:{app:'health'}};
  assert.equal((await vm.runInContext('apiGetAllData()',context)).ok,false);
  const badQuote = await vm.runInContext('apiGetQuotes()',context);
  assert.equal(badQuote.ok,false);
  assert.match(badQuote.error,/Unexpected response/);
  override = {ok:false,error:'send failed'};
  const before=calls.length;
  await assert.rejects(vm.runInContext('callBackend("sendQuoteEmail",{requestId:"stable-email-id"})',context),/send failed/);
  assert.equal(calls.length,before+1,'Do not retry email mutations');
  assert.equal(JSON.parse(calls.at(-1).options.body).requestId,'stable-email-id');
  console.log('PASS: concurrent and repeated reads, malformed responses, preserved email payload, no mutation retries');
})().catch(error => {console.error(error);process.exitCode=1;});
