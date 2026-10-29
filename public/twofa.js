// Two-step sign-in setup box (authenticator app). V2V2FA.box(container, call): call(body) posts to the right
// endpoint and resolves to its JSON. Used in Seller Hub settings, My account and the back office.
(function () {
  function el(t, x, c) { var e = document.createElement(t); if (x != null) e.textContent = x; if (c) e.className = c; return e; }
  var qrLib = null;
  function qr(uri, box) {
    function draw() { try { var q = window.qrcode(0, 'M'); q.addData(uri); q.make(); var d = el('div'); d.innerHTML = q.createSvgTag({ cellSize: 5, margin: 3 }); d.style.cssText = 'background:#fff;border-radius:10px;display:inline-block;line-height:0'; box.appendChild(d); } catch (e) {} }
    if (window.qrcode) return draw();
    if (!qrLib) { qrLib = el('script'); qrLib.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; document.head.appendChild(qrLib); }
    qrLib.addEventListener('load', draw);
  }
  function box(c, call) {
    c.textContent = ''; c.style.display = 'flex'; c.style.flexDirection = 'column'; c.style.gap = '10px';
    c.appendChild(el('h2', '🔐 Two-step sign-in'));
    var m = el('div', 'Checking...', 'small'); c.appendChild(m);
    call({ do: '2fa-status' }).then(function (r) {
      m.textContent = '';
      if (r.error) { m.textContent = r.error; return; }
      if (r.on) {
        c.appendChild(el('div', '✓ On. Signing in needs the 6-digit code from your authenticator app.', 'small'));
        var code = el('input'); code.inputMode = 'numeric'; code.maxLength = 6; code.placeholder = '6-digit code'; code.style.maxWidth = '160px';
        var off = el('button', 'Turn off', 'ghost'); off.type = 'button';
        off.onclick = function () { off.disabled = true; call({ do: '2fa-off', code: code.value }).then(function (x) { off.disabled = false; if (x.error) m.textContent = x.error; else box(c, call); }); };
        var row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center'; row.appendChild(code); row.appendChild(off);
        c.appendChild(el('div', 'To turn it off, type a code from the app:', 'small dim')); c.appendChild(row); c.appendChild(m);
        return;
      }
      c.appendChild(el('div', 'Off. Turn it on so signing in also needs a code from an authenticator app on your phone (Google Authenticator, Authy, 1Password, Microsoft Authenticator).', 'small'));
      var go = el('button', 'Set it up', 'solid'); go.type = 'button'; go.style.alignSelf = 'flex-start'; c.appendChild(go); c.appendChild(m);
      go.onclick = function () {
        go.disabled = true;
        call({ do: '2fa-setup' }).then(function (s) {
          go.remove(); if (s.error) { m.textContent = s.error; return; }
          c.appendChild(el('div', '1. In your authenticator app, add an account and scan this code:', 'small'));
          var q = el('div'); c.appendChild(q); qr(s.uri, q);
          c.appendChild(el('div', 'Can\'t scan? Type this key in instead:', 'small dim'));
          var k = el('code', s.secret.replace(/(.{4})/g, '$1 ').trim()); k.style.cssText = 'word-break:break-all;user-select:all'; c.appendChild(k);
          c.appendChild(el('div', '2. Type the 6-digit code the app shows:', 'small'));
          var code = el('input'); code.inputMode = 'numeric'; code.maxLength = 6; code.placeholder = '6-digit code'; code.style.maxWidth = '160px';
          var ok = el('button', 'Turn on', 'solid'); ok.type = 'button';
          var row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center'; row.appendChild(code); row.appendChild(ok); c.appendChild(row);
          var m2 = el('div', '', 'small'); c.appendChild(m2);
          ok.onclick = function () { ok.disabled = true; call({ do: '2fa-confirm', code: code.value }).then(function (x) { ok.disabled = false; if (x.error) m2.textContent = x.error; else box(c, call); }); };
        });
      };
    }, function () { m.textContent = 'Could not reach the site.'; });
  }
  window.V2V2FA = { box: box };
})();
