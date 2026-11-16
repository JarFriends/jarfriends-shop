// Pay-by countdown: shown when the order link carries ?by=<time>. The order is cancelled if it is not paid by then.
(function () {
  var by = Number(new URLSearchParams(location.search).get('by') || 0);
  if (!by) return;
  var bar = document.createElement('div');
  bar.setAttribute('role', 'timer');
  bar.style.cssText = 'position:sticky;top:0;z-index:50;background:#7A1F1F;color:#fff;text-align:center;padding:12px 14px;font:700 17px/1.3 system-ui,sans-serif';
  var tick = function () {
    var left = by - Date.now();
    if (left <= 0) { bar.textContent = '⏳ Time is up. If this order was not paid, it has been cancelled.'; return; }
    var h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
    bar.textContent = '⏳ Pay within ' + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + ' or this order is cancelled (by ' + new Date(by).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ')';
    setTimeout(tick, 1000);
  };
  var go = function () { document.body.insertBefore(bar, document.body.firstChild); tick(); };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
