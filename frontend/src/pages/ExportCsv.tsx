import { Download } from "lucide-react";
import { download } from "../api";
import { Page, useToast } from "../ui";

const EXPORTS: [string, string, string, string][] = [
  ["Issue Log", "Slip No, Date, Batch, Taken by, PRN, Teacher, Student name, Division, Roll No, Item, Qty, Return date, Status. One row per slip.", "/api/register/export?fmt=csv", "Issue_Log.csv"],
  ["Student Records", "PRN, Student name, Division, Roll no (same layout the student import accepts).", "/api/export/students", "students.csv"],
  ["Teacher Records", "Teacher ID, name, department, designation, contact, subjects, batches, status.", "/api/export/teachers", "teachers.csv"],
  ["Lab Timetable", "Day, time from/to, batch, division, subject, teacher, lab/room, remarks.", "/api/export/timetable", "lab_timetable.csv"],
  ["Lab Assets", "Asset ID, name, category, brand, model, serial, quantities by condition, location, purchase and warranty data.", "/api/export/assets", "lab_assets.csv"],
  ["Computer Systems", "One row per PC: serial numbers of its CPU, monitor, keyboard, mouse, UPS, other accessories and what is missing.", "/api/export/computers", "computer_systems.csv"],
  ["Equipment Allocations", "Who holds which equipment, quantities and dates.", "/api/export/allocations", "equipment_allocations.csv"],
  ["Maintenance Register", "Complaint ID, date, equipment, asset, problem, priority, technician, status, resolution.", "/api/export/maintenance", "maintenance_register.csv"],
  ["Inventory", "Item, category, total, out now, available, minimum stock.", "/api/export/inventory", "inventory.csv"],
];

export default function ExportCsv() {
  const toast = useToast();
  return (
    <Page title="CSV Export">
      <div className="grid gap-3 md:grid-cols-2">
        {EXPORTS.map(([t, d, url, file]) => (
          <div key={t} className="card flex items-start justify-between gap-3"><div><h2 className="font-medium text-slate-50">{t}</h2><p className="mt-1 text-xs text-slate-400">{d}</p></div>
            <button className="btn shrink-0" onClick={() => download(url, file).catch((e) => toast("err", e.message))}><Download size={16} />CSV</button></div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Files open directly in Excel (UTF-8 with BOM). Report-style exports with date filters are under Reports.</p>
    </Page>
  );
}
