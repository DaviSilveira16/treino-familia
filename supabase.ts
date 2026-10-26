import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { registrarTempo } from "./servicos/performance";
import { noAndroidWrapper } from "./servicos/ambienteAndroid";
import { requisicaoComPrazo } from "./servicos/requisicaoComPrazo";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  global: {
    // Mantém o fetch nativo; registra apenas latência e rótulo da tabela.
    // Não guarda corpos, URLs completas, parâmetros, credenciais nem IDs.
    fetch: async (input, init) => {
      const inicio = Date.now();
      let rotulo = "supabase.outro";
      try {
        const endereco =
          typeof input === "string"
            ? input
            : "url" in input
              ? input.url
              : String(input);
        const caminho = new URL(endereco).pathname;
        const tabela = caminho.match(
          /\/(?:rest\/v1|rpc)\/([a-z_]{1,35})(?:\/|$)/i,
        )?.[1];
        if (tabela) rotulo = `supabase.${tabela}`;
        else if (caminho.includes("/auth/")) rotulo = "supabase.auth";
        else if (caminho.includes("/storage/")) rotulo = "supabase.storage";
      } catch {
        /* O monitoramento nunca deve impedir uma solicitação. */
      }
      try {
        // Uploads de fotos podem levar mais tempo numa rede móvel.
        const resposta = rotulo === "supabase.storage"
          ? await fetch(input, init)
          : await requisicaoComPrazo(input, init);
        registrarTempo(rotulo, inicio, !resposta.ok);
        return resposta;
      } catch (erro) {
        registrarTempo(rotulo, inicio, true);
        throw erro;
      }
    },
  },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    flowType: noAndroidWrapper() ? "pkce" : "implicit",
    detectSessionInUrl: Platform.OS === "web" && !noAndroidWrapper()
      && !(typeof location !== "undefined" && location.pathname === "/auth/android/callback"),
  },
});
