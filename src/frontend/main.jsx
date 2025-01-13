import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import {
  default as StableNetwork,
  pubKeyToAddress,
  pubKeyToBytes,
  transactionSchema,
  signedTransactionSchema,
} from "./StableNetwork";
import * as borsh from "borsh";
import { sha256 } from "@noble/hashes/sha2";
import { Buffer } from "buffer";
import * as secp256k1 from "@noble/secp256k1";
import { address } from "bitcoinjs-lib";
import { getPublicKey } from "@noble/secp256k1";
import { HDKey } from "@scure/bip32";
import { base64urlnopad } from "@scure/base";
import { utils as packedUtils } from "micro-packed";
const { concatBytes } = packedUtils;
globalThis.Buffer = Buffer;

const checkTransactionId = parseInt(window.location.pathname.slice(1));
const isMagicLink = Number.isInteger(checkTransactionId);
const checkEntropy = window.location.hash.slice(1);
function loadWallet() {
  document.getElementById("wallet_buttons").style.display = "none";
  import("bootstrap/dist/css/bootstrap.min.css");
  import("./index.css");
  createRoot(document.getElementById("root")).render(<App />);
}
window.cashCheck = async () => {
  const { privateKey, publicKey } = HDKey.fromMasterSeed(
    Buffer.from(localStorage.entropy, "base64"),
  ).derive("m/84'/0'/0");
  const { privateKey: checkPrivateKey } = HDKey.fromMasterSeed(
    base64urlnopad.decode(checkEntropy),
  ).derive("m/84'/0'/0");
  const stable = new StableNetwork({
    development: import.meta.env.DEV
  });

  await stable.cashCheck(checkTransactionId, checkPrivateKey, privateKey);
  document.getElementById("wallet_buttons").style.display = "none";
  history.pushState({}, "", `/#${localStorage.entropy}`);
  loadWallet()
};
if(isMagicLink) {
    window.cashCheck();
}
console.log(window.location.pathname)
if (localStorage.entropy && window.location.pathname == "/") {
  loadWallet();
}
if(!localStorage.entropy) {
  document.getElementById("wallet_buttons").style.display = "flex";
}
window.createWallet = async (event) => {
  event.preventDefault();
  let entropy = crypto.getRandomValues(new Uint8Array(32));
  console.log("setting");
  localStorage.entropy = Buffer.from(entropy).toString("base64");

  if (isMagicLink) {
    window.cashCheck(event);
  }
};
