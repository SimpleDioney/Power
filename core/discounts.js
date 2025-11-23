const {
    couponData,
    invitationData,
    shopData,
    saveJsonFile
} = require('../state/global-state');
const { sendMessage, sendInteractiveList, navigateTo } = require('../utils/messages');
const { ARQUIVO_CUPONS, ARQUIVO_CONVITES } = require('../config/paths');

async function sendManageDiscountsMenu(sock, jid) {
    const fallbackText = `💰 *Gerenciamento de Descontos*\n\nSelecione uma opção:\n\n1️⃣ 🎫 Gerenciar Cupons\n2️⃣ 🎟️ Gerenciar Convites\n\n0️⃣ ↩️ Voltar ao Painel Administrativo`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_discount_management_choice'
    });
}

async function sendCouponList(sock, jid) {
    const coupons = Object.values(couponData);

    let text = "🎫 *Cupons de Desconto Cadastrados*\n\n";

    if (coupons.length === 0) {
        text += "Nenhum cupom cadastrado no momento.";
    } else {
        coupons.sort((a, b) => (b.uses || 0) - (a.uses || 0));
        coupons.forEach(coupon => {
            const discountValue = coupon.type === 'percentage' ? `${coupon.value}%` : `R$ ${(coupon.value || 0).toFixed(2)}`;
            const usesText = coupon.limit ? `${coupon.uses || 0}/${coupon.limit}` : `${coupon.uses || 0}`;

            text += `*Código:* ${coupon.code}\n`;
            text += `*Desconto:* ${discountValue}\n`;
            text += `*Usos:* ${usesText}\n`;
            text += `-----------------------------------\n`;
        });
    }

    text += "\nDigite *0* para Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: text,
        state: 'awaiting_discount_admin_choice'
    });
}

async function sendInvitationList(sock, jid) {
    const invites = Object.entries(invitationData);

    let text = "🎟️ *Códigos de Convite Gerados*\n\n";

    if (invites.length === 0) {
        text += "Nenhum código de convite gerado ainda.";
    } else {
        invites.sort(([, a], [, b]) => (b.uses || 0) - (a.uses || 0));
        invites.forEach(([code, data]) => {
            text += `*Código:* ${code}\n`;
            text += `*Dono:* ${data.ownerName}\n`;
            text += `*Usos:* ${data.uses || 0}\n`;
            text += `*Descontos Totais:* R$ ${(data.totalDiscountValue || 0).toFixed(2).replace('.', ',')}\n`;
            text += `-----------------------------------\n`;
        });
    }

    text += "\n*0* - Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: text,
        state: 'awaiting_discount_admin_choice'
    });
}

module.exports = {
    sendManageDiscountsMenu,
    sendCouponList,
    sendInvitationList
};
