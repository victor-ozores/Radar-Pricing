import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHOQUES_PP, impactoNoPrazo, sensibilidade } from "../../js/calc.js";
import { num, numComMenos, pct, pp, prazoEmTexto, reais, sinal } from "../../js/formato.js";
import type { Estado } from "../tipos";
import { Segmentado } from "../ui/blocos";
import { Termo } from "../ui/dicas";
import { Balao, COR, EIXO, GRADE, Quadro } from "./base";

const semMovimento = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// ------------------------------------------------------------------------------------------------ o que mudou no valor de hoje
type Linha = { meses: number; dias: number; taxa_hoje: number; taxa_antes: number; vp_hoje: number; vp_antes: number; variacao_pct: number };

export function ImpactoNoValor({ estado }: { estado: Estado }) {
  const [id, setId] = useState<"nominal" | "real">(estado.curvas.nominal ? "nominal" : "real");
  const { parametros: par, spread } = estado;
  const curva = estado.curvas[id];
  const linhas = useMemo(() => (curva ? (par.prazos_meses as number[]).map((m) => impactoNoPrazo(curva, m, spread, par.valor_face) as Linha | null).filter((x): x is Linha => x !== null) : []), [curva, par, spread]);
  const opcoes = [estado.curvas.nominal && { id: "nominal" as const, nome: "Em R$ fixos" }, estado.curvas.real && { id: "real" as const, nome: "Corrigido pelo IPCA" }].filter(Boolean) as { id: "nominal" | "real"; nome: string }[];
  if (!curva || linhas.length === 0) return null;
  const dados = linhas.map((l) => ({ ...l, rotulo: prazoEmTexto(l.meses) }));
  const maior = Math.max(...dados.map((d) => Math.abs(d.variacao_pct)));
  const limite = Math.max(2, Math.ceil(maior / 2) * 2 + 2); // par, para os cinco marcos do eixo serem inteiros
  const animar = !semMovimento();
  return (
    <Quadro
      titulo={
        <>
          Quanto mudou, em {linhas[0].dias} dias, o <Termo id="valorPresente">valor de hoje</Termo> de {reais(par.valor_face, 0)} a receber
        </>
      }
      subtitulo={`Em cada prazo, com spread de risco de ${num(spread, 1)} p.p. (exemplo). Variação em %.`}
      acoes={opcoes.length > 1 ? <Segmentado valor={id} aoMudar={setId} rotulo="Tipo de valor a receber" opcoes={opcoes} /> : null}
      tabela={{
        colunas: ["Prazo", "Taxa de 7 dias atrás", "Taxa de hoje", "Valor há 7 dias", "Valor hoje", "Variação"],
        linhas: dados.map((d) => [d.rotulo, pct(d.taxa_antes), pct(d.taxa_hoje), reais(d.vp_antes), reais(d.vp_hoje), `${sinal(d.variacao_pct, 2)}%`]),
      }}
    >
      <div className="h-[16rem] w-full" role="img" aria-label={`Variação do valor de hoje de ${reais(par.valor_face, 0)} em cada prazo: ${dados.map((d) => `${d.rotulo} ${sinal(d.variacao_pct, 1)}%`).join(", ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="rotulo" {...EIXO} />
            <YAxis {...EIXO} axisLine={false} width={48} domain={[-limite, limite]} ticks={[-limite, -limite / 2, 0, limite / 2, limite]} tickFormatter={(v: number) => `${numComMenos(v, 0)}%`} />
            <ReferenceLine y={0} stroke="var(--linha-2)" />
            <Tooltip
              cursor={{ fill: "var(--folha-2)" }}
              content={({ active, payload }) => {
                const d = active && payload?.[0]?.payload;
                if (!d) return null;
                const sobeu = d.taxa_hoje > d.taxa_antes;
                return (
                  <Balao
                    titulo={`Receber em ${d.rotulo}`}
                    linhas={[
                      { cor: COR.s1, nome: "Valor hoje", valor: reais(d.vp_hoje), destaque: true },
                      { cor: COR.s1, nome: `Valor há ${d.dias} dias`, valor: reais(d.vp_antes), tracejado: true },
                      { cor: COR.s1, nome: "Variação", valor: `${sinal(d.variacao_pct, 2)}%` },
                    ]}
                    nota={`A taxa do prazo ${sobeu ? "subiu" : d.taxa_hoje < d.taxa_antes ? "caiu" : "ficou igual"}: ${pct(d.taxa_antes)} → ${pct(d.taxa_hoje)} (${pp(d.taxa_hoje - d.taxa_antes)}).`}
                  />
                );
              }}
            />
            <Bar dataKey="variacao_pct" radius={[5, 5, 5, 5]} maxBarSize={44} isAnimationActive={animar}>
              {dados.map((d) => (
                <Cell key={d.meses} fill={d.variacao_pct < 0 ? COR.s2 : COR.s1} />
              ))}
              <LabelList dataKey="variacao_pct" position="top" formatter={(v: unknown) => `${sinal(Number(v), 1)}%`} fill="var(--tinta)" fontSize={12} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: COR.s2 }} /> o valor caiu (a taxa subiu)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: COR.s1 }} /> o valor subiu (a taxa caiu)
        </span>
      </p>
    </Quadro>
  );
}

// ------------------------------------------------------------------------------------------------ e se a taxa andar?
/** Cor de fundo de uma célula de variação: azul para valor que sobe, laranja para valor que cai, mais forte quanto maior. */
function fundo(variacao: number, maxima: number) {
  if (Math.abs(variacao) < 0.005 || maxima === 0) return undefined;
  const forca = Math.min(1, Math.abs(variacao) / maxima);
  const cor = variacao > 0 ? "var(--s1)" : "var(--s2)";
  return `color-mix(in srgb, ${cor} ${Math.round(8 + forca * 40)}%, var(--folha))`;
}

/** A tabela de sensibilidade: o valor de hoje de R$ 1.000 a receber em cada prazo, se a taxa andar de −3 a +3 p.p. */
export function MapaDeSensibilidade({ estado, id = "nominal" }: { estado: Estado; id?: "nominal" | "real" }) {
  const { parametros: par, spread } = estado;
  const [qual, setQual] = useState<"nominal" | "real">(estado.curvas[id] ? id : estado.curvas.nominal ? "nominal" : "real");
  const curva = estado.curvas[qual];
  const linhas = useMemo(() => (curva ? sensibilidade(curva, par.prazos_meses, spread, par.valor_face) : null), [curva, par, spread]);
  const opcoes = [estado.curvas.nominal && { id: "nominal" as const, nome: "Em R$ fixos" }, estado.curvas.real && { id: "real" as const, nome: "Corrigido pelo IPCA" }].filter(Boolean) as { id: "nominal" | "real"; nome: string }[];
  if (!linhas) return null;
  const maxima = Math.max(...linhas.flatMap((l: any) => l.celulas.map((c: any) => Math.abs(c.variacao_pct))));
  return (
    <Quadro
      titulo={
        <>
          E se a <Termo id="taxaDeDesconto">taxa de desconto</Termo> andar? O valor de hoje de {reais(par.valor_face, 0)} a receber
        </>
      }
      subtitulo={`Cada linha é um prazo; cada coluna, quanto a taxa do Tesouro sobe ou cai em todos os prazos. Spread de risco: ${num(spread, 1)} p.p. (exemplo).`}
      acoes={opcoes.length > 1 ? <Segmentado valor={qual} aoMudar={setQual} rotulo="Tipo de valor a receber" opcoes={opcoes} /> : null}
    >
      <div className="rolagem overflow-x-auto">
        <table className="num w-full min-w-[34rem] text-center text-sm">
          <caption className="sr-only">Valor de hoje, em reais, e a variação contra hoje, para cada prazo e cada mudança da taxa em pontos percentuais</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-2 text-left text-[0.7rem] font-bold uppercase tracking-wider text-tinta3">
                Prazo
              </th>
              {CHOQUES_PP.map((c: number) => (
                <th key={c} scope="col" className={`px-2 py-2 text-[0.72rem] font-bold ${c === 0 ? "text-tinta" : "text-tinta3"}`}>
                  {c === 0 ? "Hoje" : `${c > 0 ? "+" : "−"}${Math.abs(c)} p.p.`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l: any) => (
              <tr key={l.meses}>
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left text-sm font-semibold text-tinta2">
                  {prazoEmTexto(l.meses)}
                  <span className="block text-[0.7rem] font-normal text-tinta3">taxa {pct(l.taxa)}</span>
                </th>
                {l.celulas.map((c: any) => (
                  <td key={c.choque} className={`border border-folha px-1 py-1.5 ${c.choque === 0 ? "font-bold ring-1 ring-inset ring-linha2" : ""}`} style={{ background: fundo(c.variacao_pct, maxima) }} title={`${prazoEmTexto(l.meses)}, taxa ${c.choque === 0 ? "de hoje" : `${sinal(c.choque, 0)} p.p.`}: ${reais(c.valor)}`}>
                    <span className="block font-semibold text-tinta">{num(c.valor, 0)}</span>
                    <span className="block text-[0.7rem] text-tinta2">{c.choque === 0 ? "base" : `${sinal(c.variacao_pct, 1)}%`}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-2 text-xs text-tinta3">Valores em R$. Laranja: o valor cai. Azul: o valor sobe. Quanto mais longo o prazo, mais a mesma mudança de taxa pesa.</p>
    </Quadro>
  );
}
