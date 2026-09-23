# Revisões portáteis e espaços recentes

## Contexto

O banco ativo fica fora da pasta portátil para reduzir risco de corrupção durante
o uso. Para levar um espaço a outro computador, a pasta precisa conter uma
versão consistente do banco e referências verificáveis aos anexos. Também era
necessário trocar de espaço sem deixar uma sessão ativa associada ao banco
anterior.

## Decisão

Preparar uma revisão cria `revisions/<id>/` com `revision.json` e um snapshot
SQLite. O manifesto registra a versão, o hash do banco e cada blob referenciado
com caminho relativo e SHA-256, além do identificador da revisão pai. A abertura
de um espaço sem banco local procura a revisão portátil válida mais recente,
valida o snapshot e recupera o banco no armazenamento local antes de abrir o
espaço. Se duas revisões forem descendentes do mesmo pai, a recuperação automática
é interrompida e os pacotes são preservados.

Os oito espaços mais recentes são mantidos em `appDataDir`, fora do espaço
portátil. A troca verifica o banco atual e recusa a operação se houver sessão
ativa, evitando misturar registros entre espaços.

A publicação externa cria uma nova pasta portátil com manifesto, blobs, revisões
e exports. O banco ativo continua fora dessa pasta; o cliente externo escolhido
pelo usuário é responsável por transportar os arquivos. O destino pode ser salvo
explicitamente por espaço em `appDataDir`, fora do pacote portátil, mas a
publicação continua sendo uma ação do usuário.

## Consequências

Revisões antigas permanecem no espaço até uma política de retenção ser criada.
Conflitos não são mesclados automaticamente; a interface oferece a escolha
explícita de uma revisão preservada. A configuração do destino não é transportada
para outro computador: nesse caso a publicação permanece desativada até nova
configuração explícita. Desativar preserva a cópia local e não remove arquivos
que já tenham sido transportados pelo cliente externo.
