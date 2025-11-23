const fs = require("fs");
const path = require("path");
const state = require("../state/global-state");
const { sendMessage, navigateTo, sendInteractiveList } = require("./messaging");
const { translateText } = require("../utils/translation");
const { getUserLanguage } = require("../utils/user-helper");
const { formatCurrencyByLanguage } = require("../utils/formatters");
const { directoryHasNewProducts, loadJsonFile, saveJsonFile } = require("../utils/file-io");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_HISTORICO_COMPRAS,
    ARQUIVO_CONVITES,
    DIRETORIO_OFERTAS,
    DIRETORIO_ESFERAS,
    DIRETORIO_DUVIDAS,
    ARQUIVO_PEDIDOS,
    ARQUIVO_PEDIDOS_V
} = require("../config/paths");
const { LANGUAGE_CURRENCY } = require("../config/constants");

async function sendMainMenu(sock, jid) {
    const currentState = state.userState[jid]?.history?.[state.userState[jid].history.length - 1];
    if (currentState && (currentState.step === 'in_direct_chat' || currentState.step === 'in_verification_chat')) {
        return;
    }

    const userName = state.userData[jid]?.nome || "Aventureiro(a)";
    const userLang = getUserLanguage(jid);

    const welcomeText = await translateText(`Olá, *${userName}*! 👋\n\nBem-vindo(a) de volta ao menu principal da *PowerShop*.✨`, userLang);
    const menuText = `${welcomeText}\n\n*Digite o número:*\n\n1️⃣ 👤 Meu Perfil\n2️⃣ 🛍️ Comprar Produtos\n3️⃣ 💬 Dúvidas e Suporte`;

    if (state.shopData.imagemMenu && fs.existsSync(state.shopData.imagemMenu)) {
        try {
            const imageBuffer = fs.readFileSync(state.shopData.imagemMenu);
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
        await sendMessage(sock, jid, { text: menuText });
    }

    navigateTo(jid, 'awaiting_menu_choice');
}

async function sendProfileView(sock, jid) {
    const profile = state.userData[jid];
    if (!profile) {
        delete state.userState[jid];
        await sendMessage(sock, jid, { text: "📘 Parece que seu perfil ainda não foi criado. Vamos começar! Qual é o seu nome?" });
        navigateTo(jid, "register_name");
        return;
    }

    let totalEconomizado = profile.totalEconomizado || 0;
    const powerPoints = profile.powerPoints || 0;

    const userHistory = state.purchaseHistoryData[jid] || [];
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
        saveJsonFile(ARQUIVO_USUARIOS, state.userData);
    }

    let inviteCode = "Nenhum";
    const codes = Object.keys(state.invitationData);
    for (const code of codes) {
        if (state.invitationData[code].ownerJid === jid) {
            inviteCode = code;
            break;
        }
    }

    const userLang = getUserLanguage(jid);
    const totalEconomizadoFormatted = await formatCurrencyByLanguage(totalEconomizado || 0, userLang);

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
    const userHistory = state.purchaseHistoryData[jid] || [];
    userHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (userHistory.length === 0) {
        let historyText = "📜 *Seu Histórico de Pedidos*\n\n";
        historyText += "Você ainda não realizou nenhuma compra conosco. Que tal explorar nossa loja? 🛍️\n\n";
        historyText += "0️⃣ 👤 Voltar ao seu perfil";
        await sendMessage(sock, jid, { text: historyText });
        navigateTo(jid, "awaiting_history_choice", { userHistory });
        return;
    }

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
            ...state.pendingOrdersV.map(o => ({ ...o, type: 'V' })),
            ...state.pendingOrders.map(o => ({ ...o, type: 'N' }))
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
    const hasNewAccounts = state.exclusiveAccounts.some(p => p && p.createdAt && (Date.now() - p.createdAt < 20 * 60 * 60 * 1000));

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
    if (state.userData[jid]) {
        state.userData[jid].status = "em_atendimento";
        saveJsonFile(ARQUIVO_USUARIOS, state.userData);
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

module.exports = {
    sendMainMenu,
    sendProfileView,
    sendPurchaseHistory,
    sendOrderDetailsView,
    sendBuyMenu,
    sendEditProfileMenu,
    sendFaqMenu,
    startSupportFlow,
    sendSupportMenu
};
