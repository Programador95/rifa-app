/**
 * OCRService.js (anteriormente OCRTest.js)
 * 
 * Serviço de validação de comprovantes usando OCR do Google Docs.
 * 
 * CAMADAS DE VALIDAÇÃO:
 * 1. Texto extraível? (FALSO se não)
 * 2. Contém "eduardo" E "pagseguro"? (INVÁLIDO se não)
 * 3. Contém termo de sucesso (concluído/enviado/sucesso)? (INVÁLIDO se não)
 * 4. Contém 2+ palavras-chave gerais? (INVÁLIDO se não)
 * 5. Valor bate com esperado? (INVÁLIDO se não)
 * 6. Data/hora posterior à reserva? (INVÁLIDO se não)
 * 7. Identificador PIX correto? (INVÁLIDO se não)
 */

// ============================================================================
// CONSTANTES DE VALIDAÇÃO
// ============================================================================

const PALAVRAS_OBRIGATORIAS = ['eduardo', 'pagseguro'];

// Termos que indicam finalização com sucesso (evita agendamentos/telas prévias)
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
    'pix',
    'enviado',
    'concluído',
    'concluido',
    'efetuado',
    'comprovante',
    'recebedor',
    'transação',
    'transacao',
    'efetivado',
    'pagamento',
    'transferência',
    'transferencia',
    'valor',
    'data',
    'hora',
    'agência',
    'agencia',
    'conta',
    'banco',
    'chave',
    'id'
];

const MIN_PALAVRAS_CHAVE = 2;

// ============================================================================
// FUNÇÃO PRINCIPAL: Validação Completa do Comprovante
// ============================================================================

