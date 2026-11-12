import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./ui";
import "./index.css";
document.documentElement.classList.add("dark");   // the Robotics & AI theme is dark only
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><HashRouter><ToastProvider><App /></ToastProvider></HashRouter></React.StrictMode>
);

// installable + fast reloads; /api is never cached by the worker (see public/sw.js)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {}); });
}
