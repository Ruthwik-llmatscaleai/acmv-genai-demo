import { describe, it, expect } from 'vitest';
import { hashFileContent } from '@/lib/pipeline-orchestrator';

describe('hashFileContent', () => {
  it('returns consistent SHA-256 hash for same content', () => {
    const buf = Buffer.from('test content');
    const hash1 = hashFileContent(buf);
    const hash2 = hashFileContent(buf);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('returns different hash for different content', () => {
    const hash1 = hashFileContent(Buffer.from('content A'));
    const hash2 = hashFileContent(Buffer.from('content B'));
    expect(hash1).not.toBe(hash2);
  });
});
