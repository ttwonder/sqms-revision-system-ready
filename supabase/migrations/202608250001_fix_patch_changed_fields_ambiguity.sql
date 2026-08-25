-- Fix PostgreSQL ambiguity between the patch_change_request local variables
-- and request_events.changed_fields / request_events.overlap_fields.
-- Rerunnable: replaces the RPC definition and privileges only; no request rows are changed.

begin;

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
  patch_changed_fields text[];
  unknown_fields text[];
  detected_overlap_fields text[];
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

  select coalesce(array_agg(fields.field_name order by fields.field_name), '{}'::text[])
  into patch_changed_fields
  from jsonb_object_keys(p_patch) as fields(field_name);

  select coalesce(array_agg(fields.field_name order by fields.field_name), '{}'::text[])
  into unknown_fields
  from unnest(patch_changed_fields) as fields(field_name)
  where not fields.field_name = any(allowed_fields);

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

  select coalesce(array_agg(distinct event_fields.field_name order by event_fields.field_name), '{}'::text[])
  into detected_overlap_fields
  from request_events event
  cross join unnest(event.changed_fields) as event_fields(field_name)
  where event.request_id = p_request_id
    and event.revision > coalesce(p_base_revision, 0)
    and event_fields.field_name = any(patch_changed_fields);

  before_snapshot := to_jsonb(current_request);

  if cardinality(patch_changed_fields) = 0 then
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
    patch_changed_fields, detected_overlap_fields, before_snapshot, to_jsonb(saved),
    auth.uid(), actor_personnel_id, current_sqms_actor_label()
  );

  return to_jsonb(saved);
end;
$$;

revoke all on function patch_change_request(uuid, uuid, bigint, jsonb) from public;
grant execute on function patch_change_request(uuid, uuid, bigint, jsonb) to authenticated;

commit;
