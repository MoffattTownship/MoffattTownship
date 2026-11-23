// Moffatt Township: Cloudflare Worker
// - Serves static files from ./public (ASSETS binding)
// - GET  /api/content        public site content (R2, falls back to /data/content.json)
// - PUT  /api/content        save content (Cloudflare Access required)
// - POST /api/upload         upload image/document to R2 (Cloudflare Access required)
// - GET  /files/<key>        serve uploaded files from R2
// - /admin/*                 Cloudflare Access required (defense in depth; Access also guards at the edge)

const CONTENT_KEY = 'content.json';
const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOADS = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
const REQUIRED_KEYS = ['site', 'nav', 'tiles', 'meetings', 'officials', 'accessibility'];

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function verifyAccess(request, env) {
  if (env.DEV_BYPASS_AUTH === 'true') return { email: 'dev@localhost' };
  // The header is only added on Access-protected paths (/admin*); saves and uploads go to /api/*,
  // so also accept the CF_Authorization cookie that Access sets after login.
  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || (cookie && cookie[1]);
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null; // fail closed
  try {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    if (header.alg !== 'RS256') return null;
    const certs = await (await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600, cacheEverything: true } })).json();
    const jwk = certs.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function getContent(env, request) {
  const obj = await env.BUCKET.get(CONTENT_KEY);
  if (obj) return obj.text();
  const res = await env.ASSETS.fetch(new URL('/data/content.json', request.url));
  return res.text();
}

async function putContent(request, env) {
  const text = await request.text();
  if (text.length > MAX_CONTENT_BYTES) return json({ error: 'Content is too large.' }, 413);
  let data;
  try { data = JSON.parse(text); } catch (e) { return json({ error: 'Invalid JSON.' }, 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || REQUIRED_KEYS.some((k) => !(k in data))) {
    return json({ error: 'Content is missing required sections.' }, 400);
  }
  const prev = await env.BUCKET.get(CONTENT_KEY);
  if (prev) await env.BUCKET.put(`backups/content-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, await prev.text());
  await env.BUCKET.put(CONTENT_KEY, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
  return json({ ok: true });
}

async function uploadFile(request, env) {
  let form;
  try { form = await request.formData(); } catch (e) { return json({ error: 'Invalid upload.' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No file received.' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'File is larger than 10 MB.' }, 413);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = ALLOWED_UPLOADS[ext];
  if (!type) return json({ error: 'File type not allowed. Use PNG, JPG, WebP, PDF, DOC or DOCX.' }, 415);
  const base = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
  const key = `uploads/${Date.now()}-${base}.${ext}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: type } });
  return json({ url: `/files/${key}` });
}

async function serveFile(url, env) {
  const key = decodeURIComponent(url.pathname.replace(/^\/files\//, ''));
  if (!key.startsWith('uploads/') || key.includes('..')) return new Response('Not found', { status: 404 });
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff'
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/content') {
      if (request.method === 'GET') return new Response(await getContent(env, request), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
      if (request.method === 'PUT') {
        if (!(await verifyAccess(request, env))) return json({ error: 'Not authorized.' }, 401);
        return putContent(request, env);
      }
      return json({ error: 'Method not allowed.' }, 405);
    }
    if (pathname === '/api/upload') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (!(await verifyAccess(request, env))) return json({ error: 'Not authorized.' }, 401);
      return uploadFile(request, env);
    }
    if (pathname.startsWith('/files/')) return serveFile(url, env);
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (!(await verifyAccess(request, env))) return new Response('Not authorized', { status: 403 });
    }
    return env.ASSETS.fetch(request);
  }
};
