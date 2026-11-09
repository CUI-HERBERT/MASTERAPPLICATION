const MAX_BYTES = 1048576;
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers});

function safeShape(value, depth = 0) {
  if (depth > 16) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 20000;
  if (Array.isArray(value)) return value.length <= 2000 && value.every(v => safeShape(v, depth + 1));
  if (typeof value !== 'object') return false;
  const entries = Object.entries(value);
  return entries.length <= 2000 && entries.every(([key,v]) => !['__proto__','prototype','constructor'].includes(key) && key.length < 250 && safeShape(v, depth + 1));
}

export function validateState(state) {
  if (!state || Array.isArray(state) || typeof state !== 'object' || !safeShape(state)) return false;
  if (!state.profile || Array.isArray(state.profile) || typeof state.profile !== 'object') return false;
  const gpa = Number(state.profile.gpa);
  return Number.isFinite(gpa) && gpa >= 2 && gpa <= 5;
}

export async function handleState(request, env) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({error:'authentication_required'}, 401);
  if (!env.DB) return json({error:'cloud_storage_unavailable'}, 503);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT state_json, version, updated_at FROM planner_state WHERE user_id = ?').bind(userId).first();
    return row ? json({state:JSON.parse(row.state_json), version:row.version, updatedAt:row.updated_at}) : json({state:null, version:0, updatedAt:null});
  }
  if (request.method !== 'PUT') return json({error:'method_not_allowed'}, 405);
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'invalid_origin'}, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'json_required'}, 415);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) return json({error:'state_too_large'}, 413);
  let payload;
  try { payload = JSON.parse(text); } catch { return json({error:'invalid_json'}, 400); }
  if (!validateState(payload?.state) || !Number.isSafeInteger(payload?.version) || payload.version < 0) return json({error:'invalid_state'}, 400);
  const now = new Date().toISOString();
  const stateJson = JSON.stringify(payload.state);
  let result;
  if (payload.version === 0) {
    result = await env.DB.prepare('INSERT INTO planner_state (user_id, state_json, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING').bind(userId, stateJson, now).run();
  } else {
    result = await env.DB.prepare('UPDATE planner_state SET state_json = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?').bind(stateJson, now, userId, payload.version).run();
  }
  if (result.meta?.changes !== 1) {
    const row = await env.DB.prepare('SELECT version FROM planner_state WHERE user_id = ?').bind(userId).first();
    return json({error:'version_conflict', currentVersion:row?.version ?? 0}, 409);
  }
  return json({version:payload.version + 1, updatedAt:now});
}
