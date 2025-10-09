import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { verifyTelegramInitData, optionalTelegramAuth } from "./middleware/verifyTelegramInitData";
import { requireAdmin } from "./middleware/requireAdmin";
import { requireMasterAdmin } from "./middleware/requireMasterAdmin";
import { insertProductSchema, insertOrderSchema, insertCategorySchema, PAID_ORDER_STATUSES } from "@shared/schema";
import { z } from "zod";
import { getDaDataService } from "./services/dadata";

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
  
  // GET /api/products/:id/recommendations - Ottieni prodotti raccomandati
  app.get("/api/products/:id/recommendations", verifyTelegramInitData, async (req, res) => {
    try {
      const productId = req.params.id;
      const associations = await storage.getProductAssociations(productId);
      res.json(associations);
    } catch (error) {
      console.error('Error fetching product recommendations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== UTENTE ====================
  
  // GET /api/user - Ottieni dati utente corrente
  app.get("/api/user", verifyTelegramInitData, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== INDIRIZZI UTENTE ====================
  
  // GET /api/user/addresses - Ottieni tutti gli indirizzi dell'utente
  app.get("/api/user/addresses", verifyTelegramInitData, async (req, res) => {
    try {
      const addresses = await storage.getUserAddresses(req.userId!);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching user addresses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/user/addresses - Crea nuovo indirizzo
  app.post("/api/user/addresses", verifyTelegramInitData, async (req, res) => {
    try {
      const addressSchema = z.object({
        label: z.string().min(1),
        fullAddress: z.string().min(10),
        city: z.string().optional(),
        street: z.string().optional(),
        building: z.string().optional(),
        flat: z.string().optional(),
        postalCode: z.string().optional(),
        dadataFiasId: z.string().optional(),
        isDefault: z.boolean().optional(),
      });
      
      const addressData = addressSchema.parse(req.body);
      
      // Se questo indirizzo è impostato come default, rimuovi il flag da tutti gli altri
      if (addressData.isDefault) {
        const existingAddresses = await storage.getUserAddresses(req.userId!);
        for (const addr of existingAddresses) {
          if (addr.isDefault) {
            await storage.updateUserAddress(addr.id, { isDefault: false });
          }
        }
      }
      
      const address = await storage.createUserAddress({
        ...addressData,
        userId: req.userId!,
      });
      
      res.json(address);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating user address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/user/addresses/:id - Elimina indirizzo
  app.delete("/api/user/addresses/:id", verifyTelegramInitData, async (req, res) => {
    try {
      const addressId = req.params.id;
      
      // Verifica che l'indirizzo appartenga all'utente
      const addresses = await storage.getUserAddresses(req.userId!);
      const addressToDelete = addresses.find(addr => addr.id === addressId);
      
      if (!addressToDelete) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      const success = await storage.deleteUserAddress(addressId);
      
      if (!success) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting user address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/user/addresses/:id/set-default - Imposta indirizzo come default
  app.post("/api/user/addresses/:id/set-default", verifyTelegramInitData, async (req, res) => {
    try {
      const addressId = req.params.id;
      
      // Verifica che l'indirizzo appartenga all'utente
      const addresses = await storage.getUserAddresses(req.userId!);
      const addressToUpdate = addresses.find(addr => addr.id === addressId);
      
      if (!addressToUpdate) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      // Rimuovi flag default da tutti gli altri indirizzi
      for (const addr of addresses) {
        if (addr.isDefault && addr.id !== addressId) {
          await storage.updateUserAddress(addr.id, { isDefault: false });
        }
      }
      
      // Imposta questo come default
      await storage.updateUserAddress(addressId, { isDefault: true });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting default address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== ORDINI ====================
  
  // POST /api/orders - Crea nuovo ordine dal carrello
  app.post("/api/orders", verifyTelegramInitData, async (req, res) => {
    try {
      // Valida dati cliente
      const customerDataSchema = z.object({
        customerName: z.string().min(2),
        customerPhone: z.string().regex(/^\+?[0-9]{10,15}$/),
        customerEmail: z.string().email().optional(),
        deliveryAddress: z.string().min(10),
        deliveryCity: z.string().optional(),
        deliveryStreet: z.string().optional(),
        deliveryBuilding: z.string().optional(),
        deliveryFlat: z.string().optional(),
        deliveryPostalCode: z.string().optional(),
        dadataFiasId: z.string().optional(),
        deliveryNotes: z.string().optional(),
        deliveryMethod: z.enum(['yandex_go', 'cdek', 'don_giulio_courier', 'pickup']).optional(),
        saveAddress: z.boolean().optional(),
        addressLabel: z.string().optional(),
      });
      
      const customerData = customerDataSchema.parse(req.body);
      
      // Ottieni carrello utente
      const cart = await storage.getCart(req.userId!);
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }
      
      // Popola items con dettagli prodotto
      const orderItems = await Promise.all(
        cart.items.map(async (item) => {
          const product = await storage.getProductById(item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }
          return {
            productId: item.productId,
            productName: product.name,
            quantity: item.quantity,
            price: item.priceAtAdd,
            unit: product.unit,
          };
        })
      );
      
      // Calcola totale iniziale
      const initialAmount = orderItems.reduce((sum, item) => 
        sum + parseFloat(item.price) * item.quantity, 
        0
      );
      
      // Ottieni bonuses disponibili (FIFO: ordinati per createdAt)
      const availableBonuses = await storage.getUnusedBonusesByUserId(req.userId!);
      
      // Applica bonuses automaticamente (FIFO)
      let remainingAmount = initialAmount;
      const usedBonuses: string[] = [];
      let totalBonusApplied = 0;
      
      for (const bonus of availableBonuses) {
        if (remainingAmount <= 0) break;
        
        const bonusAmount = parseFloat(bonus.amount);
        const appliedAmount = Math.min(bonusAmount, remainingAmount);
        
        totalBonusApplied += appliedAmount;
        remainingAmount -= appliedAmount;
        usedBonuses.push(bonus.id);
        
        // Se il bonus è completamente usato, procedi al prossimo
        if (appliedAmount >= bonusAmount) {
          continue;
        } else {
          // Il bonus copre completamente il resto, ferma
          break;
        }
      }
      
      const finalAmount = Math.max(0, initialAmount - totalBonusApplied).toFixed(2);
      
      // Salva indirizzo se richiesto
      if (customerData.saveAddress && customerData.addressLabel) {
        // Verifica se l'indirizzo esiste già
        const existingAddresses = await storage.getUserAddresses(req.userId!);
        const addressExists = existingAddresses.some(addr => 
          addr.fullAddress === customerData.deliveryAddress && 
          addr.city === customerData.deliveryCity
        );
        
        if (!addressExists) {
          await storage.createUserAddress({
            userId: req.userId!,
            label: customerData.addressLabel,
            fullAddress: customerData.deliveryAddress,
            city: customerData.deliveryCity,
            street: customerData.deliveryStreet,
            building: customerData.deliveryBuilding,
            flat: customerData.deliveryFlat,
            postalCode: customerData.deliveryPostalCode,
            dadataFiasId: customerData.dadataFiasId,
            isDefault: existingAddresses.length === 0, // Primo indirizzo diventa default
          });
        }
      }
      
      // Crea ordine con importo finale scontato e dati cliente
      const order = await storage.createOrder({
        userId: req.userId!,
        items: orderItems,
        amount: finalAmount,
        customerName: customerData.customerName,
        customerPhone: customerData.customerPhone,
        deliveryAddress: customerData.deliveryAddress,
        deliveryCity: customerData.deliveryCity,
        deliveryStreet: customerData.deliveryStreet,
        deliveryBuilding: customerData.deliveryBuilding,
        deliveryFlat: customerData.deliveryFlat,
        deliveryPostalCode: customerData.deliveryPostalCode,
        dadataFiasId: customerData.dadataFiasId,
        deliveryNotes: customerData.deliveryNotes,
        deliveryMethod: customerData.deliveryMethod,
      });
      
      // Salva dati utente (phone, email) per riproporli nel prossimo ordine
      await storage.updateUser(req.userId!, {
        phone: customerData.customerPhone,
        email: customerData.customerEmail || undefined,
      });
      
      // Marca bonuses come usati
      for (const bonusId of usedBonuses) {
        await storage.markBonusAsUsed(bonusId, order.id);
      }
      
      // Svuota carrello
      await storage.clearCart(req.userId!);
      
      res.json({
        ...order,
        bonusApplied: totalBonusApplied.toFixed(2),
        bonusesUsed: usedBonuses.length,
      });
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
  
  // GET /api/fortune - Ottieni spin tokens, premi e bonuses dell'utente
  app.get("/api/fortune", verifyTelegramInitData, async (req, res) => {
    try {
      const tokens = await storage.getSpinTokens(req.userId!);
      const prizes = await storage.getPrizesByUserId(req.userId!);
      const bonuses = await storage.getUnusedBonusesByUserId(req.userId!);
      
      // Calcola totale bonus disponibile
      const totalBonusAmount = bonuses.reduce((sum, b) => sum + parseFloat(b.amount), 0);
      
      res.json({
        spinTokens: tokens.tokens,
        prizes,
        bonuses,
        totalBonusAmount: totalBonusAmount.toFixed(2),
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
        return res.status(400).json({ error: 'Нет доступных вращений' });
      }
      
      // Verifica che l'utente abbia almeno un ordine completato
      const orders = await storage.getOrdersByUserId(req.userId!);
      // Stati che indicano che l'ordine è stato pagato (include stati post-pagamento)
      const paidOrders = orders.filter(o => PAID_ORDER_STATUSES.includes(o.status as any));
      
      if (paidOrders.length === 0) {
        return res.status(400).json({ error: 'Необходимо сделать хотя бы один заказ' });
      }
      
      // Ottieni l'ultimo ordine completato (per calcolare il bonus)
      const lastPaidOrder = paidOrders[0]; // Orders sono già ordinati per createdAt desc
      const lastOrderAmount = parseFloat(lastPaidOrder.amount);
      
      // Decrementa token
      const updatedTokens = await storage.decrementSpinTokens(req.userId!);
      if (!updatedTokens) {
        return res.status(500).json({ error: 'Failed to decrement tokens' });
      }
      
      // Premi con probabilità corrette
      const prizeOptions = [
        { percentage: 5, weight: 50, name: '5% бонус' },    // 50%
        { percentage: 10, weight: 15, name: '10% бонус' },  // 15%
        { percentage: 15, weight: 7, name: '15% бонус' },   // 7%
        { percentage: 0, weight: 28, name: 'Продукт' },     // 28% (prodotto da provare)
      ];
      
      const totalWeight = prizeOptions.reduce((sum, p) => sum + p.weight, 0);
      let random = Math.random() * totalWeight;
      
      let selectedPrize = prizeOptions[0];
      for (const prize of prizeOptions) {
        random -= prize.weight;
        if (random <= 0) {
          selectedPrize = prize;
          break;
        }
      }
      
      // Calcola importo bonus (% dell'ultimo ordine)
      const bonusAmount = (lastOrderAmount * selectedPrize.percentage) / 100;
      
      let result: any;
      
      if (selectedPrize.percentage > 0) {
        // Crea bonus (persistente)
        const bonus = await storage.createBonus({
          userId: req.userId!,
          percentage: selectedPrize.percentage,
          amount: bonusAmount.toFixed(2),
          fromOrderId: lastPaidOrder.id,
          used: false,
        });
        
        result = {
          type: 'bonus',
          percentage: selectedPrize.percentage,
          amount: bonusAmount.toFixed(2),
          name: selectedPrize.name,
          bonus,
        };
      } else {
        // Prodotto da provare (implementazione futura)
        result = {
          type: 'product',
          name: 'Образец продукта',
          description: 'Вы получите образец нашего продукта!',
        };
      }
      
      res.json({
        result,
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
      const userMessage = await storage.createMessage({
        conversationId: convId,
        role: 'user',
        content,
      });
      
      // Ottieni storico messaggi per contesto
      const conversationMessages = await storage.getMessagesByConversationId(convId);
      
      // Prepara messaggi per OpenRouter
      const { generateAssistantResponse } = await import('./services/openrouter');
      const aiMessages = conversationMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      
      // Genera risposta AI
      const aiResponse = await generateAssistantResponse(aiMessages);
      
      // Salva risposta assistente
      const assistantMessage = await storage.createMessage({
        conversationId: convId,
        role: 'assistant',
        content: aiResponse,
      });
      
      res.json({
        conversationId: convId,
        userMessage,
        assistantMessage,
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
      
      // Crea payment intent СБП
      const { createSBPPaymentIntent } = await import('./services/sbp-payment');
      const sbpIntent = await createSBPPaymentIntent(orderId, order.amount, 'RUB');
      
      // Salva payment intent nel database
      const paymentIntent = await storage.createPaymentIntent({
        orderId,
        provider: 'SBP',
        status: 'pending',
        amount: order.amount,
        redirectUrl: sbpIntent.redirectUrl,
        raw: {
          sbpPaymentId: sbpIntent.id,
          qrCodeData: sbpIntent.qrCodeData,
          expiresAt: sbpIntent.expiresAt.toISOString(),
        },
      });
      
      // Aggiorna stato ordine a "link inviato" solo se non è già in uno stato più avanzato
      if (order.status === 'ОФОРМЛЕН' || order.status === 'СОБРАН') {
        await storage.updateOrderStatus(orderId, 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', paymentIntent.id);
      }
      
      res.json({
        ...paymentIntent,
        qrCodeData: sbpIntent.qrCodeData,
        expiresAt: sbpIntent.expiresAt,
      });
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
      const schema = z.object({
        paymentIntentId: z.string(),
        status: z.enum(['completed', 'failed']),
        transactionId: z.string().optional(),
        errorCode: z.string().optional(),
        errorMessage: z.string().optional(),
        signature: z.string(),
      });
      
      const webhookPayload = schema.parse(req.body);
      
      // Verifica firma webhook
      const { verifySBPWebhookSignature } = await import('./services/sbp-payment');
      const { signature, ...payloadToVerify } = webhookPayload;
      
      const isValid = verifySBPWebhookSignature(payloadToVerify, signature);
      
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
      
      // Aggiorna payment intent
      const paymentIntent = await storage.updatePaymentIntentStatus(
        webhookPayload.paymentIntentId,
        webhookPayload.status,
        {
          transactionId: webhookPayload.transactionId,
          errorCode: webhookPayload.errorCode,
          errorMessage: webhookPayload.errorMessage,
        }
      );
      
      if (!paymentIntent) {
        return res.status(404).json({ error: 'Payment intent not found' });
      }
      
      // Aggiorna stato ordine con nuovo stato russo
      const orderStatus = webhookPayload.status === 'completed' ? 'ОПЛАЧЕН' : 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ';
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
  
  // POST /api/payments/sbp/simulate - Simula completamento pagamento (solo development)
  app.post("/api/payments/sbp/simulate", async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: 'Not found' });
    }
    
    try {
      const schema = z.object({
        paymentIntentId: z.string(),
        success: z.boolean().default(true),
      });
      
      const { paymentIntentId, success } = schema.parse(req.body);
      
      // Simula webhook СБП
      const { simulatePaymentCompletion } = await import('./services/sbp-payment');
      const webhookPayload = await simulatePaymentCompletion(paymentIntentId, success);
      
      // Invia webhook a noi stessi
      const baseUrl = process.env.APP_URL || 'http://localhost:5000';
      const webhookResponse = await fetch(`${baseUrl}/api/payments/sbp/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });
      
      if (!webhookResponse.ok) {
        throw new Error(`Webhook failed: ${webhookResponse.statusText}`);
      }
      
      res.json({
        success: true,
        webhookPayload,
        message: success ? 'Payment simulated as successful' : 'Payment simulated as failed',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error simulating payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== ADMIN ROUTES ====================
  
  // GET /api/admin/check - Verifica se l'utente corrente è admin
  // SECURITY: Richiede sia auth Telegram che verifica admin per non esporre la lista admin
  app.get("/api/admin/check", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      // Verifica anche se è master admin
      const isMasterAdmin = await storage.isMasterAdmin(req.userId!);
      res.json({ isAdmin: true, isMasterAdmin });
    } catch (error) {
      console.error('Error checking admin status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/admin/categories - Crea categoria (ADMIN ONLY)
  app.post("/api/admin/categories", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(categoryData);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'created',
        entityType: 'category',
        entityId: category.id,
        actionData: {
          categoryName: category.name,
          categorySlug: category.slug,
        },
      });
      
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/admin/categories/:id - Aggiorna categoria (ADMIN ONLY)
  app.patch("/api/admin/categories/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const updates = insertCategorySchema.partial().parse(req.body);
      
      // Ottieni dati vecchi prima dell'aggiornamento
      const oldCategory = await storage.getCategoryById(req.params.id);
      if (!oldCategory) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      const category = await storage.updateCategory(req.params.id, updates);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'updated',
        entityType: 'category',
        entityId: category.id,
        actionData: {
          categoryName: category.name,
          categorySlug: category.slug,
          oldData: {
            name: oldCategory.name,
            slug: oldCategory.slug,
            parentId: oldCategory.parentId,
            sortOrder: oldCategory.sortOrder,
          },
          newData: {
            name: category.name,
            slug: category.slug,
            parentId: category.parentId,
            sortOrder: category.sortOrder,
          },
        },
      });
      
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/admin/categories/:id - Elimina categoria (ADMIN ONLY)
  app.delete("/api/admin/categories/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      // Ottieni dati prima della cancellazione
      const category = await storage.getCategoryById(req.params.id);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      const success = await storage.deleteCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'category',
        entityId: category.id,
        actionData: {
          categoryName: category.name,
          categorySlug: category.slug,
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting category:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/admin/products - Crea prodotto (ADMIN ONLY)
  app.post("/api/admin/products", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'created',
        entityType: 'product',
        entityId: product.id,
        actionData: {
          productName: product.name,
          productSlug: product.slug,
        },
      });
      
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/admin/products/:id - Aggiorna prodotto (ADMIN ONLY)
  app.patch("/api/admin/products/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const updates = insertProductSchema.partial().parse(req.body);
      
      // Ottieni dati vecchi prima dell'aggiornamento
      const oldProduct = await storage.getProductById(req.params.id);
      if (!oldProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const product = await storage.updateProduct(req.params.id, updates);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'updated',
        entityType: 'product',
        entityId: product.id,
        actionData: {
          productName: product.name,
          productSlug: product.slug,
          oldData: {
            name: oldProduct.name,
            slug: oldProduct.slug,
            categoryId: oldProduct.categoryId,
            price: oldProduct.price,
            inStock: oldProduct.inStock,
          },
          newData: {
            name: product.name,
            slug: product.slug,
            categoryId: product.categoryId,
            price: product.price,
            inStock: product.inStock,
          },
        },
      });
      
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/admin/products/:id - Elimina prodotto (ADMIN ONLY)
  app.delete("/api/admin/products/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      // Ottieni dati prima della cancellazione
      const product = await storage.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const success = await storage.deleteProduct(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'product',
        entityId: product.id,
        actionData: {
          productName: product.name,
          productSlug: product.slug,
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== ADMIN ORDER MANAGEMENT ====================
  
  // GET /api/admin/orders - Ottieni tutti gli ordini (ADMIN ONLY)
  app.get("/api/admin/orders", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const orders = await storage.getAllOrders({ status, limit });
      res.json(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // PATCH /api/admin/orders/:id/status - Aggiorna stato ordine (ADMIN ONLY)
  app.patch("/api/admin/orders/:id/status", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        status: z.enum(['ОФОРМЛЕН', 'СОБРАН', 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', 'ОПЛАЧЕН', 'ВЫЗВАН КУРЬЕР', 'ПОЛУЧЕН']),
      });
      
      const { status } = schema.parse(req.body);
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Aggiorna stato
      const updatedOrder = await storage.updateOrder(orderId, { status });
      
      // Se lo stato è СОБРАН, genera e invia link pagamento automaticamente
      if (status === 'СОБРАН') {
        try {
          // Verifica se esiste già un payment intent per questo ordine
          let paymentIntent = await storage.getPaymentIntentByOrderId(orderId);
          let sbpIntent: any;
          
          if (!paymentIntent || paymentIntent.status !== 'pending') {
            // Crea nuovo payment intent СБП solo se non esiste o se è scaduto/completato
            const { createSBPPaymentIntent } = await import('./services/sbp-payment');
            sbpIntent = await createSBPPaymentIntent(orderId, order.amount, 'RUB');
            
            // Salva payment intent nel database
            paymentIntent = await storage.createPaymentIntent({
              orderId,
              provider: 'SBP',
              status: 'pending',
              amount: order.amount,
              redirectUrl: sbpIntent.redirectUrl,
              raw: {
                sbpPaymentId: sbpIntent.id,
                qrCodeData: sbpIntent.qrCodeData,
                expiresAt: sbpIntent.expiresAt.toISOString(),
              },
            });
          } else {
            // Riusa payment intent esistente
            sbpIntent = {
              redirectUrl: paymentIntent.redirectUrl,
              ...(paymentIntent.raw as any),
            };
          }
          
          // Invia link pagamento via Telegram
          const { sendPaymentLink } = await import('./services/telegram-bot');
          await sendPaymentLink(
            order.userId,
            orderId,
            order.amount,
            sbpIntent.redirectUrl
          );
          
          // Invia link pagamento via email (se disponibile)
          if (order.customerEmail) {
            const { sendPaymentLinkEmail } = await import('./services/email');
            await sendPaymentLinkEmail(
              order.customerEmail,
              orderId,
              order.customerName,
              order.amount,
              sbpIntent.redirectUrl
            );
          }
          
          // Aggiorna ordine con info pagamento e timestamp invio link
          await storage.updateOrder(orderId, {
            status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
            paymentId: paymentIntent.id,
            paymentLinkSentAt: new Date(),
          });
          
          return res.json({
            ...updatedOrder,
            status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
            paymentLinkSent: true,
          });
        } catch (error) {
          console.error('Error sending payment link:', error);
          return res.status(500).json({ 
            error: 'Order status updated but payment link sending failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating order status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/orders/:id/call-courier - Chiama corriere per ordine (ADMIN ONLY)
  app.post("/api/admin/orders/:id/call-courier", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        courierService: z.string().default('manual'),
        courierOrderId: z.string().optional(),
        courierTrackingUrl: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Aggiorna ordine con info corriere
      const updatedOrder = await storage.updateOrder(orderId, {
        status: 'ВЫЗВАН КУРЬЕР',
        courierService: data.courierService,
        courierOrderId: data.courierOrderId || null,
        courierTrackingUrl: data.courierTrackingUrl || null,
        courierCalledAt: new Date(),
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error calling courier:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== ORDER EDITING (ADMIN) ====================
  
  // Helper function per calcolare totale ordine considerando sconto
  function calculateOrderTotal(items: any[], discount?: string | null, discountType?: string | null, discountValue?: string | null) {
    // Calcola totale prodotti
    const subtotal = items.reduce((sum: number, item: any) => 
      sum + parseFloat(item.price) * item.quantity, 0
    );
    
    // Se non c'è sconto, ritorna subtotal
    if (!discount || !discountType || !discountValue) {
      return {
        subtotal,
        discountAmount: 0,
        total: subtotal,
      };
    }
    
    // Calcola sconto
    let discountAmount = 0;
    if (discountType === 'percentage') {
      const percentage = parseFloat(discountValue);
      discountAmount = (subtotal * percentage) / 100;
    } else {
      discountAmount = parseFloat(discountValue);
    }
    
    const total = Math.max(0, subtotal - discountAmount);
    
    return {
      subtotal,
      discountAmount,
      total,
    };
  }
  
  // POST /api/admin/orders/:id/update-quantity - Modifica quantità prodotto (ADMIN ONLY)
  app.post("/api/admin/orders/:id/update-quantity", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        productId: z.string(),
        newQuantity: z.number().positive(),
        notes: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const orderId = req.params.id;
      const adminUserId = req.userId!;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Trova il prodotto nell'ordine
      const itemIndex = order.items.findIndex((item: any) => item.productId === data.productId);
      if (itemIndex === -1) {
        return res.status(404).json({ error: 'Product not found in order' });
      }
      
      const oldQuantity = order.items[itemIndex].quantity;
      const productName = order.items[itemIndex].productName;
      
      // Aggiorna quantità
      const newItems = [...order.items];
      newItems[itemIndex] = { ...newItems[itemIndex], quantity: data.newQuantity };
      
      // Ricalcola totale considerando lo sconto esistente
      const totals = calculateOrderTotal(
        newItems, 
        order.discount, 
        order.discountType, 
        order.discountValue
      );
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        items: newItems,
        amount: totals.total.toFixed(2),
        discount: totals.discountAmount.toFixed(2),
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId,
        changeType: 'quantity_changed',
        changeData: {
          productId: data.productId,
          productName,
          oldQuantity,
          newQuantity: data.newQuantity,
          notes: data.notes,
        },
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating quantity:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/orders/:id/add-product - Aggiungi prodotto (ADMIN ONLY)
  app.post("/api/admin/orders/:id/add-product", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        productId: z.string(),
        quantity: z.number().positive().optional(),
        notes: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const orderId = req.params.id;
      const adminUserId = req.userId!;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Ottieni info prodotto
      const product = await storage.getProductById(data.productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Determina quantità default basata su unità di misura
      let quantity = data.quantity;
      if (!quantity) {
        // Se unità è кг (peso), usa 0.2 come default, altrimenti 1
        quantity = product.unit === 'кг' ? 0.2 : 1;
      }
      
      // Aggiungi prodotto
      const newItem = {
        productId: product.id,
        productName: product.name,
        quantity,
        price: product.price,
        unit: product.unit,
      };
      
      const newItems = [...order.items, newItem];
      
      // Ricalcola totale considerando lo sconto esistente
      const totals = calculateOrderTotal(
        newItems,
        order.discount,
        order.discountType,
        order.discountValue
      );
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        items: newItems,
        amount: totals.total.toFixed(2),
        discount: totals.discountAmount.toFixed(2),
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId,
        changeType: 'product_added',
        changeData: {
          addedProductId: product.id,
          addedProductName: product.name,
          addedQuantity: quantity,
          addedPrice: product.price,
          notes: data.notes,
        },
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error adding product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/orders/:id/remove-product - Rimuovi prodotto (ADMIN ONLY)
  app.post("/api/admin/orders/:id/remove-product", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        productId: z.string(),
        notes: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const orderId = req.params.id;
      const adminUserId = req.userId!;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const itemIndex = order.items.findIndex((item: any) => item.productId === data.productId);
      if (itemIndex === -1) {
        return res.status(404).json({ error: 'Product not found in order' });
      }
      
      const removedProduct = order.items[itemIndex];
      
      // Rimuovi prodotto
      const newItems = order.items.filter((_: any, idx: number) => idx !== itemIndex);
      
      if (newItems.length === 0) {
        return res.status(400).json({ error: 'Cannot remove all products from order' });
      }
      
      // Ricalcola totale considerando lo sconto esistente
      const totals = calculateOrderTotal(
        newItems,
        order.discount,
        order.discountType,
        order.discountValue
      );
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        items: newItems,
        amount: totals.total.toFixed(2),
        discount: totals.discountAmount.toFixed(2),
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId,
        changeType: 'product_removed',
        changeData: {
          removedProductId: removedProduct.productId,
          removedProductName: removedProduct.productName,
          notes: data.notes,
        },
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error removing product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/orders/:id/apply-discount - Applica sconto (ADMIN ONLY)
  app.post("/api/admin/orders/:id/apply-discount", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        discountType: z.enum(['percentage', 'fixed']),
        discountValue: z.string(),
        notes: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const orderId = req.params.id;
      const adminUserId = req.userId!;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Calcola il totale dai prodotti (subtotal) e poi applica il nuovo sconto
      const totals = calculateOrderTotal(
        order.items,
        '0', // Ignora sconto esistente per calcolare il subtotal
        data.discountType,
        data.discountValue
      );
      
      const oldAmount = parseFloat(order.amount);
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        discount: totals.discountAmount.toFixed(2),
        discountType: data.discountType,
        discountValue: data.discountValue,
        amount: totals.total.toFixed(2),
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId,
        changeType: 'discount_applied',
        changeData: {
          discountType: data.discountType,
          discountValue: data.discountValue,
          oldAmount: oldAmount.toFixed(2),
          newAmount: totals.total.toFixed(2),
          notes: data.notes,
        },
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error applying discount:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/orders/:id/change-address - Cambia indirizzo (ADMIN ONLY)
  app.post("/api/admin/orders/:id/change-address", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        deliveryAddress: z.string(),
        deliveryCity: z.string().optional(),
        deliveryStreet: z.string().optional(),
        deliveryBuilding: z.string().optional(),
        deliveryFlat: z.string().optional(),
        deliveryPostalCode: z.string().optional(),
        notes: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      const orderId = req.params.id;
      const adminUserId = req.userId!;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const oldAddress = order.deliveryAddress;
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        deliveryAddress: data.deliveryAddress,
        deliveryCity: data.deliveryCity || null,
        deliveryStreet: data.deliveryStreet || null,
        deliveryBuilding: data.deliveryBuilding || null,
        deliveryFlat: data.deliveryFlat || null,
        deliveryPostalCode: data.deliveryPostalCode || null,
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId,
        changeType: 'address_changed',
        changeData: {
          oldAddress,
          newAddress: data.deliveryAddress,
          notes: data.notes,
        },
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error changing address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/admin/orders/:id/logs - Ottieni log modifiche (ADMIN ONLY)
  app.get("/api/admin/orders/:id/logs", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const logs = await storage.getOrderChangeLogs(orderId);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching order logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/orders/:id - Ottieni singolo ordine (ADMIN ONLY)
  // NOTA: Questa route deve essere DOPO tutte le route più specifiche (es. /:id/logs)
  app.get("/api/admin/orders/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== ADMIN MANAGEMENT ====================
  
  // GET /api/admin/admins - Ottieni lista amministratori (MASTER ADMIN ONLY)
  app.get("/api/admin/admins", verifyTelegramInitData, requireAdmin, requireMasterAdmin, async (req, res) => {
    try {
      const admins = await storage.getAllAdmins();
      res.json(admins);
    } catch (error) {
      console.error('Error fetching admins:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/admins - Aggiungi amministratore (MASTER ADMIN ONLY)
  app.post("/api/admin/admins", verifyTelegramInitData, requireAdmin, requireMasterAdmin, async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string(),
        telegramUsername: z.string().optional(),
      });
      
      const { userId, telegramUsername } = schema.parse(req.body);
      
      await storage.addAdmin(userId, telegramUsername);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'created',
        entityType: 'admin',
        entityId: userId,
        actionData: {
          affectedUserId: userId,
          affectedUsername: telegramUsername,
        },
      });
      
      res.json({ success: true, userId, telegramUsername });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error adding admin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/admin/admins/:userId - Rimuovi amministratore (MASTER ADMIN ONLY)
  app.delete("/api/admin/admins/:userId", verifyTelegramInitData, requireAdmin, requireMasterAdmin, async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Impedisci auto-rimozione
      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot remove yourself as admin' });
      }
      
      // Ottieni username prima della rimozione
      const admins = await storage.getAllAdmins();
      const adminToRemove = admins.find(a => a.userId === userId);
      
      await storage.removeAdmin(userId);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'admin',
        entityId: userId,
        actionData: {
          affectedUserId: userId,
          affectedUsername: adminToRemove?.telegramUsername || undefined,
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing admin:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/action-logs - Ottieni log azioni amministrative (ADMIN ONLY)
  app.get("/api/admin/action-logs", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      const logs = await storage.getAdminActionLogs({ entityType, entityId, limit });
      res.json(logs);
    } catch (error) {
      console.error('Error fetching admin action logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== PRODUCT ASSOCIATIONS (ADMIN) ====================
  
  // GET /api/admin/product-associations - Ottieni tutte le associazioni prodotti (ADMIN ONLY)
  app.get("/api/admin/product-associations", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const associations = await storage.getAllProductAssociations();
      res.json(associations);
    } catch (error) {
      console.error('Error fetching product associations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/product-associations - Crea associazione prodotto (ADMIN ONLY)
  app.post("/api/admin/product-associations", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { insertProductAssociationSchema } = await import('@shared/schema');
      const associationData = insertProductAssociationSchema.parse(req.body);
      
      // Verifica che i prodotti esistano
      const sourceProduct = await storage.getProductById(associationData.sourceProductId);
      const targetProduct = await storage.getProductById(associationData.targetProductId);
      
      if (!sourceProduct) {
        return res.status(404).json({ error: 'Source product not found' });
      }
      
      if (!targetProduct) {
        return res.status(404).json({ error: 'Target product not found' });
      }
      
      // Impedisci auto-associazione
      if (associationData.sourceProductId === associationData.targetProductId) {
        return res.status(400).json({ error: 'Cannot associate a product with itself' });
      }
      
      const association = await storage.createProductAssociation(associationData);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'created',
        entityType: 'product_association',
        entityId: association.id,
        actionData: {
          sourceProductName: sourceProduct.name,
          targetProductName: targetProduct.name,
        },
      });
      
      res.json(association);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating product association:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/admin/product-associations/:id - Elimina associazione (ADMIN ONLY)
  app.delete("/api/admin/product-associations/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id;
      
      // Ottieni dati prima della cancellazione
      const allAssociations = await storage.getAllProductAssociations();
      const association = allAssociations.find(a => a.id === id);
      
      if (!association) {
        return res.status(404).json({ error: 'Association not found' });
      }
      
      const success = await storage.deleteProductAssociation(id);
      
      if (!success) {
        return res.status(404).json({ error: 'Association not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'product_association',
        entityId: id,
        actionData: {
          sourceProductName: association.sourceProduct.name,
          targetProductName: association.targetProduct.name,
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting product association:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== DADATA ADDRESS SUGGESTIONS ====================
  
  // GET /api/address/suggest - Suggerimenti indirizzi russi via DaData
  app.get("/api/address/suggest", async (req, res) => {
    try {
      const query = req.query.query as string;
      
      if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
      }

      const dadataService = getDaDataService();
      
      if (!dadataService) {
        // Fallback: return empty suggestions if DaData not configured
        return res.json({ suggestions: [] });
      }

      const suggestions = await dadataService.suggestAddress(query);
      res.json({ suggestions });
    } catch (error) {
      console.error('Error fetching address suggestions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
