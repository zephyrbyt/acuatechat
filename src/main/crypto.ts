import nacl from 'tweetnacl'
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util'
import { scryptSync, scrypt, randomBytes } from 'crypto'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

export interface KeyPair {
  publicKey: string // base64
  secretKey: string // base64
}

// --- At-rest encryption (nacl.secretbox / XSalsa20-Poly1305) ---

// Derive a 32-byte storage key from the user's secret key.
// Used to encrypt all stored data (messages, contacts, profile).
// The secret key is already 32 bytes of high-entropy random material,
// so we just hash it to produce a domain-separated storage key.
export function deriveStorageKey(secretKeyB64: string): Uint8Array {
  const secretKey = decodeBase64(secretKeyB64)
  // Domain-separate with a fixed label so storage key ≠ signing key
  const label = decodeUTF8('acuate-storage-key-v1')
  const combined = new Uint8Array(label.length + secretKey.length)
  combined.set(label)
  combined.set(secretKey, label.length)
  return nacl.hash(combined).slice(0, 32)
}

// Encrypt arbitrary JSON data with nacl.secretbox.
// Returns a base64-encoded string: nonce(24) || ciphertext
export function encryptData(plaintext: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = decodeUTF8(plaintext)
  const box = nacl.secretbox(messageBytes, nonce, key)
  const out = new Uint8Array(nonce.length + box.length)
  out.set(nonce)
  out.set(box, nonce.length)
  return encodeBase64(out)
}

// Decrypt a base64-encoded secretbox payload. Returns plaintext or null.
export function decryptData(ciphertextB64: string, key: Uint8Array): string | null {
  try {
    const data = decodeBase64(ciphertextB64)
    const nonce = data.slice(0, nacl.secretbox.nonceLength)
    const box = data.slice(nacl.secretbox.nonceLength)
    const decrypted = nacl.secretbox.open(box, nonce, key)
    if (!decrypted) return null
    return encodeUTF8(decrypted)
  } catch {
    return null
  }
}

// --- Passphrase-protected identity file ---

export interface LockedIdentity {
  version: 1
  // scrypt params
  salt: string   // base64, 32 bytes
  N: number
  r: number
  p: number
  // nacl.secretbox of JSON(Identity)
  payload: string // base64: nonce(24) || ciphertext
}

function scryptAsync(passphrase: string, salt: Buffer, N: number, r: number, p: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, { N, r, p }, (err, buf) => {
      if (err) reject(err)
      else resolve(Uint8Array.from(buf))
    })
  })
}

export async function lockIdentity(identityJson: string, passphrase: string): Promise<LockedIdentity> {
  const saltBytes = randomBytes(32)
  const salt = encodeBase64(Uint8Array.from(saltBytes))
  const key = await scryptAsync(passphrase, saltBytes, 1 << 14, 8, 4)
  const payload = encryptData(identityJson, key)
  return { version: 1, salt, N: 1 << 14, r: 8, p: 4, payload }
}

export async function unlockIdentity(locked: LockedIdentity, passphrase: string): Promise<string | null> {
  const salt = Buffer.from(locked.salt, 'base64')
  const key = await scryptAsync(passphrase, salt, locked.N, locked.r, locked.p)
  return decryptData(locked.payload, key)
}

export function generateKeyPair(): KeyPair {
  const kp = nacl.box.keyPair()
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey)
  }
}

export function encryptMessage(
  plaintext: string,
  theirPublicKeyB64: string,
  mySecretKeyB64: string
): { nonce: string; data: string } {
  const theirPubKey = decodeBase64(theirPublicKeyB64)
  const mySecKey = decodeBase64(mySecretKeyB64)
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  // decodeUTF8 converts a UTF-8 string to Uint8Array
  const messageBytes = decodeUTF8(plaintext)
  const encrypted = nacl.box(messageBytes, nonce, theirPubKey, mySecKey)
  return {
    nonce: encodeBase64(nonce),
    data: encodeBase64(encrypted)
  }
}

