# Punto 4 — pagine editoriali per i clienti

Implementazione nell’anteprima di sviluppo, senza invio a GitHub, modifica
del database Timeweb o rilascio pubblico.

## Pagine e navigazione

- `/web/videos`: videoteca autonoma con ricerca e categorie ricette,
  interviste, recensioni e luoghi.
- `/web/videos/:id`: materiale pubblicato, origine sempre raggiungibile,
  player YouTube caricato solo dopo un clic. Per i collegamenti Telegram
  viene indicato di aprire la fonte; non viene promesso un player disponibile.
- `/web/cheeses`: carta geografica Italia/dintorni o mondo, ricerca,
  filtro paese e lista alternativa utilizzabile anche senza mappa.
  Le fotografie vicine diventano un gruppo con tutti gli articoli selezionabili.
- `/web/cheeses/:id`: storia, caratteristiche, usi, fotografie, fonti,
  origine e produzione distinte, video pertinenti facoltativi, prodotti
  reali e rilevazioni di mercato approvate.

Entrambe le sezioni hanno collegamenti propri nel menu desktop/mobile
e nel footer. Non sono state inserite schede o rilevazioni dimostrative
per riempire le pagine.

## Pubblicazione

Nell’admin «Pronto» non equivale a pubblicato. L’operatore deve premere
«Опубликовать» e confermare. Una copia della versione approvata rimane
pubblica mentre si modifica la bozza. «Опубликовать изменения» sostituisce
la copia; «Снять с публикации» la ritira. Non si possono eliminare materiali
ancora pubblicati senza prima ritirarli.

Pubblicazione, aggiornamenti e ritiro sono soggetti ai permessi admin,
alle revisioni anti-concorrenza e al log, nella stessa transazione.
I clienti non ricevono dati degli autori/operatori, revisioni, annotazioni,
decisioni di moderazione o collegamenti verso materiali non pubblicati.

Le rilevazioni prezzo approvate sono pubblicate soltanto sotto una scheda
pubblica. Modificarle ne ripristina la moderazione in sospeso. Ogni prezzo
mantiene valuta originale, paese, negozio, data, quantità e fonte disponibile.
L’equivalente al kg si calcola solo per confezioni a peso noto: nessun cambio
valuta, media o prezzo al kg inventato per confezioni a pezzi.

## Catalogo e carrello

I prodotti collegati sono letti dal catalogo corrente; quelli nascosti non
sono mostrati. Al clic «В корзину» si rileggono prezzo e disponibilità:
se il prodotto è esaurito o non più accessibile non viene aggiunto.
Il prezzo di una posizione già nel carrello viene aggiornato conservandone
la quantità, poi si applica l’incremento normale del negozio
(kg: prima aggiunta 0,2, successive 0,1; pezzi: 1).
Un cambio di unità rispetto alla posizione già presente viene segnalato
senza modificare il carrello.

## Schema e futuro rilascio

`migrations/editorial-publication.sql` aggiunge le pubblicazioni e dipende
da `migrations/editorial-admin.sql`. È stata applicata esclusivamente
al database di sviluppo, dopo avere verificato che fosse distinto da Timeweb.
Non viene eseguita automaticamente all’avvio, nella build o nel post-merge.

Prima di un futuro rilascio servono un’approvazione distinta, verifica
di compatibilità del database Timeweb e applicazione esplicitamente autorizzata
delle migrazioni mancanti. Non usare `db:push` per questo passaggio.

## Verifiche

- `npm run test:editorial`: API reali con PostgreSQL temporaneo isolato;
  include pubblicazione, snapshot delle bozze, ritiro, permessi, concorrenza,
  rollback del log, relazioni pubbliche, privacy, filtri, prezzi e catalogo.
- `tests/editorial-public-ui.test.mjs`: prova browser facoltativa contro
  un account e prodotti usa-e-getta di sviluppo, indicati da
  `EDITORIAL_PUBLIC_UI_FIXTURE`; controlla admin, cliente anonimo,
  mappa, ricerca, player al clic, prezzi, carrello e layout mobile.
  Non esegue ordini o pagamenti.
- Build completata. Il controllo TypeScript generale continua a segnalare
  errori preesistenti estranei all’editoriale; nessuno nei nuovi moduli.
- Riproduzione e raggiungibilità effettive dei provider dalle reti russe
  non certificate da queste prove. Aprire il sito del provider resta possibile.

## Fuori da questo punto

Segnalazioni prezzo dal cliente, ricerca automatica su Internet e generazione
AI di contenuti non sono state attivate. Richiedono definizione e approvazione
dei punti successivi, così come popolamento editoriale del progetto pilota.
