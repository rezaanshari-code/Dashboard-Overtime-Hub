let RECORDS, LOC_META;

async function boot(){
  const [recRes, locRes] = await Promise.all([fetch('data.json'), fetch('hub_coords.json')]);
  RECORDS = await recRes.json();
  LOC_META = await locRes.json();

const PALETTE = ["#0f9d8c","#e08b2e","#7b4fd6","#d64b6b","#3563e9","#1791b3","#c99a2e","#4f5fd6","#1f9d55","#8a5a3b","#3b8fa3","#a24fd6"];
function colorFor(name, list){ const i = list.indexOf(name); return PALETTE[i % PALETTE.length]; }

const IDR = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const NUM = n => Math.round(n).toLocaleString('id-ID');
const H1 = n => (Math.round(n*10)/10).toLocaleString('id-ID');

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DOW_ID = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

let DATA_MIN = RECORDS.reduce((a,r)=> r.dt<a?r.dt:a, RECORDS[0].dt);
let DATA_MAX = RECORDS.reduce((a,r)=> r.dt>a?r.dt:a, RECORDS[0].dt);

// ---- location -> BU group membership (a location can appear in both) ----
const locByBu = {HCI:new Set(), AHI:new Set()};
RECORDS.forEach(r=>{ if(locByBu[r.bu]) locByBu[r.bu].add(r.loc); });

// State
const state = {
  start: DATA_MIN, end: DATA_MAX,
  hub: 'ALL',       // 'ALL' | 'HCI' | 'AHI'
  site: null,       // specific location name or null
  view: 'overview'
};

// ================= FILTERING =================
// state.site disimpan sebagai "LOCATION::BU" (bukan cuma nama lokasi), karena
// beberapa site (Denpasar, Sawojajar) dipakai oleh HCI maupun AHI sekaligus.
function filteredRecords(){
  return RECORDS.filter(r=>{
    if(r.dt < state.start || r.dt > state.end) return false;
    if(state.site){
      const [loc,bu] = state.site.split('::');
      return r.loc === loc && r.bu === bu;
    }
    if(state.hub !== 'ALL'){ return r.bu === state.hub; }
    return true;
  });
}
function siteLoc(){ return state.site ? state.site.split('::')[0] : null; }

function aggBase(rows){
  let idr=0,h=0; const soken=new Set();
  rows.forEach(r=>{ idr+=r.idr; h+=r.h; soken.add(r.id); });
  return {idr,h,soken:soken.size,rows:rows.length};
}

// ================= SIDEBAR BUILD =================
function buildSidebar(){
  const hciLocs = Array.from(locByBu.HCI).sort();
  const ahiLocs = Array.from(locByBu.AHI).sort();

  function rowHtml(loc, bu){
    const meta = LOC_META[loc] || {short:loc};
    const dot = bu==='HCI' ? 'var(--hci)' : 'var(--ahi)';
    return `<div class="hub-item" data-site="${loc}" data-bu="${bu}">
      <span class="hl"><span class="dotsm" style="background:${dot}"></span><span class="nm">${meta.short}</span></span>
    </div>`;
  }
  document.getElementById('bodyHCI').innerHTML = hciLocs.map(l=>rowHtml(l,'HCI')).join('');
  document.getElementById('bodyAHI').innerHTML = ahiLocs.map(l=>rowHtml(l,'AHI')).join('');

  // hub select dropdown
  const sel = document.getElementById('huSel');
  const opts = ['<option value="ALL">All Hub</option>', '<option value="HCI">Hub HCI (Semua Site)</option>', '<option value="AHI">Hub AHI (Semua Site)</option>'];
  hciLocs.forEach(l=> opts.push(`<option value="loc:${l}::HCI">${(LOC_META[l]||{}).short||l} (HCI)</option>`));
  ahiLocs.forEach(l=> opts.push(`<option value="loc:${l}::AHI">${(LOC_META[l]||{}).short||l} (AHI)</option>`));
  sel.innerHTML = opts.join('');

  // klik site individual -> filter ke site itu (loc + BU spesifik, karena ada
  // nama site yang dipakai 2 BU sekaligus, misal Denpasar & Sawojajar)
  document.querySelectorAll('.hub-item[data-site]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.site = el.dataset.site + '::' + el.dataset.bu; state.hub = 'ALL';
      sel.value = 'loc:' + state.site;
      setActiveSite();
      renderAll();
    });
  });

  // klik "All Hub" -> reset semua filter hub/site
  document.getElementById('allHubBtn').addEventListener('click', ()=>{
    state.site=null; state.hub='ALL'; sel.value='ALL'; setActiveSite(); renderAll();
  });

  // klik label "HUB HCI" / "HUB AHI" -> filter semua site dalam BU itu sekaligus
  document.querySelectorAll('.grp-filter').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.hub = el.dataset.hub; state.site = null;
      sel.value = el.dataset.hub;
      setActiveSite();
      renderAll();
    });
  });

  // klik chevron -> cuma expand/collapse, gak filter apa-apa
  document.querySelectorAll('.grp-toggle').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const grp = el.dataset.grpToggle;
      document.querySelector(`.group-head[data-grp="${grp}"]`).classList.toggle('open');
      document.getElementById('body'+grp).classList.toggle('open');
    });
  });
}

