/* Orçamentos salvos.
   GET    /api/orcamentos          -> { lista: [resumo...] }  (mais recente primeiro)
   GET    /api/orcamentos?id=X     -> { orcamento }
   POST   /api/orcamentos          { id?, estado, precos?, resumo } -> { id, atualizado }
   DELETE /api/orcamentos?id=X     -> { ok }

   Guarda cada orçamento inteiro em brew:orc:<id> e um resumo leve de todos
   no hash brew:orcs, para a lista abrir rápido sem baixar tudo. */
import { json, erro, lerCorpo, redis, redisMulti, protegido } from './_lib.js';

const LISTA = 'brew:orcs';
const doc = (id) => 'brew:orc:' + id;
const ID_VALIDO = /^[a-z0-9-]{8,64}$/i;

function idDaUrl(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id && !ID_VALIDO.test(id)) throw Object.assign(new Error('id inválido.'), { status: 400 });
  return id;
}

export const GET = protegido(async (request) => {
  const id = idDaUrl(request);
  if (id) {
    const cru = await redis('GET', doc(id));
    if (!cru) return erro('Orçamento não encontrado.', 404);
    return json({ orcamento: JSON.parse(cru) });
  }
  const plano = (await redis('HGETALL', LISTA)) || [];
  const lista = [];
  for (let i = 1; i < plano.length; i += 2) {
    try { lista.push(JSON.parse(plano[i])); } catch (e) { /* resumo corrompido: ignora */ }
  }
  lista.sort((a, b) => String(b.atualizado).localeCompare(String(a.atualizado)));
  return json({ lista });
});

export const POST = protegido(async (request) => {
  const corpo = await lerCorpo(request);
  if (!corpo.estado || typeof corpo.estado !== 'object') return erro('Orçamento sem conteúdo.', 400);

  let id = corpo.id;
  let criado = new Date().toISOString();
  if (id) {
    if (!ID_VALIDO.test(id)) return erro('id inválido.', 400);
    const anterior = await redis('GET', doc(id));
    if (anterior) criado = JSON.parse(anterior).criado || criado;
  } else {
    id = crypto.randomUUID();
  }

  const atualizado = new Date().toISOString();
  const resumo = Object.assign({}, corpo.resumo || {}, { id, criado, atualizado });
  const orcamento = { id, criado, atualizado, estado: corpo.estado, precos: corpo.precos || null };

  await redisMulti([
    ['SET', doc(id), JSON.stringify(orcamento)],
    ['HSET', LISTA, id, JSON.stringify(resumo)]
  ]);
  return json({ id, criado, atualizado });
});

export const DELETE = protegido(async (request) => {
  const id = idDaUrl(request);
  if (!id) return erro('Falta o id.', 400);
  await redisMulti([['DEL', doc(id)], ['HDEL', LISTA, id]]);
  return json({ ok: true });
});
