"use client";

import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { AlertCircle, CheckCircle, Clock, Copy, CreditCard, DollarSign, Loader2, Plus, Store, Wallet, XCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePaymentGatewayProgram } from "./payment_gateway-data-access";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { WalletButton } from "../solana/solana-provider";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import { toast } from "sonner";
import { ThemeSelect } from "../theme-select";

type StatusType = {
    "created" : {}
} | {
    "completed": {}
} | {
    "failed": {}
} | {
    "refunded": {}
};

const formatAmount = (amount: number, decimals = 6) => {
    return (amount / Math.pow(10, decimals)).toFixed(decimals);
}

const formatPubkey = (pubkey: PublicKey) => {
    const key = pubkey.toString();
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
const StatusBadge = ({ status }: { status: StatusType }) => {
    // Handle Anchor enum format: { created: {} } or { completed: {} }
    const getStatusName = (status: StatusType): keyof typeof statusConfig => {
        if (typeof status === 'object' && status !== null) {
            const key = Object.keys(status)[0];
            return key as keyof typeof statusConfig;
        }
        return status as keyof typeof statusConfig;
    };

    const statusConfig = {
        created: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
        completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
        failed: { color: 'bg-red-100 text-red-800', icon: XCircle },
        refunded: { color: 'bg-blue-100 text-blue-800', icon: AlertCircle },
    } as const;

    const statusName = getStatusName(status);
    const capitalizedStatus = statusName.charAt(0).toUpperCase() + statusName.slice(1);
    
    const config = statusConfig[statusName] || statusConfig.created;
    const Icon = config.icon;

    return (
        <Badge className={`${config.color} flex items-center gap-1`}>
            <Icon size={12} />
            {capitalizedStatus}
        </Badge>
    );
};

const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
}

