export function DisclaimerBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs text-muted">
        Not financial advice. Past performance does not guarantee future results. Copy trading
        carries risk of total loss.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
      <strong className="font-medium">Risk disclosure:</strong> This is not financial advice.
      Rankings reflect historical on-chain activity. Automated mirroring can result in total loss
      of funds. You retain custody — only approve allowances you understand.
    </div>
  );
}