# Brew Bar·B·Q Pub — Painel de eventos

Etapa **interna** do sistema de eventos: o cliente já escolheu os blocos no
cardápio; aqui o gestor transforma essas escolhas em uma **apresentação do
evento** para mandar de volta pra ele.

Esta primeira versão **não trata de preço, pagamento nem condição comercial** —
só monta e apresenta o que foi contratado.

## Como usar

Abra `painel.html` no navegador (duplo clique já funciona — não precisa de
servidor, internet nem instalação). Chrome ou Edge.

O painel tem 4 etapas:

| # | Etapa | O que faz |
|---|---|---|
| 1 | **Evento** | Nome do cliente, ocasião, data, convidados (+ local, nº da proposta e textos de capa/encerramento, opcionais). |
| 2 | **Seleção** | Liga os blocos que o cliente escolheu e ajusta item a item dentro de cada bloco. |
| 3 | **Revisão** | Mostra dados + composição num quadro só, e aponta o que está fora das regras do cardápio. |
| 4 | **Apresentação** | As páginas A4 prontas. Botão **Imprimir / Salvar PDF**. |

## Painel online (Vercel)

Publicado, o painel pede a **senha de administrador** e salva tudo na conta:
tabela de preços e orçamentos. Abre igual no celular e no computador.

- **Orçamentos** (botão no topo) — lista dos salvos, busca, abrir, excluir e
  "+ Novo orçamento". Cada mudança é salva sozinha em ~1 segundo; o pontinho
  verde na barra de baixo mostra "Salvo na nuvem".
- **Gerar PDF** (etapa 4) — monta o PDF no próprio aparelho. No celular aparece
  "Compartilhar" para mandar direto no WhatsApp.
- **Migrar o que já existe**: em *Preços → Abrir tabela…* dá para escolher a
  tabela salva no computador (ou qualquer proposta `.json` antiga, que traz a
  tabela junto). Em *Orçamentos → Importar arquivo .json*, cada proposta antiga
  vira um orçamento na conta.
- A tabela de preços é uma só para a conta. Abrir um orçamento antigo usa a
  tabela **atual** (a cópia salva junto com o orçamento fica só de registro).

Como funciona por dentro:

```
api/login.js        POST  senha -> token de sessão (30 dias; 10 erros = trava 15 min)
api/precos.js       GET/PUT a tabela de preços
api/orcamentos.js   GET lista · GET ?id · POST salvar · DELETE ?id
api/_lib.js         banco (Upstash Redis via REST) e assinatura do token
```

Variáveis de ambiente na Vercel:

| Variável | O que é |
|---|---|
| `ADMIN_PASSWORD` | a senha de acesso — trocar ela derruba todas as sessões |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | criadas sozinhas ao conectar o Upstash Redis |

Aberto como arquivo (duplo clique no `painel.html`), o painel continua
funcionando só no navegador daquele computador, sem login — como antes.

**Testar sem publicar:** `_teste-nuvem.html` (fica fora do Git) roda o painel com
o código real das funções e um Redis falso no navegador. Precisa ser servido
por http (ex.: `cardapio-digital/ferramentas/servir.ps1` apontado para esta
pasta); a senha de teste está no próprio arquivo.

## O cardápio do cliente

É o PDF em formato celular que o cliente recebe para escolher. Fica em
`cardapio/`: edite `cardapio.html` e rode `gerar-pdf.ps1` (botão direito >
"Executar com PowerShell") — ele usa o Edge que já vem no Windows e gera
`Brew_Cardapio_Eventos.pdf` na mesma pasta. Ao mudar um item, mude também em
`assets/catalogo.js` para o painel continuar batendo com o cardápio.

## A tabela de preços

Fica no botão **Tabela de preços**, no canto do topo. Ela é do **restaurante**,
não da proposta: vale para todos os orçamentos, é salva separada e **não some**
quando você clica em "Nova proposta".

- Tudo é **por pessoa**, menos o **chopp**, que é **por litro**.
- Cada preço pode ter **faixas por volume**:
  `até 20 pessoas R$ 40 · até 40 R$ 35 · acima disso R$ 30`.
  Clique em **+ faixa** para acrescentar. A última faixa é sempre o "acima de".
  No chopp as faixas são por litro (`até 30 litros R$ 30/litro…`).
