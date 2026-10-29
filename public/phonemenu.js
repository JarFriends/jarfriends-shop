// Phone layout for the buyer and seller pages, like the big marketplace apps: a list menu (header, three tiles,
// sections of rows with icons) and one screen at a time with a "‹ Menu" back button. Computers keep the normal page.
(function () {
  var css = '.pm{display:flex;flex-direction:column;gap:4px}'
    + '.pm-me{display:flex;align-items:center;gap:12px;padding:2px 0 12px}'
    + '.pm-av{width:46px;height:46px;border-radius:50%;background:#C9A45C;color:#0B1712;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:21px;flex:none}'
    + '.pm-me b{display:block;font-size:18px}.pm-me span{font-size:13px;opacity:.7}'
    + '.pm-cart{margin-left:auto;width:42px;height:42px;border-radius:50%;background:#11261C;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:19px}'
    + '.pm-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:6px}'
    + '.pm-tile{position:relative;background:#11261C;border-radius:14px;padding:16px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;color:#F7F2E6;font:inherit;font-size:14px;border:0;cursor:pointer;min-height:0;text-decoration:none}'
    + '.pm-tile i{font-style:normal;font-size:22px}'
    + '.pm-dot{position:absolute;top:8px;right:18%;background:#E5484D;color:#fff;border-radius:10px;font-size:11px;padding:1px 6px;font-weight:900}'
    + '.pm h2{font-size:21px;margin:14px 0 2px}'
    + '.pm-sec{display:flex;flex-direction:column;border-bottom:1px solid #2E4A3B;padding-bottom:10px}'
    + '.pm-row{display:flex;align-items:center;gap:14px;padding:9px 0;color:#F7F2E6;background:none!important;border:0!important;font:inherit;text-align:left;cursor:pointer;min-height:0;text-decoration:none;width:100%;box-shadow:none!important}'
    + '.pm-row i{font-style:normal;width:40px;height:40px;border-radius:50%;background:#11261C;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none}'
    + '.pm-row b{font-weight:500;font-size:16px;display:block}.pm-row small{display:block;font-size:13px;opacity:.65}.pm-row small.red{color:#FF6B6B;opacity:1}'
    + '@media(max-width:700px){.tour-btn{display:none!important}}'
    + '.pm-back{align-self:flex-start;background:none!important;border:0!important;color:#C9A45C!important;font-size:16px;padding:4px 0!important;min-height:0!important;cursor:pointer}';
  function el(t, x, c) { var e = document.createElement(t); if (x != null) e.textContent = x; if (c) e.className = c; return e; }
  function act(node, a) { if (typeof a === 'function') { node.type = 'button'; node.addEventListener('click', a); } else node.href = a; return node; }
  // spec: { letter, name, sub, tiles: [[icon, label, action, count]], sections: [[title, [[icon, title, sub, action, red]]]] }
  function render(host, spec) {
    if (!document.getElementById('pmCss')) { var s = el('style', css); s.id = 'pmCss'; document.head.appendChild(s); }
    var w = el('div', null, 'pm');
    var me = el('div', null, 'pm-me'); me.appendChild(el('div', spec.letter, 'pm-av'));
    var nm = el('div'); nm.appendChild(el('b', spec.name)); if (spec.sub) nm.appendChild(el('span', spec.sub)); me.appendChild(nm);
    var cart = el('a', '🛒', 'pm-cart'); cart.href = '/cart.html'; cart.setAttribute('aria-label', 'Cart'); me.appendChild(cart); w.appendChild(me);
    var tl = el('div', null, 'pm-tiles');
    (spec.tiles || []).forEach(function (t) { var a = act(el(typeof t[2] === 'function' ? 'button' : 'a', null, 'pm-tile'), t[2]); a.appendChild(el('i', t[0])); a.appendChild(el('span', t[1])); if (t[3]) a.appendChild(el('b', t[3] > 99 ? '99+' : String(t[3]), 'pm-dot')); tl.appendChild(a); });
    w.appendChild(tl);
    (spec.sections || []).forEach(function (sec) {
      w.appendChild(el('h2', sec[0])); var box = el('div', null, 'pm-sec');
      sec[1].forEach(function (r) { if (!r) return; var a = act(el(typeof r[3] === 'function' ? 'button' : 'a', null, 'pm-row'), r[3]); a.appendChild(el('i', r[0])); var t = el('span'); t.appendChild(el('b', r[1])); if (r[2]) t.appendChild(el('small', r[2], r[4] ? 'red' : '')); a.appendChild(t); box.appendChild(a); });
      w.appendChild(box);
    });
    host.appendChild(w); return w;
  }
  function back(host, fn) { if (!document.getElementById('pmCss')) render(el('div'), {}); var b = el('button', '‹ Menu', 'pm-back'); b.type = 'button'; b.addEventListener('click', fn); host.appendChild(b); return b; }
  function bell() { var b = document.querySelector('.jfn-bell'); if (b) { window.scrollTo(0, 0); setTimeout(function () { b.click(); }, 60); } }
  function counts(tok) { return fetch('/api/market?do=notify&t=' + encodeURIComponent(tok), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; }); }
  // Test mode: only people who opened a page with ?newlook=1 see it (?newlook=0 turns it off again).
  var on = false; try { var nl = new URLSearchParams(location.search).get('newlook'); if (nl === '1') localStorage.setItem('v2vNewLook', '1'); if (nl === '0') localStorage.removeItem('v2vNewLook'); on = localStorage.getItem('v2vNewLook') === '1'; } catch (e) {}
  window.V2VMenu = { phone: function () { return on && window.matchMedia('(max-width:700px)').matches; }, render: render, back: back, bell: bell, counts: counts };
})();
