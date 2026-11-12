import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Clock, Cpu, GraduationCap, Monitor, PackageCheck, PackagePlus, RefreshCw, UserSquare, Wrench } from "lucide-react";
import { api } from "../api";
import { Badge, Empty, Section } from "../ui";
import { CountUp, Ring } from "../liquid";

const prioTone: Record<string, string> = { Urgent: "text-red-300", High: "text-orange-300", Medium: "text-amber-300", Low: "text-slate-300" };
const TONE = { cyan: "text-cyan-300", red: "text-red-300", amber: "text-amber-300", green: "text-emerald-300" };
type Tone = keyof typeof TONE;

const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night"; };

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading dashboard">
      <div className="skeleton h-40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="grid gap-4 xl:grid-cols-3"><div className="skeleton h-64 xl:col-span-2" /><div className="skeleton h-64" /></div>
    </div>
  );
}

/** A tappable KPI tile. */
function Tile({ to, icon, label, value, hint, tone = "cyan" }: { to: string; icon: ReactNode; label: string; value: number; hint?: string; tone?: Tone }) {
  return (
    <Link to={to} className="card glass-tile !p-3.5 block">
      <div className="flex items-center justify-between text-slate-400"><span className="text-xs">{label}</span><span className="opacity-70">{icon}</span></div>
      <div className={`mt-1 font-mono text-3xl font-semibold ${TONE[tone]}`}><CountUp value={value} /></div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </Link>
  );
}

/** One list row, used instead of wide tables so it reads well on a phone. */
const Row = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[.03] px-3 py-2 text-sm transition hover:bg-white/[.07]">
    <div className="min-w-0 flex-1">{children}</div>{right && <div className="shrink-0 text-right">{right}</div>}
  </div>
);
const Rows = ({ empty, children, count }: { empty: string; children: ReactNode; count: number }) => count === 0 ? <Empty text={empty} /> : <div className="space-y-1.5">{children}</div>;
const More = ({ to, label }: { to: string; label: string }) => <Link className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline" to={to}>{label}<ArrowRight size={12} /></Link>;

