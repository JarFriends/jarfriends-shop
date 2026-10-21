// Saved boxes: your standard box sizes as tick-boxes next to "Regular box" wherever a package is set up
// (the ship cards in the back office and the label page). Ticking one fills in its length, width and height.
// The list comes from /api/label?boxes=1; you add to it with "Save this box" on a shipped order.
(function () {
  var cache = null;
  function load() {
    if (!cache) cache = fetch('/api/label?boxes=1', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) { return r.boxes || []; }).catch(function () { return []; });
    return cache;
  }
  window.jfBoxReload = function () { cache = null; };
  // after: the "Regular box" label to put the saved boxes under. ins: { l, w, h } inputs. changed: called after a tick.
  window.jfBoxPresets = function (after, ins, changed) {
    var holder = document.createElement('div'); holder.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 16px';
    after.parentNode.insertBefore(holder, after.nextSibling);
    var ticks = [];
    var same = function (b) { return Number(ins.l.value) === Number(b.l) && Number(ins.w.value) === Number(b.w) && Number(ins.h.value) === Number(b.h); };
    var refresh = function () { ticks.forEach(function (t) { t.cb.checked = same(t.b); }); };
    load().then(function (boxes) {
      boxes.filter(function (b) { return !(Number(b.l) === 12 && Number(b.w) === 9 && Number(b.h) === 6); }).forEach(function (b) {
        var lb = document.createElement('label'); lb.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer';
        lb.style.setProperty('display', 'flex', 'important'); lb.style.setProperty('flex-direction', 'row', 'important');
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.style.cssText = 'margin:0;accent-color:#C9A45C';
        ['width', 'height', 'min-width', 'flex', 'padding'].forEach(function (k, i) { cb.style.setProperty(k, ['20px', '20px', '20px', '0 0 20px', '0'][i], 'important'); });
        var sp = document.createElement('span'); sp.textContent = b.name + ' (' + b.l + ' x ' + b.w + ' x ' + b.h + ' in)';
        lb.appendChild(cb); lb.appendChild(sp); holder.appendChild(lb);
        cb.addEventListener('change', function () {
          if (cb.checked) { ins.l.value = b.l; ins.w.value = b.w; ins.h.value = b.h; } else { ins.l.value = ''; ins.w.value = ''; ins.h.value = ''; }
          ['l', 'w', 'h'].forEach(function (k) { ins[k].dispatchEvent(new Event('input', { bubbles: true })); });
          refresh(); if (changed) changed();
        });
        ticks.push({ cb: cb, b: b });
      });
      refresh();
    });
    ['l', 'w', 'h'].forEach(function (k) { ins[k].addEventListener('input', refresh); });
    return refresh;
  };
})();
