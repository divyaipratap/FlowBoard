import { wordlist } from "@scure/bip39/wordlists/english.js";
import * as sodiumModule from "libsodium-wrappers-sumo";

import type { PairingCode } from "../index.js";

type SodiumModule = typeof sodiumModule & { readonly default?: typeof sodiumModule };

const sodium = ((sodiumModule as SodiumModule).default ?? sodiumModule) as typeof sodiumModule;
const PAIRING_CODE_WORDS = 6;
const WORD_BITS = 11;
const WORD_COUNT = 2 ** WORD_BITS;
const validWords = new Set(wordlist);

export class InvalidPairingCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPairingCodeError";
  }
}

export async function generatePairingCode(): Promise<PairingCode> {
  await sodium.ready;

  return {
    words: Array.from({ length: PAIRING_CODE_WORDS }, () => {
      const index = sodium.randombytes_uniform(WORD_COUNT);
      const word = wordlist[index];
      if (word === undefined) {
        throw new Error("BIP39 wordlist lookup failed");
      }
      return word;
    }),
  };
}

export function normalizePairingCode(code: PairingCode | string): PairingCode {
  const words =
    typeof code === "string"
      ? code.trim().toLowerCase().split(/\s+/u)
      : code.words.map((word) => word.trim().toLowerCase());

  if (words.length !== PAIRING_CODE_WORDS) {
    throw new InvalidPairingCodeError(`Pairing code must contain exactly ${PAIRING_CODE_WORDS} words`);
  }

  for (const word of words) {
    if (!validWords.has(word)) {
      throw new InvalidPairingCodeError(`Pairing code contains a non-BIP39 word: ${word}`);
    }
  }

  return { words };
}

export function pairingCodeToPassphrase(code: PairingCode): string {
  return normalizePairingCode(code).words.join(" ");
}

export const pairingCodeEntropyBits = PAIRING_CODE_WORDS * WORD_BITS;
