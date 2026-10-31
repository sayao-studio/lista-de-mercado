import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pesoGramas, eanValido, hostFoto, linhasDoProduto } from "../robo/produto.js";

// Fixture pagina-vtex.json (JSON das lojas como veio, sem edição):
//   [0] Bebida Vegetal Banana Milk 1l (Bistek): o produto com promoção (22,65 -> 19,47)
//   [1] Banana Caturra Kg (Giassi): o granel, vendido por quilo em passos de 1,4 kg.
//       O Bistek não expõe nenhum produto com unidade "kg" na API, então o granel
//       vem de outra loja VTEX; o formato do JSON é o mesmo.
//   [2] Mamão Papaia Unid. (Bistek): o sem peso no nome, com código interno 3000...
const fixture = JSON.parse(readFileSync(new URL("./fixtures/vtex/pagina-vtex.json", import.meta.url), "utf8"));

test("pesoGramas lê kg, g, ml, kit 2x e nome sem peso", () => {
  assert.equal(pesoGramas("Arroz Tio João 5kg"), 5000);
  assert.equal(pesoGramas("Óleo de Soja Liza 900ml"), 900);
  assert.equal(pesoGramas("Kit 2x 400g"), 800);
  assert.equal(pesoGramas("Banana Caturra Kg"), 1000);
  assert.equal(pesoGramas("Mamão Papaia Unid."), null);
});

test("eanValido aceita GTIN com dígito certo e recusa interno", () => {
  assert.equal(eanValido("7896436100642"), true);
  assert.equal(eanValido("7896436100641"), false); // dígito errado
  assert.equal(eanValido("8727"), false); // código interno Giassi
  assert.equal(eanValido("82"), false); // código interno Angeloni
  assert.equal(eanValido("3000030705309"), false); // interno Bistek, dígito bate
  assert.equal(eanValido("2000000000008"), false); // peso variável
  assert.equal(eanValido("40170725"), true); // GTIN-8
  assert.equal(eanValido(""), false);
  assert.equal(eanValido(null), false);
  assert.equal(eanValido(7896436100642), false); // número não é texto
});

test("linhasDoProduto: promoção em centavos, granel por passo, sem estoque fora", () => {
  assert.deepEqual(linhasDoProduto(fixture[0]), [{
    id: "2344041",
    nome: "Bebida Vegetal De Banana Barista Banana Milk 1l",
    marca: "Bistek",
    ean: "7898975890015",
    gramas: 1000,
    granel: false,
    preco: 1947,
    promocao: 2265,
    foto: "207350",
    link: "bebida-vegetal-de-banana-barista-banana-milk-1l-2344041",
  }]);

  // Granel: preço por quilo (4,89) vira preço do passo de 1,4 kg.
  assert.deepEqual(linhasDoProduto(fixture[1]), [{
    id: "10544",
    nome: "Banana Caturra Kg",
    marca: "Giassi",
    ean: "",
    gramas: 1400,
    granel: true,
    preco: 685,
    promocao: 0,
    foto: "14793436",
    link: "banana_caturra_kg_51276",
  }]);

  // Sem peso no nome: a linha continua, com gramas nulo.
  const [mamao] = linhasDoProduto(fixture[2]);
  assert.equal(mamao.gramas, null);
  assert.equal(mamao.granel, false);
  assert.equal(mamao.ean, ""); // código interno 3000... não vira EAN
  assert.equal(mamao.preco, 823);
  assert.equal(mamao.promocao, 0);
  assert.equal(mamao.foto, "201788");

  // Sem estoque é ignorado (cópia em memória, a fixture não muda).
  const semEstoque = structuredClone(fixture[0]);
  semEstoque.items[0].sellers[0].commertialOffer.AvailableQuantity = 0;
  assert.deepEqual(linhasDoProduto(semEstoque), []);
});

test("hostFoto tira o host da primeira imagem", () => {
  assert.equal(hostFoto(fixture[0]), "https://bistek.vteximg.com.br/arquivos/ids/");
  assert.equal(hostFoto({ items: [{ images: [] }] }), null);
});
