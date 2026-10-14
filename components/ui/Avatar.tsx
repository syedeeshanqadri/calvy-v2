import { cn, getInitials } from "@/lib/utils";
import Image from "next/image";

interface AvatarProps {
  name: string;
  avatar?: string;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = { sm: "w-8 h-8 text-xs", md: "w-9 h-9 text-sm", lg: "w-11 h-11 text-sm", xl: "w-14 h-14 text-base" };

export function Avatar({ name, avatar, color = "#0284c7", size = "md", className }: AvatarProps) {
  const initials = getInitials(name);
  if (avatar) {
    return (
      <div className={cn("rounded-full overflow-hidden flex-shrink-0 relative", sizes[size], className)}>
        <Image src={avatar} alt={name} fill className="object-cover" />
      </div>
    );
  }
  return (
    <div className={cn("rounded-full flex-shrink-0 flex items-center justify-center font-syne font-700 text-white", sizes[size], className)} style={{ backgroundColor: color }}>
      {initials}
    </div>
  );
}
