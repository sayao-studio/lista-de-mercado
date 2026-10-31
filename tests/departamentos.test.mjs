import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { DEPARTAMENTOS, classificar, forcaDe, secoesConhecidas } from "../public/departamentos.js";
import { indexar } from "../public/busca.js";
import { MERCADOS } from "../robo/mercados.js";

// Árvores de verdade dos três mercados (31/10/2026), até o 3º nível, só nomes.
const arvores = JSON.parse(readFileSync(new URL("./fixtures/vtex/arvores.json", import.meta.url), "utf8"));

// Só departamento e seção; a origem tem teste próprio.
const classe = (caminho, nome) => {
  const { departamento, secao } = classificar(caminho, nome);
  return { departamento, secao };
};

test("classificar acha departamento e seção por palavra-chave, sem acento", () => {
  assert.deepEqual(classe("Mercearia > Massas > Macarrão"), { departamento: "mercearia", secao: "Massas" });
  assert.deepEqual(classe("Hortifrúti > Frutas"), { departamento: "hortifruti", secao: "Frutas" });
  assert.deepEqual(classe("Carnes, Aves e Peixes > Carnes Bovinas"), { departamento: "carnes", secao: "Bovinos" });
  // "Aves" no nome do departamento não pode puxar tudo pra "Aves".
  assert.deepEqual(classe("Carnes, Aves e Peixes > Carnes Suínas"), { departamento: "carnes", secao: "Suínos" });
  assert.deepEqual(classe("Churrasco > Carnes > Frango"), { departamento: "carnes", secao: "Aves" });
  assert.deepEqual(classe("Churrasco > Carnes"), { departamento: "carnes", secao: "Bovinos" });
  assert.deepEqual(classe("Peixaria > Bacalhau"), { departamento: "carnes", secao: "Peixes e frutos do mar" });
  assert.deepEqual(classe("Limpeza e Lavanderia > Limpador Sanitário"), { departamento: "limpeza", secao: "Banheiro" });
  assert.deepEqual(classe("Higiene e Beleza > Papel Toalha - intimo"), { departamento: "higiene", secao: "Higiene íntima" });
});

test("classificar cruza as árvores: leite do Bistek sai de Bebidas, congelado sai de Frios", () => {
  assert.deepEqual(classe("Bebidas > Leites e Bebidas Lácteas > Leite Integral"), { departamento: "frios", secao: "Leites e bebidas lácteas" });
  assert.deepEqual(classe("Bebidas não alcoólicas > Bebida Láctea"), { departamento: "frios", secao: "Leites e bebidas lácteas" });
  assert.deepEqual(classe("Frios e Laticínios > Congelados > Pizzas"), { departamento: "congelados", secao: "Pratos prontos e pizzas" });
  assert.deepEqual(classe("Frios e Laticínios > Congelados > Lanches"), { departamento: "congelados", secao: "Lanches" });
  assert.deepEqual(classe("Frios e Laticínios > Creme de Leite e Nata"), { departamento: "frios", secao: "Manteiga, margarina e requeijão" });
  assert.deepEqual(classe("Bebidas > Cervejas > Lata"), { departamento: "alcoolicas", secao: "Cervejas" });
  assert.deepEqual(classe("Bebidas > Chás e Mates"), { departamento: "bebidas", secao: "Chás e cafés prontos" });
  assert.deepEqual(classe("Mercearia > Alimentos Infantis"), { departamento: "bebe", secao: "Alimentação infantil" });
  assert.deepEqual(classe("Higiene e Beleza > Infantil > Shampoo"), { departamento: "bebe", secao: "Higiene e banho" });
  assert.deepEqual(classe("Bem Estar e Equilíbrio > Bebida Vegetal"), { departamento: "bebidas", secao: "Bebidas vegetais" });
  assert.deepEqual(classe("Mercearia > Achocolatado Em Pó"), { departamento: "mercearia", secao: "Café, chá e matinais" });
  assert.deepEqual(classe("Mercearia > Chocolates, Doces e Salgadinhos"), { departamento: "mercearia", secao: "Doces, chocolates e balas" });
  assert.deepEqual(classe("Mercearia > Salgadinhos e Snacks"), { departamento: "mercearia", secao: "Biscoitos e snacks" });
  assert.deepEqual(classe("Bebê e Crianças > Decoração Infantil"), { departamento: "bebe", secao: "Enxoval" });
});

