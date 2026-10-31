import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHAVE_RESUMO, carregarResumo, carregarMercado } from "../public/dados.js";

const lerTexto = (nome) => readFileSync(new URL(`./fixtures/dados/${nome}.json`, import.meta.url), "utf8");
const ler = (nome) => JSON.parse(lerTexto(nome));

function storageFalso(inicial = {}) {
  const mapa = new Map(Object.entries(inicial));
  return {
    mapa,
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => { mapa.set(k, String(v)); },
    removeItem: (k) => { mapa.delete(k); },
  };
}

// Response construída não tem .url; o cache guarda pela url passada no put, como o navegador faz pelo Request.
function cachesFalso(inicial = {}) {
  const mapa = new Map(Object.entries(inicial));
  const abertos = [];
  const cache = {
    mapa,
    match: async (url) => mapa.get(url)?.clone(),
    put: async (url, resp) => { mapa.set(url, resp); },
    keys: async () => [...mapa.keys()].map((url) => ({ url: "https://exemplo.test/lista-de-mercado/" + url })),
    delete: async (req) => mapa.delete(req.url.replace("https://exemplo.test/lista-de-mercado/", "")),
  };
  return { cache, abertos, open: async (nome) => { abertos.push(nome); return cache; } };
}

const resposta = (corpo, status = 200) =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });

function fetchFalso(rotas) {
  const chamadas = [];
  const f = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const r = rotas[url];
    if (r instanceof Error) throw r;
    if (!r) return resposta("não achei", 404);
    return r();
  };
  f.chamadas = chamadas;
  return f;
}

test("carregarResumo usa a rede e guarda cópia; sem rede usa a cópia", async () => {
  const texto = lerTexto("resumo");
  const storage = storageFalso();
  const comRede = fetchFalso({ "dados/resumo.json": () => resposta(texto) });

  const r1 = await carregarResumo({ fazerFetch: comRede, storage });
  assert.equal(r1.semInternet, false);
  assert.deepEqual(r1.resumo, ler("resumo"));
  assert.deepEqual(comRede.chamadas, [{ url: "dados/resumo.json", opcoes: { cache: "no-store" } }]);
  assert.equal(storage.mapa.get(CHAVE_RESUMO), texto);

  const semRede = fetchFalso({ "dados/resumo.json": new TypeError("Failed to fetch") });
  const r2 = await carregarResumo({ fazerFetch: semRede, storage });
  assert.equal(r2.semInternet, true);
  assert.deepEqual(r2.resumo, ler("resumo"));

  // Site ainda sem preços (404) e nada guardado: o app precisa saber.
  await assert.rejects(carregarResumo({ fazerFetch: fetchFalso({}), storage: storageFalso() }), /sem resumo/);
});

test("carregarResumo não guarda resumo em formato desconhecido", async () => {
  const storage = storageFalso({ [CHAVE_RESUMO]: lerTexto("resumo") });
  const f = fetchFalso({ "dados/resumo.json": () => resposta({ versao: 2, mercados: {} }) });
  const r = await carregarResumo({ fazerFetch: f, storage });
  assert.equal(r.semInternet, true);
  assert.equal(storage.mapa.get(CHAVE_RESUMO), lerTexto("resumo"));
});

test("carregarMercado usa o cache quando a versão bate e apaga versões velhas", async () => {
  const bistek = ler("bistek");
  const caches = cachesFalso({
    "dados/bistek.json?v=0": resposta({ versao: 1, velho: true }),
    "dados/giassi.json?v=1": resposta(ler("giassi")),
  });
  const f = fetchFalso({ "dados/bistek.json?v=1": () => resposta(bistek) });
  const entrada = ler("resumo").mercados.bistek;

  // Primeira vez: baixa, guarda a versão nova e some com a velha do mesmo mercado.
  assert.deepEqual(await carregarMercado("bistek", entrada, { fazerFetch: f, caches }), bistek);
  assert.deepEqual(caches.abertos, ["catalogos"]);
  assert.deepEqual([...caches.cache.mapa.keys()].sort(), ["dados/bistek.json?v=1", "dados/giassi.json?v=1"]);

  // Segunda vez: vem do cache, sem rede.
  assert.deepEqual(await carregarMercado("bistek", entrada, { fazerFetch: f, caches }), bistek);
  assert.equal(f.chamadas.length, 1);
});

test("carregarMercado sem caches ou com caches quebrado só busca na rede", async () => {
  const bistek = ler("bistek");
  const entrada = ler("resumo").mercados.bistek;
  const f = fetchFalso({ "dados/bistek.json?v=1": () => resposta(bistek) });
  assert.deepEqual(await carregarMercado("bistek", entrada, { fazerFetch: f }), bistek);
  const quebrado = { open: async () => { throw new Error("SecurityError"); } };
  assert.deepEqual(await carregarMercado("bistek", entrada, { fazerFetch: f, caches: quebrado }), bistek);
  assert.equal(f.chamadas.length, 2);
});

test("carregarMercado lança com HTTP ruim ou formato desconhecido", async () => {
  const entrada = ler("resumo").mercados.bistek;
  await assert.rejects(carregarMercado("bistek", entrada, { fazerFetch: fetchFalso({}) }), /bistek: HTTP 404/);
  const f = fetchFalso({ "dados/bistek.json?v=1": () => resposta({ versao: 9 }) });
  await assert.rejects(carregarMercado("bistek", entrada, { fazerFetch: f, caches: cachesFalso() }), /bistek: formato desconhecido/);
});

test("carregarMercado devolve null pra mercado com erro", async () => {
  const f = fetchFalso({});
  const entrada = ler("resumo-com-erro").mercados.angeloni;
  assert.equal(await carregarMercado("angeloni", entrada, { fazerFetch: f, caches: cachesFalso() }), null);
  assert.equal(await carregarMercado("angeloni", undefined, { fazerFetch: f }), null);
  assert.equal(f.chamadas.length, 0);
});
