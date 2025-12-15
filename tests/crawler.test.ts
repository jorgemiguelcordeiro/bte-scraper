/**
 * Mocks are used when we want to test a piece of code that depends on external systems or modules,
 * such as HTTP requests, databases, or file systems. By using mocks, we can simulate the behavior
 * of these external dependencies without actually performing the operations, which makes our tests
 */


// importa funções do Vitest para testes. describe: define um grupo de testes, it: define um caso de teste, expect: faz asserções, vi: utilitário para mocks e spies, beforeEach: executa código antes de cada teste
import { describe, it, expect, vi, beforeEach } from 'vitest'; 


import axios from 'axios';
import { BteCrawler } from '../src/crawler';

vi.mock('axios'); // tells Vitest to mock the axios module. Instead of making real HTTP requests, all axios calls in the test will use a fake implementation that we control.
const mockedAxios = axios as any; // Vitest cria um mock do axios, permitindo simular respostas HTTP sem fazer chamadas reais

describe('BteCrawler Logic', () => { // define um grupo de testes para a lógica do BteCrawler
  let crawler: BteCrawler; 

  // antes de cada teste,  limpa os mocks do axios e cria uma nova instância do BteCrawler
  beforeEach(() => { 
    vi.clearAllMocks(); //
    crawler = new BteCrawler();
  });

  /**
   * teste para verificar se os anos são extraídos corretamente de um HTML simulado
   * - Simula uma resposta HTTP com um HTML com várias opções de anos
   * - Chama o método identifyYear do crawler
   * - Verifica se os anos extraídos correspondem ao esperado
   * - só testamos os anos de 2024 e 2023 para simplificar
  */
  it('deve extrair anos corretamente de um HTML simulado', async () => {
    const fakeHtml = `
      <html><body>
        <select name="ano">
            <option value="2024"> 2024 </option> <option value="2023">2023</option>
        </select>
        <select name="lixo"><option>Outra coisa</option></select>
      </body></html>
    `;

    mockedAxios.get.mockResolvedValue({ 
      data: fakeHtml,  // uma resposta simulada com o HTML fake
      status: 200 
    });

    const result = await (crawler as any).identifyYear(); // chama o método privado identifyYear do crawler

    expect(result.issueYears).toHaveLength(2); // verifica se dois anos foram extraídos, apenas 2024 e 2023
    expect(result.issueYears[0].label).toBe('2024'); // verifica se o primeiro ano é 2024
    expect(axios.get).toHaveBeenCalledTimes(2); // verifica se o axios.get foi chamado duas vezes (uma para cada ano)
  });
});