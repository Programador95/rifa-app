/**
 * WHATSAPPSERVICE.GS
 * 
 * Integração com serviços externos de mensagens:
 * - Envio de mensagens via WhatsApp
 * - Manutenção da conexão com APIs externas
 * - Tratamento de erros de comunicação
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

