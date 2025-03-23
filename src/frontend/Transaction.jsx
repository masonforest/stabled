import { useCallback, useState } from "react";

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

function Transaction({ ad }) {
  const [key, setKey] = useState("home");
  const [transactions, setTransations] = useState([
    {
      _type: "TransactionReceipt",
      blockHash:
        "0x17b2da8af9b28ea359d50919b9f91b949ee294dcbbef8b9dfd565d9c33d7dc1e",
      blockNumber: 23814105,
      contractAddress: null,
      cumulativeGasUsed: "525946",
      from: "0x7589C562c9D8c16212aCa7D98FD0Ef3Eb84C5af1",
      gasPrice: "30000000000",
      blobGasUsed: null,
      blobGasPrice: null,
      gasUsed: "148806",
      hash: "0x307465d93eaeb3badecd788ddd418d309d77cfd5718b6bda9c35800311390c9f",
      index: 9,
      logs: [
        {
          _type: "log",
          address: "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
          blockHash:
            "0x17b2da8af9b28ea359d50919b9f91b949ee294dcbbef8b9dfd565d9c33d7dc1e",
          blockNumber: 23814105,
          data: "0x0000000000000000000000000000000000000000000000000000000000000001",
          index: 5,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000007589c562c9d8c16212aca7d98fd0ef3eb84c5af1",
            "0x000000000000000000000000000bebe0cc3da70a132946fc5c0c5e0ca8ea3417",
          ],
          transactionHash:
            "0x307465d93eaeb3badecd788ddd418d309d77cfd5718b6bda9c35800311390c9f",
          transactionIndex: 9,
        },
        {
          _type: "log",
          address: "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
          blockHash:
            "0x17b2da8af9b28ea359d50919b9f91b949ee294dcbbef8b9dfd565d9c33d7dc1e",
          blockNumber: 23814105,
          data: "0x0000000000000000000000000000000000000000000000000000000000000000",
          index: 6,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x0000000000000000000000007589c562c9d8c16212aca7d98fd0ef3eb84c5af1",
            "0x000000000000000000000000000bebe0cc3da70a132946fc5c0c5e0ca8ea3417",
          ],
          transactionHash:
            "0x307465d93eaeb3badecd788ddd418d309d77cfd5718b6bda9c35800311390c9f",
          transactionIndex: 9,
        },
        {
          _type: "log",
          address: "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
          blockHash:
            "0x17b2da8af9b28ea359d50919b9f91b949ee294dcbbef8b9dfd565d9c33d7dc1e",
          blockNumber: 23814105,
          data: "0x0000000000000000000000000000000000000000000000000000000000000001",
          index: 7,
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x000000000000000000000000000bebe0cc3da70a132946fc5c0c5e0ca8ea3417",
            "0x0000000000000000000000004fc15d453c167c74f375c6d4864ce1e265c3dda1",
          ],
          transactionHash:
            "0x307465d93eaeb3badecd788ddd418d309d77cfd5718b6bda9c35800311390c9f",
          transactionIndex: 9,
        },
        {
          _type: "log",
          address: "0x4fC15D453C167c74F375c6d4864ce1e265c3Dda1",
          blockHash:
            "0x17b2da8af9b28ea359d50919b9f91b949ee294dcbbef8b9dfd565d9c33d7dc1e",
          blockNumber: 23814105,
          data: "0x000000000000000000000000a84c5626954d01e0200050a800e9cdc3a00de7ff00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001",
          index: 8,
          topics: [
            "0xe59efbcb92612bd16ca92cee21ac162c967c5eec816d60177539236de745e2c5",
            "0x000000000000000000000000000bebe0cc3da70a132946fc5c0c5e0ca8ea3417",
            "0x0000000000000000000000006107f8eae426870aebb7ff4f437464a78770968a",
          ],
          transactionHash:
            "0x307465d93eaeb3badecd788ddd418d309d77cfd5718b6bda9c35800311390c9f",
          transactionIndex: 9,
        },
      ],
      logsBloom:
        "0x00000000000000000000000000000000000000000080000000000004000000000000000000000000000000000000000200000000004000040000000000000000000000002000000000000008000000000000000000000000000000000010000000000000020000000000000000000002000000000000000000000010000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000040000000000000000000000400000000000002000000200000000000800008000000000000200000000000000000000000800000000080000000000000000008000000400000000000000000000000",
      status: 1,
      to: "0x000bEBe0CC3Da70a132946FC5c0c5e0ca8Ea3417",
    },
  ]);
  const [value, setValue] = useState("0.01");
  const [recipientAddress, setRecipientAddress] = useState(
    "0x4B977b6A9178b17fc96A5FA02Cb094f05436344F",
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
      setTransations([tx.hash, ...transactions]);
    })();
  });

  async function fundCheck(e) {
    e.preventDefault();
    const checkSeed = randomBytes(16);
    const check = HDNodeWallet.fromSeed(checkSeed);

    let callData = await window.checkBook.interface.encodeFunctionData(
      "fundCheck",
      [window.bbUSD.target, check.address, BigInt(parseFloat(value) * 100)],
    );

    let tx = await window.fixedPriceEthExchange.buyEthAndCallWithTokens(
      window.bbUSD.target,
      window.bbUSD.target,
      BigInt(parseFloat(value) * 100),
      ethers.parseEther("0.012"),
      window.checkBook.target,
      callData,
      ethers.parseEther("0.008"),
    );

    const logs = (await tx.wait(1)).logs;
    let checkId = window.checkBook.interface.parseLog(logs[3]).args[1];
    console.log(checkId);
    setMagicLink(
      `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}/${checkId}#${base64urlnopad.encode(checkSeed)}`,
    );
    setValue("");
    setTransations([tx.hash, ...transactions]);
  }
  console.log(transactions);
  (async () => {
    console.log(
      (
        await window.coreWallet.provider.getTransactionReceipt(
          "0x307465d93eaeb3badecd788ddd418d309d77cfd5718b6bda9c35800311390c9f",
        )
      ).toJSON(),
    );
  })();

  return (
    <>
      <h4 className="my-2 text-center fw-bold section-title">
        Balance: {formatUsd(usdBalance)}
      </h4>
      <Tab.Container id="left-tabs-example" defaultActiveKey="magicLink">
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
        <a
          target="_blank"
          key={transaction}
          href={`https://scan.coredao.org/tx/${transaction}`}
        >
          View Withdraw in Block Explorer{" "}
          <i className="bi bi-box-arrow-in-up-right"></i>
        </a>
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
