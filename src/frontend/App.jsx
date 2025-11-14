import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import * as secp256k1 from "@noble/secp256k1";
import { QRCodeSVG } from "qrcode.react";
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useReducer,
  memo,
} from "react";
import { ethers } from "ethers";
import * as secp from "@noble/secp256k1";
import { HDNodeWallet } from "ethers/wallet";
import { base64urlnopad } from "@scure/base";
import { uniqBy } from "lodash";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import AsUSDFAbi from "./abi/contracts/asUSDF.sol/asUSDF.json";
import HDWalletMessengerAbi from "./abi/contracts/HDWalletMessenger.sol/HDWalletMessenger.json";
import Deposit from "./Deposit";
import FixedPriceEthExchangeAbi from "./abi/contracts/FixedPriceEthExchange.sol/FixedPriceEthExchange.json";
import CheckBookAbi from "./abi/contracts/CheckBook.sol/CheckBook.json";
import asUSDFEarnAbi from "./abi/contracts/AsUSDFEarn.sol/AsUSDFEarn.json";
import Loading from "./Loading";
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
import { useWindowSize } from "react-use";
secp256k1.etc.hmacSha256Sync = (k, ...m) =>
  hmac(sha256, k, secp256k1.etc.concatBytes(...m));
const mnemonic2 =
  "base water near armed law index boil knife female veteran nature multiply";
const checkId = parseInt(window.location.pathname.slice(1));
// const isMagicLink = Number.isInteger(checkId);
const checkEntropy = window.location.hash.slice(1);

