// Tela Lista: itens, totais e menu. Como a busca, não mexe em `estado.itens`
// nem salva: cada toque vira um pedido em `acoes`, e o app.js (dono da lista)
// muda, salva e manda redesenhar.
import { melhorOferta, totais } from "./lista.js";
import { reais, peso } from "./formato.js";
import { el, escapar, trocarFotoQuebrada } from "./dom.js";

const CONTROLES = ["marcar", "menos", "mais", "remover"];

// Ícone do item de texto: um quadro neutro no lugar da foto, pra a coluna
// não ficar desalinhada e o item sem preço ser reconhecível de relance.
const ICONE_TEXTO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">'
  + '<path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

function nomesDosMercados(estado) {
  return Object.fromEntries(estado.mercados.map((m) => [m.id, m.nome]));
}

// Só mercados com catálogo de hoje entram nos totais: somar o preço velho de
// um mercado fora do ar daria um "Tudo no Angeloni" que ninguém confirmou.
export function mercadosCarregados(estado) {
  if (!estado.indice) return [];
  const carregados = new Set(estado.indice.mercados);
  return estado.mercados.filter((m) => carregados.has(m.id));
}

// Ordem dos mercados no item: a do resumo (sempre a mesma na tela) e, depois,
// algum que o item conheça e o resumo de hoje não traga.
function mercadosDoItem(item, estado) {
  // `?? {}`: item mexido à mão sem ofertas aparece como "sem preço", não derruba a tela.
  const ofertas = item.ofertas ?? {};
  const ids = estado.mercados.map((m) => m.id).filter((id) => ofertas[id]);
  for (const id of Object.keys(ofertas)) if (!ids.includes(id)) ids.push(id);
  return ids;
}

const viva = (oferta) => oferta && !oferta.sumiu && !oferta.indisponivel;

// Link só se for endereço web: o catálogo vem de fora e um `javascript:` no
// href rodaria ao toque mesmo escapado.
function linkSeguro(link) {
  return /^https?:\/\//i.test(link ?? "") ? link : null;
}

function quantidade(item) {
  const n = escapar(item.quantidade);
  // No granel o número sozinho não diz quanto pegar: "2 × 200 g" diz.
  const passo = item.granel && item.gramas ? `<small> × ${escapar(peso(item.gramas, item.liquido))}</small>` : "";
  const noMinimo = item.quantidade <= 1;
  return `<div class="quantidade" role="group" aria-label="Quantidade de ${escapar(item.nome)}">
      <button type="button" class="menos" aria-label="Menos"${noMinimo ? ' aria-disabled="true"' : ""}>−</button>
      <span class="n">${n}${passo}</span>
      <button type="button" class="mais" aria-label="Mais">+</button>
    </div>`;
}

function linhasDePreco(item, estado, nomes) {
  const melhor = melhorOferta(item);
  if (melhor) {
    const outros = mercadosDoItem(item, estado)
      .filter((m) => m !== melhor.mercado && viva(item.ofertas[m]))
      // Cada mercado inteiro num span que não quebra: "R$" de um lado e o
      // valor do outro confunde. O "·" vem do CSS, só entre spans, e o espaço
      // entre eles é o único lugar onde a linha pode quebrar.
      .map((m) => `<span>${escapar(nomes[m] ?? m)} ${reais(item.ofertas[m].preco * item.quantidade)}</span>`);
    return `<p class="melhor">${escapar(nomes[melhor.mercado] ?? melhor.mercado)} ${reais(melhor.total)}</p>`
      + (outros.length ? `<p class="outros">${outros.join(" ")}</p>` : "");
  }
  // Nenhum mercado confirma hoje: o último preço visto ajuda a ter noção do
  // gasto, mas em cinza, pra não parecer preço de agora.
  const antigas = item.tipo === "produto"
    ? Object.entries(item.ofertas ?? {}).sort((a, b) => a[1].preco - b[1].preco)
    : [];
  const era = antigas.length
    ? ` <span class="era">(era ${reais(antigas[0][1].preco * item.quantidade)} no ${escapar(nomes[antigas[0][0]] ?? antigas[0][0])})</span>`
    : "";
  return `<p class="melhor sem-preco">sem preço${era}</p>`;
}

// Mesmo cálculo pra líquido (ml contam como gramas); só a unidade muda.
function porQuilo(oferta, gramas, liquido) {
  return gramas ? ` · <span class="por-kg">${reais(Math.round((oferta.preco / gramas) * 1000))}/${liquido ? "l" : "kg"}</span>` : "";
}

