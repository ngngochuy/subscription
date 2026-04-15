'use strict';
const BRANDS=[{keys:['netflix'],domain:'netflix.com'},{keys:['spotify'],domain:'spotify.com'},{keys:['youtube','yt premium'],domain:'youtube.com'},{keys:['chatgpt','openai'],domain:'openai.com'},{keys:['meta','facebook'],domain:'facebook.com'},{keys:['instagram'],domain:'instagram.com'},{keys:['google one','google'],domain:'google.com'},{keys:['apple','icloud'],domain:'apple.com'},{keys:['discord'],domain:'discord.com'},{keys:['notion'],domain:'notion.so'},{keys:['figma'],domain:'figma.com'},{keys:['adobe'],domain:'adobe.com'},{keys:['dropbox'],domain:'dropbox.com'},{keys:['microsoft','office','365'],domain:'microsoft.com'},{keys:['zoom'],domain:'zoom.us'},{keys:['slack'],domain:'slack.com'},{keys:['linkedin'],domain:'linkedin.com'},{keys:['canva'],domain:'canva.com'},{keys:['github'],domain:'github.com'},{keys:['tiktok'],domain:'tiktok.com'},{keys:['amazon','aws'],domain:'amazon.com'},{keys:['shopee'],domain:'shopee.vn'},{keys:['telegram'],domain:'telegram.org'},{keys:['whatsapp'],domain:'whatsapp.com'},{keys:['x.com','twitter'],domain:'x.com'},{keys:['paypal'],domain:'paypal.com'},{keys:['nintendo'],domain:'nintendo.com'},{keys:['xbox'],domain:'xbox.com'},{keys:['playstation','ps plus'],domain:'playstation.com'},{keys:['twitch'],domain:'twitch.tv'}];
const CATEGORIES={entertainment:{label:'Giải trí',color:'#a855f7'},work:{label:'Công việc',color:'#6366f1'},storage:{label:'Lưu trữ',color:'#22c55e'},social:{label:'Mạng xã hội',color:'#ec4899'},gaming:{label:'Gaming',color:'#f97316'},education:{label:'Học tập',color:'#06b6d4'},other:{label:'Khác',color:'#71717a'}};
const CYCLE_LABEL={weekly:'/tuần',monthly:'/tháng',quarterly:'/quý',yearly:'/năm'};
const PRESETS=[{name:'Netflix',cat:'entertainment'},{name:'Spotify',cat:'entertainment'},{name:'YouTube Premium',cat:'entertainment'},{name:'ChatGPT Plus',cat:'work'},{name:'Google One',cat:'storage'},{name:'Apple One',cat:'entertainment'},{name:'Notion',cat:'work'},{name:'Discord Nitro',cat:'social'},{name:'Adobe CC',cat:'work'},{name:'Canva Pro',cat:'work'},{name:'GitHub Pro',cat:'work'},{name:'Figma',cat:'work'}];

let subs=[],user=null,contacts={},filter='all',viewType='grid',sortType='nextDate',privacyOn=false,catChartInstance=null,currentView='overview',calMonth=new Date().getMonth(),calYear=new Date().getFullYear(),selPay='';

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async()=>{
  user=await authCheck();if(!user)return;
  document.getElementById('userName').textContent=user.username;
  document.getElementById('userAvatar').textContent=user.username[0].toUpperCase();
  const topName=document.getElementById('topUserName');if(topName)topName.textContent=user.username;
  buildPresets();await loadData();bindEvents();setupForm();autoNotify();
  loadLocalSettings();
  applyTheme();
  if(localStorage.getItem('st_theme')==='light')document.body.classList.add('light');
  switchView(window.location.hash.replace('#','')||'overview');
});

async function authCheck(){
  try{const r=await fetch('/api/me',{credentials:'include'});const d=await r.json();
  if(!d.user||d.user.role!=='client'){location.href='/login.html';return null}return d.user;
  }catch{location.href='/login.html';return null}
}

// ─── DATA ────────────────────────────────────────────────────
async function loadData(){
  try{
    const[sr,cr,pr]=await Promise.all([fetch('/api/subscriptions',{credentials:'include'}),fetch('/api/user_contacts',{credentials:'include'}),fetch('/api/profile',{credentials:'include'})]);
    let raw=await sr.json()||[];contacts=await cr.json()||{};
    let profileData=await pr.json()||{};
    user={...user,...profileData};
    const ut=document.getElementById('userTier');if(ut){ut.textContent=user.tierName||user.tier;ut.className='role t-'+(user.tier||'free')}
    renderFeatures(); // Lock/unlock features in DOM
    let renewed=0;
    subs=raw.filter(s=>!s.isArchived).map(sub=>{const adv=advanceExpired(sub);if(adv.nextDate!==sub.nextDate){renewed++;syncSub(adv)}return adv});
    if(renewed>0)setTimeout(()=>toast('Đã tự động cập nhật '+renewed+' gói quá hạn'),800);
    localStorage.setItem('st_subs',JSON.stringify(raw));
  }catch{
    const cached=JSON.parse(localStorage.getItem('st_subs')||'[]');
    subs=cached.filter(s=>!s.isArchived);toast('Đang sử dụng dữ liệu offline','warn');
  }
  render();
}

async function syncSub(sub){
  try{await fetch('/api/subscriptions/'+sub.id,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(sub)})}catch{}
}

function advanceExpired(sub){
  const today=new Date();today.setHours(0,0,0,0);let next=new Date(sub.nextDate);next.setHours(0,0,0,0);
  if(next>=today)return sub;const orig=new Date(sub.startDate).getDate();let i=0;
  while(next<today&&i<500){next=nextDateFrom(next,sub.billingCycle||'monthly',orig);i++}
  return{...sub,nextDate:next.toISOString()};
}

function nextDateFrom(from,cycle){
  const d=new Date(from);
  if(cycle==='weekly'){d.setDate(d.getDate()+7)}
  else if(cycle==='monthly'){d.setMonth(d.getMonth()+1)}
  else if(cycle==='quarterly'){d.setMonth(d.getMonth()+3)}
  else if(cycle==='yearly'){d.setFullYear(d.getFullYear()+1)}
  else{d.setMonth(d.getMonth()+1)}
  return d;
}

function computeNext(start,cycle,count){
  let d=new Date(start);for(let i=0;i<(count||1);i++)d=nextDateFrom(d,cycle);
  const today=new Date();today.setHours(0,0,0,0);let it=0;
  while(d<today&&it<500){d=nextDateFrom(d,cycle);it++}return d;
}

function daysLeft(ds){const t=new Date();t.setHours(0,0,0,0);const d=new Date(ds);d.setHours(0,0,0,0);return Math.round((d-t)/864e5)}
function cycleProgress(s,n){const a=new Date(s).getTime(),b=new Date(n).getTime(),now=Date.now();return Math.min(100,Math.max(0,Math.round((now-a)/(b-a)*100)))}

// ─── RENDER ──────────────────────────────────────────────────
function render(){renderStats();renderContent();renderUpcoming();renderBudget();renderChart();renderInsights()}

function renderStats(){
  const toM=s=>{const p=+s.price;return{weekly:p*4.33,monthly:p,quarterly:p/3,yearly:p/12}[s.billingCycle||'monthly']||p};
  const total=subs.reduce((a,s)=>a+toM(s),0);
  const personal=subs.reduce((a,s)=>a+toM(s)/Math.max(1,+s.members),0);
  const urgent=subs.filter(s=>{const d=daysLeft(s.nextDate);return d>=0&&d<=7}).length;
  const byC=subs.reduce((a,s)=>{const k=s.billingCycle||'monthly';a[k]=(a[k]||0)+1;return a},{});
  const info=Object.entries(byC).map(([k,v])=>v+(CYCLE_LABEL[k]||'')).join(' · ');
  el('sTotal').textContent=fmt(total);el('sYearly').textContent='Năm: '+fmt(total*12);
  el('sCount').textContent=subs.length;el('sCycleBreak').textContent=info||'—';
  el('sUrgent').textContent=urgent;el('sPersonal').textContent=fmt(personal);
}

