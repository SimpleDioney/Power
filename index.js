const wppconnect = require("@wppconnect-team/wppconnect");
const state = require("./state/global-state");
const { userState } = require("./state/user-state");
state.userState = userState;
const { createBaileysCompatibleClient } = require("./services/wpp-compat");
const { loadJsonFile, saveJsonFile } = require("./utils/file-io");
const {
    ARQUIVO_USUARIOS,
    ARQUIVO_HISTORICO_COMPRAS,
    ARQUIVO_ADMINS,
    ARQUIVO_DADOS_LOJA,
    ARQUIVO_TICKETS,
    ARQUIVO_CARRINHOS,
    ARQUIVO_RANKINGS,
    ARQUIVO_COMPRADORES,
    ARQUIVO_GERENCIADORES_PRODUTO,
    ARQUIVO_GERENCIADORES_CARTAO,
    ARQUIVO_GERENCIADORES_TROCA_REGIONAL,
    ARQUIVO_APOIADORES,
    ARQUIVO_PEDIDOS,
    ARQUIVO_PEDIDOS_V,
    ARQUIVO_PEDIDOS_ESPERA,
    ARQUIVO_CUPONS,
    ARQUIVO_CONVITES,
    ARQUIVO_CHATS_ATIVOS,
    ARQUIVO_CONTAS_EXCLUSIVAS_JSON,
    ARQUIVO_EMAILS_FINALIZADOS,
    ARQUIVO_SOLICITACOES_VERIFICACAO,
    ARQUIVO_BASES_VALORES,
    OWNER_JID
} = require("./config/paths");
const { releaseBlockedEarnings, calculateNextReleaseDate } = require("./services/earnings");
const { checkAndResetRanking } = require("./core/ranking");

// Initialize State
function initializeState() {
    state.userData = loadJsonFile(ARQUIVO_USUARIOS, {});
    state.purchaseHistoryData = loadJsonFile(ARQUIVO_HISTORICO_COMPRAS, {});
    state.adminData = loadJsonFile(ARQUIVO_ADMINS, {});
    state.shopData = loadJsonFile(ARQUIVO_DADOS_LOJA, {
        vendasRealizadas: 0,
        faturamentoSemanal: 0,
        faturamentoTotal: 0,
        descontoAutomaticoOferta: 30,
        compraMinima: 20,
        chavePix: '9551929a-68da-4c1b-9033-682b1f21796d',
        manualMaintenanceMode: false,
        imagemMenu: null,
        cartoes: [],
        idChecksExpirados: 0,
        valorPerdido: 0,
        contasVerificadas: 0,
        comissoes: {
            porCompra: 8.00,
            porVerificacao: 0.50,
            admin: 0.75,
            gerenciadorProduto: 3.00,
            gerenciadorCartao: 0.75,
            gerenciadorTrocaRegional: 0.50
        },
        taxas: {
            pix: 0.99,
            cartao: {
                avista: { fixa: 0.49, percentual: 1.99 },
                parcelado: {
                    '2-6': { fixa: 0.49, percentual: 2.49 },
                    '7-12': { fixa: 0.49, percentual: 2.99 }
                }
            }
        }
    });

    // Ensure shopData defaults
    state.shopData.comissoes = state.shopData.comissoes || {
        porCompra: 8.00,
        porVerificacao: 0.50,
        admin: 0.75,
        gerenciadorProduto: 3.00,
        gerenciadorCartao: 0.75,
        gerenciadorTrocaRegional: 0.50
    };
    state.shopData.taxas = state.shopData.taxas || {
        pix: 0.99,
        cartao: {
            avista: { fixa: 0.49, percentual: 1.99 },
            parcelado: {
                '2-6': { fixa: 0.49, percentual: 2.49 },
                '7-12': { fixa: 0.49, percentual: 2.99 }
            }
        }
    };
    state.shopData.ofertasChannelJid = state.shopData.ofertasChannelJid || '0029Vas5FNjIiRp0p41KvZ3h';
    saveJsonFile(ARQUIVO_DADOS_LOJA, state.shopData);

    state.openTickets = loadJsonFile(ARQUIVO_TICKETS, []);
    state.cartData = loadJsonFile(ARQUIVO_CARRINHOS, {});
    state.rankingsData = loadJsonFile(ARQUIVO_RANKINGS, {});
    state.compradoresData = loadJsonFile(ARQUIVO_COMPRADORES, {});
    state.productManagerData = loadJsonFile(ARQUIVO_GERENCIADORES_PRODUTO, {});
    state.gerenciadoresCartaoData = loadJsonFile(ARQUIVO_GERENCIADORES_CARTAO, {});
    state.gerenciadoresTrocaRegionalData = loadJsonFile(ARQUIVO_GERENCIADORES_TROCA_REGIONAL, {});
    state.apoiadoresData = loadJsonFile(ARQUIVO_APOIADORES, {});
    state.pendingOrders = loadJsonFile(ARQUIVO_PEDIDOS, []);
    state.pendingOrdersV = loadJsonFile(ARQUIVO_PEDIDOS_V, []);
    state.waitingOrders = loadJsonFile(ARQUIVO_PEDIDOS_ESPERA, []);
    state.couponData = loadJsonFile(ARQUIVO_CUPONS, {});
    state.invitationData = loadJsonFile(ARQUIVO_CONVITES, {});
    state.activeChats = loadJsonFile(ARQUIVO_CHATS_ATIVOS, []);
    state.exclusiveAccounts = loadJsonFile(ARQUIVO_CONTAS_EXCLUSIVAS_JSON, []);
    state.finishedEmails = loadJsonFile(ARQUIVO_EMAILS_FINALIZADOS, {});
    state.verificationRequests = loadJsonFile(ARQUIVO_SOLICITACOES_VERIFICACAO, []);
    state.basesValores = loadJsonFile(ARQUIVO_BASES_VALORES, []);
    if (!Array.isArray(state.basesValores)) state.basesValores = [];

    // Ensure Owner Exists
    if (!state.adminData[OWNER_JID]) {
        state.adminData[OWNER_JID] = {
            atendimentos: 0,
            status: 'off',
            onlineSince: null,
            totalOnlineTime: 0,
            ganhosTotais: 0,
            caixa: 0,
            caixaBloqueado: 0,
            pixKeys: [],
            notificacoes: {
                idcheck: true,
                suporte: true,
                mensagemCompradores: true,
                saques: true,
                novosPedidos: true,
                novosProdutos: true,
                atendimentoIniciado: true,
                compraFinalizada: true,
                verificacaoConta: false,
            }
        };
        saveJsonFile(ARQUIVO_ADMINS, state.adminData);
    }


    setInterval(releaseBlockedEarnings, 24 * 60 * 60 * 1000);
    releaseBlockedEarnings();

    setInterval(checkAndResetRanking, 6 * 60 * 60 * 1000);
    checkAndResetRanking();
}

async function start(client) {
    state.sockInstance = createBaileysCompatibleClient(client);
    state.sockInstance.init();
    console.log("Bot iniciado com sucesso!");

    // Import and attach the main message handler here.
    const { handleMessage } = require("./core/handler");
    // Adapter to match WPPConnect/Baileys event to our handler signature
    state.sockInstance.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg) return;
        await handleMessage(state.sockInstance, msg, state);
    });
}

// Initialize
initializeState();

// Start WPPConnect
wppconnect.create({
    session: "powershop-bot",
    folderNameToken: "tokens",
    headless: true,
    devtools: false,
    useChrome: true,
    debug: false,
    updatesLog: false,
    autoClose: 0,
}).then(start).catch((error) => console.log(error));

module.exports = {
    start,
    initializeState
};
