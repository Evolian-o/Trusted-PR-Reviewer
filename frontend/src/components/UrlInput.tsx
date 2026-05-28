interface Props {
  value: string
  onChange: (v: string) => void
  error?: string
}

export default function UrlInput({ value, onChange, error }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">GitHub PR URL</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://github.com/owner/repo/pull/123"
        className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-gray-600 focus:ring-blue-500'
        }`}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  )
}
