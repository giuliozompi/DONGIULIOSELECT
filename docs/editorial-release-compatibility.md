# Controllo locale dei prerequisiti editoriali

Il controllo di rilascio in `scripts/check-timeweb-compatibility.mjs` richiede
ora sia lo schema dei preferiti sia tutte le dieci tabelle editoriali presenti
nel codice: redazione, pubblicazioni, segnalazioni prezzo, preparazione assistita,
monitoraggio prezzi, cambi e coda delle bozze. Verificare queste strutture non attiva alcun
servizio AI o ricerca, né autorizza il rilascio di funzionalità aggiuntive.

## Contratto verificato

`scripts/editorial-schema-requirements.mjs` è un contratto esplicito di release,
derivato dalle sei migrazioni `migrations/editorial-*.sql`, non uno script
per applicarle. Il confronto in `scripts/check-editorial-schema.mjs` controlla:

- tabelle persistenti nello schema `public`, non viste o tabelle con RLS;
- colonne, tipi e lunghezze, nullabilità e valori predefiniti;
- chiavi primarie, relazioni e azioni di cancellazione, CHECK validati;
- indici effettivi, validi e immediati: unicità, colonne, ordine e predicati;
- permessi di lettura e assenza di campi o vincoli inattesi che potrebbero
  rendere incompatibili gli inserimenti dell'applicazione.

I nomi di indici e vincoli da soli non dimostrano compatibilità. Sono ammessi
nomi diversi e indici non univoci aggiuntivi, purché restino presenti tutte le
strutture richieste. Le espressioni vengono confrontate con la rappresentazione
canonica PostgreSQL: differenze anche equivalenti richiedono revisione esplicita,
non un'approvazione automatica. Aggiornare contratto e test insieme quando cambia
lo schema richiesto dal codice.

Il controllo riutilizza la transazione in sola lettura e i limiti di tempo del
preflight. Legge metadati; `SELECT ... LIMIT 0` controlla accesso e mantiene i lock
di lettura sulle relazioni fino al rollback, senza leggere righe cliente.
Non applica DDL, non corregge dati e non crea tabelle mancanti. Una connessione
assente, non verificabile o incompatibile impedisce l'esito positivo.

## Verifiche locali

`npm run test:timeweb-preflight` crea e distrugge un PostgreSQL locale temporaneo.
I test applicano le migrazioni solo lì e passano al controllo esclusivamente
quella connessione. Git e curl nei test dei due helper sono sostituiti da
comandi simulati: non viene effettuato un invio a GitHub.

Le prove includono lo schema dei soli preferiti (ora insufficiente), ogni
tabella editoriale mancante, colonne incompatibili, default errati, vincoli
assenti/non validati, relazioni errate, indici incompleti o invalidi, permessi,
RLS e viste sostitutive, oltre alle protezioni preesistenti sui preferiti.

## Limiti dell'autorizzazione

L'estensione del codice è stata autorizzata solo localmente. Successivamente
è stata autorizzata separatamente la verifica live in sola lettura.
Non sono autorizzati migrazioni Timeweb, invii GitHub o deployment.
Qualsiasi futura migrazione richiede un'ulteriore approvazione esplicita.

## Esito della verifica live del 18 novembre 2026

- Il controllo esteso è passato sulla connessione `TIMEWEB_DATABASE_URL`,
  indicata dall'utente come database live di Timeweb. L'identità del database
  corrisponde alla configurazione fornita e la transazione è in sola lettura;
  sono presenti tutte le otto tabelle richieste. Non è stata consultata la
  configurazione privata del pannello Timeweb: questa attribuzione resta basata
  sulla connessione fornita dall'utente.
- `https://dongiulioselect.ru/healthz` risponde con stato `ok`, database
  raggiungibile e fasi di avvio pronte. L'identità della build osservata coincide
  fra health e HTML; non è stata usata come valore atteso per certificare
  un rilascio nuovo.
- Il file JavaScript della WebApp, caricato separatamente dall'entry point,
  contiene entrambe le sezioni editoriali e i collegamenti alle API.
- Le API pubbliche rispondono in JSON: cinque formaggi pubblicati, presenti
  anche nella mappa, e nessun video. Le cinque schede hanno riferimenti a foto,
  coordinate e storia; una include un prodotto. Le rilevazioni prezzo sono
  assenti. Nei dettagli e prezzi esaminati non compaiono i campi interni cercati.
- Non sono state caricate fotografie o riprodotti video dal sito live, né
  eseguite operazioni autenticate, prove di carrello o pubblicazioni live.
  I test interattivi restano quelli eseguiti in sviluppo con dati isolati.

Questi risultati sono un'osservazione datata, non una garanzia permanente.
Non è stato modificato il database né avviato un nuovo rilascio.
