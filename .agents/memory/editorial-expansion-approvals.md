---
name: Video and cheese encyclopedia approvals
description: Approval boundaries for the requested video section and interactive cheese encyclopedia.
---

For the new video section and cheese encyclopedia, the user requires an operational roadmap, point by point, before proceeding: «procederai solo dopo la mia approvazione di ogni punto».

**Why:** The user explicitly requested control over each point of this expansion.

**How to apply:** Discuss and refine the roadmap first. Do not interpret approval of the overall direction or an answer to a requirements question as permission to implement every phase. Obtain explicit approval for the particular point before performing its implementation, and stop before the next point until approved.

For the first version, the user chose «Video già pubblicati» on YouTube and Telegram, rather than direct video uploads or live streaming.

**Why:** The user explicitly selected this scope when asked which video mode to include initially.

**How to apply:** Keep the initial video proposal focused on existing published videos. Treat direct uploads and live streaming as separate future extensions requiring approval; this choice itself does not authorize implementation.

Confirmed editorial scope: initial content in Russian; a world map initially focused on Italian cheeses but supporting other countries; a pilot of five videos and 10–15 cheeses, prioritizing links to the existing catalogue. Cheese articles include photographs, origin, history, characteristics, culinary uses and related purchasable products. AI prepares source-based drafts for operator review before publication. Purchases use the existing catalogue's prices, availability and weight rules.

**Why:** The user explicitly approved this proposed scope.

**How to apply:** Preserve these boundaries when proposing individual implementation phases. Scope approval alone does not authorize subsequent design, development or release phases.

«Video e carta dei formaggi sono due sezioni separate». La sezione video riporta le attività di Don Giulio: videoricette, interviste, recensioni di prodotti e/o locali, quali magazzini, mercati e ristoranti. La carta dei formaggi è distaccata dalla sezione video, ma una scheda può contenere video e/o collegamenti a video pertinenti a quel formaggio.

**Why:** The user clarified that the cheese-centric video mockup narrowed the intended video section incorrectly.

**How to apply:** Give the videoteca its own broad identity, categories and navigation. Neither section depends on the other: cheese associations are optional for a video, and relevant media is optional in a cheese article. Do not assign an unverified playlist or post to a sample cheese merely to fill the related-video area.

La carta dei formaggi deve includere un prezzo rilevato su Internet e consentire agli utenti di segnalare un prezzo rilevato da loro; queste segnalazioni richiedono moderazione dell’amministratore.

**Why:** The user explicitly requested market-price information and administrator moderation of user contributions.

**How to apply:** Include Internet price observations and user-submitted price observations in the editorial roadmap. Do not publish user price submissions without administrator approval. Any automated price-research service still needs to be defined; this request does not authorize all later public features or release steps.

Le rilevazioni dei prezzi devono coprire «Russia e altri paesi».

**Why:** The user explicitly selected international coverage rather than Russia only.

**How to apply:** Preserve country and original currency when designing price observations; do not restrict the feature to Russian-market prices.

Editorial publication is a separate explicit decision from marking a draft ready.
Keep the last published version visible while operators edit its draft; neither
editing nor readiness alone should replace the public version.

**Why:** Draft editing and public visibility must remain independent, so an operator
can prepare incomplete changes without accidentally publishing them or removing
an already reviewed article.

**How to apply:** Preserve explicit publish/replace/withdraw actions when extending
the editorial workflow, including later AI-assisted drafts. Release to Timeweb
is another approval boundary, not an effect of publishing an individual article.

Customer price contributions are limited to signed-in accounts, one submission
per 60 seconds and ten over a rolling 24 hours across all cheeses. Repeated
identical observations from the same account are blocked for 24 hours.

**Why:** The user approved these anti-abuse limits as part of the customer
price-submission phase; they must not reset when operators correct or remove
an observation.

**How to apply:** Count original submission events independently of editable
editorial entries. Keep submissions pending until staff approval, preserve the
original owner-only history, and never expose internal moderation notes or
change catalogue selling prices from a contribution.

L’operatore deve poter inserire i formaggi anche da una lista precompilata
dall’AI, ordinata per paese di origine e importanza. Per Italia e Francia
la lista deve essere organizzabile anche per regioni di origine.

**Why:** L’utente ha richiesto questa modalità aggiuntiva per scegliere
i formaggi da inserire nell’enciclopedia.

**How to apply:** Affiancare l’elenco AI all’inserimento manuale e alla
preparazione delle singole schede. Non trattare l’elenco come contenuto
verificato o autorizzazione alla pubblicazione automatica.

L’«importanza» dell’elenco AI è una priorità editoriale soggettiva e
modificabile, non una classifica verificata di qualità o vendite.

**Why:** La richiesta riguarda l’organizzazione del lavoro redazionale;
non autorizza a presentare valutazioni del modello come dati di mercato.

**How to apply:** Conservare questa distinzione nelle future liste,
nei filtri e nei testi mostrati agli operatori o ai clienti.

Una citazione presente in una fonte dimostra la provenienza del brano,
non la correttezza di tutte le conclusioni che l’AI ne ricava.

**Why:** Un modello può indicare una fonte reale ma dedurre fatti non
supportati; soprattutto origine tradizionale e denominazioni non
certificano i prodotti effettivamente venduti.

**How to apply:** Mantenere la revisione umana delle affermazioni e
la distinzione tra origine del formaggio e produzione del prodotto.
Non usare i controlli sulle citazioni per dichiarare certificazioni,
markirovka o sicurezza alimentare automaticamente verificate.

Accanto al prezzo reale estero deve esserci un convertitore in rubli:
«l’utente russo (principale)» deve poter confrontare gli importi.
Il cambio deve essere attuale e il prezzo rilevato deve poter essere
aggiornato nel tempo, senza confondere le date dei due dati.

**Why:** L’utente ha approvato la rilevazione assistita dei prezzi con
questa modifica, specificando che il pubblico principale è russo.

**How to apply:** Conservare il prezzo e la valuta originali; affiancare
una conversione in rubli con fonte e data del cambio e la data della
rilevazione del prezzo. Comunicare che non è un costo di importazione
in Russia: la conversione non calcola dazi, trasporto, IVA e ulteriori
imposte o spese. Non presumere che il prezzo estero escluda imposte
locali già comprese dal venditore.

La frequenza scelta dall’utente è «Verifica settimanale con revisione».

**Why:** L’utente vuole mantenere aggiornati i prezzi senza pubblicare
automaticamente variazioni non controllate.

**How to apply:** Conservare una revisione amministrativa esplicita
tra nuova rilevazione e prezzo pubblico; non cambiare automaticamente
i prezzi del catalogo commerciale. Il prezzo osservato e il cambio
rimangono dati separati con date indipendenti.

La condivisione delle richieste concorrenti di cambio deve comprendere
anche la lettura della cache persistente, non soltanto la chiamata esterna.

**Why:** Due letture iniziate prima del salvataggio possono completarsi
in ordine diverso: la seconda può vedere una vecchia cache dopo che
la prima chiamata esterna è già terminata, causando un doppio recupero.

**How to apply:** Mantenere la protezione sull’intera operazione e
distinguere il giorno richiesto quando si supera la mezzanotte di Mosca.