function detalhe(item, estado, nomes, aberto) {
  const melhor = melhorOferta(item);
  const linhas = mercadosDoItem(item, estado).map((m) => {
    const oferta = item.ofertas[m];
    const nome = escapar(nomes[m] ?? m);
    if (oferta.sumiu) return `<li class="apagado">não achei mais no ${nome}</li>`;
    if (oferta.indisponivel) return `<li class="apagado">${nome}: sem preços hoje (era ${reais(oferta.preco)})</li>`;
    const link = linkSeguro(oferta.link);
    const rotulo = link ? `<a href="${escapar(link)}" target="_blank" rel="noopener">${nome}</a>` : nome;
    // A loja às vezes repete o preço no "de": só é promoção se o "de" for maior.
    const de = oferta.promocao > oferta.preco ? `<s>${reais(oferta.promocao)}</s> ` : "";
    const destaque = melhor?.mercado === m && Object.values(item.ofertas).filter(viva).length > 1 ? ' class="mais-barato"' : "";
    return `<li${destaque}>${rotulo} ${de}<b>${reais(oferta.preco)}</b>${porQuilo(oferta, item.gramas, item.liquido)}</li>`;
  });
  return `<details class="detalhe"${aberto ? " open" : ""}>
      <summary>Ver preços</summary>
      <ul>${linhas.join("")}</ul>
    </details>`;
}

function linhaDoItem(item, estado, nomes, abertos) {
  const nome = escapar(item.nome);
  let foto;
  if (item.tipo !== "produto") foto = `<span class="foto texto-livre">${ICONE_TEXTO}</span>`;
  else if (item.foto) foto = `<img class="foto" src="${escapar(item.foto)}" alt="" loading="lazy" decoding="async" width="48" height="48">`;
  else foto = '<span class="foto sem-foto" aria-hidden="true"></span>';
  return `<li class="item" data-id="${escapar(item.id)}"${item.marcado ? " data-marcado" : ""}>
    <label class="alvo-marcar"><input type="checkbox" class="marcar" aria-label="Pegar ${nome}"${item.marcado ? " checked" : ""}></label>
    ${foto}
    <div class="texto">
      <p class="nome">${nome}</p>
      ${linhasDePreco(item, estado, nomes)}
    </div>
    ${item.tipo === "produto" ? detalhe(item, estado, nomes, abertos.has(item.id)) : ""}
    ${quantidade(item)}
    <button type="button" class="remover" aria-label="Remover ${nome}">×</button>
  </li>`;
}

// Quem já pegou vai pro fim; fora isso, a ordem em que a pessoa pôs. A ordem
// guardada não muda: desmarcar devolve o item pro lugar de antes.
function ordemNaTela(itens) {
  return [...itens.filter((i) => !i.marcado), ...itens.filter((i) => i.marcado)];
}

function conteudoItens(estado, abertos) {
  if (!estado.itens.length) {
    return `<li class="vazio">Sua lista está vazia. Busque um produto pra começar.
      <button type="button" id="ir-buscar">Buscar produto</button></li>`;
  }
  const nomes = nomesDosMercados(estado);
  const ordem = ordemNaTela(estado.itens);
  const temAFazer = ordem.some((i) => !i.marcado);
  return ordem.map((item, n) => {
    const divisor = temAFazer && item.marcado && !ordem[n - 1]?.marcado ? '<li class="divisor">Pegos</li>' : "";
    return divisor + linhaDoItem(item, estado, nomes, abertos);
  }).join("");
}

function conteudoTotais(estado) {
  const mercados = mercadosCarregados(estado);
  const t = totais(estado.itens, mercados.map((m) => m.id));
  const nomes = nomesDosMercados(estado);
  const linhas = t.porMercado.map(({ mercado, total, faltam }, n) => {
    const falta = faltam === 1 ? "falta 1" : faltam > 1 ? `faltam ${faltam}` : "";
    // O primeiro é o melhor pra ir num mercado só (completo e mais barato).
    const primeiro = n === 0 && t.porMercado.length > 1 ? ' class="primeiro"' : "";
    return `<p data-mercado="${escapar(mercado)}"${primeiro}><span>Tudo no ${escapar(nomes[mercado] ?? mercado)}</span> <b>${reais(total)}</b>`
      + (falta ? ` <small>· ${falta}</small>` : "") + "</p>";
  });
  linhas.push(`<p class="separado"><span>Cada item no mais barato</span> <b>${reais(t.separado)}</b></p>`);
  if (t.semPreco > 0) linhas.push(`<small class="sem-preco">${t.semPreco} sem preço</small>`);
  return linhas.join("");
}

// Guarda qual controle estava focado pra devolver o foco depois do redesenho;
// se o item sumiu (removido), o foco vai pro mesmo controle do vizinho.
function lembrarFoco() {
  const ativo = document.activeElement;
  const li = ativo?.closest?.("#itens li.item");
  if (!li) return null;
  const controle = CONTROLES.find((c) => ativo.classList.contains(c))
    ?? (ativo.matches("summary") ? "detalhe summary" : null);
  if (!controle) return null;
  const posicao = [...document.querySelectorAll("#itens li.item")].indexOf(li);
  return { id: li.dataset.id, controle, posicao };
}