export function decryptMessage(
  nonceB64: string,
  dataB64: string,
  theirPublicKeyB64: string,
  mySecretKeyB64: string
): string | null {
  try {
    const theirPubKey = decodeBase64(theirPublicKeyB64)
    const mySecKey = decodeBase64(mySecretKeyB64)
    const nonce = decodeBase64(nonceB64)
    const data = decodeBase64(dataB64)
    const decrypted = nacl.box.open(data, nonce, theirPubKey, mySecKey)
    if (!decrypted) return null
    // encodeUTF8 converts a Uint8Array to a UTF-8 string
    return encodeUTF8(decrypted)
  } catch {
    return null
  }
}

export function buildInviteCode(onionAddress: string, port: number, publicKeyB64: string): string {
  const raw = `${onionAddress}|${port}|${publicKeyB64}`
  return Buffer.from(raw).toString('base64')
}

export function parseInviteCode(
  code: string
): { onionAddress: string; port: number; publicKey: string } | null {
  try {
    const raw = Buffer.from(code.trim(), 'base64').toString('utf8')
    const parts = raw.split('|')
    if (parts.length < 3) return null
    const [onionAddress, portStr, ...pubkeyParts] = parts
    const publicKey = pubkeyParts.join('|')
    const port = parseInt(portStr, 10)
    if (!onionAddress || isNaN(port) || !publicKey) return null
    return { onionAddress, port, publicKey }
  } catch {
    return null
  }
}

// --- Recovery phrase (BIP39 mnemonic) ---
// The mnemonic seeds a 32-byte key that independently encrypts the identity,
// giving a second way to decrypt it without knowing the passphrase.

export interface RecoveryLockedIdentity {
  version: 1
  // BIP39 seed → scrypt → key (salt fixed/derivable from mnemonic itself)
  payload: string // base64: nonce(24) || ciphertext
}

function deriveKeyFromMnemonic(mnemonic: string): Uint8Array {
  // BIP39 seed is 64 bytes; take first 32 as the key directly
  const seed = mnemonicToSeedSync(mnemonic)
  return Uint8Array.from(seed.slice(0, 32))
}

export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128) // 12 words
}

export function validateRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(phrase.trim().toLowerCase(), wordlist)
}

export function encryptIdentityWithPhrase(identityJson: string, mnemonic: string): RecoveryLockedIdentity {
  const key = deriveKeyFromMnemonic(mnemonic)
  const payload = encryptData(identityJson, key)
  return { version: 1, payload }
}

export function decryptIdentityWithPhrase(locked: RecoveryLockedIdentity, mnemonic: string): string | null {
  const key = deriveKeyFromMnemonic(mnemonic.trim().toLowerCase())
  return decryptData(locked.payload, key)
}

// --- Group message encryption (nacl.secretbox with a per-group symmetric key) ---

export function generateGroupKey(): string {
  return encodeBase64(nacl.randomBytes(nacl.secretbox.keyLength))
}

export function encryptGroupPayload(plaintext: string, groupKeyB64: string): string {
  const key = decodeBase64(groupKeyB64)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const box = nacl.secretbox(decodeUTF8(plaintext), nonce, key)
  const out = new Uint8Array(nonce.length + box.length)
  out.set(nonce)
  out.set(box, nonce.length)
  return encodeBase64(out)
}

export function decryptGroupPayload(ciphertextB64: string, groupKeyB64: string): string | null {
  try {
    const key = decodeBase64(groupKeyB64)
    const data = decodeBase64(ciphertextB64)
    const nonce = data.slice(0, nacl.secretbox.nonceLength)
    const box = data.slice(nacl.secretbox.nonceLength)
    const plain = nacl.secretbox.open(box, nonce, key)
    if (!plain) return null
    return encodeUTF8(plain)
  } catch {
    return null
  }
}

export { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 }
