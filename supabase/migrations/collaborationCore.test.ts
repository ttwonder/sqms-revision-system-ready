import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./202608080001_collaboration_core.sql', import.meta.url),
  'utf8',
)

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
    expect(sql).toContain("array['status','completion_date']")
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
