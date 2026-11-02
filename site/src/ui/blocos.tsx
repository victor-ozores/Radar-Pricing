import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { CircleAlert, CircleCheck, CircleX, Info as IconeInfo } from "lucide-react";
import { animate } from "motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { lerNumero, num } from "../../js/formato.js";

// ------------------------------------------------------------------------------------------------ capítulo
/** O cabeçalho de um capítulo da história: número, rótulo e a frase que o capítulo defende. */
export function Capitulo({ id, numero, rotulo, titulo, children, aside }: { id: string; numero: string; rotulo: string; titulo: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="py-10 md:py-14">
      <div className="mb-6 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-[5.5rem_1fr]">
        <div className="display num text-5xl leading-none text-marca/80 md:text-6xl" aria-hidden>
          {numero}
        </div>
        <div>
          <p className="rotulo m-0 mb-2">{rotulo}</p>
          <h2 id={`${id}-t`} className="m-0 max-w-[40ch] text-balance text-[1.7rem] font-semibold leading-[1.14] md:text-[2.15rem]">
            {titulo}
          </h2>
        </div>
      </div>
      <div className="md:pl-[7.5rem]">
        {children}
        {aside}
      </div>
    </section>
  );
}

/** "O que isso significa": a leitura prática de um gráfico, em destaque. */
export function Significa({ children, titulo = "O que isso significa para o preço" }: { children: ReactNode; titulo?: string }) {
  return (
    <aside className="mt-6 rounded-2xl border border-marca/25 bg-marca2 px-5 py-4">
      <p className="rotulo m-0 mb-1.5 text-marca">{titulo}</p>
      <div className="text-[0.97rem] leading-relaxed text-tinta">{children}</div>
    </aside>
  );
}

// ------------------------------------------------------------------------------------------------ selos
const TONS = {
  ok: { classe: "bg-ok2 text-ok", Icone: CircleCheck },
  aviso: { classe: "bg-aviso2 text-aviso", Icone: CircleAlert },
  erro: { classe: "bg-erro2 text-erro", Icone: CircleX },
  info: { classe: "bg-folha2 text-tinta2", Icone: IconeInfo },
} as const;

export type Tom = keyof typeof TONS;

