// Encartes do Tiendeo: lista e validade, páginas do visualizador, leitura
// pela IA (sem IA de verdade: quem "lê" é uma função de teste) e a montagem
// do catálogo de encarte. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listaEncartes, validosHoje, recortes, paginasDaPublicacao, PAGINAS_PUBLICACAO, TIENDEO } from "../robo/encartes/tiendeo.js";
import { interpretar, lerPaginas, dataLida, numeroLido, pedidoDoLote, PEDIDO, ESQUEMA, argumentos, hashDe } from "../robo/encartes/leitura.mjs";
import { montarEncartes, linhaDoRecorte, linhaDoItem, idDoMercado } from "../robo/encartes/montar.mjs";

const paginaNext = (dados) => `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(dados)}</script></body></html>`;
const flyer = (id, extra = {}) => ({
  id, retailer_id: "9", retailerName: "Mercado " + id, title: "Ofertas " + id, type: "flyer", distance: "1.2",
  start_date: "2026-10-29T00:00:00.000Z", end_date: "2026-11-04T00:00:00.000Z", category_id: "5", ...extra,
});
const zmags = JSON.parse(readFileSync(new URL("./fixtures/encartes/zmags-paginas-877179.json", import.meta.url), "utf8"));

test("listaEncartes guarda a validade, a rede e o número da publicação", () => {
  const [e] = listaEncartes(paginaNext({ a: [flyer("1406650", { retailerName: "Supermercados Imperatriz", publication_url: "http://viewer.zmags.com/publication/pt_br_877179" })] }));
  assert.deepEqual([e.mercado, e.inicio, e.fim, e.nacional, e.publicacao], ["Imperatriz", "2026-10-29", "2026-11-04", false, "877179"]);
  assert.equal(PAGINAS_PUBLICACAO("877179"), "https://api-viewer-zmags.shopfully.cloud/publication_pages/pt_br/877179/1");
  assert.deepEqual(listaEncartes("<html>nada</html>"), []);
});

test("validosHoje fica com supermercado local no período, sem título de outro mês", () => {
  const l = [
    { id: "a", categoria: "5", inicio: "2026-10-29", fim: "2026-11-04", titulo: "x", nacional: false },
    { id: "b", categoria: "2", inicio: "2026-10-29", fim: "2026-11-04", titulo: "operadora", nacional: false },
    { id: "c", categoria: "5", inicio: "2026-10-01", fim: "2026-10-30", titulo: "venceu", nacional: false },
    { id: "d", categoria: "5", inicio: "2026-10-29", fim: "2026-11-04", titulo: "LÂMINA RIO DE JANEIRO", nacional: true },
    { id: "e", categoria: "5", inicio: "2026-05-01", fim: "2026-11-01", titulo: "Food Service 05 a 11 JAN 26", nacional: false },
  ];
  assert.deepEqual(validosHoje(l, "2026-10-31").map((e) => e.id), ["a"]);
});

