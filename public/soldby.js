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
    // Add to cart, for Buy now pieces (not auctions or party pricing, which have their own checkout).
    if (!p.auction && !p.party && p.left > 0 && window.V2VCart) {
      var ca = document.createElement('button'); ca.type = 'button'; ca.textContent = '🛒 Add to cart';
      ca.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid #C9A45C;border-radius:999px;background:#C9A45C;color:#0B1A13;font-weight:800;font-size:14px;cursor:pointer;min-height:0;margin-left:4px';
      var added = false; ca.addEventListener('click', function () { if (added) { location.href = '/cart.html'; return; } added = true; var qn = document.getElementById('qty'); window.V2VCart.add({ id: p.id, name: p.name, price: p.price, ship: p.ship, photo: p.photo, seller: p.seller, sellerName: p.sellerName, left: p.left, nft: p.nft, qty: Math.max(1, Number(qn && qn.value) || 1) }); ca.textContent = '✓ In your cart · View cart ›'; });
      d.appendChild(ca);
    }
    // Make an offer: opens the offer form on this page (checkout.js keeps it behind a small link).
    if (!p.auction && !p.party && p.left > 0) {
      var mo = document.createElement('button'); mo.type = 'button'; mo.textContent = '💸 Make an offer';
      mo.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border:2px solid #C9A45C;border-radius:999px;background:#2A2414;color:#F3DC9A;font-weight:800;font-size:15px;cursor:pointer;min-height:0;margin-left:4px';
      mo.addEventListener('click', function () { if (window.JF && JF.quickOffer) JF.quickOffer({ id: p.id, name: p.name, price: p.price, photo: p.photo, sellerName: p.sellerName }); });
      d.appendChild(mo);
    }
    var h = document.querySelector('main h1');
    if (h && h.parentNode) h.parentNode.insertBefore(d, h.nextSibling); else { var m = document.querySelector('main'); if (m) m.insertBefore(d, m.firstChild); }
  }).catch(function () {});
})();
