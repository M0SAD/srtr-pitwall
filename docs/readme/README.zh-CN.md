<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall 标志" />

# SRTR Pitwall

### 一站式 iRacing 助手——叠加层、车位提示、策略、直播与社区，尽在一款轻量应用。

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · **简体中文** · [日本語](README.ja.md)

[**⬇ 下载最新版本**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="赛道上的 SRTR Pitwall 叠加层" width="100%" />

## 为什么选择 SRTR Pitwall？

大多数叠加层软件止步于叠加层。SRTR Pitwall 则是为你的模拟器座舱打造的完整维修墙：

- 🏎️ **26 个叠加层，一个透明窗口**——相对位置、排行榜、燃油、轮胎、雷达、赛道地图、圈速差、踏板输入、天气、旗语等等。每台显示器只用一个窗口绘制全部内容，即使布局满载也依然流畅。
- 🎙️ **视觉 + 语音车位提示**——左侧有车 / 右侧有车、三车并排、旗语、燃油与名次播报，配备土耳其语语音包，另有更快组别来车与重回赛道警告。
- ⛽ **燃油策略 + 车队实时共享**——每圈油耗、加油量、进站窗口，队友的燃油数据也实时显示在你自己的叠加层中。
- 👥 **好友与可信实时遥测**——添加好友，查看谁在线或正在比赛，并让你信任的车手看到你的实时燃油和圈速数据。无需代码，无需设置。
- 💬 **赛中消息**——比赛时，好友消息会带着提示音在屏幕上弹出。开启勿扰模式后，消息会静候你回到车库再显示。
- 📺 **OBS 直播布局**——独立的直播布局、现成场景（即将开始、马上回来、结束、车库遮罩）以及 Twitch 聊天叠加层。
- 🌍 **社区中心**——分享和下载包含全部设置的完整布局、直播布局和配色主题。评分、评论，浏览本月及历史热门精选。
- 📸 **一键截图**——按下 Print Screen，即可截下*带有*叠加层和水印的游戏画面，并分享到社区画廊。
- 🎨 **主题引擎**——字体、颜色、密度、圆角、透明度和尺寸一键作用于所有叠加层。内置六款主题，另有社区主题可选。
- 🧩 **布局管理器**——按车辆和赛段自动切换布局，支持多显示器、吸附参考线，并可在真实赛道背景上实时预览。
- 🔄 **签名自动更新**——一键安装新版本，并通过我们的签名密钥校验。
- 🌐 **15 种语言**——English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語。

<img src="../images/panel.jpg" alt="SRTR Pitwall 控制面板" width="100%" />

## 为性能而生

你的 GPU 和 CPU 应该留给模拟器。SRTR Pitwall 使用 **Rust** 编写，界面基于 **SolidJS**，运行于 **Tauri 2**：

- 所有遥测读取和计算都在 Rust 的单个后台线程中完成。
- 每个叠加层只接收自己需要的数据，并按各自的频率更新。已关闭的叠加层数据根本不会被计算。
- iRacing 未运行时，叠加层窗口完全隐藏。
- 控制面板中的预览为静态快照，不操作时不占用任何 CPU。
- 没有模糊特效，也没有持续动画：不与游戏争抢 GPU。

## 快速上手

1. 从 [**Releases**](../../../../releases/latest) 下载安装程序并完成安装。
2. 以 **无边框 / 窗口化全屏** 模式运行 iRacing。Windows 不允许任何叠加层显示在独占全屏之上。
3. iRacing 连接后，叠加层会自动出现。打开 **Demo** 开关，无需 iRacing 也能设计布局。

| 快捷键 | 功能 |
|---|---|
| `Ctrl` + `Shift` + `E` | 编辑布局（拖动、调整大小、右键打开选项） |
| `Ctrl` + `Shift` + `D` | 显示 / 隐藏叠加层 |
| `Ctrl` + `Shift` + `Space` | 将控制面板置于最前 |
| `Print Screen` | 带叠加层截图 |

所有快捷键均可在 **设置 → 快捷键** 中修改。

## 免费版与 PRO

SRTR Pitwall **无需账号** 即可完整使用。免费账号可解锁社区、设置云备份和好友列表。**PRO** 额外提供高级叠加层、语音工程师、可信实时数据共享与向好友发送消息、分享和使用社区主题，以及使用、评分和评论社区布局。

## 社区

由 **Erkin Azcan** 为 [Sim Race Türkiye](https://www.simracetr.com) 社区打造。

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

发现 bug 或有好点子？欢迎提交 [issue](../../../../issues)。

---

<sub>开发者文档（土耳其语）：[docs/GELISTIRME.md](../GELISTIRME.md) · 版本说明：[SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing 是 iRacing.com Motorsport Simulations, LLC 的商标。SRTR Pitwall 与 iRacing 无关联，亦未获其认可。</sub>
