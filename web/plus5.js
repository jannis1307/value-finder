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
#vf-age{font-variant-numeric:tabular-nums}`;
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
  function balken(id, titel, jahre, reihen, fmt, extra=""){
    const alle = reihen.flatMap(r=>r[0]).filter(v=>v!=null && isFinite(v));
    if(alle.length < 2) return "";
    const mx = Math.max(0, ...alle), mn = Math.min(0, ...alle), rng = (mx-mn) || 1, w = 300, h = 84, n = jahre.length, k = reihen.length;
    const bw = w/n, Y = v => 4 + (1-(v-mn)/rng)*(h-8), y0 = Y(0);
    let bars = "";
    jahre.forEach((j,i)=>reihen.forEach(([werte, farbe, name], r)=>{ const v = werte[i]; if(v==null) return;
      const x = i*bw + bw*0.12 + r*(bw*0.76/k), bwi = bw*0.76/k, y = Math.min(Y(v), y0), hh = Math.max(1, Math.abs(Y(v)-y0));
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bwi.toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${v<0?"var(--down)":farbe}" data-fv="${j}${name?" · "+name:""}: ${fmt(v)}"><title>${j}${name?" · "+name:""}: ${fmt(v)}</title></rect>`; }));
    const letzte = reihen[0][0].map((v,i)=>[jahre[i],v]).filter(x=>x[1]!=null).pop();
    return `<div class="fc" id="${id}"><h4>${titel}${extra || wachstum(jahre, reihen[0][0])}</h4><div class="fv">${letzte?`${letzte[0]}: ${fmt(letzte[1])}`:""}</div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${mn<0?`<line x1="0" x2="${w}" y1="${y0}" y2="${y0}" stroke="var(--line)"/>`:""}${bars}</svg>
      <div class="fx"><span>${jahre[0]}</span><span>${jahre[n-1]}</span></div>
      ${k>1?`<div class="fleg">${reihen.map(r=>`<span><i style="background:${r[1]}"></i>${r[2]}</span>`).join("")}</div>`:""}</div>`;
  }
  function linie(id, titel, punkte, fmt, extra=""){
    const L = punkte.filter(p=>p[1]!=null && isFinite(p[1])); if(L.length < 3) return "";
    const vs = L.map(p=>p[1]), mx = Math.max(...vs), mn = Math.min(...vs), rng = (mx-mn)||1, w=300, h=84;
    const X = i => i/(L.length-1)*w, Y = v => 4+(1-(v-mn)/rng)*(h-8);
    const pts = L.map((p,i)=>`${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
    const sp = Math.max(1, Math.floor(L.length/40));
    const hits = L.map((p,i)=> i%sp ? "" : `<rect x="${(X(i)-w/L.length*sp/2).toFixed(1)}" y="0" width="${(w/L.length*sp).toFixed(1)}" height="${h}" fill="transparent" data-fv="${p[0]}: ${fmt(p[1])}"/>`).join("");
    return `<div class="fc" id="${id}"><h4>${titel}${extra}</h4><div class="fv">${L[L.length-1][0]}: ${fmt(L[L.length-1][1])}</div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="1.8" vector-effect="non-scaling-stroke"/>${hits}</svg>
      <div class="fx"><span>${L[0][0].slice(0,4)}</span><span>${L[L.length-1][0].slice(0,4)}</span></div></div>`;
  }
  document.addEventListener("click", e=>{ const r = e.target.closest && e.target.closest("[data-fv]"); if(!r) return; const c = r.closest(".fc"); if(c) c.querySelector(".fv").textContent = r.dataset.fv; });
  document.addEventListener("pointermove", e=>{ if(e.pointerType==="touch") return; const r = e.target.closest && e.target.closest("[data-fv]"); if(!r) return; const c = r.closest(".fc"); if(c) c.querySelector(".fv").textContent = r.dataset.fv; });

  let spanne = 10;
  function raster(f, cur){
    const ab = spanne ? Math.max(0, f.jahre.length - spanne) : 0;
    const J = f.jahre.slice(ab), s = k => (f[k]||[]).slice(ab);
    const c = f.cur || cur, G = v => gross(v, c), E = v => v==null?"–":nf(2).format(v)+" "+(SYM[c]||c||"");
    const dJ = (f.dps_jahre||[]).slice(spanne ? Math.max(0,(f.dps_jahre||[]).length-spanne) : 0), dV = (f.dps_yf||[]).slice(spanne ? Math.max(0,(f.dps_yf||[]).length-spanne) : 0);
    const kurs = spanne ? (f.kurs||[]).slice(-12*spanne) : (f.kurs||[]), kgv = spanne ? (f.kgv||[]).slice(-12*spanne) : (f.kgv||[]);
    const aktien = s("aktien"), a0 = aktien.find(v=>v), a1 = [...aktien].reverse().find(v=>v);
    const rk = a0 && a1 ? `<span class="${a1<=a0?"up":"down"}" title="Veränderung der Aktienanzahl">${a1<=a0?"−":"+"}${nf(1).format(Math.abs(a1/a0-1)*100)} %</span>` : "";
    const kgvL = kgv.filter(p=>p[1]!=null && p[1]>0 && p[1]<200).map(p=>p[1]), kgvM = kgvL.length ? kgvL.slice().sort((a,b)=>a-b)[Math.floor(kgvL.length/2)] : null;
    return [
      balken("f1","Umsatz", J, [[s("umsatz"),"var(--acc)"]], G),
      balken("f2","Nettogewinn", J, [[s("gewinn"),"#5b8def"]], G),
      balken("f3","Gewinn je Aktie", J, [[s("eps"),"#5b8def"]], E),
      balken("f4","Free Cashflow", J, [[s("fcf"),"#4fb06d"]], G),
      balken("f5","Free Cashflow je Aktie", J, [[s("fcf_ps"),"#4fb06d"]], E),
      balken("f6","Margen", J, [[s("bm"),"#9b7be0","brutto"],[s("om"),"#e8a33d","operativ"],[s("nm"),"#5b8def","netto"]], v=>pc(v), " "),
      balken("f7","Aktienanzahl", J, [[aktien,"#8a9bb0"]], stk, rk),
      balken("f8","Dividende je Aktie", dJ, [[dV,"#2bb3a3"]], E),
      balken("f9","Ausschüttung in % des FCF", J, [[s("payout_fcf"),"#d977b4"]], v=>pc(v,0), " "),
      balken("f10","Schulden und Cash", J, [[s("schulden"),"#d0605e","Schulden"],[s("cash"),"#4fb06d","Cash"]], G, " "),
      balken("f11","Aktienrückkäufe", J, [[s("rueckkauf"),"#c9a227"]], G, " "),
      linie("f12","KGV-Verlauf", kgv.map(p=>[p[0], p[1]!=null && p[1]>0 && p[1]<200 ? p[1] : null]), v=>nf(1).format(v), kgvM?`<span title="Median im Zeitraum">Ø ${nf(0).format(kgvM)}</span>`:""),
      linie("f13","Kurs", kurs, v=>nf(2).format(v), ""),
    ].join("");
  }
  async function box(el, t, cur){
    el.innerHTML = `<div class="sub">Fundamentaldaten werden geladen …</div>`;
    const f = await laden(t);
    if(!f || f.leer){ el.innerHTML = `<div class="sub" style="white-space:normal">Für diese Aktie gibt es noch keine Fundamentaldaten. Sie werden nach und nach geladen (Depot und Merkliste zuerst), in spätestens einem Tag sind alle da.</div>`; return; }
    const draw = () => { el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span class="sub">Quelle: ${f.quelle==="SEC"?"Jahresberichte bei der US-Börsenaufsicht SEC":"Yahoo Finance"} · ${f.jahre.length?`${f.jahre[0]}–${f.jahre[f.jahre.length-1]}`:""}</span>
        <span class="fseg">${[[5,"5 J."],[10,"10 J."],[0,"Alle"]].map(([v,l])=>`<a data-sp="${v}" class="${spanne===v?"on":""}">${l}</a>`).join("")}</span></div>
      <div class="fg">${raster(f, cur)}</div>
      <div class="sub" style="white-space:normal;margin-top:8px">Tippe auf einen Balken für den genauen Wert. Grüne Prozentzahl = Ø Wachstum pro Jahr im gezeigten Zeitraum. Geschäftsjahre, die bis März enden, zählen zum Vorjahr. ${f.quelle==="SEC"?"Werte wie in den offiziellen Jahresberichten (10-K).":"Yahoo liefert Jahresabschlüsse nur für etwa 4–5 Jahre; Kurse und Dividenden reichen weiter zurück."}</div>`;
      el.querySelectorAll("[data-sp]").forEach(a=>a.onclick=()=>{ spanne=+a.dataset.sp; draw(); }); };
    draw();
  }

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
    if((ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.type!=="search") || ["steuer","umschichten","push","kosten","sparplaene","tagebuch","rente","schneeball","steuerrechner","sparziel","wrapped","freistellung"].includes(view())){ alter(); return; }
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
  return { laden };
})();
