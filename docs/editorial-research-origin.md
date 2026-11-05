# Ricerca editoriale e coordinate d’origine

## Perimetro

Estensione del punto 1 approvato: ricerca reale delle fonti con Brave,
preparazione dei testi documentati e proposta di un punto geografico da
scegliere nell’admin. Fotografie e video non fanno parte di questa fase.
Nessuna applicazione automatica, modifica dei prezzi o pubblicazione.

## Configurazione Timeweb

- `BRAVE_API_KEY`: chiave diretta Brave Web Search, soltanto nel server.
  La connessione Replit non configura il processo Timeweb esterno.
- Il modello mantiene la configurazione Timeweb AI Gateway esistente.
- Nominatim: endpoint predefinito
  `https://nominatim.openstreetmap.org/search`.
- `EDITORIAL_GEOCODER_URL`: endpoint HTTPS Nominatim-compatible sostitutivo,
  configurabile senza modificare il software (riavviare il processo).
- `EDITORIAL_GEOCODER_DISABLED=true`: disabilita il geocoding.

Non copiare token d’identità Replit né chiavi nel browser o nei log.
La sola verifica delle variabili non equivale a una verifica di rete Timeweb.

## Percorso nell’admin

Aprire una scheda formaggio e «Подготовить с ИИ».

1. «Найти источники и подготовить текст» avvia esplicitamente fino a cinque
   query distinte: storia, origine/zona produttiva, caratteristiche tecniche,
   utilizzi in cucina e fotografie. Usa il nome originale e il vocabolario
   della lingua del paese riconosciuto (italiano, francese, russo, spagnolo,
   tedesco; altrimenti inglese), non un insieme di parole di lingue diverse.
   Le tre eventuali fonti manuali vengono conservate e considerate per prime.
2. Si leggono al massimo nove pagine, tre alla volta, conservando fino a sei
   fonti leggibili. I controlli HTTPS/DNS/redirect anti-SSRF restano attivi.
   I risultati automatici devono contenere il nome originale o russo del
   formaggio prima di essere candidati alla lettura: «consorzio» da solo non
   basta. Nel testo letto deve poi comparire il nome in un contesto caseario,
   anche per le fonti manuali incluse nella ricerca e dopo un redirect.
   Le esclusioni per pertinenza sono avvisi separati dagli errori di lettura;
   il filtro è prudenziale e può scartare pagine valide con nomi alternativi.
   Non certifica fatti né ufficialità e non avvia ricerche aggiuntive.
   La selezione riserva spazio a ogni argomento, preferisce pagine specifiche
   alle homepage e sceglie fino a sei fonti anche per diversità degli argomenti.
   Quando disponibile si estrae il contenuto principale `main`/`article`, non
   l’intera navigazione del sito.
3. Il modello riceve solo l’identità editoriale del formaggio e i passaggi
   numerati delle pagine leggibili, non dati clienti, ordini o descrizioni private.
   Riceve inoltre la corrispondenza argomento–fonte–ID dei passaggi. Il rapporto
   mostra i quattro argomenti testuali con frammenti e lacune prima della bozza.
   È un instradamento lessicale per la revisione: un frammento non è una prova
   semantica e non garantisce completezza, ufficialità o correttezza dei fatti.
4. La bozza propone storia, paese e regione/zona d’origine, caratteristiche,
   descrizione e usi quando documentati. I campi privi di citazioni sono omessi
   e segnalati. La presenza di una citazione non certifica la verità dell’asserzione.
5. Il rapporto di ricerca distingue pagine lette e fallimenti; leggibilità e
   priorità del risultato NON certificano che una fonte sia istituzionale.
6. Se fallisce il modello, i link già letti e il rapporto restano consultabili.
   Si possono scegliere fino a tre URL per la generazione manuale, senza
   ripetere il servizio di ricerca. Nessun retry AI automatico.
7. L’operatore confronta, seleziona e applica i campi. Il contenuto resta bozza.
8. Dopo aver applicato il testo, cerca una località pubblica nella zona d’origine
   e sceglie esplicitamente una delle tre proposte geografiche. Nessuna preselezione.
   Il pannello mostra i tre passaggi e spiega il blocco se c’è una proposta
   testuale da applicare; usa la regione salvata, non quella ancora proposta
   dall’AI. Applicare il testo non avvia il geocoding. Le coordinate già salvate
   restano visibili e nessuna nuova posizione viene scelta automaticamente.
   Il server applica solo coordinate del risultato salvato, associato a
   scheda e revisione; non accetta latitudine/longitudine dal client.

Un punto è rappresentativo della zona tradizionale: non delimita un’intera area
DOP, non identifica necessariamente uno stabilimento e non modifica la
`productionCountry` del prodotto commerciale.

### Generazione soltanto dai link manuali

«Сформировать только по этим ссылкам» legge tutte le fonti selezionate, una sola
volta ciascuna. Applica lo stesso filtro prudenziale di pertinenza della ricerca:
nel testo deve comparire il nome originale o russo del formaggio in un contesto
caseario. Titolo, URL e nome del produttore non bastano. Un nome alternativo non
riconosciuto può richiedere la correzione del nome originale nella scheda.
Una pagina non leggibile o non pertinente non impedisce di usare le altre:
la bozza elenca gli indirizzi scartati tra gli avvisi e le citazioni vengono
associate soltanto alle pagine effettivamente lette, nell’ordine originario.
I metadati leggibili e gli avvisi sono conservati nel job anche se fallisce il
modello; non viene salvato il testo integrale delle pagine.

