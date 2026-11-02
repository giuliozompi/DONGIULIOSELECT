import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ExternalLink, Globe2, MapPin, Play, Search, ShoppingCart } from 'lucide-react';
import { editorialPublicApi, type PublicCheese, type PublicCheeseSummary, type PublicMarketPrice, type PublicVideo } from './editorialPublicApi';
import { webApi } from '../lib/webApi';
import { useWebCart } from '../hooks/useWebCart';
import { useWebAuth } from '../hooks/useWebAuth';
import { getCartQuantityRules } from '@shared/order-quantity';
import CheesePriceSubmissions from './CheesePriceSubmissions';
import RubleConversion from './RubleConversion';
import './cheese-price-submissions.css';
import './editorial.css';

const PAGE_SIZE = 12;
const categoryLabels: Record<string, string> = {
  recipe: 'Рецепты', interview: 'Интервью', review: 'Обзоры', places: 'Места',
};
const videoCategories = [
  { id: 'recipe', title: 'Видеорецепты', detail: 'Блюда, техники и кухня Джулио.' },
  { id: 'interview', title: 'Разговоры и интервью', detail: 'Беседы с людьми и их делом.' },
  { id: 'review', title: 'Мнения о продуктах', detail: 'Взгляд на продукты и вкусы.' },
  { id: 'places', title: 'Поездки и места', detail: 'Рынки, рестораны и гастрономические места.' },
];

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось загрузить данные. Попробуйте ещё раз.';
}
function youtubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(parsed.hostname)) {
      if (parsed.pathname === '/watch' && /^[\w-]+$/.test(parsed.searchParams.get('v') || '')) return `https://www.youtube-nocookie.com/embed/${parsed.searchParams.get('v')}`;
      if (parsed.pathname === '/playlist' && /^[\w-]+$/.test(parsed.searchParams.get('list') || '')) return `https://www.youtube-nocookie.com/embed/videoseries?list=${parsed.searchParams.get('list')}`;
      const id = parsed.pathname.match(/^\/(?:shorts|live)\/([\w-]+)\/?$/)?.[1];
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (parsed.hostname === 'youtu.be' && /^\/[\w-]+\/?$/.test(parsed.pathname)) return `https://www.youtube-nocookie.com/embed/${parsed.pathname.slice(1)}`;
  } catch { /* malformed links remain ordinary source links */ }
  return null;
}
function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="ed-source" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={14} aria-hidden="true" /></a>;
}
function Intro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <header className="ed-intro"><div className="ed-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></header>;
}
function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="ed-error" role="alert"><span>{message(error)}</span><button onClick={retry}>Повторить</button></div>;
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="ed-empty" role="status">{children}</div>;
}
function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (page: number) => void }) {
  if (total <= limit) return null;
  return <nav className="ed-pager" aria-label="Страницы"><span>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}</span><div>
    <button disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</button><button disabled={page * limit >= total} onClick={() => onPage(page + 1)}>Далее</button>
  </div></nav>;
}
function Image({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed ? <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} /> :
    <div className={`${className} ed-image-empty`} aria-label={alt || 'Фотография недоступна'}>Фотография недоступна</div>;
}
function VideoCard({ item }: { item: PublicVideo }) {
  return <Link href={`/web/videos/${item.id}`} className="ed-card ed-video-card">
    <Image src={item.cover} alt="" className="ed-video-cover" />
    <div className="ed-card-body"><span className="ed-kicker">{categoryLabels[item.category] || item.category}</span><h2>{item.title}</h2><p>{item.description || 'Описание не предоставлено.'}</p><span className="ed-read">Открыть материал <ArrowRight size={15} /></span></div>
  </Link>;
}
function CheeseCard({ item }: { item: PublicCheeseSummary }) {
  const originalName = item.nameOriginal;
  return <Link href={`/web/cheeses/${item.id}`} className="ed-card ed-cheese-card">
    <Image src={item.photo} alt={item.title} className="ed-cheese-photo" />
    <div className="ed-card-body"><span className="ed-kicker">{item.country}{item.region ? ` · ${item.region}` : ''}</span><h2>{item.title}{originalName && <span className="ml-2 text-sm font-normal italic text-[#738078]">{originalName}</span>}</h2><p>{item.description || 'Описание не предоставлено.'}</p><span className="ed-read">Читать статью <ArrowRight size={15} /></span></div>
  </Link>;
}

