// Shared helpers: signed invoices, prices, and per-chain payment checks.
const crypto = require('crypto');

const COINS = {
  BTC: { dec: 8, network: 'Bitcoin', env: 'WALLET_BTC', confs: 2 },
  ETH: { dec: 18, network: 'Ethereum', env: 'WALLET_ETH', confs: 3 },
  USDC: { dec: 6, network: 'Ethereum (ERC-20)', env: 'WALLET_ETH', confs: 3, chain: 'eth', blockSec: 12, contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  USDT: { dec: 6, network: 'Ethereum (ERC-20)', env: 'WALLET_ETH', confs: 3, chain: 'eth', blockSec: 12, contract: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  'USDC-BASE': { dec: 6, sym: 'USDC', label: 'USDC (Base)', network: 'Base', env: 'WALLET_BASE', env2: 'WALLET_ETH', confs: 10, chain: 'base', blockSec: 2, contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', api: 'https://base.blockscout.com/api', explorer: 'https://basescan.org/tx/' },
  SOL: { dec: 9, network: 'Solana', env: 'WALLET_SOL', confs: 1 }
};

// Minutes after the deadline in which a block may still carry a payment sent in time.
const GRACE = 30 * 60;

const secret = () => process.env.INVOICE_SECRET || '';
const mac = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + mac(body);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verify(token) {
  if (!secret()) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !safeEqual(parts[1], mac(parts[0]))) return null;
  try { return JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch (e) { return null; }
}

async function getJSON(url, opts) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(9000), headers: { accept: 'application/json' } }, opts || {}));
  if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + new URL(url).host);
  return r.json();
}

async function usdPrice(sym) {
  try {
    const j = await getJSON('https://api.coinbase.com/v2/prices/' + sym + '-USD/spot');
    const p = Number(j.data.amount);
    if (p > 0) return p;
  } catch (e) { /* fall through */ }
  const ids = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
  const j = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=' + ids[sym] + '&vs_currencies=usd');
  const p = Number(j[ids[sym]].usd);
  if (!(p > 0)) throw new Error('No price for ' + sym);
  return p;
}

const rand = (max) => BigInt(crypto.randomInt(1, max + 1));

// Exact amount in base units. A small random tail makes each invoice's amount unique,
// which is how a payment to a shared wallet is matched to one invoice.
async function amountFor(coin, cents) {
  const usd = cents / 100;
  if (COINS[coin].contract) return (BigInt(cents) * 10000n + rand(9999)).toString();
  const price = await usdPrice(coin);
  if (coin === 'BTC') return (BigInt(Math.ceil(usd / price * 1e8)) + rand(500)).toString();
  if (coin === 'ETH') return (BigInt(Math.ceil(usd / price * 1e5)) * 10n ** 13n + rand(999) * 10n ** 10n).toString();
  return (BigInt(Math.ceil(usd / price * 1e4)) * 100000n + rand(9999) * 10n).toString(); // SOL
}

function display(units, dec) {
  const s = String(units).padStart(dec + 1, '0');
  const whole = s.slice(0, s.length - dec);
  const frac = s.slice(s.length - dec).replace(/0+$/, '');
  return frac ? whole + '.' + frac : whole;
}

async function checkBTC(addr, units, from, to) {
  const now = Math.floor(Date.now() / 1000);
  const [txs, tip] = await Promise.all([
    getJSON('https://mempool.space/api/address/' + addr + '/txs'),
    getJSON('https://mempool.space/api/blocks/tip/height')
  ]);
  for (const tx of txs) {
    const hit = (tx.vout || []).find((v) => v.scriptpubkey_address === addr && String(v.value) === units);
    if (!hit) continue;
    const done = tx.status && tx.status.confirmed;
    const t = done ? tx.status.block_time : now;
    if (t < from || t > to) continue;
    return { hash: tx.txid, time: t, confs: done ? Number(tip) - tx.status.block_height + 1 : 0, block: done ? tx.status.block_height : null, explorer: 'https://mempool.space/tx/' + tx.txid };
  }
  return null;
}

