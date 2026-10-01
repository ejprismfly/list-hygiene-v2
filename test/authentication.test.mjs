import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import urlSafety from '../src/lib/url-safety.cjs'

function load(path, dependencies) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const compiled={exports:{}}
  new Function('require','exports','module',code)(name=>{
    if(!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  },compiled.exports,compiled)
  return compiled.exports
}
function harness({ authError=null, grant=null, rate=null, signupIdentities=[{}], signupFailure=false, bootstrapFailure=false, signoutFailure=false }={}) {
  const calls=[];const deleted=[]
  const form=load('../src/lib/auth-form.ts',{})
  const auth={
    async signInWithPassword(value){calls.push(['login',value]);return {error:authError}},
    async signUp(value){calls.push(['signup',value]);if(signupFailure)throw new Error('provider unavailable');return {data:{user:{id:'user',identities:signupIdentities},session:null},error:authError}},
    async resend(value){calls.push(['resend',value]);return {error:authError}},
    async resetPasswordForEmail(...value){calls.push(['recovery',value]);return {error:authError}},
    async updateUser(value){calls.push(['password',value]);return {error:authError}},
    async signOut(value){calls.push(['logout',value]);if(signoutFailure)throw new Error('outage');return {error:authError}},
  }
  const api=load('../src/app/(auth)/actions.ts',{
    'next/headers':{headers:async()=>new Headers({origin:'https://app.listhygiene.com'}),cookies:async()=>({getAll:()=>[{name:'sb-example-auth-token'}],delete:name=>deleted.push(name),set:()=>{}})},
    'next/navigation':{redirect(path){throw Object.assign(new Error('redirect'),{path})}},
    '@/lib/auth-form':form,
    '@/lib/api/tenant':{getOrCreateDefaultOrganization:async()=>({ok:true})},
    '@/lib/api/validation':{normalizedEmail:value=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())?value.trim().toLowerCase():null},
    '@/lib/auth-security':{limitAuthAttempt:async()=>rate,claimPasswordGrant:async()=>grant?{supabase:{auth},nextPath:'/invite?token=abc'}:null,PASSWORD_GRANT_COOKIE:'grant'},
    '@/lib/auth-analytics':{AUTH_ANALYTICS_COOKIE:'analytics'},
    '@/lib/billing/customer':{ensureStripeCustomerOnRegistration:async()=>{calls.push(['bootstrap']);if(bootstrapFailure)throw new Error('billing outage')}},
    '@/lib/onboarding':{isOnboardingPath:()=>false,SIGNUP_ONBOARDING_COOKIE:'onboarding',SIGNUP_ONBOARDING_COOKIE_MAX_AGE:100},
    '@/lib/supabase/admin':{createAdminClient:()=>({})},
    '@/lib/supabase/env':{getSupabaseConfig:()=>({})},
    '@/lib/supabase/server':{createClient:async()=>({auth})},
    '@/lib/url-safety.cjs':urlSafety,
    '@/lib/workspace-utils':{WORKSPACE_ID_COOKIE:'workspace',WORKSPACE_ORGANIZATION_COOKIE:'organization'},
  })
  return {api,calls,deleted}
}
const form=(values={})=>{const data=new FormData();for(const [key,value]of Object.entries({email:' User@Example.test ',password:' password ',confirmPassword:' password ',terms:'on',...values}))data.set(key,value);return data}
const initial={status:'idle',message:''}

