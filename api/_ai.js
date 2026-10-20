// Where the site's AI requests go (listing from a photo or screenshot, photo search, Edit with AI).
// By default they go through Vercel AI Gateway, which needs no API key on Vercel: each request signs in with the
// project's own short-lived OIDC token, and usage comes out of the team's AI Gateway credits.
// AI_GATEWAY_API_KEY works too (for running elsewhere). If ANTHROPIC_API_KEY is set, Anthropic is called directly.
// AI_MODEL picks the model (default: Claude Haiku 5.5).
const direct = () => (process.env.ANTHROPIC_API_KEY || '').trim();
const token = () => (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim();
// On when there is a way in: a direct key, a gateway key, or running on Vercel (where the OIDC token comes with each request).
const on = () => !!(direct() || token() || process.env.VERCEL);
const url = () => direct() ? 'https://api.anthropic.com/v1/messages' : 'https://ai-gateway.vercel.sh/v1/messages';
function headers() {
  const h = { 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  if (direct()) h['x-api-key'] = direct(); else h.authorization = 'Bearer ' + token();
  return h;
}
function model() {
  const m = (process.env.AI_MODEL || '').trim();
  if (direct()) return (m || 'claude-haiku-5-5').replace(/^anthropic\//, '').replace(/(\d)\.(\d)/, '$1-$2');
  return m ? (m.indexOf('/') < 0 ? 'anthropic/' + m.replace(/(\d)-(\d)$/, '$1.$2') : m) : 'anthropic/claude-haiku-5.5';
}
// Vercel hands each function its OIDC token in a request header; keep it where token() looks.
function take(req) { const t = req && req.headers && req.headers['x-vercel-oidc-token']; if (t) process.env.VERCEL_OIDC_TOKEN = String(t); }
module.exports = { on, url, headers, model, take };
