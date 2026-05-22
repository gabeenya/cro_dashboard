// ── Supabase ────────────────────────────────
const SUPABASE_URL = 'https://ywceavigvleurnzzeqdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ny1yoy5La-q9Tw7jT6pstg_SV0_fb1a';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 상태 ───────────────────────────────────
let allDiv=[], allBrands=[], allCats=[], allSubs=[], allRisks=[];
let activeDiv='', editId=null;
let tChart=null, dChart=null;
let lPage=1; const PER=20;
let rptFmt='ppt';
const CAT_COLORS=['#1a2744','#c8102e','#d97706','#059669','#7c3aed','#0284c7','#db2777','#64748b'];

// ── 초기화 ─────────────────────────────────
async function init(){
  const now=new Date();
  document.getElementById('today-date').textContent=
    `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById('p-date').value=now.toISOString().split('T')[0];
  document.getElementById('k-month-badge').textContent=`${now.getMonth()+1}월`;
  await loadMaster();
  await loadAll();
}

async function loadMaster(){
  const [d,b,c,s]=await Promise.all([
    sb.from('divisions').select('*').order('sort_order'),
    sb.from('brands').select('*').order('sort_order'),
    sb.from('risk_categories').select('*').order('sort_order'),
    sb.from('risk_subcategories').select('*').order('sort_order'),
  ]);
  allDiv=d.data||[]; allBrands=b.data||[]; allCats=c.data||[]; allSubs=s.data||[];
  fillSel('lf-div',allDiv,'전체 계열사');
  fillSel('f-cat',allCats,'전체 대분류');
  fillSel('lf-cat',allCats,'전체 대분류');
  ['m-div','p-div'].forEach(id=>{
    allDiv.forEach(x=>{document.getElementById(id).innerHTML+=`<option value="${x.id}">${x.name}</option>`;});
  });
  ['m-cat','p-cat'].forEach(id=>{
    allCats.forEach(x=>{document.getElementById(id).innerHTML+=`<option value="${x.id}">${x.name}</option>`;});
  });
}

function fillSel(id,items,ph){
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML=`<option value="">${ph}</option>`;
  items.forEach(x=>{el.innerHTML+=`<option value="${x.id}">${x.name}</option>`;});
}

async function loadAll(){
  document.getElementById('conn-status').textContent='로딩 중...';
  const {data,error}=await sb.from('risks').select(`
    id,registered_at,title,status,grade,note,created_at,
    item_state,violation_count,monitoring_count,
    divisions(id,name),brands(id,name),
    risk_categories(id,name),risk_subcategories(id,name)
  `).order('created_at',{ascending:false});
  if(error){document.getElementById('conn-status').textContent='연결 오류';showToast('데이터 로드 실패');return;}
  allRisks=data;
  document.getElementById('conn-status').textContent=`데이터 ${data.length}건`;
  updateSidebarBadges();
  renderDash(getFiltered());
}

// ── 사이드바 배지 ───────────────────────────
function updateSidebarBadges(){
  ['패션','유통','외식','파크','건설','소법인'].forEach(name=>{
    const cnt=allRisks.filter(r=>r.divisions?.name===name).length;
    const el=document.getElementById('db-'+name);
    if(el) el.textContent=cnt;
  });
}

// ── 탭/필터 ────────────────────────────────
function setDiv(name,el){
  activeDiv=name;
  // 사이드바 on 상태
  document.querySelectorAll('.mgmt-item,.div-item').forEach(e=>e.classList.remove('on'));
  if(el) el.classList.add('on');
  if(!name){ document.getElementById('nav-all').classList.add('on'); }
  document.getElementById('page-crumb').textContent=name||'전사 8대 리스크 관리 현황';
  // 브랜드 필터 갱신
  const dObj=allDiv.find(d=>d.name===name);
  const brands=name?allBrands.filter(b=>b.division_id===dObj?.id):allBrands;
  fillSel('f-brand',brands,'전체 브랜드');
  document.getElementById('f-brand').value='';
  // 대시보드로 전환
  document.querySelectorAll('.page').forEach(e=>e.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  renderDash(getFiltered());
}

function getFiltered(){
  const brand=document.getElementById('f-brand').value;
  const cat=document.getElementById('f-cat').value;
  const grade=document.getElementById('f-grade').value;
  const state=document.getElementById('f-state').value;
  return allRisks.filter(r=>{
    if(activeDiv && r.divisions?.name!==activeDiv) return false;
    if(brand && r.brands?.id!=brand) return false;
    if(cat   && r.risk_categories?.id!=cat) return false;
    if(grade && r.grade!==grade) return false;
    if(state && r.item_state!==state) return false;
    return true;
  });
}
function applyFilter(){renderDash(getFiltered());}

// ── 대시보드 전체 렌더 ──────────────────────
function renderDash(risks){
  renderKPI(risks); renderTrend(risks); renderDonut(risks);
  if(!activeDiv){
    // 메인뷰
    document.getElementById('section-main').style.display='';
    document.getElementById('section-div').style.display='none';
    renderMatrix(risks);
    renderHighMain(risks);
  } else {
    // 계열사뷰
    document.getElementById('section-main').style.display='none';
    document.getElementById('section-div').style.display='';
    renderBrandGrid(risks);
    renderHighDiv(risks);
  }
}

// ── KPI ────────────────────────────────────
function renderKPI(risks){
  const t=risks.length;
  const now=new Date();
  const thisY=now.getFullYear(), thisM=now.getMonth();

  // 누적: 위반 상태인 건 / 모니터링 건
  const accViol=risks.filter(r=>r.item_state==='위반').length;
  const accMon=risks.filter(r=>r.item_state==='모니터링'||r.item_state==='위반'||r.item_state==='완료').length;
  const accRate=accMon>0?Math.round(accViol/accMon*100):0;

  // 당월
  const thisMonth=risks.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===thisY&&d.getMonth()===thisM;
  });
  const monViol=thisMonth.filter(r=>r.item_state==='위반').length;
  const monMon=thisMonth.length;
  const monRate=monMon>0?Math.round(monViol/monMon*100):0;

  // 현재 조치중/완료
  const curAct=risks.filter(r=>r.item_state==='위반').length;
  const curDone=risks.filter(r=>r.item_state==='완료').length;
  const violTotal=curAct+curDone;
  const curRate=violTotal>0?Math.round(curDone/violTotal*100):0;

  // 등급
  const 위험=risks.filter(r=>r.grade==='위험').length;
  const 주의=risks.filter(r=>r.grade==='주의').length;
  const 안전=risks.filter(r=>r.grade==='안전').length;
  const pct=v=>t>0?Math.round(v/t*100):0;

  // 누적
  set('k-acc-viol',accViol); set('k-acc-mon',accMon);
  setBar('k-acc-bar',accRate); setText('k-acc-rate',accRate+'%');
  // 당월
  set('k-mon-viol',monViol); set('k-mon-mon',monMon);
  setBar('k-mon-bar',monRate); setText('k-mon-rate',monRate+'%');
  // 현재
  set('k-cur-act',curAct); set('k-cur-done',curDone);
  setBar('k-cur-bar',curRate,'fill-green'); setText('k-cur-rate',curRate+'%');
  // 등급
  set('k-위험-n',위험); setBar('k-위험-bar',pct(위험),'fill-위험'); setText('k-위험-pct',pct(위험)+'%');
  set('k-주의-n',주의); setBar('k-주의-bar',pct(주의),'fill-주의'); setText('k-주의-pct',pct(주의)+'%');
  set('k-안전-n',안전); setBar('k-안전-bar',pct(안전),'fill-안전'); setText('k-안전-pct',pct(안전)+'%');
}
function set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setBar(id,pct,cls){
  const e=document.getElementById(id); if(!e) return;
  e.style.width=Math.min(pct,100)+'%';
}

// ── 추이 차트 ──────────────────────────────
function renderTrend(risks){
  const now=new Date();
  const months=[];
  for(let i=11;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({label:`${d.getMonth()+1}월`,y:d.getFullYear(),m:d.getMonth()});
  }
  const cnt=m=>risks.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===m.y&&d.getMonth()===m.m;
  }).length;
  const violCnt=m=>risks.filter(r=>{
    if(!r.registered_at||r.item_state!=='위반') return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===m.y&&d.getMonth()===m.m;
  }).length;
  if(tChart) tChart.destroy();
  tChart=new Chart(document.getElementById('trend-chart'),{
    type:'line',
    data:{
      labels:months.map(m=>m.label),
      datasets:[
        {label:'전체',data:months.map(m=>cnt(m)),borderColor:'#1a2744',backgroundColor:'#1a274415',fill:true,tension:0.4,pointRadius:3,borderWidth:2},
        {label:'위반',data:months.map(m=>violCnt(m)),borderColor:'#c8102e',backgroundColor:'transparent',tension:0.4,pointRadius:3,borderWidth:1.5,borderDash:[4,3]}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:10,padding:10}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:'#f1f2f5'},ticks:{font:{size:10},stepSize:1},beginAtZero:true}
      }
    }
  });
}

// ── 도넛 ───────────────────────────────────
function renderDonut(risks){
  const vals=allCats.map(c=>risks.filter(r=>r.risk_categories?.id===c.id).length);
  document.getElementById('donut-n').textContent=risks.length;
  if(dChart) dChart.destroy();
  dChart=new Chart(document.getElementById('donut-chart'),{
    type:'doughnut',
    data:{labels:allCats.map(c=>c.name),datasets:[{data:vals,backgroundColor:CAT_COLORS,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'66%',plugins:{legend:{display:false}}}
  });
  document.getElementById('donut-legend').innerHTML=allCats.map((c,i)=>`
    <div class="lg-item"><div class="lg-dot" style="background:${CAT_COLORS[i]}"></div><span>${c.name}</span><span class="lg-n">${vals[i]}</span></div>
  `).join('');
}

// ── 매트릭스 ───────────────────────────────
function renderMatrix(risks){
  const divs=activeDiv?allDiv.filter(d=>d.name===activeDiv):allDiv;
  document.getElementById('mx-head').innerHTML=
    `<tr><th class="rh">계열사</th>${allCats.map(c=>`<th>${c.name}</th>`).join('')}</tr>`;
  document.getElementById('mx-body').innerHTML=divs.map(div=>{
    const cells=allCats.map(cat=>{
      const items=risks.filter(r=>r.divisions?.id==div.id&&r.risk_categories?.id==cat.id);
      if(!items.length) return `<td><span class="cp-none">—</span></td>`;
      const h=items.filter(r=>r.grade==='위험').length;
      const m=items.filter(r=>r.grade==='주의').length;
      const l=items.filter(r=>r.grade==='안전').length;
      let cls='cp-안전',lbl=`안전 ${l}`;
      if(h){cls='cp-위험';lbl=`위험 ${h}`;}
      else if(m){cls='cp-주의';lbl=`주의 ${m}`;}
      return `<td><span class="cpill ${cls}" onclick="drillDown(${div.id},${cat.id})">${lbl}</span></td>`;
    }).join('');
    return `<tr><td>${div.name}</td>${cells}</tr>`;
  }).join('');
}

// ── 위험 목록 ──────────────────────────────
function renderHighMain(risks){
  const highs=risks.filter(r=>r.grade==='위험').slice(0,8);
  document.getElementById('high-cnt').textContent=`총 ${risks.filter(r=>r.grade==='위험').length}건`;
  const b=document.getElementById('high-body-main');
  if(!highs.length){b.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">위험 등급 없음</td></tr>';return;}
  b.innerHTML=highs.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${r.title}</td><td>${stateBadge(r.item_state)}</td>
    </tr>`).join('');
}

