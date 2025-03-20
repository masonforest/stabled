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

  // console.log(new Number(value / ethers.WeiPerEther) + new Number(value % ethers.WeiPerEther))
  return USD.format(new Number(ethers.formatEther(value)));
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
  const [inputValue, setInputValue] = useState("0.01");

  async function send(e) {
    e.preventDefault();
    // let checkEntropy = randomBytes(16);
    const checkSeed = randomBytes(16); 
    const check = HDNodeWallet.fromSeed(checkSeed);
    
    // let check = ethers.Wallet.createRandom()
    // console.log(check.privateKey)
    // console.log(check.address)
// console.log(check.mnemonic.entropy)
    window.bbUSD.once(window.bbUSD.filters.CheckFunded(null, window.coreWallet.address), async (event) => {
      // console.log(event.args[0])
      // console.log((new TextDecoder()).decode(checkSeed).length)
      // console.log(checkSeed)
      // console.log(base64urlnopad.encode(checkSeed).length)
      console.log(check.address)
      setMagicLink(
        `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${event.args[0]}#${base64urlnopad.encode(checkSeed)}`,
      );
    })
    let tx = await bbUSD.fundCheck(check.address ,ethers.parseEther(inputValue))
    setInputValue("")
    await tx.wait(1);
    tx = await window.coreWallet.sendTransaction(
      {
       to: check.address,
       value:  ethers.parseEther("0.01"), 
      }
    )
    await tx.wait(1);
    console.log(tx)
    window.fixedPriceEthExchange.buyEth(window.bbUSD.target, ethers.parseEther("0.02"))
  }

  useEffect(() => {
    // console.log(contract.filters.CheckFunded(null, window.coreWallet.address))
  },[]);


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
