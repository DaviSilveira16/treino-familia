import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { Familia } from "../servicos/familias";

export default function MinhasFamilias({ familias, ativaId, usuarioId, cor, bloqueado, criando, onSelecionar, onCriar }: {
  familias: Familia[]; ativaId: string | null; usuarioId: string; cor: string; bloqueado: boolean; criando: boolean;
  onSelecionar: (id: string) => void; onCriar: (nome: string) => Promise<boolean>;
}) {
  const [formulario, setFormulario] = useState(false), [nome, setNome] = useState("");
  const criar = async () => { if (await onCriar(nome)) { setNome(""); setFormulario(false); } };
  return <View style={s.cartao}>
    <Text style={s.titulo}>Minhas famílias{familias.length ? ` (${familias.length})` : ""}</Text>
    <Text style={s.ajuda}>Escolha com quem deseja compartilhar. Cada família tem seu próprio convite, painel e publicações.</Text>
    {familias.map(f => <TouchableOpacity key={f.id} accessibilityRole="button" accessibilityLabel={`Abrir família ${f.name}`} accessibilityState={{ selected: f.id === ativaId, disabled: bloqueado }} disabled={bloqueado} onPress={() => onSelecionar(f.id)} style={[s.opcao, f.id === ativaId && { borderColor: cor, backgroundColor: `${cor}18` }]}>
      <Text style={[s.nome, f.id === ativaId && { color: cor }]}>{f.id === ativaId ? "✓ " : ""}{f.name}</Text>
      <Text style={s.ajuda}>{f.owner_user_id === usuarioId ? "Criada por você" : "Você participa"}{f.id === ativaId ? " · selecionada" : ""}</Text>
    </TouchableOpacity>)}
    {formulario || !familias.length ? <View style={s.grupo}>
      <Text style={s.nome}>{familias.length ? "Criar outra família" : "Criar uma família"}</Text>
      <TextInput accessibilityLabel="Nome da nova família" value={nome} onChangeText={setNome} placeholder="Ex.: Família Silva, amigos da academia" placeholderTextColor="#758178" maxLength={70} editable={!bloqueado} style={s.input} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirmar criação de família" disabled={bloqueado || !nome.trim()} onPress={() => void criar()} style={[s.botao, { backgroundColor: cor, opacity: bloqueado || !nome.trim() ? 0.55 : 1 }]}>{criando ? <ActivityIndicator color="#0C120E" /> : <Text style={s.escuro}>Criar família</Text>}</TouchableOpacity>
      {familias.length ? <TouchableOpacity accessibilityRole="button" disabled={bloqueado} onPress={() => setFormulario(false)} style={s.botao}><Text style={s.nome}>Cancelar</Text></TouchableOpacity> : null}
    </View> : <TouchableOpacity accessibilityRole="button" accessibilityLabel="Criar outra família" disabled={bloqueado} onPress={() => setFormulario(true)} style={[s.botao, { borderWidth: 1, borderColor: cor }]}><Text style={{ color: cor, fontWeight: "800" }}>+ Criar outra família</Text></TouchableOpacity>}
  </View>;
}
const s = StyleSheet.create({ cartao: { backgroundColor: "#171D19", borderWidth: 1, borderColor: "#2C3730", borderRadius: 15, padding: 14, gap: 12 }, titulo: { color: "#F0F4F1", fontSize: 18, fontWeight: "800" }, ajuda: { color: "#A4ADA7", fontSize: 12, lineHeight: 19 }, nome: { color: "#E1E8E3", fontWeight: "800", fontSize: 14 }, grupo: { gap: 10 }, opcao: { borderWidth: 1, borderColor: "#354139", borderRadius: 10, padding: 12, minHeight: 48, gap: 4 }, input: { color: "#F0F4F1", backgroundColor: "#101312", borderWidth: 1, borderColor: "#45544A", borderRadius: 10, padding: 12 }, botao: { minHeight: 44, borderRadius: 10, padding: 12, justifyContent: "center", alignItems: "center" }, escuro: { color: "#101312", fontWeight: "800" } });
