/**
 * Official CnCNet Red Alert 1 Game Options based directly on:
 * https://github.com/CnCNet/cncnet-ra-client-package (Resources/GameLobbyBase.ini & MultiplayerGameLobby.ini)
 * and https://github.com/CnCNet/xna-cncnet-client (GameLobbyBase.cs & CnCNetGameLobby.cs)
 */

export interface Ra1GameOptions {
  // Dropdown Settings from GameLobbyBase.ini & MultiplayerGameLobby.ini
  gameType: 'Standard' | 'Aftermath';
  techLevel: number;
  credits: number;
  unitCount: number;
  gameSpeed: string;

  // 16 Checkboxes in exact bit-packing order (indices 0 to 15)
  bases: boolean;                     // 0: chkBases (default: true)
  oreRegenerates: boolean;            // 1: chkOreRegenerates (default: false)
  crates: boolean;                    // 2: chkCrates (default: false)
  captureTheFlag: boolean;            // 3: chkCaptureTheFlag (default: false)
  shroudRegrows: boolean;             // 4: chkShroudRegrows (default: false)
  slowUnitBuild: boolean;             // 5: chkSlowUnitBuild (default: false)
  aftermath: boolean;                 // 6: chkAftermath (default: false)
  aftermathFastBuildSpeed: boolean;   // 7: chkAftermathFastBuildSpeed (default: false)
  noTeslaZapEffectDelay: boolean;     // 8: chkNoTeslaZapEffectDelay - Fix Known Bugs (always true)
  mcvUndeploy: boolean;               // 9: chkMCVUndeploy - Re-Deployable MCV (default: false)
  fixAiAlly: boolean;                 // 10: chkFixAIAlly - Allow AI Alliances (default: false)
  allyReveal: boolean;                // 11: chkAllyReveal - Ally Shroud Reveal (default: true)
  buildOffAlly: boolean;              // 12: chkBuildOffAlly - Build Off Ally (default: false)
  parabombsInMultiplayer: boolean;    // 13: chkParabombsInMultiplayer - Enable Parabombs (default: false)
  shortGame: boolean;                 // 14: chkShortGame - Short Game (default: false)
  forcedAlliances: boolean;           // 15: chkForcedAlliances - Forced Alliances (default: false)
}

export const RA1_DROPDOWNS = {
  gameType: {
    label: 'Game Type',
    spawnIniOption: 'Standard',
    options: ['Standard', 'Aftermath'] as const,
    defaultIndex: 0,
  },
  techLevel: {
    label: 'Tech Level',
    spawnIniOption: 'TechLevel',
    options: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const,
    defaultIndex: 0,
  },
  credits: {
    label: 'Starting Credits',
    spawnIniOption: 'Credits',
    options: [20000, 15000, 12500, 10000, 7500, 5000, 2500] as const,
    defaultIndex: 3, // 10000
  },
  unitCount: {
    label: 'Unit Count',
    spawnIniOption: 'UnitCount',
    options: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const,
    defaultIndex: 10, // 0
  },
  gameSpeed: {
    label: 'Game Speed',
    spawnIniOption: 'GameSpeed',
    // MultiplayerGameLobby.ini overrides cmbGameSpeedCap
    options: ['Maximum', '60 FPS', '30 FPS', '20 FPS', '15 FPS', '12 FPS', '10 FPS'] as const,
    defaultIndex: 0, // Maximum
  },
};

export interface Ra1CheckboxDefinition {
  key: keyof Omit<Ra1GameOptions, 'gameType' | 'techLevel' | 'credits' | 'unitCount' | 'gameSpeed'>;
  index: number;
  iniSection: string;
  label: string;
  tooltip: string;
  defaultValue: boolean;
  spawnIniOption: string;
  enabledValue: string;
  disabledValue: string;
  locked?: boolean;
  category: 'rules' | 'shroud' | 'tactics' | 'expansion';
}

