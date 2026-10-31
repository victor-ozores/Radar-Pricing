# Fontes de dados: o que foi testado de verdade

Todas as linhas abaixo foram conferidas com chamada real em **30/10/2026** por [`scripts/verifica_fontes.py`](../scripts/verifica_fontes.py) (25 testes, 25 OK no meu computador; o que aconteceu a partir do GitHub Actions está mais abaixo). O relatório completo está em [`auditoria/`](auditoria/). Nenhuma fonte exige chave, cadastro ou pagamento.

**Papel:** *essencial* = se faltar, o robô não publica o dia; *complementar* = pode faltar e o painel mostra "sem dado novo".

## O que o robô vai coletar

| Fonte | Papel | O que traz | Frequência | Defasagem vista | Endereço |
|---|---|---|---|---|---|
| **BCB SGS** (séries 432, 11, 12, 4189, 433, 13522) | essencial | Meta Selic, Selic over, CDI, Selic do mês anualizada, IPCA mensal e IPCA 12 meses | diária / mensal | 0 a 1 dia (IPCA: ~30 dias) | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{série}/dados/ultimos/{n}?formato=json` |
| **BCB Focus**, expectativas anuais | essencial | Mediana de mercado para Selic e IPCA em 2026 a 2029 | atualizada toda semana, com uma linha por dia útil | 7 dias (Focus de 23/10) | `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais` (filtro `Indicador eq 'Selic'` e `baseCalculo eq 0`) |
| **BCB Focus**, Selic por reunião | complementar | Mediana da Selic esperada ao fim de cada reunião do Copom | semanal | 7 dias | `.../Expectativas/versao/v1/odata/ExpectativasMercadoSelic` |
| **BCB taxas de juros**, imobiliário | essencial | Taxa de financiamento imobiliário por banco (prefixado, taxas de mercado) | mensal | ~1 mês (set/2026: Caixa 10,94% a.a., XP 14,57%, Santander 15,04%) | `https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes` (filtro `Modalidade eq 'Financiamento imobiliário com taxas de mercado - Prefixado'`) |
| **BCB taxas de juros**, veículos | essencial | Taxa de aquisição de veículos por banco (semana 09/10: mediana 23,63% a.a., de 7,65 a 49,42; 37 bancos) | semanal | 3 semanas (a janela mais nova começa 21 dias antes de hoje) | `.../taxaJuros/versao/v2/odata/ConsultaUnificada` (filtro `codigoModalidade eq '401101'`) |
| **BCB Panorama de Consórcios** | essencial | 125 métricas do setor por segmento: cotas ativas, contempladas por sorteio e por lance, exclusão, inadimplência, taxa de administração, prazo e valor médios | trimestral | ~124 dias (último: jun/2026) | `https://olinda.bcb.gov.br/olinda/servico/PANORAMA_DE_CONSORCIOS/versao/v1/odata/Metricas(DataBase=@DataBase)?@DataBase=AAAAMM` |
| **Tesouro Transparente**, taxas do Tesouro Direto | essencial | Taxas de compra e venda de todos os títulos (Tesouro IPCA+ 2029: 7,76%; 2035: 7,78%; 2050: 7,13%) | diária (dia útil) | 1 dia (29/10) | catálogo `https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=df56aa42-484a-4a59-8184-7676580c81e3`; arquivo CSV de 14,6 MB |
| **IBGE SIDRA**, IPCA | complementar | Conferência do IPCA mensal do BCB (set/2026: 0,82% nos dois) | mensal | ~30 dias | `https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-2/variaveis/63?localidades=N1[all]` |
| **ABAC** (blog, API do WordPress) | complementar | Boletim mensal do sistema: participantes ativos, cotas vendidas e contempladas no ano, créditos comercializados e disponibilizados, tíquete médio | mensal | ~29 dias (set/2026 saiu em 29/10) | `https://blog.abac.org.br/wp-json/wp/v2/posts?search=Sistema de Consórcios em` |

## Defeitos reais que o robô precisa tratar (todos observados hoje)

