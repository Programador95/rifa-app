/**
 * OCRService.js (8_OCRTest.js) - ATUALIZADO
 *
 * MUDANÇAS:
 * 1. ✅ Janela de validação de data expandida para 7 dias (antes era implícita)
 * 2. ✅ Sistema de HASH de comprovantes para impedir reutilização
 * 3. ✅ Novo: salvarPendente quando comprovante falha 3x (integrado com TriggerService)
 *
 * CAMADAS DE VALIDAÇÃO:
 * 1. Texto extraível?
 * 2. Contém "eduardo" E "pagseguro"?
 * 3. Contém termo de sucesso?
 * 4. Contém 2+ palavras-chave gerais?
 * 5. Valor bate com esperado?
 * 6. Data/hora posterior à reserva E dentro de 7 dias?
 * 7. Identificador PIX correto?
 * 8. ✅ NOVO: Hash do comprovante não foi usado antes?
 */

// ============================================================================
// CONSTANTES DE VALIDAÇÃO
// ============================================================================

const PALAVRAS_OBRIGATORIAS = ['eduardo', 'pagseguro'];

const PALAVRAS_SUCESSO = [
    'concluído', 'concluido',
    'enviado',
    'efetuado',
    'realizado',
    'sucesso',
    'comprovante',
    'autenticação',
    'autenticacao'
];

const PALAVRAS_CHAVE_PIX = [
    'pix', 'enviado', 'concluído', 'concluido', 'efetuado',
    'comprovante', 'recebedor', 'transação', 'transacao',
    'efetivado', 'pagamento', 'transferência', 'transferencia',
    'valor', 'data', 'hora', 'agência', 'agencia',
    'conta', 'banco', 'chave', 'id'
];

const MIN_PALAVRAS_CHAVE = 2;

// ✅ NOVO: Janela máxima de validação (7 dias)
const JANELA_VALIDACAO_DIAS = 7;
const JANELA_VALIDACAO_MS = JANELA_VALIDACAO_DIAS * 24 * 60 * 60 * 1000;

// ============================================================================
// FUNÇÃO PRINCIPAL: Validação Completa do Comprovante
// ============================================================================

