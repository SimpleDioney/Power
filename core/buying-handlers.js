const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_CARRINHOS,
    ARQUIVO_CONTAS_EXCLUSIVAS_JSON,
    ARQUIVO_TICKETS,
    ARQUIVO_PEDIDOS,
    ARQUIVO_DADOS_LOJA
} = require("../config/paths");
const { DISCOUNT_TIERS } = require("../config/constants");


const generateOrderId = () => Date.now().toString();

module.exports = {
    awaiting_buy_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendMainMenu, sendOfferSections, sendSphereSections, sendAccountList, sendCartView, sendInvalidOptionMessage, ARQUIVO_CONTAS_EXCLUSIVAS_JSON } = context;
        // Suporta lista interativa e modo legacy
        if (messageText === 'buy_offers' || messageText === '1') {
            await sendOfferSections(sock, userJid);
        } else if (messageText === 'buy_spheres' || messageText === '2') {
            await sendSphereSections(sock, userJid);
        } else if (messageText === 'buy_accounts' || messageText === '3') {
            await sendAccountList(sock, userJid, ARQUIVO_CONTAS_EXCLUSIVAS_JSON);
        } else if (messageText === 'buy_cart' || messageText === '4') {
            await sendCartView(sock, userJid);
        } else if (messageText === '0') {
            await sendMainMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
        }
    },

    awaiting_offer_section_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendOfferList, sendInvalidOptionMessage, goBack, sendMainMenu, sendBuyMenu } = context;
        const sections = data.sections;

        // Handle "0" - go back
        if (messageText === '0') {
            const result = await goBack(sock, userJid);
            if (result === 'REQ_MAIN_MENU' && sendMainMenu) {
                await sendMainMenu(sock, userJid);
            } else if (result && result.step === 'awaiting_buy_choice' && sendBuyMenu) {
                await sendBuyMenu(sock, userJid);
            }
            return;
        }

        // Suporta tanto lista interativa (rowId) quanto modo legacy (número)
        if (messageText && messageText.startsWith('offer_section_')) {
            // Lista interativa: extrai o índice do rowId
            const index = parseInt(messageText.replace('offer_section_', ''));
            if (!isNaN(index) && index >= 0 && index < sections.length) {
                const selectedSection = sections[index];
                await sendOfferList(sock, userJid, selectedSection);
            }
        } else {
            // Modo legacy: número digitado
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= sections.length) {
                const selectedSection = sections[choice - 1];
                await sendOfferList(sock, userJid, selectedSection);
            } else {
                await sendInvalidOptionMessage(sock, userJid, sections.map((_, i) => `${i + 1}`).concat('0'));
            }
        }
    },

    awaiting_sphere_section_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendSphereList, sendInvalidOptionMessage, goBack, sendMainMenu, sendBuyMenu } = context;
        const sections = data.sections;

        // Handle "0" - go back
        if (messageText === '0') {
            const result = await goBack(sock, userJid);
            if (result === 'REQ_MAIN_MENU' && sendMainMenu) {
                await sendMainMenu(sock, userJid);
            } else if (result && result.step === 'awaiting_buy_choice' && sendBuyMenu) {
                await sendBuyMenu(sock, userJid);
            }
            return;
        }

        // Suporta tanto lista interativa (rowId) quanto modo legacy (número)
        if (messageText && messageText.startsWith('sphere_section_')) {
            // Lista interativa: extrai o índice do rowId
            const index = parseInt(messageText.replace('sphere_section_', ''));
            if (!isNaN(index) && index >= 0 && index < sections.length) {
                const selectedSection = sections[index];
                await sendSphereList(sock, userJid, selectedSection);
            }
        } else {
            // Modo legacy: número digitado
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= sections.length) {
                const selectedSection = sections[choice - 1];
                await sendSphereList(sock, userJid, selectedSection);
            } else {
                await sendInvalidOptionMessage(sock, userJid, sections.map((_, i) => `${i + 1}`).concat('0'));
            }
        }
    },

    awaiting_offer_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendOfferList, sendCartView, cartData, goBack, sendOfferSections } = context;
        // Support both 'menuItems' (cart.js) and 'products' (products.js) structures
        const menuItems = data.menuItems || [];
        const products = data.products || [];
        const items = menuItems.length > 0 ? menuItems : products;
        const { sectionPath } = data;

        // Handle "0" - go back
        if (messageText === '0') {
            const result = await goBack(sock, userJid);
            if (result === 'REQ_MAIN_MENU' && context.sendMainMenu) {
                await context.sendMainMenu(sock, userJid);
            } else if (result && result.step === 'awaiting_offer_section_choice' && sendOfferSections) {
                await sendOfferSections(sock, userJid);
            }
            return;
        }

        let choiceIndex = -1;
        if (messageText && messageText.startsWith('offer_')) {
            choiceIndex = parseInt(messageText.replace('offer_', '')) - 1;
        } else {
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= items.length) {
                choiceIndex = choice - 1;
            }
        }

        if (choiceIndex >= 0 && choiceIndex < items.length) {
            const selectedItem = items[choiceIndex];

            // If using menuItems structure (cart.js)
            if (selectedItem.type === 'dir') {
                // Navigate to subdirectory
                await sendOfferList(sock, userJid, selectedItem.path);
                return;
            } else if (selectedItem.type === 'product') {
                // It's a product in menuItems structure
                const product = selectedItem.data;

                if (product.isVariable) {
                    await sendMessage(sock, userJid, { text: `Você selecionou *${product.name}*.\n\nEste é um produto com valor variável. Deseja abrir um ticket para consultar o valor?\n\n1️⃣ Sim\n2️⃣ Não` });
                    navigateTo(userJid, 'awaiting_variable_product_ticket_confirmation', { product });
                    return;
                }

                if (!cartData[userJid] || !cartData[userJid].items) {
                    cartData[userJid] = { id: generateOrderId(), items: [], appliedCoupon: null };
                }
                cartData[userJid].items.push({ ...product, type: 'offer', quantity: 1 });
                saveJsonFile(ARQUIVO_CARRINHOS, cartData);

                await sendMessage(sock, userJid, { text: `✅ *${product.name}* adicionado ao carrinho!` });
                await sendCartView(sock, userJid);
            } else {
                // Using products structure (products.js) - direct product object
                const product = selectedItem;

                if (product.isVariable) {
                    await sendMessage(sock, userJid, { text: `Você selecionou *${product.name}*.\n\nEste é um produto com valor variável. Deseja abrir um ticket para consultar o valor?\n\n1️⃣ Sim\n2️⃣ Não` });
                    navigateTo(userJid, 'awaiting_variable_product_ticket_confirmation', { product });
                    return;
                }

                if (!cartData[userJid] || !cartData[userJid].items) {
                    cartData[userJid] = { id: generateOrderId(), items: [], appliedCoupon: null };
                }
                cartData[userJid].items.push({ ...product, type: 'offer', quantity: 1 });
                saveJsonFile(ARQUIVO_CARRINHOS, cartData);

                await sendMessage(sock, userJid, { text: `✅ *${product.name}* adicionado ao carrinho!` });
                await sendCartView(sock, userJid);
            }
        } else {
            await sendInvalidOptionMessage(sock, userJid, items.map((_, i) => `${i + 1}`).concat('0'));
        }
    },

    awaiting_sphere_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, askForSphereQuantity } = context;
        const { products } = data;
        // MODO LEGACY: messageText removido - usa apenas messageText

        let choiceIndex = -1;
        if (messageText && messageText.startsWith('sphere_')) {
            choiceIndex = parseInt(messageText.replace('sphere_', '')) - 1;
        } else {
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= products.length) {
                choiceIndex = choice - 1;
            }
        }

        if (choiceIndex >= 0 && choiceIndex < products.length) {
            const product = products[choiceIndex];
            if (product.sobEncomenda) {
                await sendMessage(sock, userJid, { text: `Você selecionou *${product.name}* (Sob Encomenda).\n\nDeseja abrir um ticket para consultar a disponibilidade?\n\n1️⃣ Sim\n2️⃣ Não` });
                navigateTo(userJid, 'awaiting_variable_product_ticket_confirmation', { product });
            } else {
                await askForSphereQuantity(sock, userJid, product);
            }
        } else {
            await sendInvalidOptionMessage(sock, userJid, products.map((_, i) => `${i + 1}`).concat('0'));
        }
    },

    awaiting_sphere_quantity: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendSpherePurchaseDetails } = context;
        const { product } = data;
        const quantity = parseInt(messageText);

        if (isNaN(quantity) || quantity <= 0) {
            await sendMessage(sock, userJid, { text: "⚠️ Quantidade inválida. Por favor, digite um número maior que 0." });
            return;
        }

        await sendSpherePurchaseDetails(sock, userJid, product, quantity);
    },

    awaiting_variable_product_ticket_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData, adminData, compradoresData, openTickets, userState } = context;
        const { product } = data;

        if (messageText === '1') {
            const ticketText = `Interesse no produto variável/sob encomenda: ${product.name}`;
            const newTicket = {
                clientJid: userJid,
                clientName: userData[userJid]?.nome || userJid.split("@")[0],
                ticketText: ticketText,
                timestamp: new Date().toISOString(),
                notificationKeys: [],
                isBuyer: !!compradoresData[userJid]
            };
            openTickets.push(newTicket);
            saveJsonFile(ARQUIVO_TICKETS, openTickets);

            await sendMessage(sock, userJid, { text: "✅ Ticket aberto! Um atendente entrará em contato em breve para passar o orçamento." });

            const adminJids = Object.keys(adminData);
            if (adminJids.length > 0) {
                let notificationText = `🚨 *NOVO TICKET DE PRODUTO* \n\n`;
                notificationText += `*Cliente:* ${newTicket.clientName}\n`;
                notificationText += `*Produto:* ${product.name}\n`;
                notificationText += `*Contato:* https://wa.me/${userJid.split("@")[0]}\n`;
                notificationText += `Para finalizar este atendimento, responda a esta mensagem com */f* ou use o painel de admin.`;
                for (const adminJid of adminJids) {
                    if (adminData[adminJid].notificacoes?.suporte) {
                        try {
                            const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                            if (sentMsg?.key) {
                                newTicket.notificationKeys.push(sentMsg.key);
                            }
                        } catch (e) {
                            console.error(`Falha ao notificar o admin ${adminJid} sobre o ticket:`, e);
                        }
                    }
                }
                saveJsonFile(ARQUIVO_TICKETS, openTickets);
            }
            delete userState[userJid];

        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Ok, cancelado." });
            delete userState[userJid]; // Volta pro menu principal implícito
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_sphere_purchase_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendCartView, cartData } = context;
        const { product, quantity } = data;

        if (messageText === '1') {
            if (!cartData[userJid] || !cartData[userJid].items) {
                cartData[userJid] = { id: generateOrderId(), items: [], appliedCoupon: null };
            }
            cartData[userJid].items.push({ ...product, type: 'sphere', quantity: quantity });
            saveJsonFile(ARQUIVO_CARRINHOS, cartData);

            await sendMessage(sock, userJid, { text: `✅ *${quantity}x ${product.name}* adicionado(s) ao carrinho!` });
            await sendCartView(sock, userJid);
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Compra cancelada." });
            delete context.userState[userJid];
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_account_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendAccountDetails, sendInvalidOptionMessage } = context;
        const { accounts } = data;
        // MODO LEGACY: messageText removido - usa apenas messageText

        let choiceIndex = -1;
        if (messageText && messageText.startsWith('account_')) {
            choiceIndex = parseInt(messageText.replace('account_', '')) - 1;
        } else {
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= accounts.length) {
                choiceIndex = choice - 1;
            }
        }

        if (choiceIndex >= 0 && choiceIndex < accounts.length) {
            await sendAccountDetails(sock, userJid, accounts[choiceIndex]);
        } else {
            await sendInvalidOptionMessage(sock, userJid, accounts.map((_, i) => `${i + 1}`).concat('0'));
        }
    },

    awaiting_add_to_cart_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendCartView, cartData, sendMainMenu } = context;
        const { product, type } = data;

        if (messageText === '1') {
            if (!cartData[userJid] || !cartData[userJid].items) {
                cartData[userJid] = { id: generateOrderId(), items: [], appliedCoupon: null };
            }
            cartData[userJid].items.push({ ...product, type: 'account', quantity: 1 });
            saveJsonFile(ARQUIVO_CARRINHOS, cartData);

            await sendMessage(sock, userJid, { text: `✅ *${product.name}* adicionado ao carrinho!` });
            await sendCartView(sock, userJid);
        } else if (messageText === '0') {
            // Go back to product list
            await sendMessage(sock, userJid, { text: "↩️ Voltando à lista de produtos..." });
            await sendMainMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '0']);
        }
    },

    awaiting_cart_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendCartView, handlePowerPointsPayment, cartData, userData } = context;
        // Suporta lista interativa e modo legacy
        if (messageText === 'cart_checkout' || messageText === '1') {
            // Verificar se o usuário tem nome cadastrado
            if (!userData[userJid]?.nome) {
                await sendMessage(sock, userJid, { text: "Para finalizar a compra, precisamos saber seu nome. Como gostaria de ser chamado?" });
                navigateTo(userJid, 'awaiting_name_for_checkout');
                return;
            }
            await sendMessage(sock, userJid, { text: "📜 *Termos e Condições*\n\nAo prosseguir, você concorda com nossos termos de serviço e política de reembolso.\n\n1️⃣ Aceitar e Continuar\n2️⃣ Ler Termos Completos\n0️⃣ Cancelar" });
            navigateTo(userJid, 'awaiting_terms_confirmation');

        } else if (messageText === 'cart_coupon' || messageText === '2') {
            await sendMessage(sock, userJid, { text: "Digite o código do cupom de desconto:" });
            navigateTo(userJid, 'awaiting_coupon_code');
        } else if (messageText === 'cart_clear' || messageText === '3') {
            delete cartData[userJid];
            saveJsonFile(ARQUIVO_CARRINHOS, cartData);
            await sendMessage(sock, userJid, { text: "🗑️ Carrinho limpo." });
            await sendCartView(sock, userJid);
        } else if (messageText === 'cart_powerpoints' || messageText === '4') {
            await handlePowerPointsPayment(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
        }
    },

    awaiting_powerpoint_purchase_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendCartView, cartData, userData, generateOrderId, pendingOrders, notifyAdmins } = context;
        const { total, items } = data;

        if (messageText === '1') {
            // Deduzir pontos
            userData[userJid].saldoPoints -= total;
            saveJsonFile(ARQUIVO_USUARIOS, userData);

            // Limpar carrinho
            delete cartData[userJid];
            saveJsonFile(ARQUIVO_CARRINHOS, cartData);

            // Criar pedido
            const orderId = generateOrderId();
            const newOrder = {
                id: orderId,
                clientJid: userJid,
                clientName: userData[userJid].nome,
                items: items,
                total: 0, // Pago com pontos
                paymentMethod: 'powerpoints',
                status: 'pending',
                createdAt: new Date().toISOString(),
                pointsSpent: total
            };

            pendingOrders.push(newOrder);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);

            await sendMessage(sock, userJid, { text: `✅ Compra realizada com sucesso usando PowerPoints! Seu pedido *#${orderId}* foi recebido.` });
            await notifyAdmins(sock, `🛍️ *NOVO PEDIDO (PowerPoints)*\n\nCliente: ${newOrder.clientName}\nValor (Pontos): ${total}\nPedido: #${orderId}`);

            delete context.userState[userJid];
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Pagamento com PowerPoints cancelado." });
            await sendCartView(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_coupon_code: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendCartView, cartData, couponData, userData } = context;
        const code = messageText.trim().toUpperCase();

        if (couponData[code]) {
            const coupon = couponData[code];

            // Validações do cupom
            if (coupon.limit && coupon.uses >= coupon.limit) {
                await sendMessage(sock, userJid, { text: "⚠️ Este cupom atingiu o limite de usos." });
                await sendCartView(sock, userJid);
                return;
            }

            // Verificar se o usuário já usou este cupom (se necessário implementar histórico de uso por usuário)
            // Por enquanto, verificação simples de limite global

            // Calcular total do carrinho para validar mínimo
            const cart = cartData[userJid] || [];
            let total = 0;
            cart.forEach(item => {
                total += item.price * item.quantity;
            });

            if (coupon.minValue && total < coupon.minValue) {
                await sendMessage(sock, userJid, { text: `⚠️ Este cupom requer um valor mínimo de compra de R$ ${coupon.minValue.toFixed(2)}.` });
                await sendCartView(sock, userJid);
                return;
            }

            // Aplicar cupom no carrinho (salvar no objeto do usuário temporariamente ou no carrinho)
            // Como a estrutura do carrinho é uma lista de itens, vamos adicionar o cupom como metadado no carrinho ou userState?
            // Melhor adicionar ao userState ou modificar a estrutura do carrinho.
            // Simplificação: Adicionar um item especial de desconto ou marcar no userState para o checkout.
            // Vamos salvar no userData temporariamente para persistir até o checkout
            if (!userData[userJid].tempCoupon) userData[userJid].tempCoupon = code;

            await sendMessage(sock, userJid, { text: `✅ Cupom *${code}* aplicado com sucesso!` });
            await sendCartView(sock, userJid);

        } else {
            await sendMessage(sock, userJid, { text: "⚠️ Cupom inválido ou expirado." });
            await sendCartView(sock, userJid);
        }
    },

    awaiting_terms_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendPaymentMethodChoice, sendCartView, cartData, userData, couponData } = context;
        if (messageText === '1') {
            // Calcular total final
            const cartObj = cartData[userJid] || { items: [] };
            const cart = Array.isArray(cartObj.items) ? cartObj.items : [];
            let total = 0;
            cart.forEach(item => {
                total += item.price * item.quantity;
            });

            // Aplicar cupom se houver
            if (userData[userJid]?.tempCoupon) {
                const code = userData[userJid].tempCoupon;
                const coupon = couponData[code];
                if (coupon) {
                    let discount = 0;
                    if (coupon.type === 'percentage') {
                        discount = total * (coupon.value / 100);
                        if (coupon.maxValue && discount > coupon.maxValue) discount = coupon.maxValue;
                    } else {
                        discount = coupon.value;
                    }
                    total -= discount;
                }
            } else if (!userData[userJid]?.hasInviteDiscount) {
                // Aplicar Desconto Progressivo (apenas se não tiver cupom e não tiver desconto de convite)
                let progressiveDiscount = null;
                for (let i = DISCOUNT_TIERS.length - 1; i >= 0; i--) {
                    if (total >= DISCOUNT_TIERS[i].threshold) {
                        progressiveDiscount = DISCOUNT_TIERS[i];
                        break;
                    }
                }
                if (progressiveDiscount) {
                    const discountAmount = total * progressiveDiscount.discount;
                    total -= discountAmount;
                }
            }

            if (total < 0) total = 0;

            await sendPaymentMethodChoice(sock, userJid, total);
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, {
                text: "📜 *Termos de Serviço*\n\nLeia nossos termos completos no link abaixo:\nhttps://bit.ly/TermosPS\n\n1. Todas as vendas são finais.\n2. Garantimos a entrega do produto conforme descrito.\n3. O suporte é fornecido para problemas relacionados à entrega.\n4. Reembolsos apenas em caso de falha na entrega comprovada.\n\n1️⃣ Aceitar e Continuar\n0️⃣ Cancelar"
            });
            // Mantém no mesmo estado
        } else if (messageText === '0') {
            await sendMessage(sock, userJid, { text: "❌ Checkout cancelado." });
            await sendCartView(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_apoiador_code_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendPaymentMethodChoice } = context;
        const { total } = data;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Por favor, digite o *código do apoiador*:" });
            navigateTo(userJid, 'awaiting_apoiador_code_input', { total });
        } else if (messageText === '2') {
            await sendPaymentMethodChoice(sock, userJid, total);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_apoiador_code_input: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendPaymentMethodChoice, apoiadoresData, userData } = context;
        const { total } = data;
        const code = messageText.trim().toUpperCase();

        if (apoiadoresData[code]) {
            userData[userJid].apoiadorCode = code;
            saveJsonFile(ARQUIVO_USUARIOS, userData);
            await sendMessage(sock, userJid, { text: `✅ Código de apoiador *${code}* aplicado!` });
            await sendPaymentMethodChoice(sock, userJid, total);
        } else {
            await sendMessage(sock, userJid, { text: `⚠️ Código *${code}* não encontrado.\n\n1️⃣ Tentar novamente\n2️⃣ Seguir sem código` });
            navigateTo(userJid, 'awaiting_apoiador_code_retry', { total });
        }
    },

    awaiting_apoiador_code_retry: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendPaymentMethodChoice } = context;
        const { total } = data;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Por favor, digite o *código do apoiador*:" });
            navigateTo(userJid, 'awaiting_apoiador_code_input', { total });
        } else if (messageText === '2') {
            await sendPaymentMethodChoice(sock, userJid, total);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_payment_method_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, startPixCheckoutProcess, startCardCheckoutProcess, sendOtherPaymentMethodsMenu, sendCartView, shopData, userData, adminData, openTickets, userState, ARQUIVO_TICKETS, ARQUIVO_USUARIOS, saveJsonFile } = context;
        const { finalTotal } = data;

        // Handle "0" - go back to cart
        if (messageText === '0') {
            await sendMessage(sock, userJid, { text: "❌ Checkout cancelado." });
            await sendCartView(sock, userJid);
            return;
        }

        // Verificar Modo de Manutenção Manual
        if (shopData.manualMaintenanceMode) {
            if (messageText === 'pay_card' || messageText === '2') {
                await sendMessage(sock, userJid, { text: "⚠️ *Pagamento com Cartão Indisponível*\n\nDevido ao modo de manutenção, pagamentos com cartão estão temporariamente suspensos. Por favor, utilize o PIX ou outro método." });
                return; // Bloqueia e mantém no menu
            }

            if (messageText === 'pay_pix' || messageText === '1') {
                // Modo manual ativado - mostrar instruções para PIX manual
                const pixMessage = `💳 *Pagamento via PIX*\n\n` +
                    `Mande o pix para essa chave e envie o comprovante do valor para criarmos seu pedido!\n\n` +
                    `💰 *Valor:* R$ ${finalTotal.toFixed(2)}\n\n` +
                    `📌 *Não se preocupe, seus pontos serão creditados.*\n\n` +
                    `_Aguardando seu comprovante..._`;
                await sendMessage(sock, userJid, { text: pixMessage });

                // Enviar chave PIX em mensagem separada para facilitar cópia
                const chavePix = shopData.chavePix || '9551929a-68da-4c1b-9033-682b1f21796d';
                await sendMessage(sock, userJid, { text: chavePix });

                // Criar ticket de suporte para processar pagamento manual
                const ticketText = `Cliente escolheu PIX (modo manual). Valor: R$ ${finalTotal.toFixed(2)}. Aguardando comprovante.`;
                const newTicket = {
                    clientJid: userJid,
                    clientName: userData[userJid]?.nome || userJid.split('@')[0],
                    ticketText,
                    timestamp: new Date().toISOString(),
                    notificationKeys: []
                };
                openTickets.push(newTicket);
                saveJsonFile(ARQUIVO_TICKETS, openTickets);

                userData[userJid].status = "em_atendimento";
                saveJsonFile(ARQUIVO_USUARIOS, userData);

                // Notificar admins
                for (const adminJid in adminData) {
                    if (adminData[adminJid].notificacoes?.suporte) {
                        try {
                            await sendMessage(sock, adminJid, {
                                text: `🚨 *PAGAMENTO PIX MANUAL* 🚨\n\n*Cliente:* ${userData[userJid]?.nome}\n*Valor:* R$ ${finalTotal.toFixed(2)}\n\nO cliente foi instruído a enviar o comprovante.`
                            });
                        } catch (e) { console.error(`Falha ao notificar admin ${adminJid}`); }
                    }
                }

                // Limpar estado do usuário para permitir envio do comprovante
                delete userState[userJid];
                return;
            }
        }

        // Fluxo Normal
        if (messageText === 'pay_pix' || messageText === '1') {
            if (shopData.manutencaoPix) {
                await sendMessage(sock, userJid, { text: "⚠️ O pagamento via PIX automático está em manutenção. Um atendente irá processar seu pagamento manualmente." });
                // Similar manual flow for manutencaoPix
                const pixMessage = `💳 *Pagamento via PIX*\n\n` +
                    `Mande o pix para essa chave e envie o comprovante do valor para criarmos seu pedido!\n\n` +
                    `💰 *Valor:* R$ ${finalTotal.toFixed(2)}\n\n` +
                    `📌 *Não se preocupe, seus pontos serão creditados.*\n\n` +
                    `_Aguardando seu comprovante..._`;
                await sendMessage(sock, userJid, { text: pixMessage });

                const chavePix = shopData.chavePix || '9551929a-68da-4c1b-9033-682b1f21796d';
                await sendMessage(sock, userJid, { text: chavePix });

                const ticketText = `Cliente escolheu PIX (modo manutenção). Valor: R$ ${finalTotal.toFixed(2)}. Aguardando comprovante.`;
                const newTicket = {
                    clientJid: userJid,
                    clientName: userData[userJid]?.nome || userJid.split('@')[0],
                    ticketText,
                    timestamp: new Date().toISOString(),
                    notificationKeys: []
                };
                openTickets.push(newTicket);
                saveJsonFile(ARQUIVO_TICKETS, openTickets);

                userData[userJid].status = "em_atendimento";
                saveJsonFile(ARQUIVO_USUARIOS, userData);

                for (const adminJid in adminData) {
                    if (adminData[adminJid].notificacoes?.suporte) {
                        try {
                            await sendMessage(sock, adminJid, {
                                text: `🚨 *PAGAMENTO PIX MANUAL* 🚨\n\n*Cliente:* ${userData[userJid]?.nome}\n*Valor:* R$ ${finalTotal.toFixed(2)}\n\nO cliente foi instruído a enviar o comprovante.`
                            });
                        } catch (e) { console.error(`Falha ao notificar admin ${adminJid}`); }
                    }
                }

                delete userState[userJid];
            } else {
                await startPixCheckoutProcess(sock, userJid, finalTotal);
            }
        } else if (messageText === 'pay_card' || messageText === '2') {
            await startCardCheckoutProcess(sock, userJid, finalTotal);
        } else if (messageText === 'pay_other' || messageText === '3') {
            await sendOtherPaymentMethodsMenu(sock, userJid, finalTotal);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
        }
    },

    awaiting_other_payment_method_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData, adminData, compradoresData, openTickets, userState } = context;
        const { finalTotal } = data;
        // Suporta lista interativa e modo legacy
        let method = "";
        if (messageText === 'pay_binance' || messageText === '1') method = "Binance Pay";
        else if (messageText === 'pay_crypto' || messageText === '2') method = "Criptomoedas (Outras)";
        else if (messageText === 'pay_paypal' || messageText === '3') method = "PayPal";
        else if (messageText === 'pay_custom' || messageText === '4') method = "Outro";
        else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
            return;
        }

        const ticketText = `Solicitação de pagamento via *${method}*. Valor total: R$ ${finalTotal.toFixed(2)}`;
        const newTicket = {
            clientJid: userJid,
            clientName: userData[userJid]?.nome || userJid.split("@")[0],
            ticketText: ticketText,
            timestamp: new Date().toISOString(),
            notificationKeys: [],
            isBuyer: !!compradoresData[userJid]
        };
        openTickets.push(newTicket);
        saveJsonFile(ARQUIVO_TICKETS, openTickets);

        await sendMessage(sock, userJid, { text: `✅ Solicitação recebida! Um atendente entrará em contato para finalizar o pagamento via ${method}.` });

        // Notificar admins (código repetido de notificação, idealmente extrair para helper)
        const adminJids = Object.keys(adminData);
        if (adminJids.length > 0) {
            let notificationText = `🚨 *NOVO TICKET DE PAGAMENTO* \n\n`;
            notificationText += `*Cliente:* ${newTicket.clientName}\n`;
            notificationText += `*Método:* ${method}\n`;
            notificationText += `*Valor:* R$ ${finalTotal.toFixed(2)}\n`;
            notificationText += `*Contato:* https://wa.me/${userJid.split("@")[0]}\n`;
            for (const adminJid of adminJids) {
                if (adminData[adminJid].notificacoes?.suporte) {
                    try {
                        const sentMsg = await sendMessage(sock, adminJid, { text: notificationText });
                        if (sentMsg?.key) newTicket.notificationKeys.push(sentMsg.key);
                    } catch (e) { }
                }
            }
            saveJsonFile(ARQUIVO_TICKETS, openTickets);
        }
        delete userState[userJid];
    },

    awaiting_pix_payment: async (sock, userJid, messageText, data, msg, context) => {
        // Este estado geralmente espera o webhook, mas se o usuário enviar comprovante ou texto...
        // Pode ser usado para tratamento manual se necessário.
        // Por enquanto, apenas informa para aguardar.
        const { sendMessage } = context;
        await sendMessage(sock, userJid, { text: "⏳ Aguardando confirmação automática do pagamento..." });
    },

    awaiting_installments_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, startCardCheckoutProcess } = context;
        const { total } = data;
        const installments = parseInt(messageText);

        if (isNaN(installments) || installments < 1 || installments > 12) {
            await sendMessage(sock, userJid, { text: "⚠️ Opção inválida. Escolha entre 1 e 12 parcelas." });
            return;
        }

        // Aqui integraria com o gateway para definir parcelas
        await sendMessage(sock, userJid, { text: `✅ Selecionado: ${installments}x. Iniciando processamento...` });
        // Redireciona para coleta de dados do cartão ou link
        await startCardCheckoutProcess(sock, userJid, total, installments);
    },

    awaiting_card_details: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        // Simulação de coleta segura (idealmente usar link externo)
        await sendMessage(sock, userJid, { text: "🔒 Para sua segurança, recomendamos o pagamento via Link. Se preferir digitar os dados aqui (não recomendado), digite o número do cartão:" });
        // ... Lógica de coleta ou redirecionamento
    },

    awaiting_pix_cpf: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, startPixCheckoutProcess } = context;
        const { total } = data;
        const cpf = messageText.replace(/\D/g, '');
        if (cpf.length !== 11) {
            await sendMessage(sock, userJid, { text: "⚠️ CPF inválido. Digite apenas os 11 números." });
            return;
        }
        // Atualiza dados do usuário com CPF se necessário
        if (context.userData[userJid]) {
            context.userData[userJid].cpf = cpf;
            saveJsonFile(ARQUIVO_USUARIOS, context.userData);
        }
        // Reinicia processo com CPF
        await startPixCheckoutProcess(sock, userJid, total, cpf);
    },

    awaiting_card_payment: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage } = context;
        await sendMessage(sock, userJid, { text: "Processando pagamento via cartão..." });
    },

    awaiting_card_payment_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage } = context;
        await sendMessage(sock, userJid, { text: "Confirmando pagamento..." });
    },

    awaiting_card_link_payment: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage } = context;
        await sendMessage(sock, userJid, { text: "⏳ Aguardando confirmação do pagamento via link..." });
    },

    awaiting_pix_email: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, startPixCheckoutProcess } = context;
        const { total, cpf } = data;
        const email = messageText.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            await sendMessage(sock, userJid, { text: "⚠️ E-mail inválido." });
            return;
        }
        await startPixCheckoutProcess(sock, userJid, total, cpf, email);
    },

    awaiting_card_email: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, startCardCheckoutProcess } = context;
        const { total, installments } = data;
        const email = messageText.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            await sendMessage(sock, userJid, { text: "⚠️ E-mail inválido." });
            return;
        }
        await startCardCheckoutProcess(sock, userJid, total, installments, email);
    },

    awaiting_id_verification_digits_from_seller: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userState } = context;
        const { orderId, correctDigits } = data;
        const enteredDigits = messageText.trim();
        const directChatState = userState[userJid].history.find(s => s.step === 'in_direct_chat');
        const partnerJid = directChatState?.data?.partnerJid;

        if (enteredDigits === correctDigits || enteredDigits === '0000') {
            await sendMessage(sock, userJid, { text: "✅ ID verificado com sucesso. Você precisa de um cartão novo?\n\n*Digite:*\n1 - Sim\n2 - Não" });
            navigateTo(userJid, 'awaiting_new_card_choice_after_login', { orderId });
        } else {
            await sendMessage(sock, userJid, { text: "❌ Os dígitos informados estão incorretos. Fale com o cliente para confirmar e use os comandos de atendimento conforme necessário." });
            if (partnerJid) {
                navigateTo(userJid, 'in_direct_chat', { partnerJid, orderId });
            } else {
                delete userState[userJid];
            }
        }
    },

    awaiting_new_card_choice_after_login: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userState, pendingOrders, pendingOrdersV } = context;
        const { orderId } = data;
        if (messageText === '1') {
            // Limpa o estado e dispara o comando /cartao
            delete userState[userJid];
            const commandMessage = { ...msg, message: { conversation: '/cartao' } };
            sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
            return; // Retorna para evitar que o fluxo continue
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Ok, prossiga com a compra sem um novo cartão." });
            const order = pendingOrders.find(o => o.atendido_por === userJid) || pendingOrdersV.find(o => o.atendido_por === userJid);
            if (order) {
                navigateTo(userJid, 'in_direct_chat', { partnerJid: order.clientJid, orderId: order.id });
            } else {
                delete userState[userJid];
            }
        } else {
            await context.sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_card_usability: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, shopData, gerenciadoresCartaoData, userState, pendingOrders, pendingOrdersV } = context;
        const { usedCard } = data;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Ótimo! Continue com o atendimento." });
            const order = pendingOrders.find(o => o.atendido_por === userJid) || pendingOrdersV.find(o => o.atendido_por === userJid);
            if (order) {
                navigateTo(userJid, 'in_direct_chat', { partnerJid: order.clientJid, orderId: order.id });
            } else {
                delete userState[userJid];
            }
        } else if (messageText === '2') {
            const cardIndex = shopData.cartoes.findIndex(c => c.id === usedCard.id);
            if (cardIndex > -1) {
                shopData.cartoes.splice(cardIndex, 1);
                saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);

                const notificationText = `🚨 *ALERTA DE CARTÃO REMOVIDO* 🚨\n\nO cartão com final \`...${usedCard.numero.slice(-4)}\` foi reportado como inutilizável e removido do sistema.\n\nPor favor, adicione novos cartões usando o comando /addcartao.`;
                for (const managerJid in gerenciadoresCartaoData) {
                    try {
                        await sendMessage(sock, managerJid, { text: notificationText });
                    } catch (e) { console.error(`Falha ao notificar gerenciador de cartão ${managerJid}`); }
                }
                if (shopData.cartoes.length === 0) {
                    await sendMessage(sock, userJid, { text: "Seu relato foi registrado e o cartão foi removido. 💳 *Atenção: Não há mais cartões disponíveis no sistema!*" });
                } else {
                    await sendMessage(sock, userJid, { text: "Seu relato foi registrado e o cartão foi removido. Solicitando um novo cartão..." });
                    const commandMessage = { ...msg, message: { conversation: '/cartao' } };
                    sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
                }

            } else {
                await sendMessage(sock, userJid, { text: "Este cartão já foi removido. Solicitando um novo..." });
                const commandMessage = { ...msg, message: { conversation: '/cartao' } };
                sock.ev.emit('messages.upsert', { messages: [commandMessage], type: 'notify' });
            }
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_new_card_number: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { personData } = data;
        const numero = messageText.replace(/\D/g, '');
        if (numero.length < 13 || numero.length > 19) {
            await sendMessage(sock, userJid, { text: "Número de cartão inválido. Tente novamente." });
            return;
        }
        await sendMessage(sock, userJid, { text: "Número recebido. Agora, por favor, envie o *CVV*." });
        navigateTo(userJid, 'awaiting_new_card_cvv', { personData, numero });
    },

    awaiting_new_card_cvv: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const cvv = messageText.replace(/\D/g, '');
        if (cvv.length < 3 || cvv.length > 4) {
            await sendMessage(sock, userJid, { text: "CVV inválido. Tente novamente." });
            return;
        }
        await sendMessage(sock, userJid, { text: "CVV recebido. Por fim, qual o *tipo* do cartão?\n\n*1* - C6\n*2* - Nubank\n*3* - Outro" });
        navigateTo(userJid, 'awaiting_new_card_type', { ...data, cvv });
    },

    awaiting_new_card_type: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendAdminPanel, shopData } = context;
        let tipo = 'outro';
        if (messageText === '1') tipo = 'c6';
        if (messageText === '2') tipo = 'nubank';

        const { personData, numero, cvv } = data;

        const now = new Date();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        let year;
        if (tipo === 'c6') {
            year = (now.getFullYear() + 9).toString().slice(-2);
        } else if (tipo === 'nubank') {
            year = (now.getFullYear() + 8).toString().slice(-2);
        } else {
            year = (now.getFullYear() + 5).toString().slice(-2);
        }
        const dataValidade = `${month}/${year}`;

        const newCard = {
            id: `card${Date.now()}`,
            nome: personData.nome,
            sobrenome: personData.sobrenome,
            numero: numero,
            nomeTitular: `${personData.nome} ${personData.sobrenome}`,
            cvv: cvv,
            dataValidade: dataValidade,
            endereco: personData.endereco,
            cidade: personData.cidade,
            estado: personData.estado,
            cep: personData.cep,
            tipo: tipo,
            responsavel: userJid // Adiciona o responsável
        };

        shopData.cartoes.push(newCard);
        saveJsonFile(ARQUIVO_DADOS_LOJA, shopData);
        await sendMessage(sock, userJid, { text: `✅ Cartão de *${newCard.nomeTitular}* com final \`${newCard.numero.slice(-4)}\` adicionado com sucesso!` });
        // Assumindo que sendAdminPanel existe no context ou deve ser importado
        if (context.sendAdminPanel) {
            await context.sendAdminPanel(sock, userJid);
        }
    },

    awaiting_correction_login: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { orderId } = data;
        const newLogin = messageText.trim();
        await sendMessage(sock, userJid, { text: "Obrigado. Agora, por favor, envie a nova *senha*." });
        navigateTo(userJid, 'awaiting_correction_password', { orderId, newLogin });
    },

    awaiting_correction_password: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { orderId, newLogin } = data;
        const newPassword = messageText.trim();
        await sendMessage(sock, userJid, { text: "Entendido. E por último, confirme o *ID da sua conta do jogo*." });
        navigateTo(userJid, 'awaiting_correction_id', { orderId, newLogin, newPassword });
    },

    awaiting_correction_id: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { orderId, newLogin, newPassword } = data;
        const newId = messageText.trim();
        const confirmationText = `Confirme os dados:\n\n*Login:* ${newLogin}\n*Senha:* ${newPassword}\n*ID:* ${newId}\n\nEstá tudo certo?\n\n1️⃣ Sim\n2️⃣ Não`;
        await sendMessage(sock, userJid, { text: confirmationText });
        navigateTo(userJid, 'awaiting_correction_confirmation', { orderId, newLogin, newPassword, newId });
    },

    awaiting_correction_confirmation: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, waitingOrders, pendingOrders, pendingOrdersV, saveJsonFile, ARQUIVO_USUARIOS, ARQUIVO_PEDIDOS, ARQUIVO_PEDIDOS_V, ARQUIVO_PEDIDOS_ESPERA } = context;
        const { orderId, newLogin, newPassword, newId } = data;

        if (messageText !== '1') {
            await sendMessage(sock, userJid, { text: "Correção cancelada. Por favor, envie o login correto novamente." });
            navigateTo(userJid, 'awaiting_correction_login', { orderId });
            return;
        }

        // Find order in waiting list
        const waitingIndex = waitingOrders.findIndex(o => o.id === orderId);
        if (waitingIndex === -1) {
            await sendMessage(sock, userJid, { text: "❌ Pedido não encontrado na lista de espera." });
            return;
        }

        const order = waitingOrders.splice(waitingIndex, 1)[0];

        // Update order with new credentials
        order.facebookLogin = newLogin;
        order.facebookPassword = newPassword;
        order.dragonCityId = newId;
        order.status = 'pendente';

        // Update saved account if exists
        const clientUser = userData[order.clientJid];
        if (clientUser && clientUser.savedAccounts) {
            const accountIndex = clientUser.savedAccounts.findIndex(acc =>
                acc.login === order.facebookLogin || acc.password === order.facebookPassword
            );
            if (accountIndex > -1) {
                clientUser.savedAccounts[accountIndex].login = newLogin;
                clientUser.savedAccounts[accountIndex].password = newPassword;
                clientUser.savedAccounts[accountIndex].gameId = newId;
            }
        }
        saveJsonFile(ARQUIVO_USUARIOS, userData);

        // Return to correct queue
        const isVariableOrder = order.items && order.items.some(item => item.isVariable);
        if (isVariableOrder) {
            pendingOrdersV.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS_V, pendingOrdersV);
        } else {
            pendingOrders.push(order);
            saveJsonFile(ARQUIVO_PEDIDOS, pendingOrders);
        }

        saveJsonFile(ARQUIVO_PEDIDOS_ESPERA, waitingOrders);

        await sendMessage(sock, userJid, { text: "✅ Dados corrigidos com sucesso! Seu pedido voltou para a fila e será atendido em breve." });

        // Notify buyers
        const buyerJids = Object.keys(context.compradoresData || {});
        const clientName = clientUser?.nome || userJid.split('@')[0];
        const notificationText = `🔔 *Cliente de Volta!*\n\nO cliente *${clientName}* corrigiu seus dados e está pronto para ser atendido. O pedido *#${order.id}* voltou para a fila.`;

        for (const buyerJid of buyerJids) {
            if (context.compradoresData[buyerJid]?.notificacoes_config?.clientesDeVolta) {
                try {
                    await sendMessage(sock, buyerJid, { text: notificationText });
                } catch (e) {
                    console.error(`Erro ao notificar comprador ${buyerJid}:`, e);
                }
            }
        }
    }
};
