/* Value Finder – Zusatzfunktionen: Depot, Kursalarme, Termine, Marktüberblick, Sparplan-Rechner, Qualitätsfilter.
   Das Depot liegt verschlüsselt (AES-256-GCM) im Repository. Den Schlüssel kennen nur deine verbundenen Geräte. */
"use strict";
const PLUS = (() => {
  const host = location.hostname.split(".")[0], seg = location.pathname.split("/").filter(Boolean)[0];
  const REPO = window.VF_REPO || (location.hostname.endsWith("github.io") ? `${host}/${seg}` : "jannis1307/value-finder");
  const SITE = location.origin + "/" + (seg && location.hostname.endsWith("github.io") ? seg + "/" : "");
  const P = { key:null, keyText:null, token:null, ntfy:null, pf:null, sha:null, depot:null, loaded:false, loading:false, err:null, vtab:"Branche", chart:"sim" };
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
  async function qr(el, text){ try{ await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"); el.innerHTML=""; new QRCode(el, {text, width:200, height:200, correctLevel:QRCode.CorrectLevel.M}); }catch(e){ el.textContent="QR-Code konnte nicht geladen werden."; } }
  const bars = (rows, fmt) => rows.map(([k,v,p])=>`<div class="bar" style="grid-template-columns:130px 1fr 92px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k)}</span><div class="tr"><div class="fi" style="width:${Math.max(1,Math.round(p*100))}%"></div></div><span class="v">${fmt(v,p)}</span></div>`).join("");

  /* ---------- Gerät verbinden ---------- */
  async function init(){
    const m = location.hash.match(/key=([A-Za-z0-9_\-]+)/);
    if(m){ st.set("key", m[1]); history.replaceState(null, "", location.pathname + "#depot"); toast("✓ Gerät verbunden"); }
    P.keyText = st.get("key", null);
    if(P.keyText){ try{ P.key = await importKey(P.keyText); }catch(e){ P.key=null; P.err="Ungültiger Schlüssel"; } }
  }
  const ready = init();
  window.addEventListener("hashchange", async () => {
    const m = location.hash.match(/key=([A-Za-z0-9_\-]+)/); if(!m) return;
    st.set("key", m[1]); P.keyText = m[1];
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
      if(!P.token){ const z = await ghFile("depot/zugang.enc"); if(z.status===200){ const zz = await dec(z.text); P.token=zz.token||null; P.ntfy=zz.ntfy||null; } }
      const f = await ghFile("depot/portfolio.enc");
      if(f.status===200){ P.pf = await dec(f.text); P.sha = f.sha; }
      else if(f.status===404){ P.pf = P.pf || {v:1, positionen:[], alarme:[], einstellungen:{}}; P.sha=null; }
      else if(!P.pf) throw new Error("GitHub antwortet mit "+f.status);
      try{ const r = await fetch("depot.enc?ts="+Date.now(), {cache:"no-store"}); if(r.ok) P.depot = await dec(await r.text()); }catch(e){}
      P.err = null; P.loaded = Date.now();
    }catch(e){ P.err = e.message.includes("decrypt")||e.name==="OperationError" ? "Schlüssel passt nicht zum Depot." : e.message; }
    P.loading = false;
    const v = view(); if(["depot","termine","chancen"].includes(v)) render();
  }

  async function save(msg){
    if(!P.token){ toast("Auf diesem Gerät fehlt der Bearbeitungs-Zugang."); return false; }
    P.pf.aktualisiert = new Date().toISOString();
    const content = b64e(new TextEncoder().encode(await enc(P.pf)));
    const body = {message: msg||"Depot aktualisiert", content}; if(P.sha) body.sha = P.sha;
    const r = await gh("PUT", "/contents/depot/portfolio.enc", body);
    if(r.status>=300){ toast("Speichern fehlgeschlagen ("+r.status+")"+(r.status===409?": bitte neu laden.":"")); return false; }
    P.sha = r.j.content.sha;
    scanNow(true);
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
    if(!P.key){
      $("#main").innerHTML = `<div class="box" style="margin-top:14px"><h3>Depot</h3>
        <p>Dein Depot ist <b>privat und verschlüsselt</b>. Nur Geräte mit deinem Schlüssel können es sehen.</p>
        <p>Dieses Gerät ist noch nicht verbunden. Öffne den <b>Verbindungs-Link</b> oder scanne auf einem verbundenen Gerät unter Depot → „Gerät verbinden“ den QR-Code.</p>
        <div class="links"><button class="btn ghost" id="pk">Schlüssel einfügen</button></div></div>`;
      $("#pk").onclick = () => { sheet(head("Schlüssel einfügen")+`<p class="sub" style="white-space:normal">Füge den Verbindungs-Link oder nur den Schlüssel ein.</p><input id="pki" class="inp" placeholder="https://…#key=…"><div class="links"><button class="btn" id="pks">Verbinden</button></div>`);
        $("#pks").onclick = async () => { const v=$("#pki").value.trim(); const k=(v.match(/key=([A-Za-z0-9_\-]+)/)||[null,v])[1]; if(!k) return; st.set("key",k); P.keyText=k; try{ P.key=await importKey(k); closeDetail(); loadDepot(true); render(); }catch(e){ toast("Ungültiger Schlüssel"); } }; };
      return;
    }
    if(!P.loaded){ $("#main").innerHTML = P.err ? `<div class="err">${esc(P.err)}</div>` : `<div class="empty">Depot wird entschlüsselt …</div>`; loadDepot(); return; }
    const D = P.depot, S = D?.summe, L = merged();
    const stale = D && P.pf?.aktualisiert && new Date(P.pf.aktualisiert) > new Date(D.stand);
    const kl = (D?.positionen||[]).filter(z=>z.anteil>0.2);
    const sp = 1000, divj = S?.div_jahr||0;
    const chartData = P.chart==="echt" && (D?.verlauf_echt||[]).length>=3 ? D.verlauf_echt : (D?.verlauf||[]);
    $("#main").innerHTML = `${marktStrip()}
    ${P.err?`<div class="err">${esc(P.err)}</div>`:""}
    ${stale?`<div class="notif">⏳ Änderungen gespeichert, die Werte werden gerade neu berechnet.</div>`:""}
    ${!L.length?`<div class="box" style="margin-top:12px"><h3>Noch leer</h3><p>Füge Positionen hinzu oder importiere die CSV-Datei deines Brokers.</p></div>`:""}
    ${S?`<div class="box dsum">
      <div><div class="sub">Depotwert</div><div class="px big2">${E(S.wert)}</div></div>
      <div><div class="sub">Heute</div><div class="px ${cls(S.heute)}">${Es(S.heute)} <small>${F.p(S.heute_pct,2)}</small></div></div>
      <div><div class="sub">Gewinn/Verlust gesamt</div><div class="px ${cls(S.gv)}">${Es(S.gv)} <small>${F.p(S.gv_pct,1)}</small></div></div>
      <div><div class="sub">Dividenden / Jahr (geschätzt)</div><div class="px">${E(divj)} <small>≈ ${E(divj/12)}/Monat</small></div>
        <div class="tr" style="margin-top:6px" title="Fortschritt zum Sparerpauschbetrag (1.000 €)"><div class="fi" style="width:${Math.min(100,divj/sp*100)}%"></div></div>
        <div class="sub">${Math.round(divj/sp*100)} % vom Sparerpauschbetrag (1.000 €)</div></div>
    </div>
    <div class="box"><h3>Verlauf <span class="seg"><a data-c="sim" class="${P.chart!=="echt"?"on":""}">Aktuelle Positionen, 1 Jahr</a><a data-c="echt" class="${P.chart==="echt"?"on":""}">Echt (ab Start)</a></span></h3>
      ${chartData.length>=2 ? bigChart(chartData.map(x=>x[1]), "EUR") : `<div class="sub">Noch zu wenig Daten.</div>`}
      <div class="sub" style="white-space:normal;margin-top:4px">${P.chart==="echt"?"Echter Depotwert, täglich gespeichert.":"So hätten sich deine heutigen Positionen im letzten Jahr entwickelt (ohne Käufe/Verkäufe)."} Stand ${F.dt(D.stand)}.</div></div>
    <div class="box"><h3>Verteilung <span class="seg">${["Branche","Land","Währung"].map(k=>`<a data-v="${k}" class="${P.vtab===k?"on":""}">${k}</a>`).join("")}</span></h3>
      ${bars((D.verteilung?.[P.vtab]||[]).slice(0,10), (v,p)=>`${F.n(p*100,1)} %`)}
      ${kl.length?`<div class="sub" style="white-space:normal;color:var(--warn);margin-top:6px">⚠ Klumpenrisiko: ${kl.map(z=>esc(z.name)+" "+F.n(z.anteil*100,0)+" %").join(", ")} vom Depot.</div>`:""}</div>`:(L.length?`<div class="notif">⏳ Die erste Auswertung läuft. In ein paar Minuten siehst du hier Werte, Verlauf und Verteilung.</div>`:"")}
    <div class="dtools">
      <button class="btn" id="d-add">+ Position</button>
      <button class="btn ghost" id="d-csv">CSV importieren</button>
      <button class="btn ghost" id="d-alarm">Kursalarme</button>
      <button class="btn ghost" id="d-set">Benachrichtigungen</button>
      <button class="btn ghost" id="d-pair">Gerät verbinden</button>
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
          <label>Art<input class="inp" id="f-typ" value="${esc(p.typ||"")}" placeholder="Anleihe, Fonds, …"></label></div></div>
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
      const q = {id:p.id, name:$("#f-name").value.trim(), broker:$("#f-br").value.trim()||undefined};
      if($("#f-man").checked){ q.manuell = toNum($("#f-wert").value); q.typ=$("#f-typ").value.trim()||"Sonstiges"; if(q.manuell==null) return toast("Bitte einen Wert eintragen."); }
      else { const v=$("#f-t").value.trim().toUpperCase(); if(!v) return toast("Bitte Ticker oder ISIN eintragen.");
        if(/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v)) q.isin=v; else q.t=v;
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
    const e = Object.assign({tag_minus:-5, tag_plus:8, zusammenfassung:true, termine:true}, P.pf.einstellungen||{});
    const link = P.ntfy ? "https://ntfy.sh/"+P.ntfy : null;
    sheet(head("Benachrichtigungen")+`
      ${link?`<div class="box"><h3>Aufs Handy</h3><p style="margin:0 0 8px">1. App <b>ntfy</b> installieren (kostenlos, <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a>).<br>2. In der App auf „+“ tippen und dieses Thema abonnieren:</p>
        <div class="code">${esc(P.ntfy)}</div><div class="links"><button class="btn ghost" id="s-copy">Thema kopieren</button><a href="${link}" target="_blank" rel="noopener">Im Browser öffnen ↗</a></div>
        <div id="s-qr" style="margin-top:10px"></div><div class="sub" style="white-space:normal">Halte das Thema geheim: Wer es kennt, kann deine Nachrichten mitlesen.</div></div>`:`<div class="notif">Push ist noch nicht eingerichtet.</div>`}
      <div class="box"><h3>Wann soll ich dich benachrichtigen?</h3><div class="form">
        <div class="two"><label>Position fällt an einem Tag um mehr als … %<input class="inp" id="s-m" inputmode="decimal" value="${Math.abs(e.tag_minus)}"></label>
        <label>Position steigt an einem Tag um mehr als … %<input class="inp" id="s-p" inputmode="decimal" value="${e.tag_plus}"></label></div>
        <label class="tg"><input type="checkbox" id="s-z" ${e.zusammenfassung?"checked":""}> Tageszusammenfassung nach US-Börsenschluss (ca. 22 Uhr)</label>
        <label class="tg"><input type="checkbox" id="s-t" ${e.termine?"checked":""}> Erinnerung am Vortag: Quartalszahlen und Ex-Dividende meiner Positionen</label>
        <div class="sub" style="white-space:normal">Kursalarme kommen immer. Auffällige Kursstürze ohne Grund im Gesamtmarkt kommen zusätzlich (max. 3 pro Scan).</div>
      </div><div class="links"><button class="btn" id="s-save">Speichern</button></div></div>`);
    if(link){ qr($("#s-qr"), link); $("#s-copy").onclick=async()=>{ try{ await navigator.clipboard.writeText(P.ntfy); toast("✓ Kopiert"); }catch(e){ toast("Kopieren nicht möglich"); } }; }
    $("#s-save").onclick = async () => { P.pf.einstellungen = {tag_minus:-Math.abs(toNum($("#s-m").value)||5), tag_plus:Math.abs(toNum($("#s-p").value)||8), zusammenfassung:$("#s-z").checked, termine:$("#s-t").checked};
      if(await save("Benachrichtigungen geändert")){ closeDetail(); } };
  }

  /* ---------- Gerät verbinden ---------- */
  function pair(){
    const link = SITE + "#key=" + P.keyText;
    sheet(head("Gerät verbinden", "Scanne den Code mit der Handy-Kamera oder öffne den Link auf dem anderen Gerät. Danach siehst du dort dein Depot.")+`
      <div id="p-qr" style="display:flex;justify-content:center;padding:14px;background:#fff;border-radius:14px;margin-top:10px"></div>
      <div class="links"><button class="btn ghost" id="p-copy">Link kopieren</button></div>
      <div class="sub" style="white-space:normal;margin-top:8px">⚠ Der Link ist der Schlüssel zu deinem Depot. Teile ihn mit niemandem.</div>`);
    qr($("#p-qr"), link);
    $("#p-copy").onclick=async()=>{ try{ await navigator.clipboard.writeText(link); toast("✓ Link kopiert"); }catch(e){ toast("Kopieren nicht möglich"); } };
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
        <div class="box">${bigChart(serie, "EUR")}</div>
        <div class="sek"><table><thead><tr><th>Jahr</th><th>Wert</th><th>Eingezahlt</th><th class="hide-s">Kaufkraft heute</th></tr></thead><tbody>${marks.map(x=>`<tr><td>${x[0]}</td><td>${E(x[1])}</td><td>${E(x[2])}</td><td class="hide-s">${E(x[3])}</td></tr>`).join("")}</tbody></table></div>
        <div class="sub" style="white-space:normal;margin-top:8px">Vor Steuern und Kosten, mit gleichbleibender Rendite. Echte Märkte schwanken. Zur Orientierung: Der MSCI World lag langfristig bei etwa 7–8 % pro Jahr.</div>`;
    };
    document.querySelectorAll("[data-k]").forEach(i=>i.addEventListener("input", calc)); calc();
  }

  /* ---------- Mehr ---------- */
  function renderMehr(){
    $("#main").innerHTML = `<div class="list" style="margin-top:12px">${[["branchen","📊 Branchen","Performance aller Branchen im Vergleich"],["merkliste","★ Merkliste","Deine gemerkten Aktien"],["rechner","🧮 Sparplan-Rechner","Zinseszins, Sparrate, Inflation"],["markt","🌍 Markt","Indizes, Gold, Öl, Bitcoin, Euro/Dollar"]]
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
  return { VIEWS, marktStrip, isQual, loadDepot, detailExtra, detailBind, onData:()=>loadDepot(), P };
})();
