// The party at checkout and on the order page. For the party piece, checkout uses the party price: the discount
// for the level reached, counting the buyer's own units, is taken off before they pay.
(function () {
  var usd = function (n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var get = function (url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  get('/api/party').then(function (p) {
    if (!p || !p.on || p.ended || !p.note) return;
    var box = document.createElement('div');
    box.className = 'small';
    box.setAttribute('role', 'note');
    box.style.cssText = 'border:1px solid #C9A45C;border-radius:2px;padding:12px 14px;color:#F7F2E6;max-width:640px;display:flex;flex-direction:column;gap:10px';
    var text = document.createElement('div'), b = document.createElement('strong');
    b.textContent = 'Party price. ';
    text.appendChild(b); text.appendChild(document.createTextNode(p.note + ' Party orders are paid by card.'));
    box.hidden = true;
    var sel = document.getElementById('product'), unit = document.getElementById('unit'), item = document.getElementById('oItem'), mail = document.getElementById('mail');
    if (sel && unit) {
      var qty = document.getElementById('qty'), total = document.querySelector('.sums .row.total'), lead = document.getElementById('lead');
      var qs = new URLSearchParams(location.search), sent = qs.get('party') === '1';
      unit.parentNode.insertBefore(box, unit.nextSibling);
      // Reload checkout at the party price for q units.
      var going = false;
      var reload = function (q) {
        if (going) return;
        going = true;
        get('/api/party?qty=' + q).then(function (r) {
          var n = new URLSearchParams(location.search);
          n.set('product', p.pid); n.set('qty', q); n.set('party', '1'); n.delete('make');
          if (r && r.order && r.order.key) n.set('offer', r.order.key); else n.delete('offer');
          location.replace('/order.html?' + n.toString());
        }, function () { going = false; });
      };
      var offFor = function (q) { var after = Math.min(p.total, p.sold + q), off = 0; (p.tiers || []).forEach(function (t) { if (after >= t.need) off = Math.max(off, t.off); }); return off; };
      // How many: a list of every quantity left, each with its discount and price. Picking one reprices checkout.
      var pickWrap = document.createElement('label'), pick = document.createElement('select');
      pickWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:15px';
      pickWrap.appendChild(document.createTextNode('How many do you want?'));
      for (var i = 1; i <= p.left; i++) {
        var o = document.createElement('option'), f = offFor(i);
        o.value = i;
        o.textContent = i + (f ? ': ' + f + '% off, ' + usd(Number(p.price) * (100 - f) / 100) + ' each' : ': no discount yet, ' + usd(p.price) + ' each');
        pick.appendChild(o);
      }
      pick.addEventListener('change', function () { reload(Number(pick.value)); });
      pickWrap.appendChild(pick);
      box.appendChild(pickWrap); box.appendChild(text);
      // A line under the total that says what the party did to this order.
      var row = document.createElement('div'), lab = document.createElement('span'), val = document.createElement('span');
      row.className = 'row'; row.hidden = true; lab.className = 'dim'; val.style.color = '#8FD3AE';
      row.appendChild(lab); row.appendChild(val);
      if (total) total.parentNode.insertBefore(row, total.nextSibling);
      var qtyField = qty.closest ? qty.closest('label') : null, shown = '';
      setInterval(function () {
        var on = sel.value === p.pid;
        box.hidden = !on; row.hidden = !on;
        // The party piece uses the list above in place of the usual quantity box.
        if (qtyField) qtyField.style.display = on ? 'none' : '';
        // The party piece is paid by card, so any money back at the end is automatic.
        var card = document.getElementById('mCard');
        if (card && !card.hidden) {
          Array.prototype.forEach.call(document.querySelectorAll('#methods .plan'), function (el) { if (el !== card) el.style.display = on ? 'none' : ''; });
          var radio = card.querySelector('input');
          if (on && radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        if (!on || going) return;
        var q = Math.max(1, Math.floor(Number(qty.value) || 1)), off = offFor(q), locked = sel.disabled;
        if (String(q) !== shown && document.activeElement !== pick) { shown = String(q); pick.value = String(Math.min(q, p.left)); }
        if (locked) {
          // Checkout is already at the party price.
          if (lead) lead.textContent = 'Party price: ' + off + '% off is taken off below.';
          lab.textContent = 'Listed at ' + usd(p.price) + ' each. Party price ' + off + '% off, already taken off';
          val.textContent = 'You save ' + usd(Number(p.price) * q * off / 100);
          return;
        }
        lab.textContent = 'Party price';
        val.textContent = off ? off + '% off' : 'No discount yet at this quantity';
        // Arrived at a quantity that earns a discount without the party price applied: apply it. Tried once per page.
        if (off && q <= p.left && (!sent || !qs.get('offer'))) reload(q);
      }, 300);
    } else if (item && mail) {
      // Order placed: shown when the order is for the party piece.
      box.appendChild(text);
      mail.parentNode.insertBefore(box, mail);
      var tries = 0, t = setInterval(function () {
        if (item.textContent.indexOf(p.name) === 0) { box.hidden = false; clearInterval(t); }
        if (++tries > 40) clearInterval(t);
      }, 400);
    }
  }).catch(function () {});
})();
