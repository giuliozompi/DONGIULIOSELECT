import React, { useState } from 'react';
import { ArrowUpRight, Play, ExternalLink } from 'lucide-react';
import { Shell, PageIntro, DemoNotice, VIDEOS_URL, TELEGRAM_URL, YOUTUBE_EMBED } from './_shared';

export function Videos() {
  const [playing,setPlaying] = useState(false);
  return <Shell active="Videos">
    <main className="dg-shell dg-main">
      <div className="dg-split">
        <div>
          <PageIntro eyebrow="Appunti dalla bottega · заметки сыровара" title="Сыр начинается с любопытства." description="Короткий путь от молока и места — к вкусу на вашей тарелке. Смотрите материалы магазина и знакомьтесь с традициями сыроварения."/>
          <div style={{display:'flex',gap:11,marginTop:25,flexWrap:'wrap'}}>
            {!playing ? <button className="dg-btn" onClick={()=>setPlaying(true)}><Play size={15}/> Открыть плейлист YouTube</button> : <button className="dg-btn secondary" onClick={()=>setPlaying(false)}>Закрыть плеер</button>}
            <a className="dg-btn secondary" href={VIDEOS_URL} target="_blank" rel="noreferrer">Открыть YouTube <ArrowUpRight size={14}/></a>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginTop:12}}>Плеер появится только после вашего нажатия. Названия и длительности роликов здесь не указаны.</p>
        </div>
        <div className="dg-card" style={{padding:20}}>
          <div className="dg-kicker">Официальные каналы</div>
          <div style={{marginTop:16,paddingBottom:15,borderBottom:'1px solid var(--line)'}}>
            <strong style={{fontSize:15}}>YouTube · плейлист</strong>
            <p style={{fontSize:12,lineHeight:1.6,color:'var(--muted)'}}>Единый плейлист магазина. Встроенный просмотр запускается только по запросу.</p>
            <a href={VIDEOS_URL} target="_blank" rel="noreferrer" style={{fontSize:11,color:'var(--olive-dark)',fontWeight:700}}>Перейти к источнику <ExternalLink size={12} style={{display:'inline',verticalAlign:'middle'}}/></a>
          </div>
          <div style={{paddingTop:14}}>
            <strong style={{fontSize:15}}>Telegram · публикация магазина</strong>
            <p style={{fontSize:12,lineHeight:1.6,color:'var(--muted)'}}>Встроенное медиа недоступно: Telegram сообщает «Please open Telegram to view this post».</p>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="dg-btn secondary" style={{padding:'9px 12px'}}>Открыть Telegram <ArrowUpRight size={13}/></a>
          </div>
        </div>
      </div>
      <DemoNotice>Здесь показан один подтверждённый адрес плейлиста, а не вымышленные карточки роликов. Воспроизведение в прототипе не проверено.</DemoNotice>
      <section style={{marginTop:26}}>
        <div style={{display:'flex',alignItems:'end',justifyContent:'space-between',marginBottom:12}}>
          <div><div className="dg-kicker">Сейчас у прилавка</div><h2 className="serif" style={{fontSize:26,fontWeight:500,margin:'7px 0'}}>Тихое знакомство с сыром</h2></div>
          <span className="dg-pill">Плейлист магазина</span>
        </div>
        <div className="dg-card" style={{overflow:'hidden',minHeight:playing?260:92}}>
          {playing ? <iframe title="Плейлист YouTube Don Giulio Select" src={YOUTUBE_EMBED} style={{display:'block',width:'100%',height:'min(62vw,520px)',minHeight:200,border:0}} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/> :
          <button onClick={()=>setPlaying(true)} aria-label="Открыть YouTube-плейлист" style={{width:'100%',minHeight:92,border:0,background:'transparent',display:'flex',alignItems:'center',gap:16,padding:'18px 22px',textAlign:'left',cursor:'pointer',color:'var(--ink)'}}>
            <span style={{width:48,height:48,borderRadius:'50%',display:'grid',placeItems:'center',background:'#e9eddf',color:'var(--olive-dark)'}}><Play size={18}/></span>
            <span><strong style={{fontSize:14}}>Нажмите, чтобы загрузить официальный плеер</strong><span style={{display:'block',fontSize:11,color:'var(--muted)',marginTop:5}}>Источник: youtube.com · встроенная загрузка не запускалась</span></span>
          </button>}
        </div>
      </section>
      <section className="dg-split" style={{marginTop:38,gridTemplateColumns:'1fr 1fr',gap:18}}>
        <a href="/__mockup/preview/editorial/CheeseMap" className="dg-card" style={{padding:22,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span><span className="dg-kicker">Следующая остановка</span><strong className="serif" style={{display:'block',fontSize:21,marginTop:6}}>На карте сырных регионов</strong></span><ArrowUpRight size={18}/>
        </a>
        <a href="/__mockup/preview/editorial/CheeseStory" className="dg-card" style={{padding:22,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span><span className="dg-kicker">За подробностями</span><strong className="serif" style={{display:'block',fontSize:21,marginTop:6}}>Две истории сыров</strong></span><ArrowUpRight size={18}/>
        </a>
      </section>
    </main>
  </Shell>;
}
