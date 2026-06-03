/**
 * Converts a relative image path to an absolute URL
 * Handles both relative paths (/objects/...) and already absolute URLs (https://...)
 *
 * On Timeweb, set VITE_IMAGE_BASE_URL=https://don-giulio-catalog.replit.app
 * so images are fetched from Replit Object Storage (not available locally on Timeweb).
 */
export function getAbsoluteImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  
  // Already an absolute URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Relative path — use explicit image CDN base if configured, otherwise current origin
  const imageBase = (import.meta.env.VITE_IMAGE_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';
  const origin = imageBase || (typeof window !== 'undefined' ? window.location.origin : 'https://don-giulio-catalog.replit.app');
  
  // Ensure path starts with /
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  return `${origin}${path}`;
}
