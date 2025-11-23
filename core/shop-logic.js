const fs = require('fs');
const path = require('path');
const {
    adminData,
    compradoresData,
    productManagerData,
    gerenciadoresCartaoData,
    gerenciadoresTrocaRegionalData,
    apoiadoresData,
    shopData,
    pendingOrders,
    pendingOrdersV,
    waitingOrders,
    cartData,
    invitationData,
    OWNER_JID
} = require('../state/global-state');
const { saveJsonFile } = require('../utils/file-io');
const {
    ARQUIVO_ADMINS,
    ARQUIVO_COMPRADORES,
    ARQUIVO_GERENCIADORES_PRODUTO,
    ARQUIVO_GERENCIADORES_CARTAO,
    ARQUIVO_GERENCIADORES_TROCA_REGIONAL,
    ARQUIVO_APOIADORES,
    ARQUIVO_CONVITES
} = require('../config/paths');

function getShopTaxes() {
    const t = shopData && shopData.taxas ? shopData.taxas : {};
    const defaults = {
        pix: 0.99,
        cartao: {
            avista: { fixa: 0.49, percentual: 1.99 },
            parcelado: {
                '2-6': { fixa: 0.49, percentual: 2.49 },
                '7-12': { fixa: 0.49, percentual: 2.99 }
            }
        }
    };
    return {
        pix: typeof t.pix === 'number' ? t.pix : defaults.pix,
        cartao: {
            avista: t.cartao && t.cartao.avista ? t.cartao.avista : defaults.cartao.avista,
            parcelado: t.cartao && t.cartao.parcelado ? t.cartao.parcelado : defaults.cartao.parcelado
        }
    };
}

function calculatePixTotalWithFees(amount) {
    const taxes = getShopTaxes();
    const fixo = Number(taxes.pix || 0);
    const total = Number(amount) + fixo;
    return Number(total.toFixed(2));
}

function getCardFeesForInstallments(installments) {
    const taxes = getShopTaxes();
    const i = parseInt(installments) || 1;
    if (i <= 1) return taxes.cartao.avista;
    if (i >= 2 && i <= 6) return taxes.cartao.parcelado['2-6'];
    return taxes.cartao.parcelado['7-12'];
}

function calculateCardTotalWithFees(amount, installments) {
    const fees = getCardFeesForInstallments(installments);
    const fixa = Number(fees.fixa || 0);
    const percentual = Number(fees.percentual || 0) / 100;
    const total = Number(amount) + fixa + (Number(amount) * percentual);
    return Number(total.toFixed(2));
}

