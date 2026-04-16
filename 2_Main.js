/**
 * MAIN.GS
 *
 * - doGet()  → serve a interface web da rifa
 * - doPost() → recebe webhooks da Evolution API (comprovantes via WhatsApp)
 * - onOpen() → menu personalizado no Google Sheets
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Rifa Online 🎟️');
}

/**
 * Recebe POST da Evolution API.
 * Sempre retorna HTTP 200 para evitar retentativas em loop.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      console.warn('⚠️ [doPost] Requisição sem body');
      return _jsonOk();
    }
    const payload = JSON.parse(e.postData.contents);
    console.log(`📩 [doPost] Evento: ${payload.event || 'desconhecido'}`);
    processarWebhookEvolution(payload);
  } catch (err) {
    console.error('❌ [doPost] Erro:', err.message);
  }
  return _jsonOk();
}

function _jsonOk() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ GERADOR')
    .addItem('🔢 Gerar Números Automáticos', 'gerarNumeros')
    .addToUi();
}
