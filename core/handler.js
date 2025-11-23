
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('../services/wpp-compat');

// Import Handlers
const commandHandlers = require('./command-handlers');
const registrationHandlers = require('./registration-handlers');
const adminHandlers = require('./admin-handlers');
const buyingHandlers = require('./buying-handlers');
const miscHandlers = require('./misc-handlers');
const productHandlers = require('./product-handlers');
const staffHandlers = require('./staff-handlers');
const supportHandlers = require('./support-handlers');
const userHandlers = require('./user-handlers');
const chatHandlers = require('./chat-handlers');

// Import Core Modules for Context
const messaging = require('./messaging');
const menus = require('./menus');
const adminMenus = require('./admin-menus');
const staffMenus = require('./staff-menus');
const products = require('./products');
const verification = require('./verification');
const attendance = require('./attendance');
const cart = require('./cart');
const checkout = require('./checkout');
const discounts = require('./discounts');
const ranking = require('./ranking');
const shopLogic = require('./shop-logic');
const translation = require('../utils/translation');
const fileIo = require('../utils/file-io');
const paths = require('../config/paths');
const formatters = require('../utils/formatters');

// Registry
const handlers = {
    ...registrationHandlers,
    ...adminHandlers,
    ...buyingHandlers,
    ...miscHandlers,
    ...productHandlers,
    ...staffHandlers,
    ...supportHandlers,
    ...userHandlers,
    ...chatHandlers,
    ...commandHandlers
};

// Helper to normalize JID
const normalizeDirectJid = (jid) => {
    if (!jid) return '';
    if (jid.endsWith('@g.us')) return jid;
    return jid.replace(/@c\.us|@lid/, '@s.whatsapp.net');
};

const isDirectUserJid = (jid) => {
    return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us') || jid.endsWith('@lid');
};

