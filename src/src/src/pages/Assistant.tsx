import { useSearchParams } from 'react-router-dom';
import { AIAssistantChat } from '@/components/AIAssistantChat';
import { PageHeader } from '@/components/PageHeader';

const Assistant = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="InsiderPulse AI Assistant"
        description="Ask questions about themes, signals, and market opportunities across all asset classes"
      />
      <AIAssistantChat initialQuery={initialQuery} />
    </div>
  );
};

export default Assistant;
