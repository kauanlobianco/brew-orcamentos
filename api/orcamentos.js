/* Orçamentos salvos (tabela brew_orcamentos).
   GET    /api/orcamentos          -> { lista: [resumo...] }  (mais recente primeiro)
   GET    /api/orcamentos?id=X     -> { orcamento }
   POST   /api/orcamentos          { id?, estado, precos?, resumo } -> { id, criado, atualizado }
   DELETE /api/orcamentos?id=X     -> { ok }

   A lista lê só a coluna "resumo" — abre rápido sem baixar os orçamentos inteiros. */
import { json, erro, lerCorpo, sb, protegido } from './_lib.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idDaUrl(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id && !UUID.test(id)) throw Object.assign(new Error('id inválido.'), { status: 400 });
  return id;
}

export const GET = protegido(async (request) => {
  const id = idDaUrl(request);
  if (id) {
    const linhas = await sb('GET', 'brew_orcamentos?select=id,criado,atualizado,estado,precos&id=eq.' + id);
    if (!linhas || !linhas.length) return erro('Orçamento não encontrado.', 404);
    return json({ orcamento: linhas[0] });
  }
  const linhas = await sb('GET', 'brew_orcamentos?select=id,criado,atualizado,resumo&order=atualizado.desc') || [];
  const lista = linhas.map(l => Object.assign({}, l.resumo || {}, { id: l.id, criado: l.criado, atualizado: l.atualizado }));
  return json({ lista });
});

export const POST = protegido(async (request) => {
  const corpo = await lerCorpo(request);
  if (!corpo.estado || typeof corpo.estado !== 'object') return erro('Orçamento sem conteúdo.', 400);
  if (corpo.id && !UUID.test(corpo.id)) return erro('id inválido.', 400);

  const linha = {
    id: corpo.id || crypto.randomUUID(),
    atualizado: new Date().toISOString(),
    resumo: corpo.resumo || {},
    estado: corpo.estado,
    precos: corpo.precos || null
  };
  /* upsert: cria se não existe, atualiza se existe (a data de criação fica) */
  const salvas = await sb('POST', 'brew_orcamentos?on_conflict=id', linha,
    'resolution=merge-duplicates,return=representation');
  const s = salvas && salvas[0] || linha;
  return json({ id: s.id, criado: s.criado, atualizado: s.atualizado });
});

export const DELETE = protegido(async (request) => {
  const id = idDaUrl(request);
  if (!id) return erro('Falta o id.', 400);
  await sb('DELETE', 'brew_orcamentos?id=eq.' + id, undefined, 'return=minimal');
  return json({ ok: true });
});
