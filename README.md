BTE Extraction Tool
======================

Uma ferramenta robusta de **Web Scraping** e **Parsing de PDF** desenvolvida para extrair, estruturar e validar documentos do _Boletim do Trabalho e Emprego_ (BTE).

O projeto foi desenhado com foco em performance (Streaming), integridade de dados (Zod Validation) e portabilidade (Docker).

O desafio consiste em criar um processo totalmente automático composto por duas 
fases. Na primeira, deve-se recolher todos os links para documentos publicados no BTE. 
Para cada link, deve-se ser capaz de carregar para memória o PDF correspondente. Nesta 
fase, não é permitido utilizar soluções de headless browser (e.g.: Puppeteer),  
apenas HTTP requests. Na segunda fase, deve-se transformar cada PDF num 
documento JSON em formato de árvore, ignorando elementos acessórios como o 
índice do documento e os números de página (Mais informações no pdf em anexo)

Funcionalidades
------------------

*   **Streaming Mode:** Processa documentos um a um para minimizar o uso de RAM.
    
*   **PDF Parsing:** Converte ficheiros binários PDF em árvores JSON estruturadas.
    
*   **Data Validation:** Utiliza Zod para garantir que o output respeita o esquema rigoroso.
    
*   **Dockerized:** Execução isolada e consistente em qualquer sistema operativo.
    
*   **CI/CD Pipeline:** Testes automáticos e deploy para Docker Hub via GitHub Actions.
    

Guia Rápido (Modo Docker - Recomendado)
------------------------------------------

Este projeto utiliza Docker para garantir um ambiente isolado. Não é necessário instalar Node.js ou Bun no seu computador.

### 1\. Construir a Imagem (Build)

Execute este comando uma única vez para preparar o ambiente:

```powershell
docker build -t bte-scraper .
```

### 2\. Executar a Aplicação (Run)

Para extrair documentos, execute o comando abaixo._Nota: Pode definir um limite de documentos (ex: 5) quando o programa iniciar para testes rápidos._

**Windows (PowerShell):**

PowerShell

```powershell
docker run --dns 8.8.8.8 --network host -it -v "${PWD}/output:/app/output" bte-scraper
```


**Mac / Linux:**

Bash

```bash
docker run --dns 8.8.8.8 --network host -it -v "${pwd}/output:/app/output" bte-scraper
```


> **Nota sobre as flags:**
> 
> *   \--network host e --dns 8.8.8.8: Otimizações para evitar bloqueios de rede/DNS comuns em ambientes Docker/WSL2 ao aceder a sites governamentais.
>     
> *   \-v ...: Garante que os ficheiros JSON gerados aparecem na sua pasta output local.
>     

Execução Local ("Safe Mode")
--------------------------------

Caso encontre problemas de rede com o Docker (bloqueios de firewall ou VPN), pode correr o código diretamente na sua máquina.

**Pré-requisitos:** Ter o [Bun](https://bun.sh/) instalado.

1.  bun install

2.  Instalar as várias dependências a partir de package.json e bun.lock
    
3.  bun run src/index.ts
    

Testes Unitários
-------------------

O projeto inclui testes unitários que utilizam **Mocks** para simular o website do BTE, garantindo que a lógica funciona sem fazer pedidos reais à internet.

Para correr os testes:

```bash
bun run test
```

> **Nota:** O teste crawler.test.ts valida se a lógica de extração de anos consegue identificar corretamente uma lista de opções num HTML simulado.

CI/CD & Version Control
--------------------------

Este repositório implementa uma pipeline de Integração e Entrega Contínuas (CI/CD).

1.  **Version Control:** Todo o código é gerido via Git.
    
2.  **Continuous Integration (CI):** A cada push, o GitHub Actions corre os testes unitários (vitest).
    
3.  **Continuous Deployment (CD):** Se os testes passarem, a imagem Docker é construída e enviada automaticamente para o Docker Hub.
    

**Para submeter alterações e ativar a pipeline:**

```bash
git add .  
git commit -m "Update: melhorias no scraper e documentação"  
git push   
```

**Para verificar que o workflow CI/CD funcionou pode-se visitar a página do github actions ou simplesmente verificar o status badge abaixo:**

[![CI/CD Pipeline](https://github.com/jorgemiguelcordeiro/bte-scraper/actions/workflows/cicd.yml/badge.svg?branch=main)](https://github.com/jorgemiguelcordeiro/bte-scraper/actions/workflows/cicd.yml)

Estrutura do Projeto (ficheiros principais)
----------------------

Os ficheiros extraídos são organizados automaticamente por Série, Ano e Número:

```text
BYTHELAW_EXTRAS/
├── .github/
│   └── workflows/
│       └── cicd.yml       # Definição da Pipeline de CI/CD (GitHub Actions)
├── src/
│   ├── crawler.ts         # Navega no site, gere downloads
│   ├── parser.ts          # Recebe o PDF, limpa o texto e cria o JSON
│   ├── index.ts           # Orquestra todo o fluxo
│   ├── types.ts           # Definições de Tipos partilhadas
│   └── data_validation... # Schema Zod para garantir a qualidade dos dados de saída
├── tests/
│   └── crawler.test.ts    # Testes unitários (Mocks) para validar a lógica sem internet
├── output/                # Pasta onde os dados extraídos (JSONs) são guardados
├── Dockerfile             # Construir a imagem isolada da aplicação


```

## Future work

### Implementação de técnicas mais avançadas de NLP

Integração de LLMs (Large Language Models): Atualmente, o parser baseia-se em expressões regulares e heurísticas posicionais, que podem falhar em documentos antigos com formatação inconsistente. A integração de um modelo local (ex: Llama 3 ou Mistral) ou API (OpenAI) permitiria extrair entidades (datas, signatários, cláusulas) por contexto semântico e não apenas por padrões de texto, aumentando drasticamente a precisão em documentos não-standard.

### Engenharia e Arquitetura de Dados

- Base de Dados Relacional (PostgreSQL): Em vez de guardar ficheiros JSON locais, os dados estruturados devem ser ingeridos numa base de dados SQL. Isto permitiria consultas complexas. O PostgreSQL suporta nativamente o tipo JSONB, ideal para este cenário híbrido.

- Data Lake para PDFs (S3/MinIO): A arquitetura ideal passaria por guardar os PDFs num Object Storage (como AWS S3 ou Azure Blob Storage) e guardar apenas o URL de referência na base de dados.

- Pipeline de ETL: Substituir o modo streaming simples por uma pipeline orquestrada (usando ferramentas como Apache Airflow ou Prefect). Isto permitiria agendar a execução para dias específicos (quando saem novos BTEs) e gerir falhas de forma granular.

### Acessibilidade 

- API REST: Desenvolver uma camada de API (com FastAPI por exemplo) sobre a base de dados, permitindo que outras aplicações consumam os dados do BTE sem precisarem de correr o scraper.

- Dashboard de Monitorização: Implementar um dashboard para visualizar métricas em tempo real: número de documentos processados, taxa de erros e tempos de resposta do servidor do governo.