// Ponto de entrada do site. A ordem importa: a lista salva aparece antes de
// qualquer download, porque no mercado a pessoa precisa dela na hora.
import { carregar, salvar } from "./armazenamento.js";
import { carregarResumo, carregarMercado } from "./dados.js";
import { indexar } from "./busca.js";
import { refrescar, novoItemProduto, novoItemTexto, alterarQuantidade } from "./lista.js";
import { quandoFoi } from "./formato.js";
import { el } from "./dom.js";
import { renderizarBusca, ligarBusca } from "./tela-busca.js";
import { renderizarLista, ligarLista } from "./tela-lista.js";

const CHAVE_TELA = "lista-de-mercado.tela";

const estado = {
  itens: [],
  indice: null,
  resumo: null,
  semInternet: false,
  tela: "buscar",
  mercados: [],
  // Separa "ainda baixando" de "baixou e não veio nada", pra a busca não prometer carga eterna.
  carregando: true,
};
// O que veio do aparelho, inteiro: ao salvar, campos que esta versão não usa voltam intactos.
let guardado = { versao: 1, itens: [] };

let resolverPronto;
const pronto = new Promise((ok) => { resolverPronto = ok; });
window.app = { estado, pronto };

export function irPara(tela, { lembrar = false } = {}) {
  estado.tela = tela;
  for (const secao of document.querySelectorAll("[data-tela]")) {
    secao.toggleAttribute("data-ativa", secao.dataset.tela === tela);
  }
  for (const botao of document.querySelectorAll("[data-ir]")) {
    if (botao.dataset.ir === tela) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
  }
  // Só a escolha da pessoa (toque na barra) é lembrada ao recarregar a aba;
  // a tela da abertura segue a regra "tem itens → Lista". Modo privado pode recusar.
  if (lembrar) {
    try { sessionStorage.setItem(CHAVE_TELA, tela); } catch { /* segue sem lembrar */ }
  }
}

// Agrupa por texto de quandoFoi pra não repetir "hoje 12h05" três vezes numa
// linha que precisa caber no celular.
export function textoDoCabecalho(mercados, semInternet, agora = new Date()) {
  if (!mercados.length) return "Ainda sem preços";
  const grupos = new Map();
  let maisRecente = null;
  for (const m of mercados) {
    if (m.erro) continue;
    const quando = quandoFoi(m.atualizadoEm, agora);
    if (!grupos.has(quando)) grupos.set(quando, []);
    grupos.get(quando).push(m);
    const t = new Date(m.atualizadoEm).getTime();
    if (!maisRecente || t > maisRecente.t) maisRecente = { t, quando };
  }
  const partes = [];
  if (maisRecente) {
    partes.push(`Preços de ${maisRecente.quando} (${grupos.get(maisRecente.quando).map((m) => m.nome).join(", ")})`);
  }
  for (const [quando, lista] of grupos) {
    if (quando === maisRecente?.quando) continue;
    for (const m of lista) partes.push(`${m.nome}: ${quando}`);
  }
  for (const m of mercados) if (m.erro) partes.push(`${m.nome}: sem preços`);
  return (semInternet ? "Sem internet · " : "") + partes.join(" · ");
}

export function renderizarCabecalho() {
  el("#quando").textContent = textoDoCabecalho(estado.mercados, estado.semInternet);
}

function renderizarContador() {
  el("#contador-lista").textContent = String(estado.itens.length);
}

function renderizarTudo() {
  renderizarLista(estado);
  renderizarBusca(estado);
  renderizarContador();
}

let fimDoAviso;

function avisar(texto) {
  clearTimeout(fimDoAviso);
  el("#aviso").textContent = texto;
}

// Recado que some sozinho: confirma o toque sem ficar tampando a tela.
export function mostrarAviso(texto, ms = 1500) {
  avisar(texto);
  fimDoAviso = setTimeout(() => avisar(""), ms);
}

// Único lugar que muda a lista: toda mudança salva, redesenha as duas telas e
// atualiza o contador, pra nenhuma das telas ficar mostrando uma lista velha.
function mudarItens(itens) {
  estado.itens = itens;
  salvar({ ...guardado, itens: estado.itens }, localStorage);
  renderizarTudo();
}

const acoesDaBusca = {
  adicionarProduto(grupo) {
    mudarItens([...estado.itens, novoItemProduto(grupo)]);
    mostrarAviso(`${grupo.nome} na lista`);
  },
  adicionarTexto(nome) {
    mudarItens([...estado.itens, novoItemTexto(nome)]);
    mostrarAviso(`${nome} na lista`);
  },
  incrementar(chave) {
    let atualizado;
    mudarItens(estado.itens.map((i) => {
      if (i.tipo !== "produto" || i.chave !== chave) return i;
      atualizado = alterarQuantidade(i, 1);
      return atualizado;
    }));
    if (atualizado) mostrarAviso(`${atualizado.nome} ×${atualizado.quantidade} na lista`);
  },
};

