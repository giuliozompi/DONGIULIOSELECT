import React,{useState} from 'react';
import { ArrowRight, CircleCheck, FilePlus2, Link2, Sparkles, Video, BookOpen } from 'lucide-react';
import { Shell,PageIntro,DemoNotice,VIDEOS_URL,TELEGRAM_URL,cheeses } from './_shared';

type Stage='draft'|'review'|'published';
const videoCategories=[['recipes','Видеорецепты'],['talks','Разговоры и интервью'],['reviews','Мнения о продуктах'],['places','Поездки и места']];
export function EditorialAdmin() {
  const [kind,setKind]=useState<'video'|'cheese'>('video');
  const [videoCategory,setVideoCategory]=useState('recipes');
  const [cheeseLink,setCheeseLink]=useState('');
  const [title,setTitle]=useState('');
  const [source,setSource]=useState(VIDEOS_URL);
  const [stage,setStage]=useState<Stage>('draft');
  const [sources,setSources]=useState<string[]>(['Официальный плейлист YouTube · источник добавлен для демонстрации']);
  const [message,setMessage]=useState('');
  const addSource=()=>{if(source.trim()){setSources(s=>[...s,source.trim()]);setSource('');setMessage('Ссылка добавлена только в состояние этой демонстрационной страницы.')}};
  const prepareDraft=()=>{setTitle(t=>t|| (kind==='video'?'Новая видеоистория Дон Джулио':'Новая статья атласа сыров'));setStage('draft');setMessage('Подготовка черновика показана как макет; текст не создан настоящим ИИ и не сохранён.')};
  const stages:Stage[]=['draft','review','published'];
  const label:Record<Stage,string>={draft:'Черновик',review:'На проверке',published:'Опубликовано (демо)'};
  return <Shell active="EditorialAdmin">
    <main className="dg-shell dg-main">
      <PageIntro eyebrow="Taccuino editoriale · редакционная мастерская" title="Два направления. Один редакционный стол." description="Видео Don Giulio и атлас сыров — самостоятельные редакционные разделы. Все действия ниже меняют только локальное состояние страницы."/>
      <div className="dg-notice" style={{marginTop:21}}>ПРОТОТИП: никаких сохранений, реального ИИ или публикаций. Статус «Опубликовано» — только демонстрационный переключатель; материалы не отправляются в магазин.</div>
      <div className="dg-split" style={{gridTemplateColumns:'minmax(0,1.25fr) minmax(280px,.75fr)',gap:22,marginTop:23,alignItems:'start'}}>
        <section className="dg-card" style={{padding:24}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:20}}><FilePlus2 size={18} color="#526a4c"/><h2 className="serif" style={{fontSize:24,fontWeight:500,margin:0}}>Новая редакционная запись</h2></div>
          <div style={{display:'flex',gap:9,marginBottom:20}}>
            <button className={`dg-btn ${kind==='video'?'':'secondary'}`} onClick={()=>setKind('video')}><Video size={14}/> Видео</button>
            <button className={`dg-btn ${kind==='cheese'?'':'secondary'}`} onClick={()=>setKind('cheese')}><BookOpen size={14}/> История сыра</button>
          </div>
          <div className="dg-notice" style={{marginBottom:16}}>{kind==='video'?'Видео Don Giulio — самостоятельный материал в одной из четырёх категорий. Связь со статьёй о сыре необязательна.':'Статья атласа публикуется независимо от видеотеки. К ней можно добавить только действительно относящееся видео или проверенную внешнюю ссылку; это необязательно.'}</div>
          {kind==='video'?<div className="dg-split" style={{gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <div><label className="dg-label" htmlFor="video-category">Категория видеотеки</label><select id="video-category" className="dg-input" value={videoCategory} onChange={e=>setVideoCategory(e.target.value)}>{videoCategories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
            <div><label className="dg-label" htmlFor="video-cheese-link">Связь со статьёй о сыре · необязательно</label><select id="video-cheese-link" className="dg-input" value={cheeseLink} onChange={e=>setCheeseLink(e.target.value)}><option value="">Без связи с сыром</option>{cheeses.map(item=><option key={item.id} value={item.id}>{item.title} · демо-статья</option>)}</select></div>
          </div>:<div style={{marginBottom:16}}>
            <label className="dg-label" htmlFor="article-related-video">Связанное видео · необязательно</label>
            <select id="article-related-video" className="dg-input" value="" disabled><option value="">Нет проверенных видео для привязки</option></select>
            <p style={{fontSize:10,color:'var(--muted)',lineHeight:1.6,margin:'6px 0 0'}}>Связь появится только после проверки релевантности. Предоставленный общий плейлист нельзя автоматически считать материалом о выбранном сыре; проверенную внешнюю ссылку можно будет добавить как источник.</p>
          </div>}
          <label className="dg-label" htmlFor="editor-title">Рабочее название</label>
          <input id="editor-title" className="dg-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==='video'?'Название для редакторской заметки':'Например, традиция региона'}/>
          <div style={{marginTop:17}}>
            <label className="dg-label" htmlFor="source-link">Источник для проверки</label>
            <div style={{display:'flex',gap:8}}><input id="source-link" className="dg-input" value={source} onChange={e=>setSource(e.target.value)} placeholder="Вставьте ссылку или заметку"/><button className="dg-btn" onClick={addSource} aria-label="Добавить источник"><Link2 size={15}/></button></div>
          </div>
          <div style={{marginTop:18}}>
            <div className="dg-label">Список источников · локальный макет</div>
            {sources.map((s,i)=><div key={`${s}-${i}`} style={{display:'flex',gap:9,alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--line)',fontSize:11,color:'var(--muted)',wordBreak:'break-word'}}><span className="dg-pill">{i===0?'Добавлен':'Демо'}</span>{s}</div>)}
            <p style={{fontSize:10,color:'var(--muted)'}}>Проверьте авторство, актуальность, географические обозначения и связь фактов с конкретным продуктом.</p>
          </div>
          <button className="dg-btn secondary" onClick={prepareDraft} style={{marginTop:6}}><Sparkles size={14}/> Подготовить демо-черновик</button>
          <p style={{fontSize:10,color:'var(--muted)',lineHeight:1.6}}>Кнопка лишь подставит пример названия и состояние. Она не вызывает модель ИИ, ничего не сохраняет и не проверяет источники.</p>
          {message&&<p role="status" style={{padding:10,background:'#edf0e8',fontSize:11,color:'var(--olive-dark)',lineHeight:1.5}}>{message}</p>}
        </section>
        <aside>
          <section className="dg-card" style={{padding:20}}>
            <div className="dg-kicker">Входящие источники</div><h2 className="serif" style={{fontSize:22,fontWeight:500,margin:'8px 0 13px'}}>Проверить вручную</h2>
            <a href={VIDEOS_URL} target="_blank" rel="noreferrer" style={{display:'flex',justifyContent:'space-between',padding:'11px 0',borderBottom:'1px solid var(--line)',fontSize:11}}>Официальный плейлист YouTube <ArrowRight size={13}/></a>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" style={{display:'flex',justifyContent:'space-between',padding:'11px 0',fontSize:11}}>Публикация Telegram <ArrowRight size={13}/></a>
            <div className="dg-notice" style={{marginTop:8}}>Telegram не показывает встроенное медиа этой публикации: откройте оригинал в Telegram. Не используйте несуществующий предпросмотр как источник содержания.</div>
          </section>
          <section className="dg-card" style={{padding:20,marginTop:15}}>
            <div className="dg-kicker">Редакционный поток</div>
            <div style={{display:'grid',gap:8,marginTop:13}}>
              {stages.map((s,i)=><button key={s} onClick={()=>{setStage(s);setMessage(`Локальный демо-статус изменён: ${label[s]}. Публикации не было.`)}} style={{display:'flex',alignItems:'center',gap:11,border:'1px solid var(--line)',background:stage===s?'#edf0e8':'#fffdf8',padding:11,textAlign:'left',cursor:'pointer',color:'var(--ink)'}}>
                <span style={{width:25,height:25,borderRadius:'50%',display:'grid',placeItems:'center',background:stage===s?'var(--olive-dark)':'#eee9dc',color:stage===s?'white':'#66756a',fontSize:10}}>{stage===s?<CircleCheck size={14}/>:`0${i+1}`}</span>
                <span><strong style={{display:'block',fontSize:11}}>{label[s]}</strong><small style={{fontSize:9,color:'var(--muted)'}}>{s==='draft'?'Материал в работе':s==='review'?'Редакторская проверка':'Только состояние прототипа'}</small></span>
              </button>)}
            </div>
          </section>
        </aside>
      </div>
      <section className="dg-card" style={{marginTop:22,padding:22}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:15,flexWrap:'wrap'}}>
          <div><div className="dg-kicker">Предпросмотр · демонстрационные данные</div><h2 className="serif" style={{fontSize:23,fontWeight:500,margin:'7px 0'}}>{title||'Заголовок редакционной истории'}</h2><p style={{fontSize:11,color:'var(--muted)',margin:0}}>Тип: {kind==='video'?'видеоматериал · '+videoCategories.find(([id])=>id===videoCategory)?.[1]+' · '+(cheeseLink?`связь: ${cheeses.find(item=>item.id===cheeseLink)?.title}`:'без связи с сыром'):'статья атласа · связанное видео не выбрано'} · статус: {label[stage]}</p></div>
          <span className="dg-pill">Не сохранено</span>
        </div>
        <p style={{fontSize:12,lineHeight:1.7,color:'var(--muted)',maxWidth:760}}>Категория и возможная связь видео со статьёй — разные поля: связь необязательна и не определяет категорию. Для статьи атласа связанное видео также необязательно и требует отдельной проверки. Поля названия и этапа оценивают будущий интерфейс; перезагрузка сбросит изменения. Ничего не сохраняется и не публикуется.</p>
      </section>
    </main>
  </Shell>;
}
