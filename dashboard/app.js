'use strict';
const paths={
  recycle:'<path d="m7 7 3-5 4 1 2 4m-4 0h4V3M19 9l3 5-2 4h-5m2-4-2 4 4 2M13 21H6l-3-4 3-5m-4 1 4-1 2 4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  cpu:'<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3m-6 14v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  checklist:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-6 8 2 2 4-4"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="10" cy="18" r="2" fill="white"/>',
  terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',paper:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  plastic:'<path d="M10 3h4m-4 0v4l-3 4v7a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-7l-3-4V3m-7 10h10m-10 4h10"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  pulse:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  camera:'<rect x="3" y="7" width="14" height="11" rx="2"/><path d="m17 11 4-2v7l-4-2"/>',
  bin:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',play:'<path d="m8 5 12 7-12 7z"/>',pause:'<path d="M9 5v14m6-14v14"/>',
  wifi:'<path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0m-9 4a4 4 0 0 1 6 0m-3 4h.01"/>',
  switch:'<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>',
  warn:'<path d="M12 3 2 20h20L12 3zm0 6v5m0 3h.01"/>', check:'<path d="m5 12 4 4 10-10"/>'
};
const icon=(key)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[key]+'</svg>';
document.querySelectorAll('[data-icon]').forEach(node=>node.innerHTML=icon(node.dataset.icon));
const $=(selector)=>document.querySelector(selector);
const h=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('sortcycle.'+key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem('sortcycle.'+key,JSON.stringify(value));return true}catch{return false}};
const defaults={name:'ESP32-S3-CAM',source:'demo',base:'',interval:3,full:80,minConfidence:75,paperAngle:45,plasticAngle:135,neutralAngle:90};
let settings={...defaults,...read('settings',{})};
let checks=read('checks',{}), filter='all', noticeFilter='all', running=true, timer, generation=0, demoStep=0, page, testBusy=false, toastTimer;
let testDraft={base:null,path:'/api/test/telemetry',body:JSON.stringify({device_id:'sortcycle-test',classification:{label:'paper',confidence:.94},bins:{paper:{fill:42,distance_cm:29},plastic:{fill:76,distance_cm:12}}},null,2)};
let testOutput='No request sent yet.';
const at=(offset)=>new Date(Date.now()-offset*1000).toISOString();
const demo={updated_at:at(0),classification:{label:'paper',confidence:.967,at:at(0)},counts:{paper:128,plastic:96},bins:{paper:{fill:42,distance_cm:29},plastic:{fill:76,distance_cm:12}},components:{camera:'Ready',sensors:'Sampling',gate:'Standby'},activity:[{label:'paper',confidence:.967,status:'Sorted',at:at(0)},{label:'plastic',confidence:.982,status:'Sorted',at:at(26)},{label:'paper',confidence:.945,status:'Sorted',at:at(59)},{label:'plastic',confidence:.913,status:'Sorted',at:at(116)}],notifications:[{id:'n1',severity:'warning',title:'Plastic bin nearing capacity',detail:'Plastic bin is at 76% in the simulation.',at:at(140)},{id:'n2',severity:'info',title:'Simulation ready',detail:'Camera, bin sensors and sorting gate are simulated.',at:at(520)}]};
let live=null, liveStatus='Waiting for backend', liveError='', dismissed=new Set();
const data=()=>settings.source==='demo'?demo:live;
const time=(s)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const count=(n)=>Number.isFinite(n)?n.toLocaleString():'—';
const percent=(n)=>Number.isFinite(n)?n+'%':'—';
const confidence=(n)=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
const material=(v)=>({paper:'Paper',plastic:'Plastic',unknown:'Unknown'}[v]||'Awaiting result');
const color=(v)=>({paper:'mint',plastic:'blue'}[v]||'gray');
const kind=(v)=>['paper','plastic'].includes(v)?v:'info';
const glyph=(i,c='mint')=>'<span class="glyph '+c+'">'+icon(i)+'</span>';
const pill=(text,theme='mint',dot=false)=>'<span class="pill '+theme+'">'+(dot?'<b></b>':'')+h(text)+'</span>';
const button=(label,ico,attrs='',primary=false)=>'<button type="button" class="btn '+(primary?'primary':'')+'" '+attrs+'>'+icon(ico)+h(label)+'</button>';
const heading=(category,title,subtitle,actions='')=>'<div class="page-head"><div><p class="eyebrow">'+category+'</p><h1>'+title+'</h1><p class="sub">'+subtitle+'</p></div>'+(actions?'<div class="actions">'+actions+'</div>':'')+'</div>';
const panelHead=(title,sub='',right='')=>'<div class="card-head"><div><h2>'+title+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+right+'</div>';
const metric=(label,val,note,i,c)=>'<article class="card metric"><span class="metric-label">'+label+'</span><strong>'+h(val)+'</strong>'+glyph(i,c)+'<small>'+note+'</small></article>';
function toast(message){$('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',3200)}
function validUrl(value){
  let url;
  try{url=new URL(value)}catch{throw Error('Enter a valid Python backend base URL.')} 
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&(local||url.origin===location.origin)))||url.username||url.password||url.search||url.hash)throw Error('Use an HTTPS base URL or the local server’s own HTTP URL, without credentials, query or fragment.');
  return url.href.replace(/\/+$/,'');
}
function imageUrl(value){
  if(!value)return '';
  try{const url=new URL(value,validUrl(settings.base)+'/');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch{return ''}
}
function cameraArt(label){
  return '<svg viewBox="0 0 640 286" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="table"><stop stop-color="#405c4e"/><stop offset="1" stop-color="#172c24"/></radialGradient><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0v28" fill="none" stroke="#a2cbb4" stroke-opacity=".09"/></pattern><linearGradient id="paper" x2=".8" y2="1"><stop stop-color="#fffdf0"/><stop offset="1" stop-color="#c5cfc1"/></linearGradient><linearGradient id="bottle"><stop stop-color="#437f9d"/><stop offset=".5" stop-color="#add7e2"/><stop offset="1" stop-color="#427c9d"/></linearGradient></defs><rect width="640" height="286" fill="url(#table)"/><rect width="640" height="286" fill="url(#grid)"/><path d="M47 0h33v286H47zm513 0h33v286h-33z" fill="#192f26" opacity=".68"/><path d="M80 0v286M560 0v286" stroke="#82aa93" opacity=".23"/><ellipse cx="322" cy="211" rx="107" ry="18" fill="#10241b" opacity=".45"/>'+(label==='plastic'?'<g transform="rotate(-24 320 143)"><path d="M296 94q0-13 14-22v-15h21v15q14 9 14 22v108q0 12-12 12h-25q-12 0-12-12z" fill="url(#bottle)" stroke="#d5eafa" stroke-width="2"/><path d="M309 55v-11h23v11z" fill="#3965a0"/><path d="M298 123h45v37h-45z" fill="#e4edf1"/><path d="M305 112h30m-30 56h30m-30 12h30m-30 12h30" stroke="#e2f6ff" opacity=".7"/></g>':label==='paper'?'<g transform="rotate(-13 320 145)"><path d="M266 78l103 7 14 118-119 10-13-96z" fill="#142d24" opacity=".5" transform="translate(7 7)"/><path d="M262 75l100 1 19 120-117 14-14-101z" fill="url(#paper)" stroke="#e0e7d8"/><path d="m262 75 10 31-22 3m112-33-7 28 14 12m-105 94 18-28 16 24" fill="#a6b6a9" opacity=".55"/><path d="m281 115 63-8m-62 22 70-9m-68 23 60-7m-58 22 61-9m-59 24 45-6" stroke="#7c9388" stroke-width="2" opacity=".75"/><path d="m251 110 19 12 6 29 15 12 6 43m64-127-10 42 13 26-8 52" fill="none" stroke="#fffdf4" stroke-width="2" opacity=".7"/></g>':'')+(label==='paper'||label==='plastic'?'<path d="M218 83V59h28m149 0h28v24m0 116v24h-28m-149 0h-28v-24" fill="none" stroke="#a8f2bd" stroke-width="2.5"/><rect x="218" y="59" width="205" height="164" rx="3" fill="none" stroke="#a8f2bd" stroke-dasharray="4 5" opacity=".5"/><rect x="218" y="41" width="68" height="18" rx="3" fill="#a8f2bd"/><text x="226" y="54" fill="#153525" font-family="monospace" font-size="10" font-weight="700">'+label.toUpperCase()+'</text>':'')+'<path d="M320 132v23m-11-12h22" stroke="#e2f3ea" stroke-opacity=".48"/></svg>';
}
function binCard(key,bin){
  const level=bin?.fill;
  const warn=Number.isFinite(level)&&level>=settings.full;
  const near=Number.isFinite(level)&&level>=settings.full-10;
  const desc=warn?'Full alert':near?'Nearing full':Number.isFinite(level)?'Normal':'No reading';
  return '<article class="bin"><div class="bin-title">'+glyph('bin',color(key))+'<div><h3>'+material(key)+' bin</h3><small>HC-SR04 · Sensor '+(key==='paper'?'01':'02')+'</small></div><strong>'+percent(level)+'</strong></div><div class="bar '+(near?'warning':key==='plastic'?'bluebar':'')+'" '+(Number.isFinite(level)?'role="progressbar" aria-label="'+material(key)+' bin fill" aria-valuenow="'+level+'"':'aria-hidden="true"')+'><span style="width:'+(level??0)+'%"></span></div><div class="bin-bottom"><span>'+desc+'</span><span>'+(Number.isFinite(bin?.distance_cm)?bin.distance_cm+' cm to surface':'Distance unavailable')+'</span></div></article>';
}
function activityRows(items,empty='No sorting events yet.'){
  return items.length?items.map(e=>'<div class="event">'+glyph(kind(e.label),color(e.label))+'<div><strong>'+material(e.label)+'</strong><small>'+h(e.status)+' · '+confidence(e.confidence)+' confidence</small></div><time>'+time(e.at)+'</time></div>').join(''):'<p class="empty-state">'+empty+'</p>';
}
const notices=()=> (data()?.notifications??[]).filter(n=>!dismissed.has(settings.source+':'+n.id));
function noticeRows(items,allowDismiss=false){
  return items.length?items.map((n)=>'<div class="event">'+glyph(n.severity==='warning'?'warn':'info',n.severity==='warning'?'amber':'mint')+'<div><strong>'+h(n.title)+'</strong><small>'+h(n.detail)+'</small></div><time>'+time(n.at)+'</time>'+(allowDismiss?'<button class="btn" type="button" data-dismiss="'+h(n.id)+'">Dismiss</button>':'')+'</div>').join(''):'<p class="empty-state">No notification events to show.</p>';
}
function overview(){
  const d=data(), c=d?.classification, pic=imageUrl(c?.image_url), isDemo=settings.source==='demo';
  const state=isDemo?(running?'Simulated':'Paused'):liveStatus;
  const sum=d?d.counts.paper+d.counts.plastic:null;
  const mode=isDemo?'Simulated feed. Use Device settings to connect your Python backend.':(liveError||'Live mode polls your Python backend for the latest device telemetry.');
  return heading('Monitoring workspace','System overview','Camera classifications, bin capacity and sorting events in one place.',isDemo?button(running?'Pause simulation':'Resume simulation',running?'pause':'play','id="toggle"')+button('Simulate item','play','id="simulate"',true):button('Refresh now','pulse','id="refresh"',true))+
    '<div class="banner '+(!isDemo&&liveError?'warn':'')+'">'+icon('info')+'<span>'+h(mode)+'</span><a href="#settings">Device settings '+icon('arrow')+'</a></div>'+
    '<section class="metrics" aria-label="Key metrics">'+metric('Total sorted',count(sum),'Paper and plastic combined','layers','mint')+metric('Paper items',count(d?.counts.paper),'Routed to paper bin','paper','mint')+metric('Plastic items',count(d?.counts.plastic),'Routed to plastic bin','plastic','blue')+metric('System status',state,d?'Updated '+time(d.updated_at):'Awaiting telemetry','pulse',!isDemo&&liveStatus!=='Online'?'amber':'mint')+'</section>'+
    '<div class="dashboard-grid"><div class="stack"><section class="card panel">'+panelHead('Camera classification','ESP32-S3-CAM · Latest classified frame',pill(isDemo?'SIMULATED':pic?'LATEST FRAME':'TELEMETRY',isDemo?'mint':'gray',true))+
    '<div class="camera"><span class="camera-label">'+(isDemo?'SIM CAM 01':'CAM 01')+'</span>'+(isDemo?cameraArt(c?.label):pic?'<img src="'+h(pic)+'" alt="Latest frame from the ESP32 camera" referrerpolicy="no-referrer"><span class="empty" id="frame-error" hidden>Camera image unavailable</span>':'<span class="empty">'+icon('camera')+'<br>No image supplied by the backend</span>')+'<span class="camera-time">'+time(c?.at)+'</span></div>'+
    '<div class="classification">'+glyph(kind(c?.label),color(c?.label))+'<div><small>Detected material</small><strong>'+material(c?.label)+'</strong></div><div class="confidence"><small>Model confidence</small><strong>'+confidence(c?.confidence)+'</strong></div></div></section>'+
    '<section class="card panel">'+panelHead('Recent sorting activity','Latest reported sorting outcomes','<a class="more" href="#activity">View activity '+icon('arrow')+'</a>')+activityRows((d?.activity??[]).slice(0,3))+'</section></div>'+
    '<div class="stack"><section class="card panel">'+panelHead('Bin fill levels','Ultrasonic distance readings',pill('Alert at '+settings.full+'%','gray'))+binCard('paper',d?.bins.paper)+binCard('plastic',d?.bins.plastic)+'</section>'+
    '<section class="card panel">'+panelHead('Device status','Camera, sensors and sorting gate')+'<div class="component-list">'+[['camera','ESP32-S3-CAM','camera'],['pulse','Ultrasonic sensors','sensors'],['switch','Servo sorting gate','gate']].map(([i,label,key])=>'<div class="component"><span>'+icon(i)+label+'</span>'+pill(d?.components?.[key]||'Unknown',!isDemo?'gray':'mint',true)+'</div>').join('')+'</div></section>'+
    '<section class="card panel">'+panelHead('Notifications','Capacity alerts and device events','<a class="more" href="#notifications">View all '+icon('arrow')+'</a>')+noticeRows(notices().slice(0,2))+'</section></div></div>';
}
function sortingPage(){
  const entries=(data()?.activity??[]).filter(e=>filter==='all'||e.label===filter);
  return heading('Monitoring workspace','Sorting activity','Review paper, plastic and unknown classifications and their reported routing outcomes.')+
    '<section class="card panel">'+panelHead('Event history',entries.length+' shown','<label class="field">Material<select id="activity-filter">'+['all','paper','plastic','unknown'].map(v=>'<option value="'+v+'" '+(filter===v?'selected':'')+'>'+(v==='all'?'All materials':material(v))+'</option>').join('')+'</select></label>')+'<div id="activity-rows">'+activityRows(entries)+'</div></section>';
}
function notificationsPage(){
  const all=notices(), entries=all.filter(n=>noticeFilter==='all'||n.severity===noticeFilter);
  return heading('Monitoring workspace','Notifications','Review bin capacity alerts and device events reported to this dashboard.')+
    '<section class="card panel">'+panelHead('Event inbox',entries.length+' shown','<label class="field">Severity<select id="notice-filter">'+[['all','All severities'],['warning','Warnings'],['info','Info']].map(([v,label])=>'<option value="'+v+'" '+(noticeFilter===v?'selected':'')+'>'+label+'</option>').join('')+'</select></label>')+'<div id="notice-rows">'+noticeRows(entries,true)+'</div><p class="note">Dismissed events are hidden for this tab session.</p></section>';
}
function wiringPage(){
  const pins=[
    ['Paper HC-SR04','TRIG','GPIO 1','ESP32 output. Check the sensor’s trigger logic level.'],
    ['Paper HC-SR04','ECHO','GPIO 2','Shift the 5 V ECHO signal down before the GPIO.'],
    ['Plastic HC-SR04','TRIG','GPIO 4','ESP32 output. Check the camera and carrier routing.'],
    ['Plastic HC-SR04','ECHO','GPIO 5','Use its own ECHO level shift and verify GPIO availability.'],
    ['Servo sorting gate','PWM signal','GPIO 6','Verify camera routing and servo input logic.'],
    ['Both HC-SR04s','VCC / GND','Regulated 5 V / common GND','Check the sensor labels and supply voltage.'],
    ['Servo sorting gate','Power / GND','Rated external supply / common GND','Size the supply for stall current.'],
    ['Onboard camera','DVP / SCCB','Board-specific','Use the carrier’s camera pin profile and verify the sensor.']
  ];
  return heading('Device tools','Wiring & pin assignments','Reference for a generic ESP32-S3-CAM with an ESP32-S3-WROOM module marking.')+
    '<div class="banner warn">'+icon('warn')+'<span><strong>Tentative GPIO assignments.</strong> Verify your exact carrier board and camera pin map before wiring or applying power.</span></div>'+
    '<section class="card panel long">'+panelHead('Candidate pin map','GPIO labels refer to signal names rather than header positions.',pill('Verification required','amber'))+'<div class="scroll"><table><thead><tr><th>Component</th><th>Signal</th><th>Candidate connection</th><th>Check before use</th></tr></thead><tbody>'+pins.map(row=>'<tr>'+row.map((v,i)=>i===0?'<th scope="row">'+v+'</th>':'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>'+
    '<div class="columns"><section class="card panel">'+panelHead('ECHO level shifting','Build a separate divider for each sensor.')+'<pre>HC-SR04 ECHO ── 10 kΩ ──●── ESP32 GPIO\n                         │\n                        10 kΩ\n                         │\nCommon GND ──────────────┘</pre><p class="hint">This example divides a 5 V ECHO signal to about 2.5 V. Verify input thresholds and levels before use. Connect the controller, sensor supplies and servo supply grounds together. Keep servo power off the 3.3 V pin.</p></section>'+
    '<section class="card panel">'+panelHead('Board checks','Confirm the carrier routing and module variant.')+'<ul class="guide-list"><li>Check the board schematic for the camera, microSD, LEDs and header breakouts. Use only verified spare GPIOs.</li><li>Check boot strapping on GPIO 0, 3, 45 and 46, native USB on 19 and 20, and memory reservations. GPIO 35–37 are used by some octal PSRAM variants.</li><li>Disconnect power before wiring, then verify supply and signal voltages before connecting the GPIOs. Trigger one ultrasonic sensor at a time to reduce crosstalk.</li></ul><div class="note"><a href="https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf" target="_blank" rel="noopener">Espressif module datasheet</a> · <a href="https://learn.adafruit.com/distance-measurement-ultrasound-hcsr04/connect-the-sensor" target="_blank" rel="noopener">HC-SR04 wiring reference</a> · <a href="https://github.com/espressif/arduino-esp32/blob/master/libraries/ESP32/examples/Camera/CameraWebServer/camera_pins.h" target="_blank" rel="noopener">Espressif camera pin examples</a></div></section></div>';
}
const steps=[
  ['identify','Identify the board and camera','Record the carrier revision, WROOM suffix and camera sensor model. Find the schematic or verified camera profile.'],
  ['camera','Boot the camera by itself','Flash a camera test using the verified profile. Confirm a clear JPEG from the waste staging area.'],
  ['levels','Verify the supply and ECHO voltages','Connect common grounds and measure each level-shifted ECHO signal before connecting GPIOs.'],
  ['sensors','Calibrate each bin separately','Record empty and full distances and trigger the sensors in sequence. Confirm fill increases as distance decreases.'],
  ['servo','Calibrate servo travel','With the chute clear, verify neutral, paper and plastic positions. Check that no position binds.'],
  ['python','Check the Python backend','Run the health check and a sample telemetry POST from the Connection test page. Then check from the ESP32’s network.'],
  ['live','Verify real device data','Send a known sample from the ESP32. Confirm the device timestamp and classification in Connection test and on the live dashboard.'],
  ['alerts','Test sorting and capacity alerts','Test paper, plastic and low-confidence samples. Confirm full-bin handling and verify an alert near the configured threshold.']
];
function setupPage(){
  const n=steps.filter(([key])=>checks[key]).length;
  return heading('Device tools','Setup checklist','Work through camera bring-up, wiring, calibration and end-to-end verification.',button('Reset checklist','checklist','id="reset-checks"'))+
    '<section class="card panel">'+panelHead('Commissioning progress','Progress is saved in this browser.',pill(n+' / '+steps.length+' complete','mint'))+
    '<div class="progress" role="progressbar" aria-label="Setup progress" aria-valuenow="'+Math.round(n/steps.length*100)+'" style="margin-bottom:15px"><span style="width:'+n/steps.length*100+'%"></span></div>'+
    steps.map(([key,title,desc])=>'<label class="check-row"><input type="checkbox" data-check="'+key+'" '+(checks[key]?'checked':'')+'><span><strong>'+title+'</strong><span class="hint">'+desc+'</span></span></label>').join('')+'</section>';
}
const field=(label,name,type,attrs='',cls='')=>'<label class="field '+cls+'">'+label+'<input name="'+name+'" type="'+type+'" value="'+h(settings[name])+'" '+attrs+'></label>';
function settingsPage(){
  return heading('Device tools','Device settings','Choose the telemetry source and edit dashboard preferences and calibration targets.')+
    '<form id="settings-form" class="columns"><section class="card panel">'+panelHead('Device & data source','Settings are saved in this browser.')+'<div class="form-grid">'+
    field('Display name','name','text','required maxlength="40"','span-all')+
    '<label class="field">Data source<select name="source"><option value="demo" '+(settings.source==='demo'?'selected':'')+'>Simulation</option><option value="live" '+(settings.source==='live'?'selected':'')+'>Live Python backend</option></select></label>'+
    field('Polling interval (seconds)','interval','number','required min="1" max="60"')+field('Python backend base URL','base','url','placeholder="'+h(location.origin)+'"','span-all')+
    '</div><p class="note">Live mode reads <code>GET /api/telemetry</code>. The browser must be able to reach the backend and its CORS policy must allow this Site. See <a href="#test">Connection test</a> for the response format.</p><div class="form-actions"><button class="btn primary" type="submit">'+icon('check')+'Save settings</button>'+button('Restore defaults','settings','id="defaults"')+'</div><p id="settings-error" class="hint" role="alert"></p></section>'+
    '<section class="card panel">'+panelHead('Alerts & calibration','Firmware and backend values must be configured separately.')+'<div class="form-grid">'+field('Bin full threshold (%)','full','number','required min="1" max="100"')+field('Minimum confidence (%)','minConfidence','number','required min="0" max="100"')+field('Paper position (°)','paperAngle','number','required min="0" max="180"')+field('Plastic position (°)','plasticAngle','number','required min="0" max="180"')+field('Neutral position (°)','neutralAngle','number','required min="0" max="180"')+'</div><p class="note">The threshold updates the dashboard indicators and simulated alerts. Minimum confidence and angles affect simulation. Use the saved values as calibration references when updating your device.</p></section></form>';
}
const contract={
  device_id:'esp32-s3-cam-01',updated_at:'2026-11-10T07:15:00Z',
  classification:{label:'paper',confidence:.94,at:'2026-11-10T07:15:00Z',image_url:'/frames/latest.jpg'},
  counts:{paper:12,plastic:8},bins:{paper:{fill:42,distance_cm:29},plastic:{fill:76,distance_cm:12}},
  components:{camera:'Ready',sensors:'Sampling',gate:'Standby'},
  activity:[{label:'paper',confidence:.94,status:'Sorted',at:'2026-11-10T07:15:00Z'}],
  notifications:[{id:'capacity-plastic-01',severity:'warning',title:'Plastic bin nearing capacity',detail:'Plastic bin is at 76%.',at:'2026-11-10T07:15:00Z'}]
};
function testPage(){
  return heading('Device tools','Connection test','Check your Python API from this browser and verify the latest report sent by your ESP32.')+
    '<div class="columns"><section class="card panel">'+panelHead('API request console','Send a health check, read telemetry or send a test payload.')+
    '<form id="test-form" class="form-grid"><label class="field span-all">Backend base URL<input type="url" name="testBase" required placeholder="https://backend.example.com" value="'+h(testDraft.base??(settings.base||location.origin))+'"></label>'+
    '<label class="field span-all">Test POST path<input name="testPath" value="'+h(testDraft.path)+'" required></label>'+
    '<label class="field span-all">Test JSON payload<textarea name="testBody" rows="7" spellcheck="false">'+h(testDraft.body)+'</textarea></label></form>'+
    '<div class="form-actions">'+button('Health check','pulse','data-request="health"',true)+button('Read telemetry','wifi','data-request="telemetry"')+button('Send test POST','terminal','data-request="post"')+'</div>'+
    '<p class="note">Use a dedicated test endpoint that validates or echoes the sample and leaves counters and gate control untouched.</p></section>'+
    '<section class="card panel">'+panelHead('Response log','Request URL, status, latency and response body.')+'<pre id="test-output" role="status" tabindex="0">'+h(testOutput)+'</pre>'+
    '<p class="hint">For an end-to-end test, send a real item from the ESP32 and run <strong>Read telemetry</strong>. Verify the device ID, fresh timestamp and expected label. A passing health check confirms browser-to-backend reachability.</p></section></div>'+
    '<section class="card panel" style="margin-top:15px">'+panelHead('Python API contract','Map these example routes and fields to your Python service.')+
    '<ul class="guide-list"><li><code>GET /api/health</code> returns a successful HTTP status when the API is reachable.</li><li><code>GET /api/telemetry</code> returns the latest ESP32 snapshot, newest events first. Send ISO 8601 timestamps with timezone offsets, fill from 0 to 100, confidence from 0 to 1, and labels <code>paper</code>, <code>plastic</code> or <code>unknown</code>. Optional fields include the image URL, component states and event lists.</li><li><code>POST /api/test/telemetry</code> accepts JSON and returns a test response. Use your backend’s existing firmware ingestion route for actual device reports.</li><li>The Python server serves this dashboard and API together. Use the same URL as this page for the local dashboard. For a hosted dashboard, use browser-reachable HTTPS and allow its exact origin in CORS. Use the PC’s LAN IP for the ESP32.</li></ul><details><summary>Example telemetry JSON</summary><pre>'+h(JSON.stringify(contract,null,2))+'</pre></details></section>';
}
const pages={dashboard:['Overview',overview],activity:['Sorting activity',sortingPage],notifications:['Notifications',notificationsPage],wiring:['Wiring & pins',wiringPage],setup:['Setup checklist',setupPage],settings:['Device settings',settingsPage],test:['Connection test',testPage]};
function render(moveFocus=false){
  const active=document.activeElement;
  const focusId=active?.id, check=active?.dataset?.check;
  $('#content').innerHTML=pages[page][1]();
  const frame=$('.camera img');
  if(frame){
    const showError=()=>{frame.hidden=true;$('#frame-error')?.removeAttribute('hidden')};
    frame.onerror=showError;
    if(frame.complete&&!frame.naturalWidth)showError();
  }
  const state=settings.source==='demo'?(running?'Simulation mode':'Simulation paused'):'Live · '+liveStatus;
  $('#connection').outerHTML=pill(state,settings.source==='live'&&liveStatus!=='Online'?'amber':'mint',true).replace('class="pill','id="connection" class="pill');
  $('#side-device').textContent=settings.name;
  const badge=$('#badge'), warnings=notices().filter(n=>n.severity==='warning').length;
  badge.hidden=!warnings;
  badge.textContent=warnings;
  $('#crumb').textContent=pages[page][0];
  document.querySelectorAll('[data-page]').forEach(a=>a.dataset.page===page?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  if(moveFocus)$('#content').focus();
  else if(focusId&&focusId!=='content')document.getElementById(focusId)?.focus({preventScroll:true});
  else if(check)document.querySelector('[data-check="'+check+'"]')?.focus({preventScroll:true});
  updateTestButtons();
}
function navigate(){
  const target=location.hash.slice(1);
  if(target==='content')return;
  const next=Object.hasOwn(pages,target)?target:'dashboard';
  const changed=page&&page!==next;
  page=next;
  closeMenu();
  render(changed);
  if(changed)window.scrollTo(0,0);
}
function refreshViews(){
  if(['dashboard','activity','notifications'].includes(page))render();
  else if(settings.source==='live'){
    const badge=$('#connection');
    badge.className='pill '+(liveStatus==='Online'?'mint':'amber');
    badge.replaceChildren(document.createElement('b'),document.createTextNode('Live · '+liveStatus));
  }
}
function addDemoNotice(severity,title,detail){
  demo.notifications.unshift({id:'demo-'+demoStep+'-'+title,severity,title,detail,at:at(0)});
  demo.notifications=demo.notifications.slice(0,40);
}
function simulate(){
  const labels=['plastic','paper','paper','plastic','paper','plastic','unknown'];
  const label=labels[demoStep%labels.length];
  const conf=label==='unknown'?.49:[.962,.976,.927,.987,.941][demoStep%5];
  demoStep++;
  const stamp=at(0), bin=demo.bins[label];
  let status='Held for review';
  demo.classification={label,confidence:conf,at:stamp};
  demo.updated_at=stamp;
  demo.components.gate='Neutral · '+settings.neutralAngle+'°';
  if(bin&&conf*100>=settings.minConfidence){
    if(bin.fill>=settings.full){
      status='Held · bin full';
      if(!demo.notifications.some(n=>n.title===material(label)+' bin full'))addDemoNotice('warning',material(label)+' bin full','Sorting held at '+bin.fill+'% fill.');
    }else{
      const prev=bin.fill;
      bin.fill=Math.min(100,prev+(label==='plastic'?3:2));
      bin.distance_cm=Math.max(0,Math.round(50*(1-bin.fill/100)));
      demo.counts[label]++;
      status='Sorted';
      demo.components.gate=material(label)+' · '+settings[label+'Angle']+'°';
      if(prev<settings.full&&bin.fill>=settings.full)addDemoNotice('warning',material(label)+' bin full','Fill reached '+bin.fill+'%.');
      else if(prev<settings.full-10&&bin.fill>=settings.full-10)addDemoNotice('warning',material(label)+' bin nearing capacity','Fill reached '+bin.fill+'%.');
    }
  }
  demo.activity.unshift({label,confidence:conf,status,at:stamp});
  demo.activity=demo.activity.slice(0,100);
  refreshViews();
}
const isDate=(v)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(v);
const inRange=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const validLabel=(v)=>['paper','plastic','unknown'].includes(v);
function validateSnapshot(d){
  if(!isDate(d?.updated_at)||!['paper','plastic'].every(key=>Number.isSafeInteger(d.counts?.[key])&&d.counts[key]>=0&&d.bins?.[key]&&
    (d.bins[key].fill===null||inRange(d.bins[key].fill,0,100))&&(d.bins[key].distance_cm==null||inRange(d.bins[key].distance_cm,0,10000))))throw Error('Telemetry must include a timezone-aware updated_at, valid counts and both bin fill values.');
  if(d.classification&&(!validLabel(d.classification.label)||!isDate(d.classification.at)||!(inRange(d.classification.confidence,0,1)||(d.classification.label==='unknown'&&d.classification.confidence===null))))throw Error('Invalid classification label, confidence or timestamp.');
  return {...d,activity:Array.isArray(d.activity)?d.activity.filter(e=>validLabel(e?.label)&&isDate(e.at)).slice(0,100):[],notifications:Array.isArray(d.notifications)?d.notifications.filter(n=>n&&['warning','info'].includes(n.severity)&&typeof n.id==='string').slice(0,100):[]};
}
async function request(url,options={}){
  return fetch(url,{...options,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000)});
}
let pollRunning=false;
async function poll(){
  if(settings.source!=='live'||pollRunning)return;
  const current=generation;
  pollRunning=true;
  try{
    const response=await request(validUrl(settings.base)+'/api/telemetry');
    if(!response.ok)throw Error('Telemetry returned HTTP '+response.status+'.');
    const snapshot=validateSnapshot(await response.json());
    if(current!==generation)return;
    live=snapshot;
    const age=Date.now()-Date.parse(snapshot.updated_at);
    const clockSkew=age< -10000;
    const stale=age>Math.max(30000,settings.interval*3000);
    liveStatus=stale||clockSkew?'Check timestamp':'Online';
    liveError=clockSkew?'The ESP32 timestamp is ahead of this browser. Check the device clock.':stale?'The backend is reachable. The latest ESP32 report is stale.':'';
  }catch(error){
    if(current!==generation)return;
    liveStatus=live?'Data stale':'Unavailable';
    liveError=error instanceof TypeError?'Backend request failed. Check the URL, browser network access and CORS.':error.name==='TimeoutError'?'The backend timed out.':error.message;
  }finally{
    pollRunning=false;
    if(current===generation)refreshViews();
    else if(settings.source==='live')poll();
  }
}
function schedule(){
  clearInterval(timer);
  generation++;
  if(settings.source==='live'){
    poll();
    timer=setInterval(poll,settings.interval*1000);
  }else timer=setInterval(()=>{if(running)simulate()},Math.max(settings.interval,5)*1000);
}
function updateTestButtons(){
  document.querySelectorAll('[data-request]').forEach(b=>b.disabled=testBusy);
}
async function testRequest(type){
  const form=$('#test-form');
  if(!form||testBusy)return;
  const fields=new FormData(form);
  const start=performance.now();
  let url='',method='GET',details='';
  testBusy=true;
  updateTestButtons();
  $('#test-output').textContent='Sending request…';
  try{
    const base=validUrl(fields.get('testBase'));
    const path=type==='post'?fields.get('testPath').trim():type==='health'?'/api/health':'/api/telemetry';
    if(!/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(path)||path.split('/').includes('..'))throw Error('Use a relative endpoint path such as /api/test/telemetry.');
    url=base+path;
    const opts={};
    if(type==='post'){
      method='POST';
      const body=JSON.parse(fields.get('testBody'));
      if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Enter a JSON object for the test payload.');
      opts.method=method;
      opts.headers={'Content-Type':'application/json'};
      opts.body=JSON.stringify(body);
    }
    const response=await request(url,opts);
    const body=(await response.text()).slice(0,16000);
    const elapsed=Math.round(performance.now()-start);
    details=method+' '+url+'\nHTTP '+response.status+' · '+elapsed+' ms';
    let formatted=body;
    try{
      const parsed=JSON.parse(body);
      formatted=JSON.stringify(parsed,null,2);
      if(type==='telemetry'&&response.ok){
        try{const snapshot=validateSnapshot(parsed);details+='\nValid telemetry · '+(snapshot.device_id||'Device ID unavailable')+' · '+snapshot.updated_at}
        catch(error){details+='\n'+error.message}
      }
    }catch{if(type==='telemetry'&&response.ok)details+='\nExpected a JSON telemetry snapshot.'}
    details+='\n\n'+(formatted||'(Empty body)');
  }catch(error){
    details=(url?method+' '+url+'\n':'')+(error instanceof TypeError?'Request failed. Check the backend address, CORS, HTTPS and browser local network permissions.':error.name==='TimeoutError'?'The request timed out after 8 seconds.':error.message);
  }finally{
    testOutput=details;
    testBusy=false;
    if(page==='test'){
      $('#test-output').textContent=details;
      updateTestButtons();
    }
  }
}
function closeMenu(){
  $('.sidebar').classList.remove('open');
  $('#menu').setAttribute('aria-expanded','false');
}
$('#menu').onclick=()=>{
  const open=$('.sidebar').classList.toggle('open');
  $('#menu').setAttribute('aria-expanded',String(open));
  if(open)$('[data-page="'+page+'"]').focus();
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('.sidebar').classList.contains('open')){closeMenu();$('#menu').focus()}});
document.addEventListener('click',event=>{
  if($('.sidebar').classList.contains('open')&&!event.target.closest('.sidebar,#menu')){closeMenu();return}
  const button=event.target.closest('button');
  if(!button)return;
  const id=button.id;
  if(id==='simulate')simulate();
  if(id==='toggle'){running=!running;render()}
  if(id==='refresh')poll();
  if(id==='defaults'){settings={...defaults};live=null;liveStatus='Waiting for backend';liveError='';write('settings',settings);schedule();render();toast('Default settings restored.')}
  if(id==='reset-checks'&&Object.values(checks).some(Boolean)&&confirm('Reset all setup checklist steps?')){checks={};write('checks',checks);render();toast('Checklist reset.')}
  if(button.dataset.dismiss){dismissed.add(settings.source+':'+button.dataset.dismiss);render();toast('Notification dismissed.');$('#notice-filter').focus()}
  if(button.dataset.request)testRequest(button.dataset.request);
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='activity-filter'){filter=el.value;render()}
  if(el.id==='notice-filter'){noticeFilter=el.value;render()}
  if(el.dataset.check){checks[el.dataset.check]=el.checked;if(!write('checks',checks))toast('Progress is available for this session.');render()}
});
document.addEventListener('input',event=>{
  const map={testBase:'base',testPath:'path',testBody:'body'};
  if(Object.hasOwn(map,event.target.name))testDraft[map[event.target.name]]=event.target.value;
});
document.addEventListener('submit',event=>{
  event.preventDefault();
  if(event.target.id==='test-form'){testRequest('health');return}
  if(event.target.id!=='settings-form')return;
  const entries=new FormData(event.target), next={};
  for(const key of Object.keys(defaults))next[key]=typeof defaults[key]==='number'?Number(entries.get(key)):String(entries.get(key)).trim();
  try{
    if(!next.name)throw Error('Enter a display name.');
    if(next.base||next.source==='live')next.base=validUrl(next.base||location.origin);
    if(new Set([next.paperAngle,next.plasticAngle,next.neutralAngle]).size!==3)throw Error('Choose three distinct servo angles.');
  }catch(error){$('#settings-error').textContent=error.message;return}
  if(next.base!==settings.base||next.source!==settings.source){live=null;liveStatus='Waiting for backend';liveError='';testDraft.base=null}
  settings=next;
  const saved=write('settings',settings);
  schedule();
  render();
  toast(saved?'Device settings saved.':'Settings applied for this session.');
});
window.addEventListener('hashchange',navigate);
navigate();
schedule();
