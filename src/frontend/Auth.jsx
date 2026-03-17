import { useState } from "react";
import Modal from "react-bootstrap/Modal";
import * as bip39 from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english";

function Auth({ onAuth }) {
  const [view, setView] = useState(null); // null | "create" | "login"
  const [generatedMnemonic] = useState(() => bip39.generateMnemonic(english));
  const [loginMnemonic, setLoginMnemonic] = useState("");
  const [error, setError] = useState("");

  if (view === "create") {
    return (
      <Modal show centered>
        <Modal.Header>
          <Modal.Title>Create Account</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Save this recovery phrase in your password manager. You'll need it to log in.</p>
          <form onSubmit={(e) => { e.preventDefault(); onAuth(generatedMnemonic); }}>
            <input
              type="password"
              className="form-control font-monospace"
              value={generatedMnemonic}
              readOnly
              autoComplete="new-password"
            />
            <button type="submit" className="btn btn-success w-100 mt-3">
              Create Account
            </button>
          </form>
        </Modal.Body>
      </Modal>
    );
  }

  if (view === "login") {
    return (
      <Modal show centered>
        <Modal.Header>
          <Modal.Title>Login</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={(e) => {
            e.preventDefault();
            const phrase = loginMnemonic.trim();
            if (!bip39.validateMnemonic(phrase, english)) {
              setError("Invalid recovery phrase.");
              return;
            }
            onAuth(phrase);
          }}>
            <input
              type="text"
              className="form-control"
              placeholder="Enter your recovery phrase"
              value={loginMnemonic}
              onChange={(e) => { setLoginMnemonic(e.target.value); setError(""); }}
              autoComplete="current-password"
            />
            {error && <div className="text-danger mt-1 small">{error}</div>}
            <button type="submit" className="btn btn-success w-100 mt-3">
              Login
            </button>
          </form>
        </Modal.Body>
      </Modal>
    );
  }

  return (
    <Modal show centered>
      <Modal.Header>
        <Modal.Title>Welcome to Stable Network</Modal.Title>
      </Modal.Header>
      <Modal.Body className="d-flex flex-column gap-2">
        <button className="btn btn-success w-100" onClick={() => setView("create")}>
          Create Account
        </button>
        <button className="btn btn-outline-secondary w-100" onClick={() => setView("login")}>
          Login
        </button>
      </Modal.Body>
    </Modal>
  );
}

export default Auth;
