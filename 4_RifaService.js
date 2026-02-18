/**
 * RIFASERVICE.GS
 * 
 * Contém a lógica de negócio principal da aplicação:
 * - Reserva de números
 * - Validação de transações
 * - Gestão de comprovantes
 * - Cancelamento de reservas
 * 
 * Implementa as regras essenciais da rifa online.
 */

// ✅ CONSTANTE: Valor por número em reais
const VALOR_POR_NUMERO = 5.00;

function reservarNumeros(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Rifa');

    if (!sheet) throw new Error('Aba "Rifa" não encontrada');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Nenhum número cadastrado na rifa');

    // 🔒 VERIFICAÇÃO RIGOROSA: Buscar dados atualizados em tempo real
    const numerosRange = sheet.getRange('A2:H' + lastRow); // ✅ MUDANÇA: Incluir coluna H
    const todosOsDados = numerosRange.getValues();

    // Verificar disponibilidade COM BLOQUEIO
    const indisponiveis = [];
    dados.numeros.forEach(num => {
      const numStr = num.padStart(3, '0');

      for (let i = 0; i < todosOsDados.length; i++) {
        const linha = todosOsDados[i];
        const numeroPlanilha = linha[0].toString().trim().padStart(3, '0');

        if (numeroPlanilha === numStr) {
          const statusAtual = linha[3]; // Coluna D - Status

          // ❌ REJEITAR se não estiver disponível
          if (statusAtual !== 'Disponível') {
            indisponiveis.push(numStr);
            console.log(`❌ Número ${numStr} indisponível - Status: ${statusAtual}`);
          }
          break;
        }
      }
    });

    // 🛑 PARAR AQUI se houver conflitos - NÃO MODIFICAR NADA
    if (indisponiveis.length > 0) {
      throw new Error(`Os seguintes números não estão mais disponíveis: ${indisponiveis.join(', ')}`);
    }

    // ✅ APENAS AGORA fazer as alterações (números confirmados como disponíveis)
    dados.numeros.forEach(num => {
      const numStr = num.padStart(3, '0');

      for (let i = 0; i < todosOsDados.length; i++) {
        const linha = todosOsDados[i];
        const numeroPlanilha = linha[0].toString().trim().padStart(3, '0');

        if (numeroPlanilha === numStr) {
          const row = i + 2;

          // Fazer TODAS as alterações de uma vez
          sheet.getRange(row, 2).setValue(dados.nome);     // Coluna B - Nome
          sheet.getRange(row, 3).setValue(dados.telefone); // Coluna C - Telefone
          sheet.getRange(row, 4).setValue('Pré-reservado');// Coluna D - Status
          sheet.getRange(row, 6).setValue(new Date());     // Coluna F - Timestamp
          sheet.getRange(row, 7).setValue(dados.userId);   // Coluna G - User ID
          sheet.getRange(row, 8).setValue(dados.codigo);   // ✅ NOVA LINHA: Coluna H - Código

          console.log(`✅ Número ${numStr} pré-reservado para ${dados.nome} - Código: ${dados.codigo}`);
          break;
        }
      }
    });

    SpreadsheetApp.flush(); // Forçar atualização
    return { success: true };

  } catch (error) {
    console.error('❌ Erro em reservarNumeros:', error);
    throw error; // Re-lançar o erro sem modificar dados
  }
}

// Adicione apenas esta parte ao final da função salvarComprovante no seu RIFASERVICE.GS:

