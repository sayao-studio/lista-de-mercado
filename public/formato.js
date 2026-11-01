// Formatação pra tela, em português. Funciona no navegador e no Node (sem imports).

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quilos = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

// O Intl põe um espaço sem quebra (U+00A0 ou U+202F) depois do R$; trocamos
// por espaço comum pra o texto ficar igual em qualquer navegador e fácil de comparar.
export function reais(centavos) {
  return moeda.format(centavos / 100).replace(/[  ]/g, " ");
}

// Líquido chega do robô em "gramas" equivalentes (1 ml = 1 g): só a unidade
// mostrada muda, pra leite não aparecer como "1 kg".
export function peso(gramas, liquido = false) {
  if (!gramas) return "";
  if (gramas < 1000) return `${Math.round(gramas)} ${liquido ? "ml" : "g"}`;
  return `${quilos.format(gramas / 1000)} ${liquido ? "l" : "kg"}`;
}

const doisDigitos = (n) => String(n).padStart(2, "0");

// Hora sem zero à esquerda ("9h05", "18h"): é como se fala, e economiza espaço no celular.
function horaCurta(data) {
  const minutos = data.getMinutes();
  return minutos === 0
    ? `${data.getHours()}h`
    : `${data.getHours()}h${doisDigitos(minutos)}`;
}

// Compara dias do calendário no fuso local (o do navegador), não diferença de 24 h:
// 23h30 de ontem tem que continuar sendo "ontem" mesmo a poucas horas de distância.
export function quandoFoi(iso, agora) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";

  const diaDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Math.round porque a virada do horário de verão faz o dia ter 23 ou 25 h.
  const dias = Math.round((diaDe(agora) - diaDe(data)) / 86400000);

  const hora = horaCurta(data);
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `ontem ${hora}`;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} ${hora}`;
}

// "2026-11-02" → "02/11": validade de encarte, sem ano (é sempre desta semana).
export function diaMes(iso) {
  const m = /^\d{4}-(\d\d)-(\d\d)/.exec(String(iso ?? ""));
  return m ? `${m[2]}/${m[1]}` : "";
}
