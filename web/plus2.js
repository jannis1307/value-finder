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

  /* ---------- Chart: Depot vs. MSCI World ---------- */
  function chart(data, bench){
    const a = (data||[]).map(x=>x[1]);
    if(a.length<2) return `<div class="sub">Noch zu wenig Daten.</div>`;
    const b = (bench && bench.length===a.length) ? bench : null;
    const all = b ? a.concat(b) : a, mn=Math.min(...all), mx=Math.max(...all), r=(mx-mn)||1;
    const w=640, h=170, pad=4;
    const X=i=>pad+i/(a.length-1)*(w-2*pad), Y=v=>pad+8+(1-(v-mn)/r)*(h-2*pad-16);
    const line = arr => arr.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const up = a[a.length-1]>=a[0], c = up ? "var(--up)" : "var(--down)";
    const pa = a[a.length-1]/a[0]-1, pb = b ? b[b.length-1]/b[0]-1 : null;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" style="display:block;height:170px">
      <polygon points="${X(0)},${h} ${line(a)} ${X(a.length-1)},${h}" fill="${c}" opacity=".10"/>
      ${b?`<polyline points="${line(b)}" fill="none" stroke="var(--mut)" stroke-width="1.6" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`:""}
      <polyline points="${line(a)}" fill="none" stroke="${c}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;color:var(--mut);font-size:12px;margin-top:4px">
        <span><b style="color:${c}">━</b> Dein Depot ${F.p(pa,1)}</span>${b?`<span><b>┅</b> MSCI World ${F.p(pb,1)}</span><span>${pa>=pb?"✓ besser als der Markt":"✗ schlechter als der Markt"} (${F.p(pa-pb,1)}-Pkt.)</span>`:""}
        <span>Tief ${E(Math.min(...a))} · Hoch ${E(Math.max(...a))}</span></div>`;
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
  return { chart, depotExtras, detailTech, syncStars, afterLoad };
})();
