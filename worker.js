/* ================================================================
   Guia de Patins — Worker de sincronização (login + estado entre dispositivos)
   Rotas: POST /api/register, POST /api/login, GET/PUT /api/state,
          POST /api/change-password
   Armazenamento: Workers KV (um registro por usuário)
   Senha: PBKDF2 (Web Crypto nativa, sem dependências)
   Sessão: token assinado com HMAC (AUTH_SECRET), 90 dias, sem banco de sessões
   Qualquer rota fora de /api/* é servida como arquivo estático (env.ASSETS)
   ================================================================ */

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias
const PBKDF2_ITERATIONS = 100000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const response = await handleApi(request, env, url).catch((e) =>
        json({ error: 'erro interno', detail: String(e && e.message || e) }, 500)
      );
      return withCors(response, request);
    }

    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), request);

    return env.ASSETS.fetch(request);
  },
};

/* ================= ROTEAMENTO DA API ================= */
async function handleApi(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const { pathname } = url;
  if (pathname === '/api/register' && request.method === 'POST') return register(request, env);
  if (pathname === '/api/login' && request.method === 'POST') return login(request, env);
  if (pathname === '/api/state' && request.method === 'GET') return getState(request, env);
  if (pathname === '/api/state' && request.method === 'PUT') return putState(request, env);
  if (pathname === '/api/change-password' && request.method === 'POST') return changePassword(request, env);
  if (pathname === '/api/change-username' && request.method === 'POST') return changeUsername(request, env);
  return json({ error: 'rota não encontrada' }, 404);
}

/* ================= CORS =================
   Grupo pequeno e de confiança, múltiplos front-ends (Cloudflare, GitHub
   Pages, o WebView do app Android) — liberamos qualquer origem em vez de
   manter uma lista, já que não há dados sensíveis de terceiros em jogo. */
function withCors(response, request) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

/* ================= CRIPTOGRAFIA (Web Crypto nativa) ================= */
function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hashPassword(password, existingSaltB64) {
  const enc = new TextEncoder();
  const salt = existingSaltB64 ? b64decode(existingSaltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: b64encode(bits), salt: b64encode(salt) };
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyPassword(password, saltB64, expectedHashB64) {
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(hash, expectedHashB64);
}

/* ----- token de sessão: HMAC-SHA256 sobre um payload {username, exp} -----
   Formato: base64url(payload).base64url(assinatura) — sem dependências,
   sem biblioteca de JWT, só o suficiente pro nosso caso de uso. */
async function hmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signToken(payload, secret) {
  const enc = new TextEncoder();
  const payloadB64 = b64encode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  return `${payloadB64}.${b64encode(sig)}`;
}

async function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.');
  const enc = new TextEncoder();
  const key = await hmacKey(secret);
  const expectedSig = b64encode(await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64)));
  if (!timingSafeEqual(expectedSig, sigB64)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64decode(payloadB64)));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

async function getAuthedUsername(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const payload = await verifyToken(match[1], env.AUTH_SECRET);
  return payload ? payload.username : null;
}

/* ================= VALIDAÇÃO ================= */
function validUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_-]{3,24}$/.test(u);
}
function kvKeyFor(username) {
  return `user:${username.toLowerCase()}`;
}

/* ================= ROTAS ================= */
async function register(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;
  if (!validUsername(username)) {
    return json({ error: 'usuário inválido — use 3 a 24 letras, números, _ ou -' }, 400);
  }
  if (typeof password !== 'string' || password.length < 1) {
    return json({ error: 'senha não pode ser vazia' }, 400);
  }
  const key = kvKeyFor(username);
  const existing = await env.SYNC_KV.get(key);
  if (existing) return json({ error: 'esse usuário já existe' }, 409);

  const { hash, salt } = await hashPassword(password);
  const record = { username, hash, salt, state: null, updated_at: 0 };
  await env.SYNC_KV.put(key, JSON.stringify(record));

  const token = await signToken({ username, exp: Date.now() + TOKEN_TTL_MS }, env.AUTH_SECRET);
  return json({ token, username });
}

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;
  if (!validUsername(username) || typeof password !== 'string') {
    return json({ error: 'usuário ou senha incorretos' }, 401);
  }
  const raw = await env.SYNC_KV.get(kvKeyFor(username));
  if (!raw) return json({ error: 'usuário ou senha incorretos' }, 401);
  const record = JSON.parse(raw);
  const ok = await verifyPassword(password, record.salt, record.hash);
  if (!ok) return json({ error: 'usuário ou senha incorretos' }, 401);

  const token = await signToken({ username: record.username, exp: Date.now() + TOKEN_TTL_MS }, env.AUTH_SECRET);
  return json({ token, username: record.username });
}

