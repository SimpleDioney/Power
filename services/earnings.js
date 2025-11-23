const state = require('../state/global-state');
const { saveJsonFile } = require('../utils/file-io');
const {
    ARQUIVO_ADMINS,
    ARQUIVO_COMPRADORES,
    ARQUIVO_GERENCIADORES_PRODUTO,
    ARQUIVO_GERENCIADORES_CARTAO,
    ARQUIVO_GERENCIADORES_TROCA_REGIONAL,
    ARQUIVO_APOIADORES
} = require('../config/paths');
const { OWNER_JID } = require('../config/constants');

/**
 * Calcula a data de liberação (dia 1 do próximo mês)
 * @returns {Date} Data do dia 1 do próximo mês
 */
function calculateNextReleaseDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
}

/**
 * Obtém informações de ganhos de um membro da equipe
 * @param {string} jid - JID do membro
 * @returns {Object} { ganhosTotais, caixa, caixaBloqueado, proximaLiberacao, cargo, memberData }
 */
function getTeamMemberEarnings(jid) {
    let memberData = null;
    let cargo = 'Desconhecido';

    if (state.adminData[jid]) {
        memberData = state.adminData[jid];
        cargo = jid === OWNER_JID ? 'Proprietário' : 'Admin';
    } else if (state.compradoresData[jid]) {
        memberData = state.compradoresData[jid];
        cargo = 'Comprador';
    } else if (state.productManagerData[jid]) {
        memberData = state.productManagerData[jid];
        cargo = 'Gerenciador de Produto';
    } else if (state.gerenciadoresCartaoData[jid]) {
        memberData = state.gerenciadoresCartaoData[jid];
        cargo = 'Gerenciador de Cartão';
    } else if (state.gerenciadoresTrocaRegionalData[jid]) {
        memberData = state.gerenciadoresTrocaRegionalData[jid];
        cargo = 'Gerenciador de Troca Regional';
    } else {
        // Verificar se é apoiador
        for (const code in state.apoiadoresData) {
            if (state.apoiadoresData[code].ownerJid === jid) {
                memberData = state.apoiadoresData[code];
                cargo = 'Apoiador';
                break;
            }
        }
    }

    if (!memberData) {
        return null;
    }

    const ganhosTotais = memberData.ganhosTotais || 0;
    const caixa = memberData.caixa || 0;
    const caixaBloqueado = memberData.caixaBloqueado || 0;
    const proximaLiberacao = calculateNextReleaseDate();

    return {
        ganhosTotais,
        caixa,
        caixaBloqueado,
        proximaLiberacao,
        cargo,
        memberData
    };
}

/**
 * Adiciona ganhos para um membro da equipe
 * @param {string} jid - JID do membro
 * @param {number} valor - Valor a adicionar
 * @param {boolean} direto - Se true, adiciona direto no caixa (compradores), se false, adiciona no caixaBloqueado
 */
