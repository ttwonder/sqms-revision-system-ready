-- SQMS 程序書修訂需求管理系統 Supabase Schema
-- 在 Supabase SQL Editor 執行。前端公開可讀/新增/修改；只有管理員可軟刪除。

create extension if not exists pgcrypto;

create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  applicant_name text not null,
  request_source text not null default '外部檢查',
  category_code text not null check (category_code in ('SMM','SMP','SMI','SQMS','ISO')),
  topic_code text not null,
  manual_item_code text,
  scope_note text,
  suggested_change text not null,
  change_reason text not null,
  target_due_date date not null,
  urgency text not null check (urgency in ('urgent','high','medium','low')) default 'medium',
  need_related_form_update boolean not null default false,
  reference_materials text,
  status text not null check (status in ('new','processing','completed','cancelled')) default 'new',
  completion_date date,
  public_edit_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by text
);

alter table change_requests add column if not exists request_source text not null default '外部檢查';

create index if not exists idx_change_requests_created_at on change_requests(created_at);
create index if not exists idx_change_requests_source on change_requests(request_source);
create index if not exists idx_change_requests_status on change_requests(status);
create index if not exists idx_change_requests_due on change_requests(target_due_date);
create index if not exists idx_change_requests_category on change_requests(category_code);
create index if not exists idx_change_requests_topic on change_requests(topic_code);
create index if not exists idx_change_requests_not_deleted on change_requests(is_deleted);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  role text not null check (role in ('owner','admin')) default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_users_email on admin_users(lower(email));
create index if not exists idx_admin_users_active on admin_users(active);

create table if not exists personnel_users (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  name text not null,
  username text not null,
  password text,
  role text not null check (role in ('admin','operator')) default 'operator',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department, name)
);

create index if not exists idx_personnel_users_department on personnel_users(department);
create index if not exists idx_personnel_users_active on personnel_users(active);
create index if not exists idx_personnel_users_username on personnel_users(username);

