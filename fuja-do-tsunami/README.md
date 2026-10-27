# 🌊 Fuja do Tsunami

Jogo de Roblox em que você corre pela praia coletando itens valiosos e precisa fugir dos desastres que vêm do mar.

## Como jogar

1. **Colete itens** espalhados pelas zonas. Quanto mais longe da base, mais valiosos:
   | Zona    | Raridade | Itens (valor)                                        |
   |---------|----------|------------------------------------------------------|
   | Praia   | Comum    | Concha (5), Estrela-do-mar (8), Garrafa com Mensagem (15) |
   | Dunas   | Raro     | Âmbar (20), Fóssil (30), Bússola Antiga (45)         |
   | Rochedo | Épico    | Cristal (60), Pepita de Ouro (90), Coroa Pirata (150) |
   | Recife  | Lendário | Pérola Negra (200), Tridente (350), Coração do Oceano (600) |
2. **Volte para a base** (atrás da muralha) para depositar os itens e ganhar moedas.
   Se o desastre te pegar, você **perde tudo o que estava carregando**.
3. **Fuja do desastre**: a cada ciclo aparece um aviso e uma onda vem do mar e varre o mapa.
   Entre em um **🛡 ABRIGO** (bunkers com farol verde) ou corra para a base.
   - Tsunami, Mega Tsunami (mais rápido), Onda de Lava e Avalanche de Lama.
   - Sobreviver a uma onda dá **+15 moedas** e conta no placar "Ondas".
4. **Compre melhorias** na loja (botão 🛒 LOJA ou o balcão na base):
   - **Velocidade**: corra mais rápido que a onda.
   - **Mochila**: carregue mais itens por viagem.

O progresso (moedas, ondas e melhorias) é salvo com DataStore.

## Estrutura

```
fuja-do-tsunami/
├── default.project.json        # projeto Rojo
└── src/
    ├── shared/Config.lua       # ReplicatedStorage.Shared — zonas, itens, desastres, melhorias
    ├── server/                 # ServerScriptService.Server
    │   ├── Main.server.lua     # loop do jogo, coleta, depósito, loja
    │   ├── MapBuilder.lua      # monta o mapa por código
    │   ├── ItemSpawner.lua     # gera os itens nas zonas
    │   ├── DisasterManager.lua # cria e move a onda
    │   ├── PlayerData.lua      # DataStore + leaderstats
    │   └── Util.lua
    └── client/HUD.client.lua   # StarterPlayerScripts — HUD, loja, notificações, efeitos
```

O mapa inteiro é gerado por script, então não precisa montar nada no Studio.

## Como rodar

### Jeito mais fácil: abrir o arquivo pronto

1. Baixe o arquivo [`FujaDoTsunami.rbxlx`](FujaDoTsunami.rbxlx) (no GitHub: abra o arquivo e clique em **Download raw file**).
2. Num PC ou Mac com o [Roblox Studio](https://create.roblox.com/) instalado, dê dois cliques no arquivo (ou **File > Open from File**).
3. Clique em **Play** para testar. Para jogar com amigos ou no celular, siga a seção "Jogar no celular" abaixo.

Se você mudar algo em `src/`, gere o arquivo de novo com `python3 tools/build_rbxlx.py`.

### Com Rojo

1. Instale o [Rojo](https://rojo.space/docs/v7/getting-started/installation/) e o plugin do Rojo no Roblox Studio.
2. Na pasta `fuja-do-tsunami`, rode:
   ```bash
   rojo serve
   ```
3. No Studio, abra um lugar vazio (ex.: *Baseplate*), clique em **Connect** no plugin do Rojo e depois em **Play**.

Ou gere um arquivo de lugar e abra direto no Studio:
```bash
rojo build -o FujaDoTsunami.rbxlx
```

### Sem Rojo (copiar e colar)

No Roblox Studio:
1. Em **ReplicatedStorage**, crie uma pasta `Shared` e dentro dela um **ModuleScript** `Config` com o conteúdo de `src/shared/Config.lua`.
2. Em **ServerScriptService**, crie uma pasta `Server` com:
   - um **Script** `Main` (conteúdo de `Main.server.lua`);
   - **ModuleScripts** `MapBuilder`, `ItemSpawner`, `DisasterManager`, `PlayerData` e `Util`.
3. Em **StarterPlayer > StarterPlayerScripts**, crie um **LocalScript** `HUD` com o conteúdo de `HUD.client.lua`.

### Jogar no celular

O Roblox Studio (onde o jogo é montado) só existe para **PC/Mac**, então não dá para criar ou editar o jogo pelo celular.
Mas depois de montado, dá para jogar no celular:
1. No Studio, use **File > Publish to Roblox** para publicar o jogo.
2. Em **Game Settings > Permissions**, deixe o jogo **Público** (ou só para você/amigos, se preferir).
3. Em **Game Settings > Basic Info > Devices**, marque **Phone** e **Tablet**.
4. Abra o app do Roblox no celular, vá em **Criações/Perfil** e entre no jogo.

A interface diminui sozinha em telas pequenas, e o painel fica no topo para não atrapalhar o joystick.
A loja também abre tocando no botão 🛒 ou no balcão da base.

### Salvar progresso no Studio

Para testar o DataStore no Studio, publique o jogo e ative
**Game Settings > Security > Enable Studio Access to API Services**.
Sem isso o jogo funciona normalmente, só não salva.

## Personalização

Tudo fica em `src/shared/Config.lua`: tamanho do mapa, posição dos abrigos, tempo entre ondas,
velocidade/altura de cada desastre, itens e valores de cada zona e preços das melhorias.
