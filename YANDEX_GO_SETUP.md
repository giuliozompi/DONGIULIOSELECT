# Configurazione Yandex Go Доставка для бизнеса

## Panoramica
Il sistema supporta **due modalità di autenticazione** per Yandex Go:

1. **OAuth con Client Credentials** (Consigliato per produzione)
2. **API Key Statico** (Più semplice)

## Modalità 1: OAuth con Client Credentials

### Passaggi di Configurazione:

1. **Registra l'applicazione su Yandex OAuth**
   - Vai su https://oauth.yandex.ru/
   - Crea una nuova applicazione
   - Ottieni `CLIENT_ID` e `CLIENT_SECRET`

2. **Configura i segreti in Replit:**
   ```
   YANDEX_GO_CLIENT_ID=<tuo_client_id>
   YANDEX_GO_CLIENT_SECRET=<tuo_client_secret>
   YANDEX_GO_SCOPE=cargo:write cargo:read
   ```

3. **Il sistema gestirà automaticamente:**
   - Richiesta del token OAuth
   - Refresh automatico prima della scadenza
   - Retry con exponential backoff

## Modalità 2: API Key Statico (Attuale)

### Passaggi per ottenere un token valido:

1. **Accedi al Cabinet Yandex Go**
   - Vai su https://b2b.taxi.yandex.net
   - Accedi con il tuo account aziendale

2. **Crea un token OAuth con i permessi corretti:**
   - Naviga a: **Интеграция** → **Создать токен OAuth**
   - Seleziona i permessi:
     - ✅ **cargo:write** (obbligatorio)
     - ✅ **cargo:read** (obbligatorio)
   - Copia il token generato (inizia con `y0_` o `y2_`)

3. **Configura il segreto in Replit:**
   ```
   YANDEX_GO_TOKEN=<tuo_token_oauth>
   ```

## Gerarchia di Fallback

Il sistema prova nell'ordine:
1. OAuth con client credentials (se CLIENT_ID e CLIENT_SECRET sono configurati)
2. Token statico (se YANDEX_GO_TOKEN è configurato)
3. Errore se nessuno è configurato

## Troubleshooting

### Errore 403 "Access denied"
**Problema**: Il token non ha i permessi `cargo:write` e `cargo:read`

**Soluzione**: 
1. Vai su https://b2b.taxi.yandex.net → Интеграция
2. Crea un nuovo token con i permessi corretti
3. Aggiorna il segreto YANDEX_GO_TOKEN

### Errore 401 "Unauthorized"
**Problema**: Token scaduto o non valido

**Soluzione**:
1. Genera un nuovo token dal cabinet
2. Verifica che inizi con `y0_` o `y2_`
3. Aggiorna il segreto

### Il servizio non è disponibile
**Problema**: Nessun token configurato

**Soluzione**: Segui una delle due modalità sopra

## Note Importanti

- **Yandex Go e Yandex Dostavka sono servizi SEPARATI** che richiedono token SEPARATI
- I token OAuth di Yandex hanno lunga durata (minimo 1 anno)
- Il sistema logga quale modalità sta usando (controllare i log per debug)
- Il token viene mascherato nei log per sicurezza (solo i primi 10 caratteri visibili)

## Verifica Configurazione

Per verificare che tutto funzioni:
1. Apri l'admin panel
2. Seleziona un ordine con stato "ОПЛАЧЕН"
3. Clicca su "Yandex Go"
4. Prova a calcolare il prezzo

Se ricevi un prezzo, la configurazione è corretta!