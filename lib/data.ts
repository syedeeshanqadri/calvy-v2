import type { Appointment, Client, Staff, Service, DashboardStats, RevenueData } from "@/types";

export const SERVICES: Service[] = [
  { id: "s1", name: "Haircut & Style", description: "Full haircut with wash and blow dry", duration: 60, price: 85, category: "haircare", color: "#e84545", staffIds: ["st1", "st2"], isActive: true },
  { id: "s2", name: "Consultation", description: "One-on-one consultation session", duration: 30, price: 60, category: "consulting", color: "#3b82f6", staffIds: ["st1", "st3"], isActive: true },
  { id: "s3", name: "Full Session", description: "Complete wellness or therapy session", duration: 90, price: 120, category: "wellness", color: "#22c55e", staffIds: ["st2", "st3"], isActive: true },
  { id: "s4", name: "Follow-up", description: "Short follow-up appointment", duration: 30, price: 45, category: "consulting", color: "#f59e0b", staffIds: ["st1", "st2", "st3"], isActive: true },
  { id: "s5", name: "Premium Package", description: "Extended premium service package", duration: 120, price: 150, category: "wellness", color: "#8b5cf6", staffIds: ["st1"], isActive: true },
  { id: "s6", name: "Color Treatment", description: "Hair coloring and treatment", duration: 120, price: 140, category: "haircare", color: "#ec4899", staffIds: ["st2"], isActive: true },
];


export const STAFF: Staff[] = [
  {
    id: "st1", name: "Alex Johnson", role: "Senior Stylist", email: "alex@calvy.io", phone: "+1 555-0101",
    color: "#e84545", services: ["s1", "s2", "s4", "s5"],
    workingHours: {
      monday: { start: "09:00", end: "18:00", isWorking: true },
      tuesday: { start: "09:00", end: "18:00", isWorking: true },
      wednesday: { start: "09:00", end: "18:00", isWorking: true },
      thursday: { start: "09:00", end: "18:00", isWorking: true },
      friday: { start: "09:00", end: "17:00", isWorking: true },
      saturday: { start: "10:00", end: "15:00", isWorking: true },
      sunday: { start: "00:00", end: "00:00", isWorking: false },
    },
    isActive: true, appointmentsToday: 6, totalRevenue: 12840,
  },
  {
    id: "st2", name: "Jordan Kim", role: "Color Specialist", email: "jordan@calvy.io", phone: "+1 555-0102",
    color: "#3b82f6", services: ["s1", "s3", "s4", "s6"],
    workingHours: {
      monday: { start: "10:00", end: "19:00", isWorking: true },
      tuesday: { start: "10:00", end: "19:00", isWorking: true },
      wednesday: { start: "00:00", end: "00:00", isWorking: false },
      thursday: { start: "10:00", end: "19:00", isWorking: true },
      friday: { start: "10:00", end: "19:00", isWorking: true },
      saturday: { start: "09:00", end: "16:00", isWorking: true },
      sunday: { start: "00:00", end: "00:00", isWorking: false },
    },
    isActive: true, appointmentsToday: 4, totalRevenue: 9200,
  },
  {
    id: "st3", name: "Maya Patel", role: "Wellness Therapist", email: "maya@calvy.io", phone: "+1 555-0103",
    color: "#8b5cf6", services: ["s2", "s3", "s4"],
    workingHours: {
      monday: { start: "08:00", end: "17:00", isWorking: true },
      tuesday: { start: "08:00", end: "17:00", isWorking: true },
      wednesday: { start: "08:00", end: "17:00", isWorking: true },
      thursday: { start: "08:00", end: "17:00", isWorking: true },
      friday: { start: "08:00", end: "16:00", isWorking: true },
      saturday: { start: "00:00", end: "00:00", isWorking: false },
      sunday: { start: "00:00", end: "00:00", isWorking: false },
    },
    isActive: true, appointmentsToday: 7, totalRevenue: 15600,
  },
];

export const CLIENTS: Client[] = [
  { id: "c1", name: "Sarah Richardson", email: "sarah@email.com", phone: "+1 555-1001", totalAppointments: 12, totalSpent: 960, lastVisit: "2024-07-15", notes: "Prefers morning slots", createdAt: "2024-01-10" },
  { id: "c2", name: "Michael Kim", email: "michael@email.com", phone: "+1 555-1002", totalAppointments: 5, totalSpent: 325, lastVisit: "2024-07-18", createdAt: "2024-03-22" },
  { id: "c3", name: "Ana López", email: "ana@email.com", phone: "+1 555-1003", totalAppointments: 8, totalSpent: 780, lastVisit: "2024-07-20", notes: "Allergic to certain products", createdAt: "2024-02-14" },
  { id: "c4", name: "James Dawson", email: "james@email.com", phone: "+1 555-1004", totalAppointments: 3, totalSpent: 195, lastVisit: "2024-07-10", createdAt: "2024-05-01" },
  { id: "c5", name: "Priya Thomas", email: "priya@email.com", phone: "+1 555-1005", totalAppointments: 15, totalSpent: 1840, lastVisit: "2024-07-22", notes: "VIP client", createdAt: "2023-11-05" },
  { id: "c6", name: "David Chen", email: "david@email.com", phone: "+1 555-1006", totalAppointments: 6, totalSpent: 520, lastVisit: "2024-07-12", createdAt: "2024-04-18" },
  { id: "c7", name: "Emma Wilson", email: "emma@email.com", phone: "+1 555-1007", totalAppointments: 9, totalSpent: 870, lastVisit: "2024-07-19", createdAt: "2024-01-28" },
  { id: "c8", name: "Ryan Shaw", email: "ryan@email.com", phone: "+1 555-1008", totalAppointments: 2, totalSpent: 130, lastVisit: "2024-07-08", createdAt: "2024-06-10" },
];

