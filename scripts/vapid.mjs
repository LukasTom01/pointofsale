// Vygeneruje VAPID klíče pro push notifikace: `npm run vapid` → vložte do .env / Vercelu.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:vas@email.cz"`);
