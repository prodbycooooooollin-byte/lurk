import { memo } from 'react'
import { useUserMeta } from '@/lib/avatars'
import { cn, readableColor } from '@/lib/util'

/** Echtes Twitch-Profilbild (lädt gesammelt nach), bis dahin ein farbiger Anfangsbuchstabe */
export const UserAvatar = memo(function UserAvatar({
  login,
  name,
  color,
  size = 26,
  dark = true,
  className
}: {
  login: string
  name?: string
  color?: string
  size?: number
  dark?: boolean
  className?: string
}) {
  const meta = useUserMeta(login)
  const c = readableColor(color, login, dark)
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      {(name ?? login).slice(0, 1).toUpperCase()}
      {meta?.logo && <img src={meta.logo.replace('300x300', '70x70')} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  )
})
