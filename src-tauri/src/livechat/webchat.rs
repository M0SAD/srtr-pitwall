//! Sohbete yazma, "Tarayıcı girişi" yöntemi (varsayılan): geliştirici uygulaması, yönetici ayarı ve sunucu işlevi GEREKMEZ.
//!
//! Her platform için program içinde ayrı bir tarayıcı penceresi (`chatweb-twitch` / `chatweb-youtube` / `chatweb-kick`)
//! açılır. Pencerenin kendi kalıcı profil klasörü vardır (`<app_local_data>/chatweb/<platform>`): kullanıcı platformun
//! KENDİ giriş sayfasında bir kez giriş yapar, oturum çerezi o klasörde kalır. Program şifreyi, çerezleri ve oturum
//! anahtarını hiç görmez / okumaz / günlüğe yazmaz (yalnızca "oturum çerezi var mı" diye ADINA bakılır).
//!
//! Mesaj gönderme: pencere platformun açılır sohbet (pop-out chat) sayfasındadır; Rust `WebviewWindow::eval` ile küçük
//! bir betik çalıştırır. Betik sohbet kutusunu bulur (platform başına birkaç yedek seçici), metni sayfanın
//! düzenleyicisiyle uyumlu şekilde yazar (execCommand insertText → paste olayı → beforeinput/input) ve gönderir
//! (gönder düğmesi / Enter), sonra kutunun boşaldığını denetler.
//!
//! SONUÇ NASIL OKUNUR (uzak sayfaya IPC izni VERİLMEZ): bu pencereler `capabilities/default.json` içinde yoktur, yani
//! uzak sayfa hiçbir Tauri komutu çağıramaz. Betik sonucu `document.title = "PWCHAT1:" + JSON` yazarak bildirir;
//! Rust tarafında `WebviewWindowBuilder::on_document_title_changed` (WebView2 DocumentTitleChanged) bu başlığı yakalar,
//! istek kimliğine (`id`, rastgele) göre sonuç tablosuna koyar. Betik 80 ms sonra eski başlığı geri yazar.
//! Sonuçta mesaj metni yoktur (yalnız uzunluk), çerez / anahtar yoktur.
//!
//! Pencere yaşam döngüsü: "Giriş penceresini aç" → görünür (kullanıcı giriş / captcha / 2FA'yı kendisi yapar);
//! "Pencereyi gizle" → gizli + görev çubuğunda yok, arka planda yaşar. Sohbet çalışırken ve platform açıkken gizli
//! pencere önceden hazırlanır; sohbet durunca gizli pencereler kapatılır. "Çıkış yap" profil klasörünü siler.
//! Pencereler async görevlerden oluşturulur (WebView2: ana iş parçacığındaki senkron komuttan pencere açmak kilitler).
//!
//! Site düzeni değişirse düzeltilecek tek yer: aşağıdaki `site()` (adres kalıpları) ve `selectors()` (seçiciler).

use super::model::{now_ms, ChannelStatus, Platform, State};
use super::send::{self, dlog, pkey, step, SendStatus, TestStep, FEATURE};
use super::{allowed, secrets, Hub};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const PLATFORMS: [Platform; 3] = [Platform::Twitch, Platform::Youtube, Platform::Kick];
/// Aynı platforma iki mesaj arasındaki en kısa süre
const MIN_GAP_MS: u64 = 1500;
const TITLE_PREFIX: &str = "PWCHAT1:";

// ---------------------------------------------------------------------------
// Adres kalıpları ve seçiciler (site değişirse SADECE burası düzeltilir)
// ---------------------------------------------------------------------------

pub struct Site {
    /// Açılır sohbet sayfası; `{channel}` (Twitch / Kick kanal adı) ya da `{video}` (YouTube video kimliği)
    pub chat: &'static str,
    /// Platformun kendi giriş sayfası
    pub login: &'static str,
    /// Giriş yapılmışken, yazılacak canlı kanal yokken gösterilen sayfa
    pub home: &'static str,
    /// En uzun mesaj (karakter)
    pub max_len: usize,
}

pub fn site(p: Platform) -> Site {
    match p {
        Platform::Twitch => Site { chat: "https://www.twitch.tv/popout/{channel}/chat", login: "https://www.twitch.tv/login", home: "https://www.twitch.tv/settings/profile", max_len: 500 },
        Platform::Youtube => Site {
            chat: "https://www.youtube.com/live_chat?is_popout=1&v={video}",
            login: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Faccount",
            home: "https://www.youtube.com/account",
            max_len: 200,
        },
        // Kick'in eski düzeni: https://kick.com/{channel}/chatroom
        _ => Site { chat: "https://kick.com/popout/{channel}/chat", login: "https://kick.com/login", home: "https://kick.com/settings/profile", max_len: 500 },
    }
}

