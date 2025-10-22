import { AIAssistantChat } from '@/components/AIAssistantChat';
import { PageHeader } from '@/components/PageHeader';

const Assistant = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Investment Assistant"
        description="Ask questions about themes, signals, and market opportunities"
      />
      <AIAssistantChat />
    </div>
  );
};

export default Assistant;
