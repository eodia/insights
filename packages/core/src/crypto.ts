/** Secrets au repos : AES-256-GCM (iv 12 octets + tag 16 octets + texte chiffré). Repris de dblumi. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export function encrypt(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}

export function decrypt(key: Buffer, data: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
  decipher.setAuthTag(data.subarray(12, 28))
  return decipher.update(data.subarray(28), undefined, 'utf8') + decipher.final('utf8')
}

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

/** A random token, URL-safe. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')

const SCRYPT = { N: 16384, r: 8, p: 1 } as const

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

/** `scrypt$<salt>$<hash>`, both base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'))
  const expected = Buffer.from(hash, 'base64')
  return key.length === expected.length && timingSafeEqual(key, expected)
}
