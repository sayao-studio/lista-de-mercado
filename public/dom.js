// Ajudantes de DOM pequenos o bastante pra não precisar de framework.

const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Nome de produto vem do site do mercado: nunca entra no innerHTML cru.
export function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

export function el(seletor, raiz = document) {
  return raiz.querySelector(seletor);
}

export function debounce(fn, ms) {
  let espera;
  return (...args) => {
    clearTimeout(espera);
    espera = setTimeout(() => fn(...args), ms);
  };
}

// Foto que não carrega (link velho da loja, sem internet) vira o quadro neutro,
// não o ícone de imagem quebrada. `error` não borbulha: escuta na captura.
export function trocarFotoQuebrada(raiz) {
  raiz.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("foto")) return;
    const quadro = document.createElement("span");
    quadro.className = "foto sem-foto";
    quadro.setAttribute("aria-hidden", "true");
    img.replaceWith(quadro);
  }, true);
}
