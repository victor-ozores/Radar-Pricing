"""Verifica, com chamadas reais, cada fonte de dados do Radar Pricing e grava o relatório em docs/auditoria/.

Só usa a biblioteca padrão do Python. Rode a qualquer momento (e, mais tarde, no GitHub Actions):

    python scripts/verifica_fontes.py

Cada teste devolve OK ou FALHA com o motivo. Fonte "essencial" que falha faz o script sair com código 1.
Os números impressos são os que o robô vai usar; nada aqui é estimativa.
"""

from __future__ import annotations

import csv
import gzip
import html
import io
import itertools
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36"
RAIZ = Path(__file__).resolve().parent.parent
HOJE = date.today()
CODIFICA = lambda q: urllib.parse.urlencode(q, quote_via=urllib.parse.quote)  # noqa: E731


class Falha(Exception):
    """A fonte respondeu, mas não do jeito que o robô precisa."""


def pega(url: str, *, ua: str | None = UA, timeout: int = 120) -> tuple[int, str, bytes, float]:
    req = urllib.request.Request(url, headers={"User-Agent": ua} if ua else {})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, ct, corpo = r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        status, ct, corpo = e.code, e.headers.get("content-type", ""), e.read()
    if corpo[:2] == bytes([0x1F, 0x8B]):  # o IBGE às vezes manda gzip mesmo sem o cliente pedir
        corpo = gzip.decompress(corpo)
    return status, ct, corpo, (time.perf_counter() - t0) * 1000


def pega_json(url: str, **kw):
    """Confia no CORPO, não no cabeçalho: o BCB devolve JSON válido marcado como text/html (SGS 13522) e
    devolve HTML de verdade, com HTTP 200, quando a série não existe."""
    status, ct, corpo, _ = pega(url, **kw)
    if status != 200:
        raise Falha(f"HTTP {status}")
    try:
        return json.loads(corpo.decode("utf-8"))
    except ValueError:
        raise Falha(
            f"HTTP 200 mas o corpo não é JSON ({ct.split(';')[0] or 'sem tipo'}): {corpo[:60]!r}"
        ) from None


def dia(texto: str) -> date:
    return datetime.strptime(texto, "%d/%m/%Y").date()


@dataclass
class Resultado:
    id: str
    fonte: str
    papel: str  # essencial | complementar | comportamento
    ok: bool
    detalhe: str
    ms: float


RESULTADOS: list[Resultado] = []


def teste(id_: str, fonte: str, papel: str):
    def deco(fn):
        t0 = time.perf_counter()
        try:
            detalhe = fn()
            ok = True
        except Falha as e:
            ok, detalhe = False, str(e)
        except Exception as e:
            ok, detalhe = False, f"{type(e).__name__}: {str(e)[:160]}"
        RESULTADOS.append(Resultado(id_, fonte, papel, ok, detalhe, (time.perf_counter() - t0) * 1000))
        return fn

    return deco


# ----------------------------------------------------------------------------------------------------- BCB SGS
SGS = {
    432: ("Meta Selic (% a.a.)", 6),
    11: ("Selic over diária (% ao dia)", 6),
    12: ("CDI diário (% ao dia)", 6),
    4189: ("Selic acumulada no mês, anualizada (% a.a.)", 45),
    433: (
        "IPCA mensal (%)",
        75,
    ),  # data de referência é o dia 1 do mês; o dado sai ~10 dias depois do fim do mês
    13522: ("IPCA acumulado em 12 meses (%)", 75),
}


