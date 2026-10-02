import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
const connectionString = process.env.PROCESSING_TEST_DATABASE_URL
if (!connectionString || !['127.0.0.1','localhost'].includes(new URL(connectionString).hostname)) throw new Error('An isolated localhost database is required')
const c = new pg.Client({ connectionString })
const u = randomUUID(), org = randomUUID(), w1 = randomUUID(), w2 = randomUUID(), account = randomUUID(), job = randomUUID(), lease = randomUUID()
const current = workspace => ({user_id:u,organization_id:org,workspace_id:workspace,total_count:2507,valid_count:2507,invalid_count:0,risky_count:0,restricted_count:0,suppressed_count:0})
const historical = workspace => Array.from({length:12},(_,order_id)=>({user_id:u,organization_id:org,workspace_id:workspace,order_id,month:'October',year:2026,key:'2026-10',start:'2026-10-01',end:'2026-10-02',valid:2507,invalid:0,risky:0,restricted:0}))
async function call(name,args){return (await c.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result}
try {
 await c.connect()
 const marker = await c.query("select to_regclass('public.isolated_processing_fixture') marker")
 assert.ok(marker.rows[0].marker,'Isolated fixture marker missing; refusing to write')
 await c.query('begin')
 const g = await call('request_report_refresh',[u,org,w1,false])
 await call('save_report_snapshot',['historical',JSON.stringify(historical(w1)),JSON.stringify(current(w1)),g])
 await call('save_report_snapshot',['historical',JSON.stringify(historical(w2)),JSON.stringify(current(w2)),null])
 assert.equal((await c.query('select count(*)::int n from email_report_tbl where user_id=$1',[u])).rows[0].n,2)
 await c.query('savepoint failed_report')
 const broken=historical(w1);broken[0].valid='not_an_integer'
 await assert.rejects(call('save_report_snapshot',['historical',JSON.stringify(broken),JSON.stringify(current(w1)),g]))
 await c.query('rollback to savepoint failed_report')
 assert.equal((await c.query('select count(*)::int n from emails_historical_performance where workspace_id=$1',[w1])).rows[0].n,12)
 await c.query('insert into email_usage_monthly(user_id,organization_id,workspace_id,month_start) values($1,$2,$3,$4)',[u,org,w1,'2020-01-01'])
 await call('save_report_snapshot',['monthly',JSON.stringify([{user_id:u,organization_id:org,workspace_id:w1,month_start:'2026-10-01',valid_count:2507}]),null,null])
 assert.equal((await c.query('select count(*)::int n from email_usage_monthly where workspace_id=$1',[w1])).rows[0].n,2,'Older cached periods must survive refresh')
 // A source update while a snapshot runs must remain pending after its commit.
 await call('request_report_refresh',[u,org,w1,true])
 await call('save_report_snapshot',['historical',JSON.stringify(historical(w1)),JSON.stringify(current(w1)),g])
 assert.equal((await c.query('select pending from report_refresh_state where workspace_id=$1',[w1])).rows[0].pending,true)
 assert.equal(await call('claim_billing_event',['evt_processing_fixture','invoice.paid',lease]),'claimed')
 assert.equal(await call('claim_billing_event',['evt_processing_fixture','invoice.paid',randomUUID()]),'busy')
 await c.query('insert into stripe_accounts(user_id,customer_id,subscription_id,credits_plan,credits_remaining) values($1,$2,$3,100,73) returning id',[u,'cus_processing_fixture','sub_old']).then(r=>globalThis.billingId=r.rows[0].id)
 const args=['evt_processing_fixture',lease,'in_processing_fixture',1790960000,globalThis.billingId,'cus_processing_fixture','sub_new','subscription_update','2026-11-01','prod_fixture',200,100,0]
 const effect=await call('apply_billing_invoice',args)
 assert.equal(effect.old_subscription_id,'sub_old')
 assert.equal((await c.query('select credits_remaining from stripe_accounts where id=$1',[globalThis.billingId])).rows[0].credits_remaining,273)
 // Model an atomic credit deduction occurring between an invoice and its retry.
 await c.query('update stripe_accounts set credits_remaining=credits_remaining-1,credits_used=credits_used+1 where id=$1',[globalThis.billingId])
 await call('apply_billing_invoice',args)
 assert.equal((await c.query('select credits_remaining from stripe_accounts where id=$1',[globalThis.billingId])).rows[0].credits_remaining,272)
 assert.equal((await c.query('select count(*)::int n from credit_history where context=$1',['in_processing_fixture'])).rows[0].n,1)
 assert.equal(await call('apply_subscription_deletion',['evt_processing_fixture',lease,'cus_processing_fixture','sub_old',globalThis.billingId]),0)
 assert.equal((await c.query('select subscription_id from stripe_accounts where id=$1',[globalThis.billingId])).rows[0].subscription_id,'sub_new')
 await c.query('savepoint failed_credit')
 await c.query("create function pg_temp.reject_credit() returns trigger language plpgsql as $$ begin raise exception 'injected history failure'; end $$; create trigger injected_credit_failure before insert on credit_history for each row execute function pg_temp.reject_credit()")
 args[2]='in_failed_fixture';args[10]=300
 await assert.rejects(call('apply_billing_invoice',args))
 await c.query('rollback to savepoint failed_credit')
 assert.equal((await c.query('select credits_remaining from stripe_accounts where id=$1',[globalThis.billingId])).rows[0].credits_remaining,272)
 const cycleArgs=[...args];cycleArgs[2]='in_cycle_fixture';cycleArgs[3]=1793552000;cycleArgs[7]='subscription_cycle';cycleArgs[8]='2026-12-01';cycleArgs[10]=200
 await call('apply_billing_invoice',cycleArgs)
 assert.equal((await c.query('select credits_remaining from stripe_accounts where id=$1',[globalThis.billingId])).rows[0].credits_remaining,200)
 assert.equal((await c.query('select count(*)::int n from credit_history where context=$1',['in_cycle_fixture'])).rows[0].n,2)
 const lateArgs=[...cycleArgs];lateArgs[2]='in_late_fixture';lateArgs[3]=1790960001;lateArgs[8]='2026-11-01'
 assert.equal((await call('apply_billing_invoice',lateArgs)).ignored,true)
 assert.equal((await c.query('select credits_remaining from stripe_accounts where id=$1',[globalThis.billingId])).rows[0].credits_remaining,200)
 assert.equal(await call('finish_billing_event',['evt_processing_fixture',randomUUID(),null]),false)
 assert.equal(await call('finish_billing_event',['evt_processing_fixture',lease,null]),true)
 assert.equal(await call('claim_billing_event',['evt_processing_fixture','invoice.paid',randomUUID()]),'processed')
 await c.query('insert into klaviyo_accounts(id,user_id,active,segments,selected_segment) values($1,$2,true,$3,null)',[account,u,'[]'])
 const checkpoint=await call('get_scan_checkpoint',[account,'all'])
 assert.ok(new Date(checkpoint.through)>=new Date(checkpoint.floor))
 await call('commit_scan_checkpoint',[account,'all','2099-01-01'])
 assert.equal(new Date((await call('get_scan_checkpoint',[account,'all'])).through).getUTCFullYear(),2099)
 await c.query('insert into bulk_jobs(id,user_id,account_id,segment_id,profiles,profile_count,amount_cents,rate_cents,status,processed_count) values($1,$2,$3,$4,$5,2,10,5,$6,99)',[job,u,account,'all','[]','processing'])
 await c.query('insert into bulk_emails(bulk_job_id,email,profile_id,source_profile_id,account_id,user_id,tagged) values($1,$2,$3,$3,$4,$5,true),($1,$6,$7,$7,$4,$5,true)',[job,'a@example.invalid','p1',account,u,'b@example.invalid','p2'])
 const state=await call('reconcile_bulk_job',[job]);assert.equal(state.newCount,2);assert.equal(state.isComplete,true)
 assert.equal((await call('reconcile_bulk_job',[job])).newCount,2)
 const types=['summary','status_breakdown','detailed_breakdown','actionable_lists','domain_analysis','retry_analysis','cost_breakdown','timeline']
 const bundle=types.map(report_type=>({report_type,data:{fixture:true}}))
 await c.query('savepoint failed_bundle')
 await assert.rejects(call('save_bulk_report_bundle',[job,state.generation,JSON.stringify(bundle.slice(0,7))]))
 await c.query('rollback to savepoint failed_bundle')
 assert.equal((await c.query('select count(*)::int n from bulk_job_reports where bulk_job_id=$1',[job])).rows[0].n,0)
 assert.equal((await call('save_bulk_report_bundle',[job,state.generation,JSON.stringify(bundle)])).length,8)
 assert.equal((await call('save_bulk_report_bundle',[job,state.generation,JSON.stringify(bundle)])).length,0)
 // Merging destinations must preserve the number of paid source profiles.
 await c.query('update bulk_emails set profile_id=$1 where bulk_job_id=$2',['shared-destination',job])
 assert.equal((await call('reconcile_bulk_job',[job])).newCount,2)
 const refresh=await call('request_bulk_report_refresh',[job])
 assert.ok((await c.query('select bulk_job_id from get_pending_bulk_report_jobs()')).rows.some(r=>r.bulk_job_id===job))
 await c.query('savepoint failed_replacement_bundle')
 await c.query("create function pg_temp.reject_bulk_report() returns trigger language plpgsql as $$ begin if new.report_type='timeline' then raise exception 'injected bundle failure'; end if; return new; end $$; create trigger injected_bundle_failure before insert on bulk_job_reports for each row execute function pg_temp.reject_bulk_report()")
 await assert.rejects(call('save_bulk_report_bundle',[job,refresh,JSON.stringify(bundle)]))
 await c.query('rollback to savepoint failed_replacement_bundle')
 assert.equal((await c.query('select count(*)::int n from bulk_job_reports where bulk_job_id=$1',[job])).rows[0].n,8)
 const replacement=await call('save_bulk_report_bundle',[job,refresh,JSON.stringify(bundle)])
 assert.equal(replacement.length,8);assert.ok(replacement.every(r=>r.version===2))
 assert.equal((await c.query('select count(*)::int n from bulk_job_reports where bulk_job_id=$1',[job])).rows[0].n,16)
 await c.query('rollback')
 // Separate connections prove claims and account updates serialize under contention.
 const c2 = new pg.Client({ connectionString }); await c2.connect()
 const eventId='evt_fixture_'+randomUUID(), invoiceId='in_fixture_'+randomUUID(), lease1=randomUUID(), lease2=randomUUID()
 let billingId
 try {
  const claims=await Promise.all([
    c.query('select claim_billing_event($1,$2,$3) result',[eventId,'invoice.paid',lease1]),
    c2.query('select claim_billing_event($1,$2,$3) result',[eventId,'invoice.paid',lease2]),
  ])
  assert.deepEqual(claims.map(r=>r.rows[0].result).sort(),['busy','claimed'])
  const winningLease=claims[0].rows[0].result==='claimed'?lease1:lease2
  billingId=(await c.query('insert into stripe_accounts(user_id,customer_id,subscription_id,credits_plan,credits_remaining) values($1,$2,$3,100,73) returning id',[u,'cus_concurrent_fixture','sub_old'])).rows[0].id
  await c2.query('begin')
  await c2.query('update stripe_accounts set credits_remaining=credits_remaining-1,credits_used=credits_used+1 where id=$1',[billingId])
  let settled=false
  const apply=c.query('select apply_billing_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[eventId,winningLease,invoiceId,1790960000,billingId,'cus_concurrent_fixture','sub_new','subscription_update','2026-11-01','prod_fixture',200,100,0]).then(r=>{settled=true;return r})
  await c2.query('select pg_sleep(0.1)')
  assert.equal(settled,false,'Invoice must wait for the account lock')
  await c2.query('commit');await apply
  assert.equal((await c.query('select credits_remaining from stripe_accounts where id=$1',[billingId])).rows[0].credits_remaining,272)
 } finally {
  await c2.query('rollback').catch(()=>{})
  await c.query('delete from billing_invoice_effects where invoice_id=$1',[invoiceId])
  await c.query('delete from credit_history where context=$1',[invoiceId])
  if(billingId)await c.query('delete from stripe_accounts where id=$1',[billingId])
  await c.query('delete from stripe_webhook_events where event_id=$1',[eventId])
  await c2.end()
 }
 console.log('Passed: workspace reports, failed-write preservation, refresh generations, billing lease/replay/cancellation, atomic history, scan checkpoint, distinct bulk completion, complete report bundles')
} finally { await c.end() }
