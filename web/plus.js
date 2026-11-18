/* Value Finder – Zusatzfunktionen: Depot, Kursalarme, Termine, Marktüberblick, Sparplan-Rechner, Qualitätsfilter.
   Das Depot liegt verschlüsselt (AES-256-GCM) im Repository. Den Schlüssel kennen nur deine verbundenen Geräte. */
"use strict";
const PLUS = (() => {
  const host = location.hostname.split(".")[0], seg = location.pathname.split("/").filter(Boolean)[0];
  const REPO = window.VF_REPO || (location.hostname.endsWith("github.io") ? `${host}/${seg}` : "jannis1307/value-finder");
  const SITE = location.origin + "/" + (seg && location.hostname.endsWith("github.io") ? seg + "/" : "");
  const P = { key:null, keyText:null, token:null, ntfy:null, pf:null, sha:null, depot:null, loaded:false, loading:false, err:null, vtab:"Branche", chart:null };
  const st = { get:(k,d)=>{ try{ const v=localStorage.getItem("vf_"+k); return v==null?d:JSON.parse(v);}catch(e){return d;} },
               set:(k,v)=>{ try{ localStorage.setItem("vf_"+k, JSON.stringify(v)); }catch(e){} } };

  /* ---------- Krypto ---------- */
  const b64e = buf => { const b=new Uint8Array(buf); let s=""; for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode(...b.subarray(i,i+0x8000)); return btoa(s); };
  const b64d = str => { str=String(str).replace(/\s/g,"").replace(/-/g,"+").replace(/_/g,"/"); while(str.length%4) str+="="; const bin=atob(str); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; };
  async function importKey(txt){ return crypto.subtle.importKey("raw", b64d(txt), "AES-GCM", false, ["encrypt","decrypt"]); }
  async function dec(text){ const d=JSON.parse(text); const pt=await crypto.subtle.decrypt({name:"AES-GCM", iv:b64d(d.iv)}, P.key, b64d(d.ct)); return JSON.parse(new TextDecoder().decode(pt)); }
  async function enc(obj){ const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:"AES-GCM", iv}, P.key, new TextEncoder().encode(JSON.stringify(obj))); return JSON.stringify({v:1, iv:b64e(iv), ct:b64e(ct)}); }

  /* ---------- GitHub ---------- */
  async function gh(method, path, body){
    const h = {"Accept":"application/vnd.github+json"}; if(P.token) h.Authorization = "Bearer "+P.token;
    const r = await fetch("https://api.github.com/repos/"+REPO+path, {method, headers:h, body: body?JSON.stringify(body):undefined, cache:"no-store"});
    let j=null; try{ j=await r.json(); }catch(e){}
    return {status:r.status, j};
  }
  async function ghFile(path){
    const r = await gh("GET", "/contents/"+path+"?ts="+Date.now());
    if(r.status!==200) return {status:r.status};
    return {status:200, sha:r.j.sha, text:new TextDecoder().decode(b64d(r.j.content))};
  }

  /* ---------- Hilfen ---------- */
  const E = (x, d=0) => x==null ? "–" : new Intl.NumberFormat("de-DE",{minimumFractionDigits:d, maximumFractionDigits:d}).format(x)+" €";
  const Es = (x, d=0) => x==null ? "–" : (x>0?"+":"")+E(x,d);
  const toNum = v => { if(v==null) return null; let s=String(v).trim().replace(/[€$\s%]/g,""); if(!s) return null;
    if(s.includes(",") && s.includes(".")) s = s.lastIndexOf(",")>s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
    else if(s.includes(",")) s = s.replace(",","."); const n=parseFloat(s); return isNaN(n)?null:n; };
  const uid = () => Math.random().toString(36).slice(2,9);
  function toast(msg, ms=3500){ let t=document.getElementById("vf-toast"); if(!t){ t=document.createElement("div"); t.id="vf-toast"; document.body.appendChild(t); }
    t.textContent=msg; t.className="show"; clearTimeout(t._h); t._h=setTimeout(()=>t.className="", ms); }
  function sheet(html){ $("#sheet").innerHTML = html; $("#ov").classList.add("open"); document.body.style.overflow="hidden";
    $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeDetail); }
  const head = (title, sub="") => `<div class="shead"><div style="min-width:0"><h2>${title}</h2>${sub?`<div class="sub" style="white-space:normal">${sub}</div>`:""}</div><button class="iconbtn x" data-close aria-label="Schließen">✕</button></div>`;
  function loadScript(src){ return new Promise((res,rej)=>{ if(document.querySelector(`script[src="${src}"]`)) return res(); const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  async function qr(el, text){ try{ await loadScript("qrcode.min.js"); el.innerHTML=""; new QRCode(el, {text, width:200, height:200, correctLevel:QRCode.CorrectLevel.M}); }catch(e){ el.textContent="QR-Code konnte nicht geladen werden."; } }
  const bars = (rows, fmt) => rows.map(([k,v,p])=>`<div class="bar" style="grid-template-columns:130px 1fr 92px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k)}</span><div class="tr"><div class="fi" style="width:${Math.max(1,Math.round(p*100))}%"></div></div><span class="v">${fmt(v,p)}</span></div>`).join("");

  /* ---------- App-Sperre (Face ID / Fingerabdruck / PIN) ----------
     Der Depot-Schlüssel liegt dann NICHT mehr im Klartext auf dem Gerät, sondern verschlüsselt:
     bei Face ID mit einem Geheimnis, das nur der Secure-Enclave-Passkey liefert (WebAuthn PRF), bei PIN per PBKDF2. */
  const LOCK = (() => {
    const rnd = n => crypto.getRandomValues(new Uint8Array(n));
    const b64u = b => b64e(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    async function aesAusPrf(prf){ const base = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey({name:"HKDF", hash:"SHA-256", salt:new TextEncoder().encode("value-finder-lock"), info:new Uint8Array()}, base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]); }
    async function aesAusPin(pin, salt, iter){ const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
      return crypto.subtle.deriveKey({name:"PBKDF2", hash:"SHA-256", salt, iterations:iter}, base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]); }
    async function zu(k, text){ const iv = rnd(12); const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, k, new TextEncoder().encode(text)); return {iv:b64e(iv), ct:b64e(ct)}; }
    async function auf(k, o){ return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:b64d(o.iv)}, k, b64d(o.ct))); }
    async function prfHolen(credId, salt){
      const a = await navigator.credentials.get({publicKey:{challenge:rnd(32), rpId:location.hostname, userVerification:"required", timeout:60000,
        allowCredentials:[{type:"public-key", id:b64d(credId)}], extensions:{prf:{eval:{first:salt}}}}});
      const r = a && a.getClientExtensionResults && a.getClientExtensionResults().prf;
      if(!r || !r.results || !r.results.first) throw new Error("PRF");
      return new Uint8Array(r.results.first);
    }
    const status = () => { const l = st.get("lock", null); return l ? (l.art || "faceid") : null; };
    const bioName = () => { const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1;
      if(/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return "Face ID";
      if(/Macintosh|Mac OS X/.test(ua)) return "Touch ID";
      if(/Android/.test(ua)) return "Fingerabdruck";
      if(/Windows/.test(ua)) return "Windows Hello";
      return "Fingerabdruck"; };
    async function einrichtenFaceID(){
      if(!P.keyText) throw new Error("Kein Schlüssel auf diesem Gerät.");
      if(!window.PublicKeyCredential) throw new Error("Dieser Browser kann kein Face ID / Passkey.");
      const cred = await navigator.credentials.create({publicKey:{challenge:rnd(32), rp:{name:"Value Finder", id:location.hostname},
        user:{id:rnd(16), name:"Value Finder Depot", displayName:"Value Finder Depot"}, pubKeyCredParams:[{type:"public-key", alg:-7},{type:"public-key", alg:-257}],
        authenticatorSelection:{authenticatorAttachment:"platform", userVerification:"required", residentKey:"required"}, timeout:60000, extensions:{prf:{}}}});
      const credId = b64u(new Uint8Array(cred.rawId)), salt = rnd(32);
      let prf;
      try{ prf = await prfHolen(credId, salt); }catch(e){ throw new Error(e.message==="PRF" ? "Dieser Browser unterstützt das sichere Verfahren (WebAuthn PRF) hier nicht. Am Mac klappt es in Safari; in Chrome nur, wenn der Passkey im iCloud-Schlüsselbund gespeichert wird. Sonst nimm eine PIN." : bioName()+" abgebrochen."); }
      const k = await aesAusPrf(prf), box = await zu(k, P.keyText);
      if(await auf(k, box) !== P.keyText) throw new Error("Probe fehlgeschlagen");
      st.set("lock", Object.assign({v:1, art:"faceid", cred:credId, salt:b64e(salt)}, box)); localStorage.removeItem("vf_key");
    }
    async function einrichtenPIN(pin){
      if(!P.keyText) throw new Error("Kein Schlüssel auf diesem Gerät.");
      if(!/^\d{6,12}$/.test(pin)) throw new Error("Die PIN braucht 6 bis 12 Ziffern.");
      const salt = rnd(16), iter = 600000, k = await aesAusPin(pin, salt, iter), box = await zu(k, P.keyText);
      st.set("lock", Object.assign({v:1, art:"pin", salt:b64e(salt), iter}, box)); localStorage.removeItem("vf_key");
    }
    function aus(){ if(!P.keyText) return; st.set("key", P.keyText); localStorage.removeItem("vf_lock"); }
    // Gerät verbinden: Der Link enthält den Schlüssel nur verschlüsselt, der 8-stellige Code (40 Bit) steht nur auf dem Bildschirm.
    // Code aus 8 Zeichen (Ziffern + Buchstaben ohne I, L, O, U): 32^8 ≈ 1 Billion Möglichkeiten statt 100 Mio.
    const ABC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const codeNorm = c => String(c||"").toUpperCase().replace(/[\s\-]/g,"").replace(/O/g,"0").replace(/[IL]/g,"1");
    async function paarLink(){
      const code = Array.from(rnd(8), b=>ABC[b & 31]).join(""), salt = rnd(16), iv = rnd(12);
      const k = await aesAusPin(code, salt, 600000);
      const ct = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv}, k, new TextEncoder().encode(JSON.stringify({k:P.keyText, t:Date.now()}))));
      const all = new Uint8Array(28 + ct.length); all.set(salt); all.set(iv, 16); all.set(ct, 28);
      return {link: SITE + "#pair=" + b64u(all), code};
    }
    async function paarEinloesen(blob, code){
      const all = b64d(blob), k = await aesAusPin(codeNorm(code), all.slice(0,16), 600000);
      const o = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:all.slice(16,28)}, k, all.slice(28))));
      if(Date.now() - o.t > 15*60000) throw new Error("abgelaufen");
      return o.k;
    }
    function codeBild(blob){
      return new Promise(res => {
        const d = document.createElement("div"); d.id = "vf-lock";
        d.innerHTML = `<div class="lk"><div class="lk-logo">📱</div><h2>Gerät verbinden</h2>
          <div class="lk-sub" style="margin:-8px 0 14px">Gib den 8-stelligen Code (Zahlen und Buchstaben) ein, der auf deinem anderen Gerät angezeigt wird.</div>
          <input id="lk-pin" type="text" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="XXXX XXXX" maxlength="11">
          <button id="lk-go">Verbinden</button><div id="lk-err"></div><a id="lk-ohne">Abbrechen</a></div>`;
        document.body.appendChild(d); document.body.style.overflow = "hidden";
        const i = d.querySelector("#lk-pin"); i.focus();
        const fertig = v => { d.remove(); document.body.style.overflow = ""; res(v); };
        const los = async () => { const b = d.querySelector("#lk-go"); b.disabled = true; d.querySelector("#lk-err").textContent = "Prüfe …";
          try{ fertig(await paarEinloesen(blob, i.value)); }
          catch(e){ b.disabled = false; d.querySelector("#lk-err").textContent = e.message==="abgelaufen" ? "Der Code ist abgelaufen. Lass dir auf dem anderen Gerät einen neuen anzeigen." : "Falscher Code."; } };
        d.querySelector("#lk-go").onclick = los; i.onkeydown = e => { if(e.key==="Enter") los(); };
        d.querySelector("#lk-ohne").onclick = () => fertig(null);
      });
    }
    async function entsperren(pin){
      const l = st.get("lock", null); if(!l) return null;
      const k = l.art==="pin" ? await aesAusPin(pin, b64d(l.salt), l.iter) : await aesAusPrf(await prfHolen(l.cred, b64d(l.salt)));
      return auf(k, l);
    }
    function sperrbild(){
      return new Promise(res => {
        const l = st.get("lock", null), pin = l.art==="pin";
        const d = document.createElement("div"); d.id = "vf-lock";
        d.innerHTML = `<div class="lk"><div class="lk-logo">🔒</div><h2>Value Finder ist gesperrt</h2>
          ${pin?`<input id="lk-pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">`:""}
          <button id="lk-go">${pin?"Entsperren":"Mit "+bioName()+" entsperren"}</button><div id="lk-err"></div>
          <div class="lk-sub">Deine Depotdaten sind verschlüsselt, bis du entsperrst. Der Marktscanner funktioniert auch ohne.</div>
          <a id="lk-ohne">Ohne Depot weiter</a></div>`;
        document.body.appendChild(d); document.body.style.overflow = "hidden";
        const fertig = txt => { d.remove(); document.body.style.overflow = ""; res(txt); };
        const los = async () => { const btn = d.querySelector("#lk-go"); btn.disabled = true; d.querySelector("#lk-err").textContent = "";
          try{ fertig(await entsperren(pin ? d.querySelector("#lk-pin").value : null)); }
          catch(e){ btn.disabled = false; d.querySelector("#lk-err").textContent = pin ? "Falsche PIN." : "Nicht entsperrt. Nochmal versuchen."; } };
        d.querySelector("#lk-go").onclick = los;
        if(pin){ const i = d.querySelector("#lk-pin"); i.focus(); i.onkeydown = e => { if(e.key==="Enter") los(); }; }
        d.querySelector("#lk-ohne").onclick = () => fertig(null);
      });
    }
    // Nach einiger Zeit im Hintergrund: Schlüssel aus dem Speicher werfen (Seite neu laden -> Sperrbild)
    let weg = 0;
    document.addEventListener("visibilitychange", () => {
      if(!st.get("lock", null)) return;
      if(document.hidden){ weg = Date.now(); return; }
      const min = st.get("lock_min", 5);
      if(weg && Date.now()-weg > min*60000){ location.reload(); }
    });
    const css = document.createElement("style");
    css.textContent = `#vf-lock{position:fixed;inset:0;z-index:9999;background:var(--bg,#0f1720);display:flex;align-items:center;justify-content:center;padding:24px}
#vf-lock .lk{max-width:340px;width:100%;text-align:center;color:var(--ink)}#vf-lock .lk-logo{font-size:44px}#vf-lock h2{margin:8px 0 18px;font-size:20px}
#vf-lock input{width:100%;box-sizing:border-box;font-size:22px;letter-spacing:.3em;text-align:center;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);margin-bottom:10px}
#vf-lock button{width:100%;padding:13px;border:0;border-radius:12px;background:var(--acc,#0e9f8a);color:#fff;font-size:16px;font-weight:700;cursor:pointer}
#vf-lock #lk-err{color:var(--down,#d93a3a);min-height:20px;margin-top:8px;font-size:14px}#vf-lock .lk-sub{color:var(--mut);font-size:13px;margin-top:10px}
#vf-lock a{display:inline-block;margin-top:14px;color:var(--mut);font-size:13px;text-decoration:underline;cursor:pointer}`;
    document.head.appendChild(css);
    return { status, bioName, einrichtenFaceID, einrichtenPIN, aus, sperrbild, paarLink, codeBild };
  })();

  /* ---------- Gerät verbinden ---------- */
  async function paarAusHash(){
    const p = location.hash.match(/pair=([A-Za-z0-9_\-]+)/); if(!p) return false;
    history.replaceState(null, "", location.pathname + "#depot");
    const k = await LOCK.codeBild(p[1]); if(!k) return false;
    st.set("key", k); localStorage.removeItem("vf_lock"); P.keyText = k; toast("✓ Gerät verbunden – richte jetzt unter ⚙️ die App-Sperre ein"); return true;
  }
  async function init(){
    await paarAusHash();
    const m = location.hash.match(/key=([A-Za-z0-9_\-]+)/);
    if(m){ st.set("key", m[1]); history.replaceState(null, "", location.pathname + "#depot"); toast("✓ Gerät verbunden"); }
    if(m) localStorage.removeItem("vf_lock");   // neu verbundenes Gerät: alte Sperre gehört zum alten Schlüssel
    P.keyText = st.get("key", null);
    if(!P.keyText && LOCK.status()){ P.keyText = await LOCK.sperrbild(); }
    if(P.keyText){ try{ P.key = await importKey(P.keyText); }catch(e){ P.key=null; P.err="Ungültiger Schlüssel"; } }
  }
  const ready = init();
  window.addEventListener("hashchange", async () => {
    if(/pair=/.test(location.hash)){ if(await paarAusHash()){ try{ P.key = await importKey(P.keyText); }catch(e){} P.loaded = false; P.token = null; render(); loadDepot(true); } return; }
    const m = location.hash.match(/key=([A-Za-z0-9_\-]+)/); if(!m) return;
    st.set("key", m[1]); P.keyText = m[1]; localStorage.removeItem("vf_lock");
    try{ P.key = await importKey(m[1]); }catch(e){ return toast("Ungültiger Schlüssel"); }
    P.loaded = false; P.token = null; history.replaceState(null, "", location.pathname + "#depot");
    toast("✓ Gerät verbunden"); render(); loadDepot(true);
  });

  async function loadDepot(force){
    await ready;
    if(!P.key || P.loading) return;
    if(P.loaded && !force && Date.now()-P.loaded < 4*60*1000) return;
    P.loading = true;
    try{
      if(!P.token){ const z = await ghFile("depot/zugang.enc").catch(()=>({status:0})); if(z.status===200){ const zz = await dec(z.text); P.token=zz.token||null; P.ntfy=zz.ntfy||null; } }
      const f = await ghFile("depot/portfolio.enc").catch(()=>({status:0}));
      if(f.status===200){ P.pf = await dec(f.text); P.sha = f.sha; P.pfBase = JSON.stringify(P.pf); try{ localStorage.setItem("vf_pfenc", f.text); }catch(e){} }
      else if(f.status===0 && !P.pf && localStorage.getItem("vf_pfenc")){ P.pf = await dec(localStorage.getItem("vf_pfenc")); }
      else if(f.status===404){ P.pf = P.pf || {v:1, positionen:[], alarme:[], einstellungen:{}}; P.sha=null; }
      else if(!P.pf) throw new Error("GitHub antwortet mit "+f.status);
      try{ const r = await fetch("depot.enc?ts="+Date.now(), {cache:"no-store"}); if(r.ok){ const t = await r.text();
        try{ P.depot = await dec(t); if(st.get("key_alt", null)){ st.set("key_alt", null); P.keyWechselFertig = true; } }
        catch(e){ const alt = st.get("key_alt", null); if(alt){ const k = await importKey(alt); const d = JSON.parse(t);   // nach Schlüsselwechsel: Server rechnet noch mit dem alten
          P.depot = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:b64d(d.iv)}, k, b64d(d.ct)))); } } } }catch(e){}
      P.err = null; P.loaded = Date.now();
    }catch(e){ P.err = e.message.includes("decrypt")||e.name==="OperationError" ? "Schlüssel passt nicht zum Depot." : e.message; }
    P.loading = false;
    if(typeof PLUS2!=="undefined" && P.pf) PLUS2.afterLoad();
    if(typeof PLUS3!=="undefined" && P.pf) PLUS3.afterLoad();
    const v = view(); if(["depot","termine","chancen","dividenden","datencheck"].includes(v) || (typeof PLUS3!=="undefined" && PLUS3.DEPOT_VIEWS.includes(v))) render();
    if(P.depot) liveKurse();
  }

  // ---------- Live-Kurse: Lang & Schwarz über den eigenen Cloudflare-Worker (wie getquin, ohne GitHub-Umweg)
  // Der Worker bekommt nur ISINs bzw. L&S-Nummern – nie Stückzahlen oder Werte. Gerechnet wird hier auf dem Gerät.
  const LIVE_URL = "https://vf-kurse.jannis1307.workers.dev";
  let liveLaeuft = false;
  async function liveKurse(){
    const D = P.depot;
    if(!D || liveLaeuft || document.hidden || !/^https:/.test(LIVE_URL)) return;
    const Z = (D.positionen||[]).filter(z=>!z.manuell && z.isin && z.stk);
    if(!Z.length) return;
    liveLaeuft = true;
    try{
      const isin = z => String(z.isin).trim().toUpperCase();
      const ids = st.get("ls_ids", {});
      const fehlt = [...new Set(Z.map(isin).filter(i=>!(i in ids) || (ids[i]===0 && Date.now()-(ids["_t_"+i]||0) > 2*864e5)))];
      // In kleinen Paketen anfragen: der Gratis-Tarif von Cloudflare erlaubt nur ~10 ms Rechenzeit je Aufruf
      const pakete = (L, n) => { const o = []; for(let k=0;k<L.length;k+=n) o.push(L.slice(k,k+n)); return o; };
      const holen = async (pfad, L, n=5) => { const out = {}; let ok = false;
        await Promise.all(pakete(L, n).map(async teil => { try{ const r = await fetch(LIVE_URL+pfad+teil.join(","), {cache:"no-store"}); if(r.ok){ Object.assign(out, await r.json()); ok = true; } }catch(e){} }));
        return ok ? out : null; };
      if(fehlt.length){
        const j = await holen("/ids?isin=", fehlt);
        if(j){ for(const i of fehlt) if(i in j){ ids[i] = j[i]||0; ids["_t_"+i] = Date.now(); } st.set("ls_ids", ids); }
      }
      P.lsIds = ids;
      const liste = [...new Set(Z.map(z=>ids[isin(z)]).filter(Boolean))];
      if(!liste.length) return;
      // Tagesverlauf (für „1T“): alle 10 Minuten komplett, dazwischen nur den neuesten Kurs anhängen
      const heuteTag = new Date().toDateString();
      const reihe = !P.intra || P.intra.tag !== heuteTag || Date.now() - P.intra.zeit > 10*60000 || liste.some(i=>!P.intra.r[i]);
      const K = await holen((reihe?"/kurse?reihe=1&id=":"/kurse?id="), liste, reihe ? 2 : 5);   // Tagesverlauf ist rechenintensiver
      if(!K) return;
      if(reihe){ P.intra = {tag: heuteTag, zeit: Date.now(), r: {}}; for(const [i,k] of Object.entries(K)) if(k && k.r && k.r.length) P.intra.r[i] = {vt: k.vt, r: k.r}; }
      else for(const [i,k] of Object.entries(K)){ const x = P.intra.r[i]; if(x && k && k.heute && k.p && k.ts > x.r.at(-1)[0]) x.r.push([k.ts, k.p]); }
      if(P.depot !== D) return;   // inzwischen neu geladen
      let n = 0, zeit = 0;
      for(const z of Z){
        const k = K[ids[isin(z)]];
        if(!k || !k.p || !k.heute || !k.vt) continue;              // heute noch kein Handel: Server-Wert bleibt
        if(z._p_server==null) z._p_server = z.p_eur;
        if(!z._p_server || Math.abs(k.p/z._p_server-1) > 0.05) continue;   // passt nicht zum Server-Kurs: lieber nicht
        if(!(0.6 < k.p/k.vt && k.p/k.vt < 1.6)) continue;
        z.p_eur = k.p; z.wert = z.stk*k.p; z.wert_gestern = z.stk*k.vt; z.r1d = k.p/k.vt-1; z.r1d_eur = z.r1d;
        if(z.einstand){ z.gv = z.wert - z.einstand; z.gv_pct = z.gv / z.einstand; }
        z.kurs_zeit = new Date(k.ts).toISOString(); z.live = true; n++; zeit = Math.max(zeit, k.ts);
      }
      if(!n) return;
      const S = D.summe || (D.summe = {}), alle = D.positionen||[];
      if(D._wert_server == null) D._wert_server = S.wert;
      S.wert = alle.reduce((a,z)=>a+(z.wert||0),0);
      S.gestern = alle.reduce((a,z)=>a+(z.wert_gestern||z.wert||0),0);
      S.heute = S.wert - S.gestern; S.heute_pct = S.gestern ? S.heute/S.gestern : null;
      const mitE = alle.filter(z=>z.einstand);
      if(mitE.length){ const e = mitE.reduce((a,z)=>a+z.einstand,0); S.gv = mitE.reduce((a,z)=>a+(z.wert-z.einstand),0); S.gv_pct = e ? S.gv/e : null; }
      for(const z of alle) z.anteil = S.wert ? (z.wert||0)/S.wert : 0;
      D._live = {n, zeit};
      // nur neu zeichnen, wenn niemand gerade tippt oder ein Fenster offen hat
      const ae = document.activeElement, offen = document.querySelector("#ov.open");
      if(!(ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) && !offen && ["depot","datencheck"].includes(view())){
        const y = window.scrollY; render(); window.scrollTo(0, y);
      }
    }catch(e){ /* Worker nicht erreichbar: es bleiben die Werte vom Server */ }
    finally{ liveLaeuft = false; }
  }
  setInterval(liveKurse, 60*1000);

  // ---------- Entwicklung wie bei getquin: 1T (Live-Verlauf von L&S), 1W (Server-Schnappschüsse), 1M … Max (Transaktionen)
  const ER = ["1T","1W","1M","YTD","1J","Max"];
  const zeitTxt = x => new Date(x).toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"});
  const tagZeit = x => new Date(x).toLocaleString("de-DE", {weekday:"short", day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"});
  // Depotwert über den heutigen Tag: Stückzahl × Kurs je Minute, Positionen ohne Live-Kurs konstant
  function tagesKurve(D){
    if(!P.intra || !P.lsIds || P.intra.tag !== new Date().toDateString()) return null;
    let fix = 0, vt = 0; const L = [];
    for(const z of (D.positionen||[])){
      const id = z.isin && P.lsIds[String(z.isin).trim().toUpperCase()], x = id && P.intra.r[id];
      if(z.live && x && x.r.length && x.vt){ L.push({stk: z.stk, r: x.r, vt: x.vt}); vt += z.stk * x.vt; }
      else { fix += z.wert || 0; vt += (z.wert_gestern || z.wert || 0); }
    }
    if(!L.length) return null;
    const T = [...new Set(L.flatMap(x=>x.r.map(p=>p[0])))].sort((a,b)=>a-b), ix = L.map(()=>-1), d = [];
    for(const t of T){ let v = fix;
      L.forEach((x,i)=>{ while(ix[i]+1 < x.r.length && x.r[ix[i]+1][0] <= t) ix[i]++; v += x.stk * (ix[i] >= 0 ? x.r[ix[i]][1] : x.vt); });
      d.push([new Date(t).toISOString(), v]); }
    return d.length >= 2 ? {d, vt} : null;
  }
  function entwicklungBox(D, S){
    if(!D || !S || typeof PLUS2 === "undefined") return "";
    const TX = D.tx && (D.tx.daten||[]).length >= 2 ? D.tx : null;
    let r = P.erange || st.get("erange", "1T"); if(!ER.includes(r)) r = "1T";
    const seg = `<span class="seg">${ER.map(k=>`<a data-er="${k}" class="${k===r?"on":""}">${k}</a>`).join("")}</span>`;
    const leer = t => `<div class="box"><h3>Entwicklung ${seg}</h3><div class="sub" style="padding:24px 0;text-align:center;white-space:normal">${t}</div></div>`;
    // Anzeige-Optionen (Standard: aus) – Vortageslinie und Wert-Schild am rechten Rand
    const eo = Object.assign({vt:false, wert:false, inv:true, msci:false}, st.get("eopt", {}));
    const opts = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${[["vt","Vortag-Linie", r==="1T"],["inv","Investiert-Linie", r!=="1T"],["msci","MSCI-Vergleich", !["1T","1W"].includes(r)],["wert","Wert am Rand", true]].filter(x=>x[2]).map(([k,t])=>
      `<a data-eo="${k}" role="button" style="font-size:12px;padding:3px 10px;border-radius:999px;cursor:pointer;user-select:none;background:${eo[k]?"var(--ink)":"var(--soft)"};color:${eo[k]?"var(--card)":"var(--mut)"}">${eo[k]?"✓ ":""}${t}</a>`).join("")}</div>`;
    const jetztInv = TX ? TX.eingezahlt.at(-1) : null;
    // Die Transaktions-Rechnung kennt manuell bewertete Positionen (Anleihen, ELTIF) nicht und nutzt Schlusskurse:
    // den Unterschied zum aktuellen Server-Wert als festen Betrag addieren, damit beim Übergang kein Schein-Gewinn entsteht
    const wS = D._wert_server != null ? D._wert_server : S.wert;
    const off = TX && Math.abs(wS - TX.wert.at(-1)) < 0.03*wS ? wS - TX.wert.at(-1) : 0;
    let html = "";
    if(r === "1T"){
      const k = tagesKurve(D);
      if(!k) return leer("Heute gibt es noch keinen Tagesverlauf – L&S handelt ab 7:30 Uhr. Die Kurve füllt sich, solange die App offen ist und Kurse kommen.");
      html = PLUS2.chart(k.d, null, null, {key:"ent1t", name:"Depot", ranges:[], range:"Max", dlab: tagZeit, flab: zeitTxt, ref: eo.vt ? {v: k.vt, label:"Vortag"} : null, basis: k.vt, ohneWert: !eo.wert});
    } else if(r === "1W"){
      const ab = Date.now() - 7*864e5, I = (D.intraday||[]).filter(x=>new Date(x[0]) >= ab && x[1] > 0);
      let pkt = I.map(x=>[x[0], x[1], x[2]]);
      // Tage vor dem ersten Schnappschuss: Tageswerte aus den Transaktionen (Stand 22 Uhr)
      if(TX){ const erst = pkt.length ? new Date(pkt[0][0]) : new Date();
        const tage = TX.daten.map((d,i)=>[new Date(d+"T21:00:00Z"), TX.wert[i]+off, TX.eingezahlt[i]]).filter(x=>x[0] >= ab && x[0] < erst).map(x=>[x[0].toISOString(), x[1], x[2]]);
        pkt = tage.concat(pkt); }
      const heute = tagesKurve(D);   // heute minutengenau aus dem Live-Verlauf
      if(heute){ const t0 = heute.d[0][0]; pkt = pkt.filter(x=>x[0] < t0).concat(heute.d.map(x=>[x[0], x[1], jetztInv])); }
      else pkt.push([new Date().toISOString(), S.wert, jetztInv]);
      if(pkt.length < 2) return leer("Noch zu wenig Daten für diese Woche.");
      const e = pkt.map(x=>x[2]), mitE = e.every(v=>v>0);
      html = PLUS2.chart(pkt.map(x=>[x[0], x[1]]), null, mitE ? e : null, {key:"ent1w", name:"Depot", ranges:[], range:"Max", flows: mitE, zr: true, eHide: true, eLinie: eo.inv, ohneWert: !eo.wert, dlab: tagZeit,
        flab: x => new Date(x).toLocaleDateString("de-DE", {weekday:"short", day:"2-digit", month:"2-digit"})});
    } else {
      if(!TX) return leer("Für diese Ansicht brauche ich deine Transaktionen (Depot → Transaktionen importieren).");
      const heuteS = new Date().toISOString().slice(0,10), jahr = new Date().getFullYear();
      const ab = r === "Max" ? "0000" : r === "YTD" ? (jahr-1)+"-12-31" : new Date(Date.now() - (r==="1M"?31:366)*864e5).toISOString().slice(0,10);
      let i0 = TX.daten.findIndex(d=>d >= ab); if(i0 < 0) i0 = TX.daten.length-2;
      if(r === "YTD"){ const j = TX.daten.findLastIndex(d=>d < jahr+"-01-01"); if(j >= 0) i0 = j; }   // Start: letzter Wert des Vorjahres
      const sl = a => a ? a.slice(i0) : null;
      const d = sl(TX.daten), w = sl(TX.wert).map(v=>v+off), e = sl(TX.eingezahlt), dv = TX.dividenden ? sl(TX.dividenden) : null, m = TX.msci ? sl(TX.msci) : null;
      // heutigen Punkt durch den aktuellen (Live-)Wert ersetzen
      if(d.at(-1) === heuteS){ w[w.length-1] = S.wert; } else { d.push(heuteS); w.push(S.wert); e.push(e.at(-1)); if(dv) dv.push(dv.at(-1)); if(m) m.push(m.at(-1)); }
      if(d.length < 2) return leer("Noch zu wenig Daten für diesen Zeitraum.");
      html = PLUS2.chart(d.map((x,i)=>[x, w[i]]), eo.msci ? m : null, e, {key:"ent"+r, name:"Depot", bname:"MSCI World mit denselben Käufen", ranges:[], range:"Max", rawBench:true, flows:true, zr: r!=="Max", eHide: true, eLinie: eo.inv, ohneWert: !eo.wert, div: dv});
    }
    return `<div class="box"><h3>Entwicklung ${seg}</h3>${html}${opts}</div>`;
  }
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) liveKurse(); });

  // Drei-Wege-Zusammenführung: Was auf diesem Gerät seit dem Laden geändert wurde, gewinnt; alles andere
  // (z. B. auf dem Handy oder Mac inzwischen gespeichert) bleibt erhalten. Listen werden als Ganzes behandelt.
  const istObj = x => x && typeof x === "object" && !Array.isArray(x);
  function zusammen(basis, lokal, fern){
    if(!istObj(lokal) || !istObj(fern)) return lokal;
    const out = Object.assign({}, fern), b = istObj(basis) ? basis : {};
    for(const k of new Set([...Object.keys(lokal), ...Object.keys(b)])){
      if(JSON.stringify(lokal[k]) === JSON.stringify(b[k])) continue;          // hier nicht geändert -> Stand von dort
      if(lokal[k] === undefined) delete out[k];
      else out[k] = (istObj(lokal[k]) && istObj(fern[k])) ? zusammen(b[k], lokal[k], fern[k]) : lokal[k];
    }
    return out;
  }
  async function save(msg, noscan, leise){
    if(!P.token){ toast("Auf diesem Gerät fehlt der Bearbeitungs-Zugang."); return false; }
    let r;
    for(let versuch = 0; versuch < 3; versuch++){
      P.pf.aktualisiert = new Date().toISOString();
      const content = b64e(new TextEncoder().encode(await enc(P.pf)));
      const body = {message: "Depot aktualisiert", content}; if(P.sha) body.sha = P.sha;   // Commit-Texte sind öffentlich: nie Ticker/Beträge hineinschreiben
      r = await gh("PUT", "/contents/depot/portfolio.enc", body);
      if(r.status !== 409 && r.status !== 422) break;
      // Ein anderes Gerät hat inzwischen gespeichert: neuesten Stand holen, Änderungen zusammenführen, nochmal
      const f = await ghFile("depot/portfolio.enc").catch(()=>({status:0}));
      if(f.status !== 200) break;
      const fern = await dec(f.text), basis = P.pfBase ? JSON.parse(P.pfBase) : {};
      delete basis.aktualisiert;
      P.pf = zusammen(basis, P.pf, fern); P.sha = f.sha; P.pfBase = JSON.stringify(fern);
    }
    if(r.status>=300){ toast("Speichern fehlgeschlagen ("+r.status+")"+(r.status===409?": bitte neu laden.":"")); return false; }
    P.sha = r.j.content.sha; P.pfBase = JSON.stringify(P.pf);
    if(noscan){ if(!leise) toast("✓ Gespeichert"); } else scanNow(true);
    return true;
  }
  async function scanNow(silent){
    const r = await gh("POST", "/actions/workflows/scanner.yml/dispatches", {ref:"main"});
    if(r.status===204){ st.set("scan_at", Date.now()); toast(silent ? "✓ Gespeichert. Neue Berechnung läuft, in ca. 3–5 Min. aktuell." : "✓ Scan gestartet, in ca. 3–5 Min. aktuell."); }
    else if(!silent) toast("Scan konnte nicht gestartet werden ("+r.status+").");
    else toast("✓ Gespeichert. Wird beim nächsten Scan berechnet.");
  }

  /* ---------- Marktüberblick ---------- */
  function marktStrip(){
    const M = (DATA && DATA.markt) || []; if(!M.length) return "";
    return `<div class="mstrip">${M.map(m=>`<div class="mcard"><div class="sub">${esc(m.n)}</div><div class="px">${m.t.includes("=X")?F.n(m.p,4):F.n(m.p, m.p>=1000?0:2)}</div>${pill(m.r1d)}</div>`).join("")}</div>`;
  }

  /* ---------- Qualität ---------- */
  const isQual = s => s.marge!=null && s.marge>=0.15 && s.roe!=null && s.roe>=0.15 && (s.uw==null || s.uw>=0) && (s.vol==null || s.vol<=0.35);

  /* ---------- Depot-Ansicht ---------- */
  function merged(){
    const D = P.depot ? Object.fromEntries((P.depot.positionen||[]).map(z=>[z.id,z])) : {};
    return (P.pf?.positionen||[]).map(p => ({p, z:D[p.id]||null})).sort((a,b)=>((b.z?.wert)||0)-((a.z?.wert)||0));
  }
  function renderDepot(){
    if(!window.crypto?.subtle){ $("#main").innerHTML = `<div class="err">Dein Browser unterstützt die Verschlüsselung nicht. Öffne die Seite über https.</div>`; return; }
    if(!P.key && LOCK.status()){
      $("#main").innerHTML = `<div class="box" style="margin-top:14px;text-align:center"><h3>🔒 Depot gesperrt</h3><p>Dein Depot ist auf diesem Gerät mit ${LOCK.status()==="pin"?"deiner PIN":LOCK.bioName()} geschützt.</p>
        <div class="links" style="justify-content:center"><button class="btn" id="lk-re">Entsperren</button></div></div>`;
      $("#lk-re").onclick = () => location.reload(); return;
    }
    if(!P.key){
      const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
      $("#main").innerHTML = `<div class="box" style="margin-top:14px"><h3>Depot</h3>
        <p>Dein Depot ist <b>privat und verschlüsselt</b>. Nur Geräte mit deinem Schlüssel können es sehen.</p>
        ${standalone ? `<p><b>Home-Bildschirm-App:</b> Auf dem iPhone hat sie einen eigenen Speicher, getrennt von Safari – deshalb muss sie einmal extra verbunden werden:</p>
        <ol style="padding-left:20px;line-height:1.6"><li>Öffne die App in <b>Safari</b> (oder auf dem Mac) → <b>⚙️ → „Neues Gerät verbinden“</b> → <b>„Link kopieren“</b> und merk dir den Code.</li><li>Komm hierher zurück und tipp auf <b>„Link einfügen“</b>.</li><li>Code eintippen – fertig.</li></ol>
        <div class="links"><button class="btn" id="pk-clip">📋 Link einfügen</button> <button class="btn ghost" id="pk">Von Hand eingeben</button></div>`
        : `<p>Dieses Gerät ist noch nicht verbunden. Tipp auf einem schon verbundenen Gerät (z. B. MacBook) oben auf <b>⚙️ → „Neues Gerät verbinden“</b>, scanne den QR-Code mit der Kamera dieses Geräts und gib den Code ein.</p>
        <div class="links"><button class="btn ghost" id="pk">Schlüssel einfügen</button></div>`}</div>`;
      const verbinde = async v => { v = String(v||"").trim(); const pm = v.match(/pair=([A-Za-z0-9_\-]+)/); if(pm){ closeDetail(); location.hash = "pair=" + pm[1]; return true; }
        const k=(v.match(/key=([A-Za-z0-9_\-]+)/)||[null, /^[A-Za-z0-9_\-]{40,50}$/.test(v) ? v : null])[1]; if(!k){ toast("Kein Verbindungs-Link gefunden"); return false; }
        try{ P.key=await importKey(k); st.set("key",k); P.keyText=k; closeDetail(); loadDepot(true); render(); toast("✓ Gerät verbunden – richte jetzt unter ⚙️ die App-Sperre ein"); return true; }catch(e){ toast("Ungültiger Schlüssel"); return false; } };
      const pc = $("#pk-clip"); if(pc) pc.onclick = async () => { try{ await verbinde(await navigator.clipboard.readText()); }catch(e){ toast("Einfügen nicht erlaubt – nutze „Von Hand eingeben“"); } };
      $("#pk").onclick = () => { sheet(head("Schlüssel einfügen")+`<p class="sub" style="white-space:normal">Füge den Verbindungs-Link oder nur den Schlüssel ein.</p><input id="pki" class="inp" placeholder="https://…#pair=…"><div class="links"><button class="btn" id="pks">Verbinden</button></div>`);
        $("#pks").onclick = () => verbinde($("#pki").value); };
      return;
    }
    if(!P.loaded){ $("#main").innerHTML = P.err ? `<div class="err">${esc(P.err)}</div>` : `<div class="empty">Depot wird entschlüsselt …</div>`; loadDepot(); return; }
    const D = P.depot, S = D?.summe, L = merged();
    const stale = D && P.pf?.aktualisiert && new Date(P.pf.aktualisiert) > new Date(D.stand);
    const kl = (D?.positionen||[]).filter(z=>z.anteil>0.2);
    const sp = 1000, divj = ((D?.div_monate||[]).reduce((a,b)=>a+b,0)) || S?.div_jahr || 0;
    const echtN = (D?.verlauf_echt||[]).length;
    const TX = D?.tx && (D.tx.daten||[]).length>=2 ? D.tx : null;
    const modus = P.chart || (TX ? "tx" : echtN>=2 ? "echt" : "sim");
    const istTx = modus==="tx" && TX;
    const istEcht = modus==="echt";
    const chartData = istEcht ? (D?.verlauf_echt||[]) : (D?.verlauf||[]);
    const echtSeit = (D?.verlauf_echt||[])[0]?.[0];
    const dtK = d => d ? d.split("-").reverse().join(".") : "";
    $("#main").innerHTML = `${marktStrip()}
    ${P.err?`<div class="err">${esc(P.err)}</div>`:""}
    ${stale?`<div class="notif">⏳ Änderungen gespeichert, die Werte werden gerade neu berechnet.</div>`:""}
    ${!L.length?`<div class="box" style="margin-top:12px"><h3>Noch leer</h3><p>Füge Positionen hinzu oder importiere die CSV-Datei deines Brokers.</p></div>`:""}
    ${S?`<div class="box dsum">
      <div><div class="sub">Depotwert</div><div class="px big2">${E(S.wert)}</div></div>
      <div><div class="sub">Heute${D._live?` <span title="Live-Kurse von Lang & Schwarz für ${D._live.n} Positionen">· live ${new Date(D._live.zeit).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}</span>`:""}</div><div class="px ${cls(S.heute)}">${Es(S.heute)} <small>${F.p(S.heute_pct,2)}</small></div></div>
      <div><div class="sub">Gewinn/Verlust gesamt</div><div class="px ${cls(S.gv)}">${Es(S.gv)} <small>${F.p(S.gv_pct,1)}</small></div></div>
      <div><div class="sub">Dividenden / Jahr (geschätzt)</div><div class="px">${E(divj)} <small>≈ ${E(divj/12)}/Monat</small></div>
        <div class="tr" style="margin-top:6px" title="Fortschritt zum Sparerpauschbetrag (1.000 €)"><div class="fi" style="width:${Math.min(100,divj/sp*100)}%"></div></div>
        <div class="sub">${Math.round(divj/sp*100)} % vom Sparerpauschbetrag (1.000 €)</div></div>
    </div>
    ${entwicklungBox(D, S)}
    <div class="box"><h3>Verlauf <span class="seg">${TX?`<a data-c="tx" class="${istTx?"on":""}">Seit Start</a>`:""}<a data-c="echt" class="${istEcht?"on":""}">${TX?"Gesamt":"Echt"}</a><a data-c="sim" class="${!istTx&&!istEcht?"on":""}">Simulation 1 J.</a></span></h3>
      ${istTx ? PLUS2.chart(TX.daten.map((d,i)=>[d,TX.wert[i]]), TX.msci, TX.eingezahlt, {key:"tx", name: "Depot ("+TX.broker.join(" + ")+")", bname:"MSCI World mit denselben Käufen", rawBench:true, flows:true, div:TX.dividenden})
      : istEcht && echtN<2 ? `<div class="notif" style="white-space:normal">📅 Dein echter Depotwert wird seit ${dtK(echtSeit)} jeden Tag gespeichert – zusammen mit deinem eingezahlten Geld. Ab morgen siehst du hier die Kurve, danach wächst sie jeden Tag. Bis dahin zeigt „Simulation 1 J.“ eine Rückrechnung.</div>`
      : (typeof PLUS2!=="undefined" ? PLUS2.chart(chartData, istEcht ? null : D.benchmark, istEcht ? D.einzahl_echt : null, {key: istEcht?"echt":"sim", name: istEcht ? "Depotwert" : "Heutige Positionen"}) : `<div class="sub">Noch zu wenig Daten.</div>`)}
      <div class="sub" style="white-space:normal;margin-top:6px">${istTx
        ? `✅ Echte Werte aus deinen ${TX.n} Buchungen bei ${esc(TX.broker.join(" und "))} seit ${dtK(TX.seit)}: alle Wertpapiere zum jeweiligen Tageskurs (ohne Bargeld). Grau = investiert (Käufe inkl. Gebühren minus Verkaufserlöse). Gewinn = Wert − investiert + erhaltene Dividenden; die Prozentzahl bezieht sich auf dein investiertes Geld. Gestrichelt: Was passiert wäre, wenn du an denselben Tagen denselben Betrag in den MSCI World gesteckt hättest.`
        : istEcht
        ? `Ganzes Depot (alle Broker), echte Werte, einmal täglich gespeichert seit ${dtK(echtSeit)}. Die graue Fläche ist dein eingezahltes Geld (Kaufwert aller Positionen); der Abstand darüber ist dein Gewinn.`
        : `⚠ Simulation, nicht dein echter Verlauf: So hätten sich deine <b>heutigen</b> Positionen im letzten Jahr entwickelt, als hättest du sie schon vor einem Jahr gehabt (ohne Käufe und Verkäufe). Gestrichelt: derselbe Startbetrag im MSCI World.`} Stand ${F.dt(D.stand)}.</div>
      <div class="links" style="margin-top:8px"><button class="btn ghost" id="tx-imp">📥 ${TX?"Neue Transaktionen importieren":"Transaktionen importieren (Scalable / Trade Republic) – für deinen echten Verlauf"}</button></div></div>
    <div class="box"><h3>Verteilung <span class="seg">${["Branche","Land","Währung"].map(k=>`<a data-v="${k}" class="${P.vtab===k?"on":""}">${k}</a>`).join("")}</span></h3>
      ${bars((D.verteilung?.[P.vtab]||[]).slice(0,10), (v,p)=>`${F.n(p*100,1)} %`)}
      ${kl.length?`<div class="sub" style="white-space:normal;color:var(--warn);margin-top:6px">⚠ Klumpenrisiko: ${kl.map(z=>esc(z.name)+" "+F.n(z.anteil*100,0)+" %").join(", ")} vom Depot.</div>`:""}</div>`:(L.length?`<div class="notif">⏳ Die erste Auswertung läuft. In ein paar Minuten siehst du hier Werte, Verlauf und Verteilung.</div>`:"")}
    ${typeof PLUS2!=="undefined" && S ? PLUS2.depotExtras(D) : ""}
    <div class="dtools">
      <button class="btn" id="d-add">+ Position</button>
      <button class="btn ghost" id="d-csv">CSV importieren</button>
      <button class="btn ghost" id="d-alarm">Kursalarme</button>
      <button class="btn ghost" id="d-set">Benachrichtigungen</button>
      <button class="btn ghost" id="d-pair">📱 Neues Gerät verbinden</button>
      ${P.token?`<button class="btn ghost" id="d-scan">Jetzt neu berechnen</button>`:""}
    </div>
    <div class="list">${L.map(({p,z})=>{
      const w=z?.wert, t=p.t||z?.t||p.isin||"";
      return `<div class="row prow" data-pid="${esc(p.id)}">
        <div class="score ${scoreCls(z?.score)}" title="Chancen-Score">${z?.score==null?(p.manuell!=null?"€":"–"):Math.round(z.score)}</div>
        <div style="min-width:0"><div class="nm">${esc(p.name||t)}</div>
          <div class="sub">${esc(t)}${p.manuell==null?` · ${F.n(p.stk, p.stk%1?3:0)} Stk.`:""}${z?.anteil!=null?` · ${F.n(z.anteil*100,1)} %`:""}${p.broker?` · ${esc(p.broker)}`:""}</div>
          <div class="why">${z?.fehler?`<span style="color:var(--down)">⚠ ${esc(z.fehler)}</span>`:(z?.gv_pct!=null?`G/V <b class="${cls(z.gv)}">${Es(z.gv)} (${F.p(z.gv_pct,1)})</b>`:(z?"":`<span class="sub">wird berechnet …</span>`))}</div></div>
        <div class="right"><span class="px">${E(w)}</span>${z&&p.manuell==null?pill(z.r1d):""}${z?.p!=null?`<span class="sub">${F.cur(z.p,z.cur)}</span>`:""}</div>
      </div>`;}).join("")}</div>
    ${(D?.ereignisse||[]).length?`<div class="box"><h3>Letzte Benachrichtigungen</h3>${D.ereignisse.slice(0,8).map(e=>`<div class="ev"><b>${esc(e.titel)}</b><div class="sub" style="white-space:normal">${esc(e.text)} · ${F.ago(e.zeit)}</div></div>`).join("")}</div>`:""}`;
    document.querySelectorAll(".seg a[data-c]").forEach(a=>a.onclick=()=>{ P.chart=a.dataset.c; renderDepot(); });
    document.querySelectorAll("a[data-eo]").forEach(a=>a.onclick=()=>{ const o = Object.assign({vt:false, wert:false, inv:true, msci:false}, st.get("eopt", {})); o[a.dataset.eo] = !o[a.dataset.eo]; st.set("eopt", o); const y=window.scrollY; renderDepot(); window.scrollTo(0,y); });
    document.querySelectorAll(".seg a[data-er]").forEach(a=>a.onclick=()=>{ P.erange=a.dataset.er; st.set("erange", P.erange); const y=window.scrollY; renderDepot(); window.scrollTo(0,y); });
    if($("#tx-imp")) $("#tx-imp").onclick = () => PLUS2.txImport();
    document.querySelectorAll(".seg a[data-v]").forEach(a=>a.onclick=()=>{ P.vtab=a.dataset.v; renderDepot(); });
    document.querySelectorAll(".prow").forEach(r=>r.onclick=()=>editPos(r.dataset.pid));
    $("#d-add").onclick=()=>editPos(null); $("#d-csv").onclick=csvImport; $("#d-alarm").onclick=()=>alarmSheet();
    $("#d-set").onclick=settings; $("#d-pair").onclick=pair; $("#d-scan")&&($("#d-scan").onclick=()=>scanNow(false));
  }

  /* ---------- Position bearbeiten ---------- */
  function editPos(id, preset){
    const p = id ? P.pf.positionen.find(x=>x.id===id) : Object.assign({id:uid(), stk:null, ek:null}, preset||{});
    const z = (P.depot?.positionen||[]).find(x=>x.id===p.id);
    const man = p.manuell!=null;
    sheet(head(id?esc(p.name||p.t||"Position"):"Neue Position", z&&z.p!=null?`Aktuell ${F.cur(z.p,z.cur)} · Wert ${E(z.wert)}${z.div_jahr?` · Dividende ≈ ${E(z.div_jahr)}/Jahr`:""}`:"")+`
      <div class="form">
        <label>Name<input class="inp" id="f-name" value="${esc(p.name||"")}" placeholder="z. B. JPMorgan Chase"></label>
        <label class="tg"><input type="checkbox" id="f-man" ${man?"checked":""}> Ohne Börsenkurs (z. B. Anleihe, ELTIF): Wert selbst eintragen</label>
        <div id="f-boerse" style="${man?"display:none":""}">
          <label>Ticker <span class="sub">(Yahoo, z. B. JPM, SAP.DE, ETH-EUR)</span> oder ISIN<input class="inp" id="f-t" value="${esc(p.t||p.isin||"")}" placeholder="JPM oder US46625H1005" autocapitalize="characters"></label>
          <div class="sub" id="f-hint" style="white-space:normal"></div>
          <div class="two"><label>Stück<input class="inp" id="f-stk" inputmode="decimal" value="${p.stk!=null?String(p.stk).replace(".",","):""}"></label>
          <label>Einstandskurs € / Stück<input class="inp" id="f-ek" inputmode="decimal" value="${p.ek!=null?String(p.ek).replace(".",","):""}"></label></div>
        </div>
        <div id="f-manu" style="${man?"":"display:none"}"><div class="two">
          <label>Aktueller Wert in €<input class="inp" id="f-wert" inputmode="decimal" value="${p.manuell!=null?String(p.manuell).replace(".",","):""}"></label>
          <label>Art<input class="inp" id="f-typ" value="${esc(p.typ||"")}" placeholder="Anleihe, Fonds, …"></label></div>
          <label>Gekauft für insgesamt € <span class="sub">(optional, für Gewinn/Verlust)</span><input class="inp" id="f-ein" inputmode="decimal" value="${p.einstand!=null?String(p.einstand).replace(".",","):""}"></label></div>
        <label>Broker <span class="sub">(optional)</span><input class="inp" id="f-br" value="${esc(p.broker||"")}" placeholder="Scalable, Trade Republic …"></label>
      </div>
      <div class="links">
        <button class="btn" id="f-save">Speichern</button>
        ${id?`<button class="btn ghost" id="f-del" style="color:var(--down)">Löschen</button>`:""}
        ${p.t&&BY[p.t]?`<button class="btn ghost" id="f-det">Aktien-Details</button>`:""}
        ${p.t?`<button class="btn ghost" id="f-al">Kursalarm</button>`:""}
      </div>`);
    const hint = () => { const v=$("#f-t").value.trim().toUpperCase(); const s=BY[v]; $("#f-hint").innerHTML = s ? `✓ ${esc(s.n)} · ${F.cur(s.p,s.cur)}` : (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v) ? "ISIN: wird beim nächsten Scan automatisch zugeordnet." : (v?"Nicht im Scan enthalten, wird beim nächsten Scan direkt abgefragt.":"")); if(s && !$("#f-name").value) $("#f-name").value=s.n; };
    $("#f-t").oninput = hint; hint();
    $("#f-man").onchange = e => { $("#f-boerse").style.display=e.target.checked?"none":""; $("#f-manu").style.display=e.target.checked?"":"none"; };
    $("#f-save").onclick = async () => {
      // vom bisherigen Eintrag ausgehen, damit Felder ohne Formularfeld (z. B. ISIN, Einstand, Fallback-Wert) erhalten bleiben
      const q = Object.assign({}, id ? p : {}, {id:p.id, name:$("#f-name").value.trim(), broker:$("#f-br").value.trim()||undefined});
      if($("#f-man").checked){ q.manuell = toNum($("#f-wert").value); q.typ=$("#f-typ").value.trim()||"Sonstiges"; if(q.manuell==null) return toast("Bitte einen Wert eintragen.");
        q.einstand = toNum($("#f-ein").value); if(q.einstand==null) delete q.einstand; delete q.t; delete q.stk; delete q.ek; }
      else { const v=$("#f-t").value.trim().toUpperCase(); if(!v) return toast("Bitte Ticker oder ISIN eintragen.");
        delete q.manuell; delete q.typ; delete q.einstand;
        if(/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)){ if(q.isin!==v) delete q.t; q.isin=v; } else { if(q.t!==v) delete q.isin; q.t=v; }
        if(p.isin && !q.isin && p.t===v) q.isin=p.isin;
        q.stk = toNum($("#f-stk").value); q.ek = toNum($("#f-ek").value); if(!q.stk) return toast("Bitte die Stückzahl eintragen.");
        if(!q.name) q.name = BY[q.t]?.n || v; }
      const list = P.pf.positionen; const i = list.findIndex(x=>x.id===p.id); if(i>=0) list[i]=q; else list.push(q);
      $("#f-save").disabled=true; if(await save(id?"Position geändert":"Position hinzugefügt")){ closeDetail(); renderDepot(); } else $("#f-save").disabled=false;
    };
    $("#f-del")&&($("#f-del").onclick = async () => { if($("#f-del").dataset.sure!=="1"){ $("#f-del").dataset.sure="1"; $("#f-del").textContent="Wirklich löschen?"; return; }
      P.pf.positionen = P.pf.positionen.filter(x=>x.id!==p.id); if(await save("Position gelöscht")){ closeDetail(); renderDepot(); } });
    $("#f-det")&&($("#f-det").onclick = ()=>openDetail(p.t));
    $("#f-al")&&($("#f-al").onclick = ()=>alarmSheet(p.t, p.name));
  }

  /* ---------- Kursalarme ---------- */
  function alarmSheet(t, name){
    const A = P.pf.alarme = P.pf.alarme || [];
    const aus = new Set(P.depot?.alarme_ausgeloest||[]);
    const s = t ? BY[t] : null;
    sheet(head("Kursalarme", "Du bekommst eine Push-Nachricht, sobald der Kurs deine Marke erreicht.")+`
      <div class="list" style="margin-top:4px">${A.map(a=>`<div class="alert"><div class="atop"><div><b>${esc(a.name||a.t)}</b> <span class="sub">${esc(a.t)}</span>
        <div class="sub">${a.art==="unter"?"fällt unter":"steigt über"} ${F.n(a.preis,2)} ${esc(a.cur||"")}${aus.has(a.id)?` · <b style="color:var(--warn)">ausgelöst</b>`:""}</div></div>
        <button class="btn ghost" data-del="${esc(a.id)}">Entfernen</button></div></div>`).join("") || `<div class="sub">Noch keine Kursalarme.</div>`}</div>
      <div class="box"><h3>Neuer Kursalarm</h3><div class="form">
        <label>Ticker<input class="inp" id="a-t" value="${esc(t||"")}" placeholder="z. B. NVDA" autocapitalize="characters"></label>
        <div class="sub" id="a-hint"></div>
        <div class="two"><label>Wenn der Kurs …<select class="inp" id="a-art"><option value="unter">unter … fällt</option><option value="ueber">über … steigt</option></select></label>
        <label>Marke (in Handelswährung)<input class="inp" id="a-p" inputmode="decimal"></label></div>
      </div><div class="links"><button class="btn" id="a-save">Alarm anlegen</button></div></div>`);
    const hint = () => { const v=$("#a-t").value.trim().toUpperCase(); const x=BY[v]; $("#a-hint").textContent = x ? `Aktuell ${F.cur(x.p,x.cur)} · ${x.n}` : ""; };
    $("#a-t").oninput=hint; hint();
    $("#sheet").querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{ P.pf.alarme=A.filter(a=>a.id!==b.dataset.del); if(await save("Kursalarm entfernt")) alarmSheet(t,name); });
    $("#a-save").onclick = async () => { const tt=$("#a-t").value.trim().toUpperCase(), pr=toNum($("#a-p").value); if(!tt||pr==null) return toast("Ticker und Marke eintragen.");
      A.push({id:uid(), t:tt, name:BY[tt]?.n||name||tt, art:$("#a-art").value, preis:pr, cur:BY[tt]?.cur||""}); if(await save("Kursalarm angelegt")){ toast("✓ Kursalarm angelegt"); alarmSheet(t,name); } };
  }

  /* ---------- Einstellungen / Benachrichtigungen ---------- */
  function settings(){
    const e = Object.assign({tag_minus:-5, tag_plus:8, zusammenfassung:true, termine:true, umfang:"markt", rsi_alarm:false, wochenbericht:true}, P.pf.einstellungen||{});
    const link = P.ntfy ? "https://ntfy.sh/"+P.ntfy : null;
    sheet(head("Benachrichtigungen")+`
      ${link?`<div class="box"><h3>Aufs Handy</h3><p style="margin:0 0 8px">1. App <b>ntfy</b> installieren (kostenlos, <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a>).<br>2. In der App auf „+“ tippen und dieses Thema abonnieren:</p>
        <div class="code">${esc(P.ntfy)}</div><div class="links"><button class="btn ghost" id="s-copy">Thema kopieren</button><a href="${link}" target="_blank" rel="noopener">Im Browser öffnen ↗</a></div>
        <div id="s-qr" style="margin-top:10px"></div><div class="sub" style="white-space:normal">Halte das Thema geheim: Wer es kennt, kann deine Nachrichten mitlesen.</div></div>`:`<div class="notif">Push ist noch nicht eingerichtet.</div>`}
      <div class="box"><h3>Wann soll ich dich benachrichtigen?</h3><div class="form">
        <div class="two"><label>Position fällt an einem Tag um mehr als … %<input class="inp" id="s-m" inputmode="decimal" value="${Math.abs(e.tag_minus)}"></label>
        <label>Position steigt an einem Tag um mehr als … %<input class="inp" id="s-p" inputmode="decimal" value="${e.tag_plus}"></label></div>
        <div style="color:var(--ink);font-weight:600;margin-top:4px">Push-Nachrichten für …</div>
        <label class="tg"><input type="radio" name="s-u" value="depot" ${e.umfang==="depot"?"checked":""}> nur mein Depot</label>
        <label class="tg"><input type="radio" name="s-u" value="merkliste" ${e.umfang==="merkliste"?"checked":""}> mein Depot + meine Merkliste</label>
        <label class="tg"><input type="radio" name="s-u" value="markt" ${e.umfang==="markt"?"checked":""}> Depot + Merkliste + auffällige Kursstürze im ganzen Markt</label>
        <div style="color:var(--ink);font-weight:600;margin-top:4px">Außerdem</div>
        <label class="tg"><input type="checkbox" id="s-r" ${e.rsi_alarm?"checked":""}> Hinweis, wenn eine Aktie aus Depot/Merkliste überverkauft ist (RSI unter 30)</label>
        <label class="tg"><input type="checkbox" id="s-z" ${e.zusammenfassung?"checked":""}> Tageszusammenfassung nach US-Börsenschluss (ca. 22 Uhr)</label>
        <label class="tg"><input type="checkbox" id="s-t" ${e.termine?"checked":""}> Erinnerung am Vortag: Quartalszahlen und Ex-Dividende meiner Positionen</label>
        <label class="tg"><input type="checkbox" id="s-w" ${e.wochenbericht?"checked":""}> Wochenbericht freitags (Woche, Top/Flop, Termine der nächsten Woche)</label>
        <div class="sub" style="white-space:normal">Kursalarme kommen immer. Aus dem Gesamtmarkt kommen höchstens 3 Meldungen pro Scan.</div>
      </div><div class="links"><button class="btn" id="s-save">Speichern</button></div></div>`);
    if(link){ qr($("#s-qr"), link); $("#s-copy").onclick=async()=>{ try{ await navigator.clipboard.writeText(P.ntfy); toast("✓ Kopiert"); }catch(e){ toast("Kopieren nicht möglich"); } }; }
    $("#s-save").onclick = async () => { P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {wochenbericht:$("#s-w").checked, tag_minus:-Math.abs(toNum($("#s-m").value)||5), tag_plus:Math.abs(toNum($("#s-p").value)||8), zusammenfassung:$("#s-z").checked, termine:$("#s-t").checked, umfang:(document.querySelector('input[name="s-u"]:checked')||{}).value||"markt", rsi_alarm:$("#s-r").checked});
      if(await save("Benachrichtigungen geändert")){ closeDetail(); } };
  }

  /* ---------- Gerät verbinden ---------- */
  async function pair(){
    sheet(head("Neues Gerät verbinden", "So bekommt dein iPhone oder iPad Zugriff auf dein Depot – ohne dass der Schlüssel offen im Link steht.")+`
      <ol style="padding-left:20px;margin:10px 0;font-size:14.5px;line-height:1.55"><li>Halte die <b>Kamera</b> des neuen Geräts auf den QR-Code und öffne den Link.</li><li>Gib dort diesen <b>Code</b> ein:</li></ol>
      <div id="p-code" style="font-size:32px;font-weight:800;letter-spacing:.12em;text-align:center;margin:6px 0;font-variant-numeric:tabular-nums">…</div>
      <div id="p-qr" style="display:flex;justify-content:center;padding:14px;background:#fff;border-radius:14px;margin-top:6px"></div>
      <div class="sub" id="p-zeit" style="text-align:center;margin-top:6px"></div>
      <div class="notif" style="margin-top:10px;font-size:13.5px;line-height:1.5"><b>📱 Als App-Symbol auf dem iPhone/iPad:</b> Das Symbol hat einen eigenen Speicher, getrennt von Safari, und muss einmal extra verbunden werden. Dazu auf dem Handy in Safari ⚙️ → „Neues Gerät verbinden“ → <b>„Link kopieren“</b>, dann das App-Symbol öffnen → <b>„📋 Link einfügen“</b> → Code eintippen. Danach dort ⚙️ → Face ID einrichten.</div>
      <div class="links"><button class="btn ghost" id="p-neu">Neuer Code</button> <button class="btn ghost" id="p-copy">Link kopieren</button></div>
      <div class="sub" style="white-space:normal;margin-top:8px">Link und Code funktionieren nur zusammen und nur 15 Minuten. Den Code nie mitschicken – nur abtippen.</div>`);
    let ab = 0, timer = null, link = "";
    const neu = async () => { const r = await LOCK.paarLink(); link = r.link; ab = Date.now() + 15*60000;
      $("#p-code").textContent = r.code.slice(0,4) + " " + r.code.slice(4); qr($("#p-qr"), link); };
    const tick = () => { const el = $("#p-zeit"); if(!el){ clearInterval(timer); return; } const s = Math.max(0, Math.round((ab-Date.now())/1000));
      el.textContent = s ? `gültig noch ${Math.floor(s/60)}:${String(s%60).padStart(2,"0")} Min.` : "abgelaufen – tipp auf „Neuer Code“"; };
    await neu(); tick(); timer = setInterval(tick, 1000);
    $("#p-neu").onclick = async () => { await neu(); tick(); };
    $("#p-copy").onclick=async()=>{ try{ await navigator.clipboard.writeText(link); toast("✓ Link kopiert (ohne Code nutzlos)"); }catch(e){ toast("Kopieren nicht möglich"); } };
  }

  /* ---------- CSV-Import ---------- */
  function parseCSV(text){
    const lines = text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim());
    if(lines.length<2) return {err:"Zu wenige Zeilen."};
    const hl = lines[0]; const d = [";","\t",","].sort((a,b)=>hl.split(b).length-hl.split(a).length)[0];
    const split = l => { const out=[]; let cur="", q=false; for(const ch of l){ if(ch==='"'){ q=!q; continue; } if(ch===d && !q){ out.push(cur); cur=""; } else cur+=ch; } out.push(cur); return out.map(s=>s.trim()); };
    const H = split(hl).map(h=>h.toLowerCase());
    const find = re => H.findIndex(h=>re.test(h));
    const ci = { name:find(/name|bezeichnung|wertpapier|titel|instrument|description/), isin:find(/isin/), tick:find(/^(symbol|ticker|kürzel|kuerzel)$/),
      stk:find(/stück|stueck|anzahl|menge|quantity|shares|bestand|nominal|^stk/), ekS:find(/(einstand|kauf|buy|avg|durchschn|ø).*(kurs|preis|price)|^(einstandskurs|kaufkurs|avg.*)$/),
      ekT:find(/einstandswert|kaufwert|investiert|cost|einstand(?!s?kurs)|anschaffung/), typ:find(/^(typ|type|art|transaktion|transaction|richtung)$/), betrag:find(/^(betrag|amount|summe|total|gesamt|wert|kurswert)$|betrag/) };
    if(ci.ekS<0) ci.ekS = find(/^(kurs|preis|price|ausführungskurs|ausfuehrungskurs|stückkurs)$/);
    const rows = lines.slice(1).map(split).filter(r=>r.length>=2);
    const isinRe=/^[A-Z]{2}[A-Z0-9]{9}\d$/;
    if(ci.isin<0){ const c = H.map((_,i)=>rows.filter(r=>isinRe.test((r[i]||"").toUpperCase())).length); const m=Math.max(...c); if(m>0) ci.isin=c.indexOf(m); }
    if(ci.isin<0 && ci.tick<0) return {err:"Keine ISIN- oder Ticker-Spalte gefunden.", H};
    if(ci.stk<0) return {err:"Keine Stückzahl-Spalte gefunden.", H};
    const agg = {};
    const isTx = ci.typ>=0 && rows.some(r=>/kauf|buy|sell|verkauf/i.test(r[ci.typ]||""));
    for(const r of rows){
      const isin = ci.isin>=0 ? (r[ci.isin]||"").toUpperCase() : ""; const tk = ci.tick>=0 ? (r[ci.tick]||"").toUpperCase() : "";
      const k = isin || tk; if(!k || (isin && !isinRe.test(isin))) continue;
      let stk = toNum(r[ci.stk]); if(stk==null) continue;
      let sign = 1; if(isTx){ const ty=(r[ci.typ]||"").toLowerCase(); if(/verkauf|sell/.test(ty)) sign=-1; else if(!/kauf|buy|spar/.test(ty)) continue; }
      const a = agg[k] = agg[k] || {name:"", isin:isin||undefined, t:tk||undefined, stk:0, kosten:0, kostenStk:0};
      if(ci.name>=0 && !a.name) a.name = r[ci.name];
      let ek = ci.ekS>=0 ? toNum(r[ci.ekS]) : null; const tot = ci.ekT>=0 ? toNum(r[ci.ekT]) : (isTx && ci.betrag>=0 ? Math.abs(toNum(r[ci.betrag])||0) : null);
      if(ek==null && tot!=null && stk) ek = Math.abs(tot/stk);
      if(sign>0){ if(ek!=null){ a.kosten += Math.abs(stk)*ek; a.kostenStk += Math.abs(stk); } a.stk += Math.abs(stk); }
      else { const avg = a.kostenStk? a.kosten/a.kostenStk : 0; a.stk -= Math.abs(stk); a.kosten -= avg*Math.abs(stk); a.kostenStk -= Math.abs(stk); }
    }
    const pos = Object.values(agg).filter(a=>a.stk>1e-9).map(a=>({id:uid(), name:a.name||a.isin||a.t, isin:a.isin, t:a.isin?undefined:a.t, stk:+a.stk.toFixed(6), ek:a.kostenStk>0?+(a.kosten/a.kostenStk).toFixed(4):null}));
    return {pos, isTx, H};
  }
  function csvImport(){
    sheet(head("CSV importieren", "Exportiere bei deinem Broker die Depotübersicht als CSV (oder Excel → CSV) und wähle die Datei hier aus. Funktioniert mit Depotübersichten und Transaktionslisten (Käufe/Verkäufe werden zusammengerechnet).")+`
      <div class="form"><input type="file" id="c-file" accept=".csv,.txt,text/csv"><label>… oder Inhalt einfügen<textarea class="inp" id="c-txt" rows="5" placeholder="Name;ISIN;Stück;Einstandskurs"></textarea></label>
      <label>Broker (optional)<input class="inp" id="c-br" placeholder="z. B. Scalable"></label></div>
      <div class="links"><button class="btn ghost" id="c-go">Vorschau</button></div><div id="c-prev"></div>`);
    $("#c-file").onchange = async e => { const f=e.target.files[0]; if(!f) return; const buf=await f.arrayBuffer(); let t=new TextDecoder("utf-8").decode(buf); if(t.includes("\uFFFD")) t=new TextDecoder("windows-1252").decode(buf); $("#c-txt").value=t; $("#c-go").click(); };
    $("#c-go").onclick = () => {
      const r = parseCSV($("#c-txt").value);
      if(r.err){ $("#c-prev").innerHTML = `<div class="err">${esc(r.err)}${r.H?`<br><small>Gefundene Spalten: ${esc(r.H.join(" | "))}</small>`:""}</div>`; return; }
      const br = $("#c-br").value.trim(); r.pos.forEach(p=>{ if(br) p.broker=br; });
      $("#c-prev").innerHTML = `<div class="sek" style="margin-top:10px"><table><thead><tr><th>Übernehmen</th><th>Name</th><th>Stück</th><th>Einstand €</th></tr></thead><tbody>
        ${r.pos.map((p,i)=>`<tr><td><input type="checkbox" data-i="${i}" checked></td><td style="text-align:left;white-space:normal">${esc(p.name)}<div class="sub">${esc(p.isin||p.t)}</div></td><td>${F.n(p.stk, p.stk%1?3:0)}</td><td>${p.ek!=null?F.n(p.ek,2):"–"}</td></tr>`).join("")}</tbody></table></div>
        <div class="sub" style="white-space:normal;margin-top:6px">${r.pos.length} Positionen erkannt${r.isTx?" (aus Transaktionen berechnet)":""}.</div>
        <div class="form"><label class="tg"><input type="radio" name="c-mode" value="add" checked> Zum Depot hinzufügen</label>
        <label class="tg"><input type="radio" name="c-mode" value="rep"> Depot ersetzen${br?` (nur Positionen von „${esc(br)}“)`:""}</label></div>
        <div class="links"><button class="btn" id="c-save">Importieren</button></div>`;
      $("#c-save").onclick = async () => {
        const pick = r.pos.filter((p,i)=>$(`#c-prev input[data-i="${i}"]`).checked);
        const mode = document.querySelector('input[name="c-mode"]:checked').value;
        let list = P.pf.positionen;
        if(mode==="rep") list = br ? list.filter(p=>p.broker!==br) : list.filter(p=>p.manuell!=null);
        for(const p of pick){ const ex = list.find(x=>(p.isin&&x.isin===p.isin)||(p.t&&x.t===p.t)); if(ex && mode==="add"){ ex.stk=p.stk; if(p.ek!=null) ex.ek=p.ek; if(br) ex.broker=br; } else list.push(p); }
        P.pf.positionen = list;
        if(await save(`CSV-Import (${pick.length} Positionen)`)){ closeDetail(); renderDepot(); }
      };
    };
  }

  /* ---------- Termine ---------- */
  function renderTermine(){
    const now = Date.now()/1000, bis = now + 28*86400;
    const mine = new Set([...(P.pf?.positionen||[]).map(p=>p.t).filter(Boolean), ...(P.depot?.positionen||[]).map(z=>z.t).filter(Boolean)]);
    const only = st.get("t_only", false);
    const ev = [];
    for(const s of DATA.stocks){ if(only && !mine.has(s.t) && !stars.has(s.t)) continue;
      if(s.er && s.er>=now-86400 && s.er<=bis) ev.push({ts:s.er, typ:"Quartalszahlen", s});
      if(s.exd && s.exd>=now-86400 && s.exd<=bis) ev.push({ts:s.exd, typ:"Ex-Dividende", s}); }
    for(const z of (P.depot?.positionen||[])){ if(!z.t || BY[z.t]) continue;
      if(z.er && z.er>=now-86400 && z.er<=bis) ev.push({ts:z.er, typ:"Quartalszahlen", s:{t:z.t, n:z.name, s:z.sektor}});
      if(z.exd && z.exd>=now-86400 && z.exd<=bis) ev.push({ts:z.exd, typ:"Ex-Dividende", s:{t:z.t, n:z.name, s:z.sektor}}); }
    ev.sort((a,b)=>a.ts-b.ts);
    const days = {}; for(const e of ev){ const d=new Date(e.ts*1000).toLocaleDateString("de-DE",{weekday:"long", day:"2-digit", month:"2-digit"}); (days[d]=days[d]||[]).push(e); }
    $("#main").innerHTML = `<div class="filters"><label class="toggle"><input type="checkbox" id="t-only" ${only?"checked":""}> Nur Depot & Merkliste</label><span class="sub" style="align-self:center">Nächste 4 Wochen · ${ev.length} Termine</span></div>
      ${Object.entries(days).map(([d,L])=>`<div class="tday">${esc(d)}</div><div class="list" style="margin-top:6px">${L.map(e=>`<div class="row" data-t="${esc(e.s.t)}" style="grid-template-columns:auto 1fr auto">
        <span class="tag ${e.typ==="Ex-Dividende"?"zahlen":"news"}">${e.typ==="Ex-Dividende"?"Ex-Div.":"Zahlen"}</span>
        <div style="min-width:0"><div class="nm">${mine.has(e.s.t)?"💼 ":stars.has(e.s.t)?"★ ":""}${esc(e.s.n)}</div><div class="sub">${esc(e.s.t)} · ${esc(e.s.s||"")}</div></div>
        <div class="right">${e.s.p!=null?`<span class="px">${F.cur(e.s.p,e.s.cur)}</span>`:""}${e.s.div?`<span class="sub">Div. ${F.p(e.s.div,1,false)}</span>`:""}</div></div>`).join("")}</div>`).join("") || '<div class="empty">Keine Termine gefunden.</div>'}
      <div class="sub" style="white-space:normal;margin-top:10px">Termine laut Yahoo Finance, ohne Gewähr. 💼 = in deinem Depot.</div>`;
    $("#t-only").onchange = e => { st.set("t_only", e.target.checked); renderTermine(); };
    if(P.key && !P.loaded) loadDepot();
  }

  /* ---------- Sparplan-Rechner ---------- */
  function renderRechner(){
    const r = Object.assign({start:20000, rate:100, zins:7, jahre:40, dyn:2, infl:2}, st.get("rechner", {}));
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Sparplan- & Zinseszins-Rechner</h3><div class="form">
      <div class="two"><label>Startkapital €<input class="inp" data-k="start" inputmode="decimal" value="${r.start}"></label><label>Sparrate € / Monat<input class="inp" data-k="rate" inputmode="decimal" value="${r.rate}"></label></div>
      <div class="two"><label>Rendite % pro Jahr<input class="inp" data-k="zins" inputmode="decimal" value="${r.zins}"></label><label>Jahre<input class="inp" data-k="jahre" inputmode="numeric" value="${r.jahre}"></label></div>
      <div class="two"><label>Sparrate jährlich erhöhen um %<input class="inp" data-k="dyn" inputmode="decimal" value="${r.dyn}"></label><label>Inflation % pro Jahr<input class="inp" data-k="infl" inputmode="decimal" value="${r.infl}"></label></div>
    </div></div><div id="r-out"></div>`;
    const calc = () => {
      const v = {}; document.querySelectorAll("[data-k]").forEach(i=>v[i.dataset.k]=toNum(i.value)??0); st.set("rechner", v);
      const J = Math.max(1, Math.min(80, Math.round(v.jahre))), mz = Math.pow(1+v.zins/100, 1/12)-1;
      let w = v.start, ein = v.start, rate = v.rate; const serie=[w], rows=[];
      for(let j=1;j<=J;j++){ for(let m=0;m<12;m++){ w = w*(1+mz) + rate; ein += rate; } serie.push(w); rows.push([j, w, ein, w/Math.pow(1+v.infl/100, j)]); rate *= 1+v.dyn/100; }
      const end = rows[rows.length-1];
      const marks = rows.filter(x=>x[0]%5===0 || x[0]===J);
      $("#r-out").innerHTML = `<div class="box dsum"><div><div class="sub">Endwert nach ${J} Jahren</div><div class="px big2">${E(end[1])}</div></div>
        <div><div class="sub">Eingezahlt</div><div class="px">${E(end[2])}</div></div><div><div class="sub">Zinsen & Kursgewinne</div><div class="px pos">${E(end[1]-end[2])}</div></div>
        <div><div class="sub">Kaufkraft in heutigen Euro</div><div class="px">${E(end[3])}</div></div></div>
        <div class="box">${bigChart(serie, "EUR", ["heute", `in ${J} Jahren`])}</div>
        <div class="sek"><table><thead><tr><th>Jahr</th><th>Wert</th><th>Eingezahlt</th><th class="hide-s">Kaufkraft heute</th></tr></thead><tbody>${marks.map(x=>`<tr><td>${x[0]}</td><td>${E(x[1])}</td><td>${E(x[2])}</td><td class="hide-s">${E(x[3])}</td></tr>`).join("")}</tbody></table></div>
        <div class="sub" style="white-space:normal;margin-top:8px">Vor Steuern und Kosten, mit gleichbleibender Rendite. Echte Märkte schwanken. Zur Orientierung: Der MSCI World lag langfristig bei etwa 7–8 % pro Jahr.</div>`;
    };
    document.querySelectorAll("[data-k]").forEach(i=>i.addEventListener("input", calc)); calc();
  }

  /* ---------- Mehr ---------- */
  function renderMehr(){
    $("#main").innerHTML = `<div class="list" style="margin-top:12px">${[["dividenden","💶 Dividenden","Kalender, Ex-Tage, Beträge je Position"],["branchen","📊 Branchen","Performance aller Branchen im Vergleich"],["merkliste","★ Merkliste","Deine gemerkten Aktien"],["rechner","🧮 Sparplan-Rechner","Zinseszins, Sparrate, Inflation"],["markt","🌍 Markt","Indizes, Gold, Öl, Bitcoin, Euro/Dollar"],["datencheck","✅ Datencheck","Werden alle Kurse richtig geladen und ausgewertet?"]]
      .map(([h,t,s])=>`<a class="row" href="#${h}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="sub">›</span></a>`).join("")}</div>`;
  }
  function renderMarkt(){
    const M = DATA.markt||[];
    $("#main").innerHTML = `<div class="list" style="margin-top:12px">${M.map(m=>`<div class="row" style="grid-template-columns:1fr auto auto;cursor:default">
      <div><div class="nm">${esc(m.n)}</div><div class="sub">1 M ${F.p(m.r1m,1)} · 1 J ${F.p(m.r1y,1)}</div></div>${spark(m.spark,90,30)}
      <div class="right"><span class="px">${m.t.includes("=X")?F.n(m.p,4):F.n(m.p, m.p>=1000?0:2)}</span>${pill(m.r1d)}</div></div>`).join("") || '<div class="empty">Marktdaten kommen mit dem nächsten Scan.</div>'}</div>`;
  }

  /* ---------- Aktien-Detail: Depot-Infos ---------- */
  function detailExtra(s){
    if(!P.key) return "";
    const pos = (P.pf?.positionen||[]).filter(p=>p.t===s.t); const z = (P.depot?.positionen||[]).filter(x=>x.t===s.t);
    const w = z.reduce((a,x)=>a+(x.wert||0),0), stk = pos.reduce((a,p)=>a+(p.stk||0),0);
    return `<div class="box"><h3>Mein Depot</h3>${pos.length?`<div>${F.n(stk, stk%1?3:0)} Stück · ${E(w)}${z[0]?.gv_pct!=null?` · G/V <b class="${cls(z[0].gv)}">${F.p(z[0].gv_pct,1)}</b>`:""}</div>`:`<div class="sub">Nicht im Depot.</div>`}
      <div class="links"><button class="btn ghost" id="x-add">${pos.length?"Position bearbeiten":"Zum Depot hinzufügen"}</button><button class="btn ghost" id="x-al">Kursalarm setzen</button></div></div>`;
  }
  function detailBind(s){
    const a=$("#x-add"); if(a) a.onclick=()=>{ const p=(P.pf?.positionen||[]).find(p=>p.t===s.t); p?editPos(p.id):editPos(null,{t:s.t, name:s.n}); };
    const b=$("#x-al"); if(b) b.onclick=()=>alarmSheet(s.t, s.n);
  }

  const VIEWS = {depot:renderDepot, termine:renderTermine, rechner:renderRechner, mehr:renderMehr, markt:renderMarkt};
  return { VIEWS, marktStrip, isQual, loadDepot, detailExtra, detailBind, onData:()=>loadDepot(), P, save, LOCK, st, settings, pair, scanNow };
})();
