const {
    userData,
    shopData,
    saveJsonFile,
    directoryCache,
    CACHE_TTL
} = require('../state/global-state');
const { sendMessage, sendInteractiveList, navigateTo } = require('../utils/messages');
const { getUserLanguage, formatCurrencyByLanguage } = require('../utils/translation');
const { DIRETORIO_OFERTAS, DIRETORIO_ESFERAS, DIRETORIO_CONTAS_EXCLUSIVAS } = require('../config/paths');
const fs = require('fs');
const path = require('path');

// Cache helper (duplicated from main.js for now, should be in utils)
function getCached(key, fetchFunction) {
    const now = Date.now();
    if (directoryCache.has(key)) {
        const { timestamp, data } = directoryCache.get(key);
        if (now - timestamp < CACHE_TTL) {
            return data;
        }
    }
    const data = fetchFunction();
    directoryCache.set(key, { timestamp: now, data });
    return data;
}

function loadJsonFile(filePath, defaultData = []) {
    try {
        if (fs.existsSync(filePath))
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
        console.error(`Erro ao carregar o arquivo ${filePath}:`, error);
    }
    return defaultData;
}

function isProductNew(product) {
    if (!product.createdAt) return false;
    const oneDay = 24 * 60 * 60 * 1000;
    return (Date.now() - product.createdAt) < oneDay;
}

function directoryHasProducts(directoryPath) {
    return getCached(`hasProducts:${directoryPath}`, () => {
        try {
            if (!fs.existsSync(directoryPath)) return false;
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (directoryHasProducts(path.join(directoryPath, entry.name))) return true;
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    return true;
                }
            }
        } catch (error) {
            console.error(`Erro ao verificar produtos no diretório ${directoryPath}:`, error);
        }
        return false;
    });
}

function directoryHasNewProducts(directoryPath) {
    return getCached(`hasNew:${directoryPath}`, () => {
        try {
            if (!fs.existsSync(directoryPath)) return false;
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);
                if (entry.isDirectory()) {
                    if (directoryHasNewProducts(fullPath)) {
                        return true;
                    }
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    const products = loadJsonFile(fullPath, []);
                    if (Array.isArray(products) && products.some(isProductNew)) {
                        return true;
                    }
                }
            }
        } catch (error) {
            console.error(`Erro ao verificar novos produtos no diretório ${directoryPath}:`, error);
        }
        return false;
    });
}

async function sendProductCategoryList(sock, jid) {
    const fallbackText = `📦 *Gerenciamento de Produtos*\n\nSelecione uma categoria para visualizar ou modificar:\n\n1️⃣ ⚡ Ofertas\n2️⃣ 🔮 Esferas\n3️⃣ 🐲 Contas Exclusivas\n\n0️⃣ 👑 Voltar ao Painel Administrativo`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_product_category_list"
    });
}

