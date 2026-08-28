use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct Microphone;

impl Microphone {
    pub fn new() -> Self {
        Self
    }

    pub fn run_thread(active: Arc<AtomicBool>) {
        let host = cpal::default_host();
        
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("[MIC] No input device");
                return;
            }
        };
        
        println!("[MIC] Device: {:?}", device.name());

        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[MIC] No config: {}", e);
                return;
            }
        };
        
        println!("[MIC] Config: {:?}", config);

        let active_clone = active.clone();
        let err_fn = |err| eprintln!("[MIC] Error: {}", err);

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if !active_clone.load(Ordering::Relaxed) {
                            return;
                        }
                        if !data.is_empty() {
                            println!("[MIC] Audio: {} samples", data.len());
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if !active_clone.load(Ordering::Relaxed) {
                            return;
                        }
                        if !data.is_empty() {
                            println!("[MIC] Audio: {} samples", data.len());
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => {
                eprintln!("[MIC] Unsupported format");
                return;
            }
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[MIC] Build error: {}", e);
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("[MIC] Play error: {}", e);
            return;
        }

        println!("[MIC] ✅ Running");

        while active.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        println!("[MIC] ✅ Stopped");
    }
}

impl Default for Microphone {
    fn default() -> Self {
        Self::new()
    }
}