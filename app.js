// ── Supabase ────────────────────────────────
const SUPABASE_URL = 'https://ywceavigvleurnzzeqdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ny1yoy5La-q9Tw7jT6pstg_SV0_fb1a';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 상태 ───────────────────────────────────
let allDiv=[], allBrands=[], allCats=[], allSubs=[], allStores=[], allRisks=[];
let activeDiv='', editId=null;
let tChart=null, dChart=null;
let lPage=1; const PER=20;
let rptFmt='ppt';
let currentUser=null; // 로그인 사용자 프로필 (인증 게이트 통과 후 채워짐)
const ADMIN_EMAIL='gabeenya@gmail.com';
const CAT_COLORS=['#7a9bc1','#d99893','#d9b683','#94c4a5','#b3a4cc','#92b8d1','#c997b5','#a8aeba'];

// ── 인증 게이트 ────────────────────────────
// 미로그인/미승인 시 login.html로 보냄. 통과 시 currentUser 세팅.
async function authGate(){
  const {data:{session}} = await sb.auth.getSession();
  if(!session){ location.replace('login.html'); return false; }
  const {data:profile,error} = await sb.from('profiles')
    .select('*').eq('id',session.user.id).maybeSingle();
  if(error||!profile){
    await sb.auth.signOut();
    location.replace('login.html');
    return false;
  }
  if(!profile.approved){
    await sb.auth.signOut();
    location.replace('login.html?pending=1');
    return false;
  }
  currentUser = profile;
  // 세션 만료/로그아웃 발생 시 자동 이동
  sb.auth.onAuthStateChange((evt,sess)=>{
    if(evt==='SIGNED_OUT'||!sess) location.replace('login.html');
  });
  return true;
}

async function doLogout(){
  await sb.auth.signOut();
  location.replace('login.html');
}

// ── 사이드바 토글 (모바일) ─────────────────────────────
function toggleSidebar(){
  const sb=document.querySelector('.sb');
  const ov=document.getElementById('sb-overlay');
  const open=sb.classList.toggle('open');
  if(ov) ov.classList.toggle('on',open);
  document.body.classList.toggle('sb-open',open);
}
function closeSidebar(){
  const sb=document.querySelector('.sb');
  if(!sb||!sb.classList.contains('open')) return;
  sb.classList.remove('open');
  const ov=document.getElementById('sb-overlay'); if(ov) ov.classList.remove('on');
  document.body.classList.remove('sb-open');
}
// 사이드바 내 메뉴 클릭 시 자동 닫기 (모바일 한정)
document.addEventListener('click',(e)=>{
  if(window.innerWidth>768) return;
  if(!e.target.closest('.mgmt-item, .div-item')) return;
  closeSidebar();
});
// 창 크기 데스크탑으로 복귀 시 사이드바 상태 초기화
window.addEventListener('resize',()=>{
  if(window.innerWidth>768) closeSidebar();
});

// 사이드바 사용자 정보·관리자 메뉴 표시
function renderUserBox(){
  if(!currentUser) return;
  const nm=document.getElementById('sb-user-name'); if(nm) nm.textContent=currentUser.full_name;
  const sub=document.getElementById('sb-user-sub'); if(sub) sub.textContent=`${currentUser.division} · ${currentUser.department}`;
  const adm=document.getElementById('nav-admin');
  if(adm) adm.style.display=(currentUser.email===ADMIN_EMAIL)?'':'none';
}

// ── 초기화 ─────────────────────────────────
async function init(){
  if(!(await authGate())) return; // 미로그인/미승인은 여기서 종료
  renderUserBox();
  const now=new Date();
  document.getElementById('today-date').textContent=
    `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById('p-date').value=now.toISOString().split('T')[0];
  document.getElementById('k-month-badge').textContent=`${now.getMonth()+1}월`;
  await loadMaster();
  await loadAll();
}

async function loadMaster(){
  const [d,b,c,s,st]=await Promise.all([
    sb.from('divisions').select('*').order('sort_order'),
    sb.from('brands').select('*').order('sort_order'),
    sb.from('risk_categories').select('*').order('sort_order'),
    sb.from('risk_subcategories').select('*').order('sort_order'),
    sb.from('stores').select('*').order('sort_order').then(r=>r,()=>({data:[]})),
  ]);
  allDiv=d.data||[]; allBrands=b.data||[]; allCats=c.data||[]; allSubs=s.data||[]; allStores=st.data||[];
  fillSel('f-div',allDiv,'전체 계열사');
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
    item_state,violation_count,monitoring_count,store_id,
    divisions(id,name),brands(id,name),
    risk_categories(id,name),risk_subcategories(id,name),
    stores(id,name)
  `).order('created_at',{ascending:false}).range(0,49999);
  if(error){document.getElementById('conn-status').textContent='연결 오류';showToast('데이터 로드 실패');return;}
  allRisks=data;
  // 등급 자동 계산 (DB 저장값 대신 규칙 기반 산정)
  allRisks.forEach(r=>{ r.grade=computeGrade(r,allRisks); });
  document.getElementById('conn-status').textContent=`데이터 ${data.length}건`;
  updateSidebarBadges();
  renderDash(getFiltered());
}

// ── 등급 자동 산정 ───────────────────────────
// 규칙:
//   위험: (a) 등록 후 14일 이상 미완료  또는
//         (b) 동일 위반(브랜드+대분류+중분류)이 최근 30일 내 3건 이상  또는
//         (c) 동일 대분류의 이번달 등록 건수가 전월 대비 10% 이상 증가
//   주의: (a) 등록 후 7일 이상 미완료  또는
//         (b) 동일 위반이 최근 30일 내 2건  또는
//         (c) 동일 대분류 등록이 전월 대비 5% 이상 증가
//   안전: 위 외
function computeGrade(r,all){
  const now=new Date();
  const regDate=r.registered_at?new Date(r.registered_at):null;
  const isOpen=r.item_state!=='완료';
  // (a) 처리 지연 일수
  let delayDays=0;
  if(regDate&&isOpen) delayDays=Math.floor((now-regDate)/86400000);
  // (b) 동일 위반 반복 (최근 30일)
  const key=`${r.brands?.id}|${r.risk_categories?.id}|${r.risk_subcategories?.id||''}`;
  const ago30=new Date(now); ago30.setDate(now.getDate()-30);
  const sameRecent=all.filter(x=>{
    if(x.item_state!=='위반'&&x.item_state!=='완료') return false;
    const k=`${x.brands?.id}|${x.risk_categories?.id}|${x.risk_subcategories?.id||''}`;
    if(k!==key) return false;
    const d=x.registered_at?new Date(x.registered_at):null;
    return d&&d>=ago30;
  }).length;
  // (c) 대분류별 전월 대비 증가율 — Mock 데이터는 일제 입력으로 왜곡되므로 skip
  let growth=0;
  const isMock=r.note?.startsWith('[MOCK]');
  if(!isMock){
    const catId=r.risk_categories?.id;
    const y=now.getFullYear(), m=now.getMonth();
    const prev=new Date(y,m-1,1);
    const cntInMonth=(yr,mo)=>all.filter(x=>{
      if(x.risk_categories?.id!==catId||!x.registered_at) return false;
      const d=new Date(x.registered_at);
      return d.getFullYear()===yr&&d.getMonth()===mo;
    }).length;
    const thisCnt=cntInMonth(y,m);
    const prevCnt=cntInMonth(prev.getFullYear(),prev.getMonth());
    growth=prevCnt>0?((thisCnt-prevCnt)/prevCnt)*100:(thisCnt>0?100:0);
  }

  if(delayDays>=14||sameRecent>=3||growth>=10) return '위험';
  if(delayDays>=7 ||sameRecent>=2||growth>=5)  return '주의';
  return '안전';
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
  fillSel('f-brand',brands,'전체 브랜드/조직');
  document.getElementById('f-brand').value='';
  // 대시보드로 전환
  document.querySelectorAll('.page').forEach(e=>e.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  renderDash(getFiltered());
}

function getFiltered(){
  const div=document.getElementById('f-div')?.value;
  const brand=document.getElementById('f-brand').value;
  const cat=document.getElementById('f-cat').value;
  const grade=document.getElementById('f-grade').value;
  return allRisks.filter(r=>{
    if(activeDiv && r.divisions?.name!==activeDiv) return false;
    if(!activeDiv && div && r.divisions?.id!=div) return false;
    if(brand && r.brands?.id!=brand) return false;
    if(cat   && r.risk_categories?.id!=cat) return false;
    if(grade && r.grade!==grade) return false;
    return true;
  });
}
// 뷰별 필터 select 표시 토글
function updateFbarSelects(){
  const main=!activeDiv;
  const set=(id,show)=>{const e=document.getElementById(id);if(e)e.style.display=show?'':'none';};
  set('f-div',main);
  set('f-brand',!main);
  set('f-grade',!main);
}
function applyFilter(){renderDash(getFiltered());}

// ── 대시보드 전체 렌더 ──────────────────────
function renderDash(risks){
  // 필터바 표시 + 뷰별 select 토글
  const fbar=document.getElementById('main-fbar');
  if(fbar) fbar.style.display='';
  updateFbarSelects();
  renderAlerts(risks); renderKPI(risks); renderTrend(risks); renderDonut(risks);
  if(!activeDiv){
    // 메인뷰
    document.getElementById('section-main').style.display='';
    document.getElementById('section-div').style.display='none';
    renderDivisionCards(risks);
    renderHighMain(risks);
  } else {
    // 계열사뷰
    document.getElementById('section-main').style.display='none';
    document.getElementById('section-div').style.display='';
    renderBrandGrid(risks);
    renderHighDiv(risks);
  }
}

// ── 알림 (장기 미해결 + 이상 급증) ────────────────────────
let _alertOverdueList=[], _alertSurgeList=[], _alertOverdueDays=3;

function renderAlerts(risks){
  // (1) 장기 미해결: 등록 후 N일 경과 + 위반/모니터링 상태
  const days=parseInt(document.getElementById('alert-overdue-days')?.value||'3');
  _alertOverdueDays=days;
  const cutoff=new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-days);
  const overdue=risks.filter(r=>{
    if(!r.registered_at) return false;
    if(r.item_state!=='위반'&&r.item_state!=='모니터링') return false;
    return new Date(r.registered_at) <= cutoff;
  }).sort((a,b)=>(a.registered_at||'').localeCompare(b.registered_at||''));
  _alertOverdueList=overdue;
  const oEl=document.getElementById('alert-overdue-n');
  if(oEl) oEl.textContent=overdue.length.toLocaleString();
  const oCard=document.querySelector('.ac-overdue');
  if(oCard) oCard.classList.toggle('has-alert', overdue.length>0);

  // (2) 이상 급증: (계열사 × 대분류) 그룹별 최근 7일 위반 vs 직전 4주 주평균
  const now=new Date(); now.setHours(0,0,0,0);
  const recentStart=new Date(now); recentStart.setDate(recentStart.getDate()-7);
  const baselineStart=new Date(now); baselineStart.setDate(baselineStart.getDate()-35);
  const groups={};
  risks.forEach(r=>{
    if(r.item_state!=='위반'&&r.item_state!=='완료') return;
    if(!r.registered_at) return;
    const d=new Date(r.registered_at);
    if(d>=now) return;
    const k=`${r.divisions?.id||0}_${r.risk_categories?.id||0}`;
    if(!groups[k]) groups[k]={divId:r.divisions?.id, catId:r.risk_categories?.id, div:r.divisions?.name||'-', cat:r.risk_categories?.name||'-', recent:0, baseline:0, recentItems:[]};
    if(d>=recentStart){ groups[k].recent++; groups[k].recentItems.push(r); }
    else if(d>=baselineStart){ groups[k].baseline++; }
  });
  const surges=[];
  Object.values(groups).forEach(g=>{
    const baselineAvg=g.baseline/4;
    if(g.recent>=3 && g.recent/Math.max(baselineAvg,0.5) >= 1.5){
      g.baselineAvg=baselineAvg;
      g.pct=Math.round((g.recent/Math.max(baselineAvg,0.5)-1)*100);
      surges.push(g);
    }
  });
  surges.sort((a,b)=>b.pct-a.pct);
  _alertSurgeList=surges;
  const sEl=document.getElementById('alert-surge-n');
  if(sEl) sEl.textContent=surges.length.toLocaleString();
  const sCard=document.querySelector('.ac-surge');
  if(sCard) sCard.classList.toggle('has-alert', surges.length>0);
}

