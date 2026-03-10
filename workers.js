const FIREBASE_DB = 'https://conalep-chihuahua-default-rtdb.firebaseio.com';
const PROJECT_ID = 'conalep-chihuahua';
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@conalep-chihuahua.iam.gserviceaccount.com';
const APP_URL = 'https://conalepchihuahua.github.io/Plantel-CONALEP-207.-Ciudad-Juarez-ll/';
const FIREBASE_SECRET = 'DbukgGKWoTS9fVcaZypj3pFLIMJLSlXWR3lnm4i9';
const ROTACION_INICIO = { y: 2026, m: 2, d: 9 };

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, false));
  },
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsPreflightResponse();
    const path = new URL(request.url).pathname;
    if (path === '/test') return json(await run(env, true));
    if (path === '/send') return json(await run(env, false));
    if (path === '/notificar-ausencia' && request.method === 'POST') {
      return json(await notificarAusenciaInmediata(request));
    }
    return new Response('OK', { headers: corsHeaders() });
  }
};

async function run(env, dryRun) {
  try {
    const accessToken = await getAccessToken();

    const [estudiantesRaw, cancelacionesRaw, tokensRaw, ordenRaw, ausenciasRaw] = await Promise.all([
      fbGet('estudiantes'),
      fbGet('cancelaciones'),
      fbGet('fcmTokens'),
      fbGet('ordenAlumnos'),
      fbGet('ausencias'),
    ]);

    const cancelados = cancelacionesRaw || {};
    const ausencias = ausenciasRaw || {};
    const fbKeyMap = new Map();
    const alumnos = [];

    for (const [fbKey, val] of Object.entries(estudiantesRaw || {})) {
      if (val && typeof val === 'object') {
        alumnos.push(val);
        fbKeyMap.set((val['Correo Institucional'] || '').toLowerCase(), fbKey);
      }
    }

    if (!alumnos.length) return { error: 'Sin estudiantes' };

    alumnos.sort((a, b) => (parseInt(a['No']) || 0) - (parseInt(b['No']) || 0));

    if (Array.isArray(ordenRaw) && ordenRaw.length) {
      const keyMap = new Map();
      alumnos.forEach(a => {
        const k = fbKeyMap.get((a['Correo Institucional'] || '').toLowerCase());
        if (k) keyMap.set(k, a);
      });
      const ordenados = [];
      ordenRaw.forEach(k => { if (keyMap.has(k)) ordenados.push(keyMap.get(k)); });
      alumnos.forEach(a => {
        const k = fbKeyMap.get((a['Correo Institucional'] || '').toLowerCase());
        if (!ordenRaw.includes(k)) ordenados.push(a);
      });
      alumnos.splice(0, alumnos.length, ...ordenados);
    }

    // Construir mapa correo → token desde fcmTokens
    // fcmTokens usa UIDs de Firebase Auth como clave, con un campo "correo"
    const tokenPorCorreo = new Map();
    for (const entry of Object.values(tokensRaw || {})) {
      if (entry && entry.token && entry.correo) {
        tokenPorCorreo.set(entry.correo.toLowerCase(), entry.token);
      }
    }

    const hoy = fechaLocal('America/Ojinaga');
    const dow = hoy.getDay();
    const esFDS = dow === 0 || dow === 6;
    if (cancelados[fkey(hoy)] && !esFDS) return { skipped: 'Jornada cancelada' };

    const fcmToken = dryRun ? null : accessToken;

    // Pendientes se notifican siempre, incluso fines de semana
    const resPendientes = await notificarPendientes(
      fcmToken, alumnos, fbKeyMap, tokenPorCorreo, ausencias, cancelados, dryRun
    );

    // Limpieza del día solo en días hábiles
    if (esFDS) return { skipped_limpieza: 'Fin de semana', pendientes: resPendientes };

    if (cancelados[fkey(hoy)]) return { skipped_limpieza: 'Jornada cancelada', pendientes: resPendientes };

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    while (manana.getDay() === 0 || manana.getDay() === 6 || cancelados[fkey(manana)]) {
      manana.setDate(manana.getDate() + 1);
    }

    const equipoHoy = calcularEquipo(alumnos, hoy, cancelados);
    const equipoManana = calcularEquipo(alumnos, manana, cancelados);

    const [resHoy, resManana] = await Promise.all([
      enviarNotif(fcmToken, equipoHoy, tokenPorCorreo, hoy, false, dryRun),
      enviarNotif(fcmToken, equipoManana, tokenPorCorreo, manana, true, dryRun),
    ]);

    return { hoy: resHoy, aviso_manana: resManana, pendientes: resPendientes };
  } catch (err) {
    return { error: err.message };
  }
}