-- 依據「海運辦公室人員清單2.xlsx」匯入的正式人員名單。
-- Owner / 雲端管理員帳號仍由 admin_users 管理，此處不覆蓋 owner 資訊。
with seed(department, name, username, role, active, sort_order) as (
  values
    ('管理層', '呂學修副總', '呂學修副總', 'operator', true, 1),
    ('管理層', '蔡宏仁協理', '蔡宏仁協理', 'operator', true, 2),
    ('管理層', '李勻寧協理', '李勻寧協理', 'operator', true, 3),
    ('管理組', '陳治先', '陳治先', 'operator', true, 4),
    ('管理組', '王昱民', '王昱民', 'operator', true, 5),
    ('管理組', '方憲鵬組長', '方憲鵬組長', 'operator', true, 6),
    ('管理組', '陳韋自', '陳韋自', 'operator', true, 7),
    ('管理組', '紀煒邦', '紀煒邦', 'operator', true, 8),
    ('管理組', '李雅雯', '李雅雯', 'operator', true, 9),
    ('管理組', '曾湘柔', '曾湘柔', 'operator', true, 10),
    ('管理組', '周麗如', '周麗如', 'operator', true, 11),
    ('資材組', '林建瑋', '林建瑋', 'operator', true, 12),
    ('資材組', '鄧兆修', '鄧兆修', 'operator', true, 13),
    ('資材組', '鄧浚宏', '鄧浚宏', 'operator', true, 14),
    ('資材組', '徐永兆', '徐永兆', 'operator', true, 15),
    ('資材組', '王梓名', '王梓名', 'operator', true, 16),
    ('資材組', '林大詠', '林大詠', 'operator', true, 17),
    ('資材組', '周瑞廉組長', '周瑞廉組長', 'operator', true, 18),
    ('資材組', '楊延興', '楊延興', 'operator', true, 19),
    ('資材組', '許政子', '許政子', 'operator', true, 20),
    ('資材組', '楊絜崴', '楊絜崴', 'operator', true, 21),
    ('營業處', '王慈芬', '王慈芬', 'operator', true, 22),
    ('營業處', '劉小萍', '劉小萍', 'operator', true, 23),
    ('營業處', '翁敏芳', '翁敏芳', 'operator', true, 24),
    ('營業處', '李純瑛', '李純瑛', 'operator', true, 25),
    ('營業處', '魏利育', '魏利育', 'operator', true, 26),
    ('營業處', '賴思妤', '賴思妤', 'operator', true, 27),
    ('營業處', '陳建中', '陳建中', 'operator', true, 28),
    ('營業處', '粘家萍', '粘家萍', 'operator', true, 29),
    ('營業處', '邱義泰', '邱義泰', 'operator', true, 30),
    ('營業處', '倪嘉', '倪嘉', 'operator', true, 31),
    ('營業處', '李耿志', '李耿志', 'operator', true, 32),
    ('船工處', '廖晥妤', '廖晥妤', 'operator', true, 33),
    ('船工處', '吳燕桂', '吳燕桂', 'operator', true, 34),
    ('船工處', '楊弘羽', '楊弘羽', 'operator', true, 35),
    ('船工處', '王威譯', '王威譯', 'operator', true, 36),
    ('船工處', '李曜均', '李曜均', 'operator', true, 37),
    ('船工處', '劉煥章處長', '劉煥章處長', 'operator', true, 38),
    ('船工處', '林冠辰', '林冠辰', 'operator', true, 39),
    ('船工處', '盧玉玫', '盧玉玫', 'operator', true, 40),
    ('船工處', '林儀婷', '林儀婷', 'operator', true, 41),
    ('船工處', '王昱斌', '王昱斌', 'operator', true, 42),
    ('船工處', '賴朝瑜', '賴朝瑜', 'operator', true, 43),
    ('船工處', '陳思翰', '陳思翰', 'operator', true, 44),
    ('船工處', '顏仲楷', '顏仲楷', 'operator', true, 45),
    ('安衛處', '楊順婷', '楊順婷', 'operator', true, 46),
    ('安衛處', '施品帆', '施品帆', 'operator', true, 47),
    ('安衛處', '紀芳琪', '紀芳琪', 'operator', true, 48),
    ('安衛處', '蘇上銘', '蘇上銘', 'operator', true, 49),
    ('安衛處', '韓竹雅', '韓竹雅', 'operator', true, 50),
    ('安衛處', '劉定淮', '劉定淮', 'operator', true, 51),
    ('安衛處', '江佳勳', '江佳勳', 'operator', true, 52),
    ('安衛處', '張鼎東', '張鼎東', 'operator', true, 53),
    ('航運處', '吳建泰處長', '吳建泰處長', 'operator', true, 54),
    ('督導', '尹德垿', '尹德垿', 'operator', true, 55),
    ('督導', '蔡繼來', '蔡繼來', 'operator', true, 56),
    ('督導', '翁振傑', '翁振傑', 'operator', true, 57),
    ('督導', '黃傑治', '黃傑治', 'operator', true, 58),
    ('督導', '陳寰頤', '陳寰頤', 'operator', true, 59),
    ('督導', '李幸龍', '李幸龍', 'operator', true, 60),
    ('督導', '廖麗蓁', '廖麗蓁', 'operator', true, 61),
    ('督導', '張議榮', '張議榮', 'operator', true, 62),
    ('督導', '林滄龍', '林滄龍', 'operator', true, 63),
    ('督導', '蔡明哲', '蔡明哲', 'operator', true, 64),
    ('督導', '陳昱宏', '陳昱宏', 'operator', true, 65),
    ('督導', '陳思慧', '陳思慧', 'operator', true, 66),
    ('督導', '張雅琪', '張雅琪', 'operator', true, 67),
    ('督導', '張和中', '張和中', 'operator', true, 68),
    ('督導', '張志林', '張志林', 'operator', true, 69),
    ('督導', '餘雙', '餘雙', 'operator', true, 70),
    ('督導', '唐洪新', '唐洪新', 'operator', true, 71),
    ('督導', '秦冰', '秦冰', 'operator', true, 72),
    ('督導', '黃燕華', '黃燕華', 'operator', true, 73),
    ('督導', '潘獻波', '潘獻波', 'operator', true, 74),
    ('督導', '毛剛', '毛剛', 'operator', true, 75),
    ('船員組', '徐意倫', '徐意倫', 'operator', true, 76),
    ('船員組', '古美雪', '古美雪', 'operator', true, 77),
    ('船員組', '薛英林', '薛英林', 'operator', true, 78),
    ('船員組', '張育菁', '張育菁', 'operator', true, 79),
    ('船員組', '謝嘉穎', '謝嘉穎', 'operator', true, 80),
    ('船員組', '王鈺婷', '王鈺婷', 'operator', true, 81),
    ('船員組', '湯雅帆', '湯雅帆', 'operator', true, 82),
    ('船員組', '陳必恆', '陳必恆', 'operator', true, 83),
    ('船員組', '林竺諼', '林竺諼', 'operator', true, 84),
    ('船員組', '鄭詩璇', '鄭詩璇', 'operator', true, 85),
    ('船員組', '陳昱勳', '陳昱勳', 'operator', true, 86),
    ('船員組', '胡峻瑋', '胡峻瑋', 'operator', true, 87),
    ('船員組', '吳思葦', '吳思葦', 'operator', true, 88),
    ('航運組', '陳秀玉', '陳秀玉', 'operator', true, 89),
    ('航運組', '黃駿達', '黃駿達', 'operator', true, 90),
    ('航運組', '江嘉卿', '江嘉卿', 'operator', true, 91),
    ('航運組', '陳秋縈', '陳秋縈', 'operator', true, 92),
    ('航運組', '溫雅媛', '溫雅媛', 'operator', true, 93),
    ('航運組', '王聖傑', '王聖傑', 'operator', true, 94),
    ('航運組', '楊治華', '楊治華', 'operator', true, 95),
    ('航運組', '謝侑糖', '謝侑糖', 'operator', true, 96),
    ('航運組', '劉彥輝', '劉彥輝', 'operator', true, 97),
    ('航運組', '陳芮蓁', '陳芮蓁', 'operator', true, 98),
    ('海技組', '朱世毅', '朱世毅', 'operator', true, 99),
    ('海技組', '陳宜斌', '陳宜斌', 'operator', true, 100),
    ('海技組', '柯香吟', '柯香吟', 'operator', true, 101),
    ('海技組', '陳思樺', '陳思樺', 'operator', true, 102),
    ('海技組', '林建志', '林建志', 'operator', true, 103),
    ('海技組', '張嘉珈', '張嘉珈', 'operator', true, 104),
    ('海技組', '吳易安', '吳易安', 'operator', true, 105)
), upserted as (
  insert into personnel_users (department, name, username, role, active, sort_order)
  select department, name, username, role, active, sort_order from seed
  on conflict (department, name) do update set
    username = excluded.username,
    role = excluded.role,
    active = true,
    sort_order = excluded.sort_order,
    updated_at = now()
  returning department, name
)
update personnel_users p
set active = false, updated_at = now()
where not exists (select 1 from seed s where s.department = p.department and s.name = p.name);

