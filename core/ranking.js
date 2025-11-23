const state = require("../state/global-state");
const { saveJsonFile } = require("../utils/file-io");
const { ARQUIVO_RANKINGS } = require("../config/paths");
const { sendMessage, navigateTo } = require("./messaging");

function getCurrentPeriod() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${year}`;
}

function incrementGroupMessage(groupJid, userJid, userName) {
    const period = getCurrentPeriod();

    if (!state.rankingsData[period]) {
        state.rankingsData[period] = {};
    }

    if (!state.rankingsData[period][groupJid]) {
        state.rankingsData[period][groupJid] = {};
    }

    if (!state.rankingsData[period][groupJid][userJid]) {
        state.rankingsData[period][groupJid][userJid] = {
            nome: userName,
            mensagens: 0
        };
    }

    state.rankingsData[period][groupJid][userJid].mensagens++;
    state.rankingsData[period][groupJid][userJid].nome = userName;

    saveJsonFile(ARQUIVO_RANKINGS, state.rankingsData);
}

async function sendGroupRanking(sock, groupJid, period = null, quotedMsgId = null) {
    const targetPeriod = period || getCurrentPeriod();

    if (!state.rankingsData[targetPeriod] || !state.rankingsData[targetPeriod][groupJid]) {
        await sendMessage(sock, groupJid, {
            text: `📊 *Ranking de Atividade*\n\n❌ Não há dados de ranking para o período ${targetPeriod}.`,
            quotedMsgId: quotedMsgId
        });
        return;
    }

    const groupRanking = state.rankingsData[targetPeriod][groupJid];
    const sortedUsers = Object.entries(groupRanking)
        .map(([jid, data]) => ({ jid, ...data }))
        .sort((a, b) => b.mensagens - a.mensagens)
        .slice(0, 5);

    let rankingText = `📊 *Ranking de Atividade* - ${targetPeriod}\n\n`;
    rankingText += `🏆 *Top 5 Usuários Mais Ativos*\n\n`;

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    sortedUsers.forEach((user, index) => {
        rankingText += `${medals[index]} *${user.nome}*\n`;
        rankingText += `   💬 ${user.mensagens} mensagens\n\n`;
    });

    if (sortedUsers.length === 0) {
        rankingText = `📊 *Ranking de Atividade* - ${targetPeriod}\n\n❌ Nenhum usuário registrado neste período.`;
    }

    await sendMessage(sock, groupJid, {
        text: rankingText,
        quotedMsgId: quotedMsgId
    });
}

function checkAndResetRanking() {
    const now = new Date();
    const day = now.getDate();

    if (day === 1) {
        const lastReset = state.rankingsData._lastReset || '';
        const today = now.toISOString().split('T')[0];

        if (lastReset !== today) {
            console.log(`[Ranking] Novo mês detectado. Rankings do mês anterior foram preservados.`);
            state.rankingsData._lastReset = today;
            saveJsonFile(ARQUIVO_RANKINGS, state.rankingsData);
        }
    }
}

async function sendHistoricalRankingMenu(sock, userJid, period) {
    if (!state.rankingsData[period]) {
        await sendMessage(sock, userJid, {
            text: `❌ Não há dados de ranking para o período ${period}.`
        });
        return;
    }

    const groups = Object.keys(state.rankingsData[period]).filter(key => key !== '_lastReset');

    if (groups.length === 0) {
        await sendMessage(sock, userJid, {
            text: `❌ Não há grupos com ranking no período ${period}.`
        });
        return;
    }

    let menuText = `📊 *Rankings Disponíveis* - ${period}\n\n`;
    menuText += `Selecione um grupo:\n\n`;

    groups.forEach((groupJid, index) => {
        const groupName = groupJid.split('@')[0];
        menuText += `*${index + 1}* - Grupo ${groupName}\n`;
    });

    menuText += `\n0️⃣ Cancelar`;

    await sendMessage(sock, userJid, { text: menuText });
    navigateTo(userJid, 'awaiting_historical_ranking_choice', { period, groups });
}

module.exports = {
    getCurrentPeriod,
    incrementGroupMessage,
    sendGroupRanking,
    checkAndResetRanking,
    sendHistoricalRankingMenu
};
