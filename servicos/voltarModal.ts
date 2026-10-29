import { useEffect, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";
const modais: { id: symbol; fechar: () => void }[] = [];
export function temRetornoInternoAtivo(): boolean {
  return modais.length > 0;
}
export function fecharModalAtivo(): boolean {
  const modal = modais[modais.length - 1];
  if (!modal) return false;
  modal.fechar();
  return true;
}
/** Registers an explicit close action, instead of guessing DOM labels or Escape support. */
export function useVoltarDoModal(ativo: boolean, fechar: () => void) {
  const emFoco = useIsFocused();
  const atual = useRef(fechar);
  useEffect(() => { atual.current = fechar; }, [fechar]);
  useEffect(() => {
    // Telas anteriores continuam montadas na pilha. Seus painéis não podem
    // consumir o gesto nem o retorno automático da tela de treino atual.
    if (!ativo || !emFoco) return;
    const registro = { id: Symbol(), fechar: () => atual.current() };
    modais.push(registro);
    return () => { const indice = modais.findIndex(item => item.id === registro.id); if (indice !== -1) modais.splice(indice, 1); };
  }, [ativo, emFoco]);
}
