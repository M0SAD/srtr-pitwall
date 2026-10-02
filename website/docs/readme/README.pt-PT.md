<div align="center">

<img src="../images/logo.png" width="96" alt="Logótipo do SRTR Pitwall" />

# SRTR Pitwall

### O companheiro completo para o iRacing: overlays, spotter, estratégia, streaming e comunidade numa única aplicação leve.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · **Português (PT)** · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Transferir a versão mais recente**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Overlays do SRTR Pitwall em pista" width="100%" />

## Porquê o SRTR Pitwall?

A maioria das aplicações fica-se pelos overlays. O SRTR Pitwall é um verdadeiro muro das boxes para o seu simulador:

- 🏎️ **27 overlays, uma única janela transparente**: relative, classificação, combustível, pneus, radar, mapa do circuito, delta, comandos, meteorologia, bandeiras e muito mais. Tudo é desenhado numa só janela por monitor, por isso mantém-se rápido mesmo com um layout completo.
- 🎙️ **Spotter visual e por voz**: carro à esquerda / à direita, três lado a lado, bandeiras, combustível e posição com um pacote de voz em turco, além de avisos de classe mais rápida e de regresso à pista.
- ⛽ **Estratégia de combustível com partilha em direto na equipa**: consumo por volta, quantidades de reabastecimento, janelas de paragem e o combustível dos seus colegas de equipa, em direto no seu próprio overlay.
- 👥 **Amigos com telemetria em direto de confiança**: adicione amigos, veja quem está online ou em corrida e deixe os pilotos em quem confia ver o seu combustível e as suas voltas em tempo real. Sem códigos, sem configurações.
- 💬 **Mensagens durante a corrida**: as mensagens dos amigos surgem no ecrã com um som enquanto corre. O modo Não incomodar mantém-nas em silêncio até voltar à garagem.
- 📺 **Layouts de stream para OBS**: layouts próprios para transmissão, cenas prontas a usar (a começar em breve, volto já, fim, ecrã da garagem) e um overlay do chat da Twitch.
- 🌍 **Hub da comunidade**: partilhe e transfira layouts completos, layouts de stream e temas de cores com todas as definições incluídas. Avalie, comente e explore os destaques do mês e de sempre.
- 📸 **Capturas de ecrã com uma tecla**: o Print Screen captura o jogo *com* os seus overlays e uma marca de água, pronto a partilhar na galeria da comunidade.
- 🎨 **Motor de temas**: tipos de letra, cores, densidade, arredondamento dos cantos, opacidade e tamanho alteram todos os overlays de uma só vez. Seis temas incluídos, além dos temas da comunidade.
- 🧩 **Gestor de layouts**: layouts automáticos por carro e sessão, suporte multimonitor, guias de alinhamento e pré-visualização em direto sobre fundos reais de circuito.
- 🔄 **Atualizações automáticas assinadas**: as novas versões instalam-se com um clique e são verificadas com a nossa chave de assinatura.
- 🌐 **15 idiomas**: English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="Painel de controlo do SRTR Pitwall" width="100%" />

## Feito para o desempenho

A sua GPU e o seu CPU pertencem ao simulador. O SRTR Pitwall é escrito em **Rust**, com uma interface em **SolidJS** sobre **Tauri 2**:

- Toda a leitura e cálculo da telemetria corre em Rust, numa única thread em segundo plano.
- Cada overlay recebe apenas os dados de que precisa, ao seu próprio ritmo. Os dados de overlays fechados nunca são calculados.
- A janela dos overlays fica totalmente oculta quando o iRacing não está em execução.
- As pré-visualizações no painel de controlo são imagens estáticas, por isso não gastam CPU quando não está a interagir.
- Sem efeitos de desfocagem nem animações constantes: nada disputa a GPU com o jogo.

## Primeiros passos

1. Transfira o instalador em [**Releases**](../../../../releases/latest) e instale-o.
2. Execute o iRacing em modo **ecrã inteiro sem margens / janela**. O Windows não permite qualquer overlay sobre o ecrã inteiro exclusivo.
3. Os overlays aparecem automaticamente quando o iRacing se liga. Use o interruptor **Demo** para criar o seu layout sem o iRacing.

| Atalho | Ação |
|---|---|
| `Ctrl` + `Shift` + `E` | Editar layout (arrastar, redimensionar, clique direito para opções) |
| `Ctrl` + `Shift` + `D` | Mostrar / ocultar overlays |
| `Ctrl` + `Shift` + `Space` | Trazer o painel de controlo para a frente |
| `Print Screen` | Captura de ecrã com overlays |

Todos os atalhos podem ser alterados em **Definições → Atalhos**.

## Gratuito e PRO

O SRTR Pitwall funciona na íntegra **sem conta**. Uma conta gratuita desbloqueia a comunidade, a cópia de segurança das suas definições na nuvem e a lista de amigos. O **PRO** acrescenta overlays premium, o engenheiro por voz, a partilha de dados em direto de confiança e o envio de mensagens a amigos, a partilha e utilização de temas da comunidade, bem como utilizar, avaliar e comentar layouts da comunidade.

## Comunidade

Criado por **Erkin Azcan** para a comunidade [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Encontrou um erro ou tem uma ideia? Abra uma [issue](../../../../issues).

---

<sub>Documentação para programadores (em turco): [docs/GELISTIRME.md](../GELISTIRME.md) · Notas de versão: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing é uma marca registada da iRacing.com Motorsport Simulations, LLC. O SRTR Pitwall não é afiliado nem aprovado pela iRacing.</sub>
