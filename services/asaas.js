const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

const ASAAS_API_KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjdlMThjYTA5LWJkZmItNDAwYy1iMzhkLTBjZDliNTkxYjM1Yjo6JGFhY2hfMjQ2N2VkMDgtZDVjNi00NzI0LWE5ZmMtMDAxNjU5ZWY4ODZj';
const ASAAS_ENVIRONMENT = 'production'; // Sempre production

const ASAAS_BASE_URL = ASAAS_ENVIRONMENT === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

const apiClient = axios.create({
    baseURL: ASAAS_BASE_URL,
    headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json'
    }
});

function sanitizeDescription(text) {
    const s = (text || '').replace(/[^\p{L}\p{N}\s]/gu, ' ');
    return s.trim().replace(/\s+/g, ' ');
}

/**
 * Cria ou busca um cliente no Asaas
 * @param {Object} customerData - Dados do cliente
 * @param {string} customerData.name - Nome do cliente
 * @param {string} customerData.email - Email do cliente
 * @param {string} customerData.cpfCnpj - CPF ou CNPJ do cliente
 * @param {string} customerData.phone - Telefone do cliente (opcional)
 * @param {string} customerData.mobilePhone - Celular do cliente (opcional)
 * @param {string} customerData.postalCode - CEP (opcional)
 * @param {string} customerData.addressNumber - Número do endereço (opcional)
 * @returns {Promise<Object>} - Dados do cliente criado/encontrado
 */
async function createOrGetCustomer(customerData) {
    const { email, cpfCnpj } = customerData;

    try {
        // Primeiro, tenta buscar cliente existente por email ou CPF
        logger.info(`Buscando cliente existente: ${email}`);

        const searchResponse = await apiClient.get('/customers', {
            params: {
                email: email,
                limit: 1
            }
        });

        // Se encontrou cliente, verifica se precisa atualizar CPF/CNPJ
        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
            const existingCustomer = searchResponse.data.data[0];
            logger.info(`Cliente já existe no Asaas: ${existingCustomer.id}`);

            // Se o cliente não tem CPF/CNPJ e estamos fornecendo, atualiza
            if (!existingCustomer.cpfCnpj && cpfCnpj) {
                logger.info(`Atualizando CPF/CNPJ do cliente ${existingCustomer.id}`);

                try {
                    const updateResponse = await apiClient.put(`/customers/${existingCustomer.id}`, {
                        cpfCnpj: cpfCnpj,
                        name: customerData.name || existingCustomer.name,
                        phone: customerData.phone || existingCustomer.phone,
                        mobilePhone: customerData.mobilePhone || existingCustomer.mobilePhone,
                        postalCode: customerData.postalCode || existingCustomer.postalCode,
                        addressNumber: customerData.addressNumber || existingCustomer.addressNumber
                    });

                    logger.info(`Cliente atualizado com CPF/CNPJ: ${cpfCnpj}`);
                    return updateResponse.data;
                } catch (updateError) {
                    logger.error('Erro ao atualizar cliente:', updateError.response?.data);
                    // Se falhar ao atualizar, retorna o cliente original
                    // A API vai reclamar depois se precisar do CPF
                }
            }

            return existingCustomer;
        }

        // Se não encontrou, cria novo cliente
        logger.info('Criando novo cliente no Asaas...');

        const createResponse = await apiClient.post('/customers', customerData);
        const newCustomer = createResponse.data;

        logger.info(`Cliente criado no Asaas: ${newCustomer.id}`);
        return newCustomer;

    } catch (error) {
        const errorData = error.response?.data;
        logger.error('Erro ao criar/buscar cliente no Asaas. Message:', error.message);
        logger.error('Stack:', error.stack);
        if (errorData) {
            logger.error('Response Data:', JSON.stringify(errorData, null, 2));
        }
        throw new Error(errorData?.errors?.[0]?.description || error.message || 'Falha ao criar cliente');
    }
}

/**
 * Cria um pagamento único (não recorrente) via PIX
 * @param {Object} paymentData - Dados do pagamento
 * @param {string} paymentData.customerId - ID do cliente no Asaas
 * @param {number} paymentData.value - Valor do pagamento
 * @param {string} paymentData.dueDate - Data de vencimento (YYYY-MM-DD)
 * @param {string} paymentData.description - Descrição do pagamento
 * @returns {Promise<Object>} - Dados do pagamento criado (inclui QR Code PIX)
 */
