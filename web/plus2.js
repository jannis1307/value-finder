/* Value Finder – Erweiterungen 2: Depot-Check, Dividenden-Kalender, Vergleich mit MSCI World, Depot-News,
   technische Analyse im Aktien-Detail, Merkliste auf allen Geräten, Datencheck. */
"use strict";
const PLUS2 = (() => {
  const P = PLUS.P;
  const E = (x, d=0) => x==null ? "–" : new Intl.NumberFormat("de-DE",{minimumFractionDigits:d, maximumFractionDigits:d}).format(x)+" €";
  const MON = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const css = document.createElement("style");
  css.textContent = `.dcal{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;align-items:end;text-align:center}
.dcal>div{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--mut)}
.dcal .dbar{height:70px;width:100%;display:flex;align-items:flex-end;justify-content:center}
.dcal .dbar i{display:block;width:70%;max-width:22px;background:var(--acc);border-radius:4px 4px 0 0;min-height:0}
.dcal .now span{color:var(--ink);font-weight:700}.dcal small{font-size:10.5px;color:var(--ink)}
.kvrow{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:14px}.kvrow:last-child{border-bottom:0}
.reasons li.i:before{content:"•";color:var(--acc);left:5px}
.r52{height:8px;background:var(--soft);border-radius:4px;overflow:hidden;margin-top:4px}.r52 .fi{height:100%;background:var(--acc)}`;
  document.head.appendChild(css);

  /* ---------- Depot-Chart: Wert, eingezahltes Geld (Fläche), MSCI World, Werte beim Darüberfahren ---------- */
  const DC = {}; let dcN = 0;
  const dTxt = d => { const m=String(d||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d||""); };
  const kurzE = v => v==null ? "–" : (Math.abs(v)>=10000 ? F.n(v/1000,1)+" Tsd. €" : E(v));
  const RANGES = [["1M",31],["3M",92],["6M",183],["1J",366],["Max",1e9]];
  const css2 = document.createElement("style");
  css2.textContent = `.dcw .rg{display:flex;gap:4px;margin:2px 0 6px;flex-wrap:wrap}.dcw .rg a{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--mut);cursor:pointer;user-select:none}
.dcw .rg a.on{background:var(--ink);color:var(--card)}.dcw .ax{position:absolute;left:0;font-size:10.5px;color:var(--mut);transform:translateY(-50%);pointer-events:none;background:var(--card);padding:0 3px 0 0}
.dcw .el{position:absolute;right:0;font-size:11px;font-weight:600;transform:translateY(-50%);pointer-events:none;padding:1px 6px;border-radius:6px;white-space:nowrap;color:#fff}
.dcw .lg{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--mut);font-size:12px;margin-top:6px}.dcw .lg i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}`;
  document.head.appendChild(css2);

  // data: [[datum, wert]], bench: [werte] (gleicher Startwert), einz: [eingezahlt|null]
  function chart(data, bench, einz, opt){
    const a = (data||[]).map(x=>x[1]);
    if(a.length<2) return `<div class="sub">Noch zu wenig Daten.</div>`;
    const id = "dc"+(++dcN);
    DC[id] = { d:(data||[]).map(x=>x[0]), a, b:(bench && bench.length===a.length) ? bench : null,
      e:(einz && einz.length===a.length && einz.some(v=>v>0)) ? einz.map(v=>v>0?v:null) : null,
      range: (opt&&opt.range) || DCR[(opt&&opt.key)||"x"] || "Max", key: (opt&&opt.key)||"x",
      raw: !!(opt&&opt.rawBench), flows: !!(opt&&opt.flows), div: (opt&&opt.div&&opt.div.length===a.length) ? opt.div : null, name: (opt&&opt.name) || "Dein Depot", bname: (opt&&opt.bname) || "MSCI World",
      fmt: (opt&&opt.fmt) || E, dlab: (opt&&opt.dlab) || null, ref: (opt&&opt.ref&&opt.ref.v>0) ? opt.ref : null, ranges: (opt&&opt.ranges) || null, rlab: (opt&&opt.rlab) || null };
    return `<div class="dcw" data-dcw="${id}">${dcInner(id)}</div>`;
  }
  function dcSlice(o){
    const n = o.a.length, tage = (RANGES.find(r=>r[0]===o.range)||RANGES[4])[1];
    const ende = new Date(o.d[n-1]); let i0 = 0;
    for(let i=0;i<n;i++){ if((ende - new Date(o.d[i]))/864e5 <= tage){ i0 = i; break; } }
    if(n - i0 < 2) i0 = Math.max(0, n-2);
    const sl = x => x ? x.slice(i0) : null;
    const b = o.b ? (o.raw ? o.b.slice(i0) : o.b.slice(i0).map(v=>v * o.a[i0] / o.b[i0])) : null;  // sonst: gleicher Startwert
    return { d:o.d.slice(i0), a:o.a.slice(i0), b, e:sl(o.e), div:sl(o.div) };
  }
  // zeitgewichtete Rendite: Ein-/Auszahlungen (Änderung von "eingezahlt") herausrechnen
  function twrCalc(a, e, dv){ let r = 1; for(let k=1;k<a.length;k++){ let fl = (e && e[k]!=null && e[k-1]!=null) ? e[k]-e[k-1] : 0; if(dv && dv[k]!=null && dv[k-1]!=null) fl -= dv[k]-dv[k-1]; if(a[k-1] > 1) r *= (a[k]-fl)/a[k-1]; } return r-1; }
  // Gewinn in einem Zeitraum: Wertänderung − neu investiertes Geld + erhaltene Dividenden; % bezogen auf Startwert + Zuflüsse
  function gewinn(a, e, dv, i0, i1){ const de = e && e[i1]!=null && e[i0]!=null ? e[i1]-e[i0] : 0, dd = dv && dv[i1]!=null && dv[i0]!=null ? dv[i1]-dv[i0] : 0;
    const g = a[i1]-a[i0]-de+dd, basis = a[i0] + Math.max(0, de); return [g, basis > 1 ? g/basis : 0]; }
  // Wertebereich (identisch für Zeichnen und Hover, sonst sitzt der Punkt neben der Linie)
  function dcMinMax(o, s){
    const ev = (s.e||[]).filter(v=>v!=null), all = s.a.concat(s.b||[], ev);
    if(o.ref){ const lo = Math.min(...s.a), hi = Math.max(...s.a); if(o.ref.v >= lo*0.6 && o.ref.v <= hi*1.4) all.push(o.ref.v); }
    let mn=Math.min(...all), mx=Math.max(...all); const pd=(mx-mn)*0.08||Math.abs(mx)*0.02||1; return [mn-pd, mx+pd];
  }
  const dcDatum = (o, d) => o.dlab ? o.dlab(d) : dTxt(d);
  function dcInner(id){
    const o = DC[id], s = dcSlice(o), a = s.a, n = a.length, fm = o.fmt;
    const span = (new Date(o.d.at(-1)) - new Date(o.d[0]))/864e5;
    const rg = RANGES.filter(([k,t])=>(!o.ranges || o.ranges.includes(k)) && (k==="Max" || t < span+3)).map(([k])=>`<a data-dcr="${k}" class="${o.range===k?"on":""}">${(o.rlab&&o.rlab[k])||k}</a>`).join("");
    const ev = (s.e||[]).filter(v=>v!=null);
    let [mn, mx] = dcMinMax(o, s);
    const w=640, h=190, r=mx-mn;
    const X=i=>i/(n-1)*w, Y=v=>(1-(v-mn)/r)*h, Yp=v=>(1-(v-mn)/r)*100;
    const pts = arr => arr.map((v,i)=>v==null?null:`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean).join(" ");
    const up = a[n-1]>=a[0], c = up ? "var(--up)" : "var(--down)";
    const pa = a[n-1]/a[0]-1, pb = s.b ? s.b.at(-1)/s.b[0]-1 : null;
    // Gitterlinien mit Euro-Werten
    const st = Math.pow(10, Math.floor(Math.log10(r/3))), step = [1,2,2.5,5,10].map(m=>m*st).find(x=>r/x<=4.5);
    let grid = "", ax = "";
    for(let v=Math.ceil(mn/step)*step; v<=mx; v+=step){ grid += `<line x1="0" x2="${w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`; ax += `<span class="ax" style="top:${Yp(v)}%">${fm(Math.abs(v)<r*1e-6?0:v)}</span>`; }
    const refOk = o.ref && o.ref.v>mn && o.ref.v<mx;
    if(refOk) grid += `<line x1="0" x2="${w}" y1="${Y(o.ref.v).toFixed(1)}" y2="${Y(o.ref.v).toFixed(1)}" stroke="var(--warn)" stroke-width="1.4" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`;
    // Fläche "eingezahlt": nur dort, wo Werte vorliegen
    let eArea = "";
    if(s.e){ const idx = s.e.map((v,i)=>v!=null?i:null).filter(i=>i!=null);
      if(idx.length>=2) eArea = `<polygon points="${X(idx[0])},${h} ${idx.map(i=>`${X(i).toFixed(1)},${Y(s.e[i]).toFixed(1)}`).join(" ")} ${X(idx.at(-1))},${h}" fill="var(--mut)" opacity=".16"/>
        <polyline points="${pts(s.e)}" fill="none" stroke="var(--mut)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`; }
    // Beschriftung am rechten Rand
    const lab = [[Yp(a[n-1]), fm(a[n-1]), c]];
    if(refOk) lab.push([Yp(o.ref.v), o.ref.label+" "+fm(o.ref.v), "var(--warn)"]);
    if(ev.length) lab.push([Yp(ev.at(-1)), (o.flows?"investiert ":"eingezahlt ")+E(ev.at(-1)), "var(--mut)"]);
    if(lab.length===2 && Math.abs(lab[0][0]-lab[1][0])<12){ const m=(lab[0][0]+lab[1][0])/2, sg=lab[0][0]<lab[1][0]?-1:1; lab[0][0]=m+sg*6; lab[1][0]=m-sg*6; }
    const dvEnde = (o.flows && s.div) ? (s.div[n-1]||0) - (s.div[0]||0) : 0;  // im Zeitraum erhaltene Dividenden
    const gew = ev.length ? a[n-1]-ev.at(-1) + (o.flows && s.div ? s.div[n-1]||0 : 0) : null;
    return `<div class="rg">${rg}</div>
      <div class="dchart" data-dc="${id}" style="position:relative;touch-action:pan-y;cursor:crosshair;height:${h}px">
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="display:block;overflow:visible">
        ${grid}
        <polygon points="0,${h} ${pts(a)} ${w},${h}" fill="${c}" opacity=".13"/>
        ${eArea}
        ${s.b?`<polyline points="${pts(s.b)}" fill="none" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>`:""}
        <polyline points="${pts(a)}" fill="none" stroke="${c}" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <line class="dc-l" x1="0" x2="0" y1="0" y2="${h}" stroke="var(--ink)" stroke-opacity=".35" stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/></svg>
      ${ax}${lab.map(([y,t,col])=>`<span class="el" style="top:${y}%;background:${col}">${t}</span>`).join("")}
      <span class="dc-p" style="position:absolute;width:10px;height:10px;border-radius:50%;background:${c};border:2px solid var(--card);transform:translate(-50%,-50%);display:none;pointer-events:none"></span>
      <div class="dc-t" style="position:absolute;top:2px;display:none;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:12px;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap;z-index:5"></div></div>
      <div style="display:flex;justify-content:space-between;color:var(--mut);font-size:11px;margin-top:3px"><span>${esc(dTxt(s.d[0]))}</span><span>${esc(dTxt(s.d[n-1]))}</span></div>
      ${o.flows ? (()=>{ const [gD, pD] = gewinn(a, s.e, s.div, 0, n-1), [gB, pB] = s.b ? gewinn(s.b, s.e, s.div, 0, n-1) : [0,0];
        return `<div class="lg"><span><i style="background:${c}"></i>${esc(o.name)} ${E(a[n-1])}</span>
        <span><i style="background:var(--mut);opacity:.45"></i>Investiert ${E(ev.at(-1))}</span>
        ${s.div && s.div[n-1] ? `<span>Dividenden & Zinsen ${E(s.div[n-1],2)}</span>` : ""}
        <span>Gewinn${s.div && s.div[n-1] ? " inkl. Dividenden" : ""}${s.d[0]!==o.d[0] ? " im Zeitraum" : ""} <b style="color:var(${gD>=0?"--up":"--down"})">${(gD>=0?"+":"")+E(gD)} (${F.p(pD,1)})</b></span>
        ${s.b?`<span><i style="background:repeating-linear-gradient(90deg,var(--mut) 0 5px,transparent 5px 9px);height:3px;vertical-align:3px"></i>${esc(o.bname)}: ${(gB>=0?"+":"")+E(gB)} (${F.p(pB,1)}) · ${gD>=gB?"✓ du warst besser":"✗ der Index war besser"}</span>`:""}</div>`; })() : `
      <div class="lg"><span><i style="background:${c}"></i>${esc(o.name)} <b style="color:${c}">${F.p(pa,1)}</b></span>${o.fmt!==E?`<span>Tief ${fm(Math.min(...a))} · Hoch ${fm(Math.max(...a))}</span>`:""}
        ${ev.length?`<span><i style="background:var(--mut);opacity:.45"></i>Eingezahlt (Summe deiner Käufe)</span><span>Abstand = Gewinn <b style="color:var(${gew>=0?"--up":"--down"})">${(gew>=0?"+":"")+E(gew)}</b></span>`:""}
        ${s.b?`<span><i style="background:repeating-linear-gradient(90deg,var(--mut) 0 5px,transparent 5px 9px);height:3px;vertical-align:3px"></i>${esc(o.bname)} ${F.p(pb,1)} · ${pa>=pb?"✓ besser":"✗ schlechter"} als der Markt</span>`:""}
        ${refOk||o.ref?`<span><i style="background:repeating-linear-gradient(90deg,var(--warn) 0 5px,transparent 5px 9px);height:3px;vertical-align:3px"></i>${esc(o.ref.label)} ${fm(o.ref.v)} · heute <b style="color:var(${a[n-1]>=o.ref.v?"--up":"--down"})">${F.p(a[n-1]/o.ref.v-1,1)}</b></span>`:""}</div>`}`;
  }
  function dcZeig(el, clientX){
    const id = el.dataset.dc, o = DC[id]; if(!o) return;
    const s = dcSlice(o), n = s.a.length, R = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - R.left) / R.width)), i = Math.round(fx*(n-1)), xv = i/(n-1);
    const [mn, mx] = dcMinMax(o, s), fm = o.fmt;
    const l = el.querySelector(".dc-l"); l.setAttribute("x1", xv*640); l.setAttribute("x2", xv*640); l.style.display = "";
    const p = el.querySelector(".dc-p"); p.style.left = (xv*100)+"%"; p.style.top = ((1-(s.a[i]-mn)/(mx-mn))*R.height)+"px"; p.style.display = "";
    const ein = s.e ? s.e[i] : null, wert = s.a[i];
    const t = el.querySelector(".dc-t");
    t.innerHTML = `<b>${esc(dcDatum(o, s.d[i]))}</b><br>${esc(o.name)}: <b>${fm(wert)}</b>`
      + (ein!=null ? (()=>{ const g = wert-ein+(o.flows && s.div ? s.div[i]||0 : 0); return `<br>${o.flows?"Investiert":"Eingezahlt"}: ${E(ein)}<br>Gewinn${o.flows && s.div && s.div[i] ? " inkl. Dividenden" : ""}: <b style="color:var(${g>=0?"--up":"--down"})">${(g>=0?"+":"")+E(g)} (${F.p(ein?g/ein:0,1)})</b>`; })() : "")
      + (s.b ? `<br>${esc(o.bname)}: ${fm(s.b[i])}` : "")
      + (o.ref ? `<br>${esc(o.ref.label)}: ${fm(o.ref.v)} → <b style="color:var(${wert>=o.ref.v?"--up":"--down"})">${F.p(wert/o.ref.v-1,1)}</b>` : "")
      + (s.div && s.div[i] ? `<br>Dividenden & Zinsen bisher: ${E(s.div[i],2)}` : "")
      + (i>0 && !(o.flows && s.d[0]===o.d[0]) ? `<br><span style="color:var(--mut)">${o.flows ? (()=>{ const [g,p] = gewinn(s.a, s.e, s.div, 0, i); return `Gewinn seit ${esc(dTxt(s.d[0]))}: ${(g>=0?"+":"")+E(g)} (${F.p(p,1)})`; })() : `seit ${esc(dTxt(s.d[0]))}: ${F.p(wert/s.a[0]-1,1)}`}</span>` : "")
      + (!o.flows && i < n-1 ? `<br><span style="color:var(--mut)">bis heute: ${F.p(s.a[n-1]/wert-1,1)}</span>` : "");
    t.style.display = "";
    const tw = t.offsetWidth, px = xv*R.width;
    t.style.left = (px > R.width/2 ? Math.max(0, px - tw - 12) : Math.min(R.width - tw, px + 12)) + "px";
  }
  function dcAus(el){ ["dc-l","dc-p","dc-t"].forEach(k=>{ const x=el.querySelector("."+k); if(x) x.style.display="none"; }); }
  const dcVon = ev => (ev.target && ev.target.closest) ? ev.target.closest(".dchart") : null;
  document.addEventListener("mousemove", ev => { const el = dcVon(ev); document.querySelectorAll(".dchart").forEach(d=>{ if(d!==el) dcAus(d); }); if(el) dcZeig(el, ev.clientX); });
  document.addEventListener("touchstart", ev => { const el = dcVon(ev); document.querySelectorAll(".dchart").forEach(d=>{ if(d!==el) dcAus(d); }); if(el) dcZeig(el, ev.touches[0].clientX); }, {passive:true});
  document.addEventListener("touchmove", ev => { const el = dcVon(ev); if(el) dcZeig(el, ev.touches[0].clientX); }, {passive:true});
  document.addEventListener("click", ev => { const b = ev.target.closest && ev.target.closest("[data-dcr]"); if(!b) return;
    const w = b.closest("[data-dcw]"), id = w.dataset.dcw; DC[id].range = b.dataset.dcr; DCR[DC[id].key] = b.dataset.dcr; w.innerHTML = dcInner(id); });
  const DCR = {};


  /* ---------- Kurs-Chart einer Aktie (Detailansicht) mit Hover wie im Depot ---------- */
  // spark = Wochenschlusskurse der letzten 52 Wochen (Yahoo, resample "W"); letzter Punkt = letzter Kurs
  function sparkDaten(s){
    const v = (s.spark||[]).filter(x=>x!=null && isFinite(x)); if(v.length<2) return null;
    const last = new Date((s.datum||new Date().toISOString().slice(0,10))+"T12:00:00");
    const sonntag = new Date(last); sonntag.setDate(last.getDate() + (7 - last.getDay()) % 7);   // Ende der aktuellen Woche
    return v.map((x,k)=>{ const back = v.length-1-k; if(!back) return [s.datum, x];
      const fr = new Date(sonntag); fr.setDate(sonntag.getDate() - 7*back - 2); return [fr.toISOString().slice(0,10), x]; });
  }
  function kursChart(s){
    const d = sparkDaten(s); if(!d) return "";
    let ref = null;
    const z = P.depot && (P.depot.positionen||[]).find(z=>z.t===s.t && z.ek && z.p && z.p_eur);
    if(z) ref = { v: z.ek * z.p / z.p_eur, label: "Dein Einstand" };   // EK ist in Euro, Kurs in Heimatwährung
    const letzter = d.length-1;
    return chart(d, null, null, { key:"aktie", name: s.n, fmt: v => F.cur(v, s.cur), ranges:["3M","6M","Max"], rlab:{Max:"1J"}, range: DCR.aktie || "Max", ref,
      dlab: x => x===d[letzter][0] ? dTxt(x)+" (letzter Kurs)" : "Woche bis "+dTxt(x) });
  }

  /* ---------- Transaktions-Import (Broker-CSV) ---------- */
  const zahl = x => { x = String(x==null?"":x).trim().replace(/^"|"$/g,""); if(!x) return null; if(/,\d+$/.test(x) || /\.\d{3},/.test(x)) x = x.replace(/\./g,"").replace(",","."); const v = parseFloat(x); return isNaN(v) ? null : v; };
  function csvZeilen(text, sep){
    const out = []; let row = [], f = "", q = false;
    for(let k=0;k<text.length;k++){ const ch = text[k];
      if(q){ if(ch==='"'){ if(text[k+1]==='"'){ f+='"'; k++; } else q=false; } else f+=ch; }
      else if(ch==='"') q=true; else if(ch===sep){ row.push(f); f=""; } else if(ch==="\n"){ row.push(f.replace(/\r$/,"")); out.push(row); row=[]; f=""; } else f+=ch; }
    if(f || row.length){ row.push(f.replace(/\r$/,"")); out.push(row); }
    return out.filter(r=>r.some(x=>x.trim()));
  }
  function txParse(text){
    text = text.replace(/^﻿/,"");
    const erste = text.split("\n")[0].toLowerCase();
    if(/^date;time;status;reference;description;assettype;type;isin/.test(erste)){
      const Z = csvZeilen(text, ";"), H = Z[0].map(h=>h.trim().toLowerCase()), ix = k => H.indexOf(k);
      const rows = Z.slice(1).map(r=>({ br:"Scalable", ref:r[ix("reference")], d:r[ix("date")], z:r[ix("time")], s:r[ix("status")], typ:r[ix("type")],
        isin:(r[ix("isin")]||"").trim()||null, name:r[ix("description")]||"", stk:zahl(r[ix("shares")]), kurs:zahl(r[ix("price")]),
        betrag:zahl(r[ix("amount")])||0, gebuehr:zahl(r[ix("fee")])||0, steuer:zahl(r[ix("tax")])||0, cur:r[ix("currency")] }));
      return { broker:"Scalable", rows };
    }
    if(/^"?datetime"?,"?date"?,"?account_type"?,"?category"?,"?type"?/.test(erste)){
      const Z = csvZeilen(text, ","), H = Z[0].map(h=>h.trim().toLowerCase()), ix = k => H.indexOf(k);
      const rows = Z.slice(1).map(r=>({ br:"Trade Republic", ref:(r[ix("datetime")]||"").slice(0,19)+"|"+(r[ix("transaction_id")]||"").slice(0,8), d:r[ix("date")], z:(r[ix("datetime")]||"").slice(0,19), s:"Executed",
        kat:r[ix("category")], typ:r[ix("type")], ac:r[ix("asset_class")]||"", isin:(r[ix("symbol")]||"").trim()||null, name:r[ix("name")]||"",
        stk:zahl(r[ix("shares")]), kurs:zahl(r[ix("price")]), betrag:zahl(r[ix("amount")]), gebuehr:zahl(r[ix("fee")])||0, steuer:zahl(r[ix("tax")])||0, cur:r[ix("currency")] }))
        // nur Wertpapier-Buchungen übernehmen (keine Kartenzahlungen, Überweisungen, IBANs)
        .filter(x => x.kat==="TRADING" || x.kat==="DELIVERY" || (x.kat==="CASH" && (x.typ==="DIVIDEND" || (x.typ==="INTEREST_PAYMENT" && x.isin))));
      return { broker:"Trade Republic", rows };
    }
    return { err:"Format nicht erkannt. Unterstützt: Scalable Capital (Transaktionen → Export) und Trade Republic (Profil → Kontoauszüge → Transaktionsexport)." };
  }
  function txMerge(pf, rows){
    const alt = pf.transaktionen || [], key = r => r.br+"|"+r.ref, da = new Set(alt.map(key));
    const neu = rows.filter(r=>r.s==="Executed" && r.ref && !da.has(key(r)));
    pf.transaktionen = alt.concat(neu).sort((x,y)=>(x.d+(x.z||"")).localeCompare(y.d+(y.z||"")));
    return neu.length;
  }
  function txImport(){
    const P = PLUS.P;
    $("#sheet").innerHTML = `<div class="shead"><div style="min-width:0"><h2>Transaktionen importieren</h2><div class="sub" style="white-space:normal">Damit zeigt der Verlauf dein <b>echtes</b> Depot seit dem ersten Kauf – mit Einzahlungen, Gewinn und fairer Rendite. Scalable: Transaktionen → Export (CSV). Trade Republic: Profil → Kontoauszüge → Transaktionsexport (ganzer Zeitraum). Gespeichert wird verschlüsselt.</div></div><button class="iconbtn x" data-close aria-label="Schließen">✕</button></div>
      <div class="form"><input type="file" id="tx-file" accept=".csv,.txt,text/csv"></div><div id="tx-prev"></div>`;
    $("#ov").classList.add("open"); document.body.style.overflow="hidden";
    $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeDetail);
    $("#tx-file").onchange = async e => {
      const f = e.target.files[0]; if(!f) return; const buf = await f.arrayBuffer(); let t = new TextDecoder("utf-8").decode(buf); if(t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
      const r = txParse(t);
      if(r.err){ $("#tx-prev").innerHTML = `<div class="err" style="white-space:normal">${esc(r.err)}</div>`; return; }
      const ok = r.rows.filter(x=>x.s==="Executed");
      const kauf = ok.filter(x=>/^(Buy|Savings plan|Reinvestment_Distribution|BUY)$/.test(x.typ)).length, verk = ok.filter(x=>/^(Sell|SELL)$/.test(x.typ)).length, div = ok.filter(x=>/Distribution|DIVIDEND|INTEREST_PAYMENT/.test(x.typ) && !/Reinvestment/.test(x.typ)).length;
      const dmin = ok.map(x=>x.d).sort()[0], dmax = ok.map(x=>x.d).sort().at(-1);
      $("#tx-prev").innerHTML = `<div class="box" style="margin-top:10px"><b>${esc(r.broker)}</b>: ${ok.length} Buchungen vom ${esc(dTxt(dmin))} bis ${esc(dTxt(dmax))}<br>
        ${kauf} Käufe · ${verk} Verkäufe · ${div} Dividenden/Zinsen<br><span class="sub">Nur Wertpapier-Buchungen werden gespeichert (keine Kartenzahlungen oder Kontodaten). Schon importierte Buchungen werden nicht doppelt gezählt.</span></div>
        <div class="links"><button class="btn" id="tx-go">Importieren</button></div>`;
      $("#tx-go").onclick = async () => { const n = txMerge(P.pf, r.rows); if(await PLUS.save(`Transaktionen importiert (${r.broker}, ${n} neu)`)){ closeDetail(); } };
    };
  }

  /* ---------- Depot-Check ---------- */
  function check(D){
    const Z = (D.positionen||[]).filter(z=>z.wert>0), S = D.summe, out = [];
    const ok = (t) => out.push(["ok", t]), warn = (t) => out.push(["warn", t]), info = (t) => out.push(["info", t]);
    const sorted = [...Z].sort((a,b)=>b.wert-a.wert), top3 = sorted.slice(0,3).reduce((s,z)=>s+z.anteil,0);
    info(`${Z.length} Positionen · größte: ${esc(sorted[0]?.name||"–")} mit ${F.n((sorted[0]?.anteil||0)*100,1)} % · Top 3 zusammen ${F.n(top3*100,0)} %`);
    const gross = Z.filter(z=>z.anteil>0.2 && (z.art||"")!=="ETF");
    gross.length ? warn(`Klumpenrisiko: ${gross.map(z=>esc(z.name)+" "+F.n(z.anteil*100,0)+" %").join(", ")}. Einzelaktien über 20 % machen das Depot von einer Firma abhängig.`) : ok("Keine Einzelaktie über 20 % des Depots.");
    const cur = Object.fromEntries((D.verteilung?.["Währung"]||[]).map(([k,v,p])=>[k,p]));
    const usd = cur.USD||0;
    usd>0.6 ? warn(`${F.n(usd*100,0)} % deines Depots notieren in US-Dollar: Ein schwächerer Dollar drückt deinen Euro-Wert.`) : info(`Währungen: ${Object.entries(cur).slice(0,4).map(([k,p])=>`${k==="–"||k==="Sonstiges"?"ohne":k} ${F.n(p*100,0)} %`).join(" · ")}`);
    const etf = Z.filter(z=>(z.art||"")==="ETF" || z.sektor==="ETF / Fonds").reduce((s,z)=>s+z.anteil,0);
    info(`ETF-Anteil ${F.n(etf*100,0)} % · Einzelaktien ${F.n(Z.filter(z=>(z.art||"")==="EQUITY").reduce((s,z)=>s+z.anteil,0)*100,0)} %`);
    const sek = (D.verteilung?.Branche||[]).filter(([k])=>!/ETF|Anleihe|Krypto|ELTIF|Ohne Kurs/.test(k));
    if(sek[0] && sek[0][2]>0.3) warn(`Branche „${esc(sek[0][0])}“ macht ${F.n(sek[0][2]*100,0)} % aus (ohne ETFs).`);
    const dj = (D.div_monate||[]).reduce((a,b)=>a+b,0) || S.div_jahr, dy = S.wert ? dj/S.wert : 0;
    info(`Dividendenrendite des Depots ≈ ${F.n(dy*100,2)} % (${E(dj)} pro Jahr)`);
    const verl = Z.filter(z=>z.gv_pct!=null && z.gv_pct<-0.2);
    if(verl.length) warn(`Mehr als 20 % im Minus: ${verl.map(z=>esc(z.name)+" "+F.p(z.gv_pct,0)).join(", ")}. Lohnt sich ein Blick, ob die Kaufidee noch stimmt.`);
    const klein = Z.filter(z=>z.anteil<0.005);
    if(klein.length>=4) info(`${klein.length} Mini-Positionen unter 0,5 % (${klein.slice(0,5).map(z=>esc(z.name)).join(", ")}${klein.length>5?" …":""}). Sie bewegen das Depot kaum.`);
    if(D.verlauf?.length>1 && D.benchmark?.length===D.verlauf.length){
      const pa=D.verlauf.at(-1)[1]/D.verlauf[0][1]-1, pb=D.benchmark.at(-1)/D.benchmark[0]-1;
      (pa>=pb?ok:warn)(`Deine heutigen Positionen ${pa>=pb?"schlagen den":"liegen hinter dem"} MSCI World im letzten Jahr (${F.p(pa,1)} vs. ${F.p(pb,1)}).`);
    }
    const ueber = Z.filter(z=>z.rsi!=null && z.rsi<30), heiss = Z.filter(z=>z.rsi!=null && z.rsi>75);
    if(ueber.length) info(`Kurzfristig überverkauft (RSI < 30): ${ueber.map(z=>esc(z.name)).join(", ")}`);
    if(heiss.length) info(`Kurzfristig heiß gelaufen (RSI > 75): ${heiss.map(z=>esc(z.name)).join(", ")}`);
    return `<div class="box"><h3>Depot-Check</h3><ul class="reasons">${out.map(([k,t])=>`<li class="${k==="warn"?"w":k==="info"?"i":""}">${t}</li>`).join("")}</ul>
      <div class="sub" style="white-space:normal;margin-top:6px">Automatische Hinweise, keine Anlageberatung.</div></div>`;
  }

  /* ---------- Dividenden-Kalender ---------- */
  function dividenden(D){
    if(typeof PLUS3!=="undefined") return PLUS3.divCal(D, false);
    const m = D.div_monate||[]; if(!m.some(x=>x>0)) return "";
    const mx = Math.max(...m), jetzt = new Date().getMonth();
    const T = (D.div_termine||[]).slice(0,6);
    return `<div class="box"><h3>Dividenden-Kalender</h3>
      <div class="dcal">${m.map((v,i)=>`<div class="${i===jetzt?"now":""}" title="${MON[i]}: ${E(v,2)}"><div class="dbar"><i style="height:${mx?Math.max(2,Math.round(v/mx*100)):0}%"></i></div><span>${MON[i]}</span><small>${v>=1?Math.round(v):v>0?"<1":""}</small></div>`).join("")}</div>
      <div class="sub" style="white-space:normal;margin:6px 0 8px">Geschätzt aus den Zahlungen der letzten 12 Monate, in Euro vor Steuern. Summe ${E(m.reduce((a,b)=>a+b,0))} pro Jahr.</div>
      ${T.length?`<div class="sub" style="color:var(--ink);font-weight:600;margin-bottom:4px">Nächste Ex-Tage</div>${T.map(t=>`<div class="kvrow"><span>${new Date(t.datum).toLocaleDateString("de-DE",{day:"2-digit",month:"short"})} · ${esc(t.name)}${t.bestaetigt?" ✓":""}</span><b>≈ ${E(t.betrag,2)}</b></div>`).join("")}`:""}
      <div class="links"><a href="#dividenden">Alle Dividenden-Termine →</a></div></div>`;
  }

  /* ---------- Gewinner & Verlierer ---------- */
  function topflop(D){
    const Z = (D.positionen||[]).filter(z=>z.r1y!=null && !z.manuell);
    if(Z.length<4) return "";
    const s = [...Z].sort((a,b)=>b.r1y-a.r1y), n = Math.min(4, Math.floor(s.length/2)), row = z=>`<div class="kvrow"><span>${esc(z.name)}</span><b class="${cls(z.r1y)}">${F.p(z.r1y,0)}</b></div>`;
    return `<div class="box"><h3>Gewinner & Verlierer (1 Jahr, Kurs)</h3><div class="two"><div>${s.slice(0,n).map(row).join("")}</div><div>${s.slice(-n).reverse().map(row).join("")}</div></div></div>`;
  }

  /* ---------- News ---------- */
  function news(D){
    const N = (D.news||[]).slice(0,8); if(!N.length) return "";
    return `<div class="box"><h3>News zu deinen Aktien</h3>${N.map(n=>`<div class="ev"><a href="${esc(n.url||"#")}" target="_blank" rel="noopener"><b>${esc(n.titel)}</b></a><div class="sub" style="white-space:normal">${esc(n.name)} · ${esc(n.quelle||"")} · ${F.ago(n.zeit)}</div></div>`).join("")}</div>`;
  }

  function depotExtras(D){ return (typeof PLUS3!=="undefined" ? PLUS3.tiles(D) : "") + check(D) + dividenden(D) + topflop(D) + news(D); }

  /* ---------- Technische Analyse (Aktien-Detail) ---------- */
  function detailTech(s){
    if(s.rsi==null && s.sma200==null) return "";
    const rsiTxt = s.rsi==null ? "–" : s.rsi<30 ? "überverkauft" : s.rsi>70 ? "überkauft" : "neutral";
    const ab = (m) => m ? s.p/m-1 : null;
    const pos52 = s.dd!=null ? Math.max(0, Math.min(100, Math.round((1+s.dd)*100))) : null;
    const sig = s.kreuz==="golden" ? `<li>Golden Cross: Die 50-Tage-Linie ist gerade über die 200-Tage-Linie gestiegen (gilt als positives Trendsignal).</li>`
              : s.kreuz==="death" ? `<li class="w">Death Cross: Die 50-Tage-Linie ist gerade unter die 200-Tage-Linie gefallen (gilt als negatives Trendsignal).</li>` : "";
    const trend = s.sma200==null ? "" : s.p>=s.sma200 ? "Kurs über der 200-Tage-Linie: langfristiger Aufwärtstrend." : "Kurs unter der 200-Tage-Linie: langfristiger Abwärtstrend.";
    return `<div class="box"><h3>Technische Analyse</h3><div class="kv">
        <div><span>RSI (14 Tage)</span><b>${s.rsi==null?"–":F.n(s.rsi,0)} · ${rsiTxt}</b></div>
        <div><span>50-Tage-Linie</span><b>${F.cur(s.sma50,s.cur)} (${F.p(ab(s.sma50),0)})</b></div>
        <div><span>200-Tage-Linie</span><b>${F.cur(s.sma200,s.cur)} (${F.p(ab(s.sma200),0)})</b></div>
      </div>
      ${pos52!=null?`<div class="sub" style="margin-top:8px">Position im 52-Wochen-Bereich</div><div class="tr r52"><div class="fi" style="width:${pos52}%"></div></div>`:""}
      <ul class="reasons" style="margin-top:8px">${trend?`<li class="${s.p>=s.sma200?"":"w"}">${trend}</li>`:""}${sig}${s.hist&&s.hist<240?`<li class="w">Erst seit ${s.hist} Handelstagen an der Börse: noch keine volle Jahres-Historie.</li>`:""}</ul>
      <div class="sub" style="white-space:normal">RSI unter 30 = kurzfristig stark gefallen, über 70 = stark gestiegen. Technische Signale sind Hinweise, keine Prognosen.</div></div>`;
  }

  /* ---------- Merkliste auf allen Geräten ---------- */
  let syncTimer = null;
  function syncStars(){
    if(!P.key || !P.token || !P.pf) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => { P.pf.merkliste = [...stars]; await PLUS.save("Merkliste aktualisiert", true); }, 1500);
  }
  function afterLoad(){
    if(!P.pf || !Array.isArray(P.pf.merkliste)) return;
    let neu = false;
    for(const t of P.pf.merkliste){ if(!stars.has(t)){ stars.add(t); neu = true; } }
    if(neu){ store.set("stars", [...stars]); }
    if([...stars].some(t=>!P.pf.merkliste.includes(t))) syncStars();
  }

  /* ---------- Datencheck ---------- */
  function renderDatencheck(){
    const S = DATA.stocks, C = DATA.check || {}, now = Date.now();
    const daten = Object.entries(S.reduce((a,s)=>(a[s.datum]=(a[s.datum]||0)+1,a),{})).sort();
    const alt = S.filter(s=>(now-new Date(s.datum))/864e5>4);
    const kurz = S.filter(s=>s.hist && s.hist<240);
    const ohneK = S.filter(s=>s.kgv_fwd==null && s.marge==null);
    const ageMin = Math.round((now-new Date(DATA.stand))/60000);
    const row = (ok, t, d) => `<div class="ev"><b>${ok?"✅":"⚠️"} ${t}</b>${d?`<div class="sub" style="white-space:normal">${d}</div>`:""}</div>`;
    $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Datencheck</h3>
      ${row(ageMin<30, `Letzter Scan vor ${ageMin} Min. (${F.dt(DATA.stand)})`, "Werktags alle 2–3 Minuten von ca. 7 bis 23 Uhr, am Wochenende alle 2 Stunden. Ist der Stand beim Öffnen älter als 12 Minuten, startet die App selbst einen Scan.")}
      ${row(!C.universum || C.mit_kursen>=C.universum*0.97, `${C.mit_kursen??S.length} von ${C.universum??S.length} Aktien mit Kursen`, (C.ohne_kurs||[]).length?`Ohne Kurse: ${C.ohne_kurs.map(esc).join(", ")}`:"")}
      ${row(ohneK.length<S.length*0.05, `${S.length-ohneK.length} Aktien mit Kennzahlen (KGV, Marge …)`, `Kennzahlen werden einmal täglich je Aktie aktualisiert. Stand der ältesten: ${F.dt(DATA.stand_kennzahlen)}.`)}
      ${row(!alt.length, alt.length?`${alt.length} Aktien mit altem Kurs`:"Alle Kurse aktuell", `Kursdaten: ${daten.map(([d,n])=>`${F.d(d)}: ${n}`).join(" · ")}. US-Werte haben vor 15:30 Uhr den Schlusskurs vom Vortag.`)}
      ${row(true, `${S.filter(s=>s.rsi!=null).length} Aktien technisch ausgewertet`, "RSI, 50- und 200-Tage-Linie, Golden/Death Cross.")}
      ${row(true, `${S.filter(s=>s.er).length} Quartalszahlen-Termine und ${S.filter(s=>s.exd).length} Ex-Dividenden-Termine bekannt`)}
      ${kurz.length?row(true, `${kurz.length} neue Börsengänge mit weniger als 1 Jahr Historie`, kurz.map(s=>`${esc(s.n)} (${s.hist} Tage)`).join(", ")+". Für sie wird keine 1-Jahres-Performance berechnet."):""}
      ${P.depot?row(!(P.depot.positionen||[]).some(z=>z.fehler), `Depot: ${(P.depot.positionen||[]).length} Positionen, Stand ${F.dt(P.depot.stand)}`, (P.depot.positionen||[]).filter(z=>z.fehler).map(z=>`${esc(z.name)}: ${esc(z.fehler)}`).join(" · ")):""}
      ${P.depot?row(P.depot.push_aktiv, P.depot.push_aktiv?"Push-Nachrichten aktiv":"Push-Nachrichten nicht eingerichtet"):""}
      </div>`;
  }

  /* ---------- Dividenden-Seite ---------- */
  function renderDividenden(){
    if(!P.key){ $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>Dividenden</h3><p>Verbinde zuerst dieses Gerät mit deinem Depot (Depot → Gerät verbinden).</p></div>`; return; }
    if(!P.loaded || !P.depot){ $("#main").innerHTML = `<div class="empty">Dividenden werden geladen …</div>`; PLUS.loadDepot(); return; }
    const D = P.depot, m = D.div_monate||[], T = D.div_termine||[], I = D.div_info||[];
    const jahr = m.reduce((a,b)=>a+b,0), wert = D.summe?.wert||0, heute = new Date().toISOString().slice(0,10);
    const ohne = (D.positionen||[]).filter(z=>!z.manuell && z.t && !I.some(i=>i.t===z.t));
    const naechst = T.find(t=>t.datum>=heute);
    const gruppen = {}; for(const t of T){ const k=t.datum.slice(0,7); (gruppen[k]=gruppen[k]||[]).push(t); }
    const cur = (v,c) => F.n(v, v<1?3:2)+" "+({USD:"$",EUR:"€",GBp:"p",GBP:"£",CHF:"CHF",SEK:"kr",HKD:"HK$",DKK:"kr"}[c]||c||"");
    $("#main").innerHTML = `
      <div class="box dsum" style="margin-top:12px">
        <div><div class="sub">Dividenden / Jahr</div><div class="px big2">${E(jahr)}</div></div>
        <div><div class="sub">Ø pro Monat</div><div class="px">${E(jahr/12,2)}</div></div>
        <div><div class="sub">Dividendenrendite Depot</div><div class="px">${wert?F.n(jahr/wert*100,2)+" %":"–"}</div></div>
        <div><div class="sub">Sparerpauschbetrag (1.000 €)</div><div class="px">${F.n(Math.min(100,jahr/10),0)} %</div>
          <div class="tr" style="margin-top:6px"><div class="fi" style="width:${Math.min(100,jahr/10)}%"></div></div></div>
      </div>
      ${naechst?`<div class="notif">📅 Nächster Ex-Tag: <b>${new Date(naechst.datum).toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"})}</b> · ${esc(naechst.name)} · ≈ ${E(naechst.betrag,2)}${naechst.bestaetigt?" (bestätigt)":" (geschätzt)"}</div>`:""}
      ${typeof PLUS3!=="undefined" ? PLUS3.divCal(D, true) : dividenden(D).replace(/<div class="links">.*?<\/div>/s,"")}
      <div class="box"><h3>Termine der nächsten 12 Monate</h3>
        ${Object.entries(gruppen).map(([k,L])=>`<div class="tday" style="margin-top:10px">${new Date(k+"-01").toLocaleDateString("de-DE",{month:"long",year:"numeric"})} <span class="sub">≈ ${E(L.reduce((a,t)=>a+t.betrag,0),2)}</span></div>
          ${L.map(t=>`<div class="kvrow"><span>${new Date(t.datum).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})} · ${esc(t.name)} <span class="tag ${t.bestaetigt?"news":"dividende"}" style="font-size:10px">${t.bestaetigt?"bestätigt":"geschätzt"}</span><br><span class="sub">${cur(t.pro_aktie,t.cur)} je Aktie</span></span><b>≈ ${E(t.betrag,2)}</b></div>`).join("")}`).join("") || `<div class="sub">Keine Termine gefunden.</div>`}
      </div>
      <div class="box"><h3>Deine Dividendenzahler</h3>
        ${I.map(i=>`<div class="kvrow"><span><b>${esc(i.name)}</b><br><span class="sub">${i.rhythmus} · ${cur(i.pro_aktie_jahr,i.cur)} je Aktie/Jahr · zuletzt ${F.d(i.letzte[0])}${i.naechste?` · nächster Ex-Tag ${F.d(i.naechste)}`:""}</span></span><b style="text-align:right">${E(i.jahr,2)}<br><span class="sub">${i.rendite!=null?F.n(i.rendite*100,2)+" %":""}</span></b></div>`).join("") || `<div class="sub">Keine Dividendenzahler gefunden.</div>`}
        ${ohne.length?`<div class="sub" style="white-space:normal;margin-top:8px">Ohne Dividende in den letzten 12 Monaten (z. B. thesaurierende ETFs, Wachstumsaktien): ${ohne.map(z=>esc(z.name)).join(", ")}.</div>`:""}
      </div>
      <div class="sub" style="white-space:normal;margin-top:10px">So entstehen die Daten: Yahoo Finance liefert für jede Aktie die Ex-Tage und Beträge je Aktie der letzten 12 Monate. Daraus wird das nächste Jahr hochgerechnet (gleicher Termin, gleicher Betrag). „Bestätigt“ heißt, Yahoo meldet den kommenden Ex-Tag bereits. Am Ex-Tag wird die Dividende vom Kurs abgezogen. Wer die Aktie am Vortag besitzt, bekommt sie. Ausgezahlt wird meist 2–4 Wochen später. Alle Beträge in Euro vor Steuern, mit aktuellem Wechselkurs und deiner aktuellen Stückzahl.</div>`;
  }

  PLUS.VIEWS.datencheck = renderDatencheck;
  PLUS.VIEWS.dividenden = renderDividenden;
  return { chart, kursChart, txParse, txMerge, txImport, depotExtras, detailTech, syncStars, afterLoad };
})();
