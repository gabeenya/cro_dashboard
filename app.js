// ── Supabase ────────────────────────────────
const SUPABASE_URL = 'https://ywceavigvleurnzzeqdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ny1yoy5La-q9Tw7jT6pstg_SV0_fb1a';
// 보안: 세션을 sessionStorage에 저장 → 창(탭)을 닫으면 로그인 소멸. 새로고침은 유지됨.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
});

// ── 상태 ───────────────────────────────────
let allDiv=[], allBrands=[], allCats=[], allSubs=[], allStores=[], allRisks=[];
let activeDiv='', editId=null;
let currentPage='dashboard'; // 현재 보고 있는 페이지(붉은 글씨 클릭 시 이 페이지를 새로고침)
let tChart=null, dChart=null;
// 대시보드 월 스냅샷: null=현재(라이브). {y,m}=그 달 시점으로 화면 재구성.
let viewMonth=null;
let snapshotRisks=null; // viewMonth 기준으로 잘라내고 등급을 재계산한 데이터(라이브면 allRisks)
let lPage=1; const PER=20;
let rptFmt='ppt';
let currentUser=null; // 로그인 사용자 프로필 (인증 게이트 통과 후 채워짐)
const ADMIN_EMAIL='gabeenya@gmail.com';
const CAT_COLORS=['#7a9bc1','#d99893','#d9b683','#94c4a5','#b3a4cc','#92b8d1','#c997b5','#a8aeba'];

// ── 영역별 상태 설정 ────────────────────────────
const CAT_STATE_CONFIG={
  '부실채권':{states:['발생','해결']},
  '감사'    :{states:['적발','조치완료']},
  '중대재해':{states:['발생','조치완료']}
};
// 위반(처리중)에 대응하는 상태값
const VIOL_STATES=['위반','발생','적발'];
// 완료에 대응하는 상태값
const DONE_STATES=['완료','해결','조치완료'];
function getCatStates(catName){
  const n=(catName||'').trim();
  const key=Object.keys(CAT_STATE_CONFIG).find(k=>k===n);
  return key?CAT_STATE_CONFIG[key].states:['모니터링','위반','완료'];
}
function isViolState(s){ return VIOL_STATES.includes(s); }
function isDoneState(s){ return DONE_STATES.includes(s); }
// 상태 → CSS 클래스 기반(배지·버튼 색 공유)
function stateClass(s){
  if(isViolState(s)) return '위반';
  if(isDoneState(s)) return '완료';
  return '모니터링';
}
// 상태 버튼 동적 렌더 (wrap id: ${prefix}-state-wrap)
function renderStateButtons(prefix, catName, currentState=''){
  const wrap=document.getElementById(prefix+'-state-wrap');
  if(!wrap) return;
  const states=getCatStates(catName);
  wrap.innerHTML=states.map(s=>`<button type="button" class="state-opt${currentState===s?' sel-'+stateClass(s):''}" id="${prefix}s-${s}" onclick="selectState('${prefix}','${s}')">${s}</button>`).join('');
}
// 감사 전용 필드 표시/숨김
function toggleAuditFields(prefix, catName){
  const isAudit=catName==='감사';
  document.querySelectorAll('.audit-field-'+prefix).forEach(el=>el.classList.toggle('hidden-fg',!isAudit));
}
// 부실채권 금액 필드 표시/숨김 (미입금/부실채권 선택 시에만)
const AMOUNT_REQUIRED_TYPES=['미입금','부실채권'];
function toggleAmountField(prefix, catName, violationType){
  const needAmount=catName==='부실채권' && AMOUNT_REQUIRED_TYPES.includes(violationType);
  document.querySelectorAll('.amount-field-'+prefix).forEach(el=>el.classList.toggle('hidden-fg',!needAmount));
}

// ── 위반유형 목록 (영역 대분류 이름과 매핑) ────────────────
const VIOLATION_TYPES = {
  '불법파견': ['피드백 표준 양식 미사용','현장대리인 외 소통','도급범위 초과 업무','채용공고문 노출','고용 미승계 확약서 미징구','자재·소모품 지급','손해배상청구','물량 단가 지급','임차료 수령','근로시간 통제','작업방식 관리','복리후생 간섭','작업환경 결정'],
  '공정거래': [
    {group:'하도급', items:['계약서','대금지급지연','위탁취소','기술자료제공 요구','클레임','납품대금연동제']},
    {group:'표시광고', items:['거짓표시·광고','허위·과장 표시·광고','뒷광고']},
    {group:'가맹', items:['예상매출액 임의산정','필수품목 임의 변경','차액가맹금 임의 수취','불이익 변경 등 기타 불공정 거래 행위','광고 판촉행사 임의 진행','부당 계약해지']},
    {group:'대리점', items:['계약서','계약기간 중 수수료 인하','구매강제 (사입 및 판촉)','비용전가 (물류비 등)','목표매출강요']},
    {group:'대규모유통', items:['계약서','대금지급지연','판촉사원 파견 강요','판촉행사 강요·비용전가','MD 개편 강요·비용전가','기타 불이익 제공·강요']}
  ],
  '영업비밀': ['문서등급 설정 기준 위반','영업비밀 관리 체계 미준수','사고반출(암호해제)','사고반출(웹)','사고반출(메신저)','사고반출(AI)','인수인계서 미징구','포렌식 적발'],
  '부실채권': ['미입금','부실채권'],
  '감사': ['직괴/성희롱','근태조작/위반','영업비밀유출','거래처부실&부정','회사자산손실','재고부실&부정','매출부정/성과왜곡','상품권/포인트','품질관리부실','채권관리손실','기타규정위반'],
  '중대재해': ['산업재해 발생','중대재해 발생'],
  '재고': ['로스율','관리율']
};
function buildViolationTypeOptions(catName, currentVal=''){
  const n=(catName||'').trim();
  const key=Object.keys(VIOLATION_TYPES).find(k=>k.toLowerCase()===n.toLowerCase());
  const items=key?VIOLATION_TYPES[key]:null;
  let html='<option value="">선택 안 함</option>';
  if(items){
    if(typeof items[0]==='string'){
      items.forEach(v=>{html+=`<option value="${escapeHTML(v)}"${v===currentVal?' selected':''}>${escapeHTML(v)}</option>`;});
    } else {
      items.forEach(g=>{
        html+=`<optgroup label="${escapeHTML(g.group)}">`;
        g.items.forEach(v=>{html+=`<option value="${escapeHTML(v)}"${v===currentVal?' selected':''}>${escapeHTML(v)}</option>`;});
        html+='</optgroup>';
      });
    }
  }
  return html;
}
function fillViolationTypeSel(prefix, catName, currentVal=''){
  const el=document.getElementById(prefix+'-violation-type');
  if(el) el.innerHTML=buildViolationTypeOptions(catName, currentVal);
}
// 위반유형을 평탄한 목록으로 반환 (엑셀 검증 등, 그룹 구분 없이)
function flatViolationTypes(catName){
  const n=(catName||'').trim();
  const key=Object.keys(VIOLATION_TYPES).find(k=>k.toLowerCase()===n.toLowerCase());
  const items=key?VIOLATION_TYPES[key]:null;
  if(!items) return [];
  return typeof items[0]==='string' ? items : items.flatMap(g=>g.items);
}

// ── 건수 집계 헬퍼 ──────────────────────────
// 모든 '건수'는 데이터 입력에서 적은 건수를 기준으로 집계한다(행 1개=1건이 아니라 입력 건수만큼).
// 저장 방식: 모니터링이면 monitoring_count에, 위반/완료면 violation_count에 입력 건수가 들어감(둘 중 하나만).
// 과거에 건수를 안 적은 데이터(둘 다 null)는 1건으로 간주.
function rowCnt(r){
  const m=r.monitoring_count, v=r.violation_count;
  if(m==null && v==null) return 1;
  // 영업비밀의 '모니터링' 건수 중 외식BG 연동분(source_id 있음)만 1/10 비율로 반영(위반/완료는 그대로, 직접 입력분은 그대로).
  const isSyncedTradeSecret = r.risk_categories?.name==='영업비밀' && r.source_id;
  // 패션 법인의 IP·공정거래 '모니터링' 건수는 1/100 비율로 반영(위반/완료는 그대로).
  const isFashionScaled = r.divisions?.name==='패션' && (r.risk_categories?.name==='IP' || r.risk_categories?.name==='공정거래');
  let mEff = m||0;
  if(isSyncedTradeSecret) mEff = Math.round(mEff/10);
  else if(isFashionScaled) mEff = Math.round(mEff/100);
  return mEff+(v||0);
}
// 위반 건수: 위반계열(위반/발생/적발) 또는 완료계열(완료/해결/조치완료)일 때만 반영
function rowViol(r){
  if(!isViolState(r.item_state) && !isDoneState(r.item_state)) return 0;
  return r.violation_count==null ? 1 : r.violation_count;
}
const sumCnt =arr=>arr.reduce((s,r)=>s+rowCnt(r),0);   // 전체(모니터링) 건수 합
const sumViol=arr=>arr.reduce((s,r)=>s+rowViol(r),0);  // 위반 건수 합
// 비율(%) 계산: 반올림 때문에 99.x%가 100%로 보이지 않도록, 분자==분모(진짜 100%)가 아니면 99%를 상한으로 둔다.
function pctRate(num,den){
  if(den<=0) return 0;
  const r=Math.round(num/den*100);
  return (r>=100 && num<den) ? 99 : r;
}
// 반올림 없이 소수점까지 그대로 보여주는 비율(내림 처리라 실제 값보다 커 보이는 일이 없음)
// 분모가 아주 큰 경우(예: 모니터링 5만건대) 기본 소수 1자리로는 0.0%로 뭉개질 수 있어,
// 실제 값이 0보다 크면 자리수를 최대 4자리까지 늘려 진짜 값이 보이게 한다.
function pctRateExact(num,den,decimals=1){
  if(den<=0) return '0';
  if(num>=den) return (100).toFixed(decimals);
  const raw=num/den*100;
  let d=decimals;
  while(num>0 && d<4 && Math.floor(raw*Math.pow(10,d))===0) d++;
  const factor=Math.pow(10,d);
  const truncated=Math.floor(raw*factor)/factor;
  return truncated.toFixed(d);
}

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
  document.documentElement.style.visibility = 'visible';
  // 세션 만료/로그아웃 발생 시 자동 이동
  sb.auth.onAuthStateChange((evt,sess)=>{
    if(evt==='SIGNED_OUT'||!sess) location.replace('login.html');
  });
  return true;
}

async function doLogout(){
  clearSessionTimers();
  sessionStorage.removeItem('cro_loginAt');
  await sb.auth.signOut();
  location.replace('login.html');
}

// ── 세션 자동 만료 (보안) ───────────────────
// 정책: 창(탭)을 닫으면 sessionStorage가 비워져 로그인 소멸.
//      로그인 후 3시간이 지나면 같은 창에서도 자동 로그아웃(만료 5분 전 경고 팝업).
const SESSION_MAX_MS  = 3 * 60 * 60 * 1000; // 최대 유지 3시간
const SESSION_WARN_MS = 5 * 60 * 1000;      // 만료 5분 전 경고
let _sessTimers = [], _sessCountdown = null;

function clearSessionTimers(){
  _sessTimers.forEach(t=>clearTimeout(t)); _sessTimers=[];
  if(_sessCountdown){ clearInterval(_sessCountdown); _sessCountdown=null; }
}

function startSessionTimers(){
  clearSessionTimers();
  let loginAt = +sessionStorage.getItem('cro_loginAt');
  if(!loginAt){ loginAt = Date.now(); sessionStorage.setItem('cro_loginAt', String(loginAt)); }
  const expireAt = loginAt + SESSION_MAX_MS;
  const remaining = expireAt - Date.now();
  if(remaining <= 0){ sessionTimeoutLogout(); return; }
  // 만료 시각에 자동 로그아웃
  _sessTimers.push(setTimeout(sessionTimeoutLogout, remaining));
  // 만료 전 경고 팝업
  const warnIn = remaining - SESSION_WARN_MS;
  if(warnIn <= 0) showSessionWarning(expireAt);
  else _sessTimers.push(setTimeout(()=>showSessionWarning(expireAt), warnIn));
}

async function sessionTimeoutLogout(){
  clearSessionTimers();
  sessionStorage.removeItem('cro_loginAt');
  await sb.auth.signOut();
  location.replace('login.html?expired=1');
}

function showSessionWarning(expireAt){
  if(document.getElementById('sess-warn-ov')) return; // 중복 방지
  const ov=document.createElement('div');
  ov.id='sess-warn-ov';
  ov.className='mo-ov open';
  ov.style.zIndex='9999';
  ov.innerHTML=`
    <div class="modal" style="width:360px;text-align:center">
      <div class="mo-bd" style="padding:28px 24px">
        <div style="font-size:34px;margin-bottom:10px">⏰</div>
        <div style="font-size:16px;font-weight:800;color:var(--navy);margin-bottom:8px">곧 자동 로그아웃됩니다</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6">
          보안을 위해 로그인 후 3시간이 지나면 자동으로 로그아웃됩니다.<br>
          남은 시간 <span id="sess-warn-cd" style="font-weight:800;color:var(--red)">5:00</span>
        </div>
      </div>
      <div class="mo-ft" style="justify-content:center">
        <button class="btn btn-sm" onclick="dismissSessionWarning()">확인</button>
        <button class="btn btn-red btn-sm" onclick="extendSession()">시간 연장</button>
        <button class="btn btn-sm" onclick="doLogout()">지금 로그아웃</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const cd=document.getElementById('sess-warn-cd');
  const tick=()=>{
    const ms=expireAt-Date.now();
    if(ms<=0){ if(_sessCountdown){clearInterval(_sessCountdown);_sessCountdown=null;} sessionTimeoutLogout(); return; }
    const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000);
    if(cd) cd.textContent=`${m}:${String(s).padStart(2,'0')}`;
  };
  tick();
  _sessCountdown=setInterval(tick,1000);
}

// 팝업만 닫음 — 만료 시각이 되면 그대로 자동 로그아웃됨
function dismissSessionWarning(){
  const ov=document.getElementById('sess-warn-ov'); if(ov) ov.remove();
  if(_sessCountdown){ clearInterval(_sessCountdown); _sessCountdown=null; }
}
// 로그인 시각을 지금으로 다시 찍어 3시간 타이머를 처음부터 재시작(경고 팝업에서 '시간 연장' 클릭 시)
function extendSession(){
  sessionStorage.setItem('cro_loginAt', String(Date.now()));
  dismissSessionWarning();
  startSessionTimers();
  showToast('로그인 시간이 연장되었습니다');
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
  startSessionTimers();           // 3시간 자동 만료 타이머 가동
  renderUserBox();
  const now=new Date();
  document.getElementById('today-date').textContent=
    `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  document.getElementById('p-date').value=now.toISOString().split('T')[0];
  document.getElementById('k-month-badge').textContent=`${now.getMonth()+1}월`;
  await loadMaster();
  await loadAll();
  await loadAreaNotes();
  refreshAreaNotesViews();
  subscribeRealtime();   // 실시간 자동 갱신 시작
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
  fillSel('grade-view-scope',allDiv,'전체 (계열사별)');
  fillSel('f-cat',allCats,'전체 영역 대분류');
  fillSel('lf-cat',allCats,'전체 영역 대분류');
  ['m-div','p-div'].forEach(id=>{
    allDiv.forEach(x=>{document.getElementById(id).innerHTML+=`<option value="${x.id}">${x.name}</option>`;});
  });
  ['m-cat','p-cat'].forEach(id=>{
    allCats.forEach(x=>{document.getElementById(id).innerHTML+=`<option value="${x.id}">${x.name}</option>`;});
  });
  // 영역별 특이사항 입력 폼의 브랜드 드롭다운 (계열사명 함께 표시)
  const brandOptions=visibleBrands(allBrands).map(b=>{
    const dv=allDiv.find(d=>d.id===b.division_id);
    return {id:b.id, name: dv?`${dv.name} - ${b.name}`:b.name};
  });
  fillSel('an-brand',brandOptions,'선택');
  fillSel('an-category',allCats,'선택 안 함');
}

// '유통'의 브랜드 목록에서 '기타'는 어디서도 노출하지 않음(다른 계열사의 '기타'는 그대로 둠)
function visibleBrands(list){
  const distId=allDiv.find(d=>d.name==='유통')?.id;
  return list.filter(b=>!(b.division_id===distId && b.name==='기타'));
}
// 유통 매장명 앞의 소속 접두사(뉴코아/NC/2001/팩토리)는 화면에 표시하지 않음
function storeDisplayName(name){
  return (name||'').replace(/^(뉴코아|NC|2001|팩토리)\s+/, '');
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
    item_state,violation_count,monitoring_count,store_id,violation_type,
    discipline_type,discipline_name,sentence,amount,external_exposure,source_id,
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
  fillMonthFilter();
  fillGradeRefMonth();
  buildSnapshot();
  renderCurrentPage();
}

// 새로고침(loadAll) 후 "지금 보고 있는 페이지"를 다시 그린다.
// 예전엔 항상 대시보드만 그려서, 리스트/입력 화면에선 새로고침해도 수정이 즉시 안 보였음.
function renderCurrentPage(){
  if(currentPage==='list') renderList();
  else if(currentPage==='input') renderRecentBody();
  else if(currentPage==='admin') renderAdmin();
  else renderDash(getFiltered()); // dashboard 및 기타
}

// ── 실시간 자동 갱신 ───────────────────────────
// risks 테이블이 바뀌면(다른 사이트 연동으로 들어온 것 포함) 화면을 자동으로 다시 그린다.
// 짧은 시간에 여러 건이 몰려도 0.8초 모아서 한 번만 새로고침한다.
let realtimeTimer=null;
function subscribeRealtime(){
  sb.channel('risks-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'risks'},()=>{
      clearTimeout(realtimeTimer);
      realtimeTimer=setTimeout(()=>{ loadAll(); showToast('새 데이터가 반영되었습니다'); },800);
    })
    .subscribe();
}

// ── 월 스냅샷 ───────────────────────────────
// viewMonth가 설정되면 "그 달 말일" 시점을 기준(now)으로 삼아
//   ① 그 달까지 등록된 데이터만 추리고  ② 등급을 그 시점 규칙으로 다시 계산한다.
// 라이브(현재)일 때는 이미 loadAll에서 계산된 allRisks를 그대로 쓴다.
function refNow(){
  if(!viewMonth) return new Date();
  return new Date(viewMonth.y, viewMonth.m+1, 0, 23,59,59,999); // 선택 월 마지막 순간
}
function buildSnapshot(){
  if(!viewMonth){ snapshotRisks=allRisks; return; }
  const cutoff=refNow();
  // 등급을 덮어쓰므로 원본을 건드리지 않도록 얕은 복사본으로 작업
  const subset=allRisks
    .filter(r=>r.registered_at && new Date(r.registered_at)<=cutoff)
    .map(r=>({...r}));
  subset.forEach(r=>{ r.grade=computeGrade(r,subset,cutoff); });
  snapshotRisks=subset;
}
// 선택 가능한 월 목록: 현재 달 → 데이터가 있는 가장 오래된 달까지 내림차순
function monthOptionsRange(){
  const now=new Date();
  let earliest=new Date(now.getFullYear(), now.getMonth(), 1);
  allRisks.forEach(r=>{
    if(!r.registered_at) return;
    const d=new Date(r.registered_at);
    if(isNaN(d)) return;
    const fd=new Date(d.getFullYear(), d.getMonth(), 1);
    if(fd<earliest) earliest=fd;
  });
  const out=[];
  let cur=new Date(now.getFullYear(), now.getMonth(), 1);
  while(cur>=earliest){
    out.push({y:cur.getFullYear(), m:cur.getMonth()});
    cur=new Date(cur.getFullYear(), cur.getMonth()-1, 1);
  }
  return out;
}
// 대시보드 상단 월 필터 채우기 (첫 옵션 = 현재/라이브)
function fillMonthFilter(){
  const el=document.getElementById('f-month'); if(!el) return;
  const prev=el.value;
  const opts=['<option value="">현재(이번달)</option>'];
  monthOptionsRange().forEach(o=>{
    opts.push(`<option value="${o.y}-${o.m}">${o.y}.${String(o.m+1).padStart(2,'0')}월</option>`);
  });
  el.innerHTML=opts.join('');
  el.value=prev; // 다시 로드돼도 선택 유지
}
// 월 필터 변경 → 스냅샷 다시 만들고 대시보드 갱신
function onMonthFilterChange(){
  const v=document.getElementById('f-month')?.value||'';
  if(v){ const [y,m]=v.split('-').map(Number); viewMonth={y,m}; }
  else viewMonth=null;
  buildSnapshot();
  renderDash(getFiltered());
}

