const state = require("../state/global-state");
const { saveJsonFile } = require("../utils/file-io");
const { ARQUIVO_CONVITES } = require("../config/paths");

function getShopTaxes() {
    const t = state.shopData && state.shopData.taxas ? state.shopData.taxas : {};
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
        const existsInPending = state.pendingOrders.some(order => order.id === newId);
        const existsInPendingV = state.pendingOrdersV.some(order => order.id === newId);
        const existsInWaiting = state.waitingOrders.some(order => order.id === newId);
        const existsInCarts = Object.values(state.cartData).some(cart => cart.id === newId);
        if (!existsInPending && !existsInPendingV && !existsInWaiting && !existsInCarts) {
            isUnique = true;
        }
    }
    return newId;
}

async function generateInviteCode(userName, userJid) {
    const firstName = userName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, '');
    let inviteCode;
    let isUnique = false;

    const existingCodes = Object.keys(state.invitationData);
    for (const code of existingCodes) {
        if (state.invitationData[code].ownerJid === userJid) {
            delete state.invitationData[code];
        }
    }

    while (!isUnique) {
        const randomNumbers = Math.floor(1000 + Math.random() * 9000);
        inviteCode = `${firstName}${randomNumbers}`.toUpperCase();
        if (!state.invitationData[inviteCode]) {
            isUnique = true;
        }
    }

    state.invitationData[inviteCode] = {
        ownerJid: userJid,
        ownerName: userName,
        uses: 0,
        totalDiscountValue: 0,
        invitedUsers: {}
    };
    saveJsonFile(ARQUIVO_CONVITES, state.invitationData);
    return inviteCode;
}

module.exports = {
    getShopTaxes,
    calculatePixTotalWithFees,
    calculateCardTotalWithFees,
    generateOrderId,
    generateInviteCode
};
