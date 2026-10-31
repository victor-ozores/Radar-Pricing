"""Formato único dos dados: todo coletor devolve `Registro`s; cada fonte vira uma `SituacaoFonte`."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass(frozen=True, slots=True)
class Registro:
    """Uma observação: o valor de uma série, numa data de referência, com uma dimensão opcional."""

    fonte: str
    serie: str
    descricao: str
    data_ref: date
    valor: float
    unidade: str
    # dimensão: "banco=CAIXA ECONOMICA FEDERAL", "ano=2027" ou "titulo=Tesouro IPCA+|vencimento=2035-05-15"
    dimensao: str = ""

    def como_dict(self) -> dict[str, Any]:
        return {
            "fonte": self.fonte,
            "serie": self.serie,
            "dimensao": self.dimensao,
            "data_ref": self.data_ref.isoformat(),
            "valor": self.valor,
            "unidade": self.unidade,
            "descricao": self.descricao,
        }


@dataclass
class ResultadoFonte:
    """O que um coletor devolve. Falha de uma série não apaga as outras: ela entra em `falhas`."""

    registros: list[Registro] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)  # estranhezas que não impedem o uso
    atrasos: list[str] = field(default_factory=list)  # séries com o dado mais novo velho demais
    falhas: list[str] = field(default_factory=list)  # séries que não vieram
    extras: dict[str, Any] = field(default_factory=dict)  # metadados para o painel (ex.: links da ABAC)


@dataclass
class SituacaoFonte:
    """Linha do manifesto: como cada fonte se saiu hoje."""

    id: str
    papel: str  # essencial | complementar
    situacao: str  # ok | atrasado | parcial | falhou
    n_registros: int
    ultimo_dado: date | None
    idade_dias: int | None
    tempo_s: float
    erro: str | None = None
    avisos: list[str] = field(default_factory=list)
    atrasos: list[str] = field(default_factory=list)
    falhas: list[str] = field(default_factory=list)
    extras: dict[str, Any] = field(default_factory=dict)

    def como_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "papel": self.papel,
            "situacao": self.situacao,
            "n_registros": self.n_registros,
            "ultimo_dado": self.ultimo_dado.isoformat() if self.ultimo_dado else None,
            "idade_dias": self.idade_dias,
            "tempo_s": round(self.tempo_s, 2),
            "erro": self.erro,
            "avisos": self.avisos,
            "atrasos": self.atrasos,
            "falhas": self.falhas,
            "extras": self.extras,
        }


@dataclass
class Foto:
    """A foto do dia: manifesto de qualidade + registros. Depois de gravada, nunca é reescrita."""

    data: date
    gerado_em: str  # ISO, horário de Brasília
    status: str  # ok | parcial
    fontes: list[SituacaoFonte]
    conferencias: list[str]
    registros: list[Registro]
    derivados: dict[str, Any] = field(default_factory=dict)
    mudancas: list[dict[str, Any]] = field(default_factory=list)

    def como_dict(self) -> dict[str, Any]:
        return {
            "versao": 1,
            "data": self.data.isoformat(),
            "gerado_em": self.gerado_em,
            "status": self.status,
            "fontes": [f.como_dict() for f in self.fontes],
            "conferencias": self.conferencias,
            "derivados": self.derivados,
            "mudancas": self.mudancas,
            "registros": [r.como_dict() for r in self.registros],
        }