export default function Dashboard({ name = "" }: { name?: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setBusy(true);
    return api("/api/dashboard").then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message || "Could not load the dashboard")).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    load();
    const tick = () => { if (!document.hidden) load(); };           // refresh every minute (keeps "current session" right) and when the tab/app comes back
    const t = setInterval(tick, 60000); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  if (!d) return err
    ? <div className="card space-y-3 text-sm"><div className="flex items-center gap-2 text-red-300"><AlertTriangle size={18} />{err}</div><button className="btn" onClick={load}><RefreshCw size={16} />Try again</button></div>
    : <Skeleton />;

  const s = d.stats;
  const tt: any[] = d.todays_timetable;
  const current = tt.find((r) => r.state === "current");
  const next = tt.find((r) => r.state === "upcoming") || d.upcoming_sessions[0];
  const focus = current || next;
  const other = Math.max(0, s.total_assets - s.available_equipment - s.damaged_equipment);
  const attention: { text: string; to: string; tone: Tone }[] = [];
  if (s.pending_returns) attention.push({ text: `${s.pending_returns} slip${s.pending_returns > 1 ? "s" : ""} waiting for return`, to: "/returns", tone: "amber" });
  if (s.maintenance_requests) attention.push({ text: `${s.maintenance_requests} open maintenance request${s.maintenance_requests > 1 ? "s" : ""}`, to: "/maintenance", tone: "amber" });
  if (s.damaged_equipment) attention.push({ text: `${s.damaged_equipment} damaged equipment unit${s.damaged_equipment > 1 ? "s" : ""}`, to: "/reports/assets", tone: "red" });
  if (d.low_stock.length) attention.push({ text: `${d.low_stock.length} item${d.low_stock.length > 1 ? "s" : ""} low on stock`, to: "/inventory", tone: "red" });
  if (d.warranty_expiring.length) attention.push({ text: `${d.warranty_expiring.length} warranty expiring within 60 days`, to: "/assets", tone: "amber" });
  const dot: Record<Tone, string> = { amber: "bg-amber-300 shadow-[0_0_8px_#fcd34d]", red: "bg-red-400 shadow-[0_0_8px_#f87171]", cyan: "bg-cyan-300", green: "bg-emerald-300" };

  const actions: [string, string, ReactNode][] = [
    ["Issue items", "/issue", <PackagePlus size={22} />], ["Return items", "/returns", <PackageCheck size={22} />],
    ["Attendance", "/attendance", <CalendarCheck size={22} />], ["Report a problem", "/maintenance", <Wrench size={22} />],
  ];

  return (
    <div className="space-y-4">
      {/* hero: greeting + what is happening right now */}
      <div className="card !p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[.2em] text-cyan-300/80">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">{greeting()}{name ? `, ${name.split(" ")[0]}` : ""}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {tt.length ? `${tt.length} practical session${tt.length > 1 ? "s" : ""} today` : "No practical sessions today"} &middot; {attention.length ? `${attention.length} thing${attention.length > 1 ? "s" : ""} need attention` : "everything is in order"}
            </p>
          </div>
          <button className="btn-ghost no-print" onClick={load} disabled={busy} aria-label="Refresh dashboard"><RefreshCw size={15} className={busy ? "animate-spin" : ""} />{err ? "Retry" : "Refresh"}</button>
        </div>
        {err && <p className="mt-2 text-xs text-amber-300">Could not refresh ({err}). Showing the last data.</p>}
        <div className={`mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border px-4 py-3 text-sm ${current ? "live border-cyan-300/50 bg-cyan-400/10" : "border-white/10 bg-white/[.04]"}`}>
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-200"><Clock size={14} />{current ? "Happening now" : next ? "Up next" : "Lab is free"}</span>
          {focus ? (<>
            <span className="font-medium text-slate-50">{focus.subject}</span>
            <span className="text-slate-300">{focus.batch}{focus.division ? ` / ${focus.division}` : ""}</span>
            <span className="font-mono text-cyan-200">{current ? `${current.time_from}-${current.time_to}` : `${next.when ? next.when + " " : ""}${next.time_from}`}</span>
            {focus.teacher_name && <span className="text-slate-400">{focus.teacher_name}</span>}
          </>) : <span className="text-slate-400">No sessions scheduled right now</span>}
        </div>
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {actions.map(([label, to, icon]) => (
          <Link key={to} to={to} className="card glass-tile flex items-center gap-3 !p-3.5 text-sm font-medium text-slate-100"><span className="text-cyan-300">{icon}</span>{label}</Link>
        ))}
      </div>

      {/* equipment health + attention + counts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Equipment health" right={<More to="/reports/assets" label="Asset report" />}>
          <div className="flex items-center gap-5">
            <div role="img" aria-label={`${s.available_equipment} of ${s.total_assets} lab assets available`}>
              <Ring size={128} segs={[{ label: "Available", value: s.available_equipment, color: "#34d399" }, { label: "In use / maintenance", value: other, color: "#22d3ee" }, { label: "Damaged", value: s.damaged_equipment, color: "#f87171" }]}
                center={<CountUp value={s.available_equipment} />} sub={`of ${s.total_assets}`} />
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
              {([["Available", s.available_equipment, "bg-emerald-400"], ["In use / maint.", other, "bg-cyan-400"], ["Damaged", s.damaged_equipment, "bg-red-400"]] as [string, number, string][]).map(([l, v, c]) => (
                <li key={l} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c}`} /><span className="text-slate-300">{l}</span><span className="ml-auto pl-3 font-mono text-slate-100">{v}</span></li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="Needs attention">
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-sm text-emerald-300"><CheckCircle2 size={26} /><div><div className="font-medium">All clear</div><div className="text-xs text-slate-400">No pending returns, repairs or low stock.</div></div></div>
          ) : (
            <div className="space-y-1.5">{attention.map((a) => (
              <Link key={a.text} to={a.to} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[.03] px-3 py-2.5 text-sm transition hover:bg-white/[.08]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[a.tone]}`} /><span className="flex-1 text-slate-200">{a.text}</span><ArrowRight size={14} className="text-slate-500" />
              </Link>))}</div>
          )}
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Tile to="/students" icon={<GraduationCap size={16} />} label="Students" value={s.total_students} />
          <Tile to="/teachers" icon={<UserSquare size={16} />} label="Teachers" value={s.total_teachers} />
          <Tile to="/assets" icon={<Cpu size={16} />} label="Lab assets" value={s.total_assets} hint="units registered" />
          <Tile to="/computers" icon={<Monitor size={16} />} label="Computers" value={s.total_computers} />
          <Tile to="/register" icon={<PackagePlus size={16} />} label="Items issued" value={s.currently_issued} hint="inventory units out" tone={s.currently_issued ? "amber" : "cyan"} />
          <Tile to="/timetable" icon={<CalendarCheck size={16} />} label="Today" value={s.todays_sessions} hint="practical sessions" />
        </div>
      </div>

      {/* timetable + upcoming */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><Section title="Today's lab timetable" right={<More to="/timetable" label="Open timetable" />}>
          {tt.length === 0 ? <Empty text="No practical sessions scheduled for today" /> : (
            <div className="space-y-2">{tt.map((r) => (
              <div key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border px-3 py-2.5 text-sm transition ${r.state === "current" ? "live border-cyan-300/60 bg-cyan-400/10" : r.state === "done" ? "border-white/5 opacity-50" : "border-white/10 bg-white/[.03]"}`}>
                <span className="w-28 font-mono text-cyan-200">{r.time_from} - {r.time_to}</span>
                <span className="font-medium text-slate-100">{r.subject}</span>
                <span className="text-slate-300">{r.batch}{r.division ? ` / ${r.division}` : ""}</span>
                <span className="text-slate-400">{[r.teacher_name, r.lab].filter(Boolean).join(" · ")}</span>
                <span className="ml-auto"><Badge s={r.state === "current" ? "Current" : r.state === "done" ? "Done" : "Upcoming"} /></span>
              </div>))}</div>)}
        </Section></div>
        <Section title="Upcoming practicals">
          <Rows count={d.upcoming_sessions.length} empty="No upcoming sessions">{d.upcoming_sessions.map((r: any, i: number) => (
            <Row key={i} right={<span className="font-mono text-xs text-cyan-200">{r.time_from}</span>}><div className="truncate font-medium text-slate-100">{r.subject}</div><div className="truncate text-xs text-slate-400">{r.when} &middot; {r.batch}</div></Row>))}</Rows>
        </Section>
      </div>

      {/* inventory activity */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Recent issues" right={<More to="/register" label="History" />}>
          <Rows count={d.recent_issues.length} empty="No items issued yet">{d.recent_issues.map((r: any) => (
            <Row key={r.slip_no} right={<div><Badge s={r.status} /><div className="mt-0.5 text-[11px] text-slate-500">{r.date}</div></div>}>
              <div className="truncate font-medium text-slate-100"><span className="mr-1.5 font-mono text-cyan-300">#{r.slip_no}</span>{r.borrower}</div><div className="truncate text-xs text-slate-400">{r.items}</div></Row>))}</Rows>
        </Section>
        <Section title="Recent returns" right={<More to="/returns" label="Return items" />}>
          <Rows count={d.recent_returns.length} empty="No returns yet">{d.recent_returns.map((r: any, i: number) => (
            <Row key={i} right={<span className="text-[11px] text-slate-500">{r.date}</span>}>
              <div className="truncate font-medium text-slate-100"><span className="mr-1.5 font-mono text-cyan-300">#{r.slip_no}</span>{r.item} <span className="text-slate-400">x{r.qty}</span></div><div className="truncate text-xs text-slate-400">{r.borrower}</div></Row>))}</Rows>
        </Section>
        <Section title="Low stock" right={<More to="/inventory" label="Inventory" />}>
          <Rows count={d.low_stock.length} empty="No low-stock items">{d.low_stock.map((r: any, i: number) => (
            <Row key={i} right={<span className="font-mono text-sm"><span className="font-semibold text-red-300">{r.available}</span><span className="text-slate-500"> / min {r.min}</span></span>}>
              <div className="truncate font-medium text-slate-100">{r.name}</div><div className="text-xs text-slate-400">{r.source}</div></Row>))}</Rows>
        </Section>
      </div>

      <Section title="Maintenance alerts" right={<More to="/maintenance" label="Open register" />}>
        <Rows count={d.maintenance_alerts.length} empty="No pending complaints">{d.maintenance_alerts.map((r: any) => (
          <Row key={r.complaint_no} right={<div className="flex items-center gap-2"><span className={`text-xs font-medium ${prioTone[r.priority]}`}>{r.priority}</span><Badge s={r.status} /></div>}>
            <div className="truncate font-medium text-slate-100"><span className="mr-1.5 font-mono text-cyan-300">{r.complaint_no}</span>{r.equipment}</div><div className="truncate text-xs text-slate-400">{r.problem} &middot; {r.date}</div></Row>))}</Rows>
        {d.warranty_expiring.length > 0 && <p className="mt-3 text-xs text-amber-300">Warranty expiring within 60 days: {d.warranty_expiring.map((w: any) => `${w.name} (${w.warranty_expiry})`).join(", ")}</p>}
      </Section>
    </div>
  );
}
