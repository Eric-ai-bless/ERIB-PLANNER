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
 if(/invalid_grant|no user found|password invalid|invalid credentials/i.test(message)||e?.status===401)
  return 'Sign-in failed. Check your email and password, or use Forgot password to reset it. If you have never created an account here, choose Create account.'
 if(/confirm/i.test(message))return 'Please confirm your email using the link in your inbox before signing in.'
 if(/fetch|network|timeout|connection/i.test(message))return 'Connection failed. Check your internet connection and try again.'
 return 'The request could not be completed. Please try again.'
}
$('forgot').onclick=async()=>{
 interacted=true
 const email=$('inEmail')
 if(!email.value||!email.reportValidity()){email.focus();say('Enter your account email above to request a password reset.',true);return}
 const button=$('forgot');button.disabled=true;say('Sending password reset link…')
 try{const {requestPasswordRecovery}=await identityReady;await requestPasswordRecovery(normalizeEmail(email.value));say('If an account exists for this email, a reset link has been sent. Check your inbox and spam folder.')}
 catch(e){say(authError(e),true)}finally{button.disabled=false}
}
$('freset').onsubmit=async ev=>{
 ev.preventDefault();const f=ev.target;busy(f,true);say('Saving new password…')
 try{const {updateUser}=await identityReady;const user=await updateUser({password:$('resetPass').value});recovering=false;$('resetPass').value='';show(user);tab(false);document.querySelector('#auth .tabs').hidden=false;say('Password updated.')}
 catch(e){say(authError(e),true)}finally{busy(f,false)}
}
$('signout').onclick=async()=>{try{const {logout}=await identityReady;await logout()}catch(e){}show(null);tab(false)}
// Recovery must remain on the password form until the password is saved.
identityReady.then(async({onAuthChange,handleAuthCallback,getUser})=>{
 recovering=/(?:^#|&)recovery_token=/.test(location.hash)
 onAuthChange((ev,u)=>{if(ev==='logout')show(null);else if(u&&!recovering)show(u)})
 const callback=await handleAuthCallback()
 if(callback?.type==='recovery'){
  recovering=true;auth.hidden=false;$('fin').hidden=true;$('fup').hidden=true;$('freset').hidden=false;$('forgot').hidden=true
  document.querySelector('#auth .tabs').hidden=true
  say('Enter a new password to finish resetting your account.');$('resetPass').focus();return
 }
 if(callback?.user)show(callback.user)
 else{const user=await getUser();if(!interacted)show(user)}
}).catch(e=>{if(!interacted)say(authError(e),true)})
