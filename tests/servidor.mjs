// Servidor estático mínimo pros testes de navegador: serve o site e troca a
// pasta de dados por fixtures, pra os testes não dependerem do robô nem da rede.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// "Ontem 18h" no fuso local: é o que o teste do cabeçalho espera ler como "ontem 18h".
function ontemAs18() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

// Impede "../" de escapar da pasta servida.
function dentroDe(base, relativo) {
  const raiz = resolve(base);
  const alvo = resolve(raiz, "." + sep + normalize(relativo));
  return alvo === raiz || alvo.startsWith(raiz + sep) ? alvo : null;
}

export function servir({ pasta = "public", dados = "tests/fixtures/dados", resumo = dados + "/resumo.json" } = {}) {
  const servidor = createServer(async (req, res) => {
    // A query (?v=1) só serve pra furar cache; o arquivo é o mesmo.
    const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let arquivo;
    if (caminho === "/dados/resumo.json") {
      arquivo = resumo ? resolve(resumo) : null;
    } else if (caminho.startsWith("/dados/")) {
      arquivo = dentroDe(dados, caminho.slice("/dados/".length));
    } else {
      arquivo = dentroDe(pasta, caminho.endsWith("/") ? caminho + "index.html" : caminho);
    }
    if (!arquivo) return responder(res, 404, "text/plain", "não encontrado");

    let conteudo;
    try {
      conteudo = await readFile(arquivo);
    } catch {
      return responder(res, 404, "text/plain", "não encontrado");
    }
    const ext = extname(arquivo);
    if (ext === ".json") {
      conteudo = conteudo.toString("utf8")
        .replaceAll("{{HOJE}}", new Date().toISOString())
        .replaceAll("{{ONTEM}}", ontemAs18());
    }
    responder(res, 200, TIPOS[ext] ?? "application/octet-stream", conteudo);
  });

  return new Promise((ok, falha) => {
    servidor.once("error", falha);
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      ok({
        url: `http://127.0.0.1:${port}/`,
        fechar: () => new Promise((fim) => {
          servidor.closeAllConnections?.();
          servidor.close(() => fim());
        }),
      });
    });
  });
}

function responder(res, status, tipo, corpo) {
  res.writeHead(status, { "Content-Type": tipo, "Cache-Control": "no-store" });
  res.end(corpo);
}

// Rodado direto (node tests/servidor.mjs), sobe e fica no ar pra conferir o site à mão.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await servir();
  console.log(`Site com dados de teste em ${url}`);
}
