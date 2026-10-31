import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPARTAMENTOS, classificar, secoesConhecidas } from "../public/departamentos.js";
import { MERCADOS } from "../robo/mercados.js";

// Árvores de verdade dos três mercados (31/10/2026), até o 3º nível, só nomes.
const arvores = JSON.parse(readFileSync(new URL("./fixtures/vtex/arvores.json", import.meta.url), "utf8"));

test("classificar acha departamento e seção por palavra-chave, sem acento", () => {
  assert.deepEqual(classificar("Mercearia > Massas > Macarrão"), { departamento: "mercearia", secao: "Massas" });
  assert.deepEqual(classificar("Hortifrúti > Frutas"), { departamento: "hortifruti", secao: "Frutas" });
  assert.deepEqual(classificar("Carnes, Aves e Peixes > Carnes Bovinas"), { departamento: "carnes", secao: "Bovinos" });
  // "Aves" no nome do departamento não pode puxar tudo pra "Aves".
  assert.deepEqual(classificar("Carnes, Aves e Peixes > Carnes Suínas"), { departamento: "carnes", secao: "Suínos" });
  assert.deepEqual(classificar("Churrasco > Carnes > Frango"), { departamento: "carnes", secao: "Aves" });
  assert.deepEqual(classificar("Churrasco > Carnes"), { departamento: "carnes", secao: "Bovinos" });
  assert.deepEqual(classificar("Peixaria > Bacalhau"), { departamento: "carnes", secao: "Peixes e frutos do mar" });
  assert.deepEqual(classificar("Limpeza e Lavanderia > Limpador Sanitário"), { departamento: "limpeza", secao: "Banheiro" });
  assert.deepEqual(classificar("Higiene e Beleza > Papel Toalha - intimo"), { departamento: "higiene", secao: "Papel higiênico e lenços" });
});

test("classificar cruza as árvores: leite do Bistek sai de Bebidas, congelado sai de Frios", () => {
  assert.deepEqual(classificar("Bebidas > Leites e Bebidas Lácteas > Leite Integral"), { departamento: "frios", secao: "Leites e bebidas lácteas" });
  assert.deepEqual(classificar("Bebidas não alcoólicas > Bebida Láctea"), { departamento: "frios", secao: "Leites e bebidas lácteas" });
  assert.deepEqual(classificar("Frios e Laticínios > Congelados > Pizzas"), { departamento: "congelados", secao: "Pratos prontos e pizzas" });
  assert.deepEqual(classificar("Frios e Laticínios > Congelados > Lanches"), { departamento: "congelados", secao: "Lanches" });
  assert.deepEqual(classificar("Frios e Laticínios > Creme de Leite e Nata"), { departamento: "frios", secao: "Manteiga, margarina e requeijão" });
  assert.deepEqual(classificar("Bebidas > Cervejas > Lata"), { departamento: "alcoolicas", secao: "Cervejas" });
  assert.deepEqual(classificar("Bebidas > Chás e Mates"), { departamento: "bebidas", secao: "Chás e cafés prontos" });
  assert.deepEqual(classificar("Mercearia > Alimentos Infantis"), { departamento: "bebe", secao: "Alimentação infantil" });
  assert.deepEqual(classificar("Higiene e Beleza > Infantil > Shampoo"), { departamento: "bebe", secao: "Higiene e banho" });
  assert.deepEqual(classificar("Bem Estar e Equilíbrio > Bebida Vegetal"), { departamento: "bebidas", secao: "Bebidas vegetais" });
  assert.deepEqual(classificar("Mercearia > Achocolatado Em Pó"), { departamento: "mercearia", secao: "Café, chá e matinais" });
  assert.deepEqual(classificar("Mercearia > Chocolates, Doces e Salgadinhos"), { departamento: "mercearia", secao: "Doces, chocolates e balas" });
  assert.deepEqual(classificar("Mercearia > Salgadinhos e Snacks"), { departamento: "mercearia", secao: "Biscoitos e snacks" });
  assert.deepEqual(classificar("Bebê e Crianças > Decoração Infantil"), { departamento: "bebe", secao: "Enxoval" });
});

test("classificar não quebra com caminho desconhecido, raso ou vazio", () => {
  assert.deepEqual(classificar("Bistek"), { departamento: "outros", secao: "Geral" });
  assert.deepEqual(classificar("Loja de Conveniência > Gelo e Carvão"), { departamento: "outros", secao: "Gelo e Carvão" });
  assert.deepEqual(classificar("Mercearia"), { departamento: "mercearia", secao: "Geral" });
  assert.deepEqual(classificar("Mercearia > Cestas"), { departamento: "mercearia", secao: "Cestas" });
  assert.deepEqual(classificar(""), { departamento: "outros", secao: "Geral" });
  assert.deepEqual(classificar(undefined), { departamento: "outros", secao: "Geral" });
});

test("DEPARTAMENTOS tem id único e toda regra de seção aponta pra um deles", () => {
  const ids = DEPARTAMENTOS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("outros"));
  for (const id of ids) assert.ok(Array.isArray(secoesConhecidas(id)), id);
  assert.deepEqual(secoesConhecidas("hortifruti")[1], "Frutas");
});

// Cobertura sobre as árvores reais, até o 3º nível (é onde o produto fica):
// nenhum departamento (fora os ignorados pelo robô) cai em "Outros", e as
// seções que ficam com o nome do mercado são poucas e conhecidas. Mudou a
// árvore de um mercado? Este teste lista o que apareceu de novo.
test("toda categoria dos três mercados tem departamento e seção", () => {
  const semDepartamento = [];
  const semSecao = [];
  for (const mercado of MERCADOS) {
    for (const departamento of arvores[mercado.id]) {
      if ((mercado.ignorar || []).includes(departamento.nome)) continue;
      const caminhos = [];
      for (const filho of departamento.filhos) {
        if (filho.netos.length) for (const neto of filho.netos) caminhos.push(`${departamento.nome} > ${filho.nome} > ${neto}`);
        else caminhos.push(`${departamento.nome} > ${filho.nome}`);
      }
      if (!caminhos.length) caminhos.push(departamento.nome);
      for (const caminho of caminhos) {
        const { departamento: id, secao } = classificar(caminho);
        if (id === "outros") semDepartamento.push(`${mercado.id}: ${caminho}`);
        else if (!secoesConhecidas(id).includes(secao)) semSecao.push(`${mercado.id}: ${caminho} → ${id} / ${secao}`);
      }
    }
  }
  assert.deepEqual(semDepartamento, ["bistek: Bistek"]);
  assert.deepEqual(semSecao.sort(), [
    "bistek: Bebidas > Étnicos → bebidas / Étnicos",
    "bistek: Mercearia > Cestas > Básica → mercearia / Cestas",
    "bistek: Mercearia > Cestas > Comemorativas → mercearia / Cestas",
  ]);
});
