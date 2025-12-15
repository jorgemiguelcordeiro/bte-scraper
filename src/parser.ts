/**
 * ============================================================================
 * Step 1: IMPORTS, INTERFACES AND CONFIGURATION
 * ============================================================================
 */
// Import from LEGACY build (compatible with Node/Bun)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); //This library reads raw PDF binaries and extracts text with coordinates.

import { 
  DownloadedFile, 
  BteDocumentRoot, 
  BteNode 
} from './types';

/**
 * Represents a text line extracted from the PDF, including its coordinates.
 */
interface TextLine {
  text: string;
  y: number;
  isBold: boolean;
  page: number;
}

/**
 * ============================================================================
 * Step 2: HELPER FUNCTIONS
 * ============================================================================
 */

// Converts various data types to Uint8Array for PDF.js processing. PDF.js expects a Uint8Array
function toUint8Array(data: any): Uint8Array {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

/**
 * Converts Portuguese date strings to ISO format (YYYY-MM-DD)
 * Criteria:
 - Handles month names in Portuguese
 - Cleans up common formatting issues
 - Defaults to current date if parsing fails
 * */ 

// converts Portuguese date strings to ISO format (YYYY-MM-DD)
function convertDateToISO(ptDate: string): string { 
  const map: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };
  
  
  const cleanDate = ptDate.toLowerCase().replace(/\s+de\s+/g, ' '); // limpa a string de data removendo "de" e espaços extras

  // divide a string em partes. dividimos em 3 partes: dia, mês e ano
  const parts = cleanDate.split(/\s+/);


  if (parts.length < 3) return new Date().toISOString().split('T')[0]; // isto garante que temos pelo menos dia, mês e ano, senão retorna a data atual
  
  let day = parts[0]; //
  let monthName = parts[1];
  let year = parts[2];

  const monthIndex = parts.findIndex(p => map[p]); // procura qual parte é o mês
  if (monthIndex > 0 && monthIndex + 1 < parts.length) { // se o mês for encontrado, reatribui as variáveis
      monthName = parts[monthIndex]; // nome do mês
      day = parts[monthIndex - 1]; // dia, que é a parte antes do mês
      year = parts[monthIndex + 1]; // ano, que é a parte depois do mês
  }
  const month = map[monthName]; // converte o nome do mês para número usando o mapa
  day = day.padStart(2, '0');  // garante que o dia tem dois dígitos

  // retorna a data no formato ISO se todos os componentes forem válidos
  if (day && month && year && year.length === 4) return `${year}-${month}-${day}`;
  return new Date().toISOString().split('T')[0];
}

/**
 * ============================================================================
 * Step 3: MAIN CLASS (BteParser)
 * ============================================================================
 */

export class BteParser {

  constructor() {}

  // --------------------------------------------------------------------------
  // Step 3.1: Text Extraction
  // --------------------------------------------------------------------------

  /**
   * This method extracts text lines from a PDF buffer using pdfjs-dist.
   * It processes each page, retrieves text content, and organizes it into lines
   * with their respective coordinates.
   * @param buffer 
   * @returns 
   */

  /**
   * NOTA IMPORTANTE SOBRE COORDENADAS EM PDF (pdf.js)
   *
   * Um PDF NÃO guarda texto de forma linear (como um .txt ou .docx).
   * O PDF apenas descreve:
   *   - qual é o texto
   *   - em que posição exata da página esse texto é desenhado
   *
   * Ou seja:
   *  Não existem linhas, Não existe ordem de leitura garantida, Não existem parágrafos
   *
   * Por isso, ao extrair texto com pdf.js, recebemos vários fragmentos
   * (palavras ou partes de palavras) fora de ordem.
   *
   * Cada fragmento vem com uma matriz de transformação:
   *   item.transform = [a, b, c, d, e, f]
   *
   * Onde:
   *   - transform[4] (e) representa a coordenada X (posição horizontal)
   *   - transform[5] (f) representa a coordenada Y (posição vertical)
   *
   * Estes índices (4 e 5) NÃO são arbitrários — fazem parte da especificação
   * do PDF e indicam o deslocamento do texto na página.
   *
   * Usamos estas coordenadas para:
   *   1) Reconstruir a ordem correta de leitura
   *   2) Agrupar fragmentos na mesma linha
   *   3) Distinguir títulos, artigos e conteúdo normal
   *
   * A ordenação segue a leitura humana:
   *   - Primeiro por Y (de cima para baixo)
   *   - Depois por X (da esquerda para a direita)
   *
   * Sem esta lógica baseada em coordenadas, o texto extraído ficaria
   * desordenado e seria impossível reconstruir a estrutura legal do documento.
   */

