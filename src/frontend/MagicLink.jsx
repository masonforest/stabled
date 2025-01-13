import React, {
  useMemo,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { stable } from "./App";
import * as secp256k1 from "@noble/secp256k1";
import CopyToClipboardButton from "./CopyToClipBoardButton";
import { HDKey } from "@scure/bip32";
import { base64urlnopad } from "@scure/base";
import { addressToObject, pubKeyToBytes } from "./StableNetwork";
import { randomBytes } from "@noble/hashes/utils";

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

function MagicLink({
  address,
  usdBalance,
  privateKey,
  setShowQrCodeModal,
  setMagicLink,
  magicLink,
}) {
  //   const [magicLink, setMagicLink] = usmaeState(null);
  const [inputValue, setInputValue] = useState("");

  async function send(e) {
    e.preventDefault();
    let temporaryEntropy = randomBytes(16);
    const { publicKey: temporaryPublicKey } =
      HDKey.fromMasterSeed(temporaryEntropy).derive("m/84'/0'/0");
    let transactionId = await stable.postTransaction(
      {
        CreateCheck: {
          signer: pubKeyToBytes(temporaryPublicKey),
          currency: { Usd: {} },
          value: Math.round(parseFloat(inputValue) * 100),
        },
      },
      privateKey,
    );
    setMagicLink(
      `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${transactionId}#${base64urlnopad.encode(temporaryEntropy)}`,
    );
  }
  return (
    <>
      {address}
      <h4 className="my-2 text-center fw-bold section-title">
        {" "}
        Balance: {formatUsd(usdBalance)}
      </h4>
      <form onSubmit={send}>
        <div className="form-floating">
          <input
            onChange={(event) => setInputValue(event.target.value)}
            value={inputValue}
            type="text"
            className="form-control rounded-3"
            id="floatingInputName"
            placeholder="Name"
          />
          <label htmlFor="floatingInputName">Amount</label>
        </div>
        <input
          className="btn btn-success w-100 mt-4"
          type="submit"
          value="Create Magic Payment Link"
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
    </>
  );
}

export default MagicLink;
