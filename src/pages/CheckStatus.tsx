import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const RAILWAY_API = 'https://radar-signal-finder-production.up.railway.app';

export default function CheckStatus() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = async () => {
    setLoading(true);
    setError('');
    setStatus(null);

    try {
      // Try to call the setup endpoint
      const email = 'danseaton7@gmail.com';
      const setupResponse = await fetch(`${RAILWAY_API}/api/admin/setup/${email}`);
      const setupData = await setupResponse.json();
      
      setStatus(setupData);
    } catch (err: any) {
      setError(err.message || 'Failed to check status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Status Checker"
        description="Verify and update your account permissions"
      />

      <Card>
        <CardHeader>
          <CardTitle>Database Status Check</CardTitle>
          <CardDescription>
            Click the button below to verify and update your account in the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={checkStatus} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Check & Update Status
              </>
            )}
          </Button>

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Error</p>
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {status && (
            <Card className="border-primary">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div className="space-y-2 flex-1">
                    <p className="font-medium text-primary">Database Updated Successfully!</p>
                    <div className="text-sm space-y-1">
                      <p><strong>Email:</strong> {status.email}</p>
                      <p><strong>Role:</strong> {status.role}</p>
                      <p><strong>Plan:</strong> {status.plan}</p>
                      <p><strong>Expires:</strong> {new Date(status.expires_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {status && (
            <Card className="bg-muted">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">✅ Next Steps:</h3>
                <ol className="space-y-2 text-sm list-decimal list-inside">
                  <li>Click the <strong>Logout</strong> button at the bottom of the sidebar</li>
                  <li>Log back in with your email and password</li>
                  <li>You should now see <strong>"Premium Plan"</strong> in the sidebar</li>
                  <li>The Admin Dashboard will now load correctly</li>
                </ol>
                <div className="mt-4 p-3 bg-background rounded-md">
                  <p className="text-xs text-muted-foreground">
                    <strong>Why?</strong> Your browser has a cached authentication token with your old permissions. 
                    Logging out and back in gets you a fresh token with your new admin and premium status.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
