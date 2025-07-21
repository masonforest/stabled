import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import * as secp256k1 from "@noble/secp256k1";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState, useCallback, useRef , useReducer, memo} from "react";
import { ethers } from "ethers";
import * as secp from '@noble/secp256k1';
import { HDNodeWallet } from "ethers/wallet";
import { base64urlnopad } from "@scure/base";
import { uniqBy } from "lodash";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import BbUsdAbi from "./abi/contracts/BbUSD.sol/BbUSD.json";
import HDWalletMessengerAbi from "./abi/contracts/HDWalletMessenger.sol/HDWalletMessenger.json";
import Deposit from "./Deposit";
import FixedPriceEthExchangeAbi from "./abi/contracts/FixedPriceEthExchange.sol/FixedPriceEthExchange.json";
import CheckBookAbi from "./abi/contracts/CheckBook.sol/CheckBook.json";
import Loading from "./Loading";
import MagicLink from "./MagicLink";
import Send from "./Send";
import Transaction from "./Transaction";
import SideNav from "./SideNav";
import * as bip39 from "@scure/bip39";
// import { generatePrivateKey } from "viem/accounts";
import { default as StableNetwork } from "./StableNetwork";
// import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import Withdraw from "./Withdraw";
// import { PrivateKey, decrypt, encrypt } from "eciesjs";
import { wordlist as english } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { utf8ToBytes } from "@noble/ciphers/utils";
import { randomBytes } from "@noble/ciphers/webcrypto";
// import { Transaction } from "bitcoinjs-lib";
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

function decryptForRecipient(privateKey, encryptedMessage) {
  const ephemeralPublicKey = encryptedMessage.slice(0, 33);
  const nonce = ephemeralPublicKey.slice(0,24);
  const ciphertext = encryptedMessage.slice(33);
  const secret = secp.getSharedSecret(privateKey, ephemeralPublicKey, true);
  const key = secret.slice(0, 32);
  console.log("decoded")
  console.log(xchacha20poly1305(key, nonce).decrypt(ciphertext))
  return new TextDecoder().decode(xchacha20poly1305(key, nonce).decrypt(ciphertext));
}

async function encrypt(ephemeralPrivateKey, publicKey, message) {
  const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, true);
  const nonce = ephemeralPublicKey.slice(0, 24);
  const secret = secp.getSharedSecret(ephemeralPrivateKey, publicKey, true);
  const key = secret.slice(0, 32);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(message);
  const encrypted = new Uint8Array(33 + ciphertext.length);
  encrypted.set(ephemeralPublicKey, 0);
  encrypted.set(ciphertext, 33);

  return encrypted;
}

