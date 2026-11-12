-- Update 2: tables for Lab Assets, Computers, Allocations, Maintenance, Lab Timetable. Run once in Supabase -> SQL Editor.
create table if not exists lab_assets (
  id serial primary key, asset_id text unique not null, name text not null, category text not null default 'General',
  kind text not null default '', tracking text not null default 'quantity' check (tracking in ('individual','quantity')),
  brand text not null default '', model text not null default '', serial_number text unique,
  quantity int not null default 1, working int not null default 1, damaged int not null default 0,
  under_maintenance int not null default 0, min_quantity int not null default 0, location text not null default '',
  purchase_date date, warranty_expiry date, supplier text not null default '', purchase_cost numeric,
  remarks text not null default '', parent_pk int references lab_assets, created_at timestamptz default now(),
  check (quantity >= 0 and working >= 0 and damaged >= 0 and under_maintenance >= 0),
  check (working + damaged + under_maintenance = quantity), check (parent_pk is null or parent_pk <> id));
create index if not exists ix_lab_assets_parent on lab_assets(parent_pk);
create table if not exists timetable_entries (
  id serial primary key, day text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  time_from text not null, time_to text not null, batch text not null, division text not null default '',
  subject text not null, teacher_id int not null references teachers, lab text not null default '',
  remarks text not null default '', created_at timestamptz default now(), check (time_from < time_to));
create table if not exists asset_allocations (
  id serial primary key, asset_pk int not null references lab_assets, allocated_to text not null, purpose text not null default '',
  qty int not null check (qty > 0), location text not null default '', allocated_on date not null, returned_on date,
  remarks text not null default '', created_by uuid references profiles);
create table if not exists complaints (
  id serial primary key, complaint_no text unique not null, complaint_date date not null, equipment_name text not null,
  asset_pk int references lab_assets, description text not null, reported_by text not null default '',
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  assigned_technician text not null default '', status text not null default 'Open' check (status in ('Open','In Progress','Resolved')),
  resolution_details text not null default '', resolution_date date, remarks text not null default '',
  created_by uuid references profiles, created_at timestamptz default now());
do $$ declare t text; begin
  foreach t in array array['lab_assets','timetable_entries','asset_allocations','complaints'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using (my_role() is not null)', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (my_role() in (''admin'',''lab_assistant'')) with check (my_role() in (''admin'',''lab_assistant''))', t);
  end loop; end $$;