function salvarComprovante(dados) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');
    const { nome, telefone, numeros, fileName, mimeType, data, userId } = dados;

    console.log('🔄 Iniciando salvarComprovante:', { nome, telefone, numeros, userId });

    const lastRow = sheet.getLastRow();
    const linhas = sheet.getRange('A2:H' + lastRow).getValues();

    const numerosValidos = [];
    const numerosConflito = [];
    let codigoRecibo = ''; // Para capturar o código da coluna H

    // PRIMEIRA FASE: Apenas VERIFICAR
    numeros.forEach(numero => {
      const numStr = numero.padStart(3, '0');
      let numeroEncontrado = false;

      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const numPlanilha = linha[0].toString().trim().padStart(3, '0');

        if (numPlanilha === numStr) {
          numeroEncontrado = true;
          const statusAtual = linha[3];
          const userIdPlanilha = linha[6];
          const codigoLinha = linha[7]; // Coluna H - Código

          console.log(`📋 Verificando ${numStr} - Status: "${statusAtual}", UserID: "${userIdPlanilha}"`);

          if (statusAtual === 'Pré-reservado' && userIdPlanilha === userId) {
            numerosValidos.push({ numero: numStr, linha: i });

            // Capturar código para usar como recibo
            if (!codigoRecibo && codigoLinha) {
              codigoRecibo = codigoLinha.toString().trim();
            }

            console.log(`✅ Número ${numStr} VÁLIDO para compra`);
          } else {
            numerosConflito.push(numStr);
            console.log(`❌ Número ${numStr} em CONFLITO`);
          }
          break;
        }
      }

      if (!numeroEncontrado) {
        numerosConflito.push(numStr);
        console.log(`❌ Número ${numStr} NÃO ENCONTRADO`);
      }
    });

    if (numerosConflito.length > 0) {
      const mensagem = `Os seguintes números não estão mais disponíveis: ${numerosConflito.join(', ')}. Selecione outros números.`;
      console.log('❌ CONFLITO DETECTADO:', mensagem);
      throw new Error(mensagem);
    }

    if (numerosValidos.length === 0) {
      const mensagem = 'Nenhum número válido encontrado para compra.';
      console.log('❌ SEM NÚMEROS VÁLIDOS:', mensagem);
      throw new Error(mensagem);
    }

    // SEGUNDA FASE: Modificar a planilha
    console.log('💾 Salvando comprovante no Drive...');
    const blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, fileName);
    const pasta = DriveApp.getFolderById(FOLDER_ID);
    const arquivo = pasta.createFile(blob);
    const arquivoId = arquivo.getId();
    const url = arquivo.getUrl();
    console.log('✅ Comprovante salvo:', url);

    // ===== VALIDAÇÃO OCR =====
    console.log('🔍 Iniciando validação OCR do comprovante...');

    // Obter timestamp da reserva (coluna F do primeiro número)
    const primeiroNumero = numerosValidos[0];
    const timestampReserva = sheet.getRange(primeiroNumero.linha + 2, 6).getValue();

    const dadosValidacao = {
      valorEsperado: numerosValidos.length * VALOR_POR_NUMERO,
      timestampReserva: timestampReserva || new Date(Date.now() - 10 * 60 * 1000), // fallback: 10 min atrás
      identificadorPix: codigoRecibo ? `RifaNotebook${codigoRecibo}` : null
    };

    console.log(`📊 Dados para validação:`, dadosValidacao);

    const resultadoValidacao = validarComprovanteCompleto(arquivoId, dadosValidacao);

    if (!resultadoValidacao.valido) {
      console.log(`❌ Validação OCR FALHOU: ${resultadoValidacao.status} - ${resultadoValidacao.motivo}`);

      // Mover arquivos para pasta Suspeitos
      moverParaSuspeitos(arquivoId, resultadoValidacao.docOCRId, resultadoValidacao.status);

      // NOVO: Logar na planilha "Suspeitos"
      logarTentativaSuspeita({
        nome: nome,
        telefone: telefone,
        userId: userId,
        numeros: numerosValidos.map(n => String(n.numero).padStart(3, '0')).join(', '), // ✅ Formatar com 3 dígitos
        codigo: codigoRecibo || 'N/A',
        motivo: resultadoValidacao.motivo,
        linkImagem: url,
        linkOCR: resultadoValidacao.docOCRId ? `https://docs.google.com/document/d/${resultadoValidacao.docOCRId}` : 'Não gerado'
      });

      // Lançar erro com prefixo para o frontend identificar
      throw new Error(`COMPROVANTE_${resultadoValidacao.status}: ${resultadoValidacao.motivo}`);
    }

    console.log('✅ Validação OCR APROVADA');
    // ===== FIM VALIDAÇÃO OCR =====

    // Atualizar planilha para "Reservado"
    numerosValidos.forEach(({ numero, linha }) => {
      const row = linha + 2;

      console.log(`🔄 Finalizando compra - Linha ${row}, Número ${numero}`);

      sheet.getRange(row, 2).setValue(nome);
      sheet.getRange(row, 3).setValue(telefone);
      sheet.getRange(row, 4).setValue('Reservado');
      sheet.getRange(row, 5).setValue(url);
      sheet.getRange(row, 6).setValue(new Date());
      sheet.getRange(row, 7).setValue(userId);
      // Manter o código na coluna H

      console.log(`✅ Compra finalizada para número ${numero}`);
    });

    SpreadsheetApp.flush();
    console.log('✅ Operação de compra concluída com sucesso');

    // 🎉 ENVIAR CONFIRMAÇÃO VIA WHATSAPP COM VALOR
    try {
      if (codigoRecibo) {
        console.log('📱 Enviando confirmação via WhatsApp...');

        const numerosComprados = numerosValidos.map(item => item.numero);

        // ✅ CALCULAR VALOR TOTAL usando a constante
        const valorTotal = numerosComprados.length * VALOR_POR_NUMERO;
        console.log(`💰 Valor total calculado: R$ ${valorTotal.toFixed(2)} (${numerosComprados.length} números × R$ ${VALOR_POR_NUMERO.toFixed(2)})`);

        const resultadoWhatsApp = enviarConfirmacaoCompra(nome, telefone, numerosComprados, codigoRecibo, valorTotal);

        if (resultadoWhatsApp.success) {
          console.log('✅ Confirmação enviada via WhatsApp com sucesso!');
        } else {
          console.warn('⚠️ Falha ao enviar confirmação via WhatsApp:', resultadoWhatsApp.error);
        }
      } else {
        console.warn('⚠️ Código não encontrado, confirmação não enviada');
      }
    } catch (errorWhatsApp) {
      console.error('❌ Erro ao enviar confirmação via WhatsApp:', errorWhatsApp);
      // Não interrompe o fluxo - compra já foi processada
    }

    return true;

  } catch (error) {
    console.error('❌ Erro em salvarComprovante:', error);
    throw error;
  }
}

