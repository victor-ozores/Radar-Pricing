import * as Switch from "@radix-ui/react-switch";
import { useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cotaAtiva, cotaCancelada, EXEMPLOS, MAX_PARCELAS, retornoDaOferta } from "../../js/calc.js";
import { num, pct, prazoEmTexto, reais } from "../../js/formato.js";
import { useDados, useEstado } from "../dados";
import { Balao, COR, EIXO, GRADE } from "../graficos/base";
import { enderecoDa } from "../rota";
import { Campo, Contagem, Selo } from "../ui/blocos";
import { Delta } from "../ui/Delta";
import { Termo } from "../ui/dicas";

const ABAS = [
  { id: "cancelada", nome: "Cota cancelada", resumo: "Quanto vale hoje o dinheiro que o grupo vai devolver" },
  { id: "oferta", nome: "Retorno de uma oferta", resumo: "Quanto rende e qual o preço máximo" },
  { id: "ativa", nome: "Cota ativa", resumo: "O crédito menos as parcelas, em valor de hoje" },
] as const;

// ------------------------------------------------------------------------------------------------ peças
function Interruptor({ ligado, aoMudar, rotulo, ajuda }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: ReactNode; ajuda: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Switch.Root
        checked={ligado}
        onCheckedChange={aoMudar}
        aria-label="Valor corrigido pela inflação"
        className="relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 bg-linha2 p-0 transition-colors data-[state=checked]:bg-marca"
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
      <div>
        <p className="m-0 text-[0.8125rem] font-semibold text-tinta2">{rotulo}</p>
        <p className="m-0 text-xs text-tinta3">{ajuda}</p>
      </div>
    </div>
  );
}

function Resultado({ rotulo, valor, formato, nota, tom = "marca" }: { rotulo: ReactNode; valor: number; formato: (n: number) => string; nota?: ReactNode; tom?: "marca" | "sobe" }) {
  return (
    <div className="rounded-2xl border border-marca/25 bg-marca2 p-5">
      <p className="rotulo m-0 text-marca">{rotulo}</p>
      <p className={`display num m-0 mt-1 text-[2.6rem] font-semibold leading-none tracking-tight md:text-[3.2rem] ${tom === "sobe" ? "text-sobe" : "text-tinta"}`}>
        <Contagem valor={valor} formato={formato} />
      </p>
      {nota ? <p className="m-0 mt-2 text-[0.9rem] leading-snug text-tinta2">{nota}</p> : null}
    </div>
  );
}

function ComoFoiCalculado({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-linha bg-folha">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-tinta2 hover:text-marca [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>Como foi calculado
      </summary>
      <div className="border-t border-linha px-4 py-3 text-[0.875rem] leading-relaxed text-tinta2">{children}</div>
    </details>
  );
}

function Aviso({ extrapolado, curva }: { extrapolado: boolean; curva: { pontos: { anos: number }[] } | null }) {
  if (!extrapolado || !curva?.pontos.length) return null;
  const anos = curva.pontos.map((p) => p.anos);
  return (
    <p className="m-0 rounded-xl border border-aviso/30 bg-aviso2 px-3 py-2 text-[0.8125rem] text-aviso" role="note">
      A curva do Tesouro só cobre prazos de {num(Math.min(...anos), 1)} a {num(Math.max(...anos), 1)} anos. Para este prazo usei a taxa da ponta mais próxima, então o resultado é uma estimativa.
    </p>
  );
}

