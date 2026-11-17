-- Update 9: Full Kit (7) + Teacher Kit (Box 23). Safe to run again.
-- Teacher Kit (Box 23) is always issued to a professor (teachers only). The 7 Full Kits are normal daily-use kits.
update inventory_items set teacher_only = false, daily_use = true, box_no = '', notes = '7 full kits' where name = 'Full Kit';
insert into inventory_items(name, category, total_qty, reserved_qty, not_working_qty, box_no, teacher_only, daily_use, notes)
values ('Teacher Kit (Box 23)', 'Kit', 1, 0, 0, '23', true, true, 'Always assigned to a professor - cannot be issued to students')
on conflict (name) do update set category = excluded.category, total_qty = excluded.total_qty, box_no = excluded.box_no,
  teacher_only = true, daily_use = true, notes = excluded.notes;
notify pgrst, 'reload schema';