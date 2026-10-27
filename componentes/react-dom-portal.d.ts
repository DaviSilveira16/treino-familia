/** Tipagem mínima do portal web: não requer dependência adicional no projeto. */
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null,
  ): ReactPortal;
}
