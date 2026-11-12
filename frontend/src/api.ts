export interface User { id: number; username: string; full_name: string; role: string; can_mark_attendance: boolean }
const TOKEN = "rlb_token";
export const getToken = () => localStorage.getItem(TOKEN);
import { supabase } from "./supabase";
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
    fail(r.error.code === "23505" ? 409 : r.error.code === "23503" ? 409 : r.error.code === "42501" ? 403 : 400,
      r.error.code === "23505" ? "Already exists (duplicate value)" : r.error.message);
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
    if (p === "/api/teachers" && m === "GET") return unwrap(await supabase.from("teachers").select("*").order("name"));
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
