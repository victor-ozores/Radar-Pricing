"""Contagem de dias úteis feita de propósito do jeito mais bobo possível, para conferir src/radar_pricing/prazo.py.

Anda dia a dia, e os feriados que seguem a Páscoa saem de uma tabela das datas da Páscoa de 2024 a 2080 (gerada uma vez com a
biblioteca dateutil e conferida com as datas oficiais; não é a fórmula do pacote), assim os
testes não repetem a conta do pacote.
"""

from __future__ import annotations

from datetime import date, timedelta

PASCOA = {
    2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28",
    2028: "2028-04-16", 2029: "2029-04-01", 2030: "2030-04-21", 2031: "2031-04-13",
    2032: "2032-03-28", 2033: "2033-04-17", 2034: "2034-04-09", 2035: "2035-03-25",
    2036: "2036-04-13", 2037: "2037-04-05", 2038: "2038-04-25", 2039: "2039-04-10",
    2040: "2040-04-01", 2041: "2041-04-21", 2042: "2042-04-06", 2043: "2043-03-29",
    2044: "2044-04-17", 2045: "2045-04-09", 2046: "2046-03-25", 2047: "2047-04-14",
    2048: "2048-04-05", 2049: "2049-04-18", 2050: "2050-04-10", 2051: "2051-04-02",
    2052: "2052-04-21", 2053: "2053-04-06", 2054: "2054-03-29", 2055: "2055-04-18",
    2056: "2056-04-02", 2057: "2057-04-22", 2058: "2058-04-14", 2059: "2059-03-30",
    2060: "2060-04-18", 2061: "2061-04-10", 2062: "2062-03-26", 2063: "2063-04-15",
    2064: "2064-04-06", 2065: "2065-03-29", 2066: "2066-04-11", 2067: "2067-04-03",
    2068: "2068-04-22", 2069: "2069-04-14", 2070: "2070-03-30", 2071: "2071-04-19",
    2072: "2072-04-10", 2073: "2073-03-26", 2074: "2074-04-15", 2075: "2075-04-07",
    2076: "2076-04-19", 2077: "2077-04-11", 2078: "2078-04-03", 2079: "2079-04-23",
    2080: "2080-04-07",
}  # fmt: skip
FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]


def feriados() -> set[date]:
    saida: set[date] = set()
    for ano, p in PASCOA.items():
        pascoa = date.fromisoformat(p)
        saida |= {pascoa - timedelta(days=48), pascoa - timedelta(days=47), pascoa - timedelta(days=2)}
        saida.add(pascoa + timedelta(days=60))
        saida |= {date.fromisoformat(f"{ano}-{f}") for f in FIXOS if f != "11-20" or ano >= 2024}
    return saida


FERIADOS = feriados()


def dias_uteis(de: date, ate: date) -> int:
    """Dias úteis em (de, ate]."""
    n = 0
    d = de + timedelta(days=1)
    while d <= ate:
        if d.weekday() < 5 and d not in FERIADOS:
            n += 1
        d += timedelta(days=1)
    return n


def anos_do_prazo(base: str, meses: int) -> float:
    """Anos de 252 dias úteis de `base` até o mesmo dia `meses` depois (mês curto: último dia dele)."""
    b = date.fromisoformat(base)
    total = b.year * 12 + b.month - 1 + meses
    ano, mes = total // 12, total % 12 + 1
    dia = b.day
    while True:  # recua até um dia que exista no mês
        try:
            destino = date(ano, mes, dia)
            break
        except ValueError:
            dia -= 1
    return dias_uteis(b, destino) / 252
