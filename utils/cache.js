const directoryCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCached(key, fetchFunction) {
    const cached = directoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value;
    }
    const value = fetchFunction();
    directoryCache.set(key, { value, timestamp: Date.now() });
    return value;
}

module.exports = {
    getCached,
    CACHE_TTL
};
