<div align="center">

<img src="../images/logo.png" width="96" alt="Logo do SRTR Pitwall" />

# SRTR Pitwall

### O parceiro completo para iRacing: overlays, spotter, estratégia, streaming e comunidade em um só app leve.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · **Português (BR)** · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Baixe a versão mais recente**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Overlays do SRTR Pitwall na pista" width="100%" />

## Por que o SRTR Pitwall?

A maioria dos apps para por aí, nos overlays. O SRTR Pitwall é um pit wall completo para o seu simulador:

- 🏎️ **26 overlays, uma única janela transparente**: relative, classificação, combustível, pneus, radar, mapa da pista, delta, inputs, clima, bandeiras e muito mais. Tudo é desenhado em uma só janela por monitor, então continua rápido mesmo com um layout lotado.
- 🎙️ **Spotter visual e por voz**: carro à esquerda / à direita, três lado a lado, bandeiras, combustível e posição com pacote de voz em turco, além de alertas de classe mais rápida e de retorno à pista.
- ⛽ **Estratégia de combustível com compartilhamento ao vivo na equipe**: consumo por volta, quantidade de reabastecimento, janelas de pit e o combustível dos seus colegas de equipe, ao vivo no seu próprio overlay.
- 👥 **Amigos com telemetria ao vivo confiável**: adicione amigos, veja quem está online ou correndo e deixe os pilotos em quem você confia verem seu combustível e suas voltas em tempo real. Sem códigos, sem configuração.
- 💬 **Mensagens durante a corrida**: mensagens dos amigos aparecem na tela com um som enquanto você corre. O modo Não perturbe deixa tudo em silêncio até você voltar para a garagem.
- 📺 **Layouts de stream para OBS**: layouts separados para transmissão, cenas prontas (começando em breve, já volto, encerramento, tela da garagem) e um overlay de chat da Twitch.
- 🌍 **Hub da comunidade**: compartilhe e baixe layouts completos, layouts de stream e temas de cores com todas as configurações incluídas. Avalie, comente e confira os destaques do mês e de todos os tempos.
- 📸 **Print com uma tecla**: o Print Screen captura o jogo *com* seus overlays e uma marca d'água, pronto para compartilhar na galeria da comunidade.
- 🎨 **Motor de temas**: fontes, cores, densidade, arredondamento dos cantos, opacidade e tamanho mudam todos os overlays de uma vez. Seis temas integrados, além dos temas da comunidade.
- 🧩 **Gerenciador de layouts**: layouts automáticos por carro e sessão, suporte a vários monitores, guias de encaixe e pré-visualização ao vivo sobre fundos reais de pista.
- 🔄 **Atualizações automáticas assinadas**: novas versões são instaladas com um clique e verificadas com a nossa chave de assinatura.
- 🌐 **15 idiomas**: English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="Painel de controle do SRTR Pitwall" width="100%" />

## Feito para desempenho

Sua GPU e sua CPU são do simulador. O SRTR Pitwall é escrito em **Rust**, com interface em **SolidJS** sobre **Tauri 2**:

- Toda a leitura e o cálculo da telemetria rodam em Rust, em uma única thread em segundo plano.
- Cada overlay recebe só os dados de que precisa, no seu próprio ritmo. Dados de overlays fechados nunca são calculados.
- A janela de overlays fica totalmente oculta quando o iRacing não está rodando.
- As pré-visualizações no painel de controle são imagens estáticas, então não usam CPU quando você não está mexendo nelas.
- Nada de efeitos de desfoque ou animações constantes: nada disputa a GPU com o jogo.

## Primeiros passos

1. Baixe o instalador em [**Releases**](../../../../releases/latest) e instale.
2. Rode o iRacing no modo **tela cheia sem bordas / janela**. O Windows não permite nenhum overlay sobre a tela cheia exclusiva.
3. Os overlays aparecem automaticamente quando o iRacing conecta. Use a chave **Demo** para montar seu layout sem o iRacing.

| Atalho | Ação |
|---|---|
| `Ctrl` + `Shift` + `E` | Editar layout (arrastar, redimensionar, clique direito para opções) |
| `Ctrl` + `Shift` + `D` | Mostrar / ocultar overlays |
| `Ctrl` + `Shift` + `Space` | Trazer o painel de controle para a frente |
| `Print Screen` | Print com overlays |

Todos os atalhos podem ser alterados em **Configurações → Atalhos**.

## Grátis e PRO

O SRTR Pitwall funciona por completo **sem conta**. Uma conta gratuita libera a comunidade, o backup das suas configurações na nuvem e a lista de amigos. O **PRO** adiciona overlays premium, o engenheiro por voz, o compartilhamento confiável de dados ao vivo e o envio de mensagens para amigos, o compartilhamento e uso de temas da comunidade, além de usar, avaliar e comentar layouts da comunidade.

## Comunidade

Feito por **Erkin Azcan** para a comunidade [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Encontrou um bug ou teve uma ideia? Abra uma [issue](../../../../issues).

---

<sub>Documentação para desenvolvedores (em turco): [docs/GELISTIRME.md](../GELISTIRME.md) · Notas de versão: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing é uma marca registrada da iRacing.com Motorsport Simulations, LLC. O SRTR Pitwall não é afiliado nem endossado pela iRacing.</sub>
