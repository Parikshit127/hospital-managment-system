import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { validateServerEnv } from "@/app/lib/env";

validateServerEnv();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (staff)
const PATIENT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (patient)

// Route -> allowed roles (backward-compatible flat role check)
const ROLE_ROUTES: Record<string, string[]> = {
  "/admin": ["admin"],
  "/doctor": ["admin", "doctor"],
  "/reception": ["admin", "receptionist"],
  "/lab": ["admin", "lab_technician"],
  "/pharmacy": ["admin", "pharmacist"],
  "/finance": ["admin", "finance"],
  "/ipd": ["admin", "ipd_manager"],
  "/discharge": ["admin", "ipd_manager", "doctor"],
  "/opd": ["admin", "receptionist", "doctor", "opd_manager"],
  "/insurance": ["admin", "finance", "ipd_manager"],
  // Phase 3 roles
  "/nurse": ["admin", "nurse"],
  "/opd-manager": ["admin", "opd_manager"],
  "/hr": ["admin", "hr"],
  // Phase 2 — OT module
  "/ot": ["admin", "ot_manager", "doctor", "nurse"],
  // Phase 3 — Emergency module
  "/er": ["admin", "er_staff", "doctor", "nurse"],
  // Master Billing — orchestrates across reception, ipd, finance, admin
  "/billing": ["admin", "finance", "ipd_manager", "receptionist", "opd_manager"],
};

// Route -> required module permission (granular permission check)
// When a custom role system is used, this takes precedence over ROLE_ROUTES
const PERMISSION_ROUTES: Record<string, string> = {
  "/admin": "admin.view",
  "/doctor": "opd.view",
  "/reception": "opd.view",
  "/lab": "lab.view",
  "/pharmacy": "pharmacy.view",
  "/finance": "finance.view",
  "/ipd": "ipd.view",
  "/discharge": "ipd.view",
  "/opd": "opd.view",
  "/insurance": "insurance.view",
  "/nurse": "ipd.view",
  "/opd-manager": "opd.view",
  "/hr": "hr.view",
  "/ot": "ot.view",
  "/er": "er.view",
  "/billing": "billing.view",
};

