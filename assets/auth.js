// Sign-in, account creation and password reset.
// Talks to Netlify Identity directly with plain fetch so it loads instantly and works on older
// phones and slow connections (no large library to download, short requests retried once).
(function(){
'use strict'
var ID='/.netlify/identity',STORE='erib.session',OWNER='blessedtalent1997@gmail.com'
var $=function(id){return document.getElementById(id)}
var auth=$('auth'),msg=$('amsg')
function say(t,err){msg.textContent=t||'';msg.className=err?'err':''}
function normalizeEmail(v){return String(v||'').trim().toLowerCase()}
var activeUserId=null,interacted=false,refreshTimer=null,session=null

// ---------- network helpers ----------
function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}
// fetch with a timeout that works even where AbortSignal.timeout is missing.
function send(url,opts,ms){
 opts=opts||{}
 return new Promise(function(resolve,reject){
  var done=false,ctl=typeof AbortController==='function'?new AbortController():null
  if(ctl)opts.signal=ctl.signal
  var t=setTimeout(function(){if(done)return;done=true;try{ctl&&ctl.abort()}catch(e){}var e=new Error('timeout');e.kind='timeout';reject(e)},ms||25000)
  fetch(url,opts).then(function(r){if(done)return;done=true;clearTimeout(t);resolve(r)},function(err){if(done)return;done=true;clearTimeout(t);var e=new Error(String(err&&err.message||err));e.kind='network';reject(e)})
 })
}
// Retries once after a short pause when the connection drops (safe only for requests without side effects).
function sendRetry(url,opts,ms){
 var copy=function(){var o={};for(var k in opts)o[k]=opts[k];return o}
 return send(url,copy(),ms).catch(function(e){if(e.kind!=='network'&&e.kind!=='timeout')throw e;return wait(1200).then(function(){return send(url,copy(),ms)})})
}
function readJson(r){return r.text().then(function(t){try{return JSON.parse(t)}catch(e){return {}}})}
function netMessage(e){
 if(e&&e.kind==='timeout')return 'The server took too long to answer. Please check your connection and try again.'
 if(typeof navigator!=='undefined'&&navigator.onLine===false)return 'You appear to be offline. Connect to the internet and try again.'
 return 'Could not reach the server. Please check your connection and try again.'
}

// ---------- session (tokens are kept in localStorage and the nf_jwt cookie the server reads) ----------
function cookie(name,val){document.cookie=name+'='+(val==null?'':encodeURIComponent(val))+'; path=/; secure; samesite=lax'+(val==null?'; expires=Thu, 01 Jan 1970 00:00:00 GMT':'')}
function getCookie(name){var m=new RegExp('(?:^|; )'+name+'=([^;]*)').exec(document.cookie);if(!m)return null;try{return decodeURIComponent(m[1])}catch(e){return m[1]}}
function saveSession(tok){
 session={access_token:tok.access_token,refresh_token:tok.refresh_token,expires_at:Date.now()+((tok.expires_in||3600)*1000)}
 try{localStorage.setItem(STORE,JSON.stringify(session))}catch(e){}
 cookie('nf_jwt',session.access_token);if(session.refresh_token)cookie('nf_refresh',session.refresh_token)
 clearTimeout(refreshTimer)
 refreshTimer=setTimeout(function(){refresh().catch(function(){})},Math.max(30000,session.expires_at-Date.now()-120000))
}
function clearSession(){
 session=null;clearTimeout(refreshTimer)
 try{localStorage.removeItem(STORE);localStorage.removeItem('gotrue.user')}catch(e){}
 cookie('nf_jwt',null);cookie('nf_refresh',null)
}
function loadSession(){
 try{var s=JSON.parse(localStorage.getItem(STORE)||'null');if(s&&s.refresh_token)return s}catch(e){}
 // Sessions saved by the previous sign-in library.
 try{var g=JSON.parse(localStorage.getItem('gotrue.user')||'null');if(g&&g.token&&g.token.refresh_token)return {access_token:g.token.access_token,refresh_token:g.token.refresh_token,expires_at:g.token.expires_at||0}}catch(e){}
 var rt=getCookie('nf_refresh');if(rt)return {access_token:getCookie('nf_jwt'),refresh_token:rt,expires_at:0}
 return null
}
function token(body){
 return sendRetry(ID+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body}).then(function(r){
  return readJson(r).then(function(j){if(!r.ok){var e=new Error(j.error_description||j.msg||j.error||('Error '+r.status));e.status=r.status;e.code=j.error;throw e}return j})
 })
}
function refresh(){
 if(!session||!session.refresh_token)return Promise.reject(new Error('no session'))
 return token('grant_type=refresh_token&refresh_token='+encodeURIComponent(session.refresh_token)).then(function(t){saveSession(t);return t},function(e){if(e.status===400||e.status===401){clearSession();show(null)}throw e})
}
function fetchUser(){
 return sendRetry(ID+'/user',{headers:{Authorization:'Bearer '+session.access_token}}).then(function(r){
  return readJson(r).then(function(j){if(!r.ok){var e=new Error(j.msg||('Error '+r.status));e.status=r.status;throw e}return toUser(j)})
 })
}
function toUser(u){var md=u.user_metadata||{};return {id:u.id,email:u.email,name:md.full_name||md.username||'',userMetadata:md,roles:(u.app_metadata&&u.app_metadata.roles)||[]}}
function login(email,password){
 return token('grant_type=password&username='+encodeURIComponent(email)+'&password='+encodeURIComponent(password)).then(function(t){saveSession(t);return fetchUser()})
}
// Keep the session fresh when the phone wakes the tab after a long pause.
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&session&&session.expires_at-Date.now()<180000)refresh().catch(function(){})})

