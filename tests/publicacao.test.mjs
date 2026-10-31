import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atualizar } from "../robo/publicacao.js";
import { ErroRastreio } from "../robo/vtex.js";

const MERCADOS_TESTE = [
  { id: "bistek", nome: "Bistek", site: "https://www.bistek.com.br", ignorar: [] },
  { id: "giassi", nome: "Giassi", site: "https://www.giassi.com.br", ignorar: [] },
  { id: "angeloni", nome: "Angeloni", site: "https://super.angeloni.com.br", ignorar: [] },
];
const ANTERIOR = "https://brenisio.github.io/lista-de-mercado/dados";
const AGORA = Date.parse("2025-10-31T12:30:00Z");

function produto(i) {
  return { id: String(i), nome: `Produto ${i}`, marca: "Marca", ean: "", gramas: 1000, granel: false, preco: 100 + i, promocao: 0, foto: "1", link: `produto-${i}`, categoria: 0 };
}

function rastreioFalso(mercado, { produtos = [produto(1), produto(2)], atualizadoEm = "2025-10-31T12:05:00.000Z", avisos = [] } = {}) {
  return {
    mercado: mercado.id,
    nome: mercado.nome,
    site: mercado.site,
    fotos: `https://${mercado.id}.vteximg.com.br/arquivos/ids/`,
    atualizadoEm,
    categorias: ["Mercearia > Arroz"],
    produtos,
    totalEsperado: produtos.length,
    baixados: produtos.length,
    avisos,
  };
}

// `comportamento` diz o que cada mercado faz: "ok" devolve um rastreio pronto,
// qualquer outra string vira ErroRastreio com essa mensagem.
function rastrearFalso(comportamento) {
  const chamados = [];
  const rastrearMercado = async (mercado) => {
    chamados.push(mercado.id);
    const c = comportamento[mercado.id] ?? "ok";
    if (c === "ok") return rastreioFalso(mercado);
    throw new ErroRastreio(`${mercado.nome}: ${c}`);
  };
  return { rastrearMercado, chamados };
}

// Fetch de mentira para o `--anterior`: só responde as URLs de `publicados`.
function fetchFalso(publicados) {
  const chamadas = [];
  const fazerFetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), opcoes });
    const corpo = publicados[String(url)];
    if (!corpo) return new Response("não achei", { status: 404 });
    return new Response(JSON.stringify(corpo), { status: 200 });
  };
  return { fazerFetch, chamadas };
}

function publicado(mercado, atualizadoEm) {
  const { totalEsperado, baixados, avisos, ...resto } = rastreioFalso(mercado, { atualizadoEm, produtos: [produto(7)] });
  return { versao: 1, ...resto };
}

async function comPasta(corpo) {
  const saida = await fs.mkdtemp(path.join(os.tmpdir(), "lista-de-mercado-"));
  try {
    await corpo(saida);
  } finally {
    await fs.rm(saida, { recursive: true, force: true });
  }
}

const lerJson = async (arquivo) => JSON.parse(await fs.readFile(arquivo, "utf8"));
const logs = () => {
  const linhas = [];
  return { linhas, log: (l) => linhas.push(l) };
};

test("grava um arquivo por mercado e o resumo com ?v=", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado } = rastrearFalso({});
    const { linhas, log } = logs();
    const resumo = await atualizar({ mercados: MERCADOS_TESTE, saida, rastrearMercado, fazerFetch: fetchFalso({}).fazerFetch, agora: () => AGORA, log });

    const bistek = await lerJson(path.join(saida, "bistek.json"));
    assert.equal(Object.keys(bistek)[0], "versao");
    assert.equal(bistek.versao, 1);
    assert.equal(bistek.mercado, "bistek");
    assert.equal(bistek.produtos.length, 2);
    assert.equal("totalEsperado" in bistek || "baixados" in bistek || "avisos" in bistek, false);

    const doDisco = await lerJson(path.join(saida, "resumo.json"));
    assert.deepEqual(doDisco, resumo);
    assert.equal(resumo.versao, 1);
    assert.equal(resumo.geradoEm, "2025-10-31T12:30:00.000Z");
    assert.deepEqual(Object.keys(resumo.mercados), ["bistek", "giassi", "angeloni"]);
    assert.deepEqual(resumo.mercados.bistek, { nome: "Bistek", atualizadoEm: "2025-10-31T12:05:00.000Z", produtos: 2, arquivo: "bistek.json?v=1761912300" });
    assert.ok(linhas.includes("Bistek: 2 produtos (ok)"));
    assert.ok(linhas.some((l) => /^tamanho gzip: \d+,\d MB$/.test(l)));
  });
});

