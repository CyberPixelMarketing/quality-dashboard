import { evaluateSubmission, checkAccess } from '../lib/evaluate.js';

export async function POST(request) {
  if (!checkAccess(request.headers.get('x-access-code'))) {
    return Response.json({ error: 'رمز الدخول غير صحيح' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    return Response.json(await evaluateSubmission(body));
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
