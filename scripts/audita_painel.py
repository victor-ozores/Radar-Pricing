"""Auditoria independente dos números do painel.

Refaz, só com Python e só com os registros brutos de uma foto, as contas que o painel mostra (curvas do
Tesouro, manchete, impacto em 7 dias, sensibilidade, Selic e CDI, Focus, crédito, setor, ABAC e os exemplos
das calculadoras) e compara com o que o JavaScript do painel calculou. Não usa nenhum código do projeto: o
objetivo é que um erro numa das duas pontas apareça como divergência.

Uso: python scripts/audita_painel.py <foto.json>   (sai com código 1 se algum número divergir)
"""

from __future__ import annotations

import json
import shutil
import statistics
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from itertools import pairwise
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# O prazo, como o Tesouro conta: dias úteis (segunda a sexta, sem feriados nacionais) do dia seguinte à
# data-base até o vencimento, divididos por 252. A contagem é feita dia a dia e os feriados que seguem a
# Páscoa saem desta tabela (as datas oficiais da Páscoa), não da fórmula do robô.
PASCOA = {
    2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28", 2028: "2028-04-16",
    2029: "2029-04-01", 2030: "2030-04-21", 2031: "2031-04-13", 2032: "2032-03-28", 2033: "2033-04-17",
    2034: "2034-04-09", 2035: "2035-03-25", 2036: "2036-04-13", 2037: "2037-04-05", 2038: "2038-04-25",
    2039: "2039-04-10", 2040: "2040-04-01", 2041: "2041-04-21", 2042: "2042-04-06", 2043: "2043-03-29",
    2044: "2044-04-17", 2045: "2045-04-09", 2046: "2046-03-25", 2047: "2047-04-14", 2048: "2048-04-05",
    2049: "2049-04-18", 2050: "2050-04-10", 2051: "2051-04-02", 2052: "2052-04-21", 2053: "2053-04-06",
    2054: "2054-03-29", 2055: "2055-04-18", 2056: "2056-04-02", 2057: "2057-04-22", 2058: "2058-04-14",
    2059: "2059-03-30", 2060: "2060-04-18", 2061: "2061-04-10", 2062: "2062-03-26", 2063: "2063-04-15",
    2064: "2064-04-06", 2065: "2065-03-29", 2066: "2066-04-11", 2067: "2067-04-03", 2068: "2068-04-22",
    2069: "2069-04-14", 2070: "2070-03-30", 2071: "2071-04-19", 2072: "2072-04-10", 2073: "2073-03-26",
    2074: "2074-04-15", 2075: "2075-04-07", 2076: "2076-04-19", 2077: "2077-04-11", 2078: "2078-04-03",
    2079: "2079-04-23", 2080: "2080-04-07",
}  # fmt: skip


def _feriados() -> set[date]:
    saida: set[date] = set()
    for ano, p in PASCOA.items():
        pascoa = date.fromisoformat(p)
        saida |= {pascoa + timedelta(days=k) for k in (-48, -47, -2, 60)}
        fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"] + (
            ["11-20"] if ano >= 2024 else []
        )
        saida |= {date.fromisoformat(f"{ano}-{f}") for f in fixos}
    return saida


FERIADOS = _feriados()


def dias_uteis(de: str, ate: str) -> int:
    """Dias úteis em (de, ate], contados um a um."""
    n, d, fim = 0, date.fromisoformat(de) + timedelta(days=1), date.fromisoformat(ate)
    while d <= fim:
        n += d.weekday() < 5 and d not in FERIADOS
        d += timedelta(days=1)
    return n


def soma_meses(iso: str, meses: int) -> str:
    """O mesmo dia `meses` depois; mês de chegada mais curto: o último dia dele."""
    b = date.fromisoformat(iso)
    total = b.year * 12 + b.month - 1 + meses
    ano, mes = total // 12, total % 12 + 1
    for dia in range(b.day, 0, -1):
        try:
            return date(ano, mes, dia).isoformat()
        except ValueError:
            continue
    raise AssertionError("data inválida")


def anos_do_prazo(base: str, meses: int) -> float:
    return dias_uteis(base, soma_meses(base, meses)) / 252