export const APPOINTMENTS: Appointment[] = [
  { id: "a1", clientId: "c1", clientName: "Sarah Richardson", clientEmail: "sarah@email.com", clientPhone: "+1 555-1001", staffId: "st1", staffName: "Alex Johnson", serviceId: "s1", serviceName: "Haircut & Style", date: "2024-07-22", time: "10:00", duration: 60, price: 85, status: "confirmed", color: "#e84545", createdAt: "2024-07-15" },
  { id: "a2", clientId: "c2", clientName: "Michael Kim", clientEmail: "michael@email.com", clientPhone: "+1 555-1002", staffId: "st1", staffName: "Alex Johnson", serviceId: "s2", serviceName: "Consultation", date: "2024-07-22", time: "11:30", duration: 30, price: 60, status: "pending", color: "#3b82f6", createdAt: "2024-07-18" },
  { id: "a3", clientId: "c3", clientName: "Ana López", clientEmail: "ana@email.com", clientPhone: "+1 555-1003", staffId: "st2", staffName: "Jordan Kim", serviceId: "s3", serviceName: "Full Session", date: "2024-07-22", time: "13:00", duration: 90, price: 120, status: "confirmed", color: "#22c55e", createdAt: "2024-07-16" },
  { id: "a4", clientId: "c4", clientName: "James Dawson", clientEmail: "james@email.com", clientPhone: "+1 555-1004", staffId: "st3", staffName: "Maya Patel", serviceId: "s4", serviceName: "Follow-up", date: "2024-07-22", time: "14:30", duration: 30, price: 45, status: "confirmed", color: "#f59e0b", createdAt: "2024-07-19" },
  { id: "a5", clientId: "c5", clientName: "Priya Thomas", clientEmail: "priya@email.com", clientPhone: "+1 555-1005", staffId: "st1", staffName: "Alex Johnson", serviceId: "s5", serviceName: "Premium Package", date: "2024-07-22", time: "16:00", duration: 120, price: 150, status: "confirmed", color: "#8b5cf6", createdAt: "2024-07-17" },
  { id: "a6", clientId: "c6", clientName: "David Chen", clientEmail: "david@email.com", clientPhone: "+1 555-1006", staffId: "st2", staffName: "Jordan Kim", serviceId: "s6", serviceName: "Color Treatment", date: "2024-07-22", time: "09:00", duration: 120, price: 140, status: "completed", color: "#ec4899", createdAt: "2024-07-14" },
  { id: "a7", clientId: "c7", clientName: "Emma Wilson", clientEmail: "emma@email.com", clientPhone: "+1 555-1007", staffId: "st3", staffName: "Maya Patel", serviceId: "s3", serviceName: "Full Session", date: "2024-07-23", time: "10:00", duration: 90, price: 120, status: "confirmed", color: "#22c55e", createdAt: "2024-07-18" },
  { id: "a8", clientId: "c8", clientName: "Ryan Shaw", clientEmail: "ryan@email.com", clientPhone: "+1 555-1008", staffId: "st2", staffName: "Jordan Kim", serviceId: "s1", serviceName: "Haircut & Style", date: "2024-07-23", time: "14:00", duration: 60, price: 85, status: "pending", color: "#e84545", createdAt: "2024-07-20" },
];

export const DASHBOARD_STATS: DashboardStats = {
  todayAppointments: 8,
  todayRevenue: 640,
  newClientsThisWeek: 3,
  showUpRate: 94,
  monthlyRevenue: 12480,
  totalClients: 248,
  pendingAppointments: 3,
  completedToday: 2,
};

export const REVENUE_DATA: RevenueData[] = [
  { day: "Mon", revenue: 520, appointments: 6 },
  { day: "Tue", revenue: 780, appointments: 9 },
  { day: "Wed", revenue: 640, appointments: 8 },
  { day: "Thu", revenue: 920, appointments: 11 },
  { day: "Fri", revenue: 1100, appointments: 13 },
  { day: "Sat", revenue: 680, appointments: 8 },
  { day: "Sun", revenue: 280, appointments: 3 },
];

export const MONTHLY_REVENUE: RevenueData[] = [
  { day: "Jan", revenue: 8200, appointments: 98 },
  { day: "Feb", revenue: 9100, appointments: 108 },
  { day: "Mar", revenue: 10400, appointments: 124 },
  { day: "Apr", revenue: 9800, appointments: 116 },
  { day: "May", revenue: 11200, appointments: 133 },
  { day: "Jun", revenue: 12100, appointments: 144 },
  { day: "Jul", revenue: 12480, appointments: 148 },
];
