const state = require("../state/global-state");
const { sendMessage, navigateTo, sendInteractiveList } = require("./messaging");
const { getUserLanguage } = require("../utils/user-helper");
const { formatCurrencyByLanguage } = require("../utils/formatters");
const { getTeamMemberEarnings } = require("../services/earnings");

async function sendMyEarningsMenu(sock, jid) {
    const earnings = getTeamMemberEarnings(jid);

    if (!earnings) {
        await sendMessage(sock, jid, { text: "❌ Você não tem permissão para acessar este recurso." });
        return;
    }

    const { ganhosTotais, caixa, caixaBloqueado, proximaLiberacao, cargo } = earnings;
    const isComprador = state.compradoresData[jid] !== undefined;
    const comprasRealizadas = earnings.memberData?.comprasRealizadas || 0;

    let earningsText = `💰 *Meus Ganhos*\n\n`;
    earningsText += `*Cargo:* ${cargo}\n`;
    const lang = getUserLanguage(jid);
    const ganhosTotaisFmt = await formatCurrencyByLanguage(ganhosTotais, lang);
    earningsText += `*Ganhos totais:* ${ganhosTotaisFmt}\n`;

    // Calcular ganhos do mês atual a partir de monthlyEarnings (independente de bloqueio)
    const now = new Date();
    const diaAtual = now.getDate();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ganhosMensais = earnings.memberData?.monthlyEarnings?.[monthKey] || 0;
    const ganhosMensaisFmt = await formatCurrencyByLanguage(ganhosMensais, lang);
    earningsText += `*Ganhos do mês (dia 1 ao ${diaAtual}):* ${ganhosMensaisFmt}\n`;

    // Calcular retiradas do mês atual a partir de monthlyWithdrawals
    const retiradoMensal = earnings.memberData?.monthlyWithdrawals?.[monthKey] || 0;
    const retiradoMensalFmt = await formatCurrencyByLanguage(retiradoMensal, lang);
    earningsText += `*Valor retirado no mês:* ${retiradoMensalFmt}\n`;

    // Mostrar faturado no mês e data de liberação para todos os cargos
    const faturadoFmt = await formatCurrencyByLanguage(caixaBloqueado, lang);
    earningsText += `*Valor faturado no mês:* ${faturadoFmt} (valores ainda não liberados)\n`;
    const dataLiberacao = proximaLiberacao.toLocaleDateString('pt-BR');
    earningsText += `** Valores retidos serão liberados no dia ${dataLiberacao}**\n\n`;

    // Exibir compras realizadas, quando disponível
    earningsText += `*Compras realizadas:* ${comprasRealizadas}\n`;

    const caixaFmt = await formatCurrencyByLanguage(caixa, lang);
    earningsText += `*Valor para saque:* ${caixaFmt}\n`;

    // Enviar informações primeiro
    await sendMessage(sock, jid, { text: earningsText });

    const fallbackText = `*O que deseja fazer?*\n\n1️⃣ 💸 Solicitar Saque do Valor Disponível\n2️⃣ 🔑 Gerenciar Minhas Chaves PIX\n\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_earnings_menu_choice',
        stateData: { available: caixa }
    });
}

async function sendManagePixKeysMenu(sock, jid) {
    const earnings = getTeamMemberEarnings(jid);
    if (!earnings) {
        await sendMessage(sock, jid, { text: "❌ Você não tem permissão para acessar este recurso." });
        return;
    }

    const pixKeys = earnings.memberData.pixKeys || [];
    let menuText = "🔑 *Gerenciar Chaves PIX*\n\nSuas chaves PIX cadastradas:\n\n";

    if (pixKeys.length === 0) {
        menuText += "_Você ainda não tem chaves PIX cadastradas._\n\n";
    } else {
        pixKeys.forEach((key, index) => {
            menuText += `*${index + 1}* - ${key.alias}\n   ${key.key}\n\n`;
        });
    }

    menuText += `*A* - ➕ Adicionar nova chave PIX\n`;
    if (pixKeys.length > 0) {
        menuText += `*B* - ➖ Remover uma chave PIX\n`;
    }
    menuText += `\n0️⃣ ↩️ Voltar`;

    await sendMessage(sock, jid, { text: menuText });
    navigateTo(jid, 'awaiting_manage_pix_keys_choice', { pixKeys });
}

async function sendPixKeySelectionMenu(sock, jid) {
    const earnings = getTeamMemberEarnings(jid);
    if (!earnings) {
        await sendMessage(sock, jid, { text: "❌ Você não tem permissão para acessar este recurso." });
        return;
    }

    const pixKeys = earnings.memberData.pixKeys || [];
    let menuText = "💸 *Solicitar Saque*\n\nPara qual chave PIX devemos enviar o valor?\n\n";

    if (pixKeys.length === 0) {
        menuText += "Você ainda não tem chaves PIX salvas. Vamos adicionar a primeira!\n";
        await sendMessage(sock, jid, { text: menuText });
        await sendMessage(sock, jid, { text: "Por favor, digite um *apelido* para esta nova chave (ex: PIX Celular):" });
        navigateTo(jid, 'awaiting_new_pix_alias');
        return;
    }

    pixKeys.forEach((key, index) => {
        menuText += `*${index + 1}* - ${key.alias} (${key.key})\n`;
    });

    menuText += `\n*${pixKeys.length + 1}* - ➕ Adicionar nova chave PIX\n`;
    menuText += "\n0️⃣ ↩️ Voltar";

    await sendMessage(sock, jid, { text: menuText });
    navigateTo(jid, 'awaiting_payout_pix_choice', { pixKeys });
}

module.exports = {
    sendMyEarningsMenu,
    sendManagePixKeysMenu,
    sendPixKeySelectionMenu
};
