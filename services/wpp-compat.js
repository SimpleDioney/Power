const EventEmitter = require('events');
const state = require("../state/global-state");

function createBaileysCompatibleClient(wppClient) {
    const ev = new EventEmitter();

    return {
        wppClient: wppClient,
        ev: ev,

        // Initialize listeners
        init: function () {
            wppClient.onMessage(async (message) => {
                console.log(`[wpp-compat] Received message from: ${message.from}, chatId: ${message.chatId}, type: ${typeof message.from}`);

                // Convert WPPConnect JID format (@c.us) to Baileys format (@s.whatsapp.net)
                let baileysJid = message.from || message.chatId;
                if (baileysJid.endsWith('@c.us')) {
                    baileysJid = baileysJid.replace('@c.us', '@s.whatsapp.net');
                }

                console.log(`[wpp-compat] Converted to Baileys JID: ${baileysJid}`);

                // Normalize message to Baileys format if needed, or pass as is if handler handles it
                // For now, wrapping it in the structure expected by index.js
                const baileysMessage = {
                    key: {
                        remoteJid: baileysJid,
                        fromMe: message.fromMe,
                        id: message.id,
                        participant: message.author
                    },
                    message: {
                        conversation: message.body || message.content,
                        extendedTextMessage: { text: message.body || message.content },
                        // Add other types as needed
                        imageMessage: message.type === 'image' ? { caption: message.caption } : undefined,
                        videoMessage: message.type === 'video' ? { caption: message.caption } : undefined,
                        audioMessage: message.type === 'ptt' || message.type === 'audio' ? { ptt: message.type === 'ptt' } : undefined,
                        documentMessage: message.type === 'document' ? { mimetype: message.mimetype, fileName: message.filename } : undefined
                    },
                    pushName: message.sender?.pushname || message.sender?.name || 'Unknown',
                    ...message // Pass original message for extra properties
                };

                // WPPConnect message ID is usually the ID string
                baileysMessage.key.id = message.id;
                // Store WPP message ID for reactions
                baileysMessage.key._wppMessageId = message.id;

                ev.emit('messages.upsert', {
                    messages: [baileysMessage],
                    type: 'notify'
                });
            });
        },

        sendMessage: async function (jid, content) {
            try {
                console.log(`[wpp-compat sendMessage] jid: ${jid}, type: ${typeof jid}, content keys: ${Object.keys(content).join(',')}`);

                let chatId;
                // If already in correct format, use as-is
                if (jid.endsWith('@g.us') || jid.endsWith('@c.us') || jid.endsWith('@lid') || jid.endsWith('@newsletter')) {
                    chatId = jid;
                } else if (jid.endsWith('@s.whatsapp.net')) {
                    // Convert from Baileys format (@s.whatsapp.net) to WPPConnect format (@c.us)
                    chatId = jid.replace('@s.whatsapp.net', '@c.us');
                } else {
                    // Fallback: assume it's a phone number and add @c.us
                    chatId = jid + '@c.us';
                }

                console.log(`[wpp-compat sendMessage] Converted chatId: ${chatId}`);

                if (content.text) {
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
                        if (content.image.length === 0) {
                            console.error('[WPPConnect] Buffer de imagem vazio, ignorando envio');
                            if (caption) {
                                return await wppClient.sendText(chatId, caption);
                            }
                            return null;
                        }
                        try {
                            const base64 = content.image.toString('base64');
                            if (!base64 || base64.length === 0) {
                                console.error('[WPPConnect] Base64 vazio, enviando apenas texto');
                                if (caption) {
                                    return await wppClient.sendText(chatId, caption);
                                }
                                return null;
                            }
                            const dataUri = `data:image/jpeg;base64,${base64}`;
                            return await wppClient.sendImageFromBase64(chatId, dataUri, 'image.jpg', caption);
                        } catch (error) {
                            console.error('[WPPConnect] Erro ao converter buffer para base64:', error);
                            if (caption) {
                                return await wppClient.sendText(chatId, caption);
                            }
                            return null;
                        }
                    } else if (typeof content.image === 'string') {
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
                else if (content.react) {
                    try {
                        const messageId = content.react.key._wppMessageId || content.react.key.id;
                        return await wppClient.sendReactionToMessage(messageId, content.react.text);
                    } catch (error) {
                        console.warn('[WPPConnect] Não foi possível enviar reação:', error.message);
                        return null;
                    }
                } else if (content.forward) {
                    const forwardMsg = content.forward;
                    if (forwardMsg.message) {
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

        sendListMessage: async function (jid, options) {
            try {
                let chatId;
                if (jid.endsWith('@g.us') || jid.endsWith('@c.us')) {
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

        presenceSubscribe: async function (jid) {
            return Promise.resolve();
        },

        sendPresenceUpdate: async function (type, jid) {
            return Promise.resolve();
        },

        readMessages: async function (keys) {
            try {
                for (const key of keys) {
                    if (!key.remoteJid) continue;
                    let chatId = key.remoteJid;
                    // Preserve @lid, @g.us, and @c.us formats
                    if (!chatId.endsWith('@g.us') && !chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) {
                        // Only convert @s.whatsapp.net to @c.us
                        if (chatId.endsWith('@s.whatsapp.net')) {
                            chatId = chatId.replace('@s.whatsapp.net', '@c.us');
                        }
                    }
                    await wppClient.sendSeen(chatId);
                }
            } catch (error) {
                console.error('Erro ao marcar como lida:', error);
            }
        },

        requestAppStateSync: function () {
            return Promise.resolve();
        },

        resyncMainAppState: function () {
            return Promise.resolve();
        }
    };
}

async function downloadMediaMessage(message, type) {
    try {
        if (!state.sockInstance || !state.sockInstance.wppClient) {
            console.error('[downloadMedia] Cliente WPP não disponível para download de mídia');
            return Buffer.from([]);
        }

        const messageId = message.key?.id;
        if (!messageId) {
            console.error('[downloadMedia] ID da mensagem não encontrado');
            return Buffer.from([]);
        }

        console.log(`[downloadMedia] Baixando mídia da mensagem ${messageId}`);

        const base64Data = await state.sockInstance.wppClient.downloadMedia(messageId);

        if (!base64Data) {
            console.warn('[downloadMedia] downloadMedia retornou vazio');
            return Buffer.from([]);
        }

        let base64String = base64Data;
        if (typeof base64Data === 'string' && base64Data.includes('base64,')) {
            base64String = base64Data.split('base64,')[1];
        }

        const buffer = Buffer.from(base64String, 'base64');
        console.log(`[downloadMedia] Mídia baixada com sucesso: ${buffer.length} bytes`);

        return buffer;
    } catch (error) {
        console.error('[downloadMedia] Erro ao baixar mídia:', error);
        return Buffer.from([]);
    }
}

const proto = {
    WebMessageInfo: {
        fromObject: function (obj) {
            return obj;
        }
    }
};

const DisconnectReason = {
    loggedOut: 'logged-out'
};

module.exports = {
    createBaileysCompatibleClient,
    downloadMediaMessage,
    proto,
    DisconnectReason
};
