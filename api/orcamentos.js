/* Orçamentos salvos (tabela brew_orcamentos, no Neon).
   GET    /api/orcamentos          -> { lista: [resumo...] }  (mais recente primeiro)
   GET    /api/orcamentos?id=X     -> { orcamento }
   POST   /api/orcamentos          { id?, estado, precos?, resumo } -> { id, criado, atualizado }
   DELETE /api/orcamentos?id=X     -> { ok }

   A lista lê só a coluna "resumo" — abre rápido sem baixar os orçamentos inteiros. */
import { json, erro, lerCorpo, db, protegido } from './_lib.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idDaUrl(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id && !UUID.test(id)) throw Object.assign(new Error('id inválido.'), { status: 400 });
  return id;
}

export const GET = protegido(async (request) => {
  const id = idDaUrl(request);
  if (id) {
    const linhas = await db(
      'select id, criado, atualizado, estado, precos from brew_orcamentos where id = $1', [id]);
    if (!linhas.length) return erro('Orçamento não encontrado.', 404);
    return json({ orcamento: linhas[0] });
  }
  const linhas = await db(
    'select id, criado, atualizado, resumo from brew_orcamentos order by atualizado desc');
  const lista = linhas.map(l => Object.assign({}, l.resumo || {}, { id: l.id, criado: l.criado, atualizado: l.atualizado }));
  return json({ lista });
});

export const POST = protegido(async (request) => {
  const corpo = await lerCorpo(request);
  if (!corpo.estado || typeof corpo.estado !== 'object') return erro('Orçamento sem conteúdo.', 400);
  if (corpo.id && !UUID.test(corpo.id)) return erro('id inválido.', 400);

  /* upsert: cria se não existe, atualiza se existe (a data de criação fica) */
  const salvas = await db(
    `insert into brew_orcamentos (id, atualizado, resumo, estado, precos)
     values ($1, now(), $2::jsonb, $3::jsonb, $4::jsonb)
     on conflict (id) do update set
       atualizado = excluded.atualizado, resumo = excluded.resumo,
       estado = excluded.estado, precos = excluded.precos
     returning id, criado, atualizado`,
    [
      corpo.id || crypto.randomUUID(),
      JSON.stringify(corpo.resumo || {}),
      JSON.stringify(corpo.estado),
      corpo.precos ? JSON.stringify(corpo.precos) : null
    ]
  );
  const s = salvas[0];
  return json({ id: s.id, criado: s.criado, atualizado: s.atualizado });
});

export const DELETE = protegido(async (request) => {
  const id = idDaUrl(request);
  if (!id) return erro('Falta o id.', 400);
  await db('delete from brew_orcamentos where id = $1', [id]);
  return json({ ok: true });
});
