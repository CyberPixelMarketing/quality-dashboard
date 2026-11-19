const challenges=[
 {id:'errors',name:'صائد الأخطاء',brief:'حلّل التقرير واكتشف ٨ أخطاء مخفية، ثم اشرح سبب كل خطأ واقترح التصحيح المناسب.',key:'8 أخطاء مخفية؛ الدقة تقاس بعدد الأخطاء الصحيحة (٥ نقاط لكل خطأ). يجب أن يتضمن التسليم سبب الخطأ والتصحيح المقترح لكل نقطة.'},
 {id:'simplify',name:'المبسّط',brief:'حوّل مادة مؤسسية معقدة إلى شرح واضح قابل للاستخدام من الموظف أو العميل، مع الحفاظ على المعنى.',key:'إجابة مبسطة دقيقة لا تحذف القيود المهمة، منظمة لجمهور محدد، وتحتوي خطوات أو مثالاً عملياً. تجنب التعميم واللغة الغامضة.'},
 {id:'decision',name:'من البيانات إلى القرار',brief:'استخرج من البيانات مؤشرات قابلة للدفاع عنها، ثم حوّلها إلى قرار وتوصيات ومؤشرات متابعة.',key:'يجب التمييز بين الحقائق والاستنتاجات، ذكر الأرقام أو الاتجاهات، تفسير المخاطر والافتراضات، ثم اقتراح قرار عملي ومؤشرات قياس.'}
];
const teams=['الفريق الأول','الفريق الثاني','الفريق الثالث','الفريق الرابع'];
const STORAGE='quality-dashboard-v1', CODE_KEY='quality-dashboard-code';
const store={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v);return true}catch{return false}},del(k){try{localStorage.removeItem(k)}catch{}}};
let state;try{state=JSON.parse(store.get(STORAGE)||'null')}catch{state=null}
state=state||{round:0,teams:{},rubrics:challenges.map(c=>c.key)};
teams.forEach(t=>state.teams[t]??={});
let activeRound=state.round||0, health={ok:false,needsCode:false}, busy=new Set();
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const num=v=>Number(v)||0;
let warnedQuota=false;
function persist(){if(!store.set(STORAGE,JSON.stringify(state))&&!warnedQuota){warnedQuota=true;alert('مساحة التخزين في المتصفح ممتلئة. صدّر النتائج JSON ثم احذف بعض الصور القديمة.')}renderSummary()}
function renderSummary(){const scores=teams.map(t=>({t,total:challenges.reduce((n,c)=>n+num(state.teams[t][c.id]?.score),0),done:challenges.filter(c=>state.teams[t][c.id]?.score!=null).length})).sort((a,b)=>b.total-a.total);$('#leaderboardCards').innerHTML=scores.map((x,i)=>`<div class="score-card ${i===0&&x.total?'leader':''}"><h3>${esc(x.t)} ${i===0&&x.total?'🏆':''}</h3><div class="score-number">${x.total}<small>/ 300</small></div><div class="bar"><i style="width:${Math.min(100,x.total/3)}%"></i></div><div class="score-meta">${x.total?`الترتيب ${i+1} · ${x.done}/3 جولات`:'لم يكتمل التقييم'}</div></div>`).join('')}
function renderTabs(){$('#roundTabs').innerHTML=challenges.map((c,i)=>`<button class="${i===activeRound?'active':''}" data-round="${i}" role="tab">${i+1}. ${c.name}</button>`).join('');document.querySelectorAll('[data-round]').forEach(b=>b.onclick=()=>{activeRound=+b.dataset.round;state.round=activeRound;persist();render()})}
function renderBrief(){const c=challenges[activeRound];$('#challengeBrief').innerHTML=`<strong>${c.name}</strong> — ${c.brief}<br><span class="muted">المعيار المرجعي: ${esc(state.rubrics[activeRound]||c.key)}</span>`}
function evidenceHtml(d){const items=Array.isArray(d.findings)?d.findings:[];if(!items.length)return '';return `<details class="evidence" open><summary>أدلة احتساب الدرجة (${items.length})</summary>${items.map((f,i)=>`<div class="finding"><div class="finding-title"><b>${i+1}. ${esc(f.title||f.criterion||'ملاحظة')}</b><span class="points ${num(f.points)<0?'negative':''}">${esc(f.points??0)} نقطة</span></div><div class="finding-grid"><div><small>ما ظهر</small><p>${esc(f.observed||f.issue||'غير محدد')}</p></div><div><small>المتوقع</small><p>${esc(f.expected||'غير محدد')}</p></div><div><small>الأثر/القرار</small><p>${esc(f.impact||f.recommendation||'')}</p></div></div></div>`).join('')}</details>`}
function renderTeams(){const c=challenges[activeRound];$('#teamGrid').innerHTML=teams.map(t=>{const d=state.teams[t][c.id]||{};const isBusy=busy.has(t+c.id);return `<article class="team-card"><h3>${t}</h3><div class="field"><label>الـPrompt المستخدم</label><textarea data-field="prompt" data-team="${t}" placeholder="الصق الـPrompt هنا...">${esc(d.prompt)}</textarea></div><div class="field"><label>نتيجة Claude: نص أو Screenshot</label><textarea data-field="text" data-team="${t}" placeholder="الصق النص هنا، أو ارفع صورة أدناه...">${esc(d.text)}</textarea><label class="file-label">📷 رفع/التقاط صورة <input type="file" accept="image/*" capture="environment" data-file="${t}"></label>${d.image?`<img class="preview" src="${d.image}" style="display:block" alt=""><button class="ghost remove-img" data-remove="${t}">حذف الصورة</button>`:''}</div><div class="actions"><button class="button primary evaluate" data-team="${t}" ${isBusy?'disabled':''}>${isBusy?'جارٍ التقييم…':'تقييم بالـAI'}</button><span class="status ${isBusy?'busy':d.error?'err':''}" data-status="${t}">${esc(isBusy?'جارٍ إرسال المحتوى للتقييم…':d.error||d.status||'بانتظار التقييم')}</span></div>${d.score!=null?`<div class="result"><strong>${d.score}/100</strong><div class="breakdown"><span>دقة<br>${num(d.accuracy)}/40</span><span>Prompt<br>${num(d.promptScore)}/20</span><span>تطبيق<br>${num(d.practicality)}/20</span><span>سرعة<br>${num(d.speed)}/20</span></div><p>${esc(d.explanation||'')}</p>${evidenceHtml(d)}</div>`:''}</article>`}).join('');
 document.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{state.teams[el.dataset.team][c.id]??={};state.teams[el.dataset.team][c.id][el.dataset.field]=el.value;persist()});
 document.querySelectorAll('[data-file]').forEach(el=>el.onchange=async()=>{const f=el.files[0];if(!f)return;try{const img=await compressImage(f);state.teams[el.dataset.file][c.id]??={};state.teams[el.dataset.file][c.id].image=img;persist();renderTeams()}catch(e){alert('تعذر قراءة الصورة: '+e.message)}});
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const d=state.teams[b.dataset.remove][c.id];if(d){delete d.image;persist();renderTeams()}});
 document.querySelectorAll('.evaluate').forEach(b=>b.onclick=()=>evaluate(b.dataset.team))}

