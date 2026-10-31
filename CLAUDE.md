# Lista de mercado

Site estático (GitHub Pages, HTML/CSS/JS puro, ES modules, sem build) em que a
pessoa monta a lista de compras e vê onde cada item está mais barato. Um robô
Node 22 baixa os catálogos de Bistek, Giassi e Angeloni (lojas VTEX) no
GitHub Actions, 3x/dia, e publica os JSON em `public/dados/`.

## Onde está o quê

- Desenho: `docs/superpowers/specs/2026-10-31-lista-de-mercado-design.md`
- Plano: `docs/superpowers/plans/`
- `robo/` baixa e normaliza os catálogos; `public/` é o site; `tests/` os testes.
- `public/departamentos.js` é a taxonomia do catálogo (departamento → seção
  por palavra-chave sobre o caminho de categoria de cada mercado).
- `public/preparo.js` lê o preparo das carnes do nome (bife, moída, cubos…)
  pros chips de preparo; `tests/fixtures/carnes/` é a fixture só de carne.
- `public/dados/` é gerado pelo robô e fica fora do git (só o `.gitkeep`).

## Como rodar

- Testes: `npm test` (`node --test --test-concurrency=4 tests/*.test.mjs`).
- Navegador (Playwright, já instalado na máquina): `npm run test:navegador`.
- Robô: `npm run robo -- --saida public/dados --limite 2`.
- Ver o site: `python3 -m http.server` dentro de `public/`.
- Limite de paralelismo: máquina de 16 GB com várias sessões abertas; não
  use mais de 4 workers em nenhum runner (os scripts já limitam a 4).

## Convenções

- Tudo em português: interface, comentários, nomes, commits, testes.
- Comentário explica o porquê, não o quê.
- Sem dependência npm. `package.json` só tem `type`, `engines` e scripts.
- Sem build e sem framework. Toda URL do site é relativa (o site vive num
  subcaminho: `https://brenisio.github.io/lista-de-mercado/`).
- Commit: primeira linha é o efeito pra quem usa; termina com
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Remoto por SSH (`Host github.com`, conta `brenisio`). Nunca usar `gh` neste
  repo, nunca adicionar remoto ou dar push sem o dono pedir.

## Armadilhas

Robô (VTEX):

- A API não é oficial: pode mudar ou ser bloqueada. O robô tem que falhar
  bem, sem apagar o último catálogo bom.
- `_from` no máximo 2500; página de no máximo 50 itens.
- Filtro de categoria só com caminho completo: `fq=C:/2/7/10/`
  (`fq=C:/10/` devolve 0).
- Sucesso é HTTP 206 (parcial), não 200; o total vem em `resources`.
- HTTP 500 intermitente em páginas soltas: 5 tentativas (1/2/4/8 s), depois
  pula a página com aviso; 3 páginas seguidas abandonam a categoria. 4xx não
  se repete.
- User-agent com acento dá 400: mantenha ASCII.
- Espaço na busca vai como `%20` (com `+` dá 400).
- O navegador nunca fala com os mercados (sem CORS); só o robô.
- `categorias` do arquivo é o caminho próprio de cada produto (o mais fundo
  de `categories`), não a categoria por onde o robô baixou: é o que separa
  o catálogo em seções.

Catálogo (`public/departamentos.js`):

- Mercado criou categoria nova? `node --test tests/departamentos.test.mjs`
  lista o que caiu em "Outros" ou ficou com o nome do mercado; acrescente a
  palavra na regra certa e atualize a lista esperada no teste. A fixture
  `tests/fixtures/vtex/arvores.json` é a árvore real dos três (31/10/2026).
- Regra mais específica antes da mais larga ("frutas secas" antes de
  "frutas"); as regras de seção rodam sobre o caminho sem o 1º nível, pra
  "Carnes, Aves e Peixes" não puxar tudo pra "Aves".

Publicação (`.github/workflows/atualizar.yml`):

- Cache de ~10 min do Pages; o `?v=` no `resumo.json` fura o do navegador.
- `TZ: America/Sao_Paulo` no workflow: o log e o "ontem 18h" dependem dele.
- Primeira publicação não tem anterior: com `--so-anterior` a saída 1 só é
  tolerada se `dados/resumo.json` publicado der 404 (site sobe sem preços);
  senão, e rastreando, 1 falha o job. 2 sempre falha.
- `public/dados/` fica fora do git; o dado vai só no artefato do Pages.

Testes:

- Playwright vem do cache do npx da máquina; outro caminho via
  `PLAYWRIGHT_DIR`.
- Scripts de teste já limitam workers (`--test-concurrency=4` e `1`).
