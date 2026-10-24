// A simpler buy page (added to order.html at build time). When a buyer comes from a piece (?product=), the page
// is only about that piece: no product list, a small header with its photo and price, quantity only when there is
// more than one, short pay choices, and the extras (promo code, offer, trade) tucked behind small links.
// It only rearranges and hides what order.html already has, so checkout itself works exactly as before.
(function () {
  // Buying needs an account: someone not signed in sees the sign-in box (or Create an account) first, and the
  // checkout opens once they are in. The order itself is refused without a sign-in too (api/order.js).
  (function mustSignIn() {
    var t = ''; try { t = localStorage.getItem('acct_token') || ''; } catch (e) { t = ''; }
    var live = !!(window.JF && JF.emailOf && JF.emailOf(t));
    if (live) return;
    if (!window.JF || !JF.signInBox) return setTimeout(mustSignIn, 150);
    var main = document.querySelector('main') || document.body;
    Array.prototype.forEach.call(main.children, function (c) { c.dataset.coWait = '1'; c.style.display = 'none'; });
    var host = document.createElement('div'); host.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    var h = document.createElement('h1'); h.textContent = 'Sign in to buy'; host.appendChild(h);
    var p = document.createElement('div'); p.className = 'small'; p.textContent = 'Buying on VeeFam.io needs a free account. It keeps your orders, tracking and receipts in one place, and lets you vote on the community giveaway.'; host.appendChild(p);
    var box = document.createElement('div'); host.appendChild(box);
    main.insertBefore(host, main.firstChild);
    JF.signInBox(box, '', function () { location.reload(); }, 'login');
  })();
  // Every checkout (with or without an account) asks the buyer to agree to the Terms before placing the order.
  (function terms() {
    var go = document.getElementById('go');
    if (!go) return setTimeout(terms, 200);
    if (document.getElementById('coTerms')) return;
    var l = document.createElement('label'); l.className = 'jf-check'; l.id = 'coTerms'; l.style.cssText = 'font-size:14px';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.required = true; cb.name = 'agreeTerms'; l.appendChild(cb);
    var sp = document.createElement('span'); sp.appendChild(document.createTextNode('I agree to the ')); var a = document.createElement('a'); a.href = '/terms.html'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'VeeFam.io Terms of Service'; sp.appendChild(a);
    sp.appendChild(document.createTextNode('. I am buying from an independent seller; VeeFam.io is only the marketplace and is not responsible for any loss.')); l.appendChild(sp);
    // The full Terms in a scroll box above the box; the box unlocks once they reach the end.
    var tb = document.createElement('div'); tb.id = 'coTermsBox'; tb.setAttribute('tabindex', '0');
    tb.style.cssText = 'max-height:200px;overflow-y:auto;border:1px solid #4E7A63;padding:10px 12px;font-size:13px;line-height:1.5;background:rgba(0,0,0,.18)';
    tb.textContent = 'Loading the Terms…'; cb.disabled = true;
    var tn = document.createElement('div'); tn.style.cssText = 'background:#C9A45C;color:#0B1A13;font-weight:800;font-size:15px;padding:10px 14px;border-radius:6px'; tn.textContent = '⬇ Scroll down through all the Terms. The agree box unlocks at the bottom.';
    var un = function () { if (!tb.offsetParent || tb.scrollHeight < 40) return; if (tb.scrollTop + tb.clientHeight >= tb.scrollHeight - 12) { cb.disabled = false; tn.textContent = '✓ Thanks for reading. Now tick the box to agree.'; tn.style.background = '#1F4D36'; tn.style.color = '#F7F2E6'; tb.removeEventListener('scroll', un); } };
    fetch('/terms.html', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (h) {
      var art = new DOMParser().parseFromString(h, 'text/html').querySelector('article.terms');
      if (!art) throw 0; tb.innerHTML = art.innerHTML;
      Array.prototype.forEach.call(tb.querySelectorAll('h1,h2'), function (x) { x.style.fontSize = '15px'; x.style.margin = '12px 0 4px'; });
      tb.addEventListener('scroll', un); setTimeout(un, 50);
    }).catch(function () { tb.textContent = 'The Terms did not load. Read them at /terms.html, then tick the box.'; cb.disabled = false; });
    go.parentNode.insertBefore(tn, go); go.parentNode.insertBefore(tb, go);
    go.parentNode.insertBefore(l, go);
    // A locked (disabled) box is skipped by the browser's own required check, so stop the order here instead.
    var stop = function (ev) { if (document.body.contains(l) && !cb.checked) { ev.preventDefault(); ev.stopImmediatePropagation(); tn.textContent = cb.disabled ? 'Scroll to the end of the Terms, then tick the box to agree.' : 'Tick the box to agree to the Terms.'; tn.style.color = '#E8A0A0'; (cb.disabled ? tb : cb).focus(); } };
    if (go.form) go.form.addEventListener('submit', stop, true); go.addEventListener('click', stop, true);
    // Signed in and already signed the Terms: no need to agree again.
    var t = ''; try { t = localStorage.getItem('acct_token') || ''; } catch (e) {}
    if (t) fetch('/api/me?t=' + encodeURIComponent(t), { cache: 'no-store' }).then(function (r) { if (r.ok) { cb.required = false; cb.disabled = false; cb.checked = true; l.remove(); tb.remove(); tn.remove(); } }).catch(function () {});
  })();
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
    '.co #taxNote{display:none!important}',
    '.co #feeNote{display:block!important;margin:6px 0 2px;padding:8px 10px;border-left:3px solid #C9A45C;background:rgba(201,164,92,.10);color:#F7F2E6;font-size:13px;line-height:1.45}',
    '.co #rFee{font-weight:700}',
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
      // A quick way to check the price against what similar pieces sold for.
      var fmv = el('a', 'See what similar pieces sold for'); fmv.href = '/sold.html?q=' + encodeURIComponent(String(p.name || '').split(/\s+/).slice(0, 2).join(' ')); fmv.className = 'small'; fmv.style.display = 'block'; txt.appendChild(fmv);
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
    party(head, qty);
  }
  // Party pricing (api/_partyS.js): a countdown, the levels, and checkout at the party price for the units picked.
  function party(head, qty) {
    fetch('/api/market?do=party&id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (!st || st.ended) return;
      var usd = function (c) { return '$' + (c / 100).toFixed(2); }, skew = st.serverNow - Date.now();
      var box = el('div'); box.style.cssText = 'border:2px solid #E5484D;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;background:rgba(229,72,77,.07)';
      box.appendChild(el('b', '🎉 PARTY PRICING: the more that sell, the lower the price for everyone'));
      var pr = el('div'); pr.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap';
      if (st.off) { var was = el('span', usd(st.price)); was.style.cssText = 'text-decoration:line-through;text-decoration-color:#E5484D;text-decoration-thickness:3px;opacity:.6;font-size:20px'; pr.appendChild(was); }
      var now = el('span', usd(st.now)); now.style.cssText = 'font:800 32px/1 "IBM Plex Mono",monospace;color:#C9A45C'; pr.appendChild(now);
      if (st.off) pr.appendChild(el('span', st.off + '% off right now', 'small'));
      box.appendChild(pr);
      var cd = el('div'); cd.style.cssText = 'font:700 18px/1.2 "IBM Plex Mono",monospace;color:#FF8A8E'; box.appendChild(cd);
      var tickCd = function () { var l = Math.max(0, st.ends - (Date.now() + skew)), d = Math.floor(l / 864e5), h = Math.floor(l / 36e5) % 24, m = Math.floor(l / 6e4) % 60, sc = Math.floor(l / 1e3) % 60; cd.textContent = l ? '⏳ Ends in ' + (d ? d + 'd ' : '') + h + 'h ' + m + 'm ' + sc + 's' : 'The party has ended'; };
      tickCd(); setInterval(tickCd, 1000);
      var last = st.tiers[st.tiers.length - 1].need, bar = el('div'), fill = el('span'); bar.style.cssText = 'height:10px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden'; fill.style.cssText = 'display:block;height:100%;background:linear-gradient(90deg,#C9A45C,#E5484D);width:' + Math.min(100, Math.round(st.sold * 100 / last)) + '%'; bar.appendChild(fill); box.appendChild(bar);
      box.appendChild(el('div', st.sold + ' sold so far' + (st.next ? ' · ' + st.next.more + ' more to reach ' + st.next.off + '% off' : ' · top level reached!'), 'small'));
      var ul = el('div'); ul.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:14px';
      st.tiers.forEach(function (t) { var li = el('div', (t.reached ? '✅ ' : '⬜ ') + t.need + ' sold → ' + t.off + '% off (' + usd(t.price) + ')'); if (t.reached) li.style.fontWeight = '700'; ul.appendChild(li); });
      box.appendChild(ul);
      box.appendChild(el('div', 'Your own units count toward the next level. Paid by card only. If the price drops further after you buy, the difference goes back to your card automatically when the party ends.', 'small dim'));
      head.parentNode.insertBefore(box, head.nextSibling);
      // Checkout goes through the party price for the units picked.
      var go = $('go'); go.textContent = 'Buy at the party price';
      go.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopImmediatePropagation();
        var n = Math.max(1, Number(qty && qty.value) || 1); go.disabled = true;
        fetch('/api/market?do=party-quote&id=' + encodeURIComponent(id) + '&q=' + n, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
          if (r.error || !r.key) { go.disabled = false; alert(r.error || 'The party price did not load. Try again.'); return; }
          location.href = '/order.html?offer=' + encodeURIComponent(r.key);
        }).catch(function () { go.disabled = false; });
      }, true);
    }).catch(function () {});
  }
})();