// Caminhos reais dos três mercados → seção esperada. O teste de cobertura
// só garante que a seção é conhecida; este garante que é a certa, e segura
// as colisões já vistas (o 2º nível engolindo o 3º, radical curto dentro de
// outra palavra).
test("caminhos reais caem na seção certa", () => {
  const casos = [
    ["Mercearia > Chocolates, Doces e Salgadinhos > Salgadinhos", "mercearia", "Biscoitos e snacks"],
    ["Mercearia > Chocolates, Doces e Salgadinhos > Batatas Palhas", "mercearia", "Biscoitos e snacks"],
    ["Mercearia > Chocolates, Doces e Salgadinhos > Pipocas", "mercearia", "Biscoitos e snacks"],
    ["Mercearia > Chocolates, Doces e Salgadinhos > Chocolates", "mercearia", "Doces, chocolates e balas"],
    ["Mercearia > Conservas > Milhos e Ervilhas", "mercearia", "Conservas e enlatados"],
    ["Mercearia > Conservas e Enlatados > Milho e Ervilha", "mercearia", "Conservas e enlatados"],
    ["Mercearia > Cafés > Em Grãos e Moídos", "mercearia", "Café, chá e matinais"],
    ["Mercearia > Alimentos Básicos > Óleos", "mercearia", "Óleos, azeites e vinagres"],
    ["Mercearia > Alimentos Básicos > Feijão", "mercearia", "Arroz, feijão e grãos"],
    ["Mercearia > Alimentos Básicos", "mercearia", "Arroz, feijão e grãos"],
    ["Mercearia > Grãos e Sementes", "mercearia", "Arroz, feijão e grãos"],
    ["Mercearia > Chocolates > Barras", "mercearia", "Doces, chocolates e balas"],
    ["Mercearia > Biscoitos e Torradas > Biscoitos Doces", "mercearia", "Biscoitos e snacks"],
    ["Mercearia > Biscoitos e Snacks > Biscoitos Doces", "mercearia", "Biscoitos e snacks"],
    ["Mercearia > Matinal > Cereais", "mercearia", "Cereais, farinhas e granolas"],
    ["Mercearia > Barras de Cereais e Nuts", "mercearia", "Cereais, farinhas e granolas"],
    ["Bem Estar e Equilíbrio > Alimentos em Barras", "mercearia", "Cereais, farinhas e granolas"],
    ["Mercearia > Matinais, Chás e Mates > Leites em Pó", "frios", "Leites e bebidas lácteas"],
    ["Mercearia > Leite em Pó", "frios", "Leites e bebidas lácteas"],
    ["Mercearia > Massas > Macarrão Instantâneo", "mercearia", "Massas"],
    ["Mercearia > Mel, Compotas e Geleias", "mercearia", "Doces, chocolates e balas"],
    ["Mercearia > Sopas e Cremes", "mercearia", "Sopas, caldos e pratos prontos"],
    ["Bebidas > Sucos e Néctares > Bebidas à Base de Soja", "bebidas", "Bebidas vegetais"],
    ["Bebidas > Águas > Com Gás", "bebidas", "Águas e água de coco"],
    ["Bebidas > Refrigerantes > Guaraná", "bebidas", "Refrigerantes"],
    ["Bebidas > Vinhos e Espumantes > Tintos", "alcoolicas", "Vinhos e espumantes"],
    ["Adega > Espumante e Champagne", "alcoolicas", "Vinhos e espumantes"],
    ["Higiene e Beleza > Corpo > Repelentes", "higiene", "Sabonetes e corpo"],
    ["Higiene e Beleza > Higiene Íntima > Desodorante Íntimo", "higiene", "Higiene íntima"],
    ["Higiene e Beleza > Higiene Íntima > Lenços Íntimos", "higiene", "Higiene íntima"],
    ["Higiene e Beleza > Papel Higiênico", "higiene", "Papel higiênico e lenços"],
    ["Higiene e Beleza > Papéis Higiênicos > Folha Tripla", "higiene", "Papel higiênico e lenços"],
    ["Higiene e Beleza > Lenços Umedecidos", "higiene", "Papel higiênico e lenços"],
    ["Higiene e Beleza > Barbearia", "higiene", "Barba e depilação"],
    ["Bebê e Crianças > Lençóis para Berço", "bebe", "Enxoval"],
    ["Bebê e Crianças > Higiene e Cuidados > Mamadeiras", "bebe", "Mamadeiras e acessórios"],
    ["Bebê e Crianças > Higiene e Cuidados > Shampoo", "bebe", "Higiene e banho"],
    ["Cantinho do Bebê > Fraldas e Lenços > Fraldas", "bebe", "Fraldas e lenços"],
    ["Frios e Laticínios > Queijos > Mussarela", "frios", "Queijos"],
    ["Frios e Laticínios > Congelados > Batatas Pré Fritas", "congelados", "Hambúrguer, empanados e batatas"],
    ["Congelados > Pratos Prontos > Lasanhas", "congelados", "Pratos prontos e pizzas"],
    ["Carnes > Bovinos > Cortes", "carnes", "Bovinos"],
    ["Carnes, Aves e Peixes > Aves", "carnes", "Aves"],
    ["Carnes > Carvões", "carnes", "Churrasco"],
    ["Hortifrúti > Frutas Secas & Castanhas", "hortifruti", "Frutas secas e castanhas"],
    ["Hortifruti > Nozes, Castanhas e Sementes", "hortifruti", "Frutas secas e castanhas"],
    ["Limpeza e Lavanderia > Cera e Lustrador", "limpeza", "Casa em geral"],
    ["Limpeza > Roupas e Sapatos > Sabão em Pó", "limpeza", "Lavanderia"],
    ["Pet Shop > Rações para Cães > Adultos", "pet", "Cães"],
    ["Descartáveis > Descartáveis de Papel > Guardanapos", "descartaveis", "Descartáveis de papel"],
  ];
  const erros = [];
  for (const [caminho, departamento, secao] of casos) {
    const r = classe(caminho);
    if (r.departamento !== departamento || r.secao !== secao) erros.push(`${caminho}: esperava ${departamento} / ${secao}, veio ${r.departamento} / ${r.secao}`);
  }
  assert.deepEqual(erros, []);
});

