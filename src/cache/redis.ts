import { ICacheAdapter } from './adapter.ts'
// Not in deps.ts to allow optional dep loading
import {
  connect,
  Redis,
  RedisConnectOptions
} from 'https://deno.land/x/redis@v0.22.0/mod.ts'

/** Redis Cache Adapter for using Redis as a cache-provider. */
export class RedisCacheAdapter implements ICacheAdapter {
  _redis: Promise<Redis>
  redis?: Redis
  ready: boolean = false
  readonly _expireIntervalTimer: number = 5000
  private _expireInterval?: number

  constructor(options: RedisConnectOptions) {
    this._redis = connect(options)
    this._redis.then(
      (redis) => {
        this.redis = redis
        this.ready = true
        this._startExpireInterval()
      },
      () => {
        // TODO: Make error for this
      }
    )
  }

  private _startExpireInterval(): void {
    this._expireInterval = setInterval(() => {
      this.redis?.scan(0, { pattern: '*:expires' }).then(([_, names]) => {
        for (const name of names) {
          this.redis?.hvals(name).then((vals) => {
            for (const val of vals) {
              const expireVal: {
                name: string
                key: string
                at: number
              } = JSON.parse(val)
              const expired = new Date().getTime() > expireVal.at
              if (expired) this.redis?.hdel(expireVal.name, expireVal.key)
            }
          })
        }
      })
    }, this._expireIntervalTimer)
  }

  async _checkReady(): Promise<void> {
    if (!this.ready) await this._redis
  }

  async get(cacheName: string, key: string): Promise<string | undefined> {
    await this._checkReady()
    const cache = await this.redis?.hget(cacheName, key)
    if (cache === undefined) return
    try {
      return JSON.parse(cache)
    } catch (e) {
      return cache
    }
  }

  async set(
    cacheName: string,
    key: string,
    value: any,
    expire?: number
  ): Promise<number | undefined> {
    await this._checkReady()
    const result = await this.redis?.hset(
      cacheName,
      key,
      typeof value === 'object' ? JSON.stringify(value) : value
    )
    if (expire !== undefined) {
      await this.redis?.hset(
        `${cacheName}:expires`,
        key,
        JSON.stringify({
          name: cacheName,
          key,
          at: new Date().getTime() + expire
        })
      )
    }
    return result
  }

  async delete(cacheName: string, key: string): Promise<boolean> {
    await this._checkReady()
    const exists = await this.redis?.hexists(cacheName, key)
    if (exists === 0) return false
    await this.redis?.hdel(cacheName, key)
    return true
  }

  async array(cacheName: string): Promise<any[] | undefined> {
    await this._checkReady()
    const data = await this.redis?.hvals(cacheName)
    return data?.map((e: string) => JSON.parse(e))
  }

  async deleteCache(cacheName: string): Promise<boolean> {
    await this._checkReady()
    return (await this.redis?.del(cacheName)) !== 0
  }
}