/// Betiğe verilen platform uyarlayıcısı (JSON). Listeler sırayla denenir; ilk eşleşen kullanılır.
///  host: sayfa bu alan adında değilse (giriş / doğrulama sayfası) durum okunmaz
///  auth: varlığı "giriş yapılmış" sayılan çerez ADLARI (değerleri okunmaz); cookieDecides: çerez yoksa "giriş yok" say
///  nameCookie / nameSel: hesap adı (görünen kullanıcı adı; gizli değil)
///  input / button: sohbet kutusu ve gönder düğmesi; loginSel: giriş çağrısı; blocked: "yazamazsın" kutusu
///  pre: gönderimden önce tıklanacaklar (ör. sohbet kurallarını kabul); enterFirst: önce Enter, olmazsa düğme
fn selectors(p: Platform) -> &'static str {
    match p {
        Platform::Twitch => {
            r##"{"host":"twitch.tv","auth":["auth-token","login","twilight-user"],"cookieDecides":true,"nameCookie":"login","nameSel":[],
"input":["[data-a-target=\"chat-input\"][contenteditable=\"true\"]","textarea[data-a-target=\"chat-input\"]","[data-a-target=\"chat-input\"] [contenteditable=\"true\"]","[data-test-selector=\"chat-input\"]","div.chat-wysiwyg-input__editor","div[role=\"textbox\"][contenteditable=\"true\"]","form textarea"],
"button":["[data-a-target=\"chat-send-button\"]","button[aria-label=\"Send Chat\"]","button[aria-label=\"Chat\"]"],
"loginSel":["[data-a-target=\"login-button\"]","[data-test-selector=\"anon-user-menu__login-button\"]"],
"blocked":[],"pre":["[data-test-selector=\"chat-rules-ok-button\"]"],"enterFirst":false,"inputMeansLogged":false}"##
        }
        Platform::Youtube => {
            r##"{"host":"youtube.com","auth":["SAPISID","__Secure-3PAPISID"],"cookieDecides":true,"nameCookie":"","nameSel":["yt-live-chat-message-input-renderer #author-name"],
"input":["yt-live-chat-text-input-field-renderer div#input[contenteditable]","yt-live-chat-message-input-renderer div#input[contenteditable]","div#input.yt-live-chat-text-input-field-renderer","#input[contenteditable]","div[contenteditable][aria-label]"],
"button":["yt-live-chat-message-input-renderer #send-button button","#send-button button","#send-button yt-icon-button","#send-button"],
"loginSel":["yt-live-chat-message-input-renderer a[href*=\"ServiceLogin\"]","a[href*=\"accounts.google.com/ServiceLogin\"]"],
"blocked":["yt-live-chat-restricted-participation-renderer"],"pre":[],"enterFirst":false,"inputMeansLogged":true}"##
        }
        _ => {
            r##"{"host":"kick.com","auth":["session_token"],"cookieDecides":false,"nameCookie":"","nameSel":[],
"input":["[data-testid=\"chat-input\"] [contenteditable=\"true\"]","div.editor-input[contenteditable=\"true\"]","[data-lexical-editor=\"true\"]","#message-input","div[contenteditable=\"true\"][role=\"textbox\"]","div[contenteditable=\"true\"]","form textarea"],
"button":["#send-message-button","button[data-testid=\"send-message-button\"]","button[aria-label=\"Send message\"]","button[aria-label=\"Send\"]"],
"loginSel":["[data-testid=\"login\"]","button[data-test=\"login\"]","a[href=\"/login\"]"],
"blocked":[],"pre":[],"enterFirst":true,"inputMeansLogged":false}"##
        }
    }
}

