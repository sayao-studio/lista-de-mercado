// Anda na árvore de categorias de uma loja VTEX e baixa o catálogo inteiro.
// A rede entra injetada (`fazerFetch`, `esperar`, `agora`) para os testes
// rodarem sem internet e sem relógio de verdade.
//
// Página ou total que falha mesmo depois das retentativas vira aviso, não
// derruba a loja: a busca da VTEX devolve 500 em páginas soltas ("Failing
// getting sku document group from index") enquanto o resto responde — em
// 01/11/2026 o Bistek dava 500 em _from=0 e 206 de _from=50 a 1000, e uma
// página dessas fez perder o Bistek e o Angeloni inteiros. Quem decide se a
// loja ainda presta é a regra dos 30% no fim do `rastrear`. Só a árvore, o
// prazo, os 30% e o zero produto derrubam a loja.

import { linhasDoProduto, hostFoto } from "./produto.js";

// Cabeçalho HTTP só aceita ASCII: com "robô" a borda da VTEX devolve 400.
const CABECALHOS = { "user-agent": "Mozilla/5.0 (lista-de-mercado; robo de precos)" };
const POR_PAGINA = 50; // a API recusa _to - _from maior que 49
const TETO_FROM = 2500; // _from acima disso dá HTTP 400
// Falha solta é a VTEX tropeçando; três seguidas no mesmo nó é o nó quebrado,
// e insistir até o teto (50 páginas × 5 tentativas) come o prazo de 20 min.
const FALHAS_SEGUIDAS = 3;

export class ErroRastreio extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroRastreio";
  }
}

// O filtro só funciona com o caminho completo desde a raiz: "C:/10/" sozinho
// devolve zero produtos mesmo que a folha 10 tenha milhares.
export const caminhoFq = (caminho) => `C:/${caminho.join("/")}/`;

// A API não é oficial e tropeça muito: já vimos ~40% das páginas fora do
// cache voltarem 500 por um tempo. Cinco tentativas com espera dobrando
// (1, 2, 4, 8 s) atravessam esses surtos sem martelar a loja. 4xx não se
// repete: o pedido está errado e a resposta vai ser a mesma.
export async function buscarComRetentativa(url, { fazerFetch, esperar, tentativas = 5, timeoutMs = 20000 }) {
  let ultimo = "";
  for (let n = 0; n < tentativas; n++) {
    let r;
    try {
      r = await fazerFetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      // Rede caiu ou estourou o timeout: conta como tentativa.
      ultimo = e.name === "TimeoutError" || e.name === "AbortError" ? `tempo esgotado (${timeoutMs / 1000} s)` : e.message;
    }
    if (r?.ok) return r; // a resposta normal é 206, que também é ok
    if (r) {
      await r.body?.cancel(); // libera a conexão
      if (r.status >= 400 && r.status < 500) throw new Error(`HTTP ${r.status}`);
      ultimo = `HTTP ${r.status}`;
    }
    if (n < tentativas - 1) await esperar(1000 * 2 ** n);
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

// Sem `aoFalhar`, a primeira página que falha lança o erro. Com ele, a página
// é pulada (`aoFalhar(de, erro)`) e a paginação segue, até FALHAS_SEGUIDAS
// seguidas: aí o nó é largado (`aoAbandonar()`). O prazo estourado
// (ErroRastreio) sempre lança, porque aí não adianta seguir. Com `total`
// conhecido para em `de >= total`: a página vazia seria um pedido a mais, e
// com páginas falhando ela talvez nem chegasse.
export async function* paginas(mercado, caminho, { ordem, total, aoFalhar, aoAbandonar, ...opcoes }) {
  let falhasSeguidas = 0;
  for (let de = 0; de <= TETO_FROM && !(total > 0 && de >= total); de += POR_PAGINA) {
    let url = urlBusca(mercado, caminho, de, de + POR_PAGINA - 1);
    if (ordem) url += `&O=OrderByPrice${ordem}`;
    let pagina;
    try {
      pagina = await (await pedir(url, opcoes)).json();
    } catch (e) {
      if (!aoFalhar || e instanceof ErroRastreio) throw e;
      aoFalhar(de, e);
      if (++falhasSeguidas >= FALHAS_SEGUIDAS) return aoAbandonar?.();
      continue;
    }
    falhasSeguidas = 0;
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
  const avisar = (texto) => {
    avisos.push(texto);
    log(`${mercado.nome}: ${texto}`);
  };

  // Uma busca só alcança 2500 produtos (_from máximo), então categoria maior
  // que isso é quebrada nos filhos. Folha grande demais é baixada em ordem
  // crescente e decrescente de preço: pega as duas pontas, mas o meio pode faltar.
  async function planejar(no, caminho, nomes, planos) {
    let total;
    try {
      total = await totalDe(mercado, caminho, opcoes);
    } catch (e) {
      if (e instanceof ErroRastreio) throw e;
      // Sem o total, a categoria é paginada direto como se faltasse o cabeçalho.
      avisar(`${nomes.join(" > ")}: total falhou (${e.message})`);
      total = null;
    }
    if (total === 0) return;
    if (total === null || total <= TETO_FROM) {
      planos.push({ caminho, nomes, total: total ?? 0, ordens: [undefined] });
    } else if (no.children?.length) {
      for (const filho of no.children) await planejar(filho, [...caminho, filho.id], [...nomes, filho.name], planos);
    } else {
      avisar(`${no.name}: mais de 2500 produtos, pode ter ficado buraco`);
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
          const qual = ordem ? ` (${ordem})` : "";
          const aoFalhar = (de, e) => avisar(`${categorias[indice]}: página _from=${de}${qual} falhou (${e.message})`);
          const aoAbandonar = () => avisar(`${categorias[indice]}${qual}: abandonada depois de ${FALHAS_SEGUIDAS} páginas seguidas falhando`);
          const total = plano.total || undefined; // 0 = sem cabeçalho: pagina até a vazia
          for await (const pagina of paginas(mercado, plano.caminho, { ...opcoes, ordem, total, aoFalhar, aoAbandonar })) {
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
  // Com todo total falhando não há esperado e a regra acima não pega; mesmo
  // assim, zero produto é loja quebrada, não loja vazia.
  if (baixados === 0) throw new ErroRastreio(`${mercado.nome}: nenhum produto baixado`);

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
