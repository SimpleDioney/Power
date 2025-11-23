const state = require("../state/global-state");
const { sendMessage, navigateTo } = require("../utils/messages"); // Fixed import path to utils/messages
const { saveJsonFile } = require("../utils/file-io");
const {
    ARQUIVO_SOLICITACOES_VERIFICACAO,
    ARQUIVO_CHATS_ATIVOS,
    ARQUIVO_PEDIDOS,
    ARQUIVO_PEDIDOS_V,
    ARQUIVO_TICKETS
} = require("../config/paths");
const { formatCurrencyByLanguage } = require("../utils/translation"); // Fixed import path to utils/translation
const { getUserLanguage } = require("../utils/user-helper");

async function startNextAttendance(sock, sellerJid) {
    // Check if seller has an active chat entry
    const existingChatIndex = state.activeChats.findIndex(c => c.sellerJid === sellerJid);

    if (existingChatIndex > -1) {
        // Verify if the userState matches
        const currentState = state.userState[sellerJid]?.history?.[state.userState[sellerJid].history.length - 1];
        const hasValidState = currentState && (currentState.step === 'in_direct_chat' || currentState.step === 'in_verification_chat');

        if (hasValidState) {
            // User is genuinely in an attendance
            await sendMessage(sock, sellerJid, { text: "⚠️ Você já está em um atendimento. Finalize-o com */finalizar* antes de iniciar um novo." });
            return;
        } else {
            // Stale activeChats entry - clean it up
            console.log(`[Attendance] Cleaning up stale activeChats entry for ${sellerJid}`);
            state.activeChats.splice(existingChatIndex, 1);
            saveJsonFile(ARQUIVO_CHATS_ATIVOS, state.activeChats);
            delete state.userState[sellerJid];
        }
    }

    let pendingVerification = null;
    if (state.verificationRequests.length > 0) {
        const requestIndex = state.verificationRequests.findIndex(r => r.status === 'pendente');
        if (requestIndex > -1) {
            pendingVerification = state.verificationRequests.splice(requestIndex, 1)[0];
            saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, state.verificationRequests);
        }
    }

    if (pendingVerification) {
        pendingVerification.status = 'em_atendimento';
        pendingVerification.atendido_por = sellerJid;
        state.verificationRequests.push(pendingVerification);
        saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, state.verificationRequests);

        const clientJid = pendingVerification.userJid;
        const sellerName = "um atendente";

        state.activeChats.push({ sellerJid, clientJid, type: 'verification', request: pendingVerification });
        saveJsonFile(ARQUIVO_CHATS_ATIVOS, state.activeChats);

        const stateData = { partnerJid: clientJid, request: pendingVerification };
        navigateTo(sellerJid, 'in_verification_chat', stateData);
        navigateTo(clientJid, 'in_verification_chat', { ...stateData, partnerJid: sellerJid });

        await sendMessage(sock, clientJid, { text: `👋 Olá! Eu sou *${sellerName}* e vou te ajudar com a verificação da sua conta. Por favor, aguarde um momento.` });

        const userToVerify = state.userData[clientJid];
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

    const onlineCardManagers = Object.values(state.gerenciadoresCartaoData).filter(m => m.status === 'on').length;
    const hasPendingOrders = state.pendingOrdersV.some(o => o.status === 'pendente') || state.pendingOrders.some(o => o.status === 'pendente');

    if (hasPendingOrders && onlineCardManagers === 0) {
        const pendingOrdersCount = state.pendingOrders.length + state.pendingOrdersV.length;
        await sendMessage(sock, sellerJid, { text: `⚠️ Não é possível iniciar um novo atendimento de compra, pois não há nenhum Gerenciador de Cartões online no momento.\n\nTotal de pedidos na fila: *${pendingOrdersCount}*` });
        delete state.userState[sellerJid];
        return;
    }

    let currentOrder = null;
    let orderList = null;
    let orderFile = null;
    let orderIndex = -1;

    orderIndex = state.pendingOrdersV.findIndex(order => order.status === 'pendente');
    if (orderIndex > -1) {
        currentOrder = state.pendingOrdersV.splice(orderIndex, 1)[0];
        orderList = state.pendingOrdersV;
        orderFile = ARQUIVO_PEDIDOS_V;
    } else {
        orderIndex = state.pendingOrders.findIndex(order => order.status === 'pendente');
        if (orderIndex > -1) {
            currentOrder = state.pendingOrders.splice(orderIndex, 1)[0];
            orderList = state.pendingOrders;
            orderFile = ARQUIVO_PEDIDOS;
        }
    }

    if (currentOrder) {
        saveJsonFile(orderFile, orderList);
        currentOrder.status = 'em_atendimento';
        currentOrder.atendido_por = sellerJid;
        orderList.push(currentOrder);
        saveJsonFile(orderFile, orderList);

        const clientJid = currentOrder.clientJid;
        const sellerName = "um atendente";

        state.activeChats.push({ sellerJid, clientJid, orderId: currentOrder.id, type: 'order' });
        saveJsonFile(ARQUIVO_CHATS_ATIVOS, state.activeChats);

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

        // Only show login/password if they exist and are not "undefined"
        if (currentOrder.facebookLogin && currentOrder.facebookLogin !== 'undefined') {
            sellerInfoText += `*Login:* \`${currentOrder.facebookLogin}\`\n`;
        }
        if (currentOrder.facebookPassword && currentOrder.facebookPassword !== 'undefined') {
            sellerInfoText += `*Senha:* \`${currentOrder.facebookPassword}\`\n`;
        }
        if (maskedId && maskedId !== 'Não informado') {
            sellerInfoText += `*ID do Jogo:* ${maskedId}\n`;
        }

        if ((currentOrder.facebookLogin && currentOrder.facebookLogin !== 'undefined') ||
            (currentOrder.facebookPassword && currentOrder.facebookPassword !== 'undefined') ||
            (maskedId && maskedId !== 'Não informado')) {
            sellerInfoText += '\n';
        }

        sellerInfoText += `*Itens:*\n${itemsText}\n\n`;
        sellerInfoText += `Você está agora em um chat direto com o cliente. Use os comandos de atendimento para continuar. Ao finalizar, digite */finalizar*.`;

        await sendMessage(sock, sellerJid, { text: sellerInfoText });

        const nextOrderInV = state.pendingOrdersV.find(o => o.status === 'pendente');
        const nextOrderInN = state.pendingOrders.find(o => o.status === 'pendente');
        const nextOrder = nextOrderInV || nextOrderInN;

        if (nextOrder && nextOrder.clientJid !== currentOrder.clientJid) {
            await sendMessage(sock, nextOrder.clientJid, { text: "⏳ Você é o próximo da fila! Por favor, fique atento(a), seu atendimento começará em breve." });
        }

    } else {
        await sendMessage(sock, sellerJid, { text: "⚠️ Não há pedidos ou solicitações de verificação pendentes no momento." });
    }
}

async function closeAttendanceTicket(sock, ticketId, closedBy) {
    const openTickets = state.openTickets;
    const ticketIndex = openTickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) return;

    const ticket = openTickets[ticketIndex];
    const clientJid = ticket.userJid;
    const adminJid = ticket.adminJid;

    // Remove from open tickets
    openTickets.splice(ticketIndex, 1);
    saveJsonFile(ARQUIVO_TICKETS, openTickets);

    // Notify client
    await sendMessage(sock, clientJid, { text: "✅ Seu atendimento foi encerrado. Obrigado!" });

    // Notify admin
    if (adminJid && adminJid !== closedBy) {
        await sendMessage(sock, adminJid, { text: `✅ O ticket #${ticketId} foi encerrado.` });
    }

    // Reset user state
    delete state.userState[clientJid];
    if (adminJid) delete state.userState[adminJid];
}

module.exports = {
    startNextAttendance,
    closeAttendanceTicket
};
