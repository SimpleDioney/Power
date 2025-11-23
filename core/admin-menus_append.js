
// Lista de e-mails finalizados para Admin/Gerenciador, com opções atualizadas
async function sendAdminEmailsList(sock, jid) {
    const allEmailsRaw = Object.values(finishedEmails).flat();
    if (allEmailsRaw.length === 0) {
        await sendMessage(sock, jid, { text: "Nenhum e-mail finalizado registrado ainda.\n\n*0* - Voltar" });
        navigateTo(jid, "awaiting_admin_choice");
        return;
    }

    const buyerGroups = {};
    allEmailsRaw.forEach(item => {
        if (!buyerGroups[item.buyerName]) {
            buyerGroups[item.buyerName] = [];
        }
        buyerGroups[item.buyerName].push(item);
    });


    let emailCounter = 1;
    const options = { buyers: {}, emails: {} };

    for (const buyerName in buyerGroups) {
        const emails = buyerGroups[buyerName];
        if (emails.length > 0) {
            // Adicionar opção para apagar todos os e-mails de um comprador
            const xKey = `X${Object.keys(options.buyers).length + 1}`;
            options.buyers[xKey] = buyerName;


            emails.forEach(item => {
                const now = new Date();
                const limitTime = new Date(item.originalTimestamp);
                limitTime.setHours(limitTime.getHours() + 2);
                const diffMinutes = (limitTime - now) / (1000 * 60);
                let emoji = '⚫';
                if (diffMinutes > 90) emoji = '🟢';
                else if (diffMinutes > 60) emoji = '🟡';
                else if (diffMinutes > 30) emoji = '🟠';
                else if (diffMinutes > 0) emoji = '🔴';
                const formattedLimitTime = limitTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: "America/Sao_Paulo" });

                options.emails[emailCounter] = item;
                emailCounter++;
            });
        }
    }

    // Adicionar opção para apagar TODOS os e-mails

    // Adicionar opção de voltar

    // Texto de fallback para modo legacy
    let fallbackText = "📧 *E-mails de Contas Microsoft Finalizadas*\n\nSelecione um e-mail para remover ou use *X* para apagar todos os e-mails de um comprador.\n\n";
    emailCounter = 1;
    for (const buyerName in buyerGroups) {
        const emails = buyerGroups[buyerName];
        if (emails.length > 0) {
            fallbackText += `*${buyerName.toUpperCase()}* - [Digite *X${Object.keys(options.buyers).length + 1}* para apagar todos]\n`;

            emails.forEach(item => {
                const now = new Date();
                const limitTime = new Date(item.originalTimestamp);
                limitTime.setHours(limitTime.getHours() + 2);
                const diffMinutes = (limitTime - now) / (1000 * 60);
                let emoji = '⚫';
                if (diffMinutes > 90) emoji = '🟢';
                else if (diffMinutes > 60) emoji = '🟡';
                else if (diffMinutes > 30) emoji = '🟠';
                else if (diffMinutes > 0) emoji = '🔴';
                const formattedLimitTime = limitTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: "America/Sao_Paulo" });

                fallbackText += `*${emailCounter}* - ${item.email} (${emoji} ${formattedLimitTime})\n`;
                emailCounter++;
            });
            fallbackText += `-----------------------------------\n`;
        }
    }
    fallbackText += "\nDigite *X* para apagar TODOS os e-mails de TODOS os compradores.\n\n*0* - Voltar";

    await sendInteractiveList(sock, jid, {
        fallbackText: fallbackText,
        state: "awaiting_email_management_choice",
        stateData: options
    });
}


async function notifyProductManagersAndAdmins(sock, message) {
    const productManagers = Object.keys(productManagerData);
    for (const managerJid of productManagers) {
        try {
            await sendMessage(sock, managerJid, { text: message });
        } catch (e) {
            console.error(`Falha ao notificar o gerente de produto ${managerJid}:`, e);
        }
    }

    for (const adminJid in adminData) {
        if (adminData[adminJid].notificacoes?.novosProdutos) {
            try {
                await sendMessage(sock, adminJid, { text: message });
            } catch (e) {
                console.error(`Falha ao notificar o admin ${adminJid} sobre novo produto:`, e);
            }
        }
    }
}

// Canal de ofertas: obtém JID do canal configurado via env ou dados da loja
function getOfertasChannelJid() {
    const savedJid = shopData?.ofertasChannelJid;
    if (savedJid) {
        return savedJid.includes('@') ? savedJid : `${savedJid}@newsletter`;
    }
    const envJid = process.env?.OFERTAS_CHANNEL_JID;
    return envJid || "";
}

// Canal de anúncios: obtém JID do canal configurado via env ou dados da loja
function getAnunciosChannelJid() {
    const savedJid = shopData?.anunciosChannelJid;
    if (savedJid) {
        return savedJid.includes('@') ? savedJid : `${savedJid}@newsletter`;
    }
    const envJid = process.env?.ANUNCIOS_CHANNEL_JID;
    return envJid || "";
}

async function notifyOfferChannel(sock, message) {
    const channelJid = getOfertasChannelJid();
    if (!channelJid) return;
    try {
        await sendMessage(sock, channelJid, { text: message });
    } catch (e) {
        console.error(`Falha ao notificar canal de ofertas ${channelJid}:`, e);
    }

    // Também enviar ao canal de anúncios, sem mencionar quem adicionou
    const anunciosJid = getAnunciosChannelJid();
    if (anunciosJid) {
        try {
            await sendMessage(sock, anunciosJid, { text: message });
        } catch (e) {
            console.error(`Falha ao notificar canal de anúncios ${anunciosJid}:`, e);
        }
    }
}