// ---------- UI ----------
function nameOf(u){return (u&&u.userMetadata&&u.userMetadata.username)||(u&&u.name)||(u&&u.email)||''}
function show(u){
 var changed=activeUserId!==(u?u.id:null);activeUserId=u?u.id:null
 if(u){say('');auth.hidden=true;$('ubar').hidden=false;$('uname').textContent=nameOf(u);$('burger').hidden=false;$('dname').textContent='Signed in as '+nameOf(u);$('dhi').textContent='Welcome, '+(String(nameOf(u)).split(/[\s@]/)[0]||'teacher');if(changed){window.loadSaved&&window.loadSaved();window.loadAccount&&window.loadAccount()}}
 else{window.clearAccount&&window.clearAccount();window.clearSaved&&window.clearSaved();window.closeMenu&&window.closeMenu();$('burger').hidden=true;window.setView&&window.setView('dash',1);auth.hidden=false;$('ubar').hidden=true;$('aload').hidden=true;$('aforms').hidden=false}
}
$('aload').hidden=true;$('aforms').hidden=false
function tab(up){$('freset').hidden=true;document.querySelector('#auth .tabs').hidden=false;$('forgot').hidden=up;$('fin').hidden=up;$('fup').hidden=!up;$('tin').className=up?'alt':'';$('tup').className=up?'':'alt';say('')}
$('tin').onclick=function(){tab(false)};$('tup').onclick=function(){tab(true)}
function busy(f,on){var els=f.querySelectorAll('button,input,select');for(var i=0;i<els.length;i++)els[i].disabled=on}
function authError(e){
 if(e&&(e.kind==='network'||e.kind==='timeout'))return netMessage(e)
 var m=String(e&&e.message||'')
 if(e&&e.status===429||/rate limit|too many/i.test(m))return 'Too many attempts in a short time. Please wait a minute, then try again.'
 if(/confirm/i.test(m))return 'This account is not confirmed yet. Ask the admin to confirm it, or create the account again.'
 if(e&&e.code==='invalid_grant'||/no user found|password invalid|invalid_grant/i.test(m))
  return 'Wrong email or password. Check them and try again, or use Forgot password to reset it with your birthday or favorite food. New here? Choose Create account.'
 return 'Sign-in failed. Please try again.'+(m&&m.length<160?' ('+m+')':'')
}
// The owner's very first sign-in with the initial admin password sets that password up on the server.
function ownerSetup(password){
 return send('/api/owner-setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:password})},25000)
  .then(readJson).then(function(j){return !!j.done}).catch(function(){return false})
}
function doLogin(email,password){
 email=normalizeEmail(email)
 return login(email,password).then(show).catch(function(e){
  if(email===OWNER&&e.code==='invalid_grant')return ownerSetup(password).then(function(done){if(!done)throw e;return login(email,password).then(show)})
  throw e
 }).catch(function(e){clearSession();say(authError(e),true)})
}
$('fin').onsubmit=function(ev){ev.preventDefault();interacted=true;var f=ev.target;busy(f,true);say('Signing in…')
 doLogin($('inEmail').value,$('inPass').value).then(function(){busy(f,false)})}
function post(url,data){
 return send(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)},30000).then(function(r){return readJson(r).then(function(j){return {ok:r.ok,status:r.status,j:j}})})
}
$('fup').onsubmit=function(ev){ev.preventDefault();interacted=true;var f=ev.target;busy(f,true);say('Creating account…')
 var email=normalizeEmail($('upEmail').value),password=$('upPass').value
 post('/api/signup',{firstName:$('upFirst').value.trim(),lastName:$('upLast').value.trim(),email:email,password:password,birthday:$('upBirth').value,food:$('upFood').value.trim()})
 .then(function(res){
  if(!res.ok){say(res.j.error||'Could not create the account. Please try again.',true);return}
  say('Account created. Signing you in…');return doLogin(email,password)
 },function(e){say(e.kind==='timeout'?'The server took too long to answer. Your account may have been created: try signing in first.':netMessage(e),true)})
 .then(function(){busy(f,false)})}