function renderContent(){
  const container=el('mainContainer');let list=[...subs];
  if(filter==='urgent')list=list.filter(s=>{const d=daysLeft(s.nextDate);return d>=0&&d<=7});
  else if(filter==='trial')list=list.filter(s=>s.isTrial);
  else if(filter!=='all')list=list.filter(s=>s.category===filter);
  const q=(el('searchInput')?.value||'').trim().toLowerCase();
  if(q)list=list.filter(s=>s.name.toLowerCase().includes(q)||(s.accountEmail||'').toLowerCase().includes(q));
  if(sortType==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sortType==='price')list.sort((a,b)=>b.price-a.price);
  else list.sort((a,b)=>daysLeft(a.nextDate)-daysLeft(b.nextDate));
  if(!list.length){container.innerHTML='<div class="empty-state"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><h3>'+(q||filter!=='all'?'Không tìm thấy':'Chưa có gói nào')+'</h3><p>'+(q||filter!=='all'?'Thử thay đổi bộ lọc.':'Bấm "Thêm gói" để bắt đầu.')+'</p></div>';return}
  if(viewType==='grid')container.innerHTML='<div class="sub-grid">'+list.map(cardHTML).join('')+'</div>';
  else container.innerHTML='<div class="sub-list">'+list.map(listHTML).join('')+'</div>';
}

function cardHTML(s){
  const days=daysLeft(s.nextDate),prog=cycleProgress(s.startDate,s.nextDate),logo=getLogo(s.name);
  const cat=CATEGORIES[s.category]||CATEGORIES.other;
  const pPerson=+s.price/Math.max(1,+s.members);
  let dCls='days-ok',dTxt='Còn '+days+' ngày',mClr='var(--green)';
  if(days<0){dCls='days-expired';dTxt='Hết hạn';mClr='var(--text-muted)'}
  else if(days===0){dCls='days-danger';dTxt='Hôm nay!';mClr='var(--red)'}
  else if(days<=3){dCls='days-danger';dTxt='Còn '+days+' ngày';mClr='var(--red)'}
  else if(days<=7){dCls='days-warn';dTxt='Còn '+days+' ngày';mClr='var(--amber)'}
  const loyalty=monthsSince(s.startDate);
  const loyaltyBadge=loyalty>=6?'<span class="badge badge-loyalty">'+loyalty+' tháng</span>':'';
  const trialBadge=s.isTrial?'<span class="badge badge-trial">Trial</span>':'';
  const splitBadge=+s.members>1?'<span class="badge badge-split">'+s.members+' người</span>':'';
  const streakBadge=s.paidStreak>0?'<span class="streak-badge">🔥 '+s.paidStreak+'</span>':'';
  return '<div class="card" data-id="'+s.id+'"><div class="card-head"><div class="svc-logo" style="background:'+logo.bg+';color:'+logo.text+'">'+(logo.type==='img'?'<img src="'+logo.url+'" onerror="this.outerHTML=\'<span>'+esc(s.name)[0]+'</span>\'">':'<span>'+logo.init+'</span>')+'</div><div class="svc-details"><div class="svc-name">'+esc(s.name)+'</div>'+(s.accountEmail?'<div class="svc-account">'+esc(s.accountEmail)+'</div>':'')+'</div></div><div class="card-price"><span class="amount blur-target">'+fmt(s.price)+'</span><span class="cycle">'+(CYCLE_LABEL[s.billingCycle]||'/tháng')+'</span></div><div class="card-progress"><div class="card-progress-top"><span class="card-exp">Hạn: '+fmtDate(s.nextDate)+'</span><span class="card-days '+dCls+'">'+dTxt+'</span></div><div class="meter"><div class="meter-fill" style="width:'+prog+'%;background:'+mClr+'"></div></div></div><div class="card-meta"><span class="badge badge-cat"><span class="cat-dot" style="background:'+cat.color+'"></span>'+cat.label+'</span>'+trialBadge+loyaltyBadge+splitBadge+streakBadge+'</div><div class="card-actions"><button class="btn btn-ghost btn-sm" onclick="editSub('+s.id+')">Sửa</button><button class="btn btn-ghost btn-sm" onclick="checkinSub('+s.id+')">✓ Đã trả</button><button class="btn btn-ghost btn-sm" onclick="shareSub('+s.id+')">Chia tiền</button><button class="btn btn-ghost btn-sm" onclick="archiveSub('+s.id+')">Lưu trữ</button></div></div>';
}

function listHTML(s){
  const days=daysLeft(s.nextDate),logo=getLogo(s.name),cat=CATEGORIES[s.category]||CATEGORIES.other;
  let dCls='days-ok';if(days<0)dCls='days-expired';else if(days<=3)dCls='days-danger';else if(days<=7)dCls='days-warn';
  return '<div class="list-row"><div class="list-svc"><div class="svc-logo" style="background:'+logo.bg+';color:'+logo.text+'">'+(logo.type==='img'?'<img src="'+logo.url+'">':'<span>'+logo.init+'</span>')+'</div><div><div class="svc-name" style="font-size:13px">'+esc(s.name)+'</div>'+(s.accountEmail?'<div class="svc-account">'+esc(s.accountEmail)+'</div>':'')+'</div></div><div class="list-price blur-target">'+fmt(s.price)+'</div><div class="list-date '+dCls+'">'+fmtDate(s.nextDate)+'</div><div class="list-cat"><span class="cat-dot" style="background:'+cat.color+';width:6px;height:6px;border-radius:50%;display:inline-block"></span>'+cat.label+'</div><div class="list-acts"><button class="icon-btn icon-btn-sm" onclick="editSub('+s.id+')" title="Sửa"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn icon-btn-sm" onclick="archiveSub('+s.id+')" title="Lưu trữ"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/></svg></button></div></div>';
}

