
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getAuth,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,updateProfile}from"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const cfg={apiKey:"AIzaSyAzzLvWmzxrfYva_PMvTNis53O_arpkNFs",authDomain:"publicdropin.firebaseapp.com",projectId:"publicdropin",storageBucket:"publicdropin.firebasestorage.app",messagingSenderId:"1039430223124",appId:"1:1039430223124:web:db45545c7fba10e09b6e01"};
const app=initializeApp(cfg);
const auth=getAuth(app);
window._auth=auth;
window._gp=new GoogleAuthProvider();


function wlKey(uid){return uid?`pd_wl_${uid}`:'pd_wl_guest';}
function portKey(uid){return uid?`pd_portfolio_${uid}`:'pd_portfolio_guest';}
window._wlKey=wlKey;window._portKey=portKey;

onAuthStateChanged(auth,u=>{
  window._fbUser=u;
  const av=document.getElementById('NAV_AVATAR');
  const loginBtns=document.querySelectorAll('.nav-login-btn');
  if(u){
    
    const name=u.displayName||u.email||'User';
    const initial=name.charAt(0).toUpperCase();
    if(av){av.style.display='none';}
    loginBtns.forEach(b=>b.style.display='none');
    const mob=document.getElementById('MOB_AUTH_BTN');
    if(mob){mob.style.display='none';}
    const mobLogout=document.getElementById('MOB_LOGOUT_BTN');
    if(mobLogout){mobLogout.style.display='flex';}
    
    const chip=document.getElementById('NAV_USER_CHIP');
    if(chip){chip.style.display='flex';chip.querySelector('.nav-user-name').textContent=(u.displayName||u.email||'User').split(' ')[0];}
    const chipAvatar=document.getElementById('NAV_AVATAR_INNER');
    if(chipAvatar){chipAvatar.textContent=initial;}
    const dropName=document.getElementById('DROPDOWN_NAME');
    if(dropName){dropName.textContent=u.displayName||u.email||'User';}
    
    if(window._reloadUserData)window._reloadUserData(u.uid);
  }else{
    if(av)av.style.display='none';
    loginBtns.forEach(b=>b.style.display='');
    const chip=document.getElementById('NAV_USER_CHIP');
    if(chip)chip.style.display='none';
    const dropdown=document.getElementById('USER_DROPDOWN');
    if(dropdown)dropdown.style.display='none';
    const mob=document.getElementById('MOB_AUTH_BTN');
    if(mob){mob.style.display='flex';}
    const mobLogout=document.getElementById('MOB_LOGOUT_BTN');
    if(mobLogout){mobLogout.style.display='none';}
    if(window._reloadUserData)window._reloadUserData(null);
  }
});


