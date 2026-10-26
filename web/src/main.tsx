import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./foundation.css";
import "./styles.css";
import "./motion";
import App from "./App";
import { StoreProvider } from "./store";
import { ToastProvider } from "./ui/toasts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ToastProvider>
  </StrictMode>,
);
