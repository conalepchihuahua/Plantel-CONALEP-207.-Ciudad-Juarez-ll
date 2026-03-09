firebase.initializeApp({
  apiKey:"AIzaSyCZpIknDfy3KsV-XtPCkU9s0jDjd9o7nD8",
  authDomain:"conalep-chihuahua.firebaseapp.com",
  databaseURL:"https://conalep-chihuahua-default-rtdb.firebaseio.com",
  projectId:"conalep-chihuahua",
  storageBucket:"conalep-chihuahua.firebasestorage.app",
  messagingSenderId:"848130047778",
  appId:"1:848130047778:web:c7cef212c226d08806ef7b"
});

const auth=firebase.auth();
const db=firebase.database();
let messaging=null;
try{messaging=firebase.messaging()}catch{}

const DOMAIN='@chih.conalep.edu.mx';
const ROTACION_INICIO=new Date(2026,1,23);
const VAPID_KEY='BM7AVmABZal3jhwQvGHuNC2ZEFv1fafGv7ip5Lm_ruqM7WiAYN1vLqyFiHABft5NEmmPC86t3UowlvzP_j3Oc48';

const ERRORES={
  'auth/invalid-email':'El correo no tiene un formato válido.',
  'auth/user-not-found':'No existe ninguna cuenta asociada a este correo.',
  'auth/wrong-password':'La contraseña es incorrecta.',
  'auth/invalid-credential':'El correo o la contraseña son incorrectos.',
  'auth/too-many-requests':'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  'auth/email-already-in-use':'Ya existe una cuenta con este correo.',
  'auth/weak-password':'La contraseña debe tener al menos 6 caracteres.',
  'auth/network-request-failed':'Sin conexión. Verifica tu red e intenta de nuevo.'
};
const ERR_CAMPO={
  correo:['auth/invalid-email','auth/user-not-found'],
  pass:['auth/wrong-password','auth/invalid-credential']
};

let _cancelados={},_aseoLoaded=false,_equipoSheet=[],_yoIdx=null;
let _toastTimer=null,_undoFn=null,_ajusteKey=null,_ajusteCancelado=false;
let _esAdmin=false,_tabActual='aseo',_pagoListener=null;
let _fbKeyMap=new Map(),_pagoData=new Map(),_alumnos=[];
let _ausenciasData=new Map(),_conteosEquipos=new Map();
let _searchTerm='',_searchFilter='todos';
let _ordenPersonalizado=null,_ordenDebounce=null;

function fkey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function cancelado(d){return!!_cancelados[fkey(d)]}
function mensErr(c){return ERRORES[c]||'Ocurrió un error inesperado. Inténtalo de nuevo.'}
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active')}
function showMsg(el,txt,tipo,center){el.textContent=txt;el.className='field-msg'+(tipo?' '+tipo:'')+(center?' center':'')+' show'}
function hideMsg(el){el.classList.remove('show')}
function setBusy(btn,v){btn.disabled=v;btn.classList.toggle('loading',v)}

function togglePass(btn){
  const i=btn.parentElement.querySelector('input');
  i.type=i.type==='password'?'text':'password';
  btn.querySelector('i').className=i.type==='password'?'ph ph-eye':'ph ph-eye-slash';
}
function validarCorreo(inp){
  const ok=inp.value===''||inp.value.endsWith(DOMAIN);
  document.getElementById('reg-correo-error').classList.toggle('show',!ok);
  inp.classList.toggle('error',!ok);
}

function resetLogin(){
  ['correo','pass'].forEach(id=>{const e=document.getElementById(id);e.value='';e.classList.remove('error');if(id==='pass')e.type='password'});
  document.querySelector('#page-login .field-eye i').className='ph ph-eye';
  ['login-correo-error','login-pass-error','login-error'].forEach(id=>hideMsg(document.getElementById(id)));
}
function resetRegistro(){
  const c=document.getElementById('reg-correo');c.value='';c.classList.remove('error');
  hideMsg(document.getElementById('reg-correo-error'));
  const p=document.getElementById('reg-pass');p.value='';p.type='password';
  document.querySelector('#page-registro .field-eye i').className='ph ph-eye';
  hideMsg(document.getElementById('reg-error'));
}
function irARegistro(){resetRegistro();showPage('page-registro')}
function irALogin(){resetLogin();showPage('page-login')}

function mostrarErrorLogin(code){
  const cEl=document.getElementById('login-correo-error');
  const pEl=document.getElementById('login-pass-error');
  const fEl=document.getElementById('login-error');
  hideMsg(cEl);document.getElementById('correo').classList.remove('error');
  hideMsg(pEl);document.getElementById('pass').classList.remove('error');
  hideMsg(fEl);
  if(ERR_CAMPO.correo.includes(code)){showMsg(cEl,mensErr(code));document.getElementById('correo').classList.add('error')}
  else if(ERR_CAMPO.pass.includes(code)){showMsg(pEl,mensErr(code));document.getElementById('pass').classList.add('error')}
  else{showMsg(fEl,mensErr(code),'','center')}
}

function entrar(){
  const correo=document.getElementById('correo').value.trim();
  const pass=document.getElementById('pass').value;
  ['login-correo-error','login-pass-error','login-error'].forEach(id=>hideMsg(document.getElementById(id)));
  if(!correo){document.getElementById('correo').focus();return}
  if(!pass){document.getElementById('pass').focus();return}
  const btn=document.querySelector('#page-login .btn-primary');
  setBusy(btn,true);
  auth.signInWithEmailAndPassword(correo,pass)
    .then(()=>showPage('page-app'))
    .catch(e=>{mostrarErrorLogin(e.code);setBusy(btn,false)});
}

async function registrar(){
  const correo=document.getElementById('reg-correo').value.trim();
  const pass=document.getElementById('reg-pass').value;
  const errEl=document.getElementById('reg-error');
  hideMsg(errEl);
  if(!correo.endsWith(DOMAIN)){document.getElementById('reg-correo').classList.add('error');document.getElementById('reg-correo-error').classList.add('show');document.getElementById('reg-correo').focus();return}
  if(!pass){document.getElementById('reg-pass').focus();return}
  const btn=document.querySelector('#page-registro .btn-primary');
  setBusy(btn,true);
  try{await auth.createUserWithEmailAndPassword(correo,pass);showPage('page-app')}
  catch(e){showMsg(errEl,mensErr(e.code),'','center');setBusy(btn,false)}
}

function irAReset(){
  const correo=document.getElementById('correo').value.trim();
  document.getElementById('reset-correo').value=correo;
  hideMsg(document.getElementById('reset-msg'));
  showPage('page-reset');
}

async function enviarReset(){
  const correo=document.getElementById('reset-correo').value.trim();
  const msgEl=document.getElementById('reset-msg');
  hideMsg(msgEl);
  if(!correo){document.getElementById('reset-correo').focus();return}
  const btn=document.querySelector('#page-reset .btn-primary');
  setBusy(btn,true);
  try{
    await auth.sendPasswordResetEmail(correo);
    showMsg(msgEl,'Enlace enviado. Revisa tu bandeja de entrada.','info',true);
  }catch(e){
    showMsg(msgEl,mensErr(e.code),'','center');
  }
  setBusy(btn,false);
}

