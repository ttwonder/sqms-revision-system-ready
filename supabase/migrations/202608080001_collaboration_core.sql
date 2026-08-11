-- SQMS collaboration core (additive migration)
-- Apply after supabase/schema.sql. This migration is intentionally not run by the frontend.

begin;

create extension if not exists pgcrypto;

alter table change_requests
  add column if not exists revision bigint not null default 1,
  add column if not exists created_by_personnel_id uuid references personnel_users(id) on delete set null,
  add column if not exists updated_by_personnel_id uuid references personnel_users(id) on delete set null;

alter table personnel_users
  add column if not exists password_hash text;

update personnel_users
set
  password_hash = crypt(password, gen_salt('bf')),
  password = null,
  updated_at = now()
where coalesce(password_hash, '') = ''
  and coalesce(password, '') <> '';

update personnel_users
set password = null
where password is not null;

create table if not exists personnel_sessions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  personnel_id uuid not null references personnel_users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_personnel_sessions_personnel
  on personnel_sessions(personnel_id);
create index if not exists idx_personnel_sessions_expiry
  on personnel_sessions(expires_at);

create table if not exists request_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into request_sources (name, sort_order)
values
  ('外部檢查', 10),
  ('內部檢查', 20),
  ('Master Review', 30),
  ('安全會議', 40),
  ('MOC需求', 50),
  ('法規/外部信息要求', 60),
  ('事故/事件', 70)
on conflict (name) do update
set active = true;

insert into request_sources (name, sort_order)
select distinct trim(request_source), 1000
from change_requests
where coalesce(trim(request_source), '') <> ''
on conflict (name) do update
set active = true;

create table if not exists daily_request_counters (
  business_date date primary key,
  last_value integer not null check (last_value > 0),
  updated_at timestamptz not null default now()
);

insert into daily_request_counters (business_date, last_value)
select
  to_date(substring(request_no from 6 for 8), 'YYYYMMDD'),
  max(substring(request_no from 15)::integer)
from change_requests
where request_no ~ '^SQMS-[0-9]{8}-[0-9]+$'
group by substring(request_no from 6 for 8)
on conflict (business_date) do update
set
  last_value = greatest(daily_request_counters.last_value, excluded.last_value),
  updated_at = now();

create table if not exists request_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  request_id uuid not null references change_requests(id) on delete restrict,
  revision bigint not null,
  base_revision bigint,
  event_type text not null check (event_type in ('imported','created','patched','status_changed','soft_deleted','noop')),
  changed_fields text[] not null default '{}'::text[],
  overlap_fields text[] not null default '{}'::text[],
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  actor_auth_user_id uuid,
  actor_personnel_id uuid references personnel_users(id) on delete set null,
  actor_label text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_request_events_request_revision
  on request_events(request_id, revision, created_at);
create index if not exists idx_request_events_created_at
  on request_events(created_at);

insert into request_events (
  operation_id,
  request_id,
  revision,
  event_type,
  changed_fields,
  after_snapshot,
  actor_label,
  created_at
)
select
  gen_random_uuid(),
  request.id,
  request.revision,
  'imported',
  '{}'::text[],
  to_jsonb(request),
  '既有資料匯入',
  request.created_at
from change_requests request
where not exists (
  select 1
  from request_events event
  where event.request_id = request.id
);

create or replace function current_sqms_personnel_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select session.personnel_id
  from personnel_sessions session
  join personnel_users personnel on personnel.id = session.personnel_id
  where session.auth_user_id = auth.uid()
    and session.expires_at > now()
    and personnel.active = true
  limit 1;
$$;

create or replace function current_sqms_actor_label()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select personnel.department || ' / ' || personnel.name
      from personnel_users personnel
      where personnel.id = current_sqms_personnel_id()
    ),
    nullif(auth.jwt() ->> 'email', ''),
    '訪客'
  );
$$;

create or replace function can_edit_sqms_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_sqms_admin() or current_sqms_personnel_id() is not null;
$$;

