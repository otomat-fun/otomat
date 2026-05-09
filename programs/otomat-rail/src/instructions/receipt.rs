use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::{MAX_SCHEME_ID, RECEIPT_SEED};
use crate::errors::OtomatError;
use crate::events::ReceiptCommitted;
use crate::state::Receipt;

#[derive(Accounts)]
#[instruction(amount: u64, resource_hash: [u8; 32], nonce: u64, scheme: u8)]
pub struct CommitReceipt<'info> {
    #[account(mut)]
    pub facilitator: Signer<'info>,

    /// CHECK: payer of the settled payment; used as a PDA seed and recorded.
    pub payer: UncheckedAccount<'info>,

    /// CHECK: payee of the settled payment; recorded on the receipt.
    pub payee: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = facilitator,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, payer.key().as_ref(), resource_hash.as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub receipt: Account<'info, Receipt>,

    pub system_program: Program<'info, System>,
}

pub fn handle_commit_receipt(
    ctx: Context<CommitReceipt>,
    amount: u64,
    resource_hash: [u8; 32],
    nonce: u64,
    scheme: u8,
) -> Result<()> {
    require!(amount > 0, OtomatError::ZeroAmount);
    require!(scheme <= MAX_SCHEME_ID, OtomatError::InvalidScheme);

    let now = Clock::get()?.unix_timestamp;
    let payer_key = ctx.accounts.payer.key();
    let payee_key = ctx.accounts.payee.key();
    let mint_key = ctx.accounts.mint.key();

    let receipt = &mut ctx.accounts.receipt;
    receipt.payer = payer_key;
    receipt.payee = payee_key;
    receipt.amount = amount;
    receipt.mint = mint_key;
    receipt.resource_hash = resource_hash;
    receipt.nonce = nonce;
    receipt.timestamp = now;
    receipt.scheme = scheme;

    emit!(ReceiptCommitted {
        payer: payer_key,
        payee: payee_key,
        amount,
        resource_hash,
        scheme,
    });
    Ok(())
}
