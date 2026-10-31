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

async function abrir({ width = 390, height = 844, resumo, dados, guardado, escuro = false } = {}) {
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
  // Antes do goto: o CSS e o theme-color têm que nascer já no tema escuro.
  if (escuro) await page.emulateMedia({ colorScheme: "dark" });
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

  // A busca tem debounce de 120 ms: espera o cartão aparecer em vez de dormir.
  async function buscarPor(page, termo) {
    await page.locator('[data-ir="buscar"]').click();
    await page.locator("#busca").fill(termo);
    await page.waitForFunction(
      (t) => document.querySelector("#resultados")?.dataset.termo === t,
      termo,
    );
  }

  test("buscar 'arroz' mostra o Tio João primeiro, com os três preços e o Giassi em destaque", async () => {
    const { page } = await abrir();
    await buscarPor(page, "arroz");
    const cartoes = page.locator("#resultados .cartao");
    assert.equal(await cartoes.count(), 3);
    const primeiro = cartoes.first();
    assert.equal(await primeiro.getAttribute("data-chave"), "7896006700029");
    assert.match(await primeiro.locator(".nome").textContent(), /Arroz Tio João 1kg/);
    assert.equal(await primeiro.locator(".preco").count(), 3);
    assert.equal(await primeiro.locator(".preco.melhor").count(), 1);
    assert.equal(await primeiro.locator('.preco.melhor[data-mercado="giassi"]').count(), 1);
    assert.match(await primeiro.locator('.preco[data-mercado="giassi"]').textContent(), /Giassi\s+R\$ 10,90/);
    assert.equal(await primeiro.locator('.preco[data-mercado="bistek"] s').textContent(), "R$ 13,99");
    // Com termo, sempre há como pôr o texto livre na lista.
    assert.match(await page.locator("#adicionar-texto").textContent(), /Adicionar "arroz" sem preço/);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 390, `scrollWidth ${largura} > 390`);
  });

  test("tocar no + adiciona à lista, o contador sobe e o botão mostra ×1 e depois ×2", async () => {
    const { page } = await abrir();
    await buscarPor(page, "arroz");
    const cartao = () => page.locator('#resultados .cartao[data-chave="7896006700029"]');
    await cartao().locator(".adicionar").click();
    assert.equal(await page.locator("#contador-lista").textContent(), "1");
    assert.equal((await cartao().locator(".adicionar").textContent()).trim(), "×1");
    assert.match(await page.locator("#aviso").textContent(), /Arroz Tio João 1kg na lista/);
    await cartao().locator(".adicionar").click();
    assert.equal(await page.locator("#contador-lista").textContent(), "1");
    assert.equal((await cartao().locator(".adicionar").textContent()).trim(), "×2");
    const itens = await page.evaluate(() => window.app.estado.itens);
    assert.equal(itens.length, 1);
    assert.equal(itens[0].quantidade, 2);
    // Salvo no aparelho, não só na memória.
    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("lista-de-mercado")));
    assert.equal(salvo.itens[0].quantidade, 2);
  });

  test("chip 'Só promoções' e chip de mercado filtram", async () => {
    const { page } = await abrir();
    await buscarPor(page, "arroz");
    const promo = page.locator('#chips [data-filtro="promocao"]');
    await promo.click();
    assert.equal(await promo.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#resultados .cartao").count(), 1);
    await promo.click();
    assert.equal(await page.locator("#resultados .cartao").count(), 3);

    const angeloni = page.locator('#chips [data-mercado="angeloni"]');
    assert.equal((await angeloni.textContent()).trim(), "Angeloni");
    await angeloni.click();
    assert.equal(await angeloni.getAttribute("aria-pressed"), "true");
    const chaves = await page.locator("#resultados .cartao").evaluateAll((cs) => cs.map((c) => c.dataset.chave));
    assert.deepEqual(chaves.sort(), ["7896006700029", "angeloni:a4"]);

    await buscarPor(page, "café");
    assert.equal(await page.locator("#resultados .cartao").count(), 0);
    await angeloni.click();
    assert.match(await page.locator("#resultados .cartao .nome").textContent(), /Café Melitta/);
  });

  test("sem resultado, 'Adicionar sem preço' cria item de texto", async () => {
    const { page } = await abrir();
    await buscarPor(page, "pão de queijo");
    assert.equal(await page.locator("#resultados .cartao").count(), 0);
    assert.match(await page.locator("#resultados").textContent(), /Nada com “pão de queijo”/);
    await page.locator("#adicionar-texto").click();
    const itens = await page.evaluate(() => window.app.estado.itens);
    assert.equal(itens.length, 1);
    assert.equal(itens[0].tipo, "texto");
    assert.equal(itens[0].nome, "pão de queijo");
    assert.equal(await page.locator("#contador-lista").textContent(), "1");
  });

  test("tocar duas vezes em 'Adicionar sem preço' soma a quantidade em vez de duplicar", async () => {
    const { page } = await abrir();
    await buscarPor(page, "pão de queijo");
    await page.locator("#adicionar-texto").click();
    await page.locator("#adicionar-texto").click();
    const itens = await page.evaluate(() => window.app.estado.itens);
    assert.equal(itens.length, 1);
    assert.equal(itens[0].quantidade, 2);
    assert.match(await page.locator("#aviso").textContent(), /pão de queijo ×2 na lista/);
  });

  test("cartão de uma loja só não tem preço em destaque", async () => {
    const { page } = await abrir();
    await buscarPor(page, "arroz");
    assert.equal(await page.locator('.cartao[data-chave="angeloni:a4"] .preco.melhor').count(), 0);
  });

  test("o foco volta pro chip tocado depois do redesenho", async () => {
    const { page } = await abrir();
    await buscarPor(page, "arroz");
    await page.locator('#chips [data-filtro="promocao"]').focus();
    await page.keyboard.press("Enter");
    const focado = await page.evaluate(() => document.activeElement?.dataset.filtro);
    assert.equal(focado, "promocao");
  });
  // ---- Tela Lista ----

  const ARROZ = "7896006700029";
  const BANANA = "bistek:b3";

  // Põe produtos pela busca, como a pessoa faria, e volta pra tela da lista.
  async function adicionar(page, termo, chave) {
    await buscarPor(page, termo);
    await page.locator(`#resultados .cartao[data-chave="${chave}"] .adicionar`).click();
  }

  async function adicionarTexto(page, termo) {
    await buscarPor(page, termo);
    await page.locator("#adicionar-texto").click();
  }

  async function irParaLista(page) {
    await page.locator('[data-ir="lista"]').click();
  }

  const itemDe = (page, nome) => page.locator("#itens li.item", { hasText: nome });

  test("item na lista mostra o mais barato e os outros mercados", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    await irParaLista(page);
    const item = itemDe(page, "Arroz Tio João 1kg");
    assert.equal(await item.locator(".melhor").textContent(), "Giassi R$ 10,90");
    assert.equal(await item.locator(".outros").textContent(), "Bistek R$ 11,98 · Angeloni R$ 12,49");
    assert.equal(await item.locator(".marcar").getAttribute("aria-label"), "Pegar Arroz Tio João 1kg");
    assert.equal((await item.locator(".quantidade .n").textContent()).trim(), "1");
    // Detalhe: link pra loja, promoção riscada e preço por quilo.
    await item.locator(".detalhe summary").click();
    const detalhe = item.locator(".detalhe");
    assert.match(await detalhe.locator('a[href*="giassi"]').getAttribute("target"), /_blank/);
    assert.match(await detalhe.textContent(), /Giassi\s+R\$ 10,90 · R\$ 10,90\/kg/);
    assert.equal(await detalhe.locator("s").first().textContent(), "R$ 13,99");
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 390, `scrollWidth ${largura} > 390`);
  });

  test("mais e menos mudam a quantidade e os totais", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    await irParaLista(page);
    const item = itemDe(page, "Arroz Tio João 1kg");
    assert.equal(await item.locator(".menos").getAttribute("aria-disabled"), "true");
    await item.locator(".mais").click();
    assert.equal((await item.locator(".n").textContent()).trim(), "2");
    assert.equal(await item.locator(".melhor").textContent(), "Giassi R$ 21,80");
    assert.equal(await item.locator(".outros").textContent(), "Bistek R$ 23,96 · Angeloni R$ 24,98");
    assert.match(await page.locator("#totais").textContent(), /Tudo no Giassi R\$ 21,80/);
    // O redesenho não tira o foco do botão tocado.
    assert.equal(await page.evaluate(() => document.activeElement?.className), "mais");
    // Cartão da busca acompanha a quantidade da lista.
    assert.equal((await page.locator(`#resultados .cartao[data-chave="${ARROZ}"] .adicionar`).textContent()).trim(), "×2");
    await item.locator(".menos").click();
    assert.equal((await item.locator(".n").textContent()).trim(), "1");
    // Menos em 1 não remove: tirar da lista é só no ×. O Playwright não
    // clica em aria-disabled, então vai pelo teclado (o botão segue focável).
    await item.locator(".menos").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#itens li.item").count(), 1);
    await item.locator(".remover").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#itens li.item").count(), 0);
    assert.ok(await page.locator("#totais").isHidden());
    // O foco vai pro Desfazer (Enter de novo não apaga outro item) e ele traz de volta.
    assert.equal(await page.evaluate(() => document.activeElement?.id), "desfazer");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#itens li.item").count(), 1);
  });

  test("riscar manda o item pro fim e sobrevive ao recarregar", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    await adicionar(page, "banana", BANANA);
    await irParaLista(page);
    await itemDe(page, "Arroz Tio João 1kg").locator(".marcar").check();
    const ultimo = page.locator("#itens > li:last-child");
    assert.match(await ultimo.locator(".nome").textContent(), /Arroz Tio João 1kg/);
    assert.equal(await ultimo.getAttribute("data-marcado"), "");
    assert.match(await page.locator("#itens .divisor").textContent(), /Pegos/);
    // Granel mostra a quantidade com o peso de cada passo.
    assert.equal((await itemDe(page, "Banana Caturra Kg").locator(".n").textContent()).trim(), "1 × 1 kg");

    await page.reload();
    await page.evaluate(() => window.app.pronto);
    const depois = page.locator("#itens > li.item:last-child");
    assert.match(await depois.locator(".nome").textContent(), /Arroz Tio João 1kg/);
    assert.ok(await depois.locator(".marcar").isChecked());

    await page.locator("#desmarcar").click();
    assert.equal(await page.locator("#itens li.item[data-marcado]").count(), 0);
    assert.match(await page.locator("#itens > li.item:first-child .nome").textContent(), /Arroz/);
  });

  test("totais: faltam N e cada item no mais barato", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    await adicionar(page, "banana", BANANA);
    await adicionarTexto(page, "pão de queijo");
    await irParaLista(page);
    const totais = (await page.locator("#totais").textContent()).replace(/\s+/g, " ");
    assert.match(totais, /Tudo no Bistek R\$ 16,87/);
    assert.match(totais, /Tudo no Giassi R\$ 10,90 · falta 1/);
    assert.match(totais, /Tudo no Angeloni R\$ 12,49 · falta 1/);
    assert.match(totais, /Cada item no mais barato R\$ 15,79/);
    assert.match(totais, /1 sem preço/);
    // O mercado completo vem primeiro.
    assert.equal(await page.locator("#totais [data-mercado]").first().getAttribute("data-mercado"), "bistek");
    assert.match(await itemDe(page, "pão de queijo").locator(".melhor").textContent(), /sem preço/);
  });

  test("limpar pede confirmação e desfazer traz de volta", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    await irParaLista(page);
    const dialogo = page.locator("#dialogo-limpar");
    await page.locator("#limpar").click();
    assert.ok(await dialogo.isVisible());
    assert.match(await dialogo.textContent(), /Limpar a lista inteira\?/);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    assert.ok(await dialogo.isHidden());
    assert.equal(await page.locator("#itens li.item").count(), 1);

    await page.locator("#limpar").click();
    await dialogo.getByRole("button", { name: "Limpar", exact: true }).click();
    assert.equal(await page.locator("#itens li.item").count(), 0);
    assert.match(await page.locator("#aviso").textContent(), /Lista limpa/);
    const salvoVazio = await page.evaluate(() => JSON.parse(localStorage.getItem("lista-de-mercado")));
    assert.equal(salvoVazio.itens.length, 0);

    // Um recado comum no meio do prazo não derruba o Desfazer.
    await adicionarTexto(page, "pão de queijo");
    await irParaLista(page);
    assert.ok(await page.locator("#desfazer").isVisible());
    await page.locator("#desfazer").click();
    assert.equal(await page.locator("#itens li.item").count(), 2);
    const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("lista-de-mercado")));
    assert.equal(salvo.itens.length, 2);
    assert.equal(await page.locator("#aviso").textContent(), "");
  });

  test("colar o texto copiado recria a lista", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    await page.locator(`#resultados .cartao[data-chave="${ARROZ}"] .adicionar`).click();
    await adicionarTexto(page, "pão de queijo");
    await irParaLista(page);
    await itemDe(page, "pão de queijo").locator(".marcar").check();
    const resumir = (itens) => itens.map((i) => [i.tipo, i.nome, i.quantidade, i.marcado, i.chave ?? null]);
    const antes = resumir(await page.evaluate(() => window.app.estado.itens));

    // Área de transferência falsa: o Chromium sem tela não deixa ler a de verdade.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t) => { window.copiado = t; } },
      });
    });
    await page.locator("#copiar").click();
    await page.waitForFunction(() => typeof window.copiado === "string");
    assert.match(await page.locator("#aviso").textContent(), /Lista copiada/);
    const texto = await page.evaluate(() => window.copiado);
    assert.match(texto, new RegExp(`2× Arroz Tio João 1kg — Giassi R\\$ 21,80 #${ARROZ}`));

    // Sem área de transferência, o texto aparece selecionado pra copiar à mão.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    });
    await page.locator("#copiar").click();
    const caixa = page.locator("#dialogo-copiar textarea");
    assert.ok(await caixa.isVisible());
    assert.equal(await caixa.inputValue(), texto);
    await page.keyboard.press("Escape");
    assert.ok(await caixa.isHidden());

    await page.locator("#limpar").click();
    await page.locator("#dialogo-limpar").getByRole("button", { name: "Limpar", exact: true }).click();
    await page.locator("#colar").click();
    await page.locator("#dialogo-colar textarea").fill(texto);
    await page.locator("#dialogo-colar").getByRole("button", { name: "Adicionar" }).click();
    const depois = resumir(await page.evaluate(() => window.app.estado.itens));
    assert.deepEqual(depois, antes);

    // Colar de novo soma no fim, não troca a lista.
    await page.locator("#colar").click();
    await page.locator("#dialogo-colar textarea").fill("• 3× leite");
    await page.locator("#dialogo-colar").getByRole("button", { name: "Adicionar" }).click();
    const finais = await page.evaluate(() => window.app.estado.itens);
    assert.equal(finais.length, 3);
    assert.deepEqual(resumir([finais[2]]), [["texto", "leite", 3, false, null]]);
  });

  test("foto que não carrega vira o quadro neutro, na lista e na busca", async () => {
    const { page, contexto } = await abrir();
    // As fotos das fixtures apontam pro site da loja: aqui viram 404 de propósito.
    await contexto.route(/vteximg/, (rota) => rota.fulfill({ status: 404, body: "" }));
    await adicionar(page, "arroz", ARROZ);
    const quebradas = (raiz) => page.evaluate((r) =>
      [...document.querySelectorAll(`${r} img`)].filter((i) => i.complete && i.naturalWidth === 0).length, raiz);
    await page.waitForFunction(() => document.querySelector("#resultados .cartao .sem-foto"));
    assert.equal(await quebradas("#resultados"), 0);
    await irParaLista(page);
    await page.waitForFunction(() => document.querySelector("#itens li.item .sem-foto"));
    assert.equal(await quebradas("#itens"), 0);
  });

  test("mercado que sumiu do catálogo aparece avisado no detalhe", async () => {
    const { page } = await abrir();
    await adicionar(page, "arroz", ARROZ);
    const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("lista-de-mercado")));
    // Mercado fora do ar hoje: guarda o último preço e não entra nos totais.
    const fora = await abrir({ resumo: "tests/fixtures/dados/resumo-com-erro.json", guardado });
    const arroz = itemDe(fora.page, "Arroz Tio João 1kg");
    await arroz.locator(".detalhe summary").click();
    assert.match(await arroz.locator(".detalhe").textContent(), /Angeloni: sem preços hoje \(era R\$ 12,49\)/);
    assert.doesNotMatch(await arroz.locator(".outros").textContent(), /Angeloni/);
    assert.doesNotMatch(await fora.page.locator("#totais").textContent(), /Tudo no Angeloni/);
    assert.match(await fora.page.locator("#totais").textContent(), /Tudo no Giassi R\$ 10,90/);

    // Produto que o mercado carregado não tem mais: "não achei mais", e o
    // último preço fica em cinza quando nenhum mercado tem.
    const velho = {
      versao: 1,
      itens: [{
        id: "v1", tipo: "produto", chave: "angeloni:a999", ean: "", nome: "Feijão Antigo 1kg",
        marca: "", gramas: 1000, granel: false, quantidade: 1, marcado: false,
        adicionadoEm: "2026-10-30T12:00:00.000Z",
        ofertas: { angeloni: { id: "a999", preco: 799, promocao: 0, link: "https://www.angeloni.com.br/feijao/p" } },
      }],
    };
    const sumido = await abrir({ guardado: velho });
    const feijao = itemDe(sumido.page, "Feijão Antigo 1kg");
    assert.match(await feijao.locator(".melhor").textContent(), /sem preço.*R\$ 7,99/);
    await feijao.locator(".detalhe summary").click();
    assert.match(await feijao.locator(".detalhe").textContent(), /não achei mais no Angeloni/);
    assert.match(await sumido.page.locator("#totais").textContent(), /1 sem preço/);
  });

  test("sem resumo nenhum, o site abre e avisa que ainda não tem preços", async () => {
    const { page } = await abrir({ resumo: null });
    const recado = () => page.locator("#aviso").textContent();
    assert.match(await recado(), /ainda sem preços/i);
    assert.match(await recado(), /6h, 12h e 18h/);
    // A lista continua usável: texto livre entra mesmo sem catálogo.
    await buscarPor(page, "pão de queijo");
    await page.locator("#adicionar-texto").click();
    await page.locator('[data-ir="lista"]').click();
    assert.match(await page.locator("#itens").textContent(), /pão de queijo/);
    // Passada a confirmação, o recado de "sem preços" volta: ele só sai quando houver dados.
    await page.waitForFunction(() => /ainda sem preços/i.test(document.querySelector("#aviso").textContent), null, { timeout: 4000 });
  });

  test("manifest e ícone respondem", async () => {
    const { page, url } = await abrir();
    const manifest = await page.request.get(url + "manifest.webmanifest");
    assert.equal(manifest.status(), 200);
    assert.match(manifest.headers()["content-type"], /application\/manifest\+json/);
    const json = await manifest.json();
    assert.equal(json.name, "Lista de mercado");
    assert.equal(json.short_name, "Mercado");
    assert.equal(json.start_url, "./");
    for (const icone of json.icons) {
      const r = await page.request.get(url + icone.src);
      assert.equal(r.status(), 200, icone.src);
    }
    assert.equal((await page.request.get(url + "icone.svg")).status(), 200);
    // O <head> aponta pro manifest e pro ícone por caminho relativo (o site vive num subcaminho).
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute("href"), "manifest.webmanifest");
    assert.equal(await page.locator('link[rel="icon"]').getAttribute("href"), "icone.svg");
    assert.equal((await page.request.get(url + "404.html")).status(), 200);
  });

  test("tema escuro não quebra o contraste do destaque", async () => {
    const { page } = await abrir({ escuro: true });
    assert.equal(await page.locator('meta[name="theme-color"][media*="light"]').count(), 1);
    assert.equal(await page.locator('meta[name="theme-color"][media*="dark"]').count(), 1);
    await buscarPor(page, "arroz");
    const cores = await page.evaluate(() => ({
      fundo: getComputedStyle(document.body).backgroundColor,
      melhor: getComputedStyle(document.querySelector("#resultados .preco.melhor")).color,
    }));
    assert.notEqual(cores.fundo, "rgb(247, 246, 242)");
    assert.notEqual(cores.melhor, cores.fundo);
  });

  test("tocar no 'quando' abre e fecha o aviso fixo, também pelo teclado", async () => {
    const { page } = await abrir();
    const avisoFixo = page.locator("#aviso-fixo");
    assert.equal(await avisoFixo.isVisible(), false);
    await page.locator("#quando").click();
    assert.ok(await avisoFixo.isVisible());
    assert.match(await avisoFixo.textContent(), /Preço do site de cada mercado; a loja física e o clube podem ser outros\./);
    assert.equal(await page.locator("#quando").getAttribute("aria-expanded"), "true");
    await page.locator("#quando").click();
    assert.equal(await avisoFixo.isVisible(), false);
    await page.locator("#quando").focus();
    await page.keyboard.press("Enter");
    assert.ok(await avisoFixo.isVisible());
    await page.keyboard.press(" ");
    assert.equal(await avisoFixo.isVisible(), false);
  });
});
