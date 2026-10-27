import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./foundation.css";
import "./ui/controls.css";
import "./styles.css";
import App from "./App";
import { MotionRoot } from "./motion";
import { StoreProvider } from "./store";
import { ToastProvider } from "./ui/toasts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionRoot>
      <ToastProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </ToastProvider>
    </MotionRoot>
  </StrictMode>,
);
