#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("EJqXgoUzsNQKAYev9t2p68iUozaE9Kp9MptJckWe6NHw");

#[program]
pub mod payment_gateway {
    use anchor_spl::token::{transfer, Transfer};

    use super::*;

    pub fn initialize_session(ctx: Context<InitializeSession>, amount: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.merchant = ctx.accounts.merchant.key();
        session.payer = Pubkey::default();
        session.amount = amount;
        session.token_mint = ctx.accounts.token_mint.key();
        session.paid = false;
        session.bump = ctx.bumps.session;
        Ok(())
    }

    pub fn pay_with_token(ctx: Context<PayWithToken>) -> Result<()> {
        let session = &mut ctx.accounts.session;

        require!(!session.paid, PaymentError::AlreadyPaid);
        require!(ctx.accounts.token_mint.key() == session.token_mint, PaymentError::InvalidToken);

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.merchant_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info()
        };
        let cpi_ctx = CpiContext::new(
            cpi_program, 
            cpi_accounts
        );

        transfer(cpi_ctx, session.amount)?;

        session.paid = true;
        session.payer = ctx.accounts.payer.key();
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct InitializeSession<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,

    #[account(
        init,
        payer = merchant,
        space = 8 + PaymnetSession::INIT_SPACE,
        seeds = [b"session", merchant.key().as_ref(), token_mint.key().as_ref(), &amount.to_le_bytes().as_ref()],
        bump
    )]
    pub session: Account<'info, PaymnetSession>,
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayWithToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub session: Account<'info, PaymnetSession>,
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = payer,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = session.merchant,
    )]
    pub merchant_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct PaymnetSession {
    pub merchant: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub paid: bool,
    pub bump: u8
}

#[error_code]
pub enum PaymentError {
    #[msg("Payment already completed.")]
    AlreadyPaid,
    #[msg("Token Mint does not match.")]
    InvalidToken,
}