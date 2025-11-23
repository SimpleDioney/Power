const {
    userData,
    adminData,
    shopData,
    compradoresData,
    productManagerData,
    gerenciadoresCartaoData,
    gerenciadoresTrocaRegionalData,
    apoiadoresData,
    verificationRequests,
    openTickets,
    finishedEmails
} = require('../state/global-state');
const { OWNER_JID, LANGUAGE_CURRENCY } = require('../config/constants');
const {
    DIRETORIO_OFERTAS,
    DIRETORIO_ESFERAS,
    DIRETORIO_IMAGENS_PRODUTOS,
    DIRETORIO_DUVIDAS,
    DIRETORIO_AUTH,
    DIRETORIO_DADOS,
    DIRETORIO_PRODUTOS,
    DIRETORIO_DESCONTOS,
    DIRETORIO_CONTAS_EXCLUSIVAS,
    DIRETORIO_TUTORIAL_VERIFY,
    ARQUIVO_TICKETS,
    ARQUIVO_USUARIOS,
    ARQUIVO_ADMINS
} = require('../config/paths');
const fs = require('fs');
const path = require('path');
const { formatRemainingTime, formatTotalUptime } = require('../utils/formatters');
const { loadJsonFile, saveJsonFile } = require('../utils/file-io');
const { formatCurrencyByLanguage, getUserLanguage } = require('../utils/translation');
const { navigateTo } = require('../utils/navigation');
const { sendInteractiveList, sendMessage } = require('../utils/messages');
const { getTeamMemberEarnings } = require('../services/earnings');

// --- PAINEL DE ADMINISTRAÇÃO ---
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

    // Helper to process members
    const processMembers = (data, roleName) => {
        for (const memberJid in data) {
            const member = data[memberJid];
            const nome = userData[memberJid]?.nome || memberJid.split('@')[0];
            const cargo = memberJid === OWNER_JID ? 'Proprietário' : roleName;
            const ganhosTotais = member.ganhosTotais || 0;
            const caixa = member.caixa || 0;
            const caixaBloqueado = member.caixaBloqueado || 0;
            const comprasRealizadas = member.comprasRealizadas || 0;

            const monthlyEarnings = member.monthlyEarnings || {};
            const monthlyWithdrawals = member.monthlyWithdrawals || {};
            teamMembers.push({ jid: memberJid, nome, cargo, ganhosTotais, caixa, caixaBloqueado, comprasRealizadas, monthlyEarnings, monthlyWithdrawals });
        }
    };

    processMembers(adminData, 'Admin');
    processMembers(compradoresData, 'Comprador');
    processMembers(productManagerData, 'Gerenciador de Produto');
    processMembers(gerenciadoresCartaoData, 'Gerenciador de Cartão');
    processMembers(gerenciadoresTrocaRegionalData, 'Gerenciador de Troca Regional');

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
        { key: 'compraFinalizada', label: 'Compra Finalizada' },
        { key: 'verificacaoConta', label: 'Solicitações de Verificação' }
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
            const status = manager.status === 'on' ? '🟢 Online' : '🔴 Offline';
            let uptime = '';
            if (manager.status === 'on' && manager.onlineSince) {
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

module.exports = {
    sendAdminPanel,
    sendTeamManagementMenu,
    sendParametersManagementMenu,
    sendBulkPriceChangeMenu,
    sendFarmDragonList,
    sendManageTeamEarningsMenu,
    sendManageCommissionsMenu,
    sendAdminNotificationsMenu,
    sendManageCompradoresMenu,
    sendAddCompradorPrompt,
    sendRemoveCompradorPrompt,
    sendManageProductManagersMenu,
    sendAddProductManagerPrompt,
    sendRemoveProductManagerPrompt,
    sendManageCardManagersMenu,
    sendAddCardManagerPrompt,
    sendRemoveCardManagerPrompt,
    sendManageRegionalChangeManagersMenu,
    sendAddRegionalChangeManagerPrompt,
    sendRemoveRegionalChangeManagerPrompt,
    sendManageAdminsMenu,
    sendAddAdminPrompt,
    sendRemoveAdminPrompt,
    sendTicketTypeMenu,
    sendTicketManagementList,
    closeTicket,
    sendApoiadoresMenu,
    sendListApoiadores,
    sendProductManagementBrowser,
    sendSectionManagementBrowser,
    sendProductCategoryList,
    sendGenericProductList,
    sendEditAttributeMenu,
    sendAdminEmailsList,
    notifyProductManagersAndAdmins,
    getOfertasChannelJid,
    getAnunciosChannelJid,
    notifyOfferChannel
};

// --- GESTÃO DE ADMINISTRADORES ---
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

// --- GESTÃO AVANÇADA DE TICKETS ---
async function sendTicketTypeMenu(sock, jid) {
    const fallbackText = `🎫 *Gerenciamento de Tickets*\n\nSelecione o tipo de ticket que deseja visualizar:\n\n1️⃣ Tickets de Compra Variável\n2️⃣ Tickets de Suporte Geral\n3️⃣ Tickets de Saque\n\n0️⃣ 👑 Voltar ao Painel Administrativo`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_ticket_type_choice'
    });
}

