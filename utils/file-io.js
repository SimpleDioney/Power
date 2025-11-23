const fs = require("fs");
const path = require("path");
const { getCached } = require("./cache");

function loadJsonFile(filePath, defaultData = {}) {
    try {
        if (fs.existsSync(filePath))
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        saveJsonFile(filePath, defaultData);
    } catch (error) {
        console.error(`Erro ao carregar o arquivo ${filePath}:`, error);
    }
    return defaultData;
}

function saveJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar o arquivo ${filePath}:`, error);
    }
}

const isProductNew = (product) => product && product.createdAt && (Date.now() - product.createdAt < 20 * 60 * 60 * 1000);

function directoryHasNewProducts(directoryPath) {
    return getCached(`hasNew:${directoryPath}`, () => {
        try {
            if (!fs.existsSync(directoryPath)) return false;
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);
                if (entry.isDirectory()) {
                    if (directoryHasNewProducts(fullPath)) {
                        return true;
                    }
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    const products = loadJsonFile(fullPath, []);
                    if (Array.isArray(products) && products.some(isProductNew)) {
                        return true;
                    }
                }
            }
        } catch (error) {
            console.error(`Erro ao verificar novos produtos no diretório ${directoryPath}:`, error);
        }
        return false;
    });
}

function directoryHasProducts(directoryPath) {
    return getCached(`hasProducts:${directoryPath}`, () => {
        try {
            if (!fs.existsSync(directoryPath)) return false;
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);
                if (entry.isDirectory()) {
                    if (directoryHasProducts(fullPath)) {
                        return true;
                    }
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    const products = loadJsonFile(fullPath, []);
                    if (products.length > 0) {
                        return true;
                    }
                }
            }
        } catch (e) {
            console.error(`Erro ao verificar produtos no diretório ${directoryPath}:`, e);
        }
        return false;
    });
}

module.exports = {
    loadJsonFile,
    saveJsonFile,
    isProductNew,
    directoryHasNewProducts,
    directoryHasProducts
};
