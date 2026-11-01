// Contrato dos dados publicados (docs/contrato-dados.md): outros programas
// (a esfiharia) leem esses arquivos por HTTP. Confere as fixtures sempre e,
// quando existem na máquina, os arquivos reais do robô e dos encartes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const inteiro = (x) => Number.isInteger(x);
const texto = (x) => typeof x === "string";
const dia = (x) => texto(x) && /^\d{4}-\d\d-\d\d$/.test(x);
const iso = (x) => texto(x) && !Number.isNaN(Date.parse(x));

// Lista de problemas de um catálogo; vazia quando cumpre o contrato.
export function problemasDoCatalogo(c, { encarte = false } = {}) {
  const p = [];
  const exigir = (ok, msg) => { if (!ok) p.push(msg); };
  exigir(c?.versao === 1, "versao != 1");
  for (const k of ["mercado", "nome", "site", "fotos"]) exigir(texto(c?.[k]), `${k} não é texto`);
  exigir(iso(c?.atualizadoEm), "atualizadoEm não é data");
  exigir(Array.isArray(c?.categorias) && c.categorias.every(texto), "categorias não é lista de texto");
  exigir(Array.isArray(c?.produtos), "produtos não é lista");
  exigir(c?.incompletas === undefined || (Array.isArray(c.incompletas) && c.incompletas.every(texto)), "incompletas não é lista de texto");
  if (encarte) exigir(Array.isArray(c?.encartes) && c.encartes.every((e) => texto(e.id) && dia(e.fim) && texto(e.link)), "encartes inválidos");
  const ids = new Set();
  for (const [n, x] of (c?.produtos ?? []).entries()) {
    const onde = `produtos[${n}] (${x?.id})`;
    exigir(texto(x.id) && x.id, `${onde}: id`);
    exigir(!ids.has(x.id), `${onde}: id repetido`);
    ids.add(x.id);
    exigir(texto(x.nome) && x.nome.trim(), `${onde}: nome`);
    exigir(texto(x.marca), `${onde}: marca`);
    exigir(x.ean === "" || /^\d{8,14}$/.test(x.ean), `${onde}: ean`);
    exigir(x.gramas === null || (typeof x.gramas === "number" && x.gramas > 0), `${onde}: gramas`);
    exigir(typeof x.granel === "boolean", `${onde}: granel`);
    exigir(x.liquido === undefined || typeof x.liquido === "boolean", `${onde}: liquido`);
    exigir(!x.granel || x.gramas > 0, `${onde}: granel sem passo`);
    exigir(inteiro(x.preco) && x.preco > 0, `${onde}: preco`);
    exigir(inteiro(x.promocao) && (x.promocao === 0 || x.promocao > x.preco), `${onde}: promocao`);
    exigir(texto(x.foto) && texto(x.link), `${onde}: foto/link`);
    exigir(inteiro(x.categoria) && x.categoria >= 0 && x.categoria < c.categorias.length, `${onde}: categoria fora da lista`);
    if (encarte) {
      exigir(texto(x.url) && x.url.startsWith("https://"), `${onde}: url`);
      exigir(x.fotoUrl == null || (texto(x.fotoUrl) && x.fotoUrl.startsWith("https://")), `${onde}: fotoUrl`);
      exigir(x.condicao == null || texto(x.condicao), `${onde}: condicao`);
      exigir(dia(x.ate), `${onde}: ate`);
      exigir(c.encartes?.some((e) => e.id === x.encarte), `${onde}: encarte desconhecido`);
    }
    if (p.length > 20) break; // o bastante pra saber o que quebrou
  }
  return p;
}

export function problemasDoResumo(r) {
  const p = [];
  if (r?.versao !== 1) p.push("versao != 1");
  if (!iso(r?.geradoEm)) p.push("geradoEm não é data");
  if (!r?.mercados || typeof r.mercados !== "object") return [...p, "mercados ausente"];
  for (const [id, m] of Object.entries(r.mercados)) {
    if (!texto(m.nome)) p.push(`${id}: nome`);
    if (m.erro !== undefined) { if (!texto(m.erro)) p.push(`${id}: erro`); continue; }
    if (!/^[a-z0-9-]+\.json\?v=\d+$/.test(m.arquivo ?? "")) p.push(`${id}: arquivo`);
    if (!inteiro(m.produtos)) p.push(`${id}: produtos`);
    if (!iso(m.atualizadoEm)) p.push(`${id}: atualizadoEm`);
    if (m.incompletas !== undefined && !(Array.isArray(m.incompletas) && m.incompletas.every(texto))) p.push(`${id}: incompletas`);
  }
  return p;
}

