const state = {
    userData: {},
    purchaseHistoryData: {},
    adminData: {},
    shopData: {},
    openTickets: [],
    cartData: {},
    rankingsData: {},
    compradoresData: {},
    productManagerData: {},
    gerenciadoresCartaoData: {},
    gerenciadoresTrocaRegionalData: {},
    apoiadoresData: {},
    pendingOrders: [],
    pendingOrdersV: [],
    waitingOrders: [],
    couponData: {},
    invitationData: {},
    activeChats: [],
    exclusiveAccounts: [],
    finishedEmails: {},
    verificationRequests: [],
    basesValores: [],

    // Runtime state
    sockInstance: null,
    messageProcessing: new Set(),
    activeIdChecks: {},
    recentMessagesByJid: new Map(),
    inFlightMessagesByJid: new Map(),
    paymentLinkMap: {},
    pixPaymentMap: {},
    userState: {}
};

module.exports = state;
