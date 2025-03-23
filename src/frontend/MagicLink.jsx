import { randomBytes } from "@noble/hashes/utils";
import { base64urlnopad } from "@scure/base";
import { ethers } from "ethers";
import { HDNodeWallet } from "ethers/wallet";
import { useEffect, useState } from "react";
import CopyToClipboardButton from "./CopyToClipBoardButton";

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
  setShowQrCodeModal,
  setMagicLink,
  magicLink,
}) {
  const [inputValue, setInputValue] = useState("0.01");

  async function send(e) {
    e.preventDefault();
    const checkSeed = randomBytes(16);
    const check = HDNodeWallet.fromSeed(checkSeed);

    let callData = await window.checkBook.interface.encodeFunctionData(
      "fundCheck",
      [
        window.bbUSD.target,
        check.address,
        BigInt(parseFloat(inputValue) * 100),
      ],
    );

    let tx = await window.fixedPriceEthExchange.buyEthAndCallWithTokens(
      window.bbUSD.target,
      window.bbUSD.target,
      BigInt(parseFloat(inputValue) * 100),
      ethers.parseEther("0.012"),
      window.checkBook.target,
      callData,
      ethers.parseEther("0.008"),
    );

    const logs = (await tx.wait(1)).logs;
    let checkId = window.checkBook.interface.parseLog(logs[3]).args[1];
    setMagicLink(
      `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${checkId}#${base64urlnopad.encode(checkSeed)}`,
    );
    setInputValue("");
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
