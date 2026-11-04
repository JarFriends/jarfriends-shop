// 🔐 Deal of the Day vaults on the home page: one vault open at a time; the next unlocks when it is claimed.
(function () {
  var host = document.getElementById('dealBox'); if (!host) return;
  function el(t, x, c) { var e = document.createElement(t); if (x != null) e.textContent = x; if (c) e.className = c; return e; }
  var css = '.vt-wrap{display:flex;flex-direction:column;gap:10px;margin:8px 0 18px}.vt-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.vt-head h2{margin:0;font-size:24px}'
    + '.vt-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory}'
    + '.vt{flex:0 0 200px;scroll-snap-align:start;border-radius:16px;border:1px solid #2E4A3B;background:#11261C;padding:12px;display:flex;flex-direction:column;gap:6px;text-decoration:none;color:#F7F2E6;position:relative}'
    + '.vt.open{border:2px solid #C9A45C;box-shadow:0 0 24px rgba(201,164,92,.35)}.vt img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#0B1712}'
    + '.vt .lock{width:100%;aspect-ratio:1;border-radius:10px;background:repeating-linear-gradient(45deg,#0B1712,#0B1712 10px,#13291F 10px,#13291F 20px);display:flex;align-items:center;justify-content:center;font-size:56px}'
    + '.vt .tag{font-size:12px;font-weight:800;letter-spacing:.06em}.vt.open .tag{color:#C9A45C}.vt.claimed{opacity:.55}.vt b{font-size:15px;line-height:1.25}.vt .pr{font-weight:800;color:#C9A45C}';
  var st = el('style', css); document.head.appendChild(st);
  fetch('/api/market?do=deals', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
    var L = r.deals || []; if (!L.length) return;
    var w = el('section', null, 'vt-wrap'), hd = el('div', null, 'vt-head'); hd.appendChild(el('h2', '🔐 Deal of the Day')); hd.appendChild(el('span', 'One vault opens at a time. When it is claimed, the next one unlocks.', 'small dim')); w.appendChild(hd);
    var row = el('div', null, 'vt-row');
    L.forEach(function (d, i) {
      var c = el(d.state === 'open' ? 'a' : 'div', null, 'vt ' + d.state);
      if (d.state === 'open') c.href = '/piece.html?id=' + encodeURIComponent(d.id);
      c.appendChild(el('span', d.state === 'open' ? '🔓 VAULT ' + d.n + ' · OPEN NOW' : d.state === 'claimed' ? '✓ VAULT ' + d.n + ' · CLAIMED' : '🔒 VAULT ' + d.n, 'tag'));
      if (d.state === 'locked') { c.appendChild(el('div', '🔒', 'lock')); c.appendChild(el('span', 'Opens when vault ' + (L[i - 1] ? L[i - 1].n : d.n - 1) + ' is claimed', 'small dim')); }
      else {
        if (d.photo) { var im = el('img'); im.src = d.photo; im.alt = ''; im.loading = 'lazy'; c.appendChild(im); } else c.appendChild(el('div', '🎁', 'lock'));
        c.appendChild(el('b', d.name)); c.appendChild(el('span', '$' + d.price + (Number(d.ship) ? ' + $' + d.ship + ' ship' : ' · free shipping'), 'pr'));
        if (d.state === 'open') c.appendChild(el('span', d.left > 1 ? d.left + ' left' : 'Only 1 · grab it', 'small'));
      }
      row.appendChild(c);
    });
    w.appendChild(row); host.appendChild(w);
  }).catch(function () {});
})();
