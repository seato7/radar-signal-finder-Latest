import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 pb-6", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-overline text-ds-text-muted mb-2">{eyebrow}</div>
        )}
        <h1 className="text-h2 md:text-h1 font-semibold text-ds-text-primary tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-body text-ds-text-secondary mt-2 max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
