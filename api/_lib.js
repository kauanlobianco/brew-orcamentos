/* =============================================================================
   Brew — utilidades das funções da Vercel (não vira endpoint: começa com "_")

   Banco: Supabase (Postgres), falado pela API REST — sem pacote npm.
   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são criadas sozinhas quando o
   Supabase é conectado ao projeto pela integração da Vercel. As tabelas vêm
   de supabase/tabelas.sql (rodar uma vez no SQL Editor).

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

/* ----------------------------------------------------------------- supabase
   Fala com o Postgres pela API REST do Supabase (PostgREST), com a chave de
   serviço — que só existe aqui no servidor. As tabelas têm RLS ligado e
   nenhuma política: a chave pública (anon) não lê nem grava nada. */

function sbUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}
function sbChave() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
}

export function bancoConfigurado() {
  return Boolean(sbUrl() && sbChave());
}

export async function sb(metodo, caminho, corpo, prefer) {
  const chave = sbChave();
  const headers = { apikey: chave, 'content-type': 'application/json' };
  /* chave antiga (JWT) vai também no Authorization; a nova (sb_secret_) não */
  if (chave.startsWith('eyJ')) headers.authorization = 'Bearer ' + chave;
  if (prefer) headers.prefer = prefer;
  const r = await fetch(sbUrl() + '/rest/v1/' + caminho, {
    method: metodo, headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = null; }
  if (!r.ok) {
    const msg = (dados && (dados.message || dados.error)) || ('HTTP ' + r.status);
    if ((dados && (dados.code === '42P01' || dados.code === 'PGRST205')) || /does not exist|could not find the table/i.test(msg)) {
      throw Object.assign(new Error('As tabelas do banco ainda não foram criadas — rode supabase/tabelas.sql no SQL Editor do Supabase.'), { status: 500 });
    }
    throw new Error('Banco: ' + msg);
  }
  return dados;
}

/* chave/valor simples (tabela brew_kv): tabela de preços, travas de login */
export async function kvLer(chave) {
  const linhas = await sb('GET', 'brew_kv?select=valor&chave=eq.' + encodeURIComponent(chave));
  return linhas && linhas[0] ? linhas[0].valor : null;
}
export async function kvGravar(chave, valor) {
  await sb('POST', 'brew_kv?on_conflict=chave',
    { chave, valor, atualizado: new Date().toISOString() },
    'resolution=merge-duplicates,return=minimal');
}
export async function kvApagar(chave) {
  await sb('DELETE', 'brew_kv?chave=eq.' + encodeURIComponent(chave), undefined, 'return=minimal');
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
      if (!bancoConfigurado()) return erro('Banco (Supabase) não conectado ao projeto.', 500);
      if (!(await autorizado(request))) return erro('Sessão expirada. Entre de novo.', 401);
      return await handler(request);
    } catch (e) {
      return erro(e.message || 'Erro inesperado.', e.status || 500);
    }
  };
}
