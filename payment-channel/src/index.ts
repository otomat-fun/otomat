export { ChannelClient } from './channel-client.js';

export {
  CHECK_MESSAGE_PREFIX,
  buildCanonicalCheckMessage,
  u64ToLeBytes,
  i64ToLeBytes,
  u64ToLeHex,
  i64ToLeHex,
} from './canonical-message.js';
export type { CanonicalCheckInput, Numeric } from './canonical-message.js';

export {
  CHANNEL_DISCRIMINATORS,
  deriveChannelPda,
  buildEd25519VerifyIx,
  buildOpenChannelIx,
  buildCloseChannelIx,
  buildDisputeChannelIx,
  buildTimeoutReclaimIx,
} from './anchor-io.js';
export type {
  Ed25519VerifyParams,
  OpenChannelIxParams,
  SettleChannelIxParams,
  TimeoutReclaimIxParams,
} from './anchor-io.js';

export { OTOMAT_RAIL_IDL, OTOMAT_RAIL_PROGRAM_ID } from './types/otomat-rail-idl.js';
export type { OtomatRail } from './types/otomat-rail-idl.js';

export type {
  Channel,
  ChannelConfig,
  ChannelSigner,
  ChannelStatus,
  Check,
  WalletAdapterLike,
} from './types.js';
