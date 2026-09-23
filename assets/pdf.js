/* =============================================================================
   Brew — gerar o PDF da apresentação no próprio aparelho

   A impressão do navegador funciona bem no computador, mas no celular (iPhone
   principalmente) ignora o tamanho A4, corta o fundo escuro e esconde o "Salvar
   como PDF" atrás de gestos. Aqui cada folha vira uma imagem (html-to-image,
   que usa o próprio navegador para desenhar — fontes e fotos saem iguais à
   tela) e as imagens viram as páginas de um PDF A4 (jsPDF).

   As bibliotecas só são baixadas quando o botão é usado.
   ========================================================================== */
window.BREW_PDF = (function () {
  'use strict';

  var LIBS = [
    'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ];
  var MM = 96 / 25.4;
  var LARGURA = Math.round(210 * MM);      /* a .folha: 210mm */
  var ALTURA = Math.round(296.8 * MM);     /* a .folha: 296.8mm */
  var PIXEL_VAZIO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function carregarScript(src) {
    return new Promise(function (ok, falha) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () {
        s.remove();
        falha(new Error('Não consegui baixar o gerador de PDF. Confira a internet e tente de novo.'));
      };
      document.head.appendChild(s);
    });
  }

  function esperarImagens(raiz) {
    return Promise.all(Array.prototype.map.call(raiz.querySelectorAll('img'), function (img) {
      if (img.complete) return null;
      return new Promise(function (ok) { img.onload = img.onerror = ok; });
    }));
  }

  /* ------------------------------------------------------ fotos por cima
     O Safari do iPhone desenha a página (SVG com foreignObject) antes de
     decodificar as fotos embutidas, e elas saem em branco no PDF. Por isso
     as fotos não dependem dessa captura: depois que a página vira canvas,
     cada <img> é pintada por cima com drawImage — que funciona igual em
     qualquer navegador — respeitando object-fit e os cantos arredondados
     dos cartões que a recortam. */

  function raios(cs) {
    return [cs.borderTopLeftRadius, cs.borderTopRightRadius,
      cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(function (v) {
      return parseFloat(v) || 0;
    });
  }

  function caminhoRecorte(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect && (r[0] || r[1] || r[2] || r[3])) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.clip();
  }

  function pintarFotos(canvas, folha, escala) {
    var ctx = canvas.getContext('2d');
    var base = folha.getBoundingClientRect();
    Array.prototype.forEach.call(folha.querySelectorAll('img'), function (img) {
      if (!img.naturalWidth) return;
      var r = img.getBoundingClientRect();
      var x = r.left - base.left, y = r.top - base.top, w = r.width, h = r.height;
      if (w < 1 || h < 1) return;

      /* recorte de cada ancestral com overflow:hidden (cartão, célula, folha) */
      ctx.save();
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      for (var el = img.parentElement; el; el = el.parentElement) {
        var cs = getComputedStyle(el);
        if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') {
          var a = el.getBoundingClientRect();
          caminhoRecorte(ctx, a.left - base.left, a.top - base.top, a.width, a.height, raios(cs));
        }
        if (el === folha) break;
      }

      /* object-fit: cover corta a sobra; contain encaixa inteiro (o selo) */
      var nw = img.naturalWidth, nh = img.naturalHeight;
      var sx = 0, sy = 0, sw = nw, sh = nh, dx = x, dy = y, dw = w, dh = h;
      var ajuste = getComputedStyle(img).objectFit;
      if (ajuste === 'cover') {
        if (nw / nh > w / h) { sw = nh * (w / h); sx = (nw - sw) / 2; }
        else { sh = nw / (w / h); sy = (nh - sh) / 2; }
      } else if (ajuste === 'contain') {
        if (nw / nh > w / h) { dh = w / (nw / nh); dy = y + (h - dh) / 2; }
        else { dw = h * (nw / nh); dx = x + (w - dw) / 2; }
      }
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
    });
  }

  /* trava o tamanho de cada foto enquanto captura: se o Safari demorar a
     carregar alguma, o layout da página não se mexe (o selo da capa, por
     exemplo, tem altura automática) */
  function travarTamanhos(folhas) {
    var guardados = [];
    folhas.forEach(function (folha) {
      Array.prototype.forEach.call(folha.querySelectorAll('img'), function (img) {
        var r = img.getBoundingClientRect();
        guardados.push([img, img.style.width, img.style.height]);
        img.style.width = r.width + 'px';
        img.style.height = r.height + 'px';
      });
    });
    return function destravar() {
      guardados.forEach(function (g) { g[0].style.width = g[1]; g[0].style.height = g[2]; });
    };
  }

  function decodificar(raiz) {
    return Promise.all(Array.prototype.map.call(raiz.querySelectorAll('img'), function (img) {
      return img.decode ? img.decode().catch(function () {}) : null;
    }));
  }

  /* folhas: NodeList/Array de .folha já montadas na tela
     progresso(n, total): chamado a cada página pronta */
  function gerar(folhas, progresso) {
    folhas = Array.prototype.slice.call(folhas);
    var palco = folhas.length ? folhas[0].parentNode : null;
    var zoomAntes = palco ? palco.style.zoom : '';
    var destravar = function () {};
    var escala = 1.6;

    function arrumar() {
      destravar();
      if (palco) palco.style.zoom = zoomAntes;
    }

    return Promise.all(LIBS.map(carregarScript))
      .then(function () { return document.fonts ? document.fonts.ready : null; })
      .then(function () { return esperarImagens(palco); })
      .then(function () { return decodificar(palco); })
      .then(function () {
        /* a tela do celular encolhe as folhas com zoom — para capturar, volta
           ao tamanho real */
        if (palco) palco.style.zoom = '1';
        destravar = travarTamanhos(folhas);
        return window.htmlToImage.getFontEmbedCSS(folhas[0]);
      })
      .then(function (fontes) {
        var opcoes = {
          width: LARGURA, height: ALTURA,
          pixelRatio: escala,
          backgroundColor: '#17130F',
          fontEmbedCSS: fontes,
          /* se a biblioteca não conseguir embutir uma foto (rede do celular
             oscilando), usa um pixel transparente em vez de travar — e ela
             guarda a falha em cache, então sem isso as próximas tentativas
             também quebrariam. As fotos de verdade vêm de pintarFotos(). */
          imagePlaceholder: PIXEL_VAZIO,
          style: { margin: '0', boxShadow: 'none' }
        };
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        var cadeia = Promise.resolve();

        folhas.forEach(function (folha, i) {
          cadeia = cadeia.then(function () {
            return window.htmlToImage.toCanvas(folha, opcoes);
          }).then(function (canvas) {
            pintarFotos(canvas, folha, escala);
            if (i > 0) pdf.addPage('a4', 'portrait');
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, 296.8, undefined, 'FAST');
            if (progresso) progresso(i + 1, folhas.length);
          });
        });
        return cadeia.then(function () { return pdf.output('blob'); });
      })
      .then(function (blob) { arrumar(); return blob; },
        function (e) { arrumar(); throw e; });
  }

  function baixar(blob, nome) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* compartilhar direto (WhatsApp etc.) quando o aparelho permite */
  function podeCompartilhar(blob, nome) {
    try {
      var arquivo = new File([blob], nome, { type: 'application/pdf' });
      return Boolean(navigator.canShare && navigator.canShare({ files: [arquivo] }));
    } catch (e) { return false; }
  }

  function compartilhar(blob, nome, titulo) {
    var arquivo = new File([blob], nome, { type: 'application/pdf' });
    return navigator.share({ files: [arquivo], title: titulo });
  }

  return { gerar: gerar, baixar: baixar, podeCompartilhar: podeCompartilhar, compartilhar: compartilhar };
})();
