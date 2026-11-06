// The opening on veefam.io (option B, the vault): a gold dial spins into place, the doors slide open on VEEFAM.
// Once per visit, home page only; tap to skip; a quick fade for people who prefer less motion.
window.__ms = 3800;
window.__css = '.vi{background:#060D09;overflow:hidden}'
+ '.vb-l,.vb-r{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(90deg,#0E2219,#13301F);animation:vbOpen 1s 2s cubic-bezier(.7,0,.2,1) forwards}.vb-l{left:0;border-right:1px solid #C9A45C}.vb-r{right:0;border-left:1px solid #C9A45C;background:linear-gradient(270deg,#0E2219,#13301F)}'
+ '.vb-r{animation-name:vbOpenR}@keyframes vbOpen{to{transform:translateX(-100%)}}@keyframes vbOpenR{to{transform:translateX(100%)}}'
+ '.vb-dial{position:absolute;width:190px;height:190px;border-radius:50%;border:2px solid #C9A45C;box-shadow:0 0 40px rgba(201,164,92,.25),inset 0 0 30px rgba(201,164,92,.15);background:repeating-conic-gradient(from 0deg,rgba(201,164,92,.55) 0 1deg,transparent 1deg 15deg);animation:vbSpin 1.6s .2s cubic-bezier(.6,0,.2,1) forwards,vbHide .5s 1.9s ease forwards}'
+ '.vb-dial:after{content:"V";position:absolute;inset:34px;border-radius:50%;background:radial-gradient(circle,#1A3A2A,#0B1A13);border:1px solid rgba(201,164,92,.6);display:flex;align-items:center;justify-content:center;font:700 54px "Playfair Display",Georgia,serif;color:#D9B66B}'
+ '@keyframes vbSpin{from{transform:rotate(-200deg)}to{transform:rotate(0)}}@keyframes vbHide{to{opacity:0;transform:scale(.8)}}'
+ '.vb-in{display:flex;flex-direction:column;align-items:center;gap:14px;opacity:0;animation:vbShow .9s 2.3s ease forwards}.vb-in b{font:700 48px "Playfair Display",Georgia,serif;letter-spacing:.3em;color:#F3E7C8}.vb-in b i{font-style:normal;color:#C9A45C}.vb-in span{font:500 11px "IBM Plex Mono",monospace;letter-spacing:.4em;color:#C9A45C}'
+ '@keyframes vbShow{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}@media(max-width:480px){.vb-in b{font-size:34px}}';
window.__html = '<div class="vb-in"><b>VEEFAM<i>.</i></b><span>V2V</span></div><div class="vb-l"></div><div class="vb-r"></div><div class="vb-dial"></div>';
(function () {
  try { if (sessionStorage.getItem('v2vIntro')) return; sessionStorage.setItem('v2vIntro', '1'); } catch (e) {}
  if (!/^\/(index\.html)?$/.test(location.pathname)) return;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = window.__css, html = window.__html, ms = calm ? 700 : (window.__ms || 3000);
  var st = document.createElement('style'); st.textContent = '.vi{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;transition:opacity .7s ease}.vi.out{opacity:0;pointer-events:none}.vi .skip{position:absolute;bottom:28px;font:500 11px "IBM Plex Mono",monospace;letter-spacing:.2em;color:rgba(243,231,200,.35)}' + css + (calm ? '.vi *{animation-duration:.01s!important;animation-delay:0s!important}' : ''); document.head.appendChild(st);
  var w = document.createElement('div'); w.className = 'vi'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = html + '<div class="skip">TAP TO ENTER</div>';
  document.documentElement.appendChild(w);
  var done = false, end = function () { if (done) return; done = true; w.classList.add('out'); setTimeout(function () { w.remove(); }, 800); }; w.onclick = end; setTimeout(end, ms);
})();