async function esAdmin(uid){
  if(!uid)return false;
  try{const s=await db.ref('admins/'+uid).once('value');return s.exists()}
  catch{return false}
}

async function registrarToken(uid,correo){
  if(!messaging)return;
  try{
    const p=await Notification.requestPermission();
    if(p!=='granted')return;
    const sw=await navigator.serviceWorker.ready;
    const tok=await messaging.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:sw});
    if(tok)await db.ref('fcmTokens/'+uid).set({token:tok,correo,actualizado:Date.now()});
  }catch{}
}

function cambiarTab(tab){
  if(_tabActual===tab)return;
  _tabActual=tab;
  document.querySelectorAll('.tab-screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.remove('active');
    b.querySelector('i').className=b.querySelector('i').className.replace('ph-fill ph-','ph ph-');
  });
  document.getElementById('screen-'+tab).classList.add('active');
  const btn=document.getElementById('tab-'+tab);
  btn.classList.add('active');
  btn.querySelector('i').className=btn.querySelector('i').className.replace('ph ph-','ph-fill ph-');
  if(tab==='avisos')renderNotifCard();
}

function renderMenuAdmin(){
  const c=document.getElementById('menu-admin-rows');c.innerHTML='';
  const adminOpts=document.getElementById('filter-admin-opts');
  if(adminOpts)adminOpts.style.display=_esAdmin?'':'none';
  if(!_esAdmin)return;
  const b=document.createElement('button');
  b.className='menu-item';
  b.innerHTML='<div class="menu-item-ico"><i class="ph ph-arrows-down-up"></i></div><span class="menu-item-label">Orden de rotación</span>';
  b.addEventListener('click',()=>{cerrarSheet();setTimeout(abrirOrdenSheet,300)});
  c.appendChild(b);
  const b2=document.createElement('button');
  b2.className='menu-item';
  b2.innerHTML='<div class="menu-item-ico"><i class="ph ph-calendar-x"></i></div><span class="menu-item-label">Jornadas canceladas</span>';
  b2.addEventListener('click',()=>{cerrarSheet();setTimeout(abrirHistorial,300)});
  c.appendChild(b2);
}

function toast(msg,icoCls,undoFn){
  clearTimeout(_toastTimer);
  _undoFn=undoFn||null;
  const t=document.getElementById('toast');
  document.getElementById('toast-ico').className='ph '+icoCls+' toast-ico';
  document.getElementById('toast-msg').textContent=msg;
  document.getElementById('toast-undo').style.display=_undoFn?'':'none';
  t.classList.add('show');
  _toastTimer=setTimeout(()=>t.classList.remove('show'),5000);
}

async function deshacerAccion(){
  if(!_undoFn)return;
  document.getElementById('toast').classList.remove('show');
  clearTimeout(_toastTimer);
  try{await _undoFn()}catch{}
  _undoFn=null;
}

function esMMFD(a){return(a['MMFD']||'').toLowerCase().includes('incorporado')}

function proximoHabil(desde){
  const d=new Date(desde);d.setHours(0,0,0,0);
  while(d.getDay()===0||d.getDay()===6||cancelado(d))d.setDate(d.getDate()+1);
  return d;
}
function siguientes(desde,n){
  const dias=[];const d=new Date(desde);d.setHours(0,0,0,0);
  while(dias.length<n){if(d.getDay()!==0&&d.getDay()!==6&&!cancelado(d))dias.push(new Date(d));d.setDate(d.getDate()+1)}
  return dias;
}
function restantesSemana(desde){
  const dias=[];const d=new Date(desde);d.setHours(0,0,0,0);
  while(d.getDay()>=1&&d.getDay()<=5){if(!cancelado(d))dias.push(new Date(d));d.setDate(d.getDate()+1)}
  return dias;
}

function buildFixedTeams(alumnos){
  const n=alumnos.length;
  const numTeams=Math.max(1,Math.round(n/5));
  const base=Math.floor(n/numTeams);
  const extra=n%numTeams;
  const teams=[];
  let idx=0;
  for(let t=0;t<numTeams;t++){
    const size=base+(t<extra?1:0);
    const miembros=alumnos.slice(idx,idx+size);
    const tieneMMFD=miembros.some(a=>esMMFD(a));
    teams.push({miembros,tieneMMFD});
    idx+=size;
  }
  return teams;
}

function simular(alumnos,fechas){
  if(!fechas.length)return new Map();
  const teams=buildFixedTeams(alumnos);
  if(!teams.length)return new Map();
  const sorted=[...fechas].sort((a,b)=>a-b);
  const max=sorted[sorted.length-1];
  const set=new Set(fechas.map(f=>fkey(f)));
  const result=new Map();
  let queue=[...teams];
  const d=new Date(ROTACION_INICIO);d.setHours(0,0,0,0);
  const h=new Date(max);h.setHours(0,0,0,0);
  while(d<=h){
    const dow=d.getDay();
    if(dow!==0&&dow!==6&&!cancelado(d)){
      const restr=dow===1||dow===2;
      let idx=-1;
      for(let i=0;i<queue.length;i++){if(!restr||!queue[i].tieneMMFD){idx=i;break}}
      if(idx>=0){
        const team=queue.splice(idx,1)[0];
        if(set.has(fkey(d)))result.set(fkey(d),team.miembros);
        queue.push(team);
      }
    }
    d.setDate(d.getDate()+1);
  }
  return result;
}

function obtenerConteosLimpieza(alumnos,hastaFecha){
  const teams=buildFixedTeams(alumnos);
  if(!teams.length)return new Map();
  const conteos=new Map();
  teams.forEach(t=>{const key=(t.miembros[0]&&t.miembros[0]['Correo Institucional']||'').toLowerCase();conteos.set(key,0)});
  let queue=[...teams];
  const d=new Date(ROTACION_INICIO);d.setHours(0,0,0,0);
  const h=new Date(hastaFecha);h.setHours(0,0,0,0);
  while(d<h){
    const dow=d.getDay();
    if(dow!==0&&dow!==6&&!cancelado(d)){
      const restr=dow===1||dow===2;
      let idx=-1;
      for(let i=0;i<queue.length;i++){if(!restr||!queue[i].tieneMMFD){idx=i;break}}
      if(idx>=0){
        const team=queue.splice(idx,1)[0];
        const key=(team.miembros[0]&&team.miembros[0]['Correo Institucional']||'').toLowerCase();
        conteos.set(key,(conteos.get(key)||0)+1);
        queue.push(team);
      }
    }
    d.setDate(d.getDate()+1);
  }
  return conteos;
}

function proximoTurno(alumnos,correo,desde){
  const futuros=siguientes(desde,90);
  if(!futuros.length)return null;
  const eqs=simular(alumnos,futuros);
  for(const f of futuros){
    const eq=eqs.get(fkey(f))||[];
    if(eq.some(a=>(a['Correo Institucional']||'').toLowerCase()===correo))return{fecha:f,equipo:eq};
  }
  return null;
}

function nombre(a){
  const p1=(a['Primer Nombre']||'').trim(),p2=(a['Segundo Nombre']||'').trim();
  const ap=(a['Apellido Paterno']||'').trim(),am=(a['Apellido Materno']||'').trim();
  const n=[p1,p2].filter(Boolean).join(' ');
  const ap2=[ap,am].filter(Boolean).join(' ');
  if(n&&ap2)return n+' '+ap2;
  return n||ap2||'Alumno '+(a['No']||'');
}

