// "Propose a trade" on a seller's piece: the buyer sends a photo of what they have, a short message, and money
// either way (they add money, they want money back, or an even swap). Added to order.html at build time.
(function () {
  var id = new URLSearchParams(location.search).get('product');
  if (!id) return;
  var tok = function () { try { return localStorage.getItem('acct_token') || ''; } catch (e) { return ''; } };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  function shrink(file) {
    return new Promise(function (ok, bad) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { bad(new Error('That file is not a picture we can use.')); };
      img.src = url;
    });
  }
  fetch('/api/market?do=item&id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (!p || !p.seller) return;
    // On the simple checkout (checkout.js) this starts as one small link; the card appears when it is pressed.
    var compact = document.documentElement.classList.contains('co');
    var card = el('section', null, compact ? '' : 'card'); card.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    var intro = [el('h2', 'Propose a trade'), el('div', 'Have something ' + (p.sellerName || 'the seller') + ' might want? Send a photo of it, say what it is, and whether you would add money, want money back, or swap even. They accept or pass, and if they accept you both get each other\'s email to arrange the swap.', 'small')];
    if (!compact) intro.forEach(function (n) { card.appendChild(n); });
    var open = el('button', compact ? 'Propose a trade instead' : 'Propose a trade', compact ? 'co-link' : 'ghost'); open.type = 'button'; open.style.alignSelf = 'flex-start';
    if (compact) open.addEventListener('click', function () { card.className = 'card'; intro.forEach(function (n, i) { card.insertBefore(n, card.children[i] || null); }); });
    card.appendChild(open);
    var form = el('form'); form.hidden = true; form.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    card.appendChild(form);
    open.addEventListener('click', function () {
      if (!tok()) { open.hidden = true; var s = el('div', null, 'small'); s.appendChild(document.createTextNode('Sign in to propose a trade: ')); var a = el('a', 'sign in or make an account'); a.href = '/me.html'; s.appendChild(a); s.appendChild(document.createTextNode(', then come back to this piece.')); card.appendChild(s); return; }
      form.hidden = false; open.hidden = true;
    });
    var lab = function (t, node, hint) { var l = el('label', t); l.appendChild(node); if (hint) l.appendChild(el('span', hint, 'small dim')); l.style.cssText = 'display:flex;flex-direction:column;gap:6px'; return l; };
    var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.required = true;
    var prev = el('img'); prev.alt = ''; prev.hidden = true; prev.style.cssText = 'max-width:220px;border-radius:6px';
    file.addEventListener('change', function () { if (file.files[0]) { prev.src = URL.createObjectURL(file.files[0]); prev.hidden = false; } });
    form.appendChild(lab('Photo of what you are offering', file)); form.appendChild(prev);
    var text = el('textarea'); text.rows = 4; text.maxLength = 1000; text.required = true; text.placeholder = 'What it is, its condition, anything else they should know.';
    form.appendChild(lab('What you are offering', text));
    var dir = el('select');
    [['even', 'Even swap, no money'], ['add', 'I add money on top'], ['ask', 'I want money back']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; dir.appendChild(op); });
    var diff = el('input'); diff.type = 'number'; diff.min = '0'; diff.step = '0.01'; diff.inputMode = 'decimal'; diff.placeholder = '0.00';
    var diffL = lab('How much (USD)', diff); diffL.hidden = true;
    dir.addEventListener('change', function () { diffL.hidden = dir.value === 'even'; });
    form.appendChild(lab('Money', dir)); form.appendChild(diffL);
    var go = el('button', 'Send trade request', 'solid'); go.type = 'submit'; go.style.alignSelf = 'flex-start';
    var msg = el('div', '', 'small'); msg.setAttribute('role', 'status');
    form.appendChild(go); form.appendChild(msg);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!file.files[0]) { msg.textContent = 'Add a photo of what you are offering.'; return; }
      go.disabled = true; msg.textContent = 'Sending…';
      shrink(file.files[0]).then(function (data) {
        return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ do: 'trade', t: tok(), pid: id, text: text.value, dir: dir.value, diff: diff.value, data: data }) }).then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
      }).then(function (r) {
        go.disabled = false;
        if (r._status === 401) { msg.textContent = 'Please sign in again on your account page, then come back.'; return; }
        if (r.error) { msg.textContent = r.error; return; }
        form.hidden = true; card.appendChild(el('div', 'Sent. ' + (p.sellerName || 'The seller') + ' will see it in their store office, and we will email you their answer. You can follow it on your account page.', 'small'));
      }).catch(function (e) { go.disabled = false; msg.textContent = e && e.message ? e.message : 'It did not send. Try again.'; });
    });
    var after = document.getElementById('offerBox') || document.querySelector('main section.card');
    if (after && after.parentNode) after.parentNode.insertBefore(card, after.nextSibling); else (document.querySelector('main') || document.body).appendChild(card);
  }).catch(function () {});
})();
