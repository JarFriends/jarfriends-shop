// The visual site editor. The owner opens any page with ?edit=1 (from back office > Site editor) while signed in to
// the back office on this browser. Click anything on the page to change its words, hide that part, or add a picture
// above or below it. Changes are saved to the same list the Site editor tab shows (see api/_wording.js).
(function () {
  if (window.__siteEdit) return; window.__siteEdit = true;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var here = location.pathname === '/index.html' ? '/' : location.pathname;
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var css = el('style');
  css.textContent = '.se-ui,.se-ui *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif!important;letter-spacing:0!important;text-transform:none!important}'
    + '.se-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:#C9A45C;color:#0B1A13;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 14px;font-size:14px;font-weight:700;box-shadow:0 -4px 18px rgba(0,0,0,.4)}'
    + '.se-ui button{font-size:14px!important;font-weight:700!important;padding:8px 12px!important;min-height:0!important;border-radius:4px!important;cursor:pointer;border:1px solid #0B1A13!important;background:#0B1A13!important;color:#F7F2E6!important}'
    + '.se-ui button.se-g{background:transparent!important;color:inherit!important;border-color:currentColor!important}'
    + '.se-panel{position:fixed;top:0;right:0;bottom:56px;z-index:2147483647;width:min(420px,100vw);overflow-y:auto;background:#0E1A14;color:#F7F2E6;border-left:3px solid #C9A45C;padding:16px;display:flex;flex-direction:column;gap:12px;font-size:15px;line-height:1.45;box-shadow:-10px 0 40px rgba(0,0,0,.55)}'
    + '@media(max-width:640px){.se-panel{top:auto;left:0;width:100vw;max-height:72vh;border-left:0;border-top:3px solid #C9A45C;border-radius:14px 14px 0 0}}'
    + '.se-panel input,.se-panel select{width:100%;height:auto!important;min-height:44px!important;font-size:15px!important;padding:10px 12px!important;background:#0B1712!important;color:#F7F2E6!important;border:1px solid #4E7A63!important;border-radius:6px!important}'
    + '.se-panel textarea{display:block;width:100%!important;height:auto!important;min-height:130px!important;max-height:none!important;font-size:16px!important;line-height:1.45!important;padding:12px!important;background:#0B1712!important;color:#F7F2E6!important;border:1px solid #4E7A63!important;border-radius:6px!important;resize:vertical;white-space:pre-wrap!important;overflow:auto!important}'
    + '.se-panel input[type=checkbox]{width:20px!important;min-height:0!important;height:20px!important;padding:0!important}'
    + '.se-panel input[type=file]{padding:8px!important}'
    + '.se-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.se-h{font-weight:800;font-size:16px}.se-dim{opacity:.8;font-size:13px}.se-sec{display:flex;flex-direction:column;gap:10px}'
    + '.se-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.se-panel .se-tabs button{background:transparent!important;color:#F7F2E6!important;border:1px solid #4E7A63!important}.se-panel .se-tabs button[aria-pressed=true]{background:#C9A45C!important;color:#0B1A13!important;border-color:#C9A45C!important}'
    + '.se-quote{background:#0B1712;border-left:3px solid #C9A45C;padding:8px 10px;font-size:14px;opacity:.9}'
    + '.se-panel label.se-row{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:flex-start!important;text-align:left!important;font-weight:500!important;font-size:14px!important;gap:10px!important;margin:0!important}'
    + '.se-head{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.se-head .se-h{flex:1;font-size:14px;font-weight:700;opacity:.9}'
    + '.se-panel .se-main{background:#C9A45C!important;color:#0B1A13!important;border-color:#C9A45C!important}'
    + '.se-hover{outline:2px solid #C9A45C!important;outline-offset:2px!important;cursor:pointer!important}.se-pick{outline:3px solid #FF6B3D!important;outline-offset:2px!important}';
  document.head.appendChild(css);
  if (!key()) return;

  var bar = el('div', null, 'se-ui se-bar');
  bar.appendChild(el('span', '✏️ Editing this page. Click any words, picture or part of the page to change it.'));
  var br = el('span'); br.style.cssText = 'display:flex;gap:8px';
  var bo = el('button', 'Back office', 'se-g'); bo.type = 'button'; bo.addEventListener('click', function () { location.href = '/admin.html'; });
  var dn = el('button', 'Done editing'); dn.type = 'button'; dn.addEventListener('click', function () { location.href = location.pathname + location.search.replace(/([?&])edit=1&?/, '$1').replace(/[?&]$/, '') + location.hash; });
  br.appendChild(bo); br.appendChild(dn); bar.appendChild(br);
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '70px';

  var panel = null, picked = null, hover = null;
  var ours = function (n) { return n && n.closest && n.closest('.se-ui'); };
  document.addEventListener('mouseover', function (e) { if (panel || ours(e.target)) return; if (hover) hover.classList.remove('se-hover'); hover = e.target; if (hover && hover !== document.body && hover !== document.documentElement) hover.classList.add('se-hover'); }, true);
  document.addEventListener('mouseout', function (e) { if (e.target === hover) { hover.classList.remove('se-hover'); hover = null; } }, true);
  // While editing, clicks pick things instead of following links or pressing buttons.
  document.addEventListener('submit', function (e) { if (!ours(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('click', function (e) {
    if (ours(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (panel) return;
    var t = e.target; if (!t || t === document.body || t === document.documentElement) return;
    var tn = null;
    try {
      if (document.caretRangeFromPoint) { var rg = document.caretRangeFromPoint(e.clientX, e.clientY); tn = rg && rg.startContainer; }
      else if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(e.clientX, e.clientY); tn = cp && cp.offsetNode; }
    } catch (x) { tn = null; }
    if (!tn || tn.nodeType !== 3 || !t.contains(tn) || !tn.nodeValue.trim()) tn = null;
    if (!tn) { for (var i = 0; i < t.childNodes.length; i++) if (t.childNodes[i].nodeType === 3 && t.childNodes[i].nodeValue.trim()) { tn = t.childNodes[i]; break; } }
    open(t, tn);
  }, true);

  // Where a part sits on the page, written so it can be found again: its id, or its place among its parent's children.
  function pathOf(n) {
    var parts = [];
    while (n && n.nodeType === 1 && n !== document.body) {
      if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) { parts.unshift('#' + CSS.escape(n.id)); return parts.join(' > '); }
      var tag = n.tagName.toLowerCase(), i = 1, s = n;
      while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      n = n.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  var snip = function (n) { var t = String(n.innerText || n.alt || n.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > 70 ? t.slice(0, 70) + '…' : t) : '(' + n.tagName.toLowerCase() + (n.tagName === 'IMG' ? ' picture' : '') + ')'; };

  function close() { if (panel) panel.remove(); panel = null; if (picked) picked.classList.remove('se-pick'); picked = null; }
  function open(t, tn) {
    picked = t; t.classList.remove('se-hover'); t.classList.add('se-pick');
    panel = el('div', null, 'se-ui se-panel'); panel.setAttribute('role', 'dialog');
    var msg = el('div', '', 'se-dim'); msg.setAttribute('role', 'status');
    var head = el('div', null, 'se-head');
    var what = el('div', null, 'se-h'); head.appendChild(what);
    var x = el('button', 'Close', 'se-g'); x.type = 'button'; x.addEventListener('click', close); head.appendChild(x);
    panel.appendChild(head);
    var size = el('div', null, 'se-row');
    var big = el('button', 'Select a bigger area', 'se-g'); big.type = 'button';
    var small = el('button', 'Smaller', 'se-g'); small.type = 'button';
    var trail = [];
    var show = function () { what.textContent = 'Selected: ' + snip(picked); small.disabled = !trail.length; };
    big.addEventListener('click', function () { var p = picked.parentElement; if (!p || p === document.body) return; trail.push(picked); picked.classList.remove('se-pick'); picked = p; picked.classList.add('se-pick'); show(); });
    small.addEventListener('click', function () { if (!trail.length) return; picked.classList.remove('se-pick'); picked = trail.pop(); picked.classList.add('se-pick'); show(); });
    size.appendChild(big); size.appendChild(small); panel.appendChild(size); show();

    var where = el('label', null, 'se-row'); var every = el('input'); every.type = 'checkbox'; where.appendChild(every); where.appendChild(el('span', 'Do this on every page, not just this one'));
    // One thing at a time: Words, Hide or Picture.
    var tabsRow = el('div', null, 'se-tabs'), secs = {};
    var tab = function (k, label) { var b = el('button', label); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', function () { pick(k); }); tabsRow.appendChild(b); secs[k] = el('div', null, 'se-sec'); };
    tab('words', 'Words'); tab('hide', 'Hide'); tab('pic', 'Picture');
    var pick = function (k) { Array.prototype.forEach.call(tabsRow.children, function (b) { b.setAttribute('aria-pressed', b.dataset.k === k ? 'true' : 'false'); }); Object.keys(secs).forEach(function (n) { secs[n].hidden = n !== k; }); msg.textContent = ''; };
    panel.appendChild(tabsRow);

    // Words
    if (tn) {
      var from = tn.nodeValue.replace(/\s+/g, ' ').trim();
      secs.words.appendChild(el('div', 'Now it says:', 'se-dim'));
      secs.words.appendChild(el('div', from, 'se-quote'));
      secs.words.appendChild(el('div', 'Change it to:', 'se-dim'));
      var to = el('textarea'); to.value = from; to.rows = 5; secs.words.appendChild(to);
      var sw = el('button', 'Save new words', 'se-main'); sw.type = 'button';
      var rm = el('button', 'Remove these words', 'se-g'); rm.type = 'button';
      sw.addEventListener('click', function () { if (to.value.trim() === from) { msg.textContent = 'Type the new words first.'; return; } save({ from: from, to: to.value.trim(), page: every.checked ? '' : here }, msg); });
      rm.addEventListener('click', function () { save({ from: from, to: '', page: every.checked ? '' : here }, msg); });
      var r1 = el('div', null, 'se-row'); r1.appendChild(sw); r1.appendChild(rm); secs.words.appendChild(r1);
    } else secs.words.appendChild(el('div', 'There are no words right here. Click directly on some words to change them, or use Hide or Picture.', 'se-dim'));
    // Hide
    secs.hide.appendChild(el('div', 'Visitors will not see the part outlined in orange. Use "Select a bigger area" above to hide a whole section. You can bring it back any time in the back office.', 'se-dim'));
    var hd = el('button', 'Hide this part', 'se-main'); hd.type = 'button';
    hd.addEventListener('click', function () { save({ kind: 'hide', sel: pathOf(picked), label: snip(picked), page: every.checked ? '' : here }, msg); });
    secs.hide.appendChild(hd);
    // Picture
    var file = el('input'); file.type = 'file'; file.accept = 'image/*';
    var pos = el('select'); [['after', 'Put it below this part'], ['before', 'Put it above this part']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; pos.appendChild(op); });
    var sz = el('select'); [['full', 'Full width'], ['medium', 'Medium size'], ['small', 'Small']].forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; sz.appendChild(op); });
    var link = el('input'); link.placeholder = 'Optional: link (https://… or /giveaway.html)';
    var alt = el('input'); alt.placeholder = 'Optional: describe the picture';
    var up = el('button', 'Upload and add picture', 'se-main'); up.type = 'button';
    up.addEventListener('click', function () {
      var f = file.files && file.files[0]; if (!f) { msg.textContent = 'Choose a picture first.'; return; }
      up.disabled = true; msg.textContent = 'Uploading…';
      shrink(f).then(function (data) {
        return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ do: 'site-photo', ak: key(), data: data }) }).then(function (r) { return r.json(); });
      }).then(function (r) {
        up.disabled = false;
        if (r.error) { msg.textContent = r.error; return; }
        save({ kind: 'image', sel: pathOf(picked), label: snip(picked), url: r.url, where: pos.value, size: sz.value, link: link.value.trim(), alt: alt.value.trim(), page: every.checked ? '' : here }, msg);
      }).catch(function () { up.disabled = false; msg.textContent = 'That picture could not be used. Try another one.'; });
    });
    [file, pos, sz, link, alt, up].forEach(function (n) { secs.pic.appendChild(n); });

    Object.keys(secs).forEach(function (k) { panel.appendChild(secs[k]); });
    panel.appendChild(where); panel.appendChild(msg);
    pick(tn ? 'words' : 'hide');
    try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    document.body.appendChild(panel);
  }
  // Pictures are made smaller on this device before upload (at most 1600 pixels wide, as a JPEG).
  function shrink(f) {
    return new Promise(function (ok, no) {
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = no; img.src = u;
    });
  }
  function save(rule, msg) {
    msg.textContent = 'Saving…';
    fetch('/api/market?do=wording&fresh=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (cur) {
      var rules = (cur.rules || []).slice();
      if (!rule.kind) rules = rules.filter(function (r) { return !(!r.kind || r.kind === 'text') || r.from !== rule.from || r.page !== rule.page; });
      rules.push(rule);
      return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ do: 'wording-save', ak: key(), rules: rules }) }).then(function (r) { return r.json(); });
    }).then(function (r) {
      if (r.error) { msg.textContent = r.error; return; }
      try { sessionStorage.removeItem('v2vWording'); } catch (e) {}
      msg.textContent = 'Saved. Showing it now…';
      setTimeout(function () { location.reload(); }, 500);
    }).catch(function () { msg.textContent = 'Could not save. Try again.'; });
  }
})();
