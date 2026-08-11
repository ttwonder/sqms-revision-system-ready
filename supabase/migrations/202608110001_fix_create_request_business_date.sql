-- Hotfix: remove the PL/pgSQL variable/column name collision in create_change_request.
-- Safe to run on an existing production project after 202608080001_collaboration_core.sql.
-- This replaces only the RPC function; existing requests, counters, events, and permissions are preserved.

begin;

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

revoke all on function create_change_request(uuid, jsonb) from public;
grant execute on function create_change_request(uuid, jsonb) to authenticated;

commit;