function cancelarReserva(dados) {
  try {
    console.log('🔄 Iniciando cancelarReserva com dados:', dados);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Rifa');

    if (!sheet) throw new Error('Aba "Rifa" não encontrada');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      console.log('⚠️ Nenhuma linha de dados encontrada');
      return { success: false, message: 'Nenhuma linha de dados encontrada' };
    }

    // Expandir o range para incluir a coluna H (Código)
    const range = sheet.getRange('A2:H' + lastRow);
    const values = range.getValues();

    let numerosProcessados = 0;
    let numerosCancelados = [];
    let numerosNaoEncontrados = [];

    dados.numeros.forEach(num => {
      const numStr = num.toString().padStart(3, '0');
      console.log(`🔍 Processando número: ${numStr}`);
      let numeroEncontrado = false;

      for (let i = 0; i < values.length; i++) {
        const linha = values[i];
        const numeroPlanilha = linha[0].toString().trim().padStart(3, '0');

        if (numeroPlanilha === numStr) {
          numeroEncontrado = true;
          const row = i + 2;
          const statusAtual = linha[3];
          const userIdAtual = linha[6];
          const nomeAtual = linha[1];
          const telefoneAtual = linha[2];

          console.log(`📋 Número ${numStr} - Status: ${statusAtual}, UserID: ${userIdAtual}`);

          // ✅ VERIFICAÇÃO RIGOROSA: Só cancelar se for REALMENTE do usuário
          const pertenceAoUsuario = (
            // Prioridade 1: UserID exato
            (dados.userId && userIdAtual === dados.userId) ||
            // Prioridade 2: Nome E telefone exatos (se não tiver userId)
            (!dados.userId && nomeAtual === dados.nome && telefoneAtual === dados.telefone)
          );

          const podeSerCancelado = (
            statusAtual === 'Pré-reservado' && pertenceAoUsuario
          );

          if (podeSerCancelado) {
            console.log(`✅ Cancelando número ${numStr} - Pertence ao usuário`);

            // Limpar TODOS os dados da pré-reserva, incluindo o código
            sheet.getRange(row, 2).setValue(''); // Nome
            sheet.getRange(row, 3).setValue(''); // Telefone
            sheet.getRange(row, 4).setValue('Disponível'); // Status
            sheet.getRange(row, 6).setValue(''); // Timestamp
            sheet.getRange(row, 7).setValue(''); // User ID
            sheet.getRange(row, 8).setValue(''); // Código (coluna H)

            numerosCancelados.push(numStr);
            numerosProcessados++;
          } else {
            console.log(`❌ Número ${numStr} NÃO pode ser cancelado:`);
            console.log(`   Status: ${statusAtual}`);
            console.log(`   Pertence ao usuário: ${pertenceAoUsuario}`);
            console.log(`   UserID planilha: ${userIdAtual} vs Solicitado: ${dados.userId}`);
          }

          break;
        }
      }

      if (!numeroEncontrado) {
        console.log(`⚠️ Número ${numStr} não encontrado na planilha`);
        numerosNaoEncontrados.push(numStr);
      }
    });

    // Forçar atualização apenas se houve mudanças
    if (numerosProcessados > 0) {
      SpreadsheetApp.flush();
    }

    const resultado = {
      success: numerosProcessados > 0,
      numerosProcessados: numerosProcessados,
      numerosCancelados: numerosCancelados,
      numerosNaoEncontrados: numerosNaoEncontrados,
      message: numerosProcessados > 0 ?
        `${numerosProcessados} números cancelados com sucesso` :
        'Nenhum número foi cancelado (não pertencem ao usuário ou não estão pré-reservados)'
    };

    console.log('🏁 Resultado do cancelamento:', resultado);
    return resultado;

  } catch (error) {
    console.error('❌ Erro em cancelarReserva:', error);
    return {
      success: false,
      error: error.toString(),
      message: 'Erro ao cancelar reserva'
    };
  }
}

