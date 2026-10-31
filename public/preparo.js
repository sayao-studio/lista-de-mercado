// Preparo das carnes, lido do nome: no açougue a pessoa pede "bife",
// "moída", "em cubos", e o nome do produto diz isso ("Acém Moído Bovino
// BEST BEEF Kg", "Coxão Mole em Bifes", "Costela em Pedaços Temperada").
// Vale só pro departamento de carnes, que é o foco de quem compara preço
// por quilo. Um produto pode ter mais de um ("em Pedaços Temperada").
import { normalizar } from "./texto.js";

export const PREPAROS = [
  { id: "bife", nome: "Bife", regra: /\bbifes?\b|\bbisteca/ },
  { id: "moida", nome: "Moída", regra: /\bmoid[ao]s?\b/ },
  { id: "cubos", nome: "Cubos", regra: /\bcubos?\b|\bpicad[ao]s?\b|\bpanela\b|ensopad/ },
  { id: "tiras", nome: "Tiras", regra: /\btiras?\b|\biscas?\b|strogonoff|\bfajita/ },
  { id: "pedaco", nome: "Pedaço", regra: /\bpedacos?\b|\bpecas?\b|\binteir[ao]s?\b|\bassar\b|\bassad[ao]s?\b/ },
  { id: "espeto", nome: "Espeto", regra: /\bespet(o|os|inho|inhos)\b/ },
  { id: "temperada", nome: "Temperada", regra: /\btemperad[ao]s?\b|\bmarinad/ },
];

// Ids dos preparos que o nome traz, na ordem da lista acima.
export function preparosDe(nome) {
  const texto = normalizar(nome);
  if (!texto) return [];
  return PREPAROS.filter((p) => p.regra.test(texto)).map((p) => p.id);
}
