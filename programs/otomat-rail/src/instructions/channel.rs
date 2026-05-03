use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::constants::{CHANNEL_SEED, DISPUTE_WINDOW_SECONDS, ESCROW_AUTH_SEED};
use crate::ed25519::{build_check_message, verify_ed25519_check};
use crate::errors::OtomatError;
use crate::events::{ChannelClosed, ChannelDisputed, ChannelOpened};
use crate::state::{Channel, ChannelStatus};

// ---------------------------------------------------------------------------
// Escrow settlement helpers.
//
// Every token CPI is kept in its own `#[inline(never)]` function so it occupies
// a dedicated BPF stack frame. The Solana runtime caps each frame at 4 KB;
// building several CPIs (or holding many `AccountInfo`s) in one frame overflows
// it. The handlers therefore pass account *references* and let these helpers
// materialise the `AccountInfo`s and CPI contexts in child frames.
// ---------------------------------------------------------------------------

/// Sign one escrow transfer with the channel's escrow-authority PDA.
#[allow(clippy::too_many_arguments)]
#[inline(never)]
fn escrow_transfer<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    escrow_authority: &AccountInfo<'info>,
    channel_key: &Pubkey,
    escrow_bump: u8,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let seeds: &[&[u8]] = &[ESCROW_AUTH_SEED, channel_key.as_ref(), &[escrow_bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            token_program.clone(),
            TransferChecked {
                from: from.clone(),
                mint: mint.clone(),
                to: to.clone(),
                authority: escrow_authority.clone(),
            },
            &[seeds],
        ),
        amount,
        decimals,
    )
}

/// Close the emptied escrow vault, returning its rent lamports to `destination`.
#[inline(never)]
fn escrow_close<'info>(
    token_program: &AccountInfo<'info>,
    escrow_ata: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    escrow_authority: &AccountInfo<'info>,
    channel_key: &Pubkey,
    escrow_bump: u8,
) -> Result<()> {
    let seeds: &[&[u8]] = &[ESCROW_AUTH_SEED, channel_key.as_ref(), &[escrow_bump]];
    close_account(CpiContext::new_with_signer(
        token_program.clone(),
        CloseAccount {
            account: escrow_ata.clone(),
            destination: destination.clone(),
            authority: escrow_authority.clone(),
        },
        &[seeds],
    ))
}

/// Settle `cumulative` to the payee and `refund` to the payer, then close the
/// vault. Runs in its own frame; the `AccountInfo`s live here, not in the caller.
#[allow(clippy::too_many_arguments)]
#[inline(never)]
fn settle_and_close<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    escrow_ata: &InterfaceAccount<'info, TokenAccount>,
    escrow_authority: &UncheckedAccount<'info>,
    payee_ata: &InterfaceAccount<'info, TokenAccount>,
    payer_ata: &InterfaceAccount<'info, TokenAccount>,
    payer_wallet: &UncheckedAccount<'info>,
    channel_key: &Pubkey,
    escrow_bump: u8,
    cumulative: u64,
    refund: u64,
    decimals: u8,
) -> Result<()> {
    let tp = token_program.to_account_info();
    let m = mint.to_account_info();
    let ea = escrow_ata.to_account_info();
    let auth = escrow_authority.to_account_info();
    let pye = payee_ata.to_account_info();
    let pyr = payer_ata.to_account_info();
    let wallet = payer_wallet.to_account_info();

    if cumulative > 0 {
        escrow_transfer(
            &tp,
            &ea,
            &m,
            &pye,
            &auth,
            channel_key,
            escrow_bump,
            cumulative,
            decimals,
        )?;
    }
    if refund > 0 {
        escrow_transfer(
            &tp,
            &ea,
            &m,
            &pyr,
            &auth,
            channel_key,
            escrow_bump,
            refund,
            decimals,
        )?;
    }
    escrow_close(&tp, &ea, &wallet, &auth, channel_key, escrow_bump)
}

