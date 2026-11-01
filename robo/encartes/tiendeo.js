// Copiado de ../esfirraria/ops/compras/encartes.js (31/10/2026), sem a parte
// que casa com ingrediente da esfiharia.
//
// Encartes de supermercado de Florianópolis pelo Tiendeo. A página de cada
// rede traz, no JSON do Next (`__NEXT_DATA__`), os encartes de várias redes da
// cidade com começo e fim; a página do encarte traz os produtos já recortados
// (`flyerGibs`), quase sempre com nome, marca e preço, mas sem o peso, que só
// está na imagem do recorte. Não é API oficial: pode mudar sem aviso.

export const TIENDEO = "https://www.tiendeo.com.br";
// Páginas que, juntas, cobrem os encartes de supermercado da cidade.
export const PAGINAS_TIENDEO = [
  "carrefour", "angeloni", "atacadao", "bistek-supermercados", "supermercados-imperatriz",
  "fort-atacadista", "komprao-atacadista", "supermercados-magia", "macro-atacado-treichel", "assai-atacadista",
];
// Categoria "Supermercados" do Tiendeo (fora ficam operadora, farmácia etc.).
const SUPERMERCADOS = "5";

// Nome da rede no Tiendeo pro nome que a lista usa, pra o encarte e o site da
// mesma loja contarem como um mercado só ("Bistek Supermercados" é o Bistek).
const APELIDOS = {
  "Bistek Supermercados": "Bistek", "Supermercados Imperatriz": "Imperatriz", "Supermercados Magia": "Magia",
  "Komprão Atacadista": "Komprão", "Assaí Atacadista": "Assaí",
};
export const nomeDoMercado = (nome) => (nome ? APELIDOS[nome] || String(nome).trim() : null);

