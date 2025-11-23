const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_BASES_VALORES,
    ARQUIVO_RANKINGS
} = require("../config/paths");
const { FARM_PER_LEVEL } = require("../config/dragon-city-data");

module.exports = {
    awaiting_farm_dragon_choice_fallback: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, effectiveJid } = context;
        const { quantity, level } = data;

        if (messageText === '0') {
            await sendMessage(sock, userJid, { text: "❌ Operação cancelada." });
            delete context.userState[userJid];
            return;
        }

        if (messageText === '1') {
            const prodPerMin = FARM_PER_LEVEL[level] || 0;
            const totalPerMin = prodPerMin * quantity;
            const totalPerHour = totalPerMin * 60;
            const totalPerDay = totalPerHour * 24;

            const responseText = `🐉 *Resultado do Farm*\n\n` +
                `*Configuração:* ${quantity}x dragões nível ${level}\n` +
                `*Tipo:* Positivo/Negativo\n\n` +
                `📊 *Produção Estimada:*\n` +
                `• *${totalPerMin.toLocaleString('pt-BR')}* / minuto\n` +
                `• *${totalPerHour.toLocaleString('pt-BR')}* / hora\n` +
                `• *${totalPerDay.toLocaleString('pt-BR')}* / dia`;

            await sendMessage(sock, effectiveJid, { text: responseText });
            delete context.userState[userJid];
        } else {
            await sendMessage(sock, userJid, { text: "⚠️ Opção inválida. Digite *1* para calcular ou *0* para cancelar." });
        }
    },

    awaiting_edit_attribute_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        const { product, category, section, optionsMap } = data;
        let attributeToEdit = null;

        for (const [key, value] of Object.entries(optionsMap)) {
            if (messageText === value) {
                attributeToEdit = key;
                break;
            }
        }

        if (attributeToEdit) {
            let promptText = "";
            switch (attributeToEdit) {
                case 'name': promptText = "Digite o novo nome:"; break;
                case 'description': promptText = "Digite a nova descrição:"; break;
                case 'price': promptText = "Digite o novo preço de venda:"; break;
                case 'image': promptText = "Envie a nova imagem:"; break;
                case 'expiry': promptText = "Digite o novo prazo (ex: 7d, 24h) ou 'remover':"; break;
                case 'basePrices': promptText = "Digite o novo valor base para Android:"; break;
                case 'login': promptText = "Digite o novo login:"; break;
                case 'password': promptText = "Digite a nova senha:"; break;
            }
            await sendMessage(sock, userJid, { text: promptText });
            navigateTo(userJid, 'awaiting_new_attribute_value', { product, category, section, attributeToEdit });
        } else {
            await sendInvalidOptionMessage(sock, userJid, Object.values(optionsMap).concat('0'));
        }
    },

    awaiting_new_attribute_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductCategoryList, loadJsonFile, saveJsonFile, parseDuration, downloadMediaMessage, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS, DIRETORIO_CONTAS_EXCLUSIVAS, DIRETORIO_PRODUTOS, ARQUIVO_CONTAS_EXCLUSIVAS_JSON } = context;
        const { product, category, section, attributeToEdit } = data;
        let newValue = messageText;
        let updatedProduct = { ...product };
        let requiresImage = false;

        if (attributeToEdit === 'price') {
            newValue = parseFloat(newValue.replace(',', '.'));
            if (isNaN(newValue)) {
                await sendMessage(sock, userJid, { text: "Valor inválido." });
                return;
            }
        } else if (attributeToEdit === 'image') {
            if (!msg.message.imageMessage) {
                await sendMessage(sock, userJid, { text: "Por favor, envie uma imagem." });
                return;
            }
            requiresImage = true;
        } else if (attributeToEdit === 'expiry') {
            if (newValue.toLowerCase() === 'remover') {
                newValue = null;
            } else {
                const durationMs = parseDuration(newValue);
                if (!durationMs) {
                    await sendMessage(sock, userJid, { text: "Formato de prazo inválido." });
                    return;
                }
                newValue = Date.now() + durationMs;
            }
        } else if (attributeToEdit === 'basePrices') {
            const androidValue = parseFloat(newValue.replace(',', '.'));
            if (isNaN(androidValue)) {
                await sendMessage(sock, userJid, { text: "Valor inválido." });
                return;
            }
            if (!updatedProduct.basePrices) updatedProduct.basePrices = {};
            updatedProduct.basePrices.google = androidValue; // Começa com Android
            await sendMessage(sock, userJid, { text: "Valor do Android atualizado. Agora, digite o valor para PC:" });
            navigateTo(userJid, 'awaiting_edit_base_price_pc', { updatedProduct, category, section });
            return; // Retorna para não salvar o produto ainda
        }


        if (requiresImage) {
            const buffer = await downloadMediaMessage(msg, "buffer");
            const newFileName = `${updatedProduct.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpeg`;

            const imageDir = category === 'ofertas' ? path.join(DIRETORIO_OFERTAS, section) : (category === 'contas_exclusivas' ? DIRETORIO_CONTAS_EXCLUSIVAS : path.join(DIRETORIO_PRODUTOS, 'esferas', section));

            if (product.image && fs.existsSync(product.image)) {
                try { fs.unlinkSync(product.image) } catch (e) { }
            }

            const imagePath = path.join(imageDir, newFileName);
            fs.writeFileSync(imagePath, buffer);
            updatedProduct.image = imagePath;
        } else if (attributeToEdit === 'expiry') {
            updatedProduct.expiryTimestamp = newValue;
        } else {
            updatedProduct[attributeToEdit] = newValue;
        }

        let productFile;
        let products;
        const basePath = category === 'ofertas' ? DIRETORIO_OFERTAS : (category === 'esferas' ? DIRETORIO_ESFERAS : null);

        if (basePath) {
            const finalFolder = path.basename(section);
            productFile = path.join(basePath, section, `${finalFolder}.json`);
        } else if (category === 'contas_exclusivas') {
            productFile = ARQUIVO_CONTAS_EXCLUSIVAS_JSON;
        }

        products = loadJsonFile(productFile, []);
        const productIndex = products.findIndex(p => p.id === product.id);
        if (productIndex > -1) {
            products[productIndex] = updatedProduct;
            saveJsonFile(productFile, products);
            await sendMessage(sock, userJid, { text: `✅ Atributo *${attributeToEdit}* do produto *${product.name}* atualizado com sucesso!` });
            await sendProductCategoryList(sock, userJid);
        } else {
            await sendMessage(sock, userJid, { text: "❌ Erro ao encontrar o produto para atualizar." });
        }
    },

    awaiting_edit_base_price_pc: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { updatedProduct, category, section } = data;
        const pcValue = parseFloat(messageText.replace(',', '.'));
        if (isNaN(pcValue)) {
            await sendMessage(sock, userJid, { text: "Valor inválido." });
            return;
        }
        updatedProduct.basePrices.microsoft = pcValue;
        await sendMessage(sock, userJid, { text: "Valor do PC atualizado. Agora, digite o valor para iOS:" });
        navigateTo(userJid, 'awaiting_edit_base_price_ios', { updatedProduct, category, section });
    },

    awaiting_edit_base_price_ios: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductCategoryList, loadJsonFile, saveJsonFile, path, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { updatedProduct, category, section } = data;
        const iosValue = parseFloat(messageText.replace(',', '.'));
        if (isNaN(iosValue)) {
            await sendMessage(sock, userJid, { text: "Valor inválido." });
            return;
        }
        updatedProduct.basePrices.ios = iosValue;

        let productFile;
        const basePath = category === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
        const finalFolder = path.basename(section);
        productFile = path.join(basePath, section, `${finalFolder}.json`);

        let products = loadJsonFile(productFile, []);
        const productIndex = products.findIndex(p => p.id === updatedProduct.id);
        if (productIndex > -1) {
            products[productIndex] = updatedProduct;
            saveJsonFile(productFile, products);
            await sendMessage(sock, userJid, { text: `✅ Valores base do produto *${updatedProduct.name}* atualizados com sucesso!` });
            await sendProductCategoryList(sock, userJid);
        } else {
            await sendMessage(sock, userJid, { text: "❌ Erro ao encontrar o produto para atualizar." });
        }
    },

    awaiting_historical_ranking_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendGroupRanking } = context;
        const { period, groups } = data;

        if (messageText === '0') {
            await sendMessage(sock, userJid, { text: "❌ Operação cancelada." });
            delete context.userState[userJid];
            return;
        }

        // Verifica se é resposta de lista interativa
        let selectedIndex = -1;

        if (messageText.startsWith('ranking_group_')) {
            // Resposta da lista interativa
            selectedIndex = parseInt(messageText.replace('ranking_group_', ''));
        } else {
            // Resposta numérica normal (1, 2, 3)
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= groups.length) {
                selectedIndex = choice - 1;
            }
        }

        if (selectedIndex >= 0 && selectedIndex < groups.length) {
            const selectedGroup = groups[selectedIndex];
            await sendGroupRanking(sock, selectedGroup, period);
            delete context.userState[userJid];
        } else {
            await sendInvalidOptionMessage(sock, userJid, groups.map((_, i) => `${i + 1}`).concat('0'));
        }
    }
};
