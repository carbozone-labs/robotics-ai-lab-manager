import { ReactNode, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";

/** Morphing colour blobs behind the whole app (pure CSS, GPU transforms only). */
export const LiquidBackground = () => (
  <div className="liquid-bg no-print" aria-hidden><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
);

/** One delegated listener: the glass highlight on a .card follows the pointer. Mouse/pen only (no cost on touch). */
export function useGlassPointer() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const card = (e.target as HTMLElement | null)?.closest?.(".card") as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`); card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Number that eases up to its value. Respects reduced-motion. */
export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(reduced() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setN(value); return; }
    const a = from.current, t0 = performance.now(), dur = 700; let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(a + (value - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

export type Seg = { label: string; value: number; color: string };

/** Donut gauge. Segments are laid end to end; an empty total renders a calm empty ring. */
export function Ring({ segs, size = 132, stroke = 13, center, sub }: { segs: Seg[]; size?: number; stroke?: number; center: ReactNode; sub?: string }) {
  const total = segs.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, gap = total > 0 && segs.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        {total > 0 && segs.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * C, seg = Math.max(0, len - gap), off = -acc; acc += len;
          return <circle key={s.label} className="ring-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${seg} ${C}`} strokeDashoffset={off} style={{ filter: `drop-shadow(0 0 6px ${s.color}88)` }} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-2xl font-semibold leading-none text-slate-50">{center}</div>
        {sub && <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

export type DockItem = { to: string; label: string; icon: any };
/** Floating glass tab bar, phones only. The last slot opens the full menu. */
export function Dock({ items, onMenu }: { items: DockItem[]; onMenu: () => void }) {
  return (
    <nav className="dock no-print" aria-label="Quick navigation">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `dock-item ${isActive ? "on" : ""}`}><Icon size={20} />{label}</NavLink>
      ))}
      <button className="dock-item" onClick={onMenu} aria-label="Open menu"><Menu size={20} />More</button>
    </nav>
  );
}
