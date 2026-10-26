import {
  Briefcase, Brush, ClipboardList, Dumbbell, FileText, Medal, MessageSquare, Scale, Scissors, Sparkles,
  Stethoscope, Store, Tag, Timer, User, UserRound, CalendarClock,
  type LucideIcon,
} from "lucide-react";

// The icon names a pack uses (lib/packs `icons`), mapped to components. Unknown names fall back to Sparkles.
const ICONS: Record<string, LucideIcon> = {
  Briefcase, Brush, ClipboardList, Dumbbell, FileText, Medal, MessageSquare, Scale, Scissors, Sparkles,
  Stethoscope, Store, Tag, Timer, User, UserRound, CalendarClock,
};

export function PackIcon({ name, className, size }: { name: string; className?: string; size?: number }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} size={size} aria-hidden />;
}
