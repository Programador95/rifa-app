/**
 * DATABASE.GS
 * 
 * Responsável por todas as operações com planilhas:
 * - Geração de números da rifa
 * - Leitura/escrita de dados na planilha
 * - Limpeza e organização de dados
 * - Operações CRUD com registros da rifa
 * 
 * Interface principal com o Google Sheets.
 */

function gerarNumeros() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
  const limite = sheet.getRange('I2').getValue(); // I2 para quantidade

  if (limite < 1 || isNaN(limite)) {
    SpreadsheetApp.getUi().alert('❌ Digite um número válido em I2!');
    return;
  }

  sheet.getRange('A2:I').clearContent(); // Limpar até coluna I (não limpar J2+)
  
  const numeros = [];
  for (let i = 0; i < limite; i++) {
    numeros.push([i.toString().padStart(3, '0')]);
  }

  sheet.getRange(2, 1, numeros.length, 1)
    .setValues(numeros)
    .setNumberFormat('@');

  sheet.getRange(2, 4, numeros.length, 1).setValue('Disponível');
  
  // Cabeçalhos — estrutura atual com Hash Comprovante na coluna F
  // A: Número | B: Nome | C: Telefone | D: Status | E: Comprovante
  // F: Hash Comprovante | G: Timestamp | H: User ID | I: Código
  const headers = sheet.getRange('1:1').getValues()[0];
  if (!headers[0]) sheet.getRange('A1').setValue('Número');
  if (!headers[1]) sheet.getRange('B1').setValue('Nome');
  if (!headers[2]) sheet.getRange('C1').setValue('Telefone');
  if (!headers[3]) sheet.getRange('D1').setValue('Status');
  if (!headers[4]) sheet.getRange('E1').setValue('Comprovante');
  if (!headers[5]) sheet.getRange('F1').setValue('Hash Comprovante');
  if (!headers[6]) sheet.getRange('G1').setValue('Timestamp');
  if (!headers[7]) sheet.getRange('H1').setValue('User ID');
  if (!headers[8]) sheet.getRange('I1').setValue('Código');
}

// NOVA FUNÇÃO: Buscar dados específicos do usuário
// NOVA FUNÇÃO: Buscar dados específicos do usuário
function getDadosRifaUsuario(userId, telefone = '') {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    
    if (!sheet) {
      console.error('Aba "Rifa" não encontrada');
      return { numeros: [], indisponiveis: [], comprados: [], preReservados: [] };
    }
    
    const lastRow = sheet.getLastRow();
    
    // Se não há dados além do cabeçalho
    if (lastRow < 2) {
      console.log('Nenhum dado encontrado na planilha');
      return { numeros: [], indisponiveis: [], comprados: [], preReservados: [] };
    }
    
    // A: Número(0) | B: Nome(1) | C: Telefone(2) | D: Status(3) | E: Comprovante(4)
    // F: Hash(5) | G: Timestamp(6) | H: User ID(7) | I: Código(8)
    const dados = sheet.getRange('A2:I' + lastRow).getDisplayValues();
    
    const resultado = {
      numeros: [],
      indisponiveis: [],
      comprados: [],
      preReservados: []
    };
    
    dados.forEach(row => {
      if (row[0]) {
        const numero = row[0].toString().trim();
        resultado.numeros.push(numero);
        
        const status = row[3];
        const userIdNaLinha = row[7]; // Coluna H - User ID (índice 7)
        const telefoneNaLinha = row[2] || ''; // Coluna C - Telefone (índice 2)
        
        if (status && status !== 'Disponível') {
          resultado.indisponiveis.push(numero);
          
          if (status === 'Pré-reservado' && userIdNaLinha !== userId) {
            resultado.preReservados.push(numero);
          }
          
          if (status === 'Reservado' && row[4]) { // Tem comprovante (coluna E)
            if ((telefone && telefoneNaLinha === telefone) || 
                (!telefone && userIdNaLinha === userId)) {
              resultado.comprados.push(numero);
            }
          }
        }
      }
    });
    
    // ✅ REMOVER DUPLICATAS (segurança extra)
    resultado.comprados = [...new Set(resultado.comprados)];
    resultado.preReservados = [...new Set(resultado.preReservados)];
    resultado.indisponiveis = [...new Set(resultado.indisponiveis)];
    
    console.log('Dados carregados para userId:', userId, 'telefone:', telefone, 'Resultado:', resultado);
    return resultado;
    
  } catch (error) {
    console.error('Erro em getDadosRifaUsuario:', error);
    return { numeros: [], indisponiveis: [], comprados: [], preReservados: [] };
  }
}

// Manter função antiga para compatibilidade (sem filtro de usuário)
function getDadosRifa() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    
    if (!sheet) {
      console.error('Aba "Rifa" não encontrada');
      return { numeros: [], indisponiveis: [], comprados: [] };
    }
    
    const lastRow = sheet.getLastRow();
    
    if (lastRow < 2) {
      console.log('Nenhum dado encontrado na planilha');
      return { numeros: [], indisponiveis: [], comprados: [] };
    }
    
    const dados = sheet.getRange('A2:E' + lastRow).getDisplayValues();
    
    const resultado = {
      numeros: [],
      indisponiveis: [],
      comprados: []
    };
    
    dados.forEach(row => {
      if (row[0]) {
        const numero = row[0].toString().trim();
        resultado.numeros.push(numero);
        
        const status = row[3];
        if (status && status !== 'Disponível') {
          resultado.indisponiveis.push(numero);
        }
      }
    });
    
    console.log('Dados carregados (função antiga):', resultado);
    return resultado;
    
  } catch (error) {
    console.error('Erro em getDadosRifa:', error);
    return { numeros: [], indisponiveis: [], comprados: [] };
  }
}