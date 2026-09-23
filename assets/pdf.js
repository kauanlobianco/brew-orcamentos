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

  /* folhas: NodeList/Array de .folha já montadas na tela
     progresso(n, total): chamado a cada página pronta */
  function gerar(folhas, progresso) {
    folhas = Array.prototype.slice.call(folhas);
    var palco = folhas.length ? folhas[0].parentNode : null;
    var zoomAntes = palco ? palco.style.zoom : '';

    return Promise.all(LIBS.map(carregarScript))
      .then(function () { return document.fonts ? document.fonts.ready : null; })
      .then(function () { return esperarImagens(palco); })
      .then(function () {
        /* a tela do celular encolhe as folhas com zoom — para capturar, volta
           ao tamanho real */
        if (palco) palco.style.zoom = '1';
        return window.htmlToImage.getFontEmbedCSS(folhas[0]);
      })
      .then(function (fontes) {
        var opcoes = {
          width: LARGURA, height: ALTURA,
          pixelRatio: 1.6, quality: 0.86,
          backgroundColor: '#17130F',
          fontEmbedCSS: fontes,
          style: { margin: '0', boxShadow: 'none' }
        };
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

        /* aquecimento: o Safari às vezes desenha a primeira captura sem as
           fotos; uma passada descartável resolve */
        var cadeia = window.htmlToImage.toJpeg(folhas[0], opcoes).catch(function () { return null; });

        folhas.forEach(function (folha, i) {
          cadeia = cadeia.then(function () {
            return window.htmlToImage.toJpeg(folha, opcoes);
          }).then(function (dataUrl) {
            if (i > 0) pdf.addPage('a4', 'portrait');
            pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 296.8, undefined, 'FAST');
            if (progresso) progresso(i + 1, folhas.length);
          });
        });
        return cadeia.then(function () { return pdf.output('blob'); });
      })
      .then(function (blob) {
        if (palco) palco.style.zoom = zoomAntes;
        return blob;
      }, function (e) {
        if (palco) palco.style.zoom = zoomAntes;
        throw e;
      });
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
