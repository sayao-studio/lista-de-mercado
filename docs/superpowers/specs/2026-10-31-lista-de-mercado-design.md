# Lista de mercado — design (31/10/2026)

## Intenção

Site pra montar a lista de compras vendo o que os supermercados de
Florianópolis têm, e saber em qual deles cada item está mais barato e o que
está em promoção. A pessoa vai adicionando itens, pesquisa quando quer
comparar, e a lista fica salva pra usar no mercado.

Por quê: hoje a comparação é manual (abrir três sites ou o Tiendeo). Nasceu
do protótipo de compras da esfiharia (`../esfirraria/ops/compras.mjs` e
`../esfirraria/functions/_lib/mercados.js`), que já busca preço nos três
mercados pela loja VTEX deles.

Decisão do dono (31/10/2026): tudo dentro do GitHub (Pages + Actions), sem
Cloudflare nem outro serviço. Consequência aceita por ele: os preços vêm de
um robô que roda algumas vezes por dia, então podem ter algumas horas de
atraso, e a busca só acha o que o robô já baixou.

## Objetivos

- Montar a lista rápido no celular: buscar, tocar, adicionar, ajustar
  quantidade, riscar no mercado.
- Pra cada item com preço, mostrar o mercado mais barato e o preço nos
  outros; no rodapé, "tudo num mercado só" (por mercado) e "cada item no
  mais barato".
- Deixar claro o que é promoção (preço "de" maior que o preço atual).
- Lista salva no aparelho, sem login.
- Página leve e rápida no celular; dado atualizado 3x por dia.

## Não-objetivos (nesta versão)

- Login, sincronizar entre aparelhos, lista compartilhada, mais de uma lista.
- Validade da promoção (só vem nos encartes em imagem do Tiendeo).
- Preço da loja física, preço de clube, escolher loja/região (o preço é o do
  site, no canal padrão).
- Outros mercados (Imperatriz, Fort, Pradão não têm catálogo acessível).
- Histórico de preço, alerta de preço.
- Casar produtos "equivalentes" por IA (marca diferente, mesmo produto). Só
  o EAN casa entre lojas nesta versão.
- Service worker / funcionar sem internet.

## Anti-objetivos (seria fracasso mesmo funcionando)

- Mostrar preço sem dizer de quando é. Toda tela com preço mostra a hora da
  última atualização de cada mercado.
- Perder a lista da pessoa numa atualização do site. O formato salvo é
  versionado e migrado; nunca se descarta o que não se entende.
- Página pesada: a abertura mostra a lista na hora (sem esperar catálogo), e
  o catálogo carrega atrás, com aviso. Orçamento: dados dos três mercados
  somados ≤ 3 MB comprimidos; digitar na busca responde em < 100 ms.
- Inventar: produto sem EAN válido não casa com nada, e fica como item de
  uma loja só. Nada de "parecido" apresentado como "igual". Só é EAN o que
  for GTIN-8/12/13/14 com dígito verificador certo: granel, hortifrúti e
  carne vêm com código interno curto no campo `ean` (Giassi `8727`,
  Angeloni `82`, Bistek `3000030…`) e casariam produto errado entre lojas.
  Consequência aceita: nesta versão hortifrúti e carne não comparam entre
  mercados.

## Restrições

- GitHub Pages (estático) + GitHub Actions (robô e publicação). Repositório
  público (Pages grátis e minutos ilimitados do Actions). Nada de serviço
  externo, nada de chave ou segredo.
- A busca VTEX não libera CORS, então o navegador nunca fala com os mercados;
  só o robô fala. Não é API oficial: pode mudar ou ser bloqueada. O robô
  tem que falhar bem (ver "Robô").
