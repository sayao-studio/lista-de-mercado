# Lista de mercado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site estático no GitHub Pages pra montar a lista de mercado com o
preço de Bistek, Giassi e Angeloni, alimentado por um robô no GitHub Actions
que baixa os catálogos 3x por dia.

**Architecture:** Dois lados que só se falam por JSON em `public/dados/`.
O robô (`robo/`, Node 22) anda na árvore de categorias da loja VTEX de cada
mercado, grava um arquivo por mercado mais `resumo.json`, e o workflow publica
`public/` no Pages sem commitar dado. O site (`public/`, HTML/CSS/JS puro em
ES modules, sem build) carrega os arquivos, indexa em memória, busca por
prefixo, agrupa por EAN, e guarda a lista no `localStorage`.

**Tech Stack:** Node 22 (`node --test`), ES modules, GitHub Actions +
Pages (`actions/configure-pages`, `upload-pages-artifact`, `deploy-pages`),
Playwright 1.63 já instalado em
`~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` (Chromium).

**Spec:** `docs/superpowers/specs/2026-10-31-lista-de-mercado-design.md`

## Global Constraints

- Tudo em português: interface, comentários, nomes de variável e função,
  mensagem de commit, nome de teste. Comentário explica o porquê.
- Mensagem de commit: primeira linha é o efeito pra quem usa; termina com
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Sem build, sem framework, sem dependência npm (nem no robô nem no site).
  `package.json` só com `"type": "module"` e scripts.
- Site em subcaminho (`https://brenisio.github.io/lista-de-mercado/`): toda
  URL em `public/` é relativa (`dados/resumo.json`, `estilo.css`), nunca
  começa com `/`.
- Limites da VTEX: página `_to - _from ≤ 49`; `_from ≤ 2500`; categoria só
  com caminho completo `fq=C:/2/7/10/`; `O=OrderByPriceASC|DESC`; total no
  cabeçalho `resources: 0-49/12994`; resposta normal é HTTP 206.
- `preco` e `promocao` sempre em centavos inteiros; `promocao` é 0 quando não
  há preço "de" maior.
- EAN só é válido se for GTIN-8/12/13/14 com dígito verificador certo, não
  começar com `2` (peso variável) nem com `3000` (código interno do Bistek).
- Orçamento: os três arquivos de mercado somados ≤ 3 MB gzip; busca responde
  em < 100 ms; a lista aparece antes do catálogo carregar.
- Toda tela com preço mostra de quando ele é. Mercado em falha aparece com a
  hora dele e some das contas.
- Conteúdo salvo que não se entende vai pra `lista-de-mercado.backup` antes
  de qualquer migração; nunca se descarta.
- Robô: ~100 ms entre pedidos, timeout 20 s, 3 tentativas com espera
  crescente, `user-agent: Mozilla/5.0 (lista-de-mercado; robo de precos)` (só ASCII: acento no cabeçalho dá HTTP 400 na VTEX),
  prazo de 40 min por mercado.
- Testes unitários não usam rede: `fetch` é injetado.
- Nunca usar o `gh` desta máquina pra este repo; remoto por SSH
  `git@github.com:brenisio/lista-de-mercado.git`.

## Review Focus

1. Categoria sem cabeçalho `resources` (ou valor estranho) — o robô deve
   paginar até vir página vazia (teto 2500) em vez de pular a categoria.
   Teste em Task 3 (`pagina sem cabeçalho resources`).
2. Busca com acento, caixa alta, espaço duplo e termo vazio — "ARROZ  Íntegral"
   acha "Arroz Integral"; vazio devolve lista vazia sem erro. Teste em Task 7.
3. Mesmo EAN com `gramas` diferente ou nulo entre lojas — agrupa num cartão
   só, `gramas` é o primeiro não-nulo, preços comparam por embalagem. Teste
   em Task 7.
4. `localStorage` com lixo, versão futura ou quota estourada — a tela abre,
   o conteúdo vai pro backup e salvar que falha não derruba a tela. Teste em
   Task 9.
5. "Colar lista" com texto que não é nosso (mensagem qualquer do WhatsApp) —
   vira itens de texto, uma linha por linha não vazia, sem travar. Teste em
   Task 8.

---

## Estrutura de arquivos

```
package.json                 "type": "module"; scripts test, test:navegador, robo
.gitignore                   public/dados/ (menos .gitkeep), node_modules/
CLAUDE.md                    como rodar, convenções, armadilhas (curto)
README.md                    o que é, link do site, como roda o robô
robo/mercados.js             MERCADOS (id, nome, site, ignorar)
robo/produto.js              pesoGramas, eanValido, linhasDoProduto, hostFoto
robo/vtex.js                 buscarComRetentativa, arvore, totalDe, paginas, rastrear
robo/publicacao.js           atualizar(): roda os mercados, anterior, resumo, orçamento
robo/catalogo.mjs            CLI: lê argumentos, chama atualizar, log, código de saída
public/index.html            marcação das duas telas, cabeçalho, barra inferior
public/estilo.css            tema claro/escuro, 1 coluna < 900 px, 2 colunas ≥ 900 px
public/formato.js            reais, peso, quandoFoi (puro)
public/busca.js              normalizar, indexar, buscar (puro)
public/lista.js              itens, totais, refrescar, comoTexto, deTexto (puro)
public/armazenamento.js      carregar, salvar, migrar (localStorage injetado)
public/dados.js              carregarResumo, carregarMercado (fetch + Cache API injetados)
public/dom.js                escapar, el, debounce
public/tela-busca.js         renderiza resultados e chips; eventos
public/tela-lista.js         renderiza itens, detalhe, totais, menu; eventos
public/app.js                estado, navegação, carregamento, cabeçalho
public/manifest.webmanifest, icone.svg, 404.html
tests/fixtures/vtex/         arvore-bistek.json, pagina-bistek.json (3 produtos reais)
tests/fixtures/dados/        resumo.json, bistek.json, giassi.json, angeloni.json
tests/*.test.mjs             unitários (node --test tests/*.test.mjs)
tests/servidor.mjs           servidor estático de teste (public/ + fixtures em dados/)
tests/navegador.mjs          Playwright (node --test tests/navegador.mjs)
.github/workflows/atualizar.yml
```

---

### Task 1: Esqueleto do repositório

**Files:**
- Create: `package.json`, `.gitignore`, `public/dados/.gitkeep`, `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm test` = `node --test tests/*.test.mjs`; `npm run test:navegador` =
  `node --test tests/navegador.mjs`; `npm run robo` = `node robo/catalogo.mjs`.

- [ ] **Step 1: `git init` na pasta, branch `main`**

Run: `git init -b main && git status`
Expected: repositório vazio na `main`.

- [ ] **Step 2: Criar `package.json`** com `"name": "lista-de-mercado"`,
  `"private": true`, `"type": "module"`, `"engines": { "node": ">=22" }` e os
  três scripts acima. Sem dependências.

