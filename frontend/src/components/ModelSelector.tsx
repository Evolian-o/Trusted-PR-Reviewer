interface Props {
  provider: string
  model: string
  onProviderChange: (v: string) => void
  onModelChange: (v: string) => void
}

const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'doubao', label: '豆包 (在线)' },
  { value: 'openai', label: 'OpenAI (在线)' },
]

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'qwen3.5:latest',
  doubao: 'doubao-pro-32k',
  openai: 'gpt-4o-mini',
}

export default function ModelSelector({ provider, model, onProviderChange, onModelChange }: Props) {
  const handleProviderChange = (v: string) => {
    onProviderChange(v)
    onModelChange(DEFAULT_MODELS[v] || '')
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2">LLM 模型</label>
      <div className="flex gap-3">
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={DEFAULT_MODELS[provider] || '输入模型名'}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}
