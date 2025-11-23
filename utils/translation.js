const https = require('https');
const querystring = require('querystring');
const state = require("../state/global-state");
const { getUserLanguage } = require("./user-helper");
const { LANGUAGE_CURRENCY } = require("../config/constants");

let exchangeRatesCache = { data: null, timestamp: 0 };

function getDeepLKey() {
    const envKey = process.env.DEEPL_API_KEY;
    const savedKey = state.shopData?.deeplApiKey;
    return envKey || savedKey || '4631a6be-c5e1-4db3-a68d-320768fa2689:fx';
}

function getGoogleKey() {
    const envKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    const savedKey = state.shopData?.googleTranslateApiKey;
    return envKey || savedKey || null;
}

async function translateUsingGoogle(text, targetLang) {
    try {
        const key = getGoogleKey();
        const tl = String(targetLang || '').toLowerCase();
        if (!key || !text || !targetLang || tl === 'pt' || tl === 'pt-br') return text;

        const postData = JSON.stringify({
            q: text,
            source: 'pt',
            target: targetLang,
            format: 'text'
        });

        const options = {
            hostname: 'translation.googleapis.com',
            path: `/language/translate/v2?key=${encodeURIComponent(key)}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        };

        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode || 500, data }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
            const parsed = JSON.parse(response.data);
            const translated = parsed?.data?.translations?.[0]?.translatedText;
            return translated || text;
        }
    } catch (e) {
        console.error('Erro na tradução Google:', e);
    }
    return text;
}

async function translateUsingDeepL(text, targetLang) {
    try {
        const key = getDeepLKey();
        if (!key || !text || !targetLang || targetLang === 'pt') return text;

        const postData = querystring.stringify({
            auth_key: key,
            text,
            target_lang: targetLang.toUpperCase()
        });

        const options = {
            hostname: 'api-free.deepl.com',
            path: '/v2/translate',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
        };

        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode || 500, data }));
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        if (response.statusCode >= 200 && response.statusCode < 300) {
            const parsed = JSON.parse(response.data);
            const translated = parsed?.translations?.[0]?.text;
            return translated || text;
        }
    } catch (e) {
        console.error('Erro na tradução DeepL:', e);
    }
    return text;
}

async function translateText(text, targetLang) {
    const tl = String(targetLang || '').toLowerCase();
    if (!text || !targetLang || tl === 'pt' || tl === 'pt-br') return text;
    const googleKey = getGoogleKey();
    if (googleKey) {
        const g = await translateUsingGoogle(text, targetLang);
        if (g && typeof g === 'string' && g !== text) return g;
    }
    const d = await translateUsingDeepL(text, targetLang);
    return d || text;
}

async function translateMessageContent(jid, message) {
    try {
        const isGroup = jid.endsWith('@g.us');
        if (isGroup) return message;
        const targetLang = getUserLanguage(jid);
        const tl = String(targetLang || '').toLowerCase();
        if (tl === 'pt' || tl === 'pt-br') return message;

        let toSend = { ...message };
        if (toSend.text) toSend.text = await translateText(toSend.text, targetLang);
        if (toSend.caption) toSend.caption = await translateText(toSend.caption, targetLang);
        return toSend;
    } catch (e) {
        console.error('Erro ao traduzir mensagem:', e);
        return message;
    }
}

async function fetchExchangeRates() {
    // Use BRL-IDR for Indonesian Rupiah, as IDR-BRL may not exist
    const urlPath = '/json/last/USD-BRL,EUR-BRL,INR-BRL,BRL-IDR';
    const options = { hostname: 'economia.awesomeapi.com.br', path: urlPath, method: 'GET' };
    return await new Promise((resolve) => {
        try {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed || {});
                    } catch {
                        resolve({});
                    }
                });
            });
            req.on('error', () => resolve({}));
            req.end();
        } catch {
            resolve({});
        }
    });
}

async function getRateFromBRL(targetCode) {
    if (targetCode === 'BRL') return 1;
    const now = Date.now();
    if (!exchangeRatesCache.data || (now - exchangeRatesCache.timestamp) > (5 * 60 * 1000)) {
        exchangeRatesCache.data = await fetchExchangeRates();
        exchangeRatesCache.timestamp = now;
    }
    // Prefer targetCodeBRL (e.g., USDBRL, EURBRL, INRBRL). If missing, try BRLtargetCode (e.g., BRLIDR).
    const targetCodeBRLKey = `${targetCode}BRL`;
    const brlTargetKey = `BRL${targetCode}`;

    const quote1 = exchangeRatesCache.data?.[targetCodeBRLKey]?.bid;
    const bid1 = quote1 ? parseFloat(quote1) : null;
    if (bid1 && bid1 > 0) {
        // BRL -> target: divide by BRL per 1 unit of target (e.g., BRL/USD)
        return 1 / bid1;
    }

    const quote2 = exchangeRatesCache.data?.[brlTargetKey]?.bid;
    const bid2 = quote2 ? parseFloat(quote2) : null;
    if (bid2 && bid2 > 0) {
        // BRL -> target: multiply by target per 1 BRL (e.g., IDR per BRL)
        return bid2;
    }

    return null;
}

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

module.exports = {
    translateText,
    translateMessageContent,
    formatCurrencyByLanguage,
    formatMoneyForUser,
    getUserLanguage
};