async function enviarNotif(accessToken, equipo, tokenPorCorreo, fecha, esAviso, dryRun) {
  if (!equipo.length) return { error: 'Sin equipo' };

  const tokens = [];
  const notificados = [];

  for (const alumno of equipo) {
    const correo = (alumno['Correo Institucional'] || '').toLowerCase();
    const token = tokenPorCorreo.get(correo);
    if (token) {
      tokens.push(token);
      notificados.push(nombreCorto(alumno));
    }
  }

  if (!tokens.length) return { warning: 'Sin tokens FCM', equipo: equipo.map(nombreCorto) };

  const fechaStr = capitalizar(fecha.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Ojinaga'
  }));

  const title = esAviso
    ? 'Aviso de Limpieza'
    : 'Turno de Limpieza';
  const body = esAviso
    ? `Se le recuerda que el ${fechaStr} le corresponde realizar el turno de limpieza. Favor de presentarse puntualmente.`
    : `Se le informa que el dia de hoy, ${fechaStr}, le corresponde realizar el turno de limpieza. Favor de presentarse puntualmente.`;

  if (dryRun) return { dryRun: true, title, body, notificados };

  let ok = 0, fail = 0;
  const BATCH = 50;

  for (let i = 0; i < tokens.length; i += BATCH) {
    const lote = tokens.slice(i, i + BATCH);
    await Promise.all(lote.map(async token => {
      try {
        const res = await fetch(FCM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: { title, body, url: APP_URL, fecha: fkey(fecha) },
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  icon: 'https://raw.githubusercontent.com/conalepchihuahua/Plantel-CONALEP-207.-Ciudad-Juarez-ll/refs/heads/main/Chihuahua/Logotipos%20del%20Estado/apple-touch-icon.png',
                  requireInteraction: true,
                  silent: false
                },
                fcm_options: { link: APP_URL }
              }
            }
          })
        });
        res.ok ? ok++ : fail++;
      } catch { fail++; }
    }));
  }

  return { ok, fail, notificados };
}

async function notificarPendientes(accessToken, alumnos, fbKeyMap, tokenPorCorreo, ausencias, cancelados, dryRun) {
  // Construir mapa inverso fbKey → alumno
  const keyToAlumno = new Map();
  for (const alumno of alumnos) {
    const fbKey = fbKeyMap.get((alumno['Correo Institucional'] || '').toLowerCase());
    if (fbKey) keyToAlumno.set(fbKey, alumno);
  }

  // Buscar alumnos con al menos una ausencia pendiente
  const conPendiente = [];
  for (const [fbKey, registros] of Object.entries(ausencias)) {
    const tienePendiente = Object.values(registros || {}).some(v => v === 'pendiente');
    if (tienePendiente) {
      const alumno = keyToAlumno.get(fbKey);
      if (alumno) {
        const correo = (alumno['Correo Institucional'] || '').toLowerCase();
        const token = tokenPorCorreo.get(correo);
        if (token) {
          conPendiente.push({ alumno, token, fbKey });
        }
      }
    }
  }

  if (!conPendiente.length) return { skipped: 'Sin alumnos con turnos pendientes' };

  const title = 'Turno de Limpieza Pendiente';
  const body = 'Se le informa que cuenta con un turno de limpieza pendiente derivado de una ausencia registrada. ' +
    'Favor de presentarse con el responsable del grupo para regularizar su situación a la brevedad posible.';

  if (dryRun) return {
    dryRun: true, title, body,
    notificados: conPendiente.map(e => nombreCorto(e.alumno))
  };

  let ok = 0, fail = 0;
  const BATCH = 50;
  const tokens = conPendiente.map(e => e.token);

  for (let i = 0; i < tokens.length; i += BATCH) {
    const lote = tokens.slice(i, i + BATCH);
    await Promise.all(lote.map(async token => {
      try {
        const res = await fetch(FCM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: { title, body, url: APP_URL },
              webpush: {
                headers: { Urgency: 'high' },
                notification: {
                  icon: 'https://raw.githubusercontent.com/conalepchihuahua/Plantel-CONALEP-207.-Ciudad-Juarez-ll/refs/heads/main/Chihuahua/Logotipos%20del%20Estado/apple-touch-icon.png',
                  requireInteraction: true,
                  silent: false
                },
                fcm_options: { link: APP_URL }
              }
            }
          })
        });
        res.ok ? ok++ : fail++;
      } catch { fail++; }
    }));
  }

  return { ok, fail, notificados: conPendiente.map(e => nombreCorto(e.alumno)) };
}

