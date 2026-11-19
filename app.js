'use strict';
const STORAGE_KEY = 'rafiq_salah_v1';
const PRAYERS = [
  { id: 'fajr', name: 'الفجر', icon: '☼', key: 'Fajr' },
  { id: 'dhuhr', name: 'الظهر', icon: '☀', key: 'Dhuhr' },
  { id: 'asr', name: 'العصر', icon: '◉', key: 'Asr' },
  { id: 'maghrib', name: 'المغرب', icon: '◒', key: 'Maghrib' },
  { id: 'isha', name: 'العشاء', icon: '☾', key: 'Isha' }
];
const DEFAULT_DATA = {
  qada: null,
  goal: 5,
  prayerLog: {},
  qadaLog: {},
  adhkarCounts: {},
  location: null,
  lastSurah: 1
};
let data = loadData();
let currentView = 'home';
let prayerTimings = null;
let qiblaBearing = null;
let compassHeading = null;
let currentAdhkarKind = 'morning';
let surahs = [];
let toastTimer;

function loadData() {
  try { return { ...DEFAULT_DATA, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return structuredClone(DEFAULT_DATA); }
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmt(n) { return new Intl.NumberFormat('ar-EG').format(n); }
function showToast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove('show'), 2300); }
function setView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  window.scrollTo({top:0, behavior:'smooth'});
  if (view === 'qada') renderQada();
  if (view === 'prayers') { renderDailyPrayers(); if (!prayerTimings) loadPrayerTimes(); }
  if (view === 'quran') loadSurahs();
  if (view === 'adhkar') renderAdhkar();
  if (view === 'qibla') renderQibla();
}
function dateLabel() { return new Intl.DateTimeFormat('ar', {weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(new Date()); }
function dayPrayerLog() { return data.prayerLog[todayKey()] || (data.prayerLog[todayKey()] = {}); }
function countDonePrayers() { return PRAYERS.filter(p=>dayPrayerLog()[p.id]).length; }
function qadaTotalRemaining() { return data.qada ? PRAYERS.reduce((s,p)=>s+Math.max(0,Number(data.qada.remaining[p.id]||0)),0) : 0; }
function qadaTotalDone() { return data.qada ? PRAYERS.reduce((s,p)=>s+Math.max(0,Number(data.qada.done[p.id]||0)),0) : 0; }
function qadaTotalInitial() { return data.qada ? qadaTotalRemaining()+qadaTotalDone() : 0; }
function renderHome() {
  document.getElementById('todayLabel').textContent = dateLabel();
  document.getElementById('homePrayerGrid').innerHTML = PRAYERS.map(p=>`<div class="mini-prayer ${dayPrayerLog()[p.id]?'done':''}"><span class="p-icon">${p.icon}</span><strong>${p.name}</strong><small>${dayPrayerLog()[p.id]?'تمت ✓':'لم تُسجّل'}</small></div>`).join('');
  const remaining = qadaTotalRemaining(), done=qadaTotalDone(), total=qadaTotalInitial();
  document.getElementById('homeQadaRemaining').textContent = data.qada ? `${fmt(remaining)} صلاة متبقية` : 'لم تُعدّ الخطة بعد';
  document.getElementById('homeQadaCaption').textContent = data.qada ? `أنجزت ${fmt(done)} صلاة قضاء` : 'أدخل تاريخ بداية التكليف لتقدير ما عليك';
  const pct = total ? Math.round(done/total*100) : 0;
  document.getElementById('homeProgressPct').textContent = `${pct}%`;
  document.getElementById('homeProgressRing').style.background = `conic-gradient(var(--gold) ${pct*3.6}deg,#e8ece6 0deg)`;
  document.getElementById('homeProgressBar').style.width = `${pct}%`;
  document.getElementById('homeQadaDone').textContent = `المنجز: ${fmt(done)}`;
  document.getElementById('homeQadaTotal').textContent = `الإجمالي: ${fmt(total)}`;
  updateNextPrayer();
}
function renderQada() {
  const setup = document.getElementById('qadaSetup'); const dash = document.getElementById('qadaDashboard');
  setup.hidden = !!data.qada; dash.hidden = !data.qada;
  if (!data.qada) return;
  const remaining=qadaTotalRemaining(), done=qadaTotalDone(), total=remaining+done, pct=total?Math.round(done/total*100):0;
  document.getElementById('qadaRemainingTotal').textContent=fmt(remaining);
  document.getElementById('qadaDoneTotal').textContent=fmt(done);
  document.getElementById('qadaProgressBar').style.width=`${pct}%`;
  document.getElementById('qadaProgressLabel').textContent=`${pct}% مكتمل`;
  const methodNote=document.getElementById('qadaMethodNote');
  if(data.qada.gender==='female') {
    methodNote.textContent=`أساس تقديري: ${fmt(data.qada.totalDays||data.qada.days)} يومًا، استُبعد منها نحو ${fmt(data.qada.estimatedMensesDays||0)} يوم حيض (ما يعادل ${fmt(Number((data.qada.estimatedCycles||0).toFixed(1)))} دورة) وفق افتراض دورة ${fmt(data.qada.cycleLength||28)} يومًا ومدة حيض ${fmt(data.qada.periodLength||7)} أيام. الأيام الباقية هي أساس الرصيد لكل فرض قبل خصم ما أُدخل من صلوات سابقة. يمكنك تعديل الإعدادات أو الرصيد يدويًا.`;
  } else {
    methodNote.textContent=`أساس تقديري: ${fmt(data.qada.totalDays||data.qada.days)} يومًا من بداية الفترة المختارة؛ ويُستخدم العدد أساسًا لكل فرض قبل خصم الصلوات السابقة التي أدخلتها. هذا رصيد افتراضي قابل للتعديل، وليس حكمًا بأنك لم تصلِّ خلالها.`;
  }
  document.getElementById('dailyGoalValue').textContent=fmt(data.goal);
  document.getElementById('qadaPrayerList').innerHTML=PRAYERS.map(p=>`<div class="qada-prayer-row"><div><strong>${p.name}</strong><small>المتبقي: ${fmt(data.qada.remaining[p.id]||0)} · المنجز: ${fmt(data.qada.done[p.id]||0)}</small></div><div class="qada-edit"><input type="number" min="0" step="1" value="${Math.max(0,Number(data.qada.remaining[p.id]||0))}" data-qada-input="${p.id}" aria-label="المتبقي من ${p.name}"/><button data-save-qada="${p.id}">حفظ</button></div></div>`).join('');
  document.getElementById('qadaQuickActions').innerHTML=PRAYERS.map(p=>`<button class="qada-quick" data-qada-add="${p.id}" ${Number(data.qada.remaining[p.id]||0)<=0?'disabled':''}><strong>${p.name}</strong><span>+ قضاء</span></button>`).join('');
  const todayCount=Number(data.qadaLog[todayKey()]?.total||0);
  document.getElementById('todayQadaProgress').textContent=`أنجزت ${fmt(todayCount)} من هدف اليوم (${fmt(data.goal)})`;
}
function getQadaStartDate() {
  const birthStr=document.getElementById('birthDate').value;
  const ageValue=document.getElementById('bulughAge').value;
  if(!birthStr) return null;
  const birth=new Date(`${birthStr}T12:00:00`);
  const now=new Date(); now.setHours(12,0,0,0);
  if(Number.isNaN(birth.getTime()) || birth>now) return null;
  const pubertyAge=ageValue==='unknown'?15:Number(ageValue);
  const start=new Date(birth); const originalDay=start.getDate(); start.setFullYear(start.getFullYear()+pubertyAge); if(start.getDate()!==originalDay) start.setDate(0);
  if(start>now) return null;
  return {birthStr,birth,now,pubertyAge,start};
}
function getQadaEstimate() {
  const dates=getQadaStartDate();
  if(!dates) return null;
  const {birthStr,pubertyAge,start,now}=dates;
  const startUtc=Date.UTC(start.getFullYear(),start.getMonth(),start.getDate());
  const todayUtc=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const totalDays=Math.max(0,Math.round((todayUtc-startUtc)/86400000)+1);
  const gender=document.getElementById('qadaGender').value;
  let cycleLength=null, periodLength=null, estimatedCycles=0, estimatedMensesDays=0;
  if(gender==='female') {
    cycleLength=Math.floor(Number(document.getElementById('cycleLength').value));
    periodLength=Math.floor(Number(document.getElementById('periodLength').value));
    if(!Number.isFinite(cycleLength)||cycleLength<15||cycleLength>90||!Number.isFinite(periodLength)||periodLength<1||periodLength>20||periodLength>cycleLength) return {invalidCycle:true};
    // Proportional estimate: equivalent cycles over the period, without pretending to know exact cycle dates.
    estimatedCycles=totalDays/cycleLength;
    estimatedMensesDays=Math.min(totalDays,Math.round(estimatedCycles*periodLength));
  }
  return {
    birthDate:birthStr,pubertyAge,gender,
    startDate:`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`,
    totalDays,cycleLength,periodLength,estimatedCycles,estimatedMensesDays,
    eligibleDays:Math.max(0,totalDays-estimatedMensesDays)
  };
}
function updateQadaEstimatePreview() {
  const female=document.getElementById('qadaGender').value==='female';
  document.getElementById('femaleCycleFields').hidden=!female;
  const preview=document.getElementById('cycleEstimatePreview');
  if(!female){preview.textContent='';return;}
  const estimate=getQadaEstimate();
  if(!estimate){preview.textContent='أدخلي تاريخ الميلاد والعمر التقريبي عند البلوغ لعرض التقدير.';return;}
  if(estimate.invalidCycle){preview.textContent='تحققي من الأرقام: طول الدورة 15–90 يومًا، ومدة الحيض 1–20 يومًا ولا تتجاوز طول الدورة.';return;}
  preview.textContent=`التقدير الحالي: ما يعادل نحو ${fmt(Number(estimate.estimatedCycles.toFixed(1)))} دورة؛ أي قرابة ${fmt(estimate.estimatedMensesDays)} يوم حيض من أصل ${fmt(estimate.totalDays)} يوم. الأيام الباقية في أساس الحساب: ${fmt(estimate.eligibleDays)}.`;
}
function createQadaPlan(e) {
  e.preventDefault();
  const estimate=getQadaEstimate();
  if(!estimate) return showToast('تحقّق من تاريخ الميلاد وعمر البلوغ');
  if(estimate.invalidCycle) return showToast('تحقّقي من طول الدورة ومدة الحيض');
  const remembered={};
  PRAYERS.forEach(p=>{remembered[p.id]=Math.max(0,Math.floor(Number(document.getElementById(`remember${p.id[0].toUpperCase()+p.id.slice(1)}`).value)||0));});
  const remaining={},done={};
  PRAYERS.forEach(p=>{
    const rememberedCount=remembered[p.id];
    const previousTotalDone=data.qada?Math.max(0,Number(data.qada.done[p.id]||0)):0;
    const previousRemembered=data.qada?Math.max(0,Number(data.qada.remembered?.[p.id]||0)):0;
    const previouslyQadaCompleted=Math.max(0,previousTotalDone-previousRemembered);
    done[p.id]=rememberedCount+previouslyQadaCompleted;
    remaining[p.id]=Math.max(0,estimate.eligibleDays-done[p.id]);
  });
  data.qada={
    ...estimate,days:estimate.eligibleDays,remembered,remaining,done,
    createdAt:data.qada?.createdAt||new Date().toISOString()
  };
  saveData();renderQada();renderHome();showToast(`تم إنشاء رصيد بداية تقديري لمدة ${fmt(estimate.eligibleDays)} يومًا`);
}

function addQada(prayerId) {
  if (!data.qada) return;
  if (Number(data.qada.remaining[prayerId]||0)<=0) return showToast('لا يوجد متبقٍ لهذه الصلاة');
  data.qada.remaining[prayerId]--; data.qada.done[prayerId]=(data.qada.done[prayerId]||0)+1;
  if (!data.qadaLog[todayKey()]) data.qadaLog[todayKey()]={total:0,byPrayer:{}};
  data.qadaLog[todayKey()].total++; data.qadaLog[todayKey()].byPrayer[prayerId]=(data.qadaLog[todayKey()].byPrayer[prayerId]||0)+1;
  saveData(); renderQada(); renderHome(); showToast('تقبّل الله منك، تم تسجيل القضاء');
}
function saveQadaCount(id) {
  const input=document.querySelector(`[data-qada-input="${id}"]`); if (!input) return;
  const value=Math.max(0,Math.floor(Number(input.value)||0)); data.qada.remaining[id]=value; saveData(); renderQada(); renderHome(); showToast('تم تحديث عدد الصلوات');
}
function changeDailyPrayer(id) {
  const log=dayPrayerLog(); log[id]=!log[id]; if (!Object.keys(log).length) delete data.prayerLog[todayKey()]; saveData(); renderDailyPrayers(); renderHome();
}
function renderDailyPrayers() {
  const log=dayPrayerLog();
  document.getElementById('dailyPrayerList').innerHTML=PRAYERS.map(p=>`<div class="daily-prayer-row"><div><strong>${p.name}</strong><small>تسجيل الصلاة المفروضة لليوم</small></div><button class="prayer-toggle ${log[p.id]?'done':''}" data-toggle-prayer="${p.id}">${log[p.id]?'صُلّيت ✓':'تسجيل الصلاة'}</button></div>`).join('');
  document.getElementById('prayerDailyCount').textContent=`${countDonePrayers()} من 5`;
}
function renderPrayerTimes(timings) {
  const labels={Fajr:'الفجر',Sunrise:'الشروق',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};
  const symbols={Fajr:'☼',Sunrise:'◌',Dhuhr:'☀',Asr:'◉',Maghrib:'◒',Isha:'☾'};
  document.getElementById('prayerTimesList').innerHTML=Object.keys(labels).map(k=>`<div class="time-row" data-time-key="${k}"><div class="time-name"><span class="time-symbol">${symbols[k]}</span>${labels[k]}</div><time>${(timings[k]||'--:--').split(' ')[0]}</time></div>`).join('');
  document.getElementById('prayerDate').textContent=dateLabel();
  document.getElementById('locationName').textContent=data.location?.name||'موقعك الحالي';
  document.getElementById('prayerLocationLabel').textContent='المواقيت محسوبة وفق طريقة ديانت التركية (13).';
  prayerTimings=timings; updateNextPrayer();
}
function updateNextPrayer() {
  const keys=['Fajr','Dhuhr','Asr','Maghrib','Isha']; const names={Fajr:'الفجر',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};
  if (!prayerTimings) { document.getElementById('nextPrayerName').textContent='حدّد موقعك لعرض المواقيت'; document.getElementById('nextPrayerTime').textContent='--:--'; return; }
  const now=new Date(); let next=null;
  for (const key of keys) { const t=(prayerTimings[key]||'').split(' ')[0]; const [h,m]=t.split(':').map(Number); if (!Number.isFinite(h)||!Number.isFinite(m)) continue; const dt=new Date(); dt.setHours(h,m,0,0); if (dt>now) {next={key,dt};break;} }
  if (!next) { document.getElementById('nextPrayerName').textContent='فجر الغد'; document.getElementById('nextPrayerTime').textContent=prayerTimings.Fajr||'--:--'; }
  else { document.getElementById('nextPrayerName').textContent=names[next.key]; document.getElementById('nextPrayerTime').textContent=prayerTimings[next.key].split(' ')[0]; }
}
async function loadPrayerTimes(coords=null) {
  const loc=coords || data.location?.coords || {latitude:37.8746,longitude:32.4932};
  document.getElementById('prayerTimesList').innerHTML='<div class="empty-state">جارٍ جلب مواقيت الصلاة...</div>';
  try {
    const d=new Date(); const date=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    const url=`https://api.aladhan.com/v1/timings/${date}?latitude=${loc.latitude}&longitude=${loc.longitude}&method=13&school=1`;
    const res=await fetch(url); if(!res.ok) throw new Error('times'); const json=await res.json(); if(json.code!==200) throw new Error('times');
    renderPrayerTimes(json.data.timings);
    if (!data.location) { data.location={name:'قونية (تقديري)',coords:loc,approximate:true}; saveData(); document.getElementById('locationName').textContent=data.location.name; }
  } catch(err) { document.getElementById('prayerTimesList').innerHTML='<div class="empty-state">تعذّر تحميل المواقيت. تحقق من اتصال الإنترنت ثم أعد المحاولة.</div>'; }
}
function requestLocation() {
  if (!navigator.geolocation) return showToast('المتصفح لا يدعم تحديد الموقع');
  showToast('بانتظار السماح بالوصول إلى الموقع');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const coords={latitude:pos.coords.latitude,longitude:pos.coords.longitude};
    data.location={name:'موقعك الحالي',coords,approximate:false}; saveData();
    const bearing=calculateQibla(coords.latitude,coords.longitude); qiblaBearing=bearing; renderQibla(); await loadPrayerTimes(coords); showToast('تم تحديث الموقع والمواقيت');
  },()=>showToast('لم نتمكن من تحديد الموقع. تحقق من صلاحيات المتصفح.'),{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
}
function calculateQibla(lat,lon) {
  const toRad=x=>x*Math.PI/180, toDeg=x=>x*180/Math.PI;
  const kaabaLat=toRad(21.422487), kaabaLon=toRad(39.826206), phi=toRad(lat), lambda=toRad(lon);
  const y=Math.sin(kaabaLon-lambda); const x=Math.cos(phi)*Math.tan(kaabaLat)-Math.sin(phi)*Math.cos(kaabaLon-lambda);
  return (toDeg(Math.atan2(y,x))+360)%360;
}
function renderQibla() {
  const coords=data.location?.coords || {latitude:37.8746,longitude:32.4932};
  if(qiblaBearing===null) qiblaBearing=calculateQibla(coords.latitude,coords.longitude);
  document.getElementById('qiblaBearing').textContent=`${Math.round(qiblaBearing)}°`;
  document.getElementById('qiblaDirectionText').textContent=`من الشمال مع عقارب الساعة · ${data.location?.name||'اتجاه تقريبي من قونية'}`;
  const rotation=qiblaBearing-(compassHeading||0); document.getElementById('qiblaNeedle').style.transform=`translate(-50%,-80%) rotate(${rotation}deg)`;
}
async function enableCompass() {
  try {
    if (typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function') {
      const result=await DeviceOrientationEvent.requestPermission(); if(result!=='granted') return showToast('لم يتم السماح بالبوصلة');
    }
    window.addEventListener('deviceorientationabsolute', handleOrientation, true); window.addEventListener('deviceorientation', handleOrientation, true); showToast('تم تفعيل محاولة قراءة البوصلة');
  } catch { showToast('البوصلة الحية غير مدعومة في هذا المتصفح'); }
}
function handleOrientation(e) {
  let heading=typeof e.webkitCompassHeading==='number'?e.webkitCompassHeading:(typeof e.alpha==='number'?360-e.alpha:null);
  if(heading!==null){compassHeading=heading;renderQibla();}
}
async function loadSurahs() {
  if(surahs.length){renderSurahList();return;}
  const list=document.getElementById('surahList'); list.innerHTML='<div class="empty-state">يتم تحميل فهرس السور...</div>';
  try { const cached=localStorage.getItem('rafiq_surah_index'); if(cached) surahs=JSON.parse(cached); else {const r=await fetch('https://api.alquran.cloud/v1/surah');if(!r.ok)throw new Error('quran');const j=await r.json();surahs=j.data;localStorage.setItem('rafiq_surah_index',JSON.stringify(surahs));} renderSurahList(); }
  catch {list.innerHTML='<div class="empty-state">تعذّر تحميل فهرس السور. اتصل بالإنترنت ثم أعد فتح القسم.</div>';}
}
function renderSurahList(filter='') {
  const list=document.getElementById('surahList');
  const filtered=surahs.filter(s=>s.name.includes(filter)||s.englishName.toLowerCase().includes(filter.toLowerCase())||String(s.number)===filter);
  list.hidden=false; document.getElementById('surahReader').hidden=true;
  list.innerHTML=filtered.map(s=>`<button class="surah-item" data-surah="${s.number}"><span class="surah-number">${s.number}</span><span><strong>${s.name}</strong><small>${s.revelationType==='Meccan'?'مكية':'مدنية'} · ${fmt(s.numberOfAyahs)} آية</small></span></button>`).join('') || '<div class="empty-state">لا توجد سورة بهذا الاسم.</div>';
}
async function openSurah(number) {
  const list=document.getElementById('surahList'); const reader=document.getElementById('surahReader');
  list.hidden=true; reader.hidden=false; document.getElementById('ayahContainer').innerHTML='<div class="empty-state">جارٍ تحميل السورة...</div>';
  try {
    const r=await fetch(`https://api.alquran.cloud/v1/surah/${number}`);if(!r.ok)throw new Error('quran');const j=await r.json(); const s=j.data;
    document.getElementById('surahMeta').textContent=`السورة رقم ${fmt(s.number)}`;
    document.getElementById('surahArabicName').textContent=s.name;
    document.getElementById('surahDetails').textContent=`${s.revelationType==='Meccan'?'مكية':'مدنية'} · ${fmt(s.numberOfAyahs)} آية`;
    document.getElementById('ayahContainer').innerHTML=s.ayahs.map(a=>`<span class="ayah">${a.text}<span class="ayah-num">${fmt(a.numberInSurah)}</span></span>`).join('');
    data.lastSurah=number;saveData(); reader.scrollIntoView({behavior:'smooth',block:'start'});
  } catch { document.getElementById('ayahContainer').innerHTML='<div class="empty-state">تعذّر تحميل السورة. تحقق من اتصال الإنترنت.</div>'; }
}
const ADHKAR={
 morning:[
  {text:'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ.',count:1,note:'من أذكار الصباح'},
  {text:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.',count:100,note:'مئة مرة'},
  {text:'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا.',count:3,note:'ثلاث مرات'},
  {text:'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ.',count:1,note:'مرة واحدة'}
 ],
 evening:[
  {text:'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ.',count:1,note:'من أذكار المساء'},
  {text:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.',count:100,note:'مئة مرة'},
  {text:'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا.',count:3,note:'ثلاث مرات'},
  {text:'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ.',count:1,note:'مرة واحدة'}
 ],
 after:[
  {text:'أَسْتَغْفِرُ اللَّهَ.',count:3,note:'ثلاث مرات بعد السلام'},
  {text:'اللَّهُمَّ أَنْتَ السَّلَامُ، وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ.',count:1,note:'مرة واحدة'},
  {text:'سُبْحَانَ اللَّهِ.',count:33,note:'ثلاث وثلاثون مرة'},
  {text:'الْحَمْدُ لِلَّهِ.',count:33,note:'ثلاث وثلاثون مرة'},
  {text:'اللَّهُ أَكْبَرُ.',count:34,note:'أربع وثلاثون مرة'}
 ]
};
function renderAdhkar() {
  document.querySelectorAll('#adhkarTabs button').forEach(b=>b.classList.toggle('selected',b.dataset.kind===currentAdhkarKind));
  const counts=data.adhkarCounts[todayKey()]?.[currentAdhkarKind]||{};
  document.getElementById('adhkarList').innerHTML=ADHKAR[currentAdhkarKind].map((d,i)=>{const c=counts[i]||0;return `<div class="dhikr-card"><div class="dhikr-text">${d.text}</div><div class="dhikr-footer"><span class="dhikr-note">${d.note} · الهدف ${fmt(d.count)}</span><button class="dhikr-counter ${c>=d.count?'complete':''}" data-dhikr="${i}">${fmt(Math.min(c,d.count))} / ${fmt(d.count)}</button></div></div>`;}).join('');
}
function addDhikr(i) {
  if(!data.adhkarCounts[todayKey()])data.adhkarCounts[todayKey()]={};
  if(!data.adhkarCounts[todayKey()][currentAdhkarKind])data.adhkarCounts[todayKey()][currentAdhkarKind]={};
  const item=ADHKAR[currentAdhkarKind][i]; const cur=data.adhkarCounts[todayKey()][currentAdhkarKind][i]||0;
  data.adhkarCounts[todayKey()][currentAdhkarKind][i]=Math.min(item.count,cur+1); saveData();renderAdhkar();
}
function exportBackup() {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`rafiq-salah-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(url);showToast('تم تجهيز النسخة الاحتياطية');
}
function importBackup(file) {
  const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(reader.result);if(!parsed||typeof parsed!=='object')throw new Error();data={...DEFAULT_DATA,...parsed};saveData();renderHome();renderQada();renderDailyPrayers();renderAdhkar();showToast('تم استيراد النسخة الاحتياطية');}catch{showToast('ملف النسخة الاحتياطية غير صالح');}};reader.readAsText(file);
}

document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
  const go=e.target.closest('[data-go]');if(go){setView(go.dataset.go);return;}
  const add=e.target.closest('[data-qada-add]');if(add){addQada(add.dataset.qadaAdd);return;}
  const save=e.target.closest('[data-save-qada]');if(save){saveQadaCount(save.dataset.saveQada);return;}
  const toggle=e.target.closest('[data-toggle-prayer]');if(toggle){changeDailyPrayer(toggle.dataset.togglePrayer);return;}
  const surah=e.target.closest('[data-surah]');if(surah){openSurah(Number(surah.dataset.surah));return;}
  const dhikr=e.target.closest('[data-dhikr]');if(dhikr){addDhikr(Number(dhikr.dataset.dhikr));return;}
  const tab=e.target.closest('#adhkarTabs button');if(tab){currentAdhkarKind=tab.dataset.kind;renderAdhkar();return;}
});
document.getElementById('qadaSetupForm').addEventListener('submit',createQadaPlan);
['birthDate','bulughAge','qadaGender','cycleLength','periodLength'].forEach(id=>document.getElementById(id).addEventListener('input',updateQadaEstimatePreview));
['birthDate','bulughAge','qadaGender','cycleLength','periodLength'].forEach(id=>document.getElementById(id).addEventListener('change',updateQadaEstimatePreview));
document.getElementById('editQadaPlan').addEventListener('click',()=>{
  if(!confirm('إعادة حساب رصيد البداية قد تغيّر الأرقام الحالية. هل تريد تعديل بيانات البداية؟'))return;
  document.getElementById('qadaSetup').hidden=false;document.getElementById('qadaDashboard').hidden=true;
  document.getElementById('birthDate').value=data.qada.birthDate||'';
  document.getElementById('bulughAge').value=String(data.qada.pubertyAge||13);
  document.getElementById('qadaGender').value=data.qada.gender||'male';
  document.getElementById('cycleLength').value=String(data.qada.cycleLength||28);
  document.getElementById('periodLength').value=String(data.qada.periodLength||7);
  PRAYERS.forEach(p=>{const input=document.getElementById(`remember${p.id[0].toUpperCase()+p.id.slice(1)}`);if(input)input.value=String(data.qada.remembered?.[p.id]||0);});
  updateQadaEstimatePreview();
});
document.getElementById('goalMinus').addEventListener('click',()=>{data.goal=Math.max(1,data.goal-1);saveData();renderQada();});
document.getElementById('goalPlus').addEventListener('click',()=>{data.goal=Math.min(100,data.goal+1);saveData();renderQada();});
document.getElementById('resetQada').addEventListener('click',()=>{if(confirm('هل تريد حذف خطة القضاء وسجل إنجازها؟ لا يمكن التراجع عن ذلك.')){data.qada=null;data.qadaLog={};saveData();renderQada();renderHome();showToast('تمت إعادة ضبط خطة القضاء');}});
document.getElementById('locateButton').addEventListener('click',requestLocation);
document.getElementById('qiblaLocate').addEventListener('click',requestLocation);
document.getElementById('enableCompass').addEventListener('click',enableCompass);
document.getElementById('backToSurahs').addEventListener('click',()=>{document.getElementById('surahReader').hidden=true;document.getElementById('surahList').hidden=false;});
document.getElementById('surahSearch').addEventListener('input',e=>renderSurahList(e.target.value.trim()));
document.getElementById('resetAdhkar').addEventListener('click',()=>{if(data.adhkarCounts[todayKey()])delete data.adhkarCounts[todayKey()][currentAdhkarKind];saveData();renderAdhkar();showToast('تمت إعادة العدّ');});
document.getElementById('settingsShortcut').addEventListener('click',()=>setView('settings'));
document.getElementById('exportData').addEventListener('click',exportBackup);
document.getElementById('importData').addEventListener('change',e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value='';});

renderHome();renderDailyPrayers();renderQada();renderAdhkar();updateQadaEstimatePreview();
loadPrayerTimes();
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
