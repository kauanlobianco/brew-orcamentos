/* =============================================================================
   Brew — composição do evento + montagem da apresentação

   BREW.compor(estado)               -> normaliza as escolhas do gestor
   BREW.montarProposta(estado, alvo) -> desenha as folhas A4 da proposta

   A apresentação segue o padrão dos orçamentos individuais já entregues
   (referencia/orcamentos/*.pdf): capa + UMA SEÇÃO POR PÁGINA, cada uma com
   olho, título display/script, lead e o conteúdo em um de três formatos —
   hero, zig-zag de itens e cartão de meia página com checklist.

   A composição é a mesma usada na revisão e na apresentação: o que o gestor
   vê na etapa 3 é exatamente o que o cliente recebe na etapa 4.
   ========================================================================== */
window.BREW = window.BREW || {};

(function (BREW) {
  'use strict';

  var CAT = window.BREW_CATALOGO;
  var PRINCIPAIS = ['buffets', 'classics', 'finger', 'frios'];
  var MM = 96 / 25.4;                 /* 1mm em px na tela */
  var LINHA_MAX = 72 * MM;            /* altura máxima de uma linha do zig-zag */
  var LINHA_MIN = 20 * MM;            /* abaixo disso o item não fica legível */
  var ENDERECO = 'Av. Manoel Carneiro de Menezes, 1598 — Ponte da Saudade, Nova Friburgo/RJ';
  var CONTATO = '@brewbarbq · (22) 99209-2080';
  var ASSINATURA = 'Brew Bar·B·Q Pub · Nova Friburgo/RJ';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtData(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    if (p.length !== 3) return { longa: iso, curta: iso, dia: '' };
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (isNaN(d)) return { longa: iso, curta: iso, dia: '' };
    return {
      longa: (+p[2]) + ' de ' + MESES[d.getMonth()] + ' de ' + p[0],
      curta: p[2] + '/' + p[1] + '/' + p[0],
      dia: DIAS[d.getDay()]
    };
  }
  BREW.fmtData = fmtData;
  BREW.esc = esc;

  /* Texto da regra de um bloco de escolha: "escolha 2 opções",
     "escolha de 2 a 3 opções" ou, quando o teto é o bloco inteiro,
     "escolha no mínimo 6" (petiscos). */
  BREW.textoEscolha = function (bloco) {
    var min = bloco.escolha.min, max = bloco.escolha.max;
    if (min === max) return 'escolha ' + min + (min > 1 ? ' opções' : ' opção');
    if (max >= (bloco.itens || []).length) return 'escolha no mínimo ' + min;
    return 'escolha de ' + min + ' a ' + max + ' opções';
  };

  function hoje() {
    var d = new Date();
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /* ---------------------------------------------------------------- COMPOR */

  BREW.compor = function (estado) {
    var ev = estado.evento || {};
    var data = fmtData(ev.data);
    var comp = {
      evento: {
        cliente: (ev.cliente || '').trim(),
        ocasiao: (ev.ocasiao || '').trim(),
        data: data,
        dataISO: ev.data || '',
        convidados: ev.convidados ? String(ev.convidados).trim() : '',
        local: (ev.local || '').trim(),
        numero: (ev.numero || '').trim(),
        validade: (ev.validade || '').toString().trim(),
        abertura: (ev.abertura || '').trim(),
        fechamento: (ev.fechamento || '').trim()
      },
      categorias: [],
      avisos: [],
      totalBlocos: 0,
      totalItens: 0
    };

    CAT.categorias.forEach(function (cat) {
      var blocos = [];
      cat.blocos.forEach(function (bloco) {
        var sel = (estado.blocos || {})[bloco.id];
        if (!sel || !sel.ativo) return;

        var itens, barris = [], litros = sel.litros;
        if (bloco.regra === 'barris') {
          /* chopp: a marca entra quando tem pelo menos um barril */
          itens = (bloco.itens || []).filter(function (it) {
            var q = (sel.barris || {})[it.id] || {};
            var tem = false;
            bloco.barris.forEach(function (br) {
              var n = Math.max(0, Math.floor(Number(q[br.id]) || 0));
              if (n > 0) { barris.push({ item: it, barril: br, qtd: n }); tem = true; }
            });
            return tem;
          });
          /* orçamento antigo, só com litros: continua valendo */
          if (barris.length) {
            litros = barris.reduce(function (a, b) { return a + b.qtd * b.barril.litros; }, 0);
          }
        } else {
          itens = (bloco.itens || []).filter(function (it) {
            return (sel.itens || {})[it.id];
          });
        }
        blocos.push({
          bloco: bloco,
          itens: itens,
          variacoes: sel.variacoes || {},
          barris: barris,
          litros: litros
        });
        comp.totalBlocos++;
        comp.totalItens += itens.length;

        /* validações do bloco -------------------------------------------- */
        if (bloco.regra === 'escolha') {
          var min = bloco.escolha.min, max = bloco.escolha.max;
          if (itens.length < min) {
            comp.avisos.push({
              tipo: 'erro',
              texto: 'Bloco ' + bloco.numero + ' · ' + bloco.nome + ': ' + BREW.textoEscolha(bloco) +
                ' (marcado' + (itens.length === 1 ? '' : 's') + ': ' + itens.length + ').'
            });
          } else if (itens.length > max) {
            comp.avisos.push({
              tipo: 'aviso',
              texto: 'Bloco ' + bloco.numero + ' · ' + bloco.nome + ': o cardápio prevê ' +
                max + ', você marcou ' + itens.length + '. Confirme se é intencional.'
            });
          }
        }
        if (bloco.regra === 'completo' && itens.length === 0) {
          comp.avisos.push({
            tipo: 'erro',
            texto: 'Bloco ' + bloco.numero + ' · ' + bloco.nome + ' está ligado sem nenhum item marcado.'
          });
        }
        if (bloco.regra === 'barris' && !(Number(litros) > 0)) {
          comp.avisos.push({
            tipo: 'erro',
            texto: 'Bloco ' + bloco.numero + ' · ' + bloco.nome + ': escolha a marca e a quantidade de barris.'
          });
        }
      });

      if (blocos.length) comp.categorias.push({ cat: cat, blocos: blocos });
    });

    /* validações do evento --------------------------------------------- */
    if (!comp.evento.cliente) comp.avisos.push({ tipo: 'erro', texto: 'Informe o nome do cliente.' });
    if (!comp.evento.ocasiao) comp.avisos.push({ tipo: 'erro', texto: 'Informe a ocasião do evento.' });
    if (!comp.evento.dataISO) comp.avisos.push({ tipo: 'erro', texto: 'Informe a data do evento.' });
    if (!(Number(comp.evento.convidados) > 0)) comp.avisos.push({ tipo: 'erro', texto: 'Informe a quantidade de convidados.' });

    if (comp.totalBlocos === 0) {
      comp.avisos.push({ tipo: 'erro', texto: 'Nenhum bloco selecionado — a proposta ficaria vazia.' });
    } else {
      var nPrincipais = PRINCIPAIS.filter(function (id) {
        var s = (estado.blocos || {})[id];
        return s && s.ativo;
      }).length;
      if (nPrincipais === 0) {
        comp.avisos.push({ tipo: 'aviso', texto: 'Nenhum prato principal (blocos 02 a 05) selecionado.' });
      } else if (nPrincipais > 1) {
        comp.avisos.push({
          tipo: 'aviso',
          texto: 'Mais de um prato principal selecionado — o cardápio prevê 1. Confirme se é intencional.'
        });
      }
    }

    comp.temErro = comp.avisos.some(function (a) { return a.tipo === 'erro'; });
    return comp;
  };

  /* Resumo curto de um bloco — usado na revisão e no status */
  /* "Heineken" · "Brahma e Heineken" */
  BREW.marcasDoChopp = function (linha) {
    var n = (linha.itens || []).map(function (it) { return it.nome; });
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : (n[0] || '');
  };

  /* "2 barris de 50 L + 1 barril de 30 L" (somando as marcas) */
  BREW.barrisDoChopp = function (linha) {
    var porTam = {};
    (linha.barris || []).forEach(function (b) {
      porTam[b.barril.litros] = (porTam[b.barril.litros] || 0) + b.qtd;
    });
    return Object.keys(porTam).sort(function (a, b) { return b - a; }).map(function (l) {
      var n = porTam[l];
      return n + (n === 1 ? ' barril' : ' barris') + ' de ' + l + ' L';
    }).join(' + ');
  };

  BREW.resumoBloco = function (linha) {
    var b = linha.bloco;
    if (b.regra === 'barris') {
      if (!(linha.barris || []).length) return (linha.litros || 0) + ' litros';
      return linha.barris.map(function (x) {
        return x.qtd + '× ' + x.item.nome + ' ' + x.barril.litros + ' L';
      }).join(' · ') + ' — ' + linha.litros + ' litros';
    }
    var nomes = linha.itens.map(function (it) {
      var v = linha.variacoes[it.id];
      return it.nome + (v ? ' (' + v + ')' : '');
    });
    if (!nomes.length) return '—';
    if (b.regra === 'completo' && nomes.length === (b.itens || []).length) {
      return 'Bloco completo · ' + nomes.length + ' itens';
    }
    return nomes.join(' · ');
  };

  /* ------------------------------------------------------- MONTAR PROPOSTA */

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function foto(arq, cls) {
    if (!arq) return '';
    return '<div class="' + (cls || 'foto') + '"><img src="assets/img/' + esc(arq) + '" alt=""></div>';
  }

  /* {item} = opção escolhida no bloco · {litros} = litros de chopp ·
     {marcas} = marcas do chopp · {barris} = "2 barris de 50 L" */
  function preencher(txt, linha) {
    if (!txt) return '';
    var it = linha.itens[0];
    var marcas = linha.bloco.regra === 'barris' ? BREW.marcasDoChopp(linha) : '';
    var barris = linha.bloco.regra === 'barris' ? BREW.barrisDoChopp(linha) : '';
    return String(txt)
      .replace(/\{item\}/g, it ? it.nome : '')
      .replace(/\{litros\}/g, linha.litros || 0)
      .replace(/ ?\{marcas\}/g, marcas ? ' ' + marcas : '')
      .replace(/\{barris\}( · )?/g, function (m, sep) { return barris ? barris + (sep || '') : ''; });
  }

  function cfg(linha) {
    return linha.bloco.proposta || { formato: 'zigzag', olho: linha.bloco.nome, h1: linha.bloco.nome, script: '' };
  }

  /* ---- cabeçalho da seção ---- */
  function secTopoHTML(linha, continuacao) {
    var c = cfg(linha);
    var h1 = preencher(c.h1, linha) || linha.bloco.nome;
    return '<div class="sec-topo">' +
      '<p class="olho">' + esc(c.olho) + (continuacao ? ' · continuação' : '') + '</p>' +
      '<h2>' + esc(h1) + (c.script ? ' <span class="script">' + esc(c.script) + '</span>' : '') + '</h2>' +
      (c.lead ? '<p class="lead">' + esc(preencher(c.lead, linha)) + '</p>' : '') +
      '</div>';
  }

  /* ---- formato 1 · hero (uma opção em destaque) ---- */
  function corpoHero(linha) {
    var b = linha.bloco, c = cfg(linha);
    var it = linha.itens[0];
    var titulo = it ? it.nome : (c.titulo || b.nome);
    var texto = (it && it.desc) || c.texto || b.descricao;
    var img = (it && it.foto) || b.foto;

    var lista = [];
    if (it && it.inclui) lista = it.inclui.slice();
    if (it && linha.variacoes[it.id]) {
      lista.unshift(((it.variacoes && it.variacoes.rotulo) || 'Opção') + ' · ' + linha.variacoes[it.id]);
    }

    return '<div class="hero-bloco">' + foto(img) +
      '<div class="cartao">' +
      (c.selo ? '<span class="selo-brasa">' + esc(preencher(c.selo, linha)) + '</span>' : '') +
      '<h3>' + esc(titulo) + '</h3>' +
      '<p>' + esc(texto) + '</p>' +
      (lista.length ? '<ul class="checklist">' +
        lista.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      '</div></div>';
  }

  /* ---- formato 2 · zig-zag (foto e texto alternando lado a lado) ---- */
  function corpoZigzag(itens, linha, deslocamento) {
    var celulas = itens.map(function (it, i) {
      var n = deslocamento + i + 1;
      var extra = linha.variacoes[it.id]
        ? '<div class="extra">' + esc(linha.variacoes[it.id]) + '</div>' : '';
      var txt = '<div class="cel cel-txt">' +
        '<span class="n">' + (n < 10 ? '0' : '') + n + '</span>' +
        '<h4>' + esc(it.nome) + '</h4>' +
        (it.desc ? '<p>' + esc(it.desc) + '</p>' : '') + extra +
        '</div>';
      var img = '<div class="cel cel-foto">' +
        (it.foto ? '<img src="assets/img/' + esc(it.foto) + '" alt="">' : '') + '</div>';
      /* alterna: ímpar começa com a foto, par começa com o texto */
      return (n % 2) ? img + txt : txt + img;
    }).join('');
    return '<div class="zig">' + celulas + '</div>';
  }

  /* ---- formato 3 · cartão de meia página com checklist ---- */
  function corpoMeia(linha) {
    var b = linha.bloco, c = cfg(linha);
    var itens = linha.itens.length ? linha.itens.map(function (it) { return it.nome; }) : [];
    var lista = (c.checklist || itens).map(function (x) { return preencher(x, linha); });

    return '<div class="meia">' + foto(b.foto) +
      '<div class="txt">' +
      (c.selo ? '<span class="selo-brasa">' + esc(preencher(c.selo, linha)) + '</span>' : '') +
      '<h3>' + esc(preencher(c.titulo || b.nome, linha)) + '</h3>' +
      '<p>' + esc(preencher(c.texto || b.descricao, linha)) + '</p>' +
      (lista.length ? '<ul class="checklist">' +
        lista.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      '</div></div>';
  }

  function rodapeHTML(esquerda) {
    return '<div class="rodape"><span>' + esc(esquerda) + '</span><span class="pag"></span></div>';
  }

  /* Linha-resumo da capa, montada a partir do que foi escolhido. */
  function resumoCapa(comp) {
    var partes = [];
    comp.categorias.forEach(function (g) {
      g.blocos.forEach(function (linha) {
        var b = linha.bloco;
        if (b.regra === 'barris') {
          var marcas = BREW.marcasDoChopp(linha);
          partes.push((linha.litros || 0) + ' litros de chopp' + (marcas ? ' ' + marcas : ''));
          return;
        }
        if (b.escolha && b.escolha.max === 1 && linha.itens.length === 1) { partes.push(linha.itens[0].nome); return; }
        partes.push(b.nome);
      });
    });
    if (comp.evento.convidados) partes.push('Base de ' + comp.evento.convidados + ' pessoas');
    return partes.join(' · ');
  }

  /* ---- folha "o valor" ----
     Mesmo desenho dos orçamentos individuais: a média por pessoa é o número
     em destaque, o que está incluso vem em checklist e o total para o número
     de convidados fecha o cartão. Preço por item nunca aparece. */
  function folhaValor(comp, prec, precos, alvo) {
    var d = BREW.dinheiro;
    var duplo = prec.pacotes.length > 1;
    var rotulo = [comp.evento.ocasiao, comp.evento.cliente].filter(Boolean).join(' · ');

    var f = el('section', 'folha');
    f.innerHTML =
      '<div class="sec-topo">' +
      '<p class="olho">O valor</p>' +
      '<h2>' + (duplo ? 'Escolha <span class="script">o pacote</span>'
        : 'Quanto <span class="script">fica</span>') + '</h2>' +
      '</div>';

    var corpo = el('div', 'sec-corpo');
    var cartoes = prec.pacotes.map(function (p) {
      /* a taxa some dentro do valor por pessoa — some mesmo: nem uma nota
         avisando que ela está incluída. Só o valor por pessoa importa aqui. */
      return '<div class="pacote">' +
        (rotulo ? '<div class="rot">' + esc(rotulo) + '</div>' : '') +
        '<div class="nome">' + esc(p.nome) + '</div>' +
        '<div class="valor">' + d(p.media) + '</div>' +
        '<div class="unid">por pessoa</div>' +
        '<ul class="checklist">' +
        p.inclusos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul>' +
        '<div class="total">' +
        '<span class="rot">Total para ' + esc(prec.convidados) + ' pessoas</span>' +
        '<b>' + d(p.total) + '</b></div>' +
        '</div>';
    }).join('');

    corpo.innerHTML =
      (precos.nota ? '<div class="sec-nota" style="margin:0 0 6mm"><b>★</b> ' + esc(precos.nota) + '</div>' : '') +
      '<div class="pacotes' + (duplo ? ' duplo' : '') + '">' + cartoes + '</div>';

    f.appendChild(corpo);
    f.insertAdjacentHTML('beforeend', rodapeHTML(ASSINATURA));
    alvo.appendChild(f);
  }

  BREW.montarProposta = function (estado, alvo, precos) {
    var comp = BREW.compor(estado);
    var ev = comp.evento;
    alvo.innerHTML = '';

    /* ---------------------------------------------------------- capa ---- */
    var capa = el('section', 'folha capa');
    var selos = [];
    if (ev.convidados) {
      selos.push('<div class="selo-evento"><div class="rot">Convidados</div><div class="val">' +
        esc(ev.convidados) + '<small>pessoas</small></div></div>');
    }
    if (ev.data) {
      selos.push('<div class="selo-evento"><div class="rot">Data do evento</div><div class="val">' +
        esc(ev.data.curta) + '<small>' + esc(ev.data.dia) + '</small></div></div>');
    }
    if (ev.local) {
      selos.push('<div class="selo-evento"><div class="rot">Local</div><div class="val">' +
        esc(ev.local) + '</div></div>');
    }
    if (ev.validade) {
      selos.push('<div class="selo-evento"><div class="rot">Validade</div><div class="val">' +
        esc(ev.validade) + '<small>dias corridos</small></div></div>');
    }
    if (ev.numero) {
      selos.push('<div class="selo-evento"><div class="rot">Proposta</div><div class="val">' +
        esc(ev.numero) + '</div></div>');
    }
    capa.innerHTML =
      '<img class="selo" src="assets/logo.png" alt="Brew Bar·B·Q Pub">' +
      '<span class="script-capa">Proposta para</span>' +
      '<h1>' + (ev.ocasiao || ev.cliente ? esc(ev.ocasiao) + (ev.ocasiao && ev.cliente ? '<br>' : '') + esc(ev.cliente) : 'Evento') + '</h1>' +
      (comp.totalBlocos ? '<p class="resumo-capa">' + esc(resumoCapa(comp)) + '</p>' : '') +
      (ev.abertura ? '<p class="abertura">' + esc(ev.abertura) + '</p>' : '') +
      (selos.length ? '<div class="selos-evento">' + selos.join('') + '</div>' : '') +
      rodapeHTML('Emitida em ' + hoje());
    alvo.appendChild(capa);

    /* ----------------------------------------- uma seção por bloco ------ */
    comp.categorias.forEach(function (grupo) {
      grupo.blocos.forEach(function (linha) {
        var formato = cfg(linha).formato;

        if (formato === 'zigzag') montarZigzag(linha, alvo);
        else {
          var f = novaFolhaSecao(linha, alvo, false);
          f.corpo.innerHTML = formato === 'meia' ? corpoMeia(linha) : corpoHero(linha);
        }
      });
    });

    /* --------------------------------------------------------- valor ---- */
    if (estado.mostrarValor !== false && precos && comp.totalBlocos) {
      var prec = BREW.precificar(estado, precos, comp);
      if (prec.temPreco) folhaValor(comp, prec, precos, alvo);
    }

    /* --------------------------------------------------------- fecho ---- */
    var fecho = el('section', 'folha fecho');
    fecho.innerHTML =
      '<span class="script-capa">Bora fechar?</span>' +
      '<h2>Fale com a gente</h2>' +
      '<p class="texto">' + esc(ev.fechamento ||
        'Qualquer ajuste na composição — trocar um bloco, incluir ou tirar um item — a gente resolve conversando e refaz a proposta.') + '</p>' +
      '<div class="caixa-contato">' +
      '<div class="rot">Falar com a equipe</div>' +
      '<p>' + esc(ENDERECO) + '<br>' + esc(CONTATO) + '</p>' +
      '</div>' +
      rodapeHTML(ASSINATURA);
    alvo.appendChild(fecho);

    /* ----------------------------------------------------- numeração ---- */
    var folhas = alvo.querySelectorAll('.folha');
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    Array.prototype.forEach.call(folhas, function (f, i) {
      var p = f.querySelector('.pag');
      if (p) p.textContent = z(i + 1) + ' / ' + z(folhas.length);
    });

    return comp;
  };

  /* Cria a folha de uma seção já montada no DOM (o corpo precisa estar
     medido para o zig-zag calcular a altura das linhas). */
  function novaFolhaSecao(linha, alvo, continuacao) {
    var f = el('section', 'folha');
    f.innerHTML = secTopoHTML(linha, continuacao);
    var corpo = el('div', 'sec-corpo');
    f.appendChild(corpo);
    f.insertAdjacentHTML('beforeend', rodapeHTML(ASSINATURA));
    alvo.appendChild(f);
    return { folha: f, corpo: corpo };
  }

  /* O zig-zag ocupa a altura útil da folha: as linhas se dividem igualmente,
     com um teto para não virar pôster quando há poucos itens, e um piso que
     define quantos itens cabem por página antes de abrir uma continuação. */
  function montarZigzag(linha, alvo) {
    var itens = linha.itens;
    if (!itens.length) {
      novaFolhaSecao(linha, alvo, false).corpo.innerHTML =
        '<div class="sec-nota">Nenhum item marcado neste bloco.</div>';
      return;
    }

    var sonda = novaFolhaSecao(linha, alvo, false);
    var disponivel = sonda.corpo.clientHeight;
    var cabemPorPagina = Math.max(1, Math.floor((disponivel + 1) / (LINHA_MIN + 1)));
    alvo.removeChild(sonda.folha);

    /* Divide em partes iguais, não greedy: com 12 itens e teto de 11 por
       página, greedy deixaria "11 + 1" — uma folha quase vazia com um item
       solto. Calculado o nº mínimo de páginas, reparte por igual entre elas. */
    var paginas = Math.ceil(itens.length / cabemPorPagina);
    var porPagina = Math.ceil(itens.length / paginas);

    for (var i = 0; i < itens.length; i += porPagina) {
      var pedaco = itens.slice(i, i + porPagina);
      var pg = novaFolhaSecao(linha, alvo, i > 0);
      pg.corpo.innerHTML = corpoZigzag(pedaco, linha, i);
      var zig = pg.corpo.querySelector('.zig');
      var altura = Math.min(
        (pg.corpo.clientHeight - (pedaco.length - 1)) / pedaco.length,
        LINHA_MAX
      );
      zig.style.gridAutoRows = altura + 'px';
    }
  }

})(window.BREW);
