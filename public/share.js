// Share a piece: copy its link, post on X, WhatsApp, or the phone's share sheet (Instagram, Discord, texts).
// The link is /api/market?do=og&id=..., which shows the piece's photo, name and price as the preview, then opens it.
(function () {
  function el(t, x, c) { var e = document.createElement(t); if (x != null) e.textContent = x; if (c) e.className = c; return e; }
  window.V2VShare = function (host, p) {
    if (!host || document.getElementById('shareBar')) return;
    var url = location.origin + '/api/market?do=og&id=' + encodeURIComponent(p.id), txt = (p.auction ? '🔨 Bid on ' : '👀 Check out ') + p.name + (p.price ? ' for $' + Number(p.price).toFixed(2) : '') + ' on VeeFam';
    var w = el('div'); w.id = 'shareBar'; w.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:12px';
    w.appendChild(el('div', 'Share this piece', 'small dim'));
    var r = el('div'); r.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; w.appendChild(r);
    var m = el('div', '', 'small'); w.appendChild(m);
    var b = function (t, fn) { var x = el('button', t, 'ghost'); x.type = 'button'; x.style.cssText = 'padding:8px 14px;min-height:0;border-radius:999px;font-size:14px'; x.addEventListener('click', fn); r.appendChild(x); return x; };
    var a = function (t, href) { var x = el('a', t, 'ghost'); x.href = href; x.target = '_blank'; x.rel = 'noopener'; x.style.cssText = 'padding:8px 14px;border-radius:999px;font-size:14px;text-decoration:none;border:1px solid #4E7A63;color:#F7F2E6'; r.appendChild(x); return x; };
    b('🔗 Copy link', function () { var ok = function () { m.textContent = 'Link copied. Paste it on Instagram, Discord, anywhere. It shows the photo and price.'; }; if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { prompt('Copy this link:', url); }); else prompt('Copy this link:', url); });
    a('𝕏 Post', 'https://x.com/intent/post?text=' + encodeURIComponent(txt) + '&url=' + encodeURIComponent(url));
    a('WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(txt + ' ' + url));
    if (navigator.share) b('📤 Share (Instagram, Discord, texts…)', function () { navigator.share({ title: p.name, text: txt, url: url }).catch(function () {}); });
    host.appendChild(w);
  };
})();
