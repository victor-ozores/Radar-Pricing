// Pequenas ferramentas para montar a página. Todo texto entra por `append` (nó de texto), nunca por innerHTML:
// os textos vêm da foto, que é dado de fora.

/** h("p", { classe: "x" }, "texto", outroNo) */
export function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "classe") el.className = v;
    else if (k.startsWith("ao")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false));
  return el;
}

/**
 * Tabela com legenda. `colunas`: [{ t: "Título", num: true }]; cada linha é uma lista de células, que podem ser
 * texto, um nó ou { v: texto-ou-nó, classe }. A caixa de rolagem deixa a tabela rolar de lado em tela estreita.
 */
export function tabela({ legenda, colunas, linhas, classe = "" }) {
  const celula = (c) => (c !== null && typeof c === "object" && !(c instanceof Node) ? c : { v: c });
  const corpo = linhas.map((linha) =>
    h("tr", {}, linha.map((c, i) => {
      const { v, classe: cl } = celula(c);
      return h(i === 0 ? "th" : "td", { classe: [colunas[i]?.num ? "num" : "", cl ?? ""].join(" ").trim() || false, scope: i === 0 ? "row" : false }, v);
    })),
  );
  return h(
    "div",
    { classe: "rolagem", tabindex: 0, role: "region", "aria-label": legenda },
    h(
      "table",
      { classe },
      h("caption", {}, legenda),
      h("thead", {}, h("tr", {}, colunas.map((c) => h("th", { scope: "col", classe: c.num ? "num" : false }, c.t)))),
      h("tbody", {}, corpo),
    ),
  );
}

/** Selo com ícone e texto (a cor nunca fica sozinha). tipo: ok | aviso | serio | neutro */
export function selo(tipo, icone, texto) {
  return h("span", { classe: `selo selo-${tipo}` }, h("span", { "aria-hidden": "true" }, `${icone} `), texto);
}

export function limpa(no) {
  no.replaceChildren();
  return no;
}
