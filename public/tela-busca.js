// Tela Buscar: campo, chips, catálogo (com o campo vazio) e cartões. Não
// mexe na lista nem salva nada: quem é dono de `estado.itens` é o app.js,
// que recebe os pedidos por `acoes`.
import { buscar, catalogar, filtrar, normalizar } from "./busca.js";
import { PREPAROS } from "./preparo.js";
import { reais, peso, diaMes } from "./formato.js";
import { el, escapar, debounce, trocarFotoQuebrada } from "./dom.js";
// A mesma regra dos totais: chip de mercado sem catálogo filtraria pra lista
// vazia sem explicar por quê. tela-lista não importa nada daqui (sem ciclo).
import { mercadosCarregados } from "./tela-lista.js";

const LOTE = 30;
const numero = new Intl.NumberFormat("pt-BR");
// Carimbo desta carga da página nas entradas do histórico: depois de
// recarregar no meio do catálogo, as entradas velhas não valem (senão o
// voltar "desceria" pra um nível de antes).
const CARGA = Date.now();

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
  // Preparo de carne escolhido (bife, moida…); só vale enquanto a lista tem carne.
  preparo: null,
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
    // Mercado escolhido vai pro começo da fila: lá no fim, fora da tela, o
    // filtro ligado sumia de vista e a lista encolhia sem explicação.
    ...[...mercados].sort((a, b) => ui.mercados.has(b.id) - ui.mercados.has(a.id))
      .map((m) => chip(`data-mercado="${escapar(m.id)}"`, m.nome, ui.mercados.has(m.id))),
  ].join("");
}

// Os chips valem igual na busca e no catálogo. O preparo fica de fora: a
// tela aplica depois, pra contar o que cada chip de preparo tem.
function filtros() {
  return { promocao: ui.promocao, ordem: ui.ordem, mercados: ui.mercados.size ? [...ui.mercados] : null };
}

// A lista de produtos que a tela está mostrando (busca ou seção do
// catálogo), antes do filtro de preparo; null quando não há lista (raiz ou
// departamento do catálogo, ou sem índice).
function achadosAtuais(estado) {
  if (!estado.indice) return null;
  const termo = ui.termo.trim();
  if (termo) return buscar(estado.indice, termo, filtros());
  const { departamento, secao, tudo } = ui.catalogo;
  if (!departamento || (secao == null && !tudo)) return null;
  return catalogar(estado.indice, { departamento, secao: tudo ? null : secao, ...filtros() });
}

// Chips de preparo (bife, moída, cubos…) só quando a lista tem carne: o
// açougue é o foco, e "acém" sem isso mistura bife com moída. A contagem
// diz o que cada chip vai mostrar.
function renderizarPreparos(achados) {
  const caixa = el("#preparos");
  const contagens = new Map();
  for (const grupo of achados ?? []) {
    for (const preparo of grupo.preparos) contagens.set(preparo, (contagens.get(preparo) || 0) + 1);
  }
  const disponiveis = PREPAROS.filter((p) => contagens.has(p.id));
  // O preparo escolhido não existe nesta lista (outra busca): solta o filtro
  // em vez de mostrar uma lista vazia sem o chip que explicaria por quê.
  if (ui.preparo && !contagens.has(ui.preparo)) ui.preparo = null;
  caixa.hidden = !disponiveis.length;
  caixa.innerHTML = disponiveis
    .map((p) => chip(`data-preparo="${escapar(p.id)}"`, `${p.nome} (${contagens.get(p.id)})`, ui.preparo === p.id))
    .join("");
}

function marcaPeso(grupo) {
  // A granel o "peso" é o passo de venda (100 g no Angeloni, 1 kg no Giassi):
  // dito assim, "100 g" não passa por tamanho da embalagem.
  const pesoTexto = grupo.granel ? `${peso(grupo.gramas, grupo.liquido)} a granel` : peso(grupo.gramas, grupo.liquido);
  return [grupo.marca, pesoTexto].filter(Boolean).map(escapar).join(" · ");
}

