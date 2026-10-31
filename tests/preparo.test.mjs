import { test } from "node:test";
import assert from "node:assert/strict";
import { PREPAROS, preparosDe } from "../public/preparo.js";

// Nomes reais dos três mercados.
test("preparosDe lê bife, moída, cubos, tiras, pedaço, espeto e temperada do nome", () => {
  assert.deepEqual(preparosDe("Coxão Mole Bovino BEST BEEF Bife kg"), ["bife"]);
  assert.deepEqual(preparosDe("Coxão de Fora Bovino em Bifes Resfriado Amaciado sem Osso Giassi Vácuo Kg"), ["bife"]);
  assert.deepEqual(preparosDe("Bisteca Suína Congelada Aurora Kg"), ["bife"]);
  assert.deepEqual(preparosDe("Acém Moído Bovino BEST BEEF Kg"), ["moida"]);
  assert.deepEqual(preparosDe("Carne Moida Bovino TOP QUALITY Acem ATM Resfriado 500g"), ["moida"]);
  assert.deepEqual(preparosDe("Acém Bovino BEST BEEF Cubos Kg"), ["cubos"]);
  assert.deepEqual(preparosDe("Acém Bovino BEST BEEF Carne de Panela IQF 500g"), ["cubos"]);
  assert.deepEqual(preparosDe("Acém Bovino BEST BEEF Tiras Kg"), ["tiras"]);
  assert.deepEqual(preparosDe("Iscas de Frango Temperadas Seara 500g"), ["tiras", "temperada"]);
  assert.deepEqual(preparosDe("Alcatra MONTANA PERDIGAO Pedaço kg"), ["pedaco"]);
  assert.deepEqual(preparosDe("Fraldinha Bovina MONTANA (PEÇA) Resfriada  Kg"), ["pedaco"]);
  assert.deepEqual(preparosDe("Acém Corte Para Assar Frescal 1,5kg"), ["pedaco"]);
  assert.deepEqual(preparosDe("Costela Suína em Pedaços Resfriada Temperada Disner Kg"), ["pedaco", "temperada"]);
  assert.deepEqual(preparosDe("Espetinho Bovino Giassi 500g"), ["espeto"]);
  // Corte sem preparo no nome não ganha chip.
  assert.deepEqual(preparosDe("Filé Mignon Bovino Resfriado sem Osso Giassi Vácuo Kg"), []);
  assert.deepEqual(preparosDe("Linguiça Calabresa Defumada Pamplona 400g"), []);
  assert.deepEqual(preparosDe(""), []);
  assert.deepEqual(preparosDe(null), []);
});

test("PREPAROS tem id único e nome pra o chip", () => {
  const ids = PREPAROS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PREPAROS) assert.ok(p.nome && p.regra instanceof RegExp, p.id);
});