function validarComprovanteCompleto(arquivoId, dadosValidacao) {
    try {
        Logger.log('========================================');
        Logger.log('INICIANDO VALIDAÇÃO COMPLETA DO COMPROVANTE');
        Logger.log('========================================');
        Logger.log(`Arquivo ID: ${arquivoId}`);
        Logger.log(`Valor esperado: R$ ${dadosValidacao.valorEsperado}`);
        Logger.log(`Timestamp reserva: ${dadosValidacao.timestampReserva}`);

        // 1. Executar OCR e extrair texto
        const resultadoOCR = executarOCREmArquivoParaValidacao(arquivoId);

        if (!resultadoOCR.sucesso) {
            return {
                valido: false,
                status: 'ERRO',
                motivo: resultadoOCR.erro,
                arquivoOriginalId: arquivoId,
                docOCRId: null
            };
        }

        const textoExtraido = resultadoOCR.texto;
        const docOCRId = resultadoOCR.docId;

        Logger.log(`Texto extraído (${textoExtraido.length} caracteres)`);

        // CAMADA 1: Texto extraível?
        if (!textoExtraido || textoExtraido.trim().length === 0) {
            Logger.log('❌ CAMADA 1 FALHOU: Nenhum texto extraído');
            return {
                valido: false,
                status: 'FALSO',
                motivo: 'Nenhum texto foi extraído do arquivo. Pode não ser um comprovante válido.',
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId
            };
        }
        Logger.log('✅ CAMADA 1: Texto extraído com sucesso');

        const textoLower = textoExtraido.toLowerCase();

        // CAMADA 2: Contém palavras obrigatórias?
        const palavrasObrigatoriasEncontradas = [];
        const palavrasObrigatoriasFaltando = [];

        PALAVRAS_OBRIGATORIAS.forEach(palavra => {
            if (textoLower.includes(palavra)) {
                palavrasObrigatoriasEncontradas.push(palavra);
            } else {
                palavrasObrigatoriasFaltando.push(palavra);
            }
        });

        if (palavrasObrigatoriasFaltando.length > 0) {
            Logger.log(`❌ CAMADA 2 FALHOU: Palavras obrigatórias faltando: ${palavrasObrigatoriasFaltando.join(', ')}`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: `Palavras obrigatórias não encontradas: ${palavrasObrigatoriasFaltando.join(', ')}`,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId,
                detalhes: { palavrasEncontradas: palavrasObrigatoriasEncontradas }
            };
        }
        Logger.log(`✅ CAMADA 2: Palavras obrigatórias encontradas`);

        // CAMADA 3: Contém termo de sucesso?
        const termosSucessoEncontrados = [];
        PALAVRAS_SUCESSO.forEach(palavra => {
            if (textoLower.includes(palavra)) {
                termosSucessoEncontrados.push(palavra);
            }
        });

        if (termosSucessoEncontrados.length === 0) {
            Logger.log(`❌ CAMADA 3 FALHOU: Nenhum termo de sucesso encontrado`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: `Comprovante inconclusivo (não diz "concluído", "enviado" ou "sucesso"). Pode ser agendamento.`,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId
            };
        }
        Logger.log(`✅ CAMADA 3: Termo de sucesso encontrado`);

        // CAMADA 4: Contém 2+ palavras-chave gerais?
        const palavrasChaveEncontradas = [];
        PALAVRAS_CHAVE_PIX.forEach(palavra => {
            if (textoLower.includes(palavra)) {
                palavrasChaveEncontradas.push(palavra);
            }
        });

        if (palavrasChaveEncontradas.length < MIN_PALAVRAS_CHAVE) {
            Logger.log(`❌ CAMADA 4 FALHOU: Apenas ${palavrasChaveEncontradas.length} palavras-chave`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: `Apenas ${palavrasChaveEncontradas.length} palavra(s)-chave encontrada(s). Comprovante muito ilegível.`,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId
            };
        }
        Logger.log(`✅ CAMADA 4: ${palavrasChaveEncontradas.length} palavras-chave encontradas`);

        // CAMADA 5: Valor bate com esperado?
        const validacaoValor = validarValorComprovante(textoExtraido, dadosValidacao.valorEsperado);
        if (!validacaoValor.valido) {
            Logger.log(`❌ CAMADA 5 FALHOU: ${validacaoValor.motivo}`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: validacaoValor.motivo,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId,
                detalhes: { valoresEncontrados: validacaoValor.valoresEncontrados }
            };
        }
        Logger.log(`✅ CAMADA 5: Valor confere`);

        // CAMADA 6: Data/hora posterior à reserva E dentro da janela de 7 dias?
        const validacaoData = validarDataComprovanteComJanela(textoExtraido, dadosValidacao.timestampReserva);
        if (!validacaoData.valido) {
            Logger.log(`❌ CAMADA 6 FALHOU: ${validacaoData.motivo}`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: validacaoData.motivo,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId,
                detalhes: { dataEncontrada: validacaoData.dataEncontrada }
            };
        }
        Logger.log(`✅ CAMADA 6: Data/hora válida dentro da janela de ${JANELA_VALIDACAO_DIAS} dias`);

        // CAMADA 7: Identificador PIX correto?
        const validacaoIdentificador = validarIdentificadorPix(textoExtraido, dadosValidacao.identificadorPix);
        if (!validacaoIdentificador.valido) {
            Logger.log(`❌ CAMADA 7 FALHOU: ${validacaoIdentificador.motivo}`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: validacaoIdentificador.motivo,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId
            };
        }
        Logger.log(`✅ CAMADA 7: Identificador PIX encontrado`);

        // ✅ CAMADA 8 (NOVA): Hash do comprovante não foi usado antes?
        const hashComprovante = gerarHashComprovante(textoExtraido);
        const validacaoHash = verificarHashComprovante(hashComprovante);
        if (!validacaoHash.valido) {
            Logger.log(`❌ CAMADA 8 FALHOU: ${validacaoHash.motivo}`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: validacaoHash.motivo,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId,
                detalhes: { hash: hashComprovante }
            };
        }

        // ✅ Registrar hash APÓS aprovação
        registrarHashComprovante(hashComprovante, dadosValidacao);
        Logger.log(`✅ CAMADA 8: Hash registrado (comprovante único)`);

        // ✅ TODAS AS CAMADAS PASSARAM!
        Logger.log('========================================');
        Logger.log('✅ COMPROVANTE VÁLIDO - TODAS AS 8 CAMADAS PASSARAM');
        Logger.log('========================================');

        return {
            valido: true,
            status: 'VALIDO',
            motivo: 'Comprovante aprovado em todas as validações',
            arquivoOriginalId: arquivoId,
            docOCRId: docOCRId,
            detalhes: {
                palavrasObrigatoriasEncontradas,
                palavrasChaveEncontradas,
                valorEncontrado: validacaoValor.valorEncontrado,
                dataEncontrada: validacaoData.dataEncontrada,
                identificadorPix: dadosValidacao.identificadorPix,
                hashComprovante: hashComprovante
            }
        };

    } catch (erro) {
        Logger.log(`❌ ERRO NA VALIDAÇÃO: ${erro.message}`);
        return {
            valido: false,
            status: 'ERRO',
            motivo: `Erro ao validar comprovante: ${erro.message}`,
            arquivoOriginalId: arquivoId,
            docOCRId: null
        };
    }
}