async function sendProductManagementBrowser(sock, jid, action = 'add', currentPath = '', productType = 'ofertas') {
    const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
    const fullPath = path.join(basePath, currentPath);

    // Ensure directory exists
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true }).sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    let menuText = `📂 *Navegador de Produtos (${productType === 'ofertas' ? 'Ofertas' : 'Esferas'})*\n`;
    menuText += `📍 Caminho: \`.../${currentPath}\`\n\n`;

    const options = [];
    let index = 1;

    entries.forEach(entry => {
        if (entry.isDirectory()) {
            menuText += `*${index}* - 📁 ${entry.name}\n`;
            options.push({ type: 'dir', name: entry.name });
            index++;
        } else if (entry.name.endsWith('.json')) {
            menuText += `*${index}* - 📄 ${entry.name}\n`;
            options.push({ type: 'file', name: entry.name });
            index++;
        }
    });

    menuText += `\n*A* - ➕ Adicionar Nova Pasta\n`;
    menuText += `*B* - ➕ Adicionar Novo Produto (JSON)\n`;
    if (currentPath !== '') {
        menuText += `*X* - ❌ Excluir Pasta Atual\n`;
    }
    menuText += `\n0️⃣ ↩️ Voltar`;

    await sendMessage(sock, jid, { text: menuText });
    navigateTo(jid, "awaiting_product_browse_choice", { action, currentPath, options, productType });
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
        // Logic for adding would be different, usually just asking for name.
        // This function seems to be for BROWSING to add/remove?
        // Based on main.js usage, it seems to be used for selecting where to add or what to remove.
        menuText = `📂 *Selecionar Seção em ${categoryName}*\n\nNavegue até onde deseja adicionar a nova seção:\n📍 Caminho atual: \`.../${currentPath || categoryName}\`\n\n`;
        options.forEach((opt, index) => {
            menuText += `*${index + 1}* - ${opt.name}\n`;
        });
        menuText += `\n*+* - Adicionar AQUI\n`;
    } else if (action === 'remove') {
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

async function sendGenericProductList(sock, jid, products, category, section) {
    let listText = `📋 *Lista de Produtos - ${category}*\n\n`;
    products.forEach((p, index) => {
        listText += `*${index + 1}* - ${p.name} (R$ ${p.price})\n`;
    });
    listText += `\n0️⃣ ↩️ Voltar`;

    await sendInteractiveList(sock, jid, {
        fallbackText: listText,
        state: "awaiting_generic_product_choice",
        stateData: { products, category, section }
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

    // Monta o menu de edição com base na categoria

    let fallbackText = infoText + `\n*O que deseja alterar?*\n\n`;
    let optionCounter = 1;
    const optionsMap = {};

    fallbackText += `*${optionCounter}* - 📝 Nome\n`;
    optionsMap[optionCounter] = 'name';
    optionCounter++;

    fallbackText += `*${optionCounter}* - 📄 Descrição\n`;
    optionsMap[optionCounter] = 'description';
    optionCounter++;

    if (category !== "esferas") {
        fallbackText += `*${optionCounter}* - 💰 Preço\n`;
        optionsMap[optionCounter] = 'price';
        optionCounter++;
    }

    fallbackText += `*${optionCounter}* - 🖼️ Imagem\n`;
    optionsMap[optionCounter] = 'image';
    optionCounter++;

    if (category === "contas_exclusivas") {
        fallbackText += `*${optionCounter}* - 📧 Login\n`;
        optionsMap[optionCounter] = 'login';
        optionCounter++;

        fallbackText += `*${optionCounter}* - 🔑 Senha\n`;
        optionsMap[optionCounter] = 'password';
        optionCounter++;
    }

    fallbackText += `\n0️⃣ ↩️ Voltar à seleção de produtos`;

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_edit_attribute_choice",
        stateData: { product, category, section, optionsMap }
    });
}

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

    let fallbackText = "⚡ *Seções de Ofertas Especiais*\n\nEscolha uma seção para explorar:\n\n";
    sectionsWithProducts.forEach((section, index) => {
        const hasNew = directoryHasNewProducts(path.join(DIRETORIO_OFERTAS, section));
        const newEmoji = hasNew ? ' (🆕)' : '';
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
    // Assuming flat structure for now based on snippet, or reading directory
    // The snippet used `productFileName = ${path.basename(sectionPath)}.json` which implies section IS the product file container?
    // Actually the snippet says: `const productFileName = ${path.basename(sectionPath)}.json;`
    // This suggests the sectionPath might point to a directory that contains a JSON with the same name?
    // Or maybe it iterates files.
    // Let's stick to the snippet logic:

    // Re-reading snippet:
    /*
    const fullPath = path.join(DIRETORIO_OFERTAS, sectionPath);
    const productFileName = `${path.basename(sectionPath)}.json`;
    const productFilePath = path.join(fullPath, productFileName);
    let products = loadJsonFile(productFilePath, []);
    */

    // It seems "sections" in offers are directories, and inside there is a JSON file with the same name as the directory?
    // Or maybe it lists subdirectories/files.
    // Let's implement a generic list if the specific JSON logic is too custom without full context.
    // But I should follow the snippet.

    const productFileName = `${path.basename(sectionPath)}.json`;
    const productFilePath = path.join(fullPath, productFileName);

    let products = [];
    if (fs.existsSync(productFilePath)) {
        products = loadJsonFile(productFilePath, []);
    } else {
        // Fallback: procura o primeiro arquivo .json no diretório
        try {
            const files = fs.readdirSync(fullPath);
            const jsonFile = files.find(file => file.endsWith('.json'));
            if (jsonFile) {
                products = loadJsonFile(path.join(fullPath, jsonFile), []);
            }
        } catch (e) {
            console.error("Erro ao listar arquivos no fallback de ofertas:", e);
        }
    }

    const validProducts = products.filter(p => !p.expiryTimestamp || p.expiryTimestamp > Date.now());

    let fallbackText = `⚡ *Ofertas - ${path.basename(sectionPath)}*\n\n`;
    validProducts.forEach((p, index) => {
        const newEmoji = isProductNew(p) ? ' (🆕)' : '';
        fallbackText += `*${index + 1}* - ${p.name}${newEmoji}\n`;
    });
    fallbackText += "\n0️⃣ ↩️ Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_offer_choice",
        stateData: { products: validProducts, sectionPath }
    });
}

async function sendOfferDetails(sock, jid, offer, sectionPath) {
    const userLang = getUserLanguage(jid);
    const price = `${await formatCurrencyByLanguage(offer.price || 0, userLang)}`;
    const newEmoji = isProductNew(offer) ? ' (🆕)' : '';
    let caption = `✨ *${offer.name}${newEmoji}*\n\n`;

    let description = offer.description;
    if (offer.price === 19.99) {
        description = `ℹ Valor mínimo de 19,99.\nPodendo ser mínimamente menor, igual ou maior que o apresentado no jogo\n\n${offer.description}`;
    }
    caption += `${description}\n\n`;
    caption += `💰 *Preço:* ${price}\n\n`;
    caption += `Deseja adicionar ao carrinho?\n\n1️⃣ Sim\n0️⃣ Voltar`;

    if (offer.image && fs.existsSync(offer.image)) {
        await sendMessage(sock, jid, {
            image: fs.readFileSync(offer.image),
            caption: caption
        });
    } else {
        await sendMessage(sock, jid, { text: caption });
    }

    navigateTo(jid, "awaiting_add_to_cart_confirmation", {
        product: offer,
        type: "oferta",
        sectionPath: sectionPath
    });
}

module.exports = {
    sendProductCategoryList,
    sendProductManagementBrowser,
    sendSectionManagementBrowser,
    sendGenericProductList,
    sendEditAttributeMenu,
    sendOfferSections,
    sendOfferList,
    sendOfferDetails,
    directoryHasNewProducts,
    directoryHasProducts,
    isProductNew
};
