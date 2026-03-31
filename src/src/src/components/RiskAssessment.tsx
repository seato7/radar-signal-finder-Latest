import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface RiskAssessmentProps {
  theme: any;
  signals: any[];
}

export const RiskAssessment = ({ theme, signals }: RiskAssessmentProps) => {
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assess-risk`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ theme, signals }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          setAssessment(data);
        }
      } catch (error) {
        console.error('Risk assessment error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssessment();
  }, [theme, signals]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Risk Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!assessment) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={assessment.metadata.hasInstitutionalSupport ? 'default' : 'outline'}>
            {assessment.metadata.signalCount} Signals
          </Badge>
          <Badge variant="secondary">
            {assessment.metadata.signalDiversity} Types
          </Badge>
        </div>
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-sm">{assessment.assessment}</div>
        </div>
      </CardContent>
    </Card>
  );
};
