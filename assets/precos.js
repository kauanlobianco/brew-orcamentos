/* =============================================================================
   Brew — tabela de preços e motor de cálculo

   A tabela de preços é do RESTAURANTE, não da proposta: vale para todos os
   orçamentos e vive separada (aba "Preços" do painel). Quando uma proposta é
   salva em arquivo, ela leva junto uma cópia da tabela usada, para que reabrir
   um orçamento antigo mostre os mesmos números.

   ---------------------------------------------------------------- estrutura
   Cada entrada é uma lista de FAIXAS por volume:

       [ { ate: 20,   valor: 40 },      -> até 20 pessoas: R$ 40 por pessoa
         { ate: 40,   valor: 35 },      -> de 21 a 40:     R$ 35 por pessoa
         { ate: null, valor: 30 } ]     -> acima de 40:    R$ 30 por pessoa

   O volume é a quantidade de convidados nos blocos por pessoa, e a quantidade
   de litros no chopp.

   ------------------------------------------------------------------- chaves
   'petiscos'                              preço do bloco
   'buf-parrilla'                          preço de uma opção (sobrepõe o bloco)
   'buf-steakhouse::Fraldinha'             preço de uma variação (sobrepõe a opção)

   A resolução vai da chave mais específica para a mais geral e para na
   primeira que tiver algum valor preenchido. Em blocos de escolha com mais de
   uma opção marcada (Brew Classics), a opção mais cara define o preço.
   ========================================================================== */
window.BREW = window.BREW || {};

/* Textos padrão da página de valor. Os preços em si começam zerados de
   propósito: quem preenche é o gestor, na aba "Preços". */
window.BREW_PRECOS_PADRAO = {
  inclusosExtras: ['Equipe de serviço durante todo o evento'],
  nota: 'Valor fechado — sem cobranças extras além do combinado. Consumos fora do cardápio são acertados à parte, ao fim do evento.'
};