  private async extractTextFromPdf(buffer: ArrayBuffer): Promise<TextLine[]> {
    const cleanData = toUint8Array(buffer); // converte o buffer para Uint8Array, que é o formato esperado pelo pdfjs-dist
    const loadingTask = pdfjsLib.getDocument({  // Loads the PDF into memory
      data: cleanData,
      disableFontFace: true,
      verbosity: 0 
    });
    
    const pdfDocument = await loadingTask.promise; // espera o carregamento do PDF
    const lines: TextLine[] = []; // array para armazenar as linhas extraídas

    // Loop through each page of the PDF

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i); // obtém a página atual
      const content = await page.getTextContent(); // obtém o conteúdo de texto da página

      // Organize text items into lines based on their Y coordinates
      // cada item tem a sua posição (x,y) na página. 
      
      const pageItems = content.items.map((item: any) => ({
        text: item.str, // o texto do item
        y: item.transform[5], // coordenada Y que indica a linha, usamos o índice 5 do array transform
        x: item.transform[4], // coordenada X que indica a posição horizontal do texto. Usamos o índice 4 do array transform 
        hasEol: item.hasEOL // indica se o item termina uma linha
      }));

      // Sort items first by Y (top to bottom), then by X (left to right)
      pageItems.sort((a: any, b: any) => {
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

      let currentLine = ""; // armazena o texto da linha atual
      let lastY = -1; // armazena a coordenada Y da última linha processada

      // Agrupa os itens na mesma linha com base na coordenada Y, considerando uma margem de erro de 5 unidades
      // Critérios de agrupamento:
      // - Se a diferença entre a coordenada Y do item atual e a última for maior que 5, considera-se uma nova linha
      // - Caso contrário, o item pertence à linha atual

      for (const item of pageItems) {
        if (lastY !== -1 && Math.abs(item.y - lastY) > 5) {
          if (currentLine.trim()) {
            lines.push({ text: currentLine.trim(), y: lastY, isBold: false, page: i });
          }
          currentLine = "";
        }
        currentLine += item.text + " ";
        lastY = item.y;
      }
      // Push any remaining text as the last line on the page
      if (currentLine.trim()) lines.push({ text: currentLine.trim(), y: lastY, isBold: false, page: i });
    }
    return lines;
  }

  // --------------------------------------------------------------------------
  // Step 3.2: Cleanup and Metadata Extraction
  // --------------------------------------------------------------------------

  /**
   * Cleans noise from extracted text lines.
   * Removes irrelevant lines based on specific patterns.
   * @param lines 
   * @returns
   * Critérios de remoção de linhas:
   * - Linhas que são apenas números (páginas, números soltos)
   * - Linhas que contêm "Boletim do Trabalho e Emprego"
   * - Linhas que contêm "| Vol. n.º"
   * - Linhas que correspondem a padrões específicos de cabeçalhos a ignorar
   */
  private cleanNoise(lines: TextLine[]): TextLine[] {
    // Regex for section headers we want to ignore completely
    const ignorePatterns = /^(CONVENÇÕES COLETIVAS|PRIVADO|REGULAMENTAÇÃO DO TRABALHO|ORGANIZAÇÕES DO TRABALHO|CONSELHO ECONÓMICO E SOCIAL|ARBITRAGEM.*|Acórdão.*)$/i;
    
    // Filtra as linhas com base nos critérios definidos
    return lines.filter(line => {
      const txt = line.text.trim();
      if (/^\d+$/.test(txt)) return false;  // Remove lines that are just numbers
      if (txt.includes("Boletim do Trabalho e Emprego")) return false; // Remove header/footer lines
      if (txt.includes("|") && txt.includes("Vol.") && txt.includes("n.º")) return false; // Remove volume headers

      // Filter out lines that match "BTE <number> | <number>" pattern, which are likely page headers/footers
      if (/^BTE\s+\d+\s*\|\s*\d+$/i.test(txt)) return false;
      
      // Filter out the category headers you identified
      if (ignorePatterns.test(txt)) return false;

      return true;
    });
  }

