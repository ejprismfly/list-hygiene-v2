import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID, createHash } from 'node:crypto'
import pg from 'pg'

const url = process.env.AUTH_REHEARSAL_DATABASE_URL
const pool = url ? new pg.Pool({ connectionString: url, idleTimeoutMillis: 1000 }) : null
const hash = value => createHash('sha256').update(value).digest('hex')
const query = async (sql, args=[]) => (await pool.query(sql,args)).rows
let owner, recipient, outsider, session, organization, workspace, secondWorkspace

test('authentication database protections', { skip: !url }, async (t) => {
  assert.match(new URL(url).pathname, /^\/lh_rehearsal/)
  owner=randomUUID();recipient=randomUUID();outsider=randomUUID();session=randomUUID()
  try {
    await query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'recipient@example.test',now()),($3,'outsider@example.test',now())",[owner,recipient,outsider])
    for(const id of [owner,recipient,outsider]) await query("select public.ensure_default_organization_workspace($1,$2,'{}'::jsonb)",[id,`${id}@example.test`])
    await query('insert into auth.sessions(id,user_id) values($1,$2)',[session,recipient])
    organization=(await query('select id from public.organizations where legacy_user_id=$1',[owner]))[0].id
    workspace=(await query('select id from public.workspaces where organization_id=$1',[organization]))[0].id
    secondWorkspace=(await query("insert into public.workspaces(organization_id,name,slug,created_by_user_id) values($1,'Second','second',$2) returning id",[organization,owner]))[0].id
    await query("insert into public.workspace_members(organization_id,workspace_id,user_id,role) values($1,$2,$3,'owner')",[organization,secondWorkspace,owner])
    const invite = async ({status='pending',expires='1 day',targets=[workspace,secondWorkspace],email='recipient@example.test'}={}) => {
      const token=hash(randomUUID())
      const row=(await query(`insert into public.organization_invitations(organization_id,email,role,workspace_ids,status,token_hash,invited_by_user_id,expires_at) values($1,$2,'member',$3,$4,$5,$6,now()+$7::interval) returning id`,[organization,email,targets,status,token,owner,expires]))[0]
      return {id:row.id,token}
    }
    const accept = token => query('select public.accept_organization_invitation($1,$2,$3) as result',[token,recipient,session])
    await t.test('both signup triggers provision exactly one profile and default workspace',async()=>{
      for(const id of [owner,recipient,outsider]) {
        assert.equal((await query('select count(*)::int as n from public.user_details where user_id=$1',[id]))[0].n,1)
        assert.equal((await query('select count(*)::int as n from public.organizations where legacy_user_id=$1',[id]))[0].n,1)
        assert.equal((await query('select count(*)::int as n from public.workspaces where legacy_user_id=$1',[id]))[0].n,1)
      }
    })
    await t.test('anonymous tables and privileged RPCs are inaccessible', async()=>{
      for(const table of ['user_details','organizations','organization_members','workspaces','workspace_members','organization_invitations','auth_password_grants','auth_rate_limits']){
        const permissions=await query("select has_table_privilege('anon',$1,'SELECT') as read,has_table_privilege('anon',$1,'INSERT') as write",[`public.${table}`])
        assert.equal(permissions[0].read,false);assert.equal(permissions[0].write,false)
      }
      for(const fn of ['public.transfer_workspace_ownership(uuid,uuid,uuid)','public.recalculate_organization_member_role(uuid,uuid)','public.accept_organization_invitation(text,uuid,uuid)','public.consume_auth_rate_limit(text,integer,integer)']) assert.equal((await query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed",[fn]))[0].allowed,false)
    })
    await t.test('wrong recipient, expired, revoked and foreign-workspace invites grant nothing',async()=>{
      for(const options of [{email:'other@example.test'},{status:'revoked'},{expires:'-1 second'},{targets:[randomUUID()]}]){
        const i=await invite(options);await assert.rejects(accept(i.token));await query('delete from public.organization_invitations where id=$1',[i.id])
        assert.equal((await query('select count(*)::int as n from public.workspace_members where user_id=$1 and organization_id=$2',[recipient,organization]))[0].n,0)
      }
    })
    await t.test('concurrent acceptance is idempotent with no duplicate members',async()=>{
      const i=await invite();const results=await Promise.all([accept(i.token),accept(i.token),accept(i.token)])
      assert.equal(results.length,3)
      assert.equal((await query('select count(*)::int as n from public.workspace_members where user_id=$1 and organization_id=$2',[recipient,organization]))[0].n,2)
      assert.equal((await query('select status from public.organization_invitations where id=$1',[i.id]))[0].status,'accepted')
    })
    await t.test('accepting a new invitation preserves owner roles',async()=>{
      await query("update public.workspace_members set role='admin' where workspace_id=$1 and user_id=$2",[workspace,owner])
      await query("update public.workspace_members set role='owner' where workspace_id=$1 and user_id=$2",[workspace,recipient])
      await query("update public.organization_members set role='owner' where organization_id=$1 and user_id=$2",[organization,recipient])
      await accept((await invite()).token)
      assert.equal((await query('select role from public.workspace_members where workspace_id=$1 and user_id=$2',[workspace,recipient]))[0].role,'owner')
    })
    await t.test('disabled membership cannot be reactivated by an invitation',async()=>{
      await query("update public.organization_members set status='disabled' where organization_id=$1 and user_id=$2",[organization,recipient])
      const disabledInvite=await invite();await assert.rejects(accept(disabledInvite.token));await query('delete from public.organization_invitations where id=$1',[disabledInvite.id])
      await query("update public.organization_members set status='active' where organization_id=$1 and user_id=$2",[organization,recipient])
    })
    await t.test('revocation racing acceptance is serialized',async()=>{
      const i=await invite();const client=await pool.connect()
      try {
        await client.query('begin');await client.query("update public.organization_invitations set status='revoked' where id=$1",[i.id])
        const result=accept(i.token).then(()=>false,()=>true)
        await client.query('commit');assert.equal(await result,true)
      } finally {await client.query("rollback");client.release()}
    })
    await t.test('password grants can be claimed only once under concurrency',async()=>{
      const token=hash(randomUUID())
      await query("insert into public.auth_password_grants values($1,$2,$3,'recovery','/dashboard',now()+interval '15 minutes',null)",[token,recipient,session])
      const results=await Promise.all(Array.from({length:5},()=>query('select public.claim_auth_password_grant($1,$2,$3) as result',[token,recipient,session])))
      assert.equal(results.filter(rows=>rows[0].result).length,1)
    })
    await t.test('the shared limiter enforces its threshold under concurrency',async()=>{
      const key=hash(randomUUID());const rows=await Promise.all(Array.from({length:15},()=>query('select public.consume_auth_rate_limit($1,10,900) as result',[key])))
      assert.equal(rows.filter(r=>r[0].result.allowed).length,10)
      await query('delete from public.auth_rate_limits where bucket_key=$1',[key])
    })
    await t.test('provisioning cannot restore disabled access or reclaim workspace ownership',async()=>{
      await query("update public.organization_members set status='disabled' where organization_id=$1 and user_id=$2",[organization,owner])
      await query("select public.ensure_default_organization_workspace($1,'owner@example.test','{}'::jsonb)",[owner])
      assert.equal((await query('select status from public.organization_members where organization_id=$1 and user_id=$2',[organization,owner]))[0].status,'disabled')
      assert.equal((await query('select role from public.workspace_members where workspace_id=$1 and user_id=$2',[workspace,owner]))[0].role,'admin')
      await query("update public.organization_members set status='active' where organization_id=$1 and user_id=$2",[organization,owner])
    })
    await t.test('member permission changes cannot disable an owner or escape workspace scope',async()=>{
      const actorSession=randomUUID();await query('insert into auth.sessions(id,user_id) values($1,$2)',[actorSession,owner])
      await assert.rejects(query("select public.manage_workspace_member($1,$2,$3,$4,null,'disabled',false)",[workspace,owner,actorSession,recipient]))
      const member=randomUUID();await query("insert into auth.users(id,email,email_confirmed_at) values($1,'member@example.test',now())",[member])
      await query("insert into public.organization_members(organization_id,user_id,role,status) values($1,$2,'member','active')",[organization,member])
      await query("insert into public.workspace_members(organization_id,workspace_id,user_id,role) values($1,$2,$3,'member')",[organization,workspace,member])
      await query("select public.manage_workspace_member($1,$2,$3,$4,'admin',null,false)",[workspace,owner,actorSession,member])
      assert.equal((await query('select role from public.workspace_members where workspace_id=$1 and user_id=$2',[workspace,member]))[0].role,'admin')
      await query("insert into public.workspace_members(organization_id,workspace_id,user_id,role) values($1,$2,$3,'member')",[organization,secondWorkspace,member])
      await query("update public.workspace_members set role='member' where workspace_id=$1 and user_id=$2",[secondWorkspace,owner])
      await assert.rejects(query("select public.manage_workspace_member($1,$2,$3,$4,null,'disabled',false)",[workspace,owner,actorSession,member]))
      await query("update public.workspace_members set role='owner' where workspace_id=$1 and user_id=$2",[secondWorkspace,owner])
      await query("select public.manage_workspace_member($1,$2,$3,$4,null,'disabled',false)",[workspace,owner,actorSession,member])
      await query("select public.manage_workspace_member($1,$2,$3,$4,'member',null,false)",[workspace,owner,actorSession,member])
      assert.equal((await query('select status from public.organization_members where organization_id=$1 and user_id=$2',[organization,member]))[0].status,'disabled')
      await query('delete from auth.sessions where id=$1',[actorSession]);await query('delete from auth.users where id=$1',[member])
    })
    await t.test('RLS checks identity, active workspace membership and revoked sessions',async()=>{
      const client=await pool.connect()
      try {
        await client.query('begin');await client.query('set local role authenticated')
        await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[recipient,JSON.stringify({sub:recipient,session_id:session})])
        assert.equal((await client.query('select public.current_session_is_active() as active')).rows[0].active,true)
        assert.equal((await client.query('select * from public.organization_members where user_id=$1',[outsider])).rowCount,0)
        await client.query('rollback')
        await query('delete from auth.sessions where id=$1',[session])
        await client.query('begin');await client.query('set local role authenticated')
        await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[recipient,JSON.stringify({sub:recipient,session_id:session})])
        assert.equal((await client.query('select public.current_session_is_active() as active')).rows[0].active,false)
        assert.equal((await client.query('select * from public.user_details')).rowCount,0)
        await client.query('rollback')
      } finally {await client.query("rollback");client.release()}
    })
  } finally {
    await query('delete from public.auth_password_grants where user_id=any($1::uuid[])',[[owner,recipient,outsider]])
    await query('delete from public.organizations where legacy_user_id=any($1::uuid[])',[[owner,recipient,outsider]])
    await query('delete from public.user_details where user_id=any($1::uuid[])',[[owner,recipient,outsider]])
    await query('delete from auth.sessions where user_id=any($1::uuid[])',[[owner,recipient,outsider]])
    await query('delete from auth.users where id=any($1::uuid[])',[[owner,recipient,outsider]])
    await pool.end()
  }
})
