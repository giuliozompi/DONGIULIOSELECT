import React from 'react';
import './_group.css';

export const VIDEOS_URL = 'https://www.youtube.com/playlist?list=PLr2lpSOEo-7IyZFeC_BR3xx5gox3EWDWZ';
export const TELEGRAM_URL = 'https://t.me/dongiulioselect/128';
export const YOUTUBE_EMBED = 'https://www.youtube.com/embed/videoseries?list=PLr2lpSOEo-7IyZFeC_BR3xx5gox3EWDWZ&playsinline=1';
export const cheeses = [
  { id:'gorgonzola', title:'Горгонзола', latin:'Gorgonzola', country:'Италия', region:'Ломбардия и Пьемонт', coords:[9.19,45.46], type:'Голубой сыр', image:'/__mockup/images/blue-cheese.jpg', caption:'Иллюстрация: сыр из российского каталога, не образец PDO.', history:'Горгонзола — исторический итальянский голубой сыр, связанный с Ломбардией и Пьемонтом. Современное название защищено географическим обозначением в рамках европейской системы; это не означает, что сыр российского производства имеет такой статус.', milk:'Коровье молоко; конкретные характеристики зависят от производителя и рецептуры.', process:'Сырную массу прокалывают, чтобы создать условия для развития голубой плесени внутри. Технологические детали у разных сыроварен различаются.', mature:'Мягкая или более плотная паста и характер прожилок зависят от выдержки и стиля.', taste:'Сливочный, солоноватый и выразительный профиль; острота может меняться от нежной до интенсивной.', pair:'Груша, мёд, орехи, хлеб с корочкой; в горячей кухне — соус или ризотто.', sources:['Consorzio per la Tutela del Formaggio Gorgonzola — справочная страница (источник для проверки редактором)','European Commission eAmbrosia — реестр географических указаний (проверить актуальную запись)'] },
  { id:'camembert', title:'Камамбер', latin:'Camembert', country:'Франция', region:'Нормандия', coords:[0.18,49.09], type:'С мягкой белой плесенью', image:'/__mockup/images/camembert.jpg', caption:'Иллюстрация: фотография товара из российского каталога, не образец PDO.', history:'Камамбер связан с Нормандией во Франции. Название Camembert de Normandie имеет отдельный статус PDO, но общее название и сыр российского производства не следует автоматически отождествлять с сертифицированным продуктом.', milk:'Традиционные нормандские варианты известны использованием коровьего молока; состав конкретного продукта нужно сверять с маркировкой.', process:'На поверхности развивается белая культура плесени, формируя характерную корочку. Точные способы производства неодинаковы.', mature:'По мере созревания центр становится мягче; температура подачи заметно влияет на текстуру.', taste:'Сливочный, грибной и иногда слегка землистый профиль — впечатление зависит от зрелости.', pair:'Яблоки, багет, лёгкие белые вина и простые зелёные салаты.', sources:['INAO — материалы о защищённых наименованиях Франции (источник для проверки редактором)','European Commission eAmbrosia — реестр географических указаний (проверить актуальную запись)'] }
];

export function Header({ active }: { active: string }) {
  const links = [['Видео Don Giulio','Videos'],['Атлас сыров','CheeseMap'],['Статья · демо','CheeseStory'],['Редакция · демо','EditorialAdmin']];
  return <header className="dg-top"><div className="dg-shell dg-top-in">
    <a href="/__mockup/preview/editorial/Videos" className="dg-brand"><span className="dg-seal">DG</span><span><strong>Don Giulio Select</strong><small>bottega · storie di gusto · прототип</small></span></a>
    <nav className="dg-nav">{links.map(([label,to])=><a key={to} href={`/__mockup/preview/editorial/${to}`} className={active===to?'active':''}>{label}</a>)}</nav>
    <span className="dg-demo">Демо · не магазин</span>
  </div></header>;
}
export function Shell({active,children}:{active:string;children:React.ReactNode}) {
  return <div className="dg"><Header active={active}/>{children}<footer className="dg-footer"><div className="dg-shell">Don Giulio Select · редакционный прототип. Демонстрационные факты не проверены; не является подтверждённой энциклопедией или живым каталогом.</div></footer></div>;
}
export function PageIntro({eyebrow,title,description}:{eyebrow:string;title:string;description:string}) {
  return <div><div className="dg-eyebrow">{eyebrow}</div><h1 className="dg-title">{title}</h1><p className="dg-sub">{description}</p></div>;
}
export function DemoNotice({children}:{children?:React.ReactNode}) {
  return <div className="dg-notice">{children || 'Демонстрационные материалы: факты и источники не проверены редактором. Изображение иллюстративное.'}</div>;
}