- Limites da VTEX (testados em 31/10/2026): `_from` máximo 2500; página de no
  máximo 50 (`_to - _from ≤ 49`); filtro de categoria só com caminho
  completo (`fq=C:/2/7/10/`; `fq=C:/10/` devolve 0); ordenação
  `O=OrderByPriceASC|DESC`. Cabeçalho `resources: 0-49/12994` dá o total.
  Tamanho dos catálogos: Bistek ~13 mil, Giassi ~11 mil, Angeloni ~30 mil
  produtos. Árvore em `/api/catalog_system/pub/category/tree/3`.
- Foto: `https://<loja>.vteximg.com.br/arquivos/ids/<id>-120-120` devolve a
  miniatura; só o `<id>` precisa ser guardado.
- Sem build e sem framework (HTML/CSS/JS puro, ES modules), como os outros
  sites do dono. Tudo em português: interface, comentários, nomes,
  commits, testes. Comentário explica o porquê, não o quê.
- Node 22 no robô e nos testes (`node --test`). Playwright já existe na
  máquina pra verificar no navegador.
- Push pessoal vai por SSH (`Host github.com` → `~/.ssh/id_github`, conta
  `brenisio`); o `gh` desta máquina está em outra conta e não deve ser usado
  pra este repo. Repo assumido: `brenisio/lista-de-mercado`, site em
  `https://brenisio.github.io/lista-de-mercado/` (subcaminho: toda URL do
  site é relativa). O dono cria o repo público vazio na interface do GitHub;
  o Pages é ligado pelo próprio workflow (`actions/configure-pages` com
  `enablement: true`).
- Celular assumido: Android/Chrome. Mesmo assim a tela usa `100dvh`,
  `env(safe-area-inset-*)` e campo de busca com fonte ≥ 16 px (sem zoom no
  iPhone), e a lista tem "Copiar como texto" / "Colar lista" que serve de
  backup — no Safari o `localStorage` some depois de 7 dias sem abrir o
  site, a não ser que esteja na tela inicial.

## Mercados

| id | nome | site (base da API) | host da foto |
|---|---|---|---|
| bistek | Bistek | https://www.bistek.com.br | bistek.vteximg.com.br |
| giassi | Giassi | https://www.giassi.com.br | giassi.vteximg.com.br |
| angeloni | Angeloni | https://super.angeloni.com.br | superangeloni.vteximg.com.br |

O host da foto é descoberto pelo robô na primeira imagem que aparecer e
gravado no arquivo do mercado, pra não chutar (os da tabela são os vistos em
31/10/2026).

## Como funciona

```
robô (GitHub Actions, 3x/dia)        site (GitHub Pages)
  baixa catálogo dos 3 mercados  →   public/dados/*.json  →  navegador
  (categoria por categoria)          publicados junto        busca, lista,
                                     com o site              totais; lista
                                                             salva no aparelho
```

### Estrutura do repositório

```
public/            o que o Pages serve: index.html, estilo.css, app.js (tela),
                   busca.js (índice e busca, sem DOM), lista.js (regras da
                   lista e totais, sem DOM), armazenamento.js (salvar/migrar),
                   manifest.webmanifest, icone.svg, 404.html
public/dados/      gerado pelo robô, fora do git: resumo.json, bistek.json,
                   giassi.json, angeloni.json
robo/              catalogo.mjs (CLI), vtex.js (árvore, paginação, retentativa),
                   produto.js (nome, peso, granel, promoção; traz pesoGramas
                   e a leitura de oferta de ../esfirraria/functions/_lib/mercados.js)
tests/             *.test.mjs (node --test; sem rede, com respostas gravadas em
                   tests/fixtures/), navegador.mjs (Playwright, sobe um
                   servidor estático e testa a tela)
.github/workflows/ atualizar.yml
docs/superpowers/  este documento e o plano
```

### Robô (`node robo/catalogo.mjs`)

Pra cada mercado, em paralelo entre mercados e um pedido por vez dentro do
mercado (não martelar ninguém; ~100 ms entre pedidos, timeout 20 s, 3
tentativas com espera crescente, user-agent que identifica o projeto):

