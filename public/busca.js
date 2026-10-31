// Índice, busca e catálogo do site. Roda no navegador e no Node: o site é
// servido sozinho, então não pode depender de nada de `robo/`.
import { normalizar } from "./texto.js";
import { DEPARTAMENTOS, classificar, secoesConhecidas } from "./departamentos.js";

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

// O catálogo: um departamento por vez, na ordem de corredor, só os que têm
// produto; dentro, as seções na ordem das regras (as que nenhuma regra
// conhece depois, alfabéticas) e os produtos em ordem de nome, que é como se
// percorre uma prateleira. `grupos` do departamento é a soma das seções.
function montarCatalogo(grupos) {
  const colator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const porNome = (a, b) => colator.compare(a.nome, b.nome);
  const porDepartamento = new Map();
  for (const grupo of grupos) {
    if (!porDepartamento.has(grupo.departamento)) porDepartamento.set(grupo.departamento, new Map());
    const porSecao = porDepartamento.get(grupo.departamento);
    if (!porSecao.has(grupo.secao)) porSecao.set(grupo.secao, []);
    porSecao.get(grupo.secao).push(grupo);
  }
  const catalogo = [];
  for (const { id, nome, emoji } of DEPARTAMENTOS) {
    const porSecao = porDepartamento.get(id);
    if (!porSecao) continue;
    const conhecidas = secoesConhecidas(id);
    const posicao = (secao) => {
      const i = conhecidas.indexOf(secao);
      return i < 0 ? conhecidas.length : i;
    };
    const secoes = [...porSecao.entries()]
      .map(([secao, lista]) => ({ nome: secao, grupos: lista.sort(porNome) }))
      .sort((a, b) => posicao(a.nome) - posicao(b.nome) || colator.compare(a.nome, b.nome));
    catalogo.push({ id, nome, emoji, secoes, grupos: secoes.flatMap((s) => s.grupos) });
  }
  return catalogo;
}

export function indexar(catalogos) {
  const grupos = [];
  const porChave = new Map();
  const porMercado = new Map();

  for (const [mercadoId, arquivo] of Object.entries(catalogos)) {
    // Arquivo de antes do catálogo tem só o departamento no caminho: cai no
    // departamento certo com seção "Geral". Classifica uma vez por caminho.
    const caminhos = arquivo.categorias ?? [];
    const classes = caminhos.map(classificar);
    for (const linha of arquivo.produtos) {
      const chave = chaveDe(mercadoId, linha);
      const caminho = caminhos[linha.categoria] ?? "";
      const classe = classes[linha.categoria] ?? classificar(caminho);
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
          categoria: caminho,
          departamento: classe.departamento,
          secao: classe.secao,
          texto: normalizar(`${linha.nome} ${linha.marca ?? ""}`),
          ofertas: {},
          menor: Infinity,
          porKg: null,
        };
        porChave.set(chave, grupo);
        grupos.push(grupo);
      } else if (grupo.departamento === "outros" && classe.departamento !== "outros") {
        // O mesmo produto pode estar numa categoria que o site não entende
        // numa loja (o departamento "Bistek") e numa normal em outra.
        grupo.categoria = caminho;
        grupo.departamento = classe.departamento;
        grupo.secao = classe.secao;
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

  return { grupos, porChave, porMercado, mercados: Object.keys(catalogos), catalogo: montarCatalogo(grupos) };
}

// Mesmo efeito de `(" " + texto).includes(" " + palavra)`, sem criar uma
// string nova por grupo: a busca roda a cada tecla sobre ~54 mil grupos.
function temPrefixo(texto, palavra) {
  return texto.startsWith(palavra) || texto.includes(" " + palavra);
}

const quantasOfertas = (g) => Object.keys(g.ofertas).length;

// Os chips valem igual na busca e no catálogo.
function passa(grupo, { promocao, mercados }) {
  if (mercados && !mercados.some((m) => m in grupo.ofertas)) return false;
  if (promocao && !Object.values(grupo.ofertas).some((o) => o.promocao > 0)) return false;
  return true;
}

export function filtrar(grupos, { promocao = false, mercados = null } = {}) {
  return grupos.filter((grupo) => passa(grupo, { promocao, mercados }));
}

// Ordena por preço ou por kg/l; qualquer outra ordem devolve a lista como
// veio. Empate cai na posição original, pra a lista não pular de lugar
// entre uma tecla e outra. Sem R$/kg vai pro fim.
export function ordenar(grupos, ordem) {
  if (ordem !== "preco" && ordem !== "porKg") return grupos;
  const desempate = (a, b) => a.posicao - b.posicao;
  const comparar = ordem === "preco"
    ? (a, b) => a.grupo.menor - b.grupo.menor || desempate(a, b)
    : (a, b) => {
      const x = a.grupo.porKg, y = b.grupo.porKg;
      if (x == null || y == null) return (x == null) - (y == null) || desempate(a, b);
      return x - y || desempate(a, b);
    };
  return grupos.map((grupo, posicao) => ({ grupo, posicao })).sort(comparar).map((a) => a.grupo);
}

export function buscar(indice, termo, { promocao = false, ordem = "relevancia", mercados = null } = {}) {
  const normal = normalizar(termo);
  if (!normal) return [];
  const palavras = normal.split(" ");

  const achados = [];
  for (const grupo of indice.grupos) {
    let bate = true;
    for (const palavra of palavras) {
      if (!temPrefixo(grupo.texto, palavra)) { bate = false; break; }
    }
    if (bate && passa(grupo, { promocao, mercados })) achados.push(grupo);
  }
  if (ordem === "preco" || ordem === "porKg") return ordenar(achados, ordem);

  // Quem começa pelo que foi digitado é o que a pessoa quis dizer; depois,
  // produto em mais lojas, porque é o que dá pra comparar.
  return achados
    .map((grupo, posicao) => ({ grupo, posicao, comeca: grupo.texto.startsWith(normal), lojas: quantasOfertas(grupo) }))
    .sort((a, b) => b.comeca - a.comeca || b.lojas - a.lojas || a.grupo.menor - b.grupo.menor || a.posicao - b.posicao)
    .map((a) => a.grupo);
}

// Produtos de um departamento (ou de uma seção dele) com os mesmos chips da
// busca. Sem ordem de preço fica a ordem de nome do catálogo.
export function catalogar(indice, { departamento, secao = null, promocao = false, ordem = "relevancia", mercados = null } = {}) {
  const dep = indice.catalogo.find((d) => d.id === departamento);
  if (!dep) return [];
  const base = secao == null ? dep.grupos : (dep.secoes.find((s) => s.nome === secao)?.grupos ?? []);
  return ordenar(filtrar(base, { promocao, mercados }), ordem);
}
