//   Identificar Headers por estarem centralizados  

/**

Atualmente, uso Regex para detetar títulos. No entanto, Regex pode falhar se o texto não seguir um padrão exato. 

Visualmente, os headers importantes estão quase sempre centralizados na página.

O pdfjs-dist fornece-nos a posição x (início do texto) e a width (largura do texto).

Com base nisso, podemos verificar se o ponto médio do texto coincide com o ponto médio da página.

Podemos adicionar uma pequena margem de erro.
 */

function isHeaderCentered(textItem: any, pageWidth: number): boolean {
    const textMidPoint = textItem.transform[4] + (textItem.width / 2); // transform[4] é o X
    const pageMidPoint = pageWidth / 2; // Ponto médio da página
    
    // Definimos uma tolerância de 10px para compensar imperfeições do PDF
    const tolerance = 10; 

    // Se a diferença for menor que 10px, está visualmente centralizado
    return Math.abs(textMidPoint - pageMidPoint) < tolerance;
}


// Processar 2 colunas

/**
 Muitas vezes, os PDFs têm layout de 2 colunas. 
 Precisamos de garantir que estamos a processar o texto na ordem correta.    
Podemos dividir a página ao meio e processar cada metade separadamente.
Porque o problema é que o parser poderia ler a primeira linha da coluna da esquerda e imediatamente a primeira linha da coluna da direita
*/

/**
 * Primeiro, dividimos a página em duas metades.
 * Depois, processamos os textos de cada metade separadamente.
 * Se texto < metade da página, pertence à coluna da esquerda.
 * Se texto >= metade da página, pertence à coluna da direita.
 * Depois ordenamos os textos dentro de cada coluna pela sua posição Y (de cima para baixo).
 * Finalmente, juntamos os textos da coluna da esquerda com os da coluna da direita.
*/


function sortTwoColumns(items: TextItem[], pageMidX: number): TextItem[] {
    
    // 1. buckets para separar o conteúdo espacialmente
    const headers: TextItem[] = [];   // Guarda títulos largos que atravessam as duas colunas
    const leftCol: TextItem[] = [];   // Guarda o texto que está visualmente na esquerda
    const rightCol: TextItem[] = [];  // Guarda o texto que está visualmente na direita

    
    for (const item of items) {
        
        
        // Verifica se a largura do texto é grande o suficiente para ser um título central.
        
        if (item.width > (pageMidX * 0.8)) {
            headers.push(item); // Adiciona ao array de cabeçalhos
            continue;           // Salta para o próximo item (não precisa de verificar colunas)
        }

        // Segmentsção em colunas:
        // Verifica a posição horizontal (x) do item em relação ao meio da página.
        if (item.x < pageMidX) {
            // Se o x for menor que o meio, o texto pertence à Coluna da Esquerda
            leftCol.push(item);
        } 
        else {
            // Caso contrário (x maior que o meio), o texto pertence à Coluna da Direita
            rightCol.push(item);
        }
    }

    // 3. Ordenação vertical dentro de cada coluna
    // No PDF.js, a coordenada Y=0 é o fundo da página.
    // Portanto, Y maior significa que está mais acima. Ordenamos de forma decrescente (b - a).
    const sortY = (a, b) => b.y - a.y; 
    
    
    // 1º: Títulos que atravessam 2 colunas (lidos primeiro)
    // 2º: Coluna da Esquerda (lida de cima para baixo)
    // 3º: Coluna da Direita (lida de cima para baixo após terminar a esquerda)
    return [
        ...headers.sort(sortY),
        ...leftCol.sort(sortY),
        ...rightCol.sort(sortY)
    ];
}