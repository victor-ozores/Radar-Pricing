# Verificação das fontes de dados (2026-10-30)

Gerado por `scripts/verifica_fontes.py` com chamadas reais, nesta data. Fonte **essencial** que falha trava o robô; **complementar** pode faltar sem parar tudo; **comportamento** registra como a fonte se comporta quando algo dá errado.

| Resultado | Papel | Fonte | Tempo | O que voltou |
|---|---|---|---|---|
| OK | essencial | BCB Focus: IPCA (anual) | 0.1 s | Focus de 2026-10-23, mediana IPCA: 2026=5.1891, 2027=4.3368, 2028=3.75, 2029=3.5 |
| OK | essencial | BCB Focus: Selic (anual) | 0.1 s | Focus de 2026-10-23, mediana Selic: 2026=13.25, 2027=11.75, 2028=10.0, 2029=10.0 |
| OK | essencial | BCB Panorama de Consórcios: trimestre mais recente | 0.3 s | trimestre 202606 (defasagem de ~124 dias), 125 métricas; exclusão total 48.8%, inadimplência 2.12% |
| OK | essencial | BCB SGS 11 | 0.1 s | Selic over diária (% ao dia) = 0.050788 em 2026-10-30 |
| OK | essencial | BCB SGS 12 | 0.1 s | CDI diário (% ao dia) = 0.050788 em 2026-10-29 |
| OK | essencial | BCB SGS 13522 | 0.1 s | IPCA acumulado em 12 meses (%) = 4.58 em 2026-09-01 |
| OK | essencial | BCB SGS 4189 | 0.1 s | Selic acumulada no mês, anualizada (% a.a.) = 13.65 em 2026-10-01 |
| OK | essencial | BCB SGS 432 | 0.1 s | Meta Selic (% a.a.) = 13.75 em 2026-11-04 (data À FRENTE de hoje: o robô deve usar só datas até hoje) |
| OK | essencial | BCB SGS 433 | 0.1 s | IPCA mensal (%) = 0.82 em 2026-09-01 |
| OK | essencial | BCB taxas de juros: financiamento imobiliário (mensal, por banco) | 0.1 s | mês 2026-09, 4 bancos; menores taxas a.a.: CAIXA ECONOMICA FE 10.94%, BCO XP S.A. 14.57%, BCO SANTANDER (BRA 15.04% |
| OK | essencial | BCB taxas de juros: aquisição de veículos (semanal, por banco) | 12.4 s | semana 2026-10-09, 37 bancos; mediana 23.63% a.a. (de 7.65 a 49.42) |
| OK | essencial | Tesouro Transparente: CSV de preços e taxas do Tesouro Direto | 5.6 s | 178014 linhas (14.6 MB, 5.1 s), última data base 29/10/2026; Tesouro IPCA+ (taxa de compra): 2029=7,76%, 2032=7,84%, 2035=7,78%, 2040=7,45%, 2045=7,20%, 2050=7,13% |
| OK | complementar | ABAC (blog em WordPress): API de posts 'Sistema de Consórcios em <mês>' | 0.7 s | 7 posts mensais; o mais recente: 'Sistema de Consórcios em setembro/2026: dados econômicos' (2026-10-29) |
| OK | complementar | ABAC: extrair os números do texto de 3 meses seguidos | 0.0 s | extração por expressão regular: setembro/2026: 6/6; agosto/2026: 6/6; julho/2026: 5/6 (faltou: tíquete médio (R$ mil)). O texto varia a cada mês: usar como complemento e mostrar o link do post se algum número faltar. |
| OK | complementar | BCB Focus: Selic por reunião do Copom | 0.3 s | Focus de 2026-10-23; próximas reuniões: R6/2028=10.25, R5/2028=10.5, R4/2028=10.75, R3/2028=11.0 |
| OK | complementar | IBGE SIDRA: IPCA mensal (conferência do BCB) | 0.2 s | IPCA 202609: IBGE 0.82% = BCB 0.82% |
| OK | complementar | BCB Panorama de Consórcios: série histórica | 0.7 s | dez/2015, 2017, 2019, 2021, 2023 e 2025 com todas as métricas |
| OK | complementar | BCB taxas de juros: lista de modalidades | 0.1 s | 29 modalidades cadastradas |
| OK | complementar | Tesouro Transparente: catálogo (CKAN) do conjunto de taxas | 0.1 s | 2 recursos; CSV atual: precotaxatesourodireto.csv (modificado em 2026-10-30T10:21:20.504362) |
| OK | comportamento | ABAC: o robots.txt permite ler? | 0.5 s | robots.txt do blog não proíbe nenhum caminho (Disallow vazio) |
| OK | comportamento | BCB Focus: o histórico tem uma linha por dia útil | 0.1 s | CONFIRMADO: edições em dias úteis seguidos (2026-10-23, 2026-10-22, 2026-10-21, 2026-10-20...). Guardar 35 dias corridos, não 'N semanas'. |
| OK | comportamento | BCB SGS (janela maior que 10 anos em série diária) | 0.1 s | CONFIRMADO: HTTP 406; série diária aceita no máximo 10 anos por consulta. Buscar em janelas menores. |
| OK | comportamento | BCB SGS (chamada sem User-Agent de navegador) | 0.4 s | com User-Agent 'curl': 4 de 4 séries vieram em JSON (0 vieram como HTML). O robô manda User-Agent de navegador, confere que o corpo é JSON e tenta de novo se não for. |
| OK | comportamento | BCB SGS (código que não existe) | 30.1 s | CONFIRMADO: HTTP 200 com página HTML (30 s para responder). O robô nunca pode confiar só no código 200: tem de checar que o corpo é JSON. |
| OK | comportamento | BCB SGS (ultimos/21 em diante) | 0.2 s | CONFIRMADO: HTTP 400; o SGS aceita no máximo 20 últimas observações. Para mais, usar janela de datas. |

**Total:** 25 OK de 25; falhas essenciais: 0; outras falhas: 0.

## Não dá para testar daqui

- **GitHub Actions:** esta verificação rodou no meu computador. O robô vai rodar nos servidores do GitHub (outros endereços de rede), e o BCB, o IBGE ou o Tesouro podem tratá-los de outro jeito. Falta rodar este mesmo script lá, antes de montar o robô diário.