/// Sayfada çalışan betik. __CFG__ / __OP__ / __ID__ / __TEXT__ Rust'ta JSON olarak yerine konur.
/// OP "probe": yalnız durum okur (hiçbir şey yazmaz / göndermez). OP "send": yazar ve gönderir.
const SCRIPT: &str = r####"(function(){
var C=__CFG__,OP=__OP__,ID=__ID__,TEXT=__TEXT__;
var out={id:ID,op:OP,host:location.hostname,path:location.pathname.slice(0,80)};
function report(){try{var t=document.title;document.title='PWCHAT1:'+JSON.stringify(out);setTimeout(function(){try{if(document.title.indexOf('PWCHAT1:')===0)document.title=t;}catch(e){}},80);}catch(e){}}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
var roots=null;
function shadows(){if(roots)return roots;roots=[];try{var all=document.querySelectorAll('*');for(var i=0;i<all.length&&i<20000;i++){if(all[i].shadowRoot)roots.push(all[i].shadowRoot);}}catch(e){}return roots;}
function q1(sel){try{var e=document.querySelector(sel);if(e)return e;var r=shadows();for(var i=0;i<r.length;i++){e=r[i].querySelector(sel);if(e)return e;}}catch(x){}return null;}
function find(list){list=list||[];for(var i=0;i<list.length;i++){var e=q1(list[i]);if(e)return{el:e,sel:list[i]};}return null;}
function hasCookie(n){try{return new RegExp('(?:^|; )'+n.replace(/[^A-Za-z0-9_-]/g,'')+'=').test(document.cookie);}catch(e){return false;}}
function off(el){return !!(el.disabled||el.readOnly||el.getAttribute('aria-disabled')==='true'||el.getAttribute('contenteditable')==='false');}
function probe(){
  if(!(location.hostname===C.host||location.hostname.slice(-(C.host.length+1))==='.'+C.host)){out.foreign=true;return null;}
  var f=find(C.input),ck=false,i;
  for(i=0;i<C.auth.length;i++){if(hasCookie(C.auth[i])){ck=true;break;}}
  var lp=!!find(C.loginSel);
  if(!lp&&!ck){try{var bs=document.querySelectorAll('button,a');for(i=0;i<bs.length&&i<600;i++){var tx=(bs[i].textContent||'').trim();if(tx.length<14&&/^(log in|login|sign in|giriş yap|oturum aç)$/i.test(tx)){lp=true;break;}}}catch(e){}}
  out.input=f?f.sel:'';out.off=f?off(f.el):false;out.prompt=lp;out.cookie=ck;out.blocked=!!find(C.blocked);out.ready=document.readyState;
  out.logged=ck?true:(lp?false:(f&&C.inputMeansLogged?true:(C.cookieDecides?false:null)));
  var name='';
  try{if(C.nameCookie){var m=document.cookie.match(new RegExp('(?:^|; )'+C.nameCookie+'=([^;]*)'));if(m)name=decodeURIComponent(m[1]);}
  if(!name){var n=find(C.nameSel);if(n)name=(n.el.textContent||'').trim();}}catch(e){}
  out.name=String(name).slice(0,40);
  return f;
}
async function send(){
  var f=probe();
  if(out.foreign){out.why='foreign';return;}
  if(out.logged===false){out.why='login';return;}
  if(!f){out.why=out.blocked?'disabled':'noinput';return;}
  (C.pre||[]).forEach(function(s){var b=q1(s);if(b){try{b.click();out.pre=s;}catch(e){}}});
  var el=f.el;
  if(off(el)){out.why='disabled';return;}
  var field=el.tagName==='TEXTAREA'||el.tagName==='INPUT';
  function cur(){if(field)return String(el.value||'').trim();var c=el.cloneNode(true),ph=c.querySelectorAll('[data-slate-placeholder],[data-placeholder]');for(var i=0;i<ph.length;i++)ph[i].remove();return String(c.textContent||'').replace(/[​﻿\n\r]/g,'').trim();}
  function filled(){return cur().length>0||(!field&&!!el.querySelector('img'));}
  function selAll(){try{if(field){el.select();return;}var s=window.getSelection(),r=document.createRange();r.selectNodeContents(el);s.removeAllRanges();s.addRange(r);}catch(e){}}
  function wipe(){try{el.focus();selAll();document.execCommand('delete',false,null);}catch(e){}}
  try{el.focus();}catch(e){}
  await sleep(80);
  if(filled()){wipe();await sleep(120);}
  var ms=[];
  if(field)ms.push(['setter',function(){var p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,TEXT);el.dispatchEvent(new Event('input',{bubbles:true}));}]);
  ms.push(['exec',function(){el.focus();document.execCommand('insertText',false,TEXT);}]);
  ms.push(['paste',function(){var dt=new DataTransfer();dt.setData('text/plain',TEXT);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}]);
  ms.push(['beforeinput',function(){var ok=el.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:TEXT,bubbles:true,cancelable:true}));if(ok&&!filled()){if(!field)el.textContent=TEXT;el.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:TEXT,bubbles:true}));}}]);
  for(var i=0;i<ms.length&&!filled();i++){try{ms[i][1]();}catch(e){}await sleep(160);if(filled())out.ins=ms[i][0];}
  if(!filled()){out.why='noinsert';return;}
  await sleep(120);
  function enter(){['keydown','keypress','keyup'].forEach(function(t){el.dispatchEvent(new KeyboardEvent(t,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,composed:true}));});return true;}
  function click(){var b=find(C.button);if(!b||off(b.el))return false;b.el.click();out.btn=b.sel;return true;}
  var order=C.enterFirst?['enter','button']:['button','enter'];
  for(var k=0;k<order.length;k++){
    if(!(order[k]==='enter'?enter():click()))continue;
    var t0=Date.now();
    while(Date.now()-t0<2200){await sleep(100);if(!filled()){out.ok=true;out.via=order[k];return;}}
  }
  out.why='notsent';wipe();
}
(async function(){
  try{if(OP==='send'){await send();}else{probe();}}catch(e){out.why='js';out.err=String((e&&e.name)||'hata').slice(0,40);}
  out.len=TEXT.length;report();
})();
})();"####;

/// Her sayfada: ses kapalı, video / ses öğeleri durdurulur (sohbet sayfalarında video yoktur; giriş sonrası açılan
/// sayfalarda otomatik oynayan yayın olabilir). Ek olarak tarayıcı `--mute-audio` ile açılır.
const QUIET_JS: &str = r#"(function(){function m(){try{document.querySelectorAll('video,audio').forEach(function(v){v.muted=true;try{v.pause();}catch(e){}});}catch(e){}}
document.addEventListener('play',function(e){try{e.target.muted=true;e.target.pause();}catch(x){}},true);setInterval(m,3000);})();"#;

/// Bu pencerelerin kendi profil klasörü olduğu için tarayıcı argümanları diğer pencerelerden farklı olabilir.
/// Gizli pencerede zamanlayıcılar yavaşlatılmasın (betik gizliyken de çalışmalı), ses hiç çıkmasın.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --mute-audio --autoplay-policy=user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------

/// Kalıcı kullanıcı tercihi + son bilinen giriş durumu (livechat_secrets.json "web.cfg"; gizli değer içermez)
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
struct PCfg {
    /// Kullanıcı bu platformda tarayıcı girişini açtı
    enabled: bool,
    /// Son denetimde giriş yapılmış mıydı (None: bilinmiyor / doğrulanamıyor)
    logged: Option<bool>,
    /// Hesap adı (okunabiliyorsa)
    login: String,
}

#[derive(Default)]
struct Win {
    /// Pencerenin gönderildiği son adres
    target: String,
    made_at: u64,
    probe_at: u64,
    last_send: u64,
    /// Son denetimde eşleşen sohbet kutusu seçicisi
    input: String,
}

#[derive(Default)]
struct WState {
    cfg: Option<HashMap<String, PCfg>>,
    win: HashMap<&'static str, Win>,
    results: HashMap<String, Value>,
    /// Pencere oluşturma hatasından sonra yeniden deneme zamanı (unix ms)
    retry_at: HashMap<&'static str, u64>,
}

fn st() -> &'static Mutex<WState> {
    static S: OnceLock<Mutex<WState>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(WState::default()))
}

fn gate(p: Platform) -> &'static tokio::sync::Mutex<()> {
    static G: OnceLock<[tokio::sync::Mutex<()>; 3]> = OnceLock::new();
    let g = G.get_or_init(|| [tokio::sync::Mutex::new(()), tokio::sync::Mutex::new(()), tokio::sync::Mutex::new(())]);
    &g[match p {
        Platform::Twitch => 0,
        Platform::Youtube => 1,
        _ => 2,
    }]
}