/**
 * Executa todas as camadas de validação em um comprovante
 * 
 * @param {string} arquivoId - ID do arquivo original (imagem/PDF)
 * @param {Object} dadosValidacao - Dados para validação
 * @param {number} dadosValidacao.valorEsperado - Valor esperado do comprovante
 * @param {Date} dadosValidacao.timestampReserva - Timestamp do início da reserva
 * @param {string} dadosValidacao.identificadorPix - Identificador PIX esperado (ex: RifaNotebook000111)
 * @returns {Object} Resultado da validação completa
 */
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

        // CAMADA 2: Contém palavras obrigatórias (eduardo E pagseguro)?
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
        Logger.log(`✅ CAMADA 2: Palavras obrigatórias encontradas: ${palavrasObrigatoriasEncontradas.join(', ')}`);

        // CAMADA 3: Contém termo de sucesso? (Anti-agendamento)
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
                docOCRId: docOCRId,
                detalhes: { termosSucessoEncontrados }
            };
        }
        Logger.log(`✅ CAMADA 3: Termo de sucesso encontrado: ${termosSucessoEncontrados[0]}`);

        // CAMADA 4: Contém 2+ palavras-chave gerais?
        const palavrasChaveEncontradas = [];
        PALAVRAS_CHAVE_PIX.forEach(palavra => {
            if (textoLower.includes(palavra)) {
                palavrasChaveEncontradas.push(palavra);
            }
        });

        if (palavrasChaveEncontradas.length < MIN_PALAVRAS_CHAVE) {
            Logger.log(`❌ CAMADA 4 FALHOU: Apenas ${palavrasChaveEncontradas.length} palavras-chave (mínimo: ${MIN_PALAVRAS_CHAVE})`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: `Apenas ${palavrasChaveEncontradas.length} palavra(s)-chave extra(s) encontrada(s). Comprovante muito ilegível.`,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId,
                detalhes: { palavrasChaveEncontradas }
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
        Logger.log(`✅ CAMADA 5: Valor R$ ${validacaoValor.valorEncontrado} confere com esperado`);

        // CAMADA 6: Data/hora posterior à reserva?
        const validacaoData = validarDataComprovante(textoExtraido, dadosValidacao.timestampReserva);
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
        Logger.log(`✅ CAMADA 6: Data/hora ${validacaoData.dataEncontrada} é posterior à reserva`);

        // CAMADA 7: Identificador PIX correto?
        const validacaoIdentificador = validarIdentificadorPix(textoExtraido, dadosValidacao.identificadorPix);
        if (!validacaoIdentificador.valido) {
            Logger.log(`❌ CAMADA 7 FALHOU: ${validacaoIdentificador.motivo}`);
            return {
                valido: false,
                status: 'INVALIDO',
                motivo: validacaoIdentificador.motivo,
                arquivoOriginalId: arquivoId,
                docOCRId: docOCRId,
                detalhes: { identificadorEncontrado: validacaoIdentificador.identificadorEncontrado }
            };
        }
        Logger.log(`✅ CAMADA 7: Identificador PIX ${dadosValidacao.identificadorPix} encontrado`);

        // ✅ TODAS AS CAMADAS PASSARAM!
        Logger.log('========================================');
        Logger.log('✅ COMPROVANTE VÁLIDO - TODAS AS CAMADAS PASSARAM');
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
                identificadorPix: dadosValidacao.identificadorPix
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
// FUNÇÕES DE CAMADAS INDIVIDUAIS
// ============================================================================

/**
 * CAMADA 4: Validar valor no comprovante
 */
function validarValorComprovante(texto, valorEsperado) {
    try {
        // Padrões de valor: R$ XX,XX ou XX,XX ou R$XX,XX
        const regexValor = /R?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})/gi;
        const matches = texto.match(regexValor);

        if (!matches || matches.length === 0) {
            return {
                valido: false,
                motivo: 'Nenhum valor monetário encontrado no comprovante',
                valoresEncontrados: []
            };
        }

        // Converter e verificar valores encontrados
        const valoresEncontrados = [];
        for (const match of matches) {
            // Limpar e converter para número
            const valorLimpo = match.replace(/[R$\s.]/g, '').replace(',', '.');
            const valorNumerico = parseFloat(valorLimpo);

            if (!isNaN(valorNumerico) && valorNumerico > 0) {
                valoresEncontrados.push(valorNumerico);

                // Verificar se bate com esperado (tolerância de 1 centavo)
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

/**
 * CAMADA 5: Validar data/hora posterior à reserva
 */
function validarDataComprovante(texto, timestampReserva) {
    try {
        // Padrões de data: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY
        const regexData = /(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/g;
        // Padrões de hora: HH:MM ou HH:MM:SS
        const regexHora = /(\d{2}):(\d{2})(?::(\d{2}))?/g;

        const matchesData = texto.match(regexData);
        const matchesHora = texto.match(regexHora);

        if (!matchesData || matchesData.length === 0) {
            return {
                valido: false,
                motivo: 'Nenhuma data encontrada no comprovante',
                dataEncontrada: null
            };
        }

        // Pegar a primeira data encontrada
        const dataMatch = regexData.exec(texto);
        if (!dataMatch) {
            return {
                valido: false,
                motivo: 'Formato de data não reconhecido',
                dataEncontrada: null
            };
        }

        // Reset regex para pegar a hora
        regexHora.lastIndex = 0;
        const horaMatch = regexHora.exec(texto);

        let dia = parseInt(dataMatch[1]);
        let mes = parseInt(dataMatch[2]) - 1; // Mês é 0-indexed no JS
        let ano = parseInt(dataMatch[3]);

        // Corrigir ano de 2 dígitos
        if (ano < 100) {
            ano += 2000;
        }

        let hora = 0, minuto = 0, segundo = 0;
        if (horaMatch) {
            hora = parseInt(horaMatch[1]);
            minuto = parseInt(horaMatch[2]);
            segundo = horaMatch[3] ? parseInt(horaMatch[3]) : 0;
        }

        const dataComprovante = new Date(ano, mes, dia, hora, minuto, segundo);
        const dataReserva = new Date(timestampReserva);

        const dataEncontradaStr = `${dia.toString().padStart(2, '0')}/${(mes + 1).toString().padStart(2, '0')}/${ano} ${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;

        Logger.log(`Data do comprovante: ${dataComprovante}`);
        Logger.log(`Data da reserva: ${dataReserva}`);

        // Verificar se data do comprovante é posterior à reserva
        if (dataComprovante < dataReserva) {
            return {
                valido: false,
                motivo: `Comprovante é de ${dataEncontradaStr}, anterior ao início da reserva`,
                dataEncontrada: dataEncontradaStr
            };
        }

        return {
            valido: true,
            dataEncontrada: dataEncontradaStr
        };

    } catch (erro) {
        Logger.log(`Erro ao validar data: ${erro.message}`);
        // Em caso de erro, permitir passar (não bloquear por erro técnico)
        return {
            valido: true,
            motivo: 'Não foi possível validar data, prosseguindo...',
            dataEncontrada: 'N/A'
        };
    }
}

/**
 * CAMADA 6: Verificar se o identificador PIX no comprovante corresponde ao esperado
 * O identificador PIX é gerado como: RifaNotebook + código (ex: RifaNotebook000111)
 */
function validarIdentificadorPix(texto, identificadorEsperado) {
    try {
        if (!identificadorEsperado) {
            Logger.log('⚠️ Identificador PIX não fornecido, pulando validação');
            return { valido: true, motivo: 'Identificador não fornecido' };
        }

        const textoLower = texto.toLowerCase();
        const identificadorLower = identificadorEsperado.toLowerCase();

        Logger.log(`Buscando identificador: ${identificadorEsperado}`);

        // Verificar se o identificador completo está presente
        if (textoLower.includes(identificadorLower)) {
            Logger.log(`✅ Identificador PIX encontrado: ${identificadorEsperado}`);
            return {
                valido: true,
                identificadorEncontrado: identificadorEsperado
            };
        }

        // Tentar buscar padrões similares (ex: RifaNotebook com números próximos)
        const regexIdentificador = /rifanotebook(\d{3,6})/gi;
        const matches = texto.match(regexIdentificador);

        if (matches && matches.length > 0) {
            const identificadoresEncontrados = matches.join(', ');
            Logger.log(`❌ Identificadores encontrados: ${identificadoresEncontrados}, esperado: ${identificadorEsperado}`);
            return {
                valido: false,
                motivo: `Identificador PIX incorreto. Esperado: ${identificadorEsperado}. Encontrado: ${identificadoresEncontrados}`,
                identificadorEncontrado: identificadoresEncontrados
            };
        }

        // Nenhum identificador RifaNotebook encontrado
        return {
            valido: false,
            motivo: `Identificador PIX "${identificadorEsperado}" não encontrado no comprovante`,
            identificadorEncontrado: null
        };

    } catch (erro) {
        Logger.log(`Erro ao validar identificador PIX: ${erro.message}`);
        // Em caso de erro técnico, não bloquear
        return {
            valido: true,
            motivo: 'Erro na validação de identificador, prosseguindo...'
        };
    }
}

// ============================================================================
// FUNÇÕES DE OCR
// ============================================================================

/**
 * Executa OCR em um arquivo e retorna o texto extraído
 */
function executarOCREmArquivoParaValidacao(arquivoId) {
    try {
        const arquivo = DriveApp.getFileById(arquivoId);
        const mimeType = arquivo.getMimeType();

        Logger.log(`Processando arquivo: ${arquivo.getName()} (${mimeType})`);

        // Verificar tipo de arquivo
        const tiposSuportados = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/bmp',
            'application/pdf'
        ];

        if (!tiposSuportados.includes(mimeType)) {
            return {
                sucesso: false,
                erro: `Tipo de arquivo não suportado: ${mimeType}`
            };
        }

        // Criar nome único para o documento OCR
        const timestamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd_HH-mm-ss');
        const nomeDoc = `OCR_${timestamp}_${arquivo.getName().replace(/\.[^/.]+$/, '')}`;

        // Executar OCR via Drive API
        const docCriado = Drive.Files.copy(
            {
                title: nomeDoc,
                mimeType: MimeType.GOOGLE_DOCS
            },
            arquivoId,
            {
                ocr: true,
                ocrLanguage: 'pt'
            }
        );

        // Mover para a mesma pasta do original
        const pastaComprovantes = DriveApp.getFolderById(FOLDER_ID);
        const docFile = DriveApp.getFileById(docCriado.id);
        pastaComprovantes.addFile(docFile);
        DriveApp.getRootFolder().removeFile(docFile);

        // Extrair texto do documento
        const doc = DocumentApp.openById(docCriado.id);
        const texto = doc.getBody().getText();

        Logger.log(`OCR concluído. Texto extraído: ${texto.length} caracteres`);

        return {
            sucesso: true,
            texto: texto,
            docId: docCriado.id,
            docUrl: docFile.getUrl()
        };

    } catch (erro) {
        Logger.log(`Erro no OCR: ${erro.message}`);
        return {
            sucesso: false,
            erro: erro.message
        };
    }
}

// ============================================================================
// FUNÇÕES DE GERENCIAMENTO DE ARQUIVOS
// ============================================================================

/**
 * Obtém ou cria a pasta de comprovantes suspeitos
 */
function obterOuCriarPastaSuspeitos() {
    const pastaPrincipal = DriveApp.getFolderById(FOLDER_ID);
    const pastasFilhas = pastaPrincipal.getFoldersByName('Suspeitos');

    if (pastasFilhas.hasNext()) {
        return pastasFilhas.next();
    } else {
        Logger.log('Criando pasta Suspeitos...');
        return pastaPrincipal.createFolder('Suspeitos');
    }
}

/**
 * Move arquivos (original + OCR) para pasta de suspeitos
 */
function moverParaSuspeitos(arquivoOriginalId, docOCRId, status) {
    try {
        const pastaSuspeitos = obterOuCriarPastaSuspeitos();
        const pastaPrincipal = DriveApp.getFolderById(FOLDER_ID);
        const timestamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd_HH-mm');

        // Mover arquivo original
        if (arquivoOriginalId) {
            const arquivoOriginal = DriveApp.getFileById(arquivoOriginalId);
            const novoNomeOriginal = `${timestamp}_${status}_${arquivoOriginal.getName()}`;
            arquivoOriginal.setName(novoNomeOriginal);
            pastaSuspeitos.addFile(arquivoOriginal);
            pastaPrincipal.removeFile(arquivoOriginal);
            Logger.log(`Arquivo original movido: ${novoNomeOriginal}`);
        }

        // Mover documento OCR
        if (docOCRId) {
            const docOCR = DriveApp.getFileById(docOCRId);
            const novoNomeOCR = `${timestamp}_${status}_OCR_${docOCR.getName()}`;
            docOCR.setName(novoNomeOCR);
            pastaSuspeitos.addFile(docOCR);
            pastaPrincipal.removeFile(docOCR);
            Logger.log(`Documento OCR movido: ${novoNomeOCR}`);
        }

        return true;

    } catch (erro) {
        Logger.log(`Erro ao mover arquivos para Suspeitos: ${erro.message}`);
        return false;
    }
}

// ============================================================================
// FUNÇÕES DE TESTE (mantidas do OCRTest.js original)
// ============================================================================

/**
 * Função de teste principal - executa OCR em um arquivo específico
 */
function testarOCR() {
    try {
        const nomeArquivo = Browser.inputBox(
            'Teste de OCR',
            'Digite o nome COMPLETO do arquivo (com extensão):',
            Browser.Buttons.OK_CANCEL
        );

        if (nomeArquivo === 'cancel' || !nomeArquivo.trim()) {
            Browser.msgBox('Teste cancelado');
            return;
        }

        const resultado = testarValidacaoCompleta(nomeArquivo.trim());

        if (resultado.valido) {
            Browser.msgBox('Sucesso', `✅ COMPROVANTE VÁLIDO!\n\nStatus: ${resultado.status}\nMotivo: ${resultado.motivo}`, Browser.Buttons.OK);
        } else {
            Browser.msgBox('Falha', `❌ COMPROVANTE ${resultado.status}!\n\nMotivo: ${resultado.motivo}`, Browser.Buttons.OK);
        }

    } catch (erro) {
        Browser.msgBox('Erro', `Erro: ${erro.message}`, Browser.Buttons.OK);
    }
}

/**
 * Teste direto sem popup - edite o nome do arquivo abaixo
 */
function testarOCRDireto() {
    // 👇 EDITE AQUI: Nome do arquivo para testar
    const nomeArquivo = 'Comprovante1-Teste.pdf';

    Logger.log('========================================');
    Logger.log('TESTE DIRETO DE VALIDAÇÃO OCR');
    Logger.log('========================================');

    const resultado = testarValidacaoCompleta(nomeArquivo);

    Logger.log('');
    Logger.log('RESULTADO:');
    Logger.log(JSON.stringify(resultado, null, 2));

    return resultado;
}

/**
 * Executa validação completa em um arquivo pelo nome
 */
function testarValidacaoCompleta(nomeArquivo) {
    const pastaComprovantes = DriveApp.getFolderById(FOLDER_ID);
    const arquivos = pastaComprovantes.getFilesByName(nomeArquivo);

    if (!arquivos.hasNext()) {
        return {
            valido: false,
            status: 'ERRO',
            motivo: `Arquivo "${nomeArquivo}" não encontrado na pasta`
        };
    }

    const arquivo = arquivos.next();

    // Simular dados de validação para teste
    // 👇 EDITE AQUI: Configure os valores de teste
    const dadosValidacao = {
        valorEsperado: 5.00, // R$ 5,00 de teste (1 número)
        timestampReserva: new Date(Date.now() - 60 * 60 * 1000), // 1 hora atrás
        identificadorPix: 'RifaNotebook517639' // 👈 EDITE: Identificador esperado no comprovante
    };

    return validarComprovanteCompleto(arquivo.getId(), dadosValidacao);
}

/**
 * Lista arquivos disponíveis para teste
 */
function listarArquivosComprovantes() {
    try {
        const pastaComprovantes = DriveApp.getFolderById(FOLDER_ID);

        Logger.log(`=== Arquivos na pasta "${pastaComprovantes.getName()}" ===`);

        const arquivos = pastaComprovantes.getFiles();
        let contador = 0;

        while (arquivos.hasNext()) {
            const arquivo = arquivos.next();
            contador++;
            Logger.log(`${contador}. ${arquivo.getName()} (${arquivo.getMimeType()})`);
        }

        Logger.log(`\nTotal: ${contador} arquivo(s)`);

    } catch (erro) {
        Logger.log(`Erro: ${erro.message}`);
    }
}