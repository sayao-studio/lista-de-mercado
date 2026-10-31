// Busca os preços publicados pelo robô. URLs relativas porque o site vive
// num subcaminho do GitHub Pages; fetch, storage e caches chegam por
// parâmetro pra o módulo rodar também nos testes em Node.

export const CHAVE_RESUMO = "lista-de-mercado.resumo";
const NOME_CACHE = "catalogos";

const resumoValido = (r) =>
  r && typeof r === "object" && r.versao === 1 && r.mercados && typeof r.mercados === "object" && !Array.isArray(r.mercados);

export async function carregarResumo({ fazerFetch, storage }) {
  try {
    // no-store: o resumo é o que diz se há catálogo novo; nunca pode vir velho.
    const r = await fazerFetch("dados/resumo.json", { cache: "no-store" });
    if (r.ok) {
      const texto = await r.text();
      const resumo = JSON.parse(texto);
      if (resumoValido(resumo)) {
        try { storage.setItem(CHAVE_RESUMO, texto); } catch { /* sem espaço: segue sem cópia */ }
        return { resumo, semInternet: false };
      }
    }
  } catch { /* sem rede ou JSON quebrado: tenta a cópia guardada */ }

  try {
    const resumo = JSON.parse(storage.getItem(CHAVE_RESUMO));
    if (resumoValido(resumo)) return { resumo, semInternet: true };
  } catch { /* nada guardado que preste */ }
  // Também é o caso "site ainda sem preços" (404 e nunca carregou antes).
  throw new Error("sem resumo");
}

function conferir(id, arquivo) {
  if (!arquivo || arquivo.versao !== 1) throw new Error(`${id}: formato desconhecido`);
  return arquivo;
}

async function abrirCache(caches) {
  if (!caches) return null;
  try { return await caches.open(NOME_CACHE); } catch { return null; }
}

async function apagar(cache, url) {
  try { await cache.delete(url); } catch { /* nada a fazer: na pior hipótese tenta de novo depois */ }
}

export async function carregarMercado(id, entrada, { fazerFetch, caches }) {
  if (!entrada || entrada.erro || !entrada.arquivo) return null;
  // O ?v= muda a cada publicação, então achar a url no cache já garante que é a versão atual.
  const url = "dados/" + entrada.arquivo;
  const cache = await abrirCache(caches);

  if (cache) {
    try {
      const guardado = await cache.match(url);
      if (guardado) return conferir(id, await guardado.json());
    } catch {
      // Cache ilegível: tira o lixo pra não tropeçar nele a cada abertura e busca na rede.
      await apagar(cache, url);
    }
  }

  const r = await fazerFetch(url);
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);

  let guardando = null;
  if (cache) {
    // Clona antes de ler o corpo: depois de lido, a resposta não pode ser copiada.
    // O catch já na criação evita rejeição não tratada se o corpo falhar antes (quota).
    try {
      guardando = Promise.resolve(cache.put(url, r.clone())).then(() => true, () => false);
    } catch { guardando = null; }
  }
  let arquivo;
  try {
    arquivo = conferir(id, await r.json());
  } catch (erro) {
    if (guardando) {
      await guardando;
      await apagar(cache, url);
    }
    throw erro;
  }

  if (guardando && await guardando) {
    try {
      // Cada catálogo tem vários MB; versões velhas só gastariam a quota.
      const prefixo = "dados/" + id + ".json?";
      for (const req of await cache.keys()) {
        if (req.url.includes(prefixo) && !req.url.endsWith(url)) await cache.delete(req);
      }
    } catch { /* quota ou modo privado: o catálogo já está em mãos */ }
  }
  return arquivo;
}