async function getState(request, env) {
  const username = await getAuthedUsername(request, env);
  if (!username) return json({ error: 'não autenticado' }, 401);
  const raw = await env.SYNC_KV.get(kvKeyFor(username));
  if (!raw) return json({ error: 'usuário não encontrado' }, 404);
  const record = JSON.parse(raw);
  return json({ state: record.state, updated_at: record.updated_at });
}

async function putState(request, env) {
  const username = await getAuthedUsername(request, env);
  if (!username) return json({ error: 'não autenticado' }, 401);
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body.state !== 'object' || body.state === null) {
    return json({ error: 'estado inválido' }, 400);
  }
  const key = kvKeyFor(username);
  const raw = await env.SYNC_KV.get(key);
  if (!raw) return json({ error: 'usuário não encontrado' }, 404);
  const record = JSON.parse(raw);
  record.state = body.state;
  record.updated_at = Date.now();
  await env.SYNC_KV.put(key, JSON.stringify(record));
  return json({ ok: true, updated_at: record.updated_at });
}

async function changePassword(request, env) {
  const username = await getAuthedUsername(request, env);
  if (!username) return json({ error: 'não autenticado' }, 401);
  const body = await request.json().catch(() => ({}));
  const { oldPassword, newPassword } = body;
  if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 1) {
    return json({ error: 'nova senha não pode ser vazia' }, 400);
  }
  const key = kvKeyFor(username);
  const raw = await env.SYNC_KV.get(key);
  if (!raw) return json({ error: 'usuário não encontrado' }, 404);
  const record = JSON.parse(raw);
  const ok = await verifyPassword(oldPassword, record.salt, record.hash);
  if (!ok) return json({ error: 'senha atual incorreta' }, 401);

  const { hash, salt } = await hashPassword(newPassword);
  record.hash = hash;
  record.salt = salt;
  await env.SYNC_KV.put(key, JSON.stringify(record));
  return json({ ok: true });
}

async function changeUsername(request, env) {
  const currentUsername = await getAuthedUsername(request, env);
  if (!currentUsername) return json({ error: 'não autenticado' }, 401);
  const body = await request.json().catch(() => ({}));
  const { newUsername, password } = body;
  if (!validUsername(newUsername)) {
    return json({ error: 'novo usuário inválido — use 3 a 24 letras, números, _ ou -' }, 400);
  }
  if (typeof password !== 'string') return json({ error: 'senha obrigatória pra confirmar a troca' }, 400);

  const oldKey = kvKeyFor(currentUsername);
  const raw = await env.SYNC_KV.get(oldKey);
  if (!raw) return json({ error: 'usuário não encontrado' }, 404);
  const record = JSON.parse(raw);

  const ok = await verifyPassword(password, record.salt, record.hash);
  if (!ok) return json({ error: 'senha incorreta' }, 401);

  if (newUsername.toLowerCase() === currentUsername.toLowerCase()) {
    return json({ error: 'esse já é o seu usuário atual' }, 400);
  }
  const newKey = kvKeyFor(newUsername);
  const existing = await env.SYNC_KV.get(newKey);
  if (existing) return json({ error: 'esse nome de usuário já está em uso' }, 409);

  record.username = newUsername;
  await env.SYNC_KV.put(newKey, JSON.stringify(record));
  await env.SYNC_KV.delete(oldKey);

  // token antigo referenciava o username anterior — emite um novo já com o nome atualizado
  const token = await signToken({ username: newUsername, exp: Date.now() + TOKEN_TTL_MS }, env.AUTH_SECRET);
  return json({ ok: true, token, username: newUsername });
}
