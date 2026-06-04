import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function WebPrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/web" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        На главную
      </Link>

      <h1 className="text-3xl font-bold text-neutral-900 mb-2">Политика конфиденциальности</h1>
      <p className="text-sm text-neutral-500 mb-8">Последнее обновление: 1 июня 2025 г.</p>

      <div className="prose prose-neutral max-w-none space-y-8 text-neutral-700 text-sm leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">1. Общие положения</h2>
          <p>
            Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок обработки и защиты персональных данных пользователей интернет-магазина <strong>Don Giulio Select</strong>, расположенного по адресу <strong>dongiulioselect.ru</strong> (далее — «Сайт»), а также Telegram Mini App, доступного через Telegram.
          </p>
          <p className="mt-2">
            Оператором персональных данных является <strong>ИП Дзомпи Джулио</strong>, ИНН 772863212942 (далее — «Оператор»).
          </p>
          <p className="mt-2">
            Использование Сайта означает безоговорочное согласие с настоящей Политикой и указанными в ней условиями обработки персональных данных. Если вы не согласны с данными условиями, пожалуйста, воздержитесь от использования Сайта.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">2. Персональные данные пользователей</h2>
          <p>В рамках работы Сайта Оператор обрабатывает следующие категории персональных данных:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Имя и фамилия</li>
            <li>Адрес электронной почты</li>
            <li>Номер телефона</li>
            <li>Почтовый адрес доставки</li>
            <li>Данные Telegram-аккаунта (имя пользователя, идентификатор), если доступ осуществляется через Telegram Mini App</li>
            <li>История заказов и предпочтений</li>
            <li>Технические данные: IP-адрес, тип браузера, данные cookie-файлов</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">3. Цели обработки персональных данных</h2>
          <p>Персональные данные обрабатываются в следующих целях:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Оформление и исполнение заказов на товары</li>
            <li>Организация доставки</li>
            <li>Связь с пользователем по вопросам заказа (SMS, email, Telegram, WhatsApp)</li>
            <li>Улучшение качества обслуживания</li>
            <li>Персонализация предложений и рекомендаций</li>
            <li>Соблюдение требований законодательства Российской Федерации, в том числе в сфере фискальных расчётов (54-ФЗ)</li>
            <li>Предотвращение мошенничества и злоупотреблений</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">4. Правовые основания обработки</h2>
          <p>Обработка персональных данных осуществляется на основании:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Согласия пользователя (ст. 9 Федерального закона № 152-ФЗ «О персональных данных»)</li>
            <li>Исполнения договора, стороной которого является пользователь</li>
            <li>Исполнения требований законодательства Российской Федерации</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">5. Передача данных третьим лицам</h2>
          <p>Оператор может передавать персональные данные третьим лицам исключительно в следующих случаях:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Платёжные сервисы</strong> (ЮКасса / YooKassa) — для проведения оплаты заказов</li>
            <li><strong>Службы доставки</strong> (Яндекс Доставка, СДЭК) — для организации доставки заказов</li>
            <li><strong>Сервисы уведомлений</strong> (Resend, WhatsApp Business API) — для отправки подтверждений и уведомлений о заказе</li>
            <li><strong>Облачные сервисы</strong> — для хранения данных (Neon Database, Replit)</li>
          </ul>
          <p className="mt-2">Все третьи лица обязуются обрабатывать персональные данные строго в соответствии с указанными целями и обеспечивать их защиту.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">6. Хранение и защита данных</h2>
          <p>
            Персональные данные хранятся в течение срока, необходимого для выполнения целей обработки, а также в соответствии с требованиями применимого законодательства.
          </p>
          <p className="mt-2">
            Оператор принимает технические и организационные меры для защиты персональных данных от несанкционированного доступа, изменения, раскрытия или уничтожения, в том числе использует шифрование данных при передаче (HTTPS/TLS).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">7. Cookie-файлы</h2>
          <p>
            Сайт использует cookie-файлы для обеспечения работоспособности сервиса, аутентификации пользователей и улучшения пользовательского опыта. Пользователь может отключить cookie-файлы в настройках браузера, однако это может повлечь ограничение функциональности Сайта.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">8. Права пользователя</h2>
          <p>В соответствии с Федеральным законом № 152-ФЗ пользователь вправе:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Получать информацию об обработке своих персональных данных</li>
            <li>Требовать уточнения, блокирования или уничтожения своих персональных данных</li>
            <li>Отозвать согласие на обработку персональных данных</li>
            <li>Обжаловать действия Оператора в уполномоченном органе по защите прав субъектов персональных данных (Роскомнадзор)</li>
          </ul>
          <p className="mt-2">
            Для реализации своих прав пользователь может обратиться по адресу электронной почты: <a href="mailto:info@dongiulioselect.ru" className="text-amber-700 hover:underline">info@dongiulioselect.ru</a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">9. Изменения Политики</h2>
          <p>
            Оператор оставляет за собой право вносить изменения в настоящую Политику. Новая редакция вступает в силу с момента её размещения на Сайте. Продолжение использования Сайта после публикации изменений означает согласие пользователя с обновлённой Политикой.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">10. Контактная информация</h2>
          <p>По вопросам, связанным с обработкой персональных данных, обращайтесь:</p>
          <ul className="mt-2 space-y-1">
            <li><strong>Оператор:</strong> ИП Дзомпи Джулио</li>
            <li><strong>ИНН:</strong> 772863212942</li>
            <li><strong>Email:</strong> <a href="mailto:info@dongiulioselect.ru" className="text-amber-700 hover:underline">info@dongiulioselect.ru</a></li>
            <li><strong>Телефон:</strong> <a href="tel:+79259176867" className="text-amber-700 hover:underline">+7 (925) 917-68-67</a></li>
          </ul>
        </section>

      </div>
    </div>
  );
}
