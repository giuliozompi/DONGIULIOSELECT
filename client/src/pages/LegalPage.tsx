import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const LEGAL_INFO = {
  fullName: 'ИП ДЗОМПИ ДЖУЛИО',
  inn: '772863212942',
  ogrnip: '317774600277638',
  address: '117624 г.Москва. Ул. скобелевская 34 кв 17',
  email: 'dongiulio.ru@yandex.ru',
  phone: '+7 925 917 68 67',
  bankDetails: {
    account: '40802810738000226956',
    bankName: 'ПАО Сбербанк',
    bik: '044525225',
    corrAccount: '30101810400000000225',
    innBank: '7707083893',
    kppBank: '773643001',
  },
};

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card data-testid="card-legal-info">
          <CardHeader>
            <CardTitle className="text-2xl">Реквизиты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Информация об организации</h3>
              <div className="space-y-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Полное наименование:</span>
                  <span className="font-medium" data-testid="text-full-name">{LEGAL_INFO.fullName}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">ИНН:</span>
                  <span className="font-medium" data-testid="text-inn">{LEGAL_INFO.inn}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">ОГРНИП:</span>
                  <span className="font-medium" data-testid="text-ogrnip">{LEGAL_INFO.ogrnip}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Юридический адрес:</span>
                  <span className="font-medium" data-testid="text-address">{LEGAL_INFO.address}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Контактная информация</h3>
              <div className="space-y-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Email:</span>
                  <a 
                    href={`mailto:${LEGAL_INFO.email}`}
                    className="font-medium text-primary hover:underline"
                    data-testid="link-email"
                  >
                    {LEGAL_INFO.email}
                  </a>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Телефон:</span>
                  <a 
                    href={`tel:${LEGAL_INFO.phone}`}
                    className="font-medium text-primary hover:underline"
                    data-testid="link-phone"
                  >
                    {LEGAL_INFO.phone}
                  </a>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Банковские реквизиты</h3>
              <div className="space-y-2 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Расчётный счёт:</span>
                  <span className="font-medium font-mono" data-testid="text-account">{LEGAL_INFO.bankDetails.account}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Банк:</span>
                  <span className="font-medium" data-testid="text-bank-name">{LEGAL_INFO.bankDetails.bankName}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">БИК банка:</span>
                  <span className="font-medium font-mono" data-testid="text-bik">{LEGAL_INFO.bankDetails.bik}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Корр. счёт банка:</span>
                  <span className="font-medium font-mono" data-testid="text-corr-account">{LEGAL_INFO.bankDetails.corrAccount}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">ИНН банка:</span>
                  <span className="font-medium font-mono" data-testid="text-inn-bank">{LEGAL_INFO.bankDetails.innBank}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">КПП банка:</span>
                  <span className="font-medium font-mono" data-testid="text-kpp-bank">{LEGAL_INFO.bankDetails.kppBank}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Don Giulio Select - Премиальные итальянские деликатесы
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
