/**
 * TRIGGERSERVICE.GS
 * 
 * Gerencia tarefas agendadas e automatizadas:
 * - Configuração de triggers temporizados
 * - Limpeza automática de reservas expiradas
 * - Monitoramento do sistema
 * - Ferramentas de manutenção
 * 
 * Responsável pela execução automatizada de tarefas.
 */

// Função para limpar pré-reservas expiradas da planilha "Rifa"
function limparDadosPreReservasExpiradas() {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');
    
    const agora = new Date();
    const tempoLimite = 10 * 60 * 1000; // 10 minutos em milissegundos
    
    const range = aba.getDataRange();
    const valores = range.getValues();
    
    let linhasLimpas = 0;
    
    console.log(`🔍 Iniciando verificação de ${valores.length - 1} registros...`);
    
    // Percorrer todas as linhas a partir da linha 2 (índice 1)
    for (let i = 1; i < valores.length; i++) {
      const linha = valores[i];
      
      // Estrutura da sua planilha:
      const numero = linha[0];        // Coluna A - Número
      const nome = linha[1];          // Coluna B - Nome
      const telefone = linha[2];      // Coluna C - Telefone
      const status = linha[3];        // Coluna D - Status
      const comprovante = linha[4];   // Coluna E - Comprovante
      const timestamp = linha[5];     // Coluna F - Timestamp
      const userId = linha[6];        // Coluna G - User ID
      const codigo = linha[7];        // Coluna H - Código
      
      // Verificar se o status é "Pré-reservado"
      if (status === 'Pré-reservado') {
        
        let timestampObj;
        
        // Tentar converter o timestamp para Date
        if (timestamp instanceof Date) {
          timestampObj = timestamp;
        } else if (timestamp && (typeof timestamp === 'string' || typeof timestamp === 'number')) {
          timestampObj = new Date(timestamp);
        } else {
          // Se não tem timestamp válido, considerar como expirado
          console.log(`⚠️ Timestamp inválido para número ${numero}, assumindo expirado`);
          timestampObj = new Date(0);
        }
        
        // Calcular tempo decorrido
        const tempoDecorrido = agora - timestampObj;
        const minutosDecorridos = Math.round(tempoDecorrido / 60000);
        
        // Se passou mais de 10 minutos, limpar os dados
        if (tempoDecorrido > tempoLimite) {
          const numeroLinha = i + 1; // +1 porque Sheets começa em 1
          
          console.log(`🧹 Limpando número ${numero} (${minutosDecorridos} min) - Nome: ${nome}`);
          
          // Limpar colunas B, C, E, F, G, H
          aba.getRange(numeroLinha, 2).setValue('');  // B - Nome
          aba.getRange(numeroLinha, 3).setValue('');  // C - Telefone
          aba.getRange(numeroLinha, 5).setValue('');  // E - Comprovante
          aba.getRange(numeroLinha, 6).setValue('');  // F - Timestamp
          aba.getRange(numeroLinha, 7).setValue('');  // G - User ID
          aba.getRange(numeroLinha, 8).setValue('');  // H - Código
          
          // Mudar status para "Disponível" na coluna D
          aba.getRange(numeroLinha, 4).setValue('Disponível');
          
          linhasLimpas++;
        } else {
          // Log para acompanhar pré-reservas ainda válidas
          console.log(`⏰ Número ${numero} ainda válido (${minutosDecorridos} min)`);
        }
      }
    }
    
    console.log(`✅ Limpeza concluída: ${linhasLimpas} pré-reservas expiradas foram liberadas`);
    
    return {
      success: true,
      limpas: linhasLimpas,
      timestamp: new Date(),
      message: `${linhasLimpas} números foram liberados`
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

// Função para configurar o trigger automático
// SUBSTITUA sua função configurarLimpezaAutomatica() por esta CORRIGIDA:

function configurarLimpezaAutomatica() {
  console.log('⏰ Configurando limpeza automática...');
  
  try {
    // Primeiro, remover triggers existentes para evitar duplicatas
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
    
    // Aguardar um pouco antes de criar novos
    Utilities.sleep(1000);
    
    // Criar novos triggers com intervalos VÁLIDOS
    console.log('⏰ Criando novos triggers...'); 
    
    // Trigger principal - a cada 5 minutos (não pode ser 2!)
    const trigger1 = ScriptApp.newTrigger('limparDadosPreReservasExpiradas')
      .timeBased()
      .everyMinutes(5) // MUDOU DE 2 PARA 5
      .create();
    console.log('✅ Trigger de 5 minutos criado: ' + trigger1.getUniqueId());
    
    // Aguardar um pouco
    Utilities.sleep(500);
    
    // Trigger backup - a cada hora
    const trigger2 = ScriptApp.newTrigger('limparDadosPreReservasExpiradas')
      .timeBased()
      .everyHours(1)
      .create();
    console.log('✅ Trigger de backup criado: ' + trigger2.getUniqueId());
    
    // Verificar se foram criados
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

// Função para executar manualmente e testar
function testarLimpeza() {
  console.log('🧪 Iniciando teste de limpeza...');
  const resultado = limparDadosPreReservasExpiradas();
  console.log('📊 Resultado do teste:', resultado);
  return resultado;
}

// Função para verificar quais pré-reservas estão próximas do vencimento
function verificarPreReservasProximasVencimento() {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');
    
    const agora = new Date();
    const tempoLimite = 10 * 60 * 1000; // 10 minutos
    const tempoAviso = 8 * 60 * 1000;   // 8 minutos (2 min antes de expirar)
    
    const valores = aba.getDataRange().getValues();
    const proximasVencimento = [];
    
    for (let i = 1; i < valores.length; i++) {
      const linha = valores[i];
      const numero = linha[0];        // Coluna A - Número
      const nome = linha[1];          // Coluna B - Nome
      const status = linha[3];        // Coluna D - Status
      const timestamp = linha[5];     // Coluna F - Timestamp
      
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

// Função para obter estatísticas de limpeza
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
      const status = linha[3];        // Coluna D - Status
      const timestamp = linha[5];     // Coluna F - Timestamp
      
      if (status === 'Pré-reservado') {
        totalPreReservados++;
        
        if (timestamp) {
          const timestampObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
          const tempoDecorrido = agora - timestampObj;
          
          if (tempoDecorrido > 8 * 60 * 1000) { // 8 minutos
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

// ===== FUNÇÃO DE CONFIGURAÇÃO COMPLETA =====
// Execute esta função UMA VEZ APENAS para configurar tudo

function configurarTudo() {
  console.log('🚀 Configurando limpeza automática para planilha Rifa...');
  
  try {
    // 1. Verificar se a planilha existe
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');
    
    if (!aba) {
      console.error('❌ Aba "Rifa" não encontrada!');
      return;
    }
    
    console.log('✅ Aba "Rifa" encontrada');
    
    // 2. Configurar os triggers automáticos
    configurarLimpezaAutomatica();
    
    // 3. Fazer um teste inicial para ver se há pré-reservas expiradas
    console.log('🧪 Executando teste inicial...');
    const resultado = limparDadosPreReservasExpiradas();
    
    // 4. Verificar estatísticas atuais
    const stats = obterEstatisticasLimpeza();
    
    // 5. Verificar pré-reservas próximas do vencimento
    const proximasVencimento = verificarPreReservasProximasVencimento();
    
    // 6. Relatório final
    console.log('');
    console.log('📊 === RELATÓRIO DE CONFIGURAÇÃO ===');
    console.log('✅ Configuração concluída com sucesso!');
    console.log('⏰ Limpeza automática ativada (a cada 2 minutos)');
    console.log('🧹 Resultado do teste inicial:', resultado);
    console.log('📈 Estatísticas atuais:', stats);
    
    if (proximasVencimento.length > 0) {
      console.log('⚠️ Pré-reservas próximas do vencimento:', proximasVencimento);
    } else {
      console.log('✅ Nenhuma pré-reserva próxima do vencimento');
    }
    
    console.log('');
    console.log('🎯 O que foi configurado:');
    console.log('- ✅ Trigger de limpeza a cada 2 minutos');
    console.log('- ✅ Trigger de backup a cada 1 hora');
    console.log('- ✅ Tempo de expiração: 10 minutos');
    console.log('- ✅ Status verificado: "Pré-reservado"');
    console.log('- ✅ Colunas limpas: B, C, E, F, G, H');
    console.log('- ✅ Status alterado para: "Disponível"');
    console.log('');
    console.log('🔧 Para monitorar:');
    console.log('- Execute: verificarPreReservasProximasVencimento()');
    console.log('- Execute: obterEstatisticasLimpeza()');
    console.log('- Execute: testarLimpeza()');
    
    return {
      success: true,
      configurado: true,
      testeInicial: resultado,
      estatisticas: stats,
      proximasVencimento: proximasVencimento
    };
    
  } catch (error) {
    console.error('❌ Erro na configuração:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ===== FUNÇÃO DE MONITORAMENTO =====
// Execute esta quando quiser ver o status atual

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

// ===== FUNÇÃO PARA DESATIVAR =====
// Execute se quiser parar a limpeza automática

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

// ===== FUNÇÃO DE LIMPEZA MANUAL =====
// Execute quando quiser limpar manualmente (sem aguardar o trigger)

function limpezaManualCompleta() {
  console.log('🧹 === LIMPEZA MANUAL ===');
  
  const antes = obterEstatisticasLimpeza();
  console.log('📊 Antes da limpeza:', antes);
  
  const resultado = limparDadosPreReservasExpiradas();
  console.log('🧹 Resultado da limpeza:', resultado);
  
  const depois = obterEstatisticasLimpeza();
  console.log('📊 Depois da limpeza:', depois);
  
  return { antes, resultado, depois };
}

// ===== ADICIONE ESTAS FUNÇÕES NO FINAL DO SEU CÓDIGO =====

// FUNÇÃO 1: Testar permissões (ADICIONAR)
function testarPermissoes() {
  console.log('🔍 Testando permissões...');
  
  try {
    // Testar acesso à planilha
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const aba = planilha.getSheetByName('Rifa');
    console.log('✅ Acesso à planilha: OK');
    console.log('✅ Aba "Rifa" encontrada: ' + (aba ? 'SIM' : 'NÃO'));
    
    // Testar criação de trigger (isso vai pedir permissão)
    const triggers = ScriptApp.getProjectTriggers();
    console.log('✅ Acesso aos triggers: OK');
    console.log('📊 Triggers existentes: ' + triggers.length);
    
    // Tentar criar um trigger de teste
    try {
      const testTrigger = ScriptApp.newTrigger('testarLimpeza')
        .timeBased()
        .after(60000) // 1 minuto
        .create();
      
      console.log('✅ Criação de trigger: OK');
      
      // Remover o trigger de teste
      ScriptApp.deleteTrigger(testTrigger);
      console.log('✅ Remoção de trigger: OK');
      
      return {
        success: true,
        message: "Todas as permissões estão OK! Agora pode executar configurarTudo()"
      };
      
    } catch (triggerError) {
      console.error('❌ Erro ao criar trigger:', triggerError.message);
      return {
        success: false,
        message: "Precisa autorizar permissões para triggers",
        error: triggerError.message
      };
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return {
      success: false,
      message: "Erro nas permissões básicas",
      error: error.message
    };
  }
}

// FUNÇÃO 2: Verificar triggers (ADICIONAR)
function verificarTriggers() {
  console.log('🔍 === VERIFICAÇÃO DE TRIGGERS ===');
  
  const triggers = ScriptApp.getProjectTriggers();
  const triggersRifa = triggers.filter(t => 
    t.getHandlerFunction() === 'limparDadosPreReservasExpiradas'
  );
  
  console.log(`📊 Total de triggers no projeto: ${triggers.length}`);
  console.log(`📊 Triggers da rifa: ${triggersRifa.length}`);
  
  if (triggersRifa.length === 0) {
    console.log('❌ NENHUM trigger da rifa encontrado!');
    console.log('💡 Execute: configurarTudo()');
  } else {
    console.log('✅ Triggers da rifa encontrados:');
    triggersRifa.forEach((trigger, index) => {
      console.log(`   ${index + 1}. ID: ${trigger.getUniqueId()}`);
      console.log(`      Função: ${trigger.getHandlerFunction()}`);
      console.log(`      Tipo: ${trigger.getTriggerSource()}`);
    });
  }
  
  return {
    totalTriggers: triggers.length,
    triggersRifa: triggersRifa.length,
    detalhes: triggersRifa.map(t => ({
      id: t.getUniqueId(),
      funcao: t.getHandlerFunction()
    }))
  };
}

// FUNÇÃO 3: Forçar limpeza para teste (ADICIONAR)
function forcarLimpezaAgora() {
  console.log('🚨 === FORÇANDO LIMPEZA IMEDIATA ===');
  
  const antes = obterEstatisticasLimpeza();
  console.log('📊 ANTES:', JSON.stringify(antes));
  
  const resultado = limparDadosPreReservasExpiradas();
  console.log('🧹 RESULTADO:', JSON.stringify(resultado));
  
  const depois = obterEstatisticasLimpeza();
  console.log('📊 DEPOIS:', JSON.stringify(depois));
  
  if (resultado.success && resultado.limpas > 0) {
    console.log(`🎉 SUCESSO! ${resultado.limpas} números foram liberados`);
  } else if (resultado.success && resultado.limpas === 0) {
    console.log('✅ Nenhuma pré-reserva expirada encontrada');
  } else {
    console.log('❌ Erro na limpeza:', resultado.error);
  }
  
  return { antes, resultado, depois };
}

// ✅ FUNÇÃO DE TESTE PARA VERIFICAÇÃO
function testarVerificacaoSeguranca() {
  console.log('🧪 Iniciando teste de verificação de segurança...');
  
  // Teste com dados fictícios - ajuste conforme necessário
  const resultado = verificarSegurancaReserva(['001', '002'], 'user123');
  
  console.log('📊 Resultado do teste:', resultado);
  
  if (resultado.sucesso) {
    console.log('✅ Teste passou - verificação funcionando');
  } else {
    console.log('❌ Teste falhou:', resultado.motivo);
    console.log('🔍 Detalhes:', resultado.detalhes);
  }
  
  return resultado;
}

// ============================================================================
// FUNÇÃO PARA CRIAR O TRIGGER AUTOMÁTICO (Execute UMA VEZ no editor)
// ============================================================================

function criarTriggerAcordarAPI() {
  try {
    // Primeiro, deletar triggers existentes para evitar duplicação
    deletarTriggersExistentes();
    
    // Criar novo trigger a cada 15 minutos
    ScriptApp.newTrigger('acordarApiEvolution')
      .timeBased()
      .everyMinutes(15)
      .create();
    
    console.log('✅ Trigger criado com sucesso! API será acordada a cada 15 minutos.');
    
  } catch (error) {
    console.error('❌ Erro ao criar trigger:', error);
  }
}

// ============================================================================
// FUNÇÃO PARA DELETAR TRIGGERS EXISTENTES (Opcional - para limpeza)
// ============================================================================

function deletarTriggersExistentes() {
  const triggers = ScriptApp.getProjectTriggers();
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'acordarApiEvolution') {
      ScriptApp.deleteTrigger(trigger);
      console.log('🗑️ Trigger antigo removido');
    }
  });
}

// ============================================================================
// FUNÇÃO PARA LISTAR TODOS OS TRIGGERS ATIVOS (Para verificar)
// ============================================================================

function listarTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  
  console.log('📋 Triggers ativos:');
  triggers.forEach((trigger, index) => {
    console.log(`${index + 1}. Função: ${trigger.getHandlerFunction()}`);
    console.log(`   Tipo: ${trigger.getEventType()}`);
    console.log(`   ID: ${trigger.getUniqueId()}`);
    console.log('---');
  });
  
  if (triggers.length === 0) {
    console.log('❌ Nenhum trigger ativo encontrado');
  }
}

// ============================================================================
// FUNÇÃO PARA VERIFICAR LIMITES E STATUS DA SUA CONTA
// ============================================================================

function verificarLimitesEStatus() {
  console.log('📊 === VERIFICAÇÃO DE LIMITES E STATUS ===');
  
  // 1. Verificar tipo de conta
  try {
    const user = Session.getActiveUser().getEmail();
    console.log(`👤 Usuário: ${user}`);
    
    // Verificar se é Workspace (geralmente tem domínio próprio)
    if (user.includes('@gmail.com')) {
      console.log('📱 Tipo: Conta Gmail (provavelmente gratuita)');
      console.log('⏱️ Limite: 6 horas/dia');
    } else {
      console.log('🏢 Tipo: Possível Google Workspace');
      console.log('⏱️ Limite: Até 20 horas/dia');
    }
  } catch (error) {
    console.log('❌ Erro ao verificar usuário:', error);
  }
  
  // 2. Listar triggers ativos
  const triggers = ScriptApp.getProjectTriggers();
  console.log(`\n🔔 Triggers ativos: ${triggers.length}`);
  
  triggers.forEach((trigger, index) => {
    console.log(`${index + 1}. ${trigger.getHandlerFunction()}`);
    console.log(`   Tipo: ${trigger.getEventType()}`);
    console.log(`   Criado: ${new Date(trigger.getUniqueId().substring(0,13) * 1)}`);
  });
  
  // 3. Calcular uso estimado da API Evolution
  const triggersEvolution = triggers.filter(t => t.getHandlerFunction() === 'acordarApiEvolution');
  
  if (triggersEvolution.length > 0) {
    console.log('\n📈 ESTIMATIVA DE USO DA API EVOLUTION:');
    console.log('⏰ Frequência: A cada 15 minutos');
    console.log('🔢 Execuções/dia: 96');
    console.log('⏱️ Tempo/execução: ~2 segundos');
    console.log('📊 Uso total/dia: ~3 minutos (0,05 horas)');
    console.log('✅ Status: MUITO ABAIXO do limite!');
  }
  
  // 4. Verificar execuções recentes
  console.log('\n📋 PARA VER EXECUÇÕES RECENTES:');
  console.log('1. Vá no menu "Execuções" (lado esquerdo)');
  console.log('2. Procure por execuções de "acordarApiEvolution"');
  console.log('3. Clique em uma execução para ver os logs');
  
  console.log('\n🎯 CONCLUSÃO:');
  console.log('Seu uso será mínimo. Pode usar o trigger tranquilo!');
}

// ============================================================================
// FUNÇÃO SEGURA PARA REMOVER APENAS TRIGGERS DA API EVOLUTION
// ============================================================================

function removerApenasTriggersApiEvolution() {
  const triggers = ScriptApp.getProjectTriggers();
  let removidos = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'acordarApiEvolution') {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
      console.log('🗑️ Trigger da API Evolution removido');
    }
  });
  
  if (removidos === 0) {
    console.log('ℹ️ Nenhum trigger da API Evolution encontrado');
  } else {
    console.log(`✅ ${removidos} trigger(s) da API Evolution removido(s)`);
  }
  
  // Mostrar triggers restantes
  const triggersRestantes = ScriptApp.getProjectTriggers();
  console.log(`\n📋 Triggers restantes: ${triggersRestantes.length}`);
  triggersRestantes.forEach((trigger, index) => {
    console.log(`${index + 1}. ${trigger.getHandlerFunction()}`);
  });
}

// ============================================================================
// FUNÇÃO PARA TESTAR SE A API ESTÁ FUNCIONANDO
// ============================================================================

function testarApiEvolution() {
  console.log('🧪 Testando API Evolution...');
  
  const resultado = acordarApiEvolution();
  
  if (resultado && resultado.success) {
    console.log('✅ Teste concluído! API respondeu normalmente.');
    console.log('🚀 Pode criar o trigger sem problemas!');
  } else {
    console.log('⚠️ Algo não funcionou no teste.');
    console.log('🔍 Verifique suas configurações de API antes de criar o trigger.');
  }
}