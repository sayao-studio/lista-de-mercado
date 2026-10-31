// Os três mercados que o site compara. `ignorar` usa o nome exato do
// departamento na árvore de cada loja: ficam de fora os que não são compra de
// mercado (eletro, roupa, casa, brinquedo…), porque não interessam na lista e
// sozinhos estourariam o orçamento de 3 MB comprimidos que o celular baixa.
export const MERCADOS = [
  {
    id: "bistek",
    nome: "Bistek",
    site: "https://www.bistek.com.br",
    ignorar: ["Bazar", "Floricultura e Jardim"],
  },
  {
    id: "giassi",
    nome: "Giassi",
    site: "https://www.giassi.com.br",
    ignorar: ["Eletrônicos", "Vestuário", "Ferramentas", "Lazer", "Papelaria", "Casa", "Festa", "Brinquedos", "Utensílios"],
  },
  {
    id: "angeloni",
    nome: "Angeloni",
    site: "https://super.angeloni.com.br",
    ignorar: ["Z: Category", "Bazar", "Cama e Banho", "Eletro", "Esporte e Lazer", "Utilidades Domésticas", "Decoração", "Cestas e Kits"],
  },
];