// Public blockchain nodes, tried in order. Reading the chain directly is faster and
// steadier than the indexer, which rate-limits and can lag behind.
const RPCS = {
  eth: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://eth.drpc.org'],
  base: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org']
};
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hex = (n) => '0x' + n.toString(16);

async function rpc(url, method, params) {
  const j = await getJSON(url, { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) });
  if (j.error || j.result === undefined || j.result === null) throw new Error('RPC ' + method + ' failed at ' + new URL(url).host);
  return j.result;
}

// Look for the token transfer in the node's own event logs.
async function checkLogs(url, addr, units, from, to, c) {
  const now = Math.floor(Date.now() / 1000);
  const latest = Number(await rpc(url, 'eth_blockNumber', []));
  const span = Math.ceil((Math.min(now, to) - from) / c.blockSec) + Math.ceil((now - Math.min(now, to)) / c.blockSec) + 50;
  const topic = '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
  const CHUNK = 9000;
  for (let hi = latest, left = Math.min(span, CHUNK * 6); left > 0; hi -= CHUNK, left -= CHUNK) {
    const lo = Math.max(0, hi - Math.min(CHUNK, left) + 1);
    const logs = await rpc(url, 'eth_getLogs', [{ address: c.contract, fromBlock: hex(lo), toBlock: hex(hi), topics: [TRANSFER, null, topic] }]);
    for (const l of logs.slice().reverse()) {
      if (l.removed || BigInt(l.data).toString() !== units) continue;
      const blk = await rpc(url, 'eth_getBlockByNumber', [l.blockNumber, false]);
      const t = Number(blk.timestamp);
      if (t < from || t > to) continue;
      const bn = Number(l.blockNumber);
      return { hash: l.transactionHash, time: t, confs: Math.max(0, latest - bn + 1), block: bn, explorer: (c.explorer || 'https://etherscan.io/tx/') + l.transactionHash, src: new URL(url).host };
    }
  }
  return null;
}

async function checkEVM(addr, units, from, to, c) {
  const contract = c.contract;
  if (contract && RPCS[c.chain]) {
    for (const url of RPCS[c.chain]) {
      try { return await checkLogs(url, addr, units, from, to, c); } catch (e) { console.error('RPC_FAIL', String(e && e.message || e)); }
    }
  }
  const q = contract
    ? 'action=tokentx&contractaddress=' + contract
    : 'action=txlist';
  const j = await getJSON((c.api || 'https://eth.blockscout.com/api') + '?module=account&' + q + '&address=' + addr + '&sort=desc&page=1&offset=50');
  const list = Array.isArray(j.result) ? j.result : [];
  if (!Array.isArray(j.result) && j.status !== '0') throw new Error('Unexpected reply from Ethereum data source');
  for (const tx of list) {
    if (String(tx.to || '').toLowerCase() !== addr.toLowerCase()) continue;
    if (String(tx.value) !== units) continue;
    if (!contract && tx.isError && tx.isError !== '0') continue;
    const t = Number(tx.timeStamp);
    if (t < from || t > to) continue;
    return { hash: tx.hash, time: t, confs: Number(tx.confirmations || 0), block: Number(tx.blockNumber), explorer: (c.explorer || 'https://etherscan.io/tx/') + tx.hash, src: 'blockscout' };
  }
  return null;
}

async function checkSOL(addr, units, from, to) {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const call = async (method, params) => {
    const j = await getJSON(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) });
    if (j.error) throw new Error(j.error.message || 'Solana RPC error');
    return j.result;
  };
  const sigs = await call('getSignaturesForAddress', [addr, { limit: 20, commitment: 'confirmed' }]);
  const cands = (sigs || []).filter((s) => !s.err && (s.blockTime == null || (s.blockTime >= from && s.blockTime <= to))).slice(0, 6);
  for (const s of cands) {
    const tx = await call('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
    if (!tx || !tx.meta) continue;
    const keys = tx.transaction.message.accountKeys.map((k) => (k && k.pubkey) || k);
    const i = keys.indexOf(addr);
    if (i < 0) continue;
    const delta = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]);
    if (delta.toString() !== units) continue;
    return { hash: s.signature, time: s.blockTime || Math.floor(Date.now() / 1000), confs: s.confirmationStatus === 'finalized' ? 1 : 0, block: tx.slot, explorer: 'https://solscan.io/tx/' + s.signature };
  }
  return null;
}

