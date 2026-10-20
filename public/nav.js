// The site menu: a small button in the corner of every page that opens the market, auctions, wishlist,
// sold archive and seller portal. Added to each page at build time (marketpages.js).
(function () {
  if (window.__jfNav) return; window.__jfNav = 1;
  var links = [['Market', '/market.html'], ['Auctions', '/market.html?view=auctions'], ['My wishlist', '/wishlist.html'], ['Giveaway and vote', '/giveaway.html'], ['Terms of Service', '/terms.html'], ['Sold prices', '/sold.html'], ['My account', '/me.html'], ['My orders', '/account.html'], ['Seller Hub', '/seller.html']];
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
    + '@media(max-width:520px){header.top .bar>span>.mono,header.top .bar>span>a.home{display:none}'
    + 'header.top .bar{flex-wrap:nowrap!important;gap:8px!important;padding-top:10px!important;padding-bottom:10px!important;align-items:center}'
    + 'header.top .bar>span{gap:6px!important;flex-wrap:nowrap!important}header.top .bar .brand,header.top .bar .v-logo{font-size:22px!important}'
    + 'header.top .bar a.solid,header.top .bar .jfn-btn.in-bar,header.top .bar button{padding:7px 10px!important;font-size:13px!important;min-height:0!important;white-space:nowrap}'
    + '.jfn-acct{padding:2px!important}.jfn-acct a{padding:5px 9px!important;font-size:12px!important}.jfn-give{padding:6px 12px!important;font-size:13px!important}}'
    + '.jfn-give,.jfn-give:link,.jfn-give:visited,.jfn-give b{color:#0E0F13!important}.jfn-give{display:block;background:#FF6B3D;text-align:center;padding:8px 16px;font:700 14px/1.35 "Space Grotesk",Archivo,system-ui,sans-serif;text-decoration:none!important}'
    + '.jfn-give:hover,.jfn-give:focus-visible{text-decoration:underline!important;outline:none}.jfn-give b{font-weight:800}@media(max-width:520px){.jfn-give .jfn-nft{display:none}}'
    + '.jfn-vote{display:inline-block;margin-left:12px;padding:3px 14px;border-radius:999px;background:#0B1A13;color:#F7F2E6!important;font-weight:800;font-size:13px;line-height:1.5;vertical-align:middle}.jfn-give:hover .jfn-vote{background:#163326}'
    + '@media print{.jfn-btn,.jfn-panel,.jfn-acct,.jfn-give{display:none}}';
  // The community banner at the very top of every page: 2% of every sale goes back to the community.
  function banner() {
    if (document.querySelector('.jfn-give') || location.pathname === '/giveaway.html') return;
    var a = document.createElement('a'); a.className = 'jfn-give'; a.href = '/giveaway.html';
    a.innerHTML = 'Community wallet: <b class="jfn-w">$0.00</b><span class="jfn-vote">Vote</span>';
    document.body.insertBefore(a, document.body.firstChild);
    var show = function (c) { a.querySelector('.jfn-w').textContent = '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var kept = null; try { kept = JSON.parse(sessionStorage.getItem('v2vWallet') || 'null'); } catch (e) { kept = null; }
    if (kept && Date.now() - kept.at < 120000) return show(kept.c);
    fetch('/api/market?do=giveaway', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return; show(j.wallet); try { sessionStorage.setItem('v2vWallet', JSON.stringify({ c: j.wallet, at: Date.now() })); } catch (e) {}
    }).catch(function () {});
  }
  function go() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    banner();
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
  // The owner's own wording (back office > Wording): wherever a page says one thing, it says the owner's words instead.
  // It works on the words as they show on screen, including words a page adds later, and on box placeholders.
  (function wording() {
    if (location.pathname === '/admin.html') return;
    var here = location.pathname === '/index.html' ? '/' : location.pathname, rules = [];
    // Text already changed is remembered, so new words that contain the old ones are not changed twice.
    var done = typeof WeakMap === 'function' ? new WeakMap() : null;
    function setText(t) { if (done && done.get(t) === t.nodeValue) return; var v = fix(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v; if (done) done.set(t, t.nodeValue); }
    function fix(str) { var o = str; for (var i = 0; i < rules.length; i++) if (o.indexOf(rules[i].from) >= 0) o = o.split(rules[i].from).join(rules[i].to); return o; }
    function walk(root) {
      if (!rules.length || !root) return;
      if (root.nodeType === 3) { setText(root); return; }
      if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(root.tagName)) return;
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var pt = n.parentNode && n.parentNode.tagName; return /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(pt || '') ? 2 : 1; } }), n, list = [];
      while ((n = tw.nextNode())) list.push(n);
      list.forEach(setText);
      Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label]') : [], function (e) { if (e.dataset.wDone) return; e.dataset.wDone = '1'; ['placeholder', 'title', 'aria-label'].forEach(function (a) { var x = e.getAttribute(a); if (x) { var y = fix(x); if (y !== x) e.setAttribute(a, y); } }); });
    }
    // Parts of a page the owner hid, and pictures the owner added (placed next to a part of the page).
    var editing = /[?&]edit=1/.test(location.search) && (function () { try { return !!localStorage.getItem('adminKey'); } catch (e) { return false; } })();
    var parts = [];
    function place() {
      parts.forEach(function (r) {
        var t; try { t = document.querySelectorAll(r.sel); } catch (e) { return; }
        Array.prototype.forEach.call(t, function (n) {
          if (r.kind === 'hide') {
            if (editing) { n.style.setProperty('opacity', '.35', 'important'); n.style.setProperty('outline', '2px dashed #E86A6A', 'important'); n.title = 'Hidden from visitors (back office > Site editor to show it again)'; }
            else n.style.setProperty('display', 'none', 'important');
            return;
          }
          var tag = 'wimg-' + r.url.replace(/\W/g, '');
          var sib = r.where === 'before' ? n.previousElementSibling : n.nextElementSibling;
          if (sib && sib.dataset && sib.dataset.wimg === tag) return;
          var img = document.createElement('img'); img.src = r.url; img.alt = r.alt || ''; img.loading = 'lazy';
          img.style.cssText = 'display:block;height:auto;border-radius:4px;max-width:' + (r.size === 'small' ? '240px' : r.size === 'medium' ? '480px' : '100%') + ';width:100%';
          // Its own kind of tag (w-img), so it never shifts the places the editor recorded for other parts.
          var w = document.createElement('w-img'), inner = img;
          if (r.link) { inner = document.createElement('a'); inner.href = r.link; if (/^https?:/.test(r.link)) { inner.target = '_blank'; inner.rel = 'noopener'; } inner.appendChild(img); }
          w.dataset.wimg = tag; w.style.cssText = 'display:block;margin:10px 0'; w.appendChild(inner);
          n.parentNode && n.parentNode.insertBefore(w, r.where === 'before' ? n : n.nextSibling);
        });
      });
    }
    function use(all) {
      var mine = (all || []).filter(function (r) { return r && !r.off && (!r.page || r.page === here); });
      rules = mine.filter(function (r) { return (!r.kind || r.kind === 'text') && r.from; }).sort(function (a, b) { return b.from.length - a.from.length; });
      parts = mine.filter(function (r) { return (r.kind === 'hide' || r.kind === 'image') && r.sel; });
      if (editing) { var sc = document.createElement('script'); sc.src = '/site-edit.js'; document.body.appendChild(sc); }
      if (!rules.length && !parts.length) return;
      walk(document.body); document.title = fix(document.title); place();
      var busy = false, pend = null;
      new MutationObserver(function (ms) {
        if (busy) return; busy = true;
        ms.forEach(function (m) { if (m.type === 'characterData') walk(m.target); else Array.prototype.forEach.call(m.addedNodes, walk); });
        busy = false;
        if (parts.length && !pend) pend = setTimeout(function () { pend = null; place(); }, 120);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    var kept = null; try { kept = JSON.parse(sessionStorage.getItem('v2vWording') || 'null'); } catch (e) { kept = null; }
    var start = function (all) { if (document.body) use(all); else document.addEventListener('DOMContentLoaded', function () { use(all); }); };
    if (kept && Date.now() - kept.at < 60000 && !/[?&]edit=1/.test(location.search)) return start(kept.rules);
    fetch('/api/market?do=wording', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return; try { sessionStorage.setItem('v2vWording', JSON.stringify({ rules: j.rules || [], at: Date.now() })); } catch (e) {}
      start(j.rules || []);
    }).catch(function () {});
  })();
})();
