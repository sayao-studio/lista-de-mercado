// Encartes da semana dos mercados que o site não tem (Imperatriz, Magia,
// Fort, Atacadão…), pelo Tiendeo, no mesmo formato de catálogo que o robô
// grava pra cada mercado VTEX: assim a busca, o catálogo e a lista tratam
// um encarte como mais um mercado.
//
// Encarte com recortes (o Tiendeo já separou os produtos com preço) entra
// sem IA. Encarte sem recortes (só as páginas, como o do Imperatriz) tem as
// páginas baixadas do visualizador e lidas pela IA (leitura.mjs).
// Bistek, Giassi e Angeloni ficam de fora: o site já tem o preço deles, e o
// do encarte é o da loja física, que confundiria a comparação.
import { TIENDEO, PAGINAS_TIENDEO, PAGINAS_PUBLICACAO, listaEncartes, validosHoje, recortes, paginasDaPublicacao } from "./tiendeo.js";
import { pesoDoNome, semAcento } from "../produto.js";
import { hashDe } from "./leitura.mjs";

export const MERCADOS_DO_SITE = ["Bistek", "Giassi", "Angeloni"];
// Encarte de 40 páginas é catálogo de bazar, não oferta da semana; 24 cobre os de mercado.
export const MAX_PAGINAS = 24;
const CABECALHOS = { "user-agent": "Mozilla/5.0 (lista-de-mercado; robo de precos)" };

// "Fort Atacadista" → "fort-atacadista": id do mercado no site.
export const idDoMercado = (nome) => semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// O título do recorte vem "Marca - Produto"; a marca já vem à parte.
const semMarca = (titulo) => String(titulo ?? "").replace(/^[^-]*?\s+-\s+/, "").trim();

// Linha de catálogo de um recorte do Tiendeo. Sem preço não entra. O peso
// sai do nome; "… Kg" no fim é preço por quilo (granel de 1 kg).
export function linhaDoRecorte(rec, encarte) {
  if (!rec.preco) return null;
  const nome = semMarca(rec.titulo) || rec.titulo;
  if (!nome) return null;
  const peso = pesoDoNome(nome);
  const granel = /\bkg\s*$/i.test(semAcento(nome));
  return {
    id: `${encarte.id}-${rec.id}`, nome, marca: rec.marca || "", ean: "",
    gramas: granel ? 1000 : peso.gramas, granel, liquido: !granel && peso.liquido,
    preco: rec.preco, promocao: 0, foto: "",
    // A foto do recorte é do próprio Tiendeo (https); o site só aceita https.
    fotoUrl: /^https:\/\//.test(rec.imagem || "") ? rec.imagem : null,
    link: "", url: `${TIENDEO}/Catalogos/${encarte.id}`, categoria: 0,
    condicao: null, ate: encarte.fim, encarte: encarte.id,
  };
}

