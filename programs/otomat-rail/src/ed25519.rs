use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program::ID as ED25519_PROGRAM_ID;
use anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked;

use crate::constants::CHECK_MESSAGE_PREFIX;
use crate::errors::OtomatError;

// Layout of the Ed25519 native program instruction data. A single
// `Ed25519SignatureOffsets` record is 14 bytes and is preceded by a 2-byte
// header `[num_signatures: u8, padding: u8]`.
const SIGNATURE_OFFSETS_START: usize = 2;
const SIGNATURE_OFFSETS_SERIALIZED_SIZE: usize = 14;
const PUBKEY_SERIALIZED_SIZE: usize = 32;
const SIGNATURE_SERIALIZED_SIZE: usize = 64;

/// Reconstruct the canonical check message the payer signs off-chain.
///
/// `otomat/v2/check|` || channel(32) || cumulative_le(8) || nonce_le(8) || expiry_le(8)
pub fn build_check_message(channel: &Pubkey, cumulative: u64, nonce: u64, expiry: i64) -> Vec<u8> {
    let mut message = Vec::with_capacity(CHECK_MESSAGE_PREFIX.len() + 32 + 8 + 8 + 8);
    message.extend_from_slice(CHECK_MESSAGE_PREFIX);
    message.extend_from_slice(channel.as_ref());
    message.extend_from_slice(&cumulative.to_le_bytes());
    message.extend_from_slice(&nonce.to_le_bytes());
    message.extend_from_slice(&expiry.to_le_bytes());
    message
}

/// Confirm that instruction index 0 of the current transaction is an Ed25519
/// native-program instruction that verifies exactly the tuple
/// `(expected_pubkey, expected_message, expected_signature)`.
///
/// The Ed25519 program performs the cryptographic verification when it executes;
/// this routine parses that instruction's data and asserts the verified inputs
/// are the ones the settlement logic requires, closing the gap that a bare
/// pre-instruction leaves (an attacker could otherwise sign an unrelated message).
pub fn verify_ed25519_check(
    instructions_sysvar: &AccountInfo,
    expected_pubkey: &[u8; 32],
    expected_message: &[u8],
    expected_signature: &[u8; 64],
) -> Result<()> {
    let ix = load_instruction_at_checked(0, instructions_sysvar)?;
    require_keys_eq!(
        ix.program_id,
        ED25519_PROGRAM_ID,
        OtomatError::MissingEd25519Instruction
    );

    let data = ix.data;
    require!(
        data.len() >= SIGNATURE_OFFSETS_START + SIGNATURE_OFFSETS_SERIALIZED_SIZE,
        OtomatError::InvalidSignature
    );
    // Channel checks carry exactly one signature.
    require!(data[0] == 1, OtomatError::InvalidSignature);

    // Parse the single Ed25519SignatureOffsets record (little-endian u16 fields).
    let read_u16 = |at: usize| -> usize { u16::from_le_bytes([data[at], data[at + 1]]) as usize };

    let signature_offset = read_u16(SIGNATURE_OFFSETS_START);
    // bytes [+2..+4]: signature_instruction_index (0xffff => this instruction)
    let pubkey_offset = read_u16(SIGNATURE_OFFSETS_START + 4);
    // bytes [+6..+8]: public_key_instruction_index
    let message_offset = read_u16(SIGNATURE_OFFSETS_START + 8);
    let message_size = read_u16(SIGNATURE_OFFSETS_START + 10);
    // bytes [+12..+14]: message_instruction_index

    require!(
        pubkey_offset + PUBKEY_SERIALIZED_SIZE <= data.len(),
        OtomatError::InvalidSignature
    );
    require!(
        signature_offset + SIGNATURE_SERIALIZED_SIZE <= data.len(),
        OtomatError::InvalidSignature
    );
    require!(
        message_offset + message_size <= data.len(),
        OtomatError::InvalidSignature
    );

    let actual_pubkey = &data[pubkey_offset..pubkey_offset + PUBKEY_SERIALIZED_SIZE];
    let actual_signature = &data[signature_offset..signature_offset + SIGNATURE_SERIALIZED_SIZE];
    let actual_message = &data[message_offset..message_offset + message_size];

    require!(
        actual_pubkey == expected_pubkey.as_ref(),
        OtomatError::InvalidSignature
    );
    require!(
        actual_signature == expected_signature.as_ref(),
        OtomatError::InvalidSignature
    );
    require!(
        actual_message == expected_message,
        OtomatError::MessageMismatch
    );

    Ok(())
}
