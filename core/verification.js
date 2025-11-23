const {
    userData,
    verificationRequests,
    activeChats,
    userState,
    compradoresData
} = require('../state/global-state');
const { sendMessage, sendInteractiveList, navigateTo } = require('../utils/messages');
const { ARQUIVO_USUARIOS, ARQUIVO_SOLICITACOES_VERIFICACAO, ARQUIVO_CHATS_ATIVOS, DIRETORIO_TUTORIAL_VERIFY } = require('../config/paths');
const { saveJsonFile } = require('../utils/file-io');
const fs = require('fs');
const path = require('path');

async function sendVerificationMainMenu(sock, jid, accountIndex) {
    const infoText = "A fim de acelerar o processo de compra dos pacotes adquiridos, o sistema de verificação de conta veio para auxiliar nisso. Com a conta verificada, seus pedidos têm prioridade na fila em altas demandas, acesso a cupons de descontos e prioridade nos demais serviços.\n\nPara solicitar o pedido de verificação em sua conta do jogo é necessário:\n\n> • Ter uma conta do jogo logada no Facebook\n> • Ter o método de ADF pelo WhatsApp ou não possuir ADF";

    await sendMessage(sock, jid, { text: infoText });

    const fallbackText = "*Digite:*\n1️⃣ - Solicitar análise de verificação de conta\n2️⃣ - Ver tutorial do passo a passo\n0️⃣ - Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: 'awaiting_verification_main_menu_choice',
        stateData: { accountIndex }
    });
}

async function sendVerificationTutorial(sock, jid, accountIndex, fromVerificationChat = false) {
    const tutorialPath = DIRETORIO_TUTORIAL_VERIFY;
    try {
        if (fs.existsSync(tutorialPath)) {
            const files = fs.readdirSync(tutorialPath).sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || 0);
                const numB = parseInt(b.match(/\d+/)?.[0] || 0);
                return numA - numB;
            });
            for (const file of files) {
                const filePath = path.join(tutorialPath, file);
                if (fs.statSync(filePath).isFile()) {
                    // Envia imagem ou vídeo
                    const ext = path.extname(file).toLowerCase();
                    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                        await sendMessage(sock, jid, { image: { url: filePath }, caption: '' });
                    } else if (['.mp4', '.mov'].includes(ext)) {
                        await sendMessage(sock, jid, { video: { url: filePath }, caption: '' });
                    }
                }
            }
        }
    } catch (error) {
        console.error("Erro ao ler tutorial:", error);
    }

    const tutorialText = "Siga o tutorial acima para verificar sua conta."; // Placeholder simplificado

    const menuOptions = `\n\nDigite o número correspondente à sua escolha:\n*1* - Solicitar Verificação\n*0* - Voltar ao Menu Principal`;

    if (!fromVerificationChat) {
        await sendMessage(sock, jid, { text: tutorialText + menuOptions });
        navigateTo(jid, 'awaiting_tutorial_verification_choice', { accountIndex });
    } else {
        await sendMessage(sock, jid, { text: tutorialText });
        await sendMessage(sock, jid, { text: "quando concluir, solicite uma nova verificação da conta" });
    }
}

async function handleVerificationRequest(sock, jid, accountIndex) {
    const user = userData[jid];
    if (!user || !user.savedAccounts || !user.savedAccounts[accountIndex]) {
        await sendMessage(sock, jid, { text: "❌ Conta não encontrada." });
        return;
    }

    const account = user.savedAccounts[accountIndex];

    // Verifica se já existe solicitação pendente
    const existingRequest = verificationRequests.find(r => r.userJid === jid && r.accountIndex === accountIndex && r.status === 'pendente');
    if (existingRequest) {
        await sendMessage(sock, jid, { text: "⚠️ Já existe uma solicitação de verificação pendente para esta conta." });
        return;
    }

    const request = {
        id: Date.now().toString(),
        userJid: jid,
        accountIndex: accountIndex,
        accountAlias: account.alias,
        timestamp: Date.now(),
        status: 'pendente'
    };

    verificationRequests.push(request);
    saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);

    // Atualiza status da conta
    user.savedAccounts[accountIndex].verificationStatus = 'pending';
    saveJsonFile(ARQUIVO_USUARIOS, userData);

    await sendMessage(sock, jid, { text: "✅ Solicitação de verificação enviada com sucesso! Aguarde, um de nossos atendentes entrará em contato em breve." });

    // Notificar compradores (opcional, se houver lógica de notificação)
}

async function sendVerificationRequestsMenu(sock, jid) {
    const pendingRequests = verificationRequests.filter(r => r.status === 'pendente');
    const isComprador = compradoresData.hasOwnProperty(jid);

    if (pendingRequests.length === 0) {
        await sendMessage(sock, jid, { text: "🎉 Não há solicitações de verificação pendentes no momento." });
        delete userState[jid];
        return;
    }

    let menuText = `✅ *Solicitações de Verificação Pendentes* (${pendingRequests.length})\n\n`;

    if (isComprador) {
        menuText += "*Digite 1* para iniciar o atendimento da próxima solicitação na fila.\n\n";

        pendingRequests.forEach((req, index) => {
            const user = userData[req.userJid];
            const account = user?.savedAccounts?.[req.accountIndex];
            if (user && account) {
                menuText += `*${index + 1}.* ${user.nome} (Conta: ${account.alias})\n`;
            }
        });
    }

    menuText += "\n0️⃣ - Sair";

    await sendInteractiveList(sock, jid, {
        fallbackText: menuText,
        state: 'awaiting_verification_choice',
        stateData: { requests: pendingRequests }
    });
}

async function refuseVerification(sock, request, sellerJid, clientMessage, sellerMessage, options = {}) {
    const { sendTutorial = false } = options;
    const clientJid = request.userJid;

    // 1. Find and update the request/account data
    const userToUpdate = userData[clientJid];
    if (userToUpdate && userToUpdate.savedAccounts[request.accountIndex]) {
        userToUpdate.savedAccounts[request.accountIndex].verificationStatus = 'rejected';
        saveJsonFile(ARQUIVO_USUARIOS, userData);
    }

    const requestIndex = verificationRequests.findIndex(r => r.timestamp === request.timestamp);
    if (requestIndex !== -1) {
        verificationRequests[requestIndex].status = 'rejected';
        saveJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, verificationRequests);
    }

    // 2. Close chat session
    activeChats = activeChats.filter(c => !(c.sellerJid === sellerJid && c.clientJid === clientJid));
    saveJsonFile(ARQUIVO_CHATS_ATIVOS, activeChats);
    delete userState[sellerJid];
    delete userState[clientJid];

    // 3. Send confirmation to seller
    await sendMessage(sock, sellerJid, { text: sellerMessage });

    // 4. Send messages to client (slower part last)
    await sendMessage(sock, clientJid, { text: clientMessage });
    if (sendTutorial) {
        await sendVerificationTutorial(sock, clientJid, request.accountIndex, true);
    }
}

module.exports = {
    sendVerificationMainMenu,
    sendVerificationTutorial,
    handleVerificationRequest,
    sendVerificationRequestsMenu,
    refuseVerification
};
