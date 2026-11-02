// Contagem de dias úteis feita do jeito mais bobo possível, para conferir js/prazo.js sem repetir a conta dele: anda dia a
// dia, e os feriados que seguem a Páscoa saem de uma tabela das datas da Páscoa (não da fórmula).

export const PASCOA = {
  2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28", 2028: "2028-04-16", 2029: "2029-04-01",
  2030: "2030-04-21", 2031: "2031-04-13", 2032: "2032-03-28", 2033: "2033-04-17", 2034: "2034-04-09", 2035: "2035-03-25",
  2036: "2036-04-13", 2037: "2037-04-05", 2038: "2038-04-25", 2039: "2039-04-10", 2040: "2040-04-01", 2041: "2041-04-21",
  2042: "2042-04-06", 2043: "2043-03-29", 2044: "2044-04-17", 2045: "2045-04-09", 2046: "2046-03-25", 2047: "2047-04-14",
  2048: "2048-04-05", 2049: "2049-04-18", 2050: "2050-04-10", 2051: "2051-04-02", 2052: "2052-04-21", 2053: "2053-04-06",
  2054: "2054-03-29", 2055: "2055-04-18", 2056: "2056-04-02", 2057: "2057-04-22", 2058: "2058-04-14", 2059: "2059-03-30",
  2060: "2060-04-18", 2061: "2061-04-10", 2062: "2062-03-26", 2063: "2063-04-15", 2064: "2064-04-06", 2065: "2065-03-29",
  2066: "2066-04-11", 2067: "2067-04-03", 2068: "2068-04-22", 2069: "2069-04-14", 2070: "2070-03-30", 2071: "2071-04-19",
  2072: "2072-04-10", 2073: "2073-03-26", 2074: "2074-04-15", 2075: "2075-04-07", 2076: "2076-04-19", 2077: "2077-04-11",
  2078: "2078-04-03", 2079: "2079-04-23", 2080: "2080-04-07",
};

const MS = 86_400_000;
const numero = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / MS;

const FERIADOS = new Set();
for (const [ano, p] of Object.entries(PASCOA)) {
  const n = numero(p);
  for (const k of [-48, -47, -2, 60]) FERIADOS.add(n + k);
  for (const f of ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25", ...(Number(ano) >= 2024 ? ["11-20"] : [])]) FERIADOS.add(numero(`${ano}-${f}`));
}

/** Dias úteis em (de, ate], contados um a um. */
export function diasUteisIngenuo(de, ate) {
  let n = 0;
  for (let d = numero(de) + 1; d <= numero(ate); d++) {
    const dow = (((d + 3) % 7) + 7) % 7; // segunda = 0
    if (dow < 5 && !FERIADOS.has(d)) n++;
  }
  return n;
}

/** O mesmo dia `meses` depois (mês curto: o último dia dele). */
export function somaMesesIngenuo(iso, meses) {
  const total = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  for (let dia = Number(iso.slice(8, 10)); dia >= 1; dia--) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() === mes - 1) return d.toISOString().slice(0, 10);
  }
  throw new Error("data inválida");
}

/** Os anos de 252 dias úteis de `base` até o mesmo dia `meses` depois. */
export const anosDoPrazoIngenuo = (base, meses) => diasUteisIngenuo(base, somaMesesIngenuo(base, meses)) / 252;
