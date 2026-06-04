import { db } from "../db";
import { 
  orders, 
  carts, 
  abandonedCartNotifications, 
  analyticsSnapshots,
  analyticsTopProducts,
  users,
  products,
  ORDER_STATUSES
} from "@shared/schema";
import { eq, and, gte, lte, sql as sqlDrizzle, desc } from "drizzle-orm";

interface DateRange {
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
}

export async function generateDailySnapshot(targetDate: string): Promise<void> {
  console.log(`[Analytics Aggregation] Generating snapshot for ${targetDate}...`);
  
  const dateRange = {
    startDate: targetDate,
    endDate: targetDate
  };
  
  try {
    const existingSnapshot = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.snapshotDate, targetDate),
          eq(analyticsSnapshots.granularity, 'daily')
        )
      )
      .limit(1);
    
    if (existingSnapshot.length > 0) {
      console.log(`[Analytics Aggregation] ⏭️  Snapshot for ${targetDate} already exists, skipping`);
      return;
    }
    
    const metrics = await aggregateMetrics(dateRange);
    
    const [snapshot] = await db
      .insert(analyticsSnapshots)
      .values({
        snapshotDate: targetDate,
        granularity: 'daily',
        ...metrics
      })
      .returning();
    
    console.log(`[Analytics Aggregation] ✅ Snapshot created: ${snapshot.id}`);
    
    const topProducts = await aggregateTopProducts(dateRange);
    
    if (topProducts.length > 0) {
      await db.insert(analyticsTopProducts).values(
        topProducts.map((product, index) => ({
          snapshotId: snapshot.id,
          snapshotDate: targetDate,
          productId: product.productId,
          productName: product.productName,
          unitsSold: product.unitsSold,
          revenue: product.revenue,
          rank: index + 1
        }))
      );
      
      console.log(`[Analytics Aggregation] ✅ ${topProducts.length} top products saved`);
    }
    
  } catch (error) {
    console.error(`[Analytics Aggregation] ❌ Error generating snapshot for ${targetDate}:`, error);
    throw error;
  }
}

async function aggregateMetrics(dateRange: DateRange) {
  const startDateTime = `${dateRange.startDate} 00:00:00`;
  const endDateTime = `${dateRange.endDate} 23:59:59`;
  
  const ordersData = await db
    .select()
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, sqlDrizzle`${startDateTime}::timestamp`),
        lte(orders.createdAt, sqlDrizzle`${endDateTime}::timestamp`)
      )
    );
  
  const totalOrders = ordersData.length;
  const completedOrders = ordersData.filter(o => o.status === ORDER_STATUSES.RECEIVED).length;
  const paidOrders = ordersData.filter(o => 
    o.status === ORDER_STATUSES.PAID || 
    o.status === ORDER_STATUSES.COURIER_CALLED || 
    o.status === ORDER_STATUSES.RECEIVED
  ).length;
  const pendingOrders = ordersData.filter(o => o.status === ORDER_STATUSES.FORMED).length;
  const canceledOrders = ordersData.filter(o => o.status === ORDER_STATUSES.DELETED).length;
  
  let grossRevenue = 0;
  let totalDiscounts = 0;
  let totalRefunds = 0;
  let yookassaOrders = 0;
  let cashOrders = 0;
  
  ordersData.forEach(order => {
    const amount = parseFloat(order.amount);
    grossRevenue += amount;
    
    if (order.discount) {
      totalDiscounts += parseFloat(order.discount);
    }
    
    if (order.refundedAmount) {
      totalRefunds += parseFloat(order.refundedAmount);
    }
    
    if (order.paymentMethod === 'yookassa') {
      yookassaOrders++;
    } else if (order.paymentMethod === 'cash_on_delivery') {
      cashOrders++;
    }
  });
  
  const netRevenue = grossRevenue - totalDiscounts - totalRefunds;
  
  const cartReminders = await db
    .select()
    .from(abandonedCartNotifications)
    .where(
      and(
        gte(abandonedCartNotifications.sentAt, sqlDrizzle`${startDateTime}::timestamp`),
        lte(abandonedCartNotifications.sentAt, sqlDrizzle`${endDateTime}::timestamp`)
      )
    );
  
  const cartRemindersSent = cartReminders.length;
  const cartRecoveryOrders = cartReminders.filter(r => r.usedInOrderId).length;
  
  const usersBefore = await db
    .select({ userId: users.id })
    .from(users)
    .where(
      sqlDrizzle`${users.id} IN (
        SELECT DISTINCT user_id 
        FROM ${orders} 
        WHERE created_at < ${startDateTime}::timestamp
      )`
    );
  
  const usersBeforeSet = new Set(usersBefore.map(u => u.userId));
  
  const uniqueUserIdsSet = new Set(ordersData.map(o => o.userId));
  const uniqueUserIds = Array.from(uniqueUserIdsSet);
  const newCustomers = uniqueUserIds.filter(userId => !usersBeforeSet.has(userId)).length;
  const returningCustomers = uniqueUserIds.filter(userId => usersBeforeSet.has(userId)).length;
  const totalCustomers = uniqueUserIds.length;
  
  const abandonedCarts = await db
    .select()
    .from(carts)
    .where(
      and(
        sqlDrizzle`jsonb_array_length(items) > 0`,
        gte(carts.updatedAt, sqlDrizzle`${startDateTime}::timestamp`),
        lte(carts.updatedAt, sqlDrizzle`${endDateTime}::timestamp`),
        sqlDrizzle`NOT EXISTS (
          SELECT 1 FROM ${orders} 
          WHERE ${orders.userId} = ${carts.userId} 
          AND ${orders.createdAt} >= ${carts.updatedAt}
          AND ${orders.createdAt} <= ${sqlDrizzle`${endDateTime}::timestamp`}
        )`
      )
    );
  
  const averageOrderValue = totalOrders > 0 ? (grossRevenue / totalOrders).toFixed(2) : '0';
  
  return {
    totalOrders,
    completedOrders,
    paidOrders,
    pendingOrders,
    canceledOrders,
    grossRevenue: grossRevenue.toFixed(2),
    totalDiscounts: totalDiscounts.toFixed(2),
    totalRefunds: totalRefunds.toFixed(2),
    netRevenue: netRevenue.toFixed(2),
    shippingRevenue: '0',
    shippingCost: '0',
    cogs: '0',
    newCustomers,
    returningCustomers,
    totalCustomers,
    abandonedCarts: abandonedCarts.length,
    cartRemindersSent,
    cartRecoveryOrders,
    yookassaOrders,
    cashOrders,
    averageOrderValue
  };
}

