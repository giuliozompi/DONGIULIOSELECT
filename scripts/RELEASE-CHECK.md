# Confermare una release Timeweb

Il push GitHub **non** conferma il deploy. Questo controllo invia solo GET pubbliche:
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

## Regressione della build senza Git

```
node --test tests/release-build.test.mjs
```

La prova copia `scripts/build.mjs` senza modificarlo in una directory temporanea
fuori dal checkout, senza `.git`, con sorgenti minimi isolati e i compilatori
Vite/esbuild reali già installati in `node_modules`. Non compila l'intera
applicazione: verifica la pipeline di identificazione e manifest con entry
server, frontend, CSS, chunk lazy, service worker e asset pubblici annidati.
Non avvia server, non importa il backend applicativo e non usa DB, rete o
servizi reali; il processo di build riceve solo PATH, NODE_ENV e TZ, senza
ereditare secret o configurazione Git. Le fixture vengono eliminate a fine test,
anche in caso di errore.

Quattro compilazioni verificano che server, HTML, manifest e log riportino lo
stesso ID SHA-256; che una ricompilazione invariata mantenga l'ID; che modifiche
separate al backend e al frontend lo cambino; e che il manifest elenchi tutti e
soli i JS/CSS prodotti, con checksum corrispondenti ai byte su disco.
La prova è inclusa anche in `npm run test:release`, insieme ai controlli HTTP
con server di test locali già esistenti.

## Controllo dopo il rilascio

```
npm run release:check -- <Build-ID-atteso> 120
```

Destinazione fissa della CLI: `https://dongiulioselect.ru`. Scadenza predefinita
120 secondi, massimo 600; timeout per richiesta 8 secondi, pausa tra tentativi
5 secondi, tutti limitati dalla scadenza complessiva.
La stessa scadenza comprende avvio di Chromium, navigazione, esecuzione React e
chiusura del browser; non viene riavviata dopo i controlli HTTP.

### Requisito browser

Eseguire il controllo da una macchina con Node.js, dipendenze del progetto
(`npm ci`) e Chromium headless installato, disponibile come `chromium` nel PATH.
Se necessario indicare l'eseguibile installato con `CHROMIUM_PATH`.
Non occorre installarlo sul server Timeweb: la verifica si esegue esternamente,
contro il sito pubblico. Se il browser manca o non parte il rilascio resta
**non confermato**; non esiste un successo automatico limitato ai download HTTP.

- `/healthz`: JSON non memorizzabile in cache, ID atteso, DB raggiungibile tramite
  solo `SELECT 1`, stato di registrazione route, frontend, migrazioni e seed.
  Un errore avvio restituisce 503 senza messaggi DB o valori di configurazione.
- `/`: HTML con lo stesso ID, non una pagina di errore o frontend precedente.
- `/release.json`: stesso ID e manifest degli asset JS/CSS.
- Ogni asset JS/CSS, inclusi chunk lazy e service worker: GET, tipo corretto e
  SHA-256 del contenuto. Un 200 HTML al posto di JS non passa.
- Browser Chromium nuovo e anonimo: apre `/`, attende la home `/web` e verifica
  elementi visibili dentro `#root`: header, titolo principale, pulsante
  `data-testid="button-hero-catalog"` e footer. Ricontrolla il Build ID nel DOM.
  Dopo il rendering e il completamento delle risorse essenziali osserva almeno
  altri 1,5 secondi per intercettare errori tardivi. Non fa click né compila form.
- Eccezioni JavaScript non gestite, promise rifiutate e `console.error` rendono
  il controllo negativo, anche quando React mostra un error boundary.
  Non vengono stampati messaggi remoti, corpi delle risposte o dati personali.
- Documento, JS/CSS del manifest e GET `/web-api/products` e
  `/web-api/categories` devono completarsi senza errori di rete/HTTP.
  Anche un 401 su queste API **pubbliche** è un errore, non una sessione anonima.

### Sola lettura e sessione anonima

Il browser usa un profilo temporaneo, senza cookie o token cliente, cache
disabilitata e service worker disattivati prima della navigazione.
Il suo traffico è limitato a GET della home, degli asset JS/CSS del manifest
e delle due API pubbliche sopra indicate, sulla stessa origine.
Cookie e intestazioni Authorization non vengono inoltrati.

L'app tenta normalmente `POST /web-api/auth/refresh` all'avvio: il test la
intercetta **prima dell'invio**, risponde localmente con JSON e HTTP 401 e ne
riporta il conteggio. Questo 401 atteso non è un errore JavaScript e non comporta
alcun rinnovo reale della sessione. Non prova il comportamento del server di
autenticazione. Ogni altra operazione non consentita (anche GET protette,
redirect verso altri percorsi o invii a terzi) viene bloccata e fa fallire il test.

Immagini, font, manifest PWA, favicon e SDK Telegram esterno non vengono
scaricati dal browser e non sono oggetto di questa prova. Gli stili di terzi
sono bloccati; quelli JS/CSS del manifest locale sono invece obbligatori.
WebSocket ed EventSource sono disabilitati. Il processo browser e i suoi figli
vengono terminati anche in caso di scadenza e il profilo temporaneo viene rimosso.

Exit code: **0** confermato; **1** scaduto/non confermato; **2** argomenti errati.
Non ci sono polling infiniti, deploy, rollback o correzioni automatiche.
Se il processo non parte, si osservano timeout/errori HTTP; se il vecchio processo
continua a rispondere si segnala un ID diverso/non identificabile. Questi casi non
permettono di dedurre da soli la causa: consultare esito e log build/avvio Timeweb.
Il controllo non avvia il server né esegue le sue migrazioni o il seed.

## Limiti

Il successo prova la disponibilità pubblica della build e dei suoi JS/CSS e
il rendering iniziale della home React senza errori rilevati nel periodo osservato,
non l’esecuzione di ogni interazione o di tutti i chunk lazy, immagini remote o API di terzi,
né la UI o le API di un cliente autenticato. Nessuna sessione cliente viene usata.
Eventuali prove successive di API protette richiedono autenticazione autorizzata
e devono rimanere in sola lettura.

## Regressioni del controllo browser

```
node --test tests/release-browser.test.mjs tests/release-check.test.mjs
```

Incluse anche in `npm run test:release`. Le prove browser usano Chromium reale
con server HTTP di fixture locali, senza backend, DB, account o servizi reali.
Coprono rendering, eccezioni/promise/console, chunk tardivo, 401 pubblico inatteso,
JS mancante, versione errata, blocco di scritture/GET protette/redirect e traffico
esterno, service worker, browser assente e scadenza durante caricamento o pagina
vuota. Le fixture HTTP verificano che la fase browser riceva solo il tempo
residuo e che un suo errore non possa essere dichiarato un rilascio verificato.
