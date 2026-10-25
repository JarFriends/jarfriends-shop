// Checkout: says which shop a piece comes from, with a link to that shop. Added to order.html at build time.
(function () {
  var id = new URLSearchParams(location.search).get('product');
  if (!id) return;
  // Count one view of this piece per visit, for the seller's Traffic numbers.
  try { var seen = sessionStorage.getItem('v2vView-' + id); if (!seen) { sessionStorage.setItem('v2vView-' + id, '1'); fetch('/api/market?do=view&id=' + encodeURIComponent(id)).catch(function () {}); } } catch (e) {}
  fetch('/api/market?do=item&id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (!p || !p.sellerName) return;
    var d = document.createElement('div'); d.className = 'small'; d.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
    d.appendChild(document.createTextNode('Sold by '));
    if (p.seller) {
      var a = document.createElement('a'); a.href = '/shop.html?s=' + encodeURIComponent(p.seller); a.textContent = p.sellerName; a.style.fontWeight = '700'; d.appendChild(a);
      if (p.verified) { var v = document.createElement('span'); v.style.cssText = 'color:#8FD3AE;font-weight:700'; v.textContent = '✓ Verified'; d.appendChild(v); }
      var r = document.createElement('a'); r.href = '/shop.html?s=' + encodeURIComponent(p.seller) + '#reviews'; r.textContent = p.reviews ? '★ ' + Number(p.rating).toFixed(1) + ' (' + p.reviews + (p.reviews === 1 ? ' review)' : ' reviews)') : 'No reviews yet'; r.style.color = 'inherit'; d.appendChild(r);
      if (!document.documentElement.classList.contains('co')) d.appendChild(document.createTextNode('· sold and paid through V2V'));
    }
    else d.appendChild(document.createTextNode(p.sellerName));
    // Ask the seller a question about this piece (messages.html).
    if (p.seller) {
      var q = document.createElement('a'); q.href = '/messages.html?to=' + encodeURIComponent(p.seller) + '&pid=' + encodeURIComponent(id); q.textContent = '💬 Ask the seller a question';
      q.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid #C9A45C;border-radius:999px;color:#E8C77A;text-decoration:none;font-weight:700;font-size:14px;margin-left:4px';
      d.appendChild(q);
    }
    var h = document.querySelector('main h1');
    if (h && h.parentNode) h.parentNode.insertBefore(d, h.nextSibling); else { var m = document.querySelector('main'); if (m) m.insertBefore(d, m.firstChild); }
  }).catch(function () {});
})();
