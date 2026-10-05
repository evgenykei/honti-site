import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {validate,compare,visible,legacy} from '../analyzer/demo/model.js';
import {impactPlan,historySummary} from '../analyzer/demo/scenarios.js';
const base=new URL('../analyzer/demo/',import.meta.url);
const p=JSON.parse(fs.readFileSync(new URL('demo.json',base)));
const plan=impactPlan(p.snapshots[0],'DEMO_RSDS_02');
assert.equal(plan.dependents,6);
assert.deepEqual(plan.reports.map(n=>n.id),['DEMO_BEXQ_02','DEMO_BEXQ_03']);
assert.equal(plan.nodes.has('DEMO_SYST_02'),false,'Do not traverse upstream');
const cycle={nodes:['a','b','c','x'].map(id=>({id,type:'BEXQ'})),edges:[{id:'ab',source:'a',target:'b'},{id:'bc',source:'b',target:'c'},{id:'ca',source:'c',target:'a'},{id:'xb',source:'x',target:'b'}]};
assert.deepEqual([...impactPlan(cycle,'a').nodes],['a','b','c']);
assert.deepEqual([...impactPlan(cycle,'a').edges],['ab','bc','ca']);
assert.equal(impactPlan(cycle,'missing').nodes.size,0);
assert.match(historySummary(p.snapshots[0],p.snapshots[1]),/Объекты: добавлено 1/);
assert.match(historySummary(p.snapshots[4],p.snapshots[5]),/Связи: добавлено 1, изменено 0, удалено 1/);
assert.match(historySummary({...p.snapshots[0],complete:false},p.snapshots[1]),/нельзя сравнить/);

// Exercise real app event handlers with Cytoscape headless and a minimal DOM.
// This verifies state and graph behaviour, not browser rendering or CSS.
class Element{
 constructor(){this.children=[];this.attributes={};this.dataset={};this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.classList={toggle(){}};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(k,v){this.attributes[k]=v;}
}
const html=fs.readFileSync(new URL('index.html',base),'utf8');
const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
elements.speed.value='3000';elements.direction.value='both';
const intervals=new Map();let serial=0;
const sandbox={console,setTimeout,clearTimeout,Error,validate,compare,visible,legacy,impactPlan,historySummary,
 setInterval(fn){intervals.set(++serial,fn);return serial;},clearInterval(id){intervals.delete(id);},
 document:{readyState:'loading',hidden:false,getElementById:id=>{assert.ok(elements[id],'Missing HTML element '+id);return elements[id];},createElement:()=>new Element(),addEventListener(){}},
 ResizeObserver:class{observe(){}},fetch:async()=>({ok:true,json:async()=>JSON.parse(JSON.stringify(p))}),addEventListener(){}};
sandbox.window=sandbox;sandbox.self=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('vendor/elk.bundled.js',base),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(new URL('vendor/cytoscape.min.js',base),'utf8'),sandbox);
vm.runInContext('const realCytoscape=cytoscape;cytoscape=options=>realCytoscape({...options,container:undefined,headless:true,styleEnabled:true});',sandbox);
const app=fs.readFileSync(new URL('app.js',base),'utf8').replace(/^import .*;\n/gm,'');
vm.runInContext(app,sandbox);await vm.runInContext('init()',sandbox);
const cy=sandbox.honti.cy;
elements.impactScenario.onclick();
assert.equal(cy.nodes().length,p.snapshots[0].nodes.length,'Keep unrelated nodes');
assert.equal(cy.edges().length,p.snapshots[0].edges.length,'Keep all edges');
assert.equal(cy.nodes('.scenario-path').length,7);
assert.equal(cy.nodes('.scenario-muted').length,p.snapshots[0].nodes.length-7);
assert.equal(cy.$(':selected').id(),'DEMO_RSDS_02');
assert.match(elements.scenarioText.textContent,/Отчёт 02, Отчёт 03/);
assert.equal(elements.graphPanel.hidden,false);
elements.exitScenario.onclick();
assert.equal(cy.elements('.scenario-muted').length,0);
assert.equal(elements.scenarioResult.hidden,true);
elements.historyScenario.onclick();
assert.equal(intervals.size,1);
assert.match(elements.scenarioTitle.textContent,/Воспроизведение/);
for(let i=1;i<p.snapshots.length;i++)[...intervals.values()][0]();
assert.equal(intervals.size,0,'Stop after the last snapshot');
assert.equal(sandbox.honti.index,5);
assert.match(elements.scenarioTitle.textContent,/История завершена/);
assert.equal(cy.$('#new-feed').data('state'),'removed');
elements.historyScenario.onclick();elements.play.onclick();
assert.equal(intervals.size,0);
assert.match(elements.scenarioTitle.textContent,/Пауза/);
elements.play.onclick();assert.equal(intervals.size,1);
elements.search.value='Витрина';elements.search.oninput();
assert.equal(intervals.size,0);assert.equal(elements.scenarioResult.hidden,true);
elements.impactScenario.onclick();
const typeInput=elements.types.children.find(label=>label.children[0].dataset.type==='TRCS').children[0];
typeInput.checked=false;typeInput.onchange();
assert.equal(elements.scenarioResult.hidden,true);
assert.equal(cy.elements('.scenario-muted').length,0);
assert.ok(cy.edges().some(e=>e.data('collapsed')),'Manual type contraction still works');
// Even an imported JSON with synthetic:true is not allowed to launch demo scenarios.
await vm.runInContext('load('+JSON.stringify(p)+')',sandbox);
assert.equal(elements.impactScenario.disabled,true);assert.equal(elements.historyScenario.disabled,true);
const imported=sandbox.honti.project;elements.impactScenario.onclick();
assert.equal(sandbox.honti.project,imported);assert.equal(elements.scenarioResult.hidden,true);
await vm.runInContext('demo()',sandbox);assert.equal(elements.impactScenario.disabled,false);
vm.runInContext('stop();clearTimeout(reflowTimer);cy.destroy();',sandbox);
console.log('Guided scenarios: downstream paths, history, controls and import isolation passed.');
