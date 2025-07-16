import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { PaymentGateway } from '../target/types/payment_gateway'

describe('PaymentGateway', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  
  const program = anchor.workspace.PaymentGateway as Program<PaymentGateway>

  // Create separate keypairs for merchant and platform
  const payer = Keypair.generate()
  const merchantKeypair = Keypair.generate()
  const platformKeypair = Keypair.generate()

  // Use unique identifiers for each test run to avoid PDA conflicts
  const merchantId = `MERCHANT_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const feeRate = 100 // 1% fee (100 basis points)

  let merchantPda: PublicKey

  const paymentId = `PAYMENT_${Date.now()}_${Math.random().toString(36).substring(7)}`
  let paymentIntentPda: PublicKey

  beforeAll(async () => {
    // Airdrop SOL to all keypairs
    await provider.connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL)
    await provider.connection.requestAirdrop(merchantKeypair.publicKey, 2 * LAMPORTS_PER_SOL)
    await provider.connection.requestAirdrop(platformKeypair.publicKey, 2 * LAMPORTS_PER_SOL)
    
    // Wait for airdrop confirmations
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Confirm airdrops completed
    let retries = 0
    while (retries < 10) {
      try {
        const payerBalance = await provider.connection.getBalance(payer.publicKey)
        const merchantBalance = await provider.connection.getBalance(merchantKeypair.publicKey)
        const platformBalance = await provider.connection.getBalance(platformKeypair.publicKey)
        
        if (payerBalance >= 10 * LAMPORTS_PER_SOL && 
            merchantBalance >= 2 * LAMPORTS_PER_SOL && 
            platformBalance >= 2 * LAMPORTS_PER_SOL) {
          break
        }
      } catch (error) {
        console.log(`Waiting for airdrop confirmation, retry ${retries + 1}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      retries++
    }
  })

  it('initializeMerchant', async () => {
    [merchantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("merchant"), Buffer.from(merchantId)],
      program.programId
    )

    // Check if account already exists and skip if it does
    try {
      const existingAccount = await program.account.merchant.fetch(merchantPda)
      if (existingAccount) {
        console.log('Merchant account already exists, skipping initialization')
        return
      }
    } catch (error) {
      // Account doesn't exist, proceed with initialization
    }

    try {
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
    } catch (error) {
      console.error('Initialize merchant error:', error)
      throw error
    }
  })

  it('Create Payment Intent', async () => {
    [paymentIntentPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment"), Buffer.from(paymentId)],
      program.programId
    )
    
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL) // 1 SOL in lamports
    const metadata = "Test payment for order #123"

    // Check if payment intent already exists
    try {
      const existingPaymentIntent = await program.account.paymentIntent.fetch(paymentIntentPda)
      if (existingPaymentIntent) {
        console.log('Payment intent already exists, skipping creation')
        return
      }
    } catch (error) {
      // Account doesn't exist, proceed with creation
    }

    try {
      await program.methods
        .createPaymentIntent(paymentId, amount, metadata)
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
      expect(paymentIntentAcc.status).toEqual({ created: {} }) // Enum variant
      expect(paymentIntentAcc.metadata).toEqual(metadata)
      expect(paymentIntentAcc.createdAt.toNumber()).toBeGreaterThan(0)
      expect(paymentIntentAcc.processedAt).toBeNull()
      expect(paymentIntentAcc.payer).toBeNull()
    } catch (error) {
      console.error('Create payment intent error:', error)
      throw error
    }
  })

  it("Process Payment", async () => {
    // Ensure payment intent exists and is in correct state
    let paymentIntentAcc
    try {
      paymentIntentAcc = await program.account.paymentIntent.fetch(paymentIntentPda)
      if (!paymentIntentAcc) {
        throw new Error('Payment intent not found')
      }
    } catch (error) {
      console.error('Payment intent fetch error:', error)
      throw error
    }

    // Get initial balances
    const initialPayerBalance = await provider.connection.getBalance(payer.publicKey)
    console.log(initialPayerBalance / LAMPORTS_PER_SOL)
    const initialMerchantBalance = await provider.connection.getBalance(merchantKeypair.publicKey)
    const initialPlatformBalance = await provider.connection.getBalance(platformKeypair.publicKey)

    try {
      const tx = await program.methods
        .processPayment(paymentId)
        .accountsPartial({
          payer: payer.publicKey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda,
          merchantAccount: merchantKeypair.publicKey,
          platformAccount: platformKeypair.publicKey,
          systemProgram: SystemProgram.programId
        })
        .signers([payer])
        .rpc({ skipPreflight: true })

        console.log(tx);

      // Check updated payment intent
      const updatedPaymentIntent = await program.account.paymentIntent.fetch(paymentIntentPda)
      expect(updatedPaymentIntent.status).toEqual({ completed: {} })
      expect(updatedPaymentIntent.processedAt).not.toBeNull()
      expect(updatedPaymentIntent.payer).toEqual(payer.publicKey)

      // Check updated merchant
      const updatedMerchant = await program.account.merchant.fetch(merchantPda)
      expect(updatedMerchant.totalProcessed.toNumber()).toEqual(1 * LAMPORTS_PER_SOL)

      // Verify balance changes
      const finalPayerBalance = await provider.connection.getBalance(payer.publicKey)
      console.log(finalPayerBalance / LAMPORTS_PER_SOL)
      const finalMerchantBalance = await provider.connection.getBalance(merchantKeypair.publicKey)
      const finalPlatformBalance = await provider.connection.getBalance(platformKeypair.publicKey)

      const paymentAmount = 1 * LAMPORTS_PER_SOL
      const feeAmount = Math.floor(paymentAmount * (feeRate / 10000)) // 1% fee
      const merchantAmount = paymentAmount - feeAmount

      // Check that payer lost the payment amount (plus some for transaction fees)
      // expect(finalPayerBalance).toBeLessThan(initialPayerBalance - paymentAmount)
      
      // Check that merchant received the correct amount
      expect(finalMerchantBalance).toEqual(initialMerchantBalance + merchantAmount)
      
      // Check that platform received the fee
      expect(finalPlatformBalance).toEqual(initialPlatformBalance + feeAmount)
    } catch (error) {
      console.error('Process payment error:', error)
      throw error
    }
  })

  it("Should fail to process payment twice", async () => {
    try {
      await program.methods
        .processPayment(paymentId)
        .accountsPartial({
          payer: payer.publicKey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda,
          merchantAccount: merchantKeypair.publicKey,
          platformAccount: platformKeypair.publicKey,
          systemProgram: SystemProgram.programId
        })
        .signers([payer])
        .rpc()
      
      // Should not reach here
      expect(true).toBe(false)
    } catch (error: any) {
      expect(error.error.errorCode.code).toContain("PaymentAlreadyProcessed")
    }
  })
})