function setActiveSite(){
  document.querySelectorAll('.hub-item').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('.group-head').forEach(e=>e.classList.remove('selected'));
  document.getElementById('allHubBtn').classList.remove('active');

  if(state.site){
    const [loc,bu] = state.site.split('::');
    document.querySelectorAll(`.hub-item[data-site="${loc}"][data-bu="${bu}"]`).forEach(e=>e.classList.add('active'));
  } else if(state.hub === 'HCI' || state.hub === 'AHI'){
    document.querySelector(`.group-head[data-grp="${state.hub}"]`).classList.add('selected');
  } else {
    document.getElementById('allHubBtn').classList.add('active');
  }
}

// ================= NAV =================
document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
  el.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-item[data-view]').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
    state.view = el.dataset.view;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+state.view).classList.add('active');
    const titles = {overview:'Overview', mpp:'Review MPP', insight:'Insight'};
    document.getElementById('viewTitle').textContent = titles[state.view];
    renderAll();
  });
});

// ================= TOP FILTER BAR =================
const dateStartEl = document.getElementById('dateStart');
const dateEndEl = document.getElementById('dateEnd');
dateStartEl.value = DATA_MIN; dateEndEl.value = DATA_MAX;
dateStartEl.min = DATA_MIN; dateStartEl.max = DATA_MAX;
dateEndEl.min = DATA_MIN; dateEndEl.max = DATA_MAX;

const monthSel = document.getElementById('monthSel');
monthSel.innerHTML = '<option value="ALL">Semua Bulan</option>' + [1,2,3,4,5,6,7].map(m=>`<option value="${m}">${MONTH_NAMES[m-1]}</option>`).join('');

document.getElementById('applyBtn').addEventListener('click', ()=>{
  state.start = dateStartEl.value || DATA_MIN;
  state.end = dateEndEl.value || DATA_MAX;
  renderAll();
});

