/**
 * TRIGGERSERVICE.GS - ATUALIZADO COM FLUXO DE PENDENTES
 *
 * Gerencia tarefas agendadas e automatizadas:
 * - Configuração de triggers temporizados
 * - Limpeza automática de reservas expiradas
 * - ✅ NOVO: Salvar dados na aba "Pendentes" antes de limpar
 * - Monitoramento do sistema
 * - Ferramentas de manutenção
 */

// ✅ FUNÇÃO ATUALIZADA: Limpar pré-reservas expiradas COM salvamento em Pendentes
function limparDadosPreReservasExpiradas() {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');

    const agora = new Date();
    const tempoLimite = 10 * 60 * 1000; // 10 minutos em milissegundos

    const range = aba.getDataRange();
    const valores = range.getValues();

    let linhasLimpas = 0;
    let pendentesSalvos = 0;

    console.log(`🔍 Iniciando verificação de ${valores.length - 1} registros...`);

    for (let i = 1; i < valores.length; i++) {
      const linha = valores[i];

      const numero = linha[0];        // A - Número
      const nome = linha[1];          // B - Nome
      const telefone = linha[2];      // C - Telefone
      const status = linha[3];        // D - Status
      const comprovante = linha[4];   // E - Comprovante
      // linha[5] = F - Hash Comprovante (não relevante para limpeza)
      const timestamp = linha[6];     // G - Timestamp
      const userId = linha[7];        // H - User ID
      const codigo = linha[8];        // I - Código

      if (status === 'Pré-reservado') {
        let timestampObj;

        if (timestamp instanceof Date) {
          timestampObj = timestamp;
        } else if (timestamp && (typeof timestamp === 'string' || typeof timestamp === 'number')) {
          timestampObj = new Date(timestamp);
        } else {
          console.log(`⚠️ Timestamp inválido para número ${numero}, assumindo expirado`);
          timestampObj = new Date(0);
        }

        const tempoDecorrido = agora - timestampObj;
        const minutosDecorridos = Math.round(tempoDecorrido / 60000);

        if (tempoDecorrido > tempoLimite) {
          const numeroLinha = i + 1;

          // ✅ NOVO: Salvar na aba "Pendentes" ANTES de limpar
          try {
            salvarPendente({
              numero: numero,
              nome: nome,
              telefone: telefone,
              codigo: codigo,
              valor: VALOR_POR_NUMERO,
              timestampReserva: timestampObj,
              motivo: 'Timeout (pré-reserva expirou após 10 minutos)',
              userId: userId
            });
            pendentesSalvos++;
          } catch (erroPendente) {
            console.error(`⚠️ Erro ao salvar pendente ${numero}:`, erroPendente);
            // Não interrompe a limpeza
          }

          console.log(`🧹 Limpando número ${numero} (${minutosDecorridos} min) - Nome: ${nome}`);

          // Limpar colunas B, C, E, F, G, H
          aba.getRange(numeroLinha, 2).setValue('');  // B - Nome
          aba.getRange(numeroLinha, 3).setValue('');  // C - Telefone
          aba.getRange(numeroLinha, 5).setValue('');  // E - Comprovante
          aba.getRange(numeroLinha, 6).setValue('');  // F - Hash Comprovante
          aba.getRange(numeroLinha, 7).setValue('');  // G - Timestamp
          aba.getRange(numeroLinha, 8).setValue('');  // H - User ID
          aba.getRange(numeroLinha, 9).setValue('');  // I - Código

          aba.getRange(numeroLinha, 4).setValue('Disponível'); // D - Status

          linhasLimpas++;
        } else {
          console.log(`⏰ Número ${numero} ainda válido (${minutosDecorridos} min)`);
        }
      }
    }

    console.log(`✅ Limpeza concluída: ${linhasLimpas} pré-reservas expiradas liberadas, ${pendentesSalvos} salvas em Pendentes`);

    return {
      success: true,
      limpas: linhasLimpas,
      pendentesSalvos: pendentesSalvos,
      timestamp: new Date(),
      message: `${linhasLimpas} números liberados, ${pendentesSalvos} salvos em Pendentes`
    };

  } catch (error) {
    console.error('❌ Erro na limpeza automática:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date()
    };
  }
}

