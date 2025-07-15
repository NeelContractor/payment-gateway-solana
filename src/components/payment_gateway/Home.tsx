
import { PublicKey } from '@solana/web3.js';
import { PaymentGateway } from './PaymentGateway';

export default function CheckoutPage() {
    const usdcMintAdd = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    return (
        <PaymentGateway
            merchantId="my-store"
            amount={100}
            currency={usdcMintAdd}
            onSuccess={(paymentId) => {
                console.log('Payment successful:', paymentId);
            }}
            onError={(error) => {
                console.error('Payment failed:', error);
            }}
        />
    );
}