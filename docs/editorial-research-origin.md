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

1. «Найти источники и подготовить текст» avvia esplicitamente fino a tre
   query distinte: fonti istituzionali, storia e origine, zona produttiva.
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
3. Il modello riceve solo l’identità editoriale del formaggio e i passaggi
   numerati delle pagine leggibili, non dati clienti, ordini o descrizioni private.
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

## Limiti, costi e disponibilità

- Ricerca: massimo tre query per avvio, almeno 1,1 secondi tra query; una nuova
  ricerca per operatore ogni 60 secondi. Un errore provider interrompe le query
  successive, senza retry. Le altre fonti già disponibili possono essere usate.
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
