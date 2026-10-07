(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const baseline = [
    {id:'ZD_SALES_RAW',status:'Ошибка',rows:82000},
    {id:'ZD_SALES',status:'Ожидает',rows:0},
    {id:'ZQ_SALES_DAILY',status:'Не обновлён',rows:0},
    {id:'ZD_CUSTOMERS',status:'Готово',rows:14500}
  ];
  let loads, audit, recovered, planPending;
  function event(text) { audit.push(new Date().toLocaleTimeString('ru-RU')+' — '+text); render(); }
  function render() {
    $('loads').replaceChildren();
    for (const x of loads) {
      const tr=document.createElement('tr');
      for (const [i,v] of [x.id,x.status,x.rows.toLocaleString('ru-RU')].entries()) {
        const td=document.createElement('td');td.textContent=v;
        if(i===1)td.className=x.status==='Готово'?'ok':x.status==='Ошибка'?'error':'blocked';
        tr.append(td);
      }
      $('loads').append(tr);
    }
    $('metrics').replaceChildren();
    for(const [value,label] of [[loads.filter(x=>x.status==='Готово').length,'готово'],[loads.filter(x=>x.status==='Ошибка').length,'ошибок'],[loads.filter(x=>!['Готово','Ошибка'].includes(x.status)).length,'зависимых объектов']]){
      const d=document.createElement('div');d.className='metric';const b=document.createElement('strong');b.textContent=value;d.append(b,document.createTextNode(label));$('metrics').append(d);
    }
    $('quality').textContent=recovered?'Контроль пройден: 100 000 из 100 000 строк. В справочнике есть клиент C-1042.':'ERP: 100 000 строк; загружено: 82 000. Разница: 18 000 строк. В справочнике отсутствует клиент C-1042.';
    $('audit').replaceChildren(...audit.map(x=>{const li=document.createElement('li');li.textContent=x;return li;}));
  }
  function message(text,role='assistant',source,action=false) {
    const d=document.createElement('div');d.className='message '+role;d.textContent=text;
    if(source){const s=document.createElement('div');s.className='source';s.textContent='Основание: '+source;d.append(s);}
    if(action){const b=document.createElement('button');b.className='confirm';b.textContent='Подтвердить восстановление в демо';b.onclick=()=>{
      if(!planPending||recovered)return;
      planPending=false;recovered=true;
      for(const x of loads){x.status='Готово';if(x.id!=='ZD_CUSTOMERS')x.rows=100000;else x.rows=14501;}
      document.querySelectorAll('.confirm').forEach(x=>x.disabled=true);
      event('Пользователь подтвердил: справочник обновлён, загрузка повторена, отчёт проверен (демо).');
      message('Восстановление выполнено в демо.\n\n1. Клиент C-1042 добавлен в справочник.\n2. Повторная загрузка: 100 000 строк, расхождений нет.\n3. ZD_SALES и ZQ_SALES_DAILY обновлены.\n\nСтатусы справа отражают результат. Реальные системы не изменялись.','assistant','демонстрационный журнал повторной загрузки и сверка ERP / BW');
    };d.append(document.createElement('br'),b);}
    $('conversation').append(d);$('conversation').scrollTop=$('conversation').scrollHeight;
  }
  function ask(q) {
    q=q.trim();if(!q)return;message(q,'user');$('question').value='';
    const t=q.toLowerCase();
    if(/восстанов|перезапус|повтор|исправ|план|запуст/.test(t)) {
      if(recovered){message('Загрузки уже восстановлены в этом демо. Все четыре объекта готовы. Для повторного прохождения нажмите «Сбросить демо».');return;}
      planPending=true;event('Сформирован план восстановления; ожидается подтверждение.');
      message('План восстановления\n\n1. Обновить справочник клиентов: отсутствует C-1042.\n2. Повторить прерванную загрузку ZD_SALES_RAW.\n3. После сверки 100 000 строк обновить ZD_SALES и отчёт ZQ_SALES_DAILY.\n\nПредлагаемое действие изменит только демонстрационные данные. Выполнение требует вашего подтверждения.','assistant','ошибка запроса REQ_20261007_01, зависимость отчёта от ZD_SALES_RAW',true);
    } else if(/качеств|свер|расхожд|строк|полнот/.test(t)) {
      message(recovered?'Сверка пройдена: ERP — 100 000 строк, BW — 100 000 строк. Расхождение: 0.':'Проверка полноты не пройдена.\n\nERP: 100 000 строк.\nZD_SALES_RAW: 82 000 строк.\nНе загружено: 18 000 строк (18%).\n\nПричина: загрузка остановилась на проверке клиента C-1042. До восстановления отчёт нельзя считать актуальным.','assistant','демонстрационные контрольные суммы ERP и BW, справочник клиентов');
    } else if(/ошиб|отч[её]т|продаж|загруз|статус|почему/.test(t)) {
      message(recovered?'Все загрузки завершены. Отчёт по продажам обновлён; количество строк совпадает с ERP.':'Отчёт по продажам не обновился из-за сбоя ZD_SALES_RAW.\n\nВ запросе REQ_20261007_01 отсутствует клиент C-1042 в справочнике. Успело загрузиться 82 000 из 100 000 строк.\n\nВлияние: ZD_SALES ожидает успешной загрузки, поэтому ZQ_SALES_DAILY показывает предыдущий срез.\n\nРекомендация: обновить справочник, повторить загрузку и сверить данные. Попросите подготовить план восстановления.','assistant','журнал REQ_20261007_01 и цепочка ERP → ZD_SALES_RAW → ZD_SALES → ZQ_SALES_DAILY');
    } else {
      message('В этом демо доступны диагностика загрузок, проверка качества данных и план восстановления. Попробуйте «Почему отчёт по продажам не обновился?» или выберите вопрос ниже. Ответ на произвольный вопрос требует подключения языковой модели и ваших источников.');
    }
  }
  function reset(){loads=baseline.map(x=>({...x}));audit=[];recovered=false;planPending=false;$('conversation').replaceChildren();event('Открыт демонстрационный срез. Действия не выполнялись.');message('Здравствуйте! Я помогу разобраться, почему не обновился отчёт по продажам, проверю данные и подготовлю план восстановления.\n\nВыберите вопрос ниже или напишите свой.');}
  $('ask').onsubmit=e=>{e.preventDefault();ask($('question').value);};
  $('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(!e.repeat)$('ask').requestSubmit();}});
  document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>ask(b.dataset.question));
  $('reset').onclick=reset;
  $('export').onclick=()=>{const blob=new Blob(['HONTI Assistant — журнал демонстрации\n'+audit.join('\n')],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='honti-assistant-demo-log.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  reset();
})();