// ── 등급 자동 산정(A/B/C/D) ───────────────────────────
// 등급은 '법인 × 영역 대분류' 단위로 계산되어 같은 그룹의 모든 건이 동일한 등급을 갖는다.
// 집계 기간: gradePeriodMode가 '당월'이면 그 달 1일~기준일, '연누적'(기본)이면 그 해 1/1~기준일.
// 감사·재고는 등급 산정 대상에서 제외(null → gradeBadge에서 '-' 표시).
let gradePeriodMode='연누적'; // '연누적' | '당월'
let gradeRefMonth=null; // null=이번달 | {y,m} — 측정판 기준월 드롭다운에서 선택
const GRADE_CAT5=['중대재해','불법파견','공정거래','영업비밀','IP'];   // 위반(위반+완료) 건수 기준
const GRADE_COMPLIANCE=['불법파견','공정거래','영업비밀','IP'];       // "컴플라이언스 분류" — 외부노출 1건 이상이면 F
const GRADE_EXCLUDE=['감사','재고'];                                 // 등급 산정 제외
const BAD_DEBT_AMOUNT_LIMIT=100000000; // 부실채권 D등급 금액 기준(1억, 초과가 아니라 이하일 때 D)
// 대시보드 상단 f-cat(영역 대분류) 필터에서 선택된 영역을 반환(없으면 null).
// 값이 있으면 대시보드가 "영역뷰" 레이아웃(도넛→위반유형별 전환 등)으로 바뀐다.
// '감사'도 포함해서 반환한다 — 감사만의 추가 처리(측정판/특이사항/상단KPI 숨김)는
// 호출부에서 cat.name==='감사' 여부로 별도 분기한다(renderKPI/renderMatrix/renderDash 참조).
function getAreaViewCategory(){
  const v=document.getElementById('f-cat')?.value;
  if(!v) return null;
  return allCats.find(c=>c.id==v) || null;
}
function gradeTier(cnt){
  if(cnt<=3) return 'A';
  if(cnt<=6) return 'B';
  if(cnt<=9) return 'C';
  return 'D';
}
// 측정판 기준월: 드롭다운에서 고른 달의 말일, 안 골랐으면 지금
function getGradeCutoff(){
  if(!gradeRefMonth) return refNow();
  return new Date(gradeRefMonth.y, gradeRefMonth.m+1, 0, 23,59,59,999);
}
// 집계 기간 윈도우: gradePeriodMode에 따라 연누적(그 해 1/1~기준일) 또는 당월(그 달 1일~기준일)
// (2026-07-27) 예전엔 1~2월을 "테스트성 소량 입력"으로 보고 연누적/월평균 계산에서 제외했으나
// (DATA_START=2026-03-01 클램프), 상단 KPI 카드의 "누적"(기간 제한 없음)과 집계 기준이 달라
// 같은 "연누적"이라는 말인데 숫자가 다르게 보이는 혼란이 있어 제거함 — 이제 항상 1/1부터.
function gradeWindow(cutoff=getGradeCutoff()){
  const start = gradePeriodMode==='당월'
    ? new Date(cutoff.getFullYear(),cutoff.getMonth(),1)
    : new Date(cutoff.getFullYear(),0,1);
  return {start,cutoff};
}
// start~cutoff가 몇 개월에 걸치는지(둘 다 같은 달이면 1). 연누적 등급을 "월평균" 기준으로 매길 때 나눗셈에 사용.
function monthsSpan(start,cutoff){
  return (cutoff.getFullYear()-start.getFullYear())*12 + (cutoff.getMonth()-start.getMonth()) + 1;
}
// 카테고리명 + 해당 건수 집합 + 집계 개월수로 등급(A~D) 계산 — division/brand 등 어떤 단위로 묶든 재사용 가능
// 연누적 기간이 길어질수록 총 건수만으로 매기면 연말로 갈수록 등급이 무조건 나빠지므로,
// months로 나눈 "월평균 건수"를 기준으로 매긴다(당월 모드는 months=1이라 기존과 동일).
function calcCategoryGrade(catName, group, months=1){
  if(GRADE_EXCLUDE.includes(catName)) return null;
  if(catName==='부실채권'){
    // '부실채권' 금액이 1억 초과인 건이 하나라도 있으면 F, 1억 이하면 D
    const hasOverLimit=group.some(x=>x.violation_type==='부실채권' && (x.amount??0)>BAD_DEBT_AMOUNT_LIMIT);
    if(hasOverLimit) return 'F';
    const hasBigD=group.some(x=>x.violation_type==='부실채권' && (x.amount??0)<=BAD_DEBT_AMOUNT_LIMIT);
    if(hasBigD) return 'D';
    return gradeTier(sumCnt(group)/months); // 발생+해결 전체 건수의 월평균
  }
  if(catName==='중대재해'){
    // '중대재해 발생'(산업재해 발생보다 심각한 쪽) 1건 이상이면 F
    const hasMajor=group.some(x=>x.violation_type==='중대재해 발생');
    if(hasMajor) return 'F';
    return gradeTier(sumViol(group)/months);
  }
  if(GRADE_COMPLIANCE.includes(catName)){
    // 컴플라이언스 분류(불법파견/공정거래/영업비밀/IP): 외부노출 1건 이상이면 F
    const hasExternal=group.some(x=>x.external_exposure===true);
    if(hasExternal) return 'F';
    return gradeTier(sumViol(group)/months);
  }
  return null;
}
function computeGrade(r,all,cutoff=getGradeCutoff()){
  const catName=(r.risk_categories?.name||'').trim();
  const divId=r.divisions?.id, catId=r.risk_categories?.id;
  const {start}=gradeWindow(cutoff);
  const group=all.filter(x=>{
    if(x.divisions?.id!==divId || x.risk_categories?.id!==catId) return false;
    if(!x.registered_at) return false;
    const d=new Date(x.registered_at);
    return d>=start && d<=cutoff;
  });
  return calcCategoryGrade(catName, group, monthsSpan(start,cutoff));
}
// 등급 집계 기간(연누적/당월) 토글 변경 시 전체 재계산 후 다시 그림
function recomputeGrades(){
  allRisks.forEach(r=>{ r.grade=computeGrade(r,allRisks); });
  buildSnapshot();
  renderCurrentPage();
}

// ── 사이드바 배지 ───────────────────────────
function updateSidebarBadges(){
  ['패션','유통','외식','파크','건설','쥬얼리'].forEach(name=>{
    const cnt=sumCnt(allRisks.filter(r=>r.divisions?.name===name));
    const el=document.getElementById('db-'+name);
    if(el) el.textContent=cnt;
  });
}

