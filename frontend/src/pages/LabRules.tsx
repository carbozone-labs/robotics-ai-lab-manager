import { Printer } from "lucide-react";
import { Page } from "../ui";

const RULES: [string, string][] = [
  ["ID card is compulsory", "Every student must wear/carry their valid college ID card inside the lab."],
  ["Keep bags on the provided rack", "Bags, backpacks and other personal belongings are not allowed inside the lab."],
  ["Do not remove or disconnect computer accessories", "Mouse, keyboard, LAN cable, power cable, pins/connectors, headphones, etc. must not be removed, exchanged or disconnected from any PC."],
  ["Arrange chairs properly", "After using the lab, push the chair back under/near the desk and leave your workstation neat."],
  ["Handle computers with care", "Do not hit, shake, move or mishandle the computer, monitor, keyboard or other equipment."],
  ["Do not touch power connections", "Do not switch, unplug or modify power connections, UPS connections or other electrical equipment."],
  ["Do not change system settings", "Do not change Windows settings, network settings, installed software, wallpapers, passwords or other system configurations without permission."],
  ["No unauthorized software installation", "Do not install applications, games, extensions or other software without permission from the lab staff."],
  ["No food or drinks", "Food, beverages and water bottles should not be kept near the computers."],
  ["Maintain silence & discipline", "Avoid unnecessary talking, shouting or disturbing other students during practical sessions."],
  ["Use only your assigned PC", "Students should use the computer/workstation assigned to them unless instructed otherwise."],
  ["Report problems immediately", "If you find any damaged equipment, loose connection, software issue or other problem, inform the Lab Assistant immediately. Do not try to fix it yourself."],
  ["Leave your workstation clean", "Before leaving, check that the computer, desk and surrounding area are clean and properly arranged."],
];

export default function LabRules() {
  return (
    <Page title="Lab Instructions" actions={<button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Print</button>}>
      <div className="card text-sm text-slate-300">
        <b className="text-slate-50">Room 1202 - Project Laboratory</b> &middot; Vishwakarma Institute of Technology, Pune &middot; Academic Year 2026-27, Semester 1 &middot; W.E.F. 15-Sep-2026 to 10-Jan-2027
      </div>
      <div className="print-area card">
        <h2 className="mb-3 font-semibold text-cyan-300">Computer Lab - Student Instructions</h2>
        <ol className="space-y-3">
          {RULES.map(([t, d], i) => (
            <li key={t} className="flex gap-3"><span className="w-6 shrink-0 text-right font-mono text-cyan-300">{i + 1}.</span>
              <div><div className="font-medium uppercase tracking-wide text-slate-100">{t}</div><div className="text-sm text-slate-300">{d}</div></div></li>
          ))}
        </ol>
        <div className="mt-5 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          <b>IMPORTANT:</b> Any damage, unauthorized removal of equipment, or misuse of laboratory resources may be reported to the concerned faculty/department and may result in disciplinary action.
        </div>
        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">Please use the lab responsibly - these facilities are for everyone.</p>
      </div>
    </Page>
  );
}
