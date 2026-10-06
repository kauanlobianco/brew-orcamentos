/* =============================================================================
   Brew Bar·B·Q Pub — Catálogo de eventos
   Espelho fiel do cardápio (referencia/gerar_cardapio.py). Fonte única de
   verdade para o painel do gestor e para a apresentação gerada.

   Para incluir/alterar um item do cardápio, mexa AQUI — o painel e a proposta
   se atualizam sozinhos.

   regra do bloco:
     'completo'  -> o bloco vem inteiro (o gestor ainda pode tirar um item)
     'escolha'   -> escolher entre as opções (escolha:{min,max})
     'barris'    -> marcas de chopp, cada uma com barris de 30 L e 50 L

   preco do bloco:
     modo     'pessoa' (por convidado) · 'evento' (valor fechado do evento)
              · 'barril' (por barril de chopp)
     porItem  aceita preço por opção/variação
     combinar como juntar o preço das opções marcadas:
              'soma-faixa' soma os itens e enquadra na faixa comercial (petiscos)
              'media'      média das opções (Brew Classics)
              'maior'      a mais cara define (padrão)
   ========================================================================== */
window.BREW_CATALOGO = {

  ocasioes: [
    'Aniversário', 'Casamento', 'Confraternização', 'Confraternização corporativa',
    'Formatura', 'Bodas', 'Batizado / chá', 'Evento corporativo', 'Outro'
  ],

  categorias: [
    /* ---------------------------------------------------------------- COMIDA */
    {
      id: 'comida',
      nome: 'Comida',
      olho: 'A composição do evento',
      titulo: { pre: 'O que vai', script: 'à mesa' },
      blocos: [
        {
          id: 'petiscos',
          numero: '01',
          nome: 'Petiscos & entradas',
          olho: 'Bloco 01 · Para começar',
          descricao: 'Servidos na recepção, acompanham qualquer prato principal.',
          preco: { modo: 'pessoa', porItem: true, combinar: 'soma-faixa' },
          foto: 'cat_pasteis.jpg',
          /* o cliente monta a própria seleção: no mínimo 6 dos 12 (set/2026) */
          regra: 'escolha',
          escolha: { min: 6, max: 12 },
          proposta: {
            formato: 'zigzag',
            olho: 'Para começar',
            h1: 'Petiscos', script: '& entradas',
            lead: 'Servidos na recepção, à vontade, enquanto os convidados chegam.'
          },
          itens: [
            { id: 'pet-pasteis',   nome: 'Pastéis variados',       desc: 'Massa artesanal, fritos na hora.',        foto: 'cat_pasteis.jpg' },
            { id: 'pet-croquete',  nome: 'Croquete de carne',      desc: 'Carne desfiada, empanada no panko.',      foto: 'cat_croquete.jpg' },
            { id: 'pet-polenta',   nome: 'Polenta frita',          desc: 'Crocante por fora, com molho da casa.',   foto: 'cat_polenta.jpg' },
            { id: 'pet-batata',    nome: 'Batata frita',           desc: 'Sequinha, frita na hora.',                foto: 'cat_batata.jpg' },
            { id: 'pet-aipim',     nome: 'Aipim frito',            desc: 'Dourado por fora, macio por dentro.',     foto: 'cat_aipim.jpg' },
            { id: 'pet-torresmo',  nome: 'Torresmo crocante',      desc: 'Artesanal, com vinagrete da casa.',       foto: 'cat_torresmo.jpg' },
            { id: 'pet-caponata',  nome: 'Caponata com torradas',  desc: 'Caponata artesanal e pão tostado.',       foto: 'cat_caponata.jpg' },
            { id: 'pet-frango',    nome: 'Tiras de frango empanado', desc: 'Empanado crocante, com maionese da casa.', foto: 'cat_frango.jpg' },
            { id: 'pet-dadinho',   nome: 'Dadinho de tapioca',     desc: 'Crocante por fora, com geleia de pimenta.', foto: 'sf_dadinho.jpg' },
            { id: 'pet-bacalhau',  nome: 'Bolinho de bacalhau',    desc: 'Recheio cremoso, com toque de ervas e limão.', foto: 'cat_bacalhau.jpg' },
            { id: 'pet-texasbbq',  nome: 'Bolinho de milho Texas BBQ', desc: 'Massa fofinha de milho, glaceado no molho barbecue.', foto: 'cat_texasbbq.jpg' },
            { id: 'pet-linguica',  nome: 'Linguiça com pão de alho', desc: 'Linguiça grelhada, pão de alho e chimichurri da casa.', foto: 'cat_linguica.jpg' }
          ]
        },
        {
          id: 'buffets',
          numero: '02',
          nome: 'Os buffets',
          olho: 'Bloco 02 · Prato principal',
          descricao: 'Servido quente, durante todo o evento.',
          preco: { modo: 'pessoa', porItem: true },
          foto: 'cat_feijoada.jpg',
          regra: 'escolha',
          escolha: { min: 1, max: 1 },
          proposta: {
            formato: 'hero',
            olho: 'O cardápio',
            h1: '{item}', script: 'no buffet',
            lead: 'Servido quente no buffet, do começo ao fim do evento.',
            selo: 'Prato principal · buffet'
          },
          itens: [
            {
              id: 'buf-feijoada', nome: 'Feijoada completa', foto: 'cat_feijoada.jpg',
              desc: 'Feijão preto com carnes selecionadas, arroz, torresmo, aipim, farofa, couve e laranja.'
            },
            {
              id: 'buf-steakhouse', nome: 'Brew Steakhouse', foto: 'cat_steakhouse.jpg',
              desc: 'Com arroz à piamontese, batata rústica, farofa de ovos e mix de folhas.',
              variacoes: {
                rotulo: 'Carne escolhida',
                opcoes: ['Filé mignon ao molho madeira', 'Fraldinha', 'Frango piamontese Brew']
              }
            },
            {
              id: 'buf-parrilla', nome: 'Parrilla Brew', foto: 'cat_parrilla.jpg',
              desc: 'Picanha uruguaia, NY strip, fraldinha e linguiça — todas servidas. Com arroz, batata, farofa, vinagrete, pão de alho e chimichurri.'
            },
            {
              id: 'buf-massas', nome: 'Buffet de massas', foto: 'cat_massas.jpg',
              desc: 'Talharim com filé mignon e shitake, finalizado na hora e servido no rechaud.'
            }
          ]
        },
        {
          id: 'classics',
          numero: '03',
          nome: 'Brew Classics',
          olho: 'Bloco 03 · Prato principal',
          descricao: 'Pratos empratados, definidos com antecedência. Escolha duas opções.',
          /* cada convidado come um dos dois pratos: cobra a média da dupla */
          preco: { modo: 'pessoa', porItem: true, combinar: 'media' },
          foto: 'bc_mignon.jpg',
          regra: 'escolha',
          escolha: { min: 2, max: 2 },
          proposta: {
            formato: 'zigzag',
            olho: 'Brew Classics',
            h1: 'Brew', script: 'Classics',
            lead: 'Pratos empratados, definidos com antecedência, servidos aos convidados no dia.'
          },
          itens: [
            { id: 'bc-linguado', nome: 'Filet de linguado',              desc: 'Purê de banana da terra, palmito e legumes grelhados.',  foto: 'bc_linguado.jpg' },
            { id: 'bc-mignon',   nome: 'Filet mignon ao molho madeira',  desc: 'Arroz à piamontese cremoso e batata portuguesa.',        foto: 'bc_mignon.jpg' },
            { id: 'bc-oswaldo',  nome: 'Filé à Oswaldo Aranha',          desc: 'Alho frito crocante, batata portuguesa e farofa de ovos.', foto: 'bc_oswaldo.jpg' },
            { id: 'bc-shrimp',   nome: "God's Shrimp",                   desc: 'Camarão sobre arroz de bacon cremoso e creme de milho.', foto: 'bc_shrimp.jpg' }
          ]
        },
        {
          id: 'finger',
          numero: '04',
          nome: 'Finger food',
          olho: 'Bloco 04 · Prato principal',
          descricao: 'Mini empratados e bowls para receber de pé.',
          preco: { modo: 'pessoa', porItem: false },
          foto: 'sf_file.jpg',
          regra: 'completo',
          proposta: {
            formato: 'zigzag',
            olho: 'O cardápio',
            h1: 'Cardápio', script: 'finger food',
            lead: 'Mini empratados e bowls, servidos ao longo do evento, para receber de pé.'
          },
          itens: [
            { id: 'sf-file',     nome: 'Filé mignon ao madeira',     desc: 'Mini empratado com arroz à piamontese.', foto: 'sf_file.jpg' },
            { id: 'sf-baroa',    nome: 'Creme de baroa',             desc: 'Com camarões salteados e azeite.',       foto: 'sf_baroa.jpg' },
            { id: 'sf-angu',     nome: 'Angu com goulash',           desc: 'Angu cremoso e goulash de carne.',       foto: 'sf_angu.jpg' },
            { id: 'sf-ceviche',  nome: 'Ceviche de peixe branco',    desc: 'Cebola roxa, leite de tigre e chips.',   foto: 'sf_ceviche.jpg' },
            { id: 'sf-cogumelo', nome: 'Cogumelos confitados',       desc: 'Na manteiga de ervas.',                  foto: 'sf_cogumelo.jpg' },
            { id: 'sf-capon',    nome: 'Caponata artesanal',         desc: 'Sobre pão rústico tostado.',             foto: 'sf_capon.jpg' },
            { id: 'sf-pasteis',  nome: 'Mini pastéis sortidos',      desc: 'Recheios variados, fritos na hora.',     foto: 'sf_pasteis.jpg' },
            { id: 'sf-dadinho',  nome: 'Dadinho de tapioca',         desc: 'Com geleia de pimenta.',                 foto: 'sf_dadinho.jpg' }
          ]
        },
        {
          id: 'frios',
          numero: '05',
          nome: 'Mesa de frios',
          olho: 'Bloco 05 · Prato principal',
          descricao: 'Queijos, embutidos e pastas. Escolha a versão.',
          preco: { modo: 'pessoa', porItem: true },
          foto: 'cat_frios2.jpg',
          regra: 'escolha',
          escolha: { min: 1, max: 1 },
          proposta: {
            formato: 'hero',
            olho: 'O cardápio',
            h1: 'Mesa', script: 'de frios',
            lead: 'Queijos, embutidos e pastas, montados na mesa para o evento inteiro.',
            selo: 'Versão {item}'
          },
          itens: [
            {
              id: 'frios-essencial', nome: 'Essencial', tag: 'Opção 1', foto: 'cat_frios1.jpg',
              desc: 'Queijos, presunto, pastas e pães.',
              inclui: [
                'Mussarela, prato e minas', 'Presunto fatiado',
                'Pastas de azeitona e tomate seco', 'Babaganoush', 'Pães variados'
              ]
            },
            {
              id: 'frios-completa', nome: 'Completa', tag: 'Opção 2', foto: 'cat_frios2.jpg',
              desc: 'Tábua ampliada, com embutidos, frutas e castanhas.',
              inclui: [
                'Mussarela, prato, minas e provolone', 'Presunto, copa lombo e salaminho',
                'Linguiça acebolada e dadinhos', 'Pastas, babaganoush e geleias',
                'Frutas, castanhas e pães artesanais'
              ]
            }
          ]
        }
      ]
    },

    /* --------------------------------------------------------------- BEBIDAS */
    {
      id: 'bebidas',
      nome: 'Bebidas',
      olho: 'A composição do evento',
      titulo: { pre: 'O que tem', script: 'para beber' },
      blocos: [
        {
          id: 'chopp',
          numero: '06',
          nome: 'Chopp na torneira',
          olho: 'Bebidas · Chopp',
          descricao: 'Gelado, direto do barril, durante todo o evento.',
          /* vendido por barril; o preço do bloco (por litro) só entra quando
             a marca/barril não tem preço, e nos orçamentos antigos em litros */
          preco: { modo: 'barril', porItem: true },
          foto: 'cat_chopp.jpg',
          regra: 'barris',
          escolha: { min: 1, max: 3 },
          barris: [
            { id: '30', litros: 30, rotulo: 'Barril 30 L' },
            { id: '50', litros: 50, rotulo: 'Barril 50 L' }
          ],
          proposta: {
            formato: 'meia',
            olho: 'No bar',
            h1: '{litros} litros', script: 'de chopp',
            selo: '{litros} litros · incluso',
            titulo: 'Chopp {marcas} na torneira',
            texto: 'Chopp gelado, puxado direto da torneira, disponível para os convidados durante todo o evento.',
            checklist: [
              '{barris} · {litros} litros à disposição durante o evento',
              'Servido sempre gelado, direto da torneira',
              'Equipe de bar cuidando da torneira do início ao fim'
            ]
          },
          itens: [
            { id: 'chopp-brahma',   nome: 'Brahma' },
            { id: 'chopp-amstel',   nome: 'Amstel' },
            { id: 'chopp-heineken', nome: 'Heineken' }
          ]
        },
        {
          id: 'drinks',
          numero: '07',
          nome: 'Bar de drinks',
          olho: 'Bebidas · Bar',
          descricao: 'Preparados na hora pela equipe de bar, em open bar durante todo o evento.',
          preco: { modo: 'pessoa', porItem: false },
          foto: 'cat_drinks.jpg',
          regra: 'completo',
          proposta: {
            formato: 'meia',
            olho: 'Open bar',
            h1: 'Drinks', script: 'à vontade',
            selo: 'Open bar · à vontade',
            titulo: 'Bar de drinks',
            texto: 'Drinks clássicos, preparados na hora pela equipe de bar, à vontade durante todo o evento.'
          },
          itens: [
            { id: 'dk-caipirinha', nome: 'Caipirinha' },
            { id: 'dk-caipivodka', nome: 'CaipiVodka' },
            { id: 'dk-gintonica',  nome: 'Gin-tônica' },
            { id: 'dk-aperol',     nome: 'Aperol Spritz' },
            { id: 'dk-mule',       nome: 'Moscow Mule' }
          ]
        },
        {
          id: 'naoalc',
          numero: '08',
          nome: 'Sem álcool',
          olho: 'Bebidas · Sem álcool',
          descricao: 'Refrigerantes, água e sucos liberados durante todo o evento.',
          preco: { modo: 'pessoa', porItem: false },
          foto: 'cat_naoalc.jpg',
          regra: 'completo',
          proposta: {
            formato: 'meia',
            olho: 'Sem álcool',
            h1: 'Refrigerante, água', script: 'e sucos',
            selo: 'Sem álcool · à vontade',
            titulo: 'Bebidas não alcoólicas',
            texto: 'Para quem prefere sem álcool, liberadas à vontade durante todo o evento.'
          },
          itens: [
            { id: 'na-coca',    nome: 'Coca-Cola e zero' },
            { id: 'na-guarana', nome: 'Guaraná e zero' },
            { id: 'na-agua',    nome: 'Água com e sem gás' },
            { id: 'na-sucos',   nome: 'Sucos variados' }
          ]
        }
      ]
    },

    /* ---------------------------------------------------------------- EXTRAS */
    {
      id: 'extras',
      nome: 'Extras',
      olho: 'A composição do evento',
      titulo: { pre: 'Para completar', script: 'a noite' },
      blocos: [
        {
          id: 'musica',
          numero: '09',
          nome: 'Música ao vivo',
          olho: 'Extras',
          descricao: 'Repertório e cronograma acertados de acordo com o clima da noite.',
          /* cachê fechado do evento, não por pessoa */
          preco: { modo: 'evento', porItem: true },
          foto: 'cat_musica1.jpg',
          regra: 'escolha',
          escolha: { min: 1, max: 1 },
          proposta: {
            formato: 'hero',
            olho: 'Extras',
            h1: 'Música', script: 'ao vivo',
            lead: 'Repertório e cronograma acertados de acordo com o clima que você quer para a noite.',
            selo: 'Extra · {item}'
          },
          itens: [
            { id: 'mus-banda',  nome: 'Banda ao vivo',  desc: 'Formação completa, com repertório combinado.', foto: 'cat_musica1.jpg' },
            { id: 'mus-violao', nome: 'Voz e violão',   desc: 'Clima intimista para receber e conversar.',    foto: 'cat_musica2.jpg' }
          ]
        }
      ]
    }
  ]
};

/* Acesso rápido: índice id -> bloco / item */
window.BREW_INDICE = (function () {
  var blocos = {}, itens = {}, catDoBloco = {};
  window.BREW_CATALOGO.categorias.forEach(function (cat) {
    cat.blocos.forEach(function (bloco) {
      blocos[bloco.id] = bloco;
      catDoBloco[bloco.id] = cat.id;
      (bloco.itens || []).forEach(function (item) { itens[item.id] = item; });
    });
  });
  return { blocos: blocos, itens: itens, categoriaDoBloco: catDoBloco };
})();