/// Refund the full remaining balance to the payer and close the vault.
#[allow(clippy::too_many_arguments)]
#[inline(never)]
fn settle_refund_only<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    escrow_ata: &InterfaceAccount<'info, TokenAccount>,
    escrow_authority: &UncheckedAccount<'info>,
    payer_ata: &InterfaceAccount<'info, TokenAccount>,
    payer_wallet: &Signer<'info>,
    channel_key: &Pubkey,
    escrow_bump: u8,
    refund: u64,
    decimals: u8,
) -> Result<()> {
    let tp = token_program.to_account_info();
    let m = mint.to_account_info();
    let ea = escrow_ata.to_account_info();
    let auth = escrow_authority.to_account_info();
    let pyr = payer_ata.to_account_info();
    let wallet = payer_wallet.to_account_info();

    if refund > 0 {
        escrow_transfer(
            &tp,
            &ea,
            &m,
            &pyr,
            &auth,
            channel_key,
            escrow_bump,
            refund,
            decimals,
        )?;
    }
    escrow_close(&tp, &ea, &wallet, &auth, channel_key, escrow_bump)
}

// ---------------------------------------------------------------------------
// open_channel
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct OpenChannel<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: payee is only used as a PDA seed and stored on the channel.
    pub payee: UncheckedAccount<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        space = 8 + Channel::INIT_SPACE,
        seeds = [CHANNEL_SEED, payer.key().as_ref(), payee.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub channel: Account<'info, Channel>,

    /// CHECK: PDA that owns the escrow vault; derived and checked by seeds.
    #[account(
        seeds = [ESCROW_AUTH_SEED, channel.key().as_ref()],
        bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = escrow_authority,
        associated_token::token_program = token_program,
    )]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_channel(
    ctx: Context<OpenChannel>,
    deposit: u64,
    expiry: i64,
    facilitator: Pubkey,
) -> Result<()> {
    require!(deposit > 0, OtomatError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    require!(expiry > now, OtomatError::InvalidExpiry);

    let decimals = ctx.accounts.mint.decimals;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.payer_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.escrow_ata.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        deposit,
        decimals,
    )?;

    let channel_key = ctx.accounts.channel.key();
    let payer_key = ctx.accounts.payer.key();
    let payee_key = ctx.accounts.payee.key();
    let mint_key = ctx.accounts.mint.key();
    let channel_bump = ctx.bumps.channel;
    let escrow_bump = ctx.bumps.escrow_authority;

    let channel = &mut ctx.accounts.channel;
    channel.payer = payer_key;
    channel.payee = payee_key;
    channel.mint = mint_key;
    channel.facilitator = facilitator;
    channel.deposit = deposit;
    channel.cumulative_paid = 0;
    channel.nonce = 0;
    channel.expiry = expiry;
    channel.status = ChannelStatus::Open;
    channel.dispute_window_end = 0;
    channel.bump = channel_bump;
    channel.escrow_bump = escrow_bump;

    emit!(ChannelOpened {
        channel: channel_key,
        payer: payer_key,
        payee: payee_key,
        deposit,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// close_channel (cooperative, immediate settlement)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CloseChannel<'info> {
    #[account(mut)]
    pub facilitator: Signer<'info>,

    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel.payer.as_ref(), channel.payee.as_ref(), channel.mint.as_ref()],
        bump = channel.bump,
        has_one = payer,
        has_one = payee,
        has_one = mint,
        has_one = facilitator @ OtomatError::FacilitatorMismatch,
        close = payer,
    )]
    pub channel: Account<'info, Channel>,

    /// CHECK: payer wallet; validated via `has_one = payer`. Receives channel
    /// and escrow-vault rent.
    #[account(mut)]
    pub payer: UncheckedAccount<'info>,

    /// CHECK: payee wallet; validated via `has_one = payee`.
    pub payee: UncheckedAccount<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: escrow authority PDA; derived and checked by seeds.
    #[account(
        seeds = [ESCROW_AUTH_SEED, channel.key().as_ref()],
        bump = channel.escrow_bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_authority,
        associated_token::token_program = token_program,
    )]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payee,
        token::token_program = token_program,
    )]
    pub payee_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: instructions sysvar; validated by address, read for the Ed25519 proof.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_close_channel(
    ctx: Context<CloseChannel>,
    cumulative_amount: u64,
    nonce: u64,
    signature: [u8; 64],
) -> Result<()> {
    let channel_key = ctx.accounts.channel.key();

    let (payer_key, expiry, deposit, escrow_bump) = {
        let channel = &ctx.accounts.channel;
        require!(
            channel.status == ChannelStatus::Open,
            OtomatError::InvalidChannelStatus
        );
        require!(nonce > channel.nonce, OtomatError::NonceNotIncreasing);
        require!(
            cumulative_amount <= channel.deposit,
            OtomatError::CumulativeExceedsDeposit
        );
        (
            channel.payer,
            channel.expiry,
            channel.deposit,
            channel.escrow_bump,
        )
    };

    // Verify the payer-signed check carried by the Ed25519 pre-instruction.
    let message = build_check_message(&channel_key, cumulative_amount, nonce, expiry);
    verify_ed25519_check(
        &ctx.accounts.instructions.to_account_info(),
        &payer_key.to_bytes(),
        &message,
        &signature,
    )?;

    let refund = deposit
        .checked_sub(cumulative_amount)
        .ok_or(OtomatError::CumulativeExceedsDeposit)?;
    let decimals = ctx.accounts.mint.decimals;

    {
        let channel = &mut ctx.accounts.channel;
        channel.cumulative_paid = cumulative_amount;
        channel.nonce = nonce;
        channel.status = ChannelStatus::Closed;
    }

    settle_and_close(
        &ctx.accounts.token_program,
        &ctx.accounts.mint,
        &ctx.accounts.escrow_ata,
        &ctx.accounts.escrow_authority,
        &ctx.accounts.payee_ata,
        &ctx.accounts.payer_ata,
        &ctx.accounts.payer,
        &channel_key,
        escrow_bump,
        cumulative_amount,
        refund,
        decimals,
    )?;

    emit!(ChannelClosed {
        channel: channel_key,
        cumulative_paid: cumulative_amount,
        refund,
        nonce,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// dispute_channel (unilateral close / override with a newer check)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct DisputeChannel<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,

    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel.payer.as_ref(), channel.payee.as_ref(), channel.mint.as_ref()],
        bump = channel.bump,
    )]
    pub channel: Account<'info, Channel>,

    /// CHECK: instructions sysvar; validated by address, read for the Ed25519 proof.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

