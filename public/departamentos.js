// Taxonomia única do catálogo. Os três mercados têm árvores diferentes
// ("Carnes", "Carnes e Aves", "Carnes, Aves e Peixes"; o Bistek põe o leite
// em Bebidas e os congelados dentro de Frios), e a pessoa quer um corredor
// só. Regras por palavra-chave sobre o caminho sem acento; a primeira que
// casa vale. Caminho que nenhuma regra conhece não quebra: vai pra "Outros"
// ou pra uma seção com o nome que o mercado deu.
//
// Pra estender quando um mercado criar categoria: rode
// `node --test tests/departamentos.test.mjs`, que lista o que caiu no nome
// do mercado, e acrescente a palavra na regra certa. Radical curto leva
// `\b` ("pele" casava "Repelentes"; "cha", "Chardonnay").
import { normalizar } from "./texto.js";

// Ordem de corredor: do fresco pro não comestível.
export const DEPARTAMENTOS = [
  { id: "hortifruti", nome: "Hortifruti", emoji: "🥦" },
  { id: "padaria", nome: "Padaria", emoji: "🍞" },
  { id: "carnes", nome: "Carnes, aves e peixes", emoji: "🥩" },
  { id: "frios", nome: "Frios e laticínios", emoji: "🧀" },
  { id: "congelados", nome: "Congelados", emoji: "🧊" },
  { id: "mercearia", nome: "Mercearia", emoji: "🛒" },
  { id: "saudaveis", nome: "Saudáveis e especiais", emoji: "🌱" },
  { id: "bebidas", nome: "Bebidas", emoji: "🥤" },
  { id: "alcoolicas", nome: "Bebidas alcoólicas", emoji: "🍺" },
  { id: "limpeza", nome: "Limpeza", emoji: "🧼" },
  { id: "higiene", nome: "Higiene e beleza", emoji: "🧴" },
  { id: "bebe", nome: "Bebê e infantil", emoji: "🍼" },
  { id: "pet", nome: "Pet shop", emoji: "🐾" },
  { id: "descartaveis", nome: "Descartáveis e embalagens", emoji: "🧻" },
  { id: "outros", nome: "Outros", emoji: "📦" },
];

// [regra sobre o caminho inteiro, departamento, níveis que o departamento
// consome (o resto vira seção; 1 por padrão)]. Cruzamentos entre árvores
// vêm antes das regras por primeiro nível.
const REGRAS_DE_DEPARTAMENTO = [
  [/^bebidas( nao alcoolicas)? > (leites e bebidas lacteas|bebida lactea)/, "frios"],
  [/^bebidas > (cervejas|destilados|vinhos e espumantes|drinks prontos)/, "alcoolicas"],
  [/^frios e laticinios > congelados/, "congelados", 2],
  [/^mercearia > alimentos infantis/, "bebe"],
  // Leite em pó: o Angeloni põe direto em Mercearia, o Bistek dentro de Matinais.
  [/^mercearia > (.* > )?leites? em po/, "frios"],
  [/^mercearia > (suplementacao|suplemento|dieteticos)/, "saudaveis"],
  [/^higiene e beleza > (higiene )?infantil/, "bebe"],
  [/^bem estar e equilibrio > bebida vegetal/, "bebidas"],
  [/^bem estar e equilibrio > (adocantes|granolas|alimentos em barras)/, "mercearia"],
  [/^hortifruti > polpa/, "congelados"],
  [/^hortifruti > higienizador/, "limpeza"],
  [/^hortifruti/, "hortifruti"],
  [/^padaria/, "padaria"],
  [/^(carnes|peixaria|churrasco)/, "carnes"],
  [/^frios e laticinios/, "frios"],
  [/^congelados/, "congelados"],
  [/^mercearia/, "mercearia"],
  [/^(bem estar e equilibrio|alimentos especiais)/, "saudaveis"],
  [/^(bebidas alcoolicas|adega)/, "alcoolicas"],
  [/^bebidas/, "bebidas"],
  [/^limpeza/, "limpeza"],
  [/^higiene e beleza/, "higiene"],
  [/^(bebes|cantinho do bebe|bebe e criancas)/, "bebe"],
  [/^pet shop/, "pet"],
  [/^descartaveis/, "descartaveis"],
];

