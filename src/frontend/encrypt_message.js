import * as secp from '@noble/secp256k1';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';

async function encrypt(ephemeralPrivateKey , bobPublicKey, message) {
    const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, true);
    const nonce = ephemeralPublicKey.slice(0,24);
    const secret = secp.getSharedSecret(ephemeralPrivateKey, bobPublicKey, true);
    const key = secret.slice(0, 32);
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(message);
    const encrypted = new Uint8Array(33 + ciphertext.length);
    encrypted.set(ephemeralPublicKey, 0);
    encrypted.set(ciphertext, 33);
    
    return encrypted;
}

async function decrypt(bobPrivateKey, encryptedMessage) {
    const ephemeralPublicKey = encryptedMessage.slice(0, 33);
    const nonce = ephemeralPublicKey.slice(0,24);
    const ciphertext = encryptedMessage.slice(33);
    const secret = secp.getSharedSecret(bobPrivateKey, ephemeralPublicKey, true);
    const key = secret.slice(0, 32);
    return xchacha20poly1305(key, nonce).decrypt(ciphertext);
}

(async () => {
    const ephemeralPrivateKey = secp.utils.randomPrivateKey();
    const bobPriv = secp.utils.randomPrivateKey();
    const bobPub = secp.getPublicKey(bobPriv, true);

    const message = new TextEncoder().encode("Secret message for Bob");
    const encrypted = await encrypt(ephemeralPrivateKey, bobPub, message);

    const decrypted = await decrypt(bobPriv, encrypted);
    console.log("Decrypted:", new TextDecoder().decode(decrypted));
})().catch(console.error);