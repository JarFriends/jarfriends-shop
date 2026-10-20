// Every photo box in the back office also takes a photo dragged onto it, or pasted (Ctrl/Cmd+V).
// Works on boxes added later too (new product, Next safes, edit forms). The photo then saves as usual.
(function () {
  var last = null; // the photo box used most recently: where a paste goes
  function put(input, file) {
    if (!file || !/^image\//.test(file.type)) return false;
    try { var dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } catch (e) { return false; }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    var z = input.closest('label') || input.parentNode, tip = z.querySelector('.dropTip');
    if (tip) tip.textContent = 'Photo ready: ' + (file.name || 'pasted photo') + '. It saves when you press Save.';
    var pzz = z.querySelector('.adPaste'); if (pzz) { pzz.textContent = ''; var im = document.createElement('img'); im.alt = ''; im.src = URL.createObjectURL(file); im.style.cssText = 'width:44px;height:44px;object-fit:cover;border-radius:4px'; pzz.appendChild(im); pzz.appendChild(document.createTextNode(' ✓ Photo pasted')); pzz.blur(); }
    return true;
  }
  function wire(input) {
    if (input.dataset.drop) return; input.dataset.drop = '1';
    var z = input.closest('label') || input.parentNode;
    var tip = document.createElement('span'); tip.className = 'small dropTip'; tip.textContent = 'Or drag a photo here, or paste one in the box below.';
    tip.style.cssText = 'display:block;font-weight:400;opacity:.8;margin-top:4px';
    z.appendChild(tip);
    // A Paste photo button (asks the browser for the copied photo) and a box you can tap or click and paste into.
    // Both work on phones and tablets too, where there is no keyboard paste or mouse hover.
    var bar = document.createElement('span'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px';
    var pb = document.createElement('button'); pb.type = 'button'; pb.className = 'ghost'; pb.textContent = 'Paste photo'; pb.style.cssText = 'padding:7px 14px;font-size:14px';
    pb.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation(); last = input;
      if (!navigator.clipboard || !navigator.clipboard.read) { pz.focus(); tip.textContent = 'Your browser needs the box next to this button: tap or click it, then Paste.'; return; }
      navigator.clipboard.read().then(function (items) {
        for (var i = 0; i < items.length; i++) { var t = items[i].types.filter(function (x) { return /^image\//.test(x); })[0]; if (t) return items[i].getType(t).then(function (bl) { put(input, new File([bl], 'pasted.' + (t.split('/')[1] || 'png'), { type: t })); }); }
        tip.textContent = 'No photo is copied. Copy a photo first (long-press it, or right-click it and choose Copy Image), then press Paste photo.';
      }, function () { pz.focus(); tip.textContent = 'The browser did not allow it. Tap or click the box next to the button, then Paste.'; });
    });
    // The paste field: looks and works like a text box. Click or tap it, then paste (Ctrl/Cmd+V, or tap and hold > Paste).
    var pz = document.createElement('div'); pz.contentEditable = 'true'; pz.className = 'adPaste'; pz.setAttribute('role', 'textbox'); pz.setAttribute('aria-label', 'Paste a photo here');
    pz.dataset.ph = '📋 Paste a photo here: click and press Ctrl+V (⌘+V on a Mac), or tap and hold, then Paste';
    pz.addEventListener('focus', function () { last = input; });
    pz.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); pz.focus(); });
    pz.addEventListener('beforeinput', function (ev) { if (ev.inputType !== 'insertFromPaste') ev.preventDefault(); }); // keeps typed text out
    pz.addEventListener('input', function () { pz.textContent = ''; });
    z.appendChild(pz); bar.appendChild(pb); z.appendChild(bar);
    z.style.borderRadius = '10px'; z.style.transition = 'outline-color .15s';
    var mark = function () { last = input; };
    ['focus', 'click', 'mouseenter'].forEach(function (ev) { z.addEventListener(ev, mark, true); });
    z.addEventListener('dragover', function (ev) { ev.preventDefault(); z.style.outline = '2px dashed #C9A45C'; z.style.outlineOffset = '4px'; });
    z.addEventListener('dragleave', function () { z.style.outline = ''; });
    z.addEventListener('drop', function (ev) { ev.preventDefault(); z.style.outline = ''; last = input; var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (!put(input, f)) alert('That is not a photo. Drop a JPG or PNG.'); });
  }
  var st = document.createElement('style');
  st.textContent = '.adPaste{display:flex;align-items:center;gap:10px;min-height:46px;margin-top:8px;padding:10px 14px;border:1px dashed #C9A45C;border-radius:8px;background:rgba(0,0,0,.18);font-size:15px;font-weight:400;cursor:text;outline:none;-webkit-user-select:text;user-select:text;box-sizing:border-box;width:100%}.adPaste:empty:before{content:attr(data-ph);opacity:.7;font-size:14px;pointer-events:none}.adPaste:focus{border-style:solid}';
  document.head.appendChild(st);
  function scan() { Array.prototype.forEach.call(document.querySelectorAll('input[type=file]'), function (i) { if (!i.accept || /image/.test(i.accept)) wire(i); }); }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
  // A dropped photo outside a box should not open in the tab and lose your work.
  window.addEventListener('dragover', function (ev) { ev.preventDefault(); });
  window.addEventListener('drop', function (ev) { if (!(ev.target.closest && ev.target.closest('label'))) ev.preventDefault(); });
  window.addEventListener('paste', function (ev) {
    var items = (ev.clipboardData && ev.clipboardData.items) || [], file = null;
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { file = items[i].getAsFile(); break; }
    if (!file) return; // plain text pastes as normal
    var shown = Array.prototype.filter.call(document.querySelectorAll('input[type=file][data-drop]'), function (x) { return x.offsetParent !== null; });
    var target = last && last.offsetParent !== null ? last : shown.length === 1 ? shown[0] : null;
    if (!target) { alert('Click the photo box you want first, then paste.'); return; }
    ev.preventDefault(); ev.stopPropagation();
    put(target, file);
  }, true);
})();
