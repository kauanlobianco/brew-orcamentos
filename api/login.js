/* POST /api/login  { senha }  ->  { token }
   Trava por 15 minutos depois de 10 tentativas erradas do mesmo IP. */
import {
  json, erro, lerCorpo, kvLer, kvGravar, kvApagar, bancoConfigurado,
  senhaConfigurada, senhaConfere, criarToken
} from './_lib.js';

const MAX_TENTATIVAS = 10;
const JANELA_MS = 15 * 60 * 1000;

export async function POST(request) {
  try {
    if (!senhaConfigurada()) return erro('ADMIN_PASSWORD não configurada na Vercel.', 500);
    if (!bancoConfigurado()) return erro('Banco (Supabase) não conectado ao projeto.', 500);

    const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    const chave = 'login:falhas:' + ip;
    let trava = await kvLer(chave);
    if (trava && Date.now() - trava.desde > JANELA_MS) trava = null;   /* janela venceu */
    if (trava && trava.n >= MAX_TENTATIVAS) {
      return erro('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
    }

    const { senha } = await lerCorpo(request, 4096);
    if (!(await senhaConfere(senha))) {
      await kvGravar(chave, { n: (trava ? trava.n : 0) + 1, desde: trava ? trava.desde : Date.now() });
      return erro('Senha incorreta.', 401);
    }

    if (trava) await kvApagar(chave);
    return json({ token: await criarToken() });
  } catch (e) {
    return erro(e.message || 'Erro inesperado.', e.status || 500);
  }
}
