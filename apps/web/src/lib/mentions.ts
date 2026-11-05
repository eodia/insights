/** A mention in a text: `@[Marie](her-id)` — as the server reads it to tell her. */
export const MENTION = /@\[([^\]\n]{1,120})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i

/** A text as one reads it, where it is drawn rather than written (a chart's marker): « @Marie ». */
export const readableMentions = (text: string) => text.replace(new RegExp(MENTION.source, 'gi'), (_m, name: string) => `@${name}`)
