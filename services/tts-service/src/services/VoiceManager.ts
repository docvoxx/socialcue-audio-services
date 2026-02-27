import { logger } from '@socialcue-audio-services/shared';

export interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: 'young' | 'adult' | 'elderly';
  dialect: 'north' | 'central' | 'south';
  description: string;
  model_path?: string;
  api_endpoint?: string;
}

export class VoiceManager {
  private voices: Map<string, Voice> = new Map();

  constructor() {
    this.initializeVoices();
  }

  private initializeVoices(): void {
    // Define available Vietnamese voices
    const defaultVoices: Voice[] = [
      {
        id: 'vi-female-north-young',
        name: 'Linh',
        gender: 'female',
        age: 'young',
        dialect: 'north',
        description: 'Young female voice from Northern Vietnam, clear and friendly'
      },
      {
        id: 'vi-male-north-adult',
        name: 'Minh',
        gender: 'male',
        age: 'adult',
        dialect: 'north',
        description: 'Adult male voice from Northern Vietnam, professional and warm'
      },
      {
        id: 'vi-female-south-adult',
        name: 'Mai',
        gender: 'female',
        age: 'adult',
        dialect: 'south',
        description: 'Adult female voice from Southern Vietnam, gentle and expressive'
      },
      {
        id: 'vi-male-central-adult',
        name: 'Duc',
        gender: 'male',
        age: 'adult',
        dialect: 'central',
        description: 'Adult male voice from Central Vietnam, clear and articulate'
      },
      {
        id: 'vi-female-north-adult',
        name: 'Hoa',
        gender: 'female',
        age: 'adult',
        dialect: 'north',
        description: 'Adult female voice from Northern Vietnam, confident and professional'
      }
    ];

    // Load voices into map
    for (const voice of defaultVoices) {
      this.voices.set(voice.id, voice);
    }

    logger.info('Voice manager initialized', {
      service: 'tts-service',
      voiceCount: this.voices.size,
      voiceIds: Array.from(this.voices.keys())
    });
  }

  async getVoice(voiceId: string): Promise<Voice | null> {
    return this.voices.get(voiceId) || null;
  }

  async getAllVoices(): Promise<Voice[]> {
    return Array.from(this.voices.values());
  }

  async getVoicesByDialect(dialect: 'north' | 'central' | 'south'): Promise<Voice[]> {
    return Array.from(this.voices.values()).filter(voice => voice.dialect === dialect);
  }

  async getVoicesByGender(gender: 'male' | 'female'): Promise<Voice[]> {
    return Array.from(this.voices.values()).filter(voice => voice.gender === gender);
  }

  async getDefaultVoice(): Promise<Voice> {
    // Return the default voice (young female from North)
    return this.voices.get('vi-female-north-young') || Array.from(this.voices.values())[0];
  }

  async addVoice(voice: Voice): Promise<void> {
    this.voices.set(voice.id, voice);
    logger.info('Voice added', { service: 'tts-service', voiceId: voice.id, name: voice.name });
  }

  async removeVoice(voiceId: string): Promise<boolean> {
    const removed = this.voices.delete(voiceId);
    if (removed) {
      logger.info('Voice removed', { service: 'tts-service', voiceId });
    }
    return removed;
  }

  async validateVoiceId(voiceId: string): Promise<boolean> {
    return this.voices.has(voiceId);
  }

  async getRecommendedVoice(preferences?: {
    gender?: 'male' | 'female';
    dialect?: 'north' | 'central' | 'south';
    age?: 'young' | 'adult' | 'elderly';
  }): Promise<Voice> {
    if (!preferences) {
      return this.getDefaultVoice();
    }

    let candidates = Array.from(this.voices.values());

    // Filter by preferences
    if (preferences.gender) {
      candidates = candidates.filter(voice => voice.gender === preferences.gender);
    }
    
    if (preferences.dialect) {
      candidates = candidates.filter(voice => voice.dialect === preferences.dialect);
    }
    
    if (preferences.age) {
      candidates = candidates.filter(voice => voice.age === preferences.age);
    }

    // Return first match or default voice
    return candidates[0] || await this.getDefaultVoice();
  }
}