(function (BREW) {
  'use strict';

  var CAT = window.BREW_CATALOGO;

  var ARREDONDAMENTOS = [
    { id: 'nenhum', rot: 'Sem arredondar', ex: 'R$ 157,43' },
    { id: 'inteiro', rot: 'Real cheio', ex: 'R$ 158,00' },
    { id: 'noventa', rot: 'Terminar em ,90', ex: 'R$ 157,90' },
    { id: 'dezena', rot: 'Dezena', ex: 'R$ 160,00' }
  ];
  BREW.ARREDONDAMENTOS = ARREDONDAMENTOS;

  /* ------------------------------------------------------- tabela em branco */

  /* Todas as chaves que a tabela precisa ter, na ordem em que aparecem no
     painel. Gerada do catálogo — cardápio novo, tabela nova, sem retrabalho. */
  BREW.chavesDePreco = function () {
    var linhas = [];
    CAT.categorias.forEach(function (cat) {
      cat.blocos.forEach(function (bloco) {
        linhas.push({ chave: bloco.id, nivel: 'bloco', bloco: bloco, rotulo: bloco.nome });
        if (!(bloco.preco && bloco.preco.porItem)) return;
        (bloco.itens || []).forEach(function (item) {
          linhas.push({ chave: item.id, nivel: 'item', bloco: bloco, item: item, rotulo: item.nome });
          if (!item.variacoes) return;
          item.variacoes.opcoes.forEach(function (op) {
            linhas.push({
              chave: item.id + '::' + op, nivel: 'variacao',
              bloco: bloco, item: item, rotulo: op
            });
          });
        });
      });
    });
    return linhas;
  };

  BREW.tabelaVazia = function () {
    var t = { versao: 1, tabela: {}, arredondamento: 'inteiro', inclusosExtras: [], nota: '' };
    BREW.chavesDePreco().forEach(function (l) { t.tabela[l.chave] = [{ ate: null, valor: 0 }]; });
    t.inclusosExtras = window.BREW_PRECOS_PADRAO.inclusosExtras.slice();
    t.nota = window.BREW_PRECOS_PADRAO.nota;
    return t;
  };

  /* Mescla uma tabela salva sobre a estrutura atual do catálogo. */
  BREW.adotarPrecos = function (bruto) {
    var novo = BREW.tabelaVazia();
    if (!bruto) return novo;
    /* aceita também um arquivo de proposta, que traz a tabela em .precos */
    if (!bruto.tabela && bruto.precos && bruto.precos.tabela) bruto = bruto.precos;
    if (bruto.arredondamento) novo.arredondamento = bruto.arredondamento;
    if (Array.isArray(bruto.inclusosExtras)) novo.inclusosExtras = bruto.inclusosExtras.slice();
    if (typeof bruto.nota === 'string') novo.nota = bruto.nota;
    Object.keys(novo.tabela).forEach(function (chave) {
      var faixas = bruto.tabela && bruto.tabela[chave];
      if (!Array.isArray(faixas) || !faixas.length) return;
      novo.tabela[chave] = faixas.map(function (f) {
        return { ate: f.ate == null || f.ate === '' ? null : Number(f.ate), valor: Number(f.valor) || 0 };
      });
    });
    return novo;
  };

  /* ------------------------------------------------------------- resolução */

  function temValor(faixas) {
    return Array.isArray(faixas) && faixas.some(function (f) { return Number(f.valor) > 0; });
  }

  /* Faixa que vale para um volume: a primeira cujo teto alcança o volume;
     se nenhuma alcançar, vale a última (o "acima de"). */
  function valorNaFaixa(faixas, volume) {
    if (!Array.isArray(faixas) || !faixas.length) return 0;
    var ordenadas = faixas.slice().sort(function (a, b) {
      if (a.ate == null) return 1;
      if (b.ate == null) return -1;
      return a.ate - b.ate;
    });
    for (var i = 0; i < ordenadas.length; i++) {
      var ate = ordenadas[i].ate;
      if (ate == null || volume <= ate) return Number(ordenadas[i].valor) || 0;
    }
    return Number(ordenadas[ordenadas.length - 1].valor) || 0;
  }
  BREW.valorNaFaixa = valorNaFaixa;

  /* Preço unitário de um bloco já composto (linha de BREW.compor). */
  function precoDoBloco(linha, volume, tabela) {
    var bloco = linha.bloco;
    var pegar = function (chave) {
      var f = tabela[chave];
      return temValor(f) ? { valor: valorNaFaixa(f, volume), chave: chave } : null;
    };

    if (bloco.preco && bloco.preco.porItem && linha.itens.length) {
      var candidatos = linha.itens.map(function (it) {
        var v = linha.variacoes[it.id];
        return (v && pegar(it.id + '::' + v)) || pegar(it.id) || pegar(bloco.id);
      }).filter(Boolean);
      /* em bloco com mais de uma opção marcada, a mais cara define */
      if (candidatos.length) {
        return candidatos.reduce(function (a, b) { return b.valor > a.valor ? b : a; });
      }
      return null;
    }
    return pegar(bloco.id);
  }

  /* ------------------------------------------------------- arredondamento */

  function arredondar(valor, modo) {
    if (!(valor > 0)) return 0;
    if (modo === 'inteiro') return Math.ceil(valor);
    if (modo === 'dezena') return Math.ceil(valor / 10) * 10;
    if (modo === 'noventa') {
      var base = Math.floor(valor);
      var alvo = base + 0.9;
      return alvo >= valor ? alvo : base + 1.9;
    }
    return Math.round(valor * 100) / 100;
  }
  BREW.arredondar = arredondar;

  /* ------------------------------------------------------------- formatação */

  BREW.dinheiro = function (v) {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  };

  /* =========================================================== PRECIFICAR */

  /* Monta os pacotes do orçamento a partir da composição do evento.
     Blocos marcados como "opcional" saem do pacote base e formam um segundo
     pacote — é assim que os orçamentos do Sindgraf/Sindanf apresentam a
     música ao vivo. */
  BREW.precificar = function (estado, precos, comp) {
    comp = comp || BREW.compor(estado);
    var tabela = precos.tabela || {};
    var convidados = Number(comp.evento.convidados) || 0;

    var todas = [];
    var pendencias = [];

    comp.categorias.forEach(function (g) {
      g.blocos.forEach(function (linha) {
        var bloco = linha.bloco;
        var opcional = !!((estado.blocos || {})[bloco.id] || {}).opcional;
        var porLitro = bloco.preco && bloco.preco.modo === 'litro';
        var volume = porLitro ? (Number(linha.litros) || 0) : convidados;
        var achado = precoDoBloco(linha, volume, tabela);

        if (!achado) {
          pendencias.push(bloco.nome + ' está sem preço na tabela.');
        }
        var unit = achado ? achado.valor : 0;

        todas.push({
          bloco: bloco,
          opcional: opcional,
          tipo: porLitro ? 'fechado' : 'pessoa',
          rotulo: rotuloCobranca(linha),
          unit: unit,
          qtd: porLitro ? volume : convidados,
          subtotal: porLitro ? unit * volume : unit * convidados,
          semPreco: !achado
        });
      });
    });

    var opcionais = todas.filter(function (l) { return l.opcional; });
    var base = todas.filter(function (l) { return !l.opcional; });
    var taxa = estado.taxaServico || { ativa: false };

    var pacotes = [];
    pacotes.push(montarPacote(
      opcionais.length ? 'Padrão' : 'Média por pessoa',
      base, convidados, precos, taxa
    ));
    if (opcionais.length) {
      var nomes = opcionais.map(function (l) { return l.bloco.nome.toLowerCase(); }).join(' e ');
      pacotes.push(montarPacote('Com ' + nomes, base.concat(opcionais), convidados, precos, taxa));
    }

    if (convidados <= 0) pendencias.push('Sem a quantidade de convidados não dá para calcular o valor.');

    return {
      convidados: convidados,
      linhas: todas,
      pacotes: pacotes,
      pendencias: pendencias,
      temPreco: todas.length > 0 && todas.every(function (l) { return !l.semPreco; }) && convidados > 0
    };
  };

  function montarPacote(nome, linhas, convidados, precos, taxa) {
    var somaPessoa = 0, somaFechado = 0;
    linhas.forEach(function (l) {
      if (l.tipo === 'pessoa') somaPessoa += l.unit;
      else somaFechado += l.subtotal;
    });
    var subtotal = convidados > 0 ? somaPessoa + somaFechado / convidados : 0;

    /* taxa de serviço: percentual sobre o subtotal por pessoa, ou um valor
       fixo em R$ por pessoa — sempre somada antes do arredondamento, então
       ela mora dentro do mesmo número redondo que o cliente vê. */
    var taxaValor = 0;
    if (taxa && taxa.ativa && subtotal > 0) {
      taxaValor = taxa.tipo === 'fixo'
        ? (Number(taxa.valor) || 0)
        : subtotal * (Number(taxa.valor) || 0) / 100;
    }

    var mediaCrua = subtotal + taxaValor;
    var media = arredondar(mediaCrua, precos.arredondamento);
    var total = media * convidados;

    return {
      nome: nome,
      linhas: linhas,
      porPessoa: somaPessoa,
      fechados: somaFechado,
      subtotal: subtotal,
      taxa: taxa && taxa.ativa ? { tipo: taxa.tipo, valor: Number(taxa.valor) || 0, calculado: taxaValor } : null,
      mediaCrua: mediaCrua,
      media: media,
      total: total,
      inclusos: linhas.map(function (l) { return l.rotulo; })
        .concat(precos.inclusosExtras || [])
    };
  }

  /* Como o bloco aparece na lista do que está incluso no valor. */
  function rotuloCobranca(linha) {
    var b = linha.bloco;
    if (b.regra === 'litros') return 'Chopp gelado — ' + (linha.litros || 0) + ' litros';
    if (b.escolha && b.escolha.max === 1 && linha.itens.length === 1) {
      var it = linha.itens[0];
      var v = linha.variacoes[it.id];
      if (b.id === 'frios') return 'Mesa de frios — versão ' + it.nome.toLowerCase();
      return it.nome + (v ? ' (' + v + ')' : '');
    }
    if (b.id === 'petiscos') return b.nome + ' — ' + linha.itens.length + ' itens';
    if (b.regra === 'escolha') {
      return b.nome + ' — ' + linha.itens.length + ' à escolha';
    }
    if (b.id === 'drinks') return 'Open bar de drinks à vontade';
    if (b.id === 'naoalc') return 'Bebidas não alcoólicas à vontade';
    return b.nome + (linha.itens.length ? ' — ' + linha.itens.length + ' itens' : '');
  }
  BREW.rotuloCobranca = rotuloCobranca;

})(window.BREW);
