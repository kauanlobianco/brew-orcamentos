/* =============================================================================
   Brew — conexão com a nuvem (funções /api da Vercel)

   Publicado (http/https): tudo é salvo na conta do administrador — tabela de
   preços e orçamentos — e aparece igual no celular e no computador.
   Aberto como arquivo (file://): o painel continua funcionando só no
   navegador, como antes, sem login.
   ========================================================================== */
window.BREW_NUVEM = (function () {
  'use strict';

  var CHAVE_TOKEN = 'brew.sessao';
  var ativo = /^https?:$/.test(location.protocol);
  var aoExpirar = function () {};

  function lerToken() {
    try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch (e) { return ''; }
  }
  function gravarToken(t) {
    try {
      if (t) localStorage.setItem(CHAVE_TOKEN, t);
      else localStorage.removeItem(CHAVE_TOKEN);
    } catch (e) { /* sem storage: a sessão dura só esta aba */ }
    memoria = t || '';
  }
  var memoria = lerToken();

  function falha(status, mensagem) {
    var e = new Error(mensagem || 'Não foi possível falar com o servidor.');
    e.status = status;
    return e;
  }

  function pedir(metodo, caminho, corpo) {
    var opcoes = { method: metodo, headers: {} };
    if (memoria) opcoes.headers.authorization = 'Bearer ' + memoria;
    if (corpo !== undefined) {
      opcoes.headers['content-type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    return fetch('/api/' + caminho, opcoes).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (dados) {
        if (r.status === 401 && caminho !== 'login') {
          gravarToken('');
          aoExpirar();
        }
        if (!r.ok) throw falha(r.status, dados.erro);
        return dados;
      });
    }, function () {
      throw falha(0, 'Sem conexão com a internet.');
    });
  }

  return {
    ativo: ativo,
    logado: function () { return Boolean(memoria); },
    aoExpirar: function (fn) { aoExpirar = fn; },

    entrar: function (senha) {
      return pedir('POST', 'login', { senha: senha }).then(function (d) {
        gravarToken(d.token);
        return true;
      });
    },
    sair: function () { gravarToken(''); },

    carregarPrecos: function () {
      return pedir('GET', 'precos').then(function (d) { return d.precos; });
    },
    salvarPrecos: function (precos) { return pedir('PUT', 'precos', precos); },

    listarOrcamentos: function () {
      return pedir('GET', 'orcamentos').then(function (d) { return d.lista || []; });
    },
    abrirOrcamento: function (id) {
      return pedir('GET', 'orcamentos?id=' + encodeURIComponent(id)).then(function (d) { return d.orcamento; });
    },
    salvarOrcamento: function (dados) { return pedir('POST', 'orcamentos', dados); },
    excluirOrcamento: function (id) {
      return pedir('DELETE', 'orcamentos?id=' + encodeURIComponent(id));
    }
  };
})();
