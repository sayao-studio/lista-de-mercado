// Taxonomia única do catálogo. Os três mercados têm árvores diferentes
// ("Carnes", "Carnes e Aves", "Carnes, Aves e Peixes"; o Bistek põe o leite
// em Bebidas e os congelados dentro de Frios), e a pessoa quer um corredor
// só. Regras por palavra-chave sobre o caminho sem acento; a primeira que
// casa vale. Caminho que nenhuma regra conhece não quebra: vai pra "Outros"
// ou pra uma seção com o nome que o mercado deu.
//
// Pra estender quando um mercado criar categoria: rode
// `node --test tests/departamentos.test.mjs`, que lista o que caiu no nome
// do mercado, e acrescente a palavra na regra certa.
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
  [/^mercearia > leite em po/, "frios"],
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
const SECOES = {
  hortifruti: [
    [/frutas secas|castanh|nozes/, "Frutas secas e castanhas"],
    [/frutas/, "Frutas"],
    [/verduras|hortalicas|folhas/, "Verduras e folhas"],
    [/legumes/, "Legumes"],
    [/ovos/, "Ovos"],
    [/tempero|ervas/, "Temperos e ervas"],
    [/cogumelo|brotos/, "Cogumelos e brotos"],
    [/prontos|pamonha/, "Prontos pra consumo"],
  ],
  padaria: [
    [/panetone|panettone|colomba|sazonais/, "Sazonais"],
    [/\bpaes\b|pao de queijo|wrap/, "Pães"],
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
    [/cereais|farin|granola|barras|aveia/, "Cereais, farinhas e granolas"],
    [/arroz|feijao|lentilha|graos|alimentos basicos|grao de bico|ervilha/, "Arroz, feijão e grãos"],
    [/massas/, "Massas"],
    [/azeite|oleo|vinagre/, "Óleos, azeites e vinagres"],
    [/molho|tempero|condiment/, "Molhos, temperos e condimentos"],
    [/conserva|enlatado/, "Conservas e enlatados"],
    [/sobremesa|cremes? de leite|leites? condensados?/, "Sobremesas e leite condensado"],
    [/chocolate|bombonier|\bbalas?\b|guloseima|goma|doces|\bmel\b|compota|geleia|confeitaria/, "Doces, chocolates e balas"],
    [/biscoito|snack|salgadinho|torrada|bolacha/, "Biscoitos e snacks"],
    [/\bcafe|\bcha|\bmate|matina|achocolat|erva/, "Café, chá e matinais"],
    [/sopa|caldo|pratos prontos/, "Sopas, caldos e pratos prontos"],
    [/etnic|oriental|mexican/, "Étnicos e orientais"],
  ],
  saudaveis: [
    [/diet|light|zero acucar/, "Diet, light e zero açúcar"],
    [/organic/, "Orgânicos"],
    [/gluten|lactose/, "Sem glúten e sem lactose"],
    [/integra/, "Integrais"],
    [/vegan|fitness|saudabilidade/, "Veganos e fitness"],
    [/suplement/, "Suplementos"],
  ],
  bebidas: [
    [/agua/, "Águas e água de coco"],
    [/refrigerante/, "Refrigerantes"],
    [/suco|nectar|xarope|refrigerad/, "Sucos e néctares"],
    [/energetic|isotonic|hidrotonic/, "Energéticos e isotônicos"],
    [/\bcha|\bcafe/, "Chás e cafés prontos"],
    [/vegeta/, "Bebidas vegetais"],
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
    [/casa|limpador|cera|lustra|polimento|removedor|desodorizador|antimofo|alcool|querosene|acessorio/, "Casa em geral"],
  ],
  higiene: [
    [/fraldas geriatricas/, "Fraldas geriátricas"],
    [/cabelo/, "Cabelo"],
    [/bucal/, "Higiene bucal"],
    [/desodorante/, "Desodorantes"],
    [/papel|papeis|lencos/, "Papel higiênico e lenços"],
    [/absorvente|intima|preservativo|lubrificante/, "Higiene íntima"],
    [/barb|depila/, "Barba e depilação"],
    [/rosto|pele|facial|protetor|maquiagem|perfume/, "Rosto, pele e perfumes"],
    [/maos e pes|manicure|pedicure/, "Mãos e pés"],
    [/algod|curativ|mascara|acessorios de higiene/, "Curativos e algodão"],
    [/sabonete|bucha|banho|corpo|higiene pessoal|talco/, "Sabonetes e corpo"],
  ],
  bebe: [
    [/fralda|lenco/, "Fraldas e lenços"],
    [/aliment/, "Alimentação infantil"],
    [/roupinha|decoracao|mantinha|cobertor|toalha|almofada|lencol|trocador/, "Enxoval"],
    [/banho|higiene|bucal|cabelo|colonia|locoes|infantil|cuidados/, "Higiene e banho"],
    [/mamadeira|chupeta|acessorio|utensilio/, "Mamadeiras e acessórios"],
  ],
  pet: [
    [/\bcaes\b|\bcao\b|cachorro/, "Cães"],
    [/gato/, "Gatos"],
    [/aves|peixe|passaro|hamster|tartaruga|outros animais/, "Outros animais"],
    [/higiene|limpeza|acessorio|brinquedo/, "Higiene e acessórios"],
  ],
  descartaveis: [
    [/papel/, "Descartáveis de papel"],
    [/plastico/, "Descartáveis de plástico"],
    [/embalag/, "Embalagens"],
  ],
};

function partesDe(caminho) {
  return String(caminho ?? "").split(">").map((parte) => parte.trim()).filter(Boolean);
}

// "Mercearia > Massas > Macarrão" → { departamento: "mercearia", secao: "Massas" }.
// Sem regra de seção, a seção é o primeiro nível depois do departamento, com
// o nome que o mercado deu; sem nível nenhum, "Geral".
export function classificar(caminho) {
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
  const restoTexto = normalizar(resto.join(" > "));
  for (const [regra, nome] of SECOES[departamento] ?? []) {
    if (regra.test(restoTexto)) return { departamento, secao: nome };
  }
  return { departamento, secao: resto[0] ?? "Geral" };
}

// Seções na ordem da tela; as que nenhuma regra conhece vêm depois, em
// ordem alfabética (quem monta o catálogo usa isto pra ordenar).
export function secoesConhecidas(departamento) {
  return (SECOES[departamento] ?? []).map(([, nome]) => nome);
}
