// The site menu: a small button in the corner of every page that opens the market, auctions, wishlist,
// sold archive and seller portal. Added to each page at build time (marketpages.js).
(function () {
  if (window.__jfNav) return; window.__jfNav = 1;
  var links = [['Market', '/market.html'], ['Auctions', '/market.html?view=auctions'], ['My wishlist', '/wishlist.html'], ['Recently sold', '/sold.html'], ['My account', '/me.html'], ['My orders', '/account.html'], ['Seller portal', '/seller.html']];
  var css = '.jfn-btn{position:fixed;left:16px;bottom:16px;z-index:2147483000;background:#C9A45C;color:#0B1A13;border:0;border-radius:999px;padding:12px 18px;font:700 15px Archivo,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}'
    + '.jfn-btn:focus-visible{outline:2px solid #F7F2E6;outline-offset:3px}'
    + '.jfn-panel{position:fixed;left:16px;bottom:72px;z-index:2147483000;background:#0B1A13;border:1px solid #C9A45C;min-width:220px;padding:8px 0;box-shadow:0 10px 30px rgba(0,0,0,.45);font:16px Archivo,system-ui,sans-serif}'
    + '.jfn-panel a{display:block;padding:11px 18px;color:#F7F2E6;text-decoration:none}.jfn-panel a:hover,.jfn-panel a:focus-visible{background:#11261C;color:#C9A45C;outline:none}'
    + '.jfn-panel a.here{color:#C9A45C}'
    + '.jfn-btn.in-bar{position:static;box-shadow:none;padding:9px 16px;font-size:15px;border-radius:2px}'
    + '.jfn-panel.in-bar{position:absolute;left:auto;right:0;top:calc(100% + 8px);bottom:auto}'
    + '.jfn-acct{display:inline-flex;border:1px solid #4E7A63;border-radius:999px;padding:3px;gap:2px}'
    + '.jfn-acct a{padding:6px 12px;border-radius:999px;color:#D6E2DA;text-decoration:none;font:700 14px Archivo,system-ui,sans-serif}'
    + '.jfn-acct a[aria-current="page"]{background:#C9A45C;color:#0B1A13}.jfn-acct a:hover{color:#F7F2E6}'
    + '.jfn-acct a.jfn-si{padding:6px 14px}'
    + '@media(max-width:520px){header.top .bar>span>.mono,header.top .bar>span>a.home{display:none}}'
    + '@media print{.jfn-btn,.jfn-panel,.jfn-acct{display:none}}';
  function go() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'jfn-btn'; b.textContent = 'Menu'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'jfnPanel');
    var p = document.createElement('nav'); p.className = 'jfn-panel'; p.id = 'jfnPanel'; p.hidden = true; p.setAttribute('aria-label', 'Site menu');
    // Who is signed in, read from the sign-in kept on this device (the site checks it on every request).
    var who = '';
    try { var t = localStorage.getItem('acct_token') || ''; var j = JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); if (j && j.e && j.x * 1000 > Date.now()) who = j.e; } catch (e) { who = ''; }
    var a0 = document.createElement('a'); a0.href = '/'; a0.textContent = 'Home'; p.appendChild(a0);
    links.forEach(function (l) { var a = document.createElement('a'); a.href = l[1]; a.textContent = l[0]; if (location.pathname + location.search === l[1]) a.className = 'here'; p.appendChild(a); });
    if (who) {
      var so = document.createElement('a'); so.href = '/'; so.textContent = 'Sign out (' + who + ')'; so.style.cssText = 'border-top:1px solid #244536;font-size:14px;color:#A8BFB1';
      so.addEventListener('click', function () { try { localStorage.removeItem('acct_token'); localStorage.removeItem('bid_token'); } catch (e) {} });
      p.appendChild(so);
    }
    // The account button beside the menu: "Sign in", or the Buyer / Seller switch for someone signed in.
    var acct = document.createElement('span'); acct.className = 'jfn-acct';
    if (!who) { var si = document.createElement('a'); si.href = '/me.html'; si.textContent = 'Sign in'; si.className = 'jfn-si'; acct.appendChild(si); }
    else {
      var side = /^\/seller\.html/.test(location.pathname) ? 'seller' : /^\/me\.html/.test(location.pathname) ? 'buyer' : '';
      [['Buyer', '/me.html', 'buyer'], ['Seller', '/seller.html', 'seller']].forEach(function (x) { var a = document.createElement('a'); a.href = x[1]; a.textContent = x[0]; if (side === x[2]) a.setAttribute('aria-current', 'page'); acct.appendChild(a); });
      acct.setAttribute('role', 'group'); acct.setAttribute('aria-label', 'My account: buyer or seller side');
    }
    var toggle = function (open) { p.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = open ? 'Close' : 'Menu'; };
    b.addEventListener('click', function () { toggle(p.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !p.hidden) { toggle(false); b.focus(); } });
    document.addEventListener('click', function (e) { if (!p.hidden && !p.contains(e.target) && e.target !== b) toggle(false); });
    // Pages with a header bar get the menu button in the header; others get it floating in the corner.
    var bar = document.querySelector('header.top .bar');
    if (bar) {
      var slot = document.createElement('span'); slot.style.cssText = 'position:relative;display:inline-flex';
      b.classList.add('in-bar'); p.classList.add('in-bar');
      slot.appendChild(acct); slot.appendChild(b); slot.appendChild(p); slot.style.gap = '10px'; slot.style.alignItems = 'center';
      var last = bar.lastElementChild;
      (last && last.tagName === 'SPAN' ? last : bar).appendChild(slot);
    } else { document.body.appendChild(p); document.body.appendChild(b); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