function precos(grupo, nomes) {
  // Com chip de mercado ligado, os outros mercados ficam apagados e fora da
  // comparação: destacar o Bistek com o filtro "Giassi" parecia filtro quebrado.
  const escolhidos = ui.mercados.size ? (m) => ui.mercados.has(m) : () => true;
  const dentro = Object.entries(grupo.ofertas).filter(([m]) => escolhidos(m));
  // Verde quer dizer "mais barato que os outros": com uma loja só não há
  // comparação, e o destaque passaria uma vantagem que não existe.
  const compara = dentro.length > 1;
  const menor = Math.min(...dentro.map(([, o]) => o.preco));
  const unidade = grupo.liquido ? "l" : "kg";
  const porQuilo = grupo.liquido ? "por litro" : "por quilo";
  return Object.entries(grupo.ofertas)
    .map(([mercado, oferta]) => {
      const fora = !escolhidos(mercado);
      const ehMelhor = !fora && compara && oferta.preco === menor;
      const melhor = ehMelhor ? " melhor" : fora ? " fora" : "";
      // Promoção vale só se o "de" for maior; a loja às vezes repete o preço.
      // O "de"/"por" e o "mais barato" vão escritos pro leitor de tela: só
      // a cor e o risco não dizem nada a ele.
      const de = oferta.promocao > oferta.preco ? `<s><span class="sr">de </span>${reais(oferta.promocao)}</s> <span class="sr">por </span>` : "";
      // O preço por quilo (ou litro) de cada loja é o que compara acém a
      // R$ 5,39 por 100 g com acém a R$ 81,69 por 1,5 kg. O peso pode ter
      // vindo só de outra loja do mesmo EAN.
      const gramas = oferta.gramas ?? grupo.gramas;
      const porKg = gramas > 0 ? ` <span class="por-kg">${reais(Math.round((oferta.preco / gramas) * 1000))}<span aria-hidden="true">/${unidade}</span><span class="sr"> ${porQuilo}</span></span>` : "";
      // Encarte vale até um dia e às vezes só com clube ou app: a pessoa
      // precisa saber antes de ir; a condição vai numa linha própria.
      const ate = oferta.ate ? ` <span class="ate">até ${diaMes(oferta.ate)}</span>` : "";
      const selo = ehMelhor ? '<span aria-hidden="true">✓</span><span class="sr">mais barato:</span> ' : "";
      return `<span class="preco${melhor}" data-mercado="${escapar(mercado)}"${oferta.ate ? " data-encarte" : ""}>`
        + `${selo}<span class="mercado">${escapar(nomes[mercado] ?? mercado)}</span> ${de}<b>${reais(oferta.preco)}</b>${porKg}${ate}</span>`;
    })
    .join("");
}

