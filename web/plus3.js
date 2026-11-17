/* Value Finder – Erweiterungen 3: interaktiver Dividenden-Kalender, Sparpläne (buchen sich selbst),
   Steuer-Cockpit, Dividenden-Schneeball, Burggraben-Ranking, Fairer-Wert-Rechner, ETF-Durchblick,
   Umschichtungs-Helfer, App-Installation (PWA). */
"use strict";
const PLUS3 = (() => {
  const P = PLUS.P;
  const nf = d => new Intl.NumberFormat("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d});
  const E = (x, d=0) => x==null || !isFinite(x) ? "–" : nf(d).format(x)+" €";
  const Es = (x, d=0) => x==null ? "–" : (x>0?"+":"")+E(x,d);
  const Pc = (x, d=0) => x==null || !isFinite(x) ? "–" : nf(d).format(x*100)+" %";
  const MON = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const COL = ["#2bb3a3","#5b8def","#e8a33d","#d0605e","#9b7be0","#4fb06d","#d977b4","#c9a227"];
  const ANDERE = "#8a9bb0";
  const toNum = v => { if(v==null) return null; let s=String(v).trim().replace(/[€$\s%]/g,""); if(!s) return null;
    if(s.includes(",") && s.includes(".")) s = s.lastIndexOf(",")>s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
    else if(s.includes(",")) s = s.replace(",","."); const n=parseFloat(s); return isNaN(n)?null:n; };
  const uid = () => Math.random().toString(36).slice(2,9);
  const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const dShort = s => new Date(s+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
  function toast(msg, ms=3500){ let t=document.getElementById("vf-toast"); if(!t){ t=document.createElement("div"); t.id="vf-toast"; document.body.appendChild(t); }
    t.textContent=msg; t.className="show"; clearTimeout(t._h); t._h=setTimeout(()=>t.className="", ms); }
  function sheet(html){ $("#sheet").innerHTML = html; $("#ov").classList.add("open"); document.body.style.overflow="hidden";
    $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeDetail); }
  const head = (title, sub="") => `<div class="shead"><div style="min-width:0"><h2>${title}</h2>${sub?`<div class="sub" style="white-space:normal">${sub}</div>`:""}</div><button class="iconbtn x" data-close aria-label="Schließen">✕</button></div>`;
  const need = (title) => {
    if(!P.key){ $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>${title}</h3><p>Verbinde zuerst dieses Gerät mit deinem Depot (Depot → Gerät verbinden).</p></div>`; return false; }
    if(!P.loaded || !P.pf){ $("#main").innerHTML = P.err ? `<div class="err">${esc(P.err)}</div>` : `<div class="empty">Depot wird geladen …</div>`; PLUS.loadDepot(); return false; }
    return true;
  };
  const zOf = () => Object.fromEntries(((P.depot||{}).positionen||[]).map(z=>[z.id,z]));
  const isETF = z => z && ["ETF","MUTUALFUND"].includes(z.art);

  const css = document.createElement("style");
  css.textContent = `
.icl{position:relative}
.icl-bars{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;align-items:end;text-align:center;user-select:none}
.icl-m{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--mut);cursor:pointer;border-radius:8px;padding:3px 0 2px}
.icl-m:hover,.icl-m.sel{background:var(--soft)}.icl-m.sel span{color:var(--ink);font-weight:700}
.icl-st{height:96px;width:72%;max-width:26px;display:flex;flex-direction:column-reverse;justify-content:flex-start}
.icl-st i{display:block;width:100%;min-height:2px;border-top:1px solid var(--card);transition:opacity .15s}
.icl-st i:last-child{border-radius:4px 4px 0 0}
.icl.hl .icl-st i{opacity:.18}.icl.hl .icl-st i.on{opacity:1}
.icl-m small{font-size:10.5px;color:var(--ink);min-height:14px}
.icl-tip{position:absolute;z-index:5;pointer-events:none;background:var(--ink);color:var(--bg);border-radius:9px;padding:6px 9px;font-size:12.5px;line-height:1.35;max-width:240px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.icl-tip b{display:block}
.icl-leg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.icl-leg button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:3px 9px 3px 6px;font-size:12px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.icl-leg button.on{border-color:var(--ink)}
.icl-leg em{width:10px;height:10px;border-radius:3px;display:inline-block;font-style:normal}
.icl-det{margin-top:10px;border-top:1px solid var(--line);padding-top:8px}
.icl-det .kvrow em{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:6px;vertical-align:0}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
@media(max-width:620px){.tiles{grid-template-columns:repeat(2,1fr)}}
.tiles a{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:2px}
.tiles a:hover{border-color:var(--acc)}.tiles a b{font-size:14.5px}.tiles a span{font-size:12.5px;color:var(--mut)}
.sl{display:grid;grid-template-columns:1fr 70px;gap:4px 10px;align-items:center;font-size:13.5px;margin:6px 0}
.sl label{color:var(--mut)}.sl output{text-align:right;font-weight:650;font-variant-numeric:tabular-nums}
.sl input[type=range]{grid-column:1/3;width:100%;accent-color:var(--acc)}
.big3{font-size:26px;font-weight:750;letter-spacing:-.01em}
.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mini>div{background:var(--soft);border-radius:10px;padding:8px}
.mini b{display:block;font-size:16px}.mini span{font-size:12px;color:var(--mut)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.chips button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 10px;font-size:12.5px;cursor:pointer}
.chips button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.ist{position:relative;height:10px;background:var(--soft);border-radius:5px;margin:4px 0 2px}
.ist .fi{position:absolute;left:0;top:0;bottom:0;background:var(--acc);border-radius:5px}
.ist .mk{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink)}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}.tbl td,.tbl th{padding:6px 4px;border-bottom:1px solid var(--line);text-align:right}
.tbl td:first-child,.tbl th:first-child{text-align:left}.tbl th{color:var(--mut);font-weight:600;font-size:12px}
.expand{display:none;padding:4px 0 6px 10px}.open>.expand{display:block}
.inl{width:90px;padding:5px 7px;border:1px solid var(--line);border-radius:8px;background:var(--card)}
#vf-inst{display:none}`;
  document.head.appendChild(css);

  /* =====================================================================
     Interaktiver Dividenden-Kalender
     ===================================================================== */
  const CAL = {};
  function calData(D){
    const T = D.div_termine||[], now = new Date(), months = [];
    for(let i=0;i<12;i++){ const d = new Date(now.getFullYear(), now.getMonth()+i, 1); months.push({k:ymd(d).slice(0,7), m:d.getMonth(), y:d.getFullYear(), sum:0, by:{}}); }
    const idx = Object.fromEntries(months.map((m,i)=>[m.k,i])), payers = {};
    for(const t of T){
      const i = idx[t.datum.slice(0,7)]; if(i==null) continue;
      const key = t.t || t.name, M = months[i];
      const e = M.by[key] = M.by[key] || {key, name:t.name, betrag:0, items:[]};
      e.betrag += t.betrag; e.items.push(t); M.sum += t.betrag;
      const p = payers[key] = payers[key] || {key, name:t.name, sum:0, n:0}; p.sum += t.betrag; p.n++;
    }
    const pl = Object.values(payers).sort((a,b)=>b.sum-a.sum);
    pl.forEach((p,i)=>p.col = i<COL.length ? COL[i] : ANDERE);
    return {months, payers:pl, pmap:Object.fromEntries(pl.map(p=>[p.key,p])), total:pl.reduce((a,p)=>a+p.sum,0)};
  }
  function divCal(D, full){
    const C = calData(D); if(!C.total) return "";
    const id = "c"+uid(); CAL[id] = C;
    const mx = Math.max(...C.months.map(m=>m.sum)) || 1;
    const sel = C.months.findIndex(m=>m.sum>0);
    const bars = C.months.map((m,i)=>{
      const segs = Object.values(m.by).sort((a,b)=>(C.pmap[b.key].sum)-(C.pmap[a.key].sum));
      return `<div class="icl-m${i===sel?" sel":""}" data-im="${i}" title="${MON[m.m]} ${m.y}"><div class="icl-st">${segs.map(s=>`<i data-k="${esc(s.key)}" data-im="${i}" style="height:${Math.max(2,s.betrag/mx*96).toFixed(1)}px;background:${C.pmap[s.key].col}"></i>`).join("")}</div><span>${MON[m.m]}</span><small>${m.sum>=1?Math.round(m.sum):m.sum>0?"<1":""}</small></div>`;
    }).join("");
    const leg = C.payers.slice(0, full?40:10).map(p=>`<button data-lg="${esc(p.key)}"><em style="background:${p.col}"></em>${esc(p.name)} <b>${E(p.sum)}</b></button>`).join("");
    return `<div class="box"><h3>Dividenden-Kalender · nächste 12 Monate</h3>
      <div class="icl" id="${id}"><div class="icl-bars">${bars}</div><div class="icl-tip" hidden></div>
      <div class="sub" style="white-space:normal;margin-top:6px">Fahr über einen Balken oder tipp auf einen Monat: Du siehst, welche Aktie wie viel zahlt. Tipp auf einen Namen, um seine Termine hervorzuheben. Summe ${E(C.total)} vor Steuern, nach Ex-Tag.</div>
      <div class="icl-leg">${leg}${!full && C.payers.length>10?`<a href="#dividenden" style="font-size:12.5px;align-self:center">+${C.payers.length-10} weitere</a>`:""}</div>
      <div class="icl-det">${monthDetail(C, sel)}</div></div>
      ${full?"":`<div class="links"><a href="#dividenden">Alle Dividenden-Termine →</a></div>`}</div>`;
  }
  const cur = (v,c) => nf(v<1?3:2).format(v)+" "+({USD:"$",EUR:"€",GBp:"p",GBP:"£",CHF:"CHF",SEK:"kr",HKD:"HK$",DKK:"kr",NOK:"kr",CAD:"C$"}[c]||c||"");
  function monthDetail(C, i){
    const M = C.months[i]; if(!M || !M.sum) return `<div class="sub">In diesem Monat keine Ex-Tage.</div>`;
    const L = Object.values(M.by).sort((a,b)=>b.betrag-a.betrag);
    return `<div class="tday">${new Date(M.y, M.m, 1).toLocaleDateString("de-DE",{month:"long",year:"numeric"})} <span class="sub">≈ ${E(M.sum,2)} von ${L.length} ${L.length===1?"Aktie":"Aktien"}</span></div>
      ${L.map(e=>`<div class="kvrow" data-lg="${esc(e.key)}" style="cursor:pointer"><span><em style="background:${C.pmap[e.key].col}"></em>${esc(e.name)}<br><span class="sub">${e.items.map(t=>`Ex ${dShort(t.datum)} · ${cur(t.pro_aktie,t.cur)} je Aktie${t.bestaetigt?" ✓":""}`).join(" · ")}</span></span><b>≈ ${E(e.betrag,2)}</b></div>`).join("")}`;
  }
  function payerDetail(C, key){
    const p = C.pmap[key]; if(!p) return "";
    const rows = []; C.months.forEach(M=>{ const e=M.by[key]; if(e) e.items.forEach(t=>rows.push(t)); });
    return `<div class="tday"><em style="background:${p.col};width:10px;height:10px;border-radius:3px;display:inline-block"></em> ${esc(p.name)} <span class="sub">≈ ${E(p.sum,2)} in 12 Monaten · ${p.n} ${p.n===1?"Zahlung":"Zahlungen"}</span></div>
      ${rows.map(t=>`<div class="kvrow"><span>Ex-Tag ${new Date(t.datum+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"short",year:"numeric"})} <span class="tag ${t.bestaetigt?"news":"dividende"}" style="font-size:10px">${t.bestaetigt?"bestätigt":"geschätzt"}</span><br><span class="sub">${cur(t.pro_aktie,t.cur)} je Aktie</span></span><b>≈ ${E(t.betrag,2)}</b></div>`).join("")}`;
  }
  function calOf(el){ const c = el && el.closest(".icl"); return c ? [c, CAL[c.id]] : [null, null]; }
  function tipAt(c, ev, html){
    const tip = c.querySelector(".icl-tip"); if(!html){ tip.hidden = true; return; }
    tip.innerHTML = html; tip.hidden = false;
    const r = c.getBoundingClientRect(), w = tip.offsetWidth;
    let x = ev.clientX - r.left + 12; if(x + w > r.width) x = ev.clientX - r.left - w - 12; if(x<0) x=0;
    tip.style.left = x+"px"; tip.style.top = Math.max(0, ev.clientY - r.top - tip.offsetHeight - 10)+"px";
  }
  function highlight(c, key){
    c.classList.toggle("hl", !!key);
    c.querySelectorAll(".icl-st i").forEach(i=>i.classList.toggle("on", i.dataset.k===key));
    c.querySelectorAll(".icl-leg button").forEach(b=>b.classList.toggle("on", b.dataset.lg===key));
  }
  document.addEventListener("pointermove", ev=>{
    const seg = ev.target.closest && ev.target.closest(".icl-st i"); const [c, C] = calOf(ev.target);
    if(!c) return;
    if(seg && ev.pointerType!=="touch"){
      const M = C.months[+seg.dataset.im], e = M.by[seg.dataset.k];
      tipAt(c, ev, `<b>${esc(e.name)}</b>≈ ${E(e.betrag,2)} im ${MON[M.m]}<br>${e.items.map(t=>`Ex ${dShort(t.datum)} · ${cur(t.pro_aktie,t.cur)}/Aktie`).join("<br>")}`);
      if(!c.dataset.pin) highlight(c, seg.dataset.k);
    } else { tipAt(c, ev, null); if(!c.dataset.pin) highlight(c, null); }
  });
  document.addEventListener("pointerleave", ev=>{ const [c] = calOf(ev.target); if(c){ tipAt(c, ev, null); if(!c.dataset.pin) highlight(c, null); } }, true);
  document.addEventListener("click", ev=>{
    const [c, C] = calOf(ev.target); if(!c) return;
    const lg = ev.target.closest("[data-lg]"), m = ev.target.closest("[data-im]");
    if(lg){
      const k = lg.dataset.lg;
      if(c.dataset.pin===k){ delete c.dataset.pin; highlight(c, null); return; }
      c.dataset.pin = k; highlight(c, k); c.querySelector(".icl-det").innerHTML = payerDetail(C, k);
      c.querySelectorAll(".icl-m").forEach(x=>x.classList.remove("sel"));
    } else if(m){
      const i = +m.dataset.im;
      c.querySelectorAll(".icl-m").forEach(x=>x.classList.toggle("sel", +x.dataset.im===i));
      c.querySelector(".icl-det").innerHTML = monthDetail(C, i);
      const seg = ev.target.closest(".icl-st i");
      if(seg){ c.dataset.pin = seg.dataset.k; highlight(c, seg.dataset.k); } else { delete c.dataset.pin; highlight(c, null); }
    }
  });

  /* =====================================================================
     Kacheln auf der Depot-Seite
     ===================================================================== */
  function spMonat(sp){ return (toNum(sp.betrag)||0) * (sp.tage||[1]).length / (+sp.alle||1); }
  function tiles(D){
    const SP = (P.pf?.sparplaene||[]).filter(s=>s.aktiv!==false);
    const fsa = steuerZahlen()?.genutzt;
    return `<div class="tiles">
      <a href="#sparplaene"><b>💶 Sparpläne</b><span>${SP.length?`${SP.length} aktiv · ${E(SP.reduce((a,s)=>a+spMonat(s),0))}/Monat`:"Einrichten – bucht sich selbst"}</span></a>
      <a href="#steuer"><b>🧾 Steuer-Cockpit</b><span>${fsa!=null?`Freibetrag ${Pc(fsa)} genutzt`:"Freistellungsauftrag & Vorabpauschale"}</span></a>
      <a href="#schneeball"><b>❄️ Dividenden-Ziel</b><span>Wann zahlen Dividenden dein Ziel?</span></a>
      <a href="#durchblick"><b>🔍 ETF-Durchblick</b><span>Was steckt wirklich in deinen ETFs?</span></a>
      <a href="#umschichten"><b>⚖️ Umschichten</b><span>Wohin der nächste Euro soll</span></a>
      <a href="#burggraben"><b>🏰 Burggraben</b><span>Firmen mit dauerhaftem Vorsprung</span></a></div>`;
  }

  /* =====================================================================
     Sparpläne
     ===================================================================== */
  const RHY = {1:"monatlich", 2:"alle 2 Monate", 3:"vierteljährlich", 6:"halbjährlich"};
  function spText(sp){ const t=(sp.tage||[1]); return `${RHY[sp.alle||1]||"monatlich"} am ${t.map(x=>x+".").join(" und ")}`; }
  function naechste(sp){
    const heute = new Date(); heute.setHours(0,0,0,0);
    const start = new Date((sp.start||ymd(heute))+"T00:00:00"), alle = +sp.alle||1, tage=(sp.tage||[1]).map(Number).sort((a,b)=>a-b);
    for(let i=0;i<40;i++){
      const y = heute.getFullYear(), m = heute.getMonth()+i, d0 = new Date(y, m, 1);
      const off = (d0.getFullYear()-start.getFullYear())*12 + d0.getMonth()-start.getMonth();
      if(off<0 || off%alle) continue;
      for(const t of tage){ const d = new Date(d0.getFullYear(), d0.getMonth(), t); if(d>=start && d>=heute && (!sp.gebucht_bis || ymd(d)>sp.gebucht_bis)) return d; }
    }
    return null;
  }
  const VORSCHLAG = [
    {b:/scalable/i, re:/coca|^ko$/i, betrag:5}, {b:/scalable/i, re:/jpmorgan|^jpm$/i, betrag:10}, {b:/scalable/i, re:/realty|^o$/i, betrag:20},
    {b:/trade/i, re:/realty|^o$/i, betrag:1}, {b:/trade/i, re:/600/, betrag:5}, {b:/trade/i, re:/emerging|\bem\b/i, betrag:5},
    {b:/trade/i, re:/msci world(?!.*(high|div|2x|lev))/i, betrag:15}, {b:/trade/i, re:/2x|lever/i, betrag:5},
    {b:/trade/i, re:/high div/i, betrag:15}, {b:/trade/i, re:/prime global/i, betrag:10}];
  function vorschlaege(){
    const L = P.pf.positionen||[], SP = P.pf.sparplaene||[], out = [];
    for(const v of VORSCHLAG){
      const p = L.find(p=>(!p.broker || v.b.test(p.broker)) && (v.re.test(p.name||"") || v.re.test(p.t||"")) && !SP.some(s=>s.pos===p.id) && !out.some(o=>o.p.id===p.id));
      if(p) out.push({p, betrag:v.betrag});
    }
    return out;
  }
  function renderSparplaene(){
    if(!need("Sparpläne")) return;
    const SP = P.pf.sparplaene = P.pf.sparplaene || [], L = P.pf.positionen||[], Z = zOf();
    const name = id => { const p=L.find(x=>x.id===id); return p ? (p.name||p.t||p.isin) : "(Position gelöscht)"; };
    const akt = SP.filter(s=>s.aktiv!==false), mon = akt.reduce((a,s)=>a+spMonat(s),0);
    const brok = {}; akt.forEach(s=>{ const b=(L.find(p=>p.id===s.pos)||{}).broker||"Ohne Broker"; brok[b]=(brok[b]||0)+spMonat(s); });
    const hist = SP.flatMap(s=>(s.buchungen||[]).map(b=>({s, d:b[0], betrag:b[1], stk:b[2], kurs:b[3]}))).sort((a,b)=>b.d.localeCompare(a.d)).slice(0,12);
    const offen = (P.depot?.sparplan_offen||[]).filter(b=>{ const s=SP.find(x=>x.id===b.sp); return s && (!s.gebucht_bis || b.datum>s.gebucht_bis); });
    const V = vorschlaege();
    $("#main").innerHTML = `
      <div class="box dsum" style="margin-top:12px">
        <div><div class="sub">Pro Monat</div><div class="px big2">${E(mon,2)}</div></div>
        <div><div class="sub">Pro Jahr</div><div class="px">${E(mon*12)}</div></div>
        <div><div class="sub">Aktive Pläne</div><div class="px">${akt.length}</div></div>
        <div><div class="sub">Je Broker</div><div style="font-size:13px">${Object.entries(brok).map(([b,v])=>`${esc(b)}: <b>${E(v,2)}</b>`).join("<br>")||"–"}</div></div></div>
      ${offen.length?`<div class="notif">⏳ ${offen.length} Ausführung(en) werden gerade gebucht …</div>`:""}
      <div class="box"><h3>Deine Sparpläne</h3>
        ${SP.map(s=>{ const n=naechste(s); const z=Z[s.pos]; return `<div class="kvrow" style="align-items:center"><span><b>${esc(name(s.pos))}</b> ${s.aktiv===false?'<span class="tag" style="background:var(--soft);color:var(--mut)">pausiert</span>':""}<br>
          <span class="sub">${E(toNum(s.betrag),2)} ${spText(s)}${s.aktiv!==false&&n?` · nächste ${n.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})}`:""}${s.gebucht_bis?` · zuletzt ${F.d(s.gebucht_bis)}`:""}${z?.p_eur?` · Kurs ${E(z.p_eur,2)}`:""}</span></span>
          <button class="btn ghost" data-sp="${esc(s.id)}">Bearbeiten</button></div>`; }).join("") || `<div class="sub">Noch keine Sparpläne. Leg sie hier an, dann bucht die App jede Ausführung automatisch zum Tageskurs in dein Depot.</div>`}
        <div class="links"><button class="btn" id="sp-neu">+ Sparplan</button></div></div>
      ${V.length?`<div class="box"><h3>Vorschläge aus deinem Depot</h3><div class="sub" style="white-space:normal;margin-bottom:6px">Diese Sparpläne hast du mir genannt. Prüf Betrag und Ausführungstag, dann übernehmen. Gebucht wird erst ab dem Startdatum, nichts rückwirkend.</div>
        ${V.map(v=>`<div class="kvrow" style="align-items:center"><span>${esc(v.p.name||v.p.t)} <span class="sub">· ${esc(v.p.broker||"")} · ${E(v.betrag)}/Monat</span></span><button class="btn ghost" data-vor="${esc(v.p.id)}" data-b="${v.betrag}">Übernehmen</button></div>`).join("")}</div>`:""}
      ${hist.length?`<div class="box"><h3>Zuletzt gebucht</h3>${hist.map(h=>`<div class="kvrow"><span>${F.d(h.d)} · ${esc(name(h.s.pos))}<br><span class="sub">${h.stk?`${nf(4).format(h.stk)} Stk. zu ${E(h.kurs,2)}`:"Wert erhöht"}</span></span><b>${E(h.betrag,2)}</b></div>`).join("")}</div>`:""}
      <div class="sub" style="white-space:normal;margin-top:10px">So funktioniert es: Bei jedem Scan prüft die App, ob ein Ausführungstag erreicht ist. Dann rechnet sie die Stückzahl mit dem Schlusskurs dieses Tages (bzw. des nächsten Handelstags) in Euro aus, erhöht deine Position und passt den Einstandskurs an. Beim nächsten Öffnen wird das fest gespeichert, und du bekommst eine Push-Nachricht. Der echte Broker-Kurs kann leicht abweichen. Wenn du ab und zu die CSV deines Brokers importierst, stimmt alles wieder auf den Cent.</div>`;
    $("#sp-neu").onclick = ()=>spEdit(null);
    document.querySelectorAll("[data-sp]").forEach(b=>b.onclick=()=>spEdit(b.dataset.sp));
    document.querySelectorAll("[data-vor]").forEach(b=>b.onclick=()=>spEdit(null, {pos:b.dataset.vor, betrag:+b.dataset.b}));
  }
  function spEdit(id, preset){
    const SP = P.pf.sparplaene = P.pf.sparplaene || [], L = (P.pf.positionen||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    const s = id ? SP.find(x=>x.id===id) : Object.assign({id:uid(), betrag:25, tage:[1], alle:1, start:ymd(new Date()), aktiv:true}, preset||{});
    sheet(head(id?"Sparplan bearbeiten":"Neuer Sparplan")+`<div class="form">
      <label>Position<select class="inp" id="sp-pos">${L.map(p=>`<option value="${esc(p.id)}" ${p.id===s.pos?"selected":""}>${esc(p.name||p.t||p.isin)}${p.broker?" · "+esc(p.broker):""}</option>`).join("")}</select></label>
      <div class="two"><label>Betrag in €<input class="inp" id="sp-b" inputmode="decimal" value="${s.betrag??""}"></label>
      <label>Rhythmus<select class="inp" id="sp-a">${Object.entries(RHY).map(([k,v])=>`<option value="${k}" ${+k===(+s.alle||1)?"selected":""}>${v}</option>`).join("")}</select></label></div>
      <div class="two"><label>Ausführungstag(e) im Monat <span class="sub">(z. B. 2 oder 2, 16)</span><input class="inp" id="sp-t" value="${(s.tage||[1]).join(", ")}"></label>
      <label>Start (erste Ausführung ab)<input class="inp" type="date" id="sp-s" value="${esc(s.start||ymd(new Date()))}"></label></div>
      <div class="sub" style="white-space:normal">Trade Republic führt am 2. oder 16. aus, Scalable Capital am 1., 7., 15. oder 22. Fällt der Tag aufs Wochenende, zählt der nächste Handelstag. Liegt der Start in der Vergangenheit, werden die verpassten Ausführungen nachgebucht. Das nur machen, wenn sie noch nicht in deiner Stückzahl stecken.</div>
      <label class="tg"><input type="checkbox" id="sp-on" ${s.aktiv!==false?"checked":""}> aktiv</label></div>
      <div class="links"><button class="btn" id="sp-save">Speichern</button>${id?`<button class="btn ghost" id="sp-del" style="color:var(--down)">Löschen</button>`:""}</div>`);
    $("#sp-save").onclick = async ()=>{
      const tage = $("#sp-t").value.split(/[,;\s]+/).map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=31).map(x=>Math.min(28,x));
      const b = toNum($("#sp-b").value); if(!b || b<=0) return toast("Bitte einen Betrag eingeben.");
      const neu = Object.assign(s, {pos:$("#sp-pos").value, betrag:b, alle:+$("#sp-a").value, tage:tage.length?[...new Set(tage)]:[1], start:$("#sp-s").value||ymd(new Date()), aktiv:$("#sp-on").checked});
      if(!id) SP.push(neu);
      if(await PLUS.save(id?"Sparplan geändert":"Sparplan angelegt")){ closeDetail(); renderSparplaene(); }
    };
    if(id) $("#sp-del").onclick = async ()=>{ P.pf.sparplaene = SP.filter(x=>x.id!==id); if(await PLUS.save("Sparplan gelöscht", true)){ closeDetail(); renderSparplaene(); } };
  }
  let busy = false;
  async function afterLoad(){
    const D = P.depot, pf = P.pf; if(busy || !D || !pf || !P.token) return;
    const SP = pf.sparplaene||[]; let n=0, sum=0;
    for(const b of (D.sparplan_offen||[])){
      const s = SP.find(x=>x.id===b.sp), p = (pf.positionen||[]).find(x=>x.id===b.pos);
      if(!s || !p || (s.gebucht_bis && b.datum<=s.gebucht_bis) || (s.start && b.datum<s.start)) continue;
      if(b.manuell){ p.manuell = (toNum(p.manuell)||0) + b.betrag; }
      else { const alt = toNum(p.stk)||0, ek = toNum(p.ek);
        p.ek = (ek!=null && alt) ? +((ek*alt + b.betrag)/(alt + b.stk)).toFixed(4) : (alt ? ek : +b.kurs_eur.toFixed(4));
        p.stk = +(alt + b.stk).toFixed(6); }
      s.buchungen = (s.buchungen||[]).concat([[b.datum, b.betrag, b.stk ? +b.stk.toFixed(6) : 0, b.kurs_eur]]).slice(-60);
      s.gebucht_bis = b.datum; n++; sum += b.betrag;
    }
    if(!n) return;
    busy = true;
    try{ if(await PLUS.save(`Sparplan: ${n} Ausführung(en) gebucht`, true)){ toast(`💶 ${n} Sparplan-Ausführung(en) gebucht (${E(sum,2)})`, 5000); if(view()==="sparplaene"||view()==="depot") render(); } }
    finally{ busy = false; }
  }

  /* =====================================================================
     Steuer-Cockpit
     ===================================================================== */
  function steuerZahlen(){
    const D = P.depot, pf = P.pf; if(!D || !pf) return null;
    const jahr = String(new Date().getFullYear()), heute = ymd(new Date());
    const BZ = (D.basiszins||{})[jahr] ?? 0.032;
    const st = pf.steuer || {}, Z = zOf(), L = pf.positionen||[];
    const DI = {}; (D.div_info||[]).forEach(i=>{ if(i.id) DI[i.id] = i.jahr; });
    const kirche = !!st.kirche;
    const rate = kirche ? (0.25/1.0225)*1.055 + (0.25/1.0225)*0.09 : 0.26375; // mit 9 % Kirchensteuer (NRW): 27,99 %
    const frei = st.verheiratet ? 2000 : 1000;
    const brokers = [...new Set(L.map(p=>p.broker||"Ohne Broker"))];
    const B = Object.fromEntries(brokers.map(b=>[b,{b, div:0, rest:0, gewinne:toNum((st.gewinne||{})[b])||0, vp:0, vpPos:[], jahr12:0, fsa:toNum((st.fsa||{})[b])}]));
    for(const p of L){
      const z = Z[p.id]; if(!z) continue; const b = B[p.broker||"Ohne Broker"];
      const tf = isETF(z) ? 0.7 : 1;  // Teilfreistellung Aktien-ETF 30 %
      b.div += (z.div_bisher||0) * tf;
      b.jahr12 += (DI[p.id] ?? z.div_jahr ?? 0) * tf;
      if(isETF(z) && z.p_eur_ja && z.p_eur && z.stk){
        const aus = z.div_bisher||0, w0 = z.stk*z.p_eur_ja, basis = w0*BZ*0.7, zuwachs = (z.p_eur - z.p_eur_ja)*z.stk + aus;
        const vp = Math.max(0, Math.min(basis, zuwachs) - aus);
        b.vp += vp*0.7; b.vpPos.push({name:z.name, w0, basis, zuwachs, aus, vp, stpfl:vp*0.7});
      }
    }
    for(const t of (D.div_termine||[])){
      if(t.datum<=heute || t.datum.slice(0,4)!==jahr) continue;
      const p = L.find(x=>x.id===t.id); if(!p) continue; const z = Z[p.id];
      B[p.broker||"Ohne Broker"].rest += t.betrag * (isETF(z)?0.7:1);
    }
    const R = Object.values(B).map(b=>Object.assign(b, {summe:b.div+b.rest+b.gewinne}))
      .filter(b=>b.b!=="Ohne Broker" || b.summe || b.jahr12 || b.vp || b.fsa);
    const summe = R.reduce((a,b)=>a+b.summe,0), fsaSum = R.reduce((a,b)=>a+(b.fsa||0),0);
    R.forEach(b=>{ b.ueber = b.fsa!=null ? Math.max(0, b.summe-b.fsa) : null; b.steuer = b.ueber!=null ? b.ueber*rate : null; });
    // Vorschlag fürs nächste Jahr: Dividenden (12 Monate) + Vorabpauschale (fließt am 1. Werktag zu)
    const bedarf = R.map(b=>b.jahr12 + b.vp), bs = bedarf.reduce((a,x)=>a+x,0);
    R.forEach((b,i)=>b.vorschlag = bs ? Math.round(frei*bedarf[i]/bs) : Math.round(frei/R.length));
    return {jahr, BZ, R, summe, frei, fsaSum, rate, kirche, genutzt: summe/frei, vp: R.reduce((a,b)=>a+b.vp,0)};
  }
  function renderSteuer(){
    if(!need("Steuer-Cockpit")) return;
    if(!P.depot){ $("#main").innerHTML = `<div class="notif">⏳ Die erste Auswertung läuft noch.</div>`; return; }
    const S = steuerZahlen(), st = P.pf.steuer = P.pf.steuer || {};
    const nj = +S.jahr+1;
    $("#main").innerHTML = `
      <div class="box dsum" style="margin-top:12px">
        <div><div class="sub">Steuerpflichtige Erträge ${S.jahr}</div><div class="px big2">${E(S.summe)}</div><div class="sub">bisher + noch erwartet</div></div>
        <div><div class="sub">Sparerpauschbetrag</div><div class="px">${Pc(S.genutzt)} genutzt</div><div class="tr" style="margin-top:6px"><div class="fi" style="width:${Math.min(100,S.genutzt*100)}%;${S.genutzt>1?"background:var(--down)":""}"></div></div><div class="sub">${E(S.summe)} von ${E(S.frei)}</div></div>
        <div><div class="sub">Freistellungsaufträge</div><div class="px ${S.fsaSum>S.frei?"down":""}">${E(S.fsaSum)}</div><div class="sub">${S.fsaSum>S.frei?"⚠ mehr als erlaubt!":S.fsaSum<S.frei?`${E(S.frei-S.fsaSum)} noch frei`:"voll verteilt ✓"}</div></div>
        <div><div class="sub">Vorabpauschale ${S.jahr} (geschätzt)</div><div class="px">${E(S.vp,2)}</div><div class="sub">steuerpflichtig, am 4.1.${nj}</div></div></div>
      <div class="box"><h3>Je Broker · ${S.jahr}</h3>
        <table class="tbl"><tr><th>Broker</th><th>Dividenden bisher</th><th>noch erwartet</th><th>Kursgewinne</th><th>Freist.-Auftrag</th><th>Steuer</th></tr>
        ${S.R.map(b=>`<tr><td><b>${esc(b.b)}</b></td><td>${E(b.div)}</td><td>${E(b.rest)}</td>
          <td><input class="inl" data-g="${esc(b.b)}" inputmode="decimal" value="${b.gewinne||""}" placeholder="0"></td>
          <td><input class="inl" data-f="${esc(b.b)}" inputmode="decimal" value="${b.fsa??""}" placeholder="?"></td>
          <td class="${b.steuer>0?"down":""}">${b.fsa==null?"?":b.steuer>0?"≈ "+E(b.steuer):"0 €"}</td></tr>`).join("")}</table>
        <div class="form"><label class="tg"><input type="checkbox" id="st-k" ${st.kirche?"checked":""}> Kirchensteuer (NRW 9 %)</label>
        <label class="tg"><input type="checkbox" id="st-v" ${st.verheiratet?"checked":""}> zusammen veranlagt (2.000 € Freibetrag)</label></div>
        <div class="links"><button class="btn" id="st-save">Speichern</button></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Trag bei „Freist.-Auftrag“ ein, was du beim jeweiligen Broker eingestellt hast, und bei „Kursgewinne“ realisierte Gewinne aus Verkäufen dieses Jahr (Verluste als Minus). ETF-Ausschüttungen zählen wegen der Teilfreistellung nur zu 70 %. Über dem Freibetrag fallen ${nf(2).format(S.rate*100)} % an. Ausländische Quellensteuer (z. B. 15 % bei US-Aktien) wird darauf angerechnet.</div></div>
      <div class="box"><h3>Vorschlag: Freistellungsaufträge für ${nj}</h3>
        ${S.R.map(b=>`<div class="kvrow"><span>${esc(b.b)}<br><span class="sub">erwartet ${E(b.jahr12)} Dividenden + ${E(b.vp)} Vorabpauschale</span></span><b>${E(b.vorschlag)}</b></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Aufgeteilt nach den erwarteten Erträgen je Broker. Die Vorabpauschale für ${S.jahr} wird steuerlich erst am ${nj===2027?"4. Januar 2027":"ersten Werktag "+nj} fällig und zählt deshalb schon zum Freibetrag von ${nj}. Ändern kannst du den Auftrag jederzeit in der App deines Brokers.</div></div>
      <div class="box"><h3>Vorabpauschale ${S.jahr} je ETF</h3>
        ${S.R.flatMap(b=>b.vpPos.map(v=>Object.assign({b:b.b},v))).map(v=>`<div class="kvrow"><span><b>${esc(v.name)}</b> <span class="sub">· ${esc(v.b)}</span><br><span class="sub">Wert 1.1. ${E(v.w0)} · Basisertrag ${E(v.basis,2)} · Wertzuwachs ${Es(v.zuwachs)}${v.aus?` · Ausschüttungen ${E(v.aus,2)}`:""}</span></span><b>${E(v.stpfl,2)}<br><span class="sub">von ${E(v.vp,2)}</span></b></div>`).join("") || `<div class="sub">Keine ETFs mit Kursdaten.</div>`}
        <div class="sub" style="white-space:normal;margin-top:6px">Rechnung: Wert am Jahresanfang × Basiszins ${nf(2).format(S.BZ*100)} % × 0,7. Höchstens so viel, wie der ETF im Jahr zugelegt hat, minus Ausschüttungen. Davon sind bei Aktien-ETFs 70 % steuerpflichtig. Annahme: Du hattest die Anteile schon am 1. Januar. Für später gekaufte Anteile (z. B. per Sparplan) sinkt sie um 1/12 je vollem Monat, die Zahl ist also eine Obergrenze. Endgültig wird sie mit dem Kurs vom 31.12. Fällt der ETF bis dahin, sinkt sie. Halte Anfang Januar etwas Geld auf dem Verrechnungskonto, falls der Freibetrag nicht reicht.</div></div>
      <div class="box"><h3>Broker zuordnen</h3><div class="sub" style="white-space:normal;margin-bottom:6px">Der Freistellungsauftrag gilt je Broker. Ordne jede Position ihrem Broker zu, dann rechnet das Cockpit getrennt.</div>
        ${(P.pf.positionen||[]).slice().sort((a,b)=>(!!a.broker)-(!!b.broker) || (a.name||"").localeCompare(b.name||"")).map(p=>`<div class="kvrow" style="align-items:center"><span>${esc(p.name||p.t||p.isin)}</span>
          <select class="inl" style="width:170px" data-br="${esc(p.id)}">${["","Scalable Capital","Trade Republic",...new Set((P.pf.positionen||[]).map(x=>x.broker).filter(b=>b&&!/^(Scalable Capital|Trade Republic)$/.test(b)))].map(b=>`<option value="${esc(b)}" ${(p.broker||"")===b?"selected":""}>${b?esc(b):"– bitte wählen –"}</option>`).join("")}<option value="__neu">anderer …</option></select></div>`).join("")}
        <div class="links"><button class="btn" id="st-br">Zuordnung speichern</button></div></div>
      <div class="sub" style="white-space:normal;margin-top:10px">Keine Steuerberatung, nur eine Schätzung mit deinen Depotdaten.</div>`;
    document.querySelectorAll("[data-br]").forEach(sel=>sel.onchange=()=>{ if(sel.value==="__neu"){ const n=(prompt("Name des Brokers:")||"").trim(); if(n){ const o=document.createElement("option"); o.value=n; o.textContent=n; sel.insertBefore(o, sel.lastElementChild); sel.value=n; } else sel.value=""; } });
    $("#st-br").onclick = async ()=>{ document.querySelectorAll("[data-br]").forEach(sel=>{ const p=P.pf.positionen.find(x=>x.id===sel.dataset.br); if(p){ if(sel.value) p.broker=sel.value; else delete p.broker; } });
      if(await PLUS.save("Broker zugeordnet")) renderSteuer(); };
    $("#st-save").onclick = async ()=>{
      st.fsa = {}; st.gewinne = {};
      document.querySelectorAll("[data-f]").forEach(i=>{ const v=toNum(i.value); if(v!=null) st.fsa[i.dataset.f]=v; });
      document.querySelectorAll("[data-g]").forEach(i=>{ const v=toNum(i.value); if(v) st.gewinne[i.dataset.g]=v; });
      st.kirche = $("#st-k").checked; st.verheiratet = $("#st-v").checked;
      if(await PLUS.save("Steuerdaten geändert", true)) renderSteuer();
    };
  }

  /* =====================================================================
     Dividenden-Schneeball
     ===================================================================== */
  function renderSchneeball(){
    const D = P.depot, S = D?.summe;
    const divJ = D ? (D.div_monate||[]).reduce((a,b)=>a+b,0) : 0;
    const spM = (P.pf?.sparplaene||[]).filter(s=>s.aktiv!==false).reduce((a,s)=>a+spMonat(s),0);
    const def = {ziel:1000, rate:Math.round(spM)||100, rend:+(S?.wert? Math.max(0.5, Math.min(8, divJ/S.wert*100)) : 3).toFixed(1), dw:5, kw:3, rg:0, reinv:true, steuer:true, gj:""};
    const o = Object.assign({}, def, store.get("schnee", {}));
    const start = S?.wert || 0;
    $("#main").innerHTML = `
      <div class="box" style="margin-top:12px"><h3>Dein Dividenden-Ziel</h3>
        <div class="chips">${[[1000,"1.000 €/Jahr (steuerfrei)"],[3000,"250 €/Monat"],[6000,"500 €/Monat"],[12000,"1.000 €/Monat"],[24000,"2.000 €/Monat"]].map(([v,l])=>`<button data-z="${v}" class="${+o.ziel===v?"on":""}">${l}</button>`).join("")}</div>
        <div id="sb-out"></div></div>
      <div class="box"><h3>Annahmen</h3>
        ${[["ziel","Ziel (€ Dividende pro Jahr)",500,36000,100,v=>E(v)],["rate","Sparrate pro Monat",0,2000,1,v=>E(v)],["rg","Sparrate steigt jährlich um",0,10,0.5,v=>nf(1).format(v)+" %"],
           ["rend","Dividendenrendite heute",0.5,8,0.1,v=>nf(1).format(v)+" %"],["dw","Dividendenwachstum pro Jahr",0,12,0.5,v=>nf(1).format(v)+" %"],["kw","Kursanstieg pro Jahr",-2,10,0.5,v=>nf(1).format(v)+" %"]]
          .map(([k,l,mn,mx,st,fmt])=>`<div class="sl"><label for="sb-${k}">${l}</label><output id="so-${k}">${fmt(+o[k])}</output><input type="range" id="sb-${k}" min="${mn}" max="${mx}" step="${st}" value="${o[k]}"></div>`).join("")}
        <div class="form" style="margin-top:4px"><label class="tg"><input type="checkbox" id="sb-reinv" ${o.reinv?"checked":""}> Dividenden wieder anlegen</label>
          <label class="tg"><input type="checkbox" id="sb-steuer" ${o.steuer?"checked":""}> Steuern abziehen (über 1.000 €: 26,4 %)</label>
          <label>Dein Geburtsjahr <span class="sub">(optional, für „mit wie vielen Jahren“)</span><input class="inp" id="sb-gj" inputmode="numeric" value="${esc(o.gj||"")}" style="max-width:120px"></label></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Start: dein Depot heute (${E(start)}) mit ${E(divJ)} Dividenden im Jahr. Voreingestellt sind deine Sparpläne (${E(spM)}/Monat) und die Dividendenrendite deines Depots. Ein Rechenbeispiel, keine Prognose.</div></div>`;
    const fmts = {ziel:v=>E(v), rate:v=>E(v), rg:v=>nf(1).format(v)+" %", rend:v=>nf(1).format(v)+" %", dw:v=>nf(1).format(v)+" %", kw:v=>nf(1).format(v)+" %"};
    const calc = () => {
      for(const k of Object.keys(fmts)){ o[k] = +$("#sb-"+k).value; $("#so-"+k).textContent = fmts[k](o[k]); }
      o.reinv = $("#sb-reinv").checked; o.steuer = $("#sb-steuer").checked; o.gj = $("#sb-gj").value.trim();
      store.set("schnee", o);
      document.querySelectorAll("[data-z]").forEach(b=>b.classList.toggle("on", +b.dataset.z===o.ziel));
      let V = start, y = o.rend/100, rate = o.rate, jahre = [], ziel = null, eigen = start, divSum = 0;
      const gp = Math.pow(1+o.kw/100, 1/12), gy = Math.pow((1+o.dw/100)/(1+o.kw/100), 1/12), gr = Math.pow(1+o.rg/100, 1/12);
      const marks = [[1200,"100 €/Monat"],[3000,"250 €/Monat"],[6000,"500 €/Monat"],[12000,"1.000 €/Monat"]].filter(m=>m[0]<o.ziel*1.01||m[0]===1200);
      const hit = {};
      for(let m=1; m<=12*60; m++){
        const divA = V*y, divM = divA/12;
        const tax = o.steuer ? Math.max(0, divA-1000)/Math.max(divA,1)*divM*0.26375 : 0;
        divSum += divM - tax;
        V = V*gp + rate + (o.reinv ? divM - tax : 0); eigen += rate;
        y *= gy; rate *= gr;
        const nowA = V*y;
        for(const [v,l] of marks) if(hit[l]==null && nowA>=v) hit[l] = m/12;
        if(m%12===0) jahre.push({j:m/12, div:nowA, V});
        if(ziel==null && nowA>=o.ziel){ ziel = m/12; }
        if(ziel!=null && m>=Math.max(12*Math.ceil(ziel)+24, 120)) break;
      }
      const yNow = new Date().getFullYear(), gj = parseInt(o.gj,10);
      const zj = ziel!=null ? Math.ceil(ziel) : null;
      const pts = jahre.slice(0, Math.min(jahre.length, Math.max(10, (zj||40)+3)));
      const mx = Math.max(o.ziel*1.15, ...pts.map(p=>p.div)), w=640, h=170;
      const X = i => 4 + i/(pts.length-1||1)*(w-8), Yv = v => h-6-(v/mx)*(h-20);
      const line = pts.map((p,i)=>`${X(i).toFixed(1)},${Yv(p.div).toFixed(1)}`).join(" ");
      const zi = zj ? pts.findIndex(p=>p.j>=ziel) : -1;
      $("#sb-out").innerHTML = ziel!=null ? `
        <div class="big3">${ziel<1?"Schon erreicht 🎉":`in ${nf(ziel<10?1:0).format(ziel)} Jahren`}</div>
        <div class="sub" style="white-space:normal">${ziel>=1?`Etwa ${yNow+Math.round(ziel)}${gj>1900?`, mit ${yNow+Math.round(ziel)-gj} Jahren`:""}, zahlt dein Depot ${E(o.ziel)} Dividende im Jahr (${E(o.ziel/12)} im Monat).`:"Dein Depot zahlt schon so viel."}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" style="display:block;height:170px;margin-top:8px">
          <line x1="0" x2="${w}" y1="${Yv(o.ziel)}" y2="${Yv(o.ziel)}" stroke="var(--warn)" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
          <polygon points="${X(0)},${h} ${line} ${X(pts.length-1)},${h}" fill="var(--acc)" opacity=".12"/>
          <polyline points="${line}" fill="none" stroke="var(--acc)" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
          ${zi>=0?`<circle cx="${X(zi)}" cy="${Yv(pts[zi].div)}" r="5" fill="var(--warn)"/>`:""}</svg>
        <div style="display:flex;justify-content:space-between;color:var(--mut);font-size:12px"><span>heute</span><span>┅ Ziel ${E(o.ziel)}/Jahr</span><span>in ${pts.length} Jahren</span></div>
        <div class="mini" style="margin-top:10px">
          <div><b>${E(jahre[Math.max(0,Math.ceil(ziel)-1)]?.V)}</b><span>Depotwert dann</span></div>
          <div><b>${E(start + o.rate*12*Math.max(1,ziel))}</b><span>davon ca. eingezahlt</span></div>
          <div><b>${E(jahre[0]?.div)}</b><span>Dividende in 1 Jahr</span></div></div>
        ${Object.keys(hit).length?`<div style="margin-top:8px">${Object.entries(hit).map(([l,j])=>`<div class="kvrow"><span>${l}</span><b>${j<1?"erreicht":"in "+nf(j<10?1:0).format(j)+" J."}</b></div>`).join("")}</div>`:""}`
        : `<div class="big3">nicht in 60 Jahren</div><div class="sub">Mit diesen Annahmen reicht es nicht. Erhöh die Sparrate oder das Dividendenwachstum.</div>`;
    };
    document.querySelectorAll("#main input").forEach(i=>i.addEventListener("input", calc));
    document.querySelectorAll("[data-z]").forEach(b=>b.onclick=()=>{ $("#sb-ziel").value=b.dataset.z; calc(); });
    calc();
  }

  /* =====================================================================
     Burggraben-Ranking
     ===================================================================== */
  const MC = {bruttomarge:["Bruttomarge","im Vergleich zur eigenen Branche: Preissetzungsmacht"], op_marge:["Operative Marge","im Branchenvergleich: Effizienz, Größenvorteile"],
    fcf_marge:["Free-Cashflow-Marge","wie viel vom Umsatz als echtes Geld übrig bleibt"], kapitalrendite:["Kapitalrendite","Eigenkapital- und Gesamtkapitalrendite"],
    groesse:["Größe","Börsenwert: Skaleneffekte, Marktmacht"], stabilitaet:["Stabilität","geringe Kursschwankung"], wachstum:["Wachstum","Umsatzwachstum"]};
  let bgUi = {s:"alle", nur:false, lim:50};
  function renderBurggraben(){
    const mine = new Set([...((P.depot?.positionen)||[]).map(z=>z.t), ...stars]);
    const all = DATA.stocks.filter(s=>s.moat!=null);
    const sek = [...new Set(all.map(s=>s.s))].sort();
    const L = all.filter(s=>(bgUi.s==="alle"||s.s===bgUi.s) && (!bgUi.nur || mine.has(s.t))).sort((a,b)=>b.moat-a.moat);
    $("#main").innerHTML = `
      <div class="filters"><select id="bg-s"><option value="alle">Alle Branchen</option>${sek.map(s=>`<option ${bgUi.s===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
        <label class="toggle"><input type="checkbox" id="bg-n" ${bgUi.nur?"checked":""}> nur Depot + Merkliste</label></div>
      <div class="hint">${all.length?`${L.length} Aktien · Burggraben = dauerhafter Vorsprung vor der Konkurrenz. Tippe für Details und den Fairer-Wert-Rechner.`:"Die Burggraben-Daten werden gerade gesammelt: Jede Aktie bekommt einmal am Tag frische Kennzahlen. In spätestens 24 Stunden ist die Liste komplett."}</div>
      <div class="list">${L.slice(0,bgUi.lim).map((s,i)=>`<div class="row" data-t="${esc(s.t)}">
        <div class="score ${scoreCls(s.moat)}" title="Burggraben-Score">${Math.round(s.moat)}</div>
        <div style="min-width:0"><div class="nm">${i+1}. ${mine.has(s.t)?"★ ":""}${esc(s.n)}</div><div class="sub">${esc(s.t)} · ${esc(s.s)}</div>
          <div class="why">Bruttomarge ${Pc(s.bm)} · op. Marge ${Pc(s.om)} · FCF-Marge ${Pc(s.fcfm)} · EK-Rendite ${Pc(s.roe)}</div></div>
        <div class="right"><span class="px">${F.cur(s.p,s.cur)}</span>${pill(s.r1d)}<span class="sub">Chance ${s.score==null?"–":Math.round(s.score)}</span></div></div>`).join("")}</div>
      ${L.length>bgUi.lim?`<div class="links" style="justify-content:center"><button class="btn ghost" id="bg-more">Mehr anzeigen</button></div>`:""}
      <div class="box"><h3>So entsteht der Score</h3>${Object.values(MC).map(([l,t])=>`<div class="kvrow"><span>${l}</span><span class="sub" style="text-align:right">${t}</span></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Jeder Teil ist ein Rang (80 = besser als 80 % der Vergleichsgruppe). Margen werden nur innerhalb der eigenen Branche verglichen, weil Software immer höhere Margen hat als ein Supermarkt. Firmen mit Verlust bekommen höchstens 30 Punkte. Ein Burggraben ist eine Eigenschaft der Firma, kein Kaufsignal: Auch ein toller Burggraben kann zu teuer sein, dafür gibt es den Fairer-Wert-Rechner im Detail.</div></div>`;
    $("#bg-s").onchange = e=>{ bgUi.s=e.target.value; bgUi.lim=50; renderBurggraben(); };
    $("#bg-n").onchange = e=>{ bgUi.nur=e.target.checked; renderBurggraben(); };
    $("#bg-more") && ($("#bg-more").onclick = ()=>{ bgUi.lim+=50; renderBurggraben(); });
    document.querySelectorAll(".row[data-t]").forEach(r=>r.onclick=()=>openDetail(r.dataset.t));
  }

  /* =====================================================================
     Aktien-Detail: Burggraben + Fairer Wert
     ===================================================================== */
  function fairBasis(s){
    const aktien = s.aktien || (s.mcap && s.p ? s.mcap/s.p : null);
    const fcf = s.fcf && aktien && s.fcf>0 ? s.fcf/aktien : null;
    const eps = s.kgv>0 ? s.p/s.kgv : (s.kgv_fwd>0 ? s.p/s.kgv_fwd : null);
    return {fcf, eps};
  }
  function dcf(b, g1, g2, gt, r){
    let v=0, cf=b; for(let t=1;t<=10;t++){ cf *= 1+(t<=5?g1:g2); v += cf/Math.pow(1+r,t); }
    return v + cf*(1+gt)/(r-gt)/Math.pow(1+r,10);
  }
  function detail(s){
    const mc = s.mc||{}, fb = fairBasis(s);
    const moat = s.moat==null ? "" : `<div class="box"><h3>Burggraben ${Math.round(s.moat)} / 100</h3>
      ${Object.entries(MC).map(([k,[l,tip]])=>`<div class="bar" title="${esc(tip)}"><span>${l}</span><div class="tr"><div class="fi" style="width:${mc[k]==null?0:Math.round(mc[k]*100)}%"></div></div><span class="v">${mc[k]==null?"–":Math.round(mc[k]*100)}</span></div>`).join("")}
      <div class="sub" style="white-space:normal;margin-top:6px">Bruttomarge ${Pc(s.bm,1)} · operative Marge ${Pc(s.om,1)} · Free-Cashflow-Marge ${Pc(s.fcfm,1)}. Margen im Vergleich zur Branche „${esc(s.s)}“.</div></div>`;
    if(!fb.fcf && !fb.eps) return moat;
    const fin = /Finanz/.test(s.s||"");
    const art = (!fin && fb.fcf) ? "fcf" : "eps";
    const g1 = Math.max(0, Math.min(0.2, s.uw!=null ? s.uw : 0.06));
    return moat + `<div class="box" id="fw"><h3>Fairer-Wert-Rechner</h3>
      <div class="seg" style="float:none;display:inline-flex;margin-bottom:6px">${fb.fcf?`<a data-fw="fcf" class="${art==="fcf"?"on":""}">Free Cashflow</a>`:""}${fb.eps?`<a data-fw="eps" class="${art==="eps"?"on":""}">Gewinn</a>`:""}</div>
      <div id="fw-out"></div>
      ${[["g1","Wachstum Jahr 1–5",-5,30,0.5,g1*100],["g2","Wachstum Jahr 6–10",-5,20,0.5,g1*50],["gt","Danach für immer",0,4,0.25,2.5],["r","Deine Renditeerwartung (Abzinsung)",6,14,0.25,9]]
        .map(([k,l,mn,mx,st,v])=>`<div class="sl"><label for="fw-${k}">${l}</label><output id="fo-${k}">${nf(1).format(v)} %</output><input type="range" id="fw-${k}" min="${mn}" max="${mx}" step="${st}" value="${(+v).toFixed(2)}"></div>`).join("")}
      <div class="sub" style="white-space:normal">Diskontierte Cashflows über 10 Jahre plus Endwert. Schieb die Regler: Kleine Änderungen bei Wachstum und Renditeerwartung verändern den fairen Wert stark. Genau das zeigt, wie unsicher jede Bewertung ist. Kennzahlen von Yahoo (in Berichtswährung).</div></div>`;
  }
  function bind(s){
    const box = document.getElementById("fw"); if(!box) return;
    const fb = fairBasis(s); let art = box.querySelector(".seg a.on")?.dataset.fw || "eps";
    const calc = () => {
      const v = k => +$("#fw-"+k).value/100;
      ["g1","g2","gt","r"].forEach(k=>$("#fo-"+k).textContent = nf(k==="gt"?2:1).format(+$("#fw-"+k).value)+" %");
      const b = art==="fcf" ? fb.fcf : fb.eps, r = v("r"), gt = Math.min(v("gt"), r-0.01);
      const fair = dcf(b, v("g1"), v("g2"), gt, r), mos = fair/s.p - 1;
      // Was preist der Markt ein? (Wachstum Jahr 1–5, Jahr 6–10 = die Hälfte)
      let lo=-0.3, hi=0.8; for(let i=0;i<60;i++){ const m=(lo+hi)/2; if(dcf(b, m, m/2, gt, r) > s.p) hi=m; else lo=m; }
      const impl = (lo+hi)/2;
      $("#fw-out").innerHTML = `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline">
        <div><div class="sub">Fairer Wert je Aktie</div><div class="big3">${F.cur(fair, s.cur)}</div></div>
        <div><div class="sub">Kurs</div><div class="px">${F.cur(s.p, s.cur)}</div></div>
        <div><div class="sub">${mos>=0?"Sicherheitsmarge":"Aufpreis"}</div><div class="px ${mos>=0?"up":"down"}">${mos>=0?"":"+"}${nf(0).format(Math.abs(mos)*100)} %</div></div></div>
        <div class="sub" style="white-space:normal;margin:4px 0 6px">${mos>=0.15?"Mit deinen Annahmen ist die Aktie günstig.":mos>=-0.1?"Mit deinen Annahmen ist die Aktie ungefähr fair bewertet.":"Mit deinen Annahmen ist die Aktie teuer."} Der aktuelle Kurs unterstellt rund <b>${impl>0.79?"über 80":nf(1).format(impl*100)} % Wachstum pro Jahr</b> in den nächsten 5 Jahren (bei ${nf(1).format(r*100)} % Renditeerwartung). Basis: ${art==="fcf"?"Free Cashflow":"Gewinn"} ${F.cur(b, s.cur)} je Aktie.</div>`;
    };
    box.querySelectorAll("input").forEach(i=>i.addEventListener("input", calc));
    box.querySelectorAll("[data-fw]").forEach(a=>a.onclick=()=>{ art=a.dataset.fw; box.querySelectorAll("[data-fw]").forEach(x=>x.classList.toggle("on", x===a)); calc(); });
    calc();
  }

  /* =====================================================================
     ETF-Durchblick
     ===================================================================== */
  function renderDurchblick(){
    if(!need("ETF-Durchblick")) return;
    const B = P.depot?.durchblick;
    if(!B){ $("#main").innerHTML = `<div class="notif" style="margin-top:12px">⏳ Der ETF-Durchblick wird beim nächsten Scan berechnet.</div>`; return; }
    const mx = Math.max(...B.top.map(x=>x.anteil), 0.0001);
    $("#main").innerHTML = `
      <div class="box" style="margin-top:12px"><h3>Deine größten Firmen – direkt und über ETFs</h3>
        ${B.top.slice(0,25).map((x,i)=>`<div class="ex" style="border-bottom:1px solid var(--line)"><div class="bar" style="grid-template-columns:minmax(110px,190px) 1fr 110px;cursor:pointer;margin:6px 0">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i+1}. ${esc(x.name)}</span><div class="tr"><div class="fi" style="width:${Math.max(1,x.anteil/mx*100)}%;${x.direkt?"":"background:var(--mut)"}"></div></div>
          <span class="v">${nf(1).format(x.anteil*100)} % · ${E(x.wert)}</span></div>
          <div class="expand">${x.quellen.map(([q,v])=>`<div class="kvrow"><span class="sub">${q==="direkt"?"direkt gehalten":"über "+esc(q)}</span><b>${E(v,2)}</b></div>`).join("")}</div></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Tipp auf eine Firma, um zu sehen, woher der Anteil kommt. Grün = auch direkt gehalten, grau = nur über ETFs.</div></div>
      <div class="box"><h3>Branchen inkl. ETF-Inhalt</h3>${B.sektoren.slice(0,12).map(([k,v,p])=>`<div class="bar" style="grid-template-columns:140px 1fr 92px"><span>${esc(k)}</span><div class="tr"><div class="fi" style="width:${Math.max(1,p*100)}%"></div></div><span class="v">${nf(1).format(p*100)} %</span></div>`).join("")}</div>
      <div class="box"><h3>Deine ETFs</h3>${B.etfs.map(e=>`<div class="ex"><div class="kvrow" style="cursor:pointer"><span><b>${esc(e.name)}</b>${e.hebel>1?` <span class="tag dividende">Hebel ${e.hebel}×</span>`:""}<br>
          <span class="sub">${e.quelle?`${e.naeherung?`Näherung über ${esc(e.quelle)} · `:""}Top-10 = ${nf(0).format(e.top_anteil*100)} % des ETFs`:"Yahoo liefert keine Inhalte"}</span></span><b>${E(e.wert)}</b></div>
          <div class="expand">${(e.top||[]).map(([sym,nm,w])=>`<div class="kvrow"><span class="sub">${esc(nm)}</span><b>${nf(1).format(w*100)} %</b></div>`).join("")}</div></div>`).join("") || `<div class="sub">Keine ETFs im Depot.</div>`}
        <div class="sub" style="white-space:normal;margin-top:6px">Yahoo meldet je ETF nur die 10 größten Positionen und die Branchenaufteilung. Findet Yahoo deinen europäischen ETF nicht, nehme ich einen vergleichbaren US-ETF als Näherung (z. B. URTH für MSCI World). Bei gehebelten ETFs zählt der Anteil doppelt, weil du wirtschaftlich das Doppelte trägst.</div></div>`;
    document.querySelectorAll(".ex").forEach(x=>x.firstElementChild.onclick=()=>x.classList.toggle("open"));
  }

  /* =====================================================================
     Umschichtungs-Helfer
     ===================================================================== */
  const grpDef = z => !z ? "Sonstiges" : z.manuell ? "Sonstiges" : isETF(z) ? "ETFs" : z.art==="CRYPTOCURRENCY" ? "Krypto" : "Einzelaktien";
  function renderUmschichten(){
    if(!need("Umschichten")) return;
    if(!P.depot){ $("#main").innerHTML = `<div class="notif">⏳ Die erste Auswertung läuft noch.</div>`; return; }
    const Z = zOf(), L = (P.pf.positionen||[]).filter(p=>Z[p.id]?.wert>0);
    const zi = P.pf.ziele = P.pf.ziele || {};
    zi.gruppe = zi.gruppe || {};
    const grp = p => zi.gruppe[p.id] || grpDef(Z[p.id]);
    const ist = {}; let V = 0;
    L.forEach(p=>{ const g=grp(p); ist[g]=(ist[g]||0)+Z[p.id].wert; V+=Z[p.id].wert; });
    const namen = [...new Set([...Object.keys(ist), ...Object.keys(zi.ziel||{})])];
    if(!zi.ziel){ zi.ziel = Object.fromEntries(namen.map(g=>[g, Math.round((ist[g]||0)/V*100)])); zi._neu = true; }
    const spM = (P.pf.sparplaene||[]).filter(s=>s.aktiv!==false).reduce((a,s)=>a+spMonat(s),0);
    const betrag = store.get("umsch_b", Math.round(spM)||500);
    $("#main").innerHTML = `
      <div class="box" style="margin-top:12px"><h3>Wohin geht der nächste Euro?</h3>
        <div class="form"><label>Betrag, den du investieren willst<input class="inp" id="u-b" inputmode="decimal" value="${betrag}" style="max-width:160px"></label></div>
        <div id="u-out" style="margin-top:8px"></div></div>
      <div class="box"><h3>Ist und Ziel</h3><div id="u-ist"></div>
        <div class="sub" style="white-space:normal;margin-top:6px">${zi._neu?"Voreingestellt ist deine heutige Verteilung. Stell deine Wunsch-Anteile ein, dann rechne ich aus, wohin neues Geld fließen sollte. ":""}Die Summe muss 100 % ergeben. Es wird nur mit neuem Geld ausgeglichen, ohne Verkaufen (das spart Steuern).</div>
        <div class="links"><button class="btn" id="u-save">Ziele speichern</button></div></div>
      <div class="box"><h3>Gruppen zuordnen</h3>
        ${L.sort((a,b)=>Z[b.id].wert-Z[a.id].wert).map(p=>`<div class="kvrow" style="align-items:center"><span>${esc(p.name||p.t)} <span class="sub">· ${E(Z[p.id].wert)}</span></span>
          <select class="inl" style="width:150px" data-ug="${esc(p.id)}">${namen.map(g=>`<option ${grp(p)===g?"selected":""}>${esc(g)}</option>`).join("")}<option value="__neu">+ neue Gruppe …</option></select></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Du kannst eigene Gruppen bilden, z. B. „Welt-ETF“, „Dividenden“, „Schwellenländer“.</div></div>`;
    const draw = () => {
      const T = Object.values(zi.ziel).reduce((a,b)=>a+(+b||0),0);
      $("#u-ist").innerHTML = namen.map(g=>{ const a=(ist[g]||0)/V, z=(+zi.ziel[g]||0)/100; return `<div style="margin:8px 0">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(g)}</b><span class="sub">Ist ${nf(1).format(a*100)} % · Ziel <input class="inl" style="width:64px" data-uz="${esc(g)}" inputmode="decimal" value="${zi.ziel[g]??0}"> %</span></div>
        <div class="ist"><div class="fi" style="width:${Math.min(100,a*100)}%;${a>z+0.02?"background:var(--warn)":""}"></div><div class="mk" style="left:${Math.min(100,z*100)}%"></div></div></div>`; }).join("")
        + `<div class="sub" style="${Math.abs(T-100)>0.5?"color:var(--down)":""}">Summe Ziele: ${nf(0).format(T)} %</div>`;
      document.querySelectorAll("[data-uz]").forEach(i=>i.onchange=()=>{ zi.ziel[i.dataset.uz]=toNum(i.value)||0; delete zi._neu; draw(); out(); });
    };
    const out = () => {
      const B = toNum($("#u-b").value)||0; store.set("umsch_b", B);
      const T = Object.values(zi.ziel).reduce((a,b)=>a+(+b||0),0) || 100;
      const tot = V + B, bed = {}; let bs = 0;
      namen.forEach(g=>{ bed[g] = Math.max(0, (+zi.ziel[g]||0)/T*tot - (ist[g]||0)); bs += bed[g]; });
      const alloc = {};
      namen.forEach(g=>alloc[g] = bs ? B*bed[g]/bs : B*(+zi.ziel[g]||0)/T);
      const rows = namen.filter(g=>alloc[g]>=0.5).sort((a,b)=>alloc[b]-alloc[a]);
      const nachher = g => ((ist[g]||0)+alloc[g])/tot;
      const abw = namen.reduce((a,g)=>a+Math.abs((ist[g]||0)-(+zi.ziel[g]||0)/T*V),0)/2;
      $("#u-out").innerHTML = rows.length ? rows.map(g=>{
          const ps = L.filter(p=>grp(p)===g).sort((a,b)=>Z[b.id].wert-Z[a.id].wert), gw = ps.reduce((a,p)=>a+Z[p.id].wert,0);
          return `<div class="kvrow"><span><b>${esc(g)}</b> <span class="sub">→ danach ${nf(1).format(nachher(g)*100)} % (Ziel ${nf(0).format((+zi.ziel[g]||0)/T*100)} %)</span><br>
            <span class="sub">${ps.length?ps.slice(0,3).map(p=>`${esc(p.name||p.t)} ${E(alloc[g]*Z[p.id].wert/gw)}`).join(" · "):"noch keine Position in dieser Gruppe"}</span></span><b>${E(alloc[g])}</b></div>`; }).join("")
        + `<div class="sub" style="white-space:normal;margin-top:6px">${bs>B?`Für die exakte Zielverteilung bräuchtest du ${E(bs)} neues Geld. Bis dahin geht alles in die Gruppen, die am weitesten unter Ziel liegen.`:"Danach entspricht dein Depot deinen Zielen."} Innerhalb einer Gruppe wird nach den heutigen Anteilen aufgeteilt. Insgesamt weicht dein Depot um ${E(abw)} von den Zielen ab.</div>`
        : `<div class="sub">Gib einen Betrag ein.</div>`;
    };
    draw(); out();
    $("#u-b").addEventListener("input", out);
    document.querySelectorAll("[data-ug]").forEach(sel=>sel.onchange=()=>{
      let g = sel.value; if(g==="__neu"){ g = (prompt("Name der neuen Gruppe:")||"").trim(); if(!g){ sel.value=grp(L.find(p=>p.id===sel.dataset.ug)); return; } zi.ziel[g]=zi.ziel[g]||0; }
      zi.gruppe[sel.dataset.ug] = g; renderUmschichten(); });
    $("#u-save").onclick = async ()=>{ delete zi._neu; if(await PLUS.save("Anlageziele geändert", true)) renderUmschichten(); };
  }

  /* =====================================================================
     App-Gefühl: installierbar, offline nutzbar
     ===================================================================== */
  if("serviceWorker" in navigator && location.protocol==="https:"){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
  }
  let instEv = null;
  window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); instEv = e; });
  function installBox(){
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if(standalone) return `<div class="box"><h3>App</h3><div class="sub">✓ Value Finder ist als App installiert. Ohne Internet siehst du den letzten Stand.</div></div>`;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="box"><h3>Als App installieren</h3><p style="margin:0 0 6px">Mit eigenem Icon auf dem Homescreen, ohne Browserleiste und auch offline mit dem letzten Stand.</p>
      ${instEv?`<button class="btn" id="inst">Jetzt installieren</button>`:ios?`<div class="sub" style="white-space:normal">iPhone: In Safari unten auf <b>Teilen</b> (□↑) tippen, dann <b>„Zum Home-Bildschirm“</b>.</div>`:`<div class="sub" style="white-space:normal">Chrome/Edge: Menü ⋮ → <b>„App installieren“</b> bzw. „Zum Startbildschirm hinzufügen“.</div>`}</div>`;
  }
  function bindInstall(){ const b=document.getElementById("inst"); if(b) b.onclick=async()=>{ instEv.prompt(); await instEv.userChoice; instEv=null; render(); }; }

  const MEHR = [["sparplaene","💶 Sparpläne","Buchen sich automatisch ins Depot"],["steuer","🧾 Steuer-Cockpit","Freistellungsauftrag je Broker, Vorabpauschale"],
    ["schneeball","❄️ Dividenden-Ziel","Wann zahlen deine Dividenden dein Ziel?"],["burggraben","🏰 Burggraben-Ranking","Firmen mit dauerhaftem Vorsprung"],
    ["durchblick","🔍 ETF-Durchblick","Welche Firmen stecken in deinen ETFs?"],["umschichten","⚖️ Umschichtungs-Helfer","Wohin der nächste Euro fließen sollte"]];
  const mehrAlt = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehrAlt();
    $("#main").insertAdjacentHTML("afterbegin", `<div class="list" style="margin-top:12px">${MEHR.map(([h,t,s])=>`<a class="row" href="#${h}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="sub">›</span></a>`).join("")}</div>`);
    $("#main").insertAdjacentHTML("beforeend", installBox()); bindInstall(); };
  Object.assign(PLUS.VIEWS, {sparplaene:renderSparplaene, steuer:renderSteuer, schneeball:renderSchneeball, burggraben:renderBurggraben, durchblick:renderDurchblick, umschichten:renderUmschichten});
  const DEPOT_VIEWS = ["sparplaene","steuer","schneeball","burggraben","durchblick","umschichten"];
  return { divCal, tiles, afterLoad, detail, bind, DEPOT_VIEWS, MEHR:MEHR.map(m=>m[0]) };
})();
