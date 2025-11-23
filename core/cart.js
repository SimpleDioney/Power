const fs = require("fs");
const path = require("path");
const state = require("../state/global-state");
const { sendMessage, navigateTo, sendInteractiveList } = require("./messaging");
const { sendBuyMenu } = require("./menus");
const {
    directoryHasProducts,
    directoryHasNewProducts,
    loadJsonFile,
    saveJsonFile,
    isProductNew
} = require("../utils/file-io");
const { formatCurrencyByLanguage } = require("../utils/formatters");
const { getUserLanguage } = require("../utils/user-helper");
const { generateOrderId } = require("../core/shop-logic");
const {
    DIRETORIO_OFERTAS,
    ARQUIVO_CARRINHOS
} = require("../config/paths");
const {
    DISCOUNT_TIERS,
    LANGUAGE_CURRENCY,
    SPHERE_PRICING
} = require("../config/constants");

async function sendOfferSections(sock, jid) {
    const allSections = fs.readdirSync(DIRETORIO_OFERTAS)
        .filter(file => fs.statSync(path.join(DIRETORIO_OFERTAS, file)).isDirectory());

    const sectionsWithProducts = allSections.filter(section =>
        directoryHasProducts(path.join(DIRETORIO_OFERTAS, section))
    );

    if (sectionsWithProducts.length === 0) {
        await sendMessage(sock, jid, { text: "😔 No momento não temos ofertas especiais disponíveis.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }

    const sectionsData = sectionsWithProducts.map((section, index) => {
        const hasNew = directoryHasNewProducts(path.join(DIRETORIO_OFERTAS, section));
        const newEmoji = hasNew ? ' (🆕)' : '';
        return { section, index, newEmoji };
    });

    let fallbackText = "⚡ *Seções de Ofertas Especiais*\n\nEscolha uma seção para explorar:\n\n";
    sectionsData.forEach(({ section, index, newEmoji }) => {
        fallbackText += `*${index + 1}* - ${section}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_offer_section_choice",
        stateData: { sections: sectionsWithProducts }
    });
}

async function sendOfferList(sock, jid, sectionPath) {
    const fullPath = path.join(DIRETORIO_OFERTAS, sectionPath);
    const productFileName = `${path.basename(sectionPath)}.json`;
    const productFilePath = path.join(fullPath, productFileName);

    let products = loadJsonFile(productFilePath, []);
    const validProducts = products.filter(p => !p.expiryTimestamp || p.expiryTimestamp > Date.now());
    if (validProducts.length < products.length) {
        products.forEach(p => {
            if (p.expiryTimestamp && p.expiryTimestamp <= Date.now() && p.image && fs.existsSync(p.image)) {
                try {
                    fs.unlinkSync(p.image);
                    console.log(`Imagem de oferta expirada removida: ${p.image}`);
                } catch (err) {
                    console.error(`Erro ao remover imagem de oferta expirada ${p.image}:`, err);
                }
            }
        });
        saveJsonFile(productFilePath, validProducts);
    }

    const subdirectories = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && directoryHasProducts(path.join(fullPath, dirent.name)))
        .map(dirent => dirent.name);

    let menuItems = [];
    subdirectories.forEach(sub => {
        menuItems.push({ type: 'dir', name: sub, path: path.join(sectionPath, sub) });
    });
    validProducts.forEach(product => {
        menuItems.push({ type: 'product', name: product.name, data: product });
    });

    menuItems.sort((a, b) => a.name.localeCompare(b.name));

    if (menuItems.length === 0) {
        await sendMessage(sock, jid, { text: "😔 Nenhum item ou sub-seção encontrado aqui.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_offer_choice", { menuItems: [], sectionPath });
        return;
    }

    let fallbackText = `⚡ *Ofertas Especiais: ${sectionPath}*\n\nEscolha uma opção para explorar:\n\n`;
    menuItems.forEach((item, index) => {
        let newEmoji = '';
        if (item.type === 'dir') {
            const hasNew = directoryHasNewProducts(path.join(DIRETORIO_OFERTAS, item.path));
            if (hasNew) newEmoji = ' (🆕)';
        } else if (item.type === 'product') {
            if (isProductNew(item.data)) newEmoji = ' (🆕)';
        }
        fallbackText += `*${index + 1}* - ${item.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_offer_choice",
        stateData: { menuItems, sectionPath }
    });
}

async function sendOfferDetails(sock, jid, offer, sectionPath) {
    const user = state.userData[jid];
    const userLang = getUserLanguage(jid);
    const price = `${await formatCurrencyByLanguage(offer.price || 0, userLang)}`;
    const newEmoji = isProductNew(offer) ? ' (🆕)' : '';
    let caption = `✨ *${offer.name}${newEmoji}*\n\n`;

    let description = offer.description;
    if (offer.price === 19.99) {
        description = `ℹ Valor mínimo de 19,99.\nPodendo ser mínimamente menor, igual ou maior que o apresentado no jogo\n\n${offer.description}`;
    }
    caption += `${description}\n\n`;

    let platformImage = offer.image || null;
    if (user && user.plataforma && offer.basePrices) {
        const platformKeyMap = {
            "Android/Play Store": "google",
            "Microsoft/PC": "microsoft",
            "iOS/Apple Store": "ios"
        };
        const platformKey = platformKeyMap[user.plataforma];

        if (platformKey && offer.basePrices[platformKey] && offer.basePrices[platformKey] > 0) {
            const basePrice = offer.basePrices[platformKey];
            const economy = basePrice - offer.price;
            const basePriceFormatted = `${await formatCurrencyByLanguage(basePrice || 0, userLang)}`;
            const economyFormatted = `${await formatCurrencyByLanguage(economy || 0, userLang)}`;
            caption += `*Preço na ${user.plataforma}:* ~${basePriceFormatted}~\n`;
            caption += `*Nosso Preço:* *${price}*\n`;
            if (economy > 0) {
                caption += `*Sua Economia:* *${economyFormatted}* 🤑\n`;
            }
        } else {
            caption += `*Valor:* ${price}\n`;
        }
    } else {
        caption += `*Valor:* ${price}\n`;
    }

    caption += `\n*O que deseja fazer?*\n\n1️⃣ 🛒 Adicionar ao Carrinho\n0️⃣ ↩️ Voltar à lista de ofertas`;
    try {
        if (platformImage && fs.existsSync(platformImage)) {
            const stats = fs.statSync(platformImage);
            if (stats.size > 0) {
                const imageBuffer = fs.readFileSync(platformImage);
                if (imageBuffer && imageBuffer.length > 0) {
                    await sendMessage(sock, jid, {
                        image: imageBuffer,
                        caption,
                    });
                } else {
                    console.log("Imagem vazia, enviando apenas texto.");
                    await sendMessage(sock, jid, { text: caption });
                }
            } else {
                console.log("Arquivo de imagem vazio, enviando apenas texto.");
                await sendMessage(sock, jid, { text: caption });
            }
        } else {
            await sendMessage(sock, jid, { text: caption });
        }
    } catch (e) {
        console.error("Falha ao enviar imagem da oferta.", e);
        await sendMessage(sock, jid, { text: caption });
    }
    navigateTo(jid, "awaiting_add_to_cart_confirmation", {
        product: offer,
        type: "oferta",
        sectionPath: sectionPath
    });
}

async function sendCartView(sock, jid) {
    if (!state.cartData[jid] || !state.cartData[jid].id) {
        state.cartData[jid] = {
            id: generateOrderId(),
            items: [],
            appliedCoupon: null
        };
        saveJsonFile(ARQUIVO_CARRINHOS, state.cartData);
    }

    const userCartData = state.cartData[jid];
    const userCart = userCartData.items || [];

    if (userCart.length === 0) {
        await sendMessage(sock, jid, {
            text: `🛒 *Seu Carrinho (ID: ${userCartData.id})*\n\nSeu carrinho de compras está vazio no momento.\n\nDigite *0* para Continuar Comprando.`,
        });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }

    let cartText = `🛒 *Seu Carrinho (ID: ${userCartData.id})*\n\n`;
    cartText += "⚠️ *Atenção:* Algumas ofertas podem variar de conta para conta. Certifique-se de que todas as ofertas selecionadas estão ativas em sua conta do jogo antes de prosseguir.\n\n";
    cartText += "*Itens no seu carrinho:*\n";

    let subtotal = userCart.reduce((sum, item) => sum + (item.price || 0), 0);
    const userLang = getUserLanguage(jid);

    for (const item of userCart) {
        const itemPriceFormatted = await formatCurrencyByLanguage(item.price || 0, userLang);
        cartText += `> • ${item.name} - *${itemPriceFormatted}*\n`;
    }

    const subtotalFormatted = await formatCurrencyByLanguage(subtotal || 0, userLang);
    cartText += `\n*Subtotal:* ${subtotalFormatted}\n`;

    let finalTotal = subtotal;
    let discountMessages = [];
    const appliedCouponCode = userCartData.appliedCoupon;
    let appliedCoupon = null;

    if (state.userData[jid]?.hasInviteDiscount) {
        const discountAmount = subtotal * 0.05;
        finalTotal -= discountAmount;
        const discountFmt = await formatCurrencyByLanguage(discountAmount || 0, userLang);
        discountMessages.push(`*Desconto de Convite (5%):* -${discountFmt}`);
    }
    else if (appliedCouponCode && state.couponData[appliedCouponCode]) {
        appliedCoupon = state.couponData[appliedCouponCode];
        if (appliedCoupon.minValue && subtotal < appliedCoupon.minValue) {
            const minFmt = await formatCurrencyByLanguage(appliedCoupon.minValue || 0, userLang);
            discountMessages.push(`(O cupom *${appliedCoupon.name}* foi removido, pois o subtotal é menor que ${minFmt})`);
            userCartData.appliedCoupon = null;
            saveJsonFile(ARQUIVO_CARRINHOS, state.cartData);
        } else {
            let discountAmount = 0;
            if (appliedCoupon.type === 'percentage') {
                discountAmount = subtotal * (appliedCoupon.value / 100);
                if (appliedCoupon.maxValue && discountAmount > appliedCoupon.maxValue) {
                    discountAmount = appliedCoupon.maxValue;
                }
            } else {
                discountAmount = appliedCoupon.value;
            }
            finalTotal -= discountAmount;
            const discountFmt = await formatCurrencyByLanguage(discountAmount || 0, userLang);
            discountMessages.push(`*Cupom (${appliedCoupon.name}):* -${discountFmt}`);
        }
    }

    let progressiveDiscountApplied = false;
    let nextTierMessage = "";
    if (!state.userData[jid]?.hasInviteDiscount && !userCartData.appliedCoupon) {
        let progressiveDiscount = null;
        for (let i = DISCOUNT_TIERS.length - 1; i >= 0; i--) {
            if (subtotal >= DISCOUNT_TIERS[i].threshold) {
                progressiveDiscount = DISCOUNT_TIERS[i];
                break;
            }
        }
        if (progressiveDiscount) {
            const discountAmount = subtotal * progressiveDiscount.discount;
            finalTotal = subtotal - discountAmount;
            const discountPercentage = (progressiveDiscount.discount * 100).toFixed(0);
            const discFmt = await formatCurrencyByLanguage(discountAmount || 0, userLang);
            discountMessages.push(`*Desconto Progressivo (${discountPercentage}%):* -${discFmt}`);
            progressiveDiscountApplied = true;
        }
    }

    let nextTier = DISCOUNT_TIERS.find(tier => subtotal < tier.threshold);
    if (nextTier) {
        const remaining = nextTier.threshold - subtotal;
        const barLength = 10;
        const progress = Math.min(barLength, Math.floor((subtotal / nextTier.threshold) * barLength));
        const progressBar = `🛍️${'█'.repeat(progress)}${'░'.repeat(barLength - progress)}🎁`;
        const nextDiscountPercentage = (nextTier.discount * 100).toFixed(0);
        const remainingFmt = await formatCurrencyByLanguage(remaining || 0, userLang);
        nextTierMessage = `\n${progressBar}\nFaltam apenas *${remainingFmt}* para você desbloquear ${nextTier.message} Adicione mais itens para garantir seu prêmio!\n`;
    }

    if (discountMessages.length > 0) {
        cartText += discountMessages.join('\n') + '\n';
    }

    const finalTotalFmt = await formatCurrencyByLanguage(finalTotal || 0, userLang);
    cartText += `*Total:* ${finalTotalFmt}\n`;
    const powerPointsEarned = Math.floor(finalTotal * 100);
    cartText += `*PowerPoints a ganhar:* ${powerPointsEarned} ✨\n`;

    if (nextTierMessage) {
        cartText += nextTierMessage;
    }

    await sendInteractiveList(sock, jid, {
        fallbackText: `${cartText}\n\n*O que deseja fazer?*\n\n1️⃣ ✅ Finalizar Compra\n2️⃣ 🎟️ Adicionar Cupom\n3️⃣ 🗑️ Esvaziar Carrinho\n4️⃣ ✨ Comprar com PowerPoints\n\n0️⃣ Continuar Comprando`,
        state: 'awaiting_cart_action',
        stateData: { finalTotal }
    });
}

async function sendCartViewWithPowerPoints(sock, jid) {
    const BRL_TO_PP = 2000;
    const userCart = (state.cartData[jid] || { items: [] }).items;
    const userPoints = state.userData[jid]?.powerPoints || 0;
    if (userCart.length === 0) {
        await sendMessage(sock, jid, { text: "Seu carrinho está vazio." });
        await sendBuyMenu(sock, jid);
        return;
    }

    let totalInBRL = 0;
    userCart.forEach(item => { totalInBRL += (item.price || 0); });
    const totalInPP = Math.floor(totalInBRL * BRL_TO_PP);

    let ppCartText = "🛒 *Carrinho em PowerPoints* ✨\n\n";
    userCart.forEach((item) => {
        const itemPriceInPP = Math.floor((item.price || 0) * BRL_TO_PP);
        ppCartText += `> • ${item.name} - *${itemPriceInPP.toLocaleString('pt-BR')} PowerPoints*\n`;
    });
    ppCartText += `\n-----------------------------------\n`;
    ppCartText += `*Total do Pedido:* ${totalInPP.toLocaleString('pt-BR')} PowerPoints\n`;
    ppCartText += `*Seus Pontos:* ${userPoints.toLocaleString('pt-BR')} PowerPoints\n`;

    const hasEnoughPoints = userPoints >= totalInPP;
    if (hasEnoughPoints) {
        const remainingPoints = userPoints - totalInPP;
        ppCartText += `*Pontos restantes após a compra:* ${remainingPoints.toLocaleString('pt-BR')}\n`;
    } else {
        const missingPoints = totalInPP - userPoints;
        ppCartText += `*Pontos Faltantes:* ${missingPoints.toLocaleString('pt-BR')} 😟\n`;
        ppCartText += `Você não possui PowerPoints suficientes para esta compra.\n`;
    }

    const userLang = getUserLanguage(jid);
    const symbol = (LANGUAGE_CURRENCY[userLang] && LANGUAGE_CURRENCY[userLang].symbol) ? LANGUAGE_CURRENCY[userLang].symbol : 'R$';

    let fallbackText = ppCartText + "\n\n*O que deseja fazer?*\n\n";
    if (hasEnoughPoints) {
        fallbackText += `1️⃣ ✅ Finalizar Compra com Pontos\n`;
    }
    fallbackText += `0️⃣ 💵 Voltar para valores em ${symbol}`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_pp_cart_action',
        stateData: { totalInPP }
    });
}

module.exports = {
    sendOfferSections,
    sendOfferList,
    sendOfferDetails,
    sendCartView,
    sendCartViewWithPowerPoints,
    calculateSpherePrice,
    sendSphereSections,
    sendSphereList,
    askForSphereQuantity,
    sendSpherePurchaseDetails,
    sendAccountList,
    sendAccountDetails
};

// === FLUXO DE COMPRA DE ESFERAS ===

function calculateSpherePrice(rarity, quantity) {
    const config = SPHERE_PRICING[rarity];
    if (!config) return 0;

    const packsOf100 = Math.floor(quantity / 100);
    let discount = packsOf100 > 0 ? packsOf100 - 1 : 0;
    if (discount > 5) discount = 5;

    let pricePer100 = config.discountRange.max - discount;
    if (pricePer100 < config.discountRange.min) {
        pricePer100 = config.discountRange.min;
    }

    const pricePerSphere = pricePer100 / 100;
    return pricePerSphere * quantity;
}


async function sendSphereSections(sock, jid) {
    const allSections = fs.readdirSync(DIRETORIO_ESFERAS)
        .filter(file => fs.statSync(path.join(DIRETORIO_ESFERAS, file)).isDirectory());

    const sectionsWithProducts = allSections.filter(section =>
        directoryHasProducts(path.join(DIRETORIO_ESFERAS, section))
    );

    if (sectionsWithProducts.length === 0) {
        await sendMessage(sock, jid, { text: "😔 No momento não temos esferas disponíveis.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }

    // Pré-calcula hasNew para cada seção (otimização de performance)
    const sectionsData = sectionsWithProducts.map((section, index) => {
        const hasNew = directoryHasNewProducts(path.join(DIRETORIO_ESFERAS, section));
        const newEmoji = hasNew ? ' (🆕)' : '';
        return { section, index, newEmoji };
    });



    // Monta o texto fallback para modo legacy
    let fallbackText = "🔮 *Seções de Esferas de Dragão*\n\nEscolha uma seção para explorar:\n\n";
    sectionsData.forEach(({ section, index, newEmoji }) => {
        fallbackText += `*${index + 1}* - ${section}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_sphere_section_choice",
        stateData: { sections: sectionsWithProducts }
    });
}

async function sendSphereList(sock, jid, sectionPath) {
    const fullPath = path.join(DIRETORIO_ESFERAS, sectionPath);
    const productFileName = `${path.basename(sectionPath)}.json`;
    const productFilePath = path.join(fullPath, productFileName);

    const products = loadJsonFile(productFilePath, []);

    const subdirectories = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && directoryHasProducts(path.join(fullPath, dirent.name)))
        .map(dirent => dirent.name);

    let menuItems = [];
    subdirectories.forEach(sub => {
        menuItems.push({ type: 'dir', name: sub, path: path.join(sectionPath, sub) });
    });
    products.forEach(product => {
        menuItems.push({ type: 'product', name: product.name, data: product });
    });

    menuItems.sort((a, b) => a.name.localeCompare(b.name));

    if (menuItems.length === 0) {
        await sendMessage(sock, jid, { text: "😔 Nenhum item ou sub-seção encontrado aqui.\n\nDigite *0* para voltar." });
        navigateTo(jid, "awaiting_sphere_choice", { menuItems: [], sectionPath });
        return;
    }



    // Monta o texto fallback para modo legacy
    let fallbackText = `🔮 *Esferas: ${sectionPath}*\n\nEscolha uma opção para explorar:\n\n`;
    menuItems.forEach((item, index) => {
        let newEmoji = '';
        if (item.type === 'dir') {
            const hasNew = directoryHasNewProducts(path.join(DIRETORIO_ESFERAS, item.path));
            if (hasNew) newEmoji = ' (🆕)';
        } else if (item.type === 'product') {
            if (isProductNew(item.data)) newEmoji = ' (🆕)';
        }
        fallbackText += `*${index + 1}* - ${item.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_sphere_choice",
        stateData: { menuItems, sectionPath }
    });
}


async function askForSphereQuantity(sock, jid, product, sectionPath) {
    const minQuantity =
        Math.ceil(100 / product.tradeRatio) * product.tradeRatio;
    let message = `🐲 *${product.name}* (${product.rarity})\n\n`;
    message += `Para este dragão, a entrega é feita via trocas em múltiplos de *${product.tradeRatio}* esferas.\n\n`;
    message += `Por favor, informe a quantidade de esferas que você deseja adquirir (mínimo de *${minQuantity}* esferas).\n\n`;
    message += `0️⃣ ↩️ Voltar à lista de dragões`;

    await sendMessage(sock, jid, { text: message });
    navigateTo(jid, "awaiting_sphere_quantity", { product, sectionPath });
}

async function sendSpherePurchaseDetails(
    sock,
    jid,
    product,
    totalSpheres,
    numTrades,
    totalPrice,
    sectionPath
) {
    const rarityName = product.rarity ?
        product.rarity.split(" ")[0] : 'desconhecida';
    const priceFormatted = `R$ ${(totalPrice || 0).toFixed(2).replace(".", ",")}`;
    let caption = `📝 *Confirmação do Pedido*\n\n`;
    caption += `🐲 *${product.name}*\n\n`;
    caption += `*Item:* ${totalSpheres} Esferas de Dragão\n`;
    caption += `*Valor Total:* ${priceFormatted}\n\n`;
    caption += `*Requisitos para a troca no jogo:*\n`;
    caption += `> • *${numTrades}* essências de troca de raridade *${rarityName}*.\n`;
    caption += `> • *${totalSpheres}* esferas de qualquer outro dragão de raridade *${rarityName}*.\n\n`;
    caption += `*O que deseja fazer?*\n\n`;
    caption += `1️⃣ ✅ Confirmar e Adicionar ao Carrinho\n`;
    caption += `2️⃣ 🔢 Alterar Quantidade\n`;
    caption += `0️⃣ ↩️ Voltar à lista de dragões`;
    try {
        if (product.image && fs.existsSync(product.image)) {
            const stats = fs.statSync(product.image);
            if (stats.size > 0) {
                const imageBuffer = fs.readFileSync(product.image);
                if (imageBuffer && imageBuffer.length > 0) {
                    await sendMessage(sock, jid, {
                        image: imageBuffer,
                        caption,
                    });
                } else {
                    await sendMessage(sock, jid, { text: caption });
                }
            } else {
                await sendMessage(sock, jid, { text: caption });
            }
        } else {
            await sendMessage(sock, jid, { text: caption });
        }
    } catch (e) {
        console.error("Falha ao enviar imagem do produto para confirmação.", e);
        await sendMessage(sock, jid, { text: caption });
    }

    navigateTo(jid, "awaiting_sphere_purchase_confirmation", {
        product,
        totalSpheres,
        numTrades,
        totalPrice,
        sectionPath,
    });
}
// === FLUXO DE COMPRA DE CONTAS ===

async function sendAccountList(sock, jid) {
    const exclusiveAccounts = state.exclusiveAccounts;
    if (exclusiveAccounts.length === 0) {
        await sendMessage(sock, jid, {
            text: "Sinto muito, não há contas disponíveis para venda no momento. Volte em breve! ⏳\n\nDigite *0* para Voltar.",
        });
        navigateTo(jid, "awaiting_buy_choice");
        return;
    }



    let fallbackText = "🐲 *Contas Exclusivas*\n\nConfira nossas contas disponíveis. Escolha uma para ver mais detalhes:\n\n";
    exclusiveAccounts.forEach((product, index) => {
        const newEmoji = isProductNew(product) ? ' (🆕)' : '';
        fallbackText += `*${index + 1}* - ${product.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText,
        state: "awaiting_account_choice",
        stateData: { accounts: exclusiveAccounts }
    });
}

async function sendAccountDetails(sock, jid, account) {
    const price = `R$ ${(account.price || 0).toFixed(2).replace(".", ",")}`;
    const newEmoji = isProductNew(account) ? ' (🆕)' : '';
    let caption = `🐲 *${account.name}${newEmoji}*\n\n`;
    caption += `${account.description}\n\n`;
    caption += `*Valor:* ${price}\n\n`;

    // Envia tudo em uma única mensagem (detalhes + opções)

    await sendInteractiveList(sock, jid, {
        fallbackText: `${caption}*O que deseja fazer?*\n\n1️⃣ 🛒 Adicionar ao Carrinho\n0️⃣ ↩️ Voltar à lista de contas`,
        state: "awaiting_add_to_cart_confirmation",
        stateData: {
            product: { ...account, type: 'conta_exclusiva' },
            type: "conta_exclusiva",
        }
    });
}
