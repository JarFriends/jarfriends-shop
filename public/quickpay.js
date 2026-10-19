// Checkout for signed-in buyers (added to order.html at build time):
// 1. fills in name, email and ship-to address from the account, and picks the buyer's favorite way to pay;
// 2. when they pay by card and have a saved card, asks "Use VISA ending 4242?" before charging it.
//    Yes charges the saved card on the spot; "Use a different card" opens Stripe's card page as before.
(function () {
  var t = ''; try { t = localStorage.getItem('acct_token') || ''; } catch (e) {}
  if (!t) return;
  var me = null;
  var F = function () { return document.getElementById('f'); };
  fetch('/api/me?t=' + encodeURIComponent(t), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (!m || m.error) return;
    me = m;
    var f = F(); if (!f) return;
    var fill = function (name, v) { var i = f.elements[name]; if (i && !i.value && v) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } };
    var a = m.address || {};
    fill('name', a.name || m.name); fill('email', m.email);
    fill('street', a.street); fill('line2', a.line2); fill('city', a.city); fill('state', a.state); fill('zip', a.zip);
    var want = m.prefer === 'card' || (m.cards && m.cards.length && !m.prefer) ? 'card' : m.prefer;
    // The page may still be showing or hiding pay options; pick the favorite once its option is visible.
    var tries = 0, pick = function () {
      var r = want && document.querySelector('input[name="method"][value="' + want + '"]');
      var lab = r && r.closest('label');
      if (r && lab && !lab.hidden) { if (!r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      if (++tries < 20) setTimeout(pick, 250);
    };
    pick();
  }).catch(function () {});

  // Holds the order page's own "go to the card page" step while the buyer answers.
  var plain = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var p = plain(url, opts);
    var isOrder = typeof url === 'string' && /^\/api\/order(\?|$)/.test(url) && opts && opts.method === 'POST';
    if (!isOrder || !me || !me.cards || !me.cards.length) return p;
    var body = {}; try { body = JSON.parse(opts.body); } catch (e) {}
    if (body.method !== 'card') return p;
    return p.then(function (res) {
      return res.clone().json().then(function (j) {
        if (!j.link || j.link.indexOf('/api/stripe?inv=') < 0) return res;
        var inv = new URL(j.link, location.href).searchParams.get('inv');
        return ask(inv, j.link).then(function (out) { return new Response(JSON.stringify(Object.assign({}, j, { link: out })), { status: 200, headers: { 'content-type': 'application/json' } }); });
      }).catch(function () { return res; });
    });
  };

  function ask(inv, cardPage) {
    return new Promise(function (done) {
      var card = me.cards.filter(function (c) { return c.id === me.defaultCard; })[0] || me.cards[0];
      var total = (document.getElementById('sTotal') || {}).textContent || '';
      var wrap = document.createElement('div'); wrap.className = 'jf-modal'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'qpH');
      var box = document.createElement('div'); box.className = 'card';
      var h = document.createElement('h2'); h.id = 'qpH'; h.textContent = 'Use this card?';
      var line = document.createElement('div'); line.className = 'small';
      var sel = null;
      if (me.cards.length > 1) {
        sel = document.createElement('select'); sel.className = 'jf-sel'; sel.style.width = '100%';
        me.cards.forEach(function (c) { var o = document.createElement('option'); o.value = c.id; o.textContent = c.brand + ' ending ' + c.last4 + ' (exp ' + c.exp + ')'; if (c.id === card.id) o.selected = true; sel.appendChild(o); });
        line.textContent = 'Pay ' + (total ? total + ' ' : '') + 'with:';
      } else line.textContent = 'Pay ' + (total ? total + ' ' : '') + 'with your saved ' + card.brand + ' ending ' + card.last4 + ' (exp ' + card.exp + ')?';
      var msg = document.createElement('div'); msg.className = 'small'; msg.setAttribute('role', 'status');
      var yes = document.createElement('button'); yes.type = 'button'; yes.className = 'solid'; yes.textContent = 'Yes, pay now';
      var other = document.createElement('button'); other.type = 'button'; other.className = 'ghost'; other.textContent = 'Use a different card';
      var row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'; row.appendChild(yes); row.appendChild(other);
      [h, line].concat(sel ? [sel] : []).concat([row, msg]).forEach(function (x) { box.appendChild(x); });
      wrap.appendChild(box); document.body.appendChild(wrap); yes.focus();
      var close = function (url) { wrap.remove(); done(url); };
      other.addEventListener('click', function () { close(cardPage); });
      wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(cardPage); });
      yes.addEventListener('click', function () {
        yes.disabled = true; other.disabled = true; msg.textContent = 'Charging your card…';
        plain('/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ do: 'quickpay', t: t, inv: inv, pm: sel ? sel.value : card.id }) })
          .then(function (r) { return r.json(); })
          .then(function (r) {
            if (r.link) return close(r.link);
            if (r.redirect) return close(r.redirect);
            if (r.fallback) { msg.textContent = r.error || 'Opening the card page…'; setTimeout(function () { close(r.fallback); }, 1800); return; }
            yes.disabled = false; other.disabled = false; msg.textContent = r.error || 'Your card was not charged. Try again or use a different card.';
          }, function () { yes.disabled = false; other.disabled = false; msg.textContent = 'Could not reach the site. Your card was not charged.'; });
      });
    });
  }
})();
