import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { num } from "../../js/formato.js";
import { Dica } from "./dicas";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** o que a coluna quer dizer, em um balão no título */
    ajuda?: string;
    /** números ficam à direita, em algarismos de mesma largura */
    numerica?: boolean;
    /** largura mínima (CSS) */
    largura?: string;
    /** texto da célula no CSV; sem isso vale o valor cru da coluna */
    csv?: (linha: TData) => string | number;
  }
}

type Props<T> = {
  dados: T[];
  colunas: ColumnDef<T, any>[];
  legenda: string;
  nomeDoArquivo?: string;
  busca?: string;
  ordemInicial?: SortingState;
  altura?: string;
  vazio?: ReactNode;
  idDaLinha?: (linha: T, i: number) => string;
  /** controles extras (filtros) ao lado da busca */
  extras?: ReactNode;
};

const aspas = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

/**
 * Tabela com ordenação (clique no título), busca, cabeçalho que fica no alto ao rolar, balão em cada coluna e
 * "baixar CSV" (separado por ponto e vírgula e com acento certo para abrir direto no Excel em português).
 */
export function Tabela<T>({ dados, colunas, legenda, nomeDoArquivo = "radar-pricing", busca, ordemInicial = [], altura = "34rem", vazio, idDaLinha, extras }: Props<T>) {
  const [ordem, setOrdem] = useState<SortingState>(ordemInicial);
  const [filtro, setFiltro] = useState("");
  const [compacta, setCompacta] = useState(false);
  const tabela = useReactTable({
    data: dados,
    columns: colunas,
    state: { sorting: ordem, globalFilter: filtro },
    onSortingChange: setOrdem,
    onGlobalFilterChange: setFiltro,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: idDaLinha,
    globalFilterFn: (linha, _id, valor) => {
      const termo = String(valor).trim().toLowerCase();
      return !termo || linha.getAllCells().some((c) => String(c.getValue() ?? "").toLowerCase().includes(termo));
    },
    enableSortingRemoval: false,
  });
  const linhas = tabela.getRowModel().rows;
  const total = dados.length;
  const visiveis = useMemo(() => tabela.getVisibleLeafColumns(), [tabela, colunas]);

  const baixaCsv = () => {
    const cab = visiveis.map((c) => aspas(typeof c.columnDef.header === "string" ? c.columnDef.header : c.id)).join(";");
    const corpo = linhas.map((l) => visiveis.map((c) => aspas(c.columnDef.meta?.csv ? c.columnDef.meta.csv(l.original) : l.getValue(c.id))).join(";")).join("\r\n");
    const arq = new Blob([`﻿${cab}\r\n${corpo}\r\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(arq);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeDoArquivo}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-linha bg-folha shadow-[var(--sombra)]">
      <div className="nao-imprime flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2.5">
        {busca ? (
          <label className="relative min-w-[11rem] flex-1">
            <span className="sr-only">{busca}</span>
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tinta3" aria-hidden />
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder={busca}
              className="w-full rounded-lg border border-linha bg-folha2 py-1.5 pl-8 pr-8 text-sm text-tinta outline-none placeholder:text-tinta3 focus:border-marca"
            />
            {filtro ? (
              <button type="button" aria-label="Limpar a busca" onClick={() => setFiltro("")} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent p-0 text-tinta3 hover:text-tinta">
                <X size={14} />
              </button>
            ) : null}
          </label>
        ) : null}
        {extras}
        <span className="ml-auto flex items-center gap-1 text-xs text-tinta3" aria-live="polite">
          <span className="num">{filtro ? `${num(linhas.length, 0)} de ${num(total, 0)}` : num(total, 0)}</span> {total === 1 ? "linha" : "linhas"}
        </span>
        <Dica texto={compacta ? "Voltar ao espaçamento confortável" : "Mostrar mais linhas na tela"}>
          <button type="button" onClick={() => setCompacta((c) => !c)} aria-pressed={compacta} className="rounded-lg border border-linha bg-transparent px-2 py-1 text-xs font-semibold text-tinta2 hover:border-marca hover:text-marca aria-pressed:border-marca aria-pressed:text-marca">
            Compacta
          </button>
        </Dica>
        <Dica texto="Baixar o que está na tela em CSV (abre direto no Excel)">
          <button type="button" onClick={baixaCsv} disabled={linhas.length === 0} className="inline-flex items-center gap-1 rounded-lg border border-linha bg-transparent px-2 py-1 text-xs font-semibold text-tinta2 hover:border-marca hover:text-marca disabled:opacity-40">
            <Download size={13} aria-hidden /> CSV
          </button>
        </Dica>
      </div>
      <div className="rolagem overflow-auto" style={{ maxHeight: altura }} tabIndex={0} role="region" aria-label={legenda}>
        <table className="w-full min-w-max text-left text-sm">
          <caption className="sr-only">{legenda}</caption>
          <thead>
            {tabela.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const sentido = h.column.getIsSorted();
                  const titulo = flexRender(h.column.columnDef.header, h.getContext());
                  const Seta = sentido === "asc" ? ArrowUp : sentido === "desc" ? ArrowDown : ChevronsUpDown;
                  const botao = (
                    <button
                      type="button"
                      onClick={h.column.getToggleSortingHandler()}
                      className={`inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[0.7rem] font-bold uppercase tracking-[0.07em] ${sentido ? "text-tinta" : "text-tinta3"} hover:text-tinta ${meta?.numerica ? "flex-row-reverse" : ""}`}
                    >
                      {titulo}
                      <Seta size={12} className={sentido ? "text-marca" : "opacity-50"} aria-hidden />
                    </button>
                  );
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sentido === "asc" ? "ascending" : sentido === "desc" ? "descending" : "none"}
                      className={`sticky top-0 z-10 border-b border-linha2 bg-folha2 px-3 py-2.5 ${meta?.numerica ? "text-right" : ""}`}
                      style={{ minWidth: meta?.largura }}
                    >
                      {meta?.ajuda ? <Dica texto={meta.ajuda}>{botao}</Dica> : botao}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={visiveis.length} className="px-4 py-10 text-center text-sm text-tinta3">
                  {vazio ?? (filtro ? `Nada encontrado para "${filtro}".` : "Sem dados nesta foto.")}
                </td>
              </tr>
            ) : (
              linhas.map((l) => (
                <tr key={l.id} className="group">
                  {l.getVisibleCells().map((c) => (
                    <td key={c.id} className={`border-b border-linha/70 px-3 ${compacta ? "py-1" : "py-2.5"} group-hover:bg-folha2 ${c.column.columnDef.meta?.numerica ? "num text-right" : ""}`}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
