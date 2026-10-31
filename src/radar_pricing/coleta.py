"""Roda os coletores (cada um isolado dos outros) e monta a foto do dia com o manifesto de qualidade."""

from __future__ import annotations

import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from typing import Any

from . import derivados as contas
from . import mudancas as regras
from .config import ParamsDerivados, ParamsMudancas
from .fontes import COLETORES, Coletor
from .modelo import Foto, Registro, SituacaoFonte

TOLERANCIA_IPCA = 0.011  # o IBGE e o BCB arredondam em duas casas: diferença maior que isso é problema


def _roda_uma(
    id_: str, coletor: Coletor, cli: Any, hoje: date, papel: str
) -> tuple[SituacaoFonte, list[Registro]]:
    t0 = time.perf_counter()
    try:
        res = coletor(cli, hoje)
    except Exception as e:  # uma fonte nunca derruba as outras, qualquer que seja o erro
        erro = f"{type(e).__name__}: {e}"[:300]
        return SituacaoFonte(id_, papel, "falhou", 0, None, None, time.perf_counter() - t0, erro=erro), []
    tempo = time.perf_counter() - t0
    ultimo = max((r.data_ref for r in res.registros), default=None)
    idade = (hoje - ultimo).days if ultimo else None
    if not res.registros:
        situacao, erro = "falhou", "; ".join(res.falhas) or "nenhum registro"
    else:
        erro = None
        situacao = "parcial" if res.falhas else "atrasado" if res.atrasos else "ok"
    sit = SituacaoFonte(
        id_,
        papel,
        situacao,
        len(res.registros),
        ultimo,
        idade,
        tempo,
        erro,
        res.avisos,
        res.atrasos,
        res.falhas,
        res.extras,
    )
    return sit, res.registros


def conferencias(registros: list[Registro]) -> list[str]:
    """Conferências entre fontes e sanidade do conjunto. Cada linha é um achado, bom ou ruim, em português."""
    achados: list[str] = []
    ibge = {r.data_ref: r.valor for r in registros if r.serie == "ibge_ipca_mensal"}
    bcb = {r.data_ref: r.valor for r in registros if r.serie == "ipca_mensal"}
    for mes in sorted(set(ibge) & set(bcb)):
        if abs(ibge[mes] - bcb[mes]) <= TOLERANCIA_IPCA:
            achados.append(
                f"IPCA de {mes:%m/%Y} confere: IBGE {regras.pt(ibge[mes])}% = BCB {regras.pt(bcb[mes])}%"
            )
        else:
            achados.append(
                f"ATENÇÃO: IPCA de {mes:%m/%Y} difere: "
                f"IBGE {regras.pt(ibge[mes])}% x BCB {regras.pt(bcb[mes])}%"
            )
    chaves = Counter((r.fonte, r.serie, r.dimensao, r.data_ref) for r in registros)
    repetidas = sum(1 for n in chaves.values() if n > 1)
    if repetidas:
        achados.append(f"ATENÇÃO: {repetidas} observação(ões) repetida(s) (mesma série, dimensão e data)")
    return achados


def coletar_tudo(
    cli: Any,
    hoje: date,
    agora: datetime,
    papeis: dict[str, str],
    coletores: dict[str, Coletor] | None = None,
    so: list[str] | None = None,
    paralelo: bool = True,
    derivados: ParamsDerivados | None = None,
    mudancas: ParamsMudancas | None = None,
    anterior: dict[str, Any] | None = None,
) -> Foto:
    coletores = coletores if coletores is not None else COLETORES
    ids = [i for i in papeis if i in coletores and (not so or i in so)]
    if not ids:
        raise ValueError("nenhuma fonte para rodar (confira o config.toml e --fontes)")
    tarefas = [(i, coletores[i], papeis[i]) for i in ids]
    if paralelo:
        with ThreadPoolExecutor(max_workers=4) as pool:
            saidas = list(pool.map(lambda t: _roda_uma(t[0], t[1], cli, hoje, t[2]), tarefas))
    else:
        saidas = [_roda_uma(i, c, cli, hoje, p) for i, c, p in tarefas]
    fontes = [s for s, _ in saidas]
    registros = sorted(
        (r for _, regs in saidas for r in regs), key=lambda r: (r.fonte, r.serie, r.dimensao, r.data_ref)
    )
    essenciais_ok = all(s.situacao == "ok" for s in fontes if s.papel == "essencial")
    achados = conferencias(registros)
    calculados = contas.calcula(registros, derivados) if derivados is not None else {}
    do_dia = (
        regras.detecta(fontes, registros, calculados, achados, anterior, mudancas)
        if derivados is not None and mudancas is not None
        else []
    )
    return Foto(
        data=hoje,
        gerado_em=agora.isoformat(),
        status="ok" if essenciais_ok else "parcial",
        fontes=fontes,
        conferencias=achados,
        registros=registros,
        derivados=calculados,
        mudancas=do_dia,
    )
