import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import * as secp256k1 from "@noble/secp256k1";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { ethers } from "ethers";
import { HDNodeWallet } from "ethers/wallet";
import { base64urlnopad } from "@scure/base";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import BbUsdAbi from "./abi/contracts/BbUSD.sol/BbUSD.json";
import Deposit from "./Deposit";
import FixedPriceEthExchangeAbi from "./abi/contracts/FixedPriceEthExchange.sol/FixedPriceEthExchange.json";
import CheckBookAbi from "./abi/contracts/CheckBook.sol/CheckBook.json";
import Loading from "./Loading";
import MagicLink from "./MagicLink";
import Send from "./Send";
import SideNav from "./SideNav";
// import { generatePrivateKey } from "viem/accounts";
import { default as StableNetwork } from "./StableNetwork";
// import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import Withdraw from "./Withdraw";
// import Cookies from 'universal-cookie';
// console.log(ethers)
secp256k1.etc.hmacSha256Sync = (k, ...m) =>
  hmac(sha256, k, secp256k1.etc.concatBytes(...m));
const mnemonic2 =
  "base water near armed law index boil knife female veteran nature multiply";
const checkId = parseInt(window.location.pathname.slice(1));
// const isMagicLink = Number.isInteger(checkId);
const checkEntropy = window.location.hash.slice(1);

let USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

function formatBtc(value) {
  if (!value) {
    return;
  }
  return (
    new Number(value / 10000000n) + new Number(value % 10000000n) / 10000000
  );
}

export const stable = new StableNetwork({
  development: import.meta.env.DEV,
});

