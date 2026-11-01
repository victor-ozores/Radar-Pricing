"""Abre o .xlsx do painel no Excel de verdade (Windows, com o Excel instalado) e confere as fórmulas.

Três conferências, nesta ordem:
  1. O arquivo abre e todas as fórmulas, recalculadas pelo Excel, dão o valor que o painel deixou guardado
     (nenhuma com erro, nenhuma diferente).
  2. Exporta cada aba para PDF (opcional, para olhar o visual), ainda com os valores de exemplo.
  3. Troca as células amarelas das três calculadoras por outros valores e compara os resultados do Excel com
     os do JavaScript do painel (site/js/calc.js), rodado no Node com os mesmos números.

Uso: python scripts/confere_excel.py radar-pricing-2026-10-31.xlsx foto.json [--pdf pasta]
O arquivo nunca é salvo: o Excel abre em modo somente leitura e fecha sem gravar.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
AJUDA = RAIZ / "tests" / "node" / "ajuda.mjs"
ERRO_DO_EXCEL = -2146826000  # os erros (#DIV/0!, #N/A...) chegam como inteiros abaixo deste valor

# rótulo na coluna B -> campo do resultado em calc.js
SAIDAS = {
    "cancelada": {
        "Taxa do Tesouro no prazo (% a.a.)": "taxa_ancora",
        "Taxa de desconto (% a.a.)": "taxa_desconto",
        "Valor presente (R$)": "valor_presente",
        "Em % do valor a receber": "pct_do_valor",
    },
    "retorno": {
        "Retorno ao ano (% a.a.)": "retorno_aa",
        "Retorno no prazo todo (%)": "retorno_total",
        "Taxa do Tesouro no prazo (% a.a.)": "taxa_ancora",
        "Retorno-alvo usado (% a.a.)": "alvo",
        "Preço máximo (R$)": "preco_maximo",
        "Folga (R$)": "folga",
    },
    "ativa": {
        "Valor presente do crédito (R$)": "vp_credito",
        "Valor presente das parcelas (R$)": "vp_parcelas",
        "Valor da cota hoje (R$)": "valor_da_cota",
        "Em % do crédito": "pct_do_credito",
        "Total das parcelas, sem descontar (R$)": "total_das_parcelas",
    },
}
ABAS = {"cancelada": "Cota cancelada", "retorno": "Retorno da oferta", "ativa": "Cota ativa"}
ENTRADAS = {
    "cancelada": {
        "valor": "Valor a receber (R$)",
        "meses": "Meses até receber",
        "corrigido": "Corrigido pela inflação?",
    },
    "retorno": {
        "preco": "Preço que vou pagar (R$)",
        "valor": "Valor que vou receber (R$)",
        "meses": "Meses até receber",
        "corrigido": "Corrigido pela inflação?",
        "alvoPct": "Retorno-alvo (% a.a.), se quiser",
    },
    "ativa": {
        "credito": "Valor do crédito (R$)",
        "parcela": "Parcela mensal (R$)",
        "parcelas": "Parcelas que faltam",
        "contemplacao": "Contemplação daqui a (meses)",
    },
}

CENARIOS = [
    {"calc": "cancelada", "entrada": {"valor": 12345.67, "meses": 30, "corrigido": False, "spreadPP": 3.5}},
    {"calc": "cancelada", "entrada": {"valor": 80000, "meses": 7, "corrigido": True, "spreadPP": 0}},
    {"calc": "cancelada", "entrada": {"valor": 1000, "meses": 120, "corrigido": True, "spreadPP": 9.25}},
    {
        "calc": "retorno",
        "entrada": {
            "preco": 800,
            "valor": 1000,
            "meses": 18,
            "corrigido": False,
            "alvoPct": 25,
            "spreadPP": 5,
        },
    },
    {
        "calc": "retorno",
        "entrada": {
            "preco": 38000,
            "valor": 50000,
            "meses": 40,
            "corrigido": True,
            "alvoPct": None,
            "spreadPP": 2,
        },
    },
    {
        "calc": "ativa",
        "entrada": {"credito": 80000, "parcela": 1500, "parcelas": 84, "contemplacao": 30, "spreadPP": 7.5},
    },
    {
        "calc": "ativa",
        "entrada": {"credito": 250000, "parcela": 2300, "parcelas": 200, "contemplacao": 0, "spreadPP": 5},
    },
    {
        "calc": "ativa",
        "entrada": {"credito": 30000, "parcela": 900, "parcelas": 36, "contemplacao": 36, "spreadPP": 4},
    },
]


def formulas_e_guardados(caminho: Path) -> dict[tuple[str, str], tuple[str, object]]:
    """Cada célula com fórmula: (aba, endereço) -> (fórmula, valor que o painel deixou guardado)."""
    com_formula = openpyxl.load_workbook(caminho)
    guardados = openpyxl.load_workbook(caminho, data_only=True)
    saida = {}
    for ws in com_formula.worksheets:
        for linha in ws.iter_rows():
            for c in linha:
                if c.data_type == "f":
                    saida[(ws.title, c.coordinate)] = (c.value, guardados[ws.title][c.coordinate].value)
    return saida


def parecidos(a: object, b: object) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-9 * max(1.0, abs(b))
    return a == b


def acha_linha(ws, rotulo: str, limite: int = 80) -> int:
    for linha in range(1, limite):
        if ws.Cells(linha, 2).Value2 == rotulo:
            return linha
    raise LookupError(f"rótulo não encontrado em {ws.Name}: {rotulo}")


def roda_no_node(foto: Path, cenarios: list[dict]) -> list[dict]:
    r = subprocess.run(
        ["node", str(AJUDA), "cenarios", str(foto), "-"],
        input=json.dumps(cenarios),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(r.stdout)


def confere(caminho: Path, foto: Path, pasta_pdf: Path | None) -> int:
    import win32com.client  # só no Windows, com o pywin32 instalado

    problemas = 0
    guardados = formulas_e_guardados(caminho)
    print(f"Fórmulas no arquivo: {len(guardados)}")
    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    try:
        wb = excel.Workbooks.Open(str(caminho), 0, True)
        print(
            f"ABRIU no Excel {excel.Version}: {wb.Worksheets.Count} abas ->",
            [ws.Name for ws in wb.Worksheets],
        )

        # 1. as fórmulas recalculadas pelo Excel batem com o valor guardado
        excel.CalculateFull()
        erros, diferentes = [], []
        for (aba, endereco), (_, guardado) in guardados.items():
            valor = wb.Worksheets(aba).Range(endereco).Value2
            if isinstance(valor, int) and valor < ERRO_DO_EXCEL:
                erros.append((aba, endereco, valor))
            elif not parecidos(valor, guardado):
                diferentes.append((aba, endereco, guardado, valor))
        print(
            f"1. Recalculado pelo Excel: {len(guardados) - len(erros) - len(diferentes)} iguais, "
            f"{len(diferentes)} diferentes, {len(erros)} com erro"
        )
        for item in (erros + diferentes)[:15]:
            print("   ", item)
        problemas += len(erros) + len(diferentes)

        # 2. PDF de cada aba, com os valores de exemplo (antes de trocar as células amarelas)
        if pasta_pdf:
            pasta_pdf.mkdir(parents=True, exist_ok=True)
            for i, ws in enumerate(wb.Worksheets, start=1):
                if ws.Name in ("Observações", "Cota ativa (cálculo)"):
                    continue  # centenas de linhas: só conferi que abrem
                ws.ExportAsFixedFormat(0, str(pasta_pdf / f"{i:02d}.pdf"))
            print(f"2. PDFs em {pasta_pdf}")
        # 3. outros valores nas células amarelas: Excel contra o JavaScript do painel
        esperados = roda_no_node(foto, CENARIOS)
        hoje = wb.Worksheets("Hoje")
        linha_spread = acha_linha(hoje, "Spread de risco (p.p.)")
        falhas = 0
        for cenario, esperado in zip(CENARIOS, esperados, strict=True):
            tipo, entrada = cenario["calc"], cenario["entrada"]
            ws = wb.Worksheets(ABAS[tipo])
            hoje.Cells(linha_spread, 3).Value2 = entrada["spreadPP"]
            for campo, rotulo in ENTRADAS[tipo].items():
                valor = entrada[campo]
                if campo == "corrigido":
                    valor = "Sim" if valor else "Não"
                ws.Cells(acha_linha(ws, rotulo), 3).Value2 = valor  # None esvazia a célula
            excel.Calculate()
            for rotulo, campo in SAIDAS[tipo].items():
                do_excel = ws.Cells(acha_linha(ws, rotulo), 3).Value2
                if not parecidos(do_excel, esperado[campo]):
                    falhas += 1
                    print(f"   DIFERENÇA {tipo} {entrada}: {rotulo}: Excel={do_excel} JS={esperado[campo]}")
        print(f"3. Cenários com outros valores: {len(CENARIOS)} (Excel x JavaScript): {falhas} diferenças")
        problemas += falhas

        wb.Close(False)
    finally:
        excel.Quit()
    return 1 if problemas else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx", type=Path)
    ap.add_argument("foto", type=Path, help="o JSON da foto de que o Excel foi feito")
    ap.add_argument("--pdf", type=Path, help="pasta onde gravar um PDF por aba")
    args = ap.parse_args()
    if sys.platform != "win32" or shutil.which("node") is None:
        print("Precisa de Windows com Excel e do Node instalados.", file=sys.stderr)
        return 2
    return confere(args.xlsx.resolve(), args.foto.resolve(), args.pdf)


if __name__ == "__main__":
    sys.exit(main())