fn pcfg(app: &AppHandle, p: Platform) -> PCfg {
    let mut g = st().lock();
    if g.cfg.is_none() {
        g.cfg = Some(secrets::get_json(app, "web.cfg").and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default());
    }
    g.cfg.as_ref().and_then(|m| m.get(pkey(p)).cloned()).unwrap_or_default()
}

/// Tercihi değiştir; değiştiyse diske yazar ve true döner
fn update_cfg(app: &AppHandle, p: Platform, f: impl FnOnce(&mut PCfg)) -> bool {
    let old = pcfg(app, p);
    let mut new = old.clone();
    f(&mut new);
    if new == old {
        return false;
    }
    let all = {
        let mut g = st().lock();
        let m = g.cfg.get_or_insert_with(HashMap::new);
        m.insert(pkey(p).to_string(), new);
        serde_json::to_value(&*m).unwrap_or(Value::Null)
    };
    if let Err(e) = secrets::set_json(app, "web.cfg", &all) {
        dlog(format!("web {}: tercih kaydedilemedi: {e}", pkey(p)));
    }
    true
}

pub fn label(p: Platform) -> String {
    format!("chatweb-{}", pkey(p))
}

fn window(app: &AppHandle, p: Platform) -> Option<WebviewWindow> {
    app.get_webview_window(&label(p))
}

fn data_dir(app: &AppHandle, p: Platform) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|d| d.join("chatweb").join(pkey(p))).map_err(|e| format!("profil klasörü bulunamadı: {e}"))
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebView {
    pub enabled: bool,
    /// true: giriş yapılmış · false: yapılmamış · null: doğrulanamadı
    pub logged: Option<bool>,
    pub login: String,
    /// Pencere açık (gizli de olabilir)
    pub window: bool,
    pub visible: bool,
    /// Canlı sohbet çalışıyor
    pub running: bool,
    /// Yazılabilecek (★ benim kanalım, bağlı / canlı) kanal var
    pub has_target: bool,
}

pub fn view(app: &AppHandle, p: Platform) -> WebView {
    let c = pcfg(app, p);
    let w = window(app, p);
    let (running, targets) = targets(app);
    WebView {
        enabled: c.enabled,
        logged: c.logged,
        login: c.login,
        visible: w.as_ref().is_some_and(|w| w.is_visible().unwrap_or(false)),
        window: w.is_some(),
        running,
        has_target: targets.iter().any(|t| t.0 == p),
    }
}

/// Gönderime hazır mı (arayüzdeki "bağlı" durumu): açık ve girişin yapılmadığı bilinmiyor
pub fn usable(app: &AppHandle, p: Platform) -> bool {
    let c = pcfg(app, p);
    c.enabled && c.logged != Some(false)
}

fn sendable(c: &ChannelStatus) -> bool {
    c.state != State::Locked && c.state != State::Idle
}

/// (sohbet çalışıyor mu, yazılabilecek ★ kanalların sohbet adresleri)
fn targets(app: &AppHandle) -> (bool, Vec<(Platform, String)>) {
    let Some(h) = app.try_state::<Arc<Hub>>().map(|s| s.inner().clone()) else { return (false, Vec::new()) };
    let g = h.st.lock();
    if !g.running {
        return (false, Vec::new());
    }
    let idents: HashMap<String, String> = g.cfg.channels.iter().map(|c| (c.link.key.clone(), c.link.ident.clone())).collect();
    let out = g
        .channels_view()
        .into_iter()
        .filter(|c| c.mine && sendable(c))
        .filter_map(|c| {
            let p = c.platform?;
            let url = chat_url(p, idents.get(&c.key).map(|s| s.as_str()).unwrap_or(""), c.video_id.as_deref()).ok()?;
            Some((p, url))
        })
        .collect();
    (true, out)
}

