import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

export class ConfidenceScorer {
  private readonly minConfidence = 0.1;
  private readonly maxConfidence = 1.0;

  calculate(
    text: string,
    logprobs: number[] = [],
    dialect?: string
  ): number {
    try {
      // Base confidence from text characteristics
      const textConfidence = this.calculateTextConfidence(text);
      
      // Confidence from model logprobs
      const modelConfidence = this.calculateModelConfidence(logprobs);
      
      // Dialect-specific adjustments
      const dialectAdjustment = this.calculateDialectAdjustment(text, dialect);
      
      // Combine scores with weights
      const combinedConfidence = (
        textConfidence * 0.4 +
        modelConfidence * 0.5 +
        dialectAdjustment * 0.1
      );
      
      // Clamp to valid range
      const finalConfidence = Math.max(
        this.minConfidence,
        Math.min(this.maxConfidence, combinedConfidence)
      );
      
      logger.debug('Confidence calculation', {
        text_length: text.length,
        text_confidence: textConfidence,
        model_confidence: modelConfidence,
        dialect_adjustment: dialectAdjustment,
        final_confidence: finalConfidence,
      });
      
      return finalConfidence;
    } catch (error) {
      logger.error('Confidence scoring error:', error);
      return 0.5; // Default moderate confidence
    }
  }

  private calculateTextConfidence(text: string): number {
    if (!text || text.trim().length === 0) {
      return 0.1;
    }
    
    let score = 0.5; // Base score
    
    // Length factor - very short or very long texts are less reliable
    const length = text.trim().length;
    if (length < 5) {
      score -= 0.3;
    } else if (length > 500) {
      score -= 0.2;
    } else if (length >= 20 && length <= 200) {
      score += 0.2; // Optimal length range
    }
    
    // Word count factor
    const words = text.trim().split(/\s+/);
    if (words.length >= 3 && words.length <= 50) {
      score += 0.1;
    }
    
    // Vietnamese language characteristics
    score += this.calculateVietnameseCharacteristics(text);
    
    // Repetition penalty
    score -= this.calculateRepetitionPenalty(text);
    
    return Math.max(0.1, Math.min(1.0, score));
  }

  private calculateModelConfidence(logprobs: number[]): number {
    if (!logprobs || logprobs.length === 0) {
      return 0.5; // Default when no logprobs available
    }
    
    // Convert log probabilities to confidence
    const avgLogprob = logprobs.reduce((sum, prob) => sum + prob, 0) / logprobs.length;
    
    // Convert to confidence score (higher logprob = higher confidence)
    // Typical logprobs range from -10 to 0
    const confidence = Math.exp(Math.max(-5, avgLogprob)); // Clamp to prevent extreme values
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private calculateVietnameseCharacteristics(text: string): number {
    let score = 0;
    
    // Check for Vietnamese diacritics
    const vietnameseDiacritics = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
    const diacriticMatches = text.match(vietnameseDiacritics);
    if (diacriticMatches) {
      score += Math.min(0.2, diacriticMatches.length / text.length);
    }
    
    // Check for common Vietnamese words
    const commonVietnameseWords = [
      'tôi', 'bạn', 'anh', 'chị', 'em', 'không', 'có', 'là', 'được', 'rồi',
      'này', 'đó', 'gì', 'sao', 'thế', 'như', 'để', 'cho', 'với', 'của'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    const vietnameseWordCount = words.filter(word => 
      commonVietnameseWords.some(vw => word.includes(vw))
    ).length;
    
    if (vietnameseWordCount > 0) {
      score += Math.min(0.2, vietnameseWordCount / words.length);
    }
    
    return score;
  }

  private calculateRepetitionPenalty(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    if (words.length < 3) return 0;
    
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    
    // Calculate repetition ratio
    const totalRepeats = Array.from(wordCounts.values())
      .filter(count => count > 1)
      .reduce((sum, count) => sum + (count - 1), 0);
    
    const repetitionRatio = totalRepeats / words.length;
    
    // Penalty increases with repetition ratio
    return Math.min(0.3, repetitionRatio * 0.5);
  }

  private calculateDialectAdjustment(_text: string, dialect?: string): number {
    if (!dialect) return 0;
    
    // Small bonus for detected dialect consistency
    // This could be expanded with more sophisticated dialect-specific confidence adjustments
    return 0.05;
  }

  // Method to determine if confidence is acceptable for the given use case
  isAcceptableConfidence(confidence: number, threshold: number = 0.7): boolean {
    return confidence >= threshold;
  }

  // Method to get confidence category
  getConfidenceCategory(confidence: number): 'low' | 'medium' | 'high' {
    if (confidence < 0.5) return 'low';
    if (confidence < 0.8) return 'medium';
    return 'high';
  }
}