async function createPixPayment(paymentData) {
    const {
        customerId,
        value,
        dueDate,
        description
    } = paymentData;

    const body = {
        customer: customerId,
        billingType: 'PIX',
        dueDate: dueDate,
        value: value,
        description: sanitizeDescription(description || 'Pagamento PIX PowerShop')
    };

    try {
        logger.info(`Criando pagamento PIX para cliente ${customerId}...`);

        const response = await apiClient.post('/payments', body);
        const payment = response.data;

        logger.info(`Pagamento PIX criado - ID: ${payment.id}`);

        // Busca informações do QR Code PIX
        const pixResponse = await apiClient.get(`/payments/${payment.id}/pixQrCode`);
        const pixData = pixResponse.data;

        return {
            id: payment.id,
            status: payment.status,
            value: payment.value,
            dueDate: payment.dueDate,
            invoiceUrl: payment.invoiceUrl,
            qrCode: {
                payload: pixData.payload,
                encodedImage: pixData.encodedImage,
                expirationDate: pixData.expirationDate
            }
        };
    } catch (error) {
        const errorData = error.response?.data;
        logger.error('Erro ao criar pagamento PIX no Asaas:', JSON.stringify(errorData, null, 2));
        throw new Error(errorData?.errors?.[0]?.description || 'Falha ao criar pagamento PIX');
    }
}

/**
 * Cria um pagamento único com cartão de crédito
 * @param {Object} paymentData - Dados do pagamento
 * @param {string} paymentData.customerId - ID do cliente no Asaas
 * @param {number} paymentData.value - Valor do pagamento
 * @param {string} paymentData.dueDate - Data de vencimento (YYYY-MM-DD)
 * @param {string} paymentData.description - Descrição do pagamento
 * @param {number} paymentData.installmentCount - Número de parcelas (opcional, padrão 1)
 * @param {Object} paymentData.creditCard - Dados do cartão
 * @param {string} paymentData.creditCard.holderName - Nome no cartão
 * @param {string} paymentData.creditCard.number - Número do cartão
 * @param {string} paymentData.creditCard.expiryMonth - Mês de expiração (MM)
 * @param {string} paymentData.creditCard.expiryYear - Ano de expiração (YYYY ou YY)
 * @param {string} paymentData.creditCard.ccv - Código de segurança
 * @param {Object} paymentData.creditCardHolderInfo - Dados do titular
 * @param {string} paymentData.creditCardHolderInfo.name - Nome do titular
 * @param {string} paymentData.creditCardHolderInfo.email - Email do titular
 * @param {string} paymentData.creditCardHolderInfo.cpfCnpj - CPF/CNPJ do titular
 * @param {string} paymentData.creditCardHolderInfo.postalCode - CEP do titular
 * @param {string} paymentData.creditCardHolderInfo.addressNumber - Número do endereço
 * @param {string} paymentData.creditCardHolderInfo.phone - Telefone do titular
 * @returns {Promise<Object>} - Dados do pagamento criado
 */
async function createCreditCardPayment(paymentData) {
    const {
        customerId,
        value,
        dueDate,
        description,
        installmentCount = 1,
        creditCard,
        creditCardHolderInfo
    } = paymentData;

    // O Asaas espera o ano com apenas 2 dígitos (ex: "25" ao invés de "2025")
    // Se o ano tiver 4 dígitos, pega apenas os últimos 2
    const expiryYear = creditCard.expiryYear.length === 4
        ? creditCard.expiryYear.slice(-2)
        : creditCard.expiryYear;

    const body = {
        customer: customerId,
        billingType: 'CREDIT_CARD',
        dueDate: dueDate,
        value: value,
        description: sanitizeDescription(description || 'Pagamento PowerShop'),
        installmentCount: installmentCount,
        creditCard: {
            holderName: creditCard.holderName,
            number: creditCard.number,
            expiryMonth: creditCard.expiryMonth,
            expiryYear: expiryYear,
            ccv: creditCard.ccv
        },
        creditCardHolderInfo: {
            name: creditCardHolderInfo.name,
            email: creditCardHolderInfo.email,
            cpfCnpj: creditCardHolderInfo.cpfCnpj,
            postalCode: creditCardHolderInfo.postalCode,
            addressNumber: creditCardHolderInfo.addressNumber,
            phone: creditCardHolderInfo.phone,
            mobilePhone: creditCardHolderInfo.mobilePhone || creditCardHolderInfo.phone
        }
    };

    try {
        logger.info(`Criando pagamento com cartão para cliente ${customerId}...`);
        logger.info(`Dados: valor R$ ${value}, parcelas: ${installmentCount}`);

        const response = await apiClient.post('/payments', body);
        const payment = response.data;

        logger.info(`Pagamento criado - ID: ${payment.id}, Status: ${payment.status}`);

        return payment;
    } catch (error) {
        const errorData = error.response?.data;
        logger.error('Erro ao criar pagamento com cartão no Asaas:', JSON.stringify(errorData, null, 2));
        throw new Error(errorData?.errors?.[0]?.description || 'Falha ao processar pagamento');
    }
}

