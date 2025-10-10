/**
 * Converts a relative image path to an absolute URL
 * Handles both relative paths (/objects/...) and already absolute URLs (https://...)
 */
export function getAbsoluteImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  
  // Already an absolute URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Relative path - convert to absolute
  // Use the app's origin from window or construct from env
  const origin = typeof window !== 'undefined' 
    ? window.location.origin 
    : 'https://don-giulio-catalog.replit.app';
  
  // Ensure path starts with /
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  return `${origin}${path}`;
}
