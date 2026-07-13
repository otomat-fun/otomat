use anchor_lang::prelude::*;

/// Emitted when a payer opens and funds a payment channel.
#[event]
pub struct ChannelOpened {
    pub channel: Pubkey,
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub deposit: u64,
}

/// Emitted when a channel is finalised (cooperative close, dispute resolution,
/// or timeout reclaim) and settled on-chain.
#[event]
pub struct ChannelClosed {
    pub channel: Pubkey,
    pub cumulative_paid: u64,
    pub refund: u64,
    pub nonce: u64,
}

/// Emitted when a newer signed check overrides the pending close of a channel.
#[event]
pub struct ChannelDisputed {
    pub channel: Pubkey,
    pub counter_cumulative: u64,
    pub counter_nonce: u64,
}

/// Emitted when a facilitator commits a single-payment (`exact` scheme) receipt.
#[event]
pub struct ReceiptCommitted {
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub amount: u64,
    pub resource_hash: [u8; 32],
    pub scheme: u8,
}

/// Emitted when an operator posts a facilitator bond.
#[event]
pub struct FacilitatorBonded {
    pub operator: Pubkey,
    pub amount: u64,
}

/// Emitted when governance slashes a facilitator bond.
#[event]
pub struct FacilitatorSlashed {
    pub operator: Pubkey,
    pub amount: u64,
    pub reason_hash: [u8; 32],
}

/// Emitted when a payer reclaims their escrow after the channel expires without
/// a settlement (`timeout_reclaim`). Complements the generic [`ChannelClosed`]
/// with reclaim-specific payer, mint, and refunded amount so indexers can tell an
/// abandonment refund apart from a cooperative close or a dispute resolution.
#[event]
pub struct ChannelReclaimed {
    pub channel: Pubkey,
    pub payer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
