import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizar, chaveDe, indexar, buscar } from "../public/busca.js";

const ler = (nome) =>
  JSON.parse(readFileSync(new URL(`./fixtures/dados/${nome}.json`, import.meta.url), "utf8"));

// Mesma ordem do resumo.json: é a ordem que o app vai passar.
const catalogos = { bistek: ler("bistek"), giassi: ler("giassi"), angeloni: ler("angeloni") };
const indice = indexar(catalogos);
const nomes = (grupos) => grupos.map((g) => g.nome);

test("normalizar tira acento, caixa e espaço duplo", () => {
  assert.equal(normalizar("  ARROZ  Íntegral "), "arroz integral");
  assert.equal(normalizar("Feijão\tCarioca"), "feijao carioca");
});

test("chaveDe usa o EAN e, sem ele, mercado:id", () => {
  assert.equal(chaveDe("bistek", { id: "b1", ean: "7896006700029" }), "7896006700029");
  assert.equal(chaveDe("bistek", { id: "b3", ean: "" }), "bistek:b3");
});

test("indexar agrupa o mesmo EAN dos três mercados num grupo só", () => {
  const arroz = indice.porChave.get("7896006700029");
  assert.deepEqual(Object.keys(arroz.ofertas), ["bistek", "giassi", "angeloni"]);
  assert.equal(arroz.gramas, 1000);
  assert.equal(arroz.foto, "https://bistek.vteximg.com.br/arquivos/ids/101-120-120");
  assert.equal(arroz.menor, 1090);
  assert.equal(arroz.porKg, 1090);
  assert.equal(arroz.categoria, "Mercearia > Arroz");
  assert.equal(arroz.texto, "arroz tio joao 1kg tio joao");
  assert.deepEqual(arroz.ofertas.bistek, {
    id: "b1", preco: 1198, promocao: 1399, nome: "Arroz Tio João 1kg", gramas: 1000,
    link: "https://www.bistek.com.br/arroz-tio-joao-1kg-b1/p",
  });
  assert.equal(indice.porMercado.get("giassi:g1"), arroz);
  assert.deepEqual(indice.mercados, ["bistek", "giassi", "angeloni"]);
  // 4 + 3 + 4 linhas, com o arroz em três e o feijão em dois: 8 produtos distintos.
  assert.equal(indice.grupos.length, 8);
});

test("indexar pega o peso do primeiro mercado que tem, e foto/nome do primeiro", () => {
  // Giassi primeiro e com gramas nulo: o peso tem que vir do próximo, senão some o R$/kg.
  const outro = indexar({ giassi: catalogos.giassi, bistek: catalogos.bistek, angeloni: catalogos.angeloni });
  const arroz = outro.porChave.get("7896006700029");
  assert.equal(arroz.gramas, 1000);
  assert.equal(arroz.foto, "https://giassi.vteximg.com.br/arquivos/ids/201-120-120");
  assert.equal(arroz.ofertas.giassi.gramas, null);
  assert.equal(indice.porChave.get("giassi:g3").foto, null);
  assert.equal(indice.porChave.get("angeloni:a4").porKg, null);
});