// Regras sobre o resto do caminho (sem o nível do departamento), na ordem em
// que as seções aparecem na tela. A mais específica vem antes da mais larga
// ("frutas secas" antes de "frutas"; "creme de leite" antes de "leite").
// As regras rodam primeiro sobre a última parte do caminho (a mais
// específica) e só depois sobre o resto inteiro: "Chocolates, Doces e
// Salgadinhos > Salgadinhos" é salgadinho, não doce.
const SECOES = {
  hortifruti: [
    [/frutas secas|castanh|nozes/, "Frutas secas e castanhas"],
    [/frutas/, "Frutas"],
    [/verduras|hortalicas|folhas/, "Verduras e folhas"],
    [/legumes/, "Legumes"],
    [/\bovos\b/, "Ovos"],
    [/tempero|ervas/, "Temperos e ervas"],
    [/cogumelo|brotos/, "Cogumelos e brotos"],
    [/prontos|pamonha/, "Prontos pra consumo"],
  ],
  padaria: [
    [/panetone|panettone|colomba|sazonais/, "Sazonais"],
    [/\bpaes\b|\bpao\b|wrap/, "Pães"],
    [/bolo|torta|docinho|donut|folhado|muffin|pao de mel|cuca|alfajor|rosca|confeitaria/, "Bolos e confeitaria"],
    [/lanchonete|lanches|salgados/, "Salgados e lanches"],
    [/pizza|canudos/, "Massas pra pizza"],
  ],
  carnes: [
    [/linguic/, "Linguiças"],
    [/\baves?\b|frango|peru|pato/, "Aves"],
    [/suin/, "Suínos"],
    [/peixe|pescad|frutos do mar|bacalhau/, "Peixes e frutos do mar"],
    [/exotic|cordeiro/, "Exóticas e cordeiro"],
    [/bovin|^carnes\b/, "Bovinos"],
    [/pao de alho|carv|espetinho|acompanhamento|churrasco|acessorio|descartave|tempero/, "Churrasco"],
  ],
  frios: [
    [/manteiga|margarina|requeij|cremes? de leite|\bnata\b/, "Manteiga, margarina e requeijão"],
    [/queijo/, "Queijos"],
    [/iogurte|sobremesa/, "Iogurtes e sobremesas"],
    [/leite|lacte/, "Leites e bebidas lácteas"],
    [/massas frescas/, "Massas frescas"],
    [/frios|embutid|defumad|salsich|charque|carne seca|tabua|pate|tofu/, "Frios e embutidos"],
    [/pratos prontos|fondue|culinario/, "Pratos prontos"],
  ],
  congelados: [
    [/pratos prontos|lasanha|massas|pizza/, "Pratos prontos e pizzas"],
    [/hamburg|empanad|petisc|nugget|batata/, "Hambúrguer, empanados e batatas"],
    [/vegeta|polpa|\bgelo\b/, "Vegetais, polpas e gelo"],
    [/sorvete|sobremesa|picole|torta/, "Sorvetes e sobremesas"],
    [/pao de queijo|\bpaes\b/, "Pão de queijo e pães"],
  ],
  mercearia: [
    [/acucar|adocante/, "Açúcar e adoçantes"],
    [/cereais|farin|granola|barras? de (cereal|cereais|fibra|frutas|nuts|proteina|sementes)|alimentos em barras|\baveia\b/, "Cereais, farinhas e granolas"],
    [/\barroz\b|feijao|lentilha|graos e sementes|alimentos basicos|grao de bico/, "Arroz, feijão e grãos"],
    [/massas|macarrao|nhoque/, "Massas"],
    [/azeite|\boleos?\b|vinagre/, "Óleos, azeites e vinagres"],
    [/molho|tempero|condiment/, "Molhos, temperos e condimentos"],
    [/conserva|enlatado/, "Conservas e enlatados"],
    [/sobremesa|cremes? de leite|leites? condensados?/, "Sobremesas e leite condensado"],
    // O nome do nível 2 do Bistek junta doce e salgadinho; os filhos decidem.
    [/^chocolates, doces e salgadinhos$/, "Doces, chocolates e balas"],
    [/biscoito|snack|salgadinho|torrada|bolacha|batatas? palhas?|pipoca/, "Biscoitos e snacks"],
    [/chocolate|bombonier|\bbalas?\b|guloseima|goma|doces|\bmel\b|compota|geleia|confeitaria/, "Doces, chocolates e balas"],
    [/\bcafes?\b|\bchas?\b|\bmates?\b|matina|achocolat|\berva\b/, "Café, chá e matinais"],
    [/sopa|caldo|pratos prontos/, "Sopas, caldos e pratos prontos"],
    [/etnic|oriental|mexican/, "Étnicos e orientais"],
  ],
  saudaveis: [
    [/\bdiet\b|dietetic|light|zero acucar/, "Diet, light e zero açúcar"],
    [/organic/, "Orgânicos"],
    [/gluten|lactose/, "Sem glúten e sem lactose"],
    [/integra/, "Integrais"],
    [/vegan|fitness|saudabilidade/, "Veganos e fitness"],
    [/suplement/, "Suplementos"],
  ],
  bebidas: [
    [/\baguas?\b/, "Águas e água de coco"],
    [/refrigerante/, "Refrigerantes"],
    [/vegeta|\bsoja\b/, "Bebidas vegetais"],
    [/suco|nectar|xarope|refrigerad/, "Sucos e néctares"],
    [/energetic|isotonic|hidrotonic/, "Energéticos e isotônicos"],
    [/\bchas?\b|\bcafes?\b/, "Chás e cafés prontos"],
  ],
  alcoolicas: [
    [/cervej/, "Cervejas"],
    [/vinho|espumante|champagne|frisante|sidra/, "Vinhos e espumantes"],
    [/destilad/, "Destilados"],
    [/drink|aperitivo/, "Drinks e aperitivos"],
  ],
  limpeza: [
    [/roupa|amaciante|alvejante|tira-manchas|sabao|agua sanitaria|lavanderia/, "Lavanderia"],
    [/cozinha|detergente|lava-loucas|desengordurante|saponaceo|higienizador/, "Cozinha"],
    [/banheiro|sanitario|desinfetante/, "Banheiro"],
    [/inseticida|repelente/, "Inseticidas e repelentes"],
    [/casa|limpador|\bcera\b|lustra|polimento|removedor|desodorizador|antimofo|alcool|querosene|acessorio/, "Casa em geral"],
  ],
  higiene: [
    [/fraldas geriatricas/, "Fraldas geriátricas"],
    [/cabelo/, "Cabelo"],
    [/bucal|dental/, "Higiene bucal"],
    [/absorvente|intim[ao]s?\b|preservativo|lubrificante/, "Higiene íntima"],
    [/desodorante/, "Desodorantes"],
    // "papel higienico" inteiro: pelo nome, "Papel Toalha" é descartável.
    [/papel higienico|papeis higienicos|\blencos?\b/, "Papel higiênico e lenços"],
    [/barb|depila/, "Barba e depilação"],
    [/rosto|\bpele\b|facial|protetor|maquiagem|perfume/, "Rosto, pele e perfumes"],
    [/maos e pes|manicure|pedicure/, "Mãos e pés"],
    [/algod|curativ|mascara|acessorios de higiene/, "Curativos e algodão"],
    [/sabonete|bucha|banho|corpo|higiene pessoal|talco/, "Sabonetes e corpo"],
  ],
  bebe: [
    [/fralda|\blencos?\b/, "Fraldas e lenços"],
    [/aliment/, "Alimentação infantil"],
    [/roupinha|decoracao|mantinha|cobertor|toalha|almofada|lencol|lencois|trocador/, "Enxoval"],
    [/mamadeira|chupeta|utensilio/, "Mamadeiras e acessórios"],
    [/banho|higiene|bucal|cabelo|colonia|locoes|infantil|cuidados/, "Higiene e banho"],
    [/acessorio/, "Mamadeiras e acessórios"],
  ],
  pet: [
    [/\bcaes\b|\bcao\b|cachorro/, "Cães"],
    [/gato/, "Gatos"],
    [/aves|peixe|passaro|hamster|tartaruga|outros animais/, "Outros animais"],
    [/higiene|limpeza|acessorio|brinquedo/, "Higiene e acessórios"],
  ],
  descartaveis: [
    [/papel|guardanapo/, "Descartáveis de papel"],
    [/plastico/, "Descartáveis de plástico"],
    [/embalag/, "Embalagens"],
  ],
};

