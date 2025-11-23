const {
    cartData,
    userData,
    userState,
    paymentLinkMap,
    saveJsonFile,
    purchaseHistory,
    ordersData,
    adminsData,
    compradoresData
} = require('../state/global-state');
const { sendMessage, sendInteractiveList, navigateTo } = require('../utils/messages');
const { getUserLanguage, formatCurrencyByLanguage } = require('../utils/translation');
const { calculatePixTotalWithFees, calculateCardTotalWithFees, generateOrderId } = require('../core/shop-logic');
const { isValidEmail } = require('../utils/validators');
const { sendMainMenu } = require('./menus');
const asaas = require('../services/asaas');
const {
    ARQUIVO_CARRINHOS,
    ARQUIVO_PEDIDOS,
    ARQUIVO_HISTORICO_COMPRAS,
    ARQUIVO_USUARIOS,
    ARQUIVO_ADMINS,
    ARQUIVO_COMPRADORES
} = require('../config/paths');

async function sendPaymentMethodChoice(sock, jid, finalTotal) {
    const userLang = getUserLanguage(jid);
    const totalFmt = await formatCurrencyByLanguage(finalTotal || 0, userLang);

    const fallbackText = `💳 *Métodos de Pagamento*\n\nQual método você prefere utilizar?\n\n*Opções:*\n1️⃣ PIX (Valor: ${totalFmt})\n2️⃣ Cartão de Crédito (Valor: ${totalFmt})\n3️⃣ Outro Método (Cripto, Paypal, etc.)\n\n0️⃣ 🛒 Voltar ao carrinho`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_payment_method_choice',
        stateData: { finalTotal }
    });
}

async function sendOtherPaymentMethodsMenu(sock, jid, finalTotal) {
    const fallbackText = `💳 *Métodos de Pagamento*\n\nQual método alternativo você prefere utilizar?\n\n❗Caso seja de outro país recomendo usar a wise, um banco internacional que aceita pagamentos de diversos países, podendo pagar via pix através da tela anterior\n\n*Opções:*\n1️⃣ Cripto (BINANCE)\n2️⃣ CRIPTO (DEMAIS CORRETORAS)\n3️⃣ PayPal\n4️⃣ Outro meio\n\n0️⃣ 🛒 Voltar ao carrinho`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_other_payment_method_choice',
        stateData: { finalTotal }
    });
}

async function startPixCheckoutProcess(sock, jid, finalTotal, isGenerated = false, attendantJid = null) {
    const userCart = (cartData[jid] || { items: [] }).items;
    const userProfile = userData[jid];

    const description = isGenerated ? `Pagamento customizado PowerShop` : userCart.map(item => item.name).join(', ');
    await sendMessage(sock, jid, { text: "⏳ Um momento, estamos gerando seu código de pagamento PIX..." });

    try {
        const cpfFromProfile = userProfile && typeof userProfile.cpf === 'string' ? userProfile.cpf.replace(/[^\d]/g, '') : null;

        // 1. Criar ou buscar cliente no Asaas
        const customer = await asaas.createOrGetCustomer({
            name: userProfile?.nome || jid.split('@')[0],
            email: userProfile?.email || `${jid.split('@')[0]}@powershop.com`, // Fallback email if not present
            cpfCnpj: cpfFromProfile,
            mobilePhone: jid.split('@')[0]
        });

        if (!customer || !customer.id) {
            throw new Error("Falha ao identificar cliente no sistema de pagamento.");
        }

        // 2. Criar pagamento PIX
        const paymentData = await asaas.createPixPayment({
            customerId: customer.id,
            value: finalTotal,
            description: description,
            dueDate: new Date().toISOString().split('T')[0] // Vencimento hoje
        });

        if (!paymentData || !paymentData.id) {
            throw new Error("Falha ao criar pagamento no Asaas.");
        }

        const paymentId = paymentData.id;
        const pixCode = paymentData.pixCode; // Assuming asaas service returns this
        const pixQrCode = paymentData.pixQrCode; // Assuming asaas service returns this

        await sendMessage(sock, jid, { text: `✅ *Pagamento PIX Gerado!*\n\nCopie e cole o código abaixo no seu app de banco:` });
        await sendMessage(sock, jid, { text: pixCode });

        if (pixQrCode) {
            // Decode base64 if needed or send image
            // For simplicity, just sending text for now as per snippet context
        }

        const timeoutId = setTimeout(() => checkPixPaymentStatus(sock, jid, paymentId, finalTotal, userCart, isGenerated, attendantJid), 20000);
        if (userState[jid]) {
            userState[jid].paymentCheckTimeout = timeoutId;
        }

    } catch (error) {
        console.error("!! ERRO AO CRIAR PAGAMENTO PIX NO ASAAS !!", error.message || error);
        await sendMessage(sock, jid, { text: `❌ Desculpe, ocorreu um erro ao gerar seu pagamento: ${error.message}\n\nPor favor, tente novamente ou contate o suporte.` });
        delete userState[jid];
        await sendMainMenu(sock, jid);
    }
}

