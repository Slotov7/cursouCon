# Destino externo persistente

## Contexto

O espaço de estudos mantém o banco ativo local e publica somente revisões
portáteis. Escolher a mesma pasta em toda publicação era repetitivo, mas salvar
essa preferência dentro do espaço faria um caminho de máquina parecer parte do
conteúdo transportável.

## Decisão

Salvar a configuração em `appDataDir/sync-destinations.json`, indexada pelo
`workspace_id`, usando escrita atômica e o mesmo arquivo `.bak` de recuperação dos
ponteiros locais. A configuração começa desativada. Ativá-la exige uma pasta
existente, regular, absoluta e fora do espaço ativo; o Rust normaliza e valida o
caminho novamente.

O comando de publicação configurada só aceita uma configuração ativa e continua
criando primeiro uma revisão local consistente. A cópia externa é publicada em
uma pasta temporária e renomeada somente depois da validação. Desativar apenas
impede novas publicações configuradas, preserva a revisão local e não tenta
remover arquivos que um cliente externo já transportou.

## Consequências

A preferência não acompanha o pacote portátil e precisa ser configurada de novo
em outro computador. O aplicativo continua sem conta, servidor próprio, upload
automático ou afirmação de que o cliente externo concluiu a sincronização.
