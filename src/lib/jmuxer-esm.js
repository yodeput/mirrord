// Browser-compatible JMuxer loader
// The JMuxer UMD bundle expects 'stream' (Node.js) but falls back to window.stream
// We provide a dummy stream object to satisfy the dependency

// Create a dummy stream object for browser compatibility
if (typeof window !== 'undefined' && !window.stream) {
  window.stream = {
    Duplex: class Duplex {
      constructor() {}
      read() {}
      write() {}
    }
  }
}

// Load the JMuxer bundle - it will attach to window.JMuxer
import './jmuxer.min.js'

// Export the JMuxer class
const JMuxer = window.JMuxer

if (!JMuxer) {
  console.error('[JMuxer ESM] Failed to load JMuxer - window.JMuxer is undefined')
}

export default JMuxer
