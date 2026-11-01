import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

const lerTema = (): Tema => (document.documentElement.getAttribute("data-tema") === "escuro" ? "escuro" : "claro");

/** O tema atual e quem troca. A escolha fica guardada no navegador (se ele deixar); o `tema.js` do início a lê. */
export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(lerTema);
  useEffect(() => {
    document.documentElement.setAttribute("data-tema", tema);
    const cor = document.querySelector('meta[name="theme-color"]');
    cor?.setAttribute("content", tema === "escuro" ? "#0b1211" : "#f3efe6");
  }, [tema]);
  const troca = useCallback(() => {
    setTema((atual) => {
      const novo: Tema = atual === "claro" ? "escuro" : "claro";
      try {
        localStorage.setItem("radar-tema", novo);
      } catch {
        /* sem armazenamento: vale só nesta visita */
      }
      return novo;
    });
  }, []);
  return [tema, troca];
}