- [ ] **Step 3: Criar `.gitignore`** com `node_modules/`, `public/dados/*`,
  `!public/dados/.gitkeep`. Criar `public/dados/.gitkeep` vazio.

- [ ] **Step 4: Escrever `CLAUDE.md`** (≤ 60 linhas): o que é o projeto; o
  desenho e o plano em `docs/superpowers/`; como rodar testes, robô e
  navegador; as convenções da seção "Global Constraints" deste plano; o
  aviso de que a API VTEX não é oficial; remoto por SSH, nunca `gh`.

- [ ] **Step 5: Atualizar `README.md`**: manter o que já está (ideia e o que
  se sabe), acrescentar "Como funciona" (robô + Pages, 3x/dia), "Rodar na
  máquina" (`npm test`, `npm run robo -- --saida public/dados --limite 2`, e
  servir `public/` com `python3 -m http.server`) e o link previsto
  `https://brenisio.github.io/lista-de-mercado/`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Começa o repositório da lista de mercado

Esqueleto, desenho e plano. Sem código ainda.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Leitura de um produto VTEX (`robo/produto.js`)

**Files:**
- Create: `robo/produto.js`, `tests/fixtures/vtex/pagina-bistek.json`
- Test: `tests/produto.test.mjs`

**Interfaces:**
- Produces:
  - `pesoGramas(nome: string): number | null` — copiado de
    `../esfirraria/functions/_lib/mercados.js` com nota de origem.
  - `eanValido(ean: unknown): boolean`.
  - `hostFoto(produtoVtex): string | null` — `"https://bistek.vteximg.com.br/arquivos/ids/"` a partir da primeira imagem.
  - `linhasDoProduto(produtoVtex): Linha[]` com
    `Linha = { id: string, nome: string, marca: string, ean: string, gramas: number|null, granel: boolean, preco: number, promocao: number, foto: string, link: string }`
    (uma por SKU com `AvailableQuantity > 0` e `Price > 0`; `foto` é só o
    id numérico da imagem, `""` sem imagem; `link` é o `linkText`).

- [ ] **Step 1: Gravar a fixture** com 3 produtos reais do Bistek (um comum
  com promoção, um granel, um sem peso no nome):

Run:
```bash
mkdir -p tests/fixtures/vtex && curl -s "https://www.bistek.com.br/api/catalog_system/pub/products/search?ft=banana&_from=0&_to=39" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);
const granel=p.find(x=>x.items[0].measurementUnit==="kg");
const promo=p.find(x=>{const o=x.items[0].sellers[0].commertialOffer;return o.ListPrice>o.Price});
const semPeso=p.find(x=>!/\d\s*(g|kg|ml|l)\b/i.test(x.productName)&&x.items[0].measurementUnit==="un");
require("fs").writeFileSync("tests/fixtures/vtex/pagina-bistek.json",JSON.stringify([promo,granel,semPeso].filter(Boolean),null,1))})'
node -e 'const p=require("./tests/fixtures/vtex/pagina-bistek.json");console.log(p.length, p.map(x=>x.productName+" | "+x.items[0].measurementUnit+" "+x.items[0].unitMultiplier+" | "+x.items[0].ean))'
```
Expected: 3 produtos impressos (um `kg`, um com `ListPrice > Price`, um sem
peso). Se "banana" não der os três, troque o termo (`carne`, `queijo`) até
dar. A fixture fica pura (JSON da loja como veio); qual produto é qual vai
em comentário no teste.

- [ ] **Step 2: Escrever os testes que falham** em `tests/produto.test.mjs`
  (`import { test } from "node:test"; import assert from "node:assert/strict"`):

```js
test("pesoGramas lê kg, g, ml, kit 2x e nome sem peso", () => {
  assert.equal(pesoGramas("Arroz Tio João 5kg"), 5000);
  assert.equal(pesoGramas("Óleo de Soja Liza 900ml"), 900);
  assert.equal(pesoGramas("Kit 2x 400g"), 800);
  assert.equal(pesoGramas("Banana Caturra Kg"), 1000);
  assert.equal(pesoGramas("Mamão Papaia Unid."), null);
});
test("eanValido aceita GTIN com dígito certo e recusa interno", () => {
  assert.equal(eanValido("7896436100642"), true);
  assert.equal(eanValido("7896436100641"), false);   // dígito errado
  assert.equal(eanValido("8727"), false);             // código interno Giassi
  assert.equal(eanValido("82"), false);               // código interno Angeloni
  assert.equal(eanValido("3000030705309"), false);    // interno Bistek, dígito bate
  assert.equal(eanValido("2000000000008"), false);    // peso variável
  assert.equal(eanValido("40170725"), true);          // GTIN-8
  assert.equal(eanValido(""), false); assert.equal(eanValido(null), false);
});
test("linhasDoProduto: promoção em centavos, granel por passo, sem estoque fora", () => { /* usa a fixture: confere preco, promocao, gramas, granel, foto numérica, link; SKU com AvailableQuantity 0 (edite uma cópia em memória) é ignorado */ });
test("hostFoto tira o host da primeira imagem", () => { assert.equal(hostFoto(fixture[0]), "https://bistek.vteximg.com.br/arquivos/ids/"); });
```

Os valores esperados do terceiro teste vêm da fixture: calcule à mão
(`Math.round(Price*100)`; granel: `Math.round(Price*unitMultiplier*100)` e
`gramas = Math.round(unitMultiplier*1000)`) e escreva os números literais no
teste.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/produto.test.mjs`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar `robo/produto.js`** com as quatro funções.
  `eanValido`: só dígitos, tamanho 8/12/13/14, dígito verificador GS1 (pesos
  3,1,3,1… da direita pra esquerda sobre o corpo), e recusa prefixo `2` e
  prefixo `3000`. `foto`: `/arquivos\/ids\/(\d+)/` na `imageUrl`.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/produto.test.mjs`
Expected: PASS, 4 testes.

- [ ] **Step 6: Commit**

