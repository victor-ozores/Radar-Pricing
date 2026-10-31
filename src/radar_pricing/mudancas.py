"""As "mudanças do dia": o que mexeu o bastante para o analista olhar primeiro. Sem Telegram: aparecem no
topo do painel e numa aba do Excel. Cada regra tem limiar no config.toml e devolve linhas em português."""

from __future__ import annotations

from typing import Any

from .config import ParamsMudancas
from .historico import revisoes
from .modelo import Registro, SituacaoFonte

ORDEM = {"alta": 0, "media": 1, "info": 2}


def pt(x: float, casas: int = 2) -> str:
    return f"{x:.{casas}f}".replace(".", ",")


def solto(x: float) -> str:
    """Número sem zeros inúteis e com vírgula decimal: -0.32 -> '-0,32'."""
    return f"{x:g}".replace(".", ",")


def sinal(x: float, casas: int = 2) -> str:
    return ("+" if x > 0 else "-" if x < 0 else "") + pt(abs(x), casas)


def _linha(regra: str, severidade: str, texto: str, **extra: Any) -> dict[str, Any]:
    return {"regra": regra, "severidade": severidade, "texto": texto, **extra}


def _maiores(candidatas: list[tuple[float, dict[str, Any]]], limite: int) -> list[dict[str, Any]]:
    """As `limite` linhas de maior |variação|."""
    return [linha for _, linha in sorted(candidatas, key=lambda c: -abs(c[0]))[:limite]]


def _rotulo_tesouro(dimensao: str) -> str:
    titulo, venc = dimensao.split("|")
    return f"{titulo.removeprefix('titulo=')} {venc.removeprefix('vencimento=')[:4]}"


def _regra_fontes(fontes: list[SituacaoFonte]) -> list[dict[str, Any]]:
    saida = []
    for f in fontes:
        if f.situacao == "ok":
            continue
        detalhe = f.erro or next(iter(f.falhas + f.atrasos), "")
        texto = f"Fonte {f.id} ({f.papel}): {f.situacao.upper()}" + (f" ({detalhe})" if detalhe else "")
        saida.append(_linha("fonte", "alta" if f.papel == "essencial" else "info", texto, fonte=f.id))
    return saida


