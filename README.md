BTE Extraction Tool
======================

Uma ferramenta robusta de **Web Scraping** e **Parsing de PDF** desenvolvida para extrair, estruturar e validar documentos do _Boletim do Trabalho e Emprego_ (BTE).

O projeto foi desenhado com foco em performance (Streaming), integridade de dados (Zod Validation) e portabilidade (Docker).

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
    
2.  bun run src/index.ts
    

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

Estrutura do Output
----------------------

Os ficheiros extraídos são organizados automaticamente por Série, Ano e Número:

```text
output/
├── 1_Serie/
│   ├── 2024/
│   │   ├── 1/
│   │   │   └── output.json  <-- Documento Validado
│   │   └── ...
└── Separatas/
    └── ...

```