  // Extracts global metadata like date and full reference from the text lines
  // Criteria:
  // - Looks for patterns in the first 10 lines
  // - Extracts date, volume, and number
  // - Constructs a full reference string
  private extractGlobalMetadata(lines: TextLine[], file: DownloadedFile) {
    let dateStr = ""; 
    let fullReference = "";

    const headerLineRegex = /^(.*?)\s*\|\s*n\.º\s*(\d+)\s*\|\s*Vol\.\s*(\d+)/i; // regex para capturar linhas de cabeçalho com data, número e volume
    const monthsRegex = "(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)"; // regex para meses em português
    const dateRegex = new RegExp(`\\d{1,2}\\s+(?:de\\s+)?${monthsRegex}\\s+(?:de\\s+)?\\d{4}`, "i"); // regex para capturar datas em formato português

    let foundDateText = "";
    let foundVolume = "";
    let foundNumber = file.number; // default para o número do arquivo, caso não seja encontrado no texto

    // Procura nas primeiras 10 linhas por padrões de data, número e volume
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const txt = lines[i].text.trim();
      const headerMatch = txt.match(headerLineRegex);
      
      if (headerMatch) { // se encontrar uma linha que corresponde ao padrão de cabeçalho
        foundDateText = headerMatch[1].trim(); 
        foundNumber = headerMatch[2]; 
        foundVolume = headerMatch[3];
        break;
      }
      if (!foundDateText) { // se ainda não encontrou a data, tenta encontrar uma data na linha atual
        const matchDate = txt.match(dateRegex);
        if (matchDate) foundDateText = matchDate[0];
      }
    }

    if (foundDateText) dateStr = convertDateToISO(foundDateText); 
    else dateStr = `${file.year}-01-01`;

    let datePart = "";
    if (foundDateText) { //
        const prefix = foundDateText.toLowerCase().startsWith("de ") ? "" : "de ";
        datePart = `, ${prefix}${foundDateText}`;
    } else {
        datePart = `, de ${file.year}`;
    }

    const volPart = foundVolume ? `, Vol. ${foundVolume}` : ""; //
    fullReference = `BTE n.º ${foundNumber}${volPart}${datePart}`; // constrói a referência completa

