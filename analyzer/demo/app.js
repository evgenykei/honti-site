import {validate,compare,visible,legacy} from './model.js';
const $=id=>document.getElementById(id);
const palette={SYST:'#efbd67',RSDS:'#85d2aa',TRCS:'#bdaddd',ADSO:'#86c9ec',HCPR:'#f39fa4',BEXQ:'#dfd897'};
const words={added:'Добавлен',changed:'Изменён',removed:'Удалён',same:'Без изменений'};
let project,index=0,cy,positions={},basePositions={},selected=null,focus=null,timer=null,types=new Set(),diff,current,displayed,loading=false,reflowTimer=null,reflowVersion=0;
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function stop(){clearInterval(timer);timer=null;$('play').textContent='▶ Воспроизвести';}
function snapshot(){return project.snapshots[index];}
function details(){
 const box=$('details');box.replaceChildren();$('focus').disabled=true;
 const kind=selected?.kind;const item=selected&&(kind==='node'?displayed.nodes:displayed.edges).find(x=>x.id===selected.id);
 if(!item){box.append(el('p','Выберите объект или связь, чтобы увидеть свойства.','muted'));return;}
 const state=diff[kind==='node'?'nodes':'edges'].get(item.id)||'same';box.append(el('span',item.collapsed?'Свёрнутый поток':words[state],item.collapsed?'muted':state),el('h3',item.label||'Зависимость'),el('code',item.id));
 const dl=el('dl');const add=(k,v)=>{dl.append(el('dt',k),el('dd',typeof v==='object'?JSON.stringify(v):String(v)));};
 if(kind==='node'){
  add('Тип',project.types?.[item.type]||item.type);if(item.description)add('Описание',item.description);for(const [k,v] of Object.entries(item.attributes||{}))add(k,v);
  $('focus').disabled=!current.nodes.some(x=>x.id===item.id);
 }else{add('Из объекта',item.source);add('В объект',item.target);add('Тип связи',item.collapsed?'Свёрнутая цепочка':item.type||'dependency');if(item.collapsed){const names=new Map([...current.nodes,...(project.snapshots[index-1]?.nodes||[])].map(n=>[n.id,n.label]));add('Через объекты',item.via.map(id=>names.get(id)||id).join(' → '));add('Исходные связи',item.sourceEdges.join(' → '));}}
 box.append(dl);
 if(state==='changed'){
  const prev=project.snapshots[index-1]?.[kind==='node'?'nodes':'edges'].find(x=>x.id===item.id);
  box.append(el('h3','Что изменилось'));
  for(const key of new Set([...Object.keys(prev||{}),...Object.keys(item)]))if(JSON.stringify(prev?.[key])!==JSON.stringify(item[key]))box.append(el('p',key+': '+JSON.stringify(prev?.[key]??'—')+' → '+JSON.stringify(item[key]??'—')));
 }
 if(kind==='node'){
  box.append(el('h3','Прямые связи'));
  for(const e of displayed.edges.filter(x=>x.source===item.id||x.target===item.id)){
   const id=e.source===item.id?e.target:e.source;const other=displayed.nodes.find(n=>n.id===id);const b=el('button',(e.source===item.id?'→ ':'← ')+(other?.label||id),'relation');b.onclick=()=>select('node',id);box.append(b);
  }
 }
}
function select(kind,id){stop();selected={kind,id};cy.elements().unselect();const target=cy.getElementById(id);target.select();details();}
function render(){
 current=snapshot();diff=compare(project.snapshots[index-1],current);
 let nodes=[...current.nodes],edges=[...current.edges];
 if($('ghosts').checked&&diff.comparable){const old=project.snapshots[index-1];nodes.push(...old.nodes.filter(n=>diff.nodes.get(n.id)==='removed'));edges.push(...old.edges.filter(e=>diff.edges.get(e.id)==='removed'));}
 displayed=visible({nodes,edges},{types,query:$('search').value,focus,direction:$('direction').value});
 const elems=[...displayed.nodes.map(n=>({group:'nodes',data:{...n,color:palette[n.type]||'#b4c6cc',state:diff.nodes.get(n.id)||'same',...(displayed.matched.has(n.id)?{}:{context:1})},position:positions[n.id]})),...displayed.edges.map(e=>({group:'edges',data:{...e,state:diff.edges.get(e.id)||'same'}}))];
 for(const n of cy.nodes())positions[n.id()]={...n.position()};
 for(const n of elems.filter(x=>x.group==='nodes'))n.position=positions[n.data.id];
 cy.batch(()=>{cy.elements().remove();cy.add(elems);});
 if(selected)cy.getElementById(selected.id).select();
 $('empty').hidden=displayed.matched.size>0;$('count').textContent=displayed.matched.size+' объектов · '+displayed.edges.length+' связей'+(displayed.edges.some(e=>e.collapsed)?' (включая свёрнутые)':'');
 $('snapshotTitle').textContent=current.label||current.id;$('time').value=index;$('date').textContent=new Date(current.capturedAt).toLocaleDateString('ru-RU',{timeZone:'UTC'})+' · '+(index+1)+' / '+project.snapshots.length;
 const totals={added:0,changed:0,removed:0};for(const map of [diff.nodes,diff.edges])for(const state of map.values())if(state in totals)totals[state]++;
 $('delta').textContent=!index?'Исходный снимок':!diff.comparable?'Сравнение недоступно: разный охват или неполный снимок':`+${totals.added} / ~${totals.changed} / −${totals.removed} объектов и связей`;
 $('unfocus').hidden=!focus;$('focusLabel').textContent=focus?'Фокус: '+(nodes.find(n=>n.id===focus)?.label||focus):'';
 $('rows').replaceChildren();for(const n of displayed.nodes){if(!displayed.matched.has(n.id))continue;const row=el('tr'),cell=el('td'),b=el('button',n.label);b.onclick=()=>select('node',n.id);cell.append(b,el('small',n.id));row.append(cell,el('td',project.types?.[n.type]||n.type),el('td',words[diff.nodes.get(n.id)||'same'],diff.nodes.get(n.id)));$('rows').append(row);}
 if(!displayed.matched.size){const tr=el('tr'),td=el('td','Нет объектов по выбранным условиям.');td.colSpan=3;tr.append(td);$('rows').append(tr);}
 $('changes').replaceChildren(el('strong',index?'Изменения снимка':'Исходное состояние'));
 if(diff.comparable){for(const n of nodes){const state=diff.nodes.get(n.id);if(state==='same')continue;const b=el('button',(state==='added'?'+ ':state==='removed'?'− ':'~ ')+n.label,'relation '+state);b.onclick=()=>{stop();focus=null;$('search').value='';types.add(n.type);drawTypes();$('ghosts').checked=true;render();select('node',n.id);cy.animate({center:{eles:cy.getElementById(n.id)},duration:250});};$('changes').append(b);}}
 details();
}
function drawTypes(){
 $('types').replaceChildren();const counts={};for(const n of snapshot().nodes)counts[n.type]=(counts[n.type]||0)+1;
 for(const t of new Set(project.snapshots.flatMap(s=>s.nodes.map(n=>n.type)))){const label=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.checked=types.has(t);input.dataset.type=t;input.onchange=()=>{stop();input.checked?types.add(t):types.delete(t);render();reflow();};label.append(input,el('span',project.types?.[t]||t),el('span',counts[t]||0,'total'));$('types').append(label);}
}
function reflow(){
 clearTimeout(reflowTimer);const version=++reflowVersion;
 const query=$('search').value,chosen=new Set(types),center=focus,direction=$('direction').value;
 const filtered=!!query.trim()||!!center||project.snapshots.some(s=>s.nodes.some(n=>!chosen.has(n.type)));
 if(!filtered){positions={...basePositions};cy.batch(()=>cy.nodes().forEach(n=>{if(positions[n.id()])n.position(positions[n.id()]);}));cy.fit(undefined,45);return;}
 reflowTimer=setTimeout(async()=>{
  const ns=new Map(),es=new Map();
  for(const s of project.snapshots){const view=visible(s,{types:chosen,query,focus:center,direction});for(const n of view.nodes)ns.set(n.id,n);for(const e of view.edges)es.set(e.id,e);}
  if(!ns.size)return;
  try{
   const layout=await new ELK().layout({id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.spacing.nodeNode':'35','elk.layered.spacing.nodeNodeBetweenLayers':'65'},children:[...ns.keys()].map(id=>({id,width:145,height:62})),edges:[...es.values()].filter(e=>e.source!==e.target).map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))});
   if(version!==reflowVersion)return;
   positions=Object.fromEntries((layout.children||[]).map(n=>[n.id,{x:n.x+72.5,y:n.y+31}]));
   cy.batch(()=>cy.nodes().forEach(n=>{if(positions[n.id()])n.position(positions[n.id()]);}));cy.fit(undefined,45);
  }catch(e){if(version===reflowVersion)message('Не удалось перестроить схему: '+e.message,true);}
 },180);
}
async function load(p){
 if(loading)throw Error('Дождитесь завершения текущей загрузки.');validate(p);stop();clearTimeout(reflowTimer);reflowVersion++;loading=true;$('import').disabled=true;$('demo').disabled=true;$('play').disabled=true;message('Рассчитываю расположение объектов…');
 // Layout the union once: unchanged nodes keep their positions across snapshots.
 const ns=new Map(),es=new Map();for(const s of p.snapshots){for(const n of s.nodes)ns.set(n.id,n);for(const e of s.edges)es.set(e.id,e);}
 if(ns.size>3000||es.size>10000){loading=false;throw Error('Объединённый граф превышает лимит прототипа.');}
 const layout=await new ELK().layout({id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.spacing.nodeNode':'35','elk.layered.spacing.nodeNodeBetweenLayers':'65'},children:[...ns.values()].map(n=>({id:n.id,width:145,height:62})),edges:[...es.values()].filter(e=>e.source!==e.target).map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))});
 project=p;positions=Object.fromEntries((layout.children||[]).map(n=>[n.id,{x:n.x+72.5,y:n.y+31}]));basePositions={...positions};index=0;selected=null;focus=null;types=new Set([...ns.values()].map(n=>n.type));$('search').value='';$('time').max=p.snapshots.length-1;$('time').disabled=p.snapshots.length===1;$('ghosts').checked=true;
 $('dataset').textContent=p.synthetic?'Демонстрационные данные и вымышленная история · без подключения к SAP':'Локальные данные · обрабатываются только в этом браузере';
 drawTypes();render();cy.resize();cy.fit(undefined,45);loading=false;$('import').disabled=false;$('demo').disabled=false;$('play').disabled=p.snapshots.length<2;
 message(p.synthetic?'Выберите объект для исследования. Шкала времени показывает шесть вымышленных этапов развития.':'Набор загружен. Для старого формата время снимка означает дату импорта, а не дату состояния SAP.');
}
async function demo(){const r=await fetch('demo.json');if(!r.ok)throw Error('Не удалось загрузить демоданные.');await load(await r.json());}
function fail(e){loading=false;$('import').disabled=false;$('demo').disabled=false;$('play').disabled=!project||project.snapshots.length<2;message(e.message||String(e),true);}
function tick(){if(index===project.snapshots.length-1){stop();return;}index++;drawTypes();render();if(index===project.snapshots.length-1)stop();}
async function init(){
 if(!window.cytoscape||!window.ELK)throw Error('Не загрузились библиотеки графа. Обновите страницу.');
 cy=cytoscape({container:$('cy'),elements:[],layout:{name:'preset'},minZoom:.08,maxZoom:3,wheelSensitivity:.2,style:[
 {selector:'node',style:{'shape':'round-rectangle','width':145,'height':62,'background-color':'data(color)','label':'data(label)','font-size':12,'font-family':'Arial','text-valign':'center','text-wrap':'wrap','text-max-width':130,'color':'#132832','border-width':1,'border-color':'#53636e'}},
 {selector:'edge',style:{'width':1.6,'line-color':'#738c98','target-arrow-color':'#738c98','target-arrow-shape':'triangle','curve-style':'bezier','arrow-scale':.8}},
 {selector:'[state="added"]',style:{'border-width':4,'border-color':'#30c57b','line-color':'#30c57b','target-arrow-color':'#30c57b','width':3}},
 {selector:'node[state="added"]',style:{width:145}},
 {selector:'[state="changed"]',style:{'border-width':4,'border-color':'#ffc65a','line-color':'#ffc65a','target-arrow-color':'#ffc65a'}},
 {selector:'[state="removed"]',style:{'opacity':.55,'border-width':3,'border-color':'#ff7771','border-style':'dashed','line-color':'#ff7771','target-arrow-color':'#ff7771','line-style':'dashed'}},
 {selector:'node[context]',style:{'shape':'ellipse','width':12,'height':12,'label':'','background-color':'#9aacb6','border-width':0,'opacity':.85}},
 {selector:'edge[collapsed]',style:{'line-style':'dashed','line-color':'#b3dbe3','target-arrow-color':'#b3dbe3','width':2.5}},
 {selector:':selected',style:{'border-width':4,'border-color':'white','line-color':'white','target-arrow-color':'white','overlay-opacity':.12,'overlay-color':'#fff'}}]});
 cy.on('tap','node',e=>select('node',e.target.id()));cy.on('tap','edge',e=>select('edge',e.target.id()));cy.on('dragfree','node',e=>{positions[e.target.id()]={...e.target.position()};if(!focus&&!$('search').value.trim()&&project.snapshots.every(s=>s.nodes.every(n=>types.has(n.type))))basePositions[e.target.id()]={...e.target.position()};});
 $('deselect').onclick=()=>{selected=null;cy.elements().unselect();details();};
 $('search').oninput=()=>{stop();if(project){render();reflow();}};$('direction').onchange=()=>{stop();if(project){render();reflow();}};$('ghosts').onchange=()=>{stop();if(project)render();};
 $('focus').onclick=()=>{if(selected?.kind==='node'){stop();focus=selected.id;$('search').value='';render();reflow();}};
 $('unfocus').onclick=()=>{stop();focus=null;render();reflow();};
 $('reset').onclick=()=>{if(!project)return;stop();focus=null;$('search').value='';types=new Set(project.snapshots.flatMap(s=>s.nodes.map(n=>n.type)));drawTypes();render();reflow();};
 $('fit').onclick=()=>cy.fit(undefined,45);$('zoomIn').onclick=()=>cy.zoom({level:cy.zoom()*1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});$('zoomOut').onclick=()=>cy.zoom({level:cy.zoom()/1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});
 function tab(table){$('tablePanel').hidden=!table;$('graphPanel').hidden=table;$('tableTab').setAttribute('aria-selected',String(table));$('graphTab').setAttribute('aria-selected',String(!table));if(!table)cy.resize();}
 $('tableTab').onclick=()=>tab(true);$('graphTab').onclick=()=>tab(false);
 $('time').oninput=()=>{if(!project)return;stop();index=+$('time').value;drawTypes();render();};
 $('play').onclick=()=>{if(timer){stop();return;}if(loading||!project)return;if(index===project.snapshots.length-1){index=0;drawTypes();render();}timer=setInterval(tick,+$('speed').value);$('play').textContent='Ⅱ Пауза';};$('speed').onchange=()=>{if(timer){clearInterval(timer);timer=setInterval(tick,+$('speed').value);}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 $('demo').onclick=()=>demo().catch(fail);
 $('import').onchange=async()=>{try{stop();const files=[...$('import').files];if(!files.length)return;if(files.reduce((s,f)=>s+f.size,0)>8e6)throw Error('Максимальный общий размер файлов — 8 МБ.');
 const entries=await Promise.all(files.map(async f=>[f.name.toLowerCase(),JSON.parse(await f.text())]));
 if(entries.length===1&&!Array.isArray(entries[0][1]))await load(entries[0][1]);else{const map=Object.fromEntries(entries);if(!map['groups.json']||!map['nodes.json']||!map['lines.json'])throw Error('Выберите вместе Groups.json, Nodes.json и Lines.json либо один файл со snapshots.');const result=legacy(map['groups.json'],map['nodes.json'],map['lines.json']);await load(result.project);if(result.warnings.length)message('Набор загружен. Исправления импорта: '+result.warnings.length+' (пробелы в типах, точные дубли).');}
 }catch(e){fail(e);}finally{$('import').value='';}};
 new ResizeObserver(()=>cy.resize()).observe($('cy'));
 await demo();window.honti={get cy(){return cy;},get project(){return project;},get index(){return index;}};
}
if(document.readyState==='complete')init().catch(fail);else window.addEventListener('load',()=>init().catch(fail));