```bash
git add robo/produto.js tests/produto.test.mjs tests/fixtures/vtex/pagina-bistek.json
git commit -m "Lê um produto da loja VTEX: preço, promoção, peso e EAN válido

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Andar na loja VTEX (`robo/vtex.js`)

**Files:**
- Create: `robo/vtex.js`, `tests/fixtures/vtex/arvore-bistek.json`
- Test: `tests/vtex.test.mjs`

**Interfaces:**
- Consumes: `linhasDoProduto`, `hostFoto` (Task 2).
- Produces:
  - `buscarComRetentativa(url, { fazerFetch, esperar, tentativas = 3, timeoutMs = 20000 }): Promise<Response>` — lança `Error("HTTP 503 depois de 3 tentativas")` no fim; espera `esperar(500 * 2 ** n)` entre tentativas; `esperar` é injetado (nos testes, `async () => {}`).
  - `arvore(mercado, opcoes): Promise<Categoria[]>` — `GET {site}/api/catalog_system/pub/category/tree/3`.
  - `totalDe(mercado, caminho: number[], opcoes): Promise<number | null>` — `_from=0&_to=0`, lê `resources`; `null` se não vier.
  - `paginas(mercado, caminho, { ordem?: "ASC"|"DESC", ...opcoes }): AsyncGenerator<object[]>` — páginas de 50 até vir vazia ou `_from` passar de 2500.
  - `rastrear(mercado, { fazerFetch, esperar, agora = Date.now, limite = Infinity, prazoMs = 20*60*1000, log = () => {} }): Promise<Rastreio>` com
    `Rastreio = { mercado, nome, site, fotos, atualizadoEm, categorias: string[], produtos: Linha&{categoria:number}[], totalEsperado: number, baixados: number, avisos: string[] }`.
    Lança `ErroRastreio` (classe exportada) quando falha de vez: HTTP fora
    do ar após tentativas, prazo estourado, ou `baixados < 0.3 * totalEsperado`.
  - `caminhoFq(caminho: number[]): string` → `"C:/2/7/10/"`.

- [ ] **Step 1: Gravar a árvore de verdade** (pequena: só 2 departamentos):

Run:
```bash
curl -s "https://www.bistek.com.br/api/catalog_system/pub/category/tree/3" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).filter(c=>["Bebidas","Hortifrúti"].includes(c.name));require("fs").writeFileSync("tests/fixtures/vtex/arvore-bistek.json",JSON.stringify(t,null,1));console.log(t.map(c=>c.id+" "+c.name+" filhos:"+c.children.length))})'
```
Expected: `2 Bebidas filhos:N` e `14 Hortifrúti filhos:M`.

- [ ] **Step 2: Escrever os testes** em `tests/vtex.test.mjs` com um
  `fetchFalso(rotas)` local: recebe um mapa `url → { status, headers, body }`
  ou função, registra `chamadas[]`, devolve `Response`. Cenários:

```js
test("caminhoFq monta o filtro com caminho completo", () => assert.equal(caminhoFq([2,7,10]), "C:/2/7/10/"));
test("buscarComRetentativa tenta 3 vezes e desiste com a mensagem", ...);   // 503,503,503 → rejeita "HTTP 503 depois de 3 tentativas"; 503,206 → ok, 2 chamadas
test("totalDe lê o cabeçalho resources", ...);                              // "0-0/2629" → 2629; sem cabeçalho → null
test("paginas anda de 50 em 50 e para na página vazia", ...);              // 120 produtos → 3 chamadas com _from 0,50,100 e _to 49,99,149; 4ª vazia
test("rastrear sem cabeçalho resources baixa o nó direto até a página vazia", ...);  // Review Focus 1: totalDe null → não desce nem pula: pagina o próprio nó até vir vazia (teto 2500) e não soma em totalEsperado
test("rastrear baixa categoria ≤ 2500 inteira e desce quando passa de 2500", ...);  // árvore fixture: Bebidas com total 3000 → desce nos filhos; Hortifrúti 300 → direto
test("rastrear ignora departamento da lista ignorar e categoria com total 0", ...);
test("rastrear na folha com mais de 2500 baixa ASC e DESC e avisa", ...);  // avisos contém "pode ter ficado buraco"
test("rastrear remove SKU repetido entre categorias", ...);
test("rastrear falha quando baixou menos de 30% do esperado", ...);        // rejects ErroRastreio
test("rastrear falha quando estoura o prazo", ...);                         // agora() avança 21 min → ErroRastreio com /prazo/
test("rastrear respeita o limite de departamentos", ...);                   // limite: 1 → só o primeiro departamento não ignorado
test("rastrear espera entre pedidos", ...);                                 // esperar chamado N-1 vezes com 100
```

`mercado` nos testes: `{ id: "bistek", nome: "Bistek", site: "https://www.bistek.com.br", ignorar: ["Floricultura e Jardim"] }`.
`categorias[i]` é o caminho de nomes `"Bebidas > Refrigerantes > Cola"` e
`produtos[].categoria` é o índice nele.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/vtex.test.mjs`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar `robo/vtex.js`**. Um pedido por vez dentro do
  mercado; `esperar(100)` antes de cada pedido depois do primeiro;
  `AbortSignal.timeout(timeoutMs)` em cada fetch; `r.ok` aceita 206. A
  descida é recursiva: `planejar(no, caminho)` → lista de
  `{ caminho, nomes, total, ordem? }`; depois `paginas` em cada plano.
  `totalEsperado` soma os totais dos planos; `baixados` soma os produtos
  recebidos antes do dedupe; dedupe por `id` (itemId) mantendo o primeiro.
  `atualizadoEm = new Date(agora()).toISOString()`.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/vtex.test.mjs`
Expected: PASS, 13 testes.

- [ ] **Step 6: Commit**

```bash
git add robo/vtex.js tests/vtex.test.mjs tests/fixtures/vtex/arvore-bistek.json
git commit -m "Robô anda na árvore de categorias da loja VTEX e baixa o catálogo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Publicação dos dados e CLI (`robo/publicacao.js`, `robo/catalogo.mjs`, `robo/mercados.js`)

**Files:**
- Create: `robo/mercados.js`, `robo/publicacao.js`, `robo/catalogo.mjs`
- Test: `tests/publicacao.test.mjs`

**Interfaces:**
- Consumes: `rastrear`, `ErroRastreio` (Task 3).
- Produces:
  - `MERCADOS` em `robo/mercados.js`: três objetos `{ id, nome, site, ignorar: string[] }` com a lista `ignorar` do spec (nomes exatos das árvores: Bistek `["Bazar", "Floricultura e Jardim"]`; Giassi `["Eletrônicos", "Vestuário", "Ferramentas", "Lazer", "Papelaria", "Casa", "Festa", "Brinquedos", "Utensílios"]`; Angeloni `["Z: Category", "Bazar", "Cama e Banho", "Eletro", "Esporte e Lazer", "Utilidades Domésticas", "Decoração", "Cestas e Kits"]`).
  - `atualizar({ mercados = MERCADOS, saida, anterior = null, soAnterior = false, limite, rastrearMercado = rastrear, fazerFetch = fetch, esperar, agora = Date.now, log = console.error, fs = node:fs/promises }): Promise<Resumo>` — grava `saida/<id>.json` e `saida/resumo.json`; lança `Error("nenhum mercado com dados")` quando nenhum ficou.
  - `Resumo = { versao: 1, geradoEm, mercados: { [id]: { nome, atualizadoEm, produtos, arquivo: "<id>.json?v=<segundos de atualizadoEm>", erro?: string } } }`.
  - Arquivo do mercado = `Rastreio` sem `totalEsperado/baixados/avisos`, mais `versao: 1`.
  - CLI `robo/catalogo.mjs`: `--saida <dir>` (obrigatório), `--anterior <url>`, `--so-anterior`, `--limite <n>`, `--mercado <id>` (repetível). Código de saída 0 com pelo menos um mercado; 1 sem nenhum. Log em stderr: por mercado "Bistek: 12990 produtos (ok)" ou "Giassi: falhou (HTTP 503…), usando anterior de 30/10 18h" ou "Angeloni: sem dados"; no fim "tamanho gzip: 2,4 MB" e aviso `ACIMA DO ORÇAMENTO de 3 MB` quando passar.

