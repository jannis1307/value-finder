/* Value Finder – Erweiterungen 4: Heatmap, Kaufzonen, Wirtschaftskalender, Ziel-Rente, ETF-Kosten,
   Währungs-Check, Börsen-Tagebuch, Was-wäre-wenn, Monopol-Radar, Insider & Analysten & Quartalszahlen,
   weitere Push-Einstellungen. */
"use strict";
const PLUS4 = (() => {
  const P = PLUS.P;
  const nf = d => new Intl.NumberFormat("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d});
  const E = (x, d=0) => x==null || !isFinite(x) ? "–" : nf(d).format(x)+" €";
  const Es = (x, d=0) => x==null || !isFinite(x) ? "–" : (x>0?"+":"")+E(x,d);
  const Pc = (x, d=0, sign=false) => x==null || !isFinite(x) ? "–" : (sign && x>0?"+":"")+nf(d).format(x*100)+" %";
  const toNum = v => { if(v==null) return null; let s=String(v).trim().replace(/[€$\s%]/g,""); if(!s) return null;
    if(s.includes(",") && s.includes(".")) s = s.lastIndexOf(",")>s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
    else if(s.includes(",")) s = s.replace(",","."); const n=parseFloat(s); return isNaN(n)?null:n; };
  const uid = () => Math.random().toString(36).slice(2,9);
  const ymd = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const dlong = s => new Date(s+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
  function toast(msg, ms=3500){ let t=document.getElementById("vf-toast"); if(!t){ t=document.createElement("div"); t.id="vf-toast"; document.body.appendChild(t); }
    t.textContent=msg; t.className="show"; clearTimeout(t._h); t._h=setTimeout(()=>t.className="", ms); }
  function sheet(html){ $("#sheet").innerHTML = html; $("#ov").classList.add("open"); document.body.style.overflow="hidden";
    $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeDetail); }
  const head = (title, sub="") => `<div class="shead"><div style="min-width:0"><h2>${title}</h2>${sub?`<div class="sub" style="white-space:normal">${sub}</div>`:""}</div><button class="iconbtn x" data-close aria-label="Schließen">✕</button></div>`;
  const need = (title) => {
    if(!P.key){ $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>${title}</h3><p>Verbinde zuerst dieses Gerät mit deinem Depot (Depot → Gerät verbinden).</p></div>`; return false; }
    if(!P.loaded || !P.pf){ $("#main").innerHTML = P.err ? `<div class="err">${esc(P.err)}</div>` : `<div class="empty">Depot wird geladen …</div>`; PLUS.loadDepot(); return false; }
    if(!P.depot){ $("#main").innerHTML = `<div class="notif" style="margin-top:12px">⏳ Die erste Auswertung läuft noch.</div>`; return false; }
    return true;
  };
  const wait = (txt) => `<div class="notif" style="margin-top:12px">⏳ ${txt}</div>`;
  const css = document.createElement("style");
  css.textContent = `
.hxbar{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}
.hx{position:relative;width:100%;border-radius:12px;overflow:hidden;background:#1b1f27;margin-top:8px;user-select:none}
.hx-s{position:absolute;box-sizing:border-box;border-radius:4px;overflow:hidden}
.hx-k{position:absolute;left:0;right:0;top:0;height:17px;display:flex;justify-content:space-between;align-items:center;gap:6px;padding:0 5px;background:#11141a;color:#e8ebf0;font-size:10.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap}
.hx-k span{overflow:hidden;text-overflow:ellipsis}.hx-k b{font-weight:700;text-transform:none}
.hx-t{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;color:#fff;cursor:pointer;line-height:1.08;text-align:center;text-shadow:0 1px 1px rgba(0,0,0,.35)}
.hx-t:hover{filter:brightness(1.18);z-index:2}
.hx-t b{font-weight:800;max-width:100%;overflow:hidden;white-space:nowrap}.hx-t i{font-style:normal;font-size:.72em;font-weight:600;opacity:.95;white-space:nowrap}
.hx-t.mein{box-shadow:inset 0 0 0 2px #fff}
.hx-tip{position:absolute;z-index:9;pointer-events:none;background:#0d1016;color:#fff;border:1px solid #333a46;border-radius:10px;padding:7px 10px;font-size:12.5px;line-height:1.4;max-width:240px;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.hx-tip b{display:block;font-size:13px}
.hmleg{display:flex;gap:2px;margin-top:6px}.hmleg span{flex:1;text-align:center;font-size:11px;font-weight:600;color:#fff;padding:3px 0;border-radius:4px}
.tabs4{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}.tabs4 a{padding:6px 11px;border-radius:999px;background:var(--soft);font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;text-decoration:none}
.tabs4 a.on{background:var(--acc);color:#fff}
.day4{font-weight:700;margin:12px 0 4px}.hi4{font-weight:700}
.bar4{display:grid;grid-template-columns:150px 1fr 70px;gap:8px;align-items:center;margin:6px 0;font-size:13.5px}
.bar4 .tr{height:10px;background:var(--soft);border-radius:5px;overflow:hidden;position:relative}.bar4 .fi{height:100%;border-radius:5px}
.tb4 textarea{min-height:80px;resize:vertical;font:inherit;padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink)}
.due4{border-left:3px solid var(--warn);padding-left:8px}`;
  document.head.appendChild(css);

  /* ================================ Heatmap ================================ */
  let hmMode = "r1d", hmAnsicht = "markt";
  const SKALA = {r1d:0.03, r5d:0.06, r1m:0.10, r1y:0.35};
  function farbe(v, sk){
    if(v==null || !isFinite(v)) return "#4a5160";
    const x = Math.max(-1, Math.min(1, v/sk)), a = Math.pow(Math.abs(x), 0.8);
    const g=[65,69,84], up=[48,204,90], dn=[246,53,56], z = x>0?up:dn;
    return `rgb(${g.map((c,i)=>Math.round(c+(z[i]-c)*a)).join(",")})`;
  }
  function squarify(items, x, y, w, h){
    const out = [], tot = items.reduce((a,b)=>a+b.v,0); if(!tot || w<=0 || h<=0) return out;
    let rest = items.filter(i=>i.v>0).map(i=>Object.assign({}, i, {a:i.v*(w*h)/tot}));
    const worst = (row, s) => { const sum=row.reduce((a,b)=>a+b.a,0), mx=Math.max(...row.map(q=>q.a)), mn=Math.min(...row.map(q=>q.a)); return Math.max(s*s*mx/(sum*sum), sum*sum/(s*s*mn)); };
    while(rest.length){
      const s = Math.min(w,h); let row=[rest[0]], i=1;
      while(i<rest.length && worst(row.concat(rest[i]), s) <= worst(row, s)){ row.push(rest[i]); i++; }
      const sum = row.reduce((a,b)=>a+b.a,0);
      if(w>=h){ const cw=sum/h; let cy=y; row.forEach(r=>{ const rh=r.a/cw; out.push(Object.assign(r,{x,y:cy,w:cw,h:rh})); cy+=rh; }); x+=cw; w-=cw; }
      else { const rh=sum/w; let cx=x; row.forEach(r=>{ const rw=r.a/rh; out.push(Object.assign(r,{x:cx,y,w:rw,h:rh})); cx+=rw; }); y+=rh; h-=rh; }
      rest = rest.slice(i);
    }
    return out;
  }
  function hmDaten(){
    if(hmAnsicht==="depot" && P.depot){
      const L = (P.depot.positionen||[]).filter(z=>(z.wert||0)>0).map(z=>{ const s = z.t ? BY[z.t] : null;
        const v = s && s[hmMode]!=null ? s[hmMode] : z[hmMode]!=null ? z[hmMode] : (hmMode==="r1d" && z.wert_gestern ? z.wert/z.wert_gestern-1 : null);
        return {t:z.t||"", kurz:(z.t||z.name||"").replace(/\..*$/,"").slice(0,8), n:z.name||z.t, gr:z.wert, v, s:z.sektor||"Sonstiges", mein:true, detail:!!s}; });
      return L;
    }
    const mine = new Set(((P.depot?.positionen)||[]).map(z=>z.t));
    return DATA.stocks.filter(s=>(s.mcap_eur??s.mcap)>0).map(s=>({t:s.t, kurz:s.t.replace(/\..*$/,""), n:s.n, gr:s.mcap_eur??s.mcap, v:s[hmMode], s:s.s||"Sonstiges", mein:mine.has(s.t), detail:true}));
  }
  function renderHeatmap(){
    const hatDepot = !!(P.depot && (P.depot.positionen||[]).length);
    if(!hatDepot) hmAnsicht = "markt";
    $("#main").innerHTML = `<div class="hxbar"><div class="tabs4">${[["r1d","Heute"],["r5d","5 Tage"],["r1m","1 Monat"],["r1y","1 Jahr"]].map(([k,l])=>`<a data-hm="${k}" class="${hmMode===k?"on":""}">${l}</a>`).join("")}</div>
      ${hatDepot?`<div class="tabs4">${[["markt","Markt"],["depot","Mein Depot"]].map(([k,l])=>`<a data-ha="${k}" class="${hmAnsicht===k?"on":""}">${l}</a>`).join("")}</div>`:""}</div>
      <div class="hx" id="hm"></div><div class="hx-tip" id="hx-tip" hidden></div>
      <div class="hmleg">${[-1,-0.5,0,0.5,1].map(f=>`<span style="background:${farbe(f*SKALA[hmMode],SKALA[hmMode])}">${f>0?"+":""}${nf(SKALA[hmMode]*f*100>=10||SKALA[hmMode]*f*100<=-10?0:1).format(SKALA[hmMode]*f*100)} %</span>`).join("")}</div>
      <div class="hint">${hmAnsicht==="depot"?"Größe = Wert deiner Position":"Größe = Börsenwert"}, Farbe = Kursentwicklung. Tippe auf eine Kachel für Details.${hmAnsicht==="markt"&&hatDepot?" Deine Aktien haben einen weißen Rahmen.":""}</div>`;
    const el = $("#hm"), W = Math.floor(el.clientWidth), H = Math.round(W < 600 ? W*1.55 : Math.min(W*0.6, 760)); el.style.height = H+"px";
    const S = hmDaten(), sek = {};
    S.forEach(s=>{ (sek[s.s]=sek[s.s]||[]).push(s); });
    const gruppen = Object.entries(sek).map(([k,L])=>({k, v:L.reduce((a,s)=>a+s.gr,0), L})).sort((a,b)=>b.v-a.v);
    let html = ""; const TIP = {};
    for(const g of squarify(gruppen, 0, 0, W, H)){
      const gx = g.x+1.5, gy = g.y+1.5, gw = g.w-3, gh = g.h-3; if(gw<4 || gh<4) continue;
      const mitKopf = gw>56 && gh>44, kopf = mitKopf ? 17 : 0;
      const gew = g.L.filter(s=>s.v!=null), avg = gew.length ? gew.reduce((a,s)=>a+s.v*s.gr,0)/gew.reduce((a,s)=>a+s.gr,0) : null;
      html += `<div class="hx-s" style="left:${gx}px;top:${gy}px;width:${gw}px;height:${gh}px">${mitKopf?`<div class="hx-k"><span>${esc(g.k)}</span><b style="color:${avg==null?"inherit":avg>=0?"#7ee2a0":"#ff9a9a"}">${avg==null?"":(avg>0?"+":"")+nf(1).format(avg*100)+" %"}</b></div>`:""}</div>`;
      const L = g.L.sort((a,b)=>b.gr-a.gr);
      for(const r of squarify(L.map(s=>({v:s.gr, s})), gx, gy+kopf, gw, gh-kopf)){
        const s = r.s, w = r.w-1, h = r.h-1; if(w<1 || h<1) continue;
        const fs = Math.max(9, Math.min(24, Math.min(w/(s.kurz.length*0.62+1), h/2.6)));
        const zeigT = w >= s.kurz.length*fs*0.66+4 && h >= fs*1.3, zeigP = zeigT && h>=fs*2.5 && w>=fs*2.6;
        const id = "h"+Object.keys(TIP).length; TIP[id] = s;
        html += `<div class="hx-t${s.mein&&hmAnsicht==="markt"?" mein":""}" data-i="${id}" ${s.detail&&s.t?`data-t="${esc(s.t)}"`:""} style="left:${r.x}px;top:${r.y}px;width:${w}px;height:${h}px;background:${farbe(s.v,SKALA[hmMode])};font-size:${fs.toFixed(1)}px">${zeigT?`<b>${esc(s.kurz)}</b>`:""}${zeigP?`<i>${s.v==null?"–":Pc(s.v,1,true)}</i>`:""}</div>`;
      }
    }
    el.innerHTML = html;
    const tip = $("#hx-tip");
    el.onmousemove = e => { const d = e.target.closest(".hx-t"); if(!d){ tip.hidden = true; return; } const s = TIP[d.dataset.i];
      tip.innerHTML = `<b>${esc(s.n||s.t)}</b>${esc(s.t)} · ${esc(s.s)}<br><span style="font-size:15px;font-weight:700">${s.v==null?"keine Kursdaten":Pc(s.v,2,true)}</span>${hmAnsicht==="depot"?`<br>Position ${E(s.gr)}`:""}`;
      tip.hidden = false; const box = el.getBoundingClientRect(); let x = e.clientX-box.left+14, y = e.clientY-box.top+14;
      if(x+tip.offsetWidth > box.width) x = e.clientX-box.left-tip.offsetWidth-10; if(y+tip.offsetHeight > box.height) y = e.clientY-box.top-tip.offsetHeight-10;
      tip.style.left = (x+el.offsetLeft)+"px"; tip.style.top = (y+el.offsetTop)+"px"; };
    el.onmouseleave = () => { tip.hidden = true; };
    el.onclick = e => { const d = e.target.closest("[data-t]"); if(d) openDetail(d.dataset.t); };
    document.querySelectorAll("[data-hm]").forEach(a=>a.onclick=()=>{ hmMode=a.dataset.hm; renderHeatmap(); });
    document.querySelectorAll("[data-ha]").forEach(a=>a.onclick=()=>{ hmAnsicht=a.dataset.ha; renderHeatmap(); });
  }

  /* ================================ Kaufzonen ================================ */
  function kaufzonen(){ return (P.pf?.alarme||[]).filter(a=>a.kaufzone); }
  async function setKaufzone(s, preis){
    const A = P.pf.alarme = P.pf.alarme || [];
    const alt = A.find(a=>a.kaufzone && a.t===s.t);
    if(alt){ alt.preis = preis; } else A.push({id:uid(), t:s.t, name:s.n, art:"unter", preis, kaufzone:true});
    if(await PLUS.save(`Kaufzone ${s.t}`, true)){ toast(`🎯 Kaufzone gesetzt: unter ${F.cur(preis, s.cur)}`); openDetail(s.t); }
  }
  function renderKaufzonen(){
    if(!need("Kaufzonen")) return;
    const K = kaufzonen().map(a=>({a, s:BY[a.t]})).sort((x,y)=>((x.s?.p||0)/x.a.preis)-((y.s?.p||0)/y.a.preis));
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Deine Kaufzonen</h3>
      ${K.map(({a,s})=>{ const ab = s ? s.p/a.preis-1 : null; return `<div class="kvrow" style="align-items:center;cursor:pointer" data-t="${esc(a.t)}"><span><b>${esc(a.name||a.t)}</b><br><span class="sub">Zone bis ${F.cur(a.preis, s?.cur)} · Kurs ${s?F.cur(s.p,s.cur):"–"}${s?.moat!=null?` · Burggraben ${Math.round(s.moat)}`:""}</span></span>
        <b class="${ab!=null&&ab<=0?"up":""}">${ab==null?"–":ab<=0?"in der Zone 🎯":"noch "+Pc(ab,1)}</b></div>`; }).join("") || `<div class="sub">Noch keine Kaufzonen. Öffne eine Aktie, stell im Fairer-Wert-Rechner deine Annahmen ein und tippe auf „Kaufzone setzen“.</div>`}
      <div class="sub" style="white-space:normal;margin-top:6px">Fällt der Kurs in die Zone, bekommst du sofort eine Push-Nachricht mit Burggraben- und Chancen-Score.</div></div>`;
    document.querySelectorAll("[data-t]").forEach(r=>r.onclick=()=>openDetail(r.dataset.t));
  }

  /* ================================ Wirtschaftskalender ================================ */
  function renderWirtschaft(){
    if(!need("Wirtschaftskalender")) return;
    const W = P.depot.wirtschaft || [];
    const tage = {}; W.forEach(w=>{ const d=new Date(w.zeit); const k=ymd(d); (tage[k]=tage[k]||[]).push(w); });
    const heute = ymd(new Date());
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Wirtschaftstermine · USA und Euroraum</h3>
      ${Object.entries(tage).map(([k,L])=>`<div class="day4">${new Date(k+"T12:00:00").toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"})}${k===heute?" · heute":""}</div>
        ${L.map(w=>`<div class="kvrow"><span class="${w.wichtig?"hi4":""}">${new Date(w.zeit).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} ${w.land==="USD"?"🇺🇸":"🇪🇺"} ${esc(w.titel)}${w.wichtig?" ❗":""}<br><span class="sub">${esc(w.orig||"")}</span></span>
          <span class="sub" style="text-align:right">${w.prognose?`Prognose ${esc(w.prognose)}<br>`:""}${w.vorher?`vorher ${esc(w.vorher)}`:""}</span></div>`).join("")}`).join("") || `<div class="sub">Keine Termine geladen.</div>`}
      <div class="sub" style="white-space:normal;margin-top:8px">❗ = besonders wichtig für die Kurse (z. B. Zinsentscheide, Inflation, Arbeitsmarkt). Am Vorabend bekommst du eine Push-Nachricht mit den wichtigen Terminen. Zeiten in deiner Zeitzone. Quelle: Forex-Factory-Kalender, wird alle 3 Stunden aktualisiert.</div></div>`;
  }

  /* ================================ Ziel-Rente ================================ */
  function renderRente(){
    const D = P.depot, S = D?.summe;
    const spM = (P.pf?.sparplaene||[]).filter(s=>s.aktiv!==false).reduce((a,s)=>a+(toNum(s.betrag)||0)*(s.tage||[1]).length/(+s.alle||1),0);
    const sb = store.get("schnee", {});
    const o = Object.assign({gj: sb.gj || "", alter:67, rate: Math.round(spM)||100, rg:2, rend:6, inf:2, entn:4}, store.get("rente", {}));
    if(sb.gj && !store.get("rente",{}).gj) o.gj = sb.gj;
    const start = S?.wert || 0;
    const F_ = {alter:v=>v+" Jahre", rate:v=>E(v), rg:v=>nf(1).format(v)+" %", rend:v=>nf(1).format(v)+" %", inf:v=>nf(1).format(v)+" %", entn:v=>nf(1).format(v)+" %"};
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Deine Zusatz-Rente aus dem Depot</h3><div id="re-out"></div></div>
      <div class="box"><h3>Annahmen</h3>
        <div class="form"><label>Dein Geburtsjahr<input class="inp" id="re-gj" inputmode="numeric" value="${esc(o.gj)}" style="max-width:120px"></label></div>
        ${[["alter","Rente ab",55,70,1],["rate","Sparrate pro Monat",0,3000,5],["rg","Sparrate steigt jährlich um",0,10,0.5],["rend","Rendite pro Jahr (vor Inflation)",2,10,0.25],["inf","Inflation",0,5,0.25],["entn","Entnahme pro Jahr (4-%-Regel)",2,6,0.25]]
          .map(([k,l,mn,mx,st])=>`<div class="sl"><label for="re-${k}">${l}</label><output id="ro-${k}">${F_[k](+o[k])}</output><input type="range" id="re-${k}" min="${mn}" max="${mx}" step="${st}" value="${o[k]}"></div>`).join("")}
        <div class="sub" style="white-space:normal">Start: dein Depot heute (${E(start)}). 6 % pro Jahr entspricht ungefähr dem langjährigen Schnitt eines Welt-Aktien-ETFs, eine Garantie ist das nicht. Die 4-%-Regel: Pro Jahr 4 % entnehmen, dann hat das Geld historisch meist über 30 Jahre gereicht. Beträge vor Steuern, umgerechnet in heutige Kaufkraft.</div></div>`;
    const calc = () => {
      for(const k of Object.keys(F_)){ o[k] = +$("#re-"+k).value; $("#ro-"+k).textContent = F_[k](o[k]); }
      o.gj = $("#re-gj").value.trim(); store.set("rente", o);
      const gj = parseInt(o.gj,10), jetzt = new Date().getFullYear();
      if(!(gj>1940 && gj<jetzt)){ $("#re-out").innerHTML = `<div class="sub">Trag dein Geburtsjahr ein, dann rechne ich aus, wie viel dein Depot dir im Ruhestand jeden Monat zahlen könnte.</div>`; return; }
      const jahre = Math.max(0, gj + o.alter - jetzt);
      let V = start, rate = o.rate, eig = start; const pts=[V];
      const gm = Math.pow(1+o.rend/100, 1/12);
      for(let m=1; m<=jahre*12; m++){ V = V*gm + rate; eig += rate; if(m%12===0){ rate *= 1+o.rg/100; pts.push(V); } }
      const real = V / Math.pow(1+o.inf/100, jahre), mon = real*o.entn/100/12;
      const w=640,h=150, mx=Math.max(...pts)||1, X=i=>4+i/(pts.length-1||1)*(w-8), Y=v=>h-4-v/mx*(h-12);
      $("#re-out").innerHTML = `<div class="big3">${E(mon)} im Monat</div>
        <div class="sub" style="white-space:normal">So viel könntest du ab ${gj+o.alter} (mit ${o.alter}) jeden Monat entnehmen, in heutiger Kaufkraft. Zusätzlich zur gesetzlichen Rente.</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" style="display:block;height:150px;margin-top:8px"><polygon points="${X(0)},${h} ${pts.map((v,i)=>X(i)+","+Y(v)).join(" ")} ${X(pts.length-1)},${h}" fill="var(--acc)" opacity=".14"/><polyline points="${pts.map((v,i)=>X(i)+","+Y(v)).join(" ")}" fill="none" stroke="var(--acc)" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>
        <div class="mini" style="margin-top:8px"><div><b>${E(V)}</b><span>Depot mit ${o.alter} (Nennwert)</span></div><div><b>${E(real)}</b><span>in heutiger Kaufkraft</span></div><div><b>${E(eig)}</b><span>davon selbst eingezahlt</span></div></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Noch ${jahre} Jahre. Zinseszins-Anteil: ${E(V-eig)}. Jeder zusätzliche Euro Sparrate pro Monat bringt dir später rund ${E(mon/(o.rate||1),2)} Rente im Monat.</div>`;
    };
    document.querySelectorAll("#main input").forEach(i=>i.addEventListener("input", calc)); calc();
  }

  /* ================================ ETF-Kosten ================================ */
  function renderKosten(){
    if(!need("ETF-Kosten")) return;
    const D = P.depot, Z = Object.fromEntries((D.positionen||[]).map(z=>[z.id,z]));
    const etfs = (D.positionen||[]).filter(z=>["ETF","MUTUALFUND"].includes(z.art) && z.wert>0);
    const yter = Object.fromEntries(((D.durchblick||{}).etfs||[]).map(e=>[e.id, e.ter]));
    const eigen = P.pf.ter = P.pf.ter || {};
    const spM = id => (P.pf.sparplaene||[]).filter(s=>s.aktiv!==false && s.pos===id).reduce((a,s)=>a+(toNum(s.betrag)||0)*(s.tage||[1]).length/(+s.alle||1),0);
    const fv = (start, mon, r, jahre) => { let V=start; const g=Math.pow(1+r,1/12); for(let m=0;m<jahre*12;m++) V=V*g+mon; return V; };
    let sumW=0, sumT=0, sumK=0;
    const rows = etfs.map(z=>{ const ter = eigen[z.id]!=null ? eigen[z.id] : yter[z.id]; const m=spM(z.id);
      const k = ter!=null ? fv(z.wert, m, 0.06, 30) - fv(z.wert, m, 0.06-ter, 30) : null;
      if(ter!=null){ sumW+=z.wert; sumT+=z.wert*ter; sumK+=k; }
      return {z, ter, m, k, quelle: eigen[z.id]!=null ? "von dir" : yter[z.id]!=null ? "Yahoo" : null}; });
    $("#main").innerHTML = `<div class="box dsum" style="margin-top:12px">
        <div><div class="sub">Ø Kosten deiner ETFs (TER)</div><div class="px big2">${sumW?nf(2).format(sumT/sumW*100)+" %":"–"}</div></div>
        <div><div class="sub">Pro Jahr heute</div><div class="px">${E(sumT,0)}</div></div>
        <div><div class="sub">Über 30 Jahre (mit Sparplänen)</div><div class="px down">${E(sumK)}</div><div class="sub">entgangene Rendite</div></div></div>
      <div class="box"><h3>Je ETF</h3>
        ${rows.map(r=>`<div class="kvrow" style="align-items:center"><span style="min-width:0;flex:1"><b>${esc(r.z.name)}</b><br><span class="sub" style="white-space:normal">${E(r.z.wert)}${r.m?` · Sparplan ${E(r.m)}/Monat`:""}${r.k!=null?` · 30 Jahre: ${E(r.k)} Kosten`:""}${r.quelle?` · Quelle: ${esc(r.quelle)}`:""}</span></span>
          <span style="white-space:nowrap"><input class="inl" style="width:70px" data-ter="${esc(r.z.id)}" inputmode="decimal" value="${r.ter!=null?nf(2).format(r.ter*100):""}" placeholder="?"> %</span></div>`).join("") || `<div class="sub">Keine ETFs im Depot.</div>`}
        <div class="links"><button class="btn" id="k-save">Speichern</button></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Die TER (laufende Kosten) wird jeden Tag still vom ETF-Kurs abgezogen. Yahoo kennt sie nicht für jeden europäischen ETF. Fehlt ein Wert, trag ihn aus dem Factsheet oder der App deines Brokers ein. Gehebelte ETFs und Themen-ETFs sind meist deutlich teurer als breite Index-ETFs. Gibt es denselben Index günstiger, lohnt sich ein neuer Sparplan dort; bestehende Anteile zu verkaufen kostet oft Steuern. Rechnung: 6 % Rendite pro Jahr, deine heutigen Sparpläne, 30 Jahre.</div></div>`;
    $("#k-save").onclick = async ()=>{ document.querySelectorAll("[data-ter]").forEach(i=>{ const v=toNum(i.value); if(v!=null) eigen[i.dataset.ter]=v/100; else delete eigen[i.dataset.ter]; });
      if(await PLUS.save("ETF-Kosten geändert", true)) renderKosten(); };
  }

  /* ================================ Währungs-Check ================================ */
  function renderWaehrung(){
    if(!need("Währungs-Check")) return;
    const Z = (P.depot.positionen||[]).filter(z=>z.r1y_lokal!=null && z.r1y_eur!=null && z.wert>0);
    const g = {}; let W=0, Rl=0, Re=0;
    Z.forEach(z=>{ const c=z.cur||"EUR", e=g[c]=g[c]||{c, w:0, rl:0, re:0, n:0}; e.w+=z.wert; e.rl+=z.wert*z.r1y_lokal; e.re+=z.wert*z.r1y_eur; e.n++; W+=z.wert; Rl+=z.wert*z.r1y_lokal; Re+=z.wert*z.r1y_eur; });
    const L = Object.values(g).sort((a,b)=>b.w-a.w);
    const rl = W?Rl/W:null, re = W?Re/W:null, fxE = (rl!=null&&re!=null) ? (1+re)/(1+rl)-1 : null;
    const fx = P.depot.fx || {};
    $("#main").innerHTML = `<div class="box dsum" style="margin-top:12px">
        <div><div class="sub">Rendite 1 Jahr in Euro</div><div class="px big2 ${cls(re)}">${Pc(re,1,true)}</div></div>
        <div><div class="sub">davon Aktienkurse</div><div class="px ${cls(rl)}">${Pc(rl,1,true)}</div></div>
        <div><div class="sub">davon Wechselkurse</div><div class="px ${cls(fxE)}">${Pc(fxE,1,true)}</div></div>
        <div><div class="sub">1 € =</div><div style="font-size:13px">${fx.USD?nf(4).format(fx.USD)+" $":""}${fx.CHF?"<br>"+nf(4).format(fx.CHF)+" CHF":""}${fx.GBP?"<br>"+nf(4).format(fx.GBP)+" £":""}</div></div></div>
      <div class="box"><h3>Je Währung</h3>
        ${L.map(e=>{ const a=e.rl/e.w, b=e.re/e.w, f=(1+b)/(1+a)-1; return `<div class="kvrow"><span><b>${esc(e.c)}</b> <span class="sub">· ${Pc(e.w/W,0)} vom Depot · ${e.n} Positionen</span><br><span class="sub">Kurs ${Pc(a,1,true)} · in Euro ${Pc(b,1,true)}</span></span><b class="${cls(f)}">${e.c==="EUR"?"–":"Währung "+Pc(f,1,true)}</b></div>`; }).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Steigt der Euro gegenüber dem Dollar, verlieren deine US-Aktien in Euro an Wert, auch wenn ihr Kurs gleich bleibt. Achtung: ETFs, die in Euro gehandelt werden, aber US-Aktien enthalten (z. B. MSCI World), tragen dasselbe Dollar-Risiko. Hier stehen sie trotzdem unter EUR, weil ihr Kurs in Euro notiert. Rechnung über die letzten 12 Monate mit deinen heutigen Stückzahlen.</div></div>`;
  }

  /* ================================ Börsen-Tagebuch ================================ */
  function kursVon(t){ const s=BY[t]; if(s) return {p:s.p, cur:s.cur}; const z=(P.depot?.positionen||[]).find(z=>z.t===t); return z?{p:z.p, cur:z.cur}:null; }
  function tbEdit(id, preset){
    const T = P.pf.tagebuch = P.pf.tagebuch || [];
    const e = id ? T.find(x=>x.id===id) : Object.assign({id:uid(), datum:ymd(new Date())}, preset||{});
    const L = (P.pf.positionen||[]).filter(p=>p.t).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    sheet(head(id?"Tagebuch-Eintrag":"Kauf notieren", "Schreib auf, warum du kaufst. Nach 3 Monaten und nach einem Jahr fragt dich die App, ob die These noch stimmt.")+`<div class="form tb4">
      <label>Aktie<select class="inp" id="tb-t"><option value="">– wählen –</option>${L.map(p=>`<option value="${esc(p.t)}" ${p.t===e.t?"selected":""}>${esc(p.name||p.t)}</option>`).join("")}${e.t&&!L.some(p=>p.t===e.t)?`<option value="${esc(e.t)}" selected>${esc(e.name||e.t)}</option>`:""}</select></label>
      <div class="two"><label>Datum<input class="inp" type="date" id="tb-d" value="${esc(e.datum)}"></label><label>Kaufkurs<input class="inp" id="tb-k" inputmode="decimal" value="${e.kurs??""}"></label></div>
      <label>Warum kaufe ich? (These)<textarea id="tb-th" placeholder="z. B. Quasi-Monopol, Preissetzungsmacht, wächst 10 % im Jahr">${esc(e.these||"")}</textarea></label>
      <label>Wann würde ich verkaufen?<textarea id="tb-ex" placeholder="z. B. wenn die Marge zwei Jahre in Folge fällt">${esc(e.ausstieg||"")}</textarea></label></div>
      ${(e.reviews||[]).length?`<div class="box"><h3>Bisherige Prüfungen</h3>${e.reviews.map(r=>`<div class="kvrow"><span>${dlong(r.datum)} ${r.ok?"✅ These stimmt":"❌ These gebrochen"}${r.notiz?`<br><span class="sub">${esc(r.notiz)}</span>`:""}</span></div>`).join("")}</div>`:""}
      <div class="links"><button class="btn" id="tb-s">Speichern</button>${id?`<button class="btn ghost" id="tb-ok">✅ These stimmt noch</button><button class="btn ghost" id="tb-no">❌ These gebrochen</button><button class="btn ghost" id="tb-del" style="color:var(--down)">Löschen</button>`:""}</div>`);
    $("#tb-t").onchange = () => { const k=kursVon($("#tb-t").value); if(k && !$("#tb-k").value) $("#tb-k").value = nf(2).format(k.p); };
    const fill = () => { const t=$("#tb-t").value; const p=(P.pf.positionen||[]).find(p=>p.t===t);
      Object.assign(e, {t, name: p?.name || BY[t]?.n || e.name || t, datum:$("#tb-d").value, kurs:toNum($("#tb-k").value), these:$("#tb-th").value.trim(), ausstieg:$("#tb-ex").value.trim()}); };
    $("#tb-s").onclick = async ()=>{ fill(); if(!e.t || !e.these) return toast("Bitte Aktie und These eintragen."); if(!id) T.push(e); if(await PLUS.save("Tagebuch", true)){ closeDetail(); if(view()==="tagebuch") renderTagebuch(); } };
    const rev = async ok => { const notiz = prompt(ok?"Kurze Notiz (optional):":"Was hat sich geändert? (optional)") || ""; e.reviews=(e.reviews||[]).concat([{datum:ymd(new Date()), ok, notiz}]); if(await PLUS.save("Tagebuch geprüft", true)){ closeDetail(); renderTagebuch(); } };
    if(id){ $("#tb-ok").onclick=()=>rev(true); $("#tb-no").onclick=()=>rev(false);
      $("#tb-del").onclick=async()=>{ P.pf.tagebuch=T.filter(x=>x.id!==id); if(await PLUS.save("Tagebuch-Eintrag gelöscht", true)){ closeDetail(); renderTagebuch(); } }; }
  }
  function renderTagebuch(){
    if(!need("Börsen-Tagebuch")) return;
    const T = (P.pf.tagebuch||[]).slice().sort((a,b)=>b.datum.localeCompare(a.datum)), heute = Date.now();
    const faellig = e => { const alter=(heute-new Date(e.datum))/864e5, letzte=(e.reviews||[]).slice(-1)[0]; return alter>=90 && (!letzte || (heute-new Date(letzte.datum))/864e5>80); };
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Börsen-Tagebuch</h3>
      ${T.map(e=>{ const k=kursVon(e.t), ch=k&&e.kurs?k.p/e.kurs-1:null, l=(e.reviews||[]).slice(-1)[0];
        return `<div class="kvrow ${faellig(e)?"due4":""}" data-id="${esc(e.id)}" style="cursor:pointer"><span><b>${esc(e.name||e.t)}</b> <span class="sub">· gekauft ${dlong(e.datum)}${e.kurs?` zu ${nf(2).format(e.kurs)}`:""}</span><br>
          <span class="sub" style="white-space:normal">„${esc((e.these||"").slice(0,140))}“${l?` · zuletzt ${l.ok?"✅":"❌"} ${dlong(l.datum)}`:""}${faellig(e)?" · <b style='color:var(--warn)'>jetzt prüfen</b>":""}</span></span>
          <b class="${cls(ch)}">${ch==null?"–":Pc(ch,0,true)}</b></div>`; }).join("") || `<div class="sub">Noch keine Einträge. Notier bei jedem Kauf deine These. So lernst du, welche Gründe sich bewähren.</div>`}
      <div class="links"><button class="btn" id="tb-neu">+ Kauf notieren</button></div></div>`;
    $("#tb-neu").onclick = ()=>tbEdit(null);
    document.querySelectorAll("[data-id]").forEach(r=>r.onclick=()=>tbEdit(r.dataset.id));
  }

  /* ================================ Was wäre wenn ================================ */
  function renderWasWaere(){
    if(!need("Was wäre wenn")) return;
    const W = P.depot.was_waere, S = P.depot.summe;
    if(!W || !(W.depot||[]).length){ $("#main").innerHTML = wait("Die 5-Jahres-Rechnung kommt mit dem nächsten Scan."); return; }
    const jahre = (new Date(W.daten[W.daten.length-1]) - new Date(W.daten[0]))/3.15576e10;
    const a = W.depot[0], b = W.depot[W.depot.length-1], wb = W.world ? W.world[W.world.length-1] : null;
    const cagr = Math.pow(b/a, 1/jahre)-1, cagrW = wb ? Math.pow(wb/a, 1/jahre)-1 : null;
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Hättest du vor ${nf(0).format(jahre)} Jahren dieselben Stückzahlen gekauft …</h3>
        <div class="dsum" style="margin-bottom:8px"><div><div class="sub">Einsatz damals</div><div class="px">${E(a)}</div></div><div><div class="sub">Wert heute</div><div class="px big2 ${cls(b-a)}">${E(b)}</div></div>
          <div><div class="sub">pro Jahr</div><div class="px ${cls(cagr)}">${Pc(cagr,1,true)}</div></div><div><div class="sub">MSCI World mit gleichem Einsatz</div><div class="px">${E(wb)}</div><div class="sub">${Pc(cagrW,1,true)} pro Jahr</div></div></div>
        ${PLUS2.chart(W.daten.map((d,i)=>[d,W.depot[i]]), W.world)}
        ${(W.spaeter||[]).length?`<div class="sub" style="white-space:normal;margin-top:6px">Ohne ${W.spaeter.map(esc).join(", ")} (gibt es noch keine ${nf(0).format(jahre)} Jahre an der Börse).</div>`:""}</div>
      <div class="box"><h3>Wie stark schwankt dein Depot?</h3>
        <div class="kvrow"><span>Größter Rückgang in ${nf(0).format(jahre)} Jahren</span><b class="down">${Pc(W.max_dd,0)}</b></div>
        ${W.jahr_2022!=null?`<div class="kvrow"><span>Im Börsenjahr 2022 (Zinswende)</span><b class="down">${Pc(W.jahr_2022,0)}</b></div>`:""}
        <div class="kvrow"><span>Beta zum MSCI World</span><b>${nf(2).format(W.beta)}</b></div>
        <div class="sub" style="white-space:normal">Beta 1 = dein Depot schwankt wie der Weltmarkt, 1,3 = 30 % stärker, 0,7 = ruhiger.</div></div>
      <div class="box"><h3>Was passiert bei einem Crash?</h3>
        ${(W.szenarien||[]).map(s=>`<div class="bar4"><span>${esc(s.name)} <span class="sub">(Markt ${Pc(s.markt,0)})</span></span><div class="tr"><div class="fi" style="width:${Math.min(100,Math.abs(s.depot)*150)}%;background:var(--down)"></div></div><span class="down" style="text-align:right">${Es(S.wert*s.depot)}</span></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Geschätzt über das Beta jeder Position. Echte Crashs treffen einzelne Branchen sehr unterschiedlich, die Zahlen zeigen die Größenordnung. Wer in einem Crash nicht verkauft und weiter spart, kauft billig nach.</div></div>`;
  }

  /* ================================ Monopol-Radar ================================ */
  let moUi = {s:"alle", lim:50};
  function renderMonopol(){
    const all = DATA.stocks.filter(s=>s.mono!=null), sek = [...new Set(all.map(s=>s.s))].sort();
    const mine = new Set([...((P.depot?.positionen)||[]).map(z=>z.t), ...stars]);
    const L = all.filter(s=>moUi.s==="alle"||s.s===moUi.s).sort((a,b)=>b.mono-a.mono);
    const mspark = h => { const v=(h||[]).filter(x=>x!=null); if(v.length<2) return ""; const mn=Math.min(...v), mx=Math.max(...v), r=(mx-mn)||0.01;
      return `<svg width="60" height="20" viewBox="0 0 60 20"><polyline points="${v.map((x,i)=>(i/(v.length-1)*58+1).toFixed(1)+","+(18-(x-mn)/r*16).toFixed(1)).join(" ")}" fill="none" stroke="var(--acc)" stroke-width="1.8"/></svg>`; };
    $("#main").innerHTML = `<div class="filters"><select id="mo-s"><option value="alle">Alle Branchen</option>${sek.map(s=>`<option ${moUi.s===s?"selected":""}>${esc(s)}</option>`).join("")}</select></div>
      <div class="hint">${all.length?`${L.length} Aktien · „Langweilige Monopole“: dauerhafter Vorsprung, stabile Margen über Jahre, großer Anteil am Umsatz der eigenen Branche.`:"Die Jahresabschlüsse werden gerade geladen (die Aktien mit dem stärksten Burggraben zuerst). In ein paar Stunden ist die Liste da."}</div>
      <div class="list">${L.slice(0,moUi.lim).map((s,i)=>{ const t=s.mono_t||{}; return `<div class="row" data-t="${esc(s.t)}">
        <div class="score ${scoreCls(s.mono)}" title="Monopol-Score">${Math.round(s.mono)}</div>
        <div style="min-width:0"><div class="nm">${i+1}. ${mine.has(s.t)?"★ ":""}${esc(s.n)}</div><div class="sub">${esc(s.t)} · ${esc(s.i||s.s)}</div>
          <div class="why">Burggraben ${s.moat==null?"–":Math.round(s.moat)} · Margen-Stabilität ${t.stabil==null?"–":Math.round(t.stabil*100)} · Branchenanteil ${Pc(s.anteil,0)}</div></div>
        <div class="right"><span class="px">${F.cur(s.p,s.cur)}</span>${mspark(s.m_hist)}<span class="sub">Marge ${Pc((s.m_hist||[]).slice(-1)[0],0)}</span></div></div>`; }).join("")}</div>
      ${L.length>moUi.lim?`<div class="links" style="justify-content:center"><button class="btn ghost" id="mo-more">Mehr anzeigen</button></div>`:""}
      <div class="box"><h3>So entsteht der Monopol-Score</h3>
        <div class="kvrow"><span>Burggraben (40 %)</span><span class="sub">Margen, Kapitalrendite, Cashflow, Größe</span></div>
        <div class="kvrow"><span>Margen-Stabilität (30 %)</span><span class="sub">Bruttomarge der letzten Geschäftsjahre: je gleichmäßiger, desto besser. Fallende Margen werden abgewertet.</span></div>
        <div class="kvrow"><span>Branchenanteil (30 %)</span><span class="sub">Anteil am Umsatz aller gescannten Firmen derselben Branche</span></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Der Branchenanteil bezieht sich nur auf die rund 550 gescannten Aktien (S&P 500, DAX und einige weitere), nicht auf den Weltmarkt. Die Linie rechts zeigt die Marge der letzten Jahre.</div></div>`;
    $("#mo-s").onchange = e=>{ moUi.s=e.target.value; moUi.lim=50; renderMonopol(); };
    $("#mo-more") && ($("#mo-more").onclick=()=>{ moUi.lim+=50; renderMonopol(); });
    document.querySelectorAll(".row[data-t]").forEach(r=>r.onclick=()=>openDetail(r.dataset.t));
  }

  /* ================================ Insider · Analysten · Quartalszahlen ================================ */
  let anTab = "quartal";
  function renderAnalyse(){
    if(!need("Insider & Analysten")) return;
    const D = P.depot, nurDepot = store.get("an_depot", false);
    const f = L => (L||[]).filter(x=>!nurDepot || x.depot);
    const T = {
      quartal:["📑 Quartalszahlen", f(D.quartal).map(q=>{ const u=q.ueberraschung; return `<div class="kvrow" data-t="${esc(q.t)}" style="cursor:pointer"><span><b>${esc(q.name)}</b> <span class="sub">· ${q.datum?dlong(q.datum):""}</span><br><span class="sub">Gewinn je Aktie ${q.eps_ist!=null?nf(2).format(q.eps_ist):"–"} · erwartet ${q.eps_erw!=null?nf(2).format(q.eps_erw):"–"}${q.reaktion!=null?` · Kursreaktion ${Pc(q.reaktion,1,true)}`:""}</span></span><b class="${u>2?"up":u<-2?"down":""}">${u==null?"–":(u>2?"✅ ":u<-2?"❌ ":"")+nf(1).format(u)+" %"}</b></div>`; }).join("")],
      insider:["🕵️ Insider", f(D.insider).map(i=>`<div class="kvrow" data-t="${esc(i.t)}" style="cursor:pointer"><span><b>${esc(i.name)}</b> <span class="sub">· ${i.datum?dlong(i.datum):""}</span><br><span class="sub">${esc(i.wer)} (${esc(i.position)}) · ${i.aktien!=null?nf(0).format(i.aktien)+" Stück":""}</span></span><b class="${i.art==="Kauf"?"up":"down"}">${i.art}${i.wert?"<br><span class='sub'>"+nf(0).format(i.wert/1e3)+" Tsd. $</span>":""}</b></div>`).join("")],
      analysten:["🎯 Analysten", (D.ziel_aenderungen||[]).map(a=>`<div class="kvrow"><span><b>${esc(a.name)}</b><br><span class="sub">Ø Kursziel ${nf(2).format(a.alt)} → ${nf(2).format(a.neu)} ${esc(a.cur||"")} (seit ${dlong(a.seit)})</span></span><b class="${cls(a.pct)}">${Pc(a.pct,1,true)}</b></div>`).join("")
        + f(D.analysten).map(a=>`<div class="kvrow" data-t="${esc(a.t)}" style="cursor:pointer"><span><b>${esc(a.name)}</b> <span class="sub">· ${a.datum?dlong(a.datum):""} · ${esc(a.firma)}</span><br><span class="sub">${a.von?esc(a.von)+" → ":""}${esc(a.zu)}${a.ziel_neu?` · Kursziel ${a.ziel_alt?nf(0).format(a.ziel_alt)+" → ":""}${nf(0).format(a.ziel_neu)}`:""}</span></span><b class="${/up|init/i.test(a.aktion)?"up":/down/i.test(a.aktion)?"down":""}">${/up/i.test(a.aktion)?"⬆ hoch":/down/i.test(a.aktion)?"⬇ runter":/init/i.test(a.aktion)?"neu":"bestätigt"}</b></div>`).join("")],
      dividenden:["💶 Dividenden-Änderungen", (D.div_aenderungen||[]).map(d=>`<div class="kvrow"><span><b>${esc(d.name)}</b> <span class="sub">· Ex-Tag ${dlong(d.datum)}</span><br><span class="sub">${nf(3).format(d.alt)} → ${nf(3).format(d.neu)} ${esc(d.cur||"")} je Aktie</span></span><b class="${cls(d.pct)}">${Pc(d.pct,1,true)}</b></div>`).join("")],
    };
    $("#main").innerHTML = `<div class="tabs4">${Object.entries(T).map(([k,[l]])=>`<a data-an="${k}" class="${anTab===k?"on":""}">${l}</a>`).join("")}</div>
      <label class="toggle" style="margin:4px 2px"><input type="checkbox" id="an-d" ${nurDepot?"checked":""}> nur Depot (ohne Merkliste)</label>
      <div class="box">${T[anTab][1] || `<div class="sub">Noch keine Einträge. Die Daten werden einmal am Tag je Aktie aus Depot und Merkliste geladen.</div>`}</div>
      <div class="sub" style="white-space:normal;margin-top:8px">Insider-Geschäfte und Analysten-Einstufungen liefert Yahoo vor allem für US-Aktien. Insider-Käufe sind interessanter als Verkäufe: Manager verkaufen aus vielen Gründen (Steuern, Hauskauf), kaufen aber meist nur, wenn sie an die Firma glauben. Bei neuen Ereignissen aus deinem Depot bekommst du eine Push-Nachricht.</div>`;
    document.querySelectorAll("[data-an]").forEach(a=>a.onclick=()=>{ anTab=a.dataset.an; renderAnalyse(); });
    $("#an-d").onchange = e=>{ store.set("an_depot", e.target.checked); renderAnalyse(); };
    document.querySelectorAll("[data-t]").forEach(r=>r.onclick=()=>openDetail(r.dataset.t));
  }

  /* ================================ Weitere Push-Einstellungen ================================ */
  function renderPush(){
    if(!need("Benachrichtigungen")) return;
    const e = Object.assign({insider:true, quartal:true, analysten:true, div_aenderung:true, wirtschaft:true, klumpen:true, klumpen_schwelle:10, rebalancing:true, steuer_erinnerung:true, tagebuch:true}, P.pf.einstellungen||{});
    const zi = P.pf.ziele || {};
    const opt = [["insider","🕵️ Insider-Käufe bei Aktien aus Depot und Merkliste (ab 50.000 $)"],["quartal","📑 Quartalszahlen deiner Aktien: Erwartungen geschlagen oder verfehlt"],
      ["analysten","🎯 Analysten-Kursziel deutlich geändert (ab 7 %)"],["div_aenderung","💶 Dividende erhöht oder gesenkt"],["wirtschaft","📆 Am Vorabend: wichtige Wirtschaftstermine (Zinsen, Inflation, Arbeitsmarkt)"],
      ["klumpen","🧱 Klumpenrisiko über ETFs (wöchentlich)"],["rebalancing","⚖️ Depot weicht von deinen Zielen ab (wöchentlich)"],["steuer_erinnerung","🧾 Im Dezember: Freibetrag noch nicht ausgeschöpft"],["tagebuch","📓 Tagebuch: These nach 3 Monaten und 1 Jahr prüfen"]];
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Weitere Push-Nachrichten</h3><div class="form">
      ${opt.map(([k,l])=>`<label class="tg"><input type="checkbox" data-pk="${k}" ${e[k]?"checked":""}> ${l}</label>`).join("")}
      <div class="two"><label>Klumpen-Warnung ab … % des Depots<input class="inp" id="pk-ks" inputmode="decimal" value="${e.klumpen_schwelle}"></label>
      <label>Rebalancing-Warnung ab … Prozentpunkten Abweichung<input class="inp" id="pk-rs" inputmode="decimal" value="${zi.schwelle||5}"></label></div></div>
      <div class="links"><button class="btn" id="pk-save">Speichern</button></div>
      <div class="sub" style="white-space:normal;margin-top:6px">Kursbewegungen, Kursalarme, Kaufzonen, Termine, Tageszusammenfassung und Wochenbericht stellst du unter Depot → Benachrichtigungen ein. Die Rebalancing-Warnung kommt erst, wenn du unter „Umschichten“ Ziele gespeichert hast.</div></div>`;
    $("#pk-save").onclick = async ()=>{ const n = {}; document.querySelectorAll("[data-pk]").forEach(i=>n[i.dataset.pk]=i.checked);
      n.klumpen_schwelle = toNum($("#pk-ks").value) || 10;
      P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, n);
      if(P.pf.ziele) P.pf.ziele.schwelle = toNum($("#pk-rs").value) || 5;
      if(await PLUS.save("Benachrichtigungen geändert", true)) renderPush(); };
  }

  /* ================================ Aktien-Detail: Kaufzone, Tagebuch, Insider ================================ */
  function detail(s){
    if(!P.key) return "";
    const kz = kaufzonen().find(a=>a.t===s.t), D = P.depot||{};
    const q = (D.quartal||[]).filter(x=>x.t===s.t).slice(0,4), ins = (D.insider||[]).filter(x=>x.t===s.t).slice(0,4), an = (D.analysten||[]).filter(x=>x.t===s.t).slice(0,3);
    return `<div class="box" id="kz-box"><h3>🎯 Kaufzone</h3>
        <div class="sub" style="white-space:normal;margin-bottom:6px">${kz?`Aktiv: Push, sobald der Kurs unter <b>${F.cur(kz.preis,s.cur)}</b> fällt (${Pc(s.p/kz.preis-1,1,true)} entfernt).`:"Leg einen Wunschpreis fest. Fällt der Kurs darunter, bekommst du sofort eine Push-Nachricht."}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="inl" id="kz-p" inputmode="decimal" value="${kz?nf(2).format(kz.preis):""}" placeholder="Preis"> <span class="sub">${esc(s.cur||"")}</span>
          <button class="btn" id="kz-s">Kaufzone setzen</button><button class="btn ghost" id="kz-f">Fairer Wert − 15 %</button>${kz?`<button class="btn ghost" id="kz-x">Entfernen</button>`:""}</div></div>
      ${q.length||ins.length||an.length?`<div class="box"><h3>Zahlen, Insider, Analysten</h3>
        ${q.map(x=>`<div class="kvrow"><span>📑 Quartal ${x.datum?dlong(x.datum):""}<br><span class="sub">EPS ${nf(2).format(x.eps_ist)} vs. ${x.eps_erw!=null?nf(2).format(x.eps_erw):"–"} erwartet${x.reaktion!=null?` · Kurs ${Pc(x.reaktion,1,true)}`:""}</span></span><b class="${x.ueberraschung>2?"up":x.ueberraschung<-2?"down":""}">${x.ueberraschung==null?"–":nf(1).format(x.ueberraschung)+" %"}</b></div>`).join("")}
        ${ins.map(x=>`<div class="kvrow"><span>🕵️ ${esc(x.wer)} <span class="sub">(${esc(x.position)})</span><br><span class="sub">${x.datum?dlong(x.datum):""}</span></span><b class="${x.art==="Kauf"?"up":"down"}">${x.art}${x.wert?" "+nf(0).format(x.wert/1e3)+" Tsd. $":""}</b></div>`).join("")}
        ${an.map(x=>`<div class="kvrow"><span>🎯 ${esc(x.firma)}<br><span class="sub">${x.datum?dlong(x.datum):""} · ${esc(x.zu)}</span></span><b>${x.ziel_neu?nf(0).format(x.ziel_neu):""}</b></div>`).join("")}</div>`:""}
      <div class="links"><button class="btn ghost" id="tb-add">📓 Kauf-These notieren</button></div>`;
  }
  function bind(s){
    const go = async () => { const v = toNum($("#kz-p").value); if(!v || v<=0) return toast("Bitte einen Preis eingeben."); await setKaufzone(s, v); };
    $("#kz-s") && ($("#kz-s").onclick = go);
    $("#kz-f") && ($("#kz-f").onclick = () => { const fw = +(document.getElementById("fw")?.dataset.fair || 0);
      if(!fw) return toast("Der Fairer-Wert-Rechner ist für diese Aktie nicht verfügbar."); $("#kz-p").value = nf(2).format(fw*0.85); });
    $("#kz-x") && ($("#kz-x").onclick = async () => { P.pf.alarme = (P.pf.alarme||[]).filter(a=>!(a.kaufzone && a.t===s.t)); if(await PLUS.save(`Kaufzone ${s.t} entfernt`, true)) openDetail(s.t); });
    $("#tb-add") && ($("#tb-add").onclick = () => tbEdit(null, {t:s.t, name:s.n, kurs:+s.p.toFixed(2)}));
  }

  /* ================================ Einbinden ================================ */
  const tiles3 = PLUS3.tiles;
  PLUS3.tiles = D => {
    const kl = (D.klumpen||[]);
    const reb = (D.rebalancing||[]).filter(a=>Math.abs(a.pp) >= ((P.pf?.ziele||{}).schwelle||5));
    const due = (P.pf?.tagebuch||[]).filter(e=>(Date.now()-new Date(e.datum))/864e5>=90 && !((e.reviews||[]).slice(-1)[0] && (Date.now()-new Date(e.reviews.slice(-1)[0].datum))/864e5<=80));
    const hinweise = [
      ...kl.map(x=>`🧱 <b>${esc(x.name)}</b> macht direkt und über ETFs <b>${nf(1).format(x.anteil*100)} %</b> deines Depots aus. <a href="#durchblick">Durchblick →</a>`),
      ...(reb.length?[`⚖️ Abweichung von deinen Zielen: ${reb.slice(0,3).map(a=>`${esc(a.gruppe)} ${nf(0).format(a.ist*100)} % statt ${nf(0).format(a.ziel*100)} %`).join(", ")}. <a href="#umschichten">Umschichten →</a>`]:[]),
      ...(due.length?[`📓 ${due.length} Tagebuch-${due.length===1?"Eintrag wartet":"Einträge warten"} auf deine Prüfung. <a href="#tagebuch">Öffnen →</a>`]:[]),
      ...((D.quartal||[]).filter(q=>q.depot && q.datum && (Date.now()-new Date(q.datum))/864e5<=7).slice(0,3).map(q=>`📑 ${esc(q.name)}: Zahlen ${q.ueberraschung>2?"besser":q.ueberraschung<-2?"schlechter":"wie"} als erwartet${q.reaktion!=null?`, Kurs ${Pc(q.reaktion,1,true)}`:""}. <a href="#analyse">Mehr →</a>`)),
    ];
    return (hinweise.length?`<div class="box" style="margin-top:10px"><h3>Hinweise</h3>${hinweise.map(h=>`<div class="ev" style="white-space:normal">${h}</div>`).join("")}</div>`:"") + tiles3(D)
      + `<div class="tiles"><a href="#analyse"><b>📑 Zahlen & Insider</b><span>Quartalszahlen, Insider, Analysten</span></a>
         <a href="#waswaere"><b>⏪ Was wäre wenn</b><span>5 Jahre zurück, Crash-Test</span></a>
         <a href="#tagebuch"><b>📓 Tagebuch</b><span>${(P.pf?.tagebuch||[]).length} Einträge${due.length?` · ${due.length} prüfen`:""}</span></a>
         <a href="#kosten"><b>💸 ETF-Kosten</b><span>Was die TER über 30 Jahre kostet</span></a>
         <a href="#waehrung"><b>💱 Währungs-Check</b><span>Rendite aus Kursen vs. Wechselkursen</span></a>
         <a href="#rente"><b>🏖 Ziel-Rente</b><span>Monatliches Einkommen im Ruhestand</span></a></div>`;
  };
  /* Steuer-Cockpit: im Dezember zeigen, wie viel Freibetrag noch übrig ist */
  const steuer3 = PLUS.VIEWS.steuer;
  PLUS.VIEWS.steuer = () => { steuer3(); const D = P.depot, R = D && D.steuer_rest; const m = new Date().getMonth();
    if(!R || m < 10 || !$("#main .dsum")) return;
    const gew = (D.positionen||[]).filter(z=>z.gv>0 && !z.manuell).sort((a,b)=>b.gv-a.gv).slice(0,5);
    $("#main .dsum").insertAdjacentHTML("afterend", `<div class="box"><h3>🧾 Freibetrag ${new Date().getFullYear()} noch nutzen</h3>
      <div>Noch etwa <b>${E(R.rest)}</b> von ${E(R.frei)} steuerfrei. Was bis 31.12. nicht genutzt wird, verfällt.</div>
      ${R.rest>=50 && gew.length?`<div class="sub" style="white-space:normal;margin:6px 0">Idee: Gewinne in Höhe des Rests verkaufen und sofort zurückkaufen. Die Gewinne sind dann steuerfrei, und dein Einstandskurs steigt. Positionen mit Gewinn:</div>
        ${gew.map(z=>`<div class="kvrow"><span>${esc(z.name)} <span class="sub">· ${esc(z.broker||"")}</span></span><b class="up">${Es(z.gv)}</b></div>`).join("")}`:""}
      <div class="sub" style="white-space:normal;margin-top:6px">Achte darauf, dass der Freistellungsauftrag beim jeweiligen Broker den Gewinn abdeckt, und rechne mit kleinen Handelskosten.</div></div>`); };

  const detail3 = PLUS3.detail, bind3 = PLUS3.bind;
  PLUS3.detail = s => detail3(s) + detail(s);
  PLUS3.bind = s => { bind3(s); bind(s); };
  const MEHR4 = [["heatmap","🟩 Heatmap","Der ganze Markt auf einen Blick"],["monopol","👑 Monopol-Radar","Langweilige Monopole mit stabilen Margen"],
    ["kaufzonen","🎯 Kaufzonen","Push, wenn eine Aktie günstig wird"],["analyse","📑 Zahlen, Insider & Analysten","Quartalszahlen, Insider-Käufe, Kursziele"],
    ["wirtschaft","📆 Wirtschaftskalender","Zinsentscheide, Inflation, Arbeitsmarkt"],["waswaere","⏪ Was wäre wenn","Dein Depot über 5 Jahre und im Crash"],
    ["tagebuch","📓 Börsen-Tagebuch","Warum habe ich gekauft?"],["rente","🏖 Ziel-Rente","Was dein Depot im Ruhestand zahlt"],
    ["kosten","💸 ETF-Kosten","TER und Kosten über 30 Jahre"],["waehrung","💱 Währungs-Check","Wie viel macht der Dollar aus?"],["push","🔔 Weitere Push-Nachrichten","Insider, Zahlen, Dividenden, Termine …"]];
  const mehr3 = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehr3();
    const first = $("#main").querySelector(".list");
    if(first) first.insertAdjacentHTML("beforeend", MEHR4.map(([h,t,s])=>`<a class="row" href="#${h}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="sub">›</span></a>`).join("")); };
  Object.assign(PLUS.VIEWS, {heatmap:renderHeatmap, monopol:renderMonopol, kaufzonen:renderKaufzonen, analyse:renderAnalyse, wirtschaft:renderWirtschaft,
    waswaere:renderWasWaere, tagebuch:renderTagebuch, rente:renderRente, kosten:renderKosten, waehrung:renderWaehrung, push:renderPush});
  PLUS3.DEPOT_VIEWS.push("monopol","kaufzonen","analyse","wirtschaft","waswaere","tagebuch","rente","kosten","waehrung","push","heatmap");
  PLUS3.MEHR.push(...MEHR4.map(m=>m[0]));
  window.addEventListener("resize", ()=>{ if(view()==="heatmap" && typeof DATA!=="undefined" && DATA){ clearTimeout(window._hmR); window._hmR=setTimeout(()=>{ if(view()==="heatmap") renderHeatmap(); }, 200); } });
  return {};
})();
