// O único gráfico do painel: as curvas do Tesouro (taxa por prazo até o vencimento), em SVG puro.
// Linhas de 2 px, pontos de 8 px com anel da cor do fundo, grade de 1 px, legenda sempre presente,
// dica ao passar o mouse ou focar com o teclado (o mesmo conteúdo da tabela que fica logo abaixo).

import { dataBR, num, pct, pp } from "./formato.js";

const NS = "http://www.w3.org/2000/svg";

function svg(tag, atributos = {}, ...filhos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, String(v));
  el.append(...filhos);
  return el;
}

function html(tag, classe, ...filhos) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  el.append(...filhos);
  return el;
}

/** Passo "redondo" do eixo (0,5 / 1 / 2 / 5 / 10) para caber em no máximo ~6 marcas. */
export function passoDoEixo(amplitude) {
  for (const p of [0.5, 1, 2, 5, 10, 20]) if (amplitude / p <= 6) return p;
  return 50;
}

export function escalas(curvas) {
  const pontos = curvas.flatMap((c) => c.pontos);
  const xmax = Math.max(1, Math.ceil(Math.max(...pontos.map((p) => p.anos))));
  const menor = Math.min(...pontos.map((p) => p.taxa));
  const maior = Math.max(...pontos.map((p) => p.taxa));
  const passo = passoDoEixo(maior - menor);
  const ymin = Math.floor((menor - passo * 0.25) / passo) * passo;
  const ymax = Math.ceil((maior + passo * 0.25) / passo) * passo;
  return { xmax, ymin, ymax, passo };
}

function textoDaDica(curva, ponto) {
  const linhas = [
    html("p", "dica-valor", `${pct(ponto.taxa)} a.a.`),
    html("p", "dica-nome", html("span", `chave chave-${curva.indice}`), `Tesouro ${curva.nome}, vence em ${dataBR(ponto.vencimento)}`),
    html("p", "dica-linha", `Prazo: ${num(ponto.anos, 1)} anos`),
  ];
  for (const [rotulo, delta] of [["Em 1 dia", ponto.d1], ["Em 7 dias", ponto.d7], ["Em 30 dias", ponto.d30]]) {
    if (delta != null) linhas.push(html("p", "dica-linha", `${rotulo}: ${pp(delta)}`));
  }
  return linhas;
}