def _regra_selic_meta(variacoes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for e in variacoes:
        v = e["variacoes"].get("7")
        if e["serie"] == "selic_meta" and v and abs(v["delta"]) > 1e-9:
            texto = (
                f"Meta Selic mudou: {pt(v['valor_ref'])}% para {pt(e['valor'])}% a.a. "
                f"({sinal(v['delta'])} p.p. em {v['dias']} dias)"
            )
            return [
                _linha(
                    "selic_meta", "alta", texto, serie="selic_meta", atual=e["valor"], anterior=v["valor_ref"]
                )
            ]
    return []


def _regra_tesouro(variacoes: list[dict[str, Any]], p: ParamsMudancas) -> list[dict[str, Any]]:
    """Cada família de título (Prefixado e IPCA+) tem o seu limite de linhas: uma não esconde a outra."""
    por_titulo: dict[str, list[tuple[float, dict[str, Any]]]] = {}
    for e in variacoes:
        v = e["variacoes"].get("7")
        titulo = e["dimensao"].split("|")[0]
        if (
            e["fonte"] != "tesouro"
            or not v
            or titulo not in ("titulo=Tesouro Prefixado", "titulo=Tesouro IPCA+")
        ):
            continue
        if abs(v["delta"]) >= p.tesouro_pp_7d - 1e-9:
            texto = (
                f"{_rotulo_tesouro(e['dimensao'])}: taxa {pt(e['valor'])}% a.a. "
                f"({sinal(v['delta'])} p.p. em {v['dias']} dias)"
            )
            linha = _linha(
                "tesouro", "media", texto, serie=e["serie"], dimensao=e["dimensao"], delta=v["delta"]
            )
            por_titulo.setdefault(titulo, []).append((v["delta"], linha))
    return [linha for candidatas in por_titulo.values() for linha in _maiores(candidatas, p.max_por_regra)]


def _regra_focus(variacoes: list[dict[str, Any]], p: ParamsMudancas) -> list[dict[str, Any]]:
    saida = []
    for serie, nome, limiar in (
        ("focus_selic_anual", "Selic", p.focus_selic_pp),
        ("focus_ipca_anual", "IPCA", p.focus_ipca_pp),
    ):
        candidatas = []
        for e in variacoes:
            v = e["variacoes"].get("7")
            if e["serie"] == serie and v and abs(v["delta"]) >= limiar - 1e-9:
                ano = e["dimensao"].removeprefix("ano=")
                texto = (
                    f"Focus: {nome} esperada para {ano} foi de {pt(v['valor_ref'])}% para {pt(e['valor'])}% "
                    f"({sinal(v['delta'])} p.p. em {v['dias']} dias)"
                )
                candidatas.append(
                    (
                        v["delta"],
                        _linha(
                            "focus", "media", texto, serie=serie, dimensao=e["dimensao"], delta=v["delta"]
                        ),
                    )
                )
        saida += _maiores(candidatas, p.max_por_regra)
    return saida


def _regra_financiamento(variacoes: list[dict[str, Any]], p: ParamsMudancas) -> list[dict[str, Any]]:
    saida = []
    for e in variacoes:
        if not e["serie"].startswith("mediana_taxa_financiamento"):
            continue
        v = next((e["variacoes"][k] for k in ("1", "7", "30") if e["variacoes"].get(k)), None)
        if v and abs(v["delta"]) >= p.financiamento_pp - 1e-9:
            texto = (
                f"{e['descricao']} ({e['n_bancos']} bancos): {pt(e['valor'])}% a.a. "
                f"({sinal(v['delta'])} p.p. em {v['dias']} dias)"
            )
            saida.append(_linha("financiamento", "media", texto, serie=e["serie"], delta=v["delta"]))
    return saida


def _situacao_anterior(anterior: dict[str, Any], fonte: str) -> dict[str, Any]:
    return next((f for f in anterior.get("fontes", []) if f["id"] == fonte), {})


def _regra_novo_trimestre(
    fontes: list[SituacaoFonte], setor: list[dict[str, Any]], anterior: dict[str, Any]
) -> list[dict[str, Any]]:
    hoje = next((f.extras.get("trimestre_mais_novo") for f in fontes if f.id == "bcb_panorama"), None)
    antes = _situacao_anterior(anterior, "bcb_panorama").get("extras", {}).get("trimestre_mais_novo")
    if not hoje or not antes or hoje == antes:
        return []
    partes = []
    for m in setor:
        if m["descricao"] in ("Índice de Exclusão - Total", "Índice de Inadimplência - Total"):
            nome = "exclusão total" if "Exclus" in m["descricao"] else "inadimplência"
            partes.append(f"{nome} {pt(m['valor'])}% ({sinal(m['delta'])} p.p. no trimestre)")
    detalhe = ": " + "; ".join(partes) if partes else ""
    return [
        _linha(
            "novo_trimestre", "info", f"BCB publicou o trimestre {hoje} do Panorama de Consórcios{detalhe}"
        )
    ]


def _regra_novo_boletim(
    fontes: list[SituacaoFonte], registros: list[Registro], anterior: dict[str, Any]
) -> list[dict[str, Any]]:
    boletins = next((f.extras.get("boletins", []) for f in fontes if f.id == "abac"), [])
    antes = _situacao_anterior(anterior, "abac").get("extras", {}).get("boletins", [])
    if not boletins or not antes or boletins[0]["titulo"] == antes[0]["titulo"]:
        return []
    obs = sorted((r.data_ref, r.valor) for r in registros if r.serie == "abac_participantes_ativos")
    detalhe = ""
    if obs:
        detalhe = f": {pt(obs[-1][1])} mi de participantes ativos"
        if len(obs) >= 2:
            detalhe += f" ({sinal(obs[-1][1] - obs[-2][1])} mi sobre o mês anterior)"
    return [
        _linha(
            "novo_boletim",
            "info",
            f"ABAC publicou o boletim '{boletins[0]['titulo']}'{detalhe}",
            link=boletins[0]["link"],
        )
    ]


def _regra_revisoes(
    registros: list[Registro], anterior: dict[str, Any], p: ParamsMudancas
) -> list[dict[str, Any]]:
    achadas = revisoes(registros, anterior)
    saida = []
    for r in achadas[: p.max_por_regra]:
        dim = f" ({r['dimensao']})" if r["dimensao"] else ""
        saida.append(
            _linha(
                "revisao", "media",
                f"Revisão de dado já publicado: {r['descricao']}{dim}, {r['data_ref']}: "
                f"{solto(r['antes'])} para {solto(r['depois'])} {r['unidade']}",
                serie=r["serie"],
            )
        )  # fmt: skip
    if len(achadas) > p.max_por_regra:
        saida.append(
            _linha(
                "revisao",
                "media",
                f"... e mais {len(achadas) - p.max_por_regra} revisões de dados já publicados",
            )
        )
    return saida


def detecta(
    fontes: list[SituacaoFonte],
    registros: list[Registro],
    derivados: dict[str, Any],
    conferencias: list[str],
    anterior: dict[str, Any] | None,
    p: ParamsMudancas,
) -> list[dict[str, Any]]:
    variacoes = derivados.get("variacoes", [])
    linhas = [
        *_regra_fontes(fontes),
        *_regra_selic_meta(variacoes),
        *_regra_tesouro(variacoes, p),
        *_regra_focus(variacoes, p),
        *_regra_financiamento(variacoes, p),
        *(_linha("conferencia", "media", c) for c in conferencias if c.startswith("ATENÇÃO")),
    ]
    if anterior is not None:
        linhas += _regra_revisoes(registros, anterior, p)
        linhas += _regra_novo_trimestre(fontes, derivados.get("setor", []), anterior)
        linhas += _regra_novo_boletim(fontes, registros, anterior)
    return sorted(linhas, key=lambda x: ORDEM[x["severidade"]])  # estável: mantém a ordem das regras