class Auditoria:
    def __init__(self, foto: dict, painel: dict) -> None:
        self.foto = foto
        self.js = painel
        self.registros = foto["registros"]
        self.bases: dict[str, str] = {}  # a data-base de cada curva (título -> data), preenchida em curva()
        self.conferidos = 0
        self.divergencias: list[tuple[str, str, object, object]] = []

    def confere(self, area: str, rotulo: str, esperado: object, obtido: object, tol: float = 1e-9) -> None:
        self.conferidos += 1
        if isinstance(esperado, int | float) and isinstance(obtido, int | float):
            ok = abs(esperado - obtido) <= max(tol, 1e-9 * abs(esperado))
        else:
            ok = esperado == obtido
        if not ok:
            self.divergencias.append((area, rotulo, esperado, obtido))

    # ------------------------------------------------------------------------------------ ferramentas
    def serie(self, fonte: str, nome: str, dimensao: str | None = None) -> list[tuple[str, float]]:
        return sorted(
            (r["data_ref"], r["valor"])
            for r in self.registros
            if r["fonte"] == fonte and r["serie"] == nome and (dimensao is None or r["dimensao"] == dimensao)
        )

    @staticmethod
    def valor_ate(pontos: list[tuple[str, float]], alvo: str) -> tuple[str, float] | None:
        """O valor na data mais recente que não passa de `alvo`."""
        candidatos = [p for p in pontos if p[0] <= alvo]
        return candidatos[-1] if candidatos else None

    def variacao(self, pontos: list[tuple[str, float]], dias: int) -> tuple[float, float] | None:
        ultima_data, ultimo = pontos[-1]
        alvo = (date.fromisoformat(ultima_data) - timedelta(days=dias)).isoformat()
        ref = self.valor_ate(pontos, alvo)
        return None if ref is None or ref[0] == ultima_data else (ultimo - ref[1], ref[1])

    @staticmethod
    def interpola(pontos: list[tuple[float, float]], anos: float) -> float:
        if anos <= pontos[0][0]:
            return pontos[0][1]
        if anos >= pontos[-1][0]:
            return pontos[-1][1]
        for (a1, t1), (a2, t2) in pairwise(pontos):
            if a1 <= anos <= a2:
                return t1 + (anos - a1) / (a2 - a1) * (t2 - t1)
        raise AssertionError("prazo dentro da curva sem par de vencimentos")

    # ------------------------------------------------------------------------------------ Tesouro
    def titulos(self) -> dict[tuple[str, str], list[tuple[str, float]]]:
        saida: dict[tuple[str, str], list[tuple[str, float]]] = {}
        for r in self.registros:
            if r["fonte"] == "tesouro":
                titulo, vencimento = r["dimensao"].split("|")
                chave = (titulo.split("=")[1], vencimento.split("=")[1])
                saida.setdefault(chave, []).append((r["data_ref"], r["valor"]))
        return {k: sorted(v) for k, v in saida.items()}

    def curva(self, nome: str, dias_antes: int = 0) -> list[tuple[float, float]]:
        titulos = self.titulos()
        base = max(d for (t, _), pts in titulos.items() if t == nome for d, _ in pts)
        self.bases[nome] = base
        alvo = (date.fromisoformat(base) - timedelta(days=dias_antes)).isoformat()
        pontos = []
        for (t, vencimento), pts in titulos.items():
            valor = self.valor_ate(pts, alvo)
            anos = dias_uteis(base, vencimento) / 252
            if t == nome and valor and anos > 0:
                pontos.append((anos, valor[1]))
        return sorted(pontos)

    def anos(self, nome: str, meses: int) -> float:
        """O prazo de `meses` na curva do título `nome`, em anos de 252 dias úteis, da data-base dela."""
        self.curva(nome)  # garante a data-base
        return anos_do_prazo(self.bases[nome], meses)

    def tesouro(self) -> None:
        titulos = self.titulos()
        for c in self.js["curvas"]:
            for p in c["pontos"]:
                pts = titulos[(c["titulo"], p["vencimento"])]
                rotulo = f"{c['titulo']} {p['vencimento']}"
                self.confere("tesouro", f"{rotulo} taxa", pts[-1][1], p["taxa"])
                for dias, chave in ((1, "d1"), (7, "d7"), (30, "d30")):
                    v = self.variacao(pts, dias)
                    self.confere("tesouro", f"{rotulo} {chave}", None if v is None else v[0], p[chave])
                v7 = self.variacao(pts, 7)
                if v7:
                    self.confere("tesouro", f"{rotulo} taxa de 7 dias atrás", v7[1], p["ref7"])

    def impacto_e_sensibilidade(self) -> None:
        par = self.foto["derivados"]["parametros"]
        spread, face, prazos = par["spread_demonstracao_pp"], par["valor_face"], par["prazos_meses"]
        nomes = {"nominal": "Tesouro Prefixado", "real": "Tesouro IPCA+"}
        for chave, nome in nomes.items():
            hoje_pts, antes_pts = self.curva(nome), self.curva(nome, 7)
            for i, meses in enumerate(prazos):
                anos = self.anos(nome, meses)
                taxa_h, taxa_a = self.interpola(hoje_pts, anos), self.interpola(antes_pts, anos)
                vp_h = face / (1 + (taxa_h + spread) / 100) ** anos
                vp_a = face / (1 + (taxa_a + spread) / 100) ** anos
                imp = self.js["impacto"][chave][i]
                rotulo = f"{chave} {meses}m"
                self.confere("impacto", f"{rotulo} taxa hoje", taxa_h, imp["taxa_hoje"])
                self.confere("impacto", f"{rotulo} taxa 7 dias", taxa_a, imp["taxa_antes"])
                self.confere("impacto", f"{rotulo} valor hoje", vp_h, imp["vp_hoje"])
                self.confere("impacto", f"{rotulo} valor 7 dias", vp_a, imp["vp_antes"])
                self.confere("impacto", f"{rotulo} variação", (vp_h / vp_a - 1) * 100, imp["variacao_pct"])
                linha = self.js["sensibilidade"][chave][i]
                self.confere("sensibilidade", f"{rotulo} base", vp_h, linha["base"])
                for cel in linha["celulas"]:
                    v = face / (1 + max(0, taxa_h + spread + cel["choque"]) / 100) ** anos
                    self.confere("sensibilidade", f"{rotulo} choque {cel['choque']}", v, cel["valor"])
                    self.confere(
                        "sensibilidade",
                        f"{rotulo} choque {cel['choque']} (%)",
                        (v / vp_h - 1) * 100,
                        cel["variacao_pct"],
                    )
        # a manchete: variação do valor de R$ 1.000 em 3 anos, escrita com uma casa
        var3 = self.js["impacto"]["nominal"][prazos.index(36)]["variacao_pct"]
        sentido = "menos" if var3 < 0 else "mais"
        self.confere(
            "manchete",
            "texto do destaque",
            f"{abs(var3):.1f}".replace(".", ",") + f"% {sentido}",
            self.js["manchete"]["destaque"],
        )
        linha36 = next(x for x in self.foto["derivados"]["valor_presente"] if x["meses"] == 36)
        for chave, nome in nomes.items():
            ancora = self.interpola(self.curva(nome), self.anos(nome, 36))
            if "dias_uteis" in linha36[chave]:  # foto feita depois da contagem em dias úteis
                self.confere(
                    "âncora",
                    f"{chave} 36 meses (dias úteis, tabela do robô)",
                    self.anos(nome, 36) * 252,
                    linha36[chave]["dias_uteis"],
                )
                self.confere(
                    "âncora",
                    f"{chave} 36 meses (tabela do robô)",
                    ancora,
                    linha36[chave]["taxa_ancora"],
                    tol=6e-5,
                )
            else:  # foto antiga, de antes da troca: o robô contava dias corridos ÷ 365,25 e meses ÷ 12
                base = date.fromisoformat(self.bases[nome])
                antiga = self.interpola(
                    [
                        ((date.fromisoformat(v) - base).days / 365.25, pts[-1][1])
                        for (t, v), pts in sorted(self.titulos().items(), key=lambda kv: kv[0][1])
                        if t == nome and date.fromisoformat(v) > base
                    ],
                    3,
                )
                self.confere(
                    "âncora",
                    f"{chave} 36 meses (tabela do robô, foto no formato antigo)",
                    antiga,
                    linha36[chave]["taxa_ancora"],
                    tol=6e-5,
                )
            self.confere(
                "âncora", f"{chave} 36 meses (série do painel)", ancora, self.js["ancora36"][chave]["valor"]
            )

    # -------------------------------------------------------------------------- Selic, CDI, IPCA, Focus
    def juros_e_inflacao(self) -> None:
        hoje = self.foto["data"]
        meta = [(d, v) for d, v in self.serie("bcb_sgs", "selic_meta") if d <= hoje]
        m = next(x for x in self.js["manchetes"] if x["id"] == "selic_meta")
        self.confere("selic", "meta de hoje", meta[-1][1], m["valor"])
        self.confere("selic", "meta: variação em 7 dias", self.variacao(meta, 7)[0], m["delta7"]["delta"])
        cdi_aa = ((1 + self.serie("bcb_sgs", "cdi")[-1][1] / 100) ** 252 - 1) * 100
        self.confere("cdi", "anualizado (cartão)", cdi_aa, self.js["cdi"], tol=0.005)  # o robô guarda 4 casas
        self.confere("cdi", "anualizado (série do painel)", cdi_aa, self.js["cdiNoTempo"]["cdi"])
        ipca = next(x for x in self.js["manchetes"] if x["id"] == "ipca_12m")
        self.confere("ipca", "12 meses", self.serie("bcb_sgs", "ipca_12_meses")[-1][1], ipca["valor"])
        for tipo, nome in (("selic", "focus_selic_anual"), ("ipca", "focus_ipca_anual")):
            for item in self.js["focus"][tipo]:
                pts = self.serie("bcb_focus", nome, f"ano={item['ano']}")
                self.confere("focus", f"{tipo} {item['ano']} valor", pts[-1][1], item["valor"])
                for dias, chave in ((7, "d7"), (30, "d30")):
                    v = self.variacao(pts, dias)
                    obtido = None if item[chave] is None else item[chave]["delta"]
                    self.confere(
                        "focus", f"{tipo} {item['ano']} {chave}", None if v is None else v[0], obtido
                    )

    # ------------------------------------------------------------------------------------ crédito
    def credito(self) -> None:
        for chave, nome in (
            ("veiculos", "taxa_financiamento_veiculos"),
            ("imobiliario", "taxa_financiamento_imobiliario"),
        ):
            por_data: dict[str, list[float]] = {}
            for r in self.registros:
                if r["serie"] == nome:
                    por_data.setdefault(r["data_ref"], []).append(r["valor"])
            datas = sorted(por_data)
            taxas = sorted(por_data[datas[-1]])
            q1, mediana, q3 = statistics.quantiles(taxas, n=4, method="inclusive")
            c = self.js["creditos"][chave]
            esperado = {"menor": taxas[0], "p25": q1, "mediana": mediana, "p75": q3, "maior": taxas[-1]}
            for campo, valor in esperado.items():
                self.confere("crédito", f"{chave} {campo}", valor, c["resumo"][campo])
            self.confere("crédito", f"{chave} nº de bancos", len(taxas), c["n"])
            if chave == "veiculos":
                alvo = (date.fromisoformat(datas[-1]) - timedelta(days=7)).isoformat()
                ref = max(d for d in datas if d <= alvo)
            else:
                ref = datas[-2]
            self.confere(
                "crédito",
                f"{chave} mediana anterior",
                statistics.median(por_data[ref]),
                c["anterior"]["mediana"],
            )

    # ------------------------------------------------------------------------------------ setor
    def setor(self) -> None:
        panorama: dict[str, list[tuple[str, float, str]]] = {}
        for r in self.registros:
            if r["fonte"] == "bcb_panorama":
                panorama.setdefault(r["serie"], []).append((r["data_ref"], r["valor"], r["descricao"]))
        mostrado = {x["serie"]: x for x in self.js["panorama"]}
        self.confere("setor", "nº de métricas do Panorama", len(panorama), len(mostrado))
        for serie, pts in panorama.items():
            pts.sort()
            (_, anterior, _), (_, valor, _) = pts[-2], pts[-1]
            x = mostrado[serie]
            self.confere("setor", f"{serie} valor", valor, x["valor"])
            self.confere("setor", f"{serie} variação", valor - anterior, x["delta"], tol=1e-6)
        por_descricao = {pts[-1][2]: serie for serie, pts in panorama.items()}
        ativas = panorama[por_descricao["Cotas ativas - Total"]][-1][1]
        excluidas = panorama[por_descricao["Cotas excluídas - Total"]][-1][1]
        publicado = panorama[por_descricao["Índice de Exclusão - Total"]][-1][1]
        self.confere(
            "setor",
            "índice de exclusão: conta do painel",
            excluidas / (ativas + excluidas) * 100,
            self.js["cotas"]["calculado"],
        )
        self.confere(
            "setor",
            "índice de exclusão: o que o Banco Central publica",
            publicado,
            self.js["cotas"]["calculado"],
            tol=0.05,
        )
        serie_excluidas = panorama[por_descricao["Cotas excluídas - Total"]]
        novas = serie_excluidas[-1][1] - serie_excluidas[-2][1]
        self.confere(
            "setor",
            "segmentos somam as excluídas do trimestre",
            novas,
            sum(s["delta"] for s in self.js["cotas"]["porSegmento"]),
            tol=0.1,
        )
        for a in self.js["abac"]:
            pts = self.serie("abac", a["serie"])
            self.confere("abac", f"{a['serie']} último", pts[-1][1], a["ultimo"]["valor"])
            self.confere("abac", f"{a['serie']} variação no mês", pts[-1][1] - pts[-2][1], a["delta"])

    # ------------------------------------------------------------------------------------ calculadoras
    def calculadoras(self) -> None:
        spread = self.js["spread"]
        real = self.curva("Tesouro IPCA+")
        ex = self.js["exemplos"]
        a24 = self.anos("Tesouro IPCA+", 24)
        ancora = self.interpola(real, a24)
        self.confere(
            "calculadora",
            "cota cancelada: valor presente",
            50000 / (1 + (ancora + spread) / 100) ** a24,
            ex["cancelada"]["valor_presente"],
        )
        self.confere(
            "calculadora",
            "oferta: retorno ao ano",
            ((50000 / 38000) ** (1 / a24) - 1) * 100,
            ex["retorno"]["retorno_aa"],
        )
        self.confere(
            "calculadora",
            "oferta: preço máximo",
            50000 / (1 + (ancora + spread) / 100) ** a24,
            ex["retorno"]["preco_maximo"],
        )

        def fator(meses: int) -> float:
            a = self.anos("Tesouro IPCA+", meses)
            return (1 + (self.interpola(real, a) + spread) / 100) ** a

        vp_parcelas = sum(1900 / fator(t) for t in range(1, 61))
        vp_credito = 100000 / fator(12)
        self.confere("calculadora", "cota ativa: parcelas", vp_parcelas, ex["ativa"]["vp_parcelas"])
        self.confere("calculadora", "cota ativa: crédito", vp_credito, ex["ativa"]["vp_credito"])
        self.confere(
            "calculadora", "cota ativa: valor da cota", vp_credito - vp_parcelas, ex["ativa"]["valor_da_cota"]
        )
        self.precatorio(spread)
        self.negocios(spread)
        self.lotes(spread)

    # ------------------------------------------------------------------------------------ negócios (veredito)
    MARGEM_PCT = 5  # escrita de novo aqui, de propósito: a regra do painel tem de dar o mesmo com outra mão

    def _selic_do_ano(self) -> tuple[int, int, dict[int, float], float]:
        ano_base, mes_base = int(self.foto["data"][:4]), int(self.foto["data"][5:7]) - 1
        meta = max((d, v) for d, v in self.serie("bcb_sgs", "selic_meta") if d <= self.foto["data"])[1]
        por_ano: dict[int, list[tuple[str, float]]] = {}
        for r in self.registros:
            if r["serie"] == "focus_selic_anual":
                por_ano.setdefault(int(r["dimensao"].split("=")[1]), []).append((r["data_ref"], r["valor"]))
        return ano_base, mes_base, {ano: max(v)[1] for ano, v in por_ano.items()}, meta

    def _fator_selic(self, meses: int) -> float:
        ano_base, mes_base, selic, meta = self._selic_do_ano()

        def taxa(ano: int) -> float:
            if ano == ano_base and ano in selic:
                return (meta + selic[ano]) / 2
            if ano in selic:
                return selic[ano]
            return selic[max(selic)] if ano > max(selic) else meta

        fator = 1.0
        for m in range(1, meses + 1):
            fator *= (1 + taxa(ano_base + (mes_base + m) // 12) / 100) ** (1 / 12)
        return fator

    def _leitura(
        self, pago_hoje: float, saidas: float, recebe: float, valor_justo: float, anos: float | None
    ) -> dict:
        total = pago_hoje + saidas
        folga = valor_justo - pago_hoje
        folga_pct = folga / pago_hoje * 100
        situacao = "ruim" if folga < 0 else "limite" if folga_pct < self.MARGEM_PCT else "bom"
        retorno = (
            ((recebe / pago_hoje) ** (1 / anos) - 1) * 100 if saidas == 0 and anos and recebe > 0 else None
        )
        return {
            "total_pago": total,
            "lucro": recebe - total,
            "lucro_pct": (recebe - total) / total * 100,
            "folga": folga,
            "folga_pct": folga_pct,
            "retorno_aa": retorno,
            "situacao": situacao,
        }

    def negocios(self, spread: float) -> None:
        real, nominal = self.curva("Tesouro IPCA+"), self.curva("Tesouro Prefixado")
        for n in self.js["negocios"]:
            e, r, js = n["entrada"], n["resultado"], n["leitura"]
            area = f"negócio ({n['id']})"
            if n["tipo"] == "cancelada":
                propria = e.get("correcaoPct") is not None
                nome = "Tesouro IPCA+" if e["corrigido"] and not propria else "Tesouro Prefixado"
                curva = real if nome == "Tesouro IPCA+" else nominal
                a = self.anos(nome, e["meses"])
                recebe = (
                    e["valor"] * (1 + e["correcaoPct"] / 100) ** (e["meses"] / 12) if propria else e["valor"]
                )
                vp = recebe / (1 + (self.interpola(curva, a) + spread) / 100) ** a
                self.confere(area, "valor no pagamento", recebe, r["valor_no_pagamento"])
                self.confere(area, "valor presente", vp, r["valor_presente"])
                self.confere(area, "prazo em anos de 252 dias úteis", a, r["prazo_anos"])
                esp = self._leitura(e["preco"] + e["custos"], 0, recebe, vp, a)
            elif n["tipo"] == "oferta":
                nome = "Tesouro IPCA+" if e["corrigido"] else "Tesouro Prefixado"
                curva = real if e["corrigido"] else nominal
                a = self.anos(nome, e["meses"])
                custos = e.get("custos", 0)
                alvo = e["alvoPct"] if e.get("alvoPct") is not None else self.interpola(curva, a) + spread
                bruto = e["valor"] / (1 + alvo / 100) ** a
                self.confere(area, "preço máximo (já sem os custos)", bruto - custos, r["preco_maximo"])
                self.confere(
                    area,
                    "retorno ao ano",
                    ((e["valor"] / (e["preco"] + custos)) ** (1 / a) - 1) * 100,
                    r["retorno_aa"],
                )
                esp = self._leitura(e["preco"] + custos, 0, e["valor"], bruto, a)
            elif n["tipo"] == "ativa":

                def fator(m: int) -> float:
                    a = self.anos("Tesouro IPCA+", m)
                    return (1 + (self.interpola(real, a) + spread) / 100) ** a

                vp_par = sum(e["parcela"] / fator(t) for t in range(1, e["parcelas"] + 1))
                vp_cre = e["credito"] if e["contemplacao"] == 0 else e["credito"] / fator(e["contemplacao"])
                self.confere(area, "valor da cota", vp_cre - vp_par, r["valor_da_cota"])
                esp = self._leitura(
                    e["preco"] + e["custos"],
                    e["parcela"] * e["parcelas"],
                    e["credito"],
                    vp_cre - vp_par,
                    None,
                )
            else:  # precatório
                meses = e["meses"]
                fator = (
                    (1 + e["propriaPct"] / 100) ** (meses / 12)
                    if e["indice"] == "propria"
                    else self._fator_selic(meses)
                )
                liquido = e["valor"] * fator * (1 - e["retencaoPct"] / 100)
                a = self.anos("Tesouro Prefixado", meses)
                vp = liquido / (1 + (self.interpola(nominal, a) + spread) / 100) ** a
                self.confere(area, "valor líquido no pagamento", liquido, r["liquido_esperado"])
                self.confere(area, "valor presente", vp, r["valor_presente"])
                pago = e["valor"] * (1 - e["desagioPct"] / 100) + e["custos"]
                self.confere(
                    area,
                    "deságio mínimo",
                    (1 - (vp - e["custos"]) / e["valor"]) * 100,
                    r["oferta"]["desagio_minimo_pct"],
                )
                esp = self._leitura(pago, 0, liquido, vp, a)
            for campo in ("total_pago", "lucro", "lucro_pct", "folga", "folga_pct", "retorno_aa"):
                self.confere(area, campo, esp[campo], js[campo])
            self.confere(area, "situação (verde, amarelo ou vermelho)", esp["situacao"], js["situacao"])

    # ------------------------------------------------------------------------------------ várias cotas
    def lotes(self, spread: float) -> None:
        real, nominal = self.curva("Tesouro IPCA+"), self.curva("Tesouro Prefixado")

        def num(txt: str) -> float | None:
            txt = txt.strip().replace("R$", "").replace("%", "")
            if not txt:
                return None
            return float(txt.replace(".", "").replace(",", "."))

        for tipo, bloco in self.js["lotes"].items():
            linhas = [x for x in bloco["texto"].split("\n") if x.strip()]
            calculadas = [x for x in bloco["resultado"]["linhas"] if "erro" not in x]
            self.confere(f"lista ({tipo})", "linhas calculadas", len(linhas), len(calculadas))
            for texto, js in zip(linhas, calculadas, strict=True):
                c = [x.strip() for x in texto.split(";")]
                area = f"lista ({tipo}) linha {js['n']}"
                if tipo == "cancelada":
                    valor, meses = num(c[0]), int(num(c[1]))
                    corr = c[2].lower()
                    propria = corr not in ("", "ipca", "sem")
                    taxa = num(corr) if propria else None
                    curva = real if corr in ("", "ipca") else nominal
                    nome = "Tesouro IPCA+" if corr in ("", "ipca") else "Tesouro Prefixado"
                    a = self.anos(nome, meses)
                    recebe = valor * (1 + taxa / 100) ** (meses / 12) if propria else valor
                    vp = recebe / (1 + (self.interpola(curva, a) + spread) / 100) ** a
                    preco, custos = (
                        num(c[3]) if len(c) > 3 else None,
                        (num(c[4]) if len(c) > 4 else None) or 0,
                    )
                    esp = self._leitura(preco + custos, 0, recebe, vp, a) if preco else None
                else:
                    credito, parcela, n_par, k = num(c[0]), num(c[1]), int(num(c[2])), int(num(c[3]))

                    def fator(m: int) -> float:
                        a = self.anos("Tesouro IPCA+", m)
                        return (1 + (self.interpola(real, a) + spread) / 100) ** a

                    vp = (credito if k == 0 else credito / fator(k)) - sum(
                        parcela / fator(t) for t in range(1, n_par + 1)
                    )
                    preco, custos = (
                        num(c[4]) if len(c) > 4 else None,
                        (num(c[5]) if len(c) > 5 else None) or 0,
                    )
                    esp = self._leitura(preco + custos, parcela * n_par, credito, vp, None) if preco else None
                self.confere(area, "vale hoje", vp, js["vale_hoje"])
                if esp:
                    self.confere(area, "lucro no fim", esp["lucro"], js["lucro"])
                    self.confere(area, "situação", esp["situacao"], js["situacao"])
                else:
                    self.confere(area, "sem preço, sem veredito", None, js.get("situacao"))

    def precatorio(self, spread: float) -> None:
        """O exemplo do precatório (100 mil, 36 meses, Selic, 40% de deságio), com a Selic dos registros."""
        ano_base, mes_base = int(self.foto["data"][:4]), int(self.foto["data"][5:7]) - 1
        meta = max((d, v) for d, v in self.serie("bcb_sgs", "selic_meta") if d <= self.foto["data"])[1]
        por_ano: dict[int, list[tuple[str, float]]] = {}
        for r in self.registros:
            if r["serie"] == "focus_selic_anual":
                por_ano.setdefault(int(r["dimensao"].split("=")[1]), []).append((r["data_ref"], r["valor"]))
        selic = {ano: max(v)[1] for ano, v in por_ano.items()}

        def taxa(ano: int) -> float:
            if ano == ano_base and ano in selic:
                return (meta + selic[ano]) / 2
            if ano in selic:
                return selic[ano]
            return selic[max(selic)] if ano > max(selic) else meta

        fator = 1.0
        for m in range(1, 37):
            fator *= (1 + taxa(ano_base + (mes_base + m) // 12) / 100) ** (1 / 12)
        esperado = 100000 * fator
        a36 = self.anos("Tesouro Prefixado", 36)
        desconto = self.interpola(self.curva("Tesouro Prefixado"), a36) + spread
        vp = esperado / (1 + desconto / 100) ** a36
        ex = self.js["exemplos"]["precatorio"]
        self.confere("precatório", "fator de correção (Selic, 36 meses)", fator, ex["fator"])
        self.confere("precatório", "valor esperado no pagamento", esperado, ex["valor_esperado"])
        self.confere("precatório", "valor presente", vp, ex["valor_presente"])
        retorno = ((esperado / 60000) ** (1 / a36) - 1) * 100
        self.confere(
            "precatório", "retorno de quem compra com 40% de deságio", retorno, ex["oferta"]["retorno_aa"]
        )

    # ------------------------------------------------------------------------------------ frases
    def frases(self) -> None:
        c = self.js["creditos"]
        dif = c["veiculos"]["resumo"]["mediana"] - c["imobiliario"]["resumo"]["mediana"]
        self.confere(
            "frase",
            "crédito: diferença em p.p.",
            True,
            f"{abs(dif):.1f}".replace(".", ",") in self.js["frases"]["credito"],
        )
        maior = max(abs(p["d7"]) for p in self.js["curvas"][0]["pontos"] if p["d7"] is not None)
        self.confere(
            "frase",
            "curva: maior mexida em 7 dias",
            True,
            f"{maior:.2f}".replace(".", ",") in self.js["frases"]["curva"],
        )

    def roda(self) -> None:
        self.tesouro()
        self.impacto_e_sensibilidade()
        self.juros_e_inflacao()
        self.credito()
        self.setor()
        self.calculadoras()
        self.frases()


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    node = shutil.which("node")
    if node is None:
        print("ERRO: precisa do Node para rodar o JavaScript do painel.", file=sys.stderr)
        return 2
    foto_path = Path(argv[1])
    with tempfile.TemporaryDirectory() as pasta:
        saida = Path(pasta) / "painel.json"
        r = subprocess.run(
            [node, str(RAIZ / "scripts" / "despeja_painel.mjs"), str(foto_path), str(saida)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if r.returncode != 0:
            print(r.stderr, file=sys.stderr)
            return 2
        auditoria = Auditoria(
            json.loads(foto_path.read_text(encoding="utf-8")), json.loads(saida.read_text(encoding="utf-8"))
        )
        auditoria.roda()
    print(f"{auditoria.conferidos} números conferidos, {len(auditoria.divergencias)} divergências")
    for d in auditoria.divergencias:
        print("  DIVERGE:", d)
    return 1 if auditoria.divergencias else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))
