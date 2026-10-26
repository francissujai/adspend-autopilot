import { useRef } from "react";
import { LedgerChain } from "../components/LedgerChain";
import { enter, useGSAP } from "../motion";
import { useStore } from "../store-context";

export function LedgerView() {
  const { state } = useStore();
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => enter(".reveal"), { scope: root });
  return (
    <div className="page" ref={root}>
      <div className="page-head reveal">
        <div>
          <h1>Ledger</h1>
          <p>Every cycle, decision, review and budget change is signed with Ed25519 and chained to the entry before it. Editing, deleting or reordering any entry breaks verification.</p>
        </div>
      </div>
      <div className="reveal" style={{ maxWidth: 760 }}>{state && <LedgerChain ledger={state.ledger} />}</div>
    </div>
  );
}
