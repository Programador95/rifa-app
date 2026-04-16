/**
 * 11_WhatsAppWebhook.js
 *
 * Recebimento de comprovantes via WhatsApp.
 * Evolution API v2.2.3 — endpoint: /chat/getBase64FromMediaMessage
 *
 * FLUXO:
 * 1. Evolution API dispara webhook POST → doPost() → processarWebhookEvolution()
 * 2. Filtra imageMessage / documentMessage recebidos (não enviados pelo bot)
 * 3. Grava status intermediário na col J da Rifa (para polling do frontend)
 * 4. Baixa mídia, salva no Drive, roda OCR, atualiza planilha
 * 5. Responde ao usuário via WhatsApp
 *
 * STATUS NA COL J (índice 9):
 *   wh_recebido    → imagem chegou, ainda não processada
 *   wh_processando → OCR em andamento
 *   wh_invalido    → OCR falhou (motivo na col K)
 *   (vazio)        → aprovado — o próprio status "Reservado" na col D é a fonte da verdade
 */

// ─────────────────────────────────────────────────────────────────────────────
// PONTO DE ENTRADA — chamado pelo doPost em 2_Main.js
// ─────────────────────────────────────────────────────────────────────────────
function processarWebhookEvolution(payload) {
  try {
    const evento = (payload.event || '').toLowerCase().replace('.', '_');
    if (evento !== 'messages_upsert') {
      console.log(`ℹ️ [WH] Evento ignorado: ${payload.event}`);
      return;
    }

    const data = payload.data;
    if (!data) return;

    // Ignorar mensagens enviadas pelo próprio bot
    if (data.key && data.key.fromMe === true) return;

    const message = data.message;
    if (!message) return;

    const tipoMidia = detectarTipoMidia(message);
    if (!tipoMidia) {
      // Mensagem de texto — responder com instrução amigável
      const remoteJid = data.key.remoteJid || '';
      const telefone  = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
      if (telefone && !telefone.includes('@') && !telefone.includes('-')) {
        responderMensagemTexto(telefone, message);
      }
      return;
    }

    const remoteJid = data.key.remoteJid || '';
    const telefone  = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    if (!telefone || telefone.includes('@') || telefone.includes('-')) return;

    const messageId = data.key.id;

    // Anti-duplicata
    if (mensagemJaProcessada(messageId)) {
      console.log(`ℹ️ [WH] MessageId ${messageId} já processado`);
      return;
    }
    marcarMensagemComoProcessada(messageId);

    console.log(`📱 [WH] Mídia recebida de ${telefone} | tipo: ${tipoMidia}`);

    // Confirmar recebimento ao usuário imediatamente
    enviarMensagemWH(telefone, '📸 Recebi seu comprovante! Estou analisando... aguarde. ⏳');

    // Gravar status intermediário para o polling do frontend
    gravarStatusWH(telefone, 'wh_recebido', '');

    // Processar (síncrono — Evolution v2 aguarda resposta em até 30s)
    processarComprovanteWhatsApp(telefone, messageId, data.key, data.message, tipoMidia);

  } catch (err) {
    console.error('❌ [WH] Erro no webhook:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSAMENTO CENTRAL
// ─────────────────────────────────────────────────────────────────────────────
function processarComprovanteWhatsApp(telefone, messageId, key, message, tipoMidia) {
  try {
    console.log(`🔍 [WH] Processando para: ${telefone}`);

    // 1. Buscar pré-reserva ativa
    const reserva = buscarPreReservaPorTelefone(telefone);
    if (!reserva) {
      console.log(`⚠️ [WH] Sem pré-reserva para ${telefone}`);
      enviarMensagemWH(telefone,
        '⚠️ Não encontrei uma reserva ativa para o seu número.\n\n' +
        'Para participar, acesse o site, escolha seus números e envie o comprovante aqui após o pagamento. 😊\n\n' +
        '🔗 [LINK DO SITE]'
      );
      return;
    }

    console.log(`✅ [WH] Reserva: ${reserva.numeros.join(', ')} | Código: ${reserva.codigo}`);

    // 2. Sinalizar que está processando
    gravarStatusWH(telefone, 'wh_processando', '', reserva);

    // 3. Baixar mídia (Evolution API v2.2)
    const blob = baixarMidiaEvolution(key, message, tipoMidia);
    if (!blob) {
      gravarStatusWH(telefone, 'wh_invalido', 'Não foi possível baixar a imagem', reserva);
      enviarMensagemWH(telefone,
        '❌ Não consegui baixar a imagem. Por favor, tente enviar novamente. 🙏'
      );
      return;
    }

    // 4. Salvar no Drive (mesma pasta do site)
    const tel       = telefone.replace(/\D/g, '');
    const timestamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd_HHmmss');
    const ext       = tipoMidia === 'documentMessage' ? '.pdf' : '.jpg';
    blob.setName(`comprovante_WA_${tel}_${timestamp}${ext}`);

    const pasta   = DriveApp.getFolderById(FOLDER_ID);
    const arquivo = pasta.createFile(blob);
    const arquivoId  = arquivo.getId();
    const arquivoUrl = arquivo.getUrl();
    console.log(`✅ [WH] Salvo no Drive: ${arquivoUrl}`);

    // 5. Dados para validação OCR (idêntico ao site)
    const dadosValidacao = {
      valorEsperado:    reserva.numeros.length * VALOR_POR_NUMERO,
      timestampReserva: reserva.timestampReserva,
      identificadorPix: reserva.codigo ? `RifaNotebook${reserva.codigo}` : null
    };

    // 6. OCR + validação (mesma função do site)
    const resultadoOCR = validarComprovanteCompleto(arquivoId, dadosValidacao);

    if (!resultadoOCR.valido) {
      console.log(`❌ [WH] OCR falhou: ${resultadoOCR.motivo}`);

      moverParaSuspeitos(arquivoId, resultadoOCR.docOCRId, resultadoOCR.status);

      logarTentativaSuspeita({
        nome:       reserva.nome,
        telefone:   telefone,
        userId:     reserva.userId,
        numeros:    reserva.numeros.join(', '),
        codigo:     reserva.codigo || 'N/A',
        motivo:     `[WhatsApp] ${resultadoOCR.motivo}`,
        linkImagem: arquivoUrl,
        linkOCR:    resultadoOCR.docOCRId
          ? `https://docs.google.com/document/d/${resultadoOCR.docOCRId}`
          : 'Não gerado'
      });

      try {
        salvarPendentePorFalhaComprovante({
          nome:             reserva.nome,
          telefone:         telefone,
          userId:           reserva.userId,
          numeros:          reserva.numeros,
          codigo:           reserva.codigo || 'N/A',
          valor:            reserva.numeros.length * VALOR_POR_NUMERO,
          timestampReserva: reserva.timestampReserva,
          motivo:           `[WhatsApp] ${resultadoOCR.motivo}`
        });
      } catch (e) { console.warn('⚠️ Pendentes (não crítico):', e); }

      // Gravar status inválido para polling
      gravarStatusWH(telefone, 'wh_invalido', resultadoOCR.motivo, reserva);

      const valorEsperado = (reserva.numeros.length * VALOR_POR_NUMERO).toFixed(2);
      enviarMensagemWH(telefone,
        `❌ *Comprovante não aprovado*\n\n` +
        `Motivo: ${resultadoOCR.motivo}\n\n` +
        `Por favor, envie um comprovante válido e legível. 📸\n\n` +
        `*Dicas:*\n` +
        `• PIX deve estar *concluído* (não agendado)\n` +
        `• Valor: *R$ ${valorEsperado}*\n` +
        `• Imagem nítida, sem cortes`
      );
      return;
    }

    console.log('✅ [WH] OCR aprovado');

    // 7. Atualizar planilha para "Reservado" (idêntico ao site)
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    reserva.linhas.forEach(({ linha }) => {
      const row = linha + 2;
      sheet.getRange(row, 4).setValue('Reservado');
      sheet.getRange(row, 5).setValue(arquivoUrl);
      sheet.getRange(row, 6).setValue(
        resultadoOCR.detalhes && resultadoOCR.detalhes.hashComprovante
          ? resultadoOCR.detalhes.hashComprovante : ''
      );
      sheet.getRange(row, 7).setValue(new Date());
      // Limpar status intermediário WH (col J)
      sheet.getRange(row, 10).setValue('');
      sheet.getRange(row, 11).setValue('');
    });
    SpreadsheetApp.flush();

    // 8. Marcar pendente como recuperado
    try { marcarPendenteComoRecuperado({ codigo: reserva.codigo }); }
    catch (e) { console.warn('⚠️ Pendente (não crítico):', e); }

    // 9. Enviar confirmação (mesma função do site)
    enviarConfirmacaoCompra(
      reserva.nome, telefone, reserva.numeros,
      reserva.codigo, reserva.numeros.length * VALOR_POR_NUMERO
    );

    console.log(`🎉 [WH] Compra finalizada para ${telefone}`);

  } catch (err) {
    console.error('❌ [WH] Erro processarComprovanteWhatsApp:', err.message);
    enviarMensagemWH(telefone,
      '⚠️ Ocorreu um erro interno. Por favor, tente novamente ou acesse o site. 🙏'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS INTERMEDIÁRIO (col J = 10, col K = 11 — zero-based na API)
// ─────────────────────────────────────────────────────────────────────────────
function gravarStatusWH(telefone, status, motivo, reserva) {
  try {
    const telNorm = normalizarTelefone(telefone);
    const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const rows = sheet.getRange('A2:I' + lastRow).getValues();
    for (let i = 0; i < rows.length; i++) {
      const rowStatus = (rows[i][3] || '').toString().trim();
      const rowTel    = normalizarTelefone((rows[i][2] || '').toString());
      const rowUid    = (rows[i][7] || '').toString().trim();

      const matchTel = rowTel === telNorm;
      const matchUid = reserva && rowUid === reserva.userId;

      if ((matchTel || matchUid) && rowStatus === 'Pré-reservado') {
        sheet.getRange(i + 2, 10).setValue(status);
        sheet.getRange(i + 2, 11).setValue(motivo || '');
      }
    }
    SpreadsheetApp.flush();
  } catch (err) {
    console.error('⚠️ gravarStatusWH:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPOSTA A MENSAGEM DE TEXTO
// ─────────────────────────────────────────────────────────────────────────────
function responderMensagemTexto(telefone, message) {
  try {
    const texto = (message.conversation || message.extendedTextMessage?.text || '').toLowerCase();

    // Ignorar mensagens automáticas do próprio sistema
    if (!texto || texto.length < 2) return;

    const reserva = buscarPreReservaPorTelefone(telefone);
    if (reserva) {
      enviarMensagemWH(telefone,
        `📸 *Olá, ${reserva.nome}!*\n\n` +
        `Vi que você tem uma reserva ativa (números: ${reserva.numeros.join(', ')}).\n\n` +
        `Após realizar o pagamento PIX, *envie uma foto ou print do comprovante aqui nessa conversa* que processo automaticamente! ✅`
      );
    } else {
      enviarMensagemWH(telefone,
        `👋 *Olá!*\n\n` +
        `Para participar da rifa, acesse o site, escolha seus números e faça o pagamento.\n\n` +
        `Após pagar, *envie o comprovante aqui* que processo automaticamente! ✅\n\n` +
        `🔗 [LINK DO SITE]`
      );
    }
  } catch (e) { /* não crítico */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSCA DE PRÉ-RESERVA POR TELEFONE
// ─────────────────────────────────────────────────────────────────────────────
function buscarPreReservaPorTelefone(telefone) {
  try {
    const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const telNorm = normalizarTelefone(telefone);
    const dados   = sheet.getRange('A2:I' + lastRow).getValues();

    const linhasEncontradas = [];
    dados.forEach((linha, idx) => {
      const status   = (linha[3] || '').toString().trim();
      const telLinha = normalizarTelefone((linha[2] || '').toString());
      if (status === 'Pré-reservado' && telLinha === telNorm) {
        linhasEncontradas.push({
          numero:           linha[0].toString().trim().padStart(3, '0'),
          nome:             linha[1] || '',
          telefone:         linha[2] || '',
          userId:           (linha[7] || '').toString(),
          codigo:           (linha[8] || '').toString().trim(),
          timestampReserva: linha[6] ? new Date(linha[6]) : new Date(Date.now() - 10 * 60 * 1000),
          linha:            idx
        });
      }
    });

    if (linhasEncontradas.length === 0) return null;

    // Agrupar pelo código (podem existir reservas de tentativas diferentes)
    const grupos = {};
    linhasEncontradas.forEach(item => {
      const key = item.codigo || item.userId || item.linha.toString();
      if (!grupos[key]) {
        grupos[key] = {
          nome: item.nome, telefone: item.telefone,
          userId: item.userId, codigo: item.codigo,
          timestampReserva: item.timestampReserva,
          numeros: [], linhas: []
        };
      }
      grupos[key].numeros.push(item.numero);
      grupos[key].linhas.push({ numero: item.numero, linha: item.linha });
      if (item.timestampReserva < grupos[key].timestampReserva) {
        grupos[key].timestampReserva = item.timestampReserva;
      }
    });

    // Retornar o grupo mais recente
    const vals = Object.values(grupos);
    return vals.sort((a, b) => b.timestampReserva - a.timestampReserva)[0];

  } catch (err) {
    console.error('❌ buscarPreReservaPorTelefone:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD MÍDIA — Evolution API v2.2.3
// ─────────────────────────────────────────────────────────────────────────────
function baixarMidiaEvolution(key, message, tipoMidia) {
  try {
    // Endpoint principal Evolution v2
    const url  = `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`;
    const body = { message: { key, message }, convertToMp4: false };

    const resp = UrlFetchApp.fetch(url, {
      method: 'POST', contentType: 'application/json',
      headers: { 'apikey': EVOLUTION_API_KEY },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code !== 200) {
      console.warn(`⚠️ Endpoint principal retornou ${code}, tentando alternativo...`);
      return baixarMidiaAlternativo(key, message);
    }

    const data     = JSON.parse(resp.getContentText());
    const base64   = data.base64 || (data.data && data.data.base64);
    const mimeType = data.mimetype || data.mediaType ||
                     (tipoMidia === 'documentMessage' ? 'application/pdf' : 'image/jpeg');

    if (!base64) {
      console.error('❌ base64 ausente na resposta:', JSON.stringify(data).substring(0, 200));
      return null;
    }

    return Utilities.newBlob(Utilities.base64Decode(base64), mimeType, 'comprovante_wa');

  } catch (err) {
    console.error('❌ baixarMidiaEvolution:', err.message);
    return null;
  }
}

function baixarMidiaAlternativo(key, message) {
  try {
    const url  = `${EVOLUTION_API_URL}/message/downloadMediaMessage/${EVOLUTION_INSTANCE}`;
    const resp = UrlFetchApp.fetch(url, {
      method: 'POST', contentType: 'application/json',
      headers: { 'apikey': EVOLUTION_API_KEY },
      payload: JSON.stringify({ message: { key, message } }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return null;

    const data   = JSON.parse(resp.getContentText());
    const base64 = data.base64 || data.data;
    if (!base64) return null;

    return Utilities.newBlob(
      Utilities.base64Decode(base64),
      data.mimetype || 'image/jpeg',
      'comprovante_wa'
    );
  } catch (err) {
    console.error('❌ baixarMidiaAlternativo:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function detectarTipoMidia(message) {
  if (message.imageMessage) return 'imageMessage';
  if (message.documentMessage) return 'documentMessage';
  if (message.documentWithCaptionMessage?.message?.documentMessage) return 'documentMessage';
  return null;
}

function normalizarTelefone(tel) {
  let t = tel.replace(/\D/g, '');
  if (t.startsWith('55') && t.length >= 12) t = t.slice(2);
  return t;
}

function enviarMensagemWH(telefone, texto) {
  try {
    let tel = telefone.replace(/\D/g, '');
    if (!tel.startsWith('55')) tel = '55' + tel;
    UrlFetchApp.fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST', contentType: 'application/json',
      headers: { 'apikey': EVOLUTION_API_KEY },
      payload: JSON.stringify({ number: tel, text: texto }),
      muteHttpExceptions: true
    });
  } catch (err) { console.error('❌ enviarMensagemWH:', err.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-DUPLICATA
// ─────────────────────────────────────────────────────────────────────────────
const WH_DONE_PREFIX  = 'WH_DONE_';
const WH_DONE_TTL_MS  = 6 * 60 * 60 * 1000;

function mensagemJaProcessada(messageId) {
  try {
    const val = PropertiesService.getScriptProperties().getProperty(WH_DONE_PREFIX + messageId);
    if (!val) return false;
    return (Date.now() - parseInt(val, 10)) < WH_DONE_TTL_MS;
  } catch (e) { return false; }
}

function marcarMensagemComoProcessada(messageId) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty(WH_DONE_PREFIX + messageId, Date.now().toString());
  } catch (e) { /* não crítico */ }
}