// Manter função antiga para compatibilidade (sem filtro de usuário)
function getDadosRifa() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Rifa');

    if (!sheet) {
      console.error('Aba "Rifa" não encontrada');
      return { numeros: [], indisponiveis: [], comprados: [] };
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      console.log('Nenhum dado encontrado na planilha');
      return { numeros: [], indisponiveis: [], comprados: [] };
    }

    const dados = sheet.getRange('A2:E' + lastRow).getDisplayValues();

    const resultado = {
      numeros: [],
      indisponiveis: [],
      comprados: []
    };

    dados.forEach(row => {
      if (row[0]) {
        const numero = row[0].toString().trim();
        resultado.numeros.push(numero);

        const status = row[3];
        if (status && status !== 'Disponível') {
          resultado.indisponiveis.push(numero);
        }
      }
    });

    console.log('Dados carregados (função antiga):', resultado);
    return resultado;

  } catch (error) {
    console.error('Erro em getDadosRifa:', error);
    return { numeros: [], indisponiveis: [], comprados: [] };
  }
}

/**
 * 🎉 FUNÇÃO ATUALIZADA: Enviar confirmação de compra via WhatsApp com valor
 * Envia mensagem de confirmação após compra concluída incluindo o valor total
 * 
 * @param {string} nome - Nome do comprador
 * @param {string} telefone - Telefone do comprador (já validado)
 * @param {Array<string>} numeros - Array com números comprados
 * @param {string} codigoRecibo - Código único do recibo/compra
 * @param {number} valorTotal - Valor total da compra em R$
 * @returns {Object} - Resultado do envio
 */
