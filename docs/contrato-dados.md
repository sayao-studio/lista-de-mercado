# Contrato dos dados publicados

Os arquivos abaixo saem no GitHub Pages e podem ser lidos por qualquer
programa por HTTP (a esfiharia lê assim). Base:
`https://sayao-studio.github.io/lista-de-mercado/`.

## Garantias

- Todo arquivo tem `versao` (número). Enquanto for `1`, campo existente não
  muda de nome, de tipo nem de significado e não some. Campo novo pode
  aparecer a qualquer momento: ignore o que não conhece.
- Mudança que quebra (renomear, mudar unidade, tirar campo) sobe a `versao`.
- Dinheiro é sempre inteiro em **centavos**. Peso é sempre em **gramas**
  (ml contam como g; `liquido` diz qual dos dois).
- Datas: `atualizadoEm`/`geradoEm` em ISO 8601 UTC; `inicio`/`fim`/`ate` em
  `AAAA-MM-DD` (horário de Brasília).
- `tests/contrato.test.mjs` confere este contrato nas fixtures e, quando
  existem na máquina, nos arquivos reais.

## Como buscar

Leia o `resumo.json` sem cache; baixe `dados/` + `arquivo` (com o `?v=`).
O `?v=` só muda com rastreio novo: guarde o catálogo por ele em vez de
baixar ~8 MB (1,5 MB em gzip) a cada consulta. O `encartes.json` não tem
`?v=` nem entrada no resumo: use `geradoEm` e o `fim` de cada encarte.

## Versões

Mudança que quebra vira `versao: 2`, publicada **ao lado** da 1 (por
exemplo `dados/v2/`) por pelo menos 4 semanas, com aviso neste arquivo.
O histórico de mudanças fica no fim deste documento.

## `dados/resumo.json`

Sempre buscar sem cache. Diz quais catálogos existem e onde estão.

```json
{ "versao": 1, "geradoEm": "2026-11-01T03:45:00.000Z",
  "mercados": {
    "bistek": { "nome": "Bistek", "atualizadoEm": "…", "produtos": 7060, "arquivo": "bistek.json?v=1793434313" },
    "giassi": { "nome": "Giassi", "erro": "HTTP 503 depois de 5 tentativas" } } }
```

- Mercado com `erro` não tem catálogo nesta publicação (não monte
  `<id>.json` na mão: use `arquivo`). Ausência de um mercado é diferente de
  `erro`: o conjunto de chaves pode mudar.
- `incompletas` (opcional, lista de caminhos): o catálogo saiu com essas
  categorias pela metade (página da VTEX que falhou). Produto ausente ali
  **não** quer dizer que sumiu da loja.
- `atualizadoEm` é o **início** do rastreio. O robô roda às 6h17, 12h17 e
  18h17 (Brasília), mas pode atrasar dias se a loja falhar: compare com a
  hora atual.
- `arquivo` é relativo a `dados/` e muda quando o catálogo muda (o `?v=`
  fura cache). Mercados hoje: `bistek`, `giassi`, `angeloni`.

## `dados/<mercado>.json` (catálogo)

```json
{ "versao": 1, "mercado": "bistek", "nome": "Bistek", "site": "https://www.bistek.com.br",
  "fotos": "https://bistek.vteximg.com.br/arquivos/ids/", "atualizadoEm": "…",
  "categorias": ["Mercearia > Massas > Macarrão", "…"],
  "produtos": [ { "id": "2013800", "nome": "Água Mineral Da Pedra Com Gás 500ml", "marca": "Da Pedra",
    "ean": "7896436100642", "gramas": 500, "granel": false, "liquido": true,
    "preco": 180, "promocao": 0, "foto": "206464",
    "link": "agua-mineral-da-pedra-com-gas-500ml-2013800", "categoria": 0 } ] }
```