// ============================================================================
// ✅ NOVAS FUNÇÕES: Sistema de Hash Anti-Reuso
// ============================================================================

/**
 * Gerar hash simples do texto do comprovante
 * Usa as partes mais relevantes: valor, data, identificador
 */
function gerarHashComprovante(texto) {
    // Normalizar texto: lowercase, remover espaços extras
    const textoNormalizado = texto.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    // Extrair componentes chave para o hash
    const regexValor = /R?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})/gi;
    const valores = textoNormalizado.match(regexValor) || [];

    const regexData = /(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/g;
    const datas = textoNormalizado.match(regexData) || [];

    const regexHora = /(\d{2}):(\d{2})(?::(\d{2}))?/g;
    const horas = textoNormalizado.match(regexHora) || [];

    const regexIdentificador = /rifanotebook\d*/gi;
    const identificadores = textoNormalizado.match(regexIdentificador) || [];

    // Combinar tudo em uma string única
    const componentes = [
        ...valores,
        ...datas,
        ...horas,
        ...identificadores
    ].join('|');

    // Hash simples (djb2)
    let hash = 5381;
    for (let i = 0; i < componentes.length; i++) {
        hash = ((hash << 5) + hash) + componentes.charCodeAt(i);
        hash = hash & hash; // Converter para 32-bit
    }

    // Converter para string hexadecimal positiva
    const hashStr = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');

    Logger.log(`🔑 Hash gerado: ${hashStr} (de: ${componentes.substring(0, 50)}...)`);
    return hashStr;
}

/**
 * Verificar se o hash já foi usado
 * Busca na coluna F (Hash Comprovante) da aba Rifa em linhas com status "Reservado".
 * A aba HashComprovantes foi eliminada — a Rifa é a fonte da verdade.
 */