// No modo nome, quem decide é a regra que casa mais cedo no nome (o tipo do
// produto vem antes do sabor: "Chocolate Ao Leite" é chocolate); em empate
// vale o casamento mais longo ("papel higienico" antes de "papel") e, por
// fim, esta ordem, que põe a mercearia antes dos frescos ("Tempero em Pó"
// é mercearia) e descartáveis antes de higiene ("Papel Toalha").
const ORDEM_PELO_NOME = ["mercearia", "frios", "hortifruti", "padaria", "carnes", "congelados", "bebidas", "alcoolicas", "saudaveis", "limpeza", "descartaveis", "pet", "higiene", "bebe"];
// Palavras de categoria que não são tipo de produto: no nome, não contam
// ("Tábua de Passar" não é frios; "Alimento Para Gatos" não é bebê).
const FRACAS_NO_NOME = /^(aliment|tabua|mascara|goma|colonia)/;

function partesDe(caminho) {
  return String(caminho ?? "").split(">").map((parte) => parte.trim()).filter(Boolean);
}

function secaoPorRegra(departamento, texto) {
  for (const [regra, nome] of SECOES[departamento] ?? []) {
    if (regra.test(texto)) return nome;
  }
  return null;
}

// Seção pelo resto do caminho: última parte primeiro, depois o resto inteiro.
function secaoPeloCaminho(departamento, resto) {
  const partes = resto.map(normalizar);
  if (!partes.length) return null;
  return secaoPorRegra(departamento, partes.at(-1)) ?? (partes.length > 1 ? secaoPorRegra(departamento, partes.join(" > ")) : null);
}