// Short memory of recent answers, so several open tabs do not each hit the chain.
const memo = new Map();
async function check(coin, addr, units, from, to) {
  const key = coin + '|' + addr + '|' + units + '|' + from;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 4000) return hit.v;
  let v;
  if (coin === 'BTC') v = await checkBTC(addr, units, from, to);
  else if (coin === 'SOL') v = await checkSOL(addr, units, from, to);
  else v = await checkEVM(addr, units, from, to, COINS[coin]);
  if (memo.size > 500) memo.clear();
  memo.set(key, { at: Date.now(), v: v });
  return v;
}

// Rules for orders placed on the order page.
const ORDER_HOURS = 1;
// Payment plans. pct is the price change; deposit is the share of the order total paid online now.
const PLANS = {
  full: { name: 'Pay in full', pct: -5.3, deposit: 100 },
  dep: { name: 'Deposit + COD', pct: -4.4, deposit: 25 },
  later: { name: 'Pay Later', pct: 5.3, deposit: 0 }
};
function priceOrder(listCents, plan) {
  const pl = PLANS[plan];
  const total = Math.round(listCents * (100 + pl.pct) / 100);
  const now = pl.deposit >= 100 ? total : pl.deposit > 0 ? Math.max(1, Math.round(total * pl.deposit / 100)) : 0;
  return { total: total, now: now, balance: total - now };
}

// Products, prices and stock come from the Inventory tab of the owner's Google Sheet.
const sheetUrl = () => (process.env.SHEET_WEBHOOK_URL || '').trim();
let invCache = null;
async function getInventory(fresh) {
  if (!fresh && invCache && Date.now() - invCache.at < 20000) return invCache.v;
  if (!sheetUrl()) throw new Error('No sheet connected');
  const j = await getJSON(sheetUrl(), { signal: AbortSignal.timeout(15000) });
  const v = (Array.isArray(j.products) ? j.products : []).map((p) => ({
    id: String(p.id || '').trim(), name: String(p.name || '').trim().slice(0, 120),
    cents: Math.round(Number(p.price) * 100), min: Math.max(1, Math.floor(Number(p.min) || 1)), stock: Math.max(0, Math.floor(Number(p.stock) || 0))
  })).filter((p) => /^[A-Za-z0-9_-]{1,20}$/.test(p.id) && p.name && p.cents > 0 && p.cents < 100000000);
  invCache = { at: Date.now(), v: v };
  return v;
}

// Has this email signed the current NDA and non-compete? true, false, or null when the sheet cannot say
// (for example the sheet script has not been updated yet). Signed answers are remembered for a while.
const signedMemo = new Map();
async function getSigned(email, version) {
  const k = String(email || '').trim().toLowerCase() + '|' + version;
  if (signedMemo.has(k) && Date.now() - signedMemo.get(k) < 3600000) return true;
  if (!sheetUrl()) return null;
  try {
    const j = await getJSON(sheetUrl() + '?signed=' + encodeURIComponent(k.split('|')[0]) + '&version=' + encodeURIComponent(version), { signal: AbortSignal.timeout(15000) });
    if (typeof j.signed !== 'boolean') return null;
    if (j.signed) { if (signedMemo.size > 2000) signedMemo.clear(); signedMemo.set(k, Date.now()); }
    return j.signed;
  } catch (e) { console.error('SIGNED_FAIL', String(e && e.message || e)); return null; }
}
function markSigned(email, version) { signedMemo.set(String(email || '').trim().toLowerCase() + '|' + version, Date.now()); }