function verificarHashComprovante(hash) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const rifaSheet = ss.getSheetByName('Rifa');

        if (!rifaSheet) {
            Logger.log('⚠️ Aba Rifa não encontrada na verificação de hash');
            return { valido: true };
        }

        const lastRow = rifaSheet.getLastRow();
        if (lastRow < 2) {
            return { valido: true };
        }

        // Ler coluna D (Status=índice 3) e coluna F (Hash=índice 5)
        // A: Número(0) | B: Nome(1) | C: Telefone(2) | D: Status(3) | E: Comprovante(4)
        // F: Hash Comprovante(5) | G: Timestamp(6) | H: User ID(7) | I: Código(8)
        const dados = rifaSheet.getRange('A2:F' + lastRow).getValues();

        for (let i = 0; i < dados.length; i++) {
            const statusLinha = dados[i][3] ? dados[i][3].toString().trim() : '';
            const hashLinha   = dados[i][5] ? dados[i][5].toString().trim() : '';

            // Só verificar linhas já reservadas (compra concluída)
            if (statusLinha === 'Reservado' && hashLinha === hash) {
                Logger.log(`❌ Hash ${hash} já utilizado (Rifa linha ${i + 2})`);
                return {
                    valido: false,
                    motivo: 'Este comprovante já foi utilizado em outra validação. Cada PIX só pode ser usado uma vez.'
                };
            }
        }

        return { valido: true };

    } catch (error) {
        Logger.log(`⚠️ Erro ao verificar hash: ${error.message}`);
        // Em caso de erro, permitir (não bloquear por erro técnico)
        return { valido: true };
    }
}

/**
 * Registrar hash do comprovante aprovado.
 * O hash é gravado diretamente na coluna F da linha do número na aba Rifa
 * pelo salvarComprovante — esta função é mantida apenas como no-op de compatibilidade.
 * A aba HashComprovantes foi eliminada.
 */
function registrarHashComprovante(hash, dadosValidacao) {
    // Hash já será gravado na col F da Rifa por salvarComprovante após aprovação.
    // Não é necessário gravar em aba separada.
    Logger.log(`✅ Hash ${hash} será registrado na aba Rifa pelo salvarComprovante`);
}

// ============================================================================
// ✅ FUNÇÃO ATUALIZADA: Validar data COM janela de 7 dias
// ============================================================================