export default function PaymentGatewayDashboard() {
    const { publicKey } = useWallet();
    const { merchantAccounts, paymentIntentAccounts, initializeMerchantFn, createPaymentIntentFn, processPaymentFn, getMerchantByAuthority, program } = usePaymentGatewayProgram();
    const [activeTab, setActiveTab] = useState("merchants");

    const [selectedMerchant, setSelectedMerchant] = useState(null);
    const [paymentForm, setPaymentForm] = useState({
        merchantId: "",
        amount: 0,
        // currencyMint: "So11111111111111111111111111111111111111112",
        metadata: ""
    });
    const [processForm, setProcessForm] = useState({
        merchantId: "",
        paymentId: "",
        // currencyMint: "So11111111111111111111111111111111111111112",
        merchantPubkey: ""
    });

    const handleInitializeMerchant = async () => {
        if (!publicKey) return;

        try {
            await initializeMerchantFn.mutateAsync({merchantPubkey: publicKey});
        } catch (error) {
            console.error("Failed to initialize merchant:", error);
        }
    }

    const handleCreatePaymentIntent = async (e: any) => {
        e.preventDefault();
        if (!publicKey) return;

        const existingMerchant = getMerchantByAuthority(publicKey);
  
        if (!existingMerchant) {
            toast.error('Merchant not found. Please initialize merchant first.');
            return;
        }

        try {
            await createPaymentIntentFn.mutateAsync({
                merchantPubkey: publicKey,
                merchantId: paymentForm.merchantId,
                amount: paymentForm.amount * LAMPORTS_PER_SOL,
                // currencyMint: new PublicKey(paymentForm.currencyMint),
                metadata: paymentForm.metadata
            });

            //reset form
            setPaymentForm({
                merchantId: '',
                amount: 0,
                // currencyMint: "So11111111111111111111111111111111111111112",
                metadata: ""
            });
        } catch (err) {
            console.log("Failed to create payment intent: ", err);
        }
    }

    const handleProcessPayment = async (e: any) => {
        e.preventDefault();
        if (!publicKey) return;

        try {
            await processPaymentFn.mutateAsync({
                merchantPubkey: new PublicKey(processForm.merchantPubkey),
                merchantId: processForm.merchantId,
                // currencyMint: new PublicKey(processForm.currencyMint),
                payerPubkey: publicKey,
                paymentId: processForm.paymentId
            });

            setProcessForm({
                merchantId: "",
                paymentId: "",
                // currencyMint: "So11111111111111111111111111111111111111112",
                merchantPubkey: ""
            })
        } catch (err) {
            console.error("Failed to Process payment:", err);
        }
    }

    if (!publicKey) {
        return (
            <div className="min-h-screen  flex items-center justify-center">
                <Card className="w-96">
                    <CardHeader className="text-center" >
                        <Wallet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <CardTitle>Connect Your Wallet</CardTitle>
                        <CardDescription>
                            Please connect your Solana wallet to use the payment gateway
                        </CardDescription>
                    </CardHeader>
                    <div className="flex justify-center">
                        <WalletButton />
                    </div>
                </Card>
            </div>
        )
    }

    return <div className="min-h-screen">
        <header className=" shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center py-4">
                    <div className="flex items-center gap-3">
                        <CreditCard className="h-8 w-8 text-blue-600" />
                        <h1 className="text-2xl font-bold ">Payment Gateway</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant={"outline"} className="flex items-center gap-1">
                            <Wallet size={14} />
                            {formatPubkey(publicKey)}
                        </Badge>
                        <Button
                            variant={"outline"}
                            size={"sm"}
                            onClick={() => copyToClipboard(publicKey.toString())}
                        >
                            <Copy size={14} />
                        </Button>
                        <WalletButton />
                        <ThemeSelect />
                    </div>
                </div>
            </div>
        </header>

        <nav className=" border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex space-x-8">
                    {["merchants", 'payments', "create"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${activeTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500  hover:text-gray-700"}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {activeTab === "merchants" && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold">Merchants</h2>
                        <Button
                            onClick={handleInitializeMerchant}
                            disabled={initializeMerchantFn.isPending}
                            className="flex items-center gap-2"
                        >
                            {initializeMerchantFn.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ): (
                                <Plus className="h-4 w-4" />
                            )}
                            Initialize Merchant
                        </Button>
                    </div>

                    {merchantAccounts.error ? (
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                Failed to load merchants: {merchantAccounts.error.message}
                            </AlertDescription>
                        </Alert>
                    ): (
                        <div className="grid gap-4">
                            {merchantAccounts.data?.length === 0 ? (
                                <Card>
                                    <CardContent className="text-center py-8">
                                        <Store className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                        <p className="text-gray-600">No merchant account to get started</p>
                                        <p className="text-sm text-gray-500 mt-1">Initialize a merchant account to get started</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                merchantAccounts.data?.map((merchant) => (
                                    <Card key={merchant.publicKey.toString()} className="cursor-pointer hover:shadow-md transition-shadow">
                                        <CardHeader>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Store className="h-5 w-5" />
                                                        {merchant.account.merchantId}
                                                    </CardTitle>
                                                    <CardDescription>
                                                        {formatPubkey(merchant.publicKey)}
                                                    </CardDescription>
                                                </div>
                                                <Button
                                                    variant={"ghost"}
                                                    size={"sm"}
                                                    onClick={() => copyToClipboard(merchant.publicKey.toString())}
                                                >
                                                    <Copy size={14} />
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <p className="font-medium ">Fee Rate</p>
                                                    <p className="text-gray-600">{merchant.account.feeRate.toNumber() / 100}%</p>
                                                </div>
                                                <div>
                                                    <p className="font-medium ">Total Processed</p>
                                                    <p className="text-gray-600">{merchant.account.totalProcessed.toNumber() / LAMPORTS_PER_SOL} SOL</p>
                                                </div>
                                                <div>
                                                    <p className="font-medium ">Authority</p>
                                                    <p className="text-gray-600">{formatPubkey(merchant.account.authority)}</p>
                                                </div>
                                                <div>
                                                    <p className="font-medium ">Bump</p>
                                                    <p className="text-gray-600">{merchant.account.bump}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'payments' && (
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Payment Intents</h2>
                    
                    {paymentIntentAccounts.isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : paymentIntentAccounts.error ? (
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                Failed to load payment intents: {paymentIntentAccounts.error.message}
                            </AlertDescription>
                            <AlertDescription>
                                {paymentIntentAccounts.data?.map((data) => (
                                    <div key={data.publicKey.toString()}>
                                        {JSON.stringify(data)}
                                    </div>
                                ))}
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="grid gap-4">
                            {paymentIntentAccounts.data?.length === 0 ? (
                            <Card>
                                <CardContent className="text-center py-8">
                                <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                <p className="text-gray-600">No payment intents found</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    Create a payment intent to get started
                                </p>
                                </CardContent>
                            </Card>
                            ) : (
                            paymentIntentAccounts.data?.map((payment) => (
                                <Card key={payment.publicKey.toString()}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                        <CreditCard className="h-5 w-5" />
                                        {payment.account.paymentId}
                                        </CardTitle>
                                        <CardDescription>
                                        {formatPubkey(payment.publicKey)}
                                        </CardDescription>
                                    </div>
                                    <StatusBadge status={payment.account.status} />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="font-medium ">Amount</p>
                                        <p className="dark:text-gray-400 flex items-center gap-1">
                                        <DollarSign size={14} />
                                        {payment.account.amount.toNumber() / LAMPORTS_PER_SOL} SOL
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-medium ">Merchant</p>
                                        <p className="dark:text-gray-400">{formatPubkey(payment.account.merchant)}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium ">Created</p>
                                        <p className="dark:text-gray-400">
                                        {new Date(payment.account.createdAt.toNumber() * 1000).toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-medium ">Processed</p>
                                        <p className="dark:text-gray-400">
                                        {payment.account.processedAt 
                                            ? new Date(payment.account.processedAt.toNumber() * 1000).toLocaleString()
                                            : 'Not processed'
                                        }
                                        </p>
                                    </div>
                                    </div>
                                    
                                    {payment.account.metadata && (
                                    <div className="mt-4">
                                        <p className="font-medium  text-sm">Metadata</p>
                                        <p className="text-sm dark:text-gray-400 p-2 rounded mt-1">
                                        {payment.account.metadata}
                                        </p>
                                    </div>
                                    )}
                                    
                                    {payment.account.payer && (
                                    <div className="mt-4">
                                        <p className="font-medium text-gray-700 text-sm">Payer</p>
                                        <p className="text-gray-600 text-sm">{formatPubkey(payment.account.payer)}</p>
                                    </div>
                                    )}
                                </CardContent>
                                </Card>
                            ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'create' && (
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Create Payment Intent</h2>
                    
                    <Card>
                        <CardHeader>
                            <CardTitle>New Payment Intent</CardTitle>
                            <CardDescription>Create a new payment intent for a merchant</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="merchantId" className="py-2">Merchant ID</Label>
                                    <Input
                                        id="merchantId"
                                        value={paymentForm.merchantId}
                                        onChange={(e) => setPaymentForm({...paymentForm, merchantId: e.target.value})}
                                        placeholder="Enter merchant ID"
                                    />
                                </div>
                                
                                <div>
                                    <Label htmlFor="amount" className="py-2">Amount (in lamports)</Label>
                                    <Input
                                        id="amount"
                                        type="number"
                                        value={paymentForm.amount}
                                        onChange={(e) => setPaymentForm({...paymentForm, amount: Number(e.target.value)})}
                                        placeholder="1"
                                    />
                                </div>
                                
                                {/* <div>
                                    <Label htmlFor="currencyMint" className="py-2">Currency Mint</Label>
                                    <Input
                                        id="currencyMint"
                                        value={paymentForm.currencyMint}
                                        onChange={(e) => setPaymentForm({...paymentForm, currencyMint: e.target.value})}
                                        placeholder="Token mint address"
                                    />
                                </div> */}
                                
                                <div>
                                    <Label htmlFor="metadata" className="py-2">Metadata</Label>
                                    <Textarea
                                        id="metadata"
                                        value={paymentForm.metadata}
                                        onChange={(e) => setPaymentForm({...paymentForm, metadata: e.target.value})}
                                        placeholder="Optional metadata"
                                        rows={3}
                                    />
                                </div>
                                
                                <Button 
                                    onClick={handleCreatePaymentIntent}
                                    disabled={createPaymentIntentFn.isPending}
                                    className="w-full"
                                >
                                    {createPaymentIntentFn.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    Create Payment Intent
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Separator />

                    {/* Process Payment Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Process Payment</CardTitle>
                            <CardDescription>Process an existing payment intent</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="processMerchantId" className="py-2">Merchant ID</Label>
                                    <Input
                                    id="processMerchantId"
                                    value={processForm.merchantId}
                                    onChange={(e) => setProcessForm({...processForm, merchantId: e.target.value})}
                                    placeholder="Enter merchant ID"
                                    />
                                </div>
                                
                                <div>
                                    <Label htmlFor="paymentId" className="py-2">Payment ID</Label>
                                    <Input
                                    id="paymentId"
                                    value={processForm.paymentId}
                                    onChange={(e) => setProcessForm({...processForm, paymentId: e.target.value})}
                                    placeholder="Enter payment ID"
                                    />
                                </div>
                                
                                {/* <div>
                                    <Label htmlFor="processCurrencyMint" className="py-2">Currency Mint</Label>
                                    <Input
                                    id="processCurrencyMint"
                                    value={processForm.currencyMint}
                                    onChange={(e) => setProcessForm({...processForm, currencyMint: e.target.value})}
                                    placeholder="Token mint address"
                                    />
                                </div> */}
                                
                                <div>
                                    <Label htmlFor="merchantPubkey" className="py-2">Merchant Public Key</Label>
                                    <Input
                                    id="merchantPubkey"
                                    value={processForm.merchantPubkey}
                                    onChange={(e) => setProcessForm({...processForm, merchantPubkey: e.target.value})}
                                    placeholder="Marchant PublicKey"
                                    />
                                </div>
                                
                                <Button 
                                    onClick={handleProcessPayment}
                                    disabled={processPaymentFn.isPending}
                                    className="w-full"
                                >
                                    {processPaymentFn.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    Process Payment
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </main>
    </div>
}