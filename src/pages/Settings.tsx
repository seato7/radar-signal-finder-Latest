import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Trash2, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface BrokerKey {
  id: string;
  label: string;
  exchange: string;
  key_id: string;
  paper_mode: boolean;
  created_at: string;
}

interface SupportedBroker {
  id: string;
  name: string;
  description: string;
  supports_paper: boolean;
  assets: string[];
}

export default function Settings() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<BrokerKey[]>([]);
  const [brokers, setBrokers] = useState<SupportedBroker[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    exchange: 'alpaca',
    label: '',
    api_key: '',
    secret_key: '',
    paper_mode: true
  });

  useEffect(() => {
    fetchKeys();
    fetchSupportedBrokers();
  }, []);

  const fetchSupportedBrokers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/broker/supported`);
      if (response.ok) {
        const data = await response.json();
        setBrokers(data.brokers);
      }
    } catch (error) {
      console.error('Error fetching brokers:', error);
    }
  };

  const fetchKeys = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/broker/keys`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setKeys(data);
      }
    } catch (error) {
      console.error('Error fetching keys:', error);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/broker/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Broker Connected',
          description: 'Your broker account has been connected successfully.',
        });
        setFormData({ exchange: 'alpaca', label: '', api_key: '', secret_key: '', paper_mode: true });
        fetchKeys();
      } else {
        toast({
          title: 'Connection Failed',
          description: data.detail || 'Could not connect broker account.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to connect broker account.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/broker/keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast({ title: 'Broker Disconnected' });
        fetchKeys();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect broker.',
        variant: 'destructive'
      });
    }
  };

  const handleTestKey = async (keyId: string) => {
    setTestingId(keyId);
    try {
      const response = await fetch(`${API_BASE}/api/broker/keys/${keyId}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (data.status === 'connected') {
        toast({
          title: 'Connection Active',
          description: data.account?.portfolio_value 
            ? `Account Balance: $${parseFloat(data.account.portfolio_value).toFixed(2)}`
            : 'Connection successful',
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: data.error || 'Could not connect to broker.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to test connection.',
        variant: 'destructive'
      });
    } finally {
      setTestingId(null);
    }
  };

  const selectedBroker = brokers.find(b => b.id === formData.exchange);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your broker connections and account settings"
      />

      <Card>
        <CardHeader>
          <CardTitle>Connect Broker Account</CardTitle>
          <CardDescription>
            Connect your trading account from any supported broker. Your API keys are encrypted and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddKey} className="space-y-4">
            <div>
              <Label htmlFor="exchange">Select Broker</Label>
              <Select
                value={formData.exchange}
                onValueChange={(value) => setFormData({ ...formData, exchange: value })}
              >
                <SelectTrigger id="exchange">
                  <SelectValue placeholder="Choose a broker" />
                </SelectTrigger>
                <SelectContent>
                  {brokers.map((broker) => (
                    <SelectItem key={broker.id} value={broker.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{broker.name}</span>
                        <span className="text-xs text-muted-foreground">{broker.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="label">Account Label</Label>
              <Input
                id="label"
                placeholder="My Trading Account"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                placeholder="Enter your API key"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="secret_key">Secret Key</Label>
              <Input
                id="secret_key"
                type="password"
                placeholder="Enter your secret key"
                value={formData.secret_key}
                onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                required
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="paper_mode"
                checked={formData.paper_mode}
                onCheckedChange={(checked) => setFormData({ ...formData, paper_mode: checked })}
                disabled={!selectedBroker?.supports_paper}
              />
              <Label htmlFor="paper_mode">
                Paper Trading Mode (Recommended)
                {selectedBroker && !selectedBroker.supports_paper && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (Not available for this broker)
                  </span>
                )}
              </Label>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect Broker'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Brokers</CardTitle>
          <CardDescription>
            Your connected broker accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-muted-foreground">No broker accounts connected yet.</p>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-semibold">{key.label}</h4>
                    <p className="text-sm text-muted-foreground">
                      {key.exchange.toUpperCase()} • {key.paper_mode ? 'Paper' : 'Live'} • {key.key_id.slice(0, 10)}...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestKey(key.id)}
                      disabled={testingId === key.id}
                    >
                      {testingId === key.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Test Connection'
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteKey(key.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
