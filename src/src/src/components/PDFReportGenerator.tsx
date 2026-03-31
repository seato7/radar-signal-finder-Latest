import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface PDFReportGeneratorProps {
  reportData: any;
  reportType: string;
  fileName?: string;
}

export const PDFReportGenerator = ({ reportData, reportType, fileName = 'report' }: PDFReportGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ reportData, reportType }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate report');

      const data = await response.json();
      
      // Download markdown as text file (can be converted to PDF client-side if needed)
      const blob = new Blob([data.reportMarkdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Report Generated',
        description: 'Your investment report has been downloaded',
      });
    } catch (error) {
      console.error('Report generation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate report',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button onClick={generateReport} disabled={isGenerating} variant="outline">
      {isGenerating ? (
        <>
          <FileText className="h-4 w-4 mr-2 animate-pulse" />
          Generating...
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </>
      )}
    </Button>
  );
};