test("classificar usa o nome do produto só quando o caminho não diz a seção", () => {
  // Solto no departamento: regras do próprio departamento sobre o nome inteiro.
  assert.deepEqual(classe("Frios e Laticínios", "Iogurte Integral Natural Nestlé 170g"), { departamento: "frios", secao: "Iogurtes e sobremesas" });
  assert.deepEqual(classe("Frios e Laticínios", "Peito De Peru Sadia Defumado 200g Fatiado"), { departamento: "frios", secao: "Frios e embutidos" });
  assert.deepEqual(classe("Padaria", "Pão Frances 180g"), { departamento: "padaria", secao: "Pães" });
  assert.deepEqual(classe("Frios e Laticínios", "Batata Congelada Mccain 720g"), { departamento: "frios", secao: "Geral" });
  // Departamento desconhecido: regras de todos, só sobre as três primeiras palavras.
  assert.deepEqual(classe("Bistek", "Ovos Caipira Free Lar Com 20 Und"), { departamento: "hortifruti", secao: "Ovos" });
  assert.deepEqual(classe("Bistek", "Sabão Em Barra Girando Sol 900g"), { departamento: "limpeza", secao: "Lavanderia" });
  assert.deepEqual(classe("Bistek", "Vinho Brasileiro Miolo Reserva Pinot Grigio 750ml"), { departamento: "alcoolicas", secao: "Vinhos e espumantes" });
  assert.deepEqual(classe("Bistek", "Iogurte Integral Grego Calda Frutas Vermelhas Nestlé 90g"), { departamento: "frios", secao: "Iogurtes e sobremesas" });
  assert.deepEqual(classe("Bistek", "Caçarola Com Tampa Inox 24cm"), { departamento: "outros", secao: "Geral" });
  // Com seção no caminho, o nome não manda.
  assert.deepEqual(classe("Mercearia > Massas", "Ovos de Páscoa"), { departamento: "mercearia", secao: "Massas" });
  assert.deepEqual(classe("Mercearia > Cestas", "Ovos"), { departamento: "mercearia", secao: "Cestas" });
});

