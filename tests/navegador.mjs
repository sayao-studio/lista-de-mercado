// Testes do site num Chromium de verdade. Rodam em série (test:navegador) pra
// não abrir vários navegadores de uma vez numa máquina com pouca memória.
import { describe, test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { servir } from "./servidor.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_DIR ?? "/home/brenosayao/.npm/_npx/e41f203b7505f1fb/node_modules/playwright",
);

let navegador;
const servidores = new Map();
const contextos = [];

// Um servidor por combinação de fixtures, reaproveitado entre os testes.
async function servidorPara(opcoes) {
  const chave = JSON.stringify(opcoes);
  if (!servidores.has(chave)) servidores.set(chave, await servir(opcoes));
  return servidores.get(chave);
}

async function abrir({ width = 390, height = 844, resumo, dados, guardado } = {}) {
  const opcoes = {};
  if (dados !== undefined) opcoes.dados = dados;
  if (resumo !== undefined) opcoes.resumo = resumo;
  const { url } = await servidorPara(opcoes);
  const celular = width < 900;
  const contexto = await navegador.newContext({
    viewport: { width, height },
    deviceScaleFactor: celular ? 2 : 1,
    isMobile: celular,
    hasTouch: celular,
    locale: "pt-BR",
  });
  contextos.push(contexto);
  // Lista salva antes de o site abrir, como se a pessoa já tivesse usado ontem.
  if (guardado) {
    await contexto.addInitScript((texto) => localStorage.setItem("lista-de-mercado", texto), JSON.stringify(guardado));
  }
  const page = await contexto.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.app?.pronto, null, { timeout: 10_000 });
  await page.evaluate(() => window.app.pronto);
  return { page, contexto, url };
}

describe("site", () => {
  before(async () => {
    navegador = await chromium.launch();
  });

  afterEach(async () => {
    while (contextos.length) await contextos.pop().close();
  });

  after(async () => {
    await navegador?.close();
    for (const s of servidores.values()) await s.fechar();
  });

  test("abre mostrando a lista vazia e o convite pra buscar", async () => {
    const { page } = await abrir();
    assert.match(await page.locator("#itens").textContent(), /Sua lista está vazia/);
    assert.equal(await page.locator('[data-tela="buscar"]').getAttribute("data-ativa"), "");
  });

  test("cabeçalho diz de quando são os preços, por mercado", async () => {
    const { page } = await abrir();
    const quando = await page.locator("#quando").textContent();
    assert.match(quando, /Bistek/);
    assert.match(quando, /hoje/);
    assert.match(quando, /Giassi: ontem 18h/);
  });

  test("no celular não há rolagem horizontal e a barra inferior aparece", async () => {
    const { page } = await abrir();
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 390, `scrollWidth ${largura} > 390`);
    assert.ok(await page.locator("#barra").isVisible());
  });

  test("em tela larga as duas telas ficam lado a lado e a barra some", async () => {
    const { page } = await abrir({ width: 1280, height: 800 });
    const buscar = page.locator('[data-tela="buscar"]');
    const lista = page.locator('[data-tela="lista"]');
    assert.ok(await buscar.isVisible());
    assert.ok(await lista.isVisible());
    assert.ok((await buscar.boundingBox()).x < (await lista.boundingBox()).x);
    assert.ok(await page.locator("#barra").isHidden());
  });

  test("mercado com erro no resumo aparece avisado", async () => {
    const { page } = await abrir({ resumo: "tests/fixtures/dados/resumo-com-erro.json" });
    assert.match(await page.locator("#quando").textContent(), /Angeloni: sem preços/);
  });

  test("mercado fora do ar não marca como sumido o produto salvo na lista", async () => {
    const oferta = (id, preco) => ({ id, preco, promocao: 0, link: id });
    const guardado = {
      versao: 1,
      itens: [{
        id: "x1", tipo: "produto", chave: "7896006700029", ean: "7896006700029",
        nome: "Arroz Tio João 1kg", marca: "Tio João", gramas: 1000, granel: false,
        quantidade: 1, marcado: false, adicionadoEm: "2026-10-30T12:00:00.000Z",
        ofertas: { bistek: oferta("b1", 1198), giassi: oferta("g1", 1090), angeloni: oferta("a1", 1249) },
      }],
    };
    const { page } = await abrir({ resumo: "tests/fixtures/dados/resumo-com-erro.json", guardado });
    const angeloni = await page.evaluate(() => window.app.estado.itens[0].ofertas.angeloni);
    assert.equal(angeloni.indisponivel, true);
    assert.equal(angeloni.sumiu, undefined);
    assert.equal(angeloni.preco, 1249);
  });
});
