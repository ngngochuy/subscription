'use strict';

const CATEGORIES={entertainment:{label:'Giải trí',color:'#a855f7'},work:{label:'Công việc',color:'#6366f1'},storage:{label:'Lưu trữ',color:'#22c55e'},social:{label:'Mạng xã hội',color:'#ec4899'},gaming:{label:'Gaming',color:'#f97316'},education:{label:'Học tập',color:'#06b6d4'},other:{label:'Khác',color:'#71717a'}};
const CYCLE_LABEL={weekly:'Tuần',monthly:'Tháng',quarterly:'Quý',yearly:'Năm'};

let stats=null, users=[], allSubs=[], currentView='overview', charts={};

document.addEventListener('DOMContentLoaded',async()=>{
  const u=await checkAdmin();if(!u)return;
  document.getElementById('adminName').textContent=u.username;
  document.getElementById('adminAvatar').textContent=u.username[0].toUpperCase();
  bindNav();await loadAll();
  document.getElementById('logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST',credentials:'include'});location.href='/login.html'};
});

async function checkAdmin(){
  try{const r=await fetch('/api/me',{credentials:'include'});const d=await r.json();
  if(!d.user){location.href='/login.html';return null}
  if(d.user.role!=='admin'){location.href='/client/index.html';return null}
  return d.user}catch{location.href='/login.html';return null}
}

function bindNav(){
  document.querySelectorAll('[data-view]').forEach(btn=>{btn.onclick=()=>{
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
    currentView=btn.dataset.view;
    document.querySelectorAll('.view-section').forEach(s=>s.classList.remove('active'));
    const t=document.getElementById('view'+currentView.charAt(0).toUpperCase()+currentView.slice(1));
    if(t)t.classList.add('active');
  const titles={overview:'Tổng quan hệ thống',users:'Quản lý người dùng',allsubs:'Tất cả gói đăng ký',analytics:'Thống kê hệ thống',config:'Cấu hình hệ thống',actlog:'Nhật ký hoạt động',tiers:'Gói dịch vụ (Tiers)'};
    document.getElementById('pageTitle').textContent=titles[currentView]||'Admin';
    renderView();
  }});
}

async function loadAll(){
  try{
    const[s,u,as]=await Promise.all([
      fetch('/api/admin/stats',{credentials:'include'}).then(r=>r.json()),
      fetch('/api/admin/users',{credentials:'include'}).then(r=>r.json()),
      fetch('/api/admin/all-subs',{credentials:'include'}).then(r=>r.json())
    ]);
    stats=s;users=u;allSubs=as;
    document.getElementById('lastUpdate').textContent='Cập nhật: '+new Date().toLocaleTimeString('vi-VN');
  }catch(e){toast('Lỗi tải dữ liệu')}
  renderView();
}

function renderView(){
  if(currentView==='overview')renderOverview();
  else if(currentView==='users')renderUsers();
  else if(currentView==='allsubs')renderAllSubs();
  else if(currentView==='analytics')renderAnalytics();
  else if(currentView==='config')renderConfig();
  else if(currentView==='tiers')renderTiers();
  else if(currentView==='actlog')renderActivityLog();
  else if(currentView==='upgrades')renderUpgrades();
}

