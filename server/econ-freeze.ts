// EMERGENCY (2026-06-11): the player economy was client-authoritative —
// PUT /api/character stored the save verbatim, the Grand Exchange minted coins
// by self-matching with no balance backing, handleDrop spawned unowned items,
// and P2P trade + the market validated possession against the forgeable save.
//
// Until the server-owned economy refactor lands and is verified, every path
// that MOVES WEALTH BETWEEN ACCOUNTS (or conjures it from nothing) is frozen.
// Single-account save editing still "works" but is sandboxed — it can no longer
// be cashed out, transferred, or used to pollute the public price oracle.
//
// Lift with ECONOMY_FROZEN=0 in the service environment ONLY after the
// server-authoritative ledger is live and audited.
export const ECONOMY_FROZEN = process.env.ECONOMY_FROZEN !== '0';

export const FREEZE_MSG =
  'The Exchange and markets are closed for urgent maintenance — trading is temporarily disabled.';
