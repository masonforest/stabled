import { useCallback, useState, useEffect, useMemo } from "react";
import { randomBytes } from "@noble/hashes/utils";
import Modal from "react-bootstrap/Modal";
import { QRCodeSVG } from "qrcode.react";
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import * as secp from '@noble/secp256k1';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { HDNodeWallet } from "ethers/wallet";
import { ethers, computeAddress, hexlify, getBytes, defaultPath } from "ethers";
import { base64urlnopad } from "@scure/base";
import CopyToClipboardButton from "./CopyToClipBoardButton";
import Tab from "react-bootstrap/Tab";
import Nav from "react-bootstrap/Nav";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import { Spinner } from "react-bootstrap";

function formatUsd(value) {
  if (!value) {
    return;
  }

  let USD = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return USD.format(new Number(value / 100n) + new Number(value % 100n) / 100);
}

async function encrypt(messageIndex, bobPublicKey, message) {
  const ephemeralPrivateKey = getEphemeralPrivateKey(messageIndex, messageIndex) 
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


function getEphemeralPrivateKey(accountId, messageIndex) {
  return ethers.getBytes(
    HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(
        localStorage.mnemonic,
        `e/1116' ${accountId}' /${messageIndex}`,
      ),
    ).privateKey,
  );
}


function decodePublicKey(publicKey){
  return base64urlnopad.decode(publicKey.slice(1))
}
function publicKeyToAddress(publicKey) {
  return computeAddress(hexlify(decodePublicKey(publicKey)))
}

function SendViaButton({ sendVia, loading, checkUrl, onClick }) {
  let label;
  switch (sendVia) {
    case "clipboard":
      label = "Copy to Clipboard";
      break;
    case "x":
      label = "Send via X";
      break;
    case "text":
      label = "Send via SMS";
      break;
    case "telegram":
      label = "Send via Telegram";
      break;
    case "qr":
      label = "Send via QR Code";
      break;
    default:
      label = "Send";
  }

  return (
    <a
      className="btn btn-success w-100 mt-4"
      onClick={onClick}
      disabled={loading}
      target="_blank"
      href={checkUrl}
    >
      {loading ? (
        <Spinner
          as="span"
          animation="border"
          size="sm"
          role="status"
          aria-hidden="true"
        />
      ) : label}
    </a>
  );
}
async function decryptForRecipient(recipientPrivateKey, encryptedMessage) {
  const ephemeralPublicKey = encryptedMessage.slice(0, 33);
  const nonce = ephemeralPublicKey.slice(0,24);
  const ciphertext = encryptedMessage.slice(33);
  const secret = secp.getSharedSecret(recipientPrivateKey, ephemeralPublicKey, true);
  const key = secret.slice(0, 32);
  return xchacha20poly1305(key, nonce).decrypt(ciphertext);
}