monthSel.addEventListener('change', ()=>{
  if(monthSel.value==='ALL'){ state.start=DATA_MIN; state.end=DATA_MAX; }
  else{
    const m = parseInt(monthSel.value);
    const y = document.getElementById('yearSel').value;
    const last = new Date(y, m, 0).getDate();
    state.start = `${y}-${String(m).padStart(2,'0')}-01`;
    state.end = `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  }
  dateStartEl.value = state.start; dateEndEl.value = state.end;
  renderAll();
});

document.getElementById('fullMonthBtn').addEventListener('click', ()=>{
  state.start = DATA_MIN; state.end = DATA_MAX;
  monthSel.value='ALL';
  dateStartEl.value = DATA_MIN; dateEndEl.value = DATA_MAX;
  renderAll();
});

document.getElementById('huSel').addEventListener('change', (e)=>{
  const v = e.target.value;
  if(v==='ALL'){ state.hub='ALL'; state.site=null; }
  else if(v==='HCI' || v==='AHI'){ state.hub=v; state.site=null; }
  else if(v.startsWith('loc:')){ state.site = v.slice(4); state.hub='ALL'; } // v.slice(4) sudah format "LOC::BU"
  setActiveSite();
  renderAll();
});

document.getElementById('refreshBtn').addEventListener('click', ()=>{
  state.start=DATA_MIN; state.end=DATA_MAX; state.hub='ALL'; state.site=null;
  dateStartEl.value=DATA_MIN; dateEndEl.value=DATA_MAX; monthSel.value='ALL'; document.getElementById('huSel').value='ALL';
  setActiveSite();
  document.getElementById('updTime').textContent = 'Update: ' + new Date().toLocaleString('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  renderAll();
});
document.getElementById('updTime').textContent = 'Update: ' + new Date().toLocaleString('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

// ================= MAP =================
let map, svgOv, labelOv, markers=[], mapLayer;
function initMap(){
  map = L.map('map', {zoomControl:true, scrollWheelZoom:false}).setView([-3.5, 112], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 12
  }).addTo(map);
  svgOv = document.getElementById('svgOverlay');
  labelOv = document.getElementById('labelOverlay');
  map.on('move zoom', drawLines);
  map.on('moveend zoomend', drawLines);
}

function siteAgg(){
  const rows = filteredRecords();
  const m = {}; // key = loc|bu
  rows.forEach(r=>{
    const k = r.loc+'|'+r.bu;
    if(!m[k]) m[k] = {loc:r.loc, bu:r.bu, idr:0, h:0, soken:new Set(), rows:0};
    m[k].idr += r.idr; m[k].h += r.h; m[k].soken.add(r.id); m[k].rows++;
  });
  return Object.values(m).map(s=>({...s, soken:s.soken.size})).sort((a,b)=>b.idr-a.idr);
}

function IDRk(n){
  if(n>=1e6) return 'Rp ' + (n/1e6).toLocaleString('id-ID', {maximumFractionDigits:1}) + ' Jt';
  if(n>=1e3) return 'Rp ' + (n/1e3).toLocaleString('id-ID', {maximumFractionDigits:0}) + ' Rb';
  return IDR(n);
}

function drawLines(){
  if(!svgOv || !markers.length) return;
  const rect = document.querySelector('.map-wrap').getBoundingClientRect();
  svgOv.setAttribute('width', rect.width); svgOv.setAttribute('height', rect.height);
  let html = `<defs>
    <marker id="arrowHci" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${getComputedStyle(document.documentElement).getPropertyValue('--hci').trim()}"/></marker>
    <marker id="arrowAhi" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${getComputedStyle(document.documentElement).getPropertyValue('--ahi').trim()}"/></marker>
  </defs>`;
  markers.forEach(mk=>{
    const p = map.latLngToContainerPoint(mk.latlng);
    const lp = mk.labelPoint;
    const arrowId = mk.bu==='HCI' ? 'arrowHci' : 'arrowAhi';
    html += `<line x1="${lp.x}" y1="${lp.y}" x2="${p.x}" y2="${p.y}" stroke="${mk.color}" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.85" marker-end="url(#${arrowId})"/>`;
    html += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${mk.color}" stroke="#fff" stroke-width="1.5"/>`;
  });
  svgOv.innerHTML = html;
}

function renderMap(){
  if(!map) initMap();
  markers.forEach(m=>{ if(m.marker) map.removeLayer(m.marker); });
  if(labelOv) labelOv.innerHTML = '';
  markers = [];

  let sites = siteAgg();
  if(state.site){
    const [loc,bu] = state.site.split('::');
    sites = sites.filter(s=>s.loc===loc && s.bu===bu);
  }
  sites = sites.slice(0, 14);

  document.getElementById('mapTitle').textContent = 'Sebaran Site — ' + periodLabel();

  if(sites.length===0){ drawLines(); return; }
  const maxIdr = Math.max(...sites.map(s=>s.idr), 1);

  const leftSites = sites.filter((s)=> (LOC_META[s.loc]||{lng:0}).lng < 108);
  const rightSites = sites.filter((s)=> (LOC_META[s.loc]||{lng:0}).lng >= 108);

  function place(list, side){
    const rect = document.querySelector('.map-wrap').getBoundingClientRect();
    const cardW = 172, margin = 14, gapMin = 50;
    const startY = 30;
    const gapY = Math.max(gapMin, Math.min(78, (rect.height - startY*2)/Math.max(list.length,1)));
    list.forEach((s,i)=>{
      const meta = LOC_META[s.loc] || {lat:-2,lng:117, short:s.loc};
      const latlng = L.latLng(meta.lat, meta.lng);
      const color = s.bu==='HCI' ? getComputedStyle(document.documentElement).getPropertyValue('--hci').trim() : getComputedStyle(document.documentElement).getPropertyValue('--ahi').trim();
      const r = 5 + Math.round((s.idr/maxIdr)*9);
      const marker = L.circleMarker(latlng, {radius:r, color:'#fff', weight:1.5, fillColor:color, fillOpacity:0.9}).addTo(map);
      marker.bindPopup(`<b>${meta.short||s.loc}</b><br>${s.bu}<br>OT: ${IDR(s.idr)}<br>Jam: ${H1(s.h)}<br>Soken: ${s.soken}`);

      const cardX = side==='L' ? margin : rect.width - margin - cardW;
      const cardY = startY + i*gapY;

      // label sebagai elemen HTML biasa (bukan Leaflet marker) supaya tidak
      // kepotong batas peta & bisa menerima klik dengan andal
      const div = document.createElement('div');
      div.className = 'site-label';
      div.style.left = cardX + 'px';
      div.style.top = cardY + 'px';
      div.style.background = color;
      div.innerHTML = `<span class="nm">${meta.short||s.loc}</span><small>${IDRk(s.idr)}</small>`;
      div.addEventListener('click', ()=>{
        state.site = s.loc + '::' + s.bu; state.hub = 'ALL';
        document.getElementById('huSel').value = 'loc:' + state.site;
        setActiveSite();
        renderAll();
        setTimeout(()=> marker.openPopup(), 80);
      });
      labelOv.appendChild(div);

      const labelPoint = L.point(cardX + (side==='L'? cardW : 0), cardY + 20);
      markers.push({marker, labelEl:div, latlng, labelPoint, color, side, bu:s.bu});
    });
  }
  place(leftSites,'L');
  place(rightSites,'R');
  setTimeout(()=>{ map.invalidateSize(); drawLines(); }, 60);
}

function periodLabel(){
  if(state.start===DATA_MIN && state.end===DATA_MAX) return 'Semua Periode';
  return state.start + ' s/d ' + state.end;
}

// ================= CHARTS =================
const charts = {};
function upsertChart(id, cfg){
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}

function renderKPI(){
  const rows = filteredRecords();
  const a = aggBase(rows);
  document.getElementById('kpiIdr').textContent = IDR(a.idr);
  document.getElementById('kpiSoken').textContent = NUM(a.soken);
  document.getElementById('kpiHour').textContent = H1(a.h)+' jam';
  document.getElementById('kpiAvg').textContent = a.soken? IDR(a.idr/a.soken) : IDR(0);
  document.getElementById('kpiIdrSub').textContent = periodLabel();
  document.getElementById('kpiSokenSub').textContent = 'dari '+NUM(new Set(RECORDS.map(r=>r.id)).size)+' total karyawan';
  document.getElementById('kpiHourSub').textContent = a.rows + ' baris transaksi OT';
  document.getElementById('kpiAvgSub').textContent = 'rata-rata per karyawan';
}

function renderTrend(){
  const rows = filteredRecords();
  const byMonth = {};
  rows.forEach(r=>{
    const mk = r.dt.slice(0,7);
    if(!byMonth[mk]) byMonth[mk] = {idr:0,h:0};
    byMonth[mk].idr += r.idr; byMonth[mk].h += r.h;
  });
  const keys = Object.keys(byMonth).sort();
  const labels = keys.map(k=> MONTH_SHORT[parseInt(k.slice(5,7))-1] + ' ' + k.slice(0,4));
  upsertChart('chartTrend', {
    type:'bar',
    data:{ labels, datasets:[
      {type:'bar', label:'Total Hour Paid', data:keys.map(k=>byMonth[k].h), backgroundColor:'#e08b2ecc', borderRadius:6, yAxisID:'y1', order:2},
      {type:'line', label:'Total OT (IDR)', data:keys.map(k=>byMonth[k].idr), borderColor:'#3563e9', backgroundColor:'#3563e9', tension:.35, yAxisID:'y', pointRadius:3, pointBackgroundColor:'#3563e9', order:1}
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{position:'left', ticks:{callback:v=>(v/1e6).toFixed(0)+'Jt'}, grid:{color:'#eef0f6'}, title:{display:true,text:'OT (IDR)',font:{size:10.5}}},
               y1:{position:'right', grid:{display:false}, title:{display:true,text:'Jam',font:{size:10.5}}} },
      plugins:{legend:{position:'bottom', labels:{boxWidth:10,usePointStyle:true}},
        tooltip:{callbacks:{label:c=> c.dataset.label + ': ' + (c.dataset.label==='Total Hour Paid' ? H1(c.parsed.y)+' jam' : IDR(c.parsed.y)) }} } }
  });
}

function renderTopSite(){
  const sites = siteAgg().slice(0,10);
  upsertChart('chartTopSite', {
    type:'bar',
    data:{ labels: sites.map(s=>(LOC_META[s.loc]||{}).short||s.loc),
      datasets:[{ data: sites.map(s=>s.idr), backgroundColor: sites.map(s=> s.bu==='HCI'?'#3563e9':'#e5484d'), borderRadius:6 }]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      scales:{ x:{ticks:{callback:v=>(v/1e6).toFixed(0)+'Jt'}, grid:{color:'#eef0f6'}}, y:{grid:{display:false}} },
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>IDR(c.parsed.x)}}} }
  });
}