async function notificarAusenciaInmediata(request) {
  try {
    const { correo } = await request.json();
    if (!correo) return { error: 'Falta el correo' };

    const accessToken = await getAccessToken();

    const tokensRaw = await fbGet('fcmTokens');
    let token = null;
    for (const entry of Object.values(tokensRaw || {})) {
      if (entry && entry.correo && entry.correo.toLowerCase() === correo.toLowerCase()) {
        token = entry.token;
        break;
      }
    }

    if (!token) return { warning: 'Sin token FCM para este alumno', correo };

    const title = 'Turno de Limpieza Pendiente';
    const body  = 'Se le informa que cuenta con un turno de limpieza pendiente derivado de una ausencia registrada. ' +
                  'Favor de presentarse con el responsable del grupo para regularizar su situación a la brevedad posible.';

    const res = await fetch(FCM_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { title, body, url: APP_URL },
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              icon: 'https://raw.githubusercontent.com/conalepchihuahua/Plantel-CONALEP-207.-Ciudad-Juarez-ll/refs/heads/main/Chihuahua/Logotipos%20del%20Estado/apple-touch-icon.png',
              requireInteraction: true,
              silent: false
            },
            fcm_options: { link: APP_URL }
          }
        }
      })
    });

    return res.ok
      ? { ok: true, correo }
      : { error: `FCM error ${res.status}`, correo };

  } catch (err) {
    return { error: err.message };
  }
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  function b64url(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  function b64urlBuf(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));

  const SA_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDB42hbgmn/Jnce
nBgMJzSJdOQ2dPIeon9tGiFYwBZ6pmwA5V2q9x6ugCMxrS5nzFox2SKE0gBjH/Il
d/BjELxr0rshiSoMM6ZKWUzIRWWxm9+Gy9wwj0d67AsEnkw82QPYAvGP/kcNz6Ej
ycTkb2eupwGQnIe0EFf2dBIDZsHkl65Vx3xbsZUyyRcDyDI2CR6p8+y6rpwZUmmn
ovI5mO63JyBcMFcpjWaua6hMuR88Ji87r0WYBnPKYpRWpTV6tbHtA6DQDhLjXBVm
C864JeVsiw86E1UFkKCnEIhi00caL4eqLTGYKNLGDStvtWwMgf8WmNDbx4prRWX4
CfHj8RcRAgMBAAECggEAAN1EWft3T6dpUhHEEa1+JCf1ZbbncHxx4jU965VdK6yl
opwAr/hsM/oEt/35L3KAsB9G6JQN2Z5ZwxHrzrjw1rSsZrtBV6daDzFAQenV5l+3
DRJSClmvUUZZVZwXCzjb01/E6IYJM/nKDaVnioZixGaM9dnEK5A/Fpm1jezJ9bet
ZOoP/JB/yE4a0rWKQ66UjnhCaYRV3/TtaKFauKmdMDgT0/V2c7eYIgpXI5YsfRXP
XPE51/4Ke5Y+8a7x4JDhJeiOo0P7ikBhGXIV80Cl2x3Am+4UZ4iYAH+zYDG2hOtr
aUyDJi5X+vSK7yXurxsIp3JiKjUuR2CVUAhj3whbIQKBgQDt196b09UETrfgXBPG
5wbaCOvxxCNReAfDoEHgHwRleH2sHX6ruf9xDeqcrP/UhTXRPeeb4CT5WleGEmeb
p5uO3TqU6i5hAy80PuNyDsXaXG4akyO0CMCna8lbnqUgKBwh3r3q1TU/CttmQGXQ
zJm5itgSmu0QnCkBuQ/FCR2KlQKBgQDQsIjHT8KmBmhBIYW7Qd3Lut+S893sJLNG
s/BD98aLrsqTWov3yBUrD7XM3hFj5iEt4TlKjg59/8irYS/UwogfAEVmX97apvPi
p4jf3sYzLDoLk/+lxmtGU/BVb4K5vHnUyTW5ryy6oYbuTWwyrEU64R7o37Du31df
Qe8R/p73jQKBgGiaUx4neP0O/dGfzVbiDmJgIBzRTVMsPgXsemxuV8mkx2imBCrU
f6KiIzfK4iz+dR/UYQNt/fTopauidoy/lyuq4nPR1pn2A5GvwupL0vppQkdPxRkN
7GT1g7ZWvHq7CTxgMRiRsnxKcxmyYtUE1usCRGtSVcbDV0mZsXTPwH1NAoGAcOzF
5swzMPHQokXIfq7CnQaPCo7prGmjlQOzZKQEDPvVZG0fxkG/qqCCqMwVrvANTi1M
ehpqnyW06X/aiQ+G5veXljEUf07OM/yiJToAGBq7gh5gvMykqdar+x8vJuBlMI58
gvDWjFrxj6vXe4gaoiTFPBAnRusV9VbRTfRxAtUCgYEAk/xzIEYejJR8IM7X5Hj9
dJrxE/uuaAcdQWx+aed3wm0mUc4ZzuxPbwW2qOrVie0HaV1zVef9DPS11qIxq1mf
PE0wyhuV9iY79phgGd7OQrPVJWw6LXNPQxVcRdpbmCQgOgbexZM/OhGOJPobez75
39oT7mT+1x0jACAPKba8VP4=
-----END PRIVATE KEY-----`;

  const pemBody = SA_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const keyDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const jwt = `${header}.${payload}.${b64urlBuf(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description ?? 'No se obtuvo access token');
  return data.access_token;
}