fn safe_ident(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Kanalın açılır sohbet adresi
pub fn chat_url(p: Platform, ident: &str, video: Option<&str>) -> Result<String, String> {
    let s = site(p);
    match p {
        Platform::Youtube => match video.filter(|v| safe_ident(v)) {
            Some(v) => Ok(s.chat.replace("{video}", v)),
            None => Err("YouTube yayını şu an canlı değil: yazılacak canlı sohbet yok".into()),
        },
        Platform::Twitch | Platform::Kick => {
            let ch = ident.trim().trim_start_matches('@').to_lowercase();
            if !safe_ident(&ch) {
                return Err(format!("{} kanal adı sohbet adresine çevrilemedi", p.name()));
            }
            Ok(s.chat.replace("{channel}", &ch))
        }
        _ => Err("Bu kanala yazılamaz".into()),
    }
}

// ---------------------------------------------------------------------------
// Pencere
// ---------------------------------------------------------------------------

/// Sayfadan gelen başlık: "PWCHAT1:{json}" ise sonuç olarak işlenir (bkz. dosya başı)
fn on_title(app: &AppHandle, p: Platform, title: &str) {
    let Some(v) = title.strip_prefix(TITLE_PREFIX).and_then(|j| serde_json::from_str::<Value>(j).ok()) else { return };
    let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if id.is_empty() || id.len() > 32 {
        return;
    }
    {
        let mut g = st().lock();
        if g.results.len() > 40 {
            g.results.clear();
        }
        g.results.insert(id, v.clone());
    }
    apply_probe(app, p, &v);
}

/// Betiğin bildirdiği giriş durumunu kaydet (yalnız platformun kendi alan adındaki sayfalar için)
fn apply_probe(app: &AppHandle, p: Platform, v: &Value) {
    if v.get("foreign").and_then(|x| x.as_bool()) == Some(true) || v.get("ready").and_then(|x| x.as_str()) == Some("loading") || v.get("logged").is_none() {
        return;
    }
    let logged = v.get("logged").and_then(|x| x.as_bool());
    let name: String = v.get("name").and_then(|x| x.as_str()).unwrap_or("").chars().filter(|c| !c.is_control()).take(40).collect();
    let input = v.get("input").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if let Some(w) = st().lock().win.get_mut(pkey(p)) {
        w.input = input;
    }
    let changed = update_cfg(app, p, |c| {
        // Doğrulanamayan durum (None) bilinen bir durumu silmez
        if logged.is_some() {
            c.logged = logged;
        }
        if logged == Some(false) {
            c.login.clear();
        } else if !name.is_empty() {
            c.login = name.clone();
        }
    });
    if changed {
        dlog(format!(
            "web {}: giriş durumu → {}",
            pkey(p),
            match logged {
                Some(true) => "giriş yapılmış",
                Some(false) => "giriş yapılmamış",
                None => "doğrulanamadı",
            }
        ));
        send::emit(app);
    }
}

fn build(app: &AppHandle, p: Platform, url: &str, visible: bool) -> Result<WebviewWindow, String> {
    let u: tauri::Url = url.parse().map_err(|e| format!("adres geçersiz: {e}"))?;
    let dir = data_dir(app, p)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("profil klasörü oluşturulamadı: {e}"))?;
    let a2 = app.clone();
    let w = WebviewWindowBuilder::new(app, label(p), WebviewUrl::External(u))
        .title(format!("SRTR Pitwall · {}", p.name()))
        .inner_size(480.0, 760.0)
        .min_inner_size(360.0, 480.0)
        .visible(visible)
        .focused(visible)
        .skip_taskbar(!visible)
        .data_directory(dir)
        .additional_browser_args(BROWSER_ARGS)
        .initialization_script(QUIET_JS)
        // WebView2 geri çağrısı (ana iş parçacığı): panic FFI sınırını aşarsa program kapanır → burada yakalanır
        .on_document_title_changed(move |_w, title| {
            crate::crashlog::guard(|| on_title(&a2, p, &title));
        })
        // Giriş sayfalarının açtığı pencereler (Google / Apple ile giriş vb.) aynı profilde, tarayıcının kendi penceresinde açılır
        .on_new_window(|_url, _features| NewWindowResponse::Allow)
        .build()
        .map_err(|e| format!("pencere açılamadı: {e}"))?;
    let a3 = app.clone();
    w.on_window_event(move |e| {
        if let tauri::WindowEvent::Destroyed = e {
            st().lock().win.remove(pkey(p));
            dlog(format!("web {}: pencere kapandı", pkey(p)));
            send::emit(&a3);
        }
    });
    st().lock().win.insert(pkey(p), Win { target: url.to_string(), made_at: now_ms(), ..Default::default() });
    dlog(format!("web {}: pencere oluşturuldu ({})", pkey(p), if visible { "görünür" } else { "gizli" }));
    Ok(w)
}

fn navigate(w: &WebviewWindow, p: Platform, url: &str) -> Result<(), String> {
    let u: tauri::Url = url.parse().map_err(|e| format!("adres geçersiz: {e}"))?;
    w.navigate(u).map_err(|e| format!("sayfa açılamadı: {e}"))?;
    let mut g = st().lock();
    let e = g.win.entry(pkey(p)).or_default();
    e.target = url.to_string();
    e.input.clear();
    Ok(())
}

fn js(v: &str) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "\"\"".into())
}

/// Betiği çalıştır (sonuç beklenmez; `on_title` işler). Kimliği döner.
fn fire(w: &WebviewWindow, p: Platform, op: &str, text: &str) -> Result<String, String> {
    let id = secrets::random_token(9);
    // Sıra önemli: kullanıcı metni en son konur (metnin içindeki "__ID__" gibi diziler yeniden işlenmesin)
    let script = SCRIPT.replace("__CFG__", selectors(p)).replace("__OP__", &js(op)).replace("__ID__", &js(&id)).replace("__TEXT__", &js(text));
    w.eval(script).map_err(|e| format!("betik çalıştırılamadı: {e}"))?;
    Ok(id)
}

/// Betiği çalıştır ve sonucunu bekle (None: süre doldu)
async fn run(w: &WebviewWindow, p: Platform, op: &str, text: &str, timeout_ms: u64) -> Result<Option<Value>, String> {
    let id = fire(w, p, op, text)?;
    let t0 = now_ms();
    loop {
        if let Some(v) = st().lock().results.remove(&id) {
            return Ok(Some(v));
        }
        if now_ms().saturating_sub(t0) > timeout_ms {
            return Ok(None);
        }
        tokio::time::sleep(Duration::from_millis(80)).await;
    }
}

fn show(w: &WebviewWindow) {
    let _ = w.set_skip_taskbar(false);
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
}

fn why_text(p: Platform, why: &str) -> String {
    match why {
        "login" => format!("{} hesabına giriş yapılmamış: Canlı Sohbet › Sohbete yaz › “Giriş penceresini aç” ile giriş yap", p.name()),
        "foreign" => "Sohbet sayfası yerine başka bir sayfa açıldı (giriş / doğrulama sayfası olabilir): Sohbete yaz'dan pencereyi açıp kontrol et".into(),
        "noinput" => "Sohbet kutusu sayfada bulunamadı (yayın ya da sohbet kapalı olabilir, site düzeni değişmiş olabilir)".into(),
        "disabled" => "Sohbet kutusu kapalı: bu sohbete şu an yazamazsın (yalnız takipçi / abone modu, yasak ya da hesap doğrulaması gerekiyor olabilir)".into(),
        "noinsert" => "Mesaj sohbet kutusuna yazılamadı (site düzeni değişmiş olabilir)".into(),
        "notsent" => "Mesaj kutuya yazıldı ama site göndermedi (yavaş mod, yalnız takipçi modu, tekrarlanan mesaj ya da doğrulama isteği olabilir): pencereyi açıp kontrol et".into(),
        "js" => "Sohbet sayfasındaki betik hata verdi (site düzeni değişmiş olabilir)".into(),
        _ => "Sohbet sayfası yanıt vermedi (zaman aşımı)".into(),
    }
}

