/* Testes do motor de preços — rodar com:  node --test testes/*.test.mjs
   Carrega os scripts do painel (que são de navegador) num contexto isolado
   e confere as regras de cálculo contra a tabela de set/2026. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ctx = { window: {} };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of ['catalogo', 'precos', 'proposta']) {
  vm.runInContext(fs.readFileSync(new URL(`assets/${f}.js`, raiz), 'utf8'), ctx, { filename: f + '.js' });
}
const BREW = ctx.window.BREW;
const tabela = JSON.parse(fs.readFileSync(new URL('testes/tabela-set-2026.json', raiz), 'utf8'));

function precos(extra) {
  const p = BREW.adotarPrecos(tabela);
  p.arredondamento = 'nenhum';
  return Object.assign(p, extra || {});
}

/* estado mínimo: { petiscos: ['pet-x', ...], chopp: { 'chopp-heineken': { 50: 2 } } } */
function estado(blocos, convidados = 50, extra = {}) {
  const e = { evento: { convidados }, taxaServico: { ativa: false }, blocos: {} };
  for (const [id, sel] of Object.entries(blocos)) {
    const b = { ativo: true, itens: {}, variacoes: {}, barris: {} };
    if (Array.isArray(sel)) sel.forEach((i) => { b.itens[i] = true; });
    else if (id === 'chopp') b.barris = sel;
    else Object.assign(b, sel);
    e.blocos[id] = b;
  }
  return Object.assign(e, extra);
}

const linha = (r, id) => r.linhas.find((l) => l.bloco.id === id);
const PET_BARATOS = ['pet-polenta', 'pet-batata', 'pet-aipim', 'pet-caponata', 'pet-croquete', 'pet-frango'];

/* ------------------------------------------------------------- petiscos */

test('petiscos: soma 57,40 cai na faixa Essencial (59,90)', () => {
  const r = BREW.precificar(estado({ petiscos: PET_BARATOS }), precos());
  assert.equal(linha(r, 'petiscos').unit, 59.9);
});

test('petiscos: soma exatamente no teto fica na faixa (59,90 -> 59,90)', () => {
  const p = precos();
  p.tabela['pet-frango'] = [{ ate: null, valor: 14.4 }];   /* 8,90×4 + 9,90 + 14,40 = 59,90 */
  const r = BREW.precificar(estado({ petiscos: PET_BARATOS }), p);
  assert.equal(linha(r, 'petiscos').unit, 59.9);
});

test('petiscos: faixas Ideal e Premium', () => {
  const ideal = ['pet-polenta', 'pet-batata', 'pet-aipim', 'pet-caponata', 'pet-pasteis', 'pet-torresmo'];
  /* 8,90×4 + 12,90×2 = 61,40 */
  assert.equal(linha(BREW.precificar(estado({ petiscos: ideal }), precos()), 'petiscos').unit, 69.9);
  const premium = ['pet-pasteis', 'pet-torresmo', 'pet-bacalhau', 'pet-texasbbq', 'pet-linguica', 'pet-croquete'];
  /* 12,90×5 + 9,90 = 74,40 */
  assert.equal(linha(BREW.precificar(estado({ petiscos: premium }), precos()), 'petiscos').unit, 79.9);
});

test('petiscos: acima de 79,90 cobra a própria soma (especial)', () => {
  const todos = BREW_itens('petiscos');
  const r = BREW.precificar(estado({ petiscos: todos }), precos());
  /* 12 itens: 12,90×5 + 11,90×2 + 9,90 + 8,90×4 = 133,80 */
  assert.equal(linha(r, 'petiscos').unit, 133.8);
});

/* --------------------------------------------------------------- classics */

test('Brew Classics: média dos dois pratos', () => {
  const casos = [
    [['bc-linguado', 'bc-mignon'], 81.95],
    [['bc-mignon', 'bc-oswaldo'], 79.9],
    [['bc-mignon', 'bc-shrimp'], 84.45],
    [['bc-linguado', 'bc-shrimp'], 86.5]
  ];
  for (const [itens, esperado] of casos) {
    const r = BREW.precificar(estado({ classics: itens }), precos());
    assert.equal(linha(r, 'classics').unit, esperado, itens.join(' + '));
  }
});

test('Brew Classics: prato sem preço próprio usa o preço do bloco na média', () => {
  const p = precos();
  p.tabela['bc-shrimp'] = [{ ate: null, valor: 0 }];   /* cai no bloco: 89 */
  const r = BREW.precificar(estado({ classics: ['bc-linguado', 'bc-shrimp'] }), p);
  assert.equal(linha(r, 'classics').unit, 86.5);
});

/* --------------------------------------------------- buffet, finger, frios */

