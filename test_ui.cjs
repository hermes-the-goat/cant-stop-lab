'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
