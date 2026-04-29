export const SUI_NETWORK = (import.meta.env.VITE_SUI_NETWORK ?? 'testnet').toLowerCase();

export const SUI_NETWORK_LABEL = SUI_NETWORK.toUpperCase();

export function networkTitle(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}
