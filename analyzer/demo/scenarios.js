import {reach,compare} from './model.js';

// Keep the complete landscape; this plan only marks downstream dependencies.
export function impactPlan(snapshot,source){
 const nodes=reach(snapshot.nodes,snapshot.edges,source,'down');
 return {nodes,edges:new Set(snapshot.edges.filter(e=>nodes.has(e.source)&&nodes.has(e.target)).map(e=>e.id)),
  reports:snapshot.nodes.filter(n=>nodes.has(n.id)&&n.type==='BEXQ'),dependents:Math.max(0,nodes.size-1)};
}

export function historySummary(before,after){
 if(!before)return 'Исходный снимок: '+after.nodes.length+' объектов и '+after.edges.length+' связей.';
 const diff=compare(before,after);
 if(!diff.comparable)return 'Снимки нельзя сравнить: охват отличается или данные неполные.';
 const parts=[];
 for(const [kind,label] of [['nodes','Объекты'],['edges','Связи']]){
  const counts={added:0,changed:0,removed:0};
  for(const value of diff[kind].values())if(value in counts)counts[value]++;
  parts.push(label+': добавлено '+counts.added+', изменено '+counts.changed+', удалено '+counts.removed+'.');
 }
 return parts.join(' ');
}
