// Regras da lista de compras. Funções puras: quem guarda (localStorage) e quem
// desenha (DOM) é a interface; aqui só entra lista e sai lista nova, o que
// deixa testar tudo no Node com as fixtures.
import { reais } from "./formato.js";

// O item guarda uma cópia das ofertas do dia em que foi adicionado: se o
// catálogo novo não carregar (ou o produto sumir), a lista continua mostrando
// o último preço conhecido em vez de ficar em branco.
function copiarOferta(oferta) {
  return { id: oferta.id, preco: oferta.preco, promocao: oferta.promocao, link: oferta.link };
}

export function novoItemProduto(grupo, agora = new Date()) {
  const ofertas = {};
  for (const [m, oferta] of Object.entries(grupo.ofertas)) ofertas[m] = copiarOferta(oferta);
  return {
    id: crypto.randomUUID(),
    tipo: "produto",
    chave: grupo.chave,
    ean: grupo.ean,
    nome: grupo.nome,
    marca: grupo.marca,
    gramas: grupo.gramas,
    granel: grupo.granel,
    foto: grupo.foto,
    quantidade: 1,
    marcado: false,
    ofertas,
    adicionadoEm: agora.toISOString(),
  };
}

export function novoItemTexto(nome, agora = new Date()) {
  return {
    id: crypto.randomUUID(),
    tipo: "texto",
    nome,
    quantidade: 1,
    marcado: false,
    adicionadoEm: agora.toISOString(),
  };
}

export function alterarQuantidade(item, delta) {
  return { ...item, quantidade: Math.max(1, item.quantidade + delta) };
}

export function marcar(item, marcado) {
  return { ...item, marcado };
}

// Oferta que sumiu do catálogo não é comprável hoje: mostrar o preço velho
// como "mais barato" mandaria a pessoa atrás de algo que não existe.
function ofertaViva(item, mercado) {
  const oferta = item.tipo === "produto" ? item.ofertas[mercado] : null;
  return oferta && !oferta.sumiu ? oferta : null;
}

export function melhorOferta(item) {
  if (item.tipo !== "produto") return null;
  let melhor = null;
  // `<` estrito: no empate fica o primeiro mercado, sempre o mesmo entre
  // uma atualização e outra.
  for (const mercado of Object.keys(item.ofertas)) {
    const oferta = ofertaViva(item, mercado);
    if (oferta && (!melhor || oferta.preco < melhor.preco)) {
      melhor = { mercado, preco: oferta.preco, promocao: oferta.promocao };
    }
  }
  return melhor && { ...melhor, total: melhor.preco * item.quantidade };
}

// Itens marcados também contam: o total descreve a ida ao mercado inteira,
// não só o que ainda falta pôr no carrinho.
export function totais(itens, mercados) {
  const produtos = itens.filter((i) => i.tipo === "produto");
  const porMercado = mercados.map((mercado) => {
    let total = 0;
    let faltam = 0;
    for (const item of produtos) {
      const oferta = ofertaViva(item, mercado);
      if (oferta) total += oferta.preco * item.quantidade;
      else faltam += 1;
    }
    return { mercado, total, faltam };
  });
  // Mercado que tem tudo vem antes de um mais barato que não tem: o barato
  // "incompleto" obriga a uma segunda parada, e isso custa mais que centavos.
  porMercado.sort((a, b) => a.faltam - b.faltam || a.total - b.total);

  let separado = 0;
  let semPreco = 0;
  for (const item of itens) {
    const melhor = melhorOferta(item);
    if (melhor) separado += melhor.total;
    else semPreco += 1;
  }
  return { porMercado, separado, semPreco };
}

function acharGrupo(item, indice) {
  const porChave = indice.porChave.get(item.chave);
  if (porChave) return porChave;
  // A chave pode mudar (a loja passou a informar o EAN, por exemplo); o id
  // da loja continua o mesmo e reencontra o produto.
  for (const [m, oferta] of Object.entries(item.ofertas)) {
    const grupo = indice.porMercado.get(`${m}:${oferta.id}`);
    if (grupo) return grupo;
  }
  return null;
}

