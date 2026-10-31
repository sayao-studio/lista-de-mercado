// Junta os rastreios dos mercados e grava o que o site lê: um JSON por mercado
// e o resumo.json. Rede, relógio e disco entram injetados para os testes.

import fsPromises from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { MERCADOS } from "./mercados.js";
import { rastrear } from "./vtex.js";

const ORCAMENTO = 3 * 1024 * 1024; // o que dá pra baixar no 4G sem a pessoa desistir

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

// "30/10 18h" é como a tela fala; usa o fuso da máquina porque quem lê
// o log é gente, e no Actions basta definir TZ para ver a hora de SC.
function quando(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}h${d.getMinutes() ? p(d.getMinutes()) : ""}`;
}

// O ErroRastreio já vem com "Giassi: " na frente; no log e no resumo o nome
// já aparece, então tiramos pra não repetir.
const semNome = (mensagem, nome) => (mensagem.startsWith(`${nome}: `) ? mensagem.slice(nome.length + 2) : mensagem);

// O publicado antes só serve se for mesmo do mercado e no formato que o site
// entende; senão é melhor ficar sem dados do que publicar lixo.
async function baixarAnterior(anterior, mercado, fazerFetch) {
  const r = await fazerFetch(`${anterior}/${mercado.id}.json`);
  if (!r.ok) throw new Error(`anterior deu HTTP ${r.status}`);
  const arquivo = await r.json();
  if (arquivo?.versao !== 1 || arquivo?.mercado !== mercado.id) throw new Error("anterior em formato inesperado");
  return arquivo;
}

export async function atualizar({
  mercados = MERCADOS,
  saida,
  anterior = null,
  soAnterior = false,
  limite,
  rastrearMercado = rastrear,
  fazerFetch = fetch,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
  agora = Date.now,
  log = console.error,
  fs = fsPromises,
}) {
  await fs.mkdir(saida, { recursive: true });
  const gravados = []; // texto de cada arquivo de mercado, para medir o gzip

  async function gravar(id, arquivo) {
    const texto = JSON.stringify(arquivo) + "\n"; // sem indentação: tamanho importa
    await fs.writeFile(path.join(saida, `${id}.json`), texto);
    gravados.push(texto);
  }

  // Cada mercado no seu próprio try: um que cai não derruba os outros.
  async function umMercado(mercado) {
    let falha = null;
    if (!soAnterior) {
      try {
        const { totalEsperado, baixados, avisos, ...resto } = await rastrearMercado(mercado, {
          fazerFetch, esperar, agora, log, ...(limite !== undefined && { limite }),
        });
        for (const aviso of avisos ?? []) log(`${mercado.nome}: ${aviso}`);
        const arquivo = { versao: 1, ...resto };
        await gravar(mercado.id, arquivo);
        log(`${mercado.nome}: ${arquivo.produtos.length} produtos (ok)`);
        return arquivo;
      } catch (e) {
        falha = semNome(e.message, mercado.nome);
      }
    }
    if (anterior) {
      try {
        const arquivo = await baixarAnterior(anterior, mercado, fazerFetch);
        await gravar(mercado.id, arquivo);
        log(falha
          ? `${mercado.nome}: falhou (${falha}), usando anterior de ${quando(arquivo.atualizadoEm)}`
          : `${mercado.nome}: ${arquivo.produtos.length} produtos (anterior de ${quando(arquivo.atualizadoEm)})`);
        return arquivo;
      } catch (e) {
        falha ??= e.message;
      }
    }
    falha ??= "sem --anterior";
    log(`${mercado.nome}: sem dados (${falha})`);
    return { erro: falha };
  }

  const resultados = await Promise.allSettled(mercados.map(umMercado));

  const resumo = { versao: 1, geradoEm: new Date(agora()).toISOString(), mercados: {} };
  resultados.forEach((resultado, i) => {
    const { id, nome } = mercados[i];
    // `umMercado` não deveria rejeitar, mas um disco cheio, por exemplo, cai aqui.
    const arquivo = resultado.status === "fulfilled" ? resultado.value : { erro: resultado.reason?.message ?? String(resultado.reason) };
    resumo.mercados[id] = arquivo.erro !== undefined
      ? { nome, erro: arquivo.erro }
      : {
          nome,
          atualizadoEm: arquivo.atualizadoEm,
          produtos: arquivo.produtos.length,
          // O ?v= muda a cada atualização e fura o cache de 10 min do Pages.
          arquivo: `${id}.json?v=${Math.floor(Date.parse(arquivo.atualizadoEm) / 1000)}`,
        };
  });

  if (Object.values(resumo.mercados).every((m) => m.erro !== undefined)) throw new Error("nenhum mercado com dados");

  const total = gravados.reduce((soma, texto) => soma + zlib.gzipSync(texto).length, 0);
  log(`tamanho gzip: ${mb(total)}`);
  if (total > ORCAMENTO) log(`ACIMA DO ORÇAMENTO de 3 MB: ${mb(total)}`);

  await fs.writeFile(path.join(saida, "resumo.json"), JSON.stringify(resumo) + "\n");
  return resumo;
}
