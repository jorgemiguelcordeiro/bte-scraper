/**
 * ============================================================================
 * Step 1: Libraries, CONFIG AND CONSTANTS
 * Infrastructure and secondary definitions
 * ============================================================================
 */
import axios from 'axios'; // biblioteca HTTP para fazer requests
import * as cheerio from 'cheerio'; // biblioteca para manipular HTML no Node.js (tipo jQuery), uma vez que não podemos usar headless browsers
import { 
  BteDocumentType, 
  DropdownOption, 
  DownloadedFile 
} from './types';

/**
 * Rules that define the crawler’s behaviour.
 */

/**
 * Vamos usar readonly para garantir que as configs não são alteradas em runtime.
 * Usamos user_agent para evitar bloqueios por parte do servidor e simular que somos um browser real
 */
interface CrawlerConfig {
  readonly BASE_URL: string;
  readonly FORM_URL_ISSUE: string;
  readonly FORM_URL_OFFPRINT: string;
  readonly TIMEOUT: number;
  readonly USER_AGENT: string; //user agent para requests HTTP.
  readonly MAX_CONSECUTIVE_FAILURES: number; //max failures antes de parar o scan num ano
}

const DEFAULT_CONFIG: CrawlerConfig = {
  BASE_URL: 'https://bte.gep.msess.gov.pt',
  FORM_URL_ISSUE: 'https://bte.gep.msess.gov.pt/bte_consulta_n_anteriores.php',
  FORM_URL_OFFPRINT: 'https://bte.gep.msess.gov.pt/sep_consulta_n_anteriores.php',
  TIMEOUT: 15000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  MAX_CONSECUTIVE_FAILURES: 10 
};

/**
 * ============================================================================
 * Step 2: HELPER FUNCTIONS (Pure, Stateless Utilities)
 * ============================================================================
 */

/**
 * Creates a list of possible URL variations for a specific document.
 * This accounts for potential differences in URL structures between issues and offprints.
 */
function generateUrlPatterns(baseUrl: string, type: BteDocumentType, year: string, number: string): string[] {
  const patterns: string[] = []; // empty array to hold URL patterns

  if (type === 'issue') {
    patterns.push(`${baseUrl}/completos/${year}/bte${number}_${year}.pdf`);
  } 
  else {
    patterns.push(`${baseUrl}/separatas/sep${number}_${year}.pdf`);
  }
  return patterns;
}

/**
 - Analyzes a specific HTML select element to determine if it represents a list of years.
 - $: o objeto do Cheerio, que permite manipular HTML no Node.js (tipo jQuery)
 - el: o elemento select a ser analisado
 - Retorna true se parecer um dropdown de anos, false caso contrário
 - Critérios:
   - Deve ter pelo menos 5 opções
   - Pelo menos 30% das opções devem ser anos válidos (formato 19xx ou 20xx)
   - os anos são ordenados em ordem decrescente
 */


/**
 * Tenta extrair anos de um <select>.
 * Se conseguir, devolve array de opções. Se não, devolve null.
 * Critérios:
 * - Pelo menos 30% das opções devem ser anos válidos (formato 19xx ou 20xx)
 * - os anos são ordenados em ordem decrescente
 */
function extractYearDropdownOptions($: cheerio.CheerioAPI, el: cheerio.Cheerio<cheerio.Element>): DropdownOption[] | null {
  let hits = 0;  //
  const opts = el.find('option'); // todas as opções dentro do select
  const yearOptions: DropdownOption[] = []; // array para guardar opções válidas de anos
  

  opts.each((_, opt) => {  
    const txt = $(opt).text().trim();
    // Valida se é 19xx ou 20xx
    if (txt.match(/^(19|20)\d{2}$/)) {
      hits++;
      const val = $(opt).attr('value') || txt;
      yearOptions.push({ value: val, label: txt });
    }
  });

  // Ordena decrescente (do mais recente para o mais antigo)
  yearOptions.sort((a, b) => parseInt(b.label) - parseInt(a.label));

  // A Lógica de Validação (30% hits) acontece aqui. Podem haver erros ou opções inválidas, mas o que interessa é a maioria.
  // Se passar, devolvemos os dados. Se falhar, devolvemos null.
  if (hits > (opts.length * 0.3)) {
      return yearOptions;
  }
  
  return null;
}

/**
 * ============================================================================
 * Step 3: MAIN CRAWLER CLASS
 * ============================================================================
 */