| Campo | Significado |
| --- | --- |
| `id` | id do SKU na loja (texto). Único no arquivo e **estável** entre rodadas. |
| `nome`, `marca` | como a loja escreve. `marca` pode ser `""`. |
| `ean` | GTIN válido ou `""` (sem EAN, código interno ou peso variável). |
| `gramas` | peso/volume da embalagem, **número, pode ter fração** (41.5); `null` quando o nome não diz. Em "saco de lixo 50l" é capacidade, não conteúdo. **Com `granel: true`, é o passo de venda** (unitMultiplier × 1000). |
| `granel` | vendido por peso, em passos de `gramas`. |
| `liquido` | `gramas` é ml (mostrar l e R$/l). |
| `preco` | preço de hoje, em centavos, **de uma embalagem ou de um passo** de granel. |
| `promocao` | preço "de" (maior que `preco`) quando há promoção; senão `0`. |
| `foto` | id da imagem: URL = `fotos + foto + "-120-120"` (ou `-500-500`). `""` sem foto; `fotos` pode ser `""`. |
| `link` | slug: página = `site + "/" + link + "/p"`. Pode ser `""`. |
| `liquido` | opcional (arquivo antigo não tem): ausente vale `false`. |
| `categoria` | índice em `categorias`: o caminho próprio do produto na árvore da loja. |

- Só entra SKU com estoque e preço (AvailableQuantity > 0 e Price > 0).
- R$/kg = `preco / gramas * 1000` (centavos por kg ou por litro).
- `promocao` é o preço "de" da loja, sem data de validade.
- Casar o mesmo produto entre lojas: pelo `ean`; sem ele, `mercado:id` é
  só daquela loja.
- Levar N gramas: `ceil(N / gramas)` embalagens (ou passos) × `preco`.

## `encartes.json` (na raiz, não em `dados/`)

Encartes da semana dos mercados sem catálogo no site (Imperatriz, Magia,
Atacadão…), gerados na máquina do dono (`npm run encartes`). Pode não
existir (404) ou estar desatualizado: confira `fim`/`ate`.

```json
{ "versao": 1, "geradoEm": "…", "avisos": ["…"], "ia": { "custo": 0.19, "lotes": 3, "paginas": 10 },
  "mercados": { "imperatriz": { "versao": 1, "mercado": "imperatriz", "nome": "Imperatriz",
    "site": "https://www.tiendeo.com.br", "fotos": "", "atualizadoEm": "…", "categorias": ["Encarte"],
    "encartes": [ { "id": "1406650", "titulo": "Oportunidades do SEMANA", "inicio": "2026-10-26",
      "fim": "2026-11-03", "link": "https://www.tiendeo.com.br/Catalogos/1406650", "fonte": "ia", "produtos": 26 } ],
    "produtos": [ { "…mesmos campos do catálogo…": "",
      "url": "https://www.tiendeo.com.br/Catalogos/1406650", "fotoUrl": null,
      "condicao": "R$ 3,29 ativando no app Super Clube", "ate": "2026-11-03", "encarte": "1406650" } ] } } }
```

- Cada mercado é um catálogo no formato acima, mais `encartes` e, por
  produto, `url` (página do encarte), `fotoUrl` (foto https do recorte ou
  `null`), `condicao` (clube, app, leve x pague y, ou `null`), `ate` (último
  dia) e `encarte` (id do encarte em `encartes`).
- O `id` do produto de encarte é `<id do encarte>-<hash do nome>`: estável
  enquanto o encarte e o nome do produto forem os mesmos; some com o encarte.
- `condicao` às vezes traz **outro preço** ("R$ 3,29 ativando no app"):
  `preco` é o de quem não é sócio do clube.
- Encarte de atacado pode ter nome genérico ("Cerveja") e quase nunca traz
  peso; `categoria` é sempre 0 (`"Encarte"`), sem taxonomia.
- Fora do contrato (podem mudar ou sumir): `avisos`, `ia`, `encartes[].fonte`
  e `encartes[].produtos`.
- `fonte`: `"recortes"` (preço do Tiendeo, sem IA; peso só se estiver no
  nome) ou `"ia"` (página lida pela IA: confira a olho se algo for decisivo).
- Preço por quilo vem como `granel: true` e `gramas: 1000`.
- Bistek, Giassi e Angeloni não aparecem aqui: o catálogo do site vale mais.

## Histórico

- 01/11/2026: primeira versão publicada. `incompletas` (resumo e catálogo),
  `fotos` nunca `null`, id de encarte estável por nome.
