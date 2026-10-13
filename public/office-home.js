// "Back office home" button for the owner pages. On the back office itself it goes back to the Orders tab and the top.
(function () {
  var bar = document.querySelector('header.top .bar'); if (!bar) return;
  var onAdmin = /\/admin(\.html)?$/.test(location.pathname);
  var a = document.createElement('a');
  a.href = '/admin.html'; a.textContent = 'Back office home'; a.className = 'solid';
  a.style.cssText = 'padding:8px 14px;font-size:14px;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap;background:#C9A45C;border:1px solid #C9A45C;font-weight:700;border-radius:4px';
  a.style.setProperty('color', '#141414', 'important');
  if (onAdmin) a.addEventListener('click', function (ev) {
    ev.preventDefault();
    var f = document.getElementById('find'); if (f && f.value) { f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); }
    var t = document.getElementById('tOrders'); if (t) t.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  var wrap = document.createElement('span'); wrap.style.cssText = 'display:flex;align-items:center;gap:14px';
  var tag = bar.lastElementChild;
  bar.appendChild(wrap);
  if (tag && tag !== bar.firstElementChild) wrap.appendChild(tag);
  wrap.appendChild(a);
})();
