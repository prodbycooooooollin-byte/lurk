/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client-ID der Lurk-App auf dev.twitch.tv (öffentlich, kein Geheimnis). Kommt aus .env bzw. dem Release-Build. */
  readonly VITE_TWITCH_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