- Dentro de um bloco valem três níveis, do mais específico para o mais geral:

  | Nível | Exemplo | Quando usar |
  |---|---|---|
  | Variação | Brew Steakhouse · Fraldinha | a carne muda o preço |
  | Opção | Parrilla Brew | cada buffet custa diferente |
  | Bloco | Os buffets | preço único, sem distinção |

  O painel usa o primeiro que estiver preenchido. Se um bloco de escolha tiver
  mais de uma opção marcada (Brew Classics), **a mais cara define o preço**.

**Arredondamento** — a média por pessoa sai quebrada quando entra chopp na
conta, então o painel arredonda por uma regra sua: real cheio, terminar em ,90
ou dezena. O total é sempre `média arredondada × convidados`, que é como os
orçamentos antigos fecham em números redondos.

**Taxa de serviço** — fica na **etapa de revisão** (não na tabela de preços:
é por proposta, não do restaurante). Já vem **ligada em 10%**, e dá pra trocar
o tipo pra **valor fixo por pessoa** em R$ em vez de percentual, ou desligar de
vez. Ela soma no valor por pessoa antes do arredondamento — não é uma linha
separada na conta do cliente.

**Como a conta fecha:**

```
subtotal         = (soma dos preços por pessoa) + (chopp ÷ convidados)
+ taxa de serviço (% do subtotal, ou fixo por pessoa)
= média por pessoa (arredondada)
total            = média arredondada × convidados
```

**Dois pacotes** — na etapa de seleção, todo bloco ligado ganha um botão
"No pacote base". Clicando nele o bloco vira **opcional**: sai do pacote base e
forma um segundo pacote ("Padrão" × "Com música ao vivo"), do mesmo jeito que
os orçamentos do Sindgraf e do Sindanf apresentam a música.

Preço por item **nunca** aparece para o cliente — a página de valor mostra só a
média por pessoa, o que está incluso e o total, como nos orçamentos antigos.
A taxa de serviço **some dentro do valor por pessoa**: nem uma nota avisando
que ela está incluída aparece na apresentação. O **valor por pessoa é o número
grande**, na cor de destaque; o **total** é de propósito bem discreto, pequeno
e apagado — só confirma, quem convence é o valor por pessoa.
A **Salvar tabela / Abrir tabela** exporta e importa a tabela em `.json`, e cada
proposta salva leva junto uma cópia da tabela usada, para que reabrir um
orçamento antigo mostre os mesmos números.

Sem preço preenchido, a revisão aponta bloco por bloco e a **página de valores
simplesmente não é gerada** — a apresentação sai sem preço, como na primeira
versão. Dá para desligar essa página a qualquer momento na etapa de revisão.

### O formato da apresentação
Segue o padrão dos orçamentos individuais já entregues (os PDFs em
`referencia/orcamentos/`): **capa + uma seção por página**.

- **Capa** — logo, ocasião e cliente em display, uma linha-resumo montada
  automaticamente com o que foi escolhido, e a faixa de selos
  (convidados · data · local · nº da proposta).
- **Uma página por bloco** — olho em dourado, título display com o remate em
  script, lead, e o conteúdo em um de três formatos:
  - **hero** (buffet, mesa de frios, música): foto grande 16:9 + cartão creme
    com selo, nome e descrição;
  - **zig-zag** (petiscos, Brew Classics, finger food): painel creme com os
    itens numerados, foto e texto alternando de lado;
  - **meia página** (chopp, drinks, sem álcool): cartão creme com foto à
    esquerda e checklist à direita.
- **O valor** — o ★ com a nota de valor fechado e os cartões de pacote: média
  por pessoa em destaque, checklist do que está incluso e o total para o número
  de convidados. Um cartão quando há um pacote só, dois lado a lado quando há
  bloco opcional.
- **Fecho** — "Bora fechar?" e a caixa de contato.

O formato de cada bloco está em `assets/catalogo.js`, no campo `proposta`.

### Gerar o PDF
Na etapa 4, clique em **Imprimir / Salvar PDF** e, na janela do navegador:

- Destino: **Salvar como PDF**
- Margens: **Nenhuma**
- Marque **Gráficos em segundo plano**