function validarDataComprovanteComJanela(texto, timestampReserva) {
    try {
        const regexData = /(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/g;
        const regexHora = /(\d{2}):(\d{2})(?::(\d{2}))?/g;

        const matchesData = texto.match(regexData);

        if (!matchesData || matchesData.length === 0) {
            return {
                valido: false,
                motivo: 'Nenhuma data encontrada no comprovante',
                dataEncontrada: null
            };
        }

        // Reset regex
        regexData.lastIndex = 0;
        const dataMatch = regexData.exec(texto);
        if (!dataMatch) {
            return {
                valido: false,
                motivo: 'Formato de data não reconhecido',
                dataEncontrada: null
            };
        }

        regexHora.lastIndex = 0;
        const horaMatch = regexHora.exec(texto);

        let dia = parseInt(dataMatch[1]);
        let mes = parseInt(dataMatch[2]) - 1;
        let ano = parseInt(dataMatch[3]);

        if (ano < 100) ano += 2000;

        let hora = 0, minuto = 0, segundo = 0;
        if (horaMatch) {
            hora = parseInt(horaMatch[1]);
            minuto = parseInt(horaMatch[2]);
            segundo = horaMatch[3] ? parseInt(horaMatch[3]) : 0;
        }

        const dataComprovante = new Date(ano, mes, dia, hora, minuto, segundo);
        const dataReserva = new Date(timestampReserva);
        const agora = new Date();

        const dataEncontradaStr = `${dia.toString().padStart(2, '0')}/${(mes + 1).toString().padStart(2, '0')}/${ano} ${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;

        Logger.log(`Data do comprovante: ${dataComprovante}`);
        Logger.log(`Data da reserva: ${dataReserva}`);
        Logger.log(`Data atual: ${agora}`);

        // Verificação 1: Data do comprovante deve ser POSTERIOR à reserva
        if (dataComprovante < dataReserva) {
            return {
                valido: false,
                motivo: `Comprovante é de ${dataEncontradaStr}, anterior ao início da reserva`,
                dataEncontrada: dataEncontradaStr
            };
        }

        // ✅ Verificação 2 (NOVA): Data do comprovante deve estar dentro da janela de 7 dias
        const limiteMaximo = new Date(dataReserva.getTime() + JANELA_VALIDACAO_MS);
        if (dataComprovante > limiteMaximo) {
            return {
                valido: false,
                motivo: `Comprovante é de ${dataEncontradaStr}, fora da janela de ${JANELA_VALIDACAO_DIAS} dias após a reserva`,
                dataEncontrada: dataEncontradaStr
            };
        }

        return {
            valido: true,
            dataEncontrada: dataEncontradaStr
        };

    } catch (erro) {
        Logger.log(`Erro ao validar data: ${erro.message}`);
        return {
            valido: true,
            motivo: 'Não foi possível validar data, prosseguindo...',
            dataEncontrada: 'N/A'
        };
    }
}

// ============================================================================
// FUNÇÕES EXISTENTES (sem alteração)
// ============================================================================

function validarValorComprovante(texto, valorEsperado) {
    try {
        const regexValor = /R?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})/gi;
        const matches = texto.match(regexValor);

        if (!matches || matches.length === 0) {
            return {
                valido: false,
                motivo: 'Nenhum valor monetário encontrado no comprovante',
                valoresEncontrados: []
            };
        }

        const valoresEncontrados = [];
        for (const match of matches) {
            const valorLimpo = match.replace(/[R$\s.]/g, '').replace(',', '.');
            const valorNumerico = parseFloat(valorLimpo);

            if (!isNaN(valorNumerico) && valorNumerico > 0) {
                valoresEncontrados.push(valorNumerico);

                if (Math.abs(valorNumerico - valorEsperado) < 0.02) {
                    return {
                        valido: true,
                        valorEncontrado: valorNumerico,
                        valoresEncontrados
                    };
                }
            }
        }

        return {
            valido: false,
            motivo: `Valor esperado R$ ${valorEsperado.toFixed(2)} não encontrado. Valores no comprovante: R$ ${valoresEncontrados.join(', R$ ')}`,
            valoresEncontrados
        };

    } catch (erro) {
        Logger.log(`Erro ao validar valor: ${erro.message}`);
        return {
            valido: false,
            motivo: `Erro ao analisar valores: ${erro.message}`,
            valoresEncontrados: []
        };
    }
}

// ✅ Manter a função antiga para compatibilidade (mas agora usa a nova com janela)
function validarDataComprovante(texto, timestampReserva) {
    return validarDataComprovanteComJanela(texto, timestampReserva);
}

function validarIdentificadorPix(texto, identificadorEsperado) {
    try {
        if (!identificadorEsperado) {
            Logger.log('⚠️ Identificador PIX não fornecido, pulando validação');
            return { valido: true, motivo: 'Identificador não fornecido' };
        }

        const textoLower = texto.toLowerCase();
        const identificadorLower = identificadorEsperado.toLowerCase();

        if (textoLower.includes(identificadorLower)) {
            return { valido: true, identificadorEncontrado: identificadorEsperado };
        }

        const regexIdentificador = /rifanotebook(\d{3,6})/gi;
        const matches = texto.match(regexIdentificador);

        if (matches && matches.length > 0) {
            const identificadoresEncontrados = matches.join(', ');
            return {
                valido: false,
                motivo: `Identificador PIX incorreto. Esperado: ${identificadorEsperado}. Encontrado: ${identificadoresEncontrados}`,
                identificadorEncontrado: identificadoresEncontrados
            };
        }

        return {
            valido: false,
            motivo: `Identificador PIX "${identificadorEsperado}" não encontrado no comprovante`,
            identificadorEncontrado: null
        };

    } catch (erro) {
        Logger.log(`Erro ao validar identificador PIX: ${erro.message}`);
        return { valido: true, motivo: 'Erro na validação de identificador, prosseguindo...' };
    }
}

// ============================================================================
// FUNÇÕES DE OCR (sem alteração)
// ============================================================================

function executarOCREmArquivoParaValidacao(arquivoId) {
    try {
        const arquivo = DriveApp.getFileById(arquivoId);
        const mimeType = arquivo.getMimeType();

        const tiposSuportados = [
            'image/jpeg', 'image/jpg', 'image/png',
            'image/gif', 'image/bmp', 'application/pdf'
        ];

        if (!tiposSuportados.includes(mimeType)) {
            return { sucesso: false, erro: `Tipo de arquivo não suportado: ${mimeType}` };
        }

        const timestamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd_HH-mm-ss');
        const nomeDoc = `OCR_${timestamp}_${arquivo.getName().replace(/\.[^/.]+$/, '')}`;

        const docCriado = Drive.Files.copy(
            { title: nomeDoc, mimeType: MimeType.GOOGLE_DOCS },
            arquivoId,
            { ocr: true, ocrLanguage: 'pt' }
        );

        const pastaComprovantes = DriveApp.getFolderById(FOLDER_ID);
        const docFile = DriveApp.getFileById(docCriado.id);
        pastaComprovantes.addFile(docFile);
        DriveApp.getRootFolder().removeFile(docFile);

        const doc = DocumentApp.openById(docCriado.id);
        const texto = doc.getBody().getText();

        return { sucesso: true, texto: texto, docId: docCriado.id, docUrl: docFile.getUrl() };

    } catch (erro) {
        Logger.log(`Erro no OCR: ${erro.message}`);
        return { sucesso: false, erro: erro.message };
    }
}

function obterOuCriarPastaSuspeitos() {
    const pastaPrincipal = DriveApp.getFolderById(FOLDER_ID);
    const pastasFilhas = pastaPrincipal.getFoldersByName('Suspeitos');
    if (pastasFilhas.hasNext()) return pastasFilhas.next();
    return pastaPrincipal.createFolder('Suspeitos');
}

function moverParaSuspeitos(arquivoOriginalId, docOCRId, status) {
    try {
        const pastaSuspeitos = obterOuCriarPastaSuspeitos();
        const pastaPrincipal = DriveApp.getFolderById(FOLDER_ID);
        const timestamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd_HH-mm');

        if (arquivoOriginalId) {
            const arquivoOriginal = DriveApp.getFileById(arquivoOriginalId);
            arquivoOriginal.setName(`${timestamp}_${status}_${arquivoOriginal.getName()}`);
            pastaSuspeitos.addFile(arquivoOriginal);
            pastaPrincipal.removeFile(arquivoOriginal);
        }

        if (docOCRId) {
            const docOCR = DriveApp.getFileById(docOCRId);
            docOCR.setName(`${timestamp}_${status}_OCR_${docOCR.getName()}`);
            pastaSuspeitos.addFile(docOCR);
            pastaPrincipal.removeFile(docOCR);
        }

        return true;
    } catch (erro) {
        Logger.log(`Erro ao mover arquivos para Suspeitos: ${erro.message}`);
        return false;
    }
}

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

function testarOCR() {
    try {
        const nomeArquivo = Browser.inputBox('Teste de OCR', 'Digite o nome do arquivo:', Browser.Buttons.OK_CANCEL);
        if (nomeArquivo === 'cancel' || !nomeArquivo.trim()) return;
        const resultado = testarValidacaoCompleta(nomeArquivo.trim());
        if (resultado.valido) {
            Browser.msgBox('Sucesso', `✅ COMPROVANTE VÁLIDO!\n\nHash: ${resultado.detalhes.hashComprovante}`, Browser.Buttons.OK);
        } else {
            Browser.msgBox('Falha', `❌ ${resultado.status}!\n\n${resultado.motivo}`, Browser.Buttons.OK);
        }
    } catch (erro) {
        Browser.msgBox('Erro', erro.message, Browser.Buttons.OK);
    }
}

function testarValidacaoCompleta(nomeArquivo) {
    const pastaComprovantes = DriveApp.getFolderById(FOLDER_ID);
    const arquivos = pastaComprovantes.getFilesByName(nomeArquivo);
    if (!arquivos.hasNext()) return { valido: false, status: 'ERRO', motivo: `Arquivo "${nomeArquivo}" não encontrado` };
    const arquivo = arquivos.next();
    const dadosValidacao = {
        valorEsperado: 5.00,
        timestampReserva: new Date(Date.now() - 60 * 60 * 1000),
        identificadorPix: 'RifaNotebook517639'
    };
    return validarComprovanteCompleto(arquivo.getId(), dadosValidacao);
}