/* ── Utilidades ─────────────────────────────────────────────────────────── */

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function fkey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaLocal(tz) {
  const str = new Date().toLocaleString('en-US', { timeZone: tz });
  const d = new Date(str);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function esMMFD(a) {
  return (a['MMFD'] || '').toLowerCase().includes('incorporado');
}

function nombreCorto(a) {
  return [(a['Primer Nombre'] || '').trim(), (a['Apellido Paterno'] || '').trim()]
    .filter(Boolean).join(' ') || `Alumno ${a['No'] || ''}`;
}

function buildTeams(alumnos) {
  const n = alumnos.length;
  const numTeams = Math.max(1, Math.round(n / 5));
  const base = Math.floor(n / numTeams);
  const extra = n % numTeams;

  const duals = alumnos.filter(a => esMMFD(a));
  const noDuals = alumnos.filter(a => !esMMFD(a));
  const orderedAlumnos = [...noDuals, ...duals];

  const teams = [];
  let idx = 0;
  for (let t = 0; t < numTeams; t++) {
    const size = base + (t < extra ? 1 : 0);
    const miembros = orderedAlumnos.slice(idx, idx + size);
    teams.push({ miembros, tieneMMFD: miembros.some(esMMFD) });
    idx += size;
  }
  return teams;
}

function calcularEquipo(alumnos, targetDate, cancelados) {
  const teams = buildTeams(alumnos);
  if (!teams.length) return [];

  teams.forEach((t,i)=>{t.id='T'+i;});
  const counts=new Map();
  const lastSeq=new Map();
  teams.forEach((t,i)=>{counts.set(t.id,0);lastSeq.set(t.id,i-teams.length);});

  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const inicio = new Date(ROTACION_INICIO.y, ROTACION_INICIO.m, ROTACION_INICIO.d);
  const d = new Date(inicio);
  let seq = 0;

  while (d <= target) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !cancelados[fkey(d)]) {
      const restr = dow === 1 || dow === 2;
      
      let minCount=Infinity;
      teams.forEach(t=>{
        if(restr && t.tieneMMFD) return;
        const c=counts.get(t.id);
        if(c<minCount) minCount=c;
      });

      let chosen=null; let oldestSeq=Infinity; let firstIdTie=Infinity;
      teams.forEach((t,i)=>{
        if(restr && t.tieneMMFD) return;
        if(counts.get(t.id)===minCount){
          const ls=lastSeq.get(t.id);
          if(ls<oldestSeq) { oldestSeq=ls; chosen=t; firstIdTie=i; }
          else if(ls===oldestSeq && chosen && i < firstIdTie) { oldestSeq=ls; chosen=t; firstIdTie=i; }
        }
      });

      if(chosen){
        counts.set(chosen.id, counts.get(chosen.id)+1);
        lastSeq.set(chosen.id, seq++);
        if (fkey(d) === fkey(target)) return chosen.miembros;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return [];
}

async function fbGet(path) {
  const res = await fetch(`${FIREBASE_DB}/${path}.json?auth=${FIREBASE_SECRET}`);
  if (!res.ok) throw new Error(`Firebase ${path}: ${res.status} ${await res.text()}`);
  return await res.json();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function corsPreflightResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
