const cancelled = new Set<string>();
const cancelHandlers = new Map<string, () => void>();

export function registerChatGenerationCancel(
  chatId: string,
  cancel: () => void,
) {
  cancelHandlers.set(chatId, cancel);
}

export function unregisterChatGenerationCancel(chatId: string) {
  cancelHandlers.delete(chatId);
  cancelled.delete(chatId);
}

export function requestChatGenerationCancel(chatId: string) {
  cancelled.add(chatId);
  cancelHandlers.get(chatId)?.();
}

export function isChatGenerationCancelled(chatId: string): boolean {
  return cancelled.has(chatId);
}

export function clearChatGenerationCancel(chatId: string) {
  cancelled.delete(chatId);
}
