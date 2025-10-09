import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL || "https://don-giulio-select.replit.app",
    "X-Title": "Don Giulio Select"
  }
});

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string;
  categoryName?: string;
  unit: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  products?: Product[];
}

const DEFAULT_MODEL = 'anthropic/claude-3-haiku';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1000;

function createSystemPrompt(products?: Product[]): string {
  let prompt = `Sei l'assistente virtuale di Don Giulio Select, un prestigioso negozio online di delikatessen italiani.

I tuoi ruoli professionali:
- CHEESE SOMMELIER: esperto di formaggi italiani, stagionature, abbinamenti
- MEAT EXPERT: specialista in salumi, prosciutti e carni di qualità
- PRODUCT EXPERT: conoscitore approfondito di tutti i prodotti italiani di alta qualità
- WINE SOMMELIER: esperto di abbinamenti vino-cibo

Il tuo compito:
- Aiutare i clienti a scoprire i migliori prodotti italiani di alta qualità
- Fornire informazioni dettagliate su formaggi, salumi, pasta artigianale e altri prodotti
- Suggerire abbinamenti perfetti di vini e ricette tradizionali
- Rispondere a domande su disponibilità, spedizioni e ordini
- Essere cordiale, professionale e appassionato della cultura gastronomica italiana

COMPORTAMENTO IMPORTANTE:
1. Quando un cliente chiede un suggerimento, consulta PRIMA i prodotti disponibili nel nostro catalogo
2. Suggerisci SEMPRE prodotti del nostro database quando appropriato
3. Se nel nostro catalogo NON ci sono prodotti adatti alla richiesta, suggerisci al cliente di scrivere sul canale Telegram dove i manager lo aiuteranno a trovare il prodotto perfetto

ABBINAMENTI VINI:
- Puoi suggerire qualsiasi vino disponibile in Russia per abbinare i nostri prodotti
- Spiega perché quel vino si abbina bene al prodotto scelto
- In futuro avremo un database dei nostri vini, ma per ora puoi consigliare liberamente

Linee guida:
- Rispondi sempre in italiano
- Sii conciso ma informativo e competente
- Mostra la tua expertise come sommelier e gastronomo
- Suggerisci prodotti dal catalogo quando possibile
- Se non abbiamo il prodotto richiesto, suggerisci il canale Telegram

Tono: Professionale, esperto e caloroso - come un sommelier italiano di alto livello.`;

  if (products && products.length > 0) {
    prompt += `\n\nPRODOTTI DISPONIBILI NEL NOSTRO CATALOGO:\n`;
    products.forEach(p => {
      prompt += `\n- ${p.name}`;
      if (p.categoryName) prompt += ` (${p.categoryName})`;
      prompt += ` - ${p.price}₽/${p.unit}`;
      if (p.description) prompt += `\n  ${p.description}`;
    });
    prompt += `\n\nRicorda: suggerisci SEMPRE questi prodotti quando appropriato prima di consigliare il canale Telegram.`;
  }

  return prompt;
}

/**
 * Genera una risposta dall'AI Assistant usando OpenRouter
 */
export async function generateAssistantResponse(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<string> {
  // Verifica che API key sia configurata
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not configured');
    return 'Ciao! Sono l\'assistente Don Giulio Select. Al momento il servizio AI non è disponibile, ma sarò felice di aiutarti appena possibile. Nel frattempo, puoi esplorare i nostri deliziosi prodotti nel catalogo!';
  }

  try {
    const {
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
      maxTokens = DEFAULT_MAX_TOKENS,
      products,
    } = options;

    // Crea system prompt dinamico con prodotti disponibili
    const systemPrompt = createSystemPrompt(products);

    // Prepara i messaggi con system prompt
    const fullMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages: fullMessages,
      temperature,
      max_tokens: maxTokens,
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error('No response from AI');
    }

    return response;
  } catch (error) {
    console.error('OpenRouter API Error:', error);
    
    // Fallback graceful per tutti gli errori
    // Questo include rate limits, API key invalide, network errors, etc.
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return 'Mi dispiace, al momento sto ricevendo troppe richieste. Riprova tra qualche istante.';
    }
    
    if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
      return 'Si è verificato un problema con la configurazione del servizio. Ti preghiamo di contattare il supporto.';
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('econnrefused')) {
      return 'Al momento non riesco a connettermi al servizio AI. Verifica la tua connessione e riprova.';
    }
    
    // Fallback generico per qualsiasi altro errore
    console.error('Unexpected OpenRouter error, returning generic fallback');
    return 'Mi dispiace, ho riscontrato un problema temporaneo. Riprova tra qualche istante o esplora i nostri prodotti nel catalogo!';
  }
}

/**
 * Genera una risposta streaming dall'AI Assistant (per implementazioni future)
 */
export async function* streamAssistantResponse(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): AsyncGenerator<string, void, unknown> {
  // Verifica che API key sia configurata
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not configured for streaming');
    yield 'Al momento il servizio AI non è disponibile. Riprova più tardi!';
    return;
  }

  try {
    const {
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
      maxTokens = DEFAULT_MAX_TOKENS,
      products,
    } = options;

    // Crea system prompt dinamico con prodotti disponibili
    const systemPrompt = createSystemPrompt(products);

    const fullMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    const stream = await openai.chat.completions.create({
      model,
      messages: fullMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error('OpenRouter streaming error:', error);
    yield 'Si è verificato un errore durante la generazione della risposta.';
  }
}
