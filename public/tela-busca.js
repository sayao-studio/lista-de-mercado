// Tela Buscar: campo, chips, catálogo (com o campo vazio) e cartões. Não
// mexe na lista nem salva nada: quem é dono de `estado.itens` é o app.js,
// que recebe os pedidos por `acoes`.
import { buscar, catalogar } from "./busca.js";
import { reais, peso } from "./formato.js";
import { el, escapar, debounce, trocarFotoQuebrada } from "./dom.js";
// A mesma regra dos totais: chip de mercado sem catálogo filtraria pra lista
// vazia sem explicar por quê. tela-lista não importa nada daqui (sem ciclo).
import { mercadosCarregados } from "./tela-lista.js";

const LOTE = 30;
const numero = new Intl.NumberFormat("pt-BR");

// Nível do catálogo: raiz (departamentos), departamento (seções) ou produtos
// (uma seção, ou o departamento inteiro quando `tudo`).
const RAIZ = { departamento: null, secao: null, tudo: false };

// Estado só da interface: não vai pro aparelho, porque a busca de ontem não
// interessa a quem abre o site hoje.
const ui = {
  termo: "",
  promocao: false,
  ordem: "relevancia",
  mercados: new Set(),
  mostrar: LOTE,
  // Onde a pessoa está no catálogo; vale enquanto o campo está vazio e
  // sobrevive a digitar e apagar, pra ela voltar pra prateleira onde estava.
  catalogo: { ...RAIZ },
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
    // Um chip só pros dois: R$/kg e R$/l são o mesmo número (por mil gramas ou ml).
    chip('data-ordem="porKg"', "Menor por kg/l", ui.ordem === "porKg"),
    ...mercados.map((m) => chip(`data-mercado="${escapar(m.id)}"`, m.nome, ui.mercados.has(m.id))),
  ].join("");
}

// Os chips valem igual na busca e no catálogo.
function filtros() {
  return { promocao: ui.promocao, ordem: ui.ordem, mercados: ui.mercados.size ? [...ui.mercados] : null };
}