// ─── OVERVIEW ────────────────────────────────────────────────
function renderOverview(){
  const v=document.getElementById('viewOverview');if(!stats)return;
  const smtpOk=stats.settings?.smtpHost&&stats.settings?.smtpUser;
  const tgOk=stats.settings?.tgToken;
  let statusText='Chưa cấu hình',statusColor='var(--red)';
  if(smtpOk&&tgOk){statusText='Đầy đủ';statusColor='var(--green)'}
  else if(smtpOk||tgOk){statusText='Một phần';statusColor='var(--amber)'}
  const avgSpend=stats.totalUsers>0?Math.round(stats.totalRevenue/stats.totalUsers):0;
  const subsPerUser=stats.totalUsers>0?(stats.totalSubs/stats.totalUsers).toFixed(1):'0';

  v.innerHTML=`
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon si-primary"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="stat-label">Tổng người dùng</div><div class="stat-value">${stats.totalUsers}</div><div class="stat-sub">${stats.admins} quản trị · ${stats.totalUsers-stats.admins} thành viên</div></div>
      <div class="stat-card"><div class="stat-icon si-green"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div class="stat-label">Tổng gói đăng ký</div><div class="stat-value">${stats.totalSubs}</div><div class="stat-sub">TB ${subsPerUser} gói / người</div></div>
      <div class="stat-card"><div class="stat-icon si-amber"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="stat-label">Tổng giá trị hệ thống</div><div class="stat-value">${fmt(stats.totalRevenue)}</div><div class="stat-sub">TB ${fmt(avgSpend)} / người dùng</div></div>
      <div class="stat-card"><div class="stat-icon si-red"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><div class="stat-label">Trạng thái hệ thống</div><div class="stat-value" style="font-size:18px;color:${statusColor}">${statusText}</div><div class="stat-sub">${tgOk?'Telegram OK':'Telegram chưa cấu hình'} · ${smtpOk?'SMTP OK':'SMTP chưa cấu hình'}</div></div>
    </div>

    <div class="chart-area">
      <div class="chart-card"><h3>Phân bổ theo danh mục</h3><div class="chart-canvas-wrap"><canvas id="adminCatChart"></canvas></div></div>
      <div class="chart-card"><h3>Phân bổ chu kỳ thanh toán</h3><div class="chart-canvas-wrap"><canvas id="adminCycleChart"></canvas></div></div>
    </div>

    <div class="a-panel"><div class="a-panel__head"><div class="a-panel__title">Chi tiêu theo người dùng</div></div><div class="a-panel__body" style="padding:0">
      <table class="a-table"><thead><tr><th>Người dùng</th><th>Số gói</th><th>Chi tiêu / kỳ</th><th>Hành động</th></tr></thead><tbody>
      ${(stats.userBreakdown||[]).map(u=>`<tr><td style="font-weight:600">${esc(u.username)}</td><td>${u.subCount||0}</td><td style="font-weight:700">${fmt(u.totalSpend||0)}</td><td><button class="btn btn-ghost btn-sm" onclick="viewUserSubs('${esc(u.username)}')">Xem gói</button></td></tr>`).join('')}
      </tbody></table>
    </div></div>
  `;
  renderOverviewCharts();
}

