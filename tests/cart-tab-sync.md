# Carrello in più schede

Il carrello appartiene allo stesso browser e alla stessa origine: non è una
sincronizzazione tra dispositivi o tra profili browser.

- Una modifica salvata viene mostrata nelle altre schede aperte, senza ricarica.
- Tornando a una scheda (focus o ritorno alla visibilità), viene riletto il
  carrello corrente, anche se una notifica è stata persa.
- Prima di modificare il carrello viene riletto il salvataggio corrente: una
  scheda arretrata non deve ripristinare quantità di altre righe o prodotti
  rimossi. La regola vale sia per le azioni del carrello sia per gli
  aggiornamenti funzionali diretti allo store, usati dagli acquisti editoriali.
- Quantità e prezzi delle righe determinano sempre il totale e il numero di
  articoli; i valori derivati salvati non sono considerati autorevoli.
- Le notifiche non risalvano il carrello. Una notifica tardiva non può
  ripristinare una vecchia fotografia. La cancellazione della chiave o dello
  storage svuota anche le altre schede.
- Le quantità impostate esplicitamente sullo stesso prodotto seguono l'ultimo
  salvataggio, non vengono sommate tra loro.

Questa garanzia riguarda il passaggio tra schede e le modifiche successive.
Il ciclo lettura/modifica/scrittura di localStorage non è una transazione:
due scritture esattamente contemporanee possono ancora entrare in conflitto.
Anche un clic calcolato su una quantità vecchia dello stesso prodotto prima
della notifica resta un'impostazione assoluta, non un incremento atomico.
Un'eventuale garanzia per questi casi richiede un protocollo di mutazioni
serializzate o basate su operazioni, non solo notifiche tra schede.

## Verifica

`node --test tests/web-cart-quantity.test.mjs`

Gli scenari “two tabs” condividono realmente lo stesso contesto Chromium;
gli altri scenari continuano a usare contesti isolati. Ogni scheda esclude
il service worker e intercetta le API con risposte simulate. Le asserzioni
controllano righe, quantità, prezzi, riepilogo e persistenza, non soltanto il
contenuto di localStorage. Gli acquisti editoriali vengono verificati anche
con risposta prodotto sospesa mentre l'altra scheda cambia una quantità,
rimuove il prodotto collegato o rimuove un altro prodotto.