/** Uma tabela pequena de "e se": cada linha com uma barra proporcional ao valor. */
function ESe({ titulo, linhas }: { titulo: string; linhas: { rotulo: string; valor: number; texto: string; atual: boolean; extra?: string }[] }) {
  const maximo = Math.max(...linhas.map((l) => Math.abs(l.valor)), 1);
  return (
    <div className="rounded-2xl border border-linha bg-folha p-4">
      <h3 className="m-0 mb-2 font-sans text-sm font-semibold text-tinta">{titulo}</h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {linhas.map((l) => (
          <li key={l.rotulo} className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-sm ${l.atual ? "bg-marca2 font-semibold" : ""}`}>
            <span className="text-tinta2">{l.rotulo}</span>
            <span className="h-2 overflow-hidden rounded-full bg-linha/70" aria-hidden>
              <span className="block h-full rounded-full bg-[color:var(--s1)]" style={{ width: `${Math.max(2, (Math.abs(l.valor) / maximo) * 100)}%`, opacity: l.atual ? 1 : 0.55 }} />
            </span>
            <span className="num text-right text-tinta">
              {l.texto}
              {l.extra ? <span className="ml-1.5 text-xs font-normal text-tinta3">{l.extra}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ cota cancelada
function Cancelada() {
  const { curvas, spread } = useEstado();
  const [valor, setValor] = useState(EXEMPLOS.cancelada.valor);
  const [meses, setMeses] = useState(EXEMPLOS.cancelada.meses);
  const [corrigido, setCorrigido] = useState(EXEMPLOS.cancelada.corrigido);
  const r = useMemo(() => cotaCancelada({ valor, meses, corrigido, spreadPP: spread }, curvas), [valor, meses, corrigido, spread, curvas]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="folha flex flex-col gap-4 self-start p-5">
        <Campo rotulo="Valor que o grupo vai devolver" valor={valor} aoMudar={setValor} prefixo="R$" min={1} max={1e9} ajuda="O que a administradora paga a quem desistiu, no fim do grupo." />
        <Campo rotulo="Daqui a quantos meses" valor={meses} aoMudar={(v) => setMeses(Math.round(v))} sufixo="meses" casas={0} min={1} max={360} passo={1} ajuda={`${prazoEmTexto(meses)}. Em consórcio, o grupo costuma devolver só no fim.`} />
        <Interruptor ligado={corrigido} aoMudar={setCorrigido} rotulo="Corrigido pela inflação" ajuda={corrigido ? "O valor sobe com o IPCA até a data. Resultado em reais de hoje." : "O valor é fixo em reais, sem correção."} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {r ? (
          <>
            <Resultado
              rotulo="Vale hoje"
              valor={r.valor_presente}
              formato={(n) => reais(n)}
              nota={
                <>
                  Isso é <strong>{num(r.pct_do_valor, 1)}%</strong> dos {reais(valor, 0)} que serão devolvidos em {prazoEmTexto(meses)}. Foi descontado pela <Termo id="taxaDeDesconto">taxa de desconto</Termo> de {pct(r.taxa_desconto)} ao ano.
                </>
              }
            />
            <Aviso extrapolado={r.extrapolado} curva={corrigido ? curvas.real : curvas.nominal} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ESe titulo="E se o prazo fosse outro?" linhas={r.prazos.map((p: any) => ({ rotulo: prazoEmTexto(p.meses), valor: p.valor_presente, texto: reais(p.valor_presente, 0), atual: p.meses === meses, extra: `${num(p.pct_do_valor, 0)}%` }))} />
              <ESe titulo="E se o spread de risco fosse outro?" linhas={r.spreads.map((s: any) => ({ rotulo: `${num(s.spread, 1)} p.p.`, valor: s.valor_presente, texto: reais(s.valor_presente, 0), atual: s.spread === spread, extra: `${num(s.pct_do_valor, 0)}%` }))} />
            </div>
            <ComoFoiCalculado>
              <p className="m-0">
                Taxa do Tesouro {corrigido ? "IPCA+" : "Prefixado"} para {prazoEmTexto(meses)}: {pct(r.taxa_ancora, 4)} (interpolada entre os vencimentos vizinhos). Somando o spread de {num(spread, 1)} p.p., a taxa de desconto é {pct(r.taxa_desconto, 4)} ao ano.
              </p>
              <p className="m-0 mt-2 num">
                {reais(valor)} ÷ (1 + {num(r.taxa_desconto, 4)}%)<sup>{meses}/12</sup> = <strong>{reais(r.valor_presente)}</strong>
              </p>
              <p className="m-0 mt-2 text-tinta3">{corrigido ? "Com correção pelo IPCA, o valor e a taxa são reais: o resultado já está em reais de hoje." : "Sem correção, a conta usa a curva do Tesouro Prefixado (taxa fixa)."} Exemplo de demonstração: não é preço nem recomendação.</p>
            </ComoFoiCalculado>
          </>
        ) : (
          <p className="folha m-0 p-5 text-tinta2">Preencha um valor e um prazo para ver quanto vale hoje. Esta foto precisa ter a curva do Tesouro {corrigido ? "IPCA+" : "Prefixado"}.</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ retorno de uma oferta
function Oferta() {
  const { curvas, spread, foto } = useEstado();
  const [preco, setPreco] = useState(EXEMPLOS.retorno.preco);
  const [valor, setValor] = useState(EXEMPLOS.retorno.valor);
  const [meses, setMeses] = useState(EXEMPLOS.retorno.meses);
  const [corrigido, setCorrigido] = useState(EXEMPLOS.retorno.corrigido);
  const [alvo, setAlvo] = useState<number | null>(null);
  const cdi = foto.derivados.ancoras.cdi_anualizado?.taxa ?? null;
  const r = useMemo(() => retornoDaOferta({ preco, valor, meses, corrigido, alvoPct: alvo ?? NaN, spreadPP: spread }, curvas, cdi ?? NaN), [preco, valor, meses, corrigido, alvo, spread, curvas, cdi]);
  const folgaPositiva = r ? r.folga >= 0 : false;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="folha flex flex-col gap-4 self-start p-5">
        <Campo rotulo="Preço da oferta" valor={preco} aoMudar={setPreco} prefixo="R$" min={1} max={1e9} ajuda="O quanto você pagaria hoje." />
        <Campo rotulo="Valor que vai receber" valor={valor} aoMudar={setValor} prefixo="R$" min={1} max={1e9} ajuda="O que o grupo devolve no fim." />
        <Campo rotulo="Daqui a quantos meses" valor={meses} aoMudar={(v) => setMeses(Math.round(v))} sufixo="meses" casas={0} min={1} max={360} passo={1} ajuda={prazoEmTexto(meses)} />
        <Interruptor ligado={corrigido} aoMudar={setCorrigido} rotulo="Corrigido pela inflação" ajuda={corrigido ? "O retorno é acima da inflação." : "O retorno é em reais fixos, sem correção."} />
        <Campo rotulo="Retorno que você quer (opcional)" valor={alvo ?? r?.alvo ?? 0} aoMudar={setAlvo} sufixo="% a.a." min={0} max={100} passo={0.5} ajuda={alvo === null ? "Sem preencher, uso a taxa do Tesouro do prazo mais o spread." : "Define o preço máximo abaixo."} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {r ? (
          <>
            <Resultado
              rotulo="Esta oferta rende"
              valor={r.retorno_aa}
              formato={(n) => `${num(n, 2)}% ao ano`}
              nota={
                <>
                  Pagando {reais(preco, 0)} para receber {reais(valor, 0)} em {prazoEmTexto(meses)}, o ganho total é de {num(r.retorno_total, 1)}%{corrigido ? ", acima da inflação" : ""}. O <Termo id="desagio">deságio</Termo> é de {num((1 - preco / valor) * 100, 1)}%.
                </>
              }
            />
            <div className={`rounded-2xl border p-4 ${folgaPositiva ? "border-ok/30 bg-ok2" : "border-aviso/40 bg-aviso2"}`}>
              <p className="rotulo m-0">Para um retorno de {num(r.alvo, 2)}% ao ano{r.alvo_padrao ? " (Tesouro + spread)" : ""}</p>
              <p className="m-0 mt-1 text-[0.97rem] leading-snug text-tinta">
                O preço máximo é <strong className="num">{reais(r.preco_maximo)}</strong>. {folgaPositiva ? `A oferta está ${reais(r.folga)} abaixo disso: cabe no alvo.` : `A oferta está ${reais(Math.abs(r.folga))} acima disso: não chega no alvo.`}
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-folha p-4">
              <h3 className="m-0 mb-2 font-sans text-sm font-semibold text-tinta">Contra as referências de hoje</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {r.referencias.map((ref: any) => (
                  <li key={ref.nome} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-tinta2">{ref.nome}</span>
                    <span className="flex items-center gap-3">
                      <span className="num font-semibold text-tinta">{pct(ref.taxa)}</span>
                      <Delta valor={ref.diferenca_pp} tamanho="p" periodo="a oferta" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Aviso extrapolado={r.extrapolado} curva={corrigido ? curvas.real : curvas.nominal} />
            <ComoFoiCalculado>
              <p className="m-0 num">
                Retorno = ({reais(valor, 0)} ÷ {reais(preco, 0)})<sup>12/{meses}</sup> − 1 = <strong>{pct(r.retorno_aa, 4)}</strong> ao ano.
              </p>
              <p className="m-0 mt-2 num">
                Preço máximo = {reais(valor, 0)} ÷ (1 + {num(r.alvo, 2)}%)<sup>{meses}/12</sup> = <strong>{reais(r.preco_maximo)}</strong>.
              </p>
              <p className="m-0 mt-2 text-tinta3">Demonstração: o alvo padrão é a taxa do Tesouro para o prazo ({pct(r.taxa_ancora)}) mais o spread de {num(spread, 1)} p.p. Não considera imposto, taxas de transferência nem o risco de a administradora atrasar.</p>
            </ComoFoiCalculado>
          </>
        ) : (
          <p className="folha m-0 p-5 text-tinta2">Preencha o preço, o valor a receber e o prazo para ver o retorno.</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ cota ativa
function Ativa() {
  const { curvas, spread } = useEstado();
  const [credito, setCredito] = useState(EXEMPLOS.ativa.credito);
  const [parcela, setParcela] = useState(EXEMPLOS.ativa.parcela);
  const [parcelas, setParcelas] = useState(EXEMPLOS.ativa.parcelas);
  const [contemplacao, setContemplacao] = useState(EXEMPLOS.ativa.contemplacao);
  const k = Math.min(contemplacao, parcelas);
  const r = useMemo(() => cotaAtiva({ credito, parcela, parcelas, contemplacao: k, spreadPP: spread }, curvas.real), [credito, parcela, parcelas, k, spread, curvas.real]);
  const grafico = r?.cenarios.map((c: any) => ({ ...c, rotulo: c.contemplacao === 0 ? "Já" : `${c.contemplacao}` }));
  const animar = !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="folha flex flex-col gap-4 self-start p-5">
        <Campo rotulo="Crédito da carta" valor={credito} aoMudar={setCredito} prefixo="R$" min={1} max={1e9} ajuda="O valor que a pessoa recebe quando for contemplada." />
        <Campo rotulo="Parcela mensal" valor={parcela} aoMudar={setParcela} prefixo="R$" min={1} max={1e8} ajuda="Quanto paga por mês." />
        <Campo rotulo="Parcelas que faltam" valor={parcelas} aoMudar={(v) => setParcelas(Math.round(v))} casas={0} min={1} max={MAX_PARCELAS} passo={1} sufixo="parcelas" ajuda={`No máximo ${MAX_PARCELAS} (20 anos).`} />
        <Campo rotulo="Contemplação daqui a" valor={k} aoMudar={(v) => setContemplacao(Math.round(v))} casas={0} min={0} max={parcelas} passo={1} sufixo="meses" ajuda="0 = já contemplada. Não considera a chance de contemplar nem o lance." />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {r ? (
          <>
            <Resultado
              rotulo="A cota vale hoje"
              valor={r.valor_da_cota}
              formato={(n) => reais(n)}
              tom={r.valor_da_cota < 0 ? "sobe" : "marca"}
              nota={
                <>
                  É o crédito de {reais(credito, 0)} em valor de hoje ({reais(r.vp_credito)}) menos as {parcelas} parcelas em valor de hoje ({reais(r.vp_parcelas)}). Equivale a <strong>{num(r.pct_do_credito, 1)}%</strong> do crédito.
                </>
              }
            />
            <Aviso extrapolado={r.extrapolado} curva={curvas.real} />
            <div className="folha p-4 md:p-5">
              <h3 className="m-0 font-sans text-[0.95rem] font-semibold text-tinta">O valor da cota conforme o mês da contemplação</h3>
              <p className="m-0 mb-3 mt-0.5 text-[0.8125rem] text-tinta3">Quanto antes a carta é contemplada, mais vale a cota. O ponto marca o mês que você escolheu.</p>
              <div className="h-[15rem] w-full" role="img" aria-label={`Valor da cota por mês de contemplação: ${r.cenarios.map((c: any) => `mês ${c.contemplacao}: ${reais(c.valor_da_cota, 0)}`).join("; ")}.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={grafico} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
                    <CartesianGrid {...GRADE} />
                    <XAxis dataKey="contemplacao" type="number" domain={[0, "dataMax"]} {...EIXO} tickFormatter={(v: number) => (v === 0 ? "já" : `${v}`)} label={{ value: "meses até a contemplação", position: "insideBottom", offset: -2, fill: "var(--tinta-3)", fontSize: 12 }} height={42} />
                    <YAxis {...EIXO} axisLine={false} width={64} tickFormatter={(v: number) => num(v / 1000, 0) + " mil"} />
                    <Tooltip
                      cursor={{ stroke: "var(--linha-2)" }}
                      content={({ active, payload }) => {
                        const d = active && (payload?.[0]?.payload as any);
                        if (!d) return null;
                        return <Balao titulo={d.contemplacao === 0 ? "Já contemplada" : `Contemplada em ${prazoEmTexto(d.contemplacao)}`} linhas={[{ cor: COR.s1, nome: "Valor da cota", valor: reais(d.valor_da_cota), destaque: true }, { cor: COR.s1, nome: "% do crédito", valor: `${num(d.pct_do_credito, 1)}%` }]} />;
                      }}
                    />
                    <Line dataKey="valor_da_cota" stroke={COR.s1} strokeWidth={3} dot={{ r: 4, fill: COR.s1, stroke: "var(--folha)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--folha)", strokeWidth: 2 }} isAnimationActive={animar} />
                    <ReferenceDot x={k} y={r.valor_da_cota} r={8} fill="var(--folha)" stroke={COR.s2} strokeWidth={3} ifOverflow="extendDomain" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <ESe titulo="E se o spread de risco fosse outro?" linhas={r.spreads.map((s: any) => ({ rotulo: `${num(s.spread, 1)} p.p.`, valor: s.valor_da_cota, texto: reais(s.valor_da_cota, 0), atual: s.spread === spread, extra: `${num(s.pct_do_credito, 0)}%` }))} />
            <ComoFoiCalculado>
              <p className="m-0">Crédito e parcelas são corrigidos pelo mesmo índice, então tudo é descontado pela curva do Tesouro IPCA+ mais o spread de {num(spread, 1)} p.p., e o resultado fica em reais de hoje.</p>
              <p className="m-0 mt-2 num">
                Valor da cota = crédito ÷ (1 + taxa)<sup>{k}/12</sup> − Σ parcela ÷ (1 + taxa)<sup>mês/12</sup> = {reais(r.vp_credito)} − {reais(r.vp_parcelas)} = <strong>{reais(r.valor_da_cota)}</strong>.
              </p>
              <p className="m-0 mt-2 text-tinta3">
                Total de parcelas sem desconto: {reais(r.total_das_parcelas, 0)}. Um aumento do spread {r.spreads.length > 1 ? "não tem direção única" : "mexe"}: ele desconta o crédito <em>e</em> as parcelas, e o efeito líquido depende do prazo. Demonstração: não considera lance, seguro, fundo de reserva nem as regras de cada grupo.
              </p>
            </ComoFoiCalculado>
          </>
        ) : (
          <p className="folha m-0 p-5 text-tinta2">Preencha o crédito, a parcela e os prazos para ver o valor da cota. A contemplação não pode passar do número de parcelas.</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ tela
export function Calculadoras({ sub }: { sub: string | null }) {
  const aba = ABAS.find((a) => a.id === sub) ?? ABAS[0];
  const { spread, defineSpread, estado } = useDados();
  const padrao = estado?.parametros.spread_demonstracao_pp ?? 5;
  return (
    <div className="mx-auto max-w-[76rem] px-4 pb-20 pt-8 md:px-6 md:pt-12">
      <p className="rotulo m-0 mb-2">Calculadoras</p>
      <h1 className="m-0 max-w-[24ch] text-balance text-[2rem] font-semibold leading-[1.1] md:text-[2.8rem]">Quanto vale, em valor de hoje?</h1>
      <p className="mb-6 mt-3 max-w-[64ch] text-tinta2">
        Contas simples sobre as taxas do dia. Os valores já preenchidos são exemplos inventados: troque pelos seus. <Selo tom="aviso">Demonstração</Selo> Não é preço nem recomendação.
      </p>
      <nav aria-label="Calculadoras" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ABAS.map((a) => (
          <a key={a.id} href={enderecoDa("calculadoras", a.id)} aria-current={aba.id === a.id ? "page" : undefined} className="rounded-2xl border border-linha bg-folha px-4 py-3 no-underline transition-colors hover:border-marca aria-[current=page]:border-marca aria-[current=page]:bg-marca2">
            <span className="block text-sm font-semibold text-tinta">{a.nome}</span>
            <span className="block text-xs text-tinta3">{a.resumo}</span>
          </a>
        ))}
      </nav>
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-linha bg-folha2 p-4">
        <div className="w-44">
          <Campo rotulo={<><Termo id="spread">Spread de risco</Termo> (exemplo)</>} valor={spread} aoMudar={defineSpread} sufixo="p.p." casas={1} max={30} passo={0.5} />
        </div>
        <p className="m-0 max-w-[52ch] flex-1 text-[0.8125rem] leading-snug text-tinta3">
          Adicional somado à taxa do Tesouro para refletir o risco. Vale para as três calculadoras e para o briefing. {spread !== padrao ? <button type="button" onClick={() => defineSpread(padrao)} className="border-0 bg-transparent p-0 font-semibold text-marca underline underline-offset-2">Voltar para {num(padrao, 1)} p.p.</button> : `Padrão: ${num(padrao, 1)} p.p.`}
        </p>
      </div>
      {aba.id === "cancelada" ? <Cancelada /> : aba.id === "oferta" ? <Oferta /> : <Ativa />}
    </div>
  );
}
