/* tslint:disable */

import {GoogleGenAI, LiveServerMessage, Modality, Session, Blob} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData, pcmToWav} from './utils';
import './visual-3d';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() isReady = false;
  @state() status = '';
  @state() error = '';
  @state() isIdentifying = false;
  @state() identifiedSong: { title: string; artist: string; links: { youtube: string; youtubeMusic: string; spotify: string; } } | null = null;
  @state() identificationError = '';
  @state() isWriting = false;
  @state() writtenContent: string | null = null;
  @state() writingError = '';
  @state() showSettings = false;
  @state() userApiKey: string = localStorage.getItem('userApiKey') || '';

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  private audioChunks: Float32Array[] = [];
  private mediaStreamForIdentification: MediaStream | null = null;
  private sourceNodeForIdentification: MediaStreamAudioSourceNode | null = null;
  private scriptProcessorNodeForIdentification: ScriptProcessorNode | null = null;


  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      text-shadow: 0 0 4px black;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: row;
      gap: 20px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button.identifying, button.writing {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.2);
      }

      button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    #results-container, #write-container {
      position: absolute;
      top: 5vh;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 20px;
      color: white;
      z-index: 20;
      max-width: 80vw;
      width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }
    #results-container h3 {
      margin: 0 0 5px 0;
      font-size: 1.5em;
    }
    #results-container p {
      margin: 0 0 15px 0;
      opacity: 0.8;
    }
    #results-container .links {
      display: flex;
      gap: 15px;
      justify-content: center;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }
    #results-container .links a {
      color: #a7c5ff;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.1);
      padding: 8px 12px;
      border-radius: 8px;
      transition: background 0.3s;
    }
    #results-container .links a:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    #results-container button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        padding: 5px 10px;
        cursor: pointer;
        font-size: 0.8em;
    }
    #results-container button:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    #write-container .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    #write-container h4 {
      margin: 0;
      font-size: 1.2em;
    }

    #write-container .header-buttons {
      display: flex;
      gap: 10px;
    }
    
    #write-container .header-buttons button {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 5px;
    }

    #write-container pre {
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      padding: 15px;
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-y: auto;
      flex-grow: 1;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9em;
    }
  `;

  constructor() {
    super();
    this.checkApiKeyAndSetError();
    if (this.userApiKey) {
      this.initClient();
    }
  }

  private checkApiKeyAndSetError() {
    if (!this.userApiKey) {
      this.error = this.beautifyError('API key');
      this.isReady = false;
    } else {
      this.error = '';
      this.isReady = true;
    }
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private openSettings = () => { this.showSettings = true; };
  private closeSettings = () => { this.showSettings = false; };
  private handleApiKeyChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    this.userApiKey = target.value;
  };
  private saveApiKey = () => {
    localStorage.setItem('userApiKey', this.userApiKey);
    this.closeSettings();
    this.checkApiKeyAndSetError();
    if (this.userApiKey) {
      this.initClient();
    }
  };

  private getEffectiveApiKey() {
    return this.userApiKey || process.env.API_KEY;
  }

  private async initClient() {
    this.initAudio();
    this.client = new GoogleGenAI({
      apiKey: this.getEffectiveApiKey(),
    });
    this.outputNode.connect(this.outputAudioContext.destination);
    this.initSession();
  }

  private beautifyError(msg: string): string {
    if (
      msg.includes("You exceeded your current quota")
    ) {
      return `
        <div style="color: #fff; background: #c80000; border-radius: 12px; padding: 20px; font-size: 1.1em; box-shadow: 0 2px 16px #000a; max-width: 400px; margin: 24px auto; text-align: center;">
          <svg xmlns='http://www.w3.org/2000/svg' height='48' width='48' fill='#fff' style='background:#c80000; border-radius:50%; margin-bottom:12px;'><path d='M24 44q-4.15 0-7.8-1.575-3.65-1.575-6.375-4.3Q7.1 35.4 5.525 31.75 3.95 28.1 3.95 23.95q0-4.15 1.575-7.8Q7.1 12.5 9.825 9.775q2.725-2.725 6.375-4.3Q19.85 3.9 24 3.9q4.15 0 7.8 1.575 3.65 1.575 6.375 4.3 2.725 2.725 4.3 6.375Q44.05 19.8 44.05 23.95q0 4.15-1.575 7.8-1.575 3.65-4.3 6.375-2.725 2.725-6.375 4.3Q28.15 44 24 44Zm-2.1-8.05h4.2v-4.2h-4.2Zm0-8.05h4.2v-12.1h-4.2Z'/></svg>
          <div><b>Quota Exceeded</b></div>
          <div style='margin-top:8px;'>You have exceeded your current API quota.<br/>Please check your plan and billing details.<br/>
          <a href='https://aistudio.google.com/app/apikey' target='_blank' rel='noopener noreferrer' style='color: #3b82f6; text-decoration: underline;'>Manage your API key</a></div>
        </div>
      `;
    }
    if (
      msg.includes("Method doesn't allow unregistered callers") ||
      msg.includes('API key') ||
      msg.includes('callers without established identity')
    ) {
      return `
        <div style="color: #fff; background: #c80000; border-radius: 12px; padding: 20px; font-size: 1.1em; box-shadow: 0 2px 16px #000a; max-width: 400px; margin: 24px auto; text-align: center;">
          <svg xmlns='http://www.w3.org/2000/svg' height='48' width='48' fill='#fff' style='background:#c80000; border-radius:50%; margin-bottom:12px;'><path d='M24 44q-4.15 0-7.8-1.575-3.65-1.575-6.375-4.3Q7.1 35.4 5.525 31.75 3.95 28.1 3.95 23.95q0-4.15 1.575-7.8Q7.1 12.5 9.825 9.775q2.725-2.725 6.375-4.3Q19.85 3.9 24 3.9q4.15 0 7.8 1.575 3.65 1.575 6.375 4.3 2.725 2.725 4.3 6.375Q44.05 19.8 44.05 23.95q0 4.15-1.575 7.8-1.575 3.65-4.3 6.375-2.725 2.725-6.375 4.3Q28.15 44 24 44Zm-2.1-8.05h4.2v-4.2h-4.2Zm0-8.05h4.2v-12.1h-4.2Z'/></svg>
          <div><b>API Key Required</b></div>
          <div style='margin-top:8px;'>To use AI features, please provide your own API key.<br/>Click the <b>Settings</b> icon <svg xmlns='http://www.w3.org/2000/svg' height='18' width='18' viewBox='0 0 24 24' fill='#fff' style='vertical-align:middle;'><path d='M19.14,12.94a7.07,7.07,0,0,0,0-1.88l2-1.56a.5.5,0,0,0,.12-.65l-1.9-3.3a.5.5,0,0,0-.61-.22l-2.35,1a7,7,0,0,0-1.6-.93l-.36-2.49A.5.5,0,0,0,14,2H10a.5.5,0,0,0-.5.42l-.36,2.49a7,7,0,0,0-1.6.93l-2.35-1a.5.5,0,0,0-.61.22l-1.9,3.3a.5.5,0,0,0,.12.65l2,1.56a7.07,7.07,0,0,0,0,1.88l-2,1.56a.5.5,0,0,0-.12.65l1.9,3.3a.5.5,0,0,0,.61.22l2.35-1a7,7,0,0,0,1.6.93l.36,2.49A.5.5,0,0,0,10,22h4a.5.5,0,0,0,.5-.42l.36-2.49a7,7,0,0,0,1.6-.93l2.35,1a.5.5,0,0,0,.61-.22l1.9-3.3a.5.5,0,0,0-.12-.65ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z'/></svg> at the top right to enter your key.</div>
        </div>
      `;
    }
    return msg;
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    this.isReady = false;

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Connected');
            this.isReady = true;
            this.error = '';
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              // If we are no longer in a recording state, ignore any latent
              // audio packets coming from the server.
              if (!this.isRecording) {
                return;
              }

              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
            this.isReady = false;
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Closed: ' + e.reason);
            if (
              e.reason.includes("You exceeded your current quota")
            ) {
              this.updateError(e.reason);
            } else if (
              e.reason.includes("Method doesn't allow unregistered callers") ||
              e.reason.includes('API key') ||
              e.reason.includes('callers without established identity')
            ) {
              this.updateError(e.reason);
            }
            this.isReady = false;
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            // By omitting languageCode and voiceConfig, we enable automatic
            // language detection for the user's speech and automatic voice
            // selection for the AI's response. This allows for multi-language
            // conversations.
          },
        },
      });
    } catch (e) {
      console.error(e);
      this.updateError((e as Error).message);
      this.isReady = false;
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.requestUpdate();
  }

  private updateError(msg: string) {
    this.error = this.beautifyError(msg);
    this.requestUpdate();
  }

  private async startRecording() {
    if (this.isRecording || !this.isReady || this.isIdentifying || this.isWriting) {
      return;
    }

    if (!this.session) {
      this.updateError('Session not available. Please reset.');
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording || !this.session) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateError((err as Error).message);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Stop any ongoing AI audio playback immediately
    for (const source of this.sources.values()) {
        source.stop();
        this.sources.delete(source);
    }
    this.nextStartTime = 0;

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private async handleIdentifyClick() {
    if (this.isIdentifying) {
      await this.stopSongIdentificationAndProcess();
    } else {
      await this.startSongIdentification();
    }
  }

  private async startSongIdentification() {
    if (this.isRecording || this.isWriting) return;

    this.isIdentifying = true;
    this.identifiedSong = null;
    this.identificationError = '';
    this.audioChunks = [];

    await this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStreamForIdentification = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('🎤 Recording song... Sing now!');

      this.sourceNodeForIdentification = this.inputAudioContext.createMediaStreamSource(
          this.mediaStreamForIdentification
      );
      this.sourceNodeForIdentification.connect(this.inputNode);

      const bufferSize = 4096;
      this.scriptProcessorNodeForIdentification =
        this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessorNodeForIdentification.onaudioprocess = (
        audioProcessingEvent,
      ) => {
        if (!this.isIdentifying) return;
        const pcmData = audioProcessingEvent.inputBuffer.getChannelData(0).slice();
        this.audioChunks.push(pcmData);
      };

      this.sourceNodeForIdentification.connect(this.scriptProcessorNodeForIdentification);
      this.scriptProcessorNodeForIdentification.connect(this.inputAudioContext.destination);
    } catch (err) {
      console.error('Error starting song identification:', err);
      this.updateError((err as Error).message);
      this.isIdentifying = false;
    }
  }

  private concatenateAudioChunks(): Float32Array {
    const totalLength = this.audioChunks.reduce((acc, val) => acc + val.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    this.audioChunks = [];
    return result;
  }

  private async stopSongIdentificationAndProcess() {
    this.updateStatus('Processing audio...');
    this.isIdentifying = false;

    if (this.scriptProcessorNodeForIdentification && this.sourceNodeForIdentification) {
      this.scriptProcessorNodeForIdentification.disconnect();
      this.sourceNodeForIdentification.disconnect();
    }

    if (this.mediaStreamForIdentification) {
      this.mediaStreamForIdentification.getTracks().forEach((track) => track.stop());
    }

    this.scriptProcessorNodeForIdentification = null;
    this.sourceNodeForIdentification = null;
    this.mediaStreamForIdentification = null;

    const audioData = this.concatenateAudioChunks();
    const peakAmplitude = audioData.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    
    // Check for meaningful audio input. A recording shorter than 0.2s or silent is ignored.
    if (audioData.length < 3200 || peakAmplitude < 0.05) {
      this.identificationError = 'Please sing or say something to identify the song.';
      this.updateStatus('');
      this.identifiedSong = null;
      setTimeout(() => {
        if (this.identificationError === 'Please sing or say something to identify the song.') {
          this.identificationError = '';
        }
      }, 3000);
      return;
    }

    this.updateStatus('Identifying song...');

    try {
      const wavBlob: Blob = pcmToWav(audioData, this.inputAudioContext.sampleRate, 1);

      const textPart = {
        text: `You are an expert in music. A user is singing a song, and you will be provided with the audio. Listen to the audio and identify the song. Respond in JSON format with "songTitle" and "artist" as keys. If you cannot identify the song, the values for these keys should be null.`,
      };

      const audioPart = {
        inlineData: {
          mimeType: wavBlob.mimeType,
          data: wavBlob.data,
        },
      };

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: {parts: [textPart, audioPart]},
        config: {
          responseMimeType: 'application/json',
        },
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }

      const result = JSON.parse(jsonStr);

      if (result && result.songTitle && result.artist) {
        const title = result.songTitle;
        const artist = result.artist;
        const query = encodeURIComponent(`${title} ${artist}`);
        this.identifiedSong = {
          title,
          artist,
          links: {
            youtube: `https://www.youtube.com/results?search_query=${query}`,
            youtubeMusic: `https://music.youtube.com/search?q=${query}`,
            spotify: `https://open.spotify.com/search/${query}`,
          },
        };
        this.updateStatus('Song identified!');
        this.identificationError = '';
      } else {
        this.identificationError = 'Could not identify the song. Please try again.';
        this.identifiedSong = null;
        this.updateStatus('');
      }
    } catch (e) {
      console.error('Error identifying song:', e);
      this.identificationError = 'An error occurred during identification.';
      this.identifiedSong = null;
      this.updateStatus('');
    }
  }
  
  private async handleWriteClick() {
    if (this.isWriting) {
      await this.stopWritingAndProcess();
    } else {
      await this.startWriting();
    }
  }

  private async startWriting() {
    if (this.isRecording || this.isIdentifying) return;

    this.isWriting = true;
    this.writtenContent = null;
    this.writingError = '';
    this.audioChunks = [];

    await this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStreamForIdentification = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('🎤 Listening for your request...');

      this.sourceNodeForIdentification = this.inputAudioContext.createMediaStreamSource(
          this.mediaStreamForIdentification
      );
      this.sourceNodeForIdentification.connect(this.inputNode);

      const bufferSize = 4096;
      this.scriptProcessorNodeForIdentification =
        this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessorNodeForIdentification.onaudioprocess = (
        audioProcessingEvent,
      ) => {
        if (!this.isWriting) return;
        const pcmData = audioProcessingEvent.inputBuffer.getChannelData(0).slice();
        this.audioChunks.push(pcmData);
      };

      this.sourceNodeForIdentification.connect(this.scriptProcessorNodeForIdentification);
      this.scriptProcessorNodeForIdentification.connect(this.inputAudioContext.destination);
    } catch (err) {
      console.error('Error starting write request:', err);
      this.updateError((err as Error).message);
      this.isWriting = false;
    }
  }
  
  private async stopWritingAndProcess() {
    this.isWriting = false;

    if (this.scriptProcessorNodeForIdentification && this.sourceNodeForIdentification) {
      this.scriptProcessorNodeForIdentification.disconnect();
      this.sourceNodeForIdentification.disconnect();
    }

    if (this.mediaStreamForIdentification) {
      this.mediaStreamForIdentification.getTracks().forEach((track) => track.stop());
    }

    this.scriptProcessorNodeForIdentification = null;
    this.sourceNodeForIdentification = null;
    this.mediaStreamForIdentification = null;

    const audioData = this.concatenateAudioChunks();
    const peakAmplitude = audioData.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);

    // Check for meaningful audio input. A recording shorter than 0.2s or silent is ignored.
    if (audioData.length < 3200 || peakAmplitude < 0.05) {
      this.writingError = 'Please say something to generate content.';
      this.updateStatus('');
      this.writtenContent = null;
      setTimeout(() => {
        if (this.writingError === 'Please say something to generate content.') {
          this.writingError = '';
        }
      }, 3000);
      return;
    }

    this.updateStatus('Generating content...');

    try {
      const wavBlob: Blob = pcmToWav(audioData, this.inputAudioContext.sampleRate, 1);

      const textPart = {
        text: `You are a writing assistant. A user has provided an audio recording of a request to write or generate content (like code, an email, a story, etc.). First, transcribe the user's audio request. Second, fulfill the request based on the transcription. Your final response should ONLY be the generated content itself, without any conversational preamble, explanations, or markdown formatting.`,
      };

      const audioPart = {
        inlineData: {
          mimeType: wavBlob.mimeType,
          data: wavBlob.data,
        },
      };
      
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: {parts: [textPart, audioPart]},
      });

      this.writtenContent = response.text;
      this.updateStatus('Content generated.');
    } catch (e) {
      console.error('Error generating written content:', e);
      this.writingError = 'An error occurred while generating content.';
      this.writtenContent = null;
      this.updateStatus('');
    }
  }
  
  private copyWrittenContent() {
    if (!this.writtenContent) return;
    navigator.clipboard.writeText(this.writtenContent);
    this.updateStatus('Content copied to clipboard!');
    setTimeout(() => {
      if (this.status === 'Content copied to clipboard!') {
        this.updateStatus('');
      }
    }, 2000);
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  render() {
    const showApiKeyError = !this.userApiKey;
    return html`
      <div>
        <!-- Settings Icon -->
        <button @click=${this.openSettings} title="Settings" style="position: absolute; top: 20px; right: 20px; z-index: 30; background: none; border: none; cursor: pointer;">
          <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 24 24" fill="#fff"><path d="M19.14,12.94a7.07,7.07,0,0,0,0-1.88l2-1.56a.5.5,0,0,0,.12-.65l-1.9-3.3a.5.5,0,0,0-.61-.22l-2.35,1a7,7,0,0,0-1.6-.93l-.36-2.49A.5.5,0,0,0,14,2H10a.5.5,0,0,0-.5.42l-.36,2.49a7,7,0,0,0-1.6.93l-2.35-1a.5.5,0,0,0-.61.22l-1.9,3.3a.5.5,0,0,0,.12.65l2,1.56a7.07,7.07,0,0,0,0,1.88l-2,1.56a.5.5,0,0,0-.12.65l1.9,3.3a.5.5,0,0,0,.61.22l2.35-1a7,7,0,0,0,1.6.93l.36,2.49A.5.5,0,0,0,10,22h4a.5.5,0,0,0,.5-.42l.36-2.49a7,7,0,0,0,1.6-.93l2.35,1a.5.5,0,0,0,.61-.22l1.9-3.3a.5.5,0,0,0-.12-.65ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
        </button>
        <!-- Settings Overlay -->
        ${this.showSettings ? html`
          <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 100; display: flex; align-items: center; justify-content: center;">
            <div style="background: #222; padding: 32px 24px; border-radius: 16px; min-width: 320px; color: #fff; box-shadow: 0 4px 32px #000a; position: relative;">
              <button @click=${this.closeSettings} style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: #fff; font-size: 24px; cursor: pointer;">&times;</button>
              <h2 style="margin-top: 0;">Settings</h2>
              <label for="apiKeyInput" style="display: block; margin-bottom: 8px;">Your API Key</label>
              <input id="apiKeyInput" type="text" .value=${this.userApiKey} @input=${this.handleApiKeyChange} style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #444; background: #111; color: #fff; margin-bottom: 8px;" placeholder="Enter your API key here..." />
              <div style="font-size: 0.95em; color: #bdbdbd; margin-bottom: 16px;">
                <b>Tip:</b> You can get your Gemini API key from
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">Google AI Studio</a>.
                Sign in, create a project, and generate your API key.
              </div>
              <button @click=${this.saveApiKey} style="padding: 8px 16px; border-radius: 6px; border: none; background: #3b82f6; color: #fff; font-weight: bold; cursor: pointer;">Save</button>
            </div>
          </div>
        ` : ''}
        ${showApiKeyError ? html`
          <div style="margin-top: 60px;">${unsafeHTML(this.beautifyError('API key'))}</div>
        ` : html`
          ${this.identifiedSong ? html`
            <div id="results-container">
                <h3>${this.identifiedSong.title}</h3>
                <p>by ${this.identifiedSong.artist}</p>
                <div class="links">
                    <a href=${this.identifiedSong.links.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>
                    <a href=${this.identifiedSong.links.youtubeMusic} target="_blank" rel="noopener noreferrer">YouTube Music</a>
                    <a href=${this.identifiedSong.links.spotify} target="_blank" rel="noopener noreferrer">Spotify</a>
                </div>
                <button @click=${() => { this.identifiedSong = null; }}>Clear</button>
            </div>
          ` : ''}
          
          ${this.writtenContent ? html`
            <div id="write-container">
              <div class="header">
                <h4>Generated Content</h4>
                <div class="header-buttons">
                  <button @click=${this.copyWrittenContent} title="Copy Content">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-720v480-480Z"/></svg>
                  </button>
                  <button @click=${() => { this.writtenContent = null; this.writingError = ''; }} title="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                  </button>
                </div>
              </div>
              <pre><code>${this.writtenContent}</code></pre>
            </div>
          ` : ''}

          <div class="controls">
            <button
              id="resetButton"
              @click=${this.reset}
              ?disabled=${this.isRecording || this.isIdentifying || this.isWriting}
              title="Reset Session">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="40px"
                viewBox="0 -960 960 960"
                width="40px"
                fill="#ffffff">
                <path
                  d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
              </svg>
            </button>
            
            <button
              id="writeButton"
              @click=${this.handleWriteClick}
              ?disabled=${this.isRecording || this.isIdentifying}
              class=${this.isWriting ? 'writing' : ''}
              title=${this.isWriting ? 'Stop Recording and Generate' : 'Write Content'}>
                ${this.isWriting ? html`
                  <svg
                    viewBox="0 0 100 100"
                    width="32px"
                    height="32px"
                    fill="#ffffff"
                    xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="100" height="100" rx="15" />
                  </svg>` : html`
                  <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="#ffffff"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
                `}
            </button>

            <button
              id="identifyButton"
              @click=${this.handleIdentifyClick}
              ?disabled=${this.isRecording || this.isWriting}
              class=${this.isIdentifying ? 'identifying' : ''}
              title=${this.isIdentifying ? 'Stop and Identify Song' : 'Identify a Song'}>
              ${this.isIdentifying
                ? html`
                  <svg
                    viewBox="0 0 100 100"
                    width="32px"
                    height="32px"
                    fill="#ffffff"
                    xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="100" height="100" rx="15" />
                  </svg>`
                : html`
                  <svg xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="#ffffff">
                    <path d="M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v320h-80v-320H240v640h200v80H240Zm440-40v-120h-80v-80h80v-120h80v120h80v80h-80v120h-80Z"/>
                  </svg>`
              }
            </button>

            <button
              id="startButton"
              @click=${this.startRecording}
              ?disabled=${!this.isReady || this.isRecording || this.isIdentifying || this.isWriting}
              title="Start Live Chat">
              <svg
                viewBox="0 0 100 100"
                width="32px"
                height="32px"
                fill="#c80000"
                xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="50" />
              </svg>
            </button>
            <button
              id="stopButton"
              @click=${this.stopRecording}
              ?disabled=${!this.isRecording}
              title="Stop Live Chat">
              <svg
                viewBox="0 0 100 100"
                width="32px"
                height="32px"
                fill="#000000"
                xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="100" height="100" rx="15" />
              </svg>
            </button>
          </div>
        `}
        <div id="status">
          ${this.writingError || this.identificationError ? (this.writingError || this.identificationError) : this.error ? unsafeHTML(this.error) : this.status}
        </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}