import React, {
  useMemo,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import * as borsh from "borsh";
import { BorshSchema, borshSerialize, borshDeserialize, Unit } from "borsher";
import Deposit from "./Deposit";
import Send from "./Send";
import Withdraw from "./Withdraw";
import Loading from "./Loading";
import SideNav from "./SideNav";
import MagicLink from "./MagicLink";
import * as secp256k1 from "@noble/secp256k1";
import { useInterval } from "react-use";
import { QRCodeSVG } from "qrcode.react";
import { sha256 } from "@noble/hashes/sha2";
import {
  default as StableNetwork,
  pubKeyToAddress,
  pubKeyToBytes,
  transactionSchema,
  signedTransactionSchema,
} from "./StableNetwork";
import { wordlist } from "@scure/bip39/wordlists/english";
import { base64urlnopad } from "@scure/base";
import CopyToClipboardButton from "./CopyToClipBoardButton";
import * as bip39 from "@scure/bip39";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { HDKey } from "@scure/bip32";
import Col from "react-bootstrap/Col";
import Nav from "react-bootstrap/Nav";
import Row from "react-bootstrap/Row";
import Tab from "react-bootstrap/Tab";
import { randomBytes } from "@noble/hashes/utils";
import { hmac } from "@noble/hashes/hmac";
// import Cookies from 'universal-cookie';
import "./App.css";
secp256k1.etc.hmacSha256Sync = (k, ...m) =>
  hmac(sha256, k, secp256k1.etc.concatBytes(...m));
const mnemonic2 =
  "base water near armed law index boil knife female veteran nature multiply";
let USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatUsd(value) {
  if (typeof value == "undefined") {
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
  const [checkBalance, setCheckBalance] = useState();
  const [magicLink, setMagicLink] = useState(null);

  const [usdBalance, setUsdBalance] = useState();
  const [utxos, setUtxos] = useState([]);

  const { publicKey, privateKey } = useMemo(
    () =>
      HDKey.fromMasterSeed(Buffer.from(localStorage.entropy, "base64")).derive(
        "m/84'/0'/0",
      ),
    [],
  );

  useEffect(() => {
    if (!publicKey) {
      return;
    }
    const es = new EventSource(`http://localhost/sse?currency=Usd&address=${Buffer.from(pubKeyToBytes(publicKey)).toString("hex")}`, {
      withCredentials: true,
    });
    es.onmessage = ({data}) => {
      // console.log(JSON.parse(data)j)
      const {balance, utxos: newUtxos} = JSON.parse(data)
      setUsdBalance(BigInt(balance))
      setUtxos(
        newUtxos.map(utxo => ({
          ...utxo,
          transaction_id: Buffer.from(utxo.transaction_id, "hex"),
          value: BigInt(utxo.value)
        }))
      )
    }
    es.onerror = (e, x) => console.log(e)
    return () => es.close();
  }, [publicKey]);

  const address = useMemo(
    () => publicKey && pubKeyToAddress(publicKey),
    [publicKey],
  );

  useEffect(() => {
    async function setCheckBalance2() {
      const magicTransactionId = parseInt(window.location.pathname.slice(1));
      const isMagicLink = Number.isInteger(magicTransactionId);
      if (!isMagicLink) {
        return;
      }
      const checkEntropy = base64urlnopad.decode(window.location.hash.slice(1));
      // console.log(checkEntropy)
      const { publicKey: checkPublicKey } =
        HDKey.fromMasterSeed(checkEntropy).derive("m/84'/0'/0");
      setCheckBalance(
        await stable.getBalance(pubKeyToBytes(checkPublicKey), "usd"),
      );
    }

    setCheckBalance2();
  }, []);

  async function cashCheck() {
    const checkEntropy = base64urlnopad.decode(window.location.hash.slice(1));
    const { privateKey: checkPrivateKey } =
      HDKey.fromMasterSeed(checkEntropy).derive("m/84'/0'/0");
    const checkTransactionId = parseInt(window.location.pathname.slice(1));
    await stable.cashCheck(checkTransactionId, checkPrivateKey, privateKey);
    history.pushState({}, "", `/#${localStorage.entropy}`);
    setCheckBalance(undefined);
  }

  async function claimUtxo(utxo) {
    stable.claimUtxo(utxo.transaction_id, { Usd: {} }, utxo.vout, privateKey);
  }

  const [showQrCodeModal, setShowQrCodeModal] = useState(false);

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
                address={address}
                usdBalance={usdBalance}
                privateKey={privateKey}
                setShowQrCodeModal={setShowQrCodeModal}
                magicLink={magicLink}
                setMagicLink={setMagicLink}
              />
            </Tab.Pane>
            <Tab.Pane eventKey="send">
              <Send
                address={address}
                usdBalance={usdBalance}
                privateKey={privateKey}
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

      <Modal show={checkBalance} fullscreen={"md-down"}>
        <Modal.Header closeButton>
          <Modal.Title>Sending...</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <button
            onClick={() => cashCheck()}
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
