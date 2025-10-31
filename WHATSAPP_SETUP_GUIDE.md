# 📱 Guida Setup WhatsApp Business API (Meta Cloud API)

## 🎯 Panoramica

Questa guida ti aiuterà a configurare **Meta Cloud API** per WhatsApp completamente **GRATIS** per le notifiche ordini di Don Giulio Select.

---

## ✅ Vantaggi della Soluzione

- ✅ **ZERO costi fissi mensili**
- ✅ **Notifiche ordini GRATIS** (finestra 24h)
- ✅ **Supporto clienti GRATIS**
- ✅ **Nessun markup** (API diretta Meta)
- ✅ **Controllo totale**

---

## 📋 STEP 1: Creare Meta Business Account

### 1.1 Registrazione Business Account

1. Vai su **[business.facebook.com](https://business.facebook.com/)**
2. Clicca su **"Crea account"**
3. Inserisci:
   - Nome azienda: **Don Giulio Select**
   - Tuo nome completo
   - Email aziendale

### 1.2 Verifica Account

1. Conferma email ricevuta da Meta
2. Aggiungi informazioni azienda:
   - Indirizzo fisico
   - Telefono aziendale
   - Sito web (se disponibile)

---

## 📱 STEP 2: Creare App WhatsApp

### 2.1 Creare App su Meta for Developers

1. Vai su **[developers.facebook.com/apps](https://developers.facebook.com/apps)**
2. Clicca **"Crea app"**
3. Scegli tipo: **"Business"**
4. Nome app: **Don Giulio Select WhatsApp**
5. Email contatto: la tua email
6. Seleziona il Business Account creato prima

### 2.2 Aggiungere Prodotto WhatsApp

1. Nella dashboard dell'app, cerca **"WhatsApp"**
2. Clicca **"Configura"** (Setup)
3. Seleziona il Business Account
4. Clicca **"Continua"**

---

## 🔑 STEP 3: Ottenere Credenziali API

### 3.1 Numero di Telefono

1. Nella sezione **WhatsApp > API Setup**
2. Troverai un **numero di test temporaneo** (già fornito da Meta)
3. **Per produzione**: Clicca **"Aggiungi numero di telefono"**
   - Inserisci il tuo numero WhatsApp Business
   - Verifica tramite SMS/chiamata
   - **IMPORTANTE**: Il numero verrà disconnesso da WhatsApp normale e connesso all'API

### 3.2 Phone Number ID

1. In **WhatsApp > API Setup**
2. Copia il **Phone Number ID** (es: `123456789012345`)
3. Salvalo - ti servirà dopo

### 3.3 Access Token (Permanente)

1. In **WhatsApp > API Setup** troverai un **Temporary Token** (24h)
2. **Per token permanente**:
   - Vai su **Impostazioni > Di base**
   - Scorri fino a **"Token di accesso dell'app"**
   - Clicca **"Genera token"**
   - Seleziona permessi:
     - ✅ `whatsapp_business_messaging`
     - ✅ `whatsapp_business_management`
   - Copia il token generato
   - ⚠️ **IMPORTANTE**: Salvalo subito - non potrai più vederlo!

---

## 🔐 STEP 4: Aggiungere Credenziali a Replit

### 4.1 Secrets su Replit

1. Apri il progetto su Replit
2. Clicca sull'icona **"Lucchetto"** (Secrets) nel pannello laterale
3. Aggiungi questi 2 secrets:

```
Nome: WHATSAPP_PHONE_NUMBER_ID
Valore: 123456789012345  (il tuo Phone Number ID)

Nome: WHATSAPP_ACCESS_TOKEN
Valore: EAAxxxxxxxxxxxxxxxxxxxxxx  (il tuo Access Token)
```

### 4.2 Verifica Configurazione

Le credenziali sono ora disponibili nel codice come:
```javascript
process.env.WHATSAPP_PHONE_NUMBER_ID
process.env.WHATSAPP_ACCESS_TOKEN
```

---

## 📝 STEP 5: Creare Template Messaggi

### Perché i Template?

WhatsApp richiede **template pre-approvati** per messaggi iniziati dal business.
I template devono essere creati e approvati da Meta (24-48 ore).

### 5.1 Accedere a WhatsApp Manager

1. Vai su **[business.facebook.com/wa/manage/message-templates](https://business.facebook.com/wa/manage/message-templates)**
2. Seleziona il tuo account WhatsApp Business
3. Clicca **"Crea template"**

### 5.2 Template: Conferma Ordine

**Nome template**: `order_confirmation`  
**Categoria**: `TRANSACTIONAL`  
**Lingua**: Russian (ru)

**Contenuto**:
```
✅ ЗАКАЗ ОФОРМЛЕН

Здравствуйте, {{1}}!

Ваш заказ #{{2}} успешно оформлен.

📦 Состав заказа:
{{3}}

💵 Предварительная стоимость: {{4}} ₽
🚚 Доставка: {{5}}
💳 Оплата: {{6}}

(*) Окончательная стоимость будет доступна, когда заказ будет готов. Нарезка сыров и колбасных изделий может привести к небольшим отклонениям в весе.

Мы создаём 50 оттенков твоего наслаждения! 🍷
```

**Parametri (Body variables)**:
- `{{1}}` = Nome cliente
- `{{2}}` = ID ordine
- `{{3}}` = Lista prodotti
- `{{4}}` = Importo totale
- `{{5}}` = Metodo consegna
- `{{6}}` = Metodo pagamento

### 5.3 Template: Aggiornamento Stato

**Nome template**: `order_status_update`  
**Categoria**: `TRANSACTIONAL`  
**Lingua**: Russian (ru)

**Contenuto**:
```
📦 ОБНОВЛЕНИЕ ЗАКАЗА

Здравствуйте, {{1}}!

Ваш заказ #{{2}} {{3}}.

Вы можете отследить статус в приложении Telegram.

С уважением,
Don Giulio Select 🍷
```

**Parametri**:
- `{{1}}` = Nome cliente
- `{{2}}` = ID ordine
- `{{3}}` = Stato ordine

### 5.4 Template: Link Pagamento

**Nome template**: `payment_link`  
**Categoria**: `TRANSACTIONAL`  
**Lingua**: Russian (ru)

**Contenuto**:
```
💳 ССЫЛКА НА ОПЛАТУ

Здравствуйте, {{1}}!

Ваш заказ #{{2}} готов к оплате.

Сумма: {{3}} ₽

Нажмите на кнопку ниже для оплаты:
```

**Bottone (Button)**:
- Tipo: **URL dinamico**
- Testo: `Оплатить заказ`
- URL variabile: Sì

**Parametri**:
- `{{1}}` = Nome cliente
- `{{2}}` = ID ordine
- `{{3}}` = Importo
- URL button = Link pagamento dinamico

### 5.5 Template: Aggiornamento Consegna

**Nome template**: `delivery_update`  
**Categoria**: `TRANSACTIONAL`  
**Lingua**: Russian (ru)

**Contenuto**:
```
🚚 ДОСТАВКА

Здравствуйте, {{1}}!

Ваш заказ #{{2}} {{3}}.

С уважением,
Don Giulio Select 🍷
```

**Parametri**:
- `{{1}}` = Nome cliente
- `{{2}}` = ID ordine
- `{{3}}` = Info consegna

### 5.6 Inviare per Approvazione

1. Dopo aver creato ogni template, clicca **"Invia"**
2. Meta revisionerà i template (24-48 ore)
3. Riceverai notifica email quando approvati

---

## 🧪 STEP 6: Testare l'Integrazione

### 6.1 Test con Numero Temporaneo

Prima dell'approvazione template, puoi testare con il numero test:

1. In **WhatsApp > API Setup** > **"To"**
2. Aggiungi il tuo numero personale WhatsApp
3. Verifica tramite codice OTP
4. Ora puoi ricevere messaggi test

### 6.2 Testare Creazione Ordine

1. Crea un ordine test nell'app Telegram
2. Controlla i log del server:
   ```
   ✅ Order confirmation sent via WhatsApp to 79991234567
   ```
3. Verifica di ricevere il messaggio WhatsApp

### 6.3 Debug Errori Comuni

**Errore: "Template not found"**
- ✅ Verifica che il template sia approvato
- ✅ Controlla che il nome sia esattamente `order_confirmation` (minuscolo, underscore)

**Errore: "Invalid phone number"**
- ✅ Formato: `79991234567` (no spazi, no +)
- ✅ Deve essere numero valido WhatsApp

**Errore: "Access token expired"**
- ✅ Genera nuovo token permanente
- ✅ Aggiorna secret su Replit

---

## 💰 STEP 7: Capire i Costi (GRATIS!)

### Finestra 24 Ore

Quando un cliente ti **scrive per primo**, si apre una finestra di 24h:

- ✅ Tutte le risposte entro 24h = **GRATIS**
- ✅ Template utility entro 24h = **GRATIS**
- ✅ Messaggi liberi (non-template) = **GRATIS**

### Per Don Giulio Select

Il tuo flusso:
1. Cliente apre Telegram Mini App
2. Cliente crea ordine → ti invia messaggio
3. **Si apre finestra 24h** → Tutto GRATIS
4. Invii conferma ordine → **GRATIS**
5. Invii aggiornamento stato → **GRATIS**
6. Invii link pagamento → **GRATIS**
7. Cliente risponde → **Resetta finestra 24h**

**Risultato: ZERO costi** per e-commerce! 🎉

### Quando Si Paga

Solo se invii messaggi **proattivi** fuori finestra 24h:
- Marketing (promozioni) → ~€0.03-0.05/msg
- OTP/Autenticazione → ~€0.01-0.02/msg

---

## 📊 STEP 8: Monitoraggio

### Dashboard Meta

1. Vai su **[business.facebook.com/wa/manage/home](https://business.facebook.com/wa/manage/home)**
2. Monitora:
   - Messaggi inviati/ricevuti
   - Tassi consegna
   - Costi (dovrebbe essere €0!)

### Log Server

Controlla i log Replit per verificare invii:
```
✅ Order confirmation sent via WhatsApp to 79991234567 for order abc123
✅ Status notification sent via WhatsApp to 79991234567: СОБРАН
✅ Payment link sent via WhatsApp
```

---

## 🚀 Checklist Finale

Prima di andare in produzione:

- [ ] Meta Business Account creato
- [ ] App WhatsApp creata
- [ ] Numero telefono verificato e connesso
- [ ] Phone Number ID copiato
- [ ] Access Token permanente generato
- [ ] Secrets aggiunti su Replit
- [ ] 4 template creati e **APPROVATI**
- [ ] Test ordine completato con successo
- [ ] Ricevuto messaggio WhatsApp di test

---

## 🆘 Supporto

**Documentazione ufficiale**:
- [Meta WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp)
- [Pricing Info](https://developers.facebook.com/docs/whatsapp/pricing/)
- [Template Guidelines](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/)

**Problemi comuni**:
- Template rifiutati → Controlla policy Meta
- Token scaduto → Genera nuovo token permanente
- Numero non funziona → Verifica sia connesso all'API

---

## 🎉 Complimenti!

Hai configurato WhatsApp Business API **GRATIS** per Don Giulio Select!

I tuoi clienti ora riceveranno notifiche via:
- 📱 Telegram
- 📧 Email
- 💬 WhatsApp

**Tutto automatico e senza costi fissi!** 🚀
