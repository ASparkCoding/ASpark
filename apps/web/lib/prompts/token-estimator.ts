/**
 * 快速 token 估算（不依赖 tiktoken）
 * 基于 GPT 系列 tokenizer 的经验比例
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  let i = 0;
  while (i < text.length) {
    const char = text.charCodeAt(i);
    if (char >= 0x4e00 && char <= 0x9fff) {
      // CJK 字符：约 1 char → 1 token
      tokens += 1;
      i++;
    } else if (char >= 0x20 && char <= 0x7e) {
      // ASCII: 按英文词估算
      // 跳过连续 ASCII（一个英文词 ≈ 1.3 tokens）
      let wordLen = 0;
      while (
        i < text.length &&
        text.charCodeAt(i) >= 0x20 &&
        text.charCodeAt(i) <= 0x7e
      ) {
        i++;
        wordLen++;
      }
      tokens += Math.ceil(wordLen / 4); // 约 4 chars/token for code
    } else {
      tokens += 1;
      i++;
    }
  }
  return tokens;
}

export function getContextTokenLimit(type: string): number {
  switch (type) {
    case 'scaffold':
    case 'refactor':
      return 120000; // Kimi K2.5 has 262K context
    case 'iterate':
    case 'reason':
      return 20000; // DeepSeek needs room for output
    case 'complete':
      return 4000; // Doubao fast, minimal context
    default:
      return 20000;
  }
}