fn path_of(url: &str) -> String {
    url.parse::<tauri::Url>().map(|u| u.path().to_lowercase().chars().take(80).collect()).unwrap_or_default()
}

/// Tarayıcı penceresi üzerinden mesaj gönder. Başarıda kısa ayrıntı (günlük için) döner.
pub async fn send(app: &AppHandle, p: Platform, ident: &str, video: Option<&str>, text: &str) -> Result<(), String> {
    let url = chat_url(p, ident, video)?;
    let c = pcfg(app, p);
    if !c.enabled {
        return Err(format!("{} için giriş yapılmadı: Canlı Sohbet › Sohbete yaz › “Giriş penceresini aç”", p.name()));
    }
    // Platform başına sıra: iki gönderim aynı pencerede üst üste binmez
    let _g = gate(p).lock().await;
    let last = st().lock().win.get(pkey(p)).map(|w| w.last_send).unwrap_or(0);
    let wait = (last + MIN_GAP_MS).saturating_sub(now_ms());
    if wait > 0 {
        tokio::time::sleep(Duration::from_millis(wait.min(MIN_GAP_MS))).await;
    }
    let text: String = text.chars().take(site(p).max_len).collect();
    let n = text.chars().count();

    let (w, fresh) = match window(app, p) {
        Some(w) => {
            let at = st().lock().win.get(pkey(p)).map(|x| x.target.clone()).unwrap_or_default();
            if at != url {
                if c.logged != Some(true) && w.is_visible().unwrap_or(false) {
                    return Err(format!("Önce açık olan {} penceresinde girişi tamamla", p.name()));
                }
                navigate(&w, p, &url)?;
                dlog(format!("web {}: sohbet sayfasına geçildi", pkey(p)));
                (w, true)
            } else {
                (w, false)
            }
        }
        None => (build(app, p, &url, false)?, true),
    };

    // Sayfa hazır olana kadar durum sor
    let want = path_of(&url);
    let t0 = now_ms();
    let mut limit: u64 = if fresh { 30_000 } else { 8_000 };
    let mut renav = false;
    let mut last_why = "timeout";
    loop {
        let el = now_ms().saturating_sub(t0);
        if let Some(v) = run(&w, p, "probe", "", 3_000).await? {
            let foreign = v.get("foreign").and_then(|x| x.as_bool()) == Some(true);
            let loading = v.get("ready").and_then(|x| x.as_str()) == Some("loading");
            let has_input = v.get("input").and_then(|x| x.as_str()).is_some_and(|s| !s.is_empty());
            let off = v.get("off").and_then(|x| x.as_bool()) == Some(true);
            let logged = v.get("logged").and_then(|x| x.as_bool());
            let path = v.get("path").and_then(|x| x.as_str()).unwrap_or("").to_lowercase();
            if foreign {
                last_why = "foreign";
            } else if path != want && !loading {
                // Kullanıcı açık pencerede başka sayfaya gitmiş olabilir: bir kez geri getir
                last_why = "foreign";
                if !renav && el > 1_500 {
                    renav = true;
                    limit += 20_000;
                    navigate(&w, p, &url)?;
                    dlog(format!("web {}: pencere sohbet sayfasında değildi, yeniden açıldı", pkey(p)));
                }
            } else if has_input && !off && logged != Some(false) {
                break;
            } else if logged == Some(false) {
                last_why = "login";
                if el > 5_000 || !fresh {
                    break;
                }
            } else if has_input && off {
                last_why = "disabled";
            } else {
                last_why = if v.get("blocked").and_then(|x| x.as_bool()) == Some(true) { "disabled" } else { "noinput" };
            }
        }
        if el > limit {
            dlog(format!("web {}: gönderilemedi (hazırlık): {last_why} · {n} karakter", pkey(p)));
            return Err(why_text(p, last_why));
        }
        tokio::time::sleep(Duration::from_millis(600)).await;
    }

    let r = run(&w, p, "send", &text, 25_000).await?;
    if let Some(x) = st().lock().win.get_mut(pkey(p)) {
        x.last_send = now_ms();
    }
    let Some(v) = r else {
        dlog(format!("web {}: gönderilemedi: betik yanıt vermedi · {n} karakter", pkey(p)));
        return Err(why_text(p, "timeout"));
    };
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    if v.get("ok").and_then(|x| x.as_bool()) == Some(true) {
        dlog(format!("web {}: gönderildi · kutu {} · yazma {} · gönderme {} {} · {n} karakter", pkey(p), s("input"), s("ins"), s("via"), s("btn")));
        Ok(())
    } else {
        let why = s("why");
        dlog(format!("web {}: gönderilemedi: {why} {} · kutu {} · yazma {} · {n} karakter", pkey(p), s("err"), s("input"), s("ins")));
        Err(why_text(p, &why))
    }
}

// ---------------------------------------------------------------------------
// Arka plan: giriş durumunu izle, gizli pencereleri hazırla / kapat
// ---------------------------------------------------------------------------

pub fn init(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(2500)).await;
            crate::crashlog::guard(|| tick(&app));
        }
    });
}

