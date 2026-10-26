// The site menu: a small button in the corner of every page that opens the market, auctions, wishlist,
// sold archive and seller portal. Added to each page at build time (marketpages.js).
(function () {
  if (window.__jfNav) return; window.__jfNav = 1;
  var links = [['Market', '/market.html'], ['Auctions', '/market.html?view=auctions'], ['Live shows', '/live.html'], ['Messages', '/messages.html'], ['My wishlist', '/wishlist.html'], ['Giveaway and vote', '/giveaway.html'], ['Terms of Service', '/terms.html'], ['Sold prices', '/sold.html'], ['My account', '/me.html'], ['My orders', '/account.html'], ['Seller Hub', '/seller.html']];
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
    + '.jfn-give{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 10px;background:#FF6B3D;text-align:center;padding:7px 12px;font:700 14px/1.35 "Space Grotesk",Archivo,system-ui,sans-serif}'
    + '.jfn-give .jfn-wl,.jfn-give .jfn-wl:visited,.jfn-give b{color:#0E0F13!important;text-decoration:none!important}.jfn-give .jfn-wl:hover{text-decoration:underline!important}.jfn-give b{font-weight:800}'
    + '.jfn-vote,.jfn-sub{display:inline-block;padding:3px 14px!important;border-radius:999px!important;background:#0B1A13!important;color:#F7F2E6!important;font:800 13px/1.5 "Space Grotesk",Archivo,system-ui,sans-serif!important;text-decoration:none!important;border:0!important;min-height:0!important;cursor:pointer}.jfn-vote:hover,.jfn-sub:hover{background:#163326!important}'
    + '.jfn-sub{background:transparent!important;color:#0B1A13!important;box-shadow:inset 0 0 0 2px #0B1A13}.jfn-sub:hover{background:rgba(11,26,19,.12)!important}'
    + '.jfn-pop-bg{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}'
    + '@media(min-width:641px){.jfn-pop-bg{align-items:center;justify-content:center}}'
    + '.jfn-pop{width:min(400px,100%);background:#F7F2E6;color:#0B1A13;border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 14px 40px rgba(0,0,0,.45);font:15px/1.45 Archivo,system-ui,sans-serif;border:3px solid #0B1A13}'
    + '.jfn-pop-h{display:flex;justify-content:space-between;align-items:center;gap:10px}.jfn-pop-h b{font-size:18px}.jfn-pop p{margin:0}'
    + '.jfn-pop-x{background:none!important;border:0!important;font-size:26px!important;line-height:1!important;cursor:pointer;color:#0B1A13!important;padding:0 4px!important;min-height:0!important}'
    + '.jfn-pop input,.jfn-pop textarea{width:100%;box-sizing:border-box;font:16px/1.4 Archivo,system-ui,sans-serif!important;padding:10px 12px!important;border:2px solid #0B1A13!important;border-radius:10px!important;background:#fff!important;color:#0B1A13!important;min-height:44px}.jfn-pop textarea{min-height:110px!important;resize:vertical}'
    + '.jfn-pop-go{background:#0B1A13!important;color:#F7F2E6!important;border:0!important;border-radius:999px!important;padding:11px 18px!important;font:800 15px/1.2 Archivo,system-ui,sans-serif!important;cursor:pointer;align-self:flex-start}.jfn-pop-m{font-size:14px;color:#8A2B1A}.jfn-pop-ok{font-weight:700;font-size:16px;padding:8px 0}'
    + '.jfn-help{position:fixed;right:18px;bottom:18px;z-index:2147483000;background:#F7F2E6!important;color:#0B1A13!important;border:3px solid #0B1A13!important;border-radius:22px 22px 22px 4px!important;padding:9px 16px!important;font:900 16px/1 "Space Grotesk",Archivo,system-ui,sans-serif!important;box-shadow:4px 4px 0 #0B1A13;cursor:pointer;min-height:0!important;transform:rotate(-3deg);transition:transform .15s}'
    + '.jfn-help:hover,.jfn-help:focus-visible{transform:rotate(0) scale(1.06);outline:none}'
    + '.jfn-help:after{content:"";position:absolute;left:10px;bottom:-12px;border:6px solid transparent;border-top:8px solid #0B1A13;border-left:8px solid #0B1A13}'
    + '@media(max-width:640px){.jfn-help{right:12px;bottom:12px;font-size:14px!important;padding:8px 13px!important}}'
    + '.jfn-paste{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;margin:6px 0 2px;border:1px dashed #C9A45C;border-radius:8px;background:rgba(0,0,0,.18);color:inherit;font-size:15px;cursor:text;outline:none;-webkit-user-select:text;user-select:text;box-sizing:border-box;width:100%}'
    + '.jfn-paste:empty:before{content:attr(data-ph);opacity:.7;font-size:14px;pointer-events:none}.jfn-paste:focus{border-style:solid;box-shadow:0 0 0 2px rgba(201,164,92,.35)}.jfn-paste.on{background:rgba(201,164,92,.15)}'
    + '.jfn-paste img{width:44px;height:44px;object-fit:cover;border-radius:4px;flex:none}'
    + '@media print{.jfn-btn,.jfn-panel,.jfn-acct,.jfn-give,.jfn-help{display:none}}';
  // The community banner at the very top of every page: 2% of every sale goes back to the community.
  function banner() {
    if (document.querySelector('.jfn-give')) return;
    var a = document.createElement('div'); a.className = 'jfn-give';
    a.innerHTML = '<a class="jfn-wl" href="/giveaway.html">Community wallet: <b class="jfn-w">$0.00</b></a>' + (location.pathname === '/giveaway.html' ? '' : '<a class="jfn-vote" href="/giveaway.html">Vote</a>') + '<button type="button" class="jfn-sub">Subscribe</button>';
    document.body.insertBefore(a, document.body.firstChild);
    a.querySelector('.jfn-sub').addEventListener('click', subscribe);
    var show = function (c) { a.querySelector('.jfn-w').textContent = '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var kept = null; try { kept = JSON.parse(sessionStorage.getItem('v2vWallet') || 'null'); } catch (e) { kept = null; }
    if (kept && Date.now() - kept.at < 120000) return show(kept.c);
    fetch('/api/market?do=giveaway', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return; show(j.wallet); try { sessionStorage.setItem('v2vWallet', JSON.stringify({ c: j.wallet, at: Date.now() })); } catch (e) {}
    }).catch(function () {});
  }
  // Every photo box on the site also gets a paste field right under it that looks and works like a text box: click
  // or tap it, then paste (Ctrl+V, Cmd+V, or tap and hold > Paste). A photo dropped on it works too. The photo goes
  // into the photo box as if it had been picked, so each page saves it as usual. The back office has its own
  // (admin-drop.js). A photo box marked data-nopaste is left alone.
  function pasteFields() {
    if (location.pathname === '/admin.html') return;
    var put = function (input, file, z) {
      if (!file || !/^image\//.test(file.type)) { z.textContent = ''; z.dataset.ph = 'That is not a photo. Copy a photo first, then paste it here.'; return; }
      try { var dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } catch (e) { z.textContent = ''; z.dataset.ph = 'This browser cannot paste photos here. Use the photo button instead.'; return; }
      z.textContent = '';
      var im = document.createElement('img'); im.alt = ''; im.src = URL.createObjectURL(file); z.appendChild(im);
      z.appendChild(document.createTextNode(' ✓ Photo pasted'));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    var wire = function (input) {
      if (input.dataset.paste || input.hasAttribute('data-nopaste')) return; input.dataset.paste = '1';
      var z = document.createElement('div'); z.className = 'jfn-paste'; z.contentEditable = 'true'; z.setAttribute('role', 'textbox');
      z.setAttribute('aria-label', 'Paste a photo here'); z.dataset.ph = input.getAttribute('data-paste-ph') || '📋 Paste a photo here: click and press Ctrl+V (⌘+V on a Mac), or tap and hold, then Paste';
      z.addEventListener('paste', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var items = (ev.clipboardData && ev.clipboardData.items) || [], f = null;
        for (var i = 0; i < items.length; i++) if (items[i].type && items[i].type.indexOf('image/') === 0) { f = items[i].getAsFile(); break; }
        if (!f && ev.clipboardData && ev.clipboardData.files && ev.clipboardData.files[0]) f = ev.clipboardData.files[0];
        put(input, f, z); z.blur();
      });
      // Typing does nothing here: it is only for pasting.
      z.addEventListener('beforeinput', function (ev) { if (ev.inputType !== 'insertFromPaste') ev.preventDefault(); });
      z.addEventListener('input', function () { if (!z.querySelector('img')) z.textContent = ''; });
      z.addEventListener('click', function (ev) { ev.stopPropagation(); });
      z.addEventListener('dragover', function (ev) { ev.preventDefault(); z.classList.add('on'); });
      z.addEventListener('dragleave', function () { z.classList.remove('on'); });
      z.addEventListener('drop', function (ev) { ev.preventDefault(); z.classList.remove('on'); put(input, ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0], z); });
      // A new photo picked with the photo button replaces the pasted one.
      input.addEventListener('change', function () { if (!input.files || !input.files.length) { z.textContent = ''; } });
      var lab = input.closest('label'), after = lab || input;
      after.parentNode.insertBefore(z, after.nextSibling);
    };
    var scan = function () { Array.prototype.forEach.call(document.querySelectorAll('input[type=file]'), function (i) { if (!i.accept || /image/.test(i.accept)) wire(i); }); };
    scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  // A small pop-up box (used by Subscribe and the help bubble). Closes with Escape, the X, or a tap outside.
  function popup(title, build) {
    var bg = document.createElement('div'); bg.className = 'jfn-pop-bg';
    var box = document.createElement('div'); box.className = 'jfn-pop'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    var h = document.createElement('div'); h.className = 'jfn-pop-h'; var t = document.createElement('b'); t.textContent = title; h.appendChild(t);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'jfn-pop-x'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; h.appendChild(x); box.appendChild(h);
    var close = function () { bg.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    x.addEventListener('click', close); bg.addEventListener('click', function (e) { if (e.target === bg) close(); }); document.addEventListener('keydown', esc);
    build(box, close); bg.appendChild(box); document.body.appendChild(bg);
    var f = box.querySelector('textarea,input:not([type=hidden])'); if (f) f.focus();
  }
  function signedEmail() { try { var t = localStorage.getItem('acct_token') || ''; var j = JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); return j && j.e && j.x * 1000 > Date.now() ? j.e : ''; } catch (e) { return ''; } }
  function field(box, tag, ph, val) { var i = document.createElement(tag); i.placeholder = ph; if (val) i.value = val; box.appendChild(i); return i; }
  function send(what, body, btn, msg, done) {
    btn.disabled = true; msg.textContent = 'Sending…';
    fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ do: what }, body)) }).then(function (r) { return r.json(); }).then(function (r) {
      btn.disabled = false; if (r.error) { msg.textContent = r.error; return; } done();
    }).catch(function () { btn.disabled = false; msg.textContent = 'Could not send just now. Try again.'; });
  }
  function subscribe() {
    popup('Subscribe to V2V', function (box, close) {
      var p = document.createElement('p'); p.textContent = 'Get emails about new drops, giveaways and the community wallet. Unsubscribe any time.'; box.appendChild(p);
      var e = field(box, 'input', 'you@example.com', signedEmail()); e.type = 'email'; e.autocomplete = 'email';
      var hp = field(box, 'input', ''); hp.name = 'website'; hp.tabIndex = -1; hp.setAttribute('aria-hidden', 'true'); hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'jfn-pop-go'; b.textContent = 'Subscribe'; box.appendChild(b);
      var m = document.createElement('div'); m.className = 'jfn-pop-m'; m.setAttribute('role', 'status'); box.appendChild(m);
      var go = function () { send('subscribe', { email: e.value, website: hp.value }, b, m, function () { box.textContent = ''; var d = document.createElement('p'); d.className = 'jfn-pop-ok'; d.textContent = '✓ You are subscribed. Thanks for being part of V2V!'; box.appendChild(d); setTimeout(close, 2200); }); };
      b.addEventListener('click', go); e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
    });
  }
  // The help bubble in the corner of every page: write what you need, and it is emailed to the owner right away.
  function helpBubble() {
    if (document.querySelector('.jfn-help') || location.pathname === '/admin.html' || /[?&]edit=1/.test(location.search)) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'jfn-help'; b.setAttribute('aria-label', 'Help: send us a message');
    b.innerHTML = '<span aria-hidden="true">Help?</span>';
    b.addEventListener('click', function () {
      popup('How can we help?', function (box, close) {
        var p = document.createElement('p'); p.textContent = 'Tell us what you need help with and we will email you back.'; box.appendChild(p);
        var t = field(box, 'textarea', 'Write your question here…'); t.rows = 4; t.maxLength = 3000;
        var e = field(box, 'input', 'Your email', signedEmail()); e.type = 'email'; e.autocomplete = 'email';
        var hp = field(box, 'input', ''); hp.tabIndex = -1; hp.setAttribute('aria-hidden', 'true'); hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
        var s = document.createElement('button'); s.type = 'button'; s.className = 'jfn-pop-go'; s.textContent = 'Send'; box.appendChild(s);
        var m = document.createElement('div'); m.className = 'jfn-pop-m'; m.setAttribute('role', 'status'); box.appendChild(m);
        s.addEventListener('click', function () { send('ask', { text: t.value, email: e.value, page: location.pathname + location.search, website: hp.value }, s, m, function () { box.textContent = ''; var d = document.createElement('p'); d.className = 'jfn-pop-ok'; d.textContent = '✓ Sent! We got your message and will email you back soon.'; box.appendChild(d); setTimeout(close, 2600); }); });
      });
    });
    document.body.appendChild(b);
  }
  // Which built-in pages are off and which of the owner's pages are in the menu. Kept for a minute on this device.
  var stWait = null;
  function pagesState(cb) {
    if (!stWait) stWait = new Promise(function (ok) {
      var kept = null; try { kept = JSON.parse(sessionStorage.getItem('v2vPages') || 'null'); } catch (e) { kept = null; }
      if (kept && Date.now() - kept.at < 60000) return ok(kept);
      fetch('/api/market?do=pages-menu', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var v = { menu: (j && j.menu) || [], off: (j && j.off) || [], at: Date.now() };
        try { sessionStorage.setItem('v2vPages', JSON.stringify(v)); } catch (e) {}
        ok(v);
      }).catch(function () { ok({ menu: [], off: [] }); });
    });
    stWait.then(cb);
  }
  // A built-in page the owner turned off sends visitors to the home page (the owner still sees it).
  pagesState(function (st) {
    var hide = function () { st.off.forEach(function (pth) { Array.prototype.forEach.call(document.querySelectorAll('a[href="' + pth + '"]'), function (a) { if (!a.closest('.se-ui')) a.style.display = 'none'; }); }); };
    if (st.off.length) { if (document.body) hide(); document.addEventListener('DOMContentLoaded', hide); setTimeout(hide, 1500); }
    if (st.off.indexOf(location.pathname) < 0) return;
    var own = false; try { own = !!localStorage.getItem('adminKey'); } catch (e) {}
    if (!own) location.replace('/');
  });
  function go() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    banner(); helpBubble(); pasteFields();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'jfn-btn'; b.textContent = 'Menu'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'jfnPanel');
    var p = document.createElement('nav'); p.className = 'jfn-panel'; p.id = 'jfnPanel'; p.hidden = true; p.setAttribute('aria-label', 'Site menu');
    // Who is signed in, read from the sign-in kept on this device (the site checks it on every request).
    var who = '';
    try { var t = localStorage.getItem('acct_token') || ''; var j = JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); if (j && j.e && j.x * 1000 > Date.now()) who = j.e; } catch (e) { who = ''; }
    var a0 = document.createElement('a'); a0.href = '/'; a0.textContent = 'Home'; p.appendChild(a0);
    links.forEach(function (l) { var a = document.createElement('a'); a.href = l[1]; a.textContent = l[0]; if (location.pathname + location.search === l[1]) a.className = 'here'; p.appendChild(a); });
    // The owner's own pages go in the menu; built-in pages the owner turned off leave it (back office > Pages).
    pagesState(function (st) {
      Array.prototype.forEach.call(p.querySelectorAll('a'), function (a) { if (st.off.indexOf(a.getAttribute('href')) >= 0) a.remove(); });
      st.menu.forEach(function (m) { if (p.querySelector('a[href="' + m.href + '"]')) return; var a = document.createElement('a'); a.href = m.href; a.textContent = m.title; if (location.pathname === m.href) a.className = 'here'; p.appendChild(a); });
    });
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
      slot.appendChild(bellLink()); slot.appendChild(cartLink()); slot.appendChild(acct); slot.appendChild(b); slot.appendChild(p); slot.style.gap = '10px'; slot.style.alignItems = 'center';
      var last = bar.lastElementChild;
      (last && last.tagName === 'SPAN' ? last : bar).appendChild(slot);
    } else { document.body.appendChild(p); document.body.appendChild(b); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  // Gallery or List, everywhere: product grids (.jf-grid), lists of rows (.jf-row, like Seller Hub pieces) and tables
  // (back office, orders) each get a small ▦ Gallery / ☰ List switch above them. The choice is remembered per page.
  (function views() {
    var css = document.createElement('style');
    css.textContent = '.vw-sw{display:inline-flex;align-self:flex-end;margin-left:auto;border:1px solid #4E7A63;border-radius:999px;padding:3px;gap:3px;margin-bottom:8px}'
      + '.vw-sw button{border:0!important;border-radius:999px!important;padding:6px 12px!important;min-height:0!important;font-weight:800!important;font-size:12px!important;cursor:pointer;background:transparent!important;color:#F7F2E6!important;box-shadow:none!important}'
      + '.vw-sw button[aria-pressed=true]{background:#C9A45C!important;color:#0B1A13!important}'
      + '.vw-bar{display:flex;width:100%}'
      + '.jf-grid.vw-list{grid-template-columns:1fr!important;gap:10px!important}'
      + '.jf-grid.vw-list .jf-item{display:grid!important;grid-template-columns:92px 1fr;column-gap:14px;align-items:center;padding:10px!important}'
      + '.jf-grid.vw-list .jf-item>:first-child{grid-row:1/span 8;width:92px!important;height:92px!important;aspect-ratio:1;margin:0!important}'
      + '.jf-grid.vw-list .jf-item>:not(:first-child):not(.jf-heart):not(.jf-tag){grid-column:2}'
      + '.jf-grid.vw-list .jf-tag{top:12px!important;left:12px!important;font-size:9px!important}'
      + '.jf-grid.vw-list .jf-heart{left:auto!important;right:12px!important}.jf-grid.vw-list .jf-plus{top:56px!important}'
      + '.jf-grid.vw-list .jf-acts{max-width:330px;width:100%}.jf-grid.vw-list .jf-offer{width:auto!important;justify-self:start;margin-top:6px!important}.jf-grid.vw-list .jf-name{padding-right:44px;margin:0!important}.jf-grid.vw-list .jf-item{min-height:0!important;row-gap:4px}'
      + 'table.vw-cards thead{display:none}'
      + 'table.vw-cards,table.vw-cards tbody{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;width:100%;border:0!important}'
      + 'table.vw-cards tr{display:flex!important;flex-direction:column;gap:4px;border:1px solid #2E4A3B;border-radius:12px;padding:12px;background:#11261C}'
      + 'table.vw-cards td{display:block!important;border:0!important;padding:0!important;text-align:left!important}'
      + 'table.vw-cards td[data-label]:before{content:attr(data-label) ": ";color:#9FB3A7;font-size:12px}'
      + 'table.vw-cards td:first-child{font-weight:800;font-size:15px}table.vw-cards td:first-child:before{content:none}'
      + '.vw-gal{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}'
      + '.vw-gal>.jf-row{display:flex!important;flex-direction:column!important;align-items:stretch!important;border:1px solid #2E4A3B;border-radius:12px;padding:12px!important}'
      + '.vw-gal>.jf-row>:first-child{width:100%!important;height:auto!important;aspect-ratio:1}'
      + '.vw-cardgal{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px!important;align-items:start}'
      + '.vw-cardgal>:not(.card){grid-column:1/-1}.vw-cardgal>.card{margin:0!important;min-width:0}';
    (document.head || document.documentElement).appendChild(css);
    var n = 0;
    function key(kind, i) { return 'vw:' + location.pathname + ':' + kind + ':' + i; }
    function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
    function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function sw(target, kind, i, apply, dflt) {
      var k = key(kind, i), bar = document.createElement('div'), s = document.createElement('div'); bar.className = 'vw-bar'; s.className = 'vw-sw';
      var g = document.createElement('button'), l = document.createElement('button'); g.type = l.type = 'button'; g.textContent = '▦ Gallery'; l.textContent = '☰ List';
      var set = function (v) { put(k, v); g.setAttribute('aria-pressed', v === 'gallery' ? 'true' : 'false'); l.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false'); apply(v); };
      g.addEventListener('click', function () { set('gallery'); }); l.addEventListener('click', function () { set('list'); });
      s.appendChild(g); s.appendChild(l); bar.appendChild(s);
      var at = target.parentNode && target.parentNode.classList && target.parentNode.classList.contains('scroll') ? target.parentNode : target;
      at.parentNode.insertBefore(bar, at);
      set(get(k, dflt));
    }
    function labels(t) {
      var hs = Array.prototype.map.call(t.querySelectorAll('thead th'), function (h) { return h.textContent.trim(); });
      Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) { Array.prototype.forEach.call(tr.children, function (td, i) { if (hs[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', hs[i]); }); });
    }
    function scan() {
      var idx = { grid: 0, table: 0, rows: 0 };
      Array.prototype.forEach.call(document.querySelectorAll('.jf-grid'), function (g) { var i = idx.grid++; if (g.dataset.vw || g.dataset.noview || !g.children.length) return; g.dataset.vw = '1'; sw(g, 'grid', i, function (v) { g.classList.toggle('vw-list', v === 'list'); }, 'gallery'); });
      Array.prototype.forEach.call(document.querySelectorAll('main table'), function (t) {
        var i = idx.table++; if (t.dataset.noview || t.closest('[data-noview]')) return;
        if (t.dataset.vw) { labels(t); return; }
        if (t.querySelectorAll('tbody tr').length < 2 || !t.querySelector('thead th')) return;
        t.dataset.vw = '1'; labels(t); sw(t, 'table', i, function (v) { labels(t); t.classList.toggle('vw-cards', v === 'gallery'); }, 'list');
      });
      // Any stack of cards (orders, offers, trades, sellers, reviews…) in the Seller Hub, the back office and elsewhere.
      var parents = [];
      Array.prototype.forEach.call(document.querySelectorAll('main .card'), function (c) { var p = c.parentNode; if (p && parents.indexOf(p) < 0) parents.push(p); });
      idx.cards = 0;
      parents.forEach(function (p) {
        var i = idx.cards++;
        if (p.dataset.vw || p.closest('[data-noview]') || p.classList.contains('jf-grid') || p.tagName === 'MAIN' || p.closest('.vw-cardgal') && p.closest('.vw-cardgal') !== p) return;
        var cards = Array.prototype.filter.call(p.children, function (x) { return x.classList && x.classList.contains('card') && !x.classList.contains('jf-item'); });
        if (cards.length < 3) return;
        p.dataset.vw = '1'; sw(cards[0], 'cards', i, function (v) { p.classList.toggle('vw-cardgal', v === 'gallery'); }, 'list');
      });
      var seen = [];
      Array.prototype.forEach.call(document.querySelectorAll('.jf-row'), function (r) { var p = r.parentNode; if (p && seen.indexOf(p) < 0) seen.push(p); });
      seen.forEach(function (p) {
        var i = idx.rows++; var rows = Array.prototype.filter.call(p.children, function (c) { return c.classList.contains('jf-row'); });
        if (p.dataset.vw || p.dataset.noview || rows.length < 2) return;
        // Rows share a parent with a heading: wrap them so only the rows turn into a gallery.
        var box = p; if (rows.length !== p.children.length) { box = document.createElement('div'); p.insertBefore(box, rows[0]); rows.forEach(function (r) { box.appendChild(r); }); }
        box.dataset.vw = '1'; p.dataset.vw = '1'; sw(box, 'rows', i, function (v) { box.classList.toggle('vw-gal', v === 'gallery'); }, 'list');
      });
    }
    var t0 = null;
    var run = function () { clearTimeout(t0); t0 = setTimeout(scan, 120); };
    var start = function () { scan(); new MutationObserver(run).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  })();
  // The shopping cart: kept in this browser (localStorage 'v2vCart'), checked out on /cart.html. window.V2VCart
  // lets any page add a piece; the 🛒 in the header shows how many pieces are in it.
  function cartRead() { try { var c = JSON.parse(localStorage.getItem('v2vCart') || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function cartWrite(c) { try { localStorage.setItem('v2vCart', JSON.stringify(c.slice(0, 25))); } catch (e) {} cartBadge(); }
  function cartCount() { return cartRead().reduce(function (n, x) { return n + (x.qty || 1); }, 0); }
  function cartBadge() { var n = cartCount(); Array.prototype.forEach.call(document.querySelectorAll('.jfn-cart b'), function (x) { x.textContent = n; x.hidden = !n; }); }
  // 🔔 Things to do now (answer an offer, ship an order, pay for an accepted offer…), for anyone signed in.
  function bellLink() {
    var w = document.createElement('span'); w.style.cssText = 'position:relative;display:none';
    var a = document.createElement('button'); a.type = 'button'; a.className = 'jfn-bell'; a.setAttribute('aria-label', 'Notifications'); a.textContent = '🔔';
    a.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;min-height:0;padding:0;border:1px solid #4E7A63;border-radius:50%;background:transparent;font-size:17px;cursor:pointer';
    var n = document.createElement('b'); n.style.cssText = 'position:absolute;top:-6px;right:-6px;background:#E5484D;color:#fff;border-radius:10px;font-size:11px;padding:1px 6px;font-weight:900'; n.hidden = true; a.appendChild(n);
    var pop = document.createElement('div'); pop.hidden = true; pop.style.cssText = 'position:fixed;right:16px;top:104px;z-index:2147483000;width:min(340px,calc(100vw - 32px));background:#0B1712;border:1px solid #2E4A3B;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:8px;display:flex;flex-direction:column;gap:4px';
    w.appendChild(a); w.appendChild(pop);
    var tok = ''; try { tok = localStorage.getItem('acct_token') || ''; } catch (e) {}
    var show = function (j) {
      w.style.display = 'inline-flex'; pop.textContent = ''; n.hidden = !j.total; n.textContent = j.total > 99 ? '99+' : j.total;
      if (!j.items.length) { var e0 = document.createElement('div'); e0.style.cssText = 'padding:10px;font-size:14px;opacity:.8'; e0.textContent = 'You are all caught up.'; pop.appendChild(e0); }
      j.items.forEach(function (x) { var l = document.createElement('a'); l.href = x.link; l.addEventListener('click', function () { pop.hidden = true; try { sessionStorage.removeItem('v2vBell'); } catch (e) {} }); l.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:10px;border-radius:8px;text-decoration:none;color:#F7F2E6;font-size:14px;background:#11261C'; var t = document.createElement('span'); t.textContent = x.text; var c = document.createElement('b'); c.textContent = x.n; c.style.cssText = 'background:#C9A45C;color:#0B1A13;border-radius:10px;padding:0 8px;align-self:center'; l.appendChild(t); l.appendChild(c); pop.appendChild(l); });
    };
    if (tok) {
      var cached = null; try { cached = JSON.parse(sessionStorage.getItem('v2vBell') || 'null'); } catch (e) {}
      if (cached && Date.now() - cached.at < 90000) show(cached.j);
      else fetch('/api/market?do=notify&t=' + encodeURIComponent(tok), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!j || !j.items) return; show(j); try { sessionStorage.setItem('v2vBell', JSON.stringify({ at: Date.now(), j: j })); } catch (e) {} }).catch(function () {});
    }
    a.addEventListener('click', function (ev) { ev.stopPropagation(); pop.hidden = !pop.hidden; });
    document.addEventListener('click', function (ev) { if (!w.contains(ev.target)) pop.hidden = true; });
    return w;
  }
  function cartLink() {
    var a = document.createElement('a'); a.href = '/cart.html'; a.className = 'jfn-cart'; a.setAttribute('aria-label', 'Shopping cart');
    a.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid #4E7A63;border-radius:50%;text-decoration:none;font-size:18px';
    a.textContent = '🛒'; var n = document.createElement('b'); n.style.cssText = 'position:absolute;top:-6px;right:-6px;background:#C9A45C;color:#0B1A13;border-radius:10px;font-size:11px;padding:1px 6px;font-weight:900'; a.appendChild(n);
    setTimeout(cartBadge, 0); return a;
  }
  window.V2VCart = {
    items: cartRead,
    add: function (it) { var c = cartRead(), f = c.filter(function (x) { return x.id === it.id; })[0]; var max = Math.max(1, Number(it.left) || 1); if (f) f.qty = Math.min(max, (f.qty || 1) + (it.qty || 1)); else c.push({ id: it.id, name: it.name, price: it.price, ship: it.ship, photo: it.photo || '', seller: it.seller || '', sellerName: it.sellerName || '', left: max, qty: Math.min(max, it.qty || 1), nft: !!it.nft, calc: !!it.calc }); cartWrite(c); return cartCount(); },
    set: function (id, qty) { var c = cartRead().map(function (x) { if (x.id === id) x.qty = Math.max(1, Math.min(x.left || 99, qty)); return x; }); cartWrite(c); },
    remove: function (id) { cartWrite(cartRead().filter(function (x) { return x.id !== id; })); },
    clear: function (ids) { cartWrite(ids ? cartRead().filter(function (x) { return ids.indexOf(x.id) < 0; }) : []); },
    count: cartCount
  };
  window.addEventListener('storage', function (e) { if (e.key === 'v2vCart') cartBadge(); });
  // Buzz: tell the shop (anonymously, by a random device id) which pieces sit in this cart, so other shoppers see
  // "In 2 carts" or "1 offer out" on those pieces, softly, under the price.
  function buzzDev() { var d = ''; try { d = localStorage.getItem('v2vDev') || ''; if (!/^[a-z0-9]{16}$/.test(d)) { d = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); d = (d + '0000000000000000').slice(0, 16); localStorage.setItem('v2vDev', d); } } catch (e) { d = ''; } return d; }
  function buzzSync() {
    var dev = buzzDev(); if (!dev) return;
    var now = cartRead().map(function (x) { return x.id; }), was = [];
    try { was = JSON.parse(localStorage.getItem('v2vBuzzIds') || '[]'); } catch (e) { was = []; }
    var send = function (id, on) { try { fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ do: 'cart-ping', id: id, dev: dev, on: on }), keepalive: true }); } catch (e) {} };
    now.forEach(function (id) { if (was.indexOf(id) < 0) send(id, true); });
    was.forEach(function (id) { if (now.indexOf(id) < 0) send(id, false); });
    try { localStorage.setItem('v2vBuzzIds', JSON.stringify(now)); } catch (e) {}
  }
  ['add', 'remove', 'clear'].forEach(function (k) { var f = window.V2VCart[k]; window.V2VCart[k] = function () { var r = f.apply(this, arguments); setTimeout(buzzSync, 0); return r; }; });
  setTimeout(buzzSync, 1500);
  var BUZZ = null;
  function buzzLine(id) {
    var x = BUZZ && BUZZ[id]; if (!x) return '';
    var mine = cartRead().some(function (c) { return c.id === id; }), carts = Math.max(0, (x.carts || 0) - (mine ? 1 : 0)), parts = [];
    if (carts) parts.push('In ' + carts + (mine ? ' other' : '') + (carts === 1 ? ' cart' : ' carts'));
    if (x.offers) parts.push(x.offers + (x.offers === 1 ? ' offer out' : ' offers out'));
    return parts.join(' · ');
  }
  window.V2VBuzz = buzzLine;
  function buzzPaint() {
    if (!BUZZ) return;
    Array.prototype.forEach.call(document.querySelectorAll('a.jf-item[href*="id="]'), function (a) {
      var m = /[?&]id=([^&#]+)/.exec(a.getAttribute('href') || ''); if (!m) return;
      var id = decodeURIComponent(m[1]), t = buzzLine(id), el = a.querySelector('.jf-buzz');
      if (!t) { if (el) el.remove(); return; }
      if (!el) { el = document.createElement('div'); el.className = 'jf-buzz'; var meta = a.querySelector('.jf-meta'); if (meta && meta.nextSibling) a.insertBefore(el, meta.nextSibling); else a.appendChild(el); }
      if (el.textContent !== '👀 ' + t) el.textContent = '👀 ' + t;
    });
    var pc = document.getElementById('pcBuzz'); if (pc) { var pid = new URLSearchParams(location.search).get('id') || '', t2 = buzzLine(pid); pc.textContent = t2 ? '👀 ' + t2 : ''; pc.hidden = !t2; }
  }
  if (!document.getElementById('jfBuzzCss')) { var bz = document.createElement('style'); bz.id = 'jfBuzzCss'; bz.textContent = '.jf-buzz{font-size:12px;color:#E8B86B;opacity:.9;letter-spacing:.01em;line-height:1.3}'; (document.head || document.documentElement).appendChild(bz); }
  if (/^\/(|index\.html|market\.html|shop\.html|wishlist\.html|piece\.html|s\/.*)$/.test(location.pathname)) {
    fetch('/api/market?do=buzz').then(function (r) { return r.json(); }).then(function (j) { BUZZ = (j && j.buzz) || {}; buzzPaint(); }).catch(function () {});
    var bzt = null; new MutationObserver(function () { if (!BUZZ) return; clearTimeout(bzt); bzt = setTimeout(buzzPaint, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  }
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
