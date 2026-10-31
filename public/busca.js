// Índice e busca do site. Roda no navegador e no Node (sem imports): o site é
// servido sozinho, então não pode depender de nada de `robo/`.

import { normalizar } from "./texto.js";

// Quem já importava daqui continua funcionando.
export { normalizar };

// Só o EAN junta produtos de lojas diferentes; sem ele (granel, código
// interno) cada linha fica sozinha, presa ao mercado, pra não misturar coisas
// diferentes que por acaso têm o mesmo id.
export function chaveDe(mercadoId, linha) {
  return linha.ean ? linha.ean : `${mercadoId}:${linha.id}`;
}

function porKgDe(preco, gramas) {
  return gramas > 0 ? Math.round((preco / gramas) * 1000) : null;
}

export function indexar(catalogos) {
  const grupos = [];
  const porChave = new Map();
  const porMercado = new Map();

  for (const [mercadoId, arquivo] of Object.entries(catalogos)) {
    for (const linha of arquivo.produtos) {
      const chave = chaveDe(mercadoId, linha);
      let grupo = porChave.get(chave);
      if (!grupo) {
        grupo = {
          chave,
          ean: linha.ean,
          nome: linha.nome,
          marca: linha.marca ?? "",
          gramas: null,
          granel: linha.granel,
          // Peso em ml/l. Arquivo de antes do campo não tem: vale "não líquido".
          liquido: false,
          foto: null,
          categoria: arquivo.categorias[linha.categoria] ?? "",
          texto: normalizar(`${linha.nome} ${linha.marca ?? ""}`),
          ofertas: {},
          menor: Infinity,
          porKg: null,
        };
        porChave.set(chave, grupo);
        grupos.push(grupo);
      }
      // Uma loja pode não informar o peso de um produto que outra informa;
      // pegar o primeiro não-nulo evita perder o R$/kg do grupo inteiro.
      // O líquido vem junto com o peso, da mesma loja: a unidade tem que ser a
      // daquele número. `porKg` continua numérico, por quilo ou por litro.
      if (grupo.gramas == null && linha.gramas != null) {
        grupo.gramas = linha.gramas;
        grupo.liquido = Boolean(linha.liquido);
      }
      if (grupo.foto == null && linha.foto) grupo.foto = `${arquivo.fotos}${linha.foto}-120-120`;
      // A loja pode ter dois SKUs com o mesmo EAN (o robô só tira duplicata
      // por id). Fica o mais barato: é o que a pessoa compraria, e assim o
      // menor preço do grupo é sempre o de uma oferta que aparece na tela.
      const atual = grupo.ofertas[mercadoId];
      if (!atual || linha.preco < atual.preco) {
        grupo.ofertas[mercadoId] = {
          id: linha.id,
          preco: linha.preco,
          promocao: linha.promocao,
          // Há slug com espaço no catálogo de verdade; cru, o link abriria quebrado.
          link: `${arquivo.site}/${encodeURI(linha.link)}/p`,
          nome: linha.nome,
          gramas: linha.gramas,
        };
      }
      porMercado.set(`${mercadoId}:${linha.id}`, grupo);
    }
  }

  // Menor preço e R$/kg só fecham depois de ver todas as lojas: saem das
  // ofertas que ficaram, e o peso pode ter vindo de outra loja.
  for (const grupo of grupos) {
    grupo.menor = Math.min(...Object.values(grupo.ofertas).map((o) => o.preco));
    grupo.porKg = porKgDe(grupo.menor, grupo.gramas);
  }

  return { grupos, porChave, porMercado, mercados: Object.keys(catalogos) };
}

// Mesmo efeito de `(" " + texto).includes(" " + palavra)`, sem criar uma
// string nova por grupo: a busca roda a cada tecla sobre ~54 mil grupos.
function temPrefixo(texto, palavra) {
  return texto.startsWith(palavra) || texto.includes(" " + palavra);
}

const quantasOfertas = (g) => Object.keys(g.ofertas).length;

export function buscar(indice, termo, { promocao = false, ordem = "relevancia", mercados = null } = {}) {
  const normal = normalizar(termo);
  if (!normal) return [];
  const palavras = normal.split(" ");

  const achados = [];
  indice.grupos.forEach((grupo, posicao) => {
    for (const palavra of palavras) if (!temPrefixo(grupo.texto, palavra)) return;
    if (mercados && !mercados.some((m) => m in grupo.ofertas)) return;
    if (promocao && !Object.values(grupo.ofertas).some((o) => o.promocao > 0)) return;
    achados.push({ grupo, posicao });
  });

  // Empate cai na posição original do índice, pra a lista não pular de lugar
  // entre uma tecla e outra.
  const desempate = (a, b) => a.posicao - b.posicao;
  let comparar;
  if (ordem === "preco") {
    comparar = (a, b) => a.grupo.menor - b.grupo.menor || desempate(a, b);
  } else if (ordem === "porKg") {
    comparar = (a, b) => {
      const x = a.grupo.porKg, y = b.grupo.porKg;
      if (x == null || y == null) return (x == null) - (y == null) || desempate(a, b);
      return x - y || desempate(a, b);
    };
  } else {
    // Quem começa pelo que foi digitado é o que a pessoa quis dizer; depois,
    // produto em mais lojas, porque é o que dá pra comparar.
    for (const a of achados) {
      a.comeca = a.grupo.texto.startsWith(normal);
      a.lojas = quantasOfertas(a.grupo);
    }
    comparar = (a, b) =>
      b.comeca - a.comeca || b.lojas - a.lojas || a.grupo.menor - b.grupo.menor || desempate(a, b);
  }

  return achados.sort(comparar).map((a) => a.grupo);
}
