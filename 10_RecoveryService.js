/**
 * 10_RecoveryService.js - Serviço de recuperação de reservas pendentes
 *
 * Funções:
 * - buscarPendente: Buscar pendentes por código WhatsApp
 * - processarRecuperacao: Pré-reservar números originais
 * - processarRecuperacaoComCredito: Pré-reservar novos números
 * - marcarPendenteComoRecuperado: Atualizar status após sucesso
 * - limparPendentesExpirados: Limpeza automática
 */
//var VALOR_POR_NUMERO = 5.00; // Sincronizar com PRECO no frontend
/**
 * Buscar reserva pendente pelo código WhatsApp
 * @param {Object} dados - { telefone: string, codigo: string }
 * @returns {Object} - { encontrado, dados, numerosDisponiveis, numerosOcupados, todosDisponiveis, credito }
 */
function buscarPendente(dados) {
  try {
    console.log('🔍 Buscando pendente:', dados);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var codigoBusca = dados.codigo.toString().trim();

    // ===== VERIFICAÇÃO DIRETA NA ABA RIFA (fonte de verdade) =====
    // Checa a coluna I (Código) para saber o estado real do código buscado
    var rifaSheet = ss.getSheetByName('Rifa');
    if (rifaSheet && rifaSheet.getLastRow() >= 2) {
      var rifaCheck = rifaSheet.getRange('A2:I' + rifaSheet.getLastRow()).getValues();
      var statusesCodigo = {};
      for (var r = 0; r < rifaCheck.length; r++) {
        var codRifa = rifaCheck[r][8] ? rifaCheck[r][8].toString().trim() : '';
        var stRifa  = rifaCheck[r][3] ? rifaCheck[r][3].toString().trim() : '';
        if (codRifa === codigoBusca && stRifa) {
          statusesCodigo[stRifa] = (statusesCodigo[stRifa] || 0) + 1;
        }
      }
      if (statusesCodigo['Reservado']) {
        return { encontrado: false, motivo: 'Este código já foi utilizado em uma reserva confirmada anteriormente.' };
      }
      if (statusesCodigo['Pré-reservado']) {
        return { encontrado: false, motivo: 'Este código está sendo utilizado em outra sessão no momento. Tente novamente em alguns minutos.' };
      }
    }

    var sheet = ss.getSheetByName('Pendentes');
    if (!sheet) {
      return { encontrado: false, motivo: 'Nenhum registro pendente encontrado.' };
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { encontrado: false, motivo: 'Nenhum registro pendente encontrado.' };
    }
    var telefoneBusca = dados.telefone ? dados.telefone.replace(/\D/g, '') : '';
    var registros = sheet.getRange('A2:K' + lastRow).getValues();
    // ===== BUSCA PRIMÁRIA: código + status Pendente — usa a linha mais antiga =====
    var registroEncontrado = null;
    var linhaEncontrada = -1;
    // Primeira passada: código + telefone correspondente (linha mais antiga = primeira ocorrência)
    for (var i = 0; i < registros.length; i++) {
      var registro = registros[i];
      var codigoRegistro = registro[0] ? registro[0].toString().trim() : '';
      var statusRegistro = registro[7] ? registro[7].toString().trim() : '';
      if (codigoRegistro === codigoBusca && (statusRegistro === 'Pendente' || statusRegistro === 'Pré-recuperação')) {
        var telefoneRegistro = registro[2] ? registro[2].toString().replace(/\D/g, '') : '';
        if (telefoneBusca && telefoneRegistro && telefoneRegistro !== telefoneBusca) {
          continue; // Telefone diferente, continuar buscando
        }
        // Pega a primeira ocorrência (linha mais antiga na planilha) e para
        registroEncontrado = registro;
        linhaEncontrada = i;
        break;
      }
    }
    // Segunda passada: só código (sem verificar telefone) — também pega a mais antiga
    if (!registroEncontrado) {
      for (var i = 0; i < registros.length; i++) {
        var registro = registros[i];
        var codigoRegistro = registro[0] ? registro[0].toString().trim() : '';
        var statusRegistro = registro[7] ? registro[7].toString().trim() : '';
        if (codigoRegistro === codigoBusca && (statusRegistro === 'Pendente' || statusRegistro === 'Pré-recuperação')) {
          // Pega a primeira ocorrência (linha mais antiga na planilha) e para
          registroEncontrado = registro;
          linhaEncontrada = i;
          break;
        }
      }
    }
    if (registroEncontrado) {
      var registro = registroEncontrado;
      var numerosStr = registro[3] ? registro[3].toString() : '';
      var numeros = numerosStr.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; });
      var valor = parseFloat(registro[4]);
      var valorFinal = (isNaN(valor) || valor <= 0) ? numeros.length * VALOR_POR_NUMERO : valor;
      var timestampReserva = registro[5] ? new Date(registro[5]).toISOString() : new Date().toISOString();
      // Verificar disponibilidade na aba Rifa
      var rifaSheet = ss.getSheetByName('Rifa');
      var rifaLastRow = rifaSheet.getLastRow();
      var rifaDados = rifaLastRow >= 2 ? rifaSheet.getRange('A2:D' + rifaLastRow).getValues() : [];
      var numerosDisponiveis = [];
      var numerosOcupados = [];
      numeros.forEach(function(num) {
        var numStr = num.toString().padStart(3, '0');
        var encontradoNaRifa = false;
        for (var j = 0; j < rifaDados.length; j++) {
          var numRifa = rifaDados[j][0].toString().trim().padStart(3, '0');
          if (numRifa === numStr) {
            encontradoNaRifa = true;
            if (rifaDados[j][3] === 'Disponível') {
              numerosDisponiveis.push(numStr);
            } else {
              numerosOcupados.push(numStr);
            }
            break;
          }
        }
        if (!encontradoNaRifa) numerosOcupados.push(numStr);
      });
      var credito = numerosOcupados.length * VALOR_POR_NUMERO;
      return {
        encontrado: true,
        dados: {
          codigo: codigoBusca,
          nome: registro[1] ? registro[1].toString() : '',
          telefone: registro[2] ? registro[2].toString() : '',
          numeros: numeros,
          valor: valorFinal,
          timestampReserva: timestampReserva,
          motivo: registro[6] ? registro[6].toString() : '',
          linhaPendente: linhaEncontrada + 2
        },
        numerosDisponiveis: numerosDisponiveis,
        numerosOcupados: numerosOcupados,
        todosDisponiveis: numerosOcupados.length === 0,
        credito: credito
      };
    }
    // Verificar se já foi recuperado ou expirado
    for (var i = 0; i < registros.length; i++) {
      var codigoRegistro = registros[i][0] ? registros[i][0].toString().trim() : '';
      var statusRegistro = registros[i][7] ? registros[i][7].toString().trim() : '';
      if (codigoRegistro === codigoBusca) {
        if (statusRegistro === 'Recuperado') {
          return { encontrado: false, motivo: 'Esta reserva já foi recuperada anteriormente.' };
        }
        if (statusRegistro === 'Expirado') {
          return { encontrado: false, motivo: 'Esta reserva expirou (mais de 7 dias). Entre em contato com o administrador.' };
        }
      }
    }
    return { encontrado: false, motivo: 'Nenhum registro encontrado com este código. Verifique se o código está correto.' };
  } catch (error) {
    console.error('❌ Erro ao buscar pendente:', error);
    return { encontrado: false, motivo: 'Erro interno ao buscar: ' + error.message };
  }
}
/**
 * Processar recuperação: pré-reservar números originais
 * @param {Object} dados - { codigo, nome, telefone, numeros, userId, linhaPendente, timestampReserva }
 * @returns {Object} - resultado da pré-reserva
 */
