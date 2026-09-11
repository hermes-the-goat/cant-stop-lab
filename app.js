'use strict';
function evaluate(rolls, selected, remaining, gain) {
  let successes = 0, steps = 0;
  for (const pairs of rolls) {
    let best = 0;
    for (const pair of pairs) {
      const used = {}; let score = 0;
      for (const n of pair) {
        used[n] = (used[n] || 0) + 1;
        if (selected.includes(n) && used[n] <= remaining[n]) score++;
      }
      best = Math.max(best, score);
    }
    if (best) successes++;
    steps += best;
  }
  const p = successes / rolls.length, q = 1 - p, increment = steps / rolls.length;
  return {p, q, increment, rollEV: p * gain + increment, delta: increment - q * gain, threshold: q ? increment / q : Infinity};
}
function pairDice([a,b,c,d]) { return [[a+b,c+d],[a+c,b+d],[a+d,b+c]]; }
function predict(tree, values, features) {
  if (Number(values.own_claimed || 0) + Number(values.summits_pending || 0) >= 5) return {action:'STOP',path:[],forced:true};
  let node = tree; const path = [];
  while (node && node.action === undefined) {
    path.push(node.id);
    const feature = typeof node.feature === 'number' ? features[node.feature] : node.feature;
    node = values[feature] <= node.threshold ? node.left : node.right;
  }
  if (node) path.push(node.id);
  return {action: node?.action, path};
}
function actionName(action) { return ['stop','bank','0'].includes(String(action).toLowerCase())?'Bankuj':'Rzuć'; }
const DISCRETE_FEATURES = ['own_claimed','opponent_claimed','summits_pending','free_markers'];
function splitLabels(feature, threshold) {
  if (DISCRETE_FEATURES.includes(feature)) return {left:`≤ ${Math.floor(threshold)}`,right:`≥ ${Math.floor(threshold)+1}`};
  const text=Number(threshold).toLocaleString('pl-PL',{minimumFractionDigits:3,maximumFractionDigits:3});
  return {left:`≤ ${text}`,right:`> ${text}`};
}
function normalizeFeature(feature, value, max) {
  const n=Math.max(0,Math.min(max,Number(value)||0));
  return DISCRETE_FEATURES.includes(feature)?Math.floor(n):n;
}
if (typeof module !== 'undefined') module.exports = {evaluate, pairDice, predict, actionName, splitLabels, normalizeFeature};

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const lengths = [3,5,7,9,11,13,11,9,7,5,3];
  const state = {selected:[6,7,8], remaining:Object.fromEntries(lengths.map((l,i)=>[i+2,l])), gain:4};
  const defaults = ['turn_gain','bust_risk','summits_pending','own_claimed','opponent_claimed','opponent_threat','free_markers'];
  const names = {turn_gain:'Dorobek względny (Σ kroki / wysokość)',bust_risk:'Ryzyko wpadki',summits_pending:'Szczyty do bankowania',own_claimed:'Twoje zdobyte kolumny',opponent_claimed:'Kolumny przeciwnika',opponent_threat:'Największy względny postęp rywala',free_markers:'Wolne znaczniki'};
  let data, model, lastEvaluation;
  const fmt = (n,d=2) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d}) : '∞';
  const pct = n => fmt(n*100,1)+'%';
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (value,min,max) => Math.min(max,Math.max(min,Math.floor(Number(value)||0)));
  function tab(id) {
    if (!['board','probabilities','triples','strategy','method'].includes(id)) id='board';
    document.querySelectorAll('.panel').forEach(p=>{p.hidden=p.id!==id;});
    document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===id); if(b.dataset.tab===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    history.replaceState(null,'','#'+id);
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  document.querySelector('[data-footer-method]').addEventListener('click',event=>{event.preventDefault();tab('method');window.scrollTo({top:0});});
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();tab('board');});
  tab(location.hash.slice(1));
  function drawBoard() {
    $('mountain').innerHTML=lengths.map((length,i)=>{
      const n=i+2, active=state.selected.includes(n), passed=length-state.remaining[n];
      return `<button class="column ${active?'active':''}" data-col="${n}" aria-pressed="${active}" aria-label="Kolumna ${n}, ${length} pól${active?', wybrana':''}"><span class="summit" aria-hidden="true">△</span><span class="steps" aria-hidden="true">${Array.from({length},(_,j)=>`<i class="step ${j<passed?'passed':''}"></i>`).join('')}</span><span class="col-number">${n}</span><span class="col-length">${length} pól</span></button>`;
    }).join('');
    $('mountain').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      const n=Number(b.dataset.col);
      if(state.selected.includes(n))state.selected=state.selected.filter(x=>x!==n);
      else if(state.selected.length<3)state.selected.push(n);
      else { $('selection-hint').textContent='Masz już trzy znaczniki. Najpierw kliknij wybraną kolumnę, aby ją zwolnić.'; return; }
      state.selected.sort((a,b)=>a-b);drawBoard();drawRemaining();update();
      $('mountain').querySelector(`[data-col="${n}"]`).focus();
    }));
    $('selection-count').textContent=state.selected.length+' / 3 znaczniki';
    $('selection-hint').textContent=state.selected.length===3?'Kliknij wybrany szlak, aby go zwolnić, potem wybierz nowy.':`Wybierz jeszcze ${3-state.selected.length} ${state.selected.length===2?'kolumnę':'kolumny'}. Analiza wymaga trzech zajętych znaczników.`;
  }
  function drawRemaining() {
    $('remaining-inputs').innerHTML=state.selected.map(n=>`<label><span class="badge">${n}</span><input type="number" min="0" max="${lengths[n-2]}" value="${state.remaining[n]}" data-remaining="${n}" aria-label="Pozostałe pola w kolumnie ${n}"><span>/ ${lengths[n-2]}</span></label>`).join('');
    $('remaining-inputs').querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{
      const n=Number(input.dataset.remaining);state.remaining[n]=clamp(input.value,0,lengths[n-2]);
      if(input.value!=='' && Number(input.value)!==state.remaining[n])input.value=state.remaining[n];
      drawBoard();update();
    }));
  }
  function updateRisk() {
    if(!lastEvaluation){$('risk-table').innerHTML='<tr><td colspan="3">Wybierz dokładnie trzy kolumny.</td></tr>';return;}
    const n=clamp($('risk-n').value,1,30);
    $('risk-table').innerHTML=Array.from({length:n},(_,i)=>{const k=i+1,p=lastEvaluation.p**k;return `<tr><td>${k}</td><td><span class="risk-meter" style="width:${p*70}px"></span>${pct(p)}</td><td>${pct(1-p)}</td></tr>`;}).join('');
  }
  function update() {
    if(!data)return;
    if(state.selected.length!==3){lastEvaluation=null;$('decision').innerHTML='<div class="recommendation"><span class="verb">Wybierz 3 szlaki</span><p>Ten model zakłada, że wszystkie trzy znaczniki są zajęte.</p></div>';updateRisk();return;}
    lastEvaluation=evaluate(data.rolls,state.selected,state.remaining,state.gain);
    const r=lastEvaluation, delta=r.delta;
    const verdict=Math.abs(delta)<1e-10?'Obojętność':delta>0?'Rzuć jeszcze raz':'Bankuj dorobek';
    const reason=delta>0?`Jeden rzut dodaje średnio ${fmt(delta)} kroku względem bankowania.`:delta<0?`Jeden rzut kosztuje średnio ${fmt(-delta)} kroku względem bankowania.`:'Obie opcje mają taką samą oczekiwaną wartość krokową.';
    $('decision').innerHTML=`<div class="recommendation"><span class="verdict-label">WERDYKT MODELU KROKOWEGO</span><strong class="verb">${verdict}</strong><p>${reason}</p></div><dl class="decision-stats"><div><dt>Ryzyko wpadki / rzut</dt><dd>${pct(r.q)}</dd></div><div><dt>Szansa legalnego kroku</dt><dd>${pct(r.p)}</dd></div><div><dt>Bankuj teraz</dt><dd>${fmt(state.gain)} kr.</dd></div><div><dt>Rzuć raz → bankuj (EV)</dt><dd>${fmt(r.rollEV)} kr.</dd></div><div><dt>E nowych kroków / rzut</dt><dd>${fmt(r.increment)} kr.</dd></div><div><dt>Próg dorobku g/q</dt><dd>${fmt(r.threshold)} kr.</dd></div></dl>`;
    updateRisk();
  }
  function setGain(n){state.gain=clamp(n,0,100);$('turn-gain').value=state.gain;update();}
  $('turn-gain').addEventListener('input',()=>setGain($('turn-gain').value));
  $('gain-minus').addEventListener('click',()=>setGain(state.gain-1));
  $('gain-plus').addEventListener('click',()=>setGain(state.gain+1));
  $('risk-n').addEventListener('input',updateRisk);
  $('reset').addEventListener('click',()=>{state.selected=[6,7,8];lengths.forEach((l,i)=>state.remaining[i+2]=l);setGain(4);drawBoard();drawRemaining();update();});
  function useTriple(cols){state.selected=[...cols];cols.forEach(n=>state.remaining[n]=lengths[n-2]);drawBoard();drawRemaining();update();tab('board');window.scrollTo({top:0});}
  function drawSums() {
    const mode=$('partner-mode').value;
    $('sum-list').innerHTML=[...data.sums].sort((a,b)=>a.n-b.n).map(s=>{
      const partners=[...s.partners].sort((a,b)=>b[mode]-a[mode] || a.n-b.n).slice(0,3);
      return `<article class="sum-row"><strong class="sum-number">${s.n}</strong><div><div class="prob-label"><strong>${pct(s.p)}</strong><span>${s.count} / 1296 rzutów</span></div><div class="bar-track" role="meter" aria-label="Szansa sumy ${s.n}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.p*100}"><div class="bar-fill" style="width:${s.p*100}%"></div></div></div><div class="partner-list">${partners.map(p=>`<div class="partner"><strong>+ ${p.n}</strong><small>${p.ways} parowań · ${p.rollCount} rzutów</small><small>${pct(p.p)} rzutów</small></div>`).join('')}</div></article>`;
    }).join('');
  }
  $('partner-mode').addEventListener('change',()=>{if(data)drawSums();});
  function ranked(){return [...data.triples].sort((a,b)=>b.p-a.p || a.cols[0]-b.cols[0] || a.cols[1]-b.cols[1] || a.cols[2]-b.cols[2]);}
  function drawTriples() {
    const triples=ranked(), filter=Number($('triple-filter').value);
    $('top-five').innerHTML=triples.slice(0,5).map((t,i)=>`<article class="rank-card"><p class="eyebrow">${String(i+1).padStart(2,'0')} / TRASA</p><div class="rank-cols">${t.cols.join(' · ')}</div><strong class="rank-prob">${pct(t.p)}</strong><div class="small-note">przeżycia / rzut</div><button data-triple="${t.cols.join(',')}">Sprawdź na planszy ↗</button></article>`).join('');
    $('triple-table').innerHTML=triples.map((t,i)=>({t,i})).filter(({t})=>!filter||t.cols.includes(filter)).map(({t,i})=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td><strong>${t.cols.join(' · ')}</strong></td><td>${pct(t.p)}</td><td>${fmt(t.medianBust,0)}</td><td>${fmt(t.meanBust)}</td><td>${fmt(t.gain)}</td><td><button aria-label="Wybierz kolumny ${t.cols.join(', ')}" data-triple="${t.cols.join(',')}">Wybierz ↗</button></td></tr>`).join('');
    document.querySelectorAll('[data-triple]').forEach(b=>b.addEventListener('click',()=>useTriple(b.dataset.triple.split(',').map(Number))));
  }
  lengths.forEach((_,i)=>$('triple-filter').add(new Option('Kolumna '+(i+2),String(i+2))));
  $('triple-filter').addEventListener('change',()=>{if(data)drawTriples();});
  $('dice-inputs').innerHTML=[4,5,3,4].map((n,i)=>`<label>KOŚĆ ${i+1}<input type="number" min="1" max="6" value="${n}" aria-label="Kość ${i+1}"></label>`).join('');
  function drawDice() {
    const dice=[...$('dice-inputs').querySelectorAll('input')].map(input=>clamp(input.value,1,6));
    $('dice-result').innerHTML=pairDice(dice).map((pair,i)=>`<div class="pairing-row"><span>${['AB / CD','AC / BD','AD / BC'][i]}</span><span>${pair[0]} + ${pair[1]}</span></div>`).join('');
  }
  $('dice-inputs').querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{if(input.value!=='')input.value=clamp(input.value,1,6);drawDice();}));
  const featureName = feature => typeof feature==='number' ? (model.meta.features||defaults)[feature] : feature;
  function treeHTML(node,depth=0) {
    if(!node)return '';
    if(node.action!==undefined)return `<div class="leaf ${actionName(node.action)==='Bankuj'?'stop':''}" data-node="${esc(node.id)}"><strong>${actionName(node.action)}</strong><small>Węzeł ${esc(node.id)} · ${esc(node.samples??'—')} próbek</small></div>`;
    const f=featureName(node.feature), labels=splitLabels(f,node.threshold);
    return `<details data-node="${esc(node.id)}" ${depth<2?'open':''}><summary><strong>${esc(names[f]||f)} ${esc(labels.left)}</strong><small>${esc(f)} · węzeł ${esc(node.id)} · ${esc(node.samples??'—')} próbek</small></summary><div class="branches"><div class="branch-label">TAK · ${esc(labels.left)}</div>${treeHTML(node.left,depth+1)}<div class="branch-label">NIE · ${esc(labels.right)}</div>${treeHTML(node.right,depth+1)}</div></details>`;
  }
  function updateModel() {
    if(!model)return;
    const values=Object.fromEntries([...$('model-inputs').querySelectorAll('input')].map(input=>[input.dataset.feature,Number(input.value)]));
    const result=predict(model.tree,values,model.meta.features||defaults);
    $('model-result').innerHTML=`Sugestia drzewa: <strong>${actionName(result.action)}</strong><small>${result.forced?'Bankowanie daje zwycięstwo — reguła nadrzędna wobec drzewa.':'Ścieżka: '+result.path.map(esc).join(' → ')}<br>Imitacja heurystyki, nie gwarancja najlepszego ruchu. Zmiana stanu planszy nie aktualizuje automatycznie tych wejść.</small>`;
    $('tree').querySelectorAll('[data-node]').forEach(node=>{const active=result.path.some(id=>String(id)===node.dataset.node);node.classList.toggle('on-path',active);if(active&&node.tagName==='DETAILS')node.open=true;});
  }
  function syncModel(){
    if(!lastEvaluation||!model)return;
    const vals={bust_risk:lastEvaluation.q,summits_pending:state.selected.filter(n=>state.remaining[n]===0).length,free_markers:0};
    $('model-inputs').querySelectorAll('input').forEach(input=>{if(vals[input.dataset.feature]!==undefined)input.value=vals[input.dataset.feature];});updateModel();
  }
  function drawModel() {
    const meta=model.meta||{};model.meta=meta;
    const scope=document.createElement('p');scope.className='notice';scope.textContent=`Wariant treningowy: zwycięstwo po zdobyciu ${meta.targetClaims||3} kolumn (standardowo: 3). Dorobek modelu jest względny, a EV na planszy liczy surowe kroki. To dwa różne modele wartości. Dorobek względny = suma (niezapisane kroki tej tury na trasie / pełna długość tej trasy). Przykład: 3 kroki na trasie 6 i 2 na trasie 7 dają 3/11 + 2/13 ≈ 0,427. Nie obejmuje zapisanych kroków z poprzednich tur; nie jest liczbą szczytów ani szansą wygranej. Progi liczników pokazujemy jako ≤ k / ≥ k+1 — to równoważny zapis oryginalnego podziału modelu dla liczb całkowitych.`;
    $('model-metrics').before(scope);
    $('model-metrics').innerHTML=[['Rzuty treningowe',meta.rolls],['Symulowane partie',meta.games],['Węzły drzewa',meta.nodes],['Zgodność z heurystyką',meta.accuracy===undefined?'—':pct(meta.accuracy)]].map(([name,value])=>`<div><strong>${typeof value==='number'?fmt(value,0):esc(value??'—')}</strong><span>${name}</span></div>`).join('');
    $('model-inputs').innerHTML=(meta.features||defaults).map(f=>{
      const probability=['bust_risk','opponent_threat'].includes(f), continuous=probability||f==='turn_gain', max=probability?1:['own_claimed','opponent_claimed'].includes(f)?(meta.targetClaims||3):3;
      return `<label><span>${esc(names[f]||f)}<small>${esc(f)}</small></span><input type="number" data-feature="${esc(f)}" min="0" max="${max}" step="${continuous?'.01':'1'}" value="${f==='turn_gain'?'.4':'0'}" aria-label="${esc(names[f]||f)}"></label>`;
    }).join('');
    $('model-inputs').querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{if(input.value!=='')input.value=normalizeFeature(input.dataset.feature,input.value,Number(input.max));updateModel();}));
    $('tree').innerHTML=treeHTML(model.tree);syncModel();updateModel();
  }
  $('sync-model').addEventListener('click',syncModel);
  $('expand-tree').addEventListener('click',()=>{const nodes=[...$('tree').querySelectorAll('details')],open=nodes.some(n=>!n.open);nodes.forEach(n=>n.open=open);$('expand-tree').textContent=open?'Zwiń całe drzewo':'Rozwiń całe drzewo';});
  drawBoard();drawRemaining();drawDice();
  async function load(){
    try {
      const response=await fetch('data.json');if(!response.ok)throw new Error(`data.json: HTTP ${response.status}`);
      data=await response.json();
      if(!Array.isArray(data.rolls)||data.rolls.length!==1296||data.sums.length!==11||data.triples.length!==165)throw new Error('Niekompletny zbiór wyników.');
      $('load-status').textContent='';update();drawSums();drawTriples();
    }catch(error){$('load-status').textContent='Nie udało się wczytać danych. Odśwież stronę lub sprawdź plik data.json. '+error.message;return;}
    try {
      const response=await fetch('strategy.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);model=await response.json();drawModel();
    }catch(error){$('model-metrics').textContent='Model jest niedostępny: '+error.message;}
  }
  load();
}
