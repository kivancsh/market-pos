"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMounted } from "@/client/hooks/useMounted";
import { formatTRY, parseTRYToKurus } from "@/lib/money";
import { api } from "@/client/api";
import { cartReducer, cartTotals, emptyCart, parseStoredCart, type CartState } from "@/client/cart";
import { useBarcodeScanner } from "@/client/hooks/useBarcodeScanner";
import { useCatalog, type LookupResult } from "@/client/hooks/useCatalog";
import { beepError, beepSuccess, unlockAudioOnFirstGesture } from "@/client/sound";
import { loadJson, saveJson } from "@/client/storage";
import type { CatalogItem, KasaSettings, Role } from "@/client/types";
import { uuidv4 } from "@/client/uuid";
import { CartTable } from "./CartTable";
import { PaymentDialog, type SaleResponse } from "./PaymentDialog";
import { QuickProductDialog } from "@/client/components/QuickProductDialog";
import { SimulatorPanel } from "./SimulatorPanel";
import { SuccessOverlay } from "./SuccessOverlay";
import { Modal } from "@/client/components/Modal";

const CART_KEY = "mp_cart_v1";
const STATS_REFRESH_MS = 30_000;

type Message =
  | { kind: "success" | "error" | "warn" | "info"; text: string; unknownCode?: string; key: number }
  | null;

interface TodayStats {
  date: string;
  saleCount: number;
  revenueKurus?: number;
}

export function KasaScreen(props: { role: Role; settings: KasaSettings; simulator: boolean }) {
  const mounted = useMounted();
  if (!mounted) {
    return <div className="flex flex-1 items-center justify-center text-xl text-slate-500">Kasa yükleniyor…</div>;
  }
  return <Kasa {...props} />;
}

function initCart(): CartState {
  return parseStoredCart(loadJson(CART_KEY)) ?? emptyCart(uuidv4());
}

function trLower(s: string) {
  return s.toLocaleLowerCase("tr");
}

