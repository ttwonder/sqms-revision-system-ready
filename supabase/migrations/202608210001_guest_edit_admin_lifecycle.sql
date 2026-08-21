-- Allow authenticated guest sessions to patch request content while keeping
-- every lifecycle transition (complete/reopen/status) manager-only.
-- Rerunnable on projects that already applied the collaboration core migration.

begin;

create or replace function can_edit_sqms_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
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
  if not can_manage_sqms_requests() then
    raise exception '只有管理員可以修改需求狀態';
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

revoke all on function can_edit_sqms_requests() from public;
revoke all on function patch_change_request(uuid, uuid, bigint, jsonb) from public;
revoke all on function transition_change_request_status(uuid, uuid, text, date) from public;

grant execute on function can_edit_sqms_requests() to authenticated;
grant execute on function patch_change_request(uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function transition_change_request_status(uuid, uuid, text, date) to authenticated;

commit;
