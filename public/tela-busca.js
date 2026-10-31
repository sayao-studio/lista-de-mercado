// Tela Buscar: campo, chips e cartões. Não mexe na lista nem salva nada:
// quem é dono de `estado.itens` é o app.js, que recebe os pedidos por `acoes`.
import { buscar } from "./busca.js";
import { reais, peso } from "./formato.js";
import { el, escapar, debounce, trocarFotoQuebrada } from "./dom.js";

const LOTE = 30;

// Estado só da interface: não vai pro aparelho, porque a busca de ontem não
// interessa a quem abre o site hoje.
const ui = {
  termo: "",
  promocao: false,
  ordem: "relevancia",
  mercados: new Set(),
  mostrar: LOTE,
};

// O último resultado desenhado: o clique no cartão acha o grupo por aqui sem
// buscar de novo.
let gruposNaTela = new Map();

function quantidadeNaLista(estado, chave) {
  const item = estado.itens.find((i) => i.tipo === "produto" && i.chave === chave);
  return item ? item.quantidade : 0;
}

function nomesDosMercados(estado) {
  return Object.fromEntries(estado.mercados.map((m) => [m.id, m.nome]));
}

// Só mercados que vieram no índice: chip de mercado sem catálogo filtraria pra
// lista vazia sem explicar por quê.
function mercadosCarregados(estado) {
  if (!estado.indice) return [];
  const carregados = new Set(estado.indice.mercados);
  return estado.mercados.filter((m) => carregados.has(m.id));
}

function chip(atributos, texto, ligado) {
  return `<button type="button" class="chip" ${atributos} aria-pressed="${ligado}">${escapar(texto)}</button>`;
}

function renderizarChips(estado) {
  const mercados = mercadosCarregados(estado);
  if (!mercados.length) {
    el("#chips").innerHTML = "";
    return;
  }
  el("#chips").innerHTML = [
    chip('data-filtro="promocao"', "Só promoções", ui.promocao),
    chip('data-ordem="preco"', "Menor preço", ui.ordem === "preco"),
    chip('data-ordem="porKg"', "Menor preço/kg", ui.ordem === "porKg"),
    ...mercados.map((m) => chip(`data-mercado="${escapar(m.id)}"`, m.nome, ui.mercados.has(m.id))),
  ].join("");
}

function marcaPeso(grupo) {
  return [grupo.marca, peso(grupo.gramas)].filter(Boolean).map(escapar).join(" · ");
}

function precos(grupo, nomes) {
  // Verde quer dizer "mais barato que os outros": com uma loja só não há
  // comparação, e o destaque passaria uma vantagem que não existe.
  const compara = Object.keys(grupo.ofertas).length > 1;
  return Object.entries(grupo.ofertas)
    .map(([mercado, oferta]) => {
      const melhor = compara && oferta.preco === grupo.menor ? " melhor" : "";
      // Promoção vale só se o "de" for maior; a loja às vezes repete o preço.
      const de = oferta.promocao > oferta.preco ? `<s>${reais(oferta.promocao)}</s> ` : "";
      return `<span class="preco${melhor}" data-mercado="${escapar(mercado)}">`
        + `<span class="mercado">${escapar(nomes[mercado] ?? mercado)}</span> ${de}<b>${reais(oferta.preco)}</b></span>`;
    })
    .join("");
}

function cartao(grupo, estado, nomes) {
  const qtd = quantidadeNaLista(estado, grupo.chave);
  const foto = grupo.foto
    ? `<img class="foto" src="${escapar(grupo.foto)}" alt="" loading="lazy" decoding="async" width="56" height="56">`
    : '<span class="foto sem-foto" aria-hidden="true"></span>';
  const rotulo = qtd ? `Somar mais um: ${grupo.nome} (${qtd} na lista)` : `Adicionar ${grupo.nome} à lista`;
  return `<article class="cartao" data-chave="${escapar(grupo.chave)}">
    ${foto}
    <div class="texto">
      <p class="nome">${escapar(grupo.nome)}</p>
      ${grupo.marca || grupo.gramas ? `<p class="marca-peso">${marcaPeso(grupo)}</p>` : ""}
      <div class="precos">${precos(grupo, nomes)}</div>
    </div>
    <button type="button" class="adicionar${qtd ? " na-lista" : ""}" aria-label="${escapar(rotulo)}">${qtd ? `×${qtd}` : "+"}</button>
  </article>`;
}

function botaoTexto(termo) {
  return `<button type="button" id="adicionar-texto">Adicionar "${escapar(termo)}" sem preço</button>`;
}

