import { Link, useLocation } from 'wouter';
import {
  Truck, MapPin, Package, CreditCard, CheckCircle, Shield, Receipt, ChevronRight, Store,
} from 'lucide-react';
import { useWebMeta } from '../hooks/useWebMeta';
import { Button } from '@/components/ui/button';
import { MOSCOW_DELIVERY_RUB, WEB_PICKUP, WEB_MOSCOW_DELIVERY_TEXT, WEB_REGIONAL_DELIVERY_TEXT } from '@shared/web-delivery';

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-5 h-5 text-amber-700" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function InfoCard({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-5 space-y-3 ${accent || ''}`}>
      <h3 className="font-semibold text-neutral-900 text-sm">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-neutral-800 text-right">{value}</span>
    </div>
  );
}

export default function WebDeliveryPage() {
  const [, setLocation] = useLocation();

  useWebMeta({
    title: 'Доставка и оплата',
    description: 'Доставка по Москве — 1 000 ₽, по Московской области и регионам — по тарифам курьерской службы. Бесплатный самовывоз на Покровке и оплата онлайн.',
  });

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* HERO */}
      <div className="relative overflow-hidden bg-neutral-900">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1586201375761-83865001e31c?w=1600&q=80')" }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-3">Don Giulio Select</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
            Доставка и оплата
          </h1>
          <p className="text-neutral-300 text-base max-w-xl leading-relaxed">
            Мы доставляем итальянские деликатесы по Москве и по всей России.
            Вся продукция упакована в термоизолирующую тару, чтобы сохранить свежесть и качество.
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            {[
              { icon: CheckCircle, text: 'Бережная упаковка' },
              { icon: Shield, text: 'Гарантия качества' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-sm text-neutral-200">
                <Icon className="w-4 h-4 text-amber-400" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-14">

        {/* DELIVERY */}
        <section>
          <SectionTitle
            icon={Truck}
            title="Способы доставки"
            subtitle="Выберите удобный вариант — мы позаботимся об остальном"
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <InfoCard title="Доставка по Москве">
              <p className="text-sm text-neutral-600">{WEB_MOSCOW_DELIVERY_TEXT}</p>
              <Row label="Стоимость" value={`${MOSCOW_DELIVERY_RUB.toLocaleString('ru-RU')} ₽`} />
            </InfoCard>
            <InfoCard title="Доставка по Московской области и регионам">
              <p className="text-sm text-neutral-600">{WEB_REGIONAL_DELIVERY_TEXT}</p>
              <Row label="Стоимость" value="По тарифам курьерской службы" />
            </InfoCard>
          </div>

          {/* Packaging note */}
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Package className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 leading-relaxed">
              <strong>Упаковка и температурный режим.</strong> Все заказы упаковываются в термоизолирующие контейнеры с хладоэлементами, чтобы мясные деликатесы, сыры и другие скоропортящиеся продукты оставались свежими во время доставки.
            </p>
          </div>
        </section>

        {/* PICKUP */}
        <section>
          <SectionTitle icon={Store} title="Самовывоз" subtitle="Бесплатно — заберите заказ сами в удобное время" />
          <InfoCard title={WEB_PICKUP.label}>
            <p className="flex items-center gap-2 text-sm text-neutral-600">
              <MapPin className="w-4 h-4 text-neutral-400 shrink-0" /> {WEB_PICKUP.address}
            </p>
          </InfoCard>
        </section>

        {/* PAYMENT */}
        <section>
          <SectionTitle
            icon={CreditCard}
            title="Способы оплаты"
            subtitle="Заказы оплачиваются только онлайн"
          />

          <div className="grid sm:grid-cols-2 gap-4">

            {/* Online payment */}
            <div className="bg-white rounded-xl border p-5 space-y-3 hover:border-amber-300 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-green-600" />
                </div>
                <span className="font-semibold text-neutral-900 text-sm">Онлайн-оплата</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Безопасная оплата через платёжную систему ЮKassa. После подтверждения заказа вам придёт ссылка на оплату.
              </p>
              <ul className="space-y-1.5">
                {[
                  'Банковская карта (Visa, Mastercard, МИР)',
                  'СБП (Система быстрых платежей)',
                  'ЮMoney, SberPay и другие методы',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-neutral-600">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </section>

        {/* FISCAL / RECEIPT */}
        <section>
          <SectionTitle
            icon={Receipt}
            title="Кассовый чек"
            subtitle="Полное соответствие требованиям 54-ФЗ"
          />
          <div className="bg-white rounded-xl border p-5 sm:p-6">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-sm text-neutral-600 leading-relaxed">
                  При онлайн-оплате мы автоматически формируем и отправляем вам электронный кассовый чек в соответствии с Федеральным законом 54-ФЗ. Чек приходит на вашу электронную почту сразу после подтверждения платежа.
                </p>
                <ul className="space-y-2">
                  {[
                    'Электронный чек на email',
                    'Полный перечень товаров с ценами',
                    'Маркировочные коды продукции (там где применимо)',
                    'ОФД в соответствии с законодательством РФ',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-neutral-700">
                      <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Для получения чека укажите</p>
                <div className="space-y-2">
                  {[
                    { label: 'Email', desc: 'при оформлении заказа или в личном кабинете' },
                    { label: 'ИНН', desc: 'для юридических лиц и ИП' },
                  ].map(({ label, desc }) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-xs font-medium text-amber-700 w-10 shrink-0 pt-0.5">{label}</span>
                      <span className="text-xs text-neutral-500">{desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-neutral-400 pt-1 border-t border-neutral-200">
                  Чек можно запросить повторно в разделе «Мои заказы» в личном кабинете.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <SectionTitle
            icon={CheckCircle}
            title="Часто задаваемые вопросы"
          />
          <div className="space-y-3">
            {[
              {
                q: 'Как узнать, доставляете ли вы в мой район?',
                a: 'Введите полный адрес при оформлении. Для подтверждённого адреса в Москве сайт добавит доставку к заказу; за пределами Москвы стоимость и сроки уточнит менеджер.',
              },
              {
                q: 'Как отследить заказ?',
                a: 'После передачи заказа курьеру вы получите уведомление в Telegram или на email. Статус заказа можно отслеживать в разделе «Мои заказы».',
              },
              {
                q: 'Можно ли изменить или отменить заказ?',
                a: 'Свяжитесь с нами как можно скорее по телефону или в Telegram. Пока заказ не передан курьеру, мы постараемся внести изменения.',
              },
              {
                q: 'Как осуществляется доставка скоропортящихся продуктов?',
                a: 'Все заказы с продуктами, требующими холодового хранения (сыры, мясные деликатесы, трюфель), упаковываются в изотермические контейнеры с хладоэлементами.',
              },
              {
                q: 'Возможен ли возврат товара?',
                a: 'Если товар ненадлежащего качества — сообщите нам в течение 24 часов с фотографией. Мы заменим продукт или вернём деньги.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white rounded-xl border p-4 sm:p-5">
                <p className="font-medium text-neutral-900 text-sm mb-2">{q}</p>
                <p className="text-sm text-neutral-500 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-neutral-900 rounded-2xl p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-white">Готовы сделать заказ?</h2>
          <p className="text-neutral-400 text-sm max-w-md mx-auto">
            Выберите деликатесы из нашего каталога — доставим свежими прямо к вашей двери
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => setLocation('/web/catalog')}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Перейти в каталог
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/web/cart')}
              className="border-neutral-600 text-neutral-300 hover:text-white hover:border-neutral-400"
            >
              Моя корзина
            </Button>
          </div>
          <p className="text-xs text-neutral-600 pt-2">
            Вопросы? Напишите нам:{' '}
            <a href="mailto:info@dongiulioselect.ru" className="text-amber-400 hover:text-amber-300 transition-colors">
              info@dongiulioselect.ru
            </a>
            {' '}или позвоните{' '}
            <a href="tel:+79259176867" className="text-amber-400 hover:text-amber-300 transition-colors">
              +7 (925) 917-68-67
            </a>
          </p>
        </section>

      </div>
    </div>
  );
}
