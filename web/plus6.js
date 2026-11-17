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
  const kopf = (t, s) => `<div class="box" style="margin-top:12px"><h3 style="margin-bottom:2px">${t}</h3><div class="sub" style="white-space:normal">${s}</div></div>`;
  function bars(items, fmt=(v)=>E(v), opt={}){
    const max = Math.max(1e-9, ...items.map(x=>Math.abs(x[1]||0)));
    return `<div class="p6bars" style="${opt.h?`height:${opt.h}px`:""}">${items.map(([l,v,c])=>`<div title="${esc(l)}: ${fmt(v)}">${opt.werte?`<b>${v?fmt(v):""}</b>`:""}<i class="${v<0?"neg":""} ${c||""}" style="height:${Math.abs(v||0)/max*100}%"></i><span>${esc(l)}</span></div>`).join("")}</div>`;
  }
  const brokerListe = a => [...new Set([...Object.keys(a.gebuehren||{}), ...Object.keys(a.ertraege||{})])];
  const steuerSatz = () => (P.pf.steuer||{}).kirche ? (0.25/1.0225)*1.055 + (0.25/1.0225)*0.09 : 0.26375;
  const freiGesamt = () => (P.pf.steuer||{}).verheiratet ? 2000 : 1000;
  const isETF = z => z && ["ETF","MUTUALFUND"].includes(z.art);

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
  function renderFreistellung(){
    if(!need("Freistellungsauftrag aufteilen")) return;
    const {R, frei} = freiDaten(), a = A();
    const fsaSum = R.reduce((s,o)=>s+(o.fsa||0),0);
    const zuviel = R.filter(o=>o.steuer - 0.15*(o.divBr||0) > 1)   // mehr als die übliche Quellensteuer, frei_rest = R.filter(o=>o.fsa!=null && o.fsa - o.genutzt > 20);
    const nj = +jahr+1;
    $("#main").innerHTML = kopf("🧾 Freistellungsauftrag aufteilen", `Du hast ${E(frei)} Sparerpauschbetrag im Jahr. Er wirkt nur bei dem Broker, bei dem du ihn per Freistellungsauftrag eingestellt hast. Hier siehst du, wo er ${jahr} gebraucht wurde und wie du ihn am besten aufteilst.`) + `
      <div class="box"><h3>${jahr} bisher je Broker</h3><table class="tbl"><tr><th>Broker</th><th>Dividenden*</th><th>Zinsen</th><th>Kursgewinne*</th><th>genutzt</th><th>Auftrag</th><th>Steuer bezahlt</th></tr>
        ${R.map(o=>`<tr><td><b>${esc(o.b)}</b></td><td>${E(o.div)}</td><td>${E(o.zins)}</td><td class="${cls(o.real)}">${E(o.real)}</td><td><b>${E(o.genutzt)}</b></td><td>${o.fsa==null?`<span class="sub">?</span>`:E(o.fsa)}</td><td class="${o.steuer>0.5?"down":""}">${E(o.steuer,2)}</td></tr>`).join("")}</table>
        <div class="sub" style="white-space:normal;margin-top:6px">* steuerpflichtiger Teil: bei Aktien-ETFs 70 % (Teilfreistellung). ${a?"Aus deinen importierten Transaktionen.":"Importiere deine Transaktionen, damit Dividenden und Kursgewinne hier automatisch stehen."} „Steuer bezahlt“ enthält auch ausländische Quellensteuer.</div>
        ${zuviel.length && frei_rest.length ? `<div class="notif" style="margin-top:8px">⚠ Bei ${zuviel.map(o=>esc(o.b)).join(", ")} wurde Steuer abgezogen, während bei ${frei_rest.map(o=>esc(o.b)).join(", ")} noch Freibetrag übrig ist. Ändere die Aufteilung (geht jederzeit fürs laufende Jahr) – zu viel gezahlte Abgeltungsteuer holst du sonst über die Steuererklärung (Anlage KAP) zurück.</div>`:""}
        ${fsaSum>frei?`<div class="err">Deine Aufträge ergeben zusammen ${E(fsaSum)} – mehr als ${E(frei)} ist nicht erlaubt.</div>`:""}</div>
      <div class="box"><h3>Vorschlag für ${nj}</h3>
        ${R.map(o=>`<div class="kvrow"><span><b>${esc(o.b)}</b><br><span class="sub">erwartet ${E(o.div12)} Dividenden + ${E(o.vp)} Vorabpauschale (steuerpflichtig)</span></span><b>${E(o.vorschlag)}</b></div>`).join("")}
        <div class="sub" style="white-space:normal;margin-top:6px">Aufgeteilt nach den Erträgen, die je Broker zu erwarten sind (Dividenden der nächsten 12 Monate und die Vorabpauschale für ${jahr}, die am ersten Werktag ${nj} anfällt). Planst du größere Verkäufe mit Gewinn, gib diesem Broker mehr.</div>
        <div class="links"><button class="btn" id="fa-ok">Ich habe es so eingestellt</button> <a class="btn ghost" href="#steuer">Steuer-Cockpit</a></div></div>`;
    $("#fa-ok").onclick = async ()=>{ const st = P.pf.steuer = P.pf.steuer || {}; st.fsa = Object.fromEntries(R.filter(o=>o.b!=="Ohne Broker").map(o=>[o.b, o.vorschlag]));
      if(await PLUS.save("Freistellungsaufträge gespeichert", true)) renderFreistellung(); };
  }

  /* ================= 3. Kaufzeitpunkte ================= */
  function renderKaufzeit(){
    const a = needTx("Kaufzeitpunkte"); if(!a) return;
    const K = a.kaufzeit || [];
    if(!K.length){ $("#main").innerHTML = kopf("⏱ Kaufzeitpunkte", "Noch keine Käufe mit genug Kursdaten (mindestens 30 Tage vor dem Kauf)."); return; }
    const avg = L => L.length ? L.reduce((s,k)=>s+k.pct,0)/L.length : null;
    const unter = K.filter(k=>k.pct<0).length, sp = K.filter(k=>k.sp), hand = K.filter(k=>!k.sp);
    const fach = [[-1,-0.05,"< −5 %"],[-0.05,-0.02,"−5…−2"],[-0.02,0,"−2…0"],[0,0.02,"0…+2"],[0.02,0.05,"+2…+5"],[0.05,9,"> +5 %"]];
    const s = [...K].sort((x,y)=>x.pct-y.pct), m = avg(K);
    const row = k => `<div class="kvrow"><span><b>${esc(k.name)}</b><br><span class="sub">${dk(k.d)} · ${k.sp?"Sparplan":"Einzelkauf"} · Kurs ${nf(2).format(k.kurs)} vs. Ø ${nf(2).format(k.avg)}</span></span><b class="${cls(-k.pct)}">${Pc(k.pct,1,true)}</b></div>`;
    $("#main").innerHTML = kopf("⏱ Kaufzeitpunkte", "Hast du günstig gekauft? Jeder Kaufkurs wird mit dem Durchschnittskurs der 30 Tage davor verglichen. Minus = günstiger als der Schnitt.") + `
      <div class="box"><div class="p6big">
        <div><div class="sub">Ø gegenüber 30-Tage-Schnitt</div><div class="v ${cls(-m)}">${Pc(m,1,true)}</div><div class="sub">${K.length} Käufe</div></div>
        <div><div class="sub">günstiger als der Schnitt</div><div class="v">${Pc(unter/K.length)}</div><div class="sub">${unter} von ${K.length}</div></div>
        <div><div class="sub">Einzelkäufe vs. Sparplan</div><div class="v" style="font-size:16px">${Pc(avg(hand),1,true)} / ${Pc(avg(sp),1,true)}</div><div class="sub">${hand.length} / ${sp.length} Käufe</div></div></div>
        ${bars(fach.map(([lo,hi,l])=>[l, K.filter(k=>k.pct>=lo && k.pct<hi).length]), v=>v+" Käufe", {werte:true})}
        <div class="sub" style="white-space:normal;margin-top:8px">${Math.abs(m)<0.01?"Du kaufst im Schnitt ziemlich genau zum Durchschnittspreis. Das ist normal: Den perfekten Moment trifft auf Dauer niemand.":m<0?"Du kaufst im Schnitt etwas günstiger als der Monatsdurchschnitt – gut gemacht, oft durch Kaufen nach Rücksetzern.":"Du kaufst im Schnitt etwas teurer als der Monatsdurchschnitt – oft passiert das, wenn man nach starken Anstiegen kauft."} ${sp.length && hand.length ? (avg(hand) < avg(sp) ? "Deine Einzelkäufe waren besser getimt als die Sparpläne." : "Deine Sparpläne waren nicht schlechter getimt als deine Einzelkäufe – Timing bringt dir also kaum etwas.") : ""}</div></div>
      <div class="box"><h3>Beste Zeitpunkte</h3>${s.slice(0,5).map(row).join("")}</div>
      <div class="box"><h3>Teuerste Zeitpunkte</h3>${s.slice(-5).reverse().map(row).join("")}</div>
      <div class="sub" style="white-space:normal;margin-top:8px">Nur Käufe, für die es Börsenkurse gibt. Kurse in Euro, ohne Gebühren.</div>`;
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
      $("#wr-share").onclick = async ()=>{ const t = `Mein Börsenjahr ${w.jahr} 📈 ${Pc(w.pct,1,true)} inkl. Dividenden${w.msci_pct!=null?` (MSCI World: ${Pc(w.msci_pct,1,true)})`:""} · ${w.kaeufe} Käufe · ${w.div_n} Dividendenzahlungen${w.best[0]?` · Top: ${w.best[0].name} ${Pc(w.best[0].pct,0,true)}`:""}`;
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
  PLUS.VIEWS.dividenden = function(){ divAlt.apply(this, arguments); try{ if(!P.depot) return; const b = divJahre(); const first = $("#main").querySelector(".box"); if(b && first) first.after(b); }catch(e){ console.error(e); } };

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
        <div class="sub" style="white-space:normal">Der Depot-Schlüssel liegt auf diesem Gerät jetzt nur noch verschlüsselt. Ohne ${art==="pin"?"deine PIN":"dein Gesicht bzw. deinen Finger"} kann niemand dein Depot öffnen – auch nicht, wer dein entsperrtes Handy in die Hand bekommt.</div>
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
    const tok = P.token;
    $("#main").innerHTML = kopf("🔐 Sicherheit & Schlüssel", "Dein Depot ist mit AES-256 verschlüsselt. Wer den Schlüssel hat, kann es lesen. Hier tauschst du ihn aus, ohne dass jemand anderes ihn zu sehen bekommt – auch Claude nicht.") + `
      <div class="box"><h3>Wer kann was?</h3>
        <div class="kvrow"><span>Öffentliche Website & Code</span><b class="sub">nur verschlüsselte Dateien + Marktdaten</b></div>
        <div class="kvrow"><span>Push-Dienst (ntfy)</span><b class="sub">${(P.pf.einstellungen||{}).diskret===false?"⚠ sieht Push-Inhalte":"✓ sieht nur „Neue Nachricht“"}</b></div>
        <div class="kvrow"><span>Deine Geräte</span><b class="sub">Schlüssel lokal im Browser</b></div>
        <div class="kvrow"><span>GitHub-Server (Berechnung)</span><b class="sub">bekommt den Schlüssel nur als geheimes Secret während des Laufs</b></div></div>
      <div class="box"><h3>1 · Neuen Depot-Schlüssel</h3>
        ${alt && !P.keyWechselFertig ? `<div class="notif">⏳ Umgestellt. Sobald der nächste Lauf fertig ist (wenige Minuten), rechnet der Server mit dem neuen Schlüssel. Danach: altes Secret <b>PORTFOLIO_KEY</b> bei GitHub löschen und andere Geräte neu verbinden.<br><span class="sub" style="white-space:normal">Dauert es länger als 15 Minuten? Dann prüf, ob das Secret genau <code>PORTFOLIO_KEY_NEU</code> heißt, und trag den Schlüssel notfalls neu ein: <button class="btn ghost" id="sk-copy2" style="padding:2px 8px">Schlüssel nochmal kopieren</button></span></div>` : ""}
        ${P.keyWechselFertig ? `<div class="notif">✓ Der Server nutzt den neuen Schlüssel. Lösche jetzt bei GitHub das alte Secret <b>PORTFOLIO_KEY</b> (<a href="https://github.com/${REPO6}/settings/secrets/actions" target="_blank" rel="noopener">Secrets öffnen</a>) und verbinde deine anderen Geräte neu (Depot → Gerät verbinden).</div>` : ""}
        ${alt && !P.keyWechselFertig ? "" : !neu ? `<div class="sub" style="white-space:normal">Der Schlüssel wird hier in deinem Browser gewürfelt. Danach trägst du ihn selbst bei GitHub ein. Andere Geräte musst du danach einmal neu verbinden (QR-Code).</div>
          <div class="links"><button class="btn" id="sk-gen" ${tok?"":"disabled"}>Neuen Schlüssel erzeugen</button></div>${tok?"":`<div class="err">Auf diesem Gerät fehlt der Bearbeitungs-Zugang.</div>`}`
        : `<ol style="padding-left:18px;margin:6px 0;font-size:14px;line-height:1.55">
            <li><button class="btn ghost" id="sk-copy">Neuen Schlüssel kopieren</button> <span class="sub">(nirgendwo anders speichern)</span></li>
            <li><a href="https://github.com/${REPO6}/settings/secrets/actions/new" target="_blank" rel="noopener"><b>Bei GitHub ein neues Secret anlegen</b></a> – Name: <code>PORTFOLIO_KEY_NEU</code>, Wert: einfügen, „Add secret“.</li>
            <li><label class="tg"><input type="checkbox" id="sk-ok"> Erledigt, das Secret heißt PORTFOLIO_KEY_NEU</label></li></ol>
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
        // Probe: lässt sich alles mit dem neuen Schlüssel wieder öffnen?
        const zNeu = await encK(kNeu, zObj), pNeu = await encK(kNeu, pObj);
        if(JSON.stringify(await decK(kNeu, pNeu)) !== JSON.stringify(pObj)) throw new Error("Probe fehlgeschlagen");
        await schreiben(tok, "depot/zugang.enc", zNeu, z.sha, "Neuer Schlüssel (Zugang)");
        P.sha = await schreiben(tok, "depot/portfolio.enc", pNeu, p.sha, "Neuer Schlüssel (Depot)");
        const warGesperrt = !!(PLUS.LOCK && PLUS.LOCK.status()); if(warGesperrt) localStorage.removeItem("vf_lock");   // Sperre gehörte zum alten Schlüssel
        ls.set("key_alt", P.keyText); ls.set("key", neuTxt); ls.set("key_neu", null);
        P.keyText = neuTxt; P.key = kNeu; P.pf = pObj; try{ localStorage.setItem("vf_pfenc", pNeu); }catch(e){}
        await ghReq(tok, "POST", "/actions/workflows/scanner.yml/dispatches", {ref:"main"});
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
        out("#tk-out", `<div class="notif">✓ Gespeichert und Schreibrecht geprüft${d.status===200?" (Actions-Recht ✓)":" – ⚠ Actions-Recht fehlt, dann startet „Jetzt scannen“ nicht"}. Lösch jetzt unter <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">deinen Tokens</a> alle alten.</div>`);
      }catch(e){ out("#tk-out", `<div class="err">Der Token funktioniert nicht (${esc(e.message)}). Prüf Repository und Rechte.</div>`); }
    };
  }

  /* ================= Nächster Kauf ================= */
  function renderKaufvorschlag(){
    if(!need("Nächster Kauf")) return;
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
      const dd = s?.dd, rsi = s?.rsi ?? z?.rsi, r1m = s?.r1m;
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
      const br = (isin && brOf[isin]?.b) || z?.broker || (z && isETF6(z) && /acc|thes/i.test(name||"") ? "Trade Republic" : "Scalable Capital");
      return {name, t:z?.t||s?.t, p:Math.round(p), R, N, br, ant, neu};
    };
    const C = Z.map(z=>bewerte(z, z.t?BY[z.t]:null, false));
    (pf.merkliste||[]).filter(t=>BY[t] && !Z.some(z=>z.t===t)).forEach(t=>C.push(bewerte(null, BY[t], true)));
    C.sort((x,y)=>y.p-x.p);
    const bDef = (()=>{ try{ return +localStorage.getItem("vf_kv_b") || 0; }catch(e){ return 0; } })() || 250;
    $("#main").innerHTML = kopf("🛒 Nächster Kauf", "Wohin sollte dein nächstes Geld? Ein regelbasierter Vorschlag aus deinen Zielen (Umschichten), Kaufzonen, Rücksetzern, Burggraben und Klumpenrisiko – keine Anlageberatung.") + `
      <div class="box"><div class="form"><label>Betrag<input class="inp" id="kv-b" inputmode="decimal" value="${bDef}" style="max-width:160px"></label></div><div id="kv-out"></div></div>
      <div class="box"><h3>Diesmal eher nicht</h3>${C.filter(c=>c.N.length && !c.neu).slice(-4).reverse().map(c=>`<div class="kvrow"><span><b>${esc(c.name)}</b><br><span class="sub">${c.N.map(esc).join(" · ")}</span></span><b class="sub" style="white-space:nowrap">${c.p} P.</b></div>`).join("") || `<div class="sub">Nichts auffällig.</div>`}</div>
      ${T?"":`<div class="notif">💡 Leg unter <a href="#umschichten">Umschichten</a> deine Ziel-Verteilung fest (z. B. 70 % ETFs, 30 % Einzelaktien) – dann wird der Vorschlag deutlich besser.</div>`}`;
    const calc = () => {
      const B = toNum($("#kv-b").value) || 0; try{ localStorage.setItem("vf_kv_b", B); }catch(e){}
      const minOrder = c => Math.max(50, Math.ceil(((gebuehr[c.br] ?? 1) / 0.005)/50)*50);  // Gebühr höchstens ~0,5 %
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
  const MINE = ["gebuehren","freistellung","kaufzeit","divwachstum","verkaeufe","crash","steuerrechner","wrapped","sparziel","sicherheit","kaufvorschlag","steuern"];
  const markieren = () => { const m = document.getElementById("main"); if(m) m.classList.toggle("p6v", MINE.includes(location.hash.slice(1).split(/[?&]/)[0])); };
  window.addEventListener("hashchange", markieren); setTimeout(markieren, 0);
  const MEHR6 = [["wrapped","🎁 Depot Wrapped","Dein Börsenjahr in Zahlen"],["gebuehren","💸 Gebühren-Check","Was dich Käufe und Verkäufe gekostet haben"],
    ["freistellung","🧾 Freistellungsauftrag aufteilen","Freibetrag richtig auf die Broker verteilen"],["steuerrechner","🧮 Steuer vor Verkauf","Was ein Verkauf an Steuer kostet"],
    ["kaufzeit","⏱ Kaufzeitpunkte","Kaufst du günstig oder teuer?"],["divwachstum","🌱 Dividenden-Wachstum","Echte Ausschüttungen Monat für Monat"],
    ["verkaeufe","🔁 Verkaufs-Rückblick","Was wäre, wenn du gehalten hättest?"],["crash","🌪 Crash-Test","Dein Depot in 2008, 2020 und 2022"],["sparziel","🎯 Sparziel","Bist du auf Kurs?"],["kaufvorschlag","🛒 Nächster Kauf","Wohin das nächste Geld gehen sollte"],["steuern","🧾 Quellensteuer & Steuern","Wie viel dir durch Steuern weggekommen ist"],["sicherheit","🔐 Sicherheit & App-Sperre","Face ID, Schlüssel und Zugang"]];
  const mehr5 = PLUS.VIEWS.mehr;
  PLUS.VIEWS.mehr = () => { mehr5(); const first = $("#main").querySelector(".list");
    if(first) first.insertAdjacentHTML("afterend", `<h3 style="margin:16px 2px 0">📒 Aus deinen Transaktionen</h3><div class="list">${MEHR6.map(([h,t,s])=>`<a class="row" href="#${h}" style="text-decoration:none;color:inherit;grid-template-columns:1fr auto"><div><div class="nm">${t}</div><div class="sub">${s}</div></div><span class="sub">›</span></a>`).join("")}</div>`); };
  const mk = f => function(){ markieren(); return f.apply(this, arguments); };
  Object.assign(PLUS.VIEWS, {gebuehren:mk(renderGebuehren), freistellung:mk(renderFreistellung), kaufzeit:mk(renderKaufzeit), divwachstum:mk(renderDivwachstum),
    verkaeufe:mk(renderVerkaeufe), crash:mk(renderCrash), steuerrechner:mk(renderSteuerrechner), wrapped:mk(renderWrapped), sparziel:mk(renderSparziel), sicherheit:mk(renderSicherheit), kaufvorschlag:mk(renderKaufvorschlag), steuern:mk(renderSteuern)});
  PLUS3.DEPOT_VIEWS.push(...MEHR6.map(m=>m[0]));
  PLUS3.MEHR.push(...MEHR6.map(m=>m[0]));
  return { freiDaten };
})();
