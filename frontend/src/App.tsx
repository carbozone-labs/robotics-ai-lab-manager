import { Suspense, lazy, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, Boxes, CalendarCheck, CalendarClock, CalendarDays, ClipboardList, Cpu, Database, FileDown, GraduationCap, Layers, LayoutDashboard,
  LogOut, Menu, Monitor, QrCode, PackageCheck, PackagePlus, Package, Settings as Cog, Share2, Undo2, UserSquare, Users, Wrench, X, Download } from "lucide-react";
import { api, setToken, getToken, login, User } from "./api";
import { Field, Spinner, useToast } from "./ui";
import { Dock, LiquidBackground, useGlassPointer } from "./liquid";
import Dashboard from "./pages/Dashboard";
const IssueEquipment = lazy(() => import("./pages/IssueEquipment"));
const Register = lazy(() => import("./pages/Register"));
const Returns = lazy(() => import("./pages/Returns"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Students = lazy(() => import("./pages/Students"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Teachers = lazy(() => import("./pages/Teachers"));
const Timetable = lazy(() => import("./pages/Timetable"));
const TeacherTimetable = lazy(() => import("./pages/TeacherTimetable"));
const Assets = lazy(() => import("./pages/Assets"));
const Computers = lazy(() => import("./pages/Computers"));
const Labels = lazy(() => import("./pages/Labels"));
const Scan = lazy(() => import("./pages/Scan"));
const Allocations = lazy(() => import("./pages/Allocations"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const Batches = lazy(() => import("./pages/Batches"));
const Divisions = lazy(() => import("./pages/Divisions"));
const Reports = lazy(() => import("./pages/Reports"));
const ExportCsv = lazy(() => import("./pages/ExportCsv"));
const DataManagement = lazy(() => import("./pages/DataManagement"));
const SettingsPage = lazy(() => import("./pages/Settings"));

type Item = [string, string, any, boolean?];     // path, label, icon, adminOnly
const NAV: [string, Item[]][] = [
  ["Dashboard", [["/", "Overview", LayoutDashboard]]],
  ["Student Management", [["/students", "Students", GraduationCap], ["/batches", "Batches", Layers], ["/divisions", "Divisions", Users], ["/attendance", "Attendance", CalendarCheck], ["/reports/attendance", "Attendance Reports", Activity]]],
  ["Staff Management", [["/teachers", "Teachers", UserSquare], ["/teacher-timetable", "Teacher Timetable", CalendarDays]]],
  ["Lab Management", [["/timetable", "Lab Timetable", CalendarClock], ["/assets", "Lab Assets", Cpu], ["/computers", "Computer Systems", Monitor], ["/labels", "QR Labels", QrCode], ["/allocations", "Equipment Allocation", Share2], ["/maintenance", "Maintenance Register", Wrench]]],
  ["Inventory Management", [["/inventory", "Inventory", Boxes], ["/issue", "Issue Items", PackagePlus], ["/returns", "Return Items", PackageCheck], ["/register", "Issue History", ClipboardList]]],
  ["Reports", [["/reports/issue", "Issue Reports", BarChart3], ["/reports/return", "Return Reports", Undo2], ["/reports/assets", "Asset Reports", Package], ["/reports/maintenance", "Maintenance Reports", AlertTriangle]]],
  ["Settings", [["/export", "CSV Export", FileDown], ["/data", "Data Management", Database, true], ["/settings", "Application Settings", Cog, true]]],
];

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    try {
      onLogin(await login(u, p));
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LiquidBackground />
      <div className="card w-full max-w-sm space-y-4 !p-6">
        <div className="flex items-center gap-3"><div className="live flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300"><Cpu /></div>
          <div><h1 className="text-lg font-semibold text-slate-50">Robotics &amp; AI Lab</h1><p className="text-xs text-slate-400">Laboratory Management System</p></div></div>
        <Field label="Username"><input className="input" value={u} onChange={(e) => setU(e.target.value)} autoFocus /></Field>
        <Field label="Password"><input className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="btn w-full" onClick={submit}>Sign in</button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!getToken());
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [installEvt, setInstallEvt] = useState<any>(null);          // Android/Chrome "Install app" prompt
  useGlassPointer();
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h); window.addEventListener("appinstalled", () => setInstallEvt(null));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  useEffect(() => { if (getToken()) api("/api/auth/me").then(setUser).catch(() => setToken(null)).finally(() => setReady(true)); }, []);
  if (!ready) return <><LiquidBackground /><Spinner /></>;
  if (!user) return <Login onLogin={setUser} />;
  const admin = user.role === "admin";
  return (
    <div className="min-h-screen text-slate-200 md:flex">
      <LiquidBackground />
      {open && <div className="no-print fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`${open ? "block" : "hidden"} no-print fixed inset-y-0 left-0 z-30 w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-slate-950/60 p-3 backdrop-blur-2xl md:sticky md:top-0 md:block md:h-screen`}>
        <div className="flex items-center justify-between px-2 py-3">
          <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-cyan-300"><Cpu size={18} /></div>
            <div className="leading-tight"><div className="text-sm font-semibold text-slate-50">Robotics &amp; AI Lab</div><div className="text-[10px] uppercase tracking-widest text-cyan-400/70">Control panel</div></div></div>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="space-y-4 pb-6">
          {NAV.map(([group, items]) => {
            const shown = items.filter(([, , , adminOnly]) => admin || !adminOnly);
            return (
              <div key={group}>
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">{group}</div>
                {shown.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end onClick={() => setOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg border-l-2 px-3 py-1.5 text-sm transition ${isActive ? "border-cyan-400 bg-cyan-400/10 text-cyan-200" : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"}`}>
                    <Icon size={16} />{label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/45 px-4 pb-2.5 backdrop-blur-2xl" style={{ paddingTop: "calc(.625rem + env(safe-area-inset-top, 0px))" }}>
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu /></button>
          <span className="hidden text-sm text-slate-400 md:block">{user.full_name || user.username} &middot; {user.role.replace("_", " ")}</span>
          <div className="flex items-center gap-2">
            {installEvt && <button className="btn" onClick={async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); setInstallEvt(null); }}><Download size={16} />Install app</button>}
            <button className="btn-ghost" onClick={() => { setToken(null); setUser(null); toast("ok", "Signed out"); }}><LogOut size={16} />Sign out</button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-3 pb-28 md:p-6">
          <Suspense fallback={<Spinner />}><Routes>
            <Route path="/" element={<Dashboard name={user.full_name || user.username} />} />
            <Route path="/students" element={<Students admin={admin} />} /><Route path="/batches" element={<Batches />} /><Route path="/divisions" element={<Divisions />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/teachers" element={<Teachers />} /><Route path="/teacher-timetable" element={<TeacherTimetable />} />
            <Route path="/timetable" element={<Timetable />} /><Route path="/assets" element={<Assets />} />
            <Route path="/computers" element={<Computers />} /><Route path="/labels" element={<Labels />} /><Route path="/scan/:code" element={<Scan />} />
            <Route path="/allocations" element={<Allocations />} /><Route path="/maintenance" element={<Maintenance />} />
            <Route path="/inventory" element={<Inventory admin={admin} />} /><Route path="/issue" element={<IssueEquipment />} />
            <Route path="/returns" element={<Returns />} /><Route path="/register" element={<Register />} />
            <Route path="/reports/:group" element={<Reports />} /><Route path="/reports" element={<Navigate to="/reports/issue" />} />
            <Route path="/export" element={<ExportCsv />} />
            <Route path="/data" element={admin ? <DataManagement /> : <Navigate to="/" />} />
            <Route path="/import-export" element={admin ? <DataManagement /> : <Navigate to="/" />} />
            <Route path="/settings" element={admin ? <SettingsPage /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes></Suspense>
        </main>
      </div>
      <Dock onMenu={() => setOpen(true)} items={[{ to: "/", label: "Home", icon: LayoutDashboard }, { to: "/issue", label: "Issue", icon: PackagePlus }, { to: "/returns", label: "Return", icon: PackageCheck }, { to: "/attendance", label: "Attend", icon: CalendarCheck }]} />
    </div>
  );
}