function avisoDeCarga() {
  const chegaram = estado.mercados.filter((m) => m.carregado).map((m) => `${m.nome} ✓`);
  return ["Carregando os preços…", ...chegaram].join(" ");
}

function ligarCasca() {
  for (const botao of document.querySelectorAll("[data-ir]")) {
    botao.addEventListener("click", () => irPara(botao.dataset.ir, { lembrar: true }));
  }
  // O aviso fixo fica escondido pra não roubar espaço; abre ao tocar no "quando".
  const quando = el("#quando");
  const avisoFixo = el("#aviso-fixo");
  const alternar = () => {
    avisoFixo.hidden = !avisoFixo.hidden;
    quando.setAttribute("aria-expanded", String(!avisoFixo.hidden));
  };
  quando.addEventListener("click", alternar);
  quando.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); }
  });
  // O campo de busca gruda logo abaixo do cabeçalho, cuja altura muda quando o texto quebra linha.
  const cabecalho = el("#cabecalho");
  const medir = () => document.documentElement.style.setProperty("--altura-cabecalho", `${cabecalho.offsetHeight}px`);
  medir();
  if ("ResizeObserver" in window) new ResizeObserver(medir).observe(cabecalho);
}

function telaInicial() {
  // Em tela larga as duas aparecem de qualquer jeito; isto vale pro celular.
  let guardada = null;
  try { guardada = sessionStorage.getItem(CHAVE_TELA); } catch { /* sem sessionStorage */ }
  if (guardada === "lista" || guardada === "buscar") return guardada;
  return estado.itens.length ? "lista" : "buscar";
}

async function carregarPrecos() {
  const deps = { fazerFetch: (...a) => fetch(...a), storage: localStorage, caches: window.caches };
  let resumo;
  try {
    ({ resumo, semInternet: estado.semInternet } = await carregarResumo(deps));
  } catch (erro) {
    console.warn("Sem resumo de preços:", erro);
    estado.resumo = null;
    estado.mercados = [];
    estado.carregando = false;
    renderizarCabecalho();
    renderizarTudo();
    avisar("Ainda sem preços: o robô roda às 6h, 12h e 18h.");
    return;
  }
  estado.resumo = resumo;
  estado.mercados = Object.entries(resumo.mercados).map(([id, e]) => ({
    id, nome: e.nome, atualizadoEm: e.atualizadoEm, erro: e.erro,
  }));
  renderizarCabecalho();
  avisar(avisoDeCarga());
  renderizarBusca(estado);

  const catalogos = await Promise.all(estado.mercados.map(async (m) => {
    if (m.erro) return null;
    try {
      const arquivo = await carregarMercado(m.id, resumo.mercados[m.id], deps);
      if (arquivo) {
        m.carregado = true;
        avisar(avisoDeCarga());
        renderizarBusca(estado);
      }
      return arquivo;
    } catch (erro) {
      // Um mercado fora do ar não pode impedir os outros de aparecer.
      console.error(`Falha ao carregar ${m.nome}:`, erro);
      m.erro = erro.message;
      return null;
    }
  }));

  // Ordem do resumo, pra os mercados aparecerem sempre na mesma sequência.
  const porId = {};
  estado.mercados.forEach((m, i) => { if (catalogos[i]) porId[m.id] = catalogos[i]; });
  estado.carregando = false;
  if (Object.keys(porId).length) {
    estado.indice = indexar(porId);
    estado.itens = refrescar(estado.itens, estado.indice);
    salvar({ ...guardado, itens: estado.itens }, localStorage);
  } else {
    // Nenhum mercado chegou: um índice vazio marcaria tudo como indisponível
    // sem ganho; a lista fica como estava, com os últimos preços.
    estado.indice = null;
  }
  renderizarCabecalho();
  renderizarTudo();
  avisar("");
}

async function iniciar() {
  ligarCasca();
  guardado = carregar(localStorage);
  estado.itens = guardado.itens;
  irPara(telaInicial());
  renderizarTudo();
  ligarBusca(estado, acoesDaBusca);
  ligarLista(estado);
  try {
    await carregarPrecos();
  } finally {
    // Os testes (e as próximas tarefas) esperam por isto mesmo se algo falhar.
    resolverPronto();
  }
}

iniciar();
