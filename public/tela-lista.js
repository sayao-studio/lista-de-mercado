// Provisório: a Task 12 troca pela lista de verdade.
import { el, escapar } from "./dom.js";

export function renderizarLista(estado) {
  const itens = el("#itens");
  if (!estado.itens.length) {
    itens.innerHTML = '<li class="vazio">Sua lista está vazia. Busque um produto pra começar.</li>';
    return;
  }
  itens.innerHTML = estado.itens.map((i) => `<li>${escapar(i.nome)}</li>`).join("");
}

export function ligarLista() {}
