const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_DADOS_LOJA,
    ARQUIVO_CONTAS_EXCLUSIVAS_JSON
} = require("../config/paths");

module.exports = {
    awaiting_discount_admin_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendCouponList, sendInvitationList, sendManageDiscountsMenu, sendInvalidOptionMessage } = context;
        // Suporta lista interativa e modo legacy
        if (messageText === 'discount_create' || messageText === '1') {
            await sendMessage(sock, userJid, { text: "Qual será o *nome* (código) do cupom? Ex: BEMVINDO10" });
            navigateTo(userJid, 'awaiting_new_coupon_name');
        } else if (messageText === 'discount_coupons' || messageText === '2') {
            await sendCouponList(sock, userJid);
        } else if (messageText === 'discount_invites' || messageText === '3') {
            await sendInvitationList(sock, userJid);
        } else if (messageText === '0') {
            await sendManageDiscountsMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
        }
    },

    awaiting_new_coupon_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, couponData } = context;
        const name = messageText.toUpperCase();
        if (couponData[name]) {
            await sendMessage(sock, userJid, { text: "⚠️ Este nome de cupom já existe. Tente outro." });
            return;
        }
        await sendMessage(sock, userJid, { text: `Nome do cupom: *${name}*.\n\nQual será o tipo de desconto?\n\n*Digite:*\n1️⃣ - Porcentagem (%)\n2️⃣ - Valor Fixo (R$)` });
        navigateTo(userJid, 'awaiting_new_coupon_type', { name });
    },

    awaiting_new_coupon_type: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        const { name } = data;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Qual a porcentagem de desconto? (apenas o número, ex: 10 para 10%)" });
            navigateTo(userJid, 'awaiting_new_coupon_value', { name, type: 'percentage' });
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Qual o valor fixo do desconto? (apenas o número, ex: 25.50)" });
            navigateTo(userJid, 'awaiting_new_coupon_value', { name, type: 'fixed' });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_new_coupon_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const value = parseFloat(messageText.replace(',', '.'));
        if (isNaN(value) || value <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido. Digite um número positivo." });
            return;
        }
        if (data.type === 'percentage') {
            await sendMessage(sock, userJid, { text: `Desconto de ${value}%. Existe um valor *máximo* de desconto em R$? (ex: 50). Digite 0 para não ter limite.` });
            navigateTo(userJid, 'awaiting_new_coupon_max_value', { ...data, value });
        } else { // fixed
            await sendMessage(sock, userJid, { text: `Desconto de R$ ${value.toFixed(2)}. Este cupom exige um valor mínimo de compra?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
            navigateTo(userJid, 'awaiting_coupon_min_value_choice', { ...data, value, maxValue: 0 });
        }
    },

    awaiting_new_coupon_max_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const maxValue = parseFloat(messageText.replace(',', '.'));
        if (isNaN(maxValue)) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor inválido." });
            return;
        }
        await sendMessage(sock, userJid, { text: "Este cupom exige um valor mínimo de compra?\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não" });
        navigateTo(userJid, 'awaiting_coupon_min_value_choice', { ...data, maxValue });
    },

    awaiting_coupon_min_value_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Qual o valor mínimo de compra para usar este cupom? (ex: 100)" });
            navigateTo(userJid, 'awaiting_new_coupon_min_value', data);
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Qual o limite de usos deste cupom? Digite 0 para usos ilimitados." });
            navigateTo(userJid, 'awaiting_new_coupon_limit', { ...data, minValue: null });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_new_coupon_min_value: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const minValue = parseFloat(messageText.replace(',', '.'));
        if (isNaN(minValue) || minValue <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Valor mínimo inválido." });
            return;
        }
        await sendMessage(sock, userJid, { text: `Valor mínimo de R$ ${minValue.toFixed(2)}. Qual o limite de usos deste cupom? Digite 0 para usos ilimitados.` });
        navigateTo(userJid, 'awaiting_new_coupon_limit', { ...data, minValue });
    },

    awaiting_new_coupon_limit: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendManageDiscountsMenu, saveJsonFile, couponData, ARQUIVO_CUPONS } = context;
        const limit = parseInt(messageText);
        if (isNaN(limit) || limit < 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Limite inválido." });
            return;
        }
        const newCoupon = {
            name: data.name,
            type: data.type,
            value: data.value,
            maxValue: data.maxValue > 0 ? data.maxValue : null,
            minValue: data.minValue,
            limit: limit > 0 ? limit : null,
            uses: 0,
            totalDiscountValue: 0
        };
        couponData[data.name] = newCoupon;
        saveJsonFile(ARQUIVO_CUPONS, couponData);
        await sendMessage(sock, userJid, { text: `✅ Cupom *${data.name}* criado com sucesso!` });
        await sendManageDiscountsMenu(sock, userJid);
    },

    awaiting_product_category_list: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendGenericProductList, sendInvalidOptionMessage, isAdmin, isProductManager, ARQUIVO_CONTAS_EXCLUSIVAS_JSON } = context;
        if (!isAdmin && !isProductManager) {
            await sendMessage(sock, userJid, { text: "🚫 Acesso restrito." });
            return;
        }
        let category = "";
        let productFile = "";
        let productType = "";
        if (messageText === "1") {
            category = "ofertas";
            productType = "ofertas";
        } else if (messageText === "2") {
            category = "esferas";
            productType = "esferas";
        } else if (messageText === "3") {
            category = "contas_exclusivas";
            productFile = ARQUIVO_CONTAS_EXCLUSIVAS_JSON;
        } else if (messageText === "0") {
            // Voltar ao painel admin
            const { sendAdminPanel } = context;
            await sendAdminPanel(sock, userJid);
            return;
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
            return;
        }

        if (productType) { // Ofertas ou Esferas
            const menuText = `O que você deseja fazer em *${category.toUpperCase()}*?\n\n1️⃣ ➕ Adicionar produto\n2️⃣ ✏️ Editar produto existente\n3️⃣ ➖ Remover produto\n4️⃣ 📂 Gerenciar Seções\n\n0️⃣ Voltar`;
            await sendMessage(sock, userJid, { text: menuText });
            navigateTo(userJid, 'awaiting_structured_product_action', { productType });
        } else { // Contas Exclusivas
            await sendGenericProductList(sock, userJid, category, productFile);
        }
    },

    awaiting_structured_product_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendProductManagementBrowser, sendInvalidOptionMessage } = context;
        const { productType } = data;
        if (messageText === '1') {
            await sendProductManagementBrowser(sock, userJid, 'add', '', productType);
        } else if (messageText === '2') {
            await sendProductManagementBrowser(sock, userJid, 'edit', '', productType);
        } else if (messageText === '3') {
            await sendProductManagementBrowser(sock, userJid, 'remove', '', productType);
        } else if (messageText === '4') {
            await sendProductManagementBrowser(sock, userJid, 'manage_sections', '', productType);
        } else if (messageText === '0') {
            // Voltar ao menu de categorias
            const { sendProductCategoryList } = context;
            await sendProductCategoryList(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
        }
    },

    awaiting_section_action_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendSectionManagementBrowser, sendInvalidOptionMessage } = context;
        const { currentPath, productType } = data;
        if (messageText === '1') { // Adicionar
            await sendSectionManagementBrowser(sock, userJid, 'add', currentPath, productType);
        } else if (messageText === '2') { // Editar
            await sendSectionManagementBrowser(sock, userJid, 'edit', currentPath, productType);
        } else if (messageText === '3') { // Remover
            await sendSectionManagementBrowser(sock, userJid, 'remove', currentPath, productType);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
        }
    },

    awaiting_section_browse_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendSectionManagementBrowser, sendInvalidOptionMessage, path } = context;
        const { action, currentPath, options, productType } = data;
        const choice = messageText.trim().toLowerCase();

        if (choice === 'x') {
            const categoryName = productType === 'ofertas' ? 'Ofertas' : 'Esferas';
            if (action === 'add') {
                await sendMessage(sock, userJid, { text: `Qual o nome da nova seção a ser criada em *${path.basename(currentPath) || categoryName}*?` });
                navigateTo(userJid, "awaiting_new_section_name", { basePath: currentPath, productType });
            } else { // remove
                const confirmationText = `Tem certeza que deseja remover a seção '*${path.basename(currentPath)}*'? 🤔\nTodas as ofertas e subseções dentro dela serão permanentemente apagadas.\n\n*Digite:*\n1️⃣ Confirmar\n2️⃣ Cancelar`;
                await sendMessage(sock, userJid, { text: confirmationText });
                navigateTo(userJid, 'awaiting_section_removal_confirmation', { sectionToRemovePath: currentPath, productType });
            }
        } else {
            const choiceIndex = parseInt(choice) - 1;
            if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < options.length) {
                const selected = options[choiceIndex];
                const newPath = path.join(currentPath, selected.name);
                if (action === 'edit') {
                    await sendMessage(sock, userJid, { text: `Digite o novo nome para a seção "*${selected.name}*":` });
                    navigateTo(userJid, "awaiting_new_section_name_for_edit", { oldPath: newPath, productType });
                } else {
                    await sendSectionManagementBrowser(sock, userJid, action, newPath, productType);
                }
            } else {
                await sendInvalidOptionMessage(sock, userJid, ['X', '0'].concat(options.map((_, i) => `${i + 1}`)));
            }
        }
    },

    awaiting_new_section_name_for_edit: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductCategoryList, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { oldPath, productType } = data;
        const newName = messageText.trim().replace(/[\/\\]/g, '');
        if (!newName) {
            await sendMessage(sock, userJid, { text: "❌ O nome da seção não pode estar vazio." });
            return;
        }
        const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
        const oldFullPath = path.join(basePath, oldPath);
        const newFullPath = path.join(path.dirname(oldFullPath), newName);

        if (fs.existsSync(newFullPath)) {
            await sendMessage(sock, userJid, { text: `⚠️ Já existe uma seção com o nome "*${newName}*". Tente outro nome.` });
            return;
        }
        fs.renameSync(oldFullPath, newFullPath);
        await sendMessage(sock, userJid, { text: `✅ Seção renomeada para "*${newName}*" com sucesso!` });
        await sendProductCategoryList(sock, userJid);
    },

    awaiting_new_section_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductCategoryList, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { basePath, productType } = data;
        const newSectionName = messageText.trim().replace(/[\/\\]/g, '');
        if (!newSectionName) {
            await sendMessage(sock, userJid, { text: "❌ O nome da seção não pode estar vazio." });
            return;
        }
        const baseDir = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
        const fullPath = path.join(baseDir, basePath, newSectionName);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            await sendMessage(sock, userJid, { text: `✅ Seção *${newSectionName}* criada com sucesso!` });
        } else {
            await sendMessage(sock, userJid, { text: `⚠️ A seção *${newSectionName}* já existe.` });
        }
        await sendProductCategoryList(sock, userJid);
    },

    awaiting_product_browse_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductManagementBrowser, sendEditAttributeMenu, sendProductCategoryList, sendInvalidOptionMessage, path } = context;
        const { action, currentPath, options, productType } = data;
        const choice = messageText.trim().toLowerCase();
        const categoryName = productType === 'ofertas' ? 'Ofertas' : 'Esferas';

        // Handle "0" - Go back
        if (choice === '0') {
            if (currentPath === '') {
                // If at root, go back to product category list
                await sendProductCategoryList(sock, userJid);
            } else {
                // Go back one level
                const parentPath = path.dirname(currentPath);
                await sendProductManagementBrowser(sock, userJid, action, parentPath === '.' ? '' : parentPath, productType);
            }
            return;
        }

        // Handle "A" - Add new folder
        if (choice === 'a') {
            await sendMessage(sock, userJid, { text: `Digite o *nome* da nova pasta em *${path.basename(currentPath) || categoryName}*:` });
            navigateTo(userJid, 'awaiting_new_folder_name', { currentPath, productType });
            return;
        }

        // Handle "B" - Add new product
        if (choice === 'b') {
            if (productType === 'esferas') {
                await sendMessage(sock, userJid, { text: `Ok, vamos adicionar a esfera em *${path.basename(currentPath) || categoryName}*.\n\nEsta é uma esfera normal ou sob encomenda?\n\n1️⃣ Normal\n2️⃣ Sob Encomenda` });
                navigateTo(userJid, "awaiting_sphere_type", { category: productType, sectionPath: currentPath });
            } else {
                await sendMessage(sock, userJid, { text: `Ok, vamos adicionar o produto em *${path.basename(currentPath) || categoryName}*.\n\nQual o *nome* do produto? ✍️` });
                navigateTo(userJid, "awaiting_new_product_name", { category: productType, sectionPath: currentPath });
            }
            return;
        }

        // Handle "X" - Delete current folder
        if (choice === 'x' && currentPath !== '') {
            await sendMessage(sock, userJid, { text: `⚠️ Tem certeza que deseja excluir a pasta *${path.basename(currentPath)}* e todo o seu conteúdo?\n\n1️⃣ Sim\n2️⃣ Não` });
            navigateTo(userJid, 'awaiting_folder_deletion_confirmation', { currentPath, productType });
            return;
        }

        // Handle numeric selection (folders or files)
        const choiceIndex = parseInt(choice) - 1;
        if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < options.length) {
            const selected = options[choiceIndex];
            if (selected.type === 'dir') {
                const newPath = path.join(currentPath, selected.name);
                await sendProductManagementBrowser(sock, userJid, action, newPath, productType);
            } else if (selected.type === 'file') {
                // Handle JSON file selection - load products from the file
                const { DIRETORIO_OFERTAS, DIRETORIO_ESFERAS, loadJsonFile } = context;
                const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
                const filePath = path.join(basePath, currentPath, selected.name);
                const products = loadJsonFile(filePath, []);

                if (!products || products.length === 0) {
                    await sendMessage(sock, userJid, { text: `⚠️ Nenhum produto encontrado em ${selected.name}.` });
                    await sendProductManagementBrowser(sock, userJid, action, currentPath, productType);
                    return;
                }

                // Show product list
                let productListText = `📦 *Produtos em ${selected.name}*\n\n`;
                products.forEach((product, index) => {
                    const priceText = product.price ? `R$ ${Number(product.price).toFixed(2).replace('.', ',')}` : 'Sob Consulta';
                    productListText += `*${index + 1}* - ${product.name} (${priceText})\n`;
                });
                productListText += `\n0️⃣ ↩️ Voltar`;

                await sendMessage(sock, userJid, { text: productListText });
                navigateTo(userJid, 'awaiting_file_product_selection', {
                    action,
                    currentPath,
                    products,
                    productType,
                    fileName: selected.name,
                    filePath
                });
            } else if (selected.type === 'product') {
                if (action === 'edit') {
                    await sendEditAttributeMenu(sock, userJid, selected.data, productType, selected.section);
                } else if (action === 'remove') {
                    const productToRemove = selected.data;
                    await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o produto "*${productToRemove.name}*"?\n\n1️⃣ Sim\n2️⃣ Não` });
                    navigateTo(userJid, "awaiting_product_removal_confirmation", { productToRemove, section: selected.section, currentPath, productType });
                }
            }
        } else {
            const validOptions = ['A', 'B', '0'].concat(options.map((_, i) => `${i + 1}`));
            if (currentPath !== '') validOptions.push('X');
            await sendInvalidOptionMessage(sock, userJid, validOptions);
        }
    },

    awaiting_new_folder_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductManagementBrowser, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { currentPath, productType } = data;
        const folderName = messageText.trim().replace(/[\/\\]/g, '');

        if (!folderName) {
            await sendMessage(sock, userJid, { text: "❌ O nome da pasta não pode estar vazio." });
            return;
        }

        const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
        const newFolderPath = path.join(basePath, currentPath, folderName);

        if (fs.existsSync(newFolderPath)) {
            await sendMessage(sock, userJid, { text: `⚠️ Já existe uma pasta com o nome "*${folderName}*".` });
        } else {
            fs.mkdirSync(newFolderPath, { recursive: true });
            await sendMessage(sock, userJid, { text: `✅ Pasta *${folderName}* criada com sucesso!` });
        }

        await sendProductManagementBrowser(sock, userJid, 'add', currentPath, productType);
    },

    awaiting_folder_deletion_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductManagementBrowser, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { currentPath, productType } = data;

        if (messageText === '1') {
            const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
            const fullPath = path.join(basePath, currentPath);

            if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                await sendMessage(sock, userJid, { text: `✅ Pasta *${path.basename(currentPath)}* e todo o seu conteúdo foram removidos.` });
            }

            // Go back to parent directory
            const parentPath = path.dirname(currentPath);
            await sendProductManagementBrowser(sock, userJid, 'add', parentPath === '.' ? '' : parentPath, productType);
        } else {
            await sendMessage(sock, userJid, { text: "Exclusão cancelada." });
            await sendProductManagementBrowser(sock, userJid, 'add', currentPath, productType);
        }
    },

    awaiting_file_product_selection: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductManagementBrowser, sendEditAttributeMenu, sendInvalidOptionMessage, path } = context;
        const { action, currentPath, products, productType, fileName, filePath } = data;
        const choice = messageText.trim();

        if (choice === '0') {
            await sendProductManagementBrowser(sock, userJid, action, currentPath, productType);
            return;
        }

        const productIndex = parseInt(choice) - 1;
        if (isNaN(productIndex) || productIndex < 0 || productIndex >= products.length) {
            await sendInvalidOptionMessage(sock, userJid, products.map((_, i) => `${i + 1}`).concat('0'));
            return;
        }

        const selectedProduct = products[productIndex];

        if (action === 'edit') {
            await sendEditAttributeMenu(sock, userJid, selectedProduct, productType, currentPath);
        } else if (action === 'remove') {
            await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o produto "*${selectedProduct.name}*"?\n\n1️⃣ Sim\n2️⃣ Não` });
            navigateTo(userJid, "awaiting_file_product_removal_confirmation", {
                productToRemove: selectedProduct,
                productIndex,
                currentPath,
                productType,
                fileName,
                filePath
            });
        }
    },

    awaiting_file_product_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductManagementBrowser, loadJsonFile, saveJsonFile, fs } = context;
        const { productToRemove, productIndex, currentPath, productType, fileName, filePath } = data;

        if (messageText === '1') {
            const products = loadJsonFile(filePath, []);

            // Remove the product
            products.splice(productIndex, 1);
            saveJsonFile(filePath, products);

            // Delete the image if it exists
            if (productToRemove.image && fs.existsSync(productToRemove.image)) {
                try {
                    fs.unlinkSync(productToRemove.image);
                    console.log(`Imagem removida: ${productToRemove.image}`);
                } catch (err) {
                    console.error(`Erro ao remover imagem ${productToRemove.image}:`, err);
                }
            }

            await sendMessage(sock, userJid, { text: `✅ Produto *"${productToRemove.name}"* removido com sucesso!` });
            await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
        } else {
            await sendMessage(sock, userJid, { text: "Remoção cancelada." });
            await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
        }
    },

    awaiting_product_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductManagementBrowser, loadJsonFile, saveJsonFile, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { productToRemove, section, currentPath, productType } = data;
        if (messageText === '1') {
            const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
            const sectionFullPath = path.join(basePath, section);
            const productFilePath = path.join(sectionFullPath, `${path.basename(section)}.json`);
            let products = loadJsonFile(productFilePath, []);
            const updatedProducts = products.filter(p => p.id !== productToRemove.id);
            saveJsonFile(productFilePath, updatedProducts);

            // Deleta a imagem se ela existir
            if (productToRemove.image && fs.existsSync(productToRemove.image)) {
                try {
                    fs.unlinkSync(productToRemove.image);
                    console.log(`Imagem removida: ${productToRemove.image}`);
                } catch (err) {
                    console.error(`Erro ao remover imagem ${productToRemove.image}:`, err);
                }
            }

            await sendMessage(sock, userJid, { text: `✅ Produto *"${productToRemove.name}"* removido com sucesso!` });
            await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
        } else {
            await sendMessage(sock, userJid, { text: "Remoção cancelada." });
            await sendProductManagementBrowser(sock, userJid, 'remove', currentPath, productType);
        }
    },

    awaiting_section_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductCategoryList, sendInvalidOptionMessage, path, fs, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS } = context;
        const { sectionToRemovePath, productType } = data;
        if (messageText === '1') {
            const basePath = productType === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
            const fullPath = path.join(basePath, sectionToRemovePath);
            if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                await sendMessage(sock, userJid, { text: `✅ Seção *${path.basename(sectionToRemovePath)}* e todo o seu conteúdo foram removidos.` });
            }
            await sendProductCategoryList(sock, userJid);
        } else if (messageText === '2' || messageText === '0') {
            await sendMessage(sock, userJid, { text: "Operação cancelada." });
            await sendProductCategoryList(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_generic_product_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        const { category, products, productFile } = data;
        const choice = parseInt(messageText);
        if (choice === 1) {
            await sendMessage(sock, userJid, { text: `✍️ Para adicionar um novo produto em *${category.toUpperCase()}*, por favor, digite o *nome* do produto:` });
            navigateTo(userJid, "awaiting_new_product_name", { category, productFile });
        } else if (choice === 2 || choice === 3) {
            let selectionText = `Qual produto você deseja ${choice === 2 ? 'editar' : 'remover'}?\n\n`;
            products.forEach((p, i) => {
                selectionText += `*${i + 1}* - ${p.name}\n`;
            });
            selectionText += '\n0️⃣ Voltar';
            await sendMessage(sock, userJid, { text: selectionText });
            navigateTo(userJid, 'awaiting_generic_product_selection', { category, products, productFile, action: choice === 2 ? 'edit' : 'remove' });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
        }
    },

    awaiting_generic_product_selection: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendGenericProductList, sendEditAttributeMenu, sendInvalidOptionMessage } = context;
        const { category, products, productFile, action } = data;
        const choiceIndex = parseInt(messageText) - 1;
        if (messageText === '0') {
            await sendGenericProductList(sock, userJid, category, productFile);
            return;
        }
        if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < products.length) {
            const product = products[choiceIndex];
            if (action === 'edit') {
                await sendEditAttributeMenu(sock, userJid, product, category, null);
            } else if (action === 'remove') {
                await sendMessage(sock, userJid, { text: `Tem certeza que deseja remover o produto "*${product.name}*"?\n\n1️⃣ Sim\n2️⃣ Não` });
                navigateTo(userJid, "awaiting_generic_product_removal_confirmation", { product, category, products, productFile, choiceIndex });
            }
        } else {
            await sendInvalidOptionMessage(sock, userJid, products.map((_, i) => `${i + 1}`).concat('0'));
        }
    },

    awaiting_generic_product_removal_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendGenericProductList, saveJsonFile } = context;
        const { product, category, products, productFile, choiceIndex } = data;
        if (messageText === '1') {
            const updatedProducts = products.filter((p, i) => i !== choiceIndex);
            saveJsonFile(productFile, updatedProducts);
            await sendMessage(sock, userJid, { text: `✅ Produto *"${product.name}"* removido com sucesso!` });
            await sendGenericProductList(sock, userJid, category, productFile);
        } else {
            await sendMessage(sock, userJid, { text: "Remoção cancelada." });
            await sendGenericProductList(sock, userJid, category, productFile);
        }
    },

    awaiting_new_product_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, isAdmin, isProductManager } = context;
        if (!isAdmin && !isProductManager) return;
        const newProductName = messageText;
        const { category } = data;
        const currentData = { ...data, newProductName };

        if (category === 'ofertas') {
            await sendMessage(sock, userJid, { text: `Nome: *${newProductName}*.\n\nEsta é uma oferta normal ou variável?\n\n1️⃣ Normal\n2️⃣ Variável` });
            navigateTo(userJid, "awaiting_offer_type", currentData);
        } else if (category === 'esferas') {
            // Este fluxo foi movido e agora começa em 'awaiting_sphere_type'
            // O nome do dragão é perguntado depois
        } else { // Contas Exclusivas
            await sendMessage(sock, userJid, { text: `Nome: *${newProductName}*. Agora, por favor, digite a *descrição* do produto:` });
            navigateTo(userJid, "awaiting_new_product_description", currentData);
        }
    },

    awaiting_offer_type: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductCategoryList, sendInvalidOptionMessage, saveJsonFile, loadJsonFile, notifyProductManagersAndAdmins, notifyOfferChannel, addEarningsToMember, userData, productManagerData, shopData, path, DIRETORIO_OFERTAS, ARQUIVO_GERENCIADORES_PRODUTO, isProductManager } = context;
        if (messageText === '1') { // Normal
            await sendMessage(sock, userJid, { text: `Ok, oferta normal. Agora, por favor, digite a *descrição* do produto:` });
            navigateTo(userJid, "awaiting_new_product_description", data);
        } else if (messageText === '2') { // Variável
            const { newProductName, category, sectionPath } = data;
            const newProduct = {
                id: Date.now().toString(),
                name: newProductName,
                description: "Oferta de valor variável, consulte o suporte.",
                price: 0,
                isVariable: true,
                createdAt: Date.now(),
            };
            const basePath = DIRETORIO_OFERTAS;
            const finalFolder = path.basename(sectionPath);
            const productFilePath = path.join(basePath, sectionPath, `${finalFolder}.json`);
            const currentProducts = loadJsonFile(productFilePath, []);
            currentProducts.push(newProduct);
            saveJsonFile(productFilePath, currentProducts);
            // Comissão para gerente de produto ao criar oferta variável
            if (category === 'ofertas' && isProductManager && productManagerData[userJid]) {
                const productManagerCommission = shopData.comissoes?.gerenciadorProduto || 3.00;
                addEarningsToMember(userJid, productManagerCommission, false);
                productManagerData[userJid].ofertasAdicionadas = (productManagerData[userJid].ofertasAdicionadas || 0) + 1;
                saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
            }
            await notifyProductManagersAndAdmins(sock, `📦 *Nova Oferta Variável Adicionada!*\n\n*Nome:* ${newProduct.name}\n*Adicionado por:* ${userData[userJid]?.nome}`);
            await notifyOfferChannel(sock, `📦 *Nova Oferta Variável!*\n\n*${newProduct.name}* foi adicionada. Confira nosso catálogo!`);
            await sendMessage(sock, userJid, { text: `✅ Oferta variável *"${newProduct.name}"* adicionada com sucesso!` });
            await sendProductCategoryList(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_sphere_type: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        if (messageText === '1') { // Normal
            await sendMessage(sock, userJid, { text: "Qual o nome do dragão?" });
            navigateTo(userJid, "awaiting_sphere_dragon_name", { ...data, sobEncomenda: false });
        } else if (messageText === '2') { // Sob Encomenda
            await sendMessage(sock, userJid, { text: "Qual o nome do dragão?" });
            navigateTo(userJid, "awaiting_sphere_dragon_name", { ...data, sobEncomenda: true });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_sphere_dragon_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const dragonName = messageText;
        await sendMessage(sock, userJid, { text: `Nome do dragão: *${dragonName}*. Agora, digite a descrição:` });
        navigateTo(userJid, "awaiting_sphere_description", { ...data, newProductName: dragonName });
    },

    awaiting_sphere_description: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const description = messageText;
        await sendMessage(sock, userJid, { text: `Descrição adicionada. Qual a raridade do dragão?\n\n1️⃣ Lendário\n2️⃣ Mítico\n3️⃣ Heroico` });
        navigateTo(userJid, "awaiting_sphere_rarity_choice", { ...data, newProductDescription: description });
    },

    awaiting_sphere_rarity_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        let rarity = '';
        let tradeRatio = 0;
        if (messageText === '1') { rarity = 'Lendário'; tradeRatio = 7; }
        else if (messageText === '2') { rarity = 'Mítico'; tradeRatio = 6; }
        else if (messageText === '3') { rarity = 'Heroico'; tradeRatio = 5; }
        else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3']);
            return;
        }
        await sendMessage(sock, userJid, { text: `Raridade: *${rarity}*. Proporção de troca definida para *${tradeRatio}*.\nAgora, envie a imagem do dragão (ou digite 'pular').` });
        navigateTo(userJid, "awaiting_product_image", { ...data, rarity, tradeRatio });
    },

    awaiting_new_product_description: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, getUserLanguage, formatCurrencyByLanguage, loadJsonFile, ARQUIVO_BASES_VALORES, isAdmin, isProductManager } = context;
        if (!isAdmin && !isProductManager) return;
        const newProductDescription = messageText;
        const currentData = { ...data, newProductDescription };

        if (data.category === 'ofertas') {
            let basesText = "📊 *Bases de Valores Disponíveis*\n\n";
            let basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);

            if (basesValores && basesValores.length > 0) {
                const langBase = getUserLanguage(userJid);
                for (let index = 0; index < basesValores.length; index++) {
                    const base = basesValores[index];
                    const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                    const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                    const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                    const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                    basesText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                    basesText += `   (Venda/Android/PC/iOS)\n\n`;
                }
            } else {
                basesText += "Nenhuma base cadastrada ainda.\n\n";
            }

            basesText += "*X* - 🆕 Adicionar nova base\n";
            basesText += "*X2* - 🗑️ Excluir uma base\n\n";
            basesText += "Digite o número da base que deseja utilizar ou X/X2:";

            await sendMessage(sock, userJid, { text: basesText });
            navigateTo(userJid, "awaiting_value_base_choice", currentData);

        } else if (data.category === 'contas_exclusivas') {
            await sendMessage(sock, userJid, { text: `Descrição adicionada. Agora, por favor, digite o *login* da conta:` });
            navigateTo(userJid, "awaiting_new_account_login", currentData);
        }
    },

    awaiting_value_base_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, getUserLanguage, formatCurrencyByLanguage, loadJsonFile, ARQUIVO_BASES_VALORES, shopData, isAdmin, isProductManager } = context;
        if (!isAdmin && !isProductManager) return;
        const inputText = messageText.trim().toUpperCase();

        // Recarregar basesValores para garantir sincronização com o arquivo
        let basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);
        // Garantir estrutura esperada: basesValores deve ser um array
        basesValores = Array.isArray(basesValores) ? basesValores : [];

        // Tratar opção X - Adicionar nova base
        if (inputText === 'X') {
            await sendMessage(sock, userJid, { text: `🆕 Criando nova base de valores.\n\nDigite o preço base para *Android / Play Store* (use 0 se não aplicável):` });
            navigateTo(userJid, "awaiting_new_product_price_android", { ...data, criarNovaBase: true });
            return;
        }

        // Tratar opção X2 - Excluir uma base
        if (inputText === 'X2') {
            if (basesValores.length === 0) {
                await sendMessage(sock, userJid, { text: `⚠️ Não há bases cadastradas para excluir.` });
                return;
            }

            let basesListText = "🗑️ *Excluir Base de Valores*\n\nSelecione o número da base que deseja excluir:\n\n";
            const langBase = getUserLanguage(userJid);
            for (let index = 0; index < basesValores.length; index++) {
                const base = basesValores[index];
                const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                basesListText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                basesListText += `   (Venda/Android/PC/iOS)\n\n`;
            }
            basesListText += "Digite o número da base que deseja excluir ou *0* para cancelar:";
            await sendMessage(sock, userJid, { text: basesListText });
            navigateTo(userJid, "awaiting_base_to_delete", data);
            return;
        }

        // Tentar parsear como número para escolher uma base existente
        const choice = parseInt(inputText);

        if (isNaN(choice) || choice < 1 || choice > basesValores.length) {
            await sendMessage(sock, userJid, { text: `⚠️ Opção inválida. Digite um número entre 1 e ${basesValores.length}, ou *X* para adicionar, ou *X2* para excluir.` });
            return;
        }

        // Usar base existente
        const baseEscolhida = basesValores[choice - 1];

        // Verificar se a base existe e tem as propriedades necessárias
        if (!baseEscolhida || typeof baseEscolhida !== 'object') {
            await sendMessage(sock, userJid, { text: `❌ Erro: Base de valores não encontrada. Tente novamente.` });
            return;
        }

        // Garantir que as propriedades de preço existam com valores padrão
        const precoAndroid = Number(baseEscolhida.precoAndroid || 0);
        const precoPc = Number(baseEscolhida.precoPc || 0);
        const precoIos = Number(baseEscolhida.precoIos || 0);

        if (precoAndroid === 0 && precoPc === 0 && precoIos === 0) {
            await sendMessage(sock, userJid, { text: `❌ Erro: Base de valores inválida (todos os preços são zero). Tente outra base.` });
            return;
        }

        const discountPercentage = shopData.descontoAutomaticoOferta || 30;
        let calculatedPrice = precoAndroid - (precoAndroid * (discountPercentage / 100));
        const compraMinima = shopData.compraMinima || 20;

        if (calculatedPrice < compraMinima) {
            calculatedPrice = compraMinima - 0.01;
        } else {
            calculatedPrice = Math.floor(calculatedPrice) + 0.99;
        }

        const langBase2 = getUserLanguage(userJid);
        const vendaSelFmt = await formatCurrencyByLanguage(calculatedPrice || 0, langBase2);
        const androidSelFmt = await formatCurrencyByLanguage(precoAndroid || 0, langBase2);
        const pcSelFmt = await formatCurrencyByLanguage(precoPc || 0, langBase2);
        const iosSelFmt = await formatCurrencyByLanguage(precoIos || 0, langBase2);
        await sendMessage(sock, userJid, { text: `✅ Base de valores selecionada!\n\n💰 Preço de venda: ${vendaSelFmt}\n📱 Android: ${androidSelFmt}\n💻 PC: ${pcSelFmt}\n🍎 iOS: ${iosSelFmt}\n\nAgora, envie a imagem da oferta (ou digite 'pular').` });
        navigateTo(userJid, "awaiting_product_image", {
            ...data,
            androidPrice: precoAndroid,
            microsoftPrice: precoPc,
            iosPrice: precoIos,
            newProductPrice: calculatedPrice
        });
    },

    awaiting_base_to_delete: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, getUserLanguage, formatCurrencyByLanguage, loadJsonFile, saveJsonFile, ARQUIVO_BASES_VALORES, isAdmin, isProductManager } = context;
        if (!isAdmin && !isProductManager) return;
        const choice = parseInt(messageText.trim());

        // Recarregar basesValores
        let basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);
        basesValores = Array.isArray(basesValores) ? basesValores : [];

        if (choice === 0) {
            await sendMessage(sock, userJid, { text: "❌ Operação cancelada." });
            // Voltar para a seleção de base
            let basesText = "📊 *Bases de Valores Disponíveis*\n\n";
            if (basesValores && basesValores.length > 0) {
                const langBase = getUserLanguage(userJid);
                for (let index = 0; index < basesValores.length; index++) {
                    const base = basesValores[index];
                    const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                    const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                    const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                    const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                    basesText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                    basesText += `   (Venda/Android/PC/iOS)\n\n`;
                }
            } else {
                basesText += "Nenhuma base cadastrada ainda.\n\n";
            }
            basesText += "*X* - 🆕 Adicionar nova base\n";
            basesText += "*X2* - 🗑️ Excluir uma base\n\n";
            basesText += "Digite o número da base que deseja utilizar ou X/X2:";
            await sendMessage(sock, userJid, { text: basesText });
            navigateTo(userJid, "awaiting_value_base_choice", data);
            return;
        }

        if (isNaN(choice) || choice < 1 || choice > basesValores.length) {
            await sendMessage(sock, userJid, { text: "⚠️ Opção inválida." });
            return;
        }

        // Remover a base selecionada
        basesValores.splice(choice - 1, 1);
        saveJsonFile(ARQUIVO_BASES_VALORES, basesValores);

        await sendMessage(sock, userJid, { text: "✅ Base de valores removida com sucesso!" });

        // Voltar para a seleção de base
        let basesText = "📊 *Bases de Valores Disponíveis*\n\n";
        if (basesValores && basesValores.length > 0) {
            const langBase = getUserLanguage(userJid);
            for (let index = 0; index < basesValores.length; index++) {
                const base = basesValores[index];
                const vendaFmt = await formatCurrencyByLanguage(Number(base.precoVenda || 0), langBase);
                const androidFmt = await formatCurrencyByLanguage(Number(base.precoAndroid || 0), langBase);
                const pcFmt = await formatCurrencyByLanguage(Number(base.precoPc || 0), langBase);
                const iosFmt = await formatCurrencyByLanguage(Number(base.precoIos || 0), langBase);
                basesText += `${index + 1} - ${vendaFmt} / ${androidFmt} / ${pcFmt} / ${iosFmt}\n`;
                basesText += `   (Venda/Android/PC/iOS)\n\n`;
            }
        } else {
            basesText += "Nenhuma base cadastrada ainda.\n\n";
        }
        basesText += "*X* - 🆕 Adicionar nova base\n";
        basesText += "*X2* - 🗑️ Excluir uma base\n\n";
        basesText += "Digite o número da base que deseja utilizar ou X/X2:";
        await sendMessage(sock, userJid, { text: basesText });
        navigateTo(userJid, "awaiting_value_base_choice", data);
    },

    awaiting_product_image: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProductCategoryList, loadJsonFile, saveJsonFile, path, fs, downloadMediaMessage, DIRETORIO_MEDIA, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS, DIRETORIO_CONTAS_EXCLUSIVAS, isAdmin, isProductManager, userData } = context;
        if (!isAdmin && !isProductManager) return;

        let imagePath = "";
        let mediaDir = DIRETORIO_MEDIA;

        if (data.category === 'contas_exclusivas') {
            mediaDir = DIRETORIO_CONTAS_EXCLUSIVAS;
        } else if (data.category === 'esferas') {
            mediaDir = path.join(DIRETORIO_ESFERAS, data.sectionPath);
        } else if (data.category === 'ofertas') {
            mediaDir = path.join(DIRETORIO_OFERTAS, data.sectionPath);
        }

        // Ensure directory exists
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        if (msg.message.imageMessage) {
            try {
                const buffer = await downloadMediaMessage(msg, "buffer");
                const fileName = `${data.newProductName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpeg`;
                imagePath = path.join(mediaDir, fileName);
                fs.writeFileSync(imagePath, buffer);
                await sendMessage(sock, userJid, { text: "✅ Imagem recebida!" });
            } catch (error) {
                console.error('Erro ao baixar imagem:', error);
                await sendMessage(sock, userJid, { text: "❌ Erro ao processar a imagem. Por favor, tente novamente ou digite 'pular'." });
                return;
            }
        } else if (messageText.toLowerCase() === "pular") {
            await sendMessage(sock, userJid, { text: "🖼️ Imagem ignorada." });
        } else {
            await sendMessage(sock, userJid, { text: "⚠️ Por favor, envie uma imagem ou digite 'pular'." });
            return;
        }

        const currentData = { ...data, imagePath };

        if (data.category === 'ofertas') {
            // Se os preços já foram definidos (usou base existente), vai para prazo de validade
            if (data.androidPrice && data.microsoftPrice && data.iosPrice) {
                await sendMessage(sock, userJid, { text: `Imagem recebida! Agora, digite o *prazo de validade* (ex: 7d, 24h, 30m) ou 'pular':` });
                navigateTo(userJid, "awaiting_offer_expiry", currentData);
            } else {
                // Senão, continua o fluxo normal de perguntar os preços
                await sendMessage(sock, userJid, { text: `Ok! Agora, qual o valor base para *PC (Microsoft)*?` });
                navigateTo(userJid, "awaiting_new_product_price_microsoft", currentData);
            }
        } else if (data.category === 'esferas') {
            const newProduct = {
                id: Date.now().toString(),
                name: data.newProductName,
                description: data.newProductDescription,
                rarity: data.rarity,
                tradeRatio: data.tradeRatio,
                image: imagePath,
                createdAt: Date.now(),
                sobEncomenda: data.sobEncomenda || false,
            };

            const basePath = DIRETORIO_ESFERAS;
            const finalFolder = path.basename(data.sectionPath);
            const productFilePath = path.join(basePath, data.sectionPath, `${finalFolder}.json`);
            const currentProducts = loadJsonFile(productFilePath, []);
            currentProducts.push(newProduct);
            saveJsonFile(productFilePath, currentProducts);

            await sendMessage(sock, userJid, { text: `✅ Esfera *"${newProduct.name}"* adicionada com sucesso!` });
            await sendProductCategoryList(sock, userJid);
        } else if (data.category === 'contas_exclusivas') {
            await sendMessage(sock, userJid, { text: `Ok! Agora, qual o *preço* do produto? (ex: 49.99)` });
            navigateTo(userJid, "awaiting_new_product_price", currentData);
        }
    },

    awaiting_offer_expiry: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProductCategoryList, loadJsonFile, saveJsonFile, parseDuration, path, isAdmin, isProductManager, productManagerData, shopData, userData, DIRETORIO_OFERTAS, DIRETORIO_ESFERAS, ARQUIVO_GERENCIADORES_PRODUTO, deleteUserState } = context;
        if (!isAdmin && !isProductManager) return;

        let expiryTimestamp = null;
        if (messageText.toLowerCase() !== 'pular') {
            const durationMs = parseDuration(messageText);
            if (!durationMs) {
                await sendMessage(sock, userJid, { text: "⚠️ Prazo de validade inválido. Por favor, use formatos como '7d', '24h', '30m' ou 'pular'." });
                return;
            }
            expiryTimestamp = Date.now() + durationMs;
        }

        const newProduct = {
            id: Date.now().toString(),
            name: data.newProductName,
            description: data.newProductDescription,
            price: data.newProductPrice,
            basePrices: {
                google: data.androidPrice,
                microsoft: data.microsoftPrice,
                ios: data.iosPrice
            },
            image: data.imagePath,
            createdAt: Date.now(),
            expiryTimestamp: expiryTimestamp,
            isVariable: false,
        };

        const basePath = data.category === 'ofertas' ? DIRETORIO_OFERTAS : DIRETORIO_ESFERAS;
        const finalFolder = path.basename(data.sectionPath);
        const productFilePath = path.join(basePath, data.sectionPath, `${finalFolder}.json`);
        const currentProducts = loadJsonFile(productFilePath, []);

        currentProducts.push(newProduct);
        saveJsonFile(productFilePath, currentProducts);

        // Adicionar comissão para gerenciador de produto se for oferta (3,00 por oferta adicionada)
        if (data.category === 'ofertas' && isProductManager && productManagerData[userJid]) {
            const productManagerCommission = shopData.comissoes?.gerenciadorProduto || 3.00;
            const { addEarningsToMember } = context;
            if (addEarningsToMember) {
                addEarningsToMember(userJid, productManagerCommission, false);
            }
            productManagerData[userJid].ofertasAdicionadas = (productManagerData[userJid].ofertasAdicionadas || 0) + 1;
            saveJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, productManagerData);
        }

        await sendMessage(sock, userJid, { text: `✅ Produto *"${newProduct.name}"* adicionado com sucesso na seção *${data.sectionPath}*!` });
        deleteUserState(userJid);
        await sendProductCategoryList(sock, userJid);
    }
};
