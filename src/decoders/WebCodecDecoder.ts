import { IVideoDecoder } from './types'

export class WebCodecDecoder implements IVideoDecoder {
  private decoder: any = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private videoElement: HTMLVideoElement | null = null
  
  private sps: Uint8Array | null = null
  private pps: Uint8Array | null = null
  private configured = false
  private hasDecodedFirstKeyFrame = false

  init(videoElement: HTMLVideoElement): void {
    this.videoElement = videoElement
    
    if (!('VideoDecoder' in window)) {
      console.error('[WebCodecDecoder] VideoDecoder not supported')
      return
    }

    // Create a canvas overlay for rendering
    // We attach it as a sibling to the video element
    if (videoElement.parentElement) {
      this.canvas = document.createElement('canvas')
      this.canvas.style.position = 'absolute'
      this.canvas.style.inset = '0'
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      this.canvas.style.pointerEvents = 'none' // Let clicks pass through to input handler
      this.canvas.className = 'webcodec-canvas'
      
      videoElement.parentElement.appendChild(this.canvas)
      this.ctx = this.canvas.getContext('2d')
    }

    // @ts-ignore - WebCodecs API
    this.decoder = new VideoDecoder({
      output: (frame: any) => {
        if (this.canvas && this.ctx && this.videoElement) {
            // Resize canvas if needed
            if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
                this.canvas.width = frame.displayWidth
                this.canvas.height = frame.displayHeight
            }
            this.ctx.drawImage(frame, 0, 0)
        }
        frame.close()
      },
      error: (e) => {
        console.error('[WebCodecDecoder] Decode error:', e)
      }
    })
  }

  feed(data: Uint8Array, pts?: number): void {
    if (!this.decoder) return

    // 1. Parse NAL units from Annex B stream (00 00 00 01 or 00 00 01)
    const nals = this.parseNALs(data)
    
    // 2. Extract Config (SPS/PPS)
    let spsFound = false
    let ppsFound = false
    
    for (const nal of nals) {
        const type = nal[0] & 0x1F
        if (type === 7) { 
            this.sps = nal
            spsFound = true
        } else if (type === 8) {
            this.pps = nal
            ppsFound = true
        }
    }
    
    // 3. Configure if we have config and haven't configured yet (or re-config needed)
    if ((spsFound || ppsFound) && this.sps && this.pps && !this.configured) {
        this.configureDecoder(this.sps, this.pps)
        this.configured = true
    }
    
    // 4. Decode Video Data (IDR / Non-IDR)
    // Filter out SPS/PPS from the chunks we send to decode, or keep them?
    // Usually we send the whole Access Unit converted to AVCC
    
    // 4. Decode Video Data (IDR / Non-IDR)
    if (this.configured && nals.length > 0) {
        // Find if this AU is keyframe (has IDR)
        let isKeyFrame = false
        let hasVCL = false
        const avccPayloads: Uint8Array[] = []
        let totalLen = 0
        
        for (const nal of nals) {
            const type = nal[0] & 0x1F
            if (type === 5) {
                isKeyFrame = true
                hasVCL = true
            } else if (type >= 1 && type <= 5) {
                hasVCL = true
            }
            // Include all NALs in the AU (SPS/PPS often come with IDR)
            const len = nal.length
            const LenHeader = new Uint8Array(4)
            new DataView(LenHeader.buffer).setUint32(0, len, false) // Big Endian
            
            avccPayloads.push(LenHeader)
            avccPayloads.push(nal)
            totalLen += 4 + len
        }
        
        // Only decode if we have VCL NALs (pixel data)
        if (hasVCL) {
            // Safety: If this is the VERY FIRST decode after config, strict WebCodec implementations
            // might require it to be a key frame. If we somehow missed the IDR, wait for next one.
            if (!this.hasDecodedFirstKeyFrame && !isKeyFrame) {
                console.warn('[WebCodecDecoder] Skipping non-keyframe at start of stream')
                return
            }

            // Merge payloads
            const chunkData = new Uint8Array(totalLen)
            let offset = 0
            for (const p of avccPayloads) {
                chunkData.set(p, offset)
                offset += p.length
            }
            
            // Normalize timestamp to be at least 0
            const safePts = Math.max(0, pts || 0)
            
            // @ts-ignore
            const chunk = new EncodedVideoChunk({
                type: isKeyFrame ? 'key' : 'delta',
                timestamp: safePts, // Microseconds
                data: chunkData
            })
            
            try {
                this.decoder.decode(chunk)
                if (isKeyFrame) this.hasDecodedFirstKeyFrame = true
            } catch(e) {
                console.error('[WebCodecDecoder] Decode exception:', e)
            }
        }
    }
  }
  
  private parseNALs(data: Uint8Array): Uint8Array[] {
    const nals: Uint8Array[] = []
    let start = -1
    
    // Simple Annex B parser
    for (let i = 0; i < data.length - 2; i++) {
        // Look for 00 00 01
        if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 1) {
            if (start !== -1) {
                // Found next start code, push previous NAL (w/o start code?)
                // Usually we strip the start code for AVCC
                // Start code detected at 'start'. The actual NAL begins after 3 or 4 bytes.
                // We need to handle the 3 vs 4 byte start code ambiguity.
                // If data[start-1] was 0, it was 4 bytes.
                
                // Let's refine: track the *end* of the start code
                // But simplified: extract from start_code_end to next_start_code_begin
            }
        }
    }
    
    // Robust approach:
    const offsets: number[] = []
    let i = 0
    while (i < data.length - 2) {
        if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 1) {
            offsets.push(i)
            i += 3
        } else {
            i++
        }
    }
    
    if (offsets.length === 0) return [] // No NALs?
    
    for (let j = 0; j < offsets.length; j++) {
        const start = offsets[j]
        const end = (j < offsets.length - 1) ? offsets[j+1] : data.length
        
        // Start code length: usually 3 bytes (00 00 01). 
        // Check if preceded by 00 -> 4 bytes (00 00 00 01)
        let startCodeLen = 3
        if (start > 0 && data[start-1] === 0) {
            // It's actually part of 4-byte, but our loop found the 3-byte sequence
            // Check if we should adjust start or if the loop handled it
            // We pushed 'i' where 00 00 01 starts. 
            // If data[i-1] is 0, then the start code effectively started at i-1.
            // BUT for NAL extraction, we just want the payload.
            // Payload starts at start + 3
        }
        
        let payloadStart = start + 3
        
        // Extract payload
        let nal = data.subarray(payloadStart, end)
        
        // Filter out trailing 00 from previous NAL's 4-byte start code overlap?
        // If the NEXT start code is 00 00 00 01, the first 0 is counted as part of this NAL by naive slicing?
        // No, standard says NAL shouldn't contain 00 00 00/01 inside.
        // But if we slice up to the '00' of '00 00 01', we are safe.
        // Wait, if the *next* start code was '00 00 00 01', my search found '00 00 01' at index X.
        // Index X-1 is 0.
        // So I sliced up to X.
        // Meaning I included the leading 0 of the next start code in *this* NAL.
        // That is technically "trailing zeros" which are allowed, or it's part of the start code.
        // For AVCC, we should strip purely 00 00 01 or 00 00 00 01.
        
        // Let's clean up trailing zeros if they look like start code preamble
        let trimEnd = end
        if (j < offsets.length - 1) { // If there is a next one
           if (trimEnd > 0 && data[trimEnd-1] === 0) trimEnd--; // Handle 4-byte start code 00
        }
        
        const cleaned = data.subarray(payloadStart, trimEnd)
        nals.push(cleaned)
    }
    
    return nals
  }

  private configureDecoder(sps: Uint8Array, pps: Uint8Array) {
    // Build AVCDecoderConfigurationRecord
    // minimal: [1][profile][compat][level][FC|3] [E0|1][lenH][lenL][sps...] [1][lenH][lenL][pps]
    
    const profile = sps[1]
    const compat = sps[2]
    const level = sps[3]
    
    const body = [
        1, profile, compat, level, 0xFF, // 0xFF = 11111111 (lengthSizeMinus1 = 3 -> 4 bytes)
        0xE1, // NumSPS = 1
        (sps.length >> 8) & 0xFF, sps.length & 0xFF,
        ...sps,
        1, // NumPPS = 1
        (pps.length >> 8) & 0xFF, pps.length & 0xFF,
        ...pps
    ]
    
    const description = new Uint8Array(body)
    
    this.decoder?.configure({
        codec: `avc1.${this.toHex(profile)}${this.toHex(compat)}${this.toHex(level)}`,
        description: description
    })
    console.log('[WebCodecDecoder] Configured with profile:', `avc1.${this.toHex(profile)}${this.toHex(compat)}${this.toHex(level)}`)
  }

  private toHex(v: number): string {
    return v.toString(16).padStart(2, '0')
  }

  destroy(): void {
    if (this.decoder) {
      if (this.decoder.state !== 'closed') {
        this.decoder.close()
      }
      this.decoder = null
    }
    if (this.canvas) {
        this.canvas.remove()
        this.canvas = null
        this.ctx = null
    }
  }
}
