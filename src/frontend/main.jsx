import { Buffer } from "buffer";
import { utils as packedUtils } from "micro-packed";
import { createRoot } from "react-dom/client";
import { base64urlnopad } from "@scure/base";
import { HDNodeWallet } from "ethers/wallet";
import { ethers } from "ethers";
import App from "./App.jsx";
const { concatBytes } = packedUtils;
globalThis.Buffer = Buffer;

  import("bootstrap/dist/css/bootstrap.min.css");
  import("./index.css");
  createRoot(document.getElementById("root")).render(<App />);
const checkId = parseInt(window.location.pathname.slice(1));
const isMagicLink = Number.isInteger(checkId);
const checkEntropy = window.location.hash.slice(1);


localStorage.mnemonic ||=  ethers.Wallet.createRandom().mnemonic.phrase
// const checkEntropy = window.location.hash.slice(1);
// function loadWallet() {
//   document.getElementById("wallet_buttons").style.display = "none";
//   import("bootstrap/dist/css/bootstrap.min.css");
//   import("./index.css");
//   createRoot(document.getElementById("root")).render(<App />);
// }
// window.cashCheck = async () => {
//   const { privateKey, publicKey } = HDKey.fromMasterSeed(
//     Buffer.from(localStorage.entropy, "base64"),
//   ).derive("m/84'/0'/0");
//   const { privateKey: checkPrivateKey } = HDKey.fromMasterSeed(
//     base64urlnopad.decode(checkEntropy),
//   ).derive("m/84'/0'/0");
//   const stable = new StableNetwork({
//     development: import.meta.env.DEV,
//   });

//   await stable.cashCheck(checkTransactionId, checkPrivateKey, privateKey);
// };
// (async function () {
//   if (isMagicLink && localStorage.entropy) {
//     await window.cashCheck();
//   }
//   if (localStorage.entropy && window.location.pathname == "/") {
//     document.getElementById("wallet_buttons").style.display = "none";
//     history.pushState({}, "", `/#${localStorage.entropy}`);
//     loadWallet();
//   }
// })();
// if (!localStorage.entropy) {
//   document.getElementById("wallet_buttons").style.display = "flex";
// }
// window.createWallet = async (event) => {
//   event.preventDefault();
//   let entropy = crypto.getRandomValues(new Uint8Array(32));
//   localStorage.entropy = Buffer.from(entropy).toString("base64");

//   if (isMagicLink) {
//     window.cashCheck(event);
//   }

//   history.pushState({}, "", `/#${localStorage.entropy}`);
//   loadWallet();
// };
