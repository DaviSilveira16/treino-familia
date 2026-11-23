import { useEffect, type RefObject } from "react";
import { Platform } from "react-native";

/** Complementa o Modal nativo apenas na web, com retorno ao acionador. */
export function useFocoModalWeb(aberto: boolean, container: RefObject<unknown>, origem?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!aberto || Platform.OS !== "web") return;
    const anterior = origem?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const elementos = () => {
      const root = container.current as HTMLElement | null;
      return root?.querySelectorAll<HTMLElement>('button:not([disabled]),[role="button"]:not([aria-disabled="true"]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? [];
    };
    const frame = requestAnimationFrame(() => { const lista = Array.from(elementos()).filter(e => e.getClientRects().length); lista[0]?.focus(); });
    const limitar = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const lista = Array.from(elementos()).filter(el => el.getClientRects().length);
      const primeiro = lista[0], ultimo = lista[lista.length-1];
      if (!primeiro) return;
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown',limitar);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown',limitar); requestAnimationFrame(() => { if (anterior?.isConnected) anterior.focus(); }); };
  }, [aberto, container, origem]);
}
