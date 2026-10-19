// The Emails tab of the back office: every automatic email the site sends. Turn one off, or write your own words
// for it (a subject, a message at the top, a sign-off at the bottom), and let AI tidy what you wrote if you like.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  var tabs = document.querySelector('.tabs'), main = $('main');
  if (!tabs || !main) return;
  var key = function () { try { return localStorage.getItem('adminKey') || ''; } catch (e) { return ''; } };
  var post = function (body) { body.ak = key(); return fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); };
  var btn = el('button', 'Emails', 'ghost'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  tabs.insertBefore(btn, $('out'));
  var box = el('div'); box.dataset.extraTab = 'emails'; box.hidden = true; box.style.cssText = 'display:flex;flex-direction:column;gap:18px';
  main.insertBefore(box, $('wOrders'));
  var css = el('style');
  css.textContent = '.em-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}.em-b{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.1em;padding:3px 8px;border:1px solid currentColor}.em-on{color:#7DD3B0}.em-off{color:#E86A6A}.em-mine{color:#FF6B3D}'
    + '.em-f{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700}.em-f input,.em-f textarea{font:inherit;font-weight:400;font-size:15px;padding:10px 12px;background:#0E0F13;border:1px solid #4A4F5E;color:#F7F2E6;border-radius:2px}.em-f textarea{min-height:96px;resize:vertical;line-height:1.5}'
    + '.em-ai{border:1px dashed #4A4F5E;padding:10px 12px;display:flex;flex-direction:column;gap:8px}.em-ai pre{white-space:pre-wrap;font:15px/1.5 inherit;margin:0}';
  document.head.appendChild(css);
  tabs.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && b !== btn && b.id !== 'out') { box.hidden = true; btn.setAttribute('aria-pressed', 'false'); } });
  // The order search, filters and spreadsheet button belong to the order lists, so they go away on the Emails and
  // Sellers tabs and come back on any other tab.
  var tucked = [];
  function tuck() {
    if (tucked.length) return;
    var row = tabs.parentElement;
    var keep = function (n) { return n === row || (n.dataset && n.dataset.extraTab) || n.id === 'tiles'; };
    Array.prototype.forEach.call(main.children, function (c) { if (!keep(c) && !c.hidden) { c.hidden = true; tucked.push(c); } });
    Array.prototype.forEach.call(row.children, function (c) { if (c !== tabs && !c.hidden) { c.hidden = true; tucked.push(c); } });
  }
  function untuck() { tucked.forEach(function (c) { c.hidden = false; }); tucked = []; }
  tabs.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button');
    if (!b || b.id === 'out') return;
    if (b.textContent === 'Emails' || b.textContent === 'Sellers') setTimeout(tuck, 0); else untuck();
  }, true);
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) { if (b.id !== 'out') b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    ['wOrders', 'wPeople', 'wItems', 'none', 'offerWait'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    Array.prototype.forEach.call(main.children, function (c) { if (c !== box && c.dataset && c.dataset.extraTab) c.hidden = true; });
    box.hidden = false; load();
  });

  var D = null;
  function load() {
    box.textContent = 'Loading emails…';
    fetch('/api/market?do=emails&ak=' + encodeURIComponent(key()), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) { D = r; draw(); })
      .catch(function () { box.textContent = 'Could not load the emails. Try again.'; });
  }

  // A text box with an "Edit with AI" helper under it. The AI version only replaces yours when you press Use it.
  function aiField(label, value, about, rows, hint) {
    var f = el('label', null, 'em-f'); f.appendChild(el('span', label));
    var t = el('textarea'); t.value = value || ''; t.rows = rows || 4; if (hint) t.placeholder = hint; f.appendChild(t);
    var wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    var line = el('div'); line.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
    var how = el('input'); how.placeholder = 'Optional: how should AI change it? (shorter, friendlier…)'; how.style.cssText = 'flex:1;min-width:200px;font:inherit;font-size:14px;padding:8px 10px;background:#0E0F13;border:1px solid #4A4F5E;color:#F7F2E6;border-radius:2px';
    var go = el('button', 'Edit with AI', 'ghost'); go.type = 'button';
    line.appendChild(how); line.appendChild(go); wrap.appendChild(line);
    var out = el('div'); wrap.appendChild(out);
    go.addEventListener('click', function () {
      if (!D.ai) { out.textContent = 'AI editing is not set up yet: add ANTHROPIC_API_KEY in the Vercel environment variables, then redeploy. You can still write and save your own words.'; out.className = 'small dim'; return; }
      go.disabled = true; out.className = 'small'; out.textContent = 'AI is editing…';
      post({ do: 'email-ai', text: t.value, how: how.value, about: about }).then(function (r) {
        go.disabled = false; out.textContent = '';
        if (r.error) { out.textContent = r.error; return; }
        var card = el('div', null, 'em-ai'); card.appendChild(el('span', 'AI suggestion', 'small dim')); card.appendChild(el('pre', r.text));
        var acts = el('div'); acts.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        var use = el('button', 'Use it', 'solid'); use.type = 'button'; use.addEventListener('click', function () { t.value = r.text; out.textContent = 'Swapped in. Press Save to keep it.'; });
        var no = el('button', 'Keep mine', 'ghost'); no.type = 'button'; no.addEventListener('click', function () { out.textContent = ''; });
        acts.appendChild(use); acts.appendChild(no); card.appendChild(acts); out.appendChild(card);
      }).catch(function () { go.disabled = false; out.textContent = 'AI could not be reached. Try again.'; });
    });
    f.appendChild(wrap);
    return { node: f, get: function () { return t.value; } };
  }

  function draw() {
    box.textContent = '';
    if (D.error) { box.textContent = D.error; return; }
    box.appendChild(el('div', 'Every email the site sends by itself is listed here. Turn any of them off, or add your own words: your message goes at the top, your sign-off at the bottom, and the order details, tracking and pay links stay in so the email still works. Nothing changes until you press Save.', 'small'));
    if (!D.sending) box.appendChild(el('div', 'Emails are not being sent yet: RESEND_API_KEY and EMAIL_FROM still need to be added in Vercel. You can set everything up here now.', 'alert small'));

    // A sign-off for every email.
    var all = el('section', null, 'card'); all.style.gap = '12px';
    all.appendChild(el('b', 'Every email'));
    var sig = aiField('Sign-off added to the bottom of every email', D.every.bottom, 'every email (a sign-off)', 3, 'For example: Thanks for being part of V2V. — Daniel');
    all.appendChild(sig.node);
    var sm = el('div', null, 'small'); sm.setAttribute('role', 'status');
    var sv = el('button', 'Save', 'solid'); sv.type = 'button';
    sv.addEventListener('click', function () { sv.disabled = true; post({ do: 'email-save', id: 'every', bottom: sig.get() }).then(function (r) { sv.disabled = false; sm.textContent = r.error || 'Saved.'; if (!r.error) D.every.bottom = sig.get(); }); });
    var r1 = el('div', null, 'em-row'); r1.appendChild(sv); r1.appendChild(sm); all.appendChild(r1);
    box.appendChild(all);

    ['Buyers', 'Buyers and sellers', 'Sellers', 'You'].forEach(function (who) {
      var group = D.kinds.filter(function (k) { return k.who === who; });
      if (!group.length) return;
      box.appendChild(el('div', who === 'You' ? 'EMAILS TO YOU' : 'EMAILS TO ' + who.toUpperCase(), 'mono gold'));
      group.forEach(card);
    });
  }

  function card(k) {
    var c = el('section', null, 'card'); c.style.gap = '10px';
    var top = el('div', null, 'em-row');
    var nm = el('div'); nm.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
    nm.appendChild(el('b', k.name));
    nm.appendChild(el('span', k.off ? 'OFF' : 'ON', 'em-b ' + (k.off ? 'em-off' : 'em-on')));
    if (k.subject || k.top || k.bottom) nm.appendChild(el('span', 'YOUR WORDS', 'em-b em-mine'));
    top.appendChild(nm);
    var acts = el('div'); acts.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    var edit = el('button', 'Write your own', 'ghost'); edit.type = 'button'; acts.appendChild(edit);
    if (!k.must) {
      var tog = el('button', k.off ? 'Turn back on' : 'Turn off', 'ghost'); tog.type = 'button'; acts.appendChild(tog);
      tog.addEventListener('click', function () {
        if (!k.off && !confirm('Stop sending "' + k.name + '"? You can turn it back on any time.')) return;
        tog.disabled = true;
        post({ do: 'email-save', id: k.id, off: !k.off, subject: k.subject || '', top: k.top || '', bottom: k.bottom || '' }).then(function (r) { if (r.error) { alert(r.error); tog.disabled = false; return; } load(); });
      });
    }
    top.appendChild(acts); c.appendChild(top);
    c.appendChild(el('div', k.about + (k.must ? ' This one is needed for the site to work, so it cannot be turned off, but you can add your own words.' : ''), 'small dim'));

    var form = el('div'); form.hidden = true; form.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:6px';
    edit.addEventListener('click', function () { form.hidden = !form.hidden; edit.textContent = form.hidden ? 'Write your own' : 'Close'; });
    var sf = el('label', null, 'em-f'); sf.appendChild(el('span', 'Subject (leave empty for the usual one; type {subject} to keep the usual one inside yours)'));
    var subj = el('input'); subj.value = k.subject || ''; subj.placeholder = 'Usual subject'; sf.appendChild(subj); form.appendChild(sf);
    var msg = aiField('Your message at the top', k.top, k.name, 4, 'Write it in your own words.');
    var bye = aiField('Your sign-off at the bottom', k.bottom, k.name + ' (sign-off)', 2, 'Optional');
    form.appendChild(msg.node); form.appendChild(bye.node);
    var row = el('div', null, 'em-row'); row.style.justifyContent = 'flex-start';
    var save = el('button', 'Save', 'solid'); save.type = 'button';
    var test = el('button', 'Send me a sample', 'ghost'); test.type = 'button';
    var reset = el('button', 'Go back to the usual email', 'ghost'); reset.type = 'button';
    var m = el('span', null, 'small'); m.setAttribute('role', 'status');
    row.appendChild(save); row.appendChild(test); row.appendChild(reset); row.appendChild(m); form.appendChild(row);
    save.addEventListener('click', function () {
      save.disabled = true; m.textContent = 'Saving…';
      post({ do: 'email-save', id: k.id, off: !!k.off, subject: subj.value, top: msg.get(), bottom: bye.get() }).then(function (r) {
        save.disabled = false; if (r.error) { m.textContent = r.error; return; }
        k.subject = subj.value.trim(); k.top = msg.get().trim(); k.bottom = bye.get().trim(); m.textContent = 'Saved. The next "' + k.name + '" email uses your words.';
      });
    });
    test.addEventListener('click', function () {
      test.disabled = true; m.textContent = 'Sending…';
      post({ do: 'email-test', id: k.id }).then(function (r) { test.disabled = false; m.textContent = r.error || 'Sample sent to ' + r.to + '. Save first if you changed something.'; });
    });
    reset.addEventListener('click', function () {
      if (!confirm('Remove your words from "' + k.name + '" and turn it back on?')) return;
      post({ do: 'email-save', id: k.id, reset: true }).then(function (r) { if (r.error) { m.textContent = r.error; return; } load(); });
    });
    c.appendChild(form);
    box.appendChild(c);
  }
})();