// Resize screenshots so they fit Vercel's 4.5 MB request limit and the browser's ~5 MB storage.
function compressImage(file,maxSide=1600,quality=0.82){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error);r.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('صيغة صورة غير مدعومة'));img.onload=()=>{const s=Math.min(1,maxSide/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.round(img.width*s);cv.height=Math.round(img.height*s);const ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);ctx.drawImage(img,0,0,cv.width,cv.height);resolve(cv.toDataURL('image/jpeg',quality))};img.src=r.result};r.readAsDataURL(file)})}

function accessCode(force){let code=store.get(CODE_KEY);if(health.needsCode&&(!code||force)){code=prompt('أدخل رمز دخول المحكّم:')||'';store.set(CODE_KEY,code)}return code||''}

async function evaluate(team){const c=challenges[activeRound],d=state.teams[team][c.id]||{};if(!d.prompt&&!d.text&&!d.image){alert('أضف الـPrompt ونتيجة الفريق أولاً.');return}
 const k=team+c.id;if(busy.has(k))return;busy.add(k);renderTeams();
 const submittedAt=d.submittedAt||Date.now();
 const call=code=>fetch('/api/evaluate',{method:'POST',headers:{'Content-Type':'application/json','x-access-code':code},body:JSON.stringify({team,challenge:c.name,prompt:d.prompt||'',text:d.text||'',image:d.image||'',rubric:state.rubrics[activeRound]||c.key,submittedAt})});
 let errMsg='';
 try{let res=await call(accessCode(false));if(res.status===401){res=await call(accessCode(true))}
  const raw=await res.text();let out;try{out=JSON.parse(raw)}catch{out={error:res.status===504?'انتهت مهلة الخادم، حاول مرة أخرى':raw.slice(0,200)}}
  if(!res.ok)throw Object.assign(new Error(out.error||('HTTP '+res.status)),{status:res.status});
  const cur=state.teams[team][c.id]||{};
  state.teams[team][c.id]={...cur,...out,status:'تم تقييم AI',error:'',submittedAt};
  recomputeSpeed(c.id);persist()}
 catch(e){errMsg=e.status===503?'لم يتم التقييم: مفتاح GEMINI_API_KEY غير مضاف في الخادم':e.status===401?'رمز الدخول غير صحيح':e.status===413?'الصورة كبيرة جداً':e.status===504?'انتهت مهلة التقييم، اضغط «تقييم» مرة أخرى':e.status?'لم يتم التقييم: '+e.message:'لم يتم التقييم: تعذر الاتصال بالخادم';
  state.teams[team][c.id]??={};state.teams[team][c.id].error=errMsg;persist()}
 finally{busy.delete(k);renderTeams();if(errMsg)alert(errMsg)}}

