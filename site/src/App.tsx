import { lazy, Suspense } from "react";
import { BarraInferior, Cabecalho } from "./Cabecalho";
import { ProvedorDeDados, useDados } from "./dados";
import { useRota } from "./rota";
import { ProvedorDeDicas } from "./ui/dicas";

const Briefing = lazy(() => import("./telas/Briefing").then((m) => ({ default: m.Briefing })));
const Mercado = lazy(() => import("./telas/Mercado").then((m) => ({ default: m.Mercado })));
const Calculadoras = lazy(() => import("./telas/Calculadoras").then((m) => ({ default: m.Calculadoras })));
const Bastidores = lazy(() => import("./telas/Bastidores").then((m) => ({ default: m.Bastidores })));

function Esqueleto() {
  return (
    <div className="mx-auto max-w-[76rem] px-4 py-10 md:px-6" role="status" aria-live="polite">
      <p className="sr-only">Lendo a foto de hoje…</p>
      <div className="h-6 w-48 animate-pulse rounded bg-linha" />
      <div className="mt-5 h-16 max-w-2xl animate-pulse rounded-xl bg-linha" />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-linha/70" />
        ))}
      </div>
    </div>
  );
}

function Erro({ mensagem }: { mensagem: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 md:px-6" role="alert">
      <p className="rotulo m-0 mb-2 text-erro">Sem foto para mostrar</p>
      <h1 className="m-0 mb-3 text-3xl font-semibold">Não consegui ler os números de hoje.</h1>
      <p className="mb-5 text-tinta2">{mensagem}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => globalThis.location.reload()} className="rounded-full border-0 bg-marca px-5 py-2 text-sm font-semibold text-[var(--marca-sobre)]">
          Tentar de novo
        </button>
        <a className="rounded-full border border-linha2 px-5 py-2 text-sm font-semibold text-tinta no-underline" href="https://github.com/victor-ozores/Radar-Pricing/actions/workflows/coleta-diaria.yml" target="_blank" rel="noopener noreferrer">
          Ver o robô no GitHub
        </a>
      </div>
    </div>
  );
}

function Conteudo() {
  const rota = useRota();
  const { fase, mensagem } = useDados();
  return (
    <>
      <a href="#principal" onClick={(e) => (e.preventDefault(), document.getElementById("principal")?.focus())} className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:text-papel">
        Pular para o conteúdo
      </a>
      <Cabecalho rota={rota} />
      <main id="principal" tabIndex={-1} className="pb-16 outline-none md:pb-0">
        {fase === "carregando" ? <Esqueleto /> : fase === "erro" ? <Erro mensagem={mensagem} /> : (
          <Suspense fallback={<Esqueleto />}>
            {rota.tela === "briefing" ? <Briefing /> : rota.tela === "mercado" ? <Mercado sub={rota.sub} /> : rota.tela === "calculadoras" ? <Calculadoras sub={rota.sub} /> : <Bastidores sub={rota.sub} />}
          </Suspense>
        )}
      </main>
      <BarraInferior rota={rota} />
    </>
  );
}

export function App() {
  return (
    <ProvedorDeDicas>
      <ProvedorDeDados>
        <Conteudo />
      </ProvedorDeDados>
    </ProvedorDeDicas>
  );
}
