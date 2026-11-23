export function estadoDaPendencia(conflito: boolean, erro?: string | null) {
  if (conflito) return { estado: "Conflito", acao: "Abra o módulo para revisar as duas versões preservadas." };
  if (erro && /conta|autentic|sessão|session|jwt|401/i.test(erro)) return { estado: "Autenticação necessária", acao: "Entre novamente na mesma conta." };
  if (erro && /permissao|permissão|403|42501/i.test(erro)) return { estado: "Permissão necessária", acao: "Confira o acesso à conta e ao arquivo antes de reenviar." };
  if (erro && /origem/i.test(erro)) return { estado: "Foto de origem indisponível", acao: "Confira a foto original no treino. O envio continua preservado." };
  if (erro && /fetch|network|conex|internet|offline|abort|timeout/i.test(erro)) return { estado: "Conexão indisponível", acao: "Restabeleça a conexão e tente novamente." };
  if (erro && /migração|schema|does not exist|PGRST20|42P01/i.test(erro)) return { estado: "Recurso indisponível", acao: "Confira se a atualização do aplicativo foi concluída ou entre em contato com o suporte." };
  if (erro) return { estado: "Envio não confirmado", acao: "Confira a conexão e tente novamente. O registro local está preservado." };
  return { estado: "Pendente", acao: "Aguardando confirmação do servidor." };
}
