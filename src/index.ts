/**
 * ============================================================================
 * Step 1: IMPORTS & CONFIGURATION
 * ============================================================================
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Importar o Schema de Validação
import { BteDocumentRootSchema } from './data_validation_output';

import { BteCrawler } from './crawler';
import { BteParser } from './parser';
import { BteDocumentType } from './types'; // importa o tipo do documento (issue | offprint)

const OUTPUT_DIR = 'output';

/**
 * ============================================================================
 * Step 2: HELPER FUNCTIONS
 * ============================================================================
 */

/**
 * Creates a command-line interface to prompt the user for input.
 * Wraps the standard readline callback pattern in a Promise for easier async/await usage.
 * @param query The text prompt to display to the user.
 */
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin, // leitura do stdin. Srdin é o input padrão do terminal
    output: process.stdout, // escrita no stdout. Stdout é o output padrão do terminal
  });

  // retorna uma Promise que resolve com a resposta do utilizador
  // Promise é usada para facilitar o uso com async/await
  return new Promise((resolve) => //
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Translates the internal document type into a user-friendly folder name for the file system.
 * 'issue' becomes '1_Serie' and 'offprint' becomes 'Separatas'.
 */
function getSeriesFolderName(type: BteDocumentType): string {
  return type === 'issue' ? '1_Serie' : 'Separatas';
}

/**
 * Verifies if a directory path exists and creates it (including parent directories) if it does not.
 * This prevents file write errors when organizing output by Year/Number.
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * ============================================================================
 * Step 3: MAIN ORCHESTRATION (Stream Mode)
 * ============================================================================
 */

/**
 * The main application entry point.
 * It coordinates the entire pipeline:
 * 1. Reads configuration from the user.
 * 2. Initializes the Crawler (in streaming mode) and the Parser.
 * 3. Consumes the stream of downloaded documents one by one.
 * 4. Parses, VALIDA (Zod) and saves each document to the disk immediately.
 * 5. Manages explicit memory cleanup to prevent overflows.
 */
async function main() {
  console.clear();
  console.log('--------------------------------------------------');
  console.log(' BTE Extraction Tool');
  console.log('--------------------------------------------------');

  const answer = await askQuestion('\nDocument limit (Press Enter for all): ');

  let limit: number | undefined = undefined;
  if (answer.trim() !== '') {
    const parsed = parseInt(answer.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) limit = parsed;
  }

  console.log(`\n[INFO] Starting process...`);

  
  console.time('Execution Time');

  const crawler = new BteCrawler();
  const parser = new BteParser();
  
  let totalDocs = 0;
  let successCount = 0;
  let errorCount = 0;

  // IMPORTANT: We use 'for await' to process files ONE BY ONE as they come
  const documentStream = crawler.crawlAll(limit);

  for await (const doc of documentStream) { // Process each DownloadedFile one at a time
    totalDocs++;
    
    try {
      // Step 3.1: Directory structure
      const serieFolder = getSeriesFolderName(doc.docType); // '1_Serie' ou 'Separatas'
      const targetDir = path.join(
        OUTPUT_DIR,
        serieFolder,
        doc.year,
        doc.number
      );

      ensureDirectoryExists(targetDir); // garante que o diretório existe
      
      // Step 3.2: Parse
      // We parse immediately while the buffer is fresh in memory
      const rawJsonStructure = await parser.parse(doc);

      // --- DATA VALIDATION STEP by using Zod---
      // This ensures Data Quality/Integrity at Runtime.
      // If the PDF parsed result doesn't match the Schema, this throws an error.
      const validatedData = BteDocumentRootSchema.parse(rawJsonStructure);

      // Step 3.3: Save to Disk
      // We save 'validatedData' to ensure only valid JSONs exist in the output folder.
      const filePath = path.join(targetDir, 'output.json');
      fs.writeFileSync(filePath, JSON.stringify(validatedData, null, 2), 'utf-8');

      // Step 3.4: Manual Cleanup 
      // Explicitly nullify the buffer to free RAM before the next iteration
      // This is crucial in streaming mode to avoid memory bloat.
      doc.buffer = null;  

      successCount++;

      // UI Feedback: Progress Indicator
      const identifier = `${doc.year}/${doc.number} (${serieFolder})`;
      process.stdout.write(`Processed: [${totalDocs}] - ${identifier.padEnd(35)} \r`);

    } catch (error) { // Catch parsing or validation errors
      errorCount++;
      process.stdout.write('\n'); // Break line to not mess up progress bar
      
      // Detailed Error Reporting
      if (error && typeof error === 'object' && 'issues' in error) {
         console.error(`[VALIDATION ERROR] ${doc.year}/${doc.number}: Invalid Data Structure`);
         console.error(JSON.stringify(error, null, 2));
      } else {
         console.error(`[ERROR] Failed ${doc.year}/${doc.number}: ${error}`);
      }
    }
  }

  // 4. Final Report
  process.stdout.write('\n');
  console.log('\n--------------------------------------------------');
  console.log(' Final Report');
  console.log('--------------------------------------------------');
  console.log(` Total Found:       ${totalDocs}`);
  console.log(` Successfully Saved: ${successCount}`);
  console.log(` Errors:            ${errorCount}`);
  console.log(` Output Directory:  ${path.resolve(OUTPUT_DIR)}`);
  console.log('--------------------------------------------------');

  console.timeEnd('Execution Time');
}

main().catch((err) => console.error(err));