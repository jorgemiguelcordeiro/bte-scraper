/**
 * Define as regras que os dados extraídos devem obedecer.
 * Utiliza a biblioteca Zod para validação de esquemas.
 * Se o JSON gerado pelo parser não respeitar este formato exato, o programa rejeita o ficheiro.
 * Zod is equivalent to great expectations in python for data validation in TypeScript/JavaScript.
 */


import { z } from 'zod'; 

// define o esquema para os nós da arvore do documento
export const BteNodeSchema: z.ZodType<any> = z.lazy(() => // uso de z.lazy para permitir definição recursiva. Como um capítulo pode ter artigos dentro dele (filhos), o schema precisa de se referenciar a si próprio.
  z.object({
    type: z.union([ // define os tipos possíveis de nós
      z.literal('root'), 
      z.literal('diploma'), 
      z.literal('chapter'), 
      z.literal('article')
    ]),
    header: z.string().optional(), 
    text: z.string().optional(),
    children: z.array(BteNodeSchema).optional()
  })
);

// esquema principal que valida o documento completo
export const BteDocumentRootSchema = z.object({
  type: z.union([z.literal('issue'), z.literal('offprint')]), // tipo do documento, pode ser 'issue' ou 'offprint'
  //title: z.string().min(5, "Título demasiado curto"), // título do documento, garantindo um mínimo de 5 caracteres
  reference: z.string().min(5, "Referência demasiado curta"), // referência do documento, garantindo um mínimo de 5 caracteres
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (esperado YYYY-MM-DD)"), // data no formato YYYY-MM-DD
  url: z.string().url("URL inválido"), // URL válida
  root: BteNodeSchema // nó raiz do documento, validado pelo esquema BteNodeSchema
});