test('login preserves passwords and normalizes email without imposing signup policy',async()=>{
  const h=harness();await assert.rejects(h.api.loginAction(initial,form({password:' a '})),error=>error.path==='/dashboard')
  assert.deepEqual(h.calls[0],['login',{email:'user@example.test',password:' a '}])
})
test('signup preserves whitespace and validates creation policy and terms',async()=>{
  const h=harness();assert.equal((await h.api.signupAction(initial,form({password:'short'}))).status,'error')
  assert.equal((await h.api.signupAction(initial,form({terms:''}))).status,'error');assert.equal(h.calls.length,0)
  assert.equal((await h.api.signupAction(initial,form())).status,'success');assert.equal(h.calls[0][1].password,' password ')
})
test('existing and new signup responses hide account existence',async()=>{
  const fresh=await harness().api.signupAction(initial,form())
  const existing=await harness({authError:{message:'User already registered',status:400}}).api.signupAction(initial,form())
  const hidden=await harness({signupIdentities:[]}).api.signupAction(initial,form())
  assert.deepEqual(existing,fresh);assert.deepEqual(hidden,fresh)
})
test('billing outage cannot reject an otherwise valid signup',async()=>{
  const h=harness({bootstrapFailure:true});const result=await h.api.signupAction(initial,form());assert.equal(result.status,'success')
})
test('login rejects provider errors with a sanitized stable response',async()=>{
  const h=harness({authError:{message:'sensitive internal account detail'}})
  const result=await h.api.loginAction(initial,form());assert.equal(result.errorCode,'invalid_credentials');assert.doesNotMatch(result.message,/sensitive/)
})
test('rate limit and limiter outages prevent provider requests',async()=>{
  for(const errorCode of ['rate_limited','auth_unavailable']){
    const h=harness({rate:{status:'error',errorCode,message:'Try later'}})
    for(const action of ['loginAction','signupAction','forgotPasswordAction','resendSignupConfirmationAction'])assert.equal((await h.api[action](initial,form())).errorCode,errorCode)
    assert.equal(h.calls.length,0)
  }
})
test('reset requires a single-use email grant even with an authenticated session',async()=>{
  const h=harness();assert.equal((await h.api.resetPasswordAction(initial,form())).errorCode,'invalid_recovery');assert.equal(h.calls.length,0)
})
test('reset preserves the password and revokes all sessions before fresh login',async()=>{
  const h=harness({grant:true});await assert.rejects(h.api.resetPasswordAction(initial,form()),error=>error.path.startsWith('/login?next=%2Finvite'))
  assert.deepEqual(h.calls,[['password',{password:' password '}],['logout',{scope:'global'}]])
  assert.ok(h.deleted.includes('sb-example-auth-token'));assert.ok(h.deleted.includes('grant'))
})
test('reset does not report success if session revocation fails',async()=>{
  const h=harness({grant:true,signoutFailure:true});assert.equal((await h.api.resetPasswordAction(initial,form())).errorCode,'session_revocation_failed');assert.ok(h.deleted.includes('sb-example-auth-token'))
})
test('logout clears cookies during provider outages',async()=>{
  const h=harness({signoutFailure:true});await assert.rejects(h.api.signOutAction(),error=>error.path==='/login?error=session_revocation_failed');assert.ok(h.deleted.includes('workspace'));assert.ok(h.deleted.includes('sb-example-auth-token'))
})
test('active session guard fails closed for revoked, unconfirmed and unavailable sessions',async()=>{
  const api=load('../src/lib/auth-session.ts',{'@/lib/supabase/server':{}})
  const user={id:'user',email_confirmed_at:'now'}
  const make=({confirmed=true,active=true,throws=false,subject='user'}={})=>({auth:{getUser:async()=>({data:{user:confirmed?user:{id:'user'}},error:null}),getClaims:async()=>({data:{claims:{sub:subject,session_id:'session'}},error:null})},rpc:async()=>{if(throws)throw new Error('outage');return {data:active,error:null}}})
  assert.equal((await api.getVerifiedSession(make())).user.id,'user')
  for(const options of [{confirmed:false},{active:false},{throws:true},{subject:'other'}])assert.equal(await api.getVerifiedSession(make(options)),null)
})
test('callback refuses missing, duplicate and ambiguous credentials and unsupported types',async()=>{
  let verifies=0,grants=0
  const api=load('../src/app/auth/callback/route.ts',{
    'next/server':{NextResponse:{redirect:url=>({url:url.toString(),cookies:{set(){}}})}},
    '@/lib/auth-analytics':{},'@/lib/onboarding':{isOnboardingPath:()=>false},
    '@/lib/auth-security':{issuePasswordGrant:async()=>{grants++}},
    '@/lib/supabase/env':{getSupabaseConfig:()=>({})},
    '@/lib/supabase/server':{createClient:async()=>({auth:{verifyOtp:async()=>{verifies++;return {error:{message:'expired'}}},exchangeCodeForSession:async()=>{verifies++;return {error:{message:'expired'}}}}})},
    '@/lib/url-safety.cjs':urlSafety,
  })
  for(const query of ['type=signup','type=magiclink&token_hash=x','type=signup&code=x&token_hash=y','type=signup&type=invite&token_hash=x','type=signup&next=%2F%0A%2Fevil.example']){
    const response=await api.GET({url:`https://app.listhygiene.com/auth/callback?${query}`,headers:new Headers()})
    const url=new URL(response.url);assert.equal(url.origin,'https://app.listhygiene.com');assert.equal(url.pathname,'/login')
  }
  assert.equal(verifies,0);assert.equal(grants,0)
  assert.equal(new URL((await api.GET({url:'https://app.listhygiene.com/auth/callback?type=signup&token_hash=expired',headers:new Headers()})).url).pathname,'/login')
  assert.equal(verifies,1)
})

test('confirmation accepts a valid signup link from the existing duplicate-type template',async()=>{
  let verified=0
  const api=load('../src/app/auth/callback/route.ts',{
    'next/server':{NextResponse:{redirect:url=>({url:url.toString(),cookies:{set(){}}})}},
    '@/lib/auth-analytics':{},'@/lib/onboarding':{isOnboardingPath:()=>false},
    '@/lib/auth-security':{issuePasswordGrant:async()=>{}},
    '@/lib/supabase/env':{getSupabaseConfig:()=>({})},
    '@/lib/supabase/server':{createClient:async()=>({auth:{verifyOtp:async()=>{verified++;return {data:{user:{id:'user',email_confirmed_at:'now'},session:{user:{}}},error:null}},getUser:async()=>({data:{user:{}}})}})},
    '@/lib/url-safety.cjs':urlSafety,
  })
  const result=await api.GET({url:'https://app.listhygiene.com/auth/callback?type=signup&next=/dashboard&token_hash=valid&type=signup',headers:new Headers()})
  assert.equal(new URL(result.url).pathname,'/dashboard');assert.equal(verified,1)
})

test('admin client rejects missing or mislabeled anonymous credentials',()=>{
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY
  let creates=0
  const api=load('../src/lib/supabase/admin.ts',{
    '@supabase/supabase-js':{createClient:()=>{creates++;return {}}},
    '@/lib/supabase/env':{requireSupabaseConfig:()=>({url:'https://project.supabase.co'})},
  })
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    assert.throws(()=>api.createAdminClient(),/required/)
    process.env.SUPABASE_SERVICE_ROLE_KEY=`header.${Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')}.signature`
    assert.throws(()=>api.createAdminClient(),/service-role/)
    process.env.SUPABASE_SERVICE_ROLE_KEY=`header.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`
    api.createAdminClient();assert.equal(creates,1)
  } finally {if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous}
})