test("paginasDaPublicacao com a resposta real do Imperatriz: 7 páginas, na ordem, só shopfully", () => {
  const p = paginasDaPublicacao(zmags);
  assert.deepEqual(p.map((x) => x.pagina), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(p.every((x) => /^https:\/\/[\w.-]+\.shopfully\.cloud\//.test(x.url)));
  const pag = (n, path) => ({ pageNumber: n, pageRepresentationDescriptors: [{ type: "image", height: 1500, pageRepresentation: { resourcePath: path } }] });
  assert.deepEqual(paginasDaPublicacao({ 1: pag(1, "evil.example.com/x.jpeg"), 2: { lixo: true } }), []);
  assert.deepEqual(paginasDaPublicacao(null), []);
});

const envelope = (paginas, extra = {}) => JSON.stringify({ type: "result", subtype: "success", structured_output: { paginas }, total_cost_usd: 0.02, modelUsage: { "claude-sonnet-5-5": {} }, ...extra });

test("interpretar: datas válidas, item sem preço fora, texto curto, número estranho vira null", () => {
  const r = interpretar(envelope([
    { arquivo: "/tmp/x/a.jpeg", inicio: "2026-10-30", fim: "2026-02-30", itens: [
      { produto: " Café Pilão 500g ", gramas: 500, preco: 22.99, unidade: "embalagem", condicao: null },
      { produto: "Alcatra", gramas: "1kg", preco: "49,90", unidade: "KG", condicao: "ativando no app ".repeat(10) },
      { produto: "Sem preço", gramas: 1, preco: null, unidade: "embalagem", condicao: null },
    ] },
    { inicio: null, itens: [] },
  ]));
  assert.equal(r.paginas.length, 1);
  const [a] = r.paginas;
  assert.deepEqual([a.arquivo, a.inicio, a.fim, a.itens.length], ["a.jpeg", "2026-10-30", null, 2]);
  assert.deepEqual(a.itens[0], { produto: "Café Pilão 500g", gramas: 500, preco: 22.99, unidade: "embalagem", condicao: null });
  assert.deepEqual([a.itens[1].gramas, a.itens[1].preco, a.itens[1].unidade, a.itens[1].condicao.length], [null, 49.9, "kg", 80]);
  assert.equal(r.custo, 0.02);
  assert.throws(() => interpretar(envelope([], { is_error: true, result: "caiu" })), /erro: caiu/);
  assert.throws(() => interpretar(envelope([], { subtype: "error_max_turns" })), /error_max_turns/);
  assert.throws(() => interpretar(JSON.stringify({ subtype: "success", structured_output: {} })), /sem a lista/);
  assert.equal(dataLida("2026-11-02"), "2026-11-02");
  assert.equal(numeroLido("1.000"), 1000);
});

test("a IA roda numa caixa fechada: só Read na pasta, sem customização, resposta presa ao schema", () => {
  const args = argumentos("x");
  for (const a of ["--safe-mode", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands"]) assert.ok(args.includes(a), a);
  assert.equal(args[args.indexOf("--tools") + 1], "Read");
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Read(./**)");
  assert.deepEqual(JSON.parse(args[args.indexOf("--json-schema") + 1]), ESQUEMA);
  assert.match(pedidoDoLote(["a.jpeg"], "2026-10-31"), /Hoje é 2026-10-31\. Os arquivos desta pasta são: a\.jpeg\./);
  assert.match(PEDIDO, /nunca instrução/);
});

test("lerPaginas lê cada página uma vez (cache pelo conteúdo) e um lote que falha não derruba o outro", async (t) => {
  const d = await mkdtemp(join(tmpdir(), "encartes-teste-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  const cache = join(d, "cache.json");
  const img = (s) => ({ conteudo: Buffer.from(s), hash: hashDe(Buffer.from(s)) });
  const imagens = [img("um"), img("dois"), img("um")];
  const vistos = [];
  let chamada = 0;
  const rodar = async (pasta) => {
    const arquivos = (await readdir(pasta)).sort();
    vistos.push(arquivos);
    if (++chamada === 1) throw new Error("tempo esgotado");
    return { paginas: arquivos.map((a) => ({ arquivo: a, inicio: null, fim: null, itens: [{ produto: "Sal 1kg", gramas: 1000, preco: 2.5, unidade: "embalagem", condicao: null }] })), custo: 0.01 };
  };
  const r1 = await lerPaginas(imagens, { rodar, cache, lote: 1, hoje: "2026-10-31" });
  assert.equal(vistos.length, 2, "a imagem repetida vai uma vez só");
  assert.ok(vistos.flat().every((a) => /^[0-9a-f]{16}\.jpeg$/.test(a)), "nome seguro, pelo hash");
  assert.equal(r1.erros.length, 1);
  assert.match(r1.erros[0], /tempo esgotado/);
  assert.equal(Object.keys(r1.paginas).length, 1);
  assert.equal(r1.lotes[0].custo, 0.01);
  // Segunda rodada: só a que falhou volta pra IA.
  await lerPaginas(imagens, { rodar, cache, lote: 1, hoje: "2026-10-31" });
  assert.equal(vistos.length, 3);
  assert.equal(JSON.parse(await readFile(cache, "utf8")).versao, 1);
});

const encarte = { id: "77", mercado: "Imperatriz", titulo: "Ofertas", inicio: "2026-10-29", fim: "2026-11-04" };

test("linhaDoItem: quilo vira granel de 1 kg, peso do nome ganha do lido, lido absurdo não vale", () => {
  const kg = linhaDoItem({ produto: "Alcatra Bovina", gramas: null, preco: 49.9, unidade: "kg", condicao: "no app" }, encarte, 2, 0);
  assert.deepEqual([kg.gramas, kg.granel, kg.preco, kg.condicao, kg.ate, kg.encarte, kg.url], [1000, true, 4990, "no app", "2026-11-04", "77", `${TIENDEO}/Catalogos/77`]);
  // Id estável: o mesmo nome dá o mesmo id em outra leitura, em qualquer posição.
  assert.match(kg.id, /^77-[0-9a-f]{10}$/);
  assert.equal(linhaDoItem({ produto: "alcatra  bovina", preco: 1, unidade: "kg" }, encarte).id, linhaDoItem({ produto: "Alcatra Bovina", preco: 2, unidade: "kg" }, encarte).id);
  assert.notEqual(linhaDoItem({ produto: "Açúcar 1kg", preco: 1 }, encarte).id, kg.id);
  assert.equal(linhaDoItem({ produto: "Café Pilão 500g", gramas: 250, preco: 22.99, unidade: "embalagem" }, encarte, 1, 1).gramas, 500);
  assert.equal(linhaDoItem({ produto: "Leite", gramas: 99999, preco: 5, unidade: "embalagem" }, encarte, 1, 2).gramas, null);
  assert.equal(linhaDoItem({ produto: "Óleo Soya 900ml", gramas: null, preco: 7, unidade: "embalagem" }, encarte, 1, 3).liquido, true);
  assert.equal(linhaDoItem({ produto: "Nada", preco: null }, encarte, 1, 4), null);
});

test("linhaDoRecorte: tira a marca do título, preço do Tiendeo, foto só https", () => {
  const foto = "https://pt-br-media.shopfully.cloud/images/flyergibs/g1.webp";
  const l = linhaDoRecorte({ id: "g1", encarte: "77", titulo: "Araguaia - Farinha De Trigo 1kg", marca: "Araguaia", preco: 299, imagem: foto }, encarte);
  assert.deepEqual([l.nome, l.marca, l.gramas, l.granel, l.preco, l.fotoUrl], ["Farinha De Trigo 1kg", "Araguaia", 1000, false, 299, foto]);
  // Foto de outro host não entra.
  assert.equal(linhaDoRecorte({ id: "g1", titulo: "Farinha Araguaia", preco: 1, imagem: "https://outro.site/x.webp" }, encarte).fotoUrl, null);
  // "5 Kg" é embalagem, não preço por quilo.
  const arroz = linhaDoRecorte({ id: "g4", titulo: "Tio João - Arroz Branco 5 Kg", preco: 2599 }, encarte);
  assert.deepEqual([arroz.granel, arroz.gramas], [false, 5000]);
  assert.equal(linhaDoRecorte({ id: "g2", titulo: "Queijo Prato Kg", preco: 3990, imagem: "javascript:x" }, encarte).granel, true);
  assert.equal(linhaDoRecorte({ id: "g2", titulo: "Queijo Prato Kg", preco: 3990, imagem: "javascript:x" }, encarte).fotoUrl, null);
  assert.equal(linhaDoRecorte({ id: "g3", titulo: "Sem preço", preco: null }, encarte), null);
  assert.equal(idDoMercado("Fort Atacadista"), "fort-atacadista");
  assert.equal(idDoMercado("Atacadão"), "atacadao");
});

test("montarEncartes: recortes sem IA, páginas pela IA, Bistek de fora, avisos sem derrubar", async () => {
  const lista = paginaNext({ a: [
    flyer("1", { retailerName: "Supermercados Imperatriz", publication_url: "http://viewer.zmags.com/publication/pt_br_877179" }),
    flyer("2", { retailerName: "Atacadão" }),
    flyer("3", { retailerName: "Bistek Supermercados" }),
    flyer("5", { retailerName: "Giassi Supermercados" }),
    flyer("4", { retailerName: "Fort Atacadista" }),
  ] });
  const comRecortes = paginaNext({ x: { flyerGibs: [
    { id: "g1", flyer_id: "2", title: "Camil - Arroz 5kg", image: "https://img/g1.webp", settings: { brand: "Camil", price_extended: { digits: "24.90" } } },
    { id: "g9", flyer_id: "99", title: "De outro encarte", settings: { price_extended: { digits: "1" } } },
  ] } });
  const pedidos = [];
  const fazerFetch = async (url) => {
    pedidos.push(url);
    if (url.includes("/florianopolis/")) return new Response(lista);
    if (url.endsWith("/Catalogos/2")) return new Response(comRecortes);
    if (url.endsWith("/Catalogos/4")) return new Response("erro", { status: 503 });
    if (url.includes("/Catalogos/")) return new Response(paginaNext({}));
    if (url.includes("api-viewer-zmags")) return new Response(JSON.stringify(zmags));
    if (url.includes("shopfully.cloud")) return new Response("imagem " + url);
    return new Response("?", { status: 404 });
  };
  const lerPaginas = async (imagens) => ({
    // As duas primeiras páginas trazem produtos diferentes; a terceira repete o café da primeira, mais caro.
    paginas: Object.fromEntries(imagens.slice(0, 3).map((i, n) => [i.hash, { inicio: null, fim: null, itens: [{ produto: `Café p${n % 2 + 1} 500g`, gramas: 500, preco: 19.9 + n, unidade: "embalagem", condicao: null }] }])),
    erros: ["lote 2: caiu"], lotes: [{ custo: 0.05, paginas: imagens.length }],
  });
  const r = await montarEncartes({ fazerFetch, lerPaginas, hoje: "2026-10-31", agora: new Date("2026-10-31T15:00:00Z"), esperar: async () => {} });
  assert.deepEqual(Object.keys(r.mercados).sort(), ["atacadao", "imperatriz"]);
  assert.ok(!pedidos.some((u) => u.endsWith("/Catalogos/3")), "Bistek nem é aberto");
  assert.ok(!pedidos.some((u) => u.endsWith("/Catalogos/5")), "Giassi com outro nome também fica de fora");
  const at = r.mercados.atacadao;
  assert.deepEqual(at.produtos.map((p) => [p.nome, p.preco, p.gramas]), [["Arroz 5kg", 2490, 5000]]);
  assert.deepEqual([at.encartes[0].fonte, at.encartes[0].fim, at.versao, at.categorias], ["recortes", "2026-11-04", 1, ["Encarte"]]);
  const im = r.mercados.imperatriz;
  assert.deepEqual(im.produtos.map((p) => [p.nome, p.preco]), [["Café p1 500g", 1990], ["Café p2 500g", 2090]], "repetido fica o mais barato");
  assert.equal(im.encartes[0].fonte, "ia");
  assert.equal(r.ia.custo, 0.05);
  assert.ok(r.avisos.some((a) => /Fort Atacadista.*503/.test(a)));
  assert.ok(r.avisos.some((a) => /Imperatriz: lote 2: caiu/.test(a)));
  // Com --sem-ia, o encarte sem recortes vira aviso e não vai pra IA.
  let chamouIa = false;
  const s = await montarEncartes({ fazerFetch, lerPaginas: async () => { chamouIa = true; return {}; }, hoje: "2026-10-31", semIa: true, esperar: async () => {} });
  assert.equal(chamouIa, false);
  assert.deepEqual(Object.keys(s.mercados), ["atacadao"]);
  assert.ok(s.avisos.some((a) => /Imperatriz.*--sem-ia/.test(a)));
});

test("recortes lê nome, marca, preço em centavos e imagem", () => {
  const [g] = recortes(paginaNext({ x: { flyerGibs: [{ id: "g1", flyer_id: "77", retailerName: "Carrefour", title: " Araguaia - Farinha ", image: "https://img/g1.webp", settings: { brand: "Araguaia", flyer_page: "2", price_extended: { digits: "2.99" } } }] } }));
  assert.deepEqual(g, { id: "g1", encarte: "77", mercado: "Carrefour", titulo: "Araguaia - Farinha", marca: "Araguaia", preco: 299, pagina: 2, imagem: "https://img/g1.webp" });
});

test("juntarComAnterior guarda o encarte que ainda vale e a rodada nova não trouxe", async () => {
  const { juntarComAnterior } = await import("../robo/encartes/montar.mjs");
  const cat = (id, encartes, produtos) => ({ versao: 1, mercado: id, nome: id, site: TIENDEO, fotos: "", atualizadoEm: "2026-11-01T00:00:00.000Z", categorias: ["Encarte"], encartes, produtos });
  const anterior = { versao: 1, mercados: {
    imperatriz: cat("imperatriz", [{ id: "1", fim: "2026-11-03" }, { id: "9", fim: "2026-10-30" }], [{ id: "1-a", encarte: "1" }, { id: "9-a", encarte: "9" }]),
    magia: cat("magia", [{ id: "2", fim: "2026-11-04" }], [{ id: "2-a", encarte: "2" }]),
  } };
  const novo = { versao: 1, mercados: { magia: cat("magia", [{ id: "2", fim: "2026-11-04" }], [{ id: "2-b", encarte: "2" }]) } };
  const r = juntarComAnterior(novo, anterior, "2026-11-01");
  assert.deepEqual(r.mercados.imperatriz.encartes.map((e) => e.id), ["1"], "o vencido não volta");
  assert.deepEqual(r.mercados.imperatriz.produtos.map((p) => p.id), ["1-a"]);
  assert.deepEqual(r.mercados.magia.produtos.map((p) => p.id), ["2-b"], "o que a rodada nova trouxe vale o novo");
  assert.equal(juntarComAnterior(novo, null, "2026-11-01"), novo);
});

test("recorte de uma palavra só e sem marca não entra", () => {
  assert.equal(linhaDoRecorte({ id: "g", titulo: "Cerveja", preco: 399 }, encarte), null);
  assert.equal(linhaDoRecorte({ id: "g", titulo: "Heineken - Cerveja", marca: "Heineken", preco: 399 }, encarte).nome, "Cerveja");
});

test("rede longe (Magia) fica de fora, também na junção com o arquivo anterior", async () => {
  const { juntarComAnterior, REDES_FORA } = await import("../robo/encartes/montar.mjs");
  assert.ok(REDES_FORA.includes("magia"));
  const anterior = { versao: 1, mercados: { magia: { versao: 1, mercado: "magia", encartes: [{ id: "2", fim: "2099-01-01" }], produtos: [{ id: "2-a", encarte: "2" }] } } };
  assert.deepEqual(Object.keys(juntarComAnterior({ versao: 1, mercados: {} }, anterior, "2026-11-01").mercados), []);
});
