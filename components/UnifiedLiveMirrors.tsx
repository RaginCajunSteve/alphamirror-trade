"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useCallback } from 'react';
import { executeBscClientMirror } from '@/lib/lowest-cost/bsc-client-mirror';
import { executeSolanaMirror } from '@/lib/lowest-cost/solana-client';

interface PendingMirror {
  id?: number;
  chain?: 'bsc' | 'solana';
  alpha_wallet?: string;
  alphaWallet?: string;
  token_in?: string;
  token_out?: string;
  amount_in?: string;
  status?: string;
}

export function UnifiedLiveMirrors({ userId, walletProvider }: { userId?: string; walletProvider?: any }) {
  const [pendings, setPendings] = useState<PendingMirror[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPendings = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/pending-mirrors?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setPendings(data.pending || []);
    } catch (e) {
      console.error('Failed to load live pending mirrors', e);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchPendings();
      const id = setInterval(fetchPendings, 15000);
      return () => clearInterval(id);
    }
  }, [userId, fetchPendings]);

  const handleExecute = async (p: PendingMirror) => {
    if (!userId) return;
    setLoading(true);
    try {
      const chain = (p.chain || '').toLowerCase();
      if (chain === 'bsc' || chain === 'bnb') {
        let prov: any = walletProvider;
        if (!prov && (window as any).ethereum) prov = (window as any).ethereum;
        if (!prov) throw new Error('Connect an EVM wallet (MetaMask) for BSC mirror');
        const ethersMod: any = await import('ethers');
        const provider = new ethersMod.BrowserProvider(prov);
        const tx = await executeBscClientMirror(p, provider);
        alert(`BSC mirror sent: ${tx}`);
      } else {
        const solWallet: any = walletProvider || (window as any).solana;
        if (!solWallet?.signTransaction) {
          alert('Connect Phantom (or Solana wallet) to mirror on Solana');
          setLoading(false);
          return;
        }
        const { Connection } = await import('@solana/web3.js');
        const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        const sig = await executeSolanaMirror(p, solWallet, {}, conn);
        alert(`Solana mirror sent: ${sig}`);
      }
      await fetchPendings();
    } catch (err: any) {
      console.error(err);
      alert(`Mirror failed: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const hasPendings = pendings.length > 0;

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-5 my-4 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">🚀 Instant Mirrors — Solana + BSC (Free, client-side)</h3>
        <p className="text-sm text-muted mt-1">
          Follow elite wallets on Solana (via Helius webhooks + Jupiter) or BSC (PancakeSwap). 
          When they trade, a pending mirror appears here. <strong>You sign the transaction yourself</strong> — zero server gas cost, you keep full custody.
        </p>
      </div>

      {userId && hasPendings && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-accent">Pending mirrors ready for you</span>
            <button onClick={fetchPendings} className="text-xs underline">Refresh</button>
          </div>
          {pendings.map((p, idx) => {
            const alpha = p.alpha_wallet || p.alphaWallet || '';
            const amt = p.amount_in || '';
            const ch = (p.chain || 'unknown').toUpperCase();
            return (
              <div key={idx} className="flex items-center justify-between rounded bg-surface-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{ch}</span> <span className="text-muted">from</span> {alpha.slice(0, 10)}…
                  <span className="ml-2 text-muted">amt {amt}</span>
                </div>
                <button
                  onClick={() => handleExecute(p)}
                  disabled={loading}
                  className="rounded bg-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-60"
                >
                  {loading ? 'Signing…' : 'Mirror Now (Sign)'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {userId && !hasPendings && (
        <div className="rounded-lg border border-border/60 bg-surface-2 p-3 text-sm">
          <p className="text-muted">No pending instant mirrors right now for your wallet.</p>
          <p className="mt-1 text-xs text-muted">
            Pendings appear automatically when tracked elite wallets make qualifying trades (Solana via Helius enhanced webhooks, BSC via free RPC polling).
          </p>
        </div>
      )}

      {!userId && (
        <p className="text-sm text-muted">Connect your wallet (MetaMask for BSC, Phantom for Solana) to see and execute instant mirrors for your address.</p>
      )}

      {/* Always-visible instructions so users see "how" even without connecting */}
      <div className="pt-2 border-t border-border/60 text-xs space-y-1 text-muted">
        <p className="font-medium text-foreground">How to mirror Solana wallets:</p>
        <ol className="list-decimal list-inside space-y-0.5 pl-1">
          <li>Connect <strong>Phantom</strong> (or another Solana wallet) on the site.</li>
          <li>Tracked elite Solana wallets (via Helius) will show pending mirrors here on the dashboard.</li>
          <li>Click <strong>Mirror Now (Sign)</strong> — we prepare a Jupiter quote and tx client-side.</li>
          <li>Review and sign in Phantom. You pay the Solana fees; we do not custody or pay anything.</li>
        </ol>
        <p className="font-medium text-foreground mt-2">How to mirror BSC wallets:</p>
        <ol className="list-decimal list-inside space-y-0.5 pl-1">
          <li>Connect MetaMask and make sure you are on BSC network.</li>
          <li>When a tracked BSC alpha trades on PancakeSwap, a pending appears.</li>
          <li>Approve token (if needed) and sign the swap transaction directly.</li>
        </ol>
        <p className="mt-2">This is the free, zero-backend-cost path using the live tracker. Separate from paid Pro mirrors on other chains. To get more Solana alphas tracked for instant mirroring, use the support chat or leaderboard to request.</p>
        <p className="text-[10px] mt-1">The execute buttons and pending list only activate after connecting the right wallet. Data keyed to your address.</p>
      </div>
    </div>
  );
}