create or replace function can_manage_sqms_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_sqms_admin() or exists (
    select 1
    from personnel_users personnel
    where personnel.id = current_sqms_personnel_id()
      and personnel.active = true
      and personnel.role = 'admin'
  );
$$;

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
  coalesce(password_hash, '') <> '' as has_password
from personnel_users
where active = true;

grant select on public_personnel_users to anon, authenticated;

create or replace function claim_personnel_session(
  p_personnel_id uuid,
  p_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  personnel personnel_users%rowtype;
begin
  if auth.uid() is null then
    raise exception '需要有效的瀏覽器身份，請重新整理後再試';
  end if;

  select *
  into personnel
  from personnel_users
  where id = p_personnel_id
    and active = true
  for update;

  if not found then
    raise exception '找不到可登入的人員';
  end if;

  if coalesce(personnel.password_hash, '') <> ''
    and crypt(coalesce(p_password, ''), personnel.password_hash) <> personnel.password_hash then
    raise exception '密碼錯誤';
  end if;

  insert into personnel_sessions (
    auth_user_id,
    personnel_id,
    verified_at,
    expires_at,
    updated_at
  )
  values (
    auth.uid(),
    personnel.id,
    now(),
    now() + interval '90 days',
    now()
  )
  on conflict (auth_user_id) do update
  set
    personnel_id = excluded.personnel_id,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'id', personnel.id,
    'department', personnel.department,
    'name', personnel.name,
    'username', personnel.username,
    'role', personnel.role,
    'active', personnel.active,
    'sort_order', personnel.sort_order,
    'has_password', coalesce(personnel.password_hash, '') <> '',
    'created_at', personnel.created_at,
    'updated_at', personnel.updated_at
  );
end;
$$;

create or replace function get_current_personnel_session()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(public_personnel)
  from public_personnel_users public_personnel
  where public_personnel.id = current_sqms_personnel_id();
$$;

create or replace function release_personnel_session()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from personnel_sessions
  where auth_user_id = auth.uid();
  return found;
end;
$$;

create or replace function verify_personnel_password(p_personnel_id uuid, p_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from personnel_users personnel
    where personnel.id = p_personnel_id
      and personnel.active = true
      and coalesce(personnel.password_hash, '') <> ''
      and crypt(coalesce(p_password, ''), personnel.password_hash) = personnel.password_hash
  );
$$;

create or replace function save_personnel_user_by_owner(
  p_id uuid,
  p_department text,
  p_name text,
  p_username text,
  p_password text,
  p_role text,
  p_active boolean,
  p_sort_order integer
)
returns personnel_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  saved personnel_users%rowtype;
  next_password_hash text;
begin
  if not is_sqms_owner() then
    raise exception '只有 Owner 可以保存人員修改';
  end if;

  if coalesce(trim(p_department), '') = '' or coalesce(trim(p_name), '') = '' then
    raise exception '部門與人員姓名不可為空';
  end if;

  if p_role not in ('admin', 'operator') then
    raise exception '人員角色不正確';
  end if;

  if coalesce(p_password, '') <> '' then
    next_password_hash := crypt(p_password, gen_salt('bf'));
  elsif p_id is not null then
    select password_hash into next_password_hash
    from personnel_users
    where id = p_id;
  end if;

  if p_id is null then
    insert into personnel_users (
      department,
      name,
      username,
      password,
      password_hash,
      role,
      active,
      sort_order
    )
    values (
      trim(p_department),
      trim(p_name),
      coalesce(nullif(trim(p_username), ''), trim(p_name)),
      null,
      next_password_hash,
      p_role,
      coalesce(p_active, true),
      coalesce(p_sort_order, 0)
    )
    on conflict (department, name) do update
    set
      username = excluded.username,
      password = null,
      password_hash = coalesce(excluded.password_hash, personnel_users.password_hash),
      role = excluded.role,
      active = excluded.active,
      sort_order = excluded.sort_order,
      updated_at = now()
    returning * into saved;
  else
    update personnel_users
    set
      department = trim(p_department),
      name = trim(p_name),
      username = coalesce(nullif(trim(p_username), ''), trim(p_name)),
      password = null,
      password_hash = next_password_hash,
      role = p_role,
      active = coalesce(p_active, true),
      sort_order = coalesce(p_sort_order, 0),
      updated_at = now()
    where id = p_id
    returning * into saved;

    if not found then
      raise exception '找不到要修改的人員';
    end if;
  end if;

  return saved;