function addEarningsToMember(jid, valor, direto = false) {
    let memberData = null;
    let fileToSave = null;
    let dataObject = null;

    if (state.adminData[jid]) {
        memberData = state.adminData[jid];
        dataObject = state.adminData;
        fileToSave = ARQUIVO_ADMINS;
    } else if (state.compradoresData[jid]) {
        memberData = state.compradoresData[jid];
        dataObject = state.compradoresData;
        fileToSave = ARQUIVO_COMPRADORES;
        direto = true; // Compradores sempre recebem direto
    } else if (state.productManagerData[jid]) {
        memberData = state.productManagerData[jid];
        dataObject = state.productManagerData;
        fileToSave = ARQUIVO_GERENCIADORES_PRODUTO;
    } else if (state.gerenciadoresCartaoData[jid]) {
        memberData = state.gerenciadoresCartaoData[jid];
        dataObject = state.gerenciadoresCartaoData;
        fileToSave = ARQUIVO_GERENCIADORES_CARTAO;
    } else if (state.gerenciadoresTrocaRegionalData[jid]) {
        memberData = state.gerenciadoresTrocaRegionalData[jid];
        dataObject = state.gerenciadoresTrocaRegionalData;
        fileToSave = ARQUIVO_GERENCIADORES_TROCA_REGIONAL;
    } else {
        // Verificar se é apoiador
        for (const code in state.apoiadoresData) {
            if (state.apoiadoresData[code].ownerJid === jid) {
                memberData = state.apoiadoresData[code];
                dataObject = state.apoiadoresData;
                fileToSave = ARQUIVO_APOIADORES;
                break;
            }
        }
    }

    if (!memberData || !fileToSave) {
        return false;
    }

    memberData.ganhosTotais = (memberData.ganhosTotais || 0) + valor;

    if (direto) {
        memberData.caixa = (memberData.caixa || 0) + valor;
    } else {
        memberData.caixaBloqueado = (memberData.caixaBloqueado || 0) + valor;
    }

    // Registrar ganhos no mapa mensal (independente de bloqueio)
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!memberData.monthlyEarnings) memberData.monthlyEarnings = {};
    memberData.monthlyEarnings[monthKey] = (memberData.monthlyEarnings[monthKey] || 0) + valor;

    saveJsonFile(fileToSave, dataObject);
    return true;
}

/**
 * Transfere valores do caixaBloqueado para caixa no dia 1 do mês
 * Deve ser executado diariamente
 */
function releaseBlockedEarnings() {
    const now = new Date();
    const isFirstDayOfMonth = now.getDate() === 1;

    if (!isFirstDayOfMonth) {
        return;
    }

    // Processar admins
    Object.keys(state.adminData).forEach(jid => {
        if (state.adminData[jid].caixaBloqueado > 0) {
            state.adminData[jid].caixa = (state.adminData[jid].caixa || 0) + state.adminData[jid].caixaBloqueado;
            state.adminData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_ADMINS, state.adminData);

    // Processar gerenciadores de produto
    Object.keys(state.productManagerData).forEach(jid => {
        if (state.productManagerData[jid].caixaBloqueado > 0) {
            state.productManagerData[jid].caixa = (state.productManagerData[jid].caixa || 0) + state.productManagerData[jid].caixaBloqueado;
            state.productManagerData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, state.productManagerData);

    // Processar gerenciadores de cartão
    Object.keys(state.gerenciadoresCartaoData).forEach(jid => {
        if (state.gerenciadoresCartaoData[jid].caixaBloqueado > 0) {
            state.gerenciadoresCartaoData[jid].caixa = (state.gerenciadoresCartaoData[jid].caixa || 0) + state.gerenciadoresCartaoData[jid].caixaBloqueado;
            state.gerenciadoresCartaoData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, state.gerenciadoresCartaoData);

    // Processar gerenciadores de troca regional
    Object.keys(state.gerenciadoresTrocaRegionalData).forEach(jid => {
        if (state.gerenciadoresTrocaRegionalData[jid].caixaBloqueado > 0) {
            state.gerenciadoresTrocaRegionalData[jid].caixa = (state.gerenciadoresTrocaRegionalData[jid].caixa || 0) + state.gerenciadoresTrocaRegionalData[jid].caixaBloqueado;
            state.gerenciadoresTrocaRegionalData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, state.gerenciadoresTrocaRegionalData);

    // Processar apoiadores (liberar valores bloqueados no dia 1)
    for (const code in state.apoiadoresData) {
        if (state.apoiadoresData[code].caixaBloqueado > 0) {
            state.apoiadoresData[code].caixa = (state.apoiadoresData[code].caixa || 0) + state.apoiadoresData[code].caixaBloqueado;
            state.apoiadoresData[code].caixaBloqueado = 0;
        }
    }
    saveJsonFile(ARQUIVO_APOIADORES, state.apoiadoresData);
}

module.exports = {
    calculateNextReleaseDate,
    getTeamMemberEarnings,
    addEarningsToMember,
    releaseBlockedEarnings
};
