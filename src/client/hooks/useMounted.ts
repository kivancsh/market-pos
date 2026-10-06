"use client";

import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

/** Sunucuda ve hidrasyonda false, tarayıcıda yüklendikten sonra true (localStorage kullanan ekranlar için). */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}
