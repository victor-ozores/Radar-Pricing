import { motion } from "motion/react";
import { ArrowRight, Landmark, Printer, TrendingUp, Users } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { dataBR, diaDaSemana, num } from "../../js/formato.js";
import { fraseDasBarras, fraseDasExcluidas, fraseDoFocus, heroDoDia, leituraDoDia } from "../../js/leitura.js";
import * as modelo from "../../js/modelo.js";
import { fraseDoCapituloDaCurva, fraseDoCapituloDoCredito, fraseDoCapituloDoCusto, fraseDoCapituloDoSetor, manchetePrincipal } from "../../js/narrativa.js";
import { useDados, useEstado } from "../dados";
import { CurvaDeJuros, SelicEmDias, SelicEsperada } from "../graficos/Juros";
import { FaixasDeCredito } from "../graficos/Credito";
import { CotasAtivasEExcluidas, DestaquesDoSetor, ExcluidasPorSegmento, IndiceDeExclusao, PainelDaAbac } from "../graficos/Setor";
import { ImpactoNoValor, MapaDeSensibilidade } from "../graficos/Valor";
import { irPara } from "../rota";
import { Capitulo, Campo, Selo, Significa, type Tom } from "../ui/blocos";
import { Termo } from "../ui/dicas";
import { Kpi, type Manchete } from "../ui/Kpi";

const ICONES: Record<string, ReactNode> = { tendencia: <TrendingUp size={18} />, banco: <Landmark size={18} />, grupo: <Users size={18} /> };
const TOM_DA_SEVERIDADE: Record<string, Tom> = { alta: "erro", media: "aviso", info: "info" };
const NOME_DA_SEVERIDADE: Record<string, string> = { alta: "Alta", media: "Média", info: "Info" };

function irAo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