- [ ] **Step 1: Escrever os testes** em `tests/publicacao.test.mjs` com
  `rastrearMercado` falso (devolve `Rastreio` pronto ou lança `ErroRastreio`),
  `fetchFalso` pro `--anterior` e pasta temporária (`fs.mkdtemp`):

```js
test("grava um arquivo por mercado e o resumo com ?v=", ...);               // lê saida/bistek.json e resumo.json; arquivo === "bistek.json?v=1761912300"
test("mercado que falha cai no anterior e mantém o atualizadoEm antigo", ...); // resumo.mercados.giassi.atualizadoEm é o do anterior; sem `erro`
test("mercado que falha sem anterior entra no resumo com erro", ...);     // resumo.mercados.giassi.erro inclui "HTTP 503"; não grava giassi.json
test("soAnterior não rastreia: só baixa os publicados", ...);             // rastrearMercado nunca chamado; 3 fetches
test("lança quando nenhum mercado tem dados", ...);                       // rejects /nenhum mercado/
test("avisa quando os arquivos passam de 3 MB gzip", ...);                // log chamado com /ACIMA DO ORÇAMENTO/ (rastreio falso com 200 mil produtos sintéticos)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/publicacao.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar `robo/mercados.js`, `robo/publicacao.js` e
  `robo/catalogo.mjs`**. Mercados rodam em paralelo (`Promise.allSettled`);
  tamanho com `zlib.gzipSync(JSON.stringify(arquivo)).length`. O CLI só
  traduz argumentos (`node:util` `parseArgs`) e chama `atualizar`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/publicacao.test.mjs`
Expected: PASS, 6 testes.

- [ ] **Step 5: Rodar o robô de verdade, pequeno**

Run: `node robo/catalogo.mjs --saida public/dados --limite 1 --mercado bistek`
Expected: termina com código 0, `public/dados/bistek.json` e `resumo.json`
existem, log mostra "Bistek: N produtos (ok)" com N > 100.

- [ ] **Step 6: Commit**