/**
 * Verifica se um código já está em uso ativo (Pré-reservado ou Reservado) na aba Rifa.
 * Usado para bloquear sessões duplicadas no momento da pré-reserva.
 * @param {Sheet} rifaSheet - aba Rifa já obtida
 * @param {string} codigo - código a verificar
 * @returns {string|null} - status encontrado ('Pré-reservado' | 'Reservado') ou null se livre
 */
function verificarCodigoEmUsoNaRifa(rifaSheet, codigo) {
  var lastRow = rifaSheet.getLastRow();
  if (lastRow < 2) return null;
  var dados = rifaSheet.getRange('A2:I' + lastRow).getValues();
  var codigoStr = codigo.toString().trim();
  for (var i = 0; i < dados.length; i++) {
    var codLinha = dados[i][8] ? dados[i][8].toString().trim() : '';
    var stLinha  = dados[i][3] ? dados[i][3].toString().trim() : '';
    if (codLinha === codigoStr) {
      if (stLinha === 'Reservado')    return 'Reservado';
      if (stLinha === 'Pré-reservado') return 'Pré-reservado';
    }
  }
  return null;
}

function processarRecuperacao(dados) {
  try {
    console.log('🔄 Processando recuperação:', dados);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rifaSheet = ss.getSheetByName('Rifa');
    var pendentesSheet = ss.getSheetByName('Pendentes');
    if (!rifaSheet || !pendentesSheet) {
      throw new Error('Abas necessárias não encontradas');
    }
    // ===== TRAVA ANTI-DUPLICIDADE: verificar na Rifa antes de pré-reservar =====
    var statusEmUso = verificarCodigoEmUsoNaRifa(rifaSheet, dados.codigo);
    if (statusEmUso === 'Reservado') {
      return { success: false, motivo: 'Este código já foi utilizado em uma reserva confirmada.' };
    }
    if (statusEmUso === 'Pré-reservado') {
      return { success: false, motivo: 'Este código já está sendo processado em outra sessão. Aguarde alguns minutos e tente novamente.' };
    }
    var lastRow = rifaSheet.getLastRow();
    var rifaDados = rifaSheet.getRange('A2:I' + lastRow).getValues();
    var numerosParaReservar = [];
    var conflitos = [];
    dados.numeros.forEach(function(num) {
      var numStr = num.toString().padStart(3, '0');
      for (var i = 0; i < rifaDados.length; i++) {
        var numRifa = rifaDados[i][0].toString().trim().padStart(3, '0');
        if (numRifa === numStr) {
          if (rifaDados[i][3] === 'Disponível') {
            numerosParaReservar.push({ numero: numStr, linha: i + 2 });
          } else {
            conflitos.push(numStr);
          }
          break;
        }
      }
    });
    if (numerosParaReservar.length === 0) {
      return {
        success: false,
        motivo: 'Nenhum dos números originais está disponível.',
        conflitos: conflitos,
        credito: conflitos.length * VALOR_POR_NUMERO
      };
    }
    var codigoRecuperacao = dados.codigo;
    // ✅ CORREÇÃO: usar new Date() no lugar do timestamp original da reserva.
    // O trigger limparDadosPreReservasExpiradas usa coluna G para calcular expiração (> 10 min).
    // Gravar o timestamp ORIGINAL causava limpeza imediata pois a reserva era > 10 min atrás.
    // O timestamp original continua sendo enviado via recoveryTimestamp no salvarComprovante.
    var agora = new Date();
    // Pré-reservar números na aba Rifa
    numerosParaReservar.forEach(function(item) {
      rifaSheet.getRange(item.linha, 2).setValue(dados.nome);       // B - Nome
      rifaSheet.getRange(item.linha, 3).setValue(dados.telefone);   // C - Telefone
      rifaSheet.getRange(item.linha, 4).setValue('Pré-reservado');  // D - Status
      rifaSheet.getRange(item.linha, 7).setValue(agora);            // G - Timestamp ATUAL (não original)
      rifaSheet.getRange(item.linha, 8).setValue(dados.userId);     // H - User ID
      rifaSheet.getRange(item.linha, 9).setValue(codigoRecuperacao);// I - Código
    });
    // Atualizar aba Pendentes: status -> Pré-recuperação
    if (dados.linhaPendente) {
      pendentesSheet.getRange(dados.linhaPendente, 8).setValue('Pré-recuperação');
    }
    SpreadsheetApp.flush();
    console.log('✅ Recuperação: ' + numerosParaReservar.length + ' números pré-reservados');
    return {
      success: true,
      numerosReservados: numerosParaReservar.map(function(n) { return n.numero; }),
      conflitos: conflitos,
      credito: conflitos.length * VALOR_POR_NUMERO,
      codigo: codigoRecuperacao,
      valorTotal: numerosParaReservar.length * VALOR_POR_NUMERO
    };
  } catch (error) {
    console.error('❌ Erro na recuperação:', error);
    throw error;
  }
}
/**
 * Processar recuperação com novos números (números originais ocupados)
 * @param {Object} dados - { codigo, nome, telefone, novosNumeros, userId, linhaPendente, credito, timestampReserva }
 * @returns {Object}
 */
