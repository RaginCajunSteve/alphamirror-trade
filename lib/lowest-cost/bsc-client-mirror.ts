/**
 * Lowest Cost BSC Client-Side Mirror (wired into main site)
 * Adapted from alphamirror-prod for alphamirror.trade Next.js
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ethers } from 'ethers';

const PANCAKE_V2_ROUTER = '0x10ed43c718714eb63d5aa57b78b54704e256024e';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

export async function getPendingBscMirrors(userId: string) {
  const res = await fetch(`/pending-bsc?userId=${encodeURIComponent(userId)}`);
  const data = await res.json();
  return data.pending || [];
}

export async function executeBscClientMirror(pending: Record<string, any>, provider: any) {
  const signer = await (provider as any).getSigner();
  const userAddress = await (signer as any).getAddress();

  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(56)) {
    await (window as any).ethereum?.request?.({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x38' }],
    });
  }

  const routerAddr = pending.router || PANCAKE_V2_ROUTER;
  const router = new ethers.Contract(routerAddr, PANCAKE_ROUTER_ABI, signer as any);

  const tokenIn = pending.token_in || pending.tokenIn;
  const tokenOut = pending.token_out || pending.tokenOut;
  const amtStr = pending.amount_in || pending.amountIn || '0';
  const decimalsIn = pending.decimals_in || 18;

  const amountIn = ethers.parseUnits(String(amtStr), decimalsIn);
  const minOut = amountIn * BigInt(99) / BigInt(100);
  const path = [tokenIn, tokenOut];
  const deadline = Math.floor(Date.now() / 1000) + 300;

  if (tokenIn && tokenIn.toLowerCase() !== WBNB.toLowerCase() && tokenIn !== '0x0000000000000000000000000000000000000000') {
    const token = new ethers.Contract(tokenIn, ERC20_ABI, signer);
    const allowance = await token.allowance(userAddress, routerAddr);
    if (allowance < amountIn) {
      const approveTx = await token.approve(routerAddr, ethers.MaxUint256);
      await approveTx.wait();
    }
  }

  const isNative = !tokenIn || tokenIn.toLowerCase() === WBNB.toLowerCase() || tokenIn === '0x0000000000000000000000000000000000000000';
  let tx;
  if (isNative) {
    tx = await router.swapExactETHForTokens(minOut, path, userAddress, deadline, { value: amountIn });
  } else {
    tx = await router.swapExactTokensForTokens(amountIn, minOut, path, userAddress, deadline);
  }

  const receipt = await tx.wait();

  await fetch('/mark-bsc-mirror-done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingId: pending.id, txHash: receipt.hash }),
  });

  return receipt.hash;
}

const PANCAKE_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];
