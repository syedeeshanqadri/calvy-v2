export type AppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed" | "no-show";
export type UserRole = "admin" | "staff" | "client";
export type ServiceCategory = "haircare" | "skincare" | "wellness" | "fitness" | "medical" | "consulting" | "other";

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number; // minutes
  price: number;
  category: ServiceCategory;
  color: string;
  staffIds: string[];
  isActive: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  avatar?: string;
  color: string;
  services: string[];
  workingHours: WorkingHours;
  isActive: boolean;
  appointmentsToday: number;
  totalRevenue: number;
}

export interface WorkingHours {
  [day: string]: { start: string; end: string; isWorking: boolean };
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  totalAppointments: number;
  totalSpent: number;
  lastVisit?: string;
  notes?: string;
  createdAt: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  status: AppointmentStatus;
  notes?: string;
  color: string;
  createdAt: string;
}

export interface DashboardStats {
  todayAppointments: number;
  todayRevenue: number;
  newClientsThisWeek: number;
  showUpRate: number;
  monthlyRevenue: number;
  totalClients: number;
  pendingAppointments: number;
  completedToday: number;
}

export interface RevenueData {
  day: string;
  revenue: number;
  appointments: number;
}
