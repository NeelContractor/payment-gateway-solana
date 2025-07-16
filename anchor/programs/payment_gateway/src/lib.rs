#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::system_program;

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

    pub fn create_payment_intent(ctx: Context<CreatePaymentIntent>, payment_id: String, amount: u64, metadata: String) -> Result<()> {
        let payment_intent = &mut ctx.accounts.payment_intent;
        payment_intent.payment_id = payment_id;
        payment_intent.merchant = ctx.accounts.merchant.key();
        payment_intent.amount = amount;
        payment_intent.status = PaymentStatus::Created;
        payment_intent.metadata = metadata;
        payment_intent.created_at = Clock::get()?.unix_timestamp;
        payment_intent.processed_at = None;
        payment_intent.payer = None;
        payment_intent.bump = ctx.bumps.payment_intent;
        Ok(())
    }

    pub fn process_payment(ctx: Context<ProcessPayment>, _payment_id: String) -> Result<()> {
        let payment_intent = &mut ctx.accounts.payment_intent;
        let merchant = &mut ctx.accounts.merchant;

        require!(payment_intent.status == PaymentStatus::Created, PaymentError::PaymentAlreadyProcessed);

        // Calculate fee
        let fee_amount = payment_intent.amount
            .checked_mul(merchant.fee_rate)
            .ok_or(PaymentError::InvalidAmount)?
            .checked_div(10000)
            .ok_or(PaymentError::InvalidAmount)?;

        let merchant_amount = payment_intent.amount
            .checked_sub(fee_amount)
            .ok_or(PaymentError::InvalidAmount)?;

        // Transfer fee to platform
        if fee_amount > 0 {
            let transfer_fee_ix = system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.platform_account.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_fee_ix);
            system_program::transfer(cpi_ctx, fee_amount)?;
        }

        // Transfer to merchant
        let transfer_merchant_ix = system_program::Transfer {
            from: ctx.accounts.payer.to_account_info(),
            to: ctx.accounts.merchant_account.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_merchant_ix);
        system_program::transfer(cpi_ctx, merchant_amount)?;

        // Update payment intent
        payment_intent.status = PaymentStatus::Completed;
        payment_intent.processed_at = Some(Clock::get()?.unix_timestamp);
        payment_intent.payer = Some(ctx.accounts.payer.key());

        // Update merchant stats
        merchant.total_processed = merchant.total_processed
            .checked_add(payment_intent.amount)
            .ok_or(PaymentError::InvalidAmount)?;
        
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
    
    #[account(
        mut,
        constraint = merchant.authority == authority.key() @ PaymentError::InvalidAuthority
    )]
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
        bump = payment_intent.bump,
        constraint = payment_intent.status == PaymentStatus::Created @ PaymentError::PaymentAlreadyProcessed
    )]
    pub payment_intent: Account<'info, PaymentIntent>,
    
    #[account(
        mut,
        constraint = merchant.key() == payment_intent.merchant @ PaymentError::InvalidMerchant
    )]
    pub merchant: Account<'info, Merchant>,
    
    /// CHECK: This is the merchant's SOL receiving account
    #[account(mut)]
    pub merchant_account: UncheckedAccount<'info>,
    
    /// CHECK: This is the platform's SOL receiving account
    #[account(mut)]
    pub platform_account: UncheckedAccount<'info>,
    
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
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PaymentIntent {
    #[max_len(32)]
    pub payment_id: String,
    pub merchant: Pubkey,
    pub amount: u64,
    pub status: PaymentStatus,
    #[max_len(200)]
    pub metadata: String,
    pub created_at: i64,
    pub processed_at: Option<i64>,
    pub payer: Option<Pubkey>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum PaymentStatus {
    Created,
    Completed,
    Failed,
    Refunded,
}

#[error_code]
pub enum PaymentError {
    #[msg("Payment has already been processed.")]
    PaymentAlreadyProcessed,
    #[msg("Invalid payment amount.")]
    InvalidAmount,
    #[msg("Insufficient funds.")]
    InsufficientFunds,
    #[msg("Invalid authority.")]
    InvalidAuthority,
    #[msg("Invalid merchant.")]
    InvalidMerchant,
}