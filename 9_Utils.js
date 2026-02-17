/**
 * UTILS.GS
 * 
 * Funções utilitárias e de apoio:
 * - Inclusão de templates HTML
 * - Funções auxiliares gerais
 * - Ferramentas de desenvolvimento
 * - Funções de teste
 * 
 * Oferece suporte para outros módulos do sistema.
 */


/**
 * Inclui o conteúdo de um arquivo HTML dentro de outro
 * @param {string} filename Nome do arquivo (sem extensão)
 * @return {string} Conteúdo HTML do arquivo
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// FUNÇÃO DE TESTE - Execute esta para verificar se os dados estão sendo carregados
function testarCarregamentoDados() {
  const resultado = getDadosRifa();
  console.log('Resultado do teste:', resultado);
  
  if (resultado.numeros.length === 0) {
    console.log('❌ Nenhum número encontrado. Verifique:');
    console.log('1. Se existe a aba "Rifa"');
    console.log('2. Se há números na coluna A a partir da linha 2');
    console.log('3. Se executou a função gerarNumeros()');
  } else {
    console.log('✅ Dados carregados com sucesso!');
    console.log(`Total de números: ${resultado.numeros.length}`);
    console.log(`Números indisponíveis: ${resultado.indisponiveis.length}`);
  }
  
  return resultado;
}

// Função para executar manualmente e testar
function testarLimpeza() {
  console.log('🧪 Iniciando teste de limpeza...');
  const resultado = limparDadosPreReservasExpiradas();
  console.log('📊 Resultado do teste:', resultado);
  return resultado;
}