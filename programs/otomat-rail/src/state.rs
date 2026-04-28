use anchor_lang::prelude::*;

/// Lifecycle status of a payment [`Channel`].
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ChannelStatus {
    /// Funded and accepting off-chain checks.
    Open,
    /// A unilateral close has been proposed; the dispute window is running.
    CloseInitiated,
    /// Settled and about to be (or already) closed on-chain.
    Closed,
    /// A newer check overrode a pending close during the dispute window.
    Disputed,
}

/// A payer -> payee escrow channel keyed by `(payer, payee, mint)`.
///
/// PDA seeds: `[b"channel", payer, payee, mint]`.
#[account]
#[derive(InitSpace)]
pub struct Channel {
    /// Funder of the escrow; the only party whose Ed25519 checks are honoured.
    pub payer: Pubkey,
    /// Recipient of settled funds.
    pub payee: Pubkey,
    /// SPL Token or Token-2022 mint escrowed by this channel.
    pub mint: Pubkey,
    /// Settlement signer authorised to cooperatively close the channel.
    pub facilitator: Pubkey,
    /// Total amount the payer deposited into escrow.
    pub deposit: u64,
    /// Highest cumulative amount recorded from a verified check.
    pub cumulative_paid: u64,
    /// Highest check nonce recorded; monotonically increasing.
    pub nonce: u64,
    /// Unix timestamp after which the payer may `timeout_reclaim`.
    pub expiry: i64,
    /// Current lifecycle status.
    pub status: ChannelStatus,
    /// Unix timestamp at which the dispute window closes (0 when not disputing).
    pub dispute_window_end: i64,
    /// Bump for the channel PDA.
    pub bump: u8,
    /// Bump for the escrow-authority PDA that owns the vault.
    pub escrow_bump: u8,
}

/// An on-chain payment receipt committed for `exact` and channel settlements.
///
/// PDA seeds: `[b"receipt", payer, resource_hash, nonce_le]`.
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub mint: Pubkey,
    /// `sha256(resource_url)` bound to the payment.
    pub resource_hash: [u8; 32],
    pub nonce: u64,
    pub timestamp: i64,
    /// `0` = exact, `1` = otomat-channel, `2` = otomat-stream.
    pub scheme: u8,
}

/// A facilitator operator's slashable bond.
///
/// PDA seeds: `[b"facilitator_bond", operator]`.
#[account]
#[derive(InitSpace)]
pub struct FacilitatorBond {
    pub operator: Pubkey,
    /// Amount originally bonded into the vault.
    pub bond_amount: u64,
    /// Mint of the bonded asset (OTOMAT / USDC / SOL wrapper in v1).
    pub bond_mint: Pubkey,
    /// Cumulative amount slashed so far.
    pub slashed: u64,
    /// Whether the operator is still an active facilitator.
    pub active: bool,
    /// Unix timestamp of the last settlement bookkeeping update.
    pub last_settle_ts: i64,
}
