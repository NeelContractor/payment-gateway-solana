"use client"
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export const MerchantDashboard: React.FC = () => {
  const { connected } = useWallet();
  const [merchantId, setMerchantId] = useState('');
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    totalFees: 0,
    paymentCount: 0,
  });

  const registerMerchant = async () => {
    // Implementation for merchant registration
  };

  const fetchPayments = async () => {
    // Implementation to fetch merchant payments
  };

  return (
    <div className="merchant-dashboard">
      <h2>Merchant Dashboard</h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Processed</h3>
          <p>{stats.totalProcessed} SOL</p>
        </div>
        <div className="stat-card">
          <h3>Total Payments</h3>
          <p>{stats.paymentCount}</p>
        </div>
        <div className="stat-card">
          <h3>Fees Paid</h3>
          <p>{stats.totalFees} SOL</p>
        </div>
      </div>

      <div className="merchant-actions">
        <input
          type="text"
          placeholder="Merchant ID"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
        />
        <button onClick={registerMerchant}>Register Merchant</button>
      </div>

      <div className="payments-list">
        <h3>Recent Payments</h3>
        {/* Payment list implementation */}
      </div>
    </div>
  );
};