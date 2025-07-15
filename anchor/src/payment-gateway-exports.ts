// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import PaymentGatewayIDL from '../target/idl/payment_gateway.json'
import type { PaymentGateway } from '../target/types/payment_gateway'

// Re-export the generated IDL and type
export { PaymentGateway, PaymentGatewayIDL }

// The programId is imported from the program IDL.
export const PAYMENTGATEWAY_PROGRAM_ID = new PublicKey(PaymentGatewayIDL.address)

// This is a helper function to get the Counter Anchor program.
export function getPaymentGatewayProgram(provider: AnchorProvider, address?: PublicKey): Program<PaymentGateway> {
  return new Program({ ...PaymentGatewayIDL, address: address ? address.toBase58() : PaymentGatewayIDL.address } as PaymentGateway, provider)
}

// This is a helper function to get the program ID for the Counter program depending on the cluster.
export function getPaymentGatewayProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Counter program on devnet and testnet.
      return new PublicKey('EJqXgoUzsNQKAYev9t2p68iUozaE9Kp9MptJckWe6NHw')
    case 'mainnet-beta':
    default:
      return PAYMENTGATEWAY_PROGRAM_ID
  }
}
