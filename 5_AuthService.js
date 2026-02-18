/**
 * AUTHSERVICE.GS
 * 
 * Gerencia autenticação e segurança:
 * - Geração e verificação de códigos
 * - Validação de usuários
 * - Controle de acesso
 * - Funções de depuração de segurança
 * 
 * Garante a integridade das operações sensíveis.
 */

function gerarCodigoVerificacao() {
  let codigo = '';
  for (let i = 0; i < 6; i++) {
    codigo += Math.floor(Math.random() * 10).toString();
  }
  return codigo;
}

// ✅ FUNÇÃO CORRIGIDA - Buscar código de verificação
function buscarCodigoVerificacao(userId) {
    try {
        console.log('🔍 Buscando código para userId:', userId);
        
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('Rifa');
        
        if (!sheet) {
            console.error('❌ Aba "Rifa" não encontrada');
            return null;
        }
        
        const lastRow = sheet.getLastRow();
        console.log('📊 Última linha da planilha:', lastRow);
        
        if (lastRow < 2) {
            console.log('⚠️ Nenhum dado na planilha');
            return null;
        }
        
        // Obter dados das colunas G (userId) e H (código)
        const dados = sheet.getRange('G2:H' + lastRow).getValues();
        console.log('📋 Total de linhas para verificar:', dados.length);
        
        // Normalizar o userId de entrada
        const userIdNormalizado = userId ? userId.toString().trim() : '';
        console.log('👤 UserId normalizado:', userIdNormalizado);
        
        // Buscar pelo userId
        for (let i = 0; i < dados.length; i++) {
            const userIdPlanilha = dados[i][0] ? dados[i][0].toString().trim() : '';
            const codigoVerificacao = dados[i][1] ? dados[i][1].toString().trim() : '';
            
            console.log(`📝 Linha ${i + 2}: UserID="${userIdPlanilha}", Código="${codigoVerificacao}"`);
            
            // Comparar userIds normalizados
            if (userIdPlanilha === userIdNormalizado && codigoVerificacao) {
                console.log('✅ Código encontrado:', codigoVerificacao);
                return codigoVerificacao;
            }
        }
        
        console.log('❌ Código não encontrado para o userId:', userIdNormalizado);
        return null;
        
    } catch (error) {
        console.error('❌ Erro ao buscar código de verificação:', error);
        console.error('❌ Stack trace:', error.stack);
        return null;
    }
}

function validarDadosEEnviarCodigo(dados) {
    try {
        console.log('🔄 Validando dados:', dados);

        const { nome, telefone } = dados;

        // Validações básicas com mensagens mais claras
        if (!nome || nome.trim().length < 3) {
            throw new Error('Nome deve ter pelo menos 3 caracteres');
        }

        const numeroLimpo = telefone.replace(/\D/g, '');
        if (!telefone || numeroLimpo.length < 10) {
            throw new Error('Telefone deve ter pelo menos 10 dígitos');
        }

        // Validação adicional para números brasileiros
        if (numeroLimpo.length > 13 || numeroLimpo.length < 10) {
            throw new Error('Formato de telefone inválido');
        }

        // Gerar código de verificação
        const codigo = gerarCodigoVerificacao();
        console.log('🔑 Código gerado:', codigo);

        // Enviar WhatsApp
        const resultadoWhatsApp = enviarWhatsApp(nome, telefone, codigo);

        if (!resultadoWhatsApp.success) {
            // Lançar erro específico baseado no tipo de problema
            const erro = resultadoWhatsApp.error || 'Erro desconhecido';
            
            if (erro.includes('não reconhecido') || erro.includes('404')) {
                throw new Error('Número de WhatsApp não reconhecido');
            }
            
            if (erro.includes('timeout') || erro.includes('tempo')) {
                throw new Error('Tempo esgotado ao enviar WhatsApp');
            }
            
            throw new Error(erro);
        }

        return {
            success: true,
            codigo: codigo,
            message: 'Código enviado via WhatsApp com sucesso!'
        };

    } catch (error) {
        console.error('❌ Erro em validarDadosEEnviarCodigo:', error);
        return {
            success: false,
            error: error.message || error.toString()
        };
    }
}

function verificarCodigoVerificacao(codigoDigitado, codigoCorreto) {
    try {
        console.log('🔍 Verificando código:', codigoDigitado, 'vs', codigoCorreto);

        if (!codigoDigitado || !codigoCorreto) {
            return { success: false, message: 'Código inválido' };
        }

        const codigoLimpo = codigoDigitado.toString().toUpperCase().trim();
        const codigoCorretoLimpo = codigoCorreto.toString().toUpperCase().trim();

        if (codigoLimpo === codigoCorretoLimpo) {
            console.log('✅ Código verificado com sucesso');
            return { success: true, message: 'Código verificado com sucesso!' };
        } else {
            console.log('❌ Código incorreto');
            return { success: false, message: 'Código incorreto. Tente novamente.' };
        }

    } catch (error) {
        console.error('❌ Erro na verificação do código:', error);
        return { success: false, message: 'Erro na verificação do código' };
    }
}