function Kasa({ role, settings, simulator }: { role: Role; settings: KasaSettings; simulator: boolean }) {
  const catalog = useCatalog();
  const [cart, dispatch] = useReducer(cartReducer, undefined, initCart);
  const totals = cartTotals(cart);
  const [message, setMessage] = useState<Message>(null);
  const [input, setInput] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [payMode, setPayMode] = useState<"cash" | "card" | null>(null);
  const [success, setSuccess] = useState<SaleResponse | null>(null);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(cart.discount?.type ?? "amount");
  const [discountText, setDiscountText] = useState(() =>
    cart.discount ? (cart.discount.type === "amount" ? formatTRY(cart.discount.value).replace("₺", "") : String(cart.discount.value)) : "",
  );
  const [discountInputError, setDiscountInputError] = useState<string | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef(new Map<number, HTMLInputElement>());
  const canDiscount = role === "owner" || settings.cashierCanDiscount;

  const scannerConfig = useMemo(
    () => ({
      maxIntervalMs: settings.scannerMaxIntervalMs,
      minLength: settings.scannerMinLength,
      dupWindowMs: settings.scannerDupWindowMs,
    }),
    [settings.scannerMaxIntervalMs, settings.scannerMinLength, settings.scannerDupWindowMs],
  );

  // Sepeti cihazda sakla (sayfa yenilense de kaybolmasın)
  useEffect(() => {
    saveJson(CART_KEY, cart);
  }, [cart]);

  // Katalog yenilenince sepetteki ad/fiyat/stok güncellenir
  useEffect(() => {
    if (catalog.loaded) dispatch({ type: "syncCatalog", byId: catalog.byId });
  }, [catalog.byId, catalog.loaded]);

  useEffect(() => unlockAudioOnFirstGesture(), []);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api<TodayStats>("/api/today-stats"));
    } catch {
      // köşe bilgisi; hata önemsiz
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refreshStats(), 0);
    const t = window.setInterval(() => void refreshStats(), STATS_REFRESH_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [refreshStats]);

  const focusBarcode = useCallback(() => {
    requestAnimationFrame(() => barcodeRef.current?.focus());
  }, []);

  const showMessage = useCallback((m: Omit<NonNullable<Message>, "key">) => {
    setMessage((prev) => ({ ...m, key: (prev?.key ?? 0) + 1 }));
  }, [setMessage]);

  const sound = useCallback(
    (ok: boolean) => {
      if (!settings.soundEnabled) return;
      if (ok) beepSuccess();
      else beepError();
    },
    [settings.soundEnabled],
  );

  const addProduct = useCallback(
    (product: CatalogItem, barcode: string | null) => {
      dispatch({ type: "add", product, barcode });
      const inCart = (cart.lines.find((l) => l.productId === product.id)?.qty ?? 0) + 1;
      sound(true);
      if (inCart > product.stockQty) {
        showMessage({ kind: "warn", text: `${product.name} eklendi — dikkat: stokta ${product.stockQty} adet görünüyor.` });
      } else {
        showMessage({ kind: "success", text: `${product.name} eklendi.` });
      }
    },
    [cart.lines, showMessage, sound],
  );

  const handleLookup = useCallback(
    (r: LookupResult) => {
      switch (r.status) {
        case "found":
          addProduct(r.product, r.barcode);
          break;
        case "inactive":
          sound(false);
          showMessage({ kind: "error", text: `Bu ürün satışa kapalı: ${r.product.name}` });
          break;
        case "invalid":
          sound(false);
          showMessage({
            kind: "error",
            text: r.reason === "empty" ? "Barkod boş okundu, tekrar okutun." : "Barkod hatalı okundu, tekrar okutun.",
          });
          break;
        case "not_found":
          sound(false);
          showMessage({ kind: "error", text: `Bilinmeyen barkod: ${r.code}`, unknownCode: r.code });
          break;
        case "error":
          sound(false);
          showMessage({ kind: "error", text: r.message });
          break;
      }
    },
    [addProduct, showMessage, sound],
  );

  const { lookupLocal, lookup } = catalog;
  const processCode = useCallback(
    async (raw: string) => {
      setSuccess(null);
      // Önce yerel (anında); bulunamazsa sunucuya sorulur.
      const local = lookupLocal(raw);
      handleLookup(local ?? (await lookup(raw)));
      focusBarcode();
    },
    [setSuccess, lookupLocal, lookup, handleLookup, focusBarcode],
  );

  const dialogOpen = payMode !== null || quickAdd !== null || confirmClear;

  useBarcodeScanner({
    enabled: !dialogOpen,
    config: scannerConfig,
    onScan: (code) => {
      setInput("");
      void processCode(code);
    },
    onDuplicate: () => showMessage({ kind: "info", text: "Okuyucu aynı barkodu iki kez gönderdi; tek sayıldı." }),
  });

  // Ürün adıyla arama (harf içeren girişte)
  const suggestions = useMemo(() => {
    const q = trLower(input.trim());
    if (q.length < 2 || /^\d+$/.test(q)) return [];
    return catalog.items.filter((i) => trLower(i.name).includes(q)).slice(0, 8);
  }, [input, catalog.items]);

  function submitInput() {
    const value = input.trim();
    if (!value) return;
    const exact = catalog.lookupLocal(value);
    if (exact?.status === "found" || suggestions.length === 0) {
      setInput("");
      void processCode(value);
      return;
    }
    const pick = suggestions[Math.min(highlight, suggestions.length - 1)]!;
    setInput("");
    setSuccess(null);
    addProduct(pick, null);
    focusBarcode();
  }

  function applyDiscount(type: "amount" | "percent", text: string) {
    setDiscountType(type);
    setDiscountText(text);
    const t = text.trim();
    if (t === "") {
      setDiscountInputError(null);
      dispatch({ type: "setDiscount", discount: null });
      return;
    }
    if (type === "amount") {
      const k = parseTRYToKurus(t);
      if (k === null) return setDiscountInputError("Tutarı 10 veya 10,50 gibi yazın.");
      setDiscountInputError(null);
      dispatch({ type: "setDiscount", discount: { type: "amount", value: k } });
    } else {
      if (!/^\d{1,3}$/.test(t) || Number(t) > 100) return setDiscountInputError("Yüzde 0–100 arası tam sayı olmalı.");
      setDiscountInputError(null);
      dispatch({ type: "setDiscount", discount: { type: "percent", value: Number(t) } });
    }
  }

  function resetDiscountInputs() {
    setDiscountText("");
    setDiscountInputError(null);
  }

  const canPay = cart.lines.length > 0 && !totals.discountError && !discountInputError;

  function openPayment(mode: "cash" | "card") {
    if (!canPay) {
      if (cart.lines.length === 0) showMessage({ kind: "info", text: "Sepet boş. Önce ürün okutun." });
      return;
    }
    setPayMode(mode);
  }

  function onSaleCompleted(r: SaleResponse) {
    setPayMode(null);
    setSuccess(r);
    dispatch({ type: "reset", clientRequestId: uuidv4() });
    resetDiscountInputs();
    setMessage(null);
    sound(true);
    void catalog.refresh();
    void refreshStats();
    focusBarcode();
  }

  // Klavye kısayolları
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (quickAdd !== null || confirmClear) return;
      const target = e.target as HTMLElement | null;
      const inText = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (success) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          setSuccess(null);
          focusBarcode();
        }
        return;
      }
      if (payMode) return; // ödeme penceresi kendi tuşlarını yönetir
      if (e.key === "F2") {
        e.preventDefault();
        const last = cart.lines.at(-1);
        const el = last && qtyRefs.current.get(last.productId);
        if (el) {
          el.focus();
          el.select();
        }
      } else if (e.key === "F8") {
        e.preventDefault();
        openPayment("cash");
      } else if (e.key === "F9") {
        e.preventDefault();
        openPayment("card");
      } else if (
        e.key === "Delete" &&
        cart.selectedId !== null &&
        (!inText || (target === barcodeRef.current && input === ""))
      ) {
        e.preventDefault();
        dispatch({ type: "remove", productId: cart.selectedId });
        focusBarcode();
      } else if (e.key === "Escape") {
        if (target === barcodeRef.current && input) {
          setInput("");
        } else if (cart.lines.length > 0) {
          e.preventDefault();
          setConfirmClear(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const msgStyles: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-900 border-emerald-300",
    error: "bg-red-100 text-red-900 border-red-400 animate-shake",
    warn: "bg-amber-100 text-amber-900 border-amber-300",
    info: "bg-sky-100 text-sky-900 border-sky-300",
  };

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        {/* Barkod / arama alanı */}
        <div className="relative">
          <label htmlFor="barcode-input" className="sr-only">
            Barkod okutun veya ürün adı yazın
          </label>
          <input
            id="barcode-input"
            ref={barcodeRef}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitInput();
              } else if (e.key === "ArrowDown" && suggestions.length) {
                e.preventDefault();
                setHighlight((h) => (h + 1) % suggestions.length);
              } else if (e.key === "ArrowUp" && suggestions.length) {
                e.preventDefault();
                setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
              }
            }}
            placeholder="Barkod okutun veya ürün adı yazın"
            className="h-16 w-full rounded-2xl border-4 border-slate-300 bg-white px-5 text-2xl font-semibold text-slate-900 outline-none focus:border-emerald-500"
            data-testid="barcode-input"
          />
          {suggestions.length > 0 && (
            <ul
              className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl"
              role="listbox"
              aria-label="Ürün önerileri"
            >
              {suggestions.map((s, i) => (
                <li key={s.id} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setInput("");
                      addProduct(s, null);
                      focusBarcode();
                    }}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-lg ${i === highlight ? "bg-emerald-100" : "hover:bg-slate-50"}`}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="tabular-nums">{formatTRY(s.salePriceKurus)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Mesaj */}
        <div className="min-h-14" aria-live="assertive">
          {message && (
            <div
              key={message.key}
              role={message.kind === "error" ? "alert" : "status"}
              className={`flex flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-3 text-lg font-semibold ${msgStyles[message.kind]}`}
              data-testid="scan-message"
            >
              <span className="flex-1">{message.text}</span>
              {message.unknownCode &&
                (role === "owner" ? (
                  <button
                    type="button"
                    onClick={() => setQuickAdd(message.unknownCode!)}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-base text-white"
                  >
                    Bu barkodla yeni ürün tanımla
                  </button>
                ) : (
                  <span className="text-base font-medium">Ürün tanımlı değil, yöneticiye bildirin.</span>
                ))}
            </div>
          )}
          {catalog.error && (
            <div role="alert" className="mt-2 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-2 text-red-900">
              {catalog.error}{" "}
              <button type="button" className="underline" onClick={() => void catalog.refresh()}>
                Tekrar dene
              </button>
            </div>
          )}
        </div>

        <CartTable
          cart={cart}
          loaded={catalog.loaded}
          qtyRefs={qtyRefs}
          onQty={(productId, qty) => dispatch({ type: "setQty", productId, qty })}
          onRemove={(productId) => {
            dispatch({ type: "remove", productId });
            focusBarcode();
          }}
          onSelect={(productId) => dispatch({ type: "select", productId })}
          onDone={focusBarcode}
        />

        <p className="hidden text-sm text-slate-500 lg:block">
          Kısayollar: <kbd className="kbd">F2</kbd> son satırın adedi · <kbd className="kbd">F8</kbd> nakit ·{" "}
          <kbd className="kbd">F9</kbd> kart · <kbd className="kbd">Delete</kbd> seçili satırı sil ·{" "}
          <kbd className="kbd">Esc</kbd> sepeti temizle
        </p>
      </section>

      {/* Sağ panel: toplamlar ve ödeme */}
      <aside className="flex w-full flex-col gap-3 border-t border-slate-200 bg-white p-3 lg:w-96 lg:border-t-0 lg:border-l">
        <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700" data-testid="today-stats">
          <span>Bugün</span>
          <span className="font-semibold">
            {stats ? `${stats.saleCount} satış` : "…"}
            {stats?.revenueKurus !== undefined && ` · ${formatTRY(stats.revenueKurus)}`}
          </span>
        </div>

        <dl className="space-y-1 text-lg">
          <div className="flex justify-between">
            <dt>Ürün adedi</dt>
            <dd className="tabular-nums">{totals.itemCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Ara toplam</dt>
            <dd className="tabular-nums" data-testid="subtotal">
              {formatTRY(totals.subtotalKurus)}
            </dd>
          </div>
          {totals.discountKurus > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>İndirim</dt>
              <dd className="tabular-nums">−{formatTRY(totals.discountKurus)}</dd>
            </div>
          )}
        </dl>

        {canDiscount && (
          <div>
            <label htmlFor="discount-input" className="text-sm font-medium text-slate-700">
              Sepet indirimi
            </label>
            <div className="mt-1 flex gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-300">
                {(["amount", "percent"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      applyDiscount(t, discountText);
                      focusBarcode();
                    }}
                    className={`px-3 py-2 text-base font-semibold ${discountType === t ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
                    aria-pressed={discountType === t}
                  >
                    {t === "amount" ? "₺" : "%"}
                  </button>
                ))}
              </div>
              <input
                id="discount-input"
                inputMode="decimal"
                autoComplete="off"
                value={discountText}
                onChange={(e) => applyDiscount(discountType, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && focusBarcode()}
                placeholder={discountType === "amount" ? "0,00" : "0"}
                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-lg"
                data-testid="discount-input"
              />
            </div>
            {(discountInputError || totals.discountError) && (
              <p className="mt-1 text-sm font-medium text-red-700">{discountInputError ?? totals.discountError}</p>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <div className="text-sm uppercase tracking-wide text-slate-300">Genel toplam</div>
          <div className="text-5xl font-extrabold tabular-nums" data-testid="grand-total">
            {formatTRY(totals.totalKurus)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => openPayment("cash")}
            disabled={!canPay}
            className="h-20 rounded-2xl bg-emerald-600 text-2xl font-extrabold text-white active:bg-emerald-700 disabled:bg-slate-300"
          >
            NAKİT
            <span className="block text-xs font-medium opacity-80">F8</span>
          </button>
          <button
            type="button"
            onClick={() => openPayment("card")}
            disabled={!canPay}
            className="h-20 rounded-2xl bg-sky-600 text-2xl font-extrabold text-white active:bg-sky-700 disabled:bg-slate-300"
          >
            KART
            <span className="block text-xs font-medium opacity-80">F9</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => cart.lines.length > 0 && setConfirmClear(true)}
          disabled={cart.lines.length === 0}
          className="h-12 rounded-xl border-2 border-slate-300 text-lg font-semibold text-slate-700 disabled:opacity-40"
        >
          Sepeti temizle (Esc)
        </button>
      </aside>

      {simulator && <SimulatorPanel items={catalog.items} focusBarcode={() => barcodeRef.current?.focus()} />}

      {payMode && (
        <PaymentDialog
          mode={payMode}
          cart={cart}
          totalKurus={totals.totalKurus}
          onClose={() => {
            setPayMode(null);
            focusBarcode();
          }}
          onSwitch={setPayMode}
          onCompleted={onSaleCompleted}
          onStockProblem={() => void catalog.refresh()}
        />
      )}

      {success && (
        <SuccessOverlay
          result={success}
          onClose={() => {
            setSuccess(null);
            focusBarcode();
          }}
        />
      )}

      {quickAdd !== null && (
        <QuickProductDialog
          barcode={quickAdd}
          onClose={() => {
            setQuickAdd(null);
            focusBarcode();
          }}
          onCreated={(item) => {
            catalog.upsert(item);
            setQuickAdd(null);
            addProduct(item, item.barcodes.includes(quickAdd) ? quickAdd : item.primaryBarcode);
            focusBarcode();
          }}
        />
      )}

      {confirmClear && (
        <Modal title="Sepet temizlensin mi?" onClose={() => setConfirmClear(false)}>
          <p className="text-lg text-slate-700">Sepetteki {totals.itemCount} ürün silinecek.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmClear(false);
                focusBarcode();
              }}
              className="h-14 rounded-xl border-2 border-slate-300 text-lg font-semibold"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "reset", clientRequestId: uuidv4() });
                resetDiscountInputs();
                setConfirmClear(false);
                setMessage(null);
                focusBarcode();
              }}
              className="h-14 rounded-xl bg-red-600 text-lg font-bold text-white"
            >
              Evet, temizle
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
