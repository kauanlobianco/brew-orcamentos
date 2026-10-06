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

   O volume é a quantidade de convidados nos blocos por pessoa e nos de valor
   do evento (música), a quantidade de barris no preço de cada barril de
   chopp, e a de litros no preço do chopp por litro.

   ------------------------------------------------------------------- chaves
   'petiscos'                              preço do bloco
   'buf-parrilla'                          preço de uma opção (sobrepõe o bloco)
   'buf-steakhouse::Fraldinha'             preço de uma variação (sobrepõe a opção)
   'chopp-heineken::Barril 50 L'           preço de um barril de uma marca
   'petiscos#faixas'                       faixas comerciais dos petiscos: aqui
                                           o "até" é a SOMA dos itens em R$

   A resolução vai da chave mais específica para a mais geral e para na
   primeira que tiver algum valor preenchido. Com mais de uma opção marcada,
   o campo preco.combinar do bloco decide (catalogo.js):

   petiscos  soma o preço dos itens escolhidos e enquadra na faixa comercial
             (soma até 59,90 -> 59,90 · até 69,90 -> 69,90 · até 79,90 ->
             79,90 · acima disso cobra a própria soma)
   classics  média das duas opções — cada convidado come um dos pratos
   demais    a opção mais cara define

   Faixa com valor 0 numa tabela preenchida = "sob consulta" (ex.: drinks
   acima de 160 convidados): o bloco fica sem preço e vira pendência.
   ========================================================================== */
window.BREW = window.BREW || {};

/* Textos padrão da página de valor. Os preços em si começam zerados de
   propósito: quem preenche é o gestor, na aba "Preços". */