create or replace view public_personnel_users as
select
  id,
  department,
  name,
  username,
  role,
  active,
  sort_order,
  created_at,
  updated_at,
  coalesce(nullif(password, ''), '') <> '' as has_password
from personnel_users
where active = true;

grant select on public_personnel_users to anon, authenticated;

create or replace function verify_personnel_password(p_personnel_id uuid, p_password text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from personnel_users
    where id = p_personnel_id
      and active = true
      and coalesce(password, '') = coalesce(p_password, '')
      and coalesce(password, '') <> ''
  );
$$;

grant execute on function verify_personnel_password(uuid, text) to anon, authenticated;

create or replace function soft_delete_request_by_personnel(
  p_request_id uuid,
  p_personnel_id uuid,
  p_deleted_by text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists (
    select 1
    from personnel_users
    where id = p_personnel_id
      and active = true
      and role = 'admin'
  ) into allowed;

  if not allowed then
    return false;
  end if;

  perform set_config('app.allow_personnel_soft_delete', 'on', true);

  update change_requests
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = coalesce(nullif(p_deleted_by, ''), 'personnel-admin'),
    updated_at = now()
  where id = p_request_id
    and is_deleted = false;

  return found;
end;
$$;

grant execute on function soft_delete_request_by_personnel(uuid, uuid, text) to anon, authenticated;

-- 首位 owner：請按需要修改為你的主要管理員 email。
insert into admin_users (email, display_name, role, active)
values ('tuotuoworm@outlook.com', 'System Owner', 'owner', true)
on conflict (email) do update set role = 'owner', active = true, updated_at = now();

create or replace function is_sqms_admin(check_email text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where lower(email) = lower(coalesce(nullif(check_email, ''), auth.jwt() ->> 'email'))
      and active = true
  );
$$;

create or replace function is_sqms_owner(check_email text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where lower(email) = lower(coalesce(nullif(check_email, ''), auth.jwt() ->> 'email'))
      and active = true
      and role = 'owner'
  );
$$;

grant execute on function is_sqms_admin(text) to anon, authenticated;
grant execute on function is_sqms_owner(text) to anon, authenticated;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_change_requests_updated_at on change_requests;
create trigger trg_change_requests_updated_at
before update on change_requests
for each row execute function set_updated_at();

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
before update on admin_users
for each row execute function set_updated_at();

drop trigger if exists trg_personnel_users_updated_at on personnel_users;
create trigger trg_personnel_users_updated_at
before update on personnel_users
for each row execute function set_updated_at();

-- 非管理員不可透過 UPDATE 改動軟刪除欄位；管理員刪除由前端登入後執行。
create or replace function protect_public_delete_fields()
returns trigger language plpgsql as $$
begin
  if not is_sqms_admin() and current_setting('app.allow_personnel_soft_delete', true) <> 'on' then
    new.is_deleted := old.is_deleted;
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_public_delete_fields on change_requests;
create trigger trg_protect_public_delete_fields
before update on change_requests
for each row execute function protect_public_delete_fields();

alter table change_requests enable row level security;
alter table admin_users enable row level security;
alter table personnel_users enable row level security;

drop policy if exists "public read active requests" on change_requests;
create policy "public read active requests"
on change_requests for select
to anon, authenticated
using (is_deleted = false);

drop policy if exists "public insert requests" on change_requests;
create policy "public insert requests"
on change_requests for insert
to anon, authenticated
with check (is_deleted = false);

drop policy if exists "public update active requests" on change_requests;
create policy "public update active requests"
on change_requests for update
to anon, authenticated
using (is_deleted = false)
with check (true);

-- 注意：不建立 delete policy，避免硬刪除。
-- 管理員軟刪除同樣走 UPDATE；前端只對已登入且列入 admin_users 的管理員顯示刪除按鈕。

drop policy if exists "admins can read admin users" on admin_users;
create policy "admins can read admin users"
on admin_users for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email') or is_sqms_admin());

drop policy if exists "owners can insert admin users" on admin_users;
create policy "owners can insert admin users"
on admin_users for insert
to authenticated
with check (is_sqms_owner());

drop policy if exists "owners can update admin users" on admin_users;
create policy "owners can update admin users"
on admin_users for update
to authenticated
using (is_sqms_owner())
with check (is_sqms_owner());

-- 注意：不建立 admin_users delete policy；停用管理員請把 active 改為 false。

-- 人員與權限管控：管理員可讀，只有 owner 可新增、修改、停用人員；owner 雲端管理員資料仍由 admin_users 管理。
drop policy if exists "admins can read personnel users" on personnel_users;
create policy "admins can read personnel users"
on personnel_users for select
to authenticated
using (is_sqms_admin());

drop policy if exists "owners can insert personnel users" on personnel_users;
create policy "owners can insert personnel users"
on personnel_users for insert
to authenticated
with check (is_sqms_owner());

drop policy if exists "owners can update personnel users" on personnel_users;
create policy "owners can update personnel users"
on personnel_users for update
to authenticated
using (is_sqms_owner())
with check (is_sqms_owner());

-- 注意：不建立 personnel_users delete policy；停用人員請把 active 改為 false。