function Send({
  address,
  usdBalance,
  privateKey,
  magicLink,
  setMagicLink,
  transactions,
  setTransactions,
}) {
  const [showQrCodeModal, setShowQrCodeModal] = useState(false);
  const [checkSeed, setCheckSeed] = useState(null);
  const [key, setKey] = useState("magicLink");
  const [sendVia, setSendVia] = useState("sms");
  const [loading, setLoading] = useState(false);

  const [value, setValue] = useState(import.meta.env.DEV ? "0.01" : null);
  const [memo, setMemo] = useState("");
  const [recipientAddress, setRecipientAddress] = useState(
    import.meta.env.DEV ? "SAkX4Eh7fKqjM9SIs477AL32eV0a5Xh3-t4afuE2uYVV3" : null,
  );
  const [transactionId, setTransactionId] = useState();
  const encrypted = "0x033013c226522c574fa31cc26e5f1f5f39b31632b8028977506a1682c8a476e3a0801e34508688bf8d54871835016a1dfb2221c73b"
  // console.log(getBytes(encrypted))
  // console.log(decodePublicKey(recipientAddress))
  // console.log(getPrivateKey())
  // console.log(getBytes(window.coreWallet.privateKey))
  // console.log( decryptForSender(getBytes(window.coreWallet.privateKey), getBytes(encrypted)))
  const send = useCallback((event) => {
    event.preventDefault();
    (async () => {
      let messageIndex = await window.hDWalletMessenger.messageIndecies(window.coreWallet.address)
      let ephemeralPublicKeyAndCipherText = encrypt(messageIndex, decodePublicKey(recipientAddress), new TextEncoder().encode("test"))

      let tx = await window.fixedPriceEthExchange.buyEthAndCall(
        window.bbUSD.target,
        ethers.parseEther("0.044"),
        [
          {
            target: window.bbUSD.target,
            data: await window.bbUSD.interface.encodeFunctionData(
              "transferFrom",
              [
                window.coreWallet.address,
                window.fixedPriceEthExchange.target,
                BigInt(parseFloat(value) * 100),
              ],
            ),
            value: 0,
          },
          {
            target: window.bbUSD.target,
            data: await window.bbUSD.interface.encodeFunctionData(
              "transferFrom",
              [
                window.fixedPriceEthExchange.target,
                publicKeyToAddress(recipientAddress),
                BigInt(parseFloat(value) * 100),
              ],
            ),
            value: 0,
          },
          {
            target: window.hDWalletMessenger.target,
            data: await window.hDWalletMessenger.interface.encodeFunctionData(
              "send",
              [
                publicKeyToAddress(recipientAddress),
              ],
            ),
            value: 0,
          },
        ],
        ephemeralPublicKeyAndCipherText,
      );
      console.log("done")
      // console.log(transactions)
      console.log(tx)
      setTransactions([{transactionHash: tx.hash}, ...transactions]);
    })();
  });

  useEffect(() => {
    setCheckSeed(randomBytes(16));
  }, [])
  let check = useMemo(() =>
    checkSeed && HDNodeWallet.fromSeed(checkSeed)
  , [checkSeed])
  let checkUrl = useMemo(() => {
    if (!checkSeed) return null
    if (sendVia === "x") {
      return `https://x.com/messages/compose?text=${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${check.address}%23${base64urlnopad.encode(checkSeed)}`
    } else if (sendVia === "telegram") {
      return `https://t.me/share/url?url=${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${check.address}#${base64urlnopad.encode(checkSeed)}`
    } else {
      return `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${check.address}#${base64urlnopad.encode(checkSeed)}`
    }
    return null
  }, [checkSeed, check, sendVia])

  const fundCheck = async (event) => {
    if (sendVia === "clipboard" || sendVia === "qr" || sendVia === "sms") {
      event.preventDefault();
    }
    setLoading(true);
    try {
      let messageIndex = await window.hDWalletMessenger.messageIndecies(window.coreWallet.address) + 1n;
      let ephemeralPublicKeyAndCipherText = await encrypt(
        messageIndex,
        ethers.getBytes(check.publicKey),
        new TextEncoder().encode(memo || "")
      );

      let callData = await window.checkBook.interface.encodeFunctionData(
        "fundCheck",
        [check.address, BigInt(parseFloat(value) * 100)],
      );
      const { gasPrice } = await window.coreWallet.provider.getFeeData();

      let tx = await window.fixedPriceEthExchange.buyEthAndCall(
        window.bbUSD.target,
        ethers.parseEther("0.06"),
        [
          {
            target: window.bbUSD.target,
            data: await window.bbUSD.interface.encodeFunctionData(
              "transferFrom",
              [
                window.coreWallet.address,
                window.fixedPriceEthExchange.target,
                BigInt(parseFloat(value) * 100),
              ],
            ),
            value: 0,
          },
          {
            target: window.checkBook.target,
            data: await window.checkBook.interface.encodeFunctionData(
              "fundCheck",
              [check.address, BigInt(parseFloat(value) * 100)],
            ),
            value: ethers.parseEther("0.04"),
          },
          {
            target: window.hDWalletMessenger.target,
            data: await window.hDWalletMessenger.interface.encodeFunctionData(
              "send",
              [
                check.publicKey,
              ],
            ),
            value: 0,
          },
        ],
        ephemeralPublicKeyAndCipherText,
      );
      // Wait for transaction confirmation
      console.log(tx)
      // await tx.wait(1);
      // const logs = (await tx.wait(1)).logs;
      // console.log(logs)
      // let checkId = window.checkBook.interface.parseLog(logs[3]).args[1];
      switch (sendVia) {
        case "clipboard":
          navigator.clipboard.writeText(checkUrl);
          break;
        case "telegram":
          break;
        case "qr":
          setShowQrCodeModal(true)
          break;
        case "sms":
          navigator.share({
            url: checkUrl
          })
          break;
        default:
          break;
      }
      setValue("");
      setMemo("");
      setRecipientAddress("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h4 className="my-2 text-center fw-bold section-title">
        Balance: {formatUsd(usdBalance)}
      </h4>
        <form>
          <div className="form-floating mt-2">
            <Form.Select
              className="form-control rounded-3"
              id="sendViaSelect"
              value={sendVia}
              onChange={(e) => setSendVia(e.target.value)}
            >
              <option value="text">SMS</option>
              <option value="x">X</option>
              <option value="telegram">Telegram</option>
              <option value="clipboard">Clipboard</option>
              <option value="qr">QR Code</option>
            </Form.Select>
            <label htmlFor="sendViaSelect">Send Via</label>
          </div>
          <div className="form-floating mt-2">
            <input
              onChange={(event) => setValue(event.target.value)}
              value={value}
              type="text"
              className="form-control rounded-3"
              id="floatingInputName"
              placeholder="Name"
            />
            <label htmlFor="floatingInputName">Amount</label>
          </div>
          <div className="form-floating mt-2">
            <input
              onChange={(event) => setMemo(event.target.value)}
              value={memo}
              type="text"
              className="form-control rounded-3"
              id="floatingMemo"
              placeholder="Memo"
            />
            <label htmlFor="floatingMemo">Memo (encrypted)</label>
          </div>
          <SendViaButton sendVia={sendVia} loading={loading} checkUrl={checkUrl} onClick={fundCheck} />
        </form>
      {magicLink && (
        <>
          <div className="d-flex flex-row mt-2">
            <input
              className="form-control rounded-3"
              value={magicLink}
              readOnly
            />
            <CopyToClipboardButton text={magicLink} />
            <button
              className="btn btn-secondary mx-2"
              onClick={() => setShowQrCodeModal(true)}
            >
              Show QR Code
            </button>
          </div>
        </>
      )}
            <Modal
        show={showQrCodeModal}
        fullscreen={"md-down"}
        onHide={() => {
          setShowQrCodeModal(false);
          setInputValue("");
        }}
      >
      <Modal.Header closeButton>
          <Modal.Title>Sending ...</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <QRCodeSVG width="100%" height="100%" size={400} value={checkUrl} />
        </Modal.Body>
      </Modal>
    </>
  );
}

export default Send;