function renderUpcoming(){
  const ul=el('upcomingList');if(!ul)return;
  const up=subs.filter(s=>{const d=daysLeft(s.nextDate);return d>=0&&d<=7}).sort((a,b)=>daysLeft(a.nextDate)-daysLeft(b.nextDate)).slice(0,5);
  if(!up.length){ul.innerHTML='<div style="font-size:11px;color:var(--text-muted);padding:4px 0">Không có gói sắp hết hạn</div>';return}
  ul.innerHTML=up.map(s=>{const d=daysLeft(s.nextDate);const logo=getLogo(s.name);return '<div style="display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;margin-bottom:4px;transition:background .1s;cursor:default" onmouseenter="this.style.background=\'var(--surface-2)\'" onmouseleave="this.style.background=\'transparent\'"><div style="width:24px;height:24px;border-radius:6px;background:'+logo.bg+';color:'+logo.text+';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:800;overflow:hidden">'+(logo.type==='img'?'<img src="'+logo.url+'" style="width:100%;height:100%;object-fit:cover">':'<span>'+logo.init+'</span>')+'</div><div style="flex:1;min-width:0"><div style="font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.name)+'</div><div style="font-size:10px;color:'+(d<=3?'var(--red)':'var(--amber)')+';font-weight:600">'+(d===0?'Hôm nay':'Còn '+d+' ngày')+'</div></div></div>'}).join('');
}

function renderBudget(){
  const bar=el('budgetBar');const budget=+localStorage.getItem('st_budget');
  if(!budget){bar.classList.remove('show');return}
  const toM=s=>{const p=+s.price;return{weekly:p*4.33,monthly:p,quarterly:p/3,yearly:p/12}[s.billingCycle||'monthly']||p};
  const total=subs.reduce((a,s)=>a+toM(s),0);const pct=Math.round(total/budget*100);
  el('budgetLabel').textContent=fmt(budget);
  el('budgetPercent').textContent=fmt(total)+' / '+pct+'%';
  const fill=el('budgetFill');fill.style.width=Math.min(pct,100)+'%';
  fill.style.background=pct>100?'var(--red)':pct>80?'var(--amber)':'var(--green)';
  if(pct>100)el('budgetPercent').classList.add('budget-over');
  else el('budgetPercent').classList.remove('budget-over');
  bar.classList.add('show');
}

function renderChart(){
  const canvas=el('catChart');if(!canvas||!window.Chart)return;
  const toM=s=>{const p=+s.price;return{weekly:p*4.33,monthly:p,quarterly:p/3,yearly:p/12}[s.billingCycle||'monthly']||p};
  const data={};subs.forEach(s=>{const k=s.category||'other';data[k]=(data[k]||0)+toM(s)});
  const labels=Object.keys(data).map(k=>(CATEGORIES[k]||CATEGORIES.other).label);
  const colors=Object.keys(data).map(k=>(CATEGORIES[k]||CATEGORIES.other).color);
  const values=Object.values(data);
  if(catChartInstance)catChartInstance.destroy();
  catChartInstance=new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom',labels:{color:'#a0a0ae',font:{size:11,family:'Inter'},padding:12,usePointStyle:true,pointStyleWidth:8}}}}});
}

function renderInsights(){
  const card=el('insightsCard');if(!card)return;
  const toM=s=>{const p=+s.price;return{weekly:p*4.33,monthly:p,quarterly:p/3,yearly:p/12}[s.billingCycle||'monthly']||p};
  const total=subs.reduce((a,s)=>a+toM(s),0);
  const items=[];
  const top=subs.sort((a,b)=>toM(b)-toM(a))[0];
  if(top)items.push({icon:'trending-up',text:'<strong>'+esc(top.name)+'</strong> chiếm nhiều chi phí nhất: '+fmt(toM(top))+'/tháng'});
  const yearly=subs.filter(s=>s.billingCycle==='yearly');
  const monthly=subs.filter(s=>!s.billingCycle||s.billingCycle==='monthly');
  if(monthly.length>2)items.push({icon:'lightbulb',text:'Có '+monthly.length+' gói trả hàng tháng. Chuyển sang năm có thể tiết kiệm đến 15-20%.'});
  const trials=subs.filter(s=>s.isTrial);
  if(trials.length)items.push({icon:'alert',text:trials.length+' gói đang ở chế độ dùng thử. Nhớ hủy trước khi bị tính phí!'});
  if(total>1000000)items.push({icon:'shield',text:'Chi tiêu hàng tháng vượt 1 triệu đồng. Cân nhắc rà soát các gói ít sử dụng.'});
  if(!items.length)items.push({icon:'check',text:'Mọi thứ ổn! Tiếp tục theo dõi chi tiêu đăng ký của bạn.'});
  const svgs={
    'trending-up':'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    'lightbulb':'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    'alert':'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'shield':'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'check':'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  };
  card.innerHTML='<h3>Thông tin nổi bật</h3>'+items.map(i=>'<div class="insight-item">'+svgs[i.icon]+' <span>'+i.text+'</span></div>').join('');
}

// ─── CALENDAR VIEW ───────────────────────────────────────────
function renderCalendar(){
  const v=el('viewCalendar');
  const months=['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const days=['T2','T3','T4','T5','T6','T7','CN'];
  const first=new Date(calYear,calMonth,1);const startDay=(first.getDay()+6)%7;
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();const todayStr=today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
  const subsByDay={};
  subs.forEach(s=>{const nd=new Date(s.nextDate);if(nd.getMonth()===calMonth&&nd.getFullYear()===calYear){const day=nd.getDate();if(!subsByDay[day])subsByDay[day]=[];subsByDay[day].push(s)}});
  let cells=days.map(d=>'<div class="cal-head-cell">'+d+'</div>').join('');
  for(let i=0;i<startDay;i++)cells+='<div class="cal-cell other-month"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const isToday=calYear===today.getFullYear()&&calMonth===today.getMonth()&&d===today.getDate();
    const entries=subsByDay[d]||[];
    cells+='<div class="cal-cell'+(isToday?' today':'')+'"><div class="cal-day">'+d+'</div>'+entries.map(s=>{const dl=daysLeft(s.nextDate);return'<div class="cal-dot'+(dl<=3?' urgent':'')+'" onclick="editSub('+s.id+')" title="'+esc(s.name+' - '+fmt(s.price))+'">'+esc(s.name)+'</div>'}).join('')+'</div>';
  }
  const hasSync = (user.features||[]).includes('sync');
  let btnHtml = hasSync 
    ? `<button class="btn btn-primary btn-sm" onclick="syncCalendar()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Đồng bộ (.ics)</button>`
    : `<button class="btn btn-sm" style="background:var(--surface-3);color:var(--text-muted)" onclick="openUpgradeModal()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Đồng bộ (Ultra)</button>`;

  v.innerHTML='<div class="calendar-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><h3 style="margin:0">'+months[calMonth]+' '+calYear+'</h3><div style="display:flex;gap:12px;align-items:center">'+btnHtml+'<div class="btn-group"><button class="btn btn-ghost btn-sm" onclick="calNav(-1)">&larr;</button><button class="btn btn-ghost btn-sm" onclick="calNav(0)">Hôm nay</button><button class="btn btn-ghost btn-sm" onclick="calNav(1)">&rarr;</button></div></div></div><div class="calendar-grid">'+cells+'</div>';
}
function calNav(dir){if(dir===0){calMonth=new Date().getMonth();calYear=new Date().getFullYear()}else{calMonth+=dir;if(calMonth>11){calMonth=0;calYear++}if(calMonth<0){calMonth=11;calYear--}}renderCalendar()}

window.syncCalendar = function() {
  let icsMSG = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SubTrack//SaaS Dashboard//VI\n";
  subs.forEach(s => {
    let nd = new Date(s.nextDate);
    let y = nd.getFullYear();
    let m = String(nd.getMonth()+1).padStart(2,'0');
    let d = String(nd.getDate()).padStart(2,'0');
    let start = `${y}${m}${d}`;
    
    icsMSG += "BEGIN:VEVENT\n";
    icsMSG += `DTSTART;VALUE=DATE:${start}\n`;
    icsMSG += `DTEND;VALUE=DATE:${start}\n`;
    icsMSG += `SUMMARY:[SubTrack] Thanh toán ${s.name}\n`;
    icsMSG += `DESCRIPTION:Danh mục: ${CATEGORIES[s.category]?.label||'Khác'}\\nChu kỳ: ${s.billingCycle}\\nSố tiền: ${fmt(s.price)}\n`;
    icsMSG += "END:VEVENT\n";
  });
  icsMSG += "END:VCALENDAR\n";
  
  const blob = new Blob([icsMSG], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'subtrack_calendar.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Đã tải lịch .ics thành công!');
}

// ─── ANALYTICS VIEW ──────────────────────────────────────────
function renderAnalytics(){
  const v=el('viewAnalytics');
  const toM=s=>{const p=+s.price;return{weekly:p*4.33,monthly:p,quarterly:p/3,yearly:p/12}[s.billingCycle||'monthly']||p};
  const total=subs.reduce((a,s)=>a+toM(s),0);
  const sorted=[...subs].sort((a,b)=>toM(b)-toM(a));
  let topList=sorted.slice(0,5).map((s,i)=>{const pct=total?Math.round(toM(s)/total*100):0;return'<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)"><span style="font-size:12px;color:var(--text-muted);width:20px">'+(i+1)+'</span><div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(s.name)+'</div><div style="font-size:11px;color:var(--text-muted)">'+(CATEGORIES[s.category]||CATEGORIES.other).label+'</div></div><div style="text-align:right"><div class="blur-target" style="font-size:14px;font-weight:700">'+fmt(toM(s))+'</div><div style="font-size:11px;color:var(--text-muted)">'+pct+'%</div></div></div>'}).join('');
  const avgPerSub=subs.length?fmt(total/subs.length):'—';
  
  let html='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px"><div class="stat-card"><div class="stat-label">Chi tiêu hàng tháng</div><div class="stat-value blur-target" style="font-size:28px">'+fmt(total)+'</div><div class="stat-sub">Tương đương '+fmt(total*12)+' / năm</div></div><div class="stat-card"><div class="stat-label">Trung bình mỗi gói</div><div class="stat-value blur-target" style="font-size:28px">'+avgPerSub+'</div><div class="stat-sub">Trên tổng '+subs.length+' gói đang dùng</div></div></div><div class="chart-card"><h3>Top chi tiêu cao nhất</h3>'+topList+'</div>';

  // AI Advisor block
  const hasAdvisor = (user.features||[]).includes('advisor');
  html += `<div class="chart-card" style="margin-top:20px; border:1px solid ${hasAdvisor?'var(--primary)':'var(--border)'}; position:relative; overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
       <svg class="icon" width="22" height="22" style="flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="${hasAdvisor?'var(--primary)':'var(--text-muted)'}" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
       <h3 style="margin:0;color:${hasAdvisor?'var(--primary)':'var(--text)'}">Trợ lý Tài chính AI</h3>
       ${!hasAdvisor?'<span style="font-size:10px;background:var(--amber-soft);color:var(--amber);padding:2px 8px;border-radius:12px;font-weight:700;margin-left:auto;text-transform:uppercase">Ultra</span>':''}
    </div>`;

  if (!hasAdvisor) {
    html += `
      <div style="text-align:center;padding:20px 0;filter:blur(0.5px);user-select:none">
         <div style="font-size:13px;color:var(--text-sub);margin-bottom:16px;line-height:1.5">Tính năng phân tích dữ liệu chi tiêu tự động bằng AI, đưa ra cảnh báo lãng phí và tối ưu nguồn tiền. Dành riêng cho tài khoản Ultra.</div>
         <button class="btn btn-primary btn-sm" onclick="openUpgradeModal()">Nâng cấp ngay</button>
      </div>`;
  } else {
    html += `
      <div id="aiAdvisorOutput" style="font-size:14px;color:var(--text);line-height:1.6;background:var(--surface-2);padding:16px;border-radius:8px;font-family:inherit;min-height:80px">
        <div style="color:var(--text-muted);font-size:13px">Hệ thống AI đang chờ lệnh phân tích dữ liệu của bạn...</div>
      </div>
      <button class="btn btn-primary" onclick="runAIAdvisor()" style="margin-top:16px;width:100%">Phân tích dữ liệu ngay</button>`;
  }
  html += `</div>`;
  
  v.innerHTML = html;
}

window.runAIAdvisor = function() {
  const v = document.getElementById('aiAdvisorOutput');
  if(!v) return;
  v.innerHTML = '<span style="color:var(--primary);font-weight:600;display:flex;align-items:center;gap:8px"><svg class="icon" width="16" height="16" style="flex-shrink:0;animation:spin 1s linear infinite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> AI đang quét dữ liệu...</span>';
  setTimeout(()=>{
    const toM=s=>{const p=+s.price;return{weekly:p*4.33,monthly:p,quarterly:p/3,yearly:p/12}[s.billingCycle||'monthly']||p};
    const total=subs.reduce((a,s)=>a+toM(s),0);
    const ents = subs.filter(s=>s.category==='entertainment');
    const entSum = ents.reduce((a,s)=>a+toM(s),0);
    
    let advice = `<div style="margin-bottom:12px">Chào <b>${user.username}</b>. Dưới đây là kết quả phân tích theo thời gian thực của tôi:</div>`;
    advice += `<ul style="padding-left:20px;margin-bottom:0;display:flex;flex-direction:column;gap:8px">`;
    if(entSum > total * 0.4) {
      advice += `<li><span style="color:var(--amber);font-weight:600">Cảnh báo:</span> Nhóm "Giải trí" chiếm tới ${Math.round(entSum/total*100)}% tổng chi của bạn. Bạn có đang đăng ký quá nhiều dịch vụ stream như ${ents.map(e=>e.name).slice(0,2).join(', ')}? Hãy cân nhắc huỷ món ít xài nhé.</li>`;
    } else {
      advice += `<li><span style="color:var(--green);font-weight:600">Tốt:</span> Chi tiêu giải trí của bạn trong giới hạn hợp lý. Bạn kiểm soát tài chính khá tốt.</li>`;
    }
    
    const nearExp = subs.filter(s=>daysLeft(s.nextDate)<=7);
    if(nearExp.length) {
      advice += `<li><span style="color:var(--primary);font-weight:600">Lưu ý:</span> Bạn có ${nearExp.length} gói sắp thanh toán trong 7 ngày tới (VD: ${nearExp[0].name}). Đừng quên chừa <b>${fmt(nearExp.reduce((a,x)=>a+x.price,0))}</b> trong thẻ thanh toán.</li>`;
    } else {
      advice += `<li>Không có gói nào sắp hết hạn trong tuần này.</li>`;
    }
    
    advice += `<li><span style="color:var(--text-sub)">Mẹo: Dùng tính năng Đồng bộ Lịch 1 chạm của gói Ultra để đẩy lịch đáo hạn vào điện thoại ngay nhé!</span></li>`;
    advice += `</ul>`;
    
    v.style.opacity='0';
    setTimeout(()=>{
      v.innerHTML = advice;
      v.style.transition='opacity 0.5s ease';
      v.style.opacity='1';
    }, 200);
  }, 1500);
}

// ─── ARCHIVE VIEW ────────────────────────────────────────────
function renderArchive(){
  const v=el('viewArchive');
  const archived=JSON.parse(localStorage.getItem('st_archived')||'[]');
  const totalSaved=archived.reduce((a,s)=>{const months=monthsSince(s.archivedAt||s.startDate);const p=+s.price;return a+p*months},0);
  let list='<div class="empty-state"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/></svg><h3>Chưa có gói lưu trữ</h3><p>Khi bạn lưu trữ một gói, nó sẽ xuất hiện ở đây.</p></div>';
  if(archived.length){
    list='<div class="sub-grid">'+archived.map(s=>{const cat=CATEGORIES[s.category]||CATEGORIES.other;const logo=getLogo(s.name);return'<div class="card" style="opacity:.7"><div class="card-head"><div class="svc-logo" style="background:'+logo.bg+';color:'+logo.text+'">'+(logo.type==='img'?'<img src="'+logo.url+'">':'<span>'+logo.init+'</span>')+'</div><div class="svc-details"><div class="svc-name">'+esc(s.name)+'</div><div class="svc-account">Đã lưu trữ</div></div></div><div class="card-price"><span class="amount blur-target">'+fmt(s.price)+'</span><span class="cycle">'+(CYCLE_LABEL[s.billingCycle]||'/tháng')+'</span></div><div class="card-meta"><span class="badge badge-cat"><span class="cat-dot" style="background:'+cat.color+'"></span>'+cat.label+'</span></div><div class="card-actions"><button class="btn btn-ghost btn-sm" onclick="restoreSub('+s.id+')">Khôi phục</button><button class="btn btn-danger btn-sm" onclick="permDelete('+s.id+')">Xóa vĩnh viễn</button></div></div>'}).join('')+'</div>';
  }
  v.innerHTML='<div class="archive-banner"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><div><div class="archive-stat blur-target">'+fmt(totalSaved)+'</div><div class="archive-label">Ước tính tiết kiệm từ gói đã lưu trữ</div></div></div>'+list;
}

// ─── PRESETS ─────────────────────────────────────────────────
function buildPresets(){
  const dd=el('presetDropdown');
  dd.innerHTML=PRESETS.map((p,i)=>{const b=BRANDS.find(br=>br.keys.some(k=>p.name.toLowerCase().includes(k)));const img=b?'https://www.google.com/s2/favicons?domain='+b.domain+'&sz=64':null;const cat=CATEGORIES[p.cat]||CATEGORIES.other;return'<div class="preset-item" data-idx="'+i+'">'+(img?'<img src="'+img+'">':'<div style="width:22px;height:22px;border-radius:6px;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--text-muted)">'+p.name[0]+'</div>')+'<div><div class="p-name">'+p.name+'</div><div class="p-cat">'+cat.label+'</div></div></div>'}).join('');
  const wrap=el('presetWrap'),trigger=el('presetTrigger'),label=el('presetLabel');
  trigger.onclick=e=>{e.stopPropagation();wrap.classList.toggle('open')};
  dd.querySelectorAll('.preset-item').forEach(item=>{item.onclick=e=>{
    e.stopPropagation();wrap.classList.remove('open');
    const p=PRESETS[item.dataset.idx];label.textContent=p.name;label.classList.add('selected-label');
    el('fName').value=p.name;el('fCategory').value=p.cat;updateExpiryPreview();
  }});
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))wrap.classList.remove('open')});
}

// ─── FORM / CRUD ─────────────────────────────────────────────
function setupForm(){
  ['fStart','fCycle','fCycleCount'].forEach(id=>{el(id)?.addEventListener('change',updateExpiryPreview);el(id)?.addEventListener('input',updateExpiryPreview)});
  document.querySelectorAll('.pay-chip').forEach(btn=>{btn.onclick=()=>{
    const m=btn.dataset.m;if(selPay===m){selPay='';btn.classList.remove('sel');el('fPayment').value=''}
    else{selPay=m;document.querySelectorAll('.pay-chip').forEach(b=>b.classList.remove('sel'));btn.classList.add('sel');el('fPayment').value=m}
  }});
}

function updateExpiryPreview(){
  const start=el('fStart').value,cycle=el('fCycle').value,count=parseInt(el('fCycleCount').value)||1;
  const prev=el('expiryPreview');if(!start){prev.classList.remove('show');return}
  const next=computeNext(start,cycle,count);el('expiryVal').textContent=fmtDate(next.toISOString());prev.classList.add('show');
}

el('addForm').addEventListener('submit',async e=>{
  e.preventDefault();const id=el('editId').value;
  const name=el('fName').value.trim(),price=parseFloat(el('fPrice').value),start=el('fStart').value;
  if(!name||isNaN(price)||!start)return toast('Vui lòng điền đủ thông tin bắt buộc','warn');
  const cycle=el('fCycle').value,count=parseInt(el('fCycleCount').value)||1;
  const nextDate=computeNext(start,cycle,count);
  const payload={name,accountEmail:el('fAccount').value.trim(),price,billingCycle:cycle,cycleCount:count,startDate:start,nextDate:nextDate.toISOString(),billingDay:new Date(start).getDate(),members:parseInt(el('fMembers').value)||1,isTrial:el('fTrial').checked,paymentMethod:el('fPayment').value.trim(),category:el('fCategory').value,notes:el('fNotes').value.trim(),reminders:Array.from(document.querySelectorAll('#fReminders input:checked')).map(e=>e.value).join(',')};
  try{const r=await fetch(id?'/api/subscriptions/'+id:'/api/subscriptions',{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});
  if(r.ok){toast(id?'Đã cập nhật thành công':'Đã thêm gói mới');closeModal('addModal');resetForm();await loadData()}
  else{const err=await r.json();
    if(err.needUpgrade) {
       closeModal('addModal');
       openUpgradeModal();
    }
    toast(err.error||'Có lỗi xảy ra','warn');
  }
  }catch{toast('Lỗi kết nối server','warn')}
});

function resetForm(){
  el('addForm').reset();el('editId').value='';el('modalTitle').textContent='Thêm gói đăng ký';
  el('submitBtn').textContent='Lưu gói đăng ký';el('expiryPreview').classList.remove('show');
  el('presetLabel').textContent='Chọn dịch vụ phổ biến...';el('presetLabel').classList.remove('selected-label');
  document.querySelectorAll('.pay-chip').forEach(b=>b.classList.remove('sel'));selPay='';
}

function editSub(id){
  const s=subs.find(x=>x.id===id);if(!s)return;resetForm();
  el('editId').value=id;el('modalTitle').textContent='Chỉnh sửa: '+s.name;
  el('fName').value=s.name;el('fAccount').value=s.accountEmail||'';
  el('fPrice').value=s.price;el('fStart').value=s.startDate?.slice(0,10);
  el('fCycle').value=s.billingCycle||'monthly';el('fCycleCount').value=s.cycleCount||1;
  el('fMembers').value=s.members||1;el('fTrial').checked=!!s.isTrial;
  el('fCategory').value=s.category||'other';el('fPayment').value=s.paymentMethod||'';
  el('fNotes').value=s.notes||'';
  const rems=s.reminders?s.reminders.split(','):[];
  document.querySelectorAll('#fReminders input').forEach(e=>e.checked=rems.includes(e.value));
  updateExpiryPreview();openModal('addModal');
}

async function archiveSub(id){
  if(!confirm('Lưu trữ gói đăng ký này?'))return;
  const s=subs.find(x=>x.id===id);if(!s)return;
  const archived=JSON.parse(localStorage.getItem('st_archived')||'[]');
  archived.push({...s,archivedAt:new Date().toISOString()});
  localStorage.setItem('st_archived',JSON.stringify(archived));
  await fetch('/api/subscriptions/'+id,{method:'DELETE',credentials:'include'});
  toast('Đã lưu trữ gói đăng ký');await loadData();if(currentView==='archive')renderArchive();
}

function restoreSub(id){
  let archived=JSON.parse(localStorage.getItem('st_archived')||'[]');
  const s=archived.find(x=>x.id===id);if(!s)return;
  archived=archived.filter(x=>x.id!==id);localStorage.setItem('st_archived',JSON.stringify(archived));
  delete s.archivedAt;delete s.isArchived;delete s.id;
  fetch('/api/subscriptions',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(s)}).then(()=>{toast('Đã khôi phục gói');loadData();renderArchive()});
}

