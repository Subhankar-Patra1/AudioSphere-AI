import {Blob} from '@google/genai';

function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  // Extract interleaved channels
  if (numChannels === 0) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i,
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}

function pcmToWav(pcmData: Float32Array, sampleRate: number, numChannels: number): Blob {
    const dataLength = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataLength * 2);
    const view = new DataView(buffer);

    let offset = 0;

    const writeString = (str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
        offset += str.length;
    };

    const writeUint32 = (val: number) => {
        view.setUint32(offset, val, true); // little-endian
        offset += 4;
    };

    const writeUint16 = (val: number) => {
        view.setUint16(offset, val, true); // little-endian
        offset += 2;
    };

    // RIFF header
    writeString('RIFF');
    writeUint32(36 + dataLength * 2);
    writeString('WAVE');

    // fmt chunk
    writeString('fmt ');
    writeUint32(16); // chunk size
    writeUint16(1); // audio format (1 = PCM)
    writeUint16(numChannels);
    writeUint32(sampleRate);
    writeUint32(sampleRate * numChannels * 2); // byte rate
    writeUint16(numChannels * 2); // block align
    writeUint16(16); // bits per sample

    // data chunk
    writeString('data');
    writeUint32(dataLength * 2);

    // Write PCM data
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, pcmData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    const bytes = new Uint8Array(buffer);

    return {
        data: encode(bytes),
        mimeType: 'audio/wav'
    };
}


export {createBlob, decode, decodeAudioData, encode, pcmToWav};