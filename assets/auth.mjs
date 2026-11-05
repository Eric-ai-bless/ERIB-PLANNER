import { login, logout, getUser, onAuthChange, handleAuthCallback, AuthError } from './vendor/identity.mjs'
const $=id=>document.getElementById(id)
const auth=$('auth'),msg=$('amsg')
const say=(t,err)=>{msg.textContent=t||'';msg.className=err?'err':''}
const nameOf=u=>(u&&(u.userMetadata&&u.userMetadata.username))||(u&&u.name)||(u&&u.email)||''
let activeUserId=null
function show(u){
 const changed=activeUserId!==(u?.id||null);activeUserId=u?.id||null
 if(u){auth.hidden=true;$('ubar').hidden=false;$('uname').textContent=nameOf(u);$('burger').hidden=false;$('dname').textContent='Signed in as '+nameOf(u);$('dhi').textContent='Welcome, '+(String(nameOf(u)).split(/[\s@]/)[0]||'teacher');if(changed){window.loadSaved&&window.loadSaved();window.loadAccount&&window.loadAccount()}}
 else{window.clearAccount&&window.clearAccount();window.clearSaved&&window.clearSaved();window.closeMenu&&window.closeMenu();$('burger').hidden=true;window.setView&&window.setView('dash',1);auth.hidden=false;$('ubar').hidden=true;$('aload').hidden=true;$('aforms').hidden=false}
}
$('aload').hidden=true;$('aforms').hidden=false
function tab(up){$('fin').hidden=up;$('fup').hidden=!up;$('tin').className=up?'alt':'';$('tup').className=up?'':'alt';say('')}
$('tin').onclick=()=>tab(false);$('tup').onclick=()=>tab(true)
const busy=(f,on)=>f.querySelectorAll('button,input').forEach(e=>e.disabled=on)
async function doLogin(email,password){
 try{show(await login(email,password))}
 catch(e){say(e instanceof AuthError&&(e.status===401||e.status===400)?'Wrong email or password.':(e.message||'Sign in failed.'),true)}
}
$('fin').onsubmit=async ev=>{ev.preventDefault();const f=ev.target;busy(f,true);say('Signing in…')
 await doLogin($('inEmail').value.trim(),$('inPass').value);busy(f,false)}
$('fup').onsubmit=async ev=>{ev.preventDefault();const f=ev.target;busy(f,true);say('Creating account…')
 const email=$('upEmail').value.trim(),password=$('upPass').value
 try{
  const r=await fetch('/api/signup',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({firstName:$('upFirst').value.trim(),lastName:$('upLast').value.trim(),email,password})})
  const j=await r.json().catch(()=>({}))
  if(!r.ok)say(j.error||'Could not create the account.',true)
  else{say('Account created. Signing you in…');await doLogin(email,password)}
 }catch(e){say(e.name==='TimeoutError'?'The request timed out. Try signing in before creating the account again.':'Connection failed. Check your internet connection and try again.',true)}
 busy(f,false)}
$('signout').onclick=async()=>{try{await logout()}catch(e){}show(null);tab(false)}
onAuthChange((ev,u)=>{if(ev==='logout')show(null);else if(u)show(u)})
try{const callback=await handleAuthCallback();show(callback?.user||await getUser())}catch(e){show(null);say(e.message||'Could not restore your session. Please sign in.',true)}
