-- Update 1: Return Items + Issue History/Register. Run once in Supabase -> SQL Editor.
create or replace view register_view with (security_invoker = true) as
select t.id as line_id, s.id as slip_id, s.slip_no, s.issue_date, coalesce(s.batch,'') as batch, s.taken_by,
  coalesce(st.prn,'') as prn, coalesce(te.name,'') as teacher_name, coalesce(st.name,'') as student_name,
  coalesce(st.division,'') as division, coalesce(st.roll_no,'') as roll_no, i.name as item, t.qty, t.returned_qty,
  (t.qty - t.returned_qty) as outstanding, t.returned_on,
  case when t.returned_qty >= t.qty then 'Returned' when t.returned_qty > 0 then 'Partially Returned' else 'Not Returned' end as status
from issue_transactions t join issue_slips s on s.id = t.slip_id join inventory_items i on i.id = t.item_id
left join students st on st.id = s.student_id left join teachers te on te.id = s.teacher_id;

-- Return a whole slip (no "lines") or chosen quantities of its lines, all-or-nothing, with row locks.
create or replace function return_items(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare sl issue_slips; l issue_transactions; r record; ln jsonb; lid int; q int; n int := 0;
  rd date := (p->>'returned_on')::date; want jsonb := '{}'; iname text;
begin
  if my_role() not in ('admin','lab_assistant') then raise exception '403|Not allowed for your role'; end if;
  if rd is null then raise exception '422|Return date is required'; end if;
  if p ? 'slip_no' then
    select * into sl from issue_slips where slip_no = trim(p->>'slip_no') for update;
  else
    select s.* into sl from issue_slips s join issue_transactions t on t.slip_id = s.id
      where t.id = ((p->'lines'->0)->>'line_id')::int for update of s;
  end if;
  if sl.id is null then raise exception '404|Slip not found'; end if;
  if rd < sl.issue_date then raise exception '422|Return date cannot be before the issue date'; end if;
  if rd > current_date then raise exception '422|Return date cannot be in the future'; end if;
  perform 1 from issue_transactions where slip_id = sl.id order by id for update;
  if jsonb_typeof(p->'lines') is distinct from 'array' then
    for l in select * from issue_transactions where slip_id = sl.id and qty > returned_qty loop
      want := want || jsonb_build_object(l.id::text, l.qty - l.returned_qty);
    end loop;
  else
    for ln in select * from jsonb_array_elements(p->'lines') loop
      lid := (ln->>'line_id')::int; q := (ln->>'qty')::int;
      if not exists (select 1 from issue_transactions where id = lid and slip_id = sl.id) then
        raise exception '422|Line % does not belong to slip %', lid, sl.slip_no; end if;
      if q <= 0 then raise exception '422|Return quantity must be positive'; end if;
      want := want || jsonb_build_object(lid::text, coalesce((want->>lid::text)::int, 0) + q);
    end loop;
  end if;
  for r in select key, value::text::int as q from jsonb_each(want) loop
    select * into l from issue_transactions where id = r.key::int;
    if r.q > l.qty - l.returned_qty then
      select name into iname from inventory_items where id = l.item_id;
      raise exception '409|Only % of ''%'' outstanding; cannot return %', l.qty - l.returned_qty, iname, r.q; end if;
  end loop;
  if want = '{}'::jsonb then raise exception '409|Slip % has nothing left to return (already fully returned)', sl.slip_no; end if;
  for r in select key, value::text::int as q from jsonb_each(want) loop
    update issue_transactions set returned_qty = returned_qty + r.q,
      returned_on = case when returned_qty + r.q = qty then rd else returned_on end where id = r.key::int;
    insert into return_transactions(line_id, qty, returned_on, received_by, note)
      values (r.key::int, r.q, rd, auth.uid(), coalesce(p->>'note',''));
    n := n + 1;
  end loop;
  return jsonb_build_object('slip_no', sl.slip_no, 'lines_returned', n);
end $$;
grant execute on function return_items(jsonb) to authenticated;
