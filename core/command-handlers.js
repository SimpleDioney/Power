const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_RANKINGS,
    ARQUIVO_DADOS_LOJA,
    ARQUIVO_PEDIDOS,
    ARQUIVO_PEDIDOS_V,
    ARQUIVO_GERENCIADORES_CARTAO
} = require("../config/paths");
const { FOOD_PER_LEVEL, FARM_PER_LEVEL } = require("../config/dragon-city-data");

module.exports = {
    '/ping': async (sock, userJid, messageText, args, context) => {
        const { sendMessage } = context;
        await sendMessage(sock, userJid, { text: "Pong! 🏓" });
    },

    '/ranking': async (sock, userJid, messageText, args, context) => {
        const { sendGroupRanking, isGroup, effectiveJid, sendMessage } = context;
        if (!isGroup) {
            await sendMessage(sock, userJid, { text: "⚠️ Este comando só funciona em grupos!" });
            return;
        }
        await sendGroupRanking(sock, effectiveJid);
    },

    '/rankings': async (sock, userJid, messageText, args, context) => {
        const { sendGroupRanking, isGroup, effectiveJid, sendMessage } = context;
        if (!isGroup) {
            await sendMessage(sock, userJid, { text: "⚠️ Este comando só funciona em grupos!" });
            return;
        }
        await sendGroupRanking(sock, effectiveJid);
    },

    '/comida': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, effectiveJid } = context;
        const levelArgs = args[0]?.split('/');

        if (!levelArgs || levelArgs.length !== 2) {
            await sendMessage(sock, effectiveJid, { text: "⚠️ *Formato inválido!*\n\nUse: `/comida x/y`\n\n*Exemplo:* `/comida 10/50`\n\nOnde:\n• x = nível inicial\n• y = nível final" });
            return;
        }

        const startLevel = parseInt(levelArgs[0]);
        const endLevel = parseInt(levelArgs[1]);

        if (isNaN(startLevel) || isNaN(endLevel) || startLevel >= endLevel || startLevel < 1 || endLevel > 70) {
            await sendMessage(sock, effectiveJid, { text: "⚠️ *Níveis inválidos!*\n\n• Nível inicial deve ser entre 1 e 69\n• Nível final deve ser maior que o inicial\n• Nível máximo é 70" });
            return;
        }

        let totalFood = 0;
        for (let i = startLevel; i < endLevel; i++) {
            totalFood += FOOD_PER_LEVEL[i] || 0;
        }

        const formattedFood = totalFood.toLocaleString('pt-BR');

        await sendMessage(sock, effectiveJid, {
            text: `🍖 *Cálculo de Comida*\n\n` +
                `*Nível:* ${startLevel} → ${endLevel}\n` +
                `*Total necessário:* ${formattedFood} comida\n\n` +
                `📊 Isso equivale a ${endLevel - startLevel} níveis de upgrade!`
        });
    },

    '/farm': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, effectiveJid } = context;
        const levelArgs = args[0]?.split('/');

        if (!levelArgs || levelArgs.length !== 2) {
            await sendMessage(sock, effectiveJid, { text: "⚠️ *Formato inválido!*\n\nUse: `/farm quantidade/nível`\n\n*Exemplo:* `/farm 10/40`\n\nOnde:\n• quantidade = número de dragões\n• nível = nível dos dragões (1-40)" });
            return;
        }

        const quantity = parseInt(levelArgs[0]);
        const level = parseInt(levelArgs[1]);

        if (isNaN(quantity) || quantity < 1) {
            await sendMessage(sock, effectiveJid, { text: "⚠️ *Quantidade inválida!*\n\n• A quantidade de dragões deve ser pelo menos 1" });
            return;
        }

        if (isNaN(level) || level < 1 || level > 40) {
            await sendMessage(sock, effectiveJid, { text: "⚠️ *Nível inválido!*\n\n• O nível deve ser entre 1 e 40" });
            return;
        }

        await sendMessage(sock, effectiveJid, {
            text: `🐉 *Cálculo de Farm*\n\n*Configuração:* ${quantity}x dragões nível ${level}\n\nDigite *1* para calcular com:\n1️⃣ Positivo/Negativo (${FARM_PER_LEVEL[level] || 0} comida/min)\n\n0️⃣ Cancelar`
        });

        navigateTo(userJid, 'awaiting_farm_dragon_choice_fallback', { quantity, level });
    },

    '/comandos': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, effectiveJid } = context;
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

        await sendMessage(sock, effectiveJid, { text: comandosText });
    },

    '/manual': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, shopData, isAdmin } = context;
        if (isAdmin) {
            shopData.manualMaintenanceMode = !shopData.manualMaintenanceMode;
            saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
            const statusText = shopData.manualMaintenanceMode
                ? "🔧 *Modo de manutenção ativado!*\n\n• Pagamentos com cartão estarão indisponíveis\n• Pagamentos PIX exigirão comprovante manual"
                : "✅ *Modo de manutenção desativado!*\n\n• Todos os métodos de pagamento voltaram ao normal";
            await sendMessage(sock, userJid, { text: statusText });
        }
    },

    '/reiniciar': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, isAdmin } = context;
        if (isAdmin) {
            await sendMessage(sock, userJid, { text: "🔄 Reiniciando o sistema... Aguarde um momento." });
            console.log(`[Sistema] Reinício solicitado por ${userJid}`);
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        }
    },

    '/id': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userData, gerenciadoresCartaoData, isComprador, isAdmin } = context;
        if (isComprador || isAdmin) {
            const notificationText = `🚨 *ID Check Solicitado!*\n\nO comprador *${userData[userJid]?.nome || userJid.split('@')[0]}* solicitou um ID de pagamento. Por favor, verifiquem o app.`;
            for (const managerJid in gerenciadoresCartaoData) {
                try {
                    await sendMessage(sock, managerJid, { text: notificationText });
                } catch (e) { console.error(`Falha ao notificar gerenciador de cartão ${managerJid}`); }
            }
            await sendMessage(sock, userJid, { text: "✅ Solicitação de ID Check enviada aos Gerenciadores de Cartão." });
        }
    },

    '/addcartao': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, saveJsonFile, fetchPersonData, shopData, ARQUIVO_DADOS_LOJA, isGerenciadorCartao, isOwner } = context;
        if (isGerenciadorCartao || isOwner) {
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
                const year = (now.getFullYear() + 8).toString().slice(-2);
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
                    tipo: 'nubank',
                    responsavel: userJid
                };

                shopData.cartoes.push(newCard);
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
                await sendMessage(sock, userJid, { text: `✅ Cartão (Nubank) de *${newCard.nomeTitular}* com final \`${newCard.numero.slice(-4)}\` adicionado com sucesso!` });

            } catch (error) {
                console.error("Erro ao gerar dados da pessoa:", error);
                await sendMessage(sock, userJid, { text: `❌ Desculpe, não foi possível gerar os dados da pessoa no momento. Erro: ${error}` });
            }
        }
    },

    '/cartao': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, deleteUserState, shopData, currentState, isComprador, isAdmin } = context;
        if (isComprador || isAdmin) {
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
                    deleteUserState(userJid);
                }
            }
        }
    },

    '/cartoes': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, shopData, userData, isGerenciadorCartao, isOwner } = context;
        if (isGerenciadorCartao || isOwner) {
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
        }
    },

    '/menu': async (sock, userJid, messageText, args, context) => {
        const { sendCompradorMenu, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        if (isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional) {
            await sendCompradorMenu(sock, userJid);
        }
    },

    '/produtos': async (sock, userJid, messageText, args, context) => {
        const { sendProductCategoryList, isProductManager, isAdmin } = context;
        if (isProductManager || isAdmin) {
            await sendProductCategoryList(sock, userJid);
        }
    },

    '/corrigir': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, isAdmin } = context;
        if (isAdmin) {
            const correctionText = "🔧 *Sistema de Correção de JIDs*\n\n" +
                "Escolha o método de busca:\n\n" +
                "1️⃣ Buscar por LID/JID\n" +
                "2️⃣ Buscar por Email\n\n" +
                "0️⃣ Cancelar";
            await sendMessage(sock, userJid, { text: correctionText });
            navigateTo(userJid, "awaiting_correction_method");
        }
    },

    '/on': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, saveJsonFile, gerenciadoresCartaoData, userData, compradoresData, ARQUIVO_GERENCIADORES_CARTAO, isGerenciadorCartao, isOwner } = context;
        if (isGerenciadorCartao || isOwner) {
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
        }
    },

    '/off': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, saveJsonFile, gerenciadoresCartaoData, userData, compradoresData, ARQUIVO_GERENCIADORES_CARTAO, isGerenciadorCartao, isOwner } = context;
        if (isGerenciadorCartao || isOwner) {
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
        }
    },

    '/pedidos': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, pendingOrders, pendingOrdersV, verificationRequests, isComprador, isAdmin } = context;
        if (isComprador || isAdmin) {
            const pendingOrdersCount = pendingOrders.filter(order => order.status === 'pendente').length + pendingOrdersV.filter(order => order.status === 'pendente').length;
            const pendingVerificationCount = verificationRequests.filter(r => r.status === 'pendente').length;
            const totalTasks = pendingOrdersCount + pendingVerificationCount;

            if (totalTasks === 0) {
                await sendMessage(sock, userJid, { text: "🎉 Ótimo trabalho! Não há nenhuma solicitação pendente no momento." });
                return;
            }

            // Show menu first
            await sendMessage(sock, userJid, {
                text: `Olá! 👋\n\nHá *${totalTasks}* solicitações aguardando atendimento.\n\n*O que você deseja fazer?*\n\n1️⃣ Iniciar Atendimento\n2️⃣ Sair`
            });
            navigateTo(userJid, 'awaiting_attendance_start_choice');
        }
    },

    '/criar': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, activeChats, isAdmin, isComprador } = context;
        if (isAdmin || isComprador) {
            if (activeChats.some(c => c.sellerJid === userJid)) {
                await sendMessage(sock, userJid, { text: "⚠️ Você já está em um atendimento. Finalize-o com */finalizar* antes de criar um novo pedido." });
                return;
            }
            await sendMessage(sock, userJid, { text: "Vamos criar um novo pedido manual. ✍️\n\nPor favor, envie o *número de telefone do cliente* (com DDI e DDD, ex: 5511912345678)." });
            navigateTo(userJid, 'awaiting_create_order_number');
        }
    },

    '/ativos': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, pendingOrders, pendingOrdersV, waitingOrders, isAdmin } = context;
        if (isAdmin) {
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
        }
    },

    '/pedido': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, pendingOrders, pendingOrdersV, waitingOrders, userData, getUserLanguage, formatCurrencyByLanguage, isAdmin } = context;
        if (isAdmin) {
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
        }
    },

    '/preferencia': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, saveJsonFile, pendingOrders, pendingOrdersV, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, isAdmin } = context;
        if (isAdmin) {
            const orderId = parseInt(args[0]);
            if (!orderId) {
                await sendMessage(sock, userJid, { text: "Por favor, forneça um ID de pedido. Ex: `/preferencia 123456`" });
                return;
            }
            const orderIndex = pendingOrders.findIndex(o => o.id === orderId);
            const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);

            if (orderIndexV > -1) {
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
            orderToMove.sourceQueue = 'verified';
            pendingOrdersV.unshift(orderToMove);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);

            await sendMessage(sock, userJid, { text: `✅ Pedido *#${orderId}* movido para o topo da fila prioritária.` });
        }
    },

    '/concluir': async (sock, userJid, messageText, args, context) => {
        const { sendMessage } = context;
        await sendMessage(sock, userJid, { text: "⚠️ Este comando foi substituído. Para finalizar um atendimento, entre no chat com o cliente e digite */finalizar*." });
    },

    '/emails': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, userData, finishedEmails, getUserLanguage, formatCurrencyByLanguage, isGerenciadorTrocaRegional, isComprador, isAdmin } = context;
        if (isGerenciadorTrocaRegional || isComprador || isAdmin) {
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
        }
    },

    '/give': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userData, saveJsonFile, ARQUIVO_USUARIOS, isAdmin } = context;

        if (!isAdmin) {
            await sendMessage(sock, userJid, { text: "🚫 Acesso restrito a administradores." });
            return;
        }

        if (args.length < 2) {
            await sendMessage(sock, userJid, { text: "⚠️ Uso incorreto. Use: */give [numero] [quantidade]*\nEx: */give 5511999999999 100*" });
            return;
        }

        const targetPhone = args[0].replace(/\D/g, '');
        const amount = parseInt(args[1]);

        if (targetPhone.length < 10 || targetPhone.length > 15) {
            await sendMessage(sock, userJid, { text: "⚠️ Número inválido." });
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Quantidade inválida." });
            return;
        }

        const targetJid = `${targetPhone}@s.whatsapp.net`;

        if (!userData[targetJid]) {
            // Se o usuário não existir, cria um registro básico
            userData[targetJid] = { powerPoints: 0 };
        }

        if (!userData[targetJid].powerPoints) userData[targetJid].powerPoints = 0;
        userData[targetJid].powerPoints += amount;

        saveJsonFile(ARQUIVO_USUARIOS, userData);

        await sendMessage(sock, userJid, { text: `✅ Adicionado *${amount}* PowerPoints para ${targetPhone}.\nNovo saldo: ${userData[targetJid].powerPoints}` });

        // Tenta notificar o usuário que recebeu os pontos
        try {
            await sendMessage(sock, targetJid, { text: `🎉 Você recebeu *${amount}* PowerPoints!\nSeu novo saldo é: *${userData[targetJid].powerPoints}* ✨` });
        } catch (e) {
            // Ignora erro se não conseguir enviar msg pro usuario
        }
    },

    '/pontos': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userData } = context;
        const userPoints = userData[userJid]?.powerPoints || 0;
        await sendMessage(sock, userJid, { text: `✨ *Seus PowerPoints*\n\nVocê possui: *${userPoints}* PowerPoints.` });
    },

    '/cmd': async (sock, userJid, messageText, args, context) => {
        const { sendMessage } = context;
        let cmdText = "📜 *Lista de Comandos Disponíveis*\n\n";
        cmdText += "*--- Para Todos os Usuários ---*\n";
        cmdText += "*/m* - Volta para o menu principal.\n";
        cmdText += "*/pontos* - Verifica seu saldo de PowerPoints.\n";
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
        cmdText += "*/limpar* - Limpa o estado de atendimento caso esteja travado.\n";
        cmdText += "*/cartoes* - (Ger. Cartão) Mostra os cartões disponíveis.\n";
        cmdText += "*/emails* - Lista os e-mails de contas Microsoft.\n\n";
        cmdText += "*--- Comandos de Atendimento (Durante Chat Direto) ---*\n";
        cmdText += "*/face* - Envia instruções de verificação via Facebook.\n";
        cmdText += "*/whats* - Envia instruções de verificação via WhatsApp.\n";
        cmdText += "*/sms* - Envia instruções de verificação via SMS.\n";
        cmdText += "*/email* - Envia instruções de verificação via Email.\n";
        cmdText += "*/code* - Envia instruções sobre código de verificação.\n";
        cmdText += "*/insta* - Envia instruções via Instagram.\n";
        cmdText += "*/entrei* - Informa ao cliente que acessou a conta.\n";
        cmdText += "*/incorreto* - Informa que a senha está incorreta.\n";
        cmdText += "*/ausente* - Informa que o cliente está offline.\n";
        cmdText += "*/erro* - Informa sobre erro no processo.\n";
        cmdText += "*/gerar [valor]* - Gera PIX manual para o cliente.\n\n";
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
    },

    '/m': async (sock, userJid, messageText, args, context) => {
        const { sendMainMenu, deleteUserState } = context;
        deleteUserState(userJid);
        await sendMainMenu(sock, userJid);
    },

    '/p': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, navigateTo, userData } = context;
        if (userData[userJid] && userData[userJid].status === 'navegando') {
            await sendMessage(sock, userJid, { text: "Você já está registrado! ✅" });
            return;
        }
        await sendMessage(sock, userJid, {
            text: "Olá! Bem-vindo(a) à PowerShop. ✨\n\nPara começarmos, qual é o seu *nome*?",
        });
        navigateTo(userJid, "register_name");
    },

    '/adm': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, sendAdminPanel, isAdmin } = context;
        if (!isAdmin) {
            await sendMessage(sock, userJid, { text: "🚫 Acesso restrito a administradores." });
            return;
        }
        await sendAdminPanel(sock, userJid);
    },

    '/verificar': async (sock, userJid, messageText, args, context) => {
        const { sendVerificationRequestsMenu, isComprador, isAdmin } = context;
        if (isComprador || isAdmin) {
            await sendVerificationRequestsMenu(sock, userJid);
        }
    },

    '/saque': async (sock, userJid, messageText, args, context) => {
        const { sendMyEarningsMenu, isComprador, isAdmin, isGerenciadorCartao, isGerenciadorTrocaRegional, isProductManager } = context;
        if (isComprador || isAdmin || isGerenciadorCartao || isGerenciadorTrocaRegional || isProductManager) {
            await sendMyEarningsMenu(sock, userJid);
        }
    },

    '/whats': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;

        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;
        await sendMessage(sock, partnerJid, { text: '✅ *Código de Verificação - WhatsApp*\n\nPrezado(a), um código de verificação foi enviado para seu número de WhatsApp. Por favor, informe o código recebido aqui para darmos continuidade.' });
        await sendMessage(sock, userJid, { text: '✅ Instruções de verificação do WhatsApp enviadas ao cliente.' });
    },

    '/entrei': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;

        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || currentState.step !== 'in_direct_chat') {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento de pedido." });
            return;
        }

        const { partnerJid } = currentState.data;
        const clientMessage = `👍 *Acesso Realizado com Sucesso!*\n\nConseguimos acessar sua conta. Para garantir que tudo ocorra perfeitamente, pedimos que não acesse o jogo até que nosso trabalho seja finalizado. Avisaremos assim que estiver tudo pronto!`;
        await sendMessage(sock, partnerJid, { text: clientMessage });
        await sendMessage(sock, userJid, { text: '✅ Mensagem de "entrei" enviada ao cliente.' });
    },

    '/suporte': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, userData, adminData, openTickets, activeChats, pendingOrders, pendingOrdersV, ARQUIVO_TICKETS, ARQUIVO_CHATS_ATIVOS, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_USUARIOS, saveJsonFile } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;

        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || currentState.step !== 'in_direct_chat') {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento de pedido." });
            return;
        }

        const { partnerJid, orderId } = currentState.data;

        // Remove order from pending lists
        let order = null;
        const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);
        const orderIndex = pendingOrders.findIndex(o => o.id === orderId);

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

            // Remove from active chats
            const updatedActiveChats = activeChats.filter(c => c.orderId !== orderId);
            saveJsonFile(ARQUIVO_CHATS_ATIVOS, updatedActiveChats);

            // Set client status to em_atendimento
            userData[clientJid].status = "em_atendimento";
            saveJsonFile(ARQUIVO_USUARIOS, userData);

            // Create support ticket
            const ticketText = `O comprador solicitou suporte para o pedido ID: ${order.id}. Cliente: ${order.clientName}. O pedido foi removido da fila de atendimento.`;
            const newTicket = {
                clientJid: clientJid,
                clientName: order.clientName,
                ticketText,
                timestamp: new Date().toISOString(),
                notificationKeys: []
            };
            openTickets.push(newTicket);

            // Notify admins
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
    },

    '/face': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;
        await sendMessage(sock, partnerJid, { text: '📲 *Verificação via Facebook*\n\nOlá! Uma solicitação de login foi enviada para o seu aplicativo do Facebook. Por favor, abra-o e aprove a notificação para validarmos o acesso com segurança.' });
        await sendMessage(sock, userJid, { text: '✅ Instruções de verificação do Facebook enviadas ao cliente.' });
    },

    '/sms': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;
        await sendMessage(sock, partnerJid, { text: '✉️ *Código de Verificação - SMS*\n\nEnviamos um código de verificação via SMS para o seu celular. Utilize este código para completar a autenticação e validar seu acesso.' });
        await sendMessage(sock, userJid, { text: '✅ Instruções de verificação via SMS enviadas ao cliente.' });
    },

    '/email': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;
        await sendMessage(sock, partnerJid, { text: '📧 *Código de Verificação - E-mail*\n\nPara sua segurança, enviamos um código para o seu e-mail cadastrado. Verifique sua caixa de entrada (e a pasta de spam) e nos informe o código para prosseguir.' });
        await sendMessage(sock, userJid, { text: '✅ Instruções de verificação de E-mail enviadas ao cliente.' });
    },

    '/code': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;
        await sendMessage(sock, partnerJid, { text: '📲 *Código de Verificação - App*\n\nUm código foi enviado para seu aplicativo de autenticação (Google Authenticator, etc). Por favor, informe o código para prosseguirmos.' });
        await sendMessage(sock, userJid, { text: '✅ Instrução de verificação via App enviada ao cliente.' });
    },

    '/insta': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;
        await sendMessage(sock, partnerJid, { text: '📸 *Código de Verificação - Instagram*\n\nEnviamos um código de verificação para a sua conta do Instagram. Por favor, verifique suas mensagens e nos informe o código.' });
        await sendMessage(sock, userJid, { text: '✅ Instrução de verificação via Instagram enviada ao cliente.' });
    },

    '/incorreto': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, navigateTo, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, pendingOrders, pendingOrdersV, waitingOrders, activeChats, saveJsonFile, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA, ARQUIVO_CHATS_ATIVOS } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || currentState.step !== 'in_direct_chat') {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid, orderId } = currentState.data;

        // Send message to client asking for correct credentials
        await sendMessage(sock, partnerJid, { text: '⚠️ *Dados Incorretos*\n\nAs credenciais que você nos forneceu não estão corretas.\n\nPor favor, envie o *e-mail ou número* correto da sua conta do Facebook.' });

        // Navigate client to correction flow
        navigateTo(partnerJid, 'awaiting_correction_login', { orderId });

        // Move order to waiting list
        const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);
        const orderIndex = pendingOrders.findIndex(o => o.id === orderId);

        if (orderIndexV > -1) {
            const order = pendingOrdersV.splice(orderIndexV, 1)[0];
            order.status = 'em_espera';
            waitingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
            saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
        } else if (orderIndex > -1) {
            const order = pendingOrders.splice(orderIndex, 1)[0];
            order.status = 'em_espera';
            waitingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
            saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
        }

        // Remove from active chats
        const chatIndex = activeChats.findIndex(c => c.orderId === orderId);
        if (chatIndex > -1) {
            activeChats.splice(chatIndex, 1);
            saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
        }

        // Clear states
        delete userState[userJid];

        await sendMessage(sock, userJid, { text: '✅ O cliente foi notificado para corrigir os dados.' });
    },

    '/gerar': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, startPixCheckoutProcess, getUserLanguage, formatCurrencyByLanguage } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || currentState.step !== 'in_direct_chat') {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;

        if (!partnerJid) {
            await sendMessage(sock, userJid, { text: "❌ Não foi possível identificar o cliente para gerar o pagamento." });
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
    },

    '/erro': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, pendingOrders, pendingOrdersV, waitingOrders, activeChats, saveJsonFile, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA, ARQUIVO_CHATS_ATIVOS } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || currentState.step !== 'in_direct_chat') {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid, orderId } = currentState.data;

        // Send message to client
        await sendMessage(sock, partnerJid, { text: '❌ *Erro no Processamento*\n\nEncontramos um erro durante o processo de compra e não conseguimos continuar. Outro atendente irá assumir para tentar resolver.\n\nEnquanto isso, seu atendimento será movido para uma lista de espera. Assim que estiver pronto, digite qualquer mensagem para voltarmos ao seu atendimento.' });

        // Move order to waiting list
        const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);
        const orderIndex = pendingOrders.findIndex(o => o.id === orderId);

        if (orderIndexV > -1) {
            const order = pendingOrdersV.splice(orderIndexV, 1)[0];
            order.status = 'em_espera';
            waitingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
            saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
        } else if (orderIndex > -1) {
            const order = pendingOrders.splice(orderIndex, 1)[0];
            order.status = 'em_espera';
            waitingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
            saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
        }

        // Remove from active chats
        const chatIndex = activeChats.findIndex(c => c.orderId === orderId);
        if (chatIndex > -1) {
            activeChats.splice(chatIndex, 1);
            saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
        }

        // Clear states
        delete userState[userJid];
        delete userState[partnerJid];

        await sendMessage(sock, userJid, { text: "✅ Pedido movido para lista de espera devido ao erro." });
    },

    '/ausente': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, pendingOrders, pendingOrdersV, waitingOrders, activeChats, saveJsonFile, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA, ARQUIVO_CHATS_ATIVOS } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || currentState.step !== 'in_direct_chat') {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid, orderId } = currentState.data;

        // Send message to client
        await sendMessage(sock, partnerJid, { text: '📴 *Cliente Ausente*\n\nParece que você está offline no momento. Seu atendimento será movido para uma lista de espera. Assim que estiver online novamente, digite qualquer mensagem para retornarmos ao seu atendimento.' });

        // Move order to waiting list
        const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);
        const orderIndex = pendingOrders.findIndex(o => o.id === orderId);

        if (orderIndexV > -1) {
            const order = pendingOrdersV.splice(orderIndexV, 1)[0];
            order.status = 'em_espera';
            waitingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
            saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
        } else if (orderIndex > -1) {
            const order = pendingOrders.splice(orderIndex, 1)[0];
            order.status = 'em_espera';
            waitingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
            saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);
        }

        // Remove from active chats
        const chatIndex = activeChats.findIndex(c => c.orderId === orderId);
        if (chatIndex > -1) {
            activeChats.splice(chatIndex, 1);
            saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
        }

        // Clear states
        delete userState[userJid];
        delete userState[partnerJid];

        await sendMessage(sock, userJid, { text: "✅ Pedido movido para lista de espera (cliente ausente)." });
    },

    '/tutorial': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;
        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        const { partnerJid } = currentState.data;

        // Send tutorial message to client
        const tutorialText = `📚 *Tutorial de Verificação da Conta*\n\n*Passo a Passo:*\n\n1️⃣ Abra o Facebook e faça login com suas credenciais\n2️⃣ Acesse as configurações de segurança\n3️⃣ Procure por "Onde você está conectado"\n4️⃣ Você verá nossa sessão ativa - *NÃO desconecte*\n5️⃣ Volte aqui e confirme que viu nossa sessão\n\nSe tiver dúvidas, estamos aqui para ajudar! 😊`;

        await sendMessage(sock, partnerJid, { text: tutorialText });
        await sendMessage(sock, userJid, { text: "✅ Tutorial enviado ao cliente." });
    },

    '/limpar': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, activeChats, saveJsonFile, ARQUIVO_CHATS_ATIVOS, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;

        if (!isStaff) return;

        // Remove from activeChats
        const chatIndex = activeChats.findIndex(c => c.sellerJid === userJid);
        if (chatIndex > -1) {
            activeChats.splice(chatIndex, 1);
            saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
        }

        // Clear userState
        delete userState[userJid];

        await sendMessage(sock, userJid, { text: "✅ Seu estado foi limpo com sucesso! Você pode iniciar um novo atendimento agora." });
    },

    '/finalizar': async (sock, userJid, messageText, args, context) => {
        const { sendMessage, userState, navigateTo, isAdmin, isComprador, isGerenciadorCartao, isGerenciadorTrocaRegional, pendingOrders, pendingOrdersV, getUserLanguage, formatCurrencyByLanguage } = context;
        const isStaff = isAdmin || isComprador || isGerenciadorCartao || isGerenciadorTrocaRegional;

        if (!isStaff) return;

        const currentState = userState[userJid]?.history?.[userState[userJid].history.length - 1];
        if (!currentState || (currentState.step !== 'in_direct_chat' && currentState.step !== 'in_verification_chat')) {
            await sendMessage(sock, userJid, { text: "❌ Este comando só funciona durante um atendimento." });
            return;
        }

        if (currentState.step === 'in_verification_chat') {
            // For verification chat, ask if verification was successful
            await sendMessage(sock, userJid, { text: "A verificação foi bem-sucedida?\n\n*1* - Sim\n*2* - Não" });
            navigateTo(userJid, 'awaiting_verification_outcome', currentState.data);
            return;
        }

        // For direct chat (order), start finalization process
        const { orderId } = currentState.data;
        const orderIndexV = pendingOrdersV.findIndex(o => o.id === orderId);
        const orderIndex = pendingOrders.findIndex(o => o.id === orderId);

        if (orderIndexV === -1 && orderIndex === -1) {
            await sendMessage(sock, userJid, { text: "❌ Pedido não encontrado." });
            return;
        }

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
            // Add finalization logic if needed
        }
    }
};
