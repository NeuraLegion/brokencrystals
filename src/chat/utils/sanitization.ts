export function sanitizeChatMessage(content: string): string {
  // Basic sanitization method to remove potentially harmful characters
  // Customize according to actual security policy and requirements
  return content.replace(/[<>"'\/]/g, '');
}
