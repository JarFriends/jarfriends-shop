// A product photo the owner uploaded in the back office. GET ?id=<product id> returns the picture.
// The pictures sit in the site's private storage as photos/<id>.jpg; this hands them out to the shop and to emails.
const store = require('./_store');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(id) || !store.on()) return res.status(404).send('Not found');
  try {
    const { get } = await import('@vercel/blob');
    const r = await get('photos/' + id + '.jpg', { access: 'private' });
    if (!r || r.statusCode !== 200 || !r.stream) return res.status(404).send('Not found');
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // The address carries ?v=<when it was saved>, so a new upload gets a new address and this copy can be kept a long time.
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.send(buf);
  } catch (e) { res.status(404).send('Not found'); }
};