async function aggregateTopProducts(dateRange: DateRange) {
  const startDateTime = `${dateRange.startDate} 00:00:00`;
  const endDateTime = `${dateRange.endDate} 23:59:59`;
  
  const ordersData = await db
    .select()
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, sqlDrizzle`${startDateTime}::timestamp`),
        lte(orders.createdAt, sqlDrizzle`${endDateTime}::timestamp`)
      )
    );
  
  const productStats = new Map<string, { productName: string; unitsSold: number; revenue: number }>();
  
  for (const order of ordersData) {
    const items = order.items as Array<{ productId: string; productName?: string; quantity: number; price: string }>;
    
    for (const item of items) {
      if (!item.productId) {
        console.warn(`[Analytics] Skipping item with missing productId in order ${order.id}`);
        continue;
      }
      
      const quantity = parseFloat(Number(item.quantity).toFixed(3)) || 0;
      if (quantity <= 0) {
        console.warn(`[Analytics] Skipping item with invalid quantity ${item.quantity} in order ${order.id}`);
        continue;
      }
      
      const price = parseFloat(item.price);
      if (isNaN(price) || price < 0) {
        console.warn(`[Analytics] Skipping item with invalid price ${item.price} in order ${order.id}`);
        continue;
      }
      
      const itemRevenue = quantity * price;
      if (isNaN(itemRevenue)) {
        console.warn(`[Analytics] Skipping item with NaN revenue in order ${order.id}`);
        continue;
      }
      
      let productName = item.productName;
      if (!productName) {
        const productLookup = await db
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);
        
        if (productLookup.length > 0) {
          productName = productLookup[0].name;
        } else {
          console.warn(`[Analytics] Product ${item.productId} not found, skipping`);
          continue;
        }
      }
      
      const existing = productStats.get(item.productId);
      
      if (existing) {
        existing.unitsSold += quantity;
        existing.revenue += itemRevenue;
      } else {
        productStats.set(item.productId, {
          productName,
          unitsSold: quantity,
          revenue: itemRevenue
        });
      }
    }
  }
  
  const topProducts = Array.from(productStats.entries())
    .map(([productId, stats]) => ({
      productId,
      productName: stats.productName,
      unitsSold: parseFloat(stats.unitsSold.toFixed(3)),
      revenue: Number.isFinite(stats.revenue) ? stats.revenue.toFixed(2) : '0.00'
    }))
    .filter(p => p.unitsSold > 0 && p.productName)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 50);
  
  return topProducts;
}

export async function backfillHistoricalData(startDate: string, endDate: string): Promise<void> {
  console.log(`[Analytics Backfill] Starting backfill from ${startDate} to ${endDate}...`);
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentDate = new Date(start);
  
  let processedDays = 0;
  let skippedDays = 0;
  
  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    try {
      await generateDailySnapshot(dateStr);
      processedDays++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        skippedDays++;
      } else {
        console.error(`[Analytics Backfill] Failed for ${dateStr}:`, error);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.log(`[Analytics Backfill] ✅ Completed: ${processedDays} days processed, ${skippedDays} days skipped`);
}
