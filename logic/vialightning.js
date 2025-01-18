const readlineSync = require('readline-sync');
const { fetchUserProfile } = require('./nostr');
const { resolveLightningAddress, generateLnInvoice } = require('./lightning');

async function main() {
  try {
    const npubInput = readlineSync.question('Please enter the user\'s npub value: ').trim();

    console.log('Fetching user information...');
    const profile = await fetchUserProfile(npubInput);

    console.log('\nUser Profile:');
    console.log('Name:', profile.name || 'Not found');
    console.log('Profile Picture:', profile.picture || 'Not found');
    console.log('LUD16 Lightning Address:', profile.lud16 || 'Not found');
    console.log('Banner:', profile.banner || 'Not found');

    if (!profile.lud16) {
      console.error('\nThe user does not have a Lightning address (lud16).');
      process.exit(1);
    }

    let satoshis = 0;
    while (true) {
      const input = readlineSync.question('\nEnter the amount you wish to send (satoshi): ').trim();
      satoshis = parseInt(input, 10);
      if (!isNaN(satoshis) && satoshis > 0) break;
      console.log('Invalid amount. Please enter a positive number.\n');
    }

    console.log('\nCreating invoice...');

    try {
      const callback = await resolveLightningAddress(profile.lud16);
      const lnInvoice = await generateLnInvoice(callback, satoshis);
      console.log('Your Lightning Invoice:');
      console.log(lnInvoice);
    } catch (error) {
      console.error(`\nError: ${error.message}`);
    }

  } catch (err) {
    console.error(`\nError: ${err.message}`);
  }
}

main();
