const { userState } = require('../state/user-state');

function navigateTo(jid, step, data = {}) {
    if (!userState[jid] || !userState[jid].history) {
        userState[jid] = { history: [] };
    }
    const currentState = { step, data, timestamp: Date.now() };

    const lastState = userState[jid].history[userState[jid].history.length - 1];
    // Evita adicionar estados duplicados consecutivos na pilha de histórico
    if (lastState && lastState.step === step) {
        // Apenas atualiza os dados do estado atual em vez de adicionar um novo
        userState[jid].history[userState[jid].history.length - 1].data = data;
    } else {
        userState[jid].history.push(currentState);
    }
}

module.exports = { navigateTo };
