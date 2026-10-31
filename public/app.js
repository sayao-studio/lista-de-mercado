// Ponto de entrada do site. A ordem importa: a lista salva aparece antes de
// qualquer download, porque no mercado a pessoa precisa dela na hora.
import { carregar, salvar } from "./armazenamento.js";
import { carregarResumo, carregarMercado } from "./dados.js";
import { indexar, normalizar } from "./busca.js";
import { refrescar, novoItemProduto, novoItemTexto, alterarQuantidade, marcar, comoTexto, deTexto } from "./lista.js";
import { quandoFoi } from "./formato.js";
import { el } from "./dom.js";
import { renderizarBusca, ligarBusca } from "./tela-busca.js";
import { renderizarLista, ligarLista, mercadosCarregados } from "./tela-lista.js";

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
  if (!mercados.length) return semInternet ? "Sem internet" : "Ainda sem preços";
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
// O recado com botão (Desfazer) que está na tela, se houver.
let acaoViva = null;
// Recado que não expira ("ainda sem preços"): confirmações passam por cima
// dele e, ao sumir, devolvem a tela pra ele. Sem isto o primeiro "X na lista"
// apagaria de vez a única explicação de por que a busca não acha nada.
let recadoFixo = "";
// Mais de um recado fixo pode valer ao mesmo tempo ("sem preços" e "não
// consegui guardar"): um não apaga o outro.
const recadosFixos = new Set();

// Enquanto um recado com ação está vivo, recado comum é descartado: trocar o
// texto e manter o botão faria o "Desfazer" parecer desfazer a coisa nova
// ("Arroz na lista [Desfazer]"), e derrubar o botão tiraria da pessoa a única
// volta pra o que ela acabou de perder. Recado comum é só confirmação; perder
// um vale menos que perder o desfazer.
function avisar(texto) {
  if (acaoViva) return;
  clearTimeout(fimDoAviso);
  el("#aviso").textContent = texto || recadoFixo;
}

function fixarAviso(texto) {
  recadosFixos.add(texto);
  recadoFixo = [...recadosFixos].join(" ");
  avisar(recadoFixo);
}

// Modo privado ou quota cheia: a lista funciona na sessão, mas some ao fechar
// a aba. A pessoa precisa saber disso uma vez, não a cada toque. Fixo, e não
// recado que some, porque um "Desfazer" na tela engoliria o aviso.
let avisouQueNaoGuarda = false;
function guardar() {
  if (salvar({ ...guardado, itens: estado.itens }, localStorage) || avisouQueNaoGuarda) return;
  avisouQueNaoGuarda = true;
  fixarAviso("Não consegui guardar a lista neste navegador.");
}

// Recado que some sozinho: confirma o toque sem ficar tampando a tela.
export function mostrarAviso(texto, ms = 1500) {
  if (acaoViva) return;
  avisar(texto);
  fimDoAviso = setTimeout(() => avisar(""), ms);
}

// Recado com um botão (o "Desfazer"). Montado com nós, não innerHTML: o texto
// pode trazer nome de produto. `focar` leva o teclado até o botão quando o
// controle que a pessoa usou some da tela (o "Limpar lista" com a lista vazia).
// `aoExpirar`: chamado quando o prazo acaba sem o toque (ou outro recado com
// ação toma o lugar), pra quem pediu soltar o que guardava pra desfazer.
// `focoDepois`: pra onde vai o teclado se o foco ainda estava no botão.
export function mostrarAvisoComAcao(texto, rotulo, acao, { ms = 6000, focar = false, id, aoExpirar, focoDepois } = {}) {
  acaoViva?.encerrar(true);
  clearTimeout(fimDoAviso);
  const aviso = el("#aviso");
  aviso.textContent = texto + " ";
  const botao = document.createElement("button");
  botao.type = "button";
  if (id) botao.id = id;
  botao.textContent = rotulo;
  aviso.append(botao);

  let prazo;
  const viva = {
    encerrar(expirou) {
      clearTimeout(prazo);
      if (acaoViva === viva) acaoViva = null;
      const tinhaFoco = aviso.contains(document.activeElement);
      aviso.textContent = recadoFixo;
      if (expirou) aoExpirar?.();
      // Não deixa o foco cair no vazio quando o botão some.
      if (tinhaFoco) (focoDepois?.() ?? el("#colar"))?.focus();
    },
  };
  acaoViva = viva;
  botao.addEventListener("click", () => {
    viva.encerrar(false);
    acao();
  });
  prazo = setTimeout(() => viva.encerrar(true), ms);
  if (focar) botao.focus();
}

// Único lugar que muda a lista: toda mudança salva, redesenha as duas telas e
// atualiza o contador, pra nenhuma das telas ficar mostrando uma lista velha.
function mudarItens(itens) {
  estado.itens = itens;
  guardar();
  renderizarTudo();
}