1. Lê a árvore de categorias (nível 3).
2. Pra cada categoria de nível 1 que não esteja em `ignorar` (lista por
   mercado em `robo/mercados.js`), pede `_to=0` e lê o total no `resources`.
   Ficam de fora os departamentos que não são compra de mercado: Eletro,
   Eletrônicos, Decoração, Esporte e Lazer, Lazer, Cama e Banho, Vestuário,
   Ferramentas, Brinquedos, Papelaria, Festa, Casa, Floricultura e Jardim,
   Bazar, Utensílios, Utilidades Domésticas, Cestas e Kits, "Z: Category".
   Ficam dentro: Pet Shop, Bebês/Cantinho do Bebê/Bebê e Crianças,
   Descartáveis, Churrasco, Adega, "Bistek", Bem Estar e Equilíbrio. Se os
   três arquivos somados passarem de 3 MB comprimidos (medido no fim do
   robô, que avisa no log), caem mais departamentos antes de qualquer campo
   — ração e fralda têm que continuar na busca.
   - Total ≤ 2500: pagina de 50 em 50 com `fq=C:/caminho/`.
   - Total > 2500: desce pros filhos e repete. Folha com mais de 2500: baixa
     2500 por preço crescente e 2500 por preço decrescente, junta, e avisa
     no log que pode ter ficado buraco.
3. Guarda uma linha por SKU com estoque e preço > 0 (dedupe por `itemId`;
   o mesmo produto pode aparecer em mais de uma categoria).
4. Escreve `public/dados/<mercado>.json` e, no fim, `public/dados/resumo.json`.

Cada mercado tem um prazo interno (40 min) pra caber nos 50 min do job; quem
estoura conta como falha e cai no anterior, em vez de derrubar tudo.

