// Bind the forms immediately; loading the client must not block typing.
const identityReady=import('./vendor/identity.mjs')
const normalizeEmail=value=>value.trim().toLowerCase()
const $=id=>document.getElementById(id)
const auth=$('auth'),msg=$('amsg')
const say=(t,err)=>{msg.textContent=t||'';msg.className=err?'err':''}
const nameOf=u=>(u&&(u.userMetadata&&u.userMetadata.username))||(u&&u.name)||(u&&u.email)||''
let activeUserId=null,recovering=false,interacted=false
function show(u){
 const changed=activeUserId!==(u?.id||null);activeUserId=u?.id||null
 if(u){auth.hidden=true;$('ubar').hidden=false;$('uname').textContent=nameOf(u);$('burger').hidden=false;$('dname').textContent='Signed in as '+nameOf(u);$('dhi').textContent='Welcome, '+(String(nameOf(u)).split(/[\s@]/)[0]||'teacher');if(changed){window.loadSaved&&window.loadSaved();window.loadAccount&&window.loadAccount()}}
 else{window.clearAccount&&window.clearAccount();window.clearSaved&&window.clearSaved();window.closeMenu&&window.closeMenu();$('burger').hidden=true;window.setView&&window.setView('dash',1);auth.hidden=false;$('ubar').hidden=true;$('aload').hidden=true;$('aforms').hidden=false}
}
$('aload').hidden=true;$('aforms').hidden=false
function tab(up){$('freset').hidden=true;document.querySelector('#auth .tabs').hidden=false;$('forgot').hidden=up;$('fin').hidden=up;$('fup').hidden=!up;$('tin').className=up?'alt':'';$('tup').className=up?'':'alt';say('')}
$('tin').onclick=()=>tab(false);$('tup').onclick=()=>tab(true)
const busy=(f,on)=>f.querySelectorAll('button,input').forEach(e=>e.disabled=on)
const OWNER='blessedtalent1997@gmail.com'
let ownerChecked=false
async function doLogin(email,password){
 email=normalizeEmail(email)
 // First owner sign-in after setup applies the admin password (runs once on the server, then never again).
 if(email===OWNER&&!ownerChecked){ownerChecked=true;try{await fetch('/api/owner-setup',{method:'POST',signal:AbortSignal.timeout(15000)})}catch(e){}}
 try{const {login}=await identityReady;show(await login(email,password))}
 catch(e){say(authError(e),true)}
}
$('fin').onsubmit=async ev=>{ev.preventDefault();interacted=true;const f=ev.target;busy(f,true);say('Signing in…')
 await doLogin($('inEmail').value.trim(),$('inPass').value);busy(f,false)}
$('fup').onsubmit=async ev=>{ev.preventDefault();interacted=true;const f=ev.target;busy(f,true);say('Creating account…')
 const email=normalizeEmail($('upEmail').value),password=$('upPass').value
 try{
  const r=await fetch('/api/signup',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({firstName:$('upFirst').value.trim(),lastName:$('upLast').value.trim(),email,password,birthday:$('upBirth').value,food:$('upFood').value.trim()})})
  const j=await r.json().catch(()=>({}))
  if(!r.ok)say(j.error||'Could not create the account.',true)
  else{say('Account created. Signing you in…');await doLogin(email,password)}
 }catch(e){say(e.name==='TimeoutError'?'The request timed out. Try signing in before creating the account again.':'Connection failed. Check your internet connection and try again.',true)}
 busy(f,false)}
