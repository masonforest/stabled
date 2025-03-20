import { useCallback, useState } from "react";
import { ethers } from "ethers";


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

function Send({ address, usdBalance, privateKey }) {
  // console.log(ethers.parseEther("100"))
  const [value, setValue] = useState("0.01");
  const [recipientAddress, setRecipientAddress] = useState("0x1d2AF03Faa33C04F94EA6950305A466d4F170507");
  const [transactionId, setTransactionId] = useState();
  const send = useCallback((event) => {
    event.preventDefault();
    (async () => {
      // const { maxFeePerGas, maxPriorityFeePerGas } =
    // await window.coreWallet.getFeeData();

      // console.log(fixedPriceEthExchange.target)
      // console.log(window.bbUSD.target)
      // await window.bbUSD.connect(window.coreWallet).approve(fixedPriceEthExchange.target, ethers.MaxUint256)
      let tx = await bbUSD.transfer(recipientAddress, Math.round(parseFloat(value * 100)))
      setRecipientAddress("");
      setValue("");
      await tx.wait(1);
      await window.fixedPriceEthExchange.buyEth(window.bbUSD.target, ethers.parseEther("0.01"))
        //     console.log({
        //     to: recipientAddress,
        //     value: Math.round(parseFloat(value * 100)),
        // privateKey,
        //     })

    })();
  });

  // console.log(usdBalance)
  return (
    <>
      {window.coreWallet && window.coreWallet.address}
      <h4 className="my-2 text-center fw-bold section-title">
        {" "}
        Balance: {formatUsd(usdBalance)}
      </h4>
      <form onSubmit={send}>
        <div className="form-floating">
          <input
            onChange={(event) => setRecipientAddress(event.target.value)}
            value={recipientAddress}
            type="text"
            className="form-control rounded-3"
            id="floatingInputName"
            placeholder="Address"
          />
          <label htmlFor="floatingInputName">Address</label>
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
        <input
          className="btn btn-success w-100 mt-4"
          type="submit"
          value="Send"
        />
      </form>
      {transactionId && (
        <a
          target="_blank"
          href={
            transactionId &&
            Buffer.from(
              `https://mempool.space/tx/${Buffer.from(transactionId).toString("hex")}`,
            )
          }
        >
          View Withdraw in Block Explorer{" "}
          <i class="bi bi-box-arrow-in-up-right"></i>
        </a>
      )}
    </>
  );
}

export default Send;