test("mercado que falha cai no anterior e mantém o atualizadoEm antigo", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado } = rastrearFalso({ giassi: "HTTP 503 depois de 5 tentativas" });
    const antigo = publicado(MERCADOS_TESTE[1], "2025-10-30T21:00:00.000Z");
    const { fazerFetch } = fetchFalso({ [`${ANTERIOR}/giassi.json`]: antigo });
    const { linhas, log } = logs();
    const resumo = await atualizar({ mercados: MERCADOS_TESTE, saida, anterior: ANTERIOR, rastrearMercado, fazerFetch, agora: () => AGORA, log });

    assert.equal(resumo.mercados.giassi.atualizadoEm, "2025-10-30T21:00:00.000Z");
    assert.equal(resumo.mercados.giassi.produtos, 1);
    assert.equal("erro" in resumo.mercados.giassi, false);
    assert.deepEqual(await lerJson(path.join(saida, "giassi.json")), antigo);
    // A hora sai no fuso local da máquina, então o teste monta o esperado igual.
    const d = new Date("2025-10-30T21:00:00.000Z");
    const p = (n) => String(n).padStart(2, "0");
    const hora = `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}h${d.getMinutes() ? p(d.getMinutes()) : ""}`;
    assert.ok(linhas.includes(`Giassi: falhou (HTTP 503 depois de 5 tentativas), usando anterior de ${hora}`), linhas.join("\n"));
  });
});

test("mercado que falha sem anterior entra no resumo com erro", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado } = rastrearFalso({ giassi: "HTTP 503 depois de 5 tentativas" });
    const { linhas, log } = logs();
    const resumo = await atualizar({ mercados: MERCADOS_TESTE, saida, rastrearMercado, fazerFetch: fetchFalso({}).fazerFetch, agora: () => AGORA, log });

    assert.deepEqual(resumo.mercados.giassi, { nome: "Giassi", erro: "HTTP 503 depois de 5 tentativas" });
    await assert.rejects(fs.access(path.join(saida, "giassi.json")));
    assert.ok(linhas.includes("Giassi: sem dados (HTTP 503 depois de 5 tentativas)"), linhas.join("\n"));
  });
});

test("soAnterior não rastreia: só baixa os publicados", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado, chamados } = rastrearFalso({});
    const publicados = Object.fromEntries(MERCADOS_TESTE.map((m) => [`${ANTERIOR}/${m.id}.json`, publicado(m, "2025-10-30T21:00:00.000Z")]));
    const { fazerFetch, chamadas } = fetchFalso(publicados);
    const resumo = await atualizar({ mercados: MERCADOS_TESTE, saida, anterior: ANTERIOR, soAnterior: true, rastrearMercado, fazerFetch, agora: () => AGORA, log: () => {} });

    assert.deepEqual(chamados, []);
    assert.equal(chamadas.length, 3);
    // Anterior travado não pode segurar o job: todo pedido leva timeout.
    for (const c of chamadas) assert.ok(c.opcoes?.signal instanceof AbortSignal);
    for (const m of MERCADOS_TESTE) {
      assert.equal(resumo.mercados[m.id].produtos, 1);
      assert.deepEqual(await lerJson(path.join(saida, `${m.id}.json`)), publicados[`${ANTERIOR}/${m.id}.json`]);
    }
  });
});

test("lança quando nenhum mercado tem dados", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado } = rastrearFalso({ bistek: "HTTP 503 depois de 5 tentativas", giassi: "HTTP 500 depois de 5 tentativas", angeloni: "fetch failed depois de 5 tentativas" });
    await assert.rejects(
      atualizar({ mercados: MERCADOS_TESTE, saida, anterior: ANTERIOR, rastrearMercado, fazerFetch: fetchFalso({}).fazerFetch, agora: () => AGORA, log: () => {} }),
      /nenhum mercado/,
    );
    await assert.rejects(fs.access(path.join(saida, "resumo.json")));
  });
});

