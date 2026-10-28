// Shared bits for the market pages: sign-in, money, cards. Exposes window.JF.
(function () {
  // acct_token is the V2V account sign-in. bid_token is an older auction-page sign-in that other pages no longer accept.
  var KEYS = ['acct_token'];
  function token() {
    try { for (var i = 0; i < KEYS.length; i++) { var t = localStorage.getItem(KEYS[i]); if (t) return t; } } catch (e) {}
    return '';
  }
  // Who a sign-in belongs to, read from the token itself (the site signs it; the server checks it on every call).
  function emailOf(t) {
    try { var j = JSON.parse(atob(String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); return j.x * 1000 > Date.now() ? j.e || '' : ''; } catch (e) { return ''; }
  }
  function signOut() { try { ['acct_token', 'bid_token'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function usd(v) { return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cents(c) { return usd((c || 0) / 100); }
  // The full Terms in a scroll box. The agree box (cb) only unlocks once they have scrolled to the very end.
  var termsHtml = null;
  function termsScroller(cb, hint) {
    var box = el('div'); box.setAttribute('tabindex', '0'); box.setAttribute('aria-label', 'Terms of Service, scroll to the end to agree');
    box.style.cssText = 'max-height:260px;overflow-y:auto;border:1px solid #4E7A63;padding:12px 14px;font-size:13px;line-height:1.55;background:rgba(0,0,0,.18)';
    box.textContent = 'Loading the Terms…';
    cb.disabled = true;
    // A bold gold notice with a bouncing arrow and a progress bar, so it is clear you must scroll to the end first.
    if (!document.getElementById('jfTermsCss')) { var tcss = el('style'); tcss.id = 'jfTermsCss'; tcss.textContent = '@keyframes jfBob{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}.jf-tnote{display:flex;align-items:center;gap:10px;background:#C9A45C;color:#0B1A13;font-weight:800;font-size:15px;padding:10px 14px;border-radius:6px}.jf-tnote b{display:inline-block;font-size:20px;animation:jfBob 1s ease-in-out infinite}.jf-tnote.done{background:#1F4D36;color:#F7F2E6}.jf-tnote.done b{animation:none}.jf-tbar{height:6px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden}.jf-tbar span{display:block;height:100%;width:0;background:#C9A45C;transition:width .15s}'; document.head.appendChild(tcss); }
    var note = hint || el('div', null, 'jf-tnote'); note.textContent = '';
    var arrow = el('b', '⬇'); arrow.setAttribute('aria-hidden', 'true'); var ntext = el('span', 'Scroll down through all the Terms. The agree box unlocks at the bottom.');
    note.appendChild(arrow); note.appendChild(ntext);
    var bar = el('div', null, 'jf-tbar'), fill = el('span'); bar.appendChild(fill);
    var unlock = function () {
      if (!box.offsetParent || box.scrollHeight < 40) return;
      fill.style.width = Math.min(100, Math.round((box.scrollTop + box.clientHeight) * 100 / box.scrollHeight)) + '%';
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 12) { cb.disabled = false; note.classList.add('done'); arrow.textContent = '✓'; ntext.textContent = 'Thanks for reading. Now tick the box below to agree.'; box.removeEventListener('scroll', unlock); }
    };
    (termsHtml ? Promise.resolve(termsHtml) : fetch('/terms.html', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (h) {
      var d = new DOMParser().parseFromString(h, 'text/html'), a = d.querySelector('article.terms');
      termsHtml = a ? a.innerHTML : ''; return termsHtml;
    })).then(function (h) {
      if (!h) { box.textContent = 'The Terms did not load. Read them at /terms.html, then tick the box.'; cb.disabled = false; return; }
      box.innerHTML = h; Array.prototype.forEach.call(box.querySelectorAll('h1'), function (x) { x.style.fontSize = '18px'; });
      Array.prototype.forEach.call(box.querySelectorAll('h2'), function (x) { x.style.fontSize = '15px'; x.style.margin = '14px 0 4px'; });
      box.addEventListener('scroll', unlock); setTimeout(unlock, 50);
    }).catch(function () { box.textContent = 'The Terms did not load. Read them at /terms.html, then tick the box.'; cb.disabled = false; });
    var wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px'; wrap.appendChild(note); wrap.appendChild(box); wrap.appendChild(bar);
    return wrap;
  }
  // The Terms of Service, to sign before using an account (accounts made before the Terms, or with Google).
  var gateOpen = false;
  function termsGate(next) {
    if (gateOpen || !document.body) return; gateOpen = true;
    var bg = el('div'); bg.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    var box = el('section', null, 'card'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.style.cssText = 'max-width:560px;width:100%;gap:12px;max-height:92vh;overflow:auto';
    box.appendChild(el('h2', 'Sign the VeeFam.io Terms'));
    var ul = el('ul'); ul.style.cssText = 'margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px';
    ['VeeFam.io is only a marketplace. You are fully responsible for what you buy, sell and trade.', 'VeeFam.io is not responsible for any loss of money, items or information.', 'Do not deal with anyone you do not trust. Never pay or get paid outside VeeFam.io: that voids any protection.', 'VeeFam.io may step in to help with a disagreement, but does not have to.', 'Disputes go to individual arbitration, not class actions.'].forEach(function (t) { ul.appendChild(el('li', t)); });
    box.appendChild(ul);
    var nl = el('label', 'Full name (your electronic signature)'); var n = el('input'); n.autocomplete = 'name'; n.maxLength = 80; nl.appendChild(n); box.appendChild(nl);
    var cl = el('label', null, 'jf-check'); var cb = el('input'); cb.type = 'checkbox'; cl.appendChild(cb); cl.appendChild(el('span', 'I have read and agree to the VeeFam.io Terms of Service, and I sign them electronically.'));
    box.appendChild(termsScroller(cb)); box.appendChild(cl);
    var go = el('button', 'Sign and continue', 'solid'); go.type = 'button'; box.appendChild(go);
    var m = el('div', '', 'small'); m.setAttribute('role', 'status'); box.appendChild(m);
    go.addEventListener('click', function () {
      if (!cb.checked) { m.textContent = 'Tick the box to agree.'; return; }
      if (n.value.trim().length < 2) { m.textContent = 'Type your full name to sign.'; return; }
      go.disabled = true; m.textContent = 'Saving your signature…';
      fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ do: 'agree', t: token(), name: n.value, agree: true }) }).then(function (r) { return r.json(); }).then(function (r) {
        if (r.error) { go.disabled = false; m.textContent = r.error; return; }
        if (next) { bg.remove(); gateOpen = false; next(); } else location.reload();
      }).catch(function () { go.disabled = false; m.textContent = 'That did not save. Try again.'; });
    });
    bg.appendChild(box); document.body.appendChild(bg); n.focus();
  }
  // Right after signing in: an account that has not signed the Terms yet signs them now, then carries on.
  function afterSignIn(r, next) { if (r.terms === false) { termsGate(next); } else next(); }
  function api(path, body) {
    var o = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    // Anything done (shipped, marked paid, replied, answered): the 🔔 must count again, not show an old copy.
    if (body || /do=thread|do=open|messages/.test(path)) { try { sessionStorage.removeItem('v2vBell'); } catch (e) {} if (body && !/notify/.test(path)) setTimeout(function () { try { window.dispatchEvent(new Event('v2v-bell')); } catch (e) {} }, 0); }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return { error: 'The site did not answer. Try again.' }; }).then(function (j) { j._status = r.status; if (j && j.needTerms && (body || /^\/(me|seller|wishlist|account|giveaway)\.html/.test(location.pathname))) termsGate(); return j; }); });
  }
  // The V2V sign-in box: Continue with Google, or an email and password. A new password account confirms its
  // email with a 6-digit code first. done(token) runs once signed in; the token is kept as acct_token.
  var gLoad = null;
  // Google's sign-in script is only loaded once someone taps "Continue with Google": loaded up front, it hooks into the
  // email box's autofill in some browsers, which has made a browser close when typing an email.
  // Apps' built-in browsers (Instagram, Facebook, TikTok, Discord, X, Snapchat…) block Google sign-in: its window opens
  // blank. There, say so, offer to open the page in the phone's real browser, and keep email sign-in.
  function inApp() { var u = navigator.userAgent || ''; return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|musical_ly|Bytedance|Snapchat|Discord|LinkedInApp|Pinterest|GSA\/|; wv\)/i.test(u) || (/(iPhone|iPad|iPod)/.test(u) && /AppleWebKit/.test(u) && !/Safari\//.test(u)); }
  // Inside another app's browser (Instagram, Discord, Facebook...), Google blocks its sign-in and the screen goes
  // blank. Show what to do instead.
  function inAppNote(host) {
      host.textContent = '';
      var n = el('div', null, 'small'); n.style.cssText = 'border:1px solid #C9A45C;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;max-width:420px';
      n.appendChild(el('b', 'Google sign-in does not work inside this app'));
      n.appendChild(el('span', 'You opened VeeFam inside another app (like Instagram, Discord or Facebook). Sign in with your email instead, or open this page in Safari or Chrome to use Google.'));
      var cp = el('button', 'Copy the link to open in Safari or Chrome', 'ghost'); cp.type = 'button'; cp.style.cssText = 'min-height:0;padding:8px 12px';
      cp.addEventListener('click', function () { var u = location.href; try { navigator.clipboard.writeText(u).then(function () { cp.textContent = 'Copied! Paste it in Safari or Chrome.'; }, function () { prompt('Copy this link:', u); }); } catch (e) { prompt('Copy this link:', u); } });
      n.appendChild(cp);
      if (/Android/i.test(navigator.userAgent || '')) { var oc = el('a', 'Open in Chrome'); oc.href = 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;end'; n.appendChild(oc); }
      host.appendChild(n);
  }
  function google(host, msg, done, or) {
    if (inApp()) { inAppNote(host); return; }
    // The real Google button straight away (one press), with a quiet placeholder while Google's script loads.
    if (!host.firstChild) { var ph = el('div', 'Loading Google sign-in…', 'small dim'); ph.style.cssText = 'height:44px;display:flex;align-items:center;justify-content:center;border:1px solid #2E4A3B;border-radius:999px;width:100%;max-width:360px;margin:0 auto'; host.appendChild(ph); }
    realGoogle(host, msg, done, or);
  }
  function realGoogle(host, msg, done, or) {
    gLoad = gLoad || fetch('/api/google', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
      if (!c.clientId) return null;
      return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = function () { ok(c.clientId); }; sc.onerror = function () { ok(null); }; document.head.appendChild(sc); });
    }).catch(function () { return null; });
    gLoad.then(function (cid) {
      if (!cid || !window.google) { host.hidden = true; host.dataset.off = '1'; if (or) { or.hidden = true; or.dataset.off = '1'; } return; }
      window.google.accounts.id.initialize({ client_id: cid, use_fedcm_for_button: true, callback: function (resp) {
        msg.textContent = 'Signing you in…';
        api('/api/google', { credential: resp.credential }).then(function (r) { if (!r.token) { msg.textContent = r.error || 'Could not sign in with Google.'; return; } keep(r.token); afterSignIn(r, function () { done(r.token); }); });
      } });
      host.textContent = ''; host.style.cssText = 'display:flex;justify-content:center;min-height:44px';
      window.google.accounts.id.renderButton(host, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width: Math.max(240, Math.min(360, (host.offsetWidth || 320))) });
    });
  }
  function keep(t) { try { localStorage.setItem('acct_token', t); localStorage.removeItem('bid_token'); } catch (x) {} }
  function signInBox(host, lead, done, startMode) {
    var mode = startMode === 'signup' ? 'signup' : 'login', pending = '';
    host.textContent = '';
    var card = el('section', null, 'card'); card.style.cssText = 'gap:16px;max-width:520px';
    var head = el('h2'), sub = el('div', lead || '', 'small');
    var g = el('div'); g.style.minHeight = '44px';
    var or = el('div', 'or with your email', 'label'); or.style.cssText = 'display:flex;align-items:center;gap:12px;text-align:center;opacity:.8'; or.insertAdjacentHTML('afterbegin', '<span style="flex:1;height:1px;background:#2E4A3B"></span>'); or.insertAdjacentHTML('beforeend', '<span style="flex:1;height:1px;background:#2E4A3B"></span>');
    var f = el('form'); f.style.gap = '12px';
    var ln = el('label', 'Full name (your electronic signature on the Terms)'), n = el('input'); n.autocomplete = 'name'; n.maxLength = 80; ln.appendChild(n);
    // The Terms of Service, signed at sign-up: the ticked box plus the typed full name.
    var lt = el('label', null, 'jf-check'), tc = el('input'); tc.type = 'checkbox'; lt.appendChild(tc);
    var tsp = el('span'); tsp.appendChild(document.createTextNode('I have read and agree to the ')); var ta = el('a', 'VeeFam.io Terms of Service'); ta.href = '/terms.html'; ta.target = '_blank'; ta.rel = 'noopener'; tsp.appendChild(ta);
    tsp.appendChild(document.createTextNode(', and I sign them electronically. I understand VeeFam.io is only a marketplace and is not responsible for any loss.')); lt.appendChild(tsp);
    var le = el('label', 'Email'), e = el('input'); e.type = 'email'; e.required = true; e.autocomplete = 'email'; e.placeholder = 'you@example.com'; le.appendChild(e);
    var lp = el('label', 'Password'), p = el('input'); p.type = 'password'; p.required = true; p.minLength = 8; lp.appendChild(p);
    var lc = el('label', 'The 6-digit code we emailed you'), c = el('input'); c.inputMode = 'numeric'; c.autocomplete = 'one-time-code'; c.maxLength = 6; c.pattern = '[0-9]{6}'; lc.appendChild(c);
    var go = el('button', '', 'solid'); go.type = 'submit';
    var msg = el('div', '', 'small'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    var swap = el('button', '', 'ghost'); swap.type = 'button'; swap.style.alignSelf = 'flex-start';
    var again = el('button', 'Email me a new code', 'ghost'); again.type = 'button'; again.style.alignSelf = 'flex-start';
    var tsc = termsScroller(tc);
    [ln, le, lp, lc, tsc, lt, go, msg].forEach(function (x) { f.appendChild(x); });
    [head, sub, g, or, f, swap, again].forEach(function (x) { card.appendChild(x); });
    host.appendChild(card);
    function show() {
      var code = !!pending;
      head.textContent = code ? 'Check your email' : mode === 'signup' ? 'Create your account' : 'Sign in';
      ln.hidden = code || mode !== 'signup'; lt.hidden = code || mode !== 'signup'; tsc.hidden = code || mode !== 'signup'; tc.required = !code && mode === 'signup'; n.required = !code && mode === 'signup'; le.hidden = code; lp.hidden = code; lc.hidden = !code; g.hidden = code || !!g.dataset.off; or.hidden = code || !!or.dataset.off;
      p.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      lp.querySelector('.hint') || lp.appendChild(el('span', '', 'hint'));
      lp.querySelector('.hint').textContent = mode === 'signup' ? 'At least 8 characters.' : '';
      e.required = !code; p.required = !code; c.required = code;
      go.textContent = code ? 'Confirm my email' : mode === 'signup' ? 'Create account' : 'Sign in';
      swap.textContent = code ? 'Use a different email' : mode === 'signup' ? 'Already have an account? Sign in' : 'New to V2V? Create an account';
      again.hidden = !code;
      if (code) { sub.textContent = 'We sent a 6-digit code to ' + pending + '. It works for 20 minutes (check spam too).'; c.focus(); } else sub.textContent = lead || '';
    }
    swap.addEventListener('click', function () { if (pending) pending = ''; else mode = mode === 'signup' ? 'login' : 'signup'; msg.textContent = ''; show(); });
    again.addEventListener('click', function () { api('/api/auth', { do: 'resend', email: pending }).then(function () { msg.textContent = 'A new code is on its way.'; }); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!pending && mode === 'signup' && !tc.checked) { msg.textContent = tc.disabled ? 'Scroll to the end of the Terms of Service, then tick the box to agree.' : 'Tick the box to agree to the Terms of Service.'; return; }
      go.disabled = true; msg.textContent = pending ? 'Checking…' : mode === 'signup' ? 'Creating your account…' : 'Signing in…';
      var body = pending ? { do: 'verify', email: pending, code: c.value } : { do: mode, email: e.value, password: p.value, name: n.value, agree: tc.checked };
      // Signed in to the back office on this browser: lets the owner's own email skip the emailed code.
      try { var ak0 = localStorage.getItem('adminKey'); if (ak0 && !pending) body.ak = ak0; } catch (x) {}
      api('/api/auth', body).then(function (r) {
        go.disabled = false;
        if (r.token) { keep(r.token); msg.textContent = ''; afterSignIn(r, function () { done(r.token, !!r.created); }); return; }
        if (r.code) { pending = r.email; msg.textContent = ''; show(); return; }
        msg.textContent = r.error || 'Could not sign you in.';
        if (r._status === 409) { mode = 'login'; show(); }
      }).catch(function () { go.disabled = false; msg.textContent = 'Could not reach the site. Try again.'; });
    });
    show();
    or.hidden = true; or.dataset.off = '1';
    google(g, msg, done, null);
    // (Google's own button replaces ours once loaded.)
  }
  // The picture for a piece: its uploaded photo, else the shop's own photo files, else a plain tile with its initials.
  function picture(p) {
    var box = el('div', null, 'jf-pic');
    var tries = [p.photo, '/photos/home-' + p.id + '.jpg', '/photos/' + p.id + '.jpg'].filter(Boolean), i = 0;
    var img = el('img'); img.alt = p.name || ''; img.loading = 'lazy'; img.decoding = 'async';
    var none = function () { box.textContent = ''; var s = el('span', String(p.name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(), 'jf-ini'); box.appendChild(s); };
    img.onerror = function () { i++; if (i < tries.length) img.src = tries[i]; else none(); };
    if (tries.length) { img.src = tries[0]; box.appendChild(img); } else none();
    return box;
  }
  // The Buyer / Seller switch at the top of the account pages. One account, two sides.
  function modeBar(host, side) {
    var bar = el('div', null, 'jf-mode'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Account side');
    [['buyer', 'Buyer', '/me.html'], ['seller', 'Seller', '/seller.html']].forEach(function (x) {
      var a = el('a', x[1]); a.href = x[2]; a.setAttribute('aria-current', side === x[0] ? 'page' : 'false');
      a.addEventListener('click', function () { var t = token(); if (t && side !== x[0]) { try { navigator.sendBeacon && navigator.sendBeacon('/api/me', new Blob([JSON.stringify({ do: 'mode', t: t, mode: x[0] })], { type: 'application/json' })); } catch (e) {} } });
      bar.appendChild(a);
    });
    host.insertBefore(bar, host.firstChild);
  }
  // Stars for a rating (0 to 5, halves rounded), with the number for screen readers.
  function stars(rating, count) {
    var w = el('span', null, 'jf-stars'); var r = Math.round((Number(rating) || 0) * 2) / 2;
    w.setAttribute('aria-label', count ? (Number(rating) || 0).toFixed(1) + ' out of 5 stars, ' + count + (count === 1 ? ' review' : ' reviews') : 'No reviews yet');
    var full = el('span', '', 'on'); full.setAttribute('aria-hidden', 'true');
    var t = '', whole = Math.round(r); for (var i = 1; i <= 5; i++) t += i <= whole ? '★' : '☆';
    full.textContent = count ? t : '☆☆☆☆☆'; w.appendChild(full);
    var n = el('span', count ? ' ' + (Number(rating) || 0).toFixed(1) + ' (' + count + ')' : ' No reviews yet', 'jf-stars-n'); n.setAttribute('aria-hidden', 'true'); w.appendChild(n);
    return w;
  }
  // The verified checkmark: 10 completed sales with no issues.
  function check(small) {
    var c = el('span', null, 'jf-check-v' + (small ? ' s' : '')); c.title = 'Verified seller: completed sales with no issues';
    var i = el('span', '✓', 'i'); i.setAttribute('aria-hidden', 'true'); c.appendChild(i);
    if (!small) c.appendChild(document.createTextNode(' Verified')); else { var sr = el('span', 'Verified seller', 'jf-sr'); c.appendChild(sr); }
    return c;
  }
  // The history of one or more offers on a piece, oldest first. who: 'buyer' (you offered…) or 'seller' (they offered…).
  function offerHistory(offers, who) {
    var me = who === 'buyer';
    var ev = [];
    offers.forEach(function (o) { (o.events || []).forEach(function (e) { ev.push({ e: e, o: o }); }); });
    ev.sort(function (a, b) { return (a.e.at || 0) - (b.e.at || 0); });
    var box = el('ol'); box.style.cssText = 'margin:6px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px';
    ev.forEach(function (x) {
      var e = x.e, o = x.o, each = o.q > 1 ? ' each' : '', amt = cents(e.c);
      var t = e.kind === 'offer' ? (me ? 'You offered ' : (o.buyer || 'They') + ' offered ') + cents(o.offer) + each
        : e.kind === 'auto' ? (me ? 'You offered ' : 'Offered ') + cents(o.offer) + each + ', declined automatically (under ' + (me ? 'the seller\'s' : 'your') + ' lowest price)'
        : e.kind === 'accepted' ? (me ? 'Seller accepted' : 'You accepted') + ' at ' + cents(o.offer) + each
        : e.kind === 'countered' ? (me ? 'Seller countered at ' : 'You countered at ') + amt + each
        : e.kind === 'declined' ? (me ? 'Seller declined' : 'You declined')
        : e.kind === 'expired' ? 'Ran out before checkout' : String(e.kind);
      var li = el('li', null, 'small');
      li.appendChild(el('span', t));
      li.appendChild(el('span', '  · ' + new Date(e.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), 'dim'));
      box.appendChild(li);
    });
    if (!ev.length) box.appendChild(el('li', 'No history yet.', 'small dim'));
    return box;
  }
  // Quick offer: a sheet to offer on a piece from anywhere (a market card, a shop, the piece's page). Signed-in
  // buyers send it in two taps; the seller accepts, declines or counters in their Seller Hub.
  function quickOffer(p) {
    var uc = function (c) { return usd(c / 100); };
    var list = Math.round(Number(String(p.price).replace(/[^0-9.]/g, '')) * 100) || 0;
    var bg = el('div'); bg.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center';
    var sh = el('div'); sh.style.cssText = 'background:#0F2219;border:1px solid #2E4A3B;border-radius:18px 18px 0 0;width:100%;max-width:480px;padding:18px 16px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;color:#F7F2E6;max-height:92vh;overflow:auto';
    bg.appendChild(sh); document.body.appendChild(bg);
    var close = function () { bg.remove(); };
    bg.addEventListener('click', function (ev) { if (ev.target === bg) close(); });
    var top = el('div'); top.style.cssText = 'display:flex;gap:12px;align-items:center';
    if (p.photo) { var im = el('img'); im.src = p.photo; im.alt = ''; im.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:8px;flex:none'; top.appendChild(im); }
    var tt = el('div'); tt.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0'; tt.appendChild(el('b', '💸 Make an offer')); tt.appendChild(el('span', p.name, 'small')); tt.appendChild(el('span', 'Listed at ' + uc(list) + (p.sellerName ? ' · ' + p.sellerName : ''), 'small dim')); top.appendChild(tt);
    sh.appendChild(top);
    var body = el('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:12px'; sh.appendChild(body);
    var x = el('button', 'Cancel', 'ghost'); x.type = 'button'; x.addEventListener('click', close); sh.appendChild(x);
    var form = function (me) {
      body.textContent = '';
      var quick = el('div'); quick.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      var amt = el('input'); amt.type = 'number'; amt.min = '0.01'; amt.step = '0.01'; amt.inputMode = 'decimal'; amt.placeholder = 'Your offer in USD'; amt.style.cssText = 'font-size:22px;font-weight:800;padding:12px 14px;width:100%;box-sizing:border-box';
      [90, 85, 80].forEach(function (pc) { var c = Math.floor(list * pc / 100) / 100; var b = el('button', uc(Math.round(c * 100)) + ' (' + pc + '%)', 'ghost'); b.type = 'button'; b.style.cssText = 'padding:8px 12px;min-height:0;font-size:14px;flex:1'; b.addEventListener('click', function () { amt.value = c.toFixed(2); }); quick.appendChild(b); });
      body.appendChild(el('span', 'Your price', 'small')); body.appendChild(amt); body.appendChild(quick);
      var pay = el('select'); pay.className = 'jf-sel'; [['Card', 'Card'], ['Venmo', 'Venmo'], ['Zelle', 'Zelle'], ['Cash App', 'Cash App'], ['Ethereum', 'Crypto: ETH'], ['USDC', 'Crypto: USDC'], ['USDT', 'Crypto: USDT']].forEach(function (w) { var o = el('option', w[1]); o.value = w[0]; pay.appendChild(o); });
      body.appendChild(el('span', 'How would you pay?', 'small')); body.appendChild(pay);
      var note = el('textarea'); note.maxLength = 200; note.rows = 2; note.placeholder = 'Add a short message (optional), e.g. Can you do this price if I buy two?'; note.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px 12px;background:#0B1A13;border:1px solid #4E7A63;color:#F7F2E6;border-radius:8px;resize:vertical';
      body.appendChild(el('span', 'Message to the seller', 'small')); body.appendChild(note);
      body.appendChild(el('div', 'The seller can accept, counter, or decline, and you get an email either way. An offer does not hold the piece: someone else can still buy it at the listed price.', 'small dim'));
      var go = el('button', 'Send offer', 'solid'); go.type = 'button'; go.style.cssText = 'font-size:17px;padding:14px;font-weight:800';
      var m = el('div', '', 'small'); m.setAttribute('role', 'status');
      go.addEventListener('click', function () {
        var v = Number(amt.value); if (!(v > 0)) { m.textContent = 'Enter your offer.'; amt.focus(); return; }
        go.disabled = true; m.textContent = 'Sending your offer…';
        fetch('/api/offer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: p.id, qty: 1, offer: v.toFixed(2), pay: pay.value, note: note.value, name: me.name || String(me.email).split('@')[0], email: me.email, website: '' }) })
          .then(function (r) { return r.json(); }).then(function (r) {
            if (r.status === 'sent') { body.textContent = ''; body.appendChild(el('b', '✓ Offer sent!')); body.appendChild(el('div', r.message || 'The seller has your offer. You get an email when they answer.', 'small')); x.textContent = 'Done'; return; }
            go.disabled = r.status === 'buy' ? true : false; m.textContent = r.error || r.message || 'The offer was not sent.';
            if (r.status === 'buy') { var bn = el('a', 'Buy it now at ' + uc(list), 'solid'); bn.href = '/order.html?product=' + encodeURIComponent(p.id); bn.style.cssText = 'text-decoration:none;text-align:center'; body.appendChild(bn); }
          }, function () { go.disabled = false; m.textContent = 'Could not reach the site. Try again.'; });
      });
      body.appendChild(go); body.appendChild(m);
      setTimeout(function () { amt.focus(); }, 150);
    };
    var t = token();
    if (!t) { var b2 = el('div'); body.appendChild(b2); signInBox(b2, 'Sign in, or create a free account, to make an offer.', function (t2) { api('/api/me?t=' + encodeURIComponent(t2)).then(function (r) { form({ email: r.email, name: r.name }); }); }); return; }
    body.textContent = 'Loading…';
    api('/api/me?t=' + encodeURIComponent(t)).then(function (r) { if (r._status === 401 || !r.email) { signOut(); body.textContent = ''; var b3 = el('div'); body.appendChild(b3); signInBox(b3, 'Sign in again to make an offer.', function (t2) { api('/api/me?t=' + encodeURIComponent(t2)).then(function (r2) { form({ email: r2.email, name: r2.name }); }); }); return; } form({ email: r.email, name: r.name }); });
  }
  // Buy · Offer · Trade on a product card. Buy opens checkout, Offer opens the quick offer sheet, Trade opens the
  // piece's page with the trade form ready (sellers' pieces only).
  function cardActions(p) {
    var w = el('div', null, 'jf-acts'), go = function (ev, f) { ev.preventDefault(); ev.stopPropagation(); f(); };
    var b = el('button', 'Buy', 'jf-act buy'), o = el('button', 'Offer', 'jf-act'); b.type = o.type = 'button';
    b.addEventListener('click', function (ev) { go(ev, function () { location.href = '/order.html?product=' + encodeURIComponent(p.id); }); });
    o.addEventListener('click', function (ev) { go(ev, function () { quickOffer(p); }); });
    w.appendChild(b); w.appendChild(o);
    if (p.seller) { var t = el('button', 'Trade', 'jf-act'); t.type = 'button'; t.addEventListener('click', function (ev) { go(ev, function () { location.href = '/order.html?product=' + encodeURIComponent(p.id) + '&trade=1'; }); }); w.appendChild(t); }
    else w.style.gridTemplateColumns = '1fr 1fr';
    return w;
  }
  // The round + on a product card: puts the piece straight in the cart (it turns into a ✓ for a moment).
  function cartPlus(p) {
    var b = el('button', '+', 'jf-plus'); b.type = 'button'; b.title = 'Add to cart'; b.setAttribute('aria-label', 'Add ' + p.name + ' to cart');
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (!window.V2VCart) return;
      window.V2VCart.add({ id: p.id, name: p.name, price: p.price, ship: p.ship, calc: !!p.calc, photo: p.photo, seller: p.seller, sellerName: p.sellerName, left: p.left, nft: p.nft, qty: 1 });
      b.textContent = '✓'; b.classList.add('on'); toast('Added to your cart', '/cart.html', 'View cart');
      setTimeout(function () { b.textContent = '+'; b.classList.remove('on'); }, 1600);
    });
    return b;
  }
  function toast(text, href, link) {
    var old = document.getElementById('jfToast'); if (old) old.remove();
    var t = el('div'); t.id = 'jfToast'; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483500;background:#C9A45C;color:#0B1A13;font-weight:800;font-size:14px;white-space:nowrap;padding:11px 16px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.4);display:flex;gap:12px;align-items:center';
    t.appendChild(el('span', '🛒 ' + text)); if (href) { var a = el('a', link + ' ›'); a.href = href; a.style.cssText = 'color:#0B1A13;text-decoration:underline'; t.appendChild(a); }
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  // The "Offer" button on a product card. It opens quickOffer without following the card's link.
  function offerChip(p) {
    var b = el('button', '💸 Make an offer', 'jf-offer'); b.type = 'button'; b.setAttribute('aria-label', 'Make an offer on ' + p.name);
    b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); quickOffer(p); });
    return b;
  }
  if (!document.getElementById('jfOfferCss')) { var oc = document.createElement('style'); oc.id = 'jfOfferCss'; oc.textContent = '.jf-plus{position:absolute;top:14px;right:14px;z-index:2;width:38px;height:38px;border-radius:999px;border:0;background:#C9A45C;color:#0B1A13;font-size:24px;font-weight:900;line-height:1;cursor:pointer;min-height:0;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}.jf-plus.on{background:#3E8E5E;color:#fff}@media(max-width:520px){.jf-plus{width:34px;height:34px;top:12px;right:12px;font-size:22px}}.jf-acts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:auto;padding-top:10px}.jf-act{min-height:0;padding:9px 4px;border-radius:999px;border:1px solid #C9A45C;background:transparent;color:#F3DC9A;font-weight:800;font-size:13px;letter-spacing:.02em;cursor:pointer;line-height:1;transition:background .15s,color .15s}.jf-act:hover{background:#2A2414}.jf-act.buy{background:#C9A45C;color:#0B1A13}.jf-act.buy:hover{background:#E0BE73}@media(max-width:520px){.jf-act{font-size:12px;padding:8px 2px}}.jf-offer{display:block;width:100%;margin-top:10px;padding:9px 10px;min-height:0;border-radius:999px;border:1px solid #C9A45C;background:#2A2414;color:#F3DC9A;font-weight:800;font-size:14px;cursor:pointer}'; (document.head || document.documentElement).appendChild(oc); }
  // Search: every word typed is looked for anywhere in the listing (name, description, shop, category), in any
  // order, ignoring case, punctuation and a plural "s". "gary pin" finds "VeeFriends Gary Vee enamel PIN".
  function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9#.]+/g, ' ').trim().split(/\s+/).filter(Boolean); }
  function matches(p, q) {
    var ws = words(q); if (!ws.length) return true;
    var hay = ' ' + words([p.name, p.desc, p.sellerName, p.section, p.id].join(' ')).join(' ') + ' ';
    return ws.every(function (w) { var stem = w.length > 3 ? w.replace(/(es|s)$/, '') : w; return hay.indexOf(w) >= 0 || hay.indexOf(stem) >= 0; });
  }
  window.JF = { inApp: inApp, inAppNote: inAppNote, cartPlus: cartPlus, toast: toast, matches: matches, cardActions: cardActions, quickOffer: quickOffer, offerChip: offerChip, offerHistory: offerHistory, stars: stars, check: check, modeBar: modeBar, token: token, emailOf: emailOf, signOut: signOut, el: el, usd: usd, cents: cents, api: api, signInBox: signInBox, picture: picture };
})();
