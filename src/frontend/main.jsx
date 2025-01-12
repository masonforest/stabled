import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

if(window.location.hash.slice(1)) {
    import("bootstrap/dist/css/bootstrap.min.css");
    import("./index.css");
    createRoot(document.getElementById("root")).render(<App />);
}
