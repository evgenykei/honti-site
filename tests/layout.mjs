import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {validate,compare,visible} from '../analyzer/demo/model.js';
const base=new URL('../analyzer/demo/',import.meta.url);
const sandbox={console,setTimeout,clearTimeout,Error,document:{}};sandbox.window=sandbox;sandbox.self=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('vendor/elk.bundled.js',base),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(new URL('vendor/cytoscape.min.js',base),'utf8'),sandbox);
const p=validate(JSON.parse(fs.readFileSync(new URL('demo.json',base))));
const nodes=new Map(),edges=new Map();for(const s of p.snapshots){for(const n of s.nodes)nodes.set(n.id,n);for(const e of s.edges)edges.set(e.id,e);}
const graph={id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT'},children:[...nodes.keys()].map(id=>({id,width:145,height:62})),edges:[...edges.values()].filter(e=>e.source!==e.target).map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))};
const layout=await vm.runInContext('new ELK().layout('+JSON.stringify(graph)+')',sandbox);
assert.equal(layout.children.length,nodes.size);for(const n of layout.children)assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));
for(const s of p.snapshots){const cy=vm.runInContext('cytoscape('+JSON.stringify({headless:true,elements:[...s.nodes.map(n=>({data:n})),...s.edges.map(e=>({data:e}))]})+')',sandbox);assert.equal(cy.nodes().length,s.nodes.length);assert.equal(cy.edges().length,s.edges.length);cy.destroy();}
const contracted=visible(p.snapshots[0],{types:new Set(['ADSO','BEXQ'])});
assert.ok(contracted.edges.some(e=>e.collapsed));
assert.ok(contracted.edges.every(e=>contracted.nodes.some(n=>n.id===e.source)&&contracted.nodes.some(n=>n.id===e.target)));
const compactGraph={id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT'},children:contracted.nodes.map(n=>({id:n.id,width:145,height:62})),edges:contracted.edges.filter(e=>e.source!==e.target).map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))};
const compactLayout=await vm.runInContext('new ELK().layout('+JSON.stringify(compactGraph)+')',sandbox);
assert.equal(compactLayout.children.length,contracted.nodes.length);
assert.equal(compare(p.snapshots[2],p.snapshots[3]).nodes.get('DEMO_ADSO_NEW'),'changed');
assert.ok([...compare(p.snapshots[3],p.snapshots[4]).nodes.values()].includes('removed'));
assert.ok([...compare(p.snapshots[4],p.snapshots[5]).edges.values()].includes('removed'));
console.log('Validated all six snapshots; ELK union layout and Cytoscape headless graphs passed.');