test('buffet: a variação da carne define o preço', () => {
  const r = BREW.precificar(estado({
    buffets: { itens: { 'buf-steakhouse': true }, variacoes: { 'buf-steakhouse': 'Fraldinha' } }
  }), precos());
  assert.equal(linha(r, 'buffets').unit, 79.9);
  const p = BREW.precificar(estado({ buffets: ['buf-parrilla'] }), precos());
  assert.equal(linha(p, 'buffets').unit, 99);
});

test('finger food e mesa de frios por pessoa', () => {
  const r = BREW.precificar(estado({ finger: BREW_itens('finger'), frios: ['frios-completa'] }), precos());
  assert.equal(linha(r, 'finger').unit, 110);
  assert.equal(linha(r, 'frios').unit, 89.9);
});

/* ------------------------------------------------------------------ drinks */

test('drinks: faixa por convidados', () => {
  const casos = [[20, 75], [21, 49.9], [40, 49.9], [60, 45], [80, 43], [100, 40], [160, 40]];
  for (const [conv, valor] of casos) {
    const r = BREW.precificar(estado({ drinks: BREW_itens('drinks') }, conv), precos());
    assert.equal(linha(r, 'drinks').unit, valor, conv + ' convidados');
  }
});

test('drinks: acima de 160 convidados é sob consulta (sem preço + pendência)', () => {
  const r = BREW.precificar(estado({ drinks: BREW_itens('drinks') }, 161), precos());
  assert.equal(linha(r, 'drinks').semPreco, true);
  assert.equal(r.temPreco, false);
  assert.match(r.pendencias.join(' '), /sob consulta/);
});

/* ------------------------------------------------------------------- chopp */

test('chopp: preço por barril de cada marca (tabela do PDF)', () => {
  const casos = [
    [{ 'chopp-brahma': { 30: 1 } }, 800],
    [{ 'chopp-brahma': { 50: 1 } }, 1200],
    [{ 'chopp-amstel': { 30: 1 } }, 800],
    [{ 'chopp-amstel': { 50: 1 } }, 1200],
    [{ 'chopp-heineken': { 30: 1 } }, 900],
    [{ 'chopp-heineken': { 50: 2 } }, 2800],
    [{ 'chopp-heineken': { 50: 1 }, 'chopp-brahma': { 30: 1 } }, 2200]
  ];
  for (const [barris, total] of casos) {
    const r = BREW.precificar(estado({ chopp: barris }), precos());
    assert.equal(linha(r, 'chopp').subtotal, total, JSON.stringify(barris));
  }
});

test('chopp: litros e texto da proposta saem dos barris', () => {
  const e = estado({ chopp: { 'chopp-heineken': { 50: 2 }, 'chopp-brahma': { 30: 1 } } });
  const comp = BREW.compor(e);
  const l = comp.categorias[0].blocos[0];
  assert.equal(l.litros, 130);
  assert.equal(BREW.marcasDoChopp(l), 'Brahma e Heineken');
  assert.equal(BREW.barrisDoChopp(l), '2 barris de 50 L + 1 barril de 30 L');
  assert.equal(BREW.rotuloCobranca(l), 'Chopp Brahma e Heineken — 130 litros');
});

test('chopp: entra dividido na média por pessoa', () => {
  const r = BREW.precificar(estado({ naoalc: BREW_itens('naoalc'), chopp: { 'chopp-heineken': { 50: 1 } } }, 50), precos());
  /* 24 + 1400/50 = 52 */
  assert.equal(r.pacotes[0].media, 52);
});

test('chopp: orçamento antigo só com litros usa o preço por litro', () => {
  const e = estado({ chopp: {} });
  e.blocos.chopp.litros = 50;
  const r = BREW.precificar(e, precos());
  assert.equal(linha(r, 'chopp').subtotal, 50 * 24);
});

test('chopp: ligado sem barril vira pendência', () => {
  const comp = BREW.compor(estado({ chopp: {} }));
  assert.match(comp.avisos.map((a) => a.texto).join(' '), /barris/);
});

/* ----------------------------------------------------- sem álcool, música */

test('sem álcool: R$ 24 por pessoa', () => {
  const r = BREW.precificar(estado({ naoalc: BREW_itens('naoalc') }, 80), precos());
  assert.equal(linha(r, 'naoalc').subtotal, 80 * 24);
});

test('música: valor fechado do evento, não por pessoa', () => {
  const r = BREW.precificar(estado({ musica: ['mus-banda'] }, 50), precos());
  assert.equal(linha(r, 'musica').subtotal, 2000);
  assert.equal(r.pacotes[0].media, 40);
  const v = BREW.precificar(estado({ musica: ['mus-violao'] }, 50), precos());
  assert.equal(v.pacotes[0].media, 8);
});

