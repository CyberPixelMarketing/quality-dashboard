// Temporary diagnostics: checks connectivity and latency to the Gemini API. Requires ?code=ACCESS_CODE.
import { checkAccess, MODEL } from '../lib/evaluate.js';

async function timed(label, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    return { label, ms: Date.now() - t, ...r };
  } catch (e) {
    return { label, ms: Date.now() - t, error: `${e.name}: ${e.message}` };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!checkAccess(url.searchParams.get('code'))) return Response.json({ error: 'code' }, { status: 401 });
  const key = process.env.GEMINI_API_KEY;
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const h = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
  const gen = (model, extra = {}) => async () => {
    const r = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST', headers: h, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK' }] }], generationConfig: extra }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  };
  const model = url.searchParams.get('model') || MODEL();
  const results = await Promise.all([
    timed('list-models', async () => {
      const r = await fetch(`${base}/models?pageSize=200`, { headers: h, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      return { status: r.status, flash: (j.models || []).map((m) => m.name).filter((n) => /flash/.test(n)), error: j.error?.message };
    }),
    timed(`gen ${model}`, gen(model)),
    timed(`gen ${model} low-thinking`, gen(model, { thinkingConfig: { thinkingLevel: 'low' } })),
  ]);
  return Response.json({ keyLength: key ? key.length : 0, region: process.env.VERCEL_REGION, results });
}
