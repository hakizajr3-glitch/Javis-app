const now = () => new Date().toLocaleTimeString('en-US', { 
  hour12: false, 
  hour: '2-digit', 
  minute: '2-digit', 
  second: '2-digit' 
});

export const logger = {
  log: (...args: any[]) => console.log(`[${now()}]`, ...args),
  info: (...args: any[]) => console.log(`[${now()}]`, 'INFO', ...args),
  warn: (...args: any[]) => console.warn(`[${now()}]`, 'WARN', ...args),
  error: (...args: any[]) => console.error(`[${now()}]`, 'ERROR', ...args),
};

export default logger;