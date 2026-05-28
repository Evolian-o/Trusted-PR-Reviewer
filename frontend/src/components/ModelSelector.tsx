interface Props {
  provider: string
  model: string
  onProviderChange: (v: string) => void
  onModelChange: (v: string) => void
}

export default function ModelSelector({ provider, model, onProviderChange, onModelChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">LLM 模型</label>
      <div className="flex gap-3">
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ollama">Ollama (本地)</option>
        </select>
        <input
          type="text"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="qwen3.5:latest"
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}