    return { date: dateStr, reference: fullReference };
  }

  // --------------------------------------------------------------------------
  // Step 3.3: Tree Construction (Logical Parsing)
  // --------------------------------------------------------------------------

  /**
   * Constructs a hierarchical tree from cleaned text lines.
   * @param lines 
   * @returns 
   * Critérios de construção da árvore:
   * - Identifica títulos de diplomas, capítulos e artigos usando regex
   * - Agrupa o conteúdo sob os nós apropriados
   * - Mantém uma pilha para gerenciar a hierarquia
   */
  private buildTree(lines: TextLine[]): BteNode {
    const root: BteNode = { type: 'root', children: [] }; // nó raiz da árvore
    let stack: BteNode[] = [root]; // pilha para gerir a hierarquia de nós

    // Define regex patterns para identificar diferentes tipos de títulos
    const patterns = {
      // Diplomas: Contrato, Portaria, Acordo, etc.
      diploma: /^(Portaria|Decreto-Lei|Despacho|Acordo|Contrato|Convenção|Decisão|Parecer|Aviso)\s+(n\.º|número)?/i,
      // Structures: Chapters AND Preâmbulo
      structure: /^(Capítulo|Secção|Anexo)\s+[IVXLCDM\d]+|^Preâmbulo/i,
      // Articles
      article: /^(Artigo|Cláusula)\s+\d+/i
    };

    // Loop through each line to build the tree structure
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let text = line.text.trim();
      let headerText = text;
      
      //
      let matchedType: 'diploma' | 'chapter' | 'article' | null = null;
      if (patterns.diploma.test(text)) matchedType = 'diploma';
      else if (patterns.structure.test(text)) matchedType = 'chapter';
      else if (patterns.article.test(text)) matchedType = 'article';

      if (matchedType) {
        // Handle multi-line headers (e.g., titles that span multiple lines)
        const isStrictPreambulo = /^Preâmbulo$/i.test(headerText.trim());
        
        //
        if (!isStrictPreambulo) {
          while (i + 1 < lines.length) {
            const nextLine = lines[i+1].text.trim();
            
            // Criteria to determine if the next line is part of the current header
            // We consider it part of the header if:
            // - It's not too long (less than 250 characters)
            // - It doesn't match other known patterns (article, structure, diploma)
            // - It doesn't start a new numbered section
            // - It doesn't end with punctuation (.,:,;, etc.)
            const looksLikeTitle = 
              nextLine.length > 0 &&
              nextLine.length < 250 && 
              !patterns.article.test(nextLine) && 
              !patterns.structure.test(nextLine) && 
              !patterns.diploma.test(nextLine) && // Don't merge if next line is a new diploma
              !/^\d+[\.\-]/.test(nextLine) &&
              !/^(Preâmbulo)/i.test(nextLine) &&
              !/[.:;]$/.test(nextLine); // If ends with punctuation, likely end of title
            
            // If the next line looks like part of the title, append it
            if (looksLikeTitle) {
              headerText += ` ${nextLine}`;
              i++;
            } else {
              break;
            }
          }
        }
        // Create new node, depending on the matched type, and add it to the tree
        const newNode: BteNode = { type: matchedType, header: headerText, children: [] };
        if (matchedType === 'article') newNode.text = "";

        // Add the new node to the tree based on its type
        if (matchedType === 'diploma') {
          stack = [root];
          this.addChild(stack, newNode);
        } 
        else if (matchedType === 'chapter') {
          this.popUntilType(stack, ['diploma', 'root']); //
          this.addChild(stack, newNode);
        }
        else if (matchedType === 'article') {
          this.popUntilType(stack, ['chapter', 'diploma', 'root']);
          this.addChild(stack, newNode);
        }
        continue;
      }

      // If the line is not a header, it's content text. Add it to the current node.
      const currentNode = stack[stack.length - 1];
      if (currentNode.type !== 'root') {
         if (!currentNode.text) currentNode.text = "";
         currentNode.text += (currentNode.text ? "\n" : "") + text;
      }
    }
    return root;
  }



  // Helper methods for managing the tree structure, such as adding children and popping the stack
  private addChild(stack: BteNode[], node: BteNode) {
    const parent = stack[stack.length - 1];
    if (!parent.children) parent.children = [];
    parent.children.push(node);
    stack.push(node);
  }

  private popUntilType(stack: BteNode[], types: string[]) {
    while (stack.length > 1) {
      const current = stack[stack.length - 1];
      if (types.includes(current.type as string)) break;
      stack.pop();
    }
  }

  // Cleans up text in the tree nodes by removing unwanted line breaks and extra spaces
  // Criteria:
  // - Removes hyphenation at line breaks
  // - Merges lines that were split incorrectly
  // - Trims extra spaces
  private cleanTreeText(node: BteNode) {
    if (node.text) {
      node.text = node.text.replace(/(\p{L})\s+-\s+(\p{L})/gu, '$1$2');
      node.text = node.text.replace(/(\p{L})-\s*[\r\n]+\s*(\p{L})/gu, '$1$2');
      node.text = node.text.replace(/\n(?!\s*(?:\d+|[a-z])\s*[-–.)])/gi, ' ');
      node.text = node.text.replace(/\s{2,}/g, ' ');
      node.text = node.text.trim();
    }
    if (node.children) {
      for (const child of node.children) {
        this.cleanTreeText(child);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Step 3.4: Main Parse Method
  // --------------------------------------------------------------------------
  /**
   * This is the main method to parse a downloaded BTE file.
   * @param file 
   * @returns 
   * Criteria:
   * - Extracts text from PDF
   * - Cleans noise from text lines
   * - Extracts global metadata (date, reference)
   * - Builds a hierarchical tree structure
   * - Cleans up text in the tree
   * - Returns a structured BteDocumentRoot object
   */
  public async parse(file: DownloadedFile): Promise<BteDocumentRoot> {
    const rawLines = await this.extractTextFromPdf(file.buffer);
    const { date, reference } = this.extractGlobalMetadata(rawLines, file);
    const cleanLines = this.cleanNoise(rawLines);
    const rootNode = this.buildTree(cleanLines);
    this.cleanTreeText(rootNode);

    return {
      type: file.docType,
      reference: reference,
      date: date,
      url: file.url,
      root: rootNode
    };
  }
}
