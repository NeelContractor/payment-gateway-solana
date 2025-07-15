#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, transfer};

declare_id!("EJqXgoUzsNQKAYev9t2p68iUozaE9Kp9MptJckWe6NHw");

#[program]
pub mod payment_gateway {
    use super::*;

    pub fn initialize_merchant(ctx: Context<InitializeMerchant>, merchant_id: String, fee_rate: u64) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        merchant.merchant_id = merchant_id;
        merchant.authority = ctx.accounts.authority.key();
        merchant.fee_rate = fee_rate;
        merchant.total_processed = 0;
        merchant.bump = ctx.bumps.merchant;
        Ok(())
    }

    pub fn create_payment_intent(ctx: Context<CreatePaymentIntent>, payment_id: String, amount: u64, currency_mint: Pubkey, metadata: String) -> Result<()> {
        let payment_intent = &mut ctx.accounts.payment_intent;
        payment_intent.payment_id = payment_id;
        payment_intent.merchant = ctx.accounts.merchant.key();
        payment_intent.amount = amount;
        payment_intent.current_mint = currency_mint;
        payment_intent.status = PaymentStatus::Created;
        payment_intent.metadata = metadata;
        payment_intent.created_at = Clock::get()?.unix_timestamp;
        payment_intent.bump = ctx.bumps.payment_intent;
        Ok(())
    }

    pub fn process_payment(ctx: Context<ProcessPayment>, _payment_id: String) -> Result<()> {
        let payment_intent = &mut ctx.accounts.payment_intent;
        let merchant = &mut ctx.accounts.merchant;

        require!(payment_intent.status == PaymentStatus::Created, PaymentError::PaymentAlreadyProcessed);

        //calculate fee
        let fee_amount = payment_intent.amount
            .checked_mul(merchant.fee_rate)
            .unwrap()
            .checked_div(10000)
            .unwrap();

        let merchant_amount = payment_intent.amount
            .checked_sub(fee_amount).unwrap();

        let cpi_program = ctx.accounts.token_program.to_account_info();

        // transfer fee to platform
        if fee_amount > 0 {
            let transfer_fee = Transfer {
                from: ctx.accounts.payer_token_account.to_account_info(),
                to: ctx.accounts.platform_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info()
            };
            let cpi_ctx = CpiContext::new(cpi_program.clone() ,transfer_fee);
            transfer(cpi_ctx, fee_amount)?;
        }

        //trasnfer to merchant
        let transfer_to_merchant = Transfer {
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.merchant_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_program, transfer_to_merchant);
        transfer(cpi_ctx, merchant_amount)?;

        //update paymetn intent
        payment_intent.status = PaymentStatus::Completed;
        payment_intent.processed_at = Some(Clock::get()?.unix_timestamp);
        payment_intent.payer = Some(ctx.accounts.payer.key());

        //update merchant stats
        merchant.total_processed = merchant.total_processed.checked_add(payment_intent.amount).unwrap();
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(merchant_id: String)]
pub struct InitializeMerchant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Merchant::INIT_SPACE,
        seeds = [b"merchant", merchant_id.as_bytes()],
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: String)]
pub struct CreatePaymentIntent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + PaymentIntent::INIT_SPACE,
        seeds = [b"payment", payment_id.as_bytes()],
        bump
    )]
    pub payment_intent: Account<'info, PaymentIntent>,
    #[account(mut)]
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: String)]
pub struct ProcessPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"payment", payment_id.as_bytes()],
        bump = payment_intent.bump
    )]
    pub payment_intent: Account<'info, PaymentIntent>,
    #[account(mut)]
    pub merchant: Account<'info, Merchant>,
    #[account(mut)]
    pub payer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub merchant_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub platform_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Merchant {
    #[max_len(32)]
    pub merchant_id: String,
    pub authority: Pubkey,
    pub fee_rate: u64,
    pub total_processed: u64,
    pub bump: u8
}

#[account]
#[derive(InitSpace)]
pub struct PaymentIntent {
    #[max_len(32)]
    pub payment_id: String,
    pub merchant: Pubkey,
    pub amount: u64,
    pub current_mint: Pubkey,
    pub status: PaymentStatus,
    #[max_len(200)]
    pub metadata: String,
    pub created_at: i64,
    pub processed_at: Option<i64>,
    pub payer: Option<Pubkey>,
    pub bump: u8
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PaymentStatus {
    Created,
    Completed,
    Failed,
    Refunded
}

#[error_code]
pub enum PaymentError {
    #[msg("Payment has already been processed.")]
    PaymentAlreadyProcessed,
    #[msg("Invalid payment amount.")]
    InvalidAmount,
    #[msg("Insufficient funds.")]
    InsufficientFunds,
}