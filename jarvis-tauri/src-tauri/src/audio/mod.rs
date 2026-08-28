pub mod mic;
pub mod playback;

pub use mic::Microphone;
pub use playback::AudioPlayer;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct AudioManager {
    mic_active: Arc<AtomicBool>,
    playing: Arc<AtomicBool>,
}

impl AudioManager {
    pub fn new() -> Self {
        println!("[AUDIO] Creating AudioManager");
        
        let mic_active = Arc::new(AtomicBool::new(false));
        let mic_active_clone = Arc::clone(&mic_active);
        std::thread::spawn(move || {
            Microphone::run_thread(mic_active_clone);
        });
        
        let playing = Arc::new(AtomicBool::new(false));
        let playing_clone = Arc::clone(&playing);
        std::thread::spawn(move || {
            AudioPlayer::run_thread(playing_clone);
        });
        
        Self {
            mic_active,
            playing,
        }
    }

    pub fn start_microphone(&self) -> Result<(), String> {
        println!("[AUDIO] Starting microphone...");
        self.mic_active.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn stop_microphone(&self) {
        println!("[AUDIO] Stopping microphone...");
        self.mic_active.store(false, Ordering::SeqCst);
    }

    pub fn is_mic_active(&self) -> bool {
        self.mic_active.load(Ordering::SeqCst)
    }

    pub fn play_audio(&self, audio_data: Vec<u8>) -> Result<(), String> {
        println!("[AUDIO] Playing audio ({} bytes)", audio_data.len());
        
        let playing = Arc::clone(&self.playing);
        let data = audio_data;
        
        std::thread::spawn(move || {
            if let Ok((_stream, handle)) = rodio::OutputStream::try_default() {
                if let Ok(sink) = rodio::Sink::try_new(&handle) {
                    // Convert bytes to f32 samples (rodio requires owned data for decoder)
                    let samples: Vec<f32> = data
                        .chunks(2)
                        .filter_map(|c| {
                            if c.len() == 2 {
                                let s = i16::from_le_bytes([c[0], c[1]]);
                                Some(s as f32 / 32768.0)
                            } else {
                                None
                            }
                        })
                        .collect();
                    
                    if !samples.is_empty() {
                        println!("[AUDIO] Playing {} samples", samples.len());
                        let source = rodio::buffer::SamplesBuffer::new(1, 16000, samples);
                        sink.append(source);
                    }
                    
                    playing.store(true, Ordering::SeqCst);
                    sink.sleep_until_end();
                    playing.store(false, Ordering::SeqCst);
                    println!("[AUDIO] Playback complete");
                }
            }
        });
        
        Ok(())
    }

    pub fn stop_audio(&self) {
        println!("[AUDIO] Stopping playback...");
        self.playing.store(false, Ordering::SeqCst);
    }

    pub fn is_playing(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }

    pub fn interrupt(&self) {
        println!("[AUDIO] Interrupt triggered");
        self.stop_audio();
        self.stop_microphone();
    }
}

impl Default for AudioManager {
    fn default() -> Self {
        Self::new()
    }
}

unsafe impl Send for AudioManager {}
unsafe impl Sync for AudioManager {}