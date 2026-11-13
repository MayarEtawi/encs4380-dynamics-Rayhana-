'use strict';
// RK4 integration of the continuous-time plant and controller integral state.
// First order: dy/dt = (K*u-y)/tau.
// Second order: dx/dt=v, dv/dt=(u-b*v-k*x)/m.
// Controller: u=clamp(Kp*(r-y)+Ki*I-Kd*dy/dt, ±Umax).
// Derivative-on-measurement avoids a setpoint derivative kick.
const $ = id => document.getElementById(id);
const inputs = ['plant','setpoint','kp','ki','kd','umax','duration','gain','tau','mass','damping','stiffness'];
const numeric = id => Number($(id).value);
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const fmt = (v,unit='') => Number.isFinite(v) ? `${v.toFixed(3)}${unit}` : '—';
function settings(){
 const p={type:$('plant').value,r:numeric('setpoint'),kp:numeric('kp'),ki:numeric('ki'),kd:numeric('kd'),umax:numeric('umax'),duration:numeric('duration'),K:numeric('gain'),tau:numeric('tau'),m:numeric('mass'),b:numeric('damping'),k:numeric('stiffness')};
 if(Object.values(p).some(v=>typeof v==='number'&&!Number.isFinite(v))||p.r<=0||p.umax<=0||p.duration<=0||p.K<=0||p.tau<=0||p.m<=0||p.b<0||p.k<=0||p.kp<0||p.ki<0||p.kd<0)throw Error('Enter valid positive plant parameters and nonnegative gains.');
 return p;
}
function derivative(s,p){
 const y=s[0],v=p.type==='first'?0:s[1],I=s[2],e=p.r-y;
 // For first order, dy/dt depends on u. Solve algebraically when Kd is nonzero.
 // Saturation can change this relation, so compute the saturated fixed point.
 let u=clamp(p.kp*e+p.ki*I,-p.umax,p.umax);
 if(p.type==='first'){
   const unsat=(p.kp*e+p.ki*I+p.kd*y/p.tau)/(1+p.kd*p.K/p.tau);
   u=clamp(unsat,-p.umax,p.umax);
 }else u=clamp(p.kp*e+p.ki*I-p.kd*v,-p.umax,p.umax);
 const ydot=p.type==='first'?(p.K*u-y)/p.tau:v;
 const raw=p.kp*e+p.ki*I-p.kd*ydot;
 // Conditional integration anti-windup, based on actual saturated command.
 const blocked=(raw>=p.umax-1e-9&&e>0)||(raw<=-p.umax+1e-9&&e<0);
 return {ds:[ydot,p.type==='first'?0:(u-p.b*v-p.k*y)/p.m,blocked?0:e],u,raw};
}
function rk4(s,h,p){
 const a=derivative(s,p).ds;
 const add=(base,k,f)=>base.map((x,i)=>x+f*h*k[i]);
 const b=derivative(add(s,a,.5),p).ds;
 const c=derivative(add(s,b,.5),p).ds;
 const d=derivative(add(s,c,1),p).ds;
 return s.map((x,i)=>x+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}
function simulate(p){
 // Small fixed integration step for reliable comparisons at high gains.
 const h=Math.min(.002,p.duration/5000,p.type==='first'?p.tau/100:.002);
 const n=Math.ceil(p.duration/h),dt=p.duration/n;
 let s=[0,0,0],t=[],y=[],u=[];
 for(let i=0;i<=n;i++){
   if(i%Math.max(1,Math.floor(n/2500))===0||i===n){t.push(i*dt);y.push(s[0]);u.push(derivative(s,p).u);}
   if(i<n){s=rk4(s,dt,p);if(s.some(x=>!Number.isFinite(x)||Math.abs(x)>1e9))throw Error('Simulation diverged. Reduce gains or use another plant.');}
 }
 return {t,y,u};
}
function crossing(t,y,level){for(let i=1;i<y.length;i++)if(y[i-1]<level&&y[i]>=level){const f=(level-y[i-1])/(y[i]-y[i-1]);return t[i-1]+f*(t[i]-t[i-1]);}return NaN;}
function metrics(res,r){
 const {t,y}=res;
 // Rise time is measured from 10% to 90% of the attained final response,
 // rather than the setpoint (important for P-only systems with offset).
 const finalValue=y[y.length-1];
 const t10=finalValue>0?crossing(t,y,.1*finalValue):NaN;
 const t90=finalValue>0?crossing(t,y,.9*finalValue):NaN;
 const rise=Number.isFinite(t10)&&Number.isFinite(t90)?t90-t10:NaN;
 const overshoot=Math.max(0,(Math.max(...y)-r)/r*100);
 const tol=.02*r;let lastOutside=-1;
 for(let i=0;i<y.length;i++)if(Math.abs(y[i]-r)>tol)lastOutside=i;
 const settle=lastOutside<0?0:lastOutside>=y.length-1?NaN:t[lastOutside+1];
 return {rise,overshoot,settle,error:r-y[y.length-1]};
}
const graphLayout=(title,ytitle)=>({title:{text:title,font:{size:15}},paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',font:{family:'Arial'},margin:{l:58,r:18,t:48,b:45},xaxis:{title:'Time (s)',gridcolor:'#e4eee6'},yaxis:{title:ytitle,gridcolor:'#e4eee6'},legend:{orientation:'h',y:-.3},uirevision:'pid'});
function draw(p,res){
 const m=metrics(res,p.r);$('rise').textContent=fmt(m.rise,' s');$('overshoot').textContent=fmt(m.overshoot,'%');$('settle').textContent=fmt(m.settle,' s');$('error').textContent=fmt(m.error);
 const config={responsive:true,displaylogo:false};
 Plotly.react('responsePlot',[{x:res.t,y:res.y,name:'Output y(t)',mode:'lines',line:{color:'#233247',width:3}},{x:[0,p.duration],y:[p.r,p.r],name:'Setpoint',mode:'lines',line:{color:'#e4a12b',dash:'dash',width:2}}],graphLayout('Closed-loop step response','Output'),config);
 Plotly.react('controlPlot',[{x:res.t,y:res.u,name:'Actuator u(t)',mode:'lines',line:{color:'#233247',width:2}},{x:[0,p.duration],y:[p.umax,p.umax],name:'+Umax',mode:'lines',line:{color:'#bb3434',dash:'dash'}},{x:[0,p.duration],y:[-p.umax,-p.umax],name:'−Umax',mode:'lines',line:{color:'#bb3434',dash:'dash'}}],graphLayout('Control effort with limits','u(t)'),config);
 $('diagramPlant').textContent=p.type==='first'?'1st-order':'2nd-order';
}
function refresh(){try{const p=settings();$('firstFields').hidden=p.type!=='first';$('secondFields').hidden=p.type!=='second';for(const id of ['setpoint','kp','ki','kd','umax','duration'])$(id+'Val').textContent=$(id).value;draw(p,simulate(p));if(typeof refreshStateSpace==='function')refreshStateSpace();$('notice').textContent='Simulation updated.';}catch(e){$('notice').textContent=e.message;}}
function runChecks(){
 const base={type:'first',r:1,kp:9,ki:0,kd:0,umax:100,duration:12,K:1,tau:1,m:1,b:2,k:1};
 const pOnly=metrics(simulate(base),1);
 // Reference test 1: exact closed-loop tau=0.1, e_ss=0.1.
 const pTau=.1;const pResponse=simulate(base);const pT90=crossing(pResponse.t,pResponse.y,.9*.9);
 const test1=Math.abs(pOnly.error-.1)<.002&&Math.abs(pT90-(-Math.log(.1)*pTau))<.015;
 // Reference test 2: characteristic polynomial s² + 2s + 1 => wn=1, zeta=1.
 const pi={...base,kp:1,ki:1,duration:40};const wn=Math.sqrt(pi.K*pi.ki/pi.tau);const zeta=(1+pi.K*pi.kp)/(2*pi.tau*wn);const piResult=metrics(simulate(pi),1);
 const test2=Math.abs(wn-1)<1e-9&&Math.abs(zeta-1)<1e-9&&Math.abs(piResult.error)<.005;
 // Reference test 3: several stable, unsaturated PI settings converge to step setpoint.
 const gains=[[1,1],[2,1],[3,2]];const errs=gains.map(([kp,ki])=>metrics(simulate({...pi,kp,ki,duration:40}),1).error);const test3=errs.every(e=>Math.abs(e)<.005);
 const checks=[['P only: τclosed ≈ 0.1 s and error ≈ 10%',test1],['PI: ωn = 1 rad/s, ζ = 1, step error ≈ 0',test2],['Stable, unsaturated PI: zero step steady-state error',test3]];
 $('validationResult').innerHTML=checks.map(([name,ok])=>`<p class="${ok?'pass':'fail'}">${ok?'✓ PASS':'✗ FAIL'} — ${name}</p>`).join('')+'<p class="muted">The third check applies to stable, unsaturated PI configurations; integral action alone does not guarantee stability or eliminate error under saturation.</p>';
}
let refreshTimer=null;
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refreshTimer=null;refresh();},90);}
for(const id of inputs)$(id).addEventListener('input',scheduleRefresh);
$('reset').addEventListener('click',()=>{Object.entries({plant:'first',setpoint:1,kp:9,ki:0,kd:0,umax:100,duration:12,gain:1,tau:1,mass:1,damping:2,stiffness:1}).forEach(([id,v])=>$(id).value=v);refresh();});
$('piPreset').addEventListener('click',()=>{Object.entries({plant:'first',setpoint:1,kp:1,ki:1,kd:0,umax:100,duration:12,gain:1,tau:1}).forEach(([id,v])=>$(id).value=v);refresh();});
$('runValidation').addEventListener('click',runChecks);
// Interactive prediction quiz: the answer is computed from two independent RK4 runs.
const predictionNames={kp:'Kp',ki:'Ki',kd:'Kd'};
const predictionMetricNames={overshoot:'Overshoot',rise:'Rise time',error:'Absolute final tracking error',settle:'Settling time (2%)'};
function predictionChange(){
 const p=settings(),gain=$('predictionExperiment').value,metric=$('predictionMetric').value;
 const increments={kp:2,ki:1,kd:2},maxima={kp:30,ki:15,kd:10};
 const next={...p,[gain]:Math.min(maxima[gain],p[gain]+increments[gain])};
 // When a slider is at its maximum, compare against a lower gain instead.
 if(next[gain]===p[gain]){
   const lower=Math.max(0,p[gain]-increments[gain]);
   if(lower===p[gain])throw Error('Choose a different gain.');
   next[gain]=lower;
 }
 // Both runs use the same horizon. An unsettled response is a valid
 // censored settling-time observation, not a JavaScript calculation failure.
 // A fixed minimum comparison window makes the quiz more useful than a 4 s run.
 const comparison={...p,duration:Math.max(p.duration,40)};
 const a=metrics(simulate(comparison),p.r);
 const b=metrics(simulate({...comparison,[gain]:next[gain]}),p.r);
 let before=metric==='error'?Math.abs(a.error):a[metric];
 let after=metric==='error'?Math.abs(b.error):b[metric];
 if(metric==='settle'){
   const beforeSettled=Number.isFinite(before),afterSettled=Number.isFinite(after);
   // Both did not settle: only the measured outcome (neither settled) is equal.
   // This is not a claim that their true settling times are identical.
   const answer=!beforeSettled&&!afterSettled?'same':!beforeSettled?'decrease':!afterSettled?'increase':
     Math.abs(after-before)<=.025?'same':after>before?'increase':'decrease';
   return {before,after,answer,gain,metric,oldGain:p[gain],newGain:next[gain],duration:comparison.duration,
     note:!beforeSettled&&!afterSettled?'Neither response settled within the comparison window; “same” means the observed settling status is unchanged, not that the true settling times are equal.':
       !beforeSettled||!afterSettled?'One response did not settle within the comparison window. The direction compares the observed settling status, not an exact unmeasured time.':''};
 }
 if(!Number.isFinite(before)||!Number.isFinite(after)){
   return {unmeasurable:true,gain,metric,oldGain:p[gain],newGain:next[gain],duration:comparison.duration};
 }
 const tolerance=metric==='overshoot'?.1:metric==='error'?Math.max(.0005,p.r*.0005):.025;
 const answer=Math.abs(after-before)<=tolerance?'same':after>before?'increase':'decrease';
 return {before,after,answer,gain,metric,oldGain:p[gain],newGain:next[gain],duration:comparison.duration};
}
const predictionAnswerLabels={increase:'Increase',decrease:'Decrease',same:'Stay approximately the same'};
function checkPrediction(){
 const selected=document.querySelector('input[name="predictionChoice"]:checked');
 const result=$('predictionResult');result.hidden=false;
 if(!selected){result.className='prediction-result prediction-neutral';result.textContent='Please choose a prediction first.';return;}
 const button=$('reveal');button.disabled=true;
 try{
  const outcome=predictionChange();
  result.replaceChildren();
  if(outcome.unmeasurable){
    // Explicit scientific outcome; not a generic "increase duration" message.
    result.className='prediction-result prediction-neutral';
    const title=document.createElement('strong');title.textContent='✗ Prediction cannot be verified from this experiment';
    const body=document.createElement('p');body.textContent=`The ${predictionMetricNames[outcome.metric]} could not be measured for both responses by both responses even after extending the comparison to ${outcome.duration.toFixed(1)} s. No Increase/Decrease/Same answer can be established reliably. Try a stable plant and smaller gains.`;
    result.append(title,body);$('predictionRetry').hidden=false;return;
  }
  const correct=selected.value===outcome.answer;
  result.className='prediction-result '+(correct?'prediction-correct':'prediction-incorrect');
  const heading=document.createElement('strong');heading.textContent=correct?'✓ Correct prediction!':'✗ Incorrect prediction!';result.append(heading);
  const unit=outcome.metric==='overshoot'?'%':outcome.metric==='error'?'':' s';
  const display=v=>!Number.isFinite(v)?'Not settled within '+outcome.duration.toFixed(0)+' s':v.toFixed(4)+unit;
  const explanation=document.createElement('p');
  explanation.textContent=`Correct answer: ${predictionAnswerLabels[outcome.answer]}. ${predictionNames[outcome.gain]}: ${outcome.oldGain.toFixed(2)} → ${outcome.newGain.toFixed(2)}. ${predictionMetricNames[outcome.metric]}: ${display(outcome.before)} → ${display(outcome.after)}. Compared over ${outcome.duration.toFixed(1)} s with the same plant and other settings.`;
  result.append(explanation);
  if(outcome.note){const note=document.createElement('p');note.textContent=outcome.note;result.append(note);}
  const compare=document.createElement('div');compare.className='prediction-compare';
  for(const [label,value] of [['Before',outcome.before],['After',outcome.after]]){
    const cell=document.createElement('div');cell.className='prediction-compare-cell';
    const title=document.createElement('span');title.textContent=label;
    const number=document.createElement('strong');number.textContent=!Number.isFinite(value)?'Not settled within '+outcome.duration.toFixed(0)+' s':value.toFixed(3)+unit;
    cell.append(title,number);compare.append(cell);
  }
  result.append(compare);$('predictionRetry').hidden=false;
 }catch(e){result.className='prediction-result prediction-incorrect';result.textContent='✗ Experiment could not be evaluated safely: '+e.message;$('predictionRetry').hidden=false;}
 finally{button.disabled=false;}
}
$('reveal').addEventListener('click',checkPrediction);
$('predictionRetry').addEventListener('click',()=>{document.querySelectorAll('input[name="predictionChoice"]').forEach(r=>r.checked=false);$('predictionResult').hidden=true;$('predictionRetry').hidden=true;});
for(const id of ['predictionExperiment','predictionMetric'])$(id).addEventListener('change',()=>{$('predictionResult').hidden=true;$('predictionRetry').hidden=true;document.querySelectorAll('input[name="predictionChoice"]').forEach(r=>r.checked=false);});
refresh();


