const OWNER_JID = "557999076521@s.whatsapp.net";

const DISCOUNT_TIERS = [
    { threshold: 100, discount: 0.05, message: "seu primeiro presente: 5% de desconto!" },
    { threshold: 200, discount: 0.07, message: "aumentar seu desconto para 7%!" },
    { threshold: 300, discount: 0.10, message: "o desconto máximo de 10%!" },
];

const SPHERE_PRICING = {
    'Lendário': { basePrice: 16, perSpheres: 105, discountRange: { min: 11, max: 16 }, tradeRatio: 7 },
    'Mítico': { basePrice: 18, perSpheres: 102, discountRange: { min: 13, max: 18 }, tradeRatio: 6 },
    'Heroico': { basePrice: 20, perSpheres: 100, discountRange: { min: 15, max: 20 }, tradeRatio: 5 },
};

const FOOD_PER_LEVEL = {
    1: 20, 2: 40, 3: 80, 4: 120, 5: 140, 6: 180, 7: 200, 8: 240, 9: 260,
    10: 580, 11: 920, 12: 1240, 13: 1560, 14: 1900, 15: 2220, 16: 2540,
    17: 2860, 18: 3200, 19: 3520, 20: 12760, 21: 22020, 22: 31260, 23: 40520,
    24: 49760, 25: 59000, 26: 68260, 27: 77500, 28: 86760, 29: 96000,
    30: 182400, 31: 268800, 32: 355200, 33: 441600, 34: 528000, 35: 614400,
    36: 700800, 37: 787200, 38: 873600, 39: 960000, 40: 1232640, 41: 1505280,
    42: 1777920, 43: 2050560, 44: 2323200, 45: 2595840, 46: 2868480, 47: 3141120,
    48: 3413760, 49: 3686400, 50: 3724800, 51: 3763200, 52: 3801600, 53: 3840000,
    54: 3878400, 55: 3916800, 56: 3955200, 57: 3993600, 58: 4032000, 59: 4070400,
    60: 4110540, 61: 4150680, 62: 4190820, 63: 4230960, 64: 4271100, 65: 4311240,
    66: 4351380, 67: 4391520, 68: 4431660, 69: 4471808
};

const FARM_PER_LEVEL = {
    1: 13, 2: 18, 3: 22, 4: 26, 5: 29, 6: 31, 7: 34, 8: 36, 9: 38, 10: 40,
    11: 42, 12: 44, 13: 46, 14: 48, 15: 49, 16: 51, 17: 53, 18: 54, 19: 56, 20: 57,
    21: 58, 22: 60, 23: 61, 24: 62, 25: 64, 26: 65, 27: 66, 28: 67, 29: 69, 30: 70,
    31: 71, 32: 72, 33: 73, 34: 74, 35: 75, 36: 76, 37: 77, 38: 78, 39: 79, 40: 80
};

const SUPPORTED_LANGUAGES = { pt: 'Português', en: 'English', es: 'Español', hi: 'Hindi', id: 'Bahasa Indonesia' };

const LANGUAGE_CURRENCY = {
    pt: { code: 'BRL', symbol: 'R$', fallbackRateFromBRL: 1, decimals: 2, decimalSep: ',', thousandSep: '.' },
    en: { code: 'USD', symbol: 'US$', fallbackRateFromBRL: 0.20, decimals: 2, decimalSep: '.', thousandSep: ',' },
    es: { code: 'EUR', symbol: '€', fallbackRateFromBRL: 0.18, decimals: 2, decimalSep: ',', thousandSep: '.' },
    hi: { code: 'INR', symbol: '₹', fallbackRateFromBRL: 16.50, decimals: 2, decimalSep: '.', thousandSep: ',' },
    id: { code: 'IDR', symbol: 'Rp', fallbackRateFromBRL: 3300, decimals: 0, decimalSep: '.', thousandSep: ',' }
};

module.exports = {
    OWNER_JID,
    DISCOUNT_TIERS,
    SPHERE_PRICING,
    FOOD_PER_LEVEL,
    FARM_PER_LEVEL,
    SUPPORTED_LANGUAGES,
    LANGUAGE_CURRENCY
};
