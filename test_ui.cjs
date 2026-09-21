'use strict';
const discreteFeatures=['own_claimed','opponent_claimed','summits_pending','free_markers'];
require('node:test')('discrete thresholds use equivalent integer branches, continuous retain precision',()=>{
  const {splitLabels,normalizeFeature}=require('./app.js');
  const assert=require('node:assert/strict');
  for(const f of discreteFeatures){
    assert.deepEqual(splitLabels(f,1.5),{left:'≤ 1',right:'≥ 2'});
    for(let x=0;x<=5;x++)assert.equal(x<=1.5,x<=1);
    assert.equal(normalizeFeature(f,1.5,5),1);
  }
  assert.deepEqual(splitLabels('turn_gain',0.4265),{left:'≤ 0,427',right:'> 0,427'});
  assert.equal(normalizeFeature('turn_gain',0.4265,3),0.4265);
});
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('compatible suggestions return five survival-ranked triples with capped normalized metrics',()=>{
  const {rankCompatibleTriples,evaluateNormalized}=require('./app.js');
  assert.equal(typeof rankCompatibleTriples,'function');
  const {rolls,triples}=JSON.parse(fs.readFileSync(__dirname+'/data.json','utf8'));
  const remaining=Object.fromEntries(Array.from({length:11},(_,i)=>[i+2,0]));
  remaining[7]=1;
  for(const selected of [[7],[2,7]]) {
    const expected=triples.filter(t=>selected.every(n=>t.cols.includes(n))).map(t=>{
      const caps=Object.fromEntries(t.cols.map(n=>[n,selected.includes(n)?remaining[n]:13-2*Math.abs(7-n)]));
      return {cols:t.cols,...evaluateNormalized(rolls,t.cols,caps)};
    }).sort((a,b)=>b.p-a.p||a.cols[0]-b.cols[0]||a.cols[1]-b.cols[1]||a.cols[2]-b.cols[2]).slice(0,5);
    const actual=rankCompatibleTriples(rolls,selected,remaining);
    assert.equal(actual.length,5);
    assert.deepEqual(actual,expected);
    assert.ok(actual.every(t=>selected.every(n=>t.cols.includes(n))));
  }
  assert.deepEqual(rankCompatibleTriples(rolls,[],remaining),[]);
  assert.deepEqual(rankCompatibleTriples(rolls,[2,7,12],remaining),[]);
  // All outcomes bust: ties must be numeric lexicographic, independent of EV.
  assert.deepEqual(rankCompatibleTriples([[[7,7]]],[7],{7:0}).map(t=>t.cols),
    [[2,3,7],[2,4,7],[2,5,7],[2,6,7],[2,7,8]]);
  assert.equal(remaining[2],0);
});
test('normalized evaluator weights full column lengths and caps double moves', () => {
  const {evaluateNormalized}=require('./app.js');
  assert.equal(typeof evaluateNormalized,'function');
  const rolls=[[[2,2],[7,7],[5,9]],[[4,4],[5,9],[6,8]]];
  const r=evaluateNormalized(rolls,[2,7,12],{2:1,7:13,12:3});
  assert.equal(r.p,.5);
  assert.equal(r.q,.5);
  assert.equal(r.increment,1/6); // one capped step on 2 beats two on 7
  assert.equal(r.threshold,1/3);
  const short=evaluateNormalized([rolls[0]],[2],{2:3});
  const long=evaluateNormalized([rolls[0]],[7],{7:13});
  assert.equal(short.increment,2/3);
  assert.equal(long.increment,2/13);
});
test('fixed-state first knockout includes failing roll and handles q=0 and q=1', () => {
  const {evaluateNormalized}=require('./app.js');
  const rolls=[[[2,2]],[[7,7]]];
  const mixed=evaluateNormalized(rolls,[2],{2:3});
  assert.equal(mixed.meanBust,2);
  assert.equal(mixed.medianBust,1);
  const certain=evaluateNormalized(rolls,[2,7],{2:0,7:0});
  assert.deepEqual(certain,{p:0,q:1,increment:0,threshold:0,meanBust:1,medianBust:1});
  const never=evaluateNormalized(rolls,[2,7],{2:3,7:13});
  assert.equal(never.threshold,Infinity);
  assert.equal(never.meanBust,Infinity);
  assert.equal(never.medianBust,Infinity);
  const p75=evaluateNormalized([[[2,2]],[[2,2]],[[2,2]],[[7,7]]],[2],{2:3});
  assert.equal(p75.meanBust,4);
  assert.equal(p75.medianBust,3);
});
test('normalized pairing can prefer one short-column step over two raw steps',()=>{
  const {evaluateNormalized,pairDice,evaluate}=require('./app.js');
  const rolls=[pairDice([1,1,3,4])],selected=[2,4,5],remaining={2:3,4:7,5:9};
  assert.equal(evaluate(rolls,selected,remaining,0).increment,2);
  assert.equal(evaluateNormalized(rolls,selected,remaining).increment,1/3);
});
test('independent integer-weight enumeration crosschecks every triple and capacity profile',()=>{
  const {evaluateNormalized}=require('./app.js');
  const rolls=JSON.parse(fs.readFileSync(__dirname+'/data.json','utf8')).rolls;
  const height=n=>13-2*Math.abs(7-n);
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const scale=Array.from({length:11},(_,i)=>height(i+2)).reduce((a,b)=>a*b/gcd(a,b),1);
  const outcomes=[];
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)for(let d=1;d<=6;d++) {
    const dice=[a,b,c,d],options=[];
    for(let partner=1;partner<4;partner++) {
      const other=[1,2,3].filter(i=>i!==partner);
      options.push([dice[0]+dice[partner],dice[other[0]]+dice[other[1]]]);
    }
    outcomes.push(options);
  }
  assert.equal(outcomes.length,1296);
  let checked=0;
  for(let a=2;a<=10;a++)for(let b=a+1;b<=11;b++)for(let c=b+1;c<=12;c++) {
    const selected=[a,b,c];
    for(const capacities of [selected.map(height),[1,1,1],[0,0,0],[0,1,height(c)]]) {
      const remaining=Object.fromEntries(selected.map((n,i)=>[n,capacities[i]]));
      let successes=0,weightedTotal=0;
      for(const options of outcomes) {
        const best=Math.max(...options.map(pair=>selected.reduce((score,n,i)=>score+Math.min(capacities[i],pair.filter(v=>v===n).length)*(scale/height(n)),0)));
        successes+=Number(best>0);weightedTotal+=best;
      }
      const r=evaluateNormalized(rolls,selected,remaining);
      assert.equal(r.p,successes/1296);
      assert.ok(Math.abs(r.increment-weightedTotal/scale/1296)<1e-12);
      assert.ok(Math.abs(r.threshold-weightedTotal/scale/(1296-successes))<1e-12);
      assert.ok(Math.abs(r.meanBust-1296/(1296-successes))<1e-12);
      assert.ok(r.p**r.medianBust<=.5+1e-14);
      assert.ok(r.medianBust===1 || r.p**(r.medianBust-1)>.5);
      checked++;
    }
  }
  assert.equal(checked,660);
});
test('dice explorer preserves labelled pairing multiplicity', () => {
  const { pairDice } = require('./app.js');
  assert.equal(typeof pairDice, 'function');
  assert.deepEqual(pairDice([4,5,3,4]).map(p=>p.sort((a,b)=>a-b)), [[7,9],[7,9],[8,8]]);
});
test('tree explorer handles both feature names and indices', () => {
  const { predict } = require('./app.js');
  assert.equal(typeof predict, 'function');
  const tree={id:0,feature:0,threshold:3,left:{id:1,action:'roll'},right:{id:2,action:'stop'}};
  assert.equal(predict(tree,{turn_gain:2},['turn_gain']).action,'roll');
  tree.feature='turn_gain';
  assert.equal(predict(tree,{turn_gain:4},['turn_gain']).action,'stop');
});
test('winning fifth summit overrides a rolling leaf', () => {
  const {predict}=require('./app.js');
  const result=predict({id:0,action:'ROLL'},{own_claimed:4,summits_pending:1},[]);
  assert.equal(result.action,'STOP');
  assert.equal(result.forced,true);
});
test('model action labels respect uppercase backend STOP and ROLL', () => {
  const {actionName}=require('./app.js');
  assert.equal(typeof actionName,'function');
  assert.equal(actionName('STOP'),'Bankuj');
  assert.equal(actionName('ROLL'),'Rzuć');
});
test('Polish operating surface exposes all five panels and live analysis', () => {
  assert.ok(fs.existsSync(__dirname+'/index.html'), 'HTML operating surface exists');
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  for(const id of ['board','probabilities','triples','strategy','method','mountain','decision','risk-table','dice-result']) assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  assert.match(html, /lang="pl"/);
  assert.match(html, /aria-live="polite"/);
});
test('exact EV caps a double at the top and counts busts', () => {
  assert.ok(fs.existsSync(__dirname + '/app.js'), 'frontend probability engine must exist');
  const { evaluate } = require('./app.js');
  const rolls = [[[7,7],[2,12],[3,11]], [[4,4],[2,12],[3,11]]];
  const result = evaluate(rolls, [6,7,8], {6:0,7:1,8:0}, 4);
  assert.equal(result.p, .5);
  assert.equal(result.increment, .5);
  assert.equal(result.delta, -1.5);
  assert.equal(result.rollEV, 2.5);
  assert.equal(result.threshold, 1);
});