async function sheetPost(payload) {
  if (!sheetUrl()) return 'off';
  try {
    const r = await fetch(sheetUrl(), { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const t = (await r.text()).trim();
    if (r.ok && (t === 'ok' || t === 'duplicate' || t === 'short')) return t;
    console.error('SHEET_FAIL', r.status, t.slice(0, 200));
    return 'failed';
  } catch (e) { console.error('SHEET_FAIL', String(e)); return 'failed'; }
}

const usd = (cents) => (cents / 100).toFixed(2);
const planName = (p) => (PLANS[p] ? PLANS[p].name : 'Custom invoice');
// Orders paid by cash or ACH are not checked online: the owner confirms the money by hand.
const isCash = (inv) => inv.m === 'cash' && inv.p !== 'later';
// Orders paid by credit card through Square. The charge is made and confirmed on the card page.
const isCard = (inv) => inv.m === 'card' && inv.p !== 'later';
const payNote = () => (process.env.PAY_INSTRUCTIONS || '').trim().slice(0, 600);

// Add the order to the Orders tab and take the units out of stock. The sheet ignores repeats of the same invoice.
const recorded = new Map();
async function recordOrder(inv, status, proof) {
  if (recorded.has(inv.n)) return 'duplicate';
  const when = new Date().toLocaleString('en-US', { timeZone: process.env.LEADS_TZ || 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const paidNow = inv.p === 'later' || isCash(inv) ? 0 : inv.u;
  const out = await sheetPost({
    tab: 'Orders', key: inv.n, stock: { product: inv.pid, qty: Number(inv.q) },
    headers: ['Placed', 'Invoice', 'Product No', 'Product', 'Units', 'Plan', 'List total (USD)', 'Order total (USD)', 'Deposit paid (USD)', 'Balance due (USD)', 'Buyer', 'Email', 'Status', 'Proof', 'Ref'],
    row: [when, inv.n, inv.pid, inv.i, inv.q, planName(inv.p) + (isCash(inv) ? ' (cash or ACH)' : isCard(inv) ? ' (card)' : ''), usd(inv.L), usd(inv.T), usd(paidNow), usd(inv.T - paidNow), inv.b, inv.e, status, proof || '', inv.n]
  });
  if (out === 'ok' || out === 'duplicate' || out === 'short') { if (recorded.size > 500) recorded.clear(); recorded.set(inv.n, 1); invCache = null; }
  console.log('ORDER', JSON.stringify({ invoice: inv.n, sheet: out }));
  return out;
}

// Lock amount, wallet and deadline for every coin that has a wallet set.
async function createInvoice(f) {
  const k = {}, skipped = [];
  if (!f.noCoins) {
    for (const coin of Object.keys(COINS)) {
      const addr = (process.env[COINS[coin].env] || process.env[COINS[coin].env2 || ''] || '').trim();
      if (!addr) { skipped.push(coin); continue; }
      try { k[coin] = [await amountFor(coin, f.cents), addr]; } catch (e) { skipped.push(coin); }
    }
    if (!Object.keys(k).length) return { error: 'No wallet addresses are set yet. Add WALLET_BTC, WALLET_ETH or WALLET_SOL in the Vercel environment variables, then redeploy.' };
  }
  const now = Math.floor(Date.now() / 1000);
  const inv = Object.assign({ n: f.no || String(now), i: f.item, q: f.qty, b: f.buyer, t: f.terms, e: f.email, u: f.cents, c: now, d: now + Math.round(f.hours * 3600), k: k }, f.extra || {});
  return { inv: inv, token: sign(inv), skipped: skipped };
}

// Send one email through Resend, with a copy to the owner.
// The idempotency key stops the same email going out twice.
async function mail(to, subject, lines, idem, html, attachments) {
  const key = (process.env.RESEND_API_KEY || '').trim(), from = (process.env.EMAIL_FROM || '').trim();
  if (!key || !from || !to) { console.log('EMAIL_OFF', JSON.stringify({ key: !!key, from: !!from, to: !!to })); return 'off'; }
  // The owner's settings from the back office Emails tab: turned off, or with their own words added.
  if (!/^emailtest-/.test(String(idem))) {
    try {
      const plan = await require('./_emails').apply(subject, lines, html);
      if (plan.off) { console.log('EMAIL_TURNED_OFF', plan.kind); return 'off'; }
      subject = plan.subject; lines = plan.lines; html = plan.html;
    } catch (e) { console.error('EMAIL_SETTINGS_FAIL', String(e && e.message || e)); }
  }
  const owner = (process.env.OWNER_EMAIL || '').trim();
  const body = { from: from, to: [to], subject: subject, text: lines.join('\n') };
  if (html) body.html = html;
  if (attachments && attachments.length) body.attachments = attachments;
  // Emails sent to many members at once (bc-) do not copy the owner on every one.
  if (owner && owner.toLowerCase() !== to.toLowerCase() && !/^bc-/.test(String(idem))) body.bcc = [owner];
  const send = async (b, id) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(9000),
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': id },
      body: JSON.stringify(b)
    });
    if (r.ok) return true;
    console.error('EMAIL_FAIL', r.status, (await r.text()).slice(0, 300));
    return false;
  };
  try {
    if (await send(body, idem)) return 'sent';
    if (body.bcc) { delete body.bcc; if (await send(body, idem + '-solo')) return 'sent'; }
    return 'failed';
  } catch (e) { console.error('EMAIL_FAIL', String(e)); return 'failed'; }
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const orderLine = (inv) => (inv.i || '-') + (inv.q ? ' x ' + inv.q : '');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (t) => new Date(t * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

// The money lines under the item row: [label, amount, bold]. paid = the online amount has been received.
function totals(inv, paid) {
  const pl = PLANS[inv.p];
  if (!pl) return [[paid ? 'Total paid' : 'Total due', money(inv.u) + ' USD', true]];
  const adj = inv.T - inv.L;
  const rows = [
    [pl.name + (adj < 0 ? ' discount (' : ' surcharge (') + Math.abs(pl.pct) + '%)', (adj < 0 ? '-' : '+') + money(Math.abs(adj)), false],
    ['Order total', money(inv.T) + ' USD', true]
  ];
  if (inv.p === 'dep') {
    rows.push([(paid ? 'Deposit paid (' : 'Deposit due now (') + pl.deposit + '%)', money(inv.u), false]);
    rows.push(['Balance due on delivery', money(inv.T - inv.u) + ' USD', true]);
  }
  if (inv.p === 'full') rows.push([paid ? 'Paid in full' : 'Due now', money(inv.u) + ' USD', false]);
  return rows;
}
const totalsText = (inv, paid) => totals(inv, paid).map((r) => r[0] + ': ' + r[1]);

// Invoice-style email. Tables and inline styles only, because mail apps ignore most CSS.
// o: { badge, solid, paid, intro, details: [[label, valueHtml]], cta: { label, url }, foot }
function invoiceHtml(inv, o) {
  const brand = esc(process.env.BRAND_NAME || 'Collectors Page');
  const q = Number(inv.q);
  const line = inv.p ? inv.L : inv.u;
  const unit = Number.isInteger(q) && q > 0 && line % q === 0 ? money(line / q) : '';
  const sans = "font-family:Arial,Helvetica,sans-serif;";
  const mono = "font-family:'Courier New',Courier,monospace;";
  const lab = sans + 'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5B6478;';
  const cell = sans + 'font-size:15px;color:#101726;padding:12px 0;border-bottom:1px solid #E3DDCD;';
  const badge = o.solid
    ? '<span style="' + sans + 'display:inline-block;background:#101726;color:#F7F2E6;font-size:12px;font-weight:bold;letter-spacing:1.5px;padding:6px 12px;">' + o.badge + '</span>'
    : '<span style="' + sans + 'display:inline-block;border:2px solid #101726;color:#101726;font-size:12px;font-weight:bold;letter-spacing:1.5px;padding:4px 10px;">' + o.badge + '</span>';
  const details = o.details.map((d) => '<tr><td style="' + lab + 'padding:8px 12px 8px 0;vertical-align:top;white-space:nowrap;">' + d[0] + '</td><td style="' + sans + 'font-size:14px;color:#101726;padding:8px 0;word-break:break-all;">' + d[1] + '</td></tr>').join('');
  const cta = o.cta ? '<tr><td style="padding:8px 32px 28px;"><a href="' + esc(o.cta.url) + '" style="' + sans + 'display:inline-block;background:#101726;color:#F7F2E6;font-size:15px;font-weight:bold;text-decoration:none;padding:14px 24px;">' + o.cta.label + '</a></td></tr>' : '';
  const sums = totals(inv, o.paid).map((r, i) => '<tr><td colspan="3" align="right" style="' + sans + 'font-size:' + (r[2] ? '16px;font-weight:bold' : '14px') + ';color:#101726;padding:' + (i ? '4px' : '14px') + ' 0 4px;">' + r[0] + '</td><td align="right" style="' + sans + 'font-size:' + (r[2] ? '16px;font-weight:bold' : '14px') + ';color:#101726;padding:' + (i ? '4px' : '14px') + ' 0 4px 12px;white-space:nowrap;">' + r[1] + '</td></tr>').join('');
  return '<!doctype html><html><body style="margin:0;padding:0;background:#F7F2E6;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2E6;"><tr><td align="center" style="padding:24px 12px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E3DDCD;">'
    + '<tr><td style="background:#101726;padding:22px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="' + sans + 'font-size:18px;font-weight:bold;letter-spacing:1px;color:#F7F2E6;">' + brand + '</td>'
    + '<td align="right" style="' + sans + 'font-size:13px;letter-spacing:3px;color:#C9A45C;">INVOICE</td></tr></table></td></tr>'
    + '<tr><td style="padding:28px 32px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:top;"><div style="' + lab + '">Invoice no.</div><div style="' + mono + 'font-size:18px;color:#101726;padding-top:4px;">' + esc(inv.n) + '</div>'
    + '<div style="' + lab + 'padding-top:14px;">Date</div><div style="' + sans + 'font-size:15px;color:#101726;padding-top:4px;">' + day(inv.c) + '</div></td>'
    + '<td align="right" style="vertical-align:top;">' + badge + '</td></tr></table></td></tr>'
    + '<tr><td style="padding:16px 32px 4px;"><div style="' + lab + '">Billed to</div><div style="' + sans + 'font-size:15px;color:#101726;padding-top:4px;">' + esc(inv.b || inv.e) + (inv.b && inv.e ? '<br><span style="color:#5B6478;">' + esc(inv.e) + '</span>' : '') + '</div></td></tr>'
    + '<tr><td style="padding:20px 32px 0;"><div style="' + sans + 'font-size:15px;color:#101726;">' + o.intro + '</div></td></tr>'
    + '<tr><td style="padding:20px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="' + lab + 'padding-bottom:8px;border-bottom:2px solid #101726;">Description</td><td align="right" style="' + lab + 'padding-bottom:8px;border-bottom:2px solid #101726;">Qty</td><td align="right" style="' + lab + 'padding-bottom:8px;border-bottom:2px solid #101726;">Unit</td><td align="right" style="' + lab + 'padding-bottom:8px;border-bottom:2px solid #101726;">Amount</td></tr>'
    + '<tr><td style="' + cell + '">' + esc(inv.i || 'Order') + '</td><td align="right" style="' + cell + 'padding-left:12px;">' + esc(inv.q || '-') + '</td><td align="right" style="' + cell + 'padding-left:12px;">' + (unit || '-') + '</td><td align="right" style="' + cell + 'padding-left:12px;">' + money(line) + '</td></tr>'
    + sums
    + '<tr><td colspan="4" style="padding-bottom:14px;"></td></tr></table></td></tr>'
    + '<tr><td style="padding:8px 32px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F5EC;border:1px solid #E3DDCD;"><tr><td style="padding:10px 16px;"><table role="presentation" cellpadding="0" cellspacing="0">' + details + '</table></td></tr></table></td></tr>'
    + cta
    + '<tr><td style="border-top:1px solid #E3DDCD;padding:18px 32px 24px;' + sans + 'font-size:13px;color:#5B6478;">' + o.foot + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function sendPaidEmail(inv, coin, tx) {
  if (!inv.e) return 'off';
  if (Math.floor(Date.now() / 1000) - tx.time > 12 * 3600) return 'earlier';
  const dep = inv.p === 'dep';
  const paid = display(inv.k[coin][0], COINS[coin].dec) + ' ' + (COINS[coin].sym || coin);
  const intro = dep
    ? 'Your deposit has been confirmed on the blockchain and your order is confirmed. The balance of ' + money(inv.T - inv.u) + ' is due on delivery, in cash, ACH or crypto.'
    : 'Your payment has been confirmed on the blockchain. This invoice is paid in full.';
  const html = invoiceHtml(inv, {
    badge: dep ? 'DEPOSIT PAID' : 'PAID', solid: true, paid: true, intro: intro,
    details: [
      ['Paid', esc(paid)],
      ['Network', esc(COINS[coin].network)],
      ['Paid on', day(tx.time)],
      ['Transaction', '<span style="font-family:\'Courier New\',Courier,monospace;font-size:13px;">' + esc(tx.hash) + '</span>']
    ],
    cta: { label: 'View proof of payment', url: tx.explorer },
    foot: 'We will reach out soon about your order. Keep this email as your receipt.'
  });
  return mail(inv.e, 'Invoice ' + inv.n + (dep ? ': deposit received' : ' paid'), [intro, '', 'Invoice: ' + inv.n, 'Order: ' + orderLine(inv)].concat(totalsText(inv, true), [
    'Paid: ' + paid + ' (' + COINS[coin].network + ')',
    'Transaction: ' + tx.hash,
    'Proof: ' + tx.explorer,
    '',
    'We will reach out soon about your order.'
  ]), hash('paid|' + inv.n + '|' + inv.c + '|' + coin + '|' + tx.hash), html);
}

function sendLinkEmail(inv, link) {
  const by = new Date(inv.d * 1000).toUTCString().replace('GMT', 'UTC');
  const dep = inv.p === 'dep';
  const intro = dep
    ? 'Thanks for your order. Pay the ' + PLANS.dep.deposit + '% deposit with the button below to confirm it. The balance is due on delivery, in cash, ACH or crypto.'
    : 'Thanks for your order. Use the button below to pay this invoice in full.';
  const card = isCard(inv);
  const html = invoiceHtml(inv, {
    badge: dep ? 'DEPOSIT DUE' : 'PAYMENT DUE', solid: false, paid: false, intro: intro,
    details: [
      [dep ? 'Pay deposit by' : 'Pay by', esc(by)],
      ['Pay with', card ? 'Credit or debit card' : esc(Object.keys(inv.k).map((c) => COINS[c].label || c).join(', '))]
    ],
    cta: { label: dep ? 'Pay the deposit' : 'Pay this invoice', url: link },
    foot: card
      ? 'The payment page takes your card through Square, our card processor. Your card details never touch our site.'
      : 'The payment page shows the exact amount and the wallet address to send it to. Keep it open after you send so it can confirm your payment.'
  });
  return mail(inv.e, 'Invoice ' + inv.n + (dep ? ': deposit link' : ': payment link'), [intro, '', 'Invoice: ' + inv.n, 'Order: ' + orderLine(inv)].concat(totalsText(inv, false), [
    'Pay by: ' + by,
    '',
    'Payment link:',
    link
  ]), hash('link|' + inv.n + '|' + inv.c), html);
}

function sendLaterEmail(inv) {
  const intro = 'Thanks for your order. Nothing is due online. The full amount is due later, in cash, ACH or crypto, and we will reach out to arrange payment and delivery.';
  const html = invoiceHtml(inv, {
    badge: 'PAYMENT DUE', solid: false, paid: false, intro: intro,
    details: [['Plan', 'Pay Later'], ['Pay with', 'Cash, ACH or crypto']],
    foot: 'Want ' + Math.abs(PLANS.full.pct) + '% off instead? Choose Pay in full on your next order.'
  });
  return mail(inv.e, 'Invoice ' + inv.n + ': order received', [intro, '', 'Invoice: ' + inv.n, 'Order: ' + orderLine(inv)].concat(totalsText(inv, false)), hash('later|' + inv.n + '|' + inv.c), html);
}

// Card payment went through at Square. pay: { id, receipt, time, card }
function sendCardPaidEmail(inv, pay) {
  if (!inv.e) return 'off';
  const dep = inv.p === 'dep';
  const intro = dep
    ? 'Your deposit has been paid by card and your order is confirmed. The balance of ' + money(inv.T - inv.u) + ' is due on delivery, in cash, ACH or crypto.'
    : 'Your card payment went through. This invoice is paid in full.';
  const details = [['Paid', money(inv.u) + ' USD by card' + (pay.card ? ' (' + esc(pay.card) + ')' : '')], ['Paid on', day(pay.time)], ['Payment ID', '<span style="font-family:\'Courier New\',Courier,monospace;font-size:13px;">' + esc(pay.id) + '</span>']];
  const html = invoiceHtml(inv, {
    badge: dep ? 'DEPOSIT PAID' : 'PAID', solid: true, paid: true, intro: intro, details: details,
    cta: pay.receipt ? { label: 'View card receipt', url: pay.receipt } : null,
    foot: 'We will reach out soon about your order. Keep this email as your receipt.'
  });
  return mail(inv.e, 'Invoice ' + inv.n + (dep ? ': deposit received' : ' paid'), [intro, '', 'Invoice: ' + inv.n, 'Order: ' + orderLine(inv)].concat(totalsText(inv, true), [
    'Paid: ' + money(inv.u) + ' USD by card' + (pay.card ? ' (' + pay.card + ')' : ''),
    'Payment ID: ' + pay.id
  ], pay.receipt ? ['Receipt: ' + pay.receipt] : [], ['', 'We will reach out soon about your order.']), hash('cardpaid|' + inv.n + '|' + inv.c + '|' + pay.id), html);
}

// Order placed with cash or ACH chosen for the amount due now. Nothing is checked online.
function sendCashEmail(inv) {
  const dep = inv.p === 'dep', note = payNote();
  const intro = (dep
    ? 'Thanks for your order. The ' + PLANS.dep.deposit + '% deposit of ' + money(inv.u) + ' is due now by cash or ACH to confirm it. The balance of ' + money(inv.T - inv.u) + ' is due on delivery, in cash, ACH or crypto.'
    : 'Thanks for your order. The full amount of ' + money(inv.u) + ' is due now by cash or ACH.')
    + (note ? '' : ' We will reach out with payment details.');
  const details = [['Plan', esc(planName(inv.p))], ['Pay with', 'Cash or ACH']];
  if (note) details.push(['How to pay', esc(note).replace(/\n/g, '<br>')]);
  const html = invoiceHtml(inv, {
    badge: dep ? 'DEPOSIT DUE' : 'PAYMENT DUE', solid: false, paid: false, intro: intro, details: details,
    foot: 'Your order is confirmed once we receive your payment. Put invoice ' + esc(inv.n) + ' on the payment so we can match it.'
  });
  return mail(inv.e, 'Invoice ' + inv.n + ': order received', [intro, '', 'Invoice: ' + inv.n, 'Order: ' + orderLine(inv)].concat(totalsText(inv, false), note ? ['', 'How to pay:', note] : []), hash('cash|' + inv.n + '|' + inv.c), html);
}

module.exports = { isCash, isCard, sendCardPaidEmail, payNote, sendCashEmail, COINS, GRACE, ORDER_HOURS, PLANS, sheetPost, sign, verify, safeEqual, amountFor, display, check, priceOrder, getInventory, recordOrder, createInvoice, sendPaidEmail, sendLinkEmail, sendLaterEmail, invoiceHtml, getSigned, markSigned, mail, esc };