// System role -> permission map (mirrors session.ts SYSTEM_ROLE_PERMISSIONS)
// Kept minimal here for Edge runtime compatibility
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["opd.view", "ipd.view", "lab.view", "pharmacy.view", "finance.view", "insurance.view", "hr.view", "admin.view", "reports.view", "ot.view", "er.view", "billing.view"],
  doctor: ["opd.view", "ipd.view", "lab.view", "pharmacy.view", "finance.view", "insurance.view", "reports.view", "ot.view", "er.view"],
  receptionist: ["opd.view", "ipd.view", "finance.view", "insurance.view", "reports.view", "billing.view"],
  lab_technician: ["lab.view", "reports.view"],
  pharmacist: ["pharmacy.view", "reports.view"],
  finance: ["finance.view", "insurance.view", "reports.view", "billing.view"],
  ipd_manager: ["ipd.view", "opd.view", "lab.view", "pharmacy.view", "finance.view", "reports.view", "ot.view", "billing.view", "insurance.view"],
  nurse: ["ipd.view", "opd.view", "lab.view", "pharmacy.view", "reports.view", "ot.view", "er.view"],
  opd_manager: ["opd.view", "lab.view", "pharmacy.view", "finance.view", "reports.view", "billing.view"],
  hr: ["hr.view", "reports.view"],
  ot_manager: ["ot.view", "ipd.view", "pharmacy.view", "reports.view"],
  er_staff: ["er.view", "ipd.view", "lab.view", "pharmacy.view", "reports.view"],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route handlers apply their own auth checks for these endpoints.
  if (
    // Cron jobs authenticate via CRON_SECRET bearer token in the route handler
    // itself — bypassing the session-cookie gate here is safe and necessary so
    // the scheduler (Vercel cron / external) is not redirected to /login.
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/reports/") ||
    pathname.startsWith("/api/invoice/") ||
    pathname.startsWith("/api/discharge/") ||
    pathname.startsWith("/api/razorpay/") ||
    pathname.startsWith("/api/verify-lab-pharmacy") ||
    pathname.startsWith("/api/zealthix/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/patient/self-register") ||
    // Track B & Track A API routes for AI voice booking / registration
    pathname.startsWith("/api/voice/") ||
    pathname.startsWith("/api/organisations") ||
    pathname.startsWith("/api/doctors/") ||
    pathname.startsWith("/api/appointments") ||
    pathname.startsWith("/api/notifications/")
  ) {
    return NextResponse.next();
  }

  // 1. Super Admin routes — separate auth
  if (pathname.startsWith("/superadmin")) {
    const isLoginPage = pathname === "/superadmin/login";
    const saSession = request.cookies.get("superadmin_session");

    if (!saSession && !isLoginPage) {
      return NextResponse.redirect(new URL("/superadmin/login", request.url));
    }
    if (saSession && isLoginPage) {
      try {
        await jwtVerify(saSession.value, JWT_SECRET);
        return NextResponse.redirect(new URL("/superadmin", request.url));
      } catch {
        const response = NextResponse.next();
        response.cookies.delete("superadmin_session");
        return response;
      }
    }
    if (saSession && !isLoginPage) {
      try {
        await jwtVerify(saSession.value, JWT_SECRET);
        return NextResponse.next();
      } catch {
        const response = NextResponse.redirect(
          new URL("/superadmin/login", request.url),
        );
        response.cookies.delete("superadmin_session");
        return response;
      }
    }
    return NextResponse.next();
  }

  // 2. Patient portal — separate auth
  if (pathname.startsWith("/patient")) {
    // Add this safety redirect for the bare '/patient' route
    if (pathname === "/patient") {
      return NextResponse.redirect(new URL("/patient/dashboard", request.url));
    }

    const isPatientAuthPage =
      pathname.startsWith("/patient/login") ||
      pathname.startsWith("/patient/setup-password") ||
      pathname.startsWith("/patient/forgot-password") ||
      pathname.startsWith("/patient/register") ||
      pathname.startsWith("/patient/organisations");

    // Allow public assessment pages without auth
    if (pathname.startsWith("/patient/assessment/")) {
      return NextResponse.next();
    }

    // Token-bearing email links (set / reset password) must ALWAYS be reachable,
    // even when a (possibly stale) patient_session cookie is present. Otherwise
    // the "if on auth page AND logged in → redirect to dashboard" rule below
    // would bounce the patient to whichever account is currently logged in on
    // this browser, instead of showing the "Create new password" form for the
    // token in the link.
    if (
      pathname.startsWith("/patient/setup-password") ||
      pathname.startsWith("/patient/forgot-password")
    ) {
      return NextResponse.next();
    }

    const patientSession = request.cookies.get("patient_session");

    if (!isPatientAuthPage && !patientSession) {
      return NextResponse.redirect(new URL("/patient/login", request.url));
    }
    if (isPatientAuthPage && patientSession) {
      // Verify JWT before redirecting — stale/invalid cookie should not block login
      try {
        await jwtVerify(patientSession.value, JWT_SECRET);
        return NextResponse.redirect(
          new URL("/patient/dashboard", request.url),
        );
      } catch {
        // Invalid JWT — clear it and let them stay on auth page
        const resp = NextResponse.next();
        resp.cookies.delete("patient_session");
        resp.cookies.delete("patient_last_activity");
        return resp;
      }
    }
    if (isPatientAuthPage && !patientSession) {
      return NextResponse.next();
    }

    // Authenticated patient — verify JWT + inactivity timeout
    try {
      await jwtVerify(patientSession!.value, JWT_SECRET);

      // Check inactivity timeout (30 min)
      const lastActivity = request.cookies.get("patient_last_activity");
      if (lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity.value);
        if (elapsed > PATIENT_SESSION_TIMEOUT_MS) {
          const resp = NextResponse.redirect(
            new URL("/patient/login?reason=timeout", request.url),
          );
          resp.cookies.delete("patient_session");
          resp.cookies.delete("patient_last_activity");
          return resp;
        }
      }

      // Update last activity
      const resp = NextResponse.next();
      resp.cookies.set("patient_last_activity", Date.now().toString(), {
        httpOnly: true,
        secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") ?? false,
        sameSite: "lax",
      });
      return resp;
    } catch {
      // Invalid JWT — redirect to login
      const resp = NextResponse.redirect(
        new URL("/patient/login", request.url),
      );
      resp.cookies.delete("patient_session");
      resp.cookies.delete("patient_last_activity");
      return resp;
    }
  }

  // 3. Dev Admin / Developer portal — standalone auth realm.
  // This realm authenticates against its OWN `dev_portal_session` cookie and is
  // fully guarded by app/dev-portal/(protected)/layout.tsx plus the action-level
  // requireDevAdmin()/requireDeveloper() checks. The global staff guard below must
  // NOT touch it — otherwise /dev-portal/login (which has no staff `session`
  // cookie and isn't the exact "/login" path) gets bounced to /login.
  if (pathname.startsWith("/dev-portal")) {
    return NextResponse.next();
  }

  // 3.5. Investor portal — standalone auth realm.
  // Authenticates against its OWN `investor_session` cookie and is guarded by app/investor/layout.tsx.
  if (pathname.startsWith("/investor") || pathname.startsWith("/login/investor")) {
    return NextResponse.next();
  }

  // 4. Public pages (no auth required)

  if (pathname === "/opd/display" || pathname.startsWith("/hospital")) {
    return NextResponse.next();
  }

  // 4. Staff auth
  const session = request.cookies.get("session");
  const isAuthPage = pathname === "/login";

  if (!session && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!session && isAuthPage) {
    return NextResponse.next();
  }

  // 5. Verify JWT
  try {
    const { payload } = await jwtVerify(session!.value, JWT_SECRET);

    // If logged in and trying to access login page, redirect to dashboard
    if (isAuthPage) {
      const role = payload.role as string;
      const redirectMap: Record<string, string> = {
        receptionist: "/reception",
        doctor: "/doctor/dashboard",
        lab_technician: "/lab/technician",
        pharmacist: "/pharmacy/billing",
        admin: "/admin/dashboard",
        finance: "/finance/dashboard",
        ipd_manager: "/ipd",
        nurse: "/nurse/dashboard",
        opd_manager: "/opd-manager/dashboard",
        hr: "/hr/dashboard",
        ot_manager: "/ot/dashboard",
        er_staff: "/er/dashboard",
      };
      return NextResponse.redirect(
        new URL(redirectMap[role] || "/", request.url),
      );
    }

    // 6. Role + permission-based route protection
    const userRole = payload.role as string;
    for (const [routePrefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
      if (pathname.startsWith(routePrefix)) {
        // First check flat role list (backward compatible)
        if (allowedRoles.includes(userRole)) break;

        // Then check granular permissions for the route
        const requiredPermission = PERMISSION_ROUTES[routePrefix];
        if (requiredPermission) {
          const userPerms = ROLE_PERMISSIONS[userRole] || [];
          if (userPerms.includes(requiredPermission)) break;
        }

        // Neither role nor permission matched — unauthorized
        return NextResponse.redirect(
          new URL("/login?reason=unauthorized", request.url),
        );
      }
    }

    // 7. Session timeout check
    const lastActivity = request.cookies.get("last_activity");
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity.value);
      if (elapsed > SESSION_TIMEOUT_MS) {
        const response = NextResponse.redirect(
          new URL("/login?reason=timeout", request.url),
        );
        response.cookies.delete("session");
        response.cookies.delete("last_activity");
        return response;
      }
    }

    // 8. Update last activity
    const response = NextResponse.next();
    response.cookies.set("last_activity", Date.now().toString(), {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") ?? false,
      sameSite: "lax",
    });
    return response;
  } catch {
    // Invalid JWT — clear and redirect
    if (isAuthPage) return NextResponse.next();
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    response.cookies.delete("last_activity");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/razorpay/webhook|api/session|api/org-lookup|api/health|api/test-whatsapp|api/webhooks/whatsapp).*)",
  ],
};