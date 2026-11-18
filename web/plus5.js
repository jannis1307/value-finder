/* Value Finder – Erweiterungen 5: Fundamental-Charts (ähnlich Qualtrim) und Live-Aktualität. */
"use strict";
const PLUS5 = (() => {
  const P = PLUS.P;
  const nf = d => new Intl.NumberFormat("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d});
  const SYM = {USD:"$", EUR:"€", GBP:"£", GBp:"p", CHF:"CHF", DKK:"kr", SEK:"kr", NOK:"kr", JPY:"¥", HKD:"HK$", CAD:"C$", TWD:"NT$"};
  const gross = (x, cur) => { if(x==null || !isFinite(x)) return "–"; const a=Math.abs(x), s=SYM[cur]||cur||"";
    const t = a>=1e12 ? nf(2).format(x/1e12)+" Bio." : a>=1e9 ? nf(a>=1e11?0:1).format(x/1e9)+" Mrd." : a>=1e6 ? nf(a>=1e8?0:1).format(x/1e6)+" Mio." : nf(a>=100?0:2).format(x);
    return t+(s?" "+s:""); };
  const stk = x => x==null ? "–" : x>=1e9 ? nf(2).format(x/1e9)+" Mrd." : x>=1e6 ? nf(0).format(x/1e6)+" Mio." : nf(0).format(x);
  const pc = (x, d=1) => x==null || !isFinite(x) ? "–" : nf(d).format(x*100)+" %";
  const cache = {};

  const css = document.createElement("style");
  css.textContent = `
.fg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}@media(max-width:820px){.fg{grid-template-columns:repeat(2,1fr)}}
.fc{background:var(--soft);border-radius:12px;padding:8px 9px 6px;min-width:0}
.fc h4{margin:0;font-size:12.5px;display:flex;justify-content:space-between;gap:6px;align-items:baseline}
.fc h4 span{font-weight:700;font-size:11.5px;white-space:nowrap}.fc .fv{font-size:11.5px;color:var(--mut);min-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fc svg{display:block;width:100%;height:84px;margin-top:2px}.fc svg rect{cursor:pointer}.fc svg rect:hover{opacity:.75}
.fc .fx{display:flex;justify-content:space-between;font-size:10px;color:var(--mut)}
.fseg{display:inline-flex;gap:2px;background:var(--soft);border-radius:8px;padding:2px}.fseg a{padding:2px 8px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:var(--mut)}.fseg a.on{background:var(--card);color:var(--ink)}
.fleg{display:flex;gap:8px;font-size:10px;color:var(--mut);margin-top:1px}.fleg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:3px}
#vf-age{font-variant-numeric:tabular-nums}
.fc h4[data-fgo]{cursor:pointer}.fc h4 .ft{white-space:normal;font-weight:inherit;font-size:inherit;min-width:0}.fc h4 .fo{color:var(--mut);font-weight:400;font-size:12px;margin-left:3px}.fc .fx[data-fgo]{cursor:pointer}
.kc-gr{display:flex;justify-content:flex-end;margin-top:2px}.kc-gr a{font-size:12px;color:var(--mut);cursor:pointer;padding:6px 2px 2px}
#vf-gr{position:fixed;inset:0;z-index:70;display:none;background:rgba(10,14,20,.5);align-items:center;justify-content:center;padding:16px}
#vf-gr.open{display:flex}
#vf-gr .gp{background:var(--card);width:min(1040px,100%);max-height:100%;overflow:auto;border-radius:16px;padding:14px 16px 16px;box-shadow:0 12px 40px rgba(0,0,0,.3);-webkit-overflow-scrolling:touch}
@media(max-width:700px),(max-height:520px){#vf-gr{padding:0}#vf-gr .gp{border-radius:0;height:100%;max-height:none;padding:calc(10px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left))}}
.gk{display:flex;align-items:center;gap:6px}.gk h2{margin:0;font-size:17px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gk .iconbtn{margin:0;flex:none;width:36px;height:36px}
.gk2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}.gk2 select{font:inherit;font-size:14px;font-weight:600;padding:6px 8px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink);max-width:100%}
.gc{display:grid;grid-template-columns:auto 1fr;margin-top:12px}.gya{position:relative}.gya span{position:absolute;right:6px;transform:translateY(-50%);font-size:11px;color:var(--mut);white-space:nowrap}
.gca{position:relative;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:crosshair}.gca svg{display:block;width:100%}
.gca .gv{position:absolute;transform:translate(-50%,-100%);font-size:10.5px;font-weight:600;white-space:nowrap;pointer-events:none;padding-bottom:2px;display:none}.gca.mitw .gv{display:block}
.gca .ghl{position:absolute;top:0;bottom:0;background:var(--ink);opacity:.07;pointer-events:none;display:none;border-radius:4px}
.gca .gcur{position:absolute;top:0;bottom:0;width:1px;background:var(--mut);pointer-events:none;display:none}
.gca .gpt{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--acc);border:2px solid var(--card);transform:translate(-50%,-50%);display:none;pointer-events:none}
.gca .gtip{position:absolute;top:4px;display:none;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:12.5px;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap;z-index:3}
.gxl{position:relative;height:16px;font-size:11px;color:var(--mut);margin-top:3px}.gxl span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.gst{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin-top:14px}.gst div{background:var(--soft);border-radius:10px;padding:8px 10px;min-width:0}
.gst small{display:block;color:var(--mut);font-size:11px}.gst b{font-size:15px;white-space:nowrap}
.gtab{overflow-x:auto;margin-top:14px;-webkit-overflow-scrolling:touch}.gtab table{border-collapse:collapse;font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.gtab th,.gtab td{padding:5px 9px;text-align:right;border-bottom:1px solid var(--line)}.gtab th:first-child,.gtab td:first-child{text-align:left;position:sticky;left:0;background:var(--card);font-weight:600}
.gtab thead th{color:var(--mut);font-weight:600}`;
  document.head.appendChild(css);

  async function laden(t){
    if(cache[t]!==undefined) return cache[t];
    try{ const r = await fetch("f/"+t.replace(/[^A-Za-z0-9._-]/g,"_")+".json?d="+new Date().toISOString().slice(0,10)); cache[t] = r.ok ? await r.json() : null; }
    catch(e){ cache[t] = null; }
    return cache[t];
  }
  const cagr = (a, b, n) => (a>0 && b>0 && n>0) ? Math.pow(b/a, 1/n) - 1 : null;
  function wachstum(jahre, werte){
    const L = jahre.map((j,i)=>[j, werte[i]]).filter(x=>x[1]!=null);
    if(L.length < 2) return "";
    const [j0,v0] = L[0], [j1,v1] = L[L.length-1], g = cagr(v0, v1, j1-j0);
    return g==null ? "" : `<span class="${g>=0?"up":"down"}" title="Ø Wachstum pro Jahr ${j0}–${j1}">${g>=0?"+":""}${nf(1).format(g*100)} % p.a.</span>`;
  }
  /* Balken-Chart; reihen = [[werte, farbe, name], …] */
  function balken(id, titel, jahre, reihen, fmt, extra="", gi=null){
    const alle = reihen.flatMap(r=>r[0]).filter(v=>v!=null && isFinite(v));
    if(alle.length < 2) return "";
    const mx = Math.max(0, ...alle), mn = Math.min(0, ...alle), rng = (mx-mn) || 1, w = 300, h = 84, n = jahre.length, k = reihen.length;
    const bw = w/n, Y = v => 4 + (1-(v-mn)/rng)*(h-8), y0 = Y(0);
    let bars = "";
    jahre.forEach((j,i)=>reihen.forEach(([werte, farbe, name], r)=>{ const v = werte[i]; if(v==null) return;
      const x = i*bw + bw*0.12 + r*(bw*0.76/k), bwi = bw*0.76/k, y = Math.min(Y(v), y0), hh = Math.max(1, Math.abs(Y(v)-y0));
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bwi.toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${v<0?"var(--down)":farbe}" data-fv="${j}${name?" · "+name:""}: ${fmt(v)}"><title>${j}${name?" · "+name:""}: ${fmt(v)}</title></rect>`; }));
    const letzte = reihen[0][0].map((v,i)=>[jahre[i],v]).filter(x=>x[1]!=null).pop();
    const go = gi==null ? "" : ` data-fgo="${gi}" title="Groß anzeigen"`;
    return `<div class="fc" id="${id}"><h4${go}><span class="ft">${titel}${gi==null?"":`<i class="fo">⤢</i>`}</span>${extra || wachstum(jahre, reihen[0][0])}</h4><div class="fv">${letzte?`${letzte[0]}: ${fmt(letzte[1])}`:""}</div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${mn<0?`<line x1="0" x2="${w}" y1="${y0}" y2="${y0}" stroke="var(--line)"/>`:""}${bars}</svg>
      <div class="fx"${go}><span>${jahre[0]}</span><span>${jahre[n-1]}</span></div>
      ${k>1?`<div class="fleg">${reihen.map(r=>`<span><i style="background:${r[1]}"></i>${r[2]}</span>`).join("")}</div>`:""}</div>`;
  }
  function linie(id, titel, punkte, fmt, extra="", gi=null){
    const L = punkte.filter(p=>p[1]!=null && isFinite(p[1])); if(L.length < 3) return "";
    const vs = L.map(p=>p[1]), mx = Math.max(...vs), mn = Math.min(...vs), rng = (mx-mn)||1, w=300, h=84;
    const X = i => i/(L.length-1)*w, Y = v => 4+(1-(v-mn)/rng)*(h-8);
    const pts = L.map((p,i)=>`${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
    const sp = Math.max(1, Math.floor(L.length/40));
    const hits = L.map((p,i)=> i%sp ? "" : `<rect x="${(X(i)-w/L.length*sp/2).toFixed(1)}" y="0" width="${(w/L.length*sp).toFixed(1)}" height="${h}" fill="transparent" data-fv="${p[0]}: ${fmt(p[1])}"/>`).join("");
    const go = gi==null ? "" : ` data-fgo="${gi}" title="Groß anzeigen"`;
    return `<div class="fc" id="${id}"><h4${go}><span class="ft">${titel}${gi==null?"":`<i class="fo">⤢</i>`}</span>${extra}</h4><div class="fv">${L[L.length-1][0]}: ${fmt(L[L.length-1][1])}</div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="1.8" vector-effect="non-scaling-stroke"/>${hits}</svg>
      <div class="fx"${go}><span>${L[0][0].slice(0,4)}</span><span>${L[L.length-1][0].slice(0,4)}</span></div></div>`;
  }
  document.addEventListener("click", e=>{ const r = e.target.closest && e.target.closest("[data-fv]"); if(!r) return; const c = r.closest(".fc"); if(c) c.querySelector(".fv").textContent = r.dataset.fv; });
  document.addEventListener("pointermove", e=>{ if(e.pointerType==="touch") return; const r = e.target.closest && e.target.closest("[data-fv]"); if(!r) return; const c = r.closest(".fc"); if(c) c.querySelector(".fv").textContent = r.dataset.fv; });

  let spanne = 10, modus = "j";   // modus: "j" = Geschäftsjahre, "q" = Quartale
  const ok = v => v!=null && isFinite(v);
  const qLabel = e => { const d = new Date(e+"T12:00:00"); return "Q"+(Math.floor(d.getMonth()/3)+1)+"/"+String(d.getFullYear()).slice(2); };
  const hatQ = f => !!(f && f.quartale && (f.quartale.q||[]).length >= 4);
  /* Alle Charts einer Aktie als Beschreibung – daraus entstehen die kleinen Kacheln und die große Ansicht */
  function defs(f, cur){
    // Bilanzwerte in der Berichtswährung (z. B. Shell: Dollar), Kurse und Dividenden in der Kurswährung (Pence)
    const c = f.cur || cur, cF = f.fin_cur || (c==="GBp" ? "GBP" : c), G = v => gross(v, cF), E = v => v==null?"–":nf(2).format(v)+" "+(SYM[cF]||cF||""),
      Ek = v => v==null?"–":nf(2).format(v)+" "+(SYM[c]||c||"");
    const quart = modus==="q" && hatQ(f), lag = quart ? 4 : 1;
    const B = (id, titel, JV, serien, fmt, extra="", art="") => { const ab = spanne ? Math.max(0, JV.length - spanne*lag) : 0;
      const d = { typ:"b", id, titel, JV, J: JV.slice(ab), reihen: serien.map(([w,farbe,name])=>[(w||[]).slice(ab), farbe, name, w||[]]), fmt, extra, art, lag, quart };
      if(quart && !extra){ const W = d.reihen[0][3]; const li = W.map((v,i)=>ok(v)?i:null).filter(i=>i!=null).pop();   // Quartale: Wachstum zum Vorjahresquartal
        const a = li!=null && li>=4 ? W[li-4] : null, b = li!=null ? W[li] : null;
        d.extra = ok(a) && ok(b) && a>0 && b>0 ? `<span class="${b>=a?"up":"down"}" title="Letztes Quartal zum Vorjahresquartal">${b>=a?"+":""}${nf(1).format((b/a-1)*100)} % J/J</span>` : " "; }
      return d; };
    if(quart){   // gleiche Kennzahlen, aber je Quartal
      const Q = f.quartale, JQ = Q.q.map(qLabel);
      const aktQ = B("f7","Aktienanzahl", JQ, [[Q.aktien,"#8a9bb0"]], stk, "", "aktien");
      const kgvQ = (f.kgv||[]).map(p=>[p[0], p[1]!=null && p[1]>0 && p[1]<200 ? p[1] : null]);
      const Lq = (id, titel, pts, fmt, extra="", art="") => ({ typ:"l", id, titel, punkte: spanne ? pts.slice(-12*spanne) : pts, fmt, extra, art });
      const kgq = Lq("f12","KGV-Verlauf", kgvQ, v=>nf(1).format(v), "", "kgv"), kL = kgq.punkte.map(p=>p[1]).filter(ok).sort((x,y)=>x-y);
      kgq.median = kL.length ? kL[Math.floor(kL.length/2)] : null; kgq.extra = kgq.median ? `<span title="Median im Zeitraum">Ø ${nf(0).format(kgq.median)}</span>` : "";
      const DQ = [
        B("f1","Umsatz", JQ, [[Q.umsatz,"var(--acc)"]], G),
        B("f2","Nettogewinn", JQ, [[Q.gewinn,"#5b8def"]], G),
        B("f3","Gewinn je Aktie", JQ, [[Q.eps,"#5b8def"]], E),
        B("f4","Free Cashflow", JQ, [[Q.fcf,"#4fb06d"]], G),
        B("f5","Free Cashflow je Aktie", JQ, [[Q.fcf_ps,"#4fb06d"]], E),
        B("f6","Margen", JQ, [[Q.bm,"#9b7be0","brutto"],[Q.om,"#e8a33d","operativ"],[Q.nm,"#5b8def","netto"]], v=>pc(v), " ", "pct"),
        aktQ,
        B("f8","Dividende je Aktie", JQ, [[Q.dps,"#2bb3a3"]], Ek),
        B("f9","Ausschüttung in % des FCF", JQ, [[Q.payout_fcf,"#d977b4"]], v=>pc(v,0), " ", "pct"),
        B("f10","Schulden und Cash", JQ, [[Q.schulden,"#d0605e","Schulden"],[Q.cash,"#4fb06d","Cash"]], G, " "),
        B("f11","Aktienrückkäufe", JQ, [[Q.rueckkauf,"#c9a227"]], G),
        kgq,
        Lq("f13","Kurs", f.kurs||[], v=>nf(2).format(v)+" "+(SYM[c]||c||""), "", "kurs"),
      ];
      DQ.forEach(d=>{ if(d.typ==="b") d.enden = Q.q.slice(Q.q.length - d.JV.length + (d.JV.length - d.J.length)); });
      return DQ.filter(d => d.typ==="b" ? d.reihen.flatMap(r=>r[0]).filter(ok).length >= 2 : d.punkte.filter(p=>ok(p[1])).length >= 3);
    }
    const Lp = (id, titel, pts, fmt, extra="", art="") => ({ typ:"l", id, titel, punkte: spanne ? pts.slice(-12*spanne) : pts, fmt, extra, art });
    const aktien = B("f7","Aktienanzahl", f.jahre, [[f.aktien,"#8a9bb0"]], stk, "", "aktien"), A = aktien.reihen[0][0];
    const a0 = A.find(v=>v), a1 = [...A].reverse().find(v=>v);
    aktien.extra = a0 && a1 ? `<span class="${a1<=a0?"up":"down"}" title="Veränderung der Aktienanzahl">${a1<=a0?"−":"+"}${nf(1).format(Math.abs(a1/a0-1)*100)} %</span>` : "";
    const kgv = (f.kgv||[]).map(p=>[p[0], p[1]!=null && p[1]>0 && p[1]<200 ? p[1] : null]);
    const kg = Lp("f12","KGV-Verlauf", kgv, v=>nf(1).format(v), "", "kgv"), kgvL = kg.punkte.map(p=>p[1]).filter(ok).sort((x,y)=>x-y);
    const kgvM = kgvL.length ? kgvL[Math.floor(kgvL.length/2)] : null; kg.median = kgvM;
    kg.extra = kgvM ? `<span title="Median im Zeitraum">Ø ${nf(0).format(kgvM)}</span>` : "";
    const D = [
      B("f1","Umsatz", f.jahre, [[f.umsatz,"var(--acc)"]], G),
      B("f2","Nettogewinn", f.jahre, [[f.gewinn,"#5b8def"]], G),
      B("f3","Gewinn je Aktie", f.jahre, [[f.eps,"#5b8def"]], E),
      B("f4","Free Cashflow", f.jahre, [[f.fcf,"#4fb06d"]], G),
      B("f5","Free Cashflow je Aktie", f.jahre, [[f.fcf_ps,"#4fb06d"]], E),
      B("f6","Margen", f.jahre, [[f.bm,"#9b7be0","brutto"],[f.om,"#e8a33d","operativ"],[f.nm,"#5b8def","netto"]], v=>pc(v), " ", "pct"),
      aktien,
      B("f8","Dividende je Aktie", f.dps_jahre||[], [[f.dps_yf,"#2bb3a3"]], Ek),
      B("f9","Ausschüttung in % des FCF", f.jahre, [[f.payout_fcf,"#d977b4"]], v=>pc(v,0), " ", "pct"),
      B("f10","Schulden und Cash", f.jahre, [[f.schulden,"#d0605e","Schulden"],[f.cash,"#4fb06d","Cash"]], G, " "),
      B("f11","Aktienrückkäufe", f.jahre, [[f.rueckkauf,"#c9a227"]], G, " "),
      kg,
      Lp("f13","Kurs", f.kurs||[], v=>nf(2).format(v)+" "+(SYM[c]||c||""), "", "kurs"),
    ];
    return D.filter(d => d.typ==="b" ? d.reihen.flatMap(r=>r[0]).filter(ok).length >= 2 : d.punkte.filter(p=>ok(p[1])).length >= 3);
  }
  function raster(f, cur){
    return defs(f, cur).map((d,i) => d.typ==="b" ? balken(d.id, d.titel, d.J, d.reihen.map(r=>r.slice(0,3)), d.fmt, d.extra, i) : linie(d.id, d.titel, d.punkte, d.fmt, d.extra, i)).join("");
  }
  async function box(el, t, cur){
    el.innerHTML = `<div class="sub">Fundamentaldaten werden geladen …</div>`;
    const f = await laden(t);
    if(!f || f.leer){ el.innerHTML = `<div class="sub" style="white-space:normal">Für diese Aktie gibt es noch keine Fundamentaldaten. Sie werden nach und nach geladen (Depot und Merkliste zuerst), in spätestens einem Tag sind alle da.</div>`; return; }
    const draw = () => { el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span class="sub">Quelle: ${f.quelle==="SEC"?"Berichte bei der US-Börsenaufsicht SEC":"Yahoo Finance"} · ${modus==="q"&&hatQ(f)?`${qLabel(f.quartale.q[0])}–${qLabel(f.quartale.q.at(-1))}`:f.jahre.length?`${f.jahre[0]}–${f.jahre[f.jahre.length-1]}`:""}</span>
        <span style="display:inline-flex;gap:6px;flex-wrap:wrap">${hatQ(f)?`<span class="fseg">${[["j","Jahre"],["q","Quartale"]].map(([v,l])=>`<a data-md="${v}" class="${modus===v?"on":""}">${l}</a>`).join("")}</span>`:""}
        <span class="fseg">${[[5,"5 J."],[10,"10 J."],[0,"Alle"]].map(([v,l])=>`<a data-sp="${v}" class="${spanne===v?"on":""}">${l}</a>`).join("")}</span></span></div>
      <div class="fg">${raster(f, cur)}</div>
      <div class="sub" style="white-space:normal;margin-top:8px">Tippe auf einen Balken für den genauen Wert, auf den Titel (⤢) für die große Ansicht. ${modus==="q"&&hatQ(f)?"Prozentzahl = letztes Quartal zum gleichen Quartal im Vorjahr (J/J). Quartale nach Kalender des Periodenendes. "+(f.quelle==="SEC"?"Werte aus den Quartalsberichten (10-Q); das 4. Quartal ist Jahr minus die ersten drei.":"Yahoo liefert Quartalszahlen nur für etwa 1–2 Jahre."):`Grüne Prozentzahl = Ø Wachstum pro Jahr im gezeigten Zeitraum. Geschäftsjahre, die bis März enden, zählen zum Vorjahr. ${f.quelle==="SEC"?"Werte wie in den offiziellen Jahresberichten (10-K).":"Yahoo liefert Jahresabschlüsse nur für etwa 4–5 Jahre; Kurse und Dividenden reichen weiter zurück."}`}</div>`;
      el.querySelectorAll("[data-sp]").forEach(a=>a.onclick=()=>{ spanne=+a.dataset.sp; draw(); });
      el.querySelectorAll("[data-md]").forEach(a=>a.onclick=()=>{ modus=a.dataset.md; draw(); }); };
    el.dataset.froot = "1"; el._f = f; el._cur = cur; el._t = t; el._draw = draw;
    draw();
  }

  /* ---------- Große Ansicht (wie Qualtrim): jeden Chart vergrößern ---------- */
  // Fundamental-Kachel: auf den Titel (⤢) tippen · Kurs-Chart: „⤢ Vergrößern“. Pfeiltasten ← → wechseln den Chart, Esc schließt.
  let GR = null;   // {root, i} oder {kurs: ticker}
  function grEl(){
    let o = document.getElementById("vf-gr"); if(o) return o;
    o = document.createElement("div"); o.id = "vf-gr"; o.setAttribute("role","dialog"); o.setAttribute("aria-modal","true");
    o.innerHTML = `<div class="gp"></div>`; document.body.appendChild(o);
    o.addEventListener("click", e => { if(e.target === o) grZu(); });
    return o;
  }
  let bodyOv = "";
  function grAuf(){ const o = grEl(); if(!o.classList.contains("open")){ bodyOv = document.body.style.overflow; document.body.style.overflow = "hidden"; } o.classList.add("open"); }
  function grZu(){ const o = document.getElementById("vf-gr"); if(!o || !o.classList.contains("open")) return;
    o.classList.remove("open"); o.querySelector(".gp").innerHTML = ""; document.body.style.overflow = bodyOv;
    if(GR && GR.kurs && typeof PLUS2!=="undefined" && PLUS2.kursZeichnen) document.querySelectorAll(".kc:not([data-h])").forEach(b=>{ try{ PLUS2.kursZeichnen(b); }catch(e){} });
    GR = null; }
  const grHoehe = (anteil, max) => Math.round(Math.min(max, Math.max(200, window.innerHeight * anteil)));
  const nameVon = t => (typeof BY!=="undefined" && BY[t] && BY[t].n) || t;
  // schöne Achsen-Schritte
  function achse(mn, mx, ziel){ const r = (mx-mn) || Math.abs(mx) || 1, st = Math.pow(10, Math.floor(Math.log10(r/ziel)));
    const step = [1,2,2.5,5,10].map(m=>m*st).find(x=>r/x <= ziel+0.5) || st*10;
    return { step, lo: Math.floor(mn/step)*step, hi: Math.ceil(mx/step)*step }; }
  const kurzZahl = (v, art, fmt) => {   // Achsenbeschriftung kompakt
    if(art==="pct") return nf(0).format(v*100)+" %";
    const a = Math.abs(v); if(a>=1e12) return nf(a>=1e13?0:1).format(v/1e12)+" Bio."; if(a>=1e9) return nf(a>=1e10?0:1).format(v/1e9)+" Mrd."; if(a>=1e6) return nf(a>=1e7?0:1).format(v/1e6)+" Mio.";
    return nf(a>=100||Number.isInteger(v)?0:a>=10?1:2).format(v); };
  const aend = (a, b, art) => { if(!ok(a) || !ok(b)) return null;
    if(art==="pct") return Math.abs(b-a) < 0.0005 ? { t: "±0,0 Pp.", up: true } : { t: (b-a>=0?"+":"−")+nf(1).format(Math.abs(b-a)*100)+" Pp.", up: b>=a };
    if(!a) return null; const g = b/a - 1; if(a<0) return { t: b>a ? "verbessert" : "verschlechtert", up: b>a };
    return { t: (g>=0?"+":"−")+nf(1).format(Math.abs(g)*100)+" %", up: g>=0 }; };
  // weniger Aktien und weniger Schulden sind gut → Farbe umdrehen
  const gut = (x, d, name) => x && (d.art==="aktien" || name==="Schulden") ? Object.assign({}, x, {up: !x.up}) : x;
  const farbig = x => x ? `<span style="color:var(${x.up?"--up":"--down"})">${x.t}</span>` : "–";

  function grKennzahlen(d){
    if(d.reihen.length > 1){   // mehrere Reihen (Margen, Schulden/Cash): je Reihe letzter Wert und Veränderung zum Vorjahr
      return `<div class="gst">${d.reihen.map(([,farbe,name,W])=>{ const idx = W.map((v,i)=>ok(v)?i:null).filter(i=>i!=null); if(!idx.length) return "";
        const lag = d.lag||1, li = idx.at(-1), vj = li>=lag ? gut(aend(W[li-lag], W[li], d.art), d, name) : null;
        return `<div><small><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${farbe};margin-right:4px"></i>${esc(name)} ${d.JV[li]}</small><b>${d.fmt(W[li])}</b><small>${vj?farbig(vj)+(lag===4?" J/J":" zum Vorjahr"):"&nbsp;"}</small></div>`; }).join("")}</div>`; }
    const W = d.reihen[0][3], JV = d.JV, idx = W.map((v,i)=>ok(v)?i:null).filter(i=>i!=null); if(!idx.length) return "";
    const lag = d.lag||1, li = idx.at(-1), L = W[li], LJ = JV[li], kach = [[`${LJ}`, d.fmt(L)]];
    const vj = li>=lag ? gut(aend(W[li-lag], L, d.art), d) : null; kach.push([lag===4?"zum Vorjahresquartal":"zum Vorjahr", farbig(vj)]);
    if(lag===4 && !["pct","aktien"].includes(d.art) && d.id!=="f10" && li>=3 && W.slice(li-3, li+1).every(ok)) kach.push(["letzte 4 Quartale", d.fmt(W.slice(li-3, li+1).reduce((a,b)=>a+b,0))]);
    if(d.art==="pct"){ for(const n of [5,10]){ const v = W.slice(Math.max(0,li-n*lag+1), li+1).filter(ok); if(v.length>=Math.min(n*lag,3)) kach.push([`Ø ${n} Jahre`, d.fmt(v.reduce((a,b)=>a+b,0)/v.length)]); } }
    else for(const n of [3,5,10,15]){ const j0 = lag===4 ? li-4*n : JV.indexOf(LJ-n); if(j0<0 || !ok(W[j0])) continue; const g = cagr(W[j0], L, n);
      kach.push([`Ø pro Jahr, ${n} J.`, g==null ? "–" : farbig({t:(g>=0?"+":"−")+nf(1).format(Math.abs(g)*100)+" %", up: d.art==="aktien" ? g<=0 : g>=0})]); }
    return `<div class="gst">${kach.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join("")}</div>`;
  }
  function grTabelle(d){
    const J = d.J, kopf = `<tr><th></th>${J.map(j=>`<th>${j}</th>`).join("")}</tr>`;
    const zeilen = d.reihen.map(([w,farbe,name])=>`<tr><td><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${farbe};margin-right:5px"></i>${esc(name||d.titel)}</td>${w.map(v=>`<td>${ok(v)?d.fmt(v):"–"}</td>`).join("")}</tr>`).join("");
    const w0 = d.reihen[0][0], ab = d.JV.length - J.length, W = d.reihen[0][3];
    const lag = d.lag||1, vj = d.reihen.length > 1 ? "" : `<tr><td>${lag===4?"J/J":"zum Vorjahr"}</td>${w0.map((v,i)=>`<td>${farbig(gut(aend(W[ab+i-lag], v, d.art), d))}</td>`).join("")}</tr>`;
    return `<div class="gtab"><table><thead>${kopf}</thead><tbody>${zeilen}${vj}</tbody></table></div>`;
  }
  function grBalken(d){
    const J = d.J, n = J.length, k = d.reihen.length, H = grHoehe(0.42, 400);
    const alle = d.reihen.flatMap(r=>r[0]).filter(ok), ax = achse(Math.min(0,...alle), Math.max(0,...alle), 5);
    const W = 1000, Y = v => (1-(v-ax.lo)/(ax.hi-ax.lo))*H, Yp = v => (1-(v-ax.lo)/(ax.hi-ax.lo))*100, y0 = Y(0);
    let grid = "", lab = "", bars = "", werte = "";
    for(let v=ax.lo; v<=ax.hi+ax.step/2; v+=ax.step){ grid += `<line x1="0" x2="${W}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" vector-effect="non-scaling-stroke"${Math.abs(v)<ax.step/1e6?' stroke-width="1.5"':""}/>`;
      lab += `<span style="top:${Yp(v)}%">${kurzZahl(Math.abs(v)<ax.step/1e6?0:v, d.art)}</span>`; }
    const bw = W/n;
    J.forEach((j,i)=>d.reihen.forEach(([w,farbe],r)=>{ const v = w[i]; if(!ok(v)) return;
      const x = i*bw + bw*0.14 + r*(bw*0.72/k), wi = bw*0.72/k, y = Math.min(Y(v), y0), hh = Math.max(1, Math.abs(Y(v)-y0));
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${wi.toFixed(1)}" height="${hh.toFixed(1)}" rx="3" fill="${v<0?"var(--down)":farbe}"/>`;
      if(k===1) werte += `<span class="gv" style="left:${((i+0.5)/n*100).toFixed(2)}%;top:${(Math.min(Y(v),y0)/H*100).toFixed(2)}%">${kurzZahl(v, d.art)}</span>`; }));
    const lw = Math.max(...lab.match(/>[^<]*</g).map(x=>x.length-2)) * 6.4 + 10;
    const xl = J.map((j,i)=>`<span style="left:${((i+0.5)/n*100).toFixed(2)}%" data-xi="${i}">${j}</span>`).join("");
    return `<div class="gc"><div class="gya" style="width:${Math.round(lw)}px;height:${H}px">${lab}</div>
      <div class="gca" data-gn="${n}" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" height="${H}" preserveAspectRatio="none">${grid}${bars}</svg>${werte}<div class="ghl"></div><div class="gtip"></div></div>
      <div></div><div class="gxl">${xl}</div></div>
      ${k>1?`<div class="fleg" style="font-size:12px;margin-top:6px;gap:12px">${d.reihen.map(r=>`<span><i style="background:${r[1]};width:10px;height:10px"></i>${r[2]}</span>`).join("")}</div>`:""}`;
  }
  function grLinie(d){
    const L = d.punkte.filter(p=>ok(p[1])), n = L.length, H = grHoehe(0.42, 400), vs = L.map(p=>p[1]);
    const ax = achse(Math.min(...vs), Math.max(...vs), 5), W = 1000;
    const X = i => i/(n-1)*W, Y = v => (1-(v-ax.lo)/(ax.hi-ax.lo))*H, Yp = v => (1-(v-ax.lo)/(ax.hi-ax.lo))*100;
    let grid = "", lab = "";
    for(let v=ax.lo; v<=ax.hi+ax.step/2; v+=ax.step){ grid += `<line x1="0" x2="${W}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" vector-effect="non-scaling-stroke"/>`; lab += `<span style="top:${Yp(v)}%">${kurzZahl(v)}</span>`; }
    if(d.median) grid += `<line x1="0" x2="${W}" y1="${Y(d.median).toFixed(1)}" y2="${Y(d.median).toFixed(1)}" stroke="var(--warn)" stroke-width="1.4" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>`;
    const pts = L.map((p,i)=>`${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
    const jahre = [...new Set(L.map(p=>p[0].slice(0,4)))], sch = Math.max(1, Math.ceil(jahre.length/8));
    const xl = L.map((p,i)=>[p,i]).filter(([p,i])=> i===0 || p[0].slice(0,4)!==L[i-1][0].slice(0,4)).filter((_,q)=>q%sch===0)
      .map(([p,i])=>`<span style="left:${(i/(n-1)*100).toFixed(2)}%">${p[0].slice(0,4)}</span>`).join("");
    const lw = Math.max(...lab.match(/>[^<]*</g).map(x=>x.length-2)) * 6.4 + 10;
    return `<div class="gc"><div class="gya" style="width:${Math.round(lw)}px;height:${H}px">${lab}</div>
      <div class="gca" data-gl="${n}" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" height="${H}" preserveAspectRatio="none" style="overflow:visible">${grid}
        <polygon points="0,${H} ${pts} ${W},${H}" fill="var(--acc)" opacity=".1"/><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
        <div class="gcur"></div><div class="gpt"></div><div class="gtip"></div></div><div></div><div class="gxl">${xl}</div></div>
      ${d.median?`<div class="fleg" style="font-size:12px;margin-top:6px"><span><i style="background:var(--warn)"></i>Median ${nf(1).format(d.median)}</span></div>`:""}`;
  }
  function grLinieKz(d){
    const L = d.punkte.filter(p=>ok(p[1])), v = L.map(p=>p[1]), a = L[0], z = L.at(-1), mon = x => { const [y,m] = x.split("-"); return new Date(+y, +m-1, 15).toLocaleDateString("de-DE",{month:"short",year:"numeric"}); };
    const k = [[`Zuletzt (${mon(z[0])})`, d.fmt(z[1])], ["Tief", d.fmt(Math.min(...v))], ["Hoch", d.fmt(Math.max(...v))]];
    if(d.art==="kgv" && d.median) k.splice(1, 0, ["Median", d.fmt(d.median)]);
    if(d.art==="kurs"){ const jr = (new Date(z[0]+"-15") - new Date(a[0]+"-15"))/31557600000; k.splice(1, 0, [`seit ${mon(a[0])}`, farbig(aend(a[1], z[1]))]);
      const g = jr>=1 ? cagr(a[1], z[1], jr) : null; if(g!=null) k.splice(2, 0, ["Ø pro Jahr", farbig({t:(g>=0?"+":"−")+nf(1).format(Math.abs(g)*100)+" %", up:g>=0})]); }
    return `<div class="gst">${k.map(([x,y])=>`<div><small>${x}</small><b>${y}</b></div>`).join("")}</div>`;
  }
  // Hover / Tippen in der großen Ansicht
  function grHover(gca, d, clientX){
    const R = gca.getBoundingClientRect(), fx = Math.min(1, Math.max(0, (clientX-R.left)/R.width)), tip = gca.querySelector(".gtip");
    let html, px;
    if(d.typ==="b"){ const n = d.J.length, i = Math.min(n-1, Math.floor(fx*n)), hl = gca.querySelector(".ghl"), ab = d.JV.length - n, lag = d.lag||1;
      hl.style.left = (i/n*100)+"%"; hl.style.width = (100/n)+"%"; hl.style.display = "";
      const ende = d.enden && d.enden[i] ? ` <span style="color:var(--mut);font-weight:400">· bis ${new Date(d.enden[i]+"T12:00:00").toLocaleDateString("de-DE")}</span>` : "";
      html = `<b>${d.J[i]}</b>${ende}` + d.reihen.map(([w,farbe,name,WV])=>{ const v = w[i], vj = gut(aend(WV[ab+i-lag], v, d.art), d, name);
        return `<br><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${farbe};margin-right:5px"></i>${esc(name||d.titel)}: <b>${ok(v)?d.fmt(v):"–"}</b>${vj?` <span style="font-size:11.5px">(${farbig(vj)} ${lag===4?"J/J":"zum Vorjahr"})</span>`:""}`; }).join("");
      px = (i+0.5)/n*R.width; }
    else { const L = d.punkte.filter(p=>ok(p[1])), n = L.length, i = Math.round(fx*(n-1)), p = L[i], vs = L.map(q=>q[1]);
      const ax = achse(Math.min(...vs), Math.max(...vs), 5), yp = (1-(p[1]-ax.lo)/(ax.hi-ax.lo))*100;
      const c = gca.querySelector(".gcur"), pt = gca.querySelector(".gpt"); px = i/(n-1)*R.width;
      c.style.left = px+"px"; c.style.display = ""; pt.style.left = px+"px"; pt.style.top = yp+"%"; pt.style.display = "";
      const [y,m] = p[0].split("-"), mt = new Date(+y, +m-1, 15).toLocaleDateString("de-DE",{month:"long",year:"numeric"});
      html = `<b>${mt}</b><br>${esc(d.titel==="KGV-Verlauf"?"KGV":d.titel)}: <b>${d.fmt(p[1])}</b>` + (d.art==="kurs" && i>0 ? `<br><span style="color:var(--mut)">seit ${esc(L[0][0].slice(0,4))}: ${(aend(L[0][1], p[1])||{t:"–"}).t}</span>` : "")
        + (d.art==="kurs" && i<n-1 ? `<br><span style="color:var(--mut)">bis heute: ${(aend(p[1], L[n-1][1])||{t:"–"}).t}</span>` : ""); }
    tip.innerHTML = html; tip.style.display = "";
    const tw = tip.offsetWidth; tip.style.left = (px > R.width/2 ? Math.max(0, px - tw - 12) : Math.min(R.width - tw, px + 12)) + "px";
  }
  function grHoverAus(gca){ gca.querySelectorAll(".gtip,.ghl,.gcur,.gpt").forEach(x=>x.style.display="none"); }

  function grFundZeichnen(){
    const o = grEl(), gp = o.querySelector(".gp"), root = GR.root;
    if(!root.isConnected && !root._f){ grZu(); return; }
    const D = defs(root._f, root._cur); if(!D.length){ grZu(); return; }
    GR.i = (GR.i + D.length) % D.length; const d = D[GR.i];
    gp.innerHTML = `<div class="gk"><h2>${esc(nameVon(root._t))} <span class="sub">· ${esc(root._t)}</span></h2>
        <button class="iconbtn" data-gnav="-1" aria-label="Vorheriger Chart">‹</button><button class="iconbtn" data-gnav="1" aria-label="Nächster Chart">›</button><button class="iconbtn x" data-gzu aria-label="Schließen">✕</button></div>
      <div class="gk2"><select data-gsel aria-label="Kennzahl">${D.map((x,i)=>`<option value="${i}"${i===GR.i?" selected":""}>${x.titel}</option>`).join("")}</select>
        ${hatQ(root._f)?`<span class="fseg">${[["j","Jahre"],["q","Quartale"]].map(([v,l])=>`<a data-gmd="${v}" class="${modus===v?"on":""}">${l}</a>`).join("")}</span>`:""}
        <span class="fseg">${[[5,"5 J."],[10,"10 J."],[0,"Alle"]].map(([v,l])=>`<a data-gsp="${v}" class="${spanne===v?"on":""}">${l}</a>`).join("")}</span>
        <span style="margin-left:auto">${d.typ==="b" ? (d.extra || wachstum(d.J, d.reihen[0][0])) : ""}</span></div>
      ${d.typ==="b" ? grBalken(d) + grKennzahlen(d) + grTabelle(d) : grLinie(d) + grLinieKz(d)}
      <div class="sub" style="white-space:normal;margin-top:10px">${d.typ==="b"?"Fahre über die Balken oder tippe darauf für den genauen Wert und die Veränderung zum Vorjahr. ":"Fahre über die Linie oder tippe darauf für den genauen Wert. "}Quelle: ${root._f.quelle==="SEC"?"Jahresberichte (10-K) bei der SEC":"Yahoo Finance"}. Mit ← → wechselst du die Kennzahl.</div>`;
    const gca = gp.querySelector(".gca");
    if(gca){ if(d.typ==="b") gca.classList.toggle("mitw", gca.offsetWidth / d.J.length >= 44);
      const xl = gp.querySelectorAll(".gxl [data-xi]"); if(xl.length){ const sch = Math.ceil(xl.length / Math.max(1, Math.floor(gca.offsetWidth/40))); xl.forEach((x,i)=>{ if((xl.length-1-i) % sch) x.style.visibility = "hidden"; }); } }
  }
  function grFund(root, i){ GR = { root, i }; grAuf(); grFundZeichnen(); }
  function grKurs(t){
    const s = (DATA.stocks||[]).find(x=>x.t===t); if(!s || typeof PLUS2==="undefined") return;
    GR = { kurs: t }; grAuf();
    grEl().querySelector(".gp").innerHTML = `<div class="gk"><h2>${esc(s.n)} <span class="sub">· ${esc(s.t)} · ${F.cur(s.p, s.cur)}</span></h2><button class="iconbtn x" data-gzu aria-label="Schließen">✕</button></div>
      <div style="margin-top:10px">${PLUS2.kursChart(s, grHoehe(0.55, 560))}</div>
      <div class="sub" style="white-space:normal;margin-top:8px">Fahre über den Chart oder tippe darauf für Kurs und Datum. Tipp: Handy quer halten für einen noch breiteren Chart.</div>`;
  }
  document.addEventListener("click", e => {
    if(!e.target.closest) return;
    const go = e.target.closest("[data-fgo]"); if(go){ const root = go.closest("[data-froot]"); if(root){ e.preventDefault(); grFund(root, +go.dataset.fgo); } return; }
    const kg = e.target.closest("[data-kgross]"); if(kg){ e.preventDefault(); grKurs(kg.dataset.kgross); return; }
    const o = document.getElementById("vf-gr"); if(!o || !o.contains(e.target)) return;
    if(e.target.closest("[data-gzu]")) return grZu();
    const nv = e.target.closest("[data-gnav]"); if(nv && GR && GR.root){ GR.i += +nv.dataset.gnav; grFundZeichnen(); return; }
    const sp = e.target.closest("[data-gsp]"); if(sp && GR && GR.root){ spanne = +sp.dataset.gsp; grFundZeichnen(); if(GR.root._draw && GR.root.isConnected) GR.root._draw(); }
    const md = e.target.closest("[data-gmd]"); if(md && GR && GR.root){ modus = md.dataset.gmd; grFundZeichnen(); if(GR.root._draw && GR.root.isConnected) GR.root._draw(); }
  });
  document.addEventListener("change", e => { const sl = e.target.closest && e.target.closest("[data-gsel]"); if(sl && GR && GR.root){ GR.i = +sl.value; grFundZeichnen(); } });
  const grD = () => { if(!GR || !GR.root) return null; const D = defs(GR.root._f, GR.root._cur); return D[GR.i]; };
  const grVon = e => e.target.closest && e.target.closest("#vf-gr .gca");
  document.addEventListener("pointermove", e => { const g = grVon(e), d = g && grD(); if(g && d) grHover(g, d, e.clientX); else document.querySelectorAll("#vf-gr .gca").forEach(grHoverAus); });
  document.addEventListener("pointerdown", e => { const g = grVon(e), d = g && grD(); if(g && d) grHover(g, d, e.clientX); });
  document.addEventListener("touchmove", e => { const g = grVon(e), d = g && grD(); if(g && d) grHover(g, d, e.touches[0].clientX); }, {passive:true});
  window.addEventListener("keydown", e => {
    const o = document.getElementById("vf-gr"); if(!o || !o.classList.contains("open")) return;
    if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); grZu(); }
    else if((e.key === "ArrowRight" || e.key === "ArrowLeft") && GR && GR.root && !(e.target && e.target.tagName==="SELECT")){ e.preventDefault(); e.stopPropagation(); GR.i += e.key==="ArrowRight" ? 1 : -1; grFundZeichnen(); }
  }, true);
  let grRz = 0; window.addEventListener("resize", () => { clearTimeout(grRz); grRz = setTimeout(() => { if(GR && GR.root && document.getElementById("vf-gr").classList.contains("open")) grFundZeichnen(); }, 200); });
  window.addEventListener("hashchange", grZu);

  /* ---------- Im Aktien-Detail ---------- */
  const detail4 = PLUS3.detail, bind4 = PLUS3.bind;
  PLUS3.detail = s => `<div class="box"><h3>📊 Fundamentaldaten</h3><div id="fund-${esc(s.t).replace(/[^A-Za-z0-9_-]/g,"_")}"></div></div>` + detail4(s);
  PLUS3.bind = s => { bind4(s); const el = document.getElementById("fund-"+s.t.replace(/[^A-Za-z0-9_-]/g,"_")); if(el) box(el, s.t, s.cur); };

  /* ---------- Eigene Ansicht: Fundamental-Charts ---------- */
  function renderFundamental(){
    const mine = [...new Set([...(P.depot?.positionen||[]).filter(z=>z.t && (z.art||"EQUITY")==="EQUITY").map(z=>z.t), ...stars])].filter(t=>BY[t]);
    const akt = store.get("fund_t", mine[0] || "AAPL");
    $("#main").innerHTML = `<div class="filters"><input type="search" id="fq" list="fql" placeholder="Aktie suchen: Name oder Ticker" style="flex:1;min-width:200px">
      <datalist id="fql">${DATA.stocks.map(s=>`<option value="${esc(s.t)}">${esc(s.n)}</option>`).join("")}</datalist></div>
      ${mine.length?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">${mine.slice(0,20).map(t=>`<button class="btn ${t===akt?"":"ghost"}" data-ft="${esc(t)}" style="padding:4px 10px;font-size:12.5px">${esc(BY[t].n.split(/[ ,]/)[0])}</button>`).join("")}</div>`:""}
      <div class="box"><h3 id="fh"></h3><div id="fbox"></div></div>`;
    const zeig = t => { const s = BY[t]; if(!s) return toastF("Aktie nicht gefunden."); store.set("fund_t", t);
      $("#fh").innerHTML = `${esc(s.n)} <span class="sub">· ${esc(t)} · ${F.cur(s.p,s.cur)}</span>`; box($("#fbox"), t, s.cur);
      document.querySelectorAll("[data-ft]").forEach(b=>b.className = "btn "+(b.dataset.ft===t?"":"ghost")); };
    $("#fq").addEventListener("change", e=>{ const v=e.target.value.trim(); const s = BY[v.toUpperCase()] || BY[v] || DATA.stocks.find(x=>x.n.toLowerCase().includes(v.toLowerCase())); if(s){ zeig(s.t); e.target.value=""; } });
    document.querySelectorAll("[data-ft]").forEach(b=>b.onclick=()=>zeig(b.dataset.ft));
    zeig(BY[akt] ? akt : DATA.stocks[0].t);
  }
  function toastF(m){ let t=document.getElementById("vf-toast"); if(!t){ t=document.createElement("div"); t.id="vf-toast"; document.body.appendChild(t); } t.textContent=m; t.className="show"; clearTimeout(t._h); t._h=setTimeout(()=>t.className="",3000); }

  const mehr4 = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehr4(); const first = $("#main").querySelector(".list");
    if(first) first.insertAdjacentHTML("afterbegin", `<a class="row" href="#fundamental" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">📊 Fundamental-Charts</div><div class="sub">Umsatz, Gewinn, Cashflow, Margen, Dividende über bis zu 15 Jahre (wie Qualtrim)</div></div><span class="sub">›</span></a>`); };
  PLUS.VIEWS.fundamental = renderFundamental;
  PLUS3.MEHR.push("fundamental");

  /* ---------- Immer aktuell: alle 30 Sekunden prüfen, ob es einen neuen Stand gibt ---------- */
  async function pruefen(){
    if(document.hidden || typeof DATA==="undefined" || !DATA) return;
    // Nicht neu zeichnen, während du etwas eintippst oder ein Formular offen hast
    const ae = document.activeElement;
    if((ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.type!=="search") || ["steuer","umschichten","push","kosten","sparplaene","tagebuch","rente","schneeball","steuerrechner","sparziel","wrapped","freistellung","sicherheit","kaufvorschlag","einstellungen","geraet"].includes(view())){ alter(); return; }
    try{ const r = await fetch("stand.json?ts="+Date.now(), {cache:"no-store"}); if(!r.ok) return; const j = await r.json();
      if(j.stand && j.stand !== DATA.stand){ await load(); if(P.key) PLUS.loadDepot(true); } }catch(e){}
    alter();
  }
  function alter(){
    if(typeof DATA==="undefined" || !DATA) return; const el = $("#stand"); if(!el) return;
    const min = Math.max(0, Math.round((Date.now()-new Date(DATA.stand))/60000));
    el.innerHTML = `Stand ${F.dt(DATA.stand)} <span id="vf-age" style="${min>15?"color:var(--warn)":""}">(${min<1?"gerade eben":"vor "+min+" Min."})</span> · ${DATA.anzahl} Aktien`;
  }
  setInterval(pruefen, 30e3);
  setInterval(alter, 15e3);
  setTimeout(alter, 3000);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) pruefen(); });
  window.addEventListener("focus", pruefen);
  return { laden, grFund, grKurs, grZu };
})();
