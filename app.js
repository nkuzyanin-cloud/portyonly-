import * as C from './core.js';
import {openDB,readState,saveState} from './db.js';
const $=s=>document.querySelector(s),app=$('#app'),sheet=$('#sheet'),content=$('#sheet-content');
let recipes=[],byId=new Map(),state,screen='today',selected=C.dateKey(),week=C.monday(selected),query='',category='all',limit=24,shopTab='list',hideCovered=true,pickerContext=null,recipeView=null,lastFocus=null,pickQuery='',busy=false,saveQueue=Promise.resolve(),toastTimer;
let filters={time:'',calories:'',difficulty:'',favorites:false,quick:false,home:false,missing:'',recommend:''};
const mealDrafts=new Map();let lockedScrollY=0;
const icons={today:'home',week:'calendar',recipes:'chef',shopping:'cart'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico=(name)=>`<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const fmtDate=(key,options={day:'numeric',month:'long'})=>new Date(key+'T12:00:00').toLocaleDateString('ru-RU',options);
const num=n=>C.amount(n).toLocaleString('ru-RU');
const plural=(n,a,b,c)=>n%1!==0?b:n%100>=11&&n%100<=14?c:n%10===1?a:n%10>=2&&n%10<=4?b:c;
const portions=n=>`${num(n)} ${plural(n,'порция','порции','порций')}`;
const duration=n=>n<60?`${num(n)} мин`:`${Math.floor(n/60)} ч${n%60?' '+num(n%60)+' мин':''}`;
const recipeTime=r=>r.waitTime?`${duration(r.activeTime)} + ожидание` : duration(r.time);
const qty=i=>i.quantity===null?'по вкусу':`${num(i.quantity)} ${i.unit}`;
const img=(r,extra='')=>`<img src="./${esc(r.photo)}" alt="${esc(r.name)}" loading="lazy" decoding="async" ${extra}>`;
const badge=(text,type='',icon='')=>`<span class="badge ${type}">${icon?ico(icon):''}${esc(text)}</span>`;
const action=(a,text,cls='btn',data='',icon='')=>`<button class="${cls}" data-action="${a}" ${data}>${icon?ico(icon):''}${text}</button>`;
const empty=(icon,title,text,button='')=>`<div class="empty-box"><div class="empty-icon">${ico(icon)}</div><h3>${title}</h3><p>${text}</p>${button}</div>`;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3600);}
async function change(fn){const run=async()=>{busy=true;let previous;try{state=await readState();previous=structuredClone(state);fn(state);await saveState(state);channel?.postMessage({updatedAt:state.updatedAt});render();return true;}catch(e){if(previous)state=previous;const err=$('#form-error');if(err)err.textContent=e.message;toast(e.message||'Не удалось сохранить. Повторите действие.');return false;}finally{busy=false;}};const queued=saveQueue.then(()=>navigator.locks?navigator.locks.request('portionly-family-write',run):run());saveQueue=queued.catch(()=>{});return queued;}
function batchOf(e){return state.batches.find(b=>b.id===e.batchId);}
function rOf(id){return byId.get(id);}
function dateStrip(){const start=C.monday(selected);return `<div class="week-strip">${Array.from({length:7},(_,i)=>{const d=C.addDays(start,i);return action('select-date',`<small>${fmtDate(d,{weekday:'short'})}</small><strong>${new Date(d+'T12:00:00').getDate()}</strong>`,`date-btn ${d===selected?'active':''} ${d===C.dateKey()?'is-today':''}`,`data-date="${d}"`);}).join('')}</div>`;}
function readyCard(b){
 const r=rOf(b.recipeId),pending=state.plan.filter(e=>e.batchId===b.id&&!e.eatenAt),reserved=pending.reduce((s,e)=>s+e.portions,0);
 return '<article class="ready-card">'+action('recipe',img(r),'ready-photo','data-id="'+r.id+'" aria-label="Открыть '+esc(r.name)+'"')+
 '<div class="ready-info"><h3>'+esc(r.name)+'</h3><p class="remaining">Осталось '+portions(b.remaining)+'</p><p>По плану до '+fmtDate(b.endDate,{day:'numeric',month:'short'})+'</p><div class="stock-controls">'+
 action('batch-minus',ico('minus'),'','data-id="'+b.id+'" aria-label="Уменьшить остаток на одну порцию"')+'<span>'+num(b.remaining)+' / '+num(b.initial)+'</span>'+
 action('batch-plus',ico('plus'),'','data-id="'+b.id+'" aria-label="Увеличить остаток на одну порцию"')+'</div></div>'+
 action('batch',ico('more'),'icon-btn ready-more','data-id="'+b.id+'" aria-label="Изменить заготовку"')+'</article>';
}
function mealRows(date){return `<div class="meal-list">${Object.entries(C.MEALS).map(([key,title])=>{const entries=state.plan.filter(e=>e.date===date&&e.meal===key);return `<div class="meal-block"><div class="meal-label">${ico(key==='dinner'?'moon':'sun')} ${title} <span style="margin-left:auto">${action('pick',ico('plus'),'text-btn',`data-date="${date}" data-meal="${key}" aria-label="Добавить блюдо на ${title.toLowerCase()}"`)}</span></div>${entries.length?entries.map(e=>{const r=rOf(e.recipeId),b=batchOf(e),shortage=b&&b.remaining<e.portions&&!e.eatenAt;return `<div class="meal-row">${img(r)}${action('entry',`<strong>${esc(r.name)}</strong><small>${e.eatenAt?'Съели':b?(shortage?'Не хватает порций':'Из готовой еды'):'Нужно приготовить'} · ${portions(e.portions)}</small>`,'meal-main',`data-id="${e.id}"`)}${action(e.eatenAt||b&&!shortage?'eat':'entry',ico(e.eatenAt||b&&!shortage?'check':'arrow'),`round-check ${e.eatenAt?'checked':''}`,`data-id="${e.id}" aria-label="${e.eatenAt?'Отменить отметку съели':b&&!shortage?'Съели — списать порции':'Управлять приёмом пищи'}"`)}</div>`;}).join(''):`<div class="meal-row">${action('pick',`${ico('plus')} Выбрать ${title.toLowerCase()}`,'empty-meal',`data-date="${date}" data-meal="${key}"`)}</div>`}</div>`;}).join('')}</div>`;}
function todayPage(){
 const date=C.dateKey(),o=C.todayOverview(state,byId,date),ready=o.ready.length,pending=o.jobIds.size;
 const summary=[ready?'<span><i class="dot"></i>'+ready+' '+plural(ready,'блюдо готово','блюда готовы','блюд готовы')+'</span>':'',
 pending?'<span><i class="dot peach"></i>'+pending+' приготовить</span>':'',
 o.shortage.length?'<span class="today-warning">Проверить остатки · '+o.shortage.length+'</span>':'',
 o.completed.length?'<span><i class="dot neutral"></i>'+o.completed.length+' отмечено</span>':''].filter(Boolean).join('');
 const cards=Object.keys(C.MEALS).map(meal=>{const entries=o.entries.filter(e=>e.meal===meal);return entries.length?entries.map(e=>todayCard(e,o.shortage.some(p=>p.id===e.id))).join(''):'<div class="today-missing">'+action('pick',ico('plus')+'<span>Выбрать '+C.MEALS[meal].toLowerCase()+'</span>'+ico('arrow'),'today-task','data-date="'+date+'" data-meal="'+meal+'"')+'</div>';}).join('');
 const batches=state.batches.filter(b=>b.remaining>0).length;
 return (summary?'<div class="today-summary" aria-label="Состояние еды на сегодня">'+summary+'</div>':'')+
 '<section class="today-plan group-panel"><div class="section-head"><h2>Еда на сегодня</h2></div><div class="today-cards">'+cards+
 '</div></section>'+
 '<div class="today-links">'+
 (o.shopping.length?action('today-shopping','<span class="task-icon peach">'+ico('cart')+'</span><span>Докупить на сегодня</span><small>'+o.shopping.length+' '+plural(o.shopping.length,'продукт','продукта','продуктов')+'</small>'+ico('arrow'),'today-task shopping-task'):'')+
 action('all-batches','<span class="task-icon">'+ico('pot')+'</span><span>Готовая еда дома</span><small>'+batches+' '+plural(batches,'блюдо','блюда','блюд')+'</small>'+ico('arrow'),'today-task')+
 action('nav','<span class="task-icon">'+ico('calendar')+'</span><span>Открыть недельный план</span>'+ico('arrow'),'today-task','data-screen="week"')+'</div>';
}
function mealAmount(e){const b=batchOf(e);return b?C.amount(Math.max(.01,Math.min(b.remaining,mealDrafts.get(e.id)??e.portions))):e.portions;}
function todayCard(e,shortage=false){
 const r=rOf(e.recipeId),b=batchOf(e),job=state.jobs.find(j=>j.id===e.jobId),short=shortage||b&&!e.eatenAt&&b.remaining<e.portions,amount=mealAmount(e);
 const meta=e.eatenAt?'Съели · '+portions(e.portions):b?(short?'Не хватает порций · осталось ':'Готово · осталось ')+portions(b.remaining):recipeTime(r)+' · '+portions(e.portions)+' сегодня';
 let control;
 if(e.eatenAt)control='<span class="today-done">'+ico('check')+' Отмечено</span>'+action('eat','Отменить','text-btn','data-id="'+e.id+'" aria-label="Отменить съеденные порции"');
 else if(short)control='<span class="today-warning">Нужно '+portions(e.portions)+'</span>'+action('entry','Проверить','btn outline','data-id="'+e.id+'"');
 else if(b)control='<div class="today-amount"><span>Съели</span><div class="today-stepper">'+
 action('today-step',ico('minus'),'','data-id="'+e.id+'" data-step="-1" '+(amount<=.25?'disabled':'')+' aria-label="Меньше съеденных порций"')+
 '<output data-meal-amount="'+e.id+'">'+num(amount)+'</output>'+
 action('today-step',ico('plus'),'','data-id="'+e.id+'" data-step="1" '+(amount>=b.remaining?'disabled':'')+' aria-label="Больше съеденных порций"')+
 '</div></div>'+action('today-consume',ico('check'),'btn today-confirm','data-id="'+e.id+'" aria-label="Подтвердить: съели '+portions(amount)+'"');
 else control=action('entry-cook','Приготовить','btn today-cook','data-id="'+e.id+'"');
 return '<article class="today-card '+(e.eatenAt?'completed':b&&!short?'is-ready':'is-planned')+'" data-entry="'+e.id+'">'+
 '<div class="today-card-heading"><span>'+C.MEALS[e.meal]+'</span>'+action('entry',ico('more'),'today-arrow','data-id="'+e.id+'" aria-label="Управлять блюдом"')+'</div>'+
 '<div class="today-card-top">'+action('recipe',img(r),'today-photo','data-id="'+r.id+'" aria-label="Открыть рецепт '+esc(r.name)+'"')+
 action('entry','<h3>'+esc(r.name)+'</h3><small class="'+(b&&!e.eatenAt&&!short?'ready-meta':'')+'">'+esc(meta)+'</small>'+
 (!b&&!e.eatenAt?'<small class="today-party">Партия: '+portions(job?.portions||e.portions)+(job?.days>1?' на '+job.days+' '+plural(job.days,'день','дня','дней'):'')+'</small>':''),'today-card-copy','data-id="'+e.id+'"')+
 '</div><div class="today-card-bottom">'+control+'</div></article>';
}
function weekBoard(){
 const dates=Array.from({length:7},(_,i)=>C.addDays(week,i));
 const rows=Object.entries(C.MEALS).map(([meal,name])=>{
  let cells='';
  for(let i=0;i<7;i++){
   const es=state.plan.filter(e=>e.date===dates[i]&&e.meal===meal),e=es[0];let run=1;
   if(e&&es.length===1&&!e.eatenAt){const key=e.batchId||e.jobId;while(i+run<7){const next=state.plan.filter(e=>e.date===dates[i+run]&&e.meal===meal);if(next.length===1&&(next[0].batchId||next[0].jobId)===key&&!next[0].eatenAt)run++;else break;}}
   const label=`${name}, ${fmtDate(dates[i])}${e?', '+rOf(e.recipeId).name+', '+portions(e.portions):', добавить блюдо'}`;
   if(e&&run>1){
    const r=rOf(e.recipeId),b=batchOf(e),summary=b?`${portions(b.remaining)} · до ${fmtDate(b.endDate,{day:'numeric',month:'short'})}`:`${run} ${plural(run,'день','дня','дней')} · ${num(e.portions)} п./день`;
    cells+=action('day-focus',`${img(r)}<span class="week-span-copy"><b>${esc(r.name)}</b><small>${esc(summary)}</small></span><small class="week-span-short">${run} ${plural(run,'день','дня','дней')}</small>${run>=4?ico('arrow'):''}`,`week-span span-${run} ${b?'ready':'planned'}`,`style="grid-column:span ${run}" data-date="${dates[i]}" data-meal="${meal}" data-id="${e.id}" aria-label="${esc(label)}, ${run} дней"`);i+=run-1;
   }else cells+=action('day-focus',e?`${img(rOf(e.recipeId))}<small>${e.eatenAt?'✓':num(e.portions)+' п.'}${es.length>1?' +'+(es.length-1):''}</small>`:ico('plus'),`week-cell ${e?(e.batchId?'ready':'planned'):''}`,`data-date="${dates[i]}" data-meal="${meal}" ${e?`data-id="${e.id}"`:''} aria-label="${esc(label)}"`);
  }
  return `<div class="week-row"><div class="week-label">${ico(meal==='dinner'?'moon':'sun')}<span>${name}</span></div>${cells}</div>`;
 }).join('');
 return `<div class="week-board"><div class="week-grid"><div></div>${dates.map(d=>action('select-date',`${fmtDate(d,{weekday:'short'})}<b>${new Date(d+'T12:00:00').getDate()}</b>`,`day-head ${d===selected?'active':''} ${d===C.dateKey()?'is-today':''}`,`data-date="${d}" aria-label="${esc(fmtDate(d,{weekday:'long',day:'numeric',month:'long'}))}"`)).join('')}</div>${rows}<div class="legend"><span><i class="dot"></i> Готово дома</span><span><i class="dot peach"></i> Приготовить</span></div></div>`;
}
function weekPage(){
 const bs=state.batches.filter(b=>b.remaining>0&&b.endDate>=week).sort((a,b)=>a.endDate.localeCompare(b.endDate));
 return `${weekBoard()}<section class="section week-prep"><div class="section-head"><h2>Готовая еда</h2>${action('all-batches',`Все ${ico('arrow')}`,'text-btn')}</div><div class="week-ready-list">${bs.slice(0,4).map(weekReadyCard).join('')}</div>${!bs.length?`<p class="week-empty">Здесь появится готовая еда и остаток порций.</p>`:''}</section>${action('pick',`${ico('plus')} Добавить блюдо`,'btn secondary full week-add',`data-date="${selected}" data-meal="lunch"`)}`;
}
function weekReadyCard(b){
 const r=rOf(b.recipeId),ratio=Math.min(100,100*b.remaining/b.initial);
 return '<article class="week-ready-card">'+action('recipe',img(r),'week-ready-photo','data-id="'+r.id+'" aria-label="'+esc(r.name)+'"')+
 action('batch','<b>'+esc(r.name)+'</b><small>'+num(b.remaining)+' / '+num(b.initial)+' '+plural(b.initial,'порция','порции','порций')+'</small><div class="progress-track"><span style="width:'+ratio+'%"></span></div>','week-ready-copy','data-id="'+b.id+'"')+
 action('batch','<span>До '+fmtDate(b.endDate,{day:'numeric',month:'short'})+'</span>'+ico('arrow'),'week-ready-arrow','data-id="'+b.id+'" aria-label="Изменить остаток '+esc(r.name)+'"')+'</article>';
}
function filterList(list=recipes,q=query,cat=category,apply=true){q=q.toLocaleLowerCase('ru').trim().replace(/ё/g,'е');return list.filter(r=>{if(cat!=='all'&&r.category!==cat)return false;if(q&&!r.search.includes(q))return false;if(!apply)return true;const missing=C.missingCount(r,state);return (!filters.time||r.time<=Number(filters.time))&&(!filters.calories||r.nutrition.calories<=Number(filters.calories))&&(!filters.difficulty||r.difficulty===filters.difficulty)&&(!filters.favorites||state.favorites.includes(r.id))&&(!filters.quick||r.time<=30)&&(!filters.home||missing===0)&&(!filters.missing||missing<=Number(filters.missing))&&(!filters.recommend||filters.recommend==='fast-breakfast'&&r.category==='breakfast'&&r.time<=20||filters.recommend==='fast-dinner'&&r.category==='dinner'&&r.time<=30||filters.recommend==='light'&&r.nutrition.calories<=400||filters.recommend==='near-home'&&missing<=3);}).sort((a,b)=>filters.recommend==='near-home'?C.missingCount(a,state)-C.missingCount(b,state):0);}
function recipeCard(r){return `<article class="recipe-card">${action('favorite',ico('heart'),`favorite ${state.favorites.includes(r.id)?'selected':''}`,`data-id="${r.id}" aria-label="${state.favorites.includes(r.id)?'Убрать из':'Добавить в'} избранное: ${esc(r.name)}" aria-pressed="${state.favorites.includes(r.id)}"`)}${action('recipe',`<div class="photo-wrap">${img(r,'width="360" height="300"')}</div><div class="card-copy"><h3>${esc(r.name)}</h3><div class="card-meta"><span>${recipeTime(r)}</span><span>· ~${r.nutrition.calories} ккал</span></div><div class="card-tags">${r.tags.slice(0,2).map(t=>`<span>${esc(t)}</span>`).join('')}</div></div>`,'open-card',`data-id="${r.id}"`)}</article>`;}
function activeFilters(){return Object.entries(filters).filter(([k,v])=>v).length;}
function recipesPage(){
 const results=filterList();
 return '<div class="search-tools"><label class="searchbar">'+ico('search')+'<input id="catalog-search" type="search" placeholder="Название или ингредиент" aria-label="Поиск по блюдам и ингредиентам" value="'+esc(query)+'"></label></div>'+
 '<div class="category-tabs">'+[['all','Все'],...Object.entries(C.CATEGORIES)].map(([id,name])=>action('category',esc(name),'chip '+(category===id?'active':''),'data-category="'+id+'"')).join('')+'</div>'+
 '<div class="catalog-toolbar">'+action('filters',ico('filter')+' Фильтры'+(activeFilters()?'<span class="filter-count">'+activeFilters()+'</span>':''),'btn outline','aria-label="Фильтры блюд"')+
 action('favorites-filter',ico('heart')+' Избранное','btn outline '+(filters.favorites?'active':''),'aria-pressed="'+filters.favorites+'"')+'</div>'+
 '<div class="catalog-quick">'+[['quick','До 30 мин','clock'],['home','Есть дома','home'],['missing','Недостаёт ≤ 2','basket']].map(([key,label,icon])=>action('quick-filter',ico(icon)+label,'chip '+((key==='missing'?filters.missing==='2':filters[key])?'active-soft':''),'data-filter="'+key+'" aria-pressed="'+!!(key==='missing'?filters.missing==='2':filters[key])+'"')).join('')+'</div>'+
 '<div class="catalog-info"><span id="result-count">'+results.length+' '+plural(results.length,'блюдо','блюда','блюд')+'</span></div>'+
 '<div id="recipe-grid" class="recipe-grid">'+(results.length?results.slice(0,limit).map(recipeCard).join(''):empty('search','Ничего не нашлось','Измените запрос или фильтры.',action('clear-filters','Сбросить фильтры','btn outline')))+'</div>'+
 '<div id="load-container">'+(results.length>limit?action('load-more','Показать ещё · '+(results.length-limit),'btn secondary full load-more'):'')+'</div>';
}
function updateCatalog(){const results=filterList();$('#recipe-grid').innerHTML=results.length?results.slice(0,limit).map(recipeCard).join(''):empty('search','Ничего не нашлось','Измените запрос или фильтры.',action('clear-filters','Сбросить фильтры','btn outline'));$('#result-count').textContent=`${results.length} ${plural(results.length,'блюдо','блюда','блюд')}`;$('#load-container').innerHTML=results.length>limit?action('load-more',`Показать ещё · ${results.length-limit}`,'btn secondary full load-more'):'';}
const groupIcons=['carrot','apple','bottle','meat','fish','wheat','jar','basket'];
function shoppingPage(){
 const all=C.shopping(state,byId),pending=all.filter(i=>!i.covered),rows=hideCovered?pending:all;
 const ingredientMap=new Map(recipes.flatMap(r=>r.ingredients).map(i=>[C.ingredientKey(i),i]));
 const pantry=Object.entries(state.pantry).map(([key,s])=>{const i=ingredientMap.get(key);return i?{...i,key,...s}:null;}).filter(Boolean);
 const tabs='<div class="shop-tabs">'+action('shop-tab','Купить',shopTab==='list'?'active':'','data-tab="list"')+action('shop-tab','Есть дома · '+pantry.length,shopTab==='home'?'active':'','data-tab="home"')+'</div>';
 if(shopTab==='home')return tabs+
 (pantry.length?'<div class="shop-group pantry-group">'+pantry.sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(i=>'<div class="pantry-row"><div><b>'+esc(i.name)+'</b><small>'+qty(i)+'</small></div>'+action('stock-edit',ico('filter'),'icon-btn','data-key="'+esc(i.key)+'" aria-label="Изменить запас '+esc(i.name)+'"')+'</div>').join('')+'</div>':empty('leaf','Продуктов дома пока нет','Добавьте продукты или отметьте их в рецепте.'))+
 action('pantry-add',ico('plus')+' Добавить продукт дома','btn outline full');
 const groups=C.GROUPS.map(group=>{
  const items=rows.filter(i=>i.group===group);if(!items.length)return '';
  return '<section class="shop-group"><h3>'+esc(group)+'<span>'+items.length+'</span></h3>'+items.map(i=>{
   const label=i.manual?'Удалить продукт':i.covered?(i.status==='bought'?'Куплено · изменить':'Есть дома · изменить'):'Есть дома';
   return '<div class="shopping-row '+(i.covered?'covered':'')+'"><label><input type="checkbox" data-shopping-check="'+esc(i.key)+'" '+(i.covered?'checked':'')+' aria-label="Куплено: '+esc(i.name)+'"><span class="item-name">'+esc(i.name)+'</span></label><span class="qty">'+qty({...i,quantity:i.covered?i.quantity:i.needed})+'</span>'+
   action(i.manual?'manual-remove':'stock-mark',ico(i.manual?'trash':'home'),'stock-link '+(i.covered?'is-home':''),'data-key="'+esc(i.key)+'" aria-label="'+esc(label+': '+i.name)+'" title="'+esc(label)+'"')+'</div>';
  }).join('')+'</section>';
 }).join('');
 return tabs+'<div class="shop-toolbar"><label class="toggle-label"><input type="checkbox" id="hide-covered" '+(hideCovered?'checked':'')+'> Скрыть отмеченные</label></div>'+
 (rows.length?'<div class="shopping-groups">'+groups+'</div>':empty('cart',all.length?'Всё уже есть':'Список пока пуст',all.length?'Выключите скрытие, чтобы увидеть весь список.':'Добавьте блюдо в план или продукт вручную.',action('nav','Выбрать блюда','btn outline','data-screen="recipes"')))+
 '<div class="shop-actions">'+action('copy',ico('copy')+' Скопировать список','btn')+action('share',ico('share'),'icon-btn','aria-label="Поделиться списком"')+'</div>'+
 action('manual-add',ico('plus')+' Добавить продукт','btn outline full');
}
function render(){
 if(!state)return;
 const title={today:'Сегодня',week:'Неделя',recipes:'Блюда',shopping:'Покупки'}[screen];
 const subtitle=screen==='today'?fmtDate(C.dateKey(),{weekday:'long',day:'numeric',month:'long'}):screen==='week'?fmtDate(week,{day:'numeric',month:'short'})+' — '+fmtDate(C.addDays(week,6),{day:'numeric',month:'short'}):screen==='recipes'?recipes.length+' рецептов':C.shopping(state,byId).filter(i=>!i.covered).length+' '+plural(C.shopping(state,byId).filter(i=>!i.covered).length,'продукт','продукта','продуктов');
 const tools=screen==='week'?action('week-prev',ico('back'),'icon-btn','aria-label="Предыдущая неделя"')+action('week-next',ico('arrow'),'icon-btn','aria-label="Следующая неделя"')+action('pick',ico('plus'),'icon-btn week-top-add','data-date="'+selected+'" data-meal="lunch" aria-label="Добавить блюдо"'):screen==='shopping'?action(shopTab==='home'?'pantry-add':'manual-add',ico('plus'),'icon-btn','aria-label="Добавить продукт"')+action('settings',ico('more'),'icon-btn','aria-label="Настройки"'):action('settings',ico('settings'),'icon-btn','aria-label="Настройки"');
 app.innerHTML='<div class="app-shell"><header class="topbar"><div><h1>'+title+'</h1><p class="subtitle">'+(screen==='week'?action('go-today',subtitle,'week-date-range','aria-label="Перейти к текущей неделе"'):subtitle)+'</p></div><div class="topbar-actions">'+tools+'</div></header><main class="screen">'+({today:todayPage,week:weekPage,recipes:recipesPage,shopping:shoppingPage})[screen]()+'</main></div>'+
 '<nav class="bottom-nav" aria-label="Основная навигация">'+[['today','Сегодня'],['week','Неделя'],['recipes','Блюда'],['shopping','Покупки']].map(([id,name])=>action('nav','<span class="nav-icon">'+ico(icons[id])+'</span>'+name,'nav-btn '+(screen===id?'active':''),'data-screen="'+id+'" '+(screen===id?'aria-current="page"':''))).join('')+'</nav>';
}
function openSheet(html,mode=''){
 sheet.classList.toggle('recipe-sheet',mode==='recipe');sheet.setAttribute('aria-label',mode==='recipe'?'Рецепт блюда':'Действия');
 if(!sheet.open){lastFocus=document.activeElement;lockedScrollY=window.scrollY;document.body.classList.add('modal-open');document.body.style.top=`-${lockedScrollY}px`;sheet.showModal();}
 content.innerHTML=`<div class="sheet-inner"><div class="sheet-grip"></div>${html}</div>`;sheet.scrollTop=0;sheet.scrollLeft=0;
 const heading=content.querySelector(mode==='recipe'?'.recipe-title':'.sheet-top h2');heading?.focus({preventScroll:true});
}
function closeSheet(){
 const wasOpen=sheet.open;sheet.close();document.body.classList.remove('modal-open');document.body.style.top='';
 if(wasOpen)window.scrollTo(0,lockedScrollY);recipeView=null;pickerContext=null;lastFocus?.focus?.({preventScroll:true});
}
const sheetTop=(title)=>`<div class="sheet-top"><h2 tabindex="-1">${title}</h2>${action('close',ico('close'),'icon-btn','aria-label="Закрыть"')}</div>`;
const formStepper=(name,value,min,max,step=1)=>`<div class="form-stepper">${action('form-step',ico('minus'),' ',`data-field="${name}" data-step="-${step}" aria-label="Уменьшить значение"`)}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required aria-label="${{portions:'Порции',days:'Дни',remaining:'Оставшиеся порции'}[name]}">${action('form-step',ico('plus'),' ',`data-field="${name}" data-step="${step}" aria-label="Увеличить значение"`)}</div>`;
const mealSegments=meal=>`<div class="meal-segments" role="group" aria-label="Приём пищи">${Object.entries(C.MEALS).map(([id,name])=>`<label><input type="radio" name="meal" value="${id}" ${id===meal?'checked':''} required><span>${name}</span></label>`).join('')}</div>`;
function showRecipe(id){const r=rOf(id);if(!r)return;recipeView={id,portions:r.servings,days:1};paintRecipe();}
function stepper(key,value,min=1,max=100){return `<div class="stepper">${action('step',ico('minus'),' ',`data-key="${key}" data-step="-1" ${value<=min?'disabled':''} aria-label="Уменьшить ${key==='portions'?'порции':'дни'}"`)}<output id="${key}-value">${value}</output>${action('step',ico('plus'),' ',`data-key="${key}" data-step="1" ${value>=max?'disabled':''} aria-label="Увеличить ${key==='portions'?'порции':'дни'}"`)}</div>`;}
function ingredientRows(r){return C.scaledIngredients(r,recipeView.portions).map(i=>{const key=C.ingredientKey(i),stock=state.pantry[key],home=i.id==='water'||!!stock&&(i.quantity===null||stock.quantity>=i.quantity);return `<div class="ingredient-row"><span class="ingredient-name">${esc(i.name)}${i.note?`<small>${esc(i.note)}</small>`:''}</span><span class="qty">${qty(i)}</span>${action('ingredient-toggle',`<span class="ingredient-check">${home?ico('check'):''}</span><span class="ingredient-status">${home?'Есть дома':'Купить'}</span>`,`ingredient-toggle ${home?'home':''}`,`data-key="${esc(key)}" data-quantity="${i.quantity===null?'taste':i.quantity}" aria-pressed="${home}" ${i.id==='water'?'disabled':''} aria-label="${esc(i.name)}: ${home?'есть дома':'нужно купить'}"`)}</div>`;}).join('');}
function paintRecipe(){
 const r=rOf(recipeView.id),fav=state.favorites.includes(r.id);
 openSheet('<header class="recipe-toolbar">'+action('close',ico('back')+'<span>Блюда</span>','recipe-back','aria-label="Назад к блюдам"')+
 action('favorite',ico('heart'),'icon-btn favorite '+(fav?'selected':''),'data-id="'+r.id+'" aria-label="Избранное" aria-pressed="'+fav+'"')+'</header>'+
 '<div class="recipe-overview"><div class="sheet-hero">'+img(r,'fetchpriority="high"')+'</div><div class="recipe-heading"><h1 class="recipe-title" tabindex="-1">'+esc(r.name)+'</h1><p class="description">'+esc(r.description)+'</p><div class="recipe-chips"><span>'+C.CATEGORIES[r.category]+'</span><span>'+({easy:'Просто',medium:'Средняя',hard:'Сложно'}[r.difficulty])+'</span></div></div></div>'+
 '<div class="meta-line"><span>'+ico('clock')+recipeTime(r)+(r.waitTime?' · всего '+duration(r.time):'')+'</span><span>'+ico('flame')+'≈ '+num(r.nutrition.calories)+' ккал</span></div>'+
 '<div class="controls-row group-panel"><div><div class="stepper-label">Порции</div>'+stepper('portions',recipeView.portions)+'</div><div><div class="stepper-label">Дни</div>'+stepper('days',recipeView.days,1,14)+'</div></div>'+
 '<section class="section recipe-nutrition group-panel"><div class="section-head"><h3>На порцию ≈</h3></div><div class="nutrition">'+[['calories','ккал'],['protein','г белка'],['fat','г жиров'],['carbs','г углеводов']].map(([key,label])=>'<div><b>'+num(r.nutrition[key])+'</b><small>'+label+'</small></div>').join('')+'</div></section>'+
 '<section class="section recipe-ingredients group-panel"><div class="section-head"><h3>Ингредиенты</h3><small>на '+portions(recipeView.portions)+'</small></div><div class="ingredient-list">'+ingredientRows(r)+'</div></section>'+
 '<section class="section recipe-method group-panel"><h3>Приготовление</h3><ol class="steps">'+r.steps.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol></section>'+
 '<footer class="recipe-footer">'+action('recipe-cook',ico('pot')+' Приготовить','btn outline')+action('recipe-plan',ico('calendar')+' В план','btn')+'</footer>','recipe');
}
function showPick(ctx={}){pickerContext={date:ctx.date||(screen==='today'?C.dateKey():selected),meal:ctx.meal||'lunch',mode:ctx.mode||'plan',replaceId:ctx.replaceId||null};pickQuery='';paintPick();}
function quickPick(r){return action('pick-recipe',`${img(r)}<span><b>${esc(r.name)}</b><small>${recipeTime(r)} · ${portions(r.servings)}</small></span>`,'quick-pick',`data-id="${r.id}"`);}
function pickResults(){const preferred=pickerContext.meal;const all=filterList(recipes,pickQuery,'all',false).sort((a,b)=>(b.category===preferred)-(a.category===preferred));return all.slice(0,pickQuery?50:25).map(quickPick).join('')||'<p class="muted">Ничего не найдено.</p>';}
function paintPick(){const ready=state.batches.filter(b=>b.remaining>0);openSheet(`${sheetTop(pickerContext.mode==='cook'?'Уже приготовили?':'Выбрать блюдо')}<label class="searchbar">${ico('search')}<input id="pick-search" type="search" placeholder="Найти блюдо или ингредиент" aria-label="Поиск блюда" value="${esc(pickQuery)}"></label>${pickerContext.mode==='plan'&&ready.length?`<section class="section"><h3>Использовать готовую еду</h3>${ready.map(b=>action('pick-batch',`${img(rOf(b.recipeId))}<span><b>${esc(rOf(b.recipeId).name)}</b><small>${portions(b.remaining)} осталось · до ${fmtDate(b.endDate)}</small></span>`,'quick-pick',`data-id="${b.id}"`)).join('')}</section>`:''}<section class="section"><h3>Приготовить новое</h3><div id="pick-list" class="pick-list">${pickResults()}</div></section>`);}
function showPlan(id,values={},ctx={}){
 const r=rOf(id),batch=values.batchId?state.batches.find(b=>b.id===values.batchId):null,p=values.portions||Math.min(batch?.remaining||100,r.servings),days=values.days||1;
 recipeView=null;pickerContext={...ctx,recipeId:id,batchId:batch?.id||null};
 openSheet(`${sheetTop(batch?'Из готовой еды':'Добавить в план')}<div class="quick-pick sheet-recipe-summary">${img(r)}<span><b>${esc(r.name)}</b><small>${batch?`Осталось ${portionsText(batch.remaining)}` :recipeTime(r)}</small></span></div><form id="plan-form" class="compact-form"><label class="form-field inline-field"><span>Первый день</span><input name="date" type="date" value="${ctx.date||(screen==='today'?C.dateKey():selected)}" required></label><div class="form-field"><span>Приём пищи</span>${mealSegments(ctx.meal||mealFor(r))}</div><div class="form-row stepper-fields"><label class="form-field"><span>${batch?'Всего порций':'Порции на всю партию'}</span>${formStepper('portions',p,.25,100,.25)}</label><label class="form-field"><span>На сколько дней</span>${formStepper('days',days,1,14)}</label></div><p id="plan-preview" class="notice"></p><div class="form-error" id="form-error" role="alert"></div><button type="submit" class="btn full">${ctx.replaceId?'Заменить блюдо':'Добавить в план'}</button></form>`);updatePlanPreview();
}
const portionsText=portions;
const mealFor=r=>r.category==='breakfast'?'breakfast':r.category==='dinner'?'dinner':'lunch';
function updatePlanPreview(){const f=$('#plan-form');if(!f)return;const p=Number(f.portions.value),days=Number(f.days.value),date=f.date.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(days)||days<1||days>14||!Number.isFinite(p)||p<=0){$('#plan-preview').textContent='Укажите дату, порции и дни.';return;}const end=C.addDays(date,days-1),range=days===1?fmtDate(date,{day:'numeric',month:'short'}):`${fmtDate(date,{day:'numeric',month:'short'})} — ${fmtDate(end,{day:'numeric',month:'short'})}`;$('#plan-preview').innerHTML=`<b>${portions(p)} · ${range}</b><span>≈ ${portions(p/days)} на приём${pickerContext.batchId?' · из готовой еды':''}</span>`;}
function showCook(id,values={}){
 const r=rOf(id),job=values.jobId?state.jobs.find(j=>j.id===values.jobId):null;recipeView=null;pickerContext={recipeId:id,jobId:job?.id||null,cookPortions:job?.portions||values.portions||r.servings};
 openSheet(`${sheetTop('Блюдо приготовлено')}<div class="quick-pick sheet-recipe-summary">${img(r)}<span><b>${esc(r.name)}</b><small>${recipeTime(r)}</small></span></div><form id="cook-form" class="compact-form"><label class="form-field inline-field"><span>Приготовлено</span><input name="date" type="date" value="${C.dateKey()}" required></label><div class="form-row stepper-fields"><label class="form-field"><span>Получилось порций</span>${formStepper('portions',pickerContext.cookPortions,.25,100,.25)}</label><label class="form-field"><span>На сколько дней</span>${formStepper('days',job?.days||values.days||1,1,14)}</label></div><div class="form-error" id="form-error" role="alert"></div><button type="submit" class="btn full">Сохранить готовую еду</button></form>`);
}
function showEntry(id){const e=state.plan.find(e=>e.id===id);if(!e)return;const r=rOf(e.recipeId),b=batchOf(e);openSheet(`${sheetTop(C.MEALS[e.meal])}<div class="quick-pick">${img(r)}<span><b>${esc(r.name)}</b><small>${fmtDate(e.date)} · ${portions(e.portions)}</small></span></div>${b?`<div class="batch-summary"><p>Из заготовки от ${fmtDate(b.cookedAt)}</p><strong>${num(b.remaining)} <small>порций осталось</small></strong></div>`:`<p class="notice peach">Нужно приготовить ${portions(state.jobs.find(j=>j.id===e.jobId)?.portions||e.portions)} для этой партии.</p>`}<div class="action-menu">${b?action('entry-eat',`${ico('check')} ${e.eatenAt?'Отменить «Съели»':'Съели · списать '+portions(e.portions)}`,'btn',`data-id="${id}"`):action('entry-cook',`${ico('pot')} Отметить приготовленным`,'btn',`data-id="${id}"`)}${!e.eatenAt?action('entry-move',`${ico('calendar')} Перенести / изменить порции`,'btn secondary',`data-id="${id}"`)+action('entry-replace',`${ico('chef')} Заменить блюдо`,'btn secondary',`data-id="${id}"`):''}${!e.eatenAt&&state.batches.some(x=>x.recipeId===r.id&&x.remaining>0&&x.id!==e.batchId)?action('entry-rebind','Использовать другую готовую партию','btn outline',`data-id="${id}"`):''}${action('recipe',`Открыть рецепт`,'btn outline',`data-id="${r.id}"`)}${action('entry-delete',`${ico('trash')} Удалить из плана`,'btn danger',`data-id="${id}"`)}${e.jobId&&state.plan.filter(p=>p.jobId===e.jobId).length>1?action('job-delete','Удалить всю партию из плана','btn danger',`data-id="${e.jobId}"`):''}</div>`);}
function showMove(id){const e=state.plan.find(e=>e.id===id);pickerContext={entryId:id};openSheet(`${sheetTop('Изменить приём пищи')}<form id="move-form"><label class="form-field"><span>Дата</span><input name="date" type="date" value="${e.date}" required></label><label class="form-field"><span>Приём пищи</span><select name="meal">${Object.entries(C.MEALS).map(([m,t])=>`<option value="${m}" ${m===e.meal?'selected':''}>${t}</option>`).join('')}</select></label><label class="form-field"><span>Порций в этот день</span><input name="portions" type="number" min="0.25" max="100" step="0.01" value="${e.portions}" required></label><div class="form-error" id="form-error" role="alert"></div><button class="btn full" type="submit">Сохранить</button></form>`);}
function showBatch(id){
 const b=state.batches.find(b=>b.id===id);if(!b)return;
 const r=rOf(b.recipeId),es=state.plan.filter(e=>e.batchId===id),pending=es.filter(e=>!e.eatenAt).reduce((n,e)=>n+e.portions,0);pickerContext={batchId:id};
 openSheet(`${sheetTop('Готовая еда')}<div class="quick-pick sheet-recipe-summary">${img(r)}<span><b>${esc(r.name)}</b><small>${fmtDate(b.cookedAt,{day:'numeric',month:'short'})} · приготовлено ${portions(b.initial)}</small></span></div><div class="batch-summary compact-batch"><div class="batch-numbers"><strong>${num(b.remaining)} <small>из ${num(b.initial)} порций</small></strong><span>${Math.round(b.remaining/b.initial*100)}%</span></div><div class="progress-track"><span style="width:${Math.min(100,b.remaining/b.initial*100)}%"></span></div><p>В плане ${num(pending)} · ${pending>b.remaining?'не хватает '+portions(pending-b.remaining):'свободно '+portions(b.remaining-pending)}</p></div><form id="batch-form" class="compact-form"><div class="inline-field form-field"><span>Осталось порций</span>${formStepper('remaining',b.remaining,0,100,.25)}</div><label class="form-field inline-field"><span>По плану до</span><input name="endDate" type="date" value="${b.endDate}" required></label>${es.length?`<section class="batch-plan-links"><h3>Связь с планом</h3>${es.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<div class="batch-connection"><span>${fmtDate(e.date,{day:'numeric',month:'short'})} · ${C.MEALS[e.meal]}</span><span>${portions(e.portions)} ${e.eatenAt?'✓':''}</span></div>`).join('')}</section>`:''}<div class="form-error" id="form-error" role="alert"></div><button type="submit" class="btn full">Сохранить остаток</button></form><div class="batch-secondary-actions">${action('batch-plan','Добавить в план','text-btn',`data-id="${id}" ${b.remaining===0?'disabled':''}`)}${action('batch-discard','Убрать остаток','text-btn danger-link',`data-id="${id}" ${b.remaining===0?'disabled':''}`)}</div>`);
}
function showAllBatches(){const active=state.batches.filter(b=>b.remaining>0),done=state.batches.filter(b=>!b.remaining);openSheet(`${sheetTop('Приготовлено дома')}<div class="ready-list">${active.map(readyCard).join('')}</div>${!active.length?'<p class="muted">Готовой еды пока нет.</p>':''}${action('pick','Добавить готовую еду','btn full','data-mode="cook" style="margin-top:18px"')}${done.length?`<section class="section"><h3>История приготовления</h3><div class="history-batches">${done.sort((a,b)=>b.cookedAt.localeCompare(a.cookedAt)).slice(0,40).map(b=>action('batch',`${img(rOf(b.recipeId))}<span><b>${esc(rOf(b.recipeId).name)}</b><small>${fmtDate(b.cookedAt)} · ${portions(b.initial)} · закончилась</small></span>`,'quick-pick',`data-id="${b.id}"`)).join('')}</div></section>`:''}`);}
function showFilters(){openSheet(`${sheetTop('Фильтры')}<form id="filter-form"><div class="filter-grid"><label class="form-field"><span>Время приготовления</span><select name="time">${[['','Любое'],['15','До 15 минут'],['30','До 30 минут'],['60','До 1 часа'],['90','До 1,5 часа']].map(([v,t])=>`<option value="${v}" ${filters.time===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="form-field"><span>Калорийность / порция</span><select name="calories">${[['','Любая'],['300','До 300 ккал'],['400','До 400 ккал'],['600','До 600 ккал']].map(([v,t])=>`<option value="${v}" ${filters.calories===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="form-field"><span>Сложность</span><select name="difficulty">${[['','Любая'],['easy','Просто'],['medium','Средняя'],['hard','Сложно']].map(([v,t])=>`<option value="${v}" ${filters.difficulty===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="form-field"><span>Недостающих продуктов</span><select name="missing">${[['','Не ограничено'],['1','Не больше 1'],['2','Не больше 2'],['3','Не больше 3']].map(([v,t])=>`<option value="${v}" ${filters.missing===v?'selected':''}>${t}</option>`).join('')}</select></label></div><div class="form-field"><span>Подборки</span><select name="recommend">${[['','Все блюда'],['fast-breakfast','Быстрый завтрак'],['fast-dinner','Ужин до 30 минут'],['light','Лёгкое блюдо'],['near-home','Меньше покупок']].map(([v,t])=>`<option value="${v}" ${filters.recommend===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="filter-flags">${[['favorites','Только избранное'],['quick','Быстрые · до 30 минут'],['home','Из имеющихся продуктов']].map(([k,t])=>`<label><input type="checkbox" name="${k}" ${filters[k]?'checked':''}> ${t}</label>`).join('')}</div><div class="actions">${action('clear-filters','Сбросить','btn secondary')}<button type="submit" class="btn">Применить</button></div></form>`);}
function showStock(key){const row=C.shopping(state,byId).find(i=>i.key===key);const i=row||recipes.flatMap(r=>r.ingredients).find(i=>C.ingredientKey(i)===key);if(!i)return;pickerContext={stockKey:key,ingredient:i};openSheet(`${sheetTop('Продукт дома')}<h3>${esc(i.name)}</h3><form id="stock-form"><label class="form-field"><span>Сколько есть · ${i.quantity===null?'по вкусу':esc(i.unit)}</span><input name="quantity" type="number" min="0" max="1000000" step="0.01" value="${state.pantry[key]?.quantity||(row?.quantity??i.quantity)||1}" required></label><p class="notice">Для текущего плана нужно ${qty(i)}. Сохраните реальный запас или поставьте 0, если продукта нет.</p><div class="form-error" id="form-error" role="alert"></div><div class="actions">${action('stock-zero','Нет дома','btn secondary',`data-key="${esc(key)}"`)}<button type="submit" class="btn">Есть дома</button></div></form>`);}
function showPantryAdd(){const ingredients=[...new Map(recipes.flatMap(r=>r.ingredients).map(i=>[C.ingredientKey(i),i])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));pickerContext={ingredients};openSheet(`${sheetTop('Добавить запас')}<label class="searchbar">${ico('search')}<input id="pantry-search" type="search" placeholder="Название продукта" aria-label="Найти продукт"></label><div id="pantry-pick" class="pick-list section">${ingredients.slice(0,50).map(i=>action('stock-edit',`${esc(i.name)} <small>· ${esc(i.unit)}</small>`,'quick-pick',`data-key="${esc(C.ingredientKey(i))}"`)).join('')}</div>`);}
function showManualAdd(){openSheet(`${sheetTop('Добавить продукт')}<form id="manual-form"><label class="form-field"><span>Название</span><input name="name" maxlength="120" placeholder="Например, бананы" required></label><div class="form-row"><label class="form-field"><span>Количество</span><input name="quantity" type="number" min="0.01" max="1000000" step="0.01" value="1" required></label><label class="form-field"><span>Единица</span><select name="unit"><option>шт.</option><option>г</option><option>мл</option><option>уп.</option><option>пучок</option></select></label></div><label class="form-field"><span>Категория</span><select name="group">${C.GROUPS.map(g=>`<option>${g}</option>`).join('')}</select></label><button type="submit" class="btn full">Добавить в покупки</button></form>`);}
function showSettings(){
 const n=state.settings.familySize;
 openSheet(sheetTop('Настройки')+
 '<section class="settings-section"><h3>Семья</h3><div class="settings-group"><div class="settings-family"><span>Человек в семье</span><div class="family-stepper">'+
 action('family-step',ico('minus'),'','data-step="-1" '+(n<=1?'disabled':'')+' aria-label="Меньше человек в семье"')+'<output id="family-size">'+n+'</output>'+
 action('family-step',ico('plus'),'','data-step="1" '+(n>=12?'disabled':'')+' aria-label="Больше человек в семье"')+'</div></div></div></section>'+
 '<section class="settings-section"><h3>Данные</h3><div class="settings-group">'+action('export',ico('download')+'<span>Экспорт JSON</span>'+ico('arrow'),'settings-row')+
 action('import',ico('share')+'<span>Импорт JSON</span>'+ico('arrow'),'settings-row')+'</div><input type="file" id="import-file" accept="application/json,.json" class="hide"></section>'+
 '<section class="settings-section"><div class="settings-group"><div class="settings-row version-row"><span>Версия приложения</span><b>1.4</b></div></div></section>'+
 action('reset',ico('trash')+' Сбросить данные','settings-reset'));
}
function confirmSheet(title,text,yes){openSheet(`${sheetTop(title)}<p class="description">${text}</p><div class="actions">${action('close','Отмена','btn secondary')}${action(yes.action,yes.text,'btn danger',yes.data||'')}</div>`);}
function exportData(){const blob=new Blob([JSON.stringify({app:'Portionly',exportVersion:1,exportedAt:new Date().toISOString(),data:state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Portionly-${C.dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);toast('Резервная копия подготовлена');}
function listText(){const pending=C.shopping(state,byId).filter(i=>!i.covered);return 'Покупки:\n\n'+(pending.length?pending.map(i=>`• ${i.name} — ${qty({...i,quantity:i.needed})}`).join('\n'):'Всё уже есть дома.');}
async function copyList(){const text=listText();try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast('Список скопирован');return;}}catch{}const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:0;left:0;opacity:.01;font-size:16px;';document.body.append(ta);ta.focus();ta.select();ta.setSelectionRange(0,text.length);let ok=false;try{ok=document.execCommand('copy');}catch{}ta.remove();if(ok)toast('Список скопирован');else openSheet(`${sheetTop('Скопировать список')}<p class="description">Выделите и скопируйте текст ниже.</p><label class="form-field"><textarea readonly id="copy-fallback">${esc(text)}</textarea></label>`);}

async function handleAction(el){const a=el.dataset.action,id=el.dataset.id;
 switch(a){
 case 'close':closeSheet();break;
 case 'nav':closeSheet();screen=el.dataset.screen;render();window.scrollTo({top:0});break;
 case 'select-date':selected=el.dataset.date;week=C.monday(selected);render();break;
 case 'day-focus':selected=el.dataset.date;render();if(state.plan.filter(e=>e.date===selected&&e.meal===el.dataset.meal).length>1)openSheet(`${sheetTop(fmtDate(selected,{day:'numeric',month:'long'}))}${mealRows(selected)}`);else if(id)showEntry(id);else showPick({date:selected,meal:el.dataset.meal});break;
 case 'go-today':selected=C.dateKey();week=C.monday(selected);render();break;
 case 'week-prev':week=C.addDays(week,-7);selected=week;render();break;
 case 'week-next':week=C.addDays(week,7);selected=week;render();break;
 case 'recipe':showRecipe(id);break;
 case 'form-step':{const f=el.closest('form'),input=f?.elements[el.dataset.field];if(!input)return;const n=Number(input.value)||0;input.value=C.amount(Math.max(Number(input.min),Math.min(Number(input.max),n+Number(el.dataset.step))));input.dispatchEvent(new Event('input',{bubbles:true}));break;}
 case 'today-step':{const e=state.plan.find(e=>e.id===id),b=e&&batchOf(e);if(!e||e.eatenAt||!b)return;const n=mealAmount(e);mealDrafts.set(id,C.amount(Math.max(.25,Math.min(b.remaining,n+Number(el.dataset.step)))));render();break;}
 case 'today-consume':{const e=state.plan.find(e=>e.id===id);if(!e)return;const n=mealAmount(e);if(await change(s=>C.consume(s,id,n))){mealDrafts.delete(id);toast('Отмечено: съели. Остаток обновлён.');}break;}
 case 'today-shopping':{const rows=C.todayOverview(state,byId).shopping;openSheet(`${sheetTop('Для сегодняшних блюд')}<div class="today-shopping-list">${rows.map(i=>`<div class="shopping-row"><label><input type="checkbox" data-shopping-check="${esc(i.key)}" data-today-shopping="true"><span class="item-name">${esc(i.name)}</span></label><span class="qty">${qty({...i,quantity:i.needed})}</span></div>`).join('')}</div>${action('nav','Весь список покупок','btn full','data-screen="shopping"')}`);break;}
 case 'favorite':await change(s=>{s.favorites=s.favorites.includes(id)?s.favorites.filter(x=>x!==id):[...s.favorites,id];});el.classList.toggle('selected',state.favorites.includes(id));el.setAttribute('aria-pressed',String(state.favorites.includes(id)));break;
 case 'step':{const key=el.dataset.key;recipeView[key]=Math.max(1,Math.min(key==='days'?14:100,recipeView[key]+Number(el.dataset.step)));const y=sheet.scrollTop;paintRecipe();sheet.scrollTop=y;break;}
 case 'ingredient-toggle':{const key=el.dataset.key,i=C.scaledIngredients(rOf(recipeView.id),recipeView.portions).find(i=>C.ingredientKey(i)===key),stock=state.pantry[key],home=!!stock&&(i.quantity===null||stock.quantity>=i.quantity);await change(s=>{if(home)delete s.pantry[key];else C.markStock(s,key,i.quantity,'home');});const y=sheet.scrollTop;paintRecipe();sheet.scrollTop=y;break;}
 case 'recipe-plan':{const v={...recipeView};showPlan(v.id,v,{date:screen==='today'?C.dateKey():selected});break;}
 case 'recipe-cook':{const v={...recipeView};showCook(v.id,v);break;}
 case 'pick':showPick({date:el.dataset.date,meal:el.dataset.meal,mode:el.dataset.mode});break;
 case 'pick-recipe':{const ctx={...pickerContext};if(ctx.mode==='cook')showCook(id);else showPlan(id,{},ctx);break;}
 case 'pick-batch':{const b=state.batches.find(b=>b.id===id);showPlan(b.recipeId,{batchId:id,portions:Math.min(b.remaining,state.settings.familySize)},pickerContext);break;}
 case 'entry':showEntry(id);break;
 case 'eat':case 'entry-eat':if(await change(s=>C.eat(s,id))){if(a==='entry-eat')closeSheet();toast(state.plan.find(e=>e.id===id).eatenAt?'Отмечено: съели. Остаток обновлён.':'Отметка отменена. Порции возвращены.');}break;
 case 'entry-cook':{const e=state.plan.find(e=>e.id===id);showCook(e.recipeId,{jobId:e.jobId});break;}
 case 'entry-move':showMove(id);break;
 case 'entry-replace':{const e=state.plan.find(e=>e.id===id);showPick({date:e.date,meal:e.meal,replaceId:id});break;}
 case 'entry-rebind':{const e=state.plan.find(e=>e.id===id);openSheet(`${sheetTop('Выбрать готовую партию')}${state.batches.filter(b=>b.recipeId===e.recipeId&&b.remaining>0&&b.id!==e.batchId).map(b=>action('rebind',`Приготовлено ${fmtDate(b.cookedAt)} · ${portions(b.remaining)}`,'btn outline full',`data-id="${id}" data-batch="${b.id}" style="margin-top:10px"`)).join('')}`);break;}
 case 'rebind':if(await change(s=>C.rebindEntry(s,id,el.dataset.batch)))closeSheet();break;
 case 'entry-delete':confirmSheet('Удалить из плана?','Удалится этот приём пищи. Готовая еда останется; уже съеденные порции не возвращаются автоматически.',{action:'entry-delete-confirm',text:'Удалить',data:`data-id="${id}"`});break;
 case 'entry-delete-confirm':if(await change(s=>C.removeEntry(s,id)))closeSheet();break;
 case 'job-delete':confirmSheet('Удалить партию из плана?','Удалятся все связанные приёмы пищи. Приготовленная партия и история расхода сохранятся.',{action:'job-delete-confirm',text:'Удалить партию',data:`data-id="${id}"`});break;
 case 'job-delete-confirm':if(await change(s=>C.removeJob(s,id)))closeSheet();break;
 case 'batch':showBatch(id);break;
 case 'batch-minus':case 'batch-plus':{const y=sheet.scrollTop;await change(s=>{const b=s.batches.find(b=>b.id===id);C.batchRemaining(s,id,Math.max(0,b.remaining+(a==='batch-plus'?1:-1)));});if(sheet.open){showAllBatches();sheet.scrollTop=y;}break;}
 case 'batch-plan':{const b=state.batches.find(b=>b.id===id);showPlan(b.recipeId,{batchId:id,portions:Math.min(b.remaining,state.settings.familySize)},{date:selected});break;}
 case 'batch-discard':confirmSheet('Убрать остаток?','Остаток станет равен нулю. История приготовления сохранится; связанные приёмы пищи могут потребовать новой партии.',{action:'batch-discard-confirm',text:'Остаток закончился',data:`data-id="${id}"`});break;
 case 'batch-discard-confirm':if(await change(s=>C.batchRemaining(s,id,0)))closeSheet();break;
 case 'all-batches':showAllBatches();break;
 case 'category':category=el.dataset.category;limit=24;render();break;
 case 'recommend':filters.recommend=filters.recommend===el.dataset.recommend?'':el.dataset.recommend;limit=24;render();break;
 case 'favorites-filter':filters.favorites=!filters.favorites;limit=24;render();break;
 case 'filters':showFilters();break;
 case 'clear-filters':query='';filters={time:'',calories:'',difficulty:'',favorites:false,quick:false,home:false,missing:'',recommend:''};limit=24;closeSheet();render();break;
 case 'load-more':limit+=24;updateCatalog();break;
 case 'shop-tab':shopTab=el.dataset.tab;render();break;
 case 'stock-mark':case 'stock-edit':showStock(el.dataset.key);break;
 case 'stock-zero':if(await change(s=>delete s.pantry[el.dataset.key]))closeSheet();break;
 case 'pantry-add':showPantryAdd();break;
 case 'manual-add':showManualAdd();break;
 case 'manual-remove':await change(s=>s.manual=s.manual.filter(m=>'manual|'+m.id!==el.dataset.key));break;
 case 'copy':await copyList();break;
 case 'share':if(navigator.share){try{await navigator.share({title:'Покупки',text:listText()});}catch(e){if(e.name!=='AbortError')await copyList();}}else await copyList();break;
 case 'settings':showSettings();break;
 case 'family-step':{if(await change(s=>s.settings.familySize=Math.max(1,Math.min(12,s.settings.familySize+Number(el.dataset.step))))){showSettings();}break;}
 case 'quick-filter':{const key=el.dataset.filter;if(key==='missing')filters.missing=filters.missing==='2'?'':'2';else filters[key]=!filters[key];limit=24;render();break;}
 case 'export':exportData();break;
 case 'import':$('#import-file').click();break;
 case 'import-confirm':{const data=pickerContext.importData;if(await change(s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,data);})){closeSheet();toast('Резервная копия восстановлена');}break;}
 case 'reset':confirmSheet('Сбросить вашу кухню?','План, готовая еда, продукты дома, покупки и избранное будут удалены. База рецептов останется. Сначала экспортируйте резервную копию, если хотите сохранить данные.',{action:'reset-confirm',text:'Удалить мои данные'});break;
 case 'reset-confirm':if(await change(s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,C.fresh());})){closeSheet();toast('Пользовательские данные сброшены');}break;
 }
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el){e.preventDefault();handleAction(el).catch(err=>toast(err.message));}});
sheet.addEventListener('cancel',e=>{e.preventDefault();closeSheet();});sheet.addEventListener('click',e=>{if(e.target===sheet&&e.clientY<sheet.getBoundingClientRect().top)closeSheet();});
document.addEventListener('input',e=>{if(e.target.id==='catalog-search'){query=e.target.value;limit=24;updateCatalog();}if(e.target.id==='pick-search'){pickQuery=e.target.value;$('#pick-list').innerHTML=pickResults();}if(e.target.closest('#plan-form'))updatePlanPreview();if(e.target.id==='pantry-search'){const q=e.target.value.toLowerCase().replace(/ё/g,'е');$('#pantry-pick').innerHTML=pickerContext.ingredients.filter(i=>i.name.toLowerCase().replace(/ё/g,'е').includes(q)).slice(0,60).map(i=>action('stock-edit',`${esc(i.name)} <small>· ${esc(i.unit)}</small>`,'quick-pick',`data-key="${esc(C.ingredientKey(i))}"`)).join('');}});
document.addEventListener('change',async e=>{if(e.target.id==='hide-covered'){hideCovered=e.target.checked;render();}if(e.target.dataset.shoppingCheck){const key=e.target.dataset.shoppingCheck,row=(e.target.dataset.todayShopping?C.todayOverview(state,byId).shoppingAll:C.shopping(state,byId)).find(i=>i.key===key),checked=e.target.checked;if(!row)return;await change(s=>{if(row.manual)s.manual.find(m=>'manual|'+m.id===key).checked=checked;else if(checked)C.markStock(s,key,e.target.dataset.todayShopping?(row.quantity===null?null:Math.max(s.pantry[key]?.quantity||0,row.quantity)):row.quantity,'bought');else delete s.pantry[key];});}if(e.target.id==='import-file'&&e.target.files[0]){try{const f=e.target.files[0];if(f.size>10*1024*1024)throw Error('Файл слишком большой. Максимум 10 МБ.');const data=C.validateImport(JSON.parse(await f.text()),byId);confirmSheet('Восстановить резервную копию?',`В файле: ${data.plan.length} приёмов пищи, ${data.batches.length} приготовленных партий, ${data.favorites.length} избранных блюд. Текущие пользовательские данные будут заменены.`,{action:'import-confirm',text:'Восстановить'});pickerContext={importData:data};}catch(err){toast(err.message||'Не удалось прочитать JSON.');e.target.value='';}}});
document.addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.target,ctx={...pickerContext};try{
 if(f.id==='plan-form'){const options={date:f.date.value,meal:f.meal.value,portions:Number(f.portions.value),days:Number(f.days.value),batchId:ctx.batchId,replaceId:ctx.replaceId};if(await change(s=>C.newPlan(s,rOf(ctx.recipeId),options))){selected=options.date;week=C.monday(selected);closeSheet();render();toast('Блюдо добавлено в план');}}
 if(f.id==='cook-form'){let result;if(await change(s=>result=C.cook(s,rOf(ctx.recipeId),{date:f.date.value,actualPortions:Number(f.portions.value),portions:ctx.cookPortions,days:Number(f.days.value),jobId:ctx.jobId}))){closeSheet();toast(result.shortage?`Сохранено. Для плана не хватает ${portions(result.shortage)}.`:'Готовая еда сохранена');}}
 if(f.id==='move-form'){if(await change(s=>C.moveEntry(s,ctx.entryId,{date:f.date.value,meal:f.meal.value,portions:Number(f.portions.value)})))closeSheet();}
 if(f.id==='batch-form'){const n=Number(f.remaining.value),end=f.endDate.value;if(!end)throw Error('Укажите дату окончания.');if(await change(s=>{C.batchRemaining(s,ctx.batchId,n);s.batches.find(b=>b.id===ctx.batchId).endDate=end;}))closeSheet();}
 if(f.id==='stock-form'){const n=Number(f.quantity.value);if(!Number.isFinite(n)||n<0||n>1000000)throw Error('Проверьте количество продукта.');if(await change(s=>C.markStock(s,ctx.stockKey,n,'home')))closeSheet();}
 if(f.id==='manual-form'){const n=Number(f.quantity.value),name=f.elements.name.value.trim();if(!name||!Number.isFinite(n)||n<=0||n>1000000)throw Error('Проверьте название и количество.');if(await change(s=>s.manual.push({id:C.uid(),name,quantity:n,unit:f.unit.value,group:f.group.value,checked:false})))closeSheet();}
 if(f.id==='filter-form'){for(const k of ['time','calories','difficulty','missing','recommend'])filters[k]=f[k].value;for(const k of ['favorites','quick','home'])filters[k]=f[k].checked;limit=24;closeSheet();render();}
 }catch(e){const err=$('#form-error');if(err)err.textContent=e.message;else toast(e.message);}});
window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
// Recompute the workday even if the installed app stays open across midnight.
setInterval(()=>{if(state&&!sheet.open&&C.dateKey()!==liveDay){liveDay=C.dateKey();mealDrafts.clear();render();}},30000);
let liveDay=C.dateKey();document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&state&&!busy){try{state=await readState();const current=C.dateKey();if(current!==liveDay){selected=current;week=C.monday(current);liveDay=current;}render();}catch(e){toast(e.message);}}});
const channel='BroadcastChannel'in window?new BroadcastChannel('portionly-family-state'):null;
if(channel)channel.onmessage=async()=>{if(!busy&&!sheet.open){state=await readState();render();}};
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement){e.target.classList.add('local-photo-error');e.target.alt='Фото недоступно офлайн — '+e.target.alt;}},true);
async function boot(){
 try{
  const res=await fetch('./data/recipes.json');
  if(!res.ok)throw Error('Не удалось загрузить блюда. Проверьте подключение и попробуйте снова.');
  recipes=await res.json();recipes.forEach(r=>r.search=(r.name+' '+r.ingredients.map(i=>i.name).join(' ')).toLocaleLowerCase('ru').replace(/ё/g,'е'));
  byId=new Map(recipes.map(r=>[r.id,r]));await openDB();state=await readState();render();
  if('serviceWorker' in navigator){
   try{
    const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const check=worker=>{if(worker?.state==='installed'&&navigator.serviceWorker.controller)toast('Обновление готово. Закройте и откройте приложение.');};
    if(reg.waiting)check(reg.waiting);
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>check(worker));});
    // Re-check after an existing installed app is reopened.
    reg.update().catch(()=>{});
   }catch{}
  }
 }catch(e){
  app.innerHTML='<div class="boot"><h1>Не удалось открыть кухню</h1><p>'+esc(e.message)+'</p><button class="btn" onclick="location.reload()">Повторить</button></div>';
 }
}

boot();
