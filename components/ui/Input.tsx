import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, label, error, icon, ...props }, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-brand-800">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b80]">{icon}</span>}
        <input
          ref={ref}
          className={cn(
            "w-full h-11 rounded-xl border border-[#e8e6e0] bg-white px-4 text-sm text-brand-900 placeholder:text-[#6b6b80]/60 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent",
            "hover:border-[#c8c6c0]",
            icon && "pl-10",
            error && "border-red-400 focus:ring-red-200",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});
Input.displayName = "Input";
export { Input };