export function Selo({ tom = "info", children }: { tom?: Tom; children: ReactNode }) {
  const { classe, Icone } = TONS[tom];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${classe}`}>
      <Icone size={13} aria-hidden /> {children}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ controle segmentado
export function Segmentado<T extends string>({ valor, aoMudar, opcoes, rotulo }: { valor: T; aoMudar: (v: T) => void; opcoes: { id: T; nome: string }[]; rotulo: string }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={valor}
      onValueChange={(v) => v && aoMudar(v as T)}
      aria-label={rotulo}
      className="inline-flex max-w-full flex-wrap rounded-full border border-linha bg-folha2 p-0.5"
    >
      {opcoes.map((o) => (
        <ToggleGroup.Item
          key={o.id}
          value={o.id}
          className="rounded-full border-0 bg-transparent px-3 py-2 text-[0.8125rem] font-semibold text-tinta2 transition-colors hover:text-tinta data-[state=on]:bg-marca data-[state=on]:text-white data-[state=on]:shadow-sm sm:py-1 [[data-tema=escuro]_&]:data-[state=on]:text-[#05201a]"
        >
          {o.nome}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

// ------------------------------------------------------------------------------------------------ campo numérico
type CampoProps = {
  rotulo: ReactNode;
  valor: number;
  aoMudar: (v: number) => void;
  prefixo?: string;
  sufixo?: string;
  min?: number;
  max?: number;
  casas?: number;
  ajuda?: ReactNode;
  passo?: number;
};

/** Campo que aceita número do jeito brasileiro ("50.000,50"). Só avisa o resto da página de um valor que serve. */
export function Campo({ rotulo, valor, aoMudar, prefixo, sufixo, min = 0, max = Infinity, casas = 2, ajuda, passo }: CampoProps) {
  const id = useId();
  const [texto, setTexto] = useState(() => num(valor, casas));
  const [invalido, setInvalido] = useState<string | null>(null);
  const editando = useRef(false);
  useEffect(() => {
    if (!editando.current) setTexto(num(valor, casas));
  }, [valor, casas]);
  const confere = (t: string) => {
    const n = lerNumero(t) as number | null;
    if (n === null) return setInvalido("Digite só números."), false;
    if (n < min) return setInvalido(`Mínimo: ${num(min, casas)}.`), false;
    if (n > max) return setInvalido(`Máximo: ${num(max, casas)}.`), false;
    setInvalido(null);
    aoMudar(n);
    return true;
  };
  const muda = (delta: number) => {
    const n = Math.min(max, Math.max(min, Number((valor + delta).toFixed(casas))));
    setInvalido(null);
    aoMudar(n);
    setTexto(num(n, casas));
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-tinta2">
        {rotulo}
      </label>
      <div className={`flex items-center rounded-xl border bg-folha px-3 transition-shadow focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--marca)_25%,transparent)] ${invalido ? "border-erro" : "border-linha2 focus-within:border-marca"}`}>
        {prefixo ? <span className="mr-1.5 text-sm text-tinta3">{prefixo}</span> : null}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          aria-invalid={invalido ? true : undefined}
          aria-describedby={invalido ? `${id}-e` : ajuda ? `${id}-a` : undefined}
          onFocus={() => {
            editando.current = true;
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            confere(e.target.value);
          }}
          onBlur={() => {
            editando.current = false;
            const n = lerNumero(texto) as number | null;
            setTexto(num(n !== null && n >= min && n <= max ? n : valor, casas));
            setInvalido(null);
          }}
          onKeyDown={(e) => {
            if (passo && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              muda(e.key === "ArrowUp" ? passo : -passo);
            }
          }}
          className="num w-full min-w-0 border-0 bg-transparent py-2.5 text-[1.05rem] font-semibold text-tinta outline-none"
        />
        {sufixo ? <span className="ml-1.5 whitespace-nowrap text-sm text-tinta3">{sufixo}</span> : null}
      </div>
      {invalido ? (
        <p id={`${id}-e`} role="alert" className="m-0 text-xs font-medium text-erro">
          {invalido}
        </p>
      ) : ajuda ? (
        <p id={`${id}-a`} className="m-0 text-xs text-tinta3">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ número que sobe até o valor
/** Mostra `valor` contando até ele na primeira vez (a não ser que a pessoa prefira menos movimento). */
export function Contagem({ valor, casas = 2, formato }: { valor: number; casas?: number; formato?: (n: number) => string }) {
  const [mostrado, setMostrado] = useState(valor);
  const primeira = useRef(true);
  useEffect(() => {
    const reduz = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!primeira.current || reduz || !Number.isFinite(valor)) {
      setMostrado(valor);
      primeira.current = false;
      return;
    }
    primeira.current = false;
    const c = animate(0, valor, { duration: 0.9, ease: [0.2, 0.7, 0.2, 1], onUpdate: setMostrado });
    return () => c.stop();
  }, [valor]);
  return <>{formato ? formato(mostrado) : num(mostrado, casas)}</>;
}

// ------------------------------------------------------------------------------------------------ campo de escolha
/** Uma lista de opções no seletor do próprio aparelho (no celular abre a roleta do sistema, que é a mais fácil de usar). */
export function CampoEscolha<T extends string>({ rotulo, valor, aoMudar, opcoes, ajuda }: { rotulo: ReactNode; valor: T; aoMudar: (v: T) => void; opcoes: { id: T; nome: string }[]; ajuda?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-tinta2">
        {rotulo}
      </label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value as T)} className="w-full rounded-xl border border-linha2 bg-folha px-3 py-2.5 text-[1.05rem] font-semibold text-tinta outline-none focus:border-marca focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--marca)_25%,transparent)]">
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      {ajuda ? <p className="m-0 text-xs text-tinta3">{ajuda}</p> : null}
    </div>
  );
}
