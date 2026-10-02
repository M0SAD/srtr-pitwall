<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall ロゴ" />

# SRTR Pitwall

### iRacing のすべてをひとつに — オーバーレイ、スポッター、ストラテジー、配信、コミュニティをひとつの軽量アプリで。

[English](../../README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · **日本語**

[**⬇ 最新版をダウンロード**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="コース上の SRTR Pitwall オーバーレイ" width="100%" />

## なぜ SRTR Pitwall なのか？

ほとんどのオーバーレイアプリは、オーバーレイだけで終わります。SRTR Pitwall は、あなたのシムリグのための本格的なピットウォールです：

- 🏎️ **27 種類のオーバーレイを、ひとつの透明ウィンドウで** — リレーティブ、リーダーボード、燃料、タイヤ、レーダー、トラックマップ、デルタ、入力、天候、フラッグなど。モニターごとに 1 つのウィンドウですべてを描画するため、フルレイアウトでも軽快に動作します。
- 🎙️ **ビジュアル＆音声スポッター** — 左に車 / 右に車、スリーワイド、フラッグ、燃料や順位のコールをトルコ語ボイスパックでお届け。さらに上位クラス接近やコース復帰時の警告も。
- ⛽ **チームでリアルタイム共有できる燃料ストラテジー** — 周回ごとの消費量、給油量、ピットウィンドウ、そしてチームメイトの燃料状況まで自分のオーバーレイにライブ表示。
- 👥 **フレンド＆信頼できる相手とのライブテレメトリー** — フレンドを追加して、誰がオンラインか・レース中かをチェック。信頼するドライバーには自分の燃料やラップデータをリアルタイムで公開できます。コードも設定も不要です。
- 💬 **レース中メッセージ** — 走行中、フレンドからのメッセージがサウンドとともに画面に表示されます。おやすみモードなら、ガレージに戻るまで通知を控えます。
- 📺 **OBS 向け配信レイアウト** — 配信専用のレイアウト、すぐに使えるシーン（まもなく開始、すぐ戻ります、エンディング、ガレージカバー）、Twitch チャットのオーバーレイ。
- 🌍 **コミュニティハブ** — すべての設定を含むレイアウト、配信レイアウト、カラーテーマを共有・ダウンロード。評価やコメントをしたり、今月と歴代の人気ピックをチェックしたりできます。
- 📸 **ワンキーでスクリーンショット** — Print Screen でオーバーレイ*込み*のゲーム画面をウォーターマーク付きで撮影し、そのままコミュニティギャラリーで共有。
- 🎨 **テーマエンジン** — フォント、カラー、密度、角の丸み、不透明度、サイズを全オーバーレイに一括反映。6 種類の内蔵テーマに加え、コミュニティのテーマも使えます。
- 🧩 **レイアウトマネージャー** — 車種・セッションごとの自動レイアウト切り替え、マルチモニター対応、スナップガイド、実際のコース背景でのライブプレビュー。
- 🔄 **署名付き自動アップデート** — 新バージョンはワンクリックでインストール。署名鍵で検証済みです。
- 🌐 **15 言語対応** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語。

<img src="../images/panel.jpg" alt="SRTR Pitwall コントロールパネル" width="100%" />

## パフォーマンス重視の設計

GPU と CPU はシムのためのもの。SRTR Pitwall は **Rust** で書かれ、**Tauri 2** 上の **SolidJS** インターフェースで動作します：

- テレメトリーの読み取りと計算は、すべて Rust の単一バックグラウンドスレッドで実行。
- 各オーバーレイは必要なデータだけを、それぞれのレートで受け取ります。閉じているオーバーレイのデータは一切計算されません。
- iRacing が起動していないときは、オーバーレイウィンドウを完全に非表示に。
- コントロールパネルのプレビューは静的スナップショットなので、操作していないときは CPU を使いません。
- ぼかし効果や常時アニメーションはなし。ゲームと GPU を奪い合うものは何もありません。

## はじめに

1. [**Releases**](../../../../releases/latest) からインストーラーをダウンロードしてインストールします。
2. iRacing を **ボーダーレス / ウィンドウ化フルスクリーン** モードで起動します。Windows では、排他フルスクリーンの上にオーバーレイを表示できません。
3. iRacing に接続すると、オーバーレイが自動で表示されます。**Demo** スイッチを使えば、iRacing なしでレイアウトを作成できます。

| ショートカット | 操作 |
|---|---|
| `Ctrl` + `Shift` + `E` | レイアウト編集（ドラッグ、サイズ変更、右クリックでオプション） |
| `Ctrl` + `Shift` + `D` | オーバーレイの表示 / 非表示 |
| `Ctrl` + `Shift` + `Space` | コントロールパネルを最前面に表示 |
| `Print Screen` | オーバーレイ込みでスクリーンショット |

すべてのショートカットは **設定 → ショートカット** で変更できます。

## 無料版と PRO

SRTR Pitwall は **アカウントなし** ですべての機能が使えます。無料アカウントを作成すると、コミュニティ、設定のクラウドバックアップ、フレンドリストが利用可能に。**PRO** では、プレミアムオーバーレイ、ボイスエンジニア、信頼できる相手とのライブデータ共有とフレンドへのメッセージ送信、コミュニティテーマの共有と利用、さらにコミュニティレイアウトの利用・評価・コメントが追加されます。

## コミュニティ

[Sim Race Türkiye](https://www.simracetr.com) コミュニティのために **Erkin Azcan** が開発しました。

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

バグを見つけた、またはアイデアがある？ [issue](../../../../issues) を作成してください。

---

<sub>開発者向けドキュメント（トルコ語）：[docs/GELISTIRME.md](../GELISTIRME.md) · リリースノート：[SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing は iRacing.com Motorsport Simulations, LLC の商標です。SRTR Pitwall は iRacing と提携しておらず、iRacing による承認も受けていません。</sub>