pub fn handle_dispute_channel(
    ctx: Context<DisputeChannel>,
    counter_cumulative: u64,
    counter_nonce: u64,
    counter_signature: [u8; 64],
) -> Result<()> {
    let channel_key = ctx.accounts.channel.key();

    let (payer_key, expiry, deposit, status, current_nonce) = {
        let channel = &ctx.accounts.channel;
        (
            channel.payer,
            channel.expiry,
            channel.deposit,
            channel.status,
            channel.nonce,
        )
    };

    require!(
        status == ChannelStatus::Open
            || status == ChannelStatus::CloseInitiated
            || status == ChannelStatus::Disputed,
        OtomatError::InvalidChannelStatus
    );
    require!(
        counter_nonce > current_nonce,
        OtomatError::NonceNotIncreasing
    );
    require!(
        counter_cumulative <= deposit,
        OtomatError::CumulativeExceedsDeposit
    );

    let message = build_check_message(&channel_key, counter_cumulative, counter_nonce, expiry);
    verify_ed25519_check(
        &ctx.accounts.instructions.to_account_info(),
        &payer_key.to_bytes(),
        &message,
        &counter_signature,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let channel = &mut ctx.accounts.channel;
    channel.cumulative_paid = counter_cumulative;
    channel.nonce = counter_nonce;
    channel.status = if status == ChannelStatus::Open {
        ChannelStatus::CloseInitiated
    } else {
        ChannelStatus::Disputed
    };
    channel.dispute_window_end = now
        .checked_add(DISPUTE_WINDOW_SECONDS)
        .ok_or(OtomatError::InvalidExpiry)?;

    emit!(ChannelDisputed {
        channel: channel_key,
        counter_cumulative,
        counter_nonce,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// resolve_dispute (finalise after the challenge window)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub resolver: Signer<'info>,

    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel.payer.as_ref(), channel.payee.as_ref(), channel.mint.as_ref()],
        bump = channel.bump,
        has_one = payer,
        has_one = payee,
        has_one = mint,
        close = payer,
    )]
    pub channel: Account<'info, Channel>,

    /// CHECK: payer wallet; validated via `has_one = payer`.
    #[account(mut)]
    pub payer: UncheckedAccount<'info>,

    /// CHECK: payee wallet; validated via `has_one = payee`.
    pub payee: UncheckedAccount<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: escrow authority PDA; derived and checked by seeds.
    #[account(
        seeds = [ESCROW_AUTH_SEED, channel.key().as_ref()],
        bump = channel.escrow_bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_authority,
        associated_token::token_program = token_program,
    )]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payee,
        token::token_program = token_program,
    )]
    pub payee_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_resolve_dispute(ctx: Context<ResolveDispute>) -> Result<()> {
    let channel_key = ctx.accounts.channel.key();

    let (deposit, cumulative, nonce, escrow_bump, status, window_end) = {
        let channel = &ctx.accounts.channel;
        (
            channel.deposit,
            channel.cumulative_paid,
            channel.nonce,
            channel.escrow_bump,
            channel.status,
            channel.dispute_window_end,
        )
    };

    require!(
        status == ChannelStatus::CloseInitiated || status == ChannelStatus::Disputed,
        OtomatError::InvalidChannelStatus
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now >= window_end, OtomatError::DisputeWindowActive);

    let refund = deposit
        .checked_sub(cumulative)
        .ok_or(OtomatError::CumulativeExceedsDeposit)?;
    let decimals = ctx.accounts.mint.decimals;

    {
        let channel = &mut ctx.accounts.channel;
        channel.status = ChannelStatus::Closed;
    }

    settle_and_close(
        &ctx.accounts.token_program,
        &ctx.accounts.mint,
        &ctx.accounts.escrow_ata,
        &ctx.accounts.escrow_authority,
        &ctx.accounts.payee_ata,
        &ctx.accounts.payer_ata,
        &ctx.accounts.payer,
        &channel_key,
        escrow_bump,
        cumulative,
        refund,
        decimals,
    )?;

    emit!(ChannelClosed {
        channel: channel_key,
        cumulative_paid: cumulative,
        refund,
        nonce,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// timeout_reclaim (payer recovers escrow after expiry with no close)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct TimeoutReclaim<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel.payer.as_ref(), channel.payee.as_ref(), channel.mint.as_ref()],
        bump = channel.bump,
        has_one = payer,
        has_one = payee,
        has_one = mint,
        close = payer,
    )]
    pub channel: Account<'info, Channel>,

    /// CHECK: payee wallet; validated via `has_one = payee`, used as a PDA seed.
    pub payee: UncheckedAccount<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: escrow authority PDA; derived and checked by seeds.
    #[account(
        seeds = [ESCROW_AUTH_SEED, channel.key().as_ref()],
        bump = channel.escrow_bump,
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow_authority,
        associated_token::token_program = token_program,
    )]
    pub escrow_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_timeout_reclaim(ctx: Context<TimeoutReclaim>) -> Result<()> {
    let channel_key = ctx.accounts.channel.key();

    let (deposit, cumulative, nonce, expiry, escrow_bump, status) = {
        let channel = &ctx.accounts.channel;
        (
            channel.deposit,
            channel.cumulative_paid,
            channel.nonce,
            channel.expiry,
            channel.escrow_bump,
            channel.status,
        )
    };

    require!(
        status == ChannelStatus::Open,
        OtomatError::InvalidChannelStatus
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now >= expiry, OtomatError::ChannelNotExpired);

    let refund = deposit
        .checked_sub(cumulative)
        .ok_or(OtomatError::CumulativeExceedsDeposit)?;
    let decimals = ctx.accounts.mint.decimals;

    {
        let channel = &mut ctx.accounts.channel;
        channel.status = ChannelStatus::Closed;
    }

    settle_refund_only(
        &ctx.accounts.token_program,
        &ctx.accounts.mint,
        &ctx.accounts.escrow_ata,
        &ctx.accounts.escrow_authority,
        &ctx.accounts.payer_ata,
        &ctx.accounts.payer,
        &channel_key,
        escrow_bump,
        refund,
        decimals,
    )?;

    emit!(ChannelClosed {
        channel: channel_key,
        cumulative_paid: cumulative,
        refund,
        nonce,
    });
    Ok(())
}
