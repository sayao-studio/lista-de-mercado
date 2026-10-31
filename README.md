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
- Líquidos (leite, água, refrigerante, óleo, limpeza: ~35 % dos produtos com
  peso) aparecem em ml/l e R$/l desde a mudança que trouxe o campo `liquido`;
  vale a partir da próxima rodada do robô (arquivo velho continua em g/kg).
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

No site, a busca pelo nome compara o preço nos três mercados; com o campo
vazio aparece o **catálogo** inteiro, separado por departamento e seção
iguais nos três (a taxonomia está em `public/departamentos.js`, que mapeia
as árvores diferentes de cada mercado por palavra-chave). Pra isso o robô
grava a categoria própria de cada produto, não a categoria por onde baixou.

Desenho e plano em `docs/superpowers/`.

## Como o dado chega ao site

O workflow `.github/workflows/atualizar.yml` roda o robô, que grava os JSON em
`public/dados/`, e publica a pasta `public/` inteira como artefato do GitHub
Pages (`upload-pages-artifact` + `deploy-pages`). Nenhum dado entra no git:
`public/dados/` é ignorado (só o `.gitkeep` fica) e o histórico não cresce a
cada rodada.

O `resumo.json` aponta cada mercado como `<id>.json?v=<hora em que ele foi
baixado>`, então catálogo novo tem endereço novo e fura o cache. O Pages ainda guarda cache por
cerca de 10 minutos: um preço novo pode levar esse tempo pra aparecer.

Para configurar: **antes do primeiro run**, o dono liga o Pages em Settings >
Pages com "Source" = "GitHub Actions". O `enablement: true` do
`configure-pages` fica só como tentativa: o `GITHUB_TOKEN` padrão em geral não
tem permissão pra ligar o Pages sozinho.

## Gatilhos

| Gatilho | O que faz |
| --- | --- |
| Agendado (`17 9,15,21 * * *` UTC = 6h17, 12h17 e 18h17 de Brasília) | Rastreia os três mercados e publica. |
| `push` na `main` | Só republica: baixa os dados já publicados (`--so-anterior`) e sobe o código novo. Leva ~1 min e funciona mesmo com a VTEX fora. |
| Manual (`workflow_dispatch`) | Com "Rastrear" ligado, igual ao agendado; desligado, igual ao `push`. |

O minuto 17 é de propósito: o GitHub atrasa os agendamentos no minuto 0. O job
tem `timeout-minutes: 50` (cada mercado tem prazo de 40 min) e o log do robô
sai no horário de Brasília (`TZ: America/Sao_Paulo`).

Na primeira publicação ainda não existe site, então não há dados anteriores.
Só republicando, o workflow consulta `$SITE_URL/dados/resumo.json` antes: se
der 404, aceita a saída 1 do robô ("nenhum mercado com dados") e sobe o site
sem preços, que avisa "ainda sem preços". Se o resumo existir (ou der outro
erro) e o robô sair com 1, é falha: o job para e o site anterior continua no
ar, em vez de um site vazio por cima de um bom. Rastreando, saída 1 sempre é
falha.

## Quando um mercado falha

O robô tenta cada página 5 vezes (esperas de 1, 2, 4 e 8 s; erro 4xx não se
repete). Página que falha mesmo assim é pulada com aviso no log; 3 páginas
seguidas com falha abandonam a categoria. Mercado que termina com 0 produtos ou
com menos de 30 % do total esperado conta como falha e cai no catálogo
publicado antes (`--anterior`), com a data antiga — o site mostra a data de
cada mercado. Só se nenhum mercado tiver dados o robô sai com 1 e o deploy não
acontece (o site anterior fica no ar).

Se um mercado ficar em falha por dias (VTEX bloqueando o GitHub, API mudou):

1. Ver o log do workflow pra saber o motivo e rodar na máquina
   `npm run robo -- --saida public/dados --mercado <id>` pra conferir se é
   bloqueio do GitHub ou mudança da API (aí o código precisa de ajuste).
2. Rodar o robô na máquina e disparar o manual "só republicar" **não
   resolve**: `--so-anterior` baixa os dados do site publicado, não os da sua
   máquina.
3. O plano B é commitar os dados temporariamente e publicar a partir deles
   (exige ajustar o workflow pra não sobrescrever `public/dados/`), ou aceitar
   o buraco: o mercado fica com o último catálogo bom e a data velha até a
   fonte voltar. Detalhes do plano B:
   - os dados estão no `.gitignore`, então precisam de `git add -f public/dados/*.json`;
   - o environment `github-pages` por padrão só publica da branch padrão, então
     o caminho real é commitar os dados temporariamente na `main` (ou mudar a
     regra do environment) e tirá-los de novo quando a fonte voltar.

## Testado em 31/10/2026, 01h43–01h57 (rodada completa de verdade)

| Mercado | Produtos | Sem EAN | Sem peso | Granel | Em promoção | Categorias |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Bistek | 7 078 | 305 | 637 | 0 | 1 919 | 28 |
| Giassi | 9 880 | 438 | 977 | 351 | 2 137 | 31 |
| Angeloni | 10 996 | 623 | 976 | 477 | 1 286 | 53 |

- Total publicado: 1,4 MB em gzip (orçamento de 3 MB).
- A VTEX devolve HTTP 500 de vez em quando em páginas soltas ("Failing getting
  sku document group from index"); a retentativa e o pulo de página cobrem.
- O Bistek não tem SKU em `kg`: hortifrúti é vendido por unidade ("un").
- O user-agent é só ASCII (`Mozilla/5.0 (lista-de-mercado; robo de precos)`):
  com acento a VTEX responde 400.

## Rodar na máquina

```bash
npm test                                          # testes sem rede
npm run test:navegador                            # Playwright contra as fixtures
npm run robo -- --saida public/dados --limite 2   # robô de verdade, 2 categorias por mercado
node tests/servidor.mjs                           # site com os dados de teste (fixtures)
python3 -m http.server -d public                  # site com o que o robô baixou
```