/**
 * The core class responsible for the crawling logic.
 * It handles year discovery, sequential document scanning, and yields results one by one to manage memory usage.
 * It is designed to be polite to the server by implementing delays and proper request headers.
 * Critérios:
 * - Usa streaming para evitar uso excessivo de memória, os documentos são processados um a um
 * - Implementa delays entre requests para evitar bloqueios
 * - Valida o content-type das respostas para garantir que são PDFs
 * - Permite definir um limite máximo de documentos a serem recolhidos
 */
export class BteCrawler { // exporta a classe para ser usada em outros módulos
  private totalCollected = 0; 
  private maxLimit = Infinity; //user pode escolher documentos que quiser para testar

  constructor(private readonly config: CrawlerConfig = DEFAULT_CONFIG) {} //usamos config padrão se não for fornecida

  // --------------------------------------------------------------------------
  // Step 3.0: Limite de Documentos
  // --------------------------------------------------------------------------

  /**
   * Checks if the total number of collected documents has reached the user-defined limit.
   */
  private limitReached(): boolean {
    return this.totalCollected >= this.maxLimit;
  }

  // --------------------------------------------------------------------------
  // Step 3.1.1: Baixar PDF
  // --------------------------------------------------------------------------
  
  private async fetchDocument(type: BteDocumentType, year: string, number: string): Promise<DownloadedFile | null> {
    const urls = generateUrlPatterns(this.config.BASE_URL, type, year, number);
    
    for (const url of urls) {
      if (this.limitReached()) return null;
      
      try {
        await new Promise(r => setTimeout(r, 5));

        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: this.config.TIMEOUT,
          validateStatus: (s) => s === 200,
          headers: { 'User-Agent': this.config.USER_AGENT }
        
        });

        const cType = response.headers['content-type'];
        if (cType && (cType.includes('pdf') || cType.includes('octet-stream'))) {
          return { buffer: response.data, url, docType: type, year, number };
        }
      } catch (_) {
        // Silent catch like the old code to keep it fast
        continue;
      }
    }
    return null;
  }
    
  // --------------------------------------------------------------------------
  // Step 3.1.2: Identificar Anos
  // --------------------------------------------------------------------------

  /**
   * Inspects a given page to find and extract the year dropdown options.
   * @param url The URL of the page to fetch.
   * @param description A description for logging purposes.
   * @returns An array of DropdownOption representing the available years.
   * Uses the extractYearDropdownOptions helper function to validate each select element.
   */
  private async getYearsFromPage(url: string, description: string): Promise<DropdownOption[]> {
      try {
        const { data: html } = await axios.get(url, { 
            timeout: this.config.TIMEOUT,
            headers: { 'User-Agent': this.config.USER_AGENT },
            
        });
        
        const $ = cheerio.load(html); // carrega o HTML na biblioteca Cheerio
        
        // Itera sobre todos os selects da página
        const selects = $('select'); // todos os selects na página
        for (let i = 0; i < selects.length; i++) { // itera sobre cada select
            const el = selects.eq(i); // obtém o elemento atual
            
            // Tenta extrair opções de anos deste select
            const options = extractYearDropdownOptions($, el);
            
            if (options) { 
                return options; // se encontrou um dropdown válido, retorna as opções
            }
        }

        // Se percorreu tudo e não encontrou nada
        console.warn(`[WARN] No year dropdown found for ${description}`);
        return [];

      } catch (error) { // captura erros de request ou parsing
          console.error(`Error fetching ${description}: ${error}`);
          return [];
      }
  }

  /**
   * Identifies available years for both issues and offprints by inspecting their respective pages.
   * @returns An object containing arrays of DropdownOption for issues and offprints.
   * Uses getYearsFromPage to fetch and parse each page.
   */
  private async identifyYear() {
      const [issueYears, offprintYears] = await Promise.all([
          this.getYearsFromPage(this.config.FORM_URL_ISSUE, "Bulletin Years"),
          this.getYearsFromPage(this.config.FORM_URL_OFFPRINT, "Offprint Years")
      ]);
      return { issueYears, offprintYears };
  }

  // --------------------------------------------------------------------------
  // Step 3.1.3: Identificar Boletins / Separatas (Scan Generator)
  // --------------------------------------------------------------------------
  
  /**
   * Scans sequentially through document numbers for a given year and type, 
   * yielding each found document immediately to manage memory usage.
   * @param type The type of document ('issue' or 'offprint').
   * @param year The year to scan.
   * @returns An async generator yielding DownloadedFile objects as they are found.
   */
  private async *identifyBoletins_separatas(type: BteDocumentType, year: string): AsyncGenerator<DownloadedFile> {
    let currentNum = 1; //porque começa do 1? porque os boletins e separatas são numerados a partir do 1
    let consecutiveFailures = 0; 

    while (!this.limitReached()) { // continua até atingir o limite definido pelo user
      if (consecutiveFailures >= this.config.MAX_CONSECUTIVE_FAILURES) { // se atingir o máximo de falhas consecutivas, assume que acabou o ano 
        break;
      }

      const numStr = currentNum.toString(); // converte o número atual para string. porque fazemos isto? porque os PDFs são nomeados com números simples, sem zeros à esquerda, ou seja, "1", "2", "10", etc. se não fizermos isto, o URL gerado estaria errado.
      const doc = await this.fetchDocument(type, year, numStr); // tenta baixar o documento segundo fetchDocument

      // Se encontrou o documento, yield imediatamente. Se não, incrementa falhas
      if (doc) { //
        this.totalCollected++; 
        consecutiveFailures = 0;
        yield doc; // yield devolve o documento encontrado imediatamente, de forma que seja processado sem acumular na memória
      } else {
        consecutiveFailures++;
      }

      currentNum++;
    }
  }

  // --------------------------------------------------------------------------
  // Step 3.2: Loop por todos os anos
  // --------------------------------------------------------------------------
  
  /**
   * Loops through all provided years for a given document type,
   * yielding documents found in each year.
   * @param type The type of document ('issue' or 'offprint').
   * @param years An array of DropdownOption representing the years to scan.
   * @returns An async generator yielding DownloadedFile objects as they are found.
   */
  private async *loopYears(type: BteDocumentType, years: DropdownOption[]): AsyncGenerator<DownloadedFile> {
    for (const [index, year] of years.entries()) { // itera sobre cada ano fornecido
      if (this.limitReached()) break; // verifica se atingiu o limite defino pelo user antes de cada ano

      // Loga o progresso, apenas para informação visual
      console.log(`   [${index + 1}/${years.length}] Scanning Year ${year.value} (${type})...`);

      // Yield all documents found in this year. We use 'yield*' to delegate to the inner generator
      // What is 'yield*'? In this case, it lets us yield each DownloadedFile produced by identifyBoletins_separatas directly.
      // don’t need to store everything in memory, we can just pass them through as they come.
      // This way, we don't have to collect them all in an array first, which saves memory.
      // It's perfect for streaming scenarios like this, where we want to process items one by one.
      // Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/yield*
      yield* this.identifyBoletins_separatas(type, year.value);
    }
  }

  // --------------------------------------------------------------------------
  // Step 3.3: Main Loop
  // --------------------------------------------------------------------------

  /**
   * The main crawling function that orchestrates the entire process.
   * It identifies available years and loops through them for both issues and offprints,
   * yielding each found document immediately.
   * @param limit An optional limit on the total number of documents to collect.
   * @returns An async generator yielding DownloadedFile objects as they are found.
   */
  public async *crawlAll(limit?: number): AsyncGenerator<DownloadedFile> {
    this.totalCollected = 0;
    this.maxLimit = limit && limit > 0 ? limit : Infinity;
    
    console.log(`Crawler started (Streaming Mode | Limit: ${this.maxLimit}).`);

    const scope = await this.identifyYear(); // identifica anos disponíveis
    
    if (scope.issueYears.length === 0 && scope.offprintYears.length === 0) { // se não encontrou nenhum dropdown válido
      console.error('Error: Could not detect year dropdowns.');
      return;
    }

    if (scope.issueYears.length > 0 && !this.limitReached()) { // se encontrou anos para boletins e não atingiu o limite
      console.log(`\nStarting BULLETINS...`);
      yield* this.loopYears('issue', scope.issueYears); // itera sobre os anos de boletins, fazendo o yield de documentos encontrados
    }

    if (scope.offprintYears.length > 0 && !this.limitReached()) { // se encontrou anos para separatas e não atingiu o limite
      console.log(`\nStarting OFFPRINTS...`);
      yield* this.loopYears('offprint', scope.offprintYears); // itera sobre os anos de separatas, fazendo o yield de documentos encontrados
    }
  }
}