-- Update 4: Maintenance Register, Teachers, Batches. Run after update_3_assets.sql (or just run run_all_updates.sql).
-- Everyone signed in (incl. teachers) may file a complaint; only admin / lab_assistant may edit or delete.
drop policy if exists "anyone files complaints" on complaints;
create policy "anyone files complaints" on complaints for insert to authenticated with check (my_role() is not null);

-- Rename a batch everywhere (issue slips + timetable keep the batch as text), all-or-nothing.
create or replace function rename_batch(bid int, newname text) returns void language plpgsql security definer set search_path = public as $$
declare old text; nn text := trim(coalesce(newname,''));
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  select name into old from batches where id = bid for update;
  if old is null then raise exception '404|Batch not found'; end if;
  if nn = '' then raise exception '422|Batch name is required'; end if;
  if exists (select 1 from batches where lower(name) = lower(nn) and id <> bid) then raise exception '409|Batch already exists'; end if;
  update batches set name = nn where id = bid;
  update issue_slips set batch = nn where batch = old;
  update timetable_entries set batch = nn where batch = old;
end $$;
grant execute on function rename_batch(int, text) to authenticated;
