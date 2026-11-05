// Bind the forms immediately; loading the client must not block typing.
const identityReady=import('./vendor/identity.mjs')
const normalizeEmail=value=>value.trim().toLowerCase()
const $=id=>document.getElementById(id)
const auth=$('auth'),msg=$('amsg')
const say=(t,err)=>{msg.textContent=t||'';msg.className=err?'err':''}
const nameOf=u=>(u&&(u.userMetadata&&u.userMetadata.username))||(u&&u.name)||(u&&u.email)||''
let activeUserId=null,recovering=false,interacted=false,recoveryEmail='',recoveryJwt=''
const cookie=n=>{const m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));try{return m?decodeURIComponent(m[1]):''}catch(e){return m?m[1]:''}}
function show(u){
 const changed=activeUserId!==(u?.id||null);activeUserId=u?.id||null
 if(u){auth.hidden=true;$('ubar').hidden=false;$('uname').textContent=nameOf(u);$('burger').hidden=false;$('dname').textContent='Signed in as '+nameOf(u);$('dhi').textContent='Welcome, '+(String(nameOf(u)).split(/[\s@]/)[0]||'teacher');if(changed){window.loadSaved&&window.loadSaved();window.loadAccount&&window.loadAccount()}}
 else{window.clearAccount&&window.clearAccount();window.clearSaved&&window.clearSaved();window.closeMenu&&window.closeMenu();$('burger').hidden=true;window.setView&&window.setView('dash',1);auth.hidden=false;$('ubar').hidden=true;$('aload').hidden=true;$('aforms').hidden=false}
}
$('aload').hidden=true;$('aforms').hidden=false
function tab(up){$('freset').hidden=true;$('forgot').hidden=up;$('fin').hidden=up;$('fup').hidden=!up;$('tin').className=up?'alt':'';$('tup').className=up?'':'alt';say('')}
$('tin').onclick=()=>tab(false);$('tup').onclick=()=>tab(true)
const busy=(f,on)=>f.querySelectorAll('button,input').forEach(e=>e.disabled=on)
async function doLogin(email,password){
 try{const {login}=await identityReady;show(await login(normalizeEmail(email),password))}
 catch(e){say(authError(e),true)}
}
$('fin').onsubmit=async ev=>{ev.preventDefault();interacted=true;const f=ev.target;busy(f,true);say('Signing in…')
 await doLogin($('inEmail').value.trim(),$('inPass').value);busy(f,false)}
$('fup').onsubmit=async ev=>{ev.preventDefault();interacted=true;const f=ev.target;busy(f,true);say('Creating account…')
 const email=normalizeEmail($('upEmail').value),password=$('upPass').value
 try{
  const r=await fetch('/api/signup',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({firstName:$('upFirst').value.trim(),lastName:$('upLast').value.trim(),email,password})})
  const j=await r.json().catch(()=>({}))
  if(!r.ok)say(j.error||'Could not create the account.',true)
  else{say('Account created. Signing you in…');await doLogin(email,password)}
 }catch(e){say(e.name==='TimeoutError'?'The request timed out. Try signing in before creating the account again.':'Connection failed. Check your internet connection and try again.',true)}
 busy(f,false)}
