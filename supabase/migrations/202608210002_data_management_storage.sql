-- SQMS data management: storage accounting plus selective permanent purge.
-- Only Owner/admin/personnel-admin sessions may call these RPCs.
-- Purge scope is limited to already soft-deleted requests and their request_events.
-- Rerunnable; installing this migration does not delete any business data.

begin;

create table if not exists sqms_data_management_operations (
  operation_id uuid primary key,
  actor_auth_user_id uuid not null,
  actor_label text not null,
  command_type text not null check (command_type in ('purge_deleted_requests')),
  expected_request_ids jsonb not null,
  delete_request_ids jsonb not null,
  status text not null check (status in ('STARTED','COMMITTED','REJECTED')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table sqms_data_management_operations enable row level security;
revoke all on table sqms_data_management_operations from public, anon, authenticated;

create or replace function get_sqms_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  database_total_bytes bigint := 0;
  app_database_physical_bytes bigint := 0;
  storage_object_bytes bigint := 0;
  storage_object_count bigint := 0;
  active_request_bytes bigint := 0;
  active_request_count bigint := 0;
  deleted_request_bytes bigint := 0;
  deleted_request_count bigint := 0;
  request_event_bytes bigint := 0;
  request_event_count bigint := 0;
  deleted_candidates jsonb := '[]'::jsonb;
begin
  if not can_manage_sqms_requests() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select pg_database_size(current_database())::bigint
  into database_total_bytes;

  select coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint
  into app_database_physical_bytes
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p','m')
    and c.relname in (
      'change_requests', 'request_events', 'request_sources', 'daily_request_counters',
      'personnel_users', 'personnel_sessions', 'admin_users',
      'sqms_data_management_operations'
    );

  if to_regclass('storage.objects') is not null then
    execute $storage$
      select
        count(*)::bigint,
        coalesce(sum(case
          when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$'
            then (metadata ->> 'size')::bigint
          else 0
        end), 0)::bigint
      from storage.objects
    $storage$
    into storage_object_count, storage_object_bytes;
  end if;

  select count(*)::bigint, coalesce(sum(pg_column_size(request)::bigint), 0)::bigint
  into active_request_count, active_request_bytes
  from change_requests request
  where request.is_deleted = false;

  select count(*)::bigint, coalesce(sum(pg_column_size(request)::bigint), 0)::bigint
  into deleted_request_count, deleted_request_bytes
  from change_requests request
  where request.is_deleted = true;

  select count(*)::bigint, coalesce(sum((
    pg_column_size(event.operation_id)
    + pg_column_size(event.request_id)
    + pg_column_size(event.revision)
    + coalesce(pg_column_size(event.base_revision), 0)
    + pg_column_size(event.event_type)
    + pg_column_size(event.changed_fields)
    + pg_column_size(event.overlap_fields)
    + coalesce(pg_column_size(event.before_snapshot), 0)
    + pg_column_size(event.after_snapshot)
    + coalesce(pg_column_size(event.actor_auth_user_id), 0)
    + coalesce(pg_column_size(event.actor_personnel_id), 0)
    + pg_column_size(event.actor_label)
    + pg_column_size(event.created_at)
  )::bigint), 0)::bigint
  into request_event_count, request_event_bytes
  from request_events event;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sized.id,
    'requestNo', sized.request_no,
    'applicantName', sized.applicant_name,
    'deletedAt', sized.deleted_at,
    'deletedBy', coalesce(nullif(sized.deleted_by, ''), '未記錄'),
    'requestBytes', sized.request_bytes,
    'eventCount', sized.event_count,
    'eventBytes', sized.event_bytes,
    'logicalBytes', sized.request_bytes + sized.event_bytes
  ) order by sized.deleted_at desc nulls last, sized.request_no), '[]'::jsonb)
  into deleted_candidates
  from (
    select
      request.id,
      request.request_no,
      request.applicant_name,
      request.deleted_at,
      request.deleted_by,
      pg_column_size(request)::bigint as request_bytes,
      coalesce(event_size.event_count, 0)::bigint as event_count,
      coalesce(event_size.event_bytes, 0)::bigint as event_bytes
    from change_requests request
    left join lateral (
      select
        count(*)::bigint as event_count,
        coalesce(sum((
          pg_column_size(event.operation_id)
          + pg_column_size(event.request_id)
          + pg_column_size(event.revision)
          + coalesce(pg_column_size(event.base_revision), 0)
          + pg_column_size(event.event_type)
          + pg_column_size(event.changed_fields)
          + pg_column_size(event.overlap_fields)
          + coalesce(pg_column_size(event.before_snapshot), 0)
          + pg_column_size(event.after_snapshot)
          + coalesce(pg_column_size(event.actor_auth_user_id), 0)
          + coalesce(pg_column_size(event.actor_personnel_id), 0)
          + pg_column_size(event.actor_label)
          + pg_column_size(event.created_at)
        )::bigint), 0)::bigint as event_bytes
      from request_events event
      where event.request_id = request.id
    ) event_size on true
    where request.is_deleted = true
  ) sized;

  return jsonb_build_object(
    'ok', true,
    'source', 'cloud',
    'generatedAt', clock_timestamp(),
    'databaseTotalBytes', database_total_bytes,
    'appDatabasePhysicalBytes', app_database_physical_bytes,
    'storageObjectBytes', storage_object_bytes,
    'storageObjectCount', storage_object_count,
    'activeRequestBytes', active_request_bytes,
    'activeRequestCount', active_request_count,
    'deletedRequestBytes', deleted_request_bytes,
    'deletedRequestCount', deleted_request_count,
    'requestEventBytes', request_event_bytes,
    'requestEventCount', request_event_count,
    'deletedCandidates', deleted_candidates,
    'staticSiteHost', 'GitHub Pages',
    'staticSiteInSupabase', false,
    'logicalMetric', 'request_rows_and_event_history'
  );