function generateOrderId() {
    let newId;
    let isUnique = false;
    while (!isUnique) {
        newId = Math.floor(100000 + Math.random() * 900000);
        const existsInPending = pendingOrders.some(order => order.id === newId);
        const existsInPendingV = pendingOrdersV.some(order => order.id === newId);
        const existsInWaiting = waitingOrders.some(order => order.id === newId);
        const existsInCarts = Object.values(cartData).some(cart => cart.id === newId);
        if (!existsInPending && !existsInPendingV && !existsInWaiting && !existsInCarts) {
            isUnique = true;
        }
    }
    return newId;
}

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

    if (adminData[jid]) {
        memberData = adminData[jid];
        cargo = jid === OWNER_JID ? 'Proprietário' : 'Admin';
    } else if (compradoresData[jid]) {
        memberData = compradoresData[jid];
        cargo = 'Comprador';
    } else if (productManagerData[jid]) {
        memberData = productManagerData[jid];
        cargo = 'Gerenciador de Produto';
    } else if (gerenciadoresCartaoData[jid]) {
        memberData = gerenciadoresCartaoData[jid];
        cargo = 'Gerenciador de Cartão';
    } else if (gerenciadoresTrocaRegionalData[jid]) {
        memberData = gerenciadoresTrocaRegionalData[jid];
        cargo = 'Gerenciador de Troca Regional';
    } else {
        // Verificar se é apoiador
        for (const code in apoiadoresData) {
            if (apoiadoresData[code].ownerJid === jid) {
                memberData = apoiadoresData[code];
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

    if (adminData[jid]) {
        memberData = adminData[jid];
        dataObject = adminData;
        fileToSave = ARQUIVO_ADMINS;
    } else if (compradoresData[jid]) {
        memberData = compradoresData[jid];
        dataObject = compradoresData;
        fileToSave = ARQUIVO_COMPRADORES;
        direto = true; // Compradores sempre recebem direto
    } else if (productManagerData[jid]) {
        memberData = productManagerData[jid];
        dataObject = productManagerData;
        fileToSave = ARQUIVO_GERENCIADORES_PRODUTO;
    } else if (gerenciadoresCartaoData[jid]) {
        memberData = gerenciadoresCartaoData[jid];
        dataObject = gerenciadoresCartaoData;
        fileToSave = ARQUIVO_GERENCIADORES_CARTAO;
    } else if (gerenciadoresTrocaRegionalData[jid]) {
        memberData = gerenciadoresTrocaRegionalData[jid];
        dataObject = gerenciadoresTrocaRegionalData;
        fileToSave = ARQUIVO_GERENCIADORES_TROCA_REGIONAL;
    } else {
        // Verificar se é apoiador
        for (const code in apoiadoresData) {
            if (apoiadoresData[code].ownerJid === jid) {
                memberData = apoiadoresData[code];
                dataObject = apoiadoresData;
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
    Object.keys(adminData).forEach(jid => {
        if (adminData[jid].caixaBloqueado > 0) {
            adminData[jid].caixa = (adminData[jid].caixa || 0) + adminData[jid].caixaBloqueado;
            adminData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_ADMINS, adminData);

    // Processar gerenciadores de produto
    Object.keys(productManagerData).forEach(jid => {
        if (productManagerData[jid].caixaBloqueado > 0) {
            productManagerData[jid].caixa = (productManagerData[jid].caixa || 0) + productManagerData[jid].caixaBloqueado;
            productManagerData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);

    // Processar gerenciadores de cartão
    Object.keys(gerenciadoresCartaoData).forEach(jid => {
        if (gerenciadoresCartaoData[jid].caixaBloqueado > 0) {
            gerenciadoresCartaoData[jid].caixa = (gerenciadoresCartaoData[jid].caixa || 0) + gerenciadoresCartaoData[jid].caixaBloqueado;
            gerenciadoresCartaoData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_CARTAO, gerenciadoresCartaoData);

    // Processar gerenciadores de troca regional
    Object.keys(gerenciadoresTrocaRegionalData).forEach(jid => {
        if (gerenciadoresTrocaRegionalData[jid].caixaBloqueado > 0) {
            gerenciadoresTrocaRegionalData[jid].caixa = (gerenciadoresTrocaRegionalData[jid].caixa || 0) + gerenciadoresTrocaRegionalData[jid].caixaBloqueado;
            gerenciadoresTrocaRegionalData[jid].caixaBloqueado = 0;
        }
    });
    saveJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, gerenciadoresTrocaRegionalData);

    // Processar apoiadores (liberar valores bloqueados no dia 1)
    for (const code in apoiadoresData) {
        if (apoiadoresData[code].caixaBloqueado > 0) {
            apoiadoresData[code].caixa = (apoiadoresData[code].caixa || 0) + apoiadoresData[code].caixaBloqueado;
            apoiadoresData[code].caixaBloqueado = 0;
        }
    }
    saveJsonFile(ARQUIVO_APOIADORES, apoiadoresData);
}

async function generateInviteCode(userName, userJid) {
    const firstName = userName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, '');
    let inviteCode;
    let isUnique = false;

    const existingCodes = Object.keys(invitationData);
    for (const code of existingCodes) {
        if (invitationData[code].ownerJid === userJid) {
            delete invitationData[code];
        }
    }

    while (!isUnique) {
        const randomNumbers = Math.floor(1000 + Math.random() * 9000);
        inviteCode = `${firstName}${randomNumbers}`.toUpperCase();
        if (!invitationData[inviteCode]) {
            isUnique = true;
        }
    }

    invitationData[inviteCode] = {
        ownerJid: userJid,
        ownerName: userName,
        uses: 0,
        totalDiscountValue: 0,
        invitedUsers: {}
    };
    saveJsonFile(ARQUIVO_CONVITES, invitationData);
    return inviteCode;
}

module.exports = {
    getShopTaxes,
    calculatePixTotalWithFees,
    getCardFeesForInstallments,
    calculateCardTotalWithFees,
    generateOrderId,
    calculateNextReleaseDate,
    getTeamMemberEarnings,
    addEarningsToMember,
    releaseBlockedEarnings,
    generateInviteCode
};
