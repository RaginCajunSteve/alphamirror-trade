/**
 * Minimal Jupiter v6 client (adapted)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  slippageBps?: number;
}

export async function getJupiterQuote(params: JupiterQuoteParams) {
  const url = new URL(JUPITER_QUOTE_API);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', String(params.amount));
  url.searchParams.set('slippageBps', String(params.slippageBps || 50));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Jupiter quote failed');
  return res.json();
}

export async function buildJupiterSwapTransaction(quoteResponse: any, userPublicKey: string) {
  const res = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) throw new Error('Failed to build Jupiter swap tx');
  return res.json() as any;
}
