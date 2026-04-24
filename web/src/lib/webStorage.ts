export function getStoredItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

export function setStoredItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

export function removeStoredItem(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}
