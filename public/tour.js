// Seller Hub walkthrough: "🎓 Learn features" opens a step-by-step guide that moves through the Hub's tabs and
// points at each one. Shown once by itself to new sellers; anyone can restart it from the button.
(function () {
  var STEPS = [
    ['', '👋 Welcome to your Seller Hub', 'This is where you run your shop. This quick tour shows you each part. It takes about a minute, and you can leave any time.'],
    ['Settings', '⚙️ Set up your shop', 'Write a short "about" for your shop and add your ship-from address and phone (needed for shipping labels). Choose whether you ship internationally. You can also add your Zelle, Venmo, Cash App, PayPal or crypto so buyers can pay you directly.'],
    ['Payments', '💳 Get paid', 'Link your bank with Stripe and card sales go straight to you, automatically. Need it sooner? "Get paid now" sends it instantly for a small Stripe fee. Not using Stripe? Add another payout method and V2V sends your earnings.'],
    ['Listings', '📸 List a piece', 'Press "+ Add a product": add a photo (you can clean the background), name, price and quantity. Pick shipping (free, flat or calculated), Buy now or Auction (1 hour to 14 days), returns, and the lowest offer you will take.'],
    ['Orders', '📦 Ship your orders', 'When something sells it shows here. Buy the shipping label right on the site, print it, and the buyer gets the tracking automatically. Return requests show up here too.'],
    ['Offers', '🤝 Answer offers', 'Buyers can offer less than your price. Accept, counter or decline. When you accept, the buyer gets a link to pay at that price for 48 hours.'],
    ['Trades', '🔁 Trades', 'Buyers can offer a trade (their pieces, with or without cash) for yours. Look it over and accept or decline.'],
    ['Marketing', '📣 Marketing', 'Post updates to your shop and make promo codes: percent off, dollars off or free shipping.'],
    ['What you owe', '🧾 Fees', 'V2V takes 5.55% of the item price only (never shipping or tax). Card sales take it automatically. If a buyer paid you directly (Zelle, Venmo, crypto...), the fee shows here so you can pay it in a tap.'],
    ['Messages', '💬 Messages and the 🔔 bell', 'Buyers can message you here. The 🔔 bell at the top shows anything that needs you: new offers, orders to ship, returns. Tap it to jump straight there.'],
    ['', '✅ You are all set', 'Start by adding your first product. You can take this tour again any time with the 🎓 Learn features button.']
  ];
  var i = 0, ov = null, lit = null;
  var css = '.tour-ov{position:fixed;left:0;right:0;bottom:0;z-index:100000;display:flex;justify-content:center;padding:16px 16px 76px;pointer-events:none}'
    + '.tour-card{pointer-events:auto;width:100%;max-width:520px;background:#0E2219;border:1px solid #C9A45C;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.55);padding:18px 18px 14px;display:flex;flex-direction:column;gap:10px;color:#F7F2E6}'
    + '.tour-card h3{margin:0;font-size:18px}.tour-card p{margin:0;font-size:15px;line-height:1.5;opacity:.92}'
    + '.tour-dots{display:flex;gap:5px}.tour-dots i{width:7px;height:7px;border-radius:99px;background:#2E4A3B}.tour-dots i.on{background:#C9A45C}'
    + '.tour-row{display:flex;justify-content:space-between;align-items:center;gap:10px}.tour-row div{display:flex;gap:8px}'
    + '.tour-row button{min-height:0!important;padding:8px 14px!important;border-radius:999px!important;font-size:14px}'
    + '.tour-lit{outline:3px solid #C9A45C!important;outline-offset:3px;border-radius:8px;box-shadow:0 0 0 6px rgba(201,164,92,.25)!important}'
    + '.tour-btn{border-radius:999px!important}';
  function el(t, x, c) { var e = document.createElement(t); if (x != null) e.textContent = x; if (c) e.className = c; return e; }
  function tabBtn(label) { var bs = document.querySelectorAll('.hub-tabs button'); for (var k = 0; k < bs.length; k++) if (bs[k].textContent.indexOf(label) === 0) return bs[k]; return null; }
  function light(b) { if (lit) lit.classList.remove('tour-lit'); lit = b; if (b) { b.classList.add('tour-lit'); try { b.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (e) {} } }
  function show() {
    var s = STEPS[i];
    if (s[0]) { var b = tabBtn(s[0]); if (b) { b.click(); setTimeout(function () { light(tabBtn(s[0])); }, 120); } } else { light(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    var c = ov.firstChild; c.textContent = '';
    c.appendChild(el('div', 'Step ' + (i + 1) + ' of ' + STEPS.length, 'small dim'));
    c.appendChild(el('h3', s[1])); c.appendChild(el('p', s[2]));
    var d = el('div', null, 'tour-dots'); STEPS.forEach(function (_, k) { d.appendChild(el('i', null, k === i ? 'on' : '')); }); c.appendChild(d);
    var r = el('div', null, 'tour-row'), sk = el('button', i === STEPS.length - 1 ? '' : 'Skip tour', 'ghost'), nav = el('div');
    sk.type = 'button'; sk.style.visibility = i === STEPS.length - 1 ? 'hidden' : 'visible'; sk.addEventListener('click', end);
    if (i > 0) { var bk = el('button', 'Back', 'ghost'); bk.type = 'button'; bk.addEventListener('click', function () { i--; show(); }); nav.appendChild(bk); }
    var nx = el('button', i === STEPS.length - 1 ? 'Done' : 'Next', 'solid'); nx.type = 'button';
    nx.addEventListener('click', function () { if (i === STEPS.length - 1) { end(); var lb = tabBtn('Listings'); if (lb) lb.click(); } else { i++; show(); } });
    nav.appendChild(nx); r.appendChild(sk); r.appendChild(nav); c.appendChild(r); nx.focus();
  }
  function end() { light(null); if (ov) ov.remove(); ov = null; try { localStorage.setItem('v2vTourSeen', '1'); } catch (e) {} }
  function start() {
    if (!document.getElementById('tourCss')) { var st = el('style', css); st.id = 'tourCss'; document.head.appendChild(st); }
    if (ov) ov.remove(); i = 0; ov = el('div', null, 'tour-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Seller Hub tour');
    ov.appendChild(el('div', null, 'tour-card')); document.body.appendChild(ov); show();
  }
  // The button goes beside the tabs every time the Hub draws them; new sellers see the tour once by itself.
  function addButton() {
    var tabs = document.querySelector('.hub-tabs');
    if (!tabs || tabs.previousElementSibling && tabs.previousElementSibling.classList && tabs.previousElementSibling.classList.contains('tour-btn')) return;
    var b = el('button', '🎓 Learn features', 'ghost tour-btn'); b.type = 'button'; b.style.alignSelf = 'flex-start'; b.addEventListener('click', start);
    tabs.parentNode.insertBefore(b, tabs);
    var seen = '1'; try { seen = localStorage.getItem('v2vTourSeen') || ''; } catch (e) {}
    if (!seen && !/[?&]as=/.test(location.search)) { try { localStorage.setItem('v2vTourSeen', '1'); } catch (e) {} setTimeout(start, 600); }
  }
  new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
  window.V2VTour = { start: start };
})();
