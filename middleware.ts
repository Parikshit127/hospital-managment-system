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
  "/insurance": ["admin", "finance"],
  // Phase 3 roles
  "/nurse": ["admin", "nurse"],
  "/opd-manager": ["admin", "opd_manager"],
  "/hr": ["admin", "hr"],
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
};

// System role -> permission map (mirrors session.ts SYSTEM_ROLE_PERMISSIONS)
// Kept minimal here for Edge runtime compatibility
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["opd.view", "ipd.view", "lab.view", "pharmacy.view", "finance.view", "insurance.view", "hr.view", "admin.view", "reports.view"],
  doctor: ["opd.view", "ipd.view", "lab.view", "pharmacy.view", "finance.view", "insurance.view", "reports.view"],
  receptionist: ["opd.view", "ipd.view", "finance.view", "insurance.view", "reports.view"],
  lab_technician: ["lab.view", "reports.view"],
  pharmacist: ["pharmacy.view", "reports.view"],
  finance: ["finance.view", "insurance.view", "reports.view"],
  ipd_manager: ["ipd.view", "opd.view", "lab.view", "pharmacy.view", "finance.view", "reports.view"],
  nurse: ["ipd.view", "opd.view", "lab.view", "pharmacy.view", "reports.view"],
  opd_manager: ["opd.view", "lab.view", "pharmacy.view", "finance.view", "reports.view"],
  hr: ["hr.view", "reports.view"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route handlers apply their own auth checks for these endpoints.
  if (
    pathname.startsWith("/api/reports/") ||
    pathname.startsWith("/api/invoice/") ||
    pathname.startsWith("/api/discharge/") ||
    pathname.startsWith("/api/razorpay/") ||
    pathname.startsWith("/api/verify-lab-pharmacy")
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
    const isPatientAuthPage =
      pathname.startsWith("/patient/login") ||
      pathname.startsWith("/patient/setup-password") ||
      pathname.startsWith("/patient/forgot-password");
    // Allow public assessment pages without auth
    if (pathname.startsWith("/patient/assessment/")) {
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
        secure: process.env.NODE_ENV === "production",
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

  // 3. Public pages (no auth required)
  if (pathname === "/opd/display") {
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
      secure: process.env.NODE_ENV === "production",
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
    "/((?!_next/static|_next/image|favicon.ico|api/razorpay/webhook|api/session|api/org-lookup|api/health).*)",
  ],
};