function processarRecuperacaoComCredito(dados) {
  try {
    console.log('💰 Processando recuperação com novos números:', dados);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rifaSheet = ss.getSheetByName('Rifa');
    var pendentesSheet = ss.getSheetByName('Pendentes');
    if (!rifaSheet) throw new Error('Aba "Rifa" não encontrada');
    // ===== TRAVA ANTI-DUPLICIDADE: verificar na Rifa antes de pré-reservar =====
    var statusEmUso = verificarCodigoEmUsoNaRifa(rifaSheet, dados.codigo);
    if (statusEmUso === 'Reservado') {
      throw new Error('Este código já foi utilizado em uma reserva confirmada.');
    }
    if (statusEmUso === 'Pré-reservado') {
      throw new Error('Este código já está sendo processado em outra sessão. Aguarde alguns minutos e tente novamente.');
    }
    // Validar valor
    var valorNovosNumeros = dados.novosNumeros.length * VALOR_POR_NUMERO;
    if (valorNovosNumeros > dados.credito + 0.01) {
      throw new Error('Valor dos números selecionados (R$ ' + valorNovosNumeros.toFixed(2) + ') excede o crédito disponível (R$ ' + dados.credito.toFixed(2) + ')');
    }
    // Verificar disponibilidade
    var lastRow = rifaSheet.getLastRow();
    var rifaDados = rifaSheet.getRange('A2:D' + lastRow).getValues();
    var numerosParaReservar = [];
    var conflitos = [];
    dados.novosNumeros.forEach(function(num) {
      var numStr = num.toString().padStart(3, '0');
      for (var i = 0; i < rifaDados.length; i++) {
        var numRifa = rifaDados[i][0].toString().trim().padStart(3, '0');
        if (numRifa === numStr) {
          if (rifaDados[i][3] === 'Disponível') {
            numerosParaReservar.push({ numero: numStr, linha: i + 2 });
          } else {
            conflitos.push(numStr);
          }
          break;
        }
      }
    });
    if (conflitos.length > 0) {
      throw new Error('Números não disponíveis: ' + conflitos.join(', '));
    }
    // ✅ CORREÇÃO: usar new Date() no lugar do timestamp original.
    // Ver comentário em processarRecuperacao para explicação completa.
    var agora = new Date();
    // Pré-reservar novos números
    numerosParaReservar.forEach(function(item) {
      rifaSheet.getRange(item.linha, 2).setValue(dados.nome);       // B - Nome
      rifaSheet.getRange(item.linha, 3).setValue(dados.telefone);   // C - Telefone
      rifaSheet.getRange(item.linha, 4).setValue('Pré-reservado');  // D - Status
      rifaSheet.getRange(item.linha, 7).setValue(agora);            // G - Timestamp ATUAL (não original)
      rifaSheet.getRange(item.linha, 8).setValue(dados.userId);     // H - User ID
      rifaSheet.getRange(item.linha, 9).setValue(dados.codigo);     // I - Código
    });
    // Atualizar status na aba Pendentes para Pré-recuperação (sem sobrescrever números originais na col D)
    if (pendentesSheet && dados.linhaPendente) {
      pendentesSheet.getRange(dados.linhaPendente, 8).setValue('Pré-recuperação'); // H - Status
    }
    SpreadsheetApp.flush();
    console.log('✅ Recuperação com novos números: ' + numerosParaReservar.length + ' pré-reservados');
    return {
      success: true,
      numerosReservados: numerosParaReservar.map(function(n) { return n.numero; }),
      codigo: dados.codigo,
      valorTotal: numerosParaReservar.length * VALOR_POR_NUMERO
    };
  } catch (error) {
    console.error('❌ Erro na recuperação com novos números:', error);
    throw error;
  }
}
/**
 * Marcar pendente como recuperado após comprovante validado
 * @param {Object} dados - { codigo, linhaPendente }
 */
