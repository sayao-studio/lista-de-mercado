import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexar } from "../public/busca.js";
import {
  novoItemProduto, novoItemTexto, melhorOferta, totais, refrescar,
  comoTexto, deTexto, alterarQuantidade, marcar,
} from "../public/lista.js";

const ler = (nome) =>
  JSON.parse(readFileSync(new URL(`./fixtures/dados/${nome}.json`, import.meta.url), "utf8"));

const catalogos = { bistek: ler("bistek"), giassi: ler("giassi"), angeloni: ler("angeloni") };
const indice = indexar(catalogos);
const mercados = indice.mercados;
const nomes = { bistek: "Bistek", giassi: "Giassi", angeloni: "Angeloni" };
// Data local: o cabeçalho do texto usa o fuso de quem copia.
const agora = new Date(2026, 9, 31, 14, 0);

const arroz = indice.porChave.get("7896006700029");
const banana = indice.porChave.get("bistek:b3");

// A lista do exemplo do desenho: arroz ×2, banana já no carrinho e um item escrito à mão.
function listaExemplo() {
  return [
    alterarQuantidade(novoItemProduto(arroz, agora), +1),
    marcar(novoItemProduto(banana, agora), true),
    novoItemTexto("pão de queijo", agora),
  ];
}

test("novoItemProduto copia ofertas e começa com 1 desmarcado", () => {
  const item = novoItemProduto(arroz, agora);
  assert.equal(item.tipo, "produto");
  assert.equal(typeof item.id, "string");
  assert.notEqual(item.id, novoItemProduto(arroz, agora).id);
  assert.equal(item.chave, "7896006700029");
  assert.equal(item.nome, "Arroz Tio João 1kg");
  assert.equal(item.gramas, 1000);
  assert.equal(item.quantidade, 1);
  assert.equal(item.marcado, false);
  assert.equal(item.adicionadoEm, agora.toISOString());
  assert.deepEqual(Object.keys(item.ofertas), ["bistek", "giassi", "angeloni"]);
  assert.deepEqual(item.ofertas.bistek, {
    id: "b1", preco: 1198, promocao: 1399, link: "https://www.bistek.com.br/arroz-tio-joao-1kg-b1/p",
  });
  // Cópia: mexer no item não pode mexer no índice compartilhado.
  item.ofertas.bistek.preco = 1;
  assert.equal(arroz.ofertas.bistek.preco, 1198);

  const texto = novoItemTexto("pão de queijo", agora);
  assert.deepEqual({ ...texto, id: undefined }, {
    id: undefined, tipo: "texto", nome: "pão de queijo", quantidade: 1, marcado: false,
    adicionadoEm: agora.toISOString(),
  });
});

test("melhorOferta escolhe o menor preço vezes a quantidade e ignora quem sumiu", () => {
  const item = alterarQuantidade(novoItemProduto(arroz, agora), +1);
  assert.deepEqual(melhorOferta(item), { mercado: "giassi", preco: 1090, promocao: 0, total: 2180 });

  const semGiassi = { ...item, ofertas: { ...item.ofertas, giassi: { ...item.ofertas.giassi, sumiu: true } } };
  assert.deepEqual(melhorOferta(semGiassi), { mercado: "bistek", preco: 1198, promocao: 1399, total: 2396 });

  // Empate fica com o primeiro mercado do item.
  const empate = { ...item, ofertas: { a: { id: "1", preco: 500, promocao: 0 }, b: { id: "2", preco: 500, promocao: 0 } } };
  assert.equal(melhorOferta(empate).mercado, "a");

  assert.equal(melhorOferta(novoItemTexto("pão", agora)), null);
  const tudoSumiu = { ...item, ofertas: { bistek: { ...item.ofertas.bistek, sumiu: true } } };
  assert.equal(melhorOferta(tudoSumiu), null);
});

test("totais: tudo num mercado só com faltam, cada item no mais barato, sem preço", () => {
  const t = totais(listaExemplo(), mercados);
  assert.deepEqual(t.porMercado, [
    { mercado: "bistek", total: 2396 + 489, faltam: 0 },
    { mercado: "giassi", total: 2180, faltam: 1 },
    { mercado: "angeloni", total: 2498, faltam: 1 },
  ]);
  assert.equal(t.separado, 2180 + 489);
  assert.equal(t.semPreco, 1);
});

