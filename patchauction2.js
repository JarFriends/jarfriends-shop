// Build step: auctions from the Edit form too, and an auction length.
//  - Add a product: auction=1 with dur=<hours> (1 to 1440) or ends=<ISO>. A length (dur) on a draft starts counting
//    when Go live is pressed, so time spent checking the draft does not come off the auction.
//  - Edit: auction=1 [&dur= or &ends=] makes the piece an auction (price = starting bid, one piece); without dur/ends an
//    auction keeps its end time. auction=0 takes it out of auction.
// Runs after patchpending.js.
const fs = require('fs');
const R = String.raw;
const changes = [
  ['api/admin.js', R`      const endsAt = Date.parse(String(q.ends || ''));`, R`      const hrs = Number(q.dur);
      if (q.dur && !(hrs >= 1 && hrs <= 1440)) return res.status(400).json({ error: 'Pick an auction length from 1 hour to 60 days.' });
      const endsAt = q.dur ? Date.now() + hrs * 3600000 : Date.parse(String(q.ends || ''));`],
  ['api/admin.js', R`      auc = { start: Math.round(Number(q.price) * 100) / 100, ends: new Date(endsAt).toISOString() };`, R`      auc = Object.assign({ start: Math.round(Number(q.price) * 100) / 100, ends: new Date(endsAt).toISOString() }, q.dur ? { dur: hrs } : {});`],
  // Go live: an auction with a length starts its clock now.
  ['api/admin.js', R`    await edits.save(p.id, { hidden: false, draft: false, shelf: true });`, R`    await edits.save(p.id, Object.assign({ hidden: false, draft: false, shelf: true }, p.auction && p.auction.dur ? { auction: { start: p.auction.start, ends: new Date(Date.now() + Number(p.auction.dur) * 3600000).toISOString() } } : {}));`],
  // Edit: turn a piece into an auction, change its end, or take it out of auction.
  ['api/admin.js', R`    if (q.pay !== undefined) f.pay`, R`    if (q.auction === '1') {
      const hrs = Number(q.dur), hidden = q.hidden === '1' || (q.hidden === undefined && p.hidden);
      if (q.dur && !(hrs >= 1 && hrs <= 1440)) return res.status(400).json({ error: 'Pick an auction length from 1 hour to 60 days.' });
      let endsAt = q.dur ? Date.now() + hrs * 3600000 : q.ends ? Date.parse(String(q.ends)) : p.auction ? Date.parse(p.auction.ends) : 0;
      if (!(endsAt > Date.now() + 10 * 60000 && endsAt < Date.now() + 60 * 86400000)) return res.status(400).json({ error: p.auction && !q.dur && !q.ends ? 'This auction has ended or ends within 10 minutes. Pick a new length to run it again.' : 'Pick when the auction ends: at least 10 minutes from now and within 60 days.' });
      f.auction = Object.assign({ start: price, ends: new Date(endsAt).toISOString() }, q.dur && hidden && p.draft ? { dur: hrs } : {});
      if (!(f.stock >= 1)) f.stock = Math.max(1, Number(p.sold || 0) + 1);
    } else if (q.auction === '0' && p.auction) f.auction = null;
    if (q.pay !== undefined) f.pay`]
];
const files = {};
changes.forEach((c) => {
  const s = files[c[0]] || (files[c[0]] = fs.readFileSync(c[0], 'utf8'));
  if (s.split(c[1]).length !== 2) throw new Error('patchauction2: expected one match in ' + c[0] + ' for ' + c[1].slice(0, 60));
  files[c[0]] = s.replace(c[1], () => c[2]);
});
Object.keys(files).forEach((f) => fs.writeFileSync(f, files[f]));
