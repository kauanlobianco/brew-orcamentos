/* POST /api/login  { senha }  ->  { token }
   Trava por 15 minutos depois de 10 tentativas erradas do mesmo IP. */
import {
  json, erro, lerCorpo, redis, bancoConfigurado,
  senhaConfigurada, senhaConfere, criarToken
} from './_lib.js';

const MAX_TENTATIVAS = 10;
const JANELA_S = 15 * 60;

export async function POST(request) {
  try {
    if (!senhaConfigurada()) return erro('ADMIN_PASSWORD não configurada na Vercel.', 500);
    if (!bancoConfigurado()) return erro('Banco (Upstash Redis) não conectado ao projeto.', 500);

    const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    const chave = 'brew:login:falhas:' + ip;
    const falhas = Number(await redis('GET', chave)) || 0;
    if (falhas >= MAX_TENTATIVAS) {
      return erro('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
    }

    const { senha } = await lerCorpo(request, 4096);
    if (!(await senhaConfere(senha))) {
      await redis('INCR', chave);
      await redis('EXPIRE', chave, JANELA_S);
      return erro('Senha incorreta.', 401);
    }

    await redis('DEL', chave);
    return json({ token: await criarToken() });
  } catch (e) {
    return erro(e.message || 'Erro inesperado.', e.status || 500);
  }
}
