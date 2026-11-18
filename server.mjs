// Local development server (optional). On Vercel, the files in api/ are used instead.
// Usage:  GEMINI_API_KEY=... node server.mjs   →  http://localhost:8787
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSubmission, checkAccess, hasKey, needsCode, MODEL } from './lib/evaluate.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 8787);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: hasKey(), model: MODEL(), needsCode: needsCode() });
    if (req.method === 'POST' && url.pathname === '/api/evaluate') {
      if (!checkAccess(req.headers['x-access-code'])) return send(res, 401, { error: 'رمز الدخول غير صحيح' });
      let s = ''; for await (const c of req) s += c;
      try { return send(res, 200, await evaluateSubmission(JSON.parse(s))); }
      catch (e) { return send(res, e.status || 500, { error: e.message }); }
    }
    if (req.method === 'GET') {
      const file = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
      const full = path.join(root, file);
      if (!full.startsWith(root)) return send(res, 403, { error: 'Forbidden' });
      const data = await fs.readFile(full);
      res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream' });
      return res.end(data);
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, e.code === 'ENOENT' ? 404 : 500, { error: e.message }); }
}).listen(port, () => console.log(`Dashboard: http://localhost:${port}`));