function renderOverviewCharts(){
  if(!stats||!window.Chart)return;
  // Category chart
  const catCanvas=document.getElementById('adminCatChart');
  if(catCanvas){
    if(charts.cat)charts.cat.destroy();
    const labels=(stats.byCategory||[]).map(c=>(CATEGORIES[c.category]||CATEGORIES.other).label);
    const colors=(stats.byCategory||[]).map(c=>(CATEGORIES[c.category]||CATEGORIES.other).color);
    const data=(stats.byCategory||[]).map(c=>c.cnt);
    charts.cat=new Chart(catCanvas,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom',labels:{color:'#a0a0ae',font:{size:11,family:'Inter'},padding:10,usePointStyle:true,pointStyleWidth:8}}}}});
  }
  // Cycle chart
  const cycCanvas=document.getElementById('adminCycleChart');
  if(cycCanvas){
    if(charts.cycle)charts.cycle.destroy();
    const labels=(stats.byCycle||[]).map(c=>CYCLE_LABEL[c.billingCycle]||c.billingCycle);
    const data=(stats.byCycle||[]).map(c=>c.cnt);
    charts.cycle=new Chart(cycCanvas,{type:'bar',data:{labels,datasets:[{data,backgroundColor:['#6366f1','#22c55e','#f59e0b','#ef4444'],borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#5c5c6a',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#5c5c6a',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}}}});
  }
}

// ─── USERS ───────────────────────────────────────────────────
function renderUsers(){
  const v=document.getElementById('viewUsers');
  v.innerHTML=`
    <div class="a-panel"><div class="a-panel__head"><div class="a-panel__title">Danh sách người dùng (${users.length})</div></div>
    <div class="a-panel__body" style="padding:0">
      <table class="a-table"><thead><tr><th>ID</th><th>Tên đăng nhập</th><th>Vai trò</th><th style="text-align:right">Hành động</th></tr></thead><tbody>
      ${users.map(u=>`<tr>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted)">#${u.id}</td>
        <td style="font-weight:700">${esc(u.username)}</td>
        <td><span class="rbadge ${u.role}">${u.role==='admin'?'Admin':'Client'}</span></td>
        <td style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="viewUserSubsById(${u.id},'${esc(u.username)}')">Xem gói</button>
          ${u.role!=='admin'?`<button class="btn btn-ghost btn-sm" onclick="toggleRole(${u.id},'admin')">Nâng Admin</button><button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id},'${esc(u.username)}')">Xóa</button>`:`<button class="btn btn-ghost btn-sm" onclick="toggleRole(${u.id},'client')">Hạ Client</button>`}
        </td>
      </tr>`).join('')}
      </tbody></table>
    </div></div>
  `;
}

async function viewUserSubsById(id,name){
  try{
    const subs=await fetch('/api/admin/users/'+id+'/subs',{credentials:'include'}).then(r=>r.json());
    document.getElementById('userSubsTitle').textContent='Gói đăng ký — '+name;
    const body=document.getElementById('userSubsBody');
    if(!subs.length){body.innerHTML='<div class="empty-state"><p>Người dùng này chưa có gói đăng ký nào.</p></div>';openModal('userSubsModal');return}
    body.innerHTML='<table class="a-table"><thead><tr><th>Tên</th><th>Giá</th><th>Chu kỳ</th><th>Hết hạn</th><th>Danh mục</th></tr></thead><tbody>'+subs.map(s=>{
      const cat=CATEGORIES[s.category]||CATEGORIES.other;
      return`<tr><td style="font-weight:600">${esc(s.name)}</td><td style="font-weight:700">${fmt(s.price)}</td><td>${CYCLE_LABEL[s.billingCycle]||s.billingCycle}</td><td>${fmtDate(s.nextDate)}</td><td><span style="display:inline-flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${cat.color}"></span>${cat.label}</span></td></tr>`}).join('')+'</tbody></table>';
    openModal('userSubsModal');
  }catch{toast('Lỗi tải dữ liệu')}
}

function viewUserSubs(username){
  const u=users.find(x=>x.username===username);
  if(u)viewUserSubsById(u.id,u.username);
}

async function toggleRole(id,newRole){
  if(!confirm(`Chuyển người dùng #${id} sang vai trò "${newRole}"?`))return;
  try{const r=await fetch('/api/admin/users/'+id+'/role',{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({role:newRole})});
  if(r.ok){toast('Đã cập nhật vai trò');await loadAll()}else{const e=await r.json();toast(e.error||'Lỗi')}}catch{toast('Lỗi kết nối')}
}

async function deleteUser(id,name){
  if(!confirm(`XÓA VĨNH VIỄN người dùng "${name}" và tất cả dữ liệu liên quan?\n\nHành động này KHÔNG THỂ hoàn tác!`))return;
  try{const r=await fetch('/api/admin/users/'+id,{method:'DELETE',credentials:'include'});
  if(r.ok){toast('Đã xóa người dùng');await loadAll()}else{const e=await r.json();toast(e.error||'Lỗi')}}catch{toast('Lỗi kết nối')}
}

// ─── ALL SUBS ────────────────────────────────────────────────
function renderAllSubs(){
  const v=document.getElementById('viewAllsubs');
  const now=new Date();
  const urgent=allSubs.filter(s=>{const d=new Date(s.nextDate);const diff=Math.ceil((d-now)/864e5);return diff>=0&&diff<=7});
  const expired=allSubs.filter(s=>new Date(s.nextDate)<now);

  v.innerHTML=`
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="stat-card"><div class="stat-label">Tổng gói</div><div class="stat-value">${allSubs.length}</div></div>
      <div class="stat-card"><div class="stat-label">Sắp hết hạn (7 ngày)</div><div class="stat-value" style="color:var(--amber)">${urgent.length}</div></div>
      <div class="stat-card"><div class="stat-label">Đã quá hạn</div><div class="stat-value" style="color:var(--red)">${expired.length}</div></div>
    </div>
    <div class="a-panel"><div class="a-panel__head"><div class="a-panel__title">Tất cả gói đăng ký trong hệ thống</div></div>
    <div class="a-panel__body" style="padding:0">
      <table class="a-table"><thead><tr><th>Người dùng</th><th>Tên gói</th><th>Giá</th><th>Chu kỳ</th><th>Hết hạn</th><th>Trạng thái</th><th>Danh mục</th></tr></thead><tbody>
      ${allSubs.map(s=>{
        const cat=CATEGORIES[s.category]||CATEGORIES.other;
        const diff=Math.ceil((new Date(s.nextDate)-now)/864e5);
        let st='',stClr='';
        if(diff<0){st='Quá hạn';stClr='var(--red)'}
        else if(diff===0){st='Hôm nay';stClr='var(--red)'}
        else if(diff<=3){st=diff+' ngày';stClr='var(--red)'}
        else if(diff<=7){st=diff+' ngày';stClr='var(--amber)'}
        else{st=diff+' ngày';stClr='var(--green)'}
        return`<tr>
          <td style="font-size:12px;color:var(--text-sub)">${esc(s.username)}</td>
          <td style="font-weight:600">${esc(s.name)}</td>
          <td style="font-weight:700">${fmt(s.price)}</td>
          <td>${CYCLE_LABEL[s.billingCycle]||s.billingCycle||'Tháng'}</td>
          <td>${fmtDate(s.nextDate)}</td>
          <td style="font-weight:700;color:${stClr}">${st}</td>
          <td><span style="display:inline-flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${cat.color}"></span>${cat.label}</span></td>
        </tr>`}).join('')}
      </tbody></table>
    </div></div>
  `;
}

// ─── ANALYTICS ───────────────────────────────────────────────
function renderAnalytics(){
  const v=document.getElementById('viewAnalytics');if(!stats)return;
  const topCat=(stats.byCategory||[]).sort((a,b)=>(b.total||0)-(a.total||0));
  const topSpenders=(stats.userBreakdown||[]).filter(u=>u.totalSpend>0).slice(0,5);

  v.innerHTML=`
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="stat-card"><div class="stat-label">Giá trị trung bình / gói</div><div class="stat-value">${stats.totalSubs?fmt(stats.totalRevenue/stats.totalSubs):'—'}</div></div>
      <div class="stat-card"><div class="stat-label">Danh mục phổ biến nhất</div><div class="stat-value" style="font-size:18px">${topCat.length?(CATEGORIES[topCat[0].category]||CATEGORIES.other).label:'—'}</div><div class="stat-sub">${topCat.length?topCat[0].cnt+' gói':''}</div></div>
      <div class="stat-card"><div class="stat-label">Người chi tiêu nhiều nhất</div><div class="stat-value" style="font-size:18px">${topSpenders.length?esc(topSpenders[0].username):'—'}</div><div class="stat-sub">${topSpenders.length?fmt(topSpenders[0].totalSpend):''}</div></div>
    </div>

    <div class="chart-area">
      <div class="chart-card"><h3>Giá trị gói theo danh mục</h3><div class="chart-canvas-wrap"><canvas id="anCatValChart"></canvas></div></div>
      <div class="insights-card"><h3>Phân tích hệ thống</h3>
        ${generateInsightsHTML()}
      </div>
    </div>

    <div class="a-panel" style="margin-top:16px"><div class="a-panel__head"><div class="a-panel__title">Top chi tiêu theo người dùng</div></div>
    <div class="a-panel__body" style="padding:0">
      <table class="a-table"><thead><tr><th>#</th><th>Người dùng</th><th>Số gói</th><th>Tổng chi tiêu</th><th>% hệ thống</th></tr></thead><tbody>
      ${topSpenders.map((u,i)=>{const pct=stats.totalRevenue?Math.round((u.totalSpend||0)/stats.totalRevenue*100):0;return`<tr><td style="color:var(--text-muted)">${i+1}</td><td style="font-weight:700">${esc(u.username)}</td><td>${u.subCount}</td><td style="font-weight:700">${fmt(u.totalSpend||0)}</td><td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:4px;background:var(--surface-3);border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--primary);border-radius:2px"></div></div><span style="font-size:11px;font-weight:600;color:var(--text-sub)">${pct}%</span></div></td></tr>`}).join('')}
      </tbody></table>
    </div></div>
  `;
  // Value chart
  const canvas=document.getElementById('anCatValChart');
  if(canvas&&window.Chart){
    if(charts.catVal)charts.catVal.destroy();
    const labels=topCat.map(c=>(CATEGORIES[c.category]||CATEGORIES.other).label);
    const colors=topCat.map(c=>(CATEGORIES[c.category]||CATEGORIES.other).color);
    const data=topCat.map(c=>c.total||0);
    charts.catVal=new Chart(canvas,{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:6,borderSkipped:false}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#5c5c6a',font:{size:11},callback:v=>fmt(v)},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#a0a0ae',font:{size:11,weight:'600'}},grid:{display:false}}}}});
  }
}

function generateInsightsHTML(){
  if(!stats)return'';
  const items=[];
  if(stats.totalSubs===0)items.push({text:'Hệ thống chưa có gói đăng ký nào. Hãy mời người dùng bắt đầu sử dụng!'});
  else{
    const avgPrice=stats.totalRevenue/stats.totalSubs;
    items.push({text:`Giá trị trung bình mỗi gói: <strong>${fmt(avgPrice)}</strong>`});
    if(stats.totalUsers>1){
      const active=(stats.userBreakdown||[]).filter(u=>u.subCount>0).length;
      const pct=Math.round(active/stats.totalUsers*100);
      items.push({text:`${active}/${stats.totalUsers} người dùng đang hoạt động (${pct}%)`});
    }
    const mCnt=(stats.byCycle||[]).find(c=>c.billingCycle==='monthly');
    const yCnt=(stats.byCycle||[]).find(c=>c.billingCycle==='yearly');
    if(mCnt&&yCnt)items.push({text:`${mCnt.cnt} gói tháng · ${yCnt.cnt} gói năm — Tỷ lệ gói năm: ${Math.round(yCnt.cnt/(mCnt.cnt+yCnt.cnt)*100)}%`});
    const expiring=allSubs.filter(s=>{const d=Math.ceil((new Date(s.nextDate)-new Date())/864e5);return d>=0&&d<=7}).length;
    if(expiring>0)items.push({text:`<strong style="color:var(--amber)">${expiring} gói</strong> trên toàn hệ thống sẽ hết hạn trong 7 ngày tới.`});
  }
  return items.map(i=>`<div class="insight-item"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>${i.text}</span></div>`).join('');
}

// ─── CONFIG ──────────────────────────────────────────────────
function renderConfig(){
  const v=document.getElementById('viewConfig');
  const s=stats?.settings||{};
  v.innerHTML=`
    <div class="a-panel"><div class="a-panel__head"><div><div class="a-panel__title">Telegram Bot</div></div>
      <span style="font-size:11px;color:${s.tgToken?'var(--green)':'var(--red)'}; font-weight:600">${s.tgToken?'Đã cấu hình':'Chưa cấu hình'}</span>
    </div><div class="a-panel__body">
      <div class="form-group"><label for="cfgTgToken">Bot Token</label><input type="password" id="cfgTgToken" placeholder="7123456789:AAFxxx..." value="${esc(s.tgToken||'')}" style="font-family:'JetBrains Mono',monospace"><p class="form-hint">Tạo bot tại @BotFather, gửi /newbot</p></div>
    </div></div>

    <div class="a-panel"><div class="a-panel__head"><div><div class="a-panel__title">Email SMTP</div></div>
      <span style="font-size:11px;color:${s.smtpHost&&s.smtpUser?'var(--green)':'var(--red)'}; font-weight:600">${s.smtpHost&&s.smtpUser?'Đã cấu hình':'Chưa cấu hình'}</span>
    </div><div class="a-panel__body">
      <div class="form-row"><div class="form-group"><label for="cfgSmtpHost">SMTP Host</label><input type="text" id="cfgSmtpHost" placeholder="smtp.gmail.com" value="${esc(s.smtpHost||'')}"></div>
      <div class="form-group"><label for="cfgSmtpPort">Port</label><input type="number" id="cfgSmtpPort" value="${s.smtpPort||587}"></div></div>
      <div class="form-row"><div class="form-group"><label for="cfgSmtpUser">Email gửi</label><input type="email" id="cfgSmtpUser" placeholder="email@gmail.com" value="${esc(s.smtpUser||'')}"></div>
      <div class="form-group"><label for="cfgSmtpPass">App Password</label><input type="password" id="cfgSmtpPass" placeholder="••••••••••••" value="${esc(s.smtpPass||'')}" autocomplete="new-password"><p class="form-hint">Dùng App Password, không phải mật khẩu thường</p></div></div>
    </div></div>

    <div class="a-panel"><div class="a-panel__head"><div><div class="a-panel__title">Thông tin Thanh toán (Bank)</div></div>
      <span style="font-size:11px;color:${s.bank_account?'var(--green)':'var(--red)'}; font-weight:600">${s.bank_account?'Đã cấu hình':'Chưa cấu hình'}</span>
    </div><div class="a-panel__body">
      <div class="form-row">
        <div class="form-group"><label>Tên Ngân hàng</label><input type="text" id="cfgBankName" placeholder="Vietcombank, MBBank..." value="${esc(s.bank_name||'')}"></div>
        <div class="form-group"><label>Số Tài Khoản</label><input type="text" id="cfgBankAccount" placeholder="123456789" value="${esc(s.bank_account||'')}"></div>
      </div>
      <div class="form-group"><label>Tên Người Nhận</label><input type="text" id="cfgBankReceiver" placeholder="NGUYEN VAN A" value="${esc(s.bank_receiver||'')}"></div>
    </div></div>

    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick="saveConfig()">Lưu cấu hình</button>
      <span id="cfgSaveStatus" style="font-size:12px;color:var(--text-muted)"></span>
    </div>
  `;
}

async function saveConfig(){
  const st=document.getElementById('cfgSaveStatus');st.textContent='Đang lưu...';
  const payload={tgToken:document.getElementById('cfgTgToken').value.trim(),smtpHost:document.getElementById('cfgSmtpHost').value.trim(),smtpPort:parseInt(document.getElementById('cfgSmtpPort').value)||587,smtpUser:document.getElementById('cfgSmtpUser').value.trim(),smtpPass:document.getElementById('cfgSmtpPass').value, bank_name:document.getElementById('cfgBankName').value.trim(), bank_account:document.getElementById('cfgBankAccount').value.trim(), bank_receiver:document.getElementById('cfgBankReceiver').value.trim()};
  try{const r=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});
  if(r.ok){toast('Đã lưu cấu hình');st.innerHTML='<span style="color:var(--green)">Lưu thành công</span>';await loadAll()}
  else{const e=await r.json();toast(e.error||'Lỗi');st.innerHTML='<span style="color:var(--red)">Lỗi lưu</span>'}}
  catch{toast('Lỗi kết nối');st.innerHTML='<span style="color:var(--red)">Lỗi kết nối</span>'}
}

// ─── ACTIVITY LOG VIEW ───────────────────────────────────────
async function renderActivityLog(){
  const v=document.getElementById('viewActlog');
  if(!v){const d=document.createElement('div');d.className='view-section';d.id='viewActlog';document.querySelector('.page-body').appendChild(d);v||renderActivityLog();return}
  v.classList.add('active');
  try{
    const logs=await fetch('/api/admin/activity',{credentials:'include'}).then(r=>r.json());
    const actionMap={add_sub:'act-add',edit_sub:'act-edit',delete_sub:'act-delete',price_change:'act-edit',checkin:'act-add',change_password:'act-default',update_profile:'act-default'};
    const actionLabel={add_sub:'Thêm gói',edit_sub:'Sửa gói',delete_sub:'Xóa gói',price_change:'Đổi giá',checkin:'Check-in',change_password:'Đổi mật khẩu',update_profile:'Cập nhật hồ sơ'};
    v.innerHTML=`<div class="a-panel"><div class="a-panel__head"><div class="a-panel__title">Nhật ký hoạt động toàn hệ thống (${logs.length})</div></div><div class="a-panel__body" style="padding:0"><table class="a-table"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Chi tiết</th></tr></thead><tbody>`+
    (logs.length?logs.map(l=>`<tr><td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);white-space:nowrap">${fmtDateTime(l.created_at)}</td><td style="font-weight:600">${esc(l.username||'—')}</td><td><span class="activity-dot ${actionMap[l.action]||'act-default'}" style="display:inline-block;margin-right:6px"></span>${actionLabel[l.action]||l.action}</td><td style="font-size:12px;color:var(--text-sub)">${esc(l.detail||'—')}</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có hoạt động</td></tr>')+
    '</tbody></table></div></div>';
  }catch{v.innerHTML='<div class="cmd-empty">Lỗi tải nhật ký</div>'}
}

// ─── TIERS VIEW ──────────────────────────────────────────────
async function renderTiers(){
  const v=document.getElementById('viewTiers');
  v.innerHTML='<div class="cmd-empty">Đang tải cấu hình Tiers...</div>';
  try{
    const tiers=await fetch('/api/admin/tiers',{credentials:'include'}).then(r=>r.json());
    let html='<div class="a-panel"><div class="a-panel__head"><div class="a-panel__title">Cấu hình các gói dịch vụ (SaaS Tiers)</div></div><div class="a-panel__body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">';
    tiers.forEach(t=>{
      const f=t.features||[];
      html+=`<div class="card" style="padding:20px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2)">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px;color:var(--primary)">Hạng: ${t.name} (Code: ${t.id})</h3>
        <div class="form-group"><label>Giá tiền / vĩnh viễn (đ)</label><input type="number" id="tier_price_${t.id}" class="form-control" value="${t.price||0}" style="background:var(--surface)"></div>
        <div class="form-group"><label>Giới hạn số gói (max)</label><input type="number" id="tier_max_${t.id}" class="form-control" value="${t.max_subs}" style="background:var(--surface)"></div>
        <div class="form-group"><label>Tính năng (Đánh dấu để mở khóa)</label>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="analytics" ${f.includes('analytics')?'checked':''}> Thống kê nâng cao (Analytics)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="calendar" ${f.includes('calendar')?'checked':''}> Lịch thanh toán (Calendar)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="ocr" ${f.includes('ocr')?'checked':''}> Quét hóa đơn (OCR)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="export" ${f.includes('export')?'checked':''}> Xuất dữ liệu (Export CSV)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="advisor" ${f.includes('advisor')?'checked':''}> Trợ lý Tài chính AI</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="sync" ${f.includes('sync')?'checked':''}> Đồng bộ Lịch 1 chạm (.ics)</label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="t-feat-${t.id}" value="theme" ${f.includes('theme')?'checked':''}> Custom Theme Độc quyền</label>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveTier('${t.id}')" style="width:100%;margin-top:16px">Lưu gói ${t.name}</button>
      </div>`;
    });
    html+='</div></div>';
    v.innerHTML=html;
  }catch{v.innerHTML='<div class="cmd-empty">Lỗi kết nối API Tiers.</div>'}
}

async function saveTier(id){
  const max=document.getElementById('tier_max_'+id).value;
  const price=document.getElementById('tier_price_'+id).value;
  const features=Array.from(document.querySelectorAll('.t-feat-'+id+':checked')).map(cb=>cb.value);
  const name=id==='free'?'Free':id==='pro'?'Pro':'Ultra';
  try{
    const r=await fetch('/api/admin/tiers/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({name,max_subs:max,features,price})});
    const d=await r.json();
    if(d.success) toast('Lưu thành công gói '+name); else toast('Lỗi: '+d.error);
  }catch{toast('Lỗi kết nối');}
}

// ─── UPGRADE REQUESTS VIEW ───────────────────────────────────
async function renderUpgrades(){
  const v=document.getElementById('viewUpgrades');
  if(!v) return;
  v.innerHTML='<div class="cmd-empty">Đang tải yêu cầu...</div>';
  try{
    const reqs=await fetch('/api/admin/upgrade-requests',{credentials:'include'}).then(r=>r.json());
    let html='<div class="a-panel"><div class="a-panel__head"><div class="a-panel__title">Yêu cầu nâng cấp chờ duyệt</div></div><div class="a-panel__body" style="padding:0"><table class="a-table"><thead><tr><th>User</th><th>Gói đích</th><th>Số tiền</th><th>Ngày YC</th><th>Hành động</th></tr></thead><tbody>';
    if(reqs.length===0){
      html+=`<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="width:48px;height:48px;opacity:0.3;margin-bottom:12px;color:var(--primary)"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        <div style="font-weight:600;font-size:14px">Không có yêu cầu chờ duyệt</div>
      </td></tr>`;
    }else{
      reqs.forEach(r=>{
        html+=`<tr>
          <td style="font-weight:700">${esc(r.username)}</td>
          <td><span style="color:var(--primary);font-weight:600;text-transform:uppercase">${r.target_tier}</span></td>
          <td style="font-family:'JetBrains Mono',monospace">${fmt(r.amount)}</td>
          <td>${fmtDateTime(r.created_at)}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="resolveUpgrade(${r.id}, 'approve')">Duyệt</button>
            <button class="btn btn-sm btn-danger" onclick="resolveUpgrade(${r.id}, 'reject')">Từ chối</button>
          </td>
        </tr>`;
      });
    }
    html+='</tbody></table></div></div>';
    v.innerHTML=html;
  }catch{v.innerHTML='Lỗi kết nối';}
}

async function resolveUpgrade(id, action){
  if(!confirm('Bạn chắc chắn muốn '+action+'?')) return;
  try{
    const r=await fetch('/api/admin/upgrade-requests/'+id+'/'+action,{method:'POST',credentials:'include'});
    if(r.ok) { toast('Đã xử lý '+action); renderUpgrades(); }
    else toast('Lỗi server');
  }catch{toast('Lỗi kết nối');}
}

// ─── HELPERS ─────────────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('open')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
function fmt(n){return Math.round(n||0).toLocaleString('vi-VN')+'đ'}
function fmtDate(s){return s?new Date(s).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}):'—'}
function fmtDateTime(s){if(!s)return'—';const d=new Date(s);return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
function esc(s){const d=document.createElement('div');d.appendChild(document.createTextNode(String(s||'')));return d.innerHTML}
function toast(msg){const t=document.getElementById('toast');document.getElementById('toastMsg').textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2000)}
