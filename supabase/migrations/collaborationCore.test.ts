import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./202608080001_collaboration_core.sql', import.meta.url),
  'utf8',
)
const businessDateHotfixUrl = new URL('./202608110001_fix_create_request_business_date.sql', import.meta.url)
const permissionsMigrationUrl = new URL('./202608210001_guest_edit_admin_lifecycle.sql', import.meta.url)
const dataManagementMigrationUrl = new URL('./202608210002_data_management_storage.sql', import.meta.url)
const patchFieldsHotfixUrl = new URL('./202608250001_fix_patch_changed_fields_ambiguity.sql', import.meta.url)

describe('collaboration core migration contract', () => {
  it('routes every request mutation through idempotent server commands', () => {
    expect(sql).toContain('operation_id uuid not null unique')
    expect(sql).toContain('create or replace function create_change_request')
    expect(sql).toContain('create or replace function patch_change_request')
    expect(sql).toContain('create or replace function transition_change_request_status')
    expect(sql).toContain('create or replace function soft_delete_change_request')
    expect(sql.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps numbering and business state arbitration inside PostgreSQL', () => {
    expect(sql).toContain('create table if not exists daily_request_counters')
    expect(sql).toContain("now() at time zone 'Asia/Taipei'")
    expect(sql).toContain('on conflict (business_date) do update')
    expect(sql).toContain('request_business_date date :=')
    expect(sql).not.toMatch(/\bbusiness_date date :=/)
    expect(sql).toContain("array['status','completion_date']")
  })

  it('disambiguates patch field variables from request event columns', () => {
    expect(sql).toContain('patch_changed_fields text[];')
    expect(sql).toContain('detected_overlap_fields text[];')
    expect(sql).toContain('from unnest(patch_changed_fields)')
    expect(sql).toContain('event_fields.field_name = any(patch_changed_fields)')
    expect(sql).not.toMatch(/^\s*changed_fields text\[\];/m)
    expect(sql).not.toMatch(/\bany\(changed_fields\)/)
  })

  it('ships a rerunnable production hotfix for the ambiguous business date reference', () => {
    const hotfixPath = fileURLToPath(businessDateHotfixUrl)
    expect(existsSync(hotfixPath)).toBe(true)
    if (!existsSync(hotfixPath)) return

    const hotfixSql = readFileSync(hotfixPath, 'utf8')
    expect(hotfixSql).toContain('create or replace function create_change_request')
    expect(hotfixSql).toContain('request_business_date date :=')
    expect(hotfixSql).toContain('values (request_business_date, 1, now())')
    expect(hotfixSql).not.toMatch(/\bbusiness_date date :=/)
  })

  it('ships a rerunnable production hotfix for the ambiguous changed_fields reference', () => {
    const hotfixPath = fileURLToPath(patchFieldsHotfixUrl)
    expect(existsSync(hotfixPath)).toBe(true)
    if (!existsSync(hotfixPath)) return

    const hotfixSql = readFileSync(hotfixPath, 'utf8')
    expect(hotfixSql).toContain('create or replace function patch_change_request')
    expect(hotfixSql).toContain('patch_changed_fields text[];')
    expect(hotfixSql).toContain('detected_overlap_fields text[];')
    expect(hotfixSql).toContain('event_fields.field_name = any(patch_changed_fields)')
    expect(hotfixSql).not.toMatch(/^\s*changed_fields text\[\];/m)
    expect(hotfixSql).not.toMatch(/\bany\(changed_fields\)/)
    expect(hotfixSql).toContain('revoke all on function patch_change_request(uuid, uuid, bigint, jsonb) from public')
    expect(hotfixSql).toContain('grant execute on function patch_change_request(uuid, uuid, bigint, jsonb) to authenticated')
  })

  it('ships a rerunnable permission migration for guest edits and manager-only lifecycle changes', () => {
    const migrationPath = fileURLToPath(permissionsMigrationUrl)
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const migrationSql = readFileSync(migrationPath, 'utf8')
    expect(migrationSql).toContain('create or replace function can_edit_sqms_requests()')
    expect(migrationSql).toContain('select auth.uid() is not null')
    expect(migrationSql).toContain('create or replace function transition_change_request_status')
    expect(migrationSql).toContain('if not can_manage_sqms_requests() then')
    expect(migrationSql).toContain('只有管理員可以修改需求狀態')
    expect(migrationSql).toContain('grant execute on function patch_change_request(uuid, uuid, bigint, jsonb) to authenticated')
  })

  it('ships manager-only storage accounting and exact-set purge contracts', () => {
    const migrationPath = fileURLToPath(dataManagementMigrationUrl)
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const migrationSql = readFileSync(migrationPath, 'utf8')
    expect(migrationSql).toContain('create or replace function get_sqms_storage_stats()')
    expect(migrationSql).toContain('pg_database_size(current_database())')
    expect(migrationSql).toContain('pg_total_relation_size')
    expect(migrationSql).toContain('create or replace function purge_sqms_deleted_requests')
    expect(migrationSql).toContain('if not can_manage_sqms_requests() then')
    expect(migrationSql).toContain('DELETED_SET_CHANGED')
    expect(migrationSql).toContain('delete from request_events')
    expect(migrationSql).toContain('and request.is_deleted = true')
    expect(migrationSql).toContain('BATCH_LIMIT_EXCEEDED')
  })

  it('blocks direct browser writes and records field overlap history', () => {
    expect(sql).toContain('revoke insert, update, delete on change_requests from anon, authenticated')
    expect(sql).toContain('revoke insert, update, delete on personnel_users from anon, authenticated')
    expect(sql).toContain("overlap_fields text[] not null default '{}'::text[]")
    expect(sql).toContain('event.revision > coalesce(p_base_revision, 0)')
  })

  it('binds personnel identity to auth sessions without returning plaintext passwords', () => {
    expect(sql).toContain('create table if not exists personnel_sessions')
    expect(sql).toContain('password_hash = crypt(password, gen_salt')
    expect(sql).toContain('create or replace function claim_personnel_session')
    expect(sql).toContain('where session.auth_user_id = auth.uid()')
  })
})