export function problemasDosEncartes(e) {
  const p = [];
  if (e?.versao !== 1) p.push("versao != 1");
  if (!iso(e?.geradoEm)) p.push("geradoEm não é data");
  for (const [id, cat] of Object.entries(e?.mercados ?? {})) {
    if (cat.mercado !== id) p.push(`${id}: mercado != chave`);
    p.push(...problemasDoCatalogo(cat, { encarte: true }).map((x) => `${id}: ${x}`));
  }
  return p;
}

// As fixtures do servidor de teste têm {{HOJE}}/{{ONTEM}}: troca por uma data
// antes de validar, pra o contrato não aceitar placeholder.
const ler = (url) => JSON.parse(readFileSync(url, "utf8").replaceAll(/\{\{[A-Z]+\}\}/g, "2026-11-01T12:00:00.000Z"));
const aqui = (rel) => new URL(rel, import.meta.url);

test("fixtures cumprem o contrato", () => {
  for (const m of ["bistek", "giassi", "angeloni"]) {
    const c = ler(aqui(`./fixtures/dados/${m}.json`));
    // Fixture antiga sem `liquido` em alguns produtos continua válida (campo opcional).
    assert.deepEqual(problemasDoCatalogo(c), [], m);
  }
  for (const r of ["resumo", "resumo-com-erro"]) assert.deepEqual(problemasDoResumo(ler(aqui(`./fixtures/dados/${r}.json`))), [], r);
  const enc = ler(aqui("./fixtures/encartes/encartes.json"));
  // A fixture traz de propósito um mercado do site (bistek) mal formado como encarte; só o imperatriz conta.
  assert.deepEqual(problemasDoCatalogo(enc.mercados.imperatriz, { encarte: true }), []);
});

test("o validador pega o que quebraria quem consome", () => {
  const base = ler(aqui("./fixtures/dados/bistek.json"));
  const com = (mudar) => { const c = structuredClone(base); mudar(c); return problemasDoCatalogo(c); };
  assert.ok(com((c) => { c.produtos[0].preco = 11.98; }).some((x) => /preco/.test(x)), "preço em reais em vez de centavos");
  assert.ok(com((c) => { c.produtos[0].promocao = 1; }).some((x) => /promocao/.test(x)), "promoção menor que o preço");
  assert.ok(com((c) => { c.produtos[0].categoria = 99; }).some((x) => /categoria/.test(x)));
  assert.ok(com((c) => { c.produtos[1].id = c.produtos[0].id; }).some((x) => /repetido/.test(x)));
  assert.ok(com((c) => { c.versao = 2; }).some((x) => /versao/.test(x)));
  assert.ok(problemasDoResumo({ versao: 1, geradoEm: "x", mercados: {} }).length > 0);
});

const real = (rel) => (existsSync(aqui(rel)) ? ler(aqui(rel)) : null);
const resumoReal = real("../public/dados/resumo.json");
test("arquivos reais do robô cumprem o contrato", { skip: !resumoReal && "sem public/dados" }, () => {
  assert.deepEqual(problemasDoResumo(resumoReal), []);
  for (const [id, m] of Object.entries(resumoReal.mercados)) {
    if (m.erro) continue;
    const c = real(`../public/dados/${id}.json`);
    assert.ok(c, `${id}.json existe`);
    assert.equal(c.mercado, id);
    assert.deepEqual(problemasDoCatalogo(c), [], id);
  }
});

const encartesReal = real("../public/encartes.json");
test("public/encartes.json cumpre o contrato e não usa id de mercado do site", { skip: !encartesReal && "sem encartes.json" }, () => {
  assert.deepEqual(problemasDosEncartes(encartesReal), []);
  for (const id of Object.keys(encartesReal.mercados)) assert.ok(!["bistek", "giassi", "angeloni"].includes(id), id);
});
