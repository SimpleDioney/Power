const { LANGUAGE_CURRENCY } = require("../config/constants");
const { getRateFromBRL } = require("./api-clients");
const { getUserLanguage } = require("./user-helper");

async function formatCurrencyByLanguage(amountBRL, targetLang) {
    const cfg = LANGUAGE_CURRENCY[targetLang] || LANGUAGE_CURRENCY.pt;
    let rate = 1;
    if (cfg.code !== 'BRL') {
        rate = await getRateFromBRL(cfg.code) || cfg.fallbackRateFromBRL || 1;
    }
    const converted = (amountBRL || 0) * rate;
    const fixed = converted.toFixed(cfg.decimals);
    let formatted = fixed;
    if (cfg.decimalSep && cfg.decimalSep !== '.') {
        formatted = fixed.replace('.', cfg.decimalSep);
    }
    return `${cfg.symbol} ${formatted}`;
}

async function formatMoneyForUser(jid, amountBRL) {
    const lang = getUserLanguage(jid);
    return await formatCurrencyByLanguage(amountBRL, lang);
}

function formatRemainingTime(expiryTimestamp) {
    const now = Date.now();
    if (!expiryTimestamp || expiryTimestamp <= now) {
        return "Expirado";
    }

    let delta = Math.floor((expiryTimestamp - now) / 1000);

    const days = Math.floor(delta / 86400);
    delta -= days * 86400;

    const hours = Math.floor(delta / 3600) % 24;
    delta -= hours * 3600;

    const minutes = Math.floor(delta / 60) % 60;

    let remaining = "";
    if (days > 0) remaining += `${days}d `;
    if (hours > 0) remaining += `${hours}h `;
    if (minutes > 0) remaining += `${minutes}m`;

    return remaining.trim() || "Menos de 1 minuto";
}

function parseDuration(text) {
    let totalMilliseconds = 0;
    const daysMatch = text.match(/(\d+)\s*d/);
    const hoursMatch = text.match(/(\d+)\s*h/);
    const minutesMatch = text.match(/(\d+)\s*m/);

    if (daysMatch) totalMilliseconds += parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000;
    if (hoursMatch) totalMilliseconds += parseInt(hoursMatch[1]) * 60 * 60 * 1000;
    if (minutesMatch) totalMilliseconds += parseInt(minutesMatch[1]) * 60 * 1000;
    return totalMilliseconds > 0 ? totalMilliseconds : null;
}

function formatTotalUptime(totalMilliseconds) {
    if (!totalMilliseconds || totalMilliseconds < 0) return "0h 0m";
    let delta = Math.floor(totalMilliseconds / 1000);
    const hours = Math.floor(delta / 3600);
    delta -= hours * 3600;
    const minutes = Math.floor(delta / 60) % 60;
    return `${hours}h ${minutes}m`;
}

module.exports = {
    formatCurrencyByLanguage,
    formatMoneyForUser,
    formatRemainingTime,
    parseDuration,
    formatTotalUptime
};
