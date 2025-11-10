import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { verifyTelegramInitData, optionalTelegramAuth } from "./middleware/verifyTelegramInitData";
import { requireAdmin } from "./middleware/requireAdmin";
import { requireMasterAdmin } from "./middleware/requireMasterAdmin";
import { insertProductSchema, insertOrderSchema, insertCategorySchema, ORDER_STATUSES, PAID_ORDER_STATUSES, type Product, type Prize, analyticsSnapshots, analyticsTopProducts } from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { sql as sqlDrizzle, sum, count, gte, lte, desc, and } from "drizzle-orm";
import { getDaDataService } from "./services/dadata";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import { normalizePhoneNumber } from "./utils";

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== NO-CACHE MIDDLEWARE FOR ADMIN ROUTES ====================
  // Previene caching HTTP 304 per dati admin mutabili
  app.use('/api/admin', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
    next();
  });
  
  // Disabilita ETags per route admin (opzionale ma raccomandato)
  app.set('etag', false);
  
  // ==================== CATEGORIE ====================
  
  // GET /api/categories - Ottieni tutte le categorie
  app.get("/api/categories", optionalTelegramAuth, async (req, res) => {
    try {
      // SECURITY: includeHidden solo per admin autenticati, altrimenti ignora il parametro
      const requestedIncludeHidden = req.query.includeHidden === 'true';
      const isAdmin = !!(req.userId && await storage.isAdmin(req.userId));
      const includeHidden = requestedIncludeHidden && isAdmin;
      
      const categories = await storage.getAllCategories(includeHidden);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== PRODOTTI ====================
  
  // GET /api/products - Ottieni tutti i prodotti con filtri opzionali
  app.get("/api/products", optionalTelegramAuth, async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const inStock = req.query.inStock === 'true' ? true : 
                      req.query.inStock === 'false' ? false : undefined;
      
      // SECURITY: includeHidden solo per admin autenticati, altrimenti ignora il parametro
      const requestedIncludeHidden = req.query.includeHidden === 'true';
      const isAdmin = !!(req.userId && await storage.isAdmin(req.userId));
      const includeHidden = requestedIncludeHidden && isAdmin;
      
      const products = await storage.getAllProducts({ categoryId, inStock, includeHidden });
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
  
  // ==================== PREFERITI ====================
  
  // GET /api/favorites - Ottieni prodotti preferiti dell'utente
  app.get("/api/favorites", verifyTelegramInitData, async (req, res) => {
    try {
      const favorites = await storage.getFavoriteProducts(req.userId!);
      res.json(favorites);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/favorites/:productId - Aggiungi prodotto ai preferiti
  app.post("/api/favorites/:productId", verifyTelegramInitData, async (req, res) => {
    try {
      const productId = req.params.productId;
      
      // Verifica che il prodotto esista
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      await storage.addFavoriteProduct(req.userId!, productId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error adding to favorites:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/favorites/:productId - Rimuovi prodotto dai preferiti
  app.delete("/api/favorites/:productId", verifyTelegramInitData, async (req, res) => {
    try {
      const productId = req.params.productId;
      await storage.removeFavoriteProduct(req.userId!, productId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing from favorites:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/favorites/:productId/check - Verifica se prodotto è nei preferiti
  app.get("/api/favorites/:productId/check", verifyTelegramInitData, async (req, res) => {
    try {
      const productId = req.params.productId;
      const isFavorite = await storage.isFavoriteProduct(req.userId!, productId);
      res.json({ isFavorite });
    } catch (error) {
      console.error('Error checking favorite:', error);
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
  
  // PUT /api/user - Aggiorna dati utente corrente
  app.put("/api/user", verifyTelegramInitData, async (req, res) => {
    try {
      const updateSchema = z.object({
        customerName: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.union([z.string().email(), z.null()]).optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        building: z.string().nullable().optional(),
        apartment: z.string().nullable().optional(),
        addressNotes: z.string().nullable().optional(),
      });
      
      const updateData = updateSchema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (updateData.phone) {
        updateData.phone = normalizePhoneNumber(updateData.phone);
      }
      
      // Normalizza campi vuoti a null
      if (updateData.building !== undefined && updateData.building !== null && updateData.building.trim() === '') {
        updateData.building = null;
      }
      if (updateData.apartment !== undefined && updateData.apartment !== null && updateData.apartment.trim() === '') {
        updateData.apartment = null;
      }
      if (updateData.addressNotes !== undefined && updateData.addressNotes !== null && updateData.addressNotes.trim() === '') {
        updateData.addressNotes = null;
      }
      
      await storage.updateUser(req.userId!, updateData);
      
      const updatedUser = await storage.getUser(req.userId!);
      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: error.errors });
      }
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/user/purchased-products - Ottieni tutti i prodotti unici acquistati dal cliente
  app.get("/api/user/purchased-products", verifyTelegramInitData, async (req, res) => {
    try {
      const purchasedProducts = await storage.getPurchasedProducts(req.userId!);
      res.json(purchasedProducts);
    } catch (error) {
      console.error('Error fetching purchased products:', error);
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
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        phone: z.string().optional(),
        isDefault: z.boolean().optional(),
      });
      
      const addressData = addressSchema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (addressData.phone && addressData.phone.trim()) {
        addressData.phone = normalizePhoneNumber(addressData.phone);
      } else if (addressData.phone !== undefined) {
        addressData.phone = undefined;
      }
      
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
  
  // PATCH /api/user/addresses/:id - Aggiorna indirizzo
  app.patch("/api/user/addresses/:id", verifyTelegramInitData, async (req, res) => {
    try {
      const addressId = req.params.id;
      
      // Verifica che l'indirizzo appartenga all'utente
      const addresses = await storage.getUserAddresses(req.userId!);
      const addressToUpdate = addresses.find(addr => addr.id === addressId);
      
      if (!addressToUpdate) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      const updateSchema = z.object({
        label: z.string().min(1).optional(),
        fullAddress: z.string().min(10).optional(),
        city: z.string().optional(),
        street: z.string().optional(),
        building: z.string().optional(),
        flat: z.string().optional(),
        postalCode: z.string().optional(),
        dadataFiasId: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        phone: z.string().optional(),
        isDefault: z.boolean().optional(),
      });
      
      const updateData = updateSchema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (updateData.phone !== undefined) {
        if (updateData.phone && updateData.phone.trim()) {
          updateData.phone = normalizePhoneNumber(updateData.phone);
        } else {
          updateData.phone = undefined;
        }
      }
      
      // Se questo indirizzo è impostato come default, rimuovi il flag da tutti gli altri
      if (updateData.isDefault) {
        for (const addr of addresses) {
          if (addr.isDefault && addr.id !== addressId) {
            await storage.updateUserAddress(addr.id, { isDefault: false });
          }
        }
      }
      
      await storage.updateUserAddress(addressId, updateData);
      
      const updatedAddress = await storage.getUserAddresses(req.userId!);
      const result = updatedAddress.find(addr => addr.id === addressId);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating user address:', error);
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

  // ========== PICKUP ADDRESSES API ==========

  // GET /api/admin/pickup-addresses - Ottieni tutti gli indirizzi di pick-up
  app.get("/api/admin/pickup-addresses", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const addresses = await storage.getPickupAddresses();
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching pickup addresses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/admin/pickup-addresses - Crea nuovo indirizzo di pick-up
  app.post("/api/admin/pickup-addresses", verifyTelegramInitData, requireAdmin, async (req, res) => {
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
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        contactName: z.string().optional(),
        contactPhone: z.string().regex(/^[0-9 \(\)\-\+]*$/, 'Invalid phone format').optional().or(z.literal('')),
        isDefault: z.boolean().optional(),
      });
      
      const addressData = addressSchema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (addressData.contactPhone) {
        addressData.contactPhone = normalizePhoneNumber(addressData.contactPhone);
      }
      
      const address = await storage.createPickupAddress(addressData as any);
      
      res.json(address);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating pickup address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/admin/pickup-addresses/:id - Aggiorna indirizzo di pick-up
  app.patch("/api/admin/pickup-addresses/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const addressId = req.params.id;
      
      console.log('PATCH pickup address - body:', JSON.stringify(req.body, null, 2));
      
      const addressSchema = z.object({
        label: z.string().min(1).optional(),
        fullAddress: z.string().min(10).optional(),
        city: z.string().optional().nullable(),
        street: z.string().optional().nullable(),
        building: z.string().optional().nullable(),
        flat: z.string().optional().nullable(),
        postalCode: z.string().optional().nullable(),
        dadataFiasId: z.string().optional().nullable(),
        latitude: z.string().optional().nullable(),
        longitude: z.string().optional().nullable(),
        contactName: z.string().optional().nullable(),
        contactPhone: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
      });
      
      const addressData = addressSchema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (addressData.contactPhone) {
        addressData.contactPhone = normalizePhoneNumber(addressData.contactPhone);
      }
      
      const address = await storage.updatePickupAddress(addressId, addressData as any);
      
      if (!address) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      res.json(address);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating pickup address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/admin/pickup-addresses/:id - Elimina indirizzo di pick-up
  app.delete("/api/admin/pickup-addresses/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const addressId = req.params.id;
      const success = await storage.deletePickupAddress(addressId);
      
      if (!success) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting pickup address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/admin/pickup-addresses/:id/set-default - Imposta indirizzo di pick-up come default
  app.post("/api/admin/pickup-addresses/:id/set-default", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const addressId = req.params.id;
      await storage.setDefaultPickupAddress(addressId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting default pickup address:', error);
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
        deliveryPostalCode: z.string().optional(),
        dadataFiasId: z.string().optional(),
        deliveryLatitude: z.string().optional(),
        deliveryLongitude: z.string().optional(),
        deliveryNotes: z.string().optional(),
        deliveryMethod: z.enum(['yandex_go', 'cdek', 'don_giulio_courier', 'pickup']).optional(),
        paymentMethod: z.enum(['yookassa', 'cash_on_delivery']).default('yookassa'),
        saveAddress: z.boolean().optional(),
        addressLabel: z.string().optional(),
        abandonedCartCode: z.string().optional(),
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
      
      // Salva indirizzo se richiesto (BEFORE transaction)
      if (customerData.saveAddress && customerData.addressLabel) {
        const existingAddresses = await storage.getUserAddresses(req.userId!);
        const addressExists = existingAddresses.some(addr => 
          addr.fullAddress === customerData.deliveryAddress
        );
        
        if (!addressExists) {
          await storage.createUserAddress({
            userId: req.userId!,
            label: customerData.addressLabel,
            fullAddress: customerData.deliveryAddress,
            postalCode: customerData.deliveryPostalCode,
            dadataFiasId: customerData.dadataFiasId,
            latitude: customerData.deliveryLatitude,
            longitude: customerData.deliveryLongitude,
            isDefault: existingAddresses.length === 0,
          });
        }
      }
      
      // ATOMIC CHECKOUT: discount validation, order creation, bonus marking, cart clearing
      const checkoutResult = await storage.checkoutWithDiscount({
        userId: req.userId!,
        orderItems,
        initialAmount,
        abandonedCartCode: customerData.abandonedCartCode,
        orderData: {
          userId: req.userId!,
          items: orderItems,
          amount: '0', // Will be overwritten by orchestrator
          customerName: customerData.customerName,
          customerPhone: normalizePhoneNumber(customerData.customerPhone),
          customerEmail: customerData.customerEmail,
          deliveryAddress: customerData.deliveryAddress,
          deliveryPostalCode: customerData.deliveryPostalCode,
          dadataFiasId: customerData.dadataFiasId,
          deliveryLatitude: customerData.deliveryLatitude,
          deliveryLongitude: customerData.deliveryLongitude,
          deliveryNotes: customerData.deliveryNotes,
          deliveryMethod: customerData.deliveryMethod,
          paymentMethod: customerData.paymentMethod,
        },
      });
      
      const order = checkoutResult.order;
      const totalDiscountApplied = checkoutResult.discountApplied;
      const usedBonuses = checkoutResult.bonusesUsed;
      
      // Salva dati utente (AFTER transaction)
      await storage.updateUser(req.userId!, {
        customerName: customerData.customerName,
        phone: normalizePhoneNumber(customerData.customerPhone),
        email: customerData.customerEmail || undefined,
      });
      
      // Invia notifica Telegram al cliente per conferma ordine
      try {
        const { sendOrderCreatedNotification } = await import('./services/telegram-bot');
        const telegramItems = orderItems.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          unit: item.unit,
        }));
        
        const telegramSent = await sendOrderCreatedNotification(
          req.userId!,
          order.id,
          order.customerName,
          order.customerPhone,
          order.deliveryAddress,
          order.deliveryMethod || 'N/A',
          order.paymentMethod,
          telegramItems,
          order.amount,
          new Date()
        );
        if (telegramSent) {
          console.log(`✅ Order confirmation sent to user ${req.userId} for order ${order.id}`);
        } else {
          console.warn('⚠️ Telegram bot not configured - order confirmation not sent');
        }
      } catch (error) {
        console.warn('⚠️ Failed to send order confirmation via Telegram:', error);
      }
      
      // Invia email di conferma al cliente
      if (order.customerEmail) {
        try {
          const { sendOrderConfirmationToCustomer } = await import('./services/email');
          const customerEmailItems = orderItems.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            priceAtAdd: item.price,
            unit: item.unit,
          }));
          
          const customerEmailSent = await sendOrderConfirmationToCustomer(
            order.customerEmail,
            order.id,
            order.customerName,
            order.customerPhone,
            order.deliveryAddress,
            order.deliveryMethod || 'N/A',
            order.paymentMethod,
            customerEmailItems,
            order.amount,
            new Date()
          );
          
          if (customerEmailSent) {
            console.log(`✅ Order confirmation email sent to customer ${order.customerEmail} for order ${order.id}`);
          } else {
            console.warn('⚠️ Failed to send order confirmation email to customer');
          }
        } catch (error) {
          console.warn('⚠️ Failed to send order confirmation email to customer:', error);
        }
      }
      
      // Invia notifica WhatsApp al cliente
      try {
        const { sendOrderConfirmationWhatsApp } = await import('./services/whatsapp');
        const whatsappItems = orderItems.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          unit: item.unit,
        }));
        
        const whatsappSent = await sendOrderConfirmationWhatsApp(
          order.customerPhone,
          order.id,
          order.customerName,
          whatsappItems,
          order.amount,
          order.deliveryMethod || 'N/A',
          order.paymentMethod
        );
        
        if (whatsappSent) {
          console.log(`✅ Order confirmation sent via WhatsApp to ${order.customerPhone} for order ${order.id}`);
        } else {
          console.warn('⚠️ WhatsApp not configured or failed to send');
        }
      } catch (error) {
        console.warn('⚠️ Failed to send order confirmation via WhatsApp:', error);
      }
      
      // Invia notifica email ai manager per nuovo ordine
      try {
        const { sendNewOrderNotificationToManagers } = await import('./services/email');
        const emailItems = orderItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          priceAtAdd: item.price,
          unit: item.unit,
        }));
        
        const emailSent = await sendNewOrderNotificationToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.customerEmail || 'Не указан',
          order.deliveryAddress,
          order.deliveryMethod || 'N/A',
          order.paymentMethod,
          emailItems,
          order.amount,
          order.deliveryNotes || undefined
        );
        
        if (emailSent) {
          console.log(`✅ Order notification email sent to managers for order ${order.id}`);
        } else {
          console.warn('⚠️ Manager emails not configured or email service unavailable');
        }
      } catch (error) {
        console.warn('⚠️ Failed to send order notification to managers:', error);
      }
      
      // Invia notifica Telegram ai manager per nuovo ordine
      try {
        const { sendNewOrderNotificationToManagers: sendTelegramToManagers } = await import('./services/telegram-bot');
        const telegramManagerItems = orderItems.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          unit: item.unit,
        }));
        
        const telegramManagerSent = await sendTelegramToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.deliveryAddress,
          order.deliveryMethod || 'N/A',
          order.paymentMethod,
          telegramManagerItems,
          order.amount,
          new Date(),
          order.deliveryNotes || undefined
        );
        
        if (telegramManagerSent) {
          console.log(`✅ Order notification sent to managers via Telegram for order ${order.id}`);
        } else {
          console.warn('⚠️ Manager Telegram chat IDs not configured - manager notifications disabled');
        }
      } catch (error) {
        console.warn('⚠️ Failed to send order notification to managers via Telegram:', error);
      }
      
      res.json({
        ...order,
        bonusApplied: totalBonusApplied.toFixed(2),
        bonusesUsed: usedBonuses.length,
      });
    } catch (error: any) {
      // Zod validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      
      // Checkout orchestrator domain errors
      if (error.message === 'DISCOUNT_ALREADY_USED') {
        return res.status(409).json({ error: 'Codice sconto già utilizzato da un altro ordine' });
      }
      if (error.message === 'INVALID_DISCOUNT_CODE') {
        return res.status(400).json({ error: 'Codice sconto non valido' });
      }
      if (error.message === 'DISCOUNT_NOT_YOURS') {
        return res.status(403).json({ error: 'Codice sconto non appartiene a questo utente' });
      }
      if (error.message === 'DISCOUNT_EXPIRED') {
        return res.status(400).json({ error: 'Codice sconto scaduto' });
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
  
  // GET /api/orders/:id/receipt - Recupera scontrino fiscale dell'ordine
  app.get("/api/orders/:id/receipt", verifyTelegramInitData, async (req, res) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che l'ordine appartenga all'utente
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      // Verifica che l'ordine sia stato pagato
      if (!order.receiptId) {
        return res.status(404).json({ error: 'Receipt not available for this order' });
      }
      
      res.json({
        receiptId: order.receiptId,
        receiptUrl: order.receiptUrl,
        receiptStatus: order.receiptStatus,
        fiscalData: order.fiscalData,
      });
    } catch (error) {
      console.error('Error fetching order receipt:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/orders/:id/receipt/refresh - Aggiorna stato scontrino da YooKassa
  app.post("/api/orders/:id/receipt/refresh", verifyTelegramInitData, async (req, res) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che l'ordine appartenga all'utente
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      // Verifica che esista un receiptId
      if (!order.receiptId) {
        return res.status(404).json({ error: 'Receipt not available for this order' });
      }
      
      // Recupera lo stato aggiornato da YooKassa
      const { getYooKassaReceipt } = await import('./services/yookassa-payment');
      const receipt = await getYooKassaReceipt(order.receiptId);
      
      // Aggiorna i dati nel database
      await storage.updateOrderReceipt(order.id, {
        receiptId: receipt.id,
        receiptStatus: receipt.status,
        fiscalData: {
          fiscal_document_number: receipt.fiscal_document_number,
          fiscal_storage_number: receipt.fiscal_storage_number,
          fiscal_attribute: receipt.fiscal_attribute,
          registered_at: receipt.registered_at,
        },
      });
      
      res.json({
        receiptId: receipt.id,
        receiptStatus: receipt.status,
        fiscalData: {
          fiscal_document_number: receipt.fiscal_document_number,
          fiscal_storage_number: receipt.fiscal_storage_number,
          fiscal_attribute: receipt.fiscal_attribute,
          registered_at: receipt.registered_at,
        },
      });
    } catch (error) {
      console.error('Error refreshing order receipt:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/orders/:id/reorder - Riordina (aggiungi prodotti dell'ordine al carrello)
  app.post("/api/orders/:id/reorder", verifyTelegramInitData, async (req, res) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che l'ordine appartenga all'utente
      if (order.userId !== req.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      // Recupera i prodotti attuali per verificare disponibilità e prezzi
      const allProducts = await storage.getAllProducts();
      const productsMap = new Map(allProducts.map(p => [p.id, p]));
      
      let addedCount = 0;
      let unavailableCount = 0;
      const unavailableProducts: string[] = [];
      
      // Ottieni carrello corrente
      const currentCart = await storage.getCart(req.userId!);
      const cartItems = currentCart?.items || [];
      
      // Aggiungi ogni prodotto al carrello
      for (const item of order.items) {
        const currentProduct = productsMap.get(item.productId);
        
        // Verifica che il prodotto esista ancora e sia disponibile
        if (!currentProduct || !currentProduct.inStock) {
          unavailableCount++;
          unavailableProducts.push(item.productName);
          continue;
        }
        
        // Controlla se il prodotto esiste già nel carrello
        const existingIndex = cartItems.findIndex(ci => ci.productId === item.productId);
        
        if (existingIndex >= 0) {
          // Aggiorna quantità
          cartItems[existingIndex].quantity += item.quantity;
        } else {
          // Aggiungi nuovo item con prezzo attuale
          cartItems.push({
            productId: item.productId,
            quantity: item.quantity,
            priceAtAdd: currentProduct.price,
          });
        }
        addedCount++;
      }
      
      // Salva carrello aggiornato
      await storage.setCart(req.userId!, cartItems);
      
      res.json({
        success: true,
        addedCount,
        unavailableCount,
        unavailableProducts,
        message: unavailableCount > 0 
          ? `${addedCount} продуктов добавлено в корзину. ${unavailableCount} продуктов недоступны.`
          : `Все ${addedCount} продуктов добавлены в корзину`,
      });
    } catch (error) {
      console.error('Error reordering:', error);
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
        // Prodotto da provare - seleziona 1-3 prodotti casuali
        const allProducts = await storage.getAllProducts();
        const availableProducts = allProducts.filter((p: Product) => p.inStock);
        
        if (availableProducts.length === 0) {
          return res.status(500).json({ error: 'No products available for prize' });
        }
        
        // Numero casuale di prodotti (1-3)
        const numProducts = Math.floor(Math.random() * 3) + 1;
        const shuffled = [...availableProducts].sort(() => 0.5 - Math.random());
        const selectedProducts = shuffled.slice(0, Math.min(numProducts, availableProducts.length));
        
        // Crea prize di tipo 'gift'
        const prize = await storage.createPrize({
          userId: req.userId!,
          name: numProducts === 1 ? `Образец продукта: ${selectedProducts[0].name}` : `${numProducts} образца продуктов`,
          type: 'gift',
          value: selectedProducts.map(p => p.name).join(', '),
          productIds: selectedProducts.map(p => p.id),
          claimed: false,
        });
        
        result = {
          type: 'product',
          name: prize.name,
          description: 'Свяжитесь с администратором для получения приза',
          prize,
          products: selectedProducts,
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
  
  // GET /api/prizes - Ottieni tutti i premi dell'utente con dettagli prodotti
  app.get("/api/prizes", verifyTelegramInitData, async (req, res) => {
    try {
      const prizes = await storage.getPrizesByUserId(req.userId!);
      
      // Arricchisci i premi di tipo 'gift' con dettagli prodotti
      const prizesWithProducts = await Promise.all(
        prizes.map(async (prize) => {
          if (prize.type === 'gift' && prize.productIds && prize.productIds.length > 0) {
            const products = await Promise.all(
              prize.productIds.map(id => storage.getProductById(id))
            );
            return {
              ...prize,
              products: products.filter((p): p is Product => p != null),
            };
          }
          return { ...prize, products: [] };
        })
      );
      
      res.json(prizesWithProducts);
    } catch (error) {
      console.error('Error fetching prizes:', error);
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
      
      // Recupera tutti i prodotti disponibili per il context dell'AI
      const allProducts = await storage.getAllProducts();
      const categories = await storage.getAllCategories();
      
      // Crea mappa categorie per nome
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      
      // Prepara prodotti per l'AI con informazioni categoria
      const productsForAI = allProducts.map(p => ({
        id: p.id,
        name: p.name,
        description: p.descriptionShort || p.descriptionFull,
        price: p.price,
        categoryId: p.categoryId,
        categoryName: categoryMap.get(p.categoryId),
        unit: p.unit,
        tasteVariations: p.tasteVariations,
      }));
      
      // Prepara messaggi per OpenRouter
      const { generateAssistantResponse } = await import('./services/openrouter');
      const aiMessages = conversationMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      
      // Genera risposta AI con prodotti disponibili
      const aiResponse = await generateAssistantResponse(aiMessages, {
        products: productsForAI,
      });
      
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
  
  // POST /api/payments/yookassa/create - Crea payment con YooKassa
  app.post("/api/payments/yookassa/create", verifyTelegramInitData, async (req, res) => {
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
      
      // Crea payment con YooKassa
      const { createYooKassaPayment, formatYooKassaAmount } = await import('./services/yookassa-payment');
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
        : (process.env.APP_URL || 'http://localhost:5000');
      
      const returnUrl = `${baseUrl}/payment-return`;
      
      const yookassaPayment = await createYooKassaPayment({
        amount: {
          value: formatYooKassaAmount(parseFloat(order.amount)),
          currency: 'RUB',
        },
        description: `Заказ №${orderId.slice(0, 8)}`,
        return_url: returnUrl,
        metadata: {
          orderId,
          userId: order.userId,
        },
        capture: true, // Pagamento immediato
      });
      
      // Salva payment intent nel database
      const paymentIntent = await storage.createPaymentIntent({
        orderId,
        provider: 'YooKassa',
        status: 'pending',
        amount: order.amount,
        redirectUrl: yookassaPayment.confirmation?.confirmation_url || null,
        raw: {
          yookassaPaymentId: yookassaPayment.id,
          yookassaStatus: yookassaPayment.status,
          createdAt: yookassaPayment.created_at,
        },
      });
      
      // Aggiorna stato ordine a "link inviato" solo se non è già in uno stato più avanzato
      if (order.status === 'ОФОРМЛЕН' || order.status === 'СОБРАН') {
        await storage.updateOrderStatus(orderId, 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', paymentIntent.id);
      }
      
      res.json({
        ...paymentIntent,
        confirmationUrl: yookassaPayment.confirmation?.confirmation_url,
        yookassaPaymentId: yookassaPayment.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating YooKassa payment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/payments/yookassa/webhook - Webhook per notifiche YooKassa
  app.post("/api/payments/yookassa/webhook", async (req, res) => {
    try {
      console.log('🔔 [YooKassa Webhook] Received webhook notification');
      console.log('📦 [YooKassa Webhook] Event type:', req.body?.event);
      console.log('💰 [YooKassa Webhook] Payment ID:', req.body?.object?.id);
      console.log('📋 [YooKassa Webhook] Payment status:', req.body?.object?.status);
      
      const { verifyYooKassaWebhook } = await import('./services/yookassa-payment');
      
      // YooKassa invia webhook nel formato { type: 'notification', event: '...', object: {...} }
      const webhookEvent = req.body;
      
      // Ottieni IP del client (supporta proxy)
      const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || req.socket.remoteAddress;
      console.log('🌐 [YooKassa Webhook] Client IP:', clientIP);
      
      // Verifica autenticità webhook (IP filtering + API verification)
      const isValid = await verifyYooKassaWebhook(webhookEvent, clientIP);
      
      if (!isValid) {
        console.error('❌ [YooKassa Webhook] Invalid webhook - failed verification');
        return res.status(403).json({ error: 'Invalid webhook' });
      }
      
      console.log('✅ [YooKassa Webhook] Webhook verified successfully');
      
      const payment = webhookEvent.object;
      
      // Trova l'ordine associato a questo pagamento
      // PRIMA prova tramite metadata, POI cerca per paymentId nel database
      let orderId = payment.metadata?.orderId;
      let order;
      
      if (orderId) {
        console.log(`🔍 [YooKassa Webhook] Found orderId in metadata: ${orderId}`);
        order = await storage.getOrderById(orderId);
      }
      
      // Se non trovato tramite metadata, cerca per paymentId in tutti i payment intents
      if (!order) {
        console.warn(`⚠️ [YooKassa Webhook] Order not found via metadata, searching by paymentId ${payment.id}...`);
        
        // Cerca tutti i payment intents con questo paymentId
        const allPaymentIntents = await storage.getAllPaymentIntents();
        const matchingIntent = allPaymentIntents.find(
          intent => (intent.raw as any)?.yookassaPaymentId === payment.id
        );
        
        if (matchingIntent) {
          orderId = matchingIntent.orderId;
          order = await storage.getOrderById(orderId);
          console.log(`✅ [YooKassa Webhook] Found order via paymentId lookup: ${orderId}`);
        }
      }
      
      // Se ancora non trovato, ERRORE CRITICO
      if (!orderId || !order) {
        const errorMsg = `CRITICAL: Cannot find order for payment ${payment.id}. Metadata orderId: ${payment.metadata?.orderId || 'MISSING'}`;
        console.error(`❌ [YooKassa Webhook] ${errorMsg}`);
        
        // TODO: Log to database for debugging in production
        return res.status(400).json({ 
          error: 'Order not found',
          paymentId: payment.id,
          metadataOrderId: payment.metadata?.orderId || null,
        });
      }
      
      console.log(`🔍 [YooKassa Webhook] Processing payment for order ${orderId}...`);
      
      let paymentIntent = await storage.getPaymentIntentByOrderId(orderId);
      
      // Se il payment intent non esiste, crealo al volo
      // Questo gestisce i casi in cui il pagamento è stato creato manualmente su YooKassa
      // o il payment intent non è stato creato correttamente nel nostro sistema
      if (!paymentIntent) {
        console.warn(`⚠️ [YooKassa Webhook] Payment intent not found for order ${orderId}, creating new one...`);
        
        // Verifica che l'ordine esista
        const order = await storage.getOrderById(orderId);
        if (!order) {
          console.error(`[YooKassa Webhook] Order not found: ${orderId}`);
          return res.status(404).json({ error: 'Order not found' });
        }
        
        // Crea payment intent con i dati dal webhook
        paymentIntent = await storage.createPaymentIntent({
          orderId,
          provider: 'YooKassa',
          status: 'pending', // Sarà aggiornato subito dopo
          amount: payment.amount?.value || order.amount,
          redirectUrl: null, // Non disponibile dal webhook
          raw: {
            yookassaPaymentId: payment.id,
            yookassaStatus: payment.status,
            createdAt: payment.created_at,
            createdViaWebhook: true, // Flag per indicare che è stato creato dal webhook
          },
        });
        
        console.log(`✅ [YooKassa Webhook] Created payment intent ${paymentIntent.id} for order ${orderId}`);
      } else {
        console.log(`✅ [YooKassa Webhook] Found existing payment intent ${paymentIntent.id}`);
        
        // Verifica che il payment ID corrisponda (solo se esiste già)
        const storedYookassaId = (paymentIntent.raw as any)?.yookassaPaymentId;
        if (storedYookassaId && storedYookassaId !== payment.id) {
          console.error(`[YooKassa Webhook] Payment ID mismatch: expected ${storedYookassaId}, got ${payment.id}`);
          return res.status(400).json({ error: 'Payment ID mismatch' });
        }
      }
      
      // Mappa status YooKassa → nostro status
      let ourStatus: 'pending' | 'completed' | 'failed' = 'pending';
      if (payment.status === 'succeeded') {
        ourStatus = 'completed';
      } else if (payment.status === 'canceled') {
        ourStatus = 'failed';
      }
      
      console.log(`📝 [YooKassa Webhook] Updating payment intent status to ${ourStatus}...`);
      
      // Aggiorna payment intent
      await storage.updatePaymentIntentStatus(
        paymentIntent.id,
        ourStatus,
        {
          yookassaStatus: payment.status,
          yookassaPaid: payment.paid,
        }
      );
      
      console.log(`✅ [YooKassa Webhook] Payment intent updated successfully`);
      
      // Ricarica l'ordine (potrebbe essere stato aggiornato)
      order = await storage.getOrderById(paymentIntent.orderId);
      if (!order) {
        console.error(`[YooKassa Webhook] Order not found: ${paymentIntent.orderId}`);
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Aggiorna stato ordine
      if (payment.status === 'succeeded') {
        console.log(`💳 [YooKassa Webhook] Payment succeeded for order ${paymentIntent.orderId}`);
        console.log(`📝 [YooKassa Webhook] Updating order status to ОПЛАЧЕН...`);
        
        await storage.updateOrderStatus(paymentIntent.orderId, 'ОПЛАЧЕН');
        console.log(`✅ [YooKassa Webhook] Order status updated successfully`);
        
        // Invia notifica pagamento ai manager via Email
        try {
          const { sendOrderPaidNotificationToManagers } = await import('./services/email');
          await sendOrderPaidNotificationToManagers(
            order.id,
            order.customerName,
            order.customerPhone,
            order.amount,
            order.paymentMethod
          );
          console.log(`✅ Payment notification email sent to managers for order ${order.id}`);
        } catch (error) {
          console.warn('⚠️ Failed to send payment notification email to managers:', error);
        }
        
        // Invia notifica pagamento ai manager via Telegram
        try {
          const { sendOrderPaidNotificationToManagers: sendTelegramToManagers } = await import('./services/telegram-bot');
          await sendTelegramToManagers(
            order.id,
            order.customerName,
            order.customerPhone,
            order.amount,
            order.paymentMethod
          );
          console.log(`✅ Payment notification sent to managers via Telegram for order ${order.id}`);
        } catch (error) {
          console.warn('⚠️ Failed to send payment notification to managers via Telegram:', error);
        }
        
        // Assegna 1 spin token (atomicamente)
        console.log(`🎁 [YooKassa Webhook] Awarding spin token to user ${order.userId}...`);
        const awarded = await storage.awardSpinTokensForOrder(paymentIntent.orderId, order.userId);
        if (awarded) {
          console.log(`✅ [YooKassa Webhook] Assigned 1 spin token to user ${order.userId} for completed order ${order.id}`);
        } else {
          console.log(`⚠️ [YooKassa Webhook] Spin token already awarded for order ${order.id}`);
        }
        
        // Crea scontrino fiscale (receipt) tramite YooKassa API
        try {
          console.log(`🧾 [YooKassa Webhook] Creating fiscal receipt for order ${order.id}...`);
          
          const { createReceiptAfterPayment, createReceipt } = await import('./services/yookassa-payment');
          
          // Recupera eventuali codici маркировка per l'ordine
          const markingLogs = await storage.getMarkingLogsByOrder(order.id);
          const markingCodes = new Map<string, string[]>();
          
          for (const log of markingLogs) {
            const existing = markingCodes.get(log.productId) || [];
            existing.push(log.markingCode);
            markingCodes.set(log.productId, existing);
          }
          
          // Recupera info prodotti per verificare quali richiedono маркировка
          const uniqueProductIds = new Set(order.items.map(item => item.productId));
          const productIds = Array.from(uniqueProductIds);
          const products = await Promise.all(
            productIds.map(id => storage.getProductById(id))
          );
          const productsMap = new Map(products.filter(p => p).map(p => [p!.id, p!]));
          
          // Prepara items con info маркировка
          const orderItemsWithMarking = order.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            unit: item.unit,
            requiresMarking: productsMap.get(item.productId)?.requiresMarking || false,
          }));
          
          // Crea receipt object
          const receiptData = createReceipt(
            orderItemsWithMarking,
            order.customerEmail,
            order.customerPhone,
            markingCodes
          );
          
          // Crea receipt tramite API YooKassa
          const receipt = await createReceiptAfterPayment({
            payment_id: payment.id,
            customer: receiptData.customer,
            items: receiptData.items,
            tax_system_code: receiptData.tax_system_code,
            send: true, // YooKassa invierà lo scontrino al cliente via email/SMS
          });
          
          console.log(`✅ [YooKassa Webhook] Receipt created successfully: ${receipt.id}`);
          
          // Salva dati receipt nel database
          await storage.updateOrderReceipt(order.id, {
            receiptId: receipt.id,
            receiptStatus: receipt.status,
            fiscalData: {
              fiscal_document_number: receipt.fiscal_document_number,
              fiscal_storage_number: receipt.fiscal_storage_number,
              fiscal_attribute: receipt.fiscal_attribute,
              registered_at: receipt.registered_at,
            },
          });
          
          console.log(`✅ [YooKassa Webhook] Receipt data saved to database for order ${order.id}`);
          
          // Se il receipt è stato creato con successo e il cliente ha email, invia notifica
          if (order.customerEmail && receipt.status === 'succeeded') {
            try {
              const { sendEmail } = await import('./services/email');
              await sendEmail({
                to: order.customerEmail,
                subject: `Чек об оплате заказа #${order.id.slice(0, 13)} - Don Giulio Select`,
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                      .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                      .fiscal-info { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; border: 1px solid #ddd; }
                      .info-row { margin-bottom: 8px; }
                      .label { font-weight: bold; color: #666; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>✅ Чек об оплате</h1>
                        <p style="margin: 5px 0;">Заказ #${order.id.slice(0, 13)}</p>
                      </div>
                      <div class="content">
                        <p>Здравствуйте, ${order.customerName}!</p>
                        <p>Ваш платеж успешно обработан. Ниже представлены фискальные данные вашего чека.</p>
                        
                        <div class="fiscal-info">
                          <h3 style="margin-top: 0; color: #4CAF50;">📋 Фискальные данные</h3>
                          ${receipt.fiscal_document_number ? `<div class="info-row"><span class="label">Номер фискального документа:</span> ${receipt.fiscal_document_number}</div>` : ''}
                          ${receipt.fiscal_storage_number ? `<div class="info-row"><span class="label">Номер фискального накопителя:</span> ${receipt.fiscal_storage_number}</div>` : ''}
                          ${receipt.fiscal_attribute ? `<div class="info-row"><span class="label">Фискальный признак:</span> ${receipt.fiscal_attribute}</div>` : ''}
                          ${receipt.registered_at ? `<div class="info-row"><span class="label">Дата регистрации:</span> ${new Date(receipt.registered_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</div>` : ''}
                        </div>
                        
                        <p><strong>Сумма оплаты:</strong> ${order.amount} ₽</p>
                        
                        <p style="color: #666; font-size: 12px; margin-top: 20px;">
                          Вы также можете найти этот чек в разделе "Мои заказы" нашего приложения.
                        </p>
                      </div>
                    </div>
                  </body>
                  </html>
                `,
              });
              console.log(`✅ [YooKassa Webhook] Receipt email sent to customer ${order.customerEmail}`);
            } catch (emailError) {
              console.warn('⚠️ [YooKassa Webhook] Failed to send receipt email to customer:', emailError);
            }
          }
        } catch (receiptError) {
          console.error('❌ [YooKassa Webhook] Failed to create receipt:', receiptError);
          // Non blocchiamo il webhook se la creazione del receipt fallisce
          // Lo scontrino può essere creato manualmente in seguito
        }
      }
      
      console.log(`✅ [YooKassa Webhook] Webhook processed successfully`);
      res.json({ success: true });
    } catch (error) {
      console.error('[YooKassa Webhook] Error processing webhook:', error);
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

  // ==================== ANALYTICS ROUTES (ADMIN ONLY) ====================
  
  // GET /api/admin/analytics/summary - Metriche aggregate nel periodo (ADMIN ONLY)
  app.get("/api/admin/analytics/summary", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const querySchema = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      
      const { startDate, endDate } = querySchema.parse(req.query);
      
      const snapshots = await db
        .select()
        .from(analyticsSnapshots)
        .where(
          and(
            gte(analyticsSnapshots.snapshotDate, startDate),
            lte(analyticsSnapshots.snapshotDate, endDate)
          )
        );
      
      if (snapshots.length === 0) {
        return res.json({
          totalOrders: 0,
          completedOrders: 0,
          paidOrders: 0,
          grossRevenue: '0',
          netRevenue: '0',
          totalDiscounts: '0',
          totalRefunds: '0',
          abandonedCarts: 0,
          cartRemindersSent: 0,
          cartRecoveryOrders: 0,
          conversionRate: 0,
        });
      }
      
      const summary = snapshots.reduce((acc, s) => ({
        totalOrders: acc.totalOrders + (s.totalOrders || 0),
        completedOrders: acc.completedOrders + (s.completedOrders || 0),
        paidOrders: acc.paidOrders + (s.paidOrders || 0),
        grossRevenue: (parseFloat(acc.grossRevenue) + parseFloat(s.grossRevenue || '0')).toFixed(2),
        netRevenue: (parseFloat(acc.netRevenue) + parseFloat(s.netRevenue || '0')).toFixed(2),
        totalDiscounts: (parseFloat(acc.totalDiscounts) + parseFloat(s.totalDiscounts || '0')).toFixed(2),
        totalRefunds: (parseFloat(acc.totalRefunds) + parseFloat(s.totalRefunds || '0')).toFixed(2),
        abandonedCarts: acc.abandonedCarts + (s.abandonedCarts || 0),
        cartRemindersSent: acc.cartRemindersSent + (s.cartRemindersSent || 0),
        cartRecoveryOrders: acc.cartRecoveryOrders + (s.cartRecoveryOrders || 0),
      }), {
        totalOrders: 0,
        completedOrders: 0,
        paidOrders: 0,
        grossRevenue: '0',
        netRevenue: '0',
        totalDiscounts: '0',
        totalRefunds: '0',
        abandonedCarts: 0,
        cartRemindersSent: 0,
        cartRecoveryOrders: 0,
      });
      
      const conversionRate = summary.cartRemindersSent > 0
        ? ((summary.cartRecoveryOrders / summary.cartRemindersSent) * 100).toFixed(2)
        : 0;
      
      res.json({ ...summary, conversionRate });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
      console.error('Error fetching analytics summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/admin/analytics/timeseries - Serie temporale giornaliera (ADMIN ONLY)
  app.get("/api/admin/analytics/timeseries", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const querySchema = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      
      const { startDate, endDate } = querySchema.parse(req.query);
      
      const snapshots = await db
        .select()
        .from(analyticsSnapshots)
        .where(
          and(
            gte(analyticsSnapshots.snapshotDate, startDate),
            lte(analyticsSnapshots.snapshotDate, endDate)
          )
        )
        .orderBy(analyticsSnapshots.snapshotDate);
      
      res.json(snapshots);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
      console.error('Error fetching analytics timeseries:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/admin/analytics/top-products - Top prodotti più venduti (ADMIN ONLY)
  app.get("/api/admin/analytics/top-products", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const querySchema = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
      });
      
      const { startDate, endDate, limit } = querySchema.parse(req.query);
      
      const topProducts = await db
        .select({
          productId: analyticsTopProducts.productId,
          productName: analyticsTopProducts.productName,
          totalUnitsSold: sqlDrizzle<number>`SUM(${analyticsTopProducts.unitsSold})`,
          totalRevenue: sqlDrizzle<string>`SUM(${analyticsTopProducts.revenue})`,
        })
        .from(analyticsTopProducts)
        .where(
          and(
            gte(analyticsTopProducts.snapshotDate, startDate),
            lte(analyticsTopProducts.snapshotDate, endDate)
          )
        )
        .groupBy(analyticsTopProducts.productId, analyticsTopProducts.productName)
        .orderBy(desc(sqlDrizzle`SUM(${analyticsTopProducts.unitsSold})`))
        .limit(limit);
      
      res.json(topProducts);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
      console.error('Error fetching top products:', error);
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
      
      // Controlla se è un errore di slug duplicato
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return res.status(400).json({ 
          error: 'Slug già esistente', 
          message: 'Una categoria con questo slug esiste già. Usa uno slug diverso.' 
        });
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

  // PATCH /api/admin/categories/:id/visibility - Toggle visibilità categoria (MASTER ADMIN ONLY)
  app.patch("/api/admin/categories/:id/visibility", verifyTelegramInitData, requireAdmin, requireMasterAdmin, async (req, res) => {
    try {
      const category = await storage.getCategoryById(req.params.id);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      // Toggle visibilità
      const newVisibility = !category.isVisible;
      const updated = await storage.updateCategory(req.params.id, { isVisible: newVisibility });
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: newVisibility ? 'visibility_enabled' : 'visibility_disabled',
        entityType: 'category',
        entityId: category.id,
        actionData: {
          categoryName: category.name,
          oldVisibility: category.isVisible,
          newVisibility,
        },
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Error toggling category visibility:', error);
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

  // PATCH /api/admin/products/:id/visibility - Toggle visibilità prodotto (MASTER ADMIN ONLY)
  app.patch("/api/admin/products/:id/visibility", verifyTelegramInitData, requireAdmin, requireMasterAdmin, async (req, res) => {
    try {
      // IMPORTANTE: includeHidden=true per trovare anche prodotti nascosti
      const product = await storage.getProductById(req.params.id, true);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Toggle visibilità
      const newVisibility = !product.isVisible;
      const updated = await storage.updateProduct(req.params.id, { isVisible: newVisibility });
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: newVisibility ? 'visibility_enabled' : 'visibility_disabled',
        entityType: 'product',
        entityId: product.id,
        actionData: {
          productName: product.name,
          oldVisibility: product.isVisible,
          newVisibility,
        },
      });
      
      res.json(updated);
    } catch (error) {
      console.error('Error toggling product visibility:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/admin/products/:id/stock - Toggle disponibilità prodotto (ADMIN ONLY - tutti i manager)
  app.patch("/api/admin/products/:id/stock", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const result = await storage.toggleProductStock(req.params.id);
      if (!result) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: result.newStock ? 'stock_enabled' : 'stock_disabled',
        entityType: 'product',
        entityId: result.product.id,
        actionData: {
          productName: result.product.name,
          oldData: { inStock: result.oldStock },
          newData: { inStock: result.newStock },
        },
      });
      
      res.json(result.product);
    } catch (error) {
      console.error('Error toggling product stock:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== ADMIN ORDER MANAGEMENT ====================
  
  // GET /api/admin/orders - Ottieni tutti gli ordini (ADMIN ONLY)
  app.get("/api/admin/orders", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const includeDeleted = req.query.includeDeleted === 'true';
      
      const orders = await storage.getAllOrders({ status, limit });
      
      // Di default, nascondi ordini eliminati (УДАЛЕНО)
      // Master Admin può vederli passando includeDeleted=true
      const filteredOrders = includeDeleted 
        ? orders 
        : orders.filter(order => order.status !== ORDER_STATUSES.DELETED);
      
      res.json(filteredOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // PATCH /api/admin/orders/:id - Aggiorna campi ordine (ADMIN ONLY)
  app.patch("/api/admin/orders/:id", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        deliveryLatitude: z.string().optional(),
        deliveryLongitude: z.string().optional(),
      });
      
      const updateData = schema.parse(req.body);
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const updatedOrder = await storage.updateOrder(orderId, updateData);
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating order:', error);
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
      
      // Se l'ordine passa a "ОПЛАЧЕН", prova ad assegnare 1 spin token (atomicamente)
      if (status === 'ОПЛАЧЕН') {
        const awarded = await storage.awardSpinTokensForOrder(orderId, order.userId);
        if (awarded) {
          console.log(`✅ Assigned 1 spin token to user ${order.userId} for order ${order.id} (admin status change)`);
        }
        
        // Invia notifica pagamento ai manager via Email
        try {
          const { sendOrderPaidNotificationToManagers } = await import('./services/email');
          await sendOrderPaidNotificationToManagers(
            order.id,
            order.customerName,
            order.customerPhone,
            order.amount,
            order.paymentMethod
          );
          console.log(`✅ Payment notification email sent to managers for order ${order.id}`);
        } catch (error) {
          console.warn('⚠️ Failed to send payment notification email to managers:', error);
        }
        
        // Invia notifica pagamento ai manager via Telegram
        try {
          const { sendOrderPaidNotificationToManagers: sendTelegramToManagers } = await import('./services/telegram-bot');
          await sendTelegramToManagers(
            order.id,
            order.customerName,
            order.customerPhone,
            order.amount,
            order.paymentMethod
          );
          console.log(`✅ Payment notification sent to managers via Telegram for order ${order.id}`);
        } catch (error) {
          console.warn('⚠️ Failed to send payment notification to managers via Telegram:', error);
        }
      }
      
      // Se lo stato è СОБРАН, genera e invia link pagamento automaticamente
      // SOLO per ordini con pagamento online (non per pagamento in contanti)
      if (status === 'СОБРАН' && order.paymentMethod !== 'cash_on_delivery') {
        console.log(`🔄 [Status Change] Order ${orderId} status changed to СОБРАН - creating payment link...`);
        console.log(`   Payment method: ${order.paymentMethod}`);
        
        try {
          console.log(`🔍 [Step 1/8] Checking for existing payment intent...`);
          // Verifica se esiste già un payment intent per questo ordine
          let paymentIntent = await storage.getPaymentIntentByOrderId(orderId);
          let confirmationUrl: string;
          
          if (!paymentIntent || paymentIntent.status !== 'pending') {
            console.log(`📝 [Step 2/8] No pending payment intent found, creating new one...`);
            // Crea nuovo payment con YooKassa solo se non esiste o se è scaduto/completato
            const { createYooKassaPayment, formatYooKassaAmount, createReceipt } = await import('./services/yookassa-payment');
            
            const baseUrl = process.env.REPLIT_DOMAINS 
              ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
              : (process.env.APP_URL || 'http://localhost:5000');
            
            const returnUrl = `${baseUrl}/payment-return`;
            console.log(`🌐 Return URL configured: ${returnUrl}`);
            
            console.log(`🔍 [Step 3/8] Fetching all products...`);
            // Recupera informazioni sui prodotti per маркировка
            const allProducts = await storage.getAllProducts();
            const productsMap = new Map(allProducts.map(p => [p.id, p]));
            console.log(`   Found ${allProducts.length} products in database`);
            
            console.log(`🔍 [Step 4/8] Fetching marking logs for order ${orderId}...`);
            // Recupera codici маркировка per questo ordine
            const markingLogs = await storage.getMarkingLogsByOrder(orderId);
            console.log(`   Found ${markingLogs.length} marking codes`);
            const markingCodesMap = new Map<string, string[]>();
            
            // Organizza codici per productId
            console.log(`🔍 [Step 5/8] Organizing marking codes by product...`);
            for (const log of markingLogs) {
              const codes = markingCodesMap.get(log.productId) || [];
              codes.push(log.markingCode);
              markingCodesMap.set(log.productId, codes);
            }
            
            console.log(`🔍 [Step 6/8] Calculating discount and pricing...`);
            // Calcola totale originale dagli items
            const itemsSubtotal = order.items.reduce((sum, item) => {
              return sum + (parseFloat(item.price) * item.quantity);
            }, 0);
            
            // Calcola sconto applicato come differenza tra subtotal e amount
            const totalToPay = parseFloat(order.amount);
            const calculatedDiscount = itemsSubtotal - totalToPay;
            
            console.log(`💰 Pricing breakdown:`);
            console.log(`   Items subtotal: ${itemsSubtotal.toFixed(2)}₽`);
            console.log(`   Total to pay: ${totalToPay.toFixed(2)}₽`);
            console.log(`   Discount (calculated): ${calculatedDiscount.toFixed(2)}₽`);
            
            // Applica sconto proporzionalmente agli items per la ricevuta fiscale
            let enrichedOrderItems;
            
            if (calculatedDiscount > 0.01) {
              // C'è uno sconto - distribuiscilo proporzionalmente
              console.log(`🎁 Applying ${calculatedDiscount.toFixed(2)}₽ discount proportionally to items...`);
              const discountRatio = 1 - (calculatedDiscount / itemsSubtotal);
              
              enrichedOrderItems = order.items.map(item => {
                const product = productsMap.get(item.productId);
                const originalPrice = parseFloat(item.price);
                const discountedPrice = originalPrice * discountRatio;
                
                console.log(`   ${item.productName}: ${originalPrice.toFixed(2)}₽ → ${discountedPrice.toFixed(2)}₽`);
                
                return {
                  ...item,
                  price: discountedPrice.toFixed(2), // Usa prezzo scontato nella ricevuta
                  requiresMarking: product?.requiresMarking || false,
                };
              });
            } else {
              // Nessuno sconto
              enrichedOrderItems = order.items.map(item => {
                const product = productsMap.get(item.productId);
                return {
                  ...item,
                  requiresMarking: product?.requiresMarking || false,
                };
              });
            }
            console.log(`   Enriched ${enrichedOrderItems.length} order items`);
            
            console.log(`🧾 [Step 7/8] Creating fiscal receipt (54-ФЗ)...`);
            console.log(`   Customer email: ${order.customerEmail || 'NOT PROVIDED'}`);
            console.log(`   Customer phone: ${order.customerPhone}`);
            // Crea receipt per scontrino fiscale (54-ФЗ) con маркировка
            const receipt = createReceipt(
              enrichedOrderItems,
              order.customerEmail,
              order.customerPhone,
              markingCodesMap, // Codici маркировка
              1, // tax_system_code: 1 = УСН доход (sistema fiscale semplificato)
              1  // vat_code: 1 = без НДС (senza IVA per УСН)
            );
            console.log(`   Receipt created with ${receipt.items.length} items`);
            
            console.log(`💳 [Step 8/8] Creating YooKassa payment...`);
            console.log(`   Amount: ${totalToPay.toFixed(2)} RUB`);
            const yookassaPayment = await createYooKassaPayment({
              amount: {
                value: formatYooKassaAmount(totalToPay), // Usa totale reale da pagare
                currency: 'RUB',
              },
              description: `Заказ №${orderId.slice(0, 8)}`,
              return_url: returnUrl,
              metadata: {
                orderId,
                userId: order.userId,
              },
              capture: true,
              receipt, // Dati per scontrino fiscale
            });
            
            confirmationUrl = yookassaPayment.confirmation?.confirmation_url || '';
            
            // Salva payment intent nel database
            paymentIntent = await storage.createPaymentIntent({
              orderId,
              provider: 'YooKassa',
              status: 'pending',
              amount: order.amount,
              redirectUrl: confirmationUrl,
              raw: {
                yookassaPaymentId: yookassaPayment.id,
                yookassaStatus: yookassaPayment.status,
                createdAt: yookassaPayment.created_at,
              },
            });
          } else {
            // Riusa payment intent esistente
            confirmationUrl = paymentIntent.redirectUrl || '';
          }
          
          // Invia link pagamento via Telegram (se configurato)
          try {
            const { sendPaymentLink } = await import('./services/telegram-bot');
            const telegramSent = await sendPaymentLink(
              order.userId,
              orderId,
              order.amount,
              confirmationUrl
            );
            if (!telegramSent) {
              console.warn('⚠️ Telegram bot not configured - payment link not sent via Telegram');
            } else {
              console.log('✅ Payment link sent via Telegram');
            }
          } catch (error) {
            console.warn('⚠️ Failed to send payment link via Telegram:', error);
          }
          
          // Invia link pagamento via email (se disponibile)
          if (order.customerEmail) {
            try {
              const { sendPaymentLinkEmail } = await import('./services/email');
              await sendPaymentLinkEmail(
                order.customerEmail,
                orderId,
                order.customerName,
                order.amount,
                confirmationUrl
              );
              console.log('✅ Payment link sent via email');
            } catch (error) {
              console.warn('⚠️ Failed to send payment link via email:', error);
            }
          }
          
          // Invia link pagamento via WhatsApp
          try {
            const { sendPaymentLinkWhatsApp } = await import('./services/whatsapp');
            const whatsappSent = await sendPaymentLinkWhatsApp(
              order.customerPhone,
              orderId,
              order.customerName,
              order.amount,
              confirmationUrl
            );
            if (whatsappSent) {
              console.log('✅ Payment link sent via WhatsApp');
            }
          } catch (error) {
            console.warn('⚠️ Failed to send payment link via WhatsApp:', error);
          }
          
          // Aggiorna ordine con info pagamento e timestamp invio link
          await storage.updateOrder(orderId, {
            status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
            paymentId: paymentIntent.id,
            paymentLinkSentAt: new Date(),
          });
          
          console.log(`✅ Payment link created for order ${orderId}`);
          console.log(`   Payment URL: ${confirmationUrl}`);
          
          return res.json({
            ...updatedOrder,
            status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
            paymentLinkSent: true,
            paymentUrl: confirmationUrl,
          });
        } catch (error) {
          console.error('❌ Error creating payment link:', error);
          console.error('   Error details:', error instanceof Error ? error.message : 'Unknown error');
          console.error('   Stack trace:', error instanceof Error ? error.stack : '');
          
          // NON fallire completamente - lo stato СОБРАН è già salvato
          // Restituisci successo con warning che il link pagamento va generato manualmente
          return res.json({
            ...updatedOrder,
            status: 'СОБРАН', // Rimane in СОБРАН, non passa a ОТПРАВЛЕНА ССЫЛКА
            paymentLinkSent: false,
            warning: 'Status updated successfully, but payment link generation failed. You can regenerate it manually.',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      // Invia notifica Telegram al cliente per il cambio di stato
      // (tranne quando СОБРАН genera automaticamente link pagamento)
      const shouldSendStatusNotification = !(status === 'СОБРАН' && order.paymentMethod !== 'cash_on_delivery');
      
      if (shouldSendStatusNotification) {
        try {
          const { sendOrderStatusNotification } = await import('./services/telegram-bot');
          const telegramSent = await sendOrderStatusNotification(
            order.userId,
            orderId,
            status,
            order.customerName
          );
          if (telegramSent) {
            console.log(`✅ Status notification sent to user ${order.userId} for order ${orderId}: ${status}`);
          } else {
            console.warn('⚠️ Telegram bot not configured - status notification not sent');
          }
        } catch (error) {
          console.warn('⚠️ Failed to send status notification via Telegram:', error);
        }
        
        // Invia anche notifica WhatsApp
        try {
          const { sendOrderStatusUpdateWhatsApp } = await import('./services/whatsapp');
          const whatsappSent = await sendOrderStatusUpdateWhatsApp(
            order.customerPhone,
            orderId,
            order.customerName,
            status
          );
          if (whatsappSent) {
            console.log(`✅ Status notification sent via WhatsApp to ${order.customerPhone} for order ${orderId}: ${status}`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to send status notification via WhatsApp:', error);
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
  
  // POST /api/admin/orders/:id/generate-payment-link - Genera e invia link pagamento manualmente (ADMIN ONLY)
  app.post("/api/admin/orders/:id/generate-payment-link", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const userId = req.userId || 'unknown';
      
      console.log(`\n🔄 [Order ${orderId}] [User ${userId}] Manual payment link generation started`);
      
      // Step 0: Check YooKassa credentials
      const { checkYooKassaCredentials } = await import('./services/yookassa-payment');
      const credCheck = checkYooKassaCredentials();
      if (!credCheck.ok) {
        console.error(`❌ [Order ${orderId}] Step 0/8 FAILED: ${credCheck.error}`);
        return res.status(500).json({ 
          error: 'YooKassa not configured', 
          details: credCheck.error 
        });
      }
      console.log(`✅ [Order ${orderId}] Step 0/8: YooKassa credentials verified`);
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        console.error(`❌ [Order ${orderId}] Order not found in database`);
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che l'ordine non sia già pagato
      if (order.status === 'ОПЛАЧЕН' || order.status === 'ПОЛУЧЕН') {
        console.warn(`⚠️ [Order ${orderId}] Cannot generate link - order already paid/completed`);
        return res.status(400).json({ error: 'Order is already paid or completed' });
      }
      
      // Verifica che non sia pagamento in contanti
      if (order.paymentMethod === 'cash_on_delivery') {
        console.warn(`⚠️ [Order ${orderId}] Cannot generate link - cash on delivery order`);
        return res.status(400).json({ error: 'Cannot generate payment link for cash on delivery orders' });
      }
      
      console.log(`📋 [Order ${orderId}] Order details: ${order.amount}₽, method: ${order.paymentMethod}, status: ${order.status}`);
      
      // Verifica se esiste già un payment intent per questo ordine
      console.log(`🔍 [Order ${orderId}] Step 1/8: Checking for existing payment intent...`);
      let paymentIntent = await storage.getPaymentIntentByOrderId(orderId);
      let confirmationUrl: string;
      
      if (!paymentIntent || paymentIntent.status !== 'pending') {
        console.log(`📝 [Order ${orderId}] Step 2/8: Creating new YooKassa payment...`);
        // Crea nuovo payment con YooKassa
        const { createYooKassaPayment, formatYooKassaAmount, createReceipt } = await import('./services/yookassa-payment');
        
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
          : (process.env.APP_URL || 'http://localhost:5000');
        
        const returnUrl = `${baseUrl}/payment-return`;
        console.log(`🔗 [Order ${orderId}] Return URL: ${returnUrl}`);
        
        // Recupera informazioni sui prodotti per маркировка
        console.log(`📦 [Order ${orderId}] Step 3/8: Loading products and marking codes...`);
        const allProducts = await storage.getAllProducts();
        const productsMap = new Map(allProducts.map(p => [p.id, p]));
        
        // Recupera codici маркировка per questo ordine
        const markingLogs = await storage.getMarkingLogsByOrder(orderId);
        const markingCodesMap = new Map<string, string[]>();
        
        // Organizza codici per productId
        for (const log of markingLogs) {
          const codes = markingCodesMap.get(log.productId) || [];
          codes.push(log.markingCode);
          markingCodesMap.set(log.productId, codes);
        }
        console.log(`✅ [Order ${orderId}] Loaded ${allProducts.length} products, ${markingLogs.length} marking codes`);
        
        // Calcola totale originale dagli items
        const itemsSubtotal = order.items.reduce((sum, item) => {
          return sum + (parseFloat(item.price) * item.quantity);
        }, 0);
        
        // Calcola sconto applicato come differenza tra subtotal e amount
        // (include bonus, coupon, sconti admin, etc.)
        const totalToPay = parseFloat(order.amount);
        const calculatedDiscount = itemsSubtotal - totalToPay;
        
        console.log(`💰 [Order ${orderId}] Pricing breakdown:`);
        console.log(`   Items subtotal: ${itemsSubtotal.toFixed(2)}₽`);
        console.log(`   Total to pay: ${totalToPay.toFixed(2)}₽`);
        console.log(`   Discount (calculated): ${calculatedDiscount.toFixed(2)}₽`);
        
        // Applica sconto proporzionalmente agli items per la ricevuta fiscale
        let enrichedOrderItems;
        
        if (calculatedDiscount > 0.01) {
          // C'è uno sconto - distribuiscilo proporzionalmente
          console.log(`🎁 [Order ${orderId}] Applying ${calculatedDiscount.toFixed(2)}₽ discount proportionally to items...`);
          const discountRatio = 1 - (calculatedDiscount / itemsSubtotal);
          
          enrichedOrderItems = order.items.map(item => {
            const product = productsMap.get(item.productId);
            const originalPrice = parseFloat(item.price);
            const discountedPrice = originalPrice * discountRatio;
            
            console.log(`   ${item.productName}: ${originalPrice.toFixed(2)}₽ → ${discountedPrice.toFixed(2)}₽`);
            
            return {
              ...item,
              price: discountedPrice.toFixed(2), // Usa prezzo scontato nella ricevuta
              requiresMarking: product?.requiresMarking || false,
            };
          });
        } else {
          // Nessuno sconto
          enrichedOrderItems = order.items.map(item => {
            const product = productsMap.get(item.productId);
            return {
              ...item,
              requiresMarking: product?.requiresMarking || false,
            };
          });
        }
        
        // Crea receipt per scontrino fiscale (54-ФЗ) con маркировка
        console.log(`🧾 [Order ${orderId}] Step 4/8: Creating fiscal receipt with ${enrichedOrderItems.length} items...`);
        const receipt = createReceipt(
          enrichedOrderItems,
          order.customerEmail,
          order.customerPhone,
          markingCodesMap,
          1, // tax_system_code: УСН доход
          1  // vat_code: без НДС
        );
        console.log(`✅ [Order ${orderId}] Receipt created with ${receipt.items.length} line items`);
        
        console.log(`💳 [Order ${orderId}] Step 5/8: Calling YooKassa API...`);
        try {
          const yookassaPayment = await createYooKassaPayment({
            amount: {
              value: formatYooKassaAmount(totalToPay), // Usa order.amount (totale REALE da pagare)
              currency: 'RUB',
            },
            description: `Заказ №${orderId.slice(0, 8)}`,
            return_url: returnUrl,
            metadata: {
              orderId,
              userId: order.userId,
            },
            capture: true,
            receipt,
          });
          
          confirmationUrl = yookassaPayment.confirmation?.confirmation_url || '';
          console.log(`✅ [Order ${orderId}] YooKassa payment created: ${yookassaPayment.id}`);
          console.log(`🔗 [Order ${orderId}] Confirmation URL: ${confirmationUrl}`);
          
          // Salva payment intent nel database
          console.log(`💾 [Order ${orderId}] Step 6/8: Saving payment intent to database...`);
          paymentIntent = await storage.createPaymentIntent({
            orderId,
            provider: 'YooKassa',
            status: 'pending',
            amount: order.amount,
            redirectUrl: confirmationUrl,
            raw: {
              yookassaPaymentId: yookassaPayment.id,
              yookassaStatus: yookassaPayment.status,
              createdAt: yookassaPayment.created_at,
            },
          });
          console.log(`✅ [Order ${orderId}] Payment intent saved to database`);
        } catch (error) {
          console.error(`❌ [Order ${orderId}] Step 5/8 FAILED: YooKassa API call failed`);
          console.error(`   Error:`, error instanceof Error ? error.message : error);
          throw error;
        }
      } else {
        console.log(`♻️ [Order ${orderId}] Step 2/8: Reusing existing payment intent (${paymentIntent.id})`);
        confirmationUrl = paymentIntent.redirectUrl || '';
      }
      
      // Invia link pagamento via Telegram
      console.log(`📱 [Order ${orderId}] Step 7/8: Sending notifications...`);
      let notificationsSent = { telegram: false, email: false, whatsapp: false };
      
      try {
        const { sendPaymentLink } = await import('./services/telegram-bot');
        const telegramSent = await sendPaymentLink(
          order.userId,
          orderId,
          order.amount,
          confirmationUrl
        );
        if (telegramSent) {
          console.log(`✅ [Order ${orderId}] Payment link sent via Telegram`);
          notificationsSent.telegram = true;
        }
      } catch (error) {
        console.warn(`⚠️ [Order ${orderId}] Failed to send payment link via Telegram:`, error instanceof Error ? error.message : error);
      }
      
      // Invia link pagamento via email
      if (order.customerEmail) {
        try {
          const { sendPaymentLinkEmail } = await import('./services/email');
          await sendPaymentLinkEmail(
            order.customerEmail,
            orderId,
            order.customerName,
            order.amount,
            confirmationUrl
          );
          console.log(`✅ [Order ${orderId}] Payment link sent via email`);
          notificationsSent.email = true;
        } catch (error) {
          console.warn(`⚠️ [Order ${orderId}] Failed to send payment link via email:`, error instanceof Error ? error.message : error);
        }
      }
      
      // Invia link pagamento via WhatsApp
      try {
        const { sendPaymentLinkWhatsApp } = await import('./services/whatsapp');
        const whatsappSent = await sendPaymentLinkWhatsApp(
          order.customerPhone,
          orderId,
          order.customerName,
          order.amount,
          confirmationUrl
        );
        if (whatsappSent) {
          console.log(`✅ [Order ${orderId}] Payment link sent via WhatsApp`);
          notificationsSent.whatsapp = true;
        }
      } catch (error) {
        console.warn(`⚠️ [Order ${orderId}] Failed to send payment link via WhatsApp:`, error instanceof Error ? error.message : error);
      }
      
      console.log(`📊 [Order ${orderId}] Notifications sent: Telegram=${notificationsSent.telegram}, Email=${notificationsSent.email}, WhatsApp=${notificationsSent.whatsapp}`);
      
      // Aggiorna ordine
      console.log(`💾 [Order ${orderId}] Step 8/8: Updating order status...`);
      const updatedOrder = await storage.updateOrder(orderId, {
        status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
        paymentId: paymentIntent.id,
        paymentLinkSentAt: new Date(),
      });
      
      console.log(`✅ [Order ${orderId}] Payment link generation completed successfully!\n`);
      
      res.json({
        ...updatedOrder,
        paymentUrl: confirmationUrl,
        paymentLinkSent: true,
      });
    } catch (error) {
      console.error(`❌ [Order ${req.params.id}] Payment link generation failed:`, error);
      console.error(`   Error details:`, error instanceof Error ? error.message : 'Unknown error');
      console.error(`   Stack:`, error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        error: 'Failed to generate payment link',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  
  // POST /api/admin/orders/:id/resend-notifications - Re-invia notifiche e scontrino per ordine pagato (ADMIN ONLY - MASTER ADMIN)
  app.post("/api/admin/orders/:id/resend-notifications", verifyTelegramInitData, requireMasterAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che l'ordine sia pagato
      if (order.status !== 'ОПЛАЧЕН') {
        return res.status(400).json({ error: 'Order must be paid to resend notifications' });
      }
      
      console.log(`🔄 [Resend Notifications] Processing order ${orderId}...`);
      
      const results: any = {
        emailToManagers: { sent: false, error: null },
        telegramToManagers: { sent: false, error: null },
        receipt: { created: false, sent: false, error: null },
        emailToCustomer: { sent: false, error: null },
      };
      
      // 1. Invia notifica pagamento ai manager via Email
      try {
        const { sendOrderPaidNotificationToManagers } = await import('./services/email');
        await sendOrderPaidNotificationToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.amount,
          order.paymentMethod
        );
        results.emailToManagers.sent = true;
        console.log(`✅ Payment notification email sent to managers for order ${order.id}`);
      } catch (error) {
        results.emailToManagers.error = String(error);
        console.warn('⚠️ Failed to send payment notification email to managers:', error);
      }
      
      // 2. Invia notifica pagamento ai manager via Telegram
      try {
        const { sendOrderPaidNotificationToManagers: sendTelegramToManagers } = await import('./services/telegram-bot');
        await sendTelegramToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.amount,
          order.paymentMethod
        );
        results.telegramToManagers.sent = true;
        console.log(`✅ Payment notification sent to managers via Telegram for order ${order.id}`);
      } catch (error) {
        results.telegramToManagers.error = String(error);
        console.warn('⚠️ Failed to send payment notification to managers via Telegram:', error);
      }
      
      // 3. Crea/aggiorna scontrino fiscale e invia email al cliente
      try {
        console.log(`🧾 [Resend Notifications] Creating/updating fiscal receipt for order ${order.id}...`);
        
        const { createReceiptAfterPayment, createReceipt, getYooKassaReceipt } = await import('./services/yookassa-payment');
        
        // Recupera payment intent per ottenere payment ID
        const paymentIntent = await storage.getPaymentIntentByOrderId(order.id);
        if (!paymentIntent) {
          throw new Error('Payment intent not found for order');
        }
        
        const yookassaPaymentId = (paymentIntent.raw as any)?.yookassaPaymentId;
        if (!yookassaPaymentId) {
          throw new Error('YooKassa payment ID not found in payment intent');
        }
        
        let receipt;
        
        // Verifica se esiste già un receipt
        if (order.receiptId) {
          console.log(`📋 Receipt already exists (${order.receiptId}), fetching current status...`);
          receipt = await getYooKassaReceipt(order.receiptId);
          results.receipt.created = false; // Già esistente
        } else {
          // Crea nuovo receipt
          // Recupera eventuali codici маркировка per l'ordine
          const markingLogs = await storage.getMarkingLogsByOrder(order.id);
          const markingCodes = new Map<string, string[]>();
          
          for (const log of markingLogs) {
            const existing = markingCodes.get(log.productId) || [];
            existing.push(log.markingCode);
            markingCodes.set(log.productId, existing);
          }
          
          // Recupera info prodotti per verificare quali richiedono маркировка
          const uniqueProductIds = new Set(order.items.map(item => item.productId));
          const productIds = Array.from(uniqueProductIds);
          const products = await Promise.all(
            productIds.map(id => storage.getProductById(id))
          );
          const productsMap = new Map(products.filter(p => p).map(p => [p!.id, p!]));
          
          // Prepara items con info маркировка
          const orderItemsWithMarking = order.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            unit: item.unit,
            requiresMarking: productsMap.get(item.productId)?.requiresMarking || false,
          }));
          
          // Crea receipt object
          const receiptData = createReceipt(
            orderItemsWithMarking,
            order.customerEmail,
            order.customerPhone,
            markingCodes
          );
          
          // Crea receipt tramite API YooKassa
          receipt = await createReceiptAfterPayment({
            payment_id: yookassaPaymentId,
            customer: receiptData.customer,
            items: receiptData.items,
            tax_system_code: receiptData.tax_system_code,
            send: true,
          });
          
          results.receipt.created = true;
          console.log(`✅ Receipt created successfully: ${receipt.id}`);
        }
        
        // Salva/aggiorna dati receipt nel database
        await storage.updateOrderReceipt(order.id, {
          receiptId: receipt.id,
          receiptStatus: receipt.status,
          fiscalData: {
            fiscal_document_number: receipt.fiscal_document_number,
            fiscal_storage_number: receipt.fiscal_storage_number,
            fiscal_attribute: receipt.fiscal_attribute,
            registered_at: receipt.registered_at,
          },
        });
        
        console.log(`✅ Receipt data saved to database for order ${order.id}`);
        
        // Invia email al cliente con i dati fiscali
        if (order.customerEmail && receipt.status === 'succeeded') {
          try {
            const { sendEmail } = await import('./services/email');
            await sendEmail({
              to: order.customerEmail,
              subject: `Чек об оплате заказа #${order.id.slice(0, 13)} - Don Giulio Select`,
              html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                    .fiscal-info { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; border: 1px solid #ddd; }
                    .info-row { margin-bottom: 8px; }
                    .label { font-weight: bold; color: #666; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>✅ Чек об оплате</h1>
                      <p style="margin: 5px 0;">Заказ #${order.id.slice(0, 13)}</p>
                    </div>
                    <div class="content">
                      <p>Здравствуйте, ${order.customerName}!</p>
                      <p>Ваш платеж успешно обработан. Ниже представлены фискальные данные вашего чека.</p>
                      
                      <div class="fiscal-info">
                        <h3 style="margin-top: 0; color: #4CAF50;">📋 Фискальные данные</h3>
                        ${receipt.fiscal_document_number ? `<div class="info-row"><span class="label">Номер фискального документа:</span> ${receipt.fiscal_document_number}</div>` : ''}
                        ${receipt.fiscal_storage_number ? `<div class="info-row"><span class="label">Номер фискального накопителя:</span> ${receipt.fiscal_storage_number}</div>` : ''}
                        ${receipt.fiscal_attribute ? `<div class="info-row"><span class="label">Фискальный признак:</span> ${receipt.fiscal_attribute}</div>` : ''}
                        ${receipt.registered_at ? `<div class="info-row"><span class="label">Дата регистрации:</span> ${new Date(receipt.registered_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</div>` : ''}
                      </div>
                      
                      <p><strong>Сумма оплаты:</strong> ${order.amount} ₽</p>
                      
                      <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Вы также можете найти этот чек в разделе "Мои заказы" нашего приложения.
                      </p>
                    </div>
                  </div>
                </body>
                </html>
              `,
            });
            results.receipt.sent = true;
            results.emailToCustomer.sent = true;
            console.log(`✅ Receipt email sent to customer ${order.customerEmail}`);
          } catch (emailError) {
            results.emailToCustomer.error = String(emailError);
            console.warn('⚠️ Failed to send receipt email to customer:', emailError);
          }
        } else if (!order.customerEmail) {
          results.emailToCustomer.error = 'No customer email provided';
        } else if (receipt.status !== 'succeeded') {
          results.emailToCustomer.error = `Receipt status is ${receipt.status}, not succeeded`;
        }
      } catch (receiptError) {
        results.receipt.error = String(receiptError);
        console.error('❌ Failed to create/update receipt:', receiptError);
      }
      
      res.json({
        success: true,
        message: 'Notifications resend process completed',
        results,
      });
    } catch (error) {
      console.error('[Resend Notifications] Error:', error);
      res.status(500).json({ error: 'Internal server error', details: String(error) });
    }
  });
  
  // POST /api/admin/orders/:id/refund - Richiedi rimborso per ordine pagato (ADMIN ONLY)
  app.post("/api/admin/orders/:id/refund", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const adminUserId = req.userId!;
      
      // Valida body
      const schema = z.object({
        reason: z.string().trim().min(10, 'Refund reason must be at least 10 characters'),
      });
      
      const { reason } = schema.parse(req.body);
      
      // 1. Carica ordine
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      console.log(`🔄 [Refund] Processing refund request for order ${orderId}...`);
      console.log(`   Admin: ${adminUserId}`);
      console.log(`   Reason: ${reason}`);
      
      // 2. Valida che sia pagamento YooKassa
      if (order.paymentMethod !== 'yookassa') {
        return res.status(400).json({ 
          error: 'Only YooKassa payments can be refunded',
          code: 'invalid_payment_method'
        });
      }
      
      // 3. Valida che l'ordine sia pagato
      const isPaid = PAID_ORDER_STATUSES.includes(order.status as any);
      if (!isPaid) {
        return res.status(409).json({ 
          error: 'Order must be paid to request refund',
          code: 'order_not_paid',
          currentStatus: order.status
        });
      }
      
      // 4. Valida che non sia già stato rimborsato
      if (order.refundStatus === 'pending' || order.refundStatus === 'succeeded') {
        return res.status(409).json({ 
          error: 'Order has already been refunded or refund is pending',
          code: 'already_refunded',
          refundStatus: order.refundStatus,
          refundId: order.refundId
        });
      }
      
      // 5. Ottieni payment ID YooKassa
      if (!order.paymentId) {
        return res.status(400).json({ 
          error: 'Payment ID not found for this order',
          code: 'payment_id_missing'
        });
      }
      
      console.log(`💳 [Refund] YooKassa Payment ID: ${order.paymentId}`);
      console.log(`💰 [Refund] Refund amount: ${order.amount} RUB`);
      
      // 6. Verifica status del pagamento su YooKassa
      const { getYooKassaPayment, createYooKassaRefund, formatYooKassaAmount } = await import('./services/yookassa-payment');
      
      let payment;
      try {
        console.log(`🔍 [Refund] Fetching payment status from YooKassa...`);
        payment = await getYooKassaPayment(order.paymentId);
        console.log(`📊 [Refund] Payment status: ${payment.status}`);
      } catch (fetchError: any) {
        console.error(`❌ [Refund] Failed to fetch payment from YooKassa:`, fetchError);
        return res.status(502).json({ 
          error: 'Failed to verify payment status with YooKassa',
          code: 'payment_fetch_failed',
          details: fetchError.message || String(fetchError)
        });
      }
      
      // 7. Valida che il pagamento sia in stato corretto per il refund
      if (payment.status === 'waiting_for_capture') {
        return res.status(409).json({ 
          error: 'Payment is waiting for capture. Use Cancel API instead of Refund.',
          code: 'payment_waiting_capture',
          paymentStatus: payment.status,
          hint: 'This payment was authorized but not captured yet. You should cancel it instead of refunding it.'
        });
      }
      
      if (payment.status === 'canceled') {
        return res.status(409).json({ 
          error: 'Payment has already been canceled',
          code: 'payment_already_canceled',
          paymentStatus: payment.status
        });
      }
      
      if (payment.status === 'pending') {
        return res.status(409).json({ 
          error: 'Payment is still pending. Wait for payment to complete before refunding.',
          code: 'payment_pending',
          paymentStatus: payment.status
        });
      }
      
      if (payment.status !== 'succeeded') {
        return res.status(409).json({ 
          error: `Payment status is '${payment.status}'. Only succeeded payments can be refunded.`,
          code: 'invalid_payment_status',
          paymentStatus: payment.status
        });
      }
      
      // 8. Verifica che il pagamento sia refundable
      if (!payment.refundable) {
        return res.status(409).json({ 
          error: 'Payment is not refundable according to YooKassa',
          code: 'payment_not_refundable',
          paymentStatus: payment.status,
          hint: 'This payment cannot be refunded (e.g., too old or payment method does not support refunds)'
        });
      }
      
      console.log(`✅ [Refund] Payment is refundable`);
      
      // 9. Chiama API YooKassa per creare rimborso
      
      // Usa idempotency key DETERMINISTICO basato su orderId per evitare duplicati
      // Se l'admin riprova la richiesta, YooKassa restituirà lo stesso rimborso
      const idempotencyKey = `refund-${orderId}`;
      
      let refund;
      try {
        refund = await createYooKassaRefund({
          payment_id: order.paymentId,
          amount: {
            value: formatYooKassaAmount(parseFloat(order.amount)),
            currency: 'RUB',
          },
          description: `Refund for order ${orderId.slice(0, 8)}: ${reason}`,
        }, idempotencyKey);
        
        console.log(`✅ [Refund] YooKassa refund created: ${refund.id}`);
        console.log(`   Status: ${refund.status}`);
      } catch (yookassaError: any) {
        console.error(`❌ [Refund] YooKassa API error:`, yookassaError);
        
        // Parse YooKassa error
        const errorMessage = yookassaError.message || String(yookassaError);
        
        // Map YooKassa errors to HTTP status codes
        if (errorMessage.includes('403')) {
          return res.status(403).json({ 
            error: 'Refunds not enabled for this YooKassa merchant account',
            code: 'refunds_forbidden',
            details: errorMessage,
            hint: 'Contact YooKassa support to enable refunds for your merchant account, or check if there is a refund limit set in your YooKassa dashboard settings.'
          });
        } else if (errorMessage.includes('404')) {
          return res.status(502).json({ 
            error: 'Payment not found in YooKassa',
            code: 'payment_not_found',
            details: errorMessage
          });
        } else if (errorMessage.includes('422')) {
          return res.status(409).json({ 
            error: 'Invalid refund amount',
            code: 'invalid_amount',
            details: errorMessage
          });
        } else if (errorMessage.includes('400')) {
          return res.status(409).json({ 
            error: 'Payment cannot be refunded (too old or invalid status)',
            code: 'payment_not_refundable',
            details: errorMessage
          });
        } else {
          return res.status(503).json({ 
            error: 'Payment gateway unavailable',
            code: 'gateway_error',
            details: errorMessage
          });
        }
      }
      
      // 7. Aggiorna ordine nel database
      // Imposta status a ВОЗВРАТ solo se il rimborso è già succeeded
      // Se è pending, mantieni lo status corrente e usa refundStatus per tracciare
      const updateData: any = {
        refundId: refund.id,
        refundStatus: refund.status,
        refundReason: reason,
        refundedAmount: order.amount, // Full refund
        refundedAt: refund.status === 'succeeded' ? new Date() : null,
      };
      
      // Solo se il rimborso YooKassa è già succeeded, cambia lo stato a ВОЗВРАТ
      if (refund.status === 'succeeded') {
        updateData.status = ORDER_STATUSES.REFUNDED;
      }
      
      const updatedOrder = await storage.updateOrder(orderId, updateData);
      
      console.log(`💾 [Refund] Order updated with refund data`);
      console.log(`✅ [Refund] Refund request completed successfully!`);
      
      res.json({
        success: true,
        refund: {
          id: refund.id,
          status: refund.status,
          amount: refund.amount.value,
          currency: refund.amount.currency,
          reason,
          createdAt: refund.created_at,
        },
        order: updatedOrder,
      });
    } catch (error) {
      console.error(`❌ [Refund] Error processing refund for order ${req.params.id}:`, error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation error', 
          details: error.errors 
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to process refund',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
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
        deliveryPostalCode: z.string().optional(),
        dadataFiasId: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        saveToCustomer: z.boolean().optional(),
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
      
      // Se richiesto, salva il nuovo indirizzo nella lista indirizzi del cliente
      if (data.saveToCustomer && order.userId) {
        // Verifica se l'indirizzo esiste già
        const existingAddresses = await storage.getUserAddresses(order.userId);
        const addressExists = existingAddresses.some(addr => addr.fullAddress === data.deliveryAddress);
        
        if (!addressExists) {
          // Salva il nuovo indirizzo con etichetta automatica
          await storage.createUserAddress({
            userId: order.userId,
            label: 'Inserito dall\'operatore',
            fullAddress: data.deliveryAddress,
            postalCode: data.deliveryPostalCode || null,
            dadataFiasId: data.dadataFiasId || null,
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            phone: null,
            isDefault: false,
          });
        }
      }
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        deliveryAddress: data.deliveryAddress,
        deliveryPostalCode: data.deliveryPostalCode || null,
        deliveryLatitude: data.latitude || null,
        deliveryLongitude: data.longitude || null,
        dadataFiasId: data.dadataFiasId || null,
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId,
        changeType: 'address_changed',
        changeData: {
          oldAddress,
          newAddress: data.deliveryAddress,
          savedToCustomer: data.saveToCustomer || false,
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

  // PATCH /api/admin/orders/:id/shipping-settings - Aggiorna impostazioni spedizione (ADMIN ONLY)
  app.patch("/api/admin/orders/:id/shipping-settings", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const schema = z.object({
        customerPaysShipping: z.boolean(),
        shippingPaymentMethod: z.enum(['card', 'cash']).optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Aggiorna ordine
      const updatedOrder = await storage.updateOrder(orderId, {
        customerPaysShipping: data.customerPaysShipping,
        shippingPaymentMethod: data.shippingPaymentMethod || 'card',
      });
      
      // Crea log
      await storage.createOrderChangeLog({
        orderId,
        adminUserId: req.userId!,
        changeType: 'shipping_settings_changed',
        changeData: {
          customerPaysShipping: data.customerPaysShipping,
          shippingPaymentMethod: data.shippingPaymentMethod || 'card',
        },
      });
      
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating shipping settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== YANDEX GO DELIVERY ====================
  
  // POST /api/admin/orders/:id/yandex-delivery-price - Calcola prezzo delivery Yandex Taxi (ADMIN ONLY)
  app.post("/api/admin/orders/:id/yandex-delivery-price", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexDostavkaService } = await import("./services/yandex-dostavka");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const schema = z.object({
        pickupCoordinates: z.tuple([z.number(), z.number()]), // [longitude, latitude]
        deliveryCoordinates: z.tuple([z.number(), z.number()]),
        requirements: z.object({
          cargo_loaders: z.number().optional(),
          cargo_options: z.array(z.string()).optional(),
          cargo_type: z.string().optional(),
          pro_courier: z.boolean().optional(),
          taxi_class: z.string().optional(),
        }).optional(),
      });
      
      const { pickupCoordinates, deliveryCoordinates } = schema.parse(req.body);
      
      // Chiama Yandex Delivery API
      const priceData = await yandexDostavkaService.checkPrice(
        pickupCoordinates,
        deliveryCoordinates
      );
      
      // La risposta contiene già i dati formattati dal servizio
      // priceData = { price, currency_rules, distance_meters, eta, offer_id, all_offers }
      
      if (!priceData || !priceData.price) {
        return res.status(404).json({ 
          error: 'No delivery options available',
          message: 'Nessuna opzione di consegna disponibile per questo percorso' 
        });
      }
      
      // SALVA il prezzo E l'offer_id nel database per usarli quando si crea l'ordine
      // L'offer_id è necessario per confermare il prezzo in createClaim()
      await storage.updateOrder(orderId, {
        yandexDeliveryPrice: priceData.price,
        yandexDeliveryOfferId: priceData.offer_id
      });
      
      console.log('Yandex Delivery response to frontend:', JSON.stringify(priceData, null, 2));
      res.json(priceData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error calculating Yandex delivery price:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // POST /api/admin/orders/:id/yandex-delivery - Crea ordine delivery Yandex (ADMIN ONLY)
  app.post("/api/admin/orders/:id/yandex-delivery", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexDostavkaService } = await import("./services/yandex-dostavka");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const schema = z.object({
        pickupCoordinates: z.tuple([z.number(), z.number()]),
        deliveryCoordinates: z.tuple([z.number(), z.number()]),
        pickupAddress: z.string(),
        deliveryAddress: z.string(), // Indirizzo di consegna digitato dall'admin
        pickupContact: z.object({
          name: z.string(),
          phone: z.string().min(1, 'Phone number is required').regex(/^[0-9 \(\)\-\+]+$/, 'Invalid phone format'),
        }),
        deliveryContact: z.object({
          name: z.string(),
          phone: z.string().min(1, 'Phone number is required').regex(/^[0-9 \(\)\-\+]+$/, 'Invalid phone format'),
        }),
        comment: z.string().optional(),
        offerId: z.string().optional(),
      });
      
      const data = schema.parse(req.body);
      
      // Usa l'offer_id salvato nel database se non viene passato nel body
      const offerId = data.offerId || order.yandexDeliveryOfferId;
      
      // Prepara items per Yandex Delivery (dimensioni in METRI, non cm!)
      const orderItem: any = {
        extra_id: order.id, // Nostro numero d'ordine per riferimento
        title: 'Don Giulio Select - Food Order',
        quantity: 1,
        weight: 2, // Default 2kg for food orders
        size: {
          length: 0.30,  // 30cm = 0.30 metri
          width: 0.20,   // 20cm = 0.20 metri
          height: 0.15,  // 15cm = 0.15 metri
        },
        pickup_point: 1, // point_id del punto di prelievo (source)
        droppof_point: 2, // point_id del punto di consegna (destination) - typo ufficiale Yandex!
        cost_value: order.amount.toString(), // Valore dichiarato per assicurazione
        cost_currency: 'RUB',
      };
      
      // Aggiungi fiscalizzazione se payment_on_delivery è attivo
      // OBBLIGATORIO per Yandex quando si usa payment_on_delivery in Russia
      if (order.customerPaysShipping && order.yandexDeliveryPrice) {
        orderItem.fiscalization = {
          vat_code_str: 'vat_20',  // IVA 20% (standard in Russia per prodotti alimentari)
          supplier_inn: '772863212942',  // Partita IVA Don Giulio
          article: 'FOOD-ORDER',  // SKU prodotto
          item_type: 'product'  // Tipo: prodotto (non servizio)
        };
      }
      
      const items = [orderItem];
      
      // Prepara destination point con payment on delivery se configurato
      const destinationPoint: any = {
        point_id: 2,
        visit_order: 2,
        coordinates: data.deliveryCoordinates,
        type: 'destination',
        address: {
          fullname: data.deliveryAddress, // Usa l'indirizzo digitato dall'admin, non quello vecchio del DB
          coordinates: data.deliveryCoordinates,
        },
        contact: data.deliveryContact,
      };
      
      // Aggiungi payment on delivery se il cliente paga la spedizione
      // Usa il prezzo salvato nel database (order.yandexDeliveryPrice)
      if (order.customerPaysShipping && order.yandexDeliveryPrice) {
        const deliveryCost = order.yandexDeliveryPrice;
        destinationPoint.external_order_cost = {
          value: deliveryCost,
          currency: 'RUB',
          currency_sign: '₽',
        };
        destinationPoint.payment_on_delivery = {
          payment_method: order.shippingPaymentMethod || 'card',
          client_order_id: order.id,
          customer: {
            full_name: data.deliveryContact.name,
            phone: data.deliveryContact.phone,
            ...((data.deliveryContact as any).email && { email: (data.deliveryContact as any).email }),
          },
        };
      }
      
      // Crea ordine Yandex Delivery
      const yandexOrder = await yandexDostavkaService.createOrder({
        items,
        route_points: [
          {
            point_id: 1,
            visit_order: 1,
            coordinates: data.pickupCoordinates,
            type: 'source',
            address: {
              fullname: data.pickupAddress,
              coordinates: data.pickupCoordinates,
            },
            contact: data.pickupContact,
          },
          destinationPoint,
        ],
        comment: data.comment || `Заказ ${order.id.slice(0, 8)} - Don Giulio Select`,
        offer_id: offerId || undefined, // Usa l'offer_id salvato nel database o passato nel body
      });
      
      // Salva info Yandex nell'ordine
      const updateData: any = {
        yandexClaimId: yandexOrder.id,
        yandexDeliveryStatus: yandexOrder.status,
        yandexDeliveryPrice: yandexOrder.pricing?.offer?.price || order.yandexDeliveryPrice,
        courierService: 'yandex_delivery',
        courierCalledAt: new Date(),
        status: 'ВЫЗВАН КУРЬЕР',
      };
      
      // Salva deliveryCost se il cliente paga la spedizione
      // Usa il prezzo salvato nel database
      if (order.customerPaysShipping && order.yandexDeliveryPrice) {
        updateData.deliveryCost = order.yandexDeliveryPrice;
      }
      
      await storage.updateOrder(orderId, updateData);
      
      // Invia notifica kuryer ai manager via Email
      try {
        const { sendDeliveryStartedNotificationToManagers } = await import('./services/email');
        await sendDeliveryStartedNotificationToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.deliveryAddress,
          'yandex_delivery',
          order.amount
        );
        console.log(`✅ Delivery notification email sent to managers for order ${order.id}`);
      } catch (error) {
        console.warn('⚠️ Failed to send delivery notification email to managers:', error);
      }
      
      // Invia notifica kuryer ai manager via Telegram
      try {
        const { sendDeliveryStartedNotificationToManagers: sendTelegramToManagers } = await import('./services/telegram-bot');
        await sendTelegramToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.deliveryAddress,
          'yandex_delivery',
          order.amount
        );
        console.log(`✅ Delivery notification sent to managers via Telegram for order ${order.id}`);
      } catch (error) {
        console.warn('⚠️ Failed to send delivery notification to managers via Telegram:', error);
      }
      
      // Log dell'azione
      await storage.createOrderChangeLog({
        orderId,
        adminUserId: req.userId!,
        changeType: 'yandex_delivery_created',
        changeData: {
          claimId: yandexOrder.id,
          status: yandexOrder.status,
          price: yandexOrder.pricing?.offer?.price,
        },
      });
      
      res.json(yandexOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error creating Yandex delivery:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // GET /api/admin/orders/:id/yandex-delivery-status - Ottieni status delivery Yandex (ADMIN ONLY)
  app.get("/api/admin/orders/:id/yandex-delivery-status", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexDostavkaService } = await import("./services/yandex-dostavka");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      if (!order.yandexClaimId) {
        return res.status(400).json({ error: 'No Yandex delivery associated with this order' });
      }
      
      const status = await yandexDostavkaService.getOrderStatus(order.yandexClaimId);
      
      // Aggiorna lo status nell'ordine
      const updates: any = {
        yandexDeliveryStatus: status.status,
      };
      
      if (status.performer_info) {
        updates.yandexPerformerInfo = {
          courierName: status.performer_info.courier_name,
          carModel: status.performer_info.car_model,
          carNumber: status.performer_info.car_number,
        };
      }
      
      await storage.updateOrder(orderId, updates);
      
      res.json(status);
    } catch (error) {
      console.error('Error fetching Yandex delivery status:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // POST /api/admin/orders/:id/yandex-delivery-cancel - Cancella delivery Yandex (ADMIN ONLY)
  app.post("/api/admin/orders/:id/yandex-delivery-cancel", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexDostavkaService } = await import("./services/yandex-dostavka");
      const { ORDER_STATUSES } = await import("@shared/schema");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      if (!order.yandexClaimId) {
        return res.status(400).json({ error: 'No Yandex delivery associated with this order' });
      }
      
      const result = await yandexDostavkaService.cancelOrder(order.yandexClaimId);
      
      // Riporta l'ordine allo stato PAID e rimuove tutti i dati del delivery
      await storage.updateOrder(orderId, {
        status: ORDER_STATUSES.PAID,
        yandexClaimId: null,
        yandexDeliveryStatus: null,
        yandexDeliveryPrice: null,
        yandexPerformerInfo: null,
      });
      
      // Log dell'azione con tutti i dettagli
      await storage.createOrderChangeLog({
        orderId,
        adminUserId: req.userId!,
        changeType: 'yandex_delivery_cancelled',
        changeData: {
          oldOrderStatus: order.status,
          newOrderStatus: ORDER_STATUSES.PAID,
          oldDeliveryStatus: order.yandexDeliveryStatus || null,
          cancelledDeliveryStatus: result.status,
          yandexClaimId: order.yandexClaimId,
          deliveryPrice: order.yandexDeliveryPrice,
          performerInfo: order.yandexPerformerInfo,
        },
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error cancelling Yandex delivery:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== YANDEX GO DELIVERY ====================
  
  // POST /api/admin/orders/:id/yandex-go-price - Calcola prezzo delivery Yandex Go (ADMIN ONLY)
  app.post("/api/admin/orders/:id/yandex-go-price", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexGoService } = await import("./services/yandex-go");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const { pickupAddress, pickupCoords } = req.body;
      
      // Validate pickup coordinates
      if (!pickupCoords || !Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
        return res.status(400).json({ 
          error: 'Pickup coordinates missing',
          message: 'Coordinate del punto di ritiro mancanti. Selezionare un indirizzo di ritiro con coordinate valide.'
        });
      }
      
      if (!pickupAddress) {
        return res.status(400).json({
          error: 'Pickup address missing',
          message: 'Indirizzo del punto di ritiro mancante.'
        });
      }
      
      // Extract and validate delivery coordinates from order
      if (!order.deliveryLongitude || !order.deliveryLatitude) {
        return res.status(400).json({
          error: 'Delivery coordinates missing',
          message: 'Coordinate di consegna mancanti. Usare il pulsante "Ricalcola coordinate" per ottenerle dall\'indirizzo.'
        });
      }
      
      const deliveryCoords: [number, number] = [
        parseFloat(order.deliveryLongitude),
        parseFloat(order.deliveryLatitude)
      ];
      
      // Validate coordinates are not [0, 0] or invalid
      if (deliveryCoords[0] === 0 && deliveryCoords[1] === 0) {
        return res.status(400).json({
          error: 'Invalid delivery coordinates',
          message: 'Coordinate di consegna non valide (0,0). Usare il pulsante "Ricalcola coordinate" per ottenerle dall\'indirizzo.'
        });
      }
      
      if (pickupCoords[0] === 0 && pickupCoords[1] === 0) {
        return res.status(400).json({
          error: 'Invalid pickup coordinates',
          message: 'Coordinate del punto di ritiro non valide (0,0). Selezionare un indirizzo con coordinate GPS valide.'
        });
      }
      
      // API V2 offers/calculate - Usa fullname (formato ufficiale Yandex Go)
      // Docs: https://yandex.ru/support/taxi-for-business/api/
      const priceRequest = {
        items: [{
          quantity: 1,
          weight: 2, // kg stimato
          size: {
            length: 0.3, // m
            width: 0.2,  // m
            height: 0.15 // m
          }
        }],
        route_points: [
          {
            coordinates: pickupCoords as [number, number],
            fullname: pickupAddress
          },
          {
            coordinates: deliveryCoords as [number, number],
            fullname: order.deliveryAddress
          }
        ],
        requirements: {
          taxi_classes: ['express'] // Campo obbligatorio secondo docs
        }
      };
      
      const priceInfo = await yandexGoService.checkPrice(priceRequest);
      
      // SALVA il prezzo E l'offer_id nel database per usarli quando si crea l'ordine
      // L'offer_id è necessario per confermare il prezzo in createClaim()
      await storage.updateOrder(orderId, {
        yandexGoPrice: priceInfo.price,
        yandexGoOfferId: priceInfo.offer_id
      });
      
      // Log temporaneo per debug conversioni
      console.log('🚗 YANDEX GO - Risposta al frontend:', {
        price: priceInfo.price,
        currency: priceInfo.currency,
        distance: priceInfo.distance,
        time: priceInfo.time,
        raw_distance_meters: priceInfo.distance_meters,
        raw_eta_seconds: priceInfo.eta,
        offer_id: priceInfo.offer_id
      });
      
      res.json({
        price: priceInfo.price,
        currency: priceInfo.currency,
        distance: priceInfo.distance,
        time: priceInfo.time
      });
    } catch (error) {
      console.error('Error checking Yandex Go price:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // POST /api/admin/orders/:id/yandex-go - Crea ordine delivery Yandex Go (ADMIN ONLY)
  app.post("/api/admin/orders/:id/yandex-go", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexGoService } = await import("./services/yandex-go");
      const { nanoid } = await import("nanoid");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const { 
        pickupAddress, 
        pickupCoords, 
        pickupContactName, 
        pickupContactPhone,
        deliveryAddress,
        deliveryCoords,
        deliveryContactName,
        deliveryContactPhone
      } = req.body;
      
      // Crea request_id univoco per idempotenza
      const requestId = `don-giulio-go-${Date.now()}-${nanoid(8)}`;
      
      // IMPORTANTE: Non ricalcolare il prezzo qui - usa i dati salvati dall'UI
      // L'offer_id deve corrispondere esattamente alla chiamata checkPrice originale
      let deliveryCost: string | null = null;
      
      if (order.customerPaysShipping) {
        // Usa il costo salvato dall'admin quando ha cliccato "Calcola prezzo"
        deliveryCost = order.yandexGoPrice;
        
        if (!deliveryCost) {
          return res.status(400).json({
            error: 'Missing delivery cost',
            message: 'Calcola prima il costo della spedizione cliccando il pulsante "Calcola prezzo Yandex Go".'
          });
        }
        
        // NON chiamiamo checkPrice() qui perché:
        // 1. Il prezzo è già stato calcolato e salvato dall'UI
        // 2. L'offer_id scade dopo 10 minuti
        // 3. Non possiamo ottenere un nuovo offer_id con payment_on_delivery qui
        //    perché richiederebbe di conoscere il costo in anticipo (circular dependency)
      }
      
      // Prepara destination point con payment on delivery se configurato
      const destinationPoint: any = {
        point_id: 2,
        coordinates: deliveryCoords,
        address: { fullname: deliveryAddress },
        contact: {
          phone: deliveryContactPhone,
          name: deliveryContactName
        },
        type: 'destination' as const,
        visit_order: 2
      };
      
      // Aggiungi payment on delivery se il cliente paga la spedizione
      if (order.customerPaysShipping && deliveryCost) {
        // external_order_cost = totale che il cliente paga al corriere (solo spedizione in questo caso)
        // Secondo la documentazione Yandex, questo è l'importo totale della transazione
        const totalCostToCourier = deliveryCost;
        
        destinationPoint.external_order_cost = {
          value: totalCostToCourier,
          currency: 'RUB',
          currency_sign: '₽',
        };
        destinationPoint.payment_on_delivery = {
          payment_method: order.shippingPaymentMethod || 'card',
          client_order_id: order.id,
          customer: {
            full_name: deliveryContactName,
            phone: deliveryContactPhone,
          },
        };
      }
      
      // Crea ordine Yandex Go
      const orderItem: any = {
        quantity: 1,
        weight: 2,
        size: {
          length: 0.3,
          width: 0.2,
          height: 0.15
        },
        cost_value: order.amount,
        cost_currency: 'RUB',
        title: 'Don Giulio Select - Food Order',
        pickup_point: 1,   // Required: ID of pickup route_point
        dropoff_point: 2   // Required: ID of delivery route_point
      };
      
      // Aggiungi fiscalizzazione se payment_on_delivery è attivo
      // OBBLIGATORIO per Yandex quando si usa payment_on_delivery in Russia
      if (order.customerPaysShipping) {
        orderItem.fiscalization = {
          vat_code_str: 'vat_20',  // IVA 20% (standard in Russia per prodotti alimentari)
          supplier_inn: '772863212942',  // Partita IVA Don Giulio
          article: 'FOOD-ORDER',  // SKU prodotto
          item_type: 'product'  // Tipo: prodotto (non servizio)
        };
      }
      
      const claimRequest: any = {
        items: [orderItem],
        route_points: [
          {
            point_id: 1,  // Required: Unique ID for this route point
            coordinates: pickupCoords,
            address: {
              fullname: pickupAddress
            },
            contact: {
              phone: pickupContactPhone,
              name: pickupContactName
            },
            type: 'source' as const,
            visit_order: 1
          },
          destinationPoint
        ],
        comment: `Заказ ${orderId.substring(0, 8)} - Don Giulio Select`,
        requirements: {
          taxi_class: 'express'  // Specifica tariffa Express per Yandex Go
        },
        skip_door_to_door: false  // Consegna porta a porta
      };
      
      // PASSA l'offer_id salvato da checkPrice() se disponibile
      // Questo conferma a Yandex che vogliamo usare esattamente quel prezzo calcolato
      if (order.yandexGoOfferId) {
        claimRequest.offer_id = order.yandexGoOfferId;
      }
      
      // Crea claim
      const claim = await yandexGoService.createClaim(claimRequest, requestId);
      
      // Aspetta che il claim sia pronto per l'accettazione
      // Il claim passa da "new" → "estimating" → "ready_for_approval"
      let claimInfo = await yandexGoService.getClaimInfo(claim.id);
      let attempts = 0;
      const maxAttempts = 15; // 30 secondi (15 tentativi x 2 secondi)
      
      while (claimInfo.status !== 'ready_for_approval' && attempts < maxAttempts) {
        console.log(`Yandex Go: claim ${claim.id} status: ${claimInfo.status}, waiting... (attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Aspetta 2 secondi
        claimInfo = await yandexGoService.getClaimInfo(claim.id);
        attempts++;
      }
      
      if (claimInfo.status !== 'ready_for_approval') {
        throw new Error(`Claim not ready for approval after ${maxAttempts * 2} seconds. Current status: ${claimInfo.status}`);
      }
      
      // Accetta il claim
      const acceptedClaim = await yandexGoService.acceptClaim(claim.id, claimInfo.version);
      
      // Aggiorna ordine con info Yandex Go
      const finalPrice = acceptedClaim.pricing?.offer?.price || acceptedClaim.pricing?.final_price || null;
      const updateData: any = {
        yandexGoClaimId: acceptedClaim.id,
        yandexGoStatus: acceptedClaim.status,
        yandexGoPrice: finalPrice,
        courierService: 'yandex_go',
        courierCalledAt: new Date(),
        status: 'ВЫЗВАН КУРЬЕР',
      };
      
      // Salva deliveryCost se il cliente paga la spedizione (usa il prezzo passato all'API)
      if (order.customerPaysShipping && deliveryCost) {
        updateData.deliveryCost = deliveryCost;
      }
      
      await storage.updateOrder(orderId, updateData);
      
      // Invia notifica kuryer ai manager via Email
      try {
        const { sendDeliveryStartedNotificationToManagers } = await import('./services/email');
        await sendDeliveryStartedNotificationToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.deliveryAddress,
          'yandex_go',
          order.amount
        );
        console.log(`✅ Delivery notification email sent to managers for order ${order.id}`);
      } catch (error) {
        console.warn('⚠️ Failed to send delivery notification email to managers:', error);
      }
      
      // Invia notifica kuryer ai manager via Telegram
      try {
        const { sendDeliveryStartedNotificationToManagers: sendTelegramToManagers } = await import('./services/telegram-bot');
        await sendTelegramToManagers(
          order.id,
          order.customerName,
          order.customerPhone,
          order.deliveryAddress,
          'yandex_go',
          order.amount
        );
        console.log(`✅ Delivery notification sent to managers via Telegram for order ${order.id}`);
      } catch (error) {
        console.warn('⚠️ Failed to send delivery notification to managers via Telegram:', error);
      }
      
      // Log dell'azione
      await storage.createOrderChangeLog({
        orderId,
        adminUserId: req.userId!,
        changeType: 'yandex_go_created',
        changeData: {
          claimId: acceptedClaim.id,
          status: acceptedClaim.status,
          price: acceptedClaim.pricing?.offer?.price || acceptedClaim.pricing?.final_price
        },
      });
      
      res.json({
        success: true,
        claimId: acceptedClaim.id,
        status: acceptedClaim.status,
        pricing: acceptedClaim.pricing
      });
    } catch (error) {
      console.error('Error creating Yandex Go delivery:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // GET /api/admin/orders/:id/yandex-go-status - Ottieni status delivery Yandex Go (ADMIN ONLY)
  app.get("/api/admin/orders/:id/yandex-go-status", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexGoService } = await import("./services/yandex-go");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      if (!order.yandexGoClaimId) {
        return res.status(400).json({ error: 'No Yandex Go delivery associated with this order' });
      }
      
      const status = await yandexGoService.getClaimInfo(order.yandexGoClaimId);
      
      // Aggiorna lo status nell'ordine
      const updates: any = {
        yandexGoStatus: status.status,
      };
      
      if (status.performer_info) {
        updates.yandexGoPerformerInfo = {
          courierName: status.performer_info.courier_name,
          legalName: status.performer_info.legal_name,
          carModel: status.performer_info.car_model,
          carNumber: status.performer_info.car_number,
        };
      }
      
      await storage.updateOrder(orderId, updates);
      
      res.json(status);
    } catch (error) {
      console.error('Error fetching Yandex Go delivery status:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // POST /api/admin/orders/:id/yandex-go-cancel - Cancella delivery Yandex Go (ADMIN ONLY)
  app.post("/api/admin/orders/:id/yandex-go-cancel", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { yandexGoService } = await import("./services/yandex-go");
      const { ORDER_STATUSES } = await import("@shared/schema");
      
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      if (!order.yandexGoClaimId) {
        return res.status(400).json({ error: 'No Yandex Go delivery associated with this order' });
      }
      
      // Ottieni info su cancellazione
      const cancelInfo = await yandexGoService.getCancelInfo(order.yandexGoClaimId);
      
      // Ottieni claim info per version
      const claimInfo = await yandexGoService.getClaimInfo(order.yandexGoClaimId);
      
      // Cancella il claim
      const result = await yandexGoService.cancelClaim(
        order.yandexGoClaimId, 
        claimInfo.version,
        cancelInfo.cancel_state
      );
      
      // Riporta l'ordine allo stato PAID e rimuove tutti i dati del delivery
      await storage.updateOrder(orderId, {
        status: ORDER_STATUSES.PAID,
        yandexGoClaimId: null,
        yandexGoStatus: null,
        yandexGoPrice: null,
        yandexGoPerformerInfo: null,
        courierService: order.courierService === 'yandex_go' ? null : order.courierService,
      });
      
      // Log dell'azione con tutti i dettagli
      await storage.createOrderChangeLog({
        orderId,
        adminUserId: req.userId!,
        changeType: 'yandex_go_cancelled',
        changeData: {
          oldOrderStatus: order.status,
          newOrderStatus: ORDER_STATUSES.PAID,
          oldDeliveryStatus: order.yandexGoStatus || null,
          cancelledDeliveryStatus: result.status,
          yandexGoClaimId: order.yandexGoClaimId,
          deliveryPrice: order.yandexGoPrice,
          performerInfo: order.yandexGoPerformerInfo,
          cancelInfo: cancelInfo
        },
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error cancelling Yandex Go delivery:', error);
      res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/webhooks/yandex-go - Webhook per notifiche Yandex Go (PUBBLICO - verifica tramite firma)
  // IMPORTANTE: Express deve catturare raw body PRIMA del parsing JSON per verifica HMAC
  app.post("/api/webhooks/yandex-go", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const crypto = await import('crypto');
      
      // Parse body manualmente dal raw buffer
      const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
      const payload = JSON.parse(rawBody.toString());
      
      console.log('🔔 [Yandex Go Webhook] Received webhook notification');
      console.log('📦 [Yandex Go Webhook] Event type:', payload?.event);
      console.log('🚚 [Yandex Go Webhook] Order ID:', payload?.order_id);
      console.log('📋 [Yandex Go Webhook] Status:', payload?.status);
      
      const webhookSecret = process.env.YANDEX_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.error('❌ [Yandex Go Webhook] YANDEX_WEBHOOK_SECRET not configured');
        return res.status(500).json({ ok: false, error: 'Webhook secret not configured' });
      }
      
      // Verifica firma HMAC SHA256 usando raw body (CRITICO per correttezza!)
      const signature = req.headers['x-signature'] as string || payload.signature;
      
      if (!signature) {
        console.error('❌ [Yandex Go Webhook] Missing signature header');
        return res.status(401).json({ ok: false, error: 'missing_signature' });
      }
      
      const hmac = crypto.createHmac('sha256', webhookSecret);
      hmac.update(rawBody);
      const expectedSignature = hmac.digest('base64');
      
      // Verifica timing-safe con controllo lunghezza (fix crash Node.js)
      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      
      if (signatureBuffer.length !== expectedBuffer.length) {
        console.error('❌ [Yandex Go Webhook] Signature length mismatch');
        return res.status(401).json({ ok: false, error: 'invalid_signature' });
      }
      
      const isValidSignature = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
      
      if (!isValidSignature) {
        console.error('❌ [Yandex Go Webhook] Invalid signature');
        return res.status(401).json({ ok: false, error: 'invalid_signature' });
      }
      
      console.log('✅ [Yandex Go Webhook] Signature verified successfully');
      const { event, order_id, status, timestamp, data } = payload;
      
      if (!order_id) {
        console.error('[Yandex Go Webhook] Missing order_id in payload');
        
        // Salva evento fallito per audit
        await storage.createWebhookEvent({
          orderId: null,
          source: 'yandex_go',
          eventType: event || 'unknown',
          payloadJson: payload,
          processed: false,
          processingError: 'Missing order_id in payload',
          httpMethod: 'POST',
          httpHeaders: req.headers,
          signature: signature,
          signatureValid: true,
        });
        
        return res.status(400).json({ ok: false, error: 'missing_order_id' });
      }
      
      // Trova l'ordine tramite yandexGoClaimId
      // TODO: Ottimizzare con storage.getOrderByYandexGoClaimId(order_id) per evitare O(n) scan
      console.log(`🔍 [Yandex Go Webhook] Looking for order with claimId ${order_id}...`);
      const orders = await storage.getAllOrders();
      const order = orders.find(o => o.yandexGoClaimId === order_id);
      
      if (!order) {
        console.warn(`⚠️ [Yandex Go Webhook] Order not found for claimId ${order_id}`);
        
        // Salva evento per audit anche se ordine non trovato
        await storage.createWebhookEvent({
          orderId: null,
          source: 'yandex_go',
          eventType: event || 'status_changed',
          payloadJson: payload,
          processed: true,
          processingError: `Order not found for claimId ${order_id}`,
          httpMethod: 'POST',
          httpHeaders: req.headers,
          signature: signature,
          signatureValid: true,
        });
        
        // Rispondi comunque 200 per evitare retry da Yandex
        return res.json({ ok: true, message: 'Order not found' });
      }
      
      console.log(`✅ [Yandex Go Webhook] Found order ${order.id}`);
      
      // Salva evento webhook per audit trail (PRIMA del processing)
      const webhookEvent = await storage.createWebhookEvent({
        orderId: order.id,
        source: 'yandex_go',
        eventType: event || 'status_changed',
        payloadJson: payload,
        processed: false,
        httpMethod: 'POST',
        httpHeaders: req.headers,
        signature: signature,
        signatureValid: true,
      });
      
      try {
        // Aggiorna status e performer info
        const updates: any = {
          yandexGoStatus: status,
        };
        
        if (data?.courier) {
          updates.yandexGoPerformerInfo = {
            courierName: data.courier.name,
            courierPhone: data.courier.phone,
          };
        }
        
        // Salva location del corriere nella tabella courierTracking
        if (data?.location?.latitude && data?.location?.longitude) {
          console.log('📍 [Yandex Go Webhook] Saving courier location:', data.location);
          await storage.createCourierTracking({
            orderId: order.id,
            latitude: data.location.latitude.toString(),
            longitude: data.location.longitude.toString(),
            heading: data.location.heading ? data.location.heading.toString() : null,
            speed: data.location.speed ? data.location.speed.toString() : null,
            etaMinutes: data.eta_minutes || null,
            reportedAt: timestamp ? new Date(timestamp) : new Date(),
          });
        }
        
        if (data?.eta_minutes) {
          console.log(`⏰ [Yandex Go Webhook] ETA: ${data.eta_minutes} minutes`);
        }
        
        await storage.updateOrder(order.id, updates);
        
        console.log(`✅ [Yandex Go Webhook] Order ${order.id} updated successfully`);
        
        // Log evento webhook per audit
        await storage.createOrderChangeLog({
          orderId: order.id,
          adminUserId: null, // Webhook automatico
          changeType: 'yandex_go_status_update',
          changeData: {
            event,
            oldStatus: order.yandexGoStatus,
            newStatus: status,
            timestamp,
            performerInfo: data?.courier || null,
            location: data?.location || null,
            eta: data?.eta_minutes || null,
          },
        });
        
        // Marca webhook event come processato con successo
        await storage.markWebhookEventAsProcessed(webhookEvent.id);
      } catch (processingError) {
        // Marca webhook event come fallito
        await storage.markWebhookEventAsProcessed(
          webhookEvent.id, 
          processingError instanceof Error ? processingError.message : 'Unknown processing error'
        );
        throw processingError;
      }
      
      // Invia notifica al cliente (opzionale)
      if (status === 'picked_up' || status === 'delivered') {
        try {
          const { sendOrderStatusNotification } = await import('./services/telegram-bot');
          await sendOrderStatusNotification(
            order.userId,
            order.id,
            status === 'picked_up' ? 'КУРЬЕР ЗАБРАЛ' : 'ДОСТАВЛЕН',
            order.customerName
          );
        } catch (error) {
          console.warn('⚠️ Failed to send status notification:', error);
        }
      }
      
      return res.json({ ok: true });
    } catch (error) {
      console.error('❌ [Yandex Go Webhook] Error processing webhook:', error);
      return res.status(500).json({ ok: false, error: 'internal_error' });
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

  // DELETE /api/admin/orders/:id - Soft delete ordine (MASTER ADMIN ONLY)
  // Imposta status a УДАЛЕНО invece di eliminare fisicamente dal database
  app.delete("/api/admin/orders/:id", verifyTelegramInitData, requireAdmin, requireMasterAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      
      // Verifica che l'ordine esista
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che non sia già eliminato
      if (order.status === ORDER_STATUSES.DELETED) {
        return res.status(409).json({ error: 'Order is already deleted' });
      }
      
      // Salva info ordine per audit log
      const orderInfo = {
        orderId: order.id,
        userId: order.userId,
        customerName: order.customerName,
        amount: order.amount,
        previousStatus: order.status,
        itemCount: order.items.length,
      };
      
      // Soft delete: imposta status a УДАЛЕНО
      const updatedOrder = await storage.updateOrderStatus(orderId, ORDER_STATUSES.DELETED);
      
      if (!updatedOrder) {
        return res.status(500).json({ error: 'Failed to delete order' });
      }
      
      // Log azione per audit trail
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'order',
        entityId: orderId,
        actionData: {
          deletedOrder: orderInfo,
          reason: 'Master Admin soft deletion',
        },
      });
      
      res.json({ 
        success: true, 
        message: 'Order marked as deleted',
        order: updatedOrder 
      });
    } catch (error) {
      console.error('Error deleting order:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // ==================== PRODUCT MARKING (ADMIN) ====================
  
  // POST /api/admin/marking-logs - Salva nuovo marking code (ADMIN ONLY)
  app.post("/api/admin/marking-logs", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        orderId: z.string(),
        productId: z.string(),
        markingCode: z.string().min(1, 'Marking code is required'),
      });
      
      const { orderId, productId, markingCode } = schema.parse(req.body);
      
      // Verifica che l'ordine esista
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Verifica che il prodotto esista nell'ordine
      const productInOrder = order.items.find(item => item.productId === productId);
      if (!productInOrder) {
        return res.status(400).json({ error: 'Product not found in order' });
      }
      
      // Verifica che il codice non sia già stato usato
      const isUsed = await storage.isMarkingCodeUsed(markingCode);
      if (isUsed) {
        return res.status(400).json({ error: 'Marking code already used' });
      }
      
      // Verifica che il numero di codici salvati non superi la quantità ordinata
      const existingLogs = await storage.getMarkingLogsByOrder(orderId);
      const productLogs = existingLogs.filter(log => log.productId === productId);
      const requiredQuantity = Math.ceil(productInOrder.quantity); // Round up for fractional quantities
      
      if (productLogs.length >= requiredQuantity) {
        return res.status(400).json({ 
          error: `Maximum number of marking codes (${requiredQuantity}) already saved for this product` 
        });
      }
      
      // Salva il marking log
      const log = await storage.createMarkingLog({
        orderId,
        productId,
        orderDate: order.createdAt,
        markingCode,
        operatorId: req.userId!,
      });
      
      res.json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error saving marking log:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/admin/marking-logs/:orderId - Ottieni marking logs per ordine (ADMIN ONLY)
  app.get("/api/admin/marking-logs/:orderId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const logs = await storage.getMarkingLogsByOrder(orderId);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching marking logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/admin/marking-logs/:logId - Elimina un marking log (ADMIN ONLY)
  app.delete("/api/admin/marking-logs/:logId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const logId = req.params.logId;
      await storage.deleteMarkingLog(logId);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'marking_log',
        entityId: logId,
        actionData: { logId },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting marking log:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/marking-logs/validate - Valida un marking code (ADMIN ONLY)
  app.post("/api/admin/marking-logs/validate", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        markingCode: z.string().min(1, 'Marking code is required'),
      });
      
      const { markingCode } = schema.parse(req.body);
      
      const isUsed = await storage.isMarkingCodeUsed(markingCode);
      const existingLog = isUsed ? await storage.getMarkingLogByCode(markingCode) : undefined;
      
      res.json({ 
        isUsed, 
        existingLog: existingLog || null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error validating marking code:', error);
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

  // ==================== CLIENT MANAGEMENT (ADMIN) ====================
  
  // GET /api/admin/clients - Ottieni lista clienti con statistiche (ADMIN ONLY)
  app.get("/api/admin/clients", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const orders = await storage.getAllOrders({});
      
      // Calcola statistiche per ogni cliente
      const clientsWithStats = await Promise.all(users.map(async user => {
        const userOrders = orders.filter(o => o.userId === user.id);
        const totalSpent = userOrders.reduce((sum, order) => sum + parseFloat(order.amount), 0);
        const totalOrders = userOrders.length;
        const lastOrder = userOrders.length > 0 
          ? userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          : null;
        
        // Ottieni indirizzi salvati del cliente
        const userAddresses = await storage.getUserAddresses(user.id);
        const primaryAddress = userAddresses.find(addr => addr.isDefault) || userAddresses[0] || null;
        
        return {
          ...user,
          primaryAddress: primaryAddress ? primaryAddress.fullAddress : null,
          totalAddresses: userAddresses.length,
          stats: {
            totalOrders,
            totalSpent: totalSpent.toFixed(2),
            lastOrderDate: lastOrder?.createdAt || null,
            lastOrderId: lastOrder?.id || null,
          }
        };
      }));
      
      // Ordina per totale speso (decrescente)
      clientsWithStats.sort((a, b) => parseFloat(b.stats.totalSpent) - parseFloat(a.stats.totalSpent));
      
      res.json(clientsWithStats);
    } catch (error) {
      console.error('Error fetching clients:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/admin/clients/:userId - Ottieni dettaglio cliente (ADMIN ONLY)
  app.get("/api/admin/clients/:userId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Client not found' });
      }
      
      // Ottieni ordini del cliente
      const orders = await storage.getAllOrders({});
      const userOrders = orders.filter(o => o.userId === userId);
      
      // Calcola statistiche dettagliate
      const totalSpent = userOrders.reduce((sum, order) => sum + parseFloat(order.amount), 0);
      const averageOrderValue = userOrders.length > 0 ? totalSpent / userOrders.length : 0;
      
      // Prodotti più acquistati
      const productCounts: Record<string, { count: number; name: string; total: number }> = {};
      userOrders.forEach(order => {
        order.items.forEach(item => {
          if (!productCounts[item.productId]) {
            productCounts[item.productId] = { 
              count: 0, 
              name: item.productName,
              total: 0 
            };
          }
          productCounts[item.productId].count += item.quantity;
          productCounts[item.productId].total += parseFloat(item.price) * item.quantity;
        });
      });
      
      const topProducts = Object.entries(productCounts)
        .map(([productId, data]) => ({
          productId,
          productName: data.name,
          totalQuantity: data.count,
          totalSpent: data.total.toFixed(2)
        }))
        .sort((a, b) => parseFloat(b.totalSpent) - parseFloat(a.totalSpent))
        .slice(0, 5);
      
      // Ottieni premi del cliente con dettagli prodotti
      const prizes = await storage.getPrizesByUserId(userId);
      const prizesWithProducts = await Promise.all(
        prizes.map(async (prize) => {
          if (prize.type === 'gift' && prize.productIds && prize.productIds.length > 0) {
            const products = await Promise.all(
              prize.productIds.map(id => storage.getProductById(id))
            );
            return {
              ...prize,
              products: products.filter((p): p is Product => p != null),
            };
          }
          return { ...prize, products: [] };
        })
      );
      
      // Ottieni indirizzi del cliente
      const addresses = await storage.getUserAddresses(userId);
      
      res.json({
        ...user,
        stats: {
          totalOrders: userOrders.length,
          totalSpent: totalSpent.toFixed(2),
          averageOrderValue: averageOrderValue.toFixed(2),
          topProducts,
        },
        orders: userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        prizes: prizesWithProducts,
        addresses: addresses,
      });
    } catch (error) {
      console.error('Error fetching client detail:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // PUT /api/admin/clients/:userId - Aggiorna dati cliente (ADMIN ONLY)
  app.put("/api/admin/clients/:userId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        customerName: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
      });
      
      const userId = req.params.userId;
      const updates = schema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (updates.phone !== undefined && updates.phone !== null && updates.phone.trim()) {
        updates.phone = normalizePhoneNumber(updates.phone);
      }
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Client not found' });
      }
      
      const updatedUser = await storage.updateUser(userId, updates);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'updated',
        entityType: 'user',
        entityId: userId,
        actionData: {
          oldData: {
            customerName: user.customerName,
            phone: user.phone,
            email: user.email,
          },
          newData: updates,
        },
      });
      
      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating client:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // GET /api/user-addresses/:userId - Ottieni tutti gli indirizzi di un utente specifico (per admin nel dialog ordini)
  app.get("/api/user-addresses/:userId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const addresses = await storage.getUserAddresses(userId);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching user addresses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // PATCH /api/admin/clients/:userId/addresses/:addressId - Aggiorna indirizzo cliente (ADMIN ONLY)
  app.patch("/api/admin/clients/:userId/addresses/:addressId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { userId, addressId } = req.params;
      
      const updateSchema = z.object({
        label: z.string().min(1).optional(),
        fullAddress: z.string().min(10).optional(),
        city: z.string().optional(),
        street: z.string().optional(),
        building: z.string().optional(),
        flat: z.string().optional(),
        postalCode: z.string().optional(),
        dadataFiasId: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        phone: z.string().optional(),
        isDefault: z.boolean().optional(),
      });
      
      const updateData = updateSchema.parse(req.body);
      
      // Normalizza il numero di telefono se presente
      if (updateData.phone !== undefined) {
        if (updateData.phone && updateData.phone.trim()) {
          updateData.phone = normalizePhoneNumber(updateData.phone);
        } else {
          updateData.phone = undefined;
        }
      }
      
      // Verifica che l'indirizzo appartenga all'utente
      const addresses = await storage.getUserAddresses(userId);
      const addressToUpdate = addresses.find(addr => addr.id === addressId);
      
      if (!addressToUpdate) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      // Se questo indirizzo è impostato come default, rimuovi il flag da tutti gli altri
      if (updateData.isDefault) {
        for (const addr of addresses) {
          if (addr.isDefault && addr.id !== addressId) {
            await storage.updateUserAddress(addr.id, { isDefault: false });
          }
        }
      }
      
      await storage.updateUserAddress(addressId, updateData);
      
      const updatedAddresses = await storage.getUserAddresses(userId);
      const result = updatedAddresses.find(addr => addr.id === addressId);
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'updated',
        entityType: 'user_address',
        entityId: addressId,
        actionData: {
          affectedUserId: userId,
          oldData: addressToUpdate,
          newData: updateData,
        },
      });
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      console.error('Error updating client address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // DELETE /api/admin/clients/:userId/addresses/:addressId - Elimina indirizzo cliente (ADMIN ONLY)
  app.delete("/api/admin/clients/:userId/addresses/:addressId", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const { userId, addressId } = req.params;
      
      // Verifica che l'indirizzo appartenga all'utente
      const addresses = await storage.getUserAddresses(userId);
      const addressToDelete = addresses.find(addr => addr.id === addressId);
      
      if (!addressToDelete) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      const success = await storage.deleteUserAddress(addressId);
      
      if (!success) {
        return res.status(404).json({ error: 'Address not found' });
      }
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'deleted',
        entityType: 'user_address',
        entityId: addressId,
        actionData: {
          affectedUserId: userId,
          deletedAddress: addressToDelete,
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting client address:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // POST /api/admin/prizes/:prizeId/add-to-cart - Aggiungi premio prodotto al carrello cliente (ADMIN ONLY)
  app.post("/api/admin/prizes/:prizeId/add-to-cart", verifyTelegramInitData, requireAdmin, async (req, res) => {
    try {
      const prizeId = req.params.prizeId;
      
      // Ottieni il premio
      const prizes = await storage.getAllPrizes();
      const prize = prizes.find((p: Prize) => p.id === prizeId);
      
      if (!prize) {
        return res.status(404).json({ error: 'Prize not found' });
      }
      
      if (prize.type !== 'gift') {
        return res.status(400).json({ error: 'Only gift prizes can be added to cart' });
      }
      
      if (prize.claimed) {
        return res.status(400).json({ error: 'Prize already claimed' });
      }
      
      if (!prize.productIds || prize.productIds.length === 0) {
        return res.status(400).json({ error: 'Prize has no products' });
      }
      
      // Ottieni carrello del cliente
      const cart = await storage.getCart(prize.userId);
      const currentItems = cart?.items || [];
      
      // Aggiungi prodotti premio al carrello
      const newItems = [...currentItems];
      for (const productId of prize.productIds) {
        const product = await storage.getProductById(productId);
        if (!product) continue;
        
        // Cerca se il prodotto esiste già nel carrello
        const existingItem = newItems.find(item => item.productId === productId);
        if (existingItem) {
          // Incrementa quantità
          existingItem.quantity += 1;
        } else {
          // Aggiungi nuovo item
          newItems.push({
            productId: product.id,
            quantity: 1,
            priceAtAdd: product.price,
          });
        }
      }
      
      // Aggiorna carrello
      await storage.setCart(prize.userId, newItems);
      
      // Marca premio come claimed
      await storage.updatePrize(prizeId, {
        claimed: true,
        claimedAt: new Date(),
        adminUsedBy: req.userId!,
      });
      
      // Log azione
      await storage.createAdminActionLog({
        adminUserId: req.userId!,
        telegramUsername: req.telegramUser?.username || null,
        actionType: 'updated',
        entityType: 'prize',
        entityId: prizeId,
        actionData: {
          notes: `Added prize products to cart for user ${prize.userId}. Products: ${prize.value}`,
        },
      });
      
      res.json({ success: true, prize, addedProducts: prize.productIds.length });
    } catch (error) {
      console.error('Error adding prize to cart:', error);
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

  // ==================== OBJECT STORAGE ====================
  // Referenced from blueprint: javascript_object_storage
  
  // GET /public-objects/:filePath - Serve public assets
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /objects/:objectPath - Serve uploaded objects (publicly visible)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Configura multer per upload in memoria
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Solo immagini permesse'));
        return;
      }
      cb(null, true);
    },
  });

  // POST /api/admin/uploads/image - Upload diretto di immagine (ADMIN ONLY)
  app.post("/api/admin/uploads/image", verifyTelegramInitData, requireAdmin, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nessun file caricato' });
      }

      const file = req.file;
      const ext = path.extname(file.originalname) || '.jpg';
      const objectId = randomUUID();
      const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || '';
      const objectPath = `${privateObjectDir}/uploads/${objectId}${ext}`;

      // Parse bucket e object name
      const pathParts = objectPath.split('/');
      const bucketName = pathParts[1];
      const objectName = pathParts.slice(2).join('/');

      // Ottieni presigned URL per upload
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Carica il file nell'object storage
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file.buffer,
        headers: {
          'Content-Type': file.mimetype,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload fallito');
      }

      // Imposta ACL pubblico
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
      await objectStorageService.trySetObjectEntityAclPolicy(uploadURL, {
        owner: req.userId!,
        visibility: 'public',
      });

      res.json({ path: normalizedPath });
    } catch (error) {
      console.error("Error uploading image:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Errore upload" });
    }
  });

  // DELETE /api/admin/uploads/image - Elimina immagine (ADMIN ONLY)
  app.delete("/api/admin/uploads/image", verifyTelegramInitData, requireAdmin, async (req, res) => {
    const { path: imagePath } = req.body;
    
    try {
      if (!imagePath) {
        return res.status(400).json({ error: 'Path mancante' });
      }

      console.log('[DELETE IMAGE] Received path:', imagePath);

      // Ignora URL esterni (Unsplash, ecc.) - non possono essere eliminati
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        console.log('[DELETE IMAGE] Skipping external URL:', imagePath);
        return res.json({ success: true, skipped: true });
      }

      // Elimina solo file dal nostro object storage
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(imagePath);
      await objectFile.delete();

      console.log('[DELETE IMAGE] Successfully deleted:', imagePath);
      res.json({ success: true });
    } catch (error) {
      console.error("[DELETE IMAGE] Error:", error);
      console.error("[DELETE IMAGE] Path was:", imagePath);
      res.status(500).json({ error: error instanceof Error ? error.message : "Errore eliminazione" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