/**
 * Cria um Link de Pagamento (checkout via URL)
 * @param {Object} linkData
 * @param {string} linkData.name
 * @param {string} linkData.description
 * @param {number} linkData.value
 * @param {string} [linkData.billingType] - 'CREDIT_CARD' ou 'UNDEFINED'
 * @param {string} [linkData.chargeType] - 'DETACHED' | 'INSTALLMENT' | 'RECURRENT'
 * @param {number} [linkData.maxInstallmentCount]
 * @param {Object} [linkData.callback]
 * @returns {Promise<Object>} - { id, url }
 */
async function createPaymentLink(linkData) {
    const body = {
        name: sanitizeDescription(linkData.name || 'Pedido PowerShop'),
        description: sanitizeDescription(linkData.description || ''),
        value: linkData.value,
        billingType: linkData.billingType || 'CREDIT_CARD',
        chargeType: linkData.chargeType || 'INSTALLMENT',
        ...(linkData.maxInstallmentCount ? { maxInstallmentCount: linkData.maxInstallmentCount } : {}),
        ...(linkData.callback ? { callback: linkData.callback } : {})
    };
    try {
        logger.info(`Criando link de pagamento...`);
        const response = await apiClient.post('/paymentLinks', body);
        const result = response.data;
        return { id: result.id || result.paymentLink, url: result.url || result.paymentUrl || result.link || result.paymentLinkUrl };
    } catch (error) {
        const errorData = error.response?.data;
        logger.error('Erro ao criar link de pagamento no Asaas:', JSON.stringify(errorData, null, 2));
        throw new Error(errorData?.errors?.[0]?.description || 'Falha ao criar link de pagamento');
    }
}

/**
 * Busca informações de um pagamento (cobrança)
 * @param {string} paymentId - ID do pagamento no Asaas
 * @returns {Promise<Object|null>} - Dados do pagamento ou null
 */
async function getPaymentDetails(paymentId) {
    try {
        const response = await apiClient.get(`/payments/${paymentId}`);
        return response.data;
    } catch (error) {
        logger.error(`Erro ao buscar pagamento ${paymentId}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * Processa um reembolso (estorno)
 * @param {string} paymentId - ID do pagamento no Asaas
 * @returns {Promise<Object>} - Resultado do reembolso
 */
async function processRefund(paymentId) {
    if (!paymentId) {
        throw new Error('ID do pagamento é obrigatório para reembolso');
    }

    try {
        logger.info(`Processando reembolso do pagamento ${paymentId}...`);

        const response = await apiClient.post(`/payments/${paymentId}/refund`);
        const result = response.data;

        logger.info(`Reembolso processado com sucesso - Payment ID: ${paymentId}`);

        return {
            id: result.id,
            status: result.status,
            refundedValue: result.value,
            date_refunded: new Date().toISOString()
        };
    } catch (error) {
        const errorData = error.response?.data;
        logger.error(`Erro ao processar reembolso do pagamento ${paymentId}:`, JSON.stringify(errorData, null, 2));
        throw new Error(errorData?.errors?.[0]?.description || 'Falha ao processar reembolso');
    }
}

async function createPixTransfer(transferData) {
    const { value, pixAddressKey, pixAddressKeyType, description, scheduleDate } = transferData;
    const body = {
        value: Number(value),
        pixAddressKey: String(pixAddressKey),
        pixAddressKeyType: String(pixAddressKeyType),
        ...(description ? { description: String(description) } : {}),
        ...(scheduleDate ? { scheduleDate } : {})
    };
    try {
        const response = await apiClient.post('/transfers', body);
        return response.data;
    } catch (error) {
        const errorData = error.response?.data;
        logger.error('Erro ao criar transferência PIX:', JSON.stringify(errorData, null, 2));
        throw new Error(errorData?.errors?.[0]?.description || 'Falha ao criar transferência PIX');
    }
}

module.exports = {
    // Clientes
    createOrGetCustomer,

    // Pagamentos Únicos
    createPixPayment,
    createCreditCardPayment,
    createPaymentLink,
    getPaymentDetails,
    processRefund,
    createPixTransfer
};
