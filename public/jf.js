// Shared bits for the market pages: sign-in, money, cards. Exposes window.JF.
(function () {
  var KEYS = ['acct_token', 'bid_token'];
  function token() {
    try { for (var i = 0; i < KEYS.length; i++) { var t = localStorage.getItem(KEYS[i]); if (t) return t; } } catch (e) {}
    return '';
  }
  // Who a sign-in belongs to, read from the token itself (the site signs it; the server checks it on every call).
  function emailOf(t) {
    try { var j = JSON.parse(atob(String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); return j.x * 1000 > Date.now() ? j.e || '' : ''; } catch (e) { return ''; }
  }
  function signOut() { try { KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function usd(v) { return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cents(c) { return usd((c || 0) / 100); }
  function api(path, body) {
    var o = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return { error: 'The site did not answer. Try again.' }; }).then(function (j) { j._status = r.status; return j; }); });
  }
  // A sign-in box: email and password. The first time makes the account; after that the same password signs in.
  // Also offers the emailed link for people who ordered before.
  function signInBox(host, lead, done) {
    host.textContent = '';
    var card = el('section', null, 'card'); card.style.gap = '14px';
    card.appendChild(el('h2', 'Sign in'));
    if (lead) card.appendChild(el('div', lead, 'small'));
    var f = el('form'); f.style.gap = '12px';
    var le = el('label', 'Email'), e = el('input'); e.type = 'email'; e.required = true; e.autocomplete = 'email'; e.placeholder = 'you@example.com'; le.appendChild(e);
    var lp = el('label', 'Password'), p = el('input'); p.type = 'password'; p.required = true; p.minLength = 6; p.autocomplete = 'current-password'; lp.appendChild(p);
    lp.appendChild(el('span', 'New here? Pick a password (6+ characters) and your account is made.', 'hint'));
    var go = el('button', 'Sign in', 'solid'); go.type = 'submit';
    var msg = el('div', '', 'small'); msg.setAttribute('role', 'status');
    f.appendChild(le); f.appendChild(lp); f.appendChild(go); f.appendChild(msg);
    card.appendChild(f);
    var alt = el('div', null, 'small dim'); alt.appendChild(document.createTextNode('Ordered before? You can also '));
    var a = el('a', 'get an emailed sign-in link'); a.href = '/account.html?next=' + encodeURIComponent(location.pathname + location.search); alt.appendChild(a); alt.appendChild(document.createTextNode('.'));
    card.appendChild(alt);
    host.appendChild(card);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); go.disabled = true; msg.textContent = 'Signing in…';
      api('/api/login', { email: e.value, password: p.value }).then(function (r) {
        go.disabled = false;
        if (!r.token) { msg.textContent = r.error || 'Could not sign you in.'; return; }
        try { localStorage.setItem('bid_token', r.token); } catch (x) {}
        done(r.token, !!r.created);
      }).catch(function () { go.disabled = false; msg.textContent = 'Could not reach the site. Try again.'; });
    });
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
  window.JF = { token: token, emailOf: emailOf, signOut: signOut, el: el, usd: usd, cents: cents, api: api, signInBox: signInBox, picture: picture };
})();
