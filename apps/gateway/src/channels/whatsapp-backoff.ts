/**
 * whatsapp-backoff.ts — [F3a-23]
 *
 * Motor de backoff exponencial con jitter para reconexión de Baileys.
 * Extraído del adapter para ser testeable de forma aislada.
 *
 * Algoritmo: exponential backoff con full jitter
 *   delay = random(0, min(cap, base * 2^attempt))
 */

export interface BackoffOptions {
  baseMs?: number
  capMs?: number
  maxRetries?: number
  factor?: number
}

export class ExponentialBackoff {
  private attempt = 0
  private aborted = false
  private timer: ReturnType<typeof setTimeout> | null = null

  readonly baseMs: number
  readonly capMs: number
  readonly maxRetries: number
  readonly factor: number

  constructor(opts: BackoffOptions = {}) {
    this.baseMs = opts.baseMs ?? 3_000
    this.capMs = opts.capMs ?? 60_000
    this.maxRetries = opts.maxRetries ?? 8
    this.factor = opts.factor ?? 2
  }

  get currentAttempt(): number {
    return this.attempt
  }

  get exhausted(): boolean {
    return this.attempt >= this.maxRetries
  }

  get isAborted(): boolean {
    return this.aborted
  }

  peekDelay(): number {
    const exp = Math.min(this.capMs, this.baseMs * Math.pow(this.factor, this.attempt))
    return Math.floor(Math.random() * exp)
  }

  next(): Promise<void> {
    if (this.aborted) throw new Error('backoff_aborted')
    if (this.exhausted) throw new Error('backoff_exhausted')

    const delay = this.peekDelay()
    this.attempt++

    return new Promise<void>((resolve, reject) => {
      this.timer = setTimeout(() => {
        this.timer = null
        if (this.aborted) reject(new Error('backoff_aborted'))
        else resolve()
      }, delay)
    })
  }

  abort(): void {
    this.aborted = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  reset(): void {
    this.attempt = 0
    this.aborted = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  toString(): string {
    return `BackoffState{attempt=${this.attempt}/${this.maxRetries}, nextDelay≈${this.peekDelay()}ms, exhausted=${this.exhausted}}`
  }
}
