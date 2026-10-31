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

const item = (extra = {}) => ({ id: "a1", tipo: "produto", nome: "Arroz", quantidade: 2, marcado: false, ...extra });

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
