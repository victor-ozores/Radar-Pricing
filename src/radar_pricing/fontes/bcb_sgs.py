"""BCB SGS: Selic, CDI e IPCA. Séries diárias (janela de datas) e mensais (últimas observações)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from radar_pricing.datas import parse_br
from radar_pricing.http import Cliente, Falha
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "bcb_sgs"
URL_ULTIMOS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados/ultimos/{n}?formato=json"
URL_JANELA = (
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json"
    "&dataInicial={inicio}&dataFinal={fim}"
)
MAX_ULTIMOS = 20  # acima disso o SGS responde HTTP 400 ("a quantidade máxima de valores é 20")
JANELA_DIAS = 60  # séries diárias: 60 dias corridos (~40 dias úteis) para olhar 30 dias para trás


@dataclass(frozen=True)
class SerieSgs:
    codigo: int
    serie: str
    descricao: str
    unidade: str
    max_idade_dias: int
    n: int | None = None  # série mensal: quantas observações pedir (as últimas, no máximo 20)
    janela_dias: int | None = None  # série diária: quantos dias corridos para trás

    def __post_init__(self) -> None:
        if (self.n is None) == (self.janela_dias is None):
            raise ValueError(f"{self.serie}: informe `n` (mensal) ou `janela_dias` (diária), só um dos dois")
        if self.n is not None and self.n > MAX_ULTIMOS:
            raise ValueError(f"{self.serie}: o SGS aceita no máximo {MAX_ULTIMOS} últimas observações")

    def url(self, hoje: date) -> str:
        if self.janela_dias is not None:
            inicio = (hoje - timedelta(days=self.janela_dias)).strftime("%d/%m/%Y")
            return URL_JANELA.format(codigo=self.codigo, inicio=inicio, fim=hoje.strftime("%d/%m/%Y"))
        return URL_ULTIMOS.format(codigo=self.codigo, n=self.n)


SERIES = (
    SerieSgs(432, "selic_meta", "Meta Selic definida pelo Copom", "% a.a.", 6, janela_dias=JANELA_DIAS),
    SerieSgs(11, "selic_over", "Taxa Selic over (diária)", "% ao dia", 6, janela_dias=JANELA_DIAS),
    SerieSgs(12, "cdi", "Taxa CDI (diária)", "% ao dia", 6, janela_dias=JANELA_DIAS),
    SerieSgs(4189, "selic_acumulada_mes_anualizada", "Selic acumulada no mês, anualizada", "% a.a.", 45, n=3),
    # o IPCA tem data de referência no dia 1 do mês e sai uns 10 dias depois do fim do mês
    SerieSgs(433, "ipca_mensal", "IPCA, variação mensal", "%", 75, n=3),
    SerieSgs(13522, "ipca_12_meses", "IPCA, acumulado em 12 meses", "%", 75, n=3),
)


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    for s in SERIES:
        with isolando(res, f"SGS {s.codigo} ({s.serie})"):
            dados = cli.json(s.url(hoje))
            if not isinstance(dados, list):
                raise Falha("a resposta não é uma lista")
            observacoes: list[tuple[date, float]] = []
            futuras = 0
            for d in dados:
                data = parse_br(d["data"])
                if data > hoje:  # a meta Selic (432) já veio com registros datados depois de hoje
                    futuras += 1
                    continue
                observacoes.append((data, para_float(d["valor"])))
            if not observacoes:
                raise Falha("nenhuma observação com data até hoje")
            if futuras:
                res.avisos.append(f"{s.serie}: {futuras} registro(s) com data à frente de hoje descartado(s)")
            res.registros += [
                Registro(FONTE, s.serie, s.descricao, data, valor, s.unidade) for data, valor in observacoes
            ]
            confere_idade(res, s.serie, max(d for d, _ in observacoes), hoje, s.max_idade_dias)
    return res