// Nunca tira item da lista: a pessoa pôs lá de propósito. O que some do
// catálogo fica marcado com `sumiu` e o último preço, pra interface avisar.
export function refrescar(itens, indice) {
  // Sem catálogo ainda (primeira carga ou falha de rede), a lista aparece como
  // estava; marcar tudo como "sumiu" seria mentir.
  if (!indice) return itens;
  return itens.map((item) => {
    if (item.tipo !== "produto") return item;
    const grupo = acharGrupo(item, indice);
    const ofertas = {};
    for (const [m, oferta] of Object.entries(item.ofertas)) ofertas[m] = { ...oferta, sumiu: true };
    if (grupo) {
      for (const [m, oferta] of Object.entries(grupo.ofertas)) ofertas[m] = copiarOferta(oferta);
    }
    return {
      ...item,
      // A chave segue o grupo: se a loja passou a informar o EAN, o `#chave`
      // do texto copiado precisa ser o novo pra colar de volta e reencontrar.
      ...(grupo && { chave: grupo.chave, ean: grupo.ean }),
      // Nome e foto ficam os que a pessoa viu ao adicionar; peso só é
      // completado se faltava, pra o R$/kg aparecer quando a loja passar a informar.
      gramas: item.gramas ?? grupo?.gramas ?? null,
      granel: item.granel ?? grupo?.granel ?? null,
      ofertas,
    };
  });
}

const doisDigitos = (n) => String(n).padStart(2, "0");

function cabecalho(agora) {
  const dia = `${doisDigitos(agora.getDate())}/${doisDigitos(agora.getMonth() + 1)}`;
  const hora = `${agora.getHours()}h${doisDigitos(agora.getMinutes())}`;
  return `Lista de mercado (${dia} ${hora})`;
}

// Texto pra colar no WhatsApp. O `#chave` no fim da linha é o que permite
// colar de volta e reencontrar o mesmo produto, não só um item de texto.
// Contrato com a interface: as chaves de `nomes` definem quais mercados entram
// nos totais e a ordem base deles (o desempate depois de faltam e total).
export function comoTexto(itens, nomes, agora = new Date()) {
  const linhas = [cabecalho(agora)];
  for (const item of itens) {
    const inicio = `${item.marcado ? "✓" : "•"} ${item.quantidade}× ${item.nome}`;
    if (item.tipo !== "produto") {
      linhas.push(inicio);
      continue;
    }
    const melhor = melhorOferta(item);
    linhas.push(
      melhor
        ? `${inicio} — ${nomes[melhor.mercado] ?? melhor.mercado} ${reais(melhor.total)} #${item.chave}`
        : `${inicio} #${item.chave}`,
    );
  }

  const t = totais(itens, Object.keys(nomes));
  for (const { mercado, total, faltam } of t.porMercado) {
    const falta = faltam === 1 ? " (falta 1)" : faltam > 1 ? ` (faltam ${faltam})` : "";
    linhas.push(`Tudo no ${nomes[mercado] ?? mercado}: ${reais(total)}${falta}`);
  }
  linhas.push(`Cada item no mais barato: ${reais(t.separado)}`);
  if (t.semPreco > 0) linhas.push(`${t.semPreco} sem preço`);
  return linhas.join("\n");
}

// Linhas que o próprio comoTexto gera e que não são itens.
function ehResumo(linha) {
  return (
    linha.startsWith("Lista de mercado") ||
    linha.startsWith("Tudo no ") ||
    linha.startsWith("Cada item no mais barato") ||
    /^\d+ sem preço$/.test(linha)
  );
}

// Aceita o texto do comoTexto e também o que a pessoa cola de uma conversa:
// nada aqui pode lançar erro, no pior caso a linha vira um item de texto.
export function deTexto(texto, indice, agora = new Date()) {
  const itens = [];
  for (const bruta of String(texto ?? "").split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha || ehResumo(linha)) continue;

    const marcador = /^[•✓\-*]\s*/.exec(linha);
    if (!marcador) {
      itens.push(novoItemTexto(linha, agora));
      continue;
    }

    let resto = linha.slice(marcador[0].length);
    // Marcador sozinho ("-" de separador numa conversa) não é item.
    if (!resto) continue;
    const marcado = marcador[0].startsWith("✓");
    let quantidade = 1;
    // Exige espaço depois do "x" pra "2 xícaras de farinha" não virar
    // quantidade 2 de "ícaras".
    const qtd = /^(\d+)\s*[×xX]\s+/.exec(resto);
    if (qtd) {
      quantidade = Math.max(1, parseInt(qtd[1], 10));
      resto = resto.slice(qtd[0].length);
    }

    const comChave = /\s*#(\S+)$/.exec(resto);
    const grupo = comChave ? indice?.porChave.get(comChave[1]) : null;
    let item;
    if (grupo) {
      item = novoItemProduto(grupo, agora);
    } else {
      const semChave = comChave ? resto.slice(0, comChave.index) : resto;
      const nome = semChave.split(" — ")[0].trim() || semChave.trim() || linha;
      item = novoItemTexto(nome, agora);
    }
    itens.push({ ...item, quantidade, marcado });
  }
  return itens;
}
