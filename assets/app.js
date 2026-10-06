/* =============================================================================
   Brew — painel do gestor
   Etapas: 1 evento · 2 seleção · 3 revisão · 4 apresentação
   ========================================================================== */
(function () {
  'use strict';

  var CAT = window.BREW_CATALOGO;
  var IDX = window.BREW_INDICE;
  var BREW = window.BREW;
  var esc = BREW.esc;
  var CHAVE = 'brew.evento.v1';
  var CHAVE_PRECOS = 'brew.precos.v1';

  var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------- ESTADO */

  function estadoVazio() {
    var e = {
      evento: {
        cliente: '', ocasiao: '', data: '', convidados: '',
        local: '', numero: '', validade: '', abertura: '', fechamento: ''
      },
      mostrarValor: true,
      /* Taxa de serviço — soma no valor por pessoa antes do arredondamento.
         Começa em 10% (padrão do salão); o gestor troca pra "fixo" quando
         quer um valor certo em R$ por pessoa em vez de percentual. */
      taxaServico: { ativa: true, tipo: 'percentual', valor: 10 },
      /* equipe de serviço — valor da tabela a cada N convidados */
      equipe: { ativa: true },
      blocos: {}
    };
    CAT.categorias.forEach(function (cat) {
      cat.blocos.forEach(function (b) {
        e.blocos[b.id] = {
          ativo: false, opcional: false, itens: {}, variacoes: {},
          barris: {}, litros: null
        };
      });
    });
    return e;
  }

  var NUVEM = window.BREW_NUVEM;
  var estado = estadoVazio();
  var precos = BREW.adotarPrecos(null);
  var etapa = 1;
  var etapaAnterior = 1;
  var orcId = null;          /* id do orçamento aberto na nuvem (null = ainda não salvo) */

  /* Alguns navegadores bloqueiam localStorage em páginas abertas por file://.
     Se for o caso, o painel continua funcionando — só não guarda sozinho, e a
     barra avisa pra usar "Salvar arquivo". */
  var temStorage = (function () {
    try {
      localStorage.setItem('brew.teste', '1');
      localStorage.removeItem('brew.teste');
      return true;
    } catch (e) { return false; }
  })();

  function salvar() {
    if (NUVEM.ativo) { agendarOrcamento(); return; }
    if (!temStorage) return;
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { temStorage = false; }
  }

  /* A tabela de preços é do restaurante, não da proposta: vive em outra
     chave e sobrevive a "Nova proposta". */
  function salvarPrecos() {
    if (NUVEM.ativo) { agendarPrecos(); return; }
    if (!temStorage) return;
    try { localStorage.setItem(CHAVE_PRECOS, JSON.stringify(precos)); } catch (e) { temStorage = false; }
  }

  /* ------------------------------------------------------------- NUVEM
     Salvamento automático: cada mudança espera ~1s de sossego e vai para o
     servidor. Os envios de um mesmo tipo nunca correm em paralelo — assim o
     primeiro salvamento de um orçamento novo devolve o id antes do segundo
     sair, e não nascem duas cópias. */

  var sync = {
    orc: { timer: null, enviando: false, pendente: false, erro: '' },
    pre: { timer: null, enviando: false, pendente: false, erro: '' }
  };

  function temConteudo() {
    if ((estado.evento.cliente || '').trim()) return true;
    return Object.keys(estado.blocos).some(function (id) { return estado.blocos[id].ativo; });
  }

  function agendarOrcamento() {
    if (!temConteudo()) return;      /* não cria orçamento vazio na lista */
    sync.orc.pendente = true;
    clearTimeout(sync.orc.timer);
    sync.orc.timer = setTimeout(enviarOrcamento, 1100);
    mostrarSync();
  }

  function resumoParaLista() {
    var comp = BREW.compor(estado);
    var prec = BREW.precificar(estado, precos, comp);
    return {
      cliente: comp.evento.cliente,
      ocasiao: comp.evento.ocasiao,
      data: comp.evento.dataISO,
      convidados: comp.evento.convidados,
      numero: comp.evento.numero,
      media: prec.temPreco && prec.pacotes.length ? prec.pacotes[0].media : null
    };
  }

  /* muda sempre que outro orçamento é aberto (ou um novo começa): resposta
     atrasada de um salvamento antigo não pode mexer no orçamento atual */
  var geracao = 0;

  function enviarOrcamento() {
    var s = sync.orc;
    clearTimeout(s.timer);
    if (s.enviando) return s.voo;
    if (!s.pendente) return Promise.resolve();
    s.pendente = false;
    s.enviando = true;
    mostrarSync();
    var g = geracao;
    s.voo = NUVEM.salvarOrcamento({ id: orcId, estado: estado, precos: precos, resumo: resumoParaLista() })
      .then(function (r) { if (g === geracao) orcId = r.id; s.erro = ''; },
        function (e) {
          s.erro = e.message; s.pendente = true;
          if (e.status !== 401) s.timer = setTimeout(enviarOrcamento, 8000);
        })
      .then(function () {
        s.enviando = false;
        mostrarSync();
        if (s.pendente && !s.erro) return enviarOrcamento();
      });
    return s.voo;
  }

  function agendarPrecos() {
    sync.pre.pendente = true;
    clearTimeout(sync.pre.timer);
    sync.pre.timer = setTimeout(enviarPrecos, 900);
    mostrarSync();
  }

  function enviarPrecos() {
    var s = sync.pre;
    clearTimeout(s.timer);
    if (s.enviando) return s.voo;
    if (!s.pendente) return Promise.resolve();
    s.pendente = false;
    s.enviando = true;
    mostrarSync();
    return (s.voo = NUVEM.salvarPrecos(precos)
      .then(function () { s.erro = ''; },
        function (e) {
          s.erro = e.message; s.pendente = true;
          if (e.status !== 401) s.timer = setTimeout(enviarPrecos, 8000);
        })
      .then(function () {
        s.enviando = false;
        mostrarSync();
        if (s.pendente && !s.erro) return enviarPrecos();
      }));
  }

  /* Antes de trocar de orçamento: manda o que estiver esperando. */
  function descarregar() {
    if (!NUVEM.ativo) return Promise.resolve();
    return Promise.all([enviarOrcamento(), enviarPrecos()]);
  }

  function mostrarSync() {
    var el = $('#sync');
    if (!el) return;
    if (!NUVEM.ativo) { el.hidden = true; return; }
    el.hidden = false;
    var o = sync.orc, p = sync.pre;
    var erro = o.erro || p.erro;
    var ocupado = o.enviando || p.enviando || o.pendente || p.pendente;
    el.className = 'sync' + (erro ? ' erro' : ocupado ? ' ocupado' : '');
    el.textContent = erro ? 'Não salvo · ' + erro
      : ocupado ? 'Salvando…'
        : (orcId || !temConteudo() ? 'Salvo na nuvem' : 'Rascunho');
    el.title = erro ? 'Tenta de novo sozinho a cada poucos segundos.' : '';
  }

  /* avisa antes de fechar a aba com algo ainda não enviado */
  window.addEventListener('beforeunload', function (ev) {
    if (!NUVEM.ativo) return;
    if (sync.orc.pendente || sync.orc.enviando || sync.pre.pendente || sync.pre.enviando) {
      descarregar();
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  function carregar() {
    if (!temStorage || NUVEM.ativo) return;
    try {
      var cru = localStorage.getItem(CHAVE);
      if (cru) adotar(JSON.parse(cru));
    } catch (e) { /* ignora */ }
    try {
      var p = localStorage.getItem(CHAVE_PRECOS);
      if (p) precos = BREW.adotarPrecos(JSON.parse(p));
    } catch (e) { /* ignora */ }
  }

  /* Mescla um estado salvo sobre a estrutura atual do catálogo, para que um
     arquivo antigo continue abrindo depois de o cardápio mudar. */
  function adotar(bruto) {
    var novo = estadoVazio();
    if (bruto && bruto.evento) {
      Object.keys(novo.evento).forEach(function (k) {
        if (bruto.evento[k] != null) novo.evento[k] = bruto.evento[k];
      });
    }
    if (bruto && typeof bruto.mostrarValor === 'boolean') novo.mostrarValor = bruto.mostrarValor;
    if (bruto && bruto.taxaServico) {
      var t = bruto.taxaServico;
      novo.taxaServico = {
        ativa: !!t.ativa,
        tipo: t.tipo === 'fixo' ? 'fixo' : 'percentual',
        valor: Number(t.valor) || 0
      };
    }
    /* orçamento salvo antes da regra da equipe: fica sem ela, para não mudar
       o valor que já foi mandado ao cliente */
    if (bruto) novo.equipe = { ativa: !!(bruto.equipe && bruto.equipe.ativa) };
    /* arquivo local traz a tabela junto; na nuvem a tabela é uma só, da conta,
       e abrir um orçamento antigo não pode sobrescrevê-la */
    if (bruto && bruto.precos && !NUVEM.ativo) precos = BREW.adotarPrecos(bruto.precos);
    if (bruto && bruto.blocos) {
      Object.keys(novo.blocos).forEach(function (id) {
        var b = bruto.blocos[id];
        if (!b) return;
        novo.blocos[id].ativo = !!b.ativo;
        novo.blocos[id].opcional = !!b.opcional;
        novo.blocos[id].litros = b.litros != null ? b.litros : novo.blocos[id].litros;
        var bloco = IDX.blocos[id];
        (bloco.itens || []).forEach(function (it) {
          if (bloco.barris && b.barris && b.barris[it.id]) {
            var q = {};
            bloco.barris.forEach(function (br) {
              var n = Math.max(0, Math.floor(Number(b.barris[it.id][br.id]) || 0));
              if (n) q[br.id] = n;
            });
            if (Object.keys(q).length) novo.blocos[id].barris[it.id] = q;
          }
          if (b.itens && b.itens[it.id]) novo.blocos[id].itens[it.id] = true;
          if (b.variacoes && b.variacoes[it.id] && it.variacoes &&
            it.variacoes.opcoes.indexOf(b.variacoes[it.id]) >= 0) {
            novo.blocos[id].variacoes[it.id] = b.variacoes[it.id];
          }
        });
      });
    }
    estado = novo;
  }

  /* ------------------------------------------------------ ETAPA 1 · EVENTO */

  function montarFormulario() {
    var sel = $('#f-ocasiao');
    sel.innerHTML = '<option value="">Selecione…</option>' +
      CAT.ocasioes.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('');

    $$('[data-ev]').forEach(function (campo) {
      campo.addEventListener('input', function () {
        estado.evento[campo.dataset.ev] = campo.value;
        salvar();
        atualizarStatus();
      });
    });
  }

  function preencherFormulario() {
    $$('[data-ev]').forEach(function (campo) {
      campo.value = estado.evento[campo.dataset.ev] || '';
    });
  }

  /* ----------------------------------------------------- ETAPA 2 · SELEÇÃO */

  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function rotuloRegra(bloco, s) {
    var marcados = Object.keys(s.itens || {}).filter(function (k) { return s.itens[k]; }).length;
    if (bloco.regra === 'barris') {
      var l = litrosDoChopp(bloco, s);
      return {
        txt: l ? 'Chopp · ' + l + ' litros' : 'Escolha a marca e os barris',
        alerta: s.ativo && !l
      };
    }
    if (bloco.regra === 'completo') {
      var total = (bloco.itens || []).length;
      return {
        txt: s.ativo ? 'Bloco completo · ' + marcados + ' de ' + total + ' itens'
          : 'Bloco completo · ' + total + ' itens',
        alerta: s.ativo && marcados === 0
      };
    }
    var min = bloco.escolha.min, max = bloco.escolha.max;
    var pedido = maiuscula(BREW.textoEscolha(bloco));
    return {
      txt: s.ativo ? pedido + ' · ' + marcados + ' marcado' + (marcados === 1 ? '' : 's') : pedido,
      alerta: s.ativo && (marcados < min || marcados > max)
    };
  }

  function litrosDoChopp(bloco, s) {
    var total = 0;
    Object.keys(s.barris || {}).forEach(function (itemId) {
      bloco.barris.forEach(function (br) {
        total += (Number(s.barris[itemId][br.id]) || 0) * br.litros;
      });
    });
    return total || Number(s.litros) || 0;
  }

  function htmlItem(bloco, item, s) {
    var on = !!s.itens[item.id];
    var radio = bloco.regra === 'escolha' && bloco.escolha.max === 1;
    var html = '<button type="button" class="item-chk' + (radio ? ' radio' : '') + (on ? ' on' : '') +
      '" data-acao="item" data-bloco="' + bloco.id + '" data-item="' + item.id + '">' +
      '<span class="marca"></span><span>' +
      '<span class="nome">' + esc(item.nome) + '</span>' +
      (item.desc ? '<span class="desc">' + esc(item.desc) + '</span>' : '') +
      (item.inclui ? '<span class="inclui">' + esc(item.inclui.join(' · ')) + '</span>' : '') +
      '</span></button>';

    if (on && item.variacoes) {
      html += '<div class="variacao"><span class="rot">' + esc(item.variacoes.rotulo) + '</span>' +
        '<div class="pilulas">' + item.variacoes.opcoes.map(function (op) {
          return '<button type="button" class="pilula' + (s.variacoes[item.id] === op ? ' on' : '') +
            '" data-acao="variacao" data-bloco="' + bloco.id + '" data-item="' + item.id +
            '" data-valor="' + esc(op) + '">' + esc(op) + '</button>';
        }).join('') + '</div></div>';
    }
    return html;
  }

  function htmlCorpo(bloco, s) {
    if (bloco.regra === 'barris') {
      var conv = Number(estado.evento.convidados) || 0;
      var lt = litrosDoChopp(bloco, s);
      return '<p class="titulinho">Marca e quantidade de barris</p>' +
        '<div class="barris">' + (bloco.itens || []).map(function (it) {
          var q = (s.barris || {})[it.id] || {};
          return '<div class="barris-linha"><span class="nome">' + esc(it.nome) + '</span>' +
            bloco.barris.map(function (br) {
              return '<label class="litros"><input type="number" min="0" step="1" inputmode="numeric" value="' +
                (Number(q[br.id]) || '') + '" placeholder="0" data-acao="barris" data-bloco="' + bloco.id +
                '" data-item="' + it.id + '" data-barril="' + br.id + '">' +
                '<span class="un">× ' + br.litros + ' L</span></label>';
            }).join('') + '</div>';
        }).join('') + '</div>' +
        '<p class="dica barris-total">' + totalChoppTxt(lt, conv) + '</p>';
    }
    var titulo = bloco.regra === 'completo'
      ? 'Itens inclusos · desmarque o que não entra neste evento'
      : maiuscula(BREW.textoEscolha(bloco));
    return '<p class="titulinho">' + esc(titulo) + '</p><div class="itens">' +
      (bloco.itens || []).map(function (it) { return htmlItem(bloco, it, s); }).join('') +
      '</div>';
  }

  function totalChoppTxt(litros, conv) {
    if (!litros) return 'Nenhum barril ainda.';
    return 'Total: ' + litros + ' litros' +
      (conv ? ' · ' + (litros / conv).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L por convidado' : '');
  }

  function htmlBloco(bloco) {
    var s = estado.blocos[bloco.id];
    var r = rotuloRegra(bloco, s);
    return '<article class="bloco' + (s.ativo ? ' on' : '') + '" data-bloco="' + bloco.id + '">' +
      '<div class="bloco-topo">' +
      '<div class="capa"><img src="assets/img/' + esc(bloco.foto) + '" alt=""></div>' +
      '<div class="info">' +
      '<div class="num">' + esc(bloco.olho) + '</div>' +
      '<h3>' + esc(bloco.nome) + '</h3>' +
      '<p>' + esc(bloco.descricao) + '</p>' +
      '<span class="regra' + (r.alerta ? ' alerta' : '') + '">' + esc(r.txt) + '</span>' +
      (s.ativo ? '<br><button type="button" class="bt-opcional' + (s.opcional ? ' on' : '') +
        '" data-acao="opcional" data-bloco="' + bloco.id + '" ' +
        'title="Blocos opcionais saem do pacote base e formam um segundo pacote no orçamento">' +
        (s.opcional ? '★ Opcional · 2º pacote' : 'No pacote base') + '</button>' : '') +
      '</div>' +
      '<button type="button" class="chave" data-acao="bloco" data-bloco="' + bloco.id + '">' +
      '<span>' + (s.ativo ? 'Incluso' : 'Fora') + '</span><span class="pino"></span>' +
      '</button>' +
      '</div>' +
      '<div class="bloco-corpo">' + htmlCorpo(bloco, s) + '</div>' +
      '</article>';
  }

  function renderSelecao() {
    $('#lista-blocos').innerHTML = CAT.categorias.map(function (cat) {
      var t = cat.titulo || { pre: cat.nome, script: '' };
      return '<div class="cat-titulo"><h2>' + esc(t.pre) +
        (t.script ? ' <span class="script">' + esc(t.script) + '</span>' : '') + '</h2></div>' +
        '<div class="blocos">' + cat.blocos.map(htmlBloco).join('') + '</div>';
    }).join('');
  }

  function redesenharBloco(id) {
    var alvo = $('.bloco[data-bloco="' + id + '"]');
    if (alvo) alvo.outerHTML = htmlBloco(IDX.blocos[id]);
  }

  function ligarBloco(id) {
    var bloco = IDX.blocos[id], s = estado.blocos[id];
    s.ativo = !s.ativo;
    if (s.ativo && bloco.regra === 'completo') {
      (bloco.itens || []).forEach(function (it) { s.itens[it.id] = true; });
    }
  }

  function marcarItem(blocoId, itemId) {
    var bloco = IDX.blocos[blocoId], s = estado.blocos[blocoId], item = IDX.itens[itemId];
    if (bloco.regra === 'escolha' && bloco.escolha.max === 1) {
      var jaEra = !!s.itens[itemId];
      s.itens = {};
      s.variacoes = {};
      if (!jaEra) s.itens[itemId] = true;
    } else {
      if (s.itens[itemId]) { delete s.itens[itemId]; delete s.variacoes[itemId]; }
      else s.itens[itemId] = true;
    }
    if (s.itens[itemId] && item.variacoes && !s.variacoes[itemId]) {
      s.variacoes[itemId] = item.variacoes.opcoes[0];
    }
  }

  function ligarSelecao() {
    $('#lista-blocos').addEventListener('click', function (ev) {
      var bt = ev.target.closest('[data-acao]');
      if (!bt) return;
      var id = bt.dataset.bloco;
      var acao = bt.dataset.acao;

      if (acao === 'bloco') ligarBloco(id);
      else if (acao === 'opcional') estado.blocos[id].opcional = !estado.blocos[id].opcional;
      else if (acao === 'item') marcarItem(id, bt.dataset.item);
      else if (acao === 'variacao') estado.blocos[id].variacoes[bt.dataset.item] = bt.dataset.valor;
      else return;

      redesenharBloco(id);
      salvar();
      atualizarStatus();
    });

    $('#lista-blocos').addEventListener('input', function (ev) {
      var campo = ev.target.closest('[data-acao="barris"]');
      if (!campo) return;
      var bloco = IDX.blocos[campo.dataset.bloco], s = estado.blocos[bloco.id];
      var item = campo.dataset.item;
      var q = s.barris[item] = s.barris[item] || {};
      var n = Math.max(0, Math.floor(Number(campo.value) || 0));
      if (n) q[campo.dataset.barril] = n; else delete q[campo.dataset.barril];
      if (!Object.keys(q).length) delete s.barris[item];
      s.litros = null;      /* barris substituem os litros dos orçamentos antigos */
      /* sem redesenhar: o foco do campo tem que continuar onde está */
      var art = campo.closest('.bloco');
      var r = rotuloRegra(bloco, s);
      var regra = $('.regra', art);
      regra.textContent = r.txt;
      regra.classList.toggle('alerta', r.alerta);
      $('.barris-total', art).textContent =
        totalChoppTxt(litrosDoChopp(bloco, s), Number(estado.evento.convidados) || 0);
      salvar();
      atualizarStatus();
    });
  }

  /* --------------------------------------------------- TABELA DE PREÇOS */

  function htmlFaixa(chave, faixa, i, unidade, porUnidade, ultima, passoAte) {
    var aberta = faixa.ate == null;
    return '<div class="faixa" data-chave="' + esc(chave) + '" data-i="' + i + '">' +
      '<span class="lab">' + (aberta ? 'acima' : 'até') + '</span>' +
      '<input class="ate" type="number" min="0" step="' + (passoAte || 1) + '" ' +
      (aberta ? 'disabled value="" placeholder="∞"' : 'value="' + esc(faixa.ate) + '"') + '>' +
      '<span class="lab">' + unidade + '</span>' +
      '<span class="lab">R$</span>' +
      '<input class="valor" type="number" min="0" step="0.01" value="' +
      (Number(faixa.valor) || 0) + '">' +
      '<span class="lab">' + porUnidade + '</span>' +
      (ultima && aberta ? '' : '<button type="button" class="rm" title="Remover faixa">×</button>') +
      '</div>';
  }

  function htmlEntradaPreco(l) {
    var faixas = precos.tabela[l.chave] || [{ ate: null, valor: 0 }];
    var modo = (l.bloco.preco && l.bloco.preco.modo) || 'pessoa';
    var unidade = 'pessoas', porUnidade = modo === 'evento' ? '/evento' : '/pessoa', passo = 1;
    var rot, sub;
    if (l.nivel === 'comercial') {
      rot = l.rotulo;
      sub = 'o “até” é a soma dos itens escolhidos; R$ 0 no “acima” cobra a própria soma';
      unidade = 'na soma'; passo = 0.01;
    } else if (l.nivel === 'bloco') {
      rot = 'Preço do bloco';
      if (modo === 'barril') {
        sub = 'por litro — só quando o barril não tem preço próprio';
        unidade = 'litros'; porUnidade = '/litro';
      } else if (l.bloco.preco && l.bloco.preco.combinar === 'soma-faixa') {
        sub = 'preço único por pessoa, só quando algum item não tem preço';
      } else {
        sub = l.bloco.preco && l.bloco.preco.porItem ? 'usado quando a opção não tem preço' : '';
      }
    } else if (l.nivel === 'barril') {
      rot = l.rotulo;
      sub = 'barril';
      unidade = 'barris'; porUnidade = '/barril';
    } else {
      rot = l.rotulo;
      sub = l.nivel === 'item' ? 'opção' : 'variação';
    }
    var vazia = !faixas.some(function (f) { return Number(f.valor) > 0; });

    return '<div class="preco-entrada nivel-' + l.nivel + (vazia ? ' vazia' : '') + '">' +
      '<div class="rot">' + esc(rot) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' +
      '<div class="faixas">' +
      faixas.map(function (f, i) {
        return htmlFaixa(l.chave, f, i, unidade, porUnidade, i === faixas.length - 1, passo);
      }).join('') +
      '<button type="button" class="add-faixa" data-chave="' + esc(l.chave) + '">+ faixa</button>' +
      '</div></div>';
  }

  var MODOS = {
    pessoa: 'por pessoa', evento: 'valor do evento', barril: 'por barril'
  };
  var COMBINAR = {
    'soma-faixa': 'soma dos itens na faixa comercial',
    media: 'média das opções',
    maior: 'a opção mais cara define'
  };

  function renderPrecos() {
    var sel = $('#f-arredondamento');
    sel.innerHTML = BREW.ARREDONDAMENTOS.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.rot) + ' — ex.: ' + esc(a.ex) + '</option>';
    }).join('');
    sel.value = precos.arredondamento;
    $('#f-equipe-valor').value = Number(precos.equipe.valor) || 0;
    $('#f-equipe-cada').value = Number(precos.equipe.aCada) || 20;

    var html = '', atual = null;
    BREW.chavesDePreco().forEach(function (l) {
      if (l.bloco !== atual) {
        if (atual) html += '</div>';
        atual = l.bloco;
        html += '<div class="preco-bloco">' +
          '<div class="preco-cab">' +
          '<span class="num">Bloco ' + esc(atual.numero) + '</span>' +
          '<h3>' + esc(atual.nome) + '</h3>' +
          '<span class="modo">' + MODOS[atual.preco.modo || 'pessoa'] +
          (atual.preco.combinar ? ' · ' + COMBINAR[atual.preco.combinar] : '') + '</span>' +
          '</div>';
      }
      html += htmlEntradaPreco(l);
    });
    if (atual) html += '</div>';
    $('#lista-precos').innerHTML = html;
  }

  /* garante sempre uma faixa final "acima de" */
  function normalizarFaixas(chave) {
    var f = precos.tabela[chave] || [];
    f = f.filter(function (x) { return x.ate == null || Number(x.ate) > 0; });
    var abertas = f.filter(function (x) { return x.ate == null; });
    var fechadas = f.filter(function (x) { return x.ate != null; })
      .sort(function (a, b) { return a.ate - b.ate; });
    var aberta = abertas[0] || { ate: null, valor: fechadas.length ? fechadas[fechadas.length - 1].valor : 0 };
    precos.tabela[chave] = fechadas.concat([{ ate: null, valor: Number(aberta.valor) || 0 }]);
  }

  function ligarPrecos() {
    $('#f-arredondamento').addEventListener('change', function () {
      precos.arredondamento = this.value;
      salvarPrecos();
      atualizarStatus();
    });
    $('#f-equipe-valor').addEventListener('input', function () {
      precos.equipe.valor = Number(this.value) || 0;
      salvarPrecos();
      atualizarStatus();
    });
    $('#f-equipe-cada').addEventListener('input', function () {
      precos.equipe.aCada = Math.max(1, Math.round(Number(this.value) || 0)) || 20;
      salvarPrecos();
      atualizarStatus();
    });

    $('#lista-precos').addEventListener('input', function (ev) {
      var campo = ev.target;
      var linha = campo.closest('.faixa');
      if (!linha) return;
      var faixa = precos.tabela[linha.dataset.chave][Number(linha.dataset.i)];
      if (campo.classList.contains('valor')) faixa.valor = Number(campo.value) || 0;
      else if (campo.classList.contains('ate')) faixa.ate = campo.value === '' ? null : Number(campo.value);
      salvarPrecos();
      atualizarStatus();
    });

    /* a reordenação das faixas só acontece ao sair do campo, senão o cursor
       pularia de linha no meio da digitação */
    $('#lista-precos').addEventListener('change', function (ev) {
      var linha = ev.target.closest('.faixa');
      if (!linha || !ev.target.classList.contains('ate')) return;
      normalizarFaixas(linha.dataset.chave);
      salvarPrecos();
      renderPrecos();
    });

    $('#lista-precos').addEventListener('click', function (ev) {
      var add = ev.target.closest('.add-faixa');
      if (add) {
        var chave = add.dataset.chave;
        var f = precos.tabela[chave];
        var maior = f.reduce(function (m, x) { return x.ate != null && x.ate > m ? x.ate : m; }, 0);
        f.push({ ate: maior + (chave.indexOf('#faixas') > 0 ? 10 : 20), valor: f[f.length - 1].valor });
        normalizarFaixas(chave);
        salvarPrecos();
        renderPrecos();
        return;
      }
      var rm = ev.target.closest('.rm');
      if (!rm) return;
      var linha = rm.closest('.faixa');
      precos.tabela[linha.dataset.chave].splice(Number(linha.dataset.i), 1);
      normalizarFaixas(linha.dataset.chave);
      salvarPrecos();
      renderPrecos();
    });

    $('#bt-precos-salvar').addEventListener('click', function () {
      baixar(JSON.stringify(precos, null, 2), 'Brew_Tabela_de_Precos.json');
    });
    $('#bt-precos-abrir').addEventListener('click', function () { $('#arquivo-precos').click(); });
    $('#arquivo-precos').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          precos = BREW.adotarPrecos(JSON.parse(fr.result));
          salvarPrecos();
          renderPrecos();
          atualizarStatus();
        } catch (e) { alert('Não consegui ler esse arquivo — ele não parece uma tabela de preços do Brew.'); }
      };
      fr.readAsText(f);
    });
    $('#bt-precos-zerar').addEventListener('click', function () {
      if (!confirm('Zerar todos os preços da tabela? Isso não afeta a proposta aberta.')) return;
      precos = BREW.tabelaVazia();
      salvarPrecos();
      renderPrecos();
      atualizarStatus();
    });
  }

  /* ----------------------------------------------------- ETAPA 3 · REVISÃO */

  function linhaDado(rot, val) {
    return '<div class="d"><div class="rot">' + esc(rot) + '</div><div class="val' +
      (val ? '' : ' vazio') + '">' + esc(val || '—') + '</div></div>';
  }

  function renderRevisao() {
    var comp = BREW.compor(estado);
    var ev = comp.evento;

    var dados = '<div class="ficha-rev">' +
      '<div class="titulinho">Dados do evento<button type="button" class="bt-edit" data-ir="1">Editar</button></div>' +
      '<div class="dados-rev">' +
      linhaDado('Cliente', ev.cliente) +
      linhaDado('Ocasião', ev.ocasiao) +
      linhaDado('Data', ev.data ? ev.data.curta : '') +
      linhaDado('Convidados', ev.convidados) +
      (ev.local ? linhaDado('Local', ev.local) : '') +
      (ev.numero ? linhaDado('Nº da proposta', ev.numero) : '') +
      '</div></div>';

    var composicao = '<div class="ficha-rev">' +
      '<div class="titulinho">Composição do evento<button type="button" class="bt-edit" data-ir="2">Editar</button></div>' +
      (comp.categorias.length
        ? comp.categorias.map(function (g) {
          return '<div class="titulinho" style="margin:16px 0 4px">' + esc(g.cat.nome) + '</div>' +
            g.blocos.map(function (linha) {
              return '<div class="linha-rev">' +
                '<span class="num">' + esc(linha.bloco.numero) + '</span>' +
                '<div class="corpo"><h4>' + esc(linha.bloco.nome) + '</h4>' +
                '<p>' + esc(BREW.resumoBloco(linha)) + '</p></div></div>';
            }).join('');
        }).join('')
        : '<p class="vazio-aviso">Nenhum bloco selecionado ainda — volte para a etapa de seleção.</p>') +
      '</div>';

    var taxaCard = htmlEquipe() + htmlTaxaServico();
    var conta = htmlConta(comp);

    /* pendências de preço (sem preço / sob consulta) entram junto com as da
       composição */
    if (comp.totalBlocos) {
      var conv = Number(comp.evento.convidados) > 0;
      if (conv) {
        BREW.precificar(estado, precos, comp).pendencias.forEach(function (t) {
          comp.avisos.push({ tipo: 'erro', texto: t });
        });
      }
    }
    var erros = comp.avisos.filter(function (a) { return a.tipo === 'erro'; });
    var avisos = comp.avisos.filter(function (a) { return a.tipo === 'aviso'; });
    var caixa;
    if (!comp.avisos.length) {
      caixa = '<div class="alertas ok"><div class="titulinho">Tudo certo</div><ul>' +
        '<li>Dados do evento preenchidos.</li><li>Composição dentro das regras do cardápio.</li>' +
        '</ul></div>';
    } else {
      caixa = (erros.length
        ? '<div class="alertas"><div class="titulinho">Resolver antes de enviar</div><ul>' +
        erros.map(function (a) { return '<li>' + esc(a.texto) + '</li>'; }).join('') + '</ul></div>'
        : '') +
        (avisos.length
          ? '<div class="alertas ok" style="margin-top:14px"><div class="titulinho">Confirme</div><ul>' +
          avisos.map(function (a) { return '<li>' + esc(a.texto) + '</li>'; }).join('') + '</ul></div>'
          : '');
    }

    $('#revisao').innerHTML =
      '<div>' + dados + composicao + taxaCard + conta + '</div>' +
      '<div>' + caixa + '</div>';

    var chk = $('#f-mostrar-valor');
    if (chk) {
      chk.addEventListener('change', function () {
        estado.mostrarValor = this.checked;
        salvar();
      });
    }
    ligarTaxaServico();
    var chkEquipe = $('#f-equipe-ativa');
    if (chkEquipe) {
      chkEquipe.addEventListener('change', function () {
        estado.equipe.ativa = this.checked;
        salvar();
        renderRevisao();
      });
    }
  }

  /* --- equipe de serviço, na revisão --- */
  function htmlEquipe() {
    var eq = precos.equipe || {};
    var conv = Number(estado.evento.convidados) || 0;
    var aCada = Math.max(1, Number(eq.aCada) || 20);
    var regra = BREW.dinheiro(eq.valor) + ' a cada ' + aCada + ' convidados';
    var conta = conv && eq.valor > 0
      ? ' — ' + Math.ceil(conv / aCada) + ' × ' + BREW.dinheiro(eq.valor) + ' = ' +
        BREW.dinheiro(Math.ceil(conv / aCada) * eq.valor)
      : '';
    return '<div class="ficha-rev">' +
      '<div class="titulinho">Equipe de serviço</div>' +
      '<label class="opcao-valor">' +
      '<input type="checkbox" id="f-equipe-ativa"' + (estado.equipe.ativa ? ' checked' : '') + '>' +
      ' Cobrar a equipe (' + esc(regra) + ')</label>' +
      (estado.equipe.ativa && conv ? '<span class="dica" style="display:block;margin-top:10px">' +
        esc(conta.replace(/^ — /, '')) + ' · entra no valor por pessoa, sem aparecer como linha separada.</span>' : '') +
      (eq.valor > 0 ? '' : '<span class="dica" style="display:block;margin-top:10px">Sem valor na tabela de preços.</span>') +
      '</div>';
  }

  /* --- taxa de serviço, na revisão --- */
  function htmlTaxaServico() {
    var t = estado.taxaServico;
    return '<div class="ficha-rev">' +
      '<div class="titulinho">Taxa de serviço</div>' +
      '<label class="opcao-valor">' +
      '<input type="checkbox" id="f-taxa-ativa"' + (t.ativa ? ' checked' : '') + '>' +
      ' Somar taxa de serviço ao valor por pessoa</label>' +
      (t.ativa ? (
        '<div class="taxa-campos">' +
        '<div class="campo"><label for="f-taxa-tipo">Tipo</label>' +
        '<select id="f-taxa-tipo">' +
        '<option value="percentual"' + (t.tipo === 'percentual' ? ' selected' : '') + '>Percentual sobre o subtotal</option>' +
        '<option value="fixo"' + (t.tipo === 'fixo' ? ' selected' : '') + '>Valor fixo por pessoa</option>' +
        '</select></div>' +
        '<div class="campo"><label for="f-taxa-valor">' +
        (t.tipo === 'fixo' ? 'R$ por pessoa' : '% sobre o subtotal') + '</label>' +
        '<input id="f-taxa-valor" type="number" min="0" step="0.5" value="' + (Number(t.valor) || 0) + '"></div>' +
        '</div>' +
        '<span class="dica" style="display:block;margin-top:10px">Entra no valor por pessoa antes do arredondamento — ' +
        'na apresentação some dentro do valor, sem aparecer como nota.</span>'
      ) : '') +
      '</div>';
  }

  function ligarTaxaServico() {
    var chkAtiva = $('#f-taxa-ativa');
    if (!chkAtiva) return;
    chkAtiva.addEventListener('change', function () {
      estado.taxaServico.ativa = this.checked;
      salvar();
      renderRevisao();
    });
    var selTipo = $('#f-taxa-tipo');
    if (selTipo) {
      selTipo.addEventListener('change', function () {
        estado.taxaServico.tipo = this.value === 'fixo' ? 'fixo' : 'percentual';
        salvar();
        renderRevisao();
      });
    }
    var inValor = $('#f-taxa-valor');
    if (inValor) {
      inValor.addEventListener('input', function () {
        estado.taxaServico.valor = Number(this.value) || 0;
        salvar();
        atualizarStatus();
      });
      /* só re-renderiza tudo ao sair do campo — no meio da digitação isso
         redesenharia o input e derrubaria o cursor/foco */
      inValor.addEventListener('change', function () { renderRevisao(); });
    }
  }

  /* --- quadro do valor, na revisão --- */
  function htmlConta(comp) {
    var prec = BREW.precificar(estado, precos, comp);
    var d = BREW.dinheiro;

    if (!prec.linhas.length) return '';

    var linhas = prec.linhas.map(function (l) {
      var detalhe;
      if (l.tipo === 'pessoa') {
        detalhe = d(l.unit) + ' por pessoa' + (prec.convidados ? ' × ' + prec.convidados : '') +
          (l.detalhe ? ' · ' + l.detalhe : '');
      } else if (l.litros) {
        detalhe = l.detalhe + (prec.convidados
          ? ' · ' + (l.litros / prec.convidados).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L por pessoa'
          : '');
      } else {
        detalhe = l.detalhe || 'valor fechado do evento';
      }
      return '<div class="l' + (l.semPreco ? ' sem' : '') + (l.opcional ? ' opc' : '') + '">' +
        '<span class="nome">' + esc(l.bloco.nome) +
        '<small>' + esc(l.consulta ? 'sob consulta nesta faixa' : l.semPreco ? 'sem preço na tabela' : detalhe) + '</small></span>' +
        '<span class="v">' + (l.semPreco ? '—' : d(l.subtotal)) + '</span></div>';
    }).join('');

    var fecha = prec.pacotes.map(function (p) {
      var arred = p.mediaCrua && Math.abs(p.media - p.mediaCrua) > 0.004
        ? '<div class="sub">antes do arredondamento: ' + d(p.mediaCrua) + '</div>' : '';
      var taxaLinha = p.taxa
        ? '<div class="l taxa"><span class="nome">Taxa de serviço' +
        '<small>' + esc(p.taxa.tipo === 'fixo' ? 'valor fixo por pessoa' : p.taxa.valor + '% sobre o subtotal') +
        '</small></span><span class="v">' + d(p.taxa.calculado) + '</span></div>'
        : '';
      return taxaLinha + '<div class="fecha">' +
        '<div><div class="rot">' + esc(p.nome) + '</div>' +
        '<div class="big">' + d(p.media) + ' <span style="font-size:12px">/pessoa</span></div></div>' +
        '<div style="text-align:right"><div class="rot">Total · ' + prec.convidados + ' pessoas</div>' +
        '<div class="big">' + d(p.total) + '</div></div></div>' + arred;
    }).join('');

    return '<div class="ficha-rev">' +
      '<div class="titulinho">Valor do orçamento' +
      '<button type="button" class="bt-edit" data-ir="5">Tabela de preços</button></div>' +
      '<div class="conta">' + linhas + fecha + '</div>' +
      '<label class="opcao-valor">' +
      '<input type="checkbox" id="f-mostrar-valor"' + (estado.mostrarValor ? ' checked' : '') + '>' +
      ' Incluir a página de valores na apresentação</label>' +
      '</div>';
  }

  /* ------------------------------------------------ ETAPA 4 · APRESENTAÇÃO */

  function renderProposta() {
    /* a paginação mede as folhas: monta no tamanho real e só depois encolhe */
    $('#palco-interno').style.zoom = '';
    BREW.montarProposta(estado, $('#palco-interno'), precos);
    ajustarPalco();
  }

  /* --------------------------------------------------------- NAVEGAÇÃO */

  /* 1–4 são as etapas do orçamento; 5 é a tabela de preços (configuração);
     6 é a lista de orçamentos salvos (só no painel publicado). */
  var PANES = ['pane-evento', 'pane-selecao', 'pane-revisao', 'pane-proposta', 'pane-precos', 'pane-orcamentos'];

  function irPara(n) {
    if (etapa !== 5) etapaAnterior = etapa;
    etapa = n;
    PANES.forEach(function (id, i) { $('#' + id).classList.toggle('ativa', i + 1 === n); });
    $$('.passo-btn').forEach(function (b, i) {
      if (i + 1 === n) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    $('#bt-precos').classList.toggle('on', n === 5);
    $('#bt-orcamentos').classList.toggle('on', n === 6);

    if (n === 1) preencherFormulario();
    if (n === 2) renderSelecao();
    if (n === 3) renderRevisao();
    if (n === 4) renderProposta();
    if (n === 5) { renderPrecos(); atualizarPrecosDaNuvem(); }
    if (n === 6) renderOrcamentos();

    $('#bt-voltar').hidden = n >= 5;
    $('#bt-voltar').disabled = n === 1;
    $('#bt-avancar').hidden = n === 6;
    $('#bt-avancar').textContent = n === 5
      ? (etapaAnterior === 6 ? 'Voltar aos orçamentos' : 'Voltar ao orçamento')
      : n === 4 ? 'Gerar PDF' : 'Avançar';
    document.body.dataset.tela = String(n);
    window.scrollTo(0, 0);
    atualizarStatus();
  }

  /* outro aparelho pode ter mexido na tabela: ao abrir a aba de preços,
     busca a versão atual — se não houver mudança local esperando envio */
  function atualizarPrecosDaNuvem() {
    if (!NUVEM.ativo || sync.pre.pendente || sync.pre.enviando) return;
    NUVEM.carregarPrecos().then(function (p) {
      if (!p || sync.pre.pendente || etapa !== 5) return;
      var nova = BREW.adotarPrecos(p);
      if (JSON.stringify(nova) === JSON.stringify(precos)) return;
      if (document.activeElement && document.activeElement.closest('#lista-precos')) return;
      precos = nova;
      renderPrecos();
      atualizarStatus();
    }, function () { /* sem rede: fica com a que tem */ });
  }

  /* ------------------------------------------------------ ORÇAMENTOS SALVOS */

  var listaCache = [];

  function semAcento(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function renderOrcamentos() {
    var alvo = $('#lista-orcamentos');
    if (!listaCache.length) alvo.innerHTML = '<p class="vazio-aviso">Carregando…</p>';
    /* garante que o orçamento aberto já foi enviado antes de listar */
    descarregar().then(function () { return NUVEM.listarOrcamentos(); }).then(function (lista) {
      listaCache = lista;
      desenharLista();
    }, function (e) {
      alvo.innerHTML = '<p class="vazio-aviso">' + esc(e.message) + '</p>';
    });
  }

  function quando(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  function desenharLista() {
    var termo = semAcento($('#f-busca').value.trim());
    var lista = listaCache.filter(function (o) {
      return !termo || semAcento([o.cliente, o.ocasiao, o.numero].join(' ')).indexOf(termo) >= 0;
    });
    var alvo = $('#lista-orcamentos');
    if (!listaCache.length) {
      alvo.innerHTML = '<p class="vazio-aviso">Nenhum orçamento salvo ainda — comece um novo aqui em cima.</p>';
      return;
    }
    if (!lista.length) {
      alvo.innerHTML = '<p class="vazio-aviso">Nada encontrado para essa busca.</p>';
      return;
    }
    alvo.innerHTML = lista.map(function (o) {
      var data = BREW.fmtData(o.data);
      var meta = [o.ocasiao, data ? data.curta : '', o.convidados ? o.convidados + ' convidados' : '']
        .filter(Boolean).join(' · ');
      return '<article class="orc-item' + (o.id === orcId ? ' atual' : '') + '">' +
        '<button type="button" class="orc-abrir" data-orc="' + esc(o.id) + '">' +
        '<span class="orc-cliente">' + esc(o.cliente || 'Sem nome') +
        (o.numero ? ' <small>' + esc(o.numero) + '</small>' : '') + '</span>' +
        '<span class="orc-meta">' + esc(meta || 'Sem dados do evento') + '</span>' +
        '<span class="orc-editado">editado ' + esc(quando(o.atualizado)) + '</span>' +
        '</button>' +
        '<span class="orc-valor">' + (o.media ? esc(BREW.dinheiro(o.media)) + '<small>/pessoa</small>' : '<small>sem valor</small>') + '</span>' +
        '<button type="button" class="orc-excluir" data-excluir="' + esc(o.id) + '" title="Excluir" aria-label="Excluir">×</button>' +
        '</article>';
    }).join('');
  }

  /* troca o orçamento em edição (abrir outro, começar um novo, importar) */
  function trocarPara(novoEstado, novoId) {
    geracao++;
    clearTimeout(sync.orc.timer);
    sync.orc.pendente = false;
    sync.orc.erro = '';
    estado = novoEstado;
    orcId = novoId || null;
    mostrarSync();
  }

  function abrirOrcamento(id) {
    $('#lista-orcamentos').classList.add('ocupada');
    descarregar().then(function () { return NUVEM.abrirOrcamento(id); }).then(function (orc) {
      adotar(orc.estado);
      trocarPara(estado, orc.id);
      irPara(3);
    }, function (e) {
      alert(e.message);
    }).then(function () { $('#lista-orcamentos').classList.remove('ocupada'); });
  }

  function novoOrcamento() {
    descarregar().then(function () {
      trocarPara(estadoVazio(), null);
      irPara(1);
    });
  }

  function excluirOrcamento(id) {
    var o = listaCache.filter(function (x) { return x.id === id; })[0] || {};
    if (!confirm('Excluir o orçamento de "' + (o.cliente || 'sem nome') + '"? Não dá para desfazer.')) return;
    descarregar().then(function () { return NUVEM.excluirOrcamento(id); }).then(function () {
      if (id === orcId) trocarPara(estadoVazio(), null);
      listaCache = listaCache.filter(function (x) { return x.id !== id; });
      desenharLista();
    }, function (e) { alert(e.message); });
  }

  function ligarOrcamentos() {
    $('#bt-orcamentos').addEventListener('click', function () { irPara(6); });
    $('#bt-orc-novo').addEventListener('click', novoOrcamento);
    $('#f-busca').addEventListener('input', desenharLista);
    $('#bt-orc-importar').addEventListener('click', function () { $('#arquivo').click(); });
    $('#lista-orcamentos').addEventListener('click', function (ev) {
      var abrir = ev.target.closest('[data-orc]');
      if (abrir) return abrirOrcamento(abrir.dataset.orc);
      var excluir = ev.target.closest('[data-excluir]');
      if (excluir) excluirOrcamento(excluir.dataset.excluir);
    });
    $('#bt-sair').addEventListener('click', function () {
      descarregar().then(function () {
        NUVEM.sair();
        trocarPara(estadoVazio(), null);
        precos = BREW.adotarPrecos(null);
        listaCache = [];
        mostrarEntrada('login');
      });
    });
  }

  /* ------------------------------------------------------------- LOGIN */

  function mostrarEntrada(modo) {
    $('#tela-entrada').hidden = !modo;
    $('#form-login').hidden = modo !== 'login';
    $('#entrada-carregando').hidden = modo !== 'carregando';
    if (modo === 'login') setTimeout(function () { $('#f-senha').focus(); }, 60);
  }

  function erroLogin(msg) {
    var el = $('#login-erro');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function carregarConta() {
    mostrarEntrada('carregando');
    NUVEM.carregarPrecos().then(function (p) {
      precos = BREW.adotarPrecos(p);
      trocarPara(estadoVazio(), null);
      mostrarEntrada(null);
      irPara(6);
    }, function (e) {
      if (e.status === 401) return;      /* aoExpirar já mostrou o login */
      mostrarEntrada('login');
      erroLogin('Não consegui abrir a conta: ' + e.message);
    });
  }

  function ligarEntrada() {
    NUVEM.aoExpirar(function () {
      erroLogin('Sua sessão expirou. Entre de novo.');
      mostrarEntrada('login');
    });
    $('#form-login').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var bt = $('#bt-entrar');
      bt.disabled = true;
      erroLogin('');
      NUVEM.entrar($('#f-senha').value).then(function () {
        $('#f-senha').value = '';
        carregarConta();
      }, function (e) {
        erroLogin(e.message);
      }).then(function () { bt.disabled = false; });
    });
  }

  /* ------------------------------------------------------------- PDF */

  var pdfPronto = null;

  function nomePdf() { return nomeArquivo('pdf'); }

  function gerarPdf() {
    var folhas = $$('#palco-interno .folha');
    if (!folhas.length) return;
    $('#tela-pdf').hidden = false;
    $('#pdf-acoes').hidden = true;
    $('#pdf-titulo').textContent = 'Gerando o PDF…';
    $('#pdf-progresso').textContent = 'Preparando as páginas…';
    pdfPronto = null;
    BREW_PDF.gerar(folhas, function (n, total) {
      $('#pdf-progresso').textContent = 'Página ' + n + ' de ' + total;
    }).then(function (blob) {
      pdfPronto = blob;
      $('#pdf-titulo').textContent = 'PDF pronto';
      $('#pdf-progresso').textContent = folhas.length + ' páginas · ' +
        (blob.size / 1048576).toFixed(1).replace('.', ',') + ' MB';
      $('#bt-pdf-compartilhar').hidden = !BREW_PDF.podeCompartilhar(blob, nomePdf());
      $('#pdf-acoes').hidden = false;
    }, function (e) {
      $('#pdf-titulo').textContent = 'Não deu certo';
      $('#pdf-progresso').textContent = e.message || 'Erro ao gerar o PDF.';
      $('#bt-pdf-compartilhar').hidden = true;
      $('#bt-pdf-baixar').hidden = true;
      $('#pdf-acoes').hidden = false;
    });
  }

  function ligarPdf() {
    $('#bt-pdf-baixar').addEventListener('click', function () {
      if (pdfPronto) BREW_PDF.baixar(pdfPronto, nomePdf());
    });
    $('#bt-pdf-compartilhar').addEventListener('click', function () {
      if (!pdfPronto) return;
      BREW_PDF.compartilhar(pdfPronto, nomePdf(), 'Proposta Brew — ' + (estado.evento.cliente || 'evento'))
        .catch(function (e) { if (e && e.name !== 'AbortError') BREW_PDF.baixar(pdfPronto, nomePdf()); });
    });
    $('#bt-pdf-fechar').addEventListener('click', function () {
      $('#tela-pdf').hidden = true;
      $('#bt-pdf-baixar').hidden = false;
    });
    $('#bt-imprimir').addEventListener('click', function () { window.print(); });
  }

  /* No celular as folhas A4 (210mm) não cabem na tela: encolhe o palco
     para caber na largura, sem mexer no tamanho real (o PDF usa o real). */
  function ajustarPalco() {
    var palco = $('.palco');
    var interno = $('#palco-interno');
    if (!palco || !interno) return;
    var disponivel = palco.clientWidth - 8;
    var folha = 210 * 96 / 25.4;
    interno.style.zoom = disponivel < folha ? String(Math.max(0.3, disponivel / folha)) : '';
  }
  window.addEventListener('resize', function () { if (etapa === 4) ajustarPalco(); });

  function atualizarStatus() {
    var comp = BREW.compor(estado);
    var partes = [];
    partes.push('<b>' + (comp.evento.cliente || 'Sem cliente') + '</b>');
    if (comp.evento.data) partes.push(comp.evento.data.curta);
    if (comp.evento.convidados) partes.push(comp.evento.convidados + ' convidados');
    partes.push(comp.totalBlocos + ' bloco' + (comp.totalBlocos === 1 ? '' : 's'));
    var prec = BREW.precificar(estado, precos, comp);
    if (prec.temPreco && prec.pacotes.length) {
      partes.push('<b>' + BREW.dinheiro(prec.pacotes[0].media) + '/pessoa</b>');
    } else if (comp.totalBlocos) {
      partes.push('<b style="color:var(--brasa)">sem preço</b>');
    }
    var erros = comp.avisos.filter(function (a) { return a.tipo === 'erro'; }).length;
    if (erros) partes.push('<b style="color:var(--brasa)">' + erros + ' pendência' + (erros === 1 ? '' : 's') + '</b>');
    if (!temStorage && !NUVEM.ativo) partes.push('<b style="color:var(--brasa)">sem salvamento automático — use “Salvar arquivo”</b>');
    $('#status').innerHTML = partes.join(' · ');
    mostrarSync();
  }

  /* -------------------------------------------------------- ARQUIVO / AÇÕES */

  function nomeArquivo(ext) {
    var ev = estado.evento;
    var limpo = function (s) {
      return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    };
    return ['Brew_Proposta', limpo(ev.cliente) || 'Evento', limpo(ev.data)]
      .filter(Boolean).join('_') + '.' + ext;
  }

  function baixar(texto, nome) {
    var blob = new Blob([texto], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* A proposta leva junto uma cópia da tabela de preços usada, para que
     reabrir um orçamento antigo mostre os mesmos números. */
  function baixarJSON() {
    var pacote = JSON.parse(JSON.stringify(estado));
    pacote.precos = precos;
    baixar(JSON.stringify(pacote, null, 2), nomeArquivo('json'));
  }

  /* No painel publicado, importar um arquivo cria um orçamento NOVO na conta
     (é assim que as propostas antigas, salvas em arquivo, entram na nuvem). */
  function abrirJSON(arquivo) {
    var fr = new FileReader();
    fr.onload = function () {
      var dados;
      try { dados = JSON.parse(fr.result); } catch (e) { dados = null; }
      if (!dados || typeof dados !== 'object' || !dados.blocos) {
        alert('Não consegui ler esse arquivo — ele não parece uma proposta do Brew.');
        return;
      }
      var aplicar = function () {
        if (NUVEM.ativo) trocarPara(estadoVazio(), null);
        adotar(dados);
        salvar();
        irPara(1);
      };
      if (NUVEM.ativo) descarregar().then(aplicar); else aplicar();
    };
    fr.readAsText(arquivo);
  }

  function ligarAcoes() {
    $$('.passo-btn').forEach(function (b, i) {
      b.addEventListener('click', function () { irPara(i + 1); });
    });
    $('#bt-voltar').addEventListener('click', function () { if (etapa > 1) irPara(etapa - 1); });
    $('#bt-precos').addEventListener('click', function () {
      irPara(etapa === 5 ? etapaAnterior : 5);
    });
    $('#bt-avancar').addEventListener('click', function () {
      if (etapa === 5) irPara(etapaAnterior);
      else if (etapa < 4) irPara(etapa + 1);
      else if (etapa === 4) gerarPdf();
    });
    $('#bt-salvar').addEventListener('click', baixarJSON);
    $('#bt-abrir').addEventListener('click', function () { $('#arquivo').click(); });
    $('#arquivo').addEventListener('change', function () {
      if (this.files && this.files[0]) abrirJSON(this.files[0]);
      this.value = '';
    });
    $('#bt-novo').addEventListener('click', function () {
      if (!confirm('Começar uma proposta nova? As escolhas atuais serão apagadas.')) return;
      estado = estadoVazio();
      salvar();
      irPara(1);
    });
    document.addEventListener('click', function (ev) {
      var bt = ev.target.closest('[data-ir]');
      if (bt) irPara(Number(bt.dataset.ir));
    });
  }

  /* ------------------------------------------------------------------ INÍCIO */

  carregar();
  montarFormulario();
  ligarSelecao();
  ligarPrecos();
  ligarAcoes();
  ligarPdf();

  if (NUVEM.ativo) {
    /* publicado: login de administrador e tudo salvo na conta */
    document.body.classList.add('modo-nuvem');
    ligarEntrada();
    ligarOrcamentos();
    irPara(1);
    if (NUVEM.logado()) carregarConta();
    else mostrarEntrada('login');
  } else {
    /* aberto como arquivo: funciona só neste navegador, como antes */
    irPara(1);
  }

})();
