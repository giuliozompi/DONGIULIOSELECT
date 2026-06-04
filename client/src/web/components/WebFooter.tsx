import { Link } from 'wouter';
import { Mail, Phone, MapPin } from 'lucide-react';

export default function WebFooter() {
  return (
    <footer className="bg-neutral-900 text-neutral-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
                <span className="text-white text-xs font-bold">DG</span>
              </div>
              <span className="text-white font-semibold">Don Giulio Select</span>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Премиальные итальянские деликатесы с доставкой по России. Подлинный вкус Италии у вас дома.
            </p>
          </div>

          {/* Catalog */}
          <div>
            <h4 className="text-white font-medium text-sm mb-3">Каталог</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/web/catalog" className="hover:text-white transition-colors">Все товары</Link></li>
              <li><Link href="/web/catalog?category=cheese" className="hover:text-white transition-colors">Сыры</Link></li>
              <li><Link href="/web/catalog?category=charcuterie" className="hover:text-white transition-colors">Колбасы и мясо</Link></li>
              <li><Link href="/web/catalog?category=pasta" className="hover:text-white transition-colors">Паста и ризотто</Link></li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="text-white font-medium text-sm mb-3">Информация</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/web/about" className="hover:text-white transition-colors">О нас</Link></li>
              <li><Link href="/web/delivery" className="hover:text-white transition-colors">Доставка и оплата</Link></li>
              <li><Link href="/web/privacy" className="hover:text-white transition-colors">Политика конфиденциальности</Link></li>
              <li><Link href="/web/legal" className="hover:text-white transition-colors">Оферта</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-medium text-sm mb-3">Контакты</h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <a href="tel:+79259176867" className="hover:text-white transition-colors">+7 (925) 917-68-67</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <a href="mailto:info@dongiulioselect.ru" className="hover:text-white transition-colors">info@dongiulioselect.ru</a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>Москва, Россия</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
          <p>© {new Date().getFullYear()} Don Giulio Select. Все права защищены.</p>
          <p>ИП Дзомпи Джулио · ИНН 772863212942</p>
        </div>
      </div>
    </footer>
  );
}