// Erros já vistos no dado real: o tipo do produto vem primeiro no nome, o
// casamento mais longo vence o mais curto, radical curto não casa dentro de
// outra palavra, e palavra de categoria que não é tipo de produto não conta.
test("pelo nome, o tipo do produto vence o sabor e a palavra de categoria não conta", () => {
  const casos = [
    ["Chocolate Ao Leite Lacta 80g", "mercearia", "Doces, chocolates e balas"],
    ["Biscoito Rosquinha Leite Mabel 350g", "mercearia", "Biscoitos e snacks"],
    ["Biscoito Leite Condensado Suspirolândia", "mercearia", "Biscoitos e snacks"],
    ["Macarrão Com Ovos Renata 500g", "mercearia", "Massas"],
    ["Néctar Maguary Uva 1l", "bebidas", "Sucos e néctares"],
    ["Vinho Chileno Chardonnay 750ml", "alcoolicas", "Vinhos e espumantes"],
    ["Espumante Chandon Brut 750ml", "alcoolicas", "Vinhos e espumantes"],
    ["Alimento Para Gatos Whiskas 85g", "pet", "Gatos"],
    ["Papel Toalha Snob 2 Rolos", "descartaveis", "Descartáveis de papel"],
    ["Papel Higiênico Neve 30m", "higiene", "Papel higiênico e lenços"],
    ["Batata Palha Elma Chips 100g", "mercearia", "Biscoitos e snacks"],
    ["Fio Dental Encerado Oral-B 50m", "higiene", "Higiene bucal"],
    ["Tempero Em Pó Fondor 50g", "mercearia", "Molhos, temperos e condimentos"],
    ["Panettone Visconti Frutas 400g", "padaria", "Sazonais"],
    ["Leite Integral Tirol 1l", "frios", "Leites e bebidas lácteas"],
    ["Cafeteira Elétrica Mondial", "outros", "Geral"],
    ["Goma de Tapioca Da Terrinha 500g", "outros", "Geral"],
    ["Tábua de Passar Roupa Mor", "outros", "Geral"],
    ["Máscara Capilar Pantene 300ml", "outros", "Geral"],
    ["Varal de Chão Mor", "outros", "Geral"],
  ];
  const erros = [];
  for (const [nome, departamento, secao] of casos) {
    const r = classe("Bistek", nome);
    if (r.departamento !== departamento || r.secao !== secao) erros.push(`${nome}: esperava ${departamento} / ${secao}, veio ${r.departamento} / ${r.secao}`);
  }
  assert.deepEqual(erros, []);
});

test("classificar diz de onde veio a seção, e forcaDe ordena caminho > nome > nenhuma > Outros", () => {
  assert.equal(classificar("Mercearia > Massas").origem, "caminho");
  assert.equal(classificar("Mercearia > Cestas").origem, "caminho"); // nome do mercado também é caminho
  assert.equal(classificar("Frios e Laticínios", "Iogurte Nestlé").origem, "nome");
  assert.equal(classificar("Frios e Laticínios", "Batata Mccain").origem, "nenhuma");
  assert.equal(classificar("Bistek", "Ovos Caipira").origem, "nome");
  assert.equal(classificar("Bistek", "Caçarola").origem, "nenhuma");
  assert.ok(forcaDe(classificar("Mercearia > Massas")) > forcaDe(classificar("Frios e Laticínios", "Iogurte Nestlé")));
  assert.ok(forcaDe(classificar("Frios e Laticínios", "Iogurte Nestlé")) > forcaDe(classificar("Frios e Laticínios", "Batata Mccain")));
  assert.ok(forcaDe(classificar("Frios e Laticínios", "Batata Mccain")) > forcaDe(classificar("Bistek", "Caçarola")));
  assert.equal(forcaDe(classificar("Loja > Gelo")), 0); // Outros com nome de seção ainda é o mais fraco
});