function App() {
  // const [transactions, setTransactions] = useState([
  //   // "0x409e28d995478f3f5236756451d77a1b8930e05d299e11cd632ea1721ab49451",
  // ]);
  const [transactions, addTransaction] = useReducer((state, action) => [action,...state], [])
  const [checkBalance, setCheckBalance] = useState();
  const [checkMemo, setCheckMemo] = useState();
  const [magicLink, setMagicLink] = useState();
  const [checkAddress, setCheckAddress] = useState(
    parseInt(window.location.pathname.slice(1)),
  );

  const [usdBalance, setUsdBalance] = useState();
  const [utxos, setUtxos] = useState([]);

  const esRef = useRef(null);

  useEffect(() => {
    const coreProvider = new ethers.JsonRpcProvider("https://lb.drpc.org/core/AnBEZF95LU2KkyY4vqliaV7LHpqrXcIR8JkHrqRhf0fE");
    window.coreWallet = ethers.Wallet.fromPhrase(
      localStorage.mnemonic,
      coreProvider,
    );
    // console.log(base64urlnopad.encode(ethers.getBytes(window.coreWallet.publicKey)))
    const seed = bip39.mnemonicToEntropy(localStorage.mnemonic, english);

    // const sk = new PrivateKey(); //HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0" ));
    const data = Buffer.from("hello world🌍");
    // const decrypted = decrypt(sk.secret, encrypt(sk.publicKey.toBytes(), data));

    const key = randomBytes(32);
    const nonce = randomBytes(24);
    const chacha = xchacha20poly1305(key, nonce);
    const data2 = utf8ToBytes("");

    const ciphertext = chacha.encrypt(data2);

    const data3 = chacha.decrypt(ciphertext);
  }, []);

  // useEffect(() => {
  //   async function fetchData() {
  //     setCheckBalance(window.BbUSD.checks(check.address))
  //   }
  //   fetchData();
  // })
  // useEffect(() => {
  //   async function fetchTransactions() {
  //     const response = await fetch(`http://192.168.0.11/transactions?address=${window.coreWallet.address}`);
      
  //     // setTransactions([
  //     //   ...transactions,
  //     //   ...await response.json()
  //     // ])
  //   }
  //   if(!transactions.length) {
  //     fetchTransactions()
  //   }
  // }, [])
  useEffect(() => {
    if (!esRef.current) {
      esRef.current = new EventSource(
        `/sse?address=${window.coreWallet.address}`,
        {
          withCredentials: true,
        },
      );
      esRef.current.onmessage = async ({ data }) => {
        // console.log(JSON.parse(data))
        // console.log(transactions.length)
        addTransaction(
          JSON.parse(data),
        )
      }
      // const { log, transactionHash } = JSON.parse(data);
      // let event = window.bbUSD.interface.parseLog(log);
      // setUsdBalance(await window.bbUSD.balanceOf(window.coreWallet.address));
    };
    esRef.current.onerror = (e, x) => console.log(e);
    return () => {
      console.log("closing")
      esRef.current && esRef.current.close();
      esRef.current = null;
    };
  }, [addTransaction]);
  useEffect(() => {
    async function fetchData() {
      window.bbUSD = new ethers.Contract(
        "0xa84c5626954D01E0200050a800E9CDc3a00DE7FF",
        BbUsdAbi,
        window.coreWallet,
      );

      window.checkBook = new ethers.Contract(
        "0x168b0e3a5aD6343Ea1BAc552F72D8C7a88Cf65D6",
        CheckBookAbi,
        window.coreWallet,
      );
      // console.log((await window.bbUSD.balanceOf(window.coreWallet.address)));
      setUsdBalance(await window.bbUSD.balanceOf(window.coreWallet.address));
      // bbUSD.on("*", async (resp) => {
      // setUsdBalance((await window.bbUSD.balanceOf(window.coreWallet.address)));
      // console.log("response: ", resp);
      // });
      window.hDWalletMessenger = new ethers.Contract(
        "0x6F39c7c97e5A095A595774e2D773fD253d1eD1a7",
        HDWalletMessengerAbi,
        window.coreWallet,
      );
      window.fixedPriceEthExchange = new ethers.Contract(
        "0x6d78354C0Cf8a74549Dffc392F55e4A0E95dDbE3",
        FixedPriceEthExchangeAbi,
        window.coreWallet,
      );
      if (checkAddress) {
        const checkSeed = base64urlnopad.decode(checkEntropy);
        const check = HDNodeWallet.fromSeed(checkSeed);
        const coreProvider = new ethers.JsonRpcProvider(
          "https://rpc-core.icecreamswap.com",
        );
        window.checkWallet = check.connect(coreProvider);
        setCheckBalance(
          await window.checkBook.checkAmounts(
            window.bbUSD.target,
            check.address,
          ),
        );
        const log = await window.coreWallet.provider.getLogs({
                      address: window.checkBook.target,
                      fromBlock: 0,
                      topics: [
                        window.checkBook.interface.getEvent("CheckFunded").topicHash,
                        null,
                        ethers.zeroPadValue(
                          check.address.toLowerCase(),
                          32,
                        ),
                      ],
                    });
                    console.log(log)
            const tx = await window.coreWallet.provider.getTransaction(log[0].transactionHash)
            const decodedData = window.fixedPriceEthExchange.interface.decodeFunctionData("buyEthAndCall", tx.data);
            console.log(await decryptForRecipient(ethers.getBytes(check.privateKey), ethers.getBytes(decodedData[3])))
            setCheckMemo(
              await decryptForRecipient(ethers.getBytes(check.privateKey), ethers.getBytes(decodedData[3]))
            );

        // window.bbUSD = new ethers.Contract(
        //   "0x61ee0769fb9249c69A82f46B7C6dF94576a9392d",
        //   BbUsdAbi,
        //   window.coreWallet,
        // );
      }
      // setTransactions(
      //   uniqBy(
      //     Object.values(
      //       Object.groupBy(
      //         [
      //           ...(await window.coreWallet.provider.getLogs({
      //             address: window.bbUSD.target,
      //             fromBlock: 0,
      //             topics: [
      //               window.bbUSD.interface.getEvent("Transfer").topicHash,
      //               null,
      //               ethers.zeroPadValue(
      //                 window.coreWallet.address.toLowerCase(),
      //                 32,
      //               ),
      //             ],
      //           })),
      //           ...(await window.coreWallet.provider.getLogs({
      //             address: window.bbUSD.target,
      //             fromBlock: 0,
      //             topics: [
      //               window.bbUSD.interface.getEvent("Transfer").topicHash,
      //               ethers.zeroPadValue(
      //                 window.coreWallet.address.toLowerCase(),
      //                 32,
      //               ),
      //             ],
      //           })),
      //         ].reverse(),
      //         ({ transactionHash }) => transactionHash,
      //       ),
      //     ).flatMap((logs) =>
      //       logs.map((log) => ({
      //         ...bbUSD.interface.parseLog(log),
      //         transactionHash: log.transactionHash,
      //       })),
      //     ),
      //     "transactionHash",
      //   ),
      // );
    }
    fetchData();
  }, []);

  // console.log(transactions.map((t) => t.transactionHash))

  const redeemCheck = useCallback(
    (event) => {
      event.preventDefault();
      (async () => {
        window.bbUSD.connect(window.checkWallet);
        // window.bbUSD.once(window.bbUSD.filters.CheckRedeemed(window.coreWallet.address), async (event) => {
        //   setCheckAddress()
        // })

        const checkAmount = await window.checkBook.checkAmounts(
          bbUSD.target,
          window.checkWallet.address,
        );
        setUsdBalance(usdBalance + checkAmount);
        setCheckAddress();
        history.pushState({}, "", `/`);
        console.log("before")
        console.log(checkMemo)
        let ephemeralPublicKeyAndCipherText = await encrypt(
          ethers.getBytes(window.checkWallet.privateKey),
          ethers.getBytes(window.coreWallet.publicKey),
          new TextEncoder().encode(checkMemo)
        );
        console.log(window.coreWallet.privateKey)
        console.log(Buffer.from(ephemeralPublicKeyAndCipherText).toString("hex"))

        console.log(decryptForRecipient(
          ethers.getBytes(window.coreWallet.privateKey),
          ephemeralPublicKeyAndCipherText)
        )
        console.log("after")
        let tx = await window.checkBook
          .connect(window.checkWallet)
          .redeemCheck(
            bbUSD.target,
            window.coreWallet.address,
            window.coreWallet.publicKey,
            ephemeralPublicKeyAndCipherText
          );
      })();
    },
    [usdBalance, checkMemo],
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
            </Tab.Pane>
            <Tab.Pane eventKey="send">
              <Send
                usdBalance={usdBalance}
                magicLink={magicLink}
                privateKey={null}
              />
            </Tab.Pane>
          </Tab.Content>
          {transactions.map((transaction) => {
            return (
              <Transaction
                key={transaction.transactionHash}
                transaction={transaction}
              ></Transaction>
            );
          })}
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

      <Modal show={checkAddress} fullscreen={"md-down"}>
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
