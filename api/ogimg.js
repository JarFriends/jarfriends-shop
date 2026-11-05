// The share picture for a piece (1200 x 630): its photo, name, and price (the party price when a party is on, or
// the current bid for an auction), with the VeeFam name. Used as the preview image by the share links (market.js og).
const store = require('./_store');

const usd = (c) => '$' + (c / 100).toFixed(2);
const h = (type, style, children) => ({ type: type, props: { style: style, children: children } });

module.exports = async (req, res) => {
  const id = String((req.query || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  try {
    const M = require('./_sellers'), host = 'https://' + req.headers.host;
    const p = (await M.products()).filter((x) => x.id === id)[0];
    if (!p) { res.writeHead(302, { Location: '/hero-banner.jpg' }); return res.end(); }
    let price = usd(Math.round(Number(p.price) * 100)), sub = '', was = '';
    if (p.party && p.party.ends > Date.now()) {
      const st = await require('./_partyS').state(p).catch(() => null);
      if (st) { price = usd(st.now); sub = 'PARTY PRICE · drops as more sell'; if (st.now < st.price) was = usd(st.price); }
    } else if (p.auction && p.auction.ends) {
      const A = require('./_auction'), s = await A.state(p).catch(() => null);
      if (s) { price = usd(s.current); sub = s.count ? 'CURRENT BID · ' + s.count + ' bid' + (s.count === 1 ? '' : 's') : 'STARTING BID'; }
    }
    const photo = p.photo ? host + '/api/photo?id=' + p.id + '&v=' + p.photo : '';
    const { ImageResponse } = await import('@vercel/og');
    const el = h('div', { width: '100%', height: '100%', display: 'flex', background: '#0B1712', color: '#F7F2E6', fontFamily: 'sans-serif' }, [
      photo ? h('div', { width: 630, height: 630, display: 'flex', background: '#11261C' }, [{ type: 'img', props: { src: photo, width: 630, height: 630, style: { objectFit: 'cover' } } }]) : h('div', { width: 630, height: 630, display: 'flex', background: '#11261C' }, ''),
      h('div', { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 44px' }, [
        h('div', { fontSize: 26, letterSpacing: 4, color: '#C9A45C', display: 'flex' }, 'VEEFAM'),
        h('div', { display: 'flex', flexDirection: 'column' }, [
          h('div', { fontSize: 40, fontWeight: 700, lineHeight: 1.15, display: 'flex' }, String(p.name || '').slice(0, 90)),
          sub ? h('div', { fontSize: 22, color: '#C9A45C', marginTop: 22, display: 'flex' }, sub) : h('div', { display: 'flex' }, ''),
          h('div', { display: 'flex', alignItems: 'baseline', marginTop: 8 }, [h('div', { fontSize: 76, fontWeight: 800, color: '#C9A45C', display: 'flex' }, price), was ? h('div', { fontSize: 32, color: '#9AA', textDecoration: 'line-through', marginLeft: 18, display: 'flex' }, was) : h('div', { display: 'flex' }, '')])
        ]),
        h('div', { fontSize: 24, color: '#B8C4BC', display: 'flex' }, 'from ' + (p.sellerName || 'a VeeFam seller') + ' · veefam.io')
      ])
    ]);
    const img = new ImageResponse(el, { width: 1200, height: 630 });
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.end(buf);
  } catch (e) { console.error('OGIMG_FAIL', id, String(e && e.message || e)); res.writeHead(302, { Location: '/hero-banner.jpg' }); return res.end(); }
};
