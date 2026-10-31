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
