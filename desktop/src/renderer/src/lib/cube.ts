// Parser for Adobe/Resolve .cube 3D LUT files -> RGB8 data for a 3D texture.

export interface ParsedLut {
  size: number
  data: Uint8Array
  title: string
}

export function parseCube(text: string): ParsedLut {
  let size = 0
  let title = ''
  let domainMin = [0, 0, 0]
  let domainMax = [1, 1, 1]
  const values: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const key = parts[0].toUpperCase()
    if (key === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '')
    else if (key === 'LUT_3D_SIZE') size = parseInt(parts[1], 10)
    else if (key === 'DOMAIN_MIN') domainMin = parts.slice(1, 4).map(Number)
    else if (key === 'DOMAIN_MAX') domainMax = parts.slice(1, 4).map(Number)
    else if (key === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported, use a 3D .cube file')
    else if (/^[-+0-9.]/.test(key) && parts.length >= 3) values.push(+parts[0], +parts[1], +parts[2])
  }
  if (!size || size < 2 || size > 128) throw new Error('Missing or invalid LUT_3D_SIZE')
  if (values.length < size * size * size * 3) throw new Error('LUT file is incomplete')
  const data = new Uint8Array(size * size * size * 3)
  for (let i = 0; i < data.length; i++) {
    const c = i % 3
    const v = (values[i] - domainMin[c]) / (domainMax[c] - domainMin[c] || 1)
    data[i] = Math.round(Math.min(1, Math.max(0, v)) * 255)
  }
  return { size, data, title }
}
