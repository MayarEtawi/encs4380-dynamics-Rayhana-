(function () {
'use strict';
const $ = id => document.getElementById(id);
const rand = (a,b) => a + Math.random()*(b-a);
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const fmt = x => Number(x.toPrecision(4)).toString();
let round = 0, total = 0, maximum = 0, best = null, challenge, revealed = false, predicted = false;

function response(c,t, params = c.params) {
  const [p,q] = params;
  if (c.kind === 'first') {
    if (c.input === 'step') return p * (-Math.expm1(-t/q));
    const w = c.omega;
    // Zero-initial-state sine input: steady-state sine plus transient correction.
    const a = w*q;
    return p/(1+a*a) * (Math.sin(w*t) - a*Math.cos(w*t) + a*Math.exp(-t/q));
  }
 // Second-order underdamped step response
const zeta = p;
const omegaN = q;

const r = Math.sqrt(1 - zeta * zeta);
const wd = omegaN * r;

return 1 - Math.exp(-zeta * omegaN * t) *
    (Math.cos(wd * t) + (zeta / r) * Math.sin(wd * t));
}
function createChallenge() {
  const first = Math.random() < 0.5;
  if(first){
    const sine = Math.random() < 0.28;
    const tau=rand(0.45,2.2), gain=rand(0.8,3.2);
    return {kind:'first',input:sine?'sine':'step',omega:sine?rand(1.0,2.5):null,params:[gain,tau],end:sine?Math.max(12,8*tau):7*tau};
  }
  const zeta=rand(0.2,0.78), omegaN=rand(1.1,3.2);
  return {kind:'second',input:'step',params:[zeta,omegaN],end:Math.max(8,9/(zeta*omegaN))};
}
function initSeries(c) {
  c.t=Array.from({length:241},(_,i)=>c.end*i/240);
  c.truth=c.t.map(t=>response(c,t));
  const amplitude=c.kind==='first'?c.params[0]:1;
  c.noisy=c.truth.map(y=>y + amplitude*rand(-0.016,0.016));
}
function line(x,y,name,color,options={}) {
  return {x,y,name,mode:options.mode||'lines',type:'scatter',line:{color,width:options.width||3,dash:options.dash||'solid'},marker:{color,size:4},hovertemplate:'t = %{x:.2f} s<br>output = %{y:.3f}<extra>'+name+'</extra>'};
}
let plotQueue = Promise.resolve();
let latestPlotRequest = 0;
function plot(guessed=null) {
  if (typeof Plotly === 'undefined') {
    $('guessError').textContent='Unable to load Plotly. Check your internet connection and reload.';
    return;
  }
  // Snapshot each round's data so later rounds cannot change an in-flight plot.
  const c = challenge;
  const measured=line(c.t,c.noisy,'Measured (noisy)','#788b83',{mode:'markers'});
  measured.marker={color:'#879c91',size:4,opacity:.6};
  const series=[measured];
  if(guessed) {
    series.push(line(c.t,c.truth,'True response','#087a3e'));
    series.push(line(c.t,c.t.map(t=>response(c,t,guessed)),'Your guess','#e68c32',{dash:'dash'}));
  }
  const layout={
    margin:{l:65,r:22,t:24,b:65},paper_bgcolor:'#fff',plot_bgcolor:'#fff',
    xaxis:{title:'Time (s)',range:[0,c.end],gridcolor:'#e8eee8',zeroline:false},
    yaxis:{title:'Sensor output',gridcolor:'#e8eee8',zeroline:false,automargin:true},
    legend:{orientation:'h',y:-.24},font:{family:'Arial, sans-serif',color:'#17442b'},
    hovermode:'closest'
  };
  const config={responsive:true,displaylogo:false};
  const request=++latestPlotRequest;
  // Plotly updates are asynchronous. Serializing them prevents an earlier round's
  // redraw from replacing the true/guess overlay of the most recent round.
  plotQueue=plotQueue.catch(()=>{}).then(async()=>{
    if(request!==latestPlotRequest) return;
    await Plotly.react('sensorPlot',series,layout,config);
  }).catch(err=>{
    console.error('Sensor plot failed:',err);
    if(request===latestPlotRequest) $('guessError').textContent='The chart could not update. Please try a new sensor.';
  });
}

function predictionFor(c) {
 if(c.kind==='second') return {question:'If the damping ratio ζ increases while ωₙ stays constant, what usually happens to overshoot?',choices:['Overshoot increases','Overshoot decreases','Overshoot stays the same'],answer:'b',explain:'Increasing damping reduces overshoot for an underdamped second-order sensor.'};
 return {question:'If τ increases while K stays constant, what happens to the response speed?',choices:['The response becomes faster','The response becomes slower','The response speed stays the same'],answer:'b',explain:'A larger time constant means a slower first-order response.'};
}
function setPrediction(c){
 const p=predictionFor(c); $('predictQuestion').textContent=p.question;
 ['a','b','c'].forEach((v,i)=>$('predictAnswer').querySelector('option[value="'+v+'"]').textContent=p.choices[i]);
 $('predictAnswer').value='';$('predictAnswer').disabled=false;$('checkPrediction').disabled=false;
 $('predictFeedback').textContent='';predicted=false;
}
function startRound(){
 round++;challenge=createChallenge();initSeries(challenge);revealed=false;
 $('roundNumber').textContent=round;$('sessionScore').textContent=fmt(total)+' / '+(maximum);$('bestScore').textContent=best===null?'—':fmt(best)+' / 100';
 $('sensorKind').textContent=challenge.kind==='first'?'First-order':'Second-order';
 $('modelLabel').textContent=challenge.kind==='first'?'τ dy/dt + y = Kx':'Second-order · unit final value';
 $('inputLabel').textContent=challenge.input==='step'?'Unit step (amplitude 1)':'Sine (amplitude 1, ω = '+fmt(challenge.omega)+' rad/s)';
 $('windowLabel').textContent='0 – '+fmt(challenge.end)+' s';
 const first=challenge.kind==='first';
 $('labelOne').textContent=first?'Gain K':'Damping ratio ζ';$('labelTwo').textContent=first?'Time constant τ (s)':'Natural frequency ωₙ (rad/s)';
 $('guessHelp').textContent=first?'Estimate the gain and time constant. Both must be positive.':'Estimate the damping ratio (0 < ζ < 1) and natural frequency (positive).';
 $('guessOne').value='';$('guessTwo').value='';$('guessError').textContent='';$('guessOne').max=first?'':'0.9999';
 $('submitGuess').disabled=false;$('hintText').hidden=true;$('hintText').textContent='';$('results').hidden=true;
 setPrediction(challenge);plot();
}
function parameterPoints(guess,trueValue) {
 const relative=Math.abs(guess-trueValue)/trueValue;
 // 50 points each: full credit within 10%, then linearly taper to 0 at 100% error.
 return relative<=0.1 ? 50 : 50*clamp((1-relative)/0.9,0,1);
}
function score(guess) {
 const [p,q]=challenge.params;
 const errors=guess.map((v,i)=>100*Math.abs(v-challenge.params[i])/challenge.params[i]);
 const points=guess.map((v,i)=>parameterPoints(v,challenge.params[i]));
 const value=Number((points[0]+points[1]).toFixed(1));
 total=Number((total+value).toFixed(1));maximum+=100;best=Math.max(best===null?0:best,value);
 $('sessionScore').textContent=fmt(total)+' / '+maximum;$('bestScore').textContent=fmt(best)+' / 100';
 $('roundScore').textContent=value.toFixed(1)+' / 100 points';
 $('parameterResults').replaceChildren();
 const labels=challenge.kind==='first'?['K','τ (s)']:['ζ','ωₙ (rad/s)'];
 [0,1].forEach(i=>{
  const container=document.createElement('div');
  const heading=document.createElement('strong');heading.textContent=labels[i];container.append(heading);
  [['Your guess',fmt(guess[i])],['True value',fmt(challenge.params[i])],['Relative error',errors[i].toFixed(1)+'%'],['Points',points[i].toFixed(1)+' / 50']].forEach(([label,val])=>{
    const el=document.createElement('p');el.textContent=label+': '+val;container.append(el);
  });$('parameterResults').append(container);
 });
 $('resultExplanation').textContent=errors.every(e=>e<=10)?'Excellent! Both parameters are within 10% of the hidden values.':'Full credit requires each parameter to be within 10% of its true value. Compare the dashed guess with the solid true curve.';
 $('results').hidden=false;
}
$('guessForm').addEventListener('submit',event=>{
 event.preventDefault();if(revealed)return;
 const raw=[$('guessOne').value.trim(),$('guessTwo').value.trim()];
 const guess=raw.map(Number);
 if(raw.some(v=>v==='')||guess.some(v=>!Number.isFinite(v)||v<=0)||(challenge.kind==='second'&&guess[0]>=1)){
 $('guessError').textContent=challenge.kind==='second'?'Enter ζ between 0 and 1 and a positive ωₙ.':'Enter two positive finite parameter estimates.';return;
 }
 $('guessError').textContent='';revealed=true;$('submitGuess').disabled=true;
 score(guess);plot(guess);
});
$('hintButton').addEventListener('click',()=>{
 const c=challenge;
 $('hintText').textContent=c.kind==='second'?'Overshoot depends on ζ. The first peak time depends on both ζ and ωₙ. Read the maximum above the final level.':c.input==='step'?'For a unit step, K is the final level. τ is the time when the curve reaches about 63.2% of that level.':'The output sine is delayed and smaller than K times the input. Estimate phase lag to find τ, then use the amplitude to find K.';
 $('hintText').hidden=false;
});
$('checkPrediction').addEventListener('click',()=>{
 if(predicted)return;
 const choice=$('predictAnswer').value;
 if(!choice){$('predictFeedback').textContent='Choose a prediction first.';return;}
 const p=predictionFor(challenge);
 $('predictFeedback').textContent=(choice===p.answer?'Correct! ':'Not quite. ')+p.explain;
 predicted=true;$('predictAnswer').disabled=true;$('checkPrediction').disabled=true;
});
$('newSensor').addEventListener('click',()=>startRound());
startRound();
})();
