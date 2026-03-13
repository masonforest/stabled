import Card from "react-bootstrap/Card";
import { ethers, computeAddress, hexlify, getBytes, defaultPath } from "ethers";
import { HDNodeWallet } from "ethers/wallet";
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import * as secp from '@noble/secp256k1';

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
function decryptForSender(messageIndex, recipientPublicKey, encryptedMessage) {
  try {
    const ephemeralPrivateKey = getEphemeralPrivateKey(messageIndex, messageIndex)
    const ephemeralPublicKey = encryptedMessage.slice(0, 33);
    const nonce = ephemeralPublicKey.slice(0, 24);
    const ciphertext = encryptedMessage.slice(33);
    const secret = secp.getSharedSecret(
      ephemeralPrivateKey,
      recipientPublicKey,
      true,
    );
    const key = secret.slice(0, 32);
    return new TextDecoder().decode(
      xchacha20poly1305(key, nonce).decrypt(ciphertext),
    );
  } catch (e) {
    // console.log(e)
    return "";
  }
}

function decryptForRecipient(privateKey, encryptedMessage) {
  console.log("encryptedMessage:", encryptedMessage)
  console.log("privateKey:", privateKey)
  const ephemeralPublicKey = encryptedMessage.slice(0, 33);
  const nonce = ephemeralPublicKey.slice(0,24);
  const ciphertext = encryptedMessage.slice(33);
  const secret = secp.getSharedSecret(privateKey, ephemeralPublicKey, true);
  const key = secret.slice(0, 32);
  console.log("xxx")
  return new TextDecoder().decode(xchacha20poly1305(key, nonce).decrypt(ciphertext));
}

function getEphemeralPrivateKey(accountId, messageIndex) {
  return ethers.getBytes(
    HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(
        localStorage.mnemonic,
        `e/1116' ${accountId}' /${messageIndex}`,
      ),
    ).privateKey,
  );
}


function message (transaction) {
  switch(transaction.action) {

    case 'CheckFunded':
      return <><div>You sent <span style={{color: "red"}}>${ethers.formatEther(BigInt(transaction.amount))}</span> {transaction.redeemed ? null :<span style={{color: "grey"}}>(Pending)</span>}</div>
      {decryptForSender(transaction.messageIndex, ethers.getBytes(transaction.toPublicKey), ethers.getBytes(transaction.encryptedMemo))}
      </>
    case 'CheckRedeemed':
      return <><div>You received <span style={{color: "green"}}>${ethers.formatEther(BigInt(transaction.amount))}</span></div>
      {decryptForRecipient(ethers.getBytes(window.coreWallet.privateKey), ethers.getBytes(transaction.encryptedMemo))}
      </>
    default:
      return <></>
  }

}

function Transaction({ transaction }) {
  return (
    <Card key={transaction.transactionHash+transaction.encryptedMemo} className="mt-3">
      <Card.Body className="d-flex flex-column p-3"> {/* Added padding */}
        <div className="d-flex justify-content-between align-items-start gap-3"> {/* Added gap and align-items-start */}
          <div className="flex-grow-1"> {/* Allow message to take available space */}
            {message(transaction)}
          </div>
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`https://bscscan.com/tx/${transaction.transactionHash}`}
            className="text-decoration-none text-nowrap flex-shrink-0" /* Prevent wrapping */
            style={{ color: '#0d6efd' }} /* Optional: match Bootstrap primary color */
          >
            View Transaction <i className="bi bi-box-arrow-in-up-right ms-1"></i>
          </a>
        </div>
      </Card.Body>
    </Card>
  );
}
export default Transaction;
