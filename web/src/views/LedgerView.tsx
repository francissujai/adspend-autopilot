import { useRef } from "react";
import { LedgerChain } from "../components/LedgerChain";
import { useStore } from "../store-context";

export function LedgerView() {
  const { state } = useStore();
  const root = useRef<HTMLDivElement>(null);
  return (
    <div className="page" ref={root}>
      <div className="page-head">
        <div>
          <h1>Ledger</h1>
          <p>Every cycle, decision, review and budget change is signed with Ed25519 and chained to the entry before it. Editing, deleting or reordering any entry breaks verification.</p>
        </div>
      </div>
      <div style={{ maxWidth: 760 }}>{state && <LedgerChain ledger={state.ledger} />}</div>
    </div>
  );
}