function renderSiteTable(){
  const sites = siteAgg();
  const tb = document.getElementById('siteBody');
  tb.innerHTML = sites.map((s,i)=>`<tr>
    <td><span class="rank ${i<3?'top':''}">${i+1}</span></td>
    <td><b>${(LOC_META[s.loc]||{}).short||s.loc}</b></td>
    <td><span class="pill ${s.bu.toLowerCase()}">${s.bu}</span></td>
    <td>${NUM(s.soken)}</td>
    <td>${NUM(s.rows)}</td>
    <td>${H1(s.h)}</td>
    <td>${IDR(s.idr)}</td>
    <td>${IDR(s.soken? s.idr/s.soken:0)}</td>
  </tr>`).join('');
}

// ---- MPP view ----
let mppPage = 0, mppPageSize = 12, mppSort = {k:'idr', dir:-1}, mppFilterText='';
function sokenAgg(){
  const rows = filteredRecords();
  const m = {};
  rows.forEach(r=>{
    if(!m[r.id]) m[r.id] = {id:r.id, nm:r.nm, jt:r.jt, bu:new Set(), hubs:new Set(), days:new Set(), h:0, idr:0};
    const e = m[r.id];
    e.bu.add(r.bu); e.hubs.add((LOC_META[r.loc]||{}).short||r.loc); e.days.add(r.dt); e.h+=r.h; e.idr+=r.idr;
  });
  return Object.values(m).map(e=>({...e, bu:Array.from(e.bu).join('/'), hubs:Array.from(e.hubs).join(', '), days:e.days.size}));
}