async function checkPixPaymentStatus(sock, jid, paymentId, total, userCart, isGenerated = false, attendantJid = null) {
    try {
        console.log(`Verificando status do pagamento PIX Asaas: ${paymentId}`);
        const result = await asaas.getPaymentDetails(paymentId);

        if (result && (result.status === 'RECEIVED' || result.status === 'CONFIRMED')) {
            console.log(`Pagamento PIX ${paymentId} aprovado! Status: ${result.status}`);
            if (userState[jid] && userState[jid].paymentCheckTimeout) {
                clearTimeout(userState[jid].paymentCheckTimeout);
            }
            await handleSuccessfulPayment(sock, jid, total, userCart, 'PIX', isGenerated, attendantJid);
        } else {
            // Status desconhecido, continua verificando
            const timeoutId = setTimeout(() => checkPixPaymentStatus(sock, jid, paymentId, total, userCart, isGenerated, attendantJid), 20000);
            if (userState[jid]) {
                userState[jid].paymentCheckTimeout = timeoutId;
            }
        }
    } catch (error) {
        console.error("Erro ao verificar status do pagamento PIX:", error);
        // Don't delete userState here to allow retries or manual check
    }
}

async function startCardCheckoutProcess(sock, jid, totalAmount) {
    const userCart = (cartData[jid] || { items: [] }).items;
    if (userCart.length === 0) {
        await sendMessage(sock, jid, { text: "Seu carrinho está vazio." });
        return;
    }

    let menuText = "💳 *Pagamento com Cartão de Crédito*\n\n";
    menuText += `*Valor total:* R$ ${totalAmount.toFixed(2).replace('.', ',')}\n\n`;
    menuText += "Em quantas vezes você deseja parcelar?\n\n";

    const userLang = getUserLanguage(jid);
    for (let i = 1; i <= 12; i++) {
        const totalComTaxas = calculateCardTotalWithFees(totalAmount, i);
        const installmentValue = totalComTaxas / i;
        const installmentFmt = await formatCurrencyByLanguage(installmentValue, userLang);
        menuText += `*${i}x* de ${installmentFmt} (inclui taxas)\n`;
    }
    menuText += "\nDigite o número de parcelas (1 a 12), ou 0 para cancelar.";

    await sendMessage(sock, jid, { text: menuText });
    navigateTo(jid, 'awaiting_installments_choice', { totalAmount });
}

async function startCardLinkCheckoutProcess(sock, jid, totalAmount, installments) {
    const userCart = (cartData[jid] || { items: [] }).items;
    const userProfile = userData[jid] || {};
    const emailFromProfile = isValidEmail(userProfile.email) ? userProfile.email : null;
    if (!emailFromProfile) {
        await sendMessage(sock, jid, { text: "📧 Antes de gerar o link de pagamento, envie seu e-mail (ex: nome@dominio.com). Digite 0 para cancelar." });
        navigateTo(jid, 'awaiting_card_email', { totalAmount, installments });
        return;
    }

    try {
        const totalComTaxas = calculateCardTotalWithFees(totalAmount, installments);
        const link = await asaas.createPaymentLink(totalComTaxas, `Pedido PowerShop - ${userProfile.nome || jid}`, emailFromProfile, installments);

        const userLang = getUserLanguage(jid);
        const totalFmt = await formatCurrencyByLanguage(totalComTaxas, userLang);
        await sendMessage(sock, jid, { text: `💳 Realize o pagamento pelo link abaixo (cartão de crédito):\n\n${link.url}\n\nValor total: ${totalFmt} (inclui taxas)\n\nApós pagar, aguarde a confirmação.` });

        paymentLinkMap[link.id] = { jid, totalAmount, userCart };
        navigateTo(jid, 'awaiting_card_link_payment', { linkId: link.id, totalAmount, userCart });

        // Start checking status
        checkCardPaymentStatus(sock, jid, link.id, totalAmount, userCart);

    } catch (error) {
        await sendMessage(sock, jid, { text: `❌ Não foi possível gerar o link de pagamento: ${error.message}` });
    }
}