function authError(e){
 const message=String(e?.message||'')
 if(/invalid_grant|no user found|password invalid|invalid credentials/i.test(message)||(e?.status===401&&!recovering))
  return 'Sign-in failed. Check your email and password, or use Forgot password to reset it with your birthday or favorite food. If you have never created an account here, choose Create account.'
 if(/confirm/i.test(message))return 'Please confirm your email using the link in your inbox before signing in.'
 if(e?.status===429||/rate limit|only request this|too many/i.test(message))return 'Too many attempts in a short time. Please wait a minute, then try again.'
 if(/fetch|network|timeout|connection/i.test(message))return 'Connection failed. Check your internet connection and try again.'
 if(/password/i.test(message)&&message.length<200)return message
 return 'The request could not be completed. Please try again.'+(message&&message.length<200?' ('+message+')':'')
}
// Forgot password: prove identity with birthday OR favorite food (no email link), then set a new password.
const today=()=>new Date().toISOString().slice(0,10)
$('upBirth').max=today()
function showReset(on){$('freset').hidden=!on;$('fin').hidden=on;$('fup').hidden=true;$('forgot').hidden=on;document.querySelector('#auth .tabs').hidden=on;say('')
 if(on){$('rsBirth').max=today();if(!$('rsEmail').value)$('rsEmail').value=$('inEmail').value.trim();($('rsEmail').value?$('rsMethod'):$('rsEmail')).focus()}}
function pickMethod(){const food=$('rsMethod').value==='food';$('rsFoodL').hidden=!food;$('rsBirthL').hidden=food;$('rsFood').required=food;$('rsBirth').required=!food}
$('rsMethod').onchange=pickMethod;pickMethod()
$('forgot').onclick=()=>{interacted=true;showReset(true);say('Choose your birthday or favorite food, then enter a new password.')}
$('rsBack').onclick=()=>{showReset(false);tab(false)}
$('freset').onsubmit=async ev=>{
 ev.preventDefault();interacted=true;const f=ev.target,email=normalizeEmail($('rsEmail').value),password=$('resetPass').value,method=$('rsMethod').value
 const answer=method==='food'?$('rsFood').value.trim():$('rsBirth').value
 busy(f,true);say('Checking your answer…')
 try{
  const r=await fetch('/api/recover',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({email,method,answer,password})})
  const j=await r.json().catch(()=>({}))
  if(!r.ok){say(j.error||'Could not reset the password. Please try again.',true);return}
  $('resetPass').value='';$('rsFood').value='';$('rsBirth').value='';showReset(false);tab(false);$('inEmail').value=email
  say('Password updated. Signing you in…');await doLogin(email,password)
 }catch(e){say(e.name==='TimeoutError'?'The request timed out. Please try again.':'Connection failed. Check your internet connection and try again.',true)}
 finally{busy(f,false)}
}
$('signout').onclick=async()=>{try{const {logout}=await identityReady;await logout()}catch(e){}show(null);tab(false)}
// Email reset links are no longer used: an old link is refused and the user is pointed to the security questions.
identityReady.then(async({onAuthChange,handleAuthCallback,getUser,logout})=>{
 let saved=null;try{saved=sessionStorage.getItem('authLinkHash');sessionStorage.removeItem('authLinkHash')}catch(e){}
 if(saved&&!/(recovery|confirmation|invite|email_change|access)_token=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search+saved)
 const params=new URLSearchParams(location.hash.slice(1))
 recovering=params.has('recovery_token')||params.get('type')==='recovery'
 const oldLinkMsg='Password reset by email is no longer available. Click Forgot password and answer with your birthday or favorite food.'
 if(params.has('error')||params.has('error_description')){
  history.replaceState(null,'',location.pathname+location.search)
  say(recovering?oldLinkMsg:'This email link is invalid or has expired.',true);return
 }
 if(recovering){history.replaceState(null,'',location.pathname+location.search);recovering=false;say(oldLinkMsg,true)}
 onAuthChange((ev,u)=>{if(ev==='logout')show(null);else if(u)show(u)})
 const callback=await handleAuthCallback().catch(()=>null)
 if(callback?.type==='recovery'){try{await logout()}catch(e){}show(null);say(oldLinkMsg,true);return}
 if(callback?.user)show(callback.user)
 else{const user=await getUser();if(!interacted)show(user)}
}).catch(e=>{if(!interacted)say(authError(e),true)})
