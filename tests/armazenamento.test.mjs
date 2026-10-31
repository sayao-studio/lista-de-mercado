import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAVE, CHAVE_BACKUP, carregar, salvar, migrar } from "../public/armazenamento.js";

// localStorage falso; "estourado" imita quota cheia ou Safari privado, que lançam em qualquer acesso.
function storageFalso(inicial = {}, { estourado = false } = {}) {
  const mapa = new Map(Object.entries(inicial));
  const talvezLance = () => { if (estourado) throw new Error("QuotaExceededError"); };
  return {
    mapa,
    getItem: (k) => { talvezLance(); return mapa.has(k) ? mapa.get(k) : null; },
    setItem: (k, v) => { talvezLance(); mapa.set(k, String(v)); },
    removeItem: (k) => { talvezLance(); mapa.delete(k); },
  };
}

const item = (extra = {}) => ({
  id: "a1", tipo: "produto", chave: "7896006700029", nome: "Arroz", gramas: 1000, quantidade: 2, marcado: false,
  ofertas: { bistek: { id: "b1", preco: 1198, promocao: 0, link: "https://www.bistek.com.br/arroz/p" } },
  ...extra,
});

test("carregar devolve vazio quando não há nada", () => {
  const s = storageFalso();
  assert.deepEqual(carregar(s), { versao: 1, itens: [] });
  assert.equal(s.mapa.has(CHAVE_BACKUP), false);
});

test("carregar guarda lixo no backup e devolve vazio", () => {
  const s = storageFalso({ [CHAVE]: "{isso não é json" });
  assert.deepEqual(carregar(s), { versao: 1, itens: [] });
  assert.equal(s.mapa.get(CHAVE_BACKUP), "{isso não é json");
  // O original fica onde estava: quem quiser recuperar ainda acha.
  assert.equal(s.mapa.get(CHAVE), "{isso não é json");
});

test("carregar com versão futura guarda backup e devolve vazio", () => {
  const bruto = JSON.stringify({ versao: 2, itens: [item()] });
  const s = storageFalso({ [CHAVE]: bruto });
  assert.deepEqual(carregar(s), { versao: 1, itens: [] });
  assert.equal(s.mapa.get(CHAVE_BACKUP), bruto);
});

test("carregar descarta só o item quebrado", () => {
  const bom = item();
  const bruto = JSON.stringify({ versao: 1, itens: [bom, { id: "x", tipo: "produto" }, "lixo"] });
  const s = storageFalso({ [CHAVE]: bruto });
  assert.deepEqual(carregar(s), { versao: 1, itens: [bom] });
  assert.equal(s.mapa.get(CHAVE_BACKUP), bruto);
});

test("carregar com lista boa não mexe no backup", () => {
  const estado = { versao: 1, itens: [item(), item({ id: "t1", tipo: "texto", nome: "pão", marcado: true })] };
  const s = storageFalso({ [CHAVE]: JSON.stringify(estado) });
  assert.deepEqual(carregar(s), estado);
  assert.equal(s.mapa.has(CHAVE_BACKUP), false);
});

test("migrar corrige quantidade e marcado sem descartar o item", () => {
  const { estado, descartou } = migrar(JSON.stringify({
    versao: 1,
    itens: [item({ quantidade: "3" }), item({ id: "b", quantidade: 0, marcado: "sim" }), item({ id: "c", quantidade: 2.7, marcado: undefined })],
  }));
  assert.equal(descartou, false);
  assert.deepEqual(estado.itens.map((i) => [i.quantidade, i.marcado]), [[3, false], [1, true], [2, false]]);
});

test("migrar devolve null pro que não dá pra usar", () => {
  for (const bruto of ["nada", "null", "[]", "42", '{"versao":1}', '{"versao":1,"itens":{}}']) {
    assert.equal(migrar(bruto), null, bruto);
  }
});

test("carregar com storage que lança se comporta como vazio", () => {
  assert.deepEqual(carregar(storageFalso({}, { estourado: true })), { versao: 1, itens: [] });
});

test("salvar devolve false quando o storage estoura", () => {
  const estado = { versao: 1, itens: [item()] };
  assert.equal(salvar(estado, storageFalso({}, { estourado: true })), false);
  const s = storageFalso();
  assert.equal(salvar(estado, s), true);
  assert.deepEqual(JSON.parse(s.mapa.get(CHAVE)), estado);
});

// Lista mexida à mão (ou por versão velha com bug) não pode derrubar as duas
// telas: o produto sem ofertas válidas chegava até Object.keys(undefined).
test("migrar conserta produto sem ofertas e manda o original pro backup", () => {
  const { ofertas, ...semOfertas } = item();
  for (const quebrado of [semOfertas, item({ ofertas: null }), item({ ofertas: [1, 2] }), item({ ofertas: "x" })]) {
    const { estado, descartou } = migrar(JSON.stringify({ versao: 1, itens: [quebrado] }));
    assert.equal(descartou, true, JSON.stringify(quebrado));
    assert.deepEqual(estado.itens[0].ofertas, {});
  }
});

test("migrar tira só a oferta com preço que não é número", () => {
  const { estado, descartou } = migrar(JSON.stringify({
    versao: 1,
    itens: [item({ ofertas: { bistek: { id: "b1", preco: "x" }, giassi: { id: "g1", preco: 1090 }, angeloni: null } })],
  }));
  assert.equal(descartou, true);
  assert.deepEqual(Object.keys(estado.itens[0].ofertas), ["giassi"]);
});

test("migrar troca gramas inválido por null e recusa produto sem chave", () => {
  const r = migrar(JSON.stringify({ versao: 1, itens: [item({ gramas: "abc" })] }));
  assert.equal(r.descartou, true);
  assert.equal(r.estado.itens[0].gramas, null);

  const semChave = migrar(JSON.stringify({ versao: 1, itens: [item({ chave: 42 }), item({ id: "b" })] }));
  assert.equal(semChave.descartou, true);
  assert.deepEqual(semChave.estado.itens.map((i) => i.id), ["b"]);

  // Produto bom (gramas nulo, líquido) passa sem ir pro backup.
  const bom = migrar(JSON.stringify({ versao: 1, itens: [item({ gramas: null, liquido: true })] }));
  assert.equal(bom.descartou, false);
  assert.equal(bom.estado.itens[0].liquido, true);
});

test("migrar aceita item de texto com chave e tira chave que não é texto", () => {
  const texto = { id: "t1", tipo: "texto", nome: "Arroz", quantidade: 1, marcado: false };
  const bom = migrar(JSON.stringify({ versao: 1, itens: [{ ...texto, chave: "7896006700029" }] }));
  assert.equal(bom.descartou, false);
  assert.equal(bom.estado.itens[0].chave, "7896006700029");
  const ruim = migrar(JSON.stringify({ versao: 1, itens: [{ ...texto, chave: 7 }] }));
  assert.equal(ruim.descartou, true);
  assert.equal("chave" in ruim.estado.itens[0], false);
});
