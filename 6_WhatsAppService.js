/**
 * WHATSAPPSERVICE.GS
 *
 * Integração com serviços externos de mensagens:
 * - Envio de mensagens via WhatsApp
 * - Manutenção da conexão com APIs externas
 * - Tratamento de erros de comunicação
 * - Notificações automáticas de reserva expirada e comprovante inválido
 *
 * Gerencia toda a comunicação externa do sistema.
 */
function acordarApiEvolution() {
  try {
    console.log('🔄 [TRIGGER] Acordando API Evolution...');
    const url = `${EVOLUTION_API_URL}/instance/fetchInstances`;
    const options = {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY
      },
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 400) {
      throw new Error('NUMERO_NAO_RECONHECIDO');
    }
    const statusCode = response.getResponseCode();
    console.log(`📡 [TRIGGER] Status da API Evolution: ${statusCode} - ${new Date()}`);
    if (statusCode >= 200 && statusCode < 300) {
      console.log('✅ [TRIGGER] API Evolution acordada com sucesso!');
      return { success: true };
    } else {
      console.log('⚠️ [TRIGGER] API Evolution respondeu com status:', statusCode);
      return { success: true };
    }
  } catch (error) {
    console.log('⚠️ [TRIGGER] Erro ao acordar API:', error);
    return { success: true };
  }
}
function enviarWhatsApp(nome, telefone, codigo) {
    try {
        console.log('📱 Enviando WhatsApp para:', telefone);
        // Formatar telefone (adicionar 55 se não tiver)
        let telefoneFormatado = telefone.replace(/\D/g, '');
        if (!telefoneFormatado.startsWith('55')) {
            telefoneFormatado = '55' + telefoneFormatado;
        }
        const mensagem = `Olá ${nome}! 👋\n\nSeu código de verificação para a rifa é: *${codigo}*\n\nDigite este código no site para continuar sua compra.\n\n🎟️ Boa sorte!`;
        const payload = {
            number: telefoneFormatado,
            text: mensagem
        };
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            payload: JSON.stringify(payload)
        };
        const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
        const response = UrlFetchApp.fetch(url, options);
        const resultado = JSON.parse(response.getContentText());
        const codigoHttp = response.getResponseCode();
        // ✅ CORREÇÃO: Verificar se é código de sucesso (200-299)
        if (codigoHttp < 200 || codigoHttp >= 300) {
            let mensagemErro = 'Erro desconhecido';
            switch(codigoHttp) {
                case 502:
                    mensagemErro = 'Sistema de WhatsApp temporariamente indisponível';
                    break;
                case 500:
                    mensagemErro = 'Erro interno do servidor';
                    break;
                case 503:
                    mensagemErro = 'Serviço temporariamente indisponível';
                    break;
                case 404:
                    mensagemErro = 'Número de WhatsApp não reconhecido';
                    break;
                case 401:
                    mensagemErro = 'Erro de autenticação do sistema';
                    break;
                default:
                    mensagemErro = `Erro HTTP ${codigoHttp}`;
            }
            throw new Error(mensagemErro);
        }
        // Verificar se a API retornou erro específico
        if (resultado.error || (resultado.status && resultado.status === 'error')) {
            const mensagemErro = resultado.message || resultado.error || 'Erro ao enviar WhatsApp';
            throw new Error(mensagemErro);
        }
        console.log('✅ WhatsApp enviado com sucesso (HTTP ' + codigoHttp + '):', resultado);
        return { success: true, resultado: resultado };
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error);
        // Tratar erros específicos da API
        const mensagemErro = error.toString();
        if (mensagemErro.includes('404') || mensagemErro.includes('not found')) {
            return { success: false, error: 'Número de WhatsApp não reconhecido' };
        }
        if (mensagemErro.includes('502') || mensagemErro.includes('bad gateway')) {
            return { success: false, error: 'Sistema de WhatsApp temporariamente indisponível' };
        }
        if (mensagemErro.includes('500') || mensagemErro.includes('internal server')) {
            return { success: false, error: 'Erro interno do servidor' };
        }
        if (mensagemErro.includes('503') || mensagemErro.includes('service unavailable')) {
            return { success: false, error: 'Serviço temporariamente indisponível' };
        }
        if (mensagemErro.includes('401') || mensagemErro.includes('unauthorized')) {
            return { success: false, error: 'Erro de autenticação do sistema' };
        }
        if (mensagemErro.includes('timeout')) {
            return { success: false, error: 'Tempo esgotado ao enviar WhatsApp' };
        }
        return { success: false, error: mensagemErro };
    }
}
// =====================================================================
// ✅ NOVA FUNÇÃO: Notificar usuário quando reserva expirou (10 min)
// =====================================================================
function enviarWhatsAppReservaExpirada(nome, telefone, numeros) {
    try {
        console.log('📱 Enviando notificação de reserva expirada para:', telefone);
        let telefoneFormatado = telefone.replace(/\D/g, '');
        if (!telefoneFormatado.startsWith('55')) {
            telefoneFormatado = '55' + telefoneFormatado;
        }
        const numerosFormatados = numeros.map(n => String(n).padStart(3, '0')).join(', ');
        const mensagem = `Olá ${nome}! 😔\n\n` +
            `Infelizmente, o tempo de *10 minutos* para envio do comprovante de pagamento expirou.\n\n` +
            `Os seguintes números foram liberados:\n` +
            `🎟️ *${numerosFormatados}*\n\n` +
            `Mas não se preocupe! Você pode acessar o site e tentar realizar a compra novamente. 💪\n\n` +
            `Acesse: [LINK DO SITE]\n\n` +
            `Qualquer dúvida, estamos à disposição! 🙏`;
        const payload = {
            number: telefoneFormatado,
            text: mensagem
        };
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };
        const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
        const response = UrlFetchApp.fetch(url, options);
        const codigoHttp = response.getResponseCode();
        if (codigoHttp >= 200 && codigoHttp < 300) {
            console.log('✅ Notificação de reserva expirada enviada com sucesso para:', telefone);
            return { success: true };
        } else {
            console.log('⚠️ Erro ao enviar notificação de expiração (HTTP ' + codigoHttp + ')');
            return { success: false, error: 'HTTP ' + codigoHttp };
        }
    } catch (error) {
        console.error('❌ Erro ao enviar notificação de reserva expirada:', error);
        return { success: false, error: error.toString() };
    }
}
// =====================================================================
// ✅ NOVA FUNÇÃO: Notificar usuário quando comprovante inválido 3x
// =====================================================================
// =====================================================================
// ✅ Enviar código PIX via WhatsApp (disparado após pré-reserva)
// =====================================================================
function enviarCodigoPIXWhatsApp(nome, telefone, pixString, numeros, valor, codigo) {
    try {
        console.log('📱 Enviando código PIX via WhatsApp para:', telefone);
        let tel = telefone.replace(/\D/g, '');
        if (!tel.startsWith('55')) tel = '55' + tel;

        const numerosFormatados = numeros.map(n => String(n).padStart(3, '0')).join(', ');
        const valorFormatado    = parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const mensagem =
            `🎟️ *Olá ${nome}!*\n\n` +
            `Sua pré-reserva foi confirmada!\n\n` +
            `📋 *Números:* ${numerosFormatados}\n` +
            `💰 *Valor:* ${valorFormatado}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📲 *SEU CÓDIGO PIX (Copia e Cola):*\n\n` +
            `\`${pixString}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Como pagar:*\n` +
            `1️⃣ Copie o código PIX acima\n` +
            `2️⃣ Abra o APP do seu banco → PIX → Copia e Cola\n` +
            `3️⃣ Cole o código e confirme o pagamento\n` +
            `4️⃣ Após pagar, *envie o comprovante aqui nessa conversa* 📸\n\n` +
            `⏰ Você tem *10 minutos* para concluir o pagamento.\n\n` +
            `_Código da reserva: ${codigo}_`;

        const response = UrlFetchApp.fetch(
            `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
                payload: JSON.stringify({ number: tel, text: mensagem }),
                muteHttpExceptions: true
            }
        );

        const code = response.getResponseCode();
        if (code >= 200 && code < 300) {
            console.log('✅ Código PIX enviado via WhatsApp para:', telefone);
            return { success: true };
        } else {
            console.warn('⚠️ Erro ao enviar PIX WA (HTTP ' + code + ')');
            return { success: false, error: 'HTTP ' + code };
        }
    } catch (err) {
        console.error('❌ Erro enviarCodigoPIXWhatsApp:', err.message);
        return { success: false, error: err.message };
    }
}

function enviarWhatsAppComprovanteInvalido(nome, telefone, numeros) {
    try {
        console.log('📱 Enviando notificação de comprovante inválido para:', telefone);
        let telefoneFormatado = telefone.replace(/\D/g, '');
        if (!telefoneFormatado.startsWith('55')) {
            telefoneFormatado = '55' + telefoneFormatado;
        }
        const numerosFormatados = numeros.map(n => String(n).padStart(3, '0')).join(', ');
        const mensagem = `Olá ${nome}! ⚠️\n\n` +
            `Infelizmente, o comprovante de pagamento enviado *não foi considerado válido* após 3 tentativas.\n\n` +
            `Os seguintes números foram liberados:\n` +
            `🎟️ *${numerosFormatados}*\n\n` +
            `Possíveis motivos:\n` +
            `• Comprovante ilegível ou cortado\n` +
            `• Comprovante de outra transação\n` +
            `• Valor ou dados não correspondem\n\n` +
            `Você pode tentar realizar a compra novamente com um comprovante válido. 💪\n\n` +
            `Acesse: [LINK DO SITE]\n\n` +
            `Qualquer dúvida, entre em contato! 🙏`;
        const payload = {
            number: telefoneFormatado,
            text: mensagem
        };
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };
        const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
        const response = UrlFetchApp.fetch(url, options);
        const codigoHttp = response.getResponseCode();
        if (codigoHttp >= 200 && codigoHttp < 300) {
            console.log('✅ Notificação de comprovante inválido enviada com sucesso para:', telefone);
            return { success: true };
        } else {
            console.log('⚠️ Erro ao enviar notificação de comprovante inválido (HTTP ' + codigoHttp + ')');
            return { success: false, error: 'HTTP ' + codigoHttp };
        }
    } catch (error) {
        console.error('❌ Erro ao enviar notificação de comprovante inválido:', error);
        return { success: false, error: error.toString() };
    }
}