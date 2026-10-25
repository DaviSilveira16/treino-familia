import { useEffect, useRef } from "react";
const modais: { id: symbol; fechar: () => void }[] = [];
export function fecharModalAtivo(): boolean {
  const modal = modais[modais.length - 1];
  if (!modal) return false;
  modal.fechar();
  return true;
}
/** Registers an explicit close action, instead of guessing DOM labels or Escape support. */
export function useVoltarDoModal(ativo: boolean, fechar: () => void) {
  const atual = useRef(fechar);
  useEffect(() => { atual.current = fechar; }, [fechar]);
  useEffect(() => {
    if (!ativo) return;
    const registro = { id: Symbol(), fechar: () => atual.current() };
    modais.push(registro);
    return () => { const indice = modais.findIndex(item => item.id === registro.id); if (indice !== -1) modais.splice(indice, 1); };
  }, [ativo]);
}
