/**
 * 去掉 conventional commit 前缀或 GitHub 合并标题，得到干净的 PR 描述
 * e.g. "feat: add language detection" → "add language detection"
 * e.g. "Merge pull request #42 from feature/auth" → "feature/auth"
 */
export function cleanPrTitle(title: string): string {
  const cleaned = title
    .replace(/^Merge pull request #[0-9]+ from /i, '')
    .replace(
      /^(feat|fix|chore|docs?|refactor|test|style|perf|build|ci|revert)(\([^)]*\))?:\s*/i,
      '',
    )
    .trim()
  return cleaned || title
}
