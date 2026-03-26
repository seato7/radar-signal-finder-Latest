import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ShieldAlert, Lock, RefreshCw } from 'lucide-react';

interface BrokerKey {
  id: string;
  exchange: string;
  broker_name: string | null;
  encryption_version: string;
}

const BROKER_OPTIONS = [
  { value: 'alpaca', label: 'Alpaca', name: 'Alpaca Markets' },
  { value: 'ibkr', label: 'Interactive Brokers', name: 'Interactive Brokers' },
  { value: 'binance', label: 'Binance', name: 'Binance' },
  { value: 'coinbase', label: 'Coinbase', name: 'Coinbase' },
  { value: 'kraken', label: 'Kraken', name: 'Kraken' },
];

export function BrokerKeyRotationModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [legacyKeys, setLegacyKeys] = useState<BrokerKey[]>([]);
  const [currentKey, setCurrentKey] = useState<BrokerKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: '',
    apiSecret: '',
  });

  useEffect(() => {
    if (user) {
      checkForLegacyKeys();
    }
  }, [user]);

  const checkForLegacyKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('broker_keys')
        .select('id, exchange, broker_name, encryption_version')
        .eq('encryption_version', 'v1');

      if (error) throw error;

      if (data && data.length > 0) {
        setLegacyKeys(data);
        setCurrentKey(data[0]); // Start with first legacy key
        setOpen(true);
      }
    } catch (error) {
      console.error('Error checking for legacy keys:', error);
    }
  };

  const handleRotate = async () => {
    if (!currentKey) return;
    
    if (!formData.apiKey.trim() || !formData.apiSecret.trim()) {
      toast.error('Please enter both API key and secret');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Authentication required');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rotate-broker-key`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            broker_key_id: currentKey.id,
            api_key: formData.apiKey,
            api_secret: formData.apiSecret,
            exchange: currentKey.exchange,
            broker_name: currentKey.broker_name,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to rotate key');
      }

      toast.success('Broker key rotated successfully');
      
      // Move to next key or close
      const remainingKeys = legacyKeys.filter(k => k.id !== currentKey.id);
      if (remainingKeys.length > 0) {
        setCurrentKey(remainingKeys[0]);
        setFormData({ apiKey: '', apiSecret: '' });
      } else {
        setOpen(false);
        toast.success('All broker keys have been securely updated!');
      }
      
      setLegacyKeys(remainingKeys);
    } catch (error) {
      console.error('Error rotating key:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to rotate key');
    } finally {
      setLoading(false);
    }
  };

  const getBrokerLabel = (exchange: string) => {
    return BROKER_OPTIONS.find(b => b.value === exchange)?.label || exchange.toUpperCase();
  };

  if (!open || !currentKey) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <DialogTitle className="text-xl">Security Update Required</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Your broker API key for <strong>{getBrokerLabel(currentKey.exchange)}</strong> was stored using an outdated method and must be securely re-submitted. 
            This protects your account and enables encrypted storage with AES-GCM-256 encryption.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-warning bg-warning/10">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            <strong>What's changing:</strong> Your credentials will be re-encrypted using industry-standard 
            AES-GCM-256 with PBKDF2 key derivation (100,000 iterations). This is a one-time update.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="broker">Broker</Label>
            <Select value={currentKey.exchange} disabled>
              <SelectTrigger id="broker">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BROKER_OPTIONS.map(broker => (
                  <SelectItem key={broker.value} value={broker.value}>
                    {broker.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter your API key"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Re-enter your API key from your broker's dashboard
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiSecret">API Secret</Label>
            <Input
              id="apiSecret"
              type="password"
              placeholder="Enter your API secret"
              value={formData.apiSecret}
              onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Re-enter your API secret from your broker's dashboard
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {legacyKeys.length > 1 && `${legacyKeys.length} keys remaining`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Skip for Now
            </Button>
            <Button
              onClick={handleRotate}
              disabled={loading || !formData.apiKey || !formData.apiSecret}
              className="gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Rotating...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Rotate Key
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
