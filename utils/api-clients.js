const https = require('https');
const querystring = require('querystring');

let exchangeRatesCache = { data: null, timestamp: 0 };

async function fetchExchangeRates() {
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
    const targetCodeBRLKey = `${targetCode}BRL`;
    const brlTargetKey = `BRL${targetCode}`;

    const quote1 = exchangeRatesCache.data?.[targetCodeBRLKey]?.bid;
    const bid1 = quote1 ? parseFloat(quote1) : null;
    if (bid1 && bid1 > 0) {
        return 1 / bid1;
    }

    const quote2 = exchangeRatesCache.data?.[brlTargetKey]?.bid;
    const bid2 = quote2 ? parseFloat(quote2) : null;
    if (bid2 && bid2 > 0) {
        return bid2;
    }

    return null;
}

function fetchPersonData() {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            'acao': 'gerar_pessoa',
            'sexo': 'I',
            'pontuacao': 'S',
            'idade': '0',
            'cep_estado': '',
            'txt_qtde': '1',
            'cep_cidade': ''
        });

        const options = {
            hostname: 'www.4devs.com.br',
            path: '/ferramentas_online.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (!data) {
                        return reject('A resposta da API 4devs veio vazia.');
                    }
                    const responseArray = JSON.parse(data);
                    if (Array.isArray(responseArray) && responseArray.length > 0) {
                        const person = responseArray[0];
                        if (person && person.nome) {
                            const nomeCompleto = person.nome.split(' ');
                            resolve({
                                nome: nomeCompleto[0],
                                sobrenome: nomeCompleto.slice(1).join(' '),
                                endereco: `${person.endereco}, ${person.numero}`,
                                cidade: person.cidade,
                                estado: person.estado,
                                cep: person.cep.replace('-', '')
                            });
                        } else {
                            reject('A resposta da API 4devs possui um formato inesperado.');
                        }
                    } else {
                        reject('A resposta da API 4devs está inválida ou vazia.');
                    }
                } catch (e) {
                    console.error("Erro ao analisar JSON da 4devs:", e, "Dados recebidos:", data);
                    reject('Erro ao processar os dados da pessoa.');
                }
            });
        });

        req.on('error', (e) => {
            console.error("Erro na requisição para 4devs:", e);
            reject(`Erro na requisição: ${e.message}`);
        });

        req.write(postData);
        req.end();
    });
}

module.exports = {
    fetchPersonData,
    getRateFromBRL
};