window.BREW_PRECOS_PADRAO = {
  /* entradas que já nascem preenchidas (tabela de set/2026) — valem só
     enquanto a tabela salva não tiver a chave */
  tabela: {
    'petiscos#faixas': [
      { ate: 59.9, valor: 59.9 }, { ate: 69.9, valor: 69.9 },
      { ate: 79.9, valor: 79.9 }, { ate: null, valor: 0 }
    ],
    'chopp-brahma::Barril 30 L':   [{ ate: null, valor: 800 }],
    'chopp-brahma::Barril 50 L':   [{ ate: null, valor: 1200 }],
    'chopp-amstel::Barril 30 L':   [{ ate: null, valor: 800 }],
    'chopp-amstel::Barril 50 L':   [{ ate: null, valor: 1200 }],
    'chopp-heineken::Barril 30 L': [{ ate: null, valor: 900 }],
    'chopp-heineken::Barril 50 L': [{ ate: null, valor: 1400 }]
  },
  /* equipe de serviço: R$ 120 a cada 20 convidados (fração conta inteira) */
  equipe: { valor: 120, aCada: 20 },
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
        if (bloco.preco && bloco.preco.combinar === 'soma-faixa') {
          linhas.push({ chave: bloco.id + '#faixas', nivel: 'comercial', bloco: bloco, rotulo: 'Faixas comerciais' });
        }
        if (!(bloco.preco && bloco.preco.porItem)) return;
        (bloco.itens || []).forEach(function (item) {
          if (bloco.barris) {
            bloco.barris.forEach(function (br) {
              linhas.push({
                chave: item.id + '::' + br.rotulo, nivel: 'barril',
                bloco: bloco, item: item, barril: br, rotulo: item.nome + ' · ' + br.rotulo
              });
            });
            return;
          }
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
    var t = {
      versao: 1, tabela: {}, arredondamento: 'inteiro',
      equipe: { valor: 0, aCada: 20 }, inclusosExtras: [], nota: ''
    };
    BREW.chavesDePreco().forEach(function (l) { t.tabela[l.chave] = [{ ate: null, valor: 0 }]; });
    t.inclusosExtras = window.BREW_PRECOS_PADRAO.inclusosExtras.slice();
    t.nota = window.BREW_PRECOS_PADRAO.nota;
    return t;
  };

  function copiarFaixas(faixas) {
    return faixas.map(function (f) {
      return { ate: f.ate == null || f.ate === '' ? null : Number(f.ate), valor: Number(f.valor) || 0 };
    });
  }

  /* Mescla uma tabela salva sobre a estrutura atual do catálogo. Chave que a
     tabela salva ainda não conhece (bloco novo) nasce com o valor padrão. */
  BREW.adotarPrecos = function (bruto) {
    var novo = BREW.tabelaVazia();
    var padrao = window.BREW_PRECOS_PADRAO;
    Object.keys(padrao.tabela).forEach(function (chave) {
      if (novo.tabela[chave]) novo.tabela[chave] = copiarFaixas(padrao.tabela[chave]);
    });
    novo.equipe = { valor: padrao.equipe.valor, aCada: padrao.equipe.aCada };
    if (!bruto) return novo;
    /* aceita também um arquivo de proposta, que traz a tabela em .precos */
    if (!bruto.tabela && bruto.precos && bruto.precos.tabela) bruto = bruto.precos;
    if (bruto.arredondamento) novo.arredondamento = bruto.arredondamento;
    if (bruto.equipe) {
      novo.equipe = {
        valor: Number(bruto.equipe.valor) || 0,
        aCada: Math.max(1, Math.round(Number(bruto.equipe.aCada) || 20))
      };
    }
    if (Array.isArray(bruto.inclusosExtras)) novo.inclusosExtras = bruto.inclusosExtras.slice();
    if (typeof bruto.nota === 'string') novo.nota = bruto.nota;
    Object.keys(novo.tabela).forEach(function (chave) {
      var faixas = bruto.tabela && bruto.tabela[chave];
      if (!Array.isArray(faixas) || !faixas.length) return;
      novo.tabela[chave] = copiarFaixas(faixas);
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

  function centavos(v) { return Math.round(v * 100) / 100; }

  /* Preço unitário de um bloco já composto (linha de BREW.compor).
     Devolve { valor, detalhe } · { consulta: true } · ou null (sem preço). */
  function precoDoBloco(linha, volume, tabela) {
    var bloco = linha.bloco;
    var combinar = (bloco.preco && bloco.preco.combinar) || 'maior';
    var pegar = function (chave) {
      var f = tabela[chave];
      if (!temValor(f)) return null;
      var v = valorNaFaixa(f, volume);
      return v > 0 ? { valor: v, chave: chave } : { consulta: true, chave: chave };
    };
    var doBloco = function () { return pegar(bloco.id); };

    if (!(bloco.preco && bloco.preco.porItem && linha.itens.length)) return doBloco();

    var daOpcao = function (it) {
      var v = linha.variacoes[it.id];
      return (v && pegar(it.id + '::' + v)) || pegar(it.id);
    };

    /* petiscos: soma dos itens -> faixa comercial */
    if (combinar === 'soma-faixa') {
      var precosItens = linha.itens.map(daOpcao);
      if (precosItens.some(function (p) { return !p || p.consulta; })) return doBloco();
      var soma = centavos(precosItens.reduce(function (a, p) { return a + p.valor; }, 0));
      var faixas = tabela[bloco.id + '#faixas'];
      var valor = temValor(faixas) ? valorNaFaixa(faixas, soma) : 0;
      /* faixa "acima de" com R$ 0 = cobra a própria soma (especial) */
      if (!(valor > 0)) valor = soma;
      return {
        valor: valor, soma: soma,
        detalhe: 'soma dos itens ' + BREW.dinheiro(soma) +
          (valor !== soma ? ' → faixa ' + BREW.dinheiro(valor) : ' (cobra a soma)')
      };
    }

    var candidatos = linha.itens.map(function (it) { return daOpcao(it) || doBloco(); });
    if (candidatos.some(function (c) { return c && c.consulta; })) return { consulta: true };
    var validos = candidatos.filter(Boolean);
    if (!validos.length) return null;

    /* Brew Classics: média da dupla — só fecha com todas as opções com preço */
    if (combinar === 'media') {
      if (validos.length < candidatos.length) return null;
      var media = centavos(validos.reduce(function (a, c) { return a + c.valor; }, 0) / validos.length);
      return {
        valor: media,
        detalhe: validos.length > 1
          ? 'média de ' + validos.map(function (c) { return BREW.dinheiro(c.valor); }).join(' e ')
          : ''
      };
    }
    /* demais: a mais cara define */
    return validos.reduce(function (a, b) { return b.valor > a.valor ? b : a; });
  }

  /* Chopp: soma barril a barril. Barril sem preço próprio cai no preço por
     litro do bloco; orçamento antigo (só litros, sem barris) também. */
  function precoDoChopp(linha, tabela) {
    var bloco = linha.bloco;
    var litros = Number(linha.litros) || 0;
    var porLitro = temValor(tabela[bloco.id]) ? valorNaFaixa(tabela[bloco.id], litros) : 0;
    var barris = linha.barris || [];

    if (!barris.length) {
      if (!(litros > 0) || !(porLitro > 0)) return null;
      return { total: litros * porLitro, detalhe: BREW.dinheiro(porLitro) + ' × ' + litros + ' litros' };
    }
    var total = 0, partes = [];
    for (var i = 0; i < barris.length; i++) {
      var b = barris[i];
      var f = tabela[b.item.id + '::' + b.barril.rotulo];
      var unit = temValor(f) ? valorNaFaixa(f, b.qtd) : 0;
      if (!(unit > 0)) unit = porLitro * b.barril.litros;
      if (!(unit > 0)) return null;
      total += unit * b.qtd;
      partes.push(b.qtd + '× ' + b.item.nome + ' ' + b.barril.litros + ' L (' + BREW.dinheiro(unit) + ')');
    }
    return { total: total, detalhe: partes.join(' + ') };
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
        var modo = (bloco.preco && bloco.preco.modo) || 'pessoa';
        var l = {
          bloco: bloco, opcional: opcional, rotulo: rotuloCobranca(linha),
          tipo: modo === 'pessoa' ? 'pessoa' : 'fechado',
          unit: 0, qtd: modo === 'pessoa' ? convidados : 1, subtotal: 0,
          detalhe: '', semPreco: false
        };

        if (modo === 'barril') {
          var ch = precoDoChopp(linha, tabela);
          if (ch) {
            l.unit = l.subtotal = ch.total;
            l.detalhe = ch.detalhe;
            l.litros = Number(linha.litros) || 0;
          } else l.semPreco = true;
        } else {
          var achado = precoDoBloco(linha, convidados, tabela);
          if (achado && achado.consulta) {
            l.semPreco = l.consulta = true;
          } else if (achado) {
            l.unit = achado.valor;
            l.detalhe = achado.detalhe || '';
            l.subtotal = modo === 'pessoa' ? achado.valor * convidados : achado.valor;
          } else l.semPreco = true;
        }

        if (l.consulta) {
          pendencias.push(bloco.nome + ': sob consulta para ' + convidados + ' convidados (a tabela não tem valor nessa faixa).');
        } else if (l.semPreco) {
          pendencias.push(bloco.nome + ' está sem preço na tabela.');
        }
        todas.push(l);
      });
    });

    var taxa = estado.taxaServico || { ativa: false };

    /* serviço pela equipe: valor a cada N convidados, fração conta inteira —
       é a alternativa aos 10%, nunca os dois juntos */
    var eq = precos.equipe || {};
    if (taxa.ativa && taxa.tipo === 'equipe' && Number(eq.valor) > 0 && convidados > 0 && todas.length) {
      var aCada = Math.max(1, Number(eq.aCada) || 20);
      var nBlocos = Math.ceil(convidados / aCada);
      todas.push({
        bloco: { id: 'equipe', nome: 'Equipe de serviço' },
        equipe: true, opcional: false, rotulo: null,
        tipo: 'fechado', unit: Number(eq.valor), qtd: nBlocos,
        subtotal: nBlocos * Number(eq.valor),
        detalhe: nBlocos + ' × ' + BREW.dinheiro(eq.valor) + ' (a cada ' + aCada + ' convidados)',
        semPreco: false
      });
    }

    var opcionais = todas.filter(function (l) { return l.opcional; });
    var base = todas.filter(function (l) { return !l.opcional; });

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
    if (taxa && taxa.tipo === 'equipe') taxa = null;   /* já entrou como linha */
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
      inclusos: linhas.map(function (l) { return l.rotulo; }).filter(Boolean)
        .concat(precos.inclusosExtras || [])
    };
  }

  /* Como o bloco aparece na lista do que está incluso no valor. */
  function rotuloCobranca(linha) {
    var b = linha.bloco;
    if (b.regra === 'barris') {
      var marcas = BREW.marcasDoChopp(linha);
      return 'Chopp' + (marcas ? ' ' + marcas : ' gelado') + ' — ' + (linha.litros || 0) + ' litros';
    }
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
