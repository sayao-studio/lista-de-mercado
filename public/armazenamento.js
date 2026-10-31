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

// Pura, pra testar a validação sem storage. null = nada aproveitável.
export function migrar(bruto) {
  let dados;
  try { dados = JSON.parse(bruto); } catch { return null; }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  if (dados.versao !== 1 || !Array.isArray(dados.itens)) return null;

  const itens = [];
  for (const i of dados.itens) {
    // Um item quebrado não pode levar a lista inteira junto.
    if (!i || typeof i !== "object" || typeof i.id !== "string"
      || typeof i.nome !== "string" || !TIPOS.includes(i.tipo)) continue;
    itens.push({ ...i, quantidade: quantidadeValida(i.quantidade), marcado: Boolean(i.marcado) });
  }
  return { estado: { ...dados, versao: 1, itens }, descartou: itens.length !== dados.itens.length };
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
