import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Database, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface SupabaseInfo {
  url: string;
  projectRef: string;
  isConnected: boolean;
  error?: string;
}

export const SupabaseDebugPanel = () => {
  const [info, setInfo] = useState<SupabaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        // Extract project ref from the Supabase URL
        const supabaseUrl = (supabase as any).supabaseUrl || '';
        const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown';
        
        // Test connection with a simple query
        const { error } = await supabase.from('assets').select('id').limit(1);
        
        setInfo({
          url: supabaseUrl,
          projectRef,
          isConnected: !error,
          error: error?.message
        });
      } catch (err) {
        setInfo({
          url: 'Error retrieving URL',
          projectRef: 'unknown',
          isConnected: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      } finally {
        setLoading(false);
      }
    };

    checkConnection();
  }, []);

  if (loading) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Checking Supabase connection...</p>
        </CardContent>
      </Card>
    );
  }

  const isNewProject = info?.projectRef === 'gwoflyvcooepxxgflrvc';
  const isOldProject = info?.projectRef === 'detxhoqiarohjevedmxh';

  return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          Supabase Debug Info
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Project Ref:</span>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
              {info?.projectRef}
            </code>
            {isNewProject && (
              <Badge variant="default" className="text-xs bg-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                YOUR PROJECT
              </Badge>
            )}
            {isOldProject && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                LOVABLE MANAGED
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">URL:</span>
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-[200px]">
            {info?.url || 'N/A'}
          </code>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Connection:</span>
          <div className="flex items-center gap-2">
            {info?.isConnected ? (
              <Badge variant="default" className="text-xs bg-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                Error
              </Badge>
            )}
          </div>
        </div>
        
        {info?.error && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            Error: {info.error}
          </div>
        )}
        
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Expected Project: <code className="font-mono">gwoflyvcooepxxgflrvc</code>
        </div>
      </CardContent>
    </Card>
  );
};