function permDelete(id){
  if(!confirm('Xóa vĩnh viễn gói này?'))return;
  let archived=JSON.parse(localStorage.getItem('st_archived')||'[]');
  archived=archived.filter(x=>x.id!==id);localStorage.setItem('st_archived',JSON.stringify(archived));
  toast('Đã xóa vĩnh viễn');renderArchive();
}

// ─── SHARE / VIETQR ─────────────────────────────────────────
function shareSub(id){
  const s=subs.find(x=>x.id===id);if(!s)return;
  const pPerson=Math.round(+s.price/Math.max(1,+s.members));
  const bankId=localStorage.getItem('st_bankId');
  const bankAcc=localStorage.getItem('st_bankAccount');
  const bankName=localStorage.getItem('st_bankName');
  if(bankId&&bankAcc){
    const info=encodeURIComponent(s.name+' thang '+((new Date).getMonth()+1));
    const qrUrl='https://img.vietqr.io/image/'+bankId+'-'+bankAcc+'-compact2.png?amount='+pPerson+'&addInfo='+info+(bankName?'&accountName='+encodeURIComponent(bankName):'');
    el('qrContent').innerHTML='<img src="'+qrUrl+'" alt="VietQR"><div class="qr-amount blur-target">'+fmt(pPerson)+'</div><div class="qr-info"><strong>'+esc(s.name)+'</strong><br>Ngân hàng: '+bankId+' — '+bankAcc+'<br>'+(bankName||'')+'</div>';
    openModal('qrModal');
  }else{
    const msg='Chia tiền '+s.name+': '+fmt(pPerson)+' — chuyển khoản giúp mình nhé!';
    navigator.clipboard.writeText(msg).then(()=>toast('Đã copy lời nhắn chia tiền')).catch(()=>toast(msg));
  }
}

