/* GET /api/precos  -> tabela de preços do restaurante (ou null)
   PUT /api/precos  { tabela, arredondamento, ... } -> { ok, atualizado } */
import { json, erro, lerCorpo, kvLer, kvGravar, protegido } from './_lib.js';

const CHAVE = 'precos';

export const GET = protegido(async () => {
  return json({ precos: await kvLer(CHAVE) });
});

export const PUT = protegido(async (request) => {
  const precos = await lerCorpo(request);
  if (!precos || typeof precos !== 'object' || typeof precos.tabela !== 'object') {
    return erro('Tabela de preços inválida.', 400);
  }
  const atualizado = new Date().toISOString();
  await kvGravar(CHAVE, Object.assign({}, precos, { atualizado }));
  return json({ ok: true, atualizado });
});