test('música opcional forma o 2º pacote, separada da comida', () => {
  const e = estado({ buffets: ['buf-parrilla'], musica: { itens: { 'mus-banda': true }, opcional: true } }, 50);
  const r = BREW.precificar(e, precos());
  assert.equal(r.pacotes.length, 2);
  assert.equal(r.pacotes[0].media, 99);
  assert.equal(r.pacotes[1].media, 139);
});

/* ------------------------------------------------------------------ equipe */

test('equipe: R$ 120 a cada 20 convidados, fração conta inteira', () => {
  const casos = [[1, 120], [20, 120], [21, 240], [40, 240], [41, 360], [60, 360], [61, 480], [80, 480]];
  for (const [conv, total] of casos) {
    const r = BREW.precificar(estado({ finger: BREW_itens('finger') }, conv, { taxaServico: { ativa: true, tipo: 'equipe', valor: 10 } }), precos());
    assert.equal(linha(r, 'equipe').subtotal, total, conv + ' convidados');
  }
});

test('serviço desligado: nem equipe nem taxa', () => {
  const r = BREW.precificar(estado({ finger: BREW_itens('finger') }, 50), precos());
  assert.equal(linha(r, 'equipe'), undefined);
  assert.equal(r.pacotes[0].media, 110);
});

test('serviço pela equipe (padrão) não soma os 10%', () => {
  const e = estado({ finger: BREW_itens('finger') }, 50, { taxaServico: { ativa: true, tipo: 'equipe', valor: 10 } });
  const r = BREW.precificar(e, precos());
  /* 110 + (3 × 120) / 50 = 117,20 — sem taxa por cima */
  assert.equal(r.pacotes[0].taxa, null);
  assert.ok(Math.abs(r.pacotes[0].media - 117.2) < 1e-9);
});

test('serviço em 10%: sem a linha da equipe', () => {
  const e = estado({ finger: BREW_itens('finger') }, 50, { taxaServico: { ativa: true, tipo: 'percentual', valor: 10 } });
  const r = BREW.precificar(e, precos());
  assert.equal(linha(r, 'equipe'), undefined);
  assert.ok(Math.abs(r.pacotes[0].media - 121) < 1e-9);
});

/* --------------------------------------------------------- conta completa */

test('evento completo: média, taxa, arredondamento e total', () => {
  const e = estado({
    petiscos: PET_BARATOS,                                    /* 59,90 */
    classics: ['bc-linguado', 'bc-mignon'],                   /* 81,95 */
    drinks: BREW_itens('drinks'),                             /* 45,00 (60 pessoas) */
    naoalc: BREW_itens('naoalc'),                             /* 24,00 */
    chopp: { 'chopp-heineken': { 50: 2 } },                   /* 2800 / 60 */
    musica: ['mus-violao']                                    /* 400 / 60 */
  }, 60, { taxaServico: { ativa: true, tipo: 'percentual', valor: 10 } });
  const p = precos({ arredondamento: 'inteiro' });
  const r = BREW.precificar(e, p);
  const pessoa = 59.9 + 81.95 + 45 + 24;
  const fechado = 2800 + 400;                                 /* chopp + música (serviço em 10%) */
  const sub = pessoa + fechado / 60;
  const pac = r.pacotes[0];
  assert.ok(Math.abs(pac.subtotal - sub) < 1e-9);
  assert.ok(Math.abs(pac.mediaCrua - sub * 1.1) < 1e-9);
  assert.equal(pac.media, Math.ceil(sub * 1.1));
  assert.equal(pac.total, pac.media * 60);
  assert.equal(r.temPreco, true);
});

test('tabela antiga sem as chaves novas ganha os padrões (barris, faixas, equipe)', () => {
  const p = BREW.adotarPrecos(tabela);
  assert.equal(p.tabela['chopp-heineken::Barril 50 L'][0].valor, 1400);
  assert.equal(p.tabela['petiscos#faixas'].length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(p.equipe)), { valor: 120, aCada: 20 });
  /* e o que a tabela salva traz continua valendo */
  assert.equal(p.tabela['bc-linguado'][0].valor, 84);
});

function BREW_itens(bloco) {
  return ctx.window.BREW_INDICE.blocos[bloco].itens.map((i) => i.id);
}

test('serviço pela equipe não cobra nada sem bloco escolhido', () => {
  const r = BREW.precificar(estado({}, 80, { taxaServico: { ativa: true, tipo: 'equipe', valor: 10 } }), precos());
  assert.equal(r.linhas.length, 0);
  assert.equal(r.pacotes[0].media, 0);
});