function renderHighDiv(risks){
  const highs=risks.filter(r=>r.grade==='위험').slice(0,8);
  const el2=document.getElementById('high-cnt2');
  if(el2) el2.textContent=`총 ${risks.filter(r=>r.grade==='위험').length}건`;
  const b=document.getElementById('high-body-div');
  if(!highs.length){b.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">위험 등급 없음</td></tr>';return;}
  b.innerHTML=highs.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.brands?.name||'-'}</td>
      <td>${r.title}</td><td>${stateBadge(r.item_state)}</td>
    </tr>`).join('');
}

// ── 브랜드 카드 ────────────────────────────
function renderBrandGrid(risks){
  const dObj=allDiv.find(d=>d.name===activeDiv);
  const brands=activeDiv?allBrands.filter(b=>b.division_id===dObj?.id):allBrands;
  // 타이틀: 전체뷰=계열사별 현황, 계열사뷰=브랜드별 현황
  document.getElementById('bg-label').textContent=activeDiv||'';
  const g=document.getElementById('brand-grid');
  let cards='';
  if(!activeDiv){
    // 전체뷰: 계열사별 집계 카드
    cards=allDiv.map(div=>{
      const items=risks.filter(r=>r.divisions?.id===div.id);
      if(!items.length) return '';
      const 위험=items.filter(r=>r.grade==='위험').length;
      const 주의=items.filter(r=>r.grade==='주의').length;
      const 안전=items.filter(r=>r.grade==='안전').length;
      const t=items.length;
      const viol=items.reduce((s,r)=>s+(r.violation_count||0),0);
      const mon=items.reduce((s,r)=>s+(r.monitoring_count||0),0);
      const rate=mon>0?Math.round(viol/mon*100):0;
      return `
        <div class="bc" onclick="setDiv('${div.name}',document.getElementById('div-${div.name}'))" style="cursor:pointer">
          <div class="bc-hd"><span class="bc-name">${div.name}</span><span class="bc-total-badge">${t}건</span></div>
          <div class="bc-stats">
            <div class="bc-stat s-위험"><span class="bc-stat-lbl">위험</span>${위험}</div>
            <div class="bc-stat s-주의"><span class="bc-stat-lbl">주의</span>${주의}</div>
            <div class="bc-stat s-안전"><span class="bc-stat-lbl">안전</span>${안전}</div>
          </div>
          <div class="bc-bar">
            ${위험?`<div class="bs-위험" style="flex:${위험}"></div>`:''}
            ${주의?`<div class="bs-주의" style="flex:${주의}"></div>`:''}
            ${안전?`<div class="bs-안전" style="flex:${안전}"></div>`:''}
          </div>
          ${mon>0?`<div class="bc-rate"><span>위반율</span><div class="rate-bar-wrap"><div class="rate-bar-fill" style="width:${rate}%;background:var(--위험-c)"></div></div><span class="rate-val" style="color:var(--위험-c)">${rate}%</span></div>`:''}
        </div>`;
    }).filter(Boolean).join('');
  } else {
    // 계열사뷰: 브랜드별 카드
    cards=brands.map(b=>{
      const items=risks.filter(r=>r.brands?.id===b.id);
      if(!items.length) return '';
      const 위험=items.filter(r=>r.grade==='위험').length;
      const 주의=items.filter(r=>r.grade==='주의').length;
      const 안전=items.filter(r=>r.grade==='안전').length;
      const t=items.length;
      const viol=items.reduce((s,r)=>s+(r.violation_count||0),0);
      const mon=items.reduce((s,r)=>s+(r.monitoring_count||0),0);
      const rate=mon>0?Math.round(viol/mon*100):0;
      return `
        <div class="bc">
          <div class="bc-hd"><span class="bc-name">${b.name}</span><span class="bc-total-badge">${t}건</span></div>
          <div class="bc-stats">
            <div class="bc-stat s-위험"><span class="bc-stat-lbl">위험</span>${위험}</div>
            <div class="bc-stat s-주의"><span class="bc-stat-lbl">주의</span>${주의}</div>
            <div class="bc-stat s-안전"><span class="bc-stat-lbl">안전</span>${안전}</div>
          </div>
          <div class="bc-bar">
            ${위험?`<div class="bs-위험" style="flex:${위험}"></div>`:''}
            ${주의?`<div class="bs-주의" style="flex:${주의}"></div>`:''}
            ${안전?`<div class="bs-안전" style="flex:${안전}"></div>`:''}
          </div>
          ${mon>0?`<div class="bc-rate"><span>위반율</span><div class="rate-bar-wrap"><div class="rate-bar-fill" style="width:${rate}%;background:var(--위험-c)"></div></div><span class="rate-val" style="color:var(--위험-c)">${rate}%</span></div>`:''}
        </div>`;
    }).filter(Boolean).join('');
  }
  g.innerHTML=cards||'<div style="color:var(--text3);font-size:12px">등록된 리스크 없음</div>';
}

// ── 모니터링 리스트 ─────────────────────────
function onLfDivChange(){
  const divId=document.getElementById('lf-div').value;
  fillSel('lf-brand',divId?allBrands.filter(b=>b.division_id==divId):allBrands,'전체 브랜드');
  lPage=1; renderList();
}
function getListRisks(){
  const div=document.getElementById('lf-div').value;
  const brand=document.getElementById('lf-brand').value;
  const cat=document.getElementById('lf-cat').value;
  const grade=document.getElementById('lf-grade').value;
  const state=document.getElementById('lf-state').value;
  return allRisks.filter(r=>{
    if(div && r.divisions?.id!=div) return false;
    if(brand && r.brands?.id!=brand) return false;
    if(cat   && r.risk_categories?.id!=cat) return false;
    if(grade && r.grade!==grade) return false;
    if(state && r.item_state!==state) return false;
    return true;
  });
}
function renderList(){
  const risks=getListRisks();
  const total=risks.length;
  const tp=Math.max(1,Math.ceil(total/PER));
  if(lPage>tp) lPage=1;
  const slice=risks.slice((lPage-1)*PER,lPage*PER);
  document.getElementById('list-label').textContent=`모니터링 리스트 (${total}건)`;
  const b=document.getElementById('list-body');
  b.innerHTML=slice.length?slice.map(r=>{
    const viol=r.violation_count??'-';
    const mon=r.monitoring_count??'-';
    const rate=(r.monitoring_count&&r.violation_count!=null)
      ?Math.round(r.violation_count/r.monitoring_count*100)+'%':'-';
    return `<tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${r.risk_categories?.name||'-'}</td><td>${r.risk_subcategories?.name||'-'}</td>
      <td>${r.title}</td>
      <td>${gradeBadge(r.grade)}</td>
      <td>${stateBadge(r.item_state)}</td>
      <td style="text-align:center">${viol}</td>
      <td style="text-align:center">${mon}</td>
      <td style="text-align:center;font-weight:700;color:var(--위험-c)">${rate}</td>
      <td class="td-clip">${r.status||'-'}</td>
      <td class="td-clip">${r.note||'-'}</td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();openEdit('${r.id}')">수정</button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="14" style="text-align:center;color:var(--text3);padding:24px;font-size:12px">조건에 맞는 데이터 없음</td></tr>';
  const pg=document.getElementById('pgn');
  pg.innerHTML=tp<=1?'':Array.from({length:tp},(_,i)=>
    `<button class="${i+1===lPage?'on':''}" onclick="lPage=${i+1};renderList()">${i+1}</button>`).join('');
}