// ✅ NOVA FUNÇÃO: Salvar dados de pré-reserva expirada na aba "Pendentes"
function salvarPendente(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Pendentes');

    // Criar aba se não existir
    if (!sheet) {
      sheet = ss.insertSheet('Pendentes');
      sheet.appendRow([
        'Código WhatsApp',   // A
        'Nome',              // B
        'Telefone',          // C
        'Números',           // D
        'Valor (R$)',        // E
        'Timestamp Reserva', // F
        'Motivo Falha',      // G
        'Status',            // H
        'User ID',           // I
        'Data Registro',     // J
        'Data Recuperação'   // K
      ]);
      sheet.getRange('A1:K1').setFontWeight('bold');
      sheet.setFrozenRows(1);
      console.log('📝 Aba "Pendentes" criada');
    }

    // ✅ Cada tentativa de reserva gera uma nova linha na aba Pendentes
    // Isso permite ao administrador ver o histórico completo de tentativas por código.
    // Não há agrupamento: mesmo código pode aparecer múltiplas vezes com timestamps diferentes.

    // Criar novo registro
    const numStr = dados.numero.toString().padStart(3, '0');
    sheet.appendRow([
      dados.codigo ? dados.codigo.toString() : '',
      dados.nome || '',
      dados.telefone || '',
      numStr,
      dados.valor || VALOR_POR_NUMERO,
      dados.timestampReserva || new Date(),
      dados.motivo || 'Não concluída',
      'Pendente',
      dados.userId || '',
      new Date(),
      ''  // K - Data Recuperação (vazio inicialmente)
    ]);

    // Forçar formatação texto para manter zeros
    const newLastRow = sheet.getLastRow();
    sheet.getRange(newLastRow, 1).setNumberFormat('@').setValue(dados.codigo ? dados.codigo.toString() : '');
    sheet.getRange(newLastRow, 4).setNumberFormat('@').setValue(numStr);

    console.log(`📝 Pendente salvo: ${numStr} - Código: ${dados.codigo} - Motivo: ${dados.motivo}`);

  } catch (error) {
    console.error('❌ Erro ao salvar pendente:', error);
    throw error;
  }
}

// ✅ NOVA FUNÇÃO: Salvar pendente quando comprovante falha (chamada do RifaService)
function salvarPendentePorFalhaComprovante(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Pendentes');

    if (!sheet) {
      // Chamar salvarPendente que cria a aba
      salvarPendente({
        numero: dados.numeros[0],
        nome: dados.nome,
        telefone: dados.telefone,
        codigo: dados.codigo,
        valor: dados.valor,
        timestampReserva: dados.timestampReserva,
        motivo: dados.motivo,
        userId: dados.userId
      });

      // Para números adicionais
      sheet = ss.getSheetByName('Pendentes');
    }

    // Buscar se já existe registro com este código
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const dadosExistentes = sheet.getRange('A2:H' + lastRow).getValues();
      for (let i = 0; i < dadosExistentes.length; i++) {
        const codigoExistente = dadosExistentes[i][0] ? dadosExistentes[i][0].toString().trim() : '';
        const statusExistente = dadosExistentes[i][7] ? dadosExistentes[i][7].toString() : '';

        if (codigoExistente === dados.codigo.toString().trim() && statusExistente === 'Pendente') {
          // Atualizar registro existente com todos os números
          const row = i + 2;
          const numerosStr = dados.numeros.map(n => n.toString().padStart(3, '0')).join(', ');
          sheet.getRange(row, 4).setNumberFormat('@').setValue(numerosStr);
          sheet.getRange(row, 5).setValue(dados.valor);
          sheet.getRange(row, 7).setValue(dados.motivo);
          console.log(`📝 Pendente atualizado por falha de comprovante: ${numerosStr}`);
          return;
        }
      }
    }

    // Não existe: criar
    const numerosStr = dados.numeros.map(n => n.toString().padStart(3, '0')).join(', ');
    sheet.appendRow([
      dados.codigo || '',
      dados.nome || '',
      dados.telefone || '',
      numerosStr,
      dados.valor || 0,
      dados.timestampReserva || new Date(),
      dados.motivo || 'Falha no comprovante',
      'Pendente',
      dados.userId || '',
      new Date(),
      ''  // K - Data Recuperação
    ]);

    const newLastRow = sheet.getLastRow();
    sheet.getRange(newLastRow, 1).setNumberFormat('@').setValue(dados.codigo || '');
    sheet.getRange(newLastRow, 4).setNumberFormat('@').setValue(numerosStr);

    console.log(`📝 Pendente salvo por falha de comprovante: ${numerosStr}`);

  } catch (error) {
    console.error('❌ Erro ao salvar pendente por falha:', error);
  }
}


/**
 * Atualizar o motivo de um registro Pendente pelo código WhatsApp.
 * Mantém o status 'Pendente' para que recovery ainda funcione.
 *
 * @param {string} codigo   - Código WhatsApp da pré-reserva
 * @param {string} motivo   - Nova descrição do motivo
 * @param {string} [novoStatus] - (opcional) Alterar status. Omitir para manter 'Pendente'.
 */
