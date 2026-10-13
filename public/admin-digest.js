// The daily update box at the top of the back office: what changed since the last update, and one button that
// emails it to everyone on the list (once a day). See api/_digest.js.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var main = $('main'), tabs = document.querySelector('.tabs');
  if (!main || !tabs) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var get = function (extra) { return fetch('/api/admin?k=' + encodeURIComponent(key()) + extra, { cache: 'no-store' }).then(function (r) { return r.json(); }); };
  var box = el('section', null, 'card'); box.style.cssText = 'display:flex;flex-direction:column;gap:10px;border-color:#C9A45C';
  // Right under the totals, above the Orders / Customers / Products row.
  var anchor = tabs.parentNode && tabs.parentNode.parentNode === main ? tabs.parentNode : null;
  if (anchor) main.insertBefore(box, anchor); else main.insertBefore(box, main.firstChild);
  var when = function (t) { return new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

  function draw(p) {
    box.textContent = '';
    var top = el('div'); top.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline';
    top.appendChild(el('b', 'Daily update email'));
    top.appendChild(el('span', p.lastSent ? 'Last sent ' + when(p.lastSent) : 'Not sent yet', 'small'));
    box.appendChild(top);
    var items = [];
    if (p.safe) items.push((p.safe.n >= p.safe.total ? 'The Vault (safe ' : 'Deal of the day: safe ') + p.safe.n + ' is open');
    (p.added || []).forEach(function (x) { items.push('New: ' + x.name + ' ($' + x.price + ')'); });
    (p.drops || []).forEach(function (x) { items.push('Price drop: ' + x.name + ' ($' + x.was + ' → $' + x.price + ')'); });
    (p.auctions || []).forEach(function (x) { items.push('Auction: ' + x.name + ' (' + (x.bids ? 'current bid $' : 'starts at $') + x.current + ')'); });
    if (!items.length) box.appendChild(el('div', 'Nothing new since the last update. Add a piece, drop a price or open a safe, and it shows up here. Or write a message below and send just that.', 'small'));
    else {
      box.appendChild(el('div', 'Ready to go out to ' + p.people + (p.people === 1 ? ' person' : ' people') + ':', 'small'));
      var ul = el('ul'); ul.style.cssText = 'margin:0;padding-left:20px;display:flex;flex-direction:column;gap:2px;font-size:14px';
      items.forEach(function (t) { ul.appendChild(el('li', t)); });
      box.appendChild(ul);
    }
    // Your own message, sent at the top of the email (for example: We now ship worldwide!). Optional.
    var nl = el('label', 'Add your own message (optional)'); nl.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:13px';
    var note = el('textarea'); note.rows = 3; note.maxLength = 1500; note.placeholder = 'For example: We now ship worldwide! Pick your country at checkout and the shipping is worked out for your address.'; note.style.cssText = 'resize:vertical;min-height:70px';
    try { note.value = localStorage.getItem('digestNote') || ''; } catch (e) {}
    nl.appendChild(note); if (!p.sending) box.appendChild(nl);
    var msg = el('div', '', 'small');
    var go = el('button', p.sending ? 'Finish sending (' + p.done + ' of ' + p.people + ' sent)' : 'Send today\'s update', 'solid'); go.type = 'button'; go.style.cssText = 'align-self:flex-start;padding:11px 20px';
    var gate = function () {
      var off = !p.sending && (!p.canSend || (p.empty && !note.value.trim()));
      go.disabled = off; go.style.opacity = off ? '.55' : '';
      msg.textContent = !p.sending && !p.canSend ? 'Today\'s update was already sent. You can send the next one tomorrow.' : '';
    };
    note.addEventListener('input', function () { try { localStorage.setItem('digestNote', note.value); } catch (e) {} gate(); });
    gate();
    go.addEventListener('click', function () {
      if (!p.sending && !confirm('Email this update to ' + p.people + (p.people === 1 ? ' person' : ' people') + ' now?' + (note.value.trim() ? ' Your message goes at the top.' : '') + ' You can send one update a day.')) return;
      go.disabled = true;
      var step = function (first) {
        go.textContent = 'Sending...';
        get('&digest=send' + (first ? '&start=1&note=' + encodeURIComponent(note.value.trim()) : '')).then(function (r) {
          if (r.error) { msg.textContent = r.error; go.disabled = false; go.textContent = 'Send today\'s update'; return; }
          msg.textContent = r.sent + ' sent' + (r.left ? ', ' + r.left + ' to go...' : '. Done.');
          if (r.finished) { try { localStorage.removeItem('digestNote'); } catch (e) {} setTimeout(load, 1200); return; }
          step(false);
        }, function () { msg.textContent = 'Lost the connection. Press the button again to finish sending.'; go.disabled = false; go.textContent = 'Finish sending'; });
      };
      step(!p.sending);
    });
    box.appendChild(go); box.appendChild(msg);
  }
  function load() {
    if (!key()) { box.hidden = true; return; }
    box.hidden = false; box.textContent = 'Checking what is new...';
    get('&digest=preview').then(function (p) { if (p.error) { box.hidden = true; return; } draw(p); }, function () { box.textContent = 'Could not check for the daily update.'; });
  }
  load();
})();