// ── 드릴다운 ───────────────────────────────
function drillDown(divId,catId){
  showPage('list',null);
  document.getElementById('lf-div').value=divId;
  document.getElementById('lf-cat').value=catId;
  onLfDivChange();
}

// ── 페이지 전환 ─────────────────────────────
function showPage(name,btn){
  document.querySelectorAll('.mgmt-item').forEach(e=>e.classList.remove('on'));
  document.querySelectorAll('.div-item').forEach(e=>e.classList.remove('on'));
  if(btn) btn.classList.add('on');
  document.querySelectorAll('.page').forEach(e=>e.classList.remove('on'));
  document.getElementById('page-'+name).classList.add('on');
  const crumbs={'dashboard':'대시보드','list':'모니터링 리스트','input':'데이터 입력'};
  document.getElementById('page-crumb').textContent=crumbs[name]||name;
  if(name==='list') renderList();
  if(name==='input') renderRecentBody();
}

// ── 상태 선택 ──────────────────────────────
function selectState(prefix,val){
  document.getElementById(prefix+'-state').value=val;
  ['모니터링','위반','완료'].forEach(s=>{
    const el=document.getElementById(prefix+'s-'+s);
    if(!el) return;
    el.className='state-opt';
    if(s===val) el.classList.add('sel-'+s);
  });
}

