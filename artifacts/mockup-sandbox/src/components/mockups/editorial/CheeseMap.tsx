import React,{useEffect,useMemo,useState} from 'react';
import { ArrowRight, MapPin, ZoomIn, Globe2 } from 'lucide-react';
import { Shell,PageIntro,DemoNotice,cheeses } from './_shared';

type Feature={type:string;geometry:{type:string;coordinates:any}};
function coordsToPath(coords:any,project:(p:number[])=>[number,number]):string {
  if(!Array.isArray(coords) || !coords.length) return '';
  if(typeof coords[0]==='number') return '';
  if(Array.isArray(coords[0]) && typeof coords[0][0]==='number') return coords.map((p:number[],i:number)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`}).join(' ')+' Z';
  return coords.map((c:any)=>coordsToPath(c,project)).join(' ');
}
export function CheeseMap() {
  const [features,setFeatures]=useState<Feature[]>([]);
  const [view,setView]=useState<'italy'|'world'>('italy');
  const [selected,setSelected]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [country,setCountry]=useState('all');
  const [error,setError]=useState(false);
  useEffect(()=>{let live=true;fetch('/__mockup/images/world.geojson').then(r=>{if(!r.ok) throw Error();return r.json()}).then(data=>{if(live)setFeatures(data.features||[])}).catch(()=>{if(live)setError(true)});return()=>{live=false}},[]);
  const bounds=view==='italy'?[-7,20,35,52]:[-180,180,-60,85];
  const W=860,H=view==='italy'?490:390;
  const project=(p:number[]):[number,number]=>[(p[0]-bounds[0])/(bounds[1]-bounds[0])*W,(bounds[3]-p[1])/(bounds[3]-bounds[2])*H];
  const shapes=useMemo(()=>features.map((f,i)=>({key:`${i}`,d:f.geometry?.type==='Polygon'?coordsToPath(f.geometry.coordinates,project):f.geometry?.type==='MultiPolygon'?f.geometry.coordinates.map((c:any)=>coordsToPath(c,project)).join(' '):''})).filter(s=>s.d),[features,view]);
  const focus=selected?cheeses.find(c=>c.id===selected):null;
  const visible=cheeses.filter(c=>(country==='all'||c.country===country)&&`${c.title} ${c.latin} ${c.region}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pinStyle=(c:typeof cheeses[number]):React.CSSProperties=>{const [x,y]=project(c.coords);return {left:`${x/W*100}%`,top:`${y/H*100}%`}};
  return <Shell active="CheeseMap">
    <main className="dg-shell dg-main">
      <PageIntro eyebrow="Atlante dei formaggi · сырный атлас" title="У каждого вкуса есть адрес." description="Откройте регион происхождения и сравните две традиции. Карта показывает географию, а не места производства продуктов российского каталога."/>
      <div style={{display:'flex',gap:9,margin:'22px 0 13px',flexWrap:'wrap'}}>
        <button className={`dg-btn ${view==='italy'?'':'secondary'}`} onClick={()=>setView('italy')}><MapPin size={14}/> Италия и Франция</button>
        <button className={`dg-btn ${view==='world'?'':'secondary'}`} onClick={()=>setView('world')}><Globe2 size={14}/> Весь мир</button>
      </div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
        <label style={{flex:'1 1 200px'}}><span className="dg-label">Найти сыр</span><input className="dg-input" value={query} onChange={e=>{setQuery(e.target.value);setSelected(null)}} placeholder="Название или регион"/></label>
        <label style={{flex:'0 1 180px'}}><span className="dg-label">Страна происхождения</span><select className="dg-select" value={country} onChange={e=>{setCountry(e.target.value);setSelected(null)}}><option value="all">Все страны</option><option>Италия</option><option>Франция</option></select></label>
      </div>
      <div className="dg-split" style={{gridTemplateColumns:'1.55fr .78fr',alignItems:'stretch',gap:20}}>
        <section className="dg-card" style={{padding:12,position:'relative',overflow:'hidden'}}>
          <div style={{position:'relative',width:'100%',aspectRatio:`${W}/${H}`,background:'#e7eee8'}}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}} aria-label="Географическая карта">
              <rect width={W} height={H} fill="#e7eee8"/>
              {shapes.map(s=><path key={s.key} d={s.d} fill="#d2d7c7" stroke="#f7f5ee" strokeWidth={view==='italy'?1.4:.7}/>)}
              {error&&<text x="20" y="30" fill="#765b3a" fontSize="14">Не удалось загрузить контур карты</text>}
            </svg>
            {view==='world'&&visible.length>0?<button className="dg-photo-pin" title="Открыть сыры Европы" aria-label={`Открыть Европу: ${visible.length} сыра`} onClick={()=>setView('italy')} style={pinStyle({...visible[0],coords:[5,47]})}><img src={visible[0].image} alt=""/><span>Европа · {visible.length}</span></button>:visible.map(c=><button key={c.id} className="dg-photo-pin" aria-label={`${c.title} · ${c.region}`} aria-pressed={selected===c.id} title={`${c.title} · ${c.region}`} onClick={()=>setSelected(c.id)} style={{...pinStyle(c),zIndex:selected===c.id?2:1}}>
              <img src={c.image} alt=""/><span>{c.title}</span>
            </button>)}
            {view==='world'&&<div style={{position:'absolute',bottom:11,left:12,fontSize:10,color:'#5d6f63',background:'#f8f5eddd',padding:'5px 8px'}}>Европа · интерактивные отметки</div>}
          </div>
          <div style={{fontSize:10,color:'var(--muted)',padding:'10px 3px 0'}}>Контур: Natural Earth 110m · общедоступная география. Нажмите на метку, чтобы открыть карточку.</div>
        </section>
        <aside className="dg-card" style={{padding:20,display:'flex',flexDirection:'column'}}>
          {focus?<>
            <span className="dg-kicker">Регион происхождения · {focus.country}</span>
            <h2 className="serif" style={{fontWeight:500,fontSize:29,margin:'8px 0 4px'}}>{focus.title}</h2>
            <div style={{fontSize:12,color:'var(--muted)'}}>{focus.region}</div>
            <div style={{height:150,margin:'18px 0 14px',overflow:'hidden'}}><img src={focus.image} alt={`Иллюстрация продукта: ${focus.title}`} className="dg-image"/></div>
            <DemoNotice>{focus.caption} Демонстрационный материал, не проверен.</DemoNotice>
            <p style={{fontSize:12,lineHeight:1.7,color:'var(--muted)',margin:'15px 0 18px'}}>{focus.history}</p>
            <a className="dg-btn" href={`/__mockup/preview/editorial/CheeseStory?cheese=${focus.id}`} style={{justifyContent:'center',marginTop:'auto'}}>Открыть историю <ArrowRight size={14}/></a>
          </>:<>
            <span className="dg-kicker">Ваш выбор</span><h2 className="serif" style={{fontSize:25,fontWeight:500,margin:'9px 0 6px'}}>Выберите точку на карте</h2>
            <p style={{fontSize:12,lineHeight:1.7,color:'var(--muted)'}}>Две демонстрационные истории: голубой сыр из Ломбардии и мягкий сыр из Нормандии.</p>
            {visible.length===0&&<p role="status">Ничего не найдено. Измените название или страну.</p>}
            {visible.map(c=><button key={c.id} onClick={()=>setSelected(c.id)} className="dg-card" style={{marginTop:11,padding:12,display:'flex',alignItems:'center',gap:12,textAlign:'left',cursor:'pointer',color:'var(--ink)'}}>
              <img src={c.image} alt="" style={{width:54,height:54,objectFit:'cover'}}/><span><strong style={{fontSize:13}}>{c.title}</strong><span style={{display:'block',fontSize:10,color:'var(--muted)',marginTop:4}}>{c.region}</span></span><ZoomIn size={14} style={{marginLeft:'auto'}}/>
            </button>)}
            <div className="dg-notice" style={{marginTop:'auto'}}>Историческое происхождение не означает, что конкретный продукт произведён в этом регионе.</div>
          </>}
        </aside>
      </div>
    </main>
  </Shell>;
}