const acoesDaBusca = {
  adicionarProduto(grupo) {
    mudarItens([...estado.itens, novoItemProduto(grupo)]);
    mostrarAviso(`${grupo.nome} na lista`);
  },
  adicionarTexto(nome) {
    // Tocar duas vezes no mesmo "sem preço" quer dizer "mais um", não uma
    // segunda linha igual na lista; acento e caixa não fazem diferença.
    const alvo = normalizar(nome);
    const existente = estado.itens.find((i) => i.tipo === "texto" && normalizar(i.nome) === alvo);
    if (existente) {
      const atualizado = alterarQuantidade(existente, 1);
      mudarItens(estado.itens.map((i) => (i === existente ? atualizado : i)));
      mostrarAviso(`${atualizado.nome} ×${atualizado.quantidade} na lista`);
      return;
    }
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
  // O voltar do navegador mexe no catálogo, que vive na tela Buscar.
  mostrarBusca() {
    if (estado.tela !== "buscar") irPara("buscar", { lembrar: true });
  },
};

const acharItem = (id) => estado.itens.find((i) => i.id === id);
const trocarItem = (id, fazer) => estado.itens.map((i) => (i.id === id ? fazer(i) : i));

// Nomes só dos mercados com catálogo de hoje: as chaves decidem quais
// "Tudo no …" entram no texto copiado, igual ao rodapé da tela.
function nomesCarregados() {
  return Object.fromEntries(mercadosCarregados(estado).map((m) => [m.id, m.nome]));
}

// A lista de antes do "Limpar", guardada só na memória durante o "Desfazer".
let antesDeLimpar = null;

const acoesDaLista = {
  alterarQuantidade(id, delta) {
    if (acharItem(id)) mudarItens(trocarItem(id, (i) => alterarQuantidade(i, delta)));
  },
  marcar(id, marcado) {
    if (acharItem(id)) mudarItens(trocarItem(id, (i) => marcar(i, marcado)));
  },
  remover(id) {
    const posicao = estado.itens.findIndex((i) => i.id === id);
    if (posicao < 0) return;
    const removido = estado.itens[posicao];
    mudarItens(estado.itens.filter((i) => i.id !== id));
    // O × fica perto do "+": um toque errado no corredor não pode custar o item.
    // O foco vai pro Desfazer, não pro × do vizinho: Enter repetido no teclado
    // apagaria dois itens.
    mostrarAvisoComAcao(`${removido.nome} saiu da lista.`, "Desfazer", () => {
      const itens = [...estado.itens];
      itens.splice(Math.min(posicao, itens.length), 0, removido);
      mudarItens(itens);
    }, {
      ms: 4000,
      focar: true,
      id: "desfazer",
      focoDepois: () => {
        const linhas = document.querySelectorAll("#itens li.item");
        return linhas[Math.min(posicao, linhas.length - 1)]?.querySelector(".remover");
      },
    });
  },
  desmarcarTudo() {
    mudarItens(estado.itens.map((i) => (i.marcado ? marcar(i, false) : i)));
  },
  limpar() {
    if (!estado.itens.length) return;
    antesDeLimpar = estado.itens;
    mudarItens([]);
    // A página encolhe de uma vez: sem isto o convite da lista vazia fica cortado no topo.
    window.scrollTo({ top: 0 });
    mostrarAvisoComAcao("Lista limpa.", "Desfazer", () => acoesDaLista.desfazer(), {
      focar: true,
      id: "desfazer",
      // Passado o prazo, a lista velha não volta mais: não fica presa na memória.
      aoExpirar: () => { antesDeLimpar = null; },
    });
  },
  desfazer() {
    if (!antesDeLimpar) return;
    // O que a pessoa pôs depois de limpar fica, no fim.
    mudarItens([...antesDeLimpar, ...estado.itens]);
    antesDeLimpar = null;
  },
  async copiar() {
    const texto = comoTexto(estado.itens, nomesCarregados(), new Date());
    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Lista copiada");
      return { copiado: true, texto };
    } catch {
      // Sem permissão, sem HTTPS ou navegador antigo: a tela mostra o texto pra copiar à mão.
      return { copiado: false, texto };
    }
  },
  colar(texto) {
    const novos = deTexto(texto, estado.indice, new Date());
    if (!novos.length) {
      mostrarAviso("Não achei itens nesse texto");
      return;
    }
    mudarItens([...estado.itens, ...novos]);
    mostrarAviso(novos.length === 1 ? "1 item adicionado" : `${novos.length} itens adicionados`);
  },
  irParaBusca() {
    irPara("buscar", { lembrar: true });
    el("#busca").focus();
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
    // Sem rede a culpa não é do robô: prometer "roda às 6h" mandaria a pessoa
    // esperar um horário que não resolve nada.
    estado.semInternet = Boolean(erro?.semRede);
    renderizarCabecalho();
    renderizarTudo();
    fixarAviso(estado.semInternet
      ? "Sem internet e nenhum preço guardado neste aparelho."
      : "Ainda sem preços: o robô roda às 6h, 12h e 18h.");
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
    guardar();
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
  ligarLista(estado, acoesDaLista);
  try {
    await carregarPrecos();
  } finally {
    // Os testes (e as próximas tarefas) esperam por isto mesmo se algo falhar.
    resolverPronto();
  }
}

iniciar();
