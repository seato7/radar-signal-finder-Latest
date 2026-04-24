import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface RequestAssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTicker?: string;
  searchQuery?: string;
}

export function RequestAssetModal({
  open,
  onOpenChange,
  initialTicker,
  searchQuery,
}: RequestAssetModalProps) {
  const { toast } = useToast();
  const [ticker, setTicker] = useState(initialTicker ?? "");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTicker(initialTicker ?? "");
      setName("");
      setReason("");
    }
  }, [open, initialTicker]);

  const canSubmit = ticker.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Sign in required",
          description: "Please sign in to request assets.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("user_asset_requests").insert({
        user_id: user.id,
        requested_ticker: ticker.trim().toUpperCase(),
        requested_name: name.trim() || null,
        requested_reason: reason.trim() || null,
        search_query: searchQuery?.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Thanks!",
        description: "Your request has been submitted.",
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not submit request",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request an asset</DialogTitle>
          <DialogDescription>
            Can't find what you're looking for? Let us know and we'll review it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="request-ticker">Ticker</Label>
            <Input
              id="request-ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g. AAPL"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="request-name">Name (optional)</Label>
            <Input
              id="request-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="request-reason">Why should we add this? (optional)</Label>
            <Textarea
              id="request-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Context helps us prioritise"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Submitting..." : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