export const RA1_CHECKBOX_DEFINITIONS: Ra1CheckboxDefinition[] = [
  {
    key: 'bases',
    index: 0,
    iniSection: 'chkBases',
    label: 'Bases',
    tooltip: 'Players start with Mobile Construction Vehicles (MCVs).',
    defaultValue: true,
    spawnIniOption: 'Bases',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'rules',
  },
  {
    key: 'oreRegenerates',
    index: 1,
    iniSection: 'chkOreRegenerates',
    label: 'Ore Regenerates',
    tooltip: 'Ore regenerates over time (infinite ore supply).',
    defaultValue: false,
    spawnIniOption: 'OreRegenerates',
    enabledValue: '1',
    disabledValue: '0',
    category: 'rules',
  },
  {
    key: 'crates',
    index: 2,
    iniSection: 'chkCrates',
    label: 'Crates',
    tooltip: 'Collectable crates spawn randomly on the map granting credits, units, firestorms, or booby traps.',
    defaultValue: false,
    spawnIniOption: 'Crates',
    enabledValue: '1',
    disabledValue: '0',
    category: 'rules',
  },
  {
    key: 'captureTheFlag',
    index: 3,
    iniSection: 'chkCaptureTheFlag',
    label: 'Capture The Flag',
    tooltip: 'Capture the flag using any combat unit to claim victory.',
    defaultValue: false,
    spawnIniOption: 'CaptureTheFlag',
    enabledValue: '1',
    disabledValue: '0',
    category: 'rules',
  },
  {
    key: 'shroudRegrows',
    index: 4,
    iniSection: 'chkShroudRegrows',
    label: 'Shroud Regrows',
    tooltip: 'Fog of war and shroud regrows over explored map areas.',
    defaultValue: false,
    spawnIniOption: 'ShroudRegrows',
    enabledValue: '1',
    disabledValue: '0',
    category: 'shroud',
  },
  {
    key: 'slowUnitBuild',
    index: 5,
    iniSection: 'chkSlowUnitBuild',
    label: 'Slow Unit Build',
    tooltip: 'Increases build time of vehicles to discourage early tank rushes.',
    defaultValue: false,
    spawnIniOption: 'SlowUnitBuild',
    enabledValue: '1',
    disabledValue: '0',
    category: 'rules',
  },
  {
    key: 'aftermath',
    index: 6,
    iniSection: 'chkAftermath',
    label: 'Aftermath Game',
    tooltip: 'Capturing enemy structures requires three Engineers instead of one.',
    defaultValue: false,
    spawnIniOption: 'Aftermath',
    enabledValue: '1',
    disabledValue: '0',
    category: 'expansion',
  },
  {
    key: 'aftermathFastBuildSpeed',
    index: 7,
    iniSection: 'chkAftermathFastBuildSpeed',
    label: 'Aftermath Fast Build',
    tooltip: 'Removes the build speed cap when buying multiple production structures of the same type.',
    defaultValue: false,
    spawnIniOption: 'AftermathFastBuildSpeed',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'expansion',
  },
  {
    key: 'noTeslaZapEffectDelay',
    index: 8,
    iniSection: 'chkNoTeslaZapEffectDelay',
    label: 'Fix Known Bugs',
    tooltip: 'Applies modern engine bug fixes and patches (always enabled in CnCNet).',
    defaultValue: true,
    spawnIniOption: 'NoTeslaZapEffectDelay',
    enabledValue: 'Yes',
    disabledValue: 'No',
    locked: true,
    category: 'expansion',
  },
  {
    key: 'mcvUndeploy',
    index: 9,
    iniSection: 'chkMCVUndeploy',
    label: 'Re-Deployable MCV',
    tooltip: 'Construction Yards can repack back into a Mobile Construction Vehicle.',
    defaultValue: false,
    spawnIniOption: 'MCVUndeploy',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'tactics',
  },
  {
    key: 'fixAiAlly',
    index: 10,
    iniSection: 'chkFixAIAlly',
    label: 'Allow AI Alliances',
    tooltip: 'Allows forming alliances with AI bot players during combat.',
    defaultValue: false,
    spawnIniOption: 'FixAIAlly',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'tactics',
  },
  {
    key: 'allyReveal',
    index: 11,
    iniSection: 'chkAllyReveal',
    label: 'Ally Shroud Reveal',
    tooltip: 'Reveals shroud and map visibility for allied commanders.',
    defaultValue: true,
    spawnIniOption: 'AllyReveal',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'shroud',
  },
  {
    key: 'buildOffAlly',
    index: 12,
    iniSection: 'chkBuildOffAlly',
    label: 'Build Off Ally',
    tooltip: 'Allows building structures adjacent to teammates’ bases.',
    defaultValue: false,
    spawnIniOption: 'BuildOffAlly',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'tactics',
  },
  {
    key: 'parabombsInMultiplayer',
    index: 13,
    iniSection: 'chkParabombsInMultiplayer',
    label: 'Enable Parabombs',
    tooltip: 'Enables Soviet airborne parabombs upon constructing an Airfield.',
    defaultValue: false,
    spawnIniOption: 'ParabombsInMultiplayer',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'tactics',
  },
  {
    key: 'shortGame',
    index: 14,
    iniSection: 'chkShortGame',
    label: 'Short Game',
    tooltip: 'Losing all structures causes remaining units to self-destruct for instant match victory.',
    defaultValue: false,
    spawnIniOption: 'ShortGame',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'rules',
  },
  {
    key: 'forcedAlliances',
    index: 15,
    iniSection: 'chkForcedAlliances',
    label: 'Forced Alliances',
    tooltip: 'Locks team alignments; when disabled, players can form and break alliances with "A".',
    defaultValue: false,
    spawnIniOption: 'ForcedAlliances',
    enabledValue: 'Yes',
    disabledValue: 'No',
    category: 'tactics',
  },
];

