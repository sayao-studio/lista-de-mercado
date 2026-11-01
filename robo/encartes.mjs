#!/usr/bin/env node
// Lê os encartes da semana (Tiendeo) e grava public/encartes.json, que vai
// pro git e sai no site no próximo push. Roda na máquina do dono, porque a
// leitura das páginas sem recortes usa o `claude` dele (npm run encartes).
//
//   node robo/encartes.mjs [--saida public/encartes.json] [--sem-ia] [--max-paginas 24]
//
// Saída 0: gravou. 1: não achou nenhum encarte (o arquivo velho fica).
import { parseArgs } from "node:util";
import { writeFile, rename, readFile } from "node:fs/promises";
import { montarEncartes, juntarComAnterior, MAX_PAGINAS } from "./encartes/montar.mjs";
import { lerPaginas } from "./encartes/leitura.mjs";

const { values } = parseArgs({
  options: {
    saida: { type: "string", default: "public/encartes.json" },
    "sem-ia": { type: "boolean", default: false },
    "max-paginas": { type: "string", default: String(MAX_PAGINAS) },
  },
});

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const novo = await montarEncartes({
  lerPaginas, hoje, semIa: values["sem-ia"], maxPaginas: Number(values["max-paginas"]) || MAX_PAGINAS,
  log: (m) => console.log(m),
});
let anterior = null;
try { anterior = JSON.parse(await readFile(values.saida, "utf8")); } catch { /* primeira vez */ }
const r = juntarComAnterior(novo, anterior, hoje);

for (const a of r.avisos) console.log("aviso: " + a);
const mercados = Object.values(r.mercados);
if (!mercados.length) {
  console.log("Nenhum encarte com produto; o arquivo anterior ficou como estava.");
  process.exit(1);
}
for (const m of mercados) {
  console.log(`${m.nome}: ${m.produtos.length} produtos (${m.encartes.map((e) => `"${e.titulo}" até ${e.fim}, ${e.fonte}`).join("; ")})`);
}
if (r.ia.lotes) console.log(`IA: ${r.ia.paginas} páginas em ${r.ia.lotes} lotes, US$ ${r.ia.custo.toFixed(2)}`);
// Gravação atômica: o site nunca lê um arquivo pela metade.
await writeFile(values.saida + ".tmp", JSON.stringify(r));
await rename(values.saida + ".tmp", values.saida);
console.log(`Gravado em ${values.saida}. Pra publicar: commit e push.`);
