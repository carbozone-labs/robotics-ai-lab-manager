import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Toast = { id: number; kind: "ok" | "err"; msg: string };
const ToastCtx = createContext<(kind: "ok" | "err", msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((kind: "ok" | "err", msg: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, kind, msg }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col gap-2" role="status">
        {list.map((t) => (
          <div key={t.id} className={`max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${t.kind === "ok" ? "border-emerald-400/40 bg-emerald-900/80 text-emerald-100" : "border-red-400/40 bg-red-900/80 text-red-100"}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin text-cyan-400" /></div>;
export const Empty = ({ text }: { text: string }) => <div className="p-8 text-center text-sm text-slate-400">{text}</div>;

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50"><span className="mr-2 inline-block h-4 w-1 rounded bg-cyan-400 align-middle shadow-[0_0_10px_#22d3ee]" />{title}</h1>
        <div className="no-print flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export const Section = ({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) => (
  <div className="card"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-300">{title}</h2>{right}</div>{children}</div>
);

export const Stat = ({ label, value, hint, tone = "cyan" }: { label: string; value: ReactNode; hint?: string; tone?: "cyan" | "red" | "amber" | "green" }) => {
  const c = { cyan: "text-cyan-300", red: "text-red-300", amber: "text-amber-300", green: "text-emerald-300" }[tone];
  return <div className="card !p-3"><div className="text-xs text-slate-400">{label}</div><div className={`font-mono text-2xl font-semibold ${c}`}>{value}</div>{hint && <div className="text-[11px] text-slate-500">{hint}</div>}</div>;
};

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-slate-400">{label}</span>{children}{hint && <span className="block text-[11px] text-slate-500">{hint}</span>}</label>;
}

const TONES: Record<string, string> = {
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", red: "border-red-400/30 bg-red-400/10 text-red-300",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-300", sky: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  indigo: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300", orange: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-300", cyan: "border-cyan-400/40 bg-cyan-400/15 text-cyan-200",
};
const STATUS: Record<string, string> = {
  "Not Returned": "amber", "Partially Returned": "sky", Returned: "green", Present: "green", Absent: "red", Late: "amber", Leave: "indigo",
  Open: "red", "In Progress": "amber", Resolved: "green", Urgent: "red", High: "orange", Medium: "amber", Low: "slate",
  Active: "green", Inactive: "slate", Current: "cyan", Upcoming: "sky", Done: "slate", Working: "green", Damaged: "red", Maintenance: "amber",
};
export const Badge = ({ s }: { s: string }) => <span className={`chip ${TONES[STATUS[s] || "slate"]}`}>{s}</span>;

export function Table({ cols, rows, empty = "Nothing to show" }: { cols: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-700/60">
        <thead><tr>{cols.map((c, i) => <th key={i} className="th">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-800/80">
          {rows.map((r, i) => <tr key={i} className="transition hover:bg-cyan-400/5">{r.map((c, j) => <td key={j} className="td">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between pt-3 text-sm">
      <span className="text-slate-400">{total} record(s)</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
        <span>{page} / {pages}</span>
        <button className="btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Confirm({ open, title, body, onYes, onNo, danger }: { open: boolean; title: string; body: ReactNode; onYes: () => void; onNo: () => void; danger?: boolean }) {
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="card w-full max-w-md space-y-3 !bg-slate-900">
        <h2 className="font-semibold text-slate-50">{title}</h2><div className="text-sm text-slate-300">{body}</div>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onNo}>Cancel</button><button className={danger ? "btn-danger" : "btn"} onClick={onYes}>Confirm</button></div>
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="dialog" aria-modal>
      <div className={`card max-h-[92vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} space-y-3 overflow-y-auto !bg-slate-900`}>
        <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-50">{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">&#10005;</button></div>
        {children}
      </div>
    </div>
  );
}

/** Inline error list for forms; renders nothing when empty. */
export const Problems = ({ list }: { list: string[] }) => list.length ? <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-300">{list.map((p) => <li key={p}>{p}</li>)}</ul> : null;