const FE={'auth/user-not-found':'No account found with this email.','auth/wrong-password':'Incorrect password.','auth/email-already-in-use':'Email already registered.','auth/weak-password':'Password must be at least 6 chars.','auth/invalid-email':'Invalid email address.','auth/too-many-requests':'Too many attempts — wait a moment.','auth/popup-closed-by-user':'Google sign-in cancelled.','auth/invalid-credential':'Incorrect email or password.','auth/network-request-failed':'Network error.'};
const fe=c=>FE[c]||'Something went wrong. Try again.';
function showErr(id,m){const e=document.getElementById(id);if(!e)return;e.textContent='⚠ '+m;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',6000);}
function showOk(id,m){const e=document.getElementById(id);if(!e)return;e.textContent=m;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',5000);}
function busy(id,on){const b=document.getElementById(id);if(!b)return;b.disabled=on;if(on){b._h=b.innerHTML;b.innerHTML='<span class="fb-spin"></span> Please wait…';}else if(b._h)b.innerHTML=b._h;}

window.doLogin=async function(e){
  if(e)addRipple&&addRipple(e);
  const em=document.getElementById('AM_EMAIL').value.trim();
  const pw=document.getElementById('AM_PASS').value;
  if(!em||!pw){showErr('AM_ERR','Please enter email and password.');return;}
  busy('AM_LOGIN_BTN',true);
  try{await signInWithEmailAndPassword(auth,em,pw);closeAuthModal();toast('✅ Welcome back!');}
  catch(err){showErr('AM_ERR',fe(err.code));busy('AM_LOGIN_BTN',false);}
};
window.doRegister=async function(e){
  if(e)addRipple&&addRipple(e);
  const nm=document.getElementById('AM_REG_NAME').value.trim();
  const em=document.getElementById('AM_REG_EMAIL').value.trim();
  const pw=document.getElementById('AM_REG_PASS').value;
  const pw2=document.getElementById('AM_REG_PASS2').value;
  if(!em||!pw){showErr('AM_REG_ERR','Fill in all fields.');return;}
  if(pw!==pw2){showErr('AM_REG_ERR','Passwords do not match.');return;}
  if(pw.length<6){showErr('AM_REG_ERR','Password too short.');return;}
  busy('AM_REG_BTN',true);
  try{
    const cred=await createUserWithEmailAndPassword(auth,em,pw);
    if(nm)await updateProfile(cred.user,{displayName:nm});
    closeAuthModal();
    toast('🎉 Account created! Welcome, '+(nm||em)+'!');
  }
  catch(err){showErr('AM_REG_ERR',fe(err.code));busy('AM_REG_BTN',false);}
};
window.doGoogle=async function(){
  ['AM_GOOGLE_BTN','AM_REG_GOOGLE_BTN'].forEach(id=>busy(id,true));
  try{await signInWithPopup(auth,window._gp);closeAuthModal();toast('✅ Signed in with Google!');}
  catch(err){showErr('AM_ERR',fe(err.code));['AM_GOOGLE_BTN','AM_REG_GOOGLE_BTN'].forEach(id=>busy(id,false));}
};
window.doReset=async function(e){
  if(e)addRipple&&addRipple(e);
  const em=document.getElementById('AM_FGT_EMAIL').value.trim();
  if(!em){showErr('AM_FGT_ERR','Enter your email.');return;}
  busy('AM_RESET_BTN',true);
  try{await sendPasswordResetEmail(auth,em);showOk('AM_FGT_OK','✅ Reset email sent! Check your inbox.');}
  catch(err){showErr('AM_FGT_ERR',fe(err.code));}
  finally{busy('AM_RESET_BTN',false);}
};
window.doSignOut=async function(){
  await signOut(auth);toast('👋 Signed out. See you soon!');
};
window.checkStrength=function(pw){
  const bar=document.getElementById('STR_BAR');const fill=document.getElementById('STR_FILL');const lbl=document.getElementById('STR_LBL');
  if(!bar)return;bar.style.display='block';lbl.style.display='block';
  let sc=0;if(pw.length>=6)sc++;if(pw.length>=10)sc++;if(/[A-Z]/.test(pw))sc++;if(/[0-9]/.test(pw))sc++;if(/[^A-Za-z0-9]/.test(pw))sc++;
  const pct=Math.min(sc*22,100);
  const col=sc<=1?'#E8334A':sc<=2?'#F59E0B':sc<=3?'#0EA66A':'#1A56DB';
  const txt=sc<=1?'Weak':sc<=2?'Fair':sc<=3?'Good':'Strong';
  fill.style.width=pct+'%';fill.style.background=col;lbl.textContent=txt;lbl.style.color=col;
};
window.togglePw=function(id,btn){
  const inp=document.getElementById(id);if(!inp)return;
  inp.type=inp.type==='password'?'text':'password';btn.innerHTML=inp.type==="password"?"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9.88 9.88a3 3 0 1 0 4.24 4.24\"/><path d=\"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68\"/><path d=\"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61\"/><line x1=\"2\" y1=\"2\" x2=\"22\" y2=\"22\"/></svg>";
};
