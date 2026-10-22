# Confermare una release Timeweb

Il push GitHub **non** conferma il deploy. Questo controllo usa solo GET pubbliche:
non crea account, ordini, pagamenti o messaggi e non aggira l’autenticazione.

## Build esistente

In Timeweb mantenere directory di build vuota, comando `npm run build` e avvio
`pm2 start --no-daemon dist/index.js`. Anche `scripts/build.sh` e il Dockerfile
del progetto usano ora lo stesso comando.

Non occorrono `.git`, un nuovo secret o variabili Timeweb: al termine della build
lo script calcola SHA-256 dal bundle server e dai file frontend, incorpora il
risultato nel server e in `dist/public/index.html` e scrive `dist/public/release.json`.
Il log contiene `Build ID: <64 caratteri>`. Il valore identifica i contenuti
compilati, **non** un commit Git. Non include valori dell’ambiente o dati del DB.
Conservare il valore atteso dai log della build Timeweb associata al rilascio
desiderato (o dai medesimi artefatti compilati). Non copiarlo da `/healthz` come
“atteso”: così si confermerebbe qualunque vecchia versione già online.
Build in ambienti diversi possono produrre ID diversi: fa fede l’artefatto
effettivamente costruito da Timeweb.

## Controllo dopo il rilascio

```
npm run release:check -- <Build-ID-atteso> 120
```

Destinazione fissa della CLI: `https://dongiulioselect.ru`. Scadenza predefinita
120 secondi, massimo 600; timeout per richiesta 8 secondi, pausa tra tentativi
5 secondi, tutti limitati dalla scadenza complessiva.

- `/healthz`: JSON non memorizzabile in cache, ID atteso, DB raggiungibile tramite
  solo `SELECT 1`, stato di registrazione route, frontend, migrazioni e seed.
  Un errore avvio restituisce 503 senza messaggi DB o valori di configurazione.
- `/`: HTML con lo stesso ID, non una pagina di errore o frontend precedente.
- `/release.json`: stesso ID e manifest degli asset JS/CSS.
- Ogni asset JS/CSS, inclusi chunk lazy e service worker: GET, tipo corretto e
  SHA-256 del contenuto. Un 200 HTML al posto di JS non passa.

Exit code: **0** confermato; **1** scaduto/non confermato; **2** argomenti errati.
Non ci sono polling infiniti, deploy, rollback o correzioni automatiche.
Se il processo non parte, si osservano timeout/errori HTTP; se il vecchio processo
continua a rispondere si segnala un ID diverso/non identificabile. Questi casi non
permettono di dedurre da soli la causa: consultare esito e log build/avvio Timeweb.
Il controllo non avvia il server né esegue le sue migrazioni o il seed.

## Limiti

Il successo prova la disponibilità pubblica della build e dei suoi JS/CSS,
non l’esecuzione di ogni interazione React, immagini remote o API di terzi,
né la UI o le API di un cliente autenticato. Nessuna sessione cliente viene usata.
Eventuali prove successive di API protette richiedono autenticazione autorizzata
e devono rimanere in sola lettura.
