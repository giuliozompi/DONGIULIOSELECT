# Punto 3 — gestione editoriale nell’admin

Perimetro approvato: gestione reale nell’admin di due sezioni autonome,
Video Don Giulio e Carta dei formaggi, e rilevazioni dei prezzi in Russia
e in altri paesi con moderazione.

## Dove lavorare nell’anteprima di sviluppo

- `/web/admin/videos`: video, titolo, descrizione, copertina tramite URL o caricamento,
  categoria, ordine, bozza/pronto e formaggi associati facoltativamente.
- `/web/admin/cheeses`: schede con fotografie tramite URL/percorso, origine geografica,
  coordinate, storia, caratteristiche, utilizzi, paese di produzione, fonti,
  prodotti reali del catalogo e video pertinenti facoltativi.
- `/web/admin/market-prices`: prezzi, paese, valuta originale, negozio, data,
  quantità e unità della confezione, fonte e annotazioni; approvazione/rifiuto
  con motivazione obbligatoria.

L’accesso utilizza l’autenticazione e i permessi admin esistenti. Nessun utente
normale o visitatore può accedere alle API editoriali.

## Prezzi e moderazione

Il prezzo è quello della confezione indicata, non necessariamente di un kg.
L’equivalente al kg si calcola soltanto per quantità espresse in kg o grammi;
per articoli a pezzi senza peso non viene inventata una conversione.
Le valute restano originali: nessuna conversione valutaria o media tra mercati.

Ogni nuova rilevazione e ogni modifica torna nello stato **in attesa**.
L’operatore deve approvare o rifiutare esplicitamente, inserendo una motivazione.
Il log conserva anche le decisioni precedenti e i dati prima/dopo la modifica.
Le rilevazioni non modificano prezzi, disponibilità o prodotti del negozio.

Le rilevazioni Internet richiedono il link alla fonte. Una segnalazione fatta
in un negozio fisico può non avere un link: conserva comunque paese, negozio,
data, formato e annotazioni. In questa fase la inserisce manualmente l’operatore,
indicando l’origine “segnalazione utente”. Il modulo pubblico non esiste ancora.

## Salvataggi e cancellazioni

- Dati e log vengono salvati nella stessa transazione; un errore nel log annulla
  l’operazione, senza esiti di successo falsi.
- Una revisione impedisce che due operatori sovrascrivano modifiche simultanee.
- Le cancellazioni richiedono conferma e vengono bloccate se lascerebbero
  schede/video collegati o prezzi senza il relativo formaggio.
- I collegamenti editoriali possono essere indicati dalla scheda o dal video;
  le future pagine pubbliche dovranno considerare entrambe le direzioni.
- “Pronto” è uno stato interno, non una pubblicazione sul sito.

## Verifiche

`npm run test:editorial` usa un PostgreSQL temporaneo e isolato. Copre CRUD,
validazione, permessi, riferimenti, moderazione, revisioni concorrenti,
rollback del log e mancata modifica dei prezzi del catalogo.

`npm run test:editorial-ui` è una prova facoltativa contro il solo ambiente
di sviluppo. Senza `EDITORIAL_UI_FIXTURE` viene saltata; richiede un account
admin temporaneo dedicato. Non usare credenziali di clienti o produzione.
La fixture contiene credenziali temporanee, rimane fuori dal repository
e deve essere rimossa insieme all’account dopo la prova.

Verificati con accesso reale: video e schede persistenti, fonti multilinea,
collegamenti a catalogo e video, prezzi EUR/RUB, osservazioni offline,
approvazione, ritorno in attesa dopo modifica, rifiuto persistente, vincoli
di cancellazione e layout a 390 px. Nessuna riproduzione video certificata.

## Limite di rilascio

La nuova tabella è stata creata soltanto nel database di sviluppo,
dopo averne verificato la separazione dal database Timeweb.
Nessun hook di avvio, build o integrazione applica questa modifica.

**Non sono autorizzati né eseguiti**: invio GitHub, modifica dello schema Timeweb,
rilascio pubblico, pagine editoriali clienti, modulo pubblico prezzi,
ricerca automatica dei prezzi o generazione AI.

Prima di un futuro rilascio occorrono approvazione separata, estensione dei
controlli di compatibilità Timeweb alla tabella editoriale e verifica dello
schema sul target reale. Non considerare sufficiente il solo controllo
preesistente dei preferiti. Lo SQL in `migrations/editorial-admin.sql`
documenta la modifica di sviluppo: non costituisce autorizzazione a eseguirla
su un altro database.
