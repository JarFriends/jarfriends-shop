// Checkout: says which shop a piece comes from, with a link to that shop. Added to order.html at build time.
(function () {
  var id = new URLSearchParams(location.search).get('product');
  if (!id) return;
  fetch('/api/market?do=item&id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (!p || !p.sellerName) return;
    var d = document.createElement('div'); d.className = 'small'; d.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
    d.appendChild(document.createTextNode('Sold by '));
    if (p.seller) {
      var a = document.createElement('a'); a.href = '/shop.html?s=' + encodeURIComponent(p.seller); a.textContent = p.sellerName; a.style.fontWeight = '700'; d.appendChild(a);
      if (p.verified) { var v = document.createElement('span'); v.style.cssText = 'color:#8FD3AE;font-weight:700'; v.textContent = '✓ Verified'; d.appendChild(v); }
      var r = document.createElement('a'); r.href = '/shop.html?s=' + encodeURIComponent(p.seller) + '#reviews'; r.textContent = p.reviews ? '★ ' + Number(p.rating).toFixed(1) + ' (' + p.reviews + (p.reviews === 1 ? ' review)' : ' reviews)') : 'No reviews yet'; r.style.color = 'inherit'; d.appendChild(r);
      d.appendChild(document.createTextNode('· sold and paid through V2V'));
    }
    else d.appendChild(document.createTextNode(p.sellerName));
    var h = document.querySelector('main h1');
    if (h && h.parentNode) h.parentNode.insertBefore(d, h.nextSibling); else { var m = document.querySelector('main'); if (m) m.insertBefore(d, m.firstChild); }
  }).catch(function () {});
})();
