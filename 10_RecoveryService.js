/**
 * 10_RecoveryService.js - NOVO ARQUIVO
 *
 * Serviço de recuperação de reservas pendentes.
 * Funções:
 * - Buscar pendentes por telefone + código WhatsApp
 * - Processar recuperação com ou sem crédito
 * - Verificar disponibilidade dos números originais
 * - Converter valor em crédito quando números ocupados
 */

/**
 * Buscar reserva pendente pelo telefone e código WhatsApp
 * Chamada do frontend: google.script.run.buscarPendente({telefone, codigo})
 *
 * @param {Object} dados - { telefone: string, codigo: string }
 * @returns {Object} - { encontrado: boolean, dados: {...}, numerosDisponiveis: [...], numerosOcupados: [...] }
 */
function buscarPendente(dados) {
  try {
    console.log('🔍 Buscando pendente:', dados);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Pendentes');

    if (!sheet) {
      return { encontrado: false, motivo: 'Nenhum registro pendente encontrado.' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { encontrado: false, motivo: 'Nenhum registro pendente encontrado.' };
    }

    // Normalizar dados de busca
    const telefoneBusca = dados.telefone ? dados.telefone.replace(/\D/g, '') : '';
    const codigoBusca = dados.codigo.toString().trim();

    const registros = sheet.getRange('A2:K' + lastRow).getValues();

    // ===== BUSCA PRIMÁRIA: por código + status Pendente =====
    let registroEncontrado = null;
    let linhaEncontrada = -1;
    let telefoneDiferente = false;

    for (let i = 0; i < registros.length; i++) {
      const registro = registros[i];
      const codigoRegistro = registro[0] ? registro[0].toString().trim() : '';
      const statusRegistro = registro[7] ? registro[7].toString().trim() : '';

      if (codigoRegistro === codigoBusca && statusRegistro === 'Pendente') {
        // Verificação de telefone — informativa, não bloqueante
        const telefoneRegistro = registro[2] ? registro[2].toString().replace(/\D/g, '') : '';
        if (telefoneBusca && telefoneRegistro && telefoneRegistro !== telefoneBusca) {
          telefoneDiferente = true;
          console.log(`⚠️ Código ${codigoBusca} encontrado mas telefone diverge: ${telefoneRegistro} vs ${telefoneBusca}`);
          // Continua buscando — pode haver outro registro
          continue;
        }
        registroEncontrado = registro;
        linhaEncontrada = i;
        break;
      }
    }

    // Se não achou com telefone correspondente, tentar sem verificar telefone
    // (cobre o caso de o usuário ter entrado o telefone com formato levemente diferente)
    if (!registroEncontrado) {
      for (let i = 0; i < registros.length; i++) {
        const registro = registros[i];
        const codigoRegistro = registro[0] ? registro[0].toString().trim() : '';
        const statusRegistro = registro[7] ? registro[7].toString().trim() : '';

        if (codigoRegistro === codigoBusca && statusRegistro === 'Pendente') {
          registroEncontrado = registro;
          linhaEncontrada = i;
          console.log('ℹ️ Encontrado pelo código sem match de telefone');
          break;
        }
      }
    }

    if (registroEncontrado) {
      const registro = registroEncontrado;
      const numerosStr = registro[3] ? registro[3].toString() : '';
      const numeros = numerosStr.split(',').map(n => n.trim()).filter(n => n.length > 0);
      const valor = parseFloat(registro[4]);
      const valorFinal = (isNaN(valor) || valor <= 0) ? numeros.length * VALOR_POR_NUMERO : valor;
      const timestampReserva = registro[5] ? new Date(registro[5]).toISOString() : new Date().toISOString();

      // Verificar disponibilidade dos números originais na aba Rifa
      const rifaSheet = ss.getSheetByName('Rifa');
      const rifaLastRow = rifaSheet.getLastRow();
      const rifaDados = rifaLastRow >= 2 ? rifaSheet.getRange('A2:D' + rifaLastRow).getValues() : [];

      const numerosDisponiveis = [];
      const numerosOcupados = [];

      numeros.forEach(num => {
        const numStr = num.toString().padStart(3, '0');
        let encontradoNaRifa = false;

        for (let j = 0; j < rifaDados.length; j++) {
          const numRifa = rifaDados[j][0].toString().trim().padStart(3, '0');
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

        if (!encontradoNaRifa) numerosOcupados.push(num.toString().padStart(3, '0'));
      });

      console.log(`✅ Pendente encontrado: ${numeros.length} números, ${numerosDisponiveis.length} disponíveis, ${numerosOcupados.length} ocupados`);

      const credito = numerosOcupados.length * VALOR_POR_NUMERO;

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
    for (let i = 0; i < registros.length; i++) {
      const codigoRegistro = registros[i][0] ? registros[i][0].toString().trim() : '';
      const statusRegistro = registros[i][7] ? registros[i][7].toString().trim() : '';

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
 * Processar recuperação: reservar os números originais (se disponíveis)
 * O frontend chama isso após o usuário confirmar os dados
 *
 * @param {Object} dados - { codigo, nome, telefone, numeros, userId, linhaPendente }
 * @returns {Object} - resultado da reserva
 */
function processarRecuperacao(dados) {
  try {
    console.log('🔄 Processando recuperação:', dados);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rifaSheet = ss.getSheetByName('Rifa');
    const pendentesSheet = ss.getSheetByName('Pendentes');

    if (!rifaSheet || !pendentesSheet) {
      throw new Error('Abas necessárias não encontradas');
    }

    // A: Número(0) | B: Nome(1) | C: Telefone(2) | D: Status(3) | E: Comprovante(4)
    // F: Hash(5) | G: Timestamp(6) | H: User ID(7) | I: Código(8)
    const lastRow = rifaSheet.getLastRow();
    const rifaDados = rifaSheet.getRange('A2:I' + lastRow).getValues();

    const numerosParaReservar = [];
    const conflitos = [];

    dados.numeros.forEach(num => {
      const numStr = num.toString().padStart(3, '0');

      for (let i = 0; i < rifaDados.length; i++) {
        const numRifa = rifaDados[i][0].toString().trim().padStart(3, '0');
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

    // Gerar novo código para a recuperação (manter o original como referência)
    const codigoRecuperacao = dados.codigo;

    // Reservar os números disponíveis usando o timestamp ORIGINAL da pendente
    // ⚠️ CRÍTICO: O timestamp da coluna F é usado pelo OCR para validar o comprovante.
    // Se usarmos new Date() (agora), o OCR vai rejeitar comprovantes de horas atrás.
    // Devemos usar o timestampReserva original da aba Pendentes.
    const timestampParaOCR = dados.timestampReserva ? new Date(dados.timestampReserva) : new Date();

    numerosParaReservar.forEach(item => {
      rifaSheet.getRange(item.linha, 2).setValue(dados.nome);       // B - Nome
      rifaSheet.getRange(item.linha, 3).setValue(dados.telefone);   // C - Telefone
      rifaSheet.getRange(item.linha, 4).setValue('Pré-reservado');  // D - Status
      // col 6 (F): Hash — vazio na pré-reserva
      rifaSheet.getRange(item.linha, 7).setValue(timestampParaOCR); // G - Timestamp original
      rifaSheet.getRange(item.linha, 8).setValue(dados.userId);     // H - User ID
      rifaSheet.getRange(item.linha, 9).setValue(codigoRecuperacao);// I - Código
    });

    SpreadsheetApp.flush();

    console.log(`✅ Recuperação: ${numerosParaReservar.length} números pré-reservados`);

    return {
      success: true,
      numerosReservados: numerosParaReservar.map(n => n.numero),
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
 * Processar recuperação COM CRÉDITO (números originais ocupados)
 * O usuário seleciona novos números equivalentes ao crédito
 *
 * @param {Object} dados - { codigo, nome, telefone, novosNumeros, userId, linhaPendente, credito }
 * @returns {Object}
 */
function processarRecuperacaoComCredito(dados) {
  try {
    console.log('💰 Processando recuperação com crédito:', dados);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rifaSheet = ss.getSheetByName('Rifa');

    if (!rifaSheet) throw new Error('Aba "Rifa" não encontrada');

    // Validar que o valor dos novos números não excede o crédito
    const valorNovosNumeros = dados.novosNumeros.length * VALOR_POR_NUMERO;
    if (valorNovosNumeros > dados.credito + 0.01) { // tolerância de centavo
      throw new Error(`Valor dos números selecionados (R$ ${valorNovosNumeros.toFixed(2)}) excede o crédito disponível (R$ ${dados.credito.toFixed(2)})`);
    }

    // Verificar disponibilidade dos novos números
    const lastRow = rifaSheet.getLastRow();
    const rifaDados = rifaSheet.getRange('A2:D' + lastRow).getValues();

    const numerosParaReservar = [];
    const conflitos = [];

    dados.novosNumeros.forEach(num => {
      const numStr = num.toString().padStart(3, '0');
      for (let i = 0; i < rifaDados.length; i++) {
        const numRifa = rifaDados[i][0].toString().trim().padStart(3, '0');
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
      throw new Error(`Números não disponíveis: ${conflitos.join(', ')}`);
    }

    // Reservar novos números usando o timestamp ORIGINAL da pendente
    // ⚠️ CRÍTICO: Usar timestamp original para que o OCR valide corretamente
    const timestampParaOCR = dados.timestampReserva ? new Date(dados.timestampReserva) : new Date();

    numerosParaReservar.forEach(item => {
      rifaSheet.getRange(item.linha, 2).setValue(dados.nome);       // B - Nome
      rifaSheet.getRange(item.linha, 3).setValue(dados.telefone);   // C - Telefone
      rifaSheet.getRange(item.linha, 4).setValue('Pré-reservado');  // D - Status
      // col 6 (F): Hash — vazio na pré-reserva
      rifaSheet.getRange(item.linha, 7).setValue(timestampParaOCR); // G - Timestamp original
      rifaSheet.getRange(item.linha, 8).setValue(dados.userId);     // H - User ID
      rifaSheet.getRange(item.linha, 9).setValue(dados.codigo);     // I - Código
    });

    SpreadsheetApp.flush();

    console.log(`✅ Recuperação com crédito: ${numerosParaReservar.length} novos números reservados`);

    return {
      success: true,
      numerosReservados: numerosParaReservar.map(n => n.numero),
      codigo: dados.codigo,
      valorTotal: numerosParaReservar.length * VALOR_POR_NUMERO
    };

  } catch (error) {
    console.error('❌ Erro na recuperação com crédito:', error);
    throw error;
  }
}

/**
 * Marcar pendente como recuperado após comprovante validado
 *
 * @param {Object} dados - { codigo, linhaPendente }
 */
function marcarPendenteComoRecuperado(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Pendentes');

    if (!sheet) return;

    function atualizarLinha(row) {
      sheet.getRange(row, 8).setValue('Recuperado');    // H - Status
      sheet.getRange(row, 11).setValue(new Date());     // K - Data Recuperação
      console.log(`✅ Pendente linha ${row} marcado como Recuperado`);
    }

    if (dados.linhaPendente) {
      atualizarLinha(dados.linhaPendente);
    } else if (dados.codigo) {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const registros = sheet.getRange('A2:H' + lastRow).getValues();
      for (let i = 0; i < registros.length; i++) {
        if (registros[i][0].toString().trim() === dados.codigo.toString().trim() &&
            registros[i][7] === 'Pendente') {
          atualizarLinha(i + 2);
          break;
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro ao marcar pendente como recuperado:', error);
  }
}

/**
 * Limpar pendentes expirados (mais de 7 dias)
 * Pode ser chamada por trigger ou manualmente
 */
function limparPendentesExpirados() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Pendentes');

    if (!sheet) return { success: true, message: 'Aba Pendentes não existe' };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, message: 'Nenhum pendente' };

    const agora = new Date();
    const seteDias = 7 * 24 * 60 * 60 * 1000;

    const registros = sheet.getRange('A2:J' + lastRow).getValues();
    let expirados = 0;

    for (let i = 0; i < registros.length; i++) {
      const status = registros[i][7] ? registros[i][7].toString() : '';
      const dataRegistro = registros[i][9];

      if (status === 'Pendente' && dataRegistro) {
        const dataObj = dataRegistro instanceof Date ? dataRegistro : new Date(dataRegistro);
        const tempoDecorrido = agora - dataObj;

        if (tempoDecorrido > seteDias) {
          const row = i + 2;
          sheet.getRange(row, 8).setValue('Expirado');
          expirados++;
          console.log(`⏰ Pendente linha ${row} expirado (mais de 7 dias)`);
        }
      }
    }

    return { success: true, expirados: expirados };

  } catch (error) {
    console.error('❌ Erro ao limpar pendentes expirados:', error);
    return { success: false, error: error.message };
  }
}
