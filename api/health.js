import { hasKey, needsCode, MODEL } from '../lib/evaluate.js';

export function GET() {
  return Response.json({ ok: hasKey(), model: MODEL(), needsCode: needsCode() });
}