Se tutte le fonti falliscono o vengono escluse, il modello non viene chiamato:
l’errore distingue gli avvisi di lettura e pertinenza e indica di scegliere
pagine specifiche, verificare il nome originale o avviare esplicitamente
la ricerca. La modalità manuale
non passa mai automaticamente a Brave e non introduce retry AI o di rete.

## Fotografie da scegliere

La ricerca può proporre fino a tre URL di immagini realmente referenziate
nell’HTML delle pagine pertinenti lette (metadati OpenGraph/Twitter e immagini
del contenuto principale). Scarta URL non HTTPS/locali, duplicati, loghi e
immagini palesemente troppo piccole. Non usa generazione di immagini né URL
inventati dal modello, non scarica file durante la ricerca e non certifica
l’identità visiva del formaggio. Se non trova candidati, lo dichiara.

Le anteprime remote partono soltanto premendo «Показать фото», senza Referer;
l’operatore verifica contenuto e diritti. L’eventuale link `rel=license` è un
indizio da verificare, non autorizzazione automatica. In assenza di quel link
i diritti sono indicati come sconosciuti.

Si possono scegliere foto e testi insieme oppure solo foto, con conferma
esplicita dei diritti e il normale comando di applicazione. «Добавить всё»
resta una selezione dei soli campi testuali. Il server accetta esclusivamente
gli ID dei candidati salvati nella generazione e associati alle sue fonti,
controlla la revisione e aggiunge URL/provenienza senza sostituire foto esistenti.
Non accetta URL immagine arbitrari dal client; massimo 12 foto nella scheda.
La conferma dei diritti e le scelte sono registrate nel log.
Una generazione è applicabile una volta sola: selezionare insieme tutti i
contenuti desiderati prima di confermare. Una ripetizione identica è idempotente.
Le pubblicazioni rimangono invariate. Se fallisce il modello, i candidati
rimangono visibili ma non applicabili da quel job fallito.

Le immagini restano URL esterni: la disponibilità futura e il permesso di
hotlink non sono garantiti. Non è una copia permanente su App Storage.

## Nomi russi e pagine italiane

Se manca `nameOriginal`, il filtro non deve cercare soltanto la grafia russa
in una fonte italiana: `Кастельманьо` e `Castelmagno` possono indicare lo stesso
nome. Per schede con origine Italia e titolo interamente cirillico, il filtro
ammette anche corrispondenze di trascrizione italiane limitate (es. `gn`/`нь`,
`c`/`к`, `zz`/`ц`), su parole intere e nello stesso ordine. Non usa distanza
di modifica, nomi inventati da AI o sottostringhe dei domini.

La pagina letta deve comunque contenere il nome e un termine di contesto
caseario vicino. Una città, un consorzio di coltelli, una homepage generica
o il solo risultato di ricerca non bastano. Con un nome originale esplicito
il confronto non lo sostituisce con varianti fonetiche. Il riconoscimento per
trascrizione genera un avviso di revisione; non certifica identità o fatti
e non scrive automaticamente il nome originale nella scheda.

Questa compatibilità vale per filtro dei risultati e verifica del corpo
pagina, in modalità ricerca e manuale. Nessuna richiesta aggiuntiva Brave/AI.
Inserire il nome originale resta raccomandato per precisione delle query.

## Limiti, costi e disponibilità

- Ricerca: massimo cinque query per avvio, almeno 1,1 secondi tra query; una nuova
  ricerca per operatore ogni 60 secondi. Un errore provider interrompe le query
  successive, senza retry. Le altre fonti già disponibili possono essere usate.
- Una sola chiamata al modello per generazione; l’estrazione foto non avvia
  altre generazioni, ricerche immagini a pagamento o fallback.
- Ricerca/testo: stessa riserva idempotente e blocco globale dei job AI esistenti;
  lease di tre minuti. Nessuna ricerca a montaggio, polling o apertura della storia.
- Nominatim: solo su richiesta, massimo una nuova chiamata ogni **15 secondi
  per l’intera app**, più restrittivo del limite pubblico di una al secondo.
  La prenotazione persistente include le chiamate fallite e vale tra repliche.
- I risultati geografici sono riusati per 30 giorni tra operatori, senza
  rinnovare artificialmente la data originale a ogni lettura della cache.
- Richieste identificate da User-Agent, timeout 10 secondi, niente retry,
  autocomplete, elaborazioni massive o indirizzi personali.
- Attribuzione «© OpenStreetMap contributors» nell’admin e nelle schede che
  citano la posizione OSM; link alla licenza e alla località.
- Il servizio geografico pubblico non offre SLA; sostituibile o disattivabile.
- Costi Brave e Gemini dipendono dai rispettivi contratti; le ricerche non
  includono automaticamente autenticità, diritti d’uso dei media o certificazioni.

Condizioni Nominatim: https://operations.osmfoundation.org/policies/nominatim/
Attribuzione: https://www.openstreetmap.org/copyright
Brave: https://api-dashboard.search.brave.com/documentation/pricing

## Persistenza e verifiche

Si riusano i job editoriali `draft`, i relativi JSONB e il registro amministrativo
per riserve, cache e proposte geografiche. Nessuna nuova tabella o migrazione.
Le pubblicazioni restano snapshot separati: salvare una bozza non le modifica.

Eseguire `npm run test:editorial` e, con il workflow attivo,
`node --test tests/editorial-research-ui.test.mjs`.
Tutti i provider nei test sono simulati: nessuna chiamata a pagamento,
nessun database Timeweb modificato e nessuna autenticazione aggirata.
Il test Brave effettuato dall’utente su Timeweb ha restituito HTTP 200 e tre
risultati; ciò verifica quel percorso, non l’intero nuovo flusso integrato.