function desenha(host, curvas) {
  host.replaceChildren();
  const largura = Math.max(300, Math.floor(host.clientWidth || 640));
  const estreito = largura < 520;
  const altura = estreito ? 300 : 340;
  const m = { topo: 16, direita: estreito ? 24 : 100, base: 52, esquerda: 56 };
  const { xmax, ymin, ymax, passo } = escalas(curvas);
  const x = (anos) => m.esquerda + (anos / xmax) * (largura - m.esquerda - m.direita);
  const y = (taxa) => m.topo + (1 - (taxa - ymin) / (ymax - ymin)) * (altura - m.topo - m.base);

  const grafico = svg("svg", { viewBox: `0 0 ${largura} ${altura}`, width: largura, height: altura, role: "group", "aria-label": "Curvas do Tesouro Direto: taxa por prazo até o vencimento. Os mesmos números estão na tabela logo abaixo." });

  const grade = svg("g", { class: "grade" });
  const casasY = passo < 1 ? 1 : 0;
  for (let t = ymin; t <= ymax + 1e-9; t += passo) {
    grade.append(
      svg("line", { x1: m.esquerda, x2: largura - m.direita, y1: y(t), y2: y(t), class: "grade-linha" }),
      svg("text", { x: m.esquerda - 8, y: y(t) + 4, class: "eixo-texto", "text-anchor": "end" }, `${num(t, casasY)}%`),
    );
  }
  const passoX = xmax > 6 ? 2 : 1;
  for (let a = 0; a <= xmax; a += passoX) {
    grade.append(svg("text", { x: x(a), y: altura - m.base + 18, class: "eixo-texto", "text-anchor": "middle" }, String(a)));
  }
  grade.append(
    svg("line", { x1: m.esquerda, x2: largura - m.direita, y1: y(ymin), y2: y(ymin), class: "eixo-linha" }),
    svg("text", { x: (m.esquerda + largura - m.direita) / 2, y: altura - 8, class: "eixo-titulo", "text-anchor": "middle" }, "anos até o vencimento"),
  );
  grafico.append(grade);

  const dica = html("div", "dica");
  dica.hidden = true;
  const marcadores = [];

  const mostra = (curva, ponto, marcador) => {
    marcadores.forEach((mk) => mk.classList.remove("ativo"));
    marcador.classList.add("ativo");
    dica.replaceChildren(...textoDaDica(curva, ponto));
    dica.hidden = false;
    const caixa = host.getBoundingClientRect();
    const alvo = marcador.getBoundingClientRect();
    const cx = alvo.left - caixa.left + alvo.width / 2;
    const cy = alvo.top - caixa.top + alvo.height / 2;
    const larguraDica = dica.offsetWidth;
    const alturaDica = dica.offsetHeight;
    // centrada no ponto e dentro da caixa; abaixo do ponto se ele está na metade de cima, senão acima:
    // assim a dica não cobre a linha que o leitor está olhando
    const esquerda = Math.min(Math.max(0, cx - larguraDica / 2), Math.max(0, largura - larguraDica));
    const abaixo = cy < altura / 2;
    dica.style.left = `${esquerda}px`;
    dica.style.top = `${Math.max(0, abaixo ? cy + 16 : cy - alturaDica - 16)}px`;
  };
  const esconde = () => {
    marcadores.forEach((mk) => mk.classList.remove("ativo"));
    dica.hidden = true;
  };

  curvas.forEach((curva) => {
    const pts = [...curva.pontos].sort((a, b) => a.anos - b.anos);
    const caminho = pts.map((p, i) => `${i ? "L" : "M"}${x(p.anos).toFixed(1)} ${y(p.taxa).toFixed(1)}`).join(" ");
    grafico.append(svg("path", { d: caminho, class: `linha linha-${curva.indice}` }));
  });
  curvas.forEach((curva) => {
    for (const p of curva.pontos) {
      const marcador = svg("circle", { cx: x(p.anos), cy: y(p.taxa), r: 4, class: `ponto ponto-${curva.indice}` });
      marcadores.push(marcador);
      const alvo = svg("circle", {
        cx: x(p.anos), cy: y(p.taxa), r: 14, class: "alvo", tabindex: 0, role: "img",
        "aria-label": `Tesouro ${curva.nome}, vence em ${dataBR(p.vencimento)}: ${pct(p.taxa)} ao ano`,
      });
      alvo.addEventListener("pointerenter", () => mostra(curva, p, marcador));
      alvo.addEventListener("focus", () => mostra(curva, p, marcador));
      alvo.addEventListener("pointerleave", esconde);
      alvo.addEventListener("blur", esconde);
      grafico.append(marcador, alvo);
    }
  });

  // Rótulo direto na ponta de cada linha; se duas pontas ficam coladas, a legenda e a dica carregam a identidade.
  if (!estreito) {
    const pontas = curvas.map((c) => ({ curva: c, p: c.pontos.reduce((a, b) => (b.anos > a.anos ? b : a)) }));
    const separadas = pontas.every((a, i) => pontas.every((b, j) => i === j || Math.abs(y(a.p.taxa) - y(b.p.taxa)) >= 16));
    if (separadas) {
      for (const { curva, p } of pontas) {
        grafico.append(svg("text", { x: x(p.anos) + 12, y: y(p.taxa) + 4, class: "rotulo-direto" }, curva.nome));
      }
    }
  }

  host.append(grafico, dica);
}

/** Desenha as curvas e redesenha quando a largura da caixa muda. `curvas`: o resultado de modelo.curvas(). */
export function curvasDoTesouro(host, curvas) {
  const comIndice = curvas.map((c, i) => ({ ...c, indice: i + 1 }));
  host.replaceChildren();
  if (comIndice.length === 0) {
    host.append(html("p", "vazio", "A foto deste dia não trouxe as curvas do Tesouro."));
    return () => {};
  }
  let ultimaLargura = -1;
  const redesenha = () => {
    const largura = host.clientWidth;
    if (largura === ultimaLargura) return;
    ultimaLargura = largura;
    desenha(host, comIndice);
  };
  redesenha();
  if (typeof ResizeObserver === "undefined") return () => {};
  let quadro = 0;
  const observador = new ResizeObserver(() => {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(redesenha);
  });
  observador.observe(host);
  return () => observador.disconnect();
}
