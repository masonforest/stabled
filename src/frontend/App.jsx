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
import BbUsdAbi from "./BBUsdABI.json";
import Deposit from "./Deposit";
import FixedPriceEthExchangeAbi from "./FixedPriceEthExchangeABI.json";
import Loading from "./Loading";
import MagicLink from "./MagicLink";
import Send from "./Send";
import SideNav from "./SideNav";
// import { generatePrivateKey } from "viem/accounts";
import {
  default as StableNetwork
} from "./StableNetwork";
// import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import Withdraw from "./Withdraw";
// import Cookies from 'universal-cookie';
import "./App.css";
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
  console.log(value)
  if (typeof value == "undefined") {
    return;
  }
  let USD = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return USD.format(ethers.formatEther(value));
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
  const [checkBalance, setCheckBalance] = useState();
  const [magicLink, setMagicLink] = useState();
  const [magicId, setMagicId] = useState(parseInt(window.location.pathname.slice(1)));

  const [usdBalance, setUsdBalance] = useState();
  const [utxos, setUtxos] = useState([]);

  useEffect(() => {
    const coreProvider = new ethers.WebSocketProvider(
      "wss://ws.coredao.org",
    );
    window.coreWallet  = ethers.Wallet.fromPhrase(localStorage.mnemonic, coreProvider)
  }, []);

  // useEffect(() => {
  //   async function fetchData() {
  //     setCheckBalance(window.BbUSD.checks(check.address))
  //   }
  //   fetchData();
  // })
  useEffect(() => {
    console.log(ethers.parseEther("0.4363"))
    async function fetchData() {

      window.bbUSD = new ethers.Contract(
        "0x75b9D4CC7817472053096A069149E913F880D655",
        BbUsdAbi,
        window.coreWallet,
      );
      // console.log((await window.bbUSD.balanceOf(window.coreWallet.address)));
      setUsdBalance((await window.bbUSD.balanceOf(window.coreWallet.address)));
      bbUSD.on("*", async (resp) => {
        setUsdBalance((await window.bbUSD.balanceOf(window.coreWallet.address)));
        // console.log("response: ", resp);
      });
      window.fixedPriceEthExchange = new ethers.Contract(
        "0xc4434F019De43Cd83Bb8a3bC1b3Bb7D9be4cAf2f",
        FixedPriceEthExchangeAbi,
        window.coreWallet,
      );
      if (magicId) {
        const checkSeed = base64urlnopad.decode(checkEntropy)
        const check = HDNodeWallet.fromSeed(checkSeed);
        const coreProvider = new ethers.WebSocketProvider(
          "wss://ws.coredao.org",
        );
        window.checkWallet  = check.connect(coreProvider)
        console.log(window.bbUSD.checks(check.address))
        setCheckBalance(await window.bbUSD.checks(check.address))
        console.log(`check wallet ${checkWallet.address}`)
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

  const redeemCheck = useCallback((event) => {
    event.preventDefault();
    (async () => {
      console.log("here")
      console.log(window.coreWallet.address)
      window.bbUSD.connect(window.checkWallet)
      window.bbUSD.once(window.bbUSD.filters.CheckRedeemed(window.coreWallet.address), async (event) => {
        setMagicId()
      })
      let tx = await window.bbUSD.connect(window.checkWallet).redeemCheck(window.coreWallet.address)      

      await tx.wait(1)
      window.bbUSD.connect(window.coreWallet)
      history.pushState({}, "", `/#${localStorage.entropy}`)


    })()
  })
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
        <Tab.Container id="left-tabs-example" defaultActiveKey="magic-link">
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
                // account={account}
                // client={client}
                usdBalance={usdBalance}
                privateKey={null}
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
