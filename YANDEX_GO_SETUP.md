# Configurazione Yandex Go Доставка для бизнеса

## Stato Attuale
Il sistema ha già un token configurato nei secrets, ma non ha i permessi corretti.
L'errore 403 "Access denied" indica che il token deve essere rigenerato con i permessi giusti.

## Come Ottenere un Token Valido

1. **Accedi al Cabinet Yandex Go**
   - Vai su https://b2b.taxi.yandex.net
   - Accedi con il tuo account aziendale

2. **Crea un nuovo token OAuth:**
   - Clicca su **Интеграция** 
   - Clicca su **Создать токен OAuth**
   - Seleziona ENTRAMBI i permessi:
     - ✅ **cargo:write** 
     - ✅ **cargo:read**
   - Clicca su "Создать"

3. **Copia il nuovo token**
   - Il token inizierà con `y0_` o `y2_`
   - Copialo negli appunti

4. **Aggiorna il segreto in Replit:**
   - Vai nella sezione Secrets di Replit
   - Trova `YANDEX_GO_TOKEN`
   - Sostituisci il valore con il nuovo token
   - Salva

## Dopo aver Aggiornato il Token

Attendi 30 secondi che il server si riavvii automaticamente, poi testa:

1. Apri l'Admin Panel
2. Trova un ordine con stato "ОПЛАЧЕН"
3. Clicca sul pulsante "Yandex Go"
4. Clicca "Calcola prezzo"

✅ Se mostra il prezzo = Funziona!
❌ Se mostra errore 403 = Il token non ha ancora i permessi giusti

## Note
- Yandex Go e Yandex Dostavka Express sono servizi SEPARATI con token DIVERSI
- Il token dura 1 anno
- Il token attuale inizia con `y0__xCpxdaQA...` ma manca dei permessi cargo:write e cargo:read