export const DEFAULT_RA1_OPTIONS: Ra1GameOptions = {
  gameType: 'Standard',
  techLevel: 10,
  credits: 10000,
  unitCount: 0,
  gameSpeed: '60 FPS',

  bases: true,
  oreRegenerates: false,
  crates: false,
  captureTheFlag: false,
  shroudRegrows: false,
  slowUnitBuild: false,
  aftermath: false,
  aftermathFastBuildSpeed: false,
  noTeslaZapEffectDelay: true,
  mcvUndeploy: false,
  fixAiAlly: false,
  allyReveal: true,
  buildOffAlly: false,
  parabombsInMultiplayer: false,
  shortGame: false,
  forcedAlliances: false,
};

/**
 * Packs the 16 checkboxes and 5 dropdowns into the standard CnCNet game option string
 * Format: `<packedCheckboxesInt>,<gameTypeIdx>,<techLevelIdx>,<creditsIdx>,<unitCountIdx>,<gameSpeedIdx>`
 * Example default: `2305,0,0,3,10,0`
 */
export function packRa1GameOptions(options?: Partial<Ra1GameOptions>): string {
  const opt: Ra1GameOptions = { ...DEFAULT_RA1_OPTIONS, ...options, noTeslaZapEffectDelay: true };

  const boolArray: boolean[] = [
    Boolean(opt.bases),
    Boolean(opt.oreRegenerates),
    Boolean(opt.crates),
    Boolean(opt.captureTheFlag),
    Boolean(opt.shroudRegrows),
    Boolean(opt.slowUnitBuild),
    Boolean(opt.aftermath),
    Boolean(opt.aftermathFastBuildSpeed),
    true, // bit 8: fix known bugs (always true)
    Boolean(opt.mcvUndeploy),
    Boolean(opt.fixAiAlly),
    Boolean(opt.allyReveal),
    Boolean(opt.buildOffAlly),
    Boolean(opt.parabombsInMultiplayer),
    Boolean(opt.shortGame),
    Boolean(opt.forcedAlliances),
  ];

  let packedCheckboxes = 0;
  for (let i = 0; i < boolArray.length; i++) {
    if (boolArray[i]) {
      packedCheckboxes |= 1 << i;
    }
  }

  const gameTypeIdx = RA1_DROPDOWNS.gameType.options.indexOf(opt.gameType as any);
  const techLevelIdx = RA1_DROPDOWNS.techLevel.options.indexOf(opt.techLevel as any);
  const creditsIdx = RA1_DROPDOWNS.credits.options.indexOf(opt.credits as any);
  const unitCountIdx = RA1_DROPDOWNS.unitCount.options.indexOf(opt.unitCount as any);
  const gameSpeedIdx = RA1_DROPDOWNS.gameSpeed.options.indexOf(opt.gameSpeed as any);

  const values = [
    packedCheckboxes,
    gameTypeIdx !== -1 ? gameTypeIdx : RA1_DROPDOWNS.gameType.defaultIndex,
    techLevelIdx !== -1 ? techLevelIdx : RA1_DROPDOWNS.techLevel.defaultIndex,
    creditsIdx !== -1 ? creditsIdx : RA1_DROPDOWNS.credits.defaultIndex,
    unitCountIdx !== -1 ? unitCountIdx : RA1_DROPDOWNS.unitCount.defaultIndex,
    gameSpeedIdx !== -1 ? gameSpeedIdx : RA1_DROPDOWNS.gameSpeed.defaultIndex,
  ];

  return values.join(',');
}

/**
 * Unpacks a comma- or semicolon-separated string from a CnCNet client announcement or GO notice.
 */