async function checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts = 0) {
    if (userState[jid]) {
        delete userState[jid].paymentCheckTimeout;
    }
    const maxAttempts = 15;
    if (attempts >= maxAttempts) {
        console.log(`Verificação para pagamento ${paymentId} expirou.`);
        await sendMessage(sock, jid, { text: "⏰ O tempo para verificação do pagamento expirou. Se você concluiu o pagamento, ele será processado manualmente em breve. Caso contrário, por favor, tente novamente ou contate o suporte." });
        delete userState[jid];
        return;
    }

    try {
        const result = await asaas.getPaymentDetails(paymentId);
        if (result && (result.status === 'RECEIVED' || result.status === 'CONFIRMED')) {
            await handleSuccessfulPayment(sock, jid, total, userCart, 'CARTAO');
        } else {
            const timeoutId = setTimeout(() => checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts + 1), 10000);
            if (userState[jid]) {
                userState[jid].paymentCheckTimeout = timeoutId;
            }
        }
    } catch (error) {
        console.error("Erro ao verificar status do pagamento com cartão:", error);
        const timeoutId = setTimeout(() => checkCardPaymentStatus(sock, jid, paymentId, total, userCart, attempts + 1), 10000);
        if (userState[jid]) {
            userState[jid].paymentCheckTimeout = timeoutId;
        }
    }
}

async function handleSuccessfulPayment(sock, jid, total, userCart, method, isGenerated = false, attendantJid = null) {
    await sendMessage(sock, jid, { text: "🎉 Pagamento confirmado com sucesso! Obrigado pela sua compra." });

    const orderId = generateOrderId();
    const newOrder = {
        id: orderId,
        userJid: jid,
        items: userCart,
        total: total,
        method: method,
        status: 'pending_delivery', // ou 'completed' se for automático
        timestamp: Date.now(),
        isGenerated: isGenerated,
        attendantJid: attendantJid
    };

    // Salvar pedido
    ordersData.push(newOrder);
    saveJsonFile(ARQUIVO_PEDIDOS, ordersData);

    // Atualizar histórico do usuário
    if (!purchaseHistory[jid]) purchaseHistory[jid] = [];
    purchaseHistory[jid].push(newOrder);
    saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistory);

    // Limpar carrinho
    if (cartData[jid]) {
        cartData[jid].items = [];
        cartData[jid].appliedCoupon = null;
        saveJsonFile(ARQUIVO_CARRINHOS, cartData);
    }

    // Notificar Admins/Compradores
    const notificationText = `🔔 *Novo Pedido #${orderId}*\n\n👤 Cliente: ${userData[jid]?.nome || jid}\n💰 Total: R$ ${total.toFixed(2)}\n💳 Método: ${method}\n📦 Itens: ${userCart.length}`;

    // Notificar todos os admins
    for (const adminJid of Object.keys(adminsData)) {
        await sendMessage(sock, adminJid, { text: notificationText });
    }

    // Notificar compradores se necessário (lógica de distribuição pode ser adicionada aqui)
    for (const buyerJid of Object.keys(compradoresData)) {
        await sendMessage(sock, buyerJid, { text: notificationText });
    }

    delete userState[jid];
    await sendMainMenu(sock, jid);
}

module.exports = {
    sendPaymentMethodChoice,
    sendOtherPaymentMethodsMenu,
    startPixCheckoutProcess,
    startCardCheckoutProcess,
    startCardLinkCheckoutProcess,
    checkPixPaymentStatus,
    checkCardPaymentStatus,
    handleSuccessfulPayment
};

async function handlePowerPointsPayment(sock, jid) {
    const userCart = cartData[jid];
    if (!userCart || !userCart.items || userCart.items.length === 0) {
        await sendMessage(sock, jid, { text: "🛒 Seu carrinho está vazio." });
        return;
    }

    const userDataObj = userData[jid];
    const userPoints = userDataObj.powerPoints || 0;

    let totalInPP = 0;
    for (const item of userCart.items) {
        const itemPriceInPP = item.priceInPP || (item.price * 100); // Exemplo de conversão se não tiver preço em PP definido
        totalInPP += itemPriceInPP * item.quantity;
    }

    if (userPoints < totalInPP) {
        await sendMessage(sock, jid, { text: `❌ Você não tem PowerPoints suficientes.\n\n*Total:* ${totalInPP} ✨\n*Seu Saldo:* ${userPoints} ✨` });
        return;
    }

    const confirmationText = `✨ *Confirmar Pagamento com PowerPoints*\n\n` +
        `*Total:* ${totalInPP} ✨\n` +
        `*Seu Saldo:* ${userPoints} ✨\n` +
        `*Saldo Final:* ${userPoints - totalInPP} ✨\n\n` +
        `Deseja confirmar a compra?\n\n` +
        `1️⃣ Sim, confirmar\n` +
        `2️⃣ Cancelar`;

    await sendMessage(sock, jid, { text: confirmationText });
    navigateTo(jid, 'awaiting_powerpoint_purchase_confirmation', { total: totalInPP, items: userCart.items });
}

module.exports = {
    sendPaymentMethodChoice,
    sendOtherPaymentMethodsMenu,
    startPixCheckoutProcess,
    startCardCheckoutProcess,
    startCardLinkCheckoutProcess,
    checkPixPaymentStatus,
    checkCardPaymentStatus,
    handleSuccessfulPayment,
    handlePowerPointsPayment
};
