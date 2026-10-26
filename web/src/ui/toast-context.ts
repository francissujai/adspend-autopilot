import { createContext, useContext } from "react";

export const ToastCtx = createContext<(msg: string, ok?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