function fstr(d,opts){return d.toLocaleDateString('es-MX',opts||{weekday:'long',day:'numeric',month:'long'})}

function toggleNombre(row){
  const el=row.querySelector('.st-name');
  const open=el.classList.toggle('open');
  row.classList.toggle('expanded',open);
}

async function abrirAlumnoSheet(a,fecha){
  const pagoDesc=document.getElementById('alumno-pago-desc');
  const pagoIco=document.getElementById('alumno-pago-ico');
  const pagoBtn=document.getElementById('alumno-pago-btn');
  const pagoBtnIco=document.getElementById('alumno-pago-btn-ico');
  const pagoBtnLbl=document.getElementById('alumno-pago-btn-lbl');
  const ausDesc=document.getElementById('alumno-aus-desc');
  const ausIco=document.getElementById('alumno-aus-ico');
  const ausBtn=document.getElementById('alumno-aus-btn');
  const ausBtnIco=document.getElementById('alumno-aus-btn-ico');
  const ausBtnLbl=document.getElementById('alumno-aus-btn-lbl');
  const deudasList=document.getElementById('alumno-deudas-list');

  document.getElementById('alumno-nombre').textContent=nombre(a);
  document.getElementById('alumno-no').textContent=`No. ${a['No']||''}${esMMFD(a)?' · Dual':''}`;
  pagoDesc.textContent='Verificando…';pagoDesc.style.color='var(--ink-3)';
  pagoBtn.style.display='none';
  ausDesc.textContent='Verificando…';ausDesc.style.color='var(--ink-3)';
  ausBtn.style.display='none';
  deudasList.innerHTML='';

  abrirOverlay('sheet-alumno');

  const fbKey=_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase());
  if(!fbKey){pagoDesc.textContent='Información no disponible';ausDesc.textContent='Información no disponible';return;}

  try{
    const pagado=(await db.ref(`estudiantes/${fbKey}/pagado`).once('value')).val()===true;
    _actualizarPagoUI(pagado,pagoDesc,pagoIco,pagoBtn,pagoBtnIco,pagoBtnLbl);
    pagoBtn.onclick=()=>_togglePago(fbKey,!pagado,pagoDesc,pagoIco,pagoBtn,pagoBtnIco,pagoBtnLbl);
    pagoBtn.style.display='flex';
  }catch{pagoDesc.textContent='Información no disponible';}

  try{
    const ausSnap=(await db.ref(`ausencias/${fbKey}`).once('value')).val()||{};
    _ausenciasData.set(fbKey,ausSnap);
    _renderAusenciasUI(fbKey,ausSnap,fecha,ausDesc,ausIco,ausBtn,ausBtnIco,ausBtnLbl,deudasList);
  }catch{
    _renderAusenciasUI(fbKey,{},fecha,ausDesc,ausIco,ausBtn,ausBtnIco,ausBtnLbl,deudasList);
  }
}

function _actualizarPagoUI(pagado,desc,ico,btn,btnIco,btnLbl){
  desc.textContent=pagado?'Aportación registrada':'Aportación pendiente';
  desc.style.color=pagado?'var(--green)':'var(--maroon)';
  ico.style.background=pagado?'var(--green-lt)':'var(--maroon-lt)';
  ico.querySelector('i').style.color=pagado?'var(--green)':'var(--maroon)';
  btnIco.className=pagado?'ph ph-arrow-counter-clockwise':'ph ph-check';
  btnLbl.textContent=pagado?'Revertir':'Validar';
}

async function _togglePago(fbKey,nuevoPagado,desc,ico,btn,btnIco,btnLbl){
  btn.classList.add('loading');
  try{
    await db.ref(`estudiantes/${fbKey}/pagado`).set(nuevoPagado);
    _actualizarPagoUI(nuevoPagado,desc,ico,btn,btnIco,btnLbl);
    btn.onclick=()=>_togglePago(fbKey,!nuevoPagado,desc,ico,btn,btnIco,btnLbl);
    if(nuevoPagado){
      toast('Aportación validada','ph-check-circle ok',async()=>{
        await db.ref(`estudiantes/${fbKey}/pagado`).set(false);
        _actualizarPagoUI(false,desc,ico,btn,btnIco,btnLbl);
        btn.onclick=()=>_togglePago(fbKey,true,desc,ico,btn,btnIco,btnLbl);
      });
    }else{
      toast('Validación revertida','ph-arrow-counter-clockwise ok');
    }
  }catch{
    toast('No fue posible actualizar. Inténtalo de nuevo.','ph-warning err');
  }
  btn.classList.remove('loading');
}

function mkEstadoCard(cont,pagado){
  const ok=pagado===true;
  const card=document.createElement('div');
  card.className='estado-card';
  card.innerHTML=`
    <div class="estado-row">
      <div class="estado-ico ok"><i class="ph ph-star"></i></div>
      <div class="estado-info">
        <p class="estado-titulo">Conducta</p>
        <p class="estado-desc">Sin registros de faltas o incidencias</p>
      </div>
      <span class="estado-badge ok">Excelente</span>
    </div>
    <div class="estado-row">
      <div class="estado-ico ${ok?'ok':'warn'}" id="estado-pago-ico"><i class="ph ph-money"></i></div>
      <div class="estado-info">
        <p class="estado-titulo">Aportación grupal</p>
        <p class="estado-desc" id="estado-pago-desc">${ok?'Aportación registrada':'Pendiente con el responsable de limpieza'}</p>
      </div>
      <span class="estado-badge ${ok?'ok':'warn'}" id="estado-pago-badge">${ok?'Al corriente':'Pendiente'}</span>
    </div>`;
  cont.appendChild(card);
}

function _pendientes(aus){return Object.entries(aus).filter(([,v])=>v==='pendiente');}

function _renderAusenciasUI(fbKey,aus,fecha,desc,ico,btn,btnIco,btnLbl,list){
  const pend=_pendientes(aus);
  const dateKey=fecha?fkey(fecha):null;
  const yaRegistrada=dateKey?aus[dateKey]==='pendiente':false;
  const saldada=dateKey?aus[dateKey]==='saldada':false;

  if(pend.length===0){
    desc.textContent='Sin ausencias registradas';
    desc.style.color='var(--ink-3)';
    ico.style.background='var(--bg)';
    ico.querySelector('i').style.color='var(--ink-3)';
  }else{
    desc.textContent=pend.length===1?'1 ausencia pendiente':`${pend.length} ausencias pendientes`;
    desc.style.color='var(--maroon)';
    ico.style.background='var(--maroon-lt)';
    ico.querySelector('i').style.color='var(--maroon)';
  }

  if(dateKey&&!saldada){
    btn.style.display='flex';
    if(yaRegistrada){
      btnIco.className='ph ph-check';btnLbl.textContent='Ya registrada';
      btn.disabled=true;
    }else{
      btnIco.className='ph ph-plus';btnLbl.textContent='Registrar';
      btn.disabled=false;
      btn.onclick=()=>_registrarAusencia(fbKey,dateKey,aus,desc,ico,btn,btnIco,btnLbl,list);
    }
  }else{
    btn.style.display='none';
  }

  list.innerHTML='';
  const entradas=Object.entries(aus).sort(([a],[b])=>b.localeCompare(a));
  if(entradas.length){
    const titulo=document.createElement('p');
    titulo.className='sheet-section-title';titulo.textContent='Historial de asistencia';
    list.appendChild(titulo);
    entradas.forEach(([dk,estado])=>{
      const [y,m,d]=dk.split('-').map(Number);
      const f=new Date(y,m-1,d);
      const row=document.createElement('div');row.className='deuda-row';
      row.innerHTML=`<span class="deuda-fecha">${fstr(f,{weekday:'long',day:'numeric',month:'long'})}</span><span class="deuda-badge${estado==='saldada'?' saldada':''}">${estado==='saldada'?'Saldada':'Pendiente'}</span>`;
      if(estado==='pendiente'){
        const sBtn=document.createElement('button');
        sBtn.className='hist-btn';sBtn.style.marginLeft='8px';
        sBtn.innerHTML='<i class="ph ph-check"></i><span>Saldar</span>';
        sBtn.addEventListener('click',()=>_saldarDeuda(fbKey,dk,aus,sBtn,desc,ico,btnLbl,list));
        row.appendChild(sBtn);
      }
      list.appendChild(row);
    });
  }
}

