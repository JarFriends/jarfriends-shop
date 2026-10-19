// The site menu: a small button in the corner of every page that opens the market, auctions, wishlist,
// sold archive and seller portal. Added to each page at build time (marketpages.js).
(function () {
  if (window.__jfNav) return; window.__jfNav = 1;
  var links = [['Market', '/market.html'], ['Auctions', '/market.html?view=auctions'], ['My wishlist', '/wishlist.html'], ['Recently sold', '/sold.html'], ['My orders', '/account.html'], ['Sell on JarFriends', '/seller.html']];
  var css = '.jfn-btn{position:fixed;left:16px;bottom:16px;z-index:2147483000;background:#C9A45C;color:#0B1A13;border:0;border-radius:999px;padding:12px 18px;font:700 15px Archivo,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}'
    + '.jfn-btn:focus-visible{outline:2px solid #F7F2E6;outline-offset:3px}'
    + '.jfn-panel{position:fixed;left:16px;bottom:72px;z-index:2147483000;background:#0B1A13;border:1px solid #C9A45C;min-width:220px;padding:8px 0;box-shadow:0 10px 30px rgba(0,0,0,.45);font:16px Archivo,system-ui,sans-serif}'
    + '.jfn-panel a{display:block;padding:11px 18px;color:#F7F2E6;text-decoration:none}.jfn-panel a:hover,.jfn-panel a:focus-visible{background:#11261C;color:#C9A45C;outline:none}'
    + '.jfn-panel a.here{color:#C9A45C}'
    + '@media print{.jfn-btn,.jfn-panel{display:none}}';
  function go() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'jfn-btn'; b.textContent = 'Menu'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'jfnPanel');
    var p = document.createElement('nav'); p.className = 'jfn-panel'; p.id = 'jfnPanel'; p.hidden = true; p.setAttribute('aria-label', 'Site menu');
    var a0 = document.createElement('a'); a0.href = '/'; a0.textContent = 'Home'; p.appendChild(a0);
    links.forEach(function (l) { var a = document.createElement('a'); a.href = l[1]; a.textContent = l[0]; if (location.pathname + location.search === l[1]) a.className = 'here'; p.appendChild(a); });
    var toggle = function (open) { p.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = open ? 'Close' : 'Menu'; };
    b.addEventListener('click', function () { toggle(p.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !p.hidden) { toggle(false); b.focus(); } });
    document.addEventListener('click', function (e) { if (!p.hidden && !p.contains(e.target) && e.target !== b) toggle(false); });
    document.body.appendChild(p); document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
