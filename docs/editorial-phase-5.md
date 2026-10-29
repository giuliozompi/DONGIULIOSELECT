# Punto 5 — segnalazioni prezzo dei clienti

Realizzato soltanto in sviluppo. Nessun invio a GitHub, migrazione Timeweb,
rilascio pubblico, ricerca automatica o generazione AI.

## Percorso cliente

Nella scheda pubblica di un formaggio il visitatore può aprire l’accesso o la
registrazione esistenti senza cambiare pagina. Dopo l’accesso può inviare:

- prezzo, valuta ISO originale, paese e negozio;
- data della rilevazione, non futura rispetto al calendario di Mosca;
- quantità della confezione e unità g/kg/pezzi;
- provenienza online o negozio fisico; fonte http(s) obbligatoria online.

Prezzo e quantità accettano punto o virgola decimale. Il server valida tutti
i campi e non accetta identità, moderazione, note interne o associazioni
fornite dal cliente: l’autore viene esclusivamente dal token verificato e
il formaggio dal percorso, purché la sua scheda sia pubblicata.

Il cliente vede solo le proprie segnalazioni per quella scheda, con stato
in attesa, approvata, rifiutata o rimossa dalla redazione, più limiti disponibili,
aggiornamento e paginazione. Lo storico conserva i dati originariamente
inviati: eventuali correzioni dell’operatore possono differire.
Non mostra motivazioni interne, autore/moderatore o informazioni di altri account.

## Moderazione e pubblicazione

Le segnalazioni entrano nel workspace admin «Цены в мире» come prezzi da cliente
in attesa di verifica. Si usano le modifiche e le decisioni di moderazione
già presenti, con log transazionale. L’invio del cliente viene registrato come
`price_submitted`, senza attribuirgli alcun permesso amministrativo.

Solo l’approvazione rende visibile la rilevazione sotto una scheda pubblicata.
Correggere un prezzo approvato lo rimette in attesa e lo nasconde dal pubblico.
I prezzi del catalogo non vengono mai modificati dalle segnalazioni.

## Limiti e integrità

- Almeno 60 secondi fra invii dello stesso account, anche fra formaggi diversi.
- Massimo 10 invii nelle ultime 24 ore, non nel giorno di calendario.
- Osservazioni identiche dello stesso account bloccate per 24 ore; hash canonico
  normalizza numeri, ordine dei campi e spazi/maiuscole di negozio e paese.
- Un registro separato conserva invio originale, impronta e orario anche
  se l’operatore corregge o elimina la rilevazione. Le eliminazioni non
  azzerano i limiti; lo storico segnala la rimozione senza dettagli interni.
- Il lock transazionale PostgreSQL condiviso con le operazioni editoriali
  serializza i controlli e le scritture anche fra processi diversi.
- Prezzo, registro e log sono atomici: un errore annulla l’intero invio.
- Gli errori di validazione, duplicazione, limite o servizio conservano
  il modulo. Il limite restituisce HTTP 429 e `Retry-After`.

Il modulo e le richieste private sono isolati per account e articolo.
Annullamento delle letture e controlli d’identità impediscono che una risposta
tardiva finisca nella cache di un altro utente. Il rimontaggio per identità
isola anche i ritorni A→B→A durante un invio.

## API e schema

- `POST /web-api/editorial/cheeses/:id/price-submissions`
- `GET /web-api/editorial/cheeses/:id/price-submissions/mine?page=1&limit=10`

Entrambe richiedono l’autenticazione web esistente e rispondono senza cache.
La lista privata non consente di scegliere un altro autore tramite parametri.

`migrations/editorial-price-submissions.sql` dipende dalle tabelle editoriali
e dagli utenti web. È stata applicata esclusivamente al database di sviluppo,
dopo verifica della separazione da Timeweb. Non viene eseguita all’avvio,
durante la build o nel post-merge.

Un futuro rilascio richiede consenso distinto e verifica/applicazione esplicita
delle migrazioni mancanti su Timeweb; non usare `db:push`.

## Verifiche

- `npm run test:editorial`: 20 test con PostgreSQL temporaneo isolato,
  comprese moderazione, privacy, campi non falsificabili, quote, duplicati,
  concorrenza, cancellazioni, scadenza dei limiti e rollback.
- `EDITORIAL_SUBMISSIONS_FIXTURE=/tmp/<fixture>.json node --import tsx --test tests/editorial-submissions-ui.test.mjs`:
  prova facoltativa con account usa-e-getta di sviluppo, mai credenziali reali.
  Controlla login sulla scheda, virgola decimale, fonte obbligatoria,
  doppio invio, risposta POST sospesa durante A→B→A, errori, approvazione,
  correzione/rifiuto, note riservate e visualizzazione mobile.
- Build riuscita; il controllo TypeScript non introduce segnalazioni nei
  moduli nuovi. Restano errori generali preesistenti estranei all’editoriale.
- Account, scheda e segnalazioni di verifica sono eliminati dopo le prove.
