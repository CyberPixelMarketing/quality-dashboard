// Shared evaluation logic used by the Vercel functions (api/) and the local server (server.mjs).

export const MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
export const hasKey = () => Boolean(process.env.GEMINI_API_KEY);
export const needsCode = () => Boolean(process.env.ACCESS_CODE);

const INSTRUCTIONS = `You are a strict, fair workshop judge. Return ONLY valid JSON with keys:
score, accuracy, promptScore, practicality, speed, explanation, findings.
- accuracy: integer 0-40, promptScore: integer 0-20, practicality: integer 0-20, speed: integer 0-20 (speed is provisional; the dashboard recalculates it from submission order).
- findings must be an array of concrete evidence objects. Each object must have: title, criterion (accuracy|prompt|practicality|speed), observed, expected, impact, points (number).
- List every material error or omission you found; for the errors challenge, list each discovered error separately.
- Include at least one finding explaining the prompt score.
- Points must add up transparently to the criterion scores.
- Do not invent evidence that is not present in the text/image.
- Write explanation and all finding texts in Arabic.`;

const clamp = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

export function checkAccess(code) {
  if (!process.env.ACCESS_CODE) return true;
  return String(code || '') === process.env.ACCESS_CODE;
}

export async function evaluateSubmission(x) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not configured on the server');
    e.status = 503;
    throw e;
  }
  const user = `Challenge: ${x.challenge || ''}
Reference key / rubric: ${x.rubric || ''}
Team prompt: ${x.prompt || '(none)'}
Team result text: ${x.text || '(none; inspect image)'}

${INSTRUCTIONS}`;
  const parts = [{ text: user }];
  if (typeof x.image === 'string' && x.image.startsWith('data:image/')) {
    const m = x.image.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const started = Date.now();
  const call = (thinking) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(110_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
    }
  );
  let api;
  try {
    // Keep "thinking" short so judging stays fast; fall back if the model rejects the setting.
    api = await call({ thinkingLevel: 'low' });
    if (api.status === 400) {
      const msg = await api.clone().text();
      if (/thinking/i.test(msg)) api = await call({ thinkingBudget: 512 });
      if (api.status === 400 && /thinking/i.test(await api.clone().text())) api = await call(null);
    }
  } catch (err) {
    const e = new Error(err.name === 'TimeoutError' ? 'انتهت مهلة نموذج Gemini، حاول مرة أخرى' : 'Gemini request failed: ' + err.message);
    e.status = 504;
    throw e;
  }
  console.log(`[evaluate] model=${MODEL()} status=${api.status} ms=${Date.now() - started} image=${parts.length > 1}`);
  if (!api.ok) {
    const e = new Error(`Gemini API error ${api.status}: ${(await api.text()).slice(0, 500)}`);
    e.status = 502;
    throw e;
  }
  const raw = await api.json();
  const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
  } catch {
    const e = new Error('The model did not return valid JSON. Try again.');
    e.status = 502;
    throw e;
  }

  const out = {
    accuracy: clamp(parsed.accuracy, 40),
    promptScore: clamp(parsed.promptScore, 20),
    practicality: clamp(parsed.practicality, 20),
    speed: clamp(parsed.speed, 20),
    explanation: String(parsed.explanation || ''),
    findings: Array.isArray(parsed.findings)
      ? parsed.findings.slice(0, 40).map((f) => ({
          title: String(f.title || ''),
          criterion: String(f.criterion || ''),
          observed: String(f.observed || f.issue || ''),
          expected: String(f.expected || ''),
          impact: String(f.impact || f.recommendation || ''),
          points: Number(f.points) || 0,
        }))
      : [],
    model: MODEL(),
  };
  out.score = out.accuracy + out.promptScore + out.practicality + out.speed;
  return out;
}
