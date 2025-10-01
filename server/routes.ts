import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { verifyTelegramInitData, optionalTelegramAuth } from "./middleware/verifyTelegramInitData";
import { insertProductSchema, insertOrderSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== CATEGORIE ====================
  
  // GET /api/categories - Ottieni tutte le categorie
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getAllCategories();
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== PRODOTTI ====================
  
  // GET /api/products - Ottieni tutti i prodotti con filtri opzionali
  app.get("/api/products", async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const inStock = req.query.inStock === 'true' ? true : 
                      req.query.inStock === 'false' ? false : undefined;
      
      const products = await storage.getAllProducts({ categoryId, inStock });
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/products/:id - Ottieni un prodotto per ID
  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(product);
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== CARRELLO ====================
  
  // GET /api/cart - Ottieni il carrello dell'utente
  app.get("/api/cart", verifyTelegramInitData, async (req, res) => {
    try {
      const cart = await storage.getCart(req.userId!);
      if (!cart) {
        return res.json({ userId: req.userId, items: [], updatedAt: new Date() });
      }
      res.json(cart);
    } catch (error) {
      console.error('Error fetching cart:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/cart/items - Aggiungi prodotto al carrello
  app.post("/api/cart/items", verifyTelegramInitData, async (req, res) => {
    try {
      const schema = z.object({
        productId: z.string(),
        quantity: z.number().positive(),
      });
      
      const { productId, quantity } = schema.parse(req.body);
      
      // Valida che il prodotto esista e ottieni prezzo attuale
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      if (!product.inStock) {
        return res.status(400).json({ error: 'Product out of stock' });
      }
      
      // Ottieni carrello corrente
      const currentCart = await storage.getCart(req.userId!);
      const items = currentCart?.items || [];
      
      // Controlla se il prodotto esiste già
      const existingIndex = items.findIndex(item => item.productId === productId);
      
      if (existingIndex >= 0) {
        // Aggiorna quantità
        items[existingIndex].quantity += quantity;
      } else {
        // Aggiungi nuovo item con prezzo dal catalogo
        items.push({
          productId,
          quantity,
          priceAtAdd: product.price,
        });
      }
      
      const cart = await storage.setCart(req.userId!, items);
      res.json(cart);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error adding to cart:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // PATCH /api/cart/items/:productId - Aggiorna quantità prodotto
  app.patch("/api/cart/items/:productId", verifyTelegramInitData, async (req, res) => {
    try {
      const schema = z.object({
        quantity: z.number().positive(),
      });
      
      const { quantity } = schema.parse(req.body);
      const productId = req.params.productId;
      
      const currentCart = await storage.getCart(req.userId!);
      if (!currentCart) {
        return res.status(404).json({ error: 'Cart not found' });
      }
      
      const items = currentCart.items.map(item => 
        item.productId === productId ? { ...item, quantity } : item
      );
      
      const cart = await storage.setCart(req.userId!, items);
      res.json(cart);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating cart item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/cart/items/:productId - Rimuovi prodotto dal carrello
  app.delete("/api/cart/items/:productId", verifyTelegramInitData, async (req, res) => {
    try {
      const productId = req.params.productId;
      
      const currentCart = await storage.getCart(req.userId!);
      if (!currentCart) {
        return res.status(404).json({ error: 'Cart not found' });
      }
      
      const items = currentCart.items.filter(item => item.productId !== productId);
      
      if (items.length === 0) {
        await storage.clearCart(req.userId!);
        return res.json({ userId: req.userId, items: [], updatedAt: new Date() });
      }
      
      const cart = await storage.setCart(req.userId!, items);
      res.json(cart);
    } catch (error) {
      console.error('Error removing from cart:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/cart/clear - Svuota il carrello
  app.post("/api/cart/clear", verifyTelegramInitData, async (req, res) => {
    try {
      await storage.clearCart(req.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing cart:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== ORDINI ====================
  
  // POST /api/orders - Crea nuovo ordine
  app.post("/api/orders", verifyTelegramInitData, async (req, res) => {
    try {
      const schema = insertOrderSchema.omit({ status: true, paymentId: true });
      const orderData = schema.parse({
        ...req.body,
        userId: req.userId,
      });
      
      const order = await storage.createOrder(orderData);
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/orders - Ottieni ordini dell'utente
  app.get("/api/orders", verifyTelegramInitData, async (req, res) => {
    try {
      const orders = await storage.getOrdersByUserId(req.userId!);
      res.json(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/orders/:id - Ottieni ordine per ID
  app.get("/api/orders/:id", verifyTelegramInitData, async (req, res) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che l'ordine appartenga all'utente
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== FORTUNE WHEEL ====================
  
  // GET /api/fortune - Ottieni spin tokens e premi dell'utente
  app.get("/api/fortune", verifyTelegramInitData, async (req, res) => {
    try {
      const tokens = await storage.getSpinTokens(req.userId!);
      const prizes = await storage.getPrizesByUserId(req.userId!);
      
      res.json({
        spinTokens: tokens.tokens,
        prizes,
      });
    } catch (error) {
      console.error('Error fetching fortune data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/fortune/spin - Gira la ruota della fortuna
  app.post("/api/fortune/spin", verifyTelegramInitData, async (req, res) => {
    try {
      // Verifica che l'utente abbia token disponibili
      const tokens = await storage.getSpinTokens(req.userId!);
      if (tokens.tokens <= 0) {
        return res.status(400).json({ error: 'No spin tokens available' });
      }
      
      // Decrementa token
      const updatedTokens = await storage.decrementSpinTokens(req.userId!);
      if (!updatedTokens) {
        return res.status(500).json({ error: 'Failed to decrement tokens' });
      }
      
      // Genera premio casuale
      const prizeTypes = [
        { name: 'Скидка 5%', type: 'discount', value: '5', weight: 30 },
        { name: 'Скидка 10%', type: 'discount', value: '10', weight: 20 },
        { name: 'Скидка 15%', type: 'discount', value: '15', weight: 15 },
        { name: 'Скидка 20%', type: 'discount', value: '20', weight: 10 },
        { name: 'Бесплатная доставка', type: 'delivery_coupon', value: 'free', weight: 15 },
        { name: 'Подарок: Оливки 200г', type: 'gift', value: 'olives_200g', weight: 7 },
        { name: 'Подарок: Брускетта', type: 'gift', value: 'bruschetta', weight: 3 },
      ];
      
      const totalWeight = prizeTypes.reduce((sum, p) => sum + p.weight, 0);
      let random = Math.random() * totalWeight;
      
      let selectedPrize = prizeTypes[0];
      for (const prize of prizeTypes) {
        random -= prize.weight;
        if (random <= 0) {
          selectedPrize = prize;
          break;
        }
      }
      
      // Crea premio
      const prize = await storage.createPrize({
        userId: req.userId!,
        name: selectedPrize.name,
        type: selectedPrize.type,
        value: selectedPrize.value,
        claimed: false,
      });
      
      // Crea record spin
      await storage.createSpin({
        userId: req.userId!,
        prizeId: prize.id,
      });
      
      res.json({
        prize,
        remainingTokens: updatedTokens.tokens,
      });
    } catch (error) {
      console.error('Error spinning fortune wheel:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/fortune/prizes/:id/claim - Reclama un premio
  app.post("/api/fortune/prizes/:id/claim", verifyTelegramInitData, async (req, res) => {
    try {
      const prizeId = req.params.id;
      const schema = z.object({
        orderId: z.string().optional(),
      });
      
      const { orderId } = schema.parse(req.body);
      
      // Ottieni il premio
      const prizes = await storage.getPrizesByUserId(req.userId!);
      const prize = prizes.find(p => p.id === prizeId);
      
      if (!prize) {
        return res.status(404).json({ error: 'Prize not found' });
      }
      
      if (prize.claimed) {
        return res.status(400).json({ error: 'Prize already claimed' });
      }
      
      // Reclama il premio
      const updatedPrize = await storage.updatePrize(prizeId, {
        claimed: true,
        claimedAt: new Date(),
        orderId: orderId ?? null,
      });
      
      res.json(updatedPrize);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error claiming prize:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== AI ASSISTANT ====================
  
  // GET /api/assistant/messages - Ottieni messaggi conversazione
  app.get("/api/assistant/messages", verifyTelegramInitData, async (req, res) => {
    try {
      const conversationId = req.query.conversationId as string | undefined;
      
      if (!conversationId) {
        // Crea nuova conversazione
        const conversation = await storage.createConversation({
          userId: req.userId!,
        });
        return res.json({ conversationId: conversation.id, messages: [] });
      }
      
      // Verifica ownership conversazione
      const conversation = await storage.getConversationById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      if (conversation.userId !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      const messages = await storage.getMessagesByConversationId(conversationId);
      res.json({ conversationId, messages });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/assistant/messages - Invia messaggio all'assistente
  app.post("/api/assistant/messages", verifyTelegramInitData, async (req, res) => {
    try {
      const schema = z.object({
        conversationId: z.string().optional(),
        content: z.string().min(1),
      });
      
      const { conversationId, content } = schema.parse(req.body);
      
      // Crea o verifica ownership conversazione
      let convId = conversationId;
      if (!convId) {
        const conversation = await storage.createConversation({
          userId: req.userId!,
        });
        convId = conversation.id;
      } else {
        // Verifica ownership conversazione esistente
        const conversation = await storage.getConversationById(convId);
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
        
        if (conversation.userId !== req.userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      
      // Salva messaggio utente
      await storage.createMessage({
        conversationId: convId,
        role: 'user',
        content,
      });
      
      // TODO: Chiamata a OpenRouter API verrà implementata nel task successivo
      // Per ora restituisci risposta mock
      const mockResponse = 'Ciao! Sono il tuo assistente Don Giulio Select. Come posso aiutarti oggi con i nostri deliziosi prodotti italiani?';
      
      // Salva risposta assistente
      const assistantMessage = await storage.createMessage({
        conversationId: convId,
        role: 'assistant',
        content: mockResponse,
      });
      
      res.json({
        conversationId: convId,
        message: assistantMessage,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== PAGAMENTI ====================
  
  // POST /api/payments/sbp/create-intent - Crea payment intent per СБП
  app.post("/api/payments/sbp/create-intent", verifyTelegramInitData, async (req, res) => {
    try {
      const schema = z.object({
        orderId: z.string(),
      });
      
      const { orderId } = schema.parse(req.body);
      
      // Verifica che l'ordine esista e appartenga all'utente
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      // TODO: Integrazione reale con СБП verrà implementata nel task successivo
      // Per ora crea mock payment intent
      const mockRedirectUrl = `https://sbp-mock.example.com/pay/${orderId}`;
      
      const paymentIntent = await storage.createPaymentIntent({
        orderId,
        provider: 'SBP',
        status: 'pending',
        amount: order.amount,
        redirectUrl: mockRedirectUrl,
      });
      
      // Aggiorna stato ordine
      await storage.updateOrderStatus(orderId, 'pending_payment', paymentIntent.id);
      
      res.json(paymentIntent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating payment intent:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/payments/sbp/webhook - Webhook per aggiornamenti pagamento
  app.post("/api/payments/sbp/webhook", async (req, res) => {
    try {
      // SECURITY: In production, questo endpoint DEVE:
      // 1. Verificare la firma del webhook СБП usando HMAC o PKI secondo specifiche provider
      // 2. Validare IP sorgente contro whitelist provider
      // 3. Implementare idempotency per prevenire replay attacks
      
      // Per ora, permetti solo in development
      if (process.env.NODE_ENV !== 'development') {
        // TODO: Implementare verifica firma СБП prima di abilitare in production
        console.error('Webhook called in production without signature verification');
        return res.status(403).json({ error: 'Signature verification required' });
      }
      
      const schema = z.object({
        paymentIntentId: z.string(),
        status: z.enum(['completed', 'failed']),
      });
      
      const { paymentIntentId, status } = schema.parse(req.body);
      
      // Aggiorna payment intent
      const paymentIntent = await storage.updatePaymentIntentStatus(
        paymentIntentId,
        status,
        req.body
      );
      
      if (!paymentIntent) {
        return res.status(404).json({ error: 'Payment intent not found' });
      }
      
      // Aggiorna stato ordine
      const orderStatus = status === 'completed' ? 'paid' : 'failed';
      await storage.updateOrderStatus(paymentIntent.orderId, orderStatus);
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
