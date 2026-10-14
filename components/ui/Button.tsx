import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-dm font-medium rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2";
    const variants = {
      primary: "bg-accent text-white hover:bg-accent-hover focus:ring-accent shadow-lg shadow-accent/20 hover:-translate-y-0.5 active:translate-y-0",
      secondary: "bg-brand-800 text-white hover:bg-brand-900 focus:ring-brand-800",
      outline: "bg-transparent border border-brand-800/20 text-brand-800 hover:bg-brand-800/5 focus:ring-brand-800",
      ghost: "bg-transparent text-brand-800 hover:bg-brand-800/8 focus:ring-brand-800",
      danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500",
    };
    const sizes = {
      sm: "text-sm px-4 py-2 gap-1.5",
      md: "text-sm px-6 py-2.5 gap-2",
      lg: "text-base px-8 py-3.5 gap-2",
    };
    return (
      <button ref={ref} disabled={disabled || loading} className={cn(base, variants[variant], sizes[size], className)} {...props}>
        {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
export { Button };
