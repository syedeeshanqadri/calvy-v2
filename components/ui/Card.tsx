import { cn } from "@/lib/utils";

interface CardProps { children: React.ReactNode; className?: string; hover?: boolean; }
export function Card({ children, className, hover }: CardProps) {
  return (
    <div className={cn("bg-white rounded-2xl border border-[#e8e6e0] shadow-sm", hover && "transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between px-6 py-4 border-b border-[#f0ede8]", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("font-syne font-semibold text-[15px] text-brand-900", className)}>{children}</h3>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}
