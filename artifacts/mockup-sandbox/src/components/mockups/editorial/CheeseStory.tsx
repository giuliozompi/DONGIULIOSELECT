import React,{useState} from 'react';
import { ArrowLeft, ArrowRight, ShoppingBasket } from 'lucide-react';
import { Shell,DemoNotice,cheeses } from './_shared';

export function CheeseStory() {
  const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('cheese'):null;
  const [id]=useState(requested&&cheeses.some(c=>c.id===requested)?requested:'gorgonzola');
  const [demoAdded,setDemoAdded]=useState(false);
  const item=cheeses.find(c=>c.id===id)!;
  const jump=(next:string)=>{window.location.href=`/__mockup/preview/editorial/CheeseStory?cheese=${next}`};
  const sections=[['История','history','Наследие места'],['Молоко','milk','Сырьё'],['Обработка','process','Сыроварня'],['Созревание','mature','Время'],['Вкус и текстура','taste','На языке'],['К столу','pair','Подача']];
  return <Shell active="CheeseStory">
    <main className="dg-shell dg-main">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <a href="/__mockup/preview/editorial/CheeseMap" style={{fontSize:11,color:'var(--muted)',display:'inline-flex',alignItems:'center',gap:7}}><ArrowLeft size={14}/> Назад к карте</a>
        <div style={{display:'flex',gap:7}}>{cheeses.map(c=><button key={c.id} onClick={()=>jump(c.id)} className={`dg-btn ${id===c.id?'':'secondary'}`} style={{padding:'8px 11px'}}>{c.title}</button>)}</div>
      </div>
      <section className="dg-split" style={{marginTop:26,gridTemplateColumns:'1fr .9fr',gap:46}}>
        <div>
          <div className="dg-eyebrow">История сыра · {item.country} · {item.region}</div>
          <h1 className="dg-title">{item.title}<span style={{display:'block',fontSize:18,fontStyle:'italic',color:'var(--muted)',letterSpacing:0,marginTop:10}}>{item.latin}</span></h1>
          <p className="dg-sub" style={{fontSize:13}}>Разговор о месте, ремесле и характере — без путаницы между европейским происхождением и сегодняшним продуктом.</p>
          <div style={{marginTop:19}}><DemoNotice>Демонстрационная статья: сведения и указанные источники требуют редакторской проверки. Это не утверждённая энциклопедическая публикация.</DemoNotice></div>
        </div>
        <figure style={{margin:0,position:'relative',height:310,background:'#e7dfcd',overflow:'hidden'}}>
          <img src={item.image} alt={`Иллюстрация российского каталожного продукта ${item.title}`} className="dg-image"/>
          <figcaption style={{position:'absolute',bottom:0,left:0,right:0,padding:'16px 18px',background:'linear-gradient(transparent,#18251edb)',color:'#fff',fontSize:10,lineHeight:1.5}}>{item.caption}</figcaption>
        </figure>
      </section>
      <nav aria-label="Разделы статьи" style={{display:'flex',gap:8,overflowX:'auto',padding:'24px 0 12px',borderBottom:'1px solid var(--line)',marginTop:30}}>
        {sections.map(([label,key])=><a key={key} href={`#${key}`} className="dg-pill" style={{whiteSpace:'nowrap'}}>{label}</a>)}
      </nav>
      <section className="dg-split" style={{gridTemplateColumns:'1fr 300px',alignItems:'start',gap:55,paddingTop:25}}>
        <article>
          {sections.map(([label,key,caption])=><section id={key} key={key} style={{padding:'19px 0',borderBottom:'1px solid var(--line)',scrollMarginTop:20}}>
            <div className="dg-kicker">{caption}</div><h2 className="serif" style={{fontSize:25,fontWeight:500,margin:'6px 0 8px'}}>{label}</h2>
            <p style={{fontSize:13,lineHeight:1.85,color:'#526259',margin:0}}>{(item as any)[key]}</p>
          </section>)}
          <section style={{paddingTop:25}}>
            <div className="dg-kicker">Материалы для проверки</div><h2 className="serif" style={{fontSize:23,fontWeight:500}}>Источники и редакторская заметка</h2>
            <ul style={{paddingLeft:17,fontSize:11,color:'var(--muted)',lineHeight:1.8}}>{item.sources.map(s=><li key={s}>{s}</li>)}</ul>
            <DemoNotice>Ссылки приведены как ориентиры для редакционной проверки; статья не прошла фактчекинг. Указание традиции не подтверждает происхождение конкретного российского продукта.</DemoNotice>
          </section>
        </article>
        <aside className="dg-card" style={{padding:18,position:'sticky',top:15}}>
          <div className="dg-kicker">Иллюстративная карточка</div>
          <h3 className="serif" style={{fontSize:21,fontWeight:500,margin:'8px 0'}}>Сыр по мотивам традиции</h3>
          <p style={{fontSize:11,lineHeight:1.65,color:'var(--muted)'}}>Фото товара российского каталога используется только для визуальной иллюстрации. Живого каталога здесь нет.</p>
          <div style={{borderTop:'1px solid var(--line)',paddingTop:12,fontSize:11}}>Демо-цена: <strong>790 ₽ / 180 г</strong><div style={{fontSize:9,color:'var(--muted)',marginTop:3}}>Условная цена, не предложение к покупке</div></div>
          <button className="dg-btn" onClick={()=>setDemoAdded(v=>!v)} style={{width:'100%',justifyContent:'center',marginTop:14}}><ShoppingBasket size={14}/>{demoAdded?'Демо-выбор отмечен':'Отметить в демо-списке'}</button>
          {demoAdded&&<p role="status" style={{fontSize:10,lineHeight:1.5,color:'var(--olive-dark)'}}>Только локальная отметка прототипа. Ничего не добавлено в настоящий магазин или корзину.</p>}
          <a href="/__mockup/preview/editorial/CheeseMap" style={{display:'flex',justifyContent:'space-between',fontSize:11,marginTop:18,color:'var(--olive-dark)'}}>Найти на карте <ArrowRight size={13}/></a>
        </aside>
      </section>
      <section style={{borderTop:'1px solid var(--line)',marginTop:30,paddingTop:22}}>
        <div className="dg-kicker">Продолжить знакомство</div><div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}>
          {cheeses.filter(c=>c.id!==id).map(c=><button key={c.id} onClick={()=>jump(c.id)} className="dg-card" style={{display:'flex',alignItems:'center',gap:12,padding:10,cursor:'pointer',color:'var(--ink)',textAlign:'left'}}><img src={c.image} alt="" style={{width:48,height:48,objectFit:'cover'}}/><span><strong style={{fontSize:12}}>{c.title}</strong><span style={{display:'block',fontSize:10,color:'var(--muted)',marginTop:3}}>{c.country}</span></span></button>)}
        </div>
      </section>
    </main>
  </Shell>;
}