async function _registrarAusencia(fbKey,dateKey,aus,desc,ico,btn,btnIco,btnLbl,list){
  btn.classList.add('loading');
  try{
    await db.ref(`ausencias/${fbKey}/${dateKey}`).set('pendiente');
    aus[dateKey]='pendiente';
    _ausenciasData.set(fbKey,aus);
    _renderAusenciasUI(fbKey,aus,null,desc,ico,btn,btnIco,btnLbl,list);
    btn.style.display='none';
    toast('Ausencia registrada correctamente','ph-calendar-x ok');
  }catch{
    toast('No fue posible registrar la ausencia. Inténtalo de nuevo.','ph-warning err');
  }
  btn.classList.remove('loading');
}

async function _saldarDeuda(fbKey,dateKey,aus,sBtn,desc,ico,btnLbl,list){
  sBtn.classList.add('loading');
  try{
    await db.ref(`ausencias/${fbKey}/${dateKey}`).set('saldada');
    aus[dateKey]='saldada';
    _ausenciasData.set(fbKey,aus);
    const pend=_pendientes(aus);
    if(pend.length===0){
      desc.textContent='Sin ausencias registradas';desc.style.color='var(--ink-3)';
      ico.style.background='var(--bg)';ico.querySelector('i').style.color='var(--ink-3)';
    }else{
      desc.textContent=pend.length===1?'1 ausencia pendiente':`${pend.length} ausencias pendientes`;
    }
    const badge=sBtn.closest('.deuda-row')?.querySelector('.deuda-badge');
    if(badge){badge.textContent='Saldada';badge.classList.add('saldada');}
    sBtn.remove();
    toast('Ausencia liquidada','ph-check-circle ok');
  }catch{
    toast('No fue posible actualizar. Inténtalo de nuevo.','ph-warning err');
  }
  sBtn.classList.remove('loading');
}

function _actualizarEstadoPagoUI(pagado){
  const ok=pagado===true;
  const ico=document.getElementById('estado-pago-ico');
  const desc=document.getElementById('estado-pago-desc');
  const badge=document.getElementById('estado-pago-badge');
  if(!ico||!desc||!badge)return;
  ico.className=`estado-ico ${ok?'ok':'warn'}`;
  desc.textContent=ok?'Aportación registrada':'Pendiente con el responsable de limpieza';
  badge.className=`estado-badge ${ok?'ok':'warn'}`;
  badge.textContent=ok?'Al corriente':'Pendiente';
}

function mkTurnStrip(cont,fecha,equipo,yoIdx){
  _equipoSheet=equipo||[];_yoIdx=yoIdx??null;
  const targetE=(equipo[0]&&equipo[0]['Correo Institucional']||'').toLowerCase();
  const limpiezas=_conteosEquipos.get(targetE)||0;
  const el=document.createElement('div');
  el.className='my-turn-strip';
  el.innerHTML=`<div class="my-turn-info"><p class="my-turn-label">Tu próxima asignación</p><p class="my-turn-date">${fstr(fecha)}</p><p class="my-turn-sub"><i class="ph ph-users"></i>${equipo.length} integrantes &bull; <i class="ph ph-clock-counter-clockwise"></i>Limpiaron ${limpiezas} ${limpiezas===1?'vez':'veces'}</p></div><i class="ph ph-caret-right my-turn-chevron"></i>`;
  el.addEventListener('click',abrirEquipoSheet);
  cont.appendChild(el);
}

function mkCard(cont,equipo,fecha,titulo,esCancelado,admin){
  const wrap=document.createElement('div');wrap.className='section-card';
  const hdr=document.createElement('div');hdr.className='card-header';
  const info=document.createElement('div');info.className='card-header-info';
  const targetE=(equipo[0]&&equipo[0]['Correo Institucional']||'').toLowerCase();
  const limpiezas=_conteosEquipos.get(targetE)||0;
  info.innerHTML=`<p class="card-date">${fstr(fecha)}</p><div class="card-title-row" style="flex-wrap:wrap;gap:6px"><p class="card-title" style="flex:1 1 100%">${titulo}</p><span class="card-count"><i class="ph ph-users"></i>${equipo.length} integrantes</span><span class="card-count" style="background:var(--bg);color:var(--ink-2);border:1px solid var(--line);"><i class="ph ph-clock-counter-clockwise"></i>Han limpiado ${limpiezas} ${limpiezas===1?'vez':'veces'}</span></div>`;
  hdr.appendChild(info);
  if(admin){
    const ab=document.createElement('button');ab.className='card-admin-btn';
    ab.dataset.key=fkey(fecha);ab.dataset.cancelado=esCancelado?'1':'0';
    ab.innerHTML=`<i class="ph ${esCancelado?'ph-arrow-counter-clockwise':'ph-x-circle'}"></i>`;
    ab.addEventListener('click',function(){abrirAjuste(this)});
    hdr.appendChild(ab);
  }
  wrap.appendChild(hdr);
  if(esCancelado){
    const bar=document.createElement('div');bar.className='cancelled-bar';
    bar.innerHTML='<i class="ph ph-warning-circle"></i>Jornada suspendida — la rotación fue ajustada de forma automática';
    wrap.appendChild(bar);
  }
  equipo.forEach(a=>{
    const row=document.createElement('div');row.className='student-row';
    const correo=(a['Correo Institucional']||'').toLowerCase();
    const fbKey=_fbKeyMap.get(correo)||null;
    const pagado=fbKey?(_pagoData.get(fbKey)===true):false;
    const esYo=correo===(auth.currentUser?.email?.toLowerCase()??'');
    const aus=fbKey?(_ausenciasData.get(fbKey)||{}):{}; 
    const tienePendiente=Object.values(aus).some(v=>v==='pendiente');
    row.dataset.pagado=pagado?'true':'false';
    row.innerHTML=`<div class="st-icon${esYo?' me':''}"><i class="ph ph-user"></i>${tienePendiente?'<span class="st-dot"></span>':''}</div><div class="st-body"><p class="st-name">${nombre(a)}</p></div><div class="st-meta">${esMMFD(a)?'<span class="st-badge">Dual</span>':''}<span class="st-num">No.${a['No']||''}</span></div>`;
    row.addEventListener('click',()=>_esAdmin?abrirAlumnoSheet(a,fecha):toggleNombre(row));
    wrap.appendChild(row);
  });
  cont.appendChild(wrap);
}

