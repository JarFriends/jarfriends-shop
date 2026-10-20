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
    var note = hint || el('div', '', 'small dim'); note.textContent = 'Scroll to the end of the Terms to unlock the agree box.';
    var unlock = function () { if (!box.offsetParent || box.scrollHeight < 40) return; if (box.scrollTop + box.clientHeight >= box.scrollHeight - 12) { cb.disabled = false; note.textContent = 'Thanks for reading. You can agree now.'; box.removeEventListener('scroll', unlock); } };
    (termsHtml ? Promise.resolve(termsHtml) : fetch('/terms.html', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (h) {
      var d = new DOMParser().parseFromString(h, 'text/html'), a = d.querySelector('article.terms');
      termsHtml = a ? a.innerHTML : ''; return termsHtml;
    })).then(function (h) {
      if (!h) { box.textContent = 'The Terms did not load. Read them at /terms.html, then tick the box.'; cb.disabled = false; return; }
      box.innerHTML = h; Array.prototype.forEach.call(box.querySelectorAll('h1'), function (x) { x.style.fontSize = '18px'; });
      Array.prototype.forEach.call(box.querySelectorAll('h2'), function (x) { x.style.fontSize = '15px'; x.style.margin = '14px 0 4px'; });
      box.addEventListener('scroll', unlock); setTimeout(unlock, 50);
    }).catch(function () { box.textContent = 'The Terms did not load. Read them at /terms.html, then tick the box.'; cb.disabled = false; });
    var wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px'; wrap.appendChild(box); wrap.appendChild(note);
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
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return { error: 'The site did not answer. Try again.' }; }).then(function (j) { j._status = r.status; if (j && j.needTerms && (body || /^\/(me|seller|wishlist|account|giveaway)\.html/.test(location.pathname))) termsGate(); return j; }); });
  }
  // The V2V sign-in box: Continue with Google, or an email and password. A new password account confirms its
  // email with a 6-digit code first. done(token) runs once signed in; the token is kept as acct_token.
  var gLoad = null;
  // Google's sign-in script is only loaded once someone taps "Continue with Google": loaded up front, it hooks into the
  // email box's autofill in some browsers, which has made a browser close when typing an email.
  function google(host, msg, done, or) {
    if (!host.dataset.armed) {
      host.dataset.armed = '1';
      var gb = el('button', 'Continue with Google', 'ghost'); gb.type = 'button'; gb.style.cssText = 'width:100%;max-width:300px;min-height:44px';
      gb.addEventListener('click', function () { gb.disabled = true; gb.textContent = 'Opening Google…'; host.textContent = ''; realGoogle(host, msg, done, or); });
      host.appendChild(gb);
      return;
    }
    realGoogle(host, msg, done, or);
  }
  function realGoogle(host, msg, done, or) {
    gLoad = gLoad || fetch('/api/google', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
      if (!c.clientId) return null;
      return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = function () { ok(c.clientId); }; sc.onerror = function () { ok(null); }; document.head.appendChild(sc); });
    }).catch(function () { return null; });
    gLoad.then(function (cid) {
      if (!cid || !window.google) { host.hidden = true; host.dataset.off = '1'; if (or) { or.hidden = true; or.dataset.off = '1'; } return; }
      window.google.accounts.id.initialize({ client_id: cid, callback: function (resp) {
        msg.textContent = 'Signing you in…';
        api('/api/google', { credential: resp.credential }).then(function (r) { if (!r.token) { msg.textContent = r.error || 'Could not sign in with Google.'; return; } keep(r.token); afterSignIn(r, function () { done(r.token); }); });
      } });
      window.google.accounts.id.renderButton(host, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'rectangular', width: 300 });
      msg.textContent = 'Press the Google button to continue.';
    });
  }
  function keep(t) { try { localStorage.setItem('acct_token', t); localStorage.removeItem('bid_token'); } catch (x) {} }
  function signInBox(host, lead, done, startMode) {
    var mode = startMode === 'signup' ? 'signup' : 'login', pending = '';
    host.textContent = '';
    var card = el('section', null, 'card'); card.style.cssText = 'gap:16px;max-width:520px';
    var head = el('h2'), sub = el('div', lead || '', 'small');
    var g = el('div'); g.style.minHeight = '44px';
    var or = el('div', 'or with your email', 'label'); or.style.textAlign = 'center';
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
  window.JF = { offerHistory: offerHistory, stars: stars, check: check, modeBar: modeBar, token: token, emailOf: emailOf, signOut: signOut, el: el, usd: usd, cents: cents, api: api, signInBox: signInBox, picture: picture };
})();
