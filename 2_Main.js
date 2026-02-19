/**
 * MAIN.GS
 * 
 * Ponto de entrada principal da aplicação.
 * - Função doGet() que inicia a interface web
 * - Menu personalizado do Google Sheets (onOpen)
 * - Configurações iniciais da aplicação
 * 
 * Coordena as operações básicas do sistema.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Rifa Online 🎟️');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ GERADOR')
    .addItem('🔢 Gerar Números Automáticos', 'gerarNumeros')
    .addToUi();
}