Cada folha da tela vira exatamente uma página A4 — a paginação já é calculada
antes de imprimir, então não tem corte no meio de um bloco. Se um bloco tiver
itens demais para caber numa página, ele abre uma segunda com "· continuação".

### Salvar o trabalho
- O painel **salva sozinho** no navegador: se fechar e abrir de novo, a proposta
  continua lá.
- **Salvar arquivo** baixa um `.json` da proposta (`Brew_Proposta_Cliente_data.json`).
  Serve pra guardar o histórico e pra reabrir depois em **Abrir…**.
- **Nova proposta** zera tudo pra começar outro cliente.

## As regras do cardápio

O painel conhece as regras dos blocos fechados e avisa quando você sai delas,
mas **não bloqueia** — quem decide é o gestor:

- Bloco 02 · Os buffets → escolha 1 (o Brew Steakhouse ainda pede a carne)
- Bloco 03 · Brew Classics → escolha 2
- Bloco 05 · Mesa de frios → Essencial ou Completa
- Bloco 09 · Música → banda ou voz e violão
- Bloco 01 · Petiscos → 12 opções, **escolha no mínimo 6** (o cliente anota os
  números na ficha do cardápio; menos de 6 vira pendência na revisão)
- Blocos completos (finger food, drinks, sem álcool) vêm inteiros,
  mas dá pra desmarcar um item pontual
- Prato principal → o cardápio prevê 1 entre os blocos 02–05; mais de um vira
  aviso de "confirme se é intencional"

## Arquivos

```
painel.html              o painel (é por aqui que se começa)
assets/
  catalogo.js            OS BLOCOS E ITENS — é aqui que se mexe no cardápio
  precos.js              faixas de preço, resolução por nível e motor de cálculo
  proposta.js            composição das escolhas + montagem/paginação das folhas A4
  app.js                 as 4 etapas, seleção, revisão, salvar/abrir
  brew.css               design system (paleta e fontes do cardápio) + folhas A4
  fontes.css             Bevan / Archivo / Space Mono / Yellowtail em base64
  logo.png               selo do Brew
  img/                   as 30 fotos do cardápio
cardapio/
  cardapio.html          O CARDÁPIO QUE O CLIENTE RECEBE (120x210mm, 14 páginas)
  gerar-pdf.ps1          gera Brew_Cardapio_Eventos.pdf pelo Edge — sem Python
  Brew_Cardapio_Eventos.pdf
referencia/
  LEIA-ME.md             contexto do projeto do cardápio
  gerar_cardapio.py      gerador ANTIGO (Python) — desatualizado, use cardapio/
  cardapio.html          o cardápio renderizado
  fonte/                 fontes e logo em base64, como vieram do pacote
  orcamentos/            os 3 orçamentos que serviram de padrão visual
                         (Sindanf, Sindgraf, Casamento Paola)
```

### Mexer no cardápio
Item novo, prato que saiu, foto trocada, regra que mudou: tudo em
`assets/catalogo.js`. O painel e a apresentação se atualizam sozinhos — não
precisa tocar em `app.js` nem em `proposta.js`.

Foto nova: joga o `.jpg` em `assets/img/` e põe o nome do arquivo no item.

Textos da apresentação (olho, título, script, lead, selo, checklist) ficam no
campo `proposta` de cada bloco, no mesmo arquivo. `{item}` vira o nome da opção
escolhida e `{litros}` vira a quantidade de chopp.

### Mexer nos preços pelo código
`assets/precos.js` tem o motor: `BREW.chavesDePreco()` monta as entradas a
partir do catálogo, `BREW.valorNaFaixa()` resolve a faixa e `BREW.precificar()`
devolve os pacotes prontos. Bloco novo no catálogo já nasce com entrada na
tabela — o campo `preco: { modo, porItem }` de cada bloco é o que decide se ele
é por pessoa ou por litro e se aceita preço por opção.

## O que ainda ficou de fora

- **Condições comerciais** — os orçamentos antigos têm uma página final de
  "Como fechamos" (50% na reserva, saldo até o dia, validade). A validade já é
  um campo e aparece na capa; o resto é política sua, não inventei.
- **Desconto / acréscimo manual** na proposta fechada.
- Como no cardápio: sobremesa/bolo, formato de serviço, duração, tipo de
  espaço, política de crianças.
