interface Props {
  chunk_strategy: string
  chunk_max_chars: string
  chunk_merge_max_chars: string
  chunk_max_lines: string
  onUpdate: (path: string, value: string) => void
}

export default function ChunkSettings({ chunk_strategy, chunk_max_chars, chunk_merge_max_chars, chunk_max_lines, onUpdate }: Props) {
  return (
    <section>
      <h2 className="text-white font-semibold mb-4">评审策略</h2>
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <div>
          <label className="text-gray-400 text-sm block mb-1">分片策略</label>
          <select
            value={chunk_strategy}
            onChange={(e) => onUpdate('chunk_strategy', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="auto">自动 (AST → 正则 → 行级)</option>
            <option value="ast">仅 AST (tree-sitter)</option>
            <option value="regex">仅正则</option>
            <option value="line">仅行级</option>
          </select>
          <p className="text-gray-500 text-xs mt-1">推荐使用自动模式，系统会自动选择最优分片方式</p>
        </div>
        <div>
          <label className="text-gray-400 text-sm block mb-1">Chunk 最大字符数</label>
          <input type="number" value={chunk_max_chars}
            onChange={(e) => onUpdate('chunk_max_chars', e.target.value)}
            min={1000} max={32000}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-gray-400 text-sm block mb-1">Chunk 合并阈值（字符数）</label>
          <input type="number" value={chunk_merge_max_chars}
            onChange={(e) => onUpdate('chunk_merge_max_chars', e.target.value)}
            min={1000} max={32000}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-gray-500 text-xs mt-1">相邻小函数累计不超过此值时合并到同一 chunk</p>
        </div>
        <div>
          <label className="text-gray-400 text-sm block mb-1">行级兜底最大行数</label>
          <input type="number" value={chunk_max_lines}
            onChange={(e) => onUpdate('chunk_max_lines', e.target.value)}
            min={500} max={10000}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-gray-500 text-xs mt-1">当 AST 和正则均不可用时，按此行数切分</p>
        </div>
      </div>
    </section>
  )
}