function authError(e){
 const message=String(e?.message||'')
 if(/invalid_grant|no user found|password invalid|invalid credentials/i.test(message)||(e?.status===401&&!recovering))
  return 'Sign-in failed. Check your email and password, or use Forgot password to reset it. If you have never created an account here, choose Create account.'
 if(/confirm/i.test(message))return 'Please confirm your email using the link in your inbox before signing in.'
 if(e?.status===429||/rate limit|only request this|too many/i.test(message))return 'Too many attempts in a short time. Please wait a minute, then try again.'
 if(/fetch|network|timeout|connection/i.test(message))return 'Connection failed. Check your internet connection and try again.'
 if(/password/i.test(message)&&message.length<200)return message
 return 'The request could not be completed. Please try again.'+(message&&message.length<200?' ('+message+')':'')
}
$('forgot').onclick=async()=>{
 interacted=true
 const email=$('inEmail')
 if(!email.value||!email.reportValidity()){email.focus();say('Enter your account email above to request a password reset.',true);return}
 const button=$('forgot');button.disabled=true;say('Sending password reset link…')
 try{const {requestPasswordRecovery}=await identityReady;await requestPasswordRecovery(normalizeEmail(email.value));say('If an account exists for this email, a reset link has been sent. Check your inbox and spam folder.')}
 catch(e){say(authError(e),true)}finally{button.disabled=false}
}
// Save the new password. Falls back to a direct request with the reset session's token if the client call fails.
async function savePassword(password){
 const lib=await identityReady
 try{return await lib.updateUser({password})}
 catch(first){
  const jwt=cookie('nf_jwt')||recoveryJwt
  if(!jwt)throw first
  const r=await fetch('/.netlify/identity/user',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify({password}),signal:AbortSignal.timeout(20000)})
  const j=await r.json().catch(()=>({}))
  if(!r.ok){const err=new Error(j.msg||j.error_description||first?.message||'');err.status=r.status;throw err}
  const email=j.email||recoveryEmail
  if(email){try{return await lib.login(email,password)}catch(e){}}
  return null
 }
}
$('freset').onsubmit=async ev=>{
 ev.preventDefault();const f=ev.target,password=$('resetPass').value;busy(f,true);say('Saving new password…')
 try{
  const user=await savePassword(password)
  recovering=false;$('resetPass').value='';document.querySelector('#auth .tabs').hidden=false;tab(false)
  if(user){show(user);say('Password updated.')}
  else{if(recoveryEmail)$('inEmail').value=recoveryEmail;say('Password updated. Sign in with your new password.')}
 }
 catch(e){
  if(e?.status===401||/jwt|not logged in|no user|invalid token/i.test(String(e?.message||''))){
   recovering=false;document.querySelector('#auth .tabs').hidden=false;tab(false);if(recoveryEmail)$('inEmail').value=recoveryEmail
   say('Your reset session has expired. Click Forgot password to get a new link, then use the newest email.',true)
  }else say(authError(e),true)
 }
 finally{busy(f,false)}
}
$('signout').onclick=async()=>{try{const {logout}=await identityReady;await logout()}catch(e){}show(null);tab(false)}
// Recovery must remain on the password form until the password is saved.
identityReady.then(async({onAuthChange,handleAuthCallback,getUser})=>{
 // Restore the email-link token if anything removed it from the address bar before this point.
 let saved=null;try{saved=sessionStorage.getItem('authLinkHash');sessionStorage.removeItem('authLinkHash')}catch(e){}
 if(saved&&!/(recovery|confirmation|invite|email_change|access)_token=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search+saved)
 const params=new URLSearchParams(location.hash.slice(1))
 recovering=params.has('recovery_token')||params.get('type')==='recovery'
 if(params.has('error')||params.has('error_description')){
  history.replaceState(null,'',location.pathname+location.search)
  say('This email link is invalid or has expired. Enter your email and use Forgot password to request a new link.',true);return
 }
 onAuthChange((ev,u)=>{if(ev==='logout')show(null);else if(u&&!recovering)show(u)})
 const callback=await handleAuthCallback()
 if(callback?.type==='recovery'||(recovering&&callback?.user)){
  recovering=true;recoveryEmail=callback?.user?.email||'';recoveryJwt=cookie('nf_jwt');auth.hidden=false;$('fin').hidden=true;$('fup').hidden=true;$('freset').hidden=false;$('forgot').hidden=true
  document.querySelector('#auth .tabs').hidden=true
  say('Enter a new password to finish resetting your account.');$('resetPass').focus();return
 }
 if(callback?.user)show(callback.user)
 else{const user=await getUser();if(!interacted)show(user)}
}).catch(e=>{
 if(recovering){recovering=false;history.replaceState(null,'',location.pathname+location.search);say('This password reset link could not be verified. Enter your email and use Forgot password to request a new link.',true)}
 else if(!interacted)say(authError(e),true)
})