Se um mercado falhar (HTTP ≠ 2xx depois das tentativas, JSON inválido, ou
menos de 30% do total esperado — soma dos `resources` das categorias
baixadas, antes do dedupe — sinal de bloqueio parcial), o robô:
- com `--anterior <url>`, baixa o `<mercado>.json` publicado antes e usa ele
  (mantendo o `atualizadoEm` antigo, que a tela mostra como "preços de ontem
  18h");
- sem anterior disponível, publica sem esse mercado e o `resumo.json` diz
  `erro: "…"` pra ele. O site segue com os outros.

Saída do robô é 0 mesmo com mercado em falha (publicar o que deu é melhor que
nada); falha só se nenhum mercado tiver dado — aí o deploy não roda e o site
anterior fica no ar.

### Formato dos dados

`resumo.json`:

```json
{ "versao": 1, "geradoEm": "2026-10-31T12:05:00Z",
  "mercados": { "bistek": { "nome": "Bistek", "atualizadoEm": "…", "produtos": 12990, "arquivo": "bistek.json?v=1761912300" },
                "giassi": { "…": "…", "erro": "HTTP 503 depois de 3 tentativas" } } }
```

`<mercado>.json`:

```json
{ "versao": 1, "mercado": "bistek", "nome": "Bistek", "site": "https://www.bistek.com.br",
  "fotos": "https://bistek.vteximg.com.br/arquivos/ids/", "atualizadoEm": "…",
  "categorias": ["Mercearia > Arroz", "…"],
  "produtos": [
    { "id": "2013800", "nome": "Água Mineral Da Pedra Com Gás 500ml", "marca": "Da Pedra",
      "ean": "7896436100642", "gramas": 500, "granel": false,
      "preco": 180, "promocao": 0, "foto": "206464", "link": "agua-mineral-da-pedra-com-gas-500ml-2013800", "categoria": 0 } ] }
```

- `preco` e `promocao` em centavos; `promocao` é o preço "de" quando maior
  que o atual, senão 0. Granel (`measurementUnit` "kg"): `gramas` é o passo
  de venda (`unitMultiplier` × 1000) e `preco` é o preço desse passo.
- `gramas` é `null` quando o nome não diz o peso; aí não há preço por kg.
- `ean` é `""` quando a loja não informa ou quando o valor não é GTIN
  válido (ver anti-objetivos).
- `categorias` é a lista, sem repetição, dos caminhos próprios dos produtos
  ("Mercearia > Massas > Macarrão", o mais fundo de `categories` da VTEX,
  evitando departamento ignorado); `categoria` é o índice nessa lista.
  Produto sem `categories` fica na categoria por onde foi baixado. O site
  classifica esses caminhos em departamento e seção.
- `pesoGramas` e a leitura da oferta são copiados de
  `../esfirraria/functions/_lib/mercados.js` pra dentro de `robo/produto.js`
  (o Actions não tem a pasta vizinha), com nota de origem.
- O `?v=` no `arquivo` quebra o cache de 10 min do Pages quando há dado novo.

### Site

Uma página, duas telas: **Lista** e **Buscar**. No celular, barra inferior
pra alternar (a Lista é a tela inicial quando já tem item; senão, Buscar).
Em tela larga (≥ 900 px), as duas ficam lado a lado (Buscar à esquerda,
Lista à direita), sem a barra inferior.

**Ao abrir:** mostra a lista salva na hora. Em paralelo baixa `resumo.json`
e depois os três arquivos de mercado; enquanto isso a busca mostra
"Carregando os preços…" com o nome do mercado que já chegou. Arquivos ficam
no Cache API do navegador (chave pelo `?v=`), então a segunda abertura é
instantânea; o `resumo.json` vai sempre à rede (`cache: "no-store"`) e, se
falhar, usa o último resumo salvo e avisa "sem internet, preços de <hora>".

**Buscar:** campo fixo no topo, resultado a cada tecla (debounce 120 ms).
Busca por prefixo de palavra em nome + marca, sem acento e sem caixa: "arro
int" acha "Arroz Integral Tio João". Resultado agrupado por EAN: um cartão
por produto com foto, nome, marca, peso, e o preço em cada mercado que tem;
o mais barato em destaque, promoção com o preço "de" riscado. Ao lado de
cada preço, quando o peso é conhecido, o preço por kg (ou por litro) daquela
loja, pequeno e em cinza: é o que compara acém a R$ 5,39 por 100 g no
Angeloni com acém a R$ 81,69 por 1,5 kg no Bistek. A granel o cartão diz o
passo de venda ("a granel, 100 g por vez") em vez de parecer embalagem. Sem EAN, o
cartão é de uma loja só. Ordem padrão: nome começa pelo que foi digitado
primeiro, depois quem está em mais mercados, depois menor preço. Opções
(chips): "Só promoções", "Menor preço", "Menor preço/kg", e um chip por
mercado pra filtrar. Mostra 30 resultados e "Mostrar mais".

**Catálogo (campo vazio):** a pessoa também monta a lista "vendo o que
tem", pra lembrar o que esqueceu de digitar. Com o campo vazio a tela
mostra o catálogo inteiro dos três mercados, separado por **departamento**
(Hortifruti, Padaria, Carnes…, 15 ao todo, na ordem de corredor) e, dentro,
por **seção** ("Massas", "Cervejas", "Lavanderia"). Os três mercados têm
árvores diferentes; `public/departamentos.js` mapeia qualquer caminho em
departamento e seção por palavra-chave, sem acento (o leite do Bistek sai
de "Bebidas" e vai pra Frios; o que nenhuma regra conhece vai pra "Outros"
ou fica com o nome que o mercado deu). Produto cujo caminho não diz a
seção (solto no departamento, ou no departamento "Bistek") tenta o nome
como último recurso: regras do próprio departamento sobre o nome inteiro
ou, sem departamento, regras de todos sobre as três primeiras palavras (o
tipo do produto, não o sabor). Produto no mesmo EAN em lojas que discordam
fica com a classificação mais forte: caminho com seção > palpite pelo nome
> nenhuma; em empate, a primeira loja do resumo.
Níveis: departamentos (ladrilhos com "N produtos") → seções do
departamento ("Tudo de X" primeiro, quando há mais de uma; departamento
com uma seção só abre direto nos produtos) → cartões da seção, os mesmos
da busca, em lotes de 30 com "Mostrar mais". Os chips
valem no catálogo: com "Só promoções" as contagens viram "N em promoção" e
departamento sem nada some. Descer empurra uma entrada no histórico, então
o botão voltar do celular sobe um nível em vez de sair do site. Digitar
substitui o catálogo pelo resultado; apagar devolve a seção que estava
aberta. Pra isso o robô grava a categoria própria de cada produto (o
caminho mais fundo de `categories` da VTEX), não a categoria por onde
baixou.

Toque no cartão (ou botão "+") adiciona à lista com quantidade 1 e dá um
retorno visível (contador na barra). Se já está na lista, mostra a quantidade
no cartão e o toque incrementa. Quando a busca não acha nada (ou sempre, no
rodapé do resultado): "Adicionar 'pão de queijo' sem preço" cria um item de
texto livre — a lista serve de lembrete mesmo sem preço.

**Lista:** cada item mostra foto, nome, quantidade (−/+; no granel a
quantidade é em passos e aparece como "2 × 200 g"), e o mercado mais
barato com o preço total pra quantidade; os outros mercados aparecem
pequenos ao lado ("Giassi R$ 5,49 · Angeloni R$ 5,99"). Toque abre o
detalhe: preço por mercado com link pro site da loja, preço/kg, promoção.
Deslizar ou botão remove. Caixinha pra riscar o item ao pegar no mercado
(fica riscado e vai pro fim). Rodapé fixo com os totais:

- "Tudo no Bistek R$ 123,40 · faltam 2" (um por mercado, o mais barato
  primeiro, "faltam N" quando o mercado não tem N itens);
- "Cada item no mais barato R$ 110,10";
- itens sem preço contam como "N sem preço".

Menu da lista: "Copiar como texto" (pra mandar no WhatsApp: um item por
linha com quantidade e mercado mais barato, totais no fim), "Colar lista"
(lê esse mesmo texto de volta — serve de backup e pra receber a lista de
outra pessoa; linhas que não entende viram item de texto), "Desmarcar
tudo", "Limpar lista" (pede confirmação; "Desfazer" por alguns segundos).

Ao abrir, a lista refresca os preços pelo catálogo recém-carregado: casa
por EAN e, sem EAN, por `mercado + id`. Mesmo EAN com `gramas` diferente
entre lojas agrupa pelo EAN e usa o `gramas` que não for nulo. Item que sumiu de um mercado
mostra "não achei mais no Giassi" e sai da conta daquele mercado; que sumiu
de todos vira "sem preço" mantendo o último preço visto em cinza.

**Cabeçalho:** nome do site e "Preços de hoje 12h05 (Bistek, Giassi,
Angeloni)". Mercado em falha ou atrasado aparece com a hora dele:
"Giassi: ontem 18h". Toque mostra o aviso fixo: "Preço do site de cada
mercado; a loja física e o clube podem ser outros."

