/* =============================================================================
   Brew — utilidades das funções da Vercel (não vira endpoint: começa com "_")

   Banco: Upstash Redis, falado por HTTP (REST) — sem pacote npm.
   As variáveis KV_REST_API_URL / KV_REST_API_TOKEN são criadas sozinhas quando
   o banco é conectado ao projeto pelo Marketplace da Vercel.

   Login: uma senha única de administrador, na variável ADMIN_PASSWORD.
   O token de sessão é assinado com HMAC a partir dela — trocar a senha
   derruba todas as sessões abertas.

   Só usa APIs Web (fetch, crypto.subtle, Request/Response), que existem no
   Node 22 da Vercel e também no navegador — dá pra testar sem Node local.
   ========================================================================== */

const DIAS_SESSAO = 30;

/* ---------------------------------------------------------------- respostas */

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export function erro(mensagem, status) {
  return json({ erro: mensagem }, status);
}

export async function lerCorpo(request, limite = 900 * 1024) {
  const texto = await request.text();
  if (texto.length > limite) throw Object.assign(new Error('Conteúdo grande demais.'), { status: 413 });
  try { return texto ? JSON.parse(texto) : {}; }
  catch (e) { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}

/* -------------------------------------------------------------------- redis */

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}
function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}

export function bancoConfigurado() {
  return Boolean(redisUrl() && redisToken());
}

async function chamarRedis(caminho, corpo) {
  const r = await fetch(redisUrl().replace(/\/$/, '') + caminho, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + redisToken(), 'content-type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Banco respondeu ' + r.status + ': ' + (dados.error || ''));
  return dados;
}

/* um comando: redis('GET', 'chave') */
export async function redis(...comando) {
  const dados = await chamarRedis('', comando);
  if (dados.error) throw new Error('Banco: ' + dados.error);
  return dados.result;
}

/* vários comandos numa transação: redisMulti([['SET',..], ['HSET',..]]) */
export async function redisMulti(comandos) {
  const dados = await chamarRedis('/multi-exec', comandos);
  const lista = Array.isArray(dados) ? dados : [];
  const falha = lista.find(x => x && x.error);
  if (falha) throw new Error('Banco: ' + falha.error);
  return lista.map(x => x && x.result);
}

/* ------------------------------------------------------------------ sessão */

const cod = new TextEncoder();

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(texto) {
  const chave = await crypto.subtle.importKey(
    'raw', cod.encode((process.env.ADMIN_PASSWORD || '') + '|brew-sessao'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return base64url(await crypto.subtle.sign('HMAC', chave, cod.encode(texto)));
}

/* comparação em tempo constante — não deixa vazar quanto do texto bateu */
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export function senhaConfigurada() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function senhaConfere(senha) {
  if (!senhaConfigurada() || typeof senha !== 'string') return false;
  return iguais(await hmac('senha:' + senha), await hmac('senha:' + process.env.ADMIN_PASSWORD));
}

export async function criarToken() {
  const expira = Date.now() + DIAS_SESSAO * 24 * 60 * 60 * 1000;
  return expira + '.' + await hmac('v1.' + expira);
}

export async function autorizado(request) {
  if (!senhaConfigurada()) return false;
  const cab = request.headers.get('authorization') || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  const [expira, assinatura] = token.split('.');
  if (!expira || !assinatura || !(Number(expira) > Date.now())) return false;
  return iguais(assinatura, await hmac('v1.' + expira));
}

/* Envolve um handler: exige login, confere o banco e padroniza os erros. */
export function protegido(handler) {
  return async (request) => {
    try {
      if (!senhaConfigurada()) return erro('ADMIN_PASSWORD não configurada na Vercel.', 500);
      if (!bancoConfigurado()) return erro('Banco (Upstash Redis) não conectado ao projeto.', 500);
      if (!(await autorizado(request))) return erro('Sessão expirada. Entre de novo.', 401);
      return await handler(request);
    } catch (e) {
      return erro(e.message || 'Erro inesperado.', e.status || 500);
    }
  };
}