// ─── SCANNER ─────────────────────────────────────────────────
function initScanner(){
  const fileEl=el('scanFile'),camEl=el('scanCamera'),s1=el('scanStep1'),s2=el('scanStep2'),s3=el('scanStep3');
  fileEl.onchange=()=>fileEl.files[0]&&processOCR(fileEl.files[0]);
  camEl.onchange=()=>camEl.files[0]&&processOCR(camEl.files[0]);
  async function processOCR(file){
    el('scanPreview').src=URL.createObjectURL(file);s1.style.display='none';s2.style.display='block';s3.style.display='none';
    try{const{data}=await Tesseract.recognize(file,'vie+eng',{logger:m=>{if(m.status==='recognizing text')el('scanStatus').textContent='Đang quét... '+Math.round(m.progress*100)+'%'}});
    const text=data.text||'';el('scanRaw').textContent=text;
    const email=text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const prices=[...text.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/g)].map(m=>parseInt(m[1].replace(/[.,]/g,''))).filter(p=>p>1000).sort((a,b)=>b-a);
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
    let name='';for(const b of BRANDS){if(b.keys.some(k=>text.toLowerCase().includes(k))){name=b.keys[0][0].toUpperCase()+b.keys[0].slice(1);break}}
    if(!name&&lines.length)name=lines.find(l=>l.length>=3&&!/^\d+$/.test(l))||'';
    el('sr-name').value=name;el('sr-price').value=prices[0]||'';el('sr-account').value=email?email[0]:'';
    s2.style.display='none';s3.style.display='block';
    }catch(e){s2.style.display='none';s1.style.display='block';toast('Lỗi nhận diện: '+e.message,'warn')}
  }
  el('scanRetryBtn').onclick=()=>{s3.style.display='none';s1.style.display='block'};
  el('scanConfirmBtn').onclick=()=>{resetForm();el('fName').value=el('sr-name').value;el('fPrice').value=el('sr-price').value;el('fAccount').value=el('sr-account').value;el('fStart').value=el('sr-date').value;closeModal('scanModal');openModal('addModal')};
}

// ─── SETTINGS ────────────────────────────────────────────────
el('settingsForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const budget=el('budgetInput').value;if(budget)localStorage.setItem('st_budget',budget);else localStorage.removeItem('st_budget');
  const bankId=el('bankId').value;const bankAcc=el('bankAccount').value;const bankName=el('bankName').value;
  if(bankId)localStorage.setItem('st_bankId',bankId);else localStorage.removeItem('st_bankId');
  if(bankAcc)localStorage.setItem('st_bankAccount',bankAcc);else localStorage.removeItem('st_bankAccount');
  if(bankName)localStorage.setItem('st_bankName',bankName);else localStorage.removeItem('st_bankName');
  const r=await fetch('/api/user_contacts',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({tgChatId:el('tgChatId').value.trim(),email:el('userEmail').value.trim()})});
  if(r.ok){toast('Đã lưu cài đặt');closeModal('settingsModal');renderBudget()}
});

