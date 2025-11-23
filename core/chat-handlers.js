const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('../services/wpp-compat');

module.exports = {
    in_direct_chat: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, userData, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, isProductManager } = context;
        const { partnerJid } = data;
        const isStaffMessage = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        const isCommand = messageText.startsWith('/');
        const isStaffUser = isComprador || isAdmin || isProductManager || isGerenciadorCartao || isGerenciadorTrocaRegional;

        // Se for staff e comando inválido, reage com X (já tratado no dispatcher de comandos, mas aqui é redundância ou para comandos não listados)
        if (isStaffUser && isCommand) {
            // O dispatcher de comandos já deve ter tentado executar. Se chegou aqui, é porque não achou handler ou é comando desconhecido.
            // Mas se for comando desconhecido, o dispatcher pode não ter feito nada.
            // Vamos assumir que se é comando, o dispatcher tenta. Se não existe, cai aqui?
            // Não, o dispatcher deve ter prioridade. Se for comando, executa comando. Se não, executa estado.
            // Se o comando não existe, ele não executa nada e cai aqui?
            // Depende da implementação do dispatcher.
            // Vamos assumir que comandos desconhecidos caem aqui como texto.
            // Mas queremos evitar enviar comandos errados pro cliente.
            const validChatCommands = ['/face', '/whats', '/sms', '/email', '/code', '/insta', '/entrei', '/incorreto', '/ausente', '/erro', '/suporte', '/finalizar', '/gerar', '/id', '/cartao', '/tutorial'];
            const commandNameOnly = messageText.split(' ')[0].toLowerCase();
            if (!validChatCommands.includes(commandNameOnly)) {
                await sock.sendMessage(userJid, { react: { text: "❌", key: msg.key } });
                return;
            }
        }

        if (isStaffUser && !isCommand) {
            // Lógica para evitar enviar opções numéricas de menu
            const isSingleDigit = /^[0-9]$/.test(messageText.trim());
            if (isSingleDigit) {
                await sock.sendMessage(userJid, { react: { text: "🤖", key: msg.key } });
                return;
            }
            // Se o cliente está em um estado de espera (ex: menu), não encaminha
            // Isso requer acesso ao estado do partnerJid.
            // Vamos passar userState no context? Sim.
            const { userState } = context;
            const clientState = userState[partnerJid]?.history?.[userState[partnerJid].history.length - 1];
            if (clientState && clientState.step.includes('awaiting_')) {
                await sock.sendMessage(userJid, { react: { text: "❌", key: msg.key } });
                return;
            }
        }

        const messageType = Object.keys(msg.message)[0];
        if (messageType !== 'conversation' && messageType !== 'extendedTextMessage') {
            // Encaminhar mídia
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
            if (isStaffMessage) {
                // Staff to client: send message without prefix
                await sendMessage(sock, partnerJid, { text: messageText });
                await sock.sendMessage(userJid, { react: { text: "✅", key: msg.key } });
            } else {
                // Client to staff: send with "[ Cliente ]" prefix
                const formattedMessage = `*[ Cliente ]*\n${messageText}`;
                await sendMessage(sock, partnerJid, { text: formattedMessage });
            }
        }
    },

    in_verification_chat: async (sock, userJid, messageText, data, msg, context) => {
        // Reutiliza a mesma lógica de chat direto, pois é essencialmente o mesmo comportamento de encaminhamento
        // A diferença são os comandos disponíveis, que são tratados no commandHandlers ou no in_direct_chat (validação)
        const { in_direct_chat } = module.exports;
        await in_direct_chat(sock, userJid, messageText, data, msg, context);
    }
};
