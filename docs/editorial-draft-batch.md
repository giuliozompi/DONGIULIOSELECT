# Coda delle bozze dei formaggi

In **Сырная энциклопедия → К подготовке → Фоновая подготовка черновиков**
il redattore può confermare un singolo avvio per tutte le schede idonee,
indipendentemente dai filtri e dalla pagina visualizzata. La conferma indica
il numero di schede e il consumo massimo di ogni passaggio: fino a cinque
ricerche Brave e una risposta del modello; la proposta della mappa segue
i limiti del geocoding già usato per una bozza singola.

Le schede pubblicate, approvate, già trasferite e in attesa di conferma,
oppure con una bozza completa pronta per la loro revisione corrente,
non vengono accodate. Se una scheda cambia dopo l'avvio, la coda non riusa
la vecchia revisione. Le proposte non cambiano la scheda né la sua
pubblicazione; vanno aperte, controllate e salvate dall'editor.

Il processo del server prenota una generazione per volta e condivide il
vincolo con le ricerche singole. La coda sopravvive alla chiusura del browser
e al riavvio del server; se un tentativo si interrompe, scade e viene
segnalato come errore. Non ripete automaticamente richieste che potrebbero
essere già state addebitate. L'azione di arresto annulla i lavori non ancora
iniziati, senza interrompere una richiesta già in corso.

## Prerequisiti del rilascio

La migrazione `migrations/editorial-ai-batch.sql` aggiunge le due tabelle
dopo `editorial-ai.sql`. Nessuno script di build o avvio applica questa
migrazione. Verificare Timeweb in sola lettura prima del push, e applicare
una migrazione live soltanto dopo l'autorizzazione dell'utente. La ricerca
riusa le configurazioni Brave e AI previste per le bozze singole; finché
manca la configurazione non si può avviare la coda.
