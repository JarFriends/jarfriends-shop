// A simpler buy page (added to order.html at build time). When a buyer comes from a piece (?product=), the page
// is only about that piece: no product list, a small header with its photo and price, quantity only when there is
// more than one, short pay choices, and the extras (promo code, offer, trade) tucked behind small links.
// It only rearranges and hides what order.html already has, so checkout itself works exactly as before.
(function () {
  var qs = new URLSearchParams(location.search), id = qs.get('product');
  if (!id || qs.get('offer')) return;
  var $ = function (x) { return document.getElementById(x); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var css = el('style');
  css.textContent = [
    '.co main.page{gap:16px}',
    '.co #lead,.co .stack-s .mono,.co #unit,.co #usOnly,.co label.plan>span>span:not(:first-child){display:none!important}',
    '.co .stack-s{gap:0}.co #h1{font-size:clamp(26px,5vw,34px)}',
    '.co section.card{padding:18px;gap:14px}',
    '.co #f{gap:14px}',
    '.co .co-head{display:flex;gap:14px;align-items:center}',
    '.co .co-head img{width:84px;height:84px;object-fit:cover;border-radius:6px;flex:none;background:#17191F}',
    '.co .co-head b{display:block;font-size:17px;line-height:1.3}',
    '.co #methods{display:grid!important;grid-template-columns:1fr 1fr;gap:8px;border:0;padding:0;margin:0}',
    '.co #methods label.plan[hidden]{display:none!important}',
    '.co #taxNote,.co #feeNote{display:none!important}',
    '.co #methods legend{font-size:14px;font-weight:700;margin-bottom:6px;padding:0;grid-column:1/-1;float:left;width:100%}',
    '.co #methods label.plan{display:flex!important;align-items:center;gap:10px;height:auto!important;min-height:0!important;padding:10px 12px!important;margin:0}',
    '.co #methods label.plan>span{display:block;min-height:0!important}',
    '.co #feeTag{display:block;font-size:12px!important}',
    '.co #methods label.plan strong{font-size:15px}',
    '.co .sums .row{padding:4px 0}',
    '.co #shipBox{border:0;padding:0;margin:0;gap:10px}',
    '.co #shipBox legend{font-size:14px;font-weight:700;padding:0;margin-bottom:6px}',
    '.co .co-link{background:none;border:0;padding:0;color:inherit;text-decoration:underline;font:inherit;font-size:14px;cursor:pointer;align-self:flex-start;min-height:0}',
    '.co .co-addr{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between;font-size:15px}',
    '.co #go{width:100%;min-height:52px;font-size:17px}',
    '.co #shipBox .two{gap:10px}.co #shipBox .two>label{flex:1 1 130px}'
  ].join('');
  document.head.appendChild(css);
  document.documentElement.classList.add('co');

  var tries = 0;
  (function wait() {
    // order.html fills the product list and pay options after it loads; start once the piece is chosen.
    var sel = $('product');
    if (!sel || !sel.value || sel.value !== id) { if (++tries < 60) return setTimeout(wait, 150); return; }
    build();
  })();

  function hide(node) { if (node) node.style.display = 'none'; }
  function build() {
    var f = $('f'), sel = $('product'), qty = $('qty');
    $('h1').textContent = 'Checkout';
    // 1. No product list: just this piece.
    var grid = sel.closest('.two');
    var head = el('div', null, 'co-head');
    var img = el('img'); img.alt = ''; img.hidden = true; head.appendChild(img);
    var txt = el('div'); var nm = el('b', sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent.replace(/\s*\(.*$/, '') : ''); txt.appendChild(nm);
    var sub = el('div', '', 'small dim'); txt.appendChild(sub); head.appendChild(txt);
    grid.parentNode.insertBefore(head, grid);
    hide(sel.closest('label'));
    var qtyL = qty.closest('label');
    qtyL.firstChild.textContent = 'Quantity';
    qtyL.style.maxWidth = '140px';
    fetch('/api/market?do=item&id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
      if (!p) return;
      if (p.name) nm.textContent = p.name;
      if (p.photo) { img.src = p.photo; img.hidden = false; }
      var usd = function (v) { return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      sub.textContent = usd(p.price) + (Number(p.ship) > 0 ? ' + ' + usd(p.ship) + ' shipping' : ' · free shipping');
      if (Number(p.left) <= 1) hide(qtyL);
    }).catch(function () {});
    // 2. Fewer fields: no company, short pay choices.
    var co = f.elements.company; if (co) hide(co.closest('label'));
    var lg = document.querySelector('#methods legend'); if (lg) lg.textContent = 'Pay with';
    // 3. Promo code behind a link.
    var pb = $('promoBox');
    if (pb) {
      var pl = el('button', 'Have a promo code?', 'co-link'); pl.type = 'button';
      pb.parentNode.insertBefore(pl, pb);
      var watch = function () { pl.style.display = pb.hidden ? 'none' : ''; };
      var shown = false;
      pb.style.setProperty('display', 'none', 'important');
      pl.addEventListener('click', function () { shown = true; pb.style.removeProperty('display'); pb.style.display = 'flex'; pl.remove(); });
      new MutationObserver(function () { if (!shown) watch(); }).observe(pb, { attributes: true, attributeFilter: ['hidden'] }); watch();
    }
    // 4. A saved address shows as one line with Change.
    var sb = $('shipBox');
    setTimeout(function () {
      var e = f.elements;
      if (!sb || !e.street || !e.street.value || !e.city.value || !e.zip.value) return;
      var parts = Array.prototype.filter.call(sb.children, function (c) { return c.tagName !== 'LEGEND' && c.id !== 'taxNote' && c.id !== 'intlNote'; });
      parts.forEach(function (c) { c.dataset.coWas = c.style.display || ''; c.style.display = 'none'; });
      var line = el('div', null, 'co-addr');
      line.appendChild(el('span', e.street.value + (e.line2.value ? ', ' + e.line2.value : '') + ', ' + e.city.value + ', ' + e.state.value + ' ' + e.zip.value));
      var ch = el('button', 'Change', 'co-link'); ch.type = 'button';
      ch.addEventListener('click', function () { parts.forEach(function (c) { c.style.display = c.dataset.coWas; }); line.remove(); });
      line.appendChild(ch);
      sb.appendChild(line);
      var lgd = sb.querySelector('legend'); if (lgd) lgd.textContent = 'Ship to';
    }, 1800);
    // 5. Offer box behind a button, so the page is one short form.
    var ob = $('offerBox');
    if (ob) {
      var ol = el('button', 'Make an offer instead', 'co-link'); ol.type = 'button';
      var place = function () {
        if (ob.hidden || ob.dataset.coDone) return;
        ob.dataset.coDone = '1'; ob.style.display = 'none';
        ob.parentNode.insertBefore(ol, ob);
        ol.addEventListener('click', function () { ob.style.display = ''; ol.remove(); ob.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      };
      new MutationObserver(place).observe(ob, { attributes: true, attributeFilter: ['hidden'] }); place();
    }
    $('go').textContent = 'Buy now';
  }
})();