// Linha de catálogo de um item lido pela IA numa página. Preço por quilo
// vira granel de 1 kg; peso do nome ganha do lido; lido fora de 1 g a 50 kg
// não vale.
export function linhaDoItem(item, encarte, pagina, n) {
  const reais = Math.round(Number(item.preco) * 100);
  if (!item.produto || !(reais > 0)) return null;
  const porKg = item.unidade === "kg";
  const peso = pesoDoNome(item.produto);
  const lido = Number(item.gramas);
  const gramas = porKg ? 1000 : peso.gramas ?? (lido >= 1 && lido <= 50000 ? lido : null);
  return {
    id: `${encarte.id}-p${pagina}-${n}`, nome: item.produto, marca: "", ean: "",
    gramas, granel: porKg, liquido: !porKg && peso.liquido,
    preco: reais, promocao: 0, foto: "", fotoUrl: null,
    link: "", url: `${TIENDEO}/Catalogos/${encarte.id}`, categoria: 0,
    condicao: item.condicao || null, ate: encarte.fim, encarte: encarte.id,
  };
}

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Monta {versao, geradoEm, mercados: {id: catálogo}, avisos, ia}. A rede e
// a IA chegam por parâmetro pra os testes rodarem sem nenhuma das duas.
export async function montarEncartes({ fazerFetch = fetch, lerPaginas, hoje, agora = new Date(), semIa = false, maxPaginas = MAX_PAGINAS, esperar = pausa, log = () => {} }) {
  const avisos = [];
  const pedir = async (url) => {
    await esperar(150); // um pedido por vez, sem parecer ataque
    const r = await fazerFetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  };

  // A mesma rede aparece em várias páginas; local ganha de nacional.
  const encartes = new Map();
  for (const p of PAGINAS_TIENDEO) {
    try {
      for (const e of validosHoje(listaEncartes(await (await pedir(`${TIENDEO}/florianopolis/${p}`)).text()), hoje)) {
        if (!MERCADOS_DO_SITE.includes(e.mercado) && !encartes.has(e.id)) encartes.set(e.id, e);
      }
    } catch (e) { avisos.push(`Tiendeo ${p}: ${e.message}`); }
  }
  log(`${encartes.size} encartes válidos hoje fora de Bistek, Giassi e Angeloni`);

  const porMercado = new Map();
  const ia = { custo: 0, lotes: 0, paginas: 0 };
  for (const e of encartes.values()) {
    const info = { id: e.id, titulo: e.titulo, inicio: e.inicio, fim: e.fim, link: `${TIENDEO}/Catalogos/${e.id}`, fonte: null, produtos: 0 };
    let linhas = [];
    try {
      const recs = recortes(await (await pedir(info.link)).text()).filter((r) => r.encarte === e.id);
      linhas = recs.map((r) => linhaDoRecorte(r, e)).filter(Boolean);
      if (linhas.length) info.fonte = "recortes";
    } catch (err) { avisos.push(`encarte ${e.mercado} "${e.titulo}": ${err.message}`); continue; }

    if (!linhas.length && e.publicacao && !semIa && lerPaginas) {
      try {
        const paginas = paginasDaPublicacao(await (await pedir(PAGINAS_PUBLICACAO(e.publicacao))).json()).slice(0, maxPaginas);
        const imagens = [];
        for (const p of paginas) {
          try {
            const conteudo = Buffer.from(await (await pedir(p.url)).arrayBuffer());
            imagens.push({ pagina: p.pagina, conteudo, hash: hashDe(conteudo) });
          } catch (err) { avisos.push(`${e.mercado} página ${p.pagina}: ${err.message}`); }
        }
        log(`${e.mercado} "${e.titulo}": ${imagens.length} páginas sem recortes`);
        const lidas = await lerPaginas(imagens, { hoje, log });
        avisos.push(...lidas.erros.map((m) => `${e.mercado}: ${m}`));
        for (const l of lidas.lotes) { ia.custo += l.custo || 0; ia.lotes += 1; ia.paginas += l.paginas; }
        for (const img of imagens) {
          const p = lidas.paginas[img.hash];
          if (!p) continue;
          p.itens.forEach((item, n) => { const l = linhaDoItem(item, e, img.pagina, n); if (l) linhas.push(l); });
        }
        if (linhas.length) info.fonte = "ia";
      } catch (err) { avisos.push(`páginas do encarte ${e.mercado} "${e.titulo}": ${err.message}`); }
    } else if (!linhas.length) {
      avisos.push(`${e.mercado} "${e.titulo}": sem recortes${semIa ? " (lido só com IA; rodou com --sem-ia)" : ""}`);
    }
    if (!linhas.length) continue;

    info.produtos = linhas.length;
    const id = idDoMercado(e.mercado);
    if (!porMercado.has(id)) {
      porMercado.set(id, {
        versao: 1, mercado: id, nome: e.mercado, site: TIENDEO, fotos: "", atualizadoEm: agora.toISOString(),
        // Uma categoria só: o site classifica pelo nome do produto.
        encartes: [], categorias: ["Encarte"], produtos: [],
      });
    }
    const cat = porMercado.get(id);
    cat.encartes.push(info);
    cat.produtos.push(...linhas);
  }

  ia.custo = Math.round(ia.custo * 10000) / 10000;
  return { versao: 1, geradoEm: agora.toISOString(), mercados: Object.fromEntries(porMercado), avisos, ia };
}
