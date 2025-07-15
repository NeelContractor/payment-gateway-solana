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
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'

interface InitializeMerchantFnArgs {
  merchantPubkey: PublicKey;
}

interface CreatePaymentIntentFnArgs {
  merchantPubkey: PublicKey;
  merchantId: string, 
  amount: number, 
  currencyMint: PublicKey, 
  metadata: string
}

interface ProcessPaymentFnArgs {
  merchantPubkey: PublicKey;
  merchantId: string, 
  currencyMint: PublicKey, 
  payerPubkey: PublicKey, 
  paymentId: string
}

const feeRate = 100 // 1% fee (100 basis points)
const PLATFORM_PUBKEY = new PublicKey("GToMxgF4JcNn8dmNiHt2JrrvLaW6S1zSPoL2W8K2Wkmi");

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
    mutationKey: ['counter', 'initialize', { cluster }],
    mutationFn: async ({ merchantPubkey }) => {
      const merchantId = Math.random().toString();

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
    onError: () => {
      toast.error('Failed to initialize merchant')
    },
  })

  const createPaymentIntentFn = useMutation<string, Error, CreatePaymentIntentFnArgs>({
    mutationKey: ['counter', 'initialize', { cluster }],
    mutationFn: async ({ merchantPubkey, merchantId, amount, currencyMint, metadata }) => {
      const paymentId = Math.random().toString();

      const [merchantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("merchant"), Buffer.from(merchantId)],
        program.programId
      );
      const [paymentIntentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("payment"), Buffer.from(paymentId)],
        program.programId
      );

      return await program.methods
        .createPaymentIntent(paymentId, new BN(amount), currencyMint, metadata)
        .accountsPartial({ 
          authority: merchantPubkey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda,
          systemProgram: SystemProgram.programId
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await paymentIntentAccounts.refetch()
      await merchantAccounts.refetch()
    },
    onError: () => {
      toast.error('Failed to Create Payment Intent');
    },
  })
  const processPaymentFn = useMutation<string, Error, ProcessPaymentFnArgs>({
    mutationKey: ['PaymentIntent', 'create', { cluster }],
    mutationFn: async ({ merchantPubkey, merchantId, currencyMint, payerPubkey, paymentId }) => {

      const [merchantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("merchant"), Buffer.from(merchantId)],
        program.programId
      );
      const [paymentIntentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("payment"), Buffer.from(paymentId)],
        program.programId
      );
      const payerTokenAccount = getAssociatedTokenAddressSync(
        currencyMint,
        payerPubkey
      )
  
      const merchantTokenAccount = getAssociatedTokenAddressSync(
        currencyMint,
        merchantPubkey
      )
  
      const platformTokenAccount = getAssociatedTokenAddressSync(
        currencyMint,
        PLATFORM_PUBKEY
      )

      return await program.methods
        .processPayment(paymentId)
        .accountsPartial({ 
          payer: payerPubkey,
          paymentIntent: paymentIntentPda,
          merchant: merchantPda,
          payerTokenAccount: payerTokenAccount,
          merchantTokenAccount: merchantTokenAccount,
          platformTokenAccount: platformTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await paymentIntentAccounts.refetch()
      await merchantAccounts.refetch()
    },
    onError: () => {
      toast.error('Failed to Process Payment');
    },
  })

  return {
    program,
    programId,
    merchantAccounts,
    paymentIntentAccounts,
    getProgramAccount,
    initializeMerchantFn,
    createPaymentIntentFn,
    processPaymentFn
  }
}

export function usePaymentGatewayProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program } = usePaymentGatewayProgram()

  return {}
}
