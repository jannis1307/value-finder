/* Value Finder – Erweiterungen 6: Auswertungen aus deinen echten Transaktionen
   (Gebühren-Check, Freistellungsaufträge, Kaufzeitpunkte, Dividenden-Wachstum, Verkaufs-Rückblick,
   Crash-Test, Steuer vor Verkauf, Depot Wrapped, Sparziel) + diskrete Push-Nachrichten. */
"use strict";
const PLUS6 = (() => {
  const P = PLUS.P;
  const nf = d => new Intl.NumberFormat("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d});
  const E = (x, d=0) => x==null || !isFinite(x) ? "–" : nf(d).format(+(+x).toFixed(d) || 0)+" €";
  const Es = (x, d=0) => { if(x==null || !isFinite(x)) return "–"; const r = +x.toFixed(d) || 0; return (r>0?"+":"")+E(r,d); };
  const Pc = (x, d=0, sign=false) => x==null || !isFinite(x) ? "–" : (sign && x>0?"+":"")+nf(d).format(x*100)+" %";
  const cls = x => x>0 ? "up" : x<0 ? "down" : "";
  const toNum = v => { if(v==null) return null; let s=String(v).trim().replace(/[€$\s%]/g,""); if(!s) return null;
    if(s.includes(",") && s.includes(".")) s = s.lastIndexOf(",")>s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
    else if(s.includes(",")) s = s.replace(",","."); const n=parseFloat(s); return isNaN(n)?null:n; };
  const dk = s => s ? new Date(s+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "";
  const MON = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  const jahr = String(new Date().getFullYear());
  const heuteLokal = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };

  const css = document.createElement("style");
  css.textContent = `
.p6bars{display:flex;align-items:flex-end;gap:3px;height:120px;margin-top:8px}
.p6bars div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0;height:100%}
.p6bars i{display:block;width:100%;background:var(--acc);border-radius:4px 4px 0 0;min-height:1px}
.p6bars i.neg{background:var(--down)}.p6bars i.soft{background:var(--acc-soft)}
.p6bars span{font-size:9.5px;color:var(--mut);margin-top:3px;white-space:nowrap}
.p6bars b{font-size:9.5px;font-weight:600;color:var(--mut);margin-bottom:2px;white-space:nowrap}
.p6big{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}@media(max-width:700px){.p6big{grid-template-columns:1fr 1fr}}
.p6big>div{background:var(--soft);border-radius:12px;padding:10px}.p6big .v{font-size:20px;font-weight:700;margin-top:2px}
.p6wrap{background:linear-gradient(135deg,#0e9f8a,#1b4f8f);color:#fff;border-radius:18px;padding:18px;margin-top:12px}
.p6wrap .sub{color:rgba(255,255,255,.8)}.p6wrap .hv{font-size:34px;font-weight:800;line-height:1.1;margin:4px 0}
.p6wrap .g{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.p6wrap .g>div{background:rgba(255,255,255,.12);border-radius:12px;padding:10px}
.p6wrap .g b{display:block;font-size:18px}
.p6meter{height:10px;background:var(--soft);border-radius:5px;overflow:hidden;margin:8px 0}.p6meter i{display:block;height:100%;background:var(--acc)}
.list .row>div{min-width:0}.list .row .sub{overflow:hidden;text-overflow:ellipsis}
.p6v .sub{white-space:normal}.p6v .p6big>div{min-width:0}.p6v .tbl{display:block;overflow-x:auto;white-space:nowrap}
@media(max-width:700px){#main .kvrow .sub{white-space:normal}#main .tbl{display:block;overflow-x:auto;max-width:100%}}
@media(min-width:1000px){.wrap{max-width:1240px}#main .list{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.p6set{columns:2;column-gap:14px}.p6set>*{break-inside:avoid;display:inline-block;width:100%;margin-top:0;margin-bottom:12px}.p6set>:first-child{column-span:all}
.sheet{max-width:880px}}
.kc-rg{display:flex;gap:2px;justify-content:space-between;scrollbar-width:none}.kc-rg::-webkit-scrollbar{display:none}
@media(pointer:coarse){.rg a{padding:7px 13px;font-size:13px}.kc-rg a{padding:7px 6px;font-size:13px;min-width:34px;text-align:center}.inl{min-height:34px}#main .btn,.sheet .btn{min-height:40px}}
#sr-p{width:100%;max-width:100%;min-width:0}#main .kvrow>span{min-width:0}
.p6seg{display:inline-flex;gap:2px;background:var(--soft);border-radius:9px;padding:2px;margin-top:10px}.p6seg a{padding:4px 10px;border-radius:7px;cursor:pointer;font-weight:600;font-size:13px;color:var(--mut)}.p6seg a.on{background:var(--card);color:var(--ink)}`;
  document.head.appendChild(css);

  const need = (title) => {
    if(!P.key){ $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>${title}</h3><p>Verbinde zuerst dieses Gerät mit deinem Depot (Depot → Gerät verbinden).</p></div>`; return false; }
    if(!P.loaded || !P.pf){ $("#main").innerHTML = P.err ? `<div class="err">${esc(P.err)}</div>` : `<div class="empty">Depot wird geladen …</div>`; PLUS.loadDepot(); return false; }
    if(!P.depot){ $("#main").innerHTML = `<div class="notif" style="margin-top:12px">⏳ Die erste Auswertung läuft noch.</div>`; return false; }
    return true;
  };
  const A = () => (P.depot && P.depot.tx && P.depot.tx.a) || null;
  function needTx(title){
    if(!need(title)) return null;
    const a = A();
    if(!a){ $("#main").innerHTML = `<div class="box" style="margin-top:12px"><h3>${title}</h3><p>Dafür braucht die App deine Transaktionen (CSV-Export von Scalable Capital oder Trade Republic).</p>
      <div class="links"><button class="btn" id="p6-imp">Transaktionen importieren</button></div><div class="sub" style="white-space:normal">Nach dem Import dauert es bis zum nächsten Lauf (wenige Minuten), bis die Auswertung da ist.</div></div>`;
      const b = $("#p6-imp"); if(b) b.onclick = () => PLUS2.txImport(); return null; }
    return a;
  }
  function toastKurz(m){ let t=document.getElementById("vf-toast"); if(!t){ t=document.createElement("div"); t.id="vf-toast"; document.body.appendChild(t); } t.textContent=m; t.className="show"; clearTimeout(t._h); t._h=setTimeout(()=>t.className="",2500); }
  const kopf = (t, s) => `<div class="box" style="margin-top:12px"><h3 style="margin-bottom:2px">${t}</h3><div class="sub" style="white-space:normal">${s}</div></div>`;
  function bars(items, fmt=(v)=>E(v), opt={}){
    const max = Math.max(1e-9, ...items.map(x=>Math.abs(x[1]||0)));
    return `<div class="p6bars" style="${opt.h?`height:${opt.h}px`:""}">${items.map(([l,v,c])=>`<div title="${esc(l)}: ${fmt(v)}">${opt.werte?`<b>${v?fmt(v):""}</b>`:""}<i class="${v<0?"neg":""} ${c||""}" style="height:${Math.abs(v||0)/max*100}%"></i><span>${esc(l)}</span></div>`).join("")}</div>`;
  }
  const brokerListe = a => [...new Set([...Object.keys(a.gebuehren||{}), ...Object.keys(a.ertraege||{})])];
  const steuerSatz = () => (P.pf.steuer||{}).kirche ? (0.25/1.0225)*1.055 + (0.25/1.0225)*0.09 : 0.26375;
  const freiGesamt = () => (P.pf.steuer||{}).verheiratet ? 2000 : 1000;
  const isETF = z => z && ["ETF","MUTUALFUND"].includes(z.art);

  /* ================= Aktie suchen + Jetzt-Check ================= */
  const aktienListe = () => (typeof DATA!=="undefined" && DATA ? DATA.stocks : []);
  const sucheHTML = (id, ph) => `<input class="inp" id="${id}" list="${id}-dl" placeholder="${ph}" autocomplete="off"><datalist id="${id}-dl">${aktienListe().slice().sort((a,b)=>(b.mcap||0)-(a.mcap||0)).map(s=>`<option value="${esc(s.t)}">${esc(s.n)}</option>`).join("")}</datalist>`;
  const findeAktie = v => { v = (v||"").trim(); if(!v) return null; const L = aktienListe();
    return BY[v.toUpperCase()] || BY[v] || L.find(s=>s.n && s.n.toLowerCase()===v.toLowerCase()) || L.find(s=>s.n && s.n.toLowerCase().includes(v.toLowerCase())) || null; };
  function merken(t){ if(typeof stars==="undefined") return false; stars.add(t); try{ store.set("stars",[...stars]); }catch(e){} if(typeof PLUS2!=="undefined" && PLUS2.syncStars) PLUS2.syncStars(); return true; }
  function jetztCheck(s){
    const R = []; let pkt = 0;
    const zeile = (ok, text, wert) => R.push(`<div class="kvrow"><span>${ok>0?"🟢":ok<0?"🔴":"⚪️"} ${text}</span><b>${wert}</b></div>`);
    if(s.dd!=null){ const v = s.dd; const o = v<=-0.2?2:v<=-0.1?1:v>-0.03?-1:0; pkt += o; zeile(o, "Abstand zum 52-Wochen-Hoch", Pc(v,0,true)); }
    if(s.sma50 && s.p){ const v = s.p/s.sma50-1; const o = v<-0.05?1:v>0.08?-1:0; pkt += o; zeile(o, "Kurs vs. 50-Tage-Schnitt", Pc(v,1,true)); }
    if(s.sma200 && s.p){ const v = s.p/s.sma200-1; const o = v<0?1:v>0.2?-1:0; pkt += o; zeile(o, "Kurs vs. 200-Tage-Schnitt", Pc(v,1,true)); }
    if(s.rsi!=null){ const o = s.rsi<35?1:s.rsi>70?-1:0; pkt += o; zeile(o, `RSI (${s.rsi<35?"überverkauft":s.rsi>70?"heiß gelaufen":"normal"})`, nf(0).format(s.rsi)); }
    if(s.kgv && s.grp_kgv){ const v = s.kgv/s.grp_kgv; const o = v<0.85?1:v>1.3?-1:0; pkt += o; zeile(o, "KGV im Vergleich zur Branche", `${nf(1).format(s.kgv)} vs. ${nf(1).format(s.grp_kgv)}`); }
    if(s.upside!=null){ const o = s.upside>=0.15?1:s.upside<=0?-1:0; pkt += o; zeile(o, "Analysten-Kursziel", Pc(s.upside,0,true)); }
    if(s.moat!=null) zeile(0, "Burggraben-Score (Qualität)", nf(0).format(s.moat));
    const urteil = pkt>=3 ? ["eher günstig", "up"] : pkt<0 ? ["eher teuer", "down"] : ["neutral", ""];
    return `<div class="kvrow" style="font-size:16px"><span><b>${esc(s.n)}</b> <span class="sub">${esc(s.t)} · ${F.cur(s.p, s.cur)}</span></span><b class="${urteil[1]}">${urteil[0]}</b></div>${R.join("")}
      <div class="links"><button class="btn ghost" data-jc-merk="${esc(s.t)}">★ Zur Merkliste</button> <button class="btn ghost" data-jc-det="${esc(s.t)}">Details & Kaufzone</button></div>
      <div class="sub" style="white-space:normal">Kurzer Bewertungs-Check aus Kursverlauf, RSI, KGV und Analystenzielen – kein Kaufsignal.</div>`;
  }
  function jetztBox(){
    return `<div class="box"><h3>🔎 Ist eine Aktie gerade günstig?</h3><div class="form">${sucheHTML("jc-q","Aktie oder Ticker suchen, z. B. Apple oder AAPL")}</div><div id="jc-out"></div></div>`;
  }
  function jetztBind(){
    const q = $("#jc-q"); if(!q) return;
    const zeig = () => { const s = findeAktie(q.value); const o = $("#jc-out"); if(!s){ o.innerHTML = q.value.trim() ? `<div class="sub">Nicht im Scanner gefunden.</div>` : ""; return; }
      o.innerHTML = jetztCheck(s);
      o.querySelector("[data-jc-merk]").onclick = ev => { if(merken(s.t)) ev.target.textContent = "✓ Auf der Merkliste"; };
      o.querySelector("[data-jc-det]").onclick = () => openDetail(s.t); };
    q.onchange = zeig; q.onkeydown = e => { if(e.key==="Enter") zeig(); };
  }

  /* ================= 1. Gebühren-Check ================= */
  function renderGebuehren(){
    const a = needTx("Gebühren-Check"); if(!a) return;
    const G = a.gebuehren || {}, B = Object.keys(G);
    const jahre = [...new Set(B.flatMap(b=>Object.keys(G[b])))].sort();
    const sum = (b, y, k) => (G[b]?.[y]?.[k]) || 0;
    const ges = B.reduce((s,b)=>s+jahre.reduce((t,y)=>t+sum(b,y,"geb")+sum(b,y,"extra"),0),0);
    const vol = B.reduce((s,b)=>s+jahre.reduce((t,y)=>t+sum(b,y,"vol"),0),0);
    const n = a.n_trades||0, gratis = a.n_gratis||0;
    const kleine = (a.teuer||[]).filter(t=>t.pct>0.01).length;
    $("#main").innerHTML = kopf("💸 Gebühren-Check", "Was dich deine Käufe und Verkäufe an Ordergebühren gekostet haben – aus deinen echten Transaktionen.") + `
      <div class="box"><div class="p6big">
        <div><div class="sub">Gebühren gesamt</div><div class="v">${E(ges,2)}</div><div class="sub">seit ${dk(P.depot.tx.seit)}</div></div>
        <div><div class="sub">Anteil am gehandelten Geld</div><div class="v">${Pc(vol?ges/vol:null,2)}</div><div class="sub">${E(vol)} gehandelt</div></div>
        <div><div class="sub">Trades ohne Gebühr</div><div class="v">${gratis} von ${n}</div><div class="sub">Sparpläne & Wiederanlage</div></div></div></div>
      <div class="box"><h3>Je Broker und Jahr</h3><table class="tbl"><tr><th>Broker</th><th>Jahr</th><th>Trades</th><th>Ordergebühren</th><th>sonstige</th><th>% vom Volumen</th></tr>
        ${B.flatMap(b=>jahre.filter(y=>G[b][y]).map(y=>`<tr><td><b>${esc(b)}</b></td><td>${y}</td><td>${sum(b,y,"n")}</td><td>${E(sum(b,y,"geb"),2)}</td><td>${sum(b,y,"extra")?E(sum(b,y,"extra"),2):"–"}</td><td>${Pc(sum(b,y,"vol")?sum(b,y,"geb")/sum(b,y,"vol"):null,2)}</td></tr>`)).join("")}</table>
        <div class="sub" style="white-space:normal;margin-top:6px">„sonstige“ = Gebühren, die dein Broker extra abgebucht hat (z. B. Abo). Zinsen aufs Guthaben und Spreads beim Kauf sind nicht enthalten.</div></div>
      <div class="box"><h3>Die teuersten Trades (Gebühr im Verhältnis)</h3>
        ${(a.teuer||[]).map(t=>`<div class="kvrow"><span><b>${esc(t.name)}</b><br><span class="sub">${t.art} am ${dk(t.d)} · ${esc(t.br)} · ${E(t.vol,2)}</span></span><b class="${t.pct>0.01?"down":""}">${E(t.geb,2)}<br><span class="sub">${Pc(t.pct,2)}</span></b></div>`).join("") || `<div class="sub">Keine Trades mit Gebühr. 👍</div>`}
        ${kleine?`<div class="notif" style="margin-top:8px">💡 ${kleine} Käufe hatten über 1 % Gebühr. Bei einem festen Preis pro Order wird das erst ab größeren Beträgen günstig: 1 € auf 50 € sind 2 %, auf 500 € nur 0,2 %. Kleine Beträge lieber per Sparplan oder seltener, dafür größer kaufen.</div>`:""}</div>`;
  }

  /* ================= 2. Freistellungsauftrag aufteilen ================= */
  function freiDaten(){
    const a = A(), D = P.depot, st = P.pf.steuer || {}, frei = freiGesamt();
    const Z = Object.fromEntries((D.positionen||[]).map(z=>[z.id,z]));
    const brOf = id => ((P.pf.positionen||[]).find(p=>p.id===id)||{}).broker || "Ohne Broker";
    const BZ = (D.basiszins||{})[jahr] ?? 0.032;
    const B = {};
    const b_ = n => B[n] = B[n] || {b:n, div:0, zins:0, real:0, steuer:0, div12:0, vp:0};
    if(a) for(const [b, yy] of Object.entries(a.ertraege||{})){ const x = yy[jahr]||{}; const o = b_(b);
      o.div = x.div_stpfl||0; o.divBr = x.div||0; o.zins = x.zins||0; o.real = x.real_stpfl||0; o.steuer = x.steuer||0; }
    for(const i of (D.div_info||[])){ const z = Z[i.id]; b_(i.broker || brOf(i.id)).div12 += (i.jahr||0) * (isETF(z)?0.7:1); }
    for(const z of (D.positionen||[])){
      if(!(isETF(z) && z.p_eur_ja && z.p_eur && z.stk)) continue;
      const aus = z.div_bisher||0, w0 = z.stk*z.p_eur_ja, basis = w0*BZ*0.7, zuwachs = (z.p_eur-z.p_eur_ja)*z.stk + aus;
      b_(brOf(z.id)).vp += Math.max(0, Math.min(basis, zuwachs) - aus) * 0.7;
    }
    const R = Object.values(B).filter(o=>o.b!=="Ohne Broker" || o.div12 || o.vp);
    R.forEach(o=>{ o.genutzt = o.div + o.zins + o.real; o.fsa = toNum((st.fsa||{})[o.b]); o.bedarf = o.div12 + o.vp; });
    const bs = R.reduce((s,o)=>s+o.bedarf,0);
    R.forEach(o=>o.vorschlag = bs ? Math.round(frei*o.bedarf/bs/10)*10 : Math.round(frei/Math.max(1,R.length)/10)*10);
    const diff = frei - R.reduce((s,o)=>s+o.vorschlag,0); if(R.length && diff){ R.sort((x,y)=>y.bedarf-x.bedarf)[0].vorschlag += diff; }
    return {R, frei, BZ};
  }
  // Broker der Positionen aus den Transaktionen ergänzen (falls nicht von Hand zugeordnet)
  function brokerAusTx(){
    const a = A(); if(!a || !P.pf) return; const m = {};
    (a.offen||[]).forEach(o=>{ const v = o.stk*(o.kurs||0); if(!m[o.w] || v > m[o.w].v) m[o.w] = {b:o.br, v}; });
    (P.pf.positionen||[]).forEach(p=>{ if(!p.broker && p.isin && m[p.isin]) p.broker = m[p.isin].b; });
  }
  const steuer3 = PLUS.VIEWS.steuer; if(steuer3) PLUS.VIEWS.steuer = function(){ try{ brokerAusTx(); }catch(e){} return steuer3.apply(this, arguments); };
  function renderFreistellung(){
    if(!need("Freistellungsauftrag aufteilen")) return;
    brokerAusTx();
    const {R, frei} = freiDaten(), a = A();
    const fsaSum = R.reduce((s,o)=>s+(o.fsa||0),0);
    const frei_rest = R.filter(o=>o.fsa!=null && o.fsa - o.genutzt > 20),
      zuviel = R.filter(o=>o.steuer - 0.15*(o.divBr||0) > 1 && !frei_rest.includes(o));   // Steuer trotz Restfreibetrag beim selben Broker = ausländische Quellensteuer, kein Aufteilungsproblem   // zuviel = mehr als die übliche Quellensteuer
    const nj = +jahr+1;
    $("#main").innerHTML = kopf("🧾 Freistellungsauftrag aufteilen", `Du hast ${E(frei)} Sparerpauschbetrag im Jahr. Er wirkt nur bei dem Broker, bei dem du ihn per Freistellungsauftrag eingestellt hast. Hier siehst du, wo er ${jahr} gebraucht wurde und wie du ihn am besten aufteilst.`) + `
      <div class="box"><h3>${jahr} bisher je Broker</h3>
        ${R.map(o=>`<div class="kvrow"><span><b>${esc(o.b)}</b><br><span class="sub">Dividenden* ${E(o.div)} · Zinsen ${E(o.zins)} · Kursgewinne* <span class="${cls(o.real)}">${E(o.real)}</span></span></span>
          <span style="text-align:right;white-space:nowrap"><b>${E(o.genutzt)}</b> genutzt<br><span class="sub">Auftrag ${o.fsa==null?"?":E(o.fsa)} · Steuer <span class="${o.steuer>0.5?"down":""}">${E(o.steuer,2)}</span></span></span></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">* steuerpflichtiger Teil: bei Aktien-ETFs 70 % (Teilfreistellung). ${a?"Aus deinen importierten Transaktionen.":"Importiere deine Transaktionen, damit Dividenden und Kursgewinne hier automatisch stehen."} „Steuer“ enthält auch ausländische Quellensteuer. Verluste (Minus bei Kursgewinnen) verrechnet der Broker mit späteren Gewinnen.</div>
        ${zuviel.length && frei_rest.length ? `<div class="notif" style="margin-top:8px">⚠ Bei ${zuviel.map(o=>esc(o.b)).join(", ")} wurde Steuer abgezogen, während bei ${frei_rest.map(o=>esc(o.b)).join(", ")} noch Freibetrag übrig ist. Ändere die Aufteilung (geht jederzeit fürs laufende Jahr) – zu viel gezahlte Abgeltungsteuer bekommst du sonst erst über die Steuererklärung zurück.</div>`:""}
        ${fsaSum>frei?`<div class="err">Deine Aufträge ergeben zusammen ${E(fsaSum)} – mehr als ${E(frei)} ist nicht erlaubt.</div>`:""}</div>
      <div class="box"><h3>Deine Freistellungsaufträge</h3>
        <div class="sub" style="white-space:normal;margin-bottom:6px">Trag ein, was du bei jedem Broker eingestellt hast (steht in der Broker-App unter Steuern / Freistellungsauftrag). Zusammen höchstens ${E(frei)}.</div>
        ${R.filter(o=>o.b!=="Ohne Broker").map(o=>`<div class="kvrow" style="align-items:center"><span><b>${esc(o.b)}</b><br><span class="sub">Vorschlag ${E(o.vorschlag)}</span></span>
          <span style="display:flex;align-items:center;gap:6px"><input class="inp" data-fsa="${esc(o.b)}" inputmode="decimal" placeholder="0" value="${o.fsa==null?"":String(o.fsa).replace(".",",")}" style="width:110px;text-align:right"> €</span></div>`).join("")}
        <div class="kvrow"><span>Zusammen</span><b id="fa-sum">–</b></div>
        <div class="links"><button class="btn" id="fa-save">Speichern</button> <button class="btn ghost" id="fa-vor">Vorschlag eintragen</button></div></div>
      <div class="box"><h3>Vorschlag für ${nj}</h3>
        ${R.map(o=>`<div class="kvrow"><span><b>${esc(o.b)}</b><br><span class="sub">erwartet ${E(o.div12)} Dividenden + ${E(o.vp)} Vorabpauschale (steuerpflichtig)</span></span><b style="white-space:nowrap">${E(o.vorschlag)}</b></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Aufgeteilt nach den Erträgen, die je Broker zu erwarten sind (Dividenden der nächsten 12 Monate und die Vorabpauschale für ${jahr}, die am ersten Werktag ${nj} anfällt). Planst du größere Verkäufe mit Gewinn, gib diesem Broker mehr.</div>
        <div class="links"><a class="btn ghost" href="#steuer">Steuer-Cockpit</a></div></div>`;
    const felder = [...document.querySelectorAll("[data-fsa]")];
    const summe = () => { const v = felder.map(f=>toNum(f.value)||0).reduce((x,y)=>x+y,0), el = $("#fa-sum");
      el.textContent = E(v); el.className = v>frei+0.005 ? "down" : ""; return v; };
    felder.forEach(f=>f.oninput = summe); summe();
    $("#fa-vor").onclick = () => { felder.forEach(f=>{ const o = R.find(x=>x.b===f.dataset.fsa); f.value = o ? String(o.vorschlag) : ""; }); summe(); };
    $("#fa-save").onclick = async () => {
      const werte = felder.map(f=>[f.dataset.fsa, toNum(f.value)]);
      if(werte.some(([,v])=>v!=null && v<0)) return toastKurz("Bitte keine negativen Beträge");
      if(summe() > frei+0.005) return toastKurz(`Zusammen höchstens ${E(frei)} – bitte anpassen`);
      const st = P.pf.steuer = Object.assign({}, P.pf.steuer||{});
      st.fsa = Object.fromEntries(werte.filter(([,v])=>v!=null).map(([b,v])=>[b, Math.round(v*100)/100]));
      $("#fa-save").disabled = true;
      if(await PLUS.save("Freistellungsaufträge gespeichert", true)) renderFreistellung(); else $("#fa-save").disabled = false; };
  }

  /* ================= 3. Kaufzeitpunkte ================= */
  function renderKaufzeit(){
    if(!need("Kaufzeitpunkte")) return;
    const a = A(), K = (a && a.kaufzeit) || [];
    if(!K.length){ $("#main").innerHTML = kopf("⏱ Kaufzeitpunkte", a ? "Noch keine Käufe mit genug Kursdaten (mindestens 30 Tage vor dem Kauf)." : "Für die Auswertung deiner bisherigen Käufe importiere deine Transaktionen.") + jetztBox(); jetztBind(); return; }
    const avg = L => L.length ? L.reduce((s,k)=>s+k.pct,0)/L.length : null;
    const unter = K.filter(k=>k.pct<0).length, sp = K.filter(k=>k.sp), hand = K.filter(k=>!k.sp);
    const fach = [[-1,-0.05,"< −5 %"],[-0.05,-0.02,"−5…−2"],[-0.02,0,"−2…0"],[0,0.02,"0…+2"],[0.02,0.05,"+2…+5"],[0.05,9,"> +5 %"]];
    const s = [...K].sort((x,y)=>x.pct-y.pct), m = avg(K);
    const row = k => `<div class="kvrow"><span><b>${esc(k.name)}</b><br><span class="sub">${dk(k.d)} · ${k.sp?"Sparplan":"Einzelkauf"} · Kurs ${nf(2).format(k.kurs)} vs. Ø ${nf(2).format(k.avg)}</span></span><b class="${cls(-k.pct)}">${Pc(k.pct,1,true)}</b></div>`;
    $("#main").innerHTML = kopf("⏱ Kaufzeitpunkte", "Hast du günstig gekauft? Jeder Kaufkurs wird mit dem Durchschnittskurs der 30 Tage davor verglichen. Minus = günstiger als der Schnitt.") + jetztBox() + `
      <div class="box"><div class="p6big">
        <div><div class="sub">Ø gegenüber 30-Tage-Schnitt</div><div class="v ${cls(-m)}">${Pc(m,1,true)}</div><div class="sub">${K.length} Käufe</div></div>
        <div><div class="sub">günstiger als der Schnitt</div><div class="v">${Pc(unter/K.length)}</div><div class="sub">${unter} von ${K.length}</div></div>
        <div><div class="sub">Einzelkäufe vs. Sparplan</div><div class="v" style="font-size:16px">${Pc(avg(hand),1,true)} / ${Pc(avg(sp),1,true)}</div><div class="sub">${hand.length} / ${sp.length} Käufe</div></div></div>
        ${bars(fach.map(([lo,hi,l])=>[l, K.filter(k=>k.pct>=lo && k.pct<hi).length]), v=>v+" Käufe", {werte:true})}
        <div class="sub" style="white-space:normal;margin-top:8px">${Math.abs(m)<0.01?"Du kaufst im Schnitt ziemlich genau zum Durchschnittspreis. Das ist normal: Den perfekten Moment trifft auf Dauer niemand.":m<0?"Du kaufst im Schnitt etwas günstiger als der Monatsdurchschnitt – gut gemacht, oft durch Kaufen nach Rücksetzern.":"Du kaufst im Schnitt etwas teurer als der Monatsdurchschnitt – oft passiert das, wenn man nach starken Anstiegen kauft."} ${sp.length && hand.length ? (avg(hand) < avg(sp) ? "Deine Einzelkäufe waren besser getimt als die Sparpläne." : "Deine Sparpläne waren nicht schlechter getimt als deine Einzelkäufe – Timing bringt dir also kaum etwas.") : ""}</div></div>
      <div class="box"><h3>Beste Zeitpunkte</h3>${s.slice(0,5).map(row).join("")}</div>
      <div class="box"><h3>Teuerste Zeitpunkte</h3>${s.slice(-5).reverse().map(row).join("")}</div>
      <div class="sub" style="white-space:normal;margin-top:8px">Nur Käufe, für die es Börsenkurse gibt. Kurse in Euro, ohne Gebühren.</div>`;
    jetztBind();
  }

  /* ================= 4. Dividenden-Wachstum ================= */
  function renderDivwachstum(){
    const a = needTx("Dividenden-Wachstum"); if(!a) return;
    const M = a.div_monate || {}, keys = Object.keys(M).sort();
    const heute = new Date(), ym = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
    const monate = []; for(let i=23;i>=0;i--){ const d = new Date(heute.getFullYear(), heute.getMonth()-i, 1); monate.push(ym(d)); }
    const ab = keys[0] || ym(heute);
    const zeig = monate.filter(m=>m>=ab);
    const proJahr = {}; keys.forEach(k=>proJahr[k.slice(0,4)] = (proJahr[k.slice(0,4)]||0) + M[k]);
    const l12 = monate.slice(-12).reduce((s,m)=>s+(M[m]||0),0);
    const v12 = monate.slice(0,12).reduce((s,m)=>s+(M[m]||0),0);
    const ytd = keys.filter(k=>k.startsWith(jahr)).reduce((s,k)=>s+M[k],0);
    const vj = String(+jahr-1), mNow = ym(heute).slice(5);
    const ytdV = keys.filter(k=>k.startsWith(vj) && k.slice(5)<=mNow).reduce((s,k)=>s+M[k],0);
    const erw = (P.depot.div_monate||[]).reduce((s,x)=>s+x,0);
    const W = (a.div_wp||[]).map(x=>({name:x.name, j:x.jahre, l:x.jahre[jahr]||0, v:x.jahre[vj]||0})).sort((x,y)=>y.l-x.l);
    $("#main").innerHTML = kopf("🌱 Dividenden-Wachstum", "Was du wirklich an Dividenden und Zinsen bekommen hast (netto, nach Quellensteuer) – Monat für Monat.") + `
      <div class="box"><div class="p6big">
        <div><div class="sub">letzte 12 Monate</div><div class="v">${E(l12,2)}</div><div class="sub">${v12>0?`${Pc(l12/v12-1,0,true)} zum Jahr davor`:"≈ "+E(l12/12,2)+" pro Monat"}</div></div>
        <div><div class="sub">${jahr} bis jetzt</div><div class="v">${E(ytd,2)}</div><div class="sub">${ytdV>0?`${Pc(ytd/ytdV-1,0,true)} zum gleichen Zeitraum ${vj}`:"erstes volles Jahr"}</div></div>
        <div><div class="sub">erwartet nächste 12 Monate</div><div class="v">${E(erw,0)}</div><div class="sub">${l12>0&&erw?`${Pc(erw/l12-1,0,true)} zu den letzten 12 Monaten`:"brutto, aus deinen Positionen"}</div></div></div>
        ${bars(zeig.map(m=>[MON[+m.slice(5)-1]+(m.endsWith("-01")?" "+m.slice(2,4):""), M[m]||0]), v=>E(v,2))}</div>
      ${Object.keys(proJahr).length>1?`<div class="box"><h3>Pro Jahr</h3>${bars(Object.entries(proJahr).map(([y,v])=>[y,v]), v=>E(v,2), {werte:true, h:90})}</div>`:""}
      <div class="box"><h3>Je Wertpapier</h3><table class="tbl"><tr><th>Wert</th><th>${vj}</th><th>${jahr}</th></tr>
        ${W.slice(0,40).map(x=>`<tr><td>${esc(x.name)}</td><td>${x.v?E(x.v,2):"–"}</td><td><b>${E(x.l,2)}</b>${x.v&&x.l?` <span class="sub ${cls(x.l-x.v)}">${Pc(x.l/x.v-1,0,true)}</span>`:""}</td></tr>`).join("")}</table>
        <div class="sub" style="white-space:normal;margin-top:6px">Mehr Dividenden kommen von zwei Seiten: du kaufst nach, und die Firmen erhöhen ihre Ausschüttung. Der Vergleich zum Vorjahr zeigt beides zusammen. Erfasst ab deiner ersten importierten Buchung (${dk(P.depot.tx.seit)}).</div></div>`;
  }

  /* ================= 5. Verkaufs-Rückblick ================= */
  function renderVerkaeufe(){
    const a = needTx("Verkaufs-Rückblick"); if(!a) return;
    const V = a.verkaeufe || [];
    if(!V.length){ $("#main").innerHTML = kopf("🔁 Verkaufs-Rückblick", "Du hast noch nichts verkauft – gut für den Zinseszins. 🙂"); return; }
    const mit = V.filter(v=>v.heute!=null), diff = mit.reduce((s,v)=>s+(v.heute-v.erloes),0);
    const realisiert = V.reduce((s,v)=>s+(v.gewinn||0),0);
    $("#main").innerHTML = kopf("🔁 Verkaufs-Rückblick", "Was wäre, wenn du nicht verkauft hättest? Jeder Verkauf im Vergleich zum heutigen Wert derselben Stückzahl.") + `
      <div class="box"><div class="p6big">
        <div><div class="sub">Verkäufe</div><div class="v">${V.length}</div><div class="sub">Erlös ${E(V.reduce((s,v)=>s+v.erloes,0))}</div></div>
        <div><div class="sub">Gewinn beim Verkauf</div><div class="v ${cls(realisiert)}">${Es(realisiert)}</div><div class="sub">nach FIFO, vor Steuer</div></div>
        <div><div class="sub">Halten wäre heute …</div><div class="v ${cls(-diff)}">${diff>0?E(diff)+" mehr":E(-diff)+" weniger"}</div><div class="sub">${diff>0?"Verkaufen hat dich Geld gekostet":"Verkaufen war richtig"}</div></div></div></div>
      <div class="box"><h3>Alle Verkäufe</h3>
        ${V.map(v=>{ const d = v.heute!=null ? v.heute - v.erloes : null; return `<div class="kvrow"><span><b>${esc(v.name)}</b><br><span class="sub">${dk(v.d)} · ${nf(v.stk%1?3:0).format(v.stk)} Stück zu ${nf(2).format(v.kurs_verk)} · ${esc(v.br)}${v.gewinn!=null?` · Gewinn damals ${Es(v.gewinn)}`:""}</span></span>
          <b>${E(v.erloes)} → ${v.heute!=null?E(v.heute):"?"}<br><span class="sub ${cls(-(d||0))}">${d==null?"kein Kurs":d>0?"Halten: "+Es(d):"Verkauf: "+Es(-d)+" gespart"}</span></b></div>`; }).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Nicht eingerechnet: Dividenden, die du seitdem bekommen hättest, und was du mit dem Erlös gekauft hast.</div></div>`;
  }

  /* ================= 6. Crash-Test ================= */
  function renderCrash(){
    if(!need("Crash-Test")) return;
    const C = P.depot.crash;
    if(!C || !(C.szenarien||[]).length){ $("#main").innerHTML = kopf("🌪 Crash-Test", "Die Kursdaten für die Krisen werden beim nächsten Lauf geladen."); return; }
    $("#main").innerHTML = kopf("🌪 Crash-Test", `Wie wäre dein heutiges Depot (${E(C.wert)}) durch die echten Krisen der letzten 20 Jahre gekommen? Jede Position mit ihrem eigenen Kursverlauf von damals.`) +
      C.szenarien.map(s=>`<div class="box"><h3>${esc(s.name)} <span class="sub">${dk(s.von)} – ${dk(s.bis)}</span></h3>
        <div class="p6big"><div><div class="sub">Dein Depot</div><div class="v ${cls(s.depot_pct)}">${Pc(s.depot_pct,0,true)}</div><div class="sub">${Es(s.verlust)}</div></div>
          <div><div class="sub">${esc(s.markt_name)}</div><div class="v ${cls(s.markt)}">${Pc(s.markt,0,true)}</div><div class="sub">${s.depot_pct>=s.markt?"✓ besser als der Markt":"✗ schlechter als der Markt"}</div></div>
          <div><div class="sub">Markt wieder auf Vorkrisen-Niveau</div><div class="v" style="font-size:16px">${s.markt_erholt_tage==null?"–":s.markt_erholt_tage>400?nf(1).format(s.markt_erholt_tage/365)+" Jahre":s.markt_erholt_tage<30?"unter 1 Monat":Math.round(s.markt_erholt_tage/30)+" Monate"}</div><div class="sub">nach dem Tiefpunkt</div></div></div>
        ${s.pos.map(p=>`<div class="kvrow"><span>${esc(p.name)}${p.echt?"":` <span class="sub">(geschätzt)</span>`}</span><b class="${cls(p.pct)}">${Pc(p.pct,0,true)} <span class="sub">${Es(p.eur)}</span></b></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:4px">${Pc(s.abdeckung)} deines Depots mit echten Kursen von damals, der Rest wie der Markt (Geldmarkt/Cash: 0 %).</div></div>`).join("") +
      `<div class="sub" style="white-space:normal;margin-top:8px">Kurse in Handelswährung, ohne Dividenden und Währungseffekte. Vom Hoch bis zum Tiefpunkt des Marktes. Wichtig ist nicht die Zahl, sondern die Frage: Würdest du in so einem Moment ruhig bleiben – oder verkaufen? Schreib deine Antwort ins <a href="#tagebuch">Börsen-Tagebuch</a>.</div>`;
  }

  /* ================= 7. Steuer vor Verkauf ================= */
  function restFrei(br){
    const a = A(), st = P.pf.steuer || {};
    const x = (a?.ertraege?.[br]||{})[jahr] || {};
    const genutzt = (x.div_stpfl||0) + (x.zins||0) + (x.real_stpfl||0);
    const fsa = toNum((st.fsa||{})[br]);
    return {fsa, genutzt, rest: fsa==null ? null : Math.max(0, fsa - genutzt)};
  }
  function fifo(o, menge, preis){
    let rest = menge, kosten = 0, frei_k = 0, frei_m = 0; const heute = Date.now();
    for(const [d, stk, k] of o.lots){ if(rest<=1e-9) break; const n = Math.min(rest, stk); kosten += n*k;
      if(o.krypto && (heute - new Date(d+"T12:00:00"))/864e5 > 365){ frei_k += n*k; frei_m += n; } rest -= n; }
    return {kosten, gewinn: (menge-rest)*preis - kosten, frei_gewinn: frei_m*preis - frei_k, fehlt: rest};
  }
  function renderSteuerrechner(){
    const a = needTx("Steuer vor Verkauf"); if(!a) return;
    const O = (a.offen||[]).filter(o=>o.kurs);
    if(!O.length){ $("#main").innerHTML = kopf("🧮 Steuer vor Verkauf", "Keine offenen Positionen mit Kurs gefunden."); return; }
    $("#main").innerHTML = kopf("🧮 Steuer vor Verkauf", "Rechne aus, wie viel Steuer ein Verkauf kostet, bevor du verkaufst. Mit deinen echten Kaufkursen (FIFO: zuerst gekaufte Stücke gelten als zuerst verkauft) und deinem restlichen Freibetrag.") + `
      <div class="box"><div class="form">
        <label>Position<select class="inp" id="sr-p">${O.map((o,i)=>`<option value="${i}">${esc(o.name)} · ${esc(o.br)} (${nf(o.stk%1?3:0).format(o.stk)} Stück)</option>`).join("")}</select></label>
        <div class="two"><label>Stückzahl<input class="inp" id="sr-n" inputmode="decimal"></label><label>Verkaufskurs (€)<input class="inp" id="sr-k" inputmode="decimal"></label></div></div>
        <div id="sr-out"></div></div>
      <div class="box"><h3>Freibetrag ${jahr} je Broker</h3>${[...new Set(O.map(o=>o.br))].map(b=>{ const r = restFrei(b); return `<div class="kvrow"><span>${esc(b)}<br><span class="sub">${r.fsa==null?"Freistellungsauftrag unbekannt – trag ihn im Steuer-Cockpit ein":`Auftrag ${E(r.fsa)}, schon genutzt ${E(r.genutzt)}`}</span></span><b>${r.rest==null?"?":E(r.rest)+" frei"}</b></div>`; }).join("")}
        <div class="links"><a class="btn ghost" href="#freistellung">Freistellungsaufträge</a></div></div>`;
    const calc = () => {
      const o = O[+$("#sr-p").value], menge = Math.min(o.stk, toNum($("#sr-n").value) ?? o.stk), preis = toNum($("#sr-k").value) ?? o.kurs;
      const f = fifo(o, menge, preis), r = restFrei(o.br), satz = steuerSatz(), erl = menge*preis;
      let html;
      if(o.krypto){
        const pflichtig = f.gewinn - f.frei_gewinn;
        html = `<div class="kvrow"><span>Erlös</span><b>${E(erl,2)}</b></div><div class="kvrow"><span>Gewinn</span><b class="${cls(f.gewinn)}">${Es(f.gewinn,2)}</b></div>
          <div class="kvrow"><span>davon über 1 Jahr gehalten (steuerfrei)</span><b>${Es(f.frei_gewinn,2)}</b></div>
          <div class="notif" style="margin-top:8px">Krypto ist kein Kapitalertrag: Gewinne aus Coins, die du länger als 1 Jahr hattest, sind steuerfrei. Kürzer gehaltene: bis 1.000 € Gewinn im Jahr (alle privaten Verkäufe zusammen) steuerfrei, darüber komplett mit deinem persönlichen Steuersatz. Hier: ${Es(pflichtig,2)} kurzfristig.</div>`;
      } else {
        const pflichtig = f.gewinn * (o.etf?0.7:1), rest = r.rest ?? 0, ueber = Math.max(0, pflichtig - rest), steuer = ueber*satz;
        // steuerfrei mögliche Stückzahl (bis der Freibetrag aufgebraucht ist)
        let frei_n = 0, acc = 0;
        if(rest>0) for(const [d, stk, k] of o.lots){ const g1 = (preis-k)*(o.etf?0.7:1); if(g1<=0){ frei_n += stk; continue; } const n = Math.min(stk, (rest-acc)/g1); frei_n += n; acc += n*g1; if(n<stk) break; }
        html = `<div class="kvrow"><span>Erlös</span><b>${E(erl,2)}</b></div>
          <div class="kvrow"><span>Kaufkosten (FIFO, inkl. Gebühren)</span><b>${E(f.kosten,2)}</b></div>
          <div class="kvrow"><span>Gewinn</span><b class="${cls(f.gewinn)}">${Es(f.gewinn,2)}</b></div>
          ${o.etf?`<div class="kvrow"><span>davon steuerpflichtig (Aktien-ETF: 70 %)</span><b>${E(pflichtig,2)}</b></div>`:""}
          <div class="kvrow"><span>Freibetrag bei ${esc(o.br)}</span><b>${r.rest==null?"? (0 € angenommen)":E(rest,2)}</b></div>
          <div class="kvrow" style="font-size:16px"><span><b>Steuer</b> <span class="sub">${nf(2).format(satz*100)} %</span></span><b class="${steuer>0?"down":"up"}">${f.gewinn<0?"0 € · Verlust":E(steuer,2)}</b></div>
          <div class="kvrow"><span>Du bekommst</span><b>${E(erl-steuer,2)}</b></div>
          ${f.gewinn<0?`<div class="sub" style="white-space:normal;margin-top:6px">Der Verlust landet im Verlusttopf deines Brokers und wird mit späteren Gewinnen verrechnet${o.etf?"":" (Verluste aus Aktien nur mit Aktien-Gewinnen)"}.</div>`:""}
          ${rest>0 && f.gewinn>0 && frei_n>0 && frei_n<o.stk?`<div class="notif" style="margin-top:8px">💡 Steuerfrei verkaufen kannst du bis etwa <b>${nf(frei_n%1?3:0).format(Math.floor(frei_n*1000)/1000)} Stück</b>. Trick zum Jahresende: so viele verkaufen und direkt zurückkaufen – der Gewinn ist dann steuerfrei „gesichert“ und dein Einstandskurs steigt (kostet nur die Ordergebühr).</div>`:""}`;
      }
      if(f.fehlt>1e-6) html += `<div class="err">Für ${nf(3).format(f.fehlt)} Stück fehlen Kaufdaten (vor deinem Transaktions-Export gekauft).</div>`;
      $("#sr-out").innerHTML = html + `<div class="sub" style="white-space:normal;margin-top:6px">Schätzung ohne Verkaufsgebühr und Kirchensteuer${(P.pf.steuer||{}).kirche?" (Kirchensteuer ist eingerechnet)":""}. Keine Steuerberatung.</div>`;
    };
    const setP = () => { const o = O[+$("#sr-p").value]; $("#sr-n").value = nf(o.stk%1?6:0).format(o.stk).replace(/\./g,""); $("#sr-k").value = nf(2).format(o.kurs).replace(/\./g,""); calc(); };
    $("#sr-p").onchange = setP; $("#sr-n").oninput = calc; $("#sr-k").oninput = calc; setP();
  }

  /* ================= 8. Depot Wrapped ================= */
  function renderWrapped(){
    const a = needTx("Depot Wrapped"); if(!a) return;
    const W = a.wrapped || []; if(!W.length){ $("#main").innerHTML = kopf("🎁 Depot Wrapped", "Noch keine Daten."); return; }
    let akt = W.length-1;
    const zeig = () => {
      const w = W[akt], besser = w.msci_gewinn!=null ? w.gewinn - w.msci_gewinn : null;
      $("#main").innerHTML = `<div class="p6seg">${W.map((x,i)=>`<a data-i="${i}" class="${i===akt?"on":""}">${x.jahr}</a>`).join("")}</div>
        <div class="p6wrap"><div class="sub">Dein Börsenjahr ${w.jahr}${w.jahr===jahr?" (bis heute)":""}</div>
          <div class="hv">${Es(w.gewinn)}</div><div>Gewinn inkl. Dividenden · ${Pc(w.pct,1,true)}</div>
          <div class="g"><div><span class="sub">investiert</span><b>${E(w.investiert)}</b></div><div><span class="sub">Dividenden & Zinsen</span><b>${E(w.dividenden,2)}</b><span class="sub">${w.div_n} Zahlungen</span></div>
            <div><span class="sub">gegen MSCI World</span><b>${besser==null?"–":Es(besser)}</b><span class="sub">${besser==null?"":besser>=0?"du warst besser 🏆":"der ETF war besser"}</span></div>
            <div><span class="sub">Höchststand</span><b>${E(w.hoch)}</b><span class="sub">am ${dk(w.hoch_d)}</span></div>
            <div><span class="sub">Käufe / Verkäufe</span><b>${w.kaeufe} / ${w.verkaeufe}</b><span class="sub">Gebühren ${E(w.gebuehren,2)}</span></div>
            <div><span class="sub">am meisten gekauft</span><b style="font-size:15px">${esc(w.top_kauf?.name||"–")}</b><span class="sub">${w.top_kauf?E(w.top_kauf.betrag):""}</span></div></div></div>
        <div class="box"><h3>🚀 Gewinner ${w.jahr}</h3>${w.best.map(x=>`<div class="kvrow"><span>${esc(x.name)}</span><b class="${cls(x.pct)}">${Pc(x.pct,0,true)}</b></div>`).join("")||`<div class="sub">–</div>`}</div>
        ${w.worst.length?`<div class="box"><h3>🥶 Verlierer ${w.jahr}</h3>${w.worst.map(x=>`<div class="kvrow"><span>${esc(x.name)}</span><b class="down">${Pc(x.pct,0,true)}</b></div>`).join("")}</div>`:""}
        <div class="links"><button class="btn ghost" id="wr-share">Text zum Teilen kopieren (ohne Euro-Beträge)</button></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Kursentwicklung je Wert ab Jahresbeginn oder deinem ersten Kauf. Gewinn = Wertänderung − neu investiertes Geld + Dividenden. MSCI World: dieselben Einzahlungen zu denselben Tagen in einen MSCI-World-ETF.</div>`;
      document.querySelectorAll(".p6seg a").forEach(x=>x.onclick=()=>{ akt=+x.dataset.i; zeig(); });
      $("#wr-share").onclick = async ()=>{ const t = `Mein Börsenjahr ${w.jahr} 📈 ${Pc(w.pct,1,true)} inkl. Dividenden${w.msci_pct!=null?` (MSCI World: ${Pc(w.msci_pct,1,true)})`:""} · ${w.kaeufe} Käufe · ${w.div_n} Dividendenzahlungen${w.best[0]?` · Top: ${esc(w.best[0].name)} ${Pc(w.best[0].pct,0,true)}`:""}`;
        try{ await navigator.clipboard.writeText(t); alert("✓ Kopiert"); }catch(e){ prompt("Zum Kopieren:", t); } };
    };
    zeig();
  }

  /* ================= 9. Sparziel-Tracker ================= */
  function renderSparziel(){
    if(!need("Sparziel")) return;
    const D = P.depot, e = P.pf.einstellungen = P.pf.einstellungen || {};
    const z = Object.assign({betrag:10000, datum:(+jahr+2)+"-12-31", rendite:6, name:"Mein Ziel"}, e.sparziel||{});
    const wert = D.summe?.wert || 0, tx = D.tx;
    let rate = null;
    if(tx && tx.eingezahlt && tx.eingezahlt.length>130){ const n = tx.eingezahlt.length; rate = (tx.eingezahlt[n-1] - tx.eingezahlt[n-131]) / 6; }
    const sp = (P.pf.sparplaene||[]).filter(s=>s.aktiv!==false);
    $("#main").innerHTML = kopf("🎯 Sparziel", "Setz dir ein Ziel für dein Depot und sieh, ob du auf Kurs bist.") + `
      <div class="box"><div class="form"><div class="two"><label>Name<input class="inp" id="sz-n" value="${esc(z.name)}"></label><label>Zielbetrag (€)<input class="inp" id="sz-b" inputmode="decimal" value="${z.betrag}"></label></div>
        <div class="two"><label>Bis wann<input class="inp" id="sz-d" type="date" value="${esc(z.datum)}"></label><label>Erwartete Rendite pro Jahr (%)<input class="inp" id="sz-r" inputmode="decimal" value="${z.rendite}"></label></div>
        <label>Sparrate pro Monat (€)<input class="inp" id="sz-s" inputmode="decimal" value="${Math.round(z.rate ?? rate ?? 100)}"></label>
        <div class="sub" style="white-space:normal">${rate!=null?`Du hast in den letzten 6 Monaten im Schnitt ${E(rate)} pro Monat netto investiert.`:""}${sp.length?` Aktive Sparpläne: ${sp.length}.`:""}</div></div>
        <div class="links"><button class="btn" id="sz-save">Ziel speichern</button></div></div>
      <div id="sz-out"></div>`;
    const calc = () => {
      const ziel = toNum($("#sz-b").value)||0, r = (toNum($("#sz-r").value)??6)/100, s = toNum($("#sz-s").value)??0, bis = new Date($("#sz-d").value+"T12:00:00");
      const i = Math.pow(1+r, 1/12)-1, n = Math.max(0, Math.round((bis - new Date())/2629800000));
      const fv = (m) => wert*Math.pow(1+i,m) + (i ? s*(Math.pow(1+i,m)-1)/i : s*m);
      let m = 0; while(fv(m) < ziel && m < 600) m++;
      const noetig = n>0 ? Math.max(0, (ziel - wert*Math.pow(1+i,n)) * (i ? i/(Math.pow(1+i,n)-1) : 1/n)) : null;
      const dat = new Date(); dat.setMonth(dat.getMonth()+m);
      const stufen = [1000,2500,5000,10000,25000,50000,100000,250000,500000,1000000].filter(x=>x>wert).slice(0,5);
      const wann = x => { let k=0; while(fv(k)<x && k<600) k++; const d=new Date(); d.setMonth(d.getMonth()+k); return k>=600?"–":d.toLocaleDateString("de-DE",{month:"short",year:"numeric"}); };
      $("#sz-out").innerHTML = `<div class="box"><h3>${esc($("#sz-n").value||"Ziel")}: ${E(ziel)}</h3>
        <div class="p6meter"><i style="width:${Math.min(100, wert/ziel*100)}%"></i></div>
        <div class="kvrow"><span>Heute</span><b>${E(wert)} · ${Pc(ziel?wert/ziel:null)}</b></div>
        <div class="kvrow"><span>Mit ${E(s)}/Monat und ${nf(1).format(r*100)} % erreicht</span><b class="${n && m<=n?"up":"down"}">${m>=600?"nie":dat.toLocaleDateString("de-DE",{month:"long",year:"numeric"})}</b></div>
        ${noetig!=null?`<div class="kvrow"><span>Nötige Sparrate bis ${bis.toLocaleDateString("de-DE",{month:"short",year:"numeric"})}</span><b>${E(noetig)} / Monat</b></div>`:""}
        <div class="sub" style="white-space:normal;margin-top:6px">${m<=n?"✓ Du bist auf Kurs.":`Dir fehlen ${E(Math.max(0,(noetig||0)-s))} pro Monat – oder das Ziel rückt ${Math.max(0,m-n)} Monate nach hinten.`}</div></div>
        <div class="box"><h3>Nächste Meilensteine</h3>${stufen.map(x=>`<div class="kvrow"><span>${E(x)}</span><b>${wann(x)}</b></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Rechenbeispiel mit gleichmäßiger Rendite. Echte Kurse schwanken – in schlechten Jahren dauert es länger.</div></div>`;
    };
    ["#sz-b","#sz-r","#sz-s","#sz-d","#sz-n"].forEach(id=>$(id).oninput = calc);
    $("#sz-save").onclick = async ()=>{ e.sparziel = {name:$("#sz-n").value.trim()||"Mein Ziel", betrag:toNum($("#sz-b").value)||0, datum:$("#sz-d").value, rendite:toNum($("#sz-r").value)??6, rate:toNum($("#sz-s").value)};
      if(await PLUS.save("Sparziel gespeichert", true)) renderSparziel(); };
    calc();
  }

  /* ================= Dividenden nach Jahr + Prognose ================= */
  function divJahre(){
    const D = P.depot, a = A(); if(!D) return "";
    const B = (a && a.div_buch) || [], T = D.div_termine || [];
    const jetzt = new Date(), J = jetzt.getFullYear(), heute = jetzt.toISOString().slice(0,10);
    const jahre = [...new Set(B.map(b=>+b[0].slice(0,4)))].filter(y=>y<=J); if(!jahre.includes(J)) jahre.push(J); jahre.sort(); jahre.push(J+1);
    const E0 = (D.div_monate||[]).reduce((s,x)=>s+x,0), wert = D.summe?.wert || 0, rend = wert ? E0/wert : 0;
    let rate = 0; const tx = D.tx; if(tx && tx.eingezahlt && tx.eingezahlt.length>130){ const n = tx.eingezahlt.length; rate = Math.max(0, (tx.eingezahlt[n-1]-tx.eingezahlt[n-131])/6); }
    const o = Object.assign({y:J, g:5, spar:true}, (()=>{ try{ return JSON.parse(localStorage.getItem("vf_divjahr")||"{}"); }catch(e){ return {}; } })());
    if(!jahre.includes(o.y)) o.y = J;
    const box = document.createElement("div"); box.className = "box"; box.id = "p6-dj";
    const monat = (y) => {   // je Monat: [ist, erwartet, prognose] + Details
      const M = Array.from({length:12}, ()=>({ist:0, erw:0, prog:0, L:[]}));
      for(const [d, name, br] of B){ if(+d.slice(0,4)!==y) continue; const m = M[+d.slice(5,7)-1]; m.ist += br; m.L.push({name, b:br, art:"ist", d}); }
      if(y===J) for(const t of T){ if(+t.datum.slice(0,4)!==y || t.datum<=heute) continue; const m = M[+t.datum.slice(5,7)-1]; m.erw += t.betrag; m.L.push({name:t.name, b:t.betrag, art:"erw", d:t.datum}); }
      if(y===J+1){ const g = o.g/100;
        for(let i=0;i<12;i++){ const key = y+"-"+String(i+1).padStart(2,"0"); let L = T.filter(t=>t.datum.startsWith(key)), f = 1;
          if(!L.length){ L = T.filter(t=>t.datum.startsWith(J+"-"+String(i+1).padStart(2,"0"))); f = 1+g; }
          const mon = (i+1) + (12 - jetzt.getMonth());  // Monate ab heute
          const zu = o.spar ? rate*mon*rend/12 : 0;     // Dividenden aus neuen Käufen
          const fakt = f * (1 + g*Math.max(0,(mon-6))/12);
          const s = L.reduce((x,t)=>x+t.betrag,0)*fakt; M[i].prog = s + zu;
          M[i].L = L.map(t=>({name:t.name, b:t.betrag*fakt, art:"prog", d:t.datum})); if(zu>0.5) M[i].L.push({name:"neue Käufe (Sparrate)", b:zu, art:"prog"}); } }
      return M;
    };
    const zeig = () => {
      localStorage.setItem("vf_divjahr", JSON.stringify(o));
      const M = monat(o.y), sum = k => M.reduce((s,m)=>s+m[k],0), tot = sum("ist")+sum("erw")+sum("prog");
      const vor = o.y-1, Mv = jahre.includes(vor) ? monat(vor) : null, totV = Mv ? Mv.reduce((s,m)=>s+m.ist+m.erw+m.prog,0) : 0;
      const mx = Math.max(1, ...M.map(m=>m.ist+m.erw+m.prog));
      const lang = []; let v = 0; for(let k=0;k<=5;k++){ const y = J+k;
        if(k===0) v = monat(J).reduce((s,m)=>s+m.ist+m.erw,0);
        else if(k===1) v = monat(J+1).reduce((s,m)=>s+m.prog,0);
        else v = v*(1+o.g/100) + (o.spar ? rate*12*rend : 0);
        lang.push([y, v]); }
      const lmx = Math.max(...lang.map(x=>x[1]), 1);
      box.innerHTML = `<h3>Dividenden nach Jahr</h3>
        <div class="p6seg" style="margin-top:2px">${jahre.map(y=>`<a data-y="${y}" class="${y===o.y?"on":""}">${y}${y>J?" 🔮":""}</a>`).join("")}</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;align-items:baseline">
          <div><span class="sub">${o.y>J?"Prognose":o.y===J?"bekommen + erwartet":"bekommen"}</span><div class="v" style="font-size:22px;font-weight:750">${E(tot)}</div></div>
          ${o.y===J?`<div class="sub">${E(sum("ist"))} schon da · ${E(sum("erw"))} kommen noch</div>`:""}
          ${totV>1?`<div class="sub ${cls(tot-totV)}">${Pc(tot/totV-1,0,true)} zu ${vor}</div>`:""}</div>
        <div class="icl-bars" style="margin-top:8px">${M.map((m,i)=>`<div class="icl-m" data-mi="${i}"><div class="icl-st" style="height:96px">
          ${m.ist?`<i style="height:${m.ist/mx*96}px;background:var(--acc)"></i>`:""}${m.erw?`<i style="height:${m.erw/mx*96}px;background:var(--acc);opacity:.4"></i>`:""}${m.prog?`<i style="height:${m.prog/mx*96}px;background:repeating-linear-gradient(45deg,var(--acc) 0 3px,transparent 3px 6px);border:1px solid var(--acc)"></i>`:""}
          </div><span>${MON[i]}</span><small>${(m.ist+m.erw+m.prog)>=1?Math.round(m.ist+m.erw+m.prog):""}</small></div>`).join("")}</div>
        <div class="fleg" style="display:flex;gap:10px;font-size:11.5px;color:var(--mut);margin-top:6px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--acc)"></i> bekommen</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--acc);opacity:.4"></i> erwartet</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:repeating-linear-gradient(45deg,var(--acc) 0 2px,transparent 2px 4px)"></i> Prognose</span></div>
        <div id="p6-djd" class="icl-det"><div class="sub">Tipp auf einen Monat für die Einzelheiten.</div></div>
        <div style="margin-top:12px"><div class="sub" style="font-weight:600;color:var(--ink)">Ausblick bis ${J+5}</div>
          ${bars(lang.map(([y,v],k)=>[String(y), v, k?"soft":""]), v=>E(v), {werte:true, h:80})}</div>
        <div class="sl" style="margin-top:8px"><label for="dj-g">Dividendenwachstum pro Jahr</label><output>${nf(1).format(o.g)} %</output><input type="range" id="dj-g" min="0" max="12" step="0.5" value="${o.g}"></div>
        <label class="tg" style="font-size:13px"><input type="checkbox" id="dj-s" ${o.spar?"checked":""}> weiter investieren wie bisher (${E(rate)}/Monat, ${nf(1).format(rend*100)} % Dividendenrendite)</label>
        <div class="sub" style="white-space:normal;margin-top:6px">Alles vor Steuern. „Bekommen“ sind deine echten Gutschriften${a?"":" (Transaktionen importieren!)"}, „erwartet“ die angekündigten bzw. geschätzten Zahlungen deiner heutigen Positionen. Die Prognose ist eine einfache Hochrechnung: heutige Dividenden × Wachstum + Dividenden aus neuen Käufen – keine Garantie.</div>`;
      box.querySelectorAll("[data-y]").forEach(x=>x.onclick=()=>{ o.y = +x.dataset.y; zeig(); });
      box.querySelector("#dj-g").oninput = e => { o.g = +e.target.value; zeig(); };
      box.querySelector("#dj-s").onchange = e => { o.spar = e.target.checked; zeig(); };
      box.querySelectorAll("[data-mi]").forEach(x=>x.onclick=()=>{ const m = M[+x.dataset.mi]; box.querySelectorAll(".icl-m").forEach(z=>z.classList.toggle("sel", z===x));
        const L = [...m.L].sort((p,q)=>q.b-p.b);
        box.querySelector("#p6-djd").innerHTML = L.length ? `<div class="tday">${MON[+x.dataset.mi]} ${o.y} <span class="sub">${E(m.ist+m.erw+m.prog,2)}</span></div>` + L.map(l=>`<div class="kvrow"><span>${esc(l.name)}<br><span class="sub">${l.art==="ist"?"bekommen am "+dk(l.d):l.art==="erw"?"erwartet · Ex-Tag "+dk(l.d):"Prognose"}</span></span><b>${E(l.b,2)}</b></div>`).join("") : `<div class="sub">Keine Zahlungen in diesem Monat.</div>`; });
    };
    zeig(); return box;
  }
  const divAlt = PLUS.VIEWS.dividenden;
  PLUS.VIEWS.dividenden = function(){ divAlt.apply(this, arguments); try{ if(!P.depot) return; const b = divJahre(); const first = $("#main").querySelector(".box"); if(b && first) first.after(b); const nt = $("#main").querySelector(".notif"); if(nt && (P.depot.div_termine||[]).length){ nt.insertAdjacentHTML("beforeend", ` <a href="#" id="ex-ics2" style="white-space:nowrap">📅 In den Kalender</a>`); $("#ex-ics2").onclick = ev => { ev.preventDefault(); exportICS(); }; } }catch(e){ console.error(e); } };

  /* ================= Sicherheit & Schlüssel ================= */
  const b64e = buf => { const b=new Uint8Array(buf); let s=""; for(let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); return btoa(s); };
  const b64d = str => { str=String(str).replace(/\s/g,"").replace(/-/g,"+").replace(/_/g,"/"); while(str.length%4) str+="="; const bin=atob(str); return Uint8Array.from(bin, c=>c.charCodeAt(0)); };
  const keyOf = txt => crypto.subtle.importKey("raw", b64d(txt), "AES-GCM", false, ["encrypt","decrypt"]);
  async function encK(key, obj){ const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, new TextEncoder().encode(JSON.stringify(obj))); return JSON.stringify({v:1, iv:b64e(iv), ct:b64e(ct)}); }
  async function decK(key, text){ const d = JSON.parse(text); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:b64d(d.iv)}, key, b64d(d.ct)))); }
  const REPO6 = "jannis1307/value-finder", API6 = "https://api.github.com/repos/"+REPO6;
  async function ghReq(token, method, path, body){ const r = await fetch(API6+path+(method==="GET"?(path.includes("?")?"&":"?")+"ts="+Date.now():""), {method, cache:"no-store", headers:{Accept:"application/vnd.github+json", Authorization:"Bearer "+token}, body: body?JSON.stringify(body):undefined}); let j=null; try{ j = await r.json(); }catch(e){} return {status:r.status, j}; }
  const utf8b64 = s => b64e(new TextEncoder().encode(s));
  async function holen(token, path){ const r = await ghReq(token, "GET", "/contents/"+path); if(r.status!==200) throw new Error(path+": "+r.status); return {sha:r.j.sha, text:new TextDecoder().decode(b64d(r.j.content))}; }
  async function schreiben(token, path, text, sha, msg){ const r = await ghReq(token, "PUT", "/contents/"+path, {message:msg, content:utf8b64(text), sha}); if(r.status>=300) throw new Error(path+": "+r.status); return r.j.content.sha; }
  const ls = { get:k=>{ try{ const v = localStorage.getItem("vf_"+k); return v==null?null:JSON.parse(v); }catch(e){ return null; } }, set:(k,v)=>{ try{ localStorage.setItem("vf_"+k, JSON.stringify(v)); }catch(e){} } };

  function lockBox(){
    const L = PLUS.LOCK, art = L && L.status(), min = PLUS.st.get("lock_min", 5);
    if(!L) return "";
    return art ? `<div class="kvrow"><span>Status</span><b class="up">✓ aktiv (${art==="pin"?"PIN":L.bioName()})</b></div>
        <div class="kvrow" style="align-items:center"><span>Sperren nach … im Hintergrund</span><select class="inl" id="lk-min" style="width:120px">${[[1,"1 Minute"],[5,"5 Minuten"],[15,"15 Minuten"],[60,"1 Stunde"]].map(([v,l])=>`<option value="${v}" ${+min===v?"selected":""}>${l}</option>`).join("")}</select></div>
        <div class="sub" style="white-space:normal">Der Depot-Schlüssel liegt auf diesem Gerät jetzt nur noch verschlüsselt. Ohne ${art==="pin"?"deine PIN":"dein Gesicht bzw. deinen Finger"} kann niemand dein Depot öffnen – auch nicht, wer dein entsperrtes Handy in die Hand bekommt${art==="pin"?"":" (außer er kennt auch deinen Geräte-Code, denn den akzeptiert Face ID als Ersatz)"}.${art==="pin"?" Eine PIN schützt gut vor Neugierigen. Wer aber die Browser-Daten des Geräts kopieren kann, könnte eine kurze PIN durchprobieren – Face ID / Touch ID ist deutlich stärker.":""}</div>
        <div class="links"><button class="btn ghost" id="lk-aus">Sperre ausschalten</button></div><div id="lk-out"></div>`
      : `<div class="sub" style="white-space:normal">Schützt dein Depot auf diesem Gerät mit Face ID / Touch ID / Fingerabdruck (über einen Passkey) oder einer PIN. Der Schlüssel wird dann nicht mehr offen im Browser gespeichert. Auf jedem Gerät einzeln einrichten.</div>
        <div class="links"><button class="btn" id="lk-face">${L.bioName()} einrichten</button></div>
        <div class="form" style="margin-top:8px"><div class="two"><input class="inp" id="lk-pin1" type="password" inputmode="numeric" placeholder="oder PIN (6–12 Ziffern)"><input class="inp" id="lk-pin2" type="password" inputmode="numeric" placeholder="PIN wiederholen"></div></div>
        <div class="links"><button class="btn ghost" id="lk-pinset">PIN einrichten</button></div><div id="lk-out"></div>
        <div class="sub" style="white-space:normal">Wichtig: Vergisst du die PIN oder löschst den Passkey, verbindest du das Gerät einfach neu (QR-Code von einem anderen Gerät).</div>`;
  }
  function lockBind(){
    const L = PLUS.LOCK; if(!L) return;
    const o = h => { const e = $("#lk-out"); if(e) e.innerHTML = h; };
    const neu = () => { $("#lk-box").innerHTML = `<h3>🔒 App-Sperre</h3>${lockBox()}`; lockBind(); };
    const f = $("#lk-face"); if(f) f.onclick = async () => { f.disabled = true; o(`<div class="notif">⏳ Bestätige mit ${L.bioName()} …</div>`);
      try{ await L.einrichtenFaceID(); neu(); o(`<div class="notif">✓ App-Sperre mit ${L.bioName()} ist aktiv.</div>`); }catch(e){ f.disabled = false; o(`<div class="err">${esc(e.message||"Abgebrochen")}</div>`); } };
    const p = $("#lk-pinset"); if(p) p.onclick = async () => { const a = $("#lk-pin1").value, b = $("#lk-pin2").value;
      if(a!==b){ o(`<div class="err">Die PINs stimmen nicht überein.</div>`); return; }
      p.disabled = true; try{ await L.einrichtenPIN(a); neu(); o(`<div class="notif">✓ App-Sperre mit PIN ist aktiv.</div>`); }catch(e){ p.disabled = false; o(`<div class="err">${esc(e.message)}</div>`); } };
    const a = $("#lk-aus"); if(a) a.onclick = () => { if(!confirm("App-Sperre wirklich ausschalten? Der Schlüssel liegt dann wieder offen im Browser.")) return; L.aus(); neu(); };
    const m = $("#lk-min"); if(m) m.onchange = () => PLUS.st.set("lock_min", +m.value);
  }
  function renderSicherheit(){
    if(!need("Sicherheit & Schlüssel")) return;
    const neu = ls.get("key_neu"), alt = ls.get("key_alt");
    const tok = P.token, E6 = P.pf.einstellungen || {};
    const aktivSlot = E6.key_slot || "PORTFOLIO_KEY", neuSlot = aktivSlot==="PORTFOLIO_KEY" ? "PORTFOLIO_KEY_NEU" : "PORTFOLIO_KEY", altSlot = E6.key_slot_alt || "PORTFOLIO_KEY";
    $("#main").innerHTML = kopf("🔐 Sicherheit & Schlüssel", "Dein Depot ist mit AES-256 verschlüsselt. Wer den Schlüssel hat, kann es lesen. Hier tauschst du ihn aus, ohne dass jemand anderes ihn zu sehen bekommt – auch Claude nicht.") + `
      <div class="box"><h3>Wer kann was?</h3>
        <div class="kvrow"><span>Öffentliche Website & Code</span><b class="sub">nur verschlüsselte Dateien + Marktdaten</b></div>
        <div class="kvrow"><span>Push-Dienst (ntfy)</span><b class="sub">${(P.pf.einstellungen||{}).diskret===false?"⚠ sieht Push-Inhalte":"✓ sieht nur „Neue Nachricht“"}</b></div>
        <div class="kvrow"><span>Deine Geräte</span><b class="sub">Schlüssel lokal im Browser</b></div>
        <div class="kvrow"><span>GitHub-Server (Berechnung)</span><b class="sub">bekommt den Schlüssel nur als geheimes Secret während des Laufs</b></div></div>
      <div class="box"><h3>1 · Neuen Depot-Schlüssel</h3>
        ${alt && !P.keyWechselFertig ? `<div class="notif">⏳ Umgestellt. Sobald der nächste Lauf fertig ist (wenige Minuten), rechnet der Server mit dem neuen Schlüssel. Danach: altes Secret <b>${altSlot}</b> bei GitHub löschen und andere Geräte neu verbinden.<br><span class="sub" style="white-space:normal">Dauert es länger als 15 Minuten? Dann prüf, ob das Secret genau <code>${aktivSlot}</code> heißt, und trag den Schlüssel notfalls neu ein: <button class="btn ghost" id="sk-copy2" style="padding:2px 8px">Schlüssel nochmal kopieren</button></span></div>` : ""}
        ${P.keyWechselFertig ? `<div class="notif">✓ Der Server nutzt den neuen Schlüssel. Lösche jetzt bei GitHub das alte Secret <b>${altSlot}</b> (<a href="https://github.com/${REPO6}/settings/secrets/actions" target="_blank" rel="noopener">Secrets öffnen</a>) und verbinde deine anderen Geräte neu (⚙️ → Neues Gerät verbinden).</div>` : ""}
        ${alt && !P.keyWechselFertig ? "" : !neu ? `<div class="sub" style="white-space:normal">Der Schlüssel wird hier in deinem Browser gewürfelt. Danach trägst du ihn selbst bei GitHub ein. Andere Geräte musst du danach einmal neu verbinden (QR-Code).</div>
          <div class="links"><button class="btn" id="sk-gen" ${tok?"":"disabled"}>Neuen Schlüssel erzeugen</button></div>${tok?"":`<div class="err">Auf diesem Gerät fehlt der Bearbeitungs-Zugang.</div>`}`
        : `<ol style="padding-left:18px;margin:6px 0;font-size:14px;line-height:1.55">
            <li><button class="btn ghost" id="sk-copy">Neuen Schlüssel kopieren</button> <span class="sub">(nirgendwo anders speichern)</span></li>
            <li><a href="https://github.com/${REPO6}/settings/secrets/actions/new" target="_blank" rel="noopener"><b>Bei GitHub ein Secret anlegen</b></a> – Name: <code>${neuSlot}</code>, Wert: einfügen, „Add secret“. Gibt es den Namen schon, öffne <a href="https://github.com/${REPO6}/settings/secrets/actions" target="_blank" rel="noopener">die Secrets</a> und überschreib ihn mit ✏️.</li>
            <li><label class="tg"><input type="checkbox" id="sk-ok"> Erledigt, das Secret heißt ${neuSlot}</label></li></ol>
          <div class="links"><button class="btn" id="sk-go" disabled>Jetzt umstellen</button> <button class="btn ghost" id="sk-x">Abbrechen</button></div>`}
        <div id="sk-out"></div></div>
      <div class="box" id="lk-box"><h3>🔒 App-Sperre</h3>${lockBox()}</div>
      <div class="box"><h3>2 · Neuer Bearbeitungs-Zugang (Token)</h3>
        <div class="sub" style="white-space:normal">Mit dem Token speichert die App Änderungen. Der bisherige stand in deinem Chat mit Claude. Erstell selbst einen neuen <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained Token</a>: nur Repository <b>value-finder</b>, Rechte <b>Contents: Read and write</b> und <b>Actions: Read and write</b>. Füg ihn hier ein – er wird verschlüsselt gespeichert. Danach die alten Tokens löschen.</div>
        <div class="form" style="margin-top:6px"><input class="inp" id="tk-in" type="password" autocomplete="off" placeholder="github_pat_…"></div>
        <div class="links"><button class="btn" id="tk-go">Token speichern</button></div><div id="tk-out"></div></div>`;
    const out = (id, html) => { const e = $(id); if(e) e.innerHTML = html; };
    lockBind();
    const g = $("#sk-gen"); if(g) g.onclick = () => { const raw = crypto.getRandomValues(new Uint8Array(32)); ls.set("key_neu", b64e(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")); renderSicherheit(); };
    const c = $("#sk-copy"); if(c) c.onclick = async () => { try{ await navigator.clipboard.writeText(ls.get("key_neu")); c.textContent = "✓ Kopiert"; }catch(e){ prompt("Schlüssel kopieren:", ls.get("key_neu")); } };
    const c2 = $("#sk-copy2"); if(c2) c2.onclick = async () => { try{ await navigator.clipboard.writeText(P.keyText); c2.textContent = "✓ Kopiert"; }catch(e){ prompt("Schlüssel kopieren:", P.keyText); } };
    const ok = $("#sk-ok"); if(ok) ok.onchange = () => { $("#sk-go").disabled = !ok.checked; };
    const x = $("#sk-x"); if(x) x.onclick = () => { ls.set("key_neu", null); renderSicherheit(); };
    const go = $("#sk-go"); if(go) go.onclick = async () => {
      go.disabled = true; out("#sk-out", `<div class="notif">⏳ Verschlüssele neu …</div>`);
      try{
        const neuTxt = ls.get("key_neu"), kNeu = await keyOf(neuTxt), kAlt = P.key;
        const z = await holen(tok, "depot/zugang.enc"), zObj = await decK(kAlt, z.text);
        const p = await holen(tok, "depot/portfolio.enc"), pObj = await decK(kAlt, p.text);   // frischester Stand
        pObj.einstellungen = Object.assign({}, pObj.einstellungen, {schluessel_am: new Date().toISOString().slice(0,10), key_slot: neuSlot, key_slot_alt: aktivSlot});
        // Probe: lässt sich alles mit dem neuen Schlüssel wieder öffnen?
        const zNeu = await encK(kNeu, zObj), pNeu = await encK(kNeu, pObj);
        if(JSON.stringify(await decK(kNeu, pNeu)) !== JSON.stringify(pObj)) throw new Error("Probe fehlgeschlagen");
        await schreiben(tok, "depot/zugang.enc", zNeu, z.sha, "Neuer Schlüssel (Zugang)");
        P.sha = await schreiben(tok, "depot/portfolio.enc", pNeu, p.sha, "Neuer Schlüssel (Depot)");
        const warGesperrt = !!(PLUS.LOCK && PLUS.LOCK.status()); if(warGesperrt) localStorage.removeItem("vf_lock");   // Sperre gehörte zum alten Schlüssel
        ls.set("key_alt", P.keyText); ls.set("key", neuTxt); ls.set("key_neu", null);
        P.keyText = neuTxt; P.key = kNeu; P.pf = pObj; try{ localStorage.setItem("vf_pfenc", pNeu); }catch(e){}
        await ghReq(tok, "POST", "/actions/workflows/scanner.yml/dispatches", {ref:"main"});
        try{ await navigator.clipboard.writeText(""); }catch(e){}   // Schlüssel nicht in der Zwischenablage (und im iCloud-Clipboard) liegen lassen
        renderSicherheit(); out("#sk-out", `<div class="notif">✓ Umgestellt. Dieses Gerät nutzt schon den neuen Schlüssel. In ein paar Minuten rechnet auch der Server damit.${warGesperrt?" <b>Richte die App-Sperre unten bitte neu ein.</b>":""}</div>`);
      }catch(e){ out("#sk-out", `<div class="err">Hat nicht geklappt (${esc(e.message)}). Es wurde nichts kaputt gemacht – der alte Schlüssel gilt weiter.</div>`); go.disabled = false; }
    };
    $("#tk-go").onclick = async () => {
      const t = $("#tk-in").value.trim(); if(!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)){ out("#tk-out", `<div class="err">Das sieht nicht wie ein GitHub-Token aus.</div>`); return; }
      out("#tk-out", `<div class="notif">⏳ Prüfe den Token …</div>`);
      try{
        const z = await holen(t, "depot/zugang.enc"), zObj = await decK(P.key, z.text);
        zObj.token = t;
        await schreiben(t, "depot/zugang.enc", await encK(P.key, zObj), z.sha, "Neuer Bearbeitungs-Zugang");
        const d = await ghReq(t, "GET", "/actions/workflows/scanner.yml");
        P.token = t; $("#tk-in").value = "";
        P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {token_am: new Date().toISOString().slice(0,10)}); await PLUS.save("Einstellungen", true);
        out("#tk-out", `<div class="notif">✓ Gespeichert und Schreibrecht geprüft${d.status===200?" (Actions-Recht ✓)":" – ⚠ Actions-Recht fehlt, dann startet „Jetzt scannen“ nicht"}. Lösch jetzt unter <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">deinen Tokens</a> alle alten.</div>`);
      }catch(e){ out("#tk-out", `<div class="err">Der Token funktioniert nicht (${esc(e.message)}). Prüf Repository und Rechte.</div>`); }
    };
  }

  /* ================= Nächster Kauf ================= */
  // Bewertung aller Kandidaten (eigene Positionen + Merkliste) – gemeinsam für „Nächster Kauf“ und den Dividenden-Umlenker
  function kvBasis(){
    const D = P.depot, a = A(), pf = P.pf, Z = (D.positionen||[]).filter(z=>(z.wert||0)>0), V = Z.reduce((s,z)=>s+z.wert,0);
    const zi = pf.ziele || {}, isETF6 = z => z && ["ETF","MUTUALFUND"].includes(z.art);
    const grpDef = z => !z ? "Sonstiges" : z.manuell ? "Sonstiges" : isETF6(z) ? "ETFs" : z.art==="CRYPTOCURRENCY" ? "Krypto" : "Einzelaktien";
    const grp = z => (zi.gruppe||{})[z.id] || grpDef(z);
    const ist = {}; Z.forEach(z=>{ ist[grp(z)] = (ist[grp(z)]||0) + z.wert; });
    const T = zi.ziel ? Object.values(zi.ziel).reduce((s,x)=>s+(+x||0),0) || 100 : 0;
    const brOf = {}; (a?.offen||[]).forEach(o=>{ if(!brOf[o.w] || o.stk*(o.kurs||0) > brOf[o.w].v) brOf[o.w] = {b:o.br, v:o.stk*(o.kurs||0)}; });
    const gebuehr = {}; for(const [b, yy] of Object.entries(a?.gebuehren||{})){ let g=0, n=0; Object.values(yy).forEach(x=>{ g+=x.geb; n+=x.n; }); gebuehr[b] = n ? g/n : 1; }
    const zonen = (pf.alarme||[]).filter(x=>x.kaufzone);
    const bewerte = (z, s, neu) => {
      let p = 20; const R = [], N = [];
      const g = z ? grp(z) : "Einzelaktien";
      if(T && zi.ziel[g]!=null){ const istA = (ist[g]||0)/V, zielA = (+zi.ziel[g]||0)/T, gap = (zielA-istA)*100;
        if(gap>1){ p += Math.min(40, gap*4); R.push(`${g} unter Ziel (${nf(0).format(istA*100)} statt ${nf(0).format(zielA*100)} %)`); }
        else if(gap<-2){ p -= Math.min(30, -gap*4); N.push(`${g} schon über Ziel`); } }
      const ant = z ? z.wert/V : 0;
      if(ant>0.15){ p -= 25; N.push(`schon ${nf(0).format(ant*100)} % deines Depots`); }
      const zo = s && zonen.find(x=>x.t===s.t);
      if(zo && s.p){ const ab = s.p/zo.preis-1; if(ab<=0){ p += 25; R.push("in deiner Kaufzone 🎯"); } else if(ab<0.05){ p += 10; R.push(`nur ${nf(1).format(ab*100)} % über deiner Kaufzone`); } }
      const dd = s?.dd, rsi = s?.rsi ?? z?.rsi, r1m = s?.r1m, r1d = s?.r1d ?? z?.r1d;
      // Tageskurs: ein Minus ist ein etwas günstigerer Einstieg, ein großes Plus eher nicht. Hat die Börse heute noch
      // nicht gehandelt (US-Aktien vor 15:30), ist es die Bewegung vom letzten Handelstag – dann so beschriften.
      const kd = s?.datum || z?.datum, tagTxt = !kd || kd === heuteLokal() ? "heute" : new Date(kd+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short"}).replace(".","");
      if(r1d!=null && r1d<=-0.02){ p += Math.min(12, Math.round(-r1d*300)); R.push(`${tagTxt} ${Pc(r1d,1,true)}`); }
      else if(r1d!=null && r1d>=0.03){ p -= 5; N.push(`${tagTxt} schon ${Pc(r1d,1,true)}`); }
      if(dd!=null && dd<=-0.15){ p += 12; R.push(`${nf(0).format(-dd*100)} % unter dem Hoch`); }
      if(r1m!=null && r1m<-0.05){ p += 6; R.push(`${nf(0).format(r1m*100)} % im letzten Monat`); }
      if(rsi!=null && rsi<35){ p += 8; R.push(`überverkauft (RSI ${nf(0).format(rsi)})`); }
      if(rsi!=null && rsi>72){ p -= 8; N.push(`heiß gelaufen (RSI ${nf(0).format(rsi)})`); }
      if(s?.moat!=null && s.moat>=70){ p += 10; R.push(`starker Burggraben (${nf(0).format(s.moat)})`); }
      if(s?.score!=null && s.score>=60){ p += 6; R.push(`Chancen-Score ${nf(0).format(s.score)}`); }
      if(s?.upside!=null && s.upside>=0.15){ p += 5; R.push(`Analysten-Kursziel ${Pc(s.upside,0,true)}`); }
      if(z && isETF6(z)){ p += 8; R.push("breit gestreut"); }
      if(neu) N.push("neue Position");
      const name = z?.name || s?.n || s?.t, isin = z?.isin;
      const br = z?.broker || (isin && brOf[isin]?.b) || (z && isETF6(z) && /acc|thes/i.test(name||"") ? "Trade Republic" : "Scalable Capital");
      return {name, id:z?.id||null, t:z?.t||s?.t, p:Math.round(p), R, N, br, ant, neu, r1d, tagTxt};
    };
    const C = Z.map(z=>bewerte(z, z.t?BY[z.t]:null, false));
    (pf.merkliste||[]).filter(t=>BY[t] && !Z.some(z=>z.t===t)).forEach(t=>C.push(bewerte(null, BY[t], true)));
    C.sort((x,y)=>y.p-x.p);
    const minOrder = c => Math.max(50, Math.ceil(((gebuehr[c.br] ?? 1) / 0.005)/50)*50);  // Gebühr höchstens ~0,5 %
    return { C, T, gebuehr, minOrder };
  }
  function renderKaufvorschlag(){
    if(!need("Nächster Kauf")) return;
    const pf = P.pf, { C, T, gebuehr, minOrder } = kvBasis();
    const bDef = (()=>{ try{ return +localStorage.getItem("vf_kv_b") || 0; }catch(e){ return 0; } })() || 250;
    $("#main").innerHTML = kopf("🛒 Nächster Kauf", "Wohin sollte dein nächstes Geld? Ein regelbasierter Vorschlag aus deinen Zielen (Umschichten), Kaufzonen, Rücksetzern, Burggraben und Klumpenrisiko – keine Anlageberatung.") + `
      <div class="box"><div class="form"><label>Betrag<input class="inp" id="kv-b" inputmode="decimal" value="${bDef}" style="max-width:160px"></label></div><div id="kv-out"></div></div>
      <div class="box"><h3>Aktie zur Auswahl hinzufügen</h3><div class="sub" style="white-space:normal;margin-bottom:6px">Neue Kandidaten kommen auf deine Merkliste und werden ab sofort mitbewertet${(pf.merkliste||[]).length?` (gerade ${(pf.merkliste||[]).length} auf der Merkliste)`:""}.</div>
        <div class="form">${sucheHTML("kv-q","Aktie oder Ticker, z. B. Microsoft")}</div><div class="links"><button class="btn" id="kv-add">Hinzufügen</button></div><div id="kv-msg"></div></div>
      <div class="box"><h3>Diesmal eher nicht</h3>${C.filter(c=>c.N.length && !c.neu).slice(-4).reverse().map(c=>`<div class="kvrow"><span><b>${esc(c.name)}</b><br><span class="sub">${c.N.map(esc).join(" · ")}</span></span><b class="sub" style="white-space:nowrap">${c.p} P.</b></div>`).join("") || `<div class="sub">Nichts auffällig.</div>`}</div>
      ${T?"":`<div class="notif">💡 Leg unter <a href="#umschichten">Umschichten</a> deine Ziel-Verteilung fest (z. B. 70 % ETFs, 30 % Einzelaktien) – dann wird der Vorschlag deutlich besser.</div>`}`;
    const calc = () => {
      const B = toNum($("#kv-b").value) || 0; try{ localStorage.setItem("vf_kv_b", B); }catch(e){}
      const top = C.filter(c=>c.p>0).slice(0,3); if(!top.length){ $("#kv-out").innerHTML = `<div class="sub">Keine Kandidaten.</div>`; return; }
      let pick = [top[0]];
      for(const c of top.slice(1)) if(B >= minOrder(top[0]) + pick.reduce((s,x)=>s+minOrder(x),0) - minOrder(top[0]) + minOrder(c) && c.p >= top[0].p*0.6) pick.push(c);
      const ps = pick.reduce((s,c)=>s+c.p,0); let rest = B;
      const alloc = pick.map((c,i)=>{ let v = i===pick.length-1 ? rest : Math.round(B*c.p/ps/5)*5; v = Math.max(Math.min(v, rest), 0); rest -= v; return [c, v]; });
      $("#kv-out").innerHTML = alloc.map(([c,v],i)=>`<div class="kvrow" style="align-items:flex-start"><span><b>${i+1}. ${esc(c.name)}</b>${c.neu?` <span class="tag">neu</span>`:""}<br><span class="sub">${c.R.slice(0,4).map(esc).join(" · ") || "solide Basis"}<br>über ${esc(c.br)} · Gebühr ≈ ${E(gebuehr[c.br] ?? 1,2)}${v && (gebuehr[c.br]??1)/v>0.01?` (${Pc((gebuehr[c.br]??1)/v,1)} – lieber sammeln)`:""}</span></span><b style="white-space:nowrap">${E(v)}</b></div>`).join("")
        + (B < minOrder(top[0]) ? `<div class="sub" style="white-space:normal;margin-top:6px">Tipp: Bei ${E(B)} frisst die Ordergebühr viel. Ab etwa ${E(minOrder(top[0]))} pro Kauf liegt sie unter 0,5 % – oder du nimmst einen Sparplan.</div>` : "")
        + `<div class="sub" style="white-space:normal;margin-top:8px">Weitere Kandidaten: ${C.slice(pick.length, pick.length+4).map(c=>esc(c.name)+" ("+c.p+")").join(", ")}</div>`;
    };
    $("#kv-b").oninput = calc; calc();
    $("#kv-add").onclick = () => { const s = findeAktie($("#kv-q").value); if(!s){ $("#kv-msg").innerHTML = `<div class="err">Nicht im Scanner gefunden.</div>`; return; }
      merken(s.t); pf.merkliste = [...new Set([...(pf.merkliste||[]), s.t])]; renderKaufvorschlag(); toastKurz(`★ ${s.n} hinzugefügt`); };
  }

  /* ================= Quellensteuer & Steuern gesamt ================= */
  const QST = {US:[15,15,"USA",30], CH:[35,15,"Schweiz"], DK:[27,15,"Dänemark"], FI:[35,15,"Finnland"], FR:[12.8,12.8,"Frankreich",25], IT:[26,15,"Italien"], NO:[25,15,"Norwegen"],
    AT:[27.5,15,"Österreich"], SE:[30,15,"Schweden"], ES:[19,15,"Spanien"], CA:[25,15,"Kanada"], NL:[15,15,"Niederlande"], BE:[30,15,"Belgien"], GB:[0,0,"Großbritannien"],
    IE:[0,0,"Irland"], LU:[0,0,"Luxemburg"], DE:[0,0,"Deutschland"], CN:[10,10,"China"], HK:[0,0,"Hongkong"], JP:[15.315,15,"Japan"], AU:[30,15,"Australien"], BM:[0,0,"Bermuda"], KY:[0,0,"Kaimaninseln"], JE:[0,0,"Jersey"], BR:[0,0,"Brasilien"], SG:[0,0,"Singapur"], TW:[21,0,"Taiwan"], KR:[22,15,"Südkorea"], IN:[20,10,"Indien"], MX:[10,10,"Mexiko"], ZA:[20,15,"Südafrika"], PT:[25,15,"Portugal"], PL:[19,15,"Polen"]};
  function renderSteuern(){
    const a = needTx("Quellensteuer & Steuern"); if(!a) return;
    const S = a.steuern || [];
    if(!S.length){ $("#main").innerHTML = kopf("🧾 Quellensteuer & Steuern", "Die Steuer-Auswertung kommt mit dem nächsten Lauf (wenige Minuten)."); return; }
    const land = {}, jahr = {}, brj = {}; let ges = 0, qGes = 0, dGes = 0, zuviel = 0, ertrag = 0;
    const add = (o, k, f) => { o[k] = o[k] || {brutto:0, q:0, de:0, anr:0, zu:0, n:0, hoch:0, null:0}; f(o[k]); };
    for(const [d, br, art, name, isin, brutto, st] of S){
      const y = d.slice(0,4); ges += st;
      let q = 0, de = st, anr = 0, zu = 0;
      if(art==="Dividende" || art==="Zins") ertrag += brutto;
      const cc = (isin||"").slice(0,2).toUpperCase(), Q = QST[cc];
      if(art==="Dividende" && cc && cc!=="DE" && /^[A-Z]{2}/.test(cc) && !(isin||"").endsWith("-EUR")){
        const satz = Q ? Q[0]/100 : 0.15, anrS = Q ? Q[1]/100 : 0.15, maxS = Q ? (Q[3]||Q[0])/100 : 0.35;
        q = brutto>0 ? Math.min(st, (maxS+0.02)*brutto) : 0; de = st - q; anr = Math.min(q, anrS*brutto);
        zu = brutto>=1 && q > (anrS+0.03)*brutto ? q - anrS*brutto : 0;   // Cent-Rundung bei Mini-Dividenden ignorieren
        add(land, cc, o=>{ o.brutto += brutto; o.q += q; o.anr += anr; o.zu += zu; o.n++; if(brutto>=1 && q/brutto > satz+0.05) o.hoch++; if(Q && Q[0]>0 && st===0) o.null++; });
      }
      qGes += q; dGes += de; zuviel += zu;
      add(jahr, y, o=>{ o.q += q; o.de += de; o.brutto += (art==="Dividende"||art==="Zins") ? brutto : 0; o.anr += anr; o.zu += zu; });
      add(brj, br+"|"+y, o=>{ o.q += q; o.de += de; o.anr += anr; });
    }
    // anrechenbare Quellensteuer verfällt, wenn im selben Jahr beim selben Broker keine deutsche Steuer anfällt (Freistellungsauftrag)
    let verpufft = 0; Object.values(brj).forEach(o=>{ if(o.de < 0.5) verpufft += o.anr; else verpufft += Math.max(0, o.anr - o.de); });
    const geb = Object.values(a.gebuehren||{}).reduce((s,yy)=>s+Object.values(yy).reduce((t,x)=>t+x.geb+x.extra,0),0);
    const L = Object.entries(land).sort((x,y)=>y[1].q-x[1].q);
    const tipps = [];
    if(land.US && land.US.hoch) tipps.push(`🇺🇸 Bei ${land.US.hoch} US-Dividenden wurden mehr als 15 % abgezogen. Prüf in der Broker-App, ob dein W-8BEN-Formular hinterlegt ist – sonst sind es 30 % statt 15 %.`);
    if(land.FR && land.FR.hoch) tipps.push(`🇫🇷 Bei französischen Dividenden wurden mehr als 12,8 % abgezogen. Manche Broker nutzen dafür das Formular 5000 – frag deinen Broker, ob er den ermäßigten Satz direkt anwenden kann.`);
    L.filter(([cc,o])=>o.zu>=5).forEach(([cc,o])=>tipps.push(`${QST[cc]?.[2]||cc}: ${E(o.zu,2)} zu viel einbehalten (über den anrechenbaren ${nf(1).format(QST[cc]?.[1]??15)} %). Das kannst du dir von der Steuerbehörde dort zurückholen – lohnt sich meist erst ab größeren Beträgen, weil es Aufwand und Gebühren macht.`));
    if(verpufft>=1) tipps.push(`Etwa ${E(verpufft,2)} anrechenbare Quellensteuer konnten wahrscheinlich nicht angerechnet werden: Wenn dein Freibetrag die Erträge abdeckt, fällt keine deutsche Steuer an, gegen die sie gerechnet werden könnte – und sie verfällt am Jahresende.`);
    $("#main").innerHTML = kopf("🧾 Quellensteuer & Steuern", "Wie viel dir insgesamt durch Steuern weggekommen ist – aus deinen echten Buchungen.") + `
      <div class="box"><div class="p6big">
        <div><div class="sub">Steuern gesamt</div><div class="v">${E(ges,2)}</div><div class="sub">seit ${dk(P.depot.tx.seit)}</div></div>
        <div><div class="sub">davon ausländische Quellensteuer</div><div class="v">${E(qGes,2)}</div><div class="sub">${E(zuviel,2)} davon zurückholbar</div></div>
        <div><div class="sub">davon deutsche Steuer</div><div class="v">${E(dGes,2)}</div><div class="sub">Abgeltungsteuer + Soli${dGes<0?" (Minus = Erstattung)":""}</div></div></div>
        <div class="sub" style="white-space:normal;margin-top:8px">Das sind ${Pc(ertrag?ges/ertrag:null,1)} deiner ${E(ertrag)} Dividenden und Zinsen (vor Steuern). Zusammen mit ${E(geb,2)} Gebühren haben dich Steuern und Kosten ${E(ges+geb,2)} gekostet.</div></div>
      ${tipps.length?`<div class="box"><h3>Das kannst du tun</h3>${tipps.map(t=>`<div class="notif" style="margin-top:6px">${t}</div>`).join("")}</div>`:""}
      <div class="box"><h3>Nach Land</h3><table class="tbl"><tr><th>Land</th><th>Dividenden</th><th>Quellensteuer</th><th>Satz</th><th>anrechenbar</th><th>zu viel</th></tr>
        ${L.map(([cc,o])=>`<tr><td>${esc(QST[cc]?.[2]||cc)}</td><td>${E(o.brutto,2)}</td><td>${E(o.q,2)}</td><td>${Pc(o.brutto?o.q/o.brutto:null,1)}</td><td>${E(o.anr,2)}</td><td class="${o.zu>=1?"down":""}">${o.zu>=0.01?E(o.zu,2):"–"}</td></tr>`).join("") || `<tr><td colspan="6" class="sub">Keine ausländischen Dividenden.</td></tr>`}</table>
        <div class="sub" style="white-space:normal;margin-top:6px">Satz = was tatsächlich abgezogen wurde. Anrechenbar ist meist höchstens 15 % (Frankreich 12,8 %); der Rest ist nur im Ausland zurückholbar. ETFs aus Irland/Luxemburg zahlen dir keine Quellensteuer aus – die steckt schon im Fonds.${L.some(([cc,o])=>o.null)?` Bei ${L.filter(([cc,o])=>o.null).map(([cc])=>QST[cc]?.[2]||cc).join(", ")} hat dein Broker keine Steuer mitgeschickt, obwohl das Land normalerweise welche einbehält – dann steckt sie unsichtbar im Nettobetrag.`:""}</div></div>
      <div class="box"><h3>Pro Jahr</h3><table class="tbl"><tr><th>Jahr</th><th>Erträge</th><th>Quellensteuer</th><th>deutsche Steuer</th><th>gesamt</th></tr>
        ${Object.entries(jahr).sort().map(([y,o])=>`<tr><td>${y}</td><td>${E(o.brutto,2)}</td><td>${E(o.q,2)}</td><td>${E(o.de,2)}</td><td><b>${E(o.q+o.de,2)}</b></td></tr>`).join("")}</table>
        <div class="sub" style="white-space:normal;margin-top:6px">Minus = Erstattung. Nicht enthalten: Steuer auf die Vorabpauschale und Steuer-Buchungen von Trade Republic außerhalb von Käufen/Verkäufen/Dividenden (die importiert die App nicht). Schätzung, keine Steuerberatung.</div></div>`;
  }

  /* ================= Einstellungen ================= */
  const geraet = { get:(k,d)=>{ try{ const v = localStorage.getItem("vf_set_"+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
                   set:(k,v)=>{ try{ localStorage.setItem("vf_set_"+k, JSON.stringify(v)); }catch(e){} } };
  const css2 = document.createElement("style");
  css2.textContent = `
html.th-light{color-scheme:light;--bg:#f5f6f8;--card:#fff;--ink:#14191f;--mut:#677281;--line:#e4e7ec;--soft:#f0f2f5;--acc:#0e9f8a;--acc-soft:#e3f5f2;--up:#0f9d58;--down:#d93a3a;--warn:#b26a00;--warn-soft:#fff4e0;--down-soft:#fdeceb;--up-soft:#e6f6ec;--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)}
html.th-dark{color-scheme:dark;--bg:#0f1720;--card:#17212b;--ink:#e8edf2;--mut:#8b97a6;--line:#26323f;--soft:#1d2833;--acc:#2cc7ae;--acc-soft:#123a35;--up:#3ccf7e;--down:#ff6b6b;--warn:#f0a73a;--warn-soft:#3a2c14;--down-soft:#3b1d20;--up-soft:#15342a;--shadow:none}
html.p6-blur #main :is(.px,.big2,.big3,.v,.hv,.kvrow b,.tbl td:not(:first-child),.mini b,.icl-m small,.p6bars b,.dc-t,.dsum .sub,.g b){filter:blur(7px);transition:filter .15s}
.p6set .kvrow{align-items:center}.p6set select.inl{width:auto;min-width:140px}
.p6chk{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}.p6chk:last-child{border-bottom:0}`;
  document.head.appendChild(css2);
  function designSetzen(){ const t = geraet.get("design", "auto"), h = document.documentElement;
    h.classList.toggle("th-light", t==="hell"); h.classList.toggle("th-dark", t==="dunkel");
    const m = document.querySelector('meta[name="theme-color"]'); if(m) m.content = (t==="hell" || (t==="auto" && !matchMedia("(prefers-color-scheme: dark)").matches)) ? "#f5f6f8" : "#0f1720"; }
  designSetzen();
  if(geraet.get("verbergen", false)) document.documentElement.classList.add("p6-blur");
  { const start = geraet.get("start", ""); if(start && !location.hash) history.replaceState(null, "", location.pathname + location.search + "#" + start); }
  // Kopfzeile: Beträge verbergen + Einstellungen
  function kopfKnoepfe(){
    const r = document.getElementById("reload"); if(!r || document.getElementById("p6-eye")) return;
    const auge = document.createElement("button"); auge.className = "iconbtn"; auge.id = "p6-eye"; auge.title = "Beträge verbergen"; auge.setAttribute("aria-label","Beträge verbergen");
    const zeichne = () => { auge.textContent = document.documentElement.classList.contains("p6-blur") ? "🙈" : "👁"; };
    auge.onclick = () => { document.documentElement.classList.toggle("p6-blur"); zeichne(); }; zeichne();
    const rad = document.createElement("a"); rad.className = "iconbtn"; rad.href = "#einstellungen"; rad.title = "Einstellungen"; rad.setAttribute("aria-label","Einstellungen"); rad.textContent = "⚙️"; rad.style.cssText = "margin-left:6px;text-decoration:none";
    r.parentNode.insertBefore(auge, r); r.parentNode.insertBefore(rad, r); r.style.marginLeft = "6px";
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", kopfKnoepfe); else kopfKnoepfe();

  function renderEinstellungen(){
    const hatDepot = !!(P.key && P.pf);
    const e = (P.pf && P.pf.einstellungen) || {}, st = (P.pf && P.pf.steuer) || {};
    const L = PLUS.LOCK, lock = L && L.status(), bio = L ? L.bioName() : "Face ID";
    const ver = ([...document.scripts].map(s=>s.src).find(s=>/plus6\.js\?v=/.test(s))||"").split("v=")[1] || "lokal";
    const dt = s => s ? new Date(s).toLocaleDateString("de-DE") : null;
    const chk = (ok, text, rechts) => `<div class="p6chk"><span>${ok?"✅":"⬜️"}</span><span>${text}</span><span>${rechts||""}</span></div>`;
    $("#main").innerHTML = `<div class="p6set">` + kopf("⚙️ Einstellungen", "Alles Wichtige an einem Ort. „Dieses Gerät“ gilt nur hier, der Rest wird mit deinem Depot verschlüsselt gespeichert und gilt überall.") + `
      ${hatDepot?`<div class="box"><h3>📱 Geräte</h3><div class="sub" style="white-space:normal">iPhone, iPad oder ein anderer Computer: QR-Code mit der Kamera scannen, Code eintippen – fertig. Danach dort die App-Sperre einrichten.</div>
        <div class="links"><button class="btn" id="es-pair2">Neues Gerät verbinden</button></div>
        <h3 style="margin-top:14px">Verbundene Geräte</h3><div id="es-ger">${geraeteHTML()}</div></div>` + `<div id="es-wp">${hatDepot && P.pf ? pushHTML() : ""}</div>`:`<div class="box"><h3>📱 Dieses Gerät verbinden</h3><div class="sub" style="white-space:normal">Öffne auf einem schon verbundenen Gerät ⚙️ → „Neues Gerät verbinden“ und scanne den QR-Code mit der Kamera dieses Geräts.</div></div>`}
      <div class="box"><h3>Darstellung · dieses Gerät</h3>
        <div class="kvrow"><span>Design</span><select class="inl" id="es-design">${[["auto","Automatisch"],["hell","Hell"],["dunkel","Dunkel"]].map(([v,l])=>`<option value="${v}" ${geraet.get("design","auto")===v?"selected":""}>${l}</option>`).join("")}</select></div>
        <div class="kvrow"><span>Startseite</span><select class="inl" id="es-start">${[["","Chancen"],["depot","Depot"],["alarme","Alarme"],["termine","Termine"],["dividenden","Dividenden"],["heatmap","Heatmap"],["mehr","Mehr"]].map(([v,l])=>`<option value="${v}" ${geraet.get("start","")===v?"selected":""}>${l}</option>`).join("")}</select></div>
        <div class="kvrow"><span>Beträge beim Öffnen verbergen<br><span class="sub">Für unterwegs. Mit 👁 oben jederzeit umschalten.</span></span><input type="checkbox" id="es-blur" ${geraet.get("verbergen",false)?"checked":""}></div></div>
      <div class="box"><h3>Sicherheit</h3>
        ${chk(!!lock, `App-Sperre auf diesem Gerät${lock?` (${lock==="pin"?"PIN":bio})`:""}`, `<a href="#sicherheit">${lock?"ändern":"einrichten"}</a>`)}
        ${chk(!!e.schluessel_am, `Eigener Depot-Schlüssel${e.schluessel_am?` seit ${dt(e.schluessel_am)}`:" (der alte steht im Claude-Chat)"}`, `<a href="#sicherheit">${e.schluessel_am?"":"erneuern"}</a>`)}
        ${chk(!!e.token_am, `Eigener Bearbeitungs-Zugang${e.token_am?` seit ${dt(e.token_am)}`:""}`, `<a href="#sicherheit">${e.token_am?"":"erneuern"}</a>`)}
        ${chk(e.diskret!==false, "Diskrete Push-Nachrichten", `<input type="checkbox" id="es-disk" ${e.diskret!==false?"checked":""} ${hatDepot?"":"disabled"}>`)}
        ${lock?`<div class="kvrow"><span>Sperren nach … im Hintergrund</span><select class="inl" id="es-min">${[[1,"1 Minute"],[5,"5 Minuten"],[15,"15 Minuten"],[60,"1 Stunde"]].map(([v,l])=>`<option value="${v}" ${+PLUS.st.get("lock_min",5)===v?"selected":""}>${l}</option>`).join("")}</select></div>`:""}</div>
      ${hatDepot?`<div class="box"><h3>Benachrichtigungen</h3>
        <div class="links"><button class="btn ghost" id="es-push1">Kurse, Alarme, Termine, Berichte</button> <a class="btn ghost" href="#push">Insider, Zahlen, Dividenden …</a></div></div>
      <div class="box"><h3>Steuer</h3>
        <div class="kvrow"><span>Kirchensteuer (NRW 9 %)</span><input type="checkbox" id="es-ki" ${st.kirche?"checked":""}></div>
        <div class="kvrow"><span>Zusammen veranlagt (2.000 € Freibetrag)</span><input type="checkbox" id="es-vh" ${st.verheiratet?"checked":""}></div>
        <div class="links"><a href="#freistellung">Freistellungsaufträge</a> · <a href="#steuer">Steuer-Cockpit</a></div></div>`:""}
      ${hatDepot && P.depot ? exportBox() : ""}
      <div class="box"><h3>Gerät & Daten</h3>
        ${hatDepot?`<div class="links"><button class="btn ghost" id="es-pair">Weiteres Gerät verbinden</button> <button class="btn ghost" id="es-scan">Jetzt neu berechnen</button></div>`:""}
        <div class="links"><button class="btn ghost" id="es-out" style="color:var(--down)">Dieses Gerät abmelden</button></div>
        <div class="sub" style="white-space:normal">Abmelden löscht Schlüssel, Sperre und zwischengespeicherte Daten nur auf diesem Gerät – dein Depot bei GitHub bleibt unverändert. Danach brauchst du den Verbindungs-Link oder QR-Code von einem anderen Gerät.</div></div>
      <div class="sub" style="margin-top:10px">Version ${esc(String(ver))} · Marktdaten ${typeof DATA!=="undefined"&&DATA?F.dt(DATA.stand):"–"}${P.depot?` · Depot ${F.dt(P.depot.stand)}`:""}</div></div>`;
    $("#es-design").onchange = ev => { geraet.set("design", ev.target.value); designSetzen(); };
    $("#es-start").onchange = ev => geraet.set("start", ev.target.value);
    $("#es-blur").onchange = ev => { geraet.set("verbergen", ev.target.checked); document.documentElement.classList.toggle("p6-blur", ev.target.checked); const a = document.getElementById("p6-eye"); if(a) a.textContent = ev.target.checked ? "🙈" : "👁"; };
    const m = $("#es-min"); if(m) m.onchange = () => PLUS.st.set("lock_min", +m.value);
    const sync = async (msg, f) => { f(); await PLUS.save(msg, true); };
    const d = $("#es-disk"); if(d) d.onchange = () => sync("Einstellungen", () => { P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {diskret:d.checked}); });
    const ki = $("#es-ki"), vh = $("#es-vh");
    if(ki) ki.onchange = () => sync("Einstellungen", () => { P.pf.steuer = Object.assign({}, P.pf.steuer, {kirche:ki.checked}); });
    if(vh) vh.onchange = () => sync("Einstellungen", () => { P.pf.steuer = Object.assign({}, P.pf.steuer, {verheiratet:vh.checked}); });
    const p1 = $("#es-push1"); if(p1) p1.onclick = () => PLUS.settings();
    const pa = $("#es-pair"); if(pa) pa.onclick = () => PLUS.pair();
    const pa2 = $("#es-pair2"); if(pa2) pa2.onclick = () => PLUS.pair();
    const gerNeu = () => { const el = $("#es-ger"); if(el){ el.innerHTML = geraeteHTML(); geraeteBind(gerNeu); } }; geraeteBind(gerNeu);
    const wpNeu = () => { const el = $("#es-wp"); if(el && P.pf){ el.innerHTML = pushHTML(); pushBind(wpNeu); } gerNeu(); }; if(P.pf) pushBind(wpNeu);
    // Geräteliste aktuell halten: andere Geräte tragen sich selbst ein -> Stand höchstens wenige Sekunden alt
    if(P.key && P.pf && (!P.loaded || Date.now() - P.loaded > 5000) && !P.loading) PLUS.loadDepot(true);
    const sc = $("#es-scan"); if(sc) sc.onclick = () => PLUS.scanNow(false);
    exportBind();
    $("#es-out").onclick = () => { if(!confirm("Dieses Gerät wirklich abmelden? Dein Depot bleibt erhalten, du musst das Gerät danach neu verbinden.")) return;
      Object.keys(localStorage).filter(k=>/^vf_(key|key_alt|key_neu|lock|pfenc|kv_b|divjahr)/.test(k)).forEach(k=>localStorage.removeItem(k)); location.replace(location.pathname); };
  }

  /* ================= Export: Depot als CSV, Dividenden in den Kalender ================= */
  function laden(name, text, typ){
    const url = URL.createObjectURL(new Blob([text], {type:typ}));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }
  const zahl = (x, d=2) => x==null || !isFinite(x) ? "" : (+x).toFixed(d).replace(".", ",");
  const csvZ = v => { const t = String(v==null?"":v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
  function exportDepotCSV(){
    const Z = (P.depot && P.depot.positionen) || [];
    const kopfz = ["Name","ISIN","Ticker","Stück","Einstandskurs €","Kurs","Währung","Wert €","Gewinn/Verlust €","Gewinn/Verlust %","Anteil %","Dividende/Jahr €","Branche"];
    const zeilen = Z.map(z=>[z.name, z.isin, z.t, zahl(z.stk,6), zahl(z.ek,4), zahl(z.p,4), z.cur||"EUR", zahl(z.wert), zahl(z.gv), zahl(z.gv_pct!=null?z.gv_pct*100:null), zahl((z.anteil||0)*100), zahl(z.div_jahr), z.sektor]);
    laden(`depot-${new Date().toISOString().slice(0,10)}.csv`, "\ufeff"+[kopfz, ...zeilen].map(r=>r.map(csvZ).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function exportTxCSV(){
    const T = (P.pf && P.pf.transaktionen) || [];
    const kopfz = ["Datum","Broker","Typ","ISIN","Name","Stück","Kurs","Betrag €","Gebühr €","Steuer €"];
    const zeilen = [...T].sort((a,b)=>(a.d+(a.z||"")).localeCompare(b.d+(b.z||""))).map(r=>[r.d, r.br, r.typ, r.isin, r.name, zahl(r.stk,6), zahl(r.kurs,4), zahl(r.betrag), zahl(r.gebuehr), zahl(r.steuer)]);
    laden(`transaktionen-${new Date().toISOString().slice(0,10)}.csv`, "\ufeff"+[kopfz, ...zeilen].map(r=>r.map(csvZ).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function exportICS(){
    const T = (P.depot && P.depot.div_termine) || [], heute = new Date().toISOString().slice(0,10);
    const esc2 = t => String(t||"").replace(/[\\;,]/g, m=>"\\"+m).replace(/\n/g,"\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
    const ev = T.filter(t=>t.datum>=heute).map(t=>{ const d = t.datum.replace(/-/g,""), d2 = new Date(t.datum+"T12:00:00"); d2.setDate(d2.getDate()+1);
      return ["BEGIN:VEVENT", `UID:vf-${d}-${(t.t||t.name||"").replace(/[^A-Za-z0-9]/g,"")}@value-finder`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2.toISOString().slice(0,10).replace(/-/g,"")}`,
        `SUMMARY:${esc2(`💶 Ex-Tag ${t.name} (≈ ${E(t.betrag,2)})`)}`, `DESCRIPTION:${esc2(`${t.bestaetigt?"Bestätigt":"Geschätzt"} · ${F.n(t.pro_aktie, t.pro_aktie<1?3:2)} ${t.cur||""} je Aktie. Wer die Aktie am Vortag besitzt, bekommt die Dividende. Aus Value Finder.`)}`,
        "TRANSP:TRANSPARENT", "END:VEVENT"].join("\r\n"); });
    if(!ev.length){ toastKurz("Keine kommenden Dividendentermine"); return; }
    laden("dividenden.ics", ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Value Finder//DE","CALSCALE:GREGORIAN","X-WR-CALNAME:Dividenden", ...ev, "END:VCALENDAR"].join("\r\n"), "text/calendar;charset=utf-8");
    toastKurz(`${ev.length} Termine exportiert – Datei öffnen, um sie in den Kalender zu übernehmen`);
  }
  const exportBox = () => `<div class="box"><h3>📤 Daten exportieren</h3>
      <div class="links"><button class="btn ghost" id="ex-depot">Depot als Excel-Tabelle (CSV)</button> <button class="btn ghost" id="ex-tx">Transaktionen (CSV)</button> <button class="btn ghost" id="ex-ics">Dividenden in den Kalender</button></div>
      <div class="sub" style="white-space:normal">Die Datei wird nur auf diesem Gerät erstellt und ist <b>nicht verschlüsselt</b> – teile sie nicht ungewollt. Die Kalender-Datei (.ics) einfach antippen, dann fragt iPhone/Mac, ob die Termine übernommen werden sollen.</div></div>`;
  const exportBind = () => { const a = $("#ex-depot"), b = $("#ex-tx"), c = $("#ex-ics");
    if(a) a.onclick = exportDepotCSV; if(b) b.onclick = exportTxCSV; if(c) c.onclick = exportICS; };

  /* ================= Datencheck: Depot- und Transaktions-Qualität ================= */
  function ekAusTx(){
    const a = A(), g = {};
    for(const o of (a && a.offen) || []){
      const lsum = (o.lots||[]).reduce((s,l)=>s+(l[1]||0),0);
      const q = g[String(o.w||"").toUpperCase()] = g[String(o.w||"").toUpperCase()] || {k:0, st:0, stk:0, voll:true, kurs:o.kurs, name:o.name};
      q.stk += o.stk||0; if(lsum < (o.stk||0)*0.98) q.voll = false;
      for(const [, st, k] of o.lots||[]) if(st && k){ q.k += st*k; q.st += st; }
    }
    for(const w in g){ const q = g[w]; q.ek = q.st>1e-9 && q.voll ? q.k/q.st : null; }
    return g;
  }
  function datenQualitaet(){
    const out = [], heute = new Date().toISOString().slice(0,10), S = DATA.stocks||[];
    const row = (ok, t, d, extra="") => `<div class="ev"><b>${ok?"✅":"⚠️"} ${t}</b>${d?`<div class="sub" style="white-space:normal">${d}</div>`:""}${extra}</div>`;
    // Marktdaten
    const divX = S.filter(s=>s.div!=null && s.div>0.15), r1yX = S.filter(s=>s.r1y!=null && (s.r1y>4 || s.r1y<-0.95)),
      p0 = S.filter(s=>!(s.p>0)), mc0 = S.filter(s=>s.mcap==null), spr = S.filter(s=>s.r1d!=null && Math.abs(s.r1d)>0.4);
    out.push(row(!divX.length && !p0.length, divX.length||p0.length ? "Auffällige Marktdaten" : "Dividendenrenditen und Kurse plausibel",
      [divX.length?`Dividendenrendite über 15 %: ${divX.map(s=>`${esc(s.n)} (${Pc(s.div,1)})`).join(", ")}.`:"",
       p0.length?`Ohne gültigen Kurs: ${p0.map(s=>esc(s.n)).join(", ")}.`:"",
       `Geprüft: ${S.length} Aktien · Rendite über 15 % gilt als Datenfehler, Kurs muss größer 0 sein.`].filter(Boolean).join(" ")));
    if(r1yX.length || spr.length) out.push(row(true, `${r1yX.length+spr.length} extreme Bewegungen (echt, aber auffällig)`,
      [r1yX.length?`1 Jahr über +400 % oder unter −95 %: ${r1yX.map(s=>`${esc(s.n)} ${Pc(s.r1y,0,true)}`).join(", ")}.`:"",
       spr.length?`Heute mehr als ±40 %: ${spr.map(s=>`${esc(s.n)} ${Pc(s.r1d,0,true)}`).join(", ")}.`:""].filter(Boolean).join(" ")+" Solche Werte sind meist echt (Übernahme, Zahlen, Aktiensplit), lohnen aber einen zweiten Blick."));
    if(mc0.length) out.push(row(mc0.length<S.length*0.02, `${mc0.length} Aktien ohne Börsenwert`, mc0.slice(0,12).map(s=>esc(s.n)).join(", ")+". Sie fallen bei Größen-Filtern heraus, der Rest der Auswertung stimmt."));
    if(!P.depot || !P.pf) return {html: out.join(""), fix: []};

    // Depot
    const D = P.depot, Z = D.positionen||[], tx = ekAusTx(), fix = [];
    const pfPos = P.pf.positionen||[];
    const ekRows = [];
    for(const p of pfPos){
      if(p.manuell!=null) continue;
      const q = tx[String(p.isin||"").toUpperCase()]; if(!q || q.ek==null || !(p.stk>0)) continue;
      if(Math.abs(q.stk - p.stk) > Math.max(0.02*p.stk, 0.001)) continue;
      const ek = +p.ek || null, abw = ek ? q.ek/ek - 1 : null;
      if(ek==null || Math.abs(abw) > 0.15){ fix.push({id:p.id, ek:+q.ek.toFixed(4)}); ekRows.push(`${esc(p.name||p.t)}: ${ek?`${E(ek,2)} eingetragen`:"kein Einstandskurs"} → laut Käufen ${E(q.ek,2)}`); }
    }
    out.push(row(!fix.length, fix.length?`${fix.length} Einstandskurs${fix.length>1?"e passen":" passt"} nicht zu deinen Käufen`:"Einstandskurse passen zu deinen Käufen",
      fix.length ? ekRows.join(" · ")+". Ein falscher Einstandskurs verfälscht Gewinn/Verlust, Steuer-Rechner und Rendite." : "Verglichen mit dem Durchschnitt deiner noch offenen Käufe (FIFO, inkl. Gebühren). Kleine Unterschiede (Gebühren, Rundung) sind normal.",
      fix.length ? `<div class="links" style="margin-top:6px"><button class="btn" id="dq-ek">Einstandskurse aus Käufen übernehmen</button></div>` : ""));

    const stkRows = [];
    for(const p of pfPos){
      if(p.manuell!=null || !(p.stk>0)) continue;
      const q = tx[String(p.isin||"").toUpperCase()]; if(!q) continue;
      if(Math.abs(q.stk - p.stk) > Math.max(0.02*p.stk, 0.001)) stkRows.push(`${esc(p.name||p.t)}: Depot ${F.n(p.stk,4)} · Transaktionen ${F.n(q.stk,4)}`);
    }
    const isins = new Set(pfPos.map(p=>String(p.isin||"").toUpperCase()));
    const fehlt = Object.entries(tx).filter(([w,q])=>!isins.has(w) && !w.endsWith("-EUR") && q.stk*(q.kurs||q.ek||0) >= 1).map(([w,q])=>`${esc(q.name||w)} (${F.n(q.stk,3)} Stk.)`);
    out.push(row(!stkRows.length && !fehlt.length, stkRows.length||fehlt.length ? "Stückzahlen weichen von den Transaktionen ab" : "Stückzahlen stimmen mit den Transaktionen überein",
      [stkRows.join(" · "), fehlt.length?`Laut Transaktionen noch im Bestand, aber nicht im Depot: ${fehlt.join(", ")}.`:"",
       stkRows.length||fehlt.length?"Häufigste Ursache: Der letzte Transaktions-Export ist älter als der Depot-Stand, oder es gab einen Split/Übertrag.":"Krypto-Reste unter 1 € und manuell bewertete Positionen (Anleihen, ELTIF) werden nicht verglichen."].filter(Boolean).join(" ")));

    const ohneKurs = Z.filter(z=>!z.manuell && z.p==null), alt = Z.filter(z=>!z.manuell && z.datum && (Date.now()-new Date(z.datum))/864e5>5),
      unpl = Z.filter(z=>!z.manuell && z.gv_pct!=null && (z.gv_pct>3 || z.gv_pct<-0.9));
    // manuell bewertete Positionen (Anleihen, ELTIF): Wert gegen Kaufwert laut Transaktionen
    const manX = pfPos.filter(p=>p.manuell!=null).map(p=>{ const q = tx[String(p.isin||"").toUpperCase()]; const kw = q && q.ek ? q.st*q.ek : (+p.einstand||null);
      return kw && kw>5 && (p.manuell/kw < 0.5 || p.manuell/kw > 2) ? `${esc(p.name)}: ${E(p.manuell,2)} eingetragen, gekauft für ${E(kw,2)}` : null; }).filter(Boolean);
    out.push(row(!ohneKurs.length && !alt.length && !unpl.length && !manX.length, ohneKurs.length||alt.length||unpl.length||manX.length ? "Depot-Positionen prüfen" : `Alle ${Z.length} Depot-Positionen mit aktuellem Kurs`,
      [ohneKurs.length?`Ohne Kurs: ${ohneKurs.map(z=>esc(z.name)).join(", ")}.`:"", alt.length?`Kurs älter als 5 Tage: ${alt.map(z=>`${esc(z.name)} (${dk(z.datum)})`).join(", ")}.`:"",
       unpl.length?`Unplausibler Gewinn/Verlust: ${unpl.map(z=>`${esc(z.name)} ${Pc(z.gv_pct,0,true)}`).join(", ")} – meist ein falscher Einstandskurs.`:"",
       manX.length?`Selbst eingetragener Wert weicht stark vom Kaufwert ab: ${manX.join(" · ")}. Das kann stimmen (z. B. Kurssturz, Teil-Rückzahlung) – bitte mit dem Wert in deiner Broker-App vergleichen und ggf. unter „Bearbeiten“ korrigieren.`:""].filter(Boolean).join(" ")));

    // Transaktionen
    const T = P.pf.transaktionen||[];
    if(T.length){
      const sig = r => [r.br,r.d,r.z,r.isin,r.typ,r.stk,r.betrag].join("|"), seen = {}; let dup = 0;
      for(const r of T){ const k = sig(r); if(seen[k]) dup++; seen[k] = 1; }
      const zuk = T.filter(r=>r.d && r.d>heute).length, ohneIsin = T.filter(r=>/BUY|SELL|Buy|Sell|Savings/.test(r.typ||"") && !r.isin).length;
      const brs = {}; for(const r of T){ const b = r.br||"?"; const x = brs[b] = brs[b]||{n:0, max:""}; x.n++; if(r.d>x.max) x.max = r.d; }
      const altB = Object.entries(brs).filter(([,x])=>(Date.now()-new Date(x.max))/864e5>45);
      out.push(row(!dup && !zuk && !ohneIsin, dup||zuk||ohneIsin ? "Auffällige Transaktionen" : `${T.length} Transaktionen ohne Doppelte oder Fehler`,
        [Object.entries(brs).map(([b,x])=>`${esc(b)}: ${x.n} Buchungen bis ${dk(x.max)}`).join(" · ")+".", dup?`${dup} mögliche Doppelbuchung${dup>1?"en":""}.`:"", zuk?`${zuk} Buchung${zuk>1?"en":""} mit Datum in der Zukunft.`:"", ohneIsin?`${ohneIsin} Käufe/Verkäufe ohne ISIN.`:""].filter(Boolean).join(" ")));
      if(altB.length) out.push(row(false, "Transaktions-Export veraltet", `${altB.map(([b,x])=>`${esc(b)} (letzte Buchung ${dk(x.max)})`).join(", ")}. Für aktuelle Gebühren-, Steuer- und Einstandsauswertungen einen neuen CSV-Export importieren.`, `<div class="links" style="margin-top:6px"><button class="btn" id="dq-imp">Transaktionen importieren</button></div>`));
    }
    const vergangen = (D.div_termine||[]).filter(t=>t.datum<heute).length;
    if(vergangen) out.push(row(false, `${vergangen} Dividendentermine liegen in der Vergangenheit`, "Wird beim nächsten Lauf automatisch aktualisiert."));
    return {html: out.join(""), fix};
  }
  const dcAlt = PLUS.VIEWS.datencheck;
  PLUS.VIEWS.datencheck = function(){
    dcAlt.apply(this, arguments);
    try{
      const {html, fix} = datenQualitaet();
      const box = document.createElement("div"); box.className = "box"; box.innerHTML = `<h3>Datenqualität im Detail</h3>${html}`;
      const m = document.getElementById("main"); m.classList.add("p6v"); m.appendChild(box);
      const b = document.getElementById("dq-ek");
      if(b) b.onclick = async () => {
        if(!confirm(`${fix.length} Einstandskurs${fix.length>1?"e":""} aus deinen Käufen übernehmen? Der alte Wert wird überschrieben.`)) return;
        b.disabled = true;
        for(const f of fix){ const p = (P.pf.positionen||[]).find(x=>x.id===f.id); if(p) p.ek = f.ek; }
        if(await PLUS.save("Einstandskurse korrigiert")) toastKurz("Gespeichert – das Depot wird neu berechnet");
        b.disabled = false;
      };
      const im = document.getElementById("dq-imp"); if(im) im.onclick = () => PLUS2.txImport();
    }catch(e){ console.error(e); }
  };

  /* ================= Verbundene Geräte ================= */
  // Jedes Gerät trägt sich (verschlüsselt) in pf.geraete ein. „Entfernen“ meldet es beim nächsten Öffnen ab und
  // löscht dort den Schlüssel. Gegen eine heimlich kopierte Schlüssel-Kopie hilft nur ein neuer Schlüssel.
  const heute = () => new Date().toISOString().slice(0,10);
  function geraetId(){ let id = localStorage.getItem("vf_dev_id");
    if(!id){ id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b=>b.toString(16).padStart(2,"0")).join(""); try{ localStorage.setItem("vf_dev_id", id); }catch(e){} }
    return id; }
  const istApp = () => !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
  function geraetName(){
    const u = navigator.userAgent, touch = navigator.maxTouchPoints > 1;
    const typ = /iPhone/.test(u) ? "iPhone" : (/iPad/.test(u) || (/Macintosh/.test(u) && touch)) ? "iPad" : /Android/.test(u) ? (/Mobile/.test(u) ? "Android-Handy" : "Android-Tablet")
      : /Macintosh/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows-PC" : /Linux/.test(u) ? "Linux-PC" : "Gerät";
    const br = /Edg\//.test(u) ? "Edge" : /Firefox|FxiOS/.test(u) ? "Firefox" : /Chrome|CriOS/.test(u) ? "Chrome" : /Safari/.test(u) ? "Safari" : "Browser";
    return typ + " · " + (istApp() ? "App-Symbol" : br);
  }
  function abmelden(grund){
    for(const k of Object.keys(localStorage)) if(k.startsWith("vf_") && !k.startsWith("vf_set_")) localStorage.removeItem(k);
    try{ sessionStorage.setItem("vf_abgemeldet", grund || "1"); }catch(e){}
    location.replace(location.pathname + "#depot"); location.reload();
  }
  try{ const g = sessionStorage.getItem("vf_abgemeldet"); if(g){ sessionStorage.removeItem("vf_abgemeldet");
    setTimeout(()=>toastKurz(g==="entfernt" ? "Dieses Gerät wurde aus deinem Depot entfernt." : "Dieses Gerät ist abgemeldet."), 800); } }catch(e){}
  let gerMeld = false;
  async function geraetMelden(){
    if(!P.pf || !P.key) return;
    const id = geraetId(), G = P.pf.geraete || {}, ich = G[id];
    if(ich && ich.entfernt) return abmelden("entfernt");
    if(gerMeld || !P.token) return;
    const sperre = (PLUS.LOCK && PLUS.LOCK.status()) || "keine";
    const neu = {name: (ich && ich.eigen) ? ich.name : geraetName(), eigen: !!(ich && ich.eigen), sperre, seit: (ich && ich.seit) || heute(), zuletzt: heute()};
    if(sperre === "faceid") neu.bio = PLUS.LOCK.bioName();   // „Face ID“ oder „Touch ID“ – so, wie dieses Gerät es nennt
    let abo = ich && ich.push;
    try{ if(ich && ich.push && pushGeht() && Notification.permission === "granted"){ const a = await pushAbo(false); if(a && a.endpoint !== ich.push.endpoint) abo = a; } }catch(e){}
    if(abo) neu.push = abo;
    if(ich && ich.zuletzt === neu.zuletzt && ich.sperre === neu.sperre && ich.name === neu.name && ich.bio === neu.bio && (abo||{}).endpoint === ((ich.push||{}).endpoint)) return;
    gerMeld = true;
    P.pf.geraete = Object.assign({}, G, {[id]: neu});
    await PLUS.save("Gerät gemeldet", true, true);   // höchstens einmal am Tag, Datum ohne Uhrzeit
    if(location.hash.slice(1).split(/[?&]/)[0] === "einstellungen" && document.getElementById("es-ger")) PLUS.VIEWS.einstellungen();
  }
  const al2 = PLUS2.afterLoad;
  PLUS2.afterLoad = function(){ const r = al2.apply(this, arguments); setTimeout(()=>geraetMelden().catch(()=>{}), 2500); return r; };

  function geraeteHTML(){
    const G = (P.pf && P.pf.geraete) || {}, id = geraetId(), h = heute();
    const tage = d => { if(!d) return "–"; const n = Math.round((new Date(h) - new Date(d))/864e5); return n<=0 ? "heute" : n===1 ? "gestern" : `vor ${n} Tagen`; };
    const sp = (s, g) => s==="faceid" ? `<span class="up">🔒 ${esc((g && g.bio) || "Face ID / Touch ID")}</span>` : s==="pin" ? `<span class="up">🔒 PIN</span>` : `<span class="down">⚠ keine Sperre</span>`;
    const L = Object.entries(G).filter(([,g])=>!g.versteckt).sort((a,b)=>(a[0]===id?-1:b[0]===id?1:0) || String(b[1].zuletzt).localeCompare(String(a[1].zuletzt)));
    if(!L.length) return `<div class="sub" style="white-space:normal;margin:6px 0">Noch keine Geräte gemeldet. Jedes Gerät erscheint hier, sobald es die App einmal öffnet.</div>`;
    return L.map(([k,g])=>`<div class="kvrow" style="align-items:center;${g.entfernt?"opacity:.55":""}"><span><b>${esc(g.name||"Gerät")}</b>${k===id?' <span class="sub" style="border:1px solid var(--line);border-radius:999px;padding:1px 8px">dieses Gerät</span>':""}<br>
        <span class="sub">${g.entfernt ? `entfernt ${tage(g.entfernt)} – wird beim nächsten Öffnen abgemeldet` : `${sp(g.sperre, g)}${g.push?" · 🔔":""} · zuletzt ${tage(g.zuletzt)} · seit ${dk(g.seit)}`}</span></span>
        <span style="white-space:nowrap">${g.entfernt ? `<button class="btn ghost" data-gx="${k}" data-ga="weg">Aus Liste löschen</button>`
          : `<button class="btn ghost" data-gx="${k}" data-ga="name" title="Umbenennen">✏️</button> <button class="btn ghost" data-gx="${k}" data-ga="${k===id?"ab":"raus"}">${k===id?"Abmelden":"Entfernen"}</button>`}</span></div>`).join("")
      + `<div class="sub" style="white-space:normal;margin-top:6px">„Entfernen“ meldet das Gerät beim nächsten Öffnen ab und löscht dort den Schlüssel. Ist ein Gerät gestohlen oder hat jemand deinen Schlüssel kopiert (Foto vom QR-Code, Link), hilft nur ein <a href="#sicherheit">neuer Schlüssel</a> – dann sind alle alten Kopien wertlos. Geräte, die die App seit diesem Update noch nicht geöffnet haben, fehlen hier noch.</div>`;
  }
  function geraeteBind(neuZeichnen){
    document.querySelectorAll("[data-gx]").forEach(b => b.onclick = async () => {
      const k = b.dataset.gx, a = b.dataset.ga, G = Object.assign({}, P.pf.geraete || {}), g = G[k]; if(!g) return;
      if(a === "ab"){ if(confirm("Dieses Gerät abmelden? Der Schlüssel wird hier gelöscht – zum erneuten Verbinden brauchst du ein anderes verbundenes Gerät.")){
          G[k] = Object.assign({}, g, {entfernt: heute()}); P.pf.geraete = G; await PLUS.save("Gerät abgemeldet", true, true); abmelden("ab"); } return; }
      if(a === "name"){ const n = prompt("Name für dieses Gerät:", g.name || ""); if(!n || !n.trim()) return; G[k] = Object.assign({}, g, {name: n.trim().slice(0,40), eigen: true}); }
      else if(a === "raus"){ if(!confirm(`„${g.name}“ entfernen? Es wird beim nächsten Öffnen abgemeldet.`)) return; G[k] = Object.assign({}, g, {entfernt: heute()}); }
      else if(a === "weg"){ G[k] = Object.assign({}, g, {versteckt: true}); }   // nicht löschen: sonst könnte sich ein noch nicht abgemeldetes Gerät neu eintragen
      P.pf.geraete = G; b.disabled = true;
      if(await PLUS.save("Geräte aktualisiert", true)) neuZeichnen(); else b.disabled = false;
    });
  }

  /* ================= Mitteilungen (Web Push über Safari/Chrome) ================= */
  // Server-Schlüssel (VAPID): wird einmalig hier im Browser erzeugt. Der private Teil geht nur als
  // GitHub-Secret VAPID_PRIVATE an den Server, der öffentliche liegt verschlüsselt im Depot.
  const vapidPub = () => { const e = (P.pf && P.pf.einstellungen) || {}; return e.vapid_ok && e.vapid_pub ? e.vapid_pub : null; };
  let vapidNeu = null;   // {priv, pub} nur bis zum Neuladen im Speicher
  const pushGeht = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const u8 = s => { s = s.replace(/-/g,"+").replace(/_/g,"/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); };
  async function pushAbo(neu){
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub && neu) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: u8(vapidPub())});
    if(!sub) return null;
    const j = sub.toJSON(); return {endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth};
  }
  function pushHTML(){
    const ich = ((P.pf && P.pf.geraete) || {})[geraetId()] || {}, an = !!ich.push, inhalt = ((P.pf||{}).einstellungen||{}).push_inhalt || "voll";
    const iosSafari = (/iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !istApp();   // iPadOS meldet sich als Mac
    let zustand;
    if(!pushGeht()) zustand = iosSafari ? `<div class="notif">Auf iPhone/iPad gehen Mitteilungen nur in der <b>App vom Home-Bildschirm</b> (Teilen → „Zum Home-Bildschirm“, iOS 16.4 oder neuer). Öffne die App über das Symbol und schalte sie dort ein.</div>`
      : `<div class="sub">Dieser Browser unterstützt keine Mitteilungen.</div>`;
    else if(Notification.permission === "denied") zustand = `<div class="err">Mitteilungen sind für diese App blockiert. iPhone: Einstellungen → Mitteilungen → Value Finder → „Mitteilungen erlauben“. Danach hier nochmal tippen.</div>
      <div class="links"><button class="btn" id="wp-an">Nochmal versuchen</button></div>`;
    else zustand = an ? `<div class="kvrow"><span>Status</span><b class="up">✓ an auf diesem Gerät</b></div><div class="links"><button class="btn ghost" id="wp-aus">Ausschalten</button></div>`
      : `<div class="links"><button class="btn" id="wp-an">🔔 Mitteilungen einschalten</button></div>`;
    if(!vapidPub()){
      const e = (P.pf && P.pf.einstellungen) || {};
      return `<div class="box"><h3>🔔 Mitteilungen einrichten (einmalig)</h3>
        <div class="sub" style="white-space:normal;margin-bottom:6px">Damit der Server dir Mitteilungen schicken darf, braucht er einen eigenen Schlüssel. Der wird jetzt hier in deinem Browser erzeugt – niemand sonst sieht ihn. Das musst du nur einmal machen, nicht pro Gerät.</div>
        ${!vapidNeu ? `<div class="links"><button class="btn" id="wv-gen" ${P.token?"":"disabled"}>Schlüssel erzeugen</button></div>`
        : `<ol style="padding-left:18px;margin:6px 0;font-size:14px;line-height:1.6">
            <li><button class="btn ghost" id="wv-copy">Schlüssel kopieren</button> <span class="sub">(nirgendwo sonst speichern)</span></li>
            <li><a href="https://github.com/${REPO6}/settings/secrets/actions/new" target="_blank" rel="noopener"><b>Bei GitHub ein Secret anlegen</b></a> – Name: <code>VAPID_PRIVATE</code>, Wert: einfügen, „Add secret“.</li>
            <li><label class="tg"><input type="checkbox" id="wv-ok"> Erledigt</label></li></ol>`}
        <div id="wp-out"></div></div>`;
    }
    return `<div class="box"><h3>🔔 Mitteilungen auf diesem Gerät</h3>
      <div class="sub" style="white-space:normal;margin-bottom:6px">Kursalarme, Dividenden und Termine direkt als Mitteilung – ohne Zusatz-App. Der Inhalt ist Ende-zu-Ende verschlüsselt: Apple bzw. Google leiten nur Datensalat weiter.</div>
      ${zustand}
      ${pushGeht() ? `<div class="kvrow" style="align-items:center"><span>Auf dem Sperrbildschirm zeigen</span><select class="inl" id="wp-inh" style="width:170px">
        <option value="voll" ${inhalt!=="diskret"?"selected":""}>Ganze Nachricht</option><option value="diskret" ${inhalt==="diskret"?"selected":""}>Nur „Neue Nachricht“</option></select></div>` : ""}
      <div id="wp-out"></div></div>`;
  }
  function pushBind(neuZeichnen){
    const out = t => { const o = $("#wp-out"); if(o) o.innerHTML = t; };
    const gen = $("#wv-gen"); if(gen) gen.onclick = async () => {
      gen.disabled = true;
      try{
        const k = await crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, true, ["sign","verify"]);
        const jwk = await crypto.subtle.exportKey("jwk", k.privateKey), raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
        vapidNeu = {priv: jwk.d, pub: btoa(String.fromCharCode(...raw)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")};
        P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {vapid_pub: vapidNeu.pub, vapid_ok: false});
        if(!(await PLUS.save("Mitteilungen vorbereitet", true, true))){ vapidNeu = null; gen.disabled = false; return; }
        neuZeichnen();
      }catch(e){ out(`<div class="err">Ging nicht (${esc(e.message||e)}).</div>`); gen.disabled = false; }
    };
    const cp = $("#wv-copy"); if(cp) cp.onclick = async () => { try{ await navigator.clipboard.writeText(vapidNeu.priv); toastKurz("Kopiert – jetzt bei GitHub einfügen"); }catch(e){ prompt("Kopieren:", vapidNeu.priv); } };
    const ok = $("#wv-ok"); if(ok) ok.onchange = async () => { if(!ok.checked) return;
      P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {vapid_ok: true}); vapidNeu = null;
      if(await PLUS.save("Mitteilungen eingerichtet", true, true)){ toastKurz("✓ Eingerichtet – jetzt Mitteilungen einschalten"); neuZeichnen(); } };
    const an = $("#wp-an"); if(an) an.onclick = async () => {
      an.disabled = true;
      try{
        const p = await Notification.requestPermission();   // muss direkt im Tippen passieren (iOS)
        if(p !== "granted"){ out(`<div class="err">Nicht erlaubt. iPhone: Einstellungen → Mitteilungen → Value Finder.</div>`); an.disabled = false; return; }
        const abo = await pushAbo(true); if(!abo) throw new Error("kein Abo");
        const G = Object.assign({}, P.pf.geraete || {}), id = geraetId();
        G[id] = Object.assign({name: geraetName(), sperre: (PLUS.LOCK && PLUS.LOCK.status()) || "keine", seit: heute(), zuletzt: heute()}, G[id] || {}, {push: abo});
        P.pf.geraete = G;
        if(await PLUS.save("Mitteilungen an", true, true)){ toastKurz("✓ Eingeschaltet – in wenigen Minuten kommt eine Test-Mitteilung"); neuZeichnen(); }
      }catch(e){ out(`<div class="err">Einschalten ging nicht (${esc(e.message||e)}).</div>`); }
      an.disabled = false;
    };
    const aus = $("#wp-aus"); if(aus) aus.onclick = async () => {
      try{ const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if(sub) await sub.unsubscribe(); }catch(e){}
      const G = Object.assign({}, P.pf.geraete || {}), id = geraetId(); if(G[id]){ G[id] = Object.assign({}, G[id]); delete G[id].push; }
      P.pf.geraete = G; if(await PLUS.save("Mitteilungen aus", true, true)){ toastKurz("Mitteilungen ausgeschaltet"); neuZeichnen(); }
    };
    const inh = $("#wp-inh"); if(inh) inh.onchange = async ev => {
      P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {push_inhalt: ev.target.value}); await PLUS.save("Mitteilungen", true); };
  }

  /* ================= Dividenden-Umlenker ================= */
  // Dividenden nicht automatisch in dieselbe Aktie zurück, sondern gezielt dorthin, wo das Depot es braucht.
  // Topf = netto erhaltene Dividenden (aus deinen Transaktionen) seit dem letzten Anlegen; Ziel je Broker wird gespeichert
  // und vom Server für die Push am Ex-Tag benutzt.
  function renderUmlenker(){
    if(!need("Dividenden-Umlenker")) return;
    const D = P.depot, pf = P.pf, a = A(), um = pf.umlenker || {}, heuteS = new Date().toISOString().slice(0,10);
    const Z = (D.positionen||[]).filter(z=>(z.wert||0)>0), V = Z.reduce((s,z)=>s+z.wert,0) || 1, byId = Object.fromEntries(Z.map(z=>[z.id,z]));
    const brOf = z => (z && (z.broker || ((pf.positionen||[]).find(p=>p.id===z.id)||{}).broker)) || "Ohne Broker";
    const anlegbar = z => z && !z.manuell && z.t && ["EQUITY","ETF","MUTUALFUND"].includes(z.art||"EQUITY");
    // 1) Herkunft: Dividenden der letzten 12 Monate je Position (in Euro)
    const I = (D.div_info||[]).filter(i=>i.jahr>0 && byId[i.id]).map(i=>({...i, z:byId[i.id], br:i.broker || brOf(byId[i.id])})).sort((x,y)=>y.jahr-x.jahr);
    const S = I.reduce((s,i)=>s+i.jahr,0);
    const brJahr = {}; I.forEach(i=>brJahr[i.br] = (brJahr[i.br]||0) + i.jahr);
    const top = I[0], klumpen = top && top.z.wert/V >= 0.10 && top.jahr/S >= 0.3;
    // 2) Topf je Broker aus den Transaktionen
    const buch = a ? (a.steuern||[]).filter(x=>x[2]==="Dividende").map(x=>({d:x[0], br:x[1], name:x[3], netto:Math.max(0,(x[5]||0) - Math.max(0,x[6]||0))})) : [];
    const letzteBuchung = a ? [...(a.steuern||[]).map(x=>x[0]), ...(a.kaufzeit||[]).map(x=>x.d)].sort().pop() : null;
    const seitAuto = br => { const k = (a?.kaufzeit||[]).filter(x=>x.br===br && !x.sp).map(x=>x.d).sort().pop(); return k || heuteS.slice(0,8)+"01"; };
    const seit = br => ((um.angelegt||{})[br] && (um.angelegt||{})[br] > seitAuto(br)) ? um.angelegt[br] : seitAuto(br);
    const bald = {}; const in30 = new Date(Date.now()+30*864e5).toISOString().slice(0,10);
    (D.div_termine||[]).filter(t=>t.datum>=heuteS && t.datum<=in30 && byId[t.id]).forEach(t=>{ const br = brOf(byId[t.id]); (bald[br] = bald[br] || []).push(t); });
    const broker = [...new Set([...Object.keys(brJahr), ...buch.map(x=>x.br), ...Object.keys(bald)])].filter(b=>b && b!=="Ohne Broker");
    const { C, gebuehr, minOrder } = kvBasis();
    const zielVon = br => { const gew = (um.ziel||{})[br]; if(gew && gew!=="auto" && byId[gew]) return byId[gew];
      if(gew==="auto"){ const k = Z.filter(z=>brOf(z)===br && anlegbar(z) && z.wert/V < 0.15 && z.r1d!=null).sort((x,y)=>x.r1d-y.r1d)[0]; if(k) return k; }  // wie der Server
      const c = C.find(c=>c.br===br && c.id && anlegbar(byId[c.id]) && !(top && klumpen && c.id===top.id)); return c ? byId[c.id] : null; };

    // 3) 10-Jahres-Vergleich: automatisch wieder anlegen vs. umlenken (vereinfachtes Modell)
    const sim = (umlenken) => { const W = {}, Y = {}; Z.forEach(z=>{ W[z.id] = z.wert; const i = I.find(i=>i.id===z.id); Y[z.id] = i && z.wert ? i.jahr/z.wert : 0; });
      let div = 0;
      for(let j=0;j<10;j++){ const zufluss = {}; div = 0;
        for(const z of Z){ const d = W[z.id]*Y[z.id]; div += d; const ziel = umlenken ? zielVon(brOf(z)) : null;
          const wohin = ziel && anlegbar(z) ? ziel.id : z.id; zufluss[wohin] = (zufluss[wohin]||0) + d; W[z.id] *= z.art==="CRYPTOCURRENCY" || z.manuell ? 1 : 1.06; }
        for(const [id, d] of Object.entries(zufluss)) W[id] = (W[id]||0) + d; }
      const ges = Object.values(W).reduce((s,v)=>s+v,0); return { ges, div, topA: top ? W[top.id]/ges : null }; };
    const sa = sim(false), su = sim(true);

    const zeile = (l, r) => `<div class="kvrow"><span>${l}</span><b style="white-space:nowrap">${r}</b></div>`;
    $("#main").innerHTML = kopf("♻️ Dividenden-Umlenker", "Statt Dividenden automatisch in dieselbe Aktie zurückfließen zu lassen, legst du sie gezielt dort an, wo dein Depot es braucht – gegen Klumpen, mit Blick auf die Gebühren. Regelbasiert, keine Anlageberatung.") + `
      <div class="box"><h3>Woher deine Dividenden kommen</h3>
        ${I.length ? `<div class="sub" style="margin-bottom:6px">letzte 12 Monate, zusammen ≈ ${E(S)} (≈ ${E(S/12)} im Monat)</div>
        ${I.slice(0,8).map(i=>zeile(`<b>${esc(i.name)}</b><br><span class="sub">${esc(i.br)} · ${Pc(i.jahr/S)} deiner Dividenden · ${Pc(i.z.wert/V)} deines Depots</span>`, E(i.jahr))).join("")}
        ${klumpen ? `<div class="notif" style="margin-top:8px"><span>⚠️ Mit automatischer Wiederanlage fließen ≈ <b>${E(top.jahr)}</b> im Jahr zurück in <b>${esc(top.name)}</b> – die Position ist schon ${Pc(top.z.wert/V)} deines Depots und wächst so am schnellsten weiter.</span></div>` : ""}`
        : `<div class="sub">In den letzten 12 Monaten haben deine Positionen keine Dividenden gezahlt.</div>`}</div>
      ${broker.map(br=>{ const s0 = seit(br), L = buch.filter(x=>x.br===br && x.d>s0), topf = L.reduce((s,x)=>s+x.netto,0), B = bald[br]||[], kommt = B.reduce((s,t)=>s+(t.betrag||0),0);
        const ziel = zielVon(br), c = ziel && C.find(c=>c.id===ziel.id), mo = c ? minOrder(c) : 50, monat = (brJahr[br]||0)/12;
        const kand = C.filter(c=>c.br===br && c.p>0 && (c.id ? anlegbar(byId[c.id]) : c.neu) && !(top && klumpen && c.id===top.id)).slice(0,3);
        const opts = Z.filter(z=>brOf(z)===br && anlegbar(z));
        return `<div class="box"><h3>${esc(br)}</h3>
          <div class="p6big"><div><div class="sub">im Topf seit ${dk(s0)}</div><div class="v">${a ? E(topf,2) : "–"}</div><div class="sub">${a ? `${L.length} Zahlung${L.length===1?"":"en"} (netto)` : "Transaktionen fehlen"}</div></div>
            <div><div class="sub">kommt in 30 Tagen</div><div class="v">≈ ${E(kommt,2)}</div><div class="sub">${B.length ? B.slice(0,3).map(t=>esc(t.name)).join(", ") : "keine Ex-Tage"}</div></div>
            <div><div class="sub">Ø im Monat</div><div class="v">≈ ${E(monat,0)}</div><div class="sub">aus den letzten 12 Monaten</div></div></div>
          ${L.length ? `<details style="margin-top:6px"><summary class="sub" style="cursor:pointer">Zahlungen im Topf</summary>${L.slice(-8).reverse().map(x=>zeile(`${dk(x.d)} · ${esc(x.name)}`, E(x.netto,2))).join("")}</details>` : ""}
          <h4 style="margin:12px 0 4px">Wohin damit?</h4>
          ${(um.ziel||{})[br]==="auto" ? `<div class="sub" style="white-space:normal;margin-bottom:4px">🔄 Automatisch: Am Ex-Tag schlägt die Push die Position vor, die an dem Tag den besten Einstieg bietet (stärkstes Minus, kein Klumpen). Stand jetzt wäre das <b>${esc(ziel ? ziel.name : "–")}</b>.</div>` : ""}
          ${kand.length ? kand.map((c,k)=>zeile(`<b>${k+1}. ${esc(c.name)}</b>${c.neu?` <span class="tag">neu</span>`:""}${c.r1d!=null && c.r1d>-0.02?` <span class="sub ${cls(c.r1d)}">${c.tagTxt} ${Pc(c.r1d,1,true)}</span>`:""}<br><span class="sub">${(c.R.slice(0,3).map(esc).join(" · ")) || "solide Basis"}</span>`, `${c.p} P.`)).join("") : `<div class="sub">Keine passenden Kandidaten bei ${esc(br)}.</div>`}
          ${opts.length ? `<div class="form" style="margin-top:8px"><label>Mein Ziel bei ${esc(br)} (für Vorschlag und Push)<select class="inp" data-uz="${esc(br)}">${(um.ziel||{})[br] && ((um.ziel||{})[br]==="auto" || byId[(um.ziel||{})[br]]) ? "" : `<option value="" selected>– noch kein Ziel gewählt${ziel?` (Vorschlag: ${esc(ziel.name)})`:""} –</option>`}<option value="auto"${(um.ziel||{})[br]==="auto"?" selected":""}>🔄 Automatisch nach Tageskurs</option>${opts.map(z=>`<option value="${esc(z.id)}"${(um.ziel||{})[br]===z.id?" selected":""}>${esc(z.name)}</option>`).join("")}</select></label></div>` : ""}
          <div class="sub" style="white-space:normal;margin-top:6px">${topf >= mo ? `✅ Der Topf reicht für einen Kauf: ${E(topf,0)} in ${esc(ziel ? ziel.name : "dein Ziel")} – die Gebühr liegt dann unter 0,5 %.`
            : `💡 Ab ≈ ${E(mo)} lohnt ein Einzelkauf (Gebühr unter 0,5 %). Günstiger: den Sparplan auf ${esc(ziel ? ziel.name : "dein Ziel")} um ≈ ${E(Math.max(1, Math.round(monat)))} im Monat erhöhen – dann wird jede Dividende gebührenfrei mit angelegt.`}</div>
          ${a ? `<div class="links"><button class="btn ghost" data-uang="${esc(br)}">✓ Topf angelegt</button></div>` : ""}</div>`; }).join("")}
      ${!a ? `<div class="notif">📥 Für den Topf (was schon gezahlt wurde) braucht die App deine Transaktionen. <a href="#" id="um-imp">Jetzt importieren</a></div>` : `<div class="sub" style="white-space:normal;margin:4px 2px 0">Letzte importierte Buchung: ${dk(letzteBuchung)}. Neuere Dividenden siehst du nach dem nächsten Transaktions-Import.</div>`}
      ${top ? `<div class="box"><h3>In 10 Jahren: automatisch oder umgelenkt?</h3>
        <div style="overflow-x:auto"><table class="tbl" style="font-size:12.5px"><tr><th></th><th>heute</th><th>auto&shy;matisch</th><th>umge&shy;lenkt</th></tr>
          <tr><td style="white-space:normal">Anteil ${esc(top.name)}</td><td>${Pc(top.z.wert/V)}</td><td>${Pc(sa.topA)}</td><td><b>${Pc(su.topA)}</b></td></tr>
          <tr><td style="white-space:normal">Dividenden im Jahr</td><td>${E(S)}</td><td>${E(sa.div)}</td><td><b>${E(su.div)}</b></td></tr>
          <tr><td>Depotwert</td><td>${E(V)}</td><td>${E(sa.ges)}</td><td><b>${E(su.ges)}</b></td></tr></table></div>
        <div class="sub" style="white-space:normal;margin-top:6px">Vereinfachtes Modell: alle Kurse +6 % im Jahr, Dividendenrendite wie heute, ohne neue Einzahlungen und ohne Steuern${S < freiGesamt() ? " (dein Freibetrag deckt die Dividenden aktuell ab)" : ""}. „Umgelenkt“ heißt: die Dividenden jedes Brokers gehen in dein Ziel dort. Es geht um die Richtung, nicht um genaue Zahlen.</div></div>` : ""}
      <div class="box"><div class="form"><label class="tg"><input type="checkbox" id="um-push" ${um.push!==false?"checked":""}> Push am Ex-Tag mit Umlenk-Vorschlag</label></div>
        <div class="sub" style="white-space:normal">Statt „Ex-Dividende morgen“ bekommst du dann z. B. „≈ 16 € Dividende → lieber in iShares MSCI World statt zurück in Realty Income“. Gilt für Positionen bei Brokern, für die du oben ein Ziel gewählt hast.</div>
        <div class="sub" style="white-space:normal;margin-top:8px">Tipp: Die automatische Wiederanlage beim Broker lohnt sich für ETFs. Für Einzelaktien, die schon groß sind, besser aus lassen und umlenken.</div></div>`;
    const sp = async (msg) => { if(await PLUS.save(msg, true)) { toastKurz("Gespeichert"); renderUmlenker(); } };
    $("#main").querySelectorAll("[data-uz]").forEach(sel=>sel.onchange = () => { if(!sel.value) return; P.pf.umlenker = Object.assign({}, P.pf.umlenker, { ziel: Object.assign({}, (P.pf.umlenker||{}).ziel, { [sel.dataset.uz]: sel.value }) }); sp("Umlenker-Ziel"); });
    $("#main").querySelectorAll("[data-uang]").forEach(b=>b.onclick = () => { P.pf.umlenker = Object.assign({}, P.pf.umlenker, { angelegt: Object.assign({}, (P.pf.umlenker||{}).angelegt, { [b.dataset.uang]: heuteS }) }); sp("Topf angelegt"); });
    const pu = $("#um-push"); if(pu) pu.onchange = () => { P.pf.umlenker = Object.assign({}, P.pf.umlenker, { push: pu.checked }); sp("Umlenker-Push"); };
    const im = $("#um-imp"); if(im) im.onclick = ev => { ev.preventDefault(); PLUS2.txImport(); };
  }

  /* ================= Tastatur (iPad mit Tastatur, Mac) ================= */
  // 1–5 = Tabs, R = aktualisieren, / = Suche, Esc = schließen (Esc gibt es schon)
  document.addEventListener("keydown", e => {
    if(e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target; if(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const ov = document.getElementById("ov"); if(ov && ov.classList.contains("open")) return;
    const tabs = {"1":"chancen","2":"depot","3":"alarme","4":"termine","5":"mehr"};
    if(tabs[e.key]){ location.hash = tabs[e.key]; e.preventDefault(); }
    else if(e.key === "r" || e.key === "R"){ const b = document.getElementById("reload"); if(b){ b.click(); e.preventDefault(); } }
    else if(e.key === "/"){ e.preventDefault(); const fokus = () => { const q = document.getElementById("q"); if(q){ q.focus(); q.select(); } };
      if(document.getElementById("q")) fokus(); else { location.hash = "chancen"; setTimeout(fokus, 400); } }
  });

  /* ================= Diskrete Push-Nachrichten ================= */
  const push4 = PLUS.VIEWS.push;
  PLUS.VIEWS.push = () => { push4(); if(!P.pf || !P.depot) return;
    const an = (P.pf.einstellungen||{}).diskret !== false;
    $("#main").insertAdjacentHTML("afterbegin", `<div class="box" style="margin-top:12px"><h3>🔒 Privatsphäre</h3><div class="form">
      <label class="tg"><input type="checkbox" id="pk-dis" ${an?"checked":""}> Diskrete Push-Nachrichten (empfohlen)</label></div>
      <div class="sub" style="white-space:normal">An: Die Push zeigt nur „Neue Nachricht“ – Beträge, Aktien und Kurse stehen ausschließlich verschlüsselt in der App. So kann weder der Push-Dienst (ntfy) noch jemand, der dein Handy-Display sieht, etwas über dein Depot erfahren. Aus: Die Push zeigt alles direkt.</div></div>`);
    $("#pk-dis").onchange = async (ev)=>{ P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {diskret: ev.target.checked}); await PLUS.save(ev.target.checked?"Diskrete Push an":"Diskrete Push aus", true); };
  };

  /* ================= Registrieren ================= */
  const MINE = ["umlenker","gebuehren","freistellung","kaufzeit","divwachstum","verkaeufe","crash","steuerrechner","wrapped","sparziel","sicherheit","kaufvorschlag","steuern","einstellungen","geraet","datencheck"];
  const markieren = () => { const m = document.getElementById("main"); if(m) m.classList.toggle("p6v", MINE.includes(location.hash.slice(1).split(/[?&]/)[0])); };
  window.addEventListener("hashchange", markieren); setTimeout(markieren, 0);
  const MEHR6 = [["wrapped","🎁 Depot Wrapped","Dein Börsenjahr in Zahlen"],["gebuehren","💸 Gebühren-Check","Was dich Käufe und Verkäufe gekostet haben"],
    ["freistellung","🧾 Freistellungsauftrag aufteilen","Freibetrag richtig auf die Broker verteilen"],["steuerrechner","🧮 Steuer vor Verkauf","Was ein Verkauf an Steuer kostet"],
    ["kaufzeit","⏱ Kaufzeitpunkte","Kaufst du günstig oder teuer?"],["divwachstum","🌱 Dividenden-Wachstum","Echte Ausschüttungen Monat für Monat"],
    ["verkaeufe","🔁 Verkaufs-Rückblick","Was wäre, wenn du gehalten hättest?"],["crash","🌪 Crash-Test","Dein Depot in 2008, 2020 und 2022"],["sparziel","🎯 Sparziel","Bist du auf Kurs?"],["kaufvorschlag","🛒 Nächster Kauf","Wohin das nächste Geld gehen sollte"],["umlenker","♻️ Dividenden-Umlenker","Dividenden gezielt anlegen statt Klumpen füttern"],["steuern","🧾 Quellensteuer & Steuern","Wie viel dir durch Steuern weggekommen ist"],["sicherheit","🔐 Sicherheit & App-Sperre","Face ID, Schlüssel und Zugang"]];
  const mehr5 = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehr5(); const first = $("#main").querySelector(".list");
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#geraet" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">📱 Neues Gerät verbinden</div><div class="sub">iPhone, iPad oder Computer hinzufügen</div></div><span class="sub">›</span></a>`);
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#einstellungen" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">⚙️ Einstellungen</div><div class="sub">Design, Startseite, Sicherheit, Steuer, Gerät</div></div><span class="sub">›</span></a>`);
    if(first) first.insertAdjacentHTML("afterend", `<h3 style="margin:16px 2px 0">📒 Aus deinen Transaktionen</h3><div class="list">${MEHR6.map(([h,t,s])=>`<a class="row" href="#${h}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="sub">›</span></a>`).join("")}</div>`); };
  const mk = f => function(){ markieren(); return f.apply(this, arguments); };
  Object.assign(PLUS.VIEWS, {gebuehren:mk(renderGebuehren), freistellung:mk(renderFreistellung), kaufzeit:mk(renderKaufzeit), divwachstum:mk(renderDivwachstum),
    verkaeufe:mk(renderVerkaeufe), crash:mk(renderCrash), steuerrechner:mk(renderSteuerrechner), wrapped:mk(renderWrapped), sparziel:mk(renderSparziel), sicherheit:mk(renderSicherheit), kaufvorschlag:mk(renderKaufvorschlag), umlenker:mk(renderUmlenker), steuern:mk(renderSteuern), einstellungen:mk(renderEinstellungen), geraet:mk(()=>{ renderEinstellungen(); if(P.key && P.pf) PLUS.pair(); else if(!P.loaded) PLUS.loadDepot(); })});
  PLUS3.DEPOT_VIEWS.push(...MEHR6.map(m=>m[0]));
  PLUS3.MEHR.push(...MEHR6.map(m=>m[0]));
  PLUS3.MEHR.push("einstellungen","geraet"); PLUS3.DEPOT_VIEWS.push("einstellungen");
  return { freiDaten };
})();