function devolverFoco(foco) {
  if (!foco) return;
  const raiz = el("#itens");
  let li = raiz.querySelector(`li.item[data-id="${CSS.escape(foco.id)}"]`);
  if (!li) {
    const todos = raiz.querySelectorAll("li.item");
    li = todos[Math.min(foco.posicao, todos.length - 1)];
  }
  const alvo = li?.querySelector(`.${foco.controle}`) ?? el("#colar");
  alvo?.focus();
}

// Idempotente: o app chama de novo a cada mudança da lista ou do catálogo.
export function renderizarLista(estado) {
  const foco = lembrarFoco();
  // O detalhe aberto continua aberto depois de mudar a quantidade.
  const abertos = new Set([...document.querySelectorAll("#itens details[open]")].map((d) => d.closest("li.item").dataset.id));
  el("#itens").innerHTML = conteudoItens(estado, abertos);

  const vazia = !estado.itens.length;
  const blocoTotais = el("#totais");
  blocoTotais.hidden = vazia;
  blocoTotais.innerHTML = vazia ? "" : conteudoTotais(estado);

  // Colar fica sempre: receber a lista de alguém começa com a lista vazia.
  el("#menu-lista").classList.toggle("so-colar", vazia);
  el("#copiar").hidden = vazia;
  el("#limpar").hidden = vazia;
  el("#desmarcar").hidden = !estado.itens.some((i) => i.marcado);
  devolverFoco(foco);
}

function abrirDialogo(dialogo) {
  // `returnValue` sobra do último fechamento: sem zerar, Esc repetiria a última escolha.
  dialogo.returnValue = "";
  dialogo.showModal();
}

// Age no envio do formulário, não no "close" (que chega depois, numa tarefa à
// parte): fecha primeiro, pra o navegador devolver o foco ao botão que abriu,
// e só então age, pra a ação poder mandar o foco pra outro lugar (o "Desfazer").
function aoEscolher(dialogo, agir) {
  dialogo.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const escolha = e.submitter?.value ?? "";
    dialogo.close(escolha);
    agir(escolha);
  });
}

export function mostrarParaCopiar(texto) {
  const dialogo = el("#dialogo-copiar");
  const caixa = dialogo.querySelector("textarea");
  caixa.value = texto;
  abrirDialogo(dialogo);
  caixa.focus();
  caixa.select();
}

export function ligarLista(estado, acoes) {
  const itens = el("#itens");
  const idDe = (alvo) => alvo.closest("li.item")?.dataset.id;

  itens.addEventListener("change", (e) => {
    if (!e.target.matches(".marcar")) return;
    acoes.marcar(idDe(e.target), e.target.checked);
  });

  itens.addEventListener("click", (e) => {
    if (e.target.closest("#ir-buscar")) return acoes.irParaBusca();
    const botao = e.target.closest("button");
    if (!botao) return;
    const id = idDe(botao);
    if (!id) return;
    if (botao.matches(".mais")) acoes.alterarQuantidade(id, 1);
    // aria-disabled em vez de disabled: o botão continua focável e o teclado
    // não perde o lugar quando a quantidade chega a 1.
    else if (botao.matches(".menos") && botao.getAttribute("aria-disabled") !== "true") acoes.alterarQuantidade(id, -1);
    else if (botao.matches(".remover")) acoes.remover(id);
  });

  el("#copiar").addEventListener("click", async () => {
    const { copiado, texto } = await acoes.copiar();
    if (!copiado) mostrarParaCopiar(texto);
  });
  el("#desmarcar").addEventListener("click", () => acoes.desmarcarTudo());

  const colar = el("#dialogo-colar");
  el("#colar").addEventListener("click", () => {
    colar.querySelector("textarea").value = "";
    abrirDialogo(colar);
  });
  aoEscolher(colar, (escolha) => {
    const texto = colar.querySelector("textarea").value;
    if (escolha === "adicionar" && texto.trim()) acoes.colar(texto);
  });

  const limpar = el("#dialogo-limpar");
  el("#limpar").addEventListener("click", () => abrirDialogo(limpar));
  aoEscolher(limpar, (escolha) => {
    if (escolha === "limpar") acoes.limpar();
  });

  // Toque fora do quadro fecha, como o Esc: é o gesto esperado no celular.
  // Só quando o toque começa e termina no fundo: arrastar uma seleção no
  // textarea e soltar fora não pode jogar fora o texto colado.
  for (const dialogo of document.querySelectorAll("dialog")) {
    let comecouNoFundo = false;
    dialogo.addEventListener("pointerdown", (e) => { comecouNoFundo = e.target === dialogo; });
    dialogo.addEventListener("click", (e) => {
      if (comecouNoFundo && e.target === dialogo) dialogo.close();
      comecouNoFundo = false;
    });
  }

  trocarFotoQuebrada(itens);

  // A altura do rodapé de totais entra no scroll-padding da página: o foco
  // por teclado não pode parar escondido atrás dele.
  const blocoTotais = el("#totais");
  const medir = () => document.documentElement.style.setProperty("--altura-totais", `${blocoTotais.offsetHeight}px`);
  medir();
  if ("ResizeObserver" in window) new ResizeObserver(medir).observe(blocoTotais);
}
