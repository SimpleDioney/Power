const fileIO = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_TICKETS,
    ARQUIVO_CHATS_ATIVOS,
    ARQUIVO_COMPRADORES
} = require("../config/paths");

module.exports = {
    awaiting_support_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMainMenu, sendFaqMenu, startSupportFlow, sendInvalidOptionMessage } = context;
        // Aceita tanto rowId da lista quanto número tradicional
        if (messageText === "1" || messageText === "support_faq") {
            await sendFaqMenu(sock, userJid);
        } else if (messageText === "2" || messageText === "support_attendant") {
            await startSupportFlow(sock, userJid);
        } else if (messageText === '0') {
            await sendMainMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_faq_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendFaqMenu, sendInvalidOptionMessage, loadJsonFile, path, DIRETORIO_DUVIDAS } = context;
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
    },

    awaiting_support_message: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, userData, adminData, compradoresData, openTickets, userState } = context;
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
        fileIO.saveJsonFile(ARQUIVO_TICKETS, openTickets);

        await sendMessage(sock, userJid, { text: "✅ Sua mensagem foi enviada à nossa equipe de suporte! Um atendente entrará em contato em breve. Agradecemos a sua paciência! 😊" });

        const adminJids = Object.keys(adminData);
        if (adminJids.length > 0) {
            let notificationText = `🚨 *NOVO TICKET DE SUPORTE ABERTO* \n\n`;
            notificationText += `*Cliente:* ${newTicket.clientName}\n`;
            notificationText += `*Contato:* https://wa.me/${userJid.split("@")[0]}\n`;
            notificationText += `*Mensagem:* _"${ticketText}"_\n\n`;
            notificationText += `Para finalizar este atendimento, responda a esta mensagem com */f* ou use o painel de admin.`;
            for (const adminJid of adminJids) {
                if (!adminJid || adminJid === 'undefined' || !adminJid.includes('@')) continue; // Skip invalid JIDs

                if (adminData[adminJid] && adminData[adminJid].notificacoes?.suporte) {
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
            fileIO.saveJsonFile(ARQUIVO_TICKETS, openTickets);
        }
        delete userState[userJid];
    },

    awaiting_support_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendSupportMenu, sendInvalidOptionMessage, openTickets } = context;
        // MODO LEGACY: messageText removido - usa apenas messageText
        if (messageText === '1' || messageText === 'support_confirm_1') {
            if (openTickets.some(t => t.clientJid === userJid)) {
                await sendMessage(sock, userJid, { text: "⚠️ Você já possui um ticket de atendimento aberto. Nossa equipe entrará em contato em breve. Agradecemos a sua paciência! 😊" });
                return;
            }
            await sendMessage(sock, userJid, { text: "Por favor, descreva sua dúvida ou problema detalhadamente. Quanto mais informações, mais rápido poderemos te ajudar! 💬" });
            navigateTo(userJid, "awaiting_support_message");
        } else if (messageText === '0') {
            await sendSupportMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
        }
    },

    awaiting_ticket_type_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendTicketManagementList, sendInvalidOptionMessage } = context;
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
    },

    awaiting_ticket_to_close_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendAdminPanel, sendInvalidOptionMessage, closeTicket, sendTicketManagementList } = context;
        const { ticketType, filteredTickets } = data;
        const choice = messageText.trim().toUpperCase();

        if (choice === '0') {
            await sendAdminPanel(sock, userJid);
            return;
        }

        if (choice === 'X') {
            console.log(`[DEBUG] Tentando fechar ${filteredTickets?.length || 0} tickets...`);
            let closedCount = 0;
            for (const ticket of filteredTickets) {
                console.log(`[DEBUG] Tentando fechar ticket de: ${ticket.clientName}`);
                const closed = await closeTicket(sock, ticket, userJid);
                console.log(`[DEBUG] Resultado: ${closed ? 'sucesso' : 'falhou'}`);
                if (closed) closedCount++;
            }
            await sendMessage(sock, userJid, { text: `✅ *${closedCount}* tickets foram finalizados com sucesso.` });
            await sendAdminPanel(sock, userJid);
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
    },

    awaiting_payout_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, closeTicket, sendAdminPanel, compradoresData, adminData, productManagerData, gerenciadoresCartaoData, gerenciadoresTrocaRegionalData, ARQUIVO_ADMINS, ARQUIVO_GERENCIADORES_PRODUTO, ARQUIVO_GERENCIADORES_CARTAO, ARQUIVO_GERENCIADORES_TROCA_REGIONAL, saveJsonFile } = context;
        const { ticketToClose } = data;
        if (messageText === '1') {
            const sellerJid = ticketToClose.clientJid;
            const withdrawalAmount = ticketToClose.amount || 0;

            // Deduzir o valor do saldo do membro correto
            let memberData = null;
            let fileToSave = null;

            if (compradoresData[sellerJid]) {
                memberData = compradoresData[sellerJid];
                fileToSave = ARQUIVO_COMPRADORES;
                memberData.caixa = Math.max(0, (memberData.caixa || 0) - withdrawalAmount);
                saveJsonFile(fileToSave, compradoresData);
            } else if (adminData[sellerJid]) {
                memberData = adminData[sellerJid];
                fileToSave = ARQUIVO_ADMINS;
                memberData.caixa = Math.max(0, (memberData.caixa || 0) - withdrawalAmount);
                saveJsonFile(fileToSave, adminData);
            } else if (productManagerData[sellerJid]) {
                memberData = productManagerData[sellerJid];
                fileToSave = ARQUIVO_GERENCIADORES_PRODUTO;
                memberData.caixa = Math.max(0, (memberData.caixa || 0) - withdrawalAmount);
                saveJsonFile(fileToSave, productManagerData);
            } else if (gerenciadoresCartaoData[sellerJid]) {
                memberData = gerenciadoresCartaoData[sellerJid];
                fileToSave = ARQUIVO_GERENCIADORES_CARTAO;
                memberData.caixa = Math.max(0, (memberData.caixa || 0) - withdrawalAmount);
                saveJsonFile(fileToSave, gerenciadoresCartaoData);
            } else if (gerenciadoresTrocaRegionalData[sellerJid]) {
                memberData = gerenciadoresTrocaRegionalData[sellerJid];
                fileToSave = ARQUIVO_GERENCIADORES_TROCA_REGIONAL;
                memberData.caixa = Math.max(0, (memberData.caixa || 0) - withdrawalAmount);
                saveJsonFile(fileToSave, gerenciadoresTrocaRegionalData);
            }

            const closed = await closeTicket(sock, ticketToClose, userJid, true);
            if (closed) {
                await sendMessage(sock, userJid, { text: `✅ Saque para *${ticketToClose.clientName}* confirmado e ticket finalizado.` });
            }
            await sendAdminPanel(sock, userJid);
        } else {
            await sendMessage(sock, userJid, { text: "Operação cancelada." });
            await sendAdminPanel(sock, userJid);
        }
    }
};