test("classificar não quebra com caminho desconhecido, raso ou vazio", () => {
  assert.deepEqual(classe("Bistek"), { departamento: "outros", secao: "Geral" });
  assert.deepEqual(classe("Loja de Conveniência > Gelo e Carvão"), { departamento: "outros", secao: "Gelo e Carvão" });
  assert.deepEqual(classe("Mercearia"), { departamento: "mercearia", secao: "Geral" });
  assert.deepEqual(classe("Mercearia > Cestas"), { departamento: "mercearia", secao: "Cestas" });
  assert.deepEqual(classe(""), { departamento: "outros", secao: "Geral" });
  assert.deepEqual(classe(undefined), { departamento: "outros", secao: "Geral" });
  assert.deepEqual(classe("", null), { departamento: "outros", secao: "Geral" });
});

test("DEPARTAMENTOS tem id único e toda regra de seção aponta pra um deles", () => {
  const ids = DEPARTAMENTOS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("outros"));
  for (const id of ids) assert.ok(Array.isArray(secoesConhecidas(id)), id);
  assert.deepEqual(secoesConhecidas("hortifruti")[1], "Frutas");
  // Duas regras podem apontar pra mesma seção; a lista não repete.
  assert.equal(new Set(secoesConhecidas("bebe")).size, secoesConhecidas("bebe").length);
});

// Cobertura sobre as árvores reais, até o 3º nível (é onde o produto fica):
// nenhum departamento (fora os ignorados pelo robô) cai em "Outros", e as
// seções que ficam com o nome do mercado são poucas e conhecidas. Mudou a
// árvore de um mercado? Este teste lista o que apareceu de novo.
test("toda categoria dos três mercados tem departamento e seção", () => {
  const semDepartamento = [];
  const semSecao = [];
  for (const mercado of MERCADOS) {
    for (const departamento of arvores[mercado.id]) {
      if ((mercado.ignorar || []).includes(departamento.nome)) continue;
      const caminhos = [];
      for (const filho of departamento.filhos) {
        if (filho.netos.length) for (const neto of filho.netos) caminhos.push(`${departamento.nome} > ${filho.nome} > ${neto}`);
        else caminhos.push(`${departamento.nome} > ${filho.nome}`);
      }
      if (!caminhos.length) caminhos.push(departamento.nome);
      for (const caminho of caminhos) {
        const { departamento: id, secao } = classificar(caminho);
        if (id === "outros") semDepartamento.push(`${mercado.id}: ${caminho}`);
        else if (!secoesConhecidas(id).includes(secao)) semSecao.push(`${mercado.id}: ${caminho} → ${id} / ${secao}`);
      }
    }
  }
  assert.deepEqual(semDepartamento, ["bistek: Bistek"]);
  assert.deepEqual(semSecao.sort(), [
    "bistek: Bebidas > Étnicos → bebidas / Étnicos",
    "bistek: Mercearia > Cestas > Básica → mercearia / Cestas",
    "bistek: Mercearia > Cestas > Comemorativas → mercearia / Cestas",
  ]);
});

// Com o dado real do robô na máquina (fora do git), confere o resultado
// final do índice: quase nada em Outros e pouca coisa sem seção. Pega
// colisão de 4º nível e caminho novo sem precisar de fixture.
const pastaReal = new URL("../public/dados/", import.meta.url);
const temDadoReal = MERCADOS.every((m) => existsSync(new URL(`${m.id}.json`, pastaReal)));
test("dado real: menos de 2% em Outros e menos de 4% sem seção", { skip: !temDadoReal && "sem public/dados" }, () => {
  const catalogos = Object.fromEntries(MERCADOS.map((m) => [m.id, JSON.parse(readFileSync(new URL(`${m.id}.json`, pastaReal), "utf8"))]));
  const { grupos } = indexar(catalogos);
  const outros = grupos.filter((g) => g.departamento === "outros").length;
  const geral = grupos.filter((g) => g.secao === "Geral").length;
  assert.ok(outros / grupos.length < 0.02, `${outros} de ${grupos.length} em Outros`);
  assert.ok(geral / grupos.length < 0.04, `${geral} de ${grupos.length} sem seção`);
});
