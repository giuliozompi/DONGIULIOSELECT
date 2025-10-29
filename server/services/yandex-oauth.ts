/**
 * Yandex OAuth Service for Yandex Go Доставка для бизнеса
 * Manages OAuth token lifecycle including refresh when needed
 */

import { YandexLogger } from '../utils/yandex-integration';

export interface YandexOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  staticToken?: string;
  tokenUrl?: string;
  scope?: string;
}

export interface TokenInfo {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  isStatic: boolean;
}

export class YandexOAuthService {
  private config: YandexOAuthConfig;
  private cachedToken: TokenInfo | null = null;
  private logger: YandexLogger;

  constructor() {
    this.config = {
      clientId: process.env.YANDEX_GO_CLIENT_ID,
      clientSecret: process.env.YANDEX_GO_CLIENT_SECRET,
      staticToken: process.env.YANDEX_GO_TOKEN,
      tokenUrl: process.env.YANDEX_OAUTH_TOKEN_URL || 'https://oauth.yandex.ru/token',
      scope: process.env.YANDEX_GO_SCOPE || 'cargo:write cargo:read',
    };

    this.logger = new YandexLogger({
      service: 'yandex-go',
      operation: 'oauth',
    });
  }

  /**
   * Get authentication headers for API requests
   * Automatically handles OAuth flow or static token
   */
  async getAuthHeaders(): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Get valid access token (refresh if needed)
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.cachedToken && this.isTokenValid()) {
      this.logger.info('Using cached token', { 
        isStatic: this.cachedToken.isStatic,
        expiresAt: new Date(this.cachedToken.expiresAt).toISOString()
      });
      return this.cachedToken.accessToken;
    }

    // Try OAuth flow if client credentials are available
    if (this.config.clientId && this.config.clientSecret) {
      this.logger.info('Attempting OAuth client credentials flow');
      return await this.refreshTokenOAuth();
    }

    // Fall back to static token if available
    if (this.config.staticToken) {
      this.logger.info('Using static API token');
      this.cachedToken = {
        accessToken: this.config.staticToken,
        tokenType: 'Bearer',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
        isStatic: true,
      };
      return this.config.staticToken;
    }

    // No authentication configured
    throw new Error(
      'Yandex Go authentication not configured. ' +
      'Provide either OAuth credentials (YANDEX_GO_CLIENT_ID + YANDEX_GO_CLIENT_SECRET) ' +
      'or a static API token (YANDEX_GO_TOKEN)'
    );
  }

  /**
   * Check if cached token is still valid
   */
  private isTokenValid(): boolean {
    if (!this.cachedToken) return false;
    
    // Check expiration with 60 second buffer
    const now = Date.now();
    const bufferMs = 60 * 1000;
    return now < this.cachedToken.expiresAt - bufferMs;
  }

  /**
   * Refresh OAuth token using client credentials
   * Note: Yandex may not support standard client_credentials flow
   * This may need to be adapted based on actual Yandex OAuth requirements
   */
  private async refreshTokenOAuth(): Promise<string> {
    const { clientId, clientSecret, tokenUrl, scope } = this.config;
    
    if (!clientId || !clientSecret) {
      throw new Error('OAuth client credentials not configured');
    }

    try {
      this.logger.info('Requesting new OAuth token');
      
      // Prepare request body
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      if (scope) {
        params.append('scope', scope);
      }

      // Make token request
      const response = await fetch(tokenUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('OAuth token request failed', {
          status: response.status,
          error: errorText,
        });
        
        // If OAuth fails, try falling back to static token
        if (this.config.staticToken) {
          this.logger.info('OAuth failed, falling back to static token');
          this.cachedToken = {
            accessToken: this.config.staticToken,
            tokenType: 'Bearer',
            expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
            isStatic: true,
          };
          return this.config.staticToken;
        }
        
        throw new Error(`OAuth token request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Cache the new token
      const expiresInSec = data.expires_in || 3600;
      this.cachedToken = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresAt: Date.now() + expiresInSec * 1000,
        isStatic: false,
      };

      this.logger.info('OAuth token obtained successfully', {
        expiresIn: expiresInSec,
        expiresAt: new Date(this.cachedToken.expiresAt).toISOString(),
      });

      return this.cachedToken.accessToken;
    } catch (error) {
      this.logger.error('OAuth token refresh failed', { error });
      
      // Last resort: try static token
      if (this.config.staticToken) {
        this.logger.info('Using static token as last resort');
        this.cachedToken = {
          accessToken: this.config.staticToken,
          tokenType: 'Bearer',
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
          isStatic: true,
        };
        return this.config.staticToken;
      }
      
      throw error;
    }
  }

  /**
   * Force refresh the token (useful for testing)
   */
  async forceRefresh(): Promise<string> {
    this.logger.info('Forcing token refresh');
    this.cachedToken = null;
    return await this.getAccessToken();
  }

  /**
   * Get current token info (for debugging)
   */
  getTokenInfo(): TokenInfo | null {
    return this.cachedToken;
  }
}

// Singleton instance
export const yandexOAuthService = new YandexOAuthService();