function mkExpandBtn(cont,diasFuturos,equiposPorDia,admin){
  if(!diasFuturos.length)return;
  const btn=document.createElement('button');btn.className='expand-btn';
  btn.innerHTML='<i class="ph ph-calendar-dots"></i><span class="lbl">Ver próximas jornadas</span><i class="ph ph-caret-down caret"></i>';
  const list=document.createElement('div');list.className='more-list';
  diasFuturos.forEach(d=>{
    const eq=equiposPorDia.get(fkey(d))||[];
    mkCard(list,eq,d,'Equipo de limpieza',false,admin);
  });
  let open=false;
  btn.addEventListener('click',()=>{
    open=!open;btn.classList.toggle('open',open);list.classList.toggle('open',open);
    btn.querySelector('.lbl').textContent=open?'Ocultar jornadas':'Ver próximas jornadas';
  });
  cont.appendChild(btn);cont.appendChild(list);
}

function mkSearchBar(cont){
  const row=document.createElement('div');
  row.className='search-row';
  row.innerHTML=`
    <div class="search-bar">
      <i class="ph ph-magnifying-glass search-bar-ico"></i>
      <input class="search-bar-inp" type="search" placeholder="Nombre o número de alumno…" autocomplete="off">
    </div>
    <button class="filter-btn" id="filter-btn" onclick="abrirOverlay('sheet-filtro')" type="button">
      <i class="ph ph-funnel"></i>
    </button>`;
  row.querySelector('.search-bar-inp').addEventListener('input',function(){_searchTerm=this.value;_aplicarFiltros();});
  cont.appendChild(row);
}

function seleccionarFiltro(filtro){
  _searchFilter=filtro;
  document.querySelectorAll('.filter-option').forEach(el=>{
    el.classList.toggle('selected',el.dataset.filter===filtro);
  });
  const btn=document.getElementById('filter-btn');
  if(btn)btn.classList.toggle('active',filtro!=='todos');
  cerrarSheet();
  _aplicarFiltros();
}

function _aplicarFiltros(){
  const term=_searchTerm.trim().toLowerCase();
  const filter=_searchFilter;
  const body=document.getElementById('aseo-body');
  const moreList=body.querySelector('.more-list');
  const expandBtn=body.querySelector('.expand-btn');
  const esFiltroAdmin=filter==='pagado'||filter==='pendiente'||filter==='ausentes';
  const activo=term||filter!=='todos';

  document.getElementById('flat-list')?.remove();

  if(esFiltroAdmin){
    if(expandBtn)expandBtn.style.display='none';
    if(moreList)moreList.classList.add('open');
    body.querySelectorAll('.section-card').forEach(c=>c.style.display='none');

    const card=document.createElement('div');
    card.className='section-card';card.id='flat-list';

    const filtered=_alumnos.filter(a=>{
      const nom=nombre(a).toLowerCase();
      const num=(a['No']||'').toString();
      const matchTerm=!term||nom.includes(term)||num.includes(term);
      const fbKey=_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase());
      const pagado=fbKey?(_pagoData.get(fbKey)===true):false;
      const aus=fbKey?(_ausenciasData.get(fbKey)||{}):{}; 
      const tienePendiente=Object.values(aus).some(v=>v==='pendiente');
      if(filter==='pagado')return matchTerm&&pagado;
      if(filter==='pendiente')return matchTerm&&!pagado;
      if(filter==='ausentes')return matchTerm&&tienePendiente;
      return matchTerm;
    });

    if(filtered.length){
      filtered.forEach(a=>{
        const row=document.createElement('div');row.className='student-row';
        const fbKey=_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase())||null;
        const pagado=fbKey?(_pagoData.get(fbKey)===true):false;
        const esYo=(a['Correo Institucional']||'').toLowerCase()===(auth.currentUser?.email?.toLowerCase()??'');
        const aus=fbKey?(_ausenciasData.get(fbKey)||{}):{}; 
        const tienePendiente=Object.values(aus).some(v=>v==='pendiente');
        row.dataset.pagado=pagado?'true':'false';
        row.innerHTML=`<div class="st-icon${esYo?' me':''}"><i class="ph ph-user"></i>${tienePendiente?'<span class="st-dot"></span>':''}</div><div class="st-body"><p class="st-name">${nombre(a)}</p></div><div class="st-meta">${esMMFD(a)?'<span class="st-badge">Dual</span>':''}<span class="st-num">No.${a['No']||''}</span></div>`;
        row.addEventListener('click',()=>abrirAlumnoSheet(a));
        card.appendChild(row);
      });
    }else{
      card.innerHTML='<div class="empty-state"><i class="ph ph-magnifying-glass"></i><p class="e-title">Sin resultados para la búsqueda</p></div>';
    }

    const searchRow=body.querySelector('.search-row');
    if(searchRow)searchRow.after(card);else body.appendChild(card);
    return;
  }

  body.querySelectorAll('.section-card').forEach(c=>c.style.display='');
  if(moreList){
    if(activo){
      moreList.classList.add('open');
      if(expandBtn)expandBtn.style.display='none';
    }else{
      const wasOpen=expandBtn?.classList.contains('open');
      moreList.classList.toggle('open',!!wasOpen);
      if(expandBtn)expandBtn.style.display='';
    }
  }

  body.querySelectorAll('.section-card').forEach(card=>{
    let vis=0;
    card.querySelectorAll('.student-row').forEach(row=>{
      const nom=row.querySelector('.st-name')?.textContent?.toLowerCase()||'';
      const num=row.querySelector('.st-num')?.textContent?.toLowerCase()||'';
      const esDual=!!row.querySelector('.st-badge');
      const matchTerm=!term||nom.includes(term)||num.includes(term);
      const matchFilter=filter==='dual'?esDual:true;
      const show=matchTerm&&matchFilter;
      row.style.display=show?'':'none';
      if(show)vis++;
    });
    const hdr=card.querySelector('.card-header');
    if(hdr)hdr.style.display='';
    card.style.display=vis>0||!activo?'':'none';
  });
}

function abrirOrdenSheet(){
  const body=document.getElementById('sheet-orden-body');
  body.innerHTML='';
  if(!_alumnos.length){
    body.innerHTML='<div class="empty-state"><i class="ph ph-users"></i><p class="e-title">No hay alumnos registrados en el sistema</p></div>';
    abrirOverlay('sheet-orden');return;
  }

  const n=_alumnos.length;
  const numTeams=Math.max(1,Math.round(n/5));
  const base=Math.floor(n/numTeams);
  const extra=n%numTeams;
  let teamSizes=[];
  for(let t=0;t<numTeams;t++)teamSizes.push(base+(t<extra?1:0));

  let teamIdx=0,countInTeam=0;
  _alumnos.forEach((a,i)=>{
    if(countInTeam>=teamSizes[teamIdx]){teamIdx++;countInTeam=0;}
    const eq=teamIdx+1;
    countInTeam++;

    const dual=esMMFD(a);
    const row=document.createElement('div');
    row.className='orden-row';
    const fbKey=_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase())||'';
    row.dataset.fbkey=fbKey;

    const tags=dual
      ?`<div class="orden-tags"><span class="st-badge">Dual</span></div>`
      :'';

    row.innerHTML=`
      <div class="orden-handle"><i class="ph ph-dots-six-vertical"></i></div>
      <span class="orden-eq">${eq}</span>
      <span class="orden-name">${nombre(a)}</span>
      ${tags}`;
    body.appendChild(row);
  });

  _initOrdenDrag(body);
  abrirOverlay('sheet-orden');
}

