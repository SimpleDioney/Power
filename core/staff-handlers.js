const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_PEDIDOS,
    ARQUIVO_PEDIDOS_V,
    ARQUIVO_PEDIDOS_ESPERA,
    ARQUIVO_HISTORICO_COMPRAS,
    ARQUIVO_SOLICITACOES_VERIFICACAO,
    ARQUIVO_EMAILS_FINALIZADOS,
    ARQUIVO_ADMINS,
    ARQUIVO_COMPRADORES,
    ARQUIVO_GERENCIADORES_CARTAO,
    ARQUIVO_GERENCIADORES_TROCA_REGIONAL,
    ARQUIVO_GERENCIADORES_PRODUTOS,
    ARQUIVO_TICKETS
} = require("../config/paths");

module.exports = {
    awaiting_attendance_start_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, startNextAttendance, sendInvalidOptionMessage, userState } = context;
        const choice = messageText.trim();

        if (choice === '1') {
            await startNextAttendance(sock, userJid);
        } else if (choice === '2') {
            delete userState[userJid];
            await sendMessage(sock, userJid, { text: "👋 Até logo!" });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_start_sales_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, pendingOrders, pendingOrdersV, sendMainMenu, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendMainMenu(sock, userJid);
            return;
        }

        if (choice === '1') {
            const allOrders = [...pendingOrdersV, ...pendingOrders];

            if (allOrders.length === 0) {
                await sendMessage(sock, userJid, { text: "⚠️ Não há pedidos pendentes no momento." });
                await sendMainMenu(sock, userJid);
                return;
            }

            let menuText = "📦 *Pedidos Pendentes*\n\nSelecione um pedido para iniciar o atendimento:\n\n";
            const options = {};

            allOrders.forEach((order, index) => {
                const type = order.sourceQueue === 'manual_creation' ? '📝 Manual' : (order.items && order.items[0] && order.items[0].isVariable ? '💎 Variável' : '📦 Fixo');
                menuText += `*${index + 1}* - Pedido #${order.id} (${type}) - ${order.clientName}\n`;
                options[index + 1] = order;
            });

            menuText += "\n0️⃣ Voltar";

            await sendMessage(sock, userJid, { text: menuText });
            navigateTo(userJid, 'awaiting_order_selection', { options });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
        }
    },

    awaiting_order_selection: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendMainMenu, sendInvalidOptionMessage, userData } = context;
        const { options } = data;
        const choice = parseInt(messageText.trim());

        if (choice === 0) {
            await sendMainMenu(sock, userJid);
            return;
        }

        const selectedOrder = options[choice];

        if (!selectedOrder) {
            await sendInvalidOptionMessage(sock, userJid, Object.keys(options).concat('0'));
            return;
        }

        // Iniciar atendimento
        const clientJid = selectedOrder.clientJid;
        const clientName = selectedOrder.clientName;

        await sendMessage(sock, userJid, { text: `✅ Atendimento iniciado para o pedido *#${selectedOrder.id}* de *${clientName}*.\n\nVocê pode usar */finalizar* para concluir a venda ou */suporte* para encaminhar.` });

        // Notificar cliente
        try {
            await sendMessage(sock, clientJid, { text: `👨‍💻 Um atendente iniciou o processamento do seu pedido *#${selectedOrder.id}*.\n\nAguarde, logo entraremos em contato!` });
            navigateTo(clientJid, 'in_direct_chat', { partnerJid: userJid, orderId: selectedOrder.id });
        } catch (e) {
            // Ignora erro
        }

        navigateTo(userJid, 'in_attendance_chat', { currentOrder: selectedOrder });
    },

    in_attendance_chat: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, userData } = context;
        const { currentOrder } = data;
        const clientJid = currentOrder.clientJid;

        await sendMessage(sock, clientJid, { text: `👨‍💻 *Atendente:* ${messageText}` });
    },

    awaiting_ms_account_for_item: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, userState, formatCurrencyByLanguage, getUserLanguage } = context;
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
    },

    awaiting_ms_account_single: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, userState } = context;
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
    },

    awaiting_final_verification_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, shopData, adminData, compradoresData, gerenciadoresCartaoData, gerenciadoresTrocaRegionalData, purchaseHistory, pendingOrders, pendingOrdersV, activeChats, finishedEmails, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_CHATS_ATIVOS, ARQUIVO_COMPRADORES, ARQUIVO_USUARIOS, ARQUIVO_DADOS_LOJA, ARQUIVO_HISTORICO_COMPRAS, ARQUIVO_EMAILS_FINALIZADOS, addEarningsToMember, formatCurrencyByLanguage, getUserLanguage } = context;
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

        // Atualiza activeChats
        // Usamos splice para modificar o array original (referência global) em vez de filter (novo array)
        for (let i = activeChats.length - 1; i >= 0; i--) {
            if (activeChats[i].orderId === order.id) {
                activeChats.splice(i, 1);
            }
        }
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

        const userHistory = purchaseHistory[clientJid] || [];
        const historyOrder = userHistory.find(h => h.id === finalizedOrder.id);
        if (historyOrder) {
            historyOrder.statusDisplay = 'Concluído';
            purchaseHistory[clientJid] = userHistory;
            saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistory);
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

        delete context.userState[userJid];
        delete context.userState[clientJid];

        const updatedPendingOrders = [...pendingOrdersV, ...pendingOrders].filter(o => o.status === 'pendente');
        if (updatedPendingOrders.length > 0) {
            await sendMessage(sock, userJid, { text: `Restam *${updatedPendingOrders.length}* pedidos pendentes. Deseja atender o próximo?\n\n1️⃣ Sim\n2️⃣ Não` });
            navigateTo(userJid, 'awaiting_next_order_choice');
        } else {
            await sendMessage(sock, userJid, { text: "🎉 Ótimo trabalho! Todos os pedidos foram processados." });
        }
    },

    awaiting_email_management_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendAdminPanel, sendAdminEmailsList, finishedEmails, ARQUIVO_EMAILS_FINALIZADOS, shopData, ARQUIVO_DADOS_LOJA } = context;
        const { buyers, emails } = data;
        const choice = messageText.trim().toUpperCase();

        if (choice === 'X') {
            // Limpar tudo (cuidado com essa referência global, idealmente usar setter/getter ou manipular objeto)
            // Como finishedEmails é objeto, podemos limpar as chaves
            for (const key in finishedEmails) delete finishedEmails[key];
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
    },

    awaiting_email_outcome: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendAdminPanel, sendAdminEmailsList, finishedEmails, ARQUIVO_EMAILS_FINALIZADOS, shopData, ARQUIVO_DADOS_LOJA } = context;
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
    },

    awaiting_comprador_email_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendCompradorMenu, finishedEmails, ARQUIVO_EMAILS_FINALIZADOS, userData } = context;
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
    },

    awaiting_verification_main_menu_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendGameAccountManagementMenu, sendVerificationTutorial, handleVerificationRequest } = context;
        const { accountIndex } = data;
        if (messageText === '1') {
            // handleVerificationRequest precisa ser passado no context ou importado
            if (context.handleVerificationRequest) {
                await context.handleVerificationRequest(sock, userJid, accountIndex);
            } else {
                // Fallback se a função não estiver no context (deveria estar)
                await sendMessage(sock, userJid, { text: "Erro: Função de verificação não encontrada." });
            }
        } else if (messageText === '2') {
            await sendVerificationTutorial(sock, userJid, accountIndex);
        } else {
            await sendGameAccountManagementMenu(sock, userJid);
        }
    },

    awaiting_tutorial_verification_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendMainMenu, handleVerificationRequest } = context;
        const { accountIndex } = data;
        if (messageText === '1') {
            if (context.handleVerificationRequest) {
                await context.handleVerificationRequest(sock, userJid, accountIndex);
            }
        } else {
            // sendMainMenu precisa estar no context
            if (context.sendMainMenu) {
                await context.sendMainMenu(sock, userJid);
            } else {
                // Fallback simples
                await sendMessage(sock, userJid, { text: "Voltando ao menu principal..." });
                delete context.userState[userJid];
            }
        }
    },

    awaiting_verification_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, startNextAttendance } = context;
        const { requests } = data;
        if (messageText === '1') {
            if (requests.length > 0) {
                await startNextAttendance(sock, userJid);
            }
        } else {
            delete context.userState[userJid];
        }
    },

    awaiting_verification_outcome: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, shopData, compradoresData, verificationRequests, activeChats, ARQUIVO_USUARIOS, ARQUIVO_DADOS_LOJA, ARQUIVO_COMPRADORES, ARQUIVO_SOLICITACOES_VERIFICACAO, ARQUIVO_CHATS_ATIVOS, formatCurrencyByLanguage, getUserLanguage } = context;
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

        // Remover chat ativo
        for (let i = activeChats.length - 1; i >= 0; i--) {
            if (activeChats[i].sellerJid === userJid && activeChats[i].clientJid === clientJid) {
                activeChats.splice(i, 1);
            }
        }
        saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);

        delete context.userState[userJid];
        delete context.userState[clientJid];
    },

    awaiting_generated_payment_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, startPixCheckoutProcess, formatCurrencyByLanguage, getUserLanguage } = context;
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
    },

    awaiting_manage_regional_change_managers_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendAddRegionalChangeManagerPrompt, sendRemoveRegionalChangeManagerPrompt, sendInvalidOptionMessage } = context;
        if (messageText === "1") {
            await sendAddRegionalChangeManagerPrompt(sock, userJid);
        } else if (messageText === "2") {
            await sendRemoveRegionalChangeManagerPrompt(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_new_regional_change_manager_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageRegionalChangeManagersMenu, gerenciadoresTrocaRegionalData, ARQUIVO_GERENCIADORES_TROCA_REGIONAL } = context;
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
    },

    awaiting_regional_change_manager_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageRegionalChangeManagersMenu, sendInvalidOptionMessage, gerenciadoresTrocaRegionalData, ARQUIVO_GERENCIADORES_TROCA_REGIONAL } = context;
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
    },

    awaiting_manage_card_managers_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendAddCardManagerPrompt, sendRemoveCardManagerPrompt, sendInvalidOptionMessage } = context;
        if (messageText === "1") {
            await sendAddCardManagerPrompt(sock, userJid);
        } else if (messageText === "2") {
            await sendRemoveCardManagerPrompt(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_new_card_manager_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageCardManagersMenu, gerenciadoresCartaoData, ARQUIVO_GERENCIADORES_CARTAO } = context;
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
    },

    awaiting_card_manager_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManageCardManagersMenu, sendInvalidOptionMessage, gerenciadoresCartaoData, ARQUIVO_GERENCIADORES_CARTAO } = context;
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
    },

    awaiting_earnings_menu_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendPixKeySelectionMenu, sendManagePixKeysMenu, sendMyEarningsMenu, sendInvalidOptionMessage } = context;
        const choice = messageText.trim();

        if (choice === '1' || choice === 'earnings_withdraw') {
            // Solicitar Saque
            await sendPixKeySelectionMenu(sock, userJid);
        } else if (choice === '2' || choice === 'earnings_manage_pix') {
            // Gerenciar Chaves PIX
            await sendManagePixKeysMenu(sock, userJid);
        } else if (choice === '0') {
            // Voltar - need to determine where to go back
            // For compradores, go to comprador menu; for admins/others, go to their respective menus
            const { isComprador, sendCompradorMenu, sendMainMenu } = context;
            if (isComprador) {
                await sendCompradorMenu(sock, userJid);
            } else {
                await sendMainMenu(sock, userJid);
            }
            await sendMessage(sock, userJid, { text: "Por favor, digite um *apelido* para esta nova chave (ex: PIX Celular, PIX CPF):" });
            navigateTo(userJid, 'awaiting_new_pix_alias');
        } else if (choice === 'B' && pixKeys.length > 0) {
            // Remover uma chave PIX
            let menuText = "🗑️ *Remover Chave PIX*\n\nQual chave você deseja remover?\n\n";
            pixKeys.forEach((key, index) => {
                menuText += `*${index + 1}* - ${key.alias} (${key.key})\n`;
            });
            menuText += "\n0️⃣ ↩️ Voltar";
            await sendMessage(sock, userJid, { text: menuText });
            navigateTo(userJid, 'awaiting_pix_key_to_remove_choice', { pixKeys });
        } else if (choice === '0') {
            // Voltar
            await sendMyEarningsMenu(sock, userJid);
        } else {
            const validOptions = ['A', '0'];
            if (pixKeys.length > 0) validOptions.push('B');
            await sendInvalidOptionMessage(sock, userJid, validOptions);
        }
    },

    awaiting_new_pix_alias: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const alias = messageText.trim();

        if (alias.length === 0 || alias.length > 50) {
            await sendMessage(sock, userJid, { text: "⚠️ O apelido deve ter entre 1 e 50 caracteres. Tente novamente:" });
            return;
        }

        await sendMessage(sock, userJid, { text: `Ótimo! Agora digite a *chave PIX* para "${alias}":\n\n(Pode ser CPF, CNPJ, e-mail, telefone ou chave aleatória)` });
        navigateTo(userJid, 'awaiting_new_pix_key', { alias });
    },

    awaiting_new_pix_key: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManagePixKeysMenu, adminData, compradoresData, gerenciadoresCartaoData, gerenciadoresTrocaRegionalData, productManagerData } = context;
        const { alias } = data;
        const pixKey = messageText.trim();

        if (pixKey.length === 0) {
            await sendMessage(sock, userJid, { text: "⚠️ A chave PIX não pode estar vazia. Tente novamente:" });
            return;
        }

        // Determine which role this user has and save to the appropriate data file
        let memberData = null;
        let fileToSave = null;
        let dataObject = null;

        if (adminData[userJid]) {
            memberData = adminData[userJid];
            fileToSave = ARQUIVO_ADMINS;
            dataObject = adminData;
        } else if (compradoresData[userJid]) {
            memberData = compradoresData[userJid];
            fileToSave = ARQUIVO_COMPRADORES;
            dataObject = compradoresData;
        } else if (gerenciadoresCartaoData[userJid]) {
            memberData = gerenciadoresCartaoData[userJid];
            fileToSave = ARQUIVO_GERENCIADORES_CARTAO;
            dataObject = gerenciadoresCartaoData;
        } else if (gerenciadoresTrocaRegionalData[userJid]) {
            memberData = gerenciadoresTrocaRegionalData[userJid];
            fileToSave = ARQUIVO_GERENCIADORES_TROCA_REGIONAL;
            dataObject = gerenciadoresTrocaRegionalData;
        } else if (productManagerData[userJid]) {
            memberData = productManagerData[userJid];
            fileToSave = ARQUIVO_GERENCIADORES_PRODUTOS;
            dataObject = productManagerData;
        }

        if (!memberData) {
            await sendMessage(sock, userJid, { text: "❌ Erro: Você não tem permissão para gerenciar chaves PIX." });
            return;
        }

        // Initialize pixKeys array if it doesn't exist
        if (!memberData.pixKeys) {
            memberData.pixKeys = [];
        }

        // Check if PIX key already exists
        if (memberData.pixKeys.some(k => k.key === pixKey)) {
            await sendMessage(sock, userJid, { text: "⚠️ Esta chave PIX já está cadastrada. Tente outra:" });
            return;
        }

        // Add new PIX key
        memberData.pixKeys.push({ alias, key: pixKey });
        saveJsonFile(fileToSave, dataObject);

        await sendMessage(sock, userJid, { text: `✅ Chave PIX adicionada com sucesso!\n\n*Apelido:* ${alias}\n*Chave:* ${pixKey}` });
        await sendManagePixKeysMenu(sock, userJid);
    },

    awaiting_pix_key_to_remove_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendManagePixKeysMenu, sendInvalidOptionMessage, adminData, compradoresData, gerenciadoresCartaoData, gerenciadoresTrocaRegionalData, productManagerData } = context;
        const { pixKeys } = data;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendManagePixKeysMenu(sock, userJid);
            return;
        }

        const choiceIndex = parseInt(choice) - 1;
        if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= pixKeys.length) {
            await sendInvalidOptionMessage(sock, userJid, pixKeys.map((_, i) => `${i + 1}`).concat('0'));
            return;
        }

        // Determine which role this user has
        let memberData = null;
        let fileToSave = null;
        let dataObject = null;

        if (adminData[userJid]) {
            memberData = adminData[userJid];
            fileToSave = ARQUIVO_ADMINS;
            dataObject = adminData;
        } else if (compradoresData[userJid]) {
            memberData = compradoresData[userJid];
            fileToSave = ARQUIVO_COMPRADORES;
            dataObject = compradoresData;
        } else if (gerenciadoresCartaoData[userJid]) {
            memberData = gerenciadoresCartaoData[userJid];
            fileToSave = ARQUIVO_GERENCIADORES_CARTAO;
            dataObject = gerenciadoresCartaoData;
        } else if (gerenciadoresTrocaRegionalData[userJid]) {
            memberData = gerenciadoresTrocaRegionalData[userJid];
            fileToSave = ARQUIVO_GERENCIADORES_TROCA_REGIONAL;
            dataObject = gerenciadoresTrocaRegionalData;
        } else if (productManagerData[userJid]) {
            memberData = productManagerData[userJid];
            fileToSave = ARQUIVO_GERENCIADORES_PRODUTOS;
            dataObject = productManagerData;
        }

        if (!memberData || !memberData.pixKeys) {
            await sendMessage(sock, userJid, { text: "❌ Erro ao remover chave PIX." });
            return;
        }

        const removedKey = memberData.pixKeys.splice(choiceIndex, 1)[0];
        saveJsonFile(fileToSave, dataObject);

        await sendMessage(sock, userJid, { text: `✅ Chave PIX removida com sucesso!\n\n*${removedKey.alias}* - ${removedKey.key}` });
        await sendManagePixKeysMenu(sock, userJid);
    },

    awaiting_payout_pix_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendMyEarningsMenu, sendInvalidOptionMessage, getTeamMemberEarnings, openTickets, userData, formatCurrencyByLanguage, getUserLanguage } = context;
        const { pixKeys } = data;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendMyEarningsMenu(sock, userJid);
            return;
        }

        const earnings = getTeamMemberEarnings(userJid);
        if (!earnings) {
            await sendMessage(sock, userJid, { text: "❌ Erro ao obter dados de ganhos." });
            return;
        }

        const availableBalance = earnings.caixa;
        if (availableBalance <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Você não possui saldo disponível para saque." });
            await sendMyEarningsMenu(sock, userJid);
            return;
        }

        // Check if user already has a pending payout ticket
        const hasPendingPayout = openTickets.some(t =>
            t.clientJid === userJid &&
            t.type === 'payout'
        );

        if (hasPendingPayout) {
            await sendMessage(sock, userJid, {
                text: "⚠️ Você já possui uma solicitação de saque pendente. Aguarde a confirmação antes de solicitar outro saque."
            });
            await sendMyEarningsMenu(sock, userJid);
            return;
        }

        // Handle adding new PIX key option
        const addNewKeyOption = pixKeys.length + 1;
        if (choice === String(addNewKeyOption)) {
            await sendMessage(sock, userJid, { text: "Por favor, digite um *apelido* para esta nova chave (ex: PIX Celular):" });
            navigateTo(userJid, 'awaiting_new_pix_alias');
            return;
        }

        // Handle PIX key selection
        const choiceIndex = parseInt(choice) - 1;
        if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= pixKeys.length) {
            const validOptions = pixKeys.map((_, i) => `${i + 1}`).concat(`${addNewKeyOption}`, '0');
            await sendInvalidOptionMessage(sock, userJid, validOptions);
            return;
        }

        const selectedPixKey = pixKeys[choiceIndex];
        const lang = getUserLanguage(userJid);
        const balanceFmt = await formatCurrencyByLanguage(availableBalance, lang);

        // Create withdrawal ticket
        const newTicket = {
            clientJid: userJid,
            clientName: userData[userJid]?.nome || userJid.split("@")[0],
            ticketText: `Solicitação de saque de ${balanceFmt}\nChave PIX: ${selectedPixKey.key} (${selectedPixKey.alias})`,
            timestamp: new Date().toISOString(),
            notificationKeys: [],
            type: 'payout',
            amount: availableBalance,
            pixKey: selectedPixKey.key,
            pixAlias: selectedPixKey.alias
        };

        openTickets.push(newTicket);
        saveJsonFile(ARQUIVO_TICKETS, openTickets);

        await sendMessage(sock, userJid, { text: `✅ Solicitação de saque enviada!\n\n*Valor:* ${balanceFmt}\n*Chave PIX:* ${selectedPixKey.alias}\n*${selectedPixKey.key}*\n\nAguarde a confirmação do pagamento pela equipe administrativa.` });

        // Notify admins
        const { adminData } = context;
        const adminJids = Object.keys(adminData);
        if (adminJids.length > 0) {
            let notificationText = `💸 *NOVA SOLICITAÇÃO DE SAQUE* \n\n`;
            notificationText += `*Membro:* ${newTicket.clientName}\n`;
            notificationText += `*Contato:* https://wa.me/${userJid.split("@")[0]}\n`;
            notificationText += `*Valor:* ${balanceFmt}\n`;
            notificationText += `*Chave PIX:* ${selectedPixKey.alias}\n`;
            notificationText += `*${selectedPixKey.key}*\n\n`;
            notificationText += `Para confirmar o pagamento, acesse o *Painel de Tickets*.`;

            for (const adminJid of adminJids) {
                if (adminData[adminJid].notificacoes?.saque) {
                    try {
                        const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                        if (sentMsg?.key) {
                            newTicket.notificationKeys.push(sentMsg.key);
                        }
                    } catch (e) {
                        console.error(`Falha ao notificar o admin ${adminJid} sobre o saque:`, e);
                    }
                }
            }
            saveJsonFile(ARQUIVO_TICKETS, openTickets);
        }

        delete context.userState[userJid];
    }
};