**Visual (minha escolha):** limpo, uma cor de destaque (verde) pro mais
barato e pra promoção, fonte do sistema, botões com 44 px de toque, tema
escuro automático (`prefers-color-scheme`), `prefers-reduced-motion`
respeitado. `manifest.webmanifest` + ícone pra "adicionar à tela inicial".
Largura máxima 720 px por coluna.

### Armazenamento no aparelho

`localStorage["lista-de-mercado"]`:

```json
{ "versao": 1, "itens": [
  { "id": "…", "tipo": "produto", "ean": "7896…", "nome": "…", "marca": "…",
    "gramas": 1000, "granel": false, "foto": "https://…", "quantidade": 2, "marcado": false,
    "ofertas": { "bistek": { "id": "2013800", "preco": 180, "promocao": 0, "link": "…" } },
    "adicionadoEm": "…" },
  { "id": "…", "tipo": "texto", "nome": "pão de queijo", "quantidade": 1, "marcado": false } ] }
```

`armazenamento.js` lê, valida e migra por `versao`; conteúdo que não entende
fica guardado em `lista-de-mercado.backup` antes de qualquer migração.
Gravação a cada mudança. Cache dos catálogos no Cache API (`caches.open`),
com os `?v=` antigos apagados ao carregar um novo.

### Fluxo no GitHub Actions (`atualizar.yml`)

