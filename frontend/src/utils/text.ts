/**
 * 去掉 conventional commit 前缀，得到干净的 PR 描述
 * e.g. "feat: add language detection" → "add language detection"
 */
export function cleanPrTitle(title: string): string {
  const cleaned = title.replace(
    /^(feat|fix|chore|docs?|refactor|test|style|perf|build|ci|revert)(\([^)]*\))?:\s*/i,
    '',
  ).trim()
  return cleaned || title
}
