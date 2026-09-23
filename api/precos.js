/* GET /api/precos  -> tabela de preços do restaurante (ou null)
   PUT /api/precos  { tabela, arredondamento, ... } -> { ok, atualizado } */
import { json, erro, lerCorpo, redis, protegido } from './_lib.js';

const CHAVE = 'brew:precos';

export const GET = protegido(async () => {
  const cru = await redis('GET', CHAVE);
  return json({ precos: cru ? JSON.parse(cru) : null });
});

export const PUT = protegido(async (request) => {
  const precos = await lerCorpo(request);
  if (!precos || typeof precos !== 'object' || typeof precos.tabela !== 'object') {
    return erro('Tabela de preços inválida.', 400);
  }
  const atualizado = new Date().toISOString();
  await redis('SET', CHAVE, JSON.stringify(Object.assign({}, precos, { atualizado })));
  return json({ ok: true, atualizado });
});
