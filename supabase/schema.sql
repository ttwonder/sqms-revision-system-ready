-- SQMS 程序書修訂需求管理系統 Supabase Schema
-- 在 Supabase SQL Editor 執行。前端公開可讀/新增/修改；只有管理員可軟刪除。

create extension if not exists pgcrypto;

create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  applicant_name text not null,
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

create index if not exists idx_change_requests_created_at on change_requests(created_at);
create index if not exists idx_change_requests_status on change_requests(status);
create index if not exists idx_change_requests_due on change_requests(target_due_date);
create index if not exists idx_change_requests_category on change_requests(category_code);
create index if not exists idx_change_requests_topic on change_requests(topic_code);
create index if not exists idx_change_requests_not_deleted on change_requests(is_deleted);

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

-- 公開用戶不可透過 UPDATE 改動軟刪除欄位；管理員刪除由前端登入後執行。
create or replace function protect_public_delete_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'anon' then
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
-- 管理員軟刪除同樣走 UPDATE；前端只對已登入管理員顯示刪除按鈕。
