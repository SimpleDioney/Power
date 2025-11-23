/**
 * =================================================================================================
 * ARQUIVO DO BOT POWERSHOP - VERSÃO COM NOVAS FUNCIONALIDADES E CORREÇÕES (V37)
 * =================================================================================================
 * Implementações Chave (Conforme Solicitado nesta Atualização):
 *
 * 1.  FLUXO DE ATENDIMENTO (COMPRADOR):
 * - Implementada a reação com "❌" em mensagens/comandos inválidos durante um atendimento para
 * evitar bugs e interrupções, ignorando a ação do comando.
 * - O comando /id agora notifica os Gerenciadores de Cartão sobre a solicitação de um ID check.
 * - O comando /cartoes agora permite apagar todos os cartões com 'X' ou um cartão específico
 * pelo número, e o bug que impedia o envio do menu foi corrigido.
 *
 * 2.  FLUXO DE COMPRA (CLIENTE):
 * - Corrigido o erro crítico no fluxo de compra de esferas, permitindo que o cliente prossiga
 * após digitar a quantidade desejada.
 * - Resolvido o bug em que o bot não respondia ao digitar '1' para solicitar um novo cartão
 * após a verificação de ID do cliente em um atendimento.
 * - Corrigido o loop que ocorria quando o cliente digitava um código de convite inválido e
 * depois '0' para cancelar.
 *
 * 3.  PAGAMENTO COM CARTÃO DE CRÉDITO:
 * - O sistema agora soma a taxa fixa de 6% às taxas de parcelamento do Mercado Pago. O cálculo
 * é feito dinamicamente com base na tabela de taxas fornecida.
 *
 * 4.  CORREÇÕES GERAIS:
 * - Corrigido o bug que exigia o envio duplicado do e-mail no comando /finalizar para que o
 * pedido fosse de fato concluído.
 * =================================================================================================
 */
//[INICIO DA PARTE 1]
const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");
const qrcodeTerminal = require("qrcode-terminal");
const express = require("express");
const asaas = require("./services/asaas");


// ===== CAMADA DE COMPATIBILIDADE WPPCONNECT -> BAILEYS =====
const EventEmitter = require('events');

function createBaileysCompatibleClient(wppClient) {
    const ev = new EventEmitter();

    return {
        wppClient: wppClient,
        ev: ev,

        // Método para enviar mensagens (compatível com Baileys)
        sendMessage: async function (jid, content) {
            try {
                // Normaliza JID para formato WPPConnect (suporta @s.whatsapp.net, @lid e @g.us)
                let chatId;
                if (jid.endsWith('@g.us')) {
                    // Grupos mantêm o formato @g.us
                    chatId = jid;
                } else {
                    // Usuários individuais: converte para @c.us
                    chatId = jid.replace(/@s\.whatsapp\.net|@lid/g, '') + '@c.us';
                }

                if (content.text) {
                    // Se tiver quotedMsgId, envia com quote
                    if (content.quotedMsgId) {
                        return await wppClient.sendText(chatId, content.text, {
                            quotedMsg: content.quotedMsgId
                        });
                    } else {
                        return await wppClient.sendText(chatId, content.text);
                    }
                } else if (content.image) {
                    const caption = content.caption || '';
                    console.log(`[WPPConnect] Preparando envio de imagem para ${chatId}`);
                    if (Buffer.isBuffer(content.image)) {
                        console.log(`[WPPConnect] Imagem é Buffer com ${content.image.length} bytes`);
                        // Validação do buffer antes de converter para base64
                        if (content.image.length === 0) {
                            console.error('[WPPConnect] Buffer de imagem vazio, ignorando envio');
                            if (caption) {
                                return await wppClient.sendText(chatId, caption);
                            }
                            return null;
                        }
                        try {
                            console.log(`[WPPConnect] Convertendo buffer para base64...`);
                            const base64 = content.image.toString('base64');
                            console.log(`[WPPConnect] Base64 gerado com ${base64.length} caracteres`);
                            // Valida se o base64 foi gerado corretamente
                            if (!base64 || base64.length === 0) {
                                console.error('[WPPConnect] Base64 vazio, enviando apenas texto');
                                if (caption) {
                                    return await wppClient.sendText(chatId, caption);
                                }
                                return null;
                            }
                            // WPPConnect precisa de data URI com mime type
                            const dataUri = `data:image/jpeg;base64,${base64}`;
                            console.log(`[WPPConnect] Data URI criada, enviando via sendImageFromBase64...`);
                            return await wppClient.sendImageFromBase64(chatId, dataUri, 'image.jpg', caption);
                        } catch (error) {
                            console.error('[WPPConnect] Erro ao converter buffer para base64:', error);
                            if (caption) {
                                return await wppClient.sendText(chatId, caption);
                            }
                            return null;
                        }
                    } else if (typeof content.image === 'string') {
                        // Se for string, pode ser um caminho de arquivo
                        console.log(`[WPPConnect] Imagem é string (caminho), enviando via sendImage`);
                        return await wppClient.sendImage(chatId, content.image, 'image.jpg', caption);
                    } else {
                        console.error(`[WPPConnect] Formato de imagem desconhecido: ${typeof content.image}`);
                        if (caption) {
                            return await wppClient.sendText(chatId, caption);
                        }
                        return null;
                    }
                } else if (content.video) {
                    const caption = content.caption || '';
                    if (Buffer.isBuffer(content.video)) {
                        if (content.video.length === 0) {
                            console.error('[WPPConnect] Buffer de vídeo vazio');
                            if (caption) {
                                return await wppClient.sendText(chatId, caption);
                            }
                            return null;
                        }
                        const base64 = content.video.toString('base64');
                        const dataUri = `data:video/mp4;base64,${base64}`;
                        return await wppClient.sendVideoFromBase64(chatId, dataUri, 'video.mp4', caption);
                    } else {
                        return await wppClient.sendFile(chatId, content.video, 'video.mp4', caption);
                    }
                } else if (content.audio) {
                    if (Buffer.isBuffer(content.audio)) {
                        if (content.audio.length === 0) {
                            console.error('[WPPConnect] Buffer de áudio vazio');
                            return null;
                        }
                        const base64 = content.audio.toString('base64');
                        const dataUri = `data:audio/ogg;base64,${base64}`;
                        return await wppClient.sendVoiceBase64(chatId, dataUri);
                    } else {
                        return await wppClient.sendFile(chatId, content.audio, 'audio.ogg');
                    }
                } else if (content.document) {
                    const filename = content.fileName || 'document.pdf';
                    if (Buffer.isBuffer(content.document)) {
                        if (content.document.length === 0) {
                            console.error('[WPPConnect] Buffer de documento vazio');
                            return null;
                        }
                        const base64 = content.document.toString('base64');
                        const dataUri = `data:application/pdf;base64,${base64}`;
                        return await wppClient.sendFileFromBase64(chatId, dataUri, filename, '');
                    } else {
                        return await wppClient.sendFile(chatId, content.document, filename, '');
                    }
                }
                // MODO LEGACY: listMessage removido - não é mais suportado
                else if (content.react) {
                    // WPPConnect suporta reações, mas precisa do formato correto do messageId
                    try {
                        // Usa o ID armazenado do WPPConnect se disponível
                        const messageId = content.react.key._wppMessageId || content.react.key.id;
                        console.log('[WPPConnect] Tentando enviar reação', content.react.text, 'para mensagem:', messageId);

                        // WPPConnect espera: sendReactionToMessage(messageId, reaction)
                        return await wppClient.sendReactionToMessage(messageId, content.react.text);
                    } catch (error) {
                        console.warn('[WPPConnect] Não foi possível enviar reação:', error.message);
                        console.warn('[WPPConnect] Reação ignorada, continuando execução...');
                        // Retorna null mas não quebra o fluxo
                        return null;
                    }
                } else if (content.forward) {
                    // Para forwards, extraímos a mensagem e reenviamos
                    const forwardMsg = content.forward;
                    if (forwardMsg.message) {
                        // Recursivamente envia a mensagem original
                        return await this.sendMessage(jid, forwardMsg.message);
                    }
                }

                console.warn('Tipo de mensagem não suportado:', Object.keys(content));
                return null;
            } catch (error) {
                console.error('Erro ao enviar mensagem:', error);
                throw error;
            }
        },

        // Método para enviar lista interativa
        sendListMessage: async function (jid, options) {
            try {
                // Normaliza JID
                let chatId;
                if (jid.endsWith('@g.us')) {
                    chatId = jid;
                } else {
                    chatId = jid.replace(/@s\.whatsapp\.net|@lid/g, '') + '@c.us';
                }

                return await wppClient.sendListMessage(chatId, options);
            } catch (error) {
                console.error('Erro ao enviar lista:', error);
                throw error;
            }
        },

        // Métodos de presença (compatível com Baileys)
        presenceSubscribe: async function (jid) {
            // WPPConnect não requer subscrição de presença
            return Promise.resolve();
        },

        sendPresenceUpdate: async function (type, jid) {
            // WPPConnect gerencia presença automaticamente
            return Promise.resolve();
        },

        // Método para marcar mensagens como lidas
        readMessages: async function (keys) {
            try {
                for (const key of keys) {
                    // Suporta tanto @s.whatsapp.net quanto @lid
                    const chatId = key.remoteJid.replace(/@s\.whatsapp\.net|@lid/g, '') + '@c.us';
                    await wppClient.sendSeen(chatId);
                }
            } catch (error) {
                console.error('Erro ao marcar como lida:', error);
            }
        },

        // Compatibilidade com métodos legados
        requestAppStateSync: function () {
            return Promise.resolve();
        },

        resyncMainAppState: function () {
            return Promise.resolve();
        }
    };
}

// Função auxiliar para download de mídia (compatível com downloadMediaMessage do Baileys)
async function downloadMediaMessage(message, type) {
    try {
        if (!sockInstance || !sockInstance.wppClient) {
            console.error('[downloadMedia] Cliente WPP não disponível para download de mídia');
            return Buffer.from([]);
        }

        // Obtém o ID da mensagem para usar com downloadMedia
        const messageId = message.key?.id;
        if (!messageId) {
            console.error('[downloadMedia] ID da mensagem não encontrado');
            return Buffer.from([]);
        }

        console.log(`[downloadMedia] Baixando mídia da mensagem ${messageId}`);

        // downloadMedia retorna base64 da mídia
        const base64Data = await sockInstance.wppClient.downloadMedia(messageId);

        if (!base64Data) {
            console.warn('[downloadMedia] downloadMedia retornou vazio');
            return Buffer.from([]);
        }

        // Remove o prefixo data URI se existir (ex: "data:image/jpeg;base64,")
        let base64String = base64Data;
        if (typeof base64Data === 'string' && base64Data.includes('base64,')) {
            base64String = base64Data.split('base64,')[1];
        }

        // Converte base64 para Buffer
        const buffer = Buffer.from(base64String, 'base64');
        console.log(`[downloadMedia] Mídia baixada com sucesso: ${buffer.length} bytes`);

        return buffer;
    } catch (error) {
        console.error('[downloadMedia] Erro ao baixar mídia:', error);
        return Buffer.from([]);
    }
}

// Objeto proto para compatibilidade
const proto = {
    WebMessageInfo: {
        fromObject: function (obj) {
            return obj;
        }
    }
};

// Polyfill de DisconnectReason (não usado com WPPConnect)
const DisconnectReason = {
    loggedOut: 'logged-out'
};


// --- ESTRUTURA DE DIRETÓRIOS E ARQUIVOS ---
const DIRETORIO_DADOS = path.join(__dirname, "dados");
const DIRETORIO_AUTH = path.join(__dirname, "tokens");
const DIRETORIO_MEDIA = "./media";
const DIRETORIO_PRODUTOS = "./produtos";
const DIRETORIO_OFERTAS = path.join(DIRETORIO_PRODUTOS, "ofertas");
const DIRETORIO_ESFERAS = path.join(DIRETORIO_PRODUTOS, "esferas");
const DIRETORIO_DESCONTOS = "./descontos";
const DIRETORIO_DUVIDAS = path.join(DIRETORIO_DADOS, "duvidas");
const DIRETORIO_CONTAS_EXCLUSIVAS = path.join(DIRETORIO_PRODUTOS, "contas_exclusivas");
const DIRETORIO_TUTORIAL_VERIFY = path.join(DIRETORIO_MEDIA, "tutorial", "verify");

// === CACHE DE PERFORMANCE ===
// Cache para evitar leituras repetidas de diretórios e melhorar velocidade de resposta
const directoryCache = new Map(); // Cache de verificação de produtos/novos
const CACHE_TTL = 30000; // 30 segundos de cache

// Função auxiliar para cache com TTL
function getCached(key, fetchFunction) {
    const cached = directoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }
    const value = fetchFunction();
    directoryCache.set(key, { value, timestamp: Date.now() });
    return value;
}

function isValidEmail(email) {
    const e = String(email || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function getShopTaxes() {
    const t = shopData && shopData.taxas ? shopData.taxas : {};
    const defaults = {
        pix: 0.99,
        cartao: {
            avista: { fixa: 0.49, percentual: 1.99 },
            parcelado: {
                '2-6': { fixa: 0.49, percentual: 2.49 },
                '7-12': { fixa: 0.49, percentual: 2.99 }
            }
        }
    };
    return {
        pix: typeof t.pix === 'number' ? t.pix : defaults.pix,
        cartao: {
            avista: t.cartao && t.cartao.avista ? t.cartao.avista : defaults.cartao.avista,
            parcelado: t.cartao && t.cartao.parcelado ? t.cartao.parcelado : defaults.cartao.parcelado
        }
    };
}

function calculatePixTotalWithFees(amount) {
    const taxes = getShopTaxes();
    const fixo = Number(taxes.pix || 0);
    const total = Number(amount) + fixo;
    return Number(total.toFixed(2));
}

function getCardFeesForInstallments(installments) {
    const taxes = getShopTaxes();
    const i = parseInt(installments) || 1;
    if (i <= 1) return taxes.cartao.avista;
    if (i >= 2 && i <= 6) return taxes.cartao.parcelado['2-6'];
    return taxes.cartao.parcelado['7-12'];
}

function calculateCardTotalWithFees(amount, installments) {
    const fees = getCardFeesForInstallments(installments);
    const fixa = Number(fees.fixa || 0);
    const percentual = Number(fees.percentual || 0) / 100;
    const total = Number(amount) + fixa + (Number(amount) * percentual);
    return Number(total.toFixed(2));
}

// JSONs
const ARQUIVO_USUARIOS = path.join(DIRETORIO_DADOS, "usuarios.json");
const ARQUIVO_HISTORICO_COMPRAS = path.join(DIRETORIO_DADOS, "historico_compras.json");
const ARQUIVO_ADMINS = path.join(DIRETORIO_DADOS, "admins.json");
const ARQUIVO_COMPRADORES = path.join(DIRETORIO_DADOS, "compradores.json");
const ARQUIVO_GERENCIADORES_PRODUTO = path.join(DIRETORIO_DADOS, "gerenciadores_produto.json");
const ARQUIVO_GERENCIADORES_CARTAO = path.join(DIRETORIO_DADOS, "gerenciadores_cartao.json");
const ARQUIVO_GERENCIADORES_TROCA_REGIONAL = path.join(DIRETORIO_DADOS, "gerenciadores_troca_regional.json");
const ARQUIVO_DADOS_LOJA = path.join(DIRETORIO_DADOS, "dadosLoja.json");
const ARQUIVO_TICKETS = path.join(DIRETORIO_DADOS, "tickets.json");
const ARQUIVO_CARRINHOS = path.join(DIRETORIO_DADOS, "carrinhos.json");
const ARQUIVO_PEDIDOS = path.join(DIRETORIO_DADOS, "pedidos.json");
const ARQUIVO_PEDIDOS_V = path.join(DIRETORIO_DADOS, "pedidosv.json");
const ARQUIVO_PEDIDOS_ESPERA = path.join(DIRETORIO_DADOS, "pedidos_espera.json");
const ARQUIVO_CUPONS = path.join(DIRETORIO_DESCONTOS, "cupons.json");
const ARQUIVO_CONVITES = path.join(DIRETORIO_DESCONTOS, "convites.json");
const ARQUIVO_CHATS_ATIVOS = path.join(DIRETORIO_DADOS, "active_chats.json");
const ARQUIVO_CONTAS_EXCLUSIVAS_JSON = path.join(DIRETORIO_CONTAS_EXCLUSIVAS, "contas.json");
const ARQUIVO_EMAILS_FINALIZADOS = path.join(DIRETORIO_DADOS, "emails_finalizados.json");
const ARQUIVO_SOLICITACOES_VERIFICACAO = path.join(DIRETORIO_DADOS, "solicitacoes_verificacao.json");
const ARQUIVO_BASES_VALORES = path.join(DIRETORIO_DADOS, "bases_valores.json");
const ARQUIVO_APOIADORES = path.join(DIRETORIO_DADOS, "apoiadores.json");
const ARQUIVO_RANKINGS = path.join(DIRETORIO_DADOS, "rankings.json");
const CAMINHO_IMAGEM_MENU = path.join(DIRETORIO_MEDIA, "menu.jpeg");
const OWNER_JID = "557999076521@s.whatsapp.net";

// --- Configuração de Taxas do Asaas ---
// Nota: O Asaas cobra suas próprias taxas, sem necessidade de cálculo manual
// Taxas típicas do Asaas:
// - PIX: 0,99% por transação
// - Cartão de Crédito: 2,99% a 4,99% dependendo do plano
// - Parcelamento: As taxas já são aplicadas automaticamente pela API


// --- Configuração de Descontos Progressivos ---
const DISCOUNT_TIERS = [
    { threshold: 100, discount: 0.05, message: "seu primeiro presente: 5% de desconto!" },
    { threshold: 200, discount: 0.07, message: "aumentar seu desconto para 7%!" },
    { threshold: 300, discount: 0.10, message: "o desconto máximo de 10%!" },
];

// --- Configuração de Esferas ---
const SPHERE_PRICING = {
    'Lendário': { basePrice: 16, perSpheres: 105, discountRange: { min: 11, max: 16 }, tradeRatio: 7 },
    'Mítico': { basePrice: 18, perSpheres: 102, discountRange: { min: 13, max: 18 }, tradeRatio: 6 },
    'Heroico': { basePrice: 20, perSpheres: 100, discountRange: { min: 15, max: 20 }, tradeRatio: 5 },
};

// --- Tabela de Comida por Nível ---
const FOOD_PER_LEVEL = {
    1: 20, 2: 40, 3: 80, 4: 120, 5: 140, 6: 180, 7: 200, 8: 240, 9: 260,
    10: 580, 11: 920, 12: 1240, 13: 1560, 14: 1900, 15: 2220, 16: 2540,
    17: 2860, 18: 3200, 19: 3520, 20: 12760, 21: 22020, 22: 31260, 23: 40520,
    24: 49760, 25: 59000, 26: 68260, 27: 77500, 28: 86760, 29: 96000,
    30: 182400, 31: 268800, 32: 355200, 33: 441600, 34: 528000, 35: 614400,
    36: 700800, 37: 787200, 38: 873600, 39: 960000, 40: 1232640, 41: 1505280,
    42: 1777920, 43: 2050560, 44: 2323200, 45: 2595840, 46: 2868480, 47: 3141120,
    48: 3413760, 49: 3686400, 50: 3724800, 51: 3763200, 52: 3801600, 53: 3840000,
    54: 3878400, 55: 3916800, 56: 3955200, 57: 3993600, 58: 4032000, 59: 4070400,
    60: 4110540, 61: 4150680, 62: 4190820, 63: 4230960, 64: 4271100, 65: 4311240,
    66: 4351380, 67: 4391520, 68: 4431660, 69: 4471808
};

// Tabela de geração de comida por nível (comida por minuto)
const FARM_PER_LEVEL = {
    1: 13, 2: 18, 3: 22, 4: 26, 5: 29, 6: 31, 7: 34, 8: 36, 9: 38, 10: 40,
    11: 42, 12: 44, 13: 46, 14: 48, 15: 49, 16: 51, 17: 53, 18: 54, 19: 56, 20: 57,
    21: 58, 22: 60, 23: 61, 24: 62, 25: 64, 26: 65, 27: 66, 28: 67, 29: 69, 30: 70,
    31: 71, 32: 72, 33: 73, 34: 74, 35: 75, 36: 76, 37: 77, 38: 78, 39: 79, 40: 80
};

const userState = {};
let sockInstance;
const messageProcessing = new Set();
let activeIdChecks = {};
const recentMessagesByJid = new Map();
const inFlightMessagesByJid = new Map();
const paymentLinkMap = {};
const pixPaymentMap = {};


// Cria os diretórios necessários se não existirem
[
    DIRETORIO_DADOS,
    DIRETORIO_AUTH,
    DIRETORIO_MEDIA,
    DIRETORIO_PRODUTOS,
    DIRETORIO_OFERTAS,
    DIRETORIO_ESFERAS,
    DIRETORIO_DESCONTOS,
    DIRETORIO_DUVIDAS,
    DIRETORIO_CONTAS_EXCLUSIVAS,
    DIRETORIO_TUTORIAL_VERIFY,
    DIRETORIO_AUTH,
].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- FUNÇÕES UTILITÁRIAS ---

// Função para enviar uma mensagem de opção inválida mais informativa
async function sendInvalidOptionMessage(sock, jid, validOptions) {
    let message = "❌ Opção indisponível.";
    if (validOptions && validOptions.length > 0) {
        message += ` Por favor, digite uma das seguintes opções: ${validOptions.join(", ")}.`;
    }
    await sendMessage(sock, jid, { text: message });
}

// Suporte a novos domínios de JID do WhatsApp
function isDirectUserJid(jid) {
    return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}

function normalizeDirectJid(jid) {
    if (typeof jid === 'string' && jid.endsWith('@lid')) return jid.replace(/@lid$/, '@s.whatsapp.net');
    return jid;
}


// --- Utilitários de idioma e tradução ---
const SUPPORTED_LANGUAGES = { pt: 'Português', en: 'English', es: 'Español', hi: 'Hindi', id: 'Bahasa Indonesia' };

function getUserLanguage(jid) {
    try {
        const lang = userData?.[jid]?.language || userData?.[normalizeDirectJid(jid)]?.language;
        if (typeof lang === 'string' && SUPPORTED_LANGUAGES[lang]) return lang;
    } catch { }
    return 'pt';
}

function normalizePixKey(key) {
    const k = String(key || '').trim();
    if (/^\S+@\S+\.\S+$/.test(k)) return k;
    const digits = k.replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 14) return digits;
    return k;
}

function detectPixKeyType(alias, key) {
    const a = String(alias || '').toLowerCase();
    const k = String(key || '').trim();
    if (/^\S+@\S+\.\S+$/.test(k)) return 'EMAIL';
    const digits = k.replace(/\D/g, '');
    if (digits.length === 14) return 'CNPJ';
    if (digits.length === 11) {
        if (a.includes('cel') || a.includes('fone') || a.includes('telefone') || a.includes('whats')) return 'PHONE';
        return 'CPF';
    }
    return 'EVP';
}

// --- Formatação de moeda baseada no idioma (com taxas em tempo real) ---
const LANGUAGE_CURRENCY = {
    pt: { code: 'BRL', symbol: 'R$', fallbackRateFromBRL: 1, decimals: 2, decimalSep: ',', thousandSep: '.' },
    en: { code: 'USD', symbol: 'US$', fallbackRateFromBRL: 0.20, decimals: 2, decimalSep: '.', thousandSep: ',' },
    es: { code: 'EUR', symbol: '€', fallbackRateFromBRL: 0.18, decimals: 2, decimalSep: ',', thousandSep: '.' },
    hi: { code: 'INR', symbol: '₹', fallbackRateFromBRL: 16.50, decimals: 2, decimalSep: '.', thousandSep: ',' },
    id: { code: 'IDR', symbol: 'Rp', fallbackRateFromBRL: 3300, decimals: 0, decimalSep: '.', thousandSep: ',' }
};

let exchangeRatesCache = { data: null, timestamp: 0 };

async function fetchExchangeRates() {
    // Use BRL-IDR for Indonesian Rupiah, as IDR-BRL may not exist
    const urlPath = '/json/last/USD-BRL,EUR-BRL,INR-BRL,BRL-IDR';
    const options = { hostname: 'economia.awesomeapi.com.br', path: urlPath, method: 'GET' };
    return await new Promise((resolve) => {
        try {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed || {});
                    } catch {
                        resolve({});
                    }
                });
            });
            req.on('error', () => resolve({}));
            req.end();
        } catch {
            resolve({});
        }
    });
}

async function getRateFromBRL(targetCode) {
    if (targetCode === 'BRL') return 1;
    const now = Date.now();
    if (!exchangeRatesCache.data || (now - exchangeRatesCache.timestamp) > (5 * 60 * 1000)) {
        exchangeRatesCache.data = await fetchExchangeRates();
        exchangeRatesCache.timestamp = now;
    }
    // Prefer targetCodeBRL (e.g., USDBRL, EURBRL, INRBRL). If missing, try BRLtargetCode (e.g., BRLIDR).
    const targetCodeBRLKey = `${targetCode}BRL`;
    const brlTargetKey = `BRL${targetCode}`;

    const quote1 = exchangeRatesCache.data?.[targetCodeBRLKey]?.bid;
    const bid1 = quote1 ? parseFloat(quote1) : null;
    if (bid1 && bid1 > 0) {
        // BRL -> target: divide by BRL per 1 unit of target (e.g., BRL/USD)
        return 1 / bid1;
    }

    const quote2 = exchangeRatesCache.data?.[brlTargetKey]?.bid;
    const bid2 = quote2 ? parseFloat(quote2) : null;
    if (bid2 && bid2 > 0) {
        // BRL -> target: multiply by target per 1 BRL (e.g., IDR per BRL)
        return bid2;
    }

    return null;
}

async function formatCurrencyByLanguage(amountBRL, targetLang) {
    const cfg = LANGUAGE_CURRENCY[targetLang] || LANGUAGE_CURRENCY.pt;
    let rate = 1;
    if (cfg.code !== 'BRL') {
        rate = await getRateFromBRL(cfg.code) || cfg.fallbackRateFromBRL || 1;
    }
    const converted = (amountBRL || 0) * rate;
    const fixed = converted.toFixed(cfg.decimals);
    let formatted = fixed;
    if (cfg.decimalSep && cfg.decimalSep !== '.') {
        formatted = fixed.replace('.', cfg.decimalSep);
    }
    return `${cfg.symbol} ${formatted}`;
}

async function formatMoneyForUser(jid, amountBRL) {
    const lang = getUserLanguage(jid);
    return await formatCurrencyByLanguage(amountBRL, lang);
}

function getDeepLKey() {
    const envKey = process.env.DEEPL_API_KEY;
    const savedKey = shopData?.deeplApiKey;
    return envKey || savedKey || '4631a6be-c5e1-4db3-a68d-320768fa2689:fx';
}

function getGoogleKey() {
    const envKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    const savedKey = shopData?.googleTranslateApiKey;
    return envKey || savedKey || null;
}

async function translateUsingGoogle(text, targetLang) {
    try {
        const key = getGoogleKey();
        const tl = String(targetLang || '').toLowerCase();
        if (!key || !text || !targetLang || tl === 'pt' || tl === 'pt-br') return text;

        const postData = JSON.stringify({
            q: text,
            source: 'pt',
            target: targetLang,
            format: 'text'
        });

        const options = {
            hostname: 'translation.googleapis.com',
            path: `/language/translate/v2?key=${encodeURIComponent(key)}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        };

        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode || 500, data }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
            const parsed = JSON.parse(response.data);
            const translated = parsed?.data?.translations?.[0]?.translatedText;
            return translated || text;
        }
    } catch (e) {
        console.error('Erro na tradução Google:', e);
    }
    return text; // Fallback para o original em português
}

async function translateUsingDeepL(text, targetLang) {
    try {
        const key = getDeepLKey();
        if (!key || !text || !targetLang || targetLang === 'pt') return text;

        const postData = querystring.stringify({
            auth_key: key,
            text,
            target_lang: targetLang.toUpperCase() // DeepL aceita códigos como EN, ES, PT-BR
        });

        const options = {
            hostname: 'api-free.deepl.com',
            path: '/v2/translate',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
        };

        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode || 500, data }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
            const parsed = JSON.parse(response.data);
            const translated = parsed?.translations?.[0]?.text;
            return translated || text;
        }
    } catch (e) {
        console.error('Erro na tradução DeepL:', e);
    }
    return text; // Fallback para o original em português
}

async function translateText(text, targetLang) {
    const tl = String(targetLang || '').toLowerCase();
    if (!text || !targetLang || tl === 'pt' || tl === 'pt-br') return text;
    // Preferir Google; se indisponível ou falhar, tentar DeepL; senão, manter original
    const googleKey = getGoogleKey();
    if (googleKey) {
        const g = await translateUsingGoogle(text, targetLang);
        if (g && typeof g === 'string' && g !== text) return g;
    }
    const d = await translateUsingDeepL(text, targetLang);
    return d || text;
}

async function translateMessageContent(jid, message) {
    try {
        const isGroup = jid.endsWith('@g.us');
        if (isGroup) return message; // não traduz para grupos
        const targetLang = getUserLanguage(jid);
        const tl = String(targetLang || '').toLowerCase();
        if (tl === 'pt' || tl === 'pt-br') return message;

        let toSend = { ...message };
        if (toSend.text) toSend.text = await translateText(toSend.text, targetLang);
        if (toSend.caption) toSend.caption = await translateText(toSend.caption, targetLang);
        // Removido suporte a listas; apenas texto/caption são traduzidos
        return toSend;
    } catch (e) {
        console.error('Erro ao traduzir mensagem:', e);
        return message; // fallback
    }
}

// --- Enviar lista de seleção de idioma ---
async function sendLanguageSelectionList(sock, jid) {
    try {
        await sendInteractiveList(sock, jid, {
            fallbackText: "🌐 *Selecione seu idioma preferido:*\n\nDigite:\n1️⃣ - English (Inglês)\n2️⃣ - Português (Portuguese)\n3️⃣ - Español (Espanhol)\n4️⃣ - हिंदी (Hindi/Indiano)\n5️⃣ - Bahasa Indonesia (Indonésio)\n\n0️⃣ - Voltar",
            state: 'awaiting_language_choice'
        });
    } catch (err) {
        console.error("Erro ao enviar lista de idiomas:", err);
    }
}



function fetchPersonData() {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            'acao': 'gerar_pessoa',
            'sexo': 'I',
            'pontuacao': 'S',
            'idade': '0',
            'cep_estado': '',
            'txt_qtde': '1',
            'cep_cidade': ''
        });

        const options = {
            hostname: 'www.4devs.com.br',
            path: '/ferramentas_online.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (!data) {
                        return reject('A resposta da API 4devs veio vazia.');
                    }
                    const responseArray = JSON.parse(data);
                    if (Array.isArray(responseArray) && responseArray.length > 0) {
                        const person = responseArray[0];
                        if (person && person.nome) {
                            const nomeCompleto = person.nome.split(' ');
                            resolve({
                                nome: nomeCompleto[0],
                                sobrenome: nomeCompleto.slice(1).join(' '),
                                endereco: `${person.endereco}, ${person.numero}`,
                                cidade: person.cidade,
                                estado: person.estado,
                                cep: person.cep.replace('-', '')
                            });
                        } else {
                            reject('A resposta da API 4devs possui um formato inesperado.');
                        }
                    } else {
                        reject('A resposta da API 4devs está inválida ou vazia.');
                    }
                } catch (e) {
                    console.error("Erro ao analisar JSON da 4devs:", e, "Dados recebidos:", data);
                    reject('Erro ao processar os dados da pessoa.');
                }
            });
        });

        req.on('error', (e) => {
            console.error("Erro na requisição para 4devs:", e);
            reject(`Erro na requisição: ${e.message}`);
        });

        req.write(postData);
        req.end();
    });
}


function loadJsonFile(filePath, defaultData = {}) {
    try {
        if (fs.existsSync(filePath))
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        saveJsonFile(filePath, defaultData);
    } catch (error) {
        console.error(`Erro ao carregar o arquivo ${filePath}:`, error);
    }
    return defaultData;
}

function saveJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar o arquivo ${filePath}:`, error);
    }
}

// Carregamento dos dados
let userData = loadJsonFile(ARQUIVO_USUARIOS, {});
let purchaseHistoryData = loadJsonFile(ARQUIVO_HISTORICO_COMPRAS, {});
let adminData = loadJsonFile(ARQUIVO_ADMINS, {});
let shopData = loadJsonFile(ARQUIVO_DADOS_LOJA, {
    vendasRealizadas: 0,
    faturamentoSemanal: 0,
    faturamentoTotal: 0,
    descontoAutomaticoOferta: 30,
    compraMinima: 20,
    chavePix: '9551929a-68da-4c1b-9033-682b1f21796d',
    manualMaintenanceMode: false,
    imagemMenu: null,
    cartoes: [],
    idChecksExpirados: 0,
    valorPerdido: 0,
    contasVerificadas: 0,
    comissoes: {
        porCompra: 8.00,
        porVerificacao: 0.50,
        admin: 0.75,
        gerenciadorProduto: 3.00,
        gerenciadorCartao: 0.75,
        gerenciadorTrocaRegional: 0.50
    },
    taxas: {
        pix: 0.99,
        cartao: {
            avista: { fixa: 0.49, percentual: 1.99 },
            parcelado: {
                '2-6': { fixa: 0.49, percentual: 2.49 },
                '7-12': { fixa: 0.49, percentual: 2.99 }
            }
        }
    }
});
// Garantir que comissões existam para evitar erros de .toFixed
shopData.comissoes = shopData.comissoes || {
    porCompra: 8.00,
    porVerificacao: 0.50,
    admin: 0.75,
    gerenciadorProduto: 3.00,
    gerenciadorCartao: 0.75,
    gerenciadorTrocaRegional: 0.50
};

shopData.taxas = shopData.taxas || {
    pix: 0.99,
    cartao: {
        avista: { fixa: 0.49, percentual: 1.99 },
        parcelado: {
            '2-6': { fixa: 0.49, percentual: 2.49 },
            '7-12': { fixa: 0.49, percentual: 2.99 }
        }
    }
};

// Definir JID do canal de ofertas usando o ID da loja informado (sem usar .env)
// Se já existir, mantém o valor atual; caso contrário, salva o ID informado.
shopData.ofertasChannelJid = shopData.ofertasChannelJid || '0029Vas5FNjIiRp0p41KvZ3h';
saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);


let openTickets = loadJsonFile(ARQUIVO_TICKETS, []);
let cartData = loadJsonFile(ARQUIVO_CARRINHOS, {});
let rankingsData = loadJsonFile(ARQUIVO_RANKINGS, {});
let compradoresData = loadJsonFile(ARQUIVO_COMPRADORES, {});
let productManagerData = loadJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, {});
let gerenciadoresCartaoData = loadJsonFile(ARQUIVO_GERENCIADORES_CARTAO, {});
let gerenciadoresTrocaRegionalData = loadJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, {});
let apoiadoresData = loadJsonFile(ARQUIVO_APOIADORES, {});
let pendingOrders = loadJsonFile(ARQUIVO_PEDIDOS, []);
let pendingOrdersV = loadJsonFile(ARQUIVO_PEDIDOS_V, []);
let waitingOrders = loadJsonFile(ARQUIVO_PEDIDOS_ESPERA, []);
let couponData = loadJsonFile(ARQUIVO_CUPONS, {});
let invitationData = loadJsonFile(ARQUIVO_CONVITES, {});
let activeChats = loadJsonFile(ARQUIVO_CHATS_ATIVOS, []);
let exclusiveAccounts = loadJsonFile(ARQUIVO_CONTAS_EXCLUSIVAS_JSON, []);
let finishedEmails = loadJsonFile(ARQUIVO_EMAILS_FINALIZADOS, {});
let verificationRequests = loadJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, []);
let basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);
// Garantir estrutura esperada: basesValores deve ser um array
basesValores = Array.isArray(basesValores) ? basesValores : [];


// Garante que o dono sempre exista e tenha um status e configurações de notificação
if (!adminData[OWNER_JID]) {
    adminData[OWNER_JID] = {
        atendimentos: 0,
        status: 'off',
        onlineSince: null,
        totalOnlineTime: 0,
        ganhosTotais: 0,
        caixa: 0,
        caixaBloqueado: 0,
        pixKeys: [],
        notificacoes: {
            idcheck: true,
            suporte: true,
            mensagemCompradores: true,
            saques: true,
            novosPedidos: true,
            novosProdutos: true,
            atendimentoIniciado: true,
            compraFinalizada: true,
            verificacaoConta: false,
        }
    };
    saveJsonFile(ARQUIVO_ADMINS, adminData);
}

// Garantir que todos os admins tenham os campos de ganhos
Object.keys(adminData).forEach(jid => {
    if (!adminData[jid].hasOwnProperty('ganhosTotais')) adminData[jid].ganhosTotais = 0;
    if (!adminData[jid].hasOwnProperty('caixa')) adminData[jid].caixa = 0;
    if (!adminData[jid].hasOwnProperty('caixaBloqueado')) adminData[jid].caixaBloqueado = 0;
    if (!adminData[jid].hasOwnProperty('pixKeys')) adminData[jid].pixKeys = [];
    if (!adminData[jid].hasOwnProperty('monthlyEarnings')) adminData[jid].monthlyEarnings = {};
    if (!adminData[jid].hasOwnProperty('monthlyWithdrawals')) adminData[jid].monthlyWithdrawals = {};
});

// Garantir que todos os gerenciadores de produto tenham os campos de ganhos
Object.keys(productManagerData).forEach(jid => {
    if (!productManagerData[jid].hasOwnProperty('ganhosTotais')) productManagerData[jid].ganhosTotais = 0;
    if (!productManagerData[jid].hasOwnProperty('caixa')) productManagerData[jid].caixa = 0;
    if (!productManagerData[jid].hasOwnProperty('caixaBloqueado')) productManagerData[jid].caixaBloqueado = 0;
    if (!productManagerData[jid].hasOwnProperty('pixKeys')) productManagerData[jid].pixKeys = [];
    if (!productManagerData[jid].hasOwnProperty('ofertasAdicionadas')) productManagerData[jid].ofertasAdicionadas = 0;
    if (!productManagerData[jid].hasOwnProperty('monthlyEarnings')) productManagerData[jid].monthlyEarnings = {};
    if (!productManagerData[jid].hasOwnProperty('monthlyWithdrawals')) productManagerData[jid].monthlyWithdrawals = {};
});

// Garantir que todos os gerenciadores de cartão tenham os campos de ganhos
Object.keys(gerenciadoresCartaoData).forEach(jid => {
    if (!gerenciadoresCartaoData[jid].hasOwnProperty('ganhosTotais')) gerenciadoresCartaoData[jid].ganhosTotais = 0;
    if (!gerenciadoresCartaoData[jid].hasOwnProperty('caixa')) gerenciadoresCartaoData[jid].caixa = 0;
    if (!gerenciadoresCartaoData[jid].hasOwnProperty('caixaBloqueado')) gerenciadoresCartaoData[jid].caixaBloqueado = 0;
    if (!gerenciadoresCartaoData[jid].hasOwnProperty('pixKeys')) gerenciadoresCartaoData[jid].pixKeys = [];
    if (!gerenciadoresCartaoData[jid].hasOwnProperty('monthlyEarnings')) gerenciadoresCartaoData[jid].monthlyEarnings = {};
    if (!gerenciadoresCartaoData[jid].hasOwnProperty('monthlyWithdrawals')) gerenciadoresCartaoData[jid].monthlyWithdrawals = {};
});

// Garantir que todos os gerenciadores de troca regional tenham os campos de ganhos
Object.keys(gerenciadoresTrocaRegionalData).forEach(jid => {
    if (!gerenciadoresTrocaRegionalData[jid].hasOwnProperty('ganhosTotais')) gerenciadoresTrocaRegionalData[jid].ganhosTotais = 0;
    if (!gerenciadoresTrocaRegionalData[jid].hasOwnProperty('caixa')) gerenciadoresTrocaRegionalData[jid].caixa = 0;
    if (!gerenciadoresTrocaRegionalData[jid].hasOwnProperty('caixaBloqueado')) gerenciadoresTrocaRegionalData[jid].caixaBloqueado = 0;
    if (!gerenciadoresTrocaRegionalData[jid].hasOwnProperty('pixKeys')) gerenciadoresTrocaRegionalData[jid].pixKeys = [];
    if (!gerenciadoresTrocaRegionalData[jid].hasOwnProperty('monthlyEarnings')) gerenciadoresTrocaRegionalData[jid].monthlyEarnings = {};
    if (!gerenciadoresTrocaRegionalData[jid].hasOwnProperty('monthlyWithdrawals')) gerenciadoresTrocaRegionalData[jid].monthlyWithdrawals = {};
});

// Garantir que todos os compradores tenham campos essenciais e registros mensais
Object.keys(compradoresData).forEach(jid => {
    if (!compradoresData[jid].hasOwnProperty('ganhosTotais')) compradoresData[jid].ganhosTotais = 0;
    if (!compradoresData[jid].hasOwnProperty('caixa')) compradoresData[jid].caixa = 0;
    if (!compradoresData[jid].hasOwnProperty('pixKeys')) compradoresData[jid].pixKeys = [];
    if (!compradoresData[jid].hasOwnProperty('monthlyEarnings')) compradoresData[jid].monthlyEarnings = {};
    if (!compradoresData[jid].hasOwnProperty('monthlyWithdrawals')) compradoresData[jid].monthlyWithdrawals = {};
    if (!compradoresData[jid].hasOwnProperty('notificacoes')) compradoresData[jid].notificacoes = false;
    if (!compradoresData[jid].hasOwnProperty('notificacoes_config')) compradoresData[jid].notificacoes_config = {};
});

// Garantir que todos os apoiadores tenham campos essenciais e registros mensais
Object.keys(apoiadoresData).forEach(code => {
    const a = apoiadoresData[code];
    if (!a.hasOwnProperty('ganhosTotais')) a.ganhosTotais = 0;
    if (!a.hasOwnProperty('caixa')) a.caixa = 0;
    if (!a.hasOwnProperty('caixaBloqueado')) a.caixaBloqueado = 0;
    if (!a.hasOwnProperty('monthlyEarnings')) a.monthlyEarnings = {};
    if (!a.hasOwnProperty('monthlyWithdrawals')) a.monthlyWithdrawals = {};
});

// Persistir normalizações de esquema
saveJsonFile(ARQUIVO_ADMINS, adminData);
saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);

// Sincroniza o status dos membros da equipe para "comprador" para silenciá-los
Object.keys(compradoresData).forEach(jid => {
    if (!userData[jid]) userData[jid] = { nome: jid.split('@')[0], status: 'comprador' };
    else userData[jid].status = 'comprador';
});
Object.keys(productManagerData).forEach(jid => {
    if (!userData[jid]) userData[jid] = { nome: jid.split('@')[0], status: 'comprador' };
    else userData[jid].status = 'comprador';
});
Object.keys(gerenciadoresCartaoData).forEach(jid => {
    if (!userData[jid]) userData[jid] = { nome: jid.split('@')[0], status: 'comprador' };
    else userData[jid].status = 'comprador';
});
Object.keys(gerenciadoresTrocaRegionalData).forEach(jid => {
    if (!userData[jid]) userData[jid] = { nome: jid.split('@')[0], status: 'comprador' };
    else userData[jid].status = 'comprador';
});
saveJsonFile(ARQUIVO_USUARIOS, userData);

// --- FUNÇÕES AUXILIARES PARA SISTEMA DE GANHOS ---

/**
 * Calcula a data de liberação (dia 1 do próximo mês)
 * @returns {Date} Data do dia 1 do próximo mês
 */
function calculateNextReleaseDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
}

/**
 * Obtém informações de ganhos de um membro da equipe
 * @param {string} jid - JID do membro
 * @returns {Object} { ganhosTotais, caixa, caixaBloqueado, proximaLiberacao, cargo, memberData }
 */
function getTeamMemberEarnings(jid) {
    let memberData = null;
    let cargo = 'Desconhecido';

    if (adminData[jid]) {
        memberData = adminData[jid];
        cargo = jid === OWNER_JID ? 'Proprietário' : 'Admin';
    } else if (compradoresData[jid]) {
        memberData = compradoresData[jid];
        cargo = 'Comprador';
    } else if (productManagerData[jid]) {
        memberData = productManagerData[jid];
        cargo = 'Gerenciador de Produto';
    } else if (gerenciadoresCartaoData[jid]) {
        memberData = gerenciadoresCartaoData[jid];
        cargo = 'Gerenciador de Cartão';
    } else if (gerenciadoresTrocaRegionalData[jid]) {
        memberData = gerenciadoresTrocaRegionalData[jid];
        cargo = 'Gerenciador de Troca Regional';
    } else {
        // Verificar se é apoiador
        for (const code in apoiadoresData) {
            if (apoiadoresData[code].ownerJid === jid) {
                memberData = apoiadoresData[code];
                cargo = 'Apoiador';
                break;
            }
        }
    }

    if (!memberData) {
        return null;
    }

    const ganhosTotais = memberData.ganhosTotais || 0;
    const caixa = memberData.caixa || 0;
    const caixaBloqueado = memberData.caixaBloqueado || 0;
    const proximaLiberacao = calculateNextReleaseDate();

    return {
        ganhosTotais,
        caixa,
        caixaBloqueado,
        proximaLiberacao,
        cargo,
        memberData
    };
}

/**
 * Adiciona ganhos para um membro da equipe
 * @param {string} jid - JID do membro
 * @param {number} valor - Valor a adicionar
 * @param {boolean} direto - Se true, adiciona direto no caixa (compradores), se false, adiciona no caixaBloqueado
 */
function addEarningsToMember(jid, valor, direto = false) {
    let memberData = null;
    let fileToSave = null;
    let dataObject = null;

    if (adminData[jid]) {
        memberData = adminData[jid];
        dataObject = adminData;
        fileToSave = ARQUIVO_ADMINS;
    } else if (compradoresData[jid]) {
        memberData = compradoresData[jid];
        dataObject = compradoresData;
        fileToSave = ARQUIVO_COMPRADORES;
        direto = true; // Compradores sempre recebem direto
    } else if (productManagerData[jid]) {
        memberData = productManagerData[jid];
        dataObject = productManagerData;
        fileToSave = ARQUIVO_GERENCIADORES_PRODUTO;
    } else if (gerenciadoresCartaoData[jid]) {
        memberData = gerenciadoresCartaoData[jid];
        dataObject = gerenciadoresCartaoData;
        fileToSave = ARQUIVO_GERENCIADORES_CARTAO;
    } else if (gerenciadoresTrocaRegionalData[jid]) {
        memberData = gerenciadoresTrocaRegionalData[jid];
        dataObject = gerenciadoresTrocaRegionalData;
        fileToSave = ARQUIVO_GERENCIADORES_TROCA_REGIONAL;
    } else {
        // Verificar se é apoiador
        for (const code in apoiadoresData) {
            if (apoiadoresData[code].ownerJid === jid) {
                memberData = apoiadoresData[code];
                dataObject = apoiadoresData;
                fileToSave = ARQUIVO_APOIADORES;
                break;
            }
        }
    }

    if (!memberData || !fileToSave) {
        return false;
    }

    memberData.ganhosTotais = (memberData.ganhosTotais || 0) + valor;

    if (direto) {
        memberData.caixa = (memberData.caixa || 0) + valor;
    } else {
        memberData.caixaBloqueado = (memberData.caixaBloqueado || 0) + valor;
    }

    // Registrar ganhos no mapa mensal (independente de bloqueio)
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!memberData.monthlyEarnings) memberData.monthlyEarnings = {};
    memberData.monthlyEarnings[monthKey] = (memberData.monthlyEarnings[monthKey] || 0) + valor;

    saveJsonFile(fileToSave, dataObject);
    return true;
}

/**
 * Transfere valores do caixaBloqueado para caixa no dia 1 do mês
 * Deve ser executado diariamente
 */
function releaseBlockedEarnings() {
    const now = new Date();
    const isFirstDayOfMonth = now.getDate() === 1;

    if (!isFirstDayOfMonth) {
        return;
    }

    // Processar admins
    Object.keys(adminData).forEach(jid => {
        if (adminData[jid].caixaBloqueado > 0) {
            adminData[jid].caixa = (adminData[jid].caixa || 0) + adminData[jid].caixaBloqueado;
            adminData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_ADMINS, adminData);

    // Processar gerenciadores de produto
    Object.keys(productManagerData).forEach(jid => {
        if (productManagerData[jid].caixaBloqueado > 0) {
            productManagerData[jid].caixa = (productManagerData[jid].caixa || 0) + productManagerData[jid].caixaBloqueado;
            productManagerData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);

    // Processar gerenciadores de cartão
    Object.keys(gerenciadoresCartaoData).forEach(jid => {
        if (gerenciadoresCartaoData[jid].caixaBloqueado > 0) {
            gerenciadoresCartaoData[jid].caixa = (gerenciadoresCartaoData[jid].caixa || 0) + gerenciadoresCartaoData[jid].caixaBloqueado;
            gerenciadoresCartaoData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);

    // Processar gerenciadores de troca regional
    Object.keys(gerenciadoresTrocaRegionalData).forEach(jid => {
        if (gerenciadoresTrocaRegionalData[jid].caixaBloqueado > 0) {
            gerenciadoresTrocaRegionalData[jid].caixa = (gerenciadoresTrocaRegionalData[jid].caixa || 0) + gerenciadoresTrocaRegionalData[jid].caixaBloqueado;
            gerenciadoresTrocaRegionalData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);

    // Processar apoiadores (liberar valores bloqueados no dia 1)
    for (const code in apoiadoresData) {
        if (apoiadoresData[code].caixaBloqueado > 0) {
            apoiadoresData[code].caixa = (apoiadoresData[code].caixa || 0) + apoiadoresData[code].caixaBloqueado;
            apoiadoresData[code].caixaBloqueado = 0;
        }
    }
    saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
}

// Executar verificação de liberação de valores diariamente
setInterval(releaseBlockedEarnings, 24 * 60 * 60 * 1000); // A cada 24 horas
releaseBlockedEarnings(); // Executar na inicialização também

// Verifica e reseta ranking a cada 6 horas (para garantir que pegue o dia 1)
setInterval(checkAndResetRanking, 6 * 60 * 60 * 1000);
checkAndResetRanking(); // Executar na inicialização também


function generateOrderId() {
    let newId;
    let isUnique = false;
    while (!isUnique) {
        newId = Math.floor(100000 + Math.random() * 900000);
        const existsInPending = pendingOrders.some(order => order.id === newId);
        const existsInPendingV = pendingOrdersV.some(order => order.id === newId);
        const existsInWaiting = waitingOrders.some(order => order.id === newId);
        const existsInCarts = Object.values(cartData).some(cart => cart.id === newId);
        if (!existsInPending && !existsInPendingV && !existsInWaiting && !existsInCarts) {
            isUnique = true;
        }
    }
    return newId;
}

async function goBack(sock, jid) {
    if (userState[jid] && userState[jid].paymentCheckTimeout) {
        clearTimeout(userState[jid].paymentCheckTimeout);
        delete userState[jid].paymentCheckTimeout;
    }

    if (userState[jid] && userState[jid].history && userState[jid].history.length > 1) {
        userState[jid].history.pop();
        const previousState = userState[jid].history[userState[jid].history.length - 1];

        // Evita ficar preso em um loop se o estado anterior for o mesmo
        if (userState[jid].history.length > 1) {
            const grandPreviousState = userState[jid].history[userState[jid].history.length - 2];
            if (previousState.step === grandPreviousState.step) {
                console.log(`[goBack] Loop detectado para ${jid}: ${previousState.step}. Pulando um estado extra.`);
                userState[jid].history.pop();
                return grandPreviousState;
            }
        }
        return previousState;
    }
    // Se não houver histórico para voltar, vai para o menu principal
    delete userState[jid];
    await sendMainMenu(sock, jid);
    return null;
}

function navigateTo(jid, step, data = {}) {
    if (!userState[jid] || !userState[jid].history) {
        userState[jid] = { history: [] };
    }
    const currentState = { step, data, timestamp: Date.now() };

    const lastState = userState[jid].history[userState[jid].history.length - 1];
    // Evita adicionar estados duplicados consecutivos na pilha de histórico
    if (lastState && lastState.step === step) {
        // Apenas atualiza os dados do estado atual em vez de adicionar um novo
        userState[jid].history[userState[jid].history.length - 1].data = data;
    } else {
        userState[jid].history.push(currentState);
    }
}


function formatRemainingTime(expiryTimestamp) {
    const now = Date.now();
    if (!expiryTimestamp || expiryTimestamp <= now) {
        return "Expirado";
    }

    let delta = Math.floor((expiryTimestamp - now) / 1000);

    const days = Math.floor(delta / 86400);
    delta -= days * 86400;

    const hours = Math.floor(delta / 3600) % 24;
    delta -= hours * 3600;

    const minutes = Math.floor(delta / 60) % 60;

    let remaining = "";
    if (days > 0) remaining += `${days}d `;
    if (hours > 0) remaining += `${hours}h `;
    if (minutes > 0) remaining += `${minutes}m`;

    return remaining.trim() || "Menos de 1 minuto";
}

function parseDuration(text) {
    let totalMilliseconds = 0;
    const daysMatch = text.match(/(\d+)\s*d/);
    const hoursMatch = text.match(/(\d+)\s*h/);
    const minutesMatch = text.match(/(\d+)\s*m/);

    if (daysMatch) totalMilliseconds += parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000;
    if (hoursMatch) totalMilliseconds += parseInt(hoursMatch[1]) * 60 * 60 * 1000;
    if (minutesMatch) totalMilliseconds += parseInt(minutesMatch[1]) * 60 * 1000;
    return totalMilliseconds > 0 ? totalMilliseconds : null;
}

async function generateInviteCode(userName, userJid) {
    const firstName = userName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, '');
    let inviteCode;
    let isUnique = false;

    const existingCodes = Object.keys(invitationData);
    for (const code of existingCodes) {
        if (invitationData[code].ownerJid === userJid) {
            delete invitationData[code];
        }
    }

    while (!isUnique) {
        const randomNumbers = Math.floor(1000 + Math.random() * 9000);
        inviteCode = `${firstName}${randomNumbers}`.toUpperCase();
        if (!invitationData[inviteCode]) {
            isUnique = true;
        }
    }

    invitationData[inviteCode] = {
        ownerJid: userJid,
        ownerName: userName,
        uses: 0,
        totalDiscountValue: 0,
        invitedUsers: {}
    };
    saveJsonFile(ARQUIVO_CONVITES, invitationData);
    return inviteCode;
}

async function sendMessage(sock, jid, message) {
    if (!message || (!message.text && !message.image && !message.caption)) {
        console.error(`[sendMessage] Tentativa de enviar mensagem indefinida ou vazia para ${jid}.`);
        return null;
    }

    try {
        await sock.presenceSubscribe(jid);
        await new Promise(resolve => setTimeout(resolve, 250));
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, 500));

        const toSend = await translateMessageContent(jid, message);
        const signatureRaw = (() => {
            if (toSend.text) return 'text:' + toSend.text.trim();
            if (toSend.caption) return 'caption:' + toSend.caption.trim();
            if (toSend.image) return 'image:' + (toSend.caption || '');
            if (toSend.video) return 'video:' + (toSend.caption || '');
            if (toSend.audio) return 'audio';
            if (toSend.document) return 'document:' + (toSend.fileName || '');
            try { return JSON.stringify(toSend); } catch { return String(toSend); }
        })();
        const signature = String(signatureRaw).replace(/\s+/g, ' ').trim();

        const prev = recentMessagesByJid.get(jid);
        if (prev && prev.signature === signature && Date.now() - prev.at < 8000) {
            await sock.sendPresenceUpdate('paused', jid);
            return null;
        }
        const inflight = inFlightMessagesByJid.get(jid);
        if (inflight && inflight.signature === signature && Date.now() - inflight.at < 8000) {
            await sock.sendPresenceUpdate('paused', jid);
            return null;
        }
        inFlightMessagesByJid.set(jid, { signature, at: Date.now() });
        recentMessagesByJid.set(jid, { signature, at: Date.now() });
        const sentMessage = await sock.sendMessage(jid, toSend);
        setTimeout(() => {
            const v = inFlightMessagesByJid.get(jid);
            if (v && v.signature === signature) inFlightMessagesByJid.delete(jid);
        }, 8000);

        await sock.sendPresenceUpdate('paused', jid);
        return sentMessage;
    } catch (e) {
        console.error(`Falha ao enviar mensagem para ${jid}:`, e);
        if (e.message && e.message.includes('rate-overlimit')) {
            console.log('Limite de taxa atingido, esperando 1 segundo para reenviar...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return sendMessage(sock, jid, message); // Tenta reenviar
        }
        return null;
    }
}

// --- Funções de verificação de produtos "NEW" ---
const isProductNew = (product) => product && product.createdAt && (Date.now() - product.createdAt < 20 * 60 * 60 * 1000);

function directoryHasNewProducts(directoryPath) {
    // Usa cache para evitar leituras repetidas de disco
    return getCached(`hasNew:${directoryPath}`, () => {
        try {
            if (!fs.existsSync(directoryPath)) return false;
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);
                if (entry.isDirectory()) {
                    if (directoryHasNewProducts(fullPath)) {
                        return true;
                    }
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    const products = loadJsonFile(fullPath, []);
                    if (Array.isArray(products) && products.some(isProductNew)) {
                        return true;
                    }
                }
            }
        } catch (error) {
            console.error(`Erro ao verificar novos produtos no diretório ${directoryPath}:`, error);
        }
        return false;
    });
}

// --- Iniciar próximo atendimento ---
async function startNextAttendance(sock, sellerJid) {
    if (activeChats.some(c => c.sellerJid === sellerJid)) {
        await sendMessage(sock, sellerJid, { text: "⚠️ Você já está em um atendimento. Finalize-o com */finalizar* antes de iniciar um novo." });
        return;
    }

    // Prioridade 1: Solicitações de Verificação (atômico)
    let pendingVerification = null;
    if (verificationRequests.length > 0) {
        const requestIndex = verificationRequests.findIndex(r => r.status === 'pendente');
        if (requestIndex > -1) {
            pendingVerification = verificationRequests.splice(requestIndex, 1)[0];
            saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);
        }
    }

    if (pendingVerification) {
        pendingVerification.status = 'em_atendimento';
        pendingVerification.atendido_por = sellerJid;
        verificationRequests.push(pendingVerification);
        saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);

        const clientJid = pendingVerification.userJid;
        const sellerName = "um atendente";

        activeChats.push({ sellerJid, clientJid, type: 'verification', request: pendingVerification });
        saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);

        const stateData = { partnerJid: clientJid, request: pendingVerification };
        navigateTo(sellerJid, 'in_verification_chat', stateData);
        navigateTo(clientJid, 'in_verification_chat', { ...stateData, partnerJid: sellerJid });

        await sendMessage(sock, clientJid, { text: `👋 Olá! Eu sou *${sellerName}* e vou te ajudar com a verificação da sua conta. Por favor, aguarde um momento.` });

        const userToVerify = userData[clientJid];
        const account = userToVerify?.savedAccounts?.[pendingVerification.accountIndex];
        let sellerInfoText = `Iniciando verificação para *${userToVerify.nome}*.\n\n`;
        sellerInfoText += `*Conta:* ${account.alias}\n`;
        sellerInfoText += `*Login:* \`${account.login}\`\n`;
        sellerInfoText += `*Senha:* \`${account.password}\`\n`;
        sellerInfoText += `*ID da Conta:* \`${account.gameId || 'Não informado'}\`\n\n`;
        sellerInfoText += `Tente acessar a conta. Use os comandos para interagir com o cliente. Ao finalizar, digite */finalizar*.`;

        await sendMessage(sock, sellerJid, { text: sellerInfoText });
        return;
    }


    const onlineCardManagers = Object.values(gerenciadoresCartaoData).filter(m => m.status === 'on').length;
    const hasPendingOrders = pendingOrdersV.some(o => o.status === 'pendente') || pendingOrders.some(o => o.status === 'pendente');

    if (hasPendingOrders && onlineCardManagers === 0) {
        const pendingOrdersCount = pendingOrders.length + pendingOrdersV.length;
        await sendMessage(sock, sellerJid, { text: `⚠️ Não é possível iniciar um novo atendimento de compra, pois não há nenhum Gerenciador de Cartões online no momento.\n\nTotal de pedidos na fila: *${pendingOrdersCount}*` });
        delete userState[sellerJid];
        return;
    }

    let currentOrder = null;
    let orderList = null;
    let orderFile = null;
    let orderIndex = -1;

    // Lógica Atômica: Procura por um pedido pendente, o remove da lista e só então o processa.
    // Isso previne que dois compradores peguem o mesmo pedido simultaneamente.
    orderIndex = pendingOrdersV.findIndex(order => order.status === 'pendente');
    if (orderIndex > -1) {
        currentOrder = pendingOrdersV.splice(orderIndex, 1)[0]; // Pega e remove atomicamente
        orderList = pendingOrdersV;
        orderFile = ARQUIVO_PEDIDOS_V;
    } else {
        orderIndex = pendingOrders.findIndex(order => order.status === 'pendente');
        if (orderIndex > -1) {
            currentOrder = pendingOrders.splice(orderIndex, 1)[0]; // Pega e remove atomicamente
            orderList = pendingOrders;
            orderFile = ARQUIVO_PEDIDOS;
        }
    }


    if (currentOrder) {
        saveJsonFile(orderFile, orderList); // Salva a lista já sem o pedido pego
        currentOrder.status = 'em_atendimento';
        currentOrder.atendido_por = sellerJid;
        orderList.push(currentOrder); // Re-adiciona na lista, agora com status "em_atendimento"
        saveJsonFile(orderFile, orderList);

        const clientJid = currentOrder.clientJid;
        const sellerName = "um atendente";

        activeChats.push({ sellerJid, clientJid, orderId: currentOrder.id, type: 'order' });
        saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);

        const stateData = { partnerJid: clientJid, orderId: currentOrder.id };
        navigateTo(sellerJid, 'in_direct_chat', stateData);
        navigateTo(clientJid, 'in_direct_chat', { ...stateData, partnerJid: sellerJid });

        await sendMessage(sock, clientJid, { text: `👋 Olá! Eu sou um atendente e vou processar o seu pedido *#${currentOrder.id}*. Por favor, aguarde um momento.` });

        const sellerLang = getUserLanguage(sellerJid);
        let itemsText = '';
        for (const item of currentOrder.items) {
            const pcPrice = item.basePrices?.microsoft;
            let pcPriceText = '';
            if (pcPrice) {
                const pcPriceFormatted = await formatCurrencyByLanguage(pcPrice || 0, sellerLang);
                pcPriceText = ` (PC: ${pcPriceFormatted})`;
            }
            itemsText += `> • ${item.name}${pcPriceText}\n`;
        }

        const maskedId = currentOrder.dragonCityId ? currentOrder.dragonCityId.slice(0, -4) + '****' : 'Não informado';

        let sellerInfoText = `Iniciando atendimento para *${currentOrder.clientName}* (Pedido *#${currentOrder.id}*).\n\n`;
        sellerInfoText += `*Login:* \`${currentOrder.facebookLogin}\`\n`;
        sellerInfoText += `*Senha:* \`${currentOrder.facebookPassword}\`\n`;
        sellerInfoText += `*ID do Jogo:* ${maskedId}\n\n`;
        sellerInfoText += `*Itens:*\n${itemsText}\n\n`;
        sellerInfoText += `Você está agora em um chat direto com o cliente. Use os comandos de atendimento para continuar. Ao finalizar, digite */finalizar*.`;

        await sendMessage(sock, sellerJid, { text: sellerInfoText });

        const nextOrderInV = pendingOrdersV.find(o => o.status === 'pendente');
        const nextOrderInN = pendingOrders.find(o => o.status === 'pendente');
        const nextOrder = nextOrderInV || nextOrderInN;

        if (nextOrder && nextOrder.clientJid !== currentOrder.clientJid) {
            await sendMessage(sock, nextOrder.clientJid, { text: "⏳ Você é o próximo da fila! Por favor, fique atento(a), seu atendimento começará em breve." });
        }

    } else {
        await sendMessage(sock, sellerJid, { text: "Não há pedidos ou verificações na fila no momento." });
        delete userState[sellerJid];
    }
}


// === SISTEMA DE RANKING DE GRUPOS ===

// Função para obter o período atual (MM/YYYY)
function getCurrentPeriod() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${year}`;
}

// Função para incrementar mensagem de usuário em grupo
function incrementGroupMessage(groupJid, userJid, userName) {
    const period = getCurrentPeriod();

    if (!rankingsData[period]) {
        rankingsData[period] = {};
    }

    if (!rankingsData[period][groupJid]) {
        rankingsData[period][groupJid] = {};
    }

    if (!rankingsData[period][groupJid][userJid]) {
        rankingsData[period][groupJid][userJid] = {
            nome: userName,
            mensagens: 0
        };
    }

    rankingsData[period][groupJid][userJid].mensagens++;
    rankingsData[period][groupJid][userJid].nome = userName; // Atualiza o nome caso tenha mudado

    saveJsonFile(ARQUIVO_RANKINGS, rankingsData);
}

// Função para mostrar o ranking de um grupo
async function sendGroupRanking(sock, groupJid, period = null, quotedMsgId = null) {
    const targetPeriod = period || getCurrentPeriod();

    if (!rankingsData[targetPeriod] || !rankingsData[targetPeriod][groupJid]) {
        await sendMessage(sock, groupJid, {
            text: `📊 *Ranking de Atividade*\n\n❌ Não há dados de ranking para o período ${targetPeriod}.`,
            quotedMsgId: quotedMsgId
        });
        return;
    }

    const groupRanking = rankingsData[targetPeriod][groupJid];
    const sortedUsers = Object.entries(groupRanking)
        .map(([jid, data]) => ({ jid, ...data }))
        .sort((a, b) => b.mensagens - a.mensagens)
        .slice(0, 5); // Top 5

    let rankingText = `📊 *Ranking de Atividade* - ${targetPeriod}\n\n`;
    rankingText += `🏆 *Top 5 Usuários Mais Ativos*\n\n`;

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    sortedUsers.forEach((user, index) => {
        rankingText += `${medals[index]} *${user.nome}*\n`;
        rankingText += `   💬 ${user.mensagens} mensagens\n\n`;
    });

    if (sortedUsers.length === 0) {
        rankingText = `📊 *Ranking de Atividade* - ${targetPeriod}\n\n❌ Nenhum usuário registrado neste período.`;
    }

    await sendMessage(sock, groupJid, {
        text: rankingText,
        quotedMsgId: quotedMsgId
    });
}

// Função para resetar ranking (chamada automaticamente todo dia 1)
function checkAndResetRanking() {
    const now = new Date();
    const day = now.getDate();

    // Se for dia 1 e ainda não resetou hoje
    if (day === 1) {
        const lastReset = rankingsData._lastReset || '';
        const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

        if (lastReset !== today) {
            console.log(`[Ranking] Novo mês detectado. Rankings do mês anterior foram preservados.`);
            rankingsData._lastReset = today;
            saveJsonFile(ARQUIVO_RANKINGS, rankingsData);
        }
    }
}

// Função para admins verem rankings anteriores
async function sendHistoricalRankingMenu(sock, userJid, period) {
    if (!rankingsData[period]) {
        await sendMessage(sock, userJid, {
            text: `❌ Não há dados de ranking para o período ${period}.`
        });
        return;
    }

    const groups = Object.keys(rankingsData[period]).filter(key => key !== '_lastReset');

    if (groups.length === 0) {
        await sendMessage(sock, userJid, {
            text: `❌ Não há grupos com ranking no período ${period}.`
        });
        return;
    }



    let menuText = `📊 *Rankings Disponíveis* - ${period}\n\n`;
    menuText += `Selecione um grupo:\n\n`;

    groups.forEach((groupJid, index) => {
        const groupName = groupJid.split('@')[0];
        menuText += `*${index + 1}* - Grupo ${groupName}\n`;
    });

    menuText += `\n0️⃣ Cancelar`;

    await sendMessage(sock, userJid, { text: menuText });
    navigateTo(userJid, 'awaiting_historical_ranking_choice', { period, groups });
}


// === FUNÇÃO AUXILIAR PARA ENVIAR LISTAS INTERATIVAS ===

async function sendInteractiveList(sock, jid, options) {
    const { fallbackText, state, stateData = {} } = options;
    const userLang = getUserLanguage(jid);
    const finalText = fallbackText && fallbackText.trim()
        ? await translateText(fallbackText, userLang)
        : await translateText('Selecione uma opção digitando o número correspondente.', userLang);
    await sendMessage(sock, jid, { text: finalText });
    if (state) navigateTo(jid, state, stateData);
}


// === MENUS PRINCIPAIS ===

async function sendMainMenu(sock, jid) {
    // Se o usuário estiver em atendimento, ignora o comando de menu
    const currentState = userState[jid]?.history?.[userState[jid].history.length - 1];
    if (currentState && (currentState.step === 'in_direct_chat' || currentState.step === 'in_verification_chat')) {
        return;
    }

    const userName = userData[jid]?.nome || "Aventureiro(a)";
    const userLang = getUserLanguage(jid);

    // Traduz a mensagem de boas-vindas
    const welcomeText = await translateText(`Olá, *${userName}*! 👋\n\nBem-vindo(a) de volta ao menu principal da *PowerShop*.✨`, userLang);
    const menuText = `${welcomeText}\n\n*Digite o número:*\n\n1️⃣ 👤 Meu Perfil\n2️⃣ 🛍️ Comprar Produtos\n3️⃣ 💬 Dúvidas e Suporte`;

    // Se há imagem do menu configurada, envia com caption
    if (shopData.imagemMenu && fs.existsSync(shopData.imagemMenu)) {
        try {
            const imageBuffer = fs.readFileSync(shopData.imagemMenu);
            if (imageBuffer && imageBuffer.length > 0) {
                await sendMessage(sock, jid, {
                    image: imageBuffer,
                    caption: menuText
                });
            } else {
                await sendMessage(sock, jid, { text: menuText });
            }
        } catch (error) {
            console.error('Erro ao carregar imagem do menu:', error);
            await sendMessage(sock, jid, { text: menuText });
        }
    } else {
        // Senão, envia apenas texto
        await sendMessage(sock, jid, { text: menuText });
    }

    navigateTo(jid, 'awaiting_menu_choice');
}


async function sendProfileView(sock, jid) {
    const profile = userData[jid];
    if (!profile) {
        delete userState[jid];
        await sendMessage(sock, jid, { text: "📘 Parece que seu perfil ainda não foi criado. Vamos começar! Qual é o seu nome?" });
        navigateTo(jid, "register_name");
        return;
    }

    let totalEconomizado = profile.totalEconomizado || 0;
    const powerPoints = profile.powerPoints || 0;

    const userHistory = purchaseHistoryData[jid] || [];
    if (userHistory.length > 0) {
        totalEconomizado = userHistory.reduce((total, order) => {
            const platformKeyMap = { "Android/Play Store": "google", "Microsoft/PC": "microsoft", "iOS/Apple Store": "ios" };
            const userPlatformKey = platformKeyMap[profile.plataforma];
            let orderEconomy = 0;
            if (Array.isArray(order.items) && userPlatformKey) {
                order.items.forEach(item => {
                    if (item.basePrices && item.basePrices[userPlatformKey] && item.basePrices[userPlatformKey] > item.price) {
                        orderEconomy += item.basePrices[userPlatformKey] - item.price;
                    }
                });
            }
            return total + orderEconomy;
        }, 0);
        profile.totalEconomizado = totalEconomizado;
        saveJsonFile(ARQUIVO_USUARIOS, userData);
    }

    let inviteCode = "Nenhum";
    const codes = Object.keys(invitationData);
    for (const code of codes) {
        if (invitationData[code].ownerJid === jid) {
            inviteCode = code;
            break;
        }
    }

    const userLang = getUserLanguage(jid);
    const totalEconomizadoFormatted = await formatCurrencyByLanguage(totalEconomizado || 0, userLang);

    // Traduz os textos do perfil
    const profileTitle = await translateText("👤 *Seu Perfil: ", userLang);
    const profileIntro = await translateText("*\n\nAqui estão os detalhes da sua jornada conosco:\n\n", userLang);
    const purchasesLabel = await translateText("> 🛍️ Compras realizadas: *", userLang);
    const savingsLabel = await translateText("> 💰 Economia total: *", userLang);
    const powerPointsLabel = await translateText("> ✨ PowerPoints: *", userLang);
    const platformLabel = await translateText("> 🎮 Plataforma principal: *", userLang);
    const inviteCodeLabel = await translateText("> 🎟️ Seu Código de Convite: *", userLang);

    let profileText = `${profileTitle}${profile.nome}${profileIntro}`;
    profileText += `${purchasesLabel}${profile.compras || 0}*\n`;
    profileText += `${savingsLabel}${totalEconomizadoFormatted}*\n`;
    profileText += `${powerPointsLabel}${powerPoints}*\n`;
    profileText += `${platformLabel}${profile.plataforma}*\n`;
    profileText += `${inviteCodeLabel}${inviteCode}*`;

    // Envia tudo em uma única mensagem (detalhes + menu)



    // Cria texto de fallback combinando detalhes + opções
    let fallbackText = `${profileText}\n\n*O que deseja fazer agora?*\n\n`;
    fallbackText += `1️⃣ 📝 Alterar meus dados\n`;
    fallbackText += `2️⃣ 📜 Histórico de Pedidos\n`;
    fallbackText += `3️⃣ 🐲 Gerenciar contas do Dragon City\n`;
    if (!profile.compras || profile.compras === 0) {
        fallbackText += `4️⃣ 🎁 Utilizar Código de Convite\n`;
        fallbackText += `5️⃣ 🌐 Mudar idioma\n`;
    } else {
        fallbackText += `4️⃣ 🌐 Mudar idioma\n`;
    }
    fallbackText += `\n0️⃣ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_profile_choice'
    });
}

async function sendPurchaseHistory(sock, jid) {
    const userHistory = purchaseHistoryData[jid] || [];
    userHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (userHistory.length === 0) {
        let historyText = "📜 *Seu Histórico de Pedidos*\n\n";
        historyText += "Você ainda não realizou nenhuma compra conosco. Que tal explorar nossa loja? 🛍️\n\n";
        historyText += "0️⃣ 👤 Voltar ao seu perfil";
        await sendMessage(sock, jid, { text: historyText });
        navigateTo(jid, "awaiting_history_choice", { userHistory });
        return;
    }



    // Texto de fallback
    let fallbackText = "📜 *Seu Histórico de Pedidos*\n\n";
    fallbackText += "Abaixo estão os detalhes de cada pedido. Digite o número correspondente para ver mais informações:\n\n";
    userHistory.forEach((order, index) => {
        const date = new Date(order.timestamp).toLocaleDateString('pt-BR');
        const status = order.statusDisplay || 'Em Processamento';
        fallbackText += `*${index + 1}* - Pedido *#${order.id}* (${date}) - Status: *${status}*\n`;
    });
    fallbackText += "\n0️⃣ 👤 Voltar ao seu perfil";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_history_choice',
        stateData: { userHistory }
    });
}

async function sendOrderDetailsView(sock, jid, order) {
    let detailsText = `📜 *Detalhes do Pedido #${order.id}*\n\n`;
    const itemsSummary = order.items ? order.items.map(item => `> • ${item.name}`).join('\n') : '> • Itens não especificados';
    const date = new Date(order.timestamp).toLocaleString('pt-BR');
    const userLang = getUserLanguage(jid);
    const totalPaid = order.totalPaid != null ? await formatCurrencyByLanguage(order.totalPaid || 0, userLang) : 'N/A';
    const status = order.statusDisplay || 'Em Processamento';

    detailsText += `*Data:* ${date}\n`;
    detailsText += `*Status:* ${status}\n`;
    detailsText += `*Itens:*\n${itemsSummary}\n`;
    detailsText += `*Valor Pago:* ${totalPaid}\n`;

    if (order.powerPointsEarned) {
        detailsText += `*PowerPoints Ganhos:* ${order.powerPointsEarned} ✨\n`;
    }

    if (status === 'Em Processamento' || status === 'Em Espera') {
        const allPending = [
            ...pendingOrdersV.map(o => ({ ...o, type: 'V' })),
            ...pendingOrders.map(o => ({ ...o, type: 'N' }))
        ];
        const queuePosition = allPending.findIndex(o => o.id === order.id);
        if (queuePosition !== -1) {
            detailsText += `\n*Posição na Fila:* ${queuePosition + 1}º\n`;
        }
    }

    detailsText += `\n0️⃣ 📜 Voltar para o histórico`;
    await sendMessage(sock, jid, { text: detailsText });
    navigateTo(jid, "awaiting_order_details_action", { order });
}


async function sendBuyMenu(sock, jid) {
    const hasNewOffers = directoryHasNewProducts(DIRETORIO_OFERTAS);
    const hasNewSpheres = directoryHasNewProducts(DIRETORIO_ESFERAS);
    const hasNewAccounts = exclusiveAccounts.some(isProductNew);

    await sendInteractiveList(sock, jid, {
        fallbackText: `🛍️ *Menu de Compras*\n\nO que você procura?\n\n1️⃣ ⚡ Ofertas Especiais${hasNewOffers ? ' (🆕)' : ''}\n2️⃣ 🔮 Esferas de Dragão${hasNewSpheres ? ' (🆕)' : ''}\n3️⃣ 🐲 Contas Exclusivas${hasNewAccounts ? ' (🆕)' : ''}\n4️⃣ 🛒 Meu Carrinho\n\n0️⃣ Voltar`,
        state: 'awaiting_buy_choice'
    });
}

async function sendEditProfileMenu(sock, jid) {
    await sendInteractiveList(sock, jid, {
        fallbackText: `📝 *Edição de Perfil*\n\nQual informação atualizar?\n\n1️⃣ 👤 Nome de Usuário\n2️⃣ 🎮 Plataforma Principal\n\n0️⃣ Voltar`,
        state: 'awaiting_edit_profile_choice'
    });
}

async function sendFaqMenu(sock, userJid, currentPath = '') {
    const basePath = DIRETORIO_DUVIDAS;
    const fullPath = path.join(basePath, currentPath);

    try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const directories = entries.filter(e => e.isDirectory()).sort();
        let files = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json')).sort();

        let menuText = '';
        let options = [];

        const directResponseEntity = files.find(f => f.name.toLowerCase() === 'r.json');
        if (directResponseEntity) {
            const content = loadJsonFile(path.join(fullPath, directResponseEntity.name), { text: '' });
            await sendMessage(sock, userJid, { text: content.text });
            files = files.filter(f => f.name.toLowerCase() !== 'r.json');
        }

        const mainContentFile = files.find(f => f.name.toLowerCase() === 'principal.json');
        if (mainContentFile) {
            const content = loadJsonFile(path.join(fullPath, mainContentFile.name), { text: '' });
            menuText += content.text + '\n\n';
        }

        const otherFiles = files.filter(f => f.name.toLowerCase() !== 'principal.json');
        if (directories.length === 0 && otherFiles.length === 0) {
            if (!mainContentFile && !directResponseEntity) {
                menuText += "Não há mais informações neste tópico.\n\n";
            }
            menuText += `\n0️⃣ ↩️ Voltar`;
            await sendMessage(sock, userJid, { text: menuText });
            navigateTo(userJid, "awaiting_faq_choice", { currentPath, options });
        } else {
            let headerText = menuText;
            if (!mainContentFile && currentPath === '') {
                headerText += "❓ *Dúvidas Frequentes - PowerShop*\n\nOlá! Seja bem-vindo(a) à nossa central de ajuda. ✨\n\nAqui você encontrará respostas para as perguntas mais comuns sobre nossos serviços. Navegue pelos tópicos para esclarecer qualquer dúvida!\n\n";
            }

            directories.forEach(dir => {
                options.push({ type: 'dir', name: dir.name });
            });
            otherFiles.forEach(file => {
                options.push({ type: 'file', name: file.name });
            });

            let fallbackText = headerText + "*Escolha um tópico:*\n";
            options.forEach((opt, idx) => {
                const label = opt.type === 'dir' ? opt.name.replace(/^\d+[_\s-]/g, '').replace(/_/g, ' ') : path.basename(opt.name, '.json').replace(/^\d+[_\s-]/g, '').replace(/_/g, ' ');
                fallbackText += `*${idx + 1}* - ${label}\n`;
            });
            fallbackText += `\n0️⃣ ↩️ Voltar`;

            await sendInteractiveList(sock, userJid, {
                fallbackText,
                state: "awaiting_faq_choice",
                stateData: { currentPath, options }
            });
        }

    } catch (error) {
        console.error("Erro ao navegar no FAQ:", error);
        await sendMessage(sock, userJid, { text: "Ocorreu um erro ao carregar a central de ajuda. 😥 Por favor, tente novamente." });
        await sendSupportMenu(sock, userJid);
    }
}

async function startSupportFlow(sock, jid) {
    if (userData[jid]) {
        userData[jid].status = "em_atendimento";
        saveJsonFile(ARQUIVO_USUARIOS, userData);
    }

    await sendInteractiveList(sock, jid, {
        fallbackText: "🤔 Você já consultou nossas Dúvidas Frequentes (FAQ)? Muitos problemas comuns são resolvidos lá.\n\nDeseja mesmo falar com o suporte?\n\n*Digite:*\n1️⃣ Sim, preciso de suporte\n0️⃣ Não, voltar",
        state: 'awaiting_support_confirmation'
    });
}

async function sendSupportMenu(sock, jid) {
    await sendInteractiveList(sock, jid, {
        fallbackText: `💬 *Central de Ajuda e Suporte*\n\nComo podemos ajudar?\n\n1️⃣ ❔ Dúvidas Frequentes (FAQ)\n2️⃣ 👨‍💼 Falar com um Atendente\n\n0️⃣ Voltar`,
        state: 'awaiting_support_choice'
    });
}

// === FLUXO DE COMPRA E CARRINHO ===

function directoryHasProducts(directoryPath) {
    // Usa cache para evitar leituras repetidas de disco
    return getCached(`hasProducts:${directoryPath}`, () => {
        try {
            if (!fs.existsSync(directoryPath)) return false;
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);
                if (entry.isDirectory()) {
                    if (directoryHasProducts(fullPath)) {
                        return true;
                    }
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    const products = loadJsonFile(fullPath, []);
                    if (products.length > 0) {
                        return true;
                    }
                }
            }
        } catch (e) {
            console.error(`Erro ao verificar produtos no diretório ${directoryPath}:`, e);
        }
        return false;
    });
}

async function sendOfferSections(sock, jid) {
    const allSections = fs.readdirSync(DIRETORIO_OFERTAS)
        .filter(file => fs.statSync(path.join(DIRETORIO_OFERTAS, file)).isDirectory());

    const sectionsWithProducts = allSections.filter(section =>
        directoryHasProducts(path.join(DIRETORIO_OFERTAS, section))
    );

    if (sectionsWithProducts.length === 0) {
        await sendMessage(sock, jid, { text: "😔 No momento não temos ofertas especiais disponíveis.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }

    // Pré-calcula hasNew para cada seção uma única vez (otimização de performance)
    const sectionsData = sectionsWithProducts.map((section, index) => {
        const hasNew = directoryHasNewProducts(path.join(DIRETORIO_OFERTAS, section));
        const newEmoji = hasNew ? ' (🆕)' : '';
        return { section, index, newEmoji };
    });



    // Monta o texto fallback para modo legacy usando dados pré-calculados
    let fallbackText = "⚡ *Seções de Ofertas Especiais*\n\nEscolha uma seção para explorar:\n\n";
    sectionsData.forEach(({ section, index, newEmoji }) => {
        fallbackText += `*${index + 1}* - ${section}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_offer_section_choice",
        stateData: { sections: sectionsWithProducts }
    });
}


async function sendOfferList(sock, jid, sectionPath) {
    const fullPath = path.join(DIRETORIO_OFERTAS, sectionPath);
    const productFileName = `${path.basename(sectionPath)}.json`;
    const productFilePath = path.join(fullPath, productFileName);

    let products = loadJsonFile(productFilePath, []);
    const validProducts = products.filter(p => !p.expiryTimestamp || p.expiryTimestamp > Date.now());
    if (validProducts.length < products.length) {
        products.forEach(p => {
            if (p.expiryTimestamp && p.expiryTimestamp <= Date.now() && p.image && fs.existsSync(p.image)) {
                try {
                    fs.unlinkSync(p.image);
                    console.log(`Imagem de oferta expirada removida: ${p.image}`);
                } catch (err) {
                    console.error(`Erro ao remover imagem de oferta expirada ${p.image}:`, err);
                }
            }
        });
        saveJsonFile(productFilePath, validProducts);
    }

    const subdirectories = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && directoryHasProducts(path.join(fullPath, dirent.name)))
        .map(dirent => dirent.name);

    let menuItems = [];
    subdirectories.forEach(sub => {
        menuItems.push({ type: 'dir', name: sub, path: path.join(sectionPath, sub) });
    });
    validProducts.forEach(product => {
        menuItems.push({ type: 'product', name: product.name, data: product });
    });

    menuItems.sort((a, b) => a.name.localeCompare(b.name));

    if (menuItems.length === 0) {
        await sendMessage(sock, jid, { text: "😔 Nenhum item ou sub-seção encontrado aqui.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_offer_choice", { menuItems: [], sectionPath });
        return;
    }



    // Monta o texto fallback para modo legacy
    let fallbackText = `⚡ *Ofertas Especiais: ${sectionPath}*\n\nEscolha uma opção para explorar:\n\n`;
    menuItems.forEach((item, index) => {
        let newEmoji = '';
        if (item.type === 'dir') {
            const hasNew = directoryHasNewProducts(path.join(DIRETORIO_OFERTAS, item.path));
            if (hasNew) newEmoji = ' (🆕)';
        } else if (item.type === 'product') {
            if (isProductNew(item.data)) newEmoji = ' (🆕)';
        }
        fallbackText += `*${index + 1}* - ${item.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_offer_choice",
        stateData: { menuItems, sectionPath }
    });
}



async function sendOfferDetails(sock, jid, offer, sectionPath) {
    const user = userData[jid];
    const userLang = getUserLanguage(jid);
    const price = `${await formatCurrencyByLanguage(offer.price || 0, userLang)}`;
    const newEmoji = isProductNew(offer) ? ' (🆕)' : '';
    let caption = `✨ *${offer.name}${newEmoji}*\n\n`;

    let description = offer.description;
    if (offer.price === 19.99) {
        description = `ℹ Valor mínimo de 19,99.\nPodendo ser mínimamente menor, igual ou maior que o apresentado no jogo\n\n${offer.description}`;
    }
    caption += `${description}\n\n`;

    let platformImage = offer.image || null;
    if (user && user.plataforma && offer.basePrices) {
        const platformKeyMap = {
            "Android/Play Store": "google",
            "Microsoft/PC": "microsoft",
            "iOS/Apple Store": "ios"
        };
        const platformKey = platformKeyMap[user.plataforma];

        if (platformKey && offer.basePrices[platformKey] && offer.basePrices[platformKey] > 0) {
            const basePrice = offer.basePrices[platformKey];
            const economy = basePrice - offer.price;
            const basePriceFormatted = `${await formatCurrencyByLanguage(basePrice || 0, userLang)}`;
            const economyFormatted = `${await formatCurrencyByLanguage(economy || 0, userLang)}`;
            caption += `*Preço na ${user.plataforma}:* ~${basePriceFormatted}~\n`;
            caption += `*Nosso Preço:* *${price}*\n`;
            if (economy > 0) {
                caption += `*Sua Economia:* *${economyFormatted}* 🤑\n`;
            }
        } else {
            caption += `*Valor:* ${price}\n`;
        }
    } else {
        caption += `*Valor:* ${price}\n`;
    }

    caption += `\n*O que deseja fazer?*\n\n1️⃣ 🛒 Adicionar ao Carrinho\n0️⃣ ↩️ Voltar à lista de ofertas`;
    try {
        if (platformImage && fs.existsSync(platformImage)) {
            const stats = fs.statSync(platformImage);
            if (stats.size > 0) {
                const imageBuffer = fs.readFileSync(platformImage);
                if (imageBuffer && imageBuffer.length > 0) {
                    await sendMessage(sock, jid, {
                        image: imageBuffer,
                        caption,
                    });
                } else {
                    console.log("Imagem vazia, enviando apenas texto.");
                    await sendMessage(sock, jid, { text: caption });
                }
            } else {
                console.log("Arquivo de imagem vazio, enviando apenas texto.");
                await sendMessage(sock, jid, { text: caption });
            }
        } else {
            await sendMessage(sock, jid, { text: caption });
        }
    } catch (e) {
        console.error("Falha ao enviar imagem da oferta.", e);
        await sendMessage(sock, jid, { text: caption });
    }
    navigateTo(jid, "awaiting_add_to_cart_confirmation", {
        product: offer,
        type: "oferta",
        sectionPath: sectionPath
    });
}


async function sendCartView(sock, jid) {
    if (!cartData[jid] || !cartData[jid].id) {
        cartData[jid] = {
            id: generateOrderId(),
            items: [],
            appliedCoupon: null
        };
        saveJsonFile(ARQUIVO_CARRINHOS, cartData);
    }

    const userCartData = cartData[jid];
    const userCart = userCartData.items || [];

    if (userCart.length === 0) {
        await sendMessage(sock, jid, {
            text: `🛒 *Seu Carrinho (ID: ${userCartData.id})*\n\nSeu carrinho de compras está vazio no momento.\n\nDigite *0* para Continuar Comprando.`,
        });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }

    let cartText = `🛒 *Seu Carrinho (ID: ${userCartData.id})*\n\n`;
    cartText += "⚠️ *Atenção:* Algumas ofertas podem variar de conta para conta. Certifique-se de que todas as ofertas selecionadas estão ativas em sua conta do jogo antes de prosseguir.\n\n";
    cartText += "*Itens no seu carrinho:*\n";

    let subtotal = userCart.reduce((sum, item) => sum + (item.price || 0), 0);
    const userLang = getUserLanguage(jid);

    for (const item of userCart) {
        const itemPriceFormatted = await formatCurrencyByLanguage(item.price || 0, userLang);
        cartText += `> • ${item.name} - *${itemPriceFormatted}*\n`;
    }

    const subtotalFormatted = await formatCurrencyByLanguage(subtotal || 0, userLang);
    cartText += `\n*Subtotal:* ${subtotalFormatted}\n`;

    let finalTotal = subtotal;
    let discountMessages = [];
    const appliedCouponCode = userCartData.appliedCoupon;
    let appliedCoupon = null;

    if (userData[jid]?.hasInviteDiscount) {
        const discountAmount = subtotal * 0.05;
        finalTotal -= discountAmount;
        const discountFmt = await formatCurrencyByLanguage(discountAmount || 0, userLang);
        discountMessages.push(`*Desconto de Convite (5%):* -${discountFmt}`);
    }
    else if (appliedCouponCode && couponData[appliedCouponCode]) {
        appliedCoupon = couponData[appliedCouponCode];
        if (appliedCoupon.minValue && subtotal < appliedCoupon.minValue) {
            const minFmt = await formatCurrencyByLanguage(appliedCoupon.minValue || 0, userLang);
            discountMessages.push(`(O cupom *${appliedCoupon.name}* foi removido, pois o subtotal é menor que ${minFmt})`);
            userCartData.appliedCoupon = null;
            saveJsonFile(ARQUIVO_CARRINHOS, cartData);
        } else {
            let discountAmount = 0;
            if (appliedCoupon.type === 'percentage') {
                discountAmount = subtotal * (appliedCoupon.value / 100);
                if (appliedCoupon.maxValue && discountAmount > appliedCoupon.maxValue) {
                    discountAmount = appliedCoupon.maxValue;
                }
            } else {
                discountAmount = appliedCoupon.value;
            }
            finalTotal -= discountAmount;
            const discountFmt = await formatCurrencyByLanguage(discountAmount || 0, userLang);
            discountMessages.push(`*Cupom (${appliedCoupon.name}):* -${discountFmt}`);
        }
    }

    let progressiveDiscountApplied = false;
    let nextTierMessage = "";
    if (!userData[jid]?.hasInviteDiscount && !userCartData.appliedCoupon) {
        let progressiveDiscount = null;
        for (let i = DISCOUNT_TIERS.length - 1; i >= 0; i--) {
            if (subtotal >= DISCOUNT_TIERS[i].threshold) {
                progressiveDiscount = DISCOUNT_TIERS[i];
                break;
            }
        }
        if (progressiveDiscount) {
            const discountAmount = subtotal * progressiveDiscount.discount;
            finalTotal = subtotal - discountAmount;
            const discountPercentage = (progressiveDiscount.discount * 100).toFixed(0);
            const discFmt = await formatCurrencyByLanguage(discountAmount || 0, userLang);
            discountMessages.push(`*Desconto Progressivo (${discountPercentage}%):* -${discFmt}`);
            progressiveDiscountApplied = true;
        }
    }

    let nextTier = DISCOUNT_TIERS.find(tier => subtotal < tier.threshold);
    if (nextTier) {
        const remaining = nextTier.threshold - subtotal;
        const barLength = 10;
        const progress = Math.min(barLength, Math.floor((subtotal / nextTier.threshold) * barLength));
        const progressBar = `🛍️${'█'.repeat(progress)}${'░'.repeat(barLength - progress)}🎁`;
        const nextDiscountPercentage = (nextTier.discount * 100).toFixed(0);
        const remainingFmt = await formatCurrencyByLanguage(remaining || 0, userLang);
        nextTierMessage = `\n${progressBar}\nFaltam apenas *${remainingFmt}* para você desbloquear ${nextTier.message} Adicione mais itens para garantir seu prêmio!\n`;
    }

    if (discountMessages.length > 0) {
        cartText += discountMessages.join('\n') + '\n';
    }

    const finalTotalFmt = await formatCurrencyByLanguage(finalTotal || 0, userLang);
    cartText += `*Total:* ${finalTotalFmt}\n`;
    const powerPointsEarned = Math.floor(finalTotal * 100);
    cartText += `*PowerPoints a ganhar:* ${powerPointsEarned} ✨\n`;

    if (nextTierMessage) {
        cartText += nextTierMessage;
    }

    // Envia tudo em uma única mensagem (detalhes + menu)
    await sendInteractiveList(sock, jid, {
        fallbackText: `${cartText}\n\n*O que deseja fazer?*\n\n1️⃣ ✅ Finalizar Compra\n2️⃣ 🎟️ Adicionar Cupom\n3️⃣ 🗑️ Esvaziar Carrinho\n4️⃣ ✨ Comprar com PowerPoints\n\n0️⃣ Continuar Comprando`,
        state: 'awaiting_cart_action',
        stateData: { finalTotal }
    });
}


async function sendCartViewWithPowerPoints(sock, jid) {
    const BRL_TO_PP = 2000;
    const userCart = (cartData[jid] || { items: [] }).items;
    const userPoints = userData[jid]?.powerPoints || 0;
    if (userCart.length === 0) {
        await sendMessage(sock, jid, { text: "Seu carrinho está vazio." });
        await sendBuyMenu(sock, jid);
        return;
    }

    let totalInBRL = 0;
    userCart.forEach(item => { totalInBRL += (item.price || 0); });
    const totalInPP = Math.floor(totalInBRL * BRL_TO_PP);

    let ppCartText = "🛒 *Carrinho em PowerPoints* ✨\n\n";
    userCart.forEach((item) => {
        const itemPriceInPP = Math.floor((item.price || 0) * BRL_TO_PP);
        ppCartText += `> • ${item.name} - *${itemPriceInPP.toLocaleString('pt-BR')} PowerPoints*\n`;
    });
    ppCartText += `\n-----------------------------------\n`;
    ppCartText += `*Total do Pedido:* ${totalInPP.toLocaleString('pt-BR')} PowerPoints\n`;
    ppCartText += `*Seus Pontos:* ${userPoints.toLocaleString('pt-BR')} PowerPoints\n`;

    const hasEnoughPoints = userPoints >= totalInPP;
    if (hasEnoughPoints) {
        const remainingPoints = userPoints - totalInPP;
        ppCartText += `*Pontos restantes após a compra:* ${remainingPoints.toLocaleString('pt-BR')}\n`;
    } else {
        const missingPoints = totalInPP - userPoints;
        ppCartText += `*Pontos Faltantes:* ${missingPoints.toLocaleString('pt-BR')} 😟\n`;
        ppCartText += `Você não possui PowerPoints suficientes para esta compra.\n`;
    }

    const userLang = getUserLanguage(jid);
    const symbol = (LANGUAGE_CURRENCY[userLang] && LANGUAGE_CURRENCY[userLang].symbol) ? LANGUAGE_CURRENCY[userLang].symbol : 'R$';



    // Texto fallback para modo legacy
    let fallbackText = ppCartText + "\n\n*O que deseja fazer?*\n\n";
    if (hasEnoughPoints) {
        fallbackText += `1️⃣ ✅ Finalizar Compra com Pontos\n`;
    }
    fallbackText += `0️⃣ 💵 Voltar para valores em ${symbol}`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_powerpoint_purchase_confirmation",
        stateData: { totalInPP, hasEnoughPoints }
    });
}

async function handlePowerPointsPayment(sock, jid, totalInPP) {
    const user = userData[jid];
    if (!user || (user.powerPoints || 0) < totalInPP) {
        await sendMessage(sock, jid, { text: "❌ Você não tem PowerPoints suficientes." });
        await sendCartViewWithPowerPoints(sock, jid);
        return;
    }

    user.powerPoints -= totalInPP;
    saveJsonFile(ARQUIVO_USUARIOS, userData);

    const userCart = (cartData[jid] || { items: [] }).items;
    // O total em R$ é 0, pois foi pago com pontos.
    await promptForAccountDetails(sock, jid, 0, userCart, { paymentMethod: 'powerpoints' });
}

async function handleSuccessfulPayment(sock, jid, total, userCart, selectedAccount, options = {}) {
    const isManualOrder = options.paymentMethod === 'manual_order' || options.paymentMethod === 'manual_order_creation';
    const clientName = userData[jid]?.nome || jid.split("@")[0];
    const clientNumber = jid.split('@')[0];
    const userCartData = cartData[jid] || { items: [], appliedCoupon: null, id: generateOrderId() };
    const newOrderId = userCartData.id || generateOrderId();

    // Verifica se o cliente já tem um pedido pendente ou em atendimento
    const existingOrderIndexV = pendingOrdersV.findIndex(order => order.clientJid === jid && (order.status === 'pendente' || order.status === 'em_atendimento'));
    const existingOrderIndex = pendingOrders.findIndex(order => order.clientJid === jid && (order.status === 'pendente' || order.status === 'em_atendimento'));

    if (existingOrderIndexV > -1 || existingOrderIndex > -1) {
        const isVerifiedQueue = existingOrderIndexV > -1;
        const orderIndex = isVerifiedQueue ? existingOrderIndexV : existingOrderIndex;
        const orderList = isVerifiedQueue ? pendingOrdersV : pendingOrders;
        const orderFile = isVerifiedQueue ? ARQUIVO_PEDIDOS_V : ARQUIVO_PEDIDOS;

        const existingOrder = orderList[orderIndex];
        existingOrder.items.push(...userCart);
        existingOrder.total += total;

        saveJsonFile(orderFile, orderList);

        const itemsAddedText = userCart.map(item => `> • 1x ${item.name}`).join('\n');
        await sendMessage(sock, jid, {
            text: `✅ *Itens Adicionados com Sucesso!*\n\nSua nova compra foi integrada ao seu pedido anterior (ID: *#${existingOrder.id}*).\n\n*Itens Adicionados:*\n${itemsAddedText}\n\nSeu pedido permanece na mesma posição na fila e será processado em breve!`
        });

        // Limpa o carrinho e estado do usuário atual
        delete cartData[jid];
        saveJsonFile(ARQUIVO_CARRINHOS, cartData);
        delete userState[jid];
        return; // Encerra a função aqui
    }


    const newOrder = {
        id: newOrderId,
        clientJid: jid,
        clientName: clientName,
        total: total,
        items: userCart,
        facebookLogin: selectedAccount.login,
        facebookPassword: selectedAccount.password,
        dragonCityId: selectedAccount.gameId,
        timestamp: new Date().toISOString(),
        status: 'pendente',
        atendido_por: null,
        paymentId: options.paymentId || null,
        paymentMethod: options.paymentMethod || 'pix' // Adiciona o método de pagamento
    };

    if (isManualOrder) {
        if (!purchaseHistoryData[jid]) {
            purchaseHistoryData[jid] = [];
        }
        purchaseHistoryData[jid].push({
            id: newOrder.id,
            timestamp: newOrder.timestamp,
            items: newOrder.items,
            totalPaid: newOrder.total,
            powerPointsEarned: 0,
            statusDisplay: 'Em Processamento',
            paymentMethod: 'manual'
        });
        saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
    }

    if (selectedAccount.verified) {
        newOrder.sourceQueue = 'verified';
        pendingOrdersV.push(newOrder);
        saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
    } else {
        newOrder.sourceQueue = 'unverified';
        pendingOrders.push(newOrder);
        saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
    }

    if (isManualOrder) {
        const itemsText = newOrder.items.map(item => `> • ${item.name}`).join('\n');
        let confirmationText = `✅ *Pedido Recebido!* (ID: #${newOrder.id})\n\n`;
        confirmationText += `Obrigado, ${newOrder.clientName}! 🙏\n`;
        confirmationText += `Sua compra foi registrada. Um de nossos vendedores já recebeu seus dados para iniciar a entrega.\n\n`;
        confirmationText += `Caso queira adquirir outro item, pode comprar normalmente. Ele será adicionado ao mesmo pedido e processado em conjunto.\n\n`;
        confirmationText += `*Itens Adquiridos:*\n${itemsText}\n\n`;

        if (!selectedAccount.verified) {
            confirmationText += `⚠️ Sua conta não é verificada. Seu pedido foi colocado na fila padrão.\n\n`;
            confirmationText += `Para ter prioridade em suas próximas compras, acesse o menu, vá em 'Meu Perfil' > 'Gerenciar contas' e solicite a verificação.\n\n`;
        }

        confirmationText += `Por favor, aguarde. Avisaremos assim que o processo de compra for iniciado!`;
        await sendMessage(sock, jid, { text: confirmationText });
    } else {
        const userLang = getUserLanguage(jid);
        const totalFormatted = await formatCurrencyByLanguage(total || 0, userLang);
        const buyerItemsText = userCart.map(item => `> • ${item.name}`).join('\n');
        let buyerConfirmationText = `✅ *Pedido Recebido!* (ID: *#${newOrder.id}*)\n\nObrigado, ${clientName}! 🙏\nSua compra de ${totalFormatted} foi registrada. Um de nossos vendedores já recebeu seus dados para iniciar a entrega.\n\n_Caso queira adquirir outro item, pode comprar normalmente. Ele será adicionado ao mesmo pedido e processado em conjunto._\n\n*Itens Adquiridos:*\n${buyerItemsText}\n\n`;

        if (selectedAccount.verified) {
            buyerConfirmationText += "🌟 *Sua conta é verificada!* Seu pedido foi colocado na fila de atendimento prioritário.\n\n";
        } else {
            buyerConfirmationText += "⚠️ *Sua conta não é verificada.* Seu pedido foi colocado na fila padrão.\n\nPara ter prioridade em suas próximas compras, acesse o menu, vá em 'Meu Perfil' > 'Gerenciar contas' e solicite a verificação.\n\n";
        }
        buyerConfirmationText += "Por favor, aguarde. Avisaremos assim que o processo de compra for iniciado!";
        await sendMessage(sock, jid, { text: buyerConfirmationText });
    }

    const buyerJids = Object.keys(compradoresData);
    const pendingCount = pendingOrders.length + pendingOrdersV.length;
    const buyerNotificationText = `🔔 *Novo Cliente na Fila!* \n\nHá um total de *${pendingCount}* clientes aguardando atendimento. Digite */pedidos* para começar!`;

    for (const buyerJid of buyerJids) {
        if (compradoresData[buyerJid].notificacoes) {
            try { await sendMessage(sock, buyerJid, { text: buyerNotificationText }); }
            catch (e) { console.error(`Falha ao notificar o comprador ${buyerJid}:`, e); }
        }
    }

    if (options.creatorJid) {
        delete userState[options.creatorJid];
        await sendMessage(sock, options.creatorJid, { text: `✅ Pedido para *${newOrder.clientName}* criado com sucesso e adicionado à fila.` });
    }


    if (!isManualOrder) {
        const powerPointsEarned = (options.paymentMethod === 'powerpoints') ? 0 : Math.floor(total * 100);

        const user = userData[jid];
        if (user && user.invitedBy && (!user.compras || user.compras === 0)) {
            const inviterCode = user.invitedBy;
            if (invitationData[inviterCode]) {
                const inviterJid = invitationData[inviterCode].ownerJid;

                if (userData[inviterJid]) {
                    userData[inviterJid].powerPoints = (userData[inviterJid].powerPoints || 0) + 500;
                    await sendMessage(sock, inviterJid, { text: `Parabéns! 🎉 O usuário *${clientName}* finalizou a primeira compra e você ganhou *500 PowerPoints*! ✨` });
                }
                if (invitationData[inviterCode].invitedUsers[jid]) {
                    invitationData[inviterCode].invitedUsers[jid].completedPurchase = true;
                }
                saveJsonFile(ARQUIVO_CONVITES, invitationData);
            }
        }

        // Aplicar comissão para apoiador
        const clientUser = userData[jid];
        if (clientUser?.apoiadorCode && apoiadoresData[clientUser.apoiadorCode]) {
            const apoiadorCode = clientUser.apoiadorCode;
            const apoiador = apoiadoresData[apoiadorCode];
            const comissaoApoiador = total * (apoiador.comissao || 0.05); // 5%

            apoiador.ganhosTotais = (apoiador.ganhosTotais || 0) + comissaoApoiador;
            apoiador.caixaBloqueado = (apoiador.caixaBloqueado || 0) + comissaoApoiador;
            apoiador.usos = (apoiador.usos || 0) + 1;

            saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);

            // Notificar apoiador com informações da compra
            try {
                const itemsText = userCart.map(item => item.name).join(', ');
                const supLang = getUserLanguage(apoiador.ownerJid);
                const totalFmt = await formatCurrencyByLanguage(total || 0, supLang);
                const comissaoFmt = await formatCurrencyByLanguage(comissaoApoiador || 0, supLang);
                await sendMessage(sock, apoiador.ownerJid, {
                    text: `💰 *Você ganhou uma comissão de apoiador!*\n\n👤 *${clientName}* acabou de fazer uma compra usando seu código *${apoiadorCode}*!\n\n📦 *Itens comprados:* ${itemsText}\n💵 *Valor da compra:* ${totalFmt}\n💸 *Sua comissão:* ${comissaoFmt}\n\nUse */saque* para verificar seus ganhos.`
                });
            } catch (e) {
                console.error('Erro ao notificar apoiador:', e);
            }
        }

        const appliedCouponCode = userCartData.appliedCoupon;
        if (appliedCouponCode && couponData && couponData[appliedCouponCode]) {
            const coupon = couponData[appliedCouponCode];
            coupon.uses = (coupon.uses || 0) + 1;
            const subtotal = userCart.reduce((sum, item) => sum + (item.price || 0), 0);
            let discountValue = 0;
            if (coupon.type === 'percentage') {
                discountValue = subtotal * (coupon.value / 100);
                if (coupon.maxValue && discountValue > coupon.maxValue) {
                    discountValue = coupon.maxValue;
                }
            } else {
                discountValue = coupon.value;
            }
            coupon.totalDiscountValue = (coupon.totalDiscountValue || 0) + discountValue;
            saveJsonFile(ARQUIVO_CUPONS, couponData);
        }

        const maskedId = selectedAccount.gameId ? selectedAccount.gameId.slice(0, -4) + '****' : 'Não informado';
        const adminItemsText = userCart.map(item => `> • ${item.name}`).join('\n');
        for (const adminJid in adminData) {
            if (adminData[adminJid].notificacoes?.novosPedidos) {
                try {
                    const adminLang = getUserLanguage(adminJid);
                    const totalFmt = await formatCurrencyByLanguage(total || 0, adminLang);
                    const adminNotificationText = `✅ *Nova Venda Registrada para Processamento!* \n\n*ID do Pedido:* ${newOrder.id}\n*Cliente:* ${clientName}\n*Contato:* https://wa.me/${clientNumber}\n*Login Facebook:* \`${selectedAccount.login}\`\n*Senha Facebook:* \`${selectedAccount.password}\`\n*ID do Jogo:* ${maskedId}\n*Total da Compra:* ${totalFmt}\n\n*Itens Adquiridos:*\n${adminItemsText}\n\nEste pedido foi adicionado à fila. Vendedores podem usar o comando */pedidos* para processá-lo.`;
                    await sendMessage(sock, adminJid, { text: adminNotificationText });
                }
                catch (e) { console.error(`Falha ao notificar o admin ${adminJid}:`, e); }
            }
        }

        shopData.vendasRealizadas = (shopData.vendasRealizadas || 0) + 1;
        shopData.faturamentoTotal = (shopData.faturamentoTotal || 0) + total;
        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);

        if (user) {
            user.compras = (user.compras || 0) + 1;
            if (user.hasInviteDiscount) user.hasInviteDiscount = false;

            let totalEconomy = 0;
            const platformKeyMap = { "Android/Play Store": "google", "Microsoft/PC": "microsoft", "iOS/Apple Store": "ios" };
            const userPlatformKey = platformKeyMap[user.plataforma];
            if (Array.isArray(userCart)) {
                userCart.forEach(item => {
                    if (item.basePrices && userPlatformKey && item.basePrices[userPlatformKey] && item.basePrices[userPlatformKey] > item.price) {
                        totalEconomy += item.basePrices[userPlatformKey] - item.price;
                    }
                });
            }
            user.totalEconomizado = (user.totalEconomizado || 0) + totalEconomy;
            user.powerPoints = (user.powerPoints || 0) + powerPointsEarned;

            if (!purchaseHistoryData[jid]) {
                purchaseHistoryData[jid] = [];
            }

            purchaseHistoryData[jid].push({
                id: newOrderId,
                timestamp: new Date().toISOString(),
                items: userCart,
                totalPaid: total,
                powerPointsEarned: powerPointsEarned,
                statusDisplay: 'Em Processamento',
                paymentId: options.paymentId || null,
                paymentMethod: newOrder.paymentMethod
            });
            saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
            saveJsonFile(ARQUIVO_USUARIOS, userData);
        }

        delete cartData[jid];
        saveJsonFile(ARQUIVO_CARRINHOS, cartData);
    }

    delete userState[jid];
}
async function promptForAccountDetails(sock, jid, total, userCart, options = {}) {
    const isManualCreation = options.paymentMethod === 'manual_order_creation';
    const targetJid = isManualCreation ? options.orderData.clientJid : jid;
    const creatorJid = isManualCreation ? jid : null;

    if (!userData[targetJid]) {
        userData[targetJid] = { nome: targetJid.split('@')[0], status: 'navegando', savedAccounts: [] };
        saveJsonFile(ARQUIVO_USUARIOS, userData);
    }
    const targetUser = userData[targetJid];

    if (targetUser && targetUser.savedAccounts && targetUser.savedAccounts.length > 0) {
        let accountMenu = "✅ Sua compra foi aprovada! Para qual conta devemos enviar os produtos? 🤔\n\n*Escolha uma das contas salvas ou adicione uma nova:*\n";
        targetUser.savedAccounts.forEach((acc, i) => {
            const verifiedSymbol = acc.verified ? '🌟' : '';
            accountMenu += `*${i + 1}* - ${acc.alias} ${verifiedSymbol}\n`;
        });
        accountMenu += `\n*${targetUser.savedAccounts.length + 1}* - ➕ Informar novos dados de conta\n\n0️⃣ - Cancelar`;
        await sendMessage(sock, targetJid, { text: accountMenu });
        navigateTo(targetJid, 'awaiting_saved_account_choice', { total, userCart, paymentId: options.paymentId, creatorJid: creatorJid, orderData: options.orderData, paymentMethod: options.paymentMethod });
    } else {
        await sendMessage(sock, targetJid, { text: "✅ Sua compra foi aprovada! Para prosseguirmos com a entrega, por favor, nos informe o *e-mail ou número de telefone* da sua conta do Facebook. 📲" });
        navigateTo(targetJid, 'awaiting_facebook_login', { total, userCart, isSavingNew: true, paymentId: options.paymentId, creatorJid: creatorJid, orderData: options.orderData, paymentMethod: options.paymentMethod });
    }
}


async function checkPixPaymentStatus(sock, jid, paymentId, total, userCart, isGenerated = false, attendantJid = null) {
    try {
        console.log(`Verificando status do pagamento PIX Asaas: ${paymentId}`);
        const result = await asaas.getPaymentDetails(paymentId);

        if (result && (result.status === 'RECEIVED' || result.status === 'CONFIRMED')) {
            console.log(`Pagamento PIX ${paymentId} aprovado! Status: ${result.status}`);
            if (userState[jid] && userState[jid].paymentCheckTimeout) {
                clearTimeout(userState[jid].paymentCheckTimeout);
            }

            if (isGenerated && attendantJid) {
                await sendMessage(sock, jid, { text: "✅ Pagamento confirmado! Dando continuidade ao seu atendimento." });
                await sendMessage(sock, attendantJid, { text: "✅ Pagamento do cliente confirmado. Você pode prosseguir." });
                const order = pendingOrders.find(o => o.clientJid === jid && o.atendido_por === attendantJid) || pendingOrdersV.find(o => o.clientJid === jid && o.atendido_por === attendantJid);
                if (order) {
                    navigateTo(attendantJid, 'in_direct_chat', { partnerJid: jid, orderId: order.id });
                }
            } else {
                await promptForAccountDetails(sock, jid, total, userCart, { paymentId });
            }

        } else if (result && result.status === 'PENDING') {
            const timeoutId = setTimeout(() => checkPixPaymentStatus(sock, jid, paymentId, total, userCart, isGenerated, attendantJid), 20000);
            if (userState[jid]) {
                userState[jid].paymentCheckTimeout = timeoutId;
            }
        } else if (result && (result.status === 'OVERDUE' || result.status === 'REFUNDED' || result.status === 'REFUND_REQUESTED')) {
            console.log(`Pagamento PIX ${paymentId} falhou ou foi cancelado. Status: ${result.status}`);
            await sendMessage(sock, jid, { text: "⚠️ O seu pagamento não foi aprovado ou foi cancelado. Se acredita que isso é um erro, por favor, tente novamente ou entre em contato com o suporte." });
            delete userState[jid];
            await sendCartView(sock, jid);
        } else {
            // Status desconhecido, continua verificando
            const timeoutId = setTimeout(() => checkPixPaymentStatus(sock, jid, paymentId, total, userCart, isGenerated, attendantJid), 20000);
            if (userState[jid]) {
                userState[jid].paymentCheckTimeout = timeoutId;
            }
        }
    } catch (error) {
        console.error("Erro ao verificar status do pagamento PIX:", error);
        await sendMessage(sock, jid, { text: "❌ Ocorreu um erro ao verificar seu pagamento. Por favor, contate o suporte." });
        delete userState[jid];
    }
}

async function checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts = 0) {
    if (userState[jid]) {
        delete userState[jid].paymentCheckTimeout; // Limpa o timeout anterior
    }
    const maxAttempts = 15;
    if (attempts >= maxAttempts) {
        console.log(`Verificação para pagamento ${paymentId} expirou.`);
        await sendMessage(sock, jid, { text: "⏰ O tempo para verificação do pagamento expirou. Se você concluiu o pagamento, ele será processado manualmente em breve. Caso contrário, por favor, tente novamente ou contate o suporte." });
        delete userState[jid];
        return;
    }

    try {
        console.log(`Verificando status do pagamento com Cartão Asaas: ${paymentId}, tentativa ${attempts + 1}`);

        const result = await asaas.getPaymentDetails(paymentId);

        if (result && (result.status === 'CONFIRMED' || result.status === 'RECEIVED')) {
            console.log(`Pagamento com Cartão ${paymentId} aprovado! Status: ${result.status}`);
            if (userState[jid] && userState[jid].paymentCheckTimeout) {
                clearTimeout(userState[jid].paymentCheckTimeout);
            }
            await promptForAccountDetails(sock, jid, total, userCart, { paymentId });
        } else if (result && result.status === 'PENDING') {
            const timeoutId = setTimeout(() => checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts + 1), 10000);
            if (userState[jid]) {
                userState[jid].paymentCheckTimeout = timeoutId;
            }
        } else if (result && (result.status === 'OVERDUE' || result.status === 'REFUNDED' || result.status === 'REFUND_REQUESTED')) {
            console.log(`Pagamento com Cartão ${paymentId} falhou. Status: ${result.status}`);
            await sendMessage(sock, jid, { text: "❌ Seu pagamento não foi aprovado. Por favor, verifique os dados do cartão e tente novamente ou escolha outro método." });
            delete userState[jid];
            await sendCartView(sock, jid);
        } else {
            // Status desconhecido, continua verificando
            const timeoutId = setTimeout(() => checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts + 1), 10000);
            if (userState[jid]) {
                userState[jid].paymentCheckTimeout = timeoutId;
            }
        }
    } catch (error) {
        console.error("Erro ao verificar status do pagamento com cartão:", error);
        const timeoutId = setTimeout(() => checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts + 1), 10000);
        if (userState[jid]) {
            userState[jid].paymentCheckTimeout = timeoutId;
        }
    }
}

async function sendPaymentMethodChoice(sock, jid, finalTotal) {
    const userLang = getUserLanguage(jid);
    const totalFmt = await formatCurrencyByLanguage(finalTotal || 0, userLang);



    const fallbackText = `💳 *Métodos de Pagamento*\n\nQual método você prefere utilizar?\n\n*Opções:*\n1️⃣ PIX (Valor: ${totalFmt})\n2️⃣ Cartão de Crédito (Valor: ${totalFmt})\n3️⃣ Outro Método (Cripto, Paypal, etc.)\n\n0️⃣ 🛒 Voltar ao carrinho`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_payment_method_choice',
        stateData: { finalTotal }
    });
}

async function sendOtherPaymentMethodsMenu(sock, jid) {

    const fallbackText = `💳 *Métodos de Pagamento*\n\nQual método alternativo você prefere utilizar?\n\n❗Caso seja de outro país recomendo usar a wise, um banco internacional que aceita pagamentos de diversos países, podendo pagar via pix através da tela anterior\n\n*Opções:*\n1️⃣ Cripto (BINANCE)\n2️⃣ CRIPTO (DEMAIS CORRETORAS)\n3️⃣ PayPal\n4️⃣ Outro meio\n\n0️⃣ 🛒 Voltar ao carrinho`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_other_payment_method_choice'
    });
}


async function startPixCheckoutProcess(sock, jid, finalTotal, isGenerated = false, attendantJid = null) {
    const userCart = (cartData[jid] || { items: [] }).items;
    const userProfile = userData[jid];

    const description = isGenerated ? `Pagamento customizado PowerShop` : userCart.map(item => item.name).join(', ');
    await sendMessage(sock, jid, { text: "⏳ Um momento, estamos gerando seu código de pagamento PIX..." });
    try {
        const cpfFromProfile = userProfile && typeof userProfile.cpf === 'string' ? userProfile.cpf.replace(/[^\d]/g, '') : null;
        if (!cpfFromProfile || cpfFromProfile.length !== 11) {
            await sendMessage(sock, jid, { text: "📝 Para gerar a cobrança via PIX, precisamos do seu CPF. Envie apenas os 11 dígitos (ex: 12345678901).\n\nDigite 0 para cancelar." });
            navigateTo(jid, 'awaiting_pix_cpf', { finalTotal, isGenerated, attendantJid });
            return;
        }
        const emailFromProfile = userProfile && isValidEmail(userProfile.email) ? userProfile.email : null;
        if (!emailFromProfile) {
            await sendMessage(sock, jid, { text: "📧 Precisamos do seu e-mail para enviar o comprovante.\n\nEnvie seu e-mail (ex: nome@dominio.com). Digite 0 para cancelar." });
            navigateTo(jid, 'awaiting_pix_email', { finalTotal, isGenerated, attendantJid });
            return;
        }

        const customerData = {
            name: userProfile.nome || 'Cliente PowerShop',
            email: emailFromProfile,
            cpfCnpj: cpfFromProfile,
            phone: jid.split('@')[0],
            mobilePhone: jid.split('@')[0]
        };

        const customer = await asaas.createOrGetCustomer(customerData);

        // Criar pagamento PIX
        const today = new Date();
        const dueDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

        const totalComTaxas = calculatePixTotalWithFees(finalTotal);
        const paymentData = {
            customerId: customer.id,
            value: Number(totalComTaxas.toFixed(2)),
            dueDate: dueDate,
            description: `Pedido PowerShop: ${description.substring(0, 100)}`
        };

        const pixPayment = await asaas.createPixPayment(paymentData);
        const paymentId = pixPayment.id;

        // Decodificar imagem do QR Code (vem em base64)
        const qrCodeBase64 = pixPayment.qrCode.encodedImage;
        const qrCodeCopyPaste = pixPayment.qrCode.payload;

        const qrCodeBuffer = Buffer.from(qrCodeBase64, 'base64');
        let caption = "✅ *Pagamento PIX gerado!* Escaneie o QR Code acima para pagar.";
        caption += "\n\n⏰ Este código é válido até o final do dia.";
        const userLang = getUserLanguage(jid);
        const totalFmt = await formatCurrencyByLanguage(totalComTaxas, userLang);
        caption += `\n💵 Valor: ${totalFmt} (inclui taxas)`;
        caption += "\n✅ A confirmação pode levar alguns minutos. *Aguarde após o pagamento.*";
        caption += "\n\n*Digite 0 para cancelar e escolher outro método.*";

        await sendMessage(sock, jid, {
            image: qrCodeBuffer,
            caption: caption
        });
        await sendMessage(sock, jid, { text: `Ou utilize o código *Copia e Cola* abaixo: 👇` });
        await sendMessage(sock, jid, { text: qrCodeCopyPaste });

        navigateTo(jid, 'awaiting_pix_payment');
        pixPaymentMap[paymentId] = { jid, finalTotal, userCart, isGenerated, attendantJid };

        const timeoutId = setTimeout(() => checkPixPaymentStatus(sock, jid, paymentId, finalTotal, userCart, isGenerated, attendantJid), 20000);
        if (userState[jid]) {
            userState[jid].paymentCheckTimeout = timeoutId;
        }

    } catch (error) {
        console.error("!! ERRO AO CRIAR PAGAMENTO PIX NO ASAAS !!", error.message || error);
        await sendMessage(sock, jid, { text: `❌ Desculpe, ocorreu um erro ao gerar seu pagamento: ${error.message}\n\nPor favor, tente novamente ou contate o suporte.` });
        delete userState[jid];
        await sendMainMenu(sock, jid);
    }
}

async function startCardCheckoutProcess(sock, jid, totalAmount) {
    const userCart = (cartData[jid] || { items: [] }).items;
    if (userCart.length === 0) {
        await sendMessage(sock, jid, { text: "Seu carrinho está vazio." });
        return;
    }

    // No Asaas, o pagamento é mais simples - sem taxas de parcelamento explícitas
    let menuText = "💳 *Pagamento com Cartão de Crédito*\n\n";
    menuText += `*Valor total:* R$ ${totalAmount.toFixed(2).replace('.', ',')}\n\n`;
    menuText += "Em quantas vezes você deseja parcelar?\n\n";

    const userLang = getUserLanguage(jid);
    for (let i = 1; i <= 12; i++) {
        const totalComTaxas = calculateCardTotalWithFees(totalAmount, i);
        const installmentValue = totalComTaxas / i;
        const installmentFmt = await formatCurrencyByLanguage(installmentValue, userLang);
        menuText += `*${i}x* de ${installmentFmt} (inclui taxas)\n`;
    }
    menuText += "\nDigite o número de parcelas (1 a 12), ou 0 para cancelar.";

    await sendMessage(sock, jid, { text: menuText });
    navigateTo(jid, 'awaiting_installments_choice', { totalAmount });
}

async function startCardLinkCheckoutProcess(sock, jid, totalAmount, installments) {
    const userCart = (cartData[jid] || { items: [] }).items;
    const userProfile = userData[jid] || {};
    const emailFromProfile = isValidEmail(userProfile.email) ? userProfile.email : null;
    if (!emailFromProfile) {
        await sendMessage(sock, jid, { text: "📧 Antes de gerar o link de pagamento, envie seu e-mail (ex: nome@dominio.com). Digite 0 para cancelar." });
        navigateTo(jid, 'awaiting_card_email', { totalAmount, installments });
        return;
    }

    const description = userCart.map(item => item.name).join(', ');
    const name = `Pedido PowerShop`;
    try {
        const totalComTaxas = calculateCardTotalWithFees(totalAmount, installments);
        const link = await asaas.createPaymentLink({
            name,
            description: `Pedido: ${description.substring(0, 120)}`,
            value: Number(totalComTaxas.toFixed(2)),
            billingType: 'CREDIT_CARD',
            chargeType: 'INSTALLMENT',
            maxInstallmentCount: Math.min(Math.max(parseInt(installments) || 12, 1), 12)
        });
        if (!link || !link.url) {
            throw new Error('Link de pagamento indisponível.');
        }
        const userLang = getUserLanguage(jid);
        const totalFmt = await formatCurrencyByLanguage(totalComTaxas, userLang);
        await sendMessage(sock, jid, { text: `💳 Realize o pagamento pelo link abaixo (cartão de crédito):\n\n${link.url}\n\nValor total: ${totalFmt} (inclui taxas)\n\nApós pagar, aguarde a confirmação.` });
        paymentLinkMap[link.id] = { jid, totalAmount, userCart };
        navigateTo(jid, 'awaiting_card_link_payment', { linkId: link.id, totalAmount, userCart });
    } catch (error) {
        await sendMessage(sock, jid, { text: `❌ Não foi possível gerar o link de pagamento: ${error.message}` });
    }
}


// Lista de e-mails finalizados para Admin/Gerenciador, com opções atualizadas
async function sendAdminEmailsList(sock, jid) {
    const allEmailsRaw = Object.values(finishedEmails).flat();
    if (allEmailsRaw.length === 0) {
        await sendMessage(sock, jid, { text: "Nenhum e-mail finalizado registrado ainda.\n\n*0* - Voltar" });
        navigateTo(jid, "awaiting_admin_choice");
        return;
    }

    const buyerGroups = {};
    allEmailsRaw.forEach(item => {
        if (!buyerGroups[item.buyerName]) {
            buyerGroups[item.buyerName] = [];
        }
        buyerGroups[item.buyerName].push(item);
    });


    let emailCounter = 1;
    const options = { buyers: {}, emails: {} };

    for (const buyerName in buyerGroups) {
        const emails = buyerGroups[buyerName];
        if (emails.length > 0) {
            // Adicionar opção para apagar todos os e-mails de um comprador
            const xKey = `X${Object.keys(options.buyers).length + 1}`;
            options.buyers[xKey] = buyerName;


            emails.forEach(item => {
                const now = new Date();
                const limitTime = new Date(item.originalTimestamp);
                limitTime.setHours(limitTime.getHours() + 2);
                const diffMinutes = (limitTime - now) / (1000 * 60);
                let emoji = '⚫';
                if (diffMinutes > 90) emoji = '🟢';
                else if (diffMinutes > 60) emoji = '🟡';
                else if (diffMinutes > 30) emoji = '🟠';
                else if (diffMinutes > 0) emoji = '🔴';
                const formattedLimitTime = limitTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: "America/Sao_Paulo" });

                options.emails[emailCounter] = item;
                emailCounter++;
            });
        }
    }

    // Adicionar opção para apagar TODOS os e-mails

    // Adicionar opção de voltar

    // Texto de fallback para modo legacy
    let fallbackText = "📧 *E-mails de Contas Microsoft Finalizadas*\n\nSelecione um e-mail para remover ou use *X* para apagar todos os e-mails de um comprador.\n\n";
    emailCounter = 1;
    for (const buyerName in buyerGroups) {
        const emails = buyerGroups[buyerName];
        if (emails.length > 0) {
            fallbackText += `*${buyerName.toUpperCase()}* - [Digite *X${Object.keys(options.buyers).length + 1}* para apagar todos]\n`;

            emails.forEach(item => {
                const now = new Date();
                const limitTime = new Date(item.originalTimestamp);
                limitTime.setHours(limitTime.getHours() + 2);
                const diffMinutes = (limitTime - now) / (1000 * 60);
                let emoji = '⚫';
                if (diffMinutes > 90) emoji = '🟢';
                else if (diffMinutes > 60) emoji = '🟡';
                else if (diffMinutes > 30) emoji = '🟠';
                else if (diffMinutes > 0) emoji = '🔴';
                const formattedLimitTime = limitTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: "America/Sao_Paulo" });

                fallbackText += `*${emailCounter}* - ${item.email} (${emoji} ${formattedLimitTime})\n`;
                emailCounter++;
            });
            fallbackText += `-----------------------------------\n`;
        }
    }
    fallbackText += "\nDigite *X* para apagar TODOS os e-mails de TODOS os compradores.\n\n*0* - Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_email_management_choice",
        stateData: options
    });
}


// === FLUXO DE COMPRA DE ESFERAS ===

function calculateSpherePrice(rarity, quantity) {
    const config = SPHERE_PRICING[rarity];
    if (!config) return 0;

    const packsOf100 = Math.floor(quantity / 100);
    let discount = packsOf100 > 0 ? packsOf100 - 1 : 0;
    if (discount > 5) discount = 5;

    let pricePer100 = config.discountRange.max - discount;
    if (pricePer100 < config.discountRange.min) {
        pricePer100 = config.discountRange.min;
    }

    const pricePerSphere = pricePer100 / 100;
    return pricePerSphere * quantity;
}


async function sendSphereSections(sock, jid) {
    const allSections = fs.readdirSync(DIRETORIO_ESFERAS)
        .filter(file => fs.statSync(path.join(DIRETORIO_ESFERAS, file)).isDirectory());

    const sectionsWithProducts = allSections.filter(section =>
        directoryHasProducts(path.join(DIRETORIO_ESFERAS, section))
    );

    if (sectionsWithProducts.length === 0) {
        await sendMessage(sock, jid, { text: "😔 No momento não temos esferas disponíveis.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }

    // Pré-calcula hasNew para cada seção (otimização de performance)
    const sectionsData = sectionsWithProducts.map((section, index) => {
        const hasNew = directoryHasNewProducts(path.join(DIRETORIO_ESFERAS, section));
        const newEmoji = hasNew ? ' (🆕)' : '';
        return { section, index, newEmoji };
    });



    // Monta o texto fallback para modo legacy
    let fallbackText = "🔮 *Seções de Esferas de Dragão*\n\nEscolha uma seção para explorar:\n\n";
    sectionsData.forEach(({ section, index, newEmoji }) => {
        fallbackText += `*${index + 1}* - ${section}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_sphere_section_choice",
        stateData: { sections: sectionsWithProducts }
    });
}

async function sendSphereList(sock, jid, sectionPath) {
    const fullPath = path.join(DIRETORIO_ESFERAS, sectionPath);
    const productFileName = `${path.basename(sectionPath)}.json`;
    const productFilePath = path.join(fullPath, productFileName);

    const products = loadJsonFile(productFilePath, []);

    const subdirectories = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && directoryHasProducts(path.join(fullPath, dirent.name)))
        .map(dirent => dirent.name);

    let menuItems = [];
    subdirectories.forEach(sub => {
        menuItems.push({ type: 'dir', name: sub, path: path.join(sectionPath, sub) });
    });
    products.forEach(product => {
        menuItems.push({ type: 'product', name: product.name, data: product });
    });

    menuItems.sort((a, b) => a.name.localeCompare(b.name));

    if (menuItems.length === 0) {
        await sendMessage(sock, jid, { text: "😔 Nenhum item ou sub-seção encontrado aqui.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_sphere_choice", { menuItems: [], sectionPath });
        return;
    }



    // Monta o texto fallback para modo legacy
    let fallbackText = `🔮 *Esferas: ${sectionPath}*\n\nEscolha uma opção para explorar:\n\n`;
    menuItems.forEach((item, index) => {
        let newEmoji = '';
        if (item.type === 'dir') {
            const hasNew = directoryHasNewProducts(path.join(DIRETORIO_ESFERAS, item.path));
            if (hasNew) newEmoji = ' (🆕)';
        } else if (item.type === 'product') {
            if (isProductNew(item.data)) newEmoji = ' (🆕)';
        }
        fallbackText += `*${index + 1}* - ${item.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_sphere_choice",
        stateData: { menuItems, sectionPath }
    });
}


async function askForSphereQuantity(sock, jid, product, sectionPath) {
    const minQuantity =
        Math.ceil(100 / product.tradeRatio) * product.tradeRatio;
    let message = `🐲 *${product.name}* (${product.rarity})\n\n`;
    message += `Para este dragão, a entrega é feita via trocas em múltiplos de *${product.tradeRatio}* esferas.\n\n`;
    message += `Por favor, informe a quantidade de esferas que você deseja adquirir (mínimo de *${minQuantity}* esferas).\n\n`;
    message += `0️⃣ ↩️ Voltar à lista de dragões`;

    await sendMessage(sock, jid, { text: message });
    navigateTo(jid, "awaiting_sphere_quantity", { product, sectionPath });
}

async function sendSpherePurchaseDetails(
    sock,
    jid,
    product,
    totalSpheres,
    numTrades,
    totalPrice,
    sectionPath
) {
    const rarityName = product.rarity ?
        product.rarity.split(" ")[0] : 'desconhecida';
    const priceFormatted = `R$ ${(totalPrice || 0).toFixed(2).replace(".", ",")}`;
    let caption = `📝 *Confirmação do Pedido*\n\n`;
    caption += `🐲 *${product.name}*\n\n`;
    caption += `*Item:* ${totalSpheres} Esferas de Dragão\n`;
    caption += `*Valor Total:* ${priceFormatted}\n\n`;
    caption += `*Requisitos para a troca no jogo:*\n`;
    caption += `> • *${numTrades}* essências de troca de raridade *${rarityName}*.\n`;
    caption += `> • *${totalSpheres}* esferas de qualquer outro dragão de raridade *${rarityName}*.\n\n`;
    caption += `*O que deseja fazer?*\n\n`;
    caption += `1️⃣ ✅ Confirmar e Adicionar ao Carrinho\n`;
    caption += `2️⃣ 🔢 Alterar Quantidade\n`;
    caption += `0️⃣ ↩️ Voltar à lista de dragões`;
    try {
        if (product.image && fs.existsSync(product.image)) {
            const stats = fs.statSync(product.image);
            if (stats.size > 0) {
                const imageBuffer = fs.readFileSync(product.image);
                if (imageBuffer && imageBuffer.length > 0) {
                    await sendMessage(sock, jid, {
                        image: imageBuffer,
                        caption,
                    });
                } else {
                    await sendMessage(sock, jid, { text: caption });
                }
            } else {
                await sendMessage(sock, jid, { text: caption });
            }
        } else {
            await sendMessage(sock, jid, { text: caption });
        }
    } catch (e) {
        console.error("Falha ao enviar imagem do produto para confirmação.", e);
        await sendMessage(sock, jid, { text: caption });
    }

    navigateTo(jid, "awaiting_sphere_purchase_confirmation", {
        product,
        totalSpheres,
        numTrades,
        totalPrice,
        sectionPath,
    });
}
// === FLUXO DE COMPRA DE CONTAS ===

async function sendAccountList(sock, jid) {
    if (exclusiveAccounts.length === 0) {
        await sendMessage(sock, jid, {
            text: "Sinto muito, não há contas disponíveis para venda no momento. Volte em breve! ⏳\n\nDigite *0* para Voltar.",
        });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }



    let fallbackText = "🐲 *Contas Exclusivas*\n\nConfira nossas contas disponíveis. Escolha uma para ver mais detalhes:\n\n";
    exclusiveAccounts.forEach((product, index) => {
        const newEmoji = isProductNew(product) ? ' (🆕)' : '';
        fallbackText += `*${index + 1}* - ${product.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_account_choice",
        stateData: { accounts: exclusiveAccounts }
    });
}

async function sendAccountDetails(sock, jid, account) {
    const price = `R$ ${(account.price || 0).toFixed(2).replace(".", ",")}`;
    const newEmoji = isProductNew(account) ? ' (🆕)' : '';
    let caption = `🐲 *${account.name}${newEmoji}*\n\n`;
    caption += `${account.description}\n\n`;
    caption += `*Valor:* ${price}\n\n`;

    // Envia tudo em uma única mensagem (detalhes + opções)

    await sendInteractiveList(sock, jid, {
        fallbackText: `${caption}*O que deseja fazer?*\n\n1️⃣ 🛒 Adicionar ao Carrinho\n0️⃣ ↩️ Voltar à lista de contas`,
        state: "awaiting_add_to_cart_confirmation",
        stateData: {
            product: { ...account, type: 'conta_exclusiva' },
            type: "conta_exclusiva",
        }
    });
}

function formatTotalUptime(totalMilliseconds) {
    if (!totalMilliseconds || totalMilliseconds < 0) return "0h 0m";
    let delta = Math.floor(totalMilliseconds / 1000);
    const hours = Math.floor(delta / 3600);
    delta -= hours * 3600;
    const minutes = Math.floor(delta / 60) % 60;
    return `${hours}h ${minutes}m`;
}


async function notifyProductManagersAndAdmins(sock, message) {
    const productManagers = Object.keys(productManagerData);
    for (const managerJid of productManagers) {
        try {
            await sendMessage(sock, managerJid, { text: message });
        } catch (e) {
            console.error(`Falha ao notificar o gerente de produto ${managerJid}:`, e);
        }
    }

    for (const adminJid in adminData) {
        if (adminData[adminJid].notificacoes?.novosProdutos) {
            try {
                await sendMessage(sock, adminJid, { text: message });
            } catch (e) {
                console.error(`Falha ao notificar o admin ${adminJid} sobre novo produto:`, e);
            }
        }
    }
}

// Canal de ofertas: obtém JID do canal configurado via env ou dados da loja
function getOfertasChannelJid() {
    const savedJid = shopData?.ofertasChannelJid;
    if (savedJid) {
        return savedJid.includes('@') ? savedJid : `${savedJid}@newsletter`;
    }
    const envJid = process.env?.OFERTAS_CHANNEL_JID;
    return envJid || "";
}

// Canal de anúncios: obtém JID do canal configurado via env ou dados da loja
function getAnunciosChannelJid() {
    const savedJid = shopData?.anunciosChannelJid;
    if (savedJid) {
        return savedJid.includes('@') ? savedJid : `${savedJid}@newsletter`;
    }
    const envJid = process.env?.ANUNCIOS_CHANNEL_JID;
    return envJid || "";
}

async function notifyOfferChannel(sock, message) {
    const channelJid = getOfertasChannelJid();
    if (!channelJid) return;
    try {
        await sendMessage(sock, channelJid, { text: message });
    } catch (e) {
        console.error(`Falha ao notificar canal de ofertas ${channelJid}:`, e);
    }

    // Também enviar ao canal de anúncios, sem mencionar quem adicionou
    const anunciosJid = getAnunciosChannelJid();
    if (anunciosJid) {
        try {
            await sendMessage(sock, anunciosJid, { text: message });
        } catch (e) {
            console.error(`Falha ao notificar canal de anúncios ${anunciosJid}:`, e);
        }
    }
}


// === PAINEL DE ADMINISTRAÇÃO ===

async function sendAdminPanel(sock, jid) {
    const adminName = userData[jid]?.nome || "Admin";

    await sendInteractiveList(sock, jid, {
        fallbackText: `👑 *Painel Administrativo` + `*\n\nOlá, *${adminName}*! Bem-vindo(a) de volta.\n\n*Selecione uma área para gerenciar:*\n\n1️⃣ 📊 Painel de Estatísticas\n2️⃣ 🎫 Tickets de Suporte\n3️⃣ 📦 Gerenciar Produtos\n4️⃣ 💰 Gerenciar Descontos\n5️⃣ 🔔 Gerenciar Notificações\n6️⃣ ⚙️ Gerenciar Parâmetros\n7️⃣ 💲 Alterar Preços em Massa\n\n0️⃣ 🚪 Sair do Painel Admin`,
        state: 'awaiting_admin_choice'
    });
}

async function sendTeamManagementMenu(sock, jid) {
    await sendInteractiveList(sock, jid, {
        fallbackText: `👥 *Gerenciamento de Equipe*\n\nSelecione o setor que deseja gerenciar:\n\n1️⃣ 👑 Administradores\n2️⃣ 🤝 Compradores\n3️⃣ 👨‍💼 Gerenciadores de Produto\n4️⃣ 💳 Gerenciadores de Cartão\n5️⃣ 📧 Gerenciadores de Troca Regional\n6️⃣ 💸 Gerenciar Comissões\n7️⃣ 💰 Gerenciar Ganhos da Equipe\n\n0️⃣ 👑 Voltar ao Painel Administrativo`,
        state: 'awaiting_team_management_choice'
    });
}

async function sendParametersManagementMenu(sock, jid) {
    const descontoAtual = shopData.descontoAutomaticoOferta || 30;
    const compraMinimaAtual = shopData.compraMinima || 20;
    const chavePixAtual = shopData.chavePix || '9551929a-68da-4c1b-9033-682b1f21796d';
    const imagemStatus = shopData.imagemMenu ? '✅ Configurada' : '❌ Não configurada';

    await sendInteractiveList(sock, jid, {
        fallbackText: `⚙️ *Gerenciamento de Parâmetros*\n\nAjuste os parâmetros da loja:\n\n*Valores Atuais:*\n• Desconto Automático: ${descontoAtual}%\n• Compra Mínima: R$ ${compraMinimaAtual.toFixed(2)}\n• Chave PIX: ${chavePixAtual}\n• Imagem do Menu: ${imagemStatus}\n\n*Opções:*\n\n1️⃣ 📉 Alterar Desconto Automático\n2️⃣ 💵 Alterar Compra Mínima\n3️⃣ 🔑 Alterar Chave PIX\n4️⃣ 🖼️ Alterar Imagem do Menu\n5️⃣ 👥 Gerenciar Equipe\n\n0️⃣ 👑 Voltar ao Painel Administrativo`,
        state: 'awaiting_parameters_management_choice'
    });
}

async function sendBulkPriceChangeMenu(sock, jid) {
    await sendInteractiveList(sock, jid, {
        fallbackText: `💲 *Alteração de Preços em Massa*\n\nEscolha o tipo de alteração que deseja fazer em todos os produtos:\n\n*Tipo de Operação:*\n\n1️⃣ ➕ Aumentar Preços (Porcentagem)\n2️⃣ ➖ Diminuir Preços (Porcentagem)\n3️⃣ ➕ Aumentar Preços (Valor Fixo)\n4️⃣ ➖ Diminuir Preços (Valor Fixo)\n\n0️⃣ 👑 Voltar ao Painel Administrativo`,
        state: 'awaiting_bulk_price_change_type'
    });
}

async function sendFarmDragonList(sock, jid) {
    await sendInteractiveList(sock, jid, {
        fallbackText: `🐉 *Cálculo de Farm*\n\nEscolha o tipo de dragão para calcular a produção:\n\n1️⃣ ➕➖ Positivo/Negativo\n\n0️⃣ ❌ Cancelar`,
        state: 'awaiting_farm_dragon_choice'
    });
}

async function sendManageTeamEarningsMenu(sock, jid) {
    let earningsText = `💰 *Gerenciar Ganhos da Equipe*\n\n`;
    earningsText += `Visualize e gerencie os ganhos de todos os membros da equipe.\n\n`;

    const lang = getUserLanguage(jid);
    let teamMembers = [];
    let memberIndex = 1;

    // Coletar todos os membros da equipe
    for (const adminJid in adminData) {
        const member = adminData[adminJid];
        const nome = userData[adminJid]?.nome || adminJid.split('@')[0];
        const cargo = adminJid === OWNER_JID ? 'Proprietário' : 'Admin';
        const ganhosTotais = member.ganhosTotais || 0;
        const caixa = member.caixa || 0;
        const caixaBloqueado = member.caixaBloqueado || 0;
        const comprasRealizadas = member.comprasRealizadas || 0;

        const monthlyEarnings = member.monthlyEarnings || {};
        const monthlyWithdrawals = member.monthlyWithdrawals || {};
        teamMembers.push({ jid: adminJid, nome, cargo, ganhosTotais, caixa, caixaBloqueado, comprasRealizadas, monthlyEarnings, monthlyWithdrawals });
    }

    for (const compradorJid in compradoresData) {
        const member = compradoresData[compradorJid];
        const nome = userData[compradorJid]?.nome || compradorJid.split('@')[0];
        const cargo = 'Comprador';
        const ganhosTotais = member.ganhosTotais || 0;
        const caixa = member.caixa || 0;
        const caixaBloqueado = member.caixaBloqueado || 0;
        const comprasRealizadas = member.comprasRealizadas || 0;

        const monthlyEarnings = member.monthlyEarnings || {};
        const monthlyWithdrawals = member.monthlyWithdrawals || {};
        teamMembers.push({ jid: compradorJid, nome, cargo, ganhosTotais, caixa, caixaBloqueado, comprasRealizadas, monthlyEarnings, monthlyWithdrawals });
    }

    for (const managerJid in productManagerData) {
        const member = productManagerData[managerJid];
        const nome = userData[managerJid]?.nome || managerJid.split('@')[0];
        const cargo = 'Gerenciador de Produto';
        const ganhosTotais = member.ganhosTotais || 0;
        const caixa = member.caixa || 0;
        const caixaBloqueado = member.caixaBloqueado || 0;
        const comprasRealizadas = member.comprasRealizadas || 0;

        const monthlyEarnings = member.monthlyEarnings || {};
        const monthlyWithdrawals = member.monthlyWithdrawals || {};
        teamMembers.push({ jid: managerJid, nome, cargo, ganhosTotais, caixa, caixaBloqueado, comprasRealizadas, monthlyEarnings, monthlyWithdrawals });
    }

    for (const managerJid in gerenciadoresCartaoData) {
        const member = gerenciadoresCartaoData[managerJid];
        const nome = userData[managerJid]?.nome || managerJid.split('@')[0];
        const cargo = 'Gerenciador de Cartão';
        const ganhosTotais = member.ganhosTotais || 0;
        const caixa = member.caixa || 0;
        const caixaBloqueado = member.caixaBloqueado || 0;
        const comprasRealizadas = member.comprasRealizadas || 0;

        const monthlyEarnings = member.monthlyEarnings || {};
        const monthlyWithdrawals = member.monthlyWithdrawals || {};
        teamMembers.push({ jid: managerJid, nome, cargo, ganhosTotais, caixa, caixaBloqueado, comprasRealizadas, monthlyEarnings, monthlyWithdrawals });
    }

    for (const managerJid in gerenciadoresTrocaRegionalData) {
        const member = gerenciadoresTrocaRegionalData[managerJid];
        const nome = userData[managerJid]?.nome || managerJid.split('@')[0];
        const cargo = 'Gerenciador de Troca Regional';
        const ganhosTotais = member.ganhosTotais || 0;
        const caixa = member.caixa || 0;
        const caixaBloqueado = member.caixaBloqueado || 0;
        const comprasRealizadas = member.comprasRealizadas || 0;

        const monthlyEarnings = member.monthlyEarnings || {};
        const monthlyWithdrawals = member.monthlyWithdrawals || {};
        teamMembers.push({ jid: managerJid, nome, cargo, ganhosTotais, caixa, caixaBloqueado, comprasRealizadas, monthlyEarnings, monthlyWithdrawals });
    }

    // Exibir resumo de cada membro
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    for (let i = 0; i < teamMembers.length; i++) {
        const member = teamMembers[i];
        const ganhosTotaisFmt = await formatCurrencyByLanguage(member.ganhosTotais, lang);
        const caixaFmt = await formatCurrencyByLanguage(member.caixa, lang);
        const ganhosMes = member.monthlyEarnings?.[monthKey] || 0;
        const retiradoMes = member.monthlyWithdrawals?.[monthKey] || 0;
        const ganhosMesFmt = await formatCurrencyByLanguage(ganhosMes, lang);
        const retiradoMesFmt = await formatCurrencyByLanguage(retiradoMes, lang);

        earningsText += `*${i + 1}. ${member.nome}* (${member.cargo})\n`;
        earningsText += `   💰 Total: ${ganhosTotaisFmt}\n`;
        earningsText += `   💵 Caixa: ${caixaFmt}\n`;
        earningsText += `   📊 Mês: ${ganhosMesFmt}\n`;
        earningsText += `   📤 Retirado (mês): ${retiradoMesFmt}\n`;
        earningsText += `   🛒 Compras: ${member.comprasRealizadas}\n\n`;
    }

    earningsText += `\n*Opções:*\n`;
    earningsText += `*A* - ➕ Adicionar valor a um membro\n`;
    earningsText += `*B* - ➖ Remover valor de um membro\n\n`;
    earningsText += `0️⃣ Voltar`;

    await sendMessage(sock, jid, { text: earningsText });
    navigateTo(jid, 'awaiting_manage_team_earnings_choice', { teamMembers });
}

async function sendManageCommissionsMenu(sock, jid) {
    const comissoes = shopData.comissoes || {
        porCompra: 9.00,
        porVerificacao: 1.00,
        admin: 0.75,
        gerenciadorProduto: 3.00,
        gerenciadorCartao: 0.75,
        gerenciadorTrocaRegional: 0.50
    };

    // Pegar a comissão de apoiador do primeiro apoiador ou usar 5% como padrão
    let apoiadorPercentual = 5;
    const firstApoiadorCode = Object.keys(apoiadoresData)[0];
    if (firstApoiadorCode && apoiadoresData[firstApoiadorCode].comissao) {
        apoiadorPercentual = (apoiadoresData[firstApoiadorCode].comissao * 100);
    }

    const langCom = getUserLanguage(jid);
    const porCompraFmt = await formatCurrencyByLanguage(comissoes.porCompra || 9.00, langCom);
    const porVerificacaoFmt = await formatCurrencyByLanguage(comissoes.porVerificacao || 1.00, langCom);
    const adminFmt = await formatCurrencyByLanguage(comissoes.admin || 0.75, langCom);
    const gpFmt = await formatCurrencyByLanguage(comissoes.gerenciadorProduto || 3.00, langCom);
    const gcFmt = await formatCurrencyByLanguage(comissoes.gerenciadorCartao || 0.75, langCom);
    const gtrFmt = await formatCurrencyByLanguage(comissoes.gerenciadorTrocaRegional || 0.50, langCom);

    await sendInteractiveList(sock, jid, {
        fallbackText: `💸 *Gerenciar Comissões*\n\nEstes são os valores de comissão pagos à equipe.\n\n*Valores Atuais:*\n\n*Compradores:*\n1️⃣ Por Compra: ${porCompraFmt}\n2️⃣ Por Verificação: ${porVerificacaoFmt}\n\n*Equipe:*\n3️⃣ Administrador (por produto): ${adminFmt}\n4️⃣ Gerenciador de Produto (por oferta): ${gpFmt}\n5️⃣ Gerenciador de Cartão (por produto): ${gcFmt}\n6️⃣ Gerenciador Troca Regional (por produto): ${gtrFmt}\n7️⃣ Apoiador (% do valor gasto): ${apoiadorPercentual}%\n\nDigite o número da comissão que deseja alterar.\n\n0️⃣ 👥 Voltar`,
        state: 'awaiting_commission_to_edit'
    });
}

async function sendAdminNotificationsMenu(sock, jid) {
    const adminSettings = adminData[jid]?.notificacoes || {};
    const notifications = [
        { key: 'idcheck', label: 'ID Check e Cartões' },
        { key: 'suporte', label: 'Tickets de Suporte' },
        { key: 'mensagemCompradores', label: 'Mensagens de Compradores' },
        { key: 'saques', label: 'Solicitações de Saque' },
        { key: 'novosPedidos', label: 'Novos Pedidos de Compra' },
        { key: 'novosProdutos', label: 'Novos Produtos Adicionados' },
        { key: 'atendimentoIniciado', label: 'Atendimento Iniciado por Comprador' },
        { key: 'compraFinalizada', label: 'Finalização de Compra' },
    ];



    let fallbackText = "🔔 *Gerenciar Notificações*\n\nSelecione uma notificação para ativar ou desativar:\n\n";
    notifications.forEach((notif, index) => {
        const status = adminSettings[notif.key] ? '🟢 ON' : '🔴 OFF';
        fallbackText += `*${index + 1}* - ${notif.label} (${status})\n`;
    });
    fallbackText += "\n0️⃣ 👑 Voltar ao Painel Administrativo";

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_notification_toggle_choice",
        stateData: { notifications }
    });
}

// --- SEÇÃO: GERENCIAMENTO DE COMPRADORES (ADMIN) ---
async function sendManageCompradoresMenu(sock, jid) {
    let buyersInfo = "";
    if (Object.keys(compradoresData).length === 0) {
        buyersInfo = "> Nenhum comprador cadastrado.\n";
    } else {
        for (const buyerJid in compradoresData) {
            const buyerUser = userData[buyerJid];
            const buyerName = buyerUser?.nome || `Comprador (${buyerJid.split("@")[0]})`;
            const vendas = compradoresData[buyerJid]?.vendas || 0;
            const ganhosTotais = (compradoresData[buyerJid]?.ganhosTotais || 0).toFixed(2).replace(".", ",");
            buyersInfo += `> • ${buyerName} | Vendas: *${vendas}* | Ganhos: *R$ ${ganhosTotais}*\n`;
        }
    }

    await sendInteractiveList(sock, jid, {
        fallbackText: `🤝 *Gerenciamento de Compradores*\n\nGerencie os usuários com permissão para realizar as compras.\n\n*Compradores Atuais:*\n${buyersInfo}\n*O que deseja fazer?*\n1️⃣ ✅ Adicionar Novo Comprador\n2️⃣ ❌ Remover Comprador\n\n0️⃣ 👥 Voltar`,
        state: "awaiting_manage_compradores_choice"
    });
}
async function sendAddCompradorPrompt(sock, jid) {
    await sendMessage(sock, jid, { text: "📲 Para adicionar um novo Comprador, por favor, envie o *número de telefone* dele (com DDI e DDD, ex: 5511912345678)." });
    navigateTo(jid, "awaiting_new_comprador_number");
}
async function sendRemoveCompradorPrompt(sock, jid) {
    const buyersArray = Object.keys(compradoresData);
    if (buyersArray.length === 0) {
        await sendMessage(sock, jid, { text: "Não há Compradores para remover." });
        await sendManageCompradoresMenu(sock, jid);
        return;
    }



    let fallbackText = "Para remover um Comprador, digite o número correspondente:\n\n";
    buyersArray.forEach((buyerJid, index) => {
        const buyerUser = userData[buyerJid];
        const buyerName = buyerUser?.nome || `Comprador (${buyerJid.split("@")[0]})`;
        fallbackText += `*${index + 1}* - ${buyerName}\n`;
    });
    fallbackText += `\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_comprador_to_remove_choice",
        stateData: { compradores: buyersArray }
    });
}

// --- SEÇÃO: GERENCIAMENTO DE GERENCIADORES DE PRODUTO (ADMIN) ---
async function sendManageProductManagersMenu(sock, jid) {
    let managersInfo = "";
    if (Object.keys(productManagerData).length === 0) {
        managersInfo = "> Nenhum gerenciador cadastrado.\n";
    } else {
        for (const managerJid in productManagerData) {
            const managerUser = userData[managerJid];
            const managerName = managerUser?.nome || `Gerenciador (${managerJid.split("@")[0]})`;
            managersInfo += `> • ${managerName}\n`;
        }
    }

    await sendInteractiveList(sock, jid, {
        fallbackText: `👨‍💼 *Gerenciamento de Gerenciadores de Produto*\n\nGerencie os usuários com permissão para editar o catálogo de produtos.\n\n*Gerenciadores Atuais:*\n${managersInfo}\n*O que deseja fazer?*\n1️⃣ ✅ Adicionar Novo Gerenciador\n2️⃣ ❌ Remover Gerenciador\n\n0️⃣ 👥 Voltar`,
        state: "awaiting_manage_product_managers_choice"
    });
}
async function sendAddProductManagerPrompt(sock, jid) {
    await sendMessage(sock, jid, { text: "📲 Para adicionar um novo Gerenciador de Produto, por favor, envie o *número de telefone* dele (com DDI e DDD, ex: 5511912345678)." });
    navigateTo(jid, "awaiting_new_product_manager_number");
}
async function sendRemoveProductManagerPrompt(sock, jid) {
    const managersArray = Object.keys(productManagerData);
    if (managersArray.length === 0) {
        await sendMessage(sock, jid, { text: "Não há Gerenciadores para remover." });
        await sendManageProductManagersMenu(sock, jid);
        return;
    }



    let fallbackText = "Para remover um Gerenciador, digite o número correspondente:\n\n";
    managersArray.forEach((managerJid, index) => {
        const managerUser = userData[managerJid];
        const managerName = managerUser?.nome || `Gerenciador (${managerJid.split("@")[0]})`;
        fallbackText += `*${index + 1}* - ${managerName}\n`;
    });
    fallbackText += `\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_product_manager_to_remove_choice",
        stateData: { managers: managersArray }
    });
}

// --- SEÇÃO: GERENCIAMENTO DE GERENCIADORES DE CARTÃO (ADMIN) ---
async function sendManageCardManagersMenu(sock, jid) {
    let managersInfo = "";
    if (Object.keys(gerenciadoresCartaoData).length === 0) {
        managersInfo = "> Nenhum gerenciador cadastrado.\n";
    } else {
        for (const managerJid in gerenciadoresCartaoData) {
            const managerUser = userData[managerJid];
            const managerName = managerUser?.nome || `Gerenciador (${managerJid.split("@")[0]})`;
            const manager = gerenciadoresCartaoData[managerJid];
            const status = manager?.status === 'on' ? '🟢 Online' : '🔴 Offline';

            let uptime = '';
            if (manager?.status === 'on' && manager.onlineSince) {
                const currentSessionTime = Date.now() - manager.onlineSince;
                const totalTime = (manager.totalOnlineTime || 0) + currentSessionTime;
                uptime = `(${formatTotalUptime(totalTime)})`;
            } else {
                uptime = `(${formatTotalUptime(manager.totalOnlineTime || 0)})`;
            }
            managersInfo += `> • ${managerName} - *Status:* ${status} ${uptime}\n`;
        }
    }

    await sendInteractiveList(sock, jid, {
        fallbackText: `💳 *Gerenciamento de Gerenciadores de Cartão*\n\nGerencie os usuários com permissão para adicionar e remover cartões.\n\n*Gerenciadores Atuais:*\n${managersInfo}\n*O que deseja fazer?*\n1️⃣ ✅ Adicionar Novo Gerenciador\n2️⃣ ❌ Remover Gerenciador\n\n*Comandos de Status:*\nUse */on* e */off* para gerenciar sua disponibilidade.\n\n0️⃣ 👥 Voltar`,
        state: "awaiting_manage_card_managers_choice"
    });
}
async function sendAddCardManagerPrompt(sock, jid) {
    await sendMessage(sock, jid, { text: "📲 Para adicionar um novo Gerenciador de Cartão, envie o *número de telefone* dele (com DDI e DDD, ex: 5511912345678)." });
    navigateTo(jid, "awaiting_new_card_manager_number");
}
async function sendRemoveCardManagerPrompt(sock, jid) {
    const managersArray = Object.keys(gerenciadoresCartaoData);
    if (managersArray.length === 0) {
        await sendMessage(sock, jid, { text: "Não há Gerenciadores para remover." });
        await sendManageCardManagersMenu(sock, jid);
        return;
    }



    let fallbackText = "Para remover um Gerenciador, digite o número correspondente:\n\n";
    managersArray.forEach((managerJid, index) => {
        const managerUser = userData[managerJid];
        const managerName = managerUser?.nome || `Gerenciador (${managerJid.split("@")[0]})`;
        fallbackText += `*${index + 1}* - ${managerName}\n`;
    });
    fallbackText += `\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_card_manager_to_remove_choice",
        stateData: { managers: managersArray }
    });
}

// --- SEÇÃO: GERENCIAMENTO DE GERENCIADORES DE TROCA REGIONAL (ADMIN) ---
async function sendManageRegionalChangeManagersMenu(sock, jid) {
    let managersInfo = "";
    if (Object.keys(gerenciadoresTrocaRegionalData).length === 0) {
        managersInfo = "> Nenhum gerenciador cadastrado.\n";
    } else {
        for (const managerJid in gerenciadoresTrocaRegionalData) {
            const managerUser = userData[managerJid];
            const managerName = managerUser?.nome || `Gerenciador (${managerJid.split("@")[0]})`;
            managersInfo += `> • ${managerName}\n`;
        }
    }

    await sendInteractiveList(sock, jid, {
        fallbackText: `📧 *Gerenciamento de Gerenciadores de Troca Regional*\n\nGerencie os usuários com permissão para gerenciar e-mails de troca.\n\n*Gerenciadores Atuais:*\n${managersInfo}\n*O que deseja fazer?*\n1️⃣ ✅ Adicionar Novo Gerenciador\n2️⃣ ❌ Remover Gerenciador\n\n0️⃣ 👥 Voltar`,
        state: "awaiting_manage_regional_change_managers_choice"
    });
}
async function sendAddRegionalChangeManagerPrompt(sock, jid) {
    await sendMessage(sock, jid, { text: "📲 Para adicionar um novo Gerenciador de Troca Regional, envie o *número de telefone* dele (com DDI e DDD, ex: 5511912345678)." });
    navigateTo(jid, "awaiting_new_regional_change_manager_number");
}
async function sendRemoveRegionalChangeManagerPrompt(sock, jid) {
    const managersArray = Object.keys(gerenciadoresTrocaRegionalData);
    if (managersArray.length === 0) {
        await sendMessage(sock, jid, { text: "Não há Gerenciadores para remover." });
        await sendManageRegionalChangeManagersMenu(sock, jid);
        return;
    }



    let fallbackText = "Para remover um Gerenciador, digite o número correspondente:\n\n";
    managersArray.forEach((managerJid, index) => {
        const managerUser = userData[managerJid];
        const managerName = managerUser?.nome || `Gerenciador (${managerJid.split("@")[0]})`;
        fallbackText += `*${index + 1}* - ${managerName}\n`;
    });
    fallbackText += `\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_regional_change_manager_to_remove_choice",
        stateData: { managers: managersArray }
    });
}


// --- LÓGICA DE NAVEGAÇÃO DE PRODUTOS ---
async function sendProductManagementBrowser(sock, jid, action, currentPath = '', productType = 'ofertas') {
    const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
    const fullPath = path.join(basePath, currentPath);

    try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const directories = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
        const productFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name);

        let menuText = "";
        const options = [];
        const categoryName = productType === 'ofertas' ? 'Ofertas' : 'Esferas';

        if (action === 'add') {
            menuText = `➕ *Adicionar Produto em ${categoryName}*\n\nOnde você deseja adicionar o novo produto?\n📍 Caminho atual: \`.../${currentPath || categoryName}\`\n\n*Escolha uma sub-seção ou adicione aqui:*\n`;
            directories.forEach(dir => {
                options.push({ type: 'dir', name: dir });
            });
            options.forEach((opt, index) => {
                menuText += `*${index + 1}* - ${opt.name}\n`;
            });
            menuText += `\n*X* - Adicionar aqui em \`${path.basename(currentPath) || categoryName}\`\n`;
        } else if (action === 'edit' || action === 'remove') {
            const actionTitle = action === 'edit' ? '✏️ Editar' : '❌ Remover';
            menuText = `*${actionTitle} Produto em ${categoryName}*\n\nO que você deseja ${action === 'edit' ? 'editar' : 'remover'}?\n📍 Caminho atual: \`.../${currentPath || categoryName}\`\n\n`;

            directories.forEach(dir => {
                options.push({ type: 'dir', name: dir });
            });

            for (const file of productFiles) {
                const products = loadJsonFile(path.join(fullPath, file), []);
                products.forEach(p => options.push({ type: 'product', name: p.name, data: p, section: currentPath }));
            }

            options.sort((a, b) => a.name.localeCompare(b.name));

            options.forEach((opt, index) => {
                menuText += `*${index + 1}* - ${opt.name}\n`;
            });
        } else if (action === 'manage_sections') {
            menuText = `📂 *Gerenciar Seções de ${categoryName}*\n\nO que você deseja fazer?\n\n1️⃣ Adicionar Seção\n2️⃣ Editar Seção\n3️⃣ Remover Seção\n\n0️⃣ Voltar`;
            await sendMessage(sock, jid, { text: menuText });
            navigateTo(jid, "awaiting_section_action_choice", { currentPath, productType });
            return;
        }


        menuText += `\n0️⃣ ↩️ Voltar`;
        await sendMessage(sock, jid, { text: menuText });
        navigateTo(jid, "awaiting_product_browse_choice", { action, currentPath, options, productType });
    } catch (error) {
        console.error("Erro ao navegar nos produtos:", error);
        await sendMessage(sock, jid, { text: "Ocorreu um erro ao carregar os produtos. 😥" });
        await sendProductCategoryList(sock, jid);
    }
}

async function sendSectionManagementBrowser(sock, jid, action, currentPath = '', productType = 'ofertas') {
    const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
    const fullPath = path.join(basePath, currentPath);
    const directories = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();

    let menuText = "";
    const options = directories.map(dir => ({ type: 'dir', name: dir }));
    const categoryName = productType === 'ofertas' ? 'Ofertas' : 'Esferas';

    if (action === 'add') {
        menuText = `➕ *Adicionar Seção em ${categoryName}*\n\nOnde você deseja adicionar a nova seção?\n📍 Caminho atual: \`.../${currentPath || categoryName}\`\n\n`;
        options.forEach((opt, index) => {
            menuText += `*${index + 1}* - ${opt.name}\n`;
        });
        menuText += `\n*X* - Adicionar seção aqui`;
    } else if (action === 'edit') {
        menuText = `✏️ *Editar Seção em ${categoryName}*\n\nQual seção você deseja editar?\n📍 Caminho atual: \`.../${currentPath || categoryName}\`\n\n`;
        options.forEach((opt, index) => {
            menuText += `*${index + 1}* - ${opt.name}\n`;
        });
    } else { // remove
        menuText = `❌ *Remover Seção em ${categoryName}*\n\nQual seção você deseja remover?\n📍 Caminho atual: \`.../${currentPath || categoryName}\`\n\n`;
        options.forEach((opt, index) => {
            menuText += `*${index + 1}* - ${opt.name}\n`;
        });
        if (currentPath !== '') {
            menuText += `\n*X* - Remover ESTA seção (*${path.basename(currentPath)}*)`;
        }
    }

    menuText += `\n\n0️⃣ ↩️ Voltar`;
    await sendMessage(sock, jid, { text: menuText });
    navigateTo(jid, "awaiting_section_browse_choice", { action, currentPath, options, productType });
}


async function sendProductCategoryList(sock, jid) {


    const fallbackText = `📦 *Gerenciamento de Produtos*\n\nSelecione uma categoria para visualizar ou modificar:\n\n1️⃣ ⚡ Ofertas\n2️⃣ 🔮 Esferas\n3️⃣ 🐲 Contas Exclusivas\n\n0️⃣ 👑 Voltar ao Painel Administrativo`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_product_category_list"
    });
}

async function sendGenericProductList(sock, jid, category, productFile) {
    const products = loadJsonFile(productFile, []);

    let productListText = `--- Lista de Produtos: *${category.toUpperCase()}* ---\n\n`;

    if (products.length === 0) {
        productListText += `Nenhum produto encontrado nesta categoria no momento.`;
    } else {
        for (let index = 0; index < products.length; index++) {
            const product = products[index];
            const userLang = getUserLanguage(jid);
            let priceText = "Sob Consulta";
            if (product.price != null) {
                priceText = await formatCurrencyByLanguage(product.price || 0, userLang);
            }
            productListText += `*${index + 1}. ${product.name}*\n`;
            if (product.rarity) productListText += `*Raridade:* ${product.rarity}\n`;
            productListText += `*Preço:* ${priceText}${category === "esferas" ? " (por esfera)" : ""}\n`;
            if (category === "contas_exclusivas") {
                productListText += `*Login:* ${product.login}\n`;
            }
            productListText += `-----------------------------------\n`;
        }
    }
    await sendMessage(sock, jid, { text: productListText });



    const fallbackText = `*O que você deseja fazer na categoria ${category.toUpperCase()}?*\n\n1️⃣ ➕ Adicionar produto\n2️⃣ ✏️ Editar produto existente\n3️⃣ ➖ Remover produto\n\n0️⃣ 📦 Voltar para a seleção de categorias`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_generic_product_action",
        stateData: { category, products, productFile }
    });
}


async function sendEditAttributeMenu(sock, jid, product, category, section) {
    let priceText = "Sob Consulta";
    if (product.price != null) {
        const userLang = getUserLanguage(jid);
        priceText = await formatCurrencyByLanguage(product.price || 0, userLang);
    }

    let infoText = `✏️ *Editando:* ${product.name}\n\n` + `*Descrição:* ${product.description}\n`;
    if (category === "esferas") {
        infoText += `*Preço:* Calculado automaticamente\n`;
    } else {
        infoText += `*Preço de Venda:* ${priceText}\n`;
    }

    if (product.basePrices) {
        const userLang = getUserLanguage(jid);
        const androidFmt = await formatCurrencyByLanguage(product.basePrices.google || 0, userLang);
        const pcFmt = await formatCurrencyByLanguage(product.basePrices.microsoft || 0, userLang);
        const iosFmt = await formatCurrencyByLanguage(product.basePrices.ios || 0, userLang);
        infoText += `*Valor Android:* ${androidFmt}\n`;
        infoText += `*Valor PC:* ${pcFmt}\n`;
        infoText += `*Valor iOS:* ${iosFmt}\n`;
    }

    if (product.rarity) infoText += `*Raridade:* ${product.rarity}\n`;
    if (product.expiryTimestamp) {
        const expiryDate = new Date(product.expiryTimestamp);
        const dateString = expiryDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        infoText += `*Expira em:* ${formatRemainingTime(product.expiryTimestamp)} (${dateString})\n`;
    }

    // Enviar imagem primeiro
    try {
        const imagePath = product.image;
        if (imagePath && fs.existsSync(imagePath)) {
            const stats = fs.statSync(imagePath);
            if (stats.size > 0) {
                const imageBuffer = fs.readFileSync(imagePath);
                if (imageBuffer && imageBuffer.length > 0) {
                    await sendMessage(sock, jid, {
                        image: imageBuffer,
                        caption: infoText,
                    });
                } else {
                    await sendMessage(sock, jid, { text: infoText });
                }
            } else {
                await sendMessage(sock, jid, { text: infoText });
            }
        } else {
            await sendMessage(sock, jid, { text: infoText });
        }
    } catch (e) {
        console.error(`Falha ao enviar imagem do produto ${product.name}, enviando apenas texto.`, e);
        await sendMessage(sock, jid, { text: infoText });
    }



    let optionCounter = 4;
    const optionsMap = {
        name: '1',
        description: '2',
        image: '3'
    };

    if (category === "ofertas") {
        optionsMap.price = `${optionCounter}`;
        optionCounter++;

        optionsMap.expiry = `${optionCounter}`;
        optionCounter++;


        optionsMap.basePrices = `${optionCounter}`;
        optionCounter++;
    }

    if (category === "contas_exclusivas") {

        optionsMap.price = `${optionCounter}`;
        optionCounter++;


        optionsMap.login = `${optionCounter}`;
        optionCounter++;


        optionsMap.password = `${optionCounter}`;
        optionCounter++;
    }



    // Texto de fallback
    let fallbackText = `*O que você deseja editar?*\n\n1️⃣ 🏷️ Nome\n2️⃣ 📄 Descrição\n3️⃣ 🖼️ Imagem\n`;
    optionCounter = 4;

    if (category === "ofertas") {
        fallbackText += `*${optionCounter}* - 💰 Preço de Venda\n`;
        optionCounter++;
        fallbackText += `*${optionCounter}* - ⏳ Prazo de Validade\n`;
        optionCounter++;
        fallbackText += `*${optionCounter}* - 💵 Valores Base (Android, PC, iOS)\n`;
        optionCounter++;
    }
    if (category === "contas_exclusivas") {
        fallbackText += `*${optionCounter}* - 💰 Preço de Venda\n`;
        optionCounter++;
        fallbackText += `*${optionCounter}* - 📧 Login\n`;
        optionCounter++;
        fallbackText += `*${optionCounter}* - 🔑 Senha\n`;
        optionCounter++;
    }
    fallbackText += `\n0️⃣ ↩️ Voltar à seleção de produtos`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_edit_attribute_choice",
        stateData: { product, category, section, optionsMap }
    });
}


// --- GESTÃO DE APOIADORES ---
async function sendApoiadoresMenu(sock, jid) {
    const totalApoiadores = Object.keys(apoiadoresData).length;
    const apoiadoresAtivos = Object.values(apoiadoresData).filter(a => a.ativo).length;

    const statsText = `📊 *Estatísticas:*\nTotal de apoiadores: ${totalApoiadores}\nApoiadores ativos: ${apoiadoresAtivos}`;



    const fallbackText = `🤝 *Gerenciar Apoiadores*\n\n${statsText}\n\n*O que deseja fazer?*\n\n1️⃣ ➕ Adicionar Apoiador\n2️⃣ 📋 Listar Apoiadores\n3️⃣ 🗑️ Remover Apoiador\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_apoiadores_menu_choice'
    });
}

async function sendListApoiadores(sock, jid) {
    if (Object.keys(apoiadoresData).length === 0) {
        await sendMessage(sock, jid, { text: "📋 Não há apoiadores cadastrados ainda.\n\n0️⃣ ↩️ Voltar" });
        navigateTo(jid, 'awaiting_apoiadores_list_back');
        return;
    }


    let listText = `📋 *Apoiadores Cadastrados*\n\n`;
    let index = 1;
    const langSup = getUserLanguage(jid);

    for (const code in apoiadoresData) {
        const apoiador = apoiadoresData[code];
        const status = apoiador.ativo ? '✅' : '❌';
        const ganhos = await formatCurrencyByLanguage(apoiador.ganhosTotais || 0, langSup);



        listText += `*${index}.* ${status} Código: *${code}*\n`;
        listText += `   👤 ${apoiador.ownerName}\n`;
        listText += `   📱 ${apoiador.ownerNumber}\n`;
        listText += `   💰 Ganhos: ${ganhos}\n`;
        listText += `   🔄 Usos: ${apoiador.usos || 0}\n\n`;
        index++;
    }



    listText += `0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: listText,
        state: 'awaiting_apoiadores_list_back'
    });
}

// --- GESTÃO AVANÇADA DE TICKETS ---
async function sendTicketTypeMenu(sock, jid) {


    const fallbackText = `🎫 *Gerenciamento de Tickets*\n\nSelecione o tipo de ticket que deseja visualizar:\n\n1️⃣ Tickets de Compra Variável\n2️⃣ Tickets de Suporte Geral\n3️⃣ Tickets de Saque\n\n0️⃣ 👑 Voltar ao Painel Administrativo`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_ticket_type_choice'
    });
}
async function sendTicketManagementList(sock, jid, ticketType) {
    const allTickets = loadJsonFile(ARQUIVO_TICKETS, []);
    const teamMembers = { ...adminData, ...compradoresData, ...productManagerData, ...gerenciadoresCartaoData, ...gerenciadoresTrocaRegionalData };

    let filteredTickets = [];
    let title = "";

    switch (ticketType) {
        case 'variable_purchase':
            title = "Tickets de Compra Variável";
            filteredTickets = allTickets.filter(t => t.ticketText && t.ticketText.includes("produto variável") && !teamMembers[t.clientJid]);
            break;
        case 'support':
            title = "Tickets de Suporte Geral";
            filteredTickets = allTickets.filter(t => (!t.ticketText || (!t.ticketText.includes("produto variável") && !t.ticketText.includes("Saque"))) && !teamMembers[t.clientJid]);
            break;
        case 'payout':
            title = "Tickets de Saque";
            filteredTickets = allTickets.filter(t => t.ticketText && t.ticketText.includes("Saque"));
            break;
    }


    let listText = `🎫 *${title}* (${filteredTickets.length})\n\n`;

    if (filteredTickets.length === 0) {
        listText += "🎉 Não há tickets abertos nesta categoria.\n\n";
    } else {
        listText += `*Tickets Abertos:*\nDigite o número para interagir:\n\n`;
        filteredTickets.forEach((ticket, index) => {
            const clientIdentifier = ticket.clientName || ticket.clientJid.split('@')[0];

            listText += `*${index + 1}* - ${clientIdentifier}\n`;
        });
        listText += `\nDigite *X* para excluir TODOS os tickets desta lista.\n`;

        // Adicionar opção para excluir todos

    }



    listText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: listText,
        state: 'awaiting_ticket_to_close_choice',
        stateData: { ticketType, filteredTickets }
    });
}

async function closeTicket(sock, ticketToClose, adminJid, wasPayout = false) {
    if (!ticketToClose) return false;
    const ticketIndex = openTickets.findIndex(t => t.timestamp === ticketToClose.timestamp && t.clientJid === ticketToClose.clientJid);
    if (ticketIndex === -1) return false;

    const clientJid = ticketToClose.clientJid;
    if (userData[clientJid]) {
        const specialRoles = { ...compradoresData, ...productManagerData, ...adminData };
        if (!specialRoles[clientJid]) {
            userData[clientJid].status = "navegando";
            saveJsonFile(ARQUIVO_USUARIOS, userData);
        }
    }

    if (wasPayout) {
        await sendMessage(sock, clientJid, { text: "✅ Sua solicitação de saque foi processada e o ticket foi finalizado com sucesso." });
    } else {
        await sendMessage(sock, clientJid, { text: "✅ Seu ticket de atendimento foi finalizado por nossa equipe. Se precisar de algo mais, estamos à disposição!" });
    }

    if (adminData[adminJid]) {
        adminData[adminJid].atendimentos = (adminData[adminJid].atendimentos || 0) + 1;
        saveJsonFile(ARQUIVO_ADMINS, adminData);
    }


    if (ticketToClose.notificationKeys) {
        for (const key of ticketToClose.notificationKeys) {
            try {
                await sock.sendMessage(key.remoteJid, { delete: key });
            } catch (e) {
                console.error(`Falha ao deletar notificação para ${key.remoteJid}.`);
            }
        }
    }

    openTickets.splice(ticketIndex, 1);
    saveJsonFile(ARQUIVO_TICKETS, openTickets);
    return true;
}


async function sendManageAdminsMenu(sock, jid) {
    let adminListText = "*Administradores Atuais:*\n";
    for (const adminJid in adminData) {
        const adminUser = userData[adminJid];
        const adminName = adminUser?.nome || `Admin (${adminJid.split("@")[0]})`;
        const atendimentos = adminData[adminJid]?.atendimentos || 0;
        const status = adminData[adminJid]?.status === 'on' ? '🟢 Online' : '🔴 Offline';

        let uptime = '';
        if (adminData[adminJid]?.status === 'on' && adminData[adminJid].onlineSince) {
            const currentSessionTime = Date.now() - adminData[adminJid].onlineSince;
            const totalTime = (adminData[adminJid].totalOnlineTime || 0) + currentSessionTime;
            uptime = `(${formatTotalUptime(totalTime)})`;
        } else {
            uptime = `(${formatTotalUptime(adminData[adminJid].totalOnlineTime || 0)})`;
        }

        adminListText += `> • ${adminName} (${atendimentos} atendimentos) - *Status:* ${status} ${uptime}\n`;
    }



    const fallbackText = `👑 *Gerenciamento de Administradores*\n\n_Apenas o Dono pode adicionar ou remover administradores._\n\n${adminListText}\n*O que deseja fazer?*\n1️⃣ ✅ Adicionar Novo Admin\n2️⃣ ❌ Remover Admin\n\nDigite *X* para resetar as estatísticas de todos os ADMs (atendimentos e horas online).\n\n0️⃣ 👥 Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_manage_admins_choice"
    });
}

async function sendAddAdminPrompt(sock, jid) {
    await sendMessage(sock, jid, { text: "📲 Para adicionar um novo Administrador, por favor, envie o *número de telefone* dele (com DDI e DDD, ex: 5511912345678)." });
    navigateTo(jid, "awaiting_new_admin_number");
}
async function sendRemoveAdminPrompt(sock, jid) {
    const adminsArray = Object.keys(adminData).filter(adminJid => adminJid !== OWNER_JID);
    if (adminsArray.length === 0) {
        await sendMessage(sock, jid, { text: "Não há outros Administradores para remover." });
        await sendManageAdminsMenu(sock, jid);
        return;
    }

    let adminsList = "Para remover um Administrador, selecione da lista:\n\n";

    adminsArray.forEach((adminJid, index) => {
        const adminUser = userData[adminJid];
        const adminName = adminUser?.nome || `Admin (${adminJid.split("@")[0]})`;

        adminsList += `*${index + 1}* - ${adminName}\n`;
    });



    adminsList += `\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: adminsList,
        state: "awaiting_admin_to_remove_choice",
        stateData: { admins: adminsArray }
    });
}

//[FIM DA PARTE 1]

//[INÍCIO DA PARTE 2]

// --- GERENCIAMENTO DE DESCONTOS (ADMIN) ---

async function sendManageDiscountsMenu(sock, jid) {


    const fallbackText = `💰 *Gerenciamento de Descontos*\n\nSelecione uma opção:\n\n1️⃣ ➕ Criar Cupom de Desconto\n2️⃣ 🎫 Ver Cupons de Desconto\n3️⃣ 🎟️ Ver Códigos de Convite\n\n0️⃣ 👑 Voltar ao Painel Administrativo`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_discount_admin_choice'
    });
}

async function sendCouponList(sock, jid) {
    const coupons = Object.values(couponData);

    let text = "🎫 *Cupons de Desconto Cadastrados*\n\n";

    if (coupons.length === 0) {
        text += "Nenhum cupom cadastrado no momento.";
    } else {
        coupons.sort((a, b) => (b.uses || 0) - (a.uses || 0));
        coupons.forEach(coupon => {
            const discountValue = coupon.type === 'percentage' ? `${coupon.value}%` : `R$ ${(coupon.value || 0).toFixed(2)}`;
            const usesText = coupon.limit ? `${coupon.uses || 0}/${coupon.limit}` : `${coupon.uses || 0}`;



            text += `*Nome:* ${coupon.name.toUpperCase()}\n`;
            text += `*Usos:* ${coupon.uses || 0}${coupon.limit ? ` / ${coupon.limit}` : ''}\n`;
            text += `*Descontos Totais:* R$ ${(coupon.totalDiscountValue || 0).toFixed(2).replace('.', ',')}\n`;
            text += `*Tipo:* ${discountValue}${coupon.type === 'percentage' && coupon.maxValue ? ` (máx R$ ${coupon.maxValue.toFixed(2)})` : ''}\n`;
            if (coupon.minValue) {
                text += `*Valor Mínimo:* R$ ${coupon.minValue.toFixed(2).replace('.', ',')}\n`;
            }
            text += `-----------------------------------\n`;
        });
    }



    text += "\nDigite *0* para Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: text,
        state: 'awaiting_discount_admin_choice'
    });
}

async function sendInvitationList(sock, jid) {
    const invites = Object.entries(invitationData);

    let text = "🎟️ *Códigos de Convite Gerados*\n\n";

    if (invites.length === 0) {
        text += "Nenhum código de convite gerado ainda.";
    } else {
        invites.sort(([, a], [, b]) => (b.uses || 0) - (a.uses || 0));
        invites.forEach(([code, data]) => {


            text += `*Código:* ${code}\n`;
            text += `*Dono:* ${data.ownerName}\n`;
            text += `*Usos:* ${data.uses || 0}\n`;
            text += `*Descontos Totais:* R$ ${(data.totalDiscountValue || 0).toFixed(2).replace('.', ',')}\n`;
            text += `-----------------------------------\n`;
        });
    }



    text += "\n*0* - Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: text,
        state: 'awaiting_discount_admin_choice'
    });
}


// --- MENU DO COMPRADOR ---

async function sendCompradorMenu(sock, jid) {
    const currentState = userState[jid]?.history?.[userState[jid].history.length - 1];
    if (currentState && (currentState.step === 'in_direct_chat' || currentState.step === 'in_verification_chat')) {
        await sendMessage(sock, jid, { text: "⚠️ Você não pode acessar o menu enquanto estiver em um atendimento. Finalize a conversa atual com */finalizar*." });
        return;
    }

    const buyer = compradoresData[jid] || {};
    const notificationsOn = buyer.notificacoes === true;

    await sendInteractiveList(sock, jid, {
        fallbackText: `👋 Olá, *${userData[jid]?.nome}*!\n\nEste é o seu menu de comprador.\n\n*O que deseja fazer?*\n1️⃣ 📦 Ver Fila de Atendimento\n2️⃣ 💰 Meus Ganhos\n3️⃣ 🔔 Notificações (${notificationsOn ? '🟢 ON' : '🔴 OFF'})\n4️⃣ ℹ️ Meus Comandos\n\n*Comandos Rápidos:*\n*/gerar [valor]* - Gera um PIX para o cliente no chat\n*/id* - Solicitar ID do cartão\n*/cartao* - Pedir dados de um cartão\n*/suporte* - Pedir ajuda a um admin\n\nDigite */m* para acessar o menu de cliente.`,
        state: 'awaiting_comprador_menu_choice'
    });
}

async function sendCompradorNotificationsMenu(sock, jid) {
    const buyerSettings = compradoresData[jid]?.notificacoes_config || {};
    const notifications = [
        { key: 'novosClientes', label: 'Novos Clientes' },
        { key: 'clientesDeVolta', label: 'Clientes de Volta' },
        { key: 'adminsOnlineOffline', label: 'Gerenciadores Online/Offline' },
        { key: 'novasVerificacoes', label: 'Novas Verificações' },
    ];

    let menuText = "🔔 *Gerenciar Notificações de Comprador*\n\nSelecione uma notificação para ativar ou desativar:\n\n";

    notifications.forEach((notif, index) => {
        const status = buyerSettings[notif.key] ? '🟢 ON' : '🔴 OFF';

        menuText += `*${index + 1}* - ${notif.label} (${status})\n`;
    });



    menuText += "\n0️⃣ ↩️ Voltar ao Menu de Comprador";

    await sendInteractiveList(sock, jid, {
        fallbackText: menuText,
        state: 'awaiting_buyer_notification_toggle',
        stateData: { notifications }
    });
}

async function sendMyEarningsMenu(sock, jid) {
    const earnings = getTeamMemberEarnings(jid);

    if (!earnings) {
        await sendMessage(sock, jid, { text: "❌ Você não tem permissão para acessar este recurso." });
        return;
    }

    const { ganhosTotais, caixa, caixaBloqueado, proximaLiberacao, cargo } = earnings;
    const isComprador = compradoresData[jid] !== undefined;
    const comprasRealizadas = earnings.memberData?.comprasRealizadas || 0;

    let earningsText = `💰 *Meus Ganhos*\n\n`;
    earningsText += `*Cargo:* ${cargo}\n`;
    const lang = getUserLanguage(jid);
    const ganhosTotaisFmt = await formatCurrencyByLanguage(ganhosTotais, lang);
    earningsText += `*Ganhos totais:* ${ganhosTotaisFmt}\n`;

    // Calcular ganhos do mês atual a partir de monthlyEarnings (independente de bloqueio)
    const now = new Date();
    const diaAtual = now.getDate();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ganhosMensais = earnings.memberData?.monthlyEarnings?.[monthKey] || 0;
    const ganhosMensaisFmt = await formatCurrencyByLanguage(ganhosMensais, lang);
    earningsText += `*Ganhos do mês (dia 1 ao ${diaAtual}):* ${ganhosMensaisFmt}\n`;

    // Calcular retiradas do mês atual a partir de monthlyWithdrawals
    const retiradoMensal = earnings.memberData?.monthlyWithdrawals?.[monthKey] || 0;
    const retiradoMensalFmt = await formatCurrencyByLanguage(retiradoMensal, lang);
    earningsText += `*Valor retirado no mês:* ${retiradoMensalFmt}\n`;

    // Mostrar faturado no mês e data de liberação para todos os cargos
    const faturadoFmt = await formatCurrencyByLanguage(caixaBloqueado, lang);
    earningsText += `*Valor faturado no mês:* ${faturadoFmt} (valores ainda não liberados)\n`;
    const dataLiberacao = proximaLiberacao.toLocaleDateString('pt-BR');
    earningsText += `** Valores retidos serão liberados no dia ${dataLiberacao}**\n\n`;

    // Exibir compras realizadas, quando disponível
    earningsText += `*Compras realizadas:* ${comprasRealizadas}\n`;

    const caixaFmt = await formatCurrencyByLanguage(caixa, lang);
    earningsText += `*Valor para saque:* ${caixaFmt}\n`;

    // Enviar informações primeiro
    await sendMessage(sock, jid, { text: earningsText });



    const fallbackText = `*O que deseja fazer?*\n\n1️⃣ 💸 Solicitar Saque do Valor Disponível\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_earnings_menu_choice',
        stateData: { available: caixa }
    });
}

async function sendPixKeySelectionMenu(sock, jid) {
    const earnings = getTeamMemberEarnings(jid);
    if (!earnings) {
        await sendMessage(sock, jid, { text: "❌ Você não tem permissão para acessar este recurso." });
        return;
    }

    const pixKeys = earnings.memberData.pixKeys || [];
    let menuText = "💸 *Solicitar Saque*\n\nPara qual chave PIX devemos enviar o valor?\n\n";

    if (pixKeys.length === 0) {
        menuText += "Você ainda não tem chaves PIX salvas. Vamos adicionar a primeira!\n";
        await sendMessage(sock, jid, { text: menuText });
        await sendMessage(sock, jid, { text: "Por favor, digite um *apelido* para esta nova chave (ex: PIX Celular):" });
        navigateTo(jid, 'awaiting_new_pix_alias');
        return;
    }

    pixKeys.forEach((key, index) => {
        menuText += `*${index + 1}* - ${key.alias} (${key.key})\n`;
    });





    menuText += `\n*${pixKeys.length + 1}* - ➕ Adicionar nova chave PIX\n`;
    menuText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: menuText,
        state: 'awaiting_payout_pix_choice',
        stateData: { pixKeys }
    });
}

// --- FUNÇÕES DE VERIFICAÇÃO DE CONTA ---

async function sendGameAccountManagementMenu(sock, jid) {
    const user = userData[jid];
    const savedAccounts = user.savedAccounts || [];

    if (savedAccounts.length === 0) {
        await sendMessage(sock, jid, { text: "Você ainda não tem nenhuma conta de jogo salva. Deseja adicionar uma agora?\n\n*Digite:*\n1️⃣ - Sim, adicionar conta\n0️⃣ - Voltar" });
        navigateTo(jid, 'awaiting_add_first_game_account_choice');
        return;
    }



    // Texto de fallback
    let menuText = "🐲 *Gerenciar Contas de Jogo*\n\nSelecione uma conta para ver as opções ou adicione uma nova.\n\n";
    savedAccounts.forEach((acc, index) => {
        let status = '';
        if (acc.verified) {
            status = '✅ Verificada';
        } else if (acc.verificationStatus === 'pending') {
            status = '⏳ Em Análise';
        }
        menuText += `*${index + 1}* - ${acc.alias} ${status}\n`;
    });
    menuText += `\n*${savedAccounts.length + 1}* - ➕ Adicionar nova conta\n\n0️⃣ 👤 Voltar ao perfil`;

    await sendInteractiveList(sock, jid, {
        fallbackText: menuText,
        state: 'awaiting_game_account_management_choice',
        stateData: { savedAccounts }
    });
}

async function sendVerificationMainMenu(sock, jid, accountIndex) {
    const infoText = "A fim de acelerar o processo de compra dos pacotes adquiridos, o sistema de verificação de conta veio para auxiliar nisso. Com a conta verificada, seus pedidos têm prioridade na fila em altas demandas, acesso a cupons de descontos e prioridade nos demais serviços.\n\nPara solicitar o pedido de verificação em sua conta do jogo é necessário:\n\n> • Ter uma conta do jogo logada no Facebook\n> • Ter o método de ADF pelo WhatsApp ou não possuir ADF";

    await sendMessage(sock, jid, { text: infoText });



    const fallbackText = "*Digite:*\n1️⃣ - Solicitar análise de verificação de conta\n2️⃣ - Ver tutorial do passo a passo\n0️⃣ - Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_verification_main_menu_choice',
        stateData: { accountIndex }
    });
}

async function sendGlobalTutorial(sock, jid) {
    const tutorialText = `🚀 *Verifique sua Conta e Receba suas Compras mais rapidamente!* 🚀

➡ *Passo 1: Conecte sua conta ao Facebook*
Sua conta do Dragon City precisa estar vinculada a um perfil do Facebook para que nosso sistema possa acessá-la com segurança.

➡ *Passo 2: Configure a Autenticação de Dois Fatores (ADF)*
Para um acesso rápido e sem interrupções, temos duas opções para a Autenticação de Dois Fatores (ADF) do seu Facebook:
✅ *Opção A (Recomendada):* Mantenha a ADF ativa e adicione seu WhatsApp como método de verificação. É a forma mais segura e não atrasa em nada a sua entrega!
☑ *Opção B:* Desative a ADF. O meio mais rápido de entrar, mas não obrigatório, pode deixar ativada se desejar.

➡ *Passo 3: Copie seu ID de Jogador*
Dentro das configurações do jogo, localize e copie seu ID de jogador. Ele é nosso último "check" de segurança!

🚨 *Problemas Comuns? A gente ajuda!*
• *O botão do Facebook não aparece?*
Isso geralmente significa que a conta foi registrada como de menor idade. Não se preocupe! Entre em contato com o suporte do Dragon City e peça para vincularem sua conta.
• *Não lembra o login do Facebook conectado?*
O suporte do jogo também é o melhor caminho para te ajudar a recuperar suas informações.

✅ *Tudo Pronto! Vamos Verificar?*
Com os 3 passos concluídos, você está pronto para ter sua conta verificada e agilizar todas as suas futuras compras!`;

    await sendMessage(sock, jid, { text: tutorialText });
    // Não navega para nenhum estado, apenas exibe o tutorial e espera o próximo comando do usuário.
    delete userState[jid];
}


async function sendVerificationTutorial(sock, jid, accountIndex, fromVerificationChat = false) {
    const tutorialPath = DIRETORIO_TUTORIAL_VERIFY;
    try {
        if (fs.existsSync(tutorialPath)) {
            const files = fs.readdirSync(tutorialPath).sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || 0);
                const numB = parseInt(b.match(/\d+/)?.[0] || 0);
                return numA - numB;
            });
            for (const file of files) {
                const filePath = path.join(tutorialPath, file);
                if (fs.statSync(filePath).isFile()) {
                    const stats = fs.statSync(filePath);
                    if (stats.size > 0) {
                        const imageBuffer = fs.readFileSync(filePath);
                        if (imageBuffer && imageBuffer.length > 0) {
                            await sendMessage(sock, jid, { image: imageBuffer });
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Erro ao enviar imagens do tutorial de verificação:", e);
    }

    const tutorialText = `🚀 *Verifique sua Conta e Receba suas Compras mais rapidamente!* 🚀

➡ *Passo 1: Conecte sua conta ao Facebook*
Sua conta do Dragon City precisa estar vinculada a um perfil do Facebook para que nosso sistema possa acessá-la com segurança.
• *Não conectou ainda?* Vá nas configurações do jogo e clique para conectar via Facebook, como mostra a Imagem 1.
• *Já conectou?* Ótimo! Verifique qual conta está em uso (Imagem 2) e siga para o próximo passo.

➡ *Passo 2: Configure a Autenticação de Dois Fatores (ADF)*
Para um acesso rápido e sem interrupções, temos duas opções para a Autenticação de Dois Fatores (ADF) do seu Facebook:
✅ *Opção A (Recomendada):* Mantenha a ADF ativa e adicione seu WhatsApp como método de verificação. É a forma mais segura e não atrasa em nada a sua entrega! (Veja o passo a passo nas Imagens 4 a 13).
☑ *Opção B:* Desative a ADF. O meio mais rápido de entrar, mas não obrigatório, pode deixar ativada se desejar.

➡ *Passo 3: Copie seu ID de Jogador*
Dentro das configurações do jogo, localize e copie seu ID de jogador. Ele é nosso último "check" de segurança! Você o encontrará facilmente, como mostra a Imagem 14.

🚨 *Problemas Comuns? A gente ajuda!*
• *O botão do Facebook não aparece?* (Imagem 3)
Isso geralmente significa que a conta foi registrada como de menor idade. Não se preocupe! Entre em contato com o suporte do Dragon City e peça para vincularem sua conta. Eles podem demorar a responder, mas irão resolver seu problema!
• *Não lembra o login do Facebook conectado?*
O suporte do jogo também é o melhor caminho para te ajudar a recuperar suas informações.

✅ *Tudo Pronto! Vamos Verificar?*
Com os 3 passos concluídos, você está pronto para ter sua conta verificada e agilizar todas as suas futuras compras! Sua conta deverá aparecer uma opção de pedir código no whatsapp, ou entrar direto quando a tentativa de login for realizada, igual às duas últimas imagens.`;

    const menuOptions = `\n\nDigite o número correspondente à sua escolha:\n*1* - Solicitar Verificação\n*0* - Voltar ao Menu Principal`;

    if (!fromVerificationChat) {
        await sendMessage(sock, jid, { text: tutorialText + menuOptions });
        navigateTo(jid, 'awaiting_tutorial_verification_choice', { accountIndex });
    } else {
        await sendMessage(sock, jid, { text: tutorialText });
        await sendMessage(sock, jid, { text: "quando concluir, solicite uma nova verificação da conta" });
    }
}

async function handleVerificationRequest(sock, jid, accountIndex) {
    const user = userData[jid];
    const account = user?.savedAccounts?.[accountIndex];

    if (!user || !account) {
        await sendMessage(sock, jid, { text: "❌ Erro ao encontrar sua conta. Por favor, tente novamente." });
        return;
    }

    if (account.verified) {
        await sendMessage(sock, jid, { text: "✅ Esta conta já está verificada!" });
        await sendGameAccountManagementMenu(sock, jid);
        return;
    }

    const existingRequest = verificationRequests.find(req => req.userJid === jid && req.accountIndex === accountIndex && req.status === 'pendente');
    if (existingRequest) {
        await sendMessage(sock, jid, { text: "⏳ Você já tem uma solicitação de verificação em análise para esta conta. Por favor, aguarde." });
        await sendGameAccountManagementMenu(sock, jid);
        return;
    }

    user.savedAccounts[accountIndex].verificationStatus = 'pending';
    saveJsonFile(ARQUIVO_USUARIOS, userData);

    const newRequest = {
        userJid: jid,
        accountIndex: accountIndex,
        timestamp: new Date().toISOString(),
        status: 'pendente'
    };
    verificationRequests.push(newRequest);
    saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);

    await sendMessage(sock, jid, { text: "✅ Sua solicitação de verificação foi enviada e está em análise. Avisaremos assim que um atendente iniciar o processo!" });
    await sendGameAccountManagementMenu(sock, jid);
}


async function sendVerificationRequestsMenu(sock, jid) {
    const pendingRequests = verificationRequests.filter(r => r.status === 'pendente');
    const isComprador = compradoresData.hasOwnProperty(jid);

    if (pendingRequests.length === 0) {
        await sendMessage(sock, jid, { text: "🎉 Não há solicitações de verificação pendentes no momento." });
        delete userState[jid];
        return;
    }

    let menuText = `✅ *Solicitações de Verificação Pendentes* (${pendingRequests.length})\n\n`;

    if (isComprador) {
        menuText += "*Digite 1* para iniciar o atendimento da próxima solicitação na fila.\n\n";

        pendingRequests.forEach((req, index) => {
            const user = userData[req.userJid];
            const account = user?.savedAccounts?.[req.accountIndex];
            if (user && account) {
                menuText += `*${index + 1}.* ${user.nome} (Conta: ${account.alias})\n`;
            }
        });
    }



    menuText += "\n0️⃣ - Sair";

    await sendInteractiveList(sock, jid, {
        fallbackText: menuText,
        state: 'awaiting_verification_choice',
        stateData: { requests: pendingRequests }
    });
}

async function refuseVerification(sock, request, sellerJid, clientMessage, sellerMessage, options = {}) {
    const { sendTutorial = false } = options;
    const clientJid = request.userJid;

    // 1. Find and update the request/account data
    const userToUpdate = userData[clientJid];
    if (userToUpdate && userToUpdate.savedAccounts[request.accountIndex]) {
        userToUpdate.savedAccounts[request.accountIndex].verificationStatus = 'rejected';
        saveJsonFile(ARQUIVO_USUARIOS, userData);
    }

    const requestIndex = verificationRequests.findIndex(r => r.timestamp === request.timestamp);
    if (requestIndex > -1) {
        verificationRequests.splice(requestIndex, 1);
        saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);
    }

    // 2. Clear states and active chat for both users (Free the seller first)
    activeChats = activeChats.filter(c => !(c.sellerJid === sellerJid && c.clientJid === clientJid));
    saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
    delete userState[sellerJid];
    delete userState[clientJid];

    // 3. Send confirmation to seller
    await sendMessage(sock, sellerJid, { text: sellerMessage });

    // 4. Send messages to client (slower part last)
    await sendMessage(sock, clientJid, { text: clientMessage });
    if (sendTutorial) {
        await sendVerificationTutorial(sock, clientJid, request.accountIndex, true);
    }
}

// --- LÓGICA DE CONEXÃO E MENSAGENS ---

// [CÓDIGO NOVO E CORRIGIDO] - SUBSTITUA A FUNÇÃO INTEIRA POR ESTA
async function connectToWhatsApp() {
    console.log('Iniciando conexão com WhatsApp via WPPConnect...');

    const wppClient = await wppconnect.create({
        session: 'powershop-bot',
        catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
            console.log('QR Code recebido, escaneie com seu celular!');
            console.log(asciiQR);
        },
        statusFind: (statusSession, session) => {
            console.log('Status da sessão:', statusSession);
        },
        folderNameToken: DIRETORIO_AUTH,
        headless: true,
        devtools: false,
        useChrome: false,
        debug: false,
        logQR: true,
        browserArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        autoClose: 60000,
        disableWelcome: true
    });

    console.log('Bot conectado ao WhatsApp via WPPConnect!');

    // Cria cliente compatível com Baileys
    const sock = createBaileysCompatibleClient(wppClient);
    sockInstance = sock;

    // Configura manipulador de mensagens do WPPConnect
    wppClient.onMessage(async (message) => {
        try {
            console.log('[WPPConnect] Mensagem recebida de:', message.from, 'Tipo:', message.type);

            // Ignora mensagens enviadas por nós mesmos
            if (message.fromMe) {
                console.log('[WPPConnect] Mensagem ignorada (fromMe)');
                return;
            }
            if (message.from === 'status@broadcast') {
                console.log('[WPPConnect] Mensagem de status ignorada');
                return;
            }

            // Normaliza o JID para formato Baileys
            let rawJid;
            if (message.isGroupMsg) {
                // Grupos mantêm o formato @g.us
                rawJid = message.from;
            } else {
                // Usuários individuais: converte @c.us para @s.whatsapp.net
                rawJid = message.from.replace('@c.us', '@s.whatsapp.net');
            }

            // Converte mensagem WPPConnect para formato Baileys
            const msg = {
                key: {
                    remoteJid: rawJid,
                    fromMe: message.fromMe,
                    id: message.id,
                    _wppMessageId: message.id // Armazena ID completo para reações
                },
                message: {},
                pushName: message.notifyName || message.from.split('@')[0]
            };

            // Adiciona participant se for mensagem de grupo
            if (message.isGroupMsg && message.author) {
                msg.key.participant = message.author.replace('@c.us', '@s.whatsapp.net');
                // Atualiza pushName com o nome do autor se disponível
                if (message.sender && message.sender.pushname) {
                    msg.pushName = message.sender.pushname;
                }
            }

            // Adapta conteúdo da mensagem
            if (message.type === 'chat') {
                msg.message.conversation = message.body;
            } else if (message.type === 'image') {
                msg.message.imageMessage = {
                    caption: message.caption || '',
                    mimetype: message.mimetype,
                    url: message.url
                };
            } else if (message.type === 'video') {
                msg.message.videoMessage = {
                    caption: message.caption || '',
                    mimetype: message.mimetype,
                    url: message.url
                };
            } else if (message.type === 'audio' || message.type === 'ptt') {
                msg.message.audioMessage = {
                    mimetype: message.mimetype,
                    url: message.url
                };
            } else if (message.type === 'document') {
                msg.message.documentMessage = {
                    mimetype: message.mimetype,
                    url: message.url,
                    fileName: message.filename
                };
            } else if (message.type === 'list_response') {
                // Processa resposta de lista interativa
                console.log('[WPPConnect] Processando list_response:', JSON.stringify(message));

                // Extrai o rowId selecionado
                let rowId = null;
                if (message.listResponse && message.listResponse.singleSelectReply) {
                    rowId = message.listResponse.singleSelectReply.selectedRowId;
                } else if (message.selectedRowId) {
                    rowId = message.selectedRowId;
                }

                console.log('[WPPConnect] RowId extraído:', rowId);

                if (rowId) {
                    // Converte para mensagem de texto com o rowId
                    msg.message.conversation = rowId;
                } else {
                    console.warn('[WPPConnect] list_response sem rowId, ignorando');
                    return;
                }
            }

            // Verifica se a mensagem tem conteúdo
            if (Object.keys(msg.message).length === 0) {
                console.log('[WPPConnect] Mensagem sem conteúdo, ignorando. Tipo original:', message.type);
                return;
            }

            console.log('[WPPConnect] Emitindo evento messages.upsert para:', rawJid);

            // Emite evento messages.upsert para processamento pelo handler original
            sock.ev.emit('messages.upsert', {
                messages: [msg],
                type: 'notify'
            });

        } catch (error) {
            console.error('[WPPConnect] Erro ao processar mensagem:', error);
        }
    });

    // Manipulador de mudanças de estado
    wppClient.onStateChange(async (state) => {
        console.log('Estado da conexão:', state);

        if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
            // Emite evento de desconexão para o handler original processar
            sock.ev.emit('connection.update', {
                connection: 'close',
                lastDisconnect: {
                    error: { output: { statusCode: 'session-conflict' } }
                }
            });
        } else if (state === 'CONNECTED') {
            // Emite evento de conexão aberta
            sock.ev.emit('connection.update', {
                connection: 'open'
            });
        }
    });

    // Simula evento de conexão aberta para inicializar o handler original
    setTimeout(() => {
        sock.ev.emit('connection.update', {
            connection: 'open'
        });
    }, 1000);

    // Mantém os handlers originais abaixo...
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // NOVA LÓGICA PARA EXIBIR O QR CODE
        if (qr) {
            console.log("QR Code recebido, escaneie com seu celular!");
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === "close") {
            // Salva o tempo online dos Gerenciadores de Cartão
            Object.keys(gerenciadoresCartaoData).forEach(managerJid => {
                const manager = gerenciadoresCartaoData[managerJid];
                if (manager.status === 'on' && manager.onlineSince) {
                    const sessionTime = Date.now() - manager.onlineSince;
                    manager.totalOnlineTime = (manager.totalOnlineTime || 0) + sessionTime;
                    manager.onlineSince = null;
                }
            });
            saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);

            // LÓGICA DE RECONEXÃO CORRIGIDA (WPPConnect não usa Boom)
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== 'logged-out';
            console.log(
                `Conexão fechada. Motivo: ${lastDisconnect?.error || 'desconhecido'}. Reconectando: ${shouldReconnect}`,
            );
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === "open") {
            console.log("Bot online e conectado ao WhatsApp!");
            // Solicita re-sync de AppState para obter/atualizar chaves de snapshot e evitar erros de mutation
            try {
                if (typeof sock.requestAppStateSync === 'function') {
                    await sock.requestAppStateSync();
                } else if (typeof sock.resyncMainAppState === 'function') {
                    await sock.resyncMainAppState();
                }
            } catch (e) {
                console.error('Falha ao solicitar AppState Sync:', e);
            }
            activeChats = loadJsonFile(ARQUIVO_CHATS_ATIVOS, []);
            activeChats.forEach(chat => {
                const step = chat.type === 'verification' ? 'in_verification_chat' : 'in_direct_chat';
                userState[chat.sellerJid] = { history: [{ step, data: { partnerJid: chat.clientJid, ...(chat.orderId && { orderId: chat.orderId }), ...(chat.request && { request: chat.request }) } }] };
                userState[chat.clientJid] = { history: [{ step, data: { partnerJid: chat.sellerJid, ...(chat.orderId && { orderId: chat.orderId }), ...(chat.request && { request: chat.request }) } }] };
            });
            console.log(`${activeChats.length} chats ativos restaurados.`);
        }
    });

    // WPPConnect gerencia credenciais automaticamente
    // sock.ev.on("creds.update", saveCreds); // Removido - não necessário com WPPConnect

    sock.ev.on("messages.upsert", async (m) => {
        let msg;
        let userJid;
        try {
            console.log('[Handler] messages.upsert chamado, total mensagens:', m.messages?.length);
            msg = m.messages[0];

            if (!msg.message) {
                console.log('[Handler] Mensagem sem conteúdo, ignorando');
                return;
            }
            if (msg.key.fromMe) {
                try {
                    await sock.readMessages([msg.key]);
                } catch (e) {
                    // console.log("Não foi possível marcar a própria mensagem como lida.");
                }
                return;
            };

            if (msg.key.remoteJid === 'status@broadcast') {
                console.log('[Handler] Mensagem de status ignorada');
                return;
            }

            userJid = msg.key.remoteJid;
            console.log('[Handler] Processando mensagem de:', userJid);

            const isGroup = userJid.endsWith('@g.us');
            const senderJid = isGroup ? (msg.key.participant || userJid) : userJid;

            // Se for grupo, processa apenas para ranking e comandos públicos
            if (isGroup) {
                const messageText = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
                const senderName = msg.pushName || senderJid.split('@')[0];

                console.log(`[Ranking] Grupo: ${userJid}, Sender: ${senderJid}, Mensagem: "${messageText}"`);

                // Incrementa contador de mensagens para ranking
                incrementGroupMessage(userJid, senderJid, senderName);

                // Verifica se é o comando /ranking (apenas sem argumentos em grupos)
                if (messageText.toLowerCase() === '/ranking') {
                    console.log(`[Ranking] Comando /ranking detectado no grupo!`);
                    // Mostra ranking atual do grupo, citando a mensagem original
                    const quotedMsgId = msg.key._wppMessageId || msg.key.id;
                    await sendGroupRanking(sock, userJid, null, quotedMsgId);
                } else if (messageText.toLowerCase().startsWith('/ranking ')) {
                    // Se tentar usar com data no grupo, avisa para usar no privado
                    const quotedMsgId = msg.key._wppMessageId || msg.key.id;
                    await sendMessage(sock, userJid, {
                        text: '⚠️ Para consultar rankings anteriores, use o comando `/ranking MM/YYYY` no privado do bot.',
                        quotedMsgId: quotedMsgId
                    });
                }

                // Permite comandos públicos: /comida, /farm e /comandos
                const publicGroupCommands = ['/comida', '/farm', '/comandos'];
                const commandMatch = messageText.match(/^(\/\w+)/);
                const commandName = commandMatch ? commandMatch[1].toLowerCase() : '';

                // Em grupos, o estado é por participante (senderJid), não por grupo
                // Verifica se há um estado ativo para processar (ex: usuário respondendo ao /farm)
                const hasActiveState = userState[senderJid] && userState[senderJid].history && userState[senderJid].history.length > 0;
                const activeStep = hasActiveState ? userState[senderJid].history[userState[senderJid].history.length - 1].step : null;
                const isFarmState = activeStep && (activeStep === 'awaiting_farm_dragon_choice' || activeStep === 'awaiting_farm_calculation' || activeStep === 'awaiting_farm_dragon_choice_fallback');

                console.log('[Handler] Estado em grupo:', {
                    senderJid,
                    hasActiveState,
                    activeStep,
                    isFarmState,
                    commandName
                });

                if (!publicGroupCommands.includes(commandName) && !isFarmState) {
                    console.log('[Handler] Mensagem de grupo processada para ranking');
                    return;
                }

                // Se chegou aqui, é um comando público ou resposta a comando público - continua o processamento
                console.log(`[Handler] Processando comando público em grupo: ${commandName || 'resposta a ' + activeStep}`);
            }

            console.log('[Handler] Verificando isDirectUserJid, userJid:', userJid, 'isGroup:', isGroup);

            // Ignorar qualquer mensagem que não seja de usuário direto (grupos/canais/newsletters)
            // EXCETO se for um grupo com comando público
            if (!isDirectUserJid(userJid) && !isGroup) {
                console.log('[Handler] Mensagem ignorada (não é usuário direto):', userJid);
                return;
            }

            console.log('[Handler] Continuando processamento...');

            if (!userJid) {
                return;
            }

            // Marca a mensagem como lida (apenas em conversas privadas, não em grupos)
            if (!isGroup) {
                try {
                    await sock.readMessages([msg.key]);
                } catch (error) {
                    console.error('[Handler] Erro ao marcar como lida:', error.message);
                }
            }

            const messageId = msg.key.id;

            if (messageProcessing.has(messageId)) {
                return;
            }
            messageProcessing.add(messageId);
            setTimeout(() => messageProcessing.delete(messageId), 2000);


            const messageText = (
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                ""
            ).trim();
            const messageType = Object.keys(msg.message)[0];

            // MODO LEGACY: Listas interativas foram removidas - apenas texto é processado

            if (!messageText && !msg.message.imageMessage && !msg.message.audioMessage && !msg.message.videoMessage) return;
            const normalizedSender = normalizeDirectJid(senderJid);
            const isAdmin = adminData.hasOwnProperty(senderJid) || adminData.hasOwnProperty(normalizedSender);
            const isComprador = compradoresData.hasOwnProperty(senderJid) || compradoresData.hasOwnProperty(normalizedSender);
            const isProductManager = productManagerData.hasOwnProperty(senderJid) || productManagerData.hasOwnProperty(normalizedSender);
            const isGerenciadorCartao = gerenciadoresCartaoData.hasOwnProperty(senderJid) || gerenciadoresCartaoData.hasOwnProperty(normalizedSender);
            const isGerenciadorTrocaRegional = gerenciadoresTrocaRegionalData.hasOwnProperty(senderJid) || gerenciadoresTrocaRegionalData.hasOwnProperty(normalizedSender);
            const isOwner = senderJid === OWNER_JID;
            const userProfile = userData[userJid] || {};
            const isSilencedUser = userProfile.status === 'comprador';

            // Para comandos públicos em grupos (/farm, /comida), usar senderJid para estado
            // Para conversas privadas, usar userJid
            const effectiveJid = isGroup ? senderJid : userJid;

            // Handler especial para imagem do menu
            const userCurrentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
            if (userCurrentState?.step === 'awaiting_menu_image' && msg.message.imageMessage) {
                try {
                    const buffer = await downloadMediaMessage(msg, "buffer");
                    if (buffer && buffer.length > 0) {
                        fs.writeFileSync(CAMINHO_IMAGEM_MENU, buffer);
                        shopData.imagemMenu = CAMINHO_IMAGEM_MENU;
                        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                        await sendMessage(sock, userJid, { text: "✅ Imagem do menu atualizada com sucesso!\n\nA nova imagem será exibida para todos os clientes." });
                        await sendParametersManagementMenu(sock, userJid);
                    } else {
                        await sendMessage(sock, userJid, { text: "❌ Erro ao processar a imagem. Tente novamente." });
                    }
                } catch (error) {
                    console.error('Erro ao salvar imagem do menu:', error);
                    await sendMessage(sock, userJid, { text: "❌ Erro ao salvar a imagem. Tente novamente." });
                }
                return;
            }

            if ((!userState[userJid] || userState[userJid].history.length === 0) && waitingOrders.some(o => o.clientJid === userJid)) {
                navigateTo(userJid, 'awaiting_reactivation');
            }

            if (messageText.startsWith('./')) {
                const chatMessage = messageText.substring(2).trim();
                const senderName = userData[userJid]?.nome || userJid.split('@')[0];
                const senderRole = isAdmin ? 'Administrador' : 'Cliente';

                if (isAdmin) {
                    const quotedMsgContext = msg.message.extendedTextMessage?.contextInfo;
                    if (quotedMsgContext && quotedMsgContext.participant) {
                        const targetJid = quotedMsgContext.participant;
                        const formattedMessage = `*[${senderName} - ${senderRole}]*\n${chatMessage}`;
                        await sendMessage(sock, targetJid, { text: formattedMessage });
                        await sendMessage(sock, userJid, { text: `✅ Mensagem enviada para ${userData[targetJid]?.nome || targetJid.split('@')[0]}` });
                    } else {
                        await sendMessage(sock, userJid, { text: "Para enviar uma mensagem a um cliente, você deve responder a uma mensagem dele com o comando `./`." });
                    }
                } else {
                    const formattedMessage = `*[${senderName} - ${senderRole}]*\n${chatMessage}`;
                    for (const adminJid in adminData) {
                        if (adminData[adminJid].notificacoes?.mensagemCompradores) {
                            try {
                                await sendMessage(sock, adminJid, { text: formattedMessage });
                            } catch (e) {
                                console.error(`Falha ao enviar mensagem de chat para o admin ${adminJid}:`, e);
                            }
                        }
                    }
                    await sendMessage(sock, userJid, { text: "✅ Sua mensagem foi enviada aos administradores." });
                }
                return;
            }


            // Comando /ranking no privado (apenas para admins)
            if (messageText.toLowerCase().startsWith('/ranking')) {
                const args = messageText.split(' ');

                // Se tem argumento de período (MM/YYYY)
                if (args.length > 1 && args[1].match(/^\d{2}\/\d{4}$/)) {
                    // Verifica se o usuário é admin (testa múltiplos formatos de JID)
                    const normalizedSender = normalizeDirectJid(userJid);
                    const senderNumber = userJid.split('@')[0];
                    const altFormats = [
                        userJid,
                        normalizedSender,
                        `${senderNumber}@c.us`,
                        `${senderNumber}@s.whatsapp.net`,
                        `${senderNumber}@lid`
                    ];

                    const isAdmin = altFormats.some(format => adminData.hasOwnProperty(format));

                    console.log(`[Ranking] Verificando admin para ${userJid}. É admin: ${isAdmin}`);

                    if (isAdmin) {
                        await sendHistoricalRankingMenu(sock, userJid, args[1]);
                    } else {
                        await sendMessage(sock, userJid, {
                            text: '❌ Apenas administradores podem visualizar rankings anteriores.'
                        });
                    }
                } else {
                    // Sem argumento - mostra mensagem de ajuda
                    await sendMessage(sock, userJid, {
                        text: '📊 *Comando /ranking*\n\n*Uso:* `/ranking MM/YYYY`\n\n*Exemplo:* `/ranking 11/2025`\n\nEste comando lista os grupos com ranking disponível no período informado.\n\n💡 Nos grupos, use apenas `/ranking` para ver o ranking atual.'
                    });
                }
                return;
            }

            if (isSilencedUser && !messageText.startsWith('/') && (!userState[userJid] || userState[userJid].history.length === 0)) {
                if (messageText.toLowerCase() === 'menu' && (isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional || isAdmin || isProductManager)) {
                    await sendCompradorMenu(sock, userJid);
                }
                return;
            }

            // Gatilho de primeira conversa: selecionar idioma se ainda não definido
            const currentStep = userState[userJid]?.history?.[userState[userJid].history.length - 1]?.step;
            if (!isGroup && (!userData[userJid] || !userData[userJid].language) && userProfile.status !== 'em_atendimento' && userProfile.status !== 'em_suporte' && currentStep !== 'awaiting_language_choice') {
                await sendLanguageSelectionList(sock, userJid);
                navigateTo(userJid, 'awaiting_language_choice');
                return;
            }

            // Verifica se o cadastro do usuário está completo (tem nome e plataforma)
            const stepsQuePermitemCadastroIncompleto = [
                'awaiting_language_choice',
                'register_name',
                'register_platform_choice',  // Escolha da plataforma
                'register_invitation_choice', // Escolha se tem código de convite
                'register_invitation_code'    // Digitação do código
            ];
            const isInRegistrationFlow = currentStep && stepsQuePermitemCadastroIncompleto.includes(currentStep);

            // Se userState existe (ou seja, usuário está ativo), então só força cadastro se NÃO estiver no fluxo de registro
            // Se userState NÃO existe (reinício do bot), só força cadastro se for a primeira mensagem (não está em meio a nada)
            const hasActiveState = userState[userJid] && userState[userJid].history && userState[userJid].history.length > 0;
            const shouldForceRegistration = hasActiveState ? !isInRegistrationFlow : true; // Se tem estado ativo, respeita o fluxo; se não tem, força apenas se for primeira interação

            if (!isGroup && userData[userJid] && userData[userJid].language && (!userData[userJid].nome || !userData[userJid].plataforma) &&
                userProfile.status !== 'em_atendimento' && userProfile.status !== 'em_suporte' && shouldForceRegistration &&
                !isAdmin && !isComprador && !isProductManager && !isGerenciadorCartao && !isGerenciadorTrocaRegional) {
                // Cadastro incompleto - iniciar fluxo de cadastro
                await sendMessage(sock, userJid, {
                    text: "⚠️ Seu cadastro está incompleto!\n\nPara continuar usando a PowerShop, precisamos que você complete suas informações.\n\n📘 Vamos começar! Qual é o seu nome?"
                });
                navigateTo(userJid, "register_name");
                return;
            }

            const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
            if (currentState && (currentState.step === 'in_direct_chat' || currentState.step === 'in_verification_chat')) {
                const { partnerJid } = currentState.data;
                const isStaffMessage = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
                const command = messageText.toLowerCase();
                const isCommand = command.startsWith('/');
                const isStaffUser = isComprador || isAdmin || isProductManager || isGerenciadorCartao || isGerenciadorTrocaRegional;

                // Nova regra: Se for staff em atendimento e o comando não for válido, reage com ❌ e ignora
                if (isStaffUser && isCommand) {
                    const validChatCommands = ['/face', '/whats', '/sms', '/email', '/code', '/insta', '/entrei', '/incorreto', '/ausente', '/erro', '/suporte', '/finalizar', '/gerar', '/id', '/cartao', '/tutorial'];
                    const commandNameOnly = command.split(' ')[0];
                    if (!validChatCommands.includes(commandNameOnly)) {
                        await sock.sendMessage(userJid, { react: { text: "❌", key: msg.key } });
                        return; // Ignora o comando
                    }
                }

                if (isStaffUser && !isCommand) {
                    const clientState = userState[partnerJid]?.history?.[userState[partnerJid].history.length - 1];
                    const isSingleDigit = /^[0-9]$/.test(messageText.trim());

                    // Não encaminha opções numéricas de controle (1, 2, etc.) digitadas pelo staff
                    if (isSingleDigit) {
                        await sock.sendMessage(userJid, { react: { text: "🤖", key: msg.key } });
                        return;
                    }

                    // Se o cliente está aguardando seleção, não encaminha nada do staff
                    if (clientState && clientState.step.includes('awaiting_')) {
                        await sock.sendMessage(userJid, { react: { text: "❌", key: msg.key } });
                        return;
                    }
                }


                if (messageType !== 'conversation' && messageType !== 'extendedTextMessage') {
                    // Baixa e reenvia a mídia (imagem, vídeo, áudio, etc.)
                    try {
                        const buffer = await downloadMediaMessage(msg, "buffer");

                        if (buffer && buffer.length > 0) {
                            let mediaMessage = {};

                            if (msg.message.imageMessage) {
                                mediaMessage = { image: buffer, caption: msg.message.imageMessage.caption || '' };
                            } else if (msg.message.videoMessage) {
                                mediaMessage = { video: buffer, caption: msg.message.videoMessage.caption || '' };
                            } else if (msg.message.audioMessage) {
                                mediaMessage = { audio: buffer, ptt: msg.message.audioMessage.ptt || false };
                            } else if (msg.message.documentMessage) {
                                mediaMessage = { document: buffer, mimetype: msg.message.documentMessage.mimetype, fileName: msg.message.documentMessage.fileName };
                            }

                            await sendMessage(sock, partnerJid, mediaMessage);
                            if (isStaffMessage) {
                                await sock.sendMessage(userJid, { react: { text: "✅", key: msg.key } });
                            }
                        }
                    } catch (error) {
                        console.error('Erro ao encaminhar mídia:', error);
                        await sendMessage(sock, userJid, { text: "❌ Erro ao enviar a mídia. Tente novamente." });
                    }
                    return;
                }



                if (!isCommand) {
                    const senderName = isStaffMessage ? "Atendente" : (userData[userJid]?.nome || userJid.split('@')[0]);
                    const formattedMessage = `*[ ${senderName} ]*\n${messageText}`;
                    await sendMessage(sock, partnerJid, { text: formattedMessage });
                    if (isStaffMessage) {
                        await sock.sendMessage(userJid, { react: { text: "✅", key: msg.key } });
                    }
                    return;
                }
            }


            const lastState = userState[userJid]?.history?.[userState[userJid].history.length - 1];

            // Tratamento da seleção de idioma via lista
            if (lastState && lastState.step === 'awaiting_language_choice') {
                // MODO LEGACY: Apenas entrada numérica/texto é suportada
                let chosenLang = null;
                const t = messageText.trim().toLowerCase();
                const map = {
                    '1': 'en', 'english': 'en', 'ingles': 'en', 'inglês': 'en', 'en': 'en',
                    '2': 'pt', 'portugues': 'pt', 'português': 'pt', 'pt': 'pt',
                    '3': 'es', 'espanhol': 'es', 'español': 'es', 'es': 'es',
                    '4': 'hi', 'hindi': 'hi', 'indiano': 'hi', 'hi': 'hi',
                    '5': 'id', 'indonesio': 'id', 'indonésio': 'id', 'bahasa': 'id', 'indonesia': 'id', 'id': 'id'
                };
                chosenLang = map[t] || null;

                if (chosenLang && SUPPORTED_LANGUAGES[chosenLang]) {
                    userData[userJid] = userData[userJid] || { status: 'navegando' };
                    userData[userJid].language = chosenLang;
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    await sendMessage(sock, userJid, { text: `✅ Idioma atualizado para: ${SUPPORTED_LANGUAGES[chosenLang]}.` });
                    delete userState[userJid];

                    // Verificar se o usuário já tem perfil completo (nome e plataforma)
                    if (!userData[userJid].nome || !userData[userJid].plataforma) {
                        // Usuário novo, iniciar fluxo de cadastro
                        await sendMessage(sock, userJid, { text: "📘 Vamos começar seu cadastro! Qual é o seu nome?" });
                        navigateTo(userJid, "register_name");
                    } else {
                        // Usuário já cadastrado, ir para o menu principal
                        await sendMainMenu(sock, userJid);
                    }
                } else {
                    await sendMessage(sock, userJid, { text: 'Por favor, selecione uma opção numérica válida (1 a 5).' });
                    await sendLanguageSelectionList(sock, userJid);
                }
                return;
            }

            const zeroEnabledSpecificSteps = [
                'awaiting_coupon_code',
                'awaiting_invite_code_from_profile',
                'awaiting_pix_payment',
                'awaiting_card_payment',
                'register_invitation_code',
                'awaiting_product_category_list',
                'awaiting_generic_product_selection',
                'awaiting_section_browse_choice',
                'awaiting_product_browse_choice',
                'awaiting_buyer_notification_toggle',
                'awaiting_sphere_quantity'
            ];

            const isZeroOptionAvailable = lastState && (
                lastState.step.includes("choice") ||
                lastState.step.includes("menu") ||
                lastState.step.includes("action") ||
                lastState.step.includes("confirmation") ||
                lastState.step.includes("browse") ||
                lastState.step.includes("selection") ||
                zeroEnabledSpecificSteps.includes(lastState.step)
            );


            if (messageText === "0") {
                if (!isZeroOptionAvailable) {
                    if (lastState && (lastState.step === 'in_direct_chat' || lastState.step === 'in_verification_chat')) {
                        // Ignora o '0' se estiver em chat direto, pois pode ser parte de um código
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, []);
                    }
                    return;
                }
                if (lastState && lastState.step !== 'in_direct_chat' && lastState.step !== 'in_verification_chat') {
                    const previousState = await goBack(sock, userJid);
                    if (previousState) {
                        const { step, data } = previousState;
                        const functionMap = {
                            "awaiting_menu_choice": sendMainMenu,
                            "awaiting_profile_choice": sendMainMenu,
                            "awaiting_history_choice": sendProfileView,
                            "awaiting_order_details_action": sendPurchaseHistory,
                            "awaiting_buy_choice": sendBuyMenu,
                            "awaiting_offer_section_choice": sendOfferSections,
                            "awaiting_sphere_section_choice": sendSphereSections,
                            "awaiting_offer_choice": (sock, jid, data) => sendOfferList(sock, jid, data.sectionPath),
                            "awaiting_sphere_choice": (sock, jid, data) => sendSphereList(sock, jid, data.sectionPath),
                            "awaiting_add_to_cart_confirmation": (sock, jid, data) => {
                                if (data.type === "oferta") return sendOfferList(sock, jid, data.sectionPath);
                                if (data.type === "esfera") return sendSphereList(sock, jid, data.sectionPath);
                                if (data.type === "conta_exclusiva") return sendAccountList(sock, jid);
                                return sendBuyMenu(sock, jid);
                            },
                            "awaiting_cart_action": sendBuyMenu,
                            "awaiting_powerpoint_purchase_confirmation": sendCartView,
                            "awaiting_terms_confirmation": sendCartView,
                            "awaiting_coupon_code": sendCartView,
                            "awaiting_edit_profile_choice": sendProfileView,
                            "awaiting_support_choice": sendMainMenu,
                            "awaiting_support_confirmation": sendSupportMenu,
                            "awaiting_faq_choice": (sock, jid, data) => {
                                const parentPath = path.dirname(data.currentPath);
                                if (data.currentPath && parentPath !== '.') {
                                    return sendFaqMenu(sock, jid, parentPath);
                                }
                                return sendSupportMenu(sock, jid);
                            },
                            "awaiting_admin_choice": (sock, jid) => { delete userState[jid]; sendMainMenu(sock, jid); },
                            "awaiting_team_management_choice": sendAdminPanel,
                            "awaiting_manage_compradores_choice": sendTeamManagementMenu,
                            "awaiting_manage_admins_choice": sendTeamManagementMenu,
                            "awaiting_manage_product_managers_choice": sendTeamManagementMenu,
                            "awaiting_manage_card_managers_choice": sendTeamManagementMenu,
                            "awaiting_manage_regional_change_managers_choice": sendTeamManagementMenu,
                            "awaiting_notification_toggle_choice": sendAdminPanel,
                            "awaiting_product_category_list": sendAdminPanel,
                            "awaiting_generic_product_action": sendProductCategoryList,
                            "awaiting_product_browse_choice": (sock, jid, data) => {
                                const parentPath = path.dirname(data.currentPath);
                                if (data.currentPath && parentPath !== '.' && parentPath !== '..') {
                                    return sendProductManagementBrowser(sock, jid, data.action, parentPath, data.productType);
                                }
                                return sendProductCategoryList(sock, jid);
                            },
                            "awaiting_edit_attribute_choice": (sock, jid, data) => sendProductManagementBrowser(sock, jid, "edit", data.section, data.category),
                            "awaiting_sphere_quantity": (sock, jid, data) => sendSphereList(sock, jid, data.sectionPath),
                            "awaiting_sphere_purchase_confirmation": (sock, jid, data) => askForSphereQuantity(sock, jid, data.product, data.sectionPath),
                            "awaiting_account_choice": sendBuyMenu,
                            "awaiting_discount_admin_choice": sendAdminPanel,
                            "awaiting_coupon_list": sendManageDiscountsMenu,
                            "awaiting_invitation_list": sendManageDiscountsMenu,
                            "awaiting_ticket_type_choice": sendAdminPanel,
                            "awaiting_ticket_to_close_choice": sendTicketTypeMenu,
                            "awaiting_comprador_menu_choice": (sock, jid) => { delete userState[jid]; sendMainMenu(sock, jid); },
                            "awaiting_earnings_menu_choice": sendCompradorMenu,
                            "awaiting_payout_pix_choice": sendMyEarningsMenu,
                            "awaiting_payment_method_choice": sendCartView,
                            "awaiting_other_payment_method_choice": sendPaymentMethodChoice,
                            "awaiting_game_account_management_choice": sendProfileView,
                            "awaiting_specific_game_account_action": (sock, jid) => sendGameAccountManagementMenu(sock, jid),
                            "awaiting_verification_main_menu_choice": (sock, jid, data) => sendGameAccountManagementMenu(sock, jid),
                            "awaiting_tutorial_verification_choice": (sock, jid, data) => sendVerificationMainMenu(sock, jid, data.accountIndex),
                            "register_invitation_code": (sock, jid, data) => { // Lógica para o "0" no código de convite
                                userData[jid] = {
                                    nome: data.newName,
                                    plataforma: data.newPlatform,
                                    compras: 0,
                                    totalEconomizado: 0,
                                    powerPoints: 0,
                                    status: 'navegando',
                                    hasInviteDiscount: false,
                                    invitedBy: null,
                                    savedAccounts: [],
                                    notificado: false
                                };
                                generateInviteCode(data.newName, jid).then(() => {
                                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                                    if (!purchaseHistoryData[jid]) {
                                        purchaseHistoryData[jid] = [];
                                        saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
                                    }
                                    sendMessage(sock, jid, { text: "🎉 Cadastro finalizado com sucesso! Seja bem-vindo(a) à PowerShop." }).then(() => {
                                        sendMainMenu(sock, jid);
                                    });
                                });
                            },
                        };
                        if (functionMap[step]) {
                            await functionMap[step](sock, userJid, data);
                        } else {
                            delete userState[userJid];
                            await sendMainMenu(sock, userJid);
                        }
                    }
                    return;
                }
            }


            if (messageText.startsWith("/")) {
                const [command, ...args] = messageText.split(" ");
                const commandName = command.toLowerCase();

                // Regra de chat privado
                const publicCommands = ['/ping', '/sorteio', '/positivo', '/negativo', '/idioma', '/tutorial', '/comida', '/farm', '/comandos'];
                if (isGroup && !publicCommands.includes(commandName) && !isAdmin) {
                    return;
                }

                // Reação de confirmação para comandos
                const staffCommands = ['/face', '/whats', '/sms', '/email', '/code', '/insta', '/entrei', '/incorreto', '/ausente', '/erro', '/suporte', '/finalizar', '/gerar', '/id', '/addcartao', '/cartao', '/cartoes', '/on', '/off', '/pedidos', '/criar', '/ativos', '/pedido', '/preferencia', '/emails', '/final', '/encerrar', '/reembolso', '/+'];
                if (staffCommands.includes(commandName) && (isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional)) {
                    await sock.sendMessage(userJid, { react: { text: "✅", key: msg.key } });
                }


                if (commandName === '/idioma') {
                    await sendLanguageSelectionList(sock, userJid);
                    navigateTo(userJid, 'awaiting_language_choice');
                    return;
                }

                const inDirectChat = currentState && currentState.step === 'in_direct_chat';
                const inVerificationChat = currentState && currentState.step === 'in_verification_chat';

                if (inDirectChat) {
                    const { partnerJid, orderId } = currentState.data;
                    const orderIndex = pendingOrders.findIndex(order => order.id === orderId);
                    const orderIndexV = pendingOrdersV.findIndex(order => order.id === orderId);
                    const isStaff = isComprador || isAdmin;

                    const sellerCommands = {
                        '/face': {
                            text: '📲 *Verificação via Facebook*\n\nOlá! Uma solicitação de login foi enviada para o seu aplicativo do Facebook. Por favor, abra-o e aprove a notificação para validarmos o acesso com segurança.',
                            confirm: '✅ Instruções de verificação do Facebook enviadas ao cliente.'
                        },
                        '/whats': {
                            text: '✅ *Código de Verificação - WhatsApp*\n\nPrezado(a), um código de verificação foi enviado para seu número de WhatsApp. Por favor, informe o código recebido aqui para darmos continuidade.',
                            confirm: '✅ Instruções de verificação do WhatsApp enviadas ao cliente.'
                        },
                        '/sms': {
                            text: '✉️ *Código de Verificação - SMS*\n\nEnviamos um código de verificação via SMS para o seu celular. Utilize este código para completar a autenticação e validar seu acesso.',
                            confirm: '✅ Instruções de verificação via SMS enviadas ao cliente.'
                        },
                        '/email': {
                            text: '📧 *Código de Verificação - E-mail*\n\nPara sua segurança, enviamos um código para o seu e-mail cadastrado. Verifique sua caixa de entrada (e a pasta de spam) e nos informe o código para prosseguir.',
                            image: path.join(DIRETORIO_MEDIA, 'tutorial', 'email.jpeg'),
                            confirm: '✅ Instruções de verificação de E-mail enviadas ao cliente.'
                        },
                        '/code': {
                            text: '📲 *Código de Verificação - App*\n\nUm código foi enviado para seu aplicativo de autenticação (Google Authenticator, etc). Por favor, informe o código para prosseguirmos.',
                            confirm: '✅ Instrução de verificação via App enviada ao cliente.'
                        },
                        '/insta': {
                            text: '📸 *Código de Verificação - Instagram*\n\nEnviamos um código de verificação para a sua conta do Instagram. Por favor, verifique suas mensagens e nos informe o código.',
                            confirm: '✅ Instrução de verificação via Instagram enviada ao cliente.'
                        },
                        '/entrei': {
                            confirm: '✅ Solicitando verificação de ID.' // Mensagem para o próprio vendedor
                        },
                        '/incorreto': {
                            confirm: '✅ O cliente foi notificado para corrigir os dados.'
                        },
                        '/ausente': { text: '📴 *Cliente Ausente*\n\nParece que você está offline no momento. Seu atendimento será movido para uma lista de espera. Assim que estiver online novamente, digite qualquer mensagem para retornarmos ao seu atendimento.' },
                        '/erro': { text: '❌ *Erro no Processamento*\n\nEncontramos um erro durante o processo de compra e não conseguimos continuar. Outro atendente irá assumir para tentar resolver.\n\nEnquanto isso, seu atendimento será movido para uma lista de espera. Assim que estiver pronto, digite qualquer mensagem para voltarmos ao seu atendimento.' }
                    };
                    const waitlistCommands = ['/ausente', '/erro', '/incorreto', '/tutorial'];

                    if (isStaff && sellerCommands[commandName]) {
                        const commandData = sellerCommands[commandName];
                        if (commandData.text) {
                            if (commandData.image && fs.existsSync(commandData.image)) {
                                const stats = fs.statSync(commandData.image);
                                if (stats.size > 0) {
                                    const imageBuffer = fs.readFileSync(commandData.image);
                                    if (imageBuffer && imageBuffer.length > 0) {
                                        await sendMessage(sock, partnerJid, {
                                            image: imageBuffer,
                                            caption: commandData.text
                                        });
                                    } else {
                                        await sendMessage(sock, partnerJid, { text: commandData.text });
                                    }
                                } else {
                                    await sendMessage(sock, partnerJid, { text: commandData.text });
                                }
                            } else {
                                await sendMessage(sock, partnerJid, { text: commandData.text });
                            }
                        }

                        if (commandData.confirm) {
                            await sendMessage(sock, userJid, { text: commandData.confirm });
                        }

                        if (commandName === '/entrei') {
                            const clientMessage = `👍 *Acesso Realizado com Sucesso!*\n\nConseguimos acessar sua conta. Para garantir que tudo ocorra perfeitamente, pedimos que não acesse o jogo até que nosso trabalho seja finalizado. Avisaremos assim que estiver tudo pronto!`;
                            await sendMessage(sock, partnerJid, { text: clientMessage });

                            const order = pendingOrders.find(o => o.id === orderId) || pendingOrdersV.find(o => o.id === orderId);
                            if (order && order.dragonCityId) {
                                const question = `Para confirmar que estamos na conta certa, por favor, informe os *4 últimos dígitos do ID do jogo* do cliente. Se não souber ou para pular, digite \`0000\`.`;
                                await sendMessage(sock, userJid, { text: question }); // Pergunta ao vendedor
                                navigateTo(userJid, 'awaiting_id_verification_digits_from_seller', {
                                    orderId: order.id,
                                    correctDigits: order.dragonCityId.slice(-4)
                                });
                            } else {
                                await sendMessage(sock, userJid, { text: "⚠️ Não foi possível encontrar um ID para este pedido. Prosseguindo sem verificação." });
                                await sendMessage(sock, userJid, { text: "Você precisa de um cartão novo?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não" });
                                navigateTo(userJid, 'awaiting_new_card_choice_after_login', { orderId });
                            }
                        }

                        if (waitlistCommands.includes(commandName)) {
                            let order = null;
                            let orderList = null;
                            let orderFile = null;
                            let listIndex = -1;

                            if (orderIndexV > -1) {
                                orderList = pendingOrdersV;
                                orderFile = ARQUIVO_PEDIDOS_V;
                                listIndex = orderIndexV;
                            } else if (orderIndex > -1) {
                                orderList = pendingOrders;
                                orderFile = ARQUIVO_PEDIDOS;
                                listIndex = orderIndex;
                            }

                            if (listIndex > -1) {
                                order = orderList.splice(listIndex, 1)[0];
                                order.status = 'pendente';
                                order.atendido_por = null;
                                waitingOrders.push(order);
                                saveJsonFile(orderFile, orderList);
                                saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);

                                if (commandName === '/incorreto') {
                                    await sendMessage(sock, partnerJid, { text: '⚠️ *Dados Incorretos*\n\nAs credenciais que você nos forneceu não estão corretas.\n\nPor favor, envie o *e-mail ou número* correto da sua conta do Facebook.' });
                                    navigateTo(partnerJid, 'awaiting_correction_login', { orderId: order.id, sourceQueue: order.sourceQueue });
                                }

                                if (commandName === '/tutorial') {
                                    await sendVerificationTutorial(sock, partnerJid, null, true);
                                }


                                activeChats = activeChats.filter(c => c.orderId !== orderId);
                                saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
                                delete userState[userJid];
                                if (commandName !== '/incorreto') {
                                    delete userState[partnerJid];
                                    navigateTo(partnerJid, 'awaiting_reactivation', { from: commandName });
                                }

                                await sendMessage(sock, userJid, { text: `O pedido de *${order.clientName}* foi movido para a lista de espera.` });

                                const updatedPendingOrders = [...pendingOrdersV, ...pendingOrders].filter(o => o.status === 'pendente');
                                if (updatedPendingOrders.length > 0) {
                                    await sendMessage(sock, userJid, { text: `Restam *${updatedPendingOrders.length}* pedidos pendentes. Deseja atender o próximo?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
                                    navigateTo(userJid, 'awaiting_next_order_choice');
                                } else {
                                    await sendMessage(sock, userJid, { text: "✅ Todos os outros pedidos foram processados!" });
                                }
                            }
                        }
                        return;
                    }
                    if (commandName === '/suporte') {
                        let order = null;

                        if (orderIndexV > -1) {
                            order = pendingOrdersV.splice(orderIndexV, 1)[0];
                            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
                        } else if (orderIndex > -1) {
                            order = pendingOrders.splice(orderIndex, 1)[0];
                            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
                        }

                        if (order) {
                            const clientJid = order.clientJid;
                            const buyerJid = order.atendido_por;

                            activeChats = activeChats.filter(c => c.orderId !== orderId);
                            saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);

                            userData[clientJid].status = "em_atendimento";
                            saveJsonFile(ARQUIVO_USUARIOS, userData);

                            const ticketText = `O comprador solicitou suporte para o pedido ID: ${order.id}. Cliente: ${order.clientName}. O pedido foi removido da fila de atendimento.`;
                            const newTicket = { clientJid, clientName: order.clientName, ticketText, timestamp: new Date().toISOString(), notificationKeys: [] };
                            openTickets.push(newTicket);
                            saveJsonFile(ARQUIVO_TICKETS, openTickets);
                            const notificationText = `🚨 *SUPORTE SOLICITADO EM VENDA* 🚨\n\n*Comprador:* ${userData[buyerJid]?.nome}\n*Cliente:* ${order.clientName}\n*Pedido ID:* ${order.id}\n\nO cliente foi direcionado para o suporte. Por favor, entre em contato com ele.`;
                            for (const adminJid in adminData) {
                                if (adminData[adminJid].notificacoes?.suporte) {
                                    try {
                                        const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                                        if (sentMsg?.key) newTicket.notificationKeys.push(sentMsg.key);
                                    } catch (e) { console.error(`Falha ao notificar admin ${adminJid}`); }
                                }
                            }
                            saveJsonFile(ARQUIVO_TICKETS, openTickets);

                            await sendMessage(sock, clientJid, { text: "O comprador solicitou a ajuda de um administrador para o seu atendimento. Por favor, aguarde, um de nossos administradores entrará em contato em breve. 🙏" });
                            await sendMessage(sock, buyerJid, { text: `✅ O cliente foi encaminhado para o suporte. O pedido *#${order.id}* foi removido da fila.` });

                            delete userState[buyerJid];
                            delete userState[clientJid];
                        }
                        return;
                    }

                    if (commandName === '/finalizar') {
                        if (isStaff && (orderIndex !== -1 || orderIndexV !== -1)) {
                            const order = orderIndexV > -1 ? pendingOrdersV[orderIndexV] : pendingOrders[orderIndex];
                            if (!order || order.atendido_por !== userJid) {
                                await sendMessage(sock, userJid, { text: "❌ Você não pode finalizar um pedido que não está atendendo." });
                                return;
                            }
                            if (order.items && order.items.length > 0) {
                                const lastStep = userState[userJid]?.history?.[userState[userJid].history.length - 1]?.step;
                                if (order.items.length > 1) {
                                    if (lastStep !== 'awaiting_ms_account_for_item') {
                                        navigateTo(userJid, 'awaiting_ms_account_for_item', { order, collectedEmails: [], itemIndex: 0 });
                                        const firstItem = order.items[0];
                                        const lang = getUserLanguage(userJid);
                                        const pcVal = firstItem.basePrices?.microsoft || 0;
                                        const pcText = pcVal ? ` (${await formatCurrencyByLanguage(pcVal, lang)})` : '';
                                        await sendMessage(sock, userJid, { text: `Digite o email pra oferta ${firstItem.name}:${pcText}` });
                                    }
                                } else {
                                    if (lastStep !== 'awaiting_ms_account_single') {
                                        navigateTo(userJid, 'awaiting_ms_account_single', { order, collectedEmails: [] });
                                        const onlyItem = order.items[0];
                                        const lang = getUserLanguage(userJid);
                                        const pcVal = onlyItem.basePrices?.microsoft || 0;
                                        const pcText = pcVal ? ` (${await formatCurrencyByLanguage(pcVal, lang)})` : '';
                                        await sendMessage(sock, userJid, { text: `Digite o email pra oferta ${onlyItem.name}:${pcText}` });
                                    }
                                }
                            } else {
                                await sendMessage(sock, userJid, { text: "Este pedido não tem itens listados. Finalizando..." });
                                // Adicionar lógica para finalizar sem itens se necessário
                            }
                            return;
                        }
                    }
                    if (commandName === '/gerar' && isStaff) {
                        if (!partnerJid) {
                            await sendMessage(sock, userJid, { text: "❌ Não foi possível identificar o cliente para gerar o pagamento. Tente novamente dentro do chat de atendimento." });
                            return;
                        }
                        const value = parseFloat(args[0]?.replace(',', '.'));
                        if (isNaN(value) || value <= 0) {
                            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Use o formato: */gerar 19.99*" });
                            return;
                        }
                        const langPix = getUserLanguage(partnerJid);
                        const valueFmt = await formatCurrencyByLanguage(value, langPix);
                        await sendMessage(sock, userJid, { text: `✅ Gerando um PIX no valor de ${valueFmt} para o cliente...` });
                        await startPixCheckoutProcess(sock, partnerJid, value, true, userJid);
                        return;
                    }
                }

                if (inVerificationChat) {
                    const { partnerJid, request } = currentState.data;
                    const isStaff = isComprador || isAdmin;
                    if (isStaff) {
                        if (commandName === '/finalizar') {
                            await sendMessage(sock, userJid, { text: "A verificação foi bem-sucedida?\n\n*1* - Sim\n*2* - Não" });
                            navigateTo(userJid, 'awaiting_verification_outcome', { request });
                            return;
                        }
                        if (commandName === '/whats') {
                            await sendMessage(sock, partnerJid, { text: '✅ *Código de Verificação - WhatsApp*\n\nPrezado(a), um código de verificação foi enviado para seu número de WhatsApp. Por favor, informe o código recebido aqui para darmos continuidade.' });
                            await sendMessage(sock, userJid, { text: '✅ Instruções de verificação do WhatsApp enviadas ao cliente.' });
                            return;
                        }
                        if (commandName === '/incorreto') {
                            const clientMessage = 'Sua senha está incorreta, edite a conta e adicione novamente o login correto no menu de gerenciamento de contas';
                            const sellerMessage = '✅ Mensagem de dados incorretos enviada. A verificação foi recusada.';
                            await refuseVerification(sock, request, userJid, clientMessage, sellerMessage);
                            return;
                        }
                        if (commandName === '/ausente') {
                            const clientMessage = '📴 Você está offline no momento.\nAssim que estiver disponível, por favor, solicite novamente a verificação da sua conta.';
                            const sellerMessage = '✅ Mensagem de ausência enviada. A verificação foi recusada.';
                            await refuseVerification(sock, request, userJid, clientMessage, sellerMessage);
                            return;
                        }
                        if (commandName === '/tutorial') {
                            const clientMessage = 'Sua conta possui autenticação de dois fatores e não possui um meio de pedir código via whatsapp, retire a ADF, ou siga o tutorial abaixo para adicionar um meio de autenticação via whatsapp.';
                            const sellerMessage = '✅ Tutorial enviado. A verificação será recusada.';
                            await refuseVerification(sock, request, userJid, clientMessage, sellerMessage, { sendTutorial: true });
                            return;
                        }
                    }
                }

                // Comandos gerais fora de chats especiais
                if (commandName === '/tutorial') {
                    await sendGlobalTutorial(sock, userJid);
                    return;
                }

                // Comando /comandos - lista os comandos disponíveis em grupos
                if (commandName === "/comandos") {
                    const comandosText = `📋 *Comandos Disponíveis*\n\n` +
                        `*Comandos Públicos (funcionam em grupos):*\n\n` +
                        `🏆 */ranking*\n` +
                        `Mostra o ranking de atividade do grupo no mês atual\n\n` +
                        `🍖 */comida x/y*\n` +
                        `Calcula a comida necessária para upar do nível x ao nível y\n` +
                        `_Exemplo: /comida 10/50_\n\n` +
                        `🐉 */farm quantidade/nível*\n` +
                        `Calcula a produção de comida dos dragões\n` +
                        `_Exemplo: /farm 10/40_\n\n` +
                        `📋 */comandos*\n` +
                        `Mostra esta lista de comandos\n\n` +
                        `💡 *Dica:* Use os comandos no privado do bot para mais opções!`;

                    await sendMessage(sock, userJid, { text: comandosText });
                    return;
                }

                // Comando /comida x/y - calcula quantidade de comida necessária
                if (commandName === "/comida") {
                    const match = args[0]?.match(/^(\d+)\/(\d+)$/);
                    if (!match) {
                        await sendMessage(sock, userJid, {
                            text: "⚠️ *Formato inválido!*\n\nUse: `/comida x/y`\n\n*Exemplo:* `/comida 10/50`\n\nOnde:\n• x = nível inicial\n• y = nível final"
                        });
                        return;
                    }

                    const startLevel = parseInt(match[1]);
                    const endLevel = parseInt(match[2]);

                    if (startLevel < 1 || startLevel >= endLevel || endLevel > 70) {
                        await sendMessage(sock, userJid, {
                            text: "⚠️ *Níveis inválidos!*\n\n• Nível inicial deve ser entre 1 e 69\n• Nível final deve ser maior que o inicial\n• Nível máximo é 70"
                        });
                        return;
                    }

                    let totalFood = 0;
                    for (let level = startLevel; level < endLevel; level++) {
                        totalFood += FOOD_PER_LEVEL[level] || 0;
                    }

                    // Formatar número com separadores de milhar
                    const formattedFood = totalFood.toLocaleString('pt-BR');

                    const responseText = `🍖 *Cálculo de Comida*\n\n` +
                        `*Nível:* ${startLevel} → ${endLevel}\n` +
                        `*Total necessário:* ${formattedFood} comida\n\n` +
                        `📊 Isso equivale a ${endLevel - startLevel} níveis de upgrade!`;

                    await sendMessage(sock, userJid, { text: responseText });
                    return;
                }

                // Comando /farm quantidade/nível - mostra lista de dragões
                if (commandName === "/farm") {
                    console.log('[Farm] Comando detectado, args:', args);
                    const match = args[0]?.match(/^(\d+)\/(\d+)$/);
                    console.log('[Farm] Match result:', match);

                    if (!match) {
                        console.log('[Farm] Formato inválido, enviando mensagem de erro');
                        await sendMessage(sock, userJid, {
                            text: "⚠️ *Formato inválido!*\n\nUse: `/farm quantidade/nível`\n\n*Exemplo:* `/farm 10/40`\n\nOnde:\n• quantidade = número de dragões\n• nível = nível dos dragões (1-40)"
                        });
                        return;
                    }

                    const quantity = parseInt(match[1]);
                    const level = parseInt(match[2]);
                    console.log('[Farm] Quantidade:', quantity, 'Nível:', level);

                    if (quantity < 1) {
                        console.log('[Farm] Quantidade inválida');
                        await sendMessage(sock, userJid, {
                            text: "⚠️ *Quantidade inválida!*\n\n• A quantidade de dragões deve ser pelo menos 1"
                        });
                        return;
                    }

                    if (level < 1 || level > 40) {
                        console.log('[Farm] Nível inválido');
                        await sendMessage(sock, userJid, {
                            text: "⚠️ *Nível inválido!*\n\n• O nível deve ser entre 1 e 40"
                        });
                        return;
                    }

                    // Em grupos, listas interativas não funcionam - usar texto simples
                    if (isGroup) {
                        console.log('[Farm] Grupo detectado, usando modo texto');
                        await sendMessage(sock, userJid, {
                            text: `🐉 *Cálculo de Farm*\n\n*Configuração:* ${quantity}x dragões nível ${level}\n\nDigite *1* para calcular com:\n1️⃣ Positivo/Negativo (${FARM_PER_LEVEL[level] || 0} comida/min)\n\n0️⃣ Cancelar`
                        });
                        navigateTo(effectiveJid, 'awaiting_farm_dragon_choice_fallback', { quantity, level });
                    } else {
                        // No privado, mostra lista interativa
                        console.log('[Farm] Tentando enviar lista interativa para:', userJid);
                        try {
                            const result = await sock.sendListMessage(userJid, {
                                buttonText: 'Selecionar Dragão',
                                description: `🐉 *Cálculo de Farm*\n\n*Configuração:* ${quantity}x dragões nível ${level}\n\nSelecione o tipo de dragão para calcular a produção:`,
                                title: 'Escolha o Dragão',
                                footer: `Quantidade: ${quantity} | Nível: ${level}`,
                                sections: [{
                                    title: 'Dragões Disponíveis',
                                    rows: [{
                                        rowId: `farm_calc_${quantity}_${level}_positivo_negativo`,
                                        title: 'Positivo/Negativo',
                                        description: `${FARM_PER_LEVEL[level] || 0} comida/min por dragão`
                                    }]
                                }]
                            });
                            console.log('[Farm] Lista enviada com sucesso:', result);
                        } catch (error) {
                            console.error('[Farm] Erro ao enviar lista:', error);
                            console.error('[Farm] Stack:', error.stack);
                            // Fallback para mensagem de texto
                            console.log('[Farm] Usando fallback de texto');
                            await sendMessage(sock, userJid, {
                                text: `🐉 *Cálculo de Farm*\n\n*Configuração:* ${quantity}x dragões nível ${level}\n\nDigite *1* para calcular com:\n1️⃣ Positivo/Negativo (${FARM_PER_LEVEL[level] || 0} comida/min)\n\n0️⃣ Cancelar`
                            });
                            navigateTo(effectiveJid, 'awaiting_farm_dragon_choice_fallback', { quantity, level });
                        }
                    }
                    return;
                }

                if (commandName === "/sorteio" && isAdmin) {
                    const eligibleUsers = Object.entries(userData).filter(([jid, user]) => {
                        return user.savedAccounts && user.savedAccounts.some(acc => acc.verified);
                    });

                    if (eligibleUsers.length === 0) {
                        await sendMessage(sock, userJid, { text: "Não há clientes com contas verificadas para participar do sorteio. 😥" });
                        return;
                    }

                    const winnerIndex = Math.floor(Math.random() * eligibleUsers.length);
                    const [winnerJid, winnerProfile] = eligibleUsers[winnerIndex];

                    const winnerMention = `@${winnerJid.split('@')[0]}`;
                    const resultText = `🏆🎉 *RESULTADO DO SORTEIO* 🎉🏆\n\nE o sortudo(a) é...\n\n${winnerMention}\n\nParabéns por ganhar o sorteio!.`;

                    await sendMessage(sock, userJid, {
                        text: resultText,
                        mentions: [winnerJid]
                    });
                    return;
                }

                if (commandName === "/suporte" && !isComprador && !isAdmin) {
                    delete userState[userJid];
                    await startSupportFlow(sock, userJid);
                    return;
                }

                // Comando /saque para TODOS os membros da equipe (incluindo apoiadores)
                const isApoiador = Object.values(apoiadoresData).some(a => a.ownerJid === senderJid);
                if (commandName === "/saque" && (isAdmin || isComprador || isProductManager || isGerenciadorCartao || isGerenciadorTrocaRegional || isApoiador)) {
                    delete userState[userJid];
                    await sendMyEarningsMenu(sock, userJid);
                    return;
                }

                // Comando /apoiadores para admins
                if (commandName === "/apoiadores" && isAdmin) {
                    delete userState[userJid];
                    await sendApoiadoresMenu(sock, userJid);
                    return;
                }

                // Comando /pontos (admin) para adicionar PowerPoints a um usuário
                if (commandName === "/pontos" && isAdmin) {
                    delete userState[userJid];
                    await sendMessage(sock, userJid, { text: "Digite o *número do usuário* com DDI+DDD (ex: 5511912345678)." });
                    navigateTo(userJid, "awaiting_points_user_number");
                    return;
                }

                // Comando /manual (admin) para alternar modo de manutenção de pagamentos
                if (commandName === "/manual" && isAdmin) {
                    shopData.manualMaintenanceMode = !shopData.manualMaintenanceMode;
                    saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                    const statusText = shopData.manualMaintenanceMode
                        ? "🔧 *Modo de manutenção ativado!*\n\n• Pagamentos com cartão estarão indisponíveis\n• Pagamentos PIX exigirão comprovante manual"
                        : "✅ *Modo de manutenção desativado!*\n\n• Todos os métodos de pagamento voltaram ao normal";
                    await sendMessage(sock, userJid, { text: statusText });
                    return;
                }

                if (commandName === "/id" && (isComprador || isAdmin)) {
                    // Notifica os gerenciadores de cartão
                    const notificationText = `🚨 *ID Check Solicitado!*\n\nO comprador *${userData[userJid]?.nome || userJid.split('@')[0]}* solicitou um ID de pagamento. Por favor, verifiquem o app.`;
                    for (const managerJid in gerenciadoresCartaoData) {
                        try {
                            await sendMessage(sock, managerJid, { text: notificationText });
                        } catch (e) { console.error(`Falha ao notificar gerenciador de cartão ${managerJid}`); }
                    }
                    await sendMessage(sock, userJid, { text: "✅ Solicitação de ID Check enviada aos Gerenciadores de Cartão." });
                    return;
                }

                if (commandName === "/addcartao" && (isGerenciadorCartao || isOwner)) {
                    const numero = args[0]?.replace(/\D/g, '');
                    const cvv = args[1]?.replace(/\D/g, '');

                    if (!numero || !cvv || numero.length < 13 || numero.length > 19 || cvv.length < 3 || cvv.length > 4) {
                        await sendMessage(sock, userJid, { text: "⚠️ Formato inválido. Use: */addcartao [número do cartão] [cvv]*" });
                        return;
                    }

                    try {
                        await sendMessage(sock, userJid, { text: "Gerando dados de pessoa... 🧑" });
                        const personData = await fetchPersonData();

                        const now = new Date();
                        const month = (now.getMonth() + 1).toString().padStart(2, '0');
                        const year = (now.getFullYear() + 8).toString().slice(-2); // Padrão Nubank
                        const dataValidade = `${month}/${year}`;

                        const newCard = {
                            id: `card${Date.now()}`,
                            nome: personData.nome,
                            sobrenome: personData.sobrenome,
                            numero: numero,
                            nomeTitular: `${personData.nome} ${personData.sobrenome}`,
                            cvv: cvv,
                            dataValidade: dataValidade,
                            endereco: personData.endereco,
                            cidade: personData.cidade,
                            estado: personData.estado,
                            cep: personData.cep,
                            tipo: 'nubank', // Padrão Nubank
                            responsavel: userJid
                        };

                        shopData.cartoes.push(newCard);
                        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                        await sendMessage(sock, userJid, { text: `✅ Cartão (Nubank) de *${newCard.nomeTitular}* com final \`${newCard.numero.slice(-4)}\` adicionado com sucesso!` });

                    } catch (error) {
                        console.error("Erro ao gerar dados da pessoa:", error);
                        await sendMessage(sock, userJid, { text: `❌ Desculpe, não foi possível gerar os dados da pessoa no momento. Erro: ${error}` });
                    }
                    return;
                }

                if (commandName === "/cartao" && (isComprador || isAdmin)) {
                    const cards = shopData.cartoes || [];
                    if (cards.length > 0) {
                        const card = cards[0];

                        let cardDetails = `Nome: ${card.nome}\n`;
                        cardDetails += `Sobrenome: ${card.sobrenome}\n`;
                        cardDetails += `Número do cartão: ${card.numero}\n`;
                        cardDetails += `Nome do Titular do Cartão: ${card.nomeTitular}\n`;
                        cardDetails += `CVV: ${card.cvv}\n`;
                        cardDetails += `Data de Validade: ${card.dataValidade}\n`;
                        cardDetails += `Linha de endereço 1: ${card.endereco}\n`;
                        cardDetails += `Cidade: ${card.cidade}\n`;
                        cardDetails += `Estado: ${card.estado}\n`;
                        cardDetails += `Cep: ${card.cep}`;

                        await sendMessage(sock, userJid, { text: cardDetails });
                        await sendMessage(sock, userJid, { text: "Digite *1* se conseguiu adicionar o método de pagamento.\nDigite *2* se o cartão não funcionou." });
                        navigateTo(userJid, 'awaiting_card_usability', { usedCard: card });
                    } else {
                        await sendMessage(sock, userJid, { text: "💳 Nenhum cartão disponível no momento. Por favor, informe um Gerenciador de Cartões." });
                        if (currentState && (currentState.step === 'in_direct_chat' || currentState.step === 'in_verification_chat')) {
                            // Mantém o vendedor no estado de chat
                        } else {
                            delete userState[userJid];
                        }
                    }
                    return;
                }
                if (commandName === "/cartoes" && (isGerenciadorCartao || isOwner)) {
                    const cards = shopData.cartoes || [];
                    let cardsText = `💳 *Cartões Cadastrados* (${cards.length})\n\n`;
                    if (cards.length > 0) {
                        cards.forEach((card, index) => {
                            if (card && card.numero) {
                                const responsavelNome = userData[card.responsavel]?.nome || 'Desconhecido';
                                cardsText += `*${index + 1}* - ${card.tipo} | Final: \`...${card.numero.slice(-4)}\` (Resp: ${responsavelNome})\n`;
                            }
                        });
                    } else {
                        cardsText += "> Nenhum cartão cadastrado.\n";
                    }
                    cardsText += "\nDigite o número de um cartão para removê-lo, ou digite *X* para apagar todos.\n\n0️⃣ Voltar";
                    await sendMessage(sock, userJid, { text: cardsText });
                    navigateTo(userJid, "awaiting_card_to_remove", { cards });
                    return;
                }


                if (commandName === "/menu" && (isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional)) {
                    await sendCompradorMenu(sock, userJid);
                    return;
                }

                if (commandName === "/produtos" && (isProductManager || isAdmin)) {
                    await sendProductCategoryList(sock, userJid);
                    return;
                }

                // Comando /corrigir - Corrigir JIDs de usuários
                if (commandName === "/corrigir" && isAdmin) {
                    const correctionText = "🔧 *Sistema de Correção de JIDs*\n\n" +
                        "Escolha o método de busca:\n\n" +
                        "1️⃣ Buscar por LID/JID\n" +
                        "2️⃣ Buscar por Email\n\n" +
                        "0️⃣ Cancelar";
                    await sendMessage(sock, userJid, { text: correctionText });
                    navigateTo(userJid, "awaiting_correction_method");
                    return;
                }

                if (commandName === "/on" && (isGerenciadorCartao || isOwner)) {
                    if (!gerenciadoresCartaoData[userJid]) {
                        await sendMessage(sock, userJid, { text: "🚫 Você não tem permissão para usar este comando." });
                        return;
                    }
                    if (gerenciadoresCartaoData[userJid].status !== 'on') {
                        gerenciadoresCartaoData[userJid].status = 'on';
                        gerenciadoresCartaoData[userJid].onlineSince = Date.now();
                        saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                        await sendMessage(sock, userJid, { text: "✅ Seu status foi definido para *Online*." });

                        const notificationText = `🟢 O Gerenciador de Cartão *${userData[userJid]?.nome || ''}* está online.`;
                        for (const buyerJid in compradoresData) {
                            try { await sendMessage(sock, buyerJid, { text: notificationText }); }
                            catch (e) { console.error(`Falha ao notificar comprador ${buyerJid}`); }
                        }

                    } else {
                        await sendMessage(sock, userJid, { text: "Você já está online." });
                    }
                    return;
                }

                if (commandName === "/off" && (isGerenciadorCartao || isOwner)) {
                    if (!gerenciadoresCartaoData[userJid]) {
                        await sendMessage(sock, userJid, { text: "🚫 Você não tem permissão para usar este comando." });
                        return;
                    }
                    if (gerenciadoresCartaoData[userJid].status === 'on') {
                        const sessionTime = Date.now() - (gerenciadoresCartaoData[userJid].onlineSince || Date.now());
                        gerenciadoresCartaoData[userJid].totalOnlineTime = (gerenciadoresCartaoData[userJid].totalOnlineTime || 0) + sessionTime;
                        gerenciadoresCartaoData[userJid].status = 'off';
                        gerenciadoresCartaoData[userJid].onlineSince = null;
                        saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                        await sendMessage(sock, userJid, { text: "🔴 Seu status foi definido para *Offline*." });

                        const notificationText = `🔴 O Gerenciador de Cartão *${userData[userJid]?.nome || ''}* ficou offline.`;
                        for (const buyerJid in compradoresData) {
                            try { await sendMessage(sock, buyerJid, { text: notificationText }); }
                            catch (e) { console.error(`Falha ao notificar comprador ${buyerJid}`); }
                        }
                    } else {
                        await sendMessage(sock, userJid, { text: "Você já está offline." });
                    }
                    return;
                }
                if (commandName === "/pedidos" && (isComprador || isAdmin)) {
                    const pendingOrdersCount = pendingOrders.filter(order => order.status === 'pendente').length + pendingOrdersV.filter(order => order.status === 'pendente').length;
                    const pendingVerificationCount = verificationRequests.filter(r => r.status === 'pendente').length;
                    const totalTasks = pendingOrdersCount + pendingVerificationCount;

                    if (totalTasks === 0) {
                        await sendMessage(sock, userJid, { text: "🎉 Ótimo trabalho! Não há nenhuma solicitação pendente no momento." });
                        return;
                    }

                    let startMenuText = `Olá! 👋\n\n`;
                    startMenuText += `Há *${totalTasks}* solicitações aguardando atendimento.\n\n`;
                    startMenuText += `*O que você deseja fazer?*\n\n1️⃣ Iniciar Atendimento\n2️⃣ Sair`;

                    await sendMessage(sock, userJid, { text: startMenuText });
                    navigateTo(userJid, "awaiting_start_sales_choice");
                    return;
                }

                if (commandName === "/criar" && (isAdmin || isComprador)) {
                    if (activeChats.some(c => c.sellerJid === userJid)) {
                        await sendMessage(sock, userJid, { text: "⚠️ Você já está em um atendimento. Finalize-o com */finalizar* antes de criar um novo pedido." });
                        return;
                    }
                    await sendMessage(sock, userJid, { text: "Vamos criar um novo pedido manual. ✍️\n\nPor favor, envie o *número de telefone do cliente* (com DDI e DDD, ex: 5511912345678)." });
                    navigateTo(userJid, 'awaiting_create_order_number');
                    return;
                }
                if (commandName === "/ativos" && isAdmin) {
                    let activeOrdersText = "📋 *Pedidos Ativos*\n\n";
                    activeOrdersText += "*--- Fila Prioritária (Verificados) ---*\n";
                    if (pendingOrdersV.length > 0) {
                        pendingOrdersV.forEach(order => {
                            activeOrdersText += `*ID:* ${order.id} | *Cliente:* ${order.clientName} | *Status:* ${order.status}\n`;
                        });
                    } else {
                        activeOrdersText += "_Nenhum pedido na fila prioritária._\n";
                    }
                    activeOrdersText += "\n*--- Fila Padrão ---*\n";
                    if (pendingOrders.length > 0) {
                        pendingOrders.forEach(order => {
                            activeOrdersText += `*ID:* ${order.id} | *Cliente:* ${order.clientName} | *Status:* ${order.status}\n`;
                        });
                    } else {
                        activeOrdersText += "_Nenhum pedido na fila padrão._\n";
                    }
                    activeOrdersText += "\n*--- Lista de Espera (Offline) ---*\n";
                    if (waitingOrders.length > 0) {
                        waitingOrders.forEach(order => {
                            activeOrdersText += `*ID:* ${order.id} | *Cliente:* ${order.clientName} | *Status:* ${order.status}\n`;
                        });
                    } else {
                        activeOrdersText += "_Nenhum pedido em espera._\n";
                    }
                    await sendMessage(sock, userJid, { text: activeOrdersText });
                    return;
                }

                if (commandName === "/pedido" && isAdmin) {
                    const orderId = parseInt(args[0]);
                    if (!orderId) {
                        await sendMessage(sock, userJid, { text: "Por favor, forneça um ID de pedido. Ex: `/pedido 123456`" });
                        return;
                    }
                    const order = pendingOrders.find(o => o.id === orderId) || pendingOrdersV.find(o => o.id === orderId) || waitingOrders.find(o => o.id === orderId);
                    if (!order) {
                        await sendMessage(sock, userJid, { text: `Pedido com ID ${orderId} não encontrado.` });
                        return;
                    }
                    let details = `*Detalhes do Pedido ID: ${order.id}*\n\n`;
                    details += `*Cliente:* ${order.clientName}\n`;
                    details += `*Contato:* https://wa.me/${order.clientJid.split('@')[0]}\n`;
                    details += `*Status:* ${order.status}\n`;
                    if (order.atendido_por) {
                        const buyerName = userData[order.atendido_por]?.nome || order.atendido_por.split('@')[0];
                        details += `*Atendido por:* ${buyerName}\n`;
                    }
                    const adminLang2 = getUserLanguage(userJid);
                    const orderTotalFmt = await formatCurrencyByLanguage(order.total || 0, adminLang2);
                    details += `*Valor:* ${orderTotalFmt}\n`;
                    details += `*Login FB:* ${order.facebookLogin || 'Não informado'}\n`;
                    details += `*Senha FB:* ${order.facebookPassword || 'Não informada'}\n\n`;
                    details += "*Itens:*\n";
                    order.items.forEach(item => {
                        details += `> • ${item.name}\n`;
                    });
                    await sendMessage(sock, userJid, { text: details });
                    return;
                }

                if (commandName === "/preferencia" && isAdmin) {
                    const orderId = parseInt(args[0]);
                    if (!orderId) {
                        await sendMessage(sock, userJid, { text: "Por favor, forneça um ID de pedido. Ex: `/preferencia 123456`" });
                        return;
                    }
                    const orderIndex = pendingOrders.findIndex(o => o.id === orderId);
                    const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);

                    if (orderIndexV > -1) { // Já está na fila V, move para o topo
                        const [orderToMove] = pendingOrdersV.splice(orderIndexV, 1);
                        pendingOrdersV.unshift(orderToMove);
                        saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
                        await sendMessage(sock, userJid, { text: `✅ Pedido *#${orderId}* movido para o topo da fila prioritária.` });
                        return;
                    }

                    if (orderIndex === -1) {
                        await sendMessage(sock, userJid, { text: `Pedido com ID ${orderId} não encontrado na fila pendente.` });
                        return;
                    }

                    const [orderToMove] = pendingOrders.splice(orderIndex, 1);
                    orderToMove.sourceQueue = 'verified'; // Atualiza a origem
                    pendingOrdersV.unshift(orderToMove); // Adiciona ao início da fila verificada
                    saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
                    saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);

                    await sendMessage(sock, userJid, { text: `✅ Pedido *#${orderId}* movido para o topo da fila prioritária.` });
                    return;
                }


                if (commandName === "/concluir") {
                    await sendMessage(sock, userJid, { text: "⚠️ Este comando foi substituído. Para finalizar um atendimento, entre no chat com o cliente e digite */finalizar*." });
                    return;
                }

                if (commandName === "/emails" && (isGerenciadorTrocaRegional || isComprador || isAdmin)) {
                    const jidForEmails = userJid;
                    if (isGerenciadorTrocaRegional || isAdmin) {
                        const allEmailsRaw = Object.values(finishedEmails).flat();
                        if (allEmailsRaw.length === 0) {
                            await sendMessage(sock, jidForEmails, { text: "Nenhum e-mail finalizado registrado ainda.\n\n*0* - Voltar" });
                            navigateTo(jidForEmails, "awaiting_admin_choice");
                            return;
                        }

                        const buyerGroups = {};
                        allEmailsRaw.forEach(item => {
                            if (!buyerGroups[item.buyerName]) {
                                buyerGroups[item.buyerName] = [];
                            }
                            buyerGroups[item.buyerName].push(item);
                        });

                        let menuText = "📧 *E-mails de Contas Microsoft Finalizadas*\n\nSelecione um e-mail para remover ou use *X* para apagar todos os e-mails de um comprador.\n\n";
                        let emailCounter = 1;
                        const options = { buyers: {}, emails: {} };

                        for (const buyerName in buyerGroups) {
                            const emails = buyerGroups[buyerName];
                            if (emails.length > 0) {
                                menuText += `*${buyerName.toUpperCase()}* - [Digite *X${Object.keys(options.buyers).length + 1}* para apagar todos]\n`;
                                options.buyers[`X${Object.keys(options.buyers).length + 1}`] = buyerName;

                                emails.forEach(item => {
                                    const now = new Date();
                                    const limitTime = new Date(item.originalTimestamp);
                                    limitTime.setHours(limitTime.getHours() + 2);
                                    const diffMinutes = (limitTime - now) / (1000 * 60);
                                    let emoji = '⚫';
                                    if (diffMinutes > 90) emoji = '🟢';
                                    else if (diffMinutes > 60) emoji = '🟡';
                                    else if (diffMinutes > 30) emoji = '🟠';
                                    else if (diffMinutes > 0) emoji = '🔴';
                                    const formattedLimitTime = limitTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: "America/Sao_Paulo" });

                                    menuText += `*${emailCounter}* - ${item.email} (${emoji} ${formattedLimitTime})\n`;
                                    options.emails[emailCounter] = item;
                                    emailCounter++;
                                });
                                menuText += `-----------------------------------\n`;
                            }
                        }
                        menuText += "\nDigite *X* para apagar TODOS os e-mails de TODOS os compradores.\n\n*0* - Voltar";
                        navigateTo(jidForEmails, "awaiting_email_management_choice", options);
                        await sendMessage(sock, jidForEmails, { text: menuText });

                    } else if (isComprador) {
                        // Lógica para Comprador
                        const buyerName = userData[jidForEmails]?.nome;
                        const buyerEmails = finishedEmails[buyerName] || [];

                        if (buyerEmails.length === 0) {
                            await sendMessage(sock, jidForEmails, { text: "Você ainda não finalizou nenhuma conta Microsoft." });
                            return;
                        }

                        let menuText = "📧 *Seus E-mails de Contas Microsoft Finalizadas*\n\nDigite o número do e-mail para removê-lo, ou *X* para remover todos.\n\n";
                        const options = {};
                        const langEmails = getUserLanguage(jidForEmails);
                        for (let index = 0; index < buyerEmails.length; index++) {
                            const item = buyerEmails[index];
                            const now = new Date();
                            const limitTime = new Date(item.originalTimestamp);
                            limitTime.setHours(limitTime.getHours() + 2);
                            const diffMinutes = (limitTime - now) / (1000 * 60);
                            let emoji = '⚫';
                            if (diffMinutes > 90) emoji = '🟢';
                            else if (diffMinutes > 60) emoji = '🟡';
                            else if (diffMinutes > 30) emoji = '🟠';
                            else if (diffMinutes > 0) emoji = '🔴';
                            const formattedLimitTime = limitTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: "America/Sao_Paulo" });
                            const itemValueFmt = await formatCurrencyByLanguage(item.itemValue || 0, langEmails);
                            menuText += `*${index + 1}* - ${item.email} (${emoji} ${formattedLimitTime}) - 1 (${itemValueFmt})\n`;
                            options[index + 1] = item;
                        }
                        menuText += "\n*0* - Voltar";
                        await sendMessage(sock, jidForEmails, { text: menuText });
                        navigateTo(jidForEmails, 'awaiting_comprador_email_choice', { options });
                    }
                    return;
                }

                if (commandName === "/cmd") {
                    let cmdText = "📜 *Lista de Comandos Disponíveis*\n\n";
                    cmdText += "*--- Para Todos os Usuários ---*\n";
                    cmdText += "*/m* - Volta para o menu principal.\n";
                    cmdText += "*/suporte* - Abre um chamado com a equipe de suporte.\n";
                    cmdText += "*/id* - Solicita verificação de ID do cartão.\n";
                    cmdText += "*/.* - Envia uma mensagem para os administradores.\n";
                    cmdText += "*/cmd* - Exibe esta lista de comandos.\n";
                    cmdText += "*/tutorial* - Mostra o tutorial de verificação de conta.\n\n";
                    cmdText += "*--- Para Compradores e Gerentes ---*\n";
                    cmdText += "*/menu* - Acessa o seu painel de comprador.\n";
                    cmdText += "*/pedidos* - Mostra os pedidos pendentes e inicia o atendimento.\n";
                    cmdText += "*/finalizar* - (Dentro de um atendimento) Finaliza a venda com o cliente.\n";
                    cmdText += "*/suporte* - (Dentro de um atendimento) Encaminha o cliente para o suporte de um admin.\n";
                    cmdText += "*/cartoes* - (Ger. Cartão) Mostra os cartões disponíveis.\n";
                    cmdText += "*/emails* - Lista os e-mails de contas Microsoft.\n\n";
                    cmdText += "*--- Para Gerenciadores de Produto ---*\n";
                    cmdText += "*/produtos* - Acessa o painel de gerenciamento de produtos.\n\n";
                    cmdText += "*--- Para Administradores ---*\n";
                    cmdText += "*/adm* - Acessa o painel administrativo.\n";
                    cmdText += "*/on* - Define seu status como Online.\n";
                    cmdText += "*/off* - Define seu status como Offline.\n";
                    cmdText += "*/criar* - Cria um novo pedido manualmente.\n";
                    cmdText += "*/ativos* - Lista todos os pedidos em fila e em espera.\n";
                    cmdText += "*/pedido [ID]* - Mostra detalhes de um pedido específico.\n";
                    cmdText += "*/preferencia [ID]* - Dá prioridade a um pedido na fila.\n";
                    cmdText += "*/sorteio* - Inicia um sorteio de clientes com conta verificada.\n";
                    cmdText += "*/give* - Adiciona PowerPoints a um usuário.\n";
                    cmdText += "*/addcartao* - (Ger. Cartão ou Dono) Adiciona um novo cartão ao sistema.\n";
                    cmdText += "*/reembolso [ID]* - Reembolsa um pedido.\n";
                    cmdText += "*/aprovar [ID]* - Aprova um pedido pendente (carrinho ou pagamento alternativo).\n\n";
                    cmdText += "*--- Para o Dono ---*\n";
                    cmdText += "*/restart* - ⚠️ Reinicia TODOS os dados do bot (usuários, pedidos, produtos, etc).\n";
                    await sendMessage(sock, userJid, { text: cmdText });
                    return;
                }

                if (commandName === "/restart") {
                    if (userJid !== OWNER_JID) {
                        await sendMessage(sock, userJid, { text: "🚫 Este comando é restrito ao Dono do bot." });
                        return;
                    }

                    const ownerAdminData = adminData[OWNER_JID];
                    const filesToReset = [
                        { path: ARQUIVO_USUARIOS, default: {} },
                        { path: ARQUIVO_HISTORICO_COMPRAS, default: {} },
                        { path: ARQUIVO_CARRINHOS, default: {} },
                        { path: ARQUIVO_PEDIDOS, default: [] },
                        { path: ARQUIVO_PEDIDOS_V, default: [] },
                        { path: ARQUIVO_PEDIDOS_ESPERA, default: [] },
                        { path: ARQUIVO_TICKETS, default: [] },
                        { path: ARQUIVO_DADOS_LOJA, default: { vendasRealizadas: 0, faturamentoTotal: 0, descontoAutomaticoOferta: 30, cartoes: [], idChecksExpirados: 0, valorPerdido: 0, contasVerificadas: 0, comissoes: { porCompra: 8.00, porVerificacao: 0.50 } } },
                        { path: ARQUIVO_ADMINS, default: {} },
                        { path: ARQUIVO_COMPRADORES, default: {} },
                        { path: ARQUIVO_GERENCIADORES_PRODUTO, default: {} },
                        { path: ARQUIVO_GERENCIADORES_CARTAO, default: {} },
                        { path: ARQUIVO_GERENCIADORES_TROCA_REGIONAL, default: {} },
                        { path: ARQUIVO_CUPONS, default: {} },
                        { path: ARQUIVO_CONVITES, default: {} },
                        { path: ARQUIVO_CHATS_ATIVOS, default: [] },
                        { path: ARQUIVO_CONTAS_EXCLUSIVAS_JSON, default: [] },
                        { path: ARQUIVO_EMAILS_FINALIZADOS, default: {} },
                        { path: ARQUIVO_SOLICITACOES_VERIFICACAO, default: [] }
                    ];
                    filesToReset.forEach(file => {
                        saveJsonFile(file.path, file.default);
                    });
                    adminData = loadJsonFile(ARQUIVO_ADMINS, {});
                    adminData[OWNER_JID] = ownerAdminData;
                    saveJsonFile(ARQUIVO_ADMINS, adminData);

                    userData = loadJsonFile(ARQUIVO_USUARIOS, {});
                    purchaseHistoryData = loadJsonFile(ARQUIVO_HISTORICO_COMPRAS, {});
                    cartData = loadJsonFile(ARQUIVO_CARRINHOS, {});
                    pendingOrders = loadJsonFile(ARQUIVO_PEDIDOS, []);
                    pendingOrdersV = loadJsonFile(ARQUIVO_PEDIDOS_V, []);
                    waitingOrders = loadJsonFile(ARQUIVO_PEDIDOS_ESPERA, []);
                    openTickets = loadJsonFile(ARQUIVO_TICKETS, []);
                    shopData = loadJsonFile(ARQUIVO_DADOS_LOJA, { vendasRealizadas: 0, faturamentoTotal: 0, descontoAutomaticoOferta: 30, cartoes: [], idChecksExpirados: 0, valorPerdido: 0, contasVerificadas: 0, comissoes: { porCompra: 8.00, porVerificacao: 0.50 } });
                    compradoresData = loadJsonFile(ARQUIVO_COMPRADORES, {});
                    productManagerData = loadJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, {});
                    gerenciadoresCartaoData = loadJsonFile(ARQUIVO_GERENCIADORES_CARTAO, {});
                    gerenciadoresTrocaRegionalData = loadJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, {});
                    couponData = loadJsonFile(ARQUIVO_CUPONS, {});
                    invitationData = loadJsonFile(ARQUIVO_CONVITES, {});
                    activeChats = loadJsonFile(ARQUIVO_CHATS_ATIVOS, []);
                    exclusiveAccounts = loadJsonFile(ARQUIVO_CONTAS_EXCLUSIVAS_JSON, []);
                    finishedEmails = loadJsonFile(ARQUIVO_EMAILS_FINALIZADOS, {});
                    verificationRequests = loadJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, []);


                    await sendMessage(sock, userJid, { text: "✅ *REINICIALIZAÇÃO COMPLETA DO SISTEMA!*\n\nTodos os arquivos de dados foram limpos. Apenas a sua conta de Dono foi preservada." });
                    return;
                }

                const finalizeCommands = ["/final", "/encerrar"];
                if (finalizeCommands.includes(commandName) && isAdmin) {
                    const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    const quotedMessageId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;

                    if (quotedMsg && quotedMessageId) {
                        // Apaga a mensagem original
                        try {
                            const key = {
                                remoteJid: userJid,
                                id: quotedMessageId,
                                participant: msg.message.extendedTextMessage.contextInfo.participant
                            };
                            await sock.sendMessage(userJid, { delete: key });
                        } catch (e) {
                            console.error("Não foi possível apagar a mensagem citada.", e);
                        }

                        const activeCheckId = Object.keys(activeIdChecks).find(checkId =>
                            activeIdChecks[checkId].notificationKeys.some(key => key.id === quotedMessageId)
                        );

                        if (activeCheckId) {
                            const checkData = activeIdChecks[activeCheckId];
                            clearTimeout(checkData.timeout);
                            for (const key of checkData.notificationKeys) {
                                try { await sock.sendMessage(key.remoteJid, { delete: key }); } catch (e) { }
                            }
                            await sendMessage(sock, checkData.requesterJid, { text: "✅ Seu ID Check foi aprovado por um administrador!" });
                            await sendMessage(sock, userJid, { text: `✅ ID Check de ${userData[checkData.requesterJid]?.nome || 'cliente'} aprovado.` });
                            delete activeIdChecks[activeCheckId];
                            return;
                        }

                        const ticketIndex = openTickets.findIndex(
                            (t) => t.notificationKeys && t.notificationKeys.some((key) => key.id === quotedMessageId)
                        );

                        if (ticketIndex !== -1) {
                            const ticketToClose = openTickets[ticketIndex];
                            const closed = await closeTicket(sock, ticketToClose, userJid);
                            if (closed) {
                                await sendMessage(sock, userJid, {
                                    text: `✅ Você finalizou o ticket de *${ticketToClose.clientName}*.`,
                                });
                            }
                            return;
                        }

                        await sendMessage(sock, userJid, {
                            text: "⚠️ Não foi possível encontrar um ticket ou ID check correspondente a esta mensagem.",
                        });
                        return;
                    }

                    if (inDirectChat || inVerificationChat) {
                        await sendMessage(sock, userJid, { text: "Para finalizar este atendimento, digite */finalizar* sem responder a nenhuma mensagem." });
                        return;
                    }

                    await sendMessage(sock, userJid, {
                        text: "⚠️ Para finalizar um ticket de suporte, você precisa *responder* à mensagem de notificação do ticket com o comando /final ou /encerrar.",
                    });
                    return;
                }


                // Handler para seleção de lista interativa (rowId)
                if (messageText.startsWith('farm_calc_')) {
                    const parts = messageText.split('_');
                    if (parts.length >= 5) {
                        const quantity = parseInt(parts[2]);
                        const level = parseInt(parts[3]);
                        const dragonType = parts.slice(4).join('_');

                        const farmPerMinute = FARM_PER_LEVEL[level] || 0;
                        const totalPerMinute = quantity * farmPerMinute;
                        const totalPerHour = totalPerMinute * 60;
                        const totalPerDay = totalPerHour * 24;
                        const totalPerMonth = totalPerDay * 30;

                        const dragonNames = {
                            'positivo_negativo': 'Positivo/Negativo'
                        };

                        const responseText = `🐉 *Cálculo de Farm*\n\n` +
                            `*Dragão:* ${dragonNames[dragonType] || dragonType}\n` +
                            `*Quantidade:* ${quantity}x nível ${level}\n` +
                            `*Produção individual:* ${farmPerMinute} comida/min\n\n` +
                            `📊 *Produção total:*\n` +
                            `• *Por minuto:* ${totalPerMinute.toLocaleString('pt-BR')} comida\n` +
                            `• *Por hora:* ${totalPerHour.toLocaleString('pt-BR')} comida\n` +
                            `• *Por dia:* ${totalPerDay.toLocaleString('pt-BR')} comida\n` +
                            `• *Por mês:* ${totalPerMonth.toLocaleString('pt-BR')} comida`;

                        await sendMessage(sock, userJid, { text: responseText });
                        return;
                    }
                }

                if (commandName === "/m") {
                    delete userState[userJid];
                    await sendMainMenu(sock, userJid);
                    return;
                }

                // MODO LEGACY: Comando /legacy removido - sistema sempre usa modo texto simples

                if (commandName === "/p") {
                    if (userData[userJid] && userData[userJid].status === 'navegando') {
                        await sendMessage(sock, userJid, { text: "Você já está registrado! ✅" });
                        return;
                    }
                    await sendMessage(sock, userJid, {
                        text: "Olá! Bem-vindo(a) à PowerShop. ✨\n\nPara começarmos, qual é o seu *nome*?",
                    });
                    navigateTo(userJid, "register_name");
                    return;
                }

                if (commandName === "/ping") {
                    await sendMessage(sock, userJid, { text: "Pong! 🏓" });
                    return;
                }
                if (commandName === "/adm") {
                    if (!isAdmin) {
                        await sendMessage(sock, userJid, { text: "🚫 Acesso restrito a administradores." });
                        return;
                    }
                    await sendAdminPanel(sock, userJid);
                    return;
                }
                if (commandName === "/verificar" && (isComprador || isAdmin)) {
                    await sendVerificationRequestsMenu(sock, userJid);
                    return;
                }
                return;
            }

            // Para comandos públicos em grupos, usar effectiveJid para verificar estado
            const stateJid = effectiveJid;

            console.log('[Handler] Verificando estado, stateJid:', stateJid, 'userState[stateJid]:', userState[stateJid] ? 'existe' : 'não existe');

            if (!userState[stateJid] || userState[stateJid].history.length === 0) {
                console.log('[Handler] Sem estado ativo, isGroup:', isGroup);
                if (isGroup) return; // Ignora mensagens normais em grupo
                if (!isSilencedUser && userProfile.status !== 'em_atendimento' && userProfile.status !== 'em_suporte') {
                    if (!userData[userJid]) {
                        await sendMessage(sock, userJid, {
                            text: "Olá! Bem-vindo(a) à PowerShop. ✨\n\nPara começarmos, qual é o seu *nome*?",
                        });
                        navigateTo(userJid, "register_name");
                    } else {
                        await sendMainMenu(sock, userJid);
                    }
                }
                return;
            }

            console.log('[Handler] Estado ativo encontrado, continuando...');
            const currentStepData = userState[stateJid]?.history?.[userState[stateJid].history.length - 1];
            if (!currentStepData) {
                delete userState[stateJid];
                return;
            }

            const { step, data } = currentStepData;

            if (step === 'awaiting_raffle_purchase_requirement') {
                const requiresPurchase = messageText === '1';
                await sendMessage(sock, userJid, { text: "Entendido. Quantas pessoas devem ser sorteadas?" });
                navigateTo(userJid, 'awaiting_raffle_winner_count', { requiresPurchase });
            } else if (step === 'awaiting_raffle_winner_count') {
                const winnerCount = parseInt(messageText);
                if (isNaN(winnerCount) || winnerCount < 1) {
                    await sendMessage(sock, userJid, { text: "Por favor, digite um número válido de ganhadores." });
                    return;
                }

                const { requiresPurchase } = data;
                let ticketPool = [];

                if (requiresPurchase) {
                    Object.entries(userData).forEach(([jid, user]) => {
                        const purchaseCount = user.compras || 0;
                        if (purchaseCount > 0) {
                            for (let i = 0; i < purchaseCount; i++) {
                                ticketPool.push(jid);
                            }
                        }
                    });
                } else {
                    ticketPool = Object.keys(userData);
                }

                if (ticketPool.length === 0) {
                    await sendMessage(sock, userJid, { text: "Não há clientes elegíveis para este sorteio. 😥" });
                    delete userState[userJid];
                    return;
                }

                if (winnerCount > ticketPool.length) {
                    await sendMessage(sock, userJid, { text: `O número de ganhadores (${winnerCount}) é maior que o número de tickets (${ticketPool.length}). Por favor, insira um número menor.` });
                    return;
                }

                let winners = [];
                for (let i = 0; i < winnerCount; i++) {
                    const randomIndex = Math.floor(Math.random() * ticketPool.length);
                    const winnerJid = ticketPool.splice(randomIndex, 1)[0];
                    winners.push(winnerJid);
                }

                const winnerMentions = winners.map(jid => `@${jid.split('@')[0]}`).join('\n');
                const verb = winners.length > 1 ? "ganharem" : "ganhar";
                const resultText = `🏆🎉 *RESULTADO DO SORTEIO* 🎉🏆\n\nE os sortudos são...\n\n${winnerMentions}\n\nParabéns por ${verb} o sorteio! Entraremos em contato em breve.`;

                await sendMessage(sock, userJid, {
                    text: resultText,
                    mentions: winners
                });
                delete userState[userJid];

            } else if (step === 'awaiting_saved_account_choice') {
                const choice = parseInt(messageText);
                const { total, userCart, paymentId, creatorJid, orderData, paymentMethod } = data;

                const targetJid = isNaN(choice) ? userJid : (creatorJid ? orderData.clientJid : userJid);
                const targetUser = userData[targetJid] || {};
                const savedAccounts = targetUser.savedAccounts || [];

                if (!isNaN(choice) && choice > 0 && choice <= savedAccounts.length) {
                    const selectedAccount = savedAccounts[choice - 1];
                    const appliedCouponCode = cartData[targetJid]?.appliedCoupon;

                    if (appliedCouponCode && !selectedAccount.verified) {
                        await sendMessage(sock, targetJid, { text: `⚠️ O cupom *${appliedCouponCode}* só pode ser usado com uma conta verificada. Este pedido foi registrado, mas o cupom não foi aplicado.\n\nPara usar o cupom, verifique sua conta e faça a compra novamente.` });
                        delete cartData[targetJid].appliedCoupon;
                        saveJsonFile(ARQUIVO_CARRINHOS, cartData);
                    }

                    if (creatorJid) {
                        const clientName = targetUser.nome || targetJid.split("@")[0];
                        const newOrder = {
                            id: generateOrderId(),
                            clientJid: targetJid,
                            clientName: clientName,
                            total: orderData.total,
                            items: orderData.items,
                            facebookLogin: selectedAccount.login,
                            facebookPassword: selectedAccount.password,
                            dragonCityId: selectedAccount.gameId,
                            timestamp: new Date().toISOString(),
                            status: 'pendente',
                            atendido_por: null,
                        };
                        newOrder.sourceQueue = selectedAccount.verified ? 'verified' : 'unverified';
                        await handleSuccessfulPayment(sock, targetJid, total, userCart, selectedAccount, { paymentMethod: 'manual_order', order: newOrder, creatorJid: creatorJid });
                    } else {
                        await handleSuccessfulPayment(sock, targetJid, total, userCart, selectedAccount, { paymentId, paymentMethod });
                    }


                } else if (choice === savedAccounts.length + 1) {
                    await sendMessage(sock, userJid, { text: "Ok, vamos adicionar uma nova conta. Por favor, nos informe o *e-mail ou número* da sua conta do Facebook. 📲" });
                    navigateTo(userJid, 'awaiting_facebook_login', { total, userCart, isSavingNew: true, paymentId, creatorJid, orderData });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === "awaiting_facebook_login") {
                const facebookLogin = messageText;
                await sendMessage(sock, userJid, { text: "Ótimo! Agora, por favor, informe a *senha* da sua conta do Facebook. 🔑" });
                navigateTo(userJid, 'awaiting_facebook_password', { ...data, facebookLogin });
            } else if (step === "awaiting_facebook_password") {
                const facebookPassword = messageText;
                await sendMessage(sock, userJid, { text: "Perfeito! Para finalizar, por favor, informe o *ID da sua conta do jogo*. 🆔" });
                navigateTo(userJid, 'awaiting_dragon_city_id', { ...data, facebookPassword });

            } else if (step === 'awaiting_dragon_city_id') {
                const gameId = messageText;
                const { total, userCart, facebookLogin, facebookPassword, isSavingNew, paymentId, creatorJid, orderData, paymentMethod } = data;

                const confirmationText = `Confirme seus dados:\n\n*Login Facebook:* ${facebookLogin}\n*Senha Facebook:* ${facebookPassword}\n*ID do Jogo:* ${gameId}\n\nOs dados estão corretos?\n\n*Digite:*\n1️⃣ - Sim, estão corretos\n2️⃣ - Não, quero corrigir`;
                await sendMessage(sock, userJid, { text: confirmationText });
                navigateTo(userJid, 'awaiting_login_data_confirmation', { total, userCart, facebookLogin, facebookPassword, gameId, isSavingNew, paymentId, creatorJid, orderData, paymentMethod });

            } else if (step === 'awaiting_login_data_confirmation') {
                const { total, userCart, facebookLogin, facebookPassword, gameId, isSavingNew, paymentId, creatorJid, orderData, paymentMethod } = data;
                if (messageText === '1') {
                    let newAccount = {
                        login: facebookLogin,
                        password: facebookPassword,
                        gameId: gameId,
                        verified: false
                    };

                    const targetJid = creatorJid ? orderData.clientJid : userJid;
                    if (!userData[targetJid]) {
                        userData[targetJid] = { nome: targetJid.split('@')[0], status: 'navegando', savedAccounts: [] };
                    }
                    const targetUser = userData[targetJid];

                    if (isSavingNew) {
                        if (!targetUser.savedAccounts) {
                            targetUser.savedAccounts = [];
                        }
                        const alias = `Conta ${targetUser.savedAccounts.length + 1}`;
                        newAccount.alias = alias;
                        targetUser.savedAccounts.push(newAccount);
                        saveJsonFile(ARQUIVO_USUARIOS, userData);
                        await sendMessage(sock, targetJid, { text: `✅ Conta salva como *${alias}*!` });
                    }

                    if (creatorJid) {
                        const clientName = targetUser.nome || targetJid.split("@")[0];
                        const createdOrder = {
                            id: generateOrderId(),
                            clientJid: targetJid,
                            clientName: clientName,
                            total: orderData.total,
                            items: orderData.items,
                            facebookLogin: newAccount.login,
                            facebookPassword: newAccount.password,
                            dragonCityId: newAccount.gameId,
                            timestamp: new Date().toISOString(),
                            status: 'pendente',
                            atendido_por: null
                        };
                        createdOrder.sourceQueue = newAccount.verified ? 'verified' : 'unverified';
                        await handleSuccessfulPayment(sock, targetJid, total, userCart, newAccount, { paymentMethod: 'manual_order', order: createdOrder, creatorJid: creatorJid });
                    } else {
                        await handleSuccessfulPayment(sock, userJid, total, userCart, newAccount, { paymentId, paymentMethod });
                    }

                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Ok, vamos corrigir. Por favor, informe o *e-mail ou número* da sua conta do Facebook novamente. 📲" });
                    navigateTo(userJid, 'awaiting_facebook_login', { total, userCart, isSavingNew, paymentId, creatorJid, orderData });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === "awaiting_manual_order_facebook_login") {
                const facebookLogin = messageText;
                await sendMessage(sock, userJid, { text: "Ótimo! Agora, por favor, informe a *senha* da sua conta do Facebook. 🔑" });
                navigateTo(userJid, 'awaiting_manual_order_facebook_password', { ...data, facebookLogin });
            } else if (step === "awaiting_manual_order_facebook_password") {
                const facebookPassword = messageText;
                await sendMessage(sock, userJid, { text: "Perfeito! Para finalizar, por favor, informe o *ID da sua conta do jogo*. 🆔" });
                navigateTo(userJid, 'awaiting_manual_order_dragon_city_id', { ...data, facebookPassword });

            } else if (step === 'awaiting_manual_order_dragon_city_id') {
                const dragonCityId = messageText;
                const { orderData, facebookLogin, facebookPassword } = data;

                const confirmationText = `Confirme os dados do cliente:\n\n*Login Facebook:* ${facebookLogin}\n*Senha Facebook:* ${facebookPassword}\n*ID do Jogo:* ${dragonCityId}\n\nOs dados estão corretos?\n\n*Digite:*\n*1* - Sim, criar pedido\n*2* - Não, quero corrigir`;
                await sendMessage(sock, userJid, { text: confirmationText });
                navigateTo(userJid, 'awaiting_manual_order_confirmation', { orderData, facebookLogin, facebookPassword, dragonCityId });

            } else if (step === 'awaiting_manual_order_confirmation') {
                const { orderData, facebookLogin, facebookPassword, dragonCityId } = data;
                if (messageText === '1') {
                    const clientName = userData[orderData.clientJid]?.nome || orderData.clientJid.split("@")[0];
                    const newOrder = {
                        id: generateOrderId(),
                        clientJid: orderData.clientJid,
                        clientName: clientName,
                        total: orderData.total,
                        items: orderData.items,
                        facebookLogin: facebookLogin,
                        facebookPassword: facebookPassword,
                        dragonCityId: dragonCityId,
                        timestamp: new Date().toISOString(),
                        status: 'pendente',
                        atendido_por: null
                    };

                    newOrder.sourceQueue = 'unverified';

                    await handleSuccessfulPayment(sock, orderData.clientJid, orderData.total, newOrder.items, { login: facebookLogin, password: facebookPassword, gameId: dragonCityId, verified: false }, { paymentMethod: 'manual_order', order: newOrder });
                    delete userState[userJid];

                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Ok, vamos corrigir. Por favor, informe o *e-mail ou número* da conta do Facebook do cliente novamente. 📲" });
                    navigateTo(userJid, 'awaiting_manual_order_facebook_login', { orderData });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === "awaiting_start_sales_choice") {
                // Suporta lista interativa e modo legacy
                if (messageText === "sales_cancel" || messageText === "2") {
                    await sendMessage(sock, userJid, { text: "Ok, saindo do modo de atendimento. 👋" });
                    delete userState[userJid];
                    return;
                }
                if (messageText === "sales_start" || messageText === "1") {
                    await startNextAttendance(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_next_order_choice') {
                if (messageText === '1') {
                    delete userState[userJid];
                    await startNextAttendance(sock, userJid);
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Ok, aguardando. Digite */pedidos* quando quiser ver a fila novamente. 👍" });
                    delete userState[userJid];
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_reactivation') {
                const orderIndex = waitingOrders.findIndex(order => order.clientJid === userJid);
                if (orderIndex !== -1) {
                    const order = waitingOrders.splice(orderIndex, 1)[0];
                    order.status = 'pendente';

                    const targetList = order.sourceQueue === 'verified' ? pendingOrdersV : pendingOrders;
                    const targetFile = order.sourceQueue === 'verified' ? ARQUIVO_PEDIDOS_V : ARQUIVO_PEDIDOS;

                    if (data.from === '/incorreto' || data.from === '/tutorial') {
                        targetList.push(order); // Adiciona ao final da sua fila
                    } else {
                        targetList.unshift(order); // Adiciona ao início da sua fila
                    }

                    saveJsonFile(targetFile, targetList);
                    saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
                    await sendMessage(sock, userJid, { text: "✅ Seu pedido foi reativado e colocado de volta na fila! Um comprador atenderá você em breve." });

                    const buyerJids = Object.keys(compradoresData);
                    const buyerName = userData[userJid]?.nome || userJid.split('@')[0];
                    const notificationText = `🔔 *Cliente de Volta!*\n\nO cliente *${buyerName}* saiu da lista de espera e está pronto para ser atendido. O pedido *#${order.id}* voltou para a fila.`;
                    for (const buyerJid of buyerJids) {
                        if (compradoresData[buyerJid].notificacoes) {
                            try {
                                await sendMessage(sock, buyerJid, { text: notificationText });
                            } catch (e) {
                                console.error(`Falha ao notificar comprador ${buyerJid} sobre reativação.`);
                            }
                        }
                    }

                    delete userState[userJid];
                } else {
                    await sendMessage(sock, userJid, { text: "Não encontrei um pedido em espera para você. 🤔" });
                    delete userState[userJid];
                }
            } else if (step === "register_name") {
                const newName = messageText;
                const platformMenu = `✅ Nome registrado como *${newName}*!\n\nAgora, por favor, informe sua *plataforma principal*:\n\n*Digite:*\n1️⃣ - Android / Play Store\n2️⃣ - Microsoft / PC\n3️⃣ - iOS / Apple Store`;
                await sendMessage(sock, userJid, { text: platformMenu });
                navigateTo(userJid, "register_platform_choice", { newName });
            } else if (step === "register_platform_choice") {
                const choice = messageText;
                const { newName } = data;
                let newPlatform = "";
                if (choice === "1") {
                    newPlatform = "Android/Play Store";
                } else if (choice === "2") {
                    newPlatform = "Microsoft/PC";
                } else if (choice === "3") {
                    newPlatform = "iOS/Apple Store";
                } else {
                    // Mantém o estado atual ao enviar mensagem de erro
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3']);
                    navigateTo(userJid, "register_platform_choice", { newName }); // Preserva o estado
                    return;
                }

                const tempUserData = { newName, newPlatform };
                await sendMessage(sock, userJid, { text: `Plataforma definida como *${newPlatform}*.\n\nPor último, você possui um código de convite? 🎟️\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
                navigateTo(userJid, "register_invitation_choice", tempUserData);

            } else if (step === "register_invitation_choice") {
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Ótimo! Por favor, digite o código de convite:" });
                    navigateTo(userJid, 'register_invitation_code', data);
                } else if (messageText === '2') {
                    // Preserva dados existentes (como language) ao completar cadastro
                    const existingData = userData[userJid] || {};
                    userData[userJid] = {
                        ...existingData, // Preserva dados existentes
                        nome: data.newName,
                        plataforma: data.newPlatform,
                        compras: existingData.compras || 0,
                        totalEconomizado: existingData.totalEconomizado || 0,
                        powerPoints: existingData.powerPoints || 0,
                        status: 'navegando',
                        hasInviteDiscount: false,
                        invitedBy: null,
                        savedAccounts: existingData.savedAccounts || [],
                        notificado: existingData.notificado || false,
                        language: existingData.language || 'pt', // Preserva ou define padrão
                    };
                    await generateInviteCode(data.newName, userJid);
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    if (!purchaseHistoryData[userJid]) {
                        purchaseHistoryData[userJid] = [];
                        saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
                    }
                    await sendMessage(sock, userJid, { text: "🎉 Cadastro finalizado com sucesso! Seja bem-vindo(a) à PowerShop." });
                    await sendMainMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === "register_invitation_code") {
                const code = messageText.toUpperCase();
                console.log(`[Código Convite] Verificando código: "${code}" para usuário: ${userJid}`);
                console.log(`[Código Convite] Código existe? ${!!invitationData[code]}`);
                if (invitationData[code]) {
                    console.log(`[Código Convite] Dono do código: ${invitationData[code].ownerJid}`);
                    console.log(`[Código Convite] É o mesmo usuário? ${invitationData[code].ownerJid === userJid}`);
                } else {
                    console.log(`[Código Convite] Códigos disponíveis:`, Object.keys(invitationData));
                }

                // A verificação do '0' já acontece no início do handler de mensagens
                if (invitationData[code] && invitationData[code].ownerJid !== userJid) {
                    const inviterJid = invitationData[code].ownerJid;
                    const inviterName = invitationData[code].ownerName;

                    // Preserva dados existentes (como language) ao completar cadastro
                    const existingData = userData[userJid] || {};
                    userData[userJid] = {
                        ...existingData, // Preserva dados existentes
                        nome: data.newName,
                        plataforma: data.newPlatform,
                        compras: existingData.compras || 0,
                        totalEconomizado: existingData.totalEconomizado || 0,
                        powerPoints: existingData.powerPoints || 0,
                        status: 'navegando',
                        hasInviteDiscount: true,
                        invitedBy: code,
                        savedAccounts: existingData.savedAccounts || [],
                        notificado: existingData.notificado || false,
                        language: existingData.language || 'pt', // Preserva ou define padrão
                    };
                    await generateInviteCode(data.newName, userJid);
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    if (!purchaseHistoryData[userJid]) {
                        purchaseHistoryData[userJid] = [];
                        saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
                    }

                    invitationData[code].uses = (invitationData[code].uses || 0) + 1;
                    invitationData[code].invitedUsers[userJid] = { registeredAt: new Date().toISOString(), completedPurchase: false };
                    saveJsonFile(ARQUIVO_CONVITES, invitationData);
                    await sendMessage(sock, userJid, { text: `✅ Código de *${inviterName}* aplicado! Você ganhará 5% de desconto na sua primeira compra.\n\n🎉 Cadastro finalizado! Bem-vindo(a) à PowerShop.` });
                    await sendMessage(sock, inviterJid, { text: `Boas notícias! ✨ O usuário *${data.newName}* usou seu código de convite! Você receberá sua recompensa assim que ele realizar a primeira compra.` });
                    await sendMainMenu(sock, userJid);

                } else {
                    await sendMessage(sock, userJid, { text: "Código inválido ou é o seu próprio código! Tente novamente ou digite *0* para continuar sem um código." });
                    navigateTo(userJid, 'register_invitation_code', data);
                }
            } else if (step === "awaiting_admin_choice") {
                const stats = loadJsonFile(ARQUIVO_DADOS_LOJA);
                const adminName = userData[userJid]?.nome || "Admin";

                if (messageText === "1" || messageText === "admin_stats") {
                    const totalUsers = Object.keys(userData).length;
                    const faturamentoTotal = stats.faturamentoTotal || 0;
                    const valorPerdido = stats.valorPerdido || 0;

                    const panelText = `📊 *Painel de Estatísticas*\n\nOlá, *${adminName}*! Aqui está o resumo atual da loja:\n\n- - -\n*📈 Vendas Realizadas:* ${stats.vendasRealizadas ||
                        0}\n*💰 Faturamento Total:* R$ ${faturamentoTotal.toFixed(2).replace(".", ",")}\n*👤 Total de Usuários:* ${totalUsers}\n*✅ Contas Verificadas:* ${stats.contasVerificadas || 0}\n*⏰ ID Checks Expirados:* ${stats.idChecksExpirados || 0}\n*💸 Valor Perdido (E-mails):* R$ ${valorPerdido.toFixed(2).replace(".", ",")}\n- - -\n\nDigite *X* para resetar o valor perdido e os ID checks expirados.\n\n0️⃣ Voltar ao Painel Administrativo`;
                    await sendMessage(sock, userJid, { text: panelText });
                    navigateTo(userJid, "awaiting_stats_panel_action");
                } else if (messageText === "2" || messageText === "admin_tickets") {
                    await sendTicketTypeMenu(sock, userJid);
                } else if (messageText === "3" || messageText === "admin_products") {
                    await sendProductCategoryList(sock, userJid);
                } else if (messageText === "4" || messageText === "admin_discounts") {
                    await sendManageDiscountsMenu(sock, userJid);
                } else if (messageText === "5" || messageText === "admin_notifications") {
                    await sendAdminNotificationsMenu(sock, userJid);
                } else if (messageText === "6" || messageText === "admin_parameters") {
                    await sendParametersManagementMenu(sock, userJid);
                } else if (messageText === "7" || messageText === "admin_bulk_price") {
                    await sendBulkPriceChangeMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '7', '0']);
                }
            } else if (step === 'awaiting_stats_panel_action') {
                if (messageText.toLowerCase() === 'x') {
                    shopData.valorPerdido = 0;
                    shopData.idChecksExpirados = 0;
                    saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                    await sendMessage(sock, userJid, { text: "✅ Estatísticas de 'Valor Perdido' e 'ID Checks Expirados' foram resetadas." });
                }
                await sendAdminPanel(sock, userJid);
            } else if (step === 'awaiting_points_user_number') {
                if (!isAdmin) return;
                const phoneNumber = messageText.replace(/\D/g, '');
                if (messageText === '0' || messageText.toLowerCase() === 'cancelar') {
                    await sendMessage(sock, userJid, { text: "Operação cancelada." });
                    delete userState[userJid];
                    return;
                }
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido. Envie com DDI e DDD (ex: 5511912345678)." });
                    return;
                }
                const targetJid = `${phoneNumber}@s.whatsapp.net`;
                const targetProfile = userData[targetJid];
                const nome = targetProfile?.nome || targetJid.split('@')[0];
                const status = targetProfile?.status || 'desconhecido';
                const pontos = targetProfile?.powerPoints || 0;
                const compras = targetProfile?.compras || 0;
                const resumo = `👤 Usuário: *${nome}*\n📱 Número: ${phoneNumber}\n📊 Status: ${status}\n⭐ PowerPoints: ${pontos}\n🛒 Compras: ${compras}`;
                await sendMessage(sock, userJid, { text: `${resumo}\n\nConfirmar este usuário?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
                navigateTo(userJid, 'awaiting_points_user_confirmation', { targetJid });
            } else if (step === 'awaiting_points_user_confirmation') {
                if (!isAdmin) return;
                const { targetJid } = data;
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Digite a *quantidade de pontos* para adicionar:" });
                    navigateTo(userJid, 'awaiting_points_quantity', { targetJid });
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Operação cancelada." });
                    delete userState[userJid];
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_points_quantity') {
                if (!isAdmin) return;
                const { targetJid } = data;
                const qty = parseInt(messageText.replace(/\D/g, ''), 10);
                if (!Number.isFinite(qty) || qty <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Informe um número válido de pontos (maior que 0)." });
                    return;
                }
                const nome = userData[targetJid]?.nome || targetJid.split('@')[0];
                await sendMessage(sock, userJid, { text: `Confirmar adicionar *${qty}* PowerPoints para *${nome}*?\n\n*Digite:*\n1️⃣ - Confirmar\n2️⃣ - Cancelar` });
                navigateTo(userJid, 'awaiting_points_final_confirmation', { targetJid, qty });
            } else if (step === 'awaiting_points_final_confirmation') {
                if (!isAdmin) return;
                const { targetJid, qty } = data;
                if (messageText === '1') {
                    if (!userData[targetJid]) {
                        userData[targetJid] = { nome: targetJid.split('@')[0], status: 'navegando', compras: 0, totalEconomizado: 0, powerPoints: 0, savedAccounts: [] };
                    }
                    userData[targetJid].powerPoints = (userData[targetJid].powerPoints || 0) + qty;
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    const nome = userData[targetJid]?.nome || targetJid.split('@')[0];
                    await sendMessage(sock, userJid, { text: `✅ Adicionados *${qty}* PowerPoints para *${nome}*.` });
                    try {
                        await sendMessage(sock, targetJid, { text: `🎁 Você recebeu *${qty}* PowerPoints adicionados pela equipe.` });
                    } catch (e) { /* ignore notification errors */ }
                    delete userState[userJid];
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Operação cancelada." });
                    delete userState[userJid];
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_team_management_choice') {
                // Suporta lista interativa e modo legacy
                if (messageText === 'team_admins' || messageText === '1') {
                    await sendManageAdminsMenu(sock, userJid);
                } else if (messageText === 'team_buyers' || messageText === '2') {
                    await sendManageCompradoresMenu(sock, userJid);
                } else if (messageText === 'team_product' || messageText === '3') {
                    await sendManageProductManagersMenu(sock, userJid);
                } else if (messageText === 'team_cards' || messageText === '4') {
                    await sendManageCardManagersMenu(sock, userJid);
                } else if (messageText === 'team_regional' || messageText === '5') {
                    await sendManageRegionalChangeManagersMenu(sock, userJid);
                } else if (messageText === 'team_commissions' || messageText === '6') {
                    await sendManageCommissionsMenu(sock, userJid);
                } else if (messageText === 'team_earnings' || messageText === '7') {
                    await sendManageTeamEarningsMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '7', '0']);
                }
            } else if (step === 'awaiting_parameters_management_choice') {
                // Suporta lista interativa e modo legacy
                if (messageText === 'params_discount' || messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para o *Desconto Automático* (apenas o número, ex: 25 para 25%):" });
                    navigateTo(userJid, 'awaiting_new_discount_value');
                } else if (messageText === 'params_minimum' || messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a *Compra Mínima* (apenas o número, ex: 15.50):" });
                    navigateTo(userJid, 'awaiting_new_minimum_value');
                } else if (messageText === 'params_pix' || messageText === '3') {
                    await sendMessage(sock, userJid, { text: "Digite a nova *Chave PIX* para pagamentos manuais:" });
                    navigateTo(userJid, 'awaiting_new_pix_key');
                } else if (messageText === 'params_image' || messageText === '4') {
                    await sendMessage(sock, userJid, { text: "📸 *Envie a nova imagem do menu*\n\nA imagem será exibida no menu principal para todos os clientes." });
                    navigateTo(userJid, 'awaiting_menu_image');
                } else if (messageText === 'params_team' || messageText === '5') {
                    await sendTeamManagementMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '0']);
                }
            } else if (step === 'awaiting_commission_to_edit') {
                // MODO LEGACY: messageText removido - usa apenas messageText
                const choice = messageText.replace('commission_', '');

                if (choice === '1' || messageText === 'commission_1') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a comissão *por Compra* (Compradores):" });
                    navigateTo(userJid, 'awaiting_new_commission_value', { type: 'porCompra' });
                } else if (choice === '2' || messageText === 'commission_2') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a comissão *por Verificação* (Compradores):" });
                    navigateTo(userJid, 'awaiting_new_commission_value', { type: 'porVerificacao' });
                } else if (choice === '3' || messageText === 'commission_3') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a comissão de *Administrador* (por produto):" });
                    navigateTo(userJid, 'awaiting_new_commission_value', { type: 'admin' });
                } else if (choice === '4' || messageText === 'commission_4') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a comissão de *Gerenciador de Produto* (por oferta):" });
                    navigateTo(userJid, 'awaiting_new_commission_value', { type: 'gerenciadorProduto' });
                } else if (choice === '5' || messageText === 'commission_5') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a comissão de *Gerenciador de Cartão* (por produto):" });
                    navigateTo(userJid, 'awaiting_new_commission_value', { type: 'gerenciadorCartao' });
                } else if (choice === '6' || messageText === 'commission_6') {
                    await sendMessage(sock, userJid, { text: "Digite o novo valor para a comissão de *Gerenciador de Troca Regional* (por produto):" });
                    navigateTo(userJid, 'awaiting_new_commission_value', { type: 'gerenciadorTrocaRegional' });
                } else if (choice === '7' || messageText === 'commission_7') {
                    await sendMessage(sock, userJid, { text: "⚠️ *Comissão de Apoiador*\n\nDigite o novo percentual (apenas o número, ex: 5 para 5%):" });
                    navigateTo(userJid, 'awaiting_new_apoiador_percentage');
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '7', '0']);
                }
            } else if (step === 'awaiting_new_commission_value') {
                const { type } = data;
                const newValue = parseFloat(messageText.replace(',', '.'));
                if (isNaN(newValue) || newValue < 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
                    return;
                }
                if (!shopData.comissoes) {
                    shopData.comissoes = { porCompra: 8.00, porVerificacao: 0.50 };
                }
                shopData.comissoes[type] = newValue;
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                await sendMessage(sock, userJid, { text: `✅ Comissão atualizada com sucesso!` });
                await sendManageCommissionsMenu(sock, userJid);
            } else if (step === 'awaiting_new_apoiador_percentage') {
                const newPercentage = parseFloat(messageText.replace(',', '.'));
                if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
                    await sendMessage(sock, userJid, { text: "⚠️ Percentual inválido. Digite um número entre 0 e 100." });
                    return;
                }

                // Atualizar o percentual de comissão para todos os apoiadores
                const newComissaoDecimal = newPercentage / 100;
                for (const code in apoiadoresData) {
                    apoiadoresData[code].comissao = newComissaoDecimal;
                }
                saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);

                await sendMessage(sock, userJid, { text: `✅ Comissão de apoiador atualizada para ${newPercentage}% com sucesso!\n\nTodos os apoiadores agora recebem ${newPercentage}% do valor das compras.` });
                await sendManageCommissionsMenu(sock, userJid);
            } else if (step === 'awaiting_new_discount_value') {
                const newDiscount = parseFloat(messageText.replace(',', '.'));
                if (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número entre 0 e 100." });
                    return;
                }
                shopData.descontoAutomaticoOferta = newDiscount;
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                await sendMessage(sock, userJid, { text: `✅ Desconto automático atualizado para ${newDiscount}% com sucesso!` });
                await sendParametersManagementMenu(sock, userJid);
            } else if (step === 'awaiting_new_minimum_value') {
                const newMinimum = parseFloat(messageText.replace(',', '.'));
                if (isNaN(newMinimum) || newMinimum < 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
                    return;
                }
                shopData.compraMinima = newMinimum;
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                await sendMessage(sock, userJid, { text: `✅ Compra mínima atualizada para R$ ${newMinimum.toFixed(2)} com sucesso!` });
                await sendParametersManagementMenu(sock, userJid);
            } else if (step === 'awaiting_new_pix_key') {
                const newPixKey = messageText.trim();
                if (!newPixKey || newPixKey.length < 5) {
                    await sendMessage(sock, userJid, { text: "⚠️ Chave PIX inválida. Digite uma chave válida." });
                    return;
                }
                shopData.chavePix = newPixKey;
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                await sendMessage(sock, userJid, { text: `✅ Chave PIX atualizada com sucesso!\n\n*Nova chave:* ${newPixKey}` });
                await sendParametersManagementMenu(sock, userJid);
            } else if (step === 'awaiting_bulk_price_change_type') {
                let changeType = '';
                let promptText = '';

                if (messageText === '1') {
                    changeType = 'increase_percentage';
                    promptText = '➕ Digite a porcentagem de aumento (ex: 10 para aumentar 10%):';
                } else if (messageText === '2') {
                    changeType = 'decrease_percentage';
                    promptText = '➖ Digite a porcentagem de redução (ex: 10 para reduzir 10%):';
                } else if (messageText === '3') {
                    changeType = 'increase_fixed';
                    promptText = '➕ Digite o valor fixo de aumento em R$ (ex: 5.50):';
                } else if (messageText === '4') {
                    changeType = 'decrease_fixed';
                    promptText = '➖ Digite o valor fixo de redução em R$ (ex: 5.50):';
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
                    return;
                }

                await sendMessage(sock, userJid, { text: promptText });
                navigateTo(userJid, 'awaiting_bulk_price_change_value', { changeType });
            } else if (step === 'awaiting_bulk_price_change_value') {
                const { changeType } = data;
                const value = parseFloat(messageText.replace(',', '.'));

                if (isNaN(value) || value <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
                    return;
                }

                await sendMessage(sock, userJid, { text: "⏳ Processando alteração de preços..." });

                // Atualizar todos os produtos
                let updatedCount = 0;

                // Função recursiva para processar diretórios
                const processDirectory = (dir) => {
                    if (!fs.existsSync(dir)) {
                        console.log(`[BulkPrice] Diretório não existe: ${dir}`);
                        return;
                    }

                    const items = fs.readdirSync(dir);
                    for (const item of items) {
                        const itemPath = path.join(dir, item);
                        const stats = fs.statSync(itemPath);

                        if (stats.isDirectory()) {
                            // Se é diretório, processar recursivamente
                            processDirectory(itemPath);
                        } else if (item.endsWith('.json')) {
                            // Se é arquivo JSON, processar
                            try {
                                const data = JSON.parse(fs.readFileSync(itemPath, 'utf-8'));
                                let modified = false;

                                // Verificar se é um array de produtos
                                if (Array.isArray(data)) {
                                    for (let i = 0; i < data.length; i++) {
                                        const oferta = data[i];
                                        if (oferta.price) {
                                            const oldPrice = oferta.price;
                                            let newPrice = oferta.price;

                                            if (changeType === 'increase_percentage') {
                                                newPrice = oferta.price * (1 + value / 100);
                                            } else if (changeType === 'decrease_percentage') {
                                                newPrice = oferta.price * (1 - value / 100);
                                            } else if (changeType === 'increase_fixed') {
                                                newPrice = oferta.price + value;
                                            } else if (changeType === 'decrease_fixed') {
                                                newPrice = oferta.price - value;
                                            }

                                            // Garantir que o preço não fique negativo
                                            if (newPrice < 0) newPrice = 0.01;

                                            data[i].price = Math.round(newPrice * 100) / 100;
                                            modified = true;
                                            updatedCount++;
                                            console.log(`[BulkPrice] ${item}[${i}] ${oferta.name || 'Sem nome'}: R$${oldPrice.toFixed(2)} → R$${data[i].price.toFixed(2)}`);
                                        }
                                    }

                                    if (modified) {
                                        fs.writeFileSync(itemPath, JSON.stringify(data, null, 2));
                                    }
                                } else if (data.price) {
                                    // Se for um objeto único com price
                                    const oldPrice = data.price;
                                    let newPrice = data.price;

                                    if (changeType === 'increase_percentage') {
                                        newPrice = data.price * (1 + value / 100);
                                    } else if (changeType === 'decrease_percentage') {
                                        newPrice = data.price * (1 - value / 100);
                                    } else if (changeType === 'increase_fixed') {
                                        newPrice = data.price + value;
                                    } else if (changeType === 'decrease_fixed') {
                                        newPrice = data.price - value;
                                    }

                                    if (newPrice < 0) newPrice = 0.01;

                                    data.price = Math.round(newPrice * 100) / 100;
                                    fs.writeFileSync(itemPath, JSON.stringify(data, null, 2));
                                    updatedCount++;
                                    console.log(`[BulkPrice] ${item}: R$${oldPrice.toFixed(2)} → R$${data.price.toFixed(2)}`);
                                }
                            } catch (error) {
                                console.error(`[BulkPrice] Erro ao processar ${itemPath}:`, error.message);
                            }
                        }
                    }
                };

                console.log(`[BulkPrice] Iniciando processamento em: ${DIRETORIO_OFERTAS}`);
                // Processar ofertas (busca em produtos/ofertas/)
                processDirectory(DIRETORIO_OFERTAS);
                console.log(`[BulkPrice] Total processado: ${updatedCount} produtos`);

                const changeDescriptions = {
                    'increase_percentage': `aumentados em ${value}%`,
                    'decrease_percentage': `reduzidos em ${value}%`,
                    'increase_fixed': `aumentados em R$ ${value.toFixed(2)}`,
                    'decrease_fixed': `reduzidos em R$ ${value.toFixed(2)}`
                };

                await sendMessage(sock, userJid, {
                    text: `✅ Preços atualizados com sucesso!\n\n📊 *${updatedCount}* produtos foram ${changeDescriptions[changeType]}.`
                });
                await sendAdminPanel(sock, userJid);
            } else if (step === 'awaiting_farm_dragon_choice_fallback') {
                // Fallback quando lista interativa não funciona
                console.log('[Farm Fallback] Entrando no handler, data:', data);
                const { quantity, level } = data;
                console.log('[Farm Fallback] Quantidade:', quantity, 'Nível:', level, 'MessageText:', messageText);

                if (messageText === '1') {
                    console.log('[Farm Fallback] Opção 1 selecionada, calculando...');
                    const dragonType = 'positivo_negativo';
                    const farmPerMinute = FARM_PER_LEVEL[level] || 0;
                    const totalPerMinute = quantity * farmPerMinute;
                    const totalPerHour = totalPerMinute * 60;
                    const totalPerDay = totalPerHour * 24;
                    const totalPerMonth = totalPerDay * 30;

                    const responseText = `🐉 *Cálculo de Farm*\n\n` +
                        `*Dragão:* Positivo/Negativo\n` +
                        `*Quantidade:* ${quantity}x nível ${level}\n` +
                        `*Produção individual:* ${farmPerMinute} comida/min\n\n` +
                        `📊 *Produção total:*\n` +
                        `• *Por minuto:* ${totalPerMinute.toLocaleString('pt-BR')} comida\n` +
                        `• *Por hora:* ${totalPerHour.toLocaleString('pt-BR')} comida\n` +
                        `• *Por dia:* ${totalPerDay.toLocaleString('pt-BR')} comida\n` +
                        `• *Por mês:* ${totalPerMonth.toLocaleString('pt-BR')} comida`;

                    console.log('[Farm Fallback] Enviando resposta para:', userJid);
                    await sendMessage(sock, userJid, { text: responseText });
                    console.log('[Farm Fallback] Resposta enviada, deletando estado:', stateJid);
                    delete userState[stateJid];
                } else if (messageText === '0') {
                    console.log('[Farm Fallback] Cancelando cálculo');
                    delete userState[stateJid];
                    await sendMessage(sock, userJid, { text: "❌ Cálculo cancelado." });
                } else {
                    console.log('[Farm Fallback] Opção inválida:', messageText);
                    await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
                }
            } else if (step === 'awaiting_manage_team_earnings_choice') {
                const { teamMembers } = data;
                const inputText = messageText.trim().toUpperCase();

                if (inputText === 'A') {
                    // Adicionar valor a um membro
                    let membersListText = "➕ *Adicionar Valor*\n\nSelecione o membro da equipe:\n\n";
                    for (let i = 0; i < teamMembers.length; i++) {
                        membersListText += `*${i + 1}* - ${teamMembers[i].nome} (${teamMembers[i].cargo})\n`;
                    }
                    membersListText += "\nDigite o número do membro ou *0* para cancelar:";
                    await sendMessage(sock, userJid, { text: membersListText });
                    navigateTo(userJid, 'awaiting_member_to_add_value', { teamMembers });
                } else if (inputText === 'B') {
                    // Remover valor de um membro
                    let membersListText = "➖ *Remover Valor*\n\nSelecione o membro da equipe:\n\n";
                    for (let i = 0; i < teamMembers.length; i++) {
                        membersListText += `*${i + 1}* - ${teamMembers[i].nome} (${teamMembers[i].cargo})\n`;
                    }
                    membersListText += "\nDigite o número do membro ou *0* para cancelar:";
                    await sendMessage(sock, userJid, { text: membersListText });
                    navigateTo(userJid, 'awaiting_member_to_remove_value', { teamMembers });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['A', 'B', '0']);
                }
            } else if (step === 'awaiting_member_to_add_value') {
                const { teamMembers } = data;
                const choice = parseInt(messageText.trim());

                if (choice === 0) {
                    await sendManageTeamEarningsMenu(sock, userJid);
                    return;
                }

                if (isNaN(choice) || choice < 1 || choice > teamMembers.length) {
                    await sendMessage(sock, userJid, { text: `⚠️ Opção inválida. Digite um número entre 1 e ${teamMembers.length} ou 0 para cancelar.` });
                    return;
                }

                const selectedMember = teamMembers[choice - 1];
                await sendMessage(sock, userJid, { text: `Digite o valor que deseja *adicionar* para *${selectedMember.nome}*:` });
                navigateTo(userJid, 'awaiting_value_to_add', { selectedMember, teamMembers });
            } else if (step === 'awaiting_value_to_add') {
                const { selectedMember, teamMembers } = data;
                const valor = parseFloat(messageText.replace(',', '.'));

                if (isNaN(valor) || valor <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
                    return;
                }

                // Perguntar se o valor estará disponível para saque
                const lang = getUserLanguage(userJid);
                const valorFmt = await formatCurrencyByLanguage(valor, lang);
                await sendMessage(sock, userJid, { text: `💰 ${valorFmt} será adicionado para *${selectedMember.nome}*.\n\nO valor estará disponível para saque imediatamente?\n\n1️⃣ Sim - Disponível para saque\n2️⃣ Não - Valor bloqueado (liberado no próximo mês)` });
                navigateTo(userJid, 'awaiting_value_availability', { selectedMember, teamMembers, valor });
            } else if (step === 'awaiting_value_availability') {
                const { selectedMember, teamMembers, valor } = data;

                if (messageText !== '1' && messageText !== '2') {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                    return;
                }

                const disponivel = messageText === '1';

                // Adicionar valor (direto se disponível, bloqueado se não)
                const success = addEarningsToMember(selectedMember.jid, valor, disponivel);

                if (success) {
                    const lang = getUserLanguage(userJid);
                    const valorFmt = await formatCurrencyByLanguage(valor, lang);

                    if (disponivel) {
                        await sendMessage(sock, userJid, { text: `✅ ${valorFmt} adicionado com sucesso ao *caixa disponível* de *${selectedMember.nome}*!` });

                        // Notificar o membro
                        try {
                            await sendMessage(sock, selectedMember.jid, { text: `💰 Você recebeu ${valorFmt} em seu caixa disponível! Use */saque* para verificar.` });
                        } catch (e) {
                            console.error(`Erro ao notificar ${selectedMember.jid}:`, e);
                        }
                    } else {
                        await sendMessage(sock, userJid, { text: `✅ ${valorFmt} adicionado com sucesso ao *valor bloqueado* de *${selectedMember.nome}*! Será liberado no próximo mês.` });

                        // Notificar o membro
                        try {
                            await sendMessage(sock, selectedMember.jid, { text: `💰 Você recebeu ${valorFmt} em seu valor bloqueado! Será liberado no próximo mês. Use */saque* para verificar.` });
                        } catch (e) {
                            console.error(`Erro ao notificar ${selectedMember.jid}:`, e);
                        }
                    }

                    await sendManageTeamEarningsMenu(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Erro ao adicionar valor. Tente novamente." });
                }
            } else if (step === 'awaiting_member_to_remove_value') {
                const { teamMembers } = data;
                const choice = parseInt(messageText.trim());

                if (choice === 0) {
                    await sendManageTeamEarningsMenu(sock, userJid);
                    return;
                }

                if (isNaN(choice) || choice < 1 || choice > teamMembers.length) {
                    await sendMessage(sock, userJid, { text: `⚠️ Opção inválida. Digite um número entre 1 e ${teamMembers.length} ou 0 para cancelar.` });
                    return;
                }

                const selectedMember = teamMembers[choice - 1];
                await sendMessage(sock, userJid, { text: `Digite o valor que deseja *remover* de *${selectedMember.nome}*:` });
                navigateTo(userJid, 'awaiting_value_to_remove', { selectedMember, teamMembers });
            } else if (step === 'awaiting_value_to_remove') {
                const { selectedMember, teamMembers } = data;
                const valor = parseFloat(messageText.replace(',', '.'));

                if (isNaN(valor) || valor <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
                    return;
                }

                // Remover valor do caixa do membro
                const success = addEarningsToMember(selectedMember.jid, -valor, true);

                if (success) {
                    const lang = getUserLanguage(userJid);
                    const valorFmt = await formatCurrencyByLanguage(valor, lang);
                    await sendMessage(sock, userJid, { text: `✅ ${valorFmt} removido com sucesso do caixa de *${selectedMember.nome}*!` });

                    // Notificar o membro
                    try {
                        await sendMessage(sock, selectedMember.jid, { text: `💸 ${valorFmt} foi removido do seu caixa. Use */saque* para verificar.` });
                    } catch (e) {
                        console.error(`Erro ao notificar ${selectedMember.jid}:`, e);
                    }

                    await sendManageTeamEarningsMenu(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Erro ao remover valor. Tente novamente." });
                }
            } else if (step === 'awaiting_notification_toggle_choice') {
                const { notifications } = data;
                // MODO LEGACY: messageText removido - usa apenas messageText

                let choiceIndex = -1;
                if (messageText && messageText.startsWith('notif_')) {
                    choiceIndex = parseInt(messageText.replace('notif_', '')) - 1;
                } else {
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= notifications.length) {
                        choiceIndex = choice - 1;
                    }
                }

                if (choiceIndex >= 0 && choiceIndex < notifications.length) {
                    const notificationToToggle = notifications[choiceIndex];
                    if (!adminData[userJid].notificacoes) {
                        adminData[userJid].notificacoes = {};
                    }
                    adminData[userJid].notificacoes[notificationToToggle.key] = !adminData[userJid].notificacoes[notificationToToggle.key];
                    saveJsonFile(ARQUIVO_ADMINS, adminData);
                    await sendMessage(sock, userJid, { text: `✅ Notificação de *${notificationToToggle.label}* foi ${adminData[userJid].notificacoes[notificationToToggle.key] ? 'ATIVADA' : 'DESATIVADA'}.` });
                    await sendAdminNotificationsMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, notifications.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === 'awaiting_card_to_remove') {
                const { cards } = data;
                const choice = messageText.trim().toUpperCase();

                if (choice === 'X') {
                    shopData.cartoes = [];
                    saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                    await sendMessage(sock, userJid, { text: "✅ Todos os cartões foram removidos com sucesso!" });
                    await sendManageCardManagersMenu(sock, userJid);
                    return;
                }

                const choiceIndex = parseInt(choice) - 1;
                if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < cards.length) {
                    const cardToRemove = cards[choiceIndex];
                    await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o cartão *${cardToRemove.tipo}* (final ${cardToRemove.numero.slice(-4)})?\n\n*1* - Sim\n*2* - Não` });
                    navigateTo(userJid, "awaiting_card_removal_confirmation", { cardIndex: choiceIndex });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, cards.map((_, i) => `${i + 1}`).concat(['X', '0']));
                }
            } else if (step === 'awaiting_card_removal_confirmation') {
                const { cardIndex } = data;
                if (messageText === '1') {
                    shopData.cartoes.splice(cardIndex, 1);
                    saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                    await sendMessage(sock, userJid, { text: "✅ Cartão removido com sucesso!" });
                    await sendManageCardManagersMenu(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "Remoção cancelada." });
                    await sendManageCardManagersMenu(sock, userJid);
                }
            } else if (step === 'awaiting_correction_method') {
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "🔍 Digite o LID/JID do usuário que deseja buscar:\n\nExemplo: 554391964950@lid ou 554391964950@s.whatsapp.net" });
                    navigateTo(userJid, 'awaiting_correction_lid_input');
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "🔍 Digite o email do usuário que deseja buscar:" });
                    navigateTo(userJid, 'awaiting_correction_email_input');
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === 'awaiting_correction_lid_input') {
                const searchLid = messageText.trim();

                // Busca o LID em todos os arquivos JSON
                const allFiles = [
                    { path: ARQUIVO_USUARIOS, name: 'usuarios.json' },
                    { path: ARQUIVO_ADMINS, name: 'admins.json' },
                    { path: ARQUIVO_COMPRADORES, name: 'compradores.json' },
                    { path: ARQUIVO_GERENCIADORES_PRODUTO, name: 'gerenciadores_produto.json' },
                    { path: ARQUIVO_GERENCIADORES_CARTAO, name: 'gerenciadores_cartao.json' },
                    { path: ARQUIVO_GERENCIADORES_TROCA_REGIONAL, name: 'gerenciadores_troca_regional.json' },
                    { path: ARQUIVO_HISTORICO_COMPRAS, name: 'historico_compras.json' },
                    { path: ARQUIVO_CHATS_ATIVOS, name: 'active_chats.json' },
                    { path: ARQUIVO_PEDIDOS, name: 'pedidos.json' },
                    { path: ARQUIVO_PEDIDOS_V, name: 'pedidosv.json' },
                    { path: ARQUIVO_PEDIDOS_ESPERA, name: 'pedidos_espera.json' }
                ];

                let foundEntries = [];

                for (const file of allFiles) {
                    try {
                        const fileData = loadJsonFile(file.path, {});

                        if (Array.isArray(fileData)) {
                            // Se for array, busca em cada elemento
                            fileData.forEach((item, index) => {
                                if (JSON.stringify(item).includes(searchLid)) {
                                    foundEntries.push({ file: file.name, location: `index ${index}`, data: item });
                                }
                            });
                        } else {
                            // Se for objeto, busca nas chaves
                            Object.keys(fileData).forEach(key => {
                                if (key.includes(searchLid) || JSON.stringify(fileData[key]).includes(searchLid)) {
                                    foundEntries.push({ file: file.name, location: key, data: fileData[key] });
                                }
                            });
                        }
                    } catch (error) {
                        // Ignora erros de arquivos que não existem
                    }
                }

                if (foundEntries.length === 0) {
                    await sendMessage(sock, userJid, { text: `❌ Nenhuma entrada encontrada com o LID: ${searchLid}` });
                    delete userState[userJid];
                    return;
                }

                let resultText = `✅ *Encontradas ${foundEntries.length} entradas:*\n\n`;
                foundEntries.forEach((entry, index) => {
                    resultText += `${index + 1}. Arquivo: ${entry.file}\n`;
                    resultText += `   Local: ${entry.location}\n\n`;
                });

                resultText += `\n📱 Digite o número correto (apenas números) para substituir:\n\nExemplo: 554391964950`;

                await sendMessage(sock, userJid, { text: resultText });
                navigateTo(userJid, 'awaiting_correction_new_number', { searchLid, foundEntries });

            } else if (step === 'awaiting_correction_email_input') {
                const searchEmail = messageText.trim().toLowerCase();

                // Busca email em emails_finalizados.json
                const emailsData = loadJsonFile(ARQUIVO_EMAILS_FINALIZADOS, {});

                let foundLid = null;
                Object.keys(emailsData).forEach(lid => {
                    const emailValue = emailsData[lid];
                    // Verifica se é string antes de chamar toLowerCase
                    if (typeof emailValue === 'string' && emailValue.toLowerCase() === searchEmail) {
                        foundLid = lid;
                    }
                });

                if (!foundLid) {
                    await sendMessage(sock, userJid, { text: `❌ Nenhum LID encontrado para o email: ${searchEmail}` });
                    delete userState[userJid];
                    return;
                }

                await sendMessage(sock, userJid, { text: `✅ LID encontrado: ${foundLid}\n\nBuscando em todos os arquivos...` });

                // Agora busca esse LID em todos arquivos
                const allFiles = [
                    { path: ARQUIVO_USUARIOS, name: 'usuarios.json' },
                    { path: ARQUIVO_ADMINS, name: 'admins.json' },
                    { path: ARQUIVO_COMPRADORES, name: 'compradores.json' },
                    { path: ARQUIVO_GERENCIADORES_PRODUTO, name: 'gerenciadores_produto.json' },
                    { path: ARQUIVO_GERENCIADORES_CARTAO, name: 'gerenciadores_cartao.json' },
                    { path: ARQUIVO_GERENCIADORES_TROCA_REGIONAL, name: 'gerenciadores_troca_regional.json' },
                    { path: ARQUIVO_HISTORICO_COMPRAS, name: 'historico_compras.json' },
                    { path: ARQUIVO_CHATS_ATIVOS, name: 'active_chats.json' },
                    { path: ARQUIVO_PEDIDOS, name: 'pedidos.json' },
                    { path: ARQUIVO_PEDIDOS_V, name: 'pedidosv.json' },
                    { path: ARQUIVO_PEDIDOS_ESPERA, name: 'pedidos_espera.json' }
                ];

                let foundEntries = [];

                for (const file of allFiles) {
                    try {
                        const fileData = loadJsonFile(file.path, {});

                        if (Array.isArray(fileData)) {
                            fileData.forEach((item, index) => {
                                if (JSON.stringify(item).includes(foundLid)) {
                                    foundEntries.push({ file: file.name, location: `index ${index}`, data: item });
                                }
                            });
                        } else {
                            Object.keys(fileData).forEach(key => {
                                if (key.includes(foundLid) || JSON.stringify(fileData[key]).includes(foundLid)) {
                                    foundEntries.push({ file: file.name, location: key, data: fileData[key] });
                                }
                            });
                        }
                    } catch (error) {
                        // Ignora erros
                    }
                }

                let resultText = `✅ *Encontradas ${foundEntries.length} entradas:*\n\n`;
                foundEntries.forEach((entry, index) => {
                    resultText += `${index + 1}. Arquivo: ${entry.file}\n`;
                    resultText += `   Local: ${entry.location}\n\n`;
                });

                resultText += `\n📱 Digite o número correto (apenas números) para substituir:\n\nExemplo: 554391964950`;

                await sendMessage(sock, userJid, { text: resultText });
                navigateTo(userJid, 'awaiting_correction_new_number', { searchLid: foundLid, foundEntries });

            } else if (step === 'awaiting_correction_new_number') {
                const { searchLid, foundEntries } = data;
                const newNumber = messageText.trim();

                // Valida se é um número
                if (!/^\d+$/.test(newNumber)) {
                    await sendMessage(sock, userJid, { text: "❌ Digite apenas números, sem espaços ou caracteres especiais." });
                    return;
                }

                const newJid = `${newNumber}@s.whatsapp.net`;

                await sendMessage(sock, userJid, { text: `🔄 Iniciando correção...\n\nSubstituindo:\n${searchLid}\n\nPor:\n${newJid}` });

                let updatedCount = 0;

                // Atualiza todos os arquivos
                const allFiles = [
                    { path: ARQUIVO_USUARIOS, name: 'usuarios.json' },
                    { path: ARQUIVO_ADMINS, name: 'admins.json' },
                    { path: ARQUIVO_COMPRADORES, name: 'compradores.json' },
                    { path: ARQUIVO_GERENCIADORES_PRODUTO, name: 'gerenciadores_produto.json' },
                    { path: ARQUIVO_GERENCIADORES_CARTAO, name: 'gerenciadores_cartao.json' },
                    { path: ARQUIVO_GERENCIADORES_TROCA_REGIONAL, name: 'gerenciadores_troca_regional.json' },
                    { path: ARQUIVO_HISTORICO_COMPRAS, name: 'historico_compras.json' },
                    { path: ARQUIVO_CHATS_ATIVOS, name: 'active_chats.json' },
                    { path: ARQUIVO_PEDIDOS, name: 'pedidos.json' },
                    { path: ARQUIVO_PEDIDOS_V, name: 'pedidosv.json' },
                    { path: ARQUIVO_PEDIDOS_ESPERA, name: 'pedidos_espera.json' },
                    { path: ARQUIVO_EMAILS_FINALIZADOS, name: 'emails_finalizados.json' }
                ];

                // Função recursiva para substituir LIDs em objetos aninhados
                function replaceLidInObject(obj, oldLid, newLid) {
                    if (Array.isArray(obj)) {
                        return obj.map(item => replaceLidInObject(item, oldLid, newLid));
                    } else if (obj && typeof obj === 'object') {
                        const newObj = {};
                        for (const key in obj) {
                            const value = obj[key];
                            // Se o valor é uma string e contém o LID, substitui
                            if (typeof value === 'string' && value === oldLid) {
                                newObj[key] = newLid;
                            } else if (typeof value === 'object') {
                                // Recursivamente processa objetos/arrays aninhados
                                newObj[key] = replaceLidInObject(value, oldLid, newLid);
                            } else {
                                newObj[key] = value;
                            }
                        }
                        return newObj;
                    }
                    return obj;
                }

                for (const file of allFiles) {
                    try {
                        let fileData = loadJsonFile(file.path, {});
                        let modified = false;

                        if (Array.isArray(fileData)) {
                            // Substitui em arrays - corrige campos que contém LIDs recursivamente
                            fileData = fileData.map(item => {
                                const itemStr = JSON.stringify(item);
                                if (itemStr.includes(searchLid)) {
                                    modified = true;
                                    return replaceLidInObject(item, searchLid, newJid);
                                }
                                return item;
                            });
                        } else {
                            // Substitui em objetos - move dados da chave antiga para a nova
                            const newData = {};
                            Object.keys(fileData).forEach(key => {
                                // Se a chave é exatamente o LID antigo, move todos os dados para a nova chave
                                if (key === searchLid) {
                                    modified = true;
                                    const newKey = newJid;
                                    // IMPORTANTE: Mantém TODOS os dados do usuário intactos
                                    newData[newKey] = fileData[key];
                                    console.log(`[/corrigir] Movendo dados de "${key}" para "${newKey}" em ${file.name}`);
                                } else if (key.includes(searchLid)) {
                                    // Se a chave contém o LID (mas não é exatamente ele), substitui apenas a parte do LID
                                    modified = true;
                                    const newKey = key.replace(searchLid, newJid);
                                    newData[newKey] = fileData[key];
                                    console.log(`[/corrigir] Renomeando chave de "${key}" para "${newKey}" em ${file.name}`);
                                } else {
                                    // Mantém a chave como está, mas verifica se os dados internos contêm o LID
                                    const valueStr = JSON.stringify(fileData[key]);
                                    if (valueStr.includes(searchLid)) {
                                        modified = true;
                                        // Substitui LIDs recursivamente nos dados
                                        newData[key] = replaceLidInObject(fileData[key], searchLid, newJid);
                                    } else {
                                        newData[key] = fileData[key];
                                    }
                                }
                            });
                            fileData = newData;
                        }

                        if (modified) {
                            saveJsonFile(file.path, fileData);
                            updatedCount++;

                            // Atualiza variáveis em memória
                            if (file.path === ARQUIVO_USUARIOS) userData = fileData;
                            else if (file.path === ARQUIVO_ADMINS) adminData = fileData;
                            else if (file.path === ARQUIVO_COMPRADORES) compradoresData = fileData;
                            else if (file.path === ARQUIVO_GERENCIADORES_PRODUTO) productManagerData = fileData;
                            else if (file.path === ARQUIVO_GERENCIADORES_CARTAO) gerenciadoresCartaoData = fileData;
                            else if (file.path === ARQUIVO_GERENCIADORES_TROCA_REGIONAL) gerenciadoresTrocaRegionalData = fileData;
                            else if (file.path === ARQUIVO_HISTORICO_COMPRAS) purchaseHistory = fileData;
                            else if (file.path === ARQUIVO_CHATS_ATIVOS) activeChats = fileData;
                            else if (file.path === ARQUIVO_PEDIDOS) orders = fileData;
                            else if (file.path === ARQUIVO_PEDIDOS_V) verificationOrders = fileData;
                            else if (file.path === ARQUIVO_PEDIDOS_ESPERA) waitingOrders = fileData;
                        }
                    } catch (error) {
                        console.error(`Erro ao atualizar ${file.name}:`, error);
                    }
                }

                await sendMessage(sock, userJid, {
                    text: `✅ *Correção concluída!*\n\n` +
                        `📁 Arquivos atualizados: ${updatedCount}\n` +
                        `🔄 LID antigo: ${searchLid}\n` +
                        `✨ LID novo: ${newJid}\n\n` +
                        `Todas as referências foram substituídas!`
                });

                delete userState[userJid];
            } else if (step === 'awaiting_discount_admin_choice') {
                // Suporta lista interativa e modo legacy
                if (messageText === 'discount_create' || messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Qual será o *nome* (código) do cupom? Ex: BEMVINDO10" });
                    navigateTo(userJid, 'awaiting_new_coupon_name');
                } else if (messageText === 'discount_coupons' || messageText === '2') {
                    await sendCouponList(sock, userJid);
                } else if (messageText === 'discount_invites' || messageText === '3') {
                    await sendInvitationList(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === 'awaiting_new_coupon_name') {
                const name = messageText.toUpperCase();
                if (couponData[name]) {
                    await sendMessage(sock, userJid, { text: "⚠️ Este nome de cupom já existe. Tente outro." });
                    return;
                }
                await sendMessage(sock, userJid, { text: `Nome do cupom: *${name}*.\n\nQual será o tipo de desconto?\n\n*Digite:*\n1️⃣ - Porcentagem (%)\n2️⃣ - Valor Fixo (R$)` });
                navigateTo(userJid, 'awaiting_new_coupon_type', { name });
            } else if (step === 'awaiting_new_coupon_type') {
                const { name } = data;
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Qual a porcentagem de desconto? (apenas o número, ex: 10 para 10%)" });
                    navigateTo(userJid, 'awaiting_new_coupon_value', { name, type: 'percentage' });
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Qual o valor fixo do desconto? (apenas o número, ex: 25.50)" });
                    navigateTo(userJid, 'awaiting_new_coupon_value', { name, type: 'fixed' });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_new_coupon_value') {
                const value = parseFloat(messageText.replace(',', '.'));
                if (isNaN(value) || value <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
                    return;
                }
                if (data.type === 'percentage') {
                    await sendMessage(sock, userJid, { text: `Desconto de ${value}%. Existe um valor *máximo* de desconto em R$? (ex: 50). Digite 0 para não ter limite.` });
                    navigateTo(userJid, 'awaiting_new_coupon_max_value', { ...data, value });
                } else { // fixed
                    await sendMessage(sock, userJid, { text: `Desconto de R$ ${value.toFixed(2)}. Este cupom exige um valor mínimo de compra?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
                    navigateTo(userJid, 'awaiting_coupon_min_value_choice', { ...data, value, maxValue: 0 });
                }
            } else if (step === 'awaiting_new_coupon_max_value') {
                const maxValue = parseFloat(messageText.replace(',', '.'));
                if (isNaN(maxValue)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido." });
                    return;
                }
                await sendMessage(sock, userJid, { text: "Este cupom exige um valor mínimo de compra?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não" });
                navigateTo(userJid, 'awaiting_coupon_min_value_choice', { ...data, maxValue });
            } else if (step === 'awaiting_coupon_min_value_choice') {
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Qual o valor mínimo de compra para usar este cupom? (ex: 100)" });
                    navigateTo(userJid, 'awaiting_new_coupon_min_value', data);
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Qual o limite de usos deste cupom? Digite 0 para usos ilimitados." });
                    navigateTo(userJid, 'awaiting_new_coupon_limit', { ...data, minValue: null });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_new_coupon_min_value') {
                const minValue = parseFloat(messageText.replace(',', '.'));
                if (isNaN(minValue) || minValue <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor mínimo inválido." });
                    return;
                }
                await sendMessage(sock, userJid, { text: `Valor mínimo de R$ ${minValue.toFixed(2)}. Qual o limite de usos deste cupom? Digite 0 para usos ilimitados.` });
                navigateTo(userJid, 'awaiting_new_coupon_limit', { ...data, minValue });
            } else if (step === 'awaiting_new_coupon_limit') {
                const limit = parseInt(messageText);
                if (isNaN(limit) || limit < 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Limite inválido." });
                    return;
                }
                const newCoupon = {
                    name: data.name,
                    type: data.type,
                    value: data.value,
                    maxValue: data.maxValue > 0 ? data.maxValue : null,
                    minValue: data.minValue,
                    limit: limit > 0 ? limit : null,
                    uses: 0,
                    totalDiscountValue: 0
                };
                couponData[data.name] = newCoupon;
                saveJsonFile(ARQUIVO_CUPONS, couponData);
                await sendMessage(sock, userJid, { text: `✅ Cupom *${data.name}* criado com sucesso!` });
                await sendManageDiscountsMenu(sock, userJid);
            } else if (step === 'awaiting_ticket_type_choice') {
                // Suporta lista interativa e modo legacy
                if (messageText === 'ticket_variable' || messageText === '1') {
                    await sendTicketManagementList(sock, userJid, 'variable_purchase');
                } else if (messageText === 'ticket_support' || messageText === '2') {
                    await sendTicketManagementList(sock, userJid, 'support');
                } else if (messageText === 'ticket_withdraw' || messageText === '3') {
                    await sendTicketManagementList(sock, userJid, 'payout');
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === 'awaiting_ticket_to_close_choice') {
                const { ticketType, filteredTickets } = data;
                const choice = messageText.trim().toUpperCase();

                if (choice === 'X') {
                    let closedCount = 0;
                    for (const ticket of filteredTickets) {
                        const closed = await closeTicket(sock, ticket, userJid);
                        if (closed) closedCount++;
                    }
                    await sendMessage(sock, userJid, { text: `✅ *${closedCount}* tickets foram finalizados com sucesso.` });
                    await sendTicketTypeMenu(sock, userJid);
                } else {
                    const ticketIndex = parseInt(choice) - 1;
                    if (!isNaN(ticketIndex) && ticketIndex >= 0 && ticketIndex < filteredTickets.length) {
                        const ticketToClose = filteredTickets[ticketIndex];
                        if (ticketType === 'payout') {
                            await sendMessage(sock, userJid, { text: `Você confirma que o pagamento para *${ticketToClose.clientName}* foi realizado?\n\n*1* - Sim, confirmo\n*2* - Não` });
                            navigateTo(userJid, 'awaiting_payout_confirmation', { ticketToClose });
                        } else {
                            const closed = await closeTicket(sock, ticketToClose, userJid);
                            if (closed) {
                                await sendMessage(sock, userJid, { text: `✅ Ticket de *${ticketToClose.clientName}* finalizado com sucesso.` });
                            } else {
                                await sendMessage(sock, userJid, { text: `❌ Erro ao finalizar o ticket. Pode já ter sido finalizado.` });
                            }
                            await sendTicketManagementList(sock, userJid, ticketType);
                        }
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, ['X', '0'].concat(filteredTickets.map((_, i) => `${i + 1}`)));
                    }
                }
            } else if (step === 'awaiting_payout_confirmation') {
                const { ticketToClose } = data;
                if (messageText === '1') {
                    const sellerJid = ticketToClose.clientJid;
                    if (compradoresData[sellerJid]) {
                        compradoresData[sellerJid].caixa = 0;
                        saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                    }
                    const closed = await closeTicket(sock, ticketToClose, userJid, true);
                    if (closed) {
                        await sendMessage(sock, userJid, { text: `✅ Saque para *${ticketToClose.clientName}* confirmado e ticket finalizado.` });
                    }
                    await sendTicketTypeMenu(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "Operação cancelada." });
                    await sendTicketTypeMenu(sock, userJid);
                }
            } else if (step === "awaiting_manage_admins_choice") {
                if (!isOwner) {
                    await sendMessage(sock, userJid, { text: "🚫 Apenas o *Dono* pode gerenciar administradores." });
                    await sendTeamManagementMenu(sock, userJid);
                    return;
                }
                // Suporta lista interativa e modo legacy
                if (messageText === "admin_add" || messageText === "1") {
                    await sendAddAdminPrompt(sock, userJid);
                } else if (messageText === "admin_remove" || messageText === "2") {
                    await sendRemoveAdminPrompt(sock, userJid);
                } else if (messageText.toLowerCase() === 'x') {
                    for (const adminJid in adminData) {
                        adminData[adminJid].atendimentos = 0;
                        adminData[adminJid].totalOnlineTime = 0;
                        adminData[adminJid].onlineSince = null;
                    }
                    saveJsonFile(ARQUIVO_ADMINS, adminData);
                    await sendMessage(sock, userJid, { text: "✅ As estatísticas de todos os administradores foram resetadas." });
                    await sendManageAdminsMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', 'X', '0']);
                }
            } else if (step === "awaiting_new_admin_number") {
                if (!isOwner) return;
                const phoneNumber = messageText.replace(/\D/g, '');
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido. Por favor, envie o número com DDI e DDD (ex: 5511912345678)." });
                    return;
                }
                const newAdminJid = `${phoneNumber}@s.whatsapp.net`;
                if (adminData[newAdminJid]) {
                    await sendMessage(sock, userJid, { text: "⚠️ Este número já está cadastrado como Administrador." });
                    await sendManageAdminsMenu(sock, userJid);
                    return;
                }
                adminData[newAdminJid] = { atendimentos: 0, status: 'off', onlineSince: null, totalOnlineTime: 0, ganhosTotais: 0, caixa: 0, caixaBloqueado: 0, pixKeys: [], notificacoes: { idcheck: true, suporte: true, mensagemCompradores: true, saques: true, novosPedidos: true, novosProdutos: true, atendimentoIniciado: true, compraFinalizada: true, verificacaoConta: true } };
                saveJsonFile(ARQUIVO_ADMINS, adminData);
                await sendMessage(sock, userJid, { text: `✅ Administrador *${newAdminJid.split("@")[0]}* adicionado com sucesso!` });
                await sendManageAdminsMenu(sock, userJid);
            } else if (step === "awaiting_admin_to_remove_choice") {
                if (!isOwner) return;
                const adminIndex = parseInt(messageText) - 1;
                const adminsArray = data.admins;
                if (isNaN(adminIndex) || adminIndex < 0 || adminIndex >= adminsArray.length) {
                    await sendInvalidOptionMessage(sock, userJid, adminsArray.map((_, i) => `${i + 1}`).concat('0'));
                    return;
                }
                const adminJidToRemove = adminsArray[adminIndex];
                delete adminData[adminJidToRemove];
                saveJsonFile(ARQUIVO_ADMINS, adminData);
                await sendMessage(sock, userJid, { text: `✅ Administrador *${adminJidToRemove.split("@")[0]}* removido com sucesso!` });
                await sendManageAdminsMenu(sock, userJid);
            } else if (step === "awaiting_manage_compradores_choice") {
                if (!isAdmin) {
                    await sendMessage(sock, userJid, { text: "🚫 Apenas Administradores podem gerenciar Compradores." });
                    await sendTeamManagementMenu(sock, userJid);
                    return;
                }
                // MODO LEGACY: messageText removido - usa apenas messageText
                if (messageText === "1" || messageText === "manage_compradores_1") {
                    await sendAddCompradorPrompt(sock, userJid);
                } else if (messageText === "2" || messageText === "manage_compradores_2") {
                    await sendRemoveCompradorPrompt(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === "awaiting_new_comprador_number") {
                if (!isAdmin) return;
                const phoneNumber = messageText.replace(/\D/g, '');
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido. Por favor, envie o número com DDI e DDD (ex: 5511912345678)." });
                    return;
                }
                const newCompradorJid = `${phoneNumber}@s.whatsapp.net`;
                if (compradoresData[newCompradorJid]) {
                    await sendMessage(sock, userJid, { text: "⚠️ Este número já está cadastrado como Comprador." });
                    await sendManageCompradoresMenu(sock, userJid);
                    return;
                }
                compradoresData[newCompradorJid] = { vendas: 0, ganhosTotais: 0, caixa: 0, pixKeys: [], notificacoes: false, notificacoes_config: {} };
                saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                if (!userData[newCompradorJid]) {
                    userData[newCompradorJid] = { nome: newCompradorJid.split('@')[0], status: 'comprador' };
                } else {
                    userData[newCompradorJid].status = 'comprador';
                }
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await sendMessage(sock, userJid, { text: `✅ Comprador *${newCompradorJid.split("@")[0]}* adicionado com sucesso!` });
                await sendManageCompradoresMenu(sock, userJid);
            } else if (step === "awaiting_comprador_to_remove_choice") {
                if (!isAdmin) return;
                const compradoresArray = data.compradores;
                // MODO LEGACY: messageText removido - usa apenas messageText

                let compradorIndex = -1;
                if (messageText && messageText.startsWith('remove_comprador_')) {
                    compradorIndex = parseInt(messageText.replace('remove_comprador_', '')) - 1;
                } else {
                    compradorIndex = parseInt(messageText) - 1;
                }

                if (isNaN(compradorIndex) || compradorIndex < 0 || compradorIndex >= compradoresArray.length) {
                    await sendInvalidOptionMessage(sock, userJid, compradoresArray.map((_, i) => `${i + 1}`).concat('0'));
                    return;
                }
                const compradorJidToRemove = compradoresArray[compradorIndex];
                await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o comprador *${userData[compradorJidToRemove]?.nome || compradorJidToRemove.split('@')[0]}*?\n\n*1* - Sim\n*2* - Não` });
                navigateTo(userJid, "awaiting_comprador_removal_confirmation", { compradorJidToRemove });
            } else if (step === "awaiting_comprador_removal_confirmation") {
                const { compradorJidToRemove } = data;
                if (messageText === '1') {
                    delete compradoresData[compradorJidToRemove];
                    saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);

                    if (userData[compradorJidToRemove]) {
                        userData[compradorJidToRemove].status = 'navegando';
                        saveJsonFile(ARQUIVO_USUARIOS, userData);
                    }

                    await sendMessage(sock, userJid, { text: `✅ Comprador *${compradorJidToRemove.split("@")[0]}* removido com sucesso!` });
                    await sendManageCompradoresMenu(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "Remoção cancelada." });
                    await sendManageCompradoresMenu(sock, userJid);
                }
            } else if (step === "awaiting_manage_product_managers_choice") {
                if (!isAdmin) return;
                // MODO LEGACY: messageText removido - usa apenas messageText
                if (messageText === "1" || messageText === "manage_product_managers_1") {
                    await sendAddProductManagerPrompt(sock, userJid);
                } else if (messageText === "2" || messageText === "manage_product_managers_2") {
                    await sendRemoveProductManagerPrompt(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === "awaiting_new_product_manager_number") {
                if (!isAdmin) return;
                const phoneNumber = messageText.replace(/\D/g, '');
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido. Por favor, envie o número com DDI e DDD (ex: 5511912345678)." });
                    return;
                }
                const newManagerJid = `${phoneNumber}@s.whatsapp.net`;
                if (productManagerData[newManagerJid]) {
                    await sendMessage(sock, userJid, { text: "⚠️ Este número já está cadastrado como Gerenciador." });
                    await sendManageProductManagersMenu(sock, userJid);
                    return;
                }
                productManagerData[newManagerJid] = { ganhosTotais: 0, caixa: 0, caixaBloqueado: 0, pixKeys: [], ofertasAdicionadas: 0 };
                saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                if (!userData[newManagerJid]) {
                    userData[newManagerJid] = { nome: newManagerJid.split('@')[0], status: 'comprador' };
                } else {
                    userData[newManagerJid].status = 'comprador';
                }
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await sendMessage(sock, userJid, { text: `✅ Gerenciador de Produto *${newManagerJid.split("@")[0]}* adicionado com sucesso!` });
                await sendManageProductManagersMenu(sock, userJid);
            } else if (step === "awaiting_product_manager_to_remove_choice") {
                if (!isAdmin) return;
                const managersArray = data.managers;
                // MODO LEGACY: messageText removido - usa apenas messageText

                let managerIndex = -1;
                if (messageText && messageText.startsWith('remove_product_manager_')) {
                    managerIndex = parseInt(messageText.replace('remove_product_manager_', '')) - 1;
                } else {
                    managerIndex = parseInt(messageText) - 1;
                }

                if (isNaN(managerIndex) || managerIndex < 0 || managerIndex >= managersArray.length) {
                    await sendInvalidOptionMessage(sock, userJid, managersArray.map((_, i) => `${i + 1}`).concat('0'));
                    return;
                }
                const managerJidToRemove = managersArray[managerIndex];
                await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o gerenciador *${userData[managerJidToRemove]?.nome || managerJidToRemove.split('@')[0]}*?\n\n*1* - Sim\n*2* - Não` });
                navigateTo(userJid, "awaiting_product_manager_removal_confirmation", { managerJidToRemove });
            } else if (step === "awaiting_product_manager_removal_confirmation") {
                const { managerJidToRemove } = data;
                if (messageText === '1') {
                    delete productManagerData[managerJidToRemove];
                    saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);

                    if (userData[managerJidToRemove]) {
                        userData[managerJidToRemove].status = 'navegando';
                        saveJsonFile(ARQUIVO_USUARIOS, userData);
                    }
                    await sendMessage(sock, userJid, { text: `✅ Gerenciador *${managerJidToRemove.split("@")[0]}* removido com sucesso!` });
                    await sendManageProductManagersMenu(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "Remoção cancelada." });
                    await sendManageProductManagersMenu(sock, userJid);
                }
            } else if (step === "awaiting_menu_choice") {
                // Aceita tanto rowId da lista quanto número tradicional
                if (messageText === "1" || messageText === "menu_profile") {
                    if (userData[userJid]) {
                        await sendProfileView(sock, userJid);
                    } else {
                        await sendMessage(sock, userJid, { text: "Você ainda não tem um perfil. 📝 Digite */p* para se cadastrar." });
                        delete userState[userJid];
                    }
                } else if (messageText === "2" || messageText === "menu_buy") {
                    await sendBuyMenu(sock, userJid);
                } else if (messageText === "3" || messageText === "menu_support") {
                    await sendSupportMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === "awaiting_profile_choice") {
                const canUseInvite = !userData[userJid].compras || userData[userJid].compras === 0;
                let validOptions = ['1', '2', '3', '0'];
                if (canUseInvite) { validOptions.push('4', '5'); } else { validOptions.push('4'); }

                // Aceita tanto rowId da lista quanto número tradicional
                if (messageText === "1" || messageText === "profile_edit") {
                    await sendEditProfileMenu(sock, userJid);
                } else if (messageText === "2" || messageText === "profile_history") {
                    await sendPurchaseHistory(sock, userJid);
                } else if (messageText === "3" || messageText === "profile_accounts") {
                    await sendGameAccountManagementMenu(sock, userJid);
                } else if ((messageText === "4" && canUseInvite) || messageText === "profile_invite") {
                    await sendMessage(sock, userJid, { text: "Por favor, digite o código de convite que você recebeu:" });
                    navigateTo(userJid, 'awaiting_invite_code_from_profile');
                } else if ((messageText === "5" && canUseInvite) || (messageText === "4" && !canUseInvite) || messageText === "profile_language") {
                    await sendLanguageSelectionList(sock, userJid);
                    navigateTo(userJid, 'awaiting_language_choice');
                } else {
                    await sendInvalidOptionMessage(sock, userJid, validOptions);
                }
            } else if (step === 'awaiting_invite_code_from_profile') {
                const code = messageText.toUpperCase();
                if (invitationData[code] && invitationData[code].ownerJid !== userJid) {
                    const inviterJid = invitationData[code].ownerJid;
                    const inviterName = invitationData[code].ownerName;

                    userData[userJid].hasInviteDiscount = true;
                    userData[userJid].invitedBy = code;
                    saveJsonFile(ARQUIVO_USUARIOS, userData);

                    invitationData[code].uses = (invitationData[code].uses || 0) + 1;
                    invitationData[code].invitedUsers[userJid] = { registeredAt: new Date().toISOString(), completedPurchase: false };
                    saveJsonFile(ARQUIVO_CONVITES, invitationData);

                    await sendMessage(sock, userJid, { text: `✅ Código de *${inviterName}* aplicado! Você ganhará 5% de desconto na sua primeira compra.` });
                    await sendMessage(sock, inviterJid, { text: `Boas notícias! ✨ O usuário *${userData[userJid].nome}* usou seu código de convite! Você receberá sua recompensa assim que ele realizar a primeira compra.` });
                    await sendProfileView(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "Código inválido ou é o seu próprio código! Tente novamente ou digite *0* para voltar." });
                }
            } else if (step === 'awaiting_history_choice') {
                const { userHistory } = data;
                let selectedIndex = -1;

                // Verifica se é resposta de lista interativa ou número tradicional
                if (messageText.startsWith('history_order_')) {
                    selectedIndex = parseInt(messageText.replace('history_order_', ''));
                } else {
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= userHistory.length) {
                        selectedIndex = choice - 1;
                    }
                }

                if (selectedIndex >= 0 && selectedIndex < userHistory.length) {
                    const selectedOrder = userHistory[selectedIndex];
                    await sendOrderDetailsView(sock, userJid, selectedOrder);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, userHistory.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === 'awaiting_order_details_action') {
                // Handler para quando usuário está vendo detalhes de um pedido
                // Por enquanto, apenas "0" para voltar ao histórico
                if (messageText === '0') {
                    await sendPurchaseHistory(sock, userJid);
                }
            } else if (step === 'awaiting_add_first_game_account_choice') {
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Para adicionar sua conta de jogo, por favor, digite um *apelido* para ela (ex: Conta Principal):" });
                    navigateTo(userJid, "awaiting_game_account_alias");
                } else {
                    await sendProfileView(sock, userJid);
                }
            } else if (step === 'awaiting_game_account_management_choice') {
                const { savedAccounts } = data;

                let accountIndex = -1;

                // Verifica se é resposta de lista interativa ou número tradicional
                if (messageText.startsWith('account_manage_')) {
                    accountIndex = parseInt(messageText.replace('account_manage_', ''));
                } else if (messageText === 'account_add_new') {
                    // Usuário selecionou adicionar nova conta
                    await sendMessage(sock, userJid, { text: "Para adicionar uma nova conta de jogo, por favor, digite um *apelido* para ela (ex: Conta Secundária):" });
                    navigateTo(userJid, "awaiting_game_account_alias");
                    return;
                } else {
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= savedAccounts.length) {
                        accountIndex = choice - 1;
                    } else if (choice === savedAccounts.length + 1) {
                        await sendMessage(sock, userJid, { text: "Para adicionar uma nova conta de jogo, por favor, digite um *apelido* para ela (ex: Conta Secundária):" });
                        navigateTo(userJid, "awaiting_game_account_alias");
                        return;
                    }
                }

                if (accountIndex >= 0 && accountIndex < savedAccounts.length) {
                    const selectedAccount = savedAccounts[accountIndex];
                    let menuText = `Gerenciando a conta *${selectedAccount.alias}* (${selectedAccount.login})\n\n`;

                    if (selectedAccount.verified) {
                        menuText += "✅ Esta conta já está verificada!\n\n";
                    } else if (selectedAccount.verificationStatus === 'pending') {
                        menuText += "⏳ Sua solicitação de verificação está em análise.\n\n";
                    } else {
                        menuText += "Contas verificadas têm acesso a cupons, sorteios e prioridade na fila de atendimento!\n\n";
                    }

                    menuText += `*O que deseja fazer?*\n\n`;
                    if (!selectedAccount.verified && selectedAccount.verificationStatus !== 'pending') {
                        menuText += `1️⃣ ✅ Solicitar Verificação\n`;
                    }
                    menuText += `2️⃣ ✏️ Editar\n`;
                    menuText += `3️⃣ 🗑️ Remover\n\n`;
                    menuText += `0️⃣ ↩️ Voltar`;
                    await sendMessage(sock, userJid, { text: menuText });
                    navigateTo(userJid, "awaiting_specific_game_account_action", { accountIndex });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, savedAccounts.map((_, i) => `${i + 1}`).concat(`${savedAccounts.length + 1}`, '0'));
                }
            } else if (step === 'awaiting_specific_game_account_action') {
                const { accountIndex } = data;
                const account = userData[userJid].savedAccounts[accountIndex];
                const choice = messageText;

                let action = null;
                let validOptions = ['2', '3', '0'];
                if (!account.verified && account.verificationStatus !== 'pending') {
                    if (choice === '1') action = 'verify';
                    validOptions.unshift('1');
                }
                if (choice === '2') action = 'edit';
                if (choice === '3') action = 'remove';


                if (action === 'verify') {
                    await sendVerificationMainMenu(sock, userJid, accountIndex);
                } else if (action === 'edit') {
                    await sendMessage(sock, userJid, { text: "Ok, vamos editar. Por favor, digite o novo *apelido* para esta conta:" });
                    navigateTo(userJid, "awaiting_game_account_alias_edit", { accountIndex });
                } else if (action === 'remove') {
                    userData[userJid].savedAccounts.splice(accountIndex, 1);
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    await sendMessage(sock, userJid, { text: "✅ Conta removida com sucesso!" });
                    await sendProfileView(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, validOptions);
                }
            } else if (step === 'awaiting_game_account_alias_edit') {
                const alias = messageText;
                await sendMessage(sock, userJid, { text: `Novo apelido: *${alias}*. Agora, digite o novo *login* (email/número) da conta:` });
                navigateTo(userJid, "awaiting_game_account_login_edit", { ...data, alias });
            } else if (step === 'awaiting_game_account_login_edit') {
                const login = messageText;
                await sendMessage(sock, userJid, { text: `Novo login: *${login}*. Agora, digite a nova *senha* da conta:` });
                navigateTo(userJid, "awaiting_game_account_password_edit", { ...data, login });
            } else if (step === 'awaiting_game_account_password_edit') {
                const password = messageText;
                await sendMessage(sock, userJid, { text: `Nova senha definida. Agora, por favor, digite o *ID da sua conta do jogo*.` });
                navigateTo(userJid, "awaiting_game_account_gameid_edit", { ...data, password });
            } else if (step === 'awaiting_game_account_gameid_edit') {
                const gameId = messageText;
                const { accountIndex, alias, login, password } = data;
                const isVerified = userData[userJid].savedAccounts[accountIndex].verified;

                const newAccountData = { alias, login, password, gameId };

                if (isVerified) {
                    await sendMessage(sock, userJid, { text: `⚠️ Sua conta é verificada. Ao alterar os dados, ela perderá a verificação e você precisará solicitá-la novamente. Deseja mesmo continuar?\n\n*1* - Sim, continuar\n*2* - Não, cancelar` });
                    navigateTo(userJid, "awaiting_verified_account_edit_confirmation", { accountIndex, newAccountData });
                } else {
                    userData[userJid].savedAccounts[accountIndex] = { ...newAccountData, verified: false, verificationStatus: 'none' };
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    // Atualiza pedidos pendentes
                    [...pendingOrders, ...pendingOrdersV, ...waitingOrders].forEach(order => {
                        if (order.clientJid === userJid && order.facebookLogin === userData[userJid].savedAccounts[accountIndex].login) {
                            order.facebookLogin = login;
                            order.facebookPassword = password;
                            order.dragonCityId = gameId;
                        }
                    });
                    saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
                    saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
                    saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
                    await sendMessage(sock, userJid, { text: `✅ Conta *${alias}* atualizada com sucesso!` });
                    await sendProfileView(sock, userJid);
                }
            } else if (step === 'awaiting_verified_account_edit_confirmation') {
                const { accountIndex, newAccountData } = data;
                if (messageText === '1') {
                    userData[userJid].savedAccounts[accountIndex] = { ...newAccountData, verified: false, verificationStatus: 'none' };
                    // Atualiza pedidos pendentes
                    [...pendingOrders, ...pendingOrdersV, ...waitingOrders].forEach(order => {
                        if (order.clientJid === userJid && order.facebookLogin === userData[userJid].savedAccounts[accountIndex].login) {
                            order.facebookLogin = newAccountData.login;
                            order.facebookPassword = newAccountData.password;
                            order.dragonCityId = newAccountData.gameId;
                        }
                    });
                    saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
                    saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
                    saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    await sendMessage(sock, userJid, { text: `✅ Conta *${newAccountData.alias}* atualizada com sucesso e a verificação foi removida.` });
                    await sendProfileView(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "Edição cancelada." });
                    await sendGameAccountManagementMenu(sock, userJid);
                }

            } else if (step === 'awaiting_history_choice') {
                const { userHistory } = data;
                const choice = parseInt(messageText);
                if (!isNaN(choice) && choice > 0 && choice <= userHistory.length) {
                    const selectedOrder = userHistory[choice - 1];
                    await sendOrderDetailsView(sock, userJid, selectedOrder);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, userHistory.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === 'awaiting_order_details_action') {
                // Nenhuma ação aqui, exceto voltar, que já é tratado.
                await sendInvalidOptionMessage(sock, userJid, ['0']);
            } else if (step === "awaiting_game_account_alias") {
                await sendMessage(sock, userJid, { text: `Apelido: *${messageText}*. Agora, por favor, nos informe o *e-mail ou número* da sua conta do Facebook. 📲` });
                navigateTo(userJid, "awaiting_game_account_login", { alias: messageText });
            } else if (step === "awaiting_game_account_login") {
                const login = messageText;
                await sendMessage(sock, userJid, { text: "Ótimo! Agora, por favor, informe a *senha* da sua conta do Facebook. 🔑" });
                navigateTo(userJid, "awaiting_game_account_password", { ...data, login });
            } else if (step === "awaiting_game_account_password") {
                const password = messageText;
                await sendMessage(sock, userJid, { text: "Perfeito! Para finalizar, por favor, informe o *ID da sua conta do jogo*. 🆔" });
                navigateTo(userJid, "awaiting_game_account_gameid", { ...data, password });
            } else if (step === "awaiting_game_account_gameid") {
                const gameId = messageText;
                const { alias, login, password } = data;
                if (!userData[userJid].savedAccounts) {
                    userData[userJid].savedAccounts = [];
                }
                const accountIndex = userData[userJid].savedAccounts.length;
                userData[userJid].savedAccounts.push({ alias, login, password, gameId, verified: false });
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await sendMessage(sock, userJid, { text: `✅ Conta *${alias}* salva com sucesso!\n\nDeseja solicitar a verificação para esta conta agora?\n\n*Digite:*\n1️⃣ - Sim, solicitar verificação\n2️⃣ - Não, voltar ao perfil` });
                navigateTo(userJid, 'awaiting_verification_after_save', { accountIndex });
            } else if (step === 'awaiting_verification_after_save') {
                const { accountIndex } = data;
                if (messageText === '1') {
                    await sendVerificationMainMenu(sock, userJid, accountIndex);
                } else {
                    await sendProfileView(sock, userJid);
                }
            } else if (step === "awaiting_buy_choice") {
                // Aceita tanto rowId da lista quanto número tradicional
                if (messageText === "1" || messageText === "buy_offers") {
                    await sendOfferSections(sock, userJid);
                } else if (messageText === "2" || messageText === "buy_spheres") {
                    await sendSphereSections(sock, userJid);
                } else if (messageText === "3" || messageText === "buy_accounts") {
                    await sendAccountList(sock, userJid);
                } else if (messageText === "4" || messageText === "buy_cart") {
                    await sendCartView(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
                }
            } else if (step === "awaiting_offer_section_choice") {
                const sections = data.sections;

                // Suporta tanto lista interativa (rowId) quanto modo legacy (número)
                if (messageText.startsWith('offer_section_')) {
                    // Lista interativa: extrai o índice do rowId
                    const index = parseInt(messageText.replace('offer_section_', ''));
                    if (!isNaN(index) && index >= 0 && index < sections.length) {
                        const selectedSection = sections[index];
                        await sendOfferList(sock, userJid, selectedSection);
                    }
                } else {
                    // Modo legacy: número digitado
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= sections.length) {
                        const selectedSection = sections[choice - 1];
                        await sendOfferList(sock, userJid, selectedSection);
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, sections.map((_, i) => `${i + 1}`).concat('0'));
                    }
                }
            } else if (step === "awaiting_sphere_section_choice") {
                const sections = data.sections;

                // Suporta tanto lista interativa (rowId) quanto modo legacy (número)
                if (messageText.startsWith('sphere_section_')) {
                    // Lista interativa: extrai o índice do rowId
                    const index = parseInt(messageText.replace('sphere_section_', ''));
                    if (!isNaN(index) && index >= 0 && index < sections.length) {
                        const selectedSection = sections[index];
                        await sendSphereList(sock, userJid, selectedSection);
                    }
                } else {
                    // Modo legacy: número digitado
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= sections.length) {
                        const selectedSection = sections[choice - 1];
                        await sendSphereList(sock, userJid, selectedSection);
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, sections.map((_, i) => `${i + 1}`).concat('0'));
                    }
                }
            } else if (step === "awaiting_offer_choice") {
                // Suporta tanto lista interativa (rowId) quanto modo legacy (número)
                let selectedItem = null;

                if (messageText.startsWith('offer_item_')) {
                    // Lista interativa: extrai o índice do rowId
                    const index = parseInt(messageText.replace('offer_item_', ''));
                    if (!isNaN(index) && index >= 0 && index < data.menuItems.length) {
                        selectedItem = data.menuItems[index];
                    }
                } else {
                    // Modo legacy: número digitado
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= data.menuItems.length) {
                        selectedItem = data.menuItems[choice - 1];
                    }
                }

                if (selectedItem) {
                    if (selectedItem.type === 'dir') {
                        await sendOfferList(sock, userJid, selectedItem.path);
                    } else if (selectedItem.type === 'product') {
                        const product = selectedItem.data;
                        if (product.isVariable) {
                            await sendMessage(sock, userJid, { text: `Deseja mesmo abrir um ticket de suporte a respeito dessa oferta?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
                            navigateTo(userJid, "awaiting_variable_product_ticket_confirmation", { product });
                        } else {
                            await sendOfferDetails(sock, userJid, product, data.sectionPath);
                        }
                    }
                } else if (!messageText.startsWith('offer_item_')) {
                    // Só mostra mensagem de opção inválida no modo legacy
                    await sendInvalidOptionMessage(sock, userJid, data.menuItems.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === "awaiting_sphere_choice") {
                // Suporta tanto lista interativa (rowId) quanto modo legacy (número)
                let selectedItem = null;

                if (messageText.startsWith('sphere_item_')) {
                    // Lista interativa: extrai o índice do rowId
                    const index = parseInt(messageText.replace('sphere_item_', ''));
                    if (!isNaN(index) && index >= 0 && index < data.menuItems.length) {
                        selectedItem = data.menuItems[index];
                    }
                } else {
                    // Modo legacy: número digitado
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= data.menuItems.length) {
                        selectedItem = data.menuItems[choice - 1];
                    }
                }

                if (selectedItem) {
                    if (selectedItem.type === 'dir') {
                        await sendSphereList(sock, userJid, selectedItem.path);
                    } else if (selectedItem.type === 'product') {
                        const product = selectedItem.data;
                        if (product.sobEncomenda) {
                            await sendMessage(sock, userJid, { text: `Deseja mesmo abrir um ticket de suporte a respeito dessas esferas?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
                            navigateTo(userJid, "awaiting_variable_product_ticket_confirmation", { product });
                        } else {
                            await askForSphereQuantity(sock, userJid, product, data.sectionPath);
                        }
                    }
                } else if (!messageText.startsWith('sphere_item_')) {
                    // Só mostra mensagem de opção inválida no modo legacy
                    await sendInvalidOptionMessage(sock, userJid, data.menuItems.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === "awaiting_sphere_quantity") {
                const { product, sectionPath } = data;

                // Permite voltar com "0"
                if (messageText === "0") {
                    await sendSphereList(sock, userJid, sectionPath);
                    return;
                }

                const quantity = parseInt(messageText);
                const minQuantity = Math.ceil(100 / product.tradeRatio) * product.tradeRatio;

                if (isNaN(quantity)) {
                    await sendMessage(sock, userJid, { text: "❌ Por favor, digite um número válido." });
                    await askForSphereQuantity(sock, userJid, product, sectionPath);
                    return;
                }

                if (quantity < minQuantity) {
                    await sendMessage(sock, userJid, { text: `❌ A quantidade mínima é de *${minQuantity}* esferas.` });
                    await askForSphereQuantity(sock, userJid, product, sectionPath);
                    return;
                }

                if (quantity % product.tradeRatio !== 0) {
                    await sendMessage(sock, userJid, { text: `❌ A quantidade deve ser um múltiplo de *${product.tradeRatio}* esferas.` });
                    await askForSphereQuantity(sock, userJid, product, sectionPath);
                    return;
                }

                const numTrades = quantity / product.tradeRatio;
                const totalPrice = numTrades * product.price;

                await sendSpherePurchaseDetails(sock, userJid, product, quantity, numTrades, totalPrice, sectionPath);
            } else if (step === "awaiting_variable_product_ticket_confirmation") {
                const { product } = data;
                if (messageText === '1') {
                    const isSphere = product.rarity; // Heurística para saber se é esfera
                    const ticketText = `Tenho interesse no produto variável: ${product.name}. Aguardo o contato de um atendente.`;
                    const newTicket = { clientJid: userJid, clientName: userData[userJid]?.nome, ticketText, timestamp: new Date().toISOString(), notificationKeys: [] };
                    openTickets.push(newTicket);
                    saveJsonFile(ARQUIVO_TICKETS, openTickets);

                    await sendMessage(sock, userJid, { text: "✅ Sua solicitação foi enviada! Um de nossos atendentes entrará em contato em breve para te ajudar com este produto. 😊" });
                    userData[userJid].status = "em_atendimento";
                    saveJsonFile(ARQUIVO_USUARIOS, userData);

                    const adminJids = Object.keys(adminData);
                    if (adminJids.length > 0) {
                        const notificationText = `🚨 *NOVO TICKET (COMPRA VARIÁVEL)* 🚨\n\n*Cliente:* ${newTicket.clientName}\n*Contato:* https://wa.me/${userJid.split("@")[0]}\n*Produto:* _"${product.name}"_\n\nPara finalizar, responda a esta mensagem com */f* ou use o painel de admin.`;
                        for (const adminJid of adminJids) {
                            if (adminData[adminJid].notificacoes?.suporte) {
                                try {
                                    const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                                    if (sentMsg?.key) newTicket.notificationKeys.push(sentMsg.key);
                                } catch (e) {
                                    console.error(`Falha ao notificar admin ${adminJid}`);
                                }
                            }
                        }
                        saveJsonFile(ARQUIVO_TICKETS, openTickets);
                    }
                    delete userState[userJid];
                } else {
                    await sendMessage(sock, userJid, { text: "Ok, retornando à lista." });
                    const previousState = await goBack(sock, userJid);
                    if (previousState) {
                        if (previousState.step === 'awaiting_sphere_choice') {
                            await sendSphereList(sock, userJid, previousState.data.sectionPath);
                        } else {
                            await sendOfferList(sock, userJid, previousState.data.sectionPath);
                        }
                    }
                }
            } else if (step === "awaiting_sphere_purchase_confirmation") {
                const { product, totalSpheres, numTrades, totalPrice, sectionPath } = data;
                if (messageText === "1") {
                    // Confirmar e adicionar ao carrinho
                    const cartProduct = {
                        ...product,
                        type: 'esfera',
                        quantity: totalSpheres,
                        numTrades: numTrades,
                        finalPrice: totalPrice,
                        sectionPath: sectionPath
                    };
                    if (!cartData[userJid] || !cartData[userJid].items) {
                        cartData[userJid] = { id: generateOrderId(), items: [], appliedCoupon: null };
                    }
                    cartData[userJid].items.push(cartProduct);
                    saveJsonFile(ARQUIVO_CARRINHOS, cartData);
                    await sendMessage(sock, userJid, {
                        text: `✅ *${totalSpheres} Esferas de ${product.name}* foram adicionadas ao seu carrinho!`,
                    });
                    delete userState[userJid];
                    await sendCartView(sock, userJid);
                } else if (messageText === "2") {
                    // Alterar quantidade
                    await askForSphereQuantity(sock, userJid, product, sectionPath);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === "awaiting_account_choice") {
                const { accounts } = data;
                // MODO LEGACY: messageText removido - usa apenas messageText

                let accountIndex = -1;
                if (messageText && messageText.startsWith('account_')) {
                    accountIndex = parseInt(messageText.replace('account_', '')) - 1;
                } else {
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= accounts.length) {
                        accountIndex = choice - 1;
                    }
                }

                if (accountIndex >= 0 && accountIndex < accounts.length) {
                    const selectedAccount = accounts[accountIndex];
                    await sendAccountDetails(sock, userJid, selectedAccount);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, accounts.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === "awaiting_add_to_cart_confirmation") {
                // MODO LEGACY: messageText removido - usa apenas messageText
                if (messageText === "1" || messageText === "account_add_cart_1") {
                    const product = data.product;
                    if (!cartData[userJid] || !cartData[userJid].items) {
                        cartData[userJid] = { id: generateOrderId(), items: [], appliedCoupon: null };
                    }
                    cartData[userJid].items.push(product);
                    saveJsonFile(ARQUIVO_CARRINHOS, cartData);
                    await sendMessage(sock, userJid, {
                        text: `✅ *${product.name}* foi adicionado ao seu carrinho!`,
                    });
                    delete userState[userJid];
                    await sendCartView(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
                }
                //[FIM DA PARTE 2]
                //[INÍCIO DA PARTE 3]
            } else if (step === "awaiting_cart_action") {
                if (messageText === "1" || messageText === "cart_checkout") {
                    const termsText = "Esteja ciente que o processo de entrega dos pedidos requer uma conta do jogo vinculada a uma conta do Facebook. Caso sua conta não esteja logada, logue, e caso não apareça uma opção de logar via Facebook, fale com o suporte do jogo para resolver o problema.\n\nPara prosseguir, você deve concordar com nossos Termos de Serviço. Ao continuar, você confirma que leu e aceitou os termos. 📝\n\nLeia em: https://bit.ly/TermosPS\n\n*Digite:*\n1️⃣ Concordo e desejo continuar\n0️⃣ Voltar ao carrinho";
                    await sendMessage(sock, userJid, { text: termsText });
                    navigateTo(userJid, 'awaiting_terms_confirmation', data);
                } else if (messageText === "2" || messageText === "cart_coupon") {
                    const user = userData[userJid];
                    const hasVerifiedAccount = user.savedAccounts && user.savedAccounts.some(acc => acc.verified);
                    if (!hasVerifiedAccount) {
                        await sendMessage(sock, userJid, { text: "⚠️ Apenas clientes com contas verificadas podem usar cupons. Por favor, verifique uma de suas contas de jogo no seu perfil para desbloquear esta funcionalidade." });
                        return;
                    }
                    await sendMessage(sock, userJid, { text: "🎟️ Por favor, digite o código do cupom que deseja usar:" });
                    navigateTo(userJid, 'awaiting_coupon_code');
                } else if (messageText === "3" || messageText === "cart_clear") {
                    cartData[userJid] = { id: cartData[userJid].id, items: [], appliedCoupon: null }; // Mantém o ID
                    saveJsonFile(ARQUIVO_CARRINHOS, cartData);
                    await sendMessage(sock, userJid, {
                        text: "🛒 Seu carrinho foi esvaziado com sucesso! ✅",
                    });
                    delete userState[userJid];
                    await sendBuyMenu(sock, userJid);
                } else if (messageText === '4' || messageText === "cart_powerpoints") {
                    await sendCartViewWithPowerPoints(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
                }
            } else if (step === 'awaiting_powerpoint_purchase_confirmation') {
                const { totalInPP, hasEnoughPoints } = data;
                // Suporta lista interativa e modo legacy
                if ((messageText === 'pp_checkout' || messageText === '1') && hasEnoughPoints) {
                    await handlePowerPointsPayment(sock, userJid, totalInPP);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, hasEnoughPoints ? ['1', '0'] : ['0']);
                }
            } else if (step === 'awaiting_coupon_code') {
                const code = messageText.toUpperCase();
                const userCartData = cartData[userJid] || { items: [], appliedCoupon: null };
                if (messageText === '0') {
                    await sendCartView(sock, userJid);
                    return;
                }

                const coupon = couponData[code];
                if (coupon) {
                    if (coupon.limit && (coupon.uses || 0) >= coupon.limit) {
                        await sendMessage(sock, userJid, { text: "😔 Este cupom já atingiu seu limite de usos." });
                    } else {
                        userCartData.appliedCoupon = code;
                        cartData[userJid] = userCartData;
                        saveJsonFile(ARQUIVO_CARRINHOS, cartData);
                        await sendMessage(sock, userJid, { text: `✅ Cupom *${code}* aplicado com sucesso!` });
                        await sendCartView(sock, userJid);
                    }
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Cupom inválido ou não encontrado. Tente novamente ou digite 0 para voltar." });
                }
            } else if (step === 'awaiting_terms_confirmation') {
                if (messageText === '1') {
                    // Perguntar sobre código de apoiador
                    const apoiadorText = `🎁 *Código de Apoiador*\n\nVocê tem um código de apoiador?\n\nSe você foi indicado por alguém, digite o código agora para apoiar quem te indicou!\n\n1️⃣ Tenho um código\n2️⃣ Continuar sem código`;
                    await sendMessage(sock, userJid, { text: apoiadorText });
                    navigateTo(userJid, 'awaiting_apoiador_code_choice', data);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
                }
            } else if (step === 'awaiting_apoiador_code_choice') {
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Digite o código de apoiador:" });
                    navigateTo(userJid, 'awaiting_apoiador_code_input', data);
                } else if (messageText === '2') {
                    // Continuar sem código
                    await sendPaymentMethodChoice(sock, userJid, data.finalTotal);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === 'awaiting_apoiador_code_input') {
                const code = messageText.trim().toUpperCase();

                // Verificar se o código existe e está ativo
                if (apoiadoresData[code] && apoiadoresData[code].ativo) {
                    // Salvar código no usuário
                    userData[userJid].apoiadorCode = code;
                    saveJsonFile(ARQUIVO_USUARIOS, userData);

                    await sendMessage(sock, userJid, { text: `✅ Código de apoiador *${code}* aplicado com sucesso!\n\nVocê está apoiando: *${apoiadoresData[code].ownerName}*` });
                    await sendPaymentMethodChoice(sock, userJid, data.finalTotal);
                } else {
                    await sendMessage(sock, userJid, { text: `⚠️ Código *${code}* inválido ou inativo.\n\n1️⃣ Tentar novamente\n2️⃣ Continuar sem código` });
                    navigateTo(userJid, 'awaiting_apoiador_code_retry', data);
                }
            } else if (step === 'awaiting_apoiador_code_retry') {
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Digite o código de apoiador:" });
                    navigateTo(userJid, 'awaiting_apoiador_code_input', data);
                } else if (messageText === '2') {
                    await sendPaymentMethodChoice(sock, userJid, data.finalTotal);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === 'awaiting_payment_method_choice') {
                const { finalTotal } = data;
                // Suporta lista interativa e modo legacy
                if (messageText === 'payment_pix' || messageText === '1') {
                    if (shopData.manualMaintenanceMode) {
                        // Modo manual ativado - mostrar instruções para PIX manual
                        const pixMessage = `💳 *Pagamento via PIX*\n\n` +
                            `Mande o pix para essa chave e envie o comprovante do valor para criarmos seu pedido!\n\n` +
                            `💰 *Valor:* R$ ${finalTotal.toFixed(2)}\n\n` +
                            `📌 *Não se preocupe, seus pontos serão creditados.*\n\n` +
                            `_Aguardando seu comprovante..._`;
                        await sendMessage(sock, userJid, { text: pixMessage });

                        // Enviar chave PIX em mensagem separada para facilitar cópia
                        const chavePix = shopData.chavePix || '9551929a-68da-4c1b-9033-682b1f21796d';
                        await sendMessage(sock, userJid, { text: chavePix });
                        // Criar ticket de suporte para processar pagamento manual
                        const ticketText = `Cliente escolheu PIX (modo manual). Valor: R$ ${finalTotal.toFixed(2)}. Aguardando comprovante.`;
                        const newTicket = {
                            clientJid: userJid,
                            clientName: userData[userJid]?.nome || userJid.split('@')[0],
                            ticketText,
                            timestamp: new Date().toISOString(),
                            notificationKeys: []
                        };
                        openTickets.push(newTicket);
                        saveJsonFile(ARQUIVO_TICKETS, openTickets);

                        userData[userJid].status = "em_atendimento";
                        saveJsonFile(ARQUIVO_USUARIOS, userData);

                        // Notificar admins
                        for (const adminJid in adminData) {
                            if (adminData[adminJid].notificacoes?.suporte) {
                                try {
                                    await sendMessage(sock, adminJid, {
                                        text: `🚨 *PAGAMENTO PIX MANUAL* 🚨\n\n*Cliente:* ${userData[userJid]?.nome}\n*Valor:* R$ ${finalTotal.toFixed(2)}\n\nO cliente foi instruído a enviar o comprovante.`
                                    });
                                } catch (e) { console.error(`Falha ao notificar admin ${adminJid}`); }
                            }
                        }

                        // Limpar estado do usuário para permitir envio do comprovante
                        delete userState[userJid];
                    } else {
                        await startPixCheckoutProcess(sock, userJid, finalTotal);
                    }
                } else if (messageText === 'payment_card' || messageText === '2') {
                    if (shopData.manualMaintenanceMode) {
                        // Modo manual ativado - cartão indisponível
                        await sendMessage(sock, userJid, {
                            text: "🔧 *Esse método de pagamento está em manutenção, utilize outro meio para prosseguir*"
                        });
                        // Retorna ao menu de pagamento
                        await sendPaymentMethodChoice(sock, userJid, finalTotal);
                    } else {
                        await startCardCheckoutProcess(sock, userJid, finalTotal);
                    }
                } else if (messageText === 'payment_other' || messageText === '3') {
                    await sendOtherPaymentMethodsMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === 'awaiting_other_payment_method_choice') {
                let ticketMessage = '';
                let infoMessage = '';

                // Suporta lista interativa e modo legacy
                switch (messageText) {
                    case 'other_binance': // Lista interativa
                    case '1': // Cripto (BINANCE)
                        ticketMessage = 'Cliente selecionou Criptomoedas via Binance.';
                        infoMessage = '🔹 *Criptomoedas via Binance*\n\nEnvie o valor diretamente através do ID Binance e encaminhe o comprovante de pagamento no chat\n\n`1118288900`';
                        break;
                    case 'other_crypto': // Lista interativa
                    case '2': // CRIPTO (DEMAIS CORRETORAS)
                        ticketMessage = 'Cliente selecionou Criptomoedas (Outras Corretoras).';
                        infoMessage = '🔹 *Criptomoedas (Outras carteiras)*\n\nEnvie o valor via Litecoin (LTC) e encaminhe o comprovante de pagamento no chat\n\n`ltc1qz2u8h4ndkwryq0z8vp97fnxvvrkjpdju8x8es4`';
                        break;
                    case 'other_paypal': // Lista interativa
                    case '3': // PayPal
                        ticketMessage = 'Cliente selecionou PayPal.';
                        infoMessage = '🔹 *PayPal*\n\nEnvie o valor para o email e encaminhe o comprovante de pagamento no chat\n\n`guirab734@gmail.com`';
                        break;
                    case 'other_custom': // Lista interativa
                    case '4': // Outro meio
                        ticketMessage = 'Cliente selecionou "Outro meio de pagamento".';
                        infoMessage = '🔹 *Outro meio de pagamento*\n\nUm ticket de suporte foi aberto. Por favor, informe o método de pagamento desejado para darmos continuidade.';
                        break;
                    default:
                        await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
                        return;
                }

                // Abrir ticket de suporte
                const newTicket = { clientJid: userJid, clientName: userData[userJid]?.nome, ticketText: ticketMessage, timestamp: new Date().toISOString(), notificationKeys: [] };
                openTickets.push(newTicket);
                saveJsonFile(ARQUIVO_TICKETS, openTickets);

                userData[userJid].status = "em_atendimento";
                saveJsonFile(ARQUIVO_USUARIOS, userData);

                // Notificar admins
                const adminJids = Object.keys(adminData);
                if (adminJids.length > 0) {
                    const notificationText = `🚨 *PAGAMENTO VARIÁVEL SOLICITADO* 🚨\n\n*Cliente:* ${newTicket.clientName}\n*Contato:* https://wa.me/${userJid.split("@")[0]}\n*Método:* _"${ticketMessage}"_`;
                    for (const adminJid of adminJids) {
                        try {
                            const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                            if (sentMsg?.key) newTicket.notificationKeys.push(sentMsg.key);
                        } catch (e) { console.error(`Falha ao notificar admin ${adminJid}`); }
                    }
                    saveJsonFile(ARQUIVO_TICKETS, openTickets);
                }

                await sendMessage(sock, userJid, { text: infoMessage });
                delete userState[userJid];

            } else if (step === "awaiting_edit_profile_choice") {
                // Aceita tanto rowId da lista quanto número tradicional
                if (messageText === "1" || messageText === "edit_name") {
                    await sendMessage(sock, userJid, { text: "✍️ Por favor, digite seu novo *nome de usuário*:" });
                    navigateTo(userJid, "awaiting_new_name");
                } else if (messageText === "2" || messageText === "edit_platform") {
                    const platformMenu = `🎮 Por favor, escolha sua nova *plataforma principal*:\n\n1️⃣ Android / Play Store\n2️⃣ Microsoft / PC\n3️⃣ iOS / Apple Store\n\n0️⃣ Voltar`;
                    await sendMessage(sock, userJid, { text: platformMenu });
                    navigateTo(userJid, "awaiting_new_platform_choice");
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === "awaiting_new_name") {
                const newName = messageText;
                userData[userJid].nome = newName;
                await generateInviteCode(newName, userJid);
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await sendMessage(sock, userJid, { text: `✅ Seu nome foi atualizado para *${newName}* e seu código de convite também foi renovado!` });
                delete userState[userJid];
                await sendProfileView(sock, userJid);
            } else if (step === "awaiting_new_platform_choice") {
                const choice = messageText;
                let newPlatform = "";

                if (choice === "1") {
                    newPlatform = "Android/Play Store";
                } else if (choice === "2") {
                    newPlatform = "Microsoft/PC";
                } else if (choice === "3") {
                    newPlatform = "iOS/Apple Store";
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                    return;
                }

                userData[userJid].plataforma = newPlatform;
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await sendMessage(sock, userJid, { text: `✅ Sua plataforma principal foi atualizada para *${newPlatform}*!` });
                delete userState[userJid];
                await sendProfileView(sock, userJid);
            } else if (step === "awaiting_support_choice") {
                // Aceita tanto rowId da lista quanto número tradicional
                if (messageText === "1" || messageText === "support_faq") {
                    await sendFaqMenu(sock, userJid);
                } else if (messageText === "2" || messageText === "support_attendant") {
                    await startSupportFlow(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === 'awaiting_support_confirmation') {
                // MODO LEGACY: messageText removido - usa apenas messageText
                if (messageText === '1' || messageText === 'support_confirm_1') {
                    if (openTickets.some(t => t.clientJid === userJid)) {
                        await sendMessage(sock, userJid, { text: "⚠️ Você já possui um ticket de atendimento aberto. Nossa equipe entrará em contato em breve. Agradecemos a sua paciência! 😊" });
                        return;
                    }
                    await sendMessage(sock, userJid, { text: "Por favor, descreva sua dúvida ou problema detalhadamente. Quanto mais informações, mais rápido poderemos te ajudar! 💬" });
                    navigateTo(userJid, "awaiting_support_message");
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
                }
            } else if (step === "awaiting_faq_choice") {
                const { currentPath, options } = data;
                // MODO LEGACY: messageText removido - usa apenas messageText

                let choiceIndex = -1;
                if (messageText && messageText.startsWith('faq_')) {
                    choiceIndex = parseInt(messageText.replace('faq_', '')) - 1;
                } else {
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= options.length) {
                        choiceIndex = choice - 1;
                    }
                }

                if (choiceIndex >= 0 && choiceIndex < options.length) {
                    const selected = options[choiceIndex];
                    const newPath = path.join(currentPath, selected.name);
                    if (selected.type === 'dir') {
                        await sendFaqMenu(sock, userJid, newPath);
                    } else {
                        const content = loadJsonFile(path.join(DIRETORIO_DUVIDAS, newPath), { text: 'Conteúdo não encontrado.' });
                        await sendMessage(sock, userJid, { text: content.text + "\n\nDigite *0* para Voltar" });
                        navigateTo(userJid, "awaiting_faq_choice", { currentPath, options });
                    }
                } else {
                    await sendInvalidOptionMessage(sock, userJid, options.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === "awaiting_support_message") {
                const ticketText = messageText;
                const newTicket = {
                    clientJid: userJid,
                    clientName: userData[userJid]?.nome || userJid.split("@")[0],
                    ticketText: ticketText,
                    timestamp: new Date().toISOString(),
                    notificationKeys: [],
                    isBuyer: !!compradoresData[userJid]
                };
                openTickets.push(newTicket);
                saveJsonFile(ARQUIVO_TICKETS, openTickets);

                await sendMessage(sock, userJid, { text: "✅ Sua mensagem foi enviada à nossa equipe de suporte! Um atendente entrará em contato em breve. Agradecemos a sua paciência! 😊" });

                const adminJids = Object.keys(adminData);
                if (adminJids.length > 0) {
                    let notificationText = `🚨 *NOVO TICKET DE SUPORTE ABERTO* \n\n`;
                    notificationText += `*Cliente:* ${newTicket.clientName}\n`;
                    notificationText += `*Contato:* https://wa.me/${userJid.split("@")[0]}\n`;
                    notificationText += `*Mensagem:* _"${ticketText}"_\n\n`;
                    notificationText += `Para finalizar este atendimento, responda a esta mensagem com */f* ou use o painel de admin.`;
                    for (const adminJid of adminJids) {
                        if (adminData[adminJid].notificacoes?.suporte) {
                            try {
                                const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                                if (sentMsg?.key) {
                                    newTicket.notificationKeys.push(sentMsg.key);
                                }
                            } catch (e) {
                                console.error(`Falha ao notificar o admin ${adminJid} sobre o ticket:`, e);
                            }
                        }
                    }
                    saveJsonFile(ARQUIVO_TICKETS, openTickets);
                }
                delete userState[userJid];
            } else if (step === "awaiting_product_category_list") {
                if (!isAdmin && !isProductManager) {
                    await sendMessage(sock, userJid, { text: "🚫 Acesso restrito." });
                    return;
                }
                let category = "";
                let productFile = "";
                let productType = "";
                if (messageText === "1") {
                    category = "ofertas";
                    productType = "ofertas";
                } else if (messageText === "2") {
                    category = "esferas";
                    productType = "esferas";
                } else if (messageText === "3") {
                    category = "contas_exclusivas";
                    productFile = ARQUIVO_CONTAS_EXCLUSIVAS_JSON;
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                    return;
                }

                if (productType) { // Ofertas ou Esferas
                    const menuText = `O que você deseja fazer em *${category.toUpperCase()}*?\n\n1️⃣ ➕ Adicionar produto\n2️⃣ ✏️ Editar produto existente\n3️⃣ ➖ Remover produto\n4️⃣ 📂 Gerenciar Seções\n\n0️⃣ Voltar`;
                    await sendMessage(sock, userJid, { text: menuText });
                    navigateTo(userJid, 'awaiting_structured_product_action', { productType });
                } else { // Contas Exclusivas
                    await sendGenericProductList(sock, userJid, category, productFile);
                }
            } else if (step === 'awaiting_structured_product_action') {
                const { productType } = data;
                if (messageText === '1') {
                    await sendProductManagementBrowser(sock, userJid, 'add', '', productType);
                } else if (messageText === '2') {
                    await sendProductManagementBrowser(sock, userJid, 'edit', '', productType);
                } else if (messageText === '3') {
                    await sendProductManagementBrowser(sock, userJid, 'remove', '', productType);
                } else if (messageText === '4') {
                    await sendProductManagementBrowser(sock, userJid, 'manage_sections', '', productType);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
                }
            } else if (step === 'awaiting_section_action_choice') {
                const { currentPath, productType } = data;
                if (messageText === '1') { // Adicionar
                    await sendSectionManagementBrowser(sock, userJid, 'add', currentPath, productType);
                } else if (messageText === '2') { // Editar
                    await sendSectionManagementBrowser(sock, userJid, 'edit', currentPath, productType);
                } else if (messageText === '3') { // Remover
                    await sendSectionManagementBrowser(sock, userJid, 'remove', currentPath, productType);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === 'awaiting_section_browse_choice') {
                const { action, currentPath, options, productType } = data;
                const choice = messageText.trim().toLowerCase();

                if (choice === 'x') {
                    const categoryName = productType === 'ofertas' ? 'Ofertas' : 'Esferas';
                    if (action === 'add') {
                        await sendMessage(sock, userJid, { text: `Qual o nome da nova seção a ser criada em *${path.basename(currentPath) || categoryName}*?` });
                        navigateTo(userJid, "awaiting_new_section_name", { basePath: currentPath, productType });
                    } else { // remove
                        const confirmationText = `Tem certeza que deseja remover a seção '*${path.basename(currentPath)}*'? 🤔\nTodas as ofertas e subseções dentro dela serão permanentemente apagadas.\n\n*Digite:*\n1️⃣ Confirmar\n2️⃣ Cancelar`;
                        await sendMessage(sock, userJid, { text: confirmationText });
                        navigateTo(userJid, 'awaiting_section_removal_confirmation', { sectionToRemovePath: currentPath, productType });
                    }
                } else {
                    const choiceIndex = parseInt(choice) - 1;
                    if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < options.length) {
                        const selected = options[choiceIndex];
                        const newPath = path.join(currentPath, selected.name);
                        if (action === 'edit') {
                            await sendMessage(sock, userJid, { text: `Digite o novo nome para a seção "*${selected.name}*":` });
                            navigateTo(userJid, "awaiting_new_section_name_for_edit", { oldPath: newPath, productType });
                        } else {
                            await sendSectionManagementBrowser(sock, userJid, action, newPath, productType);
                        }
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, ['X', '0'].concat(options.map((_, i) => `${i + 1}`)));
                    }
                }
            } else if (step === 'awaiting_new_section_name_for_edit') {
                const { oldPath, productType } = data;
                const newName = messageText.trim().replace(/[\/\\]/g, '');
                if (!newName) {
                    await sendMessage(sock, userJid, { text: "❌ O nome da seção não pode estar vazio." });
                    return;
                }
                const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const oldFullPath = path.join(basePath, oldPath);
                const newFullPath = path.join(path.dirname(oldFullPath), newName);

                if (fs.existsSync(newFullPath)) {
                    await sendMessage(sock, userJid, { text: `⚠️ Já existe uma seção com o nome "*${newName}*". Tente outro nome.` });
                    return;
                }
                fs.renameSync(oldFullPath, newFullPath);
                await sendMessage(sock, userJid, { text: `✅ Seção renomeada para "*${newName}*" com sucesso!` });
                await sendProductCategoryList(sock, userJid);

            } else if (step === 'awaiting_new_section_name') {
                const { basePath, productType } = data;
                const newSectionName = messageText.trim().replace(/[\/\\]/g, '');
                if (!newSectionName) {
                    await sendMessage(sock, userJid, { text: "❌ O nome da seção não pode estar vazio." });
                    return;
                }
                const baseDir = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const fullPath = path.join(baseDir, basePath, newSectionName);
                if (!fs.existsSync(fullPath)) {
                    fs.mkdirSync(fullPath, { recursive: true });
                    await sendMessage(sock, userJid, { text: `✅ Seção *${newSectionName}* criada com sucesso!` });
                } else {
                    await sendMessage(sock, userJid, { text: `⚠️ A seção *${newSectionName}* já existe.` });
                }
                await sendProductCategoryList(sock, userJid);

            } else if (step === 'awaiting_product_browse_choice') {
                const { action, currentPath, options, productType } = data;
                const choice = messageText.trim().toLowerCase();
                const categoryName = productType === 'ofertas' ? 'Ofertas' : 'Esferas';

                if (choice === 'x' && (action === 'add' || action === 'manage_sections')) {
                    if (action === 'add') {
                        if (productType === 'esferas') {
                            await sendMessage(sock, userJid, { text: `Ok, vamos adicionar a esfera em *${path.basename(currentPath) || categoryName}*.\n\nEsta é uma esfera normal ou sob encomenda?\n\n1️⃣ Normal\n2️⃣ Sob Encomenda` });
                            navigateTo(userJid, "awaiting_sphere_type", { category: productType, sectionPath: currentPath });
                        } else {
                            await sendMessage(sock, userJid, { text: `Ok, vamos adicionar o produto em *${path.basename(currentPath) || categoryName}*.\n\nQual o *nome* do produto? ✍️` });
                            navigateTo(userJid, "awaiting_new_product_name", { category: productType, sectionPath: currentPath });
                        }
                    }
                } else {
                    const choiceIndex = parseInt(choice) - 1;
                    if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < options.length) {
                        const selected = options[choiceIndex];
                        if (selected.type === 'dir') {
                            const newPath = path.join(currentPath, selected.name);
                            await sendProductManagementBrowser(sock, userJid, action, newPath, productType);
                        } else if (selected.type === 'product') {
                            if (action === 'edit') {
                                await sendEditAttributeMenu(sock, userJid, selected.data, productType, selected.section);
                            } else if (action === 'remove') {
                                const productToRemove = selected.data;
                                await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o produto "*${productToRemove.name}*"?\n\n1️⃣ Sim\n2️⃣ Não` });
                                navigateTo(userJid, "awaiting_product_removal_confirmation", { productToRemove, section: selected.section, currentPath, productType });
                            }
                        }
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, ['X', '0'].concat(options.map((_, i) => `${i + 1}`)));
                    }
                }
            } else if (step === 'awaiting_product_removal_confirmation') {
                const { productToRemove, section, currentPath, productType } = data;
                if (messageText === '1') {
                    const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                    const sectionFullPath = path.join(basePath, section);
                    const productFilePath = path.join(sectionFullPath, `${path.basename(section)}.json`);
                    let products = loadJsonFile(productFilePath, []);
                    const updatedProducts = products.filter(p => p.id !== productToRemove.id);
                    saveJsonFile(productFilePath, updatedProducts);

                    // Deleta a imagem se ela existir
                    if (productToRemove.image && fs.existsSync(productToRemove.image)) {
                        try {
                            fs.unlinkSync(productToRemove.image);
                            console.log(`Imagem removida: ${productToRemove.image}`);
                        } catch (err) {
                            console.error(`Erro ao remover imagem ${productToRemove.image}:`, err);
                        }
                    }

                    await sendMessage(sock, userJid, { text: `✅ Produto *"${productToRemove.name}"* removido com sucesso!` });
                    await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
                } else {
                    await sendMessage(sock, userJid, { text: "Remoção cancelada." });
                    await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
                }

            } else if (step === 'awaiting_section_removal_confirmation') {
                const { sectionToRemovePath, productType } = data;
                if (messageText === '1') {
                    const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                    const fullPath = path.join(basePath, sectionToRemovePath);
                    if (fs.existsSync(fullPath)) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        await sendMessage(sock, userJid, { text: `✅ Seção *${path.basename(sectionToRemovePath)}* e todo o seu conteúdo foram removidos.` });
                    }
                    await sendProductCategoryList(sock, userJid);
                } else if (messageText === '2' || messageText === '0') {
                    await sendMessage(sock, userJid, { text: "Operação cancelada." });
                    await sendProductCategoryList(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            } else if (step === 'awaiting_generic_product_action') {
                const { category, products, productFile } = data;
                const choice = parseInt(messageText);
                if (choice === 1) {
                    await sendMessage(sock, userJid, { text: `✍️ Para adicionar um novo produto em *${category.toUpperCase()}*, por favor, digite o *nome* do produto:` });
                    navigateTo(userJid, "awaiting_new_product_name", { category, productFile });
                } else if (choice === 2 || choice === 3) {
                    let selectionText = `Qual produto você deseja ${choice === 2 ? 'editar' : 'remover'}?\n\n`;
                    products.forEach((p, i) => {
                        selectionText += `*${i + 1}* - ${p.name}\n`;
                    });
                    selectionText += '\n0️⃣ Voltar';
                    await sendMessage(sock, userJid, { text: selectionText });
                    navigateTo(userJid, 'awaiting_generic_product_selection', { category, products, productFile, action: choice === 2 ? 'edit' : 'remove' });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === 'awaiting_generic_product_selection') {
                const { category, products, productFile, action } = data;
                const choiceIndex = parseInt(messageText) - 1;
                if (messageText === '0') {
                    await sendGenericProductList(sock, userJid, category, productFile);
                    return;
                }
                if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < products.length) {
                    const product = products[choiceIndex];
                    if (action === 'edit') {
                        await sendEditAttributeMenu(sock, userJid, product, category, null);
                    } else if (action === 'remove') {
                        await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o produto "*${product.name}*"?\n\n1️⃣ Sim\n2️⃣ Não` });
                        navigateTo(userJid, "awaiting_generic_product_removal_confirmation", { product, category, products, productFile, choiceIndex });
                    }
                } else {
                    await sendInvalidOptionMessage(sock, userJid, products.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === 'awaiting_generic_product_removal_confirmation') {
                const { product, category, products, productFile, choiceIndex } = data;
                if (messageText === '1') {
                    const updatedProducts = products.filter((p, i) => i !== choiceIndex);
                    saveJsonFile(productFile, updatedProducts);
                    await sendMessage(sock, userJid, { text: `✅ Produto *"${product.name}"* removido com sucesso!` });
                    await sendGenericProductList(sock, userJid, category, productFile);
                } else {
                    await sendMessage(sock, userJid, { text: "Remoção cancelada." });
                    await sendGenericProductList(sock, userJid, category, productFile);
                }
            } else if (step === 'awaiting_id_verification_digits_from_seller') {
                const { orderId, correctDigits } = data;
                const enteredDigits = messageText.trim();
                const directChatState = userState[userJid].history.find(s => s.step === 'in_direct_chat');
                const partnerJid = directChatState?.data?.partnerJid;

                if (enteredDigits === correctDigits || enteredDigits === '0000') {
                    await sendMessage(sock, userJid, { text: "✅ ID verificado com sucesso. Você precisa de um cartão novo?\n\n*Digite:*\n1 - Sim\n2 - Não" });
                    navigateTo(userJid, 'awaiting_new_card_choice_after_login', { orderId });
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Os dígitos informados estão incorretos. Fale com o cliente para confirmar e use os comandos de atendimento conforme necessário." });
                    if (partnerJid) {
                        navigateTo(userJid, 'in_direct_chat', { partnerJid, orderId });
                    } else {
                        delete userState[userJid];
                    }
                }
            } else if (step === 'awaiting_correction_login') {
                const { orderId, sourceQueue } = data;
                const newLogin = messageText.trim();
                await sendMessage(sock, userJid, { text: "Obrigado. Agora, por favor, envie a nova *senha*." });
                navigateTo(userJid, 'awaiting_correction_password', { orderId, sourceQueue, newLogin });
            } else if (step === 'awaiting_correction_password') {
                const { orderId, sourceQueue, newLogin } = data;
                const newPassword = messageText.trim();
                await sendMessage(sock, userJid, { text: "Entendido. E por último, confirme o *ID da sua conta do jogo*." });
                navigateTo(userJid, 'awaiting_correction_id', { orderId, sourceQueue, newLogin, newPassword });
            } else if (step === 'awaiting_correction_id') {
                const { orderId, sourceQueue, newLogin, newPassword } = data;
                const newId = messageText.trim();

                const confirmationText = `Confirme os dados:\n\n*Login:* ${newLogin}\n*Senha:* ${newPassword}\n*ID:* ${newId}\n\nEstá tudo certo?\n\n1️⃣ Sim\n2️⃣ Não`;
                await sendMessage(sock, userJid, { text: confirmationText });
                navigateTo(userJid, 'awaiting_correction_confirmation', { orderId, sourceQueue, newLogin, newPassword, newId });

            } else if (step === 'awaiting_correction_confirmation') {
                const { orderId, sourceQueue, newLogin, newPassword, newId } = data;
                if (messageText !== '1') {
                    await sendMessage(sock, userJid, { text: "Correção cancelada. Por favor, envie o login correto novamente." });
                    navigateTo(userJid, 'awaiting_correction_login', { orderId, sourceQueue });
                    return;
                }

                let order = null;
                const waitingIndex = waitingOrders.findIndex(o => o.id === orderId);
                if (waitingIndex > -1) {
                    order = waitingOrders.splice(waitingIndex, 1)[0]; // Remove da espera
                }

                if (order) {
                    order.facebookLogin = newLogin;
                    order.facebookPassword = newPassword;
                    order.dragonCityId = newId;

                    const clientUser = userData[order.clientJid];
                    if (clientUser && clientUser.savedAccounts) {
                        const accountIndex = clientUser.savedAccounts.findIndex(acc => acc.login === order.facebookLogin || acc.password === order.facebookPassword);
                        if (accountIndex > -1) {
                            clientUser.savedAccounts[accountIndex].login = newLogin;
                            clientUser.savedAccounts[accountIndex].password = newPassword;
                            clientUser.savedAccounts[accountIndex].gameId = newId;
                        }
                    }
                    saveJsonFile(ARQUIVO_USUARIOS, userData);

                    // Devolve para a fila correta
                    const targetList = sourceQueue === 'verified' ? pendingOrdersV : pendingOrders;
                    const targetFile = sourceQueue === 'verified' ? ARQUIVO_PEDIDOS_V : ARQUIVO_PEDIDOS;
                    targetList.unshift(order); // Adiciona ao topo
                    saveJsonFile(targetFile, targetList);
                    saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders); // Salva a lista de espera sem o pedido


                    await sendMessage(sock, userJid, { text: "✅ Dados corrigidos! Seu pedido voltou para o topo da fila de atendimento." });
                    userData[userJid].status = "navegando";
                    saveJsonFile(ARQUIVO_USUARIOS, userData);
                    delete userState[userJid];
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Ocorreu um erro ao encontrar seu pedido. Por favor, entre em contato com o suporte." });
                }
            } else if (step === "awaiting_create_order_number") {
                if (!isAdmin && !isComprador) return;
                const phoneNumber = messageText.replace(/\D/g, '');
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido. Por favor, envie o número com DDI e DDD (ex: 5511912345678). Ou digite 0 para cancelar." });
                    return;
                }
                const clientJid = `${phoneNumber}@s.whatsapp.net`;
                await sendMessage(sock, userJid, { text: `Cliente: *${phoneNumber}*. Agora, digite os produtos um por um. Quando terminar, digite *X*.` });
                navigateTo(userJid, "awaiting_create_order_products", { clientJid, products: [] });
            } else if (step === "awaiting_create_order_products") {
                const { clientJid, products } = data;
                const productName = messageText.trim();

                if (productName.toLowerCase() === 'x') {
                    if (products.length === 0) {
                        await sendMessage(sock, userJid, { text: "Você precisa adicionar pelo menos um produto." });
                        return;
                    }
                    const comissoes = shopData.comissoes || { porCompra: 8.00 };
                    const total = 0; // Preço 0 para pedidos criados manualmente
                    const itemsAsObjects = products.map(name => ({ name, price: 0, quantity: 1 }));
                    const orderData = { clientJid, total, quantity: products.length, items: itemsAsObjects };

                    await sendMessage(sock, userJid, { text: `✅ Pedido iniciado para o cliente. Solicitando os dados da conta...` });
                    await promptForAccountDetails(sock, userJid, total, itemsAsObjects, {
                        paymentMethod: 'manual_order_creation',
                        orderData: orderData
                    });

                } else {
                    const updatedProducts = [...products, productName];
                    await sendMessage(sock, userJid, { text: `✅ Produto "*${productName}*" adicionado. Adicione o próximo ou digite *X* para finalizar.` });
                    navigateTo(userJid, "awaiting_create_order_products", { clientJid, products: updatedProducts });
                }
            } else if (step === "awaiting_new_product_name") {
                if (!isAdmin && !isProductManager) return;
                const newProductName = messageText;
                const { category } = data;
                const currentData = { ...data, newProductName };

                if (category === 'ofertas') {
                    await sendMessage(sock, userJid, { text: `Nome: *${newProductName}*.\n\nEsta é uma oferta normal ou variável?\n\n1️⃣ Normal\n2️⃣ Variável` });
                    navigateTo(userJid, "awaiting_offer_type", currentData);
                } else if (category === 'esferas') {
                    // Este fluxo foi movido e agora começa em 'awaiting_sphere_type'
                    // O nome do dragão é perguntado depois
                } else { // Contas Exclusivas
                    await sendMessage(sock, userJid, { text: `Nome: *${newProductName}*. Agora, por favor, digite a *descrição* do produto:` });
                    navigateTo(userJid, "awaiting_new_product_description", currentData);
                }
            } else if (step === "awaiting_offer_type") {
                if (messageText === '1') { // Normal
                    await sendMessage(sock, userJid, { text: `Ok, oferta normal. Agora, por favor, digite a *descrição* do produto:` });
                    navigateTo(userJid, "awaiting_new_product_description", data);
                } else if (messageText === '2') { // Variável
                    const { newProductName, category, sectionPath } = data;
                    const newProduct = {
                        id: Date.now().toString(),
                        name: newProductName,
                        description: "Oferta de valor variável, consulte o suporte.",
                        price: 0,
                        isVariable: true,
                        createdAt: Date.now(),
                    };
                    const basePath = DIRETORIO_OFERTAS;
                    const finalFolder = path.basename(sectionPath);
                    const productFilePath = path.join(basePath, sectionPath, `${finalFolder}.json`);
                    const currentProducts = loadJsonFile(productFilePath, []);
                    currentProducts.push(newProduct);
                    saveJsonFile(productFilePath, currentProducts);
                    // Comissão para gerente de produto ao criar oferta variável
                    if (category === 'ofertas' && isProductManager && productManagerData[userJid]) {
                        const productManagerCommission = shopData.comissoes?.gerenciadorProduto || 3.00;
                        addEarningsToMember(userJid, productManagerCommission, false);
                        productManagerData[userJid].ofertasAdicionadas = (productManagerData[userJid].ofertasAdicionadas || 0) + 1;
                        saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                    }
                    await notifyProductManagersAndAdmins(sock, `📦 *Nova Oferta Variável Adicionada!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
                    await notifyOfferChannel(sock, `📦 *Nova Oferta Variável!*\n\n*${newProduct.name}* foi adicionada. Confira nosso catálogo!`);
                    await sendMessage(sock, userJid, { text: `✅ Oferta variável *"${newProduct.name}"* adicionada com sucesso!` });
                    await sendProductCategoryList(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === "awaiting_sphere_type") {
                if (messageText === '1') { // Normal
                    await sendMessage(sock, userJid, { text: "Qual o nome do dragão?" });
                    navigateTo(userJid, "awaiting_sphere_dragon_name", { ...data, sobEncomenda: false });
                } else if (messageText === '2') { // Sob Encomenda
                    await sendMessage(sock, userJid, { text: "Qual o nome do dragão?" });
                    navigateTo(userJid, "awaiting_sphere_dragon_name", { ...data, sobEncomenda: true });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === "awaiting_sphere_dragon_name") {
                const dragonName = messageText;
                await sendMessage(sock, userJid, { text: `Nome do dragão: *${dragonName}*. Agora, digite a descrição:` });
                navigateTo(userJid, "awaiting_sphere_description", { ...data, newProductName: dragonName });
            } else if (step === "awaiting_sphere_description") {
                const description = messageText;
                await sendMessage(sock, userJid, { text: `Descrição adicionada. Qual a raridade do dragão?\n\n1️⃣ Lendário\n2️⃣ Mítico\n3️⃣ Heroico` });
                navigateTo(userJid, "awaiting_sphere_rarity_choice", { ...data, newProductDescription: description });
            } else if (step === "awaiting_sphere_rarity_choice") {
                let rarity = '';
                let tradeRatio = 0;
                if (messageText === '1') { rarity = 'Lendário'; tradeRatio = 7; }
                else if (messageText === '2') { rarity = 'Mítico'; tradeRatio = 6; }
                else if (messageText === '3') { rarity = 'Heroico'; tradeRatio = 5; }
                else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3']);
                    return;
                }
                await sendMessage(sock, userJid, { text: `Raridade: *${rarity}*. Proporção de troca definida para *${tradeRatio}*.\nAgora, envie a imagem do dragão (ou digite 'pular').` });
                navigateTo(userJid, "awaiting_product_image", { ...data, rarity, tradeRatio });
            } else if (step === "awaiting_new_product_description") {
                if (!isAdmin && !isProductManager) return;
                const newProductDescription = messageText;
                const currentData = { ...data, newProductDescription };

                if (data.category === 'ofertas') {
                    let basesText = "📊 *Bases de Valores Disponíveis*\n\n";

                    if (basesValores && basesValores.length > 0) {
                        const langBase = getUserLanguage(userJid);
                        for (let index = 0; index < basesValores.length; index++) {
                            const base = basesValores[index];
                            const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                            const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                            const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                            const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                            basesText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                            basesText += `   (Venda/Android/PC/iOS)\n\n`;
                        }
                    } else {
                        basesText += "Nenhuma base cadastrada ainda.\n\n";
                    }

                    basesText += "*X* - 🆕 Adicionar nova base\n";
                    basesText += "*X2* - 🗑️ Excluir uma base\n\n";
                    basesText += "Digite o número da base que deseja utilizar ou X/X2:";

                    await sendMessage(sock, userJid, { text: basesText });
                    navigateTo(userJid, "awaiting_value_base_choice", currentData);

                } else if (data.category === 'contas_exclusivas') {
                    await sendMessage(sock, userJid, { text: `Descrição adicionada. Agora, por favor, digite o *login* da conta:` });
                    navigateTo(userJid, "awaiting_new_account_login", currentData);
                }
            } else if (step === "awaiting_value_base_choice") {
                if (!isAdmin && !isProductManager) return;
                const inputText = messageText.trim().toUpperCase();

                // Recarregar basesValores para garantir sincronização com o arquivo
                basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);
                // Garantir estrutura esperada: basesValores deve ser um array
                basesValores = Array.isArray(basesValores) ? basesValores : [];

                // Tratar opção X - Adicionar nova base
                if (inputText === 'X') {
                    await sendMessage(sock, userJid, { text: `🆕 Criando nova base de valores.\n\nDigite o preço base para *Android / Play Store* (use 0 se não aplicável):` });
                    navigateTo(userJid, "awaiting_new_product_price_android", { ...data, criarNovaBase: true });
                    return;
                }

                // Tratar opção X2 - Excluir uma base
                if (inputText === 'X2') {
                    if (basesValores.length === 0) {
                        await sendMessage(sock, userJid, { text: `⚠️ Não há bases cadastradas para excluir.` });
                        return;
                    }

                    let basesListText = "🗑️ *Excluir Base de Valores*\n\nSelecione o número da base que deseja excluir:\n\n";
                    const langBase = getUserLanguage(userJid);
                    for (let index = 0; index < basesValores.length; index++) {
                        const base = basesValores[index];
                        const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                        const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                        const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                        const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                        basesListText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                        basesListText += `   (Venda/Android/PC/iOS)\n\n`;
                    }
                    basesListText += "Digite o número da base que deseja excluir ou *0* para cancelar:";
                    await sendMessage(sock, userJid, { text: basesListText });
                    navigateTo(userJid, "awaiting_base_to_delete", data);
                    return;
                }

                // Tentar parsear como número para escolher uma base existente
                const choice = parseInt(inputText);

                if (isNaN(choice) || choice < 1 || choice > basesValores.length) {
                    await sendMessage(sock, userJid, { text: `⚠️ Opção inválida. Digite um número entre 1 e ${basesValores.length}, ou *X* para adicionar, ou *X2* para excluir.` });
                    return;
                }

                // Usar base existente
                const baseEscolhida = basesValores[choice - 1];

                // Verificar se a base existe e tem as propriedades necessárias
                if (!baseEscolhida || typeof baseEscolhida !== 'object') {
                    await sendMessage(sock, userJid, { text: `❌ Erro: Base de valores não encontrada. Tente novamente.` });
                    return;
                }

                // Garantir que as propriedades de preço existam com valores padrão
                const precoAndroid = Number(baseEscolhida.precoAndroid || 0);
                const precoPc = Number(baseEscolhida.precoPc || 0);
                const precoIos = Number(baseEscolhida.precoIos || 0);

                if (precoAndroid === 0 && precoPc === 0 && precoIos === 0) {
                    await sendMessage(sock, userJid, { text: `❌ Erro: Base de valores inválida (todos os preços são zero). Tente outra base.` });
                    return;
                }

                const discountPercentage = shopData.descontoAutomaticoOferta || 30;
                let calculatedPrice = precoAndroid - (precoAndroid * (discountPercentage / 100));
                const compraMinima = shopData.compraMinima || 20;

                if (calculatedPrice < compraMinima) {
                    calculatedPrice = compraMinima - 0.01;
                } else {
                    calculatedPrice = Math.floor(calculatedPrice) + 0.99;
                }

                const langBase2 = getUserLanguage(userJid);
                const vendaSelFmt = await formatCurrencyByLanguage(calculatedPrice || 0, langBase2);
                const androidSelFmt = await formatCurrencyByLanguage(precoAndroid || 0, langBase2);
                const pcSelFmt = await formatCurrencyByLanguage(precoPc || 0, langBase2);
                const iosSelFmt = await formatCurrencyByLanguage(precoIos || 0, langBase2);
                await sendMessage(sock, userJid, { text: `✅ Base de valores selecionada!\n\n💰 Preço de venda: ${vendaSelFmt}\n📱 Android: ${androidSelFmt}\n💻 PC: ${pcSelFmt}\n🍎 iOS: ${iosSelFmt}\n\nAgora, envie a imagem da oferta (ou digite 'pular').` });
                navigateTo(userJid, "awaiting_product_image", {
                    ...data,
                    androidPrice: precoAndroid,
                    microsoftPrice: precoPc,
                    iosPrice: precoIos,
                    newProductPrice: calculatedPrice
                });
            } else if (step === "awaiting_base_to_delete") {
                if (!isAdmin && !isProductManager) return;
                const choice = parseInt(messageText.trim());

                // Recarregar basesValores
                basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);
                basesValores = Array.isArray(basesValores) ? basesValores : [];

                if (choice === 0) {
                    await sendMessage(sock, userJid, { text: "❌ Operação cancelada." });
                    // Voltar para a seleção de base
                    let basesText = "📊 *Bases de Valores Disponíveis*\n\n";
                    if (basesValores && basesValores.length > 0) {
                        const langBase = getUserLanguage(userJid);
                        for (let index = 0; index < basesValores.length; index++) {
                            const base = basesValores[index];
                            const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                            const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                            const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                            const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                            basesText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                            basesText += `   (Venda/Android/PC/iOS)\n\n`;
                        }
                    } else {
                        basesText += "Nenhuma base cadastrada ainda.\n\n";
                    }
                    basesText += "*X* - 🆕 Adicionar nova base\n";
                    basesText += "*X2* - 🗑️ Excluir uma base\n\n";
                    basesText += "Digite o número da base que deseja utilizar ou X/X2:";
                    await sendMessage(sock, userJid, { text: basesText });
                    navigateTo(userJid, "awaiting_value_base_choice", data);
                    return;
                }

                if (isNaN(choice) || choice < 1 || choice > basesValores.length) {
                    await sendMessage(sock, userJid, { text: `⚠️ Opção inválida. Digite um número entre 1 e ${basesValores.length} ou 0 para cancelar.` });
                    return;
                }

                // Excluir a base selecionada
                const baseRemovida = basesValores.splice(choice - 1, 1)[0];
                saveJsonFile(ARQUIVO_BASES_VALORES, basesValores);

                const langBase = getUserLanguage(userJid);
                const vendaFmt = await formatCurrencyByLanguage(Number(baseRemovida.precoVenda || 0), langBase);
                await sendMessage(sock, userJid, { text: `✅ Base de valores (${vendaFmt}) foi excluída com sucesso!` });

                // Voltar para a seleção de base
                let basesText = "📊 *Bases de Valores Disponíveis*\n\n";
                if (basesValores && basesValores.length > 0) {
                    for (let index = 0; index < basesValores.length; index++) {
                        const base = basesValores[index];
                        const vendaFmt2 = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                        const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                        const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                        const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                        basesText += `${index + 1} - ${vendaFmt2} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                        basesText += `   (Venda/Android/PC/iOS)\n\n`;
                    }
                } else {
                    basesText += "Nenhuma base cadastrada ainda.\n\n";
                }
                basesText += "*X* - 🆕 Adicionar nova base\n";
                basesText += "*X2* - 🗑️ Excluir uma base\n\n";
                basesText += "Digite o número da base que deseja utilizar ou X/X2:";
                await sendMessage(sock, userJid, { text: basesText });
                navigateTo(userJid, "awaiting_value_base_choice", data);

            } else if (step === 'awaiting_product_type') {
                const { category, sectionPath, newProduct } = data;
                const basePath = category === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const finalFolder = path.basename(sectionPath);
                const productFilePath = path.join(basePath, sectionPath, `${finalFolder}.json`);
                const currentProducts = loadJsonFile(productFilePath, []);

                if (messageText === '1') {
                    // Este fluxo foi movido para antes
                } else if (messageText === '2') {
                    newProduct.isVariable = true;
                    newProduct.price = 0; // Preço variável não tem preço fixo
                    currentProducts.push(newProduct);
                    saveJsonFile(productFilePath, currentProducts);
                    // Adicionar comissão também quando oferta variável é criada por este fluxo
                    if (category === 'ofertas' && isProductManager && productManagerData[userJid]) {
                        const productManagerCommission = shopData.comissoes?.gerenciadorProduto || 3.00;
                        addEarningsToMember(userJid, productManagerCommission, false);
                        productManagerData[userJid].ofertasAdicionadas = (productManagerData[userJid].ofertasAdicionadas || 0) + 1;
                        saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                    }
                    await notifyProductManagersAndAdmins(sock, `📦 *Novo Produto Variável Adicionado!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
                    await notifyOfferChannel(sock, `📦 *Oferta Variável Disponível:* ${newProduct.name}`);
                    await sendMessage(sock, userJid, { text: `✅ Produto variável *"${newProduct.name}"* adicionado com sucesso!` });
                    delete userState[userJid];
                    await sendProductCategoryList(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === "awaiting_new_product_price_android") {
                if (!isAdmin && !isProductManager) return;
                const androidPrice = parseFloat(messageText.replace(",", "."));
                if (isNaN(androidPrice)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Preço inválido. Por favor, digite um número (ex: 44.09)." });
                    return;
                }

                const discountPercentage = shopData.descontoAutomaticoOferta || 30;
                let calculatedPrice = androidPrice - (androidPrice * (discountPercentage / 100));
                const compraMinima = shopData.compraMinima || 20;

                if (calculatedPrice < compraMinima) {
                    calculatedPrice = compraMinima - 0.01;
                    await sendMessage(sock, userJid, { text: `ℹ️ O preço calculado foi abaixo de R$ ${compraMinima.toFixed(2)} e foi ajustado para o valor mínimo de R$ ${calculatedPrice.toFixed(2)}.` });
                } else {
                    calculatedPrice = Math.floor(calculatedPrice) + 0.99;
                }


                const langCalc = getUserLanguage(userJid);
                const calcFmt = await formatCurrencyByLanguage(calculatedPrice || 0, langCalc);
                await sendMessage(sock, userJid, { text: `✅ O preço de venda foi calculado automaticamente em *${calcFmt}*.` });
                await sendMessage(sock, userJid, { text: "Agora, por favor, envie a imagem da oferta (ou digite 'pular')." });

                navigateTo(userJid, "awaiting_product_image", { ...data, androidPrice, newProductPrice: calculatedPrice });

            } else if (step === "awaiting_new_account_login") {
                const login = messageText;
                await sendMessage(sock, userJid, { text: `Login: *${login}*. Agora, por favor, digite a *senha* da conta:` });
                navigateTo(userJid, "awaiting_new_account_password", { ...data, login });
            } else if (step === "awaiting_new_account_password") {
                const password = messageText;
                await sendMessage(sock, userJid, { text: `Senha definida. Agora, envie a *imagem* da conta (ou digite 'pular'):` });
                navigateTo(userJid, "awaiting_product_image", { ...data, password });
            } else if (step === "awaiting_new_product_price") { // Apenas para contas exclusivas agora
                if (!isAdmin && !isProductManager) return;
                const newProductPrice = parseFloat(messageText.replace(",", "."));
                if (isNaN(newProductPrice) || newProductPrice < 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Preço inválido. Por favor, digite um número (ex: 19.99)." });
                    return;
                }
                const newProduct = {
                    id: Date.now().toString(),
                    name: data.newProductName,
                    description: data.newProductDescription,
                    login: data.login,
                    password: data.password,
                    price: newProductPrice,
                    image: data.imagePath,
                    createdAt: Date.now(),
                };
                const currentProducts = loadJsonFile(data.productFile, []);
                currentProducts.push(newProduct);
                saveJsonFile(data.productFile, currentProducts);
                await notifyProductManagersAndAdmins(sock, `📦 *Nova Conta Adicionada!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
                await sendMessage(sock, userJid, { text: `✅ Produto *"${newProduct.name}"* adicionado com sucesso!` });
                delete userState[userJid];
                await sendProductCategoryList(sock, userJid);
            } else if (step === "awaiting_new_product_price_microsoft") {
                if (!isAdmin && !isProductManager) return;
                const microsoftPrice = parseFloat(messageText.replace(",", "."));
                if (isNaN(microsoftPrice) || microsoftPrice < 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Preço inválido. Por favor, digite um número." });
                    return;
                }
                {
                    const langPc = getUserLanguage(userJid);
                    const pcPriceFmt = await formatCurrencyByLanguage(microsoftPrice || 0, langPc);
                    await sendMessage(sock, userJid, { text: `Preço PC: ${pcPriceFmt}. Agora, digite o valor base para *iOS (Apple Store)*:` });
                }
                navigateTo(userJid, "awaiting_new_product_price_ios", { ...data, microsoftPrice });
            } else if (step === "awaiting_new_product_price_ios") {
                if (!isAdmin && !isProductManager) return;
                const iosPrice = parseFloat(messageText.replace(",", "."));
                if (isNaN(iosPrice) || iosPrice < 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Preço inválido. Por favor, digite um número." });
                    return;
                }

                const currentProductData = { ...data, iosPrice };

                // Se está criando nova base, salvar nos basesValores
                if (data.criarNovaBase) {
                    const discountPercentage = shopData.descontoAutomaticoOferta || 30;
                    let calculatedPrice = data.androidPrice - (data.androidPrice * (discountPercentage / 100));
                    const compraMinima = shopData.compraMinima || 20;

                    if (calculatedPrice < compraMinima) {
                        calculatedPrice = compraMinima - 0.01;
                    } else {
                        calculatedPrice = Math.floor(calculatedPrice) + 0.99;
                    }

                    const novaBase = {
                        id: Date.now().toString(),
                        precoVenda: calculatedPrice,
                        precoAndroid: data.androidPrice,
                        precoPc: data.microsoftPrice,
                        precoIos: iosPrice,
                        criadoEm: Date.now()
                    };

                    basesValores.push(novaBase);
                    saveJsonFile(ARQUIVO_BASES_VALORES, basesValores);

                    await sendMessage(sock, userJid, { text: `✅ Nova base de valores salva com sucesso!\n\n💰 Preço de venda: R$ ${calculatedPrice.toFixed(2).replace('.', ',')}\n📱 Android: R$ ${data.androidPrice.toFixed(2).replace('.', ',')}\n💻 PC: R$ ${data.microsoftPrice.toFixed(2).replace('.', ',')}\n🍎 iOS: R$ ${iosPrice.toFixed(2).replace('.', ',')}` });
                    currentProductData.newProductPrice = calculatedPrice;
                }

                await sendMessage(sock, userJid, { text: `Agora, envie a imagem da oferta (ou digite 'pular').` });
                navigateTo(userJid, "awaiting_product_image", currentProductData);

            } else if (step === "awaiting_offer_expiry") {
                if (!isAdmin && !isProductManager) return;
                let expiryTimestamp = null;
                if (messageText.toLowerCase() !== 'pular') {
                    const durationMs = parseDuration(messageText);
                    if (!durationMs) {
                        await sendMessage(sock, userJid, { text: "⚠️ Prazo de validade inválido. Por favor, use formatos como '7d', '24h', '30m' ou 'pular'." });
                        return;
                    }
                    expiryTimestamp = Date.now() + durationMs;
                }

                const newProduct = {
                    id: Date.now().toString(),
                    name: data.newProductName,
                    description: data.newProductDescription,
                    price: data.newProductPrice,
                    basePrices: {
                        google: data.androidPrice,
                        microsoft: data.microsoftPrice,
                        ios: data.iosPrice
                    },
                    image: data.imagePath,
                    createdAt: Date.now(),
                    expiryTimestamp: expiryTimestamp,
                    isVariable: false,
                };

                const basePath = data.category === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const finalFolder = path.basename(data.sectionPath);
                const productFilePath = path.join(basePath, data.sectionPath, `${finalFolder}.json`);
                const currentProducts = loadJsonFile(productFilePath, []);

                currentProducts.push(newProduct);
                saveJsonFile(productFilePath, currentProducts);

                // Adicionar comissão para gerenciador de produto se for oferta (3,00 por oferta adicionada)
                if (data.category === 'ofertas' && isProductManager && productManagerData[userJid]) {
                    const productManagerCommission = shopData.comissoes?.gerenciadorProduto || 3.00;
                    addEarningsToMember(userJid, productManagerCommission, false);
                    productManagerData[userJid].ofertasAdicionadas = (productManagerData[userJid].ofertasAdicionadas || 0) + 1;
                    saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                }

                await notifyProductManagersAndAdmins(sock, `📦 *Novo Produto Adicionado!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
                if (data.category === 'ofertas') {
                    await notifyOfferChannel(sock, `🆕 *Nova Oferta:* ${newProduct.name} - R$ ${Number(newProduct.price || 0).toFixed(2).replace('.', ',')}`);
                }
                await sendMessage(sock, userJid, { text: `✅ Produto *"${newProduct.name}"* adicionado com sucesso na seção *${data.sectionPath}*!` });
                delete userState[userJid];
                await sendProductCategoryList(sock, userJid);
            } else if (step === "awaiting_product_image") {
                if (!isAdmin && !isProductManager) return;
                let imagePath = "";
                let mediaDir = DIRETORIO_MEDIA;
                if (data.category === 'contas_exclusivas') {
                    mediaDir = DIRETORIO_CONTAS_EXCLUSIVAS;
                } else if (data.category === 'esferas') {
                    mediaDir = path.join(DIRETORIO_ESFERAS, data.sectionPath);
                } else if (data.category === 'ofertas') {
                    mediaDir = path.join(DIRETORIO_OFERTAS, data.sectionPath);
                }


                if (msg.message.imageMessage) {
                    const buffer = await downloadMediaMessage(msg, "buffer");
                    const fileName = `${data.newProductName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpeg`;
                    imagePath = path.join(mediaDir, fileName);
                    fs.writeFileSync(imagePath, buffer);
                    await sendMessage(sock, userJid, { text: "✅ Imagem recebida!" });
                } else if (messageText.toLowerCase() === "pular") {
                    await sendMessage(sock, userJid, { text: "🖼️ Imagem ignorada." });
                } else {
                    await sendMessage(sock, userJid, { text: "⚠️ Por favor, envie uma imagem ou digite 'pular'." });
                    return;
                }
                const currentData = { ...data, imagePath };

                if (data.sobEncomenda) {
                    const newProduct = {
                        id: Date.now().toString(),
                        name: data.newProductName,
                        description: data.newProductDescription,
                        rarity: data.rarity,
                        tradeRatio: data.tradeRatio,
                        image: imagePath,
                        createdAt: Date.now(),
                        sobEncomenda: true,
                    };
                    const basePath = DIRETORIO_ESFERAS;
                    const finalFolder = path.basename(data.sectionPath);
                    const productFilePath = path.join(basePath, data.sectionPath, `${finalFolder}.json`);
                    const currentProducts = loadJsonFile(productFilePath, []);
                    currentProducts.push(newProduct);
                    saveJsonFile(productFilePath, currentProducts);
                    await notifyProductManagersAndAdmins(sock, `📦 *Nova Esfera Sob Encomenda Adicionada!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
                    await sendMessage(sock, userJid, { text: `✅ Esfera sob encomenda *"${newProduct.name}"* adicionada com sucesso!` });
                    await sendProductCategoryList(sock, userJid);

                } else if (data.category === 'esferas') {
                    const newProduct = {
                        id: Date.now().toString(),
                        name: data.newProductName,
                        description: data.newProductDescription,
                        rarity: data.rarity,
                        tradeRatio: data.tradeRatio,
                        image: imagePath,
                        createdAt: Date.now(),
                        sobEncomenda: false,
                    };

                    const basePath = DIRETORIO_ESFERAS;
                    const finalFolder = path.basename(data.sectionPath);
                    const productFilePath = path.join(basePath, data.sectionPath, `${finalFolder}.json`);
                    const currentProducts = loadJsonFile(productFilePath, []);

                    currentProducts.push(newProduct);
                    saveJsonFile(productFilePath, currentProducts);

                    await notifyProductManagersAndAdmins(sock, `📦 *Nova Esfera Adicionada!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
                    await sendMessage(sock, userJid, {
                        text: `✅ Esfera *"${newProduct.name}"* adicionada com sucesso!`,
                    });
                    delete userState[userJid];
                    await sendProductCategoryList(sock, userJid);

                }
                else if (data.category === 'ofertas') {
                    // Se os preços já foram definidos (usou base existente), vai para prazo de validade
                    if (data.androidPrice && data.microsoftPrice && data.iosPrice) {
                        await sendMessage(sock, userJid, { text: `Imagem recebida! Agora, digite o *prazo de validade* (ex: 7d, 24h, 30m) ou 'pular':` });
                        navigateTo(userJid, "awaiting_offer_expiry", currentData);
                    } else {
                        // Senão, continua o fluxo normal de perguntar os preços
                        await sendMessage(sock, userJid, { text: `Ok! Agora, qual o valor base para *PC (Microsoft)*?` });
                        navigateTo(userJid, "awaiting_new_product_price_microsoft", currentData);
                    }
                } else { // contas
                    await sendMessage(sock, userJid, { text: `Ok! Agora, qual o *preço* do produto? (ex: 49.99)` });
                    navigateTo(userJid, "awaiting_new_product_price", currentData);
                }
            } else if (step === 'awaiting_comprador_menu_choice') {
                if (!isComprador) return;
                // Suporta lista interativa e modo legacy
                if (messageText === 'comprador_start' || messageText === '1') {
                    await startNextAttendance(sock, userJid);
                } else if (messageText === 'comprador_earnings' || messageText === '2') {
                    await sendMyEarningsMenu(sock, userJid);
                } else if (messageText === 'comprador_notifications' || messageText === '3') {
                    if (!compradoresData[userJid]) compradoresData[userJid] = {};
                    compradoresData[userJid].notificacoes = !compradoresData[userJid].notificacoes;
                    saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                    const status = compradoresData[userJid].notificacoes ? "ATIVADAS" : "DESATIVADAS";
                    await sendMessage(sock, userJid, { text: `🔔 Suas notificações principais foram *${status}*` });
                    await sendCompradorMenu(sock, userJid);
                } else if (messageText === 'comprador_commands' || messageText === '4') {
                    let cmdText = "📜 *Seus Comandos de Atendimento*\n\n";
                    cmdText += "*/face* - Pede verificação no app do Facebook.\n";
                    cmdText += "*/whats* - Pede código enviado ao WhatsApp.\n";
                    cmdText += "*/sms* - Pede código enviado por SMS.\n";
                    cmdText += "*/email* - Pede código enviado ao e-mail.\n";
                    cmdText += "*/entrei* - Avisa que acessou a conta e solicita um cartão se necessário.\n\n";
                    cmdText += "*-- Comandos de Fila de Espera --*\n";
                    cmdText += "*/incorreto* - Informa dados incorretos.\n";
                    cmdText += "*/ausente* - Informa que o cliente está ausente.\n";
                    cmdText += "*/erro* - Informa um erro no processo.\n\n";
                    cmdText += `Digite *0* para voltar.`;
                    await sendMessage(sock, userJid, { text: cmdText });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
                }
            } else if (step === 'awaiting_buyer_notification_toggle') {
                const { notifications } = data;
                const choice = parseInt(messageText);
                if (!isNaN(choice) && choice > 0 && choice <= notifications.length) {
                    const notifToToggle = notifications[choice - 1];
                    if (!compradoresData[userJid].notificacoes_config) {
                        compradoresData[userJid].notificacoes_config = {};
                    }
                    compradoresData[userJid].notificacoes_config[notifToToggle.key] = !compradoresData[userJid].notificacoes_config[notifToToggle.key];
                    saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                    await sendMessage(sock, userJid, { text: `✅ Notificação de *${notifToToggle.label}* ${compradoresData[userJid].notificacoes_config[notifToToggle.key] ? 'ATIVADA' : 'DESATIVADA'}.` });
                    await sendCompradorNotificationsMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, notifications.map((_, i) => `${i + 1}`).concat('0'));
                }
            } else if (step === 'awaiting_earnings_menu_choice') {
                // Permitir para todos os cargos (inclui apoiadores)
                // Suporta lista interativa e modo legacy
                if (messageText === 'earnings_withdraw' || messageText === '1') {
                    const availableAmount = data.available || 0;
                    if (availableAmount <= 0) {
                        await sendMessage(sock, userJid, { text: "Você não tem saldo disponível para saque. 😔" });
                        return;
                    }
                    await sendPixKeySelectionMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
                }
            } else if (step === 'awaiting_apoiadores_menu_choice') {
                if (!isAdmin) return;
                // Suporta lista interativa e modo legacy
                if (messageText === 'apoiador_add' || messageText === '1') {
                    await sendMessage(sock, userJid, { text: "➕ *Adicionar Novo Apoiador*\n\nPor favor, digite o *número do WhatsApp* do novo apoiador (apenas números, com DDD):" });
                    navigateTo(userJid, 'awaiting_new_apoiador_number');
                } else if (messageText === 'apoiador_list' || messageText === '2') {
                    await sendListApoiadores(sock, userJid);
                } else if (messageText === 'apoiador_remove' || messageText === '3') {
                    if (Object.keys(apoiadoresData).length === 0) {
                        await sendMessage(sock, userJid, { text: "⚠️ Não há apoiadores para remover.\n\n0️⃣ ↩️ Voltar" });
                        navigateTo(userJid, 'awaiting_apoiadores_list_back');
                    } else {
                        await sendMessage(sock, userJid, { text: "🗑️ *Remover Apoiador*\n\nDigite o *código* do apoiador que deseja remover:" });
                        navigateTo(userJid, 'awaiting_remove_apoiador_code');
                    }
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                }
            } else if (step === 'awaiting_new_apoiador_number') {
                if (!isAdmin) return;
                const number = messageText.replace(/\D/g, ''); // Remove tudo que não é número
                if (number.length < 10 || number.length > 13) {
                    await sendMessage(sock, userJid, { text: "⚠️ Número inválido. Digite um número válido com DDD (ex: 11999999999):" });
                    return;
                }
                await sendMessage(sock, userJid, { text: `Número: *${number}*\n\nAgora, digite um *código único* para este apoiador (ex: APOIO123):` });
                navigateTo(userJid, 'awaiting_new_apoiador_code', { apoiadorNumber: number });
            } else if (step === 'awaiting_new_apoiador_code') {
                if (!isAdmin) return;
                const code = messageText.trim().toUpperCase();
                const { apoiadorNumber } = data;

                // Verificar se o código já existe
                if (apoiadoresData[code]) {
                    await sendMessage(sock, userJid, { text: `⚠️ O código *${code}* já está em uso. Por favor, escolha outro código:` });
                    return;
                }

                // Criar JID do apoiador
                const apoiadorJid = `${apoiadorNumber}@s.whatsapp.net`;
                const apoiadorName = userData[apoiadorJid]?.nome || `Apoiador ${code}`;

                // Criar apoiador
                apoiadoresData[code] = {
                    ownerJid: apoiadorJid,
                    ownerName: apoiadorName,
                    ownerNumber: apoiadorNumber,
                    comissao: 0.05, // 5%
                    ganhosTotais: 0,
                    caixa: 0,
                    caixaBloqueado: 0,
                    pixKeys: [],
                    usos: 0,
                    ativo: true,
                    criadoEm: new Date().toISOString()
                };

                saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);

                // Enviar mensagem para o apoiador
                const welcomeMessage = `🎉 *Parabéns! Você foi cadastrado como APOIADOR!*\n\n`;
                const welcomeMessage2 = `🔑 *Seu código:* ${code}\n\n`;
                const welcomeMessage3 = `Compartilhe este código com seus amigos! Quando alguém usar seu código e realizar uma compra, você ganha *5% do valor da compra*.\n\n`;
                const welcomeMessage4 = `Você pode acompanhar seus ganhos usando o comando */saque*`;

                try {
                    await sendMessage(sock, apoiadorJid, { text: welcomeMessage + welcomeMessage2 + welcomeMessage3 + welcomeMessage4 });
                } catch (e) {
                    console.error('Erro ao enviar mensagem para apoiador:', e);
                }

                await sendMessage(sock, userJid, { text: `✅ Apoiador cadastrado com sucesso!\n\n👤 Nome: ${apoiadorName}\n📱 Número: ${apoiadorNumber}\n🔑 Código: ${code}` });
                await sendApoiadoresMenu(sock, userJid);
            } else if (step === 'awaiting_remove_apoiador_code') {
                if (!isAdmin) return;
                const code = messageText.trim().toUpperCase();

                if (!apoiadoresData[code]) {
                    await sendMessage(sock, userJid, { text: `⚠️ Código *${code}* não encontrado. Verifique e tente novamente:` });
                    return;
                }

                const apoiador = apoiadoresData[code];
                delete apoiadoresData[code];
                saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);

                await sendMessage(sock, userJid, { text: `✅ Apoiador removido com sucesso!\n\n👤 ${apoiador.ownerName}\n🔑 Código: ${code}` });
                await sendApoiadoresMenu(sock, userJid);
            } else if (step === 'awaiting_apoiadores_list_back') {
                if (!isAdmin) return;
                await sendApoiadoresMenu(sock, userJid);
            } else if (step === 'awaiting_payout_pix_choice') {
                const { pixKeys } = data;
                const earningsMenuState = userState[userJid].history.find(h => h.step === 'awaiting_earnings_menu_choice');
                const availableAmount = earningsMenuState?.data?.available || 0;

                const choice = parseInt(messageText);
                if (!isNaN(choice) && choice > 0 && choice <= pixKeys.length) {
                    const selectedKey = pixKeys[choice - 1];

                    if (availableAmount <= 0) {
                        await sendMessage(sock, userJid, { text: "Você não tem saldo disponível para saque. 😔" });
                        return;
                    }
                    const memberEarnings = getTeamMemberEarnings(userJid);
                    const memberName = userData[userJid]?.nome || userJid.split('@')[0];
                    const langTicket = getUserLanguage(userJid);
                    const availableFmt = await formatCurrencyByLanguage(availableAmount, langTicket);
                    try {
                        const keyType = detectPixKeyType(selectedKey.alias, selectedKey.key);
                        const normalizedKey = normalizePixKey(selectedKey.key);
                        const description = `Saque PowerShop para ${memberName}`;
                        await asaas.createPixTransfer({ value: availableAmount, pixAddressKey: normalizedKey, pixAddressKeyType: keyType, description });

                        const now = new Date();
                        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                        if (adminData[userJid]) {
                            if (!adminData[userJid].monthlyWithdrawals) adminData[userJid].monthlyWithdrawals = {};
                            adminData[userJid].monthlyWithdrawals[monthKey] = (adminData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            adminData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_ADMINS, adminData);
                        } else if (compradoresData[userJid]) {
                            if (!compradoresData[userJid].monthlyWithdrawals) compradoresData[userJid].monthlyWithdrawals = {};
                            compradoresData[userJid].monthlyWithdrawals[monthKey] = (compradoresData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            compradoresData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                        } else if (productManagerData[userJid]) {
                            if (!productManagerData[userJid].monthlyWithdrawals) productManagerData[userJid].monthlyWithdrawals = {};
                            productManagerData[userJid].monthlyWithdrawals[monthKey] = (productManagerData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            productManagerData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                        } else if (gerenciadoresCartaoData[userJid]) {
                            if (!gerenciadoresCartaoData[userJid].monthlyWithdrawals) gerenciadoresCartaoData[userJid].monthlyWithdrawals = {};
                            gerenciadoresCartaoData[userJid].monthlyWithdrawals[monthKey] = (gerenciadoresCartaoData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            gerenciadoresCartaoData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                        } else if (gerenciadoresTrocaRegionalData[userJid]) {
                            if (!gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals) gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals = {};
                            gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals[monthKey] = (gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            gerenciadoresTrocaRegionalData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
                        } else {
                            for (const code in apoiadoresData) {
                                if (apoiadoresData[code].ownerJid === userJid) {
                                    if (!apoiadoresData[code].monthlyWithdrawals) apoiadoresData[code].monthlyWithdrawals = {};
                                    apoiadoresData[code].monthlyWithdrawals[monthKey] = (apoiadoresData[code].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                                    apoiadoresData[code].caixa = 0;
                                    saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
                                    break;
                                }
                            }
                        }

                        await sendMessage(sock, userJid, { text: `✅ Seu saque de ${availableFmt} foi enviado via PIX para a chave *${selectedKey.alias}*.` });
                        const memberCargo = memberEarnings?.cargo || 'Desconhecido';
                        if (adminData[OWNER_JID]?.notificacoes?.saques) {
                            const auditText = `💸 Saque automático realizado\n\n*${memberCargo}:* ${memberName}\n*Valor:* ${availableFmt}\n*Chave PIX:* ${selectedKey.alias} - ${selectedKey.key}`;
                            await sendMessage(sock, OWNER_JID, { text: auditText });
                        }
                        if (isComprador) {
                            await sendCompradorMenu(sock, userJid);
                        } else {
                            delete userState[userJid];
                        }
                    } catch (err) {
                        const memberEarningsCatch = getTeamMemberEarnings(userJid);
                        const memberCargoCatch = memberEarningsCatch?.cargo || 'Desconhecido';
                        const ticketText = `*${memberCargoCatch}:* ${memberName}\n*Valor:* ${availableFmt}\n*Chave PIX:* ${selectedKey.alias} - ${selectedKey.key}\n*Ticket de saque gerado*`;
                        const newTicket = { clientJid: userJid, clientName: memberName, ticketText, timestamp: new Date().toISOString(), notificationKeys: [] };
                        openTickets.push(newTicket);
                        saveJsonFile(ARQUIVO_TICKETS, openTickets);

                        const now = new Date();
                        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                        if (adminData[userJid]) {
                            if (!adminData[userJid].monthlyWithdrawals) adminData[userJid].monthlyWithdrawals = {};
                            adminData[userJid].monthlyWithdrawals[monthKey] = (adminData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            adminData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_ADMINS, adminData);
                        } else if (compradoresData[userJid]) {
                            if (!compradoresData[userJid].monthlyWithdrawals) compradoresData[userJid].monthlyWithdrawals = {};
                            compradoresData[userJid].monthlyWithdrawals[monthKey] = (compradoresData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            compradoresData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                        } else if (productManagerData[userJid]) {
                            if (!productManagerData[userJid].monthlyWithdrawals) productManagerData[userJid].monthlyWithdrawals = {};
                            productManagerData[userJid].monthlyWithdrawals[monthKey] = (productManagerData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            productManagerData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                        } else if (gerenciadoresCartaoData[userJid]) {
                            if (!gerenciadoresCartaoData[userJid].monthlyWithdrawals) gerenciadoresCartaoData[userJid].monthlyWithdrawals = {};
                            gerenciadoresCartaoData[userJid].monthlyWithdrawals[monthKey] = (gerenciadoresCartaoData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            gerenciadoresCartaoData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                        } else if (gerenciadoresTrocaRegionalData[userJid]) {
                            if (!gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals) gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals = {};
                            gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals[monthKey] = (gerenciadoresTrocaRegionalData[userJid].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                            gerenciadoresTrocaRegionalData[userJid].caixa = 0;
                            saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
                        } else {
                            for (const code in apoiadoresData) {
                                if (apoiadoresData[code].ownerJid === userJid) {
                                    if (!apoiadoresData[code].monthlyWithdrawals) apoiadoresData[code].monthlyWithdrawals = {};
                                    apoiadoresData[code].monthlyWithdrawals[monthKey] = (apoiadoresData[code].monthlyWithdrawals[monthKey] || 0) + availableAmount;
                                    apoiadoresData[code].caixa = 0;
                                    saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
                                    break;
                                }
                            }
                        }

                        const notificationText = `💸 *NOVA SOLICITAÇÃO DE SAQUE* 💸\n\n${ticketText}\n\nPor favor, processe o pagamento e interaja com este ticket no painel de admin.`;
                        for (const adminJid in adminData) {
                            if (adminData[adminJid].notificacoes?.saques) {
                                try {
                                    const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                                    if (sentMsg?.key) newTicket.notificationKeys.push(sentMsg.key);
                                } catch (e) {
                                    console.error(`Falha ao notificar admin ${adminJid}`);
                                }
                            }
                        }
                        saveJsonFile(ARQUIVO_TICKETS, openTickets);
                        await sendMessage(sock, userJid, { text: "⚠️ Não foi possível processar seu saque automaticamente. Sua solicitação foi enviada aos administradores e seu caixa foi zerado." });
                        if (isComprador) {
                            await sendCompradorMenu(sock, userJid);
                        } else {
                            delete userState[userJid];
                        }
                    }

                } else if (choice === pixKeys.length + 1) {
                    await sendMessage(sock, userJid, { text: "Por favor, digite um *apelido* para esta nova chave (ex: PIX Celular):" });
                    navigateTo(userJid, 'awaiting_new_pix_alias');
                } else {
                    await sendInvalidOptionMessage(sock, userJid, pixKeys.map((_, i) => `${i + 1}`).concat(`${pixKeys.length + 1}`, '0'));
                }
            } else if (step === 'awaiting_new_pix_alias') {
                const alias = messageText.trim();
                await sendMessage(sock, userJid, { text: `Apelido: *${alias}*. Agora, digite a chave PIX:` });
                navigateTo(userJid, 'awaiting_new_pix_key', { alias });
            } else if (step === 'awaiting_new_pix_key') {
                const key = messageText.trim();
                const { alias } = data;

                // Adicionar chave PIX para todos os tipos de equipe (incluindo apoiadores)
                if (adminData[userJid]) {
                    if (!adminData[userJid].pixKeys) adminData[userJid].pixKeys = [];
                    adminData[userJid].pixKeys.push({ alias, key });
                    saveJsonFile(ARQUIVO_ADMINS, adminData);
                } else if (compradoresData[userJid]) {
                    if (!compradoresData[userJid].pixKeys) compradoresData[userJid].pixKeys = [];
                    compradoresData[userJid].pixKeys.push({ alias, key });
                    saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                } else if (productManagerData[userJid]) {
                    if (!productManagerData[userJid].pixKeys) productManagerData[userJid].pixKeys = [];
                    productManagerData[userJid].pixKeys.push({ alias, key });
                    saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
                } else if (gerenciadoresCartaoData[userJid]) {
                    if (!gerenciadoresCartaoData[userJid].pixKeys) gerenciadoresCartaoData[userJid].pixKeys = [];
                    gerenciadoresCartaoData[userJid].pixKeys.push({ alias, key });
                    saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                } else if (gerenciadoresTrocaRegionalData[userJid]) {
                    if (!gerenciadoresTrocaRegionalData[userJid].pixKeys) gerenciadoresTrocaRegionalData[userJid].pixKeys = [];
                    gerenciadoresTrocaRegionalData[userJid].pixKeys.push({ alias, key });
                    saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
                } else {
                    // Verificar se é apoiador
                    for (const code in apoiadoresData) {
                        if (apoiadoresData[code].ownerJid === userJid) {
                            if (!apoiadoresData[code].pixKeys) apoiadoresData[code].pixKeys = [];
                            apoiadoresData[code].pixKeys.push({ alias, key });
                            saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
                            break;
                        }
                    }
                }

                await sendMessage(sock, userJid, { text: `✅ Chave PIX *${alias}* salva com sucesso!` });
                await sendPixKeySelectionMenu(sock, userJid);
            } else if (step === 'awaiting_new_card_choice_after_login') {
                if (messageText === '1') {
                    // Limpa o estado e dispara o comando /cartao
                    delete userState[userJid];
                    const commandMessage = { ...msg, message: { conversation: '/cartao' } };
                    sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
                    return; // Retorna para evitar que o fluxo continue
                } else if (messageText === '2') {
                    await sendMessage(sock, userJid, { text: "Ok, prossiga com a compra sem um novo cartão." });
                    const order = pendingOrders.find(o => o.atendido_por === userJid) || pendingOrdersV.find(o => o.atendido_por === userJid);
                    if (order) {
                        navigateTo(userJid, 'in_direct_chat', { partnerJid: order.clientJid, orderId: order.id });
                    } else {
                        delete userState[userJid];
                    }
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_card_usability') {
                const { usedCard } = data;
                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: "Ótimo! Continue com o atendimento." });
                    const order = pendingOrders.find(o => o.atendido_por === userJid) || pendingOrdersV.find(o => o.atendido_por === userJid);
                    if (order) {
                        navigateTo(userJid, 'in_direct_chat', { partnerJid: order.clientJid, orderId: order.id });
                    } else {
                        delete userState[userJid];
                    }
                } else if (messageText === '2') {
                    const cardIndex = shopData.cartoes.findIndex(c => c.id === usedCard.id);
                    if (cardIndex > -1) {
                        shopData.cartoes.splice(cardIndex, 1);
                        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);

                        const notificationText = `🚨 *ALERTA DE CARTÃO REMOVIDO* 🚨\n\nO cartão com final \`...${usedCard.numero.slice(-4)}\` foi reportado como inutilizável e removido do sistema.\n\nPor favor, adicione novos cartões usando o comando /addcartao.`;
                        for (const managerJid in gerenciadoresCartaoData) {
                            try {
                                await sendMessage(sock, managerJid, { text: notificationText });
                            } catch (e) { console.error(`Falha ao notificar gerenciador de cartão ${managerJid}`); }
                        }
                        if (shopData.cartoes.length === 0) {
                            await sendMessage(sock, userJid, { text: "Seu relato foi registrado e o cartão foi removido. 💳 *Atenção: Não há mais cartões disponíveis no sistema!*" });
                        } else {
                            await sendMessage(sock, userJid, { text: "Seu relato foi registrado e o cartão foi removido. Solicitando um novo cartão..." });
                            const commandMessage = { ...msg, message: { conversation: '/cartao' } };
                            sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
                        }

                    } else {
                        await sendMessage(sock, userJid, { text: "Este cartão já foi removido. Solicitando um novo..." });
                        const commandMessage = { ...msg, message: { conversation: '/cartao' } };
                        sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
                    }
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
                }
            } else if (step === 'awaiting_new_card_number') {
                const { personData } = data;
                const numero = messageText.replace(/\D/g, '');
                if (numero.length < 13 || numero.length > 19) {
                    await sendMessage(sock, userJid, { text: "Número de cartão inválido. Tente novamente." });
                    return;
                }
                await sendMessage(sock, userJid, { text: "Número recebido. Agora, por favor, envie o *CVV*." });
                navigateTo(userJid, 'awaiting_new_card_cvv', { personData, numero });
            } else if (step === 'awaiting_new_card_cvv') {
                const cvv = messageText.replace(/\D/g, '');
                if (cvv.length < 3 || cvv.length > 4) {
                    await sendMessage(sock, userJid, { text: "CVV inválido. Tente novamente." });
                    return;
                }
                await sendMessage(sock, userJid, { text: "CVV recebido. Por fim, qual o *tipo* do cartão?\n\n*1* - C6\n*2* - Nubank\n*3* - Outro" });
                navigateTo(userJid, 'awaiting_new_card_type', { ...data, cvv });
            } else if (step === 'awaiting_new_card_type') {
                let tipo = 'outro';
                if (messageText === '1') tipo = 'c6';
                if (messageText === '2') tipo = 'nubank';

                const { personData, numero, cvv } = data;

                const now = new Date();
                const month = (now.getMonth() + 1).toString().padStart(2, '0');
                let year;
                if (tipo === 'c6') {
                    year = (now.getFullYear() + 9).toString().slice(-2);
                } else if (tipo === 'nubank') {
                    year = (now.getFullYear() + 8).toString().slice(-2);
                } else {
                    year = (now.getFullYear() + 5).toString().slice(-2);
                }
                const dataValidade = `${month}/${year}`;

                const newCard = {
                    id: `card${Date.now()}`,
                    nome: personData.nome,
                    sobrenome: personData.sobrenome,
                    numero: numero,
                    nomeTitular: `${personData.nome} ${personData.sobrenome}`,
                    cvv: cvv,
                    dataValidade: dataValidade,
                    endereco: personData.endereco,
                    cidade: personData.cidade,
                    estado: personData.estado,
                    cep: personData.cep,
                    tipo: tipo,
                    responsavel: userJid // Adiciona o responsável
                };

                shopData.cartoes.push(newCard);
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                await sendMessage(sock, userJid, { text: `✅ Cartão de *${newCard.nomeTitular}* com final \`${newCard.numero.slice(-4)}\` adicionado com sucesso!` });
                await sendAdminPanel(sock, userJid);
            }
            else if (step === 'awaiting_ms_account_for_item') {
                const { order, collectedEmails, itemIndex } = data;
                const email = messageText.trim();

                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de e-mail inválido. Por favor, tente novamente." });
                    return;
                }

                const currentItem = order.items[itemIndex];
                let newCollectedEmails = [...collectedEmails];

                // Verifica se já existe um email para este índice e o remove se existir
                if (newCollectedEmails[itemIndex]) {
                    newCollectedEmails.splice(itemIndex, 1);
                }

                newCollectedEmails.push({
                    email: email,
                    itemName: currentItem.name,
                    itemValue: currentItem.basePrices?.microsoft || currentItem.price || 0
                });

                const nextItemIndex = itemIndex + 1;

                if (nextItemIndex < order.items.length) {
                    navigateTo(userJid, 'awaiting_ms_account_for_item', { order, collectedEmails: newCollectedEmails, itemIndex: nextItemIndex });
                    const nextItem = order.items[nextItemIndex];
                    const lang = getUserLanguage(userJid);
                    const pcValue = nextItem.basePrices?.microsoft || 0;
                    const pcPriceText = pcValue ? `(${await formatCurrencyByLanguage(pcValue, lang)})` : '';
                    await sendMessage(sock, userJid, { text: `Digite o email em que você realizou a compra do pacote:\n*${nextItem.name}* ${pcPriceText}` });
                } else {
                    const clientUser = userData[order.clientJid];
                    const accountIndex = clientUser?.savedAccounts.findIndex(acc => acc.login === order.facebookLogin);

                    if (clientUser && accountIndex > -1 && clientUser.savedAccounts[accountIndex].verified) {
                        const commandMessage = { ...msg, message: { conversation: '2' } }; // Simula "Não"
                        userState[userJid].history.push({ step: 'awaiting_final_verification_choice', data: { order, collectedEmails: newCollectedEmails } });
                        sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
                    } else {
                        await sendMessage(sock, userJid, { text: `E-mail(s) coletado(s). Você deseja verificar a conta do cliente?\n\n1️⃣ Sim\n2️⃣ Não` });
                        navigateTo(userJid, 'awaiting_final_verification_choice', { order, collectedEmails: newCollectedEmails });
                    }
                }
            }
            else if (step === 'awaiting_ms_account_single') {
                const { order, collectedEmails } = data;
                const email = messageText.trim();

                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de e-mail inválido. Por favor, tente novamente." });
                    return;
                }

                const orderTotal = (order.total || 0) || (Array.isArray(order.items) ? order.items.reduce((sum, it) => sum + (it.basePrices?.microsoft || it.price || 0), 0) : 0);
                const itemName = (Array.isArray(order.items) && order.items.length === 1) ? order.items[0].name : 'Pedido';

                const newCollectedEmails = [{
                    email: email,
                    itemName: itemName,
                    itemValue: orderTotal
                }];

                const clientUser = userData[order.clientJid];
                const accountIndex = clientUser?.savedAccounts.findIndex(acc => acc.login === order.facebookLogin);

                if (clientUser && accountIndex > -1 && clientUser.savedAccounts[accountIndex].verified) {
                    const commandMessage = { ...msg, message: { conversation: '2' } }; // Simula "Não"
                    userState[userJid].history.push({ step: 'awaiting_final_verification_choice', data: { order, collectedEmails: newCollectedEmails } });
                    sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
                } else {
                    await sendMessage(sock, userJid, { text: `E-mail coletado. Você deseja verificar a conta do cliente?\n\n1️⃣ Sim\n2️⃣ Não` });
                    navigateTo(userJid, 'awaiting_final_verification_choice', { order, collectedEmails: newCollectedEmails });
                }
            }
            else if (step === 'awaiting_final_verification_choice') {
                const { order, collectedEmails } = data;
                const isVerifiedQueue = order.sourceQueue === 'verified';
                const orderList = isVerifiedQueue ? pendingOrdersV : pendingOrders;
                const orderFile = isVerifiedQueue ? ARQUIVO_PEDIDOS_V : ARQUIVO_PEDIDOS;
                const orderIndex = orderList.findIndex(o => o.id === order.id);

                if (orderIndex === -1) {
                    console.error(`Erro: Pedido #${order.id} não encontrado na lista correta para finalização.`);
                    await sendMessage(sock, userJid, { text: "❌ Erro crítico: Não foi possível encontrar o pedido para finalizar. Contate o suporte." });
                    return;
                }

                const [finalizedOrder] = orderList.splice(orderIndex, 1);
                const sellerJid = finalizedOrder.atendido_por;
                const clientJid = finalizedOrder.clientJid;

                activeChats = activeChats.filter(c => c.orderId !== order.id);
                saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);

                const comissoes = shopData.comissoes || { porCompra: 8.00, porVerificacao: 0.50 };
                const commissionPerItem = comissoes.porCompra || 8.00;
                const verificationCommission = comissoes.porVerificacao || 0.50;

                const quantity = finalizedOrder.items.length;
                let totalCommission = commissionPerItem * quantity;

                if (messageText === '1') { // Sim, verificar
                    const clientUser = userData[clientJid];
                    const accountIndex = clientUser?.savedAccounts.findIndex(acc => acc.login === finalizedOrder.facebookLogin);
                    if (clientUser && accountIndex > -1 && !clientUser.savedAccounts[accountIndex].verified) {
                        clientUser.savedAccounts[accountIndex].verified = true;
                        clientUser.savedAccounts[accountIndex].verificationStatus = 'verified';
                        shopData.contasVerificadas = (shopData.contasVerificadas || 0) + 1;

                        if (compradoresData[userJid]) {
                            compradoresData[userJid].ganhosTotais = (compradoresData[userJid].ganhosTotais || 0) + verificationCommission;
                            compradoresData[userJid].caixa = (compradoresData[userJid].caixa || 0) + verificationCommission;
                            saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                        }

                        await sendMessage(sock, clientJid, { text: `🎉 Boas notícias! O comprador aproveitou o momento da sua compra para verificar sua conta. Agora você tem acesso a todos os benefícios de uma conta verificada!` });
                        {
                            const staffLang2 = getUserLanguage(userJid);
                            const bonusFmt = await formatCurrencyByLanguage(verificationCommission || 0, staffLang2);
                            await sendMessage(sock, userJid, { text: `✅ Conta do cliente verificada com sucesso! Você ganhou um bônus de ${bonusFmt} na sua comissão.` });
                        }

                        const pendingOrderIndex = pendingOrders.findIndex(o => o.clientJid === clientJid && o.status === 'pendente');
                        if (pendingOrderIndex > -1) {
                            const [orderToMove] = pendingOrders.splice(pendingOrderIndex, 1);
                            orderToMove.sourceQueue = 'verified';
                            pendingOrdersV.push(orderToMove);
                            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
                            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
                            await sendMessage(sock, clientJid, { text: "Detectamos que você tinha outro pedido na fila. Ele foi movido para a fila prioritária!" });
                        }

                        saveJsonFile(ARQUIVO_USUARIOS, userData);
                        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                    } else {
                        await sendMessage(sock, userJid, { text: `ℹ️ A conta do cliente já estava verificada ou não foi encontrada. Nenhum bônus foi aplicado.` });
                    }
                }

                if (sellerJid && compradoresData[sellerJid]) {
                    compradoresData[sellerJid].ganhosTotais = (compradoresData[sellerJid].ganhosTotais || 0) + totalCommission;
                    compradoresData[sellerJid].caixa = (compradoresData[sellerJid].caixa || 0) + totalCommission;
                    compradoresData[sellerJid].vendas = (compradoresData[sellerJid].vendas || 0) + 1;
                    saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                }

                // Adicionar comissões para admins (por produto)
                const adminCommissionPerItem = shopData.comissoes?.admin || 0.75;
                const adminCommissionTotal = adminCommissionPerItem * quantity;
                Object.keys(adminData).forEach(adminJid => {
                    addEarningsToMember(adminJid, adminCommissionTotal, false);
                });

                // Adicionar comissões para gerenciadores de cartão (por produto)
                const cardManagerCommissionPerItem = shopData.comissoes?.gerenciadorCartao || 0.75;
                const cardManagerCommissionTotal = cardManagerCommissionPerItem * quantity;
                Object.keys(gerenciadoresCartaoData).forEach(managerJid => {
                    addEarningsToMember(managerJid, cardManagerCommissionTotal, false);
                });

                // Adicionar comissões para gerenciadores de troca regional (por produto)
                const regionalManagerCommissionPerItem = shopData.comissoes?.gerenciadorTrocaRegional || 0.50;
                const regionalManagerCommissionTotal = regionalManagerCommissionPerItem * quantity;
                Object.keys(gerenciadoresTrocaRegionalData).forEach(managerJid => {
                    addEarningsToMember(managerJid, regionalManagerCommissionTotal, false);
                });

                const userHistory = purchaseHistoryData[clientJid] || [];
                const historyOrder = userHistory.find(h => h.id === finalizedOrder.id);
                if (historyOrder) {
                    historyOrder.statusDisplay = 'Concluído';
                    purchaseHistoryData[clientJid] = userHistory;
                    saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
                }
                saveJsonFile(orderFile, orderList);


                const buyerNameForEmail = userData[userJid]?.nome || "Comprador";

                const emailDataToSave = collectedEmails.map(item => {
                    const key = `${buyerNameForEmail}__${item.email}`;
                    let existingEntry = Object.values(finishedEmails).flat().find(e => e.email === item.email && e.buyerName === buyerNameForEmail);

                    return {
                        ...item,
                        buyerName: buyerNameForEmail,
                        originalTimestamp: existingEntry ? existingEntry.originalTimestamp : new Date().toISOString()
                    };
                });

                if (!finishedEmails[buyerNameForEmail]) {
                    finishedEmails[buyerNameForEmail] = [];
                }
                finishedEmails[buyerNameForEmail].push(...emailDataToSave);
                saveJsonFile(ARQUIVO_EMAILS_FINALIZADOS, finishedEmails);

                const finalTextClient = `✅ *Pedido Entregue!* 🎉\n\nAgradecemos pela sua preferência! 💎\n\nDeixe seu feedback em nosso chat:\n➙ https://bit.ly/Powershop-chat\n\nE não se esqueça de seguir nosso canal de ofertas para não perder nenhuma novidade:\n➙ https://bit.ly/powershop-loja`;
                await sendMessage(sock, clientJid, { text: finalTextClient });

                const emailsFormatted = collectedEmails.map(e => e.email).join('\n');
                let finalTextBuyer = `✅ *Pedido Entregue!* \n`;
                finalTextBuyer += `*Produto(s):* ${finalizedOrder.items.map(i => i.name).join(', ')}\n`;
                finalTextBuyer += `*E-mails utilizados:*\n${emailsFormatted}\n`;
                const buyerCommissionFmt = await formatCurrencyByLanguage(totalCommission || 0, getUserLanguage(userJid));
                finalTextBuyer += `*Sua Comissão:* ${buyerCommissionFmt}`;
                await sendMessage(sock, userJid, { text: finalTextBuyer });

                // Notificação para Administradores

                for (const adminJid in adminData) {
                    if (adminData[adminJid].notificacoes?.compraFinalizada) {
                        try {
                            const adminLang = getUserLanguage(adminJid);
                            const valorFmt = await formatCurrencyByLanguage(finalizedOrder.total || 0, adminLang);
                            const comissaoFmt = await formatCurrencyByLanguage(totalCommission || 0, adminLang);
                            let adminNotificationMsg = `✅ *Pedido Entregue!*\n\n`;
                            adminNotificationMsg += `👤 *Cliente:* ${finalizedOrder.clientName}\n`;
                            adminNotificationMsg += `📦 *Produto(s):* ${finalizedOrder.items.map(i => i.name).join(', ')}\n`;
                            adminNotificationMsg += `💵 *Valor:* ${valorFmt}\n`;
                            adminNotificationMsg += `📧 *E-mails utilizados:*\n${emailsFormatted}\n`;
                            adminNotificationMsg += `💰 *Comissão do Vendedor:* ${comissaoFmt}`;
                            await sendMessage(sock, adminJid, { text: adminNotificationMsg });
                        } catch (e) { console.error(`Erro ao notificar admin ${adminJid}`); }
                    }
                }

                // Notificação para Gerenciadores de Troca Regional com prazo de 2 horas
                const regionalDeadline = new Date(Date.now() + (2 * 60 * 60 * 1000)); // 2 horas a partir de agora
                const deadlineFormatted = regionalDeadline.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                const attendantName = (userData[sellerJid]?.nome) ? userData[sellerJid].nome : (sellerJid ? sellerJid.split('@')[0] : 'Atendente');
                let regionalNotification = `🌍 *Nova Troca Regional Necessária!*\n\n`;
                regionalNotification += `👤 *Atendente:* ${attendantName}\n`;
                regionalNotification += `🛍️ *Comprador:* ${finalizedOrder.clientName}\n`;
                regionalNotification += `📦 *Produto(s):* ${finalizedOrder.items.map(i => i.name).join(', ')}\n`;
                regionalNotification += `📧 *E-mails utilizados:*\n${emailsFormatted}\n\n`;
                regionalNotification += `⏰ *PRAZO PARA TROCA:* até ${deadlineFormatted} (2 horas)\n\n`;
                regionalNotification += `⚠️ Por favor, realize a troca de região dentro do prazo estabelecido!`;

                for (const regionalJid in gerenciadoresTrocaRegionalData) {
                    try {
                        await sendMessage(sock, regionalJid, { text: regionalNotification });
                    } catch (e) { console.error(`Erro ao notificar gerenciador regional ${regionalJid}`); }
                }

                delete userState[userJid];
                delete userState[clientJid];

                const updatedPendingOrders = [...pendingOrdersV, ...pendingOrders].filter(o => o.status === 'pendente');
                if (updatedPendingOrders.length > 0) {
                    await sendMessage(sock, userJid, { text: `Restam *${updatedPendingOrders.length}* pedidos pendentes. Deseja atender o próximo?\n\n1️⃣ Sim\n2️⃣ Não` });
                    navigateTo(userJid, 'awaiting_next_order_choice');
                } else {
                    await sendMessage(sock, userJid, { text: "🎉 Ótimo trabalho! Todos os pedidos foram processados." });
                }
            } else if (step === 'awaiting_edit_attribute_choice') {
                const { product, category, section, optionsMap } = data;
                let attributeToEdit = null;

                for (const [key, value] of Object.entries(optionsMap)) {
                    if (messageText === value) {
                        attributeToEdit = key;
                        break;
                    }
                }

                if (attributeToEdit) {
                    let promptText = "";
                    switch (attributeToEdit) {
                        case 'name': promptText = "Digite o novo nome:"; break;
                        case 'description': promptText = "Digite a nova descrição:"; break;
                        case 'price': promptText = "Digite o novo preço de venda:"; break;
                        case 'image': promptText = "Envie a nova imagem:"; break;
                        case 'expiry': promptText = "Digite o novo prazo (ex: 7d, 24h) ou 'remover':"; break;
                        case 'basePrices': promptText = "Digite o novo valor base para Android:"; break;
                        case 'login': promptText = "Digite o novo login:"; break;
                        case 'password': promptText = "Digite a nova senha:"; break;
                    }
                    await sendMessage(sock, userJid, { text: promptText });
                    navigateTo(userJid, 'awaiting_new_attribute_value', { product, category, section, attributeToEdit });
                } else {
                    await sendInvalidOptionMessage(sock, userJid, Object.values(optionsMap).concat('0'));
                }
            }
            else if (step === 'awaiting_new_attribute_value') {
                const { product, category, section, attributeToEdit } = data;
                let newValue = messageText;
                let updatedProduct = { ...product };
                let requiresImage = false;

                if (attributeToEdit === 'price') {
                    newValue = parseFloat(newValue.replace(',', '.'));
                    if (isNaN(newValue)) {
                        await sendMessage(sock, userJid, { text: "Valor inválido." });
                        return;
                    }
                } else if (attributeToEdit === 'image') {
                    if (!msg.message.imageMessage) {
                        await sendMessage(sock, userJid, { text: "Por favor, envie uma imagem." });
                        return;
                    }
                    requiresImage = true;
                } else if (attributeToEdit === 'expiry') {
                    if (newValue.toLowerCase() === 'remover') {
                        newValue = null;
                    } else {
                        const durationMs = parseDuration(newValue);
                        if (!durationMs) {
                            await sendMessage(sock, userJid, { text: "Formato de prazo inválido." });
                            return;
                        }
                        newValue = Date.now() + durationMs;
                    }
                } else if (attributeToEdit === 'basePrices') {
                    const androidValue = parseFloat(newValue.replace(',', '.'));
                    if (isNaN(androidValue)) {
                        await sendMessage(sock, userJid, { text: "Valor inválido." });
                        return;
                    }
                    if (!updatedProduct.basePrices) updatedProduct.basePrices = {};
                    updatedProduct.basePrices.google = androidValue; // Começa com Android
                    await sendMessage(sock, userJid, { text: "Valor do Android atualizado. Agora, digite o valor para PC:" });
                    navigateTo(userJid, 'awaiting_edit_base_price_pc', { updatedProduct, category, section });
                    return; // Retorna para não salvar o produto ainda
                }


                if (requiresImage) {
                    const buffer = await downloadMediaMessage(msg, "buffer");
                    const newFileName = `${updatedProduct.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpeg`;

                    const imageDir = category === 'ofertas' ? path.join(DIRETORIO_OFERTAS, section) : (category === 'contas_exclusivas' ? DIRETORIO_CONTAS_EXCLUSIVAS : path.join(DIRETORIO_PRODUTOS, 'esferas', section));

                    if (product.image && fs.existsSync(product.image)) {
                        try { fs.unlinkSync(product.image) } catch (e) { }
                    }

                    const imagePath = path.join(imageDir, newFileName);
                    fs.writeFileSync(imagePath, buffer);
                    updatedProduct.image = imagePath;
                } else if (attributeToEdit === 'expiry') {
                    updatedProduct.expiryTimestamp = newValue;
                } else {
                    updatedProduct[attributeToEdit] = newValue;
                }

                let productFile;
                let products;
                const basePath = category === 'ofertas' ? DIRETORIO_OFERTAS : (category === 'esferas' ? DIRETORIO_ESFERAS : null);

                if (basePath) {
                    const finalFolder = path.basename(section);
                    productFile = path.join(basePath, section, `${finalFolder}.json`);
                } else if (category === 'contas_exclusivas') {
                    productFile = ARQUIVO_CONTAS_EXCLUSIVAS_JSON;
                }

                products = loadJsonFile(productFile, []);
                const productIndex = products.findIndex(p => p.id === product.id);
                if (productIndex > -1) {
                    products[productIndex] = updatedProduct;
                    saveJsonFile(productFile, products);
                    await sendMessage(sock, userJid, { text: `✅ Atributo *${attributeToEdit}* do produto *${product.name}* atualizado com sucesso!` });
                    await sendProductCategoryList(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Erro ao encontrar o produto para atualizar." });
                }
            }
            else if (step === 'awaiting_edit_base_price_pc') {
                const { updatedProduct, category, section } = data;
                const pcValue = parseFloat(messageText.replace(',', '.'));
                if (isNaN(pcValue)) {
                    await sendMessage(sock, userJid, { text: "Valor inválido." });
                    return;
                }
                updatedProduct.basePrices.microsoft = pcValue;
                await sendMessage(sock, userJid, { text: "Valor do PC atualizado. Agora, digite o valor para iOS:" });
                navigateTo(userJid, 'awaiting_edit_base_price_ios', { updatedProduct, category, section });
            }
            else if (step === 'awaiting_edit_base_price_ios') {
                const { updatedProduct, category, section } = data;
                const iosValue = parseFloat(messageText.replace(',', '.'));
                if (isNaN(iosValue)) {
                    await sendMessage(sock, userJid, { text: "Valor inválido." });
                    return;
                }
                updatedProduct.basePrices.ios = iosValue;

                let productFile;
                const basePath = category === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const finalFolder = path.basename(section);
                productFile = path.join(basePath, section, `${finalFolder}.json`);

                let products = loadJsonFile(productFile, []);
                const productIndex = products.findIndex(p => p.id === updatedProduct.id);
                if (productIndex > -1) {
                    products[productIndex] = updatedProduct;
                    saveJsonFile(productFile, products);
                    await sendMessage(sock, userJid, { text: `✅ Valores base do produto *${updatedProduct.name}* atualizados com sucesso!` });
                    await sendProductCategoryList(sock, userJid);
                } else {
                    await sendMessage(sock, userJid, { text: "❌ Erro ao encontrar o produto para atualizar." });
                }
            }
            else if (step === 'awaiting_email_management_choice') {
                const { buyers, emails } = data;
                const choice = messageText.trim().toUpperCase();

                if (choice === 'X') {
                    finishedEmails = {};
                    saveJsonFile(ARQUIVO_EMAILS_FINALIZADOS, finishedEmails);
                    await sendMessage(sock, userJid, { text: `✅ Todos os e-mails de todos os compradores foram removidos.` });
                    await sendAdminPanel(sock, userJid);
                    return;
                }

                if (buyers[choice]) {
                    const buyerNameToDelete = buyers[choice];
                    if (finishedEmails[buyerNameToDelete]) {
                        delete finishedEmails[buyerNameToDelete];
                        saveJsonFile(ARQUIVO_EMAILS_FINALIZADOS, finishedEmails);
                        await sendMessage(sock, userJid, { text: `✅ Todos os e-mails de *${buyerNameToDelete}* foram removidos.` });
                    } else {
                        await sendMessage(sock, userJid, { text: `Nenhum e-mail encontrado para ${buyerNameToDelete}.` });
                    }
                    const remaining = Object.values(finishedEmails).flat();
                    if (remaining.length > 0) {
                        await sendAdminEmailsList(sock, userJid);
                    } else {
                        await sendAdminPanel(sock, userJid);
                    }
                } else {
                    const choiceAsNumber = parseInt(choice);
                    if (!isNaN(choiceAsNumber) && emails[choiceAsNumber]) {
                        const selectedEmailData = emails[choiceAsNumber];
                        const confirmationText = `Conseguiu fazer a troca de região do email *${selectedEmailData.email}*?\n\n*Digite:*\n1️⃣ Sim\n2️⃣ Não`;
                        await sendMessage(sock, userJid, { text: confirmationText });
                        navigateTo(userJid, 'awaiting_email_outcome', { emailData: selectedEmailData });
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, ['X', '0'].concat(Object.keys(emails), Object.keys(buyers)));
                    }
                }
            } else if (step === 'awaiting_email_outcome') {
                const { emailData } = data;
                const buyerName = emailData.buyerName;
                const totalValue = emailData.totalValue;

                if (finishedEmails[buyerName]) {
                    finishedEmails[buyerName] = finishedEmails[buyerName].filter(e => e.email !== emailData.email);
                    if (finishedEmails[buyerName].length === 0) {
                        delete finishedEmails[buyerName];
                    }
                }

                if (messageText === '1') {
                    await sendMessage(sock, userJid, { text: `✅ E-mail *${emailData.email}* removido com sucesso.` });
                } else if (messageText === '2') {
                    shopData.valorPerdido = (shopData.valorPerdido || 0) + totalValue;
                    await sendMessage(sock, userJid, { text: `✅ E-mail removido. O valor de R$ ${totalValue.toFixed(2).replace('.', ',')} foi adicionado ao "Valor Perdido".` });
                }

                saveJsonFile(ARQUIVO_EMAILS_FINALIZADOS, finishedEmails);
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                const remaining = Object.values(finishedEmails).flat();
                if (remaining.length > 0) {
                    await sendAdminEmailsList(sock, userJid);
                } else {
                    await sendAdminPanel(sock, userJid);
                }
            } else if (step === 'awaiting_comprador_email_choice') {
                const { options } = data;
                const choice = messageText.trim().toUpperCase();

                if (choice === 'X') {
                    const buyerName = userData[userJid]?.nome;
                    if (finishedEmails[buyerName]) {
                        delete finishedEmails[buyerName];
                        saveJsonFile(ARQUIVO_EMAILS_FINALIZADOS, finishedEmails);
                        await sendMessage(sock, userJid, { text: `✅ Todos os seus e-mails foram removidos.` });
                    }
                    await sendCompradorMenu(sock, userJid);
                } else {
                    const choiceAsNumber = parseInt(choice);
                    if (!isNaN(choiceAsNumber) && options[choiceAsNumber]) {
                        const emailDataToRemove = options[choiceAsNumber];
                        const buyerName = userData[userJid]?.nome;
                        if (finishedEmails[buyerName]) {
                            finishedEmails[buyerName] = finishedEmails[buyerName].filter(e => e.email !== emailDataToRemove.email);
                            if (finishedEmails[buyerName].length === 0) {
                                delete finishedEmails[buyerName];
                            }
                            saveJsonFile(ARQUIVO_EMAILS_FINALIZADOS, finishedEmails);
                            await sendMessage(sock, userJid, { text: `✅ E-mail *${emailDataToRemove.email}* removido.` });
                        }
                        await sendCompradorMenu(sock, userJid);
                    } else {
                        await sendInvalidOptionMessage(sock, userJid, ['X', '0'].concat(Object.keys(options)));
                    }
                }
            }
            // Bloco para o menu principal de verificação
            else if (step === 'awaiting_verification_main_menu_choice') {
                const { accountIndex } = data;
                if (messageText === '1') {
                    await handleVerificationRequest(sock, userJid, accountIndex);
                } else if (messageText === '2') {
                    await sendVerificationTutorial(sock, userJid, accountIndex);
                } else {
                    await sendGameAccountManagementMenu(sock, userJid);
                }
            }

            // Bloco para a escolha após o tutorial
            else if (step === 'awaiting_tutorial_verification_choice') {
                const { accountIndex } = data;
                if (messageText === '1') {
                    await handleVerificationRequest(sock, userJid, accountIndex);
                } else {
                    await sendMainMenu(sock, userJid);
                }
            }

            // Bloco para o admin/comprador escolher uma verificação para atender
            else if (step === 'awaiting_verification_choice') {
                const { requests } = data;
                if (messageText === '1') {
                    if (requests.length > 0) {
                        await startNextAttendance(sock, userJid);
                    }
                } else {
                    delete userState[userJid];
                }
            }

            else if (step === 'awaiting_verification_outcome') {
                const { request } = data;
                const clientJid = request.userJid;
                const userToVerify = userData[clientJid];
                const account = userToVerify?.savedAccounts?.[request.accountIndex];

                if (!userToVerify || !account) {
                    await sendMessage(sock, userJid, { text: "❌ Erro: Cliente ou conta não encontrados." });
                    return;
                }

                const requestIndex = verificationRequests.findIndex(r => r.timestamp === request.timestamp);
                if (requestIndex > -1) {
                    verificationRequests.splice(requestIndex, 1);
                    saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);
                }
                const comissoes = shopData.comissoes || { porVerificacao: 0.50 };
                const verificationCommission = comissoes.porVerificacao;

                if (messageText === '1') { // Sim, verificado
                    userToVerify.savedAccounts[request.accountIndex].verified = true;
                    userToVerify.savedAccounts[request.accountIndex].verificationStatus = 'verified';
                    shopData.contasVerificadas = (shopData.contasVerificadas || 0) + 1;

                    if (compradoresData[userJid]) {
                        compradoresData[userJid].ganhosTotais = (compradoresData[userJid].ganhosTotais || 0) + verificationCommission;
                        compradoresData[userJid].caixa = (compradoresData[userJid].caixa || 0) + verificationCommission;
                        saveJsonFile(ARQUIVO_COMPRADORES, compradoresData);
                    }

                    await sendMessage(sock, clientJid, { text: `🎉 Parabéns! Sua conta *${account.alias}* foi verificada com sucesso! Agora você tem acesso a todos os benefícios.` });
                    {
                        const staffLang = getUserLanguage(userJid);
                        const commissionFmt = await formatCurrencyByLanguage(verificationCommission || 0, staffLang);
                        await sendMessage(sock, userJid, { text: `✅ Conta de *${userToVerify.nome}* verificada. Você ganhou ${commissionFmt} de comissão.` });
                    }
                } else { // Não
                    userToVerify.savedAccounts[request.accountIndex].verificationStatus = 'rejected';
                    await sendMessage(sock, clientJid, { text: `😔 Não foi possível verificar sua conta *${account.alias}* desta vez. Por favor, revise os dados e o tutorial e tente novamente mais tarde.` });
                    await sendMessage(sock, userJid, { text: `❌ Verificação da conta de *${userToVerify.nome}* foi recusada.` });
                }

                saveJsonFile(ARQUIVO_USUARIOS, userData);
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);

                activeChats = activeChats.filter(c => !(c.sellerJid === userJid && c.clientJid === clientJid));
                saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);

                delete userState[userJid];
                delete userState[clientJid];
            } else if (step === 'awaiting_generated_payment_value') {
                const { partnerJid } = data;
                const value = parseFloat(messageText.replace(',', '.'));
                if (isNaN(value) || value <= 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Por favor, digite um número positivo." });
                    return;
                }
                const langPix2 = getUserLanguage(partnerJid);
                const valueFmt2 = await formatCurrencyByLanguage(value, langPix2);
                await sendMessage(sock, userJid, { text: `✅ Gerando um PIX no valor de ${valueFmt2} para o cliente...` });
                await startPixCheckoutProcess(sock, partnerJid, value, true, userJid);
            }
            // Awaiting regional change manager choice
            else if (step === "awaiting_manage_regional_change_managers_choice") {
                if (messageText === "1") {
                    await sendAddRegionalChangeManagerPrompt(sock, userJid);
                } else if (messageText === "2") {
                    await sendRemoveRegionalChangeManagerPrompt(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            }
            // Awaiting new regional change manager number
            else if (step === "awaiting_new_regional_change_manager_number") {
                const phoneNumber = messageText.replace(/\D/g, '');
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido." });
                    return;
                }
                const newManagerJid = `${phoneNumber}@s.whatsapp.net`;
                if (gerenciadoresTrocaRegionalData[newManagerJid]) {
                    await sendMessage(sock, userJid, { text: "⚠️ Este número já é um Gerenciador de Troca Regional." });
                    return;
                }
                gerenciadoresTrocaRegionalData[newManagerJid] = { ganhosTotais: 0, caixa: 0, caixaBloqueado: 0, pixKeys: [] };
                saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
                await sendMessage(sock, userJid, { text: `✅ Gerenciador de Troca Regional adicionado com sucesso!` });
                await sendManageRegionalChangeManagersMenu(sock, userJid);
            }
            // Awaiting regional change manager to remove
            else if (step === "awaiting_regional_change_manager_to_remove_choice") {
                const { managers } = data;
                const choiceIndex = parseInt(messageText) - 1;
                if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < managers.length) {
                    const managerJidToRemove = managers[choiceIndex];
                    delete gerenciadoresTrocaRegionalData[managerJidToRemove];
                    saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
                    await sendMessage(sock, userJid, { text: `✅ Gerenciador de Troca Regional removido com sucesso!` });
                    await sendManageRegionalChangeManagersMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, managers.map((_, i) => `${i + 1}`).concat('0'));
                }
            }
            // Awaiting card manager choice
            else if (step === "awaiting_manage_card_managers_choice") {
                if (messageText === "1") {
                    await sendAddCardManagerPrompt(sock, userJid);
                } else if (messageText === "2") {
                    await sendRemoveCardManagerPrompt(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
                }
            }
            // Awaiting new card manager number
            else if (step === "awaiting_new_card_manager_number") {
                const phoneNumber = messageText.replace(/\D/g, '');
                if (!/^\d{10,14}$/.test(phoneNumber)) {
                    await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido." });
                    return;
                }
                const newManagerJid = `${phoneNumber}@s.whatsapp.net`;
                if (gerenciadoresCartaoData[newManagerJid]) {
                    await sendMessage(sock, userJid, { text: "⚠️ Este número já é um Gerenciador de Cartão." });
                    return;
                }
                gerenciadoresCartaoData[newManagerJid] = { status: 'off', onlineSince: null, totalOnlineTime: 0, ganhosTotais: 0, caixa: 0, caixaBloqueado: 0, pixKeys: [] };
                saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                await sendMessage(sock, userJid, { text: `✅ Gerenciador de Cartão adicionado com sucesso!` });
                await sendManageCardManagersMenu(sock, userJid);
            }
            // Awaiting card manager to remove
            else if (step === "awaiting_card_manager_to_remove_choice") {
                const { managers } = data;
                const choiceIndex = parseInt(messageText) - 1;
                if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < managers.length) {
                    const managerJidToRemove = managers[choiceIndex];
                    delete gerenciadoresCartaoData[managerJidToRemove];
                    saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
                    await sendMessage(sock, userJid, { text: `✅ Gerenciador de Cartão removido com sucesso!` });
                    await sendManageCardManagersMenu(sock, userJid);
                } else {
                    await sendInvalidOptionMessage(sock, userJid, managers.map((_, i) => `${i + 1}`).concat('0'));
                }
            }
            else if (step === 'awaiting_pix_payment') {
                // Permite que equipe (admin/comprador/ger. cartão/ger. troca) continue atendendo,
                // inclusive encaminhando mídias e mensagens, mesmo aguardando pagamento PIX.
                const directChatState = userState[userJid]?.history?.find(s => s.step === 'in_direct_chat');
                const partnerJid = directChatState?.data?.partnerJid;
                const isStaff = isComprador || isAdmin || isGerenciadorCartao || isGerenciadorTrocaRegional;

                if (messageText === '0') {
                    if (userState[userJid] && userState[userJid].paymentCheckTimeout) {
                        clearTimeout(userState[userJid].paymentCheckTimeout);
                        delete userState[userJid].paymentCheckTimeout;
                    }
                    await sendMessage(sock, userJid, { text: "Pagamento cancelado. Voltando para a seleção de métodos..." });
                    await goBack(sock, userJid); // Volta para a seleção de método
                } else if (isStaff && partnerJid) {
                    // Encaminha mensagens e mídias do staff para o cliente durante o aguardo do PIX
                    if (messageType !== 'conversation' && messageType !== 'extendedTextMessage') {
                        // Baixa e reenvia a mídia (imagem, vídeo, áudio, etc.)
                        try {
                            const buffer = await downloadMediaMessage(msg, "buffer");

                            if (buffer && buffer.length > 0) {
                                let mediaMessage = {};

                                if (msg.message.imageMessage) {
                                    mediaMessage = { image: buffer, caption: msg.message.imageMessage.caption || '' };
                                } else if (msg.message.videoMessage) {
                                    mediaMessage = { video: buffer, caption: msg.message.videoMessage.caption || '' };
                                } else if (msg.message.audioMessage) {
                                    mediaMessage = { audio: buffer, ptt: msg.message.audioMessage.ptt || false };
                                } else if (msg.message.documentMessage) {
                                    mediaMessage = { document: buffer, mimetype: msg.message.documentMessage.mimetype, fileName: msg.message.documentMessage.fileName };
                                }

                                await sendMessage(sock, partnerJid, mediaMessage);
                            }
                        } catch (error) {
                            console.error('Erro ao encaminhar mídia:', error);
                        }
                    } else if (messageText.trim()) {
                        const senderName = "Atendente";
                        const formattedMessage = `*[ ${senderName} ]*\n${messageText}`;
                        await sendMessage(sock, partnerJid, { text: formattedMessage });
                    }
                    await sock.sendMessage(userJid, { react: { text: "✅", key: msg.key } });
                    // Mantém aguardando pagamento para o cliente, mas sem bloquear o atendimento
                } else {
                    // Envia uma dica amigável e genérica sobre o estado atual, com controle de frequência
                    const now = Date.now();
                    userState[userJid] = userState[userJid] || {};
                    const lastHint = userState[userJid].lastStatusHintAt || 0;
                    if (now - lastHint > 15000) {
                        await sendMessage(sock, userJid, { text: "ℹ️ Você está em uma etapa em andamento. Digite 0 para cancelar ou aguarde a próxima instrução." });
                        userState[userJid].lastStatusHintAt = now;
                    }
                }
            }
            else if (step === 'awaiting_installments_choice') {
                const { totalAmount } = data;
                const installments = parseInt(messageText);

                if (isNaN(installments) || installments < 1 || installments > 12) {
                    await sendMessage(sock, userJid, { text: "⚠️ Número de parcelas inválido. Por favor, digite um número entre 1 e 12, ou 0 para cancelar." });
                    return;
                }

                await startCardLinkCheckoutProcess(sock, userJid, totalAmount, installments);

            }
            else if (step === 'awaiting_card_details') {
                const { totalAmount, installments } = data;
                await startCardLinkCheckoutProcess(sock, userJid, totalAmount, installments);

            }
            else if (step === 'awaiting_pix_cpf') {
                const { finalTotal, isGenerated, attendantJid } = data;
                const cpf = messageText.replace(/[^\d]/g, '');
                if (!/^\d{11}$/.test(cpf)) {
                    await sendMessage(sock, userJid, { text: "❌ CPF inválido. Deve conter 11 dígitos sem pontos/traços.\n\nEnvie novamente ou digite 0 para cancelar." });
                    return;
                }
                userData[userJid] = userData[userJid] || {};
                userData[userJid].cpf = cpf;
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await startPixCheckoutProcess(sock, userJid, Number(finalTotal), isGenerated, attendantJid);
            }
            else if (step === 'awaiting_card_payment' || step === 'awaiting_card_payment_confirmation' || step === 'awaiting_card_link_payment') {
                if (messageText === '0') {
                    if (userState[userJid] && userState[userJid].paymentCheckTimeout) {
                        clearTimeout(userState[userJid].paymentCheckTimeout);
                        delete userState[userJid].paymentCheckTimeout;
                    }
                    await sendMessage(sock, userJid, { text: "Pagamento cancelado. Voltando para a seleção de métodos..." });
                    await goBack(sock, userJid); // Volta para a seleção de método
                } else {
                    // Envia uma dica amigável e genérica sobre o estado atual, com controle de frequência
                    const now = Date.now();
                    userState[userJid] = userState[userJid] || {};
                    const lastHint = userState[userJid].lastStatusHintAt || 0;
                    if (now - lastHint > 15000) {
                        await sendMessage(sock, userJid, { text: "ℹ️ Você está em uma etapa em andamento. Digite 0 para cancelar ou aguarde a próxima instrução." });
                        userState[userJid].lastStatusHintAt = now;
                    }
                }
            }
            else if (step === 'awaiting_pix_email') {
                const { finalTotal, isGenerated, attendantJid } = data;
                const email = messageText.trim();
                if (!isValidEmail(email)) {
                    await sendMessage(sock, userJid, { text: "❌ E-mail inválido. Envie no formato nome@dominio.com." });
                    return;
                }
                userData[userJid] = userData[userJid] || {};
                userData[userJid].email = email;
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await startPixCheckoutProcess(sock, userJid, Number(finalTotal), isGenerated, attendantJid);
            }
            else if (step === 'awaiting_card_email') {
                const { totalAmount, installments } = data;
                const email = messageText.trim();
                if (!isValidEmail(email)) {
                    await sendMessage(sock, userJid, { text: "❌ E-mail inválido. Envie no formato nome@dominio.com." });
                    return;
                }
                userData[userJid] = userData[userJid] || {};
                userData[userJid].email = email;
                saveJsonFile(ARQUIVO_USUARIOS, userData);
                await startCardLinkCheckoutProcess(sock, userJid, Number(totalAmount), installments);
            }
            else if (step === 'awaiting_historical_ranking_choice') {
                const { period, groups } = data;

                if (messageText === '0') {
                    await sendMessage(sock, userJid, { text: "❌ Operação cancelada." });
                    delete userState[userJid];
                    return;
                }

                // Verifica se é resposta de lista interativa
                let selectedIndex = -1;

                if (messageText.startsWith('ranking_group_')) {
                    // Resposta da lista interativa
                    selectedIndex = parseInt(messageText.replace('ranking_group_', ''));
                } else {
                    // Resposta numérica normal (1, 2, 3)
                    const choice = parseInt(messageText);
                    if (!isNaN(choice) && choice > 0 && choice <= groups.length) {
                        selectedIndex = choice - 1;
                    }
                }

                if (selectedIndex >= 0 && selectedIndex < groups.length) {
                    const selectedGroup = groups[selectedIndex];
                    await sendGroupRanking(sock, selectedGroup, period);
                    delete userState[userJid];
                } else {
                    await sendInvalidOptionMessage(sock, userJid, groups.map((_, i) => `${i + 1}`).concat('0'));
                }
            }
            else {
                console.log(`Estado não tratado: ${step} para o usuário ${userJid}`);
                delete userState[userJid];
            }
        } catch (error) {
            console.error("!! ERRO INESPERADO NO FLUXO PRINCIPAL !!", error);
            if (userJid && userState[userJid]) {
                delete userState[userJid];
            }
            try {
                const errorRecipient = userJid || (msg?.key?.remoteJid);
                if (errorRecipient) {
                    await sendMessage(sock, errorRecipient, { text: "🤖 Ocorreu um erro inesperado e estou me recuperando. Por favor, tente novamente em alguns instantes ou digite */m* para recomeçar." });
                }
            } catch (e) {
                console.error("Falha ao enviar mensagem de erro ao usuário.", e);
            }
        }
    });
}

function main() {
    const app = express();
    app.use(express.json());
    const port = process.env.PORT || 3001;
    app.get("/", (req, res) => {
        res.json({
            status: "online",
            timestamp: new Date().toISOString(),
            message: "Bot PowerShop está operando!",
        })
    });
    app.post('/webhook/asaas', async (req, res) => {
        try {
            const body = req.body || {};
            const payment = body.payment || body;
            const status = payment.status;
            const paymentId = payment.id;
            let linkId = null;
            if (payment.paymentLink && typeof payment.paymentLink === 'object' && payment.paymentLink.id) {
                linkId = payment.paymentLink.id;
            } else if (payment.paymentLink && typeof payment.paymentLink === 'string') {
                linkId = payment.paymentLink;
            } else if (body.paymentLink && typeof body.paymentLink === 'string') {
                linkId = body.paymentLink;
            }
            if (status === 'RECEIVED' || status === 'CONFIRMED') {
                if (paymentId && pixPaymentMap[paymentId]) {
                    const ctx = pixPaymentMap[paymentId];
                    await promptForAccountDetails(sockInstance, ctx.jid, ctx.finalTotal, ctx.userCart, { paymentId });
                    delete pixPaymentMap[paymentId];
                } else if (linkId && paymentLinkMap[linkId]) {
                    const ctx = paymentLinkMap[linkId];
                    await promptForAccountDetails(sockInstance, ctx.jid, ctx.totalAmount, ctx.userCart, { paymentId });
                    delete paymentLinkMap[linkId];
                }
            }
            res.status(200).send('ok');
        } catch (err) {
            res.status(200).send('ok');
        }
    });
    app.listen(port, () =>
        console.log(`Servidor Keep-Alive rodando na porta ${port}.`),
    );
    connectToWhatsApp();
}

main();