function _initOrdenDrag(body){
  let dragging=null,ghost=null,offsetY=0,scrollTop=0;

  function rows(){return[...body.querySelectorAll('.orden-row')];}

  function createGhost(row){
    const g=row.cloneNode(true);
    const r=row.getBoundingClientRect();
    g.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;
      height:${r.height}px;z-index:999;pointer-events:none;
      background:var(--bg);border:1px solid var(--line);
      border-radius:8px;opacity:.95;transition:none`;
    document.body.appendChild(g);
    return g;
  }

  function rowAt(y){
    const list=rows().filter(r=>r!==dragging);
    for(const r of list){
      const rc=r.getBoundingClientRect();
      if(y>=rc.top&&y<=rc.bottom)return r;
    }
    return null;
  }

  body.addEventListener('touchstart',e=>{
    const handle=e.target.closest('.orden-handle');
    if(!handle)return;
    dragging=handle.closest('.orden-row');
    if(!dragging)return;
    const touch=e.touches[0];
    const rc=dragging.getBoundingClientRect();
    offsetY=touch.clientY-rc.top;
    scrollTop=body.scrollTop;
    ghost=createGhost(dragging);
    dragging.style.opacity='0.3';
    e.preventDefault();
  },{passive:false});

  document.addEventListener('touchmove',e=>{
    if(!dragging||!ghost)return;
    e.preventDefault();
    const y=e.touches[0].clientY;
    ghost.style.top=(y-offsetY)+'px';
    const target=rowAt(y);
    if(target){
      const rc=target.getBoundingClientRect();
      if(y<rc.top+rc.height/2)body.insertBefore(dragging,target);
      else body.insertBefore(dragging,target.nextSibling);
    }
  },{passive:false});

  document.addEventListener('touchend',()=>{
    if(!dragging)return;
    dragging.style.opacity='';
    if(ghost){ghost.remove();ghost=null;}
    _renumerarOrden(body);
    _programarGuardado(body);
    dragging=null;
  });
}

function _renumerarOrden(body){
  const rows=[...body.querySelectorAll('.orden-row')];
  const n=rows.length;
  const numTeams=Math.max(1,Math.round(n/5));
  const base=Math.floor(n/numTeams);
  const extra=n%numTeams;
  let teamIdx=0,countInTeam=0;
  const sizes=[];
  for(let t=0;t<numTeams;t++)sizes.push(base+(t<extra?1:0));
  rows.forEach((row,i)=>{
    if(countInTeam>=sizes[teamIdx]){teamIdx++;countInTeam=0;}
    const eq=row.querySelector('.orden-eq');
    if(eq)eq.textContent=teamIdx+1;
    countInTeam++;
  });
}

function _programarGuardado(body){
  clearTimeout(_ordenDebounce);
  _ordenDebounce=setTimeout(()=>_guardarOrden(body),800);
}

async function _guardarOrden(body){
  const keys=[...body.querySelectorAll('.orden-row')].map(r=>r.dataset.fbkey).filter(Boolean);
  if(!keys.length)return;
  try{
    await db.ref('ordenAlumnos').set(keys);
    _ordenPersonalizado=keys;
    _alumnos=[...body.querySelectorAll('.orden-row')].map(r=>{
      return _alumnos.find(a=>_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase())===r.dataset.fbkey);
    }).filter(Boolean);
    toast('Orden de rotación actualizado','ph-check-circle ok');
  }catch{
    toast('No fue posible guardar el orden. Inténtalo de nuevo.','ph-warning err');
  }
}

async function _restaurarOrdenOriginal(){
  try{
    await db.ref('ordenAlumnos').remove();
    _ordenPersonalizado=null;
    _alumnos.sort((a,b)=>(parseInt(a['No'])||0)-(parseInt(b['No'])||0));
    toast('Orden restablecido al número de lista','ph-check-circle ok');
    cerrarSheet();
    _aseoLoaded=false;setTimeout(()=>cargarAseo(),280);
  }catch{
    toast('No fue posible restablecer el orden. Inténtalo de nuevo.','ph-warning err');
  }
}

async function cargarAseo(){
  if(_aseoLoaded)return;_aseoLoaded=true;
  _searchTerm='';_searchFilter='todos';
  const cont=document.getElementById('aseo-body');cont.innerHTML='';
  const correoUsuario=auth.currentUser?.email?.toLowerCase()??null;
  const uid=auth.currentUser?.uid??null;
  _esAdmin=await esAdmin(uid);
  try{const s=await db.ref('cancelaciones').once('value');_cancelados=s.val()||{}}
  catch{_cancelados={}}
  renderMenuAdmin();
  try{
    const snap=await db.ref('estudiantes').once('value');
    const alumnos=[];
    let userFbKey=null,userPagado=false;
    _fbKeyMap.clear();_pagoData.clear();_ausenciasData.clear();
    snap.forEach(c=>{
      const v=c.val();
      if(v&&typeof v==='object'){
        alumnos.push(v);
        const correo=(v['Correo Institucional']||'').toLowerCase();
        _fbKeyMap.set(correo,c.key);
        _pagoData.set(c.key,v.pagado===true);
        if(correoUsuario&&correo===correoUsuario){
          userFbKey=c.key;
          userPagado=v.pagado===true;
        }
      }
    });
    if(!alumnos.length){
      cont.innerHTML='<div class="empty-state"><i class="ph ph-users"></i><p class="e-title">No hay alumnos registrados en el sistema</p></div>';
      return;
    }
    alumnos.sort((a,b)=>(parseInt(a['No'])||0)-(parseInt(b['No'])||0));

    if(_esAdmin){
      try{
        const ausSnap=await db.ref('ausencias').once('value');
        ausSnap.forEach(c=>{const v=c.val();if(v)_ausenciasData.set(c.key,v);});
      }catch{}
    }

    try{
      const ordenSnap=await db.ref('ordenAlumnos').once('value');
      const orden=ordenSnap.val();
      if(Array.isArray(orden)&&orden.length){
        _ordenPersonalizado=orden;
        const keyMap=new Map(alumnos.map(a=>[_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase()),a]));
        const ordenados=[];
        orden.forEach(k=>{if(keyMap.has(k))ordenados.push(keyMap.get(k));});
        alumnos.forEach(a=>{const k=_fbKeyMap.get((a['Correo Institucional']||'').toLowerCase());if(!orden.includes(k))ordenados.push(a);});
        alumnos.splice(0,alumnos.length,...ordenados);
      }else{
        _ordenPersonalizado=null;
      }
    }catch{_ordenPersonalizado=null;}

    _alumnos=alumnos;

    const hoyParaConteo=new Date();hoyParaConteo.setHours(0,0,0,0);
    _conteosEquipos=obtenerConteosLimpieza(_alumnos,hoyParaConteo);

    if(_pagoListener){_pagoListener();_pagoListener=null;}
    if(userFbKey){
      const ref=db.ref(`estudiantes/${userFbKey}/pagado`);
      const handler=s=>_actualizarEstadoPagoUI(s.val()===true);
      ref.on('value',handler);
      _pagoListener=()=>ref.off('value',handler);
    }

    const hoy=new Date();hoy.setHours(0,0,0,0);
    const esFDS=hoy.getDay()===0||hoy.getDay()===6;
    const hoyCancelado=cancelado(hoy);
    const manana=new Date(hoy);manana.setDate(manana.getDate()+1);

    if(esFDS||hoyCancelado){
      const prox=proximoHabil(manana);
      const sigDesde=new Date(prox);sigDesde.setDate(sigDesde.getDate()+1);
      const rest=_esAdmin?siguientes(sigDesde,19):restantesSemana(sigDesde);
      const fechas=[prox,...rest];
      const eqs=simular(alumnos,fechas);
      const eqProx=eqs.get(fkey(prox))||[];
      if(correoUsuario){
        const turno=proximoTurno(alumnos,correoUsuario,manana);
        if(turno){const yi=turno.equipo.findIndex(a=>(a['Correo Institucional']||'').toLowerCase()===correoUsuario);mkTurnStrip(cont,turno.fecha,turno.equipo,yi>=0?yi:null)}
      }
      mkEstadoCard(cont,userPagado);
      mkSearchBar(cont);
      mkCard(cont,eqProx,prox,hoyCancelado?'Próximo equipo disponible':'Equipo del próximo día hábil',false,_esAdmin);
      mkExpandBtn(cont,rest,eqs,_esAdmin);
      return;
    }

    const resto=_esAdmin?siguientes(manana,20):restantesSemana(manana);
    const fechas=[hoy,...resto];
    const eqs=simular(alumnos,fechas);
    const eqHoy=eqs.get(fkey(hoy))||[];
    const limpiaHoy=correoUsuario&&eqHoy.some(a=>(a['Correo Institucional']||'').toLowerCase()===correoUsuario);
    if(correoUsuario&&!limpiaHoy){
      const turno=proximoTurno(alumnos,correoUsuario,manana);
      if(turno){const yi=turno.equipo.findIndex(a=>(a['Correo Institucional']||'').toLowerCase()===correoUsuario);mkTurnStrip(cont,turno.fecha,turno.equipo,yi>=0?yi:null)}
    }
    mkEstadoCard(cont,userPagado);
    mkSearchBar(cont);
    mkCard(cont,eqHoy,hoy,'Equipo de hoy',false,_esAdmin);
    mkExpandBtn(cont,resto,eqs,_esAdmin);
  }catch{
    cont.innerHTML='<div class="empty-state err"><i class="ph ph-wifi-slash"></i><p class="e-title">No fue posible cargar la información</p><p class="e-sub">Verifica tu conexión a internet e inténtalo de nuevo.</p></div>';
  }
}

function abrirEquipoSheet(){
  const body=document.getElementById('sheet-equipo-body');body.innerHTML='';
  if(_equipoSheet.length){
    const targetE=(_equipoSheet[0]['Correo Institucional']||'').toLowerCase();
    const limpiezas=_conteosEquipos.get(targetE)||0;
    const stats=document.createElement('div');
    stats.className='estado-row';
    stats.style.marginBottom='16px';
    stats.style.background='var(--surface)';
    stats.style.borderRadius='12px';
    stats.style.padding='16px';
    stats.style.display='flex';
    stats.style.alignItems='center';
    stats.style.gap='16px';
    stats.innerHTML=`<div class="estado-ico ok" style="background:var(--bg);color:var(--ink-2);width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;border:1px solid var(--line)"><i class="ph ph-clock-counter-clockwise"></i></div><div class="estado-info" style="flex:1;min-width:0"><p class="estado-titulo" style="font-weight:600;color:var(--ink);font-size:15px;margin-bottom:2px">Historial de limpieza</p><p class="estado-desc" style="color:var(--ink-2);font-size:14px;line-height:1.4">Han completado <strong style="color:var(--ink)">${limpiezas} ${limpiezas===1?'jornada':'jornadas'}</strong> de forma activa</p></div>`;
    body.appendChild(stats);
  }
  _equipoSheet.forEach((a,i)=>{
    const esYo=i===_yoIdx;
    const row=document.createElement('div');row.className='sheet-row';
    row.innerHTML=`<div class="sr-icon${esYo?' me':''}"><i class="ph ph-user"></i></div><div class="sr-info"><span class="sr-name">${nombre(a)}</span>${esYo?'<span class="sr-you">Tú</span>':''}</div><span class="sr-num">No.${a['No']||''}</span>`;
    body.appendChild(row);
  });
  abrirOverlay('sheet-equipo');
}

function abrirHistorial(){
  const body=document.getElementById('sheet-historial-body');body.innerHTML='';
  const claves=Object.keys(_cancelados).sort();
  if(!claves.length){
    body.innerHTML='<div class="empty-state"><i class="ph ph-check-circle"></i><p class="e-title">Sin jornadas canceladas</p></div>';
    abrirOverlay('sheet-historial');return;
  }
  claves.forEach(key=>{
    const [y,m,d]=key.split('-').map(Number);
    const fecha=new Date(y,m-1,d);
    const hoy=new Date();hoy.setHours(0,0,0,0);
    const row=document.createElement('div');row.className='hist-row';
    row.innerHTML=`<div class="hist-dot"></div><div class="hist-info"><span class="hist-date">${fstr(fecha,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span><span class="hist-sub">${fecha<hoy?'Jornada pasada':'Jornada próxima'}</span></div><button class="hist-btn" data-key="${key}"><i class="ph ph-arrow-counter-clockwise"></i>Restaurar</button>`;
    row.querySelector('.hist-btn').addEventListener('click',function(){restaurarHistorial(this)});
    body.appendChild(row);
  });
  abrirOverlay('sheet-historial');
}

async function restaurarHistorial(btn){
  const key=btn.dataset.key;btn.classList.add('loading');
  try{
    await db.ref('cancelaciones/'+key).remove();delete _cancelados[key];
    const row=btn.closest('.hist-row');
    row.style.transition='opacity 160ms';row.style.opacity='0';
    setTimeout(()=>{
      row.remove();
      const body=document.getElementById('sheet-historial-body');
      if(!body.querySelector('.hist-row'))body.innerHTML='<div class="empty-state"><i class="ph ph-check-circle"></i><p class="e-title">Sin jornadas canceladas</p></div>';
    },160);
    _aseoLoaded=false;setTimeout(()=>cargarAseo(),280);
    const [y,m,d]=key.split('-').map(Number);
    toast(`Jornada del ${fstr(new Date(y,m-1,d))} restaurada`,'ph-check-circle ok',async()=>{await db.ref('cancelaciones/'+key).set(true);_cancelados[key]=true;_aseoLoaded=false;cargarAseo()});
  }catch{btn.classList.remove('loading');toast('No fue posible restaurar la jornada. Inténtalo de nuevo.','ph-warning-circle err',null)}
}

function abrirAjuste(btn){
  _ajusteKey=btn.dataset.key;_ajusteCancelado=btn.dataset.cancelado==='1';
  const [y,m,d]=_ajusteKey.split('-').map(Number);
  const f=fstr(new Date(y,m-1,d));
  const title=document.getElementById('ajuste-title');
  const desc=document.getElementById('ajuste-desc');
  const action=document.getElementById('ajuste-action');
  if(_ajusteCancelado){
    title.textContent='Restaurar jornada';
    desc.textContent=`La jornada del ${f} está cancelada. Al restaurarla, la rotación volverá a incluir este día y el equipo asignado regresará a su posición original.`;
    action.textContent='Restaurar jornada';action.className='ajuste-action restore';
  }else{
    title.textContent='Cancelar jornada';
    desc.textContent=`Al cancelar la jornada del ${f}, la rotación se ajustará automáticamente y el equipo asignado pasará al siguiente día hábil disponible.`;
    action.textContent='Cancelar jornada';action.className='ajuste-action cancel';
  }
  abrirOverlay('sheet-ajuste');
}

function abrirOverlay(sheetId){
  const ov=document.getElementById('overlay');
  document.getElementById(sheetId).classList.add('open');
  ov.classList.add('open');
  requestAnimationFrame(()=>ov.classList.add('vis'));
}

async function confirmarAjuste(){
  const action=document.getElementById('ajuste-action');
  action.disabled=true;action.classList.add('loading');
  document.getElementById('sheet-ajuste').querySelector('.ajuste-err')?.remove();
  const key=_ajusteKey,eraCancelado=_ajusteCancelado;
  const [y,m,d]=key.split('-').map(Number);
  const f=fstr(new Date(y,m-1,d));
  try{
    if(eraCancelado){await db.ref('cancelaciones/'+key).remove();delete _cancelados[key]}
    else{await db.ref('cancelaciones/'+key).set(true);_cancelados[key]=true}
    _aseoLoaded=false;cerrarSheet();setTimeout(()=>cargarAseo(),280);
    if(eraCancelado)toast(`Jornada del ${f} restaurada`,'ph-check-circle ok',async()=>{await db.ref('cancelaciones/'+key).set(true);_cancelados[key]=true;_aseoLoaded=false;cargarAseo()});
    else toast(`Jornada del ${f} cancelada`,'ph-x-circle err',async()=>{await db.ref('cancelaciones/'+key).remove();delete _cancelados[key];_aseoLoaded=false;cargarAseo()});
  }catch(e){
    action.disabled=false;action.classList.remove('loading');
    const err=document.createElement('p');err.className='ajuste-err';
    err.textContent=e?.message||'No fue posible guardar los cambios. Inténtalo de nuevo.';action.before(err);
  }
}

function cerrarSheet(){
  const ov=document.getElementById('overlay');
  ['sheet-equipo','sheet-ajuste','sheet-historial','sheet-menu','sheet-alumno','sheet-filtro','sheet-orden'].forEach(id=>document.getElementById(id).classList.remove('open'));
  ov.classList.remove('vis');
  setTimeout(()=>ov.classList.remove('open'),240);
}

async function abrirMenu(){
  const email=auth.currentUser?.email??'';
  document.getElementById('menu-email').textContent=email;
  document.getElementById('menu-name').textContent='';
  abrirOverlay('sheet-menu');
  try{
    const fbKey=_fbKeyMap.get(email.toLowerCase());
    if(fbKey){
      const snap=await db.ref(`estudiantes/${fbKey}`).once('value');
      const v=snap.val();
      if(v){
        const found=[v['Primer Nombre']||'',v['Apellido Paterno']||''].map(s=>s.trim()).filter(Boolean).join(' ');
        if(found)document.getElementById('menu-name').textContent=found;
      }
    }
  }catch{}
}

async function cerrarSesion(){cerrarSheet();try{await auth.signOut()}catch{}}

auth.onAuthStateChanged(async user=>{
  if(user){
    showPage('page-app');await registrarToken(user.uid,user.email);cargarAseo();
  }else{
    if(_pagoListener){_pagoListener();_pagoListener=null;}
    _cancelados={};_esAdmin=false;_aseoLoaded=false;_equipoSheet=[];_yoIdx=null;_tabActual='aseo';
    _fbKeyMap.clear();_pagoData.clear();_ausenciasData.clear();_alumnos=[];
    _searchTerm='';_searchFilter='todos';_undoFn=null;clearTimeout(_toastTimer);
    _ordenPersonalizado=null;clearTimeout(_ordenDebounce);
    document.getElementById('aseo-body').innerHTML='';
    document.getElementById('menu-admin-rows').innerHTML='';
    document.querySelectorAll('.tab-screen').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.remove('active');
      b.querySelector('i').className=b.querySelector('i').className.replace('ph-fill ph-','ph ph-');
    });
    document.getElementById('screen-aseo').classList.add('active');
    const at=document.getElementById('tab-aseo');
    at.classList.add('active');at.querySelector('i').className='ph-fill ph-broom';
    irALogin();
  }
});

if(messaging){
  messaging.onMessage(payload=>{
    toast(payload.notification?.body??payload.notification?.title??'Nuevo aviso del plantel','ph-bell ok',null);
  });
}

function renderNotifCard(){
  const card=document.getElementById('notif-card');if(!card)return;
  const supported=('Notification' in window)&&!!messaging;
  const perm=supported?Notification.permission:'unsupported';
  const map={
    granted:    {cls:'green', icon:'ph-bell-ringing',     tag:'Activas',      title:'Recibes avisos del plantel',          desc:'Te notificaremos cuando haya comunicados o cambios importantes en la rotación de CONALEP Plantel 207.',btn:null},
    default:    {cls:'gold',  icon:'ph-bell',              tag:'Desactivadas', title:'Activa las notificaciones de avisos', desc:'Permite recibir notificaciones cuando se publiquen comunicados o cambios en la rotación de limpieza.',btn:{label:'Activar notificaciones',icon:'ph-bell'}},
    denied:     {cls:'maroon',icon:'ph-bell-slash',        tag:'Bloqueadas',   title:'Acceso denegado por el navegador',    desc:'Para activarlas, ve a la configuración de tu navegador, busca este sitio y permite las notificaciones.',btn:null},
    unsupported:{cls:'',      icon:'ph-bell-simple-slash', tag:'No compatible',title:'Notificaciones no disponibles',       desc:'Tu navegador no soporta notificaciones push. Consulta los avisos directamente en esta sección.',btn:null}
  };
  const e=map[perm]||map.unsupported;
  card.className='notif-item';
  card.innerHTML=`<div class="notif-main"><div class="notif-badge ${e.cls}"><i class="ph ${e.icon}"></i></div><div class="notif-text"><p class="notif-title">${e.title}</p><p class="notif-desc">${e.desc}</p></div></div>${e.btn?`<div class="notif-foot"><button id="notif-btn" class="notif-action"><i class="ph ${e.btn.icon}"></i>${e.btn.label}</button></div>`:''}`;
  if(e.btn){
    document.getElementById('notif-btn').addEventListener('click',async function(){
      this.classList.add('loading');
      try{const p=await Notification.requestPermission();if(p==='granted'){const u=auth.currentUser;if(u)await registrarToken(u.uid,u.email)}renderNotifCard()}
      catch{renderNotifCard()}
    });
  }
}

if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})}
