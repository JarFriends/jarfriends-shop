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
    return true;
  }
  function wire(input) {
    if (input.dataset.drop) return; input.dataset.drop = '1';
    var z = input.closest('label') || input.parentNode;
    var tip = document.createElement('span'); tip.className = 'small dropTip'; tip.textContent = 'Or drag a photo here, or hold your mouse over this box and paste (Ctrl/Cmd+V).';
    tip.style.cssText = 'display:block;font-weight:400;opacity:.8;margin-top:4px';
    z.appendChild(tip);
    z.style.borderRadius = '10px'; z.style.transition = 'outline-color .15s';
    var mark = function () { last = input; };
    ['focus', 'click', 'mouseenter'].forEach(function (ev) { z.addEventListener(ev, mark, true); });
    z.addEventListener('dragover', function (ev) { ev.preventDefault(); z.style.outline = '2px dashed #C9A45C'; z.style.outlineOffset = '4px'; });
    z.addEventListener('dragleave', function () { z.style.outline = ''; });
    z.addEventListener('drop', function (ev) { ev.preventDefault(); z.style.outline = ''; last = input; var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (!put(input, f)) alert('That is not a photo. Drop a JPG or PNG.'); });
  }
  function scan() { Array.prototype.forEach.call(document.querySelectorAll('input[type=file]'), function (i) { if (!i.accept || /image/.test(i.accept)) wire(i); }); }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
  // A dropped photo outside a box should not open in the tab and lose your work.
  window.addEventListener('dragover', function (ev) { ev.preventDefault(); });
  window.addEventListener('drop', function (ev) { if (!(ev.target.closest && ev.target.closest('label'))) ev.preventDefault(); });
  document.addEventListener('paste', function (ev) {
    var items = (ev.clipboardData && ev.clipboardData.items) || [], file = null;
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { file = items[i].getAsFile(); break; }
    if (!file) return; // plain text pastes as normal
    var shown = Array.prototype.filter.call(document.querySelectorAll('input[type=file][data-drop]'), function (x) { return x.offsetParent !== null; });
    var target = last && last.offsetParent !== null ? last : shown.length === 1 ? shown[0] : null;
    if (!target) { alert('Click the photo box you want first, then paste.'); return; }
    ev.preventDefault();
    put(target, file);
  });
})();
