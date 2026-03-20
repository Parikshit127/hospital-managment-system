"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { RefreshCw } from "lucide-react";
import { NotificationBell } from "@/app/components/NotificationBell";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageIcon?: React.ReactNode;
  headerActions?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function AppShell({
  children,
  pageTitle,
  pageIcon,
  headerActions,
  onRefresh,
  refreshing,
}: AppShellProps) {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setSession(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--admin-bg)" }}>
      <Sidebar session={session} />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Header bar */}
        {pageTitle && (
          <header
            className="sticky top-0 z-30 px-5 sm:px-8 lg:px-10 py-3.5 shrink-0"
            style={{
              backgroundColor: "rgba(250, 250, 248, 0.8)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderBottom: "1px solid var(--admin-border)",
            }}
          >
            <div className="flex items-center justify-between max-w-[1360px] mx-auto">
              <div className="flex items-center gap-3.5 pl-10 lg:pl-0">
                {pageIcon && (
                  <div
                    className="p-2 rounded-xl text-white shadow-md"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--admin-primary), var(--admin-primary-dark))",
                      boxShadow: "0 4px 12px var(--admin-primary-10)",
                    }}
                  >
                    {pageIcon}
                  </div>
                )}
                <div>
                  <h1
                    className="text-lg font-extrabold tracking-tight"
                    style={{ color: "var(--admin-text)" }}
                  >
                    {pageTitle}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 border border-transparent hover:border-gray-200"
                    style={{ color: "var(--admin-text-muted)" }}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                )}
                {session?.id && <NotificationBell userId={session.id} />}
                {headerActions}
              </div>
            </div>
          </header>
        )}

        {/* Page content */}
        <main className="flex-1">
          <div className="max-w-[1360px] mx-auto px-5 sm:px-8 lg:px-10 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
