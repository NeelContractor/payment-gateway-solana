import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { PaymentGateway } from '../target/types/payment_gateway'
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'

describe('PaymentGateway', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const payer = provider.wallet as anchor.Wallet

  const program = anchor.workspace.PaymentGateway as Program<PaymentGateway>

  // Create separate keypairs for merchant and platform
  const merchantKeypair = Keypair.generate()
  const platformKeypair = Keypair.generate()

  const merchantId = "MERCHANT_ID"
  const feeRate = 100 // 1% fee (100 basis points)

  let merchantPda: PublicKey

  const paymentId = "PAYMENT_ID"
  let paymentIntentPda: PublicKey
  let currencyMint: PublicKey

  beforeAll(async () => {
    // Airdrop SOL to merchant and platform keypairs
    await provider.connection.requestAirdrop(merchantKeypair.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    await provider.connection.requestAirdrop(platformKeypair.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    
    // Wait for airdrop confirmations
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Create mint
    currencyMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      6
    )

    // Create token accounts and mint tokens
    const payerAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      currencyMint,
      payer.publicKey
    )).address

    const merchantAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      currencyMint,
      merchantKeypair.publicKey
    )).address

    const platformAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      currencyMint,
      platformKeypair.publicKey
    )).address

    // Mint tokens to payer
    await mintTo(
      provider.connection,
      payer.payer,
      currencyMint,
      payerAta,
      payer.payer,
      10000000 // 10 tokens (with 6 decimals)
    )
  })

  it('initializeMerchant', async () => {
    [merchantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), Buffer.from(merchantId)],
      program.programId
    )

    await program.methods
      .initializeMerchant(merchantId, new anchor.BN(feeRate))
      .accountsPartial({
        authority: merchantKeypair.publicKey,
        merchant: merchantPda,
        systemProgram: SystemProgram.programId
      })
      .signers([merchantKeypair])
      .rpc()

    const merchantAcc = await program.account.merchant.fetch(merchantPda)

    expect(merchantAcc.merchantId).toEqual(merchantId)
    expect(merchantAcc.authority).toEqual(merchantKeypair.publicKey)
    expect(merchantAcc.feeRate.toNumber()).toEqual(feeRate)
    expect(merchantAcc.totalProcessed.toNumber()).toEqual(0)
  })

  it('Create Payment Intent', async () => {
    [paymentIntentPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(paymentId)],
      program.programId
    )
    
    const amount = new anchor.BN(1000000) // 1 token
    const metadata = "Test payment for order #123"

    await program.methods
      .createPaymentIntent(paymentId, amount, currencyMint, metadata)
      .accountsPartial({
        authority: merchantKeypair.publicKey,
        paymentIntent: paymentIntentPda,
        merchant: merchantPda,
        systemProgram: SystemProgram.programId
      })
      .signers([merchantKeypair])
      .rpc()

    const paymentIntentAcc = await program.account.paymentIntent.fetch(paymentIntentPda)

    expect(paymentIntentAcc.paymentId).toEqual(paymentId)
    expect(paymentIntentAcc.merchant).toEqual(merchantPda)
    expect(paymentIntentAcc.amount.toNumber()).toEqual(amount.toNumber())
    expect(paymentIntentAcc.currentMint).toEqual(currencyMint)
    expect(paymentIntentAcc.status).toEqual({ created: {} }) // Enum variant
    expect(paymentIntentAcc.metadata).toEqual(metadata)
    expect(paymentIntentAcc.createdAt.toNumber()).toBeGreaterThan(0)
    expect(paymentIntentAcc.processedAt).toBeNull()
    expect(paymentIntentAcc.payer).toBeNull()
  })

  it("Process Payment", async () => {
    const payerTokenAccount = getAssociatedTokenAddressSync(
      currencyMint,
      payer.publicKey
    )

    const merchantTokenAccount = getAssociatedTokenAddressSync(
      currencyMint,
      merchantKeypair.publicKey
    )

    const platformTokenAccount = getAssociatedTokenAddressSync(
      currencyMint,
      platformKeypair.publicKey
    )

    await program.methods
      .processPayment(paymentId)
      .accountsPartial({
        payer: payer.publicKey,
        paymentIntent: paymentIntentPda,
        merchant: merchantPda,
        payerTokenAccount: payerTokenAccount,
        merchantTokenAccount: merchantTokenAccount,
        platformTokenAccount: platformTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .rpc()

    // Check updated payment intent
    const updatedPaymentIntent = await program.account.paymentIntent.fetch(paymentIntentPda)
    expect(updatedPaymentIntent.status).toEqual({ completed: {} })
    expect(updatedPaymentIntent.processedAt).not.toBeNull()
    expect(updatedPaymentIntent.payer).toEqual(payer.publicKey)

    // Check updated merchant
    const updatedMerchant = await program.account.merchant.fetch(merchantPda)
    expect(updatedMerchant.totalProcessed.toNumber()).toEqual(1000000)

    // Verify balance changes
    const paymentAmount = 1 // 1 token
    const feeAmount = paymentAmount * (feeRate / 10000) // 1% fee
    const merchantAmount = paymentAmount - feeAmount

  })

  it("Should fail to process payment twice", async () => {
    const payerTokenAccount = getAssociatedTokenAddressSync(
      currencyMint,
      payer.publicKey
    )

    const merchantTokenAccount = getAssociatedTokenAddressSync(
      currencyMint,
      merchantKeypair.publicKey
    )

    const platformTokenAccount = getAssociatedTokenAddressSync(
      currencyMint,
      platformKeypair.publicKey
    )

    try {
      await program.methods
        .processPayment(paymentId)
        .accountsPartial({
          payer: payer.publicKey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda,
          payerTokenAccount: payerTokenAccount,
          merchantTokenAccount: merchantTokenAccount,
          platformTokenAccount: platformTokenAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        })
        .rpc()
      
      // Should not reach here
      expect(true).toBe(false)
    } catch (error: any) {
      // console.log(error);
      expect(error.error.errorCode.code).toContain("PaymentAlreadyProcessed")
    }
  })
})