# Lista de mercado

Ideia (30/10/2026): a pessoa monta a lista de compras e a gente mostra, nos
supermercados perto dela, onde cada item está mais barato e o que está em
promoção.

Nasceu do protótipo de compras da esfiharia
(`../esfirraria/ops/compras.mjs`, lógica em `../esfirraria/functions/_lib/mercados.js`).

## O que já se sabe (testado em 30/10/2026)

- Bistek, Giassi e Angeloni usam loja VTEX: a busca pública
  `/api/catalog_system/pub/products/search?ft=<termo>&_from=0&_to=39` devolve
  JSON com preço, preço "de" (promoção), marca, foto, link e estoque.
  Espaço na busca vai como `%20` (com `+` dá 400). Granel: unidade "kg",
  `Price` por quilo, vende em passos de `unitMultiplier`.
- Não é API oficial pra terceiros: pode mudar ou ser bloqueada. O preço é o do
  site; loja física e preço de clube podem ser outros.
- O JSON não diz até quando vale a promoção (`PriceValidUntil` é técnico, um
  ano pra frente). A validade vem nos encartes do Tiendeo, que estão em imagem.
- Imperatriz: `superimperatriz.com.br` sem catálogo com preço (manda pro
  iFood); `imperatriz.com.br` é um açougue do Paraná, nada a ver. Fort
  Atacadista não é VTEX. Pradão e Mercado É de Casa: não achei.
- Achar o produto certo por palavra erra fácil (busca de "calabresa" traz
  pizza; manjericão casou com vinagre). É aqui que a IA entra.
- Já existe concorrente (o próprio Tiendeo junta encartes).

## Como funciona

Um robô (Node 22, sem dependências) roda no GitHub Actions 3x/dia, baixa os
catálogos de Bistek, Giassi e Angeloni e grava JSON em `public/dados/`. O
GitHub Pages publica o site estático de `public/`, que lê esses JSON. O
navegador nunca fala com os mercados.

Site previsto: https://brenisio.github.io/lista-de-mercado/

Desenho e plano em `docs/superpowers/`.

## Rodar na máquina

```bash
npm test
npm run robo -- --saida public/dados --limite 2
cd public && python3 -m http.server
```