function marcarPendenteComoRecuperado(dados) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Pendentes');
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    function atualizarLinha(row) {
      sheet.getRange(row, 8).setValue('Recuperado');    // H - Status
      sheet.getRange(row, 11).setValue(new Date());     // K - Data Recuperação
      console.log('✅ Pendente linha ' + row + ' marcado como Recuperado');
    }
    // Marcar TODAS as linhas com aquele código (evita re-uso por duplicatas legadas)
    var registros = sheet.getRange('A2:H' + lastRow).getValues();
    var codigoBusca = dados.codigo ? dados.codigo.toString().trim() : '';
    var marcou = false;
    for (var i = 0; i < registros.length; i++) {
      var codReg = registros[i][0] ? registros[i][0].toString().trim() : '';
      var statusReg = registros[i][7] ? registros[i][7].toString().trim() : '';
      if (codReg === codigoBusca &&
          (statusReg === 'Pendente' || statusReg === 'Pré-recuperação')) {
        atualizarLinha(i + 2);
        marcou = true;
        // SEM break — marca todas as linhas duplicadas do mesmo código
      }
    }
    // Edge case: linhaPendente explícita e não achou por código
    if (!marcou && dados.linhaPendente) {
      atualizarLinha(dados.linhaPendente);
    }
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('❌ Erro ao marcar pendente como recuperado:', error);
  }
}
/**
 * Limpar pendentes expirados (mais de 7 dias)
 */
