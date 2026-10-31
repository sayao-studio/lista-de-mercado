import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caminhoFq, buscarComRetentativa, totalDe, paginas, rastrear, ErroRastreio } from "../robo/vtex.js";

// Árvore de verdade do Bistek (31/10/2026), só Bebidas (id 2, 12 filhos) e
// Hortifrúti (id 14, 5 filhos sem netos).
const arvoreBistek = JSON.parse(readFileSync(new URL("./fixtures/vtex/arvore-bistek.json", import.meta.url), "utf8"));

const mercado = { id: "bistek", nome: "Bistek", site: "https://www.bistek.com.br", ignorar: ["Floricultura e Jardim"] };
const esperarNada = async () => {};

// Fetch de mentira: `rotas` é um mapa url → resposta ou uma função url → resposta.
// Resposta = { status = 206, headers = {}, body = [] } ou um Error para lançar
// (falha de rede). Guarda as URLs pedidas em `chamadas` para os testes olharem.
function fetchFalso(rotas) {
  const chamadas = [];
  const fazerFetch = async (url, opcoes) => {
    chamadas.push(String(url));
    const spec = typeof rotas === "function" ? rotas(String(url), opcoes) : rotas[String(url)];
    if (spec instanceof Error) throw spec;
    if (!spec) return new Response("não achei", { status: 404 });
    const { status = 206, headers = {}, body = [] } = spec;
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { fazerFetch, chamadas };
}

// Produto VTEX mínimo que `linhasDoProduto` aceita: um SKU com estoque e preço.
function produtoFalso(sku) {
  return {
    productName: `Produto ${sku}`,
    brand: "Marca",
    linkText: `produto-${sku}`,
    items: [{
      itemId: String(sku),
      nameComplete: `Produto ${sku} 1kg`,
      ean: "",
      measurementUnit: "un",
      unitMultiplier: 1,
      images: [{ imageUrl: `https://bistek.vteximg.com.br/arquivos/ids/${sku}-500-500/foto.jpg` }],
      sellers: [{ commertialOffer: { Price: 10, ListPrice: 10, AvailableQuantity: 5 } }],
    }],
  };
}
const produtos = (de, ate) => Array.from({ length: ate - de }, (_, i) => produtoFalso(de + i));

// Loja de mentira que responde árvore, total (`resources`) e páginas.
// `totais` e `itens` são indexados pelo caminho "2/7/10"; total ausente = 0,
// total null = sem cabeçalho. `itens[caminho]` é uma lista ou uma função
// (from, to, ordem) → lista. `falhar(url)` devolve um status para a loja
// responder no lugar (ex.: 503) ou nada para seguir normal.
function lojaFalsa({ arvore = arvoreBistek, totais = {}, itens = {}, falhar = () => undefined } = {}) {
  return fetchFalso((url) => {
    const status = falhar(url);
    if (status) return { status };
    const u = new URL(url);
    if (u.pathname.endsWith("/category/tree/3")) return { body: arvore };
    const caminho = u.searchParams.get("fq").replace(/^C:\//, "").replace(/\/$/, "");
    const de = Number(u.searchParams.get("_from"));
    const ate = Number(u.searchParams.get("_to"));
    if (ate === 0) {
      const total = caminho in totais ? totais[caminho] : 0;
      return { headers: total === null ? {} : { resources: `0-0/${total}` }, body: [] };
    }
    const fonte = itens[caminho] ?? [];
    const ordem = (u.searchParams.get("O") || "").replace("OrderByPrice", "") || undefined;
    return { body: typeof fonte === "function" ? fonte(de, ate, ordem) : fonte.slice(de, ate + 1) };
  });
}

const pedidosDeBusca = (chamadas, caminho) => chamadas.filter((c) => c.includes(`fq=C:/${caminho}/&`) && !c.includes("_to=0&") && !c.endsWith("_to=0"));
const pedidosDeTotal = (chamadas, caminho) => chamadas.filter((c) => c.includes(`fq=C:/${caminho}/&`) && /_from=0&_to=0(&|$)/.test(c));

test("caminhoFq monta o filtro com caminho completo", () => assert.equal(caminhoFq([2, 7, 10]), "C:/2/7/10/"));

test("buscarComRetentativa tenta 5 vezes com espera crescente e desiste com a mensagem", async () => {
  const esperas = [];
  const esperar = async (ms) => { esperas.push(ms); };
  const cincoFalhas = fetchFalso(() => ({ status: 503 }));
  await assert.rejects(buscarComRetentativa("https://x/a", { fazerFetch: cincoFalhas.fazerFetch, esperar }), { message: "HTTP 503 depois de 5 tentativas" });
  assert.equal(cincoFalhas.chamadas.length, 5);
  assert.deepEqual(esperas, [1000, 2000, 4000, 8000]);

  let n = 0;
  const umaFalha = fetchFalso(() => (n++ === 0 ? { status: 503 } : { status: 206, body: [1] }));
  const r = await buscarComRetentativa("https://x/a", { fazerFetch: umaFalha.fazerFetch, esperar: esperarNada });
  assert.equal(r.status, 206);
  assert.equal(umaFalha.chamadas.length, 2);

  // Erro de rede conta como tentativa falha, igual a um 5xx.
  const semRede = fetchFalso(() => new Error("fetch failed"));
  await assert.rejects(buscarComRetentativa("https://x/a", { fazerFetch: semRede.fazerFetch, esperar: esperarNada }), { message: "fetch failed depois de 5 tentativas" });
  assert.equal(semRede.chamadas.length, 5);
});

test("buscarComRetentativa diz tempo esgotado em português quando estoura o timeout", async () => {
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const lenta = fetchFalso(() => timeout);
  await assert.rejects(buscarComRetentativa("https://x/a", { fazerFetch: lenta.fazerFetch, esperar: esperarNada }), { message: "tempo esgotado (20 s) depois de 5 tentativas" });
  const abortado = fetchFalso(() => Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
  await assert.rejects(buscarComRetentativa("https://x/a", { fazerFetch: abortado.fazerFetch, esperar: esperarNada }), { message: "tempo esgotado (20 s) depois de 5 tentativas" });
});

test("buscarComRetentativa não retenta 4xx: o pedido está errado, repetir não ajuda", async () => {
  const esperas = [];
  const recusa = fetchFalso(() => ({ status: 400 }));
  await assert.rejects(buscarComRetentativa("https://x/a", { fazerFetch: recusa.fazerFetch, esperar: async (ms) => { esperas.push(ms); } }), { message: "HTTP 400" });
  assert.equal(recusa.chamadas.length, 1);
  assert.deepEqual(esperas, []);
});

test("rastrear com a loja dando 503 sempre vira ErroRastreio", async () => {
  const { fazerFetch, chamadas } = fetchFalso(() => ({ status: 503 }));
  await assert.rejects(rastrear(mercado, { fazerFetch, esperar: esperarNada }), (e) => {
    assert.ok(e instanceof ErroRastreio);
    assert.equal(e.message, "Bistek: HTTP 503 depois de 5 tentativas");
    return true;
  });
  assert.equal(chamadas.length, 5);
});

test("totalDe lê o cabeçalho resources", async () => {
  const comTotal = fetchFalso(() => ({ headers: { resources: "0-0/2629" } }));
  assert.equal(await totalDe(mercado, [2], { fazerFetch: comTotal.fazerFetch, esperar: esperarNada }), 2629);
  assert.deepEqual(comTotal.chamadas, ["https://www.bistek.com.br/api/catalog_system/pub/products/search?fq=C:/2/&_from=0&_to=0"]);
  const semTotal = fetchFalso(() => ({ headers: {} }));
  assert.equal(await totalDe(mercado, [2], { fazerFetch: semTotal.fazerFetch, esperar: esperarNada }), null);
});

test("paginas anda de 50 em 50 e para na página vazia", async () => {
  const { fazerFetch, chamadas } = lojaFalsa({ itens: { "2/7/10": produtos(1, 121) } });
  const tamanhos = [];
  for await (const pagina of paginas(mercado, [2, 7, 10], { fazerFetch, esperar: esperarNada })) tamanhos.push(pagina.length);
  assert.deepEqual(tamanhos, [50, 50, 20]);
  const base = "https://www.bistek.com.br/api/catalog_system/pub/products/search?fq=C:/2/7/10/";
  assert.deepEqual(chamadas, [`${base}&_from=0&_to=49`, `${base}&_from=50&_to=99`, `${base}&_from=100&_to=149`, `${base}&_from=150&_to=199`]);
});

test("rastrear sem cabeçalho resources baixa o nó direto até a página vazia", async () => {
  // Hortifrúti sem total: pagina o próprio departamento, sem descer nos filhos.
  // Bebidas sem total e loja que nunca devolve página vazia: para no teto 2500.
  const { fazerFetch, chamadas } = lojaFalsa({
    totais: { 2: null, 14: null },
    itens: { 14: produtos(1, 71), 2: (de) => [produtoFalso(100000 + de)] },
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada });
  assert.deepEqual(r.categorias, ["Bebidas", "Hortifrúti"]);
  assert.equal(r.totalEsperado, 0);
  assert.equal(pedidosDeTotal(chamadas, "14/35").length, 0);
  assert.equal(pedidosDeTotal(chamadas, "2/7").length, 0);
  const buscasBebidas = pedidosDeBusca(chamadas, 2);
  assert.equal(buscasBebidas.length, 51);
  assert.match(buscasBebidas.at(-1), /_from=2500&_to=2549$/);
  assert.equal(pedidosDeBusca(chamadas, 14).length, 3); // 50, 20, vazia
  assert.equal(r.produtos.filter((p) => p.categoria === 1).length, 70);
  assert.equal(r.baixados, 51 + 70);
});

test("rastrear baixa categoria ≤ 2500 inteira e desce quando passa de 2500", async () => {
  const { fazerFetch, chamadas } = lojaFalsa({
    totais: { 2: 3000, "2/7": 100, 14: 300 },
    itens: { "2/7": produtos(1, 101), 14: produtos(1001, 1301) },
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada, agora: () => Date.UTC(2026, 9, 31, 12) });
  assert.deepEqual(r.categorias, ["Bebidas > Refrigerantes", "Hortifrúti"]);
  assert.equal(r.totalEsperado, 400);
  assert.equal(r.baixados, 400);
  assert.equal(r.produtos.length, 400);
  assert.equal(r.produtos[0].categoria, 0);
  assert.equal(r.produtos.at(-1).categoria, 1);
  assert.equal(r.produtos[0].id, "1");
  assert.equal(pedidosDeBusca(chamadas, 2).length, 0); // Bebidas inteira não é paginada
  assert.equal(pedidosDeTotal(chamadas, "2/7/10").length, 0); // Refrigerantes cabe, não desce
  assert.equal(pedidosDeTotal(chamadas, "14/35").length, 0);
  assert.equal(r.mercado, "bistek");
  assert.equal(r.nome, "Bistek");
  assert.equal(r.site, "https://www.bistek.com.br");
  assert.equal(r.fotos, "https://bistek.vteximg.com.br/arquivos/ids/");
  assert.equal(r.atualizadoEm, "2026-10-31T12:00:00.000Z");
  assert.deepEqual(r.avisos, []);
});

test("rastrear ignora departamento da lista ignorar e categoria com total 0", async () => {
  const flores = { id: 99, name: "Floricultura e Jardim", hasChildren: false, url: "", children: [] };
  const { fazerFetch, chamadas } = lojaFalsa({
    arvore: [...arvoreBistek, flores],
    totais: { 2: 0, 14: 50, 99: 40 },
    itens: { 14: produtos(1, 51), 99: produtos(500, 540) },
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada });
  assert.deepEqual(r.categorias, ["Hortifrúti"]);
  assert.equal(chamadas.filter((c) => c.includes("fq=C:/99/")).length, 0);
  assert.equal(pedidosDeBusca(chamadas, 2).length, 0);
  assert.equal(pedidosDeTotal(chamadas, "2/7").length, 0);
  assert.equal(r.produtos.length, 50);
});

test("rastrear na folha com mais de 2500 baixa ASC e DESC e avisa", async () => {
  const lista = { ASC: produtos(1, 1501), DESC: produtos(1001, 2501) };
  const { fazerFetch, chamadas } = lojaFalsa({
    totais: { 2: 3000, "2/7": 3000, "2/7/10": 3000 },
    itens: { "2/7/10": (de, ate, ordem) => (ordem ? lista[ordem].slice(de, ate + 1) : []) },
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada });
  assert.deepEqual(r.avisos, ["Zero, Light e Diet: mais de 2500 produtos, pode ter ficado buraco"]);
  assert.deepEqual(r.categorias, ["Bebidas > Refrigerantes > Zero, Light e Diet"]);
  assert.equal(r.totalEsperado, 3000);
  assert.equal(r.baixados, 3000);
  assert.equal(r.produtos.length, 2500);
  const buscas = pedidosDeBusca(chamadas, "2/7/10");
  assert.ok(buscas.some((c) => c.endsWith("&O=OrderByPriceASC")));
  assert.ok(buscas.some((c) => c.endsWith("&O=OrderByPriceDESC")));
});

test("rastrear remove SKU repetido entre categorias", async () => {
  const { fazerFetch } = lojaFalsa({
    totais: { 2: 3000, "2/7": 3, 14: 2 },
    itens: { "2/7": produtos(1, 4), 14: [produtoFalso(2), produtoFalso(9)] },
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada });
  assert.deepEqual(r.produtos.map((p) => [p.id, p.categoria]), [["1", 0], ["2", 0], ["3", 0], ["9", 1]]);
  assert.equal(r.baixados, 5);
});

test("rastrear falha quando baixou menos de 30% do esperado", async () => {
  const { fazerFetch } = lojaFalsa({ totais: { 14: 1000 }, itens: { 14: produtos(1, 101) } });
  await assert.rejects(rastrear(mercado, { fazerFetch, esperar: esperarNada }), (e) => {
    assert.ok(e instanceof ErroRastreio);
    assert.equal(e.name, "ErroRastreio");
    assert.match(e.message, /100/);
    assert.match(e.message, /1000/);
    return true;
  });
});

test("rastrear pula página que falha e segue nas próximas", async () => {
  // A busca da VTEX devolve 500 em páginas soltas ("Failing getting sku
  // document group from index") enquanto o resto do catálogo responde.
  const logs = [];
  const { fazerFetch, chamadas } = lojaFalsa({
    totais: { 14: 120 },
    itens: { 14: produtos(1, 121) },
    falhar: (url) => (url.includes("fq=C:/14/&_from=50&") ? 503 : undefined),
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada, log: (m) => logs.push(m) });
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /^Hortifrúti: página _from=50 falhou/);
  assert.match(r.avisos[0], /HTTP 503/);
  assert.ok(logs.some((m) => m.includes(r.avisos[0])));
  assert.deepEqual(r.produtos.map((p) => p.id), [...produtos(1, 51), ...produtos(101, 121)].map((p) => p.items[0].itemId));
  assert.equal(r.baixados, 70);
  assert.equal(r.totalEsperado, 120);
  assert.equal(pedidosDeBusca(chamadas, 14).filter((c) => c.includes("_from=50&")).length, 5);
});

test("rastrear pula página com HTTP 400 sem retentar", async () => {
  const { fazerFetch, chamadas } = lojaFalsa({
    totais: { 14: 120 },
    itens: { 14: produtos(1, 121) },
    falhar: (url) => (url.includes("fq=C:/14/&_from=50&") ? 400 : undefined),
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada });
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /página _from=50 falhou \(HTTP 400\)/);
  assert.equal(pedidosDeBusca(chamadas, 14).filter((c) => c.includes("_from=50&")).length, 1);
  assert.equal(r.baixados, 70);
});

test("rastrear ainda falha quando sobra menos de 30%", async () => {
  // Só a primeira página responde: pular as outras não pode esconder loja quebrada.
  const { fazerFetch } = lojaFalsa({
    totais: { 14: 1000 },
    itens: { 14: produtos(1, 1001) },
    falhar: (url) => (url.includes("fq=C:/14/&") && !url.includes("_from=0&") ? 503 : undefined),
  });
  await assert.rejects(rastrear(mercado, { fazerFetch, esperar: esperarNada }), (e) => {
    assert.ok(e instanceof ErroRastreio);
    assert.match(e.message, /baixou 50 de 1000/);
    return true;
  });
});

test("rastrear trata total que falha como categoria sem total", async () => {
  const { fazerFetch, chamadas } = lojaFalsa({
    totais: { 2: 0 },
    itens: { 14: produtos(1, 71) },
    falhar: (url) => (/fq=C:\/14\/&_from=0&_to=0$/.test(url) ? 503 : undefined),
  });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada });
  assert.deepEqual(r.avisos, ["Hortifrúti: total falhou (HTTP 503 depois de 5 tentativas)"]);
  assert.deepEqual(r.categorias, ["Hortifrúti"]);
  assert.equal(r.totalEsperado, 0);
  assert.equal(r.produtos.length, 70);
  assert.equal(pedidosDeBusca(chamadas, 14).length, 3); // 50, 20, vazia
  assert.equal(pedidosDeTotal(chamadas, "14/35").length, 0); // não desce nos filhos
});

