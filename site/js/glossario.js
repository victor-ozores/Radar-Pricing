// O que cada termo quer dizer, em uma frase. Aparece no "?" ao lado do termo, na página e nas calculadoras.

export const GLOSSARIO = {
  selic: "A taxa básica de juros do Brasil, definida pelo Copom. É a referência do custo do dinheiro no país.",
  cdi: "A taxa dos empréstimos entre bancos, quase igual à Selic. Os investimentos de renda fixa pós-fixados rendem perto dela.",
  tesouro: "O governo vende títulos e paga juros conforme o prazo. A taxa de cada prazo é a taxa sem risco de empresa: o ponto de partida para descontar um valor a receber.",
  prefixado: "Título que paga uma taxa fixa, combinada na compra, sem correção pela inflação.",
  ipcaMais: "Título que paga o IPCA (a inflação) mais uma taxa fixa. A taxa mostrada é a parte acima da inflação.",
  ipca: "O índice oficial de inflação do Brasil.",
  focus: "Pesquisa semanal do Banco Central com o que bancos e consultorias esperam para a Selic, a inflação e a economia.",
  spread: "Um adicional de risco somado à taxa do Tesouro. Aqui é um número de exemplo (demonstração): cada empresa define o seu.",
  taxaDeDesconto: "A taxa usada para trazer um valor do futuro até hoje: a taxa do Tesouro para o prazo mais o spread de risco.",
  valorPresente: "Quanto um valor que só será recebido no futuro vale hoje. Quanto mais tempo falta e mais altos os juros, menos ele vale hoje.",
  pp: "Pontos percentuais: a diferença entre duas taxas. De 13% para 15% ao ano são +2 p.p.",
  mediana: "O valor do meio: metade dos bancos cobra mais e metade cobra menos.",
  quartil: "Divide os bancos em quatro grupos do mesmo tamanho. Entre o 1º e o 3º quartil ficam os bancos do meio, metade deles.",
  exclusao: "Cotas excluídas (canceladas) divididas por todas as cotas, ativas e excluídas. Mostra quanto do mercado já saiu do grupo.",
  inadimplencia: "A parte dos consorciados com parcelas atrasadas.",
  desagio: "Quanto o preço fica abaixo do valor a receber.",
  rodadas: "Cada vez que o robô roda: lê as fontes, guarda a foto do dia e publica. Verde deu certo, vermelho falhou.",
  foto: "O retrato dos números de um dia, guardado para sempre: assim qualquer preço do passado pode ser refeito com as taxas daquele dia.",
};

/** O nome de cada termo como aparece no dicionário (a mesma chave do GLOSSARIO). */
export const NOMES_DO_GLOSSARIO = {
  selic: "Selic",
  cdi: "CDI",
  tesouro: "Tesouro (taxa sem risco)",
  prefixado: "Tesouro Prefixado",
  ipcaMais: "Tesouro IPCA+",
  ipca: "IPCA",
  focus: "Boletim Focus",
  spread: "Spread de risco",
  taxaDeDesconto: "Taxa de desconto",
  valorPresente: "Valor presente (valor de hoje)",
  pp: "Pontos percentuais (p.p.)",
  mediana: "Mediana",
  quartil: "Quartil",
  exclusao: "Índice de exclusão",
  inadimplencia: "Inadimplência",
  desagio: "Deságio",
  rodadas: "Rodadas do robô",
  foto: "Foto do dia",
};
