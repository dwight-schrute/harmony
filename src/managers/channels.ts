import { Client } from '../client/mod.ts'
import { Channel } from '../structures/channel.ts'
import { Embed } from '../structures/embed.ts'
import { Message } from '../structures/message.ts'
import type { TextChannel } from '../structures/textChannel.ts'
import type { User } from '../structures/user.ts'
import type {
  ChannelPayload,
  GuildChannelPayload,
  MessageOptions
} from '../types/channel.ts'
import { CHANNEL } from '../types/endpoint.ts'
import getChannelByType from '../utils/channel.ts'
import { BaseManager } from './base.ts'

export type AllMessageOptions = MessageOptions | Embed

export class ChannelsManager extends BaseManager<ChannelPayload, Channel> {
  constructor(client: Client) {
    super(client, 'channels', Channel)
  }

  async getUserDM(user: User | string): Promise<string | undefined> {
    return this.client.cache.get(
      'user_dms',
      typeof user === 'string' ? user : user.id
    )
  }

  async setUserDM(user: User | string, id: string): Promise<void> {
    await this.client.cache.set(
      'user_dms',
      typeof user === 'string' ? user : user.id,
      id
    )
  }

  // Override get method as Generic
  async get<T = Channel>(key: string): Promise<T | undefined> {
    const data = await this._get(key)
    if (data === undefined) return
    let guild
    if ('guild_id' in data) {
      guild = await this.client.guilds.get(
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        (data as GuildChannelPayload).guild_id
      )
    }
    const res = getChannelByType(this.client, data, guild)
    return res as any
  }

  async array(): Promise<Channel[]> {
    const arr = await (this.client.cache.array(
      this.cacheName
    ) as ChannelPayload[])
    if (arr === undefined) return []
    const result: any[] = []
    for (const elem of arr) {
      let guild
      if ('guild_id' in elem) {
        guild = await this.client.guilds.get(
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          (elem as GuildChannelPayload).guild_id
        )
      }
      result.push(getChannelByType(this.client, elem, guild))
    }
    return result
  }

  /** Fetches a Channel by ID, cache it, resolve it */
  async fetch<T = Channel>(id: string): Promise<T> {
    return await new Promise((resolve, reject) => {
      this.client.rest
        .get(CHANNEL(id))
        .then(async (data) => {
          this.set(id, data as ChannelPayload)
          let guild
          if (data.guild_id !== undefined) {
            guild = await this.client.guilds.get(data.guild_id)
          }
          resolve(
            (getChannelByType(
              this.client,
              data as ChannelPayload,
              guild
            ) as unknown) as T
          )
        })
        .catch((e) => reject(e))
    })
  }

  async sendMessage(
    channel: string | TextChannel,
    content?: string | AllMessageOptions,
    option?: AllMessageOptions
  ): Promise<Message> {
    const channelID = typeof channel === 'string' ? channel : channel.id

    if (typeof content === 'object') {
      option = content
      content = undefined
    }
    if (content === undefined && option === undefined) {
      throw new Error('Either text or option is necessary.')
    }
    if (option instanceof Embed) {
      option = {
        embed: option
      }
    }

    const payload: any = {
      content: content ?? option?.content,
      embed: option?.embed,
      file: option?.file,
      files: option?.files,
      tts: option?.tts,
      allowed_mentions: option?.allowedMentions,
      message_reference:
        option?.reply === undefined
          ? undefined
          : typeof option.reply === 'string'
          ? {
              message_id: option.reply
            }
          : typeof option.reply === 'object'
          ? option.reply instanceof Message
            ? {
                message_id: option.reply.id,
                channel_id: option.reply.channel.id,
                guild_id: option.reply.guild?.id
              }
            : option.reply
          : undefined
    }

    if (payload.content === undefined && payload.embed === undefined) {
      payload.content = ''
    }

    const resp = await this.client.rest.api.channels[channelID].messages.post(
      payload
    )
    const chan =
      typeof channel === 'string'
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (await this.get<TextChannel>(channel))!
        : channel
    const res = new Message(this.client, resp, chan, this.client.user as any)
    await res.mentions.fromPayload(resp)
    return res
  }

  async editMessage(
    channel: string | TextChannel,
    message: Message | string,
    text?: string | MessageOptions,
    option?: MessageOptions
  ): Promise<Message> {
    const channelID = typeof channel === 'string' ? channel : channel.id

    if (text === undefined && option === undefined) {
      throw new Error('Either text or option is necessary.')
    }

    if (this.client.user === undefined) {
      throw new Error('Client user has not initialized.')
    }

    if (typeof text === 'object') {
      if (typeof option === 'object') Object.assign(option, text)
      else option = text
      text = undefined
    }

    const newMsg = await this.client.rest.api.channels[channelID].messages[
      typeof message === 'string' ? message : message.id
    ].patch({
      content: text ?? option?.content,
      embed: option?.embed !== undefined ? option.embed.toJSON() : undefined,
      // Cannot upload new files with Message
      // file: option?.file,
      tts: option?.tts,
      allowed_mentions: option?.allowedMentions
    })

    const chan =
      typeof channel === 'string'
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (await this.get<TextChannel>(channel))!
        : channel
    const res = new Message(this.client, newMsg, chan, this.client.user)
    await res.mentions.fromPayload(newMsg)
    return res
  }
}