// ── 데이터 입력 ─────────────────────────────
async function onPDiv(){
  const divId=document.getElementById('p-div').value;
  const brands=divId?allBrands.filter(b=>b.division_id==divId):[];
  const el=document.getElementById('p-brand');
  el.innerHTML='<option value="">선택</option>';
  brands.forEach(b=>{el.innerHTML+=`<option value="${b.id}">${b.name}</option>`;});
}
function onPCat(){
  const catId=document.getElementById('p-cat').value;
  const subs=allSubs.filter(s=>s.category_id==catId);
  const el=document.getElementById('p-sub');
  el.innerHTML='<option value="">없음</option>';
  subs.forEach(s=>{el.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
}
function resetInput(){
  ['p-div','p-brand','p-cat','p-sub','p-grade'].forEach(i=>document.getElementById(i).value='');
  ['p-title','p-status','p-note'].forEach(i=>document.getElementById(i).value='');
  ['p-viol','p-mon'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('p-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('p-brand').innerHTML='<option value="">계열사 먼저 선택</option>';
  document.getElementById('p-sub').innerHTML='<option value="">없음</option>';
  document.getElementById('p-state').value='';
  ['모니터링','위반','완료'].forEach(s=>{
    const el=document.getElementById('ps-'+s); if(el) el.className='state-opt';
  });
}
async function saveInput(){
  const divId=document.getElementById('p-div').value;
  const brandId=document.getElementById('p-brand').value;
  const catId=document.getElementById('p-cat').value;
  const subId=document.getElementById('p-sub').value;
  const grade=document.getElementById('p-grade').value;
  const state=document.getElementById('p-state').value;
  const date=document.getElementById('p-date').value;
  const title=document.getElementById('p-title').value.trim();
  const status=document.getElementById('p-status').value.trim();
  const note=document.getElementById('p-note').value.trim();
  const viol=document.getElementById('p-viol').value;
  const mon=document.getElementById('p-mon').value;
  if(!divId||!brandId||!catId||!grade||!state||!date||!title){showToast('필수 항목(*)을 모두 입력해주세요');return;}
  const btn=document.getElementById('p-save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  const {error}=await sb.from('risks').insert({
    division_id:parseInt(divId),brand_id:parseInt(brandId),category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,grade,item_state:state,registered_at:date,title,
    status:status||null,note:note||null,
    violation_count:viol?parseInt(viol):null,
    monitoring_count:mon?parseInt(mon):null
  });
  btn.textContent='저장'; btn.disabled=false;
  if(error){showToast('저장 실패: '+error.message);return;}
  showToast('등록 완료!');
  resetInput();
  await loadAll();
}
function renderRecentBody(){
  const recent=allRisks.slice(0,10);
  const b=document.getElementById('recent-body');
  if(!recent.length){b.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';return;}
  b.innerHTML=recent.map(r=>{
    const viol=r.violation_count??'-';
    const mon=r.monitoring_count??'-';
    const rate=(r.monitoring_count&&r.violation_count!=null)
      ?Math.round(r.violation_count/r.monitoring_count*100)+'%':'-';
    return `<tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${r.title}</td>
      <td>${stateBadge(r.item_state)}</td>
      <td style="text-align:center">${viol}</td>
      <td style="text-align:center">${mon}</td>
      <td style="text-align:center;font-weight:700;color:var(--위험-c)">${rate}</td>
      <td>${gradeBadge(r.grade)}</td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();openEdit('${r.id}')">수정</button></td>
    </tr>`;
  }).join('');
}

// ── 수정 모달 ──────────────────────────────
function openEdit(id){
  editId=id;
  const r=allRisks.find(x=>x.id===id); if(!r) return;
  document.getElementById('m-div').value=r.divisions?.id||'';
  onMDiv().then(()=>{document.getElementById('m-brand').value=r.brands?.id||'';});
  document.getElementById('m-cat').value=r.risk_categories?.id||'';
  onMCat();
  setTimeout(()=>{document.getElementById('m-sub').value=r.risk_subcategories?.id||'';},80);
  document.getElementById('m-grade').value=r.grade||'';
  document.getElementById('m-date').value=r.registered_at||'';
  document.getElementById('m-title').value=r.title||'';
  document.getElementById('m-status').value=r.status||'';
  document.getElementById('m-note').value=r.note||'';
  document.getElementById('m-viol').value=r.violation_count??'';
  document.getElementById('m-mon').value=r.monitoring_count??'';
  // 상태 복원
  if(r.item_state) selectState('m',r.item_state);
  else { document.getElementById('m-state').value=''; ['모니터링','위반','완료'].forEach(s=>{const el=document.getElementById('ms-'+s);if(el)el.className='state-opt';}); }
  document.getElementById('mo-ov').classList.add('open');
}
function closeModal(){document.getElementById('mo-ov').classList.remove('open');editId=null;}
function handleOvClick(e){if(e.target.id==='mo-ov') closeModal();}
async function onMDiv(){
  const divId=document.getElementById('m-div').value;
  const brands=divId?allBrands.filter(b=>b.division_id==divId):[];
  const el=document.getElementById('m-brand');
  el.innerHTML='<option value="">선택</option>';
  brands.forEach(b=>{el.innerHTML+=`<option value="${b.id}">${b.name}</option>`;});
}
function onMCat(){
  const catId=document.getElementById('m-cat').value;
  const subs=allSubs.filter(s=>s.category_id==catId);
  const el=document.getElementById('m-sub');
  el.innerHTML='<option value="">없음</option>';
  subs.forEach(s=>{el.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
}
async function saveModal(){
  const divId=document.getElementById('m-div').value;
  const brandId=document.getElementById('m-brand').value;
  const catId=document.getElementById('m-cat').value;
  const subId=document.getElementById('m-sub').value;
  const grade=document.getElementById('m-grade').value;
  const state=document.getElementById('m-state').value;
  const date=document.getElementById('m-date').value;
  const title=document.getElementById('m-title').value.trim();
  const status=document.getElementById('m-status').value.trim();
  const note=document.getElementById('m-note').value.trim();
  const viol=document.getElementById('m-viol').value;
  const mon=document.getElementById('m-mon').value;
  if(!divId||!brandId||!catId||!grade||!state||!date||!title){showToast('필수 항목(*)을 입력해주세요');return;}
  const btn=document.getElementById('save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  const {error}=await sb.from('risks').update({
    division_id:parseInt(divId),brand_id:parseInt(brandId),category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,grade,item_state:state,registered_at:date,title,
    status:status||null,note:note||null,
    violation_count:viol?parseInt(viol):null,
    monitoring_count:mon?parseInt(mon):null
  }).eq('id',editId);
  btn.textContent='저장'; btn.disabled=false;
  if(error){showToast('저장 실패: '+error.message);return;}
  showToast('수정 완료!'); closeModal(); await loadAll();
}
async function deleteRisk(){
  if(!confirm('이 항목을 삭제하시겠습니까?')) return;
  const {error}=await sb.from('risks').delete().eq('id',editId);
  if(error){showToast('삭제 실패');return;}
  showToast('삭제 완료'); closeModal(); await loadAll();
}

// ── 보고서 ─────────────────────────────────
function openReportModal(){document.getElementById('report-ov').classList.add('open');}
function closeReportModal(){document.getElementById('report-ov').classList.remove('open');}
function setFmt(f){ rptFmt=f; }
function downloadReport(){
  downloadPPT(); closeReportModal();
}

function dlBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

// ── 유틸 ───────────────────────────────────
function gradeBadge(g){if(!g)return '-';return `<span class="badge b-${g}">${g}</span>`;}
function stateBadge(s){if(!s)return '-';return `<span class="bs bs-${s}">${s}</span>`;}
function fmtD(s){if(!s)return '-';return s.slice(2).replace(/-/g,'.');}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

init();
