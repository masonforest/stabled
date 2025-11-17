import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/hashes/utils";
import * as secp from "@noble/secp256k1";
import { base64urlnopad } from "@scure/base";
import { ethers } from "ethers";
import { HDNodeWallet } from "ethers/wallet";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { Spinner } from "react-bootstrap";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import CopyToClipboardButton from "./CopyToClipBoardButton";
import { formatUsd } from "./App";

async function encrypt(messageIndex, bobPublicKey, message) {
  const ephemeralPrivateKey = getEphemeralPrivateKey(
    messageIndex,
    messageIndex
  );
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
        `e/1116' ${accountId}' /${messageIndex}`
      )
    ).privateKey
  );
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
    case "sms":
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
      ) : (
        label
      )}
    </a>
  );
}
function Send({ usdBalance, magicLink, setUsdBalance, asUSDFExchangeRate }) {
  const [showQrCodeModal, setShowQrCodeModal] = useState(false);
  const [checkSeed, setCheckSeed] = useState(null);
  const [sendVia, setSendVia] = useState("clipboard");
  const [loading, setLoading] = useState(false);

  const [value, setValue] = useState(import.meta.env.DEV ? "0.01" : null);
  const [memo, setMemo] = useState("");

  useEffect(() => {
    setCheckSeed(randomBytes(16));
  }, []);
  let check = useMemo(
    () => checkSeed && HDNodeWallet.fromSeed(checkSeed),
    [checkSeed]
  );
  let checkUrl = useMemo(() => {
    if (!checkSeed) return null;
    if (sendVia === "x") {
      return `https://x.com/messages/compose?text=${
        window.location.protocol
      }//${window.location.hostname}${
        window.location.port ? ":" + window.location.port : ""
      }/${check.address}%23${base64urlnopad.encode(checkSeed)}`;
    } else if (sendVia === "telegram") {
      return `https://t.me/share/url?url=${window.location.protocol}//${
        window.location.hostname
      }${window.location.port ? ":" + window.location.port : ""}/${
        check.address
      }#${base64urlnopad.encode(checkSeed)}`;
    } else {
      return `${window.location.protocol}//${window.location.hostname}${
        window.location.port ? ":" + window.location.port : ""
      }/${check.address}#${base64urlnopad.encode(checkSeed)}`;
    }
  }, [checkSeed, check, sendVia]);

  if (!check) return null;

  const signPermitV4 = async function ({ signer, tokenAddress, spender }) {
    const provider = signer.provider;

    const abi = [
      "function name() view returns (string)",
      "function nonces(address) view returns (uint256)",
    ];
    const token = new ethers.Contract(tokenAddress, abi, provider);

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      owner: signer.address,
      spender: spender,
      value: ethers.MaxUint256,
      nonce: await token.nonces(signer.address),
      deadline: ethers.MaxUint256,
    };

    const chainId = (await provider.getNetwork()).chainId;
    const domain = {
      name: await token.name(),
      version: "1",
      chainId,
      verifyingContract: token.target,
    };
    console.log("domain", domain);
    console.log("value", value);

    const signature = await signer.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(signature);

    return {
      v,
      r,
      s,
    };
  };

  const fundCheck = async (event) => {
    if (sendVia === "clipboard" || sendVia === "qr" || sendVia === "sms") {
      event.preventDefault();
      console.log("preventing default");
    }
    setLoading(true);
    try {
      let messageIndex =
        (await window.hDWalletMessenger.messageIndecies(
          window.coreWallet.address
        )) + 1n;
      let ephemeralPublicKeyAndCipherText = await encrypt(
        messageIndex,
        ethers.getBytes(check.publicKey),
        new TextEncoder().encode(memo || "")
      );
      // let transferValue = BigInt(parseFloat(value) * 100);
      const { gasPrice } = await window.coreWallet.provider.getFeeData();

      const { v, r, s } = await signPermitV4({
        signer: window.coreWallet,
        tokenAddress: window.asUSDF.target,
        spender: window.checkBook.target,
      });
      console.log("after swpm");
      console.log(ethers.MaxUint256);
      console.log([v, r, s]);
      console.log("after swpm2");
      let callArgs = [
        ethers.parseEther("0.0000087"),
        [
          {
            target: window.asUSDF.target,
            data: await window.asUSDF.interface.encodeFunctionData("permit", [
              window.coreWallet.address,
              window.fixedPriceEthExchange.target,
              ethers.MaxUint256,
              ethers.MaxUint256,
              v,
              r,
              s,
            ]),
            value: 0,
          },
          {
            target: window.asUSDF.target,
            data: await window.asUSDF.interface.encodeFunctionData(
              "transferFrom",
              [
                window.coreWallet.address,
                window.fixedPriceEthExchange.target,
                0n
                // BigInt(parseFloat(value) * 100),
              ],
            ),
            value: 0,
          },
          // {
          //   target: window.checkBook.target,
          //   data: await window.checkBook.interface.encodeFunctionData(
          //     "fundCheck",
          //     [check.address, BigInt(parseFloat(value) * 100)],
          //   ),
          //   value: ethers.parseEther("0.04"),
          // },
          // {
          //   target: window.hDWalletMessenger.target,
          //   data: await window.hDWalletMessenger.interface.encodeFunctionData(
          //     "send",
          //     [check.publicKey],
          //   ),
          //   value: 0,
          // },
        ],
        ephemeralPublicKeyAndCipherText,
      ];
      // let estimatedGas =
      //   await window.fixedPriceEthExchange.buyEthAndCall.estimateGas(
      //     ...callArgs,
      //   );
      // callArgs[1] = estimatedGas * 2n * gasPrice + ethers.parseEther("0.04");
      // console.log(estimatedGas * 2n)
      let tx = await window.checkBook.permitAndFundCheck(
        check.address,
        ethers.parseEther(value),
        ethers.MaxUint256,
        ethers.MaxUint256,
        v,
        r,
        s,
        {
          gasPrice: ethers.parseUnits("0.051", "gwei"),  
          gasLimit: 250000,
        },
      );

      // let tx = await window.fixedPriceEthExchange.permit(
      //   // window.coreWallet.address,
      //   // window.fixedPriceEthExchange.target,
      //   ethers.MaxUint256,
      //   ethers.MaxUint256,
      //   v,
      //   r,
      //   s,
      //   {
      //     gasLimit: 250000,
      //     gasPrice: ethers.parseUnits("0.051", "gwei"),
      //   }
      // );
      setUsdBalance(usdBalance - ethers.parseEther(value) - 1n);
      await tx.wait(0);
      console.log(tx);

      switch (sendVia) {
        case "clipboard":
          setTimeout(() => {
            navigator.clipboard.writeText(checkUrl);
          }, 0);
          break;
        case "telegram":
          break;
        case "qr":
          setShowQrCodeModal(true);
          break;
        case "sms":
          // if (/iPhone/.test(navigator.userAgent)) {
          //   console.log("going to")
          //   console.log(`sms:?&body=${encodeURIComponent(checkUrl)}`)
          //   window.location.replace(
          //     `sms:?&body=${encodeURIComponent(checkUrl)}`
          //   );
          // } else {
            navigator.share({
              url: checkUrl,
            });
          // }
          break;
        default:
          break;
      }
      setValue("");
      setMemo("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h4 className="my-2 text-center fw-bold section-title">
        Balance:  {asUSDFExchangeRate && ethers.formatEther(asUSDFExchangeRate * usdBalance/ ethers.WeiPerEther)}
      </h4>
      <form>
        <div className="form-floating mt-2">
          <Form.Select
            className="form-control rounded-3"
            id="sendViaSelect"
            value={sendVia}
            onChange={(e) => setSendVia(e.target.value)}
          >
            <option value="sms">SMS</option>
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
        <SendViaButton
          sendVia={sendVia}
          loading={loading}
          checkUrl={checkUrl}
          onClick={fundCheck}
        />
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