fn tick(app: &AppHandle) {
    // Hiç kullanılmadıysa hiçbir şey yapma
    if PLATFORMS.iter().all(|p| !pcfg(app, *p).enabled && window(app, *p).is_none()) {
        return;
    }
    let (running, targets) = targets(app);
    let now = now_ms();
    for p in PLATFORMS {
        let c = pcfg(app, p);
        let target = targets.iter().find(|t| t.0 == p).map(|t| t.1.clone());
        match window(app, p) {
            Some(w) => {
                let vis = w.is_visible().unwrap_or(false);
                let (made, probed, sent, at) = st().lock().win.get(pkey(p)).map(|x| (x.made_at, x.probe_at, x.last_send, x.target.clone())).unwrap_or((0, 0, 0, String::new()));
                let idle = now.saturating_sub(made) > 60_000 && now.saturating_sub(sent) > 60_000;
                if !vis && (!running || !c.enabled) && idle {
                    dlog(format!("web {}: gizli pencere kapatıldı ({})", pkey(p), if running { "platform kapalı" } else { "sohbet durdu" }));
                    let _ = w.destroy();
                    continue;
                }
                // Gizli pencere başka bir yayına bakıyorsa (ör. yeni YouTube yayını) güncelle
                if !vis && idle && c.logged == Some(true) {
                    if let Some(t) = target.as_ref().filter(|t| **t != at) {
                        if gate(p).try_lock().is_ok() {
                            let _ = navigate(&w, p, t);
                        }
                    }
                }
                if now.saturating_sub(probed) >= if vis { 2_500 } else { 20_000 } {
                    if let Some(x) = st().lock().win.get_mut(pkey(p)) {
                        x.probe_at = now;
                    }
                    let _ = fire(&w, p, "probe", "");
                }
            }
            None => {
                let retry = st().lock().retry_at.get(pkey(p)).copied().unwrap_or(0);
                if running && c.enabled && c.logged == Some(true) && now >= retry && !send::has_api(app, p) && allowed(app, FEATURE) {
                    if let Some(t) = target {
                        if let Err(e) = build(app, p, &t, false) {
                            dlog(format!("web {}: gizli pencere hazırlanamadı: {e}", pkey(p)));
                            st().lock().retry_at.insert(pkey(p), now + 60_000);
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

fn parse(platform: &str) -> Result<Platform, String> {
    Platform::parse(platform).filter(|p| PLATFORMS.contains(p)).ok_or_else(|| "Bilinmeyen platform".to_string())
}

/// Giriş / sohbet penceresini görünür aç (kullanıcı kendi hesabıyla, platformun kendi sayfasında giriş yapar)
#[tauri::command]
pub async fn livechat_web_open(app: AppHandle, platform: String) -> Result<SendStatus, String> {
    let p = parse(&platform)?;
    if !allowed(&app, FEATURE) {
        return Err("Sohbete yazma PRO üyelere özel".into());
    }
    update_cfg(&app, p, |c| c.enabled = true);
    let c = pcfg(&app, p);
    let s = site(p);
    let url = if c.logged == Some(true) { targets(&app).1.into_iter().find(|t| t.0 == p).map(|t| t.1).unwrap_or_else(|| s.home.to_string()) } else { s.login.to_string() };
    let r = match window(&app, p) {
        Some(w) => {
            let at = st().lock().win.get(pkey(p)).map(|x| x.target.clone()).unwrap_or_default();
            let r = if c.logged != Some(true) && at != url { navigate(&w, p, &url) } else { Ok(()) };
            show(&w);
            r
        }
        None => build(&app, p, &url, true).map(|_| ()),
    };
    match &r {
        Ok(()) => {
            dlog(format!("web {}: pencere gösterildi ({})", pkey(p), if c.logged == Some(true) { "oturum açık" } else { "giriş sayfası" }));
            send::set_last(p, None);
        }
        Err(e) => {
            dlog(format!("web {}: pencere açılamadı: {e}", pkey(p)));
            send::set_last(p, Some(&format!("Giriş penceresi açılamadı: {e}")));
        }
    }
    send::emit(&app);
    r.map(|_| send::status(&app)).map_err(|e| format!("Giriş penceresi açılamadı: {e}"))
}

/// Pencereyi gizle (arka planda yaşar; sohbet çalışmıyorsa bir süre sonra kapatılır)
#[tauri::command]
pub async fn livechat_web_hide(app: AppHandle, platform: String) -> Result<SendStatus, String> {
    let p = parse(&platform)?;
    if let Some(w) = window(&app, p) {
        let _ = w.hide();
        let _ = w.set_skip_taskbar(true);
        dlog(format!("web {}: pencere gizlendi", pkey(p)));
    }
    send::emit(&app);
    Ok(send::status(&app))
}

/// Çıkış: pencereyi kapat, tarayıcı verisini ve profil klasörünü sil
#[tauri::command]
pub async fn livechat_web_logout(app: AppHandle, platform: String) -> Result<SendStatus, String> {
    let p = parse(&platform)?;
    let _g = gate(p).lock().await;
    update_cfg(&app, p, |c| *c = PCfg::default());
    if let Some(w) = window(&app, p) {
        if let Err(e) = w.clear_all_browsing_data() {
            dlog(format!("web {}: tarayıcı verisi temizlenemedi: {e}", pkey(p)));
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
        let _ = w.destroy();
    }
    let dir = data_dir(&app, p)?;
    // Tarayıcı süreçleri klasörü bırakana kadar birkaç kez dene
    let mut err = String::new();
    for _ in 0..14 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => {
                err.clear();
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                err.clear();
                break;
            }
            Err(e) => err = e.to_string(),
        }
    }
    if err.is_empty() {
        dlog(format!("web {}: çıkış yapıldı, profil klasörü silindi", pkey(p)));
        send::set_last(p, None);
    } else {
        dlog(format!("web {}: çıkış yapıldı ama profil klasörü silinemedi: {err}", pkey(p)));
        send::set_last(p, Some("Çıkış yapıldı ama tarayıcı profili klasörü silinemedi (dosyalar kullanımda); programı yeniden başlatıp tekrar “Çıkış yap”a bas"));
    }
    send::emit(&app);
    Ok(send::status(&app))
}

/// "Bağlantıyı test et" (tarayıcı girişi): pencereyi (gerekirse gizli) açar ve sayfayı denetler. Mesaj GÖNDERMEZ.
pub async fn test(app: &AppHandle, p: Platform) -> Vec<TestStep> {
    let mut out = Vec::new();
    let c = pcfg(app, p);
    if !c.enabled {
        out.push(step("Tarayıcı girişi", "skip", "Henüz açılmadı: “Giriş penceresini aç” ile giriş yap"));
        return out;
    }
    let (running, targets) = targets(app);
    let target = targets.into_iter().find(|t| t.0 == p).map(|t| t.1);
    let _g = gate(p).lock().await;
    let w = match window(app, p) {
        Some(w) => {
            out.push(step("Tarayıcı penceresi", "ok", if w.is_visible().unwrap_or(false) { "Açık (görünür)" } else { "Açık (gizli)" }));
            w
        }
        None => match build(app, p, target.as_deref().unwrap_or(site(p).home), false) {
            Ok(w) => {
                out.push(step("Tarayıcı penceresi", "ok", "Gizli olarak açıldı"));
                w
            }
            Err(e) => {
                out.push(step("Tarayıcı penceresi", "fail", e));
                return out;
            }
        },
    };
    // Sayfa yüklenene kadar durum sor (en fazla ~20 sn)
    let t0 = now_ms();
    let mut last: Option<Value> = None;
    while now_ms().saturating_sub(t0) < 20_000 {
        match run(&w, p, "probe", "", 3_000).await {
            Ok(Some(v)) => {
                let done = v.get("ready").and_then(|x| x.as_str()) == Some("complete") && (v.get("input").and_then(|x| x.as_str()).is_some_and(|s| !s.is_empty()) || now_ms().saturating_sub(t0) > 8_000);
                last = Some(v);
                if done {
                    break;
                }
            }
            Ok(None) => {}
            Err(e) => {
                out.push(step("Sayfa", "fail", e));
                return out;
            }
        }
        tokio::time::sleep(Duration::from_millis(700)).await;
    }
    let Some(v) = last else {
        out.push(step("Sayfa", "fail", "Sayfa yanıt vermedi (yüklenemedi ya da betik çalışmadı)"));
        return out;
    };
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    if v.get("foreign").and_then(|x| x.as_bool()) == Some(true) {
        out.push(step("Sayfa", "warn", format!("Pencere {} adresinde (giriş / doğrulama sayfası olabilir): pencereyi açıp tamamla", s("host"))));
        return out;
    }
    out.push(step("Sayfa", "ok", format!("{}{}", s("host"), s("path"))));
    out.push(match v.get("logged").and_then(|x| x.as_bool()) {
        Some(true) => step("Oturum", "ok", if s("name").is_empty() { "Giriş yapılmış".to_string() } else { format!("Giriş yapılmış, hesap: {}", s("name")) }),
        Some(false) => step("Oturum", "fail", "Giriş yapılmamış: “Giriş penceresini aç” ile giriş yap"),
        None => step("Oturum", "warn", "Giriş durumu sayfadan doğrulanamadı (gönderim yine de denenir)"),
    });
    out.push(if target.is_none() {
        step("Sohbet kutusu", "skip", if running { "Yazılabilecek canlı kanal yok (Kanallar'da ★ benim kanalım işaretli ve canlı / bağlı bir kanal olmalı)" } else { "Canlı sohbet çalışmıyor: kutu, sohbet başlatılınca denetlenebilir" })
    } else if s("input").is_empty() {
        step("Sohbet kutusu", "fail", if v.get("blocked").and_then(|x| x.as_bool()) == Some(true) { "Bu sohbete yazma iznin yok (kısıtlı sohbet)" } else { "Bulunamadı (sohbet kapalı olabilir ya da site düzeni değişmiş)" })
    } else if v.get("off").and_then(|x| x.as_bool()) == Some(true) {
        step("Sohbet kutusu", "warn", format!("Bulundu ama kapalı ({})", s("input")))
    } else {
        step("Sohbet kutusu", "ok", format!("Bulundu: {}", s("input")))
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn urls_and_config() {
        assert_eq!(chat_url(Platform::Twitch, "@SomeOne", None).unwrap(), "https://www.twitch.tv/popout/someone/chat");
        assert_eq!(chat_url(Platform::Kick, "abc-d", None).unwrap(), "https://kick.com/popout/abc-d/chat");
        assert_eq!(chat_url(Platform::Youtube, "x", Some("dQw4w9WgXcQ")).unwrap(), "https://www.youtube.com/live_chat?is_popout=1&v=dQw4w9WgXcQ");
        assert!(chat_url(Platform::Youtube, "x", None).is_err());
        assert!(chat_url(Platform::Twitch, "a/b?c", None).is_err());
        for p in PLATFORMS {
            assert!(serde_json::from_str::<Value>(selectors(p)).is_ok());
        }
        assert_eq!(js("a\"</script>\n"), "\"a\\\"</script>\\n\"");
        assert_eq!(path_of("https://www.twitch.tv/popout/Abc/chat?x=1"), "/popout/abc/chat");
    }
}
