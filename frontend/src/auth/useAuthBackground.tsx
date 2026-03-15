import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'itsm.authBackground'

async function loadImage(url: string) {
  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('failed'))
    img.src = url
  })
}

export function useAuthBackground() {
  const [customUrl, setCustomUrl] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (customUrl) {
      document.documentElement.style.setProperty('--auth-bg-image', `url("${customUrl}")`)
      return
    }

    async function pickDefault() {
      try {
        await loadImage('/login-bg.jpg')
        document.documentElement.style.setProperty('--auth-bg-image', `url("/login-bg.jpg")`)
      } catch {
        document.documentElement.style.setProperty('--auth-bg-image', `url("/login-bg.svg")`)
      }
    }

    void pickDefault()
  }, [customUrl])

  const openPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setCustomUrl(null)
    document.documentElement.style.removeProperty('--auth-bg-image')
  }, [])

  const onFileChange = useCallback(async (file: File | null) => {
    if (!file) return
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsDataURL(file)
    })
    if (!url.startsWith('data:image/')) return
    localStorage.setItem(STORAGE_KEY, url)
    setCustomUrl(url)
    document.documentElement.style.setProperty('--auth-bg-image', `url("${url}")`)
  }, [])

  const fileInput = useMemo(
    () => (
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
      />
    ),
    [onFileChange],
  )

  return { isCustom: Boolean(customUrl), openPicker, clear, fileInput }
}
