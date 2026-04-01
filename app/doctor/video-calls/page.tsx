import { requireTenantContext } from "@/backend/tenant";
import { redirect } from "next/navigation";
import { Sidebar } from "@/app/components/layout/Sidebar";
import DoctorVideoCallsClient from "./DoctorVideoCallsClient";

export const dynamic = "force-dynamic";

export default async function DoctorVideoCallsPage() {
    // Server-side: get session + data in ONE step — no client-side waterfall
    let ctx;
    try {
        ctx = await requireTenantContext();
    } catch {
        redirect("/login");
    }

    const { db, session } = ctx!;

    if (session.role !== "doctor") {
        redirect("/login");
    }

    // Fetch all video call requests on the server
    const model = (db.videoCallRequest || (db as any).VideoCallRequest);
    let requests: any[] = [];
    try {
        requests = await model.findMany({
            where: { doctor_id: session.id },
            include: {
                patient: {
                    select: {
                        full_name: true,
                        patient_id: true,
                        phone: true,
                    }
                }
            },
            orderBy: { request_date: "desc" },
            take: 30,
        });
    } catch (err) {
        console.error("[VideoCallsPage] Failed to fetch requests:", err);
    }

    // Serialize for client (dates → strings)
    const serialized = requests.map((r: any) => ({
        ...r,
        request_date: r.request_date?.toISOString?.() || r.request_date,
        scheduled_at: r.scheduled_at?.toISOString?.() || r.scheduled_at || null,
    }));

    const sessionForClient = {
        id: session.id,
        username: session.username,
        name: session.name,
        role: session.role,
        specialty: session.specialty,
        organization_name: session.organization_name,
        organization_slug: session.organization_slug,
    };

    return (
        <div className="flex min-h-screen bg-[#F8FAFC]">
            <Sidebar session={sessionForClient} />
            <DoctorVideoCallsClient session={sessionForClient} initialData={serialized} />
        </div>
    );
}
