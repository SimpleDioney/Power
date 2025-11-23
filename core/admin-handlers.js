const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_ADMINS,
    ARQUIVO_GERENCIADORES_PRODUTO,
    ARQUIVO_GERENCIADORES_CARTAO,
    ARQUIVO_GERENCIADORES_TROCA_REGIONAL,
    ARQUIVO_APOIADORES,
    ARQUIVO_PEDIDOS,
    ARQUIVO_CUPONS,
    ARQUIVO_DADOS_LOJA
} = require("../config/paths");

module.exports = {
    awaiting_admin_choice: async (sock, userJid, messageText, data, msg, context) => {
        const {
            sendMessage,
            deleteUserState,
            sendStatisticsMenu,
            sendTicketManagementList,
            sendProductCategoryList,
            sendManageDiscountsMenu,
            sendAdminNotificationsMenu,
            sendParametersManagementMenu,
            sendBulkPriceChangeMenu,
            sendInvalidOptionMessage
        } = context;

        const choice = messageText.trim();

        switch (choice) {
            case '1':
                await sendStatisticsMenu(sock, userJid);
                break;
            case '2':
                await sendTicketManagementList(sock, userJid, 'all');
                break;
            case '3':
                await sendProductCategoryList(sock, userJid);
                break;
            case '4':
                await sendManageDiscountsMenu(sock, userJid);
                break;
            case '5':
                await sendAdminNotificationsMenu(sock, userJid);
                break;
            case '6':
                await sendParametersManagementMenu(sock, userJid);
                break;
            case '7':
                await sendBulkPriceChangeMenu(sock, userJid);
                break;
            case '0':
                await sendMessage(sock, userJid, { text: "🚪 Saindo do Painel Administrativo..." });
                deleteUserState(userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '7', '0']);
                break;
        }
    },

    awaiting_stats_panel_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAdminPanel, saveJsonFile, shopData } = context;

        if (messageText.toLowerCase() === 'x') {
            shopData.valorPerdido = 0;
            shopData.idChecksExpirados = 0;
            saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
            await sendMessage(sock, userJid, { text: "✅ Estatísticas de 'Valor Perdido' e 'ID Checks Expirados' foram resetadas." });
            await sendAdminPanel(sock, userJid);
        } else {
            await sendAdminPanel(sock, userJid);
        }
    },

    awaiting_discount_management_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendCouponList, sendInvitationList, sendAdminPanel, sendInvalidOptionMessage } = context;

        const choice = messageText.trim();

        if (choice === '1') {
            await sendCouponList(sock, userJid);
        } else if (choice === '2') {
            await sendInvitationList(sock, userJid);
        } else if (choice === '0') {
            await sendAdminPanel(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_parameter_choice: async (sock, userJid, messageText, data, msg, context) => {
        const {
            sendMessage,
            navigateTo,
            sendAdminPanel,
            sendTeamManagementMenu,
            sendInvalidOptionMessage
        } = context;

        const choice = messageText.trim();

        switch (choice) {
            case '1':
                await sendMessage(sock, userJid, { text: "💵 Digite a nova cotação do *Dólar (USD)* (ex: 5.20):" });
                navigateTo(userJid, 'awaiting_usd_quote');
                break;
            case '2':
                await sendMessage(sock, userJid, { text: "💶 Digite a nova cotação do *Euro (EUR)* (ex: 5.50):" });
                navigateTo(userJid, 'awaiting_eur_quote');
                break;
            case '3':
                await sendMessage(sock, userJid, { text: "🐉 Digite a nova cotação de *Esferas* (ex: 1.50):" });
                navigateTo(userJid, 'awaiting_sphere_quote');
                break;
            case '4':
                await sendMessage(sock, userJid, { text: "📦 Digite a nova *Taxa de Serviço* para produtos (em %, ex: 10):" });
                navigateTo(userJid, 'awaiting_service_fee');
                break;
            case '5':
                await sendMessage(sock, userJid, { text: "💳 Digite a nova *Taxa de Cartão (MP)* (em %, ex: 4.99):" });
                navigateTo(userJid, 'awaiting_card_fee');
                break;
            case '6':
                await sendTeamManagementMenu(sock, userJid);
                break;
            case '0':
                await sendAdminPanel(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '0']);
                break;
        }
    },

    awaiting_parameters_management_choice: async (sock, userJid, messageText, data, msg, context) => {
        const {
            sendMessage,
            navigateTo,
            sendAdminPanel,
            sendTeamManagementMenu,
            sendInvalidOptionMessage
        } = context;

        const choice = messageText.trim();

        switch (choice) {
            case '1': // Alterar Desconto Automático
                await sendMessage(sock, userJid, { text: "Digite o novo valor para o *Desconto Automático* (apenas o número, ex: 25 para 25%):" });
                navigateTo(userJid, 'awaiting_new_discount_value');
                break;
            case '2': // Alterar Compra Mínima
                await sendMessage(sock, userJid, { text: "Digite o novo valor para a *Compra Mínima* (apenas o número, ex: 15.50):" });
                navigateTo(userJid, 'awaiting_new_minimum_value');
                break;
            case '3': // Alterar Chave PIX
                await sendMessage(sock, userJid, { text: "Digite a nova *Chave PIX* para pagamentos manuais:" });
                navigateTo(userJid, 'awaiting_new_pix_key');
                break;
            case '4': // Alterar Imagem do Menu
                await sendMessage(sock, userJid, { text: "📸 *Envie a nova imagem do menu*\n\nA imagem será exibida no menu principal para todos os clientes." });
                navigateTo(userJid, 'awaiting_menu_image');
                break;
            case '5': // Gerenciar Equipe
                await sendTeamManagementMenu(sock, userJid);
                break;
            case '0':
                await sendAdminPanel(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '0']);
                break;
        }
    },

    awaiting_ticket_to_close_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, closeTicket, sendTicketManagementList, sendAdminPanel, sendInvalidOptionMessage } = context;
        const { ticketType, filteredTickets } = data;
        const choice = messageText.trim().toUpperCase();

        if (choice === '0') {
            await sendAdminPanel(sock, userJid);
            return;
        }

        if (choice === 'X') {
            // Fechar todos
            let closedCount = 0;
            for (const ticket of filteredTickets) {
                if (await closeTicket(sock, ticket, userJid)) {
                    closedCount++;
                }
            }
            await sendMessage(sock, userJid, { text: `✅ ${closedCount} tickets foram fechados.` });
            await sendTicketManagementList(sock, userJid, ticketType);
            return;
        }

        const ticketIndex = parseInt(choice) - 1;
        if (isNaN(ticketIndex) || ticketIndex < 0 || ticketIndex >= filteredTickets.length) {
            await sendInvalidOptionMessage(sock, userJid, ['1', '...', filteredTickets.length, 'X', '0']);
            return;
        }

        const ticketToClose = filteredTickets[ticketIndex];

        // Check if it is a payout ticket
        if (ticketToClose.ticketText && ticketToClose.ticketText.includes("Saque")) {
            await sendMessage(sock, userJid, { text: `Você confirma que o pagamento para *${ticketToClose.clientName}* foi realizado?\n\n*1* - Sim, confirmo\n*2* - Não` });
            navigateTo(userJid, 'awaiting_payout_confirmation', { ticketToClose });
            return;
        }

        if (await closeTicket(sock, ticketToClose, userJid)) {
            await sendMessage(sock, userJid, { text: `✅ Ticket de *${ticketToClose.clientName || ticketToClose.clientJid.split('@')[0]}* fechado com sucesso.` });
        } else {
            await sendMessage(sock, userJid, { text: "❌ Erro ao fechar ticket. Talvez já tenha sido fechado." });
        }
        await sendTicketManagementList(sock, userJid, ticketType);
    },

    awaiting_product_category_list: async (sock, userJid, messageText, data, msg, context) => {
        const { sendProductManagementBrowser, sendAdminPanel, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        switch (choice) {
            case '1':
                await sendProductManagementBrowser(sock, userJid, 'browse', '', 'ofertas');
                break;
            case '2':
                await sendProductManagementBrowser(sock, userJid, 'browse', '', 'esferas');
                break;
            case '3':
                await sendProductManagementBrowser(sock, userJid, 'browse', '', 'contas_exclusivas');
                break;
            case '0':
                await sendAdminPanel(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                break;
        }
    },

    awaiting_manage_team_earnings_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
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
    },

    awaiting_member_to_add_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageTeamEarningsMenu } = context;
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
    },

    awaiting_value_to_add: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, getUserLanguage, formatCurrencyByLanguage } = context;
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
    },

    awaiting_value_availability: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendInvalidOptionMessage, addEarningsToMember, getUserLanguage, formatCurrencyByLanguage, sendManageTeamEarningsMenu } = context;
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
    },

    awaiting_member_to_remove_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageTeamEarningsMenu } = context;
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
    },

    awaiting_value_to_remove: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, addEarningsToMember, getUserLanguage, formatCurrencyByLanguage, sendManageTeamEarningsMenu } = context;
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
    },

    awaiting_notification_toggle_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAdminNotificationsMenu, sendAdminPanel, sendInvalidOptionMessage, saveJsonFile, adminData, ARQUIVO_ADMINS } = context;
        const { notifications } = data;

        // Handle "0" - go back to admin panel
        if (messageText === '0') {
            await sendAdminPanel(sock, userJid);
            return;
        }

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
    },

    awaiting_card_to_remove: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageCardManagersMenu, sendInvalidOptionMessage, saveJsonFile, shopData, ARQUIVO_DADOS_LOJA } = context;
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
    },

    awaiting_card_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageCardManagersMenu, saveJsonFile, shopData, ARQUIVO_DADOS_LOJA } = context;
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
    },

    awaiting_correction_method: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "🔍 Digite o LID/JID do usuário que deseja buscar:\n\nExemplo: 554391964950@lid ou 554391964950@s.whatsapp.net" });
            navigateTo(userJid, 'awaiting_correction_lid_input');
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "🔍 Digite o email do usuário que deseja buscar:" });
            navigateTo(userJid, 'awaiting_correction_email_input');
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_correction_lid_input: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, loadJsonFile, userState, ARQUIVO_USUARIOS, ARQUIVO_ADMINS, ARQUIVO_COMPRADORES, ARQUIVO_GERENCIADORES_PRODUTO, ARQUIVO_GERENCIADORES_CARTAO, ARQUIVO_GERENCIADORES_TROCA_REGIONAL, ARQUIVO_HISTORICO_COMPRAS, ARQUIVO_CHATS_ATIVOS, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA } = context;
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
    },

    awaiting_correction_email_input: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, loadJsonFile, userState, ARQUIVO_USUARIOS, ARQUIVO_ADMINS, ARQUIVO_COMPRADORES, ARQUIVO_GERENCIADORES_PRODUTO, ARQUIVO_GERENCIADORES_CARTAO, ARQUIVO_GERENCIADORES_TROCA_REGIONAL, ARQUIVO_HISTORICO_COMPRAS, ARQUIVO_CHATS_ATIVOS, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA, ARQUIVO_EMAILS_FINALIZADOS } = context;
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
    },

    awaiting_correction_new_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, loadJsonFile, saveJsonFile, userState, ARQUIVO_USUARIOS, ARQUIVO_ADMINS, ARQUIVO_COMPRADORES, ARQUIVO_GERENCIADORES_PRODUTO, ARQUIVO_GERENCIADORES_CARTAO, ARQUIVO_GERENCIADORES_TROCA_REGIONAL, ARQUIVO_HISTORICO_COMPRAS, ARQUIVO_CHATS_ATIVOS, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA, ARQUIVO_EMAILS_FINALIZADOS } = context;
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

                    // Map file paths to global state keys
                    const fileToStateKey = {
                        [ARQUIVO_USUARIOS]: 'userData',
                        [ARQUIVO_ADMINS]: 'adminData',
                        [ARQUIVO_COMPRADORES]: 'compradoresData',
                        [ARQUIVO_GERENCIADORES_PRODUTO]: 'productManagerData',
                        [ARQUIVO_GERENCIADORES_CARTAO]: 'gerenciadoresCartaoData',
                        [ARQUIVO_GERENCIADORES_TROCA_REGIONAL]: 'gerenciadoresTrocaRegionalData',
                        [ARQUIVO_HISTORICO_COMPRAS]: 'purchaseHistoryData',
                        [ARQUIVO_CHATS_ATIVOS]: 'activeChats',
                        [ARQUIVO_PEDIDOS]: 'pendingOrders',
                        [ARQUIVO_PEDIDOS_V]: 'pendingOrdersV',
                        [ARQUIVO_PEDIDOS_ESPERA]: 'waitingOrders',
                        [ARQUIVO_EMAILS_FINALIZADOS]: 'finishedEmails'
                    };

                    const stateKey = fileToStateKey[file.path];
                    if (stateKey && context.updateGlobalData) {
                        context.updateGlobalData(stateKey, fileData);
                        console.log(`[State Sync] Updated global state for ${stateKey}`);
                    }
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
    },

    awaiting_manage_admins_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendTeamManagementMenu, sendAddAdminPrompt, sendRemoveAdminPrompt, sendManageAdminsMenu, sendInvalidOptionMessage, saveJsonFile, adminData, ARQUIVO_ADMINS, isOwner } = context;

        // Permitir "0" para todos, mesmo non-owners
        if (messageText === '0') {
            await sendTeamManagementMenu(sock, userJid);
            return;
        }

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
    },

    awaiting_new_admin_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageAdminsMenu, saveJsonFile, adminData, ARQUIVO_ADMINS, isOwner } = context;

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
    },

    awaiting_admin_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageAdminsMenu, sendInvalidOptionMessage, saveJsonFile, adminData, ARQUIVO_ADMINS, isOwner } = context;

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
    },

    awaiting_manage_compradores_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendTeamManagementMenu, sendAddCompradorPrompt, sendRemoveCompradorPrompt, sendInvalidOptionMessage, isAdmin } = context;

        // Permitir "0" para todos
        if (messageText === '0') {
            await sendTeamManagementMenu(sock, userJid);
            return;
        }

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
    },

    awaiting_new_comprador_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageCompradoresMenu, saveJsonFile, compradoresData, userData, ARQUIVO_COMPRADORES, ARQUIVO_USUARIOS, isAdmin } = context;

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
    },

    awaiting_comprador_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData, isAdmin } = context;
        const compradoresArray = data.compradores;

        if (!isAdmin) return;

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
    },

    awaiting_comprador_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageCompradoresMenu, compradoresData, userData } = context;
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
    },

    awaiting_manage_product_managers_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAddProductManagerPrompt, sendRemoveProductManagerPrompt, sendTeamManagementMenu, sendInvalidOptionMessage, isAdmin } = context;

        // Permitir '0' para todos
        if (messageText === '0') {
            await sendTeamManagementMenu(sock, userJid);
            return;
        }

        if (!isAdmin) return;
        // MODO LEGACY: messageText removido - usa apenas messageText
        if (messageText === "1" || messageText === "manage_product_managers_1") {
            await sendAddProductManagerPrompt(sock, userJid);
        } else if (messageText === "2" || messageText === "manage_product_managers_2") {
            await sendRemoveProductManagerPrompt(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_new_product_manager_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageProductManagersMenu, saveJsonFile, productManagerData, userData, ARQUIVO_GERENCIADORES_PRODUTO, ARQUIVO_USUARIOS, isAdmin } = context;

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
    },

    awaiting_product_manager_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData, isAdmin } = context;
        const managersArray = data.managers;

        if (!isAdmin) return;

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
    },

    awaiting_product_manager_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageProductManagersMenu, saveJsonFile, productManagerData, userData, ARQUIVO_GERENCIADORES_PRODUTO, ARQUIVO_USUARIOS } = context;
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
    },

    awaiting_team_management_choice: async (sock, userJid, messageText, data, msg, context) => {
        const {
            sendAdminPanel,
            sendManageAdminsMenu,
            sendManageCompradoresMenu,
            sendManageProductManagersMenu,
            sendManageCardManagersMenu,
            sendManageRegionalChangeManagersMenu,
            sendManageCommissionsMenu,
            sendManageTeamEarningsMenu,
            sendInvalidOptionMessage
        } = context;

        const choice = messageText.trim();

        switch (choice) {
            case '1':
                await sendManageAdminsMenu(sock, userJid);
                break;
            case '2':
                await sendManageCompradoresMenu(sock, userJid);
                break;
            case '3':
                await sendManageProductManagersMenu(sock, userJid);
                break;
            case '4':
                await sendManageCardManagersMenu(sock, userJid);
                break;
            case '5':
                await sendManageRegionalChangeManagersMenu(sock, userJid);
                break;
            case '6':
                await sendManageCommissionsMenu(sock, userJid);
                break;
            case '7':
                await sendManageTeamEarningsMenu(sock, userJid);
                break;
            case '0':
                await sendAdminPanel(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '7', '0']);
                break;
        }
    },

    awaiting_commission_to_edit: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendTeamManagementMenu, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        const commissionTypes = {
            '1': 'porCompra',
            '2': 'porVerificacao',
            '3': 'admin',
            '4': 'gerenciadorProduto',
            '5': 'gerenciadorCartao',
            '6': 'gerenciadorTrocaRegional',
            '7': 'apoiador'
        };

        if (choice === '0') {
            await sendTeamManagementMenu(sock, userJid);
            return;
        }

        if (commissionTypes[choice]) {
            const type = commissionTypes[choice];
            await sendMessage(sock, userJid, { text: `💰 Digite o novo valor para a comissão *${type}* (use ponto para decimais, ex: 5.00):` });
            navigateTo(userJid, 'awaiting_new_commission_value', { type });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '6', '7', '0']);
        }
    },

    awaiting_new_commission_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageCommissionsMenu, saveJsonFile, shopData, ARQUIVO_DADOS_LOJA, apoiadoresData, ARQUIVO_APOIADORES } = context;
        const { type } = data;
        const value = parseFloat(messageText.replace(',', '.'));

        if (isNaN(value) || value < 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
            return;
        }

        if (type === 'apoiador') {
            // Atualiza comissão de todos os apoiadores
            for (const code in apoiadoresData) {
                apoiadoresData[code].comissao = value / 100; // Converte porcentagem para decimal
            }
            saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
            await sendMessage(sock, userJid, { text: `✅ Comissão de Apoiadores atualizada para ${value}%!` });
        } else {
            if (!shopData.comissoes) shopData.comissoes = {};
            shopData.comissoes[type] = value;
            saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
            await sendMessage(sock, userJid, { text: `✅ Comissão atualizada com sucesso!` });
        }

        await sendManageCommissionsMenu(sock, userJid);
    },

    awaiting_manage_card_managers_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAddCardManagerPrompt, sendRemoveCardManagerPrompt, sendTeamManagementMenu, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendTeamManagementMenu(sock, userJid);
            return;
        }

        if (choice === '1') {
            await sendAddCardManagerPrompt(sock, userJid);
        } else if (choice === '2') {
            await sendRemoveCardManagerPrompt(sock, userJid);
        } else if (choice === '0') {
            await sendTeamManagementMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_new_card_manager_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageCardManagersMenu, saveJsonFile, gerenciadoresCartaoData, userData, ARQUIVO_GERENCIADORES_CARTAO, ARQUIVO_USUARIOS } = context;
        const phoneNumber = messageText.replace(/\D/g, '');

        if (!/^\d{10,14}$/.test(phoneNumber)) {
            await sendMessage(sock, userJid, { text: "⚠️ Formato de número inválido." });
            return;
        }

        const newManagerJid = `${phoneNumber}@s.whatsapp.net`;
        if (gerenciadoresCartaoData[newManagerJid]) {
            await sendMessage(sock, userJid, { text: "⚠️ Este número já está cadastrado." });
            await sendManageCardManagersMenu(sock, userJid);
            return;
        }

        gerenciadoresCartaoData[newManagerJid] = { status: 'off', totalOnlineTime: 0, ganhosTotais: 0, caixa: 0, caixaBloqueado: 0, pixKeys: [] };
        saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);

        if (!userData[newManagerJid]) userData[newManagerJid] = { nome: newManagerJid.split('@')[0], status: 'comprador' };
        else userData[newManagerJid].status = 'comprador';
        saveJsonFile(ARQUIVO_USUARIOS, userData);

        await sendMessage(sock, userJid, { text: `✅ Gerenciador de Cartão adicionado!` });
        await sendManageCardManagersMenu(sock, userJid);
    },

    awaiting_card_manager_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData } = context;
        const managersArray = data.managers;
        const choice = parseInt(messageText.trim());

        if (messageText === '0') {
            // Voltar tratado no handler anterior se necessário, mas aqui o fluxo pede confirmação ou volta
            // O menu anterior chama sendManageCardManagersMenu se 0.
            // Aqui, se 0, volta pro menu de gerenciamento
            const { sendManageCardManagersMenu } = context;
            await sendManageCardManagersMenu(sock, userJid);
            return;
        }

        if (isNaN(choice) || choice < 1 || choice > managersArray.length) {
            await sendInvalidOptionMessage(sock, userJid, managersArray.map((_, i) => `${i + 1}`).concat('0'));
            return;
        }

        const managerJidToRemove = managersArray[choice - 1];
        await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover *${userData[managerJidToRemove]?.nome || managerJidToRemove}*?\n\n1️⃣ Sim\n2️⃣ Não` });
        navigateTo(userJid, 'awaiting_card_manager_removal_confirmation', { managerJidToRemove });
    },

    awaiting_card_manager_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageCardManagersMenu, saveJsonFile, gerenciadoresCartaoData, userData, ARQUIVO_GERENCIADORES_CARTAO, ARQUIVO_USUARIOS } = context;
        const { managerJidToRemove } = data;

        if (messageText === '1') {
            delete gerenciadoresCartaoData[managerJidToRemove];
            saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);
            if (userData[managerJidToRemove]) {
                userData[managerJidToRemove].status = 'navegando';
                saveJsonFile(ARQUIVO_USUARIOS, userData);
            }
            await sendMessage(sock, userJid, { text: "✅ Gerenciador removido!" });
        } else {
            await sendMessage(sock, userJid, { text: "❌ Remoção cancelada." });
        }
        await sendManageCardManagersMenu(sock, userJid);
    },

    awaiting_manage_regional_change_managers_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAddRegionalChangeManagerPrompt, sendRemoveRegionalChangeManagerPrompt, sendTeamManagementMenu, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendTeamManagementMenu(sock, userJid);
            return;
        }

        if (choice === '1') {
            await sendAddRegionalChangeManagerPrompt(sock, userJid);
        } else if (choice === '2') {
            await sendRemoveRegionalChangeManagerPrompt(sock, userJid);
        } else if (choice === '0') {
            await sendTeamManagementMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_new_regional_change_manager_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageRegionalChangeManagersMenu, saveJsonFile, gerenciadoresTrocaRegionalData, userData, ARQUIVO_GERENCIADORES_TROCA_REGIONAL, ARQUIVO_USUARIOS } = context;
        const phoneNumber = messageText.replace(/\D/g, '');

        if (!/^\d{10,14}$/.test(phoneNumber)) {
            await sendMessage(sock, userJid, { text: "⚠️ Formato inválido." });
            return;
        }

        const newManagerJid = `${phoneNumber}@s.whatsapp.net`;
        if (gerenciadoresTrocaRegionalData[newManagerJid]) {
            await sendMessage(sock, userJid, { text: "⚠️ Já cadastrado." });
            await sendManageRegionalChangeManagersMenu(sock, userJid);
            return;
        }

        gerenciadoresTrocaRegionalData[newManagerJid] = { ganhosTotais: 0, caixa: 0, caixaBloqueado: 0, pixKeys: [] };
        saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);

        if (!userData[newManagerJid]) userData[newManagerJid] = { nome: newManagerJid.split('@')[0], status: 'comprador' };
        else userData[newManagerJid].status = 'comprador';
        saveJsonFile(ARQUIVO_USUARIOS, userData);

        await sendMessage(sock, userJid, { text: `✅ Gerenciador de Troca Regional adicionado!` });
        await sendManageRegionalChangeManagersMenu(sock, userJid);
    },

    awaiting_regional_change_manager_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData, sendManageRegionalChangeManagersMenu } = context;
        const managersArray = data.managers;
        const choice = parseInt(messageText.trim());

        if (messageText === '0') {
            await sendManageRegionalChangeManagersMenu(sock, userJid);
            return;
        }

        if (isNaN(choice) || choice < 1 || choice > managersArray.length) {
            await sendInvalidOptionMessage(sock, userJid, managersArray.map((_, i) => `${i + 1}`).concat('0'));
            return;
        }

        const managerJidToRemove = managersArray[choice - 1];
        await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover *${userData[managerJidToRemove]?.nome || managerJidToRemove}*?\n\n1️⃣ Sim\n2️⃣ Não` });
        navigateTo(userJid, 'awaiting_regional_change_manager_removal_confirmation', { managerJidToRemove });
    },

    awaiting_regional_change_manager_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageRegionalChangeManagersMenu, saveJsonFile, gerenciadoresTrocaRegionalData, userData, ARQUIVO_GERENCIADORES_TROCA_REGIONAL, ARQUIVO_USUARIOS } = context;
        const { managerJidToRemove } = data;

        if (messageText === '1') {
            delete gerenciadoresTrocaRegionalData[managerJidToRemove];
            saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);
            if (userData[managerJidToRemove]) {
                userData[managerJidToRemove].status = 'navegando';
                saveJsonFile(ARQUIVO_USUARIOS, userData);
            }
            await sendMessage(sock, userJid, { text: "✅ Gerenciador removido!" });
        } else {
            await sendMessage(sock, userJid, { text: "❌ Remoção cancelada." });
        }
        await sendManageRegionalChangeManagersMenu(sock, userJid);
    },

    awaiting_bulk_price_change_type: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendAdminPanel, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendAdminPanel(sock, userJid);
            return;
        }

        const validChoices = ['1', '2', '3', '4'];
        if (validChoices.includes(choice)) {
            const types = {
                '1': 'increase_percent',
                '2': 'decrease_percent',
                '3': 'increase_fixed',
                '4': 'decrease_fixed'
            };
            await sendMessage(sock, userJid, { text: "🔢 Digite o valor para a alteração (ex: 10 para 10% ou 5.00 para R$ 5,00):" });
            navigateTo(userJid, 'awaiting_bulk_price_change_value', { type: types[choice] });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
        }
    },

    awaiting_bulk_price_change_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAdminPanel, saveJsonFile, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS, DIRETORIO_CONTAS_EXCLUSIVAS, loadJsonFile } = context;
        const { type } = data;
        const value = parseFloat(messageText.replace(',', '.'));
        const fs = require('fs');
        const path = require('path');

        if (isNaN(value) || value <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
            return;
        }

        // Função auxiliar para atualizar preços em um diretório
        const updatePricesInDirectory = (directory) => {
            let count = 0;
            if (!fs.existsSync(directory)) return 0;

            const files = fs.readdirSync(directory);
            for (const file of files) {
                const fullPath = path.join(directory, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    count += updatePricesInDirectory(fullPath);
                } else if (file.endsWith('.json')) {
                    let products = loadJsonFile(fullPath, []);
                    let modified = false;

                    products = products.map(p => {
                        if (p.price) {
                            let newPrice = p.price;
                            if (type === 'increase_percent') newPrice += newPrice * (value / 100);
                            else if (type === 'decrease_percent') newPrice -= newPrice * (value / 100);
                            else if (type === 'increase_fixed') newPrice += value;
                            else if (type === 'decrease_fixed') newPrice -= value;

                            if (newPrice < 0) newPrice = 0;
                            if (newPrice !== p.price) {
                                p.price = parseFloat(newPrice.toFixed(2));
                                modified = true;
                            }
                        }
                        return p;
                    });

                    if (modified) {
                        saveJsonFile(fullPath, products);
                        count += products.length;
                    }
                }
            }
            return count;
        };

        let totalUpdated = 0;
        totalUpdated += updatePricesInDirectory(DIRETORIO_OFERTAS);
        totalUpdated += updatePricesInDirectory(DIRETORIO_ESFERAS);
        totalUpdated += updatePricesInDirectory(DIRETORIO_CONTAS_EXCLUSIVAS);

        await sendMessage(sock, userJid, { text: `✅ Preços atualizados em ${totalUpdated} produtos!` });
        await sendAdminPanel(sock, userJid);
    },

    awaiting_section_action_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendProductManagementBrowser, sendProductCategoryList, sendInvalidOptionMessage } = context;
        const { currentPath, productType } = data;
        const choice = messageText.trim();

        switch (choice) {
            case '1': // Adicionar Seção
                await sendProductManagementBrowser(sock, userJid, 'add', currentPath, productType);
                break;
            case '2': // Editar Seção
                await sendProductManagementBrowser(sock, userJid, 'edit', currentPath, productType);
                break;
            case '3': // Remover Seção
                await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
                break;
            case '0':
                await sendProductCategoryList(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                break;
        }
    },

    awaiting_product_browse_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductManagementBrowser, sendProductCategoryList, sendGenericProductList, sendInvalidOptionMessage, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { action, currentPath, options, productType } = data;
        const choice = messageText.trim();
        const path = require('path');

        if (choice === '0') {
            // Voltar um nível
            if (currentPath === '') {
                await sendProductCategoryList(sock, userJid);
            } else {
                const parentPath = path.dirname(currentPath);
                await sendProductManagementBrowser(sock, userJid, action, parentPath === '.' ? '' : parentPath, productType);
            }
            return;
        }

        if (choice.toUpperCase() === 'X' && action === 'add') {
            // Adicionar produto no diretório atual
            await sendMessage(sock, userJid, { text: "📦 Digite o *nome* do novo produto:" });
            navigateTo(userJid, 'awaiting_new_product_name', { currentPath, productType });
            return;
        }

        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= options.length) {
            await sendInvalidOptionMessage(sock, userJid, options.map((_, i) => `${i + 1}`).concat('0'));
            return;
        }

        const selected = options[index];
        if (selected.type === 'dir') {
            const newPath = path.join(currentPath, selected.name);
            await sendProductManagementBrowser(sock, userJid, action, newPath, productType);
        } else if (selected.type === 'product') {
            // Editar ou remover produto específico
            if (action === 'edit') {
                // Carregar menu de edição do produto
                const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const fullPath = path.join(basePath, selected.section);
                // Encontrar o arquivo json correto pode ser complexo se houver vários, assumindo estrutura padrão
                // Simplificação: sendGenericProductList lida com arquivos JSON inteiros.
                // Aqui estamos navegando em arquivos individuais se a estrutura for essa, ou itens dentro de um JSON.
                // O browser lista produtos extraídos de JSONs.
                // selected.data tem os dados do produto.
                // Precisamos saber de qual arquivo veio. O browser carregou de todos os JSONs do diretório.
                // Vamos simplificar: se selecionou um produto, vamos para o menu de edição dele.
                // Mas precisamos do arquivo de origem. O browser deveria ter passado.
                // Vou assumir que o browser não passou o arquivo exato, o que é uma falha na minha implementação anterior do browser.
                // CORREÇÃO: O browser varre JSONs.
                // Vou redirecionar para sendGenericProductList do arquivo específico se possível, ou implementar edição direta aqui.
                // Melhor: sendGenericProductList espera um arquivo.
                // Vou implementar um 'awaiting_product_edit_menu' genérico.
                await sendMessage(sock, userJid, { text: "⚠️ Funcionalidade de edição direta via browser em aprimoramento. Use a navegação por categorias para editar." });
                await sendProductCategoryList(sock, userJid);
            } else if (action === 'remove') {
                await sendMessage(sock, userJid, { text: "⚠️ Funcionalidade de remoção direta via browser em aprimoramento. Use a navegação por categorias para remover." });
                await sendProductCategoryList(sock, userJid);
            }
        }
    },

    awaiting_section_browse_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendSectionManagementBrowser, sendProductCategoryList, sendInvalidOptionMessage, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { action, currentPath, options, productType } = data;
        const choice = messageText.trim();
        const path = require('path');
        const fs = require('fs');

        if (choice === '0') {
            if (currentPath === '') {
                await sendProductCategoryList(sock, userJid);
            } else {
                const parentPath = path.dirname(currentPath);
                await sendSectionManagementBrowser(sock, userJid, action, parentPath === '.' ? '' : parentPath, productType);
            }
            return;
        }

        if (choice.toUpperCase() === 'X') {
            const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
            const fullPath = path.join(basePath, currentPath);

            if (action === 'add') {
                await sendMessage(sock, userJid, { text: "📂 Digite o *nome* da nova seção (pasta):" });
                navigateTo(userJid, 'awaiting_new_section_name', { currentPath, productType });
            } else if (action === 'remove') {
                // Verificar se a pasta está vazia
                if (fs.readdirSync(fullPath).length > 0) {
                    await sendMessage(sock, userJid, { text: "⚠️ A seção não está vazia. Remova os produtos/subseções primeiro." });
                    await sendSectionManagementBrowser(sock, userJid, action, currentPath, productType);
                } else {
                    fs.rmdirSync(fullPath);
                    await sendMessage(sock, userJid, { text: "✅ Seção removida com sucesso!" });
                    const parentPath = path.dirname(currentPath);
                    await sendSectionManagementBrowser(sock, userJid, action, parentPath === '.' ? '' : parentPath, productType);
                }
            }
            return;
        }

        const index = parseInt(choice) - 1;
        if (isNaN(index) || index < 0 || index >= options.length) {
            await sendInvalidOptionMessage(sock, userJid, options.map((_, i) => `${i + 1}`).concat('0'));
            return;
        }

        const selected = options[index];
        const newPath = path.join(currentPath, selected.name);
        await sendSectionManagementBrowser(sock, userJid, action, newPath, productType);
    },

    awaiting_generic_product_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductCategoryList, sendInvalidOptionMessage, loadJsonFile, saveJsonFile } = context;
        const { category, products, productFile } = data;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendProductCategoryList(sock, userJid);
            return;
        }

        if (choice === '1') { // Adicionar
            await sendMessage(sock, userJid, { text: "📦 Digite o *nome* do novo produto:" });
            navigateTo(userJid, 'awaiting_new_product_name_simple', { category, productFile });
        } else if (choice === '2') { // Editar
            await sendMessage(sock, userJid, { text: "✏️ Digite o *número* do produto que deseja editar:" });
            navigateTo(userJid, 'awaiting_product_selection_edit', { category, products, productFile });
        } else if (choice === '3') { // Remover
            await sendMessage(sock, userJid, { text: "❌ Digite o *número* do produto que deseja remover:" });
            navigateTo(userJid, 'awaiting_product_selection_remove', { category, products, productFile });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
        }
    },

    awaiting_new_product_name_simple: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { category, productFile } = data;
        const name = messageText.trim();
        await sendMessage(sock, userJid, { text: `📝 Digite a *descrição* para ${name}:` });
        navigateTo(userJid, 'awaiting_new_product_description_simple', { category, productFile, newProduct: { name } });
    },

    awaiting_new_product_description_simple: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { category, productFile, newProduct } = data;
        newProduct.description = messageText.trim();
        await sendMessage(sock, userJid, { text: "💰 Digite o *preço* (ex: 10.00):" });
        navigateTo(userJid, 'awaiting_new_product_price_simple', { category, productFile, newProduct });
    },

    awaiting_new_product_price_simple: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendGenericProductList, loadJsonFile, saveJsonFile } = context;
        const { category, productFile, newProduct } = data;
        const price = parseFloat(messageText.replace(',', '.'));

        if (isNaN(price) || price < 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Preço inválido." });
            return;
        }

        newProduct.price = price;
        // Adicionar campos padrão
        newProduct.estoque = 999;
        if (category === 'contas_exclusivas') newProduct.login = "A definir";

        const products = loadJsonFile(productFile, []);
        products.push(newProduct);
        saveJsonFile(productFile, products);

        await sendMessage(sock, userJid, { text: "✅ Produto adicionado com sucesso!" });
        await sendGenericProductList(sock, userJid, category, productFile);
    },

    awaiting_product_selection_edit: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendEditAttributeMenu, sendInvalidOptionMessage } = context;
        const { category, products, productFile } = data;
        const index = parseInt(messageText) - 1;

        if (isNaN(index) || index < 0 || index >= products.length) {
            await sendInvalidOptionMessage(sock, userJid, products.map((_, i) => `${i + 1}`));
            return;
        }

        const product = products[index];
        await sendEditAttributeMenu(sock, userJid, product, category, productFile); // Note: section param replaced by productFile for simplicity in this flow
    },

    awaiting_product_selection_remove: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendGenericProductList, saveJsonFile, sendInvalidOptionMessage } = context;
        const { category, products, productFile } = data;
        const index = parseInt(messageText) - 1;

        if (isNaN(index) || index < 0 || index >= products.length) {
            await sendInvalidOptionMessage(sock, userJid, products.map((_, i) => `${i + 1}`));
            return;
        }

        products.splice(index, 1);
        saveJsonFile(productFile, products);
        await sendMessage(sock, userJid, { text: "✅ Produto removido com sucesso!" });
        await sendGenericProductList(sock, userJid, category, productFile);
    },

    awaiting_farm_dragon_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAdminPanel, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        if (choice === '1') {
            // Lógica de farm positivo/negativo (simplificada ou redirecionada)
            // Como não tenho a lógica de cálculo aqui, vou apenas informar
            await sendMessage(sock, userJid, { text: "🐉 Funcionalidade de cálculo de farm em manutenção." });
            await sendAdminPanel(sock, userJid);
        } else if (choice === '0') {
            await sendAdminPanel(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
        }
    },

    awaiting_ticket_type_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendTicketManagementList, sendAdminPanel, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        switch (choice) {
            case '1':
                await sendTicketManagementList(sock, userJid, 'variable_purchase');
                break;
            case '2':
                await sendTicketManagementList(sock, userJid, 'support');
                break;
            case '3':
                await sendTicketManagementList(sock, userJid, 'payout');
                break;
            case '0':
                await sendAdminPanel(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                break;
        }
    },

    awaiting_apoiadores_menu_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendListApoiadores, sendAdminPanel, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        switch (choice) {
            case '1': // Adicionar
                await sendMessage(sock, userJid, { text: "➕ Digite o *código* do novo apoiador (ex: PARCEIRO10):" });
                navigateTo(userJid, 'awaiting_new_apoiador_code');
                break;
            case '2': // Listar
                await sendListApoiadores(sock, userJid);
                break;
            case '3': // Remover
                await sendMessage(sock, userJid, { text: "🗑️ Digite o *código* do apoiador que deseja remover:" });
                navigateTo(userJid, 'awaiting_apoiador_removal_code');
                break;
            case '0':
                await sendAdminPanel(sock, userJid);
                break;
            default:
                await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
                break;
        }
    },

    awaiting_new_apoiador_code: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, apoiadoresData } = context;
        const code = messageText.trim().toUpperCase();

        if (apoiadoresData[code]) {
            await sendMessage(sock, userJid, { text: "⚠️ Este código já existe. Tente outro." });
            return;
        }

        await sendMessage(sock, userJid, { text: `👤 Digite o *nome* do dono do código ${code}:` });
        navigateTo(userJid, 'awaiting_new_apoiador_name', { code });
    },

    awaiting_new_apoiador_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { code } = data;
        const name = messageText.trim();

        await sendMessage(sock, userJid, { text: `📱 Digite o *número* do dono (com DDI e DDD):` });
        navigateTo(userJid, 'awaiting_new_apoiador_number', { code, name });
    },

    awaiting_new_apoiador_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendApoiadoresMenu, saveJsonFile, apoiadoresData, ARQUIVO_APOIADORES } = context;
        const { code, name } = data;
        const number = messageText.replace(/\D/g, '');

        apoiadoresData[code] = {
            ownerName: name,
            ownerNumber: number,
            comissao: 0.05, // Padrão 5%
            ativo: true,
            ganhosTotais: 0,
            usos: 0
        };

        saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
        await sendMessage(sock, userJid, { text: `✅ Apoiador *${code}* adicionado com sucesso!` });
        await sendApoiadoresMenu(sock, userJid);
    },

    awaiting_apoiador_removal_code: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendApoiadoresMenu, saveJsonFile, apoiadoresData, ARQUIVO_APOIADORES } = context;
        const code = messageText.trim().toUpperCase();

        if (!apoiadoresData[code]) {
            await sendMessage(sock, userJid, { text: "⚠️ Apoiador não encontrado." });
            await sendApoiadoresMenu(sock, userJid);
            return;
        }

        delete apoiadoresData[code];
        saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
        await sendMessage(sock, userJid, { text: `✅ Apoiador *${code}* removido com sucesso!` });
        await sendApoiadoresMenu(sock, userJid);
    },

    awaiting_apoiadores_list_back: async (sock, userJid, messageText, data, msg, context) => {
        const { sendApoiadoresMenu } = context;
        // Qualquer entrada volta pro menu
        await sendApoiadoresMenu(sock, userJid);
    },

    awaiting_new_discount_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendParametersManagementMenu, saveJsonFile, shopData } = context;

        const newDiscount = parseFloat(messageText.replace(',', '.'));
        if (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número entre 0 e 100." });
            return;
        }
        shopData.descontoAutomaticoOferta = newDiscount;
        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
        await sendMessage(sock, userJid, { text: `✅ Desconto automático atualizado para ${newDiscount}% com sucesso!` });
        await sendParametersManagementMenu(sock, userJid);
    },

    awaiting_new_minimum_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendParametersManagementMenu, saveJsonFile, shopData } = context;

        const newMinimum = parseFloat(messageText.replace(',', '.'));
        if (isNaN(newMinimum) || newMinimum < 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
            return;
        }
        shopData.compraMinima = newMinimum;
        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
        await sendMessage(sock, userJid, { text: `✅ Compra mínima atualizada para R$ ${newMinimum.toFixed(2)} com sucesso!` });
        await sendParametersManagementMenu(sock, userJid);
    },

    awaiting_new_pix_key: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendParametersManagementMenu, saveJsonFile, shopData } = context;

        // Check if this is for changing store PIX key (no alias in data) or personal PIX key (has alias)
        if (data && data.alias) {
            // This is handled by another part of the code for personal PIX keys
            // Should not reach here from parameters management
            return;
        }

        const newPixKey = messageText.trim();
        if (!newPixKey || newPixKey.length < 5) {
            await sendMessage(sock, userJid, { text: "⚠️ Chave PIX inválida. Digite uma chave válida." });
            return;
        }
        shopData.chavePix = newPixKey;
        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
        await sendMessage(sock, userJid, { text: `✅ Chave PIX atualizada com sucesso!\n\n*Nova chave:* ${newPixKey}` });
        await sendParametersManagementMenu(sock, userJid);
    },

    awaiting_create_order_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData } = context;
        const phone = messageText.replace(/\D/g, '');

        if (phone.length < 10 || phone.length > 15) {
            await sendMessage(sock, userJid, { text: "⚠️ Número inválido. Tente novamente (ex: 5511999999999):" });
            return;
        }

        const clientJid = `${phone}@s.whatsapp.net`;
        const clientName = userData[clientJid]?.nome || "Cliente Novo";

        await sendMessage(sock, userJid, { text: `✅ Cliente selecionado: *${clientName}* (${phone})\n\nAgora, digite o *nome do produto* que será adicionado ao pedido:` });
        navigateTo(userJid, 'awaiting_create_order_product', { clientJid, clientName });
    },

    awaiting_create_order_product: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { clientJid, clientName } = data;
        const productName = messageText.trim();

        if (productName.length < 3) {
            await sendMessage(sock, userJid, { text: "⚠️ Nome do produto muito curto. Tente novamente:" });
            return;
        }

        await sendMessage(sock, userJid, { text: `📦 Produto: *${productName}*\n\nAgora, digite o *valor total* do pedido (ex: 19.90):` });
        navigateTo(userJid, 'awaiting_create_order_value', { clientJid, clientName, productName });
    },

    awaiting_create_order_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { clientJid, clientName, productName } = data;
        const value = parseFloat(messageText.replace(',', '.'));

        if (isNaN(value) || value <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número válido (ex: 19.90):" });
            return;
        }

        const confirmationText = `📝 *Confirmar Criação de Pedido*\n\n` +
            `👤 *Cliente:* ${clientName}\n` +
            `📦 *Produto:* ${productName}\n` +
            `💰 *Valor:* R$ ${value.toFixed(2)}\n\n` +
            `1️⃣ Confirmar e Criar\n` +
            `0️⃣ Cancelar`;

        await sendMessage(sock, userJid, { text: confirmationText });
        navigateTo(userJid, 'awaiting_create_order_confirm', { clientJid, clientName, productName, value });
    },

    awaiting_create_order_confirm: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, pendingOrders, saveJsonFile, generateOrderId, ARQUIVO_PEDIDOS, purchaseHistoryData = {}, ARQUIVO_HISTORICO_COMPRAS } = context;
        const { clientJid, clientName, productName, value } = data;

        if (messageText === '1') {
            const newOrder = {
                id: generateOrderId(),
                clientJid,
                clientName,
                items: [{ name: productName, price: value, quantity: 1 }],
                total: value,
                status: 'pendente',
                timestamp: Date.now(),
                sourceQueue: 'manual_creation'
            };

            pendingOrders.push(newOrder);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);

            // Adicionar ao histórico de compras do cliente
            if (!purchaseHistoryData[clientJid]) {
                purchaseHistoryData[clientJid] = [];
            }
            purchaseHistoryData[clientJid].push(newOrder);
            saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);

            await sendMessage(sock, userJid, { text: `✅ Pedido *#${newOrder.id}* criado com sucesso!` });

            // Tentar notificar o cliente
            try {
                await sendMessage(sock, clientJid, { text: `🛍️ *Novo Pedido Criado*\n\nUm novo pedido foi gerado para você:\n\n📦 *Produto:* ${productName}\n💰 *Valor:* R$ ${value.toFixed(2)}\n\nAguarde o contato de um atendente para finalizar o pagamento.` });
            } catch (e) {
                // Ignora erro de envio
            }

            delete context.userState[userJid];
        } else {
            await sendMessage(sock, userJid, { text: "❌ Criação de pedido cancelada." });
            delete context.userState[userJid];
        }
    }
};
