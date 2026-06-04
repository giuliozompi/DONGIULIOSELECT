import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  Truck, MapPin, Package, CreditCard, Banknote, Clock,
  CheckCircle, Shield, Receipt, Phone, ChevronRight, Store,
} from 'lucide-react';
import { webApi } from '../lib/webApi';
import { useWebMeta } from '../hooks/useWebMeta';
import { Button } from '@/components/ui/button';

interface PickupAddress {
  id: string;
  label: string;
  fullAddress: string;
  city: string;
  contactName: string;
  contactPhone: string;
  isDefault: boolean;
}

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
    title: 'Доставка и оплата — Don Giulio Select',
    description: 'Условия доставки деликатесов Don Giulio Select: курьер Яндекс, СДЭК по всей России, самовывоз. Оплата картой онлайн или наличными.',
  });

  const { data: pickupAddresses = [] } = useQuery<PickupAddress[]>({
    queryKey: ['/web-api/pickup-addresses'],
    queryFn: () => webApi.get<PickupAddress[]>('/pickup-addresses'),
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
              { icon: Clock, text: 'Экспресс за 1–2 часа' },
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Yandex Express */}
            <div className="bg-white rounded-xl border p-5 space-y-3 hover:border-amber-300 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-amber-600" />
                </div>
                <span className="font-semibold text-neutral-900 text-sm">Яндекс Экспресс</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Курьерская доставка по Москве и ближайшему Подмосковью. Продукты приедут в термосумке прямо к вашей двери.
              </p>
              <div className="space-y-1.5">
                <Row label="Срок" value="1–2 часа" />
                <Row label="Зона" value="Москва и МО" />
                <Row label="Стоимость" value="Рассчитывается автоматически" />
              </div>
              <div className="pt-1">
                <span className="inline-block bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  Самый быстрый вариант
                </span>
              </div>
            </div>

            {/* Yandex Go */}
            <div className="bg-white rounded-xl border p-5 space-y-3 hover:border-amber-300 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Package className="w-4 h-4 text-blue-600" />
                </div>
                <span className="font-semibold text-neutral-900 text-sm">Яндекс Go</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Грузовая доставка для крупных заказов по Москве. Подходит для больших объёмов — партийные закупки, корпоративные заказы.
              </p>
              <div className="space-y-1.5">
                <Row label="Срок" value="2–4 часа" />
                <Row label="Зона" value="Москва и МО" />
                <Row label="Стоимость" value="Рассчитывается автоматически" />
              </div>
              <div className="pt-1">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  Для крупных заказов
                </span>
              </div>
            </div>

            {/* CDEK */}
            <div className="bg-white rounded-xl border p-5 space-y-3 hover:border-amber-300 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-purple-600" />
                </div>
                <span className="font-semibold text-neutral-900 text-sm">СДЭК</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Доставка в пункты выдачи (ПВЗ) по всей России. Выберите удобный пункт рядом с домом или работой.
              </p>
              <div className="space-y-1.5">
                <Row label="Срок" value="2–7 дней" />
                <Row label="Зона" value="По всей России" />
                <Row label="Стоимость" value="Рассчитывается по тарифу" />
              </div>
              <div className="pt-1">
                <span className="inline-block bg-purple-50 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  Доставка по всей России
                </span>
              </div>
            </div>

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
        {pickupAddresses.length > 0 && (
          <section>
            <SectionTitle
              icon={Store}
              title="Самовывоз"
              subtitle="Бесплатно — заберите заказ сами в удобное время"
            />
            <div className="grid sm:grid-cols-2 gap-4">
              {pickupAddresses.map(addr => (
                <div key={addr.id} className="bg-white rounded-xl border p-5 space-y-2 hover:border-amber-300 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-neutral-900 text-sm">{addr.label}</p>
                    {addr.isDefault && (
                      <span className="inline-block bg-amber-50 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full shrink-0">
                        Основной
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-sm text-neutral-600">
                    <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                    <span>{addr.fullAddress}</span>
                  </div>
                  {addr.contactPhone && (
                    <div className="flex items-center gap-2 text-sm text-neutral-600">
                      <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
                      <a href={`tel:${addr.contactPhone}`} className="hover:text-amber-700 transition-colors">
                        {addr.contactPhone}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PAYMENT */}
        <section>
          <SectionTitle
            icon={CreditCard}
            title="Способы оплаты"
            subtitle="Выберите наиболее удобный для вас способ оплаты"
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
              <div className="pt-1">
                <span className="inline-block bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  Рекомендуется
                </span>
              </div>
            </div>

            {/* Cash */}
            <div className="bg-white rounded-xl border p-5 space-y-3 hover:border-amber-300 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                  <Banknote className="w-4 h-4 text-neutral-600" />
                </div>
                <span className="font-semibold text-neutral-900 text-sm">Наличными при получении</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Оплата наличными или картой курьеру в момент получения заказа. Удобно, если вы хотите проверить товар перед оплатой.
              </p>
              <ul className="space-y-1.5">
                {[
                  'Наличные рублями',
                  'Банковская карта курьеру',
                  'Оплата после проверки заказа',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-neutral-600">
                    <CheckCircle className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="pt-1">
                <span className="inline-block bg-neutral-100 text-neutral-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  Только для Москвы
                </span>
              </div>
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
                a: 'Зоны доставки и стоимость рассчитываются автоматически при оформлении заказа — введите адрес, и система покажет доступные варианты и стоимость.',
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
