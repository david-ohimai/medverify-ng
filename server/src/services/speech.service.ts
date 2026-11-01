import { llmService } from "../ai/llm.service.js";
import { getActivePrompt } from "../ai/prompts.js";
import { cacheGetJson, cacheKeys, cacheSetJson, CACHE_TTL } from "../lib/cache.js";
import { sha256 } from "../lib/hash.js";
import type { Signal } from "./risk/riskScorer.js";
import { scanService } from "./scan.service.js";
import type { VerificationResult } from "./verification.service.js";

export const SPEECH_LANGUAGES = {
  en: { name: "English", ttsLocale: "en-NG" },
  pcm: { name: "Nigerian Pidgin", ttsLocale: "en-NG" },
  ha: { name: "Hausa", ttsLocale: "ha-NG" },
  yo: { name: "Yoruba", ttsLocale: "yo-NG" },
  ig: { name: "Igbo", ttsLocale: "ig-NG" },
} as const;
export type SpeechLanguage = keyof typeof SPEECH_LANGUAGES;

export interface SpeechText {
  scanId: string;
  language: SpeechLanguage;
  text: string;
  /** BCP-47 locale for the phone's text-to-speech (Pidgin is read by an English voice). */
  ttsLocale: string;
  /** "builtin" for English, else the provider that translated it, or "cache". */
  translatedBy: string;
}

/** The one reason worth saying aloud: the heaviest warning, if any. */
function mainReason(signals: Signal[]): string | null {
  const warnings = signals.filter((signal) => signal.weight > 0).sort((a, b) => b.weight - a.weight);
  return warnings[0]?.label ?? null;
}

/** What is read aloud: the headline, the main reason and the advice, short enough to listen to. */
export function spokenEnglish(result: VerificationResult): string {
  const parts = [result.headline, mainReason(result.signals), result.advice];
  if (result.review?.decision) parts.push(result.review.message);
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(" ");
}

/**
 * A scan's verdict as text to speak, in the user's language. English needs
 * no AI. Other languages are translated by the light model and cached by the
 * English text + language + prompt version, verdict wording repeats a lot,
 * so most requests cost no AI call at all.
 */
export const speechService = {
  async forScan(deviceId: string, scanId: string, language: SpeechLanguage): Promise<SpeechText> {
    const result = await scanService.getForDevice(deviceId, scanId);
    const english = spokenEnglish(result);
    const { ttsLocale } = SPEECH_LANGUAGES[language];
    if (language === "en") return { scanId, language, text: english, ttsLocale, translatedBy: "builtin" };

    const prompt = await getActivePrompt("translate_verdict");
    const key = cacheKeys.translation(sha256(english).slice(0, 24), language, prompt.version);
    const cached = await cacheGetJson<{ text: string }>(key);
    if (cached) return { scanId, language, text: cached.text, ttsLocale, translatedBy: "cache" };

    const translated = await llmService.run(
      "translate_verdict",
      [{ type: "text", text: `Target language: ${SPEECH_LANGUAGES[language].name}\n\nEnglish text:\n${english}` }],
      { inputSummary: `verdict for scan ${scanId} → ${language} (${english.length} chars)`, scanId }
    );
    await cacheSetJson(key, { text: translated.data.text }, CACHE_TTL.aiResult);
    return { scanId, language, text: translated.data.text, ttsLocale, translatedBy: translated.provider };
  },
};