function melhorPeloNome(departamentos, texto) {
  let melhor = null;
  departamentos.forEach((id, ordem) => {
    for (const [regra, secao] of SECOES[id] ?? []) {
      const m = regra.exec(texto);
      if (!m || FRACAS_NO_NOME.test(m[0])) continue;
      const candidato = { departamento: id, secao, indice: m.index, tamanho: m[0].length, ordem };
      if (!melhor || candidato.indice < melhor.indice
        || (candidato.indice === melhor.indice && (candidato.tamanho > melhor.tamanho
          || (candidato.tamanho === melhor.tamanho && candidato.ordem < melhor.ordem)))) {
        melhor = candidato;
      }
    }
  });
  return melhor;
}

// "Mercearia > Massas > Macarrão" → { departamento: "mercearia", secao:
// "Massas", origem: "caminho" }. Sem regra de seção, a seção é o primeiro
// nível depois do departamento, com o nome que o mercado deu (origem
// "caminho"); sem nível nenhum, "Geral" (origem "nenhuma").
//
// `nome` (do produto) é o último recurso, só quando o caminho não diz a
// seção (origem "nome"): produto solto no departamento ("Frios e
// Laticínios" sem filho: "Iogurte Integral Nestlé") tenta as regras do
// próprio departamento sobre o nome inteiro; produto num departamento que o
// site não entende (o "Bistek", 556 itens de tudo) tenta as regras de todos
// só sobre as três primeiras palavras, que é onde fica o tipo do produto
// ("Ovos Caipira Free…", "Sabão Em Barra…") e não o sabor ("…Calda Frutas
// Vermelhas" não é hortifruti). A origem diz a força da classificação:
// quem junta o mesmo produto de várias lojas fica com a mais forte.
export function classificar(caminho, nome = "") {
  const partes = partesDe(caminho);
  const texto = normalizar(partes.join(" > "));
  let departamento = "outros";
  let niveis = 1;
  for (const [regra, id, consome = 1] of REGRAS_DE_DEPARTAMENTO) {
    if (regra.test(texto)) {
      departamento = id;
      niveis = consome;
      break;
    }
  }
  const resto = partes.slice(niveis);
  const secao = secaoPeloCaminho(departamento, resto);
  if (secao) return { departamento, secao, origem: "caminho" };
  if (resto.length) return { departamento, secao: resto[0], origem: "caminho" };

  const nomeNormal = normalizar(nome);
  if (departamento !== "outros") {
    const melhor = nomeNormal ? melhorPeloNome([departamento], nomeNormal) : null;
    return melhor ? { departamento, secao: melhor.secao, origem: "nome" } : { departamento, secao: "Geral", origem: "nenhuma" };
  }
  const comeco = nomeNormal.split(" ").slice(0, 3).join(" ");
  const melhor = comeco ? melhorPeloNome(ORDEM_PELO_NOME, comeco) : null;
  if (melhor) return { departamento: melhor.departamento, secao: melhor.secao, origem: "nome" };
  return { departamento, secao: "Geral", origem: "nenhuma" };
}

// Quanto vale uma classificação, pra escolher entre lojas que discordam.
export function forcaDe({ departamento, origem }) {
  if (departamento === "outros") return 0;
  return origem === "caminho" ? 3 : origem === "nome" ? 2 : 1;
}

// Seções na ordem da tela; as que nenhuma regra conhece vêm depois, em
// ordem alfabética (quem monta o catálogo usa isto pra ordenar).
export function secoesConhecidas(departamento) {
  return [...new Set((SECOES[departamento] ?? []).map(([, nome]) => nome))];
}
