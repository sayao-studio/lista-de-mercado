# Lista de mercado

Site estático (GitHub Pages, HTML/CSS/JS puro, ES modules, sem build) em que a
pessoa monta a lista de compras e vê onde cada item está mais barato. Um robô
Node 22 baixa os catálogos de Bistek, Giassi e Angeloni (lojas VTEX) no
GitHub Actions, 3x/dia, e publica os JSON em `public/dados/`.

## Onde está o quê

- Desenho: `docs/superpowers/specs/2026-10-31-lista-de-mercado-design.md`
- Plano: `docs/superpowers/plans/`
- `robo/` baixa e normaliza os catálogos; `public/` é o site; `tests/` os testes.
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

## Armadilhas do robô (VTEX)

- A API não é oficial: pode mudar ou ser bloqueada. O robô tem que falhar
  bem, sem apagar o último catálogo bom.
- `_from` no máximo 2500; página de no máximo 50 itens.
- Filtro de categoria só com caminho completo: `fq=C:/2/7/10/`
  (`fq=C:/10/` devolve 0).
- Resposta normal é HTTP 206 (parcial), não 200; o total vem em `resources`.
- Espaço na busca vai como `%20` (com `+` dá 400).
- O GitHub Pages guarda cache por 10 minutos; dado novo não aparece na hora.
- O navegador nunca fala com os mercados (sem CORS); só o robô.
