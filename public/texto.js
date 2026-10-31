// Normalização de texto compartilhada por busca e catálogo. Módulo sem
// imports: roda no navegador e no Node.

// NFD separa a letra do acento; tirando os acentos, "Feijão" e "feijao" viram
// a mesma coisa, que é como a pessoa digita no celular.
export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
