import { test } from "node:test";
import assert from "node:assert/strict";
import { reais, peso, quandoFoi } from "../public/formato.js";

// Datas locais (não ISO com Z) pra o teste não depender do fuso da máquina.
const agora = new Date(2026, 9, 31, 14, 0);
const iso = (...args) => new Date(...args).toISOString();

test("reais formata centavos com espaço comum depois do R$", () => {
  assert.equal(reais(1198), "R$ 11,98");
  assert.equal(reais(0), "R$ 0,00");
  assert.equal(reais(123456), "R$ 1.234,56");
});

test("peso devolve vazio quando não há peso", () => {
  assert.equal(peso(null), "");
  assert.equal(peso(undefined), "");
  assert.equal(peso(0), "");
});

test("peso abaixo de 1 kg fica em gramas", () => {
  assert.equal(peso(500), "500 g");
  assert.equal(peso(999), "999 g");
});

test("peso a partir de 1 kg usa vírgula e tira zeros sobrando", () => {
  assert.equal(peso(1000), "1 kg");
  assert.equal(peso(1500), "1,5 kg");
  assert.equal(peso(1250), "1,25 kg");
});

test("quandoFoi mesmo dia vira 'hoje' com hora e minuto", () => {
  assert.equal(quandoFoi(iso(2026, 9, 31, 12, 5), agora), "hoje 12h05");
});

test("quandoFoi com minutos 00 omite os minutos", () => {
  assert.equal(quandoFoi(iso(2026, 9, 31, 9, 0), agora), "hoje 9h");
});

test("quandoFoi dia anterior vira 'ontem'", () => {
  assert.equal(quandoFoi(iso(2026, 9, 30, 18, 0), agora), "ontem 18h");
});

test("quandoFoi mais antigo vira dd/mm com zero à esquerda", () => {
  assert.equal(quandoFoi(iso(2026, 9, 29, 18, 0), agora), "29/10 18h");
  assert.equal(quandoFoi(iso(2026, 2, 5, 9, 5), agora), "05/03 9h05");
});

test("quandoFoi ontem atravessa a virada do ano", () => {
  const janeiro = new Date(2027, 0, 1, 10, 0);
  assert.equal(quandoFoi(iso(2026, 11, 31, 23, 30), janeiro), "ontem 23h30");
});

test("quandoFoi com data inválida devolve vazio", () => {
  assert.equal(quandoFoi("lixo", agora), "");
});

test("peso de líquido sai em ml e l, com o mesmo arredondamento", () => {
  assert.equal(peso(900, true), "900 ml");
  assert.equal(peso(1000, true), "1 l");
  assert.equal(peso(1500, true), "1,5 l");
  assert.equal(peso(null, true), "");
  assert.equal(peso(1000, false), "1 kg");
});