// ── 탭/필터 ────────────────────────────────
// 로고 클릭 — 지금까지 걸려있던 모든 필터/스냅샷/측정판 설정을 초기화하고
// "로그인 직후와 동일한 첫 화면"(메인뷰, 전계열사, 전영역)으로 이동.
function goHome(){
  // f-div: 메인뷰 상단 필터바의 "계열사" 드롭다운(사이드바 클릭과 별개로 activeDiv=null인 채
  // 특정 계열사만 걸러보는 용도) — 이것도 초기화 안 하면 로고를 눌러도 그 계열사만 계속 보임.
  ['f-div','f-cat','f-sub','f-grade','f-month'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  viewMonth=null;
  gradeRefMonth=null; gradePeriodMode='연누적';
  const gRefSel=document.getElementById('grade-ref-month'); if(gRefSel) gRefSel.value='';
  const gModeSel=document.getElementById('grade-period-mode'); if(gModeSel) gModeSel.value='연누적';
  const gScopeSel=document.getElementById('grade-view-scope'); if(gScopeSel) gScopeSel.value='';
  buildSnapshot();
  setDiv('');
}
function setDiv(name,el){
  activeDiv=name;
  currentPage='dashboard';
  // 사이드바 on 상태
  document.querySelectorAll('.mgmt-item,.div-item').forEach(e=>e.classList.remove('on'));
  if(el) el.classList.add('on');
  if(!name){ document.getElementById('nav-all').classList.add('on'); }
  document.getElementById('page-crumb').textContent=name||'전사 8대 리스크 관리 현황';
  // 브랜드 필터 갱신
  const dObj=allDiv.find(d=>d.name===name);
  const brands=visibleBrands(name?allBrands.filter(b=>b.division_id===dObj?.id):allBrands);
  fillSel('f-brand',brands,'전체 브랜드/조직');
  document.getElementById('f-brand').value='';
  // 측정판의 계열사/브랜드 전환 드롭다운: 계열사뷰로 들어가면 그 계열사의 브랜드 기준으로, 전사뷰면 전체(계열사별)로
  const scopeSel=document.getElementById('grade-view-scope');
  if(scopeSel) scopeSel.value=name?(dObj?.id||''):'';
  // 대시보드로 전환
  document.querySelectorAll('.page').forEach(e=>e.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  renderDash(getFiltered());
}

// 헤더의 빨간 글씨(현재 화면 이름) 클릭 → 지금 보고 있는 페이지를 그대로 새로고침.
// 다른 페이지나 임의의 계열사뷰로 넘어가지 않고, 현재 화면만 다시 그린다.
function goViewHome(){
  if(currentPage==='dashboard'){
    // 대시보드: 현재 보고 있던 계열사(또는 전사) 대시보드를 다시 그림
    const el = activeDiv ? document.getElementById('div-'+activeDiv)
                         : document.getElementById('nav-all');
    const fbar=document.getElementById('main-fbar'); if(fbar) fbar.style.display='';
    setDiv(activeDiv, el);
  }else{
    // 리스트/입력/AI/회원관리 등: 같은 페이지를 다시 렌더링(사이드바 강조 유지)
    const btn=[...document.querySelectorAll('.mgmt-item')]
      .find(b=>(b.getAttribute('onclick')||'').includes("showPage('"+currentPage+"'"));
    showPage(currentPage, btn);
  }
  window.scrollTo(0,0);
}

function getFiltered(){
  const div=document.getElementById('f-div')?.value;
  const brand=document.getElementById('f-brand').value;
  const cat=document.getElementById('f-cat').value;
  const sub=document.getElementById('f-sub')?.value;
  const grade=document.getElementById('f-grade').value;
  // 매장 필터: 유통 + 리테일일 때만 적용
  const brandObj=allBrands.find(b=>b.id==brand);
  const storeApplies = activeDiv==='유통' && brandObj?.name==='리테일';
  const store = storeApplies ? document.getElementById('f-store')?.value : '';
  return (snapshotRisks||allRisks).filter(r=>{
    if(activeDiv && r.divisions?.name!==activeDiv) return false;
    if(!activeDiv && div && r.divisions?.id!=div) return false;
    if(brand && r.brands?.id!=brand) return false;
    if(store && r.store_id!=store) return false;
    if(cat   && r.risk_categories?.id!=cat) return false;
    if(sub   && r.risk_subcategories?.id!=sub) return false;
    if(grade && r.grade!==grade) return false;
    return true;
  });
}
// 영역 대분류 선택 시 해당 중분류만 채우기 (대시보드 필터)
function onFCatChange(){
  const catId=document.getElementById('f-cat').value;
  fillSel('f-sub', catId?allSubs.filter(s=>s.category_id==catId):[], '전체 영역 중분류');
  applyFilter();
}
// 뷰별 필터 select 표시 토글
function updateFbarSelects(){
  const main=!activeDiv;
  const set=(id,show)=>{const e=document.getElementById(id);if(e)e.style.display=show?'':'none';};
  set('f-div',main);
  set('f-brand',!main);
  set('f-grade',!main);
  // 매장 필터: 유통 + 리테일 선택 시만 노출
  const brandVal=document.getElementById('f-brand')?.value;
  const brandObj=allBrands.find(b=>b.id==brandVal);
  const showStore = activeDiv==='유통' && brandObj?.name==='리테일';
  set('f-store', showStore);
  const fs=document.getElementById('f-store');
  if(fs){
    if(showStore){
      // 옵션이 비어있으면 채움 (전체 매장 옵션 외 0개일 때만)
      if(fs.options.length<=1){
        const divObj=allDiv.find(d=>d.name==='유통');
        const stores=divObj?allStores.filter(s=>s.division_id===divObj.id):[];
        fs.innerHTML='<option value="">전체 매장</option>'+stores.map(s=>`<option value="${s.id}">${storeDisplayName(s.name)}</option>`).join('');
      }
    } else {
      fs.value='';
    }
  }
}
function applyFilter(){renderDash(getFiltered());}
// 메인뷰 상단 필터바의 '계열사' 드롭다운 — 선택 시 측정판도 그 계열사의 브랜드 기준으로 자동 전환
// 상단 필터바의 "계열사" 드롭다운으로 특정 계열사를 고르면, 사이드바에서 그 계열사를
// 클릭한 것과 완전히 동일하게 계열사뷰로 전환한다(브랜드/조직별 카드 그리드 등 그대로 노출).
// 예전엔 activeDiv는 그대로 두고 데이터만 필터링해서, 계열사뷰 화면(카드 그리드) 대신
// 메인뷰 화면이 그 계열사 하나만 필터된 채로 어색하게 보이는 문제가 있었음.
function onFDivChange(){
  const divId=document.getElementById('f-div')?.value||'';
  const dObj=divId?allDiv.find(d=>d.id==divId):null;
  setDiv(dObj?dObj.name:'', dObj?document.getElementById('div-'+dObj.name):null);
}

// ── 대시보드 전체 렌더 ──────────────────────
function renderDash(risks){
  // 필터바 표시 + 뷰별 select 토글
  const fbar=document.getElementById('main-fbar');
  if(fbar) fbar.style.display='';
  updateFbarSelects();
  playDashAnims(); // KPI·알림 카드 진입 애니메이션 재생(차트 재생 시점과 동기화)
  renderAlerts(risks); renderKPI(risks); renderMatrix(risks); renderAuditKPI(risks); renderDonut(risks);
  renderAreaNotesDashboard();
  _kpiAnimated=true; // 이번 렌더에서 카운트업을 다 재생했으니, 이후 같은 사이클의 필터 변경 등은 즉시 반영
  const areaCat=getAreaViewCategory();
  if(!activeDiv){
    // 메인뷰
    document.getElementById('section-main').style.display=areaCat?'none':'';
    document.getElementById('section-div').style.display='none';
    renderDivisionBarChart(risks);
    renderHighMain(risks);
  } else {
    // 계열사뷰
    document.getElementById('section-main').style.display='none';
    document.getElementById('section-div').style.display=areaCat?'none':'';
    renderBrandGrid(risks);
    renderHighDiv(risks);
  }
  // 영역뷰: 측정판 카드를 좁히고 옆에 '최근 모니터링 현황'을 붙임(위 section-main/div 대체).
  // 감사 영역은 측정판·특이사항판 자체가 의미 없어(감사 전용 KPI/조치사항 판이 따로 있음) 통째로 숨김.
  const isAudit=areaCat?.name==='감사';
  const matrixRow=document.getElementById('matrix-row');
  const areaRecentCard=document.getElementById('area-recent-card');
  const areaNotesCard=document.getElementById('area-notes-card');
  if(matrixRow){ matrixRow.style.display=isAudit?'none':''; matrixRow.classList.toggle('area-view', !!areaCat && !isAudit); }
  if(areaRecentCard) areaRecentCard.style.display=(areaCat && !isAudit)?'':'none';
  if(areaNotesCard) areaNotesCard.style.display=isAudit?'none':'';
  if(areaCat && !isAudit) renderHighArea(risks); // section-main/div보다 나중에 호출해 자동 스크롤 타이머가 실제 보이는 티커에 바인딩되게 함
  // renderTrend도 감사일 땐 자체 티커(trend-audit-wrap)를 돌리므로 반드시 맨 마지막에 호출한다.
  // (renderHighMain/Div도 공용 타이머(highRotateTimer)를 쓰기 때문에, 이보다 먼저 호출하면
  //  방금 시작한 감사 티커가 곧바로 renderHighMain/Div 쪽으로 뺏겨 멈춰버렸었음)
  renderTrend(risks);
}

// ── 알림 (장기 미해결) ────────────────────────
let _alertOverdueList=[];
const SLA_OVERDUE_DAYS=14;

// 장기 미해결: 등록 후 14일 이상 '위반' 상태인 건만. '모니터링'은 제외(완료할 것 없음).
// 조치중 KPI 카드의 SLA 항목에 노출되고, 마우스오버 시 상세 팝오버(showSlaPopover)로 보여줌.
function renderAlerts(risks){
  const cutoff=refNow(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-SLA_OVERDUE_DAYS);
  const overdue=risks.filter(r=>{
    if(!r.registered_at) return false;
    if(r.item_state!=='위반') return false;
    return new Date(r.registered_at) <= cutoff;
  }).sort((a,b)=>(a.registered_at||'').localeCompare(b.registered_at||''));
  _alertOverdueList=overdue;
  const oEl=document.getElementById('alert-overdue-n');
  if(oEl) oEl.textContent=overdue.length.toLocaleString();
  const slaEl=document.querySelector('.kpi-sla-inline');
  if(slaEl) slaEl.classList.toggle('has-alert', overdue.length>0);
}

// 조치중 카드의 'N일 초과' 항목에 마우스를 올리면 상세 목록을 팝오버로 보여줌(body에 fixed로 붙여 카드의 overflow:hidden에 잘리지 않게 함)
function showSlaPopover(){
  const trigger=document.getElementById('sla-trigger');
  if(!trigger) return;
  let pop=document.getElementById('sla-popover');
  if(!pop){
    pop=document.createElement('div');
    pop.id='sla-popover';
    pop.className='sla-popover';
    document.body.appendChild(pop);
  }
  const list=_alertOverdueList;
  if(!list.length){
    pop.innerHTML=`<div class="sla-pop-empty">${SLA_OVERDUE_DAYS}일 이상 미해결 건이 없습니다</div>`;
  } else {
    pop.innerHTML=`
      <div class="sla-pop-hd">${SLA_OVERDUE_DAYS}일 이상 위반(처리중) — ${list.length}레코드 · ${sumCnt(list)}건</div>
      <table class="sla-pop-tbl">
        <thead><tr><th>발생일</th><th>경과</th><th>영역/상세</th><th>브랜드</th><th>건수</th></tr></thead>
        <tbody>
          ${list.map(r=>{
            const elapsed=Math.floor((Date.now()-new Date(r.registered_at).getTime())/86400000);
            return `<tr onclick="hideSlaPopover();openEdit('${r.id}')">
              <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
              <td style="color:#ea580c;font-weight:700">${elapsed}일</td>
              <td>${r.risk_categories?.name||'-'}${r.risk_subcategories?.name?' / '+r.risk_subcategories.name:''}</td>
              <td>${r.brands?.name||'-'}</td>
              <td style="text-align:center">${rowCnt(r)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
  const rect=trigger.getBoundingClientRect();
  pop.style.left=Math.round(rect.left)+'px';
  pop.style.top=Math.round(rect.bottom+6)+'px';
  pop.classList.add('open');
}
function hideSlaPopover(){
  const pop=document.getElementById('sla-popover');
  if(pop) pop.classList.remove('open');
}

// KPI 카드(조치중 건수 / 회수금액의 발생액·해결액)에 마우스 올리면 그 숫자를 구성하는 실제 건 목록을
// showSlaPopover와 동일한 방식(body-appended popover)으로 보여줌. 목록 자체는 renderKPI가 매번 채워둔다.
let _kpiPopoverLists={occurred:[],recovered:[],curact:[]};
function showKpiPopover(triggerId,type){
  const trigger=document.getElementById(triggerId);
  if(!trigger) return;
  const cfgMap={
    occurred:{title:'부실채권 발생 건',list:_kpiPopoverLists.occurred,amount:true},
    recovered:{title:'부실채권 해결 건',list:_kpiPopoverLists.recovered,amount:true},
    curact:{title:'조치중(위반) 건',list:_kpiPopoverLists.curact,amount:false},
  };
  const cfg=cfgMap[type]; if(!cfg) return;
  let pop=document.getElementById('kpi-popover');
  if(!pop){
    pop=document.createElement('div');
    pop.id='kpi-popover';
    pop.className='sla-popover';
    document.body.appendChild(pop);
  }
  const list=cfg.list||[];
  if(!list.length){
    pop.innerHTML=`<div class="sla-pop-empty">해당하는 건이 없습니다</div>`;
  } else {
    const summary=cfg.amount ? fmtWon(list.reduce((s,r)=>s+(r.amount||0),0)) : `${sumCnt(list)}건수`;
    pop.innerHTML=`
      <div class="sla-pop-hd">${cfg.title} — ${list.length}레코드 · ${summary}</div>
      <table class="sla-pop-tbl">
        <thead><tr><th>발생일</th><th>영역/상세</th><th>브랜드</th><th>${cfg.amount?'금액':'건수'}</th></tr></thead>
        <tbody>
          ${list.map(r=>`<tr onclick="hideKpiPopover();openEdit('${r.id}')">
            <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
            <td>${r.risk_categories?.name||'-'}${r.risk_subcategories?.name?' / '+r.risk_subcategories.name:''}</td>
            <td>${r.brands?.name||'-'}</td>
            <td style="text-align:center">${cfg.amount?fmtWon(r.amount||0):rowCnt(r)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }
  const rect=trigger.getBoundingClientRect();
  pop.style.left=Math.round(rect.left)+'px';
  pop.style.top=Math.round(rect.bottom+6)+'px';
  pop.classList.add('open');
}
function hideKpiPopover(){
  const pop=document.getElementById('kpi-popover');
  if(pop) pop.classList.remove('open');
}


// 리스크 노출/측정판 상단 '?' 버튼 — 등급 산정 기준 안내
function showGradeCriteriaModal(){
  const html=`
    <div class="mo-hd">
      <div class="mo-ttl-wrap"><div class="mo-ttl-bar"></div><span class="mo-ttl">등급 설정 기준</span></div>
      <button class="mo-cls" onclick="closeAlertModal()">×</button>
    </div>
    <div class="mo-bd" style="font-size:12px;line-height:1.7;color:var(--text2)">
      <div class="note-box" style="background:#eff6ff;border-left:3px solid #2563eb;padding:8px 12px;border-radius:6px;margin-bottom:14px">건수 기준은 <b>월평균</b>입니다. 누적 모드에서는 (연초~기준일 총 건수) ÷ (경과 개월수)로, 지정월 모드에서는 그 달 건수 그대로 계산합니다 — 연말로 갈수록 총 건수만 늘어 등급이 무조건 나빠지는 걸 막기 위함입니다.</div>
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">컴플라이언스 분류 — 불법파견·공정거래·영업비밀·IP</div>
      <div style="margin-bottom:14px">위반(위반+완료 상태) 월평균 건수 기준 — <b>A</b> 3건 이하 · <b>B</b> 4~6건 · <b>C</b> 7~9건 · <b>D</b> 10건 이상. 단 <b>외부노출 1건 이상</b>이면 건수와 무관하게 <b>F</b></div>
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">중대재해</div>
      <div style="margin-bottom:14px">위반(위반+완료 상태) 월평균 건수 기준(위와 동일 구간). 단 <b>'중대재해 발생' 1건 이상</b>이면 건수와 무관하게 <b>F</b></div>
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">부실채권</div>
      <div style="margin-bottom:14px">발생+해결 전체 월평균 건수 기준(위와 동일 구간). '부실채권' 금액이 <b>1억 초과</b>인 건이 있으면 <b>F</b>, <b>1억 이하</b>인 건이 있으면 <b>D</b>(건수와 무관)</div>
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">감사 · 재고</div>
      <div style="margin-bottom:14px">등급 산정 대상에서 제외( — 표시)</div>
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">종합등급(순위판 · 100점 만점)</div>
      <div style="margin-bottom:14px">법인(또는 브랜드)의 영역별 등급을 <b>A=10점, B=8점, C=5점, D=3점, F=0점</b>으로 환산한 평균 × 10 = 100점 만점 점수.<br>평균 9~10=<b>A</b> · 7~8=<b>B</b> · 5~6=<b>C</b> · 3~4=<b>D</b> · 3 미만=<b>F</b></div>
      <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:10px">
        * 외식 영업비밀 모니터링 건수(외식BG 연동분)는 1/10 비율로 환산해 반영됩니다.<br>
        * 패션 IP·공정거래 모니터링 건수는 1/100 비율로 환산해 반영됩니다.
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
// 금액 포맷: 억/만원 단위로 축약 (예: 123,000,000 → "1.2억원")
function fmtWon(n){
  n=Math.round(n||0);
  if(n<=0) return '0원';
  if(n>=100000000) return (n/100000000).toFixed(1).replace(/\.0$/,'')+'억원';
  if(n>=10000) return (n/10000).toFixed(1).replace(/\.0$/,'')+'만원';
  return n.toLocaleString()+'원';
}
function renderKPI(risks){
  const now=refNow();
  const thisY=now.getFullYear(), thisM=now.getMonth();
  // 당월 카드 배지 = 기준 월 (스냅샷이면 연.월, 라이브면 이번달 월번호)
  const mb=document.getElementById('k-month-badge');
  if(mb) mb.textContent = viewMonth ? `${thisY}.${String(thisM+1).padStart(2,'0')}월` : `${thisM+1}월`;

  const areaCat=getAreaViewCategory();
  const isAudit=areaCat?.name==='감사';
  const isBadDebt=areaCat?.name==='부실채권';
  // 감사 영역뷰: 상단 KPI 4장(연누적/월누적/조치중/회수금액) 자체를 숨김(감사 전용 KPI가 따로 있음)
  const topRow=document.getElementById('top-kpi-row');
  if(topRow) topRow.style.display=isAudit?'none':'';
  // 회수금액 카드: 부실채권 영역을 보고 있을 때만 의미가 있으므로 그 외 영역 선택 시엔 숨김
  // 그때 나머지 3장(연누적/월누적/조치중)이 빈자리를 채우도록 3열로 넓힘
  const recoveryHidden = !!areaCat && !isBadDebt;
  const recoveryCard=document.getElementById('kpi-recovery-card');
  if(recoveryCard) recoveryCard.style.display=recoveryHidden?'none':'';
  if(topRow) topRow.classList.toggle('kpi-col-3', recoveryHidden && !isAudit);

  // 회수금액: 부실채권 발생액(전체, 금액 입력된 건 전부) 대비 해결액(해결 상태) — 기준일까지
  const badDebtRisks=risks.filter(r=>r.risk_categories?.name==='부실채권' && r.amount);
  const occurredAmt=badDebtRisks.reduce((s,r)=>s+(r.amount||0),0);
  const recoveredRisks=badDebtRisks.filter(r=>r.item_state==='해결');
  const recovery=recoveredRisks.reduce((s,r)=>s+(r.amount||0),0);
  const recoveryRate=pctRateExact(recovery,occurredAmt); // 문자열(소수점 1자리, 내림)
  _kpiPopoverLists.occurred=badDebtRisks;
  _kpiPopoverLists.recovered=recoveredRisks;

  // 감사는 항상 제외. 부실채권은 원래 위반/모니터링/조치중 집계에서 제외하는 게 기본이지만
  // (회수금액 카드로 따로 보여주므로) 지금 딱 부실채권 영역만 보고 있을 땐 제외하면 안 됨 —
  // 그러면 필터링된 risks(이미 부실채권만 남음)가 여기서 또 한 번 걸러져 전부 0/빈 값이 됐었음.
  risks=risks.filter(r=>r.risk_categories?.name!=='감사' && (isBadDebt || r.risk_categories?.name!=='부실채권'));

  // 누적: 위반(위반+완료) / 모니터링(전체) — 입력 건수 합계 기준
  // 표시는 소수점까지 정확히(반올림으로 0%가 되어 실제 위반이 안 보이는 일이 없도록), 막대 너비만 정수 비율 사용
  const accViol=sumViol(risks);
  const accMon=sumCnt(risks);
  const accRate=pctRate(accViol,accMon);
  const accRateText=pctRateExact(accViol,accMon);

  // 당월
  const thisMonth=risks.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===thisY&&d.getMonth()===thisM;
  });
  const monViol=sumViol(thisMonth);
  const monMon=sumCnt(thisMonth);
  const monRate=pctRate(monViol,monMon);
  const monRateText=pctRateExact(monViol,monMon);

  // 현재: 조치중(위반계열) + 처리완료율(완료계열/(위반+완료))
  const curActRisks=risks.filter(r=>isViolState(r.item_state));
  _kpiPopoverLists.curact=curActRisks;
  const curAct=sumViol(curActRisks);
  const curDone=sumViol(risks.filter(r=>isDoneState(r.item_state)));
  const curTotal=curAct+curDone;
  const curRate=pctRate(curDone,curTotal);

  // 누적
  animCount('k-acc-viol',accViol); animCount('k-acc-mon',accMon);
  setBar('k-acc-bar',accRate); setText('k-acc-rate',accRateText+'%');
  // 당월
  animCount('k-mon-viol',monViol); animCount('k-mon-mon',monMon);
  setBar('k-mon-bar',monRate); setText('k-mon-rate',monRateText+'%');
  // 회수금액
  setText('k-recovery-amt',fmtWon(recovery));
  setText('k-recovery-occurred',fmtWon(occurredAmt));
  setBar('k-recovery-bar',recoveryRate); setText('k-recovery-rate',recoveryRate+'%');
  // 현재
  animCount('k-cur-act',curAct);
  setBar('k-cur-bar',curRate); setText('k-cur-rate',curRate+'%');
}
// KPI 큰 숫자: 첫 데이터 표시 때 0→목표로 카운트업(이후 필터 변경은 즉시 반영해 차분하게)
let _kpiAnimated=false;
function animCount(id,target){
  const el=document.getElementById(id); if(!el) return;
  target=Math.round(target||0);
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce||_kpiAnimated||target<=0){ el.textContent=target; return; }
  const dur=1800, start=performance.now();
  (function tick(now){
    const p=Math.max(0,Math.min((now-start)/dur,1));
    el.textContent=Math.round(target*(1-Math.pow(1-p,3))); // easeOutCubic
    if(p<1) requestAnimationFrame(tick); else el.textContent=target;
  })(performance.now());
}
// 대시보드 KPI·알림 카드 진입 애니메이션을 다시 재생(추이·도넛 차트가 다시 그려지는 시점과 맞춤)
function playDashAnims(){
  const p=document.getElementById('page-dashboard');
  if(!p) return;
  _kpiAnimated=false;          // 숫자 카운트업 다시 켜기
  p.classList.remove('anim-in');
  void p.offsetWidth;          // 리플로우 강제 → CSS 애니메이션 재시작
  p.classList.add('anim-in');
}
function set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function setBar(id,pct,cls){
  const e=document.getElementById(id); if(!e) return;
  e.style.width=Math.min(pct,100)+'%';
}

// ── 추이 차트 ──────────────────────────────
function renderTrend(risks){
  // 감사 영역뷰: 월별 추이 대신 '최근 모니터링 현황' 목록으로 대체(감사는 추이보다 최근 처리 건 확인이 더 유용)
  const isAudit=getAreaViewCategory()?.name==='감사';
  const titleEl=document.getElementById('trend-card-title');
  const controlsEl=document.getElementById('trend-controls');
  const chartBoxEl=document.getElementById('trend-chart-box');
  const auditWrapEl=document.getElementById('trend-audit-wrap');
  if(isAudit){
    if(titleEl) titleEl.textContent='최근 모니터링 현황';
    if(controlsEl) controlsEl.style.display='none';
    if(chartBoxEl) chartBoxEl.style.display='none';
    if(auditWrapEl) auditWrapEl.style.display='';
    if(tChart){ tChart.destroy(); tChart=null; }
    const list=sortByRecent(risks);
    const b=document.getElementById('high-body-audit');
    if(b){
      b.innerHTML=list.length?list.map(r=>`
        <tr onclick="openEdit('${r.id}')">
          <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
          <td>${r.divisions?.name||'-'}</td>
          <td>${escapeHTML(r.title||'-')}</td><td>${stateBadge(r.item_state)}</td>
        </tr>`).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';
      // 다른 '최근 모니터링' 목록(high-body-main/div/area)과 동일하게 자동 스크롤 티커 적용 —
      // 이게 없으면 340px를 넘는 나머지 행들은 스크롤 수단 없이 그냥 안 보였음.
      if(list.length) startHighRotate('trend-audit-wrap'); else stopHighRotate();
    }
    return;
  }
  if(titleEl) titleEl.textContent='월별 모니터링 추이';
  if(controlsEl) controlsEl.style.display='';
  if(chartBoxEl) chartBoxEl.style.display='';
  if(auditWrapEl) auditWrapEl.style.display='none';

  const now=refNow();
  const months=[];
  // 기간 창: 직전 before개월 + 현재 + 이후 after개월 (기본 3 + 1 + 8 = 12개월). 컨트롤로 조정 가능.
  const before=parseInt(document.getElementById('trend-before')?.value ?? '3');
  const after =parseInt(document.getElementById('trend-after')?.value  ?? '8');
  for(let off=-before; off<=after; off++){
    const d=new Date(now.getFullYear(),now.getMonth()+off,1);
    months.push({label:`${d.getMonth()+1}월`,y:d.getFullYear(),m:d.getMonth()});
  }
  const cnt=m=>sumCnt(risks.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===m.y&&d.getMonth()===m.m;
  }));
  // '위반' 건수 = item_state가 '위반'/'완료' 행의 입력 건수 합. '모니터링'은 제외(sumViol이 처리).
  const violCnt=m=>sumViol(risks.filter(r=>{
    if(!r.registered_at) return false;
    const d=new Date(r.registered_at);
    return d.getFullYear()===m.y&&d.getMonth()===m.m;
  }));
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
      // 새로고침마다 선이 바닥(0)에서 위로 차오르며 그려지는 '업데이트' 효과
      animation:{duration:1200,easing:'easeOutQuart'},
      animations:{
        y:{from:ctx=>ctx.chart.scales.y.getPixelForValue(0)}
      },
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
  const titleEl=document.getElementById('donut-card-title');
  const areaCat=getAreaViewCategory();
  // 영역뷰(특정 영역 선택 중)에선 카테고리 도넛이 의미 없음(이미 한 영역만 남아있으므로) → 위반 유형별 비중으로 전환
  if(areaCat){
    if(titleEl) titleEl.textContent='위반 유형별 현황';
    renderViolationTypeDonut(risks);
    return;
  }
  if(titleEl) titleEl.textContent='리스크 영역별 현황';
  const vals=allCats.map(c=>sumCnt(risks.filter(r=>r.risk_categories?.id===c.id)));
  document.getElementById('donut-n').textContent=sumCnt(risks);
  if(dChart) dChart.destroy();
  dChart=new Chart(document.getElementById('donut-chart'),{
    type:'doughnut',
    // 처음엔 0(빈 도넛)으로 그린 뒤 실제 값으로 갱신 → 새로고침마다 차오르는 '업데이트' 효과
    data:{labels:allCats.map(c=>c.name),datasets:[{data:vals.map(()=>0),backgroundColor:CAT_COLORS,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'66%',
      animation:{animateRotate:true,animateScale:true,duration:1100,easing:'easeOutQuart'},
      plugins:{legend:{display:false}}}
  });
  // 다음 프레임에 실제 값으로 갱신해 도넛이 채워지는 애니메이션을 보여줌
  requestAnimationFrame(()=>{
    if(!dChart) return;
    dChart.data.datasets[0].data=vals;
    dChart.update();
  });
  document.getElementById('donut-legend').innerHTML=allCats.map((c,i)=>`
    <div class="lg-item"><div class="lg-dot" style="background:${CAT_COLORS[i]}"></div><span>${c.name}</span><span class="lg-n">${vals[i]}</span></div>
  `).join('');
}
// 영역뷰 전용 도넛: 현재 필터된(risks) 데이터의 실제 위반유형(violation_type)별 건수 비중
function renderViolationTypeDonut(risks){
  const groups={};
  risks.forEach(r=>{
    const key=(r.violation_type||'').trim()||'미지정';
    groups[key]=(groups[key]||0)+rowCnt(r);
  });
  let labels=Object.keys(groups).sort((a,b)=>groups[b]-groups[a]);
  let vals=labels.map(l=>groups[l]);
  let colors=labels.map((_,i)=>CAT_COLORS[i%CAT_COLORS.length]);
  if(!labels.length){ labels=['데이터 없음']; vals=[1]; colors=['#e5e7eb']; }
  document.getElementById('donut-n').textContent=sumCnt(risks);
  if(dChart) dChart.destroy();
  dChart=new Chart(document.getElementById('donut-chart'),{
    type:'doughnut',
    data:{labels, datasets:[{data:vals.map(()=>0),backgroundColor:colors,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'66%',
      animation:{animateRotate:true,animateScale:true,duration:1100,easing:'easeOutQuart'},
      plugins:{legend:{display:false}}}
  });
  requestAnimationFrame(()=>{
    if(!dChart) return;
    dChart.data.datasets[0].data=vals;
    dChart.update();
  });
  document.getElementById('donut-legend').innerHTML=labels.map((l,i)=>`
    <div class="lg-item"><div class="lg-dot" style="background:${colors[i]}"></div><span>${escapeHTML(l)}</span><span class="lg-n">${vals[i]}</span></div>
  `).join('');
}

// ── 리스크 노출/측정판 ───────────────────────────────
// 법인(계열사) × 영역 대분류가 기본. 상단 드롭다운으로 특정 계열사를 고르면 그 계열사의 브랜드별 순위로 전환.
// 감사·재고는 등급 산정 대상이 아니라 열에서 제외.
// 종합등급: 영역별 등급을 A=10/B=8/C=5/D=3점으로 환산한 평균 점수로 산정.
//   평균 9~10=A, 7~8=B, 5~6=C, 3~4=D, 3 미만=F
const GRADE_POINT={A:10,B:8,C:5,D:3,F:0};
function scoreToOverallGrade(avg){
  if(avg>=9) return 'A';
  if(avg>=7) return 'B';
  if(avg>=5) return 'C';
  if(avg>=3) return 'D';
  return 'F';
}
function renderMatrix(risks){
  const head=document.getElementById('grade-mx-head'), body=document.getElementById('grade-mx-body');
  if(!head||!body) return;
  // 영역뷰(특정 영역을 선택 중, 감사 제외 — 감사는 측정판 자체를 숨김)면 그 영역 한 칸만, 아니면 감사·재고 제외 전체 영역
  const areaCat=getAreaViewCategory();
  const isSingleCat = !!areaCat && areaCat.name!=='감사';
  const cats=isSingleCat ? [areaCat] : allCats.filter(c=>!GRADE_EXCLUDE.includes(c.name));
  const mxTable=document.getElementById('grade-mx-table');
  if(mxTable) mxTable.style.minWidth = isSingleCat ? '340px' : '';
  document.getElementById('grade-mx-scroll')?.classList.toggle('area-scroll', isSingleCat);
  const scopeSel=document.getElementById('grade-view-scope');
  const scopeDivObj=scopeSel&&scopeSel.value?allDiv.find(d=>d.id==scopeSel.value):null;

  let entities, entityLabel;
  if(scopeDivObj){
    entities=visibleBrands(allBrands.filter(b=>b.division_id===scopeDivObj.id)).map(b=>({id:b.id,name:b.name,brand:true}));
    entityLabel='브랜드';
  } else {
    entities=(activeDiv?allDiv.filter(d=>d.name===activeDiv):allDiv).map(d=>({id:d.id,name:d.name,brand:false}));
    entityLabel='계열사';
  }

  head.innerHTML=`<tr><th class="rh">순위</th><th class="rh">${entityLabel}</th><th>종합등급</th>${cats.map(c=>`<th class="head-my-center">${c.name}</th>`).join('')}</tr>`;
  // colgroup으로 열 폭을 명시적으로 고정 — thead/tbody가 항상 같은 폭을 쓰도록 보장
  const colgroupEl=document.getElementById('grade-mx-colgroup');
  if(colgroupEl){
    colgroupEl.innerHTML=`<col style="width:52px"><col style="width:120px"><col style="width:90px">${cats.map(()=>'<col>').join('')}`;
  }

  const {start,cutoff}=gradeWindow();
  const months=monthsSpan(start,cutoff);
  const rowsData=entities.map(ent=>{
    const cells=cats.map(cat=>{
      const items=risks.filter(r=>{
        const match=ent.brand ? r.brands?.id==ent.id : r.divisions?.id==ent.id;
        if(!match || r.risk_categories?.id!=cat.id) return false;
        if(!r.registered_at) return false;
        const d=new Date(r.registered_at);
        return d>=start && d<=cutoff;
      });
      if(!items.length) return {grade:null,num:0,den:0};
      // 분수(위반/전체)는 누적 건수 그대로 표시. 등급 산정만 월평균 기준(아래 calcCategoryGrade)을 유지.
      const den=sumCnt(items), num=sumViol(items);
      const grade = ent.brand ? calcCategoryGrade(cat.name, items, months) : (items[0].grade||null);
      return {grade, num, den};
    });
    const validCells=cells.filter(c=>c.grade);
    let overall=null, avgScore=null;
    if(validCells.length){
      avgScore=validCells.reduce((s,c)=>s+GRADE_POINT[c.grade],0)/validCells.length;
      overall=scoreToOverallGrade(avgScore);
    }
    const fCount=cells.filter(c=>c.grade==='F').length;
    return {ent, cells, overall, avgScore, fCount};
  });

  // 평균 점수 좋은 순으로 정렬. 점수가 같으면 F등급 영역이 적은 쪽이 상위(동점자는 F 개수로 재정렬).
  // 데이터 없는 법인/브랜드는 맨 아래
  const sorted=[...rowsData].sort((a,b)=>(b.avgScore??-1)-(a.avgScore??-1) || a.fCount-b.fCount);
  const drillDivId=scopeDivObj?scopeDivObj.id:null;

  body.innerHTML=sorted.map((row,i)=>{
    const dim=!row.overall;
    const rankHtml=dim?'—':(i<3?`<span class="rank-circle rank-${i+1}">${i+1}</span>`:`${i+1}`);
    const overallHtml=row.overall
      ?`<span class="cpill cpill-lg cp-${row.overall}">${row.overall}</span><br><span class="overall-score">${Math.round(row.avgScore*10)}점</span>`
      :`<span class="cp-none">—</span>`;
    const rowDivId=row.ent.brand?drillDivId:row.ent.id;
    const rowBrandId=row.ent.brand?row.ent.id:'';
    const cellsHtml=row.cells.map((c,ci)=>{
      if(!c.grade) return `<td><span class="cp-none">—</span></td>`;
      return `<td><span class="cpill cp-${c.grade}" onclick="drillDown(${rowDivId},${cats[ci].id},${rowBrandId||'null'})">${c.grade}</span><br><span class="gc-frac"><span class="gc-num">${c.num}</span>/${c.den}</span></td>`;
    }).join('');
    return `<tr class="mx-row-in${dim?' mx-row-dim':''}" style="animation-delay:${Math.min(i,14)*0.7}s"><td class="rank-col">${rankHtml}</td><td class="name-col">${row.ent.name}</td><td class="overall-col">${overallHtml}</td>${cellsHtml}</tr>`;
  }).join('');

  // LIVE 배지(스냅샷/기준월 조회 중이 아닐 때만) · 기간 라벨
  const liveEl=document.getElementById('grade-live-badge');
  if(liveEl) liveEl.style.display=(viewMonth||gradeRefMonth)?'none':'';
  const labelEl=document.getElementById('grade-period-label');
  if(labelEl) labelEl.textContent=`${cutoff.getFullYear()}년 ${cutoff.getMonth()+1}월 ${gradePeriodMode} 기준`;
}

// 측정판 기준월 드롭다운 채우기(데이터 로드 후 1회) · 변경 시 재계산
function fillGradeRefMonth(){
  const el=document.getElementById('grade-ref-month'); if(!el) return;
  const prev=el.value;
  const opts=['<option value="">이번달</option>'];
  monthOptionsRange().forEach(o=>{
    opts.push(`<option value="${o.y}-${o.m}">${o.y}.${String(o.m+1).padStart(2,'0')}월</option>`);
  });
  el.innerHTML=opts.join('');
  el.value=prev;
}
function onGradeRefMonthChange(){
  const v=document.getElementById('grade-ref-month')?.value||'';
  // 특정 월을 선택하면 그 달만(당월), 다시 '이번달'로 돌아가면 연누적으로 자동 전환
  // — 사용자가 별도로 연누적/당월 토글을 안 건드려도 "누적" 또는 "선택한 월의 데이터"로 보이게 함
  const modeSel=document.getElementById('grade-period-mode');
  if(v){
    const [y,m]=v.split('-').map(Number); gradeRefMonth={y,m};
    gradePeriodMode='당월';
  } else {
    gradeRefMonth=null;
    gradePeriodMode='연누적';
  }
  if(modeSel) modeSel.value=gradePeriodMode;
  recomputeGrades();
}

// ── 감사 영역 KPI + 조치사항 판 ──────────────────
let auditPage=1; const AUDIT_PER=5;
function renderAuditKPI(risks){
  // 감사 KPI 4장 + 조치사항 판: 전체 영역(필터 없음)이거나 '감사'를 선택했을 때 노출.
  // 그 외 특정 영역(중대재해 등)을 선택했을 때만 숨김(관련없는 0만 보여 혼란을 주므로).
  const selectedCat = allCats.find(c=>c.id==document.getElementById('f-cat')?.value);
  const isAuditView = !selectedCat || selectedCat.name==='감사';
  const auditHd=document.getElementById('audit-kpi-hd'), auditRow=document.getElementById('audit-kpi-row'), auditActionCard=document.getElementById('audit-action-card');
  if(auditHd) auditHd.style.display=isAuditView?'':'none';
  if(auditRow) auditRow.style.display=isAuditView?'':'none';
  if(auditActionCard) auditActionCard.style.display=isAuditView?'':'none';

  const mode=document.getElementById('audit-period-mode')?.value||'누적';
  const monthPick=document.getElementById('audit-month-pick');
  if(monthPick) monthPick.style.display=mode==='지정월'?'':'none';

  let auditRows=risks.filter(r=>r.risk_categories?.name==='감사');
  if(mode==='지정월' && monthPick?.value){
    const [y,m]=monthPick.value.split('-').map(Number);
    auditRows=auditRows.filter(r=>{
      if(!r.registered_at) return false;
      const d=new Date(r.registered_at);
      return d.getFullYear()===y && d.getMonth()===(m-1);
    });
  }

  const total=sumCnt(auditRows);
  const done=sumCnt(auditRows.filter(r=>r.item_state==='조치완료'));
  const minor=sumCnt(auditRows.filter(r=>r.discipline_type==='경징계'));
  const major=sumCnt(auditRows.filter(r=>r.discipline_type==='중징계'));
  const criminal=sumCnt(auditRows.filter(r=>r.discipline_type==='형사고발'));

  animCount('k-audit-done',done);
  animCount('k-audit-total',total);
  animCount('k-audit-minor',minor);
  animCount('k-audit-major',major);
  animCount('k-audit-criminal',criminal);

  // 조치사항 판: 감사 영역 입력값을 최근순으로 나열(5행씩 페이지)
  const tbody=document.getElementById('audit-action-body');
  if(tbody){
    const sorted=sortByRecent(auditRows);
    const tp=Math.max(1,Math.ceil(sorted.length/AUDIT_PER));
    if(auditPage>tp) auditPage=1;
    const slice=sorted.slice((auditPage-1)*AUDIT_PER,auditPage*AUDIT_PER);
    tbody.innerHTML=slice.length?slice.map(r=>`
      <tr onclick="showAuditActionDetail('${r.id}')" style="cursor:pointer">
        <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
        <td>${r.divisions?.name||'-'}</td>
        <td>${escapeHTML(r.title||'-')}</td>
        <td>${escapeHTML(r.sentence||'-')}</td>
        <td>${escapeHTML(r.discipline_name||'-')}</td>
        <td class="td-clip">${escapeHTML(r.note||'-')}</td>
      </tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';
    const pgnEl=document.getElementById('audit-pgn');
    if(pgnEl) pgnEl.innerHTML=buildPagination(auditPage,tp,page=>`auditPage=${page};renderAuditKPI(getFiltered())`);
  }
}
// 조치사항 판(감사) 행 클릭 → 전문 보기 팝업 (비고가 td-clip으로 잘려 보이는 걸 그대로 다 보여줌)
function showAuditActionDetail(id){
  const r=allRisks.find(x=>x.id===id); if(!r) return;
  const nl2br=s=>escapeHTML(s||'-').replace(/\n/g,'<br>');
  const html=`
    <div class="mo-hd">
      <div class="mo-ttl-wrap"><div class="mo-ttl-bar"></div><span class="mo-ttl">조치사항 상세</span></div>
      <button class="mo-cls" onclick="closeAlertModal()">×</button>
    </div>
    <div class="mo-bd" style="font-size:12px;line-height:1.8;color:var(--text2)">
      <div><b>날짜</b> ${fmtD(r.registered_at)}</div>
      <div><b>법인</b> ${escapeHTML(r.divisions?.name||'-')} ${r.brands?.name?'/ '+escapeHTML(r.brands.name):''}</div>
      <div><b>리스크 제목</b> ${escapeHTML(r.title||'-')}</div>
      <div><b>징계유형</b> ${escapeHTML(r.discipline_type||'-')}</div>
      <div><b>대상자</b> ${escapeHTML(r.discipline_name||'-')}</div>
      <div><b>양형/처분</b> ${escapeHTML(r.sentence||'-')}</div>
      <div style="margin-top:10px"><b>비고</b><br>${nl2br(r.note)}</div>
    </div>`;
  showAlertModal(html);
}

// ── 영역별 특이사항 (데이터 입력 → 리스크 노출/측정판 바로 아래 카드에 표시) ──────
let allAreaNotes=[];
async function loadAreaNotes(){
  const {data,error}=await sb.from('area_notes').select('*').order('note_date',{ascending:false});
  if(error){ allAreaNotes=[]; return; }
  allAreaNotes=data||[];
}
function resetAreaNote(){
  ['an-date','an-brand','an-category','an-main-issue','an-issue-detail','an-action'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
}
async function saveAreaNote(){
  const date=document.getElementById('an-date').value||null;
  const brandId=document.getElementById('an-brand').value;
  const categoryId=document.getElementById('an-category')?.value||'';
  const mainIssue=document.getElementById('an-main-issue').value.trim();
  const detail=document.getElementById('an-issue-detail').value.trim();
  const action=document.getElementById('an-action').value.trim();
  if(!brandId||!mainIssue){ showToast('브랜드명과 주요이슈는 필수입니다'); return; }
  const btn=document.getElementById('an-save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  const {error}=await sb.from('area_notes').insert({
    note_date:date, brand_id:parseInt(brandId), category_id: categoryId?parseInt(categoryId):null,
    main_issue:mainIssue, issue_detail:detail||null, action_text:action||null
  });
  btn.textContent='저장'; btn.disabled=false;
  if(error){ showToast('저장 실패: '+error.message); return; }
  showToast('등록 완료!');
  resetAreaNote();
  await loadAreaNotes();
  refreshAreaNotesViews();
}
async function refreshAreaNotesViews(){
  renderAreaNotesDashboard();
  renderAreaNotesList();
}
// 메인뷰(대시보드) 영역별 특이사항 카드 — 조회 전용, 감사 KPI와 동일한 누적/지정월 기간을 공유.
// 지금 보고 있는 법인(activeDiv)·영역(f-cat)으로 좁혀서 보여준다(다른 법인/영역 것까지 섞여 보이던 문제 수정).
function renderAreaNotesDashboard(){
  const tbody=document.getElementById('area-notes-body');
  if(!tbody) return;
  const mode=document.getElementById('audit-period-mode')?.value||'누적';
  const monthPick=document.getElementById('audit-month-pick');
  let notes=allAreaNotes;
  if(activeDiv){
    const dObj=allDiv.find(d=>d.name===activeDiv);
    notes=notes.filter(n=>{
      const brand=allBrands.find(b=>b.id===n.brand_id);
      return brand && dObj && brand.division_id===dObj.id;
    });
  }
  const fCatVal=document.getElementById('f-cat')?.value;
  if(fCatVal){
    notes=notes.filter(n=>String(n.category_id)===String(fCatVal));
  }
  if(mode==='지정월' && monthPick?.value){
    const [y,m]=monthPick.value.split('-').map(Number);
    notes=notes.filter(n=>{
      if(!n.note_date) return false;
      const d=new Date(n.note_date);
      return d.getFullYear()===y && d.getMonth()===(m-1);
    });
  }
  const sorted=[...notes].sort((a,b)=>(b.note_date||'').localeCompare(a.note_date||''));
  tbody.innerHTML=sorted.length?sorted.map(n=>{
    const brand=allBrands.find(b=>b.id===n.brand_id);
    const dv=brand?allDiv.find(d=>d.id===brand.division_id):null;
    const cat=allCats.find(c=>c.id===n.category_id);
    return `<tr onclick="showAreaNoteDetail('${n.id}')" style="cursor:pointer">
      <td style="white-space:nowrap">${fmtD(n.note_date)}</td>
      <td>${escapeHTML(brand?.name||'-')}${dv?` <span style="color:var(--text3)">(${escapeHTML(dv.name)})</span>`:''}</td>
      <td>${cat?escapeHTML(cat.name):'<span style="color:var(--text3)">미지정</span>'}</td>
      <td>${escapeHTML(n.main_issue||'-')}</td>
      <td class="td-clip">${escapeHTML(n.issue_detail||'-')}</td>
      <td class="td-clip">${escapeHTML(n.action_text||'-')}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';
}
// 특이사항/조치사항 행 클릭 → 전문(全文) 보기 팝업 (표에서 td-clip으로 잘려 보이는 내용을 그대로 다 보여줌)
function showAreaNoteDetail(id){
  const n=allAreaNotes.find(x=>x.id===Number(id)); if(!n) return;
  const brand=allBrands.find(b=>b.id===n.brand_id);
  const dv=brand?allDiv.find(d=>d.id===brand.division_id):null;
  const cat=allCats.find(c=>c.id===n.category_id);
  const nl2br=s=>escapeHTML(s||'-').replace(/\n/g,'<br>');
  const html=`
    <div class="mo-hd">
      <div class="mo-ttl-wrap"><div class="mo-ttl-bar"></div><span class="mo-ttl">영역별 특이사항 상세</span></div>
      <button class="mo-cls" onclick="closeAlertModal()">×</button>
    </div>
    <div class="mo-bd" style="font-size:12px;line-height:1.8;color:var(--text2)">
      <div><b>날짜</b> ${fmtD(n.note_date)}</div>
      <div><b>계열사/브랜드</b> ${dv?escapeHTML(dv.name)+' / ':''}${escapeHTML(brand?.name||'-')}</div>
      <div><b>영역</b> ${cat?escapeHTML(cat.name):'미지정'}</div>
      <div style="margin-top:10px"><b>주요이슈</b><br>${nl2br(n.main_issue)}</div>
      <div style="margin-top:10px"><b>이슈상세</b><br>${nl2br(n.issue_detail)}</div>
      <div style="margin-top:10px"><b>조치사항</b><br>${nl2br(n.action_text)}</div>
    </div>`;
  showAlertModal(html);
}

// ── 모니터링 리스트 > 영역별 특이사항 탭 — 수정/삭제 가능 ──────
let areaNoteEditId=null;
let areaNotePage=1; const AREA_NOTE_PER=10;
function renderAreaNotesList(){
  const tbody=document.getElementById('area-notes-list-body');
  if(!tbody) return;
  const sorted=[...allAreaNotes].sort((a,b)=>(b.note_date||'').localeCompare(a.note_date||''));
  const tp=Math.max(1,Math.ceil(sorted.length/AREA_NOTE_PER));
  if(areaNotePage>tp) areaNotePage=1;
  const slice=sorted.slice((areaNotePage-1)*AREA_NOTE_PER,areaNotePage*AREA_NOTE_PER);
  let html='';
  slice.forEach(n=>{
    const brand=allBrands.find(b=>b.id===n.brand_id);
    const dv=brand?allDiv.find(d=>d.id===brand.division_id):null;
    const cat=allCats.find(c=>c.id===n.category_id);
    const isEd=areaNoteEditId===n.id;
    html+=`<tr class="${isEd?'ier-active':''}" onclick="showAreaNoteDetail('${n.id}')" style="cursor:pointer">
      <td style="white-space:nowrap">${fmtD(n.note_date)}</td>
      <td>${escapeHTML(brand?.name||'-')}${dv?` <span style="color:var(--text3)">(${escapeHTML(dv.name)})</span>`:''}</td>
      <td>${cat?escapeHTML(cat.name):'<span style="color:var(--text3)">미지정</span>'}</td>
      <td>${escapeHTML(n.main_issue||'-')}</td>
      <td class="td-clip">${escapeHTML(n.issue_detail||'-')}</td>
      <td class="td-clip">${escapeHTML(n.action_text||'-')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="event.stopPropagation();startAreaNoteEdit('${n.id}')">${isEd?'닫기':'수정'}</button>
        <button class="btn btn-sm" style="color:var(--위험-c);border-color:var(--위험-bd)" onclick="event.stopPropagation();deleteAreaNote('${n.id}')">삭제</button>
      </td>
    </tr>`;
    if(isEd) html+=buildAreaNoteEditRow(n);
  });
  tbody.innerHTML=slice.length?html:'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';
  const pgnEl=document.getElementById('area-notes-pgn');
  if(pgnEl) pgnEl.innerHTML=buildPagination(areaNotePage,tp,page=>`areaNotePage=${page};renderAreaNotesList()`);
}
function buildAreaNoteEditRow(n){
  let noteBrands=visibleBrands(allBrands);
  // 기존에 '기타'로 등록된 항목을 열었을 때 브랜드가 비워지지 않도록 현재 값은 목록에 유지
  if(n.brand_id && !noteBrands.some(b=>b.id===n.brand_id)){
    const kb=allBrands.find(b=>b.id===n.brand_id);
    if(kb) noteBrands=[...noteBrands, kb];
  }
  return `<tr class="ier-row" onclick="event.stopPropagation()"><td colspan="7">
    <div class="ier-form">
      <div class="fg"><label class="flb">날짜</label><input type="date" class="fc" id="ane-date" value="${n.note_date||''}"></div>
      <div class="fg"><label class="flb">브랜드명 *</label><select class="fc" id="ane-brand">${noteBrands.map(b=>{const dv=allDiv.find(d=>d.id===b.division_id);return `<option value="${b.id}" ${b.id===n.brand_id?'selected':''}>${dv?`${dv.name} - ${b.name}`:b.name}</option>`;}).join('')}</select></div>
      <div class="fg"><label class="flb">영역</label><select class="fc" id="ane-category"><option value="">선택 안 함</option>${allCats.map(c=>`<option value="${c.id}" ${c.id===n.category_id?'selected':''}>${c.name}</option>`).join('')}</select></div>
      <div class="fg full"><label class="flb">주요이슈 *</label><input type="text" class="fc" id="ane-main-issue" value="${escapeHTML(n.main_issue||'')}"></div>
      <div class="fg full"><label class="flb">이슈상세</label><textarea class="fc" id="ane-issue-detail" rows="2">${escapeHTML(n.issue_detail||'')}</textarea></div>
      <div class="fg full"><label class="flb">조치사항</label><textarea class="fc" id="ane-action" rows="2">${escapeHTML(n.action_text||'')}</textarea></div>
      <div class="fg full" style="flex-direction:row;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="cancelAreaNoteEdit()">취소</button>
        <button class="btn btn-red btn-sm" id="ane-save-btn" onclick="saveAreaNoteEdit('${n.id}')">저장</button>
      </div>
    </div>
  </td></tr>`;
}
function startAreaNoteEdit(id){
  id=Number(id);
  areaNoteEditId=(areaNoteEditId===id)?null:id;
  renderAreaNotesList();
}
function cancelAreaNoteEdit(){
  areaNoteEditId=null;
  renderAreaNotesList();
}
async function saveAreaNoteEdit(id){
  const date=document.getElementById('ane-date').value||null;
  const brandId=document.getElementById('ane-brand').value;
  const categoryId=document.getElementById('ane-category')?.value||'';
  const mainIssue=document.getElementById('ane-main-issue').value.trim();
  const detail=document.getElementById('ane-issue-detail').value.trim();
  const action=document.getElementById('ane-action').value.trim();
  if(!brandId||!mainIssue){ showToast('브랜드명과 주요이슈는 필수입니다'); return; }
  const btn=document.getElementById('ane-save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  const {error}=await sb.from('area_notes').update({
    note_date:date, brand_id:parseInt(brandId), category_id: categoryId?parseInt(categoryId):null,
    main_issue:mainIssue, issue_detail:detail||null, action_text:action||null
  }).eq('id',id);
  if(error){ btn.textContent='저장'; btn.disabled=false; showToast('저장 실패: '+error.message); return; }
  showToast('수정 완료!');
  areaNoteEditId=null;
  await loadAreaNotes();
  refreshAreaNotesViews();
}
async function deleteAreaNote(id){
  if(!confirm('이 특이사항을 삭제하시겠습니까?')) return;
  const {error}=await sb.from('area_notes').delete().eq('id',id);
  if(error){ showToast('삭제 실패: '+error.message); return; }
  showToast('삭제 완료');
  if(areaNoteEditId===Number(id)) areaNoteEditId=null;
  await loadAreaNotes();
  refreshAreaNotesViews();
}

// ── 모니터링 리스트 페이지 내 탭 전환 ──────
let listTab='mon';
function setListTab(tab){
  listTab=tab;
  document.getElementById('lst-tab-mon-btn').classList.toggle('btn-red',tab==='mon');
  document.getElementById('lst-tab-note-btn').classList.toggle('btn-red',tab==='note');
  document.getElementById('list-tab-mon').style.display=tab==='mon'?'':'none';
  document.getElementById('list-tab-note').style.display=tab==='note'?'':'none';
  if(tab==='mon') renderList(); else renderAreaNotesList();
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
// 상태 필터: 전체('') / 모니터링 / 진행중(위반계열) / 완료(완료계열)
function applyStateFilter(arr,selId){
  const v=document.getElementById(selId)?.value;
  if(!v) return arr;
  if(v==='모니터링') return arr.filter(r=>r.item_state==='모니터링');
  if(v==='진행중') return arr.filter(r=>isViolState(r.item_state));
  if(v==='완료') return arr.filter(r=>isDoneState(r.item_state));
  return arr;
}

function renderHighMain(risks){
  const list=sortByRecent(applyStateFilter(risks,'high-state-filter'));
  document.getElementById('high-cnt').textContent=`총 ${list.length}건`;
  const b=document.getElementById('high-body-main');
  if(!list.length){b.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';stopHighRotate();return;}
  b.innerHTML=list.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${escapeHTML(r.title||'-')}</td><td>${stateBadge(r.item_state)}</td>
    </tr>`).join('');
  startHighRotate('high-ticker-main');
}

function renderHighDiv(risks){
  const list=sortByRecent(applyStateFilter(risks,'high-state-filter-div'));
  const el2=document.getElementById('high-cnt2');
  if(el2) el2.textContent=`총 ${list.length}건`;
  const b=document.getElementById('high-body-div');
  if(!list.length){b.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';stopHighRotate();return;}
  b.innerHTML=list.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.brands?.name||'-'}</td>
      <td>${escapeHTML(r.title||'-')}</td><td>${stateBadge(r.item_state)}</td>
    </tr>`).join('');
  startHighRotate('high-ticker-div');
}

// 영역뷰(측정판 옆) 최근 모니터링 현황 — renderHighMain/Div와 동일 패턴, 별도 ID로 렌더
function renderHighArea(risks){
  const list=sortByRecent(applyStateFilter(risks,'high-state-filter-area'));
  const cntEl=document.getElementById('high-cnt-area');
  if(cntEl) cntEl.textContent=`총 ${list.length}건`;
  const b=document.getElementById('high-body-area');
  if(!b) return;
  if(!list.length){b.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';stopHighRotate();return;}
  b.innerHTML=list.map(r=>`
    <tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${escapeHTML(r.title||'-')}</td><td>${stateBadge(r.item_state)}</td>
    </tr>`).join('');
  startHighRotate('high-ticker-area');
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

// ── 계열사별 현황 (메인뷰) — 법인별 위반/모니터링 가로 막대그래프 ──
let divBarChart=null;
function renderDivisionBarChart(risks){
  const canvas=document.getElementById('div-bar-chart');
  if(!canvas) return;
  const divs=allDiv.filter(d=>risks.some(r=>r.divisions?.id===d.id));
  const labels=divs.map(d=>d.name);
  const monData=divs.map(d=>sumCnt(risks.filter(r=>r.divisions?.id===d.id)));
  const violData=divs.map(d=>sumViol(risks.filter(r=>r.divisions?.id===d.id)));
  if(divBarChart) divBarChart.destroy();
  if(!labels.length){
    const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  divBarChart=new Chart(canvas,{
    type:'bar',
    data:{labels, datasets:[
      {label:'모니터링(전체)', data:monData, backgroundColor:'#c7d2e0', borderRadius:3},
      {label:'위반', data:violData, backgroundColor:'#c8102e', borderRadius:3}
    ]},
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      animation:{duration:900,easing:'easeOutQuart'},
      plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:10,padding:10}}},
      onClick:(evt,elements)=>{
        if(!elements.length) return;
        const d=divs[elements[0].index];
        if(d) setDiv(d.name, document.getElementById('div-'+d.name));
      },
      onHover:(evt,elements)=>{ evt.native.target.style.cursor=elements.length?'pointer':'default'; },
      scales:{
        x:{beginAtZero:true,grid:{color:'#f1f2f5'},ticks:{font:{size:10},precision:0}},
        y:{grid:{display:false},ticks:{font:{size:11}}}
      }
    }
  });
}

// ── 브랜드 카드 ────────────────────────────
function renderBrandGrid(risks){
  const dObj=allDiv.find(d=>d.name===activeDiv);
  const brands=visibleBrands(activeDiv?allBrands.filter(b=>b.division_id===dObj?.id):allBrands);
  // 타이틀: 전체뷰=계열사별 현황, 계열사뷰=브랜드별 현황
  document.getElementById('bg-label').textContent=activeDiv||'';
  const g=document.getElementById('brand-grid');
  let cards='';
  if(!activeDiv){
    // 전체뷰: 계열사별 집계 카드
    cards=allDiv.map(div=>{
      const items=risks.filter(r=>r.divisions?.id===div.id);
      if(!items.length) return '';
      const 위험=sumCnt(items.filter(r=>r.grade==='D'));
      const 주의=sumCnt(items.filter(r=>r.grade==='B'||r.grade==='C'));
      const 안전=sumCnt(items.filter(r=>r.grade==='A'));
      const t=sumCnt(items);
      const viol=sumViol(items);
      const mon=sumCnt(items);
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
    cards=brands.map((b,i)=>{
      const items=risks.filter(r=>r.brands?.id===b.id);
      if(!items.length) return '';
      const 위험=sumCnt(items.filter(r=>r.grade==='D'));
      const 주의=sumCnt(items.filter(r=>r.grade==='B'||r.grade==='C'));
      const 안전=sumCnt(items.filter(r=>r.grade==='A'));
      const t=sumCnt(items);
      const viol=sumViol(items);
      const mon=sumCnt(items);
      const rate=mon>0?Math.round(viol/mon*100):0;
      return `
        <div class="bc" style="animation-delay:${i*0.05}s">
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
  fillSel('lf-brand',visibleBrands(divId?allBrands.filter(b=>b.division_id==divId):allBrands),'전체 브랜드/조직');
  lPage=1; renderList();
}
// 영역 대분류 선택 시 해당 중분류만 채우기 (모니터링 리스트 필터)
function onLfCatChange(){
  const catId=document.getElementById('lf-cat').value;
  fillSel('lf-sub', catId?allSubs.filter(s=>s.category_id==catId):[], '전체 영역 중분류');
  lPage=1; renderList();
}
function getListRisks(){
  const div=document.getElementById('lf-div').value;
  const brand=document.getElementById('lf-brand').value;
  const cat=document.getElementById('lf-cat').value;
  const sub=document.getElementById('lf-sub').value;
  const grade=document.getElementById('lf-grade').value;
  const state=document.getElementById('lf-state').value;
  return allRisks.filter(r=>{
    if(div && r.divisions?.id!=div) return false;
    if(brand && r.brands?.id!=brand) return false;
    if(cat   && r.risk_categories?.id!=cat) return false;
    if(sub   && r.risk_subcategories?.id!=sub) return false;
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
    return `<tr onclick="openEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${r.risk_categories?.name||'-'}</td><td>${r.risk_subcategories?.name||'-'}</td>
      <td>${escapeHTML(r.title||'-')}</td>
      <td>${stateBadge(r.item_state)}</td>
      <td style="text-align:center;font-weight:600">${rowCnt(r)}</td>
      <td class="td-clip">${escapeHTML(r.status||'-')}</td>
      <td class="td-clip">${escapeHTML(r.note||'-')}</td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();openEdit('${r.id}')">수정</button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="11" style="text-align:center;color:var(--text3);padding:24px;font-size:12px">조건에 맞는 데이터 없음</td></tr>';
  document.getElementById('pgn').innerHTML=buildPagination(lPage,tp);
}

// 페이지네이션: 처음/끝 + 현재 주변 + 이전/다음
function buildPagination(cur,tp,onclickFn){
  if(tp<=1) return '';
  const mkOnclick=onclickFn||(page=>`lPage=${page};renderList()`);
  const btn=(label,page,opts={})=>{
    const cls=[opts.cls||'',page===cur?'on':''].filter(Boolean).join(' ');
    const dis=opts.disabled?' disabled':'';
    const ck=opts.disabled?'':`onclick="${mkOnclick(page)}"`;
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
function drillDown(divId,catId,brandId){
  showPage('list',null);
  document.getElementById('lf-div').value=divId;
  document.getElementById('lf-cat').value=catId;
  fillSel('lf-sub', catId?allSubs.filter(s=>s.category_id==catId):[], '전체 영역 중분류');
  onLfDivChange();
  if(brandId){ document.getElementById('lf-brand').value=brandId; lPage=1; renderList(); }
}

// ── 페이지 전환 ─────────────────────────────
function showPage(name,btn){
  currentPage=name;
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
  if(name==='list') setListTab(listTab);
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
      <td style="white-space:nowrap">
        <button class="btn btn-red btn-sm" onclick="approveUser('${p.id}')">승인</button>
        <button class="btn btn-sm" style="margin-left:6px" onclick="deleteUser('${p.id}')">삭제</button>
      </td>
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

async function deleteUser(uid){
  if(!confirm('이 가입 요청을 거절하고 삭제하시겠습니까?\n목록에서 완전히 제거되며, 본인이 원하면 나중에 다시 가입 요청할 수 있습니다.')) return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ showToast('세션이 만료되었습니다. 다시 로그인해주세요.'); return; }
  try{
    const res=await fetch(`${SUPABASE_URL}/functions/v1/delete-user`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`,
        'apikey':SUPABASE_ANON_KEY
      },
      body:JSON.stringify({ userId:uid })
    });
    const out=await res.json().catch(()=>({}));
    if(!res.ok){ showToast('삭제 실패: '+(out.error||('HTTP '+res.status))); return; }
    showToast('삭제(거절) 완료');
    renderAdmin();
  }catch(e){
    showToast('삭제 오류: '+(e.message||e));
  }
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
  const accV = sumViol(base);
  const monV = sumViol(prevMonth);
  const done = sumViol(base.filter(r=>r.item_state==='완료'));
  const open = sumViol(base.filter(r=>r.item_state==='위반'));
  const doneRate = (done+open)>0 ? Math.round(done/(done+open)*100) : 0;
  const pct = (n,d)=>d>0?Math.round(n/d*100):0;

  const L = [];
  L.push(`[기준일] ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
  L.push(`[분석 대상] ${divFilter||'그룹 전체'}`);
  L.push('');
  L.push('[전체 KPI]');
  L.push(`- 누적 모니터링: ${sumCnt(base)}건 (위반 ${accV}건, ${pct(accV,sumCnt(base))}%)`);
  L.push(`- 전월(${prevY}-${String(prevM+1).padStart(2,'0')}) 모니터링: ${sumCnt(prevMonth)}건 (위반 ${monV}건, ${pct(monV,sumCnt(prevMonth))}%)`);
  L.push(`- 처리 완료율: ${doneRate}% (완료 ${done} / 위반 처리중 ${open})`);
  L.push(`- 조치중(위반 진행): ${open}건`);
  L.push('');

  // 계열사별
  if(!divFilter){
    L.push('[계열사별 (연누적) — 전체/위반]');
    allDiv.forEach(d=>{
      const it = base.filter(r=>r.divisions?.id===d.id);
      if(!it.length) return;
      const v = sumViol(it);
      L.push(`- ${d.name}: ${sumCnt(it)}/${v}`);
    });
    L.push('');
  }

  // 8대 리스크 카테고리
  L.push('[8대 리스크 카테고리별 (연누적) — 전체/위반]');
  allCats.forEach(c=>{
    const it = base.filter(r=>r.risk_categories?.id===c.id);
    const v = sumViol(it);
    L.push(`- ${c.name}: ${sumCnt(it)}/${v}`);
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
        row.push(String(sumViol(cell)));
      });
      L.push(row.join(' | '));
    });
    L.push('');
  }

  // 등급 분포
  const gA=sumCnt(base.filter(r=>r.grade==='A'));
  const gB=sumCnt(base.filter(r=>r.grade==='B'));
  const gC=sumCnt(base.filter(r=>r.grade==='C'));
  const gD=sumCnt(base.filter(r=>r.grade==='D'));
  L.push('[현재 등급 분포]');
  L.push(`- A(우수): ${gA}건 / B(양호): ${gB}건 / C(주의): ${gC}건 / D(위험): ${gD}건`);
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
    const v = sumViol(mn);
    L.push(`- ${y}-${String(m+1).padStart(2,'0')}: ${sumCnt(mn)}(${v})`);
  }
  L.push('');

  // D(위험) 등급 항목 샘플 (최근 10건)
  const hi = base.filter(r=>r.grade==='D')
    .sort((a,b)=>(b.registered_at||'').localeCompare(a.registered_at||''))
    .slice(0,10);
  if(hi.length){
    L.push('[D(위험) 등급 항목 (최근 10건)]');
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
    // 스트리밍(SSE) 응답을 실시간으로 받아 화면에 흐르게 표시
    resEl.innerHTML = '<div class="ai-md"></div>';
    const mdEl = resEl.querySelector('.ai-md');
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf='', md='', model='', inTok=0, outTok=0, lastRender=0;
    const render = ()=>{ mdEl.innerHTML = (typeof marked!=='undefined') ? marked.parse(md) : md.replace(/\n/g,'<br>'); };
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      buf += decoder.decode(value, {stream:true});
      const lines = buf.split('\n');
      buf = lines.pop();  // 마지막 미완성 줄은 다음 청크와 합치려고 보관
      for(const line of lines){
        const t=line.trim();
        if(!t.startsWith('data:')) continue;
        const payload=t.slice(5).trim();
        if(!payload || payload==='[DONE]') continue;
        let ev; try{ ev=JSON.parse(payload); }catch{ continue; }
        if(ev.type==='content_block_delta' && ev.delta?.type==='text_delta'){
          md += ev.delta.text;
          const now=Date.now();
          if(now-lastRender>60){ render(); lastRender=now; }  // 60ms마다만 다시 그려 부드럽게
        } else if(ev.type==='message_start'){
          model = ev.message?.model || model;
          inTok = ev.message?.usage?.input_tokens || inTok;
        } else if(ev.type==='message_delta'){
          outTok = ev.usage?.output_tokens || outTok;
        } else if(ev.type==='error'){
          md += `\n\n_(오류: ${ev.error?.message||'알 수 없음'})_`;
        }
      }
    }
    render();  // 남은 내용 마지막으로 한 번 더 반영
    if(!md.trim()) mdEl.innerHTML = '(빈 응답)';
    if(inTok||outTok){
      document.getElementById('ai-meta').textContent = `토큰 ${(inTok+outTok).toLocaleString()} · ${model}`;
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
  document.querySelectorAll(`[id^="${prefix}s-"]`).forEach(el=>{
    const s=el.id.slice(prefix.length+2);
    el.className='state-opt'+(s===val?' sel-'+stateClass(val):'');
  });
  // 조치사항 텍스트박스: 위반/완료 계열에서만 활성화
  const atEl=document.getElementById(prefix+'-action-text');
  if(atEl){
    const active=isViolState(val)||isDoneState(val);
    atEl.disabled=!active;
    atEl.placeholder=active?'조치사항을 입력하세요':'위반 또는 완료 상태일 때 입력 가능합니다';
  }
  if(prefix==='p'){
    const lb=document.getElementById('p-cnt-lb');
    if(lb) lb.textContent=(val?val+' 건수':'건수')+' *';
  }
}

// ── 데이터 입력 ─────────────────────────────
async function onPDiv(){
  const divId=document.getElementById('p-div').value;
  const brands=visibleBrands(divId?allBrands.filter(b=>b.division_id==divId):[]);
  const el=document.getElementById('p-brand');
  el.innerHTML='<option value="">선택 안 함</option>';
  brands.forEach(b=>{el.innerHTML+=`<option value="${b.id}">${b.name}</option>`;});
  // 브랜드가 초기화되므로 매장 드롭다운도 초기화
  onPBrand();
  // 선택한 계열사의 최근 입력 내역 표시
  inlineEditId=null;
  renderRecentBody();
}
function onPBrand(){
  const divId=document.getElementById('p-div').value;
  const brandId=document.getElementById('p-brand').value;
  const divObj=allDiv.find(d=>d.id==divId);
  const brandObj=allBrands.find(b=>b.id==brandId);
  toggleStoreDropdown('p',divObj,brandObj,divId);
}
// 매장(소분류)은 '유통' + '리테일' 조합에서만 노출
function toggleStoreDropdown(prefix, divObj, brandObj, divId){
  const wrap=document.getElementById(`${prefix}-store-wrap`);
  const sel=document.getElementById(`${prefix}-store`);
  if(!wrap||!sel) return;
  if(divObj?.name==='유통' && brandObj?.name==='리테일'){
    const stores=allStores.filter(s=>s.division_id==divId);
    sel.innerHTML='<option value="">선택 (선택사항)</option>'+stores.map(s=>`<option value="${s.id}">${storeDisplayName(s.name)}</option>`).join('');
    wrap.classList.remove('hidden-fg');
  } else {
    sel.innerHTML='<option value="">선택 (선택사항)</option>';
    sel.value='';
    wrap.classList.add('hidden-fg');
  }
}
function onPCat(){
  const catId=document.getElementById('p-cat').value;
  const subs=allSubs.filter(s=>s.category_id==catId);
  const el=document.getElementById('p-sub');
  el.innerHTML='<option value="">없음</option>';
  subs.forEach(s=>{el.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
  const catName=(allCats.find(c=>c.id==catId)||{}).name||'';
  fillViolationTypeSel('p', catName);
  renderStateButtons('p', catName);
  toggleAmountField('p', catName, '');
  // 영역 바꾸면 상태·조치사항 초기화
  document.getElementById('p-state').value='';
  const atEl=document.getElementById('p-action-text');
  if(atEl){atEl.disabled=true;atEl.placeholder='위반 또는 완료 상태일 때 입력 가능합니다';}
  toggleAuditFields('p', catName);
}
function resetInput(){
  ['p-div','p-brand','p-cat','p-sub','p-store'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  fillViolationTypeSel('p','');
  ['p-title','p-note'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  document.getElementById('p-cnt').value='';
  document.getElementById('p-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('p-brand').innerHTML='<option value="">계열사 먼저 선택</option>';
  document.getElementById('p-sub').innerHTML='<option value="">없음</option>';
  const psw=document.getElementById('p-store-wrap'); if(psw) psw.classList.add('hidden-fg');
  // 조치사항 초기화
  const at=document.getElementById('p-action-text');
  if(at){at.value='';at.disabled=true;at.placeholder='위반 또는 완료 상태일 때 입력 가능합니다';}
  // 감사 전용 필드 초기화
  ['p-discipline-type','p-discipline-name','p-sentence'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  document.querySelectorAll('.audit-field-p').forEach(el=>el.classList.add('hidden-fg'));
  // 부실채권 금액 필드 초기화
  const pAmt=document.getElementById('p-amount'); if(pAmt) pAmt.value='';
  document.querySelectorAll('.amount-field-p').forEach(el=>el.classList.add('hidden-fg'));
  // 외부노출 여부 초기화
  const pExt=document.getElementById('p-external'); if(pExt) pExt.checked=false;
  // 상태 초기화 (기본 3버튼 복원)
  document.getElementById('p-state').value='';
  renderStateButtons('p','');
  const cntLb=document.getElementById('p-cnt-lb'); if(cntLb) cntLb.textContent='건수 *';
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
  const note=document.getElementById('p-note').value.trim();
  const cnt=document.getElementById('p-cnt').value;
  const vtElP=document.getElementById('p-violation-type');
  const violationType=vtElP?.value||null;
  const actionText=document.getElementById('p-action-text')?.value.trim()||null;
  const disciplineType=document.getElementById('p-discipline-type')?.value||null;
  const disciplineName=document.getElementById('p-discipline-name')?.value.trim()||null;
  const sentence=document.getElementById('p-sentence')?.value.trim()||null;
  const amountStr=document.getElementById('p-amount')?.value ?? '';
  const externalExposure=document.getElementById('p-external')?.checked||false;
  if(!divId||!catId||!state||!date||!title||cnt===''){showToast('필수 항목(*)을 모두 입력해주세요 (건수 포함)');return;}
  if(vtElP && vtElP.options.length>1 && !violationType){showToast('위반유형을 선택해주세요');return;}
  const catNameP=(allCats.find(c=>c.id==catId)||{}).name||'';
  if(catNameP==='감사' && (!disciplineType||!disciplineName||!sentence)){showToast('감사 영역은 징계유형·대상자·양형/처분을 모두 입력해주세요');return;}
  const amountNeededP=catNameP==='부실채권' && AMOUNT_REQUIRED_TYPES.includes(violationType);
  if(amountNeededP && amountStr===''){showToast('금액을 입력해주세요');return;}
  const amount=amountNeededP?parseInt(amountStr):null;
  const cntVal=parseInt(cnt);
  const btn=document.getElementById('p-save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  const {error}=await sb.from('risks').insert({
    division_id:parseInt(divId),brand_id:brandId?parseInt(brandId):null,category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,
    store_id:storeId?parseInt(storeId):null,
    grade:'안전',item_state:state,registered_at:date,title,
    status:actionText,note:note||null,
    violation_count:state==='모니터링'?null:cntVal,
    monitoring_count:state==='모니터링'?cntVal:null,
    violation_type:violationType||null,
    discipline_type:disciplineType,discipline_name:disciplineName,sentence,
    amount, external_exposure:externalExposure
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
const DISCIPLINE_TYPES=['금전회수','경징계','중징계','형사고발'];
// 조치구분/대상자·양형/처분/조치내용을 하나의 조치사항 텍스트로 합성
function buildActionStatus(actType, entries, other){
  if(actType==='징계'){
    const names=(entries||[]).filter(e=>e.name).map(e=>e.penalty?`${e.name}(${e.penalty})`:e.name);
    return names.length?`[징계] ${names.join(', ')}`:null;
  }
  if(actType==='징계 외') return other?`[조치] ${other}`:null;
  return other||null;
}

async function downloadBulkTemplate(){
  if(!window.ExcelJS){ showToast('엑셀 라이브러리 로딩 중. 잠시 후 다시 시도해주세요.'); return; }
  if(!allDiv.length||!allBrands.length||!allCats.length){
    showToast('기준 데이터(계열사/브랜드/영역 대분류)가 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.'); return;
  }
  const wb=new ExcelJS.Workbook();
  wb.creator='이랜드 그룹 리스크 관리 시스템';
  wb.created=new Date();

  // 1) 입력 시트
  const ws=wb.addWorksheet('입력',{views:[{state:'frozen',ySplit:1}]});
  ws.columns=[
    {header:'등록일(YYYY-MM-DD) *',key:'date',width:22},
    {header:'계열사 *',key:'div',width:14},
    {header:'브랜드/조직',key:'brand',width:22},
    {header:'영역 대분류 *',key:'cat',width:20},
    {header:'영역 중분류',key:'sub',width:24},
    {header:'리스크명 *',key:'title',width:36},
    {header:'상태 *',key:'state',width:12},
    {header:'건수 *',key:'cnt',width:10},
    {header:'조치구분(징계/징계 외)',key:'actType',width:22},
    {header:'대상자(징계 시/감사 시 필수)',key:'actName',width:18},
    {header:'양형/처분(징계 시/감사 시 필수)',key:'actPen',width:20},
    {header:'조치내용(징계 외 시)',key:'actOther',width:30},
    {header:'위반유형',key:'vtype',width:26},
    {header:'금액(부실채권 미입금/부실채권 시 필수)',key:'amount',width:32},
    {header:'징계유형(감사 시 필수)',key:'discType',width:22},
    {header:'외부노출 여부(O 또는 공란)',key:'external',width:20},
    {header:'매장(유통-리테일 전용)',key:'store',width:22},
    {header:'비고',key:'note',width:30}
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
  // B열: 영역 대분류 목록
  ref.getCell('B1').value='__영역 대분류__';
  allCats.forEach((c,i)=>{ ref.getCell(`B${i+2}`).value=c.name; });
  // C열: 상태
  ref.getCell('C1').value='__상태__';
  ['모니터링','위반','완료'].forEach((s,i)=>{ ref.getCell(`C${i+2}`).value=s; });
  // D열: 조치구분
  ref.getCell('D1').value='__조치구분__';
  ['징계','징계 외'].forEach((s,i)=>{ ref.getCell(`D${i+2}`).value=s; });

  wb.definedNames.add(`_참조!$A$2:$A$${allDiv.length+1}`,'_divs');
  wb.definedNames.add(`_참조!$B$2:$B$${allCats.length+1}`,'_cats');
  wb.definedNames.add(`_참조!$C$2:$C$4`,'_states');
  wb.definedNames.add(`_참조!$D$2:$D$3`,'_actions');

  // 각 계열사의 브랜드, 각 영역 대분류의 영역 중분류를 가로로 배치
  let col=5; // E열부터
  allDiv.forEach(div=>{
    const brands=visibleBrands(allBrands.filter(b=>b.division_id===div.id));
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
  // 영역 대분류별 위반유형 목록(그룹 구분 없이 평탄화). 위반유형이 없는 대분류(예: IP)는
  // 빈 칸 하나를 가리키는 이름을 만들어준다 — 그래야 INDIRECT가 참조 오류 없이 빈 목록으로 뜬다.
  const blankL=colToLetter(col); col++;
  ref.getCell(`${blankL}1`).value='__빈값__';
  const blankRange=`_참조!$${blankL}$2:$${blankL}$2`;
  allCats.forEach(cat=>{
    const types=flatViolationTypes(cat.name);
    if(types.length===0){
      wb.definedNames.add(blankRange,`_v_${sanitizeName(cat.name)}`);
      return;
    }
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value=cat.name;
    types.forEach((t,i)=>{ ref.getCell(`${L}${i+2}`).value=t; });
    wb.definedNames.add(`_참조!$${L}$2:$${L}$${types.length+1}`,`_v_${sanitizeName(cat.name)}`);
    col++;
  });
  // 징계유형 목록 (감사 영역 전용)
  {
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value='__징계유형__';
    DISCIPLINE_TYPES.forEach((s,i)=>{ ref.getCell(`${L}${i+2}`).value=s; });
    wb.definedNames.add(`_참조!$${L}$2:$${L}$${DISCIPLINE_TYPES.length+1}`,'_disctypes');
    col++;
  }
  // 영역 대분류별 상태 옵션(부실채권=발생/해결, 감사=적발/조치완료, 중대재해=발생/조치완료, 그 외=모니터링/위반/완료)
  allCats.forEach(cat=>{
    const states=getCatStates(cat.name);
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value=cat.name;
    states.forEach((s,i)=>{ ref.getCell(`${L}${i+2}`).value=s; });
    wb.definedNames.add(`_참조!$${L}$2:$${L}$${states.length+1}`,`_st_${sanitizeName(cat.name)}`);
    col++;
  });
  // 외부노출 여부 목록
  {
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value='__외부노출__';
    ref.getCell(`${L}2`).value='O';
    wb.definedNames.add(`_참조!$${L}$2:$${L}$2`,'_external');
    col++;
  }
  // 매장 목록 ('유통' 계열사 소속 매장 전체 — 브랜드가 '리테일'일 때만 입력)
  {
    const distDiv=allDiv.find(d=>d.name==='유통');
    const stores=distDiv?allStores.filter(s=>s.division_id===distDiv.id):[];
    const L=colToLetter(col);
    ref.getCell(`${L}1`).value='__매장__';
    if(stores.length){
      stores.forEach((s,i)=>{ ref.getCell(`${L}${i+2}`).value=s.name; });
      wb.definedNames.add(`_참조!$${L}$2:$${L}$${stores.length+1}`,'_stores');
    } else {
      wb.definedNames.add(blankRange,'_stores');
    }
    col++;
  }

  // 3) 입력 시트에 데이터 검증 적용 (행 2 ~ 501)
  // 주의: 계열사/대분류/조치구분/징계유형/외부노출처럼 모든 행에 동일한 목록이 적용되는 컬럼은
  // 반드시 worksheet.dataValidations.add()로 "범위 전체"에 한 번만 등록해야 한다.
  // 셀 단위로 500번 반복 설정(cell.dataValidation=...)하면 ExcelJS가 내부적으로
  // 주소를 문자열 순으로 정렬해 인접 범위를 병합하는 과정에서(행이 10 이상일 때) 겹치는 두 개의
  // sqref 범위를 만들어내는 버그가 있고, 이 중복/중첩 범위는 실제 Excel에서 파일 손상으로 인식되어
  // 열 때 "복구" 후 해당 시트의 데이터 유효성 검사가 통째로 사라지는 원인이 된다(= 모든 값이 다 나오는 것처럼 보임).
  // 또한 formulae 문자열 앞에 '=' 를 붙이면 안 된다(수식 텍스트 자체에 '='가 들어가 깨짐).
  const ROWS=500;
  const lastR=ROWS+1;
  ws.dataValidations.add(`B2:B${lastR}`, {type:'list',allowBlank:true,formulae:['_divs'],showErrorMessage:true,errorTitle:'잘못된 값',error:'드롭다운에서 선택하세요.'});
  ws.dataValidations.add(`D2:D${lastR}`, {type:'list',allowBlank:true,formulae:['_cats']});
  ws.dataValidations.add(`I2:I${lastR}`, {type:'list',allowBlank:true,formulae:['_actions']});
  ws.dataValidations.add(`O2:O${lastR}`, {type:'list',allowBlank:true,formulae:['_disctypes']});
  ws.dataValidations.add(`P2:P${lastR}`, {type:'list',allowBlank:true,formulae:['_external']});
  ws.dataValidations.add(`Q2:Q${lastR}`, {type:'list',allowBlank:true,formulae:['_stores']});
  for(let r=2; r<=ROWS+1; r++){
    ws.getCell(`A${r}`).numFmt='yyyy-mm-dd';
    ws.getCell(`C${r}`).dataValidation={type:'list',allowBlank:true,formulae:[`INDIRECT("_b_"&SUBSTITUTE(B${r}," ","_"))`]};
    ws.getCell(`E${r}`).dataValidation={type:'list',allowBlank:true,formulae:[`INDIRECT("_s_"&SUBSTITUTE(D${r}," ","_"))`]};
    ws.getCell(`G${r}`).dataValidation={type:'list',allowBlank:true,formulae:[`INDIRECT("_st_"&SUBSTITUTE(D${r}," ","_"))`]};
    ws.getCell(`M${r}`).dataValidation={type:'list',allowBlank:true,formulae:[`INDIRECT("_v_"&SUBSTITUTE(D${r}," ","_"))`]};
  }

  // 4) 안내 시트
  const guide=wb.addWorksheet('안내');
  guide.getColumn(1).width=80;
  const lines=[
    '[일괄 업로드 사용 안내]',
    '',
    '1. \'입력\' 시트 2행부터 데이터를 입력하세요.',
    '2. 별표(*) 표시 컬럼은 필수입니다. (건수 포함)',
    '3. 계열사 / 브랜드 / 영역 대분류 / 영역 중분류 / 상태 / 조치구분 / 위반유형 / 징계유형은 드롭다운에서 선택하세요.',
    '4. 브랜드는 계열사를, 영역 중분류·위반유형·상태는 영역 대분류를 먼저 선택하면 자동 필터됩니다(대분류를 먼저 선택하지 않으면 목록이 비어 있습니다).',
    '4-1. 위반유형은 영역 대분류에 목록이 있으면 필수입니다. 단 \'IP\'는 위반유형 목록이 없어 선택하지 않습니다(공란으로 두세요).',
    '5. 등록일은 YYYY-MM-DD 형식 (예: 2026-05-29).',
    '6. 건수는 0 이상 숫자로 입력하세요. (상태가 모니터링/발생/적발이면 모니터링 건수, 위반/완료/해결/조치완료면 위반 건수로 집계)',
    '6-1. 상태 옵션은 영역마다 다릅니다 — 부실채권: 발생/해결, 감사: 적발/조치완료, 중대재해: 발생/조치완료, 그 외 영역: 모니터링/위반/완료.',
    '7. 영역 대분류가 \'감사\'이면 징계유형·대상자·양형/처분이 모두 필수입니다. 조치구분·조치내용은 일반 조치사항 기록용(선택 입력)입니다.',
    '8. 금액: 영역 대분류가 \'부실채권\'이고 위반유형이 \'미입금\' 또는 \'부실채권\'이면 금액이 필수입니다.',
    '9. 외부노출 여부: 해당 건이 외부에 노출됐으면 O를 입력하세요(공란=미노출). 컴플라이언스 분류(불법파견/공정거래/영업비밀/IP)에서는 이 값이 F등급 산정에 사용됩니다.',
    '10. 매장: 계열사가 \'유통\', 브랜드/조직이 \'리테일\'인 경우에만 입력하세요(선택사항). 드롭다운에서 선택하며, 그 외 계열사/브랜드 조합에서는 공란으로 두세요.',
    '11. 비고: 자유 입력(선택사항)입니다.',
    '12. 등급(A/B/C/D/F)은 시스템이 자동 산정합니다 — 입력하지 마세요.',
    '13. 작성 후 저장하고, \'엑셀 업로드\' 버튼으로 업로드하세요.',
    '14. 업로드 전에 검증 결과(오류 행 안내)를 확인할 수 있습니다.'
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
      else if(t.startsWith('영역 대분류')) colMap.cat=colNumber;
      else if(t.startsWith('영역 중분류')) colMap.sub=colNumber;
      else if(t.startsWith('리스크명')) colMap.title=colNumber;
      else if(t.startsWith('상태')) colMap.state=colNumber;
      else if(t.startsWith('건수')) colMap.cnt=colNumber;
      else if(t.startsWith('조치구분')) colMap.actType=colNumber;
      else if(t.startsWith('대상자')) colMap.actName=colNumber;
      else if(t.startsWith('양형')) colMap.actPen=colNumber;
      else if(t.startsWith('조치내용')) colMap.actOther=colNumber;
      else if(t.startsWith('위반유형')) colMap.vtype=colNumber;
      else if(t.startsWith('금액')) colMap.amount=colNumber;
      else if(t.startsWith('징계유형')) colMap.discType=colNumber;
      else if(t.startsWith('외부노출')) colMap.external=colNumber;
      else if(t.startsWith('매장')) colMap.store=colNumber;
      else if(t.startsWith('비고')) colMap.note=colNumber;
    });
    const missing=['date','div','brand','cat','title','state','cnt'].filter(k=>!colMap[k]);
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
      const cntStr=colMap.cnt?String(row.getCell(colMap.cnt).value??'').trim():'';
      const actType=colMap.actType?String(row.getCell(colMap.actType).value||'').trim():'';
      const actName=colMap.actName?String(row.getCell(colMap.actName).value||'').trim():'';
      const actPen=colMap.actPen?String(row.getCell(colMap.actPen).value||'').trim():'';
      const actOther=colMap.actOther?String(row.getCell(colMap.actOther).value||'').trim():'';
      const vtype=colMap.vtype?String(row.getCell(colMap.vtype).value||'').trim():'';
      const amountStr=colMap.amount?String(row.getCell(colMap.amount).value??'').trim():'';
      const discType=colMap.discType?String(row.getCell(colMap.discType).value||'').trim():'';
      const externalStr=colMap.external?String(row.getCell(colMap.external).value||'').trim():'';
      const storeName=colMap.store?String(row.getCell(colMap.store).value||'').trim():'';
      const noteStr=colMap.note?String(row.getCell(colMap.note).value||'').trim():'';

      // 전부 비어있으면 skip
      if(!dateCell&&!divName&&!brandName&&!catName&&!title&&!state&&!cntStr) continue;

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
      // 브랜드는 선택사항 — 비어 있으면 통과, 값이 있으면 계열사에 속하는지만 검증
      if(brandName && divObj){
        brandObj=allBrands.find(b=>b.division_id===divObj.id&&b.name===brandName);
        if(!brandObj) errs.push(`브랜드 '${brandName}'는 '${divName}'에 속하지 않음`);
      }

      // 매장 — '유통' + '리테일' 조합에서만 입력 가능(선택사항)
      let storeObj=null;
      if(storeName){
        if(divObj?.name==='유통' && brandObj?.name==='리테일'){
          storeObj=allStores.find(s=>s.division_id===divObj.id&&s.name===storeName);
          if(!storeObj) errs.push(`매장 '${storeName}'을 찾을 수 없음`);
        } else {
          errs.push("매장은 계열사 '유통' + 브랜드 '리테일' 조합에서만 입력 가능");
        }
      }

      const catObj=allCats.find(c=>c.name===catName);
      if(!catName) errs.push('영역 대분류 누락');
      else if(!catObj) errs.push(`영역 대분류 '${catName}' 없음`);

      let subObj=null;
      if(subName&&catObj){
        subObj=allSubs.find(s=>s.category_id===catObj.id&&s.name===subName);
        if(!subObj) errs.push(`영역 중분류 '${subName}'는 '${catName}'에 속하지 않음`);
      }

      if(!title) errs.push('리스크명 누락');
      const validStates=getCatStates(catObj?.name);
      if(!validStates.includes(state)) errs.push(`상태는 ${validStates.join('/')} 중 하나`);

      // 건수(필수)
      let cntVal=null;
      if(cntStr==='') errs.push('건수 누락');
      else if(isNaN(Number(cntStr))||Number(cntStr)<0) errs.push('건수는 0 이상 숫자');
      else cntVal=parseInt(cntStr);

      // 조치구분(선택) — 값이 있으면 징계/징계 외만 허용
      if(actType&&!['징계','징계 외'].includes(actType)) errs.push("조치구분은 '징계' 또는 '징계 외'");

      // 감사 영역: 징계유형·대상자·양형/처분 모두 필수
      if(catObj?.name==='감사' && (!discType||!actName||!actPen)) errs.push('감사 영역은 징계유형·대상자·양형/처분을 모두 입력해야 함');
      if(discType && !DISCIPLINE_TYPES.includes(discType)) errs.push('징계유형은 금전회수/경징계/중징계/형사고발 중 하나');

      // 위반유형 — 해당 영역 대분류에 목록이 있으면 필수(단일 입력 화면과 동일), IP처럼 목록이 없으면 선택 자체가 없어야 함
      if(catObj){
        const allowed=flatViolationTypes(catObj.name);
        if(allowed.length){
          if(!vtype) errs.push('위반유형을 선택해야 함');
          else if(!allowed.includes(vtype)) errs.push(`위반유형 '${vtype}'는 '${catName}'에 속하지 않음`);
        } else if(vtype){
          errs.push(`'${catName}' 영역은 위반유형을 선택하지 않음`);
        }
      }

      // 금액 — 부실채권 + 미입금/부실채권이면 필수
      let amountVal=null;
      const amountNeeded=catObj?.name==='부실채권' && AMOUNT_REQUIRED_TYPES.includes(vtype);
      if(amountNeeded){
        if(amountStr==='') errs.push('금액 누락(부실채권 미입금/부실채권)');
        else if(isNaN(Number(amountStr))||Number(amountStr)<0) errs.push('금액은 0 이상 숫자');
        else amountVal=parseInt(amountStr);
      } else if(amountStr!==''){
        amountVal=isNaN(Number(amountStr))?null:parseInt(amountStr);
      }

      // 외부노출 여부 — 'O'만 노출로 인정, 그 외(공란 등)는 미노출
      const externalExposure=externalStr.toUpperCase()==='O';

      if(errs.length){
        errors.push({row:r, msgs:errs});
      } else {
        rows.push({
          division_id:divObj.id, brand_id:brandObj?brandObj.id:null, category_id:catObj.id,
          subcategory_id:subObj?subObj.id:null,
          store_id:storeObj?storeObj.id:null,
          grade:'안전', item_state:state, registered_at:dateStr, title,
          status:buildActionStatus(actType,[{name:actName,penalty:actPen}],actOther), note:noteStr||null,
          violation_count:state==='모니터링'?null:cntVal,
          monitoring_count:state==='모니터링'?cntVal:null,
          violation_type:vtype||null,
          discipline_type:discType||null, discipline_name:actName||null, sentence:actPen||null,
          amount:amountVal,
          external_exposure:externalExposure
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

// ── 인라인 수정 (최근 입력 내역) ─────────────────
let inlineEditId=null;

function renderRecentBody(){
  const card=document.getElementById('recent-card');
  const selDivId=document.getElementById('p-div')?.value;
  if(!card) return;
  if(!selDivId){
    // 계열사 미선택 시 카드 자체 숨김
    card.style.display='none';
    inlineEditId=null;
    return;
  }
  card.style.display='';
  const divIdNum=parseInt(selDivId);
  const divObj=allDiv.find(d=>d.id===divIdNum);
  const hint=document.getElementById('recent-hint');
  if(hint) hint.textContent=`${divObj?.name||''} 최근 10건`;

  const filtered=allRisks.filter(r=>r.divisions?.id===divIdNum).slice(0,10);
  const b=document.getElementById('recent-body');
  if(!filtered.length){
    b.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px;font-size:12px">데이터 없음</td></tr>';
    return;
  }
  let html='';
  filtered.forEach(r=>{
    const isEd=inlineEditId===r.id;
    html+=`<tr class="${isEd?'ier-active':''}" onclick="startInlineEdit('${r.id}')">
      <td style="white-space:nowrap">${fmtD(r.registered_at)}</td>
      <td>${r.divisions?.name||'-'}</td><td>${r.brands?.name||'-'}</td>
      <td>${escapeHTML(r.title||'')}</td>
      <td>${stateBadge(r.item_state)}</td>
      <td style="text-align:center;font-weight:600">${rowCnt(r)}</td>
      <td>${gradeBadge(r.grade)}</td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();startInlineEdit('${r.id}')">${isEd?'닫기':'수정'}</button></td>
    </tr>`;
    if(isEd) html+=buildInlineEditRow(r);
  });
  b.innerHTML=html;
}

function buildInlineEditRow(r){
  const curState=r.item_state||'';
  const subs=allSubs.filter(s=>s.category_id===r.risk_categories?.id);
  let brands=visibleBrands(allBrands.filter(b=>b.division_id===r.divisions?.id));
  // 기존에 '기타'로 등록된 리스크를 열었을 때 브랜드가 비워지지 않도록 현재 값은 목록에 유지
  if(r.brands?.id && !brands.some(b=>b.id===r.brands.id)) brands=[...brands, r.brands];
  const showStore=r.divisions?.name==='유통' && r.brands?.name==='리테일';
  const stores=showStore?allStores.filter(s=>s.division_id===r.divisions?.id):[];
  const curStoreId=r.store_id||'';
  const ieCatName=(allCats.find(c=>c.id===r.risk_categories?.id)||{}).name||'';
  const ieVT=r.violation_type||'';
  const ieStates=getCatStates(ieCatName);
  const isAudit=ieCatName==='감사';
  const needAmount=ieCatName==='부실채권' && AMOUNT_REQUIRED_TYPES.includes(ieVT);
  return `<tr class="ier-row"><td colspan="8">
    <div class="ier-form">
      <div class="fg">
        <label class="flb">계열사 *</label>
        <select class="fc" id="ie-div" onchange="onIEDiv()">
          ${allDiv.map(d=>`<option value="${d.id}" ${d.id===r.divisions?.id?'selected':''}>${d.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label class="flb">브랜드/조직</label>
        <select class="fc" id="ie-brand" onchange="onIEBrand()">
          <option value="">선택 안 함</option>
          ${brands.map(b=>`<option value="${b.id}" ${b.id===r.brands?.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg ${showStore?'':'hidden-fg'}" id="ie-store-wrap">
        <label class="flb">매장 (유통 전용)</label>
        <select class="fc" id="ie-store">
          <option value="">선택 (선택사항)</option>
          ${stores.map(s=>`<option value="${s.id}" ${s.id==curStoreId?'selected':''}>${storeDisplayName(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label class="flb">등록일 *</label>
        <input type="date" class="fc" id="ie-date" value="${r.registered_at||''}">
      </div>
      <div class="fg">
        <label class="flb">영역 대분류 *</label>
        <select class="fc" id="ie-cat" onchange="onIECat()">
          <option value="">선택</option>
          ${allCats.map(c=>`<option value="${c.id}" ${c.id===r.risk_categories?.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg">
        <label class="flb">영역 중분류</label>
        <select class="fc" id="ie-sub">
          <option value="">없음</option>
          ${subs.map(s=>`<option value="${s.id}" ${s.id===r.risk_subcategories?.id?'selected':''}>${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg full">
        <label class="flb">상태 *</label>
        <div class="fc-state" id="ies-wrap">
          ${ieStates.map(s=>`<button type="button" class="state-opt${s===curState?' sel-'+stateClass(s):''}" id="ies-${s}" onclick="selectState('ie','${s}')">${s}</button>`).join('')}
        </div>
        <input type="hidden" id="ie-state" value="${curState}">
      </div>
      <div class="fg"><label class="flb">건수 *</label><input type="number" class="fc" id="ie-cnt" value="${r.monitoring_count??r.violation_count??''}" min="0"></div>
      <div class="fg full"><label class="flb">위반유형</label>
        <select class="fc" id="ie-violation-type" onchange="toggleAmountField('ie',(allCats.find(c=>c.id==document.getElementById('ie-cat').value)||{}).name,this.value)">
          ${buildViolationTypeOptions(ieCatName, ieVT)}
        </select>
      </div>
      <div class="fg amount-field-ie${needAmount?'':' hidden-fg'}"><label class="flb">금액 *</label><input type="number" class="fc" id="ie-amount" value="${r.amount??''}" placeholder="원 단위로 입력" min="0"></div>
      <div class="fg full"><label class="flb">리스크명 *</label><input type="text" class="fc" id="ie-title" value="${escapeHTML(r.title||'')}"></div>
      <div class="fg full"><label class="flb">조치사항</label>
        <textarea class="fc" id="ie-action-text" rows="2" ${(isViolState(curState)||isDoneState(curState))?'':'disabled'} placeholder="${(isViolState(curState)||isDoneState(curState))?'조치사항을 입력하세요':'위반 또는 완료 상태일 때 입력 가능합니다'}">${escapeHTML(r.status||'')}</textarea>
      </div>
      ${isAudit?`
      <div class="fg"><label class="flb">징계유형 *</label><select class="fc" id="ie-discipline-type">
        <option value="">선택 안 함</option>
        ${['금전회수','경징계','중징계','형사고발'].map(v=>`<option value="${v}"${r.discipline_type===v?' selected':''}>${v}</option>`).join('')}
      </select></div>
      <div class="fg"><label class="flb">대상자 *</label><input type="text" class="fc" id="ie-discipline-name" value="${escapeHTML(r.discipline_name||'')}" placeholder="이름"></div>
      <div class="fg"><label class="flb">양형/처분 *</label><input type="text" class="fc" id="ie-sentence" value="${escapeHTML(r.sentence||'')}" placeholder="예: 정직 3개월"></div>
      `:''}
      <div class="fg"><label class="flb">외부노출 여부</label>
        <label class="chk-inline"><input type="checkbox" id="ie-external" ${r.external_exposure?'checked':''}> 외부에 노출됨</label>
      </div>
      <div class="fg full"><label class="flb">비고</label><textarea class="fc" id="ie-note">${escapeHTML(r.note||'')}</textarea></div>
      <div class="fg full" style="flex-direction:row;gap:8px;justify-content:flex-end">
        <button class="btn btn-sm" style="color:var(--위험-c);border-color:var(--위험-bd)" onclick="deleteInline('${r.id}')">삭제</button>
        <button class="btn btn-sm" onclick="cancelInline()">취소</button>
        <button class="btn btn-red btn-sm" id="ie-save-btn" onclick="saveInline('${r.id}')">저장</button>
      </div>
    </div>
  </td></tr>`;
}

function startInlineEdit(id){
  inlineEditId=(inlineEditId===id)?null:id;
  renderRecentBody();
}
function cancelInline(){
  inlineEditId=null;
  renderRecentBody();
}
function onIEDiv(){
  const divId=document.getElementById('ie-div').value;
  const brands=visibleBrands(divId?allBrands.filter(b=>b.division_id==divId):[]);
  const el=document.getElementById('ie-brand');
  el.innerHTML='<option value="">선택 안 함</option>'+brands.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
  toggleIEStore();
}
function onIEBrand(){ toggleIEStore(); }
function toggleIEStore(){
  const divId=document.getElementById('ie-div').value;
  const brandId=document.getElementById('ie-brand').value;
  const divObj=allDiv.find(d=>d.id==divId);
  const brandObj=allBrands.find(b=>b.id==brandId);
  const wrap=document.getElementById('ie-store-wrap');
  const sel=document.getElementById('ie-store');
  if(!wrap||!sel) return;
  if(divObj?.name==='유통' && brandObj?.name==='리테일'){
    const stores=allStores.filter(s=>s.division_id==divId);
    sel.innerHTML='<option value="">선택 (선택사항)</option>'+stores.map(s=>`<option value="${s.id}">${storeDisplayName(s.name)}</option>`).join('');
    wrap.classList.remove('hidden-fg');
  } else {
    sel.innerHTML='<option value="">선택 (선택사항)</option>';
    sel.value='';
    wrap.classList.add('hidden-fg');
  }
}
function onIECat(){
  const catId=document.getElementById('ie-cat').value;
  const subs=allSubs.filter(s=>s.category_id==catId);
  const el=document.getElementById('ie-sub');
  el.innerHTML='<option value="">없음</option>'+subs.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  const catName=(allCats.find(c=>c.id==catId)||{}).name||'';
  fillViolationTypeSel('ie', catName);
  toggleAmountField('ie', catName, '');
}
async function saveInline(id){
  const divId=document.getElementById('ie-div').value;
  const brandId=document.getElementById('ie-brand').value;
  const catId=document.getElementById('ie-cat').value;
  const subId=document.getElementById('ie-sub').value;
  const storeId=document.getElementById('ie-store')?.value;
  const state=document.getElementById('ie-state').value;
  const date=document.getElementById('ie-date').value;
  const title=document.getElementById('ie-title').value.trim();
  const note=document.getElementById('ie-note').value.trim();
  const cnt=document.getElementById('ie-cnt').value;
  const vtElIE=document.getElementById('ie-violation-type');
  const violationType=vtElIE?.value||null;
  const actionText=document.getElementById('ie-action-text')?.value.trim()||null;
  const disciplineType=document.getElementById('ie-discipline-type')?.value||null;
  const disciplineName=document.getElementById('ie-discipline-name')?.value.trim()||null;
  const ieSentence=document.getElementById('ie-sentence')?.value.trim()||null;
  const amountStrIE=document.getElementById('ie-amount')?.value ?? '';
  const externalExposureIE=document.getElementById('ie-external')?.checked||false;
  if(!divId||!catId||!state||!date||!title||cnt===''){showToast('필수 항목(*)을 입력해주세요 (건수 포함)');return;}
  if(vtElIE && vtElIE.options.length>1 && !violationType){showToast('위반유형을 선택해주세요');return;}
  const catNameIE=(allCats.find(c=>c.id==catId)||{}).name||'';
  if(catNameIE==='감사' && (!disciplineType||!disciplineName||!ieSentence)){showToast('감사 영역은 징계유형·대상자·양형/처분을 모두 입력해주세요');return;}
  const amountNeededIE=catNameIE==='부실채권' && AMOUNT_REQUIRED_TYPES.includes(violationType);
  if(amountNeededIE && amountStrIE===''){showToast('금액을 입력해주세요');return;}
  const amountIE=amountNeededIE?parseInt(amountStrIE):null;
  const cntVal=parseInt(cnt);
  const btn=document.getElementById('ie-save-btn');
  if(btn){btn.textContent='저장 중...'; btn.disabled=true;}
  const {error}=await sb.from('risks').update({
    division_id:parseInt(divId),brand_id:brandId?parseInt(brandId):null,category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,
    store_id:storeId?parseInt(storeId):null,
    grade:'안전',item_state:state,registered_at:date,title,
    status:actionText,note:note||null,
    violation_count:state==='모니터링'?null:cntVal,
    monitoring_count:state==='모니터링'?cntVal:null,
    violation_type:violationType||null,
    discipline_type:disciplineType,discipline_name:disciplineName,sentence:ieSentence,
    amount:amountIE, external_exposure:externalExposureIE
  }).eq('id',id);
  if(error){
    if(btn){btn.textContent='저장'; btn.disabled=false;}
    showToast('저장 실패: '+error.message);
    return;
  }
  showToast('수정 완료');
  inlineEditId=null;
  await loadAll();
  renderRecentBody();
}
async function deleteInline(id){
  if(!confirm('정말 삭제하시겠어요?')) return;
  const {error}=await sb.from('risks').delete().eq('id',id);
  if(error){showToast('삭제 실패: '+error.message);return;}
  showToast('삭제 완료');
  inlineEditId=null;
  await loadAll();
  renderRecentBody();
}

// ── 수정 모달 ──────────────────────────────
function openEdit(id){
  editId=id;
  const r=allRisks.find(x=>x.id===id); if(!r) return;
  document.getElementById('m-div').value=r.divisions?.id||'';
  onMDiv(r.brands?.id).then(()=>{
    document.getElementById('m-brand').value=r.brands?.id||'';
    onMBrand();
    const ms=document.getElementById('m-store'); if(ms && r.store_id) ms.value=r.store_id;
  });
  document.getElementById('m-cat').value=r.risk_categories?.id||'';
  onMCat();
  setTimeout(()=>{
    document.getElementById('m-sub').value=r.risk_subcategories?.id||'';
    const vtEl=document.getElementById('m-violation-type');
    if(vtEl && r.violation_type) vtEl.value=r.violation_type;
    const catName=(allCats.find(c=>c.id===r.risk_categories?.id)||{}).name||'';
    toggleAmountField('m', catName, r.violation_type||'');
    const maEl=document.getElementById('m-amount'); if(maEl) maEl.value=r.amount??'';
  },80);
  document.getElementById('m-date').value=r.registered_at||'';
  document.getElementById('m-title').value=r.title||'';
  // 조치사항 (단순 텍스트)
  const mat=document.getElementById('m-action-text');
  if(mat){ mat.value=r.status||''; }
  // 감사 전용 필드
  const mdt=document.getElementById('m-discipline-type'); if(mdt) mdt.value=r.discipline_type||'';
  const mdn=document.getElementById('m-discipline-name'); if(mdn) mdn.value=r.discipline_name||'';
  const mst=document.getElementById('m-sentence'); if(mst) mst.value=r.sentence||'';
  const mExt=document.getElementById('m-external'); if(mExt) mExt.checked=!!r.external_exposure;
  document.getElementById('m-note').value=r.note||'';
  document.getElementById('m-cnt').value=(r.monitoring_count??r.violation_count??'');
  if(r.item_state) selectState('m',r.item_state);
  else { document.getElementById('m-state').value=''; }
  document.getElementById('mo-ov').classList.add('open');
}
function closeModal(){document.getElementById('mo-ov').classList.remove('open');editId=null;}
function handleOvClick(e){if(e.target.id==='mo-ov') closeModal();}
async function onMDiv(keepBrandId){
  const divId=document.getElementById('m-div').value;
  let brands=visibleBrands(divId?allBrands.filter(b=>b.division_id==divId):[]);
  // 기존에 '기타'로 등록된 리스크를 수정할 때 브랜드가 비워지지 않도록 현재 값은 목록에 유지
  if(keepBrandId && !brands.some(b=>b.id==keepBrandId)){
    const kb=allBrands.find(b=>b.id==keepBrandId);
    if(kb) brands=[...brands, kb];
  }
  const el=document.getElementById('m-brand');
  el.innerHTML='<option value="">선택 안 함</option>';
  brands.forEach(b=>{el.innerHTML+=`<option value="${b.id}">${b.name}</option>`;});
  onMBrand();
}
function onMBrand(){
  const divId=document.getElementById('m-div').value;
  const brandId=document.getElementById('m-brand').value;
  const divObj=allDiv.find(d=>d.id==divId);
  const brandObj=allBrands.find(b=>b.id==brandId);
  toggleStoreDropdown('m',divObj,brandObj,divId);
}
function onMCat(){
  const catId=document.getElementById('m-cat').value;
  const subs=allSubs.filter(s=>s.category_id==catId);
  const el=document.getElementById('m-sub');
  el.innerHTML='<option value="">없음</option>';
  subs.forEach(s=>{el.innerHTML+=`<option value="${s.id}">${s.name}</option>`;});
  const catName=(allCats.find(c=>c.id==catId)||{}).name||'';
  fillViolationTypeSel('m', catName);
  renderStateButtons('m', catName);
  toggleAuditFields('m', catName);
  toggleAmountField('m', catName, '');
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
  const note=document.getElementById('m-note').value.trim();
  const cnt=document.getElementById('m-cnt').value;
  const vtElM=document.getElementById('m-violation-type');
  const violationType=vtElM?.value||null;
  const actionText=document.getElementById('m-action-text')?.value.trim()||null;
  const disciplineType=document.getElementById('m-discipline-type')?.value||null;
  const disciplineName=document.getElementById('m-discipline-name')?.value.trim()||null;
  const mSentence=document.getElementById('m-sentence')?.value.trim()||null;
  const amountStrM=document.getElementById('m-amount')?.value ?? '';
  const externalExposureM=document.getElementById('m-external')?.checked||false;
  if(!divId||!catId||!state||!date||!title||cnt===''){showToast('필수 항목(*)을 입력해주세요 (건수 포함)');return;}
  if(vtElM && vtElM.options.length>1 && !violationType){showToast('위반유형을 선택해주세요');return;}
  const catNameM=(allCats.find(c=>c.id==catId)||{}).name||'';
  if(catNameM==='감사' && (!disciplineType||!disciplineName||!mSentence)){showToast('감사 영역은 징계유형·대상자·양형/처분을 모두 입력해주세요');return;}
  const amountNeededM=catNameM==='부실채권' && AMOUNT_REQUIRED_TYPES.includes(violationType);
  if(amountNeededM && amountStrM===''){showToast('금액을 입력해주세요');return;}
  const amountM=amountNeededM?parseInt(amountStrM):null;
  const cntVal=parseInt(cnt);
  const btn=document.getElementById('save-btn');
  btn.textContent='저장 중...'; btn.disabled=true;
  const {error}=await sb.from('risks').update({
    division_id:parseInt(divId),brand_id:brandId?parseInt(brandId):null,category_id:parseInt(catId),
    subcategory_id:subId?parseInt(subId):null,
    store_id:storeId?parseInt(storeId):null,
    grade:'안전',item_state:state,registered_at:date,title,
    status:actionText,note:note||null,
    violation_count:state==='모니터링'?null:cntVal,
    monitoring_count:state==='모니터링'?cntVal:null,
    violation_type:violationType||null,
    discipline_type:disciplineType,discipline_name:disciplineName,sentence:mSentence,
    amount:amountM, external_exposure:externalExposureM
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
function openReportModal(){
  fillReportMonth();
  document.getElementById('report-ov').classList.add('open');
}
// 보고서 기준 월 채우기 (기본값 = 직전 달)
function fillReportMonth(){
  const el=document.getElementById('r-month'); if(!el) return;
  const months=monthOptionsRange();
  // 직전 달이 목록에 없으면(이번 달 데이터만 있을 때 등) 직전 달을 앞에 추가
  const now=new Date();
  const prev={y:new Date(now.getFullYear(),now.getMonth()-1,1).getFullYear(),
              m:new Date(now.getFullYear(),now.getMonth()-1,1).getMonth()};
  if(!months.some(o=>o.y===prev.y&&o.m===prev.m)) months.unshift(prev);
  el.innerHTML=months.map(o=>`<option value="${o.y}-${o.m}">${o.y}년 ${String(o.m+1).padStart(2,'0')}월</option>`).join('');
  el.value=`${prev.y}-${prev.m}`; // 기본 선택 = 직전 달
}
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
// 건수 합계 기준 (행 개수가 아니라 입력 건수). cAll=전체, cViol=위반, cDone=완료, cOpen=위반(처리중)
const cAll =arr=>sumCnt(arr);
const cViol=arr=>sumViol(arr);
const cDone=arr=>sumViol(arr.filter(r=>r.item_state==='완료'));
const cOpen=arr=>sumViol(arr.filter(r=>r.item_state==='위반'));
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
  const now=new Date();
  // 기준 월: 모달 선택값(없으면 직전 달)
  const rmVal=document.getElementById('r-month')?.value||'';
  let pY,pM;
  if(rmVal){ const a=rmVal.split('-').map(Number); pY=a[0]; pM=a[1]; }
  else { const d=new Date(now.getFullYear(),now.getMonth()-1,1); pY=d.getFullYear(); pM=d.getMonth(); }
  // 누적(연누적)은 기준 월 말일까지로 한정 → 보고서 전체가 "그 달 시점" 기준으로 일관됨
  const baseEnd=new Date(pY,pM+1,0,23,59,59,999);
  const divScoped=divFilter?allRisks.filter(r=>r.divisions?.name===divFilter):allRisks;
  const baseRisks=divScoped.filter(r=>r.registered_at && new Date(r.registered_at)<=baseEnd);
  const divs=divFilter?allDiv.filter(d=>d.name===divFilter):allDiv;
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
  const accAll=cAll(baseRisks), accV=cViol(baseRisks), accRate=rPct(accV,accAll);
  // 전월
  const monAll=cAll(prevRisks), monV=cViol(prevRisks), monRate=rPct(monV,monAll);
  // 처리 완료율 / 조치중 (누적 기준)
  const done=cDone(baseRisks), open=cOpen(baseRisks);
  const doneTotal=done+open;
  const doneRate=rPct(done,doneTotal);

  // KPI 카드 4개 — 가로 1열
  const kpis=[
    {ttl:'누적 모니터링', big:`${accAll}건`, sub:`위반 ${accV}건 (${accRate}%)`, c:RPT.NAVY},
    {ttl:'기준월 모니터링', big:`${monAll}건`, sub:`위반 ${monV}건 (${monRate}%)`, c:RPT.NAVY2},
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
        const a=cAll(cell), v=cViol(cell);
        sumA+=a; sumV+=v;
        r.push({text:String(dash(a)),options:{color:RPT.TEXT,fill:di%2?RPT.BG:RPT.SURF,align:'center',fontSize:8}});
        r.push({text:String(dash(v)),options:{color:v?RPT.RISK_C:RPT.TEXT3,bold:!!v,fill:di%2?RPT.BG:RPT.SURF,align:'center',fontSize:8}});
      });
      r.push({text:String(dash(sumA)),options:{bold:true,color:RPT.TEXT,fill:RPT.BG,align:'center',fontSize:8}});
      r.push({text:String(dash(sumV)),options:{bold:true,color:sumV?RPT.RISK_C:RPT.TEXT3,fill:RPT.BG,align:'center',fontSize:8}});
      rows.push(r);
    });
    // 합계 행
    const totA=cAll(srcRisks), totV=cViol(srcRisks);
    const totRow=[{text:'합계',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',fontSize:9}}];
    allCats.forEach(c=>{
      const cell=srcRisks.filter(x=>x.risk_categories?.id===c.id);
      const a=cAll(cell), v=cViol(cell);
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
  // ── 슬라이드 2-1 · 2-2: 주요 위험영역 및 조치 현황 ──
  // 직접 입력할 수 있는 코멘트 상자
  function commentBox(sl,y,h){
    sl.addShape('roundRect',{x:0.4,y,w:12.53,h,fill:{color:RPT.BG},line:{color:RPT.BORDER,width:0.75},rectRadius:0.05});
    sl.addText('코멘트 · 특이사항 (직접 입력)',{x:0.55,y:y+0.08,w:8,h:0.3,fontSize:10,bold:true,color:RPT.TEXT3,fontFace:RPT.FONT});
  }
  // (1) 급증 위험 영역: (계열사 × 영역 대분류) 기준월 위반이 전월 대비 20%↑ & 3건↑
  const _pm=new Date(pY,pM-1,1);
  const prevPrevRisks=rptMonthFilter(baseRisks,_pm.getFullYear(),_pm.getMonth());
  const surgeList=[];
  divs.forEach(dv=>{
    allCats.forEach(cat=>{
      const rec=sumViol(prevRisks.filter(r=>r.divisions?.id===dv.id&&r.risk_categories?.id===cat.id));
      const base=sumViol(prevPrevRisks.filter(r=>r.divisions?.id===dv.id&&r.risk_categories?.id===cat.id));
      if(rec>=3 && rec/Math.max(base,1)>=1.2){
        surgeList.push({div:dv.name,cat:cat.name,recent:rec,baseline:base,pct:Math.round((rec/Math.max(base,1)-1)*100)});
      }
    });
  });
  surgeList.sort((a,b)=>b.pct-a.pct);

  const slA=pptx.addSlide(); head(slA,'⚠ 주요 위험영역 및 조치 현황 (1) — 급증 위험 영역',`${prevLabel} · 전월 대비 위반 20%↑ & 3건↑`);
  {
    const hdr=['계열사','리스크 영역','기준월 위반','전월 위반','증감'].map((t,i)=>({text:t,options:{bold:true,color:'FFFFFF',fill:RPT.RED,align:i<2?'left':'center',valign:'middle',fontSize:11}}));
    const rows=[hdr];
    surgeList.slice(0,9).forEach((g,i)=>{
      const fill=i%2?RPT.RISK_BG:RPT.SURF;
      rows.push([
        {text:g.div,options:{bold:true,color:RPT.TEXT,fill,align:'left',valign:'middle',fontSize:11}},
        {text:g.cat,options:{color:RPT.TEXT,fill,align:'left',valign:'middle',fontSize:11}},
        {text:`${g.recent}`,options:{bold:true,color:RPT.RED_DARK,fill,align:'center',valign:'middle',fontSize:13}},
        {text:`${g.baseline}`,options:{color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:12}},
        {text:`▲ +${g.pct}%`,options:{bold:true,color:'FFFFFF',fill:RPT.RED,align:'center',valign:'middle',fontSize:13}}
      ]);
    });
    if(!surgeList.length) rows.push([{text:'급증 위험 영역 없음',options:{colspan:5,color:RPT.TEXT3,fill:RPT.SURF,align:'center',italic:true,fontSize:11}}]);
    slA.addTable(rows,{x:0.4,y:1.7,w:12.53,colW:[2.6,4.5,1.9,1.9,1.63],rowH:0.36,border:{type:'solid',pt:0.5,color:RPT.BORDER},fontFace:RPT.FONT,valign:'middle'});
    if(surgeList.length>9) slA.addText(`…외 ${surgeList.length-9}건`,{x:0.4,y:5.2,w:12.5,h:0.3,fontSize:9,color:RPT.TEXT3,fontFace:RPT.FONT});
    commentBox(slA,5.55,1.45);
  }

  // (2) 징계 조치 현황: 감사 영역 중 discipline_name이 있는 건 (기준월)
  const disc=prevRisks.filter(r=>r.risk_categories?.name==='감사'&&r.discipline_name);
  const slB=pptx.addSlide(); head(slB,'주요 위험영역 및 조치 현황 (2) — 징계 조치 현황',`${prevLabel} · 감사 영역 징계 건`);
  {
    const hdr=['계열사','브랜드/조직','리스크명','대상자','양형/처분','등록일'].map((t,i)=>({text:t,options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:(i>=3&&i<=4)?'center':'left',valign:'middle',fontSize:10}}));
    const rows=[hdr];
    disc.slice(0,9).forEach((r,i)=>{
      const fill=i%2?RPT.BG:RPT.SURF;
      rows.push([
        {text:r.divisions?.name||'-',options:{color:RPT.TEXT,fill,align:'left',valign:'middle',fontSize:9}},
        {text:r.brands?.name||'-',options:{color:RPT.TEXT,fill,align:'left',valign:'middle',fontSize:9}},
        {text:r.title||'-',options:{color:RPT.TEXT,fill,align:'left',valign:'middle',fontSize:9}},
        {text:r.discipline_name||'-',options:{color:RPT.TEXT,fill,align:'center',valign:'middle',fontSize:9}},
        {text:r.sentence||'-',options:{color:RPT.TEXT,fill,align:'center',valign:'middle',fontSize:9}},
        {text:r.registered_at||'-',options:{color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:9}}
      ]);
    });
    if(!disc.length) rows.push([{text:'징계 조치 건 없음',options:{colspan:6,color:RPT.TEXT3,fill:RPT.SURF,align:'center',italic:true,fontSize:11}}]);
    slB.addTable(rows,{x:0.4,y:1.7,w:12.53,colW:[1.7,1.8,3.93,1.6,2.0,1.5],rowH:0.36,border:{type:'solid',pt:0.5,color:RPT.BORDER},fontFace:RPT.FONT,valign:'middle'});
    if(disc.length>9) slB.addText(`…외 ${disc.length-9}건`,{x:0.4,y:5.2,w:12.5,h:0.3,fontSize:9,color:RPT.TEXT3,fontFace:RPT.FONT});
    commentBox(slB,5.55,1.45);
  }

  // ── 슬라이드 3: 계열사 순위 ─────────────────
  // 위반(=위반+완료) 건수 적은 순(위) → 많은 순(아래)
  const divRanks = divs.map(dv=>{
    const items=baseRisks.filter(r=>r.divisions?.id===dv.id);
    const total=cAll(items), viol=cViol(items);
    return {name:dv.name, total, viol, rate:rPct(viol,total)};
  }).sort((a,b)=>a.viol-b.viol || a.total-b.total);

  const s3=pptx.addSlide(); head(s3,'계열사 순위','위반+완료 건수 적은 순 → 많은 순');
  const rankHdr=[
    {text:'순위',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:14}},
    {text:'계열사',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:14}},
    {text:'위반 건수',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:14}},
    {text:'전체 모니터링',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:14}},
    {text:'위반율',options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:'center',valign:'middle',fontSize:14}}
  ];
  const rankRows=[rankHdr];
  divRanks.forEach((d,i)=>{
    const fill=i%2?RPT.BG:RPT.SURF;
    rankRows.push([
      {text:`${i+1}`, options:{bold:true,color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:15}},
      {text:d.name,  options:{bold:true,color:RPT.TEXT, fill,align:'center',valign:'middle',fontSize:16}},
      {text:`${d.viol}`,  options:{bold:true,color:d.viol?RPT.RISK_C:RPT.TEXT3,fill,align:'center',valign:'middle',fontSize:17}},
      {text:`${d.total}`, options:{color:RPT.TEXT, fill,align:'center',valign:'middle',fontSize:15}},
      {text:`${d.rate}%`, options:{color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:15}}
    ]);
  });
  // 슬라이드가 차 보이도록: 본문 영역(약 1.95~6.95)을 행 수에 맞춰 채움
  const s3Top=1.95, s3Bottom=6.95;
  const s3RowH=Math.min(0.9, (s3Bottom-s3Top)/rankRows.length);
  s3.addTable(rankRows,{
    x:1.17, y:s3Top, w:11.0, colW:[1.3, 3.3, 2.4, 2.4, 1.6],
    border:{type:'solid',pt:0.75,color:RPT.BORDER},
    rowH:s3RowH, fontFace:RPT.FONT, valign:'middle'
  });

  // ── 슬라이드 4~: 계열사별 브랜드/조직 순위 (계열사마다 1장) ──
  const RANK_C=RPT.RED;     // 순위 색 = 붉은색
  const VIOL_C=RPT.NAVY2;   // 위반건수 색 = 순위와 다르게(네이비)
  const DIST_MINI=['글로벌','팜앤푸드','킴스']; // 유통: 순위 제외 + 하단 별도 순위 ('기타'는 노출 안 함)

  // 표준 순위표 (순위 빨강 / 위반건수 네이비)
  function rankTable(sl, data, nameHdr, top, bottom){
    const hdr=['순위',nameHdr,'위반건수','전체','위반율'].map((t,i)=>({text:t,options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:i===1?'center':'center',valign:'middle',fontSize:13}}));
    const rows=[hdr];
    data.forEach((d,i)=>{
      const fill=i%2?RPT.BG:RPT.SURF;
      rows.push([
        {text:`${i+1}`,options:{bold:true,color:RANK_C,fill,align:'center',valign:'middle',fontSize:15}},
        {text:d.name,options:{bold:true,color:RPT.TEXT,fill,align:'center',valign:'middle',fontSize:14}},
        {text:String(dash(d.viol)),options:{bold:!!d.viol,color:d.viol?VIOL_C:RPT.TEXT3,fill,align:'center',valign:'middle',fontSize:15}},
        {text:`${d.total}`,options:{color:RPT.TEXT,fill,align:'center',valign:'middle',fontSize:13}},
        {text:`${d.rate}%`,options:{color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:13}}
      ]);
    });
    if(!data.length) rows.push([{text:'(데이터 없음)',options:{colspan:5,color:RPT.TEXT3,fill:RPT.SURF,align:'center',italic:true,fontSize:11}}]);
    const rowH=Math.min(0.7,(bottom-top)/rows.length);
    sl.addTable(rows,{x:1.17,y:top,w:11.0,colW:[1.3,3.3,2.4,2.4,1.6],border:{type:'solid',pt:0.75,color:RPT.BORDER},rowH,fontFace:RPT.FONT,valign:'middle'});
  }

  divs.forEach(dv=>{
    if(dv.name==='유통'){
      // 유통(1): 리테일 매장 순위 — 한 장 (전체 높이 사용)
      const sl=pptx.addSlide(); head(sl,'유통 — 리테일 매장 순위','위반+완료 건수 많은 순');
      const distStores=allStores.filter(s=>s.division_id===dv.id);
      const storeRanks=distStores.map(s=>{
        const items=baseRisks.filter(r=>r.store_id===s.id);
        const viol=cViol(items);
        const total=cAll(items);
        return {name:storeDisplayName(s.name), viol, total, rate:rPct(viol,total)};
      }).sort((a,b)=> b.viol-a.viol || b.total-a.total);
      if(storeRanks.length){
        // 표를 위로 올리고(mTop↓), 행 수가 많으면 글자를 줄여 슬라이드를 벗어나지 않게 함
        const mTop=1.6, mBottom=7.05;
        const half=Math.ceil(storeRanks.length/2);
        const colsData=[storeRanks.slice(0,half), storeRanks.slice(half)];
        const mRowH=Math.min(0.42,(mBottom-mTop)/(half+1));
        const fs = mRowH>=0.34?9 : mRowH>=0.27?8 : mRowH>=0.22?7:6;
        const mX0=0.4, mGap=0.41, mColW=(13.33-mX0*2-mGap)/2;
        const mInner=[mColW*0.12, mColW*0.46, mColW*0.16, mColW*0.13, mColW*0.13];
        const mHdr=()=>['순위','매장','위반건수','전체','위반율'].map((t,i)=>
          ({text:t,options:{bold:true,color:'FFFFFF',fill:RPT.NAVY,align:i===1?'left':'center',valign:'middle',fontSize:fs}}));
        colsData.forEach((data,ci)=>{
          const rows=[mHdr()];
          data.forEach((s,i)=>{
            const rank=ci*half+i+1;
            const fill=i%2?RPT.BG:RPT.SURF;
            rows.push([
              {text:`${rank}`,options:{bold:true,color:RANK_C,fill,align:'center',valign:'middle',fontSize:fs}},
              {text:s.name,options:{color:RPT.TEXT,fill,align:'left',valign:'middle',fontSize:fs}},
              {text:String(dash(s.viol)),options:{bold:!!s.viol,color:s.viol?VIOL_C:RPT.TEXT3,fill,align:'center',valign:'middle',fontSize:fs}},
              {text:String(s.total),options:{color:RPT.TEXT,fill,align:'center',valign:'middle',fontSize:fs}},
              {text:`${s.rate}%`,options:{color:RPT.TEXT2,fill,align:'center',valign:'middle',fontSize:fs}}
            ]);
          });
          const x=mX0+ci*(mColW+mGap);
          sl.addTable(rows,{x,y:mTop,w:mColW,colW:mInner,rowH:mRowH,border:{type:'solid',pt:0.5,color:RPT.BORDER},fontFace:RPT.FONT,valign:'middle',autoPage:false});
        });
      } else {
        sl.addText('(리테일 매장 데이터 없음)',{x:0.4,y:3.0,w:12.5,h:0.4,fontSize:11,color:RPT.TEXT3,italic:true,align:'center',fontFace:RPT.FONT});
      }
      // 유통(2): 글로벌 · 팜앤푸드 · 킴스 순위 — 별도 한 장
      const sl2=pptx.addSlide(); head(sl2,'유통 — 글로벌 · 팜앤푸드 · 킴스 순위','위반+완료 건수 많은 순');
      const four=DIST_MINI.map(nm=>{
        const b=allBrands.find(x=>x.division_id===dv.id&&x.name===nm);
        const items=b?baseRisks.filter(r=>r.brands?.id===b.id):[];
        const viol=cViol(items);
        const total=cAll(items);
        return {name:nm, viol, total, rate:rPct(viol,total)};
      }).sort((a,b)=> b.viol-a.viol || b.total-a.total);
      rankTable(sl2, four, '브랜드/조직', 1.95, 6.95);
    } else {
      const sl=pptx.addSlide(); head(sl,`${dv.name} 브랜드/조직 순위`,'위반+완료 건수 적은 순 → 많은 순');
      const data=visibleBrands(allBrands.filter(b=>b.division_id===dv.id)).map(b=>{
        const items=baseRisks.filter(r=>r.brands?.id===b.id);
        const viol=cViol(items);
        const total=cAll(items);
        return {name:b.name, viol, total, rate:rPct(viol,total)};
      }).sort((a,b)=>a.viol-b.viol || a.total-b.total);
      rankTable(sl, data, '브랜드/조직', 1.95, 6.95);
    }
  });

  addMatrixSlide('계열사별 현황 (연누적)', baseRisks);
  addMatrixSlide('계열사별 현황 (기준월)',  prevRisks);

  // ── 슬라이드 5~12: 8대 카테고리 상세 (기준월) ─
  function addCatDetailSlide(cat){
    const sl=pptx.addSlide(); head(sl, `${cat.name} 모니터링 상세 현황`, `${prevLabel} (기준월)`);
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
    // 영역 중분류 행 (없으면 '데이터 없음' 한 줄)
    if(!subs.length && !items.length){
      const span=1+colDivs.length*2+2;
      rows.push([{text:'위반 데이터 없음',options:{colspan:span,color:RPT.TEXT3,align:'center',fontSize:10,italic:true,fill:RPT.BG}}]);
    } else {
      // 영역 중분류 미지정 항목도 포함하기 위해 [null, ...subs] 흐름
      const rowKeys=subs.length?subs:[{id:null,name:'(영역 중분류 미지정)'}];
      rowKeys.forEach((sb,ri)=>{
        const r=[{text:sb.name,options:{color:RPT.TEXT,fill:ri%2?RPT.BG:RPT.SURF,align:'left',valign:'middle',fontSize:8}}];
        let sa=0,sv=0;
        colDivs.forEach(dv=>{
          const cell=items.filter(x=>x.divisions?.id===dv.id && (sb.id?x.risk_subcategories?.id===sb.id:!x.risk_subcategories?.id));
          const a=cAll(cell), v=cViol(cell);
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
        const a=cAll(cell), v=cViol(cell);
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
  const s13=pptx.addSlide(); head(s13, '영역별 모니터링 결과 요약', `${prevLabel} (기준월)`);
  // 4열 × 2행 = 8개
  const sumX0=0.4, sumY0=1.85, sumGapX=0.18, sumGapY=0.22;
  const sumW=(12.53-sumGapX*3)/4, sumH=(5.15-sumGapY)/2;
  allCats.slice(0,8).forEach((cat,idx)=>{
    const r=Math.floor(idx/4), c=idx%4;
    const x=sumX0+c*(sumW+sumGapX), y=sumY0+r*(sumH+sumGapY);
    const items=prevRisks.filter(x=>x.risk_categories?.id===cat.id);
    const a=cAll(items), v=cViol(items);
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
    const sl=pptx.addSlide(); head(sl, `${dv.name} 영역별 모니터링 현황`, `${prevLabel} (기준월)`);
    const items=prevRisks.filter(r=>r.divisions?.id===dv.id);
    const a=cAll(items), v=cViol(items);
    const d=cDone(items), o=cOpen(items);
    const dr=rPct(d,d+o);

    // 상단 KPI 4개
    const kY=1.75, kH=1.1, kGap=0.15, kW=(12.53-kGap*3)/4;
    const cards=[
      {ttl:'기준월 모니터링', big:`${a}건`,             sub:`위반 ${v}건${a?` (${rPct(v,a)}%)`:''}`, c:RPT.NAVY},
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
      const ca=cAll(cell), cv=cViol(cell);
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

  const ym=`${pY}${String(pM+1).padStart(2,'0')}`;
  const fname=`이랜드그룹_리스크관리현황_${divFilter?divFilter+'_':''}${ym}.pptx`;
  await pptx.writeFile({fileName:fname});
  showToast('보고서 다운로드 완료');
}

function dlBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}

// ── Mock 데이터 도구 (검토용) ───────────────
// ── 유틸 ───────────────────────────────────
function gradeBadge(g){if(!g)return '-';return `<span class="badge b-${g}">${g}</span>`;}
function stateBadge(s){if(!s)return '-';return `<span class="bs bs-${stateClass(s)}">${s}</span>`;}
function fmtD(s){if(!s)return '-';return s.slice(2).replace(/-/g,'.');}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

// 대시보드가 실시간으로 갱신되는 것처럼 보이도록 KPI 카운트업 · 측정판 행 애니메이션을 주기적으로 재생
function startLiveTicker(){
  setInterval(()=>{
    if(currentPage!=='dashboard') return;
    _kpiAnimated=false;
    renderKPI(getFiltered());
    renderMatrix(getFiltered());
    renderAuditKPI(getFiltered());
  },28700);
}

// 차트(추이·도넛·계열사 막대)가 스크롤로 다시 화면에 들어올 때마다 애니메이션이 재생되도록.
// 캔버스 엘리먼트 자체는 렌더마다 재사용되므로(Chart.js가 destroy 후 같은 캔버스에 다시 그림) 한 번만 관찰 등록하면 됨.
function setupChartReplayObserver(){
  const targets=[
    {id:'trend-chart', fn:()=>renderTrend(getFiltered())},
    {id:'donut-chart', fn:()=>renderDonut(getFiltered())},
    {id:'div-bar-chart', fn:()=>renderDivisionBarChart(getFiltered())}
  ];
  const observer=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting || currentPage!=='dashboard') return;
      const match=targets.find(t=>t.id===entry.target.id);
      if(match) match.fn();
    });
  },{threshold:0.4});
  targets.forEach(t=>{
    const el=document.getElementById(t.id);
    if(el) observer.observe(el);
  });
}

init();
setupChartReplayObserver();
startLiveTicker();
