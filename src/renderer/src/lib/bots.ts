// Bekannte Bots: Chat-Bots der Streamer und Zuschauerlisten-Crawler, die in fast jedem
// großen Kanal "zuschauen" und die Lurker-Zahlen verfälschen.
const KNOWN = [
  // Chat-Bots
  'nightbot', 'streamelements', 'moobot', 'fossabot', 'wizebot', 'streamlabs', 'soundalerts', 'sery_bot',
  'botrixoficial', 'kofistreambot', 'pokemoncommunitygame', 'own3d', 'blerp', 'deepbot', 'coebot', 'ankhbot',
  'phantombot', 'vivbot', 'botisimo', 'creatisbot', 'tangiabot', 'streamholics', 'restreambot', 'frostytoolsdotcom',
  'songlistbot', 'buttsbot', 'supibot', 'pajbot', 'thepositivebot', 'sumbot', 'scorpbot', 'mikuia', 'streamjar',
  'stay_hydrated_bot', 'wzbot', 'lolrankbot', 'commanderroot', 'streamstickers', 'quacky_bot',
  // Zuschauerlisten-Crawler
  'anotherttvviewer', 'lurxx', 'aliengathering', 'drapsnatt', 'feet', 'smallstreamersdccommunity', 'd0nk7', 'electricallongboard',
  'v_and_k', 'virgoproz', 'icewizerds', 'rogueg1rl', 'sophiafox21', 'thelurkertv', 'jointeffortt', 'soundcloudbot', 'twitchprimereminder',
  'streamfahrer', 'kattah', '0ax2', 'communityshowcase', 'discordstreamercommunity', 'host_giveaway', 'nuclearpasta_', 'lylitalics',
  'ftopayrespects', 'mslenity', 'markzynk', 'nkbslurk', 'own3dlurk', 'zkeey', 'arctlco', 'commanderroot_', 'droopdoggg', 'ssakdook'
]
const SET = new Set(KNOWN)

/** Bekannter Bot oder Name endet auf "bot" / "_bot" (z. B. "kanalname_bot") */
export function isBot(login: string): boolean {
  return SET.has(login) || /_?bot\d{0,2}$/.test(login)
}
