import { useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { toDisplayLabel } from "@/lib/displayLabel";
import { cn } from "@/lib/utils";

interface AssetResult {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  asset_class: string | null;
}

interface AssetPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTickers: string[];
  slotsLimit: number; // -1 = unlimited
  onAdded: (ticker: string) => void;
}

export function AssetPickerModal({
  open,
  onOpenChange,
  existingTickers,
  slotsLimit,
  onAdded,
}: AssetPickerModalProps) {
  const isMobile = useIsMobile();
  const { addTicker, adding } = useAddToWatchlist();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<AssetResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const existingSet = useMemo(
    () => new Set(existingTickers.map((t) => t.toUpperCase())),
    [existingTickers]
  );
  const isFull = slotsLimit !== -1 && existingTickers.length >= slotsLimit;

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebounced("");
      setResults(null);
      setFocusedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch
  useEffect(() => {
    if (!open) return;
    if (debounced.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("search_assets", {
          q: debounced,
          result_limit: 20,
          filter_asset_class: null,
        });
        if (cancelled) return;
        if (error) throw error;
        setResults((data ?? []) as AssetResult[]);
        setFocusedIdx(0);
      } catch (e: any) {
        if (!cancelled) {
          setResults([]);
          toast.error(e?.message || "Search failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const handleAdd = async (r: AssetResult) => {
    if (adding) return;
    if (existingSet.has(r.ticker.toUpperCase())) return;
    if (isFull) return;
    const ok = await addTicker(r.ticker);
    if (ok) onAdded(r.ticker.toUpperCase());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[focusedIdx];
      if (r) handleAdd(r);
    }
  };

  const content = (
    <div className="flex flex-col h-full max-h-[80vh]" onKeyDown={onKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-h4 font-semibold text-ds-text-primary">Add Asset</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="text-ds-text-muted hover:text-ds-text-primary"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search input */}
      <div className="px-5 pb-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-muted" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ticker or company name"
            aria-label="Search assets by ticker or company name"
            className="pl-9 bg-ds-surface border-ds-border placeholder:text-ds-text-muted"
          />
        </div>
      </div>

      {/* Full-state banner */}
      {isFull && (
        <div className="px-5 pb-2 text-caption text-ds-text-muted">
          Watchlist full.{" "}
          <Link
            to="/pricing"
            className="text-ds-brand-primary hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Upgrade
          </Link>{" "}
          plan to add more assets.
        </div>
      )}

      {/* Results */}
      <div
        ref={listRef}
        role="listbox"
        aria-label="Asset search results"
        className="flex-1 overflow-y-auto px-5 pb-2 min-h-[200px]"
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full bg-ds-surface-elevated" />
            ))}
          </div>
        ) : debounced.length < 2 ? (
          <div className="flex items-center justify-center h-[180px] text-body text-ds-text-muted text-center">
            Start typing to search the asset universe
          </div>
        ) : !results || results.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-body text-ds-text-muted text-center">
            No assets matching "{debounced}"
          </div>
        ) : (
          <div className="space-y-1.5">
            {results.map((r, idx) => {
              const already = existingSet.has(r.ticker.toUpperCase());
              const disabled = already || isFull;
              const focused = idx === focusedIdx;
              return (
                <div
                  key={r.id || r.ticker}
                  role="option"
                  aria-selected={focused}
                  aria-disabled={disabled}
                  tabIndex={-1}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  onClick={() => !disabled && handleAdd(r)}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-ds-md border bg-ds-surface-elevated transition-all duration-fast ease-ds-out",
                    disabled
                      ? "opacity-60 cursor-not-allowed border-ds-border"
                      : "cursor-pointer border-ds-border hover:border-ds-border-strong",
                    focused && !disabled && "border-ds-border-strong"
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-mono font-semibold text-body",
                          disabled ? "text-ds-text-muted" : "text-ds-brand-primary"
                        )}
                      >
                        {r.ticker}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-body truncate",
                        disabled ? "text-ds-text-muted" : "text-ds-text-secondary"
                      )}
                    >
                      {r.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.exchange && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-mono border border-ds-border bg-ds-surface-elevated text-ds-text-secondary">
                        {toDisplayLabel(r.exchange)}
                      </span>
                    )}
                    {r.asset_class && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption border border-ds-border bg-ds-surface-elevated text-ds-text-secondary">
                        {toDisplayLabel(r.asset_class)}
                      </span>
                    )}
                    {already ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption border border-ds-border text-ds-text-muted">
                        Already added
                      </span>
                    ) : isFull ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption border border-ds-border text-ds-text-muted">
                        Watchlist full
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end px-5 py-4 border-t border-ds-border">
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="p-0 h-[90vh] bg-ds-surface">
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-xl bg-ds-surface">
        {content}
      </DialogContent>
    </Dialog>
  );
}
