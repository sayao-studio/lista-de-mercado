// Anda na árvore de categorias de uma loja VTEX e baixa o catálogo inteiro.
// A rede entra injetada (`fazerFetch`, `esperar`, `agora`) para os testes
// rodarem sem internet e sem relógio de verdade.

import { linhasDoProduto, hostFoto } from "./produto.js";

// Cabeçalho HTTP só aceita ASCII: com "robô" a borda da VTEX devolve 400.
const CABECALHOS = { "user-agent": "Mozilla/5.0 (lista-de-mercado; robo de precos)" };
const POR_PAGINA = 50; // a API recusa _to - _from maior que 49
const TETO_FROM = 2500; // _from acima disso dá HTTP 400

export class ErroRastreio extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroRastreio";
  }
}

// O filtro só funciona com o caminho completo desde a raiz: "C:/10/" sozinho
// devolve zero produtos mesmo que a folha 10 tenha milhares.
export const caminhoFq = (caminho) => `C:/${caminho.join("/")}/`;

// A API não é oficial e às vezes tropeça; três tentativas com espera crescente
// seguram a instabilidade passageira sem martelar a loja.
export async function buscarComRetentativa(url, { fazerFetch, esperar, tentativas = 3, timeoutMs = 20000 }) {
  let ultimo = "";
  for (let n = 0; n < tentativas; n++) {
    try {
      const r = await fazerFetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return r; // a resposta normal é 206, que também é ok
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      ultimo = e.message; // rede caiu ou estourou o timeout: conta como tentativa
    }
    if (n < tentativas - 1) await esperar(500 * 2 ** n);
  }
  throw new Error(`${ultimo} depois de ${tentativas} tentativas`);
}

// `antesDoPedido` deixa o `rastrear` pausar e vigiar o prazo em todo pedido,
// inclusive os feitos aqui dentro.
async function pedir(url, opcoes) {
  await opcoes.antesDoPedido?.();
  return buscarComRetentativa(url, opcoes);
}

const urlBusca = (mercado, caminho, de, ate) =>
  `${mercado.site}/api/catalog_system/pub/products/search?fq=${caminhoFq(caminho)}&_from=${de}&_to=${ate}`;

export async function arvore(mercado, opcoes) {
  const r = await pedir(`${mercado.site}/api/catalog_system/pub/category/tree/3`, opcoes);
  return r.json();
}

// O total vem no cabeçalho `resources` ("0-0/2629"); pedir um item só é o
// jeito mais barato de lê-lo. Sem cabeçalho não dá para saber: null.
export async function totalDe(mercado, caminho, opcoes) {
  const r = await pedir(urlBusca(mercado, caminho, 0, 0), opcoes);
  await r.body?.cancel();
  const m = r.headers.get("resources")?.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export async function* paginas(mercado, caminho, { ordem, ...opcoes }) {
  for (let de = 0; de <= TETO_FROM; de += POR_PAGINA) {
    let url = urlBusca(mercado, caminho, de, de + POR_PAGINA - 1);
    if (ordem) url += `&O=OrderByPrice${ordem}`;
    const pagina = await (await pedir(url, opcoes)).json();
    if (!Array.isArray(pagina) || pagina.length === 0) return;
    yield pagina;
  }
}

export async function rastrear(mercado, { fazerFetch, esperar, agora = Date.now, limite = Infinity, prazoMs = 20 * 60 * 1000, log = () => {} }) {
  const inicio = agora();
  let primeiro = true;
  const antesDoPedido = async () => {
    if (agora() - inicio > prazoMs) throw new ErroRastreio(`${mercado.nome}: prazo de ${Math.round(prazoMs / 60000)} min estourado`);
    // Um pedido por vez com pausa curta: não queremos parecer ataque à loja.
    if (!primeiro) await esperar(100);
    primeiro = false;
  };
  const opcoes = { fazerFetch, esperar, antesDoPedido };

  const categorias = [];
  const produtos = [];
  const vistos = new Set();
  const avisos = [];
  let totalEsperado = 0;
  let baixados = 0;
  let fotos = null;

  // Uma busca só alcança 2500 produtos (_from máximo), então categoria maior
  // que isso é quebrada nos filhos. Folha grande demais é baixada em ordem
  // crescente e decrescente de preço: pega as duas pontas, mas o meio pode faltar.
  async function planejar(no, caminho, nomes, planos) {
    const total = await totalDe(mercado, caminho, opcoes);
    if (total === 0) return;
    if (total === null || total <= TETO_FROM) {
      planos.push({ caminho, nomes, total: total ?? 0, ordens: [undefined] });
    } else if (no.children?.length) {
      for (const filho of no.children) await planejar(filho, [...caminho, filho.id], [...nomes, filho.name], planos);
    } else {
      avisos.push(`${no.name}: mais de 2500 produtos, pode ter ficado buraco`);
      planos.push({ caminho, nomes, total, ordens: ["ASC", "DESC"] });
    }
  }

  try {
    const departamentos = (await arvore(mercado, opcoes)).filter((d) => !(mercado.ignorar || []).includes(d.name)).slice(0, limite);
    for (const departamento of departamentos) {
      const planos = [];
      await planejar(departamento, [departamento.id], [departamento.name], planos);
      for (const plano of planos) {
        const indice = categorias.push(plano.nomes.join(" > ")) - 1;
        totalEsperado += plano.total; // conta uma vez mesmo baixando ASC e DESC
        for (const ordem of plano.ordens) {
          for await (const pagina of paginas(mercado, plano.caminho, { ...opcoes, ordem })) {
            baixados += pagina.length;
            for (const produtoVtex of pagina) {
              fotos ??= hostFoto(produtoVtex);
              for (const linha of linhasDoProduto(produtoVtex)) {
                // O mesmo SKU aparece em mais de uma categoria; fica a primeira.
                if (vistos.has(linha.id)) continue;
                vistos.add(linha.id);
                produtos.push({ ...linha, categoria: indice });
              }
            }
          }
        }
        log(`${mercado.nome}: ${categorias[indice]} (${baixados} baixados até agora)`);
      }
    }
  } catch (e) {
    if (e instanceof ErroRastreio) throw e;
    throw new ErroRastreio(`${mercado.nome}: ${e.message}`);
  }

  // Muito abaixo do esperado é sinal de API bloqueada ou mudada: melhor falhar
  // e manter o último catálogo bom do que publicar um catálogo pela metade.
  if (totalEsperado > 0 && baixados < 0.3 * totalEsperado) {
    throw new ErroRastreio(`${mercado.nome}: baixou ${baixados} de ${totalEsperado} produtos esperados`);
  }

  return {
    mercado: mercado.id,
    nome: mercado.nome,
    site: mercado.site,
    fotos,
    atualizadoEm: new Date(inicio).toISOString(),
    categorias,
    produtos,
    totalEsperado,
    baixados,
    avisos,
  };
}
