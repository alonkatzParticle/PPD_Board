import { cn } from "@/lib/utils";

interface BadgeProps {
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "secondary" | "outline";
}

export function Badge({ className, children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        variant === "default" && "bg-primary/10 text-primary",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "outline" && "border border-border text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
