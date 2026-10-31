// Provisório: a Task 11 troca pela busca de verdade.
import { el, escapar } from "./dom.js";

export function renderizarBusca(estado) {
  const resultados = el("#resultados");
  if (!estado.carregando && !estado.indice) {
    resultados.innerHTML = '<p class="carregando">Ainda sem preços pra buscar.</p>';
    return;
  }
  if (estado.indice) {
    resultados.innerHTML = '<p class="carregando">Busca em construção.</p>';
    return;
  }
  const chegaram = estado.mercados.filter((m) => m.carregado).map((m) => `${escapar(m.nome)} ✓`);
  resultados.innerHTML = `<p class="carregando">Carregando os preços…${chegaram.length ? " " + chegaram.join(" ") : ""}</p>`;
}

export function ligarBusca() {}
