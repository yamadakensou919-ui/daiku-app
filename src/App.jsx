import { useState, useMemo, useEffect } from "react";


// ── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = "daiku_app_v1";
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) { console.warn("Load failed:", e); }
  return null;
}
function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e) { console.warn("Save failed:", e); }
}
function exportData(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daiku_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try { resolve(JSON.parse(e.target.result)); }
      catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ── Formatters ────────────────────────────────────────────────────────────────
const YEN = (n) => (n==null||n===""||isNaN(+n) ? "—" : `¥${(+n).toLocaleString("ja-JP")}`);
const PCT = (n) => (n==null||isNaN(+n) ? "—" : `${(+n*100).toFixed(1)}%`);
const todayStr = () => new Date().toISOString().slice(0,10);
const SUNDAY_BONUS = 1000;
const COST_KEYS  = ["材料費","外注費","交通費","消耗品","その他"];
const COST_ICONS = ["🪵","👷","🚗","🔧","📦"];
const COST_COLORS= ["#d4a853","#e07b4a","#5ba8d4","#9b7de8","#5cc98a"];

// ── Initial data ──────────────────────────────────────────────────────────────
const initSites = [
  { id:"s1", name:"山田邸リフォーム",  month:"2025-04", contract:980000,  contractTax:1078000, 材料費:210000, 外注費:280000, 交通費:15000, 消耗品:8000, その他:5000 },
  { id:"s2", name:"田中邸新築補助",    month:"2025-05", contract:1450000, contractTax:1595000, 材料費:380000, 外注費:420000, 交通費:22000, 消耗品:12000, その他:8000 },
  { id:"s3", name:"鈴木邸外壁補修",    month:"2025-05", contract:320000,  contractTax:352000,  材料費:85000,  外注費:90000,  交通費:8000,  消耗品:3000,  その他:2000 },
];
const initEmployees = [
  { id:"e1", name:"佐藤 健太", dailyWage:22000, role:"大工" },
  { id:"e2", name:"田中 誠",   dailyWage:18000, role:"大工" },
  { id:"e3", name:"鈴木 博",   dailyWage:20000, role:"職長" },
];
const initSubcontractors = [
  { id:"sc1", company:"東京左官工業", contact:"中村", dailyRate:25000 },
  { id:"sc2", company:"山田電気設備", contact:"山田", dailyRate:30000 },
];
const initAttendance = {
  "2025-05-01": {
    employees:[{empId:"e1",siteId:"s2",hours:1},{empId:"e2",siteId:"s1",hours:1},{empId:"e3",siteId:"s2",hours:1}],
    subcontractors:[{scId:"sc1",siteId:"s2",count:2}],
  },
  "2025-05-02": {
    employees:[{empId:"e1",siteId:"s2",hours:1},{empId:"e2",siteId:"s3",hours:0.5},{empId:"e3",siteId:"s1",hours:1}],
    subcontractors:[{scId:"sc2",siteId:"s1",count:1}],
  },
  "2025-05-04": {
    employees:[{empId:"e1",siteId:"s3",hours:1},{empId:"e2",siteId:"s2",hours:1}],
    subcontractors:[],
  },
};
let siteSeq=4, empSeq=4, scSeq=3;

// ── Calc helpers ──────────────────────────────────────────────────────────────
function calcLaborBySite(siteId,attendance,employees,subcontractors) {
  let empWage=0, scCost=0;
  Object.values(attendance).forEach(day=>{
    (day.employees||[]).forEach(r=>{
      if(r.siteId===siteId){const e=employees.find(x=>x.id===r.empId);if(e)empWage+=e.dailyWage*r.hours;}
    });
    (day.subcontractors||[]).forEach(r=>{
      if(r.siteId===siteId){const s=subcontractors.find(x=>x.id===r.scId);if(s)scCost+=s.dailyRate*r.count;}
    });
  });
  return {empWage,scCost,total:empWage+scCost};
}
function calcSite(s,laborCost=0) {
  const manualCost=COST_KEYS.reduce((a,k)=>a+(+s[k]||0),0);
  const totalCost=manualCost+laborCost;
  const gross=(+s.contract||0)-totalCost;
  const rate=s.contract?gross/+s.contract:0;
  return {totalCost,gross,rate};
}
function getMonthDays(ym) {
  if(!ym)return[];
  const [y,m]=ym.split("-").map(Number);
  return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
}
function getDow(d){return["日","月","火","水","木","金","土"][new Date(d).getDay()];}

// ── HTML-based PDF (browser print) — supports full Japanese ──
function downloadPayslipPDF(emp,month,baseWage,sundayBonus,sundayDays,siteAllowance,grandTotal,detail){
  const today = todayStr();
  const rows = detail.map((d,i)=>`
    <tr style="background:${d.isSun?'#2a0d0d':i%2===0?'#14192e':'#19203a'}">
      <td style="padding:6px 8px;color:${d.isSun?'#e05c5c':'#b0b8cc'};font-size:13px;">${d.date.slice(5)}</td>
      <td style="padding:6px 8px;color:${d.isSun?'#e05c5c':'#8892aa'};font-weight:700;font-size:13px;">${d.dow}</td>
      <td style="padding:6px 8px;color:#c0c8d8;font-size:13px;">${d.site}</td>
      <td style="padding:6px 8px;color:${d.isSun?'#e05c5c':'#b0b8cc'};font-size:12px;">${d.hours===1?'全日':'半日'}</td>
      <td style="padding:6px 8px;text-align:right;color:#dce0e8;font-size:13px;">¥${(d.wage+d.bonus).toLocaleString('ja-JP')}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0f1423;color:#e8eaf0;font-family:'Noto Sans JP',sans-serif;padding:20px;}
  @media print{body{background:#0f1423 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none!important;}}
  .header-line{height:3px;background:#d4a853;margin-bottom:10px;}
  .label{font-size:11px;color:#d4a853;font-weight:700;letter-spacing:1px;}
  .sub{font-size:12px;color:#94a3b8;}
  .name{font-size:26px;font-weight:800;color:#f0f2f6;margin:6px 0 2px;}
  .role{font-size:13px;color:#7888a0;margin-bottom:14px;}
  .sep{height:1px;background:#d4a85340;margin:10px 0;}
  .row{display:flex;justify-content:space-between;align-items:center;background:#19203a;border-radius:6px;padding:8px 12px;margin-bottom:4px;}
  .row.sun{background:#2a0d0d;}
  .row-label{font-size:13px;color:#94a3b8;}
  .row-val{font-size:13px;font-weight:700;color:#f0f2f6;}
  .total-box{background:#d4a853;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin:12px 0;}
  .total-label{font-size:14px;font-weight:700;color:#0f1423;}
  .total-val{font-size:20px;font-weight:800;color:#0f1423;}
  table{width:100%;border-collapse:collapse;margin-top:8px;}
  th{background:#0d1220;color:#d4a853;font-size:11px;font-weight:700;padding:6px 8px;text-align:left;letter-spacing:1px;}
  .detail-title{font-size:14px;font-weight:700;color:#d4a853;margin-top:16px;margin-bottom:6px;}
</style>
</head>
<body>
<div class="header-line"></div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;">
  <div>
    <div class="label">PAYSLIP</div>
    <div class="name">${emp.name}</div>
    <div class="role">${emp.role}</div>
  </div>
  <div style="text-align:right;">
    <div class="sub">${month.replace('-','年')}月分</div>
    <div class="sub">発行 ${today}</div>
  </div>
</div>
<div class="sep"></div>
<div class="sub" style="margin-bottom:10px;">日給 ¥${emp.dailyWage.toLocaleString('ja-JP')} × ${detail.reduce((a,d)=>a+d.hours,0)}日</div>
<div class="row"><span class="row-label">基本給</span><span class="row-val">¥${baseWage.toLocaleString('ja-JP')}</span></div>
${sundayBonus>0?`<div class="row sun"><span class="row-label" style="color:#d4a853;">休日出勤手当（日曜${sundayDays}日）</span><span class="row-val" style="color:#d4a853;">+¥${sundayBonus.toLocaleString('ja-JP')}</span></div>`:''}
${+siteAllowance>0?`<div class="row"><span class="row-label">現場手当</span><span class="row-val">+¥${(+siteAllowance).toLocaleString('ja-JP')}</span></div>`:''}
<div class="total-box">
  <span class="total-label">支給合計</span>
  <span class="total-val">¥${grandTotal.toLocaleString('ja-JP')}</span>
</div>
<div class="detail-title">出勤明細</div>
<table>
  <thead><tr>
    <th>日付</th><th>曜日</th><th>現場</th><th>区分</th><th style="text-align:right;">金額</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<button onclick="window.close()" style="position:fixed;top:16px;right:16px;z-index:9999;background:#d4a853;color:#0f1423;border:none;border-radius:8px;padding:10px 20px;font-size:15px;font-weight:700;cursor:pointer;font-family:sans-serif;" class="no-print">✕ 閉じる</button></body></html>`;
  const printDiv=document.createElement('div');
  printDiv.id='print-area';
  const bodyMatch=html.match(/<body[^>]*>([\s\S]*)<\/body>/i);const styleMatch=html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);printDiv.innerHTML=bodyMatch?bodyMatch[1]:html;const pageStyle=document.createElement('style');pageStyle.id='print-page-style';pageStyle.textContent=styleMatch?styleMatch[1]:'';document.head.appendChild(pageStyle);
  document.body.appendChild(printDiv);
  const printStyle=document.createElement('style');
  printStyle.id='print-style';
  printStyle.textContent='@media print{body > *:not(#print-area){display:none !important;} #print-area{display:block !important;}} @media screen{#print-area{display:none;}}';
  document.head.appendChild(printStyle);
  const cleanup=()=>{if(printDiv.parentNode)printDiv.parentNode.removeChild(printDiv);if(printStyle.parentNode)printStyle.parentNode.removeChild(printStyle);if(pageStyle.parentNode)pageStyle.parentNode.removeChild(pageStyle);window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);
  setTimeout(()=>{window.print();},100);
}

function downloadSitePDF(site,labor,totalCost,gross,rate){
  const today = todayStr();
  const gc = gross>=0?'#5cc98a':'#e05c5c';
  const gcDk = gross>=0?'#0a2316':'#2a0808';
  const costRows=[
    ['人件費（従業員）', labor.empWage, '#82b8e0'],
    ['人件費（外注）', labor.scCost, '#d4a064'],
    ...COST_KEYS.map((k,i)=>[k, +site[k]||0, '#b0b8cc'])
  ].filter(([,v])=>v>0);
  const costRowsHtml = costRows.map(([lbl,val,rgb],i)=>`
    <tr style="background:${i%2===0?'#14192e':'#19203a'}">
      <td style="padding:6px 8px;color:${rgb};font-size:13px;">${lbl}</td>
      <td style="padding:6px 8px;text-align:right;color:#dce0e8;font-size:13px;">¥${val.toLocaleString('ja-JP')}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0f1423;color:#e8eaf0;font-family:'Noto Sans JP',sans-serif;padding:20px;}
  @media print{body{background:#0f1423 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none!important;}}
  .header-line{height:3px;margin-bottom:10px;}
  .label{font-size:11px;font-weight:700;letter-spacing:1px;}
  .sub{font-size:12px;color:#94a3b8;}
  .name{font-size:26px;font-weight:800;color:#f0f2f6;margin:6px 0 2px;}
  .sep{height:1px;background:#ffffff20;margin:10px 0;}
  .section-title{font-size:14px;font-weight:700;color:#d4a853;margin:14px 0 6px;}
  table{width:100%;border-collapse:collapse;}
  th{background:#0d1220;color:#d4a853;font-size:11px;font-weight:700;padding:6px 8px;text-align:left;letter-spacing:1px;}
  .total-box{background:#2a1a08;border:1px solid #d4a85360;border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin:10px 0;}
  .total-label{font-size:13px;font-weight:700;color:#d4a853;}
  .total-val{font-size:16px;font-weight:800;color:#d4a853;}
  .gross-box{border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;margin-top:12px;}
  .gross-row{display:flex;justify-content:space-between;align-items:center;}
</style>
</head>
<body>
<div class="header-line" style="background:${gc};"></div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;">
  <div>
    <div class="label" style="color:${gc};">SITE REPORT</div>
    <div class="name">${site.name}</div>
    <div class="sub">完了年月: ${site.month}</div>
  </div>
  <div style="text-align:right;">
    <div class="sub">発行 ${today}</div>
  </div>
</div>
<div class="sep"></div>
<div class="section-title">売　上</div>
<table>
  <thead><tr><th>項目</th><th style="text-align:right;">金額</th></tr></thead>
  <tbody>
    <tr style="background:#14192e"><td style="padding:6px 8px;color:#94a3b8;font-size:13px;">請負金額（税抜）</td><td style="padding:6px 8px;text-align:right;color:#f0f2f6;font-weight:700;font-size:13px;">¥${(+site.contract||0).toLocaleString('ja-JP')}</td></tr>
    <tr style="background:#19203a"><td style="padding:6px 8px;color:#94a3b8;font-size:13px;">請負金額（税込）</td><td style="padding:6px 8px;text-align:right;color:#f0f2f6;font-weight:700;font-size:13px;">¥${(site.contractTax||Math.round((+site.contract||0)*1.1)).toLocaleString('ja-JP')}</td></tr>
  </tbody>
</table>
<div class="section-title">直接経費</div>
<table>
  <thead><tr><th>項目</th><th style="text-align:right;">金額</th></tr></thead>
  <tbody>${costRowsHtml}</tbody>
</table>
<div class="total-box">
  <span class="total-label">直接経費合計</span>
  <span class="total-val">¥${totalCost.toLocaleString('ja-JP')}</span>
</div>
<div class="gross-box" style="background:${gcDk};border:1px solid ${gc}40;">
  <div class="gross-row">
    <span style="font-size:15px;font-weight:700;color:#dce0e8;">粗　利　益</span>
    <span style="font-size:22px;font-weight:800;color:${gc};">¥${gross.toLocaleString('ja-JP')}</span>
  </div>
  <div class="gross-row">
    <span style="font-size:13px;font-weight:700;color:#94a3b8;">粗　利　率</span>
    <span style="font-size:16px;font-weight:800;color:${gc};">${PCT(rate)}</span>
  </div>
</div>
<button onclick="window.close()" style="position:fixed;top:16px;right:16px;z-index:9999;background:#d4a853;color:#0f1423;border:none;border-radius:8px;padding:10px 20px;font-size:15px;font-weight:700;cursor:pointer;font-family:sans-serif;" class="no-print">✕ 閉じる</button></body></html>`;
  const printDiv=document.createElement('div');
  printDiv.id='print-area';
  const bodyMatch=html.match(/<body[^>]*>([\s\S]*)<\/body>/i);const styleMatch=html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);printDiv.innerHTML=bodyMatch?bodyMatch[1]:html;const pageStyle=document.createElement('style');pageStyle.id='print-page-style';pageStyle.textContent=styleMatch?styleMatch[1]:'';document.head.appendChild(pageStyle);
  document.body.appendChild(printDiv);
  const printStyle=document.createElement('style');
  printStyle.id='print-style';
  printStyle.textContent='@media print{body > *:not(#print-area){display:none !important;} #print-area{display:block !important;}} @media screen{#print-area{display:none;}}';
  document.head.appendChild(printStyle);
  const cleanup=()=>{if(printDiv.parentNode)printDiv.parentNode.removeChild(printDiv);if(printStyle.parentNode)printStyle.parentNode.removeChild(printStyle);if(pageStyle.parentNode)pageStyle.parentNode.removeChild(pageStyle);window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);
  setTimeout(()=>{window.print();},100);
}

function downloadScPDF(sc,month,totalCount,totalCost,detail){
  const today=todayStr();
  const rows=detail.map((d,i)=>`
    <tr style="background:${i%2===0?'#14192e':'#19203a'}">
      <td style="padding:6px 8px;color:#94a3b8;font-size:13px;">${d.date.slice(5)}</td>
      <td style="padding:6px 8px;color:#82b8e0;font-weight:700;font-size:13px;">${d.dow}</td>
      <td style="padding:6px 8px;color:#c0c8d8;font-size:13px;">${d.site}</td>
      <td style="padding:6px 8px;color:#d4a853;font-size:13px;text-align:center;">${d.count}人</td>
      <td style="padding:6px 8px;text-align:right;color:#e07b4a;font-weight:700;font-size:13px;">¥${d.cost.toLocaleString('ja-JP')}</td>
    </tr>`).join('');
  const html=`<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0f1423;color:#e8eaf0;font-family:'Noto Sans JP',sans-serif;padding:20px;}
@media print{body{background:#0f1423 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none!important;}}
.hl{height:3px;background:#e07b4a;margin-bottom:10px;}
.lbl{font-size:11px;color:#e07b4a;font-weight:700;letter-spacing:1px;}
.sub{font-size:12px;color:#94a3b8;}
.nm{font-size:26px;font-weight:800;color:#f0f2f6;margin:6px 0 2px;}
.sep{height:1px;background:#ffffff20;margin:10px 0;}
.row{display:flex;justify-content:space-between;background:#19203a;border-radius:6px;padding:8px 12px;margin-bottom:4px;}
.rl{font-size:13px;color:#94a3b8;}
.rv{font-size:13px;font-weight:700;color:#f0f2f6;}
.tb{background:#e07b4a;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;margin:12px 0;}
.tl{font-size:14px;font-weight:700;color:#0f1423;}
.tv{font-size:20px;font-weight:800;color:#0f1423;}
table{width:100%;border-collapse:collapse;margin-top:8px;}
th{background:#0d1220;color:#e07b4a;font-size:11px;font-weight:700;padding:6px 8px;text-align:left;letter-spacing:1px;}
.dt{font-size:14px;font-weight:700;color:#e07b4a;margin-top:16px;margin-bottom:6px;}
</style></head><body>
<div class="hl"></div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;">
  <div><div class="lbl">SUBCONTRACT INVOICE</div>
  <div class="nm">${sc.company}</div>
  <div class="sub">担当: ${sc.contact} · ${month.replace('-','年')}月分</div></div>
  <div style="text-align:right;"><div class="sub">発行 ${today}</div></div>
</div>
<div class="sep"></div>
<div class="row"><span class="rl">日当単価（1人）</span><span class="rv">¥${sc.dailyRate.toLocaleString('ja-JP')}</span></div>
<div class="row"><span class="rl">延べ稼働人数</span><span class="rv">${totalCount}人</span></div>
<div class="tb"><span class="tl">支払合計</span><span class="tv">¥${totalCost.toLocaleString('ja-JP')}</span></div>
<div class="dt">稼働明細 (${detail.length}日)</div>
<table><thead><tr>
<th>日付</th><th>曜日</th><th>現場</th><th style="text-align:center;">人数</th><th style="text-align:right;">金額</th>
</tr></thead><tbody>${rows}</tbody></table>
<button onclick="window.close()" style="position:fixed;top:16px;right:16px;z-index:9999;background:#d4a853;color:#0f1423;border:none;border-radius:8px;padding:10px 20px;font-size:15px;font-weight:700;cursor:pointer;font-family:sans-serif;" class="no-print">✕ 閉じる</button></body></html>`;
    const printDiv=document.createElement('div');
  printDiv.id='print-area';
  const bodyMatch=html.match(/<body[^>]*>([\s\S]*)<\/body>/i);const styleMatch=html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);printDiv.innerHTML=bodyMatch?bodyMatch[1]:html;const pageStyle=document.createElement('style');pageStyle.id='print-page-style';pageStyle.textContent=styleMatch?styleMatch[1]:'';document.head.appendChild(pageStyle);
  document.body.appendChild(printDiv);
  const printStyle=document.createElement('style');
  printStyle.id='print-style';
  printStyle.textContent='@media print{body > *:not(#print-area){display:none !important;} #print-area{display:block !important;}} @media screen{#print-area{display:none;}}';
  document.head.appendChild(printStyle);
  const cleanup=()=>{if(printDiv.parentNode)printDiv.parentNode.removeChild(printDiv);if(printStyle.parentNode)printStyle.parentNode.removeChild(printStyle);if(pageStyle.parentNode)pageStyle.parentNode.removeChild(pageStyle);window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);
  setTimeout(()=>{window.print();},100);
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      "#0b0e17",
  bgCard:  "#111827",
  bgDeep:  "#080b12",
  border:  "#1e2a3d",
  borderHi:"#d4a853",
  gold:    "#d4a853",
  goldLt:  "#f0c96a",
  text:    "#e8eaf0",
  textSub: "#94a3b8",
  textDim: "#5d6b85",
  green:   "#5cc98a",
  greenDk: "#1a3d2a",
  red:     "#e05c5c",
  redDk:   "#3d1a1a",
  blue:    "#5ba8d4",
  orange:  "#e07b4a",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; }
  input, select, button { font-family: inherit; }
  select option { background: #111827; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e2a3d; border-radius: 2px; }
  input[type=date]::-webkit-calendar-picker-indicator,
  input[type=month]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  .card-anim { animation: fadeUp 0.3s ease both; }
`;

// ── Shared UI ─────────────────────────────────────────────────────────────────
const s = {
  card: { background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:16, padding:"16px 18px", marginBottom:12 },
  label: { fontSize:10, color:C.textSub, letterSpacing:1.5, textTransform:"uppercase", fontWeight:700, marginBottom:6, display:"block" },
  input: { width:"100%", background:C.bgDeep, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", fontSize:15, color:C.text, outline:"none", transition:"border 0.2s" },
  select: { width:"100%", background:C.bgDeep, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", fontSize:14, color:C.text, outline:"none" },
  btnPrimary: { width:"100%", background:`linear-gradient(135deg, ${C.gold}, #b8882a)`, border:"none", borderRadius:12, padding:"14px", fontSize:15, fontWeight:700, color:C.bgDeep, cursor:"pointer", letterSpacing:0.5 },
  btnGhost: { width:"100%", background:"transparent", border:`1px solid ${C.border}`, borderRadius:12, padding:"13px", fontSize:14, fontWeight:600, color:C.textSub, cursor:"pointer" },
  btnDanger: { width:"100%", background:"transparent", border:`1px solid ${C.red}`, borderRadius:12, padding:"13px", fontSize:14, fontWeight:600, color:C.red, cursor:"pointer" },
};

function GlowDot({color}) {
  return <span style={{width:6,height:6,borderRadius:"50%",background:color,display:"inline-block",boxShadow:`0 0 8px ${color}`,flexShrink:0}}/>;
}

function Tag({children,color="#d4a853"}) {
  return <span style={{fontSize:10,fontWeight:700,color,background:color+"20",borderRadius:6,padding:"2px 8px",letterSpacing:0.5}}>{children}</span>;
}

function Divider({gold}) {
  return <div style={{height:1,background:gold?`linear-gradient(90deg,transparent,${C.gold},transparent)`:`linear-gradient(90deg,transparent,${C.border},transparent)`,margin:"12px 0"}}/>;
}

function StatBox({label,value,color=C.text,sub}) {
  return (
    <div style={{background:C.bgDeep,borderRadius:12,padding:"10px 12px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:10,color:C.textSub,letterSpacing:0.5,fontWeight:600,marginBottom:5}}>{label}</div>
      <div style={{fontSize:sub?15:17,fontWeight:700,color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.1,letterSpacing:-0.5}}>{value}</div>
    </div>
  );
}

function RateBar({rate}) {
  const p=Math.max(0,Math.min(1,+rate));
  const color=p>=0.3?C.green:p>=0.2?C.gold:p>=0.1?C.orange:C.red;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <span style={{fontSize:10,color:C.textSub,letterSpacing:1}}>粗利率</span>
        <span style={{fontSize:13,fontWeight:800,color,fontFamily:"'JetBrains Mono',monospace"}}>{PCT(rate)}</span>
      </div>
      <div style={{height:4,background:C.bgDeep,borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${p*100}%`,background:`linear-gradient(90deg,${color}88,${color})`,borderRadius:99,transition:"width 0.6s cubic-bezier(.4,0,.2,1)"}}/>
      </div>
    </div>
  );
}

function FInput({label,value,onChange,num,type,hint}) {
  const [focus,setFocus]=useState(false);
  return (
    <div style={{marginBottom:12}}>
      <label style={s.label}>{label}</label>
      <input type={type||(num?"number":"text")} inputMode={num?"numeric":undefined}
        value={value} onChange={e=>onChange(e.target.value)} placeholder={num?"0":""}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{...s.input,borderColor:focus?C.gold:C.border}}/>
      {hint&&<div style={{fontSize:10,color:C.textSub,marginTop:4}}>{hint}</div>}
    </div>
  );
}

function FSelect({label,value,onChange,children}) {
  return (
    <div style={{marginBottom:12}}>
      <label style={s.label}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={s.select}>{children}</select>
    </div>
  );
}

function BackHeader({title,onClose,right}) {
  return (
    <div style={{position:"sticky",top:0,background:C.bg,zIndex:20,padding:"14px 18px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
      <button onClick={onClose} style={{background:C.bgCard,border:`1px solid ${C.border}`,color:C.textSub,borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← 戻る</button>
      <span style={{fontSize:16,fontWeight:800,color:C.text,flex:1,fontFamily:"'JetBrains Mono',monospace",letterSpacing:-0.5}}>{title}</span>
      {right}
    </div>
  );
}

function PdfButton({onClick,saving}) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{width:"100%",background:saving?"#1a2030":`linear-gradient(135deg,${C.green},#3a9966)`,border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,color:saving?C.textSub:"#0a1a10",cursor:saving?"default":"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s",opacity:saving?0.7:1,fontFamily:"inherit"}}>
      {saving?"⏳ 生成中…":"📄 PDFで保存"}
    </button>
  );
}

function TabBar({tabs,active,onChange}) {
  return (
    <div style={{display:"flex",background:C.bgCard,borderTop:`1px solid ${C.border}`}}>
      {tabs.map(([key,icon,label])=>{
        const isActive=active===key;
        return (
          <button key={key} onClick={()=>onChange(key)}
            style={{flex:1,padding:"10px 4px 8px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative",transition:"all 0.2s"}}>
            {isActive&&<div style={{position:"absolute",top:0,left:"25%",right:"25%",height:2,background:`linear-gradient(90deg,transparent,${C.gold},transparent)`,borderRadius:"0 0 2px 2px"}}/>}
            <span style={{fontSize:20,filter:isActive?"none":"grayscale(1) opacity(0.4)",transition:"filter 0.2s"}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:isActive?C.gold:C.textDim,letterSpacing:1,textTransform:"uppercase",transition:"color 0.2s"}}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SITES TAB
// ══════════════════════════════════════════════════════════════════════════════
function SitesTab({sites,setSites,attendance,employees,subcontractors}) {
  const [editing,setEditing]=useState(null);
  const save=(f)=>{if(!f.id)setSites(s=>[...s,{...f,id:`s${siteSeq++}`}]);else setSites(s=>s.map(x=>x.id===f.id?f:x));setEditing(null);};
  const del=(id)=>{if(window.confirm("この現場を削除しますか？")){setSites(s=>s.filter(x=>x.id!==id));setEditing(null);}};
  if(editing!==null)return <SiteForm site={editing} onSave={save} onDelete={del} onClose={()=>setEditing(null)} attendance={attendance} employees={employees} subcontractors={subcontractors}/>;
  return (
    <div style={{padding:"16px 16px 90px"}}>
      {sites.length===0&&(
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{fontSize:52,marginBottom:12}}>🏗</div>
          <div style={{color:C.textSub,fontSize:14}}>現場がありません</div>
        </div>
      )}
      {sites.map((s,i)=>(
        <div key={s.id} className="card-anim" style={{animationDelay:`${i*0.05}s`}}>
          <SiteCard site={s} onEdit={setEditing} attendance={attendance} employees={employees} subcontractors={subcontractors}/>
        </div>
      ))}
      <button onClick={()=>setEditing({})}
        style={{position:"fixed",bottom:80,right:18,width:54,height:54,borderRadius:"50%",background:`linear-gradient(135deg,${C.gold},#b8882a)`,border:"none",color:C.bgDeep,fontSize:24,cursor:"pointer",zIndex:30,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px ${C.gold}50`,fontWeight:700}}>+</button>
    </div>
  );
}

function SiteCard({site,onEdit,attendance,employees,subcontractors}) {
  const labor=calcLaborBySite(site.id,attendance,employees,subcontractors);
  const {totalCost,gross,rate}=calcSite(site,labor.total);
  const gc=gross>=0?C.green:C.red;
  const taxInc=site.contractTax||Math.round((+site.contract||0)*1.1);
  return (
    <div onClick={()=>onEdit(site)}
      style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:18,padding:"18px",marginBottom:12,cursor:"pointer",position:"relative",overflow:"hidden",transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{position:"absolute",top:0,right:0,width:80,height:80,background:`radial-gradient(${gc}15,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:C.text,fontFamily:"'JetBrains Mono',monospace",letterSpacing:-0.3,marginBottom:4}}>{site.name}</div>
          <Tag>{site.month}</Tag>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:C.textSub,marginBottom:2}}>税込</div>
          <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(taxInc)}</div>
          <div style={{fontSize:10,color:C.textSub}}>税抜 {YEN(site.contract)}</div>
        </div>
      </div>
      {labor.total>0&&(
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          {labor.empWage>0&&<div style={{display:"flex",alignItems:"center",gap:5,background:C.bgDeep,borderRadius:8,padding:"4px 10px",border:`1px solid ${C.border}`}}><GlowDot color={C.blue}/><span style={{fontSize:10,color:C.textSub}}>自社 {YEN(labor.empWage)}</span></div>}
          {labor.scCost>0&&<div style={{display:"flex",alignItems:"center",gap:5,background:C.bgDeep,borderRadius:8,padding:"4px 10px",border:`1px solid ${C.border}`}}><GlowDot color={C.orange}/><span style={{fontSize:10,color:C.textSub}}>外注 {YEN(labor.scCost)}</span></div>}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        <StatBox label="経費合計" value={YEN(totalCost)} color={C.orange}/>
        <StatBox label="粗利益" value={YEN(gross)} color={gc}/>
      </div>
      <RateBar rate={rate}/>
    </div>
  );
}

function SiteForm({site,onSave,onDelete,onClose,attendance,employees,subcontractors}) {
  const isNew=!site.id;
  const [f,setF]=useState({name:"",month:todayStr().slice(0,7),contract:"",contractTax:"",材料費:"",外注費:"",交通費:"",消耗品:"",その他:"",...site});
  const [saving,setSaving]=useState(false);
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  const labor=site.id?calcLaborBySite(site.id,attendance,employees,subcontractors):{empWage:0,scCost:0,total:0};
  const {totalCost,gross,rate}=calcSite(f,labor.total);
  const gc=gross>=0?C.green:C.red;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <BackHeader title={isNew?"新規現場":"現場編集"} onClose={onClose}/>
      <div style={{padding:"16px 16px 100px"}}>
        {/* Live KPI */}
        <div style={{background:`linear-gradient(135deg,${C.bgCard},${C.bgDeep})`,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:10,color:C.gold,letterSpacing:1.5,fontWeight:700,marginBottom:12}}>LIVE PREVIEW</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <StatBox label="経費計" value={YEN(totalCost)} color={C.orange} sub/>
            <StatBox label="粗利益" value={YEN(gross)} color={gc} sub/>
            <StatBox label="粗利率" value={PCT(rate)} color={gc} sub/>
          </div>
        </div>

        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>📍 現場情報</div>
          <FInput label="現場名・物件名" value={f.name} onChange={set("name")}/>
          <FInput label="完了年月" value={f.month} onChange={set("month")} type="month"/>
        </div>

        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>💴 売上</div>
          <FInput label="請負金額（税抜）" value={f.contract} num
            onChange={v=>{set("contract")(v);set("contractTax")(v?String(Math.round(+v*1.1)):"");}}/>
          <FInput label="請負金額（税込）" value={f.contractTax} onChange={set("contractTax")} num
            hint={f.contract?`消費税: ${YEN(Math.round((+f.contractTax||0)-(+f.contract||0)))}`:undefined}/>
        </div>

        <div style={{...s.card,borderColor:labor.total>0?C.blue:C.border}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1}}>👷 人件費</div>
            <Tag color={C.blue}>自動集計</Tag>
          </div>
          {labor.total===0
            ?<div style={{color:C.textDim,fontSize:12,padding:"8px 0"}}>出勤タブで入力すると自動反映されます</div>
            :<>
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><GlowDot color={C.blue}/><span style={{fontSize:13,color:C.textSub}}>従業員</span></div>
                <span style={{fontSize:13,fontWeight:700,color:C.blue}}>{YEN(labor.empWage)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><GlowDot color={C.orange}/><span style={{fontSize:13,color:C.textSub}}>外注（人工）</span></div>
                <span style={{fontSize:13,fontWeight:700,color:C.orange}}>{YEN(labor.scCost)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 2px"}}>
                <span style={{fontSize:14,fontWeight:700,color:C.text}}>合計</span>
                <span style={{fontSize:16,fontWeight:800,color:C.blue,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(labor.total)}</span>
              </div>
            </>
          }
        </div>

        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>📋 直接経費（手動）</div>
          {COST_KEYS.map((k,i)=><FInput key={k} label={`${COST_ICONS[i]} ${k}`} value={f[k]} onChange={set(k)} num/>)}
        </div>

        <button onClick={()=>onSave(f)} style={s.btnPrimary}>{isNew?"✚ 現場を登録":"💾 保存する"}</button>
        <div style={{height:8}}/>
        {!isNew&&<PdfButton onClick={()=>{setSaving(true);try{downloadSitePDF(f,labor,totalCost,gross,rate);}catch(e){alert(e.message);}setSaving(false);}} saving={saving}/>}
        {!isNew&&<button onClick={()=>onDelete(site.id)} style={s.btnDanger}>🗑 削除</button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE TAB
// ══════════════════════════════════════════════════════════════════════════════
function AttendanceTab({sites,employees,subcontractors,attendance,setAttendance}) {
  const [selDate,setSelDate]=useState(todayStr());
  const dayData=attendance[selDate]||{employees:[],subcontractors:[]};
  const empRecs=dayData.employees||[];
  const scRecs=dayData.subcontractors||[];
  const dow=["日","月","火","水","木","金","土"][new Date(selDate).getDay()];
  const isSun=new Date(selDate).getDay()===0;
  const isSat=new Date(selDate).getDay()===6;

  const setEmpRec=(empId,siteId,hours)=>{
    setAttendance(prev=>{
      const day=prev[selDate]||{employees:[],subcontractors:[]};
      let emps=[...(day.employees||[])];
      const idx=emps.findIndex(r=>r.empId===empId);
      if(!siteId)emps=emps.filter(r=>r.empId!==empId);
      else if(idx>=0)emps[idx]={empId,siteId,hours};
      else emps.push({empId,siteId,hours});
      return {...prev,[selDate]:{...day,employees:emps}};
    });
  };
  const setScRec=(scId,siteId,count)=>{
    setAttendance(prev=>{
      const day=prev[selDate]||{employees:[],subcontractors:[]};
      let scs=[...(day.subcontractors||[])];
      const idx=scs.findIndex(r=>r.scId===scId);
      if(!siteId||count<=0)scs=scs.filter(r=>r.scId!==scId);
      else if(idx>=0)scs[idx]={scId,siteId,count};
      else scs.push({scId,siteId,count});
      return {...prev,[selDate]:{...day,subcontractors:scs}};
    });
  };

  return (
    <div style={{padding:"16px 16px 90px"}}>
      {/* Date picker */}
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
        <div style={{fontSize:28}}>📅</div>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:1.5,marginBottom:4}}>出勤日</div>
          <input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)}
            style={{background:"transparent",border:"none",color:C.text,fontSize:17,fontWeight:800,outline:"none",width:"100%",fontFamily:"'JetBrains Mono',monospace"}}/>
        </div>
        <div style={{background:isSun?C.redDk:isSat?"#1a1a30":C.greenDk,border:`1px solid ${isSun?C.red:isSat?"#6060c0":C.green}`,borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
          <div style={{fontSize:16,fontWeight:800,color:isSun?C.red:isSat?"#a0a0f0":C.green,fontFamily:"'JetBrains Mono',monospace"}}>{dow}</div>
        </div>
      </div>

      {/* Employees */}
      <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
        <GlowDot color={C.blue}/> 自社従業員
      </div>
      {employees.map((emp,i)=>{
        const rec=empRecs.find(r=>r.empId===emp.id)||{siteId:"",hours:1};
        const isOut=!!rec.siteId;
        return (
          <div key={emp.id} className="card-anim" style={{...s.card,borderColor:isOut?C.blue:C.border,animationDelay:`${i*0.05}s`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:isOut?14:0}}>
              <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${C.blue}30,${C.blue}10)`,border:`1px solid ${C.blue}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:C.blue,flexShrink:0,fontFamily:"'JetBrains Mono',monospace"}}>{emp.name[0]}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,color:C.text}}>{emp.name}</div>
                <div style={{fontSize:11,color:C.textSub}}>{emp.role} · {YEN(emp.dailyWage)}/日{isSun?` (+¥${SUNDAY_BONUS})`:""}</div>
              </div>
              {isOut&&<Tag color={C.green}>出勤済</Tag>}
            </div>
            {isOut&&<Divider/>}
            <FSelect label="" value={rec.siteId} onChange={v=>setEmpRec(emp.id,v,rec.hours||1)}>
              <option value="">— 休み / 未入力 —</option>
              {sites.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
            </FSelect>
            {rec.siteId&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:-4}}>
                {[[1,"全日"],[0.5,"半日"]].map(([h,label])=>(
                  <button key={h} onClick={()=>setEmpRec(emp.id,rec.siteId,h)}
                    style={{background:rec.hours===h?`${C.blue}20`:"transparent",border:`1.5px solid ${rec.hours===h?C.blue:C.border}`,borderRadius:10,padding:"10px",fontSize:13,fontWeight:700,color:rec.hours===h?C.blue:C.textSub,cursor:"pointer",transition:"all 0.2s",fontFamily:"inherit"}}>
                    {label}
                    <div style={{fontSize:11,fontWeight:400,marginTop:2}}>{YEN(emp.dailyWage*h+(isSun?SUNDAY_BONUS*h:0))}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Subcontractors */}
      <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2,margin:"18px 0 12px",display:"flex",alignItems:"center",gap:8}}>
        <GlowDot color={C.orange}/> 外注先
      </div>
      {subcontractors.length===0&&<div style={{color:C.textDim,fontSize:13,textAlign:"center",padding:"16px 0"}}>外注先が未登録です（スタッフタブで追加）</div>}
      {subcontractors.map((sc,i)=>{
        const rec=scRecs.find(r=>r.scId===sc.id)||{siteId:"",count:0};
        const isActive=rec.siteId&&rec.count>0;
        return (
          <div key={sc.id} className="card-anim" style={{...s.card,borderColor:isActive?C.orange:C.border,animationDelay:`${i*0.05}s`}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
              <div style={{width:42,height:42,borderRadius:12,background:`${C.orange}20`,border:`1px solid ${C.orange}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏢</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,color:C.text}}>{sc.company}</div>
                <div style={{fontSize:11,color:C.textSub}}>担当: {sc.contact} · {YEN(sc.dailyRate)}/人</div>
              </div>
              {isActive&&<Tag color={C.orange}>入力済</Tag>}
            </div>
            <FSelect label="" value={rec.siteId} onChange={v=>setScRec(sc.id,v,rec.count||1)}>
              <option value="">— 未入力 —</option>
              {sites.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
            </FSelect>
            {rec.siteId&&(
              <div>
                <div style={{fontSize:10,color:C.textSub,letterSpacing:1,marginBottom:10}}>人数</div>
                <div style={{display:"flex",alignItems:"center",gap:16}}>
                  <button onClick={()=>setScRec(sc.id,rec.siteId,Math.max(0,(rec.count||0)-1))}
                    style={{width:46,height:46,borderRadius:12,background:C.bgDeep,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit",transition:"border-color 0.2s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:36,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{rec.count||0}</div>
                    <div style={{fontSize:10,color:C.textSub}}>人</div>
                  </div>
                  <button onClick={()=>setScRec(sc.id,rec.siteId,(rec.count||0)+1)}
                    style={{width:46,height:46,borderRadius:12,background:`linear-gradient(135deg,${C.orange},#c05a30)`,border:"none",color:"#1a0a00",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>＋</button>
                </div>
                {rec.count>0&&(
                  <div style={{marginTop:12,background:C.bgDeep,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:11,color:C.textSub}}>本日の外注費</span>
                    <span style={{fontSize:16,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(sc.dailyRate*rec.count)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL TAB
// ══════════════════════════════════════════════════════════════════════════════
function PayrollTab({employees,subcontractors,sites,attendance}) {
  const [selMonth,setSelMonth]=useState(todayStr().slice(0,7));
  const [viewing,setViewing]=useState(null);
  const [viewingSc,setViewingSc]=useState(null);
  const days=getMonthDays(selMonth);

  const empSummaries=useMemo(()=>employees.map(emp=>{
    let totalDays=0,baseWage=0,sundayBonus=0;const detail=[];
    days.forEach(d=>{
      const rec=((attendance[d]||{}).employees||[]).find(r=>r.empId===emp.id);
      if(rec&&rec.siteId){
        const site=sites.find(s=>s.id===rec.siteId);
        const isSun=new Date(d).getDay()===0;
        const wage=emp.dailyWage*rec.hours;const bonus=isSun?SUNDAY_BONUS*rec.hours:0;
        totalDays+=rec.hours;baseWage+=wage;sundayBonus+=bonus;
        detail.push({date:d,dow:getDow(d),site:site?.name||"不明",hours:rec.hours,wage,isSun,bonus});
      }
    });
    return {emp,totalDays,baseWage,sundayBonus,totalWage:baseWage+sundayBonus,detail};
  }),[employees,sites,attendance,selMonth]);

  const scSummaries=useMemo(()=>subcontractors.map(sc=>{
    let totalCount=0,totalCost=0;const detail=[];
    days.forEach(d=>{
      const rec=((attendance[d]||{}).subcontractors||[]).find(r=>r.scId===sc.id);
      if(rec&&rec.siteId&&rec.count>0){
        const site=sites.find(s=>s.id===rec.siteId);const cost=sc.dailyRate*rec.count;
        totalCount+=rec.count;totalCost+=cost;
        detail.push({date:d,dow:getDow(d),site:site?.name||"不明",count:rec.count,cost});
      }
    });
    return {sc,totalCount,totalCost,detail};
  }),[subcontractors,sites,attendance,selMonth]);

  if(viewing)return <PayslipView summary={empSummaries.find(x=>x.emp.id===viewing)} month={selMonth} onClose={()=>setViewing(null)}/>;
  if(viewingSc)return <ScInvoiceView summary={scSummaries.find(x=>x.sc.id===viewingSc)} month={selMonth} onClose={()=>setViewingSc(null)}/>;

  const totalEmpWage=empSummaries.reduce((a,x)=>a+x.totalWage,0);
  const totalScCost=scSummaries.reduce((a,x)=>a+x.totalCost,0);

  return (
    <div style={{padding:"16px 16px 90px"}}>
      {/* Month selector */}
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
        <div style={{fontSize:28}}>📆</div>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:1.5,marginBottom:4}}>対象月</div>
          <input type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)}
            style={{background:"transparent",border:"none",color:C.text,fontSize:17,fontWeight:800,outline:"none",fontFamily:"'JetBrains Mono',monospace"}}/>
        </div>
      </div>

      {/* Total summary */}
      <div style={{background:`linear-gradient(135deg,${C.bgCard},${C.bgDeep})`,border:`1px solid ${C.gold}40`,borderRadius:16,padding:"16px 18px",marginBottom:18}}>
        <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:1.5,marginBottom:12}}>MONTHLY TOTAL</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <StatBox label="従業員 給与" value={YEN(totalEmpWage)} color={C.green} sub/>
          <StatBox label="外注費" value={YEN(totalScCost)} color={C.orange} sub/>
        </div>
        <Divider gold/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:C.textSub}}>人件費 合計</span>
          <span style={{fontSize:22,fontWeight:800,color:C.gold,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(totalEmpWage+totalScCost)}</span>
        </div>
      </div>

      {/* Employee list */}
      <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
        <GlowDot color={C.green}/> 従業員 給与サマリー
      </div>
      {empSummaries.map(({emp,totalDays,sundayBonus,totalWage,detail},i)=>(
        <div key={emp.id} onClick={()=>setViewing(emp.id)} className="card-anim"
          style={{...s.card,cursor:"pointer",animationDelay:`${i*0.05}s`,transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.green}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:`${C.green}15`,border:`1px solid ${C.green}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{emp.name[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text}}>{emp.name}</div>
              <div style={{fontSize:11,color:C.textSub}}>{emp.role}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:C.textSub}}>支給額</div>
              <div style={{fontSize:18,fontWeight:800,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(totalWage)}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <StatBox label="出勤日数" value={`${totalDays}日`} sub/>
            <StatBox label="日給" value={YEN(emp.dailyWage)} sub/>
            <StatBox label="明細" value={`${detail.length}件`} sub/>
          </div>
          {sundayBonus>0&&<div style={{marginTop:10,background:C.redDk,borderRadius:8,padding:"6px 12px",fontSize:11,color:C.red,display:"flex",alignItems:"center",gap:6}}><GlowDot color={C.red}/>日曜出勤 {detail.filter(d=>d.isSun).length}日 · +{YEN(sundayBonus)}</div>}
          {totalDays===0&&<div style={{marginTop:8,fontSize:11,color:C.textDim,textAlign:"center"}}>この月の出勤記録なし</div>}
          <div style={{textAlign:"right",marginTop:8,fontSize:10,color:C.textDim}}>明細を見る →</div>
        </div>
      ))}

      {/* SC list */}
      <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2,margin:"18px 0 12px",display:"flex",alignItems:"center",gap:8}}>
        <GlowDot color={C.orange}/> 外注先 支払サマリー
      </div>
      {scSummaries.map(({sc,totalCount,totalCost,detail},i)=>(
        <div key={sc.id} onClick={()=>setViewingSc(sc.id)} className="card-anim"
          style={{...s.card,cursor:"pointer",animationDelay:`${i*0.05}s`,transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:`${C.orange}15`,border:`1px solid ${C.orange}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏢</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text}}>{sc.company}</div>
              <div style={{fontSize:11,color:C.textSub}}>担当: {sc.contact}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:C.textSub}}>支払額</div>
              <div style={{fontSize:18,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(totalCost)}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <StatBox label="延べ人数" value={`${totalCount}人`} sub/>
            <StatBox label="単価/人" value={YEN(sc.dailyRate)} sub/>
            <StatBox label="稼働日" value={`${detail.length}日`} sub/>
          </div>
          {totalCount===0&&<div style={{marginTop:8,fontSize:11,color:C.textDim,textAlign:"center"}}>この月の稼働記録なし</div>}
          <div style={{textAlign:"right",marginTop:8,fontSize:10,color:C.textDim}}>明細を見る →</div>
        </div>
      ))}
    </div>
  );
}

// ── 給与明細書 ────────────────────────────────────────────────────────────────
function PayslipView({summary,month,onClose}) {
  const {emp,totalDays,baseWage,sundayBonus,totalWage,detail}=summary;
  const [siteAllowance,setSiteAllowance]=useState("");
  const [saving,setSaving]=useState(false);
  const grandTotal=totalWage+(+siteAllowance||0);
  const sundayDays=detail.filter(d=>d.isSun).length;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <BackHeader title="給与明細書" onClose={onClose}
        right={<PdfButton onClick={()=>{setSaving(true);try{downloadPayslipPDF(emp,month,baseWage,sundayBonus,sundayDays,siteAllowance,grandTotal,detail);}catch(e){alert(e.message);}setSaving(false);}} saving={saving}/>}/>
      <div style={{padding:"16px 16px 100px"}}>
        {/* Hero */}
        <div style={{background:`linear-gradient(135deg,${C.bgCard},${C.bgDeep})`,border:`1px solid ${C.gold}40`,borderRadius:20,padding:"22px 20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,background:`${C.gold}08`,borderRadius:"50%",border:`1px solid ${C.gold}15`}}/>
          <div style={{position:"absolute",top:10,right:18,fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2}}>PAYSLIP</div>
          <div style={{fontSize:22,fontWeight:800,color:C.text,fontFamily:"'JetBrains Mono',monospace",marginBottom:4}}>{emp.name}</div>
          <div style={{fontSize:12,color:C.textSub,marginBottom:14}}>{emp.role} · {month.replace("-","年")}月分</div>
          <Divider gold/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:C.textSub}}>支給合計</span>
            <span style={{fontSize:28,fontWeight:800,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(grandTotal)}</span>
          </div>
        </div>

        {/* Breakdown */}
        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>支給内訳</div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.textSub}}>出勤日数</span><span style={{fontSize:13,color:C.text,fontWeight:700}}>{totalDays}日</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.textSub}}>日給単価</span><span style={{fontSize:13,color:C.text,fontWeight:700}}>{YEN(emp.dailyWage)}</span>
          </div>
          <Divider/>
          <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
            <span style={{fontSize:14,fontWeight:700,color:C.text}}>基本給</span>
            <span style={{fontSize:15,fontWeight:800,color:C.text,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(baseWage)}</span>
          </div>
          {sundayBonus>0&&(
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <GlowDot color={C.red}/>
                <span style={{fontSize:12,color:C.textSub}}>休日出勤手当（日曜{sundayDays}日×¥1,000）</span>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:C.red}}>+{YEN(sundayBonus)}</span>
            </div>
          )}
          <div style={{marginTop:10}}>
            <div style={{fontSize:10,color:C.gold,letterSpacing:1,fontWeight:700,marginBottom:8}}>🏗 現場手当（手入力）</div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:C.bgDeep,borderRadius:10,padding:"2px 14px 2px 14px",border:`1px solid ${C.border}`}}>
              <span style={{color:C.textSub,fontSize:14}}>¥</span>
              <input type="number" inputMode="numeric" value={siteAllowance} onChange={e=>setSiteAllowance(e.target.value)} placeholder="0"
                style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:16,fontWeight:700,outline:"none",padding:"10px 0",fontFamily:"'JetBrains Mono',monospace"}}/>
            </div>
          </div>
          <Divider gold/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:15,fontWeight:800,color:C.text}}>支給合計</span>
            <span style={{fontSize:24,fontWeight:800,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(grandTotal)}</span>
          </div>
        </div>

        {/* Detail */}
        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>出勤明細 ({detail.length}件)</div>
          {detail.length===0&&<div style={{color:C.textDim,fontSize:13}}>出勤記録がありません</div>}
          {detail.map((d,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:i<detail.length-1?`1px solid ${C.border}`:"none",gap:12}}>
              <div style={{background:d.isSun?C.redDk:C.bgDeep,borderRadius:10,padding:"6px 10px",textAlign:"center",minWidth:46,border:`1px solid ${d.isSun?C.red+"40":C.border}`}}>
                <div style={{fontSize:10,color:C.textSub}}>{d.date.slice(5)}</div>
                <div style={{fontSize:13,fontWeight:800,color:d.isSun?C.red:C.blue,fontFamily:"'JetBrains Mono',monospace"}}>{d.dow}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:C.text,fontWeight:600}}>{d.site}</div>
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}>
                  <span style={{fontSize:10,color:C.textSub}}>{d.hours===1?"全日":"半日"}</span>
                  {d.isSun&&<Tag color={C.red}>+{YEN(d.bonus)}</Tag>}
                </div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(d.wage+d.bonus)}</div>
            </div>
          ))}
        </div>

        {/* By site */}
        {detail.length>0&&(()=>{
          const by={};detail.forEach(d=>{by[d.site]=(by[d.site]||0)+d.wage+d.bonus;});
          return (
            <div style={s.card}>
              <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>現場別 人件費</div>
              {Object.entries(by).map(([name,wage])=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><GlowDot color={C.orange}/><span style={{fontSize:13,color:C.textSub}}>{name}</span></div>
                  <span style={{fontSize:13,fontWeight:700,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(wage)}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── 外注費明細 ────────────────────────────────────────────────────────────────
function ScInvoiceView({summary,month,onClose}) {
  const [saving,setSaving]=useState(false);
  const {sc,totalCount,totalCost,detail}=summary;
  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <BackHeader title="外注費明細" onClose={onClose}
        right={<PdfButton onClick={()=>{setSaving(true);try{downloadScPDF(sc,month,totalCount,totalCost,detail);}catch(e){alert(e.message);}setSaving(false);}} saving={saving}/>}/>
      <div style={{padding:"16px 16px 100px"}}>
        <div style={{background:`linear-gradient(135deg,${C.bgCard},${C.bgDeep})`,border:`1px solid ${C.orange}40`,borderRadius:20,padding:"22px 20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:10,right:18,fontSize:10,color:C.orange,fontWeight:700,letterSpacing:2}}>SUBCONTRACT</div>
          <div style={{fontSize:22,fontWeight:800,color:C.text,fontFamily:"'JetBrains Mono',monospace",marginBottom:4}}>{sc.company}</div>
          <div style={{fontSize:12,color:C.textSub,marginBottom:14}}>担当: {sc.contact} · {month.replace("-","年")}月分</div>
          <Divider/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:C.textSub}}>支払合計</span>
            <span style={{fontSize:28,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(totalCost)}</span>
          </div>
        </div>
        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>支払内訳</div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.textSub}}>日当単価（1人）</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>{YEN(sc.dailyRate)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}>
            <span style={{fontSize:13,color:C.textSub}}>延べ稼働人数</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>{totalCount}人</span>
          </div>
        </div>
        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>稼働明細 ({detail.length}日)</div>
          {detail.length===0&&<div style={{color:C.textDim,fontSize:13}}>稼働記録がありません</div>}
          {detail.map((d,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:i<detail.length-1?`1px solid ${C.border}`:"none",gap:12}}>
              <div style={{background:C.bgDeep,borderRadius:10,padding:"6px 10px",textAlign:"center",minWidth:46,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textSub}}>{d.date.slice(5)}</div>
                <div style={{fontSize:13,fontWeight:800,color:C.blue,fontFamily:"'JetBrains Mono',monospace"}}>{d.dow}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:C.text,fontWeight:600}}>{d.site}</div>
                <div style={{fontSize:11,color:C.textSub,marginTop:2}}>{d.count}人</div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(d.cost)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STAFF TAB
// ══════════════════════════════════════════════════════════════════════════════
function EmployeesTab({employees,setEmployees,subcontractors,setSubcontractors}) {
  const [editing,setEditing]=useState(null);
  const [editingSc,setEditingSc]=useState(null);
  const saveEmp=(f)=>{if(!f.id)setEmployees(e=>[...e,{...f,id:`e${empSeq++}`}]);else setEmployees(e=>e.map(x=>x.id===f.id?f:x));setEditing(null);};
  const delEmp=(id)=>{if(window.confirm("削除しますか？")){setEmployees(e=>e.filter(x=>x.id!==id));setEditing(null);}};
  const saveSc=(f)=>{if(!f.id)setSubcontractors(s=>[...s,{...f,id:`sc${scSeq++}`}]);else setSubcontractors(s=>s.map(x=>x.id===f.id?f:x));setEditingSc(null);};
  const delSc=(id)=>{if(window.confirm("削除しますか？")){setSubcontractors(s=>s.filter(x=>x.id!==id));setEditingSc(null);}};
  if(editing)return <EmpForm emp={editing} onSave={saveEmp} onDelete={delEmp} onClose={()=>setEditing(null)}/>;
  if(editingSc)return <ScForm sc={editingSc} onSave={saveSc} onDelete={delSc} onClose={()=>setEditingSc(null)}/>;

  return (
    <div style={{padding:"16px 16px 90px"}}>
      <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
        <GlowDot color={C.blue}/> 自社従業員
      </div>
      {employees.map((emp,i)=>(
        <div key={emp.id} onClick={()=>setEditing(emp)} className="card-anim"
          style={{...s.card,cursor:"pointer",display:"flex",alignItems:"center",gap:14,animationDelay:`${i*0.05}s`,transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{width:46,height:46,borderRadius:13,background:`${C.blue}15`,border:`1px solid ${C.blue}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,fontWeight:800,color:C.blue,fontFamily:"'JetBrains Mono',monospace"}}>{emp.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>{emp.name}</div>
            <div style={{fontSize:11,color:C.textSub,marginTop:2}}>{emp.role}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.textSub,marginBottom:2}}>日給</div>
            <div style={{fontSize:16,fontWeight:800,color:C.blue,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(emp.dailyWage)}</div>
          </div>
        </div>
      ))}
      <button onClick={()=>setEditing({})}
        style={{width:"100%",background:"transparent",border:`1.5px dashed ${C.blue}60`,borderRadius:14,padding:"13px",fontSize:13,color:C.blue,cursor:"pointer",marginBottom:24,fontFamily:"inherit",fontWeight:700,transition:"all 0.2s"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue}
        onMouseLeave={e=>e.currentTarget.style.borderColor=`${C.blue}60`}>＋ 従業員を追加</button>

      <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:2,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
        <GlowDot color={C.orange}/> 外注先
      </div>
      {subcontractors.map((sc,i)=>(
        <div key={sc.id} onClick={()=>setEditingSc(sc)} className="card-anim"
          style={{...s.card,cursor:"pointer",display:"flex",alignItems:"center",gap:14,animationDelay:`${i*0.05}s`,transition:"border-color 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{width:46,height:46,borderRadius:13,background:`${C.orange}15`,border:`1px solid ${C.orange}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏢</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>{sc.company}</div>
            <div style={{fontSize:11,color:C.textSub,marginTop:2}}>担当: {sc.contact}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.textSub,marginBottom:2}}>単価/人</div>
            <div style={{fontSize:16,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(sc.dailyRate)}</div>
          </div>
        </div>
      ))}
      <button onClick={()=>setEditingSc({})}
        style={{width:"100%",background:"transparent",border:`1.5px dashed ${C.orange}60`,borderRadius:14,padding:"13px",fontSize:13,color:C.orange,cursor:"pointer",fontFamily:"inherit",fontWeight:700,transition:"all 0.2s"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
        onMouseLeave={e=>e.currentTarget.style.borderColor=`${C.orange}60`}>＋ 外注先を追加</button>
    </div>
  );
}

function EmpForm({emp,onSave,onDelete,onClose}) {
  const isNew=!emp.id;
  const [f,setF]=useState({name:"",role:"大工",dailyWage:"",...emp});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <BackHeader title={isNew?"新規従業員":"従業員編集"} onClose={onClose}/>
      <div style={{padding:"16px 16px 100px"}}>
        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>基本情報</div>
          <FInput label="氏名" value={f.name} onChange={set("name")}/>
          <FSelect label="役職・職種" value={f.role} onChange={set("role")}>
            {["大工","職長","外注","見習い","その他"].map(r=><option key={r}>{r}</option>)}
          </FSelect>
          <FInput label="日給（円）" value={f.dailyWage} onChange={set("dailyWage")} num/>
        </div>
        <button onClick={()=>onSave(f)} style={s.btnPrimary}>{isNew?"✚ 登録する":"💾 保存する"}</button>
        <div style={{height:8}}/>
        {!isNew&&<button onClick={()=>onDelete(emp.id)} style={s.btnDanger}>🗑 削除</button>}
      </div>
    </div>
  );
}

function ScForm({sc,onSave,onDelete,onClose}) {
  const isNew=!sc.id;
  const [f,setF]=useState({company:"",contact:"",dailyRate:"",...sc});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <BackHeader title={isNew?"新規外注先":"外注先編集"} onClose={onClose}/>
      <div style={{padding:"16px 16px 100px"}}>
        <div style={s.card}>
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:14}}>外注先情報</div>
          <FInput label="会社名" value={f.company} onChange={set("company")}/>
          <FInput label="担当者名" value={f.contact} onChange={set("contact")}/>
          <FInput label="日当単価（1人あたり・円）" value={f.dailyRate} onChange={set("dailyRate")} num/>
          {+f.dailyRate>0&&(
            <div style={{background:C.bgDeep,borderRadius:10,padding:"12px 14px",marginTop:4,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.textSub,letterSpacing:1,marginBottom:8}}>人数別 概算コスト</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {[1,2,3,5].map(n=>(
                  <div key={n} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.textSub,marginBottom:3}}>{n}人</div>
                    <div style={{fontSize:13,fontWeight:800,color:C.orange,fontFamily:"'JetBrains Mono',monospace"}}>{YEN(+f.dailyRate*n)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={()=>onSave(f)} style={{...s.btnPrimary,background:`linear-gradient(135deg,${C.orange},#b05a30)`}}>{isNew?"✚ 登録する":"💾 保存する"}</button>
        <div style={{height:8}}/>
        {!isNew&&<button onClick={()=>onDelete(sc.id)} style={s.btnDanger}>🗑 削除</button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab,setTab]=useState("attendance");
  const saved = loadState();
  const [sites,setSites]=useState(saved?.sites || initSites);
  const [employees,setEmployees]=useState(saved?.employees || initEmployees);
  const [subcontractors,setSubcontractors]=useState(saved?.subcontractors || initSubcontractors);
  const [attendance,setAttendance]=useState(saved?.attendance || initAttendance);
  const [showMenu,setShowMenu]=useState(false);
  const [toast,setToast]=useState("");

  // Auto-save on any change
  useEffect(()=>{
    saveState({sites,employees,subcontractors,attendance});
  },[sites,employees,subcontractors,attendance]);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""), 2500); };

  const handleExport = () => { exportData({sites,employees,subcontractors,attendance}); showToast("📥 バックアップを保存しました"); setShowMenu(false); };
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      if (data.sites) setSites(data.sites);
      if (data.employees) setEmployees(data.employees);
      if (data.subcontractors) setSubcontractors(data.subcontractors);
      if (data.attendance) setAttendance(data.attendance);
      showToast("✅ データを復元しました");
    } catch(err) { alert("読み込み失敗: "+err.message); }
    setShowMenu(false);
  };
  const handleReset = () => {
    if (window.confirm("全データを初期状態に戻します。よろしいですか？")) {
      setSites(initSites); setEmployees(initEmployees);
      setSubcontractors(initSubcontractors); setAttendance(initAttendance);
      showToast("🔄 初期データに戻しました");
      setShowMenu(false);
    }
  };

  const tabs=[["attendance","🗓","出勤"],["payroll","💴","給与"],["sites","🏗","現場"],["employees","👷","スタッフ"]];

  return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",maxWidth:480,margin:"0 auto",position:"relative"}}>
        {/* Header */}
        <div style={{background:C.bgCard,borderBottom:`1px solid ${C.border}`,padding:"14px 20px 12px",position:"sticky",top:0,zIndex:40}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.gold},#b8882a)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏗</div>
            <div>
              <div style={{fontSize:9,color:C.textSub,letterSpacing:3,textTransform:"uppercase",lineHeight:1}}>大工・請負業</div>
              <div style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:"'JetBrains Mono',monospace",letterSpacing:-0.5,lineHeight:1.2}}>現場 & 給与 管理</div>
            </div>
            <button onClick={()=>setShowMenu(true)} style={{marginLeft:"auto",background:C.bgDeep,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 10px",color:C.gold,fontSize:18,cursor:"pointer",lineHeight:1}}>⚙</button>
          </div>
        </div>

        {/* Content */}
        <div style={{paddingBottom:70}}>
          {tab==="attendance"&&<AttendanceTab sites={sites} employees={employees} subcontractors={subcontractors} attendance={attendance} setAttendance={setAttendance}/>}
          {tab==="payroll"&&<PayrollTab employees={employees} subcontractors={subcontractors} sites={sites} attendance={attendance}/>}
          {tab==="sites"&&<SitesTab sites={sites} setSites={setSites} attendance={attendance} employees={employees} subcontractors={subcontractors}/>}
          {tab==="employees"&&<EmployeesTab employees={employees} setEmployees={setEmployees} subcontractors={subcontractors} setSubcontractors={setSubcontractors}/>}
        </div>

        {/* Bottom nav */}
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,zIndex:40}}>
          <TabBar tabs={tabs} active={tab} onChange={setTab}/>
        </div>

        {/* Settings menu */}
        {showMenu && (
          <div onClick={()=>setShowMenu(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.bgCard,border:`1px solid ${C.gold}40`,borderRadius:18,padding:"22px 20px",width:"100%",maxWidth:380}}>
              <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:2,marginBottom:6}}>SETTINGS</div>
              <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:16,fontFamily:"'JetBrains Mono',monospace"}}>データ管理</div>

              <div style={{background:C.bgDeep,borderRadius:10,padding:"10px 14px",marginBottom:14,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.green,letterSpacing:1,marginBottom:3}}>● 自動保存中</div>
                <div style={{fontSize:11,color:C.textSub}}>データはこの端末に保存されています</div>
              </div>

              <button onClick={handleExport} style={{width:"100%",background:`linear-gradient(135deg,${C.gold},#b8882a)`,border:"none",borderRadius:11,padding:"12px",fontSize:14,fontWeight:700,color:C.bgDeep,cursor:"pointer",marginBottom:10,fontFamily:"inherit"}}>📥 バックアップ書き出し</button>

              <label style={{width:"100%",display:"block",background:"transparent",border:`1.5px solid ${C.border}`,borderRadius:11,padding:"12px",fontSize:14,fontWeight:600,color:C.textSub,cursor:"pointer",marginBottom:10,textAlign:"center",fontFamily:"inherit"}}>
                📤 バックアップから復元
                <input type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
              </label>

              <button onClick={handleReset} style={{width:"100%",background:"transparent",border:`1px solid ${C.red}`,borderRadius:11,padding:"11px",fontSize:13,fontWeight:600,color:C.red,cursor:"pointer",marginBottom:14,fontFamily:"inherit"}}>🗑 全データを初期化</button>

              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:4}}>
                <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:8}}>📱 ホーム画面に追加</div>
                <div style={{fontSize:11,color:C.textSub,lineHeight:1.7}}>
                  <b style={{color:C.text}}>iPhone:</b> 共有 <span style={{color:C.gold}}>⬆️</span> → 「ホーム画面に追加」<br/>
                  <b style={{color:C.text}}>Android:</b> メニュー <span style={{color:C.gold}}>⋮</span> → 「ホーム画面に追加」
                </div>
              </div>

              <button onClick={()=>setShowMenu(false)} style={{width:"100%",marginTop:16,background:"transparent",border:`1px solid ${C.border}`,borderRadius:11,padding:"11px",fontSize:13,fontWeight:600,color:C.textSub,cursor:"pointer",fontFamily:"inherit"}}>閉じる</button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:C.bgCard,border:`1px solid ${C.gold}`,borderRadius:12,padding:"12px 20px",fontSize:13,fontWeight:700,color:C.text,zIndex:200,boxShadow:`0 6px 24px rgba(0,0,0,0.5)`,animation:"fadeUp 0.3s ease"}}>{toast}</div>
        )}
      </div>
    </>
  );
}
