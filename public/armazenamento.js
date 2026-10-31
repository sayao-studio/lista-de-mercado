// A lista vive só no aparelho (localStorage). Nada aqui pode perder a lista
// em silêncio: o que não dá pra ler vai pro backup antes de começar do zero.

export const CHAVE = "lista-de-mercado";
export const CHAVE_BACKUP = "lista-de-mercado.backup";

const TIPOS = ["produto", "texto"];
const vazio = () => ({ versao: 1, itens: [] });

// Safari em modo privado e quota cheia lançam em getItem/setItem; tratamos
// como um storage vazio pra lista continuar funcionando na sessão.
function ler(storage, chave) {
  try { return storage.getItem(chave); } catch { return null; }
}
function gravar(storage, chave, valor) {
  try { storage.setItem(chave, valor); return true; } catch { return false; }
}

function quantidadeValida(q) {
  const n = Math.trunc(Number(q));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const objetoSimples = (o) => o !== null && typeof o === "object" && !Array.isArray(o);

// Conserta o que dá num item já aceito e diz se precisou mexer: o que foi
// mexido manda o original pro backup, como um item descartado. As telas leem
// `ofertas` e `preco` sem checar, então nada torto pode passar daqui.
function consertar(i) {
  const item = { ...i, quantidade: quantidadeValida(i.quantidade), marcado: Boolean(i.marcado) };
  let mexeu = false;
  if (item.tipo === "texto") {
    // Texto colado antes do catálogo carregar guarda a chave pra virar produto depois.
    if ("chave" in item && typeof item.chave !== "string") { delete item.chave; mexeu = true; }
    return { item, mexeu };
  }
  const ofertas = {};
  if (objetoSimples(i.ofertas)) {
    for (const [mercado, oferta] of Object.entries(i.ofertas)) {
      if (objetoSimples(oferta) && typeof oferta.preco === "number" && Number.isFinite(oferta.preco)) ofertas[mercado] = oferta;
      else mexeu = true;
    }
  } else {
    mexeu = true;
  }
  item.ofertas = ofertas;
  // Sem o campo é só item antigo; com valor torto é dado estragado.
  if (item.gramas === undefined) item.gramas = null;
  else if (item.gramas !== null && !(typeof item.gramas === "number" && Number.isFinite(item.gramas))) {
    item.gramas = null;
    mexeu = true;
  }
  if ("liquido" in item && typeof item.liquido !== "boolean") { item.liquido = Boolean(item.liquido); mexeu = true; }
  return { item, mexeu };
}

// Pura, pra testar a validação sem storage. null = nada aproveitável.
export function migrar(bruto) {
  let dados;
  try { dados = JSON.parse(bruto); } catch { return null; }
  if (!objetoSimples(dados)) return null;
  if (dados.versao !== 1 || !Array.isArray(dados.itens)) return null;

  const itens = [];
  let mexeu = false;
  for (const i of dados.itens) {
    // Um item quebrado não pode levar a lista inteira junto. Produto sem
    // chave não tem como ser reencontrado no catálogo: sai.
    if (!i || typeof i !== "object" || typeof i.id !== "string"
      || typeof i.nome !== "string" || !TIPOS.includes(i.tipo)
      || (i.tipo === "produto" && typeof i.chave !== "string")) continue;
    const r = consertar(i);
    if (r.mexeu) mexeu = true;
    itens.push(r.item);
  }
  return { estado: { ...dados, versao: 1, itens }, descartou: mexeu || itens.length !== dados.itens.length };
}

export function carregar(storage) {
  const bruto = ler(storage, CHAVE);
  if (!bruto) return vazio();
  const r = migrar(bruto);
  // A chave original fica intacta: só é sobrescrita no próximo salvar.
  if (!r || r.descartou) gravar(storage, CHAVE_BACKUP, bruto);
  return r ? r.estado : vazio();
}

export function salvar(estado, storage) {
  return gravar(storage, CHAVE, JSON.stringify(estado));
}
