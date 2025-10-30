export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  
  const trimmed = phone.trim();
  
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  
  if (trimmed.startsWith('8')) {
    return '+7' + trimmed.substring(1);
  }
  
  if (trimmed.startsWith('9')) {
    return '+7' + trimmed;
  }
  
  return trimmed;
}