function App() {
  const [transactions, setTransactions] = useState([
    // "0x409e28d995478f3f5236756451d77a1b8930e05d299e11cd632ea1721ab49451",
  ]);
  const [checkBalance, setCheckBalance] = useState();
  const [magicLink, setMagicLink] = useState();
  const [magicId, setMagicId] = useState(
    parseInt(window.location.pathname.slice(1)),
  );

  const [usdBalance, setUsdBalance] = useState();
  const [utxos, setUtxos] = useState([]);

  useEffect(() => {
    const coreProvider = new ethers.JsonRpcProvider("https://rpc.coredao.org");
    window.coreWallet = ethers.Wallet.fromPhrase(
      localStorage.mnemonic,
      coreProvider,
    );
  }, []);

  // useEffect(() => {
  //   async function fetchData() {
  //     setCheckBalance(window.BbUSD.checks(check.address))
  //   }
  //   fetchData();
  // })
  useEffect(() => {
    const es = new EventSource(
      `http://192.168.0.11/sse?address=${window.coreWallet.address}`,
      {
        withCredentials: true,
      },
    );
    es.onmessage = async ({ data }) => {
      const { log, transactionHash } = JSON.parse(data);
      let event = window.bbUSD.interface.parseLog(log);
      setUsdBalance(await window.bbUSD.balanceOf(window.coreWallet.address));
    };
    es.onerror = (e, x) => console.log(e);
    return () => es.close();
  }, []);
  useEffect(() => {
    async function fetchData() {
      window.bbUSD = new ethers.Contract(
        "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
        BbUsdAbi,
        window.coreWallet,
      );

      window.checkBook = new ethers.Contract(
        "0x92Ec2ac50CFeBea0A4AE6ce5df7DB0cC90FF42a9",
        CheckBookAbi,
        window.coreWallet,
      );
      // console.log((await window.bbUSD.balanceOf(window.coreWallet.address)));
      setUsdBalance(await window.bbUSD.balanceOf(window.coreWallet.address));
      // bbUSD.on("*", async (resp) => {
      // setUsdBalance((await window.bbUSD.balanceOf(window.coreWallet.address)));
      // console.log("response: ", resp);
      // });
      window.fixedPriceEthExchange = new ethers.Contract(
        "0xeee7616a6e44f8C91e4a52dB33B75B782Aa55f65",
        FixedPriceEthExchangeAbi,
        window.coreWallet,
      );
      if (magicId) {
        const checkSeed = base64urlnopad.decode(checkEntropy);
        const check = HDNodeWallet.fromSeed(checkSeed);
        const coreProvider = new ethers.JsonRpcProvider(
          "https://rpc.coredao.org",
        );
        window.checkWallet = check.connect(coreProvider);
        setCheckBalance(
          await window.checkBook.checkAmounts(window.bbUSD.target, check.address),
        );
        // window.bbUSD = new ethers.Contract(
        //   "0x61ee0769fb9249c69A82f46B7C6dF94576a9392d",
        //   BbUsdAbi,
        //   window.coreWallet,
        // );
      }
    }
    fetchData();
  }, []);
  const [showQrCodeModal, setShowQrCodeModal] = useState(false);

  const redeemCheck = useCallback(
    (event) => {
      event.preventDefault();
      (async () => {
        console.log(window.coreWallet.address);
        window.bbUSD.connect(window.checkWallet);
        // window.bbUSD.once(window.bbUSD.filters.CheckRedeemed(window.coreWallet.address), async (event) => {
        //   setMagicId()
        // })

        const checkAmount = await window.checkBook.checkAmounts(
          bbUSD.target,
          window.checkWallet.address,
        );
        setUsdBalance(usdBalance + checkAmount);
        setMagicId();
        history.pushState({}, "", `/`);
        let tx = await window.checkBook
          .connect(window.checkWallet)
          .redeemCheck(bbUSD.target, window.coreWallet.address);
          setTransactions([tx.hash, ...transactions]);
      })();
      
    },
    [usdBalance],
  );
  const isLoading = useMemo(
    () => [usdBalance].some((value) => typeof value === "undefined"),
    [usdBalance],
  );
  return isLoading ? (
    <Loading></Loading>
  ) : (
    <div className="wrapper">
      <header className="top-header fixed-top border-bottom d-flex align-items-center">
        <nav className="navbar navbar-expand w-100 p-0 gap-3 align-items-center">
          <div
            className="nav-button"
            data-bs-toggle="offcanvas"
            data-bs-target="#offcanvasSidenav"
          >
            <a href="#">
              <i className="bi bi-list"></i>
            </a>
          </div>
          <div className="brand-logo">Stable Network Wallet</div>
          {window.coreWallet && window.coreWallet.address}{" "}
          <form className="searchbar">
            <div className="position-absolute top-50 translate-middle-y search-icon start-0">
              <i className="bi bi-search"></i>
            </div>
            <input
              className="form-control px-5"
              type="text"
              placeholder="Search for anything"
            />
            <div className="position-absolute top-50 translate-middle-y end-0 search-close-icon">
              <i className="bi bi-x-lg"></i>
            </div>
          </form>
        </nav>
      </header>
      <div className="page-content">
        <h1></h1>
        <Tab.Container id="left-tabs-example" defaultActiveKey="send">
          <Tab.Content>
            <Tab.Pane eventKey="deposit">
              {" "}
              <Deposit />
            </Tab.Pane>
            <Tab.Pane eventKey="withdraw">
              {" "}
              <Withdraw />
            </Tab.Pane>
            <Tab.Pane eventKey="magic-link">
              <MagicLink
                address={null}
                usdBalance={usdBalance}
                privateKey={null}
                setShowQrCodeModal={setShowQrCodeModal}
                magicLink={magicLink}
                setMagicLink={setMagicLink}
              />
            </Tab.Pane>
            <Tab.Pane eventKey="send">
              <Send
                usdBalance={usdBalance}
                magicLink={magicLink}
                setShowQrCodeModal={setShowQrCodeModal}
                setMagicLink={setMagicLink}
                privateKey={null}
                transactions={transactions}
                setTransactions={setTransactions}
              />
            </Tab.Pane>
          </Tab.Content>
          <footer className="page-footer fixed-bottom border-top d-flex align-items-center">
            <nav className="navbar navbar-expand p-0 flex-grow-1">
              <div className="navbar-nav align-items-center justify-content-between w-100">
                <Nav.Link eventKey="history">
                  <div className="d-flex flex-column align-items-center">
                    <div className="icon">
                      <i className="bi bi-receipt"></i>
                    </div>
                    <div className="name">History</div>
                  </div>
                </Nav.Link>
                <Nav.Link eventKey="magic-link">
                  <div className="d-flex flex-column align-items-center">
                    <div className="icon">
                      <i className="bi bi-magic"></i>
                    </div>
                    <div className="name">Magic Link</div>
                  </div>
                </Nav.Link>
                <Nav.Link eventKey="send">
                  <div className="d-flex flex-column align-items-center">
                    <div className="icon">
                      <i className="bi bi-arrow-up-right-square"></i>
                    </div>
                    <div className="name">Send</div>
                  </div>
                </Nav.Link>
              </div>
            </nav>
          </footer>
        </Tab.Container>
      </div>
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
          <QRCodeSVG width="100%" height="100%" size={400} value={magicLink} />
        </Modal.Body>
      </Modal>

      <Modal show={magicId} fullscreen={"md-down"}>
        <Modal.Header closeButton>
          <Modal.Title>Sending...</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <button
            onClick={(e) => redeemCheck(e)}
            className="btn btn-success btn-xlg w-100"
          >
            <title>Accept {formatUsd(checkBalance)}</title>
            Accept {formatUsd(checkBalance)}
          </button>
        </Modal.Body>
      </Modal>
      <Modal
        show={utxos.length}
        fullscreen={"md-down"}
        onHide={() => setUtxos([])}
      >
        <Modal.Header closeButton>
          <Modal.Title>Claim Bitcoin Payment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            A payment was made to you in Bitcoin transaction{" "}
            <a
              target="_blank"
              href={`https://mempool.space/tx/${utxos[0] && Buffer.from(utxos[0].transaction_id).toString("hex")}?mode=details`}
            >
              {utxos[0] &&
                Buffer.from(utxos[0].transaction_id)
                  .toString("hex")
                  .substr(0, 6) +
                  ".." +
                  Buffer.from(utxos[0].transaction_id)
                    .toString("hex")
                    .substr(-6)}
            </a>
          </p>
          <button
            onClick={() => claimUtxo(utxos[0])}
            className="btn btn-success btn-xlg w-100"
          >
            <title>
              Accept {formatBtc(utxos[0] && utxos[0].value)} on the Stable
              Network
            </title>
            Accept {formatBtc(utxos[0] && utxos[0].value)} BTC
          </button>
        </Modal.Body>
      </Modal>
      <SideNav />
    </div>
  );
}

export default App;
