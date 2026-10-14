/* GET /api/manter-ativo  — chamado 1x por dia pelo cron da Vercel (vercel.json)

   O plano gratuito do Supabase pausa o projeto depois de 7 dias sem nenhuma
   consulta, e aí o login dá "fetch failed". Esta rota faz uma leitura mínima
   no banco todo dia para ele nunca ficar parado esse tempo todo.

   Se a variável CRON_SECRET existir na Vercel, só o cron (que manda
   "Authorization: Bearer <CRON_SECRET>") consegue chamar. A rota não lê nem
   devolve nenhum dado do painel. */
import { json, erro, sb, bancoConfigurado } from './_lib.js';

export async function GET(request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get('authorization') !== 'Bearer ' + segredo) {
    return erro('Não autorizado.', 401);
  }
  if (!bancoConfigurado()) return erro('Banco (Supabase) não conectado ao projeto.', 500);
  try {
    await sb('GET', 'brew_kv?select=chave&limit=1');
    return json({ ok: true, em: new Date().toISOString() });
  } catch (e) {
    return erro(e.message || 'Erro inesperado.', e.status || 500);
  }
}
