export interface User { id: number; username: string; full_name: string; role: string; can_mark_attendance: boolean }
const TOKEN = "rlb_token";
export const getToken = () => localStorage.getItem(TOKEN);
import { supabase } from "./supabase";
import QRCode from "qrcode";
export const setToken = (t: string | null) => { if (t) localStorage.setItem(TOKEN, t); else { localStorage.removeItem(TOKEN); supabase.auth.signOut(); } };

export class ApiError extends Error { constructor(public status: number, msg: string, public data?: any) { super(msg); } }

function detail(d: any): string {
  if (!d) return "Request failed";
  if (typeof d.detail === "string") return d.detail;
  if (d.detail && typeof d.detail === "object" && typeof d.detail.message === "string") return d.detail.message;
  if (Array.isArray(d.detail)) return d.detail.map((e: any) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`).join("; ");
  return "Request failed";
}


type Opts = { method?: string; json?: any; form?: FormData };
const fail = (status: number, msg: string): never => { throw new ApiError(status, msg); };
const unwrap = <T,>(r: { data: T | null; error: any }): T => {
  if (r.error) {
    const m = /^(\d{3})\|(.*)$/.exec(r.error.message || "");
    if (m) fail(+m[1], m[2]);
    const em: string = r.error.message || "";
    fail(r.error.code === "23505" ? 409 : r.error.code === "23503" ? 409 : r.error.code === "42501" ? 403 : 400,
      r.error.code === "23505" ? (/serial/.test(em) ? "Serial number already registered to another asset" : /asset_id/.test(em) ? "Asset ID already exists" : /teacher_code/.test(em) ? "Teacher ID already in use" : /teachers_name/.test(em) ? "A teacher with this name already exists" : /batches_name/.test(em) ? "Batch already exists" : /divisions_name/.test(em) ? "Division already exists" : "Already exists (duplicate value)") : em);
  }
  return r.data as T;
};
const NOT_RETURNED = "Not Returned", PARTIAL = "Partially Returned", RETURNED = "Returned";
const lineStatus = (l: any) => (l.qty - l.returned_qty <= 0 ? RETURNED : l.returned_qty > 0 ? PARTIAL : NOT_RETURNED);
const slipStatus = (ls: any[]) => { const st = ls.map(lineStatus); return st.length && st.every((x) => x === RETURNED) ? RETURNED : st.some((x) => x !== NOT_RETURNED) ? PARTIAL : NOT_RETURNED; };
const itemOut = (i: any) => { const out = i.out_now ?? 0; return { id: i.id, name: i.name, category: i.category, total_qty: i.total_qty, out_now: out, available: i.total_qty - out, min_stock: i.min_stock, low_stock: i.total_qty - out <= i.min_stock }; };
const stuOut = (s: any) => ({ id: s.id, prn: s.prn, name: s.name, division: s.division, roll_no: s.roll_no });

const SLIP_SEL = "*, students(*), teachers(*), issue_transactions(id, qty, returned_qty, returned_on, inventory_items(name))";
function mapSlip(s: any) {
  const st = s.students, te = s.teachers;
  const lines = (s.issue_transactions as any[]).sort((a, b) => a.id - b.id).map((l) => ({ line_id: l.id, item: l.inventory_items.name, qty: l.qty, returned: l.returned_qty, outstanding: l.qty - l.returned_qty, status: lineStatus(l), returned_on: l.returned_on || "" }));
  return { id: s.id, slip_no: s.slip_no, date: s.issue_date, batch: s.batch || "", taken_by: s.taken_by,
    prn: st?.prn || "", student_name: st?.name || "", roll_no: st?.roll_no || "", division: st?.division || "", teacher_name: te?.name || "",
    borrower: st?.name || te?.name || "", lines, status: slipStatus(lines) };
}
async function slipByNo(no: string) {
  const s = unwrap(await supabase.from("issue_slips").select(SLIP_SEL).eq("slip_no", no).maybeSingle());
  if (!s) fail(404, "Slip not found");
  return mapSlip(s);
}
const REG_COLS = ["Slip No", "Date", "Batch", "Taken by", "PRN", "Teacher name (if teacher)", "Student name (auto)", "Division", "Roll No", "Item", "Qty", "Return date", "Status (auto)"];
const orFilter = (q: string) => { const t = q.replace(/[%,()]/g, ""); return `slip_no.ilike.%${t}%,prn.ilike.%${t}%,student_name.ilike.%${t}%,teacher_name.ilike.%${t}%,item.ilike.%${t}%`; };

const CSV_COLS = ["PRN", "Student name", "Division", "Roll no"];
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
async function classifyStudents(form: FormData | undefined) {
  const file = form?.get("file") as File | null;
  if (!file) fail(422, "Choose a CSV file first");
  const rows = parseCsv(await file!.text());
  if (!rows.length) fail(422, "The CSV file is empty");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = CSV_COLS.map((c) => head.indexOf(c.toLowerCase()));
  const missing = CSV_COLS.filter((_, i) => idx[i] < 0);
  if (missing.length) fail(422, `Missing required column(s): ${missing.join(", ")}. Expected exactly: ${CSV_COLS.join(",")}`);
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const r = unwrap(await supabase.from("students").select("prn").range(from, from + 999)) as any[];
    r.forEach((x) => existing.add(x.prn)); if (r.length < 1000) break;
  }
  const valid: any[] = [], invalid: any[] = [], seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const rec: any = {}; CSV_COLS.forEach((c, k) => (rec[c] = (r[idx[k]] ?? "").trim()));
    const why = CSV_COLS.filter((c) => !rec[c]).map((c) => `missing ${c}`);
    if (rec.PRN && seen.has(rec.PRN)) why.push("duplicate PRN in file");
    if (rec.PRN && existing.has(rec.PRN)) why.push("PRN already in database (not overwritten)");
    (why.length ? invalid : valid).push({ row: i + 2, ...rec, ...(why.length ? { errors: why } : {}) });
    if (rec.PRN) seen.add(rec.PRN);
  });
  return { total: rows.length - 1, valid, invalid };
}


const csvBlob = (cols: string[], rows: any[][]) => {
  const esc = (v: any) => { let t = v === null || v === undefined ? "" : String(v); if (typeof v === "string" && /^[=@]/.test(v)) t = "'" + t; return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return new Blob(["\uFEFF" + [cols, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
};
async function fetchAll(table: string, order: string, filter?: (r: any) => any, sel = "*", asc = true): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let r: any = supabase.from(table).select(sel); if (filter) r = filter(r);
    const d = unwrap(await r.order(order, { ascending: asc }).range(from, from + 999)) as any[];
    out.push(...d); if (d.length < 1000) break;
  }
  return out;
}

// ---------- Lab assets / computers helpers ----------
const KINDS: Record<string, string[]> = { Computer: ["Desktop Computer", "CPU", "Monitor", "Mouse", "Keyboard", "UPS", "Computer Accessories"],
  Robotics: ["Arduino Uno", "Arduino Mega", "ESP32", "Raspberry Pi", "Sensors", "Motors", "Motor Drivers", "Robotic Kits"],
  Electronics: ["Breadboards", "Jumper Wires", "Batteries", "Electronic Components"], Furniture: ["Chairs", "Tables"],
  Other: ["Projector", "Extension Boards", "Networking Equipment", "Other Accessories"] };
const SLOT_CODES: Record<string, string> = { CPU: "CPU", Monitor: "MON", Keyboard: "KBD", Mouse: "MSE", UPS: "UPS", "Computer Accessories": "ACC" };
const SLOTS = Object.keys(SLOT_CODES), PC_KIND = "Desktop Computer";
let _me = "";
const meName = async () => {
  if (_me) return _me;
  const { data: { session } } = await supabase.auth.getSession(); if (!session) return "";
  const r = await supabase.from("profiles").select("username").eq("id", session.user.id).single();
  return (_me = (r.data as any)?.username || "");
};
const nz = (v: any) => (v === "" || v === undefined || v === null ? null : v);
const likeEsc = (t: string) => t.replace(/[%,()\\]/g, "");
const aOut = (a: any) => ({ parent_pk: a.parent_pk, parent_asset_id: a.parent_asset_id || "", id: a.id, asset_id: a.asset_id, name: a.name, category: a.category, kind: a.kind || "",
  tracking: a.tracking, brand: a.brand || "", model: a.model || "", serial_number: a.serial_number || "", quantity: a.quantity, working: a.working, damaged: a.damaged,
  under_maintenance: a.under_maintenance, min_quantity: a.min_quantity, location: a.location || "", allocated: a.allocated, free: Math.max(a.working - a.allocated, 0),
  purchase_date: a.purchase_date || "", warranty_expiry: a.warranty_expiry || "", supplier: a.supplier || "", purchase_cost: a.purchase_cost === null ? null : Number(a.purchase_cost),
  remarks: a.remarks || "", low_stock: a.min_quantity > 0 && a.working < a.min_quantity });
const getAsset = async (pk: number) => { const a = unwrap(await supabase.from("assets_view").select("*").eq("id", pk).maybeSingle()); if (!a) fail(404, "Asset not found"); return a as any; };
const condOf = (a: any) => (a.damaged ? "Damaged" : a.under_maintenance ? "Under maintenance" : "Working");
const partOut = (a: any) => ({ id: a.id, asset_id: a.asset_id, kind: a.kind || "", name: a.name, brand: a.brand || "", model: a.model || "", serial_number: a.serial_number || "",
  location: a.location || "", condition: condOf(a), remarks: a.remarks || "" });
const logRow = async (asset_pk: number, kind: string, description: string, by?: string, extra: any = {}) =>
  unwrap(await supabase.from("maintenance_logs").insert({ asset_pk, log_date: new Date().toISOString().slice(0, 10), kind, description, performed_by: by ?? (await meName()), ...extra }));
const alOut = (x: any) => ({ id: x.id, asset_pk: x.asset_pk, asset_id: x.lab_assets.asset_id, name: x.lab_assets.name, allocated_to: x.allocated_to, purpose: x.purpose, qty: x.qty,
  location: x.location, allocated_on: x.allocated_on, returned_on: x.returned_on || "", remarks: x.remarks, active: !x.returned_on });
const nextAssetId = async () => {
  const rows = await fetchAll("lab_assets", "id", (r) => r.ilike("asset_id", "AST-%"), "asset_id");
  const top = rows.reduce((m, x) => Math.max(m, +(/^AST-(\d+)$/i.exec(x.asset_id)?.[1] || 0)), 0);
  return "AST-" + String(top + 1).padStart(4, "0");
};
async function prepAsset(b: any, cur?: any) {
  const d: any = {}; ["asset_id", "name", "category", "kind", "tracking", "brand", "model", "serial_number", "location", "supplier", "remarks"].forEach((k) => (d[k] = String(b[k] ?? "").trim()));
  if (!d.name) fail(422, "Name is required");
  d.tracking = d.tracking || "quantity"; d.quantity = Number(b.quantity ?? 1); d.damaged = Number(b.damaged ?? 0); d.under_maintenance = Number(b.under_maintenance ?? 0); d.min_quantity = Number(b.min_quantity ?? 0);
  if ([d.quantity, d.damaged, d.under_maintenance, d.min_quantity].some((n) => !Number.isInteger(n) || n < 0)) fail(422, "Quantities must be whole numbers (0 or more)");
  if (d.tracking === "individual" && d.quantity !== 1) fail(422, "An individually tracked asset has quantity 1 (use quantity-based tracking for groups)");
  const working = nz(b.working) !== null ? Number(b.working) : d.quantity - d.damaged - d.under_maintenance;
  if (working < 0 || working + d.damaged + d.under_maintenance !== d.quantity) fail(422, "Working + Damaged + Under Maintenance must equal the total Quantity");
  d.working = working; d.purchase_date = nz(b.purchase_date); d.warranty_expiry = nz(b.warranty_expiry); d.purchase_cost = nz(b.purchase_cost) === null ? null : Number(b.purchase_cost);
  if (d.purchase_date && d.warranty_expiry && d.warranty_expiry < d.purchase_date) fail(422, "Warranty expiry cannot be before the purchase date");
  if (cur && d.quantity < cur.allocated) fail(409, `Quantity cannot be below the ${cur.allocated} currently allocated`);
  if (cur && working < cur.allocated) fail(409, `Working count cannot be below the ${cur.allocated} currently allocated`);
  d.asset_id = d.asset_id || cur?.asset_id || (await nextAssetId());
  d.serial_number = d.serial_number || null;
  if ("parent_pk" in b) d.parent_pk = nz(b.parent_pk);
  return d;
}
const cnt = async (t: string, col: string, id: number) => (await supabase.from(t).select("id", { count: "exact", head: true }).eq(col, id)).count ?? 0;

// ---------- maintenance / teachers / labels helpers ----------
const cOut = (c: any) => ({ id: c.id, complaint_no: c.complaint_no, complaint_date: c.complaint_date || "", equipment_name: c.equipment_name, asset_pk: c.asset_pk, asset_id: c.lab_assets?.asset_id || "",
  description: c.description, reported_by: c.reported_by, priority: c.priority, assigned_technician: c.assigned_technician || "", status: c.status,
  resolution_details: c.resolution_details || "", resolution_date: c.resolution_date || "", remarks: c.remarks || "" });
const CSEL = "*, lab_assets(asset_id)";
async function prepComplaint(b: any) {
  const assetPk = nz(b.asset_pk); let asset: any = null;
  if (assetPk) { asset = unwrap(await supabase.from("lab_assets").select("id, name").eq("id", assetPk).maybeSingle()); if (!asset) fail(422, "Linked asset not found"); }
  const name = String(b.equipment_name || "").trim() || asset?.name || "";
  if (!name) fail(422, "Enter the equipment name or pick an asset");
  const desc = String(b.description || "").trim(), rep = String(b.reported_by || "").trim();
  if (!desc) fail(422, "Problem description is required"); if (!rep) fail(422, "Reported by is required");
  if (!b.complaint_date) fail(422, "Complaint date is required");
  if (b.complaint_date > new Date().toISOString().slice(0, 10)) fail(422, "Complaint date cannot be in the future");
  const status = b.status || "Open"; let rdate: string | null = null; const rd = String(b.resolution_details || "").trim();
  if (status === "Resolved") {
    if (!rd) fail(422, "Resolution details are required to mark a complaint Resolved");
    rdate = b.resolution_date || new Date().toISOString().slice(0, 10);
    if (rdate! < b.complaint_date) fail(422, "Resolution date cannot be before the complaint date");
  }
  return { asset, row: { complaint_date: b.complaint_date, equipment_name: name, asset_pk: assetPk, description: desc, reported_by: rep, priority: b.priority || "Medium",
    assigned_technician: String(b.assigned_technician || "").trim(), status, remarks: b.remarks || "", resolution_details: rd, resolution_date: rdate } };
}
async function syncComplaintLog(c: any, asset: any) {
  const ex = unwrap(await supabase.from("maintenance_logs").select("id").eq("complaint_pk", c.id).maybeSingle()) as any;
  if (c.status === "Resolved" && asset) {
    const row = { log_date: c.resolution_date, kind: "Repair", description: `${c.complaint_no}: ${c.description} -> ${c.resolution_details}`, performed_by: c.assigned_technician };
    if (ex) unwrap(await supabase.from("maintenance_logs").update(row).eq("id", ex.id)); else unwrap(await supabase.from("maintenance_logs").insert({ ...row, asset_pk: asset.id, complaint_pk: c.id }));
  } else if (ex) unwrap(await supabase.from("maintenance_logs").delete().eq("id", ex.id));
}
const tOut = (t: any, tt: any[]) => ({ id: t.id, name: t.name, teacher_code: t.teacher_code || "", department: t.department || "", designation: t.designation || "", email: t.email || "", mobile: t.mobile || "",
  subjects: t.subjects || "", batches_text: t.batches_text || "", is_active: t.is_active, remarks: t.remarks || "", sessions: tt.length,
  timetable_batches: [...new Set(tt.map((r) => `${r.batch} ${r.division}`.trim()))].sort(), timetable_subjects: [...new Set(tt.map((r) => r.subject))].sort() });
const oneTeacher = async (id: number) => { const t = unwrap(await supabase.from("teachers").select("*").eq("id", id).maybeSingle()); if (!t) fail(404, "Teacher not found");
  return tOut(t, unwrap(await supabase.from("timetable_entries").select("batch, division, subject").eq("teacher_id", id)) as any[]); };
async function prepTeacher(b: any, id?: number) {
  const d: any = {}; ["name", "teacher_code", "department", "designation", "email", "mobile", "subjects", "batches_text", "remarks"].forEach((k) => (d[k] = String(b[k] ?? "").trim()));
  d.is_active = b.is_active ?? true;
  if (!d.name) fail(422, "Teacher name is required");
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) fail(422, "Email address is not valid");
  if (d.mobile && !/^\+?[0-9 \-]{7,15}$/.test(d.mobile)) fail(422, "Mobile number must be 7-15 digits");
  const all = unwrap(await supabase.from("teachers").select("id, name, teacher_code")) as any[];
  if (all.some((t) => t.id !== id && t.name.toLowerCase() === d.name.toLowerCase())) fail(409, id ? "Another teacher already has this name" : "A teacher with this name already exists");
  if (!d.teacher_code) { const cur = id ? all.find((t) => t.id === id)?.teacher_code : ""; d.teacher_code = cur || "T" + String(all.reduce((m, t) => Math.max(m, +(/^T(\d+)$/.exec(t.teacher_code || "")?.[1] || 0)), 0) + 1).padStart(3, "0"); }
  return d;
}

/** Same call signature as the old REST client; each route is answered by Supabase. */
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const [p, query = ""] = path.split("?");
  const q = new URLSearchParams(query);
  const m = opts.method || (opts.json !== undefined || opts.form ? "POST" : "GET");
  const body = opts.json as any;
  let hit: RegExpExecArray | null;
  const out = async (): Promise<any> => {
    if (p === "/api/auth/me") {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) fail(401, "Not signed in");
      const pr = unwrap(await supabase.from("profiles").select("*").eq("id", session!.user.id).single()) as any;
      if (!pr.is_active) fail(401, "Account disabled");
      return { id: pr.id, username: pr.username, full_name: pr.full_name, role: pr.role, can_mark_attendance: pr.can_mark_attendance, is_active: pr.is_active };
    }
    if (p === "/api/auth/users" && m === "GET") return unwrap(await supabase.from("profiles").select("*").order("username"));
    if (p === "/api/batches" && m === "GET") return (unwrap(await supabase.from("batches").select("name").order("id")) as any[]).map((b) => b.name);
    if (p === "/api/batches" && m === "POST") { const name = (q.get("name") || "").trim(); unwrap(await supabase.from("batches").insert({ name })); return { name }; }
    if (p === "/api/divisions" && m === "GET") {
      const st = unwrap(await supabase.from("students").select("division").eq("is_active", true)) as any[];
      const reg = unwrap(await supabase.from("divisions").select("*")) as any[];
      const cnt: Record<string, number> = {}; st.forEach((s) => (cnt[s.division] = (cnt[s.division] || 0) + 1));
      return [...new Set([...Object.keys(cnt), ...reg.map((d) => d.name)])].sort().map((n) => ({ id: reg.find((d) => d.name === n)?.id ?? null, name: n, students: cnt[n] || 0, sessions: 0, registered: reg.some((d) => d.name === n) }));
    }
    if (p === "/api/divisions" && m === "POST") { unwrap(await supabase.from("divisions").insert({ name: (q.get("name") || "").trim() })); return { name: q.get("name") }; }
    if (p === "/api/students/divisions") return [...new Set((unwrap(await supabase.from("students").select("division")) as any[]).map((s) => s.division))].sort();
    if (p === "/api/students/import/preview") {
      const r = await classifyStudents(opts.form);
      return { total_rows: r.total, valid_count: r.valid.length, invalid_count: r.invalid.length, preview: r.valid.slice(0, 20), invalid: r.invalid.slice(0, 200) };
    }
    if (p === "/api/students/import/commit") {
      const r = await classifyStudents(opts.form);
      const recs = r.valid.map((v) => ({ prn: v.PRN, name: v["Student name"], division: v.Division, roll_no: v["Roll no"] }));
      for (let i = 0; i < recs.length; i += 500) unwrap(await supabase.from("students").insert(recs.slice(i, i + 500)));
      return { imported: recs.length, skipped: r.invalid.length, invalid: r.invalid.slice(0, 200) };
    }
    if (p === "/api/students" && m === "GET") {
      const size = +(q.get("size") || 50), page = +(q.get("page") || 1), term = (q.get("q") || "").replace(/[%,()]/g, "");
      let r = supabase.from("students").select("*", { count: "exact" }).eq("is_active", true);
      if (term) r = r.or(`prn.ilike.%${term}%,name.ilike.%${term}%,roll_no.ilike.%${term}%`);
      if (q.get("division")) r = r.eq("division", q.get("division")!);
      const res = await r.order("division").order("roll_no").range((page - 1) * size, page * size - 1);
      return { total: res.count ?? 0, items: (unwrap(res as any) as any[]).map(stuOut) };
    }
    if ((hit = /^\/api\/students\/lookup\/(.+)$/.exec(p))) {
      const s = unwrap(await supabase.from("students").select("*").eq("prn", decodeURIComponent(hit[1]).trim()).eq("is_active", true).maybeSingle());
      if (!s) fail(404, "PRN not found");
      return { ...stuOut(s), verified: true };
    }
    if (p === "/api/students" && m === "POST") return stuOut(unwrap(await supabase.from("students").insert({ prn: body.prn.trim(), name: body.name.trim(), division: body.division.trim(), roll_no: body.roll_no.trim() }).select().single()));
    if ((hit = /^\/api\/students\/(\d+)$/.exec(p)) && m === "PUT") return stuOut(unwrap(await supabase.from("students").update({ prn: body.prn.trim(), name: body.name.trim(), division: body.division.trim(), roll_no: body.roll_no.trim() }).eq("id", +hit[1]).select().single()));
    if (p === "/api/inventory" && m === "GET") return (unwrap(await supabase.from("inventory_view").select("*").order("id")) as any[]).map(itemOut);
    if (p === "/api/inventory" && m === "POST") {
      const r = unwrap(await supabase.from("inventory_items").insert({ name: body.name.trim(), category: body.category, total_qty: body.total_qty, min_stock: body.min_stock }).select().single()) as any;
      return itemOut({ ...r, out_now: 0 });
    }
    if ((hit = /^\/api\/inventory\/(\d+)$/.exec(p))) {
      const id = +hit[1];
      const cur = () => supabase.from("inventory_view").select("*").eq("id", id).single();
      if (m === "PUT") {
        const c = unwrap(await cur()) as any;
        if (body.total_qty < c.out_now) fail(409, `Total cannot be below ${c.out_now} currently issued`);
        unwrap(await supabase.from("inventory_items").update({ name: body.name.trim(), category: body.category, total_qty: body.total_qty, min_stock: body.min_stock }).eq("id", id));
        return itemOut(unwrap(await cur()));
      }
      if (m === "DELETE") {
        const used = unwrap(await supabase.from("issue_transactions").select("id").eq("item_id", id).limit(1)) as any[];
        if (used.length) fail(409, "Item has issue history and cannot be deleted. Set its stock to 0 instead.");
        unwrap(await supabase.from("stock_adjustments").delete().eq("item_id", id));
        unwrap(await supabase.from("inventory_items").delete().eq("id", id));
        return { deleted: true };
      }
    }
    if ((hit = /^\/api\/inventory\/(\d+)\/adjust$/.exec(p))) {
      const id = +hit[1], c = unwrap(await supabase.from("inventory_view").select("*").eq("id", id).single()) as any;
      if (c.total_qty + body.delta < c.out_now) fail(409, "Adjustment would drop stock below the quantity currently issued");
      unwrap(await supabase.from("inventory_items").update({ total_qty: c.total_qty + body.delta }).eq("id", id));
      unwrap(await supabase.from("stock_adjustments").insert({ item_id: id, delta: body.delta, reason: body.reason }));
      return itemOut(unwrap(await supabase.from("inventory_view").select("*").eq("id", id).single()));
    }
    if (p === "/api/issues" && m === "POST") return slipByNo(unwrap(await supabase.rpc("issue_items", { p: body })) as string);
    if ((hit = /^\/api\/slips\/([^/]+)$/.exec(p))) return slipByNo(decodeURIComponent(hit[1]));
    if (p === "/api/register") {
      const size = Math.min(+(q.get("size") || 50), 500), page = +(q.get("page") || 1);
      let r = supabase.from("register_view").select("*", { count: "exact" });
      if (q.get("q")) r = r.or(orFilter(q.get("q")!));
      if (q.get("date_from")) r = r.gte("issue_date", q.get("date_from")!);
      if (q.get("date_to")) r = r.lte("issue_date", q.get("date_to")!);
      if (q.get("batch")) r = r.eq("batch", q.get("batch")!);
      if (q.get("student")) r = r.or(`prn.eq.${q.get("student")!.replace(/[,()]/g, "")},student_name.ilike.%${q.get("student")!.replace(/[%,()]/g, "")}%`);
      if (q.get("teacher")) r = r.ilike("teacher_name", `%${q.get("teacher")!.replace(/[%,()]/g, "")}%`);
      if (q.get("item")) r = r.eq("item", q.get("item")!);
      if (q.get("slip_no")) r = r.eq("slip_no", q.get("slip_no")!);
      if (q.get("status")) r = r.eq("status", q.get("status")!);
      const col = ({ date: "issue_date", slip: "slip_id", item: "item", qty: "qty" } as any)[q.get("sort") || "date"] || "issue_date";
      const asc = q.get("desc") === "false";
      const res = await r.order(col, { ascending: asc }).order("line_id", { ascending: false }).range((page - 1) * size, page * size - 1);
      const rows = unwrap(res as any) as any[];
      const ids = [...new Set(rows.map((x) => x.slip_id))];
      const all = ids.length ? (unwrap(await supabase.from("register_view").select("slip_id, qty, returned_qty").in("slip_id", ids)) as any[]) : [];
      return { total: res.count ?? 0, columns: REG_COLS, items: rows.map((x) => ({
        "Slip No": x.slip_no, Date: x.issue_date, Batch: x.batch, "Taken by": x.taken_by, PRN: x.prn, "Teacher name (if teacher)": x.teacher_name,
        "Student name (auto)": x.student_name, Division: x.division, "Roll No": x.roll_no, Item: x.item, Qty: x.qty, "Return date": x.returned_on || "", "Status (auto)": x.status,
        line_id: x.line_id, outstanding: x.outstanding, slip_status: slipStatus(all.filter((l) => l.slip_id === x.slip_id)) })) };
    }
    if (p === "/api/returns/search") {
      let r = supabase.from("register_view").select("*");
      if (q.get("q")) r = r.or(orFilter(q.get("q")!));
      if (q.get("outstanding_only") !== "false") r = r.gt("outstanding", 0);
      return (unwrap(await r.order("issue_date", { ascending: false }).limit(200)) as any[]).map((x) => ({ line_id: x.line_id, slip_no: x.slip_no, issue_date: x.issue_date,
        borrower: x.student_name || x.teacher_name, prn: x.prn, item: x.item, issued: x.qty, returned: x.returned_qty, outstanding: x.outstanding, status: x.status }));
    }
    if (p === "/api/returns/pending") {
      let r = supabase.from("register_view").select("slip_id, issue_date").gt("outstanding", 0);
      if (q.get("q")) r = r.or(orFilter(q.get("q")!));
      const ids = [...new Set((unwrap(await r.order("issue_date", { ascending: false }).order("slip_id", { ascending: false }).limit(1000)) as any[]).map((x) => x.slip_id))].slice(0, 200);
      if (!ids.length) return [];
      return (unwrap(await supabase.from("issue_slips").select(SLIP_SEL).in("id", ids).order("issue_date", { ascending: false }).order("id", { ascending: false })) as any[]).map(mapSlip);
    }
    if (p === "/api/returns" && m === "POST") {
      unwrap(await supabase.rpc("return_items", { p: { lines: [{ line_id: body.line_id, qty: body.qty }], returned_on: body.returned_on, note: body.note || "" } }));
      const sl = unwrap(await supabase.from("issue_transactions").select("slip_id").eq("id", body.line_id).single()) as any;
      const full = mapSlip(unwrap(await supabase.from("issue_slips").select(SLIP_SEL).eq("id", sl.slip_id).single()));
      const ln = full.lines.find((l: any) => l.line_id === body.line_id)!;
      return { line_id: ln.line_id, outstanding: ln.outstanding, status: ln.status, slip_status: full.status };
    }
    if (p === "/api/returns/slip" && m === "POST") {
      const payload: any = { slip_no: body.slip_no, returned_on: body.returned_on, note: body.note || "" };
      if (body.lines) payload.lines = body.lines;
      const res = unwrap(await supabase.rpc("return_items", { p: payload })) as any;
      const slip = await slipByNo(res.slip_no);
      return { slip_no: res.slip_no, lines_returned: res.lines_returned, status: slip.status, slip };
    }
    if (p === "/api/returns/history") {
      let r = supabase.from("return_transactions").select("qty, returned_on, note, issue_transactions(issue_slips(slip_no, students(name), teachers(name)), inventory_items(name))");
      if (q.get("line_id")) r = r.eq("line_id", +q.get("line_id")!);
      return (unwrap(await r.order("id", { ascending: false }).limit(300) as any) as any[]).map((x) => { const sl = x.issue_transactions.issue_slips; return { slip_no: sl.slip_no, item: x.issue_transactions.inventory_items.name, qty: x.qty, returned_on: x.returned_on, borrower: sl.students?.name || sl.teachers?.name || "", note: x.note }; });
    }
    if (p === "/api/export/students") return csvBlob(["PRN", "Student name", "Division", "Roll no"], (await fetchAll("students", "id", (r) => r.eq("is_active", true))).sort((a, b) => a.division.localeCompare(b.division) || a.roll_no.localeCompare(b.roll_no, undefined, { numeric: true })).map((x) => [x.prn, x.name, x.division, x.roll_no]));
    if (p === "/api/export/teachers") return csvBlob(["Teacher ID", "Teacher Name", "Department", "Designation", "Email", "Mobile Number", "Assigned Subjects", "Assigned Batches", "Status", "Remarks"],
      (await fetchAll("teachers", "name")).map((t) => [t.teacher_code || "", t.name, t.department, t.designation, t.email, t.mobile, t.subjects, t.batches_text, t.is_active ? "Active" : "Inactive", t.remarks]));
    if (p === "/api/export/inventory") return csvBlob(["Item ID", "Item Name", "Category", "Total", "Out Now", "Available", "Min stock"],
      (await fetchAll("inventory_view", "id")).map(itemOut).map((i) => [i.id, i.name, i.category, i.total_qty, i.out_now, i.available, i.min_stock]));
    if (p === "/api/register/export") {
      if (q.get("fmt") === "xlsx") fail(501, "Excel export is not available yet. Please use the CSV export.");
      const lines = await fetchAll("register_view", "line_id");
      const bySlip = new Map<number, any[]>();
      lines.forEach((l) => { if (!bySlip.has(l.slip_id)) bySlip.set(l.slip_id, []); bySlip.get(l.slip_id)!.push(l); });
      return csvBlob(REG_COLS, [...bySlip.entries()].sort((x, y) => x[0] - y[0]).map(([, ls]) => {
        ls.sort((x, y) => x.line_id - y.line_id); const f = ls[0];
        const allBack = ls.every((l) => l.outstanding <= 0);
        const lastBack = allBack ? ls.map((l) => l.returned_on || "").sort().pop() : "";
        return [f.slip_no, f.issue_date, f.batch, f.taken_by, f.prn, f.teacher_name, f.student_name, f.division, f.roll_no,
          ls.map((l) => l.item).join(", "), ls.map((l) => l.qty).join(", "), lastBack, slipStatus(ls.map((l) => ({ qty: l.qty, returned_qty: l.returned_qty })))];
      }));
    }
    if (p === "/api/export/timetable") {
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const rows = (await fetchAll("timetable_entries", "id", undefined, "*, teachers(name)")).sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day) || a.time_from.localeCompare(b.time_from) || a.batch.localeCompare(b.batch));
      return csvBlob(["Day", "Time From", "Time To", "Batch", "Division", "Subject", "Teacher Name", "Lab/Room", "Remarks"], rows.map((e) => [e.day, e.time_from, e.time_to, e.batch, e.division, e.subject, e.teachers?.name || "", e.lab, e.remarks]));
    }
    if (p === "/api/export/assets") {
      const rows = (await fetchAll("lab_assets", "id", undefined, "*, parent:lab_assets!parent_pk(asset_id)")).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.asset_id.localeCompare(b.asset_id));
      return csvBlob(["Asset ID", "Equipment Name", "Category", "Type", "Tracking", "Brand", "Model", "Serial Number", "Quantity", "Working", "Damaged", "Under Maintenance", "Location", "Purchase Date", "Warranty Expiry", "Supplier", "Purchase Cost", "Remarks", "Linked To (PC)"],
        rows.map((a) => [a.asset_id, a.name, a.category, a.kind, a.tracking, a.brand, a.model, a.serial_number || "", a.quantity, a.working, a.damaged, a.under_maintenance, a.location, a.purchase_date || "", a.warranty_expiry || "", a.supplier, a.purchase_cost ?? "", a.remarks, a.parent?.asset_id || ""]));
    }
    if (p === "/api/export/maintenance") {
      const rows = await fetchAll("complaints", "id", undefined, "*, lab_assets(asset_id)");
      return csvBlob(["Complaint ID", "Date", "Equipment Name", "Asset ID", "Problem Description", "Reported By", "Priority", "Assigned Technician", "Status", "Resolution Details", "Resolution Date", "Remarks"],
        rows.map((c) => [c.complaint_no, c.complaint_date, c.equipment_name, c.lab_assets?.asset_id || "", c.description, c.reported_by, c.priority, c.assigned_technician, c.status, c.resolution_details, c.resolution_date || "", c.remarks]));
    }
    if (p === "/api/export/allocations") {
      const rows = await fetchAll("asset_allocations", "id", undefined, "*, lab_assets(asset_id, name)", false);
      return csvBlob(["Asset ID", "Equipment", "Allocated To", "Purpose", "Qty", "Location", "Allocated On", "Returned On"],
        rows.map((x) => [x.lab_assets?.asset_id || "", x.lab_assets?.name || "", x.allocated_to, x.purpose, x.qty, x.location, x.allocated_on, x.returned_on || ""]));
    }
    if (p === "/api/export/computers") {
      const slots = ["CPU", "Monitor", "Keyboard", "Mouse", "UPS"];
      const pcs = await fetchAll("lab_assets", "asset_id", (r) => r.eq("kind", "Desktop Computer").eq("tracking", "individual"));
      const kids = pcs.length ? await fetchAll("lab_assets", "asset_id", (r) => r.in("parent_pk", pcs.map((x) => x.id))) : [];
      const cond = (a: any) => (a.damaged ? "Damaged" : a.under_maintenance ? "Under maintenance" : "Working");
      const cols = ["PC Asset ID", "PC Name", "PC Serial", "Brand", "Model", "Location", "Condition"];
      slots.forEach((k) => cols.push(`${k} Asset ID`, `${k} Serial`)); cols.push("Other Accessories", "Missing");
      return csvBlob(cols, pcs.map((pc) => {
        const acc = kids.filter((k) => k.parent_pk === pc.id), by: Record<string, any> = {}; acc.forEach((k) => { if (!by[k.kind]) by[k.kind] = k; });
        const row: any[] = [pc.asset_id, pc.name, pc.serial_number || "", pc.brand, pc.model, pc.location, cond(pc)];
        slots.forEach((k) => row.push(by[k]?.asset_id || "", by[k]?.serial_number || ""));
        row.push(acc.filter((k) => !slots.includes(k.kind)).map((k) => `${k.kind} ${k.asset_id}`).join("; "), slots.filter((k) => !by[k]).join(", "));
        return row;
      }));
    }
    // ---------------- assets ----------------
    if (p === "/api/assets/meta") {
      const locs = [...new Set((unwrap(await supabase.from("lab_assets").select("location")) as any[]).map((x) => x.location).filter(Boolean))].sort();
      return { kinds: KINDS, locations: locs, categories: Object.keys(KINDS) };
    }
    if (p === "/api/assets/stats") {
      const rows = await fetchAll("assets_view", "id"), soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), cats: Record<string, any> = {};
      rows.forEach((a) => { const c = (cats[a.category] ||= { category: a.category, total: 0, working: 0, damaged: 0, under_maintenance: 0 }); c.total += a.quantity; c.working += a.working; c.damaged += a.damaged; c.under_maintenance += a.under_maintenance; });
      const sum = (f: (a: any) => number) => rows.reduce((t, a) => t + f(a), 0), alloc = sum((a) => a.allocated);
      return { records: rows.length, total: sum((a) => a.quantity), working: sum((a) => a.working), damaged: sum((a) => a.damaged), under_maintenance: sum((a) => a.under_maintenance),
        computers: sum((a) => (a.kind === PC_KIND ? a.quantity : 0)), allocated: alloc, available: Math.max(sum((a) => a.working) - alloc, 0), by_category: Object.values(cats).sort((a: any, b: any) => a.category.localeCompare(b.category)),
        low_stock: rows.map(aOut).filter((a) => a.low_stock), warranty_expiring: rows.filter((a) => a.warranty_expiry && a.warranty_expiry <= soon).map((a) => ({ asset_id: a.asset_id, name: a.name, warranty_expiry: a.warranty_expiry })) };
    }
    if (p === "/api/assets" && m === "GET") {
      let r = supabase.from("assets_view").select("*");
      if (q.get("q")) { const t = likeEsc(q.get("q")!); r = r.or(["name", "asset_id", "serial_number", "brand", "model", "kind"].map((c) => `${c}.ilike.%${t}%`).join(",")); }
      if (q.get("category")) r = r.eq("category", q.get("category")!);
      if (q.get("kind")) r = r.eq("kind", q.get("kind")!);
      if (q.get("location")) r = r.eq("location", q.get("location")!);
      if (q.get("condition") === "damaged") r = r.gt("damaged", 0); else if (q.get("condition") === "maintenance") r = r.gt("under_maintenance", 0);
      const out = (unwrap(await r.order("category").order("name").order("asset_id").limit(2000) as any) as any[]).map(aOut);
      return q.get("condition") === "low" ? out.filter((a) => a.low_stock) : out;
    }
    if (p === "/api/assets" && m === "POST") {
      const row = unwrap(await supabase.from("lab_assets").insert(await prepAsset(body)).select("id").single()) as any;
      return aOut(await getAsset(row.id));
    }
    if (p === "/api/transfers") {
      return (await fetchAll("asset_transfers", "id", undefined, "*, lab_assets(asset_id, name)", false)).slice(0, 500).map((t) => ({ asset_id: t.lab_assets.asset_id, name: t.lab_assets.name, from: t.from_location, to: t.to_location, qty: t.qty, date: t.transferred_on, by: t.transferred_by, remarks: t.remarks }));
    }
    if ((hit = /^\/api\/assets\/(\d+)$/.exec(p))) {
      const pk = +hit[1];
      if (m === "PUT") { const cur = await getAsset(pk); unwrap(await supabase.from("lab_assets").update(await prepAsset(body, cur)).eq("id", pk)); return aOut(await getAsset(pk)); }
      if (m === "DELETE") {
        await getAsset(pk);
        const h: Record<string, number> = { allocations: await cnt("asset_allocations", "asset_pk", pk), transfers: await cnt("asset_transfers", "asset_pk", pk), "maintenance logs": await cnt("maintenance_logs", "asset_pk", pk),
          complaints: await cnt("complaints", "asset_pk", pk), "linked accessories": await cnt("lab_assets", "parent_pk", pk) };
        const used = Object.entries(h).filter(([, v]) => v);
        if (used.length && q.get("force") !== "true") fail(409, "Asset has history (" + used.map(([k, v]) => `${v} ${k}`).join(", ") + "). Confirm to delete it together with that history.");
        unwrap(await supabase.from("lab_assets").update({ parent_pk: null }).eq("parent_pk", pk));
        unwrap(await supabase.from("complaints").update({ asset_pk: null }).eq("asset_pk", pk));
        for (const t of ["asset_allocations", "asset_transfers", "maintenance_logs"]) unwrap(await supabase.from(t).delete().eq("asset_pk", pk));
        unwrap(await supabase.from("lab_assets").delete().eq("id", pk));
        return { deleted: true };
      }
    }
    if ((hit = /^\/api\/assets\/(\d+)\/(condition|history|maintenance-log|transfer)$/.exec(p))) {
      const pk = +hit[1], act = hit[2];
      if (act === "condition") { unwrap(await supabase.rpc("move_condition", { p: { ...body, asset_pk: pk } })); return aOut(await getAsset(pk)); }
      if (act === "transfer") { unwrap(await supabase.rpc("transfer_asset", { p: { ...body, asset_pk: pk } })); return aOut(await getAsset(pk)); }
      if (act === "maintenance-log") {
        await getAsset(pk);
        unwrap(await supabase.from("maintenance_logs").insert({ asset_pk: pk, log_date: body.log_date, kind: body.kind || "Repair", description: String(body.description || "").trim(), cost: nz(body.cost), performed_by: String(body.performed_by || "").trim() || (await meName()) }));
        return { ok: true };
      }
      const a = await getAsset(pk), g = (t: string) => supabase.from(t).select("*").eq("asset_pk", pk).order("id", { ascending: false });
      const [al, tr, mt] = await Promise.all([g("asset_allocations"), g("asset_transfers"), supabase.from("maintenance_logs").select("*").eq("asset_pk", pk).order("log_date", { ascending: false }).order("id", { ascending: false })]);
      return { asset: aOut(a),
        allocations: (unwrap(al as any) as any[]).map((x) => ({ id: x.id, allocated_to: x.allocated_to, purpose: x.purpose, qty: x.qty, location: x.location, allocated_on: x.allocated_on, returned_on: x.returned_on || "" })),
        transfers: (unwrap(tr as any) as any[]).map((x) => ({ from: x.from_location, to: x.to_location, qty: x.qty, date: x.transferred_on, by: x.transferred_by, remarks: x.remarks })),
        maintenance: (unwrap(mt as any) as any[]).map((x) => ({ id: x.id, date: x.log_date, kind: x.kind, description: x.description, cost: x.cost === null ? null : Number(x.cost), by: x.performed_by })) };
    }
    // ---------------- allocations ----------------
    if (p === "/api/allocations" && m === "GET") {
      let r = supabase.from("asset_allocations").select("*, lab_assets(asset_id, name)");
      if (q.get("active_only") === "true") r = r.is("returned_on", null);
      let rows = (unwrap(await r.order("id", { ascending: false }).limit(1000) as any) as any[]).map(alOut);
      const t = (q.get("q") || "").toLowerCase();
      if (t) rows = rows.filter((x) => [x.name, x.asset_id, x.allocated_to].some((v) => String(v).toLowerCase().includes(t)));
      return rows;
    }
    if (p === "/api/allocations" && m === "POST") {
      const id = unwrap(await supabase.rpc("allocate_asset", { p: body })) as number;
      return alOut(unwrap(await supabase.from("asset_allocations").select("*, lab_assets(asset_id, name)").eq("id", id).single()));
    }
    if ((hit = /^\/api\/allocations\/(\d+)\/return$/.exec(p))) {
      unwrap(await supabase.rpc("return_allocation", { aid: +hit[1], d: body.returned_on }));
      return alOut(unwrap(await supabase.from("asset_allocations").select("*, lab_assets(asset_id, name)").eq("id", +hit[1]).single()));
    }
    // ---------------- computers ----------------
    if (p === "/api/computers" && m === "GET") {
      const req = (q.get("required") ?? "CPU,Monitor,Keyboard,Mouse,UPS").split(",").filter((x) => SLOTS.includes(x));
      const pcs = await fetchAll("lab_assets", "asset_id", (r) => r.eq("kind", PC_KIND).eq("tracking", "individual"));
      const kids = pcs.length ? await fetchAll("lab_assets", "asset_id", (r) => r.in("parent_pk", pcs.map((x) => x.id))) : [];
      const all = pcs.map((pc) => { const acc = kids.filter((k) => k.parent_pk === pc.id).sort((a, b) => (a.kind || "").localeCompare(b.kind || "") || a.asset_id.localeCompare(b.asset_id)).map(partOut);
        const have = new Set(acc.map((c) => c.kind)), missing = req.filter((x) => !have.has(x)); return { ...partOut(pc), accessories: acc, missing, complete: !missing.length }; });
      const t = (q.get("q") || "").toLowerCase(), hay = (o: any, ks: string[]) => ks.some((k) => String(o[k] || "").toLowerCase().includes(t));
      const items = all.filter((x) => (!q.get("location") || x.location === q.get("location")) && (q.get("only_incomplete") !== "true" || !x.complete)
        && (!t || hay(x, ["asset_id", "name", "serial_number", "brand", "model", "location"]) || x.accessories.some((c: any) => hay(c, ["serial_number", "asset_id", "brand", "model"]))));
      const unl = (await supabase.from("lab_assets").select("id", { count: "exact", head: true }).is("parent_pk", null).eq("tracking", "individual").in("kind", SLOTS)).count ?? 0;
      return { items, slots: SLOTS, stats: { computers: all.length, complete: all.filter((x) => x.complete).length, incomplete: all.filter((x) => !x.complete).length,
        linked_accessories: all.reduce((a, x) => a + x.accessories.length, 0), unlinked_accessories: unl, damaged: all.filter((x) => x.condition === "Damaged").length } };
    }
    if (p === "/api/computers/unlinked") return (unwrap(await supabase.from("assets_view").select("*").is("parent_pk", null).eq("tracking", "individual").in("kind", SLOTS).order("kind").order("asset_id")) as any[]).map(partOut);
    if (p === "/api/computers/bulk") return unwrap(await supabase.rpc("bulk_add_computers", { p: body }));
    if ((hit = /^\/api\/computers\/(\d+)\/accessories$/.exec(p))) {
      const pc = await getAsset(+hit[1]);
      if (pc.kind !== PC_KIND || pc.tracking !== "individual") fail(404, "Computer not found");
      if (!SLOTS.includes(body.kind)) fail(422, `Accessory type must be one of: ${SLOTS.join(", ")}`);
      const ser = String(body.serial_number || "").trim() || null;
      let aid = String(body.asset_id || "").trim();
      if (!aid) { const base = `${pc.asset_id}-${SLOT_CODES[body.kind]}`; aid = base; for (let n = 2; ; n++) { const x = await supabase.from("lab_assets").select("id").eq("asset_id", aid).maybeSingle(); if (!x.data) break; aid = `${base}-${n}`; } }
      const row = unwrap(await supabase.from("lab_assets").insert({ asset_id: aid, name: String(body.name || "").trim() || body.kind, category: "Computer", kind: body.kind, tracking: "individual", brand: String(body.brand || "").trim(), model: String(body.model || "").trim(),
        serial_number: ser, quantity: 1, working: 1, location: pc.location || "", purchase_date: pc.purchase_date, warranty_expiry: pc.warranty_expiry, supplier: pc.supplier || "", parent_pk: pc.id }).select("id").single()) as any;
      await logRow(row.id, "Link", `Registered and attached to ${pc.asset_id}`); await logRow(pc.id, "Link", `${body.kind} ${aid} attached`);
      return partOut(await getAsset(row.id));
    }
    if ((hit = /^\/api\/computers\/(\d+)\/link$/.exec(p))) {
      const pc = await getAsset(+hit[1]), a = await getAsset(body.accessory_pk);
      if (pc.kind !== PC_KIND || pc.tracking !== "individual") fail(404, "Computer not found");
      if (a.tracking !== "individual" || !SLOTS.includes(a.kind)) fail(422, "Only individually tracked accessories (CPU, Monitor, Keyboard, Mouse, UPS, Computer Accessories) can be linked");
      if (a.parent_pk === pc.id) fail(409, `${a.asset_id} is already linked to ${pc.asset_id}`);
      if (a.parent_pk) await logRow(a.parent_pk, "Link", `${a.kind} ${a.asset_id} moved to ${pc.asset_id}`);
      unwrap(await supabase.from("lab_assets").update({ parent_pk: pc.id, ...(pc.location ? { location: pc.location } : {}) }).eq("id", a.id));
      await logRow(a.id, "Link", `Attached to ${pc.asset_id}` + (a.parent_asset_id ? ` (moved from ${a.parent_asset_id})` : ""));
      await logRow(pc.id, "Link", `${a.kind} ${a.asset_id} attached` + (a.parent_asset_id ? ` (from ${a.parent_asset_id})` : ""));
      return partOut(await getAsset(a.id));
    }
    if ((hit = /^\/api\/computers\/unlink\/(\d+)$/.exec(p))) {
      const a = await getAsset(+hit[1]); if (!a.parent_pk) fail(404, "This accessory is not linked to a computer");
      unwrap(await supabase.from("lab_assets").update({ parent_pk: null }).eq("id", a.id));
      await logRow(a.id, "Link", `Detached from ${a.parent_asset_id}`); await logRow(a.parent_pk, "Link", `${a.kind} ${a.asset_id} detached`);
      return partOut(await getAsset(a.id));
    }
    if ((hit = /^\/api\/computers\/parts\/(\d+)$/.exec(p)) && m === "PATCH") {
      const pk = +hit[1], a = await getAsset(pk); if (a.tracking !== "individual") fail(404, "Part not found");
      const upd: any = {}; ["name", "brand", "model", "location", "remarks"].forEach((k) => { if (k in body) upd[k] = String(body[k] ?? "").trim(); });
      if ("name" in upd && !upd.name) fail(422, "Name cannot be empty");
      if ("serial_number" in body) {
        upd.serial_number = String(body.serial_number || "").trim() || null;
        if (upd.serial_number) { const dup = unwrap(await supabase.from("lab_assets").select("id").ilike("serial_number", upd.serial_number.replace(/[%_]/g, (c: string) => "\\" + c)).neq("id", pk).limit(1)) as any[]; if (dup.length) fail(409, "Serial number already registered to another asset"); }
      }
      if (body.condition) { const c = body.condition; Object.assign(upd, { working: +(c === "working"), damaged: +(c === "damaged"), under_maintenance: +(c === "under_maintenance") }); }
      if (Object.keys(upd).length) unwrap(await supabase.from("lab_assets").update(upd).eq("id", pk));
      const after = await getAsset(pk);
      if (body.condition && condOf(after) !== condOf(a)) await logRow(pk, "Other", `Condition: ${condOf(a)} -> ${condOf(after)}`);
      return partOut(after);
    }
    // ---------------- maintenance register (complaints) ----------------
    if (p === "/api/complaints" && m === "GET") {
      let r = supabase.from("complaints").select(CSEL);
      if (q.get("status")) r = r.eq("status", q.get("status")!);
      if (q.get("pending") === "true") r = r.neq("status", "Resolved");
      if (q.get("priority")) r = r.eq("priority", q.get("priority")!);
      if (q.get("asset_pk")) r = r.eq("asset_pk", +q.get("asset_pk")!);
      if (q.get("date_from")) r = r.gte("complaint_date", q.get("date_from")!);
      if (q.get("date_to")) r = r.lte("complaint_date", q.get("date_to")!);
      if (q.get("q")) { const t = likeEsc(q.get("q")!); r = r.or(["equipment_name", "description", "reported_by", "complaint_no", "assigned_technician"].map((c) => `${c}.ilike.%${t}%`).join(",")); }
      return (unwrap(await r.order("complaint_date", { ascending: false }).order("id", { ascending: false }).limit(2000) as any) as any[]).map(cOut);
    }
    if (p === "/api/complaints" && m === "POST") {
      const { asset, row } = await prepComplaint(body);
      const { data: { session } } = await supabase.auth.getSession();
      const ins = unwrap(await supabase.from("complaints").insert({ ...row, complaint_no: "TMP-" + Math.random().toString(36).slice(2, 12), created_by: session?.user.id }).select("id").single()) as any;
      const no = `CMP-${String(ins.id).padStart(4, "0")}`;
      unwrap(await supabase.from("complaints").update({ complaint_no: no }).eq("id", ins.id));
      if (row.status === "Resolved") await syncComplaintLog({ ...row, id: ins.id, complaint_no: no }, asset);
      return cOut(unwrap(await supabase.from("complaints").select(CSEL).eq("id", ins.id).single()));
    }
    if ((hit = /^\/api\/complaints\/(\d+)$/.exec(p))) {
      const id = +hit[1], cur = unwrap(await supabase.from("complaints").select("id, complaint_no").eq("id", id).maybeSingle()) as any; if (!cur) fail(404, "Complaint not found");
      if (m === "PUT") {
        const { asset, row } = await prepComplaint(body);
        unwrap(await supabase.from("complaints").update(row).eq("id", id));
        await syncComplaintLog({ ...row, id, complaint_no: cur.complaint_no }, asset);
        return cOut(unwrap(await supabase.from("complaints").select(CSEL).eq("id", id).single()));
      }
      if (m === "DELETE") { unwrap(await supabase.from("maintenance_logs").delete().eq("complaint_pk", id)); unwrap(await supabase.from("complaints").delete().eq("id", id)); return { deleted: true }; }
    }
    // ---------------- QR labels / scan ----------------
    if (p === "/api/labels" && m === "POST") {
      const base = String(body.base_url || "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(base)) fail(422, "Base URL must look like https://name.github.io/repo");
      const pks: number[] = [...new Set<number>(body.asset_pks || [])];
      const got = pks.length ? (unwrap(await supabase.from("assets_view").select("*").in("id", pks)) as any[]) : [];
      const byId = new Map(got.map((a) => [a.id, a])); if (!byId.size) fail(404, "None of the selected assets exist");
      const rows: any[] = [];
      for (const pk of pks) { const a = byId.get(pk); if (!a) continue; rows.push(a);
        if (body.include_children) rows.push(...(unwrap(await supabase.from("assets_view").select("*").eq("parent_pk", pk).order("kind").order("asset_id")) as any[]).filter((c) => !byId.has(c.id))); }
      const seen = new Set<number>(), out: any[] = [];
      for (const a of rows) { if (seen.has(a.id)) continue; seen.add(a.id);
        const url = `${base}/#/scan/${encodeURIComponent(a.asset_id)}`;
        const svg = (await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" })).replace("<svg ", '<svg style="background:#fff" ');
        out.push({ asset_pk: a.id, asset_id: a.asset_id, name: a.name, kind: a.kind || "", serial_number: a.serial_number || "", location: a.location || "", parent_asset_id: a.parent_asset_id || "", url, svg }); }
      return out;
    }
    if ((hit = /^\/api\/assets\/code\/(.+)$/.exec(p))) {
      const code = decodeURIComponent(hit[1]).trim();
      const a = unwrap(await supabase.from("assets_view").select("*").ilike("asset_id", code.replace(/[%_\\]/g, (c) => "\\" + c)).limit(1).maybeSingle()) as any;
      if (!a) fail(404, `No asset with ID '${code}'`);
      const lim = (t: string, o = "id") => supabase.from(t).select("*").eq("asset_pk", a.id).order(o, { ascending: false }).limit(50);
      const [kids, mt, tr, al, cp, par] = await Promise.all([supabase.from("assets_view").select("*").eq("parent_pk", a.id).order("kind").order("asset_id"),
        supabase.from("maintenance_logs").select("*").eq("asset_pk", a.id).order("log_date", { ascending: false }).order("id", { ascending: false }).limit(50), lim("asset_transfers"), lim("asset_allocations"),
        supabase.from("complaints").select(CSEL).eq("asset_pk", a.id).order("id", { ascending: false }).limit(50), a.parent_pk ? supabase.from("assets_view").select("*").eq("id", a.parent_pk).maybeSingle() : Promise.resolve({ data: null, error: null })]);
      return { asset: { ...aOut(a), condition: condOf(a) }, parent: (par as any).data ? partOut((par as any).data) : null, children: (unwrap(kids as any) as any[]).map(partOut),
        maintenance: (unwrap(mt as any) as any[]).map((x) => ({ date: x.log_date, kind: x.kind, description: x.description, cost: x.cost === null ? null : Number(x.cost), by: x.performed_by })),
        transfers: (unwrap(tr as any) as any[]).map((x) => ({ date: x.transferred_on, from: x.from_location, to: x.to_location, by: x.transferred_by })),
        allocations: (unwrap(al as any) as any[]).map((x) => ({ allocated_to: x.allocated_to, qty: x.qty, allocated_on: x.allocated_on, returned_on: x.returned_on || "" })),
        complaints: (unwrap(cp as any) as any[]).map(cOut) };
    }
    // ---------------- teachers ----------------
    if (p === "/api/teachers" && m === "GET") {
      let r = supabase.from("teachers").select("*");
      if (q.get("include_inactive") !== "true") r = r.eq("is_active", true);
      if (q.get("q")) { const t = likeEsc(q.get("q")!); r = r.or(["name", "teacher_code", "department", "subjects", "batches_text", "email"].map((c) => `${c}.ilike.%${t}%`).join(",")); }
      const ts = unwrap(await r.order("name") as any) as any[];
      const tt = unwrap(await supabase.from("timetable_entries").select("teacher_id, batch, division, subject")) as any[];
      return ts.map((t) => tOut(t, tt.filter((x) => x.teacher_id === t.id)));
    }
    if (p === "/api/teachers" && m === "POST") { const row = unwrap(await supabase.from("teachers").insert(await prepTeacher(body)).select("id").single()) as any; return oneTeacher(row.id); }
    if ((hit = /^\/api\/teachers\/(\d+)(\/active|\/history)?$/.exec(p))) {
      const id = +hit[1], sub = hit[2];
      if (!sub && m === "PUT") { await oneTeacher(id); unwrap(await supabase.from("teachers").update(await prepTeacher(body, id)).eq("id", id)); return oneTeacher(id); }
      if (sub === "/active") { await oneTeacher(id); unwrap(await supabase.from("teachers").update({ is_active: q.get("active") === "true" }).eq("id", id)); return oneTeacher(id); }
      if (sub === "/history") {
        const ls = unwrap(await supabase.from("issue_transactions").select("id, qty, returned_qty, issue_slips!inner(slip_no, issue_date, teacher_id), inventory_items(name)").eq("issue_slips.teacher_id", id) as any) as any[];
        return ls.sort((a, b) => b.issue_slips.issue_date.localeCompare(a.issue_slips.issue_date) || b.id - a.id).map((l) => ({ line_id: l.id, slip_no: l.issue_slips.slip_no, date: l.issue_slips.issue_date, item: l.inventory_items.name, qty: l.qty, outstanding: l.qty - l.returned_qty, status: lineStatus(l) }));
      }
      if (!sub && m === "DELETE") {
        const t = await oneTeacher(id);
        const used = (await cnt("issue_slips", "teacher_id", id)) + (await cnt("timetable_entries", "teacher_id", id));
        if (used) fail(409, "This teacher has issue or timetable records and cannot be deleted. Deactivate instead.");
        unwrap(await supabase.from("teachers").delete().eq("id", t.id)); return { deleted: true };
      }
    }
    // ---------------- batches / divisions ----------------
    if (p === "/api/batches/detail") {
      const bs = unwrap(await supabase.from("batches").select("*").order("name")) as any[];
      const sl = unwrap(await supabase.from("issue_slips").select("batch")) as any[], tt = unwrap(await supabase.from("timetable_entries").select("batch")) as any[];
      return bs.map((b) => ({ id: b.id, name: b.name, slips: sl.filter((x) => x.batch === b.name).length, sessions: tt.filter((x) => x.batch === b.name).length }));
    }
    if ((hit = /^\/api\/batches\/(\d+)$/.exec(p))) {
      const id = +hit[1];
      if (m === "PUT") { unwrap(await supabase.rpc("rename_batch", { bid: id, newname: q.get("name") || "" })); return { id, name: (q.get("name") || "").trim() }; }
      if (m === "DELETE") {
        const b = unwrap(await supabase.from("batches").select("name").eq("id", id).maybeSingle()) as any; if (!b) fail(404, "Batch not found");
        const used = (unwrap(await supabase.from("issue_slips").select("id").eq("batch", b.name).limit(1)) as any[]).length + (unwrap(await supabase.from("timetable_entries").select("id").eq("batch", b.name).limit(1)) as any[]).length;
        if (used) fail(409, "Batch is used by issue slips or the timetable and cannot be deleted");
        unwrap(await supabase.from("batches").delete().eq("id", id)); return { deleted: true };
      }
    }
    if ((hit = /^\/api\/divisions\/(\d+)$/.exec(p)) && m === "DELETE") {
      const d = unwrap(await supabase.from("divisions").select("name").eq("id", +hit[1]).maybeSingle()) as any; if (!d) fail(404, "Division not found");
      const used = (unwrap(await supabase.from("students").select("id").eq("division", d.name).limit(1)) as any[]).length + (unwrap(await supabase.from("timetable_entries").select("id").eq("division", d.name).limit(1)) as any[]).length;
      if (used) fail(409, "Division is in use by students, attendance or the timetable");
      unwrap(await supabase.from("divisions").delete().eq("id", +hit[1])); return { deleted: true };
    }
    if (p === "/api/dashboard") {
      const cnt = async (t: string) => (await supabase.from(t).select("id", { count: "exact", head: true }).eq("is_active", true)).count ?? 0;
      const [ns, nt, inv, lines, slips, rets] = await Promise.all([
        cnt("students"), cnt("teachers"),
        supabase.from("inventory_view").select("*").order("id"),
        supabase.from("issue_transactions").select("slip_id, qty, returned_qty"),
        supabase.from("issue_slips").select("slip_no, issue_date, students(name), teachers(name), issue_transactions(qty, returned_qty, inventory_items(name))").order("id", { ascending: false }).limit(6),
        supabase.from("return_transactions").select("qty, returned_on, issue_transactions(inventory_items(name), issue_slips(slip_no, students(name), teachers(name)))").order("id", { ascending: false }).limit(8),
      ]);
      const items = (unwrap(inv as any) as any[]).map(itemOut);
      const open = (unwrap(lines as any) as any[]).filter((l) => l.returned_qty < l.qty);
      return {
        stats: { total_students: ns, total_teachers: nt, total_assets: 0, total_computers: 0, available_equipment: items.reduce((a, i) => a + Math.max(i.available, 0), 0),
          currently_issued: open.reduce((a, l) => a + l.qty - l.returned_qty, 0), pending_returns: new Set(open.map((l) => l.slip_id)).size,
          damaged_equipment: 0, maintenance_requests: 0, todays_sessions: 0 },
        todays_timetable: [], upcoming_sessions: [], maintenance_alerts: [], warranty_expiring: [],
        recent_issues: (unwrap(slips as any) as any[]).map((s) => ({ slip_no: s.slip_no, date: s.issue_date, borrower: s.students?.name || s.teachers?.name || "",
          items: s.issue_transactions.map((l: any) => `${l.inventory_items.name} x${l.qty}`).join(", "), status: slipStatus(s.issue_transactions) })),
        recent_returns: (unwrap(rets as any) as any[]).map((r) => { const sl = r.issue_transactions.issue_slips; return { slip_no: sl.slip_no, item: r.issue_transactions.inventory_items.name, qty: r.qty, date: r.returned_on, borrower: sl.students?.name || sl.teachers?.name || "" }; }),
        low_stock: items.filter((i) => i.low_stock && i.min_stock > 0).map((i) => ({ source: "Inventory", name: i.name, available: i.available, min: i.min_stock })),
      };
    }
    return fail(501, "This section is not moved to Supabase yet (next stage)");
  };
  try { return (await out()) as T; } catch (e: any) {
    if (e instanceof ApiError) { if (e.status === 401 && !path.includes("/auth/")) { setToken(null); location.reload(); } throw e; }
    throw new ApiError(0, e?.message || "Network error");
  }
}

export async function login(username: string, password: string): Promise<User> {
  const email = username.includes("@") ? username : `${username.trim().toLowerCase()}@lab.local`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(401, "Incorrect username or password");
  setToken("1");
  return api<User>("/api/auth/me");
}

export const qs = (o: Record<string, any>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== "" && v != null && p.set(k, String(v)));
  return p.toString();
};

/** Download an authenticated file (CSV/PDF/XLSX/JSON). */
export async function download(path: string, filename: string) {
  const blob = await api<Blob>(path);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}
export async function openBlob(path: string, print = false) {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (print && w) w.addEventListener("load", () => w.print());
}
/** Local calendar date (not UTC), so "today" is correct late in the evening in India. */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
