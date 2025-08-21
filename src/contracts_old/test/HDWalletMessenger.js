const secp = require("@noble/secp256k1");
const { xchacha20poly1305 } = require("@noble/ciphers/chacha");
const { randomBytes } = require("@noble/ciphers/webcrypto");
const { expect } = require("chai");
const { utils } = require("micro-packed");
const { HDNodeWallet } = require("ethers/wallet");
const { concatBytes } = utils;

describe("HDWalletMessenger", function () {
  let bbUSD, hDWalletMessenger, owner, alice, bob, to;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const BbUSD = await ethers.getContractFactory("BbUSD");
    bbUSD = await BbUSD.deploy();
    const HDWalletMessenger =
      await ethers.getContractFactory("HDWalletMessenger");
    hDWalletMessenger = await HDWalletMessenger.deploy();
  });

  describe("hDWalletMessenger", function () {
    it.only("transfers with a memo", async function () {
      const ephemeralPrivateKey = getEphemeralPrivateKey(1, 0);
      const [ownerWallet, alicesWallet, bobsWallet] = wallets(3);
      const ephemeralPublicKeyAndCipherText = await encrypt(
        ephemeralPrivateKey,
        ethers.getBytes(bobsWallet.publicKey),
        new TextEncoder().encode("test"),
      );

      await hDWalletMessenger.send(
        bob.address,
        ephemeralPublicKeyAndCipherText,
      );

      expect(
        decryptForRecipient(
          ethers.getBytes(bobsWallet.privateKey),
          ephemeralPublicKeyAndCipherText,
        ),
      ).to.equal("test");
      expect(
        decryptForSender(
          ephemeralPrivateKey,
          ethers.getBytes(bobsWallet.publicKey),
          ephemeralPublicKeyAndCipherText,
        ),
      ).to.equal("test");
    });
  });
});

const wallets = (n) =>
  Array.from(Array(n)).map((index) =>
    HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(
        config.networks.hardhat.accounts.mnemonic,
        config.networks.hardhat.accounts.path + `/${index}`,
      ),
    ),
  );

function getEphemeralPrivateKey(accountId, messageIndex) {
  return ethers.getBytes(
    HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(
        config.networks.hardhat.accounts.mnemonic,
        `e/1116' ${accountId}' /${messageIndex}`,
      ),
    ).privateKey,
  );
}

async function encrypt(ephemeralPrivateKey, bobPublicKey, message) {
  const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, true);
  const nonce = ephemeralPublicKey.slice(0, 24);
  const secret = secp.getSharedSecret(ephemeralPrivateKey, bobPublicKey, true);
  const key = secret.slice(0, 32);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(message);
  const encrypted = new Uint8Array(33 + ciphertext.length);
  encrypted.set(ephemeralPublicKey, 0);
  encrypted.set(ciphertext, 33);

  return encrypted;
}

function decryptForRecipient(recipientPrivateKey, encryptedMessage) {
  const ephemeralPublicKey = encryptedMessage.slice(0, 33);
  const nonce = ephemeralPublicKey.slice(0, 24);
  const ciphertext = encryptedMessage.slice(33);
  const secret = secp.getSharedSecret(
    recipientPrivateKey,
    ephemeralPublicKey,
    true,
  );
  const key = secret.slice(0, 32);
  return new TextDecoder().decode(
    xchacha20poly1305(key, nonce).decrypt(ciphertext),
  );
}

function decryptForSender(ephemeralPrivateKey, recipientPublicKey, encryptedMessage) {
  const ephemeralPublicKey = encryptedMessage.slice(0, 33);
  const nonce = ephemeralPublicKey.slice(0, 24);
  const ciphertext = encryptedMessage.slice(33);
  const secret = secp.getSharedSecret(
    ephemeralPrivateKey,
    recipientPublicKey,
    true,
  );
  const key = secret.slice(0, 32);
  return new TextDecoder().decode(
    xchacha20poly1305(key, nonce).decrypt(ciphertext),
  );
}
