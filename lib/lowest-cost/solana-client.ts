/**
 * Solana Jupiter Live Mirror (client only) - adapted for main site
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { getJupiterQuote, buildJupiterSwapTransaction } from './jupiter-client';

export async function getPendingSolanaMirrors(userId: string) {
  const res = await fetch(`/pending-mirrors?userId=${encodeURIComponent(userId)}`);
  const data = await res.json();
  return data.pending || [];
}

export async function executeSolanaMirror(
  pending: Record<string, any>,
  userWallet: any,
  userCaps: any,
  connection: Connection
) {
  const tokenIn = (pending as any).token_in || (pending as any).tokenIn;
  const tokenOut = (pending as any).token_out || (pending as any).tokenOut;
  const amountStr = (pending as any).amount_in || (pending as any).scaled_amount || (pending as any).amountIn || '0';
  const alpha = (pending as any).alpha_wallet || (pending as any).alphaWallet;

  const quote = await getJupiterQuote({
    inputMint: tokenIn,
    outputMint: tokenOut,
    amount: amountStr,
    slippageBps: 50,
  });
  if (!quote) throw new Error('No Jupiter quote');

  const pubkeyStr = userWallet?.publicKey?.toBase58?.() || String(userWallet?.publicKey || '');

  const built = await buildJupiterSwapTransaction(quote, pubkeyStr);
  const swapTransaction = built.swapTransaction || built.swap_transaction;

  // Browser safe
  const txBuffer = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
  const transaction = VersionedTransaction.deserialize(txBuffer);

  const signedTx = await userWallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(signature, 'confirmed');

  await fetch('/record-solana-mirror', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingId: pending.id, userId: pubkeyStr, alpha, jupiterTx: signature }),
  });

  return signature;
}
