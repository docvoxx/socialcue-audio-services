import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

interface DialectPattern {
  dialect: 'north' | 'central' | 'south';
  patterns: string[];
  weight: number;
}

export class DialectDetector {
  private dialectPatterns: DialectPattern[] = [
    {
      dialect: 'north',
      patterns: [
        'tôi', 'anh', 'chị', 'em', 'ạ', 'ơi',
        'không', 'gì', 'thế', 'này', 'kia',
        'được', 'rồi', 'nhé', 'đây', 'đó'
      ],
      weight: 1.0
    },
    {
      dialect: 'central',
      patterns: [
        'tui', 'mình', 'bạn', 'nha', 'hở',
        'chi', 'gì', 'dzậy', 'ni', 'kia',
        'rùi', 'nhở', 'đây', 'đó', 'dzô'
      ],
      weight: 1.2
    },
    {
      dialect: 'south',
      patterns: [
        'tui', 'mình', 'anh', 'chị', 'em',
        'gì', 'sao', 'thế', 'này', 'kia',
        'rồi', 'nhé', 'đây', 'đó', 'vậy'
      ],
      weight: 1.1
    }
  ];

  async detect(text: string): Promise<'north' | 'central' | 'south'> {
    try {
      const normalizedText = this.normalizeText(text);
      const scores = this.calculateDialectScores(normalizedText);
      
      // Find dialect with highest score
      let maxScore = 0;
      let detectedDialect: 'north' | 'central' | 'south' = 'north';
      
      for (const [dialect, score] of Object.entries(scores)) {
        if (score > maxScore) {
          maxScore = score;
          detectedDialect = dialect as 'north' | 'central' | 'south';
        }
      }
      
      logger.debug('Dialect detection completed', {
        text_length: text.length,
        scores,
        detected: detectedDialect,
        confidence: maxScore,
      });
      
      return detectedDialect;
    } catch (error) {
      logger.error('Dialect detection error:', error);
      return 'north'; // Default to northern dialect
    }
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, '') // Remove non-letter characters
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateDialectScores(text: string): Record<string, number> {
    const words = text.split(' ');
    const scores: Record<string, number> = {
      north: 0,
      central: 0,
      south: 0,
    };

    for (const pattern of this.dialectPatterns) {
      let matchCount = 0;
      
      for (const word of words) {
        if (pattern.patterns.some(p => word.includes(p))) {
          matchCount++;
        }
      }
      
      // Calculate score as percentage of matching words, weighted by dialect specificity
      const score = (matchCount / words.length) * pattern.weight;
      scores[pattern.dialect] += score;
    }

    return scores;
  }

  // Additional method for more sophisticated dialect detection
  async detectWithConfidence(text: string): Promise<{
    dialect: 'north' | 'central' | 'south';
    confidence: number;
    scores: Record<string, number>;
  }> {
    const normalizedText = this.normalizeText(text);
    const scores = this.calculateDialectScores(normalizedText);
    
    const maxScore = Math.max(...Object.values(scores));
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    let detectedDialect: 'north' | 'central' | 'south' = 'north';
    for (const [dialect, score] of Object.entries(scores)) {
      if (score === maxScore) {
        detectedDialect = dialect as 'north' | 'central' | 'south';
        break;
      }
    }
    
    // Calculate confidence as the ratio of max score to total score
    const confidence = totalScore > 0 ? maxScore / totalScore : 0;
    
    return {
      dialect: detectedDialect,
      confidence,
      scores,
    };
  }
}