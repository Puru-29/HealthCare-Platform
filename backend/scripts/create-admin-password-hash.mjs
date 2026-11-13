import { randomBytes, scrypt as scryptCallback } from 'node:crypto'

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  console.error('Run this command in an interactive terminal so the password is not echoed.')
  process.exit(1)
}

const password = await new Promise((resolve, reject) => {
  let value = ''
  const input = process.stdin
  const finish = (error) => {
    input.setRawMode(false)
    input.pause()
    input.removeListener('data', onData)
    process.stdout.write('\n')
    if (error) reject(error)
    else resolve(value)
  }
  const onData = (chunk) => {
    for (const character of chunk.toString('utf8')) {
      if (character === '\u0003') return finish(new Error('Cancelled.'))
      if (character === '\r' || character === '\n') return finish()
      if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1)
        process.stdout.write('\b \b')
      } else if (character >= ' ') {
        value += character
        process.stdout.write('*')
      }
    }
  }

  process.stdout.write('Administrator password (masked): ')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', onData)
})

if (typeof password !== 'string' || password.length < 14 || password.length > 200) {
  console.error('Use an administrator password between 14 and 200 characters.')
  process.exit(1)
}

const salt = randomBytes(16)
scryptCallback(password, salt, 64, {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}, (error, derived) => {
  if (error) {
    console.error('Could not generate the administrator password hash.')
    process.exitCode = 1
    return
  }
  process.stdout.write(`ADMIN_PASSWORD_HASH=scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}\n`)
})