function atualizarMotivoPendente(codigo, motivo, novoStatus) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Pendentes');

    if (!sheet || sheet.getLastRow() < 2) return;

    const registros = sheet.getRange('A2:H' + sheet.getLastRow()).getValues();

    for (let i = 0; i < registros.length; i++) {
      const codigoLinha = registros[i][0] ? registros[i][0].toString().trim() : '';
      const statusLinha = registros[i][7] ? registros[i][7].toString().trim() : '';

      if (codigoLinha === codigo.toString().trim() && statusLinha === 'Pendente') {
        const row = i + 2;
        sheet.getRange(row, 7).setValue(motivo);       // G - Motivo Falha
        if (novoStatus) {
          sheet.getRange(row, 8).setValue(novoStatus); // H - Status
        }
        console.log('📝 Pendente código ' + codigo + ' atualizado: motivo="' + motivo + '"');
        return;
      }
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar motivo pendente:', error);
  }
}

// ===== FUNÇÕES EXISTENTES (sem alteração) =====
function configurarLimpezaAutomatica() {
  console.log('⏰ Configurando limpeza automática...');

  try {
    console.log('🗑️ Removendo triggers antigos...');
    const triggers = ScriptApp.getProjectTriggers();
    let removidos = 0;

    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'limparDadosPreReservasExpiradas') {
        ScriptApp.deleteTrigger(trigger);
        removidos++;
        console.log('🗑️ Trigger antigo removido: ' + trigger.getUniqueId());
      }
    });

    console.log(`✅ ${removidos} triggers antigos removidos`);
    Utilities.sleep(1000);

    console.log('⏰ Criando novos triggers...');

    const trigger1 = ScriptApp.newTrigger('limparDadosPreReservasExpiradas')
      .timeBased()
      .everyMinutes(5)
      .create();
    console.log('✅ Trigger de 5 minutos criado: ' + trigger1.getUniqueId());

    Utilities.sleep(500);

    const trigger2 = ScriptApp.newTrigger('limparDadosPreReservasExpiradas')
      .timeBased()
      .everyHours(1)
      .create();
    console.log('✅ Trigger de backup criado: ' + trigger2.getUniqueId());

    const novos = ScriptApp.getProjectTriggers().filter(t =>
      t.getHandlerFunction() === 'limparDadosPreReservasExpiradas'
    );

    console.log(`🎯 Total de triggers da rifa ativos: ${novos.length}`);

    return {
      success: true,
      triggersCreated: novos.length,
      triggerIds: novos.map(t => t.getUniqueId())
    };

  } catch (error) {
    console.error('❌ Erro ao configurar triggers:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function testarLimpeza() {
  console.log('🧪 Iniciando teste de limpeza...');
  const resultado = limparDadosPreReservasExpiradas();
  console.log('📊 Resultado do teste:', resultado);
  return resultado;
}

function verificarPreReservasProximasVencimento() {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');

    const agora = new Date();
    const tempoLimite = 10 * 60 * 1000;
    const tempoAviso = 8 * 60 * 1000;

    const valores = aba.getDataRange().getValues();
    const proximasVencimento = [];

    for (let i = 1; i < valores.length; i++) {
      const linha = valores[i];
      const numero = linha[0];
      const nome = linha[1];
      const status = linha[3];
      const timestamp = linha[6]; // G - Timestamp

      if (status === 'Pré-reservado') {
        const timestampObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const tempoDecorrido = agora - timestampObj;

        if (tempoDecorrido > tempoAviso && tempoDecorrido < tempoLimite) {
          proximasVencimento.push({
            numero: numero,
            nome: nome,
            minutosRestantes: Math.round((tempoLimite - tempoDecorrido) / 60000)
          });
        }
      }
    }

    if (proximasVencimento.length > 0) {
      console.log('⚠️ Pré-reservas próximas do vencimento:', proximasVencimento);
    }

    return proximasVencimento;

  } catch (error) {
    console.error('❌ Erro ao verificar vencimentos:', error);
    return [];
  }
}

function obterEstatisticasLimpeza() {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');

    const valores = aba.getDataRange().getValues();
    const agora = new Date();

    let totalPreReservados = 0;
    let proximosVencimento = 0;
    let totalDisponiveis = 0;

    for (let i = 1; i < valores.length; i++) {
      const linha = valores[i];
      const status = linha[3];
      const timestamp = linha[6]; // G - Timestamp

      if (status === 'Pré-reservado') {
        totalPreReservados++;
        if (timestamp) {
          const timestampObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
          const tempoDecorrido = agora - timestampObj;
          if (tempoDecorrido > 8 * 60 * 1000) {
            proximosVencimento++;
          }
        }
      } else if (status === 'Disponível') {
        totalDisponiveis++;
      }
    }

    return {
      totalPreReservados,
      proximosVencimento,
      totalDisponiveis,
      timestamp: new Date()
    };

  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    return null;
  }
}

