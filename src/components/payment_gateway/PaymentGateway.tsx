"use client";
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
// import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import QRCode from 'qrcode';
import { WalletButton } from '../solana/solana-provider';
import { usePaymentGatewayProgram } from './payment_gateway-data-access';
import { PublicKey } from '@solana/web3.js';

interface PaymentGatewayProps {
  merchantId: string;
  amount: number;
  currency: PublicKey;
  onSuccess?: (paymentId: string) => void;
  onError?: (error: Error) => void;
}

export const PaymentGateway: React.FC<PaymentGatewayProps> = ({
  merchantId,
  amount,
  currency,
  onSuccess,
  onError,
}) => {
  const { connected, publicKey } = useWallet();
  const { createPaymentIntentFn, processPaymentFn, paymentIntentAccounts, merchantAccounts, program } = usePaymentGatewayProgram();
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const handleCreatePayment = async ({ merchantPubkey, merchantId, metadata }: {merchantPubkey: PublicKey, merchantId: string, metadata: string, amount: number, currencyMint: PublicKey}) => {
    if (!publicKey) return;
    try {
        setLoading(true);
        const intent = await createPaymentIntentFn.mutateAsync({ merchantPubkey, merchantId, metadata, amount, currencyMint: currency });
    //   setPaymentId(intent.id);
        const merchant = await program.account.merchant.fetch(publicKey);
      
        // Generate QR code for mobile payments
        const paymentUrl = `${window.location.origin}/pay/${merchant.merchantId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl);
        setQrCode(qrCodeDataUrl);
      
    } catch (error) {
        onError?.(error as Error);
    } finally {
        setLoading(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!paymentId) return;
    
    try {
      setLoading(true);
      await processPaymentFn.mutateAsync({ merchantPubkey, merchantId, currencyMint, payerPubkey, paymentId });
      onSuccess?.(paymentId);
    } catch (error) {
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="payment-gateway">
        <h3>Connect Wallet to Pay</h3>
        <WalletButton />
      </div>
    );
  }

  return (
    <div className="payment-gateway">
      <div className="payment-details">
        <h3>Payment Details</h3>
        <p>Amount: {amount} {currency.toBase58()}</p>
        <p>Merchant: {merchantId}</p>
      </div>

      {!paymentId ? (
        <button 
          onClick={handleCreatePayment}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Creating Payment...' : 'Create Payment Intent'}
        </button>
      ) : (
        <div className="payment-processing">
          <h4>Payment Created</h4>
          <p>Payment ID: {paymentId}</p>
          
          {qrCode && (
            <div className="qr-code">
              <p>Scan QR Code to Pay:</p>
              <img src={qrCode} alt="Payment QR Code" />
            </div>
          )}
          
          <button 
            onClick={handleProcessPayment}
            disabled={loading}
            className="btn-success"
          >
            {loading ? 'Processing Payment...' : 'Process Payment'}
          </button>
        </div>
      )}
    </div>
  );
};