export function dadosNext(html) {
  const m = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

// Todo objeto do JSON que passa no teste, em qualquer profundidade.
function coletar(x, teste, saida = []) {
  if (Array.isArray(x)) for (const v of x) coletar(v, teste, saida);
  else if (x && typeof x === "object") {
    if (teste(x)) saida.push(x);
    for (const v of Object.values(x)) coletar(v, teste, saida);
  }
  return saida;
}

// Encartes citados na página de uma rede, sem repetir. O Tiendeo manda os
// encartes de loja perto com `distance` e os nacionais (da rede no Brasil
// todo, como a "LÂMINA RIO DE JANEIRO" do Carrefour) sem ela: esses viram
// `nacional` e só entram quando pedidos. `distance: -1` (o Macro Atacado
// Treichel em 31/10/2026) também conta como nacional: o Tiendeo não soube
// medir a distância, e tratar como loja daqui poria no roteiro um preço que
// pode ser de outra cidade; a leitura mais segura é deixar de fora até ser
// pedido com --nacionais.
// "http://viewer.zmags.com/publication/pt_br_877179" -> "877179".
export const publicacaoDe = (url) => String(url ?? "").match(/publication\/pt_br_(\d+)\b/)?.[1] || null;

// Visualizador público do encarte: a lista de páginas, cada uma em vários
// tamanhos. Achado em 31/10/2026 abrindo o encarte do Imperatriz no Tiendeo,
// que não tem recortes, só as páginas.
export const PAGINAS_PUBLICACAO = (pub) => `https://api-viewer-zmags.shopfully.cloud/publication_pages/pt_br/${pub}/1`;

// Endereço da maior imagem de cada página, até `maxAltura` pixels (~1500 dá
// pra ler preço e peso; acima disso só pesa). [{pagina, url}], na ordem.
export function paginasDaPublicacao(json, maxAltura = 1600) {
  if (!json || typeof json !== "object") return [];
  return Object.values(json).filter((p) => p && typeof p === "object" && Array.isArray(p.pageRepresentationDescriptors))
    .map((p) => {
      const imgs = p.pageRepresentationDescriptors.filter((d) => d?.type === "image" && d.pageRepresentation?.resourcePath && Number(d.height) <= maxAltura);
      const maior = imgs.sort((a, b) => Number(b.height) - Number(a.height))[0];
      return maior ? { pagina: Number(p.pageNumber), url: "https://" + String(maior.pageRepresentation.resourcePath).replace(/^https?:\/\//, "") } : null;
    })
    .filter((p) => p && Number.isInteger(p.pagina) && /^https:\/\/[\w.-]+\.shopfully\.cloud\//.test(p.url))
    .sort((a, b) => a.pagina - b.pagina);
}

export function listaEncartes(html) {
  const d = dadosNext(html);
  if (!d) return [];
  const vistos = new Map();
  for (const f of coletar(d, (x) => x.type === "flyer" && x.start_date && x.end_date && x.title)) {
    const id = String(f.id);
    const antes = vistos.get(id);
    vistos.set(id, {
      id,
      mercado: nomeDoMercado(f.retailerName) || "Rede " + f.retailer_id,
      titulo: String(f.title).trim(),
      // O começo da validade é o `start_date` (o `publish_at` é quando o
      // encarte foi publicado, às vezes meses antes); o fim vem no horário de
      // Brasília quando o Tiendeo manda, que acerta o dia de quem acaba às 23h59.
      inicio: f.start_date.slice(0, 10),
      fim: (f.settings?.time_zone?.unpublish_at_iso || f.end_date).slice(0, 10),
      categoria: String(f.category_id),
      nacional: (antes ? antes.nacional : true) && !("distance" in f && Number(f.distance) >= 0),
      // Número da publicação no visualizador (zmags/ShopFully), de onde vêm
      // as páginas inteiras do encarte: o caminho pra encarte sem recortes.
      publicacao: publicacaoDe(f.publication_url) || antes?.publicacao || null,
    });
  }
  return [...vistos.values()];
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Meses que o título cita: o nome inteiro ("Ofertas de Outubro") ou a
// abreviação em formato de data ("05 a 11 JAN 26", "10/set", "jan/26",
// "3 de mar"), pra "Frutos do Mar 2026" e "Top 10 dez ofertas" não virarem mês.
export function mesesNoTitulo(titulo) {
  // "Rio de Janeiro" é cidade, não mês.
  const t = String(titulo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/rio de janeiro/g, "");
  return MESES.map((nome, i) => {
    const ab = nome.slice(0, 3);
    const achou = new RegExp(`\\b${nome}\\b`).test(t)
      || new RegExp(`\\d{1,2}\\s*(?:a|e|ate|-)\\s*\\d{1,2}\\s*(?:de\\s*)?${ab}\\b`).test(t)
      || new RegExp(`\\b\\d{1,2}\\s*(?:[/.-]|de)\\s*${ab}\\b`).test(t)
      || new RegExp(`\\b${ab}\\s*[/.-]\\s*\\d{2,4}\\b`).test(t);
    return achou ? i + 1 : 0;
  }).filter(Boolean);
}

// Anos que o título cita ("2025", ou "26" logo depois de um mês).
export function anosNoTitulo(titulo) {
  const t = String(titulo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const anos = [...t.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const curto = MESES.map((n) => n.slice(0, 3)).join("|");
  for (const m of t.matchAll(new RegExp(`\\b(?:${curto})[a-z]*\\s*[/.-]?\\s*(\\d{2})\\b`, "g"))) anos.push(2000 + Number(m[1]));
  return [...new Set(anos)];
}

// O título cita um mês que não está no período do encarte? ("Food Service
// 05 a 11 JAN 26" marcado como válido de maio a novembro.) Aí não dá pra
// confiar no preço: o encarte pode ser velho republicado. Encarte de novembro
// ou dezembro pode se chamar "Verão 2027" ou "Réveillon 2027": o ano seguinte
// ao do fim também vale nesses meses.
export function tituloForaDoPeriodo(e) {
  const deAno = Number(e.inicio.slice(0, 4)), ateAno = Number(e.fim.slice(0, 4));
  const ateMes = Number(e.fim.slice(5, 7));
  const tetoAno = ateMes >= 11 ? ateAno + 1 : ateAno;
  const anosCitados = anosNoTitulo(e.titulo);
  if (anosCitados.length && !anosCitados.some((a) => a >= deAno && a <= tetoAno)) return true;
  const citados = mesesNoTitulo(e.titulo);
  if (!citados.length) return false;
  const de = Number(e.inicio.slice(5, 7)), ate = Number(e.fim.slice(5, 7));
  const anos = Number(e.fim.slice(0, 4)) - Number(e.inicio.slice(0, 4));
  const noPeriodo = (m) => anos > 1 || (anos === 1 ? m >= de || m <= ate : m >= de && m <= ate);
  return !citados.some(noPeriodo);
}

// Encartes de supermercado que valem em `hoje` (AAAA-MM-DD, horário de
// Brasília), sem os nacionais (a não ser com `nacionais`) e sem os de título
// com outro mês.
export const validosHoje = (encartes, hoje, { nacionais = false } = {}) =>
  encartes.filter((e) => e.categoria === SUPERMERCADOS && e.inicio && e.fim && e.inicio <= hoje && hoje <= e.fim
    && (nacionais || !e.nacional) && !tituloForaDoPeriodo(e));

const centavos = (txt) => {
  const n = Number(String(txt || "").replace(",", "."));
  return n > 0 ? Math.round(n * 100) : null;
};

// Produtos recortados de um encarte.
export function recortes(html) {
  const d = dadosNext(html);
  if (!d) return [];
  const vistos = new Map();
  for (const lista of coletar(d, (x) => Array.isArray(x.flyerGibs))) {
    for (const g of lista.flyerGibs) {
      const s = g.settings || {};
      vistos.set(g.id, {
        id: g.id,
        encarte: String(g.flyer_id),
        mercado: g.retailerName || null,
        titulo: String(g.title || "").trim(),
        marca: s.brand || null,
        preco: centavos(s.price_extended?.digits),
        pagina: Number(s.flyer_page) || null,
        imagem: g.image || null,
      });
    }
  }
  return [...vistos.values()];
}
