use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct AudioPlayer;

impl AudioPlayer {
    pub fn new() -> Self {
        Self
    }

    pub fn run_thread(_playing: Arc<AtomicBool>) {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    }
}

impl Default for AudioPlayer {
    fn default() -> Self {
        Self::new()
    }
}