function showOverdueModal(){
  const list=_alertOverdueList;
  const days=_alertOverdueDays;
  if(!list.length){ showToast(`${days}일 이상 미해결 건이 없습니다`); return; }
  const html=`
    <div class="mo-hd">
      <div class="mo-ttl-wrap"><div class="mo-ttl-bar"></div><span class="mo-ttl">⏰ 장기 미해결 (${days}일↑)</span></div>
      <button class="mo-cls" onclick="closeAlertModal()">×</button>
    </div>
    <div class="mo-bd">
      <div style="font-size:11.5px;color:var(--text2);margin-bottom:10px">등록 후 ${days}일 이상 지났지만 아직 '완료' 처리되지 않은 항목 <b style="color:#ea580c">${list.length}건</b></div>
      <div style="overflow-x:auto">
      <table class="tbl" style="min-width:600px">
        <thead><tr><th>경과</th><th>등록일</th><th>계열사</th><th>브랜드</th><th>리스크명</th><th>상태</th><th>등급</th></tr></thead>
        <tbody>
          ${list.map(r=>{
            const elapsed=Math.floor((Date.now()-new Date(r.registered_at).getTime())/86400000);
            return `<tr onclick="closeAlertModal();openEdit('${r.id}')">
              <td style="font-weight:700;color:#ea580c;white-space:nowrap">${elapsed}일</td>
              <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
              <td>${r.divisions?.name||'-'}</td>
              <td>${r.brands?.name||'-'}</td>
              <td>${r.title||'-'}</td>
              <td>${stateBadge(r.item_state)}</td>
              <td>${gradeBadge(r.grade)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
  showAlertModal(html);
}

function showSurgeModal(){
  const list=_alertSurgeList;
  if(!list.length){ showToast('급증 영역이 없습니다'); return; }
  const html=`
    <div class="mo-hd">
      <div class="mo-ttl-wrap"><div class="mo-ttl-bar"></div><span class="mo-ttl">📈 이상 급증 영역</span></div>
      <button class="mo-cls" onclick="closeAlertModal()">×</button>
    </div>
    <div class="mo-bd">
      <div style="font-size:11.5px;color:var(--text2);margin-bottom:10px">최근 7일 위반 건수가 직전 4주 주간 평균 대비 <b style="color:#dc2626">50% 이상 증가</b>한 영역 (절대 건수 3건 이상) — <b>${list.length}건</b></div>
      <div style="overflow-x:auto">
      <table class="tbl" style="min-width:520px">
        <thead><tr><th>계열사</th><th>리스크 영역</th><th>최근 7일</th><th>평년 주평균</th><th>증감</th></tr></thead>
        <tbody>
          ${list.map(g=>`<tr>
            <td>${g.div}</td>
            <td>${g.cat}</td>
            <td style="text-align:center;font-weight:700">${g.recent}건</td>
            <td style="text-align:center;color:var(--text3)">${g.baselineAvg.toFixed(1)}건</td>
            <td style="font-weight:700;color:#dc2626">+${g.pct}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
  showAlertModal(html);
}

function showAlertModal(html){
  let ov=document.getElementById('alert-ov');
  if(!ov){
    ov=document.createElement('div');
    ov.id='alert-ov';
    ov.className='mo-ov';
    ov.onclick=(e)=>{ if(e.target.id==='alert-ov') closeAlertModal(); };
    ov.innerHTML='<div class="modal" id="alert-modal" style="width:780px"></div>';
    document.body.appendChild(ov);
  }
  document.getElementById('alert-modal').innerHTML=html;
  ov.classList.add('open');
}
function closeAlertModal(){
  const ov=document.getElementById('alert-ov');
  if(ov) ov.classList.remove('open');
}

// ── PWA 서비스 워커 등록 ─────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').catch(err=>console.log('SW 등록 실패:',err));
  });
}

// ── KPI ────────────────────────────────────
function renderKPI(risks){
  const t=risks.length;
  const now=new Date();
  const thisY=now.getFullYear(), thisM=now.getMonth();

  // 누적: 위반(위반+완료) / 모니터링(전체)
  const accViol=risks.filter(r=>r.item_state==='위반'||r.item_state==='완료').length;
  const accMon=risks.length;
  const accRate=accMon>0?Math.round(accViol/accMon*100):0;

  // 당월
  const thisMonth=risks.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===thisY&&d.getMonth()===thisM;
  });
  const monViol=thisMonth.filter(r=>r.item_state==='위반'||r.item_state==='완료').length;
  const monMon=thisMonth.length;
  const monRate=monMon>0?Math.round(monViol/monMon*100):0;

  // 현재: 조치중(=위반 건수) + 처리완료율(=완료/(위반+완료))
  const curAct=risks.filter(r=>r.item_state==='위반').length;
  const curDone=risks.filter(r=>r.item_state==='완료').length;
  const curTotal=curAct+curDone;
  const curRate=curTotal>0?Math.round(curDone/curTotal*100):0;

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
  set('k-cur-act',curAct);
  setBar('k-cur-bar',curRate); setText('k-cur-rate',curRate+'%');
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
  // 직전 달부터 12개월 (매월 sliding)
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-1+i,1);
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

// ── 위험도별 분류 ──────────────────────────
// 정렬: 등록일 내림차순(최근부터). 등급 필터 select로 좁힘.
function sortByRecent(arr){
  return [...arr].sort((a,b)=>{
    const da=a.registered_at?new Date(a.registered_at).getTime():0;
    const db=b.registered_at?new Date(b.registered_at).getTime():0;
    if(db!==da) return db-da;
    // 같은 날이면 created_at으로 tiebreak
    const ca=a.created_at?new Date(a.created_at).getTime():0;
    const cb=b.created_at?new Date(b.created_at).getTime():0;
    return cb-ca;
  });
}
function applyGradeFilter(arr,selId){
  const v=document.getElementById(selId)?.value;
  return v?arr.filter(r=>r.grade===v):arr;
}

function renderHighMain(risks){
  const list=sortByRecent(applyGradeFilter(risks,'high-grade-filter'));
  document.getElementById('high-cnt').textContent=`총 ${list.length}건`;
  const b=document.getElementById('high-body-main');
  if(!list.length){b.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';stopHighRotate();return;}
  b.innerHTML=list.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${r.title}</td><td>${gradeBadge(r.grade)}</td>
    </tr>`).join('');
  startHighRotate('high-ticker-main');
}

function renderHighDiv(risks){
  const list=sortByRecent(applyGradeFilter(risks,'high-grade-filter-div'));
  const el2=document.getElementById('high-cnt2');
  if(el2) el2.textContent=`총 ${list.length}건`;
  const b=document.getElementById('high-body-div');
  if(!list.length){b.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';stopHighRotate();return;}
  b.innerHTML=list.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.brands?.name||'-'}</td>
      <td>${r.title}</td><td>${gradeBadge(r.grade)}</td>
    </tr>`).join('');
  startHighRotate('high-ticker-div');
}

// ── 자동 순환 (메인뷰 위험도별 분류) ───────
let highRotateTimer=null;
function stopHighRotate(){
  if(highRotateTimer){clearInterval(highRotateTimer);highRotateTimer=null;}
}
function startHighRotate(wrapId){
  stopHighRotate();
  const wrap=document.getElementById(wrapId);
  if(!wrap) return;
  let pos=0;
  let paused=false;
  wrap.onmouseenter=()=>paused=true;
  wrap.onmouseleave=()=>paused=false;
  highRotateTimer=setInterval(()=>{
    if(paused) return;
    const max=wrap.scrollHeight-wrap.clientHeight;
    if(max<=4){pos=0;wrap.scrollTop=0;return;}
    pos+=0.5;
    if(pos>=max+30){pos=0;}
    wrap.scrollTop=pos;
  },40);
}

