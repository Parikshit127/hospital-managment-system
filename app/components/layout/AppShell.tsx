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
    <div className="min-h-screen bg-gray-50">
      <Sidebar session={session} />

      {/* Main content area — offset by sidebar width */}
      <div className="lg:pl-(--sidebar-offset) min-h-screen flex flex-col">
        {/* Header bar */}
        {pageTitle && (
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 pl-10 lg:pl-0">
                {pageIcon && (
                  <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/20">
                    {pageIcon}
                  </div>
                )}
                <div>
                  <h1 className="text-lg font-black text-gray-900">
                    {pageTitle}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
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
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
