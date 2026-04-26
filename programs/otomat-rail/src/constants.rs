use anchor_lang::prelude::*;

/// PDA seed prefix for a payment [`crate::state::Channel`].
pub const CHANNEL_SEED: &[u8] = b"channel";

/// PDA seed prefix for the escrow authority that owns a channel's token vault.
pub const ESCROW_AUTH_SEED: &[u8] = b"escrow_auth";

/// PDA seed prefix for an on-chain [`crate::state::Receipt`].
pub const RECEIPT_SEED: &[u8] = b"receipt";

/// PDA seed prefix for a [`crate::state::FacilitatorBond`].
pub const FACILITATOR_BOND_SEED: &[u8] = b"facilitator_bond";

/// Canonical prefix of the off-chain payment "check" that a payer signs with
/// Ed25519. The full signed message is the byte concatenation:
///
/// `otomat/v2/check|` || channel_pda(32) || cumulative_le(8) || nonce_le(8) || expiry_le(8)
///
/// The literal is 16 bytes long ("otomat/v2/check" + the `|` separator).
pub const CHECK_MESSAGE_PREFIX: &[u8] = b"otomat/v2/check|";

/// Challenge period, in seconds, opened by a unilateral close
/// ([`crate::instructions::channel::DisputeChannel`]) before the channel can be
/// finalised through `resolve_dispute`.
pub const DISPUTE_WINDOW_SECONDS: i64 = 120;

/// v1 governance authority permitted to slash facilitator bonds. Hardcoded for
/// the initial mainnet release; a later version migrates this to an on-chain
/// governance program. This is the Otomat deploy authority.
pub const GOVERNANCE_PUBKEY: Pubkey =
    anchor_lang::solana_program::pubkey!("2v5visc5KAYDQB5NhLuSX6oUm4mxQsp1Ra7iVRKgDJzQ");

/// Highest scheme id accepted by `commit_receipt`:
/// `0` = exact, `1` = otomat-channel, `2` = otomat-stream.
pub const MAX_SCHEME_ID: u8 = 2;
