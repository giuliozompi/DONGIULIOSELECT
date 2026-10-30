# Punto 7 — prezzi dei negozi e conversione indicativa in rubli

## Perimetro approvato

Solo sviluppo. L’operatore associa un formaggio, un paese del mercato
e una pagina pubblica HTTPS di un negozio. Il servizio legge quella pagina:
non cerca autonomamente nel web, non accede ad account e non supera
CAPTCHA o blocchi. Per ogni fonte attiva verifica ogni sette giorni.

Le verifiche programmate non pubblicano e non modificano i prezzi del
catalogo commerciale. Producono proposte private da esaminare. L’operatore
controlla variante, stagionatura, confezione, disponibilità e condizioni,
completa i dati mancanti e salva un’osservazione **in attesa di moderazione**.
L’approvazione resta un passaggio esplicito nel sistema esistente.

## Operazioni

- Admin → prezzi di mercato: aggiungere una fonte, verificare subito,
  sospendere/riprendere, consultare lo storico.
- La creazione e la ripresa fissano la prossima scadenza a sette giorni.
  Le verifiche manuali la spostano a sette giorni dalla nuova lettura.
- Un controllo orario elabora al massimo cinque fonti scadute. Una
  prenotazione atomica evita esecuzioni duplicate; prima della lettura
  esterna sposta la prossima scadenza. Un errore non genera tentativi
  immediati automatici. L’operatore può riprovare esplicitamente.
- Richieste e trasferimenti hanno identificativi persistenti per evitare
  duplicati. Le verifiche interrotte scadono dopo due minuti e diventano
  errori visibili. Una fonte sospesa può ancora essere verificata manualmente.
- Le fonti restano nello storico se la scheda del formaggio viene eliminata,
  ma non vengono più controllate e non possono essere riattivate.
- Le pagine non leggibili, troppo grandi, dinamiche o ambigue non
  producono dati inventati. Citazioni e dati proposti non sono una prova
  automatica della correttezza dell’offerta: serve revisione umana.
- `offerConditions` è un campo pubblico approvabile distinto dalle note
  interne e dagli avvisi AI. Le note private non sono esposte ai clienti.

## Cambio

Fonte: servizio XML ufficiale della Banca di Russia
<https://cbr.ru/development/SXML>. La richiesta specifica la data corrente
di Mosca. La conversione usa `Value/Nominal`, non il valore della confezione
di valuta, e indica la data effettiva del corso ufficiale e quella di lettura.
Nei giorni non lavorativi può essere disponibile l’ultimo corso precedente.

Il cambio ha un aggiornamento separato dai prezzi dei negozi, con cache
persistente e richieste contemporanee raggruppate. La cache è verificata
ogni sei ore; dopo un errore si attende cinque minuti prima di ritentare.
Il client controlla periodicamente il servizio. Errori, valute non coperte
e corsi obsoleti sono dichiarati: non viene presentato un controvalore
obsoleto come attuale. Un corso effettivo più vecchio di sette giorni è
segnalato come obsoleto anche se il file è stato recuperato con successo.

Il cliente vede il prezzo e la valuta originali, la confezione, il paese,
la fonte, la data di rilevazione e — se disponibile — il controvalore in
rubli. Il prezzo al kg richiede un peso esplicito; nessuna equivalenza è
calcolata per i pezzi. Un prezzo rilevato più di una settimana prima ha un
avviso anche quando il cambio è recente.

Il controvalore estero **non è un prezzo di importazione in Russia**.
Non calcola trasporto internazionale, dazi, IVA d’importazione o altre
imposte/spese. Eventuali imposte già incluse dal venditore restano nel
prezzo originale. L’avviso vale anche per offerte estere già espresse in RUB.

## Verifica e rilascio

- `npm run test:editorial`: database temporanei isolati, senza chiamate
  esterne; include cache/cambi, concorrenza, scadenze, moderazione,
  autorizzazioni e rollback in caso di errore del log.
- `tests/editorial-market-ui.test.mjs`: verifica reale opt-in con fixture
  amministratore temporanea, un controllo AI reale, pagina del negozio e
  cambio CBR. Le successive esecuzioni riutilizzano il controllo salvato.
  Non eseguirlo su produzione e non creare credenziali reali.
- La migrazione esplicita è `migrations/editorial-market.sql`.
  È stata applicata soltanto allo sviluppo, dopo verifica separata
  dell’identità dei database. Non viene eseguita all’avvio o dalla build.
- Nessun invio a GitHub, modifica Timeweb o pubblicazione è autorizzato
  da questo punto. Il rilascio richiede approvazione e verifica di
  compatibilità, come le altre sezioni editoriali.