end;
$$;

create or replace function create_change_request(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_request_id uuid;
  saved change_requests%rowtype;
  request_business_date date := (now() at time zone 'Asia/Taipei')::date;
  sequence_value integer;
  generated_request_no text;
  actor_personnel_id uuid := current_sqms_personnel_id();
begin
  if auth.uid() is null then
    raise exception '需要有效的瀏覽器身份，請重新整理後再試';
  end if;

  if p_operation_id is null then
    raise exception '缺少操作編號';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select event.request_id
  into existing_request_id
  from request_events event
  where event.operation_id = p_operation_id;

  if found then
    select * into saved
    from change_requests
    where id = existing_request_id;
    return to_jsonb(saved);
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception '新增需求資料格式錯誤';
  end if;

  if coalesce(nullif(trim(p_payload ->> 'request_source'), ''), '') = ''
    or coalesce(nullif(trim(p_payload ->> 'applicant_name'), ''), '') = ''
    or coalesce(nullif(trim(p_payload ->> 'topic_code'), ''), '') = ''
    or coalesce(nullif(trim(p_payload ->> 'suggested_change'), ''), '') = ''
    or coalesce(nullif(trim(p_payload ->> 'change_reason'), ''), '') = '' then
    raise exception '需求來源、申請人、建議內容與理由依據為必填';
  end if;

  if coalesce(p_payload ->> 'category_code', '') not in ('SMM','SMP','SMI','SQMS','ISO') then
    raise exception '大類代碼不正確';
  end if;

  if coalesce(p_payload ->> 'urgency', 'medium') not in ('urgent','high','medium','low') then
    raise exception '急迫度不正確';
  end if;

  insert into daily_request_counters (business_date, last_value, updated_at)
  values (request_business_date, 1, now())
  on conflict (business_date) do update
  set
    last_value = daily_request_counters.last_value + 1,
    updated_at = now()
  returning last_value into sequence_value;

  generated_request_no := 'SQMS-' || to_char(request_business_date, 'YYYYMMDD') || '-' || lpad(sequence_value::text, 2, '0');

  insert into change_requests (
    request_no,
    applicant_name,
    request_source,
    category_code,
    topic_code,
    manual_item_code,
    scope_note,
    suggested_change,
    change_reason,
    target_due_date,
    urgency,
    need_related_form_update,
    reference_materials,
    remarks,
    status,
    public_edit_note,
    revision,
    created_by_personnel_id,
    updated_by_personnel_id
  )
  values (
    generated_request_no,
    trim(p_payload ->> 'applicant_name'),
    coalesce(nullif(trim(p_payload ->> 'request_source'), ''), '外部檢查'),
    p_payload ->> 'category_code',
    trim(p_payload ->> 'topic_code'),
    nullif(trim(p_payload ->> 'manual_item_code'), ''),
    nullif(trim(p_payload ->> 'scope_note'), ''),
    trim(p_payload ->> 'suggested_change'),
    trim(p_payload ->> 'change_reason'),
    nullif(p_payload ->> 'target_due_date', '')::date,
    coalesce(p_payload ->> 'urgency', 'medium'),
    coalesce((p_payload ->> 'need_related_form_update')::boolean, false),
    nullif(trim(p_payload ->> 'reference_materials'), ''),
    nullif(trim(p_payload ->> 'remarks'), ''),
    'new',
    nullif(trim(p_payload ->> 'public_edit_note'), ''),
    1,
    actor_personnel_id,
    actor_personnel_id
  )
  returning * into saved;

  insert into request_events (
    operation_id,
    request_id,
    revision,
    base_revision,
    event_type,
    changed_fields,
    after_snapshot,
    actor_auth_user_id,
    actor_personnel_id,
    actor_label
  )
  values (
    p_operation_id,
    saved.id,
    saved.revision,
    0,
    'created',
    array[
      'applicant_name','request_source','category_code','topic_code','manual_item_code',
      'scope_note','suggested_change','change_reason','target_due_date','urgency',
      'need_related_form_update','reference_materials','remarks','public_edit_note'
    ]::text[],
    to_jsonb(saved),
    auth.uid(),
    actor_personnel_id,
    current_sqms_actor_label()
  );

  return to_jsonb(saved);
end;
$$;

create or replace function patch_change_request(
  p_operation_id uuid,
  p_request_id uuid,
  p_base_revision bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_request change_requests%rowtype;
  saved change_requests%rowtype;
  before_snapshot jsonb;
  existing_request_id uuid;
  allowed_fields constant text[] := array[
    'applicant_name','request_source','category_code','topic_code','manual_item_code',
    'scope_note','suggested_change','change_reason','target_due_date','urgency',
    'need_related_form_update','reference_materials','remarks','public_edit_note'
  ]::text[];
  changed_fields text[];
  unknown_fields text[];
  overlap_fields text[];
  actor_personnel_id uuid := current_sqms_personnel_id();
begin
  if not can_edit_sqms_requests() then
    raise exception '請先登入人員身份再修改需求';
  end if;

  if p_operation_id is null then
    raise exception '缺少操作編號';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select event.request_id
  into existing_request_id
  from request_events event
  where event.operation_id = p_operation_id;

  if found then
    if existing_request_id <> p_request_id then
      raise exception '操作編號已用於其他需求';
    end if;
    select * into saved from change_requests where id = p_request_id;
    return to_jsonb(saved);
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception '修改資料格式錯誤';
  end if;

  select coalesce(array_agg(field_name order by field_name), '{}'::text[])
  into changed_fields
  from jsonb_object_keys(p_patch) as fields(field_name);

  select coalesce(array_agg(field_name order by field_name), '{}'::text[])
  into unknown_fields
  from unnest(changed_fields) as fields(field_name)
  where not field_name = any(allowed_fields);

  if cardinality(unknown_fields) > 0 then
    raise exception '不允許修改欄位：%', array_to_string(unknown_fields, ', ');
  end if;

  select *
  into current_request
  from change_requests
  where id = p_request_id
    and is_deleted = false
  for update;

  if not found then
    raise exception '找不到可修改的需求';
  end if;

  if coalesce(p_base_revision, 0) > current_request.revision then
    raise exception '基準版本高於正式版本';
  end if;

  if (p_patch ? 'request_source' and coalesce(nullif(trim(p_patch ->> 'request_source'), ''), '') = '')
    or (p_patch ? 'applicant_name' and coalesce(nullif(trim(p_patch ->> 'applicant_name'), ''), '') = '')
    or (p_patch ? 'topic_code' and coalesce(nullif(trim(p_patch ->> 'topic_code'), ''), '') = '')
    or (p_patch ? 'suggested_change' and coalesce(nullif(trim(p_patch ->> 'suggested_change'), ''), '') = '')
    or (p_patch ? 'change_reason' and coalesce(nullif(trim(p_patch ->> 'change_reason'), ''), '') = '') then
    raise exception '申請人、建議內容與理由依據不可為空';
  end if;

  if p_patch ? 'category_code' and p_patch ->> 'category_code' not in ('SMM','SMP','SMI','SQMS','ISO') then
    raise exception '大類代碼不正確';
  end if;

  if p_patch ? 'urgency' and p_patch ->> 'urgency' not in ('urgent','high','medium','low') then
    raise exception '急迫度不正確';
  end if;

  select coalesce(array_agg(distinct field_name order by field_name), '{}'::text[])
  into overlap_fields
  from request_events event
  cross join unnest(event.changed_fields) as event_fields(field_name)
  where event.request_id = p_request_id
    and event.revision > coalesce(p_base_revision, 0)
    and field_name = any(changed_fields);

  before_snapshot := to_jsonb(current_request);

  if cardinality(changed_fields) = 0 then
    insert into request_events (
      operation_id, request_id, revision, base_revision, event_type,
      changed_fields, overlap_fields, before_snapshot, after_snapshot,
      actor_auth_user_id, actor_personnel_id, actor_label
    )
    values (
      p_operation_id, current_request.id, current_request.revision, p_base_revision, 'noop',
      '{}'::text[], '{}'::text[], before_snapshot, before_snapshot,
      auth.uid(), actor_personnel_id, current_sqms_actor_label()
    );
    return before_snapshot;
  end if;

  update change_requests
  set
    applicant_name = case when p_patch ? 'applicant_name' then trim(p_patch ->> 'applicant_name') else applicant_name end,
    request_source = case when p_patch ? 'request_source' then coalesce(nullif(trim(p_patch ->> 'request_source'), ''), request_source) else request_source end,
    category_code = case when p_patch ? 'category_code' then p_patch ->> 'category_code' else category_code end,
    topic_code = case when p_patch ? 'topic_code' then trim(p_patch ->> 'topic_code') else topic_code end,
    manual_item_code = case when p_patch ? 'manual_item_code' then nullif(trim(p_patch ->> 'manual_item_code'), '') else manual_item_code end,
    scope_note = case when p_patch ? 'scope_note' then nullif(trim(p_patch ->> 'scope_note'), '') else scope_note end,
    suggested_change = case when p_patch ? 'suggested_change' then trim(p_patch ->> 'suggested_change') else suggested_change end,
    change_reason = case when p_patch ? 'change_reason' then trim(p_patch ->> 'change_reason') else change_reason end,
    target_due_date = case when p_patch ? 'target_due_date' then nullif(p_patch ->> 'target_due_date', '')::date else target_due_date end,
    urgency = case when p_patch ? 'urgency' then p_patch ->> 'urgency' else urgency end,
    need_related_form_update = case when p_patch ? 'need_related_form_update' then (p_patch ->> 'need_related_form_update')::boolean else need_related_form_update end,
    reference_materials = case when p_patch ? 'reference_materials' then nullif(trim(p_patch ->> 'reference_materials'), '') else reference_materials end,
    remarks = case when p_patch ? 'remarks' then nullif(trim(p_patch ->> 'remarks'), '') else remarks end,
    public_edit_note = case when p_patch ? 'public_edit_note' then nullif(trim(p_patch ->> 'public_edit_note'), '') else public_edit_note end,
    revision = revision + 1,
    updated_by_personnel_id = actor_personnel_id,
    updated_at = now()
  where id = p_request_id
  returning * into saved;

  insert into request_events (
    operation_id, request_id, revision, base_revision, event_type,
    changed_fields, overlap_fields, before_snapshot, after_snapshot,
    actor_auth_user_id, actor_personnel_id, actor_label
  )
  values (
    p_operation_id, saved.id, saved.revision, p_base_revision, 'patched',
    changed_fields, overlap_fields, before_snapshot, to_jsonb(saved),
    auth.uid(), actor_personnel_id, current_sqms_actor_label()
  );

  return to_jsonb(saved);
end;
$$;

create or replace function transition_change_request_status(
  p_operation_id uuid,
  p_request_id uuid,
  p_status text,
  p_completion_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_request change_requests%rowtype;
  saved change_requests%rowtype;
  existing_request_id uuid;
  next_completion_date date;
  actor_personnel_id uuid := current_sqms_personnel_id();
begin
  if not can_edit_sqms_requests() then
    raise exception '請先登入人員身份再修改狀態';
  end if;

  if p_operation_id is null then
    raise exception '缺少操作編號';
  end if;

  if p_status is null or p_status not in ('new','processing','completed','cancelled') then
    raise exception '需求狀態不正確';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select event.request_id into existing_request_id
  from request_events event
  where event.operation_id = p_operation_id;

  if found then
    if existing_request_id <> p_request_id then
      raise exception '操作編號已用於其他需求';
    end if;
    select * into saved from change_requests where id = p_request_id;
    return to_jsonb(saved);
  end if;

  select * into current_request
  from change_requests
  where id = p_request_id
    and is_deleted = false
  for update;

  if not found then
    raise exception '找不到可修改的需求';
  end if;

  next_completion_date := case
    when p_status = 'completed' then coalesce(p_completion_date, (now() at time zone 'Asia/Taipei')::date)
    else null
  end;

  update change_requests
  set
    status = p_status,
    completion_date = next_completion_date,
    revision = revision + 1,
    updated_by_personnel_id = actor_personnel_id,
    updated_at = now()
  where id = p_request_id
  returning * into saved;

  insert into request_events (
    operation_id, request_id, revision, base_revision, event_type,
    changed_fields, before_snapshot, after_snapshot,
    actor_auth_user_id, actor_personnel_id, actor_label
  )
  values (
    p_operation_id, saved.id, saved.revision, current_request.revision, 'status_changed',
    array['status','completion_date']::text[], to_jsonb(current_request), to_jsonb(saved),
    auth.uid(), actor_personnel_id, current_sqms_actor_label()
  );

  return to_jsonb(saved);
end;
$$;

create or replace function soft_delete_change_request(
  p_operation_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_request change_requests%rowtype;
  saved change_requests%rowtype;
  existing_request_id uuid;
  actor_personnel_id uuid := current_sqms_personnel_id();
begin
  if not can_manage_sqms_requests() then
    raise exception '只有 Owner、管理員或人員管理員可以刪除需求';
  end if;

  if p_operation_id is null then
    raise exception '缺少操作編號';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select event.request_id into existing_request_id
  from request_events event
  where event.operation_id = p_operation_id;

  if found then
    if existing_request_id <> p_request_id then
      raise exception '操作編號已用於其他需求';
    end if;
    select * into saved from change_requests where id = p_request_id;
    return to_jsonb(saved);
  end if;

  select * into current_request
  from change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '找不到要刪除的需求';
  end if;

  if current_request.is_deleted then
    insert into request_events (
      operation_id, request_id, revision, base_revision, event_type,
      changed_fields, before_snapshot, after_snapshot,
      actor_auth_user_id, actor_personnel_id, actor_label
    )
    values (
      p_operation_id, current_request.id, current_request.revision, current_request.revision, 'noop',
      '{}'::text[], to_jsonb(current_request), to_jsonb(current_request),
      auth.uid(), actor_personnel_id, current_sqms_actor_label()
    );
    return to_jsonb(current_request);
  end if;

  perform set_config('app.allow_personnel_soft_delete', 'on', true);

  update change_requests
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = current_sqms_actor_label(),
    revision = revision + 1,
    updated_by_personnel_id = actor_personnel_id,
    updated_at = now()
  where id = p_request_id
  returning * into saved;

  insert into request_events (
    operation_id, request_id, revision, base_revision, event_type,
    changed_fields, before_snapshot, after_snapshot,
    actor_auth_user_id, actor_personnel_id, actor_label
  )
  values (
    p_operation_id, saved.id, saved.revision, current_request.revision, 'soft_deleted',
    array['is_deleted','deleted_at','deleted_by']::text[], to_jsonb(current_request), to_jsonb(saved),
    auth.uid(), actor_personnel_id, current_sqms_actor_label()
  );

  return to_jsonb(saved);
end;
$$;

create or replace function add_request_source(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved request_sources%rowtype;
begin
  if not can_manage_sqms_requests() then
    raise exception '只有管理員可以維護需求來源';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception '需求來源不可為空';
  end if;

  insert into request_sources (name, active, sort_order)
  values (
    trim(p_name),
    true,
    coalesce((select max(sort_order) + 10 from request_sources), 10)
  )
  on conflict (name) do update
  set active = true, updated_at = now()
  returning * into saved;

  return to_jsonb(saved);
end;
$$;

create or replace function remove_request_source(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_sqms_requests() then
    raise exception '只有管理員可以維護需求來源';
  end if;

  update request_sources
  set active = false, updated_at = now()
  where name = trim(p_name)
    and active = true;

  return found;
end;
$$;

drop trigger if exists trg_request_sources_updated_at on request_sources;
create trigger trg_request_sources_updated_at
before update on request_sources
for each row execute function set_updated_at();

drop trigger if exists trg_personnel_sessions_updated_at on personnel_sessions;
create trigger trg_personnel_sessions_updated_at
before update on personnel_sessions
for each row execute function set_updated_at();

alter table personnel_sessions enable row level security;
alter table request_sources enable row level security;
alter table daily_request_counters enable row level security;
alter table request_events enable row level security;

drop policy if exists "public insert requests" on change_requests;
drop policy if exists "public update active requests" on change_requests;

revoke insert, update, delete on change_requests from anon, authenticated;
grant select on change_requests to anon, authenticated;

revoke insert, update, delete on personnel_users from anon, authenticated;

drop policy if exists "public read active request sources" on request_sources;
create policy "public read active request sources"
on request_sources for select
to anon, authenticated
using (active = true);

grant select on request_sources to anon, authenticated;
revoke insert, update, delete on request_sources from anon, authenticated;

revoke all on personnel_sessions from anon, authenticated;
revoke all on daily_request_counters from anon, authenticated;
revoke all on request_events from anon, authenticated;

drop policy if exists "admins can read request events" on request_events;
create policy "admins can read request events"
on request_events for select
to authenticated
using (is_sqms_admin());

grant select on request_events to authenticated;

drop policy if exists "admins can read personnel users" on personnel_users;
drop policy if exists "owners can read personnel users" on personnel_users;
create policy "owners can read personnel users"
on personnel_users for select
to authenticated
using (is_sqms_owner());

revoke execute on function next_sqms_request_no(date) from anon, authenticated;
revoke execute on function soft_delete_request_by_manager(uuid, uuid, text) from anon, authenticated;
revoke execute on function soft_delete_request_by_personnel(uuid, uuid, text) from anon, authenticated;
revoke execute on function verify_personnel_password(uuid, text) from anon;

revoke all on function current_sqms_personnel_id() from public;
revoke all on function current_sqms_actor_label() from public;
revoke all on function can_edit_sqms_requests() from public;
revoke all on function can_manage_sqms_requests() from public;
revoke all on function claim_personnel_session(uuid, text) from public;
revoke all on function get_current_personnel_session() from public;
revoke all on function release_personnel_session() from public;
revoke all on function create_change_request(uuid, jsonb) from public;
revoke all on function patch_change_request(uuid, uuid, bigint, jsonb) from public;
revoke all on function transition_change_request_status(uuid, uuid, text, date) from public;
revoke all on function soft_delete_change_request(uuid, uuid) from public;
revoke all on function add_request_source(text) from public;
revoke all on function remove_request_source(text) from public;

grant execute on function current_sqms_personnel_id() to authenticated;
grant execute on function current_sqms_actor_label() to authenticated;
grant execute on function can_edit_sqms_requests() to authenticated;
grant execute on function can_manage_sqms_requests() to authenticated;
grant execute on function claim_personnel_session(uuid, text) to authenticated;
grant execute on function get_current_personnel_session() to authenticated;
grant execute on function release_personnel_session() to authenticated;
grant execute on function create_change_request(uuid, jsonb) to authenticated;
grant execute on function patch_change_request(uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function transition_change_request_status(uuid, uuid, text, date) to authenticated;
grant execute on function soft_delete_change_request(uuid, uuid) to authenticated;
grant execute on function add_request_source(text) to authenticated;
grant execute on function remove_request_source(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'change_requests'
    ) then
      alter publication supabase_realtime add table change_requests;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'request_sources'
    ) then
      alter publication supabase_realtime add table request_sources;
    end if;
  end if;
end;
$$;

commit;
