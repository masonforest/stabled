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
import { add, method, uniqBy, chunk } from "lodash";
import Modal from "react-bootstrap/Modal";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import AsUSDFAbi from "./abi/contracts/asUSDF.sol/asUSDF.json";
import HDWalletMessengerAbi from "./abi/contracts/HDWalletMessenger.sol/HDWalletMessenger.json";
import Deposit from "./Deposit";
import FixedPriceEthExchangeAbi from "./abi/contracts/FixedPriceEthExchange.sol/FixedPriceEthExchange.json";
import CheckBookAbi from "./abi/contracts/CheckBook.sol/CheckBook.json";
import asUSDFEarnAbi from "./abi/contracts/AsUSDFEarn.sol/AsUSDFEarn.json";
import IERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";
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
import { Interface } from "ethers";
import { useWindowSize } from "react-use";
import { check } from "bitcoinjs-lib/src/bip66";
import { hexToPublicKey } from "eciesjs/utils";
secp256k1.etc.hmacSha256Sync = (k, ...m) =>
  hmac(sha256, k, secp256k1.etc.concatBytes(...m));
const mnemonic2 =
  "base water near armed law index boil knife female veteran nature multiply";
const checkId = parseInt(window.location.pathname.slice(1));
const checkEntropy = window.location.hash.slice(1);

const checkbookInterface = new Interface(CheckBookAbi);

const RPC_URLS = [
  "https://bsc-mainnet.public.blastapi.io",
  "https://go.getblock.us/dc67604c3c8e4c14bcda134739d45aa3",
  "https://0.48.club",
  "https://bsc.rpc.blxrbdn.com",
  "https://public-bsc.nownodes.io",
  "https://public-bsc.nownodes.io",
];

async function rpcFetch(body) {
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      let json = await res.json();
      console.log("RPC response from", url, json);
      return json;
    } catch (e) {
      console.error(url, e);
    }
  }
  throw new Error("All RPC endpoints failed");
}
const VESTING_PERIOD = 28800n;
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatUsd(value) {
  if (!value) {
    return;
  }

  return USD.format(new Number(value / 100n) + new Number(value % 100n) / 100);
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
    xchacha20poly1305(key, nonce).decrypt(ciphertext),
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
      tick();
      return () => clearInterval(id);
    }
  }, [delay]);
}

