import React, { useState } from 'react';
import { ArrowUpRight, Play, ExternalLink, MapPin, MessageCircle, ChefHat, Star, BookOpen } from 'lucide-react';
import { Shell, PageIntro, DemoNotice, VIDEOS_URL, TELEGRAM_URL, YOUTUBE_EMBED } from './_shared';

const categories = [
  { id:'recipes', title:'Видеорецепты', detail:'Готовим вместе: блюда, техники и личные кухонные заметки.', icon:ChefHat },
  { id:'talks', title:'Разговоры и интервью', detail:'Беседы с людьми, которые знают продукт и своё дело.', icon:MessageCircle },
  { id:'reviews', title:'Мнения о продуктах', detail:'Личный взгляд Джулио на продукты и то, что стоит попробовать.', icon:Star },
  { id:'places', title:'Поездки и места', detail:'Склады, рынки, рестораны и другие места, куда Джулио заглядывает сам.', icon:MapPin },
];

export function Videos() {
  const [playing,setPlaying] = useState(false);
  const [category,setCategory] = useState(categories[0].id);
  const selected = categories.find(item=>item.id===category)!;
  return <Shell active="Videos">
    <main className="dg-shell dg-main">
      <div className="dg-split">
        <div>
          <PageIntro eyebrow="Video Don Giulio · видеоистории" title="Джулио смотрит на мир — и рассказывает." description="Итальянский продюсер и рассказчик о еде в России. Здесь — его кухня, разговоры, мнения о продуктах и поездки по местам, где живёт гастрономия."/>
          <div style={{display:'flex',gap:11,marginTop:25,flexWrap:'wrap'}}>
            {!playing ? <button className="dg-btn" onClick={()=>setPlaying(true)}><Play size={15}/> Открыть плейлист YouTube</button> : <button className="dg-btn secondary" onClick={()=>setPlaying(false)}>Закрыть плеер</button>}
            <a className="dg-btn secondary" href={VIDEOS_URL} target="_blank" rel="noreferrer">Открыть YouTube <ArrowUpRight size={14}/></a>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginTop:12}}>Плеер загружается только после нажатия. Для материалов плейлиста здесь не подтверждены названия, категории, длительности и обложки.</p>
        </div>
        <div className="dg-card" style={{padding:20}}>
          <div className="dg-kicker">Гастрономия шире одной темы</div>
          <p style={{fontSize:13,lineHeight:1.75,color:'var(--muted)',margin:'12px 0 17px'}}>От домашней кухни до ресторанных разговоров — это самостоятельная видеотека Дон Джулио, а не приложение к каталогу сыров.</p>
          <a href="/__mockup/preview/editorial/CheeseMap" className="dg-btn secondary" style={{textDecoration:'none'}}>Отдельно: атлас сыров <ArrowUpRight size={14}/></a>
          <div className="dg-kicker" style={{marginTop:23}}>Источники</div>
          <div style={{marginTop:16,paddingBottom:15,borderBottom:'1px solid var(--line)'}}>
            <strong style={{fontSize:15}}>YouTube · плейлист</strong>
            <p style={{fontSize:12,lineHeight:1.6,color:'var(--muted)'}}>Предоставленный общий плейлист. Встроенный просмотр запускается только по запросу.</p>
            <a href={VIDEOS_URL} target="_blank" rel="noreferrer" style={{fontSize:11,color:'var(--olive-dark)',fontWeight:700}}>Перейти к источнику <ExternalLink size={12} style={{display:'inline',verticalAlign:'middle'}}/></a>
          </div>
          <div style={{paddingTop:14}}>
            <strong style={{fontSize:15}}>Telegram · публикация магазина</strong>
            <p style={{fontSize:12,lineHeight:1.6,color:'var(--muted)'}}>Встроенное медиа недоступно: Telegram сообщает «Please open Telegram to view this post».</p>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="dg-btn secondary" style={{padding:'9px 12px'}}>Открыть Telegram <ArrowUpRight size={13}/></a>
          </div>
        </div>
      </div>
      <DemoNotice>Один предоставленный адрес плейлиста — без вымышленных карточек роликов. Сам факт загрузки плеера не означает, что воспроизведение проверено.</DemoNotice>
      <section style={{marginTop:34}}>
        <div style={{display:'flex',alignItems:'end',justifyContent:'space-between',gap:14,flexWrap:'wrap',marginBottom:15}}>
          <div><div className="dg-kicker">Четыре направления</div><h2 className="serif" style={{fontSize:29,fontWeight:500,margin:'7px 0 0'}}>Что смотрим у Джулио</h2></div>
          <span className="dg-pill">Самостоятельная видеотека</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:10}}>
          {categories.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>setCategory(item.id)} aria-pressed={category===item.id} className="dg-card" style={{padding:16,textAlign:'left',cursor:'pointer',color:'var(--ink)',border:category===item.id?'1px solid var(--olive-dark)':'1px solid var(--line)',background:category===item.id?'#edf0e8':'var(--paper)'}}>
            <Icon size={17} color="var(--olive-dark)"/><strong className="serif" style={{display:'block',fontSize:18,fontWeight:500,marginTop:12}}>{item.title}</strong><span style={{display:'block',fontSize:11,lineHeight:1.6,color:'var(--muted)',marginTop:6}}>{item.detail}</span>
          </button>})}
        </div>
        <div className="dg-card" style={{padding:'15px 18px',marginTop:12,display:'flex',gap:12,alignItems:'flex-start'}}>
          <BookOpen size={16} color="var(--olive-dark)" style={{flexShrink:0,marginTop:2}}/>
          <p aria-live="polite" style={{fontSize:12,lineHeight:1.7,margin:0,color:'var(--muted)'}}><strong style={{color:'var(--ink)'}}>{selected.title}.</strong> {selected.detail} Категория обозначена для навигации; в предоставленных данных нет проверенных роликов, чтобы отнести к ней конкретное видео. Общий плейлист не размечен по темам.</p>
        </div>
      </section>
      <section style={{marginTop:26}}>
        <div style={{display:'flex',alignItems:'end',justifyContent:'space-between',marginBottom:12}}>
          <div><div className="dg-kicker">Источник · YouTube</div><h2 className="serif" style={{fontSize:26,fontWeight:500,margin:'7px 0'}}>Официальный плейлист</h2></div>
          <span className="dg-pill">Без проверенных карточек</span>
        </div>
        <div className="dg-card" style={{overflow:'hidden',minHeight:playing?260:92}}>
          {playing ? <iframe title="Плейлист YouTube Don Giulio Select" src={YOUTUBE_EMBED} style={{display:'block',width:'100%',height:'min(62vw,520px)',minHeight:200,border:0}} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/> :
          <button onClick={()=>setPlaying(true)} aria-label="Открыть YouTube-плейлист" style={{width:'100%',minHeight:92,border:0,background:'transparent',display:'flex',alignItems:'center',gap:16,padding:'18px 22px',textAlign:'left',cursor:'pointer',color:'var(--ink)'}}>
            <span style={{width:48,height:48,borderRadius:'50%',display:'grid',placeItems:'center',background:'#e9eddf',color:'var(--olive-dark)'}}><Play size={18}/></span>
            <span><strong style={{fontSize:14}}>Нажмите, чтобы загрузить официальный плеер</strong><span style={{display:'block',fontSize:11,color:'var(--muted)',marginTop:5}}>Источник: youtube.com · встроенная загрузка не запускалась</span></span>
          </button>}
        </div>
      </section>
      <section style={{marginTop:34,borderTop:'1px solid var(--line)',paddingTop:20,display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div><div className="dg-kicker">Другой самостоятельный раздел</div><h2 className="serif" style={{fontSize:22,fontWeight:500,margin:'5px 0'}}>Сыры — в отдельном атласе</h2><p style={{fontSize:11,color:'var(--muted)',margin:0}}>Ищите статьи по регионам; видео к ним могут быть, но не обязательны.</p></div>
        <a href="/__mockup/preview/editorial/CheeseMap" className="dg-btn secondary" style={{textDecoration:'none'}}>Перейти в атлас сыров <ArrowUpRight size={14}/></a>
      </section>
    </main>
  </Shell>;
}