// Speed points follow the order in which teams were first evaluated in this round.
function recomputeSpeed(cid){const ranked=teams.map(t=>({t,d:state.teams[t][cid]})).filter(x=>x.d?.submittedAt&&x.d.score!=null).sort((a,b)=>a.d.submittedAt-b.d.submittedAt);ranked.forEach((x,i)=>{x.d.speed=[20,15,10,5][i]??5;x.d.score=num(x.d.accuracy)+num(x.d.promptScore)+num(x.d.practicality)+x.d.speed})}

function renderRubrics(){$('#rubricEditor').innerHTML=challenges.map((c,i)=>`<div class="field"><label>${i+1}. ${c.name}</label><textarea data-rubric="${i}">${esc(state.rubrics[i]||c.key)}</textarea></div>`).join('');document.querySelectorAll('[data-rubric]').forEach(el=>el.oninput=()=>state.rubrics[+el.dataset.rubric]=el.value)}
function render(){renderTabs();renderBrief();renderTeams();renderRubrics();renderSummary()}
$('#saveRubrics').onclick=()=>{persist();renderBrief();alert('تم حفظ المفاتيح المرجعية في هذا المتصفح.')};
$('#dismissNotice').onclick=()=>$('#setupNotice').remove();
$('#resetAll').onclick=()=>{if(confirm('تصفير كل الفرق والجولات؟')){store.del(STORAGE);location.reload()}};
function download(name,type,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#exportJson').onclick=()=>download('quality-dashboard-results.json','application/json;charset=utf-8',JSON.stringify(state,null,2));
$('#exportCsv').onclick=()=>{const rows=[['الفريق','التحدي','الدرجة','الدقة','Prompt','التطبيق','السرعة','الشرح','أدلة احتساب الدرجة']];teams.forEach(t=>challenges.forEach(c=>{const d=state.teams[t][c.id]||{};const findings=(d.findings||[]).map(f=>`${f.title||''}: ظهر=${f.observed||''} | المتوقع=${f.expected||''} | الأثر=${f.impact||''} | النقاط=${f.points??''}`).join(' || ');rows.push([t,c.name,d.score??'',d.accuracy??'',d.promptScore??'',d.practicality??'',d.speed??'',d.explanation??'',findings])}));download('quality-dashboard-results.csv','text/csv;charset=utf-8','﻿'+rows.map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n'))};
$('#importJson').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{const s=JSON.parse(t);if(!s.teams)throw new Error('ملف غير صالح');state=s;teams.forEach(t=>state.teams[t]??={});activeRound=state.round||0;persist();render();alert('تم استيراد النتائج.')}).catch(err=>alert('تعذر الاستيراد: '+err.message));e.target.value=''};
fetch('/api/health').then(r=>r.ok?r.json():null).then(x=>{if(!x)return;health=x;const b=$('#connectionBadge');if(x.ok){b.textContent='AI متصل · '+x.model;b.className='badge ok';$('#setupNotice')?.remove()}else{b.textContent='الخادم يعمل · المفتاح غير مضاف';b.className='badge warn'}}).catch(()=>{});
render();