- Gatilhos: `schedule` (cron `17 9,15,21 * * *` ≈ 6h, 12h e 18h de Brasília;
  fora do minuto 0, que o GitHub atrasa), `push` na `main`,
  `workflow_dispatch` (com opção de rastrear ou só republicar).
- Job `atualizar`: checkout, Node 22, e então:
  - no cron e no manual "rastrear": `node robo/catalogo.mjs --saida
    public/dados --anterior $SITE_URL/dados` (rastreia; mercado em falha cai
    no anterior);
  - no `push` e no manual "só republicar": `node robo/catalogo.mjs --saida
    public/dados --anterior $SITE_URL/dados --so-anterior` (só baixa os
    dados publicados e republica — ajuste de código vai ao ar em ~1 min e
    sobe mesmo com a VTEX fora; na primeira publicação, sem anterior, o site
    sobe sem dados e avisa "ainda sem preços; o robô roda às 6h, 12h e 18h").
  - `actions/configure-pages` (`enablement: true`),
    `actions/upload-pages-artifact` de `public/`. Job `publicar`:
    `actions/deploy-pages`. Nenhum dado entra no git (o histórico não cresce).
    `SITE_URL` vem de `github.repository` (`https://<dono>.github.io/<repo>`;
    se o repo for `<dono>.github.io`, é a raiz).
- `concurrency` pra não rodar dois ao mesmo tempo; `timeout-minutes: 50`.

### Testes

- `node --test tests/*.test.mjs` (sem rede): `produto.js` (peso, granel,
  promoção, SKU sem estoque), `vtex.js` com `fetch` falso (paginação,
  descida na árvore, retentativa, mercado que falha cai pro anterior),
  `busca.js` (normalização, prefixo, agrupamento por EAN, ordem, filtros),
  `lista.js` (totais por mercado, faltam N, cada item no mais barato,
  refresco de preço, item sumido), `armazenamento.js` (migração, backup).
- `node tests/navegador.mjs`: Playwright 1.63 da máquina
  (`~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`, Chromium) contra um
  servidor estático local com dados de `tests/fixtures/`: abrir, buscar,
  adicionar, quantidade, riscar, totais, recarregar e ver a lista salva,
  largura de celular (sem rolagem horizontal) e de desktop (duas colunas).
- Antes de publicar, rodar o robô de verdade uma vez (`--limite 3` categorias
  por mercado pra ser rápido) e conferir que o JSON gerado passa na tela.

## O que fica com quem constrói

- Estrutura exata de CSS e marcação; animações; ícones.
- Como cortar o texto do nome do produto pra caber no cartão.
- Tamanho do debounce, do lote de "Mostrar mais", do atraso entre pedidos.
- Como desenhar a confirmação de "Limpar lista" e o "Desfazer".
- Mensagens de erro exatas, desde que digam o que fazer.
- Se o índice de busca é construído no carregamento ou gravado pelo robô
  (desde que caiba no orçamento de tamanho e tempo).

## Riscos conhecidos

- A VTEX pode bloquear o IP do GitHub Actions. Sinal: mercado em falha por
  dias. Plano B (fora desta versão): rodar o robô na máquina do dono e dar
  push dos dados.
- Categoria com mais de 5000 produtos ficaria incompleta; hoje a maior de
  nível 1 tem 3625 (Giassi) e desce bem na árvore.
- Preço por região: o Angeloni pode mostrar preço de outra loja no canal
  padrão. Aviso fixo no cabeçalho cobre; escolher loja é não-objetivo.
