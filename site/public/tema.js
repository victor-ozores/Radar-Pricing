// Escolhe o tema (claro ou escuro) antes da página aparecer, para não piscar. Lê a escolha guardada ou a do sistema.
(function () {
  var tema = "claro";
  try {
    var salvo = localStorage.getItem("radar-tema");
    if (salvo === "claro" || salvo === "escuro") tema = salvo;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) tema = "escuro";
  } catch (e) {
    /* sem armazenamento: fica o claro */
  }
  document.documentElement.setAttribute("data-tema", tema);
})();