function marcaPeso(grupo) {
  return [grupo.marca, peso(grupo.gramas, grupo.liquido)].filter(Boolean).map(escapar).join(" · ");
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

// Cartões de um lote com o "Mostrar mais (N)" no fim; serve à busca e ao catálogo.
function lote(achados, estado) {
  const nomes = nomesDosMercados(estado);
  const visiveis = achados.slice(0, ui.mostrar);
  for (const g of visiveis) gruposNaTela.set(g.chave, g);
  const mais = achados.length > visiveis.length
    ? `<button type="button" id="mostrar-mais">Mostrar mais (${achados.length - visiveis.length})</button>`
    : "";
  return { cartoes: visiveis.map((g) => cartao(g, estado, nomes)).join(""), mais };
}

// ---- Catálogo ----

// "538 produtos" ou, com o chip ligado, "47 em promoção": a contagem diz o
// que a pessoa vai ver ao tocar.
function quantos(n) {
  const texto = numero.format(n);
  if (ui.promocao) return n === 1 ? "1 em promoção" : `${texto} em promoção`;
  return n === 1 ? "1 produto" : `${texto} produtos`;
}

function cabecalhoDoNivel(rotuloVoltar, titulo) {
  return `<div class="cabecalho-nivel">
    <button type="button" class="voltar" aria-label="${escapar(rotuloVoltar)}">‹</button>
    <h2 class="titulo-nivel" tabindex="-1">${titulo}</h2>
  </div>`;
}

function raizDoCatalogo(estado) {
  const { promocao, mercados } = filtros();
  const linhas = estado.indice.catalogo
    .map((d) => ({ ...d, quantos: catalogar(estado.indice, { departamento: d.id, promocao, mercados }).length }))
    .filter((d) => d.quantos > 0)
    .map((d) => `<li><button type="button" class="departamento" data-departamento="${escapar(d.id)}">
        <span class="emoji" aria-hidden="true">${d.emoji}</span>
        <span class="nome">${escapar(d.nome)}</span>
        <span class="quantos">${quantos(d.quantos)}</span>
      </button></li>`);
  if (!linhas.length) {
    return `<p class="vazio">${ui.promocao ? "Nenhuma promoção hoje" : "Nada"} nesses mercados.</p>`;
  }
  return `<nav class="catalogo" aria-label="Catálogo">
    <h2 class="titulo-catalogo">Catálogo</h2>
    <ul class="departamentos">${linhas.join("")}</ul>
  </nav>`;
}

function departamentoDoCatalogo(estado, dep) {
  const { promocao, mercados } = filtros();
  const total = catalogar(estado.indice, { departamento: dep.id, promocao, mercados }).length;
  const secoes = dep.secoes
    .map((s) => ({ nome: s.nome, quantos: catalogar(estado.indice, { departamento: dep.id, secao: s.nome, promocao, mercados }).length }))
    .filter((s) => s.quantos > 0);
  const linha = (atributos, classe, texto, n) =>
    `<li><button type="button" class="secao${classe}" ${atributos}><span class="nome">${texto}</span><span class="quantos">${quantos(n)}</span></button></li>`;
  const linhas = secoes.map((s) => linha(`data-secao="${escapar(s.nome)}"`, "", escapar(s.nome), s.quantos));
  // "Tudo de X" só quando há mais de uma seção; com uma só seria repetir.
  if (secoes.length > 1) linhas.unshift(linha('data-tudo="1"', " tudo", `Tudo de ${escapar(dep.nome)}`, total));
  const cabecalho = cabecalhoDoNivel("Voltar pro catálogo", `<span class="emoji" aria-hidden="true">${dep.emoji}</span> ${escapar(dep.nome)}`);
  const corpo = linhas.length
    ? `<ul class="secoes">${linhas.join("")}</ul>`
    : `<p class="vazio">Nada em ${escapar(dep.nome)} nesses mercados.</p>`;
  return `<div class="catalogo">${cabecalho}${corpo}</div>`;
}

function produtosDoCatalogo(estado, dep) {
  const secao = ui.catalogo.tudo ? null : ui.catalogo.secao;
  const achados = catalogar(estado.indice, { departamento: dep.id, secao, ...filtros() });
  const titulo = secao == null
    ? `Tudo de ${escapar(dep.nome)}`
    : `${escapar(secao)} <small>${escapar(dep.nome)}</small>`;
  const cabecalho = cabecalhoDoNivel(`Voltar pra ${dep.nome}`, titulo);
  if (!achados.length) return `<div class="catalogo">${cabecalho}<p class="vazio">Nada aqui nesses mercados.</p></div>`;
  const { cartoes, mais } = lote(achados, estado);
  return `<div class="catalogo">${cabecalho}${cartoes}${mais ? `<div class="rodape-busca">${mais}</div>` : ""}</div>`;
}

function conteudoDoCatalogo(estado) {
  const { departamento, secao, tudo } = ui.catalogo;
  if (!departamento) return raizDoCatalogo(estado);
  const dep = estado.indice.catalogo.find((d) => d.id === departamento);
  // O catálogo mudou embaixo da pessoa (mercado que saiu): volta pra raiz.
  if (!dep) {
    ui.catalogo = { ...RAIZ };
    return raizDoCatalogo(estado);
  }
  if (secao == null && !tudo) return departamentoDoCatalogo(estado, dep);
  return produtosDoCatalogo(estado, dep);
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
  // Campo vazio é o catálogo: a pessoa vai vendo o que tem, corredor por
  // corredor, e lembra o que esqueceu de digitar.
  if (!termo) return conteudoDoCatalogo(estado);

  const achados = buscar(estado.indice, termo, filtros());
  if (!achados.length) {
    return `<p class="vazio">Nada com “${escapar(termo)}”. Pode adicionar sem preço.</p>
      <div class="rodape-busca">${botaoTexto(termo)}</div>`;
  }
  const { cartoes, mais } = lote(achados, estado);
  return `${cartoes}<div class="rodape-busca">${mais}${botaoTexto(termo)}</div>`;
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
  if (ativo?.closest?.("#resultados .catalogo")) {
    if (ativo.matches(".voltar")) return "#resultados .voltar";
    if (ativo.matches(".titulo-nivel")) return "#resultados .titulo-nivel";
    if (ativo.dataset.departamento) return `#resultados .departamento[data-departamento="${CSS.escape(ativo.dataset.departamento)}"]`;
    if (ativo.dataset.tudo) return "#resultados .secao[data-tudo]";
    if (ativo.dataset.secao) return `#resultados .secao[data-secao="${CSS.escape(ativo.dataset.secao)}"]`;
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

// ---- Navegação no catálogo ----

function focar(seletor) {
  const alvo = seletor ? document.querySelector(seletor) : null;
  alvo?.focus();
  return Boolean(alvo);
}

function focarTitulo() {
  el("#resultados").querySelector(".titulo-nivel")?.focus({ preventScroll: true });
}

// O botão que abre um nível, no nível de cima: é pra onde o foco volta ao subir.
function seletorDoNivel(nivel) {
  if (nivel.tudo) return "#resultados .secao[data-tudo]";
  if (nivel.secao != null) return `#resultados .secao[data-secao="${CSS.escape(nivel.secao)}"]`;
  if (nivel.departamento) return `#resultados .departamento[data-departamento="${CSS.escape(nivel.departamento)}"]`;
  return null;
}

function nivelAcima(nivel) {
  if (nivel.secao != null || nivel.tudo) return { departamento: nivel.departamento, secao: null, tudo: false };
  return { ...RAIZ };
}

// Descer empurra uma entrada no histórico: o botão voltar do celular sobe
// um nível em vez de sair do site. A URL não muda.
function descer(estado, nivel) {
  ui.catalogo = nivel;
  ui.mostrar = LOTE;
  history.pushState({ catalogo: nivel }, "");
  renderizarBusca(estado);
  // O nível novo começa do topo; o foco no título conta pro leitor de tela onde está.
  window.scrollTo({ top: 0 });
  focarTitulo();
}

function subir(estado) {
  // Se foi o site que empurrou o histórico, volta por ele, pra o botão da
  // tela e o do navegador contarem a mesma história (o popstate redesenha).
  if (history.state?.catalogo) {
    history.back();
    return;
  }
  const de = ui.catalogo;
  ui.catalogo = nivelAcima(de);
  ui.mostrar = LOTE;
  renderizarBusca(estado);
  focar(seletorDoNivel(de));
}

export function ligarBusca(estado, acoes) {
  const campo = el("#busca");
  const aoDigitar = debounce(() => {
    ui.termo = campo.value;
    ui.mostrar = LOTE;
    renderizarBusca(estado);
  }, 120);
  campo.addEventListener("input", aoDigitar);

  // Recarregar a aba no meio do catálogo começa da raiz: o estado velho do
  // histórico não vale mais.
  history.replaceState(null, "");
  window.addEventListener("popstate", (e) => {
    const de = ui.catalogo;
    ui.catalogo = e.state?.catalogo ?? { ...RAIZ };
    ui.mostrar = LOTE;
    renderizarBusca(estado);
    // Subindo, o foco volta pro botão que abriu o nível de onde veio;
    // descendo (o "avançar" do navegador), vai pro título.
    if (!focar(seletorDoNivel(de))) focarTitulo();
  });

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
    const departamento = e.target.closest(".departamento");
    if (departamento) {
      descer(estado, { departamento: departamento.dataset.departamento, secao: null, tudo: false });
      return;
    }
    const secao = e.target.closest(".secao");
    if (secao) {
      const tudo = Boolean(secao.dataset.tudo);
      descer(estado, { departamento: ui.catalogo.departamento, secao: tudo ? null : secao.dataset.secao, tudo });
      return;
    }
    if (e.target.closest(".voltar")) {
      subir(estado);
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