// ------------------------------------------------------------------------------------------------ topo
function Topo() {
  const estado = useEstado();
  const { foto } = estado;
  const manchete = useMemo(() => manchetePrincipal(estado), [estado]);
  const hero = useMemo(() => heroDoDia(estado), [estado]);
  const resumo = useMemo(() => leituraDoDia(estado) as { icone: string; texto: string }[], [estado]);
  const mexidas = useMemo(() => (modelo.movimentos(foto) as { texto: string; severidade: string; peso: number }[]).slice(0, 5), [foto]);
  const cor = manchete?.sentido === "caiu" ? "text-sobe" : manchete?.sentido === "subiu" ? "text-cai" : "text-tinta";
  return (
    <section className="mx-auto max-w-[76rem] px-4 pt-8 md:px-6 md:pt-14" aria-labelledby="manchete">
      <p className="m-0 mb-5 hidden border-b border-linha pb-2 text-sm font-semibold text-tinta print:block">Radar Pricing · github.com/victor-ozores/Radar-Pricing · dados públicos, spread e exemplos de demonstração</p>
      <p className="rotulo m-0 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Briefing de {diaDaSemana(foto.data)}, {dataBR(foto.data)}</span>
        <span className="hidden h-px w-10 bg-linha2 sm:block" aria-hidden />
        <span className="font-medium normal-case tracking-normal">premissas públicas para precificar cotas de consórcio</span>
      </p>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        <div>
          {manchete ? (
            <motion.h1
              id="manchete"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
              className="m-0 max-w-[18ch] text-balance text-[2.5rem] font-semibold leading-[1.04] text-tinta md:text-[3.6rem] lg:text-[4rem]"
            >
              {manchete.antes}
              <span className={`sublinhado-ouro ${cor}`}>{manchete.destaque}</span>
              {manchete.depois}
            </motion.h1>
          ) : (
            <h1 id="manchete" className="m-0 text-[2.6rem] font-semibold leading-[1.05] md:text-[3.4rem]">
              As premissas de mercado de hoje.
            </h1>
          )}
          {hero?.porque ? <p className="mb-0 mt-5 max-w-[56ch] text-[1.06rem] leading-relaxed text-tinta2">{hero.porque}{hero.antes && hero.hoje ? ` Em R$: ${hero.antes} há 7 dias, ${hero.hoje} hoje (por cada R$ 1.000).` : ""}</p> : null}
          <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
            {resumo.map((f) => (
              <li key={f.icone} className="flex gap-3 text-[0.97rem] leading-snug text-tinta">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-marca2 text-marca">{ICONES[f.icone]}</span>
                <span className="pt-1">{f.texto}</span>
              </li>
            ))}
          </ul>
          <div className="nao-imprime mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={() => irAo("cap-curva")} className="inline-flex items-center gap-2 rounded-full border-0 bg-marca px-5 py-2.5 text-sm font-semibold text-[var(--marca-sobre)] shadow-sm transition-transform hover:-translate-y-px">
              Ver como chegamos aí <ArrowRight size={16} />
            </button>
            <button type="button" onClick={() => irPara("calculadoras")} className="inline-flex items-center gap-2 rounded-full border border-linha2 bg-folha px-5 py-2.5 text-sm font-semibold text-tinta transition-colors hover:border-marca hover:text-marca">
              Calcular uma cota
            </button>
            <button type="button" onClick={() => globalThis.print()} className="inline-flex items-center gap-2 rounded-full border-0 bg-transparent px-3 py-2.5 text-sm font-semibold text-tinta2 hover:text-marca">
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>

        <aside className="folha self-start p-5 md:p-6" aria-labelledby="mexeu">
          <h2 id="mexeu" className="rotulo m-0 mb-3 font-sans">
            O que mexeu na semana
          </h2>
          {mexidas.length === 0 ? (
            <p className="m-0 text-sm text-tinta3">Nada passou dos limites de atenção nesta foto.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col p-0">
              {mexidas.map((m, i) => (
                <li key={i} className="flex gap-3 border-t border-linha py-3 first:border-t-0 first:pt-0 last:pb-0">
                  <span className="num display mt-px w-5 shrink-0 text-lg leading-tight text-marca/70" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-[0.92rem] leading-snug text-tinta">{m.texto}</p>
                    <div className="mt-1.5">
                      <Selo tom={TOM_DA_SEVERIDADE[m.severidade] ?? "info"}>{NOME_DA_SEVERIDADE[m.severidade] ?? m.severidade}</Selo>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ números do dia
function Numeros() {
  const { foto } = useEstado();
  const itens = useMemo(() => modelo.manchetes(foto) as Manchete[], [foto]);
  return (
    <section className="mx-auto mt-10 max-w-[76rem] px-4 md:mt-14 md:px-6" aria-labelledby="numeros">
      <h2 id="numeros" className="rotulo m-0 mb-3 font-sans">
        Os números do dia
      </h2>
      <ul className="m-0 grid grid-cols-1 list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {itens.map((m) => (
          <Kpi key={m.id} m={m} foto={foto} />
        ))}
      </ul>
      <p className="m-0 mt-3 text-xs text-tinta3">As mudanças são em <Termo id="pp">pontos percentuais</Termo> (p.p.) contra 7 dias atrás. Passe o mouse no nome da fonte para ver a data do dado.</p>
      <nav aria-label="Capítulos do briefing" className="nao-imprime mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-tinta3">Neste briefing:</span>
        {[
          ["cap-custo", "1 · Custo do dinheiro"],
          ["cap-curva", "2 · Curva do Tesouro"],
          ["cap-valor", "3 · O que muda no valor"],
          ["cap-credito", "4 · Crédito concorrente"],
          ["cap-setor", "5 · O setor"],
        ].map(([id, nome]) => (
          <button key={id} type="button" onClick={() => irAo(id)} className="rounded-full border border-linha bg-folha px-3 py-1 text-[0.8125rem] font-semibold text-tinta2 hover:border-marca hover:text-marca">
            {nome}
          </button>
        ))}
      </nav>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ capítulos
function ControleDeSpread() {
  const { spread, defineSpread, estado } = useDados();
  return (
    <div className="nao-imprime mb-5 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-linha bg-folha2 p-4">
      <div className="w-44">
        <Campo rotulo={<><Termo id="spread">Spread de risco</Termo> (exemplo)</>} valor={spread} aoMudar={defineSpread} sufixo="p.p." casas={1} max={30} passo={0.5} />
      </div>
      <p className="m-0 max-w-[46ch] flex-1 text-[0.8125rem] leading-snug text-tinta3">
        É um adicional de risco somado à taxa do Tesouro. O número padrão ({num(estado?.parametros.spread_demonstracao_pp ?? 5, 1)} p.p.) é só para demonstrar: cada empresa define o seu. Mude para ver as contas se refazerem.
      </p>
    </div>
  );
}

function Capitulos() {
  const estado = useEstado();
  const { foto } = estado;
  const curvas = useMemo(() => modelo.curvas(foto) as any[], [foto]);
  const foco = useMemo(() => modelo.focus(foto) as any, [foto]);
  const creditos = useMemo(() => modelo.creditos(foto) as any, [foto]);
  const cotas = useMemo(() => modelo.cotasDoSetor(foto) as any, [foto]);
  const panorama = useMemo(() => modelo.panorama(foto) as any, [foto]);
  const abac = useMemo(() => modelo.abac(foto) as any[], [foto]);
  const meta = useMemo(() => (modelo.manchetes(foto) as Manchete[]).find((m) => m.id === "selic_meta") ?? null, [foto]);
  const veiculos7 = useMemo(() => modelo.variacaoDe(modelo.entradaDeVariacao(foto, "bcb_taxas", "mediana_taxa_financiamento_veiculos"), 7) as { delta: number } | null, [foto]);
  const ano = Number(foto.data.slice(0, 4));
  const hero = heroDoDia(estado);

  const sig = {
    custo: fraseDoFocus(foco),
    curva: hero?.porque,
    valor: fraseDasBarras(estado, "nominal"),
    excluidas: fraseDasExcluidas(cotas),
  };

  return (
    <div className="mx-auto max-w-[76rem] px-4 md:px-6">
      <hr className="regua mt-12" />
      <Capitulo id="cap-custo" numero="01" rotulo="O custo do dinheiro" titulo={fraseDoCapituloDoCusto(foto) ?? "O custo do dinheiro hoje"}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SelicEmDias foto={foto} />
          <SelicEsperada selic={foco.selic.filter((s: any) => s.ano >= ano)} metaHoje={meta?.valor ?? null} data={foco.data} />
        </div>
        <Significa titulo="Por que isso importa">
          <p className="m-0">
            O <Termo id="selic">custo do dinheiro</Termo> é o ponto de partida de qualquer preço: quanto mais caro ele fica, menos vale hoje um valor que só será recebido no futuro. {sig.custo ?? ""}
          </p>
        </Significa>
      </Capitulo>

      <hr className="regua" />
      <Capitulo id="cap-curva" numero="02" rotulo="A curva de juros do Tesouro" titulo={fraseDoCapituloDaCurva(curvas) ?? "A curva de juros do Tesouro"}>
        <CurvaDeJuros curvas={curvas} />
        {sig.curva ? (
          <Significa titulo="O que isso significa para o preço">
            <p className="m-0">
              As taxas do <Termo id="tesouro">Tesouro</Termo> são o ponto de partida do desconto. {sig.curva}
            </p>
          </Significa>
        ) : null}
      </Capitulo>

      <hr className="regua" />
      <Capitulo id="cap-valor" numero="03" rotulo="Quanto isso pesa no valor" titulo="Quanto o juro mexe no valor de um crédito a receber?">
        <ControleDeSpread />
        <div className="grid gap-4">
          <ImpactoNoValor estado={estado} />
          <MapaDeSensibilidade estado={estado} />
        </div>
        {sig.valor ? (
          <Significa titulo="A regra de bolso">
            <p className="m-0">{sig.valor}{sig.valor.startsWith("Quanto mais longe") ? " Por isso o prazo de recebimento é o que mais pesa no preço quando as taxas se mexem." : ""}</p>
          </Significa>
        ) : null}
      </Capitulo>

      <hr className="regua" />
      <Capitulo id="cap-credito" numero="04" rotulo="O crédito que concorre" titulo={fraseDoCapituloDoCredito(creditos) ?? "O crédito que concorre com o consórcio"}>
        <FaixasDeCredito imobiliario={creditos.imobiliario} veiculos={creditos.veiculos} />
        <Significa titulo="Por que isso importa">
          <p className="m-0">
            O consórcio não cobra juros, só taxa de administração; por isso o financiamento é o termômetro de quanto ele compete em custo.
            {veiculos7 && Math.abs(veiculos7.delta) >= 0.005 ? ` A mediana de veículos ${veiculos7.delta > 0 ? "subiu" : "caiu"} ${num(Math.abs(veiculos7.delta), 2)} p.p. em 7 dias.` : ""}
          </p>
        </Significa>
      </Capitulo>

      <hr className="regua" />
      <Capitulo id="cap-setor" numero="05" rotulo="O setor de consórcio" titulo={fraseDoCapituloDoSetor(cotas) ?? "O setor de consórcio"}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
          {cotas ? <IndiceDeExclusao cotas={cotas} /> : null}
          {cotas ? <CotasAtivasEExcluidas cotas={cotas} /> : null}
        </div>
        <div className="mt-4">{cotas ? <ExcluidasPorSegmento cotas={cotas} /> : null}</div>
        {panorama.destaques.length ? (
          <>
            <h3 className="rotulo m-0 mb-3 mt-8 font-sans">Risco e custo no setor · Banco Central, trimestre mais recente</h3>
            <DestaquesDoSetor destaques={panorama.destaques} />
          </>
        ) : null}
        {abac.length ? (
          <>
            <h3 className="rotulo m-0 mb-3 mt-8 font-sans">Volume de vendas no ano · ABAC</h3>
            <PainelDaAbac itens={abac} />
          </>
        ) : null}
        {sig.excluidas ? (
          <Significa titulo="O que isso significa para o preço">
            <p className="m-0">
              {sig.excluidas} Em geral, cota excluída é cota que o grupo devolve em dinheiro mais tarde: é o caso da <button type="button" onClick={() => irPara("calculadoras", "cancelada")} className="border-0 bg-transparent p-0 font-semibold text-marca underline underline-offset-2">calculadora de cota cancelada</button>.
            </p>
          </Significa>
        ) : null}
      </Capitulo>
    </div>
  );
}

export function Briefing() {
  return (
    <>
      <Topo />
      <Numeros />
      <Capitulos />
      <div className="nao-imprime mx-auto mb-16 mt-4 max-w-[76rem] px-4 md:px-6">
        <div className="folha flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <h2 className="m-0 text-2xl font-semibold">Quer ir além da leitura?</h2>
            <p className="m-0 mt-1 text-tinta2">Explore as tabelas completas, faça as contas de uma cota ou veja de onde vem cada número.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => irPara("mercado")} className="rounded-full border-0 bg-marca px-5 py-2.5 text-sm font-semibold text-[var(--marca-sobre)]">
              Explorar o mercado
            </button>
            <button type="button" onClick={() => irPara("calculadoras")} className="rounded-full border border-linha2 bg-folha px-5 py-2.5 text-sm font-semibold text-tinta hover:border-marca hover:text-marca">
              Calculadoras
            </button>
            <button type="button" onClick={() => irPara("bastidores")} className="rounded-full border border-linha2 bg-folha px-5 py-2.5 text-sm font-semibold text-tinta hover:border-marca hover:text-marca">
              Como funciona
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
