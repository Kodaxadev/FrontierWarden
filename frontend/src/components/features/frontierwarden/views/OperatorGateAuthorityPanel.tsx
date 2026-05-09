import { useOperatorGateAuthority } from "../../../../hooks/useOperatorGateAuthority";
import type { GateBindingStatusResponse } from "../../../../types/api.types";

interface OperatorGateAuthorityPanelProps {
  binding: GateBindingStatusResponse | null;
}

function shortId(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function operatorAuthorityLabel(status: string): string {
  switch (status) {
    case "wallet_not_connected":
      return "Wallet not connected";
    case "checking_character":
      return "Checking character";
    case "no_character":
      return "No PlayerProfile / Character found";
    case "character_found":
      return "Character found";
    case "checking_gate_caps":
      return "Checking Gate OwnerCaps";
    case "no_gate_authority":
      return "No owned Gate authority found";
    case "gate_authority_found":
      return "Owned Gate authority found";
    case "query_failed":
      return "Operator authority query failed";
    default:
      return status;
  }
}

function sameId(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function OperatorGateAuthorityPanel({
  binding,
}: OperatorGateAuthorityPanelProps) {
  const operatorAuthority = useOperatorGateAuthority();
  const ownedBoundGate =
    operatorAuthority.gates.find((gate) =>
      sameId(gate.worldGateId, binding?.worldGateId),
    ) ?? null;
  const boundGateMismatch = Boolean(
    binding?.worldGateId &&
    !ownedBoundGate &&
    (operatorAuthority.status === "gate_authority_found" ||
      operatorAuthority.status === "no_gate_authority"),
  );

  return (
    <div
      style={{
        marginTop: 18,
        padding: 14,
        border: "1px solid var(--c-border)",
        background: "rgba(255,255,255,0.016)",
      }}
    >
      <div className="c-stat__label" style={{ marginBottom: 10 }}>
        Operator Gate Authority
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Authority status</span>
        <span className="c-kv__v">
          {operatorAuthorityLabel(operatorAuthority.status)}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Connected wallet</span>
        <span className="c-kv__v">
          {shortId(operatorAuthority.walletAddress)}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Character</span>
        <span className="c-kv__v">
          {operatorAuthority.characterName ??
            shortId(operatorAuthority.characterId)}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Character wallet</span>
        <span className="c-kv__v">
          {shortId(operatorAuthority.characterWallet)}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">PlayerProfile</span>
        <span className="c-kv__v">
          {shortId(operatorAuthority.playerProfileId)}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Gate OwnerCaps</span>
        <span className="c-kv__v">{operatorAuthority.ownerCaps.length}</span>
      </div>

      {operatorAuthority.ownerCaps.length > 0 && (
        <div className="c-sub" style={{ marginTop: 8 }}>
          {operatorAuthority.ownerCaps.map((cap) => (
            <div key={cap.objectId}>
              OwnerCap {shortId(cap.objectId)} controls Gate{" "}
              {shortId(cap.authorizedObjectId)} via {cap.source}.
            </div>
          ))}
        </div>
      )}

      {operatorAuthority.gates.length > 0 && (
        <div className="c-sub" style={{ marginTop: 8 }}>
          {operatorAuthority.gates.map((gate) => (
            <div key={gate.worldGateId}>
              Candidate Gate {shortId(gate.worldGateId)}:{" "}
              {gate.status ?? "status unknown"}
              {gate.linkedGateId
                ? ` / linked ${shortId(gate.linkedGateId)}`
                : " / link unknown"}
              .
            </div>
          ))}
        </div>
      )}

      {ownedBoundGate && (
        <div className="c-sub" style={{ marginTop: 8 }}>
          Connected operator controls OwnerCap&lt;Gate&gt; for the currently
          bound world Gate.
        </div>
      )}
      {boundGateMismatch && (
        <div
          className="c-sub"
          style={{ color: "var(--c-crimson)", marginTop: 8 }}
        >
          Current bound Gate is owned by a different operator. Extension
          authorization unavailable until connected operator controls
          OwnerCap&lt;Gate&gt; for the bound world Gate.
        </div>
      )}
      {binding?.bindingStatus === "bound" && !binding.fwExtensionActive && (
        <div className="c-sub" style={{ marginTop: 8 }}>
          BOUND, not BINDING VERIFIED. GateAdminCap is policy authority;
          OwnerCap&lt;Gate&gt; is world Gate authority.
        </div>
      )}
      {operatorAuthority.errors.map((error) => (
        <div
          key={error}
          className="c-sub"
          style={{ color: "var(--c-crimson)", marginTop: 8 }}
        >
          {error}
        </div>
      ))}
      {operatorAuthority.warnings.map((warning) => (
        <div key={warning} className="c-sub" style={{ marginTop: 8 }}>
          {warning}
        </div>
      ))}
    </div>
  );
}