// Main Handler Function
const handleMessage = async (sock, msg, state) => {
    const {
        userData, adminData, compradoresData, productManagerData,
        gerenciadoresCartaoData, gerenciadoresTrocaRegionalData,
        userState, shopData, waitingOrders, OWNER_JID, activeChats,
        pendingOrders, pendingOrdersV, openTickets
    } = state;

    const senderJid = msg.key.remoteJid;
    const isGroup = senderJid.endsWith('@g.us');
    const userJid = isGroup ? (msg.key.participant || senderJid) : senderJid;

    // Basic Filtering
    if (!userJid) return;
    if (senderJid === 'status@broadcast') return;
    if (msg.key.fromMe) return;

    // Mark as read (private only)
    if (!isGroup) {
        try { await sock.readMessages([msg.key]); } catch (e) { }
    } else {
        // Atualizar Ranking (apenas para grupos)
        const userName = msg.pushName || userData[userJid]?.nome || userJid.split('@')[0];
        ranking.incrementGroupMessage(senderJid, userJid, userName);
    }

    const messageText = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""
    ).trim();

    const messageType = Object.keys(msg.message)[0];

    // Context Construction
    const context = {
        ...state, // Pass all state
        ...messaging,
        ...menus,
        ...adminMenus,
        ...staffMenus,
        ...products,
        ...verification,
        ...attendance,
        ...cart,
        ...checkout, // This now includes handlePowerPointsPayment
        ...discounts,
        ...ranking,
        ...shopLogic,
        ...translation,
        ...fileIo,
        ...paths, // Add all path constants
        ...formatters,

        // Node modules
        fs,
        path,

        // Media download
        downloadMediaMessage,

        sendMessage: async (sockParam, jid, content) => await sock.sendMessage(jid, content),
        sendListMessage: sock.sendListMessage ? (async (sockParam, jid, options) => await sock.sendListMessage(jid, options)) : null,

        navigateTo: messaging.navigateTo,
        deleteUserState: (jid) => { delete userState[jid]; },
        goBack: async (sock, jid) => {
            return messaging.goBack(sock, jid);
        },

        isGroup: isGroup,
        effectiveJid: isGroup ? senderJid : userJid,

        // State Synchronization Helper
        updateGlobalData: (key, newData) => {
            if (state.hasOwnProperty(key)) {
                state[key] = newData;
                // Also update the context reference for the current execution if needed
                context[key] = newData;
            }
        }
    };

    // Role Checks
    const normalizedSender = normalizeDirectJid(senderJid);
    context.isAdmin = adminData.hasOwnProperty(senderJid) || adminData.hasOwnProperty(normalizedSender);
    context.isComprador = compradoresData.hasOwnProperty(senderJid) || compradoresData.hasOwnProperty(normalizedSender);
    context.isProductManager = productManagerData.hasOwnProperty(senderJid) || productManagerData.hasOwnProperty(normalizedSender);
    context.isGerenciadorCartao = gerenciadoresCartaoData.hasOwnProperty(senderJid) || gerenciadoresCartaoData.hasOwnProperty(normalizedSender);
    context.isGerenciadorTrocaRegional = gerenciadoresTrocaRegionalData.hasOwnProperty(senderJid) || gerenciadoresTrocaRegionalData.hasOwnProperty(normalizedSender);
    context.isOwner = senderJid === OWNER_JID;

    // --- Logic Flow ---

    // 1. Public Group Commands
    if (isGroup) {
        const publicGroupCommands = ['/comida', '/farm', '/comandos', '/ranking', '/rankings'];
        const commandMatch = messageText.match(/^(\/\w+)/);
        const commandName = commandMatch ? commandMatch[1].toLowerCase() : '';
        const hasActiveState = userState[userJid]?.history?.length > 0;
        const activeStep = hasActiveState ? userState[userJid].history[userState[userJid].history.length - 1].step : null;
        const isFarmState = activeStep && (activeStep.includes('farm'));

        if (!publicGroupCommands.includes(commandName) && !isFarmState) return;
    }
    // 2. Command Handling (Commands override current state)
    // Only process as command if it's a text message (not image, video, etc.)
    const isTextMessage = messageType === 'conversation' || messageType === 'extendedTextMessage';
    // Check if it's base64 image data (JPEG starts with /9j/, PNG starts with iVBORw0KGgo)
    const isBase64Image = messageText.startsWith('/9j/') || messageText.startsWith('iVBORw0KGgo');

    if (isTextMessage && messageText.startsWith('/') && !isBase64Image) {
        const [command, ...args] = messageText.trim().split(/\s+/); // Split by any whitespace
        const commandName = command.toLowerCase();

        console.log(`[Handler] Processing command: "${commandName}" from user: ${userJid}`);

        // Block commands if user is in support/attendance mode (unless they are staff)
        const isStaff = context.isAdmin || context.isComprador || context.isProductManager || context.isGerenciadorCartao || context.isGerenciadorTrocaRegional;
        const userProfile = userData[userJid] || {};
        const isInSupport = userProfile.status === 'em_atendimento' || userProfile.status === 'em_suporte';

        // Commands allowed during support/attendance
        const allowedInSupport = ['/finalizar', '/whats', '/entrei', '/suporte'];

        if (isInSupport && !isStaff && !allowedInSupport.includes(commandName)) {
            console.log(`[Handler] Command blocked - user in support mode: ${userJid}`);
            // React with ❌ to indicate command is blocked
            try {
                await sock.sendMessage(userJid, { react: { text: "❌", key: msg.key } });
            } catch (e) { }
            return; // Block command execution
        }

        if (commandHandlers[commandName]) {
            console.log(`[Handler] Executing command handler for: "${commandName}"`);

            // Don't clear state for attendance commands that need to maintain context
            const attendanceCommands = ['/face', '/whats', '/sms', '/email', '/code', '/insta', '/entrei',
                                       '/incorreto', '/ausente', '/erro', '/gerar', '/tutorial', '/finalizar',
                                       '/suporte', '/limpar'];

            const shouldPreserveState = attendanceCommands.includes(commandName);

            // Clear user state when processing a command (commands override states)
            // EXCEPT for attendance commands which need to maintain state
            if (!shouldPreserveState && userState[userJid]) {
                delete userState[userJid];
            }

            try {
                await commandHandlers[commandName](sock, userJid, messageText, args, context);
            } catch (error) {
                console.error(`[Handler] Error executing command "${commandName}":`, error);
            }
            return;
        } else {
            console.log(`[Handler] Command handler not found for: "${commandName}"`);
        }
    }

    // 2.5. Check if user has order in waiting list (return to queue if they send message)
    const waitingOrderIndex = state.waitingOrders.findIndex(o => o.clientJid === userJid);
    if (waitingOrderIndex > -1) {
        const order = state.waitingOrders.splice(waitingOrderIndex, 1)[0];
        order.status = 'pendente';
        order.atendido_por = null;

        // Return to correct queue
        const isVariableOrder = order.items && order.items.some(item => item.isVariable);
        if (isVariableOrder) {
            state.pendingOrdersV.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS_V, state.pendingOrdersV);
        } else {
            state.pendingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS, state.pendingOrders);
        }

        saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, state.waitingOrders);

        await sendMessage(sock, userJid, { text: "✅ Seu pedido foi reativado e colocado de volta na fila! Um comprador atenderá você em breve." });

        // Notify buyers
        const buyerJids = Object.keys(compradoresData);
        const clientName = userData[userJid]?.nome || userJid.split('@')[0];
        const notificationText = `🔔 *Cliente de Volta!*\n\nO cliente *${clientName}* saiu da lista de espera e está pronto para ser atendido. O pedido *#${order.id}* voltou para a fila.`;

        for (const buyerJid of buyerJids) {
            if (compradoresData[buyerJid]?.notificacoes_config?.clientesDeVolta) {
                try {
                    await sendMessage(sock, buyerJid, { text: notificationText });
                } catch (e) {
                    console.error(`Erro ao notificar comprador ${buyerJid}:`, e);
                }
            }
        }

        return; // Stop processing, order was returned to queue
    }

    // 3. State Handling
    console.log(`[Handler] Checking state for user: ${userJid}`);
    if (userState[userJid]) {
        console.log(`[Handler] State found:`, JSON.stringify(userState[userJid]));
    } else {
        console.log(`[Handler] No state found for user: ${userJid}`);
    }

    const currentStepData = userState[userJid]?.history?.[userState[userJid].history.length - 1];
    if (currentStepData) {
        console.log(`[Handler] Current step: ${currentStepData.step}`);
        const { step, data } = currentStepData;
        if (handlers[step]) {
            console.log(`[Handler] Executing handler for step: ${step}`);
            const result = await handlers[step](sock, userJid, messageText, data, msg, context);
            if (result === 'REQ_MAIN_MENU') {
                if (context.sendMainMenu) {
                    await context.sendMainMenu(sock, userJid);
                }
            }
            return;
        }
    }

    // 4. Fallback / Initial Flow
    if (!currentStepData) {
        // Registration or Main Menu
        if (!userData[userJid]) {
            await handlers.register_name(sock, userJid, messageText, {}, msg, context); // Start registration
        } else {
            // Send Main Menu
            if (context.sendMainMenu) {
                await context.sendMainMenu(sock, userJid);
            }
        }
    }
};

module.exports = { handleMessage };