function renderMppStats(){
  const s = sokenAgg();
  document.getElementById('mppSoken').textContent = NUM(s.length);
  document.getElementById('mppAvgDays').textContent = s.length? (s.reduce((a,e)=>a+e.days,0)/s.length).toFixed(1) : '0';
  document.getElementById('mppAvgHour').textContent = s.length? H1(s.reduce((a,e)=>a+e.h,0)/s.length) : '0';
}

function renderJobTitleChart(){
  const rows = filteredRecords();
  const soken = sokenAgg();
  const d = soken.filter(s=>s.jt==='D').length, a = soken.filter(s=>s.jt==='A').length;
  upsertChart('chartJobTitle', {
    type:'doughnut',
    data:{ labels:['Driver','Asst to Driver'], datasets:[{data:[d,a], backgroundColor:['#3563e9','#7b4fd6'], borderWidth:0}]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins:{legend:{position:'bottom', labels:{boxWidth:10,usePointStyle:true}}} }
  });
}

function renderTopSoken(){
  const soken = sokenAgg().sort((a,b)=>b.idr-a.idr).slice(0,10);
  upsertChart('chartTopSoken', {
    type:'bar',
    data:{ labels: soken.map(s=>s.nm.length>18? s.nm.slice(0,18)+'…':s.nm),
      datasets:[{data:soken.map(s=>s.idr), backgroundColor:'#0f9d8ccc', borderRadius:6}]},
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      scales:{ x:{ticks:{callback:v=>(v/1e6).toFixed(1)+'Jt'}, grid:{color:'#eef0f6'}}, y:{grid:{display:false}} },
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>IDR(c.parsed.x)}}} }
  });
}

