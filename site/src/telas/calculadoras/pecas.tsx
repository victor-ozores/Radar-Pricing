import * as Switch from "@radix-ui/react-switch";
import { Check, CircleCheck, CircleX, Copy, RotateCcw, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { mesAno, num, pct, prazoEmTexto, reais } from "../../../js/formato.js";
import { somaMeses } from "../../../js/foto.js";
import { copiaTexto } from "../../calc/memoria";
import { useDados } from "../../dados";
import { Campo, Contagem, Segmentado } from "../../ui/blocos";
import { Termo } from "../../ui/dicas";

// ------------------------------------------------------------------------------------------------ a moldura
/** Os campos à esquerda (fixos ao rolar, no computador) e o resultado à direita. No celular, um embaixo do outro. */
export function Moldura({ campos, children }: { campos: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr] lg:gap-6">
      <div className="folha flex flex-col gap-4 self-start p-4 sm:p-5 lg:sticky lg:top-20">{campos}</div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ campos
export function Interruptor({ ligado, aoMudar, rotulo, ajuda }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: ReactNode; ajuda?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch.Root
        id={id}
        checked={ligado}
        onCheckedChange={aoMudar}
        className="relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full border-0 bg-linha2 p-0 transition-colors data-[state=checked]:bg-marca"
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[0.8125rem] font-semibold text-tinta2">{rotulo}</span>
        {ajuda ? <span className="block text-xs text-tinta3">{ajuda}</span> : null}
      </label>
    </div>
  );
}

type PatchDePrazo = { meses: number; prazoEmData: boolean; prazoData: string };

/** O prazo em meses ou até uma data (mês e ano): quem pensa em "o grupo acaba em 03/2029" não precisa contar. */
export function CampoDePrazo({ rotulo, e, muda, baseIso, max = 360, ajuda }: { rotulo: string; e: PatchDePrazo; muda: (p: Partial<PatchDePrazo>) => void; baseIso: string; max?: number; ajuda?: ReactNode }) {
  const id = useId();
  const valida = /^\d{4}-\d{2}$/.test(e.prazoData);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8125rem] font-semibold text-tinta2">{rotulo}</span>
        <Segmentado valor={e.prazoEmData ? "data" : "meses"} aoMudar={(v) => muda({ prazoEmData: v === "data" })} rotulo="Como informar o prazo" opcoes={[{ id: "meses", nome: "Meses" }, { id: "data", nome: "Data" }]} />
      </div>
      {e.prazoEmData ? (
        <div className="flex flex-col gap-1">
          <input
            id={id}
            type="month"
            aria-label={`${rotulo}: mês e ano`}
            value={e.prazoData}
            min={somaMeses(baseIso, 1).slice(0, 7)}
            placeholder="AAAA-MM"
            pattern="\d{4}-\d{2}"
            onChange={(ev) => muda({ prazoData: ev.target.value })}
            className="num w-full rounded-xl border border-linha2 bg-folha px-3 py-2.5 text-[1.05rem] font-semibold text-tinta outline-none focus:border-marca"
          />
          <p className="m-0 text-xs text-tinta3">{valida ? ajuda : "Escolha o mês e o ano (formato AAAA-MM, por exemplo 2029-03)."}</p>
        </div>
      ) : (
        <Campo rotulo={<span className="sr-only">{rotulo} em meses</span>} valor={e.meses} aoMudar={(v) => muda({ meses: Math.round(v) })} sufixo="meses" casas={0} min={1} max={max} passo={1} ajuda={<>{prazoEmTexto(e.meses)}, por volta de {mesAno(somaMeses(baseIso, e.meses))}. {ajuda}</>} />
      )}
    </div>
  );
}

type PatchDeSpread = { usarSpread: boolean; spread: number };

