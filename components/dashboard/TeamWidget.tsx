import { Avatar } from "@/components/ui/Avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  color: string;
  appointmentsToday: number;
}

export function TeamWidget({ staff }: { staff: TeamMember[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Today</CardTitle>
        <button className="text-xs text-accent font-medium hover:underline">Manage →</button>
      </CardHeader>
      <CardContent className="space-y-4">
        {staff.length === 0 && <p className="text-sm text-[#6b6b80] text-center py-4">No staff members yet</p>}
        {staff.map((member) => {
          const load = Math.round((member.appointmentsToday / 8) * 100);
          const statusColor = load >= 80 ? "text-amber-600 bg-amber-50" : load >= 40 ? "text-green-600 bg-green-50" : "text-gray-500 bg-gray-100";
          const statusLabel = load >= 80 ? "Busy" : load >= 40 ? "Online" : "Available";
          return (
            <div key={member.id} className="flex items-center gap-3">
              <Avatar name={member.name} color={member.color} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{member.name}</span>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2", statusColor)}>{statusLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[#f0ede8] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#0f0f1a] transition-all duration-700" style={{ width: `${Math.min(load, 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-[#6b6b80] whitespace-nowrap">{member.appointmentsToday}/8 slots</span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