function renderMppTable(){
  let soken = sokenAgg();
  if(mppFilterText){
    const q = mppFilterText.toLowerCase();
    soken = soken.filter(s=> s.nm.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  }
  soken.sort((a,b)=>{
    const k = mppSort.k;
    if(k==='nm'||k==='id'||k==='jt'||k==='bu'||k==='hubs') return mppSort.dir * String(a[k]).localeCompare(String(b[k]));
    return mppSort.dir * ((a[k]||0)-(b[k]||0));
  });
  const totalPages = Math.max(1, Math.ceil(soken.length/mppPageSize));
  mppPage = Math.min(mppPage, totalPages-1);
  const pageRows = soken.slice(mppPage*mppPageSize, mppPage*mppPageSize+mppPageSize);

  document.getElementById('mppBody').innerHTML = pageRows.map((s,i)=>{
    const rank = mppPage*mppPageSize+i+1;
    return `<tr>
      <td><span class="rank ${rank<=3?'top':''}">${rank}</span></td>
      <td>${s.id}</td>
      <td><b>${s.nm}</b></td>
      <td>${s.jt==='D'?'Driver':'Asst to Driver'}</td>
      <td>${s.bu.split('/').map(b=>`<span class="pill ${b.toLowerCase()}">${b}</span>`).join(' ')}</td>
      <td>${s.hubs}</td>
      <td>${s.days}</td>
      <td>${H1(s.h)}</td>
      <td>${IDR(s.idr)}</td>
    </tr>`;
  }).join('');
  document.getElementById('mppPageInfo').textContent = `${soken.length} soken · halaman ${mppPage+1}/${totalPages}`;
  document.getElementById('mppPrev').disabled = mppPage===0;
  document.getElementById('mppNext').disabled = mppPage>=totalPages-1;
}

document.getElementById('mppSearch').addEventListener('input', e=>{ mppFilterText=e.target.value; mppPage=0; renderMppTable(); });
document.getElementById('mppPrev').addEventListener('click', ()=>{ mppPage=Math.max(0,mppPage-1); renderMppTable(); });
document.getElementById('mppNext').addEventListener('click', ()=>{ mppPage++; renderMppTable(); });
document.querySelectorAll('#mppTable th[data-k]').forEach(th=>{
  th.addEventListener('click', ()=>{
    const k = th.dataset.k;
    if(k==='rank') return;
    if(mppSort.k===k) mppSort.dir*=-1; else { mppSort.k=k; mppSort.dir=-1; }
    document.querySelectorAll('#mppTable th').forEach(x=>x.classList.remove('sorted'));
    th.classList.add('sorted');
    renderMppTable();
  });
});

// ---- Insight view ----
function renderOtType(){
  const rows = filteredRecords();
  const m = {};
  rows.forEach(r=>{ m[r.ot] = (m[r.ot]||0) + r.idr; });
  const entries = Object.entries(m).sort((a,b)=>b[1]-a[1]);
  upsertChart('chartOtType', {
    type:'doughnut',
    data:{ labels: entries.map(e=>e[0]), datasets:[{data:entries.map(e=>e[1]), backgroundColor:PALETTE, borderWidth:0}]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins:{legend:{position:'bottom', labels:{boxWidth:10, usePointStyle:true, font:{size:10.5}}},
        tooltip:{callbacks:{label:c=>c.label+': '+IDR(c.parsed)}}} }
  });
}

function renderDow(){
  const rows = filteredRecords();
  const m = [0,0,0,0,0,0,0];
  rows.forEach(r=>{ const d = new Date(r.dt+'T00:00:00').getDay(); m[d]+=r.idr; });
  const order = [1,2,3,4,5,6,0];
  upsertChart('chartDow', {
    type:'bar',
    data:{ labels: order.map(i=>DOW_ID[i]), datasets:[{data: order.map(i=>m[i]), backgroundColor:'#3563e9cc', borderRadius:6}]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{ticks:{callback:v=>(v/1e6).toFixed(0)+'Jt'}, grid:{color:'#eef0f6'}}, x:{grid:{display:false}} },
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>IDR(c.parsed.y)}}} }
  });
}

