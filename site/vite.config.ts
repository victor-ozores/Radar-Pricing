import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// A política de conteúdo só entra na versão publicada: no `vite dev` ela travaria o recarregamento ao vivo.
// Só o próprio site roda scripts e estilos; a rede só fala com os dois endereços do GitHub que o painel usa.
const POLITICA =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; " +
  "connect-src 'self' https://raw.githubusercontent.com https://api.github.com; base-uri 'none'; form-action 'none'";

function politicaDeConteudo(): Plugin {
  return {
    name: "politica-de-conteudo",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: POLITICA }, injectTo: "head-prepend" }],
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), politicaDeConteudo()],
  build: { outDir: "dist", sourcemap: false, target: "es2022", chunkSizeWarningLimit: 900 },
  server: { port: 5173, strictPort: true },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], globals: false, css: false },
});
