export type FlashLevel = "success" | "error";

export interface PageFlashMessage {
  level: FlashLevel;
  message: string;
}

const FLASH_KEY = "gitpulse.page-flash";

export function savePageFlash(message: PageFlashMessage): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(FLASH_KEY, JSON.stringify(message));
}

export function takePageFlash(): PageFlashMessage | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(FLASH_KEY);
  if (!raw) {
    return null;
  }

  sessionStorage.removeItem(FLASH_KEY);

  try {
    return JSON.parse(raw) as PageFlashMessage;
  } catch {
    return null;
  }
}
