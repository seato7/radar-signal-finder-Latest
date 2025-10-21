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
import { Trash2, Loader2, Copy, Key, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

interface ApiKeyEnterprise {
  id: string;
  label: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used: string | null;
  created_at: string;
}

export default function Settings() {
  const { token, userPlan } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<BrokerKey[]>([]);
  const [brokers, setBrokers] = useState<SupportedBroker[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  const [apiKeys, setApiKeys] = useState<ApiKeyEnterprise[]>([]);
  const [apiKeyLabel, setApiKeyLabel] = useState('');
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  
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
    if (userPlan === 'enterprise') {
      fetchApiKeys();
    }
  }, [userPlan]);

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

  const fetchApiKeys = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/keys`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  };

  const handleCreateApiKey = async () => {
    if (!apiKeyLabel.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a label for the API key',
        variant: 'destructive'
      });
      return;
    }

    setCreatingApiKey(true);
    try {
      const response = await fetch(`${API_BASE}/api/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          label: apiKeyLabel,
          permissions: ['read']
        })
      });

      const data = await response.json();

      if (response.ok) {
        setNewApiKey(data.key);
        setApiKeyLabel('');
        fetchApiKeys();
        toast({
          title: 'API Key Created',
          description: 'Save this key - it will only be shown once!',
        });
      } else {
        toast({
          title: 'Error',
          description: data.detail || 'Failed to create API key',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create API key',
        variant: 'destructive'
      });
    } finally {
      setCreatingApiKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast({ title: 'API Key Revoked' });
        fetchApiKeys();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to revoke API key',
        variant: 'destructive'
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
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

      {/* API Keys Management - Enterprise Only */}
      {userPlan === 'enterprise' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Generate API keys for programmatic access to your data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {newApiKey && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">Save this API key - it won't be shown again!</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                        {newApiKey}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(newApiKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setNewApiKey(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="API Key Label (e.g., 'Production Server')"
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
              />
              <Button
                onClick={handleCreateApiKey}
                disabled={creatingApiKey}
              >
                {creatingApiKey ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Create Key'
                )}
              </Button>
            </div>

            {apiKeys.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No API keys created yet
              </p>
            ) : (
              <div className="space-y-4">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{key.label}</h4>
                      <p className="text-sm text-muted-foreground">
                        {key.key_prefix}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {key.last_used ? `Last used: ${new Date(key.last_used).toLocaleDateString()}` : 'Never used'}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteApiKey(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Using Your API Key</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Include your API key in request headers:
              </p>
              <code className="block p-2 bg-background rounded text-xs">
                X-API-Key: ok_live_your_key_here
              </code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
