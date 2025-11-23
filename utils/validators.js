function isValidEmail(email) {
    const e = String(email || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function isDirectUserJid(jid) {
    return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}

function normalizeDirectJid(jid) {
    if (typeof jid === 'string' && jid.endsWith('@lid')) return jid.replace(/@lid$/, '@s.whatsapp.net');
    return jid;
}

function normalizePixKey(key) {
    const k = String(key || '').trim();
    if (/^\S+@\S+\.\S+$/.test(k)) return k;
    const digits = k.replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 14) return digits;
    return k;
}

function detectPixKeyType(alias, key) {
    const a = String(alias || '').toLowerCase();
    const k = String(key || '').trim();
    if (/^\S+@\S+\.\S+$/.test(k)) return 'EMAIL';
    const digits = k.replace(/\D/g, '');
    if (digits.length === 14) return 'CNPJ';
    if (digits.length === 11) {
        if (a.includes('cel') || a.includes('fone') || a.includes('telefone') || a.includes('whats')) return 'PHONE';
        return 'CPF';
    }
    return 'EVP';
}

module.exports = {
    isValidEmail,
    isDirectUserJid,
    normalizeDirectJid,
    normalizePixKey,
    detectPixKeyType
};