export function VideosPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['/web-api/editorial/videos', search, category, page],
    queryFn: () => editorialPublicApi.videos({ search: search.trim() || undefined, category: category || undefined, page, limit: PAGE_SIZE }),
  });
  const videoPage = query.data;
  return <div className="ed-page">
    <Intro eyebrow="VIDEO DON GIULIO · ВИДЕОТЕКА" title="Джулио смотрит на мир — и рассказывает." text="Итальянский продюсер и рассказчик о еде в России. Самостоятельная видеотека: рецепты, интервью, мнения о продуктах и места." />
    <div className="ed-note">Видеоматериалы публикуются редакцией отдельно. Здесь отображаются только опубликованные записи.</div>
    <section className="ed-section">
      <div className="ed-section-heading"><div><div className="ed-kicker">Четыре направления</div><h2>Что смотрим у Джулио</h2></div><Link href="/web/cheeses" className="ed-outline-link">Отдельно: атлас сыров <ArrowRight size={15} /></Link></div>
      <div className="ed-category-grid">{videoCategories.map(item => <button key={item.id} aria-pressed={category === item.id} className={`ed-category ${category === item.id ? 'selected' : ''}`} onClick={() => { setCategory(category === item.id ? '' : item.id); setPage(1); }}><strong>{item.title}</strong><span>{item.detail}</span></button>)}</div>
      <div className="ed-filter-row"><label className="ed-search"><Search size={17} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Найти видео" aria-label="Найти видео" /></label>
        <label className="ed-filter-select">Категория <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Все направления</option>{videoCategories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      </div>
      {query.isLoading ? <div className="ed-loading" aria-label="Загрузка видео">Загружаем видеотеку…</div> : query.isError ? <ErrorBox error={query.error} retry={() => query.refetch()} /> :
        videoPage ? videoPage.items.length ? <><div className="ed-video-grid">{videoPage.items.map(item => <VideoCard item={item} key={item.id} />)}</div><Pager page={videoPage.page} total={videoPage.total} limit={videoPage.limit} onPage={setPage} /></> :
          <Empty>{search || category ? 'По заданным фильтрам видео не найдены.' : 'Опубликованных видеоматериалов пока нет.'}</Empty> : <Empty>Опубликованных видеоматериалов пока нет.</Empty>}
    </section>
  </div>;
}

