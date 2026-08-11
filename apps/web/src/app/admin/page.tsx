"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface Telemetry {
  totalUsers: number;
  activeMatches: number;
  queueLength: number;
  totalReports: number;
  totalBans: number;
}

interface Report {
  id: string;
  reason: string;
  description: string | null;
  createdAt: string;
  reporter: {
    id: string;
    email: string;
    profile: { displayName: string } | null;
  };
  reportedUser: {
    id: string;
    email: string;
    status: string;
    profile: { displayName: string } | null;
  };
}

interface Ban {
  id: string;
  reason: string;
  type: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    profile: { displayName: string } | null;
  };
}

export default function AdminDashboardPage() {
  const [adminSecret, setAdminSecret] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Dashboard Data State
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Ban Dialog State
  const [banTargetId, setBanTargetId] = useState<string | null>(null);
  const [banTargetEmail, setBanTargetEmail] = useState<string>("");
  const [banReason, setBanReason] = useState("");

  // Load secret from localStorage if it exists
  useEffect(() => {
    const saved = localStorage.getItem("pista_admin_secret");
    if (saved) {
      setAdminSecret(saved);
      setIsAuthorized(true);
    }
  }, []);

  // Fetch telemetry, reports, and bans from backend
  const fetchDashboardData = async (secretToUse = adminSecret) => {
    if (!secretToUse) return;
    setError(null);

    try {
      const headers = { "x-admin-secret": secretToUse };

      // 1. Fetch stats
      const telRes = await fetch(`${SERVER_URL}/admin/telemetry`, { headers });
      if (!telRes.ok) throw new Error("Failed to load telemetry stats.");
      const telData = await telRes.json();
      setTelemetry(telData);

      // 2. Fetch reports
      const repRes = await fetch(`${SERVER_URL}/admin/reports`, { headers });
      if (!repRes.ok) throw new Error("Failed to load safety reports.");
      const repData = await repRes.json();
      setReports(repData.reports);

      // 3. Fetch bans
      const banRes = await fetch(`${SERVER_URL}/admin/bans`, { headers });
      if (!banRes.ok) throw new Error("Failed to load banned logs.");
      const banData = await banRes.json();
      setBans(banData.bans);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred loading admin data.");
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchDashboardData();
    }
  }, [isAuthorized]);

  const handleAuthorize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) return;

    localStorage.setItem("pista_admin_secret", secretInput);
    setAdminSecret(secretInput);
    setIsAuthorized(true);
    setAuthError(null);
  };

  const handleLogoutAdmin = () => {
    localStorage.removeItem("pista_admin_secret");
    setAdminSecret("");
    setIsAuthorized(false);
    setSecretInput("");
    setTelemetry(null);
    setReports([]);
    setBans([]);
  };

  // Perform ban action
  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banTargetId || !banReason.trim()) return;
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${SERVER_URL}/admin/ban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ userId: banTargetId, reason: banReason }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to issue ban.");

      setActionSuccess(`Banned account ${banTargetEmail} successfully.`);
      setBanTargetId(null);
      setBanReason("");
      // Refresh
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message || "Unable to ban user.");
    }
  };

  // Perform unban action
  const handleUnban = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to lift the suspension for ${email}?`)) return;
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${SERVER_URL}/admin/unban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to remove ban.");

      setActionSuccess(`Re-activated account ${email}.`);
      // Refresh
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message || "Unable to unban user.");
    }
  };

  if (!isAuthorized) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100 font-sans overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-[400px] bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-indigo-600/10 via-zinc-950/0 to-zinc-950/0 pointer-events-none z-0" />
        
        <div className="relative w-full max-w-md space-y-8 rounded-3xl border border-zinc-900 bg-zinc-900/35 backdrop-blur-md p-8 sm:p-10 shadow-2xl z-10">
          <div className="text-center space-y-3">
            <Link href="/" className="inline-flex items-center gap-2 group">
              <span className="text-2xl font-black tracking-widest text-indigo-500 group-hover:text-indigo-400 transition-colors">
                PISTA
              </span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold text-indigo-400 border border-indigo-500/20">
                ADMIN
              </span>
            </Link>
            <h2 className="text-2xl font-black tracking-wide text-white">Portal Authorization</h2>
            <p className="text-xs text-zinc-400">
              Provide your telemetry administrative key to manage reports
            </p>
          </div>

          {authError && (
            <div className="rounded-xl bg-red-950/40 border border-red-900/40 p-3.5 text-xs text-red-300 text-center font-medium">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthorize} className="space-y-5">
            <div>
              <label htmlFor="secret" className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5 px-1">
                Admin Secret Key
              </label>
              <input
                id="secret"
                type="password"
                required
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
                placeholder="Enter administrative token"
              />
            </div>

            <button
              type="submit"
              className="flex w-full justify-center items-center rounded-xl bg-indigo-600 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/10"
            >
              Authorize Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-6 md:p-10 selection:bg-indigo-600 selection:text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* Top bar header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black tracking-widest text-indigo-500">PISTA</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold text-indigo-400 border border-indigo-500/20">ADMIN PORTAL</span>
            </div>
            <p className="text-xs text-zinc-500">Real-time matchmaking system status and safety moderation log</p>
          </div>
          <button
            onClick={handleLogoutAdmin}
            className="rounded-full border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 px-4.5 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition"
          >
            Lock Dashboard
          </button>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="rounded-2xl bg-red-950/40 border border-red-900/40 p-4 text-xs text-red-300 font-semibold shadow-lg">
            ⚠️ {error}
          </div>
        )}

        {actionSuccess && (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-900/40 p-4 text-xs text-emerald-300 font-semibold shadow-lg">
            ✓ {actionSuccess}
          </div>
        )}

        {/* Telemetry Widgets Grid */}
        {telemetry && (
          <div className="grid gap-5 grid-cols-2 md:grid-cols-5">
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-5 space-y-1.5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total Users</span>
              <span className="block text-xl md:text-2xl font-black text-white">{telemetry.totalUsers}</span>
            </div>
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-5 space-y-1.5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Active Chats</span>
              <span className="block text-xl md:text-2xl font-black text-emerald-500">{telemetry.activeMatches}</span>
            </div>
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-5 space-y-1.5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Users Queueing</span>
              <span className="block text-xl md:text-2xl font-black text-indigo-400">{telemetry.queueLength}</span>
            </div>
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-5 space-y-1.5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Safety Reports</span>
              <span className="block text-xl md:text-2xl font-black text-amber-500">{telemetry.totalReports}</span>
            </div>
            <div className="rounded-2xl border border-zinc-900 bg-zinc-900/10 p-5 space-y-1.5 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Banned Accounts</span>
              <span className="block text-xl md:text-2xl font-black text-red-500">{telemetry.totalBans}</span>
            </div>
          </div>
        )}

        {/* Dashboard contents */}
        <div className="grid gap-8 lg:grid-cols-2">
          
          {/* Left panel: Active Reports logs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">Safety Reports Log</h3>
              <button
                onClick={() => fetchDashboardData()}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
              >
                Refresh Log
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 overflow-hidden min-h-[300px]">
              {reports.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-600">No safety reports recorded.</div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {reports.map((rep) => {
                    const isBanned = rep.reportedUser.status === "BANNED";
                    return (
                      <div key={rep.id} className="p-5 space-y-3 hover:bg-zinc-900/20 transition-colors">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-bold uppercase">
                              {rep.reason}
                            </span>
                            <p className="text-xs text-zinc-300 mt-2 font-medium">
                              Reported: <strong className="text-zinc-100">{rep.reportedUser.email}</strong>
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              Reporter: {rep.reporter.email} ({rep.reporter.profile?.displayName || "Guest"})
                            </p>
                          </div>
                          
                          {/* Quick Ban actions */}
                          {!isBanned ? (
                            <button
                              onClick={() => {
                                setBanTargetId(rep.reportedUser.id);
                                setBanTargetEmail(rep.reportedUser.email);
                              }}
                              className="rounded bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-400 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition"
                            >
                              Ban Account
                            </button>
                          ) : (
                            <span className="text-[10px] font-extrabold uppercase text-red-500 tracking-wider bg-red-950/20 border border-red-900/25 px-2.5 py-1 rounded">
                              Banned
                            </span>
                          )}
                        </div>

                        {rep.description && (
                          <div className="bg-zinc-900/40 rounded-xl p-3 text-[11px] text-zinc-400 leading-relaxed italic border border-zinc-900/60">
                            "{rep.description}"
                          </div>
                        )}

                        <div className="text-[9px] text-zinc-600 text-right">
                          {new Date(rep.createdAt).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Active bans managers */}
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">Banned Accounts Manager</h3>
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 overflow-hidden min-h-[300px]">
              {bans.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-600">No banned user sessions recorded.</div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {bans.map((ban) => (
                    <div key={ban.id} className="p-5 flex justify-between items-center gap-4 hover:bg-zinc-900/20 transition-colors">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-200">{ban.user.email}</p>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          Reason: <span className="text-zinc-400 font-medium">{ban.reason}</span>
                        </p>
                        <p className="text-[9px] text-zinc-600">Banned on {new Date(ban.createdAt).toLocaleDateString()}</p>
                      </div>

                      <button
                        onClick={() => handleUnban(ban.user.id, ban.user.email)}
                        className="rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 px-3 py-1.5 text-[10px] font-bold text-zinc-300 transition"
                      >
                        Unban User
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Ban Reason Popup Modal Dialog */}
      {banTargetId && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-900 bg-zinc-950 p-6 sm:p-8 space-y-6 shadow-2xl relative">
            <div className="space-y-2">
              <h3 className="text-lg font-black tracking-wide text-white">Confirm User Suspension</h3>
              <p className="text-xs text-zinc-400">
                You are issuing a manual system ban for account: <strong className="text-zinc-200">{banTargetEmail}</strong>
              </p>
            </div>

            <form onSubmit={handleBanSubmit} className="space-y-5">
              <div>
                <label htmlFor="reason" className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1.5">
                  Ban Reason / Description
                </label>
                <textarea
                  id="reason"
                  required
                  rows={3}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition"
                  placeholder="e.g. Terms violations, harassment reported during video match"
                />
              </div>

              <div className="flex gap-3 justify-end text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setBanTargetId(null);
                    setBanReason("");
                  }}
                  className="rounded-xl border border-zinc-850 bg-zinc-900/50 px-4 py-2.5 font-bold text-zinc-400 hover:text-zinc-250 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-red-650 hover:bg-red-500 text-white font-black uppercase tracking-wider px-5 py-2.5 transition"
                >
                  Issue Ban
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
