export function IndexerBadge({
  source,
  live,
  enrichedAt,
  scoredAt,
}: {
  source: string;
  live: boolean;
  enrichedAt?: string;
  scoredAt?: string | null;
}) {
  const isLiveIndexer = source === "indexer-live";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
      <span
        className={`rounded-full px-2 py-0.5 font-medium ${
          isLiveIndexer ? "bg-accent/20 text-accent" : "bg-surface text-muted"
        }`}
      >
        {isLiveIndexer ? "Live indexer" : "Seed fallback"}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 font-medium ${
          live ? "bg-accent/10 text-accent" : "bg-surface text-muted"
        }`}
      >
        {live ? "RPC enriched" : "RPC pending"}
      </span>
      <span className="text-muted">Pipeline: {source}</span>
      {scoredAt && (
        <span className="text-muted">Scored {new Date(scoredAt).toLocaleString()}</span>
      )}
      {enrichedAt && (
        <span className="text-muted">
          Enriched {new Date(enrichedAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}