/** Quase sempre vale o spread do painel inteiro; só aqui dá para usar outro (um precatório, por exemplo, tem prazo mais incerto). */
export function SpreadDaConta({ e, muda, dica }: { e: PatchDeSpread; muda: (p: Partial<PatchDeSpread>) => void; dica?: ReactNode }) {
  const { spread: geral } = useDados();
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-folha2 p-3">
      <Interruptor
        ligado={e.usarSpread}
        aoMudar={(v) => muda({ usarSpread: v })}
        rotulo={<>Usar outro <Termo id="spread">spread</Termo> só nesta conta</>}
        ajuda={e.usarSpread ? dica : <>Hoje vale o do painel: {num(geral, 1)} p.p.</>}
      />
      {e.usarSpread ? <Campo rotulo="Spread desta conta" valor={e.spread} aoMudar={(v) => muda({ spread: v })} sufixo="p.p." casas={1} max={30} passo={0.5} /> : null}
    </div>
  );
}

type PatchDePreco = { temPreco: boolean; preco: number; custos: number };

/** "Tenho um preço pedido": o preço e os custos de transferência, para a conta dizer se cabe. */
export function PrecoPedido({ e, muda, rotulo = "Tenho um preço pedido", ajudaDoPreco }: { e: PatchDePreco; muda: (p: Partial<PatchDePreco>) => void; rotulo?: string; ajudaDoPreco?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-folha2 p-3">
      <Interruptor ligado={e.temPreco} aoMudar={(v) => muda({ temPreco: v })} rotulo={rotulo} ajuda="A conta diz se compensa, quanto você lucra e qual é o preço máximo." />
      {e.temPreco ? (
        <>
          <Campo rotulo="Preço pedido" valor={e.preco} aoMudar={(v) => muda({ preco: v })} prefixo="R$" min={1} max={1e9} ajuda={ajudaDoPreco} />
          <Campo rotulo="Custos de transferência" valor={e.custos} aoMudar={(v) => muda({ custos: v })} prefixo="R$" min={0} max={1e9} ajuda="Taxa da administradora, cartório e o que mais for pago na compra." />
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ resultados
export function Resultado({ rotulo, valor, formato, nota, tom = "neutro" }: { rotulo: ReactNode; valor: number; formato: (n: number) => string; nota?: ReactNode; tom?: "neutro" | "sobe" }) {
  return (
    <div className="rounded-2xl border border-linha bg-folha p-4 sm:p-5">
      <p className="rotulo m-0">{rotulo}</p>
      <p className={`display num m-0 mt-1 break-words text-[2.3rem] font-semibold leading-none tracking-tight sm:text-[2.6rem] md:text-[3.2rem] ${tom === "sobe" ? "text-sobe" : "text-tinta"}`}>
        <Contagem valor={valor} formato={formato} />
      </p>
      {nota ? <p className="m-0 mt-2 text-[0.875rem] leading-snug text-tinta3">{nota}</p> : null}
    </div>
  );
}

/** O resultado principal sempre à vista no celular, grudado acima da barra de baixo; com um veredito, leva a cor dele. */
export function BarraDoResultado({ rotulo, valor, situacao = null }: { rotulo: string; valor: string; situacao?: Situacao | null }) {
  const cor = situacao ? `${SITUACOES[situacao].borda} ${SITUACOES[situacao].fundoBarra}` : "border-linha bg-folha/95";
  return (
    <div className={`nao-imprime fixed inset-x-0 z-30 border-t-2 px-4 py-2 backdrop-blur md:hidden ${cor}`} style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`rotulo m-0 truncate ${situacao ? SITUACOES[situacao].texto : ""}`}>{rotulo}</span>
        <strong className="display num whitespace-nowrap text-[1.35rem] leading-tight text-tinta">{valor}</strong>
      </div>
    </div>
  );
}

/** O veredito de um preço pedido contra o valor justo da conta. */
// ------------------------------------------------------------------------------------------------ o veredito
export type Situacao = "bom" | "limite" | "ruim";

/** Verde, amarelo e vermelho, sempre com ícone e palavra: a cor sozinha não basta para quem não distingue cores. */
const SITUACOES = {
  bom: { titulo: "Compensa", Icone: CircleCheck, caixa: "border-ok bg-ok2", borda: "border-ok", fundoBarra: "bg-ok2/95", texto: "text-ok" },
  limite: { titulo: "No limite", Icone: TriangleAlert, caixa: "border-aviso bg-aviso2", borda: "border-aviso", fundoBarra: "bg-aviso2/95", texto: "text-aviso" },
  ruim: { titulo: "Não compensa", Icone: CircleX, caixa: "border-erro bg-erro2", borda: "border-erro", fundoBarra: "bg-erro2/95", texto: "text-erro" },
} as const;

export const tituloDaSituacao = (s: Situacao) => SITUACOES[s].titulo;

/** "+R$ 12.000" ou "−R$ 3.000": o sinal sempre à vista, para o lucro não se confundir com o prejuízo. */
export const comSinalReais = (v: number, casas = 0) => `${v < 0 && Math.round(Math.abs(v) * 10 ** casas) !== 0 ? "−" : "+"}${reais(Math.abs(v), casas)}`;
export const comSinalPct = (v: number, casas = 1) => `${v < 0 && Math.round(Math.abs(v) * 10 ** casas) !== 0 ? "−" : "+"}${num(Math.abs(v), casas)}%`;

export type ItemDoVeredito = { rotulo: string; valor: string; sub?: ReactNode; tom?: "bom" | "ruim" | "neutro" };

/**
 * O quadro que diz, antes de tudo, se o negócio compensa: a palavra grande e colorida, uma frase curta e três números
 * em linhas separadas (lucro em reais, o que rende contra o que se exige, quanto sobra ou falta).
 */
export function Veredito({ situacao, frase, itens, rodape }: { situacao: Situacao; frase: ReactNode; itens: ItemDoVeredito[]; rodape?: ReactNode }) {
  const v = SITUACOES[situacao];
  const Icone = v.Icone;
  const corDoNumero = { bom: "text-ok", ruim: "text-erro", neutro: "text-tinta" };
  return (
    <section className={`rounded-2xl border-2 p-4 sm:p-5 ${v.caixa}`} aria-label={`O negócio: ${v.titulo}`}>
      <p className={`m-0 flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-[0.12em] ${v.texto}`}>
        <Icone size={17} aria-hidden /> O negócio
      </p>
      <p className={`display m-0 mt-1 text-[2.1rem] font-semibold leading-none sm:text-[2.5rem] ${v.texto}`}>{v.titulo}</p>
      <p className="m-0 mt-2 max-w-[62ch] text-[0.95rem] leading-snug text-tinta">{frase}</p>
      <dl className="m-0 mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {itens.map((it) => (
          <div key={it.rotulo} className="min-w-0 rounded-xl bg-folha px-3 py-2.5">
            <dt className="rotulo m-0">{it.rotulo}</dt>
            <dd className="m-0 mt-0.5">
              <span className={`display num block break-words text-[1.4rem] font-semibold leading-tight ${corDoNumero[it.tom ?? "neutro"]}`}>{it.valor}</span>
              {it.sub ? <span className="mt-0.5 block text-xs leading-snug text-tinta3">{it.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {rodape ? <p className="m-0 mt-3 text-[0.9rem] leading-snug text-tinta">{rodape}</p> : null}
    </section>
  );
}

/** A linha do veredito para o resumo copiado. */
export const linhaDoVeredito = (l: { situacao: Situacao; lucro: number; folga: number }) =>
  `Veredito: ${tituloDaSituacao(l.situacao)} (lucro no fim de ${comSinalReais(l.lucro)}; ${l.folga >= 0 ? "sobra" : "falta"} ${reais(Math.abs(l.folga), 0)} sobre o retorno exigido, em valor de hoje)`;

export function ComoFoiCalculado({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-linha bg-folha">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-tinta2 hover:text-marca [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>Como foi calculado
      </summary>
      <div className="border-t border-linha px-4 py-3 text-[0.875rem] leading-relaxed text-tinta2">{children}</div>
    </details>
  );
}

export function Aviso({ extrapolado, curva }: { extrapolado: boolean; curva: { pontos: { anos: number; taxa: number }[] } | null }) {
  if (!extrapolado || !curva?.pontos.length) return null;
  const primeiro = curva.pontos[0];
  const ultimo = curva.pontos[curva.pontos.length - 1];
  return (
    <p className="m-0 rounded-xl border border-linha bg-folha2 px-3 py-2 text-[0.8125rem] leading-snug text-tinta2" role="note">
      O Tesouro só tem vencimentos de {num(primeiro.anos, 1)} a {num(ultimo.anos, 1)} anos. O que cai fora dessa faixa usa a taxa do vencimento mais próximo ({pct(primeiro.taxa)} no mais curto, {pct(ultimo.taxa)} no mais longo), então é uma estimativa. O quadro do spread mostra quanto 1 p.p. a mais ou a menos muda o valor.
    </p>
  );
}

export function Nota({ children, tom = "aviso" }: { children: ReactNode; tom?: "aviso" | "info" }) {
  return (
    <p className={`m-0 rounded-xl border px-3 py-2 text-[0.8125rem] leading-snug ${tom === "aviso" ? "border-aviso/30 bg-aviso2 text-aviso" : "border-linha bg-folha2 text-tinta2"}`} role="note">
      {children}
    </p>
  );
}

/** Uma tabela pequena de "e se": cada linha com uma barra proporcional ao valor. */
export function ESe({ titulo, linhas }: { titulo: string; linhas: { rotulo: string; valor: number; texto: string; atual: boolean; extra?: string }[] }) {
  const maximo = Math.max(...linhas.map((l) => Math.abs(l.valor)), 1);
  return (
    <div className="rounded-2xl border border-linha bg-folha p-4">
      <h3 className="m-0 mb-2 font-sans text-sm font-semibold text-tinta">{titulo}</h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {linhas.map((l) => (
          <li key={l.rotulo} className={`grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 rounded-lg px-2 py-1 text-sm sm:grid-cols-[5.5rem_1fr_auto] sm:gap-3 ${l.atual ? "bg-marca2 font-semibold" : ""}`}>
            <span className="truncate text-tinta2">{l.rotulo}</span>
            <span className="h-2 overflow-hidden rounded-full bg-linha/70" aria-hidden>
              <span className="block h-full rounded-full bg-[color:var(--s1)]" style={{ width: `${Math.max(2, (Math.abs(l.valor) / maximo) * 100)}%`, opacity: l.atual ? 1 : 0.55 }} />
            </span>
            <span className="num whitespace-nowrap text-right text-tinta">
              {l.texto}
              {l.extra ? <span className="ml-1.5 text-xs font-normal text-tinta3">{l.extra}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Copiar resumo" (para colar numa mensagem ou e-mail) e "Voltar aos exemplos". */
export function AcoesDaConta({ resumo, aoVoltar }: { resumo: () => string; aoVoltar: () => void }) {
  const [copiado, setCopiado] = useState<"sim" | "nao" | null>(null);
  const botao = "inline-flex items-center gap-1.5 rounded-full border border-linha2 bg-folha px-3.5 py-2 text-[0.8125rem] font-semibold text-tinta2 transition-colors hover:border-marca hover:text-marca";
  return (
    <div className="nao-imprime flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={botao}
        onClick={async () => {
          setCopiado((await copiaTexto(resumo())) ? "sim" : "nao");
          globalThis.setTimeout(() => setCopiado(null), 2500);
        }}
      >
        {copiado === "sim" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} Copiar resumo
      </button>
      <button type="button" className={botao} onClick={aoVoltar}>
        <RotateCcw size={15} aria-hidden /> Voltar aos exemplos
      </button>
      <span role="status" aria-live="polite" className="text-xs text-tinta3">
        {copiado === "sim" ? "Resumo copiado." : copiado === "nao" ? "O navegador não deixou copiar." : ""}
      </span>
    </div>
  );
}
