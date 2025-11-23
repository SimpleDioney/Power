const { saveJsonFile } = require("../utils/file-io");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_HISTORICO_COMPRAS,
    ARQUIVO_CARRINHOS
} = require("../config/paths");

module.exports = {
    awaiting_menu_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProfileView, sendBuyMenu, sendSupportMenu, sendInvalidOptionMessage } = context;
        // Suporta lista interativa e modo legacy
        if (messageText === 'menu_profile' || messageText === '1') {
            await sendProfileView(sock, userJid);
        } else if (messageText === 'menu_buy' || messageText === '2') {
            await sendBuyMenu(sock, userJid);
        } else if (messageText === 'menu_support' || messageText === '3') {
            await sendSupportMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3']);
        }
    },

    awaiting_profile_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendMainMenu, sendEditProfileMenu, sendPurchaseHistory, sendGameAccountManagementMenu, sendLanguageSelectionList, sendInvalidOptionMessage, userData } = context;
        // Suporta lista interativa e modo legacy
        if (messageText === 'profile_edit' || messageText === '1') {
            await sendEditProfileMenu(sock, userJid);
        } else if (messageText === 'profile_history' || messageText === '2') {
            await sendPurchaseHistory(sock, userJid);
        } else if (messageText === 'profile_accounts' || messageText === '3') {
            await sendGameAccountManagementMenu(sock, userJid);
        } else if (messageText === 'profile_invite' || messageText === '4') {
            await sendMessage(sock, userJid, { text: "Por favor, digite o código de convite que você recebeu:" });
            navigateTo(userJid, 'awaiting_invite_code_from_profile');
        } else if (messageText === 'profile_language' || messageText === '5') {
            await sendLanguageSelectionList(sock, userJid);
            navigateTo(userJid, 'awaiting_language_choice');
        } else if (messageText === '0') {
            await sendMainMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '0']);
        }
    },

    awaiting_invite_code_from_profile: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, invitationData, ARQUIVO_USUARIOS, ARQUIVO_CONVITES } = context;
        const code = messageText.trim().toUpperCase();

        if (userData[userJid].invitedBy) {
            await sendMessage(sock, userJid, { text: "⚠️ Você já usou um código de convite anteriormente." });
            return; // Volta pro menu anterior implicitamente ou explicitamente
        }

        if (invitationData[code]) {
            const inviterJid = invitationData[code].ownerJid;
            if (inviterJid === userJid) {
                await sendMessage(sock, userJid, { text: "⚠️ Você não pode usar seu próprio código de convite." });
                return;
            }

            userData[userJid].invitedBy = inviterJid;
            userData[userJid].inviteCodeUsed = code;
            saveJsonFile(ARQUIVO_USUARIOS, userData);

            invitationData[code].uses += 1;
            saveJsonFile(ARQUIVO_CONVITES, invitationData);

            await sendMessage(sock, userJid, { text: `✅ Código de convite *${code}* aplicado com sucesso! Você ganhou benefícios exclusivos.` });
            // Notificar quem convidou
            await sendMessage(sock, inviterJid, { text: `🎉 Alguém usou seu código de convite! (*${userData[userJid].nome || userJid.split('@')[0]}*)` });

        } else {
            await sendMessage(sock, userJid, { text: "⚠️ Código de convite inválido." });
        }
        // Retorna ao perfil
        const { sendProfileView } = context;
        await sendProfileView(sock, userJid);
    },

    awaiting_history_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendOrderDetailsView, sendInvalidOptionMessage, purchaseHistoryData = {} } = context;
        const userHistory = purchaseHistoryData[userJid] || [];
        // MODO LEGACY: messageText removido - usa apenas messageText

        let choiceIndex = -1;
        if (messageText && messageText.startsWith('order_')) {
            choiceIndex = parseInt(messageText.replace('order_', '')) - 1;
        } else {
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= userHistory.length) {
                choiceIndex = choice - 1;
            }
        }

        if (choiceIndex >= 0 && choiceIndex < userHistory.length) {
            const order = userHistory[choiceIndex];
            await sendOrderDetailsView(sock, userJid, order);
        } else {
            await sendInvalidOptionMessage(sock, userJid, userHistory.map((_, i) => `${i + 1}`).concat('0'));
        }
    },

    awaiting_order_details_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, startSupportFlow } = context;
        const { order } = data;
        // Suporta lista interativa e modo legacy
        if (messageText === 'order_support' || messageText === '1') {
            await sendMessage(sock, userJid, { text: `Iniciando suporte para o pedido *#${order.id}*...` });
            await startSupportFlow(sock, userJid, order.id);
        } else if (messageText === 'order_buy_again' || messageText === '2') {
            // Lógica para comprar novamente (adicionar itens ao carrinho)
            // ...
            await sendMessage(sock, userJid, { text: "Funcionalidade 'Comprar Novamente' em desenvolvimento." });
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_add_first_game_account_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Por favor, digite um *apelido* para esta conta (ex: Principal, Smurf):" });
            navigateTo(userJid, 'awaiting_game_account_alias');
        } else if (messageText === '2') {
            // Voltar
            const { sendProfileView } = context;
            await sendProfileView(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_game_account_management_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData } = context;
        const savedAccounts = userData[userJid]?.savedAccounts || [];

        // MODO LEGACY: messageText removido - usa apenas messageText
        let choiceIndex = -1;
        if (messageText === 'add_account') {
            await sendMessage(sock, userJid, { text: "Por favor, digite um *apelido* para esta nova conta (ex: Secundária):" });
            navigateTo(userJid, 'awaiting_game_account_alias');
            return;
        }

        if (messageText && messageText.startsWith('account_')) {
            choiceIndex = parseInt(messageText.replace('account_', '')) - 1;
        } else {
            const choice = parseInt(messageText);
            if (!isNaN(choice) && choice > 0 && choice <= savedAccounts.length) {
                choiceIndex = choice - 1;
            } else if (choice === savedAccounts.length + 1) {
                // Adicionar nova conta (opção numérica)
                await sendMessage(sock, userJid, { text: "Por favor, digite um *apelido* para esta nova conta (ex: Secundária):" });
                navigateTo(userJid, 'awaiting_game_account_alias');
                return;
            }
        }

        if (choiceIndex >= 0 && choiceIndex < savedAccounts.length) {
            const account = savedAccounts[choiceIndex];
            const accountText = `👤 *Conta: ${account.alias}*\n\n` +
                `🔐 *Login:* ${account.login}\n` +
                `🔑 *Senha:* ${account.password}\n` +
                `🆔 *ID:* ${account.gameId || 'Não informado'}\n` +
                `✅ *Verificada:* ${account.verified ? 'Sim' : 'Não'}\n\n` +
                `O que deseja fazer?`;

            await sendMessage(sock, userJid, {
                text: accountText + "\n\n1️⃣ Editar\n2️⃣ Remover\n3️⃣ Verificar (Se não verificada)\n0️⃣ Voltar"
            });
            navigateTo(userJid, 'awaiting_specific_game_account_action', { accountIndex: choiceIndex });
        } else {
            await sendInvalidOptionMessage(sock, userJid, savedAccounts.map((_, i) => `${i + 1}`).concat(`${savedAccounts.length + 1}`, '0'));
        }
    },

    awaiting_specific_game_account_action: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, userData, ARQUIVO_USUARIOS, sendGameAccountManagementMenu, sendVerificationMainMenu } = context;
        const { accountIndex } = data;
        const account = userData[userJid].savedAccounts[accountIndex];

        if (messageText === '1') { // Editar
            await sendMessage(sock, userJid, { text: `Editando conta *${account.alias}*.\n\nO que deseja alterar?\n\n1️⃣ Apelido\n2️⃣ Login (Facebook)\n3️⃣ Senha\n4️⃣ ID do Jogo\n0️⃣ Cancelar` });
            navigateTo(userJid, 'awaiting_game_account_edit_field_choice', { accountIndex });
        } else if (messageText === '2') { // Remover
            userData[userJid].savedAccounts.splice(accountIndex, 1);
            saveJsonFile(ARQUIVO_USUARIOS, userData);
            await sendMessage(sock, userJid, { text: "✅ Conta removida com sucesso!" });
            await sendGameAccountManagementMenu(sock, userJid);
        } else if (messageText === '3') { // Verificar
            if (account.verified) {
                await sendMessage(sock, userJid, { text: "⚠️ Esta conta já está verificada." });
                await sendGameAccountManagementMenu(sock, userJid);
            } else {
                await sendVerificationMainMenu(sock, userJid, accountIndex);
            }
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
        }
    },

    awaiting_game_account_edit_field_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage, sendGameAccountManagementMenu } = context;
        const { accountIndex } = data;

        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Digite o novo *apelido*:" });
            navigateTo(userJid, 'awaiting_game_account_edit_input', { accountIndex, field: 'alias' });
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Digite o novo *login*:" });
            navigateTo(userJid, 'awaiting_game_account_edit_input', { accountIndex, field: 'login' });
        } else if (messageText === '3') {
            await sendMessage(sock, userJid, { text: "Digite a nova *senha*:" });
            navigateTo(userJid, 'awaiting_game_account_edit_input', { accountIndex, field: 'password' });
        } else if (messageText === '4') {
            await sendMessage(sock, userJid, { text: "Digite o novo *ID do Jogo*:" });
            navigateTo(userJid, 'awaiting_game_account_edit_input', { accountIndex, field: 'gameId' });
        } else if (messageText === '0') {
            await sendGameAccountManagementMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '0']);
        }
    },

    awaiting_game_account_edit_input: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, userData, ARQUIVO_USUARIOS, sendGameAccountManagementMenu } = context;
        const { accountIndex, field } = data;
        const newValue = messageText.trim();

        if (userData[userJid] && userData[userJid].savedAccounts && userData[userJid].savedAccounts[accountIndex]) {
            userData[userJid].savedAccounts[accountIndex][field] = newValue;
            // Se editar campos críticos, reseta verificação?
            if (['login', 'password', 'gameId'].includes(field)) {
                userData[userJid].savedAccounts[accountIndex].verified = false;
                userData[userJid].savedAccounts[accountIndex].verificationStatus = 'pending'; // ou null
                await sendMessage(sock, userJid, { text: "⚠️ Como você alterou dados de acesso, a verificação da conta foi resetada." });
            }
            saveJsonFile(ARQUIVO_USUARIOS, userData);
            await sendMessage(sock, userJid, { text: "✅ Dado atualizado com sucesso!" });
            await sendGameAccountManagementMenu(sock, userJid);
        } else {
            await sendMessage(sock, userJid, { text: "❌ Erro ao atualizar conta." });
            await sendGameAccountManagementMenu(sock, userJid);
        }
    },

    awaiting_game_account_alias: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const alias = messageText.trim();
        await sendMessage(sock, userJid, { text: `Apelido: *${alias}*. Agora, digite o *login (Facebook)* da conta:` });
        navigateTo(userJid, 'awaiting_game_account_login', { alias });
    },

    awaiting_game_account_login: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const login = messageText.trim();
        await sendMessage(sock, userJid, { text: "Login recebido. Agora, digite a *senha*:" });
        navigateTo(userJid, 'awaiting_game_account_password', { ...data, login });
    },

    awaiting_game_account_password: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const password = messageText.trim();
        await sendMessage(sock, userJid, { text: "Senha recebida. Por fim, digite o *ID do Jogo* (ou 0 se não souber):" });
        navigateTo(userJid, 'awaiting_game_account_gameid', { ...data, password });
    },

    awaiting_game_account_gameid: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, ARQUIVO_USUARIOS, sendGameAccountManagementMenu } = context;
        const gameId = messageText.trim();
        const { alias, login, password } = data;

        if (!userData[userJid].savedAccounts) userData[userJid].savedAccounts = [];

        const newAccount = {
            alias,
            login,
            password,
            gameId: gameId === '0' ? '' : gameId,
            verified: false,
            createdAt: new Date().toISOString()
        };

        userData[userJid].savedAccounts.push(newAccount);
        saveJsonFile(ARQUIVO_USUARIOS, userData);

        await sendMessage(sock, userJid, { text: `✅ Conta *${alias}* salva com sucesso! Deseja verificá-la agora para agilizar suas compras?\n\n1️⃣ Sim, verificar agora\n2️⃣ Não, verificar depois` });
        navigateTo(userJid, 'awaiting_verification_after_save', { accountIndex: userData[userJid].savedAccounts.length - 1 });
    },

    awaiting_verification_after_save: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendGameAccountManagementMenu, sendVerificationMainMenu, sendInvalidOptionMessage } = context;
        const { accountIndex } = data;
        if (messageText === '1') {
            await sendVerificationMainMenu(sock, userJid, accountIndex);
        } else if (messageText === '2') {
            await sendGameAccountManagementMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    awaiting_edit_profile_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendProfileView, sendInvalidOptionMessage } = context;
        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Por favor, digite seu novo *nome*:" });
            navigateTo(userJid, 'awaiting_new_name');
        } else if (messageText === '2') {
            await sendMessage(sock, userJid, { text: "Qual sua plataforma principal?\n\n1️⃣ Android\n2️⃣ iOS\n3️⃣ PC" });
            navigateTo(userJid, 'awaiting_new_platform_choice');
        } else if (messageText === '0') {
            await sendProfileView(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '0']);
        }
    },

    awaiting_new_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProfileView, userData, ARQUIVO_USUARIOS } = context;
        const newName = messageText.trim();
        userData[userJid].nome = newName;
        saveJsonFile(ARQUIVO_USUARIOS, userData);
        await sendMessage(sock, userJid, { text: `✅ Nome alterado para *${newName}*!` });
        await sendProfileView(sock, userJid);
    },

    awaiting_new_platform_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendProfileView, sendEditProfileMenu, sendInvalidOptionMessage } = context;
        const { userData } = state;
        let platform = "";
        if (messageText === '1') platform = "Android";
        else if (messageText === '2') platform = "iOS";
        else if (messageText === '3') platform = "PC";
        else if (messageText === '0') {
            await sendEditProfileMenu(sock, userJid);
            return;
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '0']);
            return;
        }

        userData[userJid].plataforma = platform;
        saveJsonFile(ARQUIVO_USUARIOS, userData);
        await sendMessage(sock, userJid, { text: `✅ Plataforma alterada para *${platform}*!` });
        await sendProfileView(sock, userJid);
    },

    awaiting_language_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, sendInvalidOptionMessage, sendMainMenu } = context;
        const { userData } = state;
        const choice = messageText.trim();
        let language = '';
        let languageName = '';

        if (choice === '1') {
            language = 'en';
            languageName = 'English';
        } else if (choice === '2') {
            language = 'pt';
            languageName = 'Português';
        } else if (choice === '3') {
            language = 'es';
            languageName = 'Español';
        } else if (choice === '4') {
            language = 'hi';
            languageName = 'हिंदी';
        } else if (choice === '5') {
            language = 'id';
            languageName = 'Bahasa Indonesia';
        } else if (choice === '0') {
            await sendMainMenu(sock, userJid);
            return;
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3', '4', '5', '0']);
            return;
        }

        // Save language preference
        if (userData[userJid]) {
            userData[userJid].language = language;
            saveJsonFile(ARQUIVO_USUARIOS, userData);
        }

        await sendMessage(sock, userJid, { text: `✅ Idioma alterado para *${languageName}*!` });
        await sendMainMenu(sock, userJid);
    },

    awaiting_name_for_checkout: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;
        const { userData } = state;
        const name = messageText.trim();
        userData[userJid].nome = name;
        saveJsonFile(ARQUIVO_USUARIOS, userData);
        await sendMessage(sock, userJid, { text: `Obrigado, *${name}*! Vamos prosseguir.` });
        // Retoma o fluxo de checkout
        await sendMessage(sock, userJid, { text: "📜 *Termos e Condições*\n\nAo prosseguir, você concorda com nossos termos de serviço e política de reembolso.\n\n1️⃣ Aceitar e Continuar\n2️⃣ Ler Termos Completos\n0️⃣ Cancelar" });
        navigateTo(userJid, 'awaiting_terms_confirmation');
    }
};