```bash
git add robo/ tests/publicacao.test.mjs
git commit -m "Robô publica um JSON por mercado e o resumo, caindo no anterior quando a loja falha

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Rastreio completo de verdade (verificação, em segundo plano)

**Files:** nenhum novo. Gera `public/dados/*.json` (fora do git).

- [ ] **Step 1: Rodar o robô inteiro em segundo plano** enquanto as tasks
  seguintes andam:

Run: `node robo/catalogo.mjs --saida public/dados > /tmp/claude-1000/-home-brenosayao-Documents-brenisio-lista-de-mercado/c30ad360-b7f1-4f65-bac8-f20487c75e19/scratchpad/robo.log 2>&1` (em segundo plano)
Expected (quando acabar, ~10–20 min): código 0, os três mercados "(ok)",
"tamanho gzip" ≤ 3 MB. Se passar de 3 MB, acrescentar departamentos à lista
`ignorar` do mercado maior (Angeloni) e registrar no spec; se um mercado
falhar por bloqueio, registrar em `CLAUDE.md` ("Armadilhas") e seguir.

- [ ] **Step 2: Conferir a qualidade dos dados**

Run: `node -e 'const r=JSON.parse(require("fs").readFileSync("public/dados/resumo.json"));console.log(r.mercados);for(const m of Object.keys(r.mercados)){const a=JSON.parse(require("fs").readFileSync("public/dados/"+m+".json"));const semEan=a.produtos.filter(p=>!p.ean).length, semPeso=a.produtos.filter(p=>p.gramas==null).length;console.log(m,a.produtos.length,"sem ean",semEan,"sem peso",semPeso,"granel",a.produtos.filter(p=>p.granel).length)}'`
Expected: Bistek > 8 mil, Giassi > 7 mil, Angeloni > 12 mil; granel > 0 em
cada um. Anotar os números no `README.md` ("testado em 31/10/2026").

---

### Task 6: Formatação (`public/formato.js`)

**Files:**
- Create: `public/formato.js`
- Test: `tests/formato.test.mjs`

**Interfaces:**
- Produces:
  - `reais(centavos: number): string` → `"R$ 11,98"`.
  - `peso(gramas: number | null): string` → `"500 g"`, `"1,5 kg"`, `""` pra null.
  - `quandoFoi(iso: string, agora: Date): string` → `"hoje 12h05"`, `"ontem 18h"`, `"29/10 18h"` (mesmo dia → hoje; dia anterior → ontem; senão dd/mm; hora sempre `HHhMM`, exceto quando MM = 00 → `"18h"`). Fuso: o do navegador.

- [ ] **Step 1: Escrever os testes** (`tests/formato.test.mjs`): um por
  função com os exemplos acima (pra `quandoFoi`, construir `agora` e `iso`
  com `new Date(2026, 9, 31, 14, 0)` local, pra não depender de fuso).

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/formato.test.mjs`.

- [ ] **Step 3: Implementar.** `reais` usa `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` e troca o espaço especial por normal.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `"Formata preço, peso e 'quando foi' em português"`.

---

### Task 7: Índice e busca (`public/busca.js`)

**Files:**
- Create: `public/busca.js`, `tests/fixtures/dados/{resumo,bistek,giassi,angeloni}.json`
- Test: `tests/busca.test.mjs`

**Interfaces:**
- Consumes: formato dos arquivos de mercado (Task 4).
- Produces:
  - `normalizar(s: string): string` — sem acento, minúsculas, espaços únicos, trim.
  - `chaveDe(mercadoId, linha): string` — `ean` válido (não vazio) ou `"<mercado>:<id>"`.
  - `indexar(catalogos: { [id]: ArquivoMercado }): Indice` — `Indice = { grupos: Grupo[], porChave: Map<string, Grupo>, porMercado: Map<"bistek:2013800", Grupo>, mercados: string[] }` com
    `Grupo = { chave, ean, nome, marca, gramas, granel, foto: string|null (URL completa 120x120), categoria, texto: string (normalizar(nome + " " + marca)), ofertas: { [mercadoId]: { id, preco, promocao, link: URL completa `${site}/${link}/p`, nome, gramas } }, menor: number (menor preco), porKg: number|null }`.
    `nome`/`marca`/`foto` vêm do primeiro mercado na ordem dos `catalogos`; `gramas` é o primeiro não-nulo.
  - `buscar(indice, termo: string, { promocao = false, ordem = "relevancia" | "preco" | "porKg", mercados = null }): Grupo[]` — termo vazio → `[]`; cada palavra do termo normalizado tem que ser prefixo de alguma palavra de `texto`; `mercados` (array de ids) filtra grupos que tenham oferta em algum deles; `promocao` filtra grupos com alguma `promocao > 0`. Ordem relevância: `texto` começa pelo termo inteiro primeiro; depois mais mercados; depois `menor` crescente. `preco`: `menor` crescente. `porKg`: `porKg` crescente, nulos no fim.

- [ ] **Step 1: Escrever as fixtures de dados** à mão em
  `tests/fixtures/dados/` (formato da Task 4; 2 produtos por mercado além
  dos compartilhados):
  - `Arroz Tio João 1kg` EAN `7896006700029` nos três (Bistek 1198 com promocao 1399; Giassi 1090; Angeloni 1249; gramas 1000, Giassi com `gramas: null` de propósito — Review Focus 3).
  - `Feijão Carioca Camil 1kg` EAN `7896006711117` em Bistek (899) e Angeloni (849).
  - `Banana Caturra Kg` granel, `ean: ""`, só Bistek: gramas 1000, preco 489, `granel: true`.
  - `Leite Integral Tirol 1L` EAN `7896043400012` só Angeloni, 549.
  - `Café Melitta 500g` EAN `7891021006729` só Giassi, 1890 com promocao 2290.
  - `resumo.json`: `atualizadoEm` com os marcadores `"{{HOJE}}"` (bistek, angeloni) e `"{{ONTEM}}"` (giassi); `arquivo` com `?v=1`.
  (Os EANs acima precisam passar em `eanValido`; confira com
  `node -e 'import("./robo/produto.js").then(m=>console.log(["7896006700029","7896006711117","7896043400012","7891021006729"].map(m.eanValido)))'`
  e troque o último dígito dos que falharem.)

- [ ] **Step 2: Escrever os testes** (`tests/busca.test.mjs`), carregando as
  fixtures com `JSON.parse(readFileSync(...))`:

```js
test("normalizar tira acento, caixa e espaço duplo", () => assert.equal(normalizar("  ARROZ  Íntegral "), "arroz integral"));
test("indexar agrupa o mesmo EAN dos três mercados num grupo só", ...);     // grupo "7896006700029" tem 3 ofertas; gramas 1000 (primeiro não-nulo); foto é URL do Bistek com "-120-120"
test("indexar deixa granel sem EAN como grupo de uma loja", ...);          // chave "bistek:<id>"
test("buscar por prefixo de palavra, sem acento e caixa", ...);            // "ARRO tio" acha o arroz; "feij" acha o feijão; "xyz" → []
test("buscar com termo vazio devolve vazio", ...);                         // Review Focus 2
test("buscar ordena: começa pelo termo, depois mais mercados, depois menor preço", ...);
test("buscar filtra só promoções e por mercado", ...);                     // promocao: true → arroz e café; mercados: ["giassi"] → arroz e café
test("buscar ordena por preço e por preço/kg com nulos no fim", ...);
test("buscar responde em menos de 100 ms com 54 mil grupos", ...);        // indexar 3 catálogos sintéticos de 18 mil linhas (nomes com 3–5 palavras de um vocabulário de 300); 5 buscas de "arro int" medidas com performance.now(); mediana < 100
```

- [ ] **Step 3: Rodar e ver falhar.** `node --test tests/busca.test.mjs`

- [ ] **Step 4: Implementar `public/busca.js`.** O teste de prefixo é
  `(" " + texto).includes(" " + palavra)`; sem índice invertido (54 mil
  grupos × includes cabe em < 100 ms; medir na Task 11).

- [ ] **Step 5: Rodar e ver passar.**

- [ ] **Step 6: Commit** — `"Busca por prefixo agrupando o mesmo produto entre mercados pelo EAN"`.

---

### Task 8: Regras da lista (`public/lista.js`)

**Files:**
- Create: `public/lista.js`
- Test: `tests/lista.test.mjs`

**Interfaces:**
- Consumes: `Grupo`, `Indice` (Task 7); `reais`, `peso` (Task 6).
- Produces:
  - `novoItemProduto(grupo, agora = new Date()): Item` — `Item = { id: string (crypto.randomUUID()), tipo: "produto", chave, ean, nome, marca, gramas, granel, foto, quantidade: 1, marcado: false, ofertas: { [m]: { id, preco, promocao, link, sumiu?: true } }, adicionadoEm }`.
  - `novoItemTexto(nome, agora): Item` — `{ id, tipo: "texto", nome, quantidade: 1, marcado: false, adicionadoEm }`.
  - `melhorOferta(item): { mercado, preco, promocao, total } | null` — ignora `sumiu`; `total = preco * quantidade`; empate vai pro primeiro na ordem dos mercados do item.
  - `totais(itens, mercados: string[]): { porMercado: [{ mercado, total, faltam }], separado: number, semPreco: number }` — `porMercado` ordenado por `faltam` crescente e depois `total` crescente; `separado` soma `melhorOferta(item).total`; `semPreco` conta itens de texto e produtos sem oferta viva.
  - `refrescar(itens, indice): Item[]` — novo array; pra cada produto, acha o grupo por `porChave.get(chave)` e, se não achar, por `porMercado` de cada oferta; oferta que sumiu do catálogo fica com `sumiu: true` e o último preço; oferta nova no catálogo entra; item de texto passa igual.
  - `comoTexto(itens, nomes: { [id]: string }, agora): string` — formato exato:
    ```
    Lista de mercado (31/10 14h00)
    • 2× Arroz Tio João 1kg — Giassi R$ 21,80 #7896006700029
    ✓ 1× Banana Caturra Kg — Bistek R$ 4,89 #bistek:123
    • 1× pão de queijo
    Tudo no Bistek: R$ 28,85
    Tudo no Giassi: R$ 21,80 (falta 1)
    Tudo no Angeloni: R$ 24,98 (falta 1)
    Cada item no mais barato: R$ 26,69
    1 sem preço
    ```
    (`✓` = marcado; uma linha "Tudo no…" por mercado na ordem de `totais`;
    `faltam N`/`falta 1`; sem mercado quando não há preço; itens de texto
    sem `#`; a linha "N sem preço" só quando N > 0).
  - `deTexto(texto, indice | null, agora): Item[]` — linhas que começam com `•`, `✓`, `-` ou `*` viram itens; `N×`/`Nx` dá a quantidade; `#chave` liga ao grupo do índice (se houver) virando produto; sem chave ou sem grupo vira texto com o nome entre a quantidade e o `—`; qualquer outra linha não vazia vira item de texto inteiro (Review Focus 5); linhas "Tudo no…", "Cada item…", "Lista de mercado…" são ignoradas.

- [ ] **Step 1: Escrever os testes** (`tests/lista.test.mjs`) usando o
  índice das fixtures da Task 7:

```js
test("novoItemProduto copia ofertas e começa com 1 desmarcado", ...);
test("melhorOferta escolhe o menor preço vezes a quantidade e ignora quem sumiu", ...);
test("totais: tudo num mercado só com faltam, cada item no mais barato, sem preço", ...);  // arroz×2 + banana + "pão": Bistek 23,96+4,89 faltam 0; Giassi 21,80 falta 1 (banana); separado 21,80+4,89; semPreco 1
test("refrescar atualiza preço, marca oferta que sumiu e não perde item", ...);          // índice sem o Angeloni → ofertas.angeloni.sumiu === true, preço antigo mantido
test("comoTexto no formato combinado", ...);                                               // igualdade de string com o bloco acima
test("deTexto lê o próprio texto de volta e liga pelo índice", ...);
test("deTexto com conversa de WhatsApp vira itens de texto sem travar", ...);             // Review Focus 5
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `public/lista.js`.** Funções puras; não tocam
  em `localStorage` nem DOM.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `"Regras da lista: mais barato por item, totais por mercado e texto pra copiar e colar"`.

---

### Task 9: Guardar no aparelho (`public/armazenamento.js`, `public/dados.js`)

**Files:**
- Create: `public/armazenamento.js`, `public/dados.js`
- Test: `tests/armazenamento.test.mjs`, `tests/dados.test.mjs`

**Interfaces:**
- Produces (`armazenamento.js`):
  - `CHAVE = "lista-de-mercado"`, `CHAVE_BACKUP = "lista-de-mercado.backup"`.
  - `carregar(storage): Estado` — `Estado = { versao: 1, itens: Item[] }`; vazio → `{ versao: 1, itens: [] }`; JSON inválido, `versao` desconhecida ou `itens` não-array → copia o bruto pro backup e devolve vazio; itens sem `id`/`nome`/`tipo` são descartados individualmente (e o bruto vai pro backup).
  - `salvar(estado, storage): boolean` — `false` se `setItem` lançar (quota), sem propagar.
- Produces (`dados.js`):
  - `carregarResumo({ fazerFetch, storage }): Promise<{ resumo, semInternet: boolean }>` — `fetch("dados/resumo.json", { cache: "no-store" })`; sucesso grava em `storage["lista-de-mercado.resumo"]`; falha lê de lá (`semInternet: true`); sem nada → lança.
  - `carregarMercado(id, entradaResumo, { fazerFetch, caches }): Promise<ArquivoMercado | null>` — URL `dados/${entradaResumo.arquivo}`; procura no `caches.open("catalogos")` com `match(url)`; senão `fetch`, `put` e apaga as outras entradas do mesmo mercado (`keys()` filtradas por `dados/${id}.json?`); entrada com `erro` e sem `arquivo` → `null`; `caches` ausente (Safari privado) → só `fetch`.

- [ ] **Step 1: Escrever os testes** com `storage` falso (`Map` com
  `getItem/setItem/removeItem`) e `caches` falso (`open → { match, put, keys, delete }`):

```js
test("carregar devolve vazio quando não há nada", ...);
test("carregar guarda lixo no backup e devolve vazio", ...);                      // Review Focus 4
test("carregar com versão futura guarda backup e devolve vazio", ...);
test("carregar descarta só o item quebrado", ...);
test("salvar devolve false quando o storage estoura", ...);
test("carregarResumo usa a rede e guarda cópia; sem rede usa a cópia", ...);
test("carregarMercado usa o cache quando a versão bate e apaga versões velhas", ...);
test("carregarMercado devolve null pra mercado com erro", ...);
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar os dois módulos.**

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `"Lista guardada no aparelho com backup, e catálogos no cache do navegador"`.

---

### Task 10: Casca do site e harness de navegador

**Files:**
- Create: `public/index.html`, `public/estilo.css`, `public/dom.js`, `public/app.js`, `tests/servidor.mjs`, `tests/navegador.mjs`
- Test: `tests/navegador.mjs`

**Interfaces:**
- Consumes: Tasks 6–9.
- Produces (`dom.js`): `escapar(s): string`, `el(seletor, raiz = document)`, `debounce(fn, ms)`.
- Produces (`app.js`): objeto `estado = { itens, indice, resumo, semInternet, tela: "lista"|"buscar", mercados: [{ id, nome, atualizadoEm, erro }] }`; `window.app = { estado, pronto: Promise }` pros testes; funções `irPara(tela)`, `renderizarCabecalho()`, chamadas `renderizarBusca(estado)` e `renderizarLista(estado)` que as Tasks 11 e 12 implementam (por enquanto, `tela-busca.js` e `tela-lista.js` exportam versões que só escrevem "em construção").
- Produces (`tests/servidor.mjs`): `servir({ pasta = "public", dados = "tests/fixtures/dados", resumo = dados + "/resumo.json" }): Promise<{ url, fechar }>` — porta livre; `/dados/*` vem de `dados`, exceto `/dados/resumo.json`, que vem do arquivo `resumo` (`null` → 404, pra simular site sem dados); `{{HOJE}}`/`{{ONTEM}}` trocados por ISO de agora e de ontem 18h local; `Content-Type` por extensão (`.js` → `text/javascript`, `.webmanifest` → `application/manifest+json`). Fixture extra `tests/fixtures/dados/resumo-com-erro.json`: igual ao resumo, mas `angeloni` só com `nome` e `erro: "HTTP 503 depois de 3 tentativas"`.
- Produces (`tests/navegador.mjs`): `node:test` com `before` subindo o servidor e o Chromium (`createRequire` do caminho do Playwright, `process.env.PLAYWRIGHT_DIR` sobrescreve) e `after` fechando; helper `abrir(viewport = { width: 390, height: 844 })` que devolve `page` já com `window.app.pronto` resolvido.

Marcação mínima do `index.html` (ids e `data-*` são contrato com os testes):
`<header id="cabecalho">` com `<h1>Lista de mercado</h1>` e `<p id="quando">`;
`<main>` com `<section data-tela="buscar">` (`<input id="busca" type="search" placeholder="Buscar produto…">`, `<div id="chips">`, `<div id="resultados">`) e `<section data-tela="lista">` (`<ul id="itens">`, `<footer id="totais">`, `<div id="menu-lista">`);
`<nav id="barra">` com `<button data-ir="lista">Lista <span id="contador-lista">` e `<button data-ir="buscar">Buscar</button>`;
`<div id="aviso" role="status">`.

- [ ] **Step 1: Escrever `tests/servidor.mjs` e o esqueleto de `tests/navegador.mjs`** com estes testes:

```js
test("abre mostrando a lista vazia e o convite pra buscar", ...);        // texto "Sua lista está vazia" visível; tela ativa é "buscar" (sem itens)
test("cabeçalho diz de quando são os preços, por mercado", ...);         // #quando contém "Bistek" e "hoje" e "Giassi" e "ontem 18h"
test("no celular não há rolagem horizontal e a barra inferior aparece", ...); // document.documentElement.scrollWidth <= 390; #barra visível
test("em tela larga as duas telas ficam lado a lado e a barra some", ...);   // viewport 1280×800: boundingBox de [data-tela=buscar].x < [data-tela=lista].x; #barra oculto
test("mercado com erro no resumo aparece avisado", ...);                 // servir({ resumo: "tests/fixtures/dados/resumo-com-erro.json" }): #quando contém "Angeloni: sem preços"
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/navegador.mjs` (falha por não achar os elementos).

- [ ] **Step 3: Escrever `index.html`, `estilo.css`, `dom.js`, `app.js`** e
  os placeholders `tela-busca.js`/`tela-lista.js`. CSS: variáveis
  `--fundo #f7f6f2 / --tinta #121212 / --verde #1b7f3b / --cinza #6b6b6b`,
  tema escuro em `prefers-color-scheme: dark` (`--fundo #121212`,
  `--tinta #f2f2f2`, `--verde #5dd07f`); `main { min-height: 100dvh }`;
  `#barra` fixa embaixo com `padding-bottom: env(safe-area-inset-bottom)`;
  `#busca { font-size: 16px }`; botões `min-height: 44px`;
  `@media (min-width: 900px)` → `main { display: grid; grid-template-columns: 1fr 1fr; max-width: 1440px }` e `#barra { display: none }`, ambas as seções visíveis; abaixo disso só a seção `[data-tela][data-ativa]` aparece; `@media (prefers-reduced-motion: reduce)` zera transições.
  `app.js`: carrega estado do `localStorage`, renderiza lista, `irPara` pela
  presença de itens, pede `carregarResumo` e depois os mercados em
  paralelo, indexa, `refrescar` a lista, renderiza de novo; cabeçalho:
  "Preços de hoje 12h05 (Bistek, Angeloni) · Giassi: ontem 18h" — agrupa
  os mercados com o mesmo texto de `quandoFoi`; mercado com `erro` →
  "Angeloni: sem preços"; `semInternet` → prefixo "Sem internet · ".
  Enquanto carrega: `#aviso` "Carregando os preços… Bistek ✓".

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/navegador.mjs`, 5 testes.

- [ ] **Step 5: Commit** — `"Site abre com a lista salva e diz de quando são os preços de cada mercado"`.

---

### Task 11: Tela Buscar (`public/tela-busca.js`)

**Files:**
- Create: `public/tela-busca.js` (substitui o placeholder)
- Modify: `public/app.js` (ligar eventos), `public/estilo.css`
- Test: `tests/navegador.mjs` (acrescentar)

**Interfaces:**
- Consumes: `buscar`, `Grupo` (Task 7); `novoItemProduto`, `novoItemTexto` (Task 8); `estado` (Task 10).
- Produces: `renderizarBusca(estado, { termo, filtros, mostrar })` e `ligarBusca(estado, acoes)` com `acoes = { adicionarProduto(grupo), adicionarTexto(nome), incrementar(chave) }` (implementadas em `app.js`, que salva e re-renderiza a lista).
  Marcação por resultado: `<article class="cartao" data-chave="…">` com `<img>` (lazy, 120 px, `alt=""`), `.nome`, `.marca-peso`, `.precos` (um `<span class="preco" data-mercado="bistek">` por mercado; o mais barato com classe `melhor`; promoção com `<s>` do preço "de"), `<button class="adicionar">+</button>`; se já está na lista, o botão mostra a quantidade (`×2`).
  Chips em `#chips`: `<button class="chip" data-filtro="promocao">Só promoções</button>`, `data-ordem="preco"` "Menor preço", `data-ordem="porKg"` "Menor preço/kg", e um `data-mercado="<id>"` por mercado. Rodapé do resultado: `<button id="mostrar-mais">` (lotes de 30) e `<button id="adicionar-texto">Adicionar "pão" sem preço</button>` sempre que há termo.

- [ ] **Step 1: Acrescentar os testes** em `tests/navegador.mjs`:

```js
test("buscar 'arroz' mostra um cartão só com os três preços e o Giassi em destaque", ...);  // 1 .cartao; 3 .preco; .preco.melhor[data-mercado=giassi]; Bistek tem <s>
test("tocar no + adiciona à lista, o contador sobe e o botão mostra ×1 e depois ×2", ...);
test("chip 'Só promoções' e chip de mercado filtram", ...);
test("sem resultado, 'Adicionar sem preço' cria item de texto", ...);               // termo "pão de queijo" → clique → lista tem item "pão de queijo"
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `tela-busca.js`** com delegação de eventos em
  `#resultados` e `#chips`; `debounce(120)` no `input`; render por
  `innerHTML` com `escapar` em todo texto vindo do catálogo. Retorno ao
  adicionar: `#contador-lista` atualiza e o `#aviso` diz "Arroz… na lista"
  por 1,5 s.

- [ ] **Step 4: Rodar e ver passar** (os 9 do navegador).

- [ ] **Step 5: Commit** — `"Tela de busca: preço nos três mercados, mais barato em destaque e adicionar com um toque"`.

---

### Task 12: Tela Lista (`public/tela-lista.js`)

**Files:**
- Create: `public/tela-lista.js` (substitui o placeholder)
- Modify: `public/app.js`, `public/estilo.css`
- Test: `tests/navegador.mjs` (acrescentar)

**Interfaces:**
- Consumes: Task 8 inteira; `estado`.
- Produces: `renderizarLista(estado)` e `ligarLista(estado, acoes)` com `acoes = { alterarQuantidade(id, delta), marcar(id, marcado), remover(id), desmarcarTudo(), limpar(), desfazer(), copiar(), colar(texto) }`.
  Marcação: `<li class="item" data-id="…" data-marcado>` com `<input type="checkbox" class="marcar">`, `<img>`, `.nome`, `.quantidade` (`<button class="menos">−</button><span class="n">2</span><button class="mais">+</button>`; granel: `.n` mostra `2 × 200 g`), `.melhor` ("Giassi R$ 21,80"), `.outros` ("Bistek R$ 23,96 · Angeloni R$ 24,98"), `<button class="remover">`, `<details class="detalhe">` com uma linha por mercado (`<a href=link target=_blank>`, preço, preço/kg, promoção com `<s>`, "não achei mais no Giassi" quando `sumiu`). Marcados vão pro fim com texto riscado. Sem preço: `.melhor` diz "sem preço" (e o último preço em cinza quando todas sumiram).
  `#totais`: `<p>` por mercado "Tudo no Bistek R$ 28,85" + `<small>faltam 2</small>` quando > 0; `<p class="separado">Cada item no mais barato R$ 26,69</p>`; `<small>1 sem preço</small>`.
  `#menu-lista`: botões `#copiar`, `#colar`, `#desmarcar`, `#limpar`. Limpar → `#aviso` "Lista limpa. <button id='desfazer'>Desfazer</button>" por 6 s. Copiar usa `navigator.clipboard.writeText` e cai num `<textarea>` selecionado quando não há clipboard; colar abre `<dialog id="dialogo-colar">` com `<textarea>` e botão "Adicionar".

- [ ] **Step 1: Acrescentar os testes**:

```js
test("item na lista mostra o mais barato e os outros mercados", ...);
test("mais e menos mudam a quantidade e os totais", ...);                          // arroz ×2: .melhor "Giassi R$ 21,80"; #totais tem "Tudo no Giassi R$ 21,80" e "falta"
test("riscar manda o item pro fim e sobrevive ao recarregar", ...);               // marcar → li:last-child; page.reload → ainda marcado
test("totais: faltam N e cada item no mais barato", ...);                        // arroz + banana + texto: "Tudo no Bistek R$ 16,87", "Tudo no Giassi R$ 10,90 · falta 1" (ou "faltam"), "Cada item no mais barato R$ 15,79", "1 sem preço"
test("limpar pede confirmação e desfazer traz de volta", ...);
test("colar o texto copiado recria a lista", ...);                                // comoTexto da lista → limpar → colar → mesmos itens
test("mercado que sumiu do catálogo aparece avisado no detalhe", ...);           // adicionar o arroz; reabrir com servir({ resumo: "tests/fixtures/dados/resumo-com-erro.json" }) na mesma origem (mesma porta: guardar e reutilizar) → detalhe diz "não achei mais no Angeloni" e #totais não tem "Tudo no Angeloni"
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `tela-lista.js`.** Cada ação em `app.js` faz:
  muda `estado.itens` (funções puras da Task 8), `salvar`, `renderizarLista`,
  `renderizarBusca` (pra atualizar o `×N` dos cartões). Confirmação de
  limpar com `<dialog>` (não `confirm()`).

- [ ] **Step 4: Rodar e ver passar** (16 do navegador + unitários).

- [ ] **Step 5: Commit** — `"Tela da lista: quantidade, riscar no mercado, totais por mercado, copiar e colar"`.

---

### Task 13: Acabamento (manifest, ícone, estados vazios, sem dados)

**Files:**
- Create: `public/manifest.webmanifest`, `public/icone.svg`, `public/404.html`
- Modify: `public/index.html`, `public/app.js`, `public/estilo.css`
- Test: `tests/navegador.mjs` (acrescentar)

- [ ] **Step 1: Acrescentar os testes**:

```js
test("sem resumo nenhum, o site abre e avisa que ainda não tem preços", ...);   // servir({ resumo: null }) → #aviso contém "ainda sem preços" e "6h, 12h e 18h"; a lista continua usável (adicionar texto funciona)
test("manifest e ícone respondem", ...);                                        // fetch de manifest.webmanifest 200 com name "Lista de mercado"; icone.svg 200
test("tema escuro não quebra o contraste do destaque", ...);                     // page.emulateMedia({ colorScheme: "dark" }); cor de fundo do body !== "rgb(247, 246, 242)"
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.** Manifest com `name`, `short_name` "Mercado",
  `start_url: "./"`, `display: "standalone"`, `theme_color`, ícone SVG
  (cesta simples, duas cores). `index.html` com `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="theme-color">` claro e escuro, `<link rel="manifest">`, `<link rel="icon" href="icone.svg">`. Aviso fixo no cabeçalho (toque em `#quando` abre `<details>`): "Preço do site de cada mercado; a loja física e o clube podem ser outros."

- [ ] **Step 4: Rodar e ver passar.** `npm test && npm run test:navegador`.

- [ ] **Step 5: Commit** — `"Dá pra adicionar à tela inicial, e o site avisa quando ainda não tem preços"`.

---

### Task 14: Workflow do GitHub Actions e documentação

**Files:**
- Create: `.github/workflows/atualizar.yml`
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Escrever `atualizar.yml`** exatamente com:
  - `on: schedule: - cron: "17 9,15,21 * * *"`; `push: branches: [main]`; `workflow_dispatch: inputs: rastrear: { type: boolean, default: true, description: "Rastrear os mercados (desligado = só republicar)" }`.
  - `permissions: contents: read, pages: write, id-token: write`; `concurrency: { group: pages, cancel-in-progress: false }`.
  - Job `atualizar` (`ubuntu-latest`, `timeout-minutes: 50`): `actions/checkout@v4`; `actions/setup-node@v4` com `node-version: 22`; passo "Descobrir a URL do site" que exporta `SITE_URL` (`https://${OWNER}.github.io/${REPO}` ou `https://${REPO}` quando `REPO` termina em `.github.io`, a partir de `${{ github.repository }}`); passo "Dados" que roda `node robo/catalogo.mjs --saida public/dados --anterior "$SITE_URL/dados"` e acrescenta `--so-anterior` quando `github.event_name == 'push'` ou (`workflow_dispatch` e `inputs.rastrear == false`); `actions/configure-pages@v5` com `enablement: true`; `actions/upload-pages-artifact@v3` com `path: public`.
  - Job `publicar` (`needs: atualizar`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`): `actions/deploy-pages@v4` com `id: deployment`.

- [ ] **Step 2: Validar a sintaxe** — `node -e 'const y=require("fs").readFileSync(".github/workflows/atualizar.yml","utf8");console.log(y.split("\n").length,"linhas")'` e conferir visualmente indentação; se houver `yamllint` ou `actionlint` na máquina, rodar.

- [ ] **Step 3: Documentar** no `README.md`: como o dado chega ao site (sem
  commit), gatilhos, o que fazer quando um mercado fica em falha por dias
  (plano B: rodar o robô na máquina e `workflow_dispatch` só republicar não
  resolve — precisa commitar os dados temporariamente ou aceitar). No
  `CLAUDE.md`: "Armadilhas" com o `_from ≤ 2500`, o caminho completo da
  categoria, o 206, e o cache de 10 min do Pages.

- [ ] **Step 4: Rodar tudo** — `npm test && npm run test:navegador`. Expected: tudo PASS.

- [ ] **Step 5: Commit** — `"Robô roda no GitHub Actions 3x por dia e publica o site no Pages"`.

---

### Task 15: Publicar (precisa do dono)

- [ ] **Step 1: Esperar o dono criar o repo público `brenisio/lista-de-mercado`** (ou outro nome que ele disser). Sem isso, parar aqui e avisar.
- [ ] **Step 2: Remoto e push** — `git remote add origin git@github.com:brenisio/lista-de-mercado.git && git push -u origin main`.
- [ ] **Step 3: Acompanhar o workflow** no site do GitHub (sem `gh`): o dono abre a aba Actions, ou esperar ~3 min e abrir `https://brenisio.github.io/lista-de-mercado/` — deve mostrar "ainda sem preços" (push = só republicar, sem anterior).
- [ ] **Step 4: Disparar o rastreio** — o dono clica "Run workflow" (rastrear = true) na aba Actions, ou espera o cron. Depois, abrir o site no celular e conferir: buscar "arroz", adicionar, ver totais, recarregar.
- [ ] **Step 5: Registrar no `README.md` e no `CLAUDE.md`** a data da primeira publicação e o que foi visto. Commit e push.
