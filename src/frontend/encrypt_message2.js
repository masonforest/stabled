import * as secp from '@noble/secp256k1';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';

async function dualEncrypt(alicePublicKey, bobPublicKey, message) {
    // Generate single ephemeral key pair for both encryptions
    const ephemeralPrivateKey = secp.utils.randomPrivateKey();
    const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, true);
    
    // Use same nonce for both encryptions
    const nonce = randomBytes(24);
    
    // Encrypt for Alice
    const secretAlice = secp.getSharedSecret(ephemeralPrivateKey, alicePublicKey, true);
    const keyAlice = secretAlice.slice(0, 32);
    const ciphertextAlice = xchacha20poly1305(keyAlice, nonce).encrypt(message);
    
    // Encrypt for Bob
    const secretBob = secp.getSharedSecret(ephemeralPrivateKey, bobPublicKey, true);
    const keyBob = secretBob.slice(0, 32);
    const ciphertextBob = xchacha20poly1305(keyBob, nonce).encrypt(message);
    
    // Package components (ephemeralPub + nonce + ciphertextAlice + ciphertextBob)
    const encrypted = new Uint8Array(33 + 24 + ciphertextAlice.length + ciphertextBob.length);
    encrypted.set(ephemeralPublicKey, 0);
    encrypted.set(nonce, 33);
    encrypted.set(ciphertextAlice, 57);
    encrypted.set(ciphertextBob, 57 + ciphertextAlice.length);
    
    return encrypted;
}

async function dualDecrypt(privateKey, encryptedMessage) {
    // Extract components
    const ephemeralPublicKey = encryptedMessage.slice(0, 33);
    const nonce = encryptedMessage.slice(33, 57);
    
    // Try decrypting Alice's portion first
    const ciphertextAlice = encryptedMessage.slice(57, encryptedMessage.length/2 + 57/2);
    try {
        const secret = secp.getSharedSecret(privateKey, ephemeralPublicKey, true);
        const key = secret.slice(0, 32);
        return xchacha20poly1305(key, nonce).decrypt(ciphertextAlice);
    } catch (e) {
        // If Alice's fails, try Bob's portion
        const ciphertextBob = encryptedMessage.slice(57 + ciphertextAlice.length);
        const secret = secp.getSharedSecret(privateKey, ephemeralPublicKey, true);
        const key = secret.slice(0, 32);
        return xchacha20poly1305(key, nonce).decrypt(ciphertextBob);
    }
}

// Example Usage
(async () => {
    // Generate key pairs
    const alicePriv = secp.utils.randomPrivateKey();
    const alicePub = secp.getPublicKey(alicePriv, true);
    const bobPriv = secp.utils.randomPrivateKey();
    const bobPub = secp.getPublicKey(bobPriv, true);

    // Encrypt message for both
    const message = new TextEncoder().encode("Shared secret message");
    const encrypted = await dualEncrypt(alicePub, bobPub, message);
    console.log("Combined message length:", encrypted.length);

    // Alice decrypts
    const aliceDecrypted = await dualDecrypt(alicePriv, encrypted);
    console.log("Alice decrypted:", new TextDecoder().decode(aliceDecrypted));

    // Bob decrypts
    const bobDecrypted = await dualDecrypt(bobPriv, encrypted);
    console.log("Bob decrypted:", new TextDecoder().decode(bobDecrypted));
})().catch(console.error);