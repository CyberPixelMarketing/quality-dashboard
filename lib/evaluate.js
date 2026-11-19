// Shared evaluation logic used by the Vercel functions (api/) and the local server (server.mjs).

// Comma-separated list, tried in order: if a model is overloaded (503/429) or slow, the next one is used.
export const MODELS = () =>
  (process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-2.5-flash,gemini-3.5-flash-lite')
    .split(',').map((m) => m.trim()).filter(Boolean);
export const MODEL = () => MODELS()[0];
export const hasKey = () => Boolean(process.env.GEMINI_API_KEY);
export const needsCode = () => Boolean(process.env.ACCESS_CODE);

const INSTRUCTIONS = `Return ONLY valid JSON with keys accuracyChecks, practicalityChecks, explanation, findings.
Do not return a final score or invent points. Evaluate the submitted result against the supplied numbered reference checks.
For every reference check return an object with id (the check's number, starting at 1), pass (true or false), evidence (quoting or precisely locating the participant's result), and note.
A check passes only when the result contains explicit, correct evidence; a vague mention does not pass.
For accuracy, require the correct number/calculation, explanation, and correction where applicable.
For practicality, require an actionable and usable output, not generic praise.
Also return findings: extra concrete observations as objects with title, criterion (accuracy|practicality), observed, expected, impact.
Be strict: missing evidence is a failed check. Do not invent evidence that is not present in the text/image.
Write explanation, evidence, notes and findings in Arabic.`;

const list = (v) => (Array.isArray(v) ? v.slice(0, 20).map((s) => String(s).slice(0, 300)) : []);
const numbered = (arr) => arr.map((c, i) => `${i + 1}. ${c}`).join('\n') || '(none)';

// Match the model's answers to the reference checks by id (falls back to position); missing = failed.
function scoreChecks(reference, answers, max) {
  const given = Array.isArray(answers) ? answers : [];
  const hasIds = given.some((g) => Number.isFinite(Number(g?.id)) && g?.id !== undefined);
  const checks = reference.map((label, i) => {
    const a = (hasIds ? given.find((g) => Number(g?.id) === i + 1) : given[i]) ?? {};
    return { id: i + 1, label, pass: a.pass === true || a.pass === 'true', evidence: String(a.evidence || ''), note: String(a.note || '') };
  });
  const per = reference.length ? max / reference.length : 0;
  return { checks, per, score: Math.round(checks.filter((c) => c.pass).length * per) };
}

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
  const accRef = list(x.accuracyChecks);
  const pracRef = list(x.practicalChecks);
  const user = `Challenge: ${x.challenge || ''}
Reference key: ${x.rubric || ''}
Reference checks for accuracy:
${numbered(accRef)}
Reference checks for practicality:
${numbered(pracRef)}
Participant prompt: ${x.prompt || '(none)'}
Participant result text: ${x.text || '(none; inspect image)'}

${INSTRUCTIONS}`;
  const parts = [{ text: user }];
  if (typeof x.image === 'string' && x.image.startsWith('data:image/')) {
    const m = x.image.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const request = (model, thinking) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(45_000),
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

  let api, usedModel, lastError = '';
  for (const model of MODELS()) {
    const started = Date.now();
    try {
      // Keep "thinking" short so judging stays fast; drop the setting for models that reject it.
      api = await request(model, { thinkingLevel: 'low' });
      if (api.status === 400 && /thinking/i.test(await api.clone().text())) api = await request(model, null);
    } catch (err) {
      lastError = `${model}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`;
      console.log(`[evaluate] ${lastError} ms=${Date.now() - started}`);
      continue;
    }
    console.log(`[evaluate] model=${model} status=${api.status} ms=${Date.now() - started} image=${parts.length > 1}`);
    if (api.ok) { usedModel = model; break; }
    lastError = `${model}: HTTP ${api.status} ${(await api.text()).slice(0, 300)}`;
    if (![429, 500, 503, 504].includes(api.status)) break; // real error (bad key, bad request): don't retry
  }
  if (!usedModel) {
    const e = new Error(/timeout|503|429/.test(lastError)
      ? 'خدمة Gemini مزدحمة حالياً، حاول مرة أخرى بعد دقيقة'
      : `Gemini API error — ${lastError}`);
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

  const acc = scoreChecks(accRef, parsed.accuracyChecks, 40);
  const prac = scoreChecks(pracRef, parsed.practicalityChecks, 40);
  const pts = (n) => Math.round(n * 10) / 10;
  const findings = [
    ...acc.checks.map((c) => ({
      title: `دقة ${c.id}: ${c.label}`, criterion: 'accuracy', observed: c.evidence || 'لا يوجد دليل صريح',
      expected: c.label, impact: c.note || (c.pass ? 'تحقق البند' : 'لم يتحقق البند'), points: c.pass ? pts(acc.per) : 0, pass: c.pass,
    })),
    ...prac.checks.map((c) => ({
      title: `تطبيق ${c.id}: ${c.label}`, criterion: 'practicality', observed: c.evidence || 'لا يوجد دليل صريح',
      expected: c.label, impact: c.note || (c.pass ? 'تحقق البند' : 'لم يتحقق البند'), points: c.pass ? pts(prac.per) : 0, pass: c.pass,
    })),
    // Extra observations from the model are shown for context but carry no points.
    ...(Array.isArray(parsed.findings) ? parsed.findings.slice(0, 10) : []).map((f) => ({
      title: `ملاحظة: ${String(f.title || '')}`, criterion: String(f.criterion || ''), observed: String(f.observed || f.issue || ''),
      expected: String(f.expected || ''), impact: String(f.impact || f.recommendation || ''), points: 0,
    })),
  ];
  const out = {
    accuracy: acc.score,
    practicality: prac.score,
    promptScore: 0, // calculated in the browser by the 7-element prompt framework
    explanation: String(parsed.explanation || ''),
    findings,
    accuracyChecks: acc.checks,
    practicalityChecks: prac.checks,
    model: usedModel,
  };
  return out;
}
