/**
 * 格式化时间显示（数据库存的是本地时间 "YYYY-MM-DD HH:MM:SS"）
 */
export function formatLocalTime(isoString: string | undefined | null): string {
  if (!isoString) return ''
  return isoString.replace('T', ' ')
}