function condicoes(grupo, nomes) {
  const linhas = Object.entries(grupo.ofertas)
    .filter(([, o]) => o.condicao)
    // "Oferta Clube Magia: R$ 6,49" já diz o mercado; não repete "Magia:".
    .map(([m, o]) => {
      const nome = nomes[m] ?? m;
      return normalizar(o.condicao).includes(normalizar(nome)) ? escapar(o.condicao) : `${escapar(nome)}: ${escapar(o.condicao)}`;
    });
  return linhas.length ? `<p class="condicao">${linhas.join(" · ")}</p>` : "";
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
      ${condicoes(grupo, nomes)}
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
  return `<div class="catalogo">
    <h2 class="titulo-catalogo">Catálogo</h2>
    <ul class="departamentos">${linhas.join("")}</ul>
  </div>`;
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

// Departamento com uma seção só abre direto nos produtos: a lista de uma
// linha seria um toque a mais sem escolha nenhuma.
const umaSecaoSo = (dep) => dep.secoes.length === 1;

function produtosDoCatalogo(estado, dep, achados) {
  const secao = ui.catalogo.tudo ? null : ui.catalogo.secao;
  let titulo;
  let rotuloVoltar;
  if (umaSecaoSo(dep)) {
    titulo = `<span class="emoji" aria-hidden="true">${dep.emoji}</span> ${escapar(dep.nome)}`;
    rotuloVoltar = "Voltar pro catálogo";
  } else if (secao == null) {
    titulo = `Tudo de ${escapar(dep.nome)}`;
    rotuloVoltar = `Voltar pra ${dep.nome}`;
  } else {
    titulo = `${escapar(secao)} <small>${escapar(dep.nome)}</small>`;
    rotuloVoltar = `Voltar pra ${dep.nome}`;
  }
  const cabecalho = cabecalhoDoNivel(rotuloVoltar, titulo);
  if (!achados.length) return `<div class="catalogo">${cabecalho}<p class="vazio">Nada aqui nesses mercados.</p></div>`;
  const { cartoes, mais } = lote(achados, estado);
  return `<div class="catalogo">${cabecalho}${cartoes}${mais ? `<div class="rodape-busca">${mais}</div>` : ""}</div>`;
}

function conteudoDoCatalogo(estado, achados) {
  const { departamento, secao, tudo } = ui.catalogo;
  if (!departamento) return raizDoCatalogo(estado);
  const dep = estado.indice.catalogo.find((d) => d.id === departamento);
  // O catálogo mudou embaixo da pessoa (mercado que saiu): volta pra raiz.
  if (!dep) {
    ui.catalogo = { ...RAIZ };
    return raizDoCatalogo(estado);
  }
  if (secao == null && !tudo) return departamentoDoCatalogo(estado, dep);
  return produtosDoCatalogo(estado, dep, achados ?? []);
}

// `achados`: a lista já filtrada (inclusive por preparo) quando há lista.
function conteudoResultados(estado, achados) {
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
  if (!termo) return conteudoDoCatalogo(estado, achados);

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
  const chipFocado = ativo?.closest?.("#chips .chip, #preparos .chip");
  if (chipFocado) {
    for (const nome of ["filtro", "ordem", "mercado", "preparo"]) {
      const valor = chipFocado.dataset[nome];
      if (valor) return `#${chipFocado.parentElement.id} .chip[data-${nome}="${CSS.escape(valor)}"]`;
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
  let achados = achadosAtuais(estado);
  renderizarPreparos(achados);
  if (achados && ui.preparo) achados = filtrar(achados, { preparo: ui.preparo });
  resultados.innerHTML = conteudoResultados(estado, achados);
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
function seletorDoNivel(nivel, estado) {
  if (nivel.tudo) return "#resultados .secao[data-tudo]";
  if (nivel.secao != null) {
    // Departamento de uma seção só abriu direto nos produtos: quem abriu foi o ladrilho dele.
    const dep = estado.indice?.catalogo.find((d) => d.id === nivel.departamento);
    if (!(dep && umaSecaoSo(dep))) return `#resultados .secao[data-secao="${CSS.escape(nivel.secao)}"]`;
  }
  if (nivel.departamento) return `#resultados .departamento[data-departamento="${CSS.escape(nivel.departamento)}"]`;
  return null;
}

function nivelAcima(nivel, estado) {
  if (nivel.secao != null || nivel.tudo) {
    const dep = estado.indice?.catalogo.find((d) => d.id === nivel.departamento);
    if (dep && umaSecaoSo(dep)) return { ...RAIZ };
    return { departamento: nivel.departamento, secao: null, tudo: false };
  }
  return { ...RAIZ };
}

// Descer empurra uma entrada no histórico: o botão voltar do celular sobe
// um nível em vez de sair do site. A URL não muda.
function descer(estado, nivel) {
  ui.catalogo = nivel;
  ui.mostrar = LOTE;
  history.pushState({ catalogo: nivel, carga: CARGA }, "");
  renderizarBusca(estado);
  // O nível novo começa do topo; o foco no título conta pro leitor de tela onde está.
  window.scrollTo({ top: 0 });
  focarTitulo();
}

function subir(estado) {
  // Se foi o site que empurrou o histórico, volta por ele, pra o botão da
  // tela e o do navegador contarem a mesma história (o popstate redesenha).
  if (history.state?.carga === CARGA && history.state.catalogo) {
    history.back();
    return;
  }
  const de = ui.catalogo;
  ui.catalogo = nivelAcima(de, estado);
  ui.mostrar = LOTE;
  renderizarBusca(estado);
  focar(seletorDoNivel(de, estado));
}

export function ligarBusca(estado, acoes) {
  const campo = el("#busca");
  const aoDigitar = debounce(() => {
    ui.termo = campo.value;
    ui.mostrar = LOTE;
    renderizarBusca(estado);
  }, 120);
  campo.addEventListener("input", aoDigitar);
  // A tecla "Buscar" do teclado do celular mostra o resultado e baixa o
  // teclado, que tampava metade da tela.
  campo.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    ui.termo = campo.value;
    ui.mostrar = LOTE;
    renderizarBusca(estado);
    campo.blur();
  });

  // Recarregar a aba no meio do catálogo começa da raiz: o estado velho do
  // histórico não vale mais (entrada de outra carga conta como raiz).
  history.replaceState(null, "");
  window.addEventListener("popstate", (e) => {
    const de = ui.catalogo;
    ui.catalogo = (e.state?.carga === CARGA && e.state.catalogo) || { ...RAIZ };
    ui.mostrar = LOTE;
    // O voltar precisa ter efeito visível: com texto digitado (ou na aba
    // Lista) o nível mudaria às escuras e a pessoa apertaria de novo até
    // sair do site. Limpa a busca e traz pra tela Buscar.
    // Lê o campo, não `ui.termo`: o debounce de 120 ms pode ainda não ter copiado o que foi digitado.
    if (campo.value || ui.termo) {
      campo.value = "";
      ui.termo = "";
    }
    acoes.mostrarBusca?.();
    renderizarBusca(estado);
    // Subindo, o foco volta pro botão que abriu o nível de onde veio;
    // descendo (o "avançar" do navegador), vai pro título.
    if (!focar(seletorDoNivel(de, estado))) focarTitulo();
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

  el("#preparos").addEventListener("click", (e) => {
    const botao = e.target.closest(".chip");
    if (!botao) return;
    // Tocar de novo no preparo ativo solta o filtro.
    ui.preparo = ui.preparo === botao.dataset.preparo ? null : botao.dataset.preparo;
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
      const id = departamento.dataset.departamento;
      const dep = estado.indice?.catalogo.find((d) => d.id === id);
      const secao = dep && umaSecaoSo(dep) ? dep.secoes[0].nome : null;
      descer(estado, { departamento: id, secao, tudo: false });
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
