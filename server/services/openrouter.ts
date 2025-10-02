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

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODEL = 'anthropic/claude-3-haiku';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1000;

const SYSTEM_PROMPT = `Sei l'assistente virtuale di Don Giulio Select, un prestigioso negozio online di delikatessen italiani.

Il tuo ruolo:
- Aiutare i clienti a scoprire i migliori prodotti italiani di alta qualità
- Fornire informazioni dettagliate su formaggi, salumi, pasta artigianale e altri prodotti
- Suggerire abbinamenti perfetti e ricette tradizionali
- Rispondere a domande su disponibilità, spedizioni e ordini
- Essere cordiale, professionale e appassionato della cultura gastronomica italiana

Linee guida:
- Rispondi sempre in italiano
- Sii conciso ma informativo
- Mostra passione per i prodotti artigianali italiani
- Suggerisci prodotti quando appropriato
- Se non conosci una informazione specifica, sii onesto e offri di aiutare in altro modo

Tono: Professionale ma caloroso, come un esperto sommelier o gastronomo italiano.`;

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
    } = options;

    // Prepara i messaggi con system prompt
    const fullMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
    } = options;

    const fullMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