def _sgs(cod: int):
    nome, max_idade = SGS[cod]
    dados = pega_json(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados/ultimos/1?formato=json")
    if not dados or "valor" not in dados[0]:
        raise Falha("lista vazia ou sem o campo 'valor'")
    d, v = dia(dados[0]["data"]), float(dados[0]["valor"])
    idade = (HOJE - d).days
    if idade > max_idade:
        raise Falha(f"{nome}: último dado é de {d} ({idade} dias), velho demais")
    aviso = " (data À FRENTE de hoje: o robô deve usar só datas até hoje)" if idade < 0 else ""
    return f"{nome} = {v} em {d}{aviso}"


for _cod in SGS:
    teste(f"sgs_{_cod}", f"BCB SGS {_cod}", "essencial")(lambda c=_cod: _sgs(c))


@teste("sgs_serie_inexistente", "BCB SGS (código que não existe)", "comportamento")
def _():
    status, ct, corpo, ms = pega(
        "https://api.bcb.gov.br/dados/serie/bcdata.sgs.999999/dados/ultimos/1?formato=json", timeout=60
    )
    try:
        json.loads(corpo.decode("utf-8"))
    except ValueError:
        if status == 200:
            return f"CONFIRMADO: HTTP 200 com página HTML ({ms / 1000:.0f} s para responder). O robô nunca pode confiar só no código 200: tem de checar que o corpo é JSON."
    raise Falha(f"comportamento diferente do esperado: HTTP {status} {ct}")


@teste("sgs_janela_10_anos", "BCB SGS (janela maior que 10 anos em série diária)", "comportamento")
def _():
    status, ct, corpo, _ = pega(
        "https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=01/01/2010&dataFinal=30/10/2026"
    )
    if status == 406:
        return "CONFIRMADO: HTTP 406; série diária aceita no máximo 10 anos por consulta. Buscar em janelas menores."
    raise Falha(f"esperava 406, veio HTTP {status}")


@teste("sgs_sem_navegador", "BCB SGS (chamada sem User-Agent de navegador)", "comportamento")
def _():
    html_n, total = 0, 0
    for cod in (432, 11, 4189, 433):
        total += 1
        status, ct, corpo, _ = pega(
            f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados/ultimos/1?formato=json",
            ua="curl/8.5.0",
        )
        try:
            json.loads(corpo.decode("utf-8"))
            if status != 200:
                html_n += 1
        except ValueError:
            html_n += 1
    return f"com User-Agent 'curl': {total - html_n} de {total} séries vieram em JSON ({html_n} vieram como HTML). O robô manda User-Agent de navegador, confere que o corpo é JSON e tenta de novo se não for."


@teste("sgs_ultimos_mais_de_20", "BCB SGS (ultimos/21 em diante)", "comportamento")
def _():
    status, ct, corpo, _ = pega(
        "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/21?formato=json"
    )
    if status == 400:
        return "CONFIRMADO: HTTP 400; o SGS aceita no máximo 20 últimas observações. Para mais, usar janela de datas."
    raise Falha(f"esperava 400, veio HTTP {status}")


# ----------------------------------------------------------------------------------------------------- BCB Focus
FOCUS = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"


def _focus_anual(indicador: str, anos: tuple[str, ...]):
    q = {
        "$format": "json",
        "$top": "80",
        "$orderby": "Data desc",
        "$filter": f"Indicador eq '{indicador}' and baseCalculo eq 0",
    }
    linhas = pega_json(FOCUS + "ExpectativasMercadoAnuais?" + CODIFICA(q))["value"]
    if not linhas:
        raise Falha("sem linhas")
    ultima = linhas[0]["Data"]
    idade = (HOJE - date.fromisoformat(ultima)).days
    if idade > 10:
        raise Falha(f"último Focus é de {ultima} ({idade} dias)")
    medianas = {
        r["DataReferencia"]: r["Mediana"]
        for r in linhas
        if r["Data"] == ultima and r["DataReferencia"] in anos
    }
    if set(medianas) != set(anos):
        raise Falha(f"faltam anos: {set(anos) - set(medianas)}")
    return f"Focus de {ultima}, mediana {indicador}: " + ", ".join(f"{a}={medianas[a]}" for a in anos)


teste("focus_selic", "BCB Focus: Selic (anual)", "essencial")(
    lambda: _focus_anual("Selic", ("2026", "2027", "2028", "2029"))
)
teste("focus_ipca", "BCB Focus: IPCA (anual)", "essencial")(
    lambda: _focus_anual("IPCA", ("2026", "2027", "2028", "2029"))
)


@teste("focus_edicoes_diarias", "BCB Focus: o histórico tem uma linha por dia útil", "comportamento")
def _():
    q = {
        "$format": "json",
        "$top": "200",
        "$orderby": "Data desc",
        "$filter": "Indicador eq 'Selic' and baseCalculo eq 0",
    }
    linhas = pega_json(FOCUS + "ExpectativasMercadoAnuais?" + CODIFICA(q))["value"]
    datas = sorted({r["Data"] for r in linhas}, reverse=True)[:8]
    saltos = [(date.fromisoformat(a) - date.fromisoformat(b)).days for a, b in itertools.pairwise(datas)]
    if saltos and max(saltos) <= 3:
        return f"CONFIRMADO: edições em dias úteis seguidos ({', '.join(datas[:4])}...). Guardar 35 dias corridos, não 'N semanas'."
    raise Falha(f"as edições não são diárias: {datas}")


@teste("focus_selic_reunioes", "BCB Focus: Selic por reunião do Copom", "complementar")
def _():
    q = {"$format": "json", "$top": "8", "$orderby": "Data desc", "$filter": "baseCalculo eq 0"}
    linhas = pega_json(FOCUS + "ExpectativasMercadoSelic?" + CODIFICA(q))["value"]
    if not linhas:
        raise Falha("sem linhas")
    return f"Focus de {linhas[0]['Data']}; próximas reuniões: " + ", ".join(
        f"{r['Reuniao']}={r['Mediana']}" for r in linhas[:4]
    )


# ----------------------------------------------------------------------------------------------------- BCB taxas de juros
TAXAS = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/"


@teste("taxas_imobiliario", "BCB taxas de juros: financiamento imobiliário (mensal, por banco)", "essencial")
def _():
    mod = "Financiamento imobiliário com taxas de mercado - Prefixado"
    q = {
        "$format": "json",
        "$top": "40",
        "$orderby": "anoMes desc,Posicao asc",
        "$filter": f"Modalidade eq '{mod}'",
    }
    linhas = pega_json(TAXAS + "TaxasJurosMensalPorMes?" + CODIFICA(q))["value"]
    if not linhas:
        raise Falha("sem linhas")
    ult = linhas[0]["anoMes"]
    do_mes = [r for r in linhas if r["anoMes"] == ult]
    melhores = ", ".join(f"{r['InstituicaoFinanceira'][:18]} {r['TaxaJurosAoAno']}%" for r in do_mes[:3])
    return f"mês {ult}, {len(do_mes)} bancos; menores taxas a.a.: {melhores}"


@teste("taxas_veiculos", "BCB taxas de juros: aquisição de veículos (semanal, por banco)", "essencial")
def _():
    q = {
        "$format": "json",
        "$top": "60",
        "$orderby": "InicioPeriodo desc",
        "$filter": "codigoModalidade eq '401101'",
    }
    linhas = pega_json(TAXAS + "ConsultaUnificada?" + CODIFICA(q))["value"]
    if not linhas:
        raise Falha("sem linhas")
    ini = linhas[0]["InicioPeriodo"]
    idade = (HOJE - date.fromisoformat(ini)).days
    if idade > 21:
        raise Falha(f"última semana é de {ini} ({idade} dias)")
    sem = [r["TaxaJurosAoAno"] for r in linhas if r["InicioPeriodo"] == ini]
    return f"semana {ini}, {len(sem)} bancos; mediana {statistics.median(sem):.2f}% a.a. (de {min(sem)} a {max(sem)})"


@teste("taxas_parametros", "BCB taxas de juros: lista de modalidades", "complementar")
def _():
    n = len(pega_json(TAXAS + "ParametrosConsulta?" + CODIFICA({"$format": "json", "$top": "400"}))["value"])
    if n < 20:
        raise Falha(f"só {n} modalidades")
    return f"{n} modalidades cadastradas"


# ----------------------------------------------------------------------------------------------------- BCB Panorama de Consórcios
PAN = "https://olinda.bcb.gov.br/olinda/servico/PANORAMA_DE_CONSORCIOS/versao/v1/odata/"


def _metricas(base: str) -> list[dict]:
    return pega_json(PAN + f"Metricas(DataBase=@DataBase)?@DataBase={base}&$format=json&$top=2000")["value"]


def _trimestres_para_tras(n: int) -> list[str]:
    ano, mes = HOJE.year, (HOJE.month // 3) * 3
    if mes == 0:
        ano, mes = ano - 1, 12
    saida = []
    for _ in range(n):
        saida.append(f"{ano}{mes:02d}")
        mes -= 3
        if mes == 0:
            ano, mes = ano - 1, 12
    return saida


@teste("panorama_ultimo", "BCB Panorama de Consórcios: trimestre mais recente", "essencial")
def _():
    cadastro = pega_json(PAN + "CadastroDeMetricas()?$format=json&$top=500")["value"]
    for base in _trimestres_para_tras(6):
        linhas = _metricas(base)
        if linhas:
            break
    else:
        raise Falha("nenhum dos 6 últimos trimestres tem dados")
    if len(linhas) != len(cadastro):
        raise Falha(f"{len(linhas)} métricas no trimestre contra {len(cadastro)} cadastradas")
    fim = date(int(base[:4]), int(base[4:]), 28)
    por_nome = {r["Metrica"]: r["Valor"] for r in linhas}
    ie = por_nome.get("Índice de Exclusão - Total")
    inad = por_nome.get("Índice de Inadimplência - Total")
    if ie is None or not 0 < ie < 100 or inad is None or not 0 <= inad < 100:
        raise Falha(f"valores fora do esperado (exclusão={ie}, inadimplência={inad})")
    return f"trimestre {base} (defasagem de ~{(HOJE - fim).days} dias), {len(linhas)} métricas; exclusão total {ie}%, inadimplência {inad}%"


@teste("panorama_historico", "BCB Panorama de Consórcios: série histórica", "complementar")
def _():
    vazios = [b for b in ("201512", "201712", "201912", "202112", "202312", "202512") if not _metricas(b)]
    if vazios:
        raise Falha(f"trimestres sem dados: {vazios}")
    return "dez/2015, 2017, 2019, 2021, 2023 e 2025 com todas as métricas"


# ----------------------------------------------------------------------------------------------------- Tesouro Transparente
TESOURO_PACOTE = "df56aa42-484a-4a59-8184-7676580c81e3"
TESOURO_CSV_FIXO = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv"
)
_csv_url = {"valor": TESOURO_CSV_FIXO}


@teste("tesouro_ckan", "Tesouro Transparente: catálogo (CKAN) do conjunto de taxas", "complementar")
def _():
    j = pega_json(
        f"https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id={TESOURO_PACOTE}"
    )
    recursos = j["result"]["resources"]
    csvs = [r for r in recursos if r.get("format", "").upper() == "CSV" or r["url"].lower().endswith(".csv")]
    if not csvs:
        raise Falha("catálogo sem recurso CSV")
    escolhido = next((r for r in csvs if "PrecoTaxa" in r["url"]), csvs[0])
    _csv_url["valor"] = escolhido["url"]
    return f"{len(recursos)} recursos; CSV atual: {escolhido['url'].rsplit('/', 1)[-1]} (modificado em {escolhido.get('last_modified', '?')})"


@teste("tesouro_csv", "Tesouro Transparente: CSV de preços e taxas do Tesouro Direto", "essencial")
def _():
    status, ct, corpo, ms = pega(_csv_url["valor"], timeout=180)
    if status != 200:
        raise Falha(f"HTTP {status}")
    linhas = list(csv.DictReader(io.StringIO(corpo.decode("latin-1")), delimiter=";"))
    if len(linhas) < 100000:
        raise Falha(f"só {len(linhas)} linhas")
    chave = lambda s: s[6:] + s[3:5] + s[:2]  # noqa: E731
    ultima = max((r["Data Base"] for r in linhas), key=chave)
    idade = (HOJE - dia(ultima)).days
    if idade > 6:
        raise Falha(f"última data base é {ultima} ({idade} dias)")
    ipca = {
        r["Data Vencimento"][-4:]: r["Taxa Compra Manha"]
        for r in linhas
        if r["Data Base"] == ultima and r["Tipo Titulo"] == "Tesouro IPCA+"
    }
    curva = ", ".join(f"{a}={ipca[a]}%" for a in sorted(ipca))
    return f"{len(linhas)} linhas ({len(corpo) / 1e6:.1f} MB, {ms / 1000:.1f} s), última data base {ultima}; Tesouro IPCA+ (taxa de compra): {curva}"


# ----------------------------------------------------------------------------------------------------- IBGE (conferência do IPCA)
@teste("ibge_ipca", "IBGE SIDRA: IPCA mensal (conferência do BCB)", "complementar")
def _():
    j = pega_json(
        "https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-2/variaveis/63?localidades=N1[all]"
    )
    serie = j[0]["resultados"][0]["series"][0]["serie"]
    ult = max(serie)
    bcb = pega_json("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json")
    por_mes = {d["data"][6:] + d["data"][3:5]: float(d["valor"]) for d in bcb}
    if ult not in por_mes:
        raise Falha(f"IBGE tem {ult}, o BCB (SGS 433) não: {sorted(por_mes)}")
    dif = abs(float(serie[ult]) - por_mes[ult])
    if dif > 0.011:
        raise Falha(f"IPCA {ult} difere: IBGE {serie[ult]} x BCB {por_mes[ult]}")
    return f"IPCA {ult}: IBGE {serie[ult]}% = BCB {por_mes[ult]}%"


# ----------------------------------------------------------------------------------------------------- ABAC (único caso de "raspagem")
ABAC_BLOG = "https://blog.abac.org.br/"
_posts_abac: list[dict] = []


def _limpa(conteudo_html: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", conteudo_html)))


@teste("abac_robots", "ABAC: o robots.txt permite ler?", "comportamento")
def _():
    status, _, corpo, _ = pega(ABAC_BLOG + "robots.txt")
    if status != 200:
        raise Falha(f"robots.txt: HTTP {status}")
    texto = corpo.decode("utf-8", "replace")
    if re.search(r"(?im)^\s*Disallow:\s*/\s*$", texto):
        raise Falha("o site proíbe tudo")
    return "robots.txt do blog não proíbe nenhum caminho (Disallow vazio)"


@teste(
    "abac_api_posts",
    "ABAC (blog em WordPress): API de posts 'Sistema de Consórcios em <mês>'",
    "complementar",
)
def _():
    q = {"per_page": "40", "search": "Sistema de Consórcios em", "_fields": "id,date,slug,title,content"}
    posts = pega_json(ABAC_BLOG + "wp-json/wp/v2/posts?" + CODIFICA(q))
    mensais = [p for p in posts if re.search(r"Sistema de Cons.rcios em \w+/\d{4}", p["title"]["rendered"])]
    mensais.sort(key=lambda p: p["date"], reverse=True)
    _posts_abac[:] = mensais
    if len(mensais) < 3:
        raise Falha(f"só {len(mensais)} posts mensais")
    idade = (HOJE - date.fromisoformat(mensais[0]["date"][:10])).days
    if idade > 50:
        raise Falha(f"post mais recente tem {idade} dias")
    return f"{len(mensais)} posts mensais; o mais recente: '{html.unescape(mensais[0]['title']['rendered'])}' ({mensais[0]['date'][:10]})"


FAIXAS_ABAC = {  # (mínimo, máximo) plausíveis para o total do sistema; evita pegar o número de um segmento
    "participantes ativos (mi)": (8, 30),
    "cotas vendidas no ano (mi)": (0.3, 15),
    "créditos comercializados (R$ bi)": (30, 2000),
    "tíquete médio (R$ mil)": (50, 400),
    "contemplações no ano (mi)": (0.1, 6),
    "créditos disponibilizados (R$ bi)": (10, 500),
}
PADROES_ABAC = {
    "participantes ativos (mi)": r"(\d+,\d+) milh[õo]es de participantes ativos|participantes ativos[^.]{0,70}?(\d+,\d+) milh",
    "cotas vendidas no ano (mi)": r"(\d+,\d+) milh[õo]es de cotas",
    "créditos comercializados (R$ bi)": r"cr[ée]ditos comercializados[^$]{0,90}R\$ ?(\d+,\d+) bilh",
    "tíquete médio (R$ mil)": r"t[íi]quete m[ée]dio[^$]{0,50}R\$ ?(\d+,\d+) mil",
    "contemplações no ano (mi)": r"contempla[çc][õo]es[^0-9]{0,70}(\d+,\d+) milh",
    "créditos disponibilizados (R$ bi)": r"cr[ée]ditos disponibilizados[^$]{0,70}R\$ ?(\d+,\d+) bilh",
}


@teste("abac_extracao", "ABAC: extrair os números do texto de 3 meses seguidos", "complementar")
def _():
    if len(_posts_abac) < 3:
        raise Falha("teste anterior não achou posts")
    partes, piores = [], 99
    for p in _posts_abac[:3]:
        texto = _limpa(p["content"]["rendered"])
        achados = {}
        for nome, padrao in PADROES_ABAC.items():
            m = re.search(padrao, texto, re.I)
            if m:
                valor = float(next(g for g in m.groups() if g).replace(",", "."))
                if FAIXAS_ABAC[nome][0] <= valor <= FAIXAS_ABAC[nome][1]:
                    achados[nome] = valor
        piores = min(piores, len(achados))
        faltam = [n for n in PADROES_ABAC if n not in achados]
        mes = re.search(r"em (\w+/\d{4})", html.unescape(p["title"]["rendered"]))
        partes.append(
            f"{mes.group(1) if mes else '?'}: {len(achados)}/6"
            + (f" (faltou: {', '.join(faltam)})" if faltam else "")
        )
    if piores < 4:
        raise Falha("o texto muda de mês para mês e as expressões não pegam: " + "; ".join(partes))
    return (
        "extração por expressão regular: "
        + "; ".join(partes)
        + ". O texto varia a cada mês: usar como complemento e mostrar o link do post se algum número faltar."
    )


# ----------------------------------------------------------------------------------------------------- relatório
def principal() -> int:
    ordem = {"essencial": 0, "complementar": 1, "comportamento": 2}
    resultados = sorted(RESULTADOS, key=lambda r: (ordem[r.papel], r.id))
    linhas = [
        f"# Verificação das fontes de dados ({HOJE.isoformat()})",
        "",
        "Gerado por `scripts/verifica_fontes.py` com chamadas reais, nesta data. Fonte **essencial** que falha trava o robô; **complementar** pode faltar sem parar tudo; **comportamento** registra como a fonte se comporta quando algo dá errado.",
        "",
        "| Resultado | Papel | Fonte | Tempo | O que voltou |",
        "|---|---|---|---|---|",
    ]
    for r in resultados:
        linhas.append(
            f"| {'OK' if r.ok else '**FALHA**'} | {r.papel} | {r.fonte} | {r.ms / 1000:.1f} s | {r.detalhe.replace('|', '/')} |"
        )
    falhas_essenciais = [r for r in resultados if r.papel == "essencial" and not r.ok]
    falhas_outras = [r for r in resultados if r.papel != "essencial" and not r.ok]
    linhas += [
        "",
        f"**Total:** {sum(r.ok for r in resultados)} OK de {len(resultados)}; falhas essenciais: {len(falhas_essenciais)}; outras falhas: {len(falhas_outras)}.",
        "",
        "## Não dá para testar daqui",
        "",
        "- **GitHub Actions:** esta verificação rodou no meu computador. O robô vai rodar nos servidores do GitHub "
        "(outros endereços de rede), e o BCB, o IBGE ou o Tesouro podem tratá-los de outro jeito. "
        "Falta rodar este mesmo script lá, antes de montar o robô diário.",
    ]
    (RAIZ / "docs" / "auditoria").mkdir(parents=True, exist_ok=True)
    caminho = RAIZ / "docs" / "auditoria" / f"verificacao_fontes_{HOJE.isoformat()}.md"
    caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8", newline="\n")
    for r in resultados:
        print(
            f"{'OK   ' if r.ok else 'FALHA'} [{r.papel[:5]}] {r.fonte} ({r.ms / 1000:.1f} s)\n        {r.detalhe}"
        )
    print(
        f"\n{sum(r.ok for r in resultados)} OK de {len(resultados)}; essenciais com falha: {len(falhas_essenciais)}; relatório: {caminho}"
    )
    return 1 if falhas_essenciais else 0


if __name__ == "__main__":
    sys.exit(principal())
