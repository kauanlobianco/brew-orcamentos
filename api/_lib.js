/* =============================================================================
   Brew — utilidades das funções da Vercel (não vira endpoint: começa com "_")

   Banco: Postgres no Neon (ver "banco" abaixo).

   Login: uma senha única de administrador, na variável ADMIN_PASSWORD.
   O token de sessão é assinado com HMAC a partir dela — trocar a senha
   derruba todas as sessões abertas.

   ========================================================================== */
import { neon } from '@neondatabase/serverless';

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

/* -------------------------------------------------------------------- banco
   Postgres no Neon, falado por HTTP com o driver oficial (@neondatabase/serverless).
   DATABASE_URL é criada sozinha quando o Neon é conectado ao projeto pelo
   menu Storage da Vercel. As tabelas nascem sozinhas no primeiro acesso —
   não precisa rodar SQL nenhum.

   O plano gratuito do Neon não pausa como o do Supabase: o banco cochila
   depois de alguns minutos parado e acorda sozinho na próxima consulta
   (leva ~1 segundo a mais). Nunca precisa de "restore". */

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function bancoConfigurado() {
  return Boolean(dbUrl());
}

const BANCO_FORA = 'O banco de dados não respondeu. Confira a internet e tente de novo em instantes.';

const TABELAS = [
  `create table if not exists brew_kv (
     chave      text primary key,
     valor      jsonb not null,
     atualizado timestamptz not null default now()
   )`,
  `create table if not exists brew_orcamentos (
     id         uuid primary key,
     criado     timestamptz not null default now(),
     atualizado timestamptz not null default now(),
     resumo     jsonb not null default '{}'::jsonb,
     estado     jsonb not null,
     precos     jsonb
   )`,
  `create index if not exists brew_orcamentos_atualizado on brew_orcamentos (atualizado desc)`
];

/* (texto, params) -> linhas. Trocável nos testes por um Postgres local. */
let consultar = null;
export function usarConsulta(fn) { consultar = fn; prontas = null; }

async function bruto(texto, params) {
  if (!consultar) {
    const sql = neon(dbUrl());
    consultar = (t, p) => sql.query(t, p);
  }
  try {
    return await consultar(texto, params || []);
  } catch (e) {
    /* erro de SQL tem código (sqlstate); sem código = nem conectou */
    if (!e.code) throw Object.assign(new Error(BANCO_FORA), { status: 503 });
    throw new Error('Banco: ' + e.message);
  }
}

let prontas = null;
function prepararTabelas() {
  if (!prontas) {
    prontas = TABELAS.reduce((p, t) => p.then(() => bruto(t)), Promise.resolve())
      .catch((e) => { prontas = null; throw e; });
  }
  return prontas;
}

/* toda consulta do painel passa por aqui: garante as tabelas uma vez por
   instância da função e depois só consulta */
export async function db(texto, params) {
  await prepararTabelas();
  return bruto(texto, params);
}

/* chave/valor simples (tabela brew_kv): tabela de preços, travas de login */
export async function kvLer(chave) {
  const linhas = await db('select valor from brew_kv where chave = $1', [chave]);
  return linhas[0] ? linhas[0].valor : null;
}
export async function kvGravar(chave, valor) {
  await db(
    `insert into brew_kv (chave, valor, atualizado) values ($1, $2::jsonb, now())
     on conflict (chave) do update set valor = excluded.valor, atualizado = excluded.atualizado`,
    [chave, JSON.stringify(valor)]
  );
}
export async function kvApagar(chave) {
  await db('delete from brew_kv where chave = $1', [chave]);
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
      if (!bancoConfigurado()) return erro('Banco (Neon) não conectado ao projeto — Vercel > Storage.', 500);
      if (!(await autorizado(request))) return erro('Sessão expirada. Entre de novo.', 401);
      return await handler(request);
    } catch (e) {
      return erro(e.message || 'Erro inesperado.', e.status || 500);
    }
  };
}