1. **BCB SGS responde HTTP 200 com uma página HTML** quando o código da série não existe (e demorou 30 s). Conferir o **corpo**, não o código HTTP.
2. **O cabeçalho engana:** a série 13522 (IPCA 12 meses) devolve JSON válido marcado como `text/html`. Por isso a regra é "o corpo é JSON?", não "o tipo é JSON?".
3. **Série diária aceita no máximo 10 anos por consulta** (HTTP 406). Buscar em janelas menores.
4. **A meta Selic (432) traz registros com data à frente de hoje** (5 das 10 últimas observações em 30/10/2026, até 04/11/2026). Usar só datas até hoje.
5. **O IBGE às vezes responde comprimido (gzip) mesmo sem o cliente pedir.** Descomprimir quando o corpo começa com os bytes `1F 8B`.
6. **Respostas lentas existem:** Panorama de Consórcios e lista de modalidades levaram entre 9 e 11 s em algumas chamadas. Usar limite de tempo generoso e tentar de novo.
7. **O Panorama é trimestral e demora:** o trimestre mais novo ainda está vazio (set/2026 não saiu). Procurar o último trimestre com dados, andando para trás.
8. **No Panorama, funções OData levam parênteses** (`CadastroDeMetricas()`, `Metricas(DataBase=@DataBase)`); sem eles o BCB responde "The URI is malformed".
9. **A tabela diária de taxas (`TaxasJurosDiariaPorInicioPeriodo`) voltou vazia** com o filtro de veículos que testei. Usar `ConsultaUnificada`, que funciona.
10. **O texto do boletim da ABAC muda a cada mês** ("chegou a", "alcançou", "encerrou com"). A extração por expressão regular pegou 6 de 6 números em set e ago e 5 de 6 em jul. É um complemento: se algum número faltar, o painel mostra o link do post.
11. **O Tesouro renomeou o arquivo** (agora `precotaxatesourodireto.csv`, modificado em 30/10). O endereço antigo ainda funciona, mas o robô deve achar o arquivo pelo catálogo e ter o endereço fixo só como reserva.
12. **`ultimos/N` do SGS aceita no máximo 20** (HTTP 400 em `ultimos/21`). Para séries diárias com 30 dias de olhada, usar a janela de datas `dados?dataInicial=...&dataFinal=...`, que também não traz as datas à frente de hoje. (Achado na fase 2.)
13. **O Focus tem uma linha por dia útil**, não por semana (a atualização é semanal, mas o histórico é diário). Guardar 35 dias corridos, e não "N edições". (Achado na fase 2: a suposição de "edições semanais" estava errada e escondia a variação de 30 dias.)
14. **O IBGE não respondeu a partir dos servidores do GitHub.** O mesmo endereço responde em 0,2 s no meu computador; no GitHub Actions deu tempo esgotado em 120 s no teste e em 3 tentativas de 90 s na coleta (275 s perdidos). A causa não está confirmada (parece bloqueio de rede para IPs de nuvem). Como o IBGE só serve para conferir o IPCA do BCB, ele é complementar e tem limite próprio de 2 tentativas de 20 s (`[limites]` no `config.toml`). Na nuvem a conferência pode ficar sem dado.
15. **Veículos: a janela mais nova do BCB é antiga por natureza.** A tabela traz janelas de 7 dias que começam todo dia, e a publicação é semanal: em 30/10/2026 a mais nova começava em 09/10 (21 dias) e terminava em 16/10. Meu limite inicial de 21 dias acusou atraso falso quando o relógio do GitHub (UTC, já 31/10) contou 22. O limite passou a **28 dias**, e o teste de fontes agora usa a data de Brasília, como o robô. O robô vai guardar a última janela de cada dia, o que mostrará o ritmo real de publicação.
16. **O Olinda do BCB respondeu HTTP 404 duas vezes seguidas** para a consulta de veículos (30/10/2026, à noite), que minutos depois voltou a funcionar (as primeiras respostas levaram 14 a 18 s). Causa não confirmada. O cliente não repete erro 4xx, então a fonte falharia naquele dia; a defesa prevista para a fase 3 é refazer a coleta mais tarde quando o dia sair "parcial".

## O que **não existe** (testado ou pesquisado)

- **Preço ou ágio de cota de consórcio.** Não há série pública. Só blogs de intermediários, com números que se contradizem (12% a 25%) e sem metodologia. Não entra no painel.
- **Resultado de assembleia consolidado** (lance vencedor, contemplados por grupo): cada administradora guarda o seu. Sem fonte pública única.
- **Preço fechado de transações no mercado secundário.** Anúncio não é preço fechado.
- **Extratos de cotas e histórico de ofertas:** só quem compra e vende tem. Este projeto nunca usa dado desse tipo.
- **ANBIMA** (curvas de juros e preços de títulos): dados completos são pagos. O Tesouro Direto cobre o que precisamos para uma âncora pública.
- **Precatórios:** o DataJud (CNJ) funciona e tem os processos (há 221 mil da classe "Precatório" só no TJSP), mas traz o andamento, **não o valor nem o credor**. Fora do escopo desta primeira versão.

## A partir do GitHub Actions (porta de segurança)

Os servidores do GitHub têm outros IPs, e as fontes poderiam tratar tráfego de nuvem de outro jeito. Por isso o workflow [`verifica-fontes.yml`](../.github/workflows/verifica-fontes.yml) roda o teste de fontes e uma coleta completa (sem gravar) dentro do GitHub Actions.

- **1ª rodada (30/10/2026 à noite, 31/10 em UTC, `ubuntu-latest`):** 23 de 25 testes OK. BCB (SGS, Focus, taxas, Panorama), Tesouro (catálogo e CSV de 14,6 MB, 22 s) e ABAC responderam como no meu computador, e a coleta do pacote fechou com status OK (1.238 registros). As duas falhas foram o IBGE (defeito 14) e o alarme falso de atraso dos veículos (defeito 15), ambos tratados nas correções que vieram depois.
- **2ª rodada (com as correções):** ainda não rodou.

## Ainda **não testado**
- **Revisões de dados antigos** (o BCB pode corrigir um número já publicado). Começa a ser medido na fase 1, guardando a foto de cada dia.
- **O significado exato de "Índice de Exclusão" e "Cotas Comercializadas"** no Panorama: o catálogo do BCB não define os dois. Ler a nota metodológica do BCB antes de mostrar esses números com uma legenda.
