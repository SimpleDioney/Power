const { getUserLanguage, translateText } = require('./translation');
const { navigateTo } = require('./navigation');

async function sendInteractiveList(sock, jid, options) {
    const { fallbackText, state, stateData = {} } = options;
    const userLang = getUserLanguage(jid);
    const finalText = fallbackText && fallbackText.trim()
        ? await translateText(fallbackText, userLang)
        : await translateText('Selecione uma opção digitando o número correspondente.', userLang);

    await sock.sendMessage(jid, { text: finalText });
    if (state) navigateTo(jid, state, stateData);
}

async function sendMessage(sock, jid, content) {
    const userLang = getUserLanguage(jid);

    if (content.text) {
        content.text = await translateText(content.text, userLang);
    }

    if (content.caption) {
        content.caption = await translateText(content.caption, userLang);
    }

    await sock.sendMessage(jid, content);
}

module.exports = { sendInteractiveList, sendMessage, navigateTo };