end;
$$;

create or replace function purge_sqms_deleted_requests(
  p_operation_id uuid,
  p_expected_request_ids jsonb,
  p_delete_request_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  operation_row sqms_data_management_operations%rowtype;
  normalized_expected jsonb := '[]'::jsonb;
  normalized_delete jsonb := '[]'::jsonb;
  current_ids jsonb := '[]'::jsonb;
  response jsonb;
  expected_count integer := 0;
  expected_distinct_count integer := 0;
  delete_count integer := 0;
  delete_distinct_count integer := 0;
  current_count integer := 0;
  deleted_request_count integer := 0;
  deleted_event_count integer := 0;
  deleted_bytes bigint := 0;
begin
  if not can_manage_sqms_requests() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_operation_id is null
     or jsonb_typeof(p_expected_request_ids) is distinct from 'array'
     or jsonb_typeof(p_delete_request_ids) is distinct from 'array'
     or jsonb_array_length(p_delete_request_ids) < 1
     or jsonb_array_length(p_delete_request_ids) > 100
     or exists (
       select 1 from jsonb_array_elements(p_expected_request_ids) value
       where jsonb_typeof(value) <> 'string'
          or value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     )
     or exists (
       select 1 from jsonb_array_elements(p_delete_request_ids) value
       where jsonb_typeof(value) <> 'string'
          or value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     ) then
    return jsonb_build_object(
      'ok', false,
      'error', case when jsonb_typeof(p_delete_request_ids) = 'array'
                          and jsonb_array_length(p_delete_request_ids) > 100
                    then 'BATCH_LIMIT_EXCEEDED' else 'INVALID_PAYLOAD' end,
      'maximumDeleteCount', 100
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(id_text) order by id_text), '[]'::jsonb),
         count(*)::integer,
         count(distinct id_text)::integer
  into normalized_expected, expected_count, expected_distinct_count
  from (
    select lower(value #>> '{}') as id_text
    from jsonb_array_elements(p_expected_request_ids) value
  ) normalized;

  select coalesce(jsonb_agg(to_jsonb(id_text) order by id_text), '[]'::jsonb),
         count(*)::integer,
         count(distinct id_text)::integer
  into normalized_delete, delete_count, delete_distinct_count
  from (
    select lower(value #>> '{}') as id_text
    from jsonb_array_elements(p_delete_request_ids) value
  ) normalized;

  if expected_count <> expected_distinct_count or delete_count <> delete_distinct_count then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  insert into sqms_data_management_operations (
    operation_id, actor_auth_user_id, actor_label, command_type,
    expected_request_ids, delete_request_ids, status
  ) values (
    p_operation_id, auth.uid(), current_sqms_actor_label(), 'purge_deleted_requests',
    normalized_expected, normalized_delete, 'STARTED'
  ) on conflict (operation_id) do nothing;

  select * into operation_row
  from sqms_data_management_operations
  where operation_id = p_operation_id
  for update;

  if operation_row.actor_auth_user_id <> auth.uid()
     or operation_row.command_type <> 'purge_deleted_requests'
     or operation_row.expected_request_ids is distinct from normalized_expected
     or operation_row.delete_request_ids is distinct from normalized_delete then
    return jsonb_build_object('ok', false, 'error', 'IDEMPOTENCY_MISMATCH');
  end if;
  if operation_row.status in ('COMMITTED','REJECTED') then
    return operation_row.result;
  end if;

  lock table change_requests in share row exclusive mode;
  lock table request_events in share row exclusive mode;

  select coalesce(jsonb_agg(to_jsonb(request.id::text) order by request.id::text), '[]'::jsonb), count(*)::integer
  into current_ids, current_count
  from change_requests request
  where request.is_deleted = true;

  if current_ids is distinct from normalized_expected then
    response := jsonb_build_object(
      'ok', false,
      'error', 'DELETED_SET_CHANGED',
      'currentDeletedRequestCount', current_count
    );
    update sqms_data_management_operations
    set status = 'REJECTED', result = response, completed_at = clock_timestamp()
    where operation_id = p_operation_id;
    return response;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(normalized_delete) selected(id_text)
    where not (current_ids @> jsonb_build_array(selected.id_text))
  ) then
    response := jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
    update sqms_data_management_operations
    set status = 'REJECTED', result = response, completed_at = clock_timestamp()
    where operation_id = p_operation_id;
    return response;
  end if;

  select count(*)::integer, coalesce(sum(
    pg_column_size(request)::bigint + coalesce(event_size.event_bytes, 0)
  ), 0)::bigint, coalesce(sum(event_size.event_count), 0)::integer
  into deleted_request_count, deleted_bytes, deleted_event_count
  from change_requests request
  left join lateral (
    select
      count(*)::integer as event_count,
      coalesce(sum((
        pg_column_size(event.operation_id)
        + pg_column_size(event.request_id)
        + pg_column_size(event.revision)
        + coalesce(pg_column_size(event.base_revision), 0)
        + pg_column_size(event.event_type)
        + pg_column_size(event.changed_fields)
        + pg_column_size(event.overlap_fields)
        + coalesce(pg_column_size(event.before_snapshot), 0)
        + pg_column_size(event.after_snapshot)
        + coalesce(pg_column_size(event.actor_auth_user_id), 0)
        + coalesce(pg_column_size(event.actor_personnel_id), 0)
        + pg_column_size(event.actor_label)
        + pg_column_size(event.created_at)
      )::bigint), 0)::bigint as event_bytes
    from request_events event
    where event.request_id = request.id
  ) event_size on true
  where request.id in (
    select id_text::uuid
    from jsonb_array_elements_text(normalized_delete) selected(id_text)
  )
    and request.is_deleted = true;

  if deleted_request_count <> delete_count then
    response := jsonb_build_object('ok', false, 'error', 'DELETED_SET_CHANGED');
    update sqms_data_management_operations
    set status = 'REJECTED', result = response, completed_at = clock_timestamp()
    where operation_id = p_operation_id;
    return response;
  end if;

  delete from request_events event
  where event.request_id in (
    select id_text::uuid
    from jsonb_array_elements_text(normalized_delete) selected(id_text)
  );

  delete from change_requests request
  where request.id in (
    select id_text::uuid
    from jsonb_array_elements_text(normalized_delete) selected(id_text)
  )
    and request.is_deleted = true;

  get diagnostics deleted_request_count = row_count;
  if deleted_request_count <> delete_count then
    raise exception 'PURGE_DELETE_COUNT_MISMATCH';
  end if;

  response := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'deletedRequestCount', deleted_request_count,
    'deletedEventCount', deleted_event_count,
    'deletedBytes', deleted_bytes,
    'deletedRequestIds', normalized_delete,
    'remainingDeletedRequestCount', current_count - deleted_request_count
  );
  update sqms_data_management_operations
  set status = 'COMMITTED', result = response, completed_at = clock_timestamp()
  where operation_id = p_operation_id;
  return response;
end;
$$;

revoke all on function get_sqms_storage_stats() from public;
revoke all on function purge_sqms_deleted_requests(uuid, jsonb, jsonb) from public;
grant execute on function get_sqms_storage_stats() to authenticated;
grant execute on function purge_sqms_deleted_requests(uuid, jsonb, jsonb) to authenticated;

commit;