const VESTING_PERIOD = 28800n;
let USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatUsd(value) {
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
  const nonce = ephemeralPublicKey.slice(0, 24);
  const ciphertext = encryptedMessage.slice(33);
  const secret = secp.getSharedSecret(privateKey, ephemeralPublicKey, true);
  const key = secret.slice(0, 32);
  return new TextDecoder().decode(
    xchacha20poly1305(key, nonce).decrypt(ciphertext)
  );
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

function useInterval(callback, delay) {
  const savedCallback = useRef();

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

function App() {
  // console.log((ethers.WeiPerEther * ethers.WeiPerEther) > ethers.MaxInt256)
  // console.log((ethers.WeiPerEther * ethers.WeiPerEther) ,  ethers.MaxInt256)
  // let initialPrice = ethers.parseEther("1173.91");

  // let transactionPrice = ((initialPrice * ethers.parseEther("0.014066819324378617"))/ethers.WeiPerEther)
  // console.log("----")
  // console.log("in ether",  ethers.formatEther(transactionPrice) )
  // console.log((ethers.parseEther("1") * ethers.parseEther("1")) / ethers.WeiPerEther / ethers.WeiPerEther)
  const [transactions, addTransaction] = useReducer((state, action) => {
    console.log(action);
    if (
      action.action === "CheckRedeemed" &&
      action.from === window.coreWallet.address.toLowerCase()
    ) {
      return state.map((existingAction) =>
        existingAction.action === "CheckFunded" &&
        existingAction.checkAddress === action.checkAddress
          ? { ...existingAction, redeemed: true }
          : existingAction
      );
    }
    return [action, ...state];
  }, []);
  const [checkBalance, setCheckBalance] = useState();
  const [checkMemo, setCheckMemo] = useState();
  const [magicLink, setMagicLink] = useState();
  const [checkAddress, setCheckAddress] = useState(
    parseInt(window.location.pathname.slice(1))
  );

  const [usdBalance, setUsdBalance] = useState();
  const [asUSDFContractBalance, setAsUSDFContractBalance] = useState();
  const [asUSDFTotalSupply, setAsUSDFTotalSupply] = useState();
  const [asUSDFLastDispatchTime, setAsUSDFLastDispatchTime] = useState();
  const [asUSDFLastReward, setAsUSDFLastReward] = useState();
  // const [asUSDFExchangeRate, setAsUSDFExchangeRate] = useState(1n);
  const [timestamp, setTimestamp] = useState(
    BigInt(Math.floor(Date.now() / 1000))
  );
  const [utxos, setUtxos] = useState([]);

  const esRef = useRef(null);
  useInterval(() => {
    setTimestamp(timestamp + 1n);
  }, 1000);
  const asUSDFExchangeRate = useMemo(() => {
    if (
      typeof asUSDFContractBalance === "undefined" ||
      typeof asUSDFTotalSupply === "undefined" ||
      typeof timestamp === "undefined" ||
      typeof asUSDFLastDispatchTime === "undefined" ||
      typeof asUSDFLastReward === "undefined" ||
      asUSDFTotalSupply === 0n
    ) {
      return ethers.WeiPerEther;
    }
      const timeSinceLastDistribution = timestamp - asUSDFLastDispatchTime;
      if (timeSinceLastDistribution >= VESTING_PERIOD) {
            return 0n;
        }
        const deltaT = (VESTING_PERIOD - timeSinceLastDistribution);
        const unvestedAmount = (deltaT * asUSDFLastReward) / VESTING_PERIOD;
    // console.log(asUSDFContractBalance)
    // console.log({
    //   asUSDFContractBalance,
    //   asUSDFTotalSupply,
    //   timestamp,
    //   asUSDFLastDispatchTime,
    //   asUSDFLastReward,
    //   timeSinceLastDistribution,
    //   deltaT,
    //   unvestedAmount
    // })
    
    return (asUSDFContractBalance - unvestedAmount) * ethers.WeiPerEther / asUSDFTotalSupply;
  }, [
    asUSDFContractBalance,
    asUSDFTotalSupply,
    timestamp,
    asUSDFLastDispatchTime
  ]);
  // console.log(asUSDFExchangeRate)

  useEffect(() => {
    const coreProvider = new ethers.JsonRpcProvider("https://0.48.club");
    window.coreWallet = ethers.Wallet.fromPhrase(
      localStorage.mnemonic,
      coreProvider
    );

    // console.log(timestamp);
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
  //     setCheckBalance(window.AsUSDF.checks(check.address))
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
        }
      );
      esRef.current.onmessage = async ({ data }) => {
        // console.log(transactions.length)
        addTransaction(JSON.parse(data));
      };
      // const { log, transactionHash } = JSON.parse(data);
      // let event = window.asUSDF.interface.parseLog(log);
      // setUsdBalance(await window.asUSDF.balanceOf(window.coreWallet.address));
    }
    esRef.current.onerror = (e, x) => console.log(e);
    return () => {
      esRef.current && esRef.current.close();
      esRef.current = null;
    };
  }, [addTransaction]);
  useEffect(() => {
    async function fetchData() {
      window.USDF = new ethers.Contract(
        "0x5a110fc00474038f6c02e89c707d638602ea44b5",
        AsUSDFAbi,
        window.coreWallet
      );
      window.asUSDF = new ethers.Contract(
        "0x917af46b3c3c6e1bb7286b9f59637fb7c65851fb",
        AsUSDFAbi,
        window.coreWallet
      );
      window.asUSDFEarn = new ethers.Contract(
        "0xdB57a53C428a9faFcbFefFB6dd80d0f427543695",
        asUSDFEarnAbi,
        window.coreWallet
      );

      window.checkBook = new ethers.Contract(
        "0x4bf5a51928cB7B83b9b041DA7Ef372bae8138775",
        CheckBookAbi,
        window.coreWallet
      );

      //     window.asUSDFEarn = new ethers.Contract(
      //       "0xdB57a53C428a9faFcbFefFB6dd80d0f427543695",
      //     [
      //   "function exchangePrice() view returns (uint256)",

      // ],
      //       window.coreWallet,
      //     );
      // console.log(window.asUSDF.target);
      // console.log(await window.asUSDF.balanceOf(window.coreWallet.address));

      setUsdBalance(await window.asUSDF.balanceOf(window.coreWallet.address));
      setAsUSDFContractBalance(await window.USDF.balanceOf(window.asUSDFEarn.target));
      setAsUSDFTotalSupply(await window.asUSDF.totalSupply());
      setAsUSDFLastDispatchTime(await window.asUSDFEarn.lastDispatchTime());
      setAsUSDFLastReward(await window.asUSDFEarn.lastReward());
      // console.log(await window.asUSDFEarn.exchangePrice());
      // setAsUSDFExchangeRate(await window.asUSDFEarn.exchangePrice());
      // asUSDF.on("*", async (resp) => {
      // setUsdBalance((await window.asUSDF.balanceOf(window.coreWallet.address)));
      // console.log("response: ", resp);
      // });
      window.hDWalletMessenger = new ethers.Contract(
        "0xe35FCA78813F21a5a3abEf96e2e71A9d0bc059AC",
        HDWalletMessengerAbi,
        window.coreWallet
      );
      window.fixedPriceEthExchange = new ethers.Contract(
        "0x99209fdB94b05f43B3eaa434E550CCB5D52e9493",
        FixedPriceEthExchangeAbi,
        window.coreWallet
      );
      if (checkAddress) {
        const checkSeed = base64urlnopad.decode(checkEntropy);
        const check = HDNodeWallet.fromSeed(checkSeed);
        const coreProvider = new ethers.JsonRpcProvider(
          "https://0.48.club/"
        );
        window.checkWallet = check.connect(coreProvider);
        setCheckBalance((await window.checkBook.checks(check.address)).value);
        // const log = await window.coreWallet.provider.getLogs({
        //   address: window.checkBook.target,
        //   fromBlock: 0,
        //   topics: [
        //     window.checkBook.interface.getEvent("CheckFunded").topicHash,
        //     ethers.zeroPadValue(check.address.toLowerCase(), 32),
        //   ],
        // });
        // const tx = await window.coreWallet.provider.getTransaction(
        //   log[0].transactionHash
        // );
        // const decodedData =
        //   window.fixedPriceEthExchange.interface.decodeFunctionData(
        //     "buyEthAndCall",
        //     tx.data
        //   );
        // setCheckMemo(
        //   await decryptForRecipient(
        //     ethers.getBytes(check.privateKey),
        //     ethers.getBytes(decodedData[3])
        //   )
        // );

        // window.asUSDF = new ethers.Contract(
        //   "0x61ee0769fb9249c69A82f46B7C6dF94576a9392d",
        //   AsUSDFAbi,
        //   window.coreWallet,
        // );
      }
      // setTransactions(
      //   uniqBy(
      //     Object.values(
      //       Object.groupBy(
      //         [
      //           ...(await window.coreWallet.provider.getLogs({
      //             address: window.asUSDF.target,
      //             fromBlock: 0,
      //             topics: [
      //               window.asUSDF.interface.getEvent("Transfer").topicHash,
      //               null,
      //               ethers.zeroPadValue(
      //                 window.coreWallet.address.toLowerCase(),
      //                 32,
      //               ),
      //             ],
      //           })),
      //           ...(await window.coreWallet.provider.getLogs({
      //             address: window.asUSDF.target,
      //             fromBlock: 0,
      //             topics: [
      //               window.asUSDF.interface.getEvent("Transfer").topicHash,
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
      //         ...asUSDF.interface.parseLog(log),
      //         transactionHash: log.transactionHash,
      //       })),
      //     ),
      //     "transactionHash",
      //   ),
      // );
    }
    fetchData();
  }, []);

  const redeemCheck = useCallback(
    (event) => {
      event.preventDefault();
      (async () => {
        console.log("red")
        window.asUSDF.connect(window.checkWallet);
        // window.asUSDF.once(window.asUSDF.filters.CheckRedeemed(window.coreWallet.address), async (event) => {
        //   setCheckAddress()
        // })

        const checkAmount = (
          await window.checkBook.checks(window.checkWallet.address)
        ).value;
        setUsdBalance(usdBalance + checkAmount);
        setCheckAddress();
        history.pushState({}, "", `/`);
        let ephemeralPublicKeyAndCipherText = await encrypt(
          ethers.getBytes(window.checkWallet.privateKey),
          ethers.getBytes(window.coreWallet.publicKey),
          new TextEncoder().encode(checkMemo)
        );
        let tx = await window.checkBook
          .connect(window.checkWallet)
          .redeemCheck(
            window.coreWallet.address,
            window.coreWallet.publicKey,
            ephemeralPublicKeyAndCipherText,
                    {
                      gasPrice: ethers.parseUnits("0.051", "gwei"),  
                    }
          );
      })();
    },
    [usdBalance, checkMemo]
  );
  const isLoading = useMemo(
    () => [usdBalance].some((value) => typeof value === "undefined"),
    [usdBalance]
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
            <Tab.Pane eventKey="magic-link"></Tab.Pane>
            <Tab.Pane eventKey="send">
              <Send
                usdBalance={usdBalance}
                asUSDFExchangeRate={asUSDFExchangeRate}
                setUsdBalance={setUsdBalance}
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
            <title>Accept {checkBalance && ethers.formatEther(checkBalance * asUSDFExchangeRate/ ethers.WeiPerEther)}</title>
            Accept {checkBalance && ethers.formatEther(checkBalance * asUSDFExchangeRate/ ethers.WeiPerEther)}
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
              href={`https://mempool.space/tx/${
                utxos[0] && Buffer.from(utxos[0].transaction_id).toString("hex")
              }?mode=details`}
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