export function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [playing, setPlaying] = useState(false);
  const query = useQuery({ queryKey: ['/web-api/editorial/video', id], queryFn: () => editorialPublicApi.video(id!), enabled: !!id });
  useEffect(() => { setPlaying(false); }, [id]);
  const video = query.data?.id === id ? query.data : undefined;
  const embed = video ? youtubeEmbed(video.url) : null;
  return <div className="ed-page">
    <Link className="ed-back" href="/web/videos"><ArrowLeft size={16} /> Все видео</Link>
    {query.isLoading ? <div className="ed-loading">Загружаем материал…</div> : query.isError ? <ErrorBox error={query.error} retry={() => query.refetch()} /> : !video ? <Empty>Материал не найден.</Empty> :
      <article className="ed-article">
        <header className="ed-article-head"><div className="ed-eyebrow">{categoryLabels[video.category] || video.category} · Don Giulio Select</div><h1>{video.title}</h1><p>{video.description || 'Описание не предоставлено.'}</p></header>
        {embed ? <section className="ed-video-player">{playing ? <iframe title={video.title} src={`${embed}${embed.includes('?') ? '&' : '?'}playsinline=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <button onClick={() => setPlaying(true)} className="ed-player-start"><span><Play size={20} /></span><strong>Нажмите, чтобы загрузить плеер</strong><small>Воспроизведение может быть недоступно в вашем регионе</small></button>}</section> :
          <div className="ed-note">Встроенное воспроизведение для этого источника недоступно. Откройте оригинальную публикацию.</div>}
        <SourceLink href={video.url}>Открыть оригинальный источник</SourceLink>
        {embed && <div className="ed-note">Воспроизведение не гарантируется и может быть недоступно в России. Если плеер не работает, используйте ссылку на оригинальный источник.</div>}
        {video.relatedCheeses.length > 0 && <section className="ed-section"><div className="ed-kicker">Связанные статьи атласа</div><div className="ed-related-grid">{video.relatedCheeses.map(item => <CheeseCard key={item.id} item={item} />)}</div></section>}
      </article>}
  </div>;
}

type GeoFeature = { geometry?: { type: string; coordinates: any } };
function pathGeometry(coords: any, project: (point: number[]) => [number, number]): string {
  if (!Array.isArray(coords) || !coords.length) return '';
  if (typeof coords[0] === 'number') return '';
  if (typeof coords[0]?.[0] === 'number') return coords.map((point: number[], index: number) => {
    const [x, y] = project(point);
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
  return coords.map((part: any) => pathGeometry(part, project)).join(' ');
}
type MapPin = { item: PublicCheeseSummary; x: number; y: number };

export function CheeseAtlasPage() {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'italy' | 'world'>('italy');
  const [selected, setSelected] = useState<string | null>(null);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  useEffect(() => { setSelected(null); setClusterIds([]); }, [search, country, view]);
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [geometryError, setGeometryError] = useState(false);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const [mapScale, setMapScale] = useState(1);
  const list = useQuery({
    queryKey: ['/web-api/editorial/cheeses', search, country, page],
    queryFn: () => editorialPublicApi.cheeses({ search: search.trim() || undefined, country: country || undefined, page, limit: PAGE_SIZE }),
  });
  const map = useQuery({
    queryKey: ['/web-api/editorial/map', search, country],
    queryFn: () => editorialPublicApi.map({ search: search.trim() || undefined, country: country || undefined }),
  });
  useEffect(() => {
    let active = true;
    fetch('/editorial/world.geojson').then(response => { if (!response.ok) throw new Error('Не удалось загрузить географический контур.'); return response.json(); })
      .then(data => { if (active) setFeatures(data.features || []); })
      .catch(() => { if (active) setGeometryError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const element = mapBoxRef.current;
    if (!element) return;
    const updateScale = () => setMapScale(element.clientWidth / 860 || 1);
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const W = 860, H = view === 'italy' ? 490 : 390;
  const bounds = view === 'italy' ? [-7, 20, 35, 52] : [-180, 180, -60, 85];
  const project = (point: number[]): [number, number] => [(point[0] - bounds[0]) / (bounds[1] - bounds[0]) * W, (bounds[3] - point[1]) / (bounds[3] - bounds[2]) * H];
  const shapes = useMemo(() => features.map((feature, index) => {
    const geometry = feature.geometry;
    if (!geometry) return { key: String(index), d: '' };
    const d = geometry.type === 'Polygon' ? pathGeometry(geometry.coordinates, project) : geometry.type === 'MultiPolygon' ? geometry.coordinates.map((part: any) => pathGeometry(part, project)).join(' ') : '';
    return { key: String(index), d };
  }).filter(shape => shape.d), [features, view]);
  const pins = useMemo(() => (map.data?.items || []).flatMap(item => item.latitude == null || item.longitude == null ? [] : (() => { const [x, y] = project([item.longitude, item.latitude]); return x < 0 || x > W || y < 0 || y > H ? [] : [{ item, x, y }]; })()), [map.data, view]);
  const clusters = useMemo(() => {
    const grouped: MapPin[][] = [];
    pins.forEach(pin => {
      const prior = grouped.find(group => Math.hypot(group[0].x - pin.x, group[0].y - pin.y) * mapScale < 125);
      if (prior) prior.push(pin); else grouped.push([pin]);
    });
    return grouped;
  }, [pins, mapScale]);
  const focus = map.data?.items.find(item => item.id === selected);
  const countries = list.data?.countries || [];
  const cheesePage = list.data;
  return <div className="ed-page">
    <Intro eyebrow="ATLANTE DEI FORMAGGI · СЫРНЫЙ АТЛАС" title="У каждого вкуса есть адрес." text="Энциклопедия сырной географии: статьи о традициях и регионах. Географическое происхождение не подтверждает место производства конкретного продукта." />
    <div className="ed-map-controls"><button className={view === 'italy' ? 'active' : ''} onClick={() => setView('italy')}><MapPin size={16} /> Италия и окрестности</button><button className={view === 'world' ? 'active' : ''} onClick={() => setView('world')}><Globe2 size={16} /> Весь мир</button></div>
    <div className="ed-filter-row"><label className="ed-search"><Search size={17} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); setSelected(null); }} placeholder="Название, страна или регион" aria-label="Поиск сырных статей" /></label><label className="ed-filter-select">Страна <select value={country} onChange={e => { setCountry(e.target.value); setPage(1); setSelected(null); }}><option value="">Все страны</option>{countries.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {map.isError && <ErrorBox error={map.error} retry={() => map.refetch()} />}
    {map.data?.truncated && <div className="ed-note">Показаны первые 1000 статей на карте. Используйте поиск или список, чтобы найти другие.</div>}
    <div className="ed-map-layout">
      <section className="ed-map-box">
        {geometryError && <div className="ed-map-warning" role="status">Контур карты не загрузился. Список статей ниже остаётся доступен.</div>}
        {map.isLoading ? <div className="ed-loading">Загружаем географию…</div> : map.data && !map.data.items.length ? <Empty>Нет опубликованных сырных статей с координатами для карты.</Empty> : <div ref={mapBoxRef} className="ed-map-canvas" style={{ aspectRatio: `${W}/${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={view === 'italy' ? 'Карта Италии и Европы' : 'Карта мира'}><rect width={W} height={H} fill="#e7eee8" />{shapes.map(shape => <path key={shape.key} d={shape.d} fill="#d2d7c7" stroke="#f8f5ed" strokeWidth={view === 'italy' ? 1.2 : .65} />)}</svg>
          {clusters.map((cluster, i) => {
            const center = cluster.reduce((acc, pin) => ({ x: acc.x + pin.x / cluster.length, y: acc.y + pin.y / cluster.length }), { x: 0, y: 0 });
            const sole = cluster.length === 1 ? cluster[0] : null;
            return <button key={cluster.map(pin => pin.item.id).join(':') || i} className={`ed-map-pin ${clusterIds.includes(cluster[0].item.id) ? 'cluster-active' : ''}`} style={{ left: `${center.x / W * 100}%`, top: `${center.y / H * 100}%` }} aria-label={sole ? `${sole.item.title}, ${sole.item.region || sole.item.country}` : `Группа из ${cluster.length} сыров`} onClick={() => { if (sole) { setSelected(sole.item.id); setClusterIds([]); } else { setClusterIds(cluster.map(pin => pin.item.id)); setSelected(null); } }}>
              {sole ? <><Image src={sole.item.photo} alt="" className="ed-pin-photo" /><span className="ed-pin-label">{sole.item.title}</span></> : <span className="ed-pin-count">{cluster.length}</span>}
            </button>;
          })}
        </div>}
        <p className="ed-map-caption">География происхождения сыра; не место производства товара в каталоге. Нажмите точку или группу, чтобы выбрать статью.</p>
      </section>
      <aside className="ed-map-aside">
        <div className="ed-kicker">{focus ? `Регион происхождения · ${focus.country}` : clusterIds.length ? `${clusterIds.length} точки рядом` : 'Сырная география'}</div>
        {focus ? <><h2>{focus.title}{focus.nameOriginal && <span className="ml-2 text-sm font-normal italic text-[#738078]">{focus.nameOriginal}</span>}</h2><p>{focus.region || focus.country}</p><Image src={focus.photo} alt={focus.title} className="ed-aside-photo" /><p>{focus.description || 'Описание не предоставлено.'}</p><Link href={`/web/cheeses/${focus.id}`} className="ed-primary-link">Открыть статью <ArrowRight size={15} /></Link></> :
          clusterIds.length ? <div className="ed-pin-list">{map.data?.items.filter(item => clusterIds.includes(item.id)).map(item => <Link key={item.id} href={`/web/cheeses/${item.id}`} className="ed-pin-list-item"><Image src={item.photo} alt="" className="ed-pin-list-photo" /><span><strong>{item.title}</strong>{item.nameOriginal && <small>{item.nameOriginal}</small>}<small>{item.region || item.country}</small></span></Link>)}</div> :
          <p>Выберите точку на карте или статью из списка. Если карта недоступна, список остаётся основным способом навигации.</p>}
        <div className="ed-note">Историческое происхождение не означает, что конкретный товар произведён в этом регионе.</div>
      </aside>
    </div>
    <section className="ed-section"><div className="ed-section-heading"><div><div className="ed-kicker">Энциклопедия</div><h2>Статьи о сырах</h2></div></div>
      {list.isLoading ? <div className="ed-loading">Загружаем статьи…</div> : list.isError ? <ErrorBox error={list.error} retry={() => list.refetch()} /> : cheesePage && cheesePage.items.length ? <><div className="ed-cheese-grid">{cheesePage.items.map(item => <CheeseCard item={item} key={item.id} />)}</div><Pager page={cheesePage.page} total={cheesePage.total} limit={cheesePage.limit} onPage={setPage} /></> : <Empty>{search || country ? 'По заданным фильтрам статьи не найдены.' : 'Опубликованных статей пока нет.'}</Empty>}
    </section>
  </div>;
}

type LiveProduct = { id: string; name: string; slug: string; price: string; priceOld?: string; unit: string; images: string[]; inStock: boolean };
function ProductPurchase({ item }: { item: PublicCheese['products'][number] }) {
  const cartItem = useWebCart(state => state.items.find(entry => entry.productId === item.id));
  const [live, setLive] = useState<LiveProduct>(item);
  useEffect(() => { setLive(item); }, [item]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function addLatest() {
    if (lock.current || !live.inStock) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const latest = await webApi.get<LiveProduct>(`/products/${encodeURIComponent(item.slug)}`);
      if (latest.id !== item.id) throw new Error('Связанная позиция каталога изменилась. Обновите страницу и проверьте товар заново.');
      if (!Number.isFinite(Number(latest.price)) || Number(latest.price) < 0)
        throw new Error('Не удалось подтвердить цену товара. Корзина не изменена.');
      setLive(latest);
      if (!latest.inStock) throw new Error('Товар сейчас отсутствует в наличии и не добавлен в корзину.');
      const existingItem = useWebCart.getState().items.find(entry => entry.productId === latest.id);
      if (existingItem && existingItem.unit !== latest.unit) {
        throw new Error(`Единица товара изменилась с «${existingItem.unit}» на «${latest.unit}». Корзина не изменена: удалите прежнюю позицию и добавьте товар заново.`);
      }
      useWebCart.setState(state => {
        const exists = state.items.some(entry => entry.productId === latest.id);
        if (!exists) return state;
        const items = state.items.map(entry => entry.productId === latest.id ? { ...entry, productName: latest.name, price: latest.price, unit: latest.unit, image: latest.images?.[0] } : entry);
        return { items, itemCount: items.length, subtotal: items.reduce((sum, entry) => sum + parseFloat(entry.price) * entry.quantity, 0) };
      });
      const currentQuantity = useWebCart.getState().items.find(entry => entry.productId === latest.id)?.quantity ?? 0;
      const quantityRules = getCartQuantityRules(latest.unit);
      useWebCart.getState().addItem(
        { productId: latest.id, productName: latest.name, price: latest.price, unit: latest.unit, image: latest.images?.[0] },
        currentQuantity > 0 ? quantityRules.step : quantityRules.initial,
      );
      setNotice('Добавлено в корзину по текущей цене.'); 
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проверить товар. Попробуйте ещё раз.');
    } finally { lock.current = false; setBusy(false); }
  }
  return <div className="ed-product">
    <Image src={item.images?.[0]} alt={item.name} className="ed-product-image" />
    <div className="ed-product-info"><Link href={`/web/product/${item.slug}`}><strong>{live.name}</strong></Link><p>{live.price} ₽ / {live.unit}{live.inStock ? '' : ' · Нет в наличии'}</p>
      <button disabled={!live.inStock || busy} onClick={() => { void addLatest(); }}><ShoppingCart size={15} />{busy ? 'Проверяем…' : live.inStock ? 'В корзину' : 'Нет в наличии'}</button>
      {cartItem && <small>В корзине: {cartItem.quantity} {cartItem.unit}</small>}
      {notice && <small role="status">{notice}</small>}{error && <small role="alert" className="ed-product-error">{error}</small>}
    </div>
  </div>;
}
function PriceRows({ prices }: { prices: PublicMarketPrice[] }) {
  if (!prices.length) return <Empty>Одобренных наблюдений цен пока нет.</Empty>;
  return <RubleConversion prices={prices} />;
}
export function CheeseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const priceSubmissionOwner = useWebAuth(state => state.isAuthenticated ? state.user?.id ?? 'guest' : 'guest');
  const [pricePage, setPricePage] = useState(1);
  const cheeseQuery = useQuery({ queryKey: ['/web-api/editorial/cheese', id], queryFn: () => editorialPublicApi.cheese(id!), enabled: !!id });
  const pricesQuery = useQuery({ queryKey: ['/web-api/editorial/cheese-prices', id, pricePage], queryFn: () => editorialPublicApi.prices(id!, pricePage, 10), enabled: !!id });
  useEffect(() => { setPricePage(1); }, [id]);
  const cheese = cheeseQuery.data?.id === id ? cheeseQuery.data : undefined;
  const priceData = pricesQuery.data;
  return <div className="ed-page">
    <Link className="ed-back" href="/web/cheeses"><ArrowLeft size={16} /> Назад к атласу</Link>
    {cheeseQuery.isLoading ? <div className="ed-loading">Загружаем статью…</div> : cheeseQuery.isError ? <ErrorBox error={cheeseQuery.error} retry={() => cheeseQuery.refetch()} /> : !cheese ? <Empty>Статья не найдена.</Empty> :
      <article className="ed-article">
        <header className="ed-article-head"><div className="ed-eyebrow">История сыра · {cheese.country}{cheese.region ? ` · ${cheese.region}` : ''}</div><h1>{cheese.title}{cheese.nameOriginal && <span className="ml-3 text-lg font-normal italic text-[#738078]">{cheese.nameOriginal}</span>}</h1><p>{cheese.description || 'Описание не предоставлено.'}</p></header>
        <div className="ed-story-hero"><div><Image src={cheese.photos?.[0] || cheese.photo} alt={cheese.title} className="ed-story-photo" /><div className="ed-note">Материалы об истории и происхождении не удостоверяют место производства товара в российском каталоге.</div></div><div className="ed-story-content">
          <section><div className="ed-kicker">История</div><p>{cheese.history || 'Исторический материал не предоставлен.'}</p></section>
          <section><div className="ed-kicker">Характеристики</div><p>{cheese.characteristics || 'Характеристики не предоставлены.'}</p></section>
          <section><div className="ed-kicker">Кулинарное использование</div><p>{cheese.culinaryUses || 'Информация о кулинарном использовании не предоставлена.'}</p></section>
          <section><div className="ed-kicker">Производственная география</div><p>Страна происхождения: {cheese.country}{cheese.productionCountry ? `. Фактическая страна производства, указанная редакцией: ${cheese.productionCountry}.` : '. Фактическая страна производства здесь не указана.'}</p></section>
        </div></div>
        {cheese.photos?.length > 1 && <div className="ed-photo-strip">{cheese.photos.slice(1).map((photo, i) => <Image key={`${photo}-${i}`} src={photo} alt={`${cheese.title}, фото ${i + 2}`} className="ed-extra-photo" />)}</div>}
        <div className="ed-story-lower">
          <div>
             <section className="ed-section"><div className="ed-kicker">Проверяемые материалы</div><h2>Источники</h2>{cheese.sources.length ? <><ul className="ed-sources">{cheese.sources.map(url => <li key={url}><SourceLink href={url}>{url}</SourceLink></li>)}</ul>{cheese.sources.some(url => /^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(url)) && <p className="mt-2 text-xs text-[#738078]">© OpenStreetMap contributors · <a className="underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">условия атрибуции</a></p>}</> : <Empty>Источники не указаны.</Empty>}</section>
            <section className="ed-section"><div className="ed-kicker">Отдельные наблюдения</div><h2>Рыночные цены</h2><p className="ed-muted">Информационные данные, не цены и не наличие товаров в каталоге. Каждое наблюдение показывается отдельно.</p>
              {pricesQuery.isLoading ? <div className="ed-loading">Загружаем наблюдения…</div> : pricesQuery.isError ? <ErrorBox error={pricesQuery.error} retry={() => pricesQuery.refetch()} /> : priceData && priceData.items.length ? <><PriceRows prices={priceData.items} /><Pager page={priceData.page} total={priceData.total} limit={priceData.limit} onPage={setPricePage} /></> : <Empty>Одобренных наблюдений цен пока нет.</Empty>}
              <CheesePriceSubmissions key={`${id}:${priceSubmissionOwner}`} cheeseId={id!} />
            </section>
          </div>
          <aside className="ed-product-aside"><div className="ed-kicker">Товары каталога</div><h2>В наличии в магазине</h2><p>Это текущие товары российского каталога, не подтверждение происхождения сыра.</p>{cheese.products.length ? cheese.products.map(item => <ProductPurchase item={item} key={item.id} />) : <Empty>Связанных товаров каталога нет.</Empty>}</aside>
        </div>
        {cheese.relatedVideos.length > 0 && <section className="ed-section"><div className="ed-kicker">Редакционная связь</div><h2>Связанные видео</h2><div className="ed-related-grid">{cheese.relatedVideos.map(item => <VideoCard key={item.id} item={item} />)}</div></section>}
        {cheese.externalVideoUrls.length > 0 && <section className="ed-section"><div className="ed-kicker">Другие источники</div><h2>Видео по внешним ссылкам</h2><div className="ed-source-list">{cheese.externalVideoUrls.map(url => <div key={url} className="ed-external-video"><SourceLink href={url}>Открыть источник видео</SourceLink>{youtubeEmbed(url) && <span>Внешний плеер можно загрузить по нажатию в связанном видео.</span>}</div>)}</div></section>}
      </article>}
  </div>;
}
