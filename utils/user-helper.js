const state = require("../state/global-state");
const { SUPPORTED_LANGUAGES } = require("../config/constants");
const { normalizeDirectJid } = require("./validators");

function getUserLanguage(jid) {
    try {
        const lang = state.userData?.[jid]?.language || state.userData?.[normalizeDirectJid(jid)]?.language;
        if (typeof lang === 'string' && SUPPORTED_LANGUAGES[lang]) return lang;
    } catch { }
    return 'pt';
}

module.exports = {
    getUserLanguage
};