function App() {
  console.log("App rendered");
  const [transactions, addTransaction] = useReducer((state, action) => {
    if (state.some((t) => t.transactionHash === action.transactionHash && t.action === action.action)) return state;
    if (action.action === "CheckRedeemed") {
      if (state.some((t) => t.action === "CheckFunded" && t.checkAddress.toLowerCase() === action.checkAddress.toLowerCase()))
        return state.map((t) => t.action === "CheckFunded" && t.checkAddress.toLowerCase() === action.checkAddress.toLowerCase() ? { ...t, redeemed: true } : t);
    }
    return [action, ...state];
  }, []);
  const [checkBalance, setCheckBalance] = useState();
  const [checkMemo, setCheckMemo] = useState();
  const [magicLink, setMagicLink] = useState();
  const [checkAddress, setCheckAddress] = useState(
    parseInt(window.location.pathname.slice(1)),
  );

  const [usdBalance, setUsdBalance] = useState();
  const [asUSDFContractBalance, setAsUSDFContractBalance] = useState();
  const [asUSDFTotalSupply, setAsUSDFTotalSupply] = useState();
  const [asUSDFLastDispatchTime, setAsUSDFLastDispatchTime] = useState();
  const [asUSDFLastReward, setAsUSDFLastReward] = useState();
  const [timestamp, setTimestamp] = useState(
    BigInt(Math.floor(Date.now() / 1000)),
  );
  const [utxos, setUtxos] = useState([]);
  const [checksData, setChecksData] = useState(null);

  const esRef = useRef(null);
  const addedTxsRef = useRef(new Set());

  const pollChecks = useCallback(async () => {
    if (!window.checkBook) return;
    console.log("Polling for checks...")
    const checks = await window.checkBook.checksByAddress(window.coreWallet.address);
    // console.log(JSON.parse(JSON.stringify(checks, (_, v) => typeof v === "bigint" ? v.toString() : v)))
    setChecksData(JSON.stringify(checks, (_, v) => typeof v === "bigint" ? v.toString() : v));
  }, []);

  useInterval(pollChecks, import.meta.env.DEV ? 5000 : 1000);

  useEffect(() => {
    if (!checksData || !window.checkBook) return;
    const checks = JSON.parse(checksData);
    Promise.all(checks.map(async (check) => {
      const [fundedInBlock, redeemedInBlock] = check;
      if (fundedInBlock === "0") return;

      const logReqs = [
        { jsonrpc: "2.0", id: 0, method: "eth_getLogs", params: [{ fromBlock: "0x" + BigInt(fundedInBlock).toString(16), toBlock: "0x" + BigInt(fundedInBlock).toString(16), address: window.checkBook.target, topics: [window.checkBook.interface.getEvent("CheckFunded").topicHash] }] },
        ...(redeemedInBlock !== "0" ? [{ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ fromBlock: "0x" + BigInt(redeemedInBlock).toString(16), toBlock: "0x" + BigInt(redeemedInBlock).toString(16), address: window.checkBook.target, topics: [window.checkBook.interface.getEvent("CheckRedeemed").topicHash] }] }] : []),
      ];
      const logResults = await rpcFetch(logReqs);
      const txHashes = logResults.flatMap(r => r.result.length ? [r.result[0].transactionHash] : []);
      if (txHashes.length === 0) return;

      const txResults = await rpcFetch(txHashes.flatMap((hash, i) => [
        { jsonrpc: "2.0", id: i * 2, method: "eth_getRawTransactionByHash", params: [hash] },
        { jsonrpc: "2.0", id: i * 2 + 1, method: "eth_getTransactionReceipt", params: [hash] },
      ]));

      chunk(txResults, 2).forEach(([txRes, receiptRes]) => {
        if (!receiptRes?.result?.logs) return;
        const parsedTx = checkbookInterface.parseTransaction({ data: ethers.Transaction.from(txRes.result).data });
        const txHash = receiptRes.result.transactionHash;
        if (receiptRes.result.logs[2]?.topics[0] == window.checkBook.interface.getEvent("CheckFunded").topicHash &&
            window.checkBook.interface.parseLog(receiptRes.result.logs[2]).args._from.toLowerCase() === window.coreWallet.address.toLowerCase()) {
          if (!addedTxsRef.current.has(txHash + "funded")) {
            addedTxsRef.current.add(txHash + "funded");
            const checkFundedLog = window.checkBook.interface.parseLog(receiptRes.result.logs[2]);
            addTransaction({
              action: "CheckFunded",
              from: checkFundedLog.args._from,
              transactionHash: txHash,
              checkAddress: parsedTx.args.checkAddress,
              messageIndex: checkFundedLog.args.messageIndex,
              toPublicKey: ethers.getBytes(parsedTx.args.toPublicKey),
              encryptedMemo: ethers.getBytes(parsedTx.args._ephemeralPublicKeyAndMessage),
              amount: parsedTx.args.value,
            });
          }
        } else if (receiptRes.result.logs[1]?.topics[0] == window.checkBook.interface.getEvent("CheckRedeemed").topicHash) {
          if (!addedTxsRef.current.has(txHash + "redeemed")) {
            addedTxsRef.current.add(txHash + "redeemed");
            const redeemedLog = window.checkBook.interface.parseLog(receiptRes.result.logs[1]);
            addTransaction({
              action: "CheckRedeemed",
              from: redeemedLog.args._from,
              transactionHash: txHash,
              to: redeemedLog.args._to,
              checkAddress: receiptRes.result.from,
              amount: redeemedLog.args.value,
              toPublicKey: ethers.getBytes(parsedTx.args.toPublicKey),
              encryptedMemo: ethers.getBytes(parsedTx.args.ephemeralPublicKeyAndMessage),
            });
          }
        }
      });
    }));
  }, [checksData]);

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
      return undefined;
    }
    const timeSinceLastDistribution = timestamp - asUSDFLastDispatchTime;
    if (timeSinceLastDistribution >= VESTING_PERIOD) {
      return 0n;
    }
    const deltaT = VESTING_PERIOD - timeSinceLastDistribution;
    const unvestedAmount = (deltaT * asUSDFLastReward) / VESTING_PERIOD;

    return (
      ((asUSDFContractBalance - unvestedAmount) * ethers.WeiPerEther) /
      asUSDFTotalSupply
    );
  }, [
    asUSDFContractBalance,
    asUSDFTotalSupply,
    timestamp,
    asUSDFLastDispatchTime,
  ]);

  useEffect(() => {
    const coreProvider = new ethers.JsonRpcProvider("https://bsc-mainnet.public.blastapi.io");
    window.coreWallet = ethers.Wallet.fromPhrase(
      localStorage.mnemonic,
      coreProvider,
    );

    const seed = bip39.mnemonicToEntropy(localStorage.mnemonic, english);

    const data = Buffer.from("hello world🌍");

    const key = randomBytes(32);
    const nonce = randomBytes(24);
    const chacha = xchacha20poly1305(key, nonce);
    const data2 = utf8ToBytes("");

    const ciphertext = chacha.encrypt(data2);

    const data3 = chacha.decrypt(ciphertext);
  }, []);

  useEffect(() => {
    async function fetchData() {
      window.USDF = new ethers.Contract(
        "0x5a110fc00474038f6c02e89c707d638602ea44b5",
        AsUSDFAbi,
        window.coreWallet,
      );
      window.asUSDF = new ethers.Contract(
        "0x917af46b3c3c6e1bb7286b9f59637fb7c65851fb",
        AsUSDFAbi,
        window.coreWallet,
      );
      window.asUSDFEarn = new ethers.Contract(
        "0xdB57a53C428a9faFcbFefFB6dd80d0f427543695",
        asUSDFEarnAbi,
        window.coreWallet,
      );

      window.checkBook = new ethers.Contract(
        "0x7cD3E1CE78228F997543DB564689c7c77055053d",
        CheckBookAbi,
        window.coreWallet,
      );
      let id = 0;
      const checks = await window.checkBook.checksByAddress(
        window.coreWallet.address,
      );
      console.log("checks", checks);
      let reqs = checks.length ? checks.flatMap((check) => {
        const [fundedInBlock, redeemedInBlock] = check;
        if (fundedInBlock === 0n) return [];

        const requests = [
          {
            jsonrpc: "2.0",
            id: id++,
            method: "eth_getLogs",
            params: [
              {
                fromBlock: "0x" + fundedInBlock.toString(16),
                toBlock: "0x" + fundedInBlock.toString(16),
                address: window.checkBook.target,
                topics: [
                  window.checkBook.interface.getEvent("CheckFunded").topicHash,
                ],
              },
            ],
          },
        ];

        if (redeemedInBlock !== 0n) {
          requests.push({
            jsonrpc: "2.0",
            id: id++,
            method: "eth_getLogs",
            params: [
              {
                fromBlock: "0x" + redeemedInBlock.toString(16),
                toBlock: "0x" + redeemedInBlock.toString(16),
                address: window.checkBook.target,
                topics: [
                  window.checkBook.interface.getEvent("CheckRedeemed")
                    .topicHash,
                ],
              },
            ],
          });
        }

        return requests;
      }): [];

      const res = reqs.length ? await rpcFetch(reqs) : [];
      id = 0;
      let reqs2 = res.flatMap((res, i) => {
        console.log(res)
        if (res.result.length == 0) return []
        return [
          {
            jsonrpc: "2.0",
            id: i * 2,
            method: "eth_getRawTransactionByHash",
            params: [res.result[0].transactionHash],
          },
          {
            jsonrpc: "2.0",
            id: i * 2 + 1,
            method: "eth_getTransactionReceipt",
            params: [res.result[0].transactionHash],
          },
        ];
      });
      const res2 = reqs2.length > 0 ? await rpcFetch(reqs2) : [];
      chunk(await res2, 2).map(([res2, res], i) => {
        if (!res?.result?.logs) return
        const ERC20_ABI = [
          "event Transfer(address indexed from, address indexed to, uint256 value)",
          "event Approval(address indexed owner, address indexed spender, uint256 value)",
        ];
        const erc20Interface = new Interface(IERC20.abi);
        
        const rawTx = ethers.Transaction.from(res2.result);
        const parsedTx = checkbookInterface.parseTransaction({data: rawTx.data});
        if (
          res.result.logs[2] &&
          res.result.logs[2].topics[0] ==
            window.checkBook.interface.getEvent("CheckFunded").topicHash &&
            window.checkBook.interface.parseLog(res.result.logs[2]).args._from.toLowerCase() === window.coreWallet.address.toLowerCase()
        ) {
          const fundedTransfer = erc20Interface.parseLog(res.result.logs[1]);
          const checkFundedLog = window.checkBook.interface.parseLog(res.result.logs[2]);
          console.log(parsedTx.args.toPublicKey)
          addTransaction({
            action: "CheckFunded",
            from: checkFundedLog.args._from,
            transactionHash: res.result.transactionHash,
            checkAddress: parsedTx.args.checkAddress,
            messageIndex: checkFundedLog.args.messageIndex,
            toPublicKey: ethers.getBytes(parsedTx.args.toPublicKey),
            encryptedMemo: ethers.getBytes(parsedTx.args._ephemeralPublicKeyAndMessage),
            amount: parsedTx.args.value,
          });
        } else if (res.result.logs[1] && res.result.logs[1].topics[0] == window.checkBook.interface.getEvent("CheckRedeemed").topicHash) {
          const redeemedLog = window.checkBook.interface.parseLog(res.result.logs[1]);
          addTransaction({
            action: "CheckRedeemed",
            from: redeemedLog.args._from,
            transactionHash: res.result.transactionHash,
            to: redeemedLog.args._to,
            checkAddress: res.result.from,
            amount: redeemedLog.args.value,
            toPublicKey: ethers.getBytes(parsedTx.args.toPublicKey),
            encryptedMemo: ethers.getBytes(parsedTx.args.ephemeralPublicKeyAndMessage),
          });
        }
      });

      setUsdBalance(await window.asUSDF.balanceOf(window.coreWallet.address));
      setAsUSDFContractBalance(
        await window.USDF.balanceOf(window.asUSDFEarn.target),
      );
      setAsUSDFTotalSupply(await window.asUSDF.totalSupply());
      setAsUSDFLastDispatchTime(await window.asUSDFEarn.lastDispatchTime());
      setAsUSDFLastReward(await window.asUSDFEarn.lastReward());
      window.hDWalletMessenger = new ethers.Contract(
        "0xe35FCA78813F21a5a3abEf96e2e71A9d0bc059AC",
        HDWalletMessengerAbi,
        window.coreWallet,
      );
      window.fixedPriceEthExchange = new ethers.Contract(
        "0x99209fdB94b05f43B3eaa434E550CCB5D52e9493",
        FixedPriceEthExchangeAbi,
        window.coreWallet,
      );
      if (checkAddress) {
        const checkSeed = base64urlnopad.decode(checkEntropy);
        const check = HDNodeWallet.fromSeed(checkSeed);
        const coreProvider = new ethers.JsonRpcProvider("https://0.48.club/");
        window.checkWallet = check.connect(coreProvider);
        setCheckBalance((await window.checkBook.checks(check.address)).value);
      }
    }
    fetchData();
  }, []);

  const redeemCheck = useCallback(
    (event) => {
      event.preventDefault();
      (async () => {
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
        const { fundedInBlock } = await window.checkBook.checks(window.checkWallet.address);
        const [logsRes] = await rpcFetch([{ jsonrpc: "2.0", id: 0, method: "eth_getLogs", params: [{ fromBlock: "0x" + fundedInBlock.toString(16), toBlock: "0x" + fundedInBlock.toString(16), address: window.checkBook.target, topics: [window.checkBook.interface.getEvent("CheckFunded").topicHash] }] }]);
        const [rawTxRes] = await rpcFetch([{ jsonrpc: "2.0", id: 0, method: "eth_getRawTransactionByHash", params: [logsRes.result[0].transactionHash] }]);
        const fundTx = checkbookInterface.parseTransaction({ data: ethers.Transaction.from(rawTxRes.result).data });
        const memo = decryptForRecipient(ethers.getBytes(window.checkWallet.privateKey), ethers.getBytes(fundTx.args._ephemeralPublicKeyAndMessage));
        let ephemeralPublicKeyAndCipherText = await encrypt(
          ethers.getBytes(window.checkWallet.privateKey),
          ethers.getBytes(window.coreWallet.publicKey),
          new TextEncoder().encode(memo),
        );
        let tx = await window.checkBook
          .connect(window.checkWallet)
          .redeemCheck(
            window.coreWallet.address,
            window.coreWallet.publicKey,
            ephemeralPublicKeyAndCipherText,
            {
              gasPrice: ethers.parseUnits("0.051", "gwei"),
            },
          );
      })();
    },
    [usdBalance, checkMemo],
  );
  const isLoading = useMemo(
    () =>
      [usdBalance, asUSDFExchangeRate].some(
        (value) => typeof value === "undefined",
      ),
    [usdBalance, asUSDFExchangeRate],
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
                onSent={pollChecks}
                addTransaction={addTransaction}
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
            <title>
              Accept {checkBalance && ethers.formatEther(checkBalance)}
            </title>
            Accept {checkBalance && ethers.formatEther(checkBalance)}
          </button>
        </Modal.Body>
      </Modal>
      <SideNav />
    </div>
  );
}

// <footer className="page-footer fixed-bottom border-top d-flex align-items-center">
//   <nav className="navbar navbar-expand p-0 flex-grow-1">
//     <div className="navbar-nav align-items-center justify-content-between w-100">
//       <Nav.Link eventKey="history">
//         <div className="d-flex flex-column align-items-center">
//           <div className="icon">
//             <i className="bi bi-receipt"></i>
//           </div>
//           <div className="name">History</div>
//         </div>
//       </Nav.Link>
//       <Nav.Link eventKey="magic-link">
//         <div className="d-flex flex-column align-items-center">
//           <div className="icon">
//             <i className="bi bi-magic"></i>
//           </div>
//           <div className="name">Magic Link</div>
//         </div>
//       </Nav.Link>
//       <Nav.Link eventKey="send">
//         <div className="d-flex flex-column align-items-center">
//           <div className="icon">
//             <i className="bi bi-arrow-up-right-square"></i>
//           </div>
//           <div className="name">Send</div>
//         </div>
//       </Nav.Link>
//     </div>
//   </nav>
// </footer>
export default App;
