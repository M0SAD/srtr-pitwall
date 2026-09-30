//! iRacing: `sdk::LiveSource` için ince sarmalayıcı. Davranış eski motor koduyla birebir aynıdır.

use super::{SimKind, Source};
use crate::model::{Frame, SessionData};
use crate::sdk::LiveSource;

pub struct IRacing {
    src: LiveSource,
    last_session_update: i32,
}

impl IRacing {
    pub fn open() -> Option<IRacing> {
        LiveSource::open().map(|src| IRacing { src, last_session_update: -1 })
    }
}

impl Source for IRacing {
    fn kind(&self) -> SimKind {
        SimKind::IRacing
    }

    fn wait(&self, ms: u32) {
        // iRacing her yeni veri yazdığında olay sinyali verir (60 Hz).
        self.src.wait(ms);
    }

    fn connected(&self) -> bool {
        self.src.connected()
    }

    fn session_update(&mut self) -> Option<SessionData> {
        let su = self.src.session_info_update();
        if su == self.last_session_update {
            return None;
        }
        let out = self.src.session_yaml().map(|y| crate::session::parse(&y));
        self.last_session_update = su;
        out
    }

    fn read(&mut self, frame: &mut Frame) -> bool {
        self.src.read(frame)
    }

    fn map_key(&self, s: &SessionData) -> String {
        format!("{}_{}", s.track_id, s.track_config)
    }
}