function loadLocalSettings(){
  el('budgetInput').value=localStorage.getItem('st_budget')||'';
  el('bankId').value=localStorage.getItem('st_bankId')||'';
  el('bankAccount').value=localStorage.getItem('st_bankAccount')||'';
  el('bankName').value=localStorage.getItem('st_bankName')||'';
}

window.applyTheme = function() {
  const t = localStorage.getItem('premium_primary_theme');
  if(t) document.documentElement.style.setProperty('--primary', t);
}

// ─── GMAIL CONNECT ───────────────────────────────────────────
window.connectGmail = async function() {
  const btn    = el('gmailConnectBtn');
  const status = el('gmailConnectStatus');

  btn.disabled = true;
  btn.innerHTML = '<svg class="icon" width="16" height="16" style="animation:spin 1s linear infinite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Đang kết nối...';
  status.style.display = 'none';

  try {
    const r    = await fetch('/api/gmail/auth-url', { credentials: 'include' });
    const data = await r.json();
    if (!data.authUrl) throw new Error('Không lấy được auth URL');

    // Thêm state=username để server biết user là ai (vì popup không có session)
    const url = data.authUrl + '&state=' + encodeURIComponent(user?.username || '');
    const popup = window.open(url, 'gmail_oauth', 'width=520,height=680,left=200,top=80');

    status.style.display = 'block';
    status.style.background = 'var(--surface-2)';
    status.style.color = 'var(--text-sub)';
    status.innerHTML = '⏳ Đăng nhập Google trong cửa sổ popup rồi bấm "Tiếp tục"...';

    // Nhận thông báo từ popup qua postMessage
    const onMessage = (e) => {
      if (e.data?.type !== 'gmail_connected') return;
      window.removeEventListener('message', onMessage);
      clearInterval(pollClose);
      showSuccess();
    };
    window.addEventListener('message', onMessage);

    // Dự phòng: kiểm tra khi popup đóng
    const pollClose = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(pollClose);
        window.removeEventListener('message', onMessage);
        showSuccess();
      }
    }, 1000);

    function showSuccess() {
      status.style.background = 'var(--green-soft)';
      status.style.color = 'var(--green)';
      status.innerHTML = '✅ Đã kết nối! Server đang tự động cấu hình forward email trong nền (~30-60s).';
      btn.disabled = false;
      btn.style.background = 'var(--green)';
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Đã kết nối Gmail';
    }

  } catch(err) {
    status.style.display = 'block';
    status.style.background = 'var(--red-soft)';
    status.style.color = 'var(--red)';
    status.innerHTML = '❌ Lỗi: ' + err.message;
    btn.disabled = false;
    btn.innerHTML = 'Kết nối Gmail của tôi';
  }
};

// ─── EXPORT ──────────────────────────────────────────────────
function exportCSV(){
  if(!subs.length)return toast('Không có dữ liệu','warn');
  const H=['Tên','Email','Giá','Chu kỳ','Ngày BĐ','Hết hạn','Danh mục'];
  const rows=subs.map(s=>[s.name,s.accountEmail||'',s.price,s.billingCycle,s.startDate,s.nextDate,s.category||'']);
  const csv='\uFEFF'+[H,...rows].map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='subtrack_'+new Date().toISOString().slice(0,10)+'.csv';a.click();toast('Đã tải xuống file CSV');
}

// ─── NOTIFICATIONS ───────────────────────────────────────────
async function autoNotify(){for(const s of subs){const d=daysLeft(s.nextDate);if(d>=0&&d<=3){try{fetch('/api/notify',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({subscriptionId:s.id})})}catch{}}}}

// ─── PRIVACY MODE ────────────────────────────────────────────
function togglePrivacy(){
  privacyOn=!privacyOn;document.body.classList.toggle('privacy-mode',privacyOn);
  const icon=el('privacyIcon');
  icon.innerHTML=privacyOn?'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>':'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

// ─── EVENTS ──────────────────────────────────────────────────
function bindEvents(){
  el('addBtn').onclick=()=>{resetForm();openModal('addModal')};
  el('closeAdd').onclick=()=>closeModal('addModal');
  el('navSettings').onclick=()=>{el('tgChatId').value=contacts.tgChatId||'';el('userEmail').value=contacts.email||'';loadLocalSettings();openModal('settingsModal')};
  el('closeSettings').onclick=()=>closeModal('settingsModal');
  el('logoutBtn').onclick=async()=>{if(!confirm('Đăng xuất?'))return;await fetch('/api/logout',{method:'POST',credentials:'include'});location.href='/login.html'};
  el('exportBtn').onclick=exportCSV;
  el('navScan').onclick=()=>{openModal('scanModal');initScanner()};
  el('closeScan').onclick=()=>closeModal('scanModal');
  el('privacyToggle').onclick=togglePrivacy;
  el('themeToggle').onclick=toggleTheme;
  el('searchInput').addEventListener('input',renderContent);
  el('sortSelect').addEventListener('change',e=>{sortType=e.target.value;renderContent()});
  // Profile & Activity
  el('navProfile').onclick=openProfile;
  el('navActivity').onclick=openActivity;
  const utBtn=el('navUpgradeTier'); if(utBtn) utBtn.onclick=openUpgradeModal;
  // Filters
  document.querySelectorAll('[data-f]').forEach(c=>{c.onclick=()=>{document.querySelectorAll('[data-f]').forEach(x=>x.classList.remove('active'));c.classList.add('active');filter=c.dataset.f;renderContent()}});
  // Views
  el('viewGrid').onclick=function(){this.classList.add('active');el('viewList').classList.remove('active');viewType='grid';renderContent()};
  el('viewList').onclick=function(){this.classList.add('active');el('viewGrid').classList.remove('active');viewType='list';renderContent()};
  // Navigation
  window.switchView = function(view) {
    if(!view) view = 'overview';
    const btn = document.querySelector(`[data-view="${view}"]`);
    if(!btn) return;
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
    currentView=view;
    document.querySelectorAll('.view-section').forEach(s=>s.classList.remove('active'));
    const target=el('view'+view.charAt(0).toUpperCase()+view.slice(1));if(target)target.classList.add('active');
    el('pageTitle').textContent=btn.querySelector('span').textContent;
    if(view==='calendar')renderCalendar();
    if(view==='analytics')renderAnalytics();
    if(view==='archive')renderArchive();
  };

  document.querySelectorAll('[data-view]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      if(btn.disabled || btn.classList.contains('locked')) return;
      window.location.hash = btn.dataset.view;
    });
  });

  window.addEventListener('hashchange', () => {
    switchView(window.location.hash.replace('#', ''));
  });

  // Modal backdrop close
  window.addEventListener('click',e=>{if(e.target.classList.contains('modal'))e.target.classList.remove('open');if(e.target.id==='cmdPalette')closeCmdPalette()});
  // Mobile menu
  const menuBtn=el('menuToggle');if(menuBtn)menuBtn.onclick=()=>el('sidebar').classList.toggle('open');
  // Command Palette
  initCmdPalette();
  // Profile form
  el('profileForm').addEventListener('submit',saveProfile);
  el('passwordForm').addEventListener('submit',changePassword);
  // PWA
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

// ─── THEME TOGGLE ────────────────────────────────────────────
function toggleTheme(){
  const isLight=document.body.classList.toggle('light');
  localStorage.setItem('st_theme',isLight?'light':'dark');
  const icon=el('themeIcon');
  icon.innerHTML=isLight?'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>':'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
}
function loadTheme(){if(localStorage.getItem('st_theme')==='light'){document.body.classList.add('light');toggleTheme();toggleTheme()}}

// ─── COMMAND PALETTE ─────────────────────────────────────────
function initCmdPalette(){
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openCmdPalette()}
    if(e.key==='Escape')closeCmdPalette();
  });
  const input=el('cmdInput');
  input.addEventListener('input',()=>renderCmdResults(input.value));
}

