import { useCallback, useState } from "react";
import { randomBytes } from "@noble/hashes/utils";
import { HDNodeWallet } from "ethers/wallet";
import { ethers } from "ethers";
import { base64urlnopad } from "@scure/base";
import CopyToClipboardButton from "./CopyToClipBoardButton";
import Tab from "react-bootstrap/Tab";
import Nav from "react-bootstrap/Nav";
import Card from "react-bootstrap/Card";

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

function Send({
  address,
  usdBalance,
  privateKey,
  magicLink,
  setMagicLink,
  setShowQrCodeModal,
  transactions,
  setTransactions,
}) {
  const [key, setKey] = useState("toAddress");

  const [value, setValue] = useState("0.01");
  const [recipientAddress, setRecipientAddress] = useState(
    import.meta.env.DEV ? "0x74FC3892938318123E37C2304d03aeC09DC506Eb": null
  );
  const [transactionId, setTransactionId] = useState();
  const send = useCallback((event) => {
    event.preventDefault();
    (async () => {

      let callData = await window.bbUSD.interface.encodeFunctionData(
        "transferFrom",
        [
          window.fixedPriceEthExchange.target,
          recipientAddress,
          BigInt(parseFloat(value) * 100),
        ],
      );

      let tx = await window.fixedPriceEthExchange.buyEthAndCallWithTokens(
        window.bbUSD.target,
        window.bbUSD.target,
        BigInt(parseFloat(value) * 100),
        ethers.parseEther("0.012"),
        window.bbUSD.target,
        callData,
        0,
      );
      setTransactions([tx.hash, ...transactions]);
    })();
  });

  async function fundCheck(e) {
    e.preventDefault();
    const checkSeed = randomBytes(16);
    const check = HDNodeWallet.fromSeed(checkSeed);

    console.log("here")
    let callData = await window.checkBook.interface.encodeFunctionData(
      "fundCheck",
      [window.bbUSD.target, check.address, BigInt(parseFloat(value) * 100)],
    );
    console.log("here 1")
    const { gasPrice } = await window.coreWallet.provider.getFeeData();

    const estimatedGas = await window.fixedPriceEthExchange.buyEthAndCallWithTokens.estimateGas(
      window.bbUSD.target,
      window.bbUSD.target,
      BigInt(parseFloat(value) * 100),
      ethers.parseEther("0.012"),
      window.checkBook.target,
      callData,
      ethers.parseEther("0.008"),
    );

    console.log("here 2")
    console.log(estimatedGas * gasPrice)
    console.log(window.bbUSD.target)
    let tx = await window.fixedPriceEthExchange.buyEthAndCallWithTokens(
      window.bbUSD.target,
      window.bbUSD.target,
      BigInt(parseFloat(value) * 100),
      estimatedGas * gasPrice,
      window.checkBook.target,
      callData,
      ethers.parseEther("0.008"), {
        gasLimit: 250000
      }
    );

    const logs = (await tx.wait(1)).logs;
    console.log(logs)
    let checkId = window.checkBook.interface.parseLog(logs[3]).args[1];
    setMagicLink(
      `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${checkId}#${base64urlnopad.encode(checkSeed)}`,
    );
    setValue("");
    setTransactions([tx.hash, ...transactions]);
  }

  return (
    <>
      <h4 className="my-2 text-center fw-bold section-title">
        Balance: {formatUsd(usdBalance)}
      </h4>
      <Tab.Container id="left-tabs-example" activeKey={key} onSelect={(k) => setKey(k)} defaultActiveKey="magicLink">
        <Nav fill variant="tabs">
          <Nav.Item className="btn-success">
            <Nav.Link eventKey="magicLink">Magic Link</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="toAddress">To Address</Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content>
          <Tab.Pane eventKey="magicLink">
            <div
              style={{
                border: "1px solid #dee2e6",
                padding: "10px",
                borderTop: "none",
              }}
            >
              <form onSubmit={fundCheck}>
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
                  value="Create Magic Link"
                />
              </form>
            </div>
          </Tab.Pane>
          <Tab.Pane eventKey="toAddress">
            <div
              style={{
                border: "1px solid #dee2e6",
                padding: "10px",
                borderTop: "none",
              }}
            >
              <form onSubmit={send}>
                <div className="form-floating">
                  <input
                    onChange={(event) =>
                      setRecipientAddress(event.target.value)
                    }
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
            </div>
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
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
      {transactions.map((transaction) => (
        <Card key={transaction} className="mt-3">
          <Card.Body>
            <a
              target="_blank"
              href={`https://scan.coredao.org/tx/${transaction}`}
            >
              View Transaction in Block Explorer{" "}
              <i className="bi bi-box-arrow-in-up-right"></i>
            </a>
          </Card.Body>
        </Card>
      ))}
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