test("indexar fica com o SKU mais barato quando a loja repete o EAN", () => {
  const bistek = structuredClone(catalogos.bistek);
  // Mais barato primeiro e mais caro depois: a última linha não pode sobrescrever.
  bistek.produtos.push({ ...bistek.produtos[0], id: "b9", preco: 1500, link: "arroz-caro-b9" });
  bistek.produtos.unshift({ ...bistek.produtos[0], id: "b8", preco: 990, link: "arroz-barato-b8" });
  const repetido = indexar({ bistek, giassi: catalogos.giassi, angeloni: catalogos.angeloni });
  const arroz = repetido.porChave.get("7896006700029");
  assert.equal(arroz.ofertas.bistek.id, "b8");
  assert.equal(arroz.ofertas.bistek.link, "https://www.bistek.com.br/arroz-barato-b8/p");
  assert.equal(arroz.menor, 990);
  assert.equal(arroz.porKg, 990);
  for (const id of ["b1", "b8", "b9"]) assert.equal(repetido.porMercado.get(`bistek:${id}`), arroz);

  // Só o caro sobrando na loja: o menor do grupo é o de outra oferta visível, não o descartado.
  const soCaro = structuredClone(catalogos.bistek);
  soCaro.produtos.push({ ...soCaro.produtos[0], id: "b7", preco: 900, link: "x" });
  soCaro.produtos.push({ ...soCaro.produtos[0], id: "b6", preco: 2000, link: "y" });
  const outro = indexar({ bistek: soCaro }).porChave.get("7896006700029");
  assert.equal(outro.ofertas.bistek.id, "b7");
  assert.equal(outro.menor, 900);
});

// Link de verdade com espaço no slug: sem codificar, o navegador abriria
// um endereço quebrado na loja.
test("indexar codifica o link da loja e marca o grupo líquido pelo peso", () => {
  const bistek = structuredClone(catalogos.bistek);
  bistek.produtos[0].link = "arroz tio joao-b1";
  const arroz = indexar({ bistek }).porChave.get("7896006700029");
  assert.equal(arroz.ofertas.bistek.link, "https://www.bistek.com.br/arroz%20tio%20joao-b1/p");
  assert.equal(arroz.liquido, false);
  const leite = indice.porChave.get("7896043400012");
  assert.equal(leite.liquido, true);
  // R$/l continua no mesmo campo numérico, por litro.
  assert.equal(leite.porKg, 549);
});

test("indexar deixa granel sem EAN como grupo de uma loja", () => {
  const banana = indice.porChave.get("bistek:b3");
  assert.equal(banana.granel, true);
  assert.equal(banana.ean, "");
  assert.deepEqual(Object.keys(banana.ofertas), ["bistek"]);
  assert.equal(banana.marca, "");
});

test("buscar por prefixo de palavra, sem acento e caixa", () => {
  assert.deepEqual(nomes(buscar(indice, "ARRO tio")), ["Arroz Tio João 1kg"]);
  assert.deepEqual(nomes(buscar(indice, "feij")), ["Feijão Carioca Camil 1kg"]);
  assert.deepEqual(nomes(buscar(indice, "Café")), ["Café Melitta 500g"]);
  // Pedaço do meio da palavra não conta: "rroz" não é começo de palavra nenhuma.
  assert.deepEqual(buscar(indice, "rroz"), []);
  assert.deepEqual(buscar(indice, "xyz"), []);
});

test("buscar com termo vazio devolve vazio", () => {
  assert.deepEqual(buscar(indice, ""), []);
  assert.deepEqual(buscar(indice, "   "), []);
});

test("buscar ordena: começa pelo termo, depois mais mercados, depois menor preço", () => {
  // O arroz é o mais caro, mas é o único que começa por "arroz".
  assert.deepEqual(nomes(buscar(indice, "arroz")), [
    "Arroz Tio João 1kg", "Biscoito de Arroz Camil 150g", "Farinha de Arroz Urbano",
  ]);
  // Nenhum começa por "camil": o feijão (2 mercados) vence o biscoito mais barato (1 mercado).
  assert.deepEqual(nomes(buscar(indice, "camil")), [
    "Feijão Carioca Camil 1kg", "Biscoito de Arroz Camil 150g",
  ]);
});

test("buscar filtra só promoções e por mercado", () => {
  assert.deepEqual(nomes(buscar(indice, "arroz", { promocao: true })), ["Arroz Tio João 1kg"]);
  assert.deepEqual(nomes(buscar(indice, "cafe", { promocao: true })), ["Café Melitta 500g"]);
  assert.deepEqual(buscar(indice, "feijao", { promocao: true }), []);

  const giassi = { mercados: ["giassi"] };
  assert.deepEqual(nomes(buscar(indice, "arroz", giassi)), ["Arroz Tio João 1kg"]);
  assert.deepEqual(nomes(buscar(indice, "cafe", giassi)), ["Café Melitta 500g"]);
  assert.deepEqual(buscar(indice, "feijao", giassi), []);
  assert.deepEqual(nomes(buscar(indice, "feijao", { mercados: ["giassi", "angeloni"] })), [
    "Feijão Carioca Camil 1kg",
  ]);
});

