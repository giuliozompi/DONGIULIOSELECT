# Collegamento editoriale a Timeweb AI Gateway

Preparazione soltanto: non attivare il provider o avviare un rilascio prima della
prova reale dal container Timeweb e dell'approvazione dell'utente.

## Configurazione

- `EDITORIAL_AI_PROVIDER=timeweb` attiva esplicitamente il Gateway.
- `TIMEWEB_AI_API_KEY` contiene una chiave dedicata AI Gateway (non il token
  generale dell'account e non la chiave OpenRouter).
- `EDITORIAL_AI_MODEL` deve contenere l'identificativo restituito da
  `GET https://api.timeweb.ai/v1/models`, non il nome commerciale con spazi.
- L'endpoint è fisso: `https://api.timeweb.ai/v1`.
- Se il provider non è configurato, il comportamento OpenRouter resta invariato.
  Aggiungere soltanto la nuova chiave non attiva il servizio.
- Non eliminare o sostituire la chiave OpenRouter; non sono previsti fallback.

La configurazione viene letta dal processo server: dopo l'attivazione autorizzata
occorre riavviare l'applicazione.

## Collaudo necessario prima del rilascio

La compatibilità OpenAI generale è documentata, ma non basta a certificare
`response_format: {"type":"json_object"}` per il modello selezionato.
Il connettore Timeweb non invia il parametro `reasoning` specifico di OpenRouter.
Non riprova né rimuove automaticamente il requisito JSON se il Gateway lo rifiuta.

1. Elencare i modelli dal container con la chiave dedicata, senza stamparla.
2. Scegliere l'esatto identificativo di Gemini richiesto dall'utente.
3. Eseguire una generazione controllata di elenco e una di scheda basata su fonti,
   con dati sintetici e senza salvataggio/pubblicazione o scritture nel database.
4. Verificare JSON, schema, citazioni, errori sanitizzati e modello registrato.

Una chiave presente solo su Timeweb non è disponibile nell'ambiente Replit.
Non dichiarare il collaudo reale completato sulla base dei test simulati.

Il cambio riguarda il servizio editoriale (incluse le verifiche editoriali dei
prezzi che condividono il connettore), non il chatbot commerciale.
Nessuna migrazione database è necessaria.

Fonti:
- https://timeweb.cloud/docs/ai-gateway/manage
- https://timeweb.cloud/docs/ai-gateway/models
