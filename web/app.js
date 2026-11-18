"use strict";
const $ = s => document.querySelector(s);
const store = {
  get(k, d){ try{ const v = localStorage.getItem("vf_"+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem("vf_"+k, JSON.stringify(v)); }catch(e){} }
};
let DATA = null, BY = {};
const ui = Object.assign({q:"", markt:"alle", sektor:"alle", sort:"score", profit:false, limit:60, afilter:"alle", ssort:"r1y"}, store.get("ui", {}));
ui.limit = 60;
const saveUi = () => store.set("ui", {markt:ui.markt, sort:ui.sort, profit:ui.profit, qual:ui.qual, afilter:ui.afilter, ssort:ui.ssort});
let stars = new Set(store.get("stars", []));

/* ---------- Formatierung ---------- */
const nf = (d) => new Intl.NumberFormat("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d});
const F = {
  n: (x, d=2) => x==null ? "–" : nf(d).format(x),
  p: (x, d=1, sign=true) => x==null ? "–" : (sign && x>0 ? "+" : "") + nf(d).format(x*100) + " %",
  cur: (x, c) => x==null ? "–" : nf(x>=1000?0:2).format(x) + " " + ({USD:"$",EUR:"€",GBP:"£",GBp:"p",CHF:"CHF",DKK:"kr"}[c] || c || ""),
  mcap: (x) => x==null ? "–" : x>=1e12 ? nf(2).format(x/1e12)+" Bio." : x>=1e9 ? nf(1).format(x/1e9)+" Mrd." : nf(0).format(x/1e6)+" Mio.",
  ago: (iso) => { if(!iso) return "–"; const m = Math.round((Date.now()-new Date(iso))/60000);
    if(m<1) return "gerade eben"; if(m<60) return `vor ${m} Min.`; const h=Math.round(m/60); if(h<24) return `vor ${h} Std.`;
    return new Date(iso).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}); },
  d: (ymd) => ymd ? ymd.split("-").reverse().join(".") : "–",
  dt: (iso) => iso ? new Date(iso).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "–",
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Links aus fremden Daten (News): nur http(s) zulassen – "javascript:"-Links wären sonst ausführbarer Code
const sUrl = u => /^https?:\/\//i.test(String(u ?? "").trim()) ? String(u).trim() : "#";
const pill = (x, d=1) => `<span class="pill ${x==null||Math.abs(x)<0.0005?"flat":x>0?"up":"down"}">${F.p(x,d)}</span>`;
const cls = x => x==null ? "" : x>0 ? "pos" : x<0 ? "neg" : "";
const scoreCls = s => s==null ? "" : s>=70 ? "hi" : s>=55 ? "mid" : "";
const MARKT = {US:"USA", DE:"Deutschland", FR:"Frankreich", NL:"Niederlande", UK:"Großbritannien", CH:"Schweiz", SE:"Schweden", DK:"Dänemark",
  IT:"Italien", ES:"Spanien", FI:"Finnland", BE:"Belgien", AT:"Österreich", NO:"Norwegen", IE:"Irland", PT:"Portugal", CA:"Kanada", HK:"Hongkong", JP:"Japan"};
const REGION = {EU:["FR","NL","UK","CH","SE","DK","IT","ES","FI","BE","AT","NO","IE","PT"], ASIEN:["HK","JP"]};

function spark(arr, w=84, h=28, stroke){
  if(!arr || arr.length<2) return "";
  const mn=Math.min(...arr), mx=Math.max(...arr), r=(mx-mn)||1;
  const pts = arr.map((v,i)=>`${(i/(arr.length-1)*w).toFixed(1)},${(h-2-(v-mn)/r*(h-4)).toFixed(1)}`).join(" ");
  const c = stroke || (arr[arr.length-1]>=arr[0] ? "var(--up)" : "var(--down)");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function bigChart(arr, cur, lbl){
  if(!arr || arr.length<2) return "";
  const w=640, h=170, pad=4, mn=Math.min(...arr), mx=Math.max(...arr), r=(mx-mn)||1;
  const X=i=>pad+i/(arr.length-1)*(w-2*pad), Y=v=>pad+8+(1-(v-mn)/r)*(h-2*pad-16);
  const pts=arr.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const up = arr[arr.length-1]>=arr[0], c = up ? "var(--up)" : "var(--down)";
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" style="display:block;height:170px">
    <polygon points="${X(0)},${h} ${pts} ${X(arr.length-1)},${h}" fill="${c}" opacity=".10"/>
    <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg><div style="display:flex;justify-content:space-between;color:var(--mut);font-size:12px;margin-top:4px">
  <span>${(lbl||["vor 1 Jahr"])[0]}</span><span>Tief ${F.cur(mn,cur)} · Hoch ${F.cur(mx,cur)}</span><span>${(lbl||[0,"heute"])[1]}</span></div>`;
}

/* ---------- Daten laden ---------- */
async function load(manual){
  $("#reload").classList.add("spin");
  try{
    const r = await fetch("data.json?ts="+Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const d = await r.json();
    const first = !DATA;
    DATA = d; BY = Object.fromEntries(d.stocks.map(s=>[s.t,s]));
    $("#stand").textContent = `Stand ${F.dt(d.stand)} · ${d.anzahl} Aktien`;
    checkNewAlerts(first);
    render();
    PLUS.onData();
  }catch(e){
    if(!DATA) $("#main").innerHTML = `<div class="err"><b>Daten konnten nicht geladen werden.</b><br>Läuft der GitHub-Job schon? Beim allerersten Mal dauert es ca. 10 Minuten, bis <code>data.json</code> existiert.<br><small>${esc(e.message)}</small></div>`;
  }finally{ $("#reload").classList.remove("spin"); }
}

/* ---------- Ansichten ---------- */
const view = () => (location.hash.replace("#","") || "chancen").split("-")[0];
function render(){
  const VV = Object.assign({chancen:renderChancen, alarme:renderAlarme, branchen:renderBranchen, merkliste:renderMerkliste}, (typeof PLUS!=="undefined" ? PLUS.VIEWS : {}));
  const v = VV[view()] ? view() : "chancen";
  const nv = ["branchen","merkliste","rechner","markt","datencheck","dividenden"].concat(typeof PLUS3!=="undefined"?PLUS3.MEHR:[]).includes(v) ? "mehr" : v;
  document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("on", a.dataset.v===nv));
  if(!DATA) return;
  updateBadge();
  VV[v]();
}

function filtered(){
  const q = ui.q.trim().toLowerCase();
  let L = DATA.stocks.filter(s =>
    (ui.markt==="alle" || (REGION[ui.markt] ? REGION[ui.markt].includes(s.m) : ui.markt==="andere" ? !["US","DE",...REGION.EU,...REGION.ASIEN].includes(s.m) : s.m===ui.markt)) &&
    (ui.sektor==="alle" || s.s===ui.sektor) &&
    (!ui.profit || (s.marge!=null && s.marge>0)) &&
    (!ui.qual || PLUS.isQual(s)) &&
    (!q || s.t.toLowerCase().includes(q) || s.n.toLowerCase().includes(q) || (s.i||"").toLowerCase().includes(q)));
  const key = {score:s=>s.score, upside:s=>s.upside, dd:s=>s.dd==null?null:-s.dd, r1d:s=>s.r1d, r1dneg:s=>s.r1d==null?null:-s.r1d, r1y:s=>s.r1y, rsi:s=>s.rsi==null?null:-s.rsi, moat:s=>s.moat, gap:s=>(s.grp_r6m!=null&&s.r6m!=null)?s.grp_r6m-s.r6m:null}[ui.sort];
  L.sort((a,b)=>{const x=key(a), y=key(b); if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1; return y-x;});
  return L;
}

function rowHtml(s){
  const sub = `${esc(s.t)} · ${esc(s.s)}${s.i?" · "+esc(s.i):""}`;
  const w = (s.warn&&s.warn.length) ? `<span style="color:var(--warn)">⚠ ${esc(s.warn[0])}</span>` : esc((s.why||[])[0] || "");
  return `<div class="row" data-t="${esc(s.t)}">
    <div class="score ${scoreCls(s.score)}" title="Chancen-Score">${s.score==null?"–":Math.round(s.score)}</div>
    <div style="min-width:0"><div class="nm">${stars.has(s.t)?"★ ":""}${esc(s.n)}</div><div class="sub">${sub}</div><div class="why">${w}</div></div>
    <div class="right"><span class="px">${F.cur(s.p,s.cur)}</span>${pill(s.r1d)}${spark(s.spark,70,22)}</div>
  </div>`;
}

function renderChancen(){
  const sek = [...new Set(DATA.stocks.map(s=>s.s))].sort();
  const L = filtered();
  $("#main").innerHTML = `${PLUS.marktStrip()}
  <div class="filters">
    <input type="search" id="q" placeholder="Suche: Name, Ticker, Branche" value="${esc(ui.q)}">
    <select id="sort">
      ${[["score","Chancen-Score"],["upside","Kursziel-Potenzial"],["gap","Rückstand zur Branche"],["dd","Abstand zum Hoch"],["r1dneg","Größte Verlierer heute"],["r1d","Größte Gewinner heute"],["r1y","Performance 1 Jahr"],["rsi","Überverkauft (RSI)"],["moat","Burggraben"]]
        .map(([k,l])=>`<option value="${k}" ${ui.sort===k?"selected":""}>${l}</option>`).join("")}
    </select>
    <select id="markt">
      ${[["alle","Alle Märkte"],["US","USA"],["DE","Deutschland"],["EU","Europa (ohne DE)"],["ASIEN","Asien"],["andere","Andere"]].map(([k,l])=>`<option value="${k}" ${ui.markt===k?"selected":""}>${l}</option>`).join("")}
    </select>
    <select id="sektor"><option value="alle">Alle Branchen</option>${sek.map(s=>`<option ${ui.sektor===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
    <label class="toggle"><input type="checkbox" id="profit" ${ui.profit?"checked":""}> nur profitable</label>
    <label class="toggle" title="Marge ≥ 15 %, Eigenkapitalrendite ≥ 15 %, Umsatz wächst, Schwankung ≤ 35 %"><input type="checkbox" id="qual" ${ui.qual?"checked":""}> nur Qualität</label>
  </div>
  <div class="hint">${L.length} Treffer · Tippe auf eine Aktie für Details und die Score-Begründung.</div>
  <div class="list">${L.slice(0,ui.limit).map(rowHtml).join("") || '<div class="empty">Keine Treffer.</div>'}</div>
  ${L.length>ui.limit?`<button class="more" id="more">Weitere ${Math.min(60,L.length-ui.limit)} anzeigen</button>`:""}`;
  const q=$("#q"); q.addEventListener("input", ()=>{ ui.q=q.value; ui.limit=60; const pos=q.selectionStart; renderChancen(); const n=$("#q"); n.focus(); n.setSelectionRange(pos,pos); });
  ["sort","markt","sektor"].forEach(id=>$("#"+id).addEventListener("change", e=>{ ui[id]=e.target.value; ui.limit=60; saveUi(); renderChancen(); }));
  $("#profit").addEventListener("change", e=>{ ui.profit=e.target.checked; saveUi(); renderChancen(); });
  $("#qual").addEventListener("change", e=>{ ui.qual=e.target.checked; saveUi(); renderChancen(); });
  $("#more")?.addEventListener("click", ()=>{ ui.limit+=60; renderChancen(); });
}

const TYP = {ohne_grund:"Kein Grund gefunden", news:"News", zahlen:"Quartalszahlen", dividende:"Ex-Dividende"};
function renderAlarme(){
  const A = DATA.alarme.filter(a => ui.afilter==="alle" || a.typ===ui.afilter);
  store.set("seen", DATA.alarme.map(a=>a.id)); updateBadge();
  const canN = "Notification" in window;
  const nOn = canN && Notification.permission==="granted" && store.get("notif", false);
  $("#main").innerHTML = `
  <div class="chips">${[["alle","Alle"],["ohne_grund","Kein Grund gefunden"],["news","Mit News"],["zahlen","Quartalszahlen"]].map(([k,l])=>
    `<span class="chip ${ui.afilter===k?"on":""}" data-f="${k}">${l}</span>`).join("")}</div>
  <div class="notif">
    ${canN ? (nOn ? `🔔 Browser-Benachrichtigungen sind an (solange die Seite offen ist). <button class="btn ghost" id="noff">Ausschalten</button>`
                  : `🔕 Bei neuen Alarmen benachrichtigen, solange die Seite offen ist. <button class="btn" id="non">Einschalten</button>`)
           : `Dein Browser unterstützt hier keine Benachrichtigungen.`}
    <span style="color:var(--mut)">Push-Nachrichten aufs Handy, auch wenn die Seite zu ist: Depot → Benachrichtigungen.</span>
  </div>
  <div class="hint">Gemeldet werden Kursrückgänge, die deutlich schlechter sind als die eigene Branche. Danach wird geprüft, ob es News, Quartalszahlen oder einen Ex-Dividenden-Tag gab.</div>
  <div class="list">${A.map(a=>`
    <div class="alert ${a.typ}">
      <div class="atop"><div><span class="tag ${a.typ}">${TYP[a.typ]||a.typ}</span>
        <div class="nm" style="margin-top:6px"><span class="link" data-t="${esc(a.t)}">${esc(a.n)}</span> <span class="sub">${esc(a.t)} · ${esc(a.s)}</span></div></div>
        <div class="right">${pill(a.art==="1d"?a.r1d:a.r5d)}<span class="sub">${a.art==="1d"?"heute":"5 Tage"}</span></div></div>
      <div class="grund"><b>${F.n(Math.abs((a.rel||0)*100),1)} Prozentpunkte</b> schlechter als die Branche · Kurs ${F.cur(a.p,a.cur)}${a.score!=null?` · Score ${Math.round(a.score)}`:""}</div>
      <div class="grund">${esc(a.grund)}</div>
      ${a.news&&a.news.length?`<ul>${a.news.map(n=>`<li>${n.url?`<a href="${esc(sUrl(n.url))}" target="_blank" rel="noopener">${esc(n.titel)}</a>`:esc(n.titel)} <span class="sub">${esc(n.quelle||"")}</span></li>`).join("")}</ul>`:""}
      <div class="sub" style="margin-top:6px">Erkannt ${F.ago(a.zeit)} · Kursdatum ${F.d(a.datum)}</div>
    </div>`).join("") || '<div class="empty">Keine Alarme in dieser Kategorie. Das ist ein gutes Zeichen.</div>'}</div>`;
  document.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",()=>{ ui.afilter=c.dataset.f; saveUi(); renderAlarme(); }));
  $("#non")?.addEventListener("click", async ()=>{ try{ const p = await Notification.requestPermission(); store.set("notif", p==="granted"); }catch(e){} renderAlarme(); });
  $("#noff")?.addEventListener("click", ()=>{ store.set("notif", false); renderAlarme(); });
}

function renderBranchen(){
  const k = ui.ssort, S = [...DATA.sektoren].sort((a,b)=>(b[k]??-9)-(a[k]??-9));
  const th = (key,l,c="") => `<th class="${c}" data-k="${key}">${l}${k===key?" ▾":""}</th>`;
  $("#main").innerHTML = `
  <div class="hint" style="margin-top:12px">Median-Performance je Branche. Tippe auf eine Branche, um ihre Aktien nach Score sortiert zu sehen.</div>
  <div class="sek"><table><thead><tr><th>Branche</th>${th("r1d","Heute")}${th("r1m","1 M","hide-s")}${th("r6m","6 M")}${th("r1y","1 J")}${th("score","Ø Score","hide-s")}</tr></thead>
  <tbody>${S.map(s=>`<tr data-s="${esc(s.s)}"><td>${esc(s.s)} <span class="sub">${s.n}</span></td>
    <td class="${cls(s.r1d)}">${F.p(s.r1d)}</td><td class="hide-s ${cls(s.r1m)}">${F.p(s.r1m)}</td>
    <td class="${cls(s.r6m)}">${F.p(s.r6m,0)}</td><td class="${cls(s.r1y)}">${F.p(s.r1y,0)}</td>
    <td class="hide-s">${s.score==null?"–":Math.round(s.score)}</td></tr>`).join("")}</tbody></table></div>`;
  document.querySelectorAll(".sek th[data-k]").forEach(t=>t.addEventListener("click",()=>{ ui.ssort=t.dataset.k; saveUi(); renderBranchen(); }));
  document.querySelectorAll(".sek tbody tr").forEach(t=>t.addEventListener("click",()=>{ ui.sektor=t.dataset.s; ui.sort="score"; ui.q=""; location.hash="chancen"; }));
}

function renderMerkliste(){
  const L = [...stars].map(t=>BY[t]).filter(Boolean);
  const missing = [...stars].filter(t=>!BY[t]);
  $("#main").innerHTML = `<div class="hint" style="margin-top:12px">Deine Merkliste wird auf diesem Gerät gespeichert. Mit ☆ in der Detailansicht fügst du Aktien hinzu.</div>
  <div class="list">${L.map(rowHtml).join("") || '<div class="empty">Noch keine Aktien gemerkt.</div>'}</div>
  ${missing.length?`<div class="hint">Nicht mehr in den Daten: ${missing.map(esc).join(", ")}</div>`:""}`;
}

/* ---------- Detailansicht ---------- */
const COMP = {kursziel:["Kursziel-Potenzial","Abstand zum Ø Analysten-Kursziel (ab 3 Analysten)"],
  aufholen:["Aufholpotenzial","Wie weit die Aktie in 6 Monaten hinter ihrer Branche liegt"],
  branchentrend:["Branchen-Trend","Wie stark die Branche in 12 Monaten gestiegen ist"],
  bewertung:["Bewertung","Erwartetes KGV im Vergleich zur Branche (günstiger = besser)"],
  qualitaet:["Qualität","Gewinnmarge, Umsatzwachstum, Eigenkapitalrendite"]};

function openDetail(t){
  const s = BY[t]; if(!s) return;
  const on = stars.has(t);
  const c = s.comp || {};
  const recTxt = s.rec==null ? "–" : `${F.n(s.rec,1)} (${s.rec<=1.8?"Kaufen":s.rec<=2.5?"Eher kaufen":s.rec<=3.2?"Halten":"Verkaufen"})`;
  $("#sheet").innerHTML = `
  <div class="shead">
    <div style="min-width:0"><h2>${esc(s.n)}</h2><div class="sub" style="white-space:normal">${esc(s.t)} · ${esc(MARKT[s.m]||s.m)}${s.idx?" · "+esc(s.idx):""} · ${esc(s.s)}${s.i?" · "+esc(s.i):""}</div></div>
    <button class="star ${on?"on":""}" id="star">${on?"★ Gemerkt":"☆ Merken"}</button>
    <button class="iconbtn x" id="close" aria-label="Schließen" style="margin-left:0">✕</button>
  </div>
  <div class="big"><span class="px">${F.cur(s.p,s.cur)}</span>${pill(s.r1d)}<span class="sub">Kursdatum ${F.d(s.datum)}</span></div>
  <div class="box" style="padding:10px 10px 8px">${typeof PLUS2!=="undefined" && PLUS2.kursChart ? PLUS2.kursChart(s) : bigChart(s.spark, s.cur)}</div>
  <div class="box"><h3>Performance</h3><div class="perf">
    ${[["5 T",s.r5d],["1 M",s.r1m],["3 M",s.r3m],["6 M",s.r6m],["1 J",s.r1y],["vom Hoch",s.dd]].map(([l,v])=>`<div class="${cls(v)}">${F.p(v,0)}<small>${l}</small></div>`).join("")}
  </div><div class="sub" style="margin-top:8px;white-space:normal">Vergleichsgruppe „${esc(s.grp)}“ (${s.grp_n} Aktien): 6 M ${F.p(s.grp_r6m,0)} · 1 J ${F.p(s.grp_r1y,0)}</div></div>
  <div class="box"><h3>Chancen-Score ${s.score==null?"–":Math.round(s.score)} / 100</h3>
    ${Object.entries(COMP).map(([k,[l,tip]])=>`<div class="bar" title="${esc(tip)}"><span>${l}</span><div class="tr"><div class="fi" style="width:${c[k]==null?0:Math.round(c[k]*100)}%"></div></div><span class="v">${c[k]==null?"–":Math.round(c[k]*100)}</span></div>`).join("")}
    <div class="sub" style="white-space:normal;margin-top:6px">Jeder Balken ist ein Rang: 80 heißt, besser als 80 % aller gescannten Aktien. Gewichtung in <code>config.json</code>.${s.vollst!=null&&s.vollst<1?` Für diese Aktie fehlen einige Daten (${Math.round(s.vollst*100)} % vorhanden).`:""}</div>
    ${(s.why&&s.why.length)||(s.warn&&s.warn.length)?`<ul class="reasons" style="margin-top:8px">${(s.why||[]).map(x=>`<li>${esc(x)}</li>`).join("")}${(s.warn||[]).map(x=>`<li class="w">${esc(x)}</li>`).join("")}</ul>`:""}
  </div>
  <div class="box"><h3>Kennzahlen</h3><div class="kv">
    ${[["KGV",F.n(s.kgv,1)],["KGV erwartet",F.n(s.kgv_fwd,1)],["Branchen-KGV",F.n(s.grp_kgv,1)],["KBV",F.n(s.kbv,1)],
       ["Gewinnmarge",F.p(s.marge,1,false)],["Umsatzwachstum",F.p(s.uw,1)],["EK-Rendite",F.p(s.roe,1,false)],["Dividende",F.p(s.div,2,false)],
       ["Börsenwert",s.mcap_eur!=null?F.mcap(s.mcap_eur)+" €":F.mcap(s.mcap)],["Kursziel Ø",F.cur(s.ziel,s.cur)],["Potenzial",F.p(s.upside,0)],["Analysten",s.na==null?"–":s.na],
       ["Empfehlung",recTxt],["Volatilität",F.p(s.vol,0,false)]].map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join("")}
  </div></div>
  <div class="links">
    <a href="https://finance.yahoo.com/quote/${encodeURIComponent(s.t)}" target="_blank" rel="noopener">Yahoo Finance ↗</a>
    <a href="https://www.finanzen.net/suchergebnis.asp?_search=${encodeURIComponent(s.n)}" target="_blank" rel="noopener">finanzen.net ↗</a>
    <a href="https://www.google.com/search?q=${encodeURIComponent(s.n+" Aktie News")}&tbm=nws" target="_blank" rel="noopener">News suchen ↗</a>
  </div>${typeof PLUS3!=="undefined"?PLUS3.detail(s):""}${PLUS2.detailTech(s)}${PLUS.detailExtra(s)}`;
  $("#ov").classList.add("open"); document.body.style.overflow="hidden";
  $("#close").onclick = closeDetail; PLUS.detailBind(s); if(typeof PLUS3!=="undefined") PLUS3.bind(s);
  $("#star").onclick = () => { stars.has(t)?stars.delete(t):stars.add(t); store.set("stars",[...stars]); PLUS2.syncStars(); openDetail(t); if(view()!=="alarme") render(); };
}
function closeDetail(){ $("#ov").classList.remove("open"); document.body.style.overflow=""; }
$("#ov").addEventListener("click", e=>{ if(e.target.id==="ov") closeDetail(); });
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeDetail(); });
$("#main").addEventListener("click", e=>{ const el=e.target.closest("[data-t]"); if(el && !e.target.closest("a")) openDetail(el.dataset.t); });

/* ---------- Alarme: Badge + Benachrichtigung ---------- */
function updateBadge(){
  const seen = new Set(store.get("seen", []));
  const n = DATA.alarme.filter(a=>!seen.has(a.id) && a.typ==="ohne_grund").length;
  $("#abadge").innerHTML = n ? `<span class="badge">${n}</span>` : "";
}
function checkNewAlerts(first){
  const known = new Set(store.get("known", []));
  const neu = DATA.alarme.filter(a=>!known.has(a.id) && a.typ==="ohne_grund");
  store.set("known", DATA.alarme.map(a=>a.id));
  if(first || !neu.length) return;
  if("Notification" in window && Notification.permission==="granted" && store.get("notif", false)){
    neu.slice(0,5).forEach(a=>{ try{ new Notification(`⚠️ ${a.n}: ${F.p(a.art==="1d"?a.r1d:a.r5d,1)}`, {body:a.grund, tag:a.id}); }catch(e){} });
  }
}

window.addEventListener("hashchange", render);
$("#reload").addEventListener("click", ()=>load(true));
setInterval(()=>{ const ae=document.activeElement; if(!(ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) load(); }, 15*60*1000);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && DATA && Date.now()-new Date(DATA.stand) > 10*60*1000) load(); });
render(); load();