function renderBuMonth(){
  const rows = filteredRecords();
  const m = {};
  rows.forEach(r=>{
    const mk = r.dt.slice(0,7);
    if(!m[mk]) m[mk] = {HCI:0, AHI:0};
    m[mk][r.bu] = (m[mk][r.bu]||0) + r.idr;
  });
  const keys = Object.keys(m).sort();
  const labels = keys.map(k=> MONTH_SHORT[parseInt(k.slice(5,7))-1] + ' ' + k.slice(0,4));
  upsertChart('chartBuMonth', {
    type:'bar',
    data:{ labels, datasets:[
      {label:'HCI', data:keys.map(k=>m[k].HCI||0), backgroundColor:'#3563e9cc', borderRadius:5},
      {label:'AHI', data:keys.map(k=>m[k].AHI||0), backgroundColor:'#e5484dcc', borderRadius:5},
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{ticks:{callback:v=>(v/1e6).toFixed(0)+'Jt'}, grid:{color:'#eef0f6'}}, x:{grid:{display:false}} },
      plugins:{legend:{position:'bottom', labels:{boxWidth:10,usePointStyle:true}}} }
  });
}

// ================= MASTER RENDER =================
function safeRun(fn){
  try{ fn(); } catch(err){ console.error('render error in', fn.name, err); }
}

function renderAll(){
  if(state.view==='overview'){
    [renderKPI, renderMap, renderTrend, renderTopSite].forEach(safeRun);
  } else if(state.view==='mpp'){
    [renderMppStats, renderJobTitleChart, renderTopSoken, renderMppTable].forEach(safeRun);
  } else if(state.view==='insight'){
    [renderOtType, renderDow, renderBuMonth, renderSiteTable].forEach(safeRun);
  }
}

buildSidebar();
window.addEventListener('resize', ()=>{ if(map){ map.invalidateSize(); drawLines(); } });
renderAll();
}

boot();
