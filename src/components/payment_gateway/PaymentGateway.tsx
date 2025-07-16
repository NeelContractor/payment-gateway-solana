'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { AlertCircle, CheckCircle, Wallet, QrCode, CreditCard, Loader2 } from 'lucide-react';
import { WalletButton } from '../solana/solana-provider';

// Mock QR code generation (in real app, use 'qrcode' package)
const generateQRCode = async (data: any) => {
  // Simple placeholder - in real app, use QRCode.toDataURL(data)
  return `data:image/svg+xml;base64,${btoa(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="white"/>
      <text x="100" y="100" text-anchor="middle" font-size="12" fill="black">QR Code</text>
      <text x="100" y="120" text-anchor="middle" font-size="8" fill="gray">${data}</text>
    </svg>
  `)}`;
};

// Mock payment gateway hook (replace with your actual implementation)
const usePaymentGatewayProgram = () => {
  const [loading, setLoading] = useState(false);
  
  const mockMerchant = {
    merchantId: 'merchant_123',
    feeRate: 100,
    totalPayments: 5,
    authority: new PublicKey('GToMxgF4JcNn8dmNiHt2JrrvLaW6S1zSPoL2W8K2Wkmi')
  };

  const createPaymentIntentFn = {
    mutateAsync: async ({ merchantPubkey, merchantId, amount, currencyMint, metadata }: any) => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLoading(false);
      return {
        signature: 'mock_signature_123',
        paymentId: `payment_${Date.now()}`
      };
    }
  };

  const processPaymentFn = {
    mutateAsync: async ({ merchantPubkey, merchantId, currencyMint, payerPubkey, paymentId }: any) => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoading(false);
      return {
        signature: 'mock_payment_signature_456'
      };
    }
  };

  const merchantAccounts = {
    data: [{ account: mockMerchant, publicKey: new PublicKey('GToMxgF4JcNn8dmNiHt2JrrvLaW6S1zSPoL2W8K2Wkmi') }],
    refetch: () => Promise.resolve()
  };

  const paymentIntentAccounts = {
    data: [],
    refetch: () => Promise.resolve()
  };

  const program = {
    account: {
      merchant: {
        fetch: async (pubkey: any) => mockMerchant
      }
    }
  };

  return {
    createPaymentIntentFn,
    processPaymentFn,
    merchantAccounts,
    paymentIntentAccounts,
    program,
    loading
  };
};

interface PaymentGatewayProps {
  merchantId: string;
  amount: number;
  currency: string;
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
  const { 
    createPaymentIntentFn, 
    processPaymentFn, 
    merchantAccounts, 
    program 
  } = usePaymentGatewayProgram();
  
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'create' | 'process' | 'completed'>('create');
  const [merchantData, setMerchantData] = useState<any>(null);

  // Find merchant from accounts
  useEffect(() => {
    if (merchantAccounts.data && merchantId) {
      const merchant = merchantAccounts.data.find(
        (acc: any) => acc.account.merchantId === merchantId
      );
      setMerchantData(merchant);
    }
  }, [merchantAccounts.data, merchantId]);

  const handleCreatePayment = async () => {
    if (!publicKey || !merchantData) return;
    
    try {
      setLoading(true);
      const metadata = JSON.stringify({
        description: `Payment for ${amount} tokens`,
        timestamp: Date.now()
      });

      const result = await createPaymentIntentFn.mutateAsync({
        merchantPubkey: merchantData.publicKey,
        merchantId,
        amount,
        currencyMint: new PublicKey(currency),
        metadata
      });

      setPaymentId(result.paymentId);
      setPaymentStep('process');

      // Generate QR code for mobile payments
      const paymentUrl = `${window.location.origin}/pay/${merchantId}/${result.paymentId}`;
      const qrCodeDataUrl = await generateQRCode(paymentUrl);
      setQrCode(qrCodeDataUrl);

    } catch (error) {
      console.error('Payment creation failed:', error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!paymentId || !publicKey || !merchantData) return;
    
    try {
      setLoading(true);
      
      await processPaymentFn.mutateAsync({
        merchantPubkey: merchantData.publicKey,
        merchantId,
        currencyMint: new PublicKey(currency),
        payerPubkey: publicKey,
        paymentId
      });

      setPaymentStep('completed');
      onSuccess?.(paymentId);

    } catch (error) {
      console.error('Payment processing failed:', error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border">
        <div className="text-center">
          <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2">Connect Wallet to Pay</h2>
          <p className="text-gray-600 mb-4">
            Please connect your wallet to proceed with the payment
          </p>
          <WalletButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border">
      {/* Payment Details Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Payment Details</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Amount:</span>
            <span className="font-medium">{amount} {new PublicKey(currency).toBase58().slice(0, 8)}...</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Merchant:</span>
            <span className="font-medium">{merchantId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Fee:</span>
            <span className="font-medium">{merchantData?.account.feeRate || 100} bps</span>
          </div>
        </div>
      </div>

      {/* Payment Steps */}
      <div className="space-y-4">
        {paymentStep === 'create' && (
          <div className="space-y-4">
            <button
              onClick={handleCreatePayment}
              disabled={loading || !merchantData}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Create Payment Intent
                </>
              )}
            </button>
            
            {!merchantData && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  Merchant not found or not initialized
                </span>
              </div>
            )}
          </div>
        )}

        {paymentStep === 'process' && paymentId && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">Payment Intent Created</p>
                <p className="text-xs text-green-700">ID: {paymentId.slice(0, 16)}...</p>
              </div>
            </div>

            {qrCode && (
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <QrCode className="w-4 h-4" />
                  <span className="text-sm font-medium">Scan QR Code to Pay:</span>
                </div>
                <div className="flex justify-center">
                  <img 
                    src={qrCode} 
                    alt="Payment QR Code" 
                    className="border rounded-lg"
                    style={{ maxWidth: '200px' }}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  Or click the button below to process payment
                </p>
              </div>
            )}

            <button
              onClick={handleProcessPayment}
              disabled={loading}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Payment...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Process Payment
                </>
              )}
            </button>
          </div>
        )}

        {paymentStep === 'completed' && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Payment Successful!</p>
                <p className="text-sm text-green-700">
                  Payment ID: {paymentId?.slice(0, 16)}...
                </p>
              </div>
            </div>
            
            <button
              onClick={() => {
                setPaymentStep('create');
                setPaymentId(null);
                setQrCode(null);
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Make Another Payment
            </button>
          </div>
        )}
      </div>

      {/* Wallet Info */}
      <div className="mt-6 pt-4 border-t">
        <p className="text-xs text-gray-500 text-center">
          Connected: {publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}
        </p>
      </div>
    </div>
  );
};

export default PaymentGateway;