test("refrescar atualiza preço, marca oferta que sumiu e não perde item", () => {
  const lista = listaExemplo();
  const velho = lista[0];
  // Índice novo: Angeloni tirou o arroz e o Giassi subiu o preço.
  const giassi = structuredClone(catalogos.giassi);
  giassi.produtos.find((p) => p.ean === "7896006700029").preco = 1150;
  const angeloni = structuredClone(catalogos.angeloni);
  angeloni.produtos = angeloni.produtos.filter((p) => p.ean !== "7896006700029");
  const novo = indexar({ bistek: catalogos.bistek, giassi, angeloni });

  const resultado = refrescar(lista, novo);
  assert.equal(resultado.length, 3);
  assert.notEqual(resultado, lista);
  const item = resultado[0];
  assert.equal(item.id, velho.id);
  assert.equal(item.quantidade, 2);
  assert.equal(item.ofertas.giassi.preco, 1150);
  assert.equal(item.ofertas.giassi.sumiu, undefined);
  assert.equal(item.ofertas.angeloni.sumiu, true);
  assert.equal(item.ofertas.angeloni.preco, 1249);
  assert.equal(velho.ofertas.giassi.preco, 1090, "não mexe no item de entrada");
  assert.equal(resultado[1].marcado, true);
  assert.deepEqual(resultado[2], lista[2]);

  // Oferta que volta ao catálogo perde o "sumiu".
  const deVolta = refrescar(resultado, indice)[0];
  assert.equal(deVolta.ofertas.angeloni.sumiu, undefined);
  assert.equal(deVolta.ofertas.angeloni.preco, 1249);

  // Produto que sumiu de tudo continua na lista, com o último preço.
  const vazio = indexar({ bistek: { ...catalogos.bistek, produtos: [] } });
  const orfao = refrescar(lista, vazio)[1];
  assert.equal(orfao.ofertas.bistek.sumiu, true);
  assert.equal(orfao.ofertas.bistek.preco, 489);
  assert.equal(melhorOferta(orfao), null);
});

const textoEsperado = [
  "Lista de mercado (31/10 14h00)",
  "• 2× Arroz Tio João 1kg — Giassi R$ 21,80 #7896006700029",
  "✓ 1× Banana Caturra Kg — Bistek R$ 4,89 #bistek:b3",
  "• 1× pão de queijo",
  "Tudo no Bistek: R$ 28,85",
  "Tudo no Giassi: R$ 21,80 (falta 1)",
  "Tudo no Angeloni: R$ 24,98 (falta 1)",
  "Cada item no mais barato: R$ 26,69",
  "1 sem preço",
].join("\n");

test("comoTexto no formato combinado", () => {
  assert.equal(comoTexto(listaExemplo(), nomes, agora), textoEsperado);

  // Sem item sem preço, a última linha some; produto sem oferta viva sai sem mercado.
  const soArroz = [novoItemProduto(arroz, agora)];
  assert.ok(!comoTexto(soArroz, nomes, agora).includes("sem preço"));
  const sumido = { ...soArroz[0], ofertas: { bistek: { ...soArroz[0].ofertas.bistek, sumiu: true } } };
  const linhas = comoTexto([sumido, novoItemTexto("x", agora)], nomes, agora).split("\n");
  assert.equal(linhas[1], "• 1× Arroz Tio João 1kg #7896006700029");
  assert.equal(linhas.at(-1), "2 sem preço");
});

test("deTexto lê o próprio texto de volta e liga pelo índice", () => {
  const itens = deTexto(textoEsperado, indice, agora);
  assert.equal(itens.length, 3);
  assert.equal(itens[0].tipo, "produto");
  assert.equal(itens[0].chave, "7896006700029");
  assert.equal(itens[0].quantidade, 2);
  assert.equal(itens[0].marcado, false);
  assert.equal(itens[1].chave, "bistek:b3");
  assert.equal(itens[1].marcado, true);
  assert.deepEqual([itens[2].tipo, itens[2].nome], ["texto", "pão de queijo"]);
  // Ida e volta dá o mesmo texto.
  assert.equal(comoTexto(itens, nomes, agora), textoEsperado);

  // Sem índice (catálogo ainda não carregou) vira texto com o nome limpo.
  const semIndice = deTexto(textoEsperado, null, agora);
  assert.deepEqual(semIndice.map((i) => [i.tipo, i.nome, i.quantidade]), [
    ["texto", "Arroz Tio João 1kg", 2],
    ["texto", "Banana Caturra Kg", 1],
    ["texto", "pão de queijo", 1],
  ]);
});

