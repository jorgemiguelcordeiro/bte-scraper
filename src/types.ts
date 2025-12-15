/**
 * Define se o documento é um Boletim normal (issue) ou uma Separata (offprint).
 */
export type BteDocumentType = 'issue' | 'offprint';

/**
 * Representa uma opção extraída de um dropdown HTML (<select>).
 */
export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Estrutura de um ficheiro descarregado em memória, antes de ser processado.
 */
export interface DownloadedFile {
  buffer: ArrayBuffer;    // O conteúdo binário do PDF
  url: string;            // A origem
  docType: BteDocumentType;
  year: string;
  number: string;
}

/**
 * Nó individual da árvore hierárquica do documento (Diploma, Capítulo, Artigo, etc).
 */
export interface BteNode {
  type: 'root' | 'diploma' | 'chapter' | 'article' | string;
  header?: string;        // Título da secção (ex: "Artigo 1.º")
  text?: string;          // O conteúdo de texto
  children?: BteNode[];   // Subelementos
}

/**
 * O objeto JSON final e completo que representa um BTE processado.
 */
export interface BteDocumentRoot {
  type: BteDocumentType;
  reference: string;      // Ex: "BTE n.º 1, 2024"
  date: string;           // Data de publicação (ISO YYYY-MM-DD)
  url: string;
  root: BteNode;          // A árvore de conteúdo
}