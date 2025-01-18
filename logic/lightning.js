const axios = require('axios');

async function resolveLightningAddress(lightningAddress) {
    const [username, domain] = lightningAddress.split('@');
    if (!username || !domain) {
        throw new Error('Invalid Lightning address format. For example: user@domain.com');
    }
    const url = `https://${domain}/.well-known/lnurlp/${username}`;
    try {
        const response = await axios.get(url);
        if (!response.data || !response.data.callback) {
            throw new Error('Callback URL not found.');
        }
        return response.data.callback;
    } catch (error) {
        throw new Error(`Error resolving Lightning address: ${error.message}`);
    }
}

async function generateLnInvoice(callback, amount) {
    const millisatoshis = amount * 1000;
    const paymentRequestUrl = `${callback}?amount=${millisatoshis}`;
    try {
        const response = await axios.get(paymentRequestUrl);
        if (!response.data || !response.data.pr) {
            throw new Error('Unable to create invoice.');
        }
        return response.data.pr;
    } catch (error) {
        throw new Error(`Error generating invoice: ${error.message}`);
    }
}

module.exports = { resolveLightningAddress, generateLnInvoice };
