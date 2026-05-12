use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::{FACILITATOR_BOND_SEED, GOVERNANCE_PUBKEY};
use crate::errors::OtomatError;
use crate::events::{FacilitatorBonded, FacilitatorSlashed};
use crate::state::FacilitatorBond;

// ---------------------------------------------------------------------------
// open_facilitator_bond
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct OpenFacilitatorBond<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = operator,
        space = 8 + FacilitatorBond::INIT_SPACE,
        seeds = [FACILITATOR_BOND_SEED, operator.key().as_ref()],
        bump,
    )]
    pub bond: Account<'info, FacilitatorBond>,

    #[account(
        init,
        payer = operator,
        associated_token::mint = bond_mint,
        associated_token::authority = bond,
        associated_token::token_program = token_program,
    )]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = operator,
        token::token_program = token_program,
    )]
    pub operator_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_facilitator_bond(ctx: Context<OpenFacilitatorBond>, amount: u64) -> Result<()> {
    require!(amount > 0, OtomatError::ZeroAmount);

    let decimals = ctx.accounts.bond_mint.decimals;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.operator_ata.to_account_info(),
                mint: ctx.accounts.bond_mint.to_account_info(),
                to: ctx.accounts.bond_vault.to_account_info(),
                authority: ctx.accounts.operator.to_account_info(),
            },
        ),
        amount,
        decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let operator_key = ctx.accounts.operator.key();
    let bond_mint_key = ctx.accounts.bond_mint.key();

    let bond = &mut ctx.accounts.bond;
    bond.operator = operator_key;
    bond.bond_amount = amount;
    bond.bond_mint = bond_mint_key;
    bond.slashed = 0;
    bond.active = true;
    bond.last_settle_ts = now;

    emit!(FacilitatorBonded {
        operator: operator_key,
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// slash_facilitator
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct SlashFacilitator<'info> {
    pub governance: Signer<'info>,

    /// CHECK: operator whose bond is slashed; used as a PDA seed and checked by
    /// `has_one = operator` against the bond account.
    pub operator: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [FACILITATOR_BOND_SEED, operator.key().as_ref()],
        bump,
        has_one = operator,
        has_one = bond_mint,
    )]
    pub bond: Account<'info, FacilitatorBond>,

    pub bond_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = bond_mint,
        associated_token::authority = bond,
        associated_token::token_program = token_program,
    )]
    pub bond_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = bond_mint,
        token::token_program = token_program,
    )]
    pub slash_destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_slash_facilitator(
    ctx: Context<SlashFacilitator>,
    amount: u64,
    reason_hash: [u8; 32],
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.governance.key(),
        GOVERNANCE_PUBKEY,
        OtomatError::GovernanceMismatch
    );
    require!(amount > 0, OtomatError::ZeroAmount);

    let (bond_amount, slashed_so_far) = {
        let bond = &ctx.accounts.bond;
        (bond.bond_amount, bond.slashed)
    };
    let remaining = bond_amount.saturating_sub(slashed_so_far);
    require!(amount <= remaining, OtomatError::BondInsufficient);

    let decimals = ctx.accounts.bond_mint.decimals;
    let operator_key = ctx.accounts.operator.key();
    let bond_bump = ctx.bumps.bond;
    let seeds: &[&[u8]] = &[FACILITATOR_BOND_SEED, operator_key.as_ref(), &[bond_bump]];
    let signer: &[&[&[u8]]] = &[seeds];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.bond_vault.to_account_info(),
                mint: ctx.accounts.bond_mint.to_account_info(),
                to: ctx.accounts.slash_destination.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
            },
            signer,
        ),
        amount,
        decimals,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.slashed = bond.slashed.checked_add(amount).unwrap();
    if bond.slashed >= bond.bond_amount {
        bond.active = false;
    }

    emit!(FacilitatorSlashed {
        operator: operator_key,
        amount,
        reason_hash,
    });
    Ok(())
}
