// Start with one fallback slot; the picker adds optional empty ones up to the cap.
export const DEFAULT_FALLBACK_SLOTS=1
export const MAX_FALLBACK_SLOTS=20
export const clampFallbackSlots=count=>Math.min(MAX_FALLBACK_SLOTS,Math.max(DEFAULT_FALLBACK_SLOTS,count))
export const validFallbackSlotCount=count=>Number.isInteger(count)&&count>=DEFAULT_FALLBACK_SLOTS&&count<=MAX_FALLBACK_SLOTS
export const canCloseFallback=(index,count,ref)=>index===count&&index>0&&(count>1||!!ref)
