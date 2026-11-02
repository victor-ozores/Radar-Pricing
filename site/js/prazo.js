// O prazo contado como o Tesouro conta: em dias úteis, base 252. É a mesma conta de src/radar_pricing/prazo.py
// (tests/test_site.py compara as duas, dia a dia), e o Excel refaz com NETWORKDAYS e EDATE (aba Prazos).
//
// A taxa de um título do Tesouro é "ao ano, base 252 dias úteis": o preço é 1000 / (1 + taxa) ** (dias úteis / 252). Os
// dias úteis vão do dia seguinte à data-base até o vencimento (a data-base não conta, o vencimento conta), sem fins de
// semana nem feriados nacionais. Com essa contagem o preço de um Tesouro Prefixado sai igual ao que o Tesouro publica.
//
// Feriados nacionais (os da lista da Anbima): os fixos, o Carnaval (segunda e terça), a Sexta-feira Santa e o Corpus
// Christi, que seguem a Páscoa, e o Dia da Consciência Negra, nacional desde 2024. Ponte e feriado só de banco não entram.

export const DIAS_UTEIS_NO_ANO = 252;
const FERIADOS_FIXOS = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25]];
const CONSCIENCIA_NEGRA_DESDE = 2024;
const MS_POR_DIA = 86_400_000;

/** "2026-10-30" -> número do dia (dias desde 01/01/1970). */
export function numeroDoDia(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / MS_POR_DIA;
}

/** O contrário: número do dia -> "2026-10-30". */
export const isoDoDia = (numero) => new Date(numero * MS_POR_DIA).toISOString().slice(0, 10);

/** Segunda = 0 ... domingo = 6 (01/01/1970 foi uma quinta). */
const diaDaSemana = (numero) => (((numero + 3) % 7) + 7) % 7;

/** Domingo de Páscoa (calendário gregoriano; algoritmo de Meeus/Jones/Butcher), como número do dia. */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA;
}

const feriadosGuardados = new Map();

/** Os feriados nacionais do ano, com o nome, em ordem de data: [{ dia: número do dia, nome }]. */
export function feriadosNomeados(ano) {
  let lista = feriadosGuardados.get(ano);
  if (!lista) {
    const p = pascoa(ano);
    const fixo = (mes, dia, nome) => ({ dia: Date.UTC(ano, mes - 1, dia) / MS_POR_DIA, nome });
    lista = [
      fixo(1, 1, "Confraternização Universal"),
      { dia: p - 48, nome: "Carnaval (segunda-feira)" },
      { dia: p - 47, nome: "Carnaval (terça-feira)" },
      { dia: p - 2, nome: "Sexta-feira Santa" },
      fixo(4, 21, "Tiradentes"),
      fixo(5, 1, "Dia do Trabalho"),
      { dia: p + 60, nome: "Corpus Christi" },
      fixo(9, 7, "Independência do Brasil"),
      fixo(10, 12, "Nossa Senhora Aparecida"),
      fixo(11, 2, "Finados"),
      fixo(11, 15, "Proclamação da República"),
      ...(ano >= CONSCIENCIA_NEGRA_DESDE ? [fixo(11, 20, "Dia da Consciência Negra")] : []),
      fixo(12, 25, "Natal"),
    ].sort((x, y) => x.dia - y.dia);
    feriadosGuardados.set(ano, lista);
  }
  return lista;
}

const conjuntosGuardados = new Map();

/** Os feriados nacionais do ano (inclusive os que caem no fim de semana), como números de dia. Dois feriados no mesmo dia
 *  (a Sexta-feira Santa cai em 21/04, o Dia de Tiradentes, em 2079) contam uma vez só. */
export function feriadosDoAno(ano) {
  let conjunto = conjuntosGuardados.get(ano);
  if (!conjunto) {
    conjunto = new Set(feriadosNomeados(ano).map((f) => f.dia));
    conjuntosGuardados.set(ano, conjunto);
  }
  return conjunto;
}

/** Dias úteis em (de, ate], datas AAAA-MM-DD: a primeira não conta, a segunda conta. Zero se `ate` não passa de `de`. */
export function diasUteis(de, ate) {
  const inicio = numeroDoDia(de);
  const fim = numeroDoDia(ate);
  if (!(fim > inicio)) return 0;
  const dias = fim - inicio;
  const semanas = Math.floor(dias / 7);
  let uteis = 5 * semanas;
  const primeiro = inicio + 1 + 7 * semanas; // o resto da última semana incompleta
  for (let k = 0; k < dias % 7; k++) if (diaDaSemana(primeiro + k) < 5) uteis++;
  for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    for (const dia of feriadosDoAno(ano)) if (dia > inicio && dia <= fim && diaDaSemana(dia) < 5) uteis--;
  }
  return uteis;
}

/** O mesmo dia `meses` depois; se o mês de chegada é mais curto, o último dia dele (como o EDATE do Excel). */
export function somaMeses(iso, meses) {
  const [a, m, d] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12; // 0 a 11
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${String(ano).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

const guardados = new Map();

/** Dias úteis da data-base até o mesmo dia `meses` depois (meses inteiros). */
export function diasUteisDoPrazo(base, meses) {
  const chave = `${base}|${meses}`;
  let n = guardados.get(chave);
  if (n === undefined) {
    n = diasUteis(base, somaMeses(base, meses));
    guardados.set(chave, n);
  }
  return n;
}

/** Dias úteis em anos de 252 dias úteis: o expoente do desconto. */
export const anosUteis = (dias) => dias / DIAS_UTEIS_NO_ANO;

/** Anos de 252 dias úteis da data-base até o vencimento. */
export const anosAteOVencimento = (base, vencimento) => anosUteis(diasUteis(base, vencimento));

/** Todos os feriados nacionais de um intervalo de anos, em ordem: [{ data: AAAA-MM-DD, nome }] (a aba Feriados do Excel os lista). */
export function listaDeFeriados(anoInicial, anoFinal) {
  const saida = [];
  for (let ano = anoInicial; ano <= anoFinal; ano++) saida.push(...feriadosNomeados(ano).map((f) => ({ data: isoDoDia(f.dia), nome: f.nome })));
  return saida;
}
