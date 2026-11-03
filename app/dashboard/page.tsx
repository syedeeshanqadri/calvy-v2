import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveAccess } from "@/lib/access";
import { MemberHome } from "@/components/dashboard/MemberHome";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { t } from "@/lib/terms";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardKPIStats } from "@/components/dashboard/DashboardKPIStats";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { AppointmentList } from "@/components/dashboard/AppointmentList";
import { MiniCalendar } from "@/components/dashboard/MiniCalendar";
import { TeamWidget } from "@/components/dashboard/TeamWidget";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { safeTimeZone, utcToZoned, zonedDayRange, formatDateLabel } from "@/lib/time";
import { bookingForLabel } from "@/lib/patients";

export const dynamic = 'force-dynamic';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const access = await resolveAccess(session);
  if (access && !access.isOwner) return <MemberHome name={session?.user?.name ?? ""} roleName={access.roleName} permissions={access.permissions} />;
  if (!session?.user?.businessId) redirect("/login");

  const businessId = session.user.businessId;
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true, packId: true, termsOverride: true } });
  const tz = safeTimeZone(biz?.timezone);
  const now = new Date();
  const hour = utcToZoned(now, tz).minutes / 60;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = formatDateLabel(now, tz);

  // Today is the business's calendar day, not the server's.
  const { start: todayStart, end: todayEndExcl } = zonedDayRange(utcToZoned(now, tz).date, tz);
  const todayEnd = new Date(todayEndExcl.getTime() - 1);

  // Last 7 days
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  // Last 7 months for chart
  const monthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  // Current month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Current week (for new clients)
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setDate(thisWeekStart.getDate() - 6);

  const [todayAppts, weekAppts, monthAppts, thisMonthAppts, totalClients, newClientsThisWeek, dbStaff, dbServices, monthExpensesAgg] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, date: { gte: todayStart, lte: todayEnd }, status: { not: "expired" } },
      include: { client: true, service: true, staff: true },
      orderBy: { date: "asc" },
    }),
    prisma.appointment.findMany({
      where: { businessId, date: { gte: weekStart, lte: todayEnd } },
    }),
    prisma.appointment.findMany({
      where: { businessId, date: { gte: monthsStart, lte: todayEnd } },
    }),
    prisma.appointment.findMany({
      where: { businessId, date: { gte: thisMonthStart, lte: thisMonthEnd }, status: { not: "cancelled" } },
      select: { price: true, paymentStatus: true },
    }),
    prisma.client.count({ where: { businessId } }),
    prisma.client.count({ where: { businessId, createdAt: { gte: thisWeekStart } } }),
    prisma.staff.findMany({ where: { businessId, isActive: true } }),
    prisma.service.findMany({ where: { businessId, isActive: true } }),
    prisma.expense.aggregate({
      where: { businessId, date: { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) } },
      _sum: { amount: true },
    }),
  ]).catch((err) => {
    logger.error("[Dashboard] queries failed:", { err, businessId });
    return [[], [], [], [], 0, 0, [], [], { _sum: { amount: null } }] as const;
  });

  // KPI stats
  const monthExpenses = monthExpensesAgg._sum.amount ?? 0;
  const todayRevenue = todayAppts.filter(a => a.paymentStatus === "paid").reduce((s, a) => s + a.price, 0);
  const completedToday = todayAppts.filter(a => a.status === "completed").length;
  const pendingCount = todayAppts.filter(a => a.status === "pending").length;
  const notNoShow = todayAppts.filter(a => !["no-show", "cancelled"].includes(a.status)).length;
  const showUpRate = todayAppts.length > 0 ? Math.round((notNoShow / todayAppts.length) * 100) : 100;
  const monthRevenue = thisMonthAppts.filter(a => a.paymentStatus === "paid").reduce((s, a) => s + a.price, 0);

  // Last 7 days chart
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayAppts = weekAppts.filter(a => isSameDay(new Date(a.date), day));
    return {
      day: DAYS_SHORT[day.getDay()],
      revenue: dayAppts.filter(a => a.paymentStatus === "paid").reduce((s, a) => s + a.price, 0),
      appointments: dayAppts.length,
    };
  });

  // Last 7 months chart
  const monthData = Array.from({ length: 7 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (6 - i), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - (6 - i) + 1, 0, 23, 59, 59);
    const mAppts = monthAppts.filter(a => new Date(a.date) >= month && new Date(a.date) <= monthEnd);
    return {
      day: MONTHS_SHORT[month.getMonth()],
      revenue: mAppts.filter(a => a.paymentStatus === "paid").reduce((s, a) => s + a.price, 0),
      appointments: mAppts.length,
    };
  });

  // Today's appointments serialized for client component
  const appointments = todayAppts.map(a => {
    let serviceName = a.service.name;
    if (a.notes?.startsWith("__services__:")) {
      const extra = a.notes.split("\n")[0].replace("__services__:", "").split("|").filter(Boolean);
      serviceName = [a.service.name, ...extra].join(" & ");
    }
    return {
      id: a.id,
      clientName: bookingForLabel(a),
      clientEmail: a.client.email ?? a.client.phone ?? "",
      serviceName,
      staffName: a.staff?.name ?? "—",
      time: utcToZoned(a.date, tz).time,
      duration: a.duration,
      price: a.price,
      status: a.status,
      color: a.service.color,
    };
  });

  // Team with today's count
  const staff = dbStaff.map(s => ({
    id: s.id,
    name: s.name,
    role: s.role,
    color: s.color,
    appointmentsToday: todayAppts.filter(a => a.staffId === s.id).length,
  }));

  // Days in current month that have appointments
  const busyDays = Array.from(new Set(
    monthAppts
      .filter(a => {
        const d = new Date(a.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .map(a => new Date(a.date).getDate())
  ));

  const services = dbServices.map(s => ({ id: s.id, name: s.name, duration: s.duration, price: s.price }));
  const staffOptions = dbStaff.map(s => ({ id: s.id, name: s.name }));

  return (
    <DashboardLayout title={`${greeting}, ${firstName} 👋`} subtitle={`${dateStr} · You have ${todayAppts.length} ${t(biz ?? {}, "appointment", { plural: todayAppts.length !== 1 })} today`}>
      <DashboardKPIStats
        todayApptsCount={todayAppts.length}
        todayRevenue={todayRevenue}
        newClientsThisWeek={newClientsThisWeek}
        showUpRate={showUpRate}
        monthRevenue={monthRevenue}
        monthExpenses={monthExpenses}
        totalClients={totalClients}
        pendingCount={pendingCount}
        completedToday={completedToday}
      />

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <AppointmentList appointments={appointments} />
        </div>
        <div className="flex flex-col gap-6">
          <MiniCalendar busyDays={busyDays} />
          <QuickActions services={services} staff={staffOptions} businessSlug={session.user.businessSlug} />
        </div>
      </div>

      {/* Charts + Team */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <RevenueChart weekData={weekData} monthData={monthData} />
        </div>
        <div>
          <TeamWidget staff={staff} />
        </div>
      </div>
    </DashboardLayout>
  );
}
