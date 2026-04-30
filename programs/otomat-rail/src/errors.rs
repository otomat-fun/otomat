use anchor_lang::prelude::*;

/// Program error set for the Otomat settlement rail.
#[error_code]
pub enum OtomatError {
    #[msg("Ed25519 signature does not match the expected channel check")]
    InvalidSignature,
    #[msg("Nonce must strictly increase over the last recorded check")]
    NonceNotIncreasing,
    #[msg("Cumulative amount exceeds the channel deposit")]
    CumulativeExceedsDeposit,
    #[msg("Channel has already expired")]
    ChannelExpired,
    #[msg("Channel has not yet reached its expiry")]
    ChannelNotExpired,
    #[msg("Channel status does not permit this operation")]
    InvalidChannelStatus,
    #[msg("Ed25519 pre-instruction is missing at index 0")]
    MissingEd25519Instruction,
    #[msg("Signed message does not match the reconstructed check")]
    MessageMismatch,
    #[msg("Token program is not a supported SPL Token or Token-2022 program")]
    InvalidTokenProgram,
    #[msg("Signer is not the facilitator registered on this channel")]
    FacilitatorMismatch,
    #[msg("Signer is not the configured governance authority")]
    GovernanceMismatch,
    #[msg("Slash amount exceeds the remaining bonded balance")]
    BondInsufficient,
    #[msg("Operator already has an active bond")]
    BondAlreadyActive,
    #[msg("Dispute challenge window has not yet elapsed")]
    DisputeWindowActive,
    #[msg("Unknown payment scheme identifier")]
    InvalidScheme,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
}