function configurarTudo() {
  console.log('🚀 Configurando limpeza automática para planilha Rifa...');

  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');

    if (!aba) {
      console.error('❌ Aba "Rifa" não encontrada!');
      return;
    }

    console.log('✅ Aba "Rifa" encontrada');
    configurarLimpezaAutomatica();

    console.log('🧪 Executando teste inicial...');
    const resultado = limparDadosPreReservasExpiradas();
    const stats = obterEstatisticasLimpeza();
    const proximasVencimento = verificarPreReservasProximasVencimento();

    console.log('📊 === RELATÓRIO DE CONFIGURAÇÃO ===');
    console.log('✅ Configuração concluída com sucesso!');
    console.log('⏰ Limpeza automática ativada (a cada 5 minutos)');
    console.log('📝 Pendentes serão salvos automaticamente antes da limpeza');

    return {
      success: true,
      configurado: true,
      testeInicial: resultado,
      estatisticas: stats,
      proximasVencimento: proximasVencimento
    };

  } catch (error) {
    console.error('❌ Erro na configuração:', error);
    return { success: false, error: error.message };
  }
}

function monitorarRifa() {
  console.log('📊 === MONITORAMENTO DA RIFA ===');
  const stats = obterEstatisticasLimpeza();
  const proximas = verificarPreReservasProximasVencimento();
  console.log('📈 Estatísticas:', stats);

  if (proximas.length > 0) {
    console.log('⚠️ Atenção! Pré-reservas que vão expirar em breve:');
    proximas.forEach(item => {
      console.log(`   • Número ${item.numero} (${item.nome}) - ${item.minutosRestantes} min restantes`);
    });
  } else {
    console.log('✅ Nenhuma pré-reserva próxima do vencimento');
  }

  return { stats, proximas };
}

function pararLimpezaAutomatica() {
  const triggers = ScriptApp.getProjectTriggers();
  let removidos = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'limparDadosPreReservasExpiradas') {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });

  console.log(`🛑 Limpeza automática desativada (${removidos} triggers removidos)`);
  return { desativado: true, triggersRemovidos: removidos };
}

function limpezaManualCompleta() {
  console.log('🧹 === LIMPEZA MANUAL ===');
  const antes = obterEstatisticasLimpeza();
  const resultado = limparDadosPreReservasExpiradas();
  const depois = obterEstatisticasLimpeza();
  return { antes, resultado, depois };
}

function testarPermissoes() {
  console.log('🔍 Testando permissões...');
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');
    console.log('✅ Acesso à planilha: OK');

    const triggers = ScriptApp.getProjectTriggers();
    console.log('✅ Acesso aos triggers: OK');

    try {
      const testTrigger = ScriptApp.newTrigger('testarLimpeza')
        .timeBased()
        .after(60000)
        .create();
      ScriptApp.deleteTrigger(testTrigger);
      return { success: true, message: "Todas as permissões estão OK!" };
    } catch (triggerError) {
      return { success: false, message: "Precisa autorizar permissões para triggers", error: triggerError.message };
    }
  } catch (error) {
    return { success: false, message: "Erro nas permissões básicas", error: error.message };
  }
}

function verificarTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const triggersRifa = triggers.filter(t =>
    t.getHandlerFunction() === 'limparDadosPreReservasExpiradas'
  );

  console.log(`📊 Total: ${triggers.length}, Rifa: ${triggersRifa.length}`);
  return {
    totalTriggers: triggers.length,
    triggersRifa: triggersRifa.length,
    detalhes: triggersRifa.map(t => ({ id: t.getUniqueId(), funcao: t.getHandlerFunction() }))
  };
}

function forcarLimpezaAgora() {
  const antes = obterEstatisticasLimpeza();
  const resultado = limparDadosPreReservasExpiradas();
  const depois = obterEstatisticasLimpeza();
  return { antes, resultado, depois };
}

// ===== FUNÇÕES DA API EVOLUTION (sem alteração) =====

function criarTriggerAcordarAPI() {
  try {
    deletarTriggersExistentes();
    ScriptApp.newTrigger('acordarApiEvolution')
      .timeBased()
      .everyMinutes(15)
      .create();
    console.log('✅ Trigger criado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao criar trigger:', error);
  }
}

function deletarTriggersExistentes() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'acordarApiEvolution') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function listarTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger, index) => {
    console.log(`${index + 1}. Função: ${trigger.getHandlerFunction()} | Tipo: ${trigger.getEventType()}`);
  });
}

function removerApenasTriggersApiEvolution() {
  const triggers = ScriptApp.getProjectTriggers();
  let removidos = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'acordarApiEvolution') {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });
  console.log(`✅ ${removidos} trigger(s) da API Evolution removido(s)`);
}