test("avisa quando os arquivos passam de 3 MB gzip", async () => {
  await comPasta(async (saida) => {
    // Nomes e preços pseudoaleatórios para o gzip não esmagar a repetição.
    let semente = 42;
    const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2147483648);
    const letras = "abcdefghijklmnopqrstuvwxyz";
    const palavra = () => Array.from({ length: 7 }, () => letras[aleatorio() % 26]).join("");
    const produtos = Array.from({ length: 200000 }, (_, i) => ({ ...produto(i), nome: `${palavra()} ${palavra()}`, ean: String(aleatorio()), preco: aleatorio() % 100000 }));
    const rastrearMercado = async (mercado) => rastreioFalso(mercado, { produtos });
    const { linhas, log } = logs();
    await atualizar({ mercados: MERCADOS_TESTE.slice(0, 1), saida, rastrearMercado, fazerFetch: fetchFalso({}).fazerFetch, agora: () => AGORA, log });

    assert.ok(linhas.some((l) => /^ACIMA DO ORÇAMENTO de 3 MB: \d+,\d MB$/.test(l)), linhas.join("\n"));
  });
});

test("falha do rastreio e do anterior aparecem juntas no log", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado } = rastrearFalso({ angeloni: "HTTP 503 depois de 5 tentativas" });
    const { linhas, log } = logs();
    const resumo = await atualizar({ mercados: MERCADOS_TESTE, saida, anterior: ANTERIOR, rastrearMercado, fazerFetch: fetchFalso({}).fazerFetch, agora: () => AGORA, log });

    assert.ok(linhas.includes("Angeloni: sem dados (HTTP 503 depois de 5 tentativas; anterior: HTTP 404)"), linhas.join("\n"));
    assert.equal(resumo.mercados.angeloni.erro, "HTTP 503 depois de 5 tentativas");
  });
});

test("anterior sem lista de produtos ou com data inválida é recusado", async () => {
  await comPasta(async (saida) => {
    const { rastrearMercado } = rastrearFalso({ giassi: "HTTP 503 depois de 5 tentativas", angeloni: "HTTP 503 depois de 5 tentativas" });
    const semProdutos = { ...publicado(MERCADOS_TESTE[1], "2025-10-30T21:00:00.000Z"), produtos: null };
    const dataRuim = publicado(MERCADOS_TESTE[2], "ontem");
    const { fazerFetch } = fetchFalso({ [`${ANTERIOR}/giassi.json`]: semProdutos, [`${ANTERIOR}/angeloni.json`]: dataRuim });
    const resumo = await atualizar({ mercados: MERCADOS_TESTE, saida, anterior: ANTERIOR, rastrearMercado, fazerFetch, agora: () => AGORA, log: () => {} });

    assert.ok(resumo.mercados.giassi.erro);
    assert.ok(resumo.mercados.angeloni.erro);
    await assert.rejects(fs.access(path.join(saida, "giassi.json")));
    await assert.rejects(fs.access(path.join(saida, "angeloni.json")));
  });
});

test("grava por arquivo temporário e renomeia, sem deixar .tmp para trás", async () => {
  await comPasta(async (saida) => {
    const operacoes = [];
    const fsEspiao = {
      ...fs,
      writeFile: async (alvo, ...resto) => { operacoes.push(["escreve", path.basename(alvo)]); return fs.writeFile(alvo, ...resto); },
      rename: async (de, para) => { operacoes.push(["renomeia", path.basename(de), path.basename(para)]); return fs.rename(de, para); },
    };
    const { rastrearMercado } = rastrearFalso({});
    await atualizar({ mercados: MERCADOS_TESTE.slice(0, 1), saida, rastrearMercado, fazerFetch: fetchFalso({}).fazerFetch, agora: () => AGORA, log: () => {}, fs: fsEspiao });

    assert.deepEqual(operacoes, [
      ["escreve", "bistek.json.tmp"], ["renomeia", "bistek.json.tmp", "bistek.json"],
      ["escreve", "resumo.json.tmp"], ["renomeia", "resumo.json.tmp", "resumo.json"],
    ]);
    assert.deepEqual((await fs.readdir(saida)).sort(), ["bistek.json", "resumo.json"]);
  });
});