// BONUS A: independent three-lag teaching plant, G(s)=1/(s+1)^3.
// RK4 uses the same numerical integration method as the main PID playground.
function znDerivative(x,kp){const u=kp*(1-x[2]);return [u-x[0],x[0]-x[1],x[1]-x[2]];}
function znSimulate(kp,duration){
 const h=.01,n=Math.round(duration/h),t=[],y=[];let x=[0,0,0];
 for(let i=0;i<=n;i++){
  if(i%5===0){t.push(i*h);y.push(x[2]);}
  if(i===n)break;
  const a=znDerivative(x,kp),b=znDerivative(x.map((v,j)=>v+h*a[j]/2),kp),c=znDerivative(x.map((v,j)=>v+h*b[j]/2),kp),d=znDerivative(x.map((v,j)=>v+h*c[j]),kp);
  x=x.map((v,j)=>v+h*(a[j]+2*b[j]+2*c[j]+d[j])/6);
  if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8))break;
 }
 return {t,y};
}
function znPeakPeriod(res){
 const peaks=[];
 for(let i=1;i<res.y.length-1;i++)if(res.y[i]>res.y[i-1]&&res.y[i]>=res.y[i+1]&&res.t[i]>8)peaks.push(res.t[i]);
 if(peaks.length<3)return NaN;
 const periods=peaks.slice(1).map((t,i)=>t-peaks[i]);
 return periods.slice(-Math.min(5,periods.length)).reduce((a,b)=>a+b,0)/Math.min(5,periods.length);
}
function refreshZN(){
 const kp=numeric('znGain'),duration=numeric('znDuration');$('znGainVal').textContent=kp.toFixed(1);$('znDurationVal').textContent=duration;
 const res=znSimulate(kp,duration),period=znPeakPeriod(res);
 $('znMeasured').textContent=Number.isFinite(period)?period.toFixed(3)+' s':'Not enough peaks';
 $('znStatus').textContent=Math.abs(kp-8)<.051?'At Kp = Ku = 8: sustained oscillations (marginal stability).':kp<8?'Below Ku: damped oscillations / stable response.':'Above Ku: growing oscillations / unstable response.';
 Plotly.react('znPlot',[{x:res.t,y:res.y,name:'Output y(t)',mode:'lines',line:{color:'#233247',width:2.5}},{x:[0,duration],y:[1,1],name:'Setpoint',mode:'lines',line:{color:'#B38E6D',dash:'dash'}}],graphLayout('P-only response — third-order teaching plant','Output'),{responsive:true,displaylogo:false});
}
$('znGain').addEventListener('input',refreshZN);$('znDuration').addEventListener('input',refreshZN);
for(const [id,kp] of [['znCritical',8],['znBelow',5],['znAbove',11]])$(id).addEventListener('click',()=>{$('znGain').value=kp;refreshZN();});