function enviarConfirmacaoCompra(nome, telefone, numeros, codigoRecibo, valorTotal) {
  try {
    console.log('🎉 Enviando confirmação de compra via WhatsApp:', {
      nome: nome,
      telefone: telefone,
      numeros: numeros,
      codigoRecibo: codigoRecibo,
      valorTotal: valorTotal
    });

    // Formatar telefone (adicionar 55 se não tiver)
    let telefoneFormatado = telefone.replace(/\D/g, '');
    if (!telefoneFormatado.startsWith('55')) {
      telefoneFormatado = '55' + telefoneFormatado;
    }

    // Formatar lista de números de forma elegante
    let numerosTexto = '';
    if (numeros.length === 1) {
      numerosTexto = `número *${numeros[0]}*`;
    } else if (numeros.length <= 3) {
      // Para poucos números, mostrar todos
      numerosTexto = `números *${numeros.join(', ')}*`;
    } else {
      // Para muitos números, mostrar quantidade
      numerosTexto = `*${numeros.length} números* (${numeros.slice(0, 3).join(', ')}, ...)`;
    }

    // Formatar valor monetário
    const valorFormatado = valorTotal.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    // Montar mensagem de confirmação com valor
    const mensagem = `🎉 *Compra Confirmada!*\n\nOlá ${nome}!\n\nSua compra do${numeros.length > 1 ? 's' : ''} ${numerosTexto}, no valor de *${valorFormatado}*, foi concluída com sucesso! ✅\n\n📄 *Código do recibo:* ${codigoRecibo}\n\n🍀 Agradecemos pela participação e desejamos boa sorte!\n\n_Guarde este código para consultas futuras._`;

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

    // Verificar códigos de erro HTTP
    if (codigoHttp < 200 || codigoHttp >= 300) {
      let mensagemErro = 'Erro desconhecido';

      switch (codigoHttp) {
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

      console.warn(`⚠️ Erro ao enviar confirmação (HTTP ${codigoHttp}):`, mensagemErro);
      throw new Error(mensagemErro);
    }

    // Verificar se a API retornou erro específico
    if (resultado.error || (resultado.status && resultado.status === 'error')) {
      const mensagemErro = resultado.message || resultado.error || 'Erro ao enviar confirmação';
      console.warn('⚠️ Erro na API ao enviar confirmação:', mensagemErro);
      throw new Error(mensagemErro);
    }

    console.log('✅ Confirmação de compra enviada com sucesso (HTTP ' + codigoHttp + '):', resultado);
    return {
      success: true,
      resultado: resultado,
      message: 'Confirmação enviada via WhatsApp com sucesso'
    };

  } catch (error) {
    console.error('❌ Erro ao enviar confirmação de compra:', error);

    // ⚠️ IMPORTANTE: Não interromper o fluxo principal por erro no WhatsApp
    // A compra já foi processada, o WhatsApp é apenas uma cortesia

    // Tratar erros específicos para log
    const mensagemErro = error.toString();
    let tipoErro = 'Erro genérico';

    if (mensagemErro.includes('404') || mensagemErro.includes('not found')) {
      tipoErro = 'Número não reconhecido';
    } else if (mensagemErro.includes('502') || mensagemErro.includes('bad gateway')) {
      tipoErro = 'Sistema temporariamente indisponível';
    } else if (mensagemErro.includes('timeout')) {
      tipoErro = 'Timeout na requisição';
    }

    console.warn(`⚠️ Falha na confirmação via WhatsApp (${tipoErro}):`, mensagemErro);

    return {
      success: false,
      error: mensagemErro,
      tipo: tipoErro,
      message: 'Erro ao enviar confirmação via WhatsApp (compra processada normalmente)'
    };
  }
}

/**
 * Logar tentativa suspeita na aba "Suspeitos"
 */
function logarTentativaSuspeita(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Suspeitos');

    // Criar aba se não existir
    if (!sheet) {
      sheet = ss.insertSheet('Suspeitos');
      // Nova estrutura com coluna Números (E)
      sheet.appendRow(['Data/Hora', 'Nome', 'Telefone', 'User ID', 'Números', 'Código/Reserva', 'Motivo Falha', 'Link Imagem', 'Link OCR']);
      sheet.getRange('A1:I1').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // ✅ Verificar se precisa atualizar cabeçalho (inserir coluna Números se faltar)
      const headerE = sheet.getRange('E1').getValue();
      if (headerE !== 'Números') {
        // Se a coluna E não for "Números" (provavelmente é "Código/Reserva" do formato antigo)
        console.log('📝 Atualizando estrutura da aba Suspeitos (Inserindo coluna Números)...');
        sheet.insertColumnAfter(4); // Inserir após coluna D (User ID)
        sheet.getRange('E1').setValue('Números').setFontWeight('bold');
      }
    }

    sheet.appendRow([
      new Date(),
      dados.nome,
      dados.telefone,
      dados.userId,
      dados.numeros, // ✅ Nova coluna (será formatada abaixo)
      dados.codigo,
      dados.motivo,
      dados.linkImagem,
      dados.linkOCR
    ]);

    // ✅ CORREÇÃO: Forçar formatação de texto para manter zeros à esquerda (ex: "001")
    // O appendRow pode converter strings numéricas simples em números, ignorando zeros.
    const lastRow = sheet.getLastRow();

    // Formatar Coluna E (Números)
    const cellNumeros = sheet.getRange(lastRow, 5);
    cellNumeros.setNumberFormat('@').setValue(dados.numeros);

    // Formatar Coluna F (Código/Reserva) - ✅ NOVA CORREÇÃO
    const cellCodigo = sheet.getRange(lastRow, 6);
    cellCodigo.setNumberFormat('@').setValue(dados.codigo);

    console.log('📝 Tentativa suspeita registrada na planilha');

  } catch (e) {
    console.error('❌ Erro ao logar suspeito:', e);
  }
}