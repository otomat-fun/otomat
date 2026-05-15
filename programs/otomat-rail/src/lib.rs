//! Otomat settlement rail — on-chain escrow, payment-channel settlement, receipt
//! registry, and facilitator bond/slash for the Solana x402 payment rail.
//!
//! The program implements three settlement paths over a single escrow channel:
//! cooperative close (`close_channel`), unilateral close with a challenge window
//! (`dispute_channel` + `resolve_dispute`), and payer reclaim on abandonment
//! (`timeout_reclaim`). Off-chain payer "checks" are authenticated with the
//! Ed25519 native program and inspected through the instructions sysvar.

use anchor_lang::prelude::*;

pub mod constants;
pub mod ed25519;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("FwFC1nDo5r224uXDeTMc2X8FhXuiz9CqBF7tg3trEVhN");

#[program]
pub mod otomat_rail {
    use super::*;

    /// Open and fund a payer -> payee escrow channel.
    pub fn open_channel(
        ctx: Context<OpenChannel>,
        deposit: u64,
        expiry: i64,
        facilitator: Pubkey,
    ) -> Result<()> {
        instructions::channel::handle_open_channel(ctx, deposit, expiry, facilitator)
    }

    /// Cooperatively close a channel: settle `cumulative_amount` to the payee,
    /// refund the remainder, and close the account. Requires a payer-signed
    /// check verified through the Ed25519 pre-instruction.
    pub fn close_channel(
        ctx: Context<CloseChannel>,
        cumulative_amount: u64,
        nonce: u64,
        signature: [u8; 64],
    ) -> Result<()> {
        instructions::channel::handle_close_channel(ctx, cumulative_amount, nonce, signature)
    }

    /// Submit a newer payer-signed check to open (or extend) the dispute window.
    pub fn dispute_channel(
        ctx: Context<DisputeChannel>,
        counter_cumulative: u64,
        counter_nonce: u64,
        counter_signature: [u8; 64],
    ) -> Result<()> {
        instructions::channel::handle_dispute_channel(
            ctx,
            counter_cumulative,
            counter_nonce,
            counter_signature,
        )
    }

    /// Finalise a disputed/unilaterally-closed channel after the challenge window.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>) -> Result<()> {
        instructions::channel::handle_resolve_dispute(ctx)
    }

    /// Reclaim the escrow to the payer once a channel has expired without a close.
    pub fn timeout_reclaim(ctx: Context<TimeoutReclaim>) -> Result<()> {
        instructions::channel::handle_timeout_reclaim(ctx)
    }

    /// Commit an on-chain receipt for an `exact`-scheme (single) settlement.
    pub fn commit_receipt(
        ctx: Context<CommitReceipt>,
        amount: u64,
        resource_hash: [u8; 32],
        nonce: u64,
        scheme: u8,
    ) -> Result<()> {
        instructions::receipt::handle_commit_receipt(ctx, amount, resource_hash, nonce, scheme)
    }

    /// Post a facilitator bond into a program-owned vault.
    pub fn open_facilitator_bond(ctx: Context<OpenFacilitatorBond>, amount: u64) -> Result<()> {
        instructions::facilitator::handle_open_facilitator_bond(ctx, amount)
    }

    /// Slash a facilitator bond by `amount`; governance-signed.
    pub fn slash_facilitator(
        ctx: Context<SlashFacilitator>,
        amount: u64,
        reason_hash: [u8; 32],
    ) -> Result<()> {
        instructions::facilitator::handle_slash_facilitator(ctx, amount, reason_hash)
    }
}
