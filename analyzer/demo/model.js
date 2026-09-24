/* HONTI Analyzer: domain model, independent of renderer and data source. */
export function validate(project) {
  if(project.schemaVersion!==1 || !Array.isArray(project.snapshots) || !project.snapshots.length) throw Error('Ожидается schemaVersion: 1 и непустой массив snapshots.');
  if(project.snapshots.length>100) throw Error('Для прототипа допускается до 100 снимков.');
  const snapshotIds=new Set(), kinds=new Map(); let last=-Infinity;
  for(const s of project.snapshots){
    if(!s.id||snapshotIds.has(s.id)) throw Error('Идентификаторы снимков должны быть уникальными.'); snapshotIds.add(s.id);
    const date=Date.parse(s.capturedAt); if(!Number.isFinite(date)||date<=last) throw Error('Снимки должны идти по возрастанию даты.');last=date;
    if(!Array.isArray(s.nodes)||!Array.isArray(s.edges)) throw Error('В снимке нужны nodes и edges.');
    if(s.nodes.length>3000||s.edges.length>10000) throw Error('Лимит прототипа: 3000 объектов и 10000 связей на снимок.');
    const ids=new Set();
    for(const n of s.nodes){if(typeof n.id!=='string'||!n.id||ids.has(n.id)||typeof n.label!=='string'||typeof n.type!=='string')throw Error('Неверный или повторный ключ объекта.');if(kinds.has(n.id)&&kinds.get(n.id)!=="node")throw Error("Ключ используется и объектом, и связью.");kinds.set(n.id,"node");ids.add(n.id);}
    const edges=new Set();for(const e of s.edges){if(typeof e.id!=='string'||!e.id||edges.has(e.id)||ids.has(e.id)||!ids.has(e.source)||!ids.has(e.target))throw Error('Неверный ключ связи или ссылка на отсутствующий объект.');if(kinds.has(e.id)&&kinds.get(e.id)!=="edge")throw Error("Ключ используется и объектом, и связью.");kinds.set(e.id,"edge");edges.add(e.id);}
  }
  return project;
}
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function compare(before,after){
  const comparable=!!before&&before.complete===true&&after.complete===true&&typeof before.scope==='string'&&before.scope.length>0&&before.scope===after.scope;
  const result={comparable,nodes:new Map(),edges:new Map()};
  for(const kind of ['nodes','edges']){
    const a=new Map((before?.[kind]||[]).map(x=>[x.id,x]));const b=new Map(after[kind].map(x=>[x.id,x]));
    for(const [id,x] of b)result[kind].set(id,!comparable?'same':!a.has(id)?'added':stable(a.get(id))!==stable(x)?'changed':'same');
    if(comparable)for(const id of a.keys())if(!b.has(id))result[kind].set(id,'removed');
  }return result;
}
export function reach(nodes,edges,start,direction='both'){
  const valid=new Set(nodes.map(n=>n.id));if(!valid.has(start))return new Set();const result=new Set([start]);
  for(const mode of direction==='both'?['up','down']:[direction]){
    const adj=new Map();for(const e of edges){const a=mode==='up'?e.target:e.source,b=mode==='up'?e.source:e.target;if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
    const visited=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const v of adj.get(queue[i])||[])if(!visited.has(v)){visited.add(v);result.add(v);queue.push(v);}
  }return result;
}
export function visible(snapshot,{types,query='',focus=null,direction='both'}){
  const related=focus?reach(snapshot.nodes,snapshot.edges,focus,direction):null;
  const q=query.trim().toLocaleLowerCase('ru');
  const nodes=snapshot.nodes.filter(n=>(!types||types.has(n.type))&&(!related||related.has(n.id))&&(!q||[n.id,n.label,n.description||''].join(' ').toLocaleLowerCase('ru').includes(q)));
  const ids=new Set(nodes.map(n=>n.id));return {nodes,edges:snapshot.edges.filter(e=>ids.has(e.source)&&ids.has(e.target))};
}
export function legacy(groups,nodes,lines){
  if(![groups,nodes,lines].every(Array.isArray))throw Error('Groups, Nodes и Lines должны быть массивами.');
  const names=new Map(groups.map(g=>[g.key.trim(),g.name.trim()])),warnings=[],seen=new Set();
  const ns=nodes.map(n=>{if(typeof n.group!=='string'||typeof n.key!=='string')throw Error('В Nodes нужны key и group.');const type=n.group.trim();if(type!==n.group)warnings.push('Убран пробел в типе '+n.key);if(!names.has(type))warnings.push('Неизвестный тип '+type);return {id:n.key,label:n.title||n.key,description:n.description||'',type,attributes:{}};});
  const es=[];for(const e of lines){const k=JSON.stringify([e.from,e.to]);if(seen.has(k)){warnings.push('Дубль связи '+e.from+' → '+e.to);continue;}seen.add(k);es.push({id:'edge:'+k,source:e.from,target:e.to,type:'dependency'});}
  return {project:validate({schemaVersion:1,title:'Локальный набор',synthetic:false,types:Object.fromEntries(names),snapshots:[{id:'import',capturedAt:new Date().toISOString(),scope:'local-import',complete:false,label:'Импорт · дата загрузки',nodes:ns,edges:es}]}),warnings};
}
