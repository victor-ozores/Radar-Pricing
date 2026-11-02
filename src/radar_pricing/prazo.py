"""O prazo de um título ou de um valor a receber, contado como o Tesouro conta: em dias úteis, base 252.

O Tesouro cota a taxa de um título "ao ano, base 252 dias úteis": o preço é
1000 / (1 + taxa) ** (dias úteis / 252). Os dias úteis vão do dia seguinte à data-base até o vencimento (a
data-base não conta, o vencimento conta), sem fins de semana nem feriados nacionais. Com essa contagem o
preço de um Tesouro Prefixado sai igual ao que o Tesouro publica (testado em 30/10/2026: erro de 0,001%,
tests/test_prazo.py).

Feriados nacionais (os mesmos da lista da Anbima): os fixos, o Carnaval (segunda e terça), a Sexta-feira
Santa e o Corpus Christi, que seguem a Páscoa, e o Dia da Consciência Negra, nacional desde 2024. Não conto
ponte nem feriado só de banco: o mercado às vezes os usa, e o efeito é de um dia em 252.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from functools import cache

DIAS_UTEIS_NO_ANO = 252
FERIADOS_FIXOS = ((1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (12, 25))
CONSCIENCIA_NEGRA_DESDE = 2024


def pascoa(ano: int) -> date:
    """Domingo de Páscoa (calendário gregoriano; algoritmo de Meeus/Jones/Butcher)."""
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    mes = (h + el - 7 * m + 114) // 31
    dia = (h + el - 7 * m + 114) % 31 + 1
    return date(ano, mes, dia)


@cache
def feriados_do_ano(ano: int) -> frozenset[date]:
    """Os feriados nacionais do ano (inclusive os que caem no fim de semana)."""
    p = pascoa(ano)
    lista = {date(ano, m, d) for m, d in FERIADOS_FIXOS}
    if ano >= CONSCIENCIA_NEGRA_DESDE:
        lista.add(date(ano, 11, 20))
    lista |= {p - timedelta(days=48), p - timedelta(days=47), p - timedelta(days=2), p + timedelta(days=60)}
    return frozenset(lista)


def dias_uteis(de: date, ate: date) -> int:
    """Dias úteis em (de, ate]: a primeira data não conta, a segunda conta. Zero se `ate` <= `de`."""
    if ate <= de:
        return 0
    dias = (ate - de).days
    uteis = 5 * (dias // 7)
    primeiro = de + timedelta(days=1 + 7 * (dias // 7))  # o resto da última semana incompleta
    uteis += sum(1 for k in range(dias % 7) if (primeiro + timedelta(days=k)).weekday() < 5)
    for ano in range(de.year, ate.year + 1):
        uteis -= sum(1 for f in feriados_do_ano(ano) if de < f <= ate and f.weekday() < 5)
    return uteis


def soma_meses(d: date, meses: int) -> date:
    """O mesmo dia `meses` depois; mês de chegada mais curto: o último dia dele (como o EDATE do Excel)."""
    total = d.year * 12 + (d.month - 1) + meses
    ano, mes = divmod(total, 12)
    return date(ano, mes + 1, min(d.day, calendar.monthrange(ano, mes + 1)[1]))


def dias_uteis_do_prazo(base: date, meses: int) -> int:
    """Dias úteis de hoje (a data-base da curva) até o mesmo dia `meses` depois."""
    return dias_uteis(base, soma_meses(base, meses))


def anos_uteis(dias: int) -> float:
    """Dias úteis em anos de 252 dias úteis, o expoente do desconto."""
    return dias / DIAS_UTEIS_NO_ANO
