export interface ProductProfile {
  name: string;
  description: string;
  tone: string;
  instructions: string;
}

export interface TranscriptionEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}
