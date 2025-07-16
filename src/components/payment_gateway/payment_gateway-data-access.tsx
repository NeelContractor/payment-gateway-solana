'use client'

import { getPaymentGatewayProgram, getPaymentGatewayProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import { BN } from 'bn.js'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'

interface InitializeMerchantFnArgs {
  merchantPubkey: PublicKey;
}

interface CreatePaymentIntentFnArgs {
  merchantPubkey: PublicKey;
  merchantId: string, 
  amount: number, 
  // currencyMint: PublicKey, 
  metadata: string
}

interface ProcessPaymentFnArgs {
  merchantPubkey: PublicKey;
  merchantId: string, 
  // currencyMint: PublicKey, 
  payerPubkey: PublicKey, 
  paymentId: string
}

const feeRate = 100 // 1% fee (100 basis points)
const PLATFORM_PUBKEY = new PublicKey("GToMxgF4JcNn8dmNiHt2JrrvLaW6S1zSPoL2W8K2Wkmi");

// Helper function to generate short merchant ID
function generateMerchantId(length: number = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper function to generate short payment ID
function generatePaymentId(length: number = 16): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}`.substring(0, length);
}

export function usePaymentGatewayProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getPaymentGatewayProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getPaymentGatewayProgram(provider, programId), [provider, programId])

  const merchantAccounts = useQuery({
    queryKey: ['merchant', 'all', { cluster }],
    queryFn: () => program.account.merchant.all(),
  })

  const paymentIntentAccounts = useQuery({
    queryKey: ['paymentIntent', 'all', { cluster }],
    queryFn: () => program.account.paymentIntent.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const initializeMerchantFn = useMutation<string, Error, InitializeMerchantFnArgs>({
    mutationKey: ['merchant', 'initialize', { cluster }],
    mutationFn: async ({ merchantPubkey }) => {
      // Generate a short merchant ID (max 20 chars to stay within 32 byte limit)
      const merchantId = generateMerchantId(20);
      
      console.log('Generated merchant ID:', merchantId, 'Length:', merchantId.length);

      const [merchantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("merchant"), Buffer.from(merchantId)],
        program.programId
      );

      return await program.methods
        .initializeMerchant(merchantId, new BN(feeRate))
        .accountsPartial({ 
          authority: merchantPubkey,
          merchant: merchantPda,
          systemProgram: SystemProgram.programId
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await merchantAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to initialize merchant:', error);
      toast.error('Failed to initialize merchant')
    },
  })

  const createPaymentIntentFn = useMutation<string, Error, CreatePaymentIntentFnArgs>({
    mutationKey: ['payment-intent', 'create', { cluster }],
    mutationFn: async ({ merchantPubkey, merchantId, amount, metadata }) => {
      // Generate a short payment ID (max 20 chars to stay within 32 byte limit)
      const paymentId = generatePaymentId(20);
      
      // Ensure merchant ID is within limits (truncate if necessary)
      const safeMerchantId = merchantId.length > 20 ? merchantId.substring(0, 20) : merchantId;
      // const merchantAcc = await program.account.merchant.fetch(merchantPubkey);
      // const safeMerchantId = merchantAcc.merchantId;
      
      console.log('Payment ID:', paymentId, 'Length:', paymentId.length);
      console.log('Safe Merchant ID:', safeMerchantId, 'Length:', safeMerchantId.length);

      // Verify seed lengths
      const merchantSeedLength = Buffer.from("merchant").length + Buffer.from(safeMerchantId).length;
      const paymentSeedLength = Buffer.from("payment").length + Buffer.from(paymentId).length;
      
      console.log('Merchant seed total length:', merchantSeedLength);
      console.log('Payment seed total length:', paymentSeedLength);
      
      if (merchantSeedLength > 32) {
        throw new Error(`Merchant seed too long: ${merchantSeedLength} bytes`);
      }
      
      if (paymentSeedLength > 32) {
        throw new Error(`Payment seed too long: ${paymentSeedLength} bytes`);
      }

      const [merchantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("merchant"), Buffer.from(safeMerchantId)],
        program.programId
      );
      console.log("merchantPda :", merchantPda);
      
      const [paymentIntentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("payment"), Buffer.from(paymentId)],
        program.programId
      );

      return await program.methods
        .createPaymentIntent(paymentId, new BN(amount), metadata)
        .accountsPartial({ 
          authority: merchantPubkey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda, // merchantPda
          systemProgram: SystemProgram.programId
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await paymentIntentAccounts.refetch()
      await merchantAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to create payment intent:', error);
      toast.error('Failed to Create Payment Intent');
    },
  })

  const processPaymentFn = useMutation<string, Error, ProcessPaymentFnArgs>({
    mutationKey: ['payment', 'process', { cluster }],
    mutationFn: async ({ merchantPubkey, merchantId, payerPubkey, paymentId }) => {
      // Ensure merchant ID is within limits (should match what was used in creation)
      const safeMerchantId = merchantId.length > 20 ? merchantId.substring(0, 20) : merchantId;

      const [merchantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("merchant"), Buffer.from(safeMerchantId)],
        program.programId
      );
      
      const [paymentIntentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("payment"), Buffer.from(paymentId)],
        program.programId
      );
      
      // const payerTokenAccount = getAssociatedTokenAddressSync(
      //   currencyMint,
      //   payerPubkey
      // )
      // console.log("payerTokenAccount:", payerTokenAccount.toBase58());
  
      // const merchantTokenAccount = getAssociatedTokenAddressSync(
      //   currencyMint,
      //   merchantPubkey
      // )
  
      // const platformTokenAccount = getAssociatedTokenAddressSync(
      //   currencyMint,
      //   PLATFORM_PUBKEY
      // )

      return await program.methods
        .processPayment(paymentId)
        .accountsPartial({ 
          payer: payerPubkey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda,
          // payerTokenAccount: payerTokenAccount,
          // merchantTokenAccount: merchantTokenAccount,
          // platformTokenAccount: platformTokenAccount,
          // tokenProgram: TOKEN_PROGRAM_ID,
          merchantAccount: merchantPubkey,
          platformAccount: PLATFORM_PUBKEY,
          systemProgram: SystemProgram.programId
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await paymentIntentAccounts.refetch()
      await merchantAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to process payment:', error);
      toast.error('Failed to Process Payment');
    },
  })

  const getMerchantByAuthority = (authority: PublicKey) => {
    return merchantAccounts.data?.find(
      (merchant) => merchant.account.authority.toBase58() === authority.toBase58()
    );
  };

  return {
    program,
    programId,
    merchantAccounts,
    paymentIntentAccounts,
    getProgramAccount,
    initializeMerchantFn,
    createPaymentIntentFn,
    processPaymentFn,
    getMerchantByAuthority
  }
}

export function usePaymentGatewayProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program } = usePaymentGatewayProgram()

  return {}
}