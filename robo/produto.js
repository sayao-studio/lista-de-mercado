// Lê um produto da busca VTEX (JSON da loja) e devolve as linhas enxutas do
// catálogo: uma por SKU à venda. Módulo puro, sem rede.

// Copiado de ../esfirraria/functions/_lib/mercados.js (semAcento e pesoGramas).
export const semAcento = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Peso da embalagem em gramas pelo nome ("Farinha 5kg", "Kit 2x 400g",
// "Óleo 900ml", "Açúcar 1.000g", "Leite 1L x 12"), ou null quando não dá.
const UNIDADE = "(kg|quilos?|g|gr|grs|gramas?|l|lt|litros?|ml)";
export function pesoGramas(nome) {
  const n = semAcento(nome)
    .replace(/(\d)\.(\d{3})(?=\s*(?:g|gr|grs|gramas?|ml)\b)/g, "$1$2") // 1.000g: ponto de milhar
    .replace(/(\d),(\d)/g, "$1.$2");
  const antes = n.match(new RegExp(`(\\d+)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIDADE}\\b`));
  const um = [...n.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIDADE}\\b`, "g"))].pop();
  const m = antes ? { valor: antes[2], unidade: antes[3], vezes: Number(antes[1]) } : um ? { valor: um[1], unidade: um[2], vezes: 1, fim: um.index + um[0].length } : null;
  if (!m) return /\bkg$/.test(n.trim()) ? 1000 : null;
  if (!antes) {
    // Quantidade depois do peso: "x 12", "c/ 3", "com 3 unidades".
    const depois = n.slice(m.fim).match(/^\s*(?:x\s*(\d+)\b|(?:c\/|com)\s*(\d+)\s*(?:un|unid|unidades|envelopes?|saches?|sachets?)?\b)/);
    if (depois) m.vezes = Number(depois[1] || depois[2]);
  }
  const valor = Number(m.valor) * m.vezes;
  return /^(kg|quilos?|l|lt|litros?)$/.test(m.unidade) ? valor * 1000 : valor;
}

// Prefixo 2 é peso variável (o preço muda por balança) e 3000 é código interno
// do Bistek: passam na conta do dígito, mas não identificam o mesmo produto
// entre lojas, então não servem de chave.
export function eanValido(ean) {
  if (typeof ean !== "string" || !/^\d+$/.test(ean)) return false;
  if (![8, 12, 13, 14].includes(ean.length)) return false;
  if (ean.startsWith("2") || ean.startsWith("3000")) return false;
  const corpo = ean.slice(0, -1);
  let soma = 0;
  // Pesos 3,1,3,1... a partir do dígito mais à direita do corpo.
  for (let i = 0; i < corpo.length; i++) {
    soma += Number(corpo[corpo.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (soma % 10)) % 10 === Number(ean.at(-1));
}

// A foto é guardada só pelo id numérico; o host é comum a todo o catálogo da
// loja e vai uma vez só no cabeçalho do arquivo, o que encolhe o JSON.
export function hostFoto(produto) {
  for (const item of produto.items || []) {
    const url = item.images?.[0]?.imageUrl;
    if (url) return new URL(url).origin + "/arquivos/ids/";
  }
  return null;
}

const centavos = (reais) => Math.round(reais * 100);

// Uma linha por SKU com estoque e preço. Produto a granel (unidade "kg") tem
// `Price` por quilo e sai em passos de `unitMultiplier` kg. Diferente da
// esfirraria, SKU sem peso no nome fica (gramas nulo): ainda serve para
// comparar por EAN ou por nome.
export function linhasDoProduto(produto) {
  const linhas = [];
  for (const item of produto.items || []) {
    const o = item.sellers?.[0]?.commertialOffer;
    if (!o || !(o.AvailableQuantity > 0) || !(o.Price > 0)) continue;
    const nome = item.nameComplete || produto.productName;
    const granel = item.measurementUnit === "kg";
    const passo = granel ? item.unitMultiplier : 1;
    // O preço "de" só conta quando é maior que o de hoje; senão não há promoção.
    const preco = centavos(o.Price * passo);
    const de = centavos((o.ListPrice || 0) * passo);
    const imagem = item.images?.[0]?.imageUrl?.match(/arquivos\/ids\/(\d+)/);
    linhas.push({
      id: String(item.itemId),
      nome,
      marca: produto.brand || "",
      ean: eanValido(item.ean) ? item.ean : "", // código interno não identifica o produto entre lojas
      gramas: granel ? Math.round(item.unitMultiplier * 1000) : pesoGramas(nome),
      granel,
      preco,
      promocao: de > preco ? de : 0,
      foto: imagem ? imagem[1] : "",
      link: produto.linkText || "",
    });
  }
  return linhas;
}
