#!/usr/bin/env node
// CLI do robô: só traduz os argumentos e chama `atualizar`. Sai com 1 apenas
// quando nenhum mercado tem dados, para o deploy não publicar site vazio.

import { parseArgs } from "node:util";
import { MERCADOS } from "./mercados.js";
import { atualizar } from "./publicacao.js";

const USO = `uso: node robo/catalogo.mjs --saida <pasta> [--anterior <url>] [--so-anterior] [--limite <n>] [--mercado <id>]...
  mercados: ${MERCADOS.map((m) => m.id).join(", ")}`;

function sair(mensagem, codigo) {
  console.error(mensagem);
  process.exit(codigo);
}

let valores;
try {
  ({ values: valores } = parseArgs({
    options: {
      saida: { type: "string" },
      anterior: { type: "string" },
      "so-anterior": { type: "boolean", default: false },
      limite: { type: "string" },
      mercado: { type: "string", multiple: true },
    },
  }));
} catch (e) {
  sair(`${e.message}\n${USO}`, 2);
}

if (!valores.saida) sair(USO, 2);

let mercados = MERCADOS;
if (valores.mercado) {
  const desconhecidos = valores.mercado.filter((id) => !MERCADOS.some((m) => m.id === id));
  if (desconhecidos.length) sair(`mercado desconhecido: ${desconhecidos.join(", ")}\n${USO}`, 2);
  mercados = MERCADOS.filter((m) => valores.mercado.includes(m.id));
}

let limite;
if (valores.limite !== undefined) {
  limite = Number(valores.limite);
  if (!Number.isInteger(limite) || limite < 1) sair(`--limite precisa ser um inteiro positivo\n${USO}`, 2);
}

try {
  await atualizar({
    mercados,
    saida: valores.saida,
    anterior: valores.anterior?.replace(/\/+$/, "") ?? null,
    soAnterior: valores["so-anterior"],
    limite,
  });
} catch (e) {
  sair(e.message, 1);
}