const CMD_ACTIONS=[
  {label:'Thêm gói đăng ký',icon:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',action:()=>{closeCmdPalette();resetForm();openModal('addModal')},keys:'thêm,add,mới'},
  {label:'Xuất CSV',icon:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',action:()=>{closeCmdPalette();exportCSV()},keys:'export,xuất,csv'},
  {label:'Mở cài đặt',icon:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33"/>',action:()=>{closeCmdPalette();el('navSettings').click()},keys:'settings,cài đặt'},
  {label:'Hồ sơ cá nhân',icon:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',action:()=>{closeCmdPalette();openProfile()},keys:'profile,hồ sơ'},
  {label:'Nhật ký hoạt động',icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',action:()=>{closeCmdPalette();openActivity()},keys:'log,nhật ký,activity'},
  {label:'Quét hoá đơn',icon:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',action:()=>{closeCmdPalette();el('navScan').click()},keys:'scan,quét,ocr'},
  {label:'Chuyển theme sáng/tối',icon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',action:()=>{closeCmdPalette();toggleTheme()},keys:'theme,sáng,tối,dark,light'},
  {label:'Ẩn/hiện số tiền',icon:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',action:()=>{closeCmdPalette();togglePrivacy()},keys:'privacy,ẩn,blur'},
  {label:'Lịch thanh toán',icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>',action:()=>{closeCmdPalette();document.querySelector('[data-view="calendar"]').click()},keys:'calendar,lịch'},
  {label:'Phân tích chi tiêu',icon:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',action:()=>{closeCmdPalette();document.querySelector('[data-view="analytics"]').click()},keys:'analytics,phân tích'},
  {label:'Đăng xuất',icon:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',action:()=>{closeCmdPalette();el('logoutBtn').click()},keys:'logout,đăng xuất'},
];

function openCmdPalette(){el('cmdPalette').classList.add('open');el('cmdInput').value='';renderCmdResults('');setTimeout(()=>el('cmdInput').focus(),50)}
function closeCmdPalette(){el('cmdPalette').classList.remove('open')}

function renderCmdResults(q){
  const results=el('cmdResults');q=q.toLowerCase().trim();
  // Search subscriptions
  const matchedSubs=q?subs.filter(s=>s.name.toLowerCase().includes(q)).slice(0,5):[];
  // Search commands
  const matchedCmds=q?CMD_ACTIONS.filter(a=>a.label.toLowerCase().includes(q)||a.keys.split(',').some(k=>k.includes(q))):CMD_ACTIONS;
  let html='';
  if(matchedSubs.length){
    html+='<div style="padding:4px 14px 2px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Gói đăng ký</div>';
    matchedSubs.forEach(s=>{html+='<div class="cmd-item" onclick="closeCmdPalette();editSub('+s.id+')"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span>'+esc(s.name)+'</span><span class="cmd-shortcut">'+fmt(s.price)+'</span></div>'});
  }
  if(matchedCmds.length){
    html+='<div style="padding:4px 14px 2px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Lệnh</div>';
    matchedCmds.forEach((a,i)=>{html+='<div class="cmd-item" data-cmd="'+i+'"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+a.icon+'</svg><span>'+a.label+'</span></div>'});
  }
  if(!html)html='<div class="cmd-empty">Không tìm thấy kết quả</div>';
  results.innerHTML=html;
  results.querySelectorAll('[data-cmd]').forEach(el=>{el.onclick=()=>CMD_ACTIONS[el.dataset.cmd].action()});
}

// ─── PROFILE ─────────────────────────────────────────────────
async function openProfile(){
  try{const p=await fetch('/api/profile',{credentials:'include'}).then(r=>r.json());
  el('pUsername').value=p.username||'';el('pEmail').value=p.email||'';el('pPhone').value=p.phone||'';
  }catch{}
  openModal('profileModal');
}
async function saveProfile(e){
  e.preventDefault();
  const r=await fetch('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({email:el('pEmail').value.trim(),phone:el('pPhone').value.trim()})});
  if(r.ok){toast('Đã cập nhật hồ sơ');closeModal('profileModal')}else{const d=await r.json();toast(d.error||'Lỗi')}
}
async function changePassword(e){
  e.preventDefault();const st=el('pwStatus');
  const r=await fetch('/api/change-password',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({currentPassword:el('pwCurrent').value,newPassword:el('pwNew').value})});
  const d=await r.json();
  st.innerHTML=r.ok?'<span style="color:var(--green)">Đổi mật khẩu thành công!</span>':'<span style="color:var(--red)">'+(d.error||'Lỗi')+'</span>';
  if(r.ok){el('pwCurrent').value='';el('pwNew').value=''}
}

// ─── ACTIVITY LOG ────────────────────────────────────────────
async function openActivity(){
  openModal('activityModal');
  try{const logs=await fetch('/api/activity',{credentials:'include'}).then(r=>r.json());
  const list=el('activityList');
  if(!logs.length){list.innerHTML='<div class="cmd-empty">Chưa có hoạt động nào</div>';return}
  const actionMap={add_sub:'act-add',edit_sub:'act-edit',delete_sub:'act-delete',price_change:'act-edit',checkin:'act-add',change_password:'act-default',update_profile:'act-default'};
  list.innerHTML=logs.map(l=>'<div class="activity-item"><div class="activity-dot '+(actionMap[l.action]||'act-default')+'"></div><div style="flex:1"><div class="activity-text">'+esc(l.detail||l.action)+'</div><div class="activity-time">'+fmtDateTime(l.created_at)+'</div></div></div>').join('');
  }catch{el('activityList').innerHTML='<div class="cmd-empty">Lỗi tải dữ liệu</div>'}
}

// ─── PAID STREAK ─────────────────────────────────────────────
async function checkinSub(id){
  const r=await fetch('/api/subscriptions/'+id+'/checkin',{method:'POST',credentials:'include'});
  if(r.ok){const d=await r.json();toast('Check-in thành công! Streak: '+d.streak);await loadData()}
}

// ─── HELPERS ─────────────────────────────────────────────────
function el(id){return document.getElementById(id)}
function openModal(id){el(id).classList.add('open')}
function closeModal(id){el(id).classList.remove('open')}
function fmt(n){return Math.round(n).toLocaleString('vi-VN')+'đ'}
function fmtDate(s){return new Date(s).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}
function fmtDateTime(s){if(!s)return'—';const d=new Date(s);return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
function esc(s){const d=document.createElement('div');d.appendChild(document.createTextNode(String(s||'')));return d.innerHTML}
function monthsSince(dateStr){const d=new Date(dateStr);const now=new Date();return(now.getFullYear()-d.getFullYear())*12+(now.getMonth()-d.getMonth())}

function getLogo(name){
  const n=(name||'').toLowerCase();
  for(const b of BRANDS){if(b.keys.some(k=>n.includes(k)))return{type:'img',url:'https://www.google.com/s2/favicons?domain='+b.domain+'&sz=128',bg:'var(--surface-2)',text:'#fff'}}
  const pal=['#6366f1','#8b5cf6','#ec4899','#14b8a6','#2563eb','#f97316','#22c55e'];
  const idx=[...(name||' ')].reduce((a,c)=>a+c.charCodeAt(0),0)%pal.length;
  return{type:'text',bg:pal[idx],text:'#fff',init:(name||'?')[0]?.toUpperCase()};
}

function toast(msg,type){
  const t=el('toast');el('toastMsg').textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2000);
}

// ─── UPGRADE/TIERS ───────────────────────────────────────────
function renderFeatures() {
  const feats = user.features || [];
  
  // Analytics
  if(!feats.includes('analytics')) {
    const btn=document.querySelector('[data-view="analytics"]');
    if(btn){btn.onclick=(e)=>{e.stopPropagation();openUpgradeModal();}; btn.querySelector('span').innerHTML+=' <svg class="icon badge" style="width:14px;height:14px;margin-left:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}
  }
  
  // Calendar
  if(!feats.includes('calendar')) {
    const btn=document.querySelector('[data-view="calendar"]');
    if(btn){btn.onclick=(e)=>{e.stopPropagation();openUpgradeModal();}; btn.querySelector('span').innerHTML+=' <svg class="icon badge" style="width:14px;height:14px;margin-left:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}
  }

  // Scan
  if(!feats.includes('ocr')) {
    const btn=document.getElementById('navScan');
    if(btn){btn.onclick=(e)=>{e.stopPropagation();openUpgradeModal();}; btn.querySelector('span').innerHTML+=' <svg class="icon badge" style="width:14px;height:14px;margin-left:4px" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}
  }
  
  // Custom Theme
  const hasTheme = feats.includes('theme');
  const themeLock = document.getElementById('themeLock');
  if (themeLock) themeLock.style.display = hasTheme ? 'none' : 'inline-block';
  document.querySelectorAll('.theme-circle').forEach(c => {
    if (!hasTheme) {
      c.classList.add('locked');
      c.onclick = openUpgradeModal;
    } else {
      c.classList.remove('locked');
      c.onclick = () => {
        document.querySelectorAll('.theme-circle').forEach(x=>x.classList.remove('sel'));
        c.classList.add('sel');
        localStorage.setItem('premium_primary_theme', c.dataset.theme);
        applyTheme();
      };
    }
    const curTheme = localStorage.getItem('premium_primary_theme') || '#6366f1';
    if(c.dataset.theme === curTheme) c.classList.add('sel');
    else c.classList.remove('sel');
  });
}

async function openUpgradeModal() {
  openModal('upgradeModal');
  const pt=document.getElementById('pricingTable');
  pt.innerHTML='Đang tải thông tin gói...';
  try {
    const [resTiers, resReq] = await Promise.all([
      fetch('/api/admin/tiers', {credentials:'include'}),
      fetch('/api/upgrade-requests', {credentials:'include'})
    ]);
    const tiers=await resTiers.json();
    const pendingReq=await resReq.json();
    
    if(pendingReq && pendingReq.status==='pending') {
      pt.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text);width:100%">
        <svg class="icon badge" style="width:48px;height:48px;color:var(--amber);margin-bottom:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h3 style="font-size:20px;font-weight:700;margin-bottom:8px">Yêu cầu đang chờ duyệt</h3>
        <p style="color:var(--text-sub)">Bạn đã gửi yêu cầu nâng cấp lên gói <strong>${pendingReq.target_tier.toUpperCase()}</strong>. Vui lòng chờ Admin kiểm tra giao dịch và phê duyệt nhé!</p>
      </div>`;
      return;
    }

    let html='';
    tiers.forEach(t=>{
      const isCurrent = user.tier === t.id;
      const f = t.features || [];
      const featsHTML = 
        `<div style="margin:20px 0;text-align:left;font-size:14px;color:var(--text)">
          <div style="margin-bottom:8px;font-weight:700;font-size:20px">${t.price>0 ? fmt(t.price) : 'Miễn phí'}</div>
          <div style="margin-bottom:8px">✔️ Tối đa ${t.max_subs===9999?'Không giới hạn':t.max_subs} gói</div>
          ${f.includes('analytics')?'<div style="margin-bottom:8px">✔️ Thống kê chuyên sâu</div>':'<div style="margin-bottom:8px;color:var(--text-muted);text-decoration:line-through">❌ Thống kê chuyên sâu</div>'}
          ${f.includes('ocr')?'<div style="margin-bottom:8px">✔️ Quét hóa đơn AI</div>':'<div style="margin-bottom:8px;color:var(--text-muted);text-decoration:line-through">❌ Quét hóa đơn AI</div>'}
          ${f.includes('advisor')?'<div style="margin-bottom:8px;color:var(--amber);font-weight:600">✨ Trợ lý Tài chính AI</div>':''}
          ${f.includes('sync')?'<div style="margin-bottom:8px;color:var(--primary);font-weight:600">✨ Đồng bộ Lịch 1 chạm</div>':''}
          ${f.includes('theme')?'<div style="margin-bottom:8px;color:var(--green);font-weight:600">✨ Premium Themes</div>':''}
          ${f.includes('calendar')?'<div style="margin-bottom:8px">✔️ Lịch thanh toán</div>':''}
          ${f.includes('export')?'<div style="margin-bottom:8px">✔️ Xuất dữ liệu CSV</div>':''}
        </div>`;
      
      const tJson = esc(JSON.stringify({id: t.id, name: t.name, price: t.price}));
      html+=`<div class="card" style="padding:24px;border:2px solid ${isCurrent?'var(--primary)':'transparent'};background:var(--surface);border-radius:16px;display:flex;flex-direction:column">
        <h3 style="font-size:24px;margin-bottom:4px;color:${isCurrent?'var(--primary)':'var(--text)'}">${t.name} ${isCurrent?'(Hiện tại)':''}</h3>
        <div style="font-size:13px;color:var(--text-sub);padding-bottom:16px;border-bottom:1px solid var(--border)">Gói ${t.name} cho quản lý cá nhân</div>
        ${featsHTML}
        ${isCurrent ? 
          `<button class="btn btn-ghost" style="margin-top:auto" disabled>Đang sử dụng</button>` : 
          `<button class="btn btn-primary" style="margin-top:auto" onclick="showCheckout('${t.id}', '${t.name}', ${t.price||0})">Cách nâng cấp</button>`
        }
      </div>`;
    });
    pt.innerHTML=html;
  }catch{pt.innerHTML='Lỗi tải thông tin gói. Vui lòng thử lại.'}
}

async function showCheckout(tId, tName, tPrice) {
  const pt=document.getElementById('pricingTable');
  pt.innerHTML='Đang tải thông tin chuyển khoản...';
  try {
    const res=await fetch('/api/admin/public-settings');
    const b=await res.json();
    if(!b.bank_account) {
      pt.innerHTML=`<div style="text-align:center;width:100%;color:var(--text-sub);padding:40px">Hệ thống chưa cấu hình tài khoản ngân hàng. Vui lòng liên hệ Admin.</div>`;
      return;
    }
    const content = `UPGRADE ${user.username} ${tId}`.toUpperCase().replace(/\s+/g, '');
    const qrUrl = `https://img.vietqr.io/image/${b.bank_name}-${b.bank_account}-compact2.jpg?amount=${tPrice}&addInfo=${content}&accountName=${b.bank_receiver}`;
    
    pt.innerHTML = `
      <div style="text-align:center;width:100%">
        <h3 style="font-size:20px;margin-bottom:8px;color:var(--text)">Nâng cấp lên gói ${tName}</h3>
        <p style="color:var(--text-sub);margin-bottom:24px">Vui lòng quét mã QR hoặc chuyển khoản thủ công theo thông tin bên dưới để hoàn tất nâng cấp.</p>
        
        <div style="display:flex;flex-wrap:wrap;gap:24px;justify-content:center;margin-bottom:24px">
          <div style="background:#fff;padding:16px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.15);width:fit-content;margin:0 auto;display:flex;flex-direction:column;align-items:center">
            <img src="${qrUrl}" alt="QR Code" style="max-width:240px;height:auto;border-radius:8px;display:block">
            <div style="margin-top:12px;font-size:13px;font-weight:600;color:#333;display:flex;align-items:center;gap:6px">
              Quét bằng App Ngân Hàng
            </div>
          </div>
          
          <div style="text-align:left;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;flex:1;min-width:260px">
            <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px;text-transform:uppercase;display:block;margin-bottom:4px">Ngân hàng</span><strong style="color:var(--primary);font-size:16px">${esc(b.bank_name)}</strong></div>
            <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px;text-transform:uppercase;display:block;margin-bottom:4px">Chủ tài khoản</span><strong style="font-size:16px">${esc(b.bank_receiver)}</strong></div>
            <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px;text-transform:uppercase;display:block;margin-bottom:4px">Số tài khoản</span><strong style="font-size:16px;font-family:'JetBrains Mono',monospace">${esc(b.bank_account)}</strong></div>
            <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px;text-transform:uppercase;display:block;margin-bottom:4px">Số tiền</span><strong style="font-size:16px;color:var(--amber)">${fmt(tPrice)}</strong></div>
            <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px;text-transform:uppercase;display:block;margin-bottom:4px">Nội dung chuyển khoản (Bắt buộc)</span><strong style="font-size:16px;font-family:'JetBrains Mono',monospace;color:var(--green)">${content}</strong></div>
          </div>
        </div>
        
        <div style="border-top:1px solid var(--border);padding-top:20px;display:flex;gap:12px;justify-content:center">
          <button class="btn btn-ghost" onclick="openUpgradeModal()">Quay lại</button>
          <button class="btn btn-primary" onclick="submitCheckout('${tId}', ${tPrice})">Tôi đã chuyển khoản</button>
        </div>
      </div>
    `;
  } catch { pt.innerHTML='Lỗi lấy thông tin ngân hàng.' }
}

async function submitCheckout(tId, tPrice) {
  try {
    const r=await fetch('/api/checkout', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({target_tier: tId, amount: tPrice})});
    const d=await r.json();
    if(d.success) { 
      toast('Đã gửi yêu cầu cấp quyền!'); 
      openUpgradeModal(); 
    }
  }catch{toast('Lỗi gửi yêu cầu','warn')}
}

