#!/usr/bin/env node
// Generates VAPID keys for web push notifications.
// Usage: node scripts/generate-vapid-keys.js
// Add the output to your .env file.

const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();

console.log("Add these to your .env file:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_CONTACT=mailto:admin@yourdomain.com`);