// BONUS B: pole placement on xdot=[0 1; -k/m -b/m]x+[0;1/m]u.
// With u=-[k1 k2]x+Nr: k1=m*wn²-k, k2=2*m*zeta*wn-b, N=m*wn².
function stateSimulate(m,b,k,wn,zeta,r,x0,duration,umax){
 const k1=m*wn*wn-k,k2=2*m*zeta*wn-b,N=m*wn*wn;
 const deriv=x=>{const u=clamp(-k1*x[0]-k2*x[1]+N*r,-umax,umax);return [x[1],(u-b*x[1]-k*x[0])/m];};
 const h=.002,n=Math.ceil(duration/h),dt=duration/n,t=[],y=[];let x=[x0,0];
 for(let i=0;i<=n;i++){
  if(i%Math.max(1,Math.floor(n/2000))===0||i===n){t.push(i*dt);y.push(x[0]);}
  if(i===n)break;
  const a=deriv(x),bb=deriv(x.map((v,j)=>v+dt*a[j]/2)),c=deriv(x.map((v,j)=>v+dt*bb[j]/2)),d=deriv(x.map((v,j)=>v+dt*c[j]));
  x=x.map((v,j)=>v+dt*(a[j]+2*bb[j]+2*c[j]+d[j])/6);
  if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))throw Error('State feedback diverged.');
 }
 return {t,y,k1,k2,N};
}
function pidSecondWithInitial(p,x0){
 const h=.002,n=Math.ceil(p.duration/h),dt=p.duration/n,t=[],y=[];let s=[x0,0,0];
 for(let i=0;i<=n;i++){
  if(i%Math.max(1,Math.floor(n/2000))===0||i===n){t.push(i*dt);y.push(s[0]);}
  if(i===n)break;s=rk4(s,dt,p);
  if(s.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))throw Error('PID comparison diverged.');
 }
 return {t,y};
}
function refreshStateSpace(){
 try{
  const m=numeric('ssMass'),b=numeric('ssDamping'),k=numeric('ssStiffness'),wn=numeric('ssWn'),zeta=numeric('ssZeta'),x0=numeric('ssInitial'),base=settings();
  if(![m,b,k,wn,zeta,x0].every(Number.isFinite)||m<=0||b<0||k<=0||wn<=0||zeta<=0)throw Error('Use m,k,ωn,ζ > 0 and b ≥ 0.');
  $('ssWnVal').textContent=wn;$('ssZetaVal').textContent=zeta;
  const re=-zeta*wn,disc=zeta*zeta-1;
  $('ssPoles').textContent=disc<0?`${re.toFixed(2)} ± j${(wn*Math.sqrt(-disc)).toFixed(2)}`:`${(re+wn*Math.sqrt(disc)).toFixed(2)}, ${(re-wn*Math.sqrt(disc)).toFixed(2)}`;
  const state=stateSimulate(m,b,k,wn,zeta,base.r,x0,base.duration,base.umax);
  $('ssGains').textContent=`[${state.k1.toFixed(3)}, ${state.k2.toFixed(3)}]`;$('ssPrefilter').textContent=state.N.toFixed(3);
  const pid=pidSecondWithInitial({...base,type:'second',m,b,k},x0);
  Plotly.react('ssPlot',[{x:state.t,y:state.y,name:'State feedback',mode:'lines',line:{color:'#233247',width:3}},{x:pid.t,y:pid.y,name:'PID (same plant)',mode:'lines',line:{color:'#B38E6D',width:2.5}},{x:[0,base.duration],y:[base.r,base.r],name:'Setpoint',mode:'lines',line:{color:'#c78b29',dash:'dash'}}],graphLayout('State feedback vs PID — same initial conditions','Position y'),{responsive:true,displaylogo:false});
  $('ssStatus').textContent=`Selected poles are stable. Initial state: [${x0}, 0]. Both controllers use Umax = ${base.umax} and r = ${base.r}.`;
 }catch(e){$('ssStatus').textContent=e.message;}
}
for(const id of ['ssMass','ssDamping','ssStiffness','ssWn','ssZeta','ssInitial'])$(id).addEventListener('input',refreshStateSpace);
refreshZN();refreshStateSpace();
