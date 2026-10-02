<div align="center">

<img src="../images/logo.png" width="96" alt="Logo SRTR Pitwall" />

# SRTR Pitwall

### Le compagnon iRacing tout-en-un — overlays, spotter, stratégie, streaming et communauté dans une seule appli légère.

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Français** · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ Télécharger la dernière version**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Overlays SRTR Pitwall en piste" width="100%" />

## Pourquoi SRTR Pitwall ?

La plupart des applis d'overlays s'arrêtent aux overlays. SRTR Pitwall, c'est un muret des stands complet pour votre simu :

- 🏎️ **27 overlays, une seule fenêtre transparente** — relative, leaderboard, carburant, pneus, radar, carte du circuit, delta, inputs, météo, drapeaux et plus encore. Tout s'affiche dans une seule fenêtre par écran : ça reste fluide même avec un layout bien rempli.
- 🎙️ **Spotter visuel et vocal** — voiture à gauche / à droite, trois de front, annonces de drapeaux, de carburant et de position avec un pack vocal turc, plus des alertes de catégorie plus rapide et de retour en piste.
- ⛽ **Stratégie carburant partagée en direct avec l'équipe** — consommation par tour, quantités à ravitailler, fenêtres de stand, et le carburant de vos coéquipiers en direct dans votre propre overlay.
- 👥 **Des amis avec télémétrie en direct de confiance** — ajoutez des amis, voyez qui est en ligne ou en course, et laissez les pilotes en qui vous avez confiance voir votre carburant et vos tours en direct. Pas de code, pas de configuration.
- 💬 **Messagerie en course** — les messages de vos amis s'affichent à l'écran avec un son pendant que vous roulez. Le mode Ne pas déranger les garde en sourdine jusqu'à votre retour au garage.
- 📺 **Layouts de stream pour OBS** — des layouts dédiés au streaming, des scènes prêtes à l'emploi (ça commence bientôt, je reviens tout de suite, fin, écran garage) et un overlay du chat Twitch.
- 🌍 **Hub communautaire** — partagez et téléchargez des layouts complets, des layouts de stream et des thèmes de couleurs avec tous leurs réglages. Notez, commentez et parcourez les meilleurs choix du mois et de tous les temps.
- 📸 **Captures d'écran en une touche** — Impr. écran capture le jeu *avec* vos overlays et un filigrane, à partager ensuite dans la galerie de la communauté.
- 🎨 **Moteur de thèmes** — polices, couleurs, densité, arrondi des coins, opacité et taille modifient tous les overlays d'un coup. Six thèmes intégrés, plus ceux de la communauté.
- 🧩 **Gestionnaire de layouts** — layouts automatiques par voiture et par session, prise en charge multi-écran, guides d'alignement et aperçu en direct sur de vrais décors de circuits.
- 🔄 **Mises à jour automatiques signées** — les nouvelles versions s'installent en un clic, vérifiées avec notre clé de signature.
- 🌐 **15 langues** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="Panneau de contrôle SRTR Pitwall" width="100%" />

## Pensé pour la performance

Votre GPU et votre CPU appartiennent à la simu. SRTR Pitwall est écrit en **Rust** avec une interface **SolidJS** sur **Tauri 2** :

- Toute la lecture et le calcul de la télémétrie tournent en Rust sur un seul thread en arrière-plan.
- Chaque overlay ne reçoit que les données dont il a besoin, à son propre rythme. Les données des overlays fermés ne sont jamais calculées.
- La fenêtre des overlays est entièrement masquée quand iRacing ne tourne pas.
- Les aperçus du panneau de contrôle sont des captures statiques : ils ne consomment aucun CPU tant que vous n'interagissez pas.
- Ni effets de flou ni animations permanentes : rien ne dispute le GPU au jeu.

## Bien démarrer

1. Téléchargez l'installateur depuis [**Releases**](../../../../releases/latest) et installez-le.
2. Lancez iRacing en mode **sans bordure / plein écran fenêtré**. Windows n'autorise aucun overlay par-dessus le plein écran exclusif.
3. Les overlays apparaissent automatiquement dès qu'iRacing se connecte. Utilisez l'interrupteur **Démo** pour concevoir votre layout sans iRacing.

| Raccourci | Action |
|---|---|
| `Ctrl` + `Shift` + `E` | Modifier le layout (glisser, redimensionner, clic droit pour les options) |
| `Ctrl` + `Shift` + `D` | Afficher / masquer les overlays |
| `Ctrl` + `Shift` + `Space` | Mettre le panneau de contrôle au premier plan |
| `Print Screen` | Capture d'écran avec overlays |

Tous les raccourcis sont modifiables dans **Paramètres → Raccourcis**.

## Gratuit et PRO

SRTR Pitwall fonctionne pleinement **sans compte**. Un compte gratuit débloque la communauté, la sauvegarde cloud de vos réglages et la liste d'amis. **PRO** ajoute les overlays premium, l'ingénieur vocal, le partage de données en direct de confiance et l'envoi de messages aux amis, le partage et l'utilisation des thèmes de la communauté, ainsi que l'utilisation, la notation et les commentaires des layouts de la communauté.

## Communauté

Créé par **Erkin Azcan** pour la communauté [Sim Race Türkiye](https://www.simracetr.com).

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Un bug à signaler ou une idée ? Ouvrez une [issue](../../../../issues).

---

<sub>Documentation développeur (en turc) : [docs/GELISTIRME.md](../GELISTIRME.md) · Notes de version : [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing est une marque commerciale d'iRacing.com Motorsport Simulations, LLC. SRTR Pitwall n'est ni affilié à iRacing ni approuvé par iRacing.</sub>