function conteudoResultados(estado) {
  const termo = ui.termo.trim();
  if (!estado.indice) {
    // Sem catálogo a lista ainda serve de lembrete: o texto livre continua possível.
    const rodape = termo ? `<div class="rodape-busca">${botaoTexto(termo)}</div>` : "";
    if (!estado.carregando) return `<p class="carregando">Ainda sem preços pra buscar.</p>${rodape}`;
    const chegaram = estado.mercados.filter((m) => m.carregado).map((m) => `${escapar(m.nome)} ✓`);
    return `<p class="carregando">Carregando os preços…${chegaram.length ? " " + chegaram.join(" ") : ""}</p>${rodape}`;
  }
  if (!termo) return '<p class="vazio">Digite o nome de um produto. Ex.: arroz, café, sabão.</p>';

  const achados = buscar(estado.indice, termo, {
    promocao: ui.promocao,
    ordem: ui.ordem,
    mercados: ui.mercados.size ? [...ui.mercados] : null,
  });
  if (!achados.length) {
    return `<p class="vazio">Nada com “${escapar(termo)}”. Pode adicionar sem preço.</p>
      <div class="rodape-busca">${botaoTexto(termo)}</div>`;
  }
  const nomes = nomesDosMercados(estado);
  const visiveis = achados.slice(0, ui.mostrar);
  for (const g of visiveis) gruposNaTela.set(g.chave, g);
  const mais = achados.length > visiveis.length
    ? `<button type="button" id="mostrar-mais">Mostrar mais (${achados.length - visiveis.length})</button>`
    : "";
  return `${visiveis.map((g) => cartao(g, estado, nomes)).join("")}
    <div class="rodape-busca">${mais}${botaoTexto(termo)}</div>`;
}

// Seletor que reencontra o elemento focado depois do redesenho: teclado e
// leitor de tela não podem ser jogados pro topo a cada toque.
function seletorDoFoco() {
  const ativo = document.activeElement;
  const cartaoFocado = ativo?.closest?.("#resultados .cartao");
  if (cartaoFocado) return `#resultados .cartao[data-chave="${CSS.escape(cartaoFocado.dataset.chave)}"] .adicionar`;
  const chipFocado = ativo?.closest?.("#chips .chip");
  if (chipFocado) {
    for (const nome of ["filtro", "ordem", "mercado"]) {
      const valor = chipFocado.dataset[nome];
      if (valor) return `#chips .chip[data-${nome}="${CSS.escape(valor)}"]`;
    }
  }
  return null;
}

// Idempotente: o app chama de novo sempre que a lista ou o catálogo muda. O
// campo de busca fica de fora pra não perder o foco nem o cursor.
// `focarCartao`: índice do cartão que deve receber o foco (o primeiro do lote
// novo, depois de "Mostrar mais", que some ao ser redesenhado).
export function renderizarBusca(estado, { focarCartao = null } = {}) {
  const resultados = el("#resultados");
  const foco = seletorDoFoco();
  gruposNaTela = new Map();
  renderizarChips(estado);
  resultados.innerHTML = conteudoResultados(estado);
  // Marca o termo que este desenho reflete: com o debounce, quem espera (os
  // testes, por exemplo) sabe quando o resultado já é do que foi digitado.
  resultados.dataset.termo = ui.termo;
  if (focarCartao != null) {
    const alvo = resultados.querySelectorAll(".cartao")[focarCartao] ?? resultados.querySelector("#adicionar-texto");
    alvo?.querySelector?.(".adicionar")?.focus() ?? alvo?.focus();
  } else if (foco) {
    document.querySelector(foco)?.focus();
  }
}

export function ligarBusca(estado, acoes) {
  const campo = el("#busca");
  const aoDigitar = debounce(() => {
    ui.termo = campo.value;
    ui.mostrar = LOTE;
    renderizarBusca(estado);
  }, 120);
  campo.addEventListener("input", aoDigitar);

  el("#chips").addEventListener("click", (e) => {
    const botao = e.target.closest(".chip");
    if (!botao) return;
    const { filtro, ordem, mercado } = botao.dataset;
    if (filtro === "promocao") ui.promocao = !ui.promocao;
    // Tocar de novo na ordem ativa volta pra relevância, o padrão.
    if (ordem) ui.ordem = ui.ordem === ordem ? "relevancia" : ordem;
    if (mercado) {
      if (ui.mercados.has(mercado)) ui.mercados.delete(mercado);
      else ui.mercados.add(mercado);
    }
    // O chip vale pra o que está digitado agora, mesmo antes do debounce.
    ui.termo = campo.value;
    ui.mostrar = LOTE;
    renderizarBusca(estado);
  });

  trocarFotoQuebrada(el("#resultados"));

  el("#resultados").addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    if (e.target.closest("#mostrar-mais")) {
      const antes = ui.mostrar;
      ui.mostrar += LOTE;
      renderizarBusca(estado, { focarCartao: antes });
      return;
    }
    if (e.target.closest("#adicionar-texto")) {
      const nome = ui.termo.trim();
      if (nome) acoes.adicionarTexto(nome);
      return;
    }
    // O cartão inteiro é alvo de toque: no corredor, acertar só o "+" é difícil.
    const cartaoAlvo = e.target.closest(".cartao");
    if (!cartaoAlvo) return;
    const grupo = gruposNaTela.get(cartaoAlvo.dataset.chave);
    if (!grupo) return;
    if (quantidadeNaLista(estado, grupo.chave)) acoes.incrementar(grupo.chave);
    else acoes.adicionarProduto(grupo);
  });
}
