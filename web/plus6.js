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
  const sucheHTML = (id, ph) => `<input class="inp" id="${id}" list="${id}-dl" placeholder="${ph}" autocomplete="off"><datalist id="${id}-dl">${aktienListe().slice().sort((a,b)=>(b.mcap_eur??b.mcap??0)-(a.mcap_eur??a.mcap??0)).map(s=>`<option value="${esc(s.t)}">${esc(s.n)}</option>`).join("")}</datalist>`;
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
    steuerOptimierer(O);
  }
  // „Ich brauche X € – was verkaufe ich am steuergünstigsten?“ (FIFO je Position, Freibetrag und Verlusttöpfe je Broker)
  function steuerOptimierer(O){
    const A = O.filter(o=>!o.krypto && o.kurs>0 && (o.lots||[]).length);
    if(!A.length) return;
    const aus = new Set(store.get("sopt_aus", []));
    const box = document.createElement("div"); box.className = "box";
    box.innerHTML = `<h3>💡 Geld gebraucht? Am steuergünstigsten verkaufen</h3>
      <div class="sub" style="white-space:normal">Gib ein, wie viel du nach Steuern brauchst. Ich suche die Verkäufe mit der wenigsten Steuer – Verluste und wenig Gewinn zuerst, dein Freibetrag je Broker wird mitgerechnet.</div>
      <div class="form" style="margin-top:8px"><label>Ich brauche (€, nach Steuern)<input class="inp" id="so-b" inputmode="decimal" placeholder="z. B. 2000" style="max-width:160px"></label></div>
      <details style="margin-top:6px"><summary class="sub" style="cursor:pointer">Positionen, die ich nicht verkaufen will (${aus.size})</summary>
        <div class="form">${A.map((o,i)=>`<label class="tg"><input type="checkbox" data-so="${i}" ${aus.has(o.w+"|"+o.br)?"checked":""}> ${esc(o.name)} <span class="sub">· ${esc(o.br)}</span></label>`).join("")}</div></details>
      <div id="so-out" style="margin-top:8px"></div>`;
    $("#main").appendChild(box);
    const satz = steuerSatz();
    const steuerVon = (verk) => {   // verk: [{o, n}] -> Steuer gesamt (je Broker: Aktientopf, allgemeiner Topf, Freibetrag)
      const B = {};
      for(const {o, n} of verk){ if(n<=0) continue; const f = fifo(o, n, o.kurs), b = B[o.br] = B[o.br] || {akt:0, son:0};
        if(o.etf) b.son += f.gewinn*0.7; else b.akt += f.gewinn; }
      let st = 0;
      for(const [br, b] of Object.entries(B)){ const basis = Math.max(0, Math.max(0, b.akt) + b.son), rest = restFrei(br).rest ?? 0; st += Math.max(0, basis - rest) * satz; }
      return st;
    };
    const ganz = o => !(o.stk % 1) ;   // ganze Stücke, wenn die Position keine Bruchstücke hat
    const rund = (o, n) => Math.min(o.stk, ganz(o) ? Math.ceil(n - 1e-9) : Math.ceil(n*1000)/1000);
    const ergebnis = verk => { const erl = verk.reduce((a,x)=>a + x.n*x.o.kurs, 0), st = steuerVon(verk); return {erl, st, netto: erl - st}; };
    const calc = () => {
      const ziel = toNum($("#so-b").value), out = $("#so-out");
      if(!(ziel > 0)){ out.innerHTML = ""; return; }
      const P = A.filter(o=>!aus.has(o.w+"|"+o.br));
      const gesamt = ergebnis(P.map(o=>({o, n:o.stk})));
      if(gesamt.netto < ziel){ out.innerHTML = `<div class="err">Selbst alles verkauft bringt nur ${E(gesamt.netto)} nach Steuern.</div>`; return; }
      // Scheiben in FIFO-Reihenfolge; immer die mit dem kleinsten steuerpflichtigen Gewinn je Euro Erlös zuerst
      const kopf_ = P.map(o=>({o, i:0, rest:(o.lots[0]||[])[1]||0})), menge = new Map(P.map(o=>[o, 0]));
      const quote = h => { const lot = h.o.lots[h.i]; return lot ? (h.o.kurs - lot[2]) / h.o.kurs * (h.o.etf ? 0.7 : 1) : Infinity; };
      const verk = () => P.map(o=>({o, n:menge.get(o)}));
      for(let schritt = 0; schritt < 5000; schritt++){
        if(ergebnis(verk()).netto >= ziel) break;
        const h = kopf_.filter(x=>x.o.lots[x.i]).sort((a,b)=>quote(a)-quote(b))[0]; if(!h) break;
        // so viel von dieser Scheibe, wie nötig (Halbierungssuche), höchstens die ganze Scheibe
        let lo = 0, hi = h.rest, basis = menge.get(h.o);
        menge.set(h.o, basis + hi);
        if(ergebnis(verk()).netto >= ziel){ for(let k=0;k<40;k++){ const mid=(lo+hi)/2; menge.set(h.o, basis+mid); if(ergebnis(verk()).netto >= ziel) hi = mid; else lo = mid; } menge.set(h.o, basis + hi); break; }
        h.i++; h.rest = (h.o.lots[h.i]||[])[1]||0;
      }
      const plan = verk().filter(x=>x.n>1e-9).map(x=>({o:x.o, n:rund(x.o, x.n)}));
      const e = ergebnis(plan);
      // Vergleich: von allen erlaubten Positionen gleichmäßig verkaufen
      let lo = 0, hi = 1; for(let k=0;k<40;k++){ const mid=(lo+hi)/2; if(ergebnis(P.map(o=>({o, n:o.stk*mid}))).netto >= ziel) hi = mid; else lo = mid; }
      const gl = ergebnis(P.map(o=>({o, n:o.stk*hi})));
      out.innerHTML = `<div style="overflow-x:auto"><table class="tbl"><tr><th>Verkaufen</th><th>Stück</th><th>Erlös</th></tr>
        ${plan.map(({o,n})=>{ const f = fifo(o, n, o.kurs); return `<tr><td>${esc(o.name)}<br><span class="sub">${esc(o.br)} · Gewinn <span class="${cls(f.gewinn)}">${Es(f.gewinn)}</span></span></td><td>${nf(n%1?3:0).format(n)}</td><td>${E(n*o.kurs)}</td></tr>`; }).join("")}</table></div>
        <div class="kvrow"><span>Erlös</span><b>${E(e.erl)}</b></div>
        <div class="kvrow"><span><b>Steuer</b></span><b class="${e.st>0.5?"down":"up"}">${E(e.st)}</b></div>
        <div class="kvrow" style="font-size:16px"><span>Du bekommst</span><b>${E(e.netto)}</b></div>
        ${gl.st - e.st >= 1 ? `<div class="notif" style="margin-top:8px"><span>💰 Das spart <b>${E(gl.st - e.st)}</b> Steuer gegenüber einem gleichmäßigen Verkauf aus allen Positionen (dort ${E(gl.st)}).</span></div>` : ""}
        <div class="sub" style="white-space:normal;margin-top:6px">Ganze Stücke werden aufgerundet, deshalb kann etwas mehr herauskommen. Nicht eingerechnet: Ordergebühren, Verluste, die schon in deinem Verlusttopf liegen, und schon gezahlte Vorabpauschale. Keine Steuerberatung – prüf vor dem Verkauf, ob du die Position langfristig halten willst.</div>`;
    };
    $("#so-b").oninput = calc;
    box.querySelectorAll("[data-so]").forEach(c=>c.onchange=()=>{ const o = A[+c.dataset.so], k = o.w+"|"+o.br; c.checked ? aus.add(k) : aus.delete(k); store.set("sopt_aus", [...aus]); calc(); });
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
        <div class="links"><a class="btn ghost" href="#mitteilungen">🔔 Mitteilungen bearbeiten</a></div></div>
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
    const autoId = new Set(Z.filter(z=>z.auto).map(z=>z.id));
    const manX = pfPos.filter(p=>p.manuell!=null && !autoId.has(p.id)).map(p=>{ const q = tx[String(p.isin||"").toUpperCase()]; const kw = q && q.ek ? q.stk*q.ek : (+p.einstand||null);
      return kw && kw>5 && (p.manuell/kw < 0.5 || p.manuell/kw > 2) ? `${esc(p.name)}: ${E(p.manuell,2)} eingetragen, gekauft für ${E(kw,2)}` : null; }).filter(Boolean);
    // Kursquellen: Lücken bei Yahoo und Tageskurse von deutschen Börsen
    const luecke = Z.filter(z=>z.kurs_luecke), deQ = Z.filter(z=>z.heute_quelle && !z.ls);
    // Hauptquelle Lang & Schwarz (wie getquin / Trade Republic) – mit Vergleich zur alten Yahoo-Rechnung
    const lsQ = Z.filter(z=>z.ls), mitKurs = Z.filter(z=>!z.manuell), ohneLs = mitKurs.filter(z=>!z.ls && z.live_quelle!=="Kraken"), kraken = mitKurs.filter(z=>z.live_quelle==="Kraken"), lsAbw = Z.filter(z=>z.ls_abweichung!=null);
    if(lsQ.length){
      const uhr = x => new Date(x).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
      const jetzt = new Date(), handel = jetzt.getDay()>=1 && jetzt.getDay()<=5 && jetzt.getHours()>=8 && jetzt.getHours()<22;
      const altLs = handel ? lsQ.filter(z=>z.kurs_zeit && Date.now()-new Date(z.kurs_zeit) > 45*60000) : [];
      const lh = Z.reduce((a,z)=>a+((z.wert||0)-(z.wert_gestern||z.wert||0)),0);
      const yh = Z.reduce((a,z)=>a+(z.yahoo_heute!=null ? z.yahoo_heute : ((z.wert||0)-(z.wert_gestern||z.wert||0))),0);
      out.push(row(!lsAbw.length && !altLs.length, `Kurse von Lang & Schwarz: ${lsQ.length} von ${mitKurs.length} Positionen`,
        [`Wie bei getquin und Trade Republic: Mittelkurs in Euro, „heute“ gegen den Vortageskurs von L&S.`,
         ohneLs.length?`Ohne L&S-Kurs (Ausweichquelle): ${ohneLs.map(z=>esc(z.name)).join(", ")}.`:"",
         kraken.length?`Krypto gibt es bei L&S nicht – live von Kraken: ${kraken.map(z=>esc(z.name)).join(", ")}.`:"",
         lsAbw.length?`L&S-Kurs passte nicht zum Heimatkurs und wurde deshalb nicht genommen: ${lsAbw.map(z=>`${esc(z.name)} (${Pc(z.ls_abweichung,1,true)})`).join(", ")}.`:"",
         altLs.length?`Kurs länger nicht aktualisiert: ${altLs.map(z=>`${esc(z.name)} (${uhr(z.kurs_zeit)})`).join(", ")}.`:"",
         `Zum Vergleich, alte Rechnung über Yahoo: heute ${E(yh,0)} statt ${E(lh,0)}.`].filter(Boolean).join(" ")));
    }
    // Anleihen: Nennwert laut Transaktionen × aktueller Kurs (US-Finanzministerium bzw. L&S)
    const anlA = Z.filter(z=>z.auto), anlX = Z.filter(z=>z.anl_abweichung!=null), nochMan = Z.filter(z=>z.manuell && !z.auto);
    if(anlA.length || anlX.length){
      const st = z => /^\d{4}-\d{2}-\d{2}$/.test(z.kurs_zeit||"") ? dk(z.kurs_zeit) : new Date(z.kurs_zeit).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
      out.push(row(!anlX.length, `Anleihen automatisch bewertet: ${anlA.length}`,
        [anlA.map(z=>`${esc(z.name)}: ${F.n(z.nennwert,2)} ${z.anl_waehrung==="USD"?"$":"€"} Nennwert × ${F.n(z.anl_kurs,2)} %${z.anl_waehrung==="USD"?" ÷ Dollarkurs":""} = ${E(z.wert,2)} (${esc(z.kurs_quelle)}, ${st(z)}; eingetragen waren ${E(z.wert_eingetragen,2)})`).join(" · "),
         anlX.length?`Nicht übernommen, weil der Kurs nicht zum eingetragenen Wert passt (bitte prüfen): ${anlX.map(z=>`${esc(z.name)} (L&S: ${E(z.anl_abweichung,2)}, eingetragen ${E(z.wert,2)})`).join(", ")}.`:"",
         nochMan.length?`Weiter von Hand: ${nochMan.map(z=>esc(z.name)).join(", ")}.`:""].filter(Boolean).join(" ")));
    }
    if(luecke.length) out.push(row(false, "Lücke in den Kursdaten", `Bei Yahoo fehlen Schlusskurse der letzten Tage für ${luecke.map(z=>esc(z.name)).join(", ")}. Wert stimmt, die Tagesveränderung wird bis zum Auffüllen als 0 gezählt statt falsch.`));
    if(deQ.length) out.push(row(true, "Tageskurse von deutschen Börsen", `Für ${deQ.length} Position${deQ.length>1?"en":""} kommt „heute“ gerade von einer deutschen Börse in Euro (wie bei getquin), weil die Heimatbörse noch nicht offen ist oder Yahoo dort Kurse fehlen: ${deQ.map(z=>`${esc(z.name)} (${esc(z.heute_quelle)})`).join(", ")}.`));
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
    try{ if(ich && ich.push && pushGeht() && Notification.permission === "granted" && vapidPub()){
      let a = await pushAbo(false);
      const tot = ((P.depot || {}).push_status || {}).tot || [];
      // Abo verloren oder vom Push-Dienst als abgelaufen gemeldet: neu anlegen (Erlaubnis ist ja schon da)
      if(!a || tot.includes(await sha16(a.endpoint))){
        try{ const reg = await navigator.serviceWorker.ready, s0 = await reg.pushManager.getSubscription(); if(s0) await s0.unsubscribe(); }catch(e){}
        try{ a = await pushAbo(true); }catch(e){ a = null; }
      }
      if(a && a.endpoint !== ich.push.endpoint) abo = a; } }catch(e){}
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
  const sha16 = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)))), b=>b.toString(16).padStart(2,"0")).join("").slice(0,16);
  // Zustell-Status vom Server: wann zuletzt angekommen, welcher Fehler, was noch wartet
  function pushStatusHTML(hash){
    const S = (P.depot || {}).push_status; if(!S) return "";
    const ich = ((P.pf && P.pf.geraete) || {})[geraetId()] || {}, g = hash && S.geraete ? S.geraete[hash] : null;
    const zt = x => x ? new Date(x).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "–";
    const grund = c => c===403 ? "Apple/Google lehnt den Server-Schlüssel ab – Einrichtung neu machen" : (c===404||c===410) ? "Abo abgelaufen – wird beim nächsten Öffnen der App erneuert"
      : c===413 ? "Nachricht zu lang" : c===429 ? "zu viele auf einmal – wird wiederholt" : c==="netz" ? "Netzwerkfehler – wird wiederholt"
      : (typeof c==="number" && c>=500) ? "Push-Dienst gestört – wird wiederholt" : c ? "Fehler " + c : "";
    const neuMachen = ` <button class="btn ghost" id="wp-neu" ${P.token?"":"disabled"}>Neu einrichten</button>`;
    const server = {kein_secret:"⚠ Der Server hat keinen Schlüssel zum Senden." + neuMachen,
      secret_falsch:"⚠ Der Schlüssel des Servers passt nicht zur App." + neuMachen,
      nicht_eingerichtet: P.depot && (P.pf.einstellungen||{}).vapid_ok ? "Wird gerade eingerichtet – beim nächsten Server-Lauf (meist in 3–5 Minuten) ist es fertig." : null}[S.web];
    const zeilen = [];
    zeilen.push(`<div class="kvrow"><span>Server</span><b class="${server?"down":"up"}">${server ? "Problem" : "✓ bereit"}</b></div>`);
    if(server) zeilen.push(`<div class="err" style="white-space:normal">${server}</div>`);
    if(ich.push){
      const tot = hash && (S.tot||[]).includes(hash), fehlerNeuer = g && g.fehler && (!g.ok || g.fehler > g.ok);
      zeilen.push(`<div class="kvrow"><span>Zuletzt angekommen</span><b>${g && g.ok ? zt(g.ok) : "noch nie"}</b></div>`);
      if(tot || fehlerNeuer) zeilen.push(`<div class="err" style="white-space:normal">✗ ${zt(g && g.fehler)}: ${esc(grund(tot ? 410 : g.code))}</div>`);
      if(Notification.permission !== "granted") zeilen.push(`<div class="err" style="white-space:normal">Mitteilungen sind auf diesem Gerät ausgeschaltet (iPhone: Einstellungen → Mitteilungen → Value Finder).</div>`);
    }
    if(S.warteschlange) zeilen.push(`<div class="sub" style="white-space:normal">${S.warteschlange} Mitteilung${S.warteschlange>1?"en warten":" wartet"} auf den nächsten Versuch${new Date().getHours()>=23||new Date().getHours()<7?" (oder auf 7 Uhr – nachts kommt nur Dringendes)":""}.</div>`);
    const L = (S.log || []).slice(0, 6);
    if(L.length) zeilen.push(`<div class="sub" style="margin-top:6px">Letzte Zustellungen</div>` + L.map(x=>`<div class="kvrow"><span style="white-space:normal">${x.ok?"✓":"✗"} ${esc(x.titel)}${x.versuch>1?` <span class="sub">(${x.versuch}. Versuch)</span>`:""}${x.grund?` <span class="sub">– ${esc(x.grund)}</span>`:""}</span><span class="sub">${zt(x.zeit)}</span></div>`).join(""));
    zeilen.push(`<div class="links"><button class="btn ghost" id="wp-test" ${P.token?"":"disabled"}>Test-Mitteilung schicken</button></div>
      <div class="sub" style="white-space:normal">Stand der Anzeige: ${zt(S.stand)}. Die Test-Mitteilung kommt mit dem nächsten Server-Lauf, meist nach 3–5 Minuten (nachts bis 30 Minuten).</div>`);
    return zeilen.join("");
  }
  const u8 = s => { s = s.replace(/-/g,"+").replace(/_/g,"/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); };
  async function pushAbo(neu){
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Abo zu einem alten Server-Schlüssel (nach „Neu einrichten“) taugt nicht mehr: verwerfen
    if(sub && vapidPub()){ try{ const k = sub.options && sub.options.applicationServerKey, cur = u8(vapidPub());
      if(k){ const a = new Uint8Array(k); if(a.length !== cur.length || a.some((x,i)=>x!==cur[i])){ if(neu) await sub.unsubscribe(); sub = null; } } }catch(e){} }
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
      return `<div class="box"><h3>🔔 Mitteilungen einrichten (einmalig)</h3>
        <div class="sub" style="white-space:normal;margin-bottom:6px">Damit der Server dir Mitteilungen schicken darf, braucht er einen eigenen Schlüssel. Der wird jetzt hier erzeugt und liegt danach verschlüsselt in deinem Depot – genauso geschützt wie deine Positionen. Das musst du nur einmal machen, nicht pro Gerät.</div>
        <div class="links"><button class="btn" id="wv-gen" ${P.token?"":"disabled"}>Einrichten</button></div>
        ${P.token?"":`<div class="sub">Geht nur auf einem Gerät, das Änderungen speichern darf.</div>`}
        <div id="wp-out"></div></div>`;
    }
    return `<div class="box"><h3>🔔 Mitteilungen auf diesem Gerät</h3>
      <div class="sub" style="white-space:normal;margin-bottom:6px">Kursalarme, Dividenden und Termine direkt als Mitteilung – ohne Zusatz-App. Der Inhalt ist Ende-zu-Ende verschlüsselt: Apple bzw. Google leiten nur Datensalat weiter.</div>
      ${zustand}
      <div id="wp-st"></div>
      ${pushGeht() ? `<div class="kvrow" style="align-items:center"><span>Auf dem Sperrbildschirm zeigen</span><select class="inl" id="wp-inh" style="width:170px">
        <option value="voll" ${inhalt!=="diskret"?"selected":""}>Ganze Nachricht</option><option value="diskret" ${inhalt==="diskret"?"selected":""}>Nur „Neue Nachricht“</option></select></div>` : ""}
      <div id="wp-out"></div></div>`;
  }
  function pushBind(neuZeichnen){
    const out = t => { const o = $("#wp-out"); if(o) o.innerHTML = t; };
    (async () => { const el = $("#wp-st"); if(!el) return;
      const ich = ((P.pf && P.pf.geraete) || {})[geraetId()] || {};
      el.innerHTML = pushStatusHTML(ich.push ? await sha16(ich.push.endpoint) : null);
      const nb = $("#wp-neu"); if(nb) nb.onclick = async () => { nb.disabled = true;
        P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {vapid_ok: false}); neuZeichnen(); };
      const tb = $("#wp-test"); if(tb) tb.onclick = async () => { tb.disabled = true;
        P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {push_test: new Date().toISOString()});
        if(await PLUS.save("Test-Mitteilung angefordert", true, true)) toastKurz("✓ Angefordert – kommt in wenigen Minuten"); else tb.disabled = false; };
    })().catch(()=>{});
    const gen = $("#wv-gen"); if(gen) gen.onclick = async () => {
      gen.disabled = true;
      try{
        const k = await crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, true, ["sign","verify"]);
        const jwk = await crypto.subtle.exportKey("jwk", k.privateKey), raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
        const pub = btoa(String.fromCharCode(...raw)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
        // privater Teil bleibt verschlüsselt im Depot – kein Umweg über GitHub mehr nötig
        P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, {vapid_pub: pub, vapid_priv: jwk.d, vapid_ok: true});
        if(!(await PLUS.save("Mitteilungen eingerichtet", true, true))){ gen.disabled = false; return; }
        toastKurz("✓ Eingerichtet – jetzt Mitteilungen einschalten"); neuZeichnen();
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
    if(/^#terminal/.test(location.hash)) return;   // im Terminal gelten eigene Tasten (1–8 = Funktionen)
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

  /* ================= IPOs & Zeichnungen ================= */
  // Öffentlicher IPO-Kalender (web/ipos.json, vom Scanner) + deine Zeichnungen (verschlüsselt in P.pf.ipos)
  let IPO = null, ipoZeit = 0;
  async function ipoLaden(){
    if(IPO && Date.now() - ipoZeit < 5*60000) return IPO;
    try{ const r = await fetch("ipos.json?ts="+Date.now(), {cache:"no-store"}); if(r.ok){ IPO = await r.json(); ipoZeit = Date.now(); } }catch(e){}
    return IPO;
  }
  const usdEur = () => { const m = ((typeof DATA!=="undefined" && DATA && DATA.markt) || []).find(x=>x.n==="EUR/USD"); return m && m.p > 0 ? m.p : null; };   // 1 € = x $
  const mrd = v => v==null ? "–" : v >= 1e9 ? nf(1).format(v/1e9)+" Mrd. $" : nf(0).format(v/1e6)+" Mio. $";
  const dkurz = s => s ? new Date(s+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short", day:"2-digit", month:"2-digit"}) : "–";
  const normName = s => String(s||"").toLowerCase().replace(/[,.]|\b(inc|corp|pbc|ltd|plc|holdings?|ag|co)\b/g,"").replace(/\s+/g," ").trim();
  // Status einer Zeichnung aus dem Kalender: demnächst (Preisspanne) -> gepreist (Ausgabepreis) -> handelt (Kurs)
  function ipoStatus(z){
    const I = IPO || {}, t = (z.t||"").toUpperCase(), n = normName(z.name);
    const pass = x => (t && (x.t||"").toUpperCase()===t) || (!t && normName(x.name)===n);
    const g = (I.gepreist||[]).find(pass), d = (I.demnaechst||[]).find(pass);
    return { g, d };
  }
  function ipoRechnung(z){
    const fx = usdEur(), { g, d } = ipoStatus(z), betrag = +z.betrag || 0;
    const preisUsd = z.preis_usd || (g && g.preis) || null;
    const stk = z.stk || (preisUsd && fx ? betrag / (preisUsd / fx) : null);      // ohne eingetragene Zuteilung: volle Zuteilung angenommen
    const kursUsd = g && g.kurs && g.kurs_datum && g.kurs_datum >= (g.datum||"") ? g.kurs : null;
    const wert = stk && kursUsd && fx ? stk * kursUsd / fx : null;
    const einsatz = z.stk && z.preis_usd && fx ? z.stk * z.preis_usd / fx : betrag;
    return { g, d, fx, preisUsd, stk, kursUsd, wert, einsatz, gewinn: wert!=null ? wert - einsatz : null };
  }
  async function renderIpos(){
    $("#main").innerHTML = `<div class="empty">IPO-Kalender wird geladen …</div>`;
    const I = await ipoLaden();
    if(location.hash.slice(1).split(/[?&]/)[0] !== "ipos") return;
    if(P.key && !P.loaded) PLUS.loadDepot();   // lädt im Hintergrund und zeichnet die Ansicht danach neu
    const mein = (P.pf && P.pf.ipos) || [], kannSpeichern = !!(P.key && P.pf), laedt = !!(P.key && !P.pf);
    const zRow = (z, i) => { const r = ipoRechnung(z);
      const status = r.kursUsd ? `Handelt: ${nf(2).format(r.kursUsd)} $ <span class="${cls(r.g.perf)}">(${Pc(r.g.perf,1,true)} seit Ausgabe)</span>`
        : r.g ? `Ausgabepreis ${nf(2).format(r.g.preis)} $ · Handel ab ${dkurz(r.g.datum)}`
        : r.d ? `Preisspanne ${esc(r.d.preis||"–")} $ · Preis wird ${r.d.datum ? "um den "+dkurz(r.d.datum) : "bald"} festgelegt`
        : `Noch nicht im Kalender`;
      return `<div class="row" style="grid-template-columns:1fr auto;align-items:start"><div style="min-width:0">
        <div class="nm">${esc(z.name)}${z.t?` <span class="sub">${esc(z.t)}</span>`:""}</div>
        <div class="sub" style="white-space:normal">${E(z.betrag,2)} gezeichnet${z.broker?` bei ${esc(z.broker)}`:""}${z.datum?` · ${dk(z.datum)}`:""}</div>
        <div class="sub" style="white-space:normal">${status}</div>
        ${r.stk ? `<div class="sub" style="white-space:normal">${z.stk ? `Zugeteilt: ${nf(z.stk%1?3:0).format(z.stk)} Stück${z.preis_usd?` zu ${nf(2).format(z.preis_usd)} $`:""}` : `Bei voller Zuteilung ≈ ${nf(2).format(r.stk)} Stück`}</div>` : ""}
        <div class="links" style="margin-top:6px"><a href="#" data-ipz="${i}">Zuteilung eintragen</a><a href="#" data-ipdel="${i}">Löschen</a></div></div>
        <div style="text-align:right">${r.wert!=null ? `<div class="px">${E(r.wert,2)}</div><div class="${cls(r.gewinn)}">${Es(r.gewinn,2)}</div>` : `<div class="px">${E(z.betrag,2)}</div><div class="sub">Einsatz</div>`}</div></div>`; };
    const gezeichnet = mein.reduce((s,z)=>s+(+z.betrag||0),0), werte = mein.map(ipoRechnung), wSum = werte.reduce((s,r)=>s+(r.wert!=null?r.wert:0),0), mitWert = werte.filter(r=>r.wert!=null);
    const anst = (I && I.demnaechst) || [], gp = (I && I.gepreist) || [], fi = (I && I.angemeldet) || [], ka = (I && I.kandidaten) || [];
    const zeichnenBtn = (x) => kannSpeichern ? ` <a href="#" data-ipneu="${esc(JSON.stringify({name:x.name, t:x.t||""}))}">Gezeichnet?</a>` : "";
    $("#main").innerHTML = `
      <div class="box" style="margin-top:12px"><h3>🚀 Deine Zeichnungen</h3>
        ${laedt ? `<p class="sub">Depot wird geladen …</p>` : !kannSpeichern ? `<p class="sub" style="white-space:normal">Verbinde dieses Gerät mit deinem Depot, um Zeichnungen einzutragen – sie werden verschlüsselt gespeichert wie dein Depot.</p>` : ""}
        ${mein.length ? `<div class="list">${mein.map(zRow).join("")}</div>
          <div class="sub" style="margin-top:8px;white-space:normal">Gezeichnet insgesamt ${E(gezeichnet,2)}${mitWert.length ? ` · aktueller Wert der gehandelten: ${E(wSum,2)}` : ""}. Bei großer Nachfrage bekommt man oft nur einen Teil oder gar nichts zugeteilt – trag die echte Zuteilung ein, sobald dein Broker sie meldet.</div>`
          : laedt ? "" : `<p class="sub" style="white-space:normal">Noch keine Zeichnungen. Tipp bei einem Börsengang unten auf „Gezeichnet?“ oder trag einen eigenen ein.</p>`}
        ${kannSpeichern ? `<div class="links"><button class="btn" id="ip-neu">+ Zeichnung eintragen</button></div>` : ""}</div>
      <div class="box"><h3>📅 Demnächst an der Börse</h3>
        ${anst.length ? `<div class="list">${anst.map(x=>`<div class="row" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="nm">${esc(x.name)} ${x.t?`<span class="sub">${esc(x.t)}</span>`:""}</div>
          <div class="sub" style="white-space:normal">${esc(x.boerse||"")} · Preisspanne ${esc(x.preis||"–")} $ · Volumen ${mrd(x.volumen)}${zeichnenBtn(x)}</div></div><div class="sub" style="text-align:right">${dkurz(x.datum)}</div></div>`).join("")}</div>`
          : `<p class="sub">Gerade keine Termine im Kalender.</p>`}</div>
      <div class="box"><h3>🔔 Frisch an der Börse <span class="sub">letzte 90 Tage</span></h3>
        ${gp.length ? `<div class="list">${gp.slice(0,30).map(x=>`<div class="row" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="nm">${esc(x.name)} ${x.t?`<span class="sub">${esc(x.t)}</span>`:""}</div>
          <div class="sub" style="white-space:normal">Ausgabe ${dkurz(x.datum)} zu ${x.preis!=null?nf(2).format(x.preis)+" $":"–"} · ${mrd(x.volumen)}${zeichnenBtn(x)}</div></div>
          <div style="text-align:right">${x.kurs!=null?`<div class="px">${nf(2).format(x.kurs)} $</div><div class="${cls(x.perf)}">${Pc(x.perf,1,true)}</div>`:`<div class="sub">noch kein Kurs</div>`}</div></div>`).join("")}</div>`
          : `<p class="sub">Keine Daten.</p>`}</div>
      <div class="box"><h3>📝 Neu angemeldet <span class="sub">Börsenprospekt eingereicht</span></h3>
        ${fi.length ? `<div class="list">${fi.slice(0,20).map(x=>`<div class="row" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="nm">${esc(x.name)} ${x.t?`<span class="sub">${esc(x.t)}</span>`:""}</div><div class="sub">geplant ${mrd(x.volumen)}</div></div><div class="sub">${dkurz(x.datum)}</div></div>`).join("")}</div>` : `<p class="sub">Keine Daten.</p>`}</div>
      ${ka.length ? `<div class="box"><h3>👀 Große Kandidaten ohne Termin</h3><div class="list">${ka.map(x=>`<div class="row" style="grid-template-columns:1fr"><div><div class="nm">${esc(x.name)}</div><div class="sub" style="white-space:normal">${esc(x.hinweis||"")}${zeichnenBtn(x)}</div></div></div>`).join("")}</div></div>` : ""}
      <div class="sub" style="white-space:normal;margin:10px 4px 20px">Quelle: ${esc((I&&I.quelle)||"Nasdaq IPO-Kalender")}, Stand ${I&&I.stand?new Date(I.stand).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"–"}. Nur US-Börsengänge. Kurse frisch gelisteter Aktien über Yahoo, in Dollar.</div>`;
    // Bedienung
    const speichern = async msg => { if(await PLUS.save(msg, true)){ toastKurz("Gespeichert"); renderIpos(); } };
    const formular = (v, idx) => { const neu = idx==null;
      $("#sheet").innerHTML = `<div class="shead"><div style="min-width:0"><h2>${neu?"Zeichnung eintragen":"Zuteilung eintragen"}</h2></div><button class="iconbtn x" data-close aria-label="Schließen">✕</button></div><div class="form">
        <label>Firma<input class="inp" id="ipf-n" value="${esc(v.name||"")}"></label>
        <div class="two"><label>Ticker (optional)<input class="inp" id="ipf-t" value="${esc(v.t||"")}" placeholder="z. B. ANT"></label><label>Gezeichnet (€)<input class="inp" id="ipf-b" inputmode="decimal" value="${v.betrag!=null?String(v.betrag).replace(".",","):""}"></label></div>
        <div class="two"><label>Broker<select class="inp" id="ipf-br">${["Trade Republic","Scalable Capital","Andere"].map(b=>`<option${(v.broker||"Trade Republic")===b?" selected":""}>${b}</option>`).join("")}</select></label><label>Datum<input class="inp" id="ipf-d" type="date" value="${esc(v.datum||new Date().toISOString().slice(0,10))}"></label></div>
        <div class="two"><label>Zugeteilt (Stück, optional)<input class="inp" id="ipf-s" inputmode="decimal" value="${v.stk!=null?String(v.stk).replace(".",","):""}"></label><label>Ausgabepreis ($, optional)<input class="inp" id="ipf-p" inputmode="decimal" value="${v.preis_usd!=null?String(v.preis_usd).replace(".",","):""}"></label></div>
        <div class="sub" style="white-space:normal">Ohne Zuteilung rechnet die App mit voller Zuteilung zum Ausgabepreis. Sobald dein Broker meldet, wie viele Aktien du bekommen hast, trag sie hier ein.</div>
        <div class="links"><button class="btn" id="ipf-ok">Speichern</button></div></div>`;
      $("#ov").classList.add("open"); document.body.style.overflow = "hidden";
      $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick = closeDetail);
      $("#ipf-ok").onclick = async () => { const b = toNum($("#ipf-b").value), n = $("#ipf-n").value.trim();
        if(!n || !(b>0)){ toastKurz("Firma und Betrag eintragen"); return; }
        const e = { name: n, t: $("#ipf-t").value.trim().toUpperCase() || null, betrag: b, broker: $("#ipf-br").value, datum: $("#ipf-d").value || null,
          stk: toNum($("#ipf-s").value) || null, preis_usd: toNum($("#ipf-p").value) || null, id: v.id || ("ip"+Date.now().toString(36)) };
        const L = (P.pf.ipos || []).slice(); if(neu) L.push(e); else L[idx] = e; P.pf.ipos = L;
        closeDetail(); await speichern(neu ? "Zeichnung eingetragen" : "Zuteilung eingetragen"); }; };
    const nb = $("#ip-neu"); if(nb) nb.onclick = () => formular({}, null);
    $("#main").querySelectorAll("[data-ipneu]").forEach(a=>a.onclick = ev => { ev.preventDefault(); formular(JSON.parse(a.dataset.ipneu), null); });
    $("#main").querySelectorAll("[data-ipz]").forEach(a=>a.onclick = ev => { ev.preventDefault(); const i = +a.dataset.ipz; formular(Object.assign({}, mein[i]), i); });
    $("#main").querySelectorAll("[data-ipdel]").forEach(a=>a.onclick = async ev => { ev.preventDefault(); const i = +a.dataset.ipdel;
      if(!confirm(`Zeichnung „${mein[i].name}“ löschen?`)) return; P.pf.ipos = mein.filter((_,k)=>k!==i); await speichern("Zeichnung gelöscht"); });
  }

  /* ================= Mitteilungen bearbeiten ================= */
  // Alles an einer Stelle: welche Arten (sofort / im Tages-Überblick / aus), Schwellen, Ruhezeit, Tageslimit, einzelne Aktien.
  // Der Server liest dieselben Einstellungen (pf.einstellungen) und hält sich bei jedem Lauf daran.
  const MT_ARTEN = [
    ["alarm","p_alarm","🔔 Kursalarme","wenn eine Aktie deine Marke erreicht", true],
    ["kaufzone","p_kaufzone","🎯 Kaufzone erreicht","Kurs fällt unter deinen Wunschpreis", true],
    ["bewegung","p_bewegung","📉 Starke Tagesbewegung","deine Positionen, Schwellen unten"],
    ["termin","termine","📅 Termine am Vortag","Quartalszahlen und Ex-Dividende deiner Positionen"],
    ["zusammenfassung","zusammenfassung","📊 Tagesbericht","werktags nach US-Börsenschluss (ca. 22 Uhr)"],
    ["wochenbericht","wochenbericht","🗓 Wochenbericht","freitags: Woche, Top/Flop, Termine"],
    ["merkliste","p_merkliste","👀 Merkliste","starke Bewegung oder Kursrutsch ohne Grund"],
    ["markt","p_markt","⚠️ Ganzer Markt","auffällige Kursstürze ohne erkennbaren Grund (max. 3 je Lauf)"],
    ["rsi","rsi_alarm","🔎 Überverkauft","RSI unter 30, höchstens 1× pro Woche je Aktie", false, false],
    ["quartal","quartal","📑 Quartalszahlen","Erwartungen geschlagen oder verfehlt"],
    ["quartal_mk","quartal_merkliste","📑 Quartalszahlen Merkliste","dasselbe für Aktien auf deiner Merkliste"],
    ["insider","insider","🕵️ Insider-Käufe","Manager kaufen eigene Aktien (ab 50.000 $)"],
    ["analysten","analysten","🎯 Kursziel geändert","Analysten-Durchschnitt ±7 %"],
    ["dividende","div_aenderung","💶 Dividende erhöht/gesenkt",""],
    ["sparplan","p_sparplan","💶 Sparplan ausgeführt",""],
    ["wirtschaft","wirtschaft","📆 Wirtschaftstermine","am Vorabend: Zinsen, Inflation, Arbeitsmarkt"],
    ["klumpen","klumpen","🧱 Klumpenrisiko","wöchentlich, über deine ETFs"],
    ["rebalancing","rebalancing","⚖️ Rebalancing","wöchentlich, wenn das Depot von deinen Zielen abweicht"],
    ["steuer","steuer_erinnerung","🧾 Freibetrag","im Dezember, falls noch nicht ausgeschöpft"],
    ["tagebuch","tagebuch","📓 Tagebuch","These nach 3 Monaten und 1 Jahr prüfen"]];
  function renderMitteilungen(){
    if(!need("Mitteilungen")) return;
    const D = P.depot, e0 = Object.assign({tag_minus:-5, tag_plus:8, umfang:"markt", ruhe_von:23, ruhe_bis:7, sammel_uhr:18, max_pro_tag:0, bew_min_eur:0}, P.pf.einstellungen||{});
    const e = JSON.parse(JSON.stringify(e0)); e.aktien = e.aktien || {}; e.push_sammeln = e.push_sammeln || [];
    const S = D.push_status || {};
    const stdAn = k => { const a = MT_ARTEN.find(x=>x[1]===k); return a && a[5]===false ? false : true; };
    const modus = a => e[a[1]] === false || (e[a[1]] == null && !stdAn(a[1])) ? "aus" : e.push_sammeln.includes(a[0]) ? "sammeln" : "sofort";
    const stunden = (sel) => Array.from({length:24}, (_,h)=>`<option value="${h}" ${+sel===h?"selected":""}>${String(h).padStart(2,"0")}:00</option>`).join("");
    const watch = (D.merkliste || []).filter(t=>BY[t]).map(t=>({t, name: BY[t].n, wo:"Merkliste"}));
    const pos = (D.positionen || []).filter(z=>z.t && !z.manuell).map(z=>({t:z.t, name:z.name, wo:"Depot"}));
    const AK = [...pos, ...watch.filter(w=>!pos.some(p=>p.t===w.t))];
    const ev = (D.ereignisse || []).slice(0, 15);
    const artName = a => (MT_ARTEN.find(x=>x[0]===a) || [, , a])[2];
    const zt = x => new Date(x).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    $("#main").innerHTML = `<h2 style="margin:14px 2px 4px">🔔 Mitteilungen</h2>
      <div class="sub" style="white-space:normal;margin:0 2px 8px">Hier legst du fest, was als Mitteilung kommt, was nur gesammelt im Tages-Überblick landet und was ganz aus ist. Alles landet trotzdem in der Liste unten.</div>
      <div id="mt-geraet">${pushHTML()}</div>
      <div class="box"><h3>Was soll kommen?</h3>
        <div class="sub" style="white-space:normal;margin-bottom:6px"><b>Sofort</b> = eigene Mitteilung · <b>Überblick</b> = gesammelt, einmal am Tag um <select class="inl" id="mt-su" style="width:90px">${stunden(e.sammel_uhr)}</select> · <b>Aus</b> = nur in der App-Liste</div>
        ${MT_ARTEN.map(a=>`<div class="kvrow" style="align-items:center"><span style="white-space:normal">${a[2]}${a[3]?`<br><span class="sub">${a[3]}</span>`:""}</span>
          <select class="inl" data-mt="${a[0]}" style="width:118px"><option value="sofort" ${modus(a)==="sofort"?"selected":""}>Sofort</option>${a[4]?"":`<option value="sammeln" ${modus(a)==="sammeln"?"selected":""}>Überblick</option>`}<option value="aus" ${modus(a)==="aus"?"selected":""}>Aus</option></select></div>`).join("")}
      </div>
      <div class="box"><h3>Kursbewegungen</h3><div class="form">
        <div class="two"><label>Position fällt an einem Tag um mehr als … %<input class="inp" id="mt-m" inputmode="decimal" value="${Math.abs(e.tag_minus)}"></label>
        <label>Position steigt an einem Tag um mehr als … %<input class="inp" id="mt-p" inputmode="decimal" value="${e.tag_plus}"></label></div>
        <label>Nur wenn sich dein Depot dadurch um mindestens … € bewegt<input class="inp" id="mt-me" inputmode="decimal" value="${e.bew_min_eur||0}"></label>
        <div class="sub" style="white-space:normal">So kommt bei 6 € Ethereum keine Mitteilung für 30 Cent Bewegung. 0 = immer.</div>
        <div style="color:var(--ink);font-weight:600;margin-top:6px">Bewegungen beobachten für …</div>
        ${[["depot","nur mein Depot"],["merkliste","Depot + Merkliste"],["markt","Depot + Merkliste + ganzer Markt"]].map(([v,l])=>`<label class="tg"><input type="radio" name="mt-u" value="${v}" ${e.umfang===v?"checked":""}> ${l}</label>`).join("")}
      </div></div>
      <div class="box"><h3>Wann?</h3>
        <div class="kvrow" style="align-items:center"><span>Ruhezeit<br><span class="sub">nur Kursalarme, Kaufzonen und starke Abstürze kommen sofort, der Rest danach</span></span>
          <span style="white-space:nowrap"><select class="inl" id="mt-rv" style="width:84px" ${e.ruhe_aus?"disabled":""}>${stunden(e.ruhe_von)}</select> – <select class="inl" id="mt-rb" style="width:84px" ${e.ruhe_aus?"disabled":""}>${stunden(e.ruhe_bis)}</select></span></div>
        <div class="kvrow"><span>Keine Ruhezeit</span><input type="checkbox" id="mt-ra" ${e.ruhe_aus?"checked":""}></div>
        <div class="kvrow"><span>Wochenende ganz ruhig<br><span class="sub">Sa/So nur Dringendes</span></span><input type="checkbox" id="mt-we" ${e.wochenende_ruhig?"checked":""}></div>
        <div class="kvrow" style="align-items:center"><span>Höchstens … Mitteilungen am Tag<br><span class="sub">darüber hinaus in den Tages-Überblick · 0 = unbegrenzt</span></span><input class="inl" id="mt-max" inputmode="numeric" style="width:70px" value="${e.max_pro_tag||0}"></div>
        <div class="sub" style="white-space:normal;margin-top:4px">Heute schon zugestellt: ${S.heute||0}${S.gesammelt?` · für den Überblick gesammelt: ${S.gesammelt}`:""}</div>
      </div>
      <div class="box"><h3>Einzelne Aktien</h3>
        <div class="sub" style="white-space:normal;margin-bottom:6px">🔕 = keine Mitteilungen zu dieser Aktie (Kursalarme kommen trotzdem). Eigene Schwellen ersetzen die allgemeinen für Tagesbewegungen; leer = allgemein.</div>
        ${AK.length ? AK.map(a=>{ const x = e.aktien[a.t] || {}; return `<div class="kvrow" style="align-items:center"><span style="white-space:normal">${esc(a.name||a.t)} <span class="sub">${esc(a.t)} · ${a.wo}</span></span>
          <span style="white-space:nowrap;display:flex;gap:4px;align-items:center"><input class="inl" data-ma="${esc(a.t)}" data-mf="minus" inputmode="decimal" placeholder="−${Math.abs(e.tag_minus)}" value="${x.minus!=null?Math.abs(x.minus):""}" style="width:52px">
          <input class="inl" data-ma="${esc(a.t)}" data-mf="plus" inputmode="decimal" placeholder="+${e.tag_plus}" value="${x.plus!=null?x.plus:""}" style="width:52px">
          <label class="tg" style="margin:0" title="stumm"><input type="checkbox" data-ma="${esc(a.t)}" data-mf="stumm" ${x.stumm?"checked":""}>🔕</label></span></div>`; }).join("") : `<div class="sub">Keine Aktien im Depot oder auf der Merkliste.</div>`}
      </div>
      <div class="box"><h3>Zuletzt</h3>
        ${ev.length ? ev.map((x,i)=>`<div class="ev"><b>${esc(x.titel)}</b>${x.stumm?` <span class="sub">🔕 nur hier</span>`:x.gesammelt?` <span class="sub">📰 im Überblick</span>`:""}
          <div class="sub" style="white-space:normal">${esc(x.text||"")} · ${zt(x.zeit)}</div>
          <div class="links" style="margin-top:2px">${MT_ARTEN.some(a=>a[0]===x.art && !a[4])?`<a href="#" data-mq="art" data-mi="${i}">Solche nur im Überblick</a> · <a href="#" data-mq="aus" data-mi="${i}">Solche aus</a>`:""}${x.t && AK.some(a=>a.t===x.t)?` · <a href="#" data-mq="stumm" data-mi="${i}">${esc(x.t)} stumm</a>`:""}</div></div>`).join("") : `<div class="sub">Noch keine Mitteilungen.</div>`}
      </div>
      <div class="links" style="position:sticky;bottom:10px;z-index:5"><button class="btn" id="mt-save">Speichern</button> <span class="sub" id="mt-hint"></span></div>`;
    try{ pushBind(() => { const el = $("#mt-geraet"); if(el){ el.innerHTML = pushHTML(); pushBind(()=>renderMitteilungen()); } }); }catch(x){}
    const geaendert = () => { const h = $("#mt-hint"); if(h) h.textContent = "Nicht gespeichert"; };
    $("#main").querySelectorAll("select,input").forEach(el => el.addEventListener("change", geaendert));
    const ra = $("#mt-ra"); if(ra) ra.onchange = () => { $("#mt-rv").disabled = $("#mt-rb").disabled = ra.checked; geaendert(); };
    const sammeln = () => { const L = new Set(); document.querySelectorAll("[data-mt]").forEach(sel => { if(sel.value === "sammeln") L.add(sel.dataset.mt); }); return [...L]; };
    const lesen = () => {
      const n = {};
      document.querySelectorAll("[data-mt]").forEach(sel => { const a = MT_ARTEN.find(x=>x[0]===sel.dataset.mt); n[a[1]] = sel.value !== "aus"; });
      n.push_sammeln = sammeln();
      n.tag_minus = -Math.abs(toNum($("#mt-m").value) || 5); n.tag_plus = Math.abs(toNum($("#mt-p").value) || 8);
      n.bew_min_eur = Math.max(0, toNum($("#mt-me").value) || 0);
      n.umfang = (document.querySelector('input[name="mt-u"]:checked') || {}).value || "markt";
      n.ruhe_von = +$("#mt-rv").value; n.ruhe_bis = +$("#mt-rb").value; n.ruhe_aus = $("#mt-ra").checked; n.wochenende_ruhig = $("#mt-we").checked;
      n.max_pro_tag = Math.max(0, Math.round(toNum($("#mt-max").value) || 0)); n.sammel_uhr = +$("#mt-su").value;
      const ak = {};
      document.querySelectorAll("[data-ma]").forEach(el => { const t = el.dataset.ma, f = el.dataset.mf; ak[t] = ak[t] || {};
        if(f === "stumm"){ if(el.checked) ak[t].stumm = true; }
        else { const v = toNum(el.value); if(el.value.trim() !== "" && v != null) ak[t][f] = f === "minus" ? -Math.abs(v) : Math.abs(v); } });
      for(const t of Object.keys(ak)) if(!Object.keys(ak[t]).length) delete ak[t];
      n.aktien = ak;
      return n;
    };
    const speichern = async (msg) => { const b = $("#mt-save"); if(b) b.disabled = true;
      P.pf.einstellungen = Object.assign({}, P.pf.einstellungen, lesen());
      const ok = await PLUS.save(msg || "Mitteilungen geändert", true);
      if(b) b.disabled = false; if(ok){ toastKurz("✓ Gespeichert – gilt ab dem nächsten Server-Lauf"); renderMitteilungen(); } };
    $("#mt-save").onclick = () => speichern();
    $("#main").querySelectorAll("[data-mq]").forEach(a => a.onclick = async ev2 => { ev2.preventDefault();
      const x = ev[+a.dataset.mi]; if(!x) return;
      if(a.dataset.mq === "stumm"){ const cb = document.querySelector(`[data-ma="${CSS.escape(x.t)}"][data-mf="stumm"]`); if(cb) cb.checked = true; }
      else { const sel = document.querySelector(`[data-mt="${CSS.escape(x.art)}"]`); if(sel) sel.value = a.dataset.mq === "aus" ? "aus" : "sammeln"; }
      await speichern("Mitteilungen geändert"); });
  }

  /* ================= Registrieren ================= */
  const MINE = ["mitteilungen","ipos","umlenker","gebuehren","freistellung","kaufzeit","divwachstum","verkaeufe","crash","steuerrechner","wrapped","sparziel","sicherheit","kaufvorschlag","steuern","einstellungen","geraet","datencheck"];
  const markieren = () => { const m = document.getElementById("main"); if(m) m.classList.toggle("p6v", MINE.includes(location.hash.slice(1).split(/[?&]/)[0])); };
  window.addEventListener("hashchange", markieren); setTimeout(markieren, 0);
  const MEHR6 = [["wrapped","🎁 Depot Wrapped","Dein Börsenjahr in Zahlen"],["gebuehren","💸 Gebühren-Check","Was dich Käufe und Verkäufe gekostet haben"],
    ["freistellung","🧾 Freistellungsauftrag aufteilen","Freibetrag richtig auf die Broker verteilen"],["steuerrechner","🧮 Steuer vor Verkauf","Was ein Verkauf an Steuer kostet"],
    ["kaufzeit","⏱ Kaufzeitpunkte","Kaufst du günstig oder teuer?"],["divwachstum","🌱 Dividenden-Wachstum","Echte Ausschüttungen Monat für Monat"],
    ["verkaeufe","🔁 Verkaufs-Rückblick","Was wäre, wenn du gehalten hättest?"],["crash","🌪 Crash-Test","Dein Depot in 2008, 2020 und 2022"],["sparziel","🎯 Sparziel","Bist du auf Kurs?"],["kaufvorschlag","🛒 Nächster Kauf","Wohin das nächste Geld gehen sollte"],["umlenker","♻️ Dividenden-Umlenker","Dividenden gezielt anlegen statt Klumpen füttern"],["steuern","🧾 Quellensteuer & Steuern","Wie viel dir durch Steuern weggekommen ist"],["sicherheit","🔐 Sicherheit & App-Sperre","Face ID, Schlüssel und Zugang"]];
  const mehr5 = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehr5(); const first = $("#main").querySelector(".list");
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#mitteilungen" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">🔔 Mitteilungen bearbeiten</div><div class="sub">Was, wann und zu welchen Aktien du benachrichtigt wirst</div></div><span class="sub">›</span></a>`);
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#ipos" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">🚀 IPOs & Zeichnungen</div><div class="sub">Anstehende Börsengänge – und was aus deinen Zeichnungen wurde</div></div><span class="sub">›</span></a>`);
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#geraet" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">📱 Neues Gerät verbinden</div><div class="sub">iPhone, iPad oder Computer hinzufügen</div></div><span class="sub">›</span></a>`);
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#einstellungen" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">⚙️ Einstellungen</div><div class="sub">Design, Startseite, Sicherheit, Steuer, Gerät</div></div><span class="sub">›</span></a>`);
    if(first) first.insertAdjacentHTML("afterend", `<h3 style="margin:16px 2px 0">📒 Aus deinen Transaktionen</h3><div class="list">${MEHR6.map(([h,t,s])=>`<a class="row" href="#${h}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="sub">›</span></a>`).join("")}</div>`); };
  const mk = f => function(){ markieren(); return f.apply(this, arguments); };
  Object.assign(PLUS.VIEWS, {mitteilungen:mk(renderMitteilungen), push:mk(renderMitteilungen), ipos:mk(renderIpos), gebuehren:mk(renderGebuehren), freistellung:mk(renderFreistellung), kaufzeit:mk(renderKaufzeit), divwachstum:mk(renderDivwachstum),
    verkaeufe:mk(renderVerkaeufe), crash:mk(renderCrash), steuerrechner:mk(renderSteuerrechner), wrapped:mk(renderWrapped), sparziel:mk(renderSparziel), sicherheit:mk(renderSicherheit), kaufvorschlag:mk(renderKaufvorschlag), umlenker:mk(renderUmlenker), steuern:mk(renderSteuern), einstellungen:mk(renderEinstellungen), geraet:mk(()=>{ renderEinstellungen(); if(P.key && P.pf) PLUS.pair(); else if(!P.loaded) PLUS.loadDepot(); })});
  PLUS3.DEPOT_VIEWS.push(...MEHR6.map(m=>m[0]));
  PLUS3.MEHR.push(...MEHR6.map(m=>m[0]));
  PLUS3.MEHR.push("einstellungen","geraet","ipos","mitteilungen"); PLUS3.DEPOT_VIEWS.push("ipos"); PLUS3.DEPOT_VIEWS.push("einstellungen"); PLUS3.DEPOT_VIEWS.push("mitteilungen");
  return { freiDaten };
})();

/* ================= Terminal (angelehnt an das Bloomberg-Terminal) =================
   Befehlszeile: <Ticker oder Name> [Funktion], z. B. „MA HDS“, „Apple REL“, „WHO Berkshire“, „MEIN“.
   Funktionen: DES Beschreibung · HDS Aktionäre · REL Verflechtungen · RV Vergleich mit der Branche · GP Kurs · WHO Wer hält was · MEIN Netz deines Depots
   Daten: Scanner (Kennzahlen), web/terminal/*.json (Profil, Aktionäre, Wikidata-Verflechtungen), alles öffentlich – Depot nur lokal. */
const PLUS7 = (() => {
  const P = PLUS.P;
  const css = document.createElement("style");
  css.textContent = `.vt{background:#000;color:#ffb000;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border-radius:10px;padding:10px;margin-top:10px;font-size:13px;line-height:1.45;overflow:hidden}
.vt *{font-family:inherit}.vt a{color:#7fd4ff;text-decoration:none;cursor:pointer}.vt a:hover{text-decoration:underline}
.vt .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #333;padding-bottom:8px;margin-bottom:8px}
.vt .ttl{color:#000;background:#ffb000;font-weight:700;padding:1px 6px;border-radius:3px;letter-spacing:.5px}
.vt input{background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px 8px;font-size:14px;flex:1;min-width:150px;text-transform:uppercase}
.vt .go{background:#1d6b2e;color:#fff;border:0;border-radius:4px;padding:6px 10px;font-weight:700;cursor:pointer}
.vt .fk{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.vt .fk a{background:#ffb000;color:#000;font-weight:700;padding:2px 7px;border-radius:3px;font-size:12px}
.vt .fk a.on{background:#fff}.vt h4{color:#fff;margin:10px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #222}
.vt table{width:100%;border-collapse:collapse}.vt td,.vt th{padding:2px 4px;border-bottom:1px solid #1a1a1a;text-align:right;white-space:nowrap}
.vt th{color:#888;font-weight:400;font-size:11px}.vt td:first-child,.vt th:first-child{text-align:left;white-space:normal}
.vt .up{color:#3fdc6c}.vt .down{color:#ff5a5a}.vt .mut{color:#888}.vt .w{color:#fff}.vt .me td{background:#1a1300}
.vt .kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 12px}.vt .kv div{display:flex;justify-content:space-between;gap:6px;border-bottom:1px dotted #222}
.vt .tag{display:inline-block;border:1px solid #444;border-radius:3px;padding:0 5px;margin:2px 3px 2px 0;color:#ddd}
.vt .scroll{overflow-x:auto}
.vt{padding:12px 14px}
.vt .kv{grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:2px 16px}
.vt .kv div{align-items:baseline;min-width:0;padding:1px 0}
.vt .kv div>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vt .kv div>span:last-child{white-space:nowrap;text-align:right;flex-shrink:0}
.vt .cols{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:4px 22px;align-items:start}
.vt .grid3{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 22px}
@media(max-width:900px){.vt .cols{grid-template-columns:minmax(0,1fr)}}
.vt .qh{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;border-bottom:1px solid #222;padding:2px 0 8px;margin-bottom:4px}
.vt .qh-l{display:flex;gap:10px;align-items:center;min-width:0;flex:1 1 280px}
.vt .qh-n{font-size:16px;color:#fff;line-height:1.3}
.vt .qh-p{white-space:nowrap}.vt .px{font-size:22px;color:#fff;font-weight:700}
.vt .qh-s{width:170px}.vt .qh-r{display:flex;flex-wrap:wrap;gap:3px 16px;font-size:12px;width:100%;color:#ddd}
@media(max-width:600px){.vt .qh-s{display:none}.vt .px{font-size:19px}}
.vt .bdg{display:inline-block;padding:0 6px;border-radius:3px;font-size:11px;background:#2a2000;color:#ffb000;margin-left:6px;vertical-align:2px}
.vt .panel{border:1px solid #222;border-radius:6px;padding:6px 8px;background:#050505}
.vt .txt{color:#ddd;white-space:normal;line-height:1.5}
.vt ul.li{margin:2px 0;padding-left:18px;color:#ddd;white-space:normal}.vt ul.li li{margin:2px 0}
.vt #vt-form{display:flex;gap:6px}.vt #vt-in{width:100%}
.vt .ac{display:none;position:absolute;left:0;right:0;top:100%;margin-top:2px;background:#0b0b0b;border:1px solid #444;border-radius:4px;z-index:60;max-height:340px;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.6)}
.vt .ac div{display:flex;justify-content:space-between;gap:12px;padding:6px 9px;cursor:pointer;color:#ffb000}
.vt .ac div span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vt .ac div.on,.vt .ac div:hover{background:#2a2000}
.vt .fk{align-items:center}.vt .fk .fkl{font-size:11px;width:44px}
.vt .fk a .n{opacity:.55;margin-right:4px;font-weight:400}.vt .fk a.g{background:#3a3a3a;color:#fff}.vt .fk a.g.on{background:#fff;color:#000}
.vt .fk a .lb{display:none;font-weight:400}
@media(min-width:1100px){.vt .fk a .lb{display:inline}}
@media(max-width:600px){.vt .fk .fkl{display:none}}
.vt table.fa td,.vt table.fa th{padding:3px 8px}.vt table.fa td:first-child,.vt table.fa th:first-child{position:sticky;left:0;background:#000;white-space:nowrap}
.vt table.comp td.best{color:#fff;background:#1a1300;font-weight:700}.vt table.comp td{text-align:right}.vt table.comp td:first-child{text-align:left}
.vt .bz{display:grid;grid-template-columns:150px 1fr 48px;gap:8px;align-items:center;margin:3px 0;color:#ddd}
.vt .bz .bt{background:#151515;height:9px;border-radius:2px;overflow:hidden}.vt .bz .bt span{display:block;height:100%;background:#ffb000}
.vt .vtchart{background:var(--card);color:var(--ink);border-radius:6px;padding:6px;font-family:-apple-system,system-ui,sans-serif}
.vt .vtchart *{font-family:inherit}
.vt table.kette td,.vt table.kette th{vertical-align:top;white-space:normal;text-align:left}.vt table.kette .kt{display:block;line-height:1.35}
.vt #kette-q{flex:1;text-transform:none}
@media(max-width:700px){.vt table.kette tr:first-child{display:none}.vt table.kette,.vt table.kette tbody,.vt table.kette tr,.vt table.kette td{display:block;width:auto}
.vt table.kette tr{border-bottom:1px solid #333;padding:6px 0}.vt table.kette td{border:0;padding:2px 0}.vt table.kette td:first-child{font-size:14px}
.vt table.kette td[data-l]::before{content:attr(data-l);display:block;color:#888;font-size:11px;text-transform:uppercase;margin-top:4px}}`;
  document.head.appendChild(css);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nf = (d) => new Intl.NumberFormat("de-DE",{minimumFractionDigits:d, maximumFractionDigits:d});
  const N = (x,d=1) => x==null||!isFinite(x) ? "–" : nf(d).format(x);
  const PC = (x,d=1,sig=false) => x==null||!isFinite(x) ? "–" : `<span class="${sig?(x>0?"up":x<0?"down":""):""}">${sig&&x>0?"+":""}${nf(d).format(x*100)} %</span>`;
  const GR = x => { if(x==null||!isFinite(x)) return "–"; const a=Math.abs(x); return a>=1e12?N(x/1e12,1)+" Bio.":a>=1e9?N(x/1e9,1)+" Mrd.":a>=1e6?N(x/1e6,1)+" Mio.":N(x,0); };
  const datei = t => t.replace(/[^A-Za-z0-9.\-]/g,"_") + ".json";
  const cache = {}; let index = null;
  async function lade(t){ if(cache[t] !== undefined) return cache[t];
    try{ const r = await fetch("terminal/" + datei(t), {cache:"no-cache"}); cache[t] = r.ok ? await r.json() : null; }catch(e){ cache[t] = null; } return cache[t]; }
  async function ladeIndex(){ if(index) return index; try{ const r = await fetch("terminal/index.json", {cache:"no-cache"}); index = r.ok ? (await r.json()).aktien || {} : {}; }catch(e){ index = {}; } return index; }
  const woerter = s => String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(w=>w.length>=3 && !["inc","corp","the","group","holding","holdings","company","limited","plc","ltd","corporation","publ"].includes(w));
  // Ticker oder Firmenname -> Scanner-Eintrag
  function finde(q){
    q = String(q||"").trim(); if(!q) return null;
    const U = q.toUpperCase(); if(BY[U]) return BY[U];
    const S = Object.values(BY), W = woerter(q);
    const exakt = S.find(s => s.t.split(".")[0] === U); if(exakt) return exakt;
    if(!W.length) return null;
    let best = null, bs = 0;
    for(const s of S){ const n = woerter(s.n); const sc = W.filter(w=>n.some(x=>x.startsWith(w))).length + (n[0] && n[0].startsWith(W[0]) ? 1 : 0); if(sc > bs){ bs = sc; best = s; } }
    return bs ? best : null;
  }
  const verlinkt = (name, q) => { const s = finde(name); const n = s && woerter(s.n), w = woerter(name);
    if(s && n.length && w.length && (n[0] === w[0])) return `<a data-vt="${esc(s.t)} DES">${esc(name)}</a>`;
    return q && /^Q\d+$/.test(q) ? `<a data-vt="WD:${q} REL" title="Nicht im Scanner – bei Wikidata nachschlagen">${esc(name)}</a>` : esc(name); };
  const peers = s => Object.values(BY).filter(x => x.grp && x.grp === s.grp).sort((a,b)=>(b.mcap_eur||0)-(a.mcap_eur||0));

  // Großeigentümer mit Anteil aus Wikidata (z. B. Staatsanteile bei Airbus – die kennt Yahoo nicht)
  const wdEig = d => { const L = ((d && d.netz2) || {}).eigentuemer || []; if(!L.length) return "";
    return `<h4>Großeigentümer (Wikidata)</h4><table><tr><th>Name</th><th>Anteil</th><th>Stand</th></tr>${L.map(x=>`<tr><td><a data-vt="WHO ${esc(x.name)}">${esc(x.name)}</a></td><td>${x.anteil!=null?PC(x.anteil,1):"–"}</td><td class="mut">${esc((x.stand||"").split("-").reverse().join("."))}</td></tr>`).join("")}</table>`; };
  function HDS(s, d){
    const a = d && d.aktionaere;
    if(!a) return `${kopf(s)}${wdEig(d)||`<div class="mut" style="margin-top:8px">Aktionärsdaten werden gerade gesammelt.</div>`}`;
    const tab = (L, titel) => L && L.length ? `<h4>${titel}</h4><div class="scroll"><table><tr><th>Name</th><th>Anteil</th><th>Stück</th><th>Wert</th><th>Δ</th><th>Stand</th></tr>
      ${L.map(x=>`<tr><td><a data-vt="WHO ${esc(x.name)}">${esc(x.name)}</a></td><td>${PC(x.anteil,2)}</td><td>${GR(x.stueck)}</td><td>${GR(x.wert)}</td><td>${PC(x.veraenderung,1,true)}</td><td class="mut">${esc(x.stand||"")}</td></tr>`).join("")}</table></div>` : "";
    return `${kopf(s)}
      <h4>Wem gehört die Firma?</h4><div class="kv"><div><span class="mut">Insider</span><span>${PC(a.insider_anteil,1)}</span></div><div><span class="mut">Institutionen</span><span>${PC(a.inst_anteil,1)}</span></div>
        <div><span class="mut">… vom Streubesitz</span><span>${PC(a.inst_streubesitz,1)}</span></div><div><span class="mut">Anzahl Institutionen</span><span>${a.inst_anzahl?N(a.inst_anzahl,0):"–"}</span></div></div>
      ${a.nur_us_meldungen?`<div class="mut" style="white-space:normal;margin-top:4px">⚠ Nicht-US-Aktie: Yahoo kennt nur Fonds, die in den USA melden müssen. Große Ankeraktionäre (Familien, Staaten, Stiftungen) stehen – soweit bekannt – oben aus Wikidata.</div>`:""}
      ${wdEig(d)}${tab(a.institutionen, "Größte Institutionen")}${tab(a.fonds, "Größte Fonds")}
      ${(a.insider||[]).length?`<h4>Insider-Bestände</h4><table><tr><th>Name</th><th>Rolle</th><th>Stück</th><th>Letzte Aktion</th></tr>${a.insider.map(x=>`<tr><td>${esc(x.name)}</td><td class="mut">${esc(x.rolle||"")}</td><td>${GR(x.stueck)}</td><td class="mut">${esc(x.letzte||"")} ${esc(x.stand||"")}</td></tr>`).join("")}</table>`:""}
      <div class="mut" style="margin-top:6px">Quellen: Yahoo Finance (Pflichtmeldungen, meist Quartalsstand), Wikidata</div>`;
  }
  async function REL(s, d, nurKette=false){
    const n = (d && d.netz) || {}, m = await mitKette(s, (d && d.netz2) || {}), g = m.lei_register || {};
    const hin = t => `<div class="mut" style="white-space:normal">${t}</div>`;
    const gruppe = (L, titel, h="") => (L||[]).length ? `<h4>${titel}</h4>${h?hin(h):""}<div>${L.map(x=>`<span class="tag">${verlinkt(x)}</span>`).join("")}</div>` : "";
    const anteile = (L, titel) => (L||[]).length ? `<h4>${titel}</h4><table>${L.map(x=>`<tr><td>${verlinkt(x.name, x.q)}</td><td>${x.anteil!=null?PC(x.anteil,1):"–"}</td><td class="mut">${esc((x.stand||"").split("-").reverse().join("."))}</td></tr>`).join("")}</table>` : "";
    const rang = (L, titel, spalte, h) => (L||[]).length ? `<h4>${titel}</h4>${hin(h)}<div class="scroll"><table><tr><th>Firma</th><th>${spalte}</th></tr>${L.map(x=>`<tr><td>${x.kur ? firmaLink(x) : verlinkt(x.name, x.q)}</td><td class="${x.was?"mut":""}" style="${x.was?"white-space:normal;text-align:left":""}">${x.was ? esc(x.was) : x.n}</td></tr>`).join("")}</table></div>` : "";
    const partner = [...new Set([...(n.partner||[]), ...(m.partner||[])])];
    const kette = rang(m.kunden, "Kunden", "Was / Modelle", "Wer ihre Produkte kauft oder einsetzt. Mit Beschreibung = bekannte Geschäftsbeziehung; mit Zahl = aus Wikidata (wie viele Modelle sie betreiben).")
      + rang(m.lieferanten, "Lieferanten", "Was / Teile", "Wer ihnen zuliefert (z. B. Chips, Triebwerke, Maschinen). Mit Beschreibung = bekannte Geschäftsbeziehung; mit Zahl = aus Wikidata.")
      + `<div class="mut" style="margin-top:4px"><a data-vt="KETTE">Alle Lieferketten als Tabelle ›</a></div>`
      + gruppe(partner, "Partnerschaften");
    const P2 = s.privat ? [] : peers(s).filter(x=>x.t!==s.t).slice(0,10);
    const toechter = (m.toechter||[]).length ? `<h4>Tochterfirmen</h4>${hin("Aktive Töchter, bekannteste zuerst – in Klammern bekannter Zweitname, dahinter der Sitz.")}<div>${m.toechter.map(x=>`<span class="tag">${verlinkt(x.name, x.q)}${x.alias?` <span class="w">(${esc(x.alias)})</span>`:""}${x.sitz?` <span class="mut">· ${esc(x.sitz)}</span>`:""}</span>`).join("")}</div>` : gruppe(n.toechter, "Tochterfirmen");
    // gemeinsame Großaktionäre: wer unter den Top 5 dieser Aktie hält noch welche deiner Depot-Aktien?
    let gemein = "";
    const idx = await ladeIndex(), meine = ((P.depot||{}).positionen||[]).map(z=>z.t).filter(t=>t && t!==s.t && idx[t]);
    const top = (idx[s.t] && idx[s.t].h) || [];
    if(!nurKette && top.length && meine.length){
      const z = top.map(([h]) => [h, meine.filter(t => (idx[t].h||[]).some(([x]) => x === h))]).filter(([,L])=>L.length);
      if(z.length) gemein = `<h4>Gleiche Großaktionäre wie in deinem Depot</h4>${z.map(([h,L])=>`<div><a data-vt="WHO ${esc(h)}">${esc(h)}</a> <span class="mut">auch bei</span> ${L.slice(0,8).map(t=>`<a data-vt="${esc(t)} DES">${esc((BY[t]||{}).n||t)}</a>`).join(", ")}</div>`).join("")}`;
    }
    const lei = (g.toechter||[]).length || g.oberste_mutter ? `<h4>Rechtliche Konzernstruktur (LEI-Register)</h4>${hin(`${g.oberste_mutter?`Oberste Mutter: <span class="w">${esc(g.oberste_mutter.name)}</span> ${esc(g.oberste_mutter.land||"")} · `:""}${g.toechter_anzahl?`${N(g.toechter_anzahl,0)} direkte Tochtergesellschaften${g.toechter_anzahl>(g.toechter||[]).length?` (${(g.toechter||[]).length} gezeigt)`:""}`:""}`)}
      <div>${(g.toechter||[]).map(x=>`<span class="tag">${esc(x.name)} <span class="mut">${esc(x.land||"")}</span></span>`).join("")}</div>` : "";
    const konzern = gruppe(n.mutter, "Gehört zu")
      + ((m.eigentuemer||[]).length ? anteile(m.eigentuemer, "Großeigentümer") : gruppe(n.eigentuemer, "Großeigentümer"))
      + ((m.beteiligungen||[]).length ? anteile(m.beteiligungen, "Beteiligungen") : gruppe(n.beteiligungen, "Beteiligungen / übernommen"))
      + toechter + gruppe(n.sparten, "Sparten") + gruppe(m.produkte, "Bekannte Produkte")
      + lei + gruppe(n.gruender, "Gründer") + gruppe(n.chef, "Chef / Führung");
    const hatKette = kette.trim().length > 0, hatAlles = hatKette || konzern.trim().length > 0;
    const sammelt = !(d && d.n2_stand);
    const leer = nurKette ? (!hatKette ? hin(sammelt ? "Kunden und Lieferanten werden gerade gesammelt – deine Depot-Werte zuerst, alle anderen nach und nach." : "Zu dieser Firma sind keine Kunden- oder Lieferantenbeziehungen erfasst. Am besten klappt das bei Herstellern von Flugzeugen, Fahrzeugen, Chips und Geräten.") : "")
      : (!hatAlles ? hin(d && d.w_stand ? "Zu dieser Firma hat Wikidata keine Verflechtungen eingetragen." : "Verflechtungen werden gerade gesammelt.") : "");
    return `${kopf(s)}
      ${netzGrafik(s, n, m, nurKette)}
      ${nurKette ? kette : kette + konzern}${leer}
      ${!nurKette && !hatKette && sammelt && hatAlles ? hin("Kunden und Lieferanten werden noch gesammelt.") : ""}
      ${gemein}
      ${!nurKette && P2.length?`<h4>Gleiche Branche (${esc(s.grp)})</h4><div>${P2.map(x=>`<span class="tag"><a data-vt="${esc(x.t)} DES">${esc(x.n)}</a></span>`).join("")}</div>`:""}
      <div class="mut" style="margin-top:6px;white-space:normal">Quellen: Wikidata (frei, von Freiwilligen gepflegt – nicht vollständig, aber unabhängig von Yahoo) und GLEIF (offizielles weltweites Register der Rechtsträger, LEI). Wer welche Modelle betreibt, ist kein Umsatzanteil – Bloomberg-Daten mit Umsatzanteilen je Kunde gibt es nur kostenpflichtig.</div>`;
  }
  function RV(s){
    const L = peers(s);
    if(L.length < 2) return `${kopf(s)}<div class="mut" style="margin-top:8px">Keine Vergleichsfirmen in derselben Branche im Scanner.</div>`;
    const med = k => { const v = L.map(x=>x[k]).filter(x=>x!=null&&isFinite(x)).sort((a,b)=>a-b); return v.length ? v[Math.floor(v.length/2)] : null; };
    const zeile = x => `<tr class="${x.t===s.t?"me":""}"><td><a data-vt="${esc(x.t)} DES">${esc(x.n)}</a></td><td>${GR(x.mcap_eur)}</td><td>${N(x.kgv,1)}</td><td>${N(x.kgv_fwd,1)}</td><td>${PC(x.marge,0)}</td><td>${PC(x.fcfm,0)}</td><td>${PC(x.roe,0)}</td><td>${PC(x.div,1)}</td><td>${PC(x.r1y,0,true)}</td><td>${x.moat!=null?N(x.moat,0):"–"}</td><td>${x.score!=null?N(x.score,0):"–"}</td></tr>`;
    return `${kopf(s)}<h4>Vergleich: ${esc(s.grp)} (${L.length})</h4><div class="scroll"><table>
      <tr><th>Firma</th><th>Wert €</th><th>KGV</th><th>KGV e.</th><th>Marge</th><th>FCF</th><th>EKR</th><th>Div.</th><th>1J</th><th>Burg.</th><th>Score</th></tr>
      ${L.slice(0,15).map(zeile).join("")}
      <tr><td class="mut">Median</td><td></td><td>${N(med("kgv"),1)}</td><td>${N(med("kgv_fwd"),1)}</td><td>${PC(med("marge"),0)}</td><td>${PC(med("fcfm"),0)}</td><td>${PC(med("roe"),0)}</td><td>${PC(med("div"),1)}</td><td>${PC(med("r1y"),0,true)}</td><td></td><td></td></tr></table></div>`;
  }
  async function WHO(q){
    const idx = await ladeIndex(), W = woerter(q);
    if(!W.length) return `<div class="mut">Wen suchst du? Beispiel: <a data-vt="WHO Berkshire">WHO Berkshire</a>, <a data-vt="WHO Norges">WHO Norges</a></div>`;
    const L = [];
    for(const [t, v] of Object.entries(idx)) for(const [h, a] of (v.h||[])){ const n = woerter(h); if(W.every(w=>n.some(x=>x.startsWith(w)))) L.push({t, h, a}); }
    L.sort((x,y)=>(y.a||0)-(x.a||0));
    const meine = new Set(((P.depot||{}).positionen||[]).map(z=>z.t));
    return `<div class="w" style="font-size:15px"><b>Wer hält was: ${esc(q)}</b></div><div class="mut">Aktien, bei denen „${esc(q)}“ unter den 5 größten Institutionen ist (${L.length})</div>
      ${L.length?`<div class="scroll"><table><tr><th>Aktie</th><th>Aktionär</th><th>Anteil</th></tr>${L.slice(0,60).map(x=>`<tr class="${meine.has(x.t)?"me":""}"><td><a data-vt="${esc(x.t)} HDS">${esc((BY[x.t]||{}).n||x.t)}</a>${meine.has(x.t)?' <span class="mut">· im Depot</span>':""}</td><td class="mut">${esc(x.h)}</td><td>${PC(x.a,2)}</td></tr>`).join("")}</table></div>`:`<div class="mut" style="margin-top:6px">Nichts gefunden – die Daten werden noch gesammelt, oder der Name ist anders geschrieben.</div>`}`;
  }
  async function MEIN(){
    const D = P.depot; if(!D) return `<div class="mut">Dafür muss dieses Gerät mit deinem Depot verbunden sein.</div>`;
    const idx = await ladeIndex(), Z = (D.positionen||[]).filter(z=>z.t && idx[z.t] && idx[z.t].h);
    const zaehl = {};
    for(const z of Z) for(const [h, a] of idx[z.t].h){ const e = zaehl[h] = zaehl[h] || {h, L:[], w:0}; e.L.push(z); e.w += (z.wert||0) * (a||0); }
    const L = Object.values(zaehl).sort((a,b)=>b.L.length-a.L.length || b.w-a.w).slice(0,15);
    // Wie viel Depot-Wert hängt (direkt und über ETFs) an welchen Firmen? Alles wird nur hier auf dem Gerät gerechnet.
    const V = (D.positionen||[]).reduce((a,z)=>a+(z.wert||0),0) || 1, X = {};
    const plus = (t, w, wie) => { if(!t || !BY[t] || !(w>0)) return; const e = X[t] = X[t] || {t, w:0, wie:new Set()}; e.w += w; e.wie.add(wie); };
    for(const z of D.positionen||[]) if(z.t && BY[z.t] && !/ETF|FUND/.test(z.art||"")) plus(z.t, z.wert, "direkt");
    for(const e of ((D.durchblick||{}).etfs||[])) for(const [sym, nm, gw] of e.top||[]) plus(String(sym||"").toUpperCase(), (e.wert||0)*(gw||0)*(e.hebel||1), "ETF");
    const T = Object.values(X).sort((a,b)=>b.w-a.w).slice(0, 60);
    const kette = {lief:{}, kund:{}}; let mitDaten = 0;   // aus der einen Übersichtsdatei – keine Einzelabrufe je Depot-Aktie
    await ladeKette();
    T.forEach(x=>{ const m = idx[x.t] || {}, kx = kettenFuer(BY[x.t]);
      const lief = [...kx.L.map(e=>[null, e.name, e.t]), ...(m.l||[])], kund = [...kx.K.map(e=>[null, e.name, e.t]), ...(m.k||[])];
      if(lief.length || kund.length) mitDaten++;
      for(const [art, liste] of [["lief", lief], ["kund", kund]]) for(const [q, name, t] of liste){
        const k = t || q || nameKey(name), o = kette[art][k] = kette[art][k] || {name, q, t, w:0, F:[]}; if(!o.F.includes(x.t)){ o.F.push(x.t); o.w += x.w; } } });
    const tab = (o, titel, h) => { const L2 = Object.values(o).sort((a,b)=>b.w-a.w).slice(0,10); if(!L2.length) return "";
      return `<h4>${titel}</h4><div class="mut" style="white-space:normal">${h}</div><div class="scroll"><table><tr><th>Firma</th><th>hängt dran</th><th>über</th></tr>${L2.map(x=>{ const c = x.t && BY[x.t] ? `${x.t} SPLC` : zielCmd(x.name, x.q, "SPLC") || `${x.name} SPLC`;
        return `<tr><td>${c?`<a data-vt="${esc(c)}">${esc(x.name)}</a>`:esc(x.name)}</td><td>${PC(x.w/V,1)}</td><td style="white-space:normal;text-align:left">${x.F.slice(0,5).map(t=>`<a data-vt="${esc(t)} SPLC">${esc((BY[t]||{}).n||t)}</a>`).join(", ")}${x.F.length>5?" …":""}</td></tr>`; }).join("")}</table></div>`; };
    const G = await ladeGuru(), meine = new Set((D.positionen||[]).map(z=>z.t).filter(Boolean));
    const gz = {}; for(const f of G.fonds||[]) for(const p of f.pos) if(p.t && meine.has(p.t)){ const e = gz[p.t] = gz[p.t] || []; e.push({f, p}); }
    const gL = Object.entries(gz).sort((a,b)=>b[1].length-a[1].length);
    return `<div class="w" style="font-size:15px"><b>Mein Netz</b></div><div class="mut" style="white-space:normal">Welche Großaktionäre stecken in wie vielen deiner Aktien (unter den Top 5)? ${Z.length} deiner Positionen haben schon Daten.</div>
      ${L.length?`<div class="scroll"><table><tr><th>Großaktionär</th><th>in deinen Aktien</th></tr>${L.map(x=>`<tr><td><a data-vt="WHO ${esc(x.h)}">${esc(x.h)}</a></td><td style="white-space:normal;text-align:left">${x.L.length}: ${x.L.slice(0,6).map(z=>`<a data-vt="${esc(z.t)} HDS">${esc(z.name)}</a>`).join(", ")}${x.L.length>6?" …":""}</td></tr>`).join("")}</table></div>`:`<div class="mut" style="margin-top:6px">Noch keine Aktionärsdaten zu deinen Positionen – kommt mit den nächsten Läufen.</div>`}
      ${tab(kette.lief, "Lieferketten-Abhängigkeit", `Von welchen Zulieferern hängen deine Firmen ab – direkt gehalten und über deine ETFs? „hängt dran“ = Anteil deines Depots in Firmen mit diesem Lieferanten. ${mitDaten} von ${T.length} Firmen haben Lieferketten-Daten (am besten bei Flugzeugen, Fahrzeugen, Chips, Geräten).`)}
      ${tab(kette.kund, "Wichtige Kunden deiner Firmen", "Wer setzt die Produkte deiner Firmen ein? Fällt so ein Kunde aus, trifft es diesen Teil deines Depots.")}
      ${!mitDaten && T.length ? `<div class="mut" style="margin-top:6px;white-space:normal">Zu deinen Firmen sind noch keine Kunden/Lieferanten erfasst – sie werden nach und nach gesammelt.</div>` : ""}
      ${gL.length?`<h4>Superinvestoren in deinem Depot</h4><div class="scroll"><table><tr><th>Deine Aktie</th><th>gehalten von</th></tr>${gL.map(([t, A])=>`<tr><td><a data-vt="${esc(t)} GURU">${esc((BY[t]||{}).n||t)}</a></td><td style="white-space:normal;text-align:left">${A.map(({f,p})=>`<a data-vt="GURU ${esc(f.id)}">${esc(f.name)}</a> ${aend(p)}`).join(" · ")}</td></tr>`).join("")}</table></div>`:""}
      <div class="mut" style="margin-top:6px;white-space:normal">Wird nur auf diesem Gerät berechnet: Die App lädt dafür nur die allgemeinen Übersichtsdateien, nichts Depot-Bezogenes.</div>`;
  }
  /* ---------- Superinvestoren (13F-Meldungen an die SEC) ---------- */
  let guru = null;
  async function ladeGuru(){ if(guru) return guru; try{ const r = await fetch("terminal/guru.json", {cache:"no-cache"}); guru = r.ok ? await r.json() : {fonds:[]}; }catch(e){ guru = {fonds:[]}; } return guru; }
  const qName = r => r ? `Q${Math.ceil(+r.slice(5,7)/3)} ${r.slice(0,4)}` : "";
  const dDE = x => (x||"").split("-").reverse().join(".");
  const aend = p => p.a==="neu" ? `<span class="up">NEU</span>` : p.a==="plus" ? `<span class="up">▲ ${p.d!=null?"+"+N(p.d*100,0)+" %":""}</span>` : p.a==="minus" ? `<span class="down">▼ ${p.d!=null?N(p.d*100,0)+" %":""}</span>` : p.a==="=" ? `<span class="mut">unverändert</span>` : `<span class="mut">–</span>`;
  const gLink = (t, n) => t && BY[t] ? `<a data-vt="${esc(t)} GURU">${esc((BY[t]||{}).n || n)}</a>` : esc(n);
  const meineT = () => new Set(((P.depot||{}).positionen||[]).map(z=>z.t).filter(Boolean));
  const gHinweis = `<div class="mut" style="white-space:normal;margin-top:8px">Quelle: Pflichtmeldungen 13F an die US-Börsenaufsicht SEC. Gemeldet werden nur US-Aktien, bis 45 Tage nach Quartalsende – also ein Blick zurück, kein Echtzeit-Signal. „Aufgestockt/reduziert“ = Stückzahl ±5 % zum Vorquartal.</div>`;
  function guruFonds(G, q){ const W = woerter(q); if(!W.length) return null;
    return G.fonds.find(f => f.id === q.toLowerCase()) || G.fonds.find(f => { const n = woerter(f.name + " " + f.wer); return W.every(w=>n.some(x=>x.startsWith(w))); }) || null; }
  async function GURU(rest){
    const G = await ladeGuru(), F = G.fonds || [];
    if(!F.length) return `<div class="w" style="font-size:15px"><b>Superinvestoren</b></div><div class="mut" style="margin-top:6px">Die Meldungen werden gerade zum ersten Mal von der SEC geholt – schau in ein paar Minuten wieder rein.</div>`;
    const meine = meineT();
    const fd = rest ? guruFonds(G, rest) : null;
    if(fd){
      return `<div class="w" style="font-size:15px"><b>${esc(fd.name)}</b> <span class="mut">${esc(fd.wer)}</span></div>
        <div class="mut">${qName(fd.quartal)} · gemeldet am ${dDE(fd.eingereicht)} · ${fd.n} Aktien · ${GR(fd.wert)} $${fd.vorquartal?` · Vergleich mit ${qName(fd.vorquartal)}`:""}</div>
        <div class="scroll"><table><tr><th>Firma</th><th>Anteil</th><th>Wert $</th><th>Änderung</th></tr>
        ${fd.pos.map(p=>`<tr class="${meine.has(p.t)?"me":""}"><td>${gLink(p.t, p.n)}${meine.has(p.t)?' <span class="mut">· im Depot</span>':""}</td><td>${PC(p.w,1)}</td><td>${GR(p.v)}</td><td>${aend(p)}</td></tr>`).join("")}</table></div>
        ${fd.raus.length?`<h4>Komplett verkauft</h4><div>${fd.raus.map(x=>`<span class="tag">${gLink(x.t, x.n)} <span class="mut">war ${PC(x.w_alt,1)}</span></span>`).join("")}</div>`:""}
        <div style="margin-top:6px"><a data-vt="GURU">‹ alle Superinvestoren</a></div>${gHinweis}`;
    }
    if(rest){
      const s = finde(rest);
      if(!s) return `<div class="down">Nicht gefunden: ${esc(rest)}</div><div class="mut">Beispiele: <a data-vt="GURU">GURU</a> · <a data-vt="GURU BUFFETT">GURU BUFFETT</a> · <a data-vt="MSFT GURU">MSFT GURU</a></div>`;
      const halten = F.map(f=>({f, p:f.pos.find(p=>p.t && p.t===s.t)})).filter(x=>x.p).sort((a,b)=>b.p.w-a.p.w);
      const weg = F.map(f=>({f, r:f.raus.find(r=>r.t && r.t===s.t)})).filter(x=>x.r);
      return `${kopf(s)}<h4>Superinvestoren mit ${esc(s.n)} (${halten.length} von ${F.length})</h4>
        ${halten.length?`<div class="scroll"><table><tr><th>Investor</th><th>Anteil am Fonds</th><th>Wert $</th><th>Letztes Quartal</th></tr>${halten.map(({f,p})=>`<tr><td><a data-vt="GURU ${esc(f.id)}">${esc(f.name)}</a> <span class="mut">${esc(f.wer)}</span></td><td>${PC(p.w,1)}</td><td>${GR(p.v)}</td><td>${aend(p)}</td></tr>`).join("")}</table></div>`
          :`<div class="mut">Keiner der beobachteten Investoren hält ${esc(s.n)}${/\.[A-Z]+$/.test(s.t)?" – 13F erfasst nur US-Aktien":""}.</div>`}
        ${weg.length?`<h4>Zuletzt komplett verkauft</h4><div>${weg.map(({f,r})=>`<span class="tag"><a data-vt="GURU ${esc(f.id)}">${esc(f.name)}</a> <span class="mut">war ${PC(r.w_alt,1)}</span></span>`).join("")}</div>`:""}${gHinweis}`;
    }
    // Überblick: was wurde im letzten Quartal gekauft/verkauft – über alle Fonds
    const agg = {};
    const add = (t, n, art, f, w) => { const k = t || n; const e = agg[k] = agg[k] || {t, n, neu:[], plus:[], minus:[], raus:[], halten:0, w:0}; e[art] && e[art].push(f); e.w += w || 0; };
    for(const f of F){ for(const p of f.pos){ add(p.t, p.n, p.a, f, p.w); agg[p.t || p.n].halten++; } for(const r of f.raus) add(r.t, r.n, "raus", f, 0); }
    const A = Object.values(agg);
    const liste = (art, titel, h) => { const L = A.filter(x=>x[art].length).sort((a,b)=>b[art].length-a[art].length || b.w-a.w).slice(0,12);
      return L.length ? `<h4>${titel}</h4>${h?`<div class="mut">${h}</div>`:""}<div class="scroll"><table>${L.map(x=>`<tr class="${meine.has(x.t)?"me":""}"><td>${gLink(x.t, x.n)}${meine.has(x.t)?' <span class="mut">· im Depot</span>':""}</td><td style="text-align:left;white-space:normal">${x[art].map(f=>`<a data-vt="GURU ${esc(f.id)}">${esc(f.name)}</a>`).join(", ")}</td></tr>`).join("")}</table></div>` : ""; };
    const beliebt = A.filter(x=>x.halten>=2).sort((a,b)=>b.halten-a.halten || b.w-a.w).slice(0,15);
    return `<div class="w" style="font-size:15px"><b>Superinvestoren</b></div><div class="mut" style="white-space:normal">Was ${F.length} bekannte Langfrist-Investoren zuletzt gekauft und verkauft haben. Tippe auf einen Namen für sein ganzes Depot.</div>
      ${liste("neu","Neu gekauft")}${liste("plus","Aufgestockt")}${liste("minus","Reduziert")}${liste("raus","Komplett verkauft")}
      ${beliebt.length?`<h4>Bei mehreren gleichzeitig im Depot</h4><div class="scroll"><table><tr><th>Firma</th><th>bei</th></tr>${beliebt.map(x=>`<tr class="${meine.has(x.t)?"me":""}"><td>${gLink(x.t, x.n)}</td><td>${x.halten} von ${F.length}</td></tr>`).join("")}</table></div>`:""}
      <h4>Die Investoren</h4><div class="scroll"><table><tr><th>Investor</th><th>Quartal</th><th>Aktien</th><th>Größte Position</th></tr>
      ${F.map(f=>`<tr><td><a data-vt="GURU ${esc(f.id)}">${esc(f.name)}</a> <span class="mut">${esc(f.wer)}</span></td><td class="mut">${qName(f.quartal)}</td><td>${f.n}</td><td>${f.pos[0]?`${gLink(f.pos[0].t, f.pos[0].n)} <span class="mut">${PC(f.pos[0].w,0)}</span>`:"–"}</td></tr>`).join("")}</table></div>${gHinweis}`;
  }
  async function guruKurz(s){ const G = await ladeGuru(); const L = (G.fonds||[]).map(f=>({f, p:f.pos.find(p=>p.t && p.t===s.t)})).filter(x=>x.p);
    return L.length ? `<h4>Superinvestoren</h4><div>${L.map(({f,p})=>`<span class="tag"><a data-vt="GURU ${esc(f.id)}">${esc(f.name)}</a> <span class="mut">${PC(p.w,1)}</span> ${aend(p)}</span>`).join("")} <a data-vt="${esc(s.t)} GURU">mehr ›</a></div>` : ""; }
  /* ---------- Bekannte Lieferketten (kuratiert) + Wikidata ---------- */
  let KET = null;
  const nameKey = x => woerter(x).join(" ");
  async function ladeKette(){
    if(KET) return KET; let j = {kanten:[]};
    try{ const r = await fetch("lieferketten.json", {cache:"no-cache"}); if(r.ok) j = await r.json(); }catch(e){}
    const tick = (name, tk) => { for(const t of String(tk||"").split("|").filter(Boolean)) if(BY[t]) return t;
      const s = finde(name); if(s){ const a = woerter(s.n), w = woerter(name); if(a.length && w.length && a[0] === w[0]) return s.t; } return null; };
    KET = {E: (j.kanten||[]).map(([ln, lt, kn, kt, was]) => ({ln, lt: tick(ln, lt), kn, kt: tick(kn, kt), was})), quelle: j.quelle || "", stand: j.stand || ""};
    return KET;
  }
  function kettenFuer(s){
    const key = nameKey(s.n), L = [], K = [];
    if(!KET) return {L, K};
    const ist = (t, n) => t ? t === s.t : nameKey(n) === key;
    for(const e of KET.E){ if(ist(e.kt, e.kn)) L.push({name:e.ln, t:e.lt, was:e.was, kur:1}); if(ist(e.lt, e.ln)) K.push({name:e.kn, t:e.kt, was:e.was, kur:1}); }
    return {L, K};
  }
  async function mitKette(s, m){
    await ladeKette(); const kx = kettenFuer(s);
    const misch = (kur, wd) => { const out = kur.slice(); for(const x of wd||[]) if(!out.some(y=>nameKey(y.name)===nameKey(x.name))) out.push(x); return out; };
    const wd = L => (L||[]).filter(x => (x.n||0) >= 2);   // Wikidata-Treffer mit nur 1 Modell sind meist Zufall (z. B. eine Schule mit Apple-Geräten)
    return Object.assign({}, m, {kunden: misch(kx.K, wd(m.kunden)), lieferanten: misch(kx.L, wd(m.lieferanten))});
  }
  const firmaLink = (x, f="SPLC") => x.t && BY[x.t] ? `<a data-vt="${esc(x.t)} ${f}">${esc(x.name)}</a>` : x.q ? `<a data-vt="WD:${esc(x.q)} ${f}">${esc(x.name)}</a>` : x.kur ? `<a data-vt="${esc(x.name)} ${f}" title="Nicht im Scanner – bei Wikidata nachschlagen">${esc(x.name)}</a>` : esc(x.name);
  /* ---------- KETTE: alle Firmen mit Lieferanten und Kunden ---------- */
  async function KETTE(rest){
    await ladeKette(); const idx = await ladeIndex();
    const R = {}, zeile = (name, t) => { const k = t || nameKey(name); return R[k] = R[k] || {name: t && BY[t] ? BY[t].n : name, t, lief:{}, kund:{}}; };
    const add = (o, x) => { const k = x.t || nameKey(x.name); if(!o[k]) o[k] = x; };
    for(const e of KET.E){ add(zeile(e.ln, e.lt).kund, {name:e.kn, t:e.kt, was:e.was, kur:1}); add(zeile(e.kn, e.kt).lief, {name:e.ln, t:e.lt, was:e.was, kur:1}); }
    for(const [t, v] of Object.entries(idx)){ if(!BY[t]) continue;
      for(const [q, name] of v.l||[]) add(zeile(BY[t].n, t).lief, {name, q});
      for(const [q, name] of v.k||[]) add(zeile(BY[t].n, t).kund, {name, q}); }
    const meine = meineT(); let L = Object.values(R);
    const such = String(rest||"").trim().toLowerCase();
    if(such) L = L.filter(r => [r.name, r.t||"", ...Object.values(r.lief).map(x=>x.name), ...Object.values(r.kund).map(x=>x.name)].some(x=>String(x).toLowerCase().includes(such)));
    L.sort((a,b)=>(meine.has(b.t)-meine.has(a.t)) || (Object.keys(b.lief).length+Object.keys(b.kund).length) - (Object.keys(a.lief).length+Object.keys(a.kund).length));
    const liste = o => { const V = Object.values(o); return V.length ? V.slice(0,12).map(x=>`<span class="kt">${firmaLink(x)}${x.was?`<span class="mut"> · ${esc(x.was)}</span>`:""}</span>`).join("") + (V.length>12?` <span class="mut">+${V.length-12}</span>`:"") : '<span class="mut">–</span>'; };
    return `<div class="w" style="font-size:15px"><b>Lieferketten</b> <span class="mut">${L.length} Firmen${such?` mit „${esc(rest)}“`:""}</span></div>
      <form id="kette-f" style="display:flex;gap:6px;margin:6px 0"><input id="kette-q" value="${esc(rest||"")}" placeholder="Firma oder Lieferant filtern, z. B. TSMC, Airbus, SpaceX"><button class="go">Filtern</button></form>
      <div class="scroll"><table class="kette"><tr><th>Firma</th><th>Lieferanten</th><th>Kunden</th></tr>
      ${L.slice(0,250).map(r=>`<tr class="${meine.has(r.t)?"me":""}"><td>${firmaLink({name:r.name, t:r.t, kur:!r.t}, "SPLC")}${meine.has(r.t)?' <span class="mut">· im Depot</span>':""}</td><td data-l="Lieferanten">${liste(r.lief)}</td><td data-l="Kunden">${liste(r.kund)}</td></tr>`).join("")}</table></div>
      <div class="mut" style="margin-top:6px;white-space:normal">Quellen: ${esc(KET.quelle)} (Stand ${esc(KET.stand)}) sowie Wikidata (frei, lückenhaft). Umsatzanteile je Kunde gibt es nur kostenpflichtig (z. B. Bloomberg SPLC).</div>`;
  }
  /* ---------- Netz-Grafik: Firma in der Mitte, Lieferanten links, Kunden rechts, Eigentümer oben, Töchter unten ---------- */
  function zielCmd(name, q, f){ const s = finde(name); const a = s && woerter(s.n), w = woerter(name);
    if(s && a.length && w.length && a[0] === w[0]) return `${s.t} ${f}`; return q && /^Q\d+$/.test(q) ? `WD:${q} ${f}` : null; }
  function netzGrafik(s, n, m, nurKette){
    const f = nurKette ? "SPLC" : "REL";
    const nm = x => typeof x === "string" ? {name:x} : x;
    const G = {
      links: {L:(m.lieferanten||[]).map(nm), farbe:"#4aa3ff", titel:"Lieferanten", max:7},
      rechts: {L:(m.kunden||[]).map(nm), farbe:"#3fdc6c", titel:"Kunden", max:7},
      oben: nurKette ? {L:[...new Set([...(n.partner||[]), ...(m.partner||[])])].map(nm), farbe:"#ff7ab6", titel:"Partner", max:4}
                     : {L:((m.eigentuemer||[]).length ? m.eigentuemer : (n.mutter||[]).map(nm)), farbe:"#ffb000", titel:(m.eigentuemer||[]).length?"Eigentümer":"Gehört zu", max:4},
      unten: nurKette ? {L:[], max:0} : {L:(m.toechter||[]).length ? m.toechter : (n.toechter||[]).map(nm), farbe:"#b48cff", titel:"Töchter", max:4}};
    const summe = Object.values(G).reduce((a,g)=>a + Math.min(g.L.length, g.max), 0);
    if(summe < 2) return "";
    const W = Math.max(320, Math.min(760, ((document.getElementById("main")||{}).clientWidth || 360) - 34));
    const reihen = Math.max(Math.min(G.links.L.length, 7), Math.min(G.rechts.L.length, 7), 3), rh = 21;
    const oben = G.oben.L.length ? 62 : 10, mitte = reihen * rh + 10, unten = G.unten.L.length ? 62 : 10, H = oben + mitte + unten;
    const cx = W/2, cy = oben + mitte/2;
    const kurz = (t, z) => { t = String(t||""); return t.length > z ? t.slice(0, z-1) + "…" : t; };
    let linien = "", knoten = "";
    const knot = (x, y, lx, ly, anker, e, farbe, zeichen) => {
      const cmd = e.t && BY[e.t] ? `${e.t} ${f}` : zielCmd(e.name, e.q, f) || (e.kur ? `${e.name} ${f}` : null), label = esc(kurz(e.name, zeichen)) + (e.anteil!=null ? ` ${N(e.anteil*100,0)}%` : "");
      linien += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${farbe}" stroke-opacity=".45" stroke-width="1.2"/>`;
      const inner = `<title>${esc(e.name)}</title><circle cx="${x}" cy="${y}" r="4.5" fill="${farbe}"/><text x="${lx}" y="${ly}" text-anchor="${anker}" fill="${cmd?"#eee":"#999"}" font-size="10.5">${label}</text>`;
      knoten += cmd ? `<a data-vt="${esc(cmd)}" style="cursor:pointer">${inner}</a>` : `<g>${inner}</g>`;
    };
    const seite = (g, links) => { const L = g.L.slice(0, g.max), x = links ? W*0.32 : W*0.68, z = Math.max(8, Math.floor(W*0.30/6.2));
      L.forEach((e,i)=>{ const y = cy + (i - (L.length-1)/2) * rh; knot(x, y, links ? x-8 : x+8, y+3.5, links ? "end" : "start", e, g.farbe, z); });
      if(g.L.length > L.length) knoten += `<text x="${links ? x-8 : x+8}" y="${cy + ((L.length+1)/2) * rh + 2}" text-anchor="${links?"end":"start"}" fill="#777" font-size="9.5">+${g.L.length-L.length} weitere</text>`; };
    const band = (g, obenDran) => { const L = g.L.slice(0, g.max), zwei = L.length >= 3;   // ab 3 Namen zweizeilig versetzt
      const z = Math.max(7, Math.floor(W/Math.max(L.length,1)/(zwei ? 4.8 : 7)) - (L.some(e=>e.anteil!=null) ? 4 : 0));
      L.forEach((e,i)=>{ const x = W*(i+1)/(L.length+1), y = obenDran ? 40 : H-40, hoch = zwei && i % 2;
        knot(x, y, x, obenDran ? y - 9 - (hoch ? 13 : 0) : y + 16 + (hoch ? 13 : 0), "middle", e, g.farbe, z); }); };
    seite(G.links, true); seite(G.rechts, false); band(G.oben, true); band(G.unten, false);
    const zn = esc(kurz(s.n, 18)), bw = Math.min(150, zn.length*7 + 22);
    const mittelpunkt = `<rect x="${cx-bw/2}" y="${cy-13}" width="${bw}" height="26" rx="13" fill="#1a1300" stroke="#ffb000"/><text x="${cx}" y="${cy+4}" text-anchor="middle" fill="#ffb000" font-size="11.5" font-weight="700">${zn}</text>`;
    const leg = Object.values(G).filter(g=>g.L.length).map(g=>`<span style="color:${g.farbe}">●</span> ${g.titel} (${g.L.length})`).join(" &nbsp; ");
    return `<h4>Netz</h4><div style="background:#050505;border:1px solid #222;border-radius:4px;padding:4px;overflow:hidden"><svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px;font-family:inherit" role="img" aria-label="Netz von ${zn}">${linien}${knoten}${mittelpunkt}</svg></div>
      <div class="mut" style="font-size:11px;margin-top:3px">${leg} · Tippen öffnet die Firma</div>`;
  }
  /* ---------- Firmen außerhalb des Scanners (SpaceX, HypoVereinsbank, Bosch …): live aus Wikidata ----------
     Nur auf ausdrückliche Suche hin; Wikidata (gemeinnützig) sieht dabei den Firmennamen, nie Depotdaten. */
  const privat = {};
  async function sparql(q){
    const r = await fetch("https://query.wikidata.org/sparql", {method:"POST", headers:{Accept:"application/sparql-results+json","Content-Type":"application/x-www-form-urlencoded"}, body:"query="+encodeURIComponent(q)});
    if(!r.ok) throw new Error("Wikidata " + r.status);
    return (await r.json()).results.bindings.map(b=>Object.fromEntries(Object.entries(b).map(([k,v])=>[k, v.type==="uri" ? v.value.split("/").pop() : v.value])));
  }
  const okL = x => x && !/^Q\d+$/.test(x);
  async function wdSuche(text){
    const m = String(text).match(/^WD:(Q\d+)$/i); if(m) return m[1].toUpperCase();
    const r = await fetch("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&language=de&uselang=de&type=item&limit=8&search=" + encodeURIComponent(text));
    const ids = (((await r.json()) || {}).search || []).map(x=>x.id).filter(i=>/^Q\d+$/.test(i)); if(!ids.length) return null;
    const z = await sparql(`SELECT ?x WHERE { VALUES ?x { ${ids.map(i=>"wd:"+i).join(" ")} } FILTER EXISTS { ?x wdt:P452|wdt:P1128|wdt:P159|wdt:P749|wdt:P355|wdt:P1278|wdt:P414|wdt:P1056|wdt:P2139 ?y } }`);
    const ok = new Set(z.map(r=>r.x)); return ids.find(i=>ok.has(i)) || null;
  }
  const rangL = (z, n=20) => { const d = {}; for(const r of z){ if(!okL(r.xLabel)) continue; const a = d[r.x]; if(!a || +r.n > +a.n) d[r.x] = r; }
    return Object.values(d).sort((a,b)=>(+b.n - +a.n) || (+b.bek - +a.bek)).slice(0,n).map(r=>({q:r.x, name:r.xLabel, n:+r.n})); };
  async function wdFirma(q){
    const W = `wd:${q}`, L = `SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }`;
    // Qualifier nur innerhalb der Aussage-Zweige abfragen (sonst durchsucht Wikidata alle Aussagen -> Timeout)
    const ST = (p, art, mitAnteil) => `{ ${W} p:${p} ?st . ?st ps:${p} ?y . BIND("${art}" AS ?art) FILTER NOT EXISTS { ?st pq:P582 ?e }${mitAnteil ? " OPTIONAL { ?st pq:P1107 ?anteil } OPTIONAL { ?st pq:P585 ?zeit }" : ""} }`;
    const [basis, rel, kinder] = await Promise.all([
      sparql(`SELECT ?xLabel ?xDescription ?web ?lei ?sitzLabel ?ma ?gr ?indLabel ?boerse WHERE { VALUES ?x { ${W} } OPTIONAL{?x wdt:P856 ?web} OPTIONAL{?x wdt:P1278 ?lei}
        OPTIONAL{?x wdt:P159 ?sitz} OPTIONAL{?x wdt:P1128 ?ma} OPTIONAL{?x wdt:P571 ?gr} OPTIONAL{?x wdt:P452 ?ind} OPTIONAL{?x wdt:P414 ?boerse} ${L} }`),
      sparql(`SELECT ?art ?y ?yLabel ?anteil ?zeit WHERE { ${ST("P127","eig",1)} UNION ${ST("P1830","bet",1)} UNION ${ST("P749","mutter")} UNION ${ST("P169","chef")}
        UNION { ${W} wdt:P112 ?y . BIND("gruender" AS ?art) } UNION { ${W} wdt:P199 ?y . BIND("sparten" AS ?art) }
        UNION { ${W} wdt:P2652 ?y . BIND("partner" AS ?art) } UNION { ?y wdt:P2652 ${W} . BIND("partner" AS ?art) } ${L} }`).catch(()=>[]),
      sparql(`SELECT DISTINCT ?h ?hLabel ?alias ?sitzLabel ?sl ?weg ?ende WHERE { { ?h p:P749 ?st . ?st ps:P749 ${W} . } UNION { ${W} p:P355 ?st . ?st ps:P355 ?h . }
        OPTIONAL { ?st pq:P582 ?ende } OPTIONAL { ?h wdt:P576 ?weg } OPTIONAL { ?h wikibase:sitelinks ?sl } OPTIONAL { ?h wdt:P159 ?sitz }
        OPTIONAL { ?h skos:altLabel ?alias . FILTER(LANG(?alias) IN ("de","en")) } ${L} }`).catch(()=>[])]);
    const b0 = basis[0] || {}, n = {}, m = {};
    const s = {t: "WD:" + q, n: b0.xLabel || q, beschr: b0.xDescription || "", privat: true, boerse: basis.some(r=>r.boerse)};
    if(okL(b0.sitzLabel)) m.sitz = b0.sitzLabel; if(b0.ma) m.mitarbeiter = +b0.ma; if(b0.gr) m.gegruendet = b0.gr.slice(0,4).replace("+","");
    m.branchen = [...new Set(basis.map(r=>r.indLabel).filter(okL))].slice(0,5); if(b0.web) m.web = b0.web;
    for(const r of rel){ if(!okL(r.yLabel)) continue;
      if(r.art === "eig" || r.art === "bet"){ const k = r.art === "eig" ? "eigentuemer" : "beteiligungen", Lk = (m[k] = m[k] || []);
        let a = r.anteil ? +r.anteil : null; if(a > 1) a = a / 100; if(!(a > 0 && a <= 1)) a = null;
        const alt = Lk.find(x=>x.name===r.yLabel); if(alt){ if(a!=null && (alt.anteil==null || (r.zeit||"") > (alt.stand||""))){ alt.anteil = a; alt.stand = (r.zeit||"").slice(0,10)||null; } }
        else Lk.push({q: r.y, name: r.yLabel, anteil: a, stand: (r.zeit||"").slice(0,10)||null}); }
      else { const Lk = (n[r.art] = n[r.art] || []); if(!Lk.includes(r.yLabel)) Lk.push(r.yLabel); } }
    for(const k of ["eigentuemer","beteiligungen"]) if(m[k]) m[k].sort((a,b)=>(b.anteil||0)-(a.anteil||0));
    // Töchter: aktive, nach Bekanntheit, mit Zweitnamen
    const T = {}; for(const r of kinder){ if(r.h === q) continue; const t = T[r.h] = T[r.h] || {q:r.h, name:r.hLabel, sl:+(r.sl||0), aktiv:true, aliase:new Set(), sitz:null};
      if(r.weg || r.ende) t.aktiv = false; if(okL(r.sitzLabel)) t.sitz = r.sitzLabel; if(r.alias) t.aliase.add(r.alias); }
    m.toechter = Object.values(T).filter(t=>t.aktiv && okL(t.name)).sort((a,b)=>b.sl-a.sl).slice(0,60).map(t=>{ const nl = t.name.toLowerCase();
      const al = [...t.aliase].filter(a=>a.length>=4 && !a.toLowerCase().includes(nl) && !nl.includes(a.toLowerCase())).sort((a,b)=>a.length-b.length);
      return {q:t.q, name:t.name, alias:al[0]||null, sitz:t.sitz}; });
    // Kunden, Lieferanten, Produkte – über die Firma und ihre Töchter
    const P = [q, ...Object.keys(T).slice(0,60)].map(h=>`wd:${h}`).join(" ");
    const eigene = new Set([q, ...Object.keys(T)]);
    const [k, l1, l2, pr] = await Promise.allSettled([
      sparql(`SELECT ?x ?xLabel (COUNT(DISTINCT ?prod) AS ?n) (SAMPLE(?sl) AS ?bek) WHERE { VALUES ?h { ${P} } ?prod wdt:P176 ?h . ?x p:P121 ?st . ?st ps:P121 ?prod .
        FILTER NOT EXISTS { ?st pq:P582 ?e } FILTER NOT EXISTS { ?x wdt:P576 ?a } FILTER NOT EXISTS { ?x wdt:P31 wd:Q5 } ?x wikibase:sitelinks ?sl . FILTER(?sl >= 3) ?x rdfs:label ?xLabel . FILTER(LANG(?xLabel)="en") } GROUP BY ?x ?xLabel`),
      sparql(`SELECT ?x ?xLabel (COUNT(DISTINCT ?prod) AS ?n) (SAMPLE(?sl) AS ?bek) WHERE { VALUES ?h { ${P} } ?prod wdt:P176 ?h . ?prod wdt:P516|wdt:P527 ?teil . ?teil wdt:P176 ?x .
        ?x wikibase:sitelinks ?sl . ?x rdfs:label ?xLabel . FILTER(LANG(?xLabel)="en") } GROUP BY ?x ?xLabel`),
      sparql(`SELECT ?x ?xLabel (COUNT(DISTINCT ?prod) AS ?n) (SAMPLE(?sl) AS ?bek) WHERE { ${W} p:P121 ?st . ?st ps:P121 ?prod . FILTER NOT EXISTS { ?st pq:P582 ?e } ?prod wdt:P176 ?x .
        ?x wikibase:sitelinks ?sl . ?x rdfs:label ?xLabel . FILTER(LANG(?xLabel)="en") } GROUP BY ?x ?xLabel`),
      sparql(`SELECT DISTINCT ?prodLabel ?sl WHERE { { VALUES ?h { ${P} } ?prod wdt:P176 ?h . } UNION { ${W} wdt:P1056 ?prod } ?prod wikibase:sitelinks ?sl . FILTER(?sl > 5) ${L} }`)]);
    const val = x => x.status === "fulfilled" ? x.value : [];
    m.kunden = rangL(val(k).filter(r=>!eigene.has(r.x)));
    m.lieferanten = rangL([...val(l1), ...val(l2)].filter(r=>!eigene.has(r.x)));
    const pd = {}; for(const r of val(pr)) if(okL(r.prodLabel)) pd[r.prodLabel] = Math.max(pd[r.prodLabel]||0, +r.sl);
    m.produkte = Object.entries(pd).sort((a,b)=>b[1]-a[1]).slice(0,18).map(x=>x[0]);
    m.partner = n.partner || []; delete n.partner;
    n.eigentuemer = (m.eigentuemer||[]).map(x=>x.name);
    s.d = {netz: n, netz2: m, w_stand: "live", n2_stand: "live"};
    return s;
  }
  async function wdLaden(text){
    const q = await wdSuche(text); if(!q) return null;
    if(!privat[q]) privat[q] = await wdFirma(q);
    return privat[q];
  }
  /* ================= Terminal 2.0: Kopfzeile, Überblick, Finanzen, Screener, Vergleich, Markt ================= */
  const FN = [["DES","Überblick"],["FA","Finanzen"],["GP","Kurs"],["HDS","Aktionäre"],["REL","Verflechtungen"],["SPLC","Kunden & Lieferanten"],["RV","Branche"],["GURU","Superinvestoren"]];
  const FN_G = [["TOP","Markt"],["EQS","Screener"],["COMP","Vergleich"],["KETTE","Lieferketten"],["WHO","Wer hält was"],["MEIN","Mein Netz"],["HILFE","Hilfe"]];
  const ALLE_F = [...FN, ...FN_G].map(x=>x[0]);
  const linie = (arr, h=70, farbe) => { const v = (arr||[]).filter(x=>x!=null && isFinite(x)); if(v.length < 2) return "";
    const mn = Math.min(...v), mx = Math.max(...v), r = (mx-mn) || 1, W = 300;
    const pts = v.map((x,i)=>`${(i/(v.length-1)*W).toFixed(1)},${(h-3-(x-mn)/r*(h-6)).toFixed(1)}`).join(" ");
    const c = farbe || (v[v.length-1] >= v[0] ? "#3fdc6c" : "#ff5a5a");
    return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" width="100%" height="${h}" style="display:block" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`; };
  const datumTs = ts => ts ? new Date(ts*1000).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}) : null;
  const wertEur = s => s.mcap_eur != null ? s.mcap_eur : null;

  function kopf(s){
    if(s.privat) return `<div class="qh"><div class="qh-l">${typeof logoHtml==="function"?logoHtml(null, s.n):""}<div><div class="qh-n"><b>${esc(s.n)}</b></div><div class="mut">${esc(s.beschr||"")}</div></div></div>
      <div class="qh-r"><span>${s.boerse?"Börsennotiert, aber nicht im Scanner":"Nicht börsennotiert"}</span><span>Daten live aus Wikidata</span></div></div>`;
    const imDepot = meineT().has(s.t), merk = typeof stars!=="undefined" && stars && stars.has && stars.has(s.t);
    return `<div class="qh"><div class="qh-l">${typeof logoHtml==="function"?logoHtml(s.t, s.n):""}<div style="min-width:0">
        <div class="qh-n"><b>${esc(s.n)}</b> <span class="mut">${esc(s.t)}</span>${imDepot?'<span class="bdg">im Depot</span>':""}${merk?'<span class="bdg">Merkliste</span>':""}</div>
        <div class="mut">${esc([s.idx||s.m, s.i||s.grp].filter(Boolean).join(" · "))}</div></div></div>
      <div class="qh-p"><span class="px">${N(s.p,2)}</span> <span class="mut">${esc(s.cur||"")}</span> ${PC(s.r1d,2,true)}</div>
      <div class="qh-s">${linie(s.spark, 42)}</div>
      <div class="qh-r"><span><span class="mut">5T</span> ${PC(s.r5d,1,true)}</span><span><span class="mut">1M</span> ${PC(s.r1m,1,true)}</span><span><span class="mut">1J</span> ${PC(s.r1y,1,true)}</span>
        <span><span class="mut">vom Hoch</span> ${PC(s.dd,0,true)}</span><span><span class="mut">Börsenwert</span> ${wertEur(s)!=null?GR(wertEur(s))+" €":GR(s.mcap)}</span><span><span class="mut">KGV</span> ${N(s.kgv,1)}</span><span><span class="mut">Div.</span> ${PC(s.div,2)}</span></div></div>`;
  }
  const kvBlock = (titel, L) => `<h4>${titel}</h4><div class="kv">${L.map(([k,v])=>`<div><span class="mut" title="${esc(k)}">${k}</span><span>${v}</span></div>`).join("")}</div>`;
  async function DES(s, d){
    const p = (d && d.profil) || {}, m = await mitKette(s, (d && d.netz2) || {}), n = (d && d.netz) || {};
    if(s.privat) return `${kopf(s)}<div class="cols"><div>${kvBlock("Profil", [["Sitz",esc(m.sitz||"–")],["Mitarbeiter",m.mitarbeiter?N(m.mitarbeiter,0):"–"],["Gegründet",esc(m.gegruendet||"–")]])}
      ${(m.branchen||[]).length?`<div style="margin-top:6px"><span class="mut">Branchen:</span> ${m.branchen.map(esc).join(" · ")}</div>`:""}
      ${m.web?`<div style="margin-top:6px"><span class="mut">Web:</span> <a href="${esc(/^https?:\/\//i.test(m.web)?m.web:"#")}" target="_blank" rel="noopener">${esc(m.web.replace(/^https?:\/\//,""))}</a></div>`:""}
      <div class="mut" style="margin-top:6px">Mehr: <a data-vt="${esc(s.t)} REL">REL</a> · <a data-vt="${esc(s.t)} SPLC">SPLC</a> · <a data-vt="${esc(s.t)} HDS">HDS</a></div></div>
      <div>${netzGrafik(s, n, m, false)}</div></div>`;
    const links = kvBlock("Bewertung", [["KGV",N(s.kgv,1)],["KGV erwartet",N(s.kgv_fwd,1)],["KBV",N(s.kbv,1)],["Dividende",PC(s.div,2)],["Kursziel",s.ziel?`${N(s.ziel,2)} <span class="mut">${PC(s.upside,0,true)}</span>`:"–"],["Analysten",s.na||"–"]])
      + kvBlock("Qualität", [["Gewinnmarge",PC(s.marge,1)],["Op. Marge",PC(s.om,1)],["FCF-Marge",PC(s.fcfm,1)],["Eigenkapitalrendite",PC(s.roe,0)],["Umsatzwachstum",PC(s.uw,0,true)],["Burggraben",s.moat!=null?N(s.moat,0)+"/100":"–"],["Monopol",s.mono!=null?N(s.mono,0)+"/100":"–"]])
      + kvBlock("Signale", [["Chancen-Score",s.score!=null?N(s.score,0)+"/100":"–"],["RSI (14)",N(s.rsi,0)],["Volatilität",PC(s.vol,0)],["Abstand Hoch",PC(s.dd,0,true)],["200-Tage",s.sma200?`${N(s.sma200,2)} <span class="mut">${PC(s.p/s.sma200-1,0,true)}</span>`:"–"]])
      + kvBlock("Firma", [["Umsatz",GR(s.umsatz)],["Mitarbeiter",(p.mitarbeiter||m.mitarbeiter)?N(p.mitarbeiter||m.mitarbeiter,0):"–"],["Sitz",esc([p.stadt||m.sitz,p.land].filter(Boolean).join(", ")||"–")],["Gegründet",esc(m.gegruendet||"–")]])
      + ((m.branchen||[]).length?`<div style="margin-top:6px"><span class="mut">Branchen:</span> ${m.branchen.map(esc).join(" · ")}</div>`:"")
      + (p.text?`<h4>Geschäft</h4><div class="txt">${esc(p.text)}</div><div class="mut" style="font-size:11px">Quelle: Yahoo Finance (Englisch)</div>`:"")
      + ((p.vorstand||[]).length?`<h4>Vorstand</h4><table>${p.vorstand.map(o=>`<tr><td>${esc(o.name)}<br><span class="mut">${esc(o.titel||"")}</span></td><td>${o.alter?o.alter+" J.":""}</td><td>${o.gehalt?GR(o.gehalt)+" $":""}</td></tr>`).join("")}</table>`:"")
      + (p.web?`<div style="margin-top:6px"><span class="mut">Web:</span> <a href="${esc(/^https?:\/\//i.test(p.web)?p.web:"#")}" target="_blank" rel="noopener">${esc(p.web.replace(/^https?:\/\//,""))}</a></div>`:"")
      + (!d?`<div class="mut" style="margin-top:6px">Profil wird gerade gesammelt.</div>`:"");
    const termine = [s.er && s.er*1000 > Date.now()-864e5 ? ["Quartalszahlen", datumTs(s.er)] : null, s.exd && s.exd*1000 > Date.now()-864e5 ? ["Ex-Dividende", datumTs(s.exd)] : null].filter(Boolean);
    const gruende = [...(s.why||[]).map(x=>`<li>${esc(x)}</li>`), ...(s.warn||[]).map(x=>`<li class="down">⚠ ${esc(x)}</li>`)];
    const P2 = peers(s).filter(x=>x.t!==s.t).slice(0,6);
    const rechts = `<h4>Kurs 1 Jahr</h4><div class="panel">${linie(s.spark, 90) || '<div class="mut">kein Verlauf</div>'}<div class="mut" style="font-size:11px;display:flex;justify-content:space-between"><span>vor 1 Jahr</span><a data-vt="${esc(s.t)} GP">großer Chart ›</a></div></div>
      ${termine.length?kvBlock("Termine", termine):""}
      ${gruende.length?`<h4>Auffällig</h4><ul class="li">${gruende.join("")}</ul>`:""}
      ${await guruKurz(s)}
      ${netzGrafik(s, n, m, false)}
      ${P2.length?`<h4>Gleiche Branche</h4><div>${P2.map(x=>`<span class="tag"><a data-vt="${esc(x.t)} DES">${esc(x.n)}</a> ${PC(x.r1y,0,true)}</span>`).join("")} <a data-vt="${esc(s.t)} RV">Vergleich ›</a></div>`:""}`;
    return `${kopf(s)}<div class="cols"><div>${links}</div><div>${rechts}</div></div>`;
  }

  /* ---------- FA: Finanzen über 10 Jahre (SEC bzw. Yahoo) ---------- */
  async function FA(s){
    const f = typeof PLUS5 !== "undefined" && PLUS5.laden ? await PLUS5.laden(s.t) : null;
    const J = (f && f.jahre) || [];
    if(!J.length) return `${kopf(s)}<div class="mut" style="margin-top:8px">Für ${esc(s.n)} liegen noch keine Jahreszahlen vor – sie werden nach und nach geladen.</div>`;
    const g = k => (f && f[k]) || [], I = [...J.keys()].slice(-10);
    const wa = (a, i) => i > 0 && a[i] != null && a[i-1] ? a[i]/a[i-1] - 1 : null;
    const dpsJ = {}; (f.dps_jahre||[]).forEach((y,i)=>dpsJ[y] = (f.dps_yf||[])[i]);
    const dps = i => g("dps")[i] != null ? g("dps")[i] : dpsJ[J[i]];
    const ekr = i => g("eigenkapital")[i] > 0 && g("gewinn")[i] != null ? g("gewinn")[i] / g("eigenkapital")[i] : null;
    const netto = i => g("schulden")[i] != null || g("cash")[i] != null ? (g("schulden")[i]||0) - (g("cash")[i]||0) : null;
    const zeilen = [["Umsatz", i=>GR(g("umsatz")[i]), true], ["Wachstum", i=>PC(wa(g("umsatz"),i),1,true)], ["Bruttomarge", i=>PC(g("bm")[i],1)], ["Op. Marge", i=>PC(g("om")[i],1)],
      ["Nettomarge", i=>PC(g("nm")[i],1)], ["Gewinn je Aktie", i=>N(g("eps")[i],2), true], ["Freier Cashflow", i=>GR(g("fcf")[i]), true], ["FCF-Marge", i=>PC(g("fcfm")[i],1)],
      ["Dividende je Aktie", i=>N(dps(i),2)], ["Ausschüttung vom FCF", i=>PC(g("payout_fcf")[i],0)], ["Aktienanzahl", i=>PC(wa(g("aktien"),i),1,true)],
      ["Nettoschulden", i=>GR(netto(i))], ["Eigenkapitalrendite", i=>PC(ekr(i),0)]]
      .filter(([,fn]) => I.some(i => !/^–$|^<span class="">–<\/span>$/.test(fn(i))));
    const cagr = (k) => { const a = g(k), L = I.filter(i=>a[i]>0); if(L.length < 3) return null; const i0 = L[0], i1 = L[L.length-1]; return Math.pow(a[i1]/a[i0], 1/(J[i1]-J[i0])) - 1; };
    const jahre = I.length ? J[I[I.length-1]] - J[I[0]] : 0;
    const L5 = I.slice(-5), sum = k => L5.reduce((a,i)=>a + (g(k)[i]||0), 0), ocf = sum("ocf");
    const verw = ocf > 0 ? [["Dividenden", sum("dividenden")], ["Aktienrückkäufe", sum("rueckkauf")], ["Investitionen (Capex)", sum("capex")]].filter(x=>x[1] > 0) : [];
    const balken = verw.map(([k,v])=>`<div class="bz"><span>${k}</span><span class="bt"><span style="width:${Math.min(100, v/ocf*100).toFixed(1)}%"></span></span><span>${PC(v/ocf,0)}</span></div>`).join("");
    return `${kopf(s)}<h4>Finanzen ${J[I[0]]}–${J[I[I.length-1]]} <span class="mut" style="text-transform:none">· ${esc(f.cur||s.cur||"")} · Quelle ${esc(f.quelle||"")}</span></h4>
      <div class="scroll"><table class="fa"><tr><th></th>${I.map(i=>`<th>${J[i]}</th>`).join("")}</tr>
      ${zeilen.map(([k,fn,fett])=>`<tr><td class="${fett?"w":"mut"}">${k}</td>${I.map(i=>`<td>${fn(i)}</td>`).join("")}</tr>`).join("")}</table></div>
      <div class="cols" style="margin-top:4px"><div>${kvBlock(`Wachstum pro Jahr (${jahre} J.)`, [["Umsatz",PC(cagr("umsatz"),1,true)],["Gewinn je Aktie",PC(cagr("eps"),1,true)],["Freier Cashflow",PC(cagr("fcf"),1,true)],["FCF je Aktie",PC(cagr("fcf_ps"),1,true)],["Aktienanzahl",PC(cagr("aktien"),1,true)]])}</div>
        <div>${balken?`<h4>Wohin das Geld fließt (5 J.)</h4><div class="mut" style="white-space:normal;font-size:11px">Anteil am operativen Cashflow (${GR(ocf)})</div>${balken}`:""}</div></div>
      <div class="mut" style="margin-top:6px;white-space:normal">Sinkende Aktienanzahl = Rückkäufe: Dein Anteil an der Firma wächst. <a data-detail="${esc(s.t)}">Große Charts in der Detailansicht ›</a></div>`;
  }

  /* ---------- EQS: Aktien-Screener ---------- */
  const EQF = {KGV:["kgv",1,"KGV",-1], KGVE:["kgv_fwd",1,"KGV e.",-1], KBV:["kbv",1,"KBV",-1], MARGE:["marge",100,"Marge",1], OPM:["om",100,"Op. M.",1], FCF:["fcfm",100,"FCF",1],
    EKR:["roe",100,"EKR",1], ROE:["roe",100,"EKR",1], DIV:["div",100,"Div.",1], WACHSTUM:["uw",100,"Wachst.",1], MOAT:["moat",1,"Burggr.",1], BURG:["moat",1,"Burggr.",1],
    MONO:["mono",1,"Monopol",1], SCORE:["score",1,"Score",1], RSI:["rsi",1,"RSI",-1], "1T":["r1d",100,"1T",1], "1M":["r1m",100,"1M",1], "6M":["r6m",100,"6M",1], "1J":["r1y",100,"1J",1],
    HOCH:["dd",100,"v. Hoch",1], WERT:["mcap_eur",1e-9,"Wert Mrd.",1], ZIEL:["upside",100,"Kursziel",1], VOL:["vol",100,"Volat.",-1]};
  const PROZ = new Set(["marge","om","fcfm","roe","div","uw","r1d","r1m","r6m","r1y","dd","upside","vol"]);
  let eqs = null;
  const EQS_VOR = [["EQS MOAT>70 MONO>60","Langweilige Monopole"],["EQS DIV>3 FCF>15 KGV<20","Dividenden mit Substanz"],["EQS MARGE>20 EKR>20 KGVE<20","Qualität zum fairen Preis"],["EQS HOCH<-30 MOAT>60","Qualität im Rücksetzer"],["EQS SCORE>75","Höchster Chancen-Score"],["EQS RSI<30 WERT>20","Überverkaufte Große"]];
  function EQS(rest){
    const krit = [], fehler = [];
    for(const t of String(rest||"").toUpperCase().split(/\s+/).filter(Boolean)){
      const m = t.match(/^([A-Z0-9ÄÖÜ]+)(>=|<=|>|<|=)(.+)$/); if(!m){ fehler.push(t); continue; }
      if(["SEKTOR","BRANCHE","INDEX","MARKT"].includes(m[1])){ krit.push({text:m[1], op:m[2], v:m[3].replace(/_/g," ")}); continue; }
      const F = EQF[m[1]], v = parseFloat(m[3].replace(",", ".")); if(!F || !isFinite(v)){ fehler.push(t); continue; }
      krit.push({k:F[0], op:m[2], v: v / F[1], key:m[1]});
    }
    const hilfe = `<div class="mut" style="white-space:normal">Kriterien mit Leerzeichen trennen, z. B. <a data-vt="EQS KGV<20 MARGE>15 DIV>2">EQS KGV&lt;20 MARGE&gt;15 DIV&gt;2</a>. Prozentwerte als Zahl (15 = 15 %).<br>
      Felder: ${Object.keys(EQF).filter((k,i,a)=>a.findIndex(x=>EQF[x][0]===EQF[k][0])===i).join(" · ")} · SEKTOR=Technology · INDEX=DAX</div>`;
    const vor = `<div style="margin:6px 0">${EQS_VOR.map(([c,l])=>`<span class="tag"><a data-vt="${c}">${l}</a></span>`).join("")}</div>`;
    if(!krit.length) return `<div class="w" style="font-size:15px"><b>Screener</b></div>${vor}${hilfe}${fehler.length?`<div class="down">Nicht verstanden: ${fehler.map(esc).join(", ")}</div>`:""}`;
    const ok = (s, c) => { if(c.text){ const feld = c.text==="INDEX"||c.text==="MARKT" ? [s.idx, s.m].join(" ") : [s.s, s.i, s.grp].join(" "); return feld.toUpperCase().includes(c.v); }
      const x = c.k === "mcap_eur" ? (s.mcap_eur ?? null) : s[c.k]; if(x == null || !isFinite(x)) return false;
      return c.op===">" ? x > c.v : c.op==="<" ? x < c.v : c.op===">=" ? x >= c.v : c.op==="<=" ? x <= c.v : Math.abs(x - c.v) < 1e-9; };
    const R = Object.values(BY).filter(s => krit.every(c => ok(s, c)));
    const spalten = [...new Set([...krit.filter(c=>c.k).map(c=>c.key), "KGV", "MARGE", "DIV", "1J", "MOAT", "SCORE"])].filter((k,i,a)=>a.findIndex(x=>EQF[x][0]===EQF[k][0])===i).slice(0, 8);
    eqs = {R, spalten, sort: krit.find(c=>c.k) ? EQF[krit.find(c=>c.k).key][0] : "score", dir: krit.find(c=>c.k) ? -EQF[krit.find(c=>c.k).key][3] : -1, titel: rest};
    if(eqs.sort === "score") eqs.dir = -1;
    return `<div class="w" style="font-size:15px"><b>Screener</b> <span class="mut">${esc(rest)}</span></div>${vor}${fehler.length?`<div class="down">Nicht verstanden: ${fehler.map(esc).join(", ")}</div>`:""}<div id="eqs-t">${eqsTabelle()}</div>`;
  }
  function eqsTabelle(){
    if(!eqs) return ""; const {R, spalten, sort, dir} = eqs, meine = meineT();
    const L = R.slice().sort((a,b)=>{ const x = a[sort], y = b[sort]; if(x==null) return 1; if(y==null) return -1; return (x - y) * dir; });
    const fmt = (k, v) => PROZ.has(k) ? PC(v, k==="div"?1:0, ["r1d","r1m","r6m","r1y","dd","upside","uw"].includes(k)) : k==="mcap_eur" ? GR(v) : N(v, ["moat","mono","score","rsi"].includes(k)?0:1);
    return `<div class="mut">${R.length} Treffer${R.length>150?" · die ersten 150":""} · Spaltenkopf antippen zum Sortieren</div><div class="scroll"><table><tr><th>Firma</th>${spalten.map(k=>{ const f = EQF[k][0];
      return `<th><a data-eqsort="${f}">${EQF[k][2]}${sort===f?(dir<0?" ▼":" ▲"):""}</a></th>`; }).join("")}</tr>
      ${L.slice(0,150).map(s=>`<tr class="${meine.has(s.t)?"me":""}"><td><a data-vt="${esc(s.t)} DES">${esc(s.n)}</a> <span class="mut">${esc(s.t)}</span></td>${spalten.map(k=>`<td>${fmt(EQF[k][0], EQF[k][0]==="mcap_eur" ? s.mcap_eur : s[EQF[k][0]])}</td>`).join("")}</tr>`).join("")}</table></div>`;
  }

  /* ---------- COMP: Firmen nebeneinander ---------- */
  function COMP(rest){
    const L = [...new Set(String(rest||"").split(/[\s,;]+/).filter(Boolean).map(x=>finde(x)).filter(Boolean))].slice(0, 6);
    if(L.length < 2){ const s = aktuell.t && BY[aktuell.t], P2 = s ? peers(s).filter(x=>x.t!==s.t).slice(0,3) : [];
      const bsp = s ? `COMP ${[s, ...P2].map(x=>x.t).join(" ")}` : "COMP MA V AXP";
      return `<div class="w" style="font-size:15px"><b>Vergleich</b></div><div class="mut" style="white-space:normal">Bis zu 6 Firmen nebeneinander. Beispiel: <a data-vt="${esc(bsp)}">${esc(bsp)}</a> · <a data-vt="COMP ASML.AS TSM NVDA">COMP ASML.AS TSM NVDA</a></div>`; }
    const Z = [["Börsenwert", s=>wertEur(s), v=>v!=null?GR(v)+" €":"–", 1], ["KGV", s=>s.kgv, v=>N(v,1), -1], ["KGV erwartet", s=>s.kgv_fwd, v=>N(v,1), -1], ["Gewinnmarge", s=>s.marge, v=>PC(v,1), 1],
      ["Op. Marge", s=>s.om, v=>PC(v,1), 1], ["FCF-Marge", s=>s.fcfm, v=>PC(v,1), 1], ["Eigenkapitalrendite", s=>s.roe, v=>PC(v,0), 1], ["Umsatzwachstum", s=>s.uw, v=>PC(v,0,true), 1],
      ["Dividende", s=>s.div, v=>PC(v,2), 1], ["Burggraben", s=>s.moat, v=>N(v,0), 1], ["Monopol", s=>s.mono, v=>N(v,0), 1], ["Chancen-Score", s=>s.score, v=>N(v,0), 1],
      ["1 Monat", s=>s.r1m, v=>PC(v,1,true), 1], ["1 Jahr", s=>s.r1y, v=>PC(v,1,true), 1], ["Abstand Hoch", s=>s.dd, v=>PC(v,0,true), 1], ["Kursziel", s=>s.upside, v=>PC(v,0,true), 1]];
    return `<div class="w" style="font-size:15px"><b>Vergleich</b> <span class="mut">${L.length} Firmen · bester Wert hervorgehoben</span></div><div class="scroll"><table class="comp"><tr><th></th>${L.map(s=>`<th><a data-vt="${esc(s.t)} DES">${esc(s.n)}</a><br><span class="mut">${esc(s.t)}</span></th>`).join("")}</tr>
      <tr><td class="mut">Kurs 1 Jahr</td>${L.map(s=>`<td style="min-width:90px">${linie(s.spark, 30)}</td>`).join("")}</tr>
      ${Z.map(([k, get, fmt, besser])=>{ const v = L.map(get), ok = v.filter(x=>x!=null && isFinite(x)), best = ok.length > 1 ? (besser > 0 ? Math.max(...ok) : Math.min(...ok.filter(x=>x>0))) : null;
        return `<tr><td class="mut">${k}</td>${v.map(x=>`<td class="${x!=null && x===best?"best":""}">${fmt(x)}</td>`).join("")}</tr>`; }).join("")}</table></div>`;
  }

  /* ---------- TOP: Marktüberblick als Startseite ---------- */
  function TOP(){
    const S = Object.values(BY).filter(s=>s.p), M = (typeof DATA!=="undefined" && DATA && DATA.markt) || [];
    const top = (L, fmt) => `<table>${L.map(s=>`<tr><td><a data-vt="${esc(s.t)} DES">${esc(s.n)}</a></td><td>${fmt(s)}</td></tr>`).join("")}</table>`;
    const nach = (k, dir, filter=()=>true, n=7) => S.filter(s=>s[k]!=null && filter(s)).sort((a,b)=>(b[k]-a[k])*dir).slice(0,n);
    const D = (P.depot && P.depot.positionen || []).filter(z=>z.t && BY[z.t] && BY[z.t].r1d!=null).map(z=>BY[z.t]);
    const tafeln = [
      ["Indizes", `<table>${M.slice(0,10).map(x=>`<tr><td>${esc(x.n)}</td><td>${PC(x.r1d,2,true)}</td><td>${PC(x.r1y,0,true)}</td></tr>`).join("")}</table><div class="mut" style="font-size:11px;text-align:right">heute · 1 Jahr</div>`],
      D.length ? ["Dein Depot heute", top(D.sort((a,b)=>b.r1d-a.r1d).filter((x,i,a)=>i<4||i>=a.length-3), s=>PC(s.r1d,2,true))] : null,
      ["Gewinner heute", top(nach("r1d", 1), s=>PC(s.r1d,1,true))],
      ["Verlierer heute", top(nach("r1d", -1), s=>PC(s.r1d,1,true))],
      ["Höchster Chancen-Score", top(nach("score", 1), s=>N(s.score,0))],
      ["Stärkster Burggraben", top(nach("moat", 1), s=>N(s.moat,0))],
      ["Qualität im Rücksetzer", top(nach("dd", -1, s=>(s.moat||0)>=60 && s.dd<=-0.2), s=>PC(s.dd,0,true)) + `<div class="mut" style="font-size:11px">Burggraben ≥ 60, mind. 20 % unter Hoch</div>`]].filter(Boolean);
    return `<div class="w" style="font-size:15px"><b>Markt</b> <span class="mut">${S.length} Aktien im Scanner</span></div>
      <div class="grid3">${tafeln.map(([t,h])=>`<div><h4>${t}</h4>${h}</div>`).join("")}</div>
      <div class="mut" style="margin-top:8px">Weiter: <a data-vt="GURU">Superinvestoren</a> · <a data-vt="EQS">Screener</a> · <a data-vt="MEIN">Mein Netz</a> · <a data-vt="HILFE">Hilfe</a></div>`;
  }
  const HILFE = () => `<div class="w" style="font-size:15px"><b>So geht's</b></div><div style="white-space:normal;color:#ddd">Ticker oder Name eintippen (Vorschläge erscheinen), optional eine Funktion dahinter, dann Enter.</div>
    <div class="cols"><div><h4>Je Aktie</h4><table>${[["MA","Überblick: Kennzahlen, Chart, Termine, Netz"],["MA FA","Finanzen über 10 Jahre"],["MA GP","Großer Kurs-Chart"],["MA HDS","Wem gehört die Firma?"],["APPLE REL","Mutter, Töchter, Beteiligungen"],["AIRBUS SPLC","Kunden und Lieferanten"],["SAP.DE RV","Vergleich mit der Branche"],["MSFT GURU","Welche Superinvestoren halten sie?"],["SPACEX","Firmen außerhalb des Scanners (Wikidata)"]].map(([c,t])=>`<tr><td><a data-vt="${c}">${c}</a></td><td class="mut" style="text-align:left;white-space:normal">${t}</td></tr>`).join("")}</table></div>
    <div><h4>Markt</h4><table>${[["TOP","Marktüberblick"],["EQS MOAT>70 MONO>60","Screener"],["COMP MA V AXP","Firmen nebeneinander"],["KETTE TSMC","Alle Lieferketten – wer beliefert wen?"],["GURU","Was Buffett & Co. kaufen"],["WHO BERKSHIRE","Wo ist ein Investor drin?"],["MEIN","Großaktionäre, Lieferketten, Superinvestoren in deinem Depot"]].map(([c,t])=>`<tr><td><a data-vt="${c}">${c}</a></td><td class="mut" style="text-align:left;white-space:normal">${t}</td></tr>`).join("")}</table>
    <h4>Tastatur</h4><div class="mut" style="white-space:normal"><b class="w">/</b> Eingabe · <b class="w">1–8</b> Funktionen der aktuellen Aktie · <b class="w">↑ ↓</b> Vorschläge · <b class="w">Tab</b> übernehmen · <b class="w">Esc</b> schließen</div></div></div>`;

  let aktuell = {t: null, f: "DES"};
  async function ausfuehren(cmd){
    const out = document.getElementById("vt-out"); if(!out) return;
    acZu();
    cmd = String(cmd||"").trim().replace(/\s+/g," ");
    const teile = cmd.split(" "), erstes = (teile[0]||"").toUpperCase(), letztes = (teile[teile.length-1]||"").toUpperCase();
    let f = teile.length > 1 && FN.some(x=>x[0]===letztes) ? letztes : FN.some(x=>x[0]===erstes) && teile.length === 1 && aktuell.t ? erstes : null;
    let rest = f && f === letztes && teile.length > 1 ? teile.slice(0,-1).join(" ") : f ? "" : cmd;
    if(["WHO","MEIN","HILFE","HELP","GURU","EQS","COMP","TOP","KETTE"].includes(erstes)){ f = erstes === "HELP" ? "HILFE" : erstes; rest = teile.slice(1).join(" "); }
    if(f === "WHO"){ out.innerHTML = await WHO(rest); return merken(cmd, null, f); }
    if(f === "MEIN"){ out.innerHTML = `<div class="mut">lädt …</div>`; out.innerHTML = await MEIN(); return merken(cmd, null, f); }
    if(f === "EQS"){ out.innerHTML = EQS(rest); return merken(cmd, null, f); }
    if(f === "COMP"){ out.innerHTML = COMP(rest); return merken(cmd, null, f); }
    if(f === "KETTE"){ out.innerHTML = `<div class="mut">lädt …</div>`; out.innerHTML = await KETTE(rest); const kf = document.getElementById("kette-f"); if(kf) kf.onsubmit = ev => { ev.preventDefault(); ausfuehren("KETTE " + document.getElementById("kette-q").value); }; return merken(cmd, null, f); }
    if(f === "TOP" || !cmd){ out.innerHTML = TOP(); return merken("TOP", null, "TOP"); }
    if(f === "GURU" && (!rest || guruFonds(await ladeGuru(), rest))){ out.innerHTML = `<div class="mut">lädt …</div>`; out.innerHTML = await GURU(rest); return merken(cmd, null, f); }
    if(f === "HILFE"){ out.innerHTML = HILFE(); return merken(cmd, null, f); }
    const wdId = /^WD:Q\d+$/i.test(rest);
    let s = wdId ? null : rest ? finde(rest) : (aktuell.t && (BY[aktuell.t] || (privat[aktuell.t.slice(3)] || null)));
    // Name statt Ticker: nur annehmen, wenn das erste Wort passt („Space“ ist nicht Extra Space Storage, sondern eher SpaceX)
    if(s && rest && !BY[rest.toUpperCase()] && s.t.split(".")[0] !== rest.toUpperCase()){ const a = woerter(s.n), w = woerter(rest); if(w.length && a.length && !a[0].startsWith(w[0])) s = null; }
    if(!s && rest){
      out.innerHTML = `<div class="mut">Nicht im Scanner – suche „${esc(rest)}“ bei Wikidata … (dauert beim ersten Mal ein paar Sekunden)</div>`;
      try{ s = await wdLaden(rest); }catch(e){ out.innerHTML = `<div class="down">Wikidata gerade nicht erreichbar.</div>`; return; }
    }
    if(!s){ out.innerHTML = `<div class="down">Nicht gefunden: ${esc(rest)}</div><div class="mut">Ticker (z. B. MA, SAP.DE) oder Name (z. B. Mastercard, SpaceX). <a data-vt="HILFE">HILFE</a></div>`; return; }
    if(s.privat && !["DES","HDS","REL","SPLC"].includes(f)) f = "REL";
    f = f || "DES"; aktuell = {t: s.t, f};
    out.innerHTML = `<div class="mut">lädt …</div>`;
    const d = s.privat ? s.d : ["DES","HDS","REL","SPLC"].includes(f) ? await lade(s.t) : null;
    out.innerHTML = f==="HDS" ? HDS(s,d) + (s.privat ? "" : await guruKurz(s)) : f==="REL" ? await REL(s,d) : f==="SPLC" ? await REL(s,d,true) : f==="RV" ? RV(s)
      : f==="GP" ? GP(s) : f==="FA" ? await FA(s) : f==="GURU" ? await GURU(s.t) : await DES(s,d);
    if(f === "GP") setTimeout(()=>{ const c = document.getElementById("vt-chart"); if(c && typeof PLUS2!=="undefined" && PLUS2.kursChart){ c.innerHTML = PLUS2.kursChart(s, 300); } }, 0);
    merken(`${s.t} ${f}`, s.t, f);
  }
  function GP(s){
    return `${kopf(s)}<h4>Kurs</h4><div id="vt-chart" class="vtchart"></div>
      ${kvBlock("Kennzahlen", [["Tief 1J",N(Math.min(...(s.spark||[NaN])),2)],["Hoch 1J",N(Math.max(...(s.spark||[NaN])),2)],["200-Tage-Linie",N(s.sma200,2)],["50-Tage-Linie",N(s.sma50,2)],["RSI (14)",N(s.rsi,0)],["Volatilität",PC(s.vol,0)]])}
      <div style="margin-top:6px"><a data-detail="${esc(s.t)}">Detailansicht mit Live-Kurs von L&S ›</a></div>`;
  }
  function merken(cmd, t, f){
    const inp = document.getElementById("vt-in"); if(inp) inp.value = cmd;
    document.querySelectorAll(".vt .fk a[data-f]").forEach(a=>a.classList.toggle("on", a.dataset.f===f));
    const st = document.getElementById("vt-akt"); if(st) st.textContent = aktuell.t && !/^WD:/.test(aktuell.t) ? aktuell.t : aktuell.t ? ((privat[aktuell.t.slice(3)]||{}).n || "") : "";
    try{ history.replaceState(null, "", "#terminal-" + encodeURIComponent(cmd)); }catch(e){}
    try{ const H = JSON.parse(localStorage.getItem("vf_vt_hist")||"[]").filter(x=>x!==cmd); H.unshift(cmd); localStorage.setItem("vf_vt_hist", JSON.stringify(H.slice(0,12))); }catch(e){}
    const h = document.getElementById("vt-hist"); if(h) h.innerHTML = verlauf();
  }
  const verlauf = () => { let H = []; try{ H = JSON.parse(localStorage.getItem("vf_vt_hist")||"[]"); }catch(e){} return H.length ? `<span class="mut">Zuletzt:</span> ${H.slice(0,8).map(c=>`<a data-vt="${esc(c)}">${esc(c)}</a>`).join(" · ")}` : ""; };

  /* ---------- Eingabe mit Vorschlägen ---------- */
  let acL = [], acI = -1;
  function vorschlaege(q){
    const U = q.toUpperCase().trimStart(); if(!U.trim()) return [];
    const teile = U.split(" ");
    if(teile.length === 2 && (BY[teile[0]] || /^WD:Q\d+$/.test(teile[0]))) return FN.filter(([k])=>k.startsWith(teile[1])).map(([k,l])=>({cmd:`${teile[0]} ${k}`, l:k, r:l}));
    if(teile[0] === "EQS" && teile.length === 1) return EQS_VOR.map(([c,l])=>({cmd:c, l:c, r:l}));
    if(teile.length > 1) return [];
    const g = FN_G.filter(([k])=>k.startsWith(U) && U.length >= 2).map(([k,l])=>({cmd:k, l:k, r:l}));
    const S = Object.values(BY), W = woerter(U);
    const a = S.filter(s=>s.t.startsWith(U)).sort((x,y)=>x.t.length-y.t.length);
    const b = W.length ? S.filter(s=>!s.t.startsWith(U) && woerter(s.n).some(w=>w.startsWith(W[0]))).sort((x,y)=>(y.mcap||0)-(x.mcap||0)) : [];
    const priv = KET ? [...new Set(KET.E.flatMap(e=>[[e.ln, e.lt], [e.kn, e.kt]]).filter(([n, t])=>!t && woerter(n).some(w=>W[0] && w.startsWith(W[0]))).map(([n])=>n))].slice(0, 3)
      .map(n=>({cmd:`${n} DES`, l:n, r:"nicht im Scanner · Wikidata"})) : [];
    const mk = s => ({cmd:`${s.t} DES`, l:s.t, r:s.n, t:s.t});
    const L = [...g, ...a.slice(0, 5).map(mk), ...priv, ...b.slice(0, 6).map(mk)].slice(0, 9);
    if(U.trim().length >= 3 && !a.some(s=>s.t === U.trim())) L.push({cmd:`${q.trim()} DES`, l:`„${q.trim()}“`, r:"bei Wikidata suchen (auch private Firmen)"});
    return L;
  }
  function acZeigen(){
    const box = document.getElementById("vt-ac"), inp = document.getElementById("vt-in"); if(!box || !inp) return;
    acL = vorschlaege(inp.value); acI = -1;
    box.innerHTML = acL.map((x,i)=>`<div data-ac="${i}"><b>${esc(x.l)}</b><span class="mut">${esc(x.r)}</span></div>`).join("");
    box.style.display = acL.length ? "block" : "none";
  }
  function acZu(){ const box = document.getElementById("vt-ac"); if(box) box.style.display = "none"; acL = []; acI = -1; }
  function acMarke(){ document.querySelectorAll("#vt-ac div").forEach((d,i)=>d.classList.toggle("on", i===acI)); }

  function render(){
    let start = ""; try{ start = decodeURIComponent(location.hash.slice(1).replace(/^terminal-?/, "")); }catch(e){}
    start = start || (aktuell.t ? `${aktuell.t} ${aktuell.f}` : "TOP");
    $("#main").innerHTML = `<div class="vt"><div class="bar"><span class="ttl">VF TERMINAL</span><span class="w" id="vt-akt"></span><span class="mut" id="vt-zeit" style="margin-left:auto"></span></div>
      <form id="vt-form" autocomplete="off"><div style="position:relative;flex:1;display:flex"><input id="vt-in" placeholder="Ticker oder Name · z. B. MA FA · EQS MOAT>70 · GURU" enterkeyhint="go" autocapitalize="characters" spellcheck="false"><div id="vt-ac" class="ac"></div></div><button class="go">GO</button></form>
      <div class="fk"><span class="mut fkl">Aktie</span>${FN.map(([k,l],i)=>`<a data-f="${k}" title="${l} (Taste ${i+1})"><span class="n">${i+1}</span>${k}<span class="lb"> ${l}</span></a>`).join("")}</div>
      <div class="fk"><span class="mut fkl">Markt</span>${FN_G.map(([k,l])=>`<a data-f="${k}" class="g" title="${l}">${k}<span class="lb"> ${l}</span></a>`).join("")}</div>
      <div id="vt-hist" style="font-size:12px">${verlauf()}</div>
      <div id="vt-out" style="margin-top:8px"></div></div>`;
    const z = $("#vt-zeit"); if(z) z.textContent = DATA && DATA.stand ? "Daten " + new Date(DATA.stand).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "";
    const inp = $("#vt-in");
    $("#vt-form").onsubmit = ev => { ev.preventDefault(); const x = acI >= 0 && acL[acI] ? acL[acI].cmd : inp.value; ausfuehren(x); inp.blur(); };
    inp.oninput = acZeigen;
    inp.onblur = () => setTimeout(acZu, 180);
    inp.onkeydown = ev => {
      if(ev.key === "ArrowDown" && acL.length){ ev.preventDefault(); acI = Math.min(acL.length-1, acI+1); acMarke(); }
      else if(ev.key === "ArrowUp" && acL.length){ ev.preventDefault(); acI = Math.max(-1, acI-1); acMarke(); }
      else if(ev.key === "ArrowUp" && !inp.value){ ev.preventDefault(); try{ inp.value = (JSON.parse(localStorage.getItem("vf_vt_hist")||"[]")[0]) || ""; }catch(e){} }
      else if(ev.key === "Tab" && acL.length){ ev.preventDefault(); const x = acL[Math.max(0, acI)]; inp.value = (x.t ? x.t : x.cmd) + " "; acZeigen(); }
      else if(ev.key === "Escape"){ acZu(); inp.blur(); }
    };
    const vt = $("#main").querySelector(".vt");
    vt.addEventListener("mousedown", ev => { const d = ev.target.closest("[data-ac]"); if(d){ ev.preventDefault(); ausfuehren(acL[+d.dataset.ac].cmd); inp.blur(); } });
    vt.addEventListener("click", ev => {
      const a = ev.target.closest("a"); if(!a) return;
      if(a.dataset.eqsort){ ev.preventDefault(); const k = a.dataset.eqsort; if(eqs){ eqs.dir = eqs.sort === k ? -eqs.dir : -1; eqs.sort = k; const t = document.getElementById("eqs-t"); if(t) t.innerHTML = eqsTabelle(); } return; }
      if(a.dataset.vt){ ev.preventDefault(); ausfuehren(a.dataset.vt); window.scrollTo(0, 0); }
      else if(a.dataset.detail){ ev.preventDefault(); openDetail(a.dataset.detail); }
      else if(a.dataset.f){ ev.preventDefault(); const f = a.dataset.f;
        if(f==="WHO" || f==="COMP" && !aktuell.t){ inp.value = f + " "; inp.focus(); return; }
        if(FN_G.some(x=>x[0]===f)) return ausfuehren(f === "COMP" && aktuell.t && BY[aktuell.t] ? "COMP" : f);
        if(!aktuell.t){ inp.value = ""; inp.placeholder = "Erst eine Aktie wählen – z. B. MSFT"; inp.focus(); return; }
        ausfuehren(`${aktuell.t} ${f}`); }
    });
    if(!window._vtTasten){ window._vtTasten = true;
      document.addEventListener("keydown", ev => {
        if(!/^#terminal/.test(location.hash) && location.hash !== "#terminal") return;
        const ziel = ev.target, tippt = ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.isContentEditable);
        if(tippt || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const i = document.getElementById("vt-in"); if(!i) return;
        if(ev.key === "/"){ ev.preventDefault(); i.focus(); i.select(); }
        else if(/^[1-8]$/.test(ev.key) && aktuell.t){ ev.preventDefault(); ausfuehren(`${aktuell.t} ${FN[+ev.key-1][0]}`); }
      });
    }
    ladeKette();
    ausfuehren(start);
  }
  // Einbinden: eigener Menüpunkt + Knopf in der Detailansicht
  PLUS.VIEWS.terminal = render;
  PLUS3.MEHR.push("terminal");
  const mehrAlt = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehrAlt(); const first = $("#main").querySelector(".list");
    if(first) first.insertAdjacentHTML("beforebegin", `<a class="row" href="#terminal" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto;margin-top:12px"><div><div class="nm">🖥 Terminal</div><div class="sub">Wem gehört eine Firma, mit wem ist sie verflochten, wie steht sie gegen die Branche?</div></div><span class="sub">›</span></a>`); };
  const dx = PLUS.detailExtra;
  PLUS.detailExtra = s => `<div class="links" style="margin:8px 0"><a class="btn ghost" href="#terminal-${encodeURIComponent(s.t + " HDS")}" onclick="closeDetail()">🖥 Aktionäre & Verflechtungen im Terminal</a></div>` + dx(s);
  return { ausfuehren, finde };
})();