function verificarSegurancaReserva(numeros, userId) {
  try {
    console.log('🔒 Iniciando verificação de segurança');
    console.log('👤 UserID:', userId);
    console.log('🔢 Números:', numeros);
    
    // Validar parâmetros de entrada
    if (!numeros || !Array.isArray(numeros) || numeros.length === 0) {
      return {
        sucesso: false,
        motivo: 'Lista de números inválida',
        codigo: 'PARAMETROS_INVALIDOS'
      };
    }
    
    if (!userId || userId.toString().trim() === '') {
      return {
        sucesso: false,
        motivo: 'ID do usuário não fornecido',
        codigo: 'USER_ID_INVALIDO'
      };
    }
    
    // Tentar acessar a planilha
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    if (!sheet) {
      console.error('❌ Aba "Rifa" não encontrada');
      return {
        sucesso: false,
        motivo: 'Planilha não encontrada',
        codigo: 'PLANILHA_NAO_ENCONTRADA'
      };
    }
    
    // Obter dados da planilha com verificação de erro
    let dados;
    try {
      dados = sheet.getDataRange().getValues();
    } catch (sheetError) {
      console.error('❌ Erro ao acessar dados da planilha:', sheetError);
      return {
        sucesso: false,
        motivo: 'Erro ao acessar dados da planilha: ' + sheetError.message,
        codigo: 'ERRO_ACESSO_PLANILHA'
      };
    }
    
    if (dados.length < 2) {
      return {
        sucesso: false,
        motivo: 'Nenhum número cadastrado na rifa',
        codigo: 'SEM_DADOS'
      };
    }
    
    // Verificar cada número
    const resultados = [];
    const erros = [];
    
    for (let numero of numeros) {
      const resultado = verificarNumeroIndividual(numero, userId, dados);
      
      if (resultado.sucesso) {
        resultados.push(resultado);
      } else {
        erros.push(resultado);
      }
    }
    
    // Se há erros, retornar o primeiro erro encontrado
    if (erros.length > 0) {
      const primeiroErro = erros[0];
      console.log('❌ Verificação falhou:', primeiroErro);
      return primeiroErro;
    }
    
    console.log('✅ Verificação de segurança concluída com sucesso');
    return {
      sucesso: true,
      numerosVerificados: resultados.length,
      detalhes: resultados
    };
    
  } catch (error) {
    console.error('❌ Erro crítico na verificação de segurança:', error);
    console.error('❌ Stack trace:', error.stack);
    
    return {
      sucesso: false,
      motivo: 'Erro crítico no sistema de verificação',
      codigo: 'ERRO_CRITICO',
      detalhes: {
        erro: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// ✅ FUNÇÃO AUXILIAR: Verificar número individual
function verificarNumeroIndividual(numero, userId, dados) {
  try {
    const numeroStr = numero.toString().trim().padStart(3, '0');
    const userIdStr = userId.toString().trim();
    
    console.log(`🔍 Verificando número: ${numeroStr} para usuário: ${userIdStr}`);
    
    // Procurar o número na planilha
    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      const numeroLinha = linha[0] ? linha[0].toString().trim().padStart(3, '0') : '';
      
      if (numeroLinha === numeroStr) {
        const statusLinha = linha[3] ? linha[3].toString().trim() : '';
        const userIdLinha = linha[6] ? linha[6].toString().trim() : '';
        const nomeLinha = linha[1] ? linha[1].toString().trim() : '';
        
        console.log(`📋 Número ${numeroStr} encontrado na linha ${i + 1}:`);
        console.log(`   Status: "${statusLinha}"`);
        console.log(`   UserID: "${userIdLinha}"`);
        console.log(`   Nome: "${nomeLinha}"`);
        
        // Verificar status
        if (statusLinha.toLowerCase() !== 'pré-reservado') {
          return {
            sucesso: false,
            motivo: `Número ${numeroStr} não está pré-reservado (status: ${statusLinha})`,
            codigo: 'STATUS_INVALIDO',
            detalhes: {
              numero: numeroStr,
              statusAtual: statusLinha,
              statusEsperado: 'Pré-reservado'
            }
          };
        }
        
        // Verificar propriedade do usuário
        if (userIdLinha !== userIdStr) {
          return {
            sucesso: false,
            motivo: `Número ${numeroStr} pertence a outro usuário`,
            codigo: 'USUARIO_DIFERENTE',
            detalhes: {
              numero: numeroStr,
              userIdPlanilha: userIdLinha,
              userIdSolicitante: userIdStr
            }
          };
        }
        
        // Tudo OK
        return {
          sucesso: true,
          numero: numeroStr,
          linha: i + 1,
          status: statusLinha,
          userId: userIdLinha,
          nome: nomeLinha
        };
      }
    }
    
    // Número não encontrado
    return {
      sucesso: false,
      motivo: `Número ${numeroStr} não foi encontrado na planilha`,
      codigo: 'NUMERO_NAO_ENCONTRADO',
      detalhes: {
        numero: numeroStr
      }
    };
    
  } catch (error) {
    console.error(`❌ Erro ao verificar número ${numero}:`, error);
    return {
      sucesso: false,
      motivo: `Erro ao verificar número ${numero}: ${error.message}`,
      codigo: 'ERRO_VERIFICACAO_NUMERO',
      detalhes: {
        numero: numero,
        erro: error.message
      }
    };
  }
}

function debugUserId(userId) {
    try {
        console.log('🐛 DEBUG - Verificando userId:', userId);
        console.log('🐛 Tipo:', typeof userId);
        console.log('🐛 Comprimento:', userId ? userId.length : 'null/undefined');
        
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('Rifa');
        const lastRow = sheet.getLastRow();
        
        if (lastRow >= 2) {
            const dados = sheet.getRange('G2:G' + lastRow).getValues();
            console.log('🐛 Todos os userIds na planilha:');
            
            dados.forEach((row, index) => {
                const userIdPlanilha = row[0] ? row[0].toString() : 'vazio';
                console.log(`   Linha ${index + 2}: "${userIdPlanilha}"`);
            });
        }
        
        return buscarCodigoVerificacao(userId);
        
    } catch (error) {
        console.error('🐛 Erro no debug:', error);
        return null;
    }
}