// ── 계열사 카드 (메인뷰) ──────────────────
function renderDivisionCards(risks){
  const g=document.getElementById('div-card-grid');
  if(!g) return;
  const cards=allDiv.map(div=>{
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
  g.innerHTML=cards||'<div style="color:var(--text3);font-size:12px">데이터 없음</div>';
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
  fillSel('lf-brand',divId?allBrands.filter(b=>b.division_id==divId):allBrands,'전체 브랜드/조직');
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
  document.getElementById('pgn').innerHTML=buildPagination(lPage,tp);
}

// 페이지네이션: 처음/끝 + 현재 주변 + 이전/다음
function buildPagination(cur,tp){
  if(tp<=1) return '';
  const btn=(label,page,opts={})=>{
    const cls=[opts.cls||'',page===cur?'on':''].filter(Boolean).join(' ');
    const dis=opts.disabled?' disabled':'';
    const ck=opts.disabled?'':`onclick="lPage=${page};renderList()"`;
    return `<button class="${cls}"${dis} ${ck}>${label}</button>`;
  };
  const sep=()=>`<span style="padding:0 4px;color:var(--text3);font-size:11px">…</span>`;
  const parts=[];
  parts.push(btn('‹',Math.max(1,cur-1),{disabled:cur===1,cls:'pg-nav'}));
  // 페이지 번호: 첫·끝 + 현재 주변 ±2
  const pages=new Set([1,tp,cur,cur-1,cur+1,cur-2,cur+2]);
  const list=[...pages].filter(p=>p>=1&&p<=tp).sort((a,b)=>a-b);
  let prev=0;
  for(const p of list){
    if(p-prev>1) parts.push(sep());
    parts.push(btn(p,p));
    prev=p;
  }
  parts.push(btn('›',Math.min(tp,cur+1),{disabled:cur===tp,cls:'pg-nav'}));
  return parts.join('');
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
  const crumbs={'dashboard':'대시보드','list':'모니터링 리스트','input':'데이터 입력','admin':'회원 관리','ai':'AI 분석'};
  document.getElementById('page-crumb').textContent=crumbs[name]||name;
  // 대시보드 페이지일 때만 상단 필터 표시
  const fbar=document.getElementById('main-fbar');
  if(fbar) fbar.style.display=(name==='dashboard')?'':'none';
  if(name==='dashboard') updateFbarSelects();
  if(name==='list') renderList();
  if(name==='input') renderRecentBody();
  if(name==='admin') renderAdmin();
}

// ── 회원 관리 (관리자 전용) ─────────────────
async function renderAdmin(){
  if(!currentUser || currentUser.email!==ADMIN_EMAIL){
    showToast('관리자 권한이 필요합니다'); showPage('dashboard',null); return;
  }
  const {data,error}=await sb.from('profiles').select('*').order('created_at',{ascending:false});
  if(error){ showToast('회원 목록 조회 실패: '+error.message); return; }
  const pending=data.filter(p=>!p.approved);
  const approved=data.filter(p=>p.approved);
  document.getElementById('admin-pending-cnt').textContent=`${pending.length}건`;
  document.getElementById('admin-approved-cnt').textContent=`${approved.length}건`;
  const fmt=s=>s?s.slice(0,10).replace(/-/g,'.'):'-';
  const pb=document.getElementById('admin-pending-body');
  pb.innerHTML=pending.length?pending.map(p=>`
    <tr>
      <td style="white-space:nowrap">${fmt(p.created_at)}</td>
      <td>${escapeHTML(p.full_name)}</td>
      <td>${escapeHTML(p.emp_no)}</td>
      <td>${escapeHTML(p.division)}</td>
      <td>${escapeHTML(p.department)}</td>
      <td>${escapeHTML(p.email)}</td>
      <td><button class="btn btn-red btn-sm" onclick="approveUser('${p.id}')">승인</button></td>
    </tr>`).join(''):'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px;font-size:12px">대기 중인 신청 없음</td></tr>';
  const ab=document.getElementById('admin-approved-body');
  ab.innerHTML=approved.length?approved.map(p=>{
    const isAdmin=p.email===ADMIN_EMAIL;
    return `<tr>
      <td style="white-space:nowrap">${fmt(p.created_at)}</td>
      <td>${escapeHTML(p.full_name)}${isAdmin?' <span class="badge b-위험" style="font-size:9px;padding:1px 6px">관리자</span>':''}</td>
      <td>${escapeHTML(p.emp_no)}</td>
      <td>${escapeHTML(p.division)}</td>
      <td>${escapeHTML(p.department)}</td>
      <td>${escapeHTML(p.email)}</td>
      <td>${isAdmin?'<span style="color:var(--text3);font-size:11px">-</span>':`<button class="btn btn-sm" onclick="revokeUser('${p.id}')">승인 해제</button>`}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px;font-size:12px">승인된 회원 없음</td></tr>';
}

async function approveUser(uid){
  const {error}=await sb.from('profiles').update({approved:true}).eq('id',uid);
  if(error){ showToast('승인 실패: '+error.message); return; }
  showToast('승인 완료');
  renderAdmin();
}

async function revokeUser(uid){
  if(!confirm('이 회원의 승인을 해제하시겠습니까?\n(다시 로그인하려면 재승인 필요)')) return;
  const {error}=await sb.from('profiles').update({approved:false}).eq('id',uid);
  if(error){ showToast('해제 실패: '+error.message); return; }
  showToast('승인 해제 완료');
  renderAdmin();
}

function escapeHTML(s){
  if(s==null) return '';
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── AI 분석 ─────────────────────────────────
// 분석 대상 데이터를 텍스트로 요약(토큰 효율) → Edge Function 호출 → 결과 렌더.
function buildDataSummary(divFilter){
  const base = divFilter ? allRisks.filter(r=>r.divisions?.name===divFilter) : allRisks;
  const now = new Date();
  const prevD = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevY = prevD.getFullYear(), prevM = prevD.getMonth();
  const prevMonth = base.filter(r=>{
    if(!r.registered_at) return false;
    const d = new Date(r.registered_at);
    return d.getFullYear()===prevY && d.getMonth()===prevM;
  });
  const isV = r=>r.item_state==='위반'||r.item_state==='완료';
  const accV = base.filter(isV).length;
  const monV = prevMonth.filter(isV).length;
  const done = base.filter(r=>r.item_state==='완료').length;
  const open = base.filter(r=>r.item_state==='위반').length;
  const doneRate = (done+open)>0 ? Math.round(done/(done+open)*100) : 0;
  const pct = (n,d)=>d>0?Math.round(n/d*100):0;

  const L = [];
  L.push(`[기준일] ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
  L.push(`[분석 대상] ${divFilter||'그룹 전체'}`);
  L.push('');
  L.push('[전체 KPI]');
  L.push(`- 누적 모니터링: ${base.length}건 (위반 ${accV}건, ${pct(accV,base.length)}%)`);
  L.push(`- 전월(${prevY}-${String(prevM+1).padStart(2,'0')}) 모니터링: ${prevMonth.length}건 (위반 ${monV}건, ${pct(monV,prevMonth.length)}%)`);
  L.push(`- 처리 완료율: ${doneRate}% (완료 ${done} / 위반 처리중 ${open})`);
  L.push(`- 조치중(위반 진행): ${open}건`);
  L.push('');

  // 계열사별
  if(!divFilter){
    L.push('[계열사별 (연누적) — 전체/위반]');
    allDiv.forEach(d=>{
      const it = base.filter(r=>r.divisions?.id===d.id);
      if(!it.length) return;
      const v = it.filter(isV).length;
      L.push(`- ${d.name}: ${it.length}/${v}`);
    });
    L.push('');
  }

  // 8대 리스크 카테고리
  L.push('[8대 리스크 카테고리별 (연누적) — 전체/위반]');
  allCats.forEach(c=>{
    const it = base.filter(r=>r.risk_categories?.id===c.id);
    const v = it.filter(isV).length;
    L.push(`- ${c.name}: ${it.length}/${v}`);
  });
  L.push('');

  // 카테고리 × 계열사 매트릭스 (전월 기준)
  if(!divFilter && prevMonth.length){
    L.push('[전월 카테고리 × 계열사 매트릭스 — 위반 건수]');
    const head = ['카테고리', ...allDiv.map(d=>d.name)].join(' | ');
    L.push(head);
    allCats.forEach(c=>{
      const row=[c.name];
      allDiv.forEach(d=>{
        const cell=prevMonth.filter(r=>r.risk_categories?.id===c.id && r.divisions?.id===d.id);
        row.push(String(cell.filter(isV).length));
      });
      L.push(row.join(' | '));
    });
    L.push('');
  }

  // 등급 분포
  const 위험=base.filter(r=>r.grade==='위험').length;
  const 주의=base.filter(r=>r.grade==='주의').length;
  const 안전=base.filter(r=>r.grade==='안전').length;
  L.push('[현재 등급 분포]');
  L.push(`- 위험: ${위험}건 / 주의: ${주의}건 / 안전: ${안전}건`);
  L.push('');

  // 최근 6개월 추세
  L.push('[최근 6개월 월별 추세 — 전체(위반)]');
  for(let i=5;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const y=d.getFullYear(), m=d.getMonth();
    const mn = base.filter(r=>{
      if(!r.registered_at) return false;
      const rd = new Date(r.registered_at);
      return rd.getFullYear()===y && rd.getMonth()===m;
    });
    const v = mn.filter(isV).length;
    L.push(`- ${y}-${String(m+1).padStart(2,'0')}: ${mn.length}(${v})`);
  }
  L.push('');

  // 위험 등급 항목 샘플 (최근 10건)
  const hi = base.filter(r=>r.grade==='위험')
    .sort((a,b)=>(b.registered_at||'').localeCompare(a.registered_at||''))
    .slice(0,10);
  if(hi.length){
    L.push('[위험 등급 항목 (최근 10건)]');
    hi.forEach(r=>{
      L.push(`- [${r.divisions?.name||'-'}/${r.brands?.name||'-'}] ${r.risk_categories?.name||'-'}${r.risk_subcategories?.name?'/'+r.risk_subcategories.name:''}: ${r.title} (등록 ${r.registered_at||'-'}, 상태 ${r.item_state||'-'})`);
    });
  }
  return L.join('\n');
}

async function runAIAnalysis(){
  const divFilter = document.querySelector('input[name="ai-div"]:checked')?.value || '';
  const items = Array.from(document.querySelectorAll('.ai-item:checked')).map(c=>c.value);
  if(!items.length){ showToast('분석 항목을 1개 이상 선택해주세요'); return; }

  const btn = document.getElementById('ai-run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:11px;height:11px;border:2px solid #fff5;border-top-color:#fff;border-radius:50%;animation:ai-spin .8s linear infinite;margin-right:6px;vertical-align:-1px"></span>분석 중...';
  const resEl = document.getElementById('ai-result');
  resEl.innerHTML = '<div class="ai-loading"><div class="ai-loading-spinner"></div><div>AI가 데이터를 분석하고 있습니다...<br><span style="font-size:11px;color:var(--text3)">10~30초 정도 소요</span></div></div>';
  document.getElementById('ai-meta').textContent = '';

  const dataSummary = buildDataSummary(divFilter);

  try {
    const {data:{session}} = await sb.auth.getSession();
    if(!session){
      resEl.innerHTML = '<div class="ai-err"><b>세션 만료</b> — 다시 로그인 후 시도해주세요.</div>';
      return;
    }
    const fnUrl = `${SUPABASE_URL}/functions/v1/analyze-risk`;
    const r = await fetch(fnUrl,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`,
        'apikey':SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        divisionFilter: divFilter,
        analysisItems: items,
        dataSummary
      })
    });
    if(!r.ok){
      let err='요청 실패';
      try { const e=await r.json(); err=e.error||JSON.stringify(e); } catch{}
      resEl.innerHTML = `<div class="ai-err"><b>분석 실패 (HTTP ${r.status})</b><br>${escapeHTML(err)}</div>`;
      return;
    }
    const data = await r.json();
    const md = data.analysis || '(빈 응답)';
    const html = (typeof marked!=='undefined') ? marked.parse(md) : md.replace(/\n/g,'<br>');
    resEl.innerHTML = `<div class="ai-md">${html}</div>`;
    if(data.usage){
      const tk = (data.usage.input_tokens||0) + (data.usage.output_tokens||0);
      document.getElementById('ai-meta').textContent = `토큰 ${tk.toLocaleString()} · ${data.model||''}`;
    }
  } catch(e){
    resEl.innerHTML = `<div class="ai-err"><b>호출 오류</b><br>${escapeHTML(String(e.message||e))}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:-2px"><path d="M12 2l2.39 5.07L20 8l-4 3.9.94 5.5L12 14.77 7.06 17.4 8 11.9 4 8l5.61-.93L12 2z"/></svg>AI 분석 실행';
  }
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
  const divObj=allDiv.find(d=>d.id==divId);
  const brands=divId?allBrands.filter(b=>b.division_id==divId):[];
  const el=document.getElementById('p-brand');
  el.innerHTML='<option value="">선택</option>';
  brands.forEach(b=>{el.innerHTML+=`<option value="${b.id}">${b.name}</option>`;});
  // 매장 드롭다운 (유통만)
  toggleStoreDropdown('p',divObj,divId);
}
function toggleStoreDropdown(prefix, divObj, divId){
  const wrap=document.getElementById(`${prefix}-store-wrap`);
  const sel=document.getElementById(`${prefix}-store`);
  if(!wrap||!sel) return;
  if(divObj?.name==='유통'){
    const stores=allStores.filter(s=>s.division_id==divId);
    sel.innerHTML='<option value="">선택 (선택사항)</option>'+stores.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    wrap.style.display='';
  } else {
    sel.innerHTML='<option value="">선택 (선택사항)</option>';
    sel.value='';
    wrap.style.display='none';
  }
}
function onPCat(){
  const catId=document.getElementById('p-cat').value;
  const subs=allSubs.filter(s=>s.category_id==catId);
  const el=document.getElementById('p-sub');
  el.innerHTML='<option value="">없음</option>';
  subs.forEach(s=>{el.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
}
function resetInput(){
  ['p-div','p-brand','p-cat','p-sub','p-store'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  ['p-title','p-status','p-note'].forEach(i=>document.getElementById(i).value='');
  ['p-viol','p-mon'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('p-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('p-brand').innerHTML='<option value="">계열사 먼저 선택</option>';
  document.getElementById('p-sub').innerHTML='<option value="">없음</option>';
  const psw=document.getElementById('p-store-wrap'); if(psw) psw.style.display='none';
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
  const storeId=document.getElementById('p-store')?.value;
  const state=document.getElementById('p-state').value;
  const date=document.getElementById('p-date').value;
  const title=document.getElementById('p-title').value.trim();
  const status=document.getElementById('p-status').value.trim();
  const note=document.getElementById('p-note').value.trim();
  const viol=document.getElementById('p-viol').value;
  const mon=document.getElementById('p-mon').value;
  if(!divId||!brandId||!catId||!state||!date||!title){showToast('필수 항목(*)을 모두 입력해주세요');return;}
  const btn=document.getElementById('p-save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  // grade는 자동 산정값으로 덮어씀. 저장 시 임시 '안전'으로 넣고 loadAll에서 재계산.
  const {error}=await sb.from('risks').insert({
    division_id:parseInt(divId),brand_id:parseInt(brandId),category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,
    store_id:storeId?parseInt(storeId):null,
    grade:'안전',item_state:state,registered_at:date,title,
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

// ── 일괄 업로드 (엑셀) ─────────────────────────────
let bulkPendingRows=null;

function colToLetter(n){
  let s='';
  while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); }
  return s;
}
function sanitizeName(s){
  // Excel 정의명에 사용할 수 있도록: 영문/숫자/한글/언더스코어만 남김
  return String(s).replace(/[^\w가-힣]/g,'_');
}

async function downloadBulkTemplate(){
  if(!window.ExcelJS){ showToast('엑셀 라이브러리 로딩 중. 잠시 후 다시 시도해주세요.'); return; }
  if(!allDiv.length||!allBrands.length||!allCats.length){
    showToast('기준 데이터(계열사/브랜드/대분류)가 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.'); return;
  }
  const wb=new ExcelJS.Workbook();
  wb.creator='이랜드 그룹 리스크 관리 시스템';
  wb.created=new Date();

  // 1) 입력 시트
  const ws=wb.addWorksheet('입력',{views:[{state:'frozen',ySplit:1}]});
  ws.columns=[
    {header:'등록일(YYYY-MM-DD) *',key:'date',width:22},
    {header:'계열사 *',key:'div',width:14},
    {header:'브랜드/조직 *',key:'brand',width:22},
    {header:'대분류 *',key:'cat',width:20},
    {header:'중분류',key:'sub',width:24},
    {header:'리스크명 *',key:'title',width:36},
    {header:'상태 *',key:'state',width:12}
  ];
  const hdr=ws.getRow(1);
  hdr.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
  hdr.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A2744'}};
  hdr.alignment={vertical:'middle',horizontal:'center'};
  hdr.height=26;

  // 2) 참조 시트 (숨김)
  const ref=wb.addWorksheet('_참조',{state:'hidden'});

  // A열: 계열사 목록
  ref.getCell('A1').value='__계열사__';
  allDiv.forEach((d,i)=>{ ref.getCell(`A${i+2}`).value=d.name; });
  // B열: 대분류 목록
  ref.getCell('B1').value='__대분류__';
  allCats.forEach((c,i)=>{ ref.getCell(`B${i+2}`).value=c.name; });
  // C열: 상태
  ref.getCell('C1').value='__상태__';
  ['모니터링','위반','완료'].forEach((s,i)=>{ ref.getCell(`C${i+2}`).value=s; });

  wb.definedNames.add(`_참조!$A$2:$A$${allDiv.length+1}`,'_divs');
  wb.definedNames.add(`_참조!$B$2:$B$${allCats.length+1}`,'_cats');
  wb.definedNames.add(`_참조!$C$2:$C$4`,'_states');

  // 각 계열사의 브랜드, 각 대분류의 중분류를 가로로 배치
  let col=5; // E열부터
  allDiv.forEach(div=>{
    const brands=allBrands.filter(b=>b.division_id===div.id);
    if(brands.length===0) return;
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value=div.name;
    brands.forEach((b,i)=>{ ref.getCell(`${L}${i+2}`).value=b.name; });
    wb.definedNames.add(`_참조!$${L}$2:$${L}$${brands.length+1}`,`_b_${sanitizeName(div.name)}`);
    col++;
  });
  allCats.forEach(cat=>{
    const subs=allSubs.filter(s=>s.category_id===cat.id);
    if(subs.length===0) return;
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value=cat.name;
    subs.forEach((s,i)=>{ ref.getCell(`${L}${i+2}`).value=s.name; });
    wb.definedNames.add(`_참조!$${L}$2:$${L}$${subs.length+1}`,`_s_${sanitizeName(cat.name)}`);
    col++;
  });

  // 3) 입력 시트에 데이터 검증 적용 (행 2 ~ 501)
  const ROWS=500;
  for(let r=2; r<=ROWS+1; r++){
    ws.getCell(`A${r}`).numFmt='yyyy-mm-dd';
    ws.getCell(`B${r}`).dataValidation={type:'list',allowBlank:true,formulae:['=_divs'],showErrorMessage:true,errorTitle:'잘못된 값',error:'드롭다운에서 선택하세요.'};
    ws.getCell(`C${r}`).dataValidation={type:'list',allowBlank:true,formulae:[`=INDIRECT("_b_"&SUBSTITUTE(B${r}," ","_"))`]};
    ws.getCell(`D${r}`).dataValidation={type:'list',allowBlank:true,formulae:['=_cats']};
    ws.getCell(`E${r}`).dataValidation={type:'list',allowBlank:true,formulae:[`=INDIRECT("_s_"&SUBSTITUTE(D${r}," ","_"))`]};
    ws.getCell(`G${r}`).dataValidation={type:'list',allowBlank:true,formulae:['=_states']};
  }

  // 4) 안내 시트
  const guide=wb.addWorksheet('안내');
  guide.getColumn(1).width=80;
  const lines=[
    '[일괄 업로드 사용 안내]',
    '',
    '1. \'입력\' 시트 2행부터 데이터를 입력하세요.',
    '2. 별표(*) 표시 컬럼은 필수입니다.',
    '3. 계열사 / 브랜드 / 대분류 / 중분류 / 상태는 드롭다운에서 선택하세요.',
    '4. 브랜드는 계열사를, 중분류는 대분류를 먼저 선택하면 자동 필터됩니다.',
    '5. 등록일은 YYYY-MM-DD 형식 (예: 2026-05-29).',
    '6. 등급(위험/주의/안전)은 시스템이 자동 산정합니다 — 입력하지 마세요.',
    '7. 작성 후 저장하고, \'엑셀 업로드\' 버튼으로 업로드하세요.',
    '8. 업로드 전에 검증 결과(오류 행 안내)를 확인할 수 있습니다.'
  ];
  lines.forEach((t,i)=>{ guide.getCell(`A${i+1}`).value=t; });
  guide.getCell('A1').font={bold:true,size:14,color:{argb:'FFC8102E'}};

  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const ts=new Date().toISOString().slice(0,10);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`리스크_일괄업로드_양식_${ts}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function triggerBulkUpload(){
  document.getElementById('bulk-file').click();
}

async function handleBulkUpload(ev){
  const file=ev.target.files[0];
  ev.target.value='';
  if(!file) return;
  if(!window.ExcelJS){ showToast('엑셀 라이브러리 로딩 중. 잠시 후 다시 시도해주세요.'); return; }

  const resultDiv=document.getElementById('bulk-result');
  resultDiv.innerHTML='<div style="color:var(--text2);padding:8px 0">파일 읽는 중...</div>';

  try{
    const buf=await file.arrayBuffer();
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws=wb.getWorksheet('입력')||wb.worksheets[0];
    if(!ws){ resultDiv.innerHTML='<div style="color:var(--red);padding:8px 0">시트를 찾을 수 없습니다.</div>'; return; }

    // 헤더 매핑
    const colMap={};
    ws.getRow(1).eachCell((cell,colNumber)=>{
      const t=String(cell.value||'').trim();
      if(t.startsWith('등록일')) colMap.date=colNumber;
      else if(t.startsWith('계열사')) colMap.div=colNumber;
      else if(t.startsWith('브랜드')) colMap.brand=colNumber;
      else if(t.startsWith('대분류')) colMap.cat=colNumber;
      else if(t.startsWith('중분류')) colMap.sub=colNumber;
      else if(t.startsWith('리스크명')) colMap.title=colNumber;
      else if(t.startsWith('상태')) colMap.state=colNumber;
    });
    const missing=['date','div','brand','cat','title','state'].filter(k=>!colMap[k]);
    if(missing.length){
      resultDiv.innerHTML='<div style="color:var(--red);padding:8px 0">헤더가 양식과 다릅니다. 양식을 다시 다운로드해 사용해주세요.</div>';
      return;
    }

    const rows=[];
    const errors=[];
    const lastRow=Math.min(ws.actualRowCount||1, 5001);

    for(let r=2; r<=lastRow; r++){
      const row=ws.getRow(r);
      const dateCell=row.getCell(colMap.date).value;
      const divName=String(row.getCell(colMap.div).value||'').trim();
      const brandName=String(row.getCell(colMap.brand).value||'').trim();
      const catName=String(row.getCell(colMap.cat).value||'').trim();
      const subName=colMap.sub?String(row.getCell(colMap.sub).value||'').trim():'';
      const title=String(row.getCell(colMap.title).value||'').trim();
      const state=String(row.getCell(colMap.state).value||'').trim();

      // 전부 비어있으면 skip
      if(!dateCell&&!divName&&!brandName&&!catName&&!title&&!state) continue;

      const errs=[];

      // 날짜 정규화
      let dateStr='';
      if(dateCell instanceof Date){
        const y=dateCell.getFullYear();
        const m=String(dateCell.getMonth()+1).padStart(2,'0');
        const d=String(dateCell.getDate()).padStart(2,'0');
        dateStr=`${y}-${m}-${d}`;
      } else if(dateCell){
        const m=String(dateCell).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
        if(m) dateStr=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
      }
      if(!dateStr) errs.push('등록일 누락/형식 오류');

      const divObj=allDiv.find(d=>d.name===divName);
      if(!divName) errs.push('계열사 누락');
      else if(!divObj) errs.push(`계열사 '${divName}' 없음`);

      let brandObj=null;
      if(!brandName) errs.push('브랜드 누락');
      else if(divObj){
        brandObj=allBrands.find(b=>b.division_id===divObj.id&&b.name===brandName);
        if(!brandObj) errs.push(`브랜드 '${brandName}'는 '${divName}'에 속하지 않음`);
      }

      const catObj=allCats.find(c=>c.name===catName);
      if(!catName) errs.push('대분류 누락');
      else if(!catObj) errs.push(`대분류 '${catName}' 없음`);

      let subObj=null;
      if(subName&&catObj){
        subObj=allSubs.find(s=>s.category_id===catObj.id&&s.name===subName);
        if(!subObj) errs.push(`중분류 '${subName}'는 '${catName}'에 속하지 않음`);
      }

      if(!title) errs.push('리스크명 누락');
      if(!['모니터링','위반','완료'].includes(state)) errs.push('상태는 모니터링/위반/완료 중 하나');

      if(errs.length){
        errors.push({row:r, msgs:errs});
      } else {
        rows.push({
          division_id:divObj.id, brand_id:brandObj.id, category_id:catObj.id,
          subcategory_id:subObj?subObj.id:null,
          grade:'안전', item_state:state, registered_at:dateStr, title,
          status:null, note:null, violation_count:null, monitoring_count:null
        });
      }
    }

    bulkPendingRows=rows;

    let html='';
    html+=`<div style="font-weight:700;color:var(--navy);margin-bottom:6px;font-size:12.5px">검증 결과: 총 ${rows.length+errors.length}건 중 등록 가능 <b style="color:#065f46">${rows.length}건</b>, 오류 <b style="color:var(--red)">${errors.length}건</b></div>`;
    if(errors.length>0){
      html+=`<div style="max-height:180px;overflow:auto;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;font-size:11.5px;line-height:1.6">`;
      errors.slice(0,50).forEach(e=>{
        html+=`<div><b>${e.row}행:</b> ${e.msgs.join(', ')}</div>`;
      });
      if(errors.length>50) html+=`<div style="margin-top:4px;color:var(--text2)">…외 ${errors.length-50}건</div>`;
      html+=`</div>`;
    }
    if(rows.length>0){
      html+=`<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">`;
      html+=`<button class="btn" onclick="cancelBulkUpload()">취소</button>`;
      html+=`<button class="btn btn-red" onclick="confirmBulkUpload()">유효한 ${rows.length}건 등록</button>`;
      html+=`</div>`;
    } else {
      html+=`<div style="margin-top:10px;color:var(--text2)">등록 가능한 행이 없습니다. 오류를 수정 후 다시 업로드해주세요.</div>`;
    }
    resultDiv.innerHTML=html;
  } catch(err){
    console.error(err);
    resultDiv.innerHTML=`<div style="color:var(--red);padding:8px 0">파일 처리 실패: ${err.message||err}</div>`;
  }
}

function cancelBulkUpload(){
  bulkPendingRows=null;
  document.getElementById('bulk-result').innerHTML='';
}

async function confirmBulkUpload(){
  if(!bulkPendingRows||bulkPendingRows.length===0) return;
  const rows=bulkPendingRows;
  bulkPendingRows=null;
  const resultDiv=document.getElementById('bulk-result');
  resultDiv.innerHTML=`<div style="color:var(--text2);padding:8px 0">등록 중... (${rows.length}건)</div>`;

  const CHUNK=500;
  let inserted=0;
  for(let i=0; i<rows.length; i+=CHUNK){
    const chunk=rows.slice(i,i+CHUNK);
    const {error}=await sb.from('risks').insert(chunk);
    if(error){
      resultDiv.innerHTML=`<div style="color:var(--red);padding:8px 0">등록 중 오류 (${inserted}건까지 완료): ${error.message}</div>`;
      await loadAll();
      return;
    }
    inserted+=chunk.length;
  }
  resultDiv.innerHTML=`<div style="color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:10px;border-radius:6px;font-weight:600">✓ ${inserted}건 등록 완료</div>`;
  showToast(`${inserted}건 일괄 등록 완료`);
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
  onMDiv().then(()=>{
    document.getElementById('m-brand').value=r.brands?.id||'';
    const ms=document.getElementById('m-store'); if(ms && r.store_id) ms.value=r.store_id;
  });
  document.getElementById('m-cat').value=r.risk_categories?.id||'';
  onMCat();
  setTimeout(()=>{document.getElementById('m-sub').value=r.risk_subcategories?.id||'';},80);
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
  const divObj=allDiv.find(d=>d.id==divId);
  const brands=divId?allBrands.filter(b=>b.division_id==divId):[];
  const el=document.getElementById('m-brand');
  el.innerHTML='<option value="">선택</option>';
  brands.forEach(b=>{el.innerHTML+=`<option value="${b.id}">${b.name}</option>`;});
  // 매장 드롭다운 (유통만)
  toggleStoreDropdown('m',divObj,divId);
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
  const storeId=document.getElementById('m-store')?.value;
  const state=document.getElementById('m-state').value;
  const date=document.getElementById('m-date').value;
  const title=document.getElementById('m-title').value.trim();
  const status=document.getElementById('m-status').value.trim();
  const note=document.getElementById('m-note').value.trim();
  const viol=document.getElementById('m-viol').value;
  const mon=document.getElementById('m-mon').value;
  if(!divId||!brandId||!catId||!state||!date||!title){showToast('필수 항목(*)을 입력해주세요');return;}
  const btn=document.getElementById('save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  // grade는 자동 산정. DB에는 임시 '안전' 저장 후 loadAll에서 재계산
  const {error}=await sb.from('risks').update({
    division_id:parseInt(divId),brand_id:parseInt(brandId),category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,
    store_id:storeId?parseInt(storeId):null,
    grade:'안전',item_state:state,registered_at:date,title,
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

// ── PPT 보고서 생성 ─────────────────────────
// 외식BG 양식을 그룹 전체용으로 변형:
//   1) 표지  2) 그룹 전체 KPI  3) 계열사×8대 매트릭스(연누적)
//   4) 계열사×8대 매트릭스(전월)  5)~12) 카테고리별 상세(전월)
//   13) 영역별 결과 요약 카드(전월)  14)~ 계열사별 영역 매트릭스(전월)
const RPT={
  NAVY:'1A2744', NAVY2:'243460', RED:'C8102E', RED_DARK:'9E0C24', RED_BG:'FDF0F2',
  TEXT:'111827', TEXT2:'4B5563', TEXT3:'9CA3AF',
  BORDER:'DDE1EA', BORDER2:'C8CDD9', BG:'F9FAFB', SURF:'FFFFFF',
  RISK_C:'C8102E', RISK_BG:'FEF2F2',
  WARN_C:'D97706', WARN_BG:'FFF7ED',
  SAFE_C:'065F46', SAFE_BG:'ECFDF5',
  FONT:'Malgun Gothic'
};
// '위반' = item_state ∈ {위반, 완료}
const isViol=r=>r.item_state==='위반'||r.item_state==='완료';
const cViol=arr=>arr.filter(isViol).length;
const cDone=arr=>arr.filter(r=>r.item_state==='완료').length;
const cOpen=arr=>arr.filter(r=>r.item_state==='위반').length;
const rPct =(n,d)=>d>0?Math.round(n/d*100):0;
function rptMonthFilter(arr,y,m){
  return arr.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===y&&d.getMonth()===m;
  });
}
// 셀: 숫자 없으면 '-'
const dash=v=>(v==null||v===0)?'-':v;

async function downloadPPT(){
  const PptxLib = window.PptxGenJS || window.pptxgen || (typeof PptxGenJS!=='undefined'?PptxGenJS:null);
  if(!PptxLib){showToast('PPT 라이브러리 로드 실패 — 새로고침(Ctrl+Shift+R) 후 다시 시도해주세요');return;}
  if(!allRisks.length){showToast('데이터가 없어 보고서를 만들 수 없습니다');return;}
  showToast('보고서 생성 중...');
  const divFilter=document.querySelector('input[name="r-div"]:checked')?.value||'';
  const baseRisks=divFilter?allRisks.filter(r=>r.divisions?.name===divFilter):allRisks;
  const divs=divFilter?allDiv.filter(d=>d.name===divFilter):allDiv;
  const now=new Date();
  // 전월 = 직전 달
  const prevD=new Date(now.getFullYear(),now.getMonth()-1,1);
  const pY=prevD.getFullYear(), pM=prevD.getMonth();
  const prevRisks=rptMonthFilter(baseRisks,pY,pM);
  const prevLabel=`${pY}년 ${String(pM+1).padStart(2,'0')}월 기준`;
  const todayStr=`${now.getFullYear()}. ${now.getMonth()+1}. ${now.getDate()}.`;
  const orgLabel=divFilter?`이랜드그룹 — ${divFilter}`:'이랜드그룹';

  const pptx=new PptxLib();
  pptx.layout='LAYOUT_WIDE'; // 13.33 × 7.5
  pptx.title='이랜드그룹 리스크 관리 현황';
  pptx.author='이랜드그룹 리스크 관리 시스템';

  // 공통 헤더(상단 띠 + 슬라이드 타이틀) + 푸터
  function head(slide, ttl, sub){
    slide.background={color:RPT.SURF};
    slide.addShape('rect',{x:0,y:0,w:13.33,h:0.55,fill:{color:RPT.NAVY},line:{type:'none'}});
    slide.addShape('rect',{x:0,y:0.55,w:13.33,h:0.05,fill:{color:RPT.RED},line:{type:'none'}});
    slide.addText(orgLabel,{x:0.4,y:0.07,w:8,h:0.4,fontSize:13,bold:true,color:'FFFFFF',fontFace:RPT.FONT});
    slide.addText(prevLabel,{x:5,y:0.07,w:8,h:0.4,fontSize:11,color:'FFFFFF',fontFace:RPT.FONT,align:'right'});
    slide.addText(ttl,{x:0.4,y:0.78,w:12.5,h:0.5,fontSize:22,bold:true,color:RPT.NAVY,fontFace:RPT.FONT});
    if(sub) slide.addText(sub,{x:0.4,y:1.28,w:12.5,h:0.3,fontSize:11,color:RPT.TEXT3,fontFace:RPT.FONT});
    slide.addText('Risk Monitoring & Analytics Report',{x:0.4,y:7.15,w:6,h:0.3,fontSize:8,color:RPT.TEXT3,fontFace:RPT.FONT,italic:true});
    slide.addText(`기준일 ${todayStr}`,{x:7.33,y:7.15,w:5.6,h:0.3,fontSize:8,color:RPT.TEXT3,fontFace:RPT.FONT,align:'right'});
  }

  // ── 슬라이드 1: 표지 ───────────────────────
  const s1=pptx.addSlide();
  s1.background={color:RPT.NAVY};
  s1.addShape('rect',{x:0,y:5.4,w:13.33,h:0.08,fill:{color:RPT.RED},line:{type:'none'}});
  s1.addText(orgLabel,{x:0.8,y:1.6,w:11.7,h:0.8,fontSize:36,bold:true,color:'FFFFFF',fontFace:RPT.FONT});
  s1.addText(`${pM+1}월 리스크 관리 현황`,{x:0.8,y:2.8,w:11.7,h:0.9,fontSize:50,bold:true,color:'FFFFFF',fontFace:RPT.FONT});
  s1.addText('Risk Monitoring & Analytics Report',{x:0.8,y:4.6,w:11.7,h:0.5,fontSize:18,color:'D9DBE5',italic:true,fontFace:RPT.FONT});
  s1.addText(`기준일 ${todayStr}   |   이랜드그룹 리스크 관리 시스템`,{x:0.8,y:5.7,w:11.7,h:0.5,fontSize:13,color:'B6BACA',fontFace:RPT.FONT});

  // ── 슬라이드 2: 그룹 전체 KPI ─────────────────
  const s2=pptx.addSlide(); head(s2,`${divFilter||'그룹'} 전체 리스크 현황`,prevLabel);
  // 누적
  const accAll=baseRisks.length, accV=cViol(baseRisks), accRate=rPct(accV,accAll);
  // 전월
  const monAll=prevRisks.length, monV=cViol(prevRisks), monRate=rPct(monV,monAll);
  // 처리 완료율 / 조치중 (누적 기준)
  const done=cDone(baseRisks), open=cOpen(baseRisks);
  const doneTotal=done+open;
  const doneRate=rPct(done,doneTotal);

  // KPI 카드 4개 — 가로 1열
  const kpis=[
    {ttl:'누적 모니터링', big:`${accAll}건`, sub:`위반 ${accV}건 (${accRate}%)`, c:RPT.NAVY},
    {ttl:'전월 모니터링', big:`${monAll}건`, sub:`위반 ${monV}건 (${monRate}%)`, c:RPT.NAVY2},
    {ttl:'처리 완료율',   big:`${doneRate}%`, sub:`완료 ${done} / 위반 ${doneTotal}건`, c:RPT.SAFE_C},
    {ttl:'조치중',        big:`${open}건`,    sub:'위반(처리중) 상태',                   c:RPT.RISK_C}
  ];
  const cardY=1.9, cardH=4.4, gap=0.2, cardW=(13.33-0.8-gap*3)/4;
  kpis.forEach((k,i)=>{
    const x=0.4+i*(cardW+gap);
    s2.addShape('roundRect',{x,y:cardY,w:cardW,h:cardH,fill:{color:RPT.SURF},line:{color:RPT.BORDER,width:0.75},rectRadius:0.08});
    s2.addShape('rect',{x:x,y:cardY,w:0.12,h:cardH,fill:{color:k.c},line:{type:'none'}});
    s2.addText(k.ttl,{x:x+0.35,y:cardY+0.3,w:cardW-0.5,h:0.4,fontSize:11,bold:true,color:RPT.TEXT2,fontFace:RPT.FONT});
    s2.addText(k.big,{x:x+0.35,y:cardY+1.2,w:cardW-0.5,h:1.2,fontSize:36,bold:true,color:k.c,fontFace:RPT.FONT});
    s2.addText(k.sub,{x:x+0.35,y:cardY+3.0,w:cardW-0.5,h:0.6,fontSize:11,color:RPT.TEXT2,fontFace:RPT.FONT});
  });

  // ── 매트릭스 슬라이드 빌더 (계열사 × 8대 리스크) ─
  function addMatrixSlide(title, srcRisks){
    const sl=pptx.addSlide(); head(sl,title,prevLabel);
    const rows=[];
    // 헤더 1단: 계열사 + 각 카테고리(전체|위반 병합) + 합계
    const h1=[{text:'계열사',options:{rowspan:2,bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:9}}];
    allCats.forEach(c=>{ h1.push({text:c.name,options:{colspan:2,bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:9}}); });
    h1.push({text:'합계',options:{colspan:2,bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',valign:'middle',fontSize:9}});
    rows.push(h1);
    // 헤더 2단: 전체 / 위반
    const h2=[];
    for(let i=0;i<allCats.length;i++){
      h2.push({text:'전체',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:8}});
      h2.push({text:'위반',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:8}});
    }
    h2.push({text:'전체',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:8}});
    h2.push({text:'위반',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:8}});
    rows.push(h2);
    // 데이터 행: 계열사별
    divs.forEach((dv,di)=>{
      const items=srcRisks.filter(r=>r.divisions?.id===dv.id);
      const r=[{text:dv.name,options:{bold:true,color:RPT.TEXT,fill:di%2?RPT.BG:RPT.SURF,align:'center',valign:'middle',fontSize:8}}];
      let sumA=0, sumV=0;
      allCats.forEach(c=>{
        const cell=items.filter(x=>x.risk_categories?.id===c.id);
        const a=cell.length, v=cViol(cell);
        sumA+=a; sumV+=v;
        r.push({text:String(dash(a)),options:{color:RPT.TEXT,fill:di%2?RPT.BG:RPT.SURF,align:'center',fontSize:8}});
        r.push({text:String(dash(v)),options:{color:v?RPT.RISK_C:RPT.TEXT3,bold:!!v,fill:di%2?RPT.BG:RPT.SURF,align:'center',fontSize:8}});
      });
      r.push({text:String(dash(sumA)),options:{bold:true,color:RPT.TEXT,fill:RPT.BG,align:'center',fontSize:8}});
      r.push({text:String(dash(sumV)),options:{bold:true,color:sumV?RPT.RISK_C:RPT.TEXT3,fill:RPT.BG,align:'center',fontSize:8}});
      rows.push(r);
    });
    // 합계 행
    const totA=srcRisks.length, totV=cViol(srcRisks);
    const totRow=[{text:'합계',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:9}}];
    allCats.forEach(c=>{
      const cell=srcRisks.filter(x=>x.risk_categories?.id===c.id);
      const a=cell.length, v=cViol(cell);
      totRow.push({text:String(dash(a)),options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:8}});
      totRow.push({text:String(dash(v)),options:{bold:true,color:v?'FFE4E8':'D9DBE5',fill:RPT.NAVY,align:'center',fontSize:8}});
    });
    totRow.push({text:String(dash(totA)),options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:9}});
    totRow.push({text:String(dash(totV)),options:{bold:true,color:totV?'FFE4E8':'D9DBE5',fill:RPT.NAVY2,align:'center',fontSize:9}});
    rows.push(totRow);

    const nCol=1+allCats.length*2+2;
    const tblW=12.53;
    const firstW=1.05;
    const totW=1.4; // 합계 2칸 합
    const rest=tblW-firstW-totW;
    const dataW=rest/(allCats.length*2);
    const colW=[firstW];
    for(let i=0;i<allCats.length*2;i++) colW.push(dataW);
    colW.push(totW/2); colW.push(totW/2);
    sl.addTable(rows,{
      x:0.4,y:1.7,w:tblW,colW,
      border:{type:'solid',pt:0.5,color:RPT.BORDER},
      rowH:0.32, fontFace:RPT.FONT
    });
  }
  // ── 슬라이드 3: 계열사 순위 ─────────────────
  // 위반(=위반+완료) 건수 적은 순(위) → 많은 순(아래)
  const divRanks = divs.map(dv=>{
    const items=baseRisks.filter(r=>r.divisions?.id===dv.id);
    const total=items.length, viol=cViol(items);
    return {name:dv.name, total, viol, rate:rPct(viol,total)};
  }).sort((a,b)=>a.viol-b.viol || a.total-b.total);

  const s3=pptx.addSlide(); head(s3,'계열사 순위','위반+완료 건수 적은 순 → 많은 순');
  const rankHdr=[
    {text:'순위',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:11}},
    {text:'계열사',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:11}},
    {text:'위반 건수',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:11}},
    {text:'전체 모니터링',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:11}},
    {text:'위반율',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:11}}
  ];
  const rankRows=[rankHdr];
  divRanks.forEach((d,i)=>{
    const fill=i%2?RPT.BG:RPT.SURF;
    rankRows.push([
      {text:`${i+1}`, options:{bold:true,color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:11}},
      {text:d.name,  options:{bold:true,color:RPT.TEXT, fill,align:'center',valign:'middle',fontSize:12}},
      {text:`${d.viol}`,  options:{bold:true,color:d.viol?RPT.RISK_C:RPT.TEXT3,fill,align:'center',valign:'middle',fontSize:13}},
      {text:`${d.total}`, options:{color:RPT.TEXT, fill,align:'center',valign:'middle',fontSize:11}},
      {text:`${d.rate}%`, options:{color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:11}}
    ]);
  });
  s3.addTable(rankRows,{
    x:2.0, y:1.85, w:9.33, colW:[1.0, 2.4, 2.0, 2.0, 1.93],
    border:{type:'solid',pt:0.5,color:RPT.BORDER},
    rowH:0.5, fontFace:RPT.FONT
  });

  // ── 슬라이드 4: 계열사별 브랜드 순위 ─────────────────
  // 계열사별 컬럼 (가로 배치), 각 컬럼 안에 브랜드 순위
  const s4=pptx.addSlide(); head(s4,'계열사별 브랜드 순위','위반+완료 건수 적은 순(위) → 많은 순(아래)');
  const cols=divs;
  const slideW=13.33, margin=0.35, gap=0.12;
  const colW = (slideW - margin*2 - gap*(cols.length-1)) / cols.length;
  const startY=1.85;
  cols.forEach((dv,ci)=>{
    const x = margin + ci*(colW+gap);
    // 컬럼 헤더 = 계열사명
    const hdrRow=[[
      {text:dv.name,options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:11}}
    ],[
      {text:'순위 · 브랜드',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'left',valign:'middle',fontSize:9}}
    ]];
    s4.addTable(hdrRow,{x,y:startY,w:colW,colW:[colW],rowH:0.4,border:{type:'solid',pt:0.5,color:RPT.BORDER},fontFace:RPT.FONT});

    // 브랜드 데이터
    const brandData = allBrands.filter(b=>b.division_id===dv.id).map(b=>{
      const items=baseRisks.filter(r=>r.brands?.id===b.id);
      return {name:b.name, viol:cViol(items), total:items.length};
    }).sort((a,b)=>a.viol-b.viol || a.total-b.total);

    if(brandData.length===0){
      s4.addText('(브랜드 없음)',{x,y:startY+0.8,w:colW,h:0.35,fontSize:9,color:RPT.TEXT3,fontFace:RPT.FONT,align:'center',italic:true});
      return;
    }

    const brandRows = brandData.map((bd,bi)=>{
      const fill=bi%2?RPT.BG:RPT.SURF;
      return [
        {text:`${bi+1}`,  options:{bold:true,color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:9}},
        {text:bd.name,    options:{color:RPT.TEXT, fill,align:'left',valign:'middle',fontSize:9}},
        {text:`${bd.viol}`, options:{bold:true,color:bd.viol?RPT.RISK_C:RPT.TEXT3,fill,align:'center',valign:'middle',fontSize:10}}
      ];
    });
    const innerColW=[colW*0.18, colW*0.52, colW*0.30];
    s4.addTable(brandRows,{x,y:startY+0.8,w:colW,colW:innerColW,rowH:0.34,border:{type:'solid',pt:0.4,color:RPT.BORDER},fontFace:RPT.FONT});
  });

  addMatrixSlide('계열사별 현황 (연누적)', baseRisks);
  addMatrixSlide('계열사별 현황 (전월)',  prevRisks);

  // ── 슬라이드 5~12: 8대 카테고리 상세 (전월) ─
  function addCatDetailSlide(cat){
    const sl=pptx.addSlide(); head(sl, `${cat.name} 모니터링 상세 현황`, `${prevLabel} (전월)`);
    const items=prevRisks.filter(r=>r.risk_categories?.id===cat.id);
    const subs=allSubs.filter(s=>s.category_id===cat.id);
    // 컬럼: 세부항목 + 각 계열사(전체|위반) + 소계(전체|위반)
    const colDivs=divs;
    const rows=[];
    const h1=[{text:'세부 항목',options:{rowspan:2,bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:9}}];
    colDivs.forEach(d=>{ h1.push({text:d.name,options:{colspan:2,bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:9}}); });
    h1.push({text:'소계',options:{colspan:2,bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',valign:'middle',fontSize:9}});
    rows.push(h1);
    const h2=[];
    for(let i=0;i<colDivs.length;i++){
      h2.push({text:'전체',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:8}});
      h2.push({text:'위반',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:8}});
    }
    h2.push({text:'전체',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:8}});
    h2.push({text:'위반',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:8}});
    rows.push(h2);
    // 중분류 행 (없으면 '데이터 없음' 한 줄)
    if(!subs.length && !items.length){
      const span=1+colDivs.length*2+2;
      rows.push([{text:'위반 데이터 없음',options:{colspan:span,color:RPT.TEXT3,align:'center',fontSize:10,italic:true,fill:RPT.BG}}]);
    } else {
      // 중분류 미지정 항목도 포함하기 위해 [null, ...subs] 흐름
      const rowKeys=subs.length?subs:[{id:null,name:'(중분류 미지정)'}];
      rowKeys.forEach((sb,ri)=>{
        const r=[{text:sb.name,options:{color:RPT.TEXT,fill:ri%2?RPT.BG:RPT.SURF,align:'left',valign:'middle',fontSize:8}}];
        let sa=0,sv=0;
        colDivs.forEach(dv=>{
          const cell=items.filter(x=>x.divisions?.id===dv.id && (sb.id?x.risk_subcategories?.id===sb.id:!x.risk_subcategories?.id));
          const a=cell.length, v=cViol(cell);
          sa+=a; sv+=v;
          r.push({text:String(dash(a)),options:{color:RPT.TEXT,fill:ri%2?RPT.BG:RPT.SURF,align:'center',fontSize:8}});
          r.push({text:String(dash(v)),options:{color:v?RPT.RISK_C:RPT.TEXT3,bold:!!v,fill:ri%2?RPT.BG:RPT.SURF,align:'center',fontSize:8}});
        });
        r.push({text:String(dash(sa)),options:{bold:true,color:RPT.TEXT,fill:RPT.BG,align:'center',fontSize:8}});
        r.push({text:String(dash(sv)),options:{bold:true,color:sv?RPT.RISK_C:RPT.TEXT3,fill:RPT.BG,align:'center',fontSize:8}});
        rows.push(r);
      });
      // 합계 행
      const tRow=[{text:'합계',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:9}}];
      let ta=0, tv=0;
      colDivs.forEach(dv=>{
        const cell=items.filter(x=>x.divisions?.id===dv.id);
        const a=cell.length, v=cViol(cell);
        ta+=a; tv+=v;
        tRow.push({text:String(dash(a)),options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:8}});
        tRow.push({text:String(dash(v)),options:{bold:true,color:v?'FFE4E8':'D9DBE5',fill:RPT.NAVY,align:'center',fontSize:8}});
      });
      tRow.push({text:String(dash(ta)),options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:9}});
      tRow.push({text:String(dash(tv)),options:{bold:true,color:tv?'FFE4E8':'D9DBE5',fill:RPT.NAVY2,align:'center',fontSize:9}});
      rows.push(tRow);
    }
    const tblW=12.53;
    const firstW=2.2;
    const totW=1.2;
    const rest=tblW-firstW-totW;
    const dataW=rest/(colDivs.length*2);
    const colW=[firstW];
    for(let i=0;i<colDivs.length*2;i++) colW.push(dataW);
    colW.push(totW/2); colW.push(totW/2);
    sl.addTable(rows,{x:0.4,y:1.7,w:tblW,colW,border:{type:'solid',pt:0.5,color:RPT.BORDER},rowH:0.34,fontFace:RPT.FONT});
  }
  allCats.forEach(addCatDetailSlide);

  // ── 슬라이드 13: 영역별 결과 요약 (8개 카드, 전월) ─
  const s13=pptx.addSlide(); head(s13, '영역별 모니터링 결과 요약', `${prevLabel} (전월)`);
  // 4열 × 2행 = 8개
  const sumX0=0.4, sumY0=1.85, sumGapX=0.18, sumGapY=0.22;
  const sumW=(12.53-sumGapX*3)/4, sumH=(5.15-sumGapY)/2;
  allCats.slice(0,8).forEach((cat,idx)=>{
    const r=Math.floor(idx/4), c=idx%4;
    const x=sumX0+c*(sumW+sumGapX), y=sumY0+r*(sumH+sumGapY);
    const items=prevRisks.filter(x=>x.risk_categories?.id===cat.id);
    const a=items.length, v=cViol(items);
    const d=cDone(items), o=cOpen(items);
    const dr=rPct(d,d+o);
    const noData=v===0;
    s13.addShape('roundRect',{x,y,w:sumW,h:sumH,fill:{color:RPT.SURF},line:{color:RPT.BORDER,width:0.75},rectRadius:0.06});
    s13.addShape('rect',{x:x,y:y,w:0.1,h:sumH,fill:{color:noData?RPT.TEXT3:RPT.RED},line:{type:'none'}});
    s13.addText(cat.name,{x:x+0.25,y:y+0.18,w:sumW-0.4,h:0.35,fontSize:13,bold:true,color:RPT.NAVY,fontFace:RPT.FONT});
    if(noData){
      s13.addText('위반 데이터 없음',{x:x+0.25,y:y+0.65,w:sumW-0.4,h:0.3,fontSize:9,color:RPT.TEXT3,fontFace:RPT.FONT,italic:true});
    }
    // 4 라인: 전체 / 위반 / 완료율 / 조치중
    const lines=[
      {l:'전체 모니터링', v:`${a}건`,                c:RPT.TEXT},
      {l:'위반 건수',     v:`${v}건${a?` (${rPct(v,a)}%)`:''}`, c:v?RPT.RISK_C:RPT.TEXT3, b:!!v},
      {l:'처리 완료율',   v:`${dr}%`,                c:RPT.SAFE_C, b:dr>0},
      {l:'조치중',        v:`${o}건`,                c:o?RPT.RISK_C:RPT.TEXT3, b:!!o}
    ];
    lines.forEach((ln,li)=>{
      const ly=y+0.95+li*0.4;
      s13.addText(ln.l,{x:x+0.25,y:ly,w:(sumW-0.4)*0.55,h:0.32,fontSize:9,color:RPT.TEXT2,fontFace:RPT.FONT});
      s13.addText(ln.v,{x:x+0.25+(sumW-0.4)*0.55,y:ly,w:(sumW-0.4)*0.45,h:0.32,fontSize:11,bold:ln.b!==false,color:ln.c,fontFace:RPT.FONT,align:'right'});
    });
  });

  // ── 슬라이드 14~: 계열사별 영역 매트릭스 (전월) ─
  divs.forEach(dv=>{
    const sl=pptx.addSlide(); head(sl, `${dv.name} 영역별 모니터링 현황`, `${prevLabel} (전월)`);
    const items=prevRisks.filter(r=>r.divisions?.id===dv.id);
    const a=items.length, v=cViol(items);
    const d=cDone(items), o=cOpen(items);
    const dr=rPct(d,d+o);

    // 상단 KPI 4개
    const kY=1.75, kH=1.1, kGap=0.15, kW=(12.53-kGap*3)/4;
    const cards=[
      {ttl:'전월 모니터링', big:`${a}건`,             sub:`위반 ${v}건${a?` (${rPct(v,a)}%)`:''}`, c:RPT.NAVY},
      {ttl:'위반 건수',     big:`${v}건`,             sub:`전체 대비 ${a?rPct(v,a):0}%`,           c:RPT.RISK_C},
      {ttl:'처리 완료율',   big:`${dr}%`,             sub:`완료 ${d} / 위반 ${d+o}건`,             c:RPT.SAFE_C},
      {ttl:'조치중',        big:`${o}건`,             sub:'위반(처리중) 상태',                      c:RPT.RISK_C}
    ];
    cards.forEach((k,i)=>{
      const x=0.4+i*(kW+kGap);
      sl.addShape('roundRect',{x,y:kY,w:kW,h:kH,fill:{color:RPT.SURF},line:{color:RPT.BORDER,width:0.75},rectRadius:0.06});
      sl.addShape('rect',{x:x,y:kY,w:0.08,h:kH,fill:{color:k.c},line:{type:'none'}});
      sl.addText(k.ttl,{x:x+0.2,y:kY+0.1,w:kW-0.3,h:0.3,fontSize:9,bold:true,color:RPT.TEXT2,fontFace:RPT.FONT});
      sl.addText(k.big,{x:x+0.2,y:kY+0.4,w:kW-0.3,h:0.5,fontSize:20,bold:true,color:k.c,fontFace:RPT.FONT});
      sl.addText(k.sub,{x:x+0.2,y:kY+0.78,w:kW-0.3,h:0.28,fontSize:9,color:RPT.TEXT2,fontFace:RPT.FONT});
    });

    // 영역별 표 (카테고리 × 전체/위반)
    const rows=[[
      {text:'영역',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:10}},
      {text:'전체',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:10}},
      {text:'위반',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:10}}
    ]];
    let sa=0, sv=0;
    allCats.forEach((c,ri)=>{
      const cell=items.filter(x=>x.risk_categories?.id===c.id);
      const ca=cell.length, cv=cViol(cell);
      sa+=ca; sv+=cv;
      rows.push([
        {text:c.name,options:{color:RPT.TEXT,fill:ri%2?RPT.BG:RPT.SURF,align:'left',fontSize:10}},
        {text:String(dash(ca)),options:{color:RPT.TEXT,fill:ri%2?RPT.BG:RPT.SURF,align:'center',fontSize:10}},
        {text:String(dash(cv)),options:{color:cv?RPT.RISK_C:RPT.TEXT3,bold:!!cv,fill:ri%2?RPT.BG:RPT.SURF,align:'center',fontSize:10}}
      ]);
    });
    rows.push([
      {text:'합계',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:10}},
      {text:String(dash(sa)),options:{bold:true,color:'FFFFFF',fill:RPT.NAVY2,align:'center',fontSize:10}},
      {text:String(dash(sv)),options:{bold:true,color:sv?'FFE4E8':'D9DBE5',fill:RPT.NAVY2,align:'center',fontSize:10}}
    ]);
    sl.addTable(rows,{x:0.4,y:3.1,w:12.53,colW:[7.5,2.5,2.53],border:{type:'solid',pt:0.5,color:RPT.BORDER},rowH:0.32,fontFace:RPT.FONT});
  });

  const ym=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
  const fname=`이랜드그룹_리스크관리현황_${divFilter?divFilter+'_':''}${ym}.pptx`;
  await pptx.writeFile({fileName:fname});
  showToast('보고서 다운로드 완료');
}

function dlBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

// ── Mock 데이터 도구 (검토용) ───────────────
// 식별: note 시작이 '[MOCK]' → 삭제 시 이 prefix로 일괄 삭제
const MOCK_TAG='[MOCK]';
const MOCK_TITLES=[
  '고객 클레임 처리 지연','부정 리뷰 다발','위생 점검 미흡','계약서 누락',
  '인허가 갱신 지연','회계 보고 누락','광고 표시 위반','개인정보 유출 의심',
  '재고 불일치','협력사 부정','임직원 분쟁','매장 안전사고',
  '환경 규정 위반','지적재산 침해','품질 결함','노무 분쟁',
  '세무 조사 대응','자금 횡령 의심','부정 청탁 신고','계약 분쟁'
];
const MOCK_STATUS=['모니터링 진행 중','시정 요청 발송','조치 완료','법무팀 검토','외부 자문 의뢰'];
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function pickWeighted(items){
  // items = [[value, weight], ...]
  const total=items.reduce((s,x)=>s+x[1],0);
  let r=Math.random()*total;
  for(const [v,w] of items){ if((r-=w)<=0) return v; }
  return items[items.length-1][0];
}

async function generateMockData(){
  if(!allDiv.length||!allBrands.length||!allCats.length){
    showToast('마스터 데이터(계열사/브랜드/대분류)가 비어있어요');return;
  }
  if(!confirm('987건의 Mock 데이터를 생성합니다. 계속하시겠어요?')) return;
  const btn=document.getElementById('mock-gen-btn');
  const status=document.getElementById('mock-status');
  btn.disabled=true; btn.textContent='생성 중...';
  const TARGET=987;
  const now=new Date();

  // 계열사별 가중치 (최소 10% 보장)
  const DIV_WEIGHTS={'패션':28,'유통':22,'외식':18,'파크':12,'건설':10,'소법인':10};
  const divWeights=allDiv.map(d=>[d, DIV_WEIGHTS[d.name]||15]);
  // 대분류별 가중치 (앞쪽이 많고 뒤로 갈수록 작아짐, 최소 5)
  const catWeights=allCats.map((c,i)=>[c, Math.max(5, 30 - i*3)]);
  // 등급 목표 분포: 안전 ≫ 주의 ≫ 위험
  const gradeWeights=[['안전',62],['주의',25],['위험',13]];

  const batch=[];
  for(let i=0;i<TARGET;i++){
    const div=pickWeighted(divWeights);
    const divBrands=allBrands.filter(b=>b.division_id===div.id);
    if(!divBrands.length) continue;
    const brand=pick(divBrands);
    const cat=pickWeighted(catWeights);
    const catSubs=allSubs.filter(s=>s.category_id===cat.id);
    const sub=catSubs.length?pick(catSubs):null;

    // 등급 목표를 먼저 정한 뒤, 그에 맞는 등록일/상태 조합
    const gradeTarget=pickWeighted(gradeWeights);
    let daysAgo, state;
    if(gradeTarget==='안전'){
      daysAgo=Math.floor(Math.random()*7);       // 0~6일
      state=pickWeighted([['모니터링',35],['위반',20],['완료',45]]);
    } else if(gradeTarget==='주의'){
      daysAgo=7+Math.floor(Math.random()*7);     // 7~13일
      state=pickWeighted([['모니터링',60],['위반',40]]);
    } else { // 위험
      daysAgo=14+Math.floor(Math.random()*90);   // 14~103일
      state=pickWeighted([['모니터링',70],['위반',30]]);
    }
    const regDate=new Date(now); regDate.setDate(now.getDate()-daysAgo);

    // 모니터링/위반 카운트
    const monCnt=Math.floor(Math.random()*120)+5;
    const violCnt=state==='완료'?Math.floor(monCnt*Math.random()*0.6)
                  :state==='위반'?Math.floor(monCnt*Math.random()*0.4)
                  :Math.floor(monCnt*Math.random()*0.15);

    batch.push({
      division_id:div.id,brand_id:brand.id,category_id:cat.id,
      subcategory_id:sub?.id||null,
      grade:'안전', // loadAll에서 자동 재계산
      item_state:state,
      registered_at:regDate.toISOString().split('T')[0],
      title:`${cat.name} - ${pick(MOCK_TITLES)} #${i+1}`,
      status:pick(MOCK_STATUS),
      note:`${MOCK_TAG} 임의 생성 데이터`,
      violation_count:violCnt,
      monitoring_count:monCnt
    });
  }
  // 배치 insert
  const CHUNK=500;
  let inserted=0;
  for(let i=0;i<batch.length;i+=CHUNK){
    const chunk=batch.slice(i,i+CHUNK);
    const {error}=await sb.from('risks').insert(chunk);
    if(error){
      showToast('생성 중 오류: '+error.message);
      btn.disabled=false; btn.textContent='987건 생성';
      await loadAll();
      return;
    }
    inserted+=chunk.length;
    status.textContent=`생성 중... ${inserted}/${TARGET}`;
  }
  btn.disabled=false; btn.textContent='1,254건 생성';
  status.textContent=`note 시작이 ${MOCK_TAG}인 데이터만 다룸`;
  showToast(`Mock 데이터 ${TARGET}건 생성 완료!`);
  await loadAll();
}

async function deleteMockData(){
  if(!confirm(`Mock 데이터(note 시작이 ${MOCK_TAG}인 모든 항목)를 삭제합니다. 계속?`)) return;
  const btn=document.getElementById('mock-del-btn');
  btn.disabled=true; btn.textContent='삭제 중...';
  const {error}=await sb.from('risks').delete().like('note',`${MOCK_TAG}%`);
  btn.disabled=false; btn.textContent='Mock 데이터 모두 삭제';
  if(error){showToast('삭제 실패: '+error.message);return;}
  showToast('Mock 데이터 삭제 완료');
  await loadAll();
}

// ── 유틸 ───────────────────────────────────
function gradeBadge(g){if(!g)return '-';return `<span class="badge b-${g}">${g}</span>`;}
function stateBadge(s){if(!s)return '-';return `<span class="bs bs-${s}">${s}</span>`;}
function fmtD(s){if(!s)return '-';return s.slice(2).replace(/-/g,'.');}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

init();
