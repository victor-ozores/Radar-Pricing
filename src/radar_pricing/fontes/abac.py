"""ABAC: boletim mensal "Sistema de Consórcios em <mês>/<ano>: dados econômicos" (API do WordPress do blog).

É a fonte mais frágil: o texto muda de mês para mês ("chegou a", "alcançou", "encerrou com"). Por isso é
complementar: se um número não for achado (ou sair de uma faixa plausível), ele não entra, entra um aviso, e o
painel mostra o link do boletim. Os 6 campos são os do total do sistema, não de um segmento.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import date

from radar_pricing.datas import MESES, fim_do_mes
from radar_pricing.http import Cliente, Falha, codifica
from radar_pricing.modelo import Registro, ResultadoFonte

from ._util import confere_idade, isolando, para_float

FONTE = "abac"
URL = "https://blog.abac.org.br/wp-json/wp/v2/posts?"
CONSULTA = {
    "per_page": "30",
    "search": "Sistema de Consórcios em",
    "_fields": "id,date,slug,link,title,content",
}
MESES_GUARDADOS = 3
MAX_IDADE_DIAS = 50
TITULO = re.compile(r"Sistema de Cons.rcios em (\w+)/(\d{4})")


@dataclass(frozen=True)
class Campo:
    serie: str
    descricao: str
    unidade: str
    padrao: str
    faixa: tuple[
        float, float
    ]  # valores plausíveis para o TOTAL do sistema (evita pegar o número de um segmento)


# `[^$]` (e não `[^R]`): com re.I o `[^R]` também recusava o "r" minúsculo e quebrava "somaram"/"alcançaram"
CAMPOS = (
    Campo(
        "abac_participantes_ativos",
        "Participantes ativos do sistema de consórcios, no fim do mês",
        "milhões",
        r"(\d+,\d+) milh[õo]es de participantes ativos|participantes ativos[^.]{0,70}?(\d+,\d+) milh",
        (8, 30),
    ),
    Campo(
        "abac_cotas_vendidas_no_ano",
        "Cotas comercializadas de janeiro até o mês",
        "milhões",
        r"(\d+,\d+) milh[õo]es de cotas",
        (0.3, 15),
    ),
    Campo(
        "abac_creditos_comercializados_no_ano",
        "Créditos comercializados de janeiro até o mês",
        "R$ bilhões",
        r"cr[ée]ditos comercializados[^$]{0,90}R\$ ?(\d+,\d+) bilh",
        (30, 2000),
    ),
    Campo(
        "abac_ticket_medio",
        "Tíquete médio do mês",
        "R$ mil",
        r"t[íi]quete m[ée]dio[^$]{0,50}R\$ ?(\d+,\d+) mil",
        (50, 400),
    ),
    Campo(
        "abac_contemplacoes_no_ano",
        "Contemplações de janeiro até o mês",
        "milhões",
        r"contempla[çc][õo]es[^0-9]{0,70}(\d+,\d+) milh",
        (0.1, 6),
    ),
    Campo(
        "abac_creditos_disponibilizados_no_ano",
        "Créditos disponibilizados de janeiro até o mês",
        "R$ bilhões",
        r"cr[ée]ditos disponibilizados[^$]{0,70}R\$ ?(\d+,\d+) bilh",
        (10, 500),
    ),
)


def _texto(conteudo_html: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", conteudo_html)))


def extrair(texto: str) -> tuple[dict[str, float], list[str]]:
    """Devolve (campos achados e plausíveis, nomes dos campos que faltaram)."""
    achados: dict[str, float] = {}
    for c in CAMPOS:
        m = re.search(c.padrao, texto, re.IGNORECASE)
        if not m:
            continue
        valor = para_float(next(g for g in m.groups() if g))
        if c.faixa[0] <= valor <= c.faixa[1]:
            achados[c.serie] = valor
    return achados, [c.serie for c in CAMPOS if c.serie not in achados]


def coletar(cli: Cliente, hoje: date) -> ResultadoFonte:
    res = ResultadoFonte()
    with isolando(res, "ABAC boletim mensal"):
        posts = cli.json(URL + codifica(CONSULTA))
        mensais = []
        for p in posts:
            titulo = html.unescape(p["title"]["rendered"]).strip()
            m = TITULO.search(titulo)
            if m and m.group(1).lower() in MESES:
                mensais.append((p, titulo, int(m.group(2)), MESES[m.group(1).lower()]))
        if not mensais:
            raise Falha("nenhum boletim mensal encontrado")
        mensais.sort(key=lambda x: x[0]["date"], reverse=True)
        posts_info = []
        for p, titulo, ano, mes in mensais[:MESES_GUARDADOS]:
            achados, faltaram = extrair(_texto(p["content"]["rendered"]))
            referencia = fim_do_mes(ano, mes)
            campos = {c.serie: c for c in CAMPOS}
            for serie, valor in achados.items():
                c = campos[serie]
                res.registros.append(Registro(FONTE, serie, c.descricao, referencia, valor, c.unidade))
            if faltaram:
                res.avisos.append(f"{titulo}: não achei {', '.join(faltaram)}")
            posts_info.append(
                {
                    "titulo": titulo,
                    "referencia": referencia.isoformat(),
                    "publicado_em": p["date"][:10],
                    "link": p["link"],
                    "campos_achados": len(achados),
                    "campos_esperados": len(CAMPOS),
                }
            )
        res.extras["boletins"] = posts_info
        confere_idade(res, "abac", date.fromisoformat(mensais[0][0]["date"][:10]), hoje, MAX_IDADE_DIAS)
    return res
