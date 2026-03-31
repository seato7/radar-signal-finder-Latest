import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  requiredPlan?: 'Lite' | 'Pro';
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  open,
  onOpenChange,
  feature,
  requiredPlan = 'Lite',
}) => {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-5 w-5 text-primary" />
            <DialogTitle>Upgrade Required</DialogTitle>
          </div>
          <DialogDescription className="space-y-3 pt-2">
            <p>
              <span className="font-semibold">{feature}</span> is a premium feature
              available with the {requiredPlan} plan.
            </p>
            <div className="bg-accent/20 p-4 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Unlimited bots & advanced strategies</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Real-time alerts & notifications</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Priority support</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Maybe Later
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onOpenChange(false);
              navigate('/pricing');
            }}
          >
            View Plans
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