test("deTexto com conversa de WhatsApp vira itens de texto sem travar", () => {
  const conversa = [
    "[31/10 09:12] Ana: amor traz isso aqui",
    "",
    "- 3x leite",
    "* 2 x ovos",
    "• café",
    "   ",
    "e não esquece o pão!!",
    "• 0× nada #9999",
    "-",
    "•",
    "✓",
  ].join("\n");
  const itens = deTexto(conversa, indice, agora);
  assert.deepEqual(itens.map((i) => [i.tipo, i.nome, i.quantidade, i.marcado]), [
    ["texto", "[31/10 09:12] Ana: amor traz isso aqui", 1, false],
    ["texto", "leite", 3, false],
    ["texto", "ovos", 2, false],
    ["texto", "café", 1, false],
    ["texto", "e não esquece o pão!!", 1, false],
    ["texto", "nada", 1, false],
  ]);
  assert.deepEqual(deTexto("", indice, agora), []);
});

test("alterarQuantidade não deixa ficar abaixo de 1 e marcar devolve item novo", () => {
  const item = novoItemTexto("pão", agora);
  assert.equal(alterarQuantidade(item, +2).quantidade, 3);
  assert.equal(alterarQuantidade(item, -5).quantidade, 1);
  assert.equal(item.quantidade, 1);
  const marcado = marcar(item, true);
  assert.equal(marcado.marcado, true);
  assert.equal(item.marcado, false);
  assert.equal(marcar(marcado, false).marcado, false);
});

test("refrescar reencontra pelo id da loja quando a chave mudou e completa o peso", () => {
  // Item salvo quando o Bistek ainda não informava EAN do arroz: chave bistek:b1, sem peso.
  const antigo = {
    ...novoItemProduto(arroz, agora),
    chave: "bistek:b1", ean: "", gramas: null, granel: null,
    ofertas: { bistek: { id: "b1", preco: 1000, promocao: 0, link: "x" } },
  };
  const [item] = refrescar([antigo], indice);
  assert.equal(item.chave, "7896006700029");
  assert.equal(item.ean, "7896006700029");
  assert.equal(item.gramas, 1000);
  assert.equal(item.granel, arroz.granel);
  assert.equal(item.ofertas.bistek.preco, 1198);
  assert.deepEqual(Object.keys(item.ofertas), ["bistek", "giassi", "angeloni"]);
  assert.match(comoTexto([item], nomes, agora), /#7896006700029$/m);
});

test("refrescar sem índice devolve a lista como estava", () => {
  const lista = listaExemplo();
  assert.equal(refrescar(lista, null), lista);
  assert.equal(refrescar(lista, undefined), lista);
});

test("mercado que não carregou deixa a oferta indisponível, não sumida, e volta na carga seguinte", () => {
  const lista = listaExemplo();
  // Angeloni fora do ar hoje: o índice só tem Bistek e Giassi.
  const parcial = indexar({ bistek: catalogos.bistek, giassi: catalogos.giassi });

  const [item] = refrescar(lista, parcial);
  assert.equal(item.ofertas.angeloni.indisponivel, true);
  assert.equal(item.ofertas.angeloni.sumiu, undefined);
  assert.equal(item.ofertas.angeloni.preco, 1249, "guarda o último preço conhecido");
  assert.equal(item.ofertas.bistek.indisponivel, undefined);
  assert.equal(item.ofertas.giassi.indisponivel, undefined);
  // Mais barato e totais só contam o que dá pra comprar hoje.
  assert.equal(melhorOferta(item).mercado, "giassi");
  const t = totais([item], ["bistek", "giassi", "angeloni"]);
  assert.deepEqual(t.porMercado.find((m) => m.mercado === "angeloni"), { mercado: "angeloni", total: 0, faltam: 1 });

  // Produto que não acha grupo nenhum: só quem está no índice vira "sumiu".
  const orfao = refrescar(lista, indexar({ bistek: { ...catalogos.bistek, produtos: [] } }))[0];
  assert.equal(orfao.ofertas.bistek.sumiu, true);
  assert.equal(orfao.ofertas.giassi.indisponivel, true);
  assert.equal(orfao.ofertas.giassi.sumiu, undefined);

  // Angeloni de volta: a oferta é a nova, sem marca nenhuma.
  const [deVolta] = refrescar([item], indice);
  assert.equal(deVolta.ofertas.angeloni.indisponivel, undefined);
  assert.equal(deVolta.ofertas.angeloni.sumiu, undefined);
  assert.equal(melhorOferta(deVolta).mercado, "giassi");
});