// Forgot password: prove identity with birthday OR favorite food (no email link), then set a new password.
function today(){return new Date().toISOString().slice(0,10)}
$('upBirth').max=today()
function showReset(on){$('freset').hidden=!on;$('fin').hidden=on;$('fup').hidden=true;$('forgot').hidden=on;document.querySelector('#auth .tabs').hidden=on;say('')
 if(on){$('rsBirth').max=today();if(!$('rsEmail').value)$('rsEmail').value=$('inEmail').value.trim();($('rsEmail').value?$('rsMethod'):$('rsEmail')).focus()}}
function pickMethod(){var food=$('rsMethod').value==='food';$('rsFoodL').hidden=!food;$('rsBirthL').hidden=food;$('rsFood').required=food;$('rsBirth').required=!food}
$('rsMethod').onchange=pickMethod;pickMethod()
$('forgot').onclick=function(){interacted=true;showReset(true);say('Choose your birthday or favorite food, then enter a new password.')}
$('rsBack').onclick=function(){showReset(false);tab(false)}
$('freset').onsubmit=function(ev){
 ev.preventDefault();interacted=true;var f=ev.target,email=normalizeEmail($('rsEmail').value),password=$('resetPass').value,method=$('rsMethod').value
 var answer=method==='food'?$('rsFood').value.trim():$('rsBirth').value
 busy(f,true);say('Checking your answer…')
 post('/api/recover',{email:email,method:method,answer:answer,password:password}).then(function(res){
  if(!res.ok){say(res.j.error||'Could not reset the password. Please try again.',true);return}
  $('resetPass').value='';$('rsFood').value='';$('rsBirth').value='';showReset(false);tab(false);$('inEmail').value=email
  say('Password updated. Signing you in…');return doLogin(email,password)
 },function(e){say(netMessage(e),true)}).then(function(){busy(f,false)})
}
$('signout').onclick=function(){
 var at=session&&session.access_token
 if(at)send(ID+'/logout',{method:'POST',headers:{Authorization:'Bearer '+at}},8000).catch(function(){})
 clearSession();show(null);tab(false)
}

// ---------- startup ----------
// Email links (old password-reset emails) are no longer used.
var saved=null;try{saved=sessionStorage.getItem('authLinkHash');sessionStorage.removeItem('authLinkHash')}catch(e){}
var hash=location.hash||saved||''
if(/(^#|&)(recovery_token|confirmation_token|invite_token|email_change_token|access_token|error|error_description)=/.test(hash)){
 history.replaceState(null,'',location.pathname+location.search)
 say('Email links are no longer used. Sign in with your email and password, or click Forgot password and answer with your birthday or favorite food.',true)
}
session=loadSession()
if(session){
 var ready=session.access_token&&session.expires_at-Date.now()>120000?Promise.resolve():refresh()
 ready.then(fetchUser).then(function(u){if(!interacted)show(u)}).catch(function(e){
  // Keep the saved session through a brief connection drop; only a rejected session signs the user out.
  if(e&&(e.status===400||e.status===401)){clearSession();if(!interacted)show(null)}
  else if(!interacted)say(netMessage(e),true)
 })
}else show(null)
})()
