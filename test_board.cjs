'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
// Minimal DOM adapter for exercising the real app's handlers without dependencies.
class Element {
  constructor(tag='div',attrs='') {
    this.tagName=tag.toUpperCase();this.dataset={};this.events={};this.children=[];this.value='';this.textContent='';
    this.classList={toggle(){}};
    for(const [,key,value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
      this[key]=value;
      if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
    }
  }
  set innerHTML(value) {
    this.markup=value;
    this.children=[...value.matchAll(/<(button|input)\b([^>]*)>/g)].map(([,tag,attrs])=>new Element(tag,attrs));
  }
  get innerHTML(){return this.markup||'';}
  querySelectorAll(selector){return this.children.filter(e=>selector===e.tagName.toLowerCase() || (selector.startsWith('[data-') && Object.keys(e.dataset).length));}
  querySelector(selector){const n=selector.match(/data-col="(\d+)"/);return n?this.children.find(e=>e.dataset.col===n[1]):this.querySelectorAll(selector)[0];}
  addEventListener(event,fn){this.events[event]=fn;}
  fire(event){this.events[event]?.({preventDefault(){}});}
  setAttribute(key,value){this[key]=value;}
  removeAttribute(key){delete this[key];}
  focus(){} before(){} add(){}
}
async function mount(rolls) {
  const nodes=Object.fromEntries([...html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)].map(([,tag,attrs,id])=>[id,new Element(tag,attrs)]));
  const document={getElementById:id=>nodes[id],querySelectorAll:()=>[],querySelector:()=>new Element(),createElement:tag=>new Element(tag)};
  const data=JSON.parse(fs.readFileSync(__dirname+'/data.json','utf8'));
  if(rolls)data.rolls=Array.from({length:1296},(_,i)=>rolls[i%rolls.length]);
  vm.runInNewContext(fs.readFileSync(__dirname+'/app.js','utf8'),{document,location:{hash:'#board'},history:{replaceState(){}},window:{scrollTo(){}},Option:class {},fetch:async url=>({ok:true,json:async()=>url==='data.json'?data:{meta:{features:[]},tree:{id:0,action:'STOP'}}})});
  await new Promise(resolve=>setImmediate(resolve));
  const select=n=>nodes.mountain.querySelector(`[data-col="${n}"]`).fire('click');
  const remaining=(n,value)=>{const input=nodes['remaining-inputs'].children.find(e=>e.dataset.remaining===String(n));input.value=String(value);input.fire('input');};
  return {nodes,select,remaining};
}
test('method and strategy describe normalized units and fixed-state scope consistently',()=>{
  const app=fs.readFileSync(__dirname+'/app.js','utf8');
  const readme=fs.readFileSync(__dirname+'/README.md','utf8');
  assert.doesNotMatch(app,/EV na planszy liczy surowe kroki/);
  assert.doesNotMatch(html,/największą liczbą legalnych kroków|wartość w <strong>krokach/);
  assert.match(html,/g_rel/);
  assert.match(readme,/2\/3/);
  assert.match(readme,/2\/13/);
  assert.match(readme,/zamrożonego stanu/);
  assert.match(readme,/test_\*\.cjs/);
});
test('reset is an accessible square icon with opt-in motion',()=>{
  const button=html.match(/<button\b[^>]*id="reset"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(button,/aria-label="Wyczyść wybór kolumn"/);
  assert.match(button,/title="Wyczyść wybór kolumn"/);
  assert.match(button,/<span aria-hidden="true">↺<\/span>/);
  assert.doesNotMatch(button,/Zresetuj stan/);
  const css=fs.readFileSync(__dirname+'/style.css','utf8');
  assert.match(css,/\.reset-button\{[^}]*width:44px;[^}]*height:44px/);
  assert.match(css,/@media\(prefers-reduced-motion:no-preference\)\{\.reset-button/);
  assert.match(css,/\.reset-button:hover span\{transform:rotate\(/);
  assert.match(css,/\.reset-button:active span\{transform:rotate\(/);
});
test('board presents relative threshold, not a verdict from invented gain',async()=>{
  assert.doesNotMatch(html,/id="(?:turn-gain|gain-minus|gain-plus)"/);
  const {nodes,select,remaining}=await mount();
  for(const n of [2,7,12])select(n);
  const markup=nodes.decision.innerHTML;
  assert.match(markup,/Próg bankowania/);
  assert.match(markup,/pełnej kolumny/);
  assert.match(markup,/Średnia T/);
  assert.match(markup,/Mediana T/);
  assert.doesNotMatch(markup,/kr\.|WERDYKT|NaN/);
  assert.match(html,/zamrożonego stanu/);
  for(const n of [2,7,12])remaining(n,0);
  assert.match(nodes.decision.innerHTML,/0,0%/);
  assert.match(nodes.decision.innerHTML,/Brak legalnego kroku/);
  assert.doesNotMatch(nodes.decision.innerHTML,/NaN|∞/);
  const safe=await mount([[[2,2],[7,7],[12,12]]]);
  for(const n of [2,7,12])safe.select(n);
  assert.match(safe.nodes.decision.innerHTML,/Brak skończonego progu/);
  assert.match(safe.nodes.decision.innerHTML,/∞/);
  assert.doesNotMatch(safe.nodes.decision.innerHTML,/NaN/);
});
test('board renders weighted EV and updates capped doubles without raw-gain input',async()=>{
  const {nodes,select,remaining}=await mount([[[2,7],[4,5],[5,4]],[[8,8],[9,9],[10,10]]]);
  for(const n of [2,4,5])select(n);
  assert.match(nodes.decision.innerHTML,/<strong class="verb">33,3%<\/strong>/);
  assert.match(nodes.decision.innerHTML,/E przyrostu względnego \/ rzut<\/dt><dd>16,7%/);
  assert.match(nodes.decision.innerHTML,/Średnia T · rzuty do wpadki<\/dt><dd>2,00/);
  assert.match(nodes.decision.innerHTML,/Mediana T · rzuty do wpadki<\/dt><dd>1/);
  remaining(2,0);
  assert.match(nodes.decision.innerHTML,/<strong class="verb">25,4%<\/strong>/);
  const doubles=await mount([[[2,2],[7,7],[12,12]],[[3,3],[4,4],[5,5]]]);
  for(const n of [2,7,12])doubles.select(n);
  doubles.remaining(7,0);doubles.remaining(12,0);
  assert.match(doubles.nodes.decision.innerHTML,/<strong class="verb">66,7%<\/strong>/);
  doubles.remaining(2,1);
  assert.match(doubles.nodes.decision.innerHTML,/<strong class="verb">33,3%<\/strong>/);
  doubles.remaining(2,99);
  assert.equal(Number(doubles.nodes['remaining-inputs'].children[0].value),3);
  doubles.remaining(2,-1);
  assert.match(doubles.nodes.decision.innerHTML,/Brak legalnego kroku/);
  doubles.remaining(2,'');
  assert.doesNotMatch(doubles.nodes.decision.innerHTML,/NaN/);
});
test('partial selection shows five compatible options and accepting preserves edited capacities',async()=>{
  const {rankCompatibleTriples,completeSelection,evaluateNormalized}=require('./app.js');
  const {rolls}=JSON.parse(fs.readFileSync(__dirname+'/data.json','utf8'));
  const {nodes,select,remaining}=await mount();
  assert.equal(nodes.decision.children.length,0);
  // Stale capacities on unselected columns must never leak into suggestions.
  select(6);remaining(6,0);select(6);
  select(7);remaining(7,1);
  for(const selected of [[7],[2,7]]) {
    if(selected.length===2){select(2);remaining(2,0);}
    const caps={2:0,6:0,7:1};
    const ranked=rankCompatibleTriples(rolls,selected,caps);
    const buttons=nodes.decision.children;
    assert.equal(buttons.length,5);
    assert.match(nodes.decision.innerHTML,/TOP 5/);
    assert.match(nodes.decision.innerHTML,/najniższe ryzyko wpadki/);
    assert.match(nodes.decision.innerHTML,/bezwarunkow/);
    assert.match(nodes.decision.innerHTML,/nie.*EV netto/);
    assert.deepEqual(buttons.map(b=>b.dataset.suggestion),ranked.map(t=>t.cols.join(',')));
    const headings=[...nodes.decision.innerHTML.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>m[1]);
    assert.deepEqual(headings,ranked.map(t=>t.cols.join(' · ')));
    const percent=n=>(n*100).toLocaleString('pl-PL',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
    for(const t of ranked){
      assert.ok(nodes.decision.innerHTML.includes(percent(t.q)));
      assert.ok(nodes.decision.innerHTML.includes(percent(t.increment)));
    }
    if(selected.length===2){
      const target=ranked[0];
      const completed=completeSelection(selected,caps,target.cols);
      assert.equal(completed.remaining[2],0);assert.equal(completed.remaining[7],1);
      assert.equal(caps[6],0);
      buttons[0].fire('click');
      assert.equal(nodes['selection-count'].textContent,'3 / 3 znaczniki');
      assert.deepEqual(nodes['remaining-inputs'].children.map(e=>Number(e.value)),target.cols.map(n=>completed.remaining[n]));
      assert.match(nodes.decision.innerHTML,/Próg bankowania/);
      assert.doesNotMatch(nodes.decision.innerHTML,/TOP 5/);
      assert.ok(nodes.decision.innerHTML.includes(percent(evaluateNormalized(rolls,target.cols,completed.remaining).increment)));
    }
  }
});
test('board starts empty, requires exactly three and reset clears selection and capacities',async()=>{
  const {nodes,select,remaining}=await mount();
  assert.equal(nodes['selection-count'].textContent,'0 / 3 znaczniki');
  assert.match(nodes.decision.innerHTML,/Wybierz 3 szlaki/);
  for(const n of [2,7])select(n);
  assert.match(nodes.decision.innerHTML,/TOP 5/);
  select(12);select(3);
  assert.equal(nodes['selection-count'].textContent,'3 / 3 znaczniki');
  assert.match(nodes['selection-hint'].textContent,/Masz już trzy/);
  remaining(2,0);remaining(7,1);remaining(12,0);
  nodes.reset.fire('click');
  assert.equal(nodes['selection-count'].textContent,'0 / 3 znaczniki');
  assert.equal(nodes['remaining-inputs'].children.length,0);
  assert.match(nodes['risk-table'].innerHTML,/Wybierz dokładnie trzy/);
  for(const n of [2,7,12])select(n);
  assert.deepEqual(nodes['remaining-inputs'].children.map(e=>e.value),['3','13','3']);
  select(7);
  assert.match(nodes.decision.innerHTML,/TOP 5/);
});