async function sendTicketManagementList(sock, jid, ticketType) {
    // openTickets is imported from global-state
    const allTickets = openTickets;
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
        case 'all':
            title = "Todos os Tickets";
            filteredTickets = allTickets;
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
    }

    listText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: listText,
        state: 'awaiting_ticket_to_close_choice',
        stateData: { ticketType, filteredTickets }
    });
}

async function closeTicket(sock, ticketToClose, adminJid, wasPayout = false) {
    console.log(`[DEBUG closeTicket] Iniciando fechamento. Ticket:`, ticketToClose?.clientName, `Admin:`, adminJid);

    if (!ticketToClose) {
        console.log(`[DEBUG closeTicket] FALHA: ticketToClose é null/undefined`);
        return false;
    }

    console.log(`[DEBUG closeTicket] Procurando ticket no array. Total de tickets:`, openTickets.length);
    const ticketIndex = openTickets.findIndex(t => t.timestamp === ticketToClose.timestamp && t.clientJid === ticketToClose.clientJid);
    console.log(`[DEBUG closeTicket] Índice encontrado:`, ticketIndex);

    if (ticketIndex === -1) {
        console.log(`[DEBUG closeTicket] FALHA: Ticket não encontrado no array`);
        return false;
    }

    const clientJid = ticketToClose.clientJid;
    if (userData[clientJid]) {
        const specialRoles = { ...compradoresData, ...productManagerData, ...adminData };
        if (!specialRoles[clientJid]) {
            userData[clientJid].status = "navegando";
            saveJsonFile(ARQUIVO_USUARIOS, userData);
        }
    }

    try {
        if (wasPayout) {
            await sendMessage(sock, clientJid, { text: "✅ Sua solicitação de saque foi processada e o ticket foi finalizado com sucesso." });
        } else {
            await sendMessage(sock, clientJid, { text: "✅ Seu ticket de atendimento foi finalizado por nossa equipe. Se precisar de algo mais, estamos à disposição!" });
        }
    } catch (e) {
        console.error(`[DEBUG closeTicket] Erro ao enviar mensagem:`, e.message);
    }

    if (adminData[adminJid]) {
        adminData[adminJid].atendimentos = (adminData[adminJid].atendimentos || 0) + 1;
        saveJsonFile(ARQUIVO_ADMINS, adminData);
    }

    if (ticketToClose.notificationKeys) {
        for (const key of ticketToClose.notificationKeys) {
            try {
                await sendMessage(sock, key.remoteJid, { delete: key });
            } catch (e) {
                console.error(`Falha ao deletar notificação para ${key.remoteJid}.`);
            }
        }
    }

    openTickets.splice(ticketIndex, 1);
    saveJsonFile(ARQUIVO_TICKETS, openTickets);
    console.log(`[DEBUG closeTicket] SUCESSO! Ticket removido e salvo.`);
    return true;
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

async function sendStatisticsMenu(sock, jid) {
    const adminName = userData[jid]?.nome || "Admin";
    const totalUsers = Object.keys(userData).length;
    const faturamentoTotal = shopData.faturamentoTotal || 0;
    const valorPerdido = shopData.valorPerdido || 0;

    const panelText = `📊 *Painel de Estatísticas*\n\nOlá, *${adminName}*! Aqui está o resumo atual da loja:\n\n- - -\n*📈 Vendas Realizadas:* ${shopData.vendasRealizadas || 0}\n*💰 Faturamento Total:* R$ ${faturamentoTotal.toFixed(2).replace(".", ",")}\n*👤 Total de Usuários:* ${totalUsers}\n*✅ Contas Verificadas:* ${shopData.contasVerificadas || 0}\n*⏰ ID Checks Expirados:* ${shopData.idChecksExpirados || 0}\n*💸 Valor Perdido (E-mails):* R$ ${valorPerdido.toFixed(2).replace(".", ",")}\n- - -\n\nDigite *X* para resetar o valor perdido e os ID checks expirados.\n\n0️⃣ Voltar ao Painel Administrativo`;

    await sendMessage(sock, jid, { text: panelText });
    navigateTo(jid, "awaiting_stats_panel_action");
}

module.exports = {
    sendStatisticsMenu,
    sendAdminPanel,
    sendTeamManagementMenu,
    sendParametersManagementMenu,
    sendBulkPriceChangeMenu,
    sendFarmDragonList,
    sendManageTeamEarningsMenu,
    sendTicketManagementList,
    sendProductCategoryList,
    sendAdminNotificationsMenu,
    sendManageCommissionsMenu,
    sendManageCompradoresMenu,
    sendManageCardManagersMenu,
    sendManageRegionalChangeManagersMenu,
    sendManageAdminsMenu,
    sendListApoiadores,
    sendProductManagementBrowser,
    sendGenericProductList,
    sendEditAttributeMenu,
    sendAddCompradorPrompt,
    sendRemoveCompradorPrompt,
    sendAddProductManagerPrompt,
    sendRemoveProductManagerPrompt,
    sendAddCardManagerPrompt,
    sendRemoveCardManagerPrompt,
    sendAddRegionalChangeManagerPrompt,
    sendRemoveRegionalChangeManagerPrompt,
    notifyProductManagersAndAdmins,
    notifyOfferChannel,
    getOfertasChannelJid,
    getAnunciosChannelJid,
    closeTicket
};
