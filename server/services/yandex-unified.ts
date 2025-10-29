/**
 * Yandex Unified Service - Smart fallback between Yandex Go and Yandex Dostavka
 * 
 * Best practices from Yandex integration documentation:
 * - If one service fails to find courier, automatically try the other
 * - Use correlation ID to track entire flow across services
 * - Log all fallback attempts for debugging
 */

import { yandexGoService } from './yandex-go';
import { yandexDostavkaService } from './yandex-dostavka';
import { generateCorrelationId, YandexLogger } from '../utils/yandex-integration';

export type DeliveryService = 'yandex-go' | 'yandex-dostavka';

export interface UnifiedPriceRequest {
  pickupCoords: [number, number];
  deliveryCoords: [number, number];
  items?: any[];
  requirements?: any;
}

export interface UnifiedPriceResponse {
  price: string;
  currency: string;
  distance: number;
  time: number;
  service: DeliveryService;
  correlationId: string;
  fallbackUsed: boolean;
}

export class YandexUnifiedService {
  /**
   * Check price with automatic fallback
   * Tries Yandex Go first (faster, on-demand), then falls back to Yandex Dostavka if it fails
   */
  async checkPriceWithFallback(
    request: UnifiedPriceRequest,
    preferredService: DeliveryService = 'yandex-go',
    correlationId?: string
  ): Promise<UnifiedPriceResponse> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-go',
      operation: 'checkPriceWithFallback',
    });

    logger.info('Starting price check with fallback', { 
      preferredService,
      pickup: request.pickupCoords,
      delivery: request.deliveryCoords
    });

    // Determine primary and fallback services
    const primaryService = preferredService;
    const fallbackService: DeliveryService = preferredService === 'yandex-go' ? 'yandex-dostavka' : 'yandex-go';

    // Try primary service first
    try {
      logger.info(`Trying primary service: ${primaryService}`);
      const result = await this.checkPriceSingle(request, primaryService, corrId);
      
      logger.info(`Primary service ${primaryService} succeeded`);
      
      return {
        ...result,
        service: primaryService,
        correlationId: corrId,
        fallbackUsed: false,
      };
    } catch (primaryError: any) {
      logger.warn(`Primary service ${primaryService} failed, trying fallback ${fallbackService}`, {
        error: primaryError.message
      });

      // Try fallback service
      try {
        const result = await this.checkPriceSingle(request, fallbackService, corrId);
        
        logger.info(`Fallback service ${fallbackService} succeeded`);
        
        return {
          ...result,
          service: fallbackService,
          correlationId: corrId,
          fallbackUsed: true,
        };
      } catch (fallbackError: any) {
        logger.error('Both services failed', {
          primaryError: primaryError.message,
          fallbackError: fallbackError.message
        });
        
        // Both services failed - throw the most descriptive error
        throw new Error(
          `Entrambi i servizi di consegna non sono disponibili. ` +
          `${primaryService}: ${primaryError.message}. ` +
          `${fallbackService}: ${fallbackError.message}`
        );
      }
    }
  }

  /**
   * Check price from a single service
   */
  private async checkPriceSingle(
    request: UnifiedPriceRequest,
    service: DeliveryService,
    correlationId: string
  ): Promise<{ price: string; currency: string; distance: number; time: number }> {
    if (service === 'yandex-go') {
      // Yandex Go expects specific format
      const goRequest = {
        items: [{
          quantity: 1,
          weight: 2,
          size: { length: 0.30, width: 0.20, height: 0.15 }
        }],
        route_points: [
          { coordinates: request.pickupCoords, fullname: 'Pickup' },
          { coordinates: request.deliveryCoords, fullname: 'Delivery' }
        ],
        requirements: request.requirements || {}
      };

      const result = await yandexGoService.checkPrice(goRequest, correlationId);
      
      return {
        price: result.price,
        currency: result.currency,
        distance: result.distance,
        time: result.time,
      };
    } else {
      // Yandex Dostavka
      const result = await yandexDostavkaService.checkPrice(
        request.pickupCoords,
        request.deliveryCoords,
        request.items,
        request.requirements,
        correlationId
      );

      return {
        price: result.price,
        currency: result.currency_rules.code,
        distance: Math.round(result.distance_meters / 1000), // meters to km
        time: Math.round(result.eta / 60), // seconds to minutes
      };
    }
  }

  /**
   * Create claim with specific service (no fallback for creation - must be intentional)
   * Correlation ID links this to the previous price check
   */
  async createClaim(
    service: DeliveryService,
    claimData: any,
    orderId: string,
    correlationId: string
  ): Promise<any> {
    const logger = new YandexLogger({
      correlationId,
      service: 'yandex-go',
      operation: 'createClaim',
      orderId,
    });

    logger.info(`Creating claim with ${service}`, { correlationId, orderId });

    if (service === 'yandex-go') {
      return await yandexGoService.createClaim(claimData, orderId, correlationId);
    } else {
      return await yandexDostavkaService.createOrder(claimData, orderId, correlationId);
    }
  }

  /**
   * Get claim info (uses correlation ID to track the flow)
   */
  async getClaimInfo(
    service: DeliveryService,
    claimId: string,
    correlationId?: string
  ): Promise<any> {
    const corrId = correlationId || generateCorrelationId();

    if (service === 'yandex-go') {
      return await yandexGoService.getClaimInfo(claimId, corrId);
    } else {
      return await yandexDostavkaService.getOrderStatus(claimId, corrId);
    }
  }

  /**
   * Cancel claim (uses correlation ID to track the flow)
   */
  async cancelClaim(
    service: DeliveryService,
    claimId: string,
    version?: number,
    correlationId?: string
  ): Promise<any> {
    const corrId = correlationId || generateCorrelationId();

    if (service === 'yandex-go') {
      return await yandexGoService.cancelClaim(claimId, version || 1, undefined, corrId);
    } else {
      return await yandexDostavkaService.cancelOrder(claimId, corrId);
    }
  }
}

export const yandexUnifiedService = new YandexUnifiedService();