export function unpackRa1GameOptions(packedString?: string): Ra1GameOptions {
  if (!packedString) return { ...DEFAULT_RA1_OPTIONS };

  const normalized = packedString.replace(/;/g, ',');
  const parts = normalized.split(',').map((p) => parseInt(p.trim(), 10));

  const packedInt = !isNaN(parts[0]) ? parts[0] : 2305;
  const gameTypeIdx = parts.length > 1 && !isNaN(parts[1]) ? parts[1] : 0;
  const techLevelIdx = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 0;
  const creditsIdx = parts.length > 3 && !isNaN(parts[3]) ? parts[3] : 3;
  const unitCountIdx = parts.length > 4 && !isNaN(parts[4]) ? parts[4] : 10;
  const gameSpeedIdx = parts.length > 5 && !isNaN(parts[5]) ? parts[5] : 0;

  return {
    gameType: (RA1_DROPDOWNS.gameType.options[gameTypeIdx] as any) || 'Standard',
    techLevel: RA1_DROPDOWNS.techLevel.options[techLevelIdx] ?? 10,
    credits: RA1_DROPDOWNS.credits.options[creditsIdx] ?? 10000,
    unitCount: RA1_DROPDOWNS.unitCount.options[unitCountIdx] ?? 0,
    gameSpeed: RA1_DROPDOWNS.gameSpeed.options[gameSpeedIdx] || '60 FPS',

    bases: (packedInt & (1 << 0)) !== 0,
    oreRegenerates: (packedInt & (1 << 1)) !== 0,
    crates: (packedInt & (1 << 2)) !== 0,
    captureTheFlag: (packedInt & (1 << 3)) !== 0,
    shroudRegrows: (packedInt & (1 << 4)) !== 0,
    slowUnitBuild: (packedInt & (1 << 5)) !== 0,
    aftermath: (packedInt & (1 << 6)) !== 0,
    aftermathFastBuildSpeed: (packedInt & (1 << 7)) !== 0,
    noTeslaZapEffectDelay: true,
    mcvUndeploy: (packedInt & (1 << 9)) !== 0,
    fixAiAlly: (packedInt & (1 << 10)) !== 0,
    allyReveal: (packedInt & (1 << 11)) !== 0,
    buildOffAlly: (packedInt & (1 << 12)) !== 0,
    parabombsInMultiplayer: (packedInt & (1 << 13)) !== 0,
    shortGame: (packedInt & (1 << 14)) !== 0,
    forcedAlliances: (packedInt & (1 << 15)) !== 0,
  };
}

/**
 * Generates spawn.ini [Settings] key-value pairs according to GameLobbyBase.ini definitions.
 */
export function generateSpawnIniSettings(options: Ra1GameOptions): Record<string, string> {
  const result: Record<string, string> = {
    Standard: options.gameType === 'Standard' ? 'True' : 'False',
    TechLevel: String(options.techLevel),
    Credits: String(options.credits),
    UnitCount: String(options.unitCount),
    GameSpeed: String(RA1_DROPDOWNS.gameSpeed.options.indexOf(options.gameSpeed as any)),
    NoTeslaZapEffectDelay: 'Yes',
  };

  for (const def of RA1_CHECKBOX_DEFINITIONS) {
    if (def.key === 'noTeslaZapEffectDelay') continue;
    const isChecked = options[def.key];
    result[def.spawnIniOption] = isChecked ? def.enabledValue : def.disabledValue;
  }

  return result;
}

export const RA1_OPTION_PRESETS = [
  {
    id: 'standard_comp',
    name: 'Standard Competitive (Default)',
    desc: '$10k, 60 FPS, Bases, Ally Reveal, No Crates',
    options: { ...DEFAULT_RA1_OPTIONS },
  },
  {
    id: 'fast_ore_crates',
    name: 'Infinite Ore & Crates Fun',
    desc: '$20k, Ore Regens, Crates, Re-Deployable MCV, Parabombs',
    options: {
      ...DEFAULT_RA1_OPTIONS,
      credits: 20000,
      oreRegenerates: true,
      crates: true,
      mcvUndeploy: true,
      parabombsInMultiplayer: true,
    },
  },
  {
    id: 'short_game_fast',
    name: 'Fast Short Game 1v1',
    desc: 'Short Game on, 60 FPS, Bases, Crates',
    options: {
      ...DEFAULT_RA1_OPTIONS,
      credits: 10000,
      shortGame: true,
      crates: true,
      gameSpeed: '60 FPS',
    },
  },
  {
    id: 'aftermath_war',
    name: 'Aftermath Expansion War',
    desc: 'Aftermath Game, Fast Build, Tech 10, $15k',
    options: {
      ...DEFAULT_RA1_OPTIONS,
      gameType: 'Aftermath' as const,
      credits: 15000,
      aftermath: true,
      aftermathFastBuildSpeed: true,
      buildOffAlly: true,
    },
  },
  {
    id: 'no_bases_meatgrinder',
    name: 'No Bases Meat Grinder',
    desc: 'Bases: OFF, Starting Units: 10, Crates: ON',
    options: {
      ...DEFAULT_RA1_OPTIONS,
      bases: false,
      unitCount: 10,
      crates: true,
      credits: 5000,
    },
  },
];

