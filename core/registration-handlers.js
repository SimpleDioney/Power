const { saveJsonFile } = require("../utils/file-io");
const { generateInviteCode } = require("./shop-logic");
const { sendMainMenu } = require("../utils/navigation");
const state = require("../state/global-state");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_HISTORICO_COMPRAS
} = require("../config/paths");

module.exports = {
    register_name: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo } = context;

        // Ignore commands
        if (messageText.startsWith('/')) return;

        const newName = messageText;
        const platformMenu = `✅ Nome registrado como *${newName}*!\n\nAgora, por favor, informe sua *plataforma principal*:\n\n*Digite:*\n1️⃣ - Android / Play Store\n2️⃣ - Microsoft / PC\n3️⃣ - iOS / Apple Store`;
        await sendMessage(sock, userJid, { text: platformMenu });
        navigateTo(userJid, "register_platform_choice", { newName });
    },

    register_platform_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        const { newName } = data;
        const choice = messageText;
        let newPlatform = "";
        if (choice === "1") {
            newPlatform = "Android/Play Store";
        } else if (choice === "2") {
            newPlatform = "Microsoft/PC";
        } else if (choice === "3") {
            newPlatform = "iOS/Apple Store";
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2', '3']);
            navigateTo(userJid, "register_platform_choice", { newName });
            return;
        }

        const tempUserData = { newName, newPlatform };
        await sendMessage(sock, userJid, { text: `Plataforma definida como *${newPlatform}*.\n\nPor último, você possui um código de convite? 🎟️\n\n*Digite:*\n1️⃣ - Sim\n2️⃣ - Não` });
        navigateTo(userJid, "register_invitation_choice", tempUserData);
    },

    register_invitation_choice: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, sendInvalidOptionMessage } = context;
        const { userData, purchaseHistoryData } = state;

        if (messageText === '1') {
            await sendMessage(sock, userJid, { text: "Ótimo! Por favor, digite o código de convite:" });
            navigateTo(userJid, 'register_invitation_code', data);
        } else if (messageText === '2') {
            const existingData = userData[userJid] || {};
            userData[userJid] = {
                ...existingData,
                nome: data.newName,
                plataforma: data.newPlatform,
                compras: existingData.compras || 0,
                totalEconomizado: existingData.totalEconomizado || 0,
                powerPoints: existingData.powerPoints || 0,
                status: 'navegando',
                hasInviteDiscount: false,
                invitedBy: null,
                savedAccounts: existingData.savedAccounts || [],
                notificado: existingData.notificado || false,
                language: existingData.language || 'pt',
            };
            await generateInviteCode(data.newName, userJid);
            saveJsonFile(ARQUIVO_USUARIOS, userData);
            if (!purchaseHistoryData[userJid]) {
                purchaseHistoryData[userJid] = [];
                saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
            }
            await sendMessage(sock, userJid, { text: "🎉 Cadastro finalizado com sucesso! Seja bem-vindo(a) à PowerShop." });
            await sendMainMenu(sock, userJid);
        } else {
            await sendInvalidOptionMessage(sock, userJid, ['1', '2']);
        }
    },

    register_invitation_code: async (sock, userJid, messageText, data, msg, context) => {
        const { sendMessage, navigateTo, userData, saveJsonFile, purchaseHistoryData, generateInviteCode, sendMainMenu, invitationData, ARQUIVO_USUARIOS, ARQUIVO_HISTORICO_COMPRAS, ARQUIVO_CONVITES } = context;
        const code = messageText.trim().toUpperCase();
        console.log(`[Código Convite] Verificando código: "${code}" para usuário: ${userJid}`);

        // Check if user wants to skip invite code
        if (code === '0') {
            const existingData = userData[userJid] || {};
            userData[userJid] = {
                ...existingData,
                nome: data.newName,
                plataforma: data.newPlatform,
                compras: existingData.compras || 0,
                totalEconomizado: existingData.totalEconomizado || 0,
                powerPoints: existingData.powerPoints || 0,
                status: 'navegando',
                hasInviteDiscount: false,
                invitedBy: null,
                savedAccounts: existingData.savedAccounts || [],
                notificado: existingData.notificado || false,
                language: existingData.language || 'pt',
            };
            await generateInviteCode(data.newName, userJid);
            saveJsonFile(ARQUIVO_USUARIOS, userData);
            if (!purchaseHistoryData[userJid]) {
                purchaseHistoryData[userJid] = [];
                saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
            }
            await sendMessage(sock, userJid, { text: "🎉 Cadastro finalizado com sucesso! Seja bem-vindo(a) à PowerShop." });
            await sendMainMenu(sock, userJid);
            return;
        }

        if (invitationData[code] && invitationData[code].ownerJid !== userJid) {
            const inviterJid = invitationData[code].ownerJid;
            const inviterName = invitationData[code].ownerName;

            const existingData = userData[userJid] || {};
            userData[userJid] = {
                ...existingData,
                nome: data.newName,
                plataforma: data.newPlatform,
                compras: existingData.compras || 0,
                totalEconomizado: existingData.totalEconomizado || 0,
                powerPoints: existingData.powerPoints || 0,
                status: 'navegando',
                hasInviteDiscount: true,
                invitedBy: code,
                savedAccounts: existingData.savedAccounts || [],
                notificado: existingData.notificado || false,
                language: existingData.language || 'pt',
            };
            await generateInviteCode(data.newName, userJid);
            saveJsonFile(ARQUIVO_USUARIOS, userData);
            if (!purchaseHistoryData[userJid]) {
                purchaseHistoryData[userJid] = [];
                saveJsonFile(ARQUIVO_HISTORICO_COMPRAS, purchaseHistoryData);
            }

            invitationData[code].uses = (invitationData[code].uses || 0) + 1;
            invitationData[code].invitedUsers[userJid] = { registeredAt: new Date().toISOString(), completedPurchase: false };
            saveJsonFile(ARQUIVO_CONVITES, invitationData);
            await sendMessage(sock, userJid, { text: `✅ Código de *${inviterName}* aplicado! Você ganhará 5% de desconto na sua primeira compra.\n\n🎉 Cadastro finalizado! Bem-vindo(a) à PowerShop.` });
            await sendMessage(sock, inviterJid, { text: `Boas notícias! ✨ O usuário *${data.newName}* usou seu código de convite! Você receberá sua recompensa assim que ele realizar a primeira compra.` });
            await sendMainMenu(sock, userJid);

        } else {
            await sendMessage(sock, userJid, { text: "Código inválido ou é o seu próprio código! Tente novamente ou digite *0* para continuar sem um código." });
            navigateTo(userJid, 'register_invitation_code', data);
        }
    }
};
