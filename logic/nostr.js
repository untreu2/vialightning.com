const { getEventHash, verifyEvent, nip19 } = require('nostr-tools');
const WebSocket = require('ws');
const pLimit = require('p-limit');

const POPULAR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.info',
  'wss://relay.nostr.pool.pm',
  'wss://relay.snort.social'
];

const TIMEOUT = 500;

const limit = pLimit(10);

let userProfile = {
  name: null,
  picture: null,
  lud16: null,
  banner: null
};

function fetchEvent(relayUrl, pubkey, kind) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);

    ws.on('open', () => {
      const subId = 'sub-' + Math.random().toString(36).substring(2, 15);
      ws.send(JSON.stringify([
        "REQ",
        subId,
        { 
          kinds: [kind],
          authors: [pubkey],
          limit: 1
        }
      ]));

      setTimeout(() => {
        ws.close();
        reject(new Error(`Timeout while fetching kind:${kind} event from ${relayUrl}`));
      }, TIMEOUT);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        const [type, receivedSubId, event] = message;

        if (type === 'EVENT' && event.pubkey === pubkey && event.kind === kind) {
          const eventHash = getEventHash(event);
          if (event.id !== eventHash) {
            ws.close();
            return;
          }
          if (!verifyEvent(event)) {
            ws.close();
            return;
          }

          resolve(event);
          ws.close();
        }
      } catch (err) {
        ws.close();
      }
    });

    ws.on('error', () => {
      reject(new Error(`WebSocket error on relay ${relayUrl}`));
    });

    ws.on('close', () => {
      reject(new Error(`Connection closed before receiving kind:${kind} event from ${relayUrl}`));
    });
  });
}

async function fetchUserProfile(npubInput) {
  let pubkey;

  try {
    const decoded = nip19.decode(npubInput);
    if (decoded.type !== 'npub') {
      throw new Error('Invalid npub type');
    }
    pubkey = decoded.data;
  } catch (err) {
    throw new Error('Invalid npub input.');
  }

  const relayPromises = POPULAR_RELAYS.map(relay => {
    return limit(() => {
      return fetchEvent(relay, pubkey, 10002)
        .then(event => {
          if (event) {
            const rTags = event.tags.filter(tag => tag[0] === 'r');
            const relayList = rTags.map(tag => {
              const relayUri = tag[1];
              const relayType = tag[2] || 'read-write';
              return { uri: relayUri, type: relayType };
            });
            return relayList;
          }
          return [];
        })
        .catch(() => {
          return [];
        });
    });
  });

  const relayResults = await Promise.allSettled(relayPromises);
  let relayList = [];
  relayResults.forEach(result => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      relayList = relayList.concat(result.value);
    }
  });

  if (relayList.length === 0) {
    throw new Error('No relay list found for the user.');
  }

  const uniqueRelays = [];
  const seen = new Set();
  relayList.forEach(relay => {
    const normalized = relay.uri.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueRelays.push(relay);
    }
  });

  const profilePromises = uniqueRelays.map(relay => {
    return limit(() => {
      return fetchEvent(relay.uri, pubkey, 0)
        .then(event => {
          if (event) {
            const metadata = JSON.parse(event.content);
            userProfile.name = metadata.name || userProfile.name;
            userProfile.picture = metadata.picture || userProfile.picture;
            userProfile.lud16 = metadata.lud16 || userProfile.lud16;
            userProfile.banner = metadata.banner || userProfile.banner;
            return true;
          }
          return false;
        })
        .catch(() => {
          return false;
        });
    });
  });

  await Promise.allSettled(profilePromises);

  return userProfile;
}

module.exports = { fetchUserProfile };