test("rastrear falha quando estoura o prazo", async () => {
  let t = 0;
  const loja = lojaFalsa({ totais: { 14: 50 }, itens: { 14: produtos(1, 51) } });
  // Depois da árvore o relógio pula 21 minutos.
  const fazerFetch = async (url, op) => { const r = await loja.fazerFetch(url, op); t += 21 * 60 * 1000; return r; };
  await assert.rejects(rastrear(mercado, { fazerFetch, esperar: esperarNada, agora: () => t }), (e) => {
    assert.ok(e instanceof ErroRastreio);
    assert.match(e.message, /prazo de 20 min estourado/);
    return true;
  });
  assert.equal(loja.chamadas.length, 1);
});

test("rastrear respeita o limite de departamentos", async () => {
  const { fazerFetch, chamadas } = lojaFalsa({ totais: { 2: 10, 14: 10 }, itens: { 2: produtos(1, 11), 14: produtos(20, 30) } });
  const r = await rastrear(mercado, { fazerFetch, esperar: esperarNada, limite: 1 });
  assert.deepEqual(r.categorias, ["Bebidas"]);
  assert.equal(chamadas.filter((c) => c.includes("fq=C:/14/")).length, 0);
});

test("rastrear espera entre pedidos", async () => {
  const eventos = [];
  const loja = lojaFalsa({ totais: { 2: 3000, "2/7": 60, 14: 10 }, itens: { "2/7": produtos(1, 61), 14: produtos(100, 110) } });
  const fazerFetch = async (url, op) => { eventos.push("fetch"); return loja.fazerFetch(url, op); };
  const esperar = async (ms) => { eventos.push(ms); };
  await rastrear(mercado, { fazerFetch, esperar });
  const fetches = eventos.filter((e) => e === "fetch").length;
  assert.ok(fetches > 10);
  assert.equal(eventos[0], "fetch"); // o primeiro pedido não espera
  assert.deepEqual(eventos.filter((e) => e !== "fetch"), Array(fetches - 1).fill(100));
  // Nunca dois pedidos seguidos sem pausa.
  for (let i = 1; i < eventos.length; i++) assert.ok(!(eventos[i] === "fetch" && eventos[i - 1] === "fetch"));
});

test("cabeçalhos do pedido só têm ASCII (a loja devolve 400 com acento)", async () => {
  let cabecalhos;
  const fazerFetch = async (url, opcoes) => {
    cabecalhos = opcoes.headers;
    return new Response("[]", { status: 206 });
  };
  await buscarComRetentativa("https://loja/api", { fazerFetch, esperar: esperarNada });
  for (const valor of Object.values(cabecalhos)) assert.match(valor, /^[\x20-\x7e]*$/);
});