function limparPendentesExpirados() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Pendentes');
    if (!sheet) return { success: true, message: 'Aba Pendentes não existe' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, message: 'Nenhum pendente' };
    var agora = new Date();
    var seteDias = 7 * 24 * 60 * 60 * 1000;
    var registros = sheet.getRange('A2:J' + lastRow).getValues();
    var expirados = 0;
    for (var i = 0; i < registros.length; i++) {
      var status = registros[i][7] ? registros[i][7].toString() : '';
      var dataRegistro = registros[i][9];
      if ((status === 'Pendente' || status === 'Pré-recuperação') && dataRegistro) {
        var dataObj = dataRegistro instanceof Date ? dataRegistro : new Date(dataRegistro);
        var tempoDecorrido = agora - dataObj;
        if (tempoDecorrido > seteDias) {
          var row = i + 2;
          sheet.getRange(row, 8).setValue('Expirado');
          // Se era Pré-recuperação, liberar números na aba Rifa
          if (status === 'Pré-recuperação') {
            liberarNumerosPreRecuperados(registros[i]);
          }
          expirados++;
          console.log('⏰ Pendente linha ' + row + ' expirado');
        }
      }
    }
    return { success: true, expirados: expirados };
  } catch (error) {
    console.error('❌ Erro ao limpar pendentes expirados:', error);
    return { success: false, error: error.message };
  }
}
/**
 * Auxiliar: Liberar números pré-reservados quando pendente expira
 */
function liberarNumerosPreRecuperados(registroPendente) {
  try {
    var numerosStr = registroPendente[3] ? registroPendente[3].toString() : '';
    var numeros = numerosStr.split(',').map(function(n) { return n.trim(); }).filter(function(n) { return n.length > 0; });
    if (numeros.length === 0) return;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rifaSheet = ss.getSheetByName('Rifa');
    if (!rifaSheet) return;
    var lastRow = rifaSheet.getLastRow();
    var rifaDados = rifaSheet.getRange('A2:D' + lastRow).getValues();
    numeros.forEach(function(num) {
      var numStr = num.toString().padStart(3, '0');
      for (var j = 0; j < rifaDados.length; j++) {
        var numRifa = rifaDados[j][0].toString().trim().padStart(3, '0');
        if (numRifa === numStr && rifaDados[j][3] === 'Pré-reservado') {
          var row = j + 2;
          rifaSheet.getRange(row, 2).setValue(''); // Limpar nome
          rifaSheet.getRange(row, 3).setValue(''); // Limpar telefone
          rifaSheet.getRange(row, 4).setValue('Disponível'); // Liberar
          rifaSheet.getRange(row, 7).setValue(''); // Limpar timestamp
          rifaSheet.getRange(row, 8).setValue(''); // Limpar userId
          rifaSheet.getRange(row, 9).setValue(''); // Limpar código
          break;
        }
      }
    });
    SpreadsheetApp.flush();
    console.log('🔓 Números pré-recuperados liberados:', numeros.join(', '));
  } catch (error) {
    console.error('❌ Erro ao liberar números pré-recuperados:', error);
  }
}
/**
 * Reverter status Pré-recuperação → Pendente quando o usuário cancela o pagamento
 * Garante que a reserva continue localizável em novas tentativas de recuperação
 * @param {Object} dados - { codigo, linhaPendente }
 */
function reverterPreRecuperacaoParaPendente(dados) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Pendentes');
    if (!sheet) return;
    function reverterLinha(row) {
      var statusAtual = sheet.getRange(row, 8).getValue();
      if (statusAtual === 'Pré-recuperação') {
        sheet.getRange(row, 8).setValue('Pendente');
        console.log('↩️ Pendente linha ' + row + ' revertido para Pendente');
      }
    }
    if (dados.linhaPendente) {
      reverterLinha(dados.linhaPendente);
    } else if (dados.codigo) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return;
      var registros = sheet.getRange('A2:H' + lastRow).getValues();
      for (var i = 0; i < registros.length; i++) {
        var codReg = registros[i][0] ? registros[i][0].toString().trim() : '';
        var statusReg = registros[i][7] ? registros[i][7].toString().trim() : '';
        if (codReg === dados.codigo.toString().trim() && statusReg === 'Pré-recuperação') {
          reverterLinha(i + 2);
        }
      }
    }
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('❌ Erro ao reverter pré-recuperação:', error);
  }
}