test("buscar ordena por preço e por preço/kg com nulos no fim", () => {
  assert.deepEqual(nomes(buscar(indice, "arroz", { ordem: "preco" })), [
    "Biscoito de Arroz Camil 150g", "Farinha de Arroz Urbano", "Arroz Tio João 1kg",
  ]);
  // Biscoito: 399 por 150 g = R$ 26,60/kg; a farinha não tem peso e vai pro fim.
  assert.deepEqual(nomes(buscar(indice, "arroz", { ordem: "porKg" })), [
    "Arroz Tio João 1kg", "Biscoito de Arroz Camil 150g", "Farinha de Arroz Urbano",
  ]);
});

// Gerador congruencial com semente fixa: o catálogo sintético sai sempre igual,
// então o tempo medido não varia por sorte do sorteio.
function sorteador(semente) {
  let estado = semente >>> 0;
  return (n) => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado % n;
  };
}

function catalogoSintetico(id, semente, linhas, vocabulario) {
  const sortear = sorteador(semente);
  const produtos = [];
  for (let i = 0; i < linhas; i++) {
    const palavras = [];
    const quantas = 3 + sortear(3);
    for (let p = 0; p < quantas; p++) palavras.push(vocabulario[sortear(vocabulario.length)]);
    produtos.push({
      id: String(i), nome: palavras.join(" "), marca: vocabulario[sortear(vocabulario.length)],
      ean: "", gramas: 100 + sortear(1900), granel: false, preco: 100 + sortear(5000),
      promocao: 0, foto: String(i), link: `p-${i}`, categoria: 0,
    });
  }
  return {
    versao: 1, mercado: id, nome: id, site: `https://www.${id}.com.br`,
    fotos: `https://${id}.vteximg.com.br/arquivos/ids/`, atualizadoEm: "2026-10-31T12:00:00.000Z",
    categorias: ["Tudo"], produtos,
  };
}

test("buscar responde em menos de 100 ms com 54 mil grupos", () => {
  const silabas = ["ba", "ce", "di", "fo", "gu", "la", "me", "ni", "po", "ru", "sa", "te", "vi", "xo", "za"];
  const vocabulario = ["arroz", "integral", "arrozina", "interno"];
  for (const a of silabas) for (const b of silabas) {
    if (vocabulario.length < 300) vocabulario.push(a + b + "l");
  }
  const sinteticos = {
    um: catalogoSintetico("um", 1, 18000, vocabulario),
    dois: catalogoSintetico("dois", 2, 18000, vocabulario),
    tres: catalogoSintetico("tres", 3, 18000, vocabulario),
  };

  const inicio = performance.now();
  const grande = indexar(sinteticos);
  const tempoIndexar = performance.now() - inicio;
  assert.equal(grande.grupos.length, 54000);
  // Tempo de indexar não tem orçamento no desenho: só vai pro log, pra não
  // falhar em runner lento.

  const tempos = [];
  let achados = 0;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    achados = buscar(grande, "arro int").length;
    tempos.push(performance.now() - t0);
  }
  tempos.sort((a, b) => a - b);
  const mediana = tempos[2];
  assert.ok(achados > 0, "a busca sintética tem que achar alguma coisa");
  console.log(`busca: mediana ${mediana.toFixed(1)} ms, ${achados} achados; indexar ${tempoIndexar.toFixed(1)} ms`);
  assert.ok(mediana < 100, `mediana da busca ${mediana.toFixed(1)} ms`);
});
