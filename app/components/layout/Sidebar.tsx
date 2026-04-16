"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  UserPlus,
  Brain,
  FlaskConical,
  Pill,
  Bed,
  DollarSign,
  FileText,
  Activity,
  Menu,
  X,
  LogOut,
  HeartPulse,
  ClipboardList,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Building2,
  CalendarDays,
  ListOrdered,
  MonitorPlay,
  CalendarClock,
  FileStack,
  UserCheck,
  BarChart3,
  Package,
  ShoppingCart,
  Truck,
  RotateCcw,
  BedDouble,
  UtensilsCrossed,
  ClipboardCheck,
  PieChart,
  Syringe,
  ScrollText,
  CalendarPlus,
  MessageSquare,
  Settings,
  LayoutGrid,
  Wallet,
  Undo2,
  CreditCard,
  Banknote,
  Bell,
  Clock,
  ArrowLeftRight,
  Briefcase,
  CalendarCheck,
  Timer,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_BY_ROLE: Record<string, NavSection[]> = {
  admin: [
    {
      title: "Overview",
      items: [
        { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      title: "Modules",
      items: [
        { label: "OPD", href: "/admin/opd", icon: Stethoscope },
        { label: "IPD", href: "/admin/ipd", icon: Bed },
        { label: "Lab", href: "/admin/lab", icon: FlaskConical },
        { label: "Finance", href: "/admin/finance", icon: DollarSign },
        { label: "Master Billing", href: "/admin/billing", icon: FileText },
        { label: "HR", href: "/admin/hr", icon: Briefcase },
      ],
    },
    {
      title: "People",
      items: [
        { label: "Staff & Users", href: "/admin/staff", icon: Users },
        { label: "Doctors", href: "/admin/doctors", icon: Stethoscope },
        { label: "Departments", href: "/admin/departments", icon: Building2 },
        { label: "Patients", href: "/admin/patients", icon: Users },
      ],
    },
    {
      title: "System",
      items: [
        { label: "Settings", href: "/admin/settings", icon: Settings },
        { label: "Reports", href: "/admin/reports", icon: BarChart3 },
        { label: "Audit Trail", href: "/admin/audit", icon: Activity },
        { label: "Data Import", href: "/admin/data-import", icon: Package },
      ],
    },
  ],
  doctor: [
    {
      title: "Clinical",
      items: [
        { label: "Dashboard", href: "/doctor/overview", icon: LayoutDashboard },
        { label: "My Patients", href: "/doctor/dashboard", icon: Stethoscope },
        { label: "Video Consultations", href: "/doctor/video-calls", icon: MonitorPlay },
        { label: "Schedule", href: "/doctor/schedule", icon: CalendarClock },
        { label: "Templates", href: "/doctor/templates", icon: FileStack },
        { label: "Follow-Ups", href: "/doctor/follow-ups", icon: UserCheck },
      ],
    },
  ],

  receptionist: [
    {
      title: "Front Desk",
      items: [
        { label: "Dashboard", href: "/reception/dashboard", icon: LayoutDashboard },
        { label: "Patient List", href: "/reception", icon: Users },
        { label: "Register Patient", href: "/reception/register", icon: UserPlus },
        { label: "Finance & Config", href: "/reception/finance", icon: DollarSign },
        { label: "Corporates", href: "/reception/finance/corporates", icon: Building2 },
        { label: "TPA / Insurance", href: "/reception/finance/tpa-insurance", icon: ShieldCheck },
        { label: "Generate Receipt", href: "/reception/fees", icon: FileText },
        { label: "Master Billing", href: "/reception/billing", icon: CreditCard },
        { label: "Patient History", href: "/reception/history", icon: Clock },
      ],
    },
    {
      title: "Queue & Triage",
      items: [
        { label: "Queue Management", href: "/reception/queue", icon: ListOrdered },
        { label: "Token Display", href: "/reception/token-display", icon: MonitorPlay },
        { label: "AI Triage", href: "/reception/triage", icon: Brain },
      ],
    },
    {
      title: "Overview",
      items: [
        { label: "OPD Overview", href: "/opd", icon: ClipboardList },
      ],
    },
  ],
  lab_technician: [
    {
      title: "Laboratory",
      items: [
        { label: "Dashboard", href: "/lab/dashboard", icon: LayoutDashboard },
        { label: "Worklist", href: "/lab/worklist", icon: ClipboardCheck },
        { label: "Lab Orders", href: "/lab/technician", icon: FlaskConical },
        { label: "Inventory", href: "/lab/inventory", icon: Package },
        { label: "Reports", href: "/lab/reports", icon: BarChart3 },
      ],
    },
  ],
  pharmacist: [
    {
      title: "Pharmacy",
      items: [
        { label: "Dashboard", href: "/pharmacy/dashboard", icon: LayoutDashboard },
        { label: "Orders", href: "/pharmacy/orders", icon: ScrollText },
        { label: "Dispensing", href: "/pharmacy/billing", icon: Pill },
      ],
    },
    {
      title: "Inventory",
      items: [
        { label: "Stock", href: "/pharmacy/inventory", icon: Package },
        { label: "Purchase Orders", href: "/pharmacy/purchase-orders", icon: ShoppingCart },
        { label: "Suppliers", href: "/pharmacy/suppliers", icon: Truck },
        { label: "Returns", href: "/pharmacy/returns", icon: RotateCcw },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "Pharmacy Reports", href: "/pharmacy/reports", icon: BarChart3 },
      ],
    },
  ],
  finance: [
    {
      title: "Finance",
      items: [
        { label: "Dashboard", href: "/finance/dashboard", icon: DollarSign },
        { label: "All Invoices", href: "/finance/invoices", icon: FileText },
        { label: "Payment Ledger", href: "/finance/payments", icon: CreditCard },
        { label: "Expenses", href: "/finance/expenses", icon: Banknote },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Vendors", href: "/finance/vendors", icon: Truck },
        { label: "Cash Closure", href: "/finance/cash-closure", icon: Wallet },
        { label: "Refunds", href: "/finance/refunds", icon: Undo2 },
        { label: "Deposits", href: "/finance/deposits", icon: Wallet },
        { label: "Credit Notes", href: "/finance/credit-notes", icon: FileText },
      ],
    },
    {
      title: "Analytics",
      items: [
        { label: "TPA / Insurance", href: "/insurance", icon: ShieldCheck },
        { label: "Revenue Analytics", href: "/finance/revenue", icon: PieChart },
        { label: "Financial Reports", href: "/finance/reports", icon: BarChart3 },
        { label: "Fiscal Periods", href: "/finance/periods", icon: CalendarCheck },
        { label: "Bank Recon", href: "/finance/bank-recon", icon: ArrowLeftRight },
        { label: "Collections", href: "/finance/collections", icon: Bell },
        { label: "Settings", href: "/finance/settings", icon: Settings },
      ],
    },
  ],
  ipd_manager: [
    {
      title: "Inpatient",
      items: [
        { label: "IPD Dashboard", href: "/ipd", icon: Bed },
        { label: "Bed Matrix", href: "/ipd/bed-matrix", icon: BedDouble },
        { label: "Transfer", href: "/ipd/transfer", icon: RotateCcw },
      ],
    },
    {
      title: "Patient Care",
      items: [
        { label: "Nursing Station", href: "/ipd/nursing-station", icon: Syringe },
        { label: "Diet Plans", href: "/ipd/diet", icon: UtensilsCrossed },
        { label: "Ward Rounds", href: "/ipd/ward-rounds", icon: ClipboardCheck },
        { label: "Census", href: "/ipd/census", icon: PieChart },
        { label: "Discharge", href: "/discharge/admin", icon: FileText },
      ],
    },
  ],
  patient: [
    {
      title: "My Health",
      items: [
        { label: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
        { label: "My Profile", href: "/patient/profile", icon: Users },
        { label: "Book Appointment", href: "/patient/appointments/book", icon: CalendarPlus },
      ],
    },
    {
      title: "Records",
      items: [
        { label: "Prescriptions", href: "/patient/prescriptions", icon: Pill },
        { label: "Medical Records", href: "/patient/records", icon: FileText },
        { label: "My Vitals", href: "/patient/vitals", icon: Activity },
        { label: "Provide Feedback", href: "/patient/feedback", icon: MessageSquare },
      ],
    },
  ],
  nurse: [
    {
      title: "Nursing",
      items: [
        { label: "Dashboard", href: "/nurse/dashboard", icon: LayoutDashboard },
        { label: "My Patients", href: "/nurse/patients", icon: Users },
        { label: "Vitals", href: "/nurse/vitals", icon: Activity },
        { label: "Medications", href: "/nurse/medications", icon: Syringe },
        { label: "Tasks", href: "/nurse/tasks", icon: ClipboardCheck },
        { label: "Handover", href: "/nurse/handover", icon: ArrowLeftRight },
      ],
    },
  ],
  opd_manager: [
    {
      title: "OPD Management",
      items: [
        { label: "Dashboard", href: "/opd-manager/dashboard", icon: LayoutDashboard },
        { label: "Live Queues", href: "/opd-manager/queues", icon: ListOrdered },
        { label: "Appointments", href: "/opd-manager/appointments", icon: CalendarCheck },
        { label: "Master Billing", href: "/opd/billing", icon: CreditCard },
        { label: "Reports", href: "/opd-manager/reports", icon: BarChart3 },
      ],
    },
  ],
  hr: [
    {
      title: "HR Management",
      items: [
        { label: "Dashboard", href: "/hr/dashboard", icon: LayoutDashboard },
        { label: "Employees", href: "/hr/employees", icon: Briefcase },
        { label: "Attendance", href: "/hr/attendance", icon: Clock },
        { label: "Leave", href: "/hr/leave", icon: CalendarDays },
        { label: "Shifts", href: "/hr/shifts", icon: Timer },
        { label: "Reports", href: "/hr/reports", icon: BarChart3 },
      ],
    },
  ],
};

interface SidebarProps {
  session: {
    id: string;
    username: string;
    role: string;
    name?: string;
    specialty?: string;
    organization_name?: string;
    organization_slug?: string;
  } | null;
}

const roleLabelMap: Record<string, string> = {
  admin: "Administrator",
  doctor: "Doctor",
  receptionist: "Receptionist",
  lab_technician: "Lab Technician",
  pharmacist: "Pharmacist",
  finance: "Finance",
  ipd_manager: "IPD Manager",
  patient: "Patient Portal",
  nurse: "Nurse",
  opd_manager: "OPD Manager",
  hr: "HR Manager",
};

export function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const savedState = window.localStorage.getItem("sidebar-collapsed");
    if (savedState === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const sections = session ? NAV_BY_ROLE[session.role] || [] : [];
  const orgName = session?.organization_name || "Hospital OS";

  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const longestMatch = allHrefs.reduce((longest, currentHref) => {
    if (pathname === currentHref || pathname.startsWith(currentHref + "/")) {
      return currentHref.length > longest.length ? currentHref : longest;
    }
    return longest;
  }, "");

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === longestMatch) return true;
    return false;
  };

  const sidebarContent = (
    <aside
      className={`${collapsed ? "w-[68px]" : "w-[260px]"} flex flex-col transition-all duration-300 ease-out h-screen sticky top-0 shrink-0`}
      style={{
        backgroundColor: "var(--admin-sidebar-bg)",
        borderRight: "1px solid var(--admin-sidebar-border)",
      }}
    >
      {/* Brand Header */}
      <div
        className="flex items-center gap-3 px-4 h-[60px] shrink-0"
        style={{ borderBottom: "1px solid var(--admin-sidebar-border)" }}
      >
        <div
          className="p-1.5 rounded-lg shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--admin-primary), var(--admin-primary-dark))",
          }}
        >
          <HeartPulse className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-[13px] font-bold text-white truncate tracking-tight">
              {orgName}
            </p>
            <p className="text-[10px] text-gray-500 tracking-wider font-medium">
              {roleLabelMap[session?.role || ""] || "PORTAL"}
            </p>
          </div>
        )}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden ml-auto p-1 text-gray-500 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold px-2.5 mb-1.5">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150 ${active
                      ? "text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]"
                      } ${collapsed ? "justify-center px-2" : ""}`}
                    style={
                      active
                        ? {
                          backgroundColor: "var(--admin-primary-20)",
                          color: "var(--admin-primary-light)",
                        }
                        : undefined
                    }
                  >
                    <Icon className={`h-[16px] w-[16px] shrink-0 ${active ? "" : "opacity-70"}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Info + Logout + Collapse */}
      <div
        className="px-2.5 py-3 space-y-1 shrink-0"
        style={{ borderTop: "1px solid var(--admin-sidebar-border)" }}
      >
        {!collapsed && session && (
          <div className="mb-2 px-2.5">
            <p className="text-xs font-bold text-white/90 truncate">
              {session.name || session.username}
            </p>
            <p className="text-[10px] text-gray-500 font-medium">
              {roleLabelMap[session.role] || session.role}
            </p>
            {session.specialty && (
              <p className="text-[10px] font-medium" style={{ color: "var(--admin-primary)" }}>
                {session.specialty}
              </p>
            )}
          </div>
        )}
        <button
          onClick={() => logout()}
          title={collapsed ? "Logout" : undefined}
          className={`flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-150 ${collapsed ? "justify-center px-2" : ""
            }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`hidden lg:flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-150 ${collapsed ? "justify-center px-2" : ""
            }`}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronLeft className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white rounded-xl shadow-md border border-gray-200/60 text-gray-600 hover:bg-gray-50 transition-all"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          style={{ animation: "fadeIn 0.15s ease-out" }}
        />
      )}

      {/* Desktop: always visible */}
      <div className="hidden lg:block">{sidebarContent}</div>

      {/* Mobile: slide-in */}
      <div
        className={`lg:hidden fixed top-0 left-0 h-screen z-50 transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
