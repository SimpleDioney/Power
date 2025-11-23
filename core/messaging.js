const state = require("../state/global-state");
const { translateMessageContent, translateText } = require("../utils/translation");
const { getUserLanguage } = require("../utils/user-helper");

async function sendMessage(sock, jid, message) {
    if (!message || (!message.text && !message.image && !message.caption)) {
        console.error(`[sendMessage] Tentativa de enviar mensagem indefinida ou vazia para ${jid}.`);
        return null;
    }

    try {
        await sock.presenceSubscribe(jid);
        await new Promise(resolve => setTimeout(resolve, 250));
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, 500));

        const toSend = await translateMessageContent(jid, message);
        const signatureRaw = (() => {
            if (toSend.text) return 'text:' + toSend.text.trim();
            if (toSend.caption) return 'caption:' + toSend.caption.trim();
            if (toSend.image) return 'image:' + (toSend.caption || '');
            if (toSend.video) return 'video:' + (toSend.caption || '');
            if (toSend.audio) return 'audio';
            if (toSend.document) return 'document:' + (toSend.fileName || '');
            try { return JSON.stringify(toSend); } catch { return String(toSend); }
        })();
        const signature = String(signatureRaw).replace(/\s+/g, ' ').trim();

        const prev = state.recentMessagesByJid.get(jid);
        if (prev && prev.signature === signature && Date.now() - prev.at < 8000) {
            await sock.sendPresenceUpdate('paused', jid);
            return null;
        }
        const inflight = state.inFlightMessagesByJid.get(jid);
        if (inflight && inflight.signature === signature && Date.now() - inflight.at < 8000) {
            await sock.sendPresenceUpdate('paused', jid);
            return null;
        }
        state.inFlightMessagesByJid.set(jid, { signature, at: Date.now() });
        state.recentMessagesByJid.set(jid, { signature, at: Date.now() });
        const sentMessage = await sock.sendMessage(jid, toSend);
        setTimeout(() => {
            const v = state.inFlightMessagesByJid.get(jid);
            if (v && v.signature === signature) state.inFlightMessagesByJid.delete(jid);
        }, 8000);

        await sock.sendPresenceUpdate('paused', jid);
        return sentMessage;
    } catch (e) {
        console.error(`Falha ao enviar mensagem para ${jid}:`, e);
        if (e.message && e.message.includes('rate-overlimit')) {
            console.log('Limite de taxa atingido, esperando 1 segundo para reenviar...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return sendMessage(sock, jid, message);
        }
        return null;
    }
}

async function sendInvalidOptionMessage(sock, jid, validOptions) {
    let message = "❌ Opção indisponível.";
    if (validOptions && validOptions.length > 0) {
        message += ` Por favor, digite uma das seguintes opções: ${validOptions.join(", ")}.`;
    }
    await sendMessage(sock, jid, { text: message });
}

async function goBack(sock, jid) {
    if (state.userState && state.userState[jid] && state.userState[jid].paymentCheckTimeout) {
        clearTimeout(state.userState[jid].paymentCheckTimeout);
        delete state.userState[jid].paymentCheckTimeout;
    }

    if (state.userState && state.userState[jid] && state.userState[jid].history && state.userState[jid].history.length > 1) {
        state.userState[jid].history.pop();
        const previousState = state.userState[jid].history[state.userState[jid].history.length - 1];

        if (state.userState[jid].history.length > 1) {
            const grandPreviousState = state.userState[jid].history[state.userState[jid].history.length - 2];
            if (previousState.step === grandPreviousState.step) {
                console.log(`[goBack] Loop detectado para ${jid}: ${previousState.step}. Pulando um estado extra.`);
                state.userState[jid].history.pop();
                return grandPreviousState;
            }
        }
        return previousState;
    }
    // If there is no history to go back to, we should return to the main menu.
    // To avoid circular dependencies by importing sendMainMenu here, we return a signal string.
    // The caller (message handler) is responsible for detecting this signal and calling sendMainMenu.
    delete state.userState[jid];
    return 'REQ_MAIN_MENU';
}


function navigateTo(jid, step, data = {}) {
    if (!state.userState) state.userState = {};
    if (!state.userState[jid] || !state.userState[jid].history) {
        state.userState[jid] = { history: [] };
    }
    const currentState = { step, data, timestamp: Date.now() };

    const lastState = state.userState[jid].history[state.userState[jid].history.length - 1];
    if (lastState && lastState.step === step) {
        state.userState[jid].history[state.userState[jid].history.length - 1].data = data;
    } else {
        state.userState[jid].history.push(currentState);
    }
}

async function sendInteractiveList(sock, jid, options) {
    const { fallbackText, state: targetState, stateData = {} } = options;
    const userLang = getUserLanguage(jid);
    const finalText = fallbackText && fallbackText.trim()
        ? await translateText(fallbackText, userLang)
        : await translateText('Selecione uma opção digitando o número correspondente.', userLang);
    await sendMessage(sock, jid, { text: finalText });
    if (targetState) navigateTo(jid, targetState, stateData);
}

async function sendLanguageSelectionList(sock, jid) {
    try {
        await sendInteractiveList(sock, jid, {
            fallbackText: "🌐 *Selecione seu idioma preferido:*\n\nDigite:\n1️⃣ - English (Inglês)\n2️⃣ - Português (Portuguese)\n3️⃣ - Español (Espanhol)\n4️⃣ - हिंदी (Hindi/Indiano)\n5️⃣ - Bahasa Indonesia (Indonésio)\n\n0️⃣ - Voltar",
            state: 'awaiting_language_choice'
        });
    } catch (err) {
        console.error("Erro ao enviar lista de idiomas:", err);
    }
}

module.exports = {
    sendMessage,
    sendInvalidOptionMessage,
    goBack,
    navigateTo,
    sendInteractiveList,
    